// Limits on sensitive endpoints against password guessing and spam — same numbers as WMS.
import rateLimit from 'express-rate-limit';

const makeLimiter = ({ windowMs, max, th, en, skipSuccessfulRequests = false }: {
  windowMs: number;
  max: number;
  th: string;
  en: string;
  skipSuccessfulRequests?: boolean;
}) =>
  rateLimit({
    windowMs,
    limit: max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, message: req.get('x-lang') === 'en' ? en : th }),
  });

// Login/reset: count only failures, so people typing the right password are never blocked.
export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  th: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
  en: 'Too many failed sign-in attempts. Please wait a moment and try again.',
});

export const resetPasswordLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  th: 'พยายามรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  en: 'Too many reset attempts. Please wait a moment and try again.',
});

// Forgot/register: count every call (email / sign-up spam).
export const forgotPasswordLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 6,
  th: 'ขอรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  en: 'Too many reset requests. Please wait a while and try again.',
});

export const usernameCheckLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  th: 'ตรวจสอบชื่อผู้ใช้บ่อยเกินไป กรุณารอสักครู่',
  en: 'Too many username checks. Please wait a moment.',
});

export const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  th: 'สมัครสมาชิกบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
  en: 'Too many sign-ups. Please wait a while and try again.',
});
