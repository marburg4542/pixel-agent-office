import { useStore, useT, MAX_DESKS } from '../store';

const SPEEDS = [1, 2, 4, 8];

export function TopBar() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const paused = useStore((s) => s.paused);
  const speed = useStore((s) => s.simSpeed);
  const agents = useStore((s) => s.agents.length);
  const active = useStore((s) => s.tasks.filter((x) => x.column === 'doing' || x.column === 'todo').length);
  const done = useStore((s) => s.tasks.filter((x) => x.column === 'done').length);
  const { setLang, togglePause, setSpeed, openModal, resetWorkspace } = useStore.getState();

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-logo pixelated" viewBox="0 0 13 13" shapeRendering="crispEdges" aria-hidden>
          <rect width="13" height="13" fill="#3b3552" />
          <rect x="3" y="1" width="7" height="2" fill="#4a3024" />
          <rect x="3" y="3" width="7" height="4" fill="#f6c9a3" />
          <rect x="4" y="4" width="1" height="2" fill="#2a1e2e" />
          <rect x="8" y="4" width="1" height="2" fill="#2a1e2e" />
          <rect x="2" y="8" width="9" height="4" fill="#4f7cf0" />
          <rect x="9" y="7" width="4" height="3" fill="#c9ccd6" />
        </svg>
        {t('appTitle')}
      </div>
      <span className="sim-badge" title={t('simHint')}>{t('simBadge')}</span>

      <div className="tb-group">
        <button className={`btn dark sm ${paused ? 'on' : ''}`} onClick={togglePause} title={paused ? t('play') : t('pause')}>
          {paused ? '▶' : '❚❚'} {paused ? t('play') : t('pause')}
        </button>
        <span className="seg" aria-label={t('speed')}>
          {SPEEDS.map((n) => (
            <button key={n} className={`btn dark sm ${speed === n ? 'on' : ''}`} onClick={() => setSpeed(n)}>
              ×{n}
            </button>
          ))}
        </span>
      </div>

      <div className="tb-stats">
        <span>👥 <b>{agents}</b>/{MAX_DESKS}</span>
        <span>⏳ <b>{active}</b> {t('statsActive')}</span>
        <span>✅ <b>{done}</b> {t('statsDone')}</span>
      </div>

      <div className="spacer" />

      <div className="tb-group">
        <button className="btn warn sm" onClick={() => openModal({ kind: 'board' })}>📋 {t('board')}</button>
        <button className="btn sm" disabled={agents >= MAX_DESKS} title={agents >= MAX_DESKS ? t('officeFull') : ''} onClick={() => openModal({ kind: 'agentEdit' })}>
          ➕ {t('hire')}
        </button>
        <button className="btn sm" onClick={() => openModal({ kind: 'models' })}>🧠 {t('models')}</button>
        <button className="btn dark sm" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>🌐 {t('language')}</button>
        <button
          className="btn dark sm icon"
          title={t('resetWorkspace')}
          aria-label={t('resetWorkspace')}
          onClick={() => openModal({ kind: 'confirm', message: t('resetConfirm'), danger: true, onYes: resetWorkspace })}
        >
          ↺
        </button>
      </div>
    </header>
  );
}
