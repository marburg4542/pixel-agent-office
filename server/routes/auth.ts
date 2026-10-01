// Sign-in, sign-up (admin approval), forgot/reset password — ported from WMS
// server/controllers/authController.js with bilingual messages.
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db, { logAudit } from '../db';
import { config } from '../config';
import { msg, reqLang } from '../lang';
import { verifyAuth } from '../middleware/auth';
import { forgotPasswordLimiter, loginLimiter, registerLimiter, resetPasswordLimiter, usernameCheckLimiter } from '../middleware/rateLimit';
import { createUser, getUserByEmail, getUserById, getUserByUsername, getUsers, setSessionId, toPublicUser, updateUser, type UserRow } from '../users';
import { sendEmail } from '../email/send';
import { passwordResetEmail, registrationReceivedEmail } from '../email/templates';
import { isValidEmail, validatePassword, validateUsername } from '../../shared/credentialPolicy';
import { disconnectUser, sendTo } from '../events';
import * as store from '../workspace/store';

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const signToken = (user: Pick<UserRow, 'id' | 'username' | 'role'>, sessionId: string | null) =>
  jwt.sign({ id: user.id, username: user.username, role: user.role, sid: sessionId }, config.jwtSecret, { expiresIn: '1d' });

/** Tell admins the user list changed (new sign-up, approval …). */
export const notifyAdmins = () =>
  sendTo(getUsers().filter((u) => u.role === 'Admin' && u.status === 'Active').map((u) => u.id), 'users');

const router = Router();

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: msg(req, 'กรุณากรอก Username และ Password', 'Please enter your username and password') });
  }
  const user = getUserByUsername(String(username).trim());
  if (!user || !(await bcrypt.compare(String(password), user.password))) {
    return res.status(401).json({ success: false, message: msg(req, 'Username หรือ Password ไม่ถูกต้อง', 'Wrong username or password') });
  }
  if (user.status === 'Pending') return res.status(403).json({ success: false, message: msg(req, 'บัญชีรอผลการอนุมัติ', 'Your account is waiting for approval') });
  if (user.status === 'Denied') {
    return res.status(403).json({ success: false, message: msg(req, 'บัญชีนี้ไม่ได้รับอนุมัติให้ใช้งานระบบ', 'This account is not allowed to sign in') });
  }

  // A fresh session per login, stored over the old one → other devices holding old tokens are cut off.
  const sessionId = crypto.randomBytes(16).toString('hex');
  setSessionId(user.id, sessionId);
  disconnectUser(user.id);
  logAudit(user.username, 'auth.login', 'user', user.id);
  return res.json({ success: true, token: signToken(user, sessionId), user: toPublicUser(user) });
});

router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const lang = reqLang(req);
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: msg(req, 'กรุณากรอกข้อมูลสมัครสมาชิกให้ครบถ้วน', 'Please fill in every field') });
  }
  // Same rules the form shows while typing (shared/credentialPolicy) — checked again because the API can be called directly.
  const usernameError = validateUsername(username, lang);
  if (usernameError) return res.status(400).json({ success: false, message: usernameError });
  if (!isValidEmail(email)) return res.status(400).json({ success: false, message: msg(req, 'รูปแบบอีเมลไม่ถูกต้อง', 'Invalid email address') });
  const passwordError = validatePassword(password, { username, lang });
  if (passwordError) return res.status(400).json({ success: false, message: passwordError });

  // Suspended (Denied) accounts still reserve their name/email; deleted ones don't.
  if (getUserByUsername(username)) {
    return res.status(400).json({ success: false, message: msg(req, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว (อาจเป็นบัญชีเดิมที่ยังไม่ถูกลบ)', 'This username is already taken') });
  }
  if (getUserByEmail(email)) {
    return res.status(400).json({ success: false, message: msg(req, 'อีเมลนี้ถูกใช้งานแล้ว (อาจเป็นบัญชีเดิมที่ยังไม่ถูกลบ)', 'This email is already registered') });
  }

  const newUser = createUser({ username, email, password: await bcrypt.hash(String(password), 10), role: 'Member', status: 'Pending' });
  store.updateSettings(newUser.id, { lang });
  logAudit(username, 'auth.register', 'user', newUser.id, { status: 'Pending' });
  store.refreshUsers();
  notifyAdmins();
  await sendEmail(email, registrationReceivedEmail({ lang, username, email }));
  return res.json({ success: true, message: msg(req, 'สมัครสมาชิกสำเร็จ กรุณารอการอนุมัติ', 'Signed up! Please wait for an admin to approve your account.') });
});

// Check a name while typing — no login needed (the person has no account yet), so it's rate-limited.
router.get('/username-available', usernameCheckLimiter, (req: Request, res: Response) => {
  const username = String(req.query.username || '').trim();
  const formatError = validateUsername(username, reqLang(req));
  if (formatError) return res.json({ success: true, available: false, reason: 'format', message: formatError });
  const taken = getUserByUsername(username);
  return res.json({
    success: true,
    available: !taken,
    reason: taken ? 'taken' : null,
    message: taken ? msg(req, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว', 'That username is taken') : msg(req, 'ใช้ชื่อนี้ได้', 'Username is available'),
  });
});

router.get('/verify-token', verifyAuth, (req: Request, res: Response) => {
  const user = getUserById(req.user!.id);
  if (!user || user.status !== 'Active') return res.status(403).json({ success: false, message: msg(req, 'บัญชีนี้ไม่พร้อมใช้งาน', 'This account is not active') });
  return res.json({ success: true, user: toPublicUser(user) });
});

router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: msg(req, 'กรุณาระบุอีเมล', 'Please enter your email') });

  const user = getUserByEmail(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < ? OR used_at IS NOT NULL').run(user.id, now);
    db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      hashResetToken(token),
      user.id,
      now + RESET_TOKEN_TTL_MS,
      now,
    );
    // Use the origin the person is actually on (LAN / tunnel / Pages) when it's allow-listed, so the link
    // works — otherwise the first FRONTEND_URL (guards against host-header injection in the link).
    const origin = String(req.get('origin') || '').replace(/\/$/, '');
    const pageBase = String(req.body?.pageBase || '').replace(/\/$/, '');
    const base = config.frontendUrls.includes(origin) ? (pageBase.startsWith(origin) ? pageBase : origin) : config.frontendUrl;
    const resetLink = `${base}/#/reset-password/${token}`;
    await sendEmail(email, passwordResetEmail({ lang: store.langOf(user.id), username: user.username, resetLink, expiresInMinutes: RESET_TOKEN_TTL_MS / 60000 }));
  }
  // Same answer either way, so the form can't be used to discover who has an account.
  return res.json({ success: true, message: msg(req, 'หากอีเมลนี้อยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้', "If that email is registered, we've sent a reset link") });
});

router.post('/reset-password', resetPasswordLimiter, async (req: Request, res: Response) => {
  const { token, newPassword } = req.body ?? {};
  if (!token) return res.status(400).json({ success: false, message: msg(req, 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง', 'Invalid reset link') });
  const tokenHash = hashResetToken(String(token));
  const row = db
    .prepare('SELECT token_hash, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?')
    .get(tokenHash) as { user_id: number; expires_at: number; used_at: number | null } | undefined;
  if (!row || row.used_at || row.expires_at < Date.now()) {
    if (row) db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    return res.status(400).json({ success: false, message: msg(req, 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง หรือหมดอายุแล้ว', 'This reset link is invalid or has expired') });
  }
  const user = getUserById(row.user_id);
  if (!user) return res.status(404).json({ success: false, message: msg(req, 'ไม่พบผู้ใช้งาน', 'User not found') });

  // Checked once the user is known, so "no username inside" can be enforced; a failed attempt keeps the link valid.
  const passwordError = validatePassword(newPassword, { username: user.username, lang: reqLang(req) });
  if (passwordError) return res.status(400).json({ success: false, message: passwordError });

  updateUser(user.id, { password: await bcrypt.hash(String(newPassword), 10) });
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash);
  logAudit(user.username, 'auth.password_reset', 'user', user.id);
  return res.json({ success: true, message: msg(req, 'รีเซ็ตรหัสผ่านสำเร็จ คุณสามารถเข้าสู่ระบบได้ทันที', 'Password changed — you can sign in now') });
});

export default router;
