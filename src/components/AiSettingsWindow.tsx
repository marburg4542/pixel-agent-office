import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { tokenCount, usd } from '../util';
import { KEY_PROVIDERS, type KeyProviderDef } from '../../shared/keys';
import { guessModel } from '../../shared/models';
import { OLLAMA_CTX_OPTIONS, OLLAMA_DEFAULT_CTX } from '../../shared/constants';
import type { ApiKeyStatus, DiscoveredModel, ModelDef, ProviderId } from '../types';
import { KeyRow } from './KeyRow';
import { Window } from './ui';
import { PixelIcon } from './PixelIcon';

/** How many found models the picker lists at once (OpenRouter offers hundreds — search narrows it). */
const PICKER_LIMIT = 60;

/** 131072 → "131K", 1048576 → "1M". */
const ctxLabel = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

/** Everything about real AI in one place: on/off and budget, each provider's key, and which of its models agents can use. */
export function AiSettingsWindow({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const keys = useStore((s) => s.keys);
  const setKeys = useStore((s) => s.setKeys);
  const openModal = useStore((s) => s.openModal);
  const onChange = (s: ApiKeyStatus) => setKeys(keys.map((k) => (k.provider === s.provider ? s : k)));

  return (
    <Window
      z={z}
      width={860}
      title={<><PixelIcon name="chip" /> {t('aiSettings')}</>}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button className="btn" onClick={() => openModal({ kind: 'models' })}>
              <PixelIcon name="chip" /> {t('models')}
            </button>
          </div>
          <button className="btn primary" onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      <AiModeSection />
      <div className="section-title">🔑 {t('ais_providers')}</div>
      <p className="hint" style={{ marginTop: -4 }}>{t('ais_providersHint')} 🔐 {t('keys_hint')}</p>
      <div className="key-list">
        {KEY_PROVIDERS.filter((p) => p.group === 'ai').map((p) => (
          <ProviderCard key={p.id} def={p} status={keys.find((k) => k.provider === p.id)} onChange={onChange} />
        ))}
      </div>
    </Window>
  );
}

// ─── On/off, budget, this month's spending ───────────────────────────────────

function AiModeSection() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const usage = useStore((s) => s.usage);
  const refreshUsage = useStore((s) => s.refreshUsage);
  const [budget, setBudget] = useState(String(settings.budgetUsd || ''));
  useEffect(() => {
    void refreshUsage().catch(() => {});
  }, [refreshUsage]);

  const saveBudget = () => {
    const n = Math.max(0, Math.round((Number(budget) || 0) * 100) / 100);
    setBudget(n ? String(n) : '');
    if (n !== settings.budgetUsd) void updateSettings({ budgetUsd: n });
  };
  const real = settings.aiMode === 'auto';

  return (
    <div>
      <div className="ais-top">
        <div className="field">
          <label>🤖 {t('set_aiMode')}</label>
          <span className="row">
            <button className={`btn ${real ? 'primary' : ''}`} aria-pressed={real} onClick={() => void updateSettings({ aiMode: 'auto' })}>⚡ {t('on')}</button>
            <button className={`btn ${!real ? 'primary' : ''}`} aria-pressed={!real} onClick={() => void updateSettings({ aiMode: 'sim' })}>🎲 {t('off')}</button>
          </span>
          <div className="hint">{t('set_aiModeHint')}</div>
        </div>
        <div className="field">
          <label htmlFor="budget">💰 {t('set_budget')}</label>
          <input
            id="budget"
            className="input"
            style={{ maxWidth: 160 }}
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            placeholder="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onBlur={saveBudget}
            onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
          />
          <div className="hint">{t('set_budgetHint')}</div>
        </div>
      </div>

      <details className="ais-usage">
        <summary>
          📊 {t('set_usage')} {usage.month && <span className="hint">({usage.month})</span>} — <strong>{usd(usage.costUsd)}</strong>
          {settings.budgetUsd > 0 && <span className="hint"> / {usd(settings.budgetUsd)}</span>}
        </summary>
        {settings.budgetUsd > 0 && (
          <div className="budget-bar" title={t('set_budgetLeft', { left: usd(Math.max(0, settings.budgetUsd - usage.costUsd)), budget: usd(settings.budgetUsd) })}>
            <div className={`budget-fill ${usage.costUsd >= settings.budgetUsd ? 'over' : ''}`} style={{ width: `${Math.min(100, (usage.costUsd / settings.budgetUsd) * 100)}%` }} />
            <span>{t('set_budgetLeft', { left: usd(Math.max(0, settings.budgetUsd - usage.costUsd)), budget: usd(settings.budgetUsd) })}</span>
          </div>
        )}
        {usage.calls === 0 ? (
          <p className="hint">{t('set_usageEmpty')}</p>
        ) : (
          <table className="usage-table">
            <tbody>
              {usage.byModel.map((m) => (
                <tr key={m.modelId}>
                  <td>{m.modelName}</td>
                  <td className="num">{t('set_usageCalls', { n: m.calls })}</td>
                  <td className="num hint">{tokenCount(m.tokensIn)} / {tokenCount(m.tokensOut)}</td>
                  <td className="num">{usd(m.costUsd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('set_usageTotal')}</td>
                <td className="num">{t('set_usageCalls', { n: usage.calls })}</td>
                <td className="num hint">{tokenCount(usage.tokensIn)} / {tokenCount(usage.tokensOut)}</td>
                <td className="num"><strong>{usd(usage.costUsd)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="hint">{t('set_usageNote')}</p>
      </details>
    </div>
  );
}

/** "$3 / $15 per 1M tokens" (in / out); "free" when both are 0; "" when unknown. */
function usePrice() {
  const t = useT();
  return (pin?: number, pout?: number) => {
    if (pin === undefined || pout === undefined) return '';
    if (pin === 0 && pout === 0) return t('ais_free');
    return `$${+pin.toFixed(3)} / $${+pout.toFixed(3)} ${t('ais_perM')}`;
  };
}

// ─── One provider: key, the models in my library, and picking more ───────────

function ProviderCard({ def, status, onChange }: { def: KeyProviderDef; status?: ApiKeyStatus; onChange: (s: ApiKeyStatus) => void }) {
  const t = useT();
  const provider = def.id as ProviderId;
  const models = useStore((s) => s.models);
  const agents = useStore((s) => s.agents);
  const [found, setFound] = useState<DiscoveredModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const configured = Boolean(status?.configured);
  const local = provider === 'ollama';
  const mine = models.filter((m) => m.provider === provider);
  const users = agents.filter((a) => mine.some((m) => m.id === a.modelId));

  const discover = async (announce: boolean) => {
    setLoading(true);
    setError('');
    try {
      const list = await api<DiscoveredModel[]>(`/keys/${provider}/models`, { quiet: true });
      setFound(list);
      if (announce) toast.success(t('ais_found', { name: def.name, n: list.length }));
    } catch (e) {
      setFound(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const discoverRef = useRef(discover);
  discoverRef.current = discover;

  // Ollama runs next to the server, so look for its pulled models once when the page opens.
  useEffect(() => {
    if (local && configured) void discoverRef.current(false);
  }, [local, configured]);
  useEffect(() => {
    if (!configured) {
      setFound(null);
      setError('');
    }
  }, [configured]);

  return (
    <KeyRow
      def={def}
      status={status}
      onChange={onChange}
      onSaved={() => void discover(true)}
      defaults={local ? { baseUrl: 'http://localhost:11434' } : undefined}
    >
      <div className="hint ais-used">
        {users.length ? `👥 ${t('ais_usedBy', { names: users.map((a) => a.name).join(', ') })}` : t('ais_unused')}
        {users.length > 0 && !configured && <strong className="hint-bad"> · {t('ais_simNoKey')}</strong>}
      </div>
      {mine.length > 0 && (
        <ul className="ais-models">
          {mine.map((m) => (
            <LibraryModel key={m.id} model={m} used={agents.filter((a) => a.modelId === m.id).length} />
          ))}
        </ul>
      )}
      {configured && (
        <div className="row ais-actions">
          <button className="btn sm" disabled={loading} onClick={() => void discover(false)}>
            {loading ? t('ais_loading') : local ? `🔍 ${t('ais_detect')}` : `📋 ${t('ais_fetch')}`}
          </button>
          {found && !local && <button className="btn sm" onClick={() => setFound(null)}>✕ {t('ais_hide')}</button>}
        </div>
      )}
      {error && <div className="hint-bad ais-error">⚠ {error}</div>}
      {found && <ModelPicker provider={provider} found={found} have={mine} />}
    </KeyRow>
  );
}

/** A model already in my library: what it costs, and for Ollama how much context to ask for. */
function LibraryModel({ model, used }: { model: ModelDef; used: number }) {
  const t = useT();
  const { updateModel, deleteModel } = useStore.getState();
  const price = usePrice();
  const local = model.provider === 'ollama';
  const ctx = model.numCtx ?? OLLAMA_DEFAULT_CTX;
  const options = OLLAMA_CTX_OPTIONS.filter((n) => !model.contextWindow || n <= model.contextWindow || n === ctx);
  return (
    <li>
      <span className="ais-name">{model.name}</span>
      {model.name !== model.apiId && <code className="ais-id">{model.apiId}</code>}
      {!local && (model.priceIn === undefined || model.priceOut === undefined) ? (
        <span className="chip ais-warn" title={t('ais_noPriceHint')}>{t('ais_noPrice')}</span>
      ) : (
        !local && <span className="hint">{price(model.priceIn, model.priceOut)}</span>
      )}
      {local && (
        <label className="ais-ctx" title={t('ais_ctxHint')}>
          {t('ais_ctx')}
          <select className="select" value={ctx} onChange={(e) => void updateModel(model.id, { numCtx: Number(e.target.value) }).catch(() => {})}>
            {options.map((n) => (
              <option key={n} value={n}>{n >= 1024 ? `${n / 1024}K` : n}</option>
            ))}
          </select>
        </label>
      )}
      <span className="ais-right">
        {used > 0 && <span className="hint">{t('inUseBy', { n: used })} </span>}
        <button
          className="btn sm danger icon"
          disabled={used > 0}
          title={used > 0 ? t('cannotDeleteInUse') : t('delete')}
          aria-label={t('delete')}
          onClick={() => void deleteModel(model.id).catch(() => {})}
        >
          🗑
        </button>
      </span>
    </li>
  );
}

/** Models the provider offers: tick and add (no typing API IDs). Ones already in the library show as added. */
function ModelPicker({ provider, found, have }: { provider: ProviderId; found: DiscoveredModel[]; have: ModelDef[] }) {
  const t = useT();
  const addModel = useStore((s) => s.addModel);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const price = usePrice();
  const haveIds = new Set(have.map((m) => m.apiId));
  const needle = q.trim().toLowerCase();
  const matches = found.filter((d) => !needle || `${d.name} ${d.apiId}`.toLowerCase().includes(needle));
  const shown = matches.slice(0, PICKER_LIMIT);

  if (!found.length) {
    return <div className="ais-empty hint">{provider === 'ollama' ? <>{t('ais_ollamaEmpty')} <code>ollama pull qwen3:4b</code></> : t('ais_none')}</div>;
  }

  const add = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const apiId of picked) {
        const d = found.find((x) => x.apiId === apiId);
        if (!d || haveIds.has(apiId)) continue;
        await addModel(guessModel(provider, d));
        n++;
      }
      toast.success(t('ais_added', { n }));
      setPicked([]);
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };
  const toggle = (apiId: string) => setPicked(picked.includes(apiId) ? picked.filter((x) => x !== apiId) : [...picked, apiId]);

  return (
    <div className="ais-picker">
      <div className="row">
        {found.length > 8 && (
          <input className="input" style={{ flex: 1, width: 'auto' }} placeholder={`🔎 ${t('ais_search', { n: found.length })}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('ais_search', { n: found.length })} />
        )}
        <button className="btn success sm" disabled={busy || !picked.length} onClick={() => void add()}>
          ＋ {t('ais_addPicked', { n: picked.length })}
        </button>
      </div>
      <ul className="ais-found">
        {shown.map((d) => {
          const added = haveIds.has(d.apiId);
          const meta = [
            d.contextWindow ? `${ctxLabel(d.contextWindow)} context` : '',
            price(d.priceIn, d.priceOut),
            d.sizeGb ? `${d.sizeGb} GB` : '',
            d.note ?? '',
          ].filter(Boolean);
          return (
            <li key={d.apiId}>
              <label className={added ? 'added' : ''}>
                <input type="checkbox" checked={added || picked.includes(d.apiId)} disabled={added} onChange={() => toggle(d.apiId)} />
                <span className="ais-name">{d.name}</span>
                {d.name !== d.apiId && <code className="ais-id">{d.apiId}</code>}
                {added && <span className="chip key-ok">✓ {t('ais_inLibrary')}</span>}
                {meta.length > 0 && <span className="hint ais-meta">{meta.join(' · ')}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {matches.length > shown.length && <div className="hint">{t('ais_more', { n: matches.length - shown.length })}</div>}
      {!matches.length && <div className="hint">{t('ais_noMatch')}</div>}
    </div>
  );
}
