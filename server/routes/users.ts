// Admin user management + own profile + avatar upload — ported from WMS userController.js / upload.js.
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config, SERVER_DIR } from '../config';
import { logAudit } from '../db';
import { msg, reqLang } from '../lang';
import { authorizeRoles, verifyAuth } from '../middleware/auth';
import {
  countActiveAdmins, deleteUserRecord, getSessionId, getUserByEmail, getUserById, getUserByUsername, getUsers, toPublicUser, updateUser,
} from '../users';
import { sendEmail } from '../email/send';
import { accountStatusEmail } from '../email/templates';
import { isValidEmail, validatePassword, validateUsername } from '../../shared/credentialPolicy';
import { disconnectUser } from '../events';
import { notifyAdmins } from './auth';
import * as store from '../workspace/store';
import type { UserRole, UserStatus } from '../../shared/types';

export const UPLOADS_DIR = path.join(SERVER_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();
const adminOnly = [verifyAuth, authorizeRoles('Admin')];

router.get('/users', ...adminOnly, (_req: Request, res: Response) => {
  res.json({ success: true, users: getUsers().map(toPublicUser) });
});

// Admin approves / denies / suspends / restores.
router.put('/users/:id/status', ...adminOnly, async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const status = req.body?.status as UserStatus;
  if (!['Pending', 'Active', 'Denied'].includes(status)) return res.status(400).json({ success: false, message: msg(req, 'สถานะผู้ใช้ไม่ถูกต้อง', 'Invalid status') });
  const existing = getUserById(userId);
  if (!existing) return res.status(404).json({ success: false, message: msg(req, 'ไม่พบผู้ใช้งาน', 'User not found') });
  if (existing.role === 'Admin' && status !== 'Active' && countActiveAdmins() <= 1) {
    return res.status(400).json({ success: false, message: msg(req, 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน', 'There must be at least one active admin') });
  }

  const previousStatus = existing.status;
  const user = updateUser(userId, { status })!;
  logAudit(req.user?.username, 'user.status_update', 'user', userId, { status, previousStatus });
  if (status === 'Active') store.ensureSeeded(userId);
  if (status !== 'Active') disconnectUser(userId, 'account-disabled');
  store.broadcastUserChange(userId);

  // The email depends on the previous status: the same button means approve vs. restore, reject vs. suspend.
  const email = accountStatusEmail({ lang: store.langOf(userId), previousStatus, status, username: user.username, loginUrl: `${config.frontendUrl}/#/login` });
  const emailSent = email ? await sendEmail(user.email, email) : null;
  notifyAdmins();
  res.json({
    success: true,
    emailSent,
    message:
      emailSent === false
        ? msg(req, 'อัปเดตสถานะแล้ว แต่ส่งอีเมลแจ้งผู้ใช้ไม่สำเร็จ', 'Status updated, but the email to the user could not be sent')
        : emailSent
          ? msg(req, 'อัปเดตสถานะและส่งอีเมลแจ้งผู้ใช้แล้ว', 'Status updated and the user was emailed')
          : msg(req, 'อัปเดตสถานะแล้ว', 'Status updated'),
  });
});

router.put('/users/:id/role', ...adminOnly, (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const role = req.body?.role as UserRole;
  if (!['Admin', 'Member'].includes(role)) return res.status(400).json({ success: false, message: msg(req, 'บทบาทผู้ใช้ไม่ถูกต้อง', 'Invalid role') });
  const existing = getUserById(userId);
  if (!existing) return res.status(404).json({ success: false, message: msg(req, 'ไม่พบผู้ใช้งาน', 'User not found') });
  if (existing.role === 'Admin' && role !== 'Admin' && countActiveAdmins() <= 1) {
    return res.status(400).json({ success: false, message: msg(req, 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน', 'There must be at least one active admin') });
  }
  updateUser(userId, { role });
  logAudit(req.user?.username, 'user.role_update', 'user', userId, { role });
  store.refreshUsers();
  notifyAdmins();
  res.json({ success: true });
});

router.delete('/users/:id', ...adminOnly, (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (userId === req.user?.id) return res.status(400).json({ success: false, message: msg(req, 'ไม่สามารถลบบัญชีของตัวเองได้', "You can't delete your own account") });
  const target = getUserById(userId);
  if (!target) return res.status(404).json({ success: false, message: msg(req, 'ไม่พบผู้ใช้งานที่ต้องการลบ', 'User not found') });
  if (target.role === 'Admin' && countActiveAdmins() <= 1) {
    return res.status(400).json({ success: false, message: msg(req, 'ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน', 'There must be at least one active admin') });
  }
  disconnectUser(userId, 'account-disabled');
  store.forgetUser(userId);
  deleteUserRecord(userId);
  store.refreshUsers();
  logAudit(req.user?.username, 'user.delete', 'user', userId, { username: target.username });
  notifyAdmins();
  res.json({ success: true, message: msg(req, 'ลบผู้ใช้งานสำเร็จ', 'User deleted') });
});

router.put('/update-profile', verifyAuth, async (req: Request, res: Response) => {
  const lang = reqLang(req);
  const { newUsername, email, password, currentPassword, avatarUrl } = req.body ?? {};
  const current = getUserById(req.user!.id);
  if (!current) return res.status(404).json({ success: false, message: msg(req, 'ไม่พบผู้ใช้งาน', 'User not found') });
  const updates: Record<string, unknown> = {};

  // 1. New username — rules checked only when it changes.
  const wantedUsername = typeof newUsername === 'string' ? newUsername.trim() : '';
  if (wantedUsername && wantedUsername !== current.username) {
    const usernameError = validateUsername(wantedUsername, lang);
    if (usernameError) return res.status(400).json({ success: false, message: usernameError });
    const taken = getUserByUsername(wantedUsername);
    if (taken && taken.id !== current.id) return res.status(400).json({ success: false, message: msg(req, 'Username นี้ถูกใช้งานแล้ว', 'That username is taken') });
    updates.username = wantedUsername;
  }

  // 2. New email — the form always sends it; only a different value counts as a change.
  let emailChanged = false;
  if (email) {
    const normalized = String(email).trim().toLowerCase();
    if (normalized !== current.email) {
      if (!isValidEmail(normalized)) return res.status(400).json({ success: false, message: msg(req, 'รูปแบบอีเมลไม่ถูกต้อง', 'Invalid email address') });
      const taken = getUserByEmail(normalized);
      if (taken && taken.id !== current.id) return res.status(400).json({ success: false, message: msg(req, 'Email นี้ถูกใช้งานแล้ว', 'That email is already registered') });
      updates.email = normalized;
      emailChanged = true;
    }
  }
  // Only accept avatars we stored ourselves (or clearing it).
  if (typeof avatarUrl === 'string' && (avatarUrl === '' || /^\/uploads\/[\w.-]+$/.test(avatarUrl))) updates.avatarUrl = avatarUrl;

  if (password) {
    const passwordError = validatePassword(password, { username: (updates.username as string) || current.username, lang });
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });
  }

  // 3. Changing the password or the email needs the current password: the email is how an account is
  //    recovered, so anyone at a signed-in computer could otherwise take the account over.
  //    400 not 401, because the web app treats 401/403 as "session gone" and signs out.
  if (password || emailChanged) {
    const confirmed = typeof currentPassword === 'string' && currentPassword.length > 0 && (await bcrypt.compare(currentPassword, current.password));
    if (!confirmed) {
      return res.status(400).json({
        success: false,
        code: 'CURRENT_PASSWORD',
        message: currentPassword
          ? msg(req, 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 'Your current password is wrong')
          : msg(req, 'กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนรหัสผ่านหรืออีเมล', 'Enter your current password to change your password or email'),
      });
    }
    if (password) updates.password = await bcrypt.hash(String(password), 10);
  }

  const previousAvatar = current.avatarUrl;
  const updated = updateUser(current.id, updates)!;
  logAudit(req.user?.username, 'user.profile_update', 'user', updated.id, { fields: Object.keys(updates) });
  if (updates.avatarUrl !== undefined && previousAvatar && previousAvatar !== updated.avatarUrl) removeUpload(previousAvatar);
  if (updates.username) store.broadcastUserChange(updated.id);

  // A new token only when the username changed (it's in the payload) — carrying the current session id.
  const token = updates.username
    ? jwt.sign({ id: updated.id, username: updated.username, role: updated.role, sid: getSessionId(updated.id) }, config.jwtSecret, { expiresIn: '1d' })
    : null;
  res.json({ success: true, message: msg(req, 'อัปเดตข้อมูลสำเร็จ', 'Profile updated'), token, user: toPublicUser(updated) });
});

// ─── Avatar upload ───────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase() || '.png'}`),
  }),
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function removeUpload(url: string) {
  const m = /^\/uploads\/([\w.-]+)$/.exec(url);
  if (m) fs.promises.unlink(path.join(UPLOADS_DIR, m[1])).catch(() => {});
}

router.post('/upload-avatar', verifyAuth, (req: Request, res: Response) => {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: msg(req, 'ไฟล์ใหญ่เกินไป (ไม่เกิน 2MB)', 'File too large (max 2 MB)') });
    }
    if (err) return res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
    if (!req.file) return res.status(400).json({ success: false, message: msg(req, 'รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP, GIF', 'Only JPG, PNG, WEBP or GIF images') });
    res.json({ success: true, fileUrl: `/uploads/${req.file.filename}` });
  });
});

export default router;
