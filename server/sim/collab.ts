// Agents working together: asking the manager a question, and reviewers sending work back by themselves.
import { MAX_AUTO_REVISIONS } from '../../shared/constants';
import { pick } from '../../shared/util';
import type { Lang, Task } from '../../shared/types';
import type { StageContext } from './stage';

/** How often simulated agents ask / simulated reviewers send work back (tests turn these off). */
export const simRates = { ask: 0.2, revise: 0.3 };

export type Verdict = { kind: 'approve' } | { kind: 'revise'; stage: number; feedback: string };

/** `VERDICT: APPROVE` or `VERDICT: REVISE step 2 — fix the intro` (the last one in the text wins). */
export function parseVerdict(text: string): Verdict | null {
  const all = [...text.matchAll(/VERDICT:\s*(APPROVE|REVISE)(?:\s+step\s+(\d+))?\s*[—–:\-]?\s*(.*)$/gim)];
  const m = all[all.length - 1];
  if (!m) return null;
  if (m[1].toUpperCase() === 'APPROVE') return { kind: 'approve' };
  const step = Number(m[2]);
  return { kind: 'revise', stage: Number.isInteger(step) && step > 0 ? step - 1 : -1, feedback: m[3].trim().slice(0, 600) };
}

/** A reply that is only `QUESTION: …` means the agent needs an answer before it can do the work. */
export function parseQuestion(text: string): string | null {
  const m = /^\s*QUESTION:\s*([\s\S]{3,600}?)\s*$/i.exec(text);
  return m && !/\n\s*\n/.test(m[1]) ? m[1].trim() : null;
}

export const answeredFor = (t: Task, stage: number) => (t.qa ?? []).filter((q) => q.stage === stage);

/** Extra rules for the system prompt (ask-back and reviewer verdicts). */
export function collabInstructions(ctx: StageContext): string {
  const parts: string[] = [];
  if (!answeredFor(ctx.task, ctx.stage).length) {
    parts.push(
      "If the brief is so unclear that you would have to guess something important, don't guess: reply with ONLY one line `QUESTION: <the single most important thing you need to know>` and nothing else. Do this rarely — only when it really matters.",
    );
  } else {
    parts.push("You already asked the manager a question for this step and got an answer (below); don't ask again — do the work.");
  }
  if (ctx.agent.role === 'reviewer' && ctx.stage > 0) {
    const steps = ctx.previous.map((p) => `step ${p.stage + 1} (${p.agentName})`).join(', ');
    const left = MAX_AUTO_REVISIONS - (ctx.task.autoRevisions ?? 0);
    parts.push(
      left > 0
        ? `End with exactly one verdict line: \`VERDICT: APPROVE\` if the work is good enough, or \`VERDICT: REVISE step <n> — <what to fix>\` to send it back to the step that should redo its part (${steps}). Only send it back for real problems.`
        : 'End with the line `VERDICT: APPROVE` — this work has been revised enough; list any remaining issues for the manager instead.',
    );
  }
  return parts.join('\n');
}

/** The question-and-answer part of the user prompt. */
export function qaForPrompt(ctx: StageContext): string {
  const qa = answeredFor(ctx.task, ctx.stage);
  if (!qa.length) return '';
  return ['## Your question and the manager’s answer', ...qa.map((q) => `- You asked: ${q.question}\n  Answer (${q.by}): ${q.answer}`)].join('\n');
}

const SIM_QUESTIONS: Record<Lang, string[]> = {
  th: [
    'ผลงานนี้ใครเป็นผู้อ่านหลัก และอยากได้ยาวประมาณไหน?',
    'มีตัวอย่างหรือแบบที่ชอบให้ดูเป็นแนวทางไหม?',
    'ข้อจำกัดสำคัญคืออะไร — งบ เวลา หรือเทคโนโลยีที่ต้องใช้?',
    'ต้องการโทนแบบทางการหรือเป็นกันเอง?',
  ],
  en: [
    'Who is the main reader of this, and roughly how long should it be?',
    'Is there an example or style you like that I should follow?',
    'What is the most important constraint — budget, deadline, or a required technology?',
    'Should the tone be formal or casual?',
  ],
};

/** Simulated agents sometimes ask about a vague task (once per task). */
export function simQuestion(t: Task, lang: Lang): string | null {
  if (t.qa?.length || t.question || t.watchlistId || t.description.trim().length >= 40) return null;
  return Math.random() < simRates.ask ? pick(SIM_QUESTIONS[lang]) : null;
}

/** Simulated reviewer verdict: usually approve, sometimes send one step back while rounds are left. */
export function simVerdict(ctx: StageContext, lang: Lang): string {
  const canRevise = ctx.stage > 0 && (ctx.task.autoRevisions ?? 0) < MAX_AUTO_REVISIONS && ctx.previous.length > 0;
  if (canRevise && Math.random() < simRates.revise) {
    const target = pick(ctx.previous);
    const why = lang === 'th' ? pick(['เพิ่มรายละเอียดและตัวอย่าง', 'แก้ส่วนที่ยังไม่ตรงโจทย์', 'ตัดส่วนที่ซ้ำซ้อนและสรุปให้กระชับ']) : pick(['add detail and an example', 'fix the parts that miss the brief', 'cut the repetition and tighten the summary']);
    return `VERDICT: REVISE step ${target.stage + 1} — ${why}`;
  }
  return 'VERDICT: APPROVE';
}
