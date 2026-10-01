import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(SERVER_DIR, '.env'), quiet: true });

// FRONTEND_URL may hold several comma-separated URLs (e.g. tunnel domain + LAN + GitHub Pages).
// Used as the CORS allowlist and — first entry — as the base for links in emails.
const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 5200,
  dbFile: process.env.DB_FILE || 'pixel-office.sqlite',
  jwtSecret: process.env.JWT_SECRET || '',
  /** 32 random bytes, base64 — encrypts users' API keys at rest. */
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  email: {
    // EMAIL_HOST set = organisation SMTP | unset = Gmail via EMAIL_USER / EMAIL_PASS (App Password)
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || '',
  },
  frontendUrls,
  frontendUrl: frontendUrls[0],
  bootstrapAdmin: {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@pixel-office.local',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  },
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in server/.env and be at least 32 characters (run `npm run setup`).');
}
if (Buffer.from(config.encryptionKey, 'base64').length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 random bytes in base64 (run `npm run setup`).');
}
if (!config.email.host && (!config.email.user || !config.email.pass)) {
  console.warn('⚠️  Email is not configured in server/.env — password-reset and approval emails will be skipped.');
}
