// Phone layout: under the office, what needs you (questions, reviews, stuck tasks), what's in
// progress, the news mood, and a quick way to start a task. Hidden on wider screens (CSS).
import { useState } from 'react';
import { findAnyAgent, useStore, useT, useTeam } from '../store';
import { Avatar, Progress } from './ui';
import { PixelIcon, type IconName } from './PixelIcon';
import { sentimentKey } from './ResearchView';
import { signed } from './charts';
import type { Task } from '../types';

export function MobileInbox() {
  const t = useT();
  const tasks = useStore((s) => s.tasks);
  const watchlists = useStore((s) => s.watchlists);
  const summaries = useStore((s) => s.watchSummaries);
  const openModal = useStore((s) => s.openModal);
  const team = useTeam();
  const [title, setTitle] = useState('');

  const needs: { task: Task; icon: IconName; text: string }[] = [];
  for (const task of tasks) {
    if (task.question) needs.push({ task, icon: 'question', text: t('qa_waiting', { agent: task.question.agentName }) });
    else if (task.column === 'review') needs.push({ task, icon: 'review', text: t('colHint_review') });
    else if (task.blocked && (task.column === 'todo' || task.column === 'doing')) needs.push({ task, icon: 'blocked', text: t('blocked_short') });
  }
  const working = tasks.filter((x) => x.active);

  const start = () => {
    if (!title.trim()) return;
    openModal({ kind: 'taskEdit', preset: { title: title.trim() } });
    setTitle('');
  };

  return (
    <section className="mobile-inbox" aria-label={t('mob_inbox')}>
      <form
        className="mob-quick"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="visually-hidden" htmlFor="mob-new">{t('newTask')}</label>
        <input id="mob-new" className="input" value={title} placeholder={t('mob_newPh')} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn primary" disabled={!title.trim()}>＋</button>
      </form>

      <h3 className="mob-h">
        <PixelIcon name="question" /> {t('mob_needsYou')} <span className="count">{needs.length}</span>
      </h3>
      {needs.length === 0 ? (
        <p className="hint">{t('mob_allClear')}</p>
      ) : (
        <ul className="mob-list">
          {needs.map(({ task, icon, text }) => (
            <li key={task.id}>
              <button className="mob-item" onClick={() => openModal({ kind: 'task', taskId: task.id })}>
                <PixelIcon name={icon} size={24} />
                <span className="mob-item-text">
                  <strong>{task.title}</strong>
                  <span className="hint">{text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {working.length > 0 && (
        <>
          <h3 className="mob-h">
            <PixelIcon name="gear" /> {t('mob_working')}
          </h3>
          <ul className="mob-list">
            {working.map((task) => {
              const a = findAnyAgent(team, task.pipeline[task.stage]);
              return (
                <li key={task.id}>
                  <button className="mob-item" onClick={() => openModal({ kind: 'task', taskId: task.id })}>
                    {a ? <Avatar look={a.look} size={28} /> : <PixelIcon name="gear" size={24} />}
                    <span className="mob-item-text">
                      <strong>{task.title}</strong>
                      <span className="hint">{a?.name} · {Math.floor(task.stageProgress)}%</span>
                      <Progress value={task.stageProgress} thin />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {watchlists.length > 0 && (
        <>
          <h3 className="mob-h">
            <PixelIcon name="tv" /> {t('newsroom')}
          </h3>
          <ul className="mob-list">
            {watchlists.map((w) => {
              const s = summaries.find((x) => x.watchlistId === w.id);
              return (
                <li key={w.id}>
                  <button className="mob-item" onClick={() => openModal({ kind: 'newsroom', watchlistId: w.id })}>
                    <span className="mob-item-text">
                      <strong>{w.name}</strong>
                      <span className="hint">{s ? `${signed(s.score)} · ${t(sentimentKey(s.score))}` : t('nr_noReportsShort')}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
