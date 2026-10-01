// Session storage, as in WMS: the token lives for the browser tab; "remember me" only keeps the username.
import type { Lang, PublicUser } from '../types';

const TOKEN = 'pao.token';
const USER = 'pao.user';
const REMEMBERED = 'pao.rememberedUsername';
const LANG = 'pao.lang';

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const session = {
  token: (): string | null => safe(() => sessionStorage.getItem(TOKEN), null),
  user: (): PublicUser | null => safe(() => JSON.parse(sessionStorage.getItem(USER) || 'null'), null),
  set(token: string | null, user: PublicUser) {
    safe(() => {
      if (token) sessionStorage.setItem(TOKEN, token);
      sessionStorage.setItem(USER, JSON.stringify(user));
    }, undefined);
  },
  clear() {
    safe(() => {
      sessionStorage.removeItem(TOKEN);
      sessionStorage.removeItem(USER);
    }, undefined);
  },
  rememberedUsername: (): string => safe(() => localStorage.getItem(REMEMBERED) || '', ''),
  remember(username: string | null) {
    safe(() => (username ? localStorage.setItem(REMEMBERED, username) : localStorage.removeItem(REMEMBERED)), undefined);
  },
  /** UI language before sign-in (after sign-in the account setting wins). */
  lang: (): Lang => (safe(() => localStorage.getItem(LANG), null) === 'en' ? 'en' : 'th'),
  setLang: (lang: Lang) => safe(() => localStorage.setItem(LANG, lang), undefined),
};
