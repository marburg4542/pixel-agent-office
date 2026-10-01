// Fetch wrapper — ported from WMS src/utils/api.js: JSON by default, bearer token, server error
// messages shown as toasts, and a dead session sends you back to the sign-in page.
import { session } from './session';
import { toast } from './toast';

/** Where the API lives. Empty = same origin (dev proxy or the server serving the built app). */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

export const assetUrl = (url: string | undefined): string => {
  if (!url) return '';
  return /^(https?:|data:|blob:)/.test(url) ? url : `${API_BASE}${url}`;
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

let onSessionLost: ((reason: string) => void) | null = null;
export const setSessionLostHandler = (fn: (reason: string) => void) => {
  onSessionLost = fn;
};

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/username-available'];

interface Options extends Omit<RequestInit, 'body'> {
  body?: unknown;
  quiet?: boolean;
}

export async function api<T = unknown>(endpoint: string, options: Options = {}): Promise<T> {
  const { quiet = false, body, headers, ...rest } = options;
  const token = session.token();
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${endpoint}`, {
      ...rest,
      headers: {
        ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Lang': session.lang(),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    const text = session.lang() === 'th' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเซิร์ฟเวอร์เปิดอยู่' : "Can't reach the server — is it running?";
    if (!quiet) toast.error(text);
    throw new ApiError(0, text);
  }

  let data: { success?: boolean; message?: string; code?: string; data?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }

  if (!res.ok) {
    const message = data.message || `Server error (${res.status})`;
    const isAuthRoute = AUTH_ROUTES.some((r) => endpoint.startsWith(r));
    if ((res.status === 401 || res.status === 403) && !isAuthRoute && token) {
      onSessionLost?.(data.code === 'SESSION_REPLACED' ? message : '');
    } else if (!quiet) {
      toast.error(message);
    }
    throw new ApiError(res.status, message, data.code);
  }
  return (data.data !== undefined ? data.data : data) as T;
}
