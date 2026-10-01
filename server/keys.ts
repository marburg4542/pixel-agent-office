// Users' own API keys (AI providers + research data sources), encrypted at rest.
// Secrets never leave the server again after they are saved — the web app only ever sees a hint.
import db from './db';
import { decrypt, encrypt, maskSecret } from './crypto';
import { KEY_PROVIDERS, keyProvider } from '../shared/keys';
import { ApiError } from './workspace/store';
import type { ApiKeyProvider, ApiKeyStatus } from '../shared/types';

type Fields = Record<string, string>;

const q = {
  list: db.prepare('SELECT provider, hint, updated_at FROM api_keys WHERE user_id = ?'),
  get: db.prepare('SELECT secret FROM api_keys WHERE user_id = ? AND provider = ?'),
  upsert: db.prepare(`
    INSERT INTO api_keys (user_id, provider, secret, hint, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET secret = excluded.secret, hint = excluded.hint, updated_at = excluded.updated_at
  `),
  delete: db.prepare('DELETE FROM api_keys WHERE user_id = ? AND provider = ?'),
};

export function listKeys(userId: number): ApiKeyStatus[] {
  const rows = new Map((q.list.all(userId) as { provider: string; hint: string; updated_at: number }[]).map((r) => [r.provider, r]));
  return KEY_PROVIDERS.map((p) => {
    const r = rows.get(p.id);
    return { provider: p.id, configured: !!r, hint: r?.hint ?? '', updatedAt: r?.updated_at };
  });
}

export function setKey(userId: number, provider: string, input: unknown): ApiKeyStatus {
  const def = keyProvider(provider);
  if (!def) throw new ApiError(400, 'ไม่รู้จักผู้ให้บริการนี้', 'Unknown provider');
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fields: Fields = {};
  for (const f of def.fields) {
    const v = String(raw[f.name] ?? '').trim();
    if (!v) throw new ApiError(400, `กรุณากรอก ${f.label.th}`, `Please fill in ${f.label.en}`);
    if (v.length > 500) throw new ApiError(400, 'ค่าที่กรอกยาวเกินไป', 'Value is too long');
    fields[f.name] = v;
  }
  const secretField = def.fields.find((f) => f.secret) ?? def.fields[0];
  const hint = secretField.secret ? maskSecret(fields[secretField.name]) : fields[secretField.name];
  const now = Date.now();
  q.upsert.run(userId, provider, encrypt(JSON.stringify(fields)), hint, now);
  return { provider: def.id, configured: true, hint, updatedAt: now };
}

export function deleteKey(userId: number, provider: string): void {
  q.delete.run(userId, provider);
}

/** Decrypted fields for server-side use only (AI calls, data connectors). */
export function getKey(userId: number, provider: ApiKeyProvider): Fields | null {
  const row = q.get.get(userId, provider) as { secret: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.secret)) as Fields;
  } catch {
    console.error(`Could not decrypt the ${provider} key of user ${userId} — was ENCRYPTION_KEY changed?`);
    return null;
  }
}
