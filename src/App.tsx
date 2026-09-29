import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, useT } from './store';
import { ApiError, api, setSessionLostHandler } from './lib/api';
import { session } from './lib/session';
import { navigate, routeParts, useRoute } from './lib/router';
import { connectEvents, disconnectEvents, onServerEvent } from './lib/events';
import { toast } from './lib/toast';
import { useReviewAlerts, useShortcuts } from './lib/officeHooks';
import { translate } from '../shared/i18n';
import type { Workspace } from './types';
import { TopBar } from './components/TopBar';
import { OfficeCanvas } from './components/OfficeCanvas';
import { Sidebar } from './components/Sidebar';
import { ModalHost } from './components/ModalHost';
import { Toasts } from './components/Toasts';
import { LoginPage } from './components/auth/LoginPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';

type Phase = 'checking' | 'out' | 'loading' | 'in' | 'offline';

function Office({ onSignOut }: { onSignOut: () => void }) {
  const userId = useStore((s) => s.user?.id);
  useShortcuts();
  useReviewAlerts();

  // First visit on this browser: show the short tour.
  useEffect(() => {
    if (!userId) return;
    const key = `pao.tour.${userId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    useStore.getState().openModal({ kind: 'help' });
  }, [userId]);

  return (
    <div className="app">
      <TopBar onSignOut={onSignOut} />
      <main className="main">
        <OfficeCanvas />
        <Sidebar />
      </main>
      <ModalHost />
    </div>
  );
}

export function App() {
  const t = useT();
  const route = useRoute();
  const parts = routeParts(route);
  const lang = useStore((s) => s.settings.lang);
  const [phase, setPhase] = useState<Phase>(session.token() ? 'checking' : 'out');
  const opened = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const signOut = useCallback((message?: string) => {
    disconnectEvents();
    session.clear();
    useStore.getState().reset();
    opened.current = false;
    setPhase('out');
    if (message) toast.warn(message);
    navigate('/login');
  }, []);

  const enter = useCallback(async () => {
    setPhase((p) => (p === 'offline' ? p : 'loading'));
    try {
      useStore.getState().load(await api<Workspace>('/workspace', { quiet: true }));
      connectEvents();
      setPhase('in');
      if (['login', 'register', 'forgot'].includes(routeParts(window.location.hash.slice(1))[0] ?? '')) navigate('/');
    } catch (e) {
      // Only a rejected session signs you out; a server that's briefly down (restart, tunnel hiccup)
      // shows a reconnect screen and keeps retrying.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) signOut();
      else setPhase('offline');
    }
  }, [signOut]);

  useEffect(() => {
    if (phase !== 'offline') return;
    const id = setInterval(() => void enter(), 4000);
    return () => clearInterval(id);
  }, [phase, enter]);

  // First load with a token from this tab's session.
  useEffect(() => {
    if (phase === 'checking') void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSessionLostHandler((message) => signOut(message || translate(session.lang(), 'auth_session_lost')));
    const offs = [
      onServerEvent('session-replaced', () => signOut(translate(session.lang(), 'auth_replaced'))),
      onServerEvent('account-disabled', () => signOut(translate(session.lang(), 'auth_session_lost'))),
      // After a dropped connection comes back, re-sync everything we may have missed.
      onServerEvent('open', () => {
        if (!opened.current) {
          opened.current = true;
          return;
        }
        api<Workspace>('/workspace', { quiet: true }).then((ws) => useStore.getState().load(ws)).catch(() => {});
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [signOut]);

  let page;
  if (parts[0] === 'reset-password' && parts[1]) page = <ResetPasswordPage token={parts[1]} />;
  else if (phase === 'checking' || phase === 'loading') page = <div className="loading-screen">⏳ {t('auth_loading')}</div>;
  else if (phase === 'offline')
    page = (
      <div className="loading-screen">
        <div style={{ textAlign: 'center' }}>
          <p>📡 {t('offline_title')}</p>
          <p className="hint" style={{ color: '#c9bfd9' }}>{t('offline_body')}</p>
          <button className="btn" onClick={() => void enter()}>↻ {t('offline_retry')}</button>{' '}
          <button className="btn dark" onClick={() => signOut()}>{t('logout')}</button>
        </div>
      </div>
    );
  else if (phase === 'out') page = <LoginPage mode={parts[0] === 'register' ? 'register' : parts[0] === 'forgot' ? 'forgot' : 'login'} onSignedIn={enter} />;
  else page = <Office onSignOut={() => signOut()} />;

  return (
    <>
      {page}
      <Toasts />
    </>
  );
}
