// Users' API keys are stored encrypted with AES-256-GCM. The key lives only in server/.env
// (ENCRYPTION_KEY), so a copied database file alone doesn't reveal anyone's keys.
import crypto from 'node:crypto';
import { config } from './config';

const KEY = Buffer.from(config.encryptionKey, 'base64');

/** iv.tag.ciphertext, each base64. */
export const encrypt = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};

export const decrypt = (packed: string): string => {
  const [iv, tag, data] = packed.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

/** "sk-ant-…a1b2" style hint so users can tell keys apart without seeing them. */
export const maskSecret = (secret: string): string => {
  const s = secret.trim();
  if (s.length <= 8) return '••••';
  const prefix = s.match(/^[a-z]+[-_]/i)?.[0] ?? '';
  return `${prefix}…${s.slice(-4)}`;
};
