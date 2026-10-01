import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getSessionId, getUserById } from '../users';
import { msg } from '../lang';
import type { UserRole } from '../../shared/types';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  id: number;
  sid?: string;
}

/** Verify a JWT and its session. Returns the user or an error code. */
export const checkToken = (token: string): { user: AuthUser } | { error: 'invalid' | 'inactive' | 'replaced' } => {
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return { error: 'invalid' };
  }
  const user = getUserById(decoded.id);
  if (!user || user.status !== 'Active') return { error: 'inactive' };
  // One account = one device: a newer login changes session_id and cuts older tokens.
  const current = getSessionId(user.id);
  if (current && decoded.sid !== current) return { error: 'replaced' };
  return { user: { id: user.id, username: user.username, role: user.role } };
};

export const verifyAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: msg(req, 'ไม่อนุญาตให้เข้าถึง (ไม่มี Token)', 'Not signed in') });
  }
  const result = checkToken(header.slice(7));
  if ('error' in result) {
    if (result.error === 'replaced') {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REPLACED',
        message: msg(req, 'บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น กรุณาเข้าสู่ระบบใหม่', 'This account signed in on another device. Please sign in again.'),
      });
    }
    if (result.error === 'inactive') {
      return res.status(403).json({ success: false, message: msg(req, 'บัญชีนี้ไม่พร้อมใช้งาน', 'This account is not active') });
    }
    return res.status(403).json({ success: false, message: msg(req, 'Token ไม่ถูกต้องหรือหมดอายุแล้ว', 'Session expired, please sign in again') });
  }
  req.user = result.user;
  next();
};

export const authorizeRoles =
  (...allowed: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: msg(req, 'กรุณาเข้าสู่ระบบก่อน', 'Please sign in first') });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: msg(req, 'สิทธิ์ของคุณไม่สามารถทำรายการนี้ได้', "You don't have permission to do this") });
    }
    next();
  };
