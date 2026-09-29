// `npm run setup` — creates server/.env with fresh random secrets (or fills in missing ones).
// Deliberately doesn't import config.ts, which refuses to start without these values.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(dir, '.env');
const examplePath = path.join(dir, '.env.example');

const existed = fs.existsSync(envPath);
let text = fs.readFileSync(existed ? envPath : examplePath, 'utf8');
const created: string[] = [];

const fill = (key: string, value: string) => {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = re.exec(text);
  if (m && m[1].trim()) return; // keep what's there
  text = m ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  created.push(key);
};

fill('JWT_SECRET', crypto.randomBytes(48).toString('base64'));
fill('ENCRYPTION_KEY', crypto.randomBytes(32).toString('base64'));
const adminPassword = `Px${crypto.randomBytes(6).toString('base64url')}${crypto.randomInt(10, 99)}`;
fill('BOOTSTRAP_ADMIN_PASSWORD', adminPassword);

fs.writeFileSync(envPath, text);
console.log(`✅ ${existed ? 'Updated' : 'Created'} ${envPath}`);
if (created.length) console.log(`   Generated: ${created.join(', ')}`);
if (created.includes('BOOTSTRAP_ADMIN_PASSWORD')) {
  const user = /^BOOTSTRAP_ADMIN_USERNAME=(.*)$/m.exec(text)?.[1] || 'admin';
  console.log(`\n👑 First admin (created when the server first starts):\n   username: ${user}\n   password: ${adminPassword}\n   → change it in Settings after signing in.`);
}
console.log('\nNext: set FRONTEND_URL and the EMAIL_* values in server/.env, then `npm run dev:all`.');
