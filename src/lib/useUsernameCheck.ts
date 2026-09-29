// Check a username while typing: format locally right away, availability from the server after a
// 0.5 s pause — ported from WMS src/utils/useUsernameCheck.js.
// status: idle | invalid | checking | available | taken | unknown (server unreachable — doesn't block submit)
import { useEffect, useState } from 'react';
import { api } from './api';
import { validateUsername } from '../../shared/credentialPolicy';
import type { Lang } from '../types';

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown';

export function useUsernameCheck(username: string, lang: Lang, { currentUsername = '' } = {}) {
  const name = String(username || '').trim();
  // Your own current name (settings page) isn't "taken".
  const idle = !name || (!!currentUsername && name.toLowerCase() === currentUsername.toLowerCase());
  const formatError = idle ? null : validateUsername(name, lang);
  const [result, setResult] = useState<{ name: string; status: UsernameStatus; message: string }>({ name: '', status: 'idle', message: '' });

  useEffect(() => {
    if (idle || formatError) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ available: boolean; message: string }>(`/username-available?username=${encodeURIComponent(name)}`, { quiet: true });
        if (!cancelled) setResult({ name, status: res.available ? 'available' : 'taken', message: res.message });
      } catch {
        if (!cancelled) setResult({ name, status: 'unknown', message: '' });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, idle, formatError]);

  if (idle) return { status: 'idle' as UsernameStatus, message: '' };
  if (formatError) return { status: 'invalid' as UsernameStatus, message: formatError };
  if (result.name !== name) return { status: 'checking' as UsernameStatus, message: lang === 'th' ? 'กำลังตรวจสอบชื่อผู้ใช้…' : 'Checking…' };
  return result;
}

export const usernameHintClass = (status: UsernameStatus) =>
  ({ invalid: 'hint-bad', taken: 'hint-bad', available: 'hint-good' } as Record<string, string>)[status] ?? 'hint';
