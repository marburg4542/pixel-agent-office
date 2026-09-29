import { useMemo, useState } from 'react';
import type { Look, ModelDef, RoleId } from '../types';
import { useStore, useT, MAX_DESKS } from '../store';
import { ACCESSORIES, EYES, HAIR, TOPS, randomLook } from '../sprites/character';
import { CLOTH_COLORS, HAIR_COLORS, PANTS_COLORS, SKIN_TONES } from '../sprites/color';
import { PROVIDER_ORDER, PROVIDERS } from '../../shared/models';
import { ROLES, recommendedModels } from '../../shared/roles';
import { pick } from '../util';
import { play } from '../lib/sound';
import { Pips, ProviderDot, Window } from './ui';
import { SpritePreview, type PreviewAnim } from './SpritePreview';

const NAMES = ['Ada', 'Bit', 'Cleo', 'Dex', 'Echo', 'Finn', 'Gigi', 'Hex', 'Ivy', 'Juno', 'Kai', 'Luma', 'Milo', 'Nix', 'Orbit', 'Pip', 'Rex', 'Sol', 'Tux', 'Vega', 'Zed'];

export function AgentEditor({ z, onClose, agentId, desk }: { z: number; onClose: () => void; agentId?: string; desk?: number }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const agents = useStore((s) => s.agents);
  const models = useStore((s) => s.models);
  const existing = agents.find((a) => a.id === agentId);
  const { addAgent, updateAgent } = useStore.getState();

  const freeDesks = Array.from({ length: MAX_DESKS }, (_, i) => i).filter(
    (i) => i === existing?.desk || !agents.some((a) => a.desk === i),
  );
  const takenNames = new Set(agents.map((a) => a.name));

  const [tab, setTab] = useState<'look' | 'job'>(existing ? 'job' : 'look');
  const [look, setLook] = useState<Look>(existing?.look ?? randomLook());
  const [name, setName] = useState(existing?.name ?? pick(NAMES.filter((n) => !takenNames.has(n))) ?? 'Agent');
  const [role, setRole] = useState<RoleId>(existing?.role ?? 'coder');
  const [roleLabel, setRoleLabel] = useState(existing?.roleLabel ?? '');
  const [modelId, setModelId] = useState(existing?.modelId ?? recommendedModels(models, 'coder')[0] ?? models[0]?.id ?? '');
  // New hires follow the role's recommended model until a model is picked by hand.
  const [modelTouched, setModelTouched] = useState(!!existing);
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [deskIdx, setDeskIdx] = useState(existing?.desk ?? desk ?? freeDesks[0] ?? 0);
  const [view, setView] = useState<'front' | 'back'>('front');
  const [anim, setAnim] = useState<PreviewAnim>('idle');
  const [error, setError] = useState('');

  const rec = useMemo(() => recommendedModels(models, role), [models, role]);
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setLook((l) => ({ ...l, [k]: v }));

  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) {
      setError(t('nameRequired'));
      setTab('job');
      return;
    }
    const data = { name: name.trim(), role, roleLabel: role === 'custom' ? roleLabel.trim() : undefined, modelId, instructions, look, desk: deskIdx };
    setBusy(true);
    try {
      if (existing) await updateAgent(existing.id, data);
      else {
        await addAgent(data);
        play('hire');
      }
      onClose();
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };

  const L = (x: { th: string; en: string }) => x[lang];

  return (
    <Window
      z={z}
      width={880}
      title={existing ? `✏️ ${t('editAgentTitle')} — ${existing.name}` : `🧑‍💻 ${t('hireTitle')}`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="error">{error}</span>}
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={() => void save()}>{existing ? `💾 ${t('save')}` : `🤝 ${t('hire')}`}</button>
        </>
      }
    >
      <div className="creator">
        <div>
          <div className="preview-box">
            <SpritePreview look={look} view={view} anim={anim} scale={9} />
          </div>
          <div className="preview-controls">
            <span className="seg">
              <button className={`btn sm ${view === 'front' ? 'on' : ''}`} onClick={() => setView('front')}>{t('viewFront')}</button>
              <button className={`btn sm ${view === 'back' ? 'on' : ''}`} onClick={() => setView('back')}>{t('viewBack')}</button>
            </span>
            <span className="seg">
              {(['idle', 'work', 'walk'] as PreviewAnim[]).map((a) => (
                <button key={a} className={`btn sm ${anim === a ? 'on' : ''}`} onClick={() => setAnim(a)}>
                  {t(a === 'idle' ? 'animIdle' : a === 'work' ? 'animWork' : 'animWalk')}
                </button>
              ))}
            </span>
            <button className="btn sm warn" onClick={() => setLook(randomLook())}>🎲 {t('randomize')}</button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontWeight: 700, fontSize: 18 }}>{name || '…'}</div>
        </div>

        <div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'look'} className={`tab ${tab === 'look' ? 'on' : ''}`} onClick={() => setTab('look')}>🎨 {t('look')}</button>
            <button role="tab" aria-selected={tab === 'job'} className={`tab ${tab === 'job' ? 'on' : ''}`} onClick={() => setTab('job')}>💼 {t('job')}</button>
          </div>

          {tab === 'look' ? (
            <div>
              <SwatchRow label={t('skin')} colors={SKIN_TONES} value={look.skin} onChange={(v) => set('skin', v)} />
              <StepRow label={t('hairStyle')} options={HAIR.map((h) => L(h.label))} value={look.hair} onChange={(v) => set('hair', v)} />
              <SwatchRow label={t('hairColor')} colors={HAIR_COLORS} value={look.hairColor} onChange={(v) => set('hairColor', v)} />
              <StepRow label={t('eyes')} options={EYES.map((e) => L(e.label))} value={look.eyes} onChange={(v) => set('eyes', v)} />
              <StepRow label={t('top')} options={TOPS.map((x) => L(x.label))} value={look.top} onChange={(v) => set('top', v)} />
              <SwatchRow label={t('topColor')} colors={CLOTH_COLORS} value={look.topColor} onChange={(v) => set('topColor', v)} />
              <SwatchRow label={t('bottomColor')} colors={PANTS_COLORS} value={look.bottomColor} onChange={(v) => set('bottomColor', v)} />
              <StepRow label={t('accessory')} options={ACCESSORIES.map((x) => L(x.label))} value={look.acc} onChange={(v) => set('acc', v)} />
              <SwatchRow label={t('accentColor')} colors={CLOTH_COLORS} value={look.accColor} onChange={(v) => set('accColor', v)} />
            </div>
          ) : (
            <div>
              <div className="row">
                <div className="field">
                  <label htmlFor="ag-name">{t('name')}</label>
                  <input id="ag-name" className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field" style={{ maxWidth: 140 }}>
                  <label htmlFor="ag-desk">{t('desk')}</label>
                  <select id="ag-desk" className="select" value={deskIdx} onChange={(e) => setDeskIdx(Number(e.target.value))}>
                    {freeDesks.map((i) => (
                      <option key={i} value={i}>#{i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <span className="field-label">{t('role')}</span>
                <div className="role-grid">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      className={`role-btn ${role === r.id ? 'on' : ''}`}
                      onClick={() => {
                        setRole(r.id);
                        if (!modelTouched) setModelId(recommendedModels(models, r.id)[0] ?? modelId);
                      }}
                    >
                      <span className="ico">{r.icon}</span>
                      {t(`role_${r.id}`)}
                    </button>
                  ))}
                </div>
                {role === 'custom' && (
                  <input className="input" style={{ marginTop: 6 }} placeholder={t('customRole')} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
                )}
              </div>
              <div className="field">
                <span className="field-label">{t('model')}</span>
                <ModelPicker
                  models={models}
                  value={modelId}
                  recommended={rec}
                  onChange={(id) => {
                    setModelId(id);
                    setModelTouched(true);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="ag-inst">{t('instructions')}</label>
                <textarea id="ag-inst" className="textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                <span className="hint">{t('instructionsHint')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Window>
  );
}

function StepRow({ label, options, value, onChange }: { label: string; options: string[]; value: number; onChange: (v: number) => void }) {
  const n = options.length;
  return (
    <div className="opt-row">
      <label>{label}</label>
      <span className="stepper">
        <button className="btn sm" onClick={() => onChange((value - 1 + n) % n)} aria-label="previous">◀</button>
        <span className="val">{options[value]}</span>
        <button className="btn sm" onClick={() => onChange((value + 1) % n)} aria-label="next">▶</button>
      </span>
    </div>
  );
}

function SwatchRow({ label, colors, value, onChange }: { label: string; colors: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="opt-row">
      <label>{label}</label>
      <div className="swatches">
        {colors.map((c, i) => (
          <button key={c + i} className={`swatch ${value === i ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(i)} aria-label={c} />
        ))}
      </div>
    </div>
  );
}

export function ModelPicker({ models, value, recommended, onChange }: { models: ModelDef[]; value: string; recommended: string[]; onChange: (id: string) => void }) {
  const t = useT();
  return (
    <div className="model-list">
      {PROVIDER_ORDER.map((p) => {
        const list = models.filter((m) => m.provider === p);
        if (!list.length) return null;
        return (
          <div key={p}>
            <div className="model-group"><ProviderDot provider={p} /> {PROVIDERS[p].name}</div>
            {list.map((m) => (
              <div key={m.id} className={`model-item ${value === m.id ? 'on' : ''}`} onClick={() => onChange(m.id)}>
                <div>
                  <div className="mname">
                    {m.name}
                    {recommended.includes(m.id) && <span className="rec">★ {t('recommended')}</span>}
                  </div>
                  <div className="mid">
                    {m.apiId}
                    {m.priceIn !== undefined && m.priceOut !== undefined && ` · $${m.priceIn} / $${m.priceOut}`}
                  </div>
                </div>
                <div className="stat">{t('speedStat')}<Pips value={m.speed} color="#3fa7c4" /></div>
                <div className="stat">{t('qualityStat')}<Pips value={m.quality} color="#9a6bd8" /></div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
