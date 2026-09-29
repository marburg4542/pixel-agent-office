// Sign in / sign up / forgot password — ported from WMS src/components/Login, restyled in pixel UI.
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { session } from '../../lib/session';
import { toast } from '../../lib/toast';
import { navigate } from '../../lib/router';
import { useUsernameCheck, usernameHintClass } from '../../lib/useUsernameCheck';
import { usernameHint, validatePassword } from '../../../shared/credentialPolicy';
import { useStore, useT } from '../../store';
import type { PublicUser } from '../../types';
import { AuthLayout } from './AuthLayout';
import { PasswordStrength } from './PasswordStrength';

type Mode = 'login' | 'register' | 'forgot';

export function LoginPage({ mode, onSignedIn }: { mode: Mode; onSignedIn: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState(session.rememberedUsername());
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!session.rememberedUsername());

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [email, setEmail] = useState('');
  const usernameCheck = useUsernameCheck(mode === 'register' ? regUsername : '', lang);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* api() already showed the server's message */
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = await api<{ token: string; user: PublicUser }>('/login', { method: 'POST', body: { username, password } });
      session.remember(remember ? username : null);
      session.set(data.token, data.user);
      onSignedIn();
    });
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    // Check locally first so people see what's wrong right away (the server re-checks with the same rules).
    if (usernameCheck.status === 'invalid' || usernameCheck.status === 'taken') return void toast.error(usernameCheck.message);
    const pwError = validatePassword(regPassword, { username: regUsername, lang });
    if (pwError) return void toast.error(pwError);
    if (regPassword !== confirm) return void toast.error(t('auth_mismatch'));
    void run(async () => {
      const data = await api<{ message: string }>('/register', { method: 'POST', body: { username: regUsername, email: regEmail, password: regPassword } });
      toast.success(data.message);
      setUsername(regUsername);
      navigate('/login');
    });
  };

  const handleForgot = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const pageBase = `${window.location.origin}${window.location.pathname}`;
      const data = await api<{ message: string }>('/forgot-password', { method: 'POST', body: { email, pageBase } });
      toast.success(data.message);
      navigate('/login');
    });
  };

  if (mode === 'register') {
    return (
      <AuthLayout title={t('auth_register_title')}>
        <form onSubmit={handleRegister} className="auth-form">
          <label className="field">
            <span className="field-label">👤 {t('auth_username')}</span>
            <input className="input" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} autoComplete="username" maxLength={30} required autoFocus />
            <span className={usernameHintClass(usernameCheck.status)}>{usernameCheck.message || usernameHint(lang)}</span>
          </label>
          <label className="field">
            <span className="field-label">✉️ {t('auth_email')}</span>
            <input className="input" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <span className="field-label">🔒 {t('auth_password')}</span>
            <input className="input" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} autoComplete="new-password" required />
          </label>
          <PasswordStrength password={regPassword} username={regUsername} lang={lang} />
          <label className="field">
            <span className="field-label">🔒 {t('auth_confirm')}</span>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            {confirm && confirm !== regPassword && <span className="hint-bad">{t('auth_mismatch')}</span>}
          </label>
          <p className="hint">⏳ {t('auth_pending_note')}</p>
          <button type="submit" className="btn primary block" disabled={busy}>
            {t('auth_register_btn')}
          </button>
        </form>
        <p className="auth-switch">
          {t('auth_have_account')}{' '}
          <a href="#/login" className="link">{t('auth_login_btn')}</a>
        </p>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout title={t('auth_forgot_title')}>
        <form onSubmit={handleForgot} className="auth-form">
          <label className="field">
            <span className="field-label">✉️ {t('auth_email_registered')}</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
          <button type="submit" className="btn primary block" disabled={busy}>
            {t('auth_send_reset')}
          </button>
        </form>
        <p className="auth-switch">
          {t('auth_remembered')}{' '}
          <a href="#/login" className="link">{t('auth_back_login')}</a>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth_login_title')}>
      <form onSubmit={handleLogin} className="auth-form">
        <label className="field">
          <span className="field-label">👤 {t('auth_username')}</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus={!username} />
        </label>
        <label className="field">
          <span className="field-label">🔒 {t('auth_password')}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus={!!username} />
        </label>
        <div className="row auth-row">
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={() => setRemember((r) => !r)} />
            <span>{t('auth_remember')}</span>
          </label>
          <a href="#/forgot" className="link" style={{ marginLeft: 'auto' }}>{t('auth_forgot_link')}</a>
        </div>
        <button type="submit" className="btn primary block" disabled={busy}>
          ▶ {t('auth_login_btn')}
        </button>
      </form>
      <p className="auth-switch">
        {t('auth_no_account')}{' '}
        <a href="#/register" className="link">{t('auth_register_link')}</a>
      </p>
    </AuthLayout>
  );
}
