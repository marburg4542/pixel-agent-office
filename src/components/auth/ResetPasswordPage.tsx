// Choose a new password from the emailed link — ported from WMS src/components/ResetPassword.
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import { navigate } from '../../lib/router';
import { validatePassword } from '../../../shared/credentialPolicy';
import { useStore, useT } from '../../store';
import { AuthLayout } from './AuthLayout';
import { PasswordStrength } from './PasswordStrength';

export function ResetPasswordPage({ token }: { token: string }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // This page doesn't know the username — the server checks "no username inside" on save.
    const pwError = validatePassword(pwd, { lang });
    if (pwError) return void toast.error(pwError);
    if (pwd !== confirm) return void toast.error(t('auth_mismatch'));
    setBusy(true);
    try {
      const data = await api<{ message: string }>('/reset-password', { method: 'POST', body: { token, newPassword: pwd } });
      toast.success(data.message);
      navigate('/login');
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth_reset_title')}>
      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span className="field-label">🔒 {t('auth_new_password')}</span>
          <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" required autoFocus disabled={busy} />
        </label>
        <PasswordStrength password={pwd} lang={lang} />
        <label className="field">
          <span className="field-label">🔒 {t('auth_confirm_new')}</span>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required disabled={busy} />
          {confirm && confirm !== pwd && <span className="hint-bad">{t('auth_mismatch')}</span>}
        </label>
        <button type="submit" className="btn primary block" disabled={busy}>
          💾 {t('auth_save_password')}
        </button>
      </form>
      <p className="auth-switch">
        <a href="#/login" className="link">{t('auth_back_login')}</a>
      </p>
    </AuthLayout>
  );
}
