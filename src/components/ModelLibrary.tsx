import { useState } from 'react';
import type { ProviderId } from '../types';
import { useStore, useT } from '../store';
import { PROVIDER_ORDER, PROVIDERS } from '../data/models';
import { ProviderDot, Window } from './ui';

export function ModelLibrary({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const models = useStore((s) => s.models);
  const agents = useStore((s) => s.agents);
  const { updateModel, deleteModel, addModel, resetModels, openModal } = useStore.getState();
  const [np, setNp] = useState<ProviderId>('openrouter');
  const [nName, setNName] = useState('');
  const [nApi, setNApi] = useState('');

  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || lo));
  const price = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v) || 0));

  return (
    <Window
      z={z}
      width={1000}
      title={`🧠 ${t('models')}`}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button className="btn" onClick={() => openModal({ kind: 'confirm', message: `${t('resetModels')}?`, onYes: resetModels })}>
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
              ...list.map((m) => {
                const used = agents.filter((a) => a.modelId === m.id).length;
                return (
                  <tr key={m.id}>
                    <td><input className="input" value={m.name} onChange={(e) => updateModel(m.id, { name: e.target.value })} aria-label={t('displayName')} /></td>
                    <td><input className="input" value={m.apiId} onChange={(e) => updateModel(m.id, { apiId: e.target.value })} aria-label={t('apiId')} /></td>
                    <td><input className="input num-in" type="number" min={1} max={5} value={m.speed} onChange={(e) => updateModel(m.id, { speed: num(e.target.value, 1, 5) })} aria-label={t('speedStat')} /></td>
                    <td><input className="input num-in" type="number" min={1} max={5} value={m.quality} onChange={(e) => updateModel(m.id, { quality: num(e.target.value, 1, 5) })} aria-label={t('qualityStat')} /></td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <input className="input num-in" type="number" min={0} step="0.1" value={m.priceIn ?? ''} onChange={(e) => updateModel(m.id, { priceIn: price(e.target.value) })} aria-label="price in" />
                        <input className="input num-in" type="number" min={0} step="0.1" value={m.priceOut ?? ''} onChange={(e) => updateModel(m.id, { priceOut: price(e.target.value) })} aria-label="price out" />
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {used > 0 && <span className="hint">{t('inUseBy', { n: used })} </span>}
                      <button className="btn sm danger icon" disabled={used > 0} title={used > 0 ? t('cannotDeleteInUse') : t('delete')} onClick={() => deleteModel(m.id)} aria-label={t('delete')}>
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              }),
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
          onClick={() => {
            addModel({ provider: np, name: nName.trim(), apiId: nApi.trim(), speed: 3, quality: 3 });
            setNName('');
            setNApi('');
          }}
        >
          ＋ {t('add')}
        </button>
      </div>
    </Window>
  );
}
