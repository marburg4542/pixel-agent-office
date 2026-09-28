import { useState } from 'react';
import type { Agent, ColumnId, Note, Task } from '../types';
import { useStore, useT } from '../store';
import { COLUMN_COLORS, PRIORITY_COLORS } from '../scene/office';
import { NOTE_COLORS } from '../data/seed';
import { COLUMNS, overallProgress } from '../data/board';
import { Avatar, Progress, Window } from './ui';

export function BoardModal({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const notes = useStore((s) => s.notes);
  const { openModal, moveTask } = useStore.getState();
  const [filter, setFilter] = useState<string>('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<ColumnId | null>(null);

  const visible = filter ? tasks.filter((x) => x.pipeline.includes(filter)) : tasks;
  const visibleNotes = filter ? notes.filter((n) => n.to === filter || n.to === 'all') : notes;

  return (
    <Window z={z} title={`📋 ${t('board')}`} onClose={onClose} className="board-window" bodyClassName="board-body">
      <div className="board-toolbar">
        <button className="btn primary" onClick={() => openModal({ kind: 'taskEdit' })}>＋ {t('newTask')}</button>
        <button className="btn warn" onClick={() => openModal({ kind: 'noteEdit' })}>📝 {t('newNote')}</button>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="filter">
          <option value="">👥 {t('filterAll')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <span className="hint" style={{ marginLeft: 'auto' }}>{t('pipelineHint')}</span>
      </div>
      <div className="board-main">
        {COLUMNS.map((col) => {
          const list = visible.filter((x) => x.column === col).sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <div
              key={col}
              className={`column ${dropCol === col ? 'drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropCol(col);
              }}
              onDragLeave={() => setDropCol((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveTask(id, col);
                setDropCol(null);
                setDragId(null);
              }}
            >
              <div className="column-bar" style={{ background: COLUMN_COLORS[col] }} />
              <div className="column-head">
                <div className="name">
                  {t(`col_${col}`)}
                  <span className="count">{list.length}</span>
                </div>
                <div className="hint">{t(`colHint_${col}`)}</div>
              </div>
              <div className="column-cards">
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    agents={agents}
                    notes={notes}
                    dragging={dragId === task.id}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropCol(null);
                    }}
                    onOpen={() => openModal({ kind: 'task', taskId: task.id })}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <NotesColumn notes={visibleNotes} agents={agents} tasks={tasks} />
      </div>
    </Window>
  );
}

export function PipelineView({ task, agents, size = 26 }: { task: Task; agents: Agent[]; size?: number }) {
  return (
    <div className="pipeline">
      {task.pipeline.map((id, i) => {
        const a = agents.find((x) => x.id === id);
        const state = i < task.stage ? 'done' : i === task.stage && task.column !== 'done' ? 'current' : '';
        return (
          <span key={`${id}-${i}`} style={{ display: 'contents' }}>
            {i > 0 && <span className="pipe-arrow">▶</span>}
            <span className={`pipe-step ${state}`} style={{ width: size, height: size + 2 }} title={a?.name ?? '?'}>
              {a ? <Avatar look={a.look} size={size - 4} /> : '?'}
              {state === 'done' && <span className="check">✓</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function TaskCard(props: {
  task: Task;
  agents: Agent[];
  notes: Note[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const { task, agents } = props;
  const current = agents.find((a) => a.id === task.pipeline[task.stage]);
  const noteCount = props.notes.filter((n) => n.taskId === task.id).length;

  let status: React.ReactNode = null;
  let warn = false;
  if (!task.pipeline.length) {
    status = `⚠ ${t('unassigned')}`;
    warn = true;
  } else if (task.column === 'done') status = `✅ ${t('col_done')}`;
  else if (task.column === 'review') status = `🔍 ${t('colHint_review')}`;
  else if (current && task.active) status = `⚙ ${t('workingOn', { name: current.name, p: Math.floor(task.stageProgress) })}`;
  else if (current && (task.column === 'todo' || task.column === 'doing')) status = `⏳ ${t('queuedFor', { name: current.name })}`;

  return (
    <div
      className={`card ${props.dragging ? 'dragging' : ''} ${task.active ? 'active' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onClick={props.onOpen}
    >
      <span className="prio" style={{ background: PRIORITY_COLORS[task.priority] }} />
      <div className="card-title">{task.title}</div>
      <div className="card-chips">
        <span className="chip">{t(`prio_${task.priority}`)}</span>
        <span className="chip">{t(`size_${task.size}`)}</span>
        {noteCount > 0 && <span className="chip">📝 {noteCount}</span>}
        {task.outputs.length > 0 && <span className="chip">📄 {task.outputs.length}</span>}
      </div>
      <PipelineView task={task} agents={agents} />
      {task.pipeline.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Progress value={overallProgress(task)} thin color={task.column === 'done' ? '#3fae6a' : '#f0a030'} />
        </div>
      )}
      {status && <div className={`card-status ${warn ? 'warn' : ''}`}>{status}</div>}
    </div>
  );
}

function NotesColumn({ notes, agents, tasks }: { notes: Note[]; agents: Agent[]; tasks: Task[] }) {
  const t = useT();
  const openModal = useStore((s) => s.openModal);
  return (
    <div className="column notes-col">
      <div className="column-bar" style={{ background: '#f2c94c' }} />
      <div className="column-head">
        <div className="name">
          📝 {t('notesOnBoard')}
          <span className="count">{notes.length}</span>
        </div>
      </div>
      <div className="notes-list">
        {notes.length === 0 && <div className="hint" style={{ padding: 8 }}>{t('noNotes')}</div>}
        {[...notes].reverse().map((n, i) => {
          const to = agents.find((a) => a.id === n.to);
          const task = tasks.find((x) => x.id === n.taskId);
          const readers = agents.filter((a) => n.readBy.includes(a.id));
          const expected = n.to === 'all' ? agents.length : 1;
          return (
            <div
              key={n.id}
              className="sticky"
              style={{ background: NOTE_COLORS[n.color] ?? NOTE_COLORS[0], ['--rot' as string]: `${(i % 3) - 1}deg` }}
              onClick={() => openModal({ kind: 'noteEdit', noteId: n.id })}
            >
              <div className="sticky-to">
                → {to ? <><Avatar look={to.look} size={16} /> {to.name}</> : `👥 ${t('everyone')}`}
              </div>
              <div className="sticky-text">{n.text}</div>
              <div className="sticky-foot">
                {task && <span>📋 {task.title}</span>}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                  {readers.length >= expected ? '✓✓' : `${readers.length}/${expected}`}
                  {readers.slice(0, 5).map((a) => (
                    <Avatar key={a.id} look={a.look} size={14} />
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
