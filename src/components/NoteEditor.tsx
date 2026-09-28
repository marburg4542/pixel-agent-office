import { useState } from 'react';
import type { Note } from '../types';
import { useStore, useT } from '../store';
import { NOTE_COLORS } from '../data/seed';
import { Window } from './ui';

export function NoteEditor({ z, onClose, noteId, preset }: { z: number; onClose: () => void; noteId?: string; preset?: Partial<Note> }) {
  const t = useT();
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const existing = useStore((s) => s.notes.find((n) => n.id === noteId));
  const { addNote, updateNote, deleteNote, openModal } = useStore.getState();

  const init = existing ?? preset ?? {};
  const [text, setText] = useState(init.text ?? '');
  const [to, setTo] = useState(init.to ?? 'all');
  const [taskId, setTaskId] = useState(init.taskId ?? '');
  const [color, setColor] = useState(init.color ?? 0);

  const save = () => {
    if (!text.trim()) return;
    const data = { text: text.trim(), to, taskId: taskId || undefined, color };
    if (existing) updateNote(existing.id, data);
    else addNote(data);
    onClose();
  };

  return (
    <Window
      z={z}
      width={460}
      title={existing ? `✏️ ${t('editNoteTitle')}` : `📝 ${t('newNoteTitle')}`}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <div className="left">
              <button
                className="btn danger"
                onClick={() =>
                  openModal({
                    kind: 'confirm', danger: true, message: t('deleteNoteConfirm'),
                    onYes: () => {
                      deleteNote(existing.id);
                      onClose();
                    },
                  })
                }
              >
                🗑 {t('delete')}
              </button>
            </div>
          )}
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={!text.trim()} onClick={save}>📌 {t('save')}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="note-to">{t('noteTo')}</label>
        <select id="note-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="all">👥 {t('everyone')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="note-text">{t('noteText')}</label>
        <textarea
          id="note-text"
          className="textarea"
          value={text}
          autoFocus
          style={{ background: NOTE_COLORS[color] }}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="note-task">{t('linkTask')}</label>
        <select id="note-task" className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">{t('none')}</option>
          {tasks
            .filter((x) => x.column !== 'done' || x.id === taskId)
            .map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
        </select>
      </div>
      <div className="field">
        <span className="field-label">{t('color')}</span>
        <div className="swatches">
          {NOTE_COLORS.map((c, i) => (
            <button key={c} className={`swatch ${color === i ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(i)} aria-label={c} />
          ))}
        </div>
      </div>
    </Window>
  );
}
