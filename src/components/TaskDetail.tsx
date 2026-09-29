import { useEffect, useState } from 'react';
import { findAnyAgent, useStore, useT, useTeam } from '../store';
import { engine } from '../sim/engine';
import { translate } from '../../shared/i18n';
import { NOTE_COLORS } from '../../shared/constants';
import { clockTime } from '../util';
import { COLUMN_COLORS, PRIORITY_COLORS } from '../scene/office';
import { overallProgress } from '../data/board';
import { play } from '../lib/sound';
import { PipelineView } from './BoardModal';
import { Avatar, ModelLabel, Progress, RoleLabel, ScopeBadge, Stars, Window } from './ui';

export function TaskDetail({ z, onClose, taskId }: { z: number; onClose: () => void; taskId: string }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const task = useStore((s) => s.tasks.find((x) => x.id === taskId));
  const me = useStore((s) => s.user!);
  const team = useTeam();
  const allNotes = useStore((s) => s.notes);
  const { openModal, approveTask, requestChanges, restartTask } = useStore.getState();
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [fbAgent, setFbAgent] = useState('');
  const [busy, setBusy] = useState(false);

  // Deleted while open (e.g. from the editor on top of us or by a teammate): close ourselves.
  useEffect(() => {
    if (!task) onClose();
  }, [task, onClose]);

  if (!task) return null;
  const notes = allNotes.filter((n) => n.taskId === taskId);
  const lastAgent = task.pipeline[task.pipeline.length - 1];

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* shown by api() */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      z={z}
      width={780}
      title={`📄 ${task.title}`}
      onClose={onClose}
      footer={
        <>
          <div className="left">
            <button className="btn" onClick={() => openModal({ kind: 'taskEdit', taskId })}>✏️ {t('edit')}</button>
            <button className="btn" disabled={busy} onClick={() => void act(() => restartTask(taskId))}>↺ {t('restart')}</button>
          </div>
          <button className="btn" onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="chip" style={{ background: COLUMN_COLORS[task.column], color: '#fff' }}>{t(`col_${task.column}`)}</span>
        <ScopeBadge scope={task.scope} />
        <span className="chip" style={{ background: PRIORITY_COLORS[task.priority] }}>{t('priority')}: {t(`prio_${task.priority}`)}</span>
        <span className="chip">{t('size')}: {t(`size_${task.size}`)}</span>
        {task.ownerId !== me.id && <span className="chip">👤 {task.ownerName}</span>}
        <span className="hint" style={{ marginLeft: 'auto' }}>{t('created')} {new Date(task.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</span>
      </div>
      {task.description && <p style={{ margin: '4px 0 12px', whiteSpace: 'pre-wrap' }}>{task.description}</p>}

      <div className="row" style={{ marginBottom: 6 }}>
        <PipelineView task={task} size={32} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="hint">{t('overall')} {Math.floor(overallProgress(task))}%</div>
          <Progress value={overallProgress(task)} color={task.column === 'done' ? '#3fae6a' : '#f0a030'} />
        </div>
      </div>

      {task.column === 'review' && (
        <div className="review-box">
          <div className="row">
            <strong>🔍 {t('colHint_review')}</strong>
            <span style={{ marginLeft: 'auto' }} />
            <button
              className="btn success"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await approveTask(taskId);
                  engine.cheer(task.pipeline);
                  play('approve');
                })
              }
            >
              ✔ {t('approve')}
            </button>
            <button
              className="btn warn"
              onClick={() => {
                setFbOpen(!fbOpen);
                setFbAgent(lastAgent ?? '');
              }}
            >
              ✎ {t('requestChanges')}
            </button>
          </div>
          {fbOpen && (
            <div style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="fb">{t('feedbackPrompt')}</label>
                <textarea id="fb" className="textarea" value={fbText} autoFocus onChange={(e) => setFbText(e.target.value)} />
              </div>
              <div className="row">
                <span className="field-label">{t('sendBackTo')}</span>
                <select className="select" style={{ width: 'auto' }} value={fbAgent} onChange={(e) => setFbAgent(e.target.value)}>
                  {task.pipeline.map((id, i) => (
                    <option key={`${id}-${i}`} value={id}>{i + 1}. {findAnyAgent(team, id)?.name ?? '?'}</option>
                  ))}
                </select>
                <button
                  className="btn primary"
                  disabled={!fbText.trim() || !fbAgent || busy}
                  onClick={() =>
                    void act(async () => {
                      await requestChanges(taskId, fbAgent, fbText.trim());
                      setFbOpen(false);
                      setFbText('');
                    })
                  }
                >
                  📨 {t('requestChanges')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section-title">🧾 {t('outputs')}</div>
      <div className="stage-list">
        {task.pipeline.length === 0 && <div className="hint">⚠ {t('unassigned')}</div>}
        {task.pipeline.map((id, i) => {
          const a = findAnyAgent(team, id);
          const out = [...task.outputs].reverse().find((o) => o.stage === i);
          const isCurrent = i === task.stage && task.column !== 'done';
          let state: string;
          if (i < task.stage || task.stage >= task.pipeline.length) state = '✅';
          else if (isCurrent && task.active) state = `⚙ ${Math.floor(task.stageProgress)}%`;
          else if (isCurrent) state = '⏳';
          else state = '·';
          return (
            <div className="stage-item" key={`${id}-${i}`}>
              <div className="stage-head">
                <strong>{t('stage')} {i + 1}</strong>
                {a && <Avatar look={a.look} size={30} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    {a?.name ?? '?'} {a && !a.mine && <span className="chip">👤 {a.ownerName}</span>}
                  </div>
                  {a && (
                    <div className="hint">
                      <RoleLabel agent={a} /> · {a.mine ? <ModelLabel modelId={a.modelId} /> : a.modelName}
                    </div>
                  )}
                </div>
                <span style={{ marginLeft: 'auto' }} className="row">
                  {out && <Stars value={out.score} />}
                  <strong>{state}</strong>
                </span>
              </div>
              {isCurrent && task.active && (
                <div style={{ padding: '6px 10px 0' }}>
                  <Progress value={task.stageProgress} thin />
                </div>
              )}
              {out ? (
                <div className="stage-out">
                  {out.text}
                  <div className="hint" style={{ marginTop: 6 }}>
                    — {out.modelName} · {clockTime(out.at)}
                    {out.simulated && <> · <em>{t('simulatedTag')}</em></>}
                  </div>
                </div>
              ) : (
                <div className="stage-out empty">{t('noOutputs')}</div>
              )}
            </div>
          );
        })}
      </div>

      {notes.length > 0 && (
        <>
          <div className="section-title">📝 {t('notesOnBoard')}</div>
          <div className="row" style={{ alignItems: 'stretch' }}>
            {notes.map((n) => {
              const to = n.to === 'all' ? undefined : findAnyAgent(team, n.to);
              return (
                <div
                  key={n.id}
                  className="sticky"
                  style={{ background: NOTE_COLORS[n.color] ?? NOTE_COLORS[0], width: 200 }}
                  onClick={() => openModal({ kind: 'noteEdit', noteId: n.id })}
                >
                  <div className="sticky-to">→ {to ? to.name : t('everyone')}</div>
                  <div className="sticky-text">{n.text}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">🕘 {t('activityLog')}</div>
      <div className="log-list">
        {[...task.log].reverse().map((l, i) => (
          <div key={i}>
            <time>{clockTime(l.at)}</time>
            {translate(lang, l.key, l.params)}
          </div>
        ))}
      </div>
    </Window>
  );
}
