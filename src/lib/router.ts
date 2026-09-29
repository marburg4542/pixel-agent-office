// Tiny hash router: #/login, #/reset-password/<token>, #/ … Hash URLs work on any static host
// (GitHub Pages sub-paths included) without server rewrites, so email links always open.
import { useSyncExternalStore } from 'react';

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};

const current = () => window.location.hash.replace(/^#/, '') || '/';

export const useRoute = (): string => useSyncExternalStore(subscribe, current);

export const navigate = (path: string) => {
  if (current() !== path) window.location.hash = path;
};

/** "/reset-password/abc" → ["reset-password", "abc"] */
export const routeParts = (route: string) => route.split('/').filter(Boolean);
