import { useState } from 'react';
import type { ColumnId, Priority, Scope, Size, Task } from '../types';
import { findAnyAgent, useStore, useT, useTeam } from '../store';
import { roleById } from '../../shared/roles';
import { Avatar, Window } from './ui';

export function TaskEditor({ z, onClose, taskId, preset }: { z: number; onClose: () => void; taskId?: string; preset?: Partial<Task> }) {
  const t = useT();
  const team = useTeam();
  const models = useStore((s) => s.models);
  const me = useStore((s) => s.user!);
  const existing = useStore((s) => s.tasks.find((x) => x.id === taskId));
  const { addTask, updateTask, openModal, deleteTask } = useStore.getState();

  const init = existing ?? preset ?? {};
  const [title, setTitle] = useState(init.title ?? '');
  const [description, setDescription] = useState(init.description ?? '');
  const [priority, setPriority] = useState<Priority>(init.priority ?? 'med');
  const [size, setSize] = useState<Size>(init.size ?? 'M');
  const [pipeline, setPipeline] = useState<string[]>(init.pipeline ?? []);
  const [requireReview, setRequireReview] = useState(init.requireReview ?? true);
  const [column, setColumn] = useState<ColumnId>(init.column ?? 'todo');
  const [scope, setScope] = useState<Scope>(init.scope ?? 'personal');
  const [addId, setAddId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = !existing || existing.ownerId === me.id;
  const canDelete = isOwner || (existing?.scope === 'shared' && me.role === 'Admin');
  const othersInPipeline = pipeline.some((id) => !team.agents.some((a) => a.id === id));

  const move = (i: number, d: number) => {
    const next = [...pipeline];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPipeline(next);
  };

  const save = async () => {
    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }
    if (scope === 'personal' && othersInPipeline) {
      setError(t('personalOwnOnly'));
      return;
    }
    const data = { title: title.trim(), description: description.trim(), priority, size, pipeline, requireReview, scope };
    setBusy(true);
    try {
      if (existing) await updateTask(existing.id, data);
      else await addTask({ ...data, column });
      onClose();
    } catch {
      /* server message already shown */
    } finally {
      setBusy(false);
    }
  };

  const agentOption = (id: string) => {
    const a = team.agents.find((x) => x.id === id);
    if (!a) return '?';
    const m = models.find((x) => x.id === a.modelId);
    return `${roleById(a.role).icon} ${a.name} — ${a.role === 'custom' && a.roleLabel ? a.roleLabel : t(`role_${a.role}`)} · ${m?.name ?? a.modelId}`;
  };

  return (
    <Window
      z={z}
      width={640}
      title={existing ? `✏️ ${t('editTaskTitle')}` : `＋ ${t('newTaskTitle')}`}
      onClose={onClose}
      footer={
        <>
          {existing && canDelete && (
            <div className="left">
              <button
                className="btn danger"
                onClick={() =>
                  openModal({
                    kind: 'confirm', danger: true, message: t('deleteTaskConfirm'),
                    onYes: () => {
                      void deleteTask(existing.id).then(onClose, () => {});
                    },
                  })
                }
              >
                🗑 {t('delete')}
              </button>
            </div>
          )}
          {error && <span className="error">{error}</span>}
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>💾 {t('save')}</button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">{t('scope')}</span>
        <span className="seg">
          {(['personal', 'shared'] as Scope[]).map((s) => (
            <button key={s} className={`btn sm ${scope === s ? 'on' : ''}`} disabled={!isOwner} onClick={() => setScope(s)}>
              {s === 'personal' ? `🔒 ${t('scope_personal')}` : `👥 ${t('scope_shared')}`}
            </button>
          ))}
        </span>
        <span className="hint">{scope === 'personal' ? t('scopeHint_personal') : t('scopeHint_shared')}</span>
      </div>
      <div className="field">
        <label htmlFor="task-title">{t('title')}</label>
        <input id="task-title" className="input" value={title} maxLength={120} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
      </div>
      <div className="field">
        <label htmlFor="task-desc">{t('description')}</label>
        <textarea id="task-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <span className="field-label">{t('priority')}</span>
          <span className="seg">
            {(['low', 'med', 'high'] as Priority[]).map((p) => (
              <button key={p} className={`btn sm ${priority === p ? 'on' : ''}`} onClick={() => setPriority(p)}>{t(`prio_${p}`)}</button>
            ))}
          </span>
        </div>
        <div className="field">
          <span className="field-label">{t('size')}</span>
          <span className="seg">
            {(['S', 'M', 'L'] as Size[]).map((p) => (
              <button key={p} className={`btn sm ${size === p ? 'on' : ''}`} onClick={() => setSize(p)}>{t(`size_${p}`)}</button>
            ))}
          </span>
        </div>
        {!existing && (
          <div className="field">
            <span className="field-label">{t('startIn')}</span>
            <span className="seg">
              {(['backlog', 'todo'] as ColumnId[]).map((c) => (
                <button key={c} className={`btn sm ${column === c ? 'on' : ''}`} onClick={() => setColumn(c)}>{t(`col_${c}`)}</button>
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">{t('pipeline')}</span>
        <span className="hint">{scope === 'shared' ? t('pipelineHintShared') : t('pipelineHint')}</span>
        <div style={{ marginTop: 6 }}>
          {pipeline.map((id, i) => {
            const a = findAnyAgent(team, id);
            const mine = a?.mine ?? false;
            return (
              <div className="step-row" key={`${id}-${i}`}>
                <span className="step-num">{i + 1}</span>
                {a ? <Avatar look={a.look} size={28} /> : <span />}
                {mine ? (
                  <select className="select" value={id} onChange={(e) => setPipeline(pipeline.map((x, j) => (j === i ? e.target.value : x)))}>
                    {team.agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>{agentOption(ag.id)}</option>
                    ))}
                  </select>
                ) : (
                  <div className="team-step">
                    {a ? `${a.name} — ${t(`role_${a.role}`)}` : '?'} <span className="chip">👤 {a && !a.mine ? a.ownerName : '?'}</span>
                  </div>
                )}
                <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                  <button className="btn sm icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="up">▲</button>
                  <button className="btn sm icon" onClick={() => move(i, 1)} disabled={i === pipeline.length - 1} aria-label="down">▼</button>
                  <button className="btn sm icon danger" onClick={() => setPipeline(pipeline.filter((_, j) => j !== i))} aria-label="remove">✕</button>
                </span>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 4 }}>
            <select className="select" style={{ flex: 1 }} value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">— {t('addStep')} —</option>
              {team.agents.map((a) => (
                <option key={a.id} value={a.id}>{agentOption(a.id)}</option>
              ))}
            </select>
            <button
              className="btn success"
              disabled={!addId}
              onClick={() => {
                setPipeline([...pipeline, addId]);
                setAddId('');
              }}
            >
              ＋ {t('addStep')}
            </button>
          </div>
        </div>
      </div>
      <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={requireReview} onChange={(e) => setRequireReview(e.target.checked)} />
        {t('requireReview')}
      </label>
    </Window>
  );
}
