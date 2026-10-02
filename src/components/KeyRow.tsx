import { useState, type ReactNode } from 'react';
import { useStore, useT } from '../store';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import type { KeyProviderDef } from '../../shared/keys';
import type { ApiKeyStatus } from '../types';

/**
 * One provider's key: add/replace (encrypted on the server), test, remove.
 * `onSaved` runs after a save (AI settings uses it to fetch the provider's models); `children` go under the head.
 */
export function KeyRow({
  def,
  status,
  onChange,
  onSaved,
  defaults,
  children,
}: {
  def: KeyProviderDef;
  status?: ApiKeyStatus;
  onChange: (s: ApiKeyStatus) => void;
  onSaved?: () => void;
  /** Values the form starts with (e.g. Ollama's usual address). */
  defaults?: Record<string, string>;
  children?: ReactNode;
}) {
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
      onSaved?.();
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; error: string | null }>(`/keys/${def.id}/test`, { method: 'POST' });
      if (r.ok) toast.success(t('keys_testOk', { name: def.name }));
      else toast.error(t('keys_testFail', { name: def.name, error: r.error ?? '?' }));
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
  const toggle = () => {
    if (!open && defaults) setValues({ ...defaults, ...values });
    setOpen(!open);
  };

  return (
    <div className="key-row">
      <div className="key-head">
        <strong>{def.name}</strong>
        {status?.configured ? <span className="chip key-ok">✓ {status.hint}</span> : <span className="chip">{t('keys_notSet')}</span>}
        <span style={{ marginLeft: 'auto' }} className="row">
          <a href={def.url} target="_blank" rel="noreferrer" className="link hint">{t('keys_getOne')} ↗</a>
          {status?.configured && (
            <button className="btn sm" disabled={busy} onClick={() => void test()}>{busy ? t('keys_testing') : `🔌 ${t('keys_test')}`}</button>
          )}
          <button className="btn sm" onClick={toggle}>{status?.configured ? t('keys_replace') : t('keys_add')}</button>
          {status?.configured && (
            <button className="btn sm danger" disabled={busy} onClick={() => void remove()} aria-label={t('delete')}>🗑</button>
          )}
        </span>
      </div>
      {def.note && <div className="hint">{def.note[lang]}</div>}
      {open && (
        <form
          className="key-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {def.fields.map((f) => (
            <input
              key={f.name}
              className="input"
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              aria-label={f.label[lang]}
              placeholder={`${f.label[lang]}${f.placeholder ? ` (${f.placeholder})` : ''}`}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          ))}
          <button type="submit" className="btn primary sm" disabled={busy || def.fields.some((f) => !values[f.name]?.trim())}>
            💾 {t('save')}
          </button>
        </form>
      )}
      {children}
    </div>
  );
}
