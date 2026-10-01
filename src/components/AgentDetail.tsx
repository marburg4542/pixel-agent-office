import { useStore, useT } from '../store';
import { engine } from '../sim/engine';
import { roleById } from '../../shared/roles';
import { clockTime } from '../util';
import { ModelLabel, Progress, RoleLabel, Stars, useTicker, Window } from './ui';
import { SpritePreview } from './SpritePreview';

export function AgentDetail({ z, onClose, agentId }: { z: number; onClose: () => void; agentId: string }) {
  const t = useT();
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const tasks = useStore((s) => s.tasks);
  const { openModal, removeAgent } = useStore.getState();
  useTicker(250);

  if (!agent) return null;
  const rt = engine.agents.get(agent.id);
  const current = rt?.status === 'working' ? tasks.find((x) => x.id === rt.taskId) : undefined;
  const queue = engine.queueFor(agent.id);
  const unread = engine.unreadNotes(agent.id);
  const recent = tasks
    .flatMap((task) => task.outputs.filter((o) => o.agentId === agent.id).map((o) => ({ task, o })))
    .sort((a, b) => b.o.at - a.o.at)
    .slice(0, 4);
  const status = rt?.status ?? 'idle';

  return (
    <Window
      z={z}
      width={620}
      title={`${roleById(agent.role).icon} ${agent.name}`}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button
              className="btn danger"
              onClick={() =>
                openModal({
                  kind: 'confirm', danger: true, message: t('fireConfirm', { name: agent.name }),
                  onYes: () => void removeAgent(agent.id).then(onClose, () => {}),
                })
              }
            >
              👋 {t('fire')}
            </button>
          </div>
          <button className="btn" onClick={() => openModal({ kind: 'noteEdit', preset: { to: agent.id } })}>📝 {t('sendNote')}</button>
          <button className="btn warn" onClick={() => openModal({ kind: 'taskEdit', preset: { pipeline: [agent.id] } })}>📋 {t('assignTask')}</button>
          <button className="btn primary" onClick={() => openModal({ kind: 'agentEdit', agentId: agent.id })}>✏️ {t('edit')}</button>
        </>
      }
    >
      <div className="agent-head">
        <div className="agent-portrait">
          <SpritePreview look={agent.look} anim={status === 'working' ? 'work' : status === 'walking' ? 'walk' : 'idle'} scale={5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="agent-name">{agent.name}</div>
          <div><RoleLabel agent={agent} /></div>
          <div style={{ marginTop: 4 }}><ModelLabel modelId={agent.modelId} /></div>
          <div className="hint" style={{ marginTop: 4 }}>{t('desk')} #{agent.desk + 1} · {t(`st_${status}`)}</div>
          {agent.instructions && <div className="hint" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>“{agent.instructions}”</div>}
        </div>
      </div>

      <div className="section-title">⚙ {t('currentTask')}</div>
      <div className="list-box">
        {current && rt ? (
          <div className="li" onClick={() => openModal({ kind: 'task', taskId: current.id })}>
            <div style={{ fontWeight: 700 }}>{current.scope === 'shared' && '👥 '}{current.title}</div>
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}><Progress value={rt.progress} color={roleById(agent.role).color} /></div>
              <strong>{Math.floor(rt.progress)}%</strong>
            </div>
          </div>
        ) : (
          <div className="empty">{t(`st_${status}`)}</div>
        )}
      </div>

      <div className="section-title">📄 {t('queue')} <span className="hint">({queue.length})</span></div>
      <div className="list-box">
        {queue.length === 0 && <div className="empty">{t('queueEmpty')}</div>}
        {queue.map((x) => (
          <div key={x.id} className="li" onClick={() => openModal({ kind: 'task', taskId: x.id })}>
            {x.title} <span className="hint">· {t(`col_${x.column}`)} · {t(`prio_${x.priority}`)}</span>
          </div>
        ))}
      </div>

      {unread.length > 0 && (
        <>
          <div className="section-title">📩 {t('unreadNotes')}</div>
          <div className="list-box">
            {unread.map((n) => (
              <div key={n.id} className="li static">“{n.text}”</div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">🧾 {t('recentWork')}</div>
      <div className="list-box">
        {recent.length === 0 && <div className="empty">{t('noOutputs')}</div>}
        {recent.map(({ task, o }) => (
          <div key={`${task.id}-${o.at}`} className="li" onClick={() => openModal({ kind: 'task', taskId: task.id })}>
            <div className="row" style={{ gap: 8 }}>
              <strong style={{ flex: 1, minWidth: 0 }}>{task.title}</strong>
              <Stars value={o.score} />
              <span className="hint">{clockTime(o.at)}</span>
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}
