import { useEffect, useRef, useState } from 'react';
import { useStore, useT, MAX_DESKS } from '../store';
import { SIM_SPEEDS } from '../../shared/constants';
import { api } from '../lib/api';
import { onServerEvent } from '../lib/events';
import type { PublicUser } from '../types';
import { UserAvatar } from './ui';
import { PixelIcon } from './PixelIcon';

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

type AiState = { kind: 'real' | 'sim' | 'mixed'; hint: string; tab: 'ai' | 'keys' };

/** Will my agents call real models? (AI on, a key for each agent's provider, budget left.) */
function useAiState(): AiState {
  const t = useT();
  const aiMode = useStore((s) => s.settings.aiMode);
  const budget = useStore((s) => s.settings.budgetUsd);
  const spent = useStore((s) => s.usage.costUsd);
  const keys = useStore((s) => s.keys);
  const agents = useStore((s) => s.agents);
  const models = useStore((s) => s.models);
  if (aiMode === 'sim') return { kind: 'sim', hint: t('aiHint_off'), tab: 'ai' };
  if (budget > 0 && spent >= budget) return { kind: 'sim', hint: t('aiHint_budget'), tab: 'ai' };
  const hasKey = (provider?: string) => keys.some((k) => k.provider === provider && k.configured);
  const simAgents = agents.filter((a) => !hasKey(models.find((m) => m.id === a.modelId)?.provider));
  if (!simAgents.length) return { kind: 'real', hint: t('aiHint_real'), tab: 'ai' };
  if (simAgents.length === agents.length) return { kind: 'sim', hint: t('aiHint_noKeys'), tab: 'keys' };
  return { kind: 'mixed', hint: t('aiHint_mixed', { names: simAgents.map((a) => a.name).join(', ') }), tab: 'keys' };
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
  const questions = useStore((s) => s.tasks.filter((x) => x.question).length);
  const { setLang, togglePause, setSpeed, openModal } = useStore.getState();
  const isAdmin = user?.role === 'Admin';
  const pending = usePendingCount(isAdmin);
  const ai = useAiState();
  const ref = useRef<HTMLElement>(null);

  // Drawers sit just under the bar, which wraps to two rows on narrow screens.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="topbar" ref={ref}>
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
        <span className="brand-name">{t('appTitle')}</span>
      </div>
      <button className={`ai-badge ai-${ai.kind}`} title={ai.hint} aria-label={`${t(`aiBadge_${ai.kind}`)} — ${ai.hint}`} onClick={() => openModal({ kind: 'settings', tab: ai.tab })}>
        {ai.kind === 'real' ? '⚡' : ai.kind === 'mixed' ? '◐' : '🎲'} {t(`aiBadge_${ai.kind}`)}
      </button>

      <div className="tb-group">
        <button className={`btn dark sm ${paused ? 'on' : ''}`} onClick={togglePause} title={paused ? t('play') : t('pause')}>
          <PixelIcon name={paused ? 'play' : 'pause'} /> <span className="tb-label">{paused ? t('play') : t('pause')}</span>
        </button>
        <span className="seg desktop-only" aria-label={t('speed')}>
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
            <PixelIcon name="review" /> <b>{review}</b> {t('col_review')}
          </button>
        )}
        {questions > 0 && (
          <button className="stat-link" onClick={() => openModal({ kind: 'board' })}>
            <PixelIcon name="question" /> <b>{questions}</b> {t('stats_questions')}
          </button>
        )}
      </div>

      <div className="spacer" />

      <div className="tb-group">
        <button className="btn warn sm" onClick={() => openModal({ kind: 'board' })} aria-label={t('board')}>
          <PixelIcon name="board" /> <span className="tb-label">{t('board')}</span>
        </button>
        <button className="btn sm" onClick={() => openModal({ kind: 'newsroom' })} aria-label={t('newsroom')}>
          <PixelIcon name="tv" /> <span className="tb-label">{t('newsroom')}</span>
        </button>
        <button className="btn sm" onClick={() => openModal({ kind: 'stats' })} aria-label={t('stats')}>
          <PixelIcon name="stats" /> <span className="tb-label">{t('stats')}</span>
        </button>
        <button className="btn sm" disabled={agents >= MAX_DESKS} title={agents >= MAX_DESKS ? t('officeFull') : ''} onClick={() => openModal({ kind: 'agentEdit' })}>
          <PixelIcon name="hire" /> <span className="tb-label">{t('hire')}</span>
        </button>
        <button className="btn sm desktop-only" onClick={() => openModal({ kind: 'models' })} aria-label={t('models')}>
          <PixelIcon name="chip" /> <span className="tb-label">{t('models')}</span>
        </button>
        {isAdmin && (
          <button className="btn sm" onClick={() => openModal({ kind: 'users' })} aria-label={t('users_admin')}>
            <PixelIcon name="crown" /> <span className="tb-label">{t('users_admin')}</span>
            {pending > 0 && <span className="badge">{pending}</span>}
          </button>
        )}
        <button className="btn dark sm sidebar-toggle" onClick={() => document.body.classList.toggle('show-sidebar')} aria-label={t('team')}>
          <PixelIcon name="team" />
        </button>
        <button className="btn dark sm icon" onClick={() => openModal({ kind: 'help' })} title={t('help')} aria-label={t('help')}>
          <PixelIcon name="help" />
        </button>
        <button className="btn dark sm" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} aria-label={t('language')}>
          <PixelIcon name="globe" /> <span className="tb-label">{t('language')}</span>
        </button>
        <button className="btn dark sm user-chip" onClick={() => openModal({ kind: 'settings' })} title={t('settings')}>
          {user && <UserAvatar user={user} size={20} />}
          <span className="user-name">{user?.username}</span> <PixelIcon name="gear" />
        </button>
        <button className="btn dark sm icon" onClick={onSignOut} title={t('logout')} aria-label={t('logout')}>
          <PixelIcon name="power" />
        </button>
      </div>
    </header>
  );
}
