import { useState } from 'react';
import { useT } from '../store';
import { Window } from './ui';

const STEPS = [
  { art: '🏢', key: 'office' },
  { art: '📋', key: 'board' },
  { art: '📝', key: 'notes' },
  { art: '🔍', key: 'review' },
  { art: '👥', key: 'team' },
  { art: '⌨️', key: 'keys' },
] as const;

const SHORTCUTS: [string, string][] = [
  ['B', 'kb_board'],
  ['N', 'kb_newTask'],
  ['M', 'kb_note'],
  ['H', 'kb_hire'],
  ['S', 'kb_settings'],
  ['Space', 'kb_pause'],
  ['1–4', 'kb_speed'],
  ['?', 'kb_help'],
  ['Esc', 'kb_close'],
];

/** First-visit tour and help: a few short steps, then the keyboard shortcuts. */
export function HelpWindow({ z, onClose, step: initial = 0 }: { z: number; onClose: () => void; step?: number }) {
  const t = useT();
  const [step, setStep] = useState(initial);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <Window
      z={z}
      width={620}
      title={`❔ ${t('help')}`}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button className="btn" onClick={onClose}>{t('tour_skip')}</button>
          </div>
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>◀ {t('tour_back')}</button>
          <button className="btn primary" onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? `✔ ${t('tour_done')}` : `${t('tour_next')} ▶`}
          </button>
        </>
      }
    >
      <div className="tour-step">
        <div className="tour-art" aria-hidden>{s.art}</div>
        <div>
          <h3 style={{ margin: '0 0 8px' }}>{t(`tour_${s.key}_title`)}</h3>
          {s.key === 'keys' ? (
            <div className="kbd-list">
              {SHORTCUTS.map(([k, label]) => (
                <span key={k} style={{ display: 'contents' }}>
                  <kbd>{k}</kbd>
                  <span>{t(label)}</span>
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t(`tour_${s.key}_body`)}</p>
          )}
        </div>
      </div>
      <div className="tour-dots">
        {STEPS.map((x, i) => (
          <i key={x.key} className={i === step ? 'on' : ''} />
        ))}
      </div>
    </Window>
  );
}
