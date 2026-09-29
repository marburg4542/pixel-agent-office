import { useEffect, useState } from 'react';
import { useStore, useT, MAX_DESKS } from '../store';
import { SIM_SPEEDS } from '../../shared/constants';
import { api } from '../lib/api';
import { onServerEvent } from '../lib/events';
import type { PublicUser } from '../types';
import { UserAvatar } from './ui';

/** Admins see how many sign-ups are waiting for approval. */
function usePendingCount(isAdmin: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    const load = () =>
      api<{ users: PublicUser[] }>('/users', { quiet: true })
        .then((d) => setCount(d.users.filter((u) => u.status === 'Pending').length))
        .catch(() => {});
    void load();
    return onServerEvent('users', load);
  }, [isAdmin]);
  return count;
}

export function TopBar({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  const user = useStore((s) => s.user);
  const lang = useStore((s) => s.settings.lang);
  const paused = useStore((s) => s.settings.paused);
  const speed = useStore((s) => s.settings.simSpeed);
  const agents = useStore((s) => s.agents.length);
  const doing = useStore((s) => s.tasks.filter((x) => x.column === 'doing').length);
  const waiting = useStore((s) => s.tasks.filter((x) => x.column === 'todo').length);
  const review = useStore((s) => s.tasks.filter((x) => x.column === 'review').length);
  const { setLang, togglePause, setSpeed, openModal } = useStore.getState();
  const isAdmin = user?.role === 'Admin';
  const pending = usePendingCount(isAdmin);

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
          {SIM_SPEEDS.map((n) => (
            <button key={n} className={`btn dark sm ${speed === n ? 'on' : ''}`} onClick={() => setSpeed(n)}>
              ×{n}
            </button>
          ))}
        </span>
      </div>

      <div className="tb-stats">
        <span title={t('team')}>👥 <b>{agents}</b>/{MAX_DESKS}</span>
        <span title={t('col_todo')}>⏳ <b>{waiting}</b> {t('col_todo')}</span>
        <span title={t('col_doing')}>⚙ <b>{doing}</b> {t('statsDoing')}</span>
        {review > 0 && (
          <button className="stat-link" onClick={() => openModal({ kind: 'board' })}>
            🔍 <b>{review}</b> {t('col_review')}
          </button>
        )}
      </div>

      <div className="spacer" />

      <div className="tb-group">
        <button className="btn warn sm" onClick={() => openModal({ kind: 'board' })}>📋 {t('board')}</button>
        <button className="btn sm" disabled={agents >= MAX_DESKS} title={agents >= MAX_DESKS ? t('officeFull') : ''} onClick={() => openModal({ kind: 'agentEdit' })}>
          ➕ {t('hire')}
        </button>
        <button className="btn sm" onClick={() => openModal({ kind: 'models' })}>🧠 {t('models')}</button>
        {isAdmin && (
          <button className="btn sm" onClick={() => openModal({ kind: 'users' })}>
            👑 {t('users_admin')}
            {pending > 0 && <span className="badge">{pending}</span>}
          </button>
        )}
        <button className="btn dark sm" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>🌐 {t('language')}</button>
        <button className="btn dark sm user-chip" onClick={() => openModal({ kind: 'settings' })} title={t('settings')}>
          {user && <UserAvatar user={user} size={20} />}
          <span className="user-name">{user?.username}</span> ⚙
        </button>
        <button className="btn dark sm icon" onClick={onSignOut} title={t('logout')} aria-label={t('logout')}>
          ⏻
        </button>
      </div>
    </header>
  );
}
