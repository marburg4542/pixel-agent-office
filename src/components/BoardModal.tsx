import { useEffect, useState } from 'react';
import type { ColumnId, Note, Scope, Task } from '../types';
import { findAnyAgent, useStore, useT, useTeam } from '../store';
import { COLUMN_COLORS, PRIORITY_COLORS } from '../scene/office';
import { COLUMNS, NOTE_COLORS } from '../../shared/constants';
import { overallProgress } from '../data/board';
import { Avatar, Progress, ScopeBadge, Window } from './ui';
import { PixelIcon, type IconName } from './PixelIcon';
import { currentSteps, groupsOf, isStepDone } from '../../shared/pipeline';

type ScopeFilter = 'all' | Scope;

export function BoardModal({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const agents = useStore((s) => s.agents);
  const teamAgents = useStore((s) => s.teamAgents);
  const { openModal, moveTask } = useStore.getState();
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [filter, setFilter] = useState<string>('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<ColumnId | null>(null);
  const [docked, setDocked] = useState(() => {
    try {
      return localStorage.getItem('pao.boardDocked') !== '0';
    } catch {
      return true;
    }
  });

  // Docked: the office shrinks to the left so agents stay visible while you manage tasks.
  useEffect(() => {
    try {
      localStorage.setItem('pao.boardDocked', docked ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!docked) return;
    document.body.classList.add('board-docked');
    return () => document.body.classList.remove('board-docked');
  }, [docked]);

  const inScope = <T extends { scope: Scope }>(x: T) => scope === 'all' || x.scope === scope;
  const visible = tasks.filter(inScope).filter((x) => !filter || x.pipeline.includes(filter));
  const visibleNotes = notes.filter(inScope).filter((n) => !filter || n.to === filter || n.to === 'all');
  const counts = { all: tasks.length, personal: tasks.filter((x) => x.scope === 'personal').length, shared: tasks.filter((x) => x.scope === 'shared').length };

  return (
    <Window
      z={z}
      title={<><PixelIcon name="board" /> {t('board')}</>}
      onClose={onClose}
      className={`board-window ${docked ? 'docked' : ''}`}
      bodyClassName="board-body"
      variant={docked ? 'drawer' : 'modal'}
      actions={
        <button className="btn dark sm" onClick={() => setDocked(!docked)} title={docked ? t('boardExpand') : t('boardDock')}>
          {docked ? `⛶ ${t('boardExpand')}` : `⇥ ${t('boardDock')}`}
        </button>
      }
    >
      <div className="board-toolbar">
        <button className="btn primary" onClick={() => openModal({ kind: 'taskEdit', preset: scope === 'shared' ? { scope: 'shared' } : undefined })}>＋ {t('newTask')}</button>
        <button className="btn warn" onClick={() => openModal({ kind: 'noteEdit', preset: scope === 'shared' ? { scope: 'shared' } : undefined })}>📝 {t('newNote')}</button>
        <span className="seg" role="tablist">
          {(['all', 'personal', 'shared'] as ScopeFilter[]).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} className={`btn sm ${scope === s ? 'on' : ''}`} onClick={() => setScope(s)}>
              {s === 'all' ? t('filterAllTasks') : s === 'personal' ? `🔒 ${t('scope_personal')}` : `👥 ${t('scope_shared')}`} ({counts[s]})
            </button>
          ))}
        </span>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="filter">
          <option value="">👤 {t('filterAll')}</option>
          <optgroup label={t('myAgents')}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </optgroup>
          {teamAgents.length > 0 && (
            <optgroup label={t('teamAgents')}>
              {teamAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.ownerName})</option>
              ))}
            </optgroup>
          )}
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
                if (id) void moveTask(id, col);
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
              {(col === 'backlog' || col === 'todo') && <QuickAdd column={col} scope={scope === 'shared' ? 'shared' : 'personal'} />}
            </div>
          );
        })}
        <NotesColumn notes={visibleNotes} tasks={tasks} />
      </div>
    </Window>
  );
}

/** Type a title + Enter at the bottom of a column to add a card there (assign agents later). */
function QuickAdd({ column, scope }: { column: ColumnId; scope: Scope }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await useStore.getState().addTask({ title: title.trim(), column, scope });
      setTitle('');
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="quick-add">
      <input
        className="input"
        placeholder={`＋ ${t('quickAdd')}`}
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
        aria-label={t('quickAdd')}
      />
    </div>
  );
}

export function PipelineView({ task, size = 26 }: { task: Task; size?: number }) {
  const s = useTeam();
  // Parallel groups stack vertically between the arrows.
  return (
    <div className="pipeline">
      {groupsOf(task).map((group, g) => (
        <span key={group.join('-')} style={{ display: 'contents' }}>
          {g > 0 && <span className="pipe-arrow">▶</span>}
          <span className={group.length > 1 ? 'pipe-group' : 'pipe-single'}>
            {group.map((i) => {
              const id = task.pipeline[i];
              const a = findAnyAgent(s, id);
              const state = isStepDone(task, i) || task.stage >= task.pipeline.length ? 'done' : currentSteps(task).includes(i) && task.column !== 'done' ? 'current' : '';
              const title = a ? (a.mine ? a.name : `${a.name} · ${a.ownerName}`) : '?';
              return (
                <span key={`${id}-${i}`} className={`pipe-step ${state} ${a && !a.mine ? 'team' : ''}`} style={{ width: size, height: size + 2 }} title={title}>
                  {a ? <Avatar look={a.look} size={size - 4} /> : '?'}
                  {state === 'done' && <span className="check">✓</span>}
                </span>
              );
            })}
          </span>
        </span>
      ))}
    </div>
  );
}

function TaskCard(props: {
  task: Task;
  notes: Note[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const { task } = props;
  const me = useStore((s) => s.user?.id);
  const current = findAnyAgent(useTeam(), task.pipeline[task.stage]);
  const noteCount = props.notes.filter((n) => n.taskId === task.id).length;

  // Status line: a pixel icon + text (icon is decorative, the text says it).
  let icon: IconName | null = null;
  let label = '';
  let warn = false;
  if (!task.pipeline.length) {
    [icon, label, warn] = ['blocked', t('unassigned'), true];
  } else if (task.column === 'done') [icon, label] = ['done', t('col_done')];
  else if (task.column === 'review') [icon, label] = ['review', t('colHint_review')];
  else if (task.question) [icon, label, warn] = ['question', t('qa_waiting', { agent: task.question.agentName }), true];
  else if (task.blocked && (task.column === 'todo' || task.column === 'doing')) {
    const kind = ['auth', 'quota', 'rate', 'network', 'refusal', 'model'].includes(task.blocked.kind) ? task.blocked.kind : 'other';
    [icon, label, warn] = ['blocked', `${t('blocked_short')}: ${t(`blocked_${kind}`)}`, true];
  } else if (current && task.active && currentSteps(task).length > 1) [icon, label] = ['gear', t('workingTogether', { n: task.groupActive?.length ?? 1, p: Math.floor(task.stageProgress) })];
  else if (current && task.active) [icon, label] = ['gear', t('workingOn', { name: current.name, p: Math.floor(task.stageProgress) })];
  else if (current && (task.column === 'todo' || task.column === 'doing')) [icon, label] = ['queued', t('queuedFor', { name: current.name })];
  const status = icon ? (
    <>
      <PixelIcon name={icon} /> {label}
    </>
  ) : null;

  return (
    <div
      className={`card ${props.dragging ? 'dragging' : ''} ${task.active ? 'active' : ''} ${task.scope === 'shared' ? 'shared' : ''} ${task.blocked ? 'blocked' : ''} ${task.question ? 'asking' : ''}`}
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
        {task.scope === 'shared' && <ScopeBadge scope="shared" />}
        {task.ownerId !== me && <span className="chip">👤 {task.ownerName}</span>}
        <span className="chip">{t(`prio_${task.priority}`)}</span>
        <span className="chip">{t(`size_${task.size}`)}</span>
        {noteCount > 0 && <span className="chip">📝 {noteCount}</span>}
        {task.outputs.length > 0 && <span className="chip">📄 {task.outputs.length}</span>}
      </div>
      <PipelineView task={task} />
      {task.pipeline.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Progress value={overallProgress(task)} thin color={task.column === 'done' ? '#3fae6a' : '#f0a030'} />
        </div>
      )}
      {status && <div className={`card-status ${warn ? 'warn' : ''}`}>{status}</div>}
    </div>
  );
}

function NotesColumn({ notes, tasks }: { notes: Note[]; tasks: Task[] }) {
  const t = useT();
  const openModal = useStore((st) => st.openModal);
  const s = useTeam();
  const agents = s.agents;
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
          const to = n.to === 'all' ? undefined : findAnyAgent(s, n.to);
          const task = tasks.find((x) => x.id === n.taskId);
          // Who should read it: one agent, or every agent this note is for among the ones I can see.
          const expected = n.to === 'all' ? (n.scope === 'shared' ? agents.length : agents.filter((a) => a.ownerId === n.createdBy).length) : 1;
          const readers = n.to === 'all' ? agents.filter((a) => n.readBy.includes(a.id)) : n.readBy.includes(n.to) && to ? [to] : [];
          return (
            <div
              key={n.id}
              className="sticky"
              style={{ background: NOTE_COLORS[n.color] ?? NOTE_COLORS[0], ['--rot' as string]: `${(i % 3) - 1}deg` }}
              onClick={() => openModal({ kind: 'noteEdit', noteId: n.id })}
            >
              <div className="sticky-to">
                → {to ? <><Avatar look={to.look} size={16} /> {to.name}</> : `👥 ${n.scope === 'shared' ? t('everyoneTeam') : t('everyone')}`}
                {n.scope === 'shared' && <span className="sticky-by">✍ {n.createdByName}</span>}
              </div>
              <div className="sticky-text">{n.text}</div>
              <div className="sticky-foot">
                {task && <span>📋 {task.title}</span>}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                  {expected > 0 && readers.length >= expected ? '✓✓' : `${readers.length}/${expected}`}
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
