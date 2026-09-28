import { useState } from 'react';
import type { ColumnId, Priority, Size, Task } from '../types';
import { useStore, useT } from '../store';
import { roleById } from '../data/roles';
import { Avatar, Window } from './ui';

export function TaskEditor({ z, onClose, taskId, preset }: { z: number; onClose: () => void; taskId?: string; preset?: Partial<Task> }) {
  const t = useT();
  const agents = useStore((s) => s.agents);
  const models = useStore((s) => s.models);
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
  const [addId, setAddId] = useState('');
  const [error, setError] = useState('');

  const move = (i: number, d: number) => {
    const next = [...pipeline];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPipeline(next);
  };

  const save = () => {
    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }
    const data = { title: title.trim(), description: description.trim(), priority, size, pipeline, requireReview };
    if (existing) updateTask(existing.id, data);
    else addTask({ ...data, column });
    onClose();
  };

  const agentOption = (id: string) => {
    const a = agents.find((x) => x.id === id);
    if (!a) return '?';
    const m = models.find((x) => x.id === a.modelId);
    return `${roleById(a.role).icon} ${a.name} — ${a.role === 'custom' && a.roleLabel ? a.roleLabel : t(`role_${a.role}`)} · ${m?.name ?? a.modelId}`;
  };

  return (
    <Window
      z={z}
      width={620}
      title={existing ? `✏️ ${t('editTaskTitle')}` : `＋ ${t('newTaskTitle')}`}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <div className="left">
              <button
                className="btn danger"
                onClick={() =>
                  openModal({
                    kind: 'confirm', danger: true, message: t('deleteTaskConfirm'),
                    onYes: () => {
                      deleteTask(existing.id);
                      onClose();
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
          <button className="btn primary" onClick={save}>💾 {t('save')}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="task-title">{t('title')}</label>
        <input id="task-title" className="input" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
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
        <span className="hint">{t('pipelineHint')}</span>
        <div style={{ marginTop: 6 }}>
          {pipeline.map((id, i) => {
            const a = agents.find((x) => x.id === id);
            return (
              <div className="step-row" key={`${id}-${i}`}>
                <span className="step-num">{i + 1}</span>
                {a ? <Avatar look={a.look} size={28} /> : <span />}
                <select
                  className="select"
                  value={id}
                  onChange={(e) => setPipeline(pipeline.map((x, j) => (j === i ? e.target.value : x)))}
                >
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id}>{agentOption(ag.id)}</option>
                  ))}
                </select>
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
              {agents.map((a) => (
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
