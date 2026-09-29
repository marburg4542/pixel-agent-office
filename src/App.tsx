import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, useT } from './store';
import { api, setSessionLostHandler } from './lib/api';
import { session } from './lib/session';
import { navigate, routeParts, useRoute } from './lib/router';
import { connectEvents, disconnectEvents, onServerEvent } from './lib/events';
import { toast } from './lib/toast';
import { translate } from '../shared/i18n';
import type { Workspace } from './types';
import { TopBar } from './components/TopBar';
import { OfficeCanvas } from './components/OfficeCanvas';
import { Sidebar } from './components/Sidebar';
import { ModalHost } from './components/ModalHost';
import { Toasts } from './components/Toasts';
import { LoginPage } from './components/auth/LoginPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';

type Phase = 'checking' | 'out' | 'loading' | 'in';

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
    setPhase('loading');
    try {
      useStore.getState().load(await api<Workspace>('/workspace'));
      connectEvents();
      setPhase('in');
      if (['login', 'register', 'forgot'].includes(routeParts(window.location.hash.slice(1))[0] ?? '')) navigate('/');
    } catch {
      signOut();
    }
  }, [signOut]);

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
  else if (phase === 'out') page = <LoginPage mode={parts[0] === 'register' ? 'register' : parts[0] === 'forgot' ? 'forgot' : 'login'} onSignedIn={enter} />;
  else
    page = (
      <div className="app">
        <TopBar onSignOut={() => signOut()} />
        <main className="main">
          <OfficeCanvas />
          <Sidebar />
        </main>
        <ModalHost />
      </div>
    );

  return (
    <>
      {page}
      <Toasts />
    </>
  );
}
