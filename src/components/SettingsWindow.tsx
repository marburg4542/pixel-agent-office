import { useEffect, useState, type FormEvent } from 'react';
import { useStore, useT } from '../store';
import { api, assetUrl } from '../lib/api';
import { session } from '../lib/session';
import { toast } from '../lib/toast';
import { play } from '../lib/sound';
import { shrinkAvatar } from '../lib/image';
import { useUsernameCheck, usernameHintClass } from '../lib/useUsernameCheck';
import { usernameHint, validatePassword } from '../../shared/credentialPolicy';
import { KEY_PROVIDERS, type KeyProviderDef } from '../../shared/keys';
import type { ApiKeyStatus, PublicUser, SettingsTab } from '../types';
import { PasswordStrength } from './auth/PasswordStrength';
import { UserAvatar, Window } from './ui';

export function SettingsWindow({ z, onClose, tab: initialTab }: { z: number; onClose: () => void; tab?: SettingsTab }) {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'profile');
  return (
    <Window z={z} width={720} title={`⚙ ${t('settings')}`} onClose={onClose}>
      <div className="tabs" role="tablist">
        {(['profile', 'sound', 'keys'] as SettingsTab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {k === 'profile' ? `👤 ${t('set_profile')}` : k === 'sound' ? `🔊 ${t('set_sound')}` : `🔑 ${t('set_keys')}`}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'sound' && <SoundTab />}
      {tab === 'keys' && <KeysTab />}
    </Window>
  );
}

// ─── Profile (ported from WMS Settings page) ─────────────────────────────────

function ProfileTab() {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const user = useStore((s) => s.user!);
  const setUser = useStore((s) => s.setUser);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameCheck = useUsernameCheck(username, lang, { currentUsername: user.username });

  // Changing the password or the email needs the current password (the server enforces it).
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();
  const needsCurrent = Boolean(newPassword) || emailChanged;

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    const small = await shrinkAvatar(file);
    setAvatarFile(small);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(small));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (usernameCheck.status === 'invalid' || usernameCheck.status === 'taken') return void toast.error(usernameCheck.message);
    if (newPassword) {
      const err = validatePassword(newPassword, { username, lang });
      if (err) return void toast.error(err);
      if (newPassword !== confirm) return void toast.error(t('auth_mismatch'));
    }
    if (needsCurrent && !currentPassword) return void toast.error(t('set_needCurrent'));
    setBusy(true);
    try {
      let avatarUrl: string | undefined = removeAvatar ? '' : undefined;
      if (avatarFile) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        avatarUrl = (await api<{ fileUrl: string }>('/upload-avatar', { method: 'POST', body: form })).fileUrl;
      }
      const res = await api<{ message: string; token: string | null; user: PublicUser }>('/update-profile', {
        method: 'PUT',
        body: {
          newUsername: username,
          email,
          avatarUrl,
          password: newPassword || undefined,
          currentPassword: needsCurrent ? currentPassword : undefined,
        },
      });
      session.set(res.token, res.user);
      setUser(res.user);
      setAvatarFile(null);
      setNewPassword('');
      setConfirm('');
      setCurrentPassword('');
      toast.success(res.message);
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="row" style={{ marginBottom: 14 }}>
        {avatarPreview && !removeAvatar ? (
          <img src={assetUrl(avatarPreview)} className="user-avatar" width={72} height={72} alt="" />
        ) : (
          <UserAvatar user={{ username, avatarUrl: '' }} size={72} />
        )}
        <div className="field" style={{ margin: 0 }}>
          <span className="field-label">{t('set_avatar')}</span>
          <span className="row" style={{ gap: 6 }}>
            <label className="btn sm">
              🖼 {t('set_chooseImage')}
              <input
                type="file"
                className="visually-hidden"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => void pickAvatar(e.target.files?.[0])}
              />
            </label>
            {(user.avatarUrl || avatarFile) && !removeAvatar && (
              <button type="button" className="btn sm" onClick={() => { setRemoveAvatar(true); setAvatarFile(null); }}>
                ✕ {t('set_removeAvatar')}
              </button>
            )}
          </span>
          <span className="hint">{t('set_avatarHint')}</span>
        </div>
      </div>
      <label className="field">
        <span className="field-label">{t('auth_username')}</span>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={30} />
        {usernameCheck.status !== 'idle' && <span className={usernameHintClass(usernameCheck.status)}>{usernameCheck.message || usernameHint(lang)}</span>}
      </label>
      <label className="field">
        <span className="field-label">{t('auth_email')}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span className="field-label">{t('set_newPassword')}</span>
        <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <PasswordStrength password={newPassword} username={username} lang={lang} />
      {newPassword && (
        <label className="field">
          <span className="field-label">{t('auth_confirm_new')}</span>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {confirm && confirm !== newPassword && <span className="hint-bad">{t('auth_mismatch')}</span>}
        </label>
      )}
      {needsCurrent && (
        <label className="field confirm-box">
          <span className="field-label">🔐 {t('set_currentPassword')}</span>
          <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          <span className="hint">{t('set_currentHint')}</span>
        </label>
      )}
      <button type="submit" className="btn primary" disabled={busy}>💾 {t('save')}</button>
    </form>
  );
}

// ─── Sound & display ─────────────────────────────────────────────────────────

function SoundTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const { updateSettings, setLang } = useStore.getState();
  return (
    <div>
      <div className="opt-row">
        <label>{t('set_soundOn')}</label>
        <span className="seg">
          <button className={`btn sm ${settings.sound ? 'on' : ''}`} onClick={() => void updateSettings({ sound: true }).catch(() => {})}>🔊 {t('on')}</button>
          <button className={`btn sm ${!settings.sound ? 'on' : ''}`} onClick={() => void updateSettings({ sound: false }).catch(() => {})}>🔇 {t('off')}</button>
        </span>
      </div>
      <div className="opt-row">
        <label htmlFor="vol">{t('set_volume')}</label>
        <div className="row">
          <input
            id="vol"
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            disabled={!settings.sound}
            onChange={(e) => useStore.setState({ settings: { ...settings, volume: Number(e.target.value) / 100 } })}
            onPointerUp={(e) => void updateSettings({ volume: Number((e.target as HTMLInputElement).value) / 100 }).catch(() => {})}
            onKeyUp={(e) => void updateSettings({ volume: Number((e.target as HTMLInputElement).value) / 100 }).catch(() => {})}
          />
          <span className="hint">{Math.round(settings.volume * 100)}%</span>
          <button className="btn sm" disabled={!settings.sound} onClick={() => play('done')}>▶ {t('set_testSound')}</button>
        </div>
      </div>
      <div className="opt-row">
        <label>{t('set_language')}</label>
        <span className="seg">
          <button className={`btn sm ${settings.lang === 'th' ? 'on' : ''}`} onClick={() => setLang('th')}>ไทย</button>
          <button className={`btn sm ${settings.lang === 'en' ? 'on' : ''}`} onClick={() => setLang('en')}>English</button>
        </span>
      </div>
      <p className="hint">{t('set_soundHint')}</p>
    </div>
  );
}

// ─── Own API keys ────────────────────────────────────────────────────────────

function KeysTab() {
  const t = useT();
  const [keys, setKeys] = useState<ApiKeyStatus[] | null>(null);
  useEffect(() => {
    api<ApiKeyStatus[]>('/keys').then(setKeys, () => setKeys([]));
  }, []);
  const status = (id: string) => keys?.find((k) => k.provider === id);
  const onChange = (s: ApiKeyStatus) => setKeys((ks) => (ks ?? []).map((k) => (k.provider === s.provider ? s : k)));

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>🔐 {t('keys_hint')}</p>
      {(['ai', 'data'] as const).map((group) => (
        <div key={group}>
          <div className="section-title">{group === 'ai' ? `🤖 ${t('keys_ai')}` : `📡 ${t('keys_data')}`}</div>
          {group === 'data' && <p className="hint" style={{ marginTop: -4 }}>{t('keys_dataHint')}</p>}
          <div className="key-list">
            {KEY_PROVIDERS.filter((p) => p.group === group).map((p) => (
              <KeyRow key={p.id} def={p} status={status(p.id)} onChange={onChange} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KeyRow({ def, status, onChange }: { def: KeyProviderDef; status?: ApiKeyStatus; onChange: (s: ApiKeyStatus) => void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      onChange(await api<ApiKeyStatus>(`/keys/${def.id}`, { method: 'PUT', body: values }));
      setValues({});
      setOpen(false);
      toast.success(t('keys_saved', { name: def.name }));
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/keys/${def.id}`, { method: 'DELETE' });
      onChange({ provider: def.id, configured: false, hint: '' });
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="key-row">
      <div className="key-head">
        <strong>{def.name}</strong>
        {status?.configured ? <span className="chip key-ok">✓ {status.hint}</span> : <span className="chip">{t('keys_notSet')}</span>}
        <span style={{ marginLeft: 'auto' }} className="row">
          <a href={def.url} target="_blank" rel="noreferrer" className="link hint">{t('keys_getOne')} ↗</a>
          <button className="btn sm" onClick={() => setOpen(!open)}>{status?.configured ? t('keys_replace') : t('keys_add')}</button>
          {status?.configured && (
            <button className="btn sm danger" disabled={busy} onClick={() => void remove()}>🗑</button>
          )}
        </span>
      </div>
      {def.note && <div className="hint">{def.note[lang]}</div>}
      {open && (
        <div className="key-form">
          {def.fields.map((f) => (
            <input
              key={f.name}
              className="input"
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={`${f.label[lang]}${f.placeholder ? ` (${f.placeholder})` : ''}`}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          ))}
          <button className="btn primary sm" disabled={busy || def.fields.some((f) => !values[f.name]?.trim())} onClick={() => void save()}>
            💾 {t('save')}
          </button>
        </div>
      )}
    </div>
  );
}
