// Working together on a task: answering an agent's question, and the Model Arena for one step.
import { useState } from 'react';
import { useStore, useT } from '../store';
import { toast } from '../lib/toast';
import { usd, tokenCount } from '../util';
import type { Task } from '../types';
import { Markdown } from './Markdown';
import { ProviderDot } from './ui';

export function QuestionBox({ task }: { task: Task }) {
  const t = useT();
  const answerQuestion = useStore((s) => s.answerQuestion);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const q = task.question!;
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await answerQuestion(task.id, text.trim());
      setText('');
      toast.success(t('qa_sent', { agent: q.agentName }));
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="question-box" role="alert">
      <div>
        <strong>❓ {t('qa_asks', { agent: q.agentName, n: q.stage + 1 })}</strong>
      </div>
      <p className="question-text">{q.text}</p>
      <label className="visually-hidden" htmlFor="qa-answer">{t('qa_answer')}</label>
      <textarea
        id="qa-answer"
        className="textarea"
        value={text}
        placeholder={t('qa_placeholder')}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
        }}
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hint">{t('qa_hint')}</span>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void send()}>📨 {t('qa_send')}</button>
      </div>
    </div>
  );
}

export function QaHistory({ task }: { task: Task }) {
  const t = useT();
  if (!task.qa?.length) return null;
  return (
    <details className="qa-history">
      <summary>💬 {t('qa_history', { n: task.qa.length })}</summary>
      <ul>
        {task.qa.map((q) => (
          <li key={q.at}>
            <div><strong>{q.agentName}</strong> ({t('stage')} {q.stage + 1}): {q.question}</div>
            <div className="hint">↳ {q.by}: {q.answer}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Model Arena ─────────────────────────────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D'];

/** Pick 2–4 of your models to redo this step side by side. */
export function ArenaSetup({ task, stage, onDone }: { task: Task; stage: number; onDone: () => void }) {
  const t = useT();
  const models = useStore((s) => s.models);
  const keys = useStore((s) => s.keys);
  const aiMode = useStore((s) => s.settings.aiMode);
  const startArena = useStore((s) => s.startArena);
  const out = [...task.outputs].reverse().find((o) => o.stage === stage);
  const [picked, setPicked] = useState<string[]>(() => models.filter((m) => m.id !== out?.modelId).slice(0, 2).map((m) => m.id));
  const [blind, setBlind] = useState(true);
  const [busy, setBusy] = useState(false);
  const real = (provider: string) => aiMode === 'auto' && keys.some((k) => k.provider === provider && k.configured);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));

  const start = async () => {
    setBusy(true);
    try {
      await startArena(task.id, stage, picked, blind);
      onDone();
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="arena-setup">
      <div className="hint">{t('arena_setupHint')}</div>
      <div className="arena-models">
        {models.map((m) => (
          <label key={m.id} className={`arena-model ${picked.includes(m.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} disabled={!picked.includes(m.id) && picked.length >= 4} />
            <ProviderDot provider={m.provider} /> {m.name}
            {m.id === out?.modelId && <span className="chip">{t('arena_current')}</span>}
            {!real(m.provider) && <span className="hint"> · {t('arena_sim')}</span>}
          </label>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> 🙈 {t('arena_blind')}
        </label>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={onDone}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy || picked.length < 2} onClick={() => void start()}>⚔️ {t('arena_start', { n: picked.length })}</button>
        </span>
      </div>
    </div>
  );
}

export function ArenaView({ task }: { task: Task }) {
  const t = useT();
  const me = useStore((s) => s.user!);
  const pickArena = useStore((s) => s.pickArena);
  const closeArena = useStore((s) => s.closeArena);
  const [use, setUse] = useState(true);
  const [busy, setBusy] = useState(false);
  const arena = task.arena!;
  const mine = arena.byUserId === me.id;
  const allIn = arena.entries.every((e) => e.status !== 'running');
  const reveal = !arena.blind || !!arena.pickedModelId;
  // Only worth saying when a later step already worked from the old version.
  const laterSteps = task.outputs.some((o) => o.stage > arena.stage);
  const usedWinner = task.outputs.some((o) => o.arena && o.stage === arena.stage && o.modelId === arena.pickedModelId && o.at >= arena.createdAt);

  const pick = async (modelId: string) => {
    setBusy(true);
    try {
      await pickArena(task.id, modelId, use);
      toast.success(t('arena_picked'));
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="arena">
      <div className="row arena-head">
        <strong>⚔️ {t('arena_title', { n: arena.stage + 1 })}</strong>
        <span className="hint">{t('arena_by', { user: arena.byName ?? '?' })}</span>
        <span style={{ marginLeft: 'auto' }} />
        {mine && !arena.pickedModelId && allIn && (
          <label className="row hint" style={{ gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={use} onChange={(e) => setUse(e.target.checked)} /> {t('arena_use')}
          </label>
        )}
        {(mine || me.role === 'Admin') && <button className="btn sm" onClick={() => void closeArena(task.id).catch(() => {})}>✕ {t('arena_close')}</button>}
      </div>
      <div className="arena-grid" style={{ gridTemplateColumns: `repeat(${arena.entries.length}, minmax(0, 1fr))` }}>
        {arena.entries.map((e, i) => {
          const won = arena.pickedModelId === e.modelId;
          return (
            <section key={e.modelId} className={`arena-card ${won ? 'won' : ''}`} aria-label={reveal ? e.modelName : `${t('arena_answer')} ${LETTERS[i]}`}>
              <header>
                <strong>{won && '🏆 '}{reveal ? e.modelName : `${t('arena_answer')} ${LETTERS[i]}`}</strong>
                {e.status === 'running' && <span className="hint"> ⏳ {t('arena_running')}</span>}
                {e.status === 'error' && <span className="hint"> ⚠ {t('arena_failed')}</span>}
                {e.status === 'done' && e.simulated && <span className="hint"> · {t('simulatedTag')}</span>}
              </header>
              {e.status === 'done' && (
                <div className="hint arena-meta">
                  {e.ms !== undefined && `${(e.ms / 1000).toFixed(1)}s`}
                  {e.tokensOut !== undefined && ` · ${tokenCount(e.tokensIn ?? 0)}/${tokenCount(e.tokensOut)}`}
                  {e.costUsd !== undefined && ` · ${usd(e.costUsd)}`}
                </div>
              )}
              <div className="arena-text">
                {e.status === 'error' ? <code className="blocked-reason">{e.error}</code> : e.text ? <Markdown text={e.text} /> : <span className="hint">…</span>}
              </div>
              {mine && !arena.pickedModelId && allIn && e.status === 'done' && (
                <button className="btn primary sm" disabled={busy} onClick={() => void pick(e.modelId)}>🏆 {t('arena_pick')}</button>
              )}
            </section>
          );
        })}
      </div>
      {usedWinner && laterSteps && <p className="hint">ℹ️ {t('arena_laterSteps')}</p>}
    </div>
  );
}
