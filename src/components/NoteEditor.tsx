import { useState } from 'react';
import type { Note, Scope } from '../types';
import { useStore, useT, useTeam, type NoteInput } from '../store';
import { NOTE_COLORS } from '../../shared/constants';
import { Window } from './ui';

export function NoteEditor({ z, onClose, noteId, preset }: { z: number; onClose: () => void; noteId?: string; preset?: Partial<Note> }) {
  const t = useT();
  const team = useTeam();
  const tasks = useStore((s) => s.tasks);
  const me = useStore((s) => s.user!);
  const existing = useStore((s) => s.notes.find((n) => n.id === noteId));
  const { addNote, updateNote, deleteNote, openModal } = useStore.getState();

  const init = existing ?? preset ?? {};
  const [text, setText] = useState(init.text ?? '');
  const [scope, setScope] = useState<Scope>(init.scope ?? (init.to && team.teamAgents.some((a) => a.id === init.to) ? 'shared' : 'personal'));
  const [to, setTo] = useState(init.to ?? 'all');
  const [taskId, setTaskId] = useState(init.taskId ?? '');
  const [color, setColor] = useState(init.color ?? 0);
  const [busy, setBusy] = useState(false);

  const canEdit = !existing || existing.createdBy === me.id || me.role === 'Admin';
  const linkedTask = tasks.find((x) => x.id === taskId);
  // A note about a task takes that task's scope.
  const effectiveScope: Scope = linkedTask ? linkedTask.scope : scope;
  const recipientsOk = to === 'all' || team.agents.some((a) => a.id === to) || (effectiveScope === 'shared' && team.teamAgents.some((a) => a.id === to));

  const save = async () => {
    if (!text.trim() || !canEdit) return;
    const data: NoteInput = { text: text.trim(), to: recipientsOk ? to : 'all', taskId: taskId || null, color, scope: effectiveScope };
    setBusy(true);
    try {
      if (existing) await updateNote(existing.id, data);
      else await addNote(data);
      onClose();
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };

  const taskOptions = tasks.filter((x) => (x.column !== 'done' || x.id === taskId) && (x.scope === 'shared' || x.ownerId === me.id));

  return (
    <Window
      z={z}
      width={480}
      title={existing ? `✏️ ${t('editNoteTitle')}` : `📝 ${t('newNoteTitle')}`}
      onClose={onClose}
      footer={
        <>
          {existing && canEdit && (
            <div className="left">
              <button
                className="btn danger"
                onClick={() =>
                  openModal({
                    kind: 'confirm', danger: true, message: t('deleteNoteConfirm'),
                    onYes: () => void deleteNote(existing.id).then(onClose, () => {}),
                  })
                }
              >
                🗑 {t('delete')}
              </button>
            </div>
          )}
          <button className="btn" onClick={onClose}>{canEdit ? t('cancel') : t('close')}</button>
          {canEdit && <button className="btn primary" disabled={!text.trim() || busy} onClick={() => void save()}>📌 {t('save')}</button>}
        </>
      }
    >
      {existing && existing.createdBy !== me.id && <p className="hint">✍ {existing.createdByName}</p>}
      <div className="field">
        <span className="field-label">{t('scope')}</span>
        <span className="seg">
          {(['personal', 'shared'] as Scope[]).map((s) => (
            <button key={s} className={`btn sm ${effectiveScope === s ? 'on' : ''}`} disabled={!!linkedTask || !canEdit} onClick={() => setScope(s)}>
              {s === 'personal' ? `🔒 ${t('scope_personal')}` : `👥 ${t('scope_shared')}`}
            </button>
          ))}
        </span>
        {linkedTask && <span className="hint">{t('noteScopeFromTask')}</span>}
      </div>
      <div className="field">
        <label htmlFor="note-to">{t('noteTo')}</label>
        <select id="note-to" className="select" value={recipientsOk ? to : 'all'} disabled={!canEdit} onChange={(e) => setTo(e.target.value)}>
          <option value="all">👥 {effectiveScope === 'shared' ? t('everyoneTeam') : t('everyone')}</option>
          <optgroup label={t('myAgents')}>
            {team.agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </optgroup>
          {effectiveScope === 'shared' && team.teamAgents.length > 0 && (
            <optgroup label={t('teamAgents')}>
              {team.teamAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.ownerName})</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="field">
        <label htmlFor="note-text">{t('noteText')}</label>
        <textarea id="note-text" className="textarea" value={text} maxLength={1000} autoFocus disabled={!canEdit} style={{ background: NOTE_COLORS[color] }} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="note-task">{t('linkTask')}</label>
        <select id="note-task" className="select" value={taskId} disabled={!canEdit} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">{t('none')}</option>
          {taskOptions.map((x) => (
            <option key={x.id} value={x.id}>{x.scope === 'shared' ? '👥 ' : ''}{x.title}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="field-label">{t('color')}</span>
        <div className="swatches">
          {NOTE_COLORS.map((c, i) => (
            <button key={c} className={`swatch ${color === i ? 'on' : ''}`} disabled={!canEdit} style={{ background: c }} onClick={() => setColor(i)} aria-label={c} />
          ))}
        </div>
      </div>
    </Window>
  );
}
