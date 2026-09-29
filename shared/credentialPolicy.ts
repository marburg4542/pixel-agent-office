// Username/password rules — ported from the WMS project. One file used by both the web app
// (live checklist + strength meter while typing) and the server (the real enforcement), so the
// two can never disagree about what is allowed.
//
// Rules apply only when a name/password is *set*; existing accounts keep logging in as before.

import type { Lang } from './types';

const t = (lang: Lang, th: string, en: string) => (lang === 'th' ? th : en);

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------
// 3–30 chars: English letters, digits, dot, underscore, dash — must start/end with a letter or digit.
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,28})[A-Za-z0-9]$/;

// Names the system uses itself.
const RESERVED_USERNAMES = new Set(['system', 'root', 'administrator', 'null', 'undefined']);

export const usernameHint = (lang: Lang = 'th') =>
  t(lang, 'ภาษาอังกฤษ ตัวเลข . _ - ยาว 3–30 ตัว', 'English letters, digits . _ - (3–30 characters)');

/** Error message, or null when the name is valid. */
export const validateUsername = (value: unknown, lang: Lang = 'th'): string | null => {
  const name = String(value ?? '').trim();
  if (!name) return t(lang, 'กรุณากรอกชื่อผู้ใช้', 'Please enter a username');
  if (name.length < 3 || name.length > 30) return t(lang, 'ชื่อผู้ใช้ต้องยาว 3–30 ตัวอักษร', 'Username must be 3–30 characters');
  if (!USERNAME_PATTERN.test(name)) {
    return t(
      lang,
      'ชื่อผู้ใช้ใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข จุด (.) ขีดล่าง (_) ขีด (-) ห้ามเว้นวรรค และต้องขึ้นต้น/ลงท้ายด้วยตัวอักษรหรือตัวเลข',
      'Use only English letters, digits, dot (.), underscore (_) or dash (-), no spaces, and start/end with a letter or digit',
    );
  }
  if (RESERVED_USERNAMES.has(name.toLowerCase())) return t(lang, 'ชื่อผู้ใช้นี้สงวนไว้สำหรับระบบ กรุณาใช้ชื่ออื่น', 'This username is reserved, please pick another');
  return null;
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
export const isValidEmail = (value: unknown): boolean => {
  const email = String(value ?? '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
};

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; anything longer is silently dropped (Thai = 3 bytes/char).
export const PASSWORD_MAX_BYTES = 72;

// Popular passwords that pass the letter+digit rule but are always guessed first.
const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'pa55word', 'pass1234',
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwertyui1', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'zaq12wsx', 'qazwsx123',
  'abc12345', 'abc123456', 'abcd1234', 'abcde12345', 'a1234567', 'a12345678', 'aa123456', 'aa12345678',
  'asdf1234', 'asd12345', 'zxcv1234', 'admin123', 'admin1234', 'admin12345', 'administrator1',
  'welcome1', 'welcome123', 'iloveyou1', 'iloveyou2', 'letmein1', 'changeme1', 'test1234', 'test12345',
  'user1234', 'login123', 'monkey123', 'dragon123', 'sunshine1', 'football1', 'baseball1', 'superman1',
  'trustno1', 'master123', 'princess1', 'secret123', 'hello123', 'computer1', 'internet1', 'qwe12345',
  '12345qwert', '123qweasd', '1234qwer', '12345abc', '123456abc', '123abc456', 'abc123abc',
  'pixel123', 'pixel1234', 'pixeloffice1', 'agent123', 'agent1234', 'office123', 'office1234',
  'thailand1', 'bangkok1', 'bangkok123',
]);

const byteLength = (text: string) => new TextEncoder().encode(text).length;

export interface PasswordCheck {
  id: string;
  label: string;
  error: string;
  ok: boolean;
  hiddenWhenOk?: boolean;
}

/**
 * Checklist item by item — the web app shows ✓/○, the server replies with the first failing error.
 * `username` may be empty (the reset-from-email page doesn't know it — the server checks that rule).
 */
export const passwordChecks = (password: unknown, { username = '', lang = 'th' as Lang } = {}): PasswordCheck[] => {
  const pw = String(password ?? '');
  const lower = pw.toLowerCase();
  const name = String(username ?? '').trim().toLowerCase();
  return [
    {
      id: 'length',
      label: t(lang, `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`, `At least ${PASSWORD_MIN_LENGTH} characters`),
      error: t(lang, `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
      ok: pw.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'letter',
      label: t(lang, 'มีตัวอักษร', 'Contains a letter'),
      error: t(lang, 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว', 'Password must contain at least one letter'),
      ok: /\p{L}/u.test(pw),
    },
    {
      id: 'digit',
      label: t(lang, 'มีตัวเลข', 'Contains a digit'),
      error: t(lang, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว', 'Password must contain at least one digit'),
      ok: /\d/.test(pw),
    },
    {
      id: 'username',
      label: t(lang, 'ไม่มีชื่อผู้ใช้อยู่ในรหัสผ่าน', "Doesn't contain your username"),
      error: t(lang, 'รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ข้างใน', 'Password must not contain your username'),
      ok: name.length < 3 || !lower.includes(name),
    },
    {
      id: 'common',
      label: t(lang, 'ไม่ใช่รหัสผ่านที่คาดเดาง่าย', 'Not a commonly used password'),
      error: t(lang, 'รหัสผ่านนี้คาดเดาง่ายเกินไป กรุณาตั้งใหม่', 'This password is too easy to guess'),
      ok: pw.length > 0 && !COMMON_PASSWORDS.has(lower),
    },
    {
      id: 'maxBytes',
      label: t(lang, `ไม่ยาวเกิน ${PASSWORD_MAX_BYTES} ไบต์`, `At most ${PASSWORD_MAX_BYTES} bytes`),
      error: t(
        lang,
        `รหัสผ่านยาวเกินไป (สูงสุด ${PASSWORD_MAX_BYTES} ไบต์ — ภาษาไทยนับตัวละ 3 ไบต์)`,
        `Password is too long (max ${PASSWORD_MAX_BYTES} bytes)`,
      ),
      ok: byteLength(pw) <= PASSWORD_MAX_BYTES,
      hiddenWhenOk: true,
    },
  ];
};

/** First failing rule's message, or null when the password is acceptable. */
export const validatePassword = (password: unknown, context: { username?: string; lang?: Lang } = {}): string | null =>
  passwordChecks(password, context).find((check) => !check.ok)?.error ?? null;

/** 0–4 score for the meter only (not used to accept/reject). Length counts most, then variety. */
export const passwordStrength = (password: unknown): number => {
  const pw = String(password ?? '');
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (kinds >= 2) score += 1;
  if (kinds >= 3) score += 1;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) score = 0;
  return score;
};
