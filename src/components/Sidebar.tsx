import { useStore, useT } from '../store';
import { engine, type AgentStatus } from '../sim/engine';
import { roleById } from '../../shared/roles';
import { translate } from '../../shared/i18n';
import { timeAgo } from '../util';
import { Avatar, Progress, useTicker } from './ui';

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#8a7f9a',
  walking: '#3fa7c4',
  reading: '#9a6bd8',
  working: '#4fbf7a',
};

export function Sidebar() {
  return (
    <aside className="sidebar">
      <TeamPanel />
      <ActivityFeed />
    </aside>
  );
}

function TeamPanel() {
  const t = useT();
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const models = useStore((s) => s.models);
  const openModal = useStore((s) => s.openModal);
  useTicker(250);

  const sorted = [...agents].sort((a, b) => a.desk - b.desk);
  return (
    <section className="side-panel team">
      <h3>👥 {t('team')} <span className="hint" style={{ color: '#c9bfd9' }}>{agents.length}</span></h3>
      <div className="side-scroll">
        {sorted.map((a) => {
          const va = engine.agents.get(a.id);
          const status: AgentStatus = va?.status ?? 'idle';
          const task = va?.status === 'working' ? tasks.find((x) => x.id === va.taskId) : undefined;
          const queue = engine.queueFor(a.id).length;
          const unread = engine.unreadNotes(a.id).length;
          const model = models.find((m) => m.id === a.modelId);
          return (
            <div key={a.id} className="team-row" onClick={() => openModal({ kind: 'agent', agentId: a.id })}>
              <Avatar look={a.look} size={34} />
              <div style={{ minWidth: 0 }}>
                <div className="team-name">
                  {a.name}
                  <span style={{ fontSize: 12 }}>{roleById(a.role).icon}</span>
                  {unread > 0 && <span title={t('unreadNotes')}>📩</span>}
                  {queue > 0 && <span className="hint" style={{ color: '#c9bfd9', marginLeft: 'auto' }}>📄{queue}</span>}
                </div>
                <div className="team-meta">
                  <span className="status-dot" style={{ background: STATUS_COLOR[status] }} /> {t(`st_${status}`)} · {model?.name ?? a.modelId}
                </div>
                {task && va && (
                  <>
                    <div className="team-meta" title={task.title}>
                      {task.scope === 'shared' && '👥 '}
                      {task.title}
                    </div>
                    <Progress value={va.progress} color={roleById(a.role).color} thin />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityFeed() {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const feed = useStore((s) => s.feed);
  useTicker(10000);
  return (
    <section className="side-panel feed">
      <h3>📰 {t('activity')}</h3>
      <div className="side-scroll" aria-live="polite">
        {feed.length === 0 && <div className="feed-empty">…</div>}
        {feed.slice(0, 30).map((f) => (
          <div key={f.id} className="feed-item">
            <time>{timeAgo(f.at, lang)}</time>
            <span>{translate(lang, f.key, f.params)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
