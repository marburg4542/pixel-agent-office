import { useEffect, useState } from 'react';
import type { ModelDef, ProviderId } from '../types';
import { useStore, useT, type ModelPatch } from '../store';
import { PROVIDER_ORDER, PROVIDERS } from '../../shared/models';
import { ProviderDot, Window } from './ui';
import { PixelIcon } from './PixelIcon';

export function ModelLibrary({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const models = useStore((s) => s.models);
  const agents = useStore((s) => s.agents);
  const { addModel, resetModels, openModal } = useStore.getState();
  const [np, setNp] = useState<ProviderId>('openrouter');
  const [nName, setNName] = useState('');
  const [nApi, setNApi] = useState('');

  return (
    <Window
      z={z}
      width={1000}
      title={<><PixelIcon name="chip" /> {t('models')}</>}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button className="btn" onClick={() => openModal({ kind: 'confirm', message: `${t('resetModels')}?`, onYes: () => void resetModels().catch(() => {}) })}>
              ↺ {t('resetModels')}
            </button>
          </div>
          <button className="btn primary" onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>{t('modelLibHint')}</p>
      <table className="mlib-table">
        <thead>
          <tr>
            <th>{t('displayName')}</th>
            <th>{t('apiId')}</th>
            <th>{t('speedStat')}</th>
            <th>{t('qualityStat')}</th>
            <th>{t('price')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {PROVIDER_ORDER.map((p) => {
            const list = models.filter((m) => m.provider === p);
            if (!list.length) return null;
            return [
              <tr key={p} className="mlib-provider">
                <td colSpan={6}><ProviderDot provider={p} /> {PROVIDERS[p].name}</td>
              </tr>,
              ...list.map((m) => <ModelRow key={m.id} model={m} used={agents.filter((a) => a.modelId === m.id).length} />),
            ];
          })}
        </tbody>
      </table>

      <div className="section-title">＋ {t('addModel')}</div>
      <div className="row">
        <select className="select" style={{ width: 170 }} value={np} onChange={(e) => setNp(e.target.value as ProviderId)} aria-label={t('provider')}>
          {PROVIDER_ORDER.map((p) => (
            <option key={p} value={p}>{PROVIDERS[p].name}</option>
          ))}
        </select>
        <input className="input" style={{ flex: 1, width: 'auto' }} placeholder={t('displayName')} value={nName} onChange={(e) => setNName(e.target.value)} />
        <input className="input" style={{ flex: 1, width: 'auto' }} placeholder={t('apiId')} value={nApi} onChange={(e) => setNApi(e.target.value)} />
        <button
          className="btn success"
          disabled={!nName.trim() || !nApi.trim()}
          onClick={() =>
            void addModel({ provider: np, name: nName.trim(), apiId: nApi.trim(), speed: 3, quality: 3 }).then(() => {
              setNName('');
              setNApi('');
            }, () => {})
          }
        >
          ＋ {t('add')}
        </button>
      </div>
    </Window>
  );
}

type Draft = { name: string; apiId: string; speed: string; quality: string; priceIn: string; priceOut: string };
const toDraft = (m: ModelDef): Draft => ({
  name: m.name,
  apiId: m.apiId,
  speed: String(m.speed),
  quality: String(m.quality),
  priceIn: m.priceIn === undefined ? '' : String(m.priceIn),
  priceOut: m.priceOut === undefined ? '' : String(m.priceOut),
});

/** One editable row: typing edits a local draft; leaving a field (or Enter) saves it. */
function ModelRow({ model, used }: { model: ModelDef; used: number }) {
  const t = useT();
  const { updateModel, deleteModel } = useStore.getState();
  const [d, setD] = useState<Draft>(() => toDraft(model));
  useEffect(() => setD(toDraft(model)), [model]);

  const commit = (field: keyof Draft) => {
    const v = d[field];
    const current = toDraft(model)[field];
    if (v === current) return;
    let patch: ModelPatch;
    if (field === 'priceIn' || field === 'priceOut') patch = { [field]: v.trim() === '' ? null : Number(v) };
    else if (field === 'speed' || field === 'quality') patch = { [field]: Number(v) };
    else patch = { [field]: v.trim() };
    updateModel(model.id, patch).catch(() => setD(toDraft(model)));
  };

  const input = (field: keyof Draft, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      className={`input ${props.type === 'number' ? 'num-in' : ''}`}
      value={d[field]}
      onChange={(e) => setD({ ...d, [field]: e.target.value })}
      onBlur={() => commit(field)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      {...props}
    />
  );

  return (
    <tr>
      <td>{input('name', { 'aria-label': t('displayName') })}</td>
      <td>{input('apiId', { 'aria-label': t('apiId') })}</td>
      <td>{input('speed', { type: 'number', min: 1, max: 5, 'aria-label': t('speedStat') })}</td>
      <td>{input('quality', { type: 'number', min: 1, max: 5, 'aria-label': t('qualityStat') })}</td>
      <td>
        <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          {input('priceIn', { type: 'number', min: 0, step: '0.1', 'aria-label': 'price in' })}
          {input('priceOut', { type: 'number', min: 0, step: '0.1', 'aria-label': 'price out' })}
        </span>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {used > 0 && <span className="hint">{t('inUseBy', { n: used })} </span>}
        <button
          className="btn sm danger icon"
          disabled={used > 0}
          title={used > 0 ? t('cannotDeleteInUse') : t('delete')}
          onClick={() => void deleteModel(model.id).catch(() => {})}
          aria-label={t('delete')}
        >
          🗑
        </button>
      </td>
    </tr>
  );
}
