import type { Agent, Lang, ModelDef, Note, StageOutput, Task } from '../../shared/types';
import { roleById } from '../../shared/roles';
import { translate } from '../../shared/i18n';
import { clamp, pick, randInt } from '../../shared/util';
import { collabInstructions, qaForPrompt, simVerdict } from './collab';

/**
 * Everything an agent "knows" when it works one step of a task.
 * The simulation turns this into fake output; the real-API phase will turn it into a prompt.
 */
export interface StageContext {
  task: Task;
  agent: Agent;
  model?: ModelDef;
  stage: number;
  /** Latest result of each earlier step (what was handed off to this agent). */
  previous: StageOutput[];
  /** Notes this agent has read that apply to this task. */
  notes: Note[];
  nextAgent?: Agent;
}

/**
 * @param s.notes notes addressed to this agent (already scoped per owner); only read ones that
 *                apply to this task are used
 * @param s.models the agent owner's model library
 * @param s.findAgent looks up any agent (the next step may belong to another user on shared tasks)
 */
export function buildStageContext(
  s: { notes: Note[]; models: ModelDef[]; findAgent: (id: string) => Agent | undefined },
  task: Task,
  agent: Agent,
): StageContext {
  const previous: StageOutput[] = [];
  for (let i = 0; i < task.stage; i++) {
    const out = [...task.outputs].reverse().find((o) => o.stage === i);
    if (out) previous.push(out);
  }
  const notes = s.notes.filter((n) => (!n.taskId || n.taskId === task.id) && n.readBy.includes(agent.id));
  return {
    task,
    agent,
    model: s.models.find((m) => m.id === agent.modelId),
    stage: task.stage,
    previous,
    notes,
    nextAgent: s.findAgent(task.pipeline[task.stage + 1]),
  };
}

const roleName = (lang: Lang, a: Agent) => (a.role === 'custom' && a.roleLabel ? a.roleLabel : translate(lang, `role_${a.role}`));

/** What each role is for — a short orientation, not a script. */
const ROLE_GUIDE: Record<Agent['role'], string> = {
  planner: 'You turn goals into a clear, numbered plan with concrete deliverables and what "done" means for each.',
  researcher: 'You find reliable information. Search the web when you can, cite sources as Markdown links, and keep facts separate from opinion.',
  analyst:
    'You analyse news and public sentiment. Search the web when you can; report the overall mood (positive/neutral/negative with rough percentages), the main themes, notable quotes with links, and the hard numbers — and say how confident you are.',
  coder: 'You write working code in fenced blocks with a language tag, handle errors and edge cases, and add a short usage example.',
  writer: 'You write clear, engaging prose for the intended reader, with a headline and tight structure.',
  designer: "You design concretely: layout sections, colors as hex codes, typography and components. You can't produce images, so describe precisely.",
  reviewer: "You review the work handed to you against the brief: what's good, issues ranked by severity, and concrete fixes.",
  tester: 'You design tests: a table of cases with inputs and expected results, plus the risky gaps you see.',
  custom: 'Follow your standing instructions.',
};

/** Roles that get the provider's built-in web search when available. */
export const WEB_SEARCH_ROLES = new Set<Agent['role']>(['researcher', 'analyst']);

export const maxTokensFor = (size: Task['size']) => ({ S: 4000, M: 8000, L: 16000 })[size];
/** Rough answer length used to show progress while a real answer streams in. */
export const expectedChars = (size: Task['size']) => ({ S: 2500, M: 5000, L: 9000 })[size];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s);

/** Messages for a real provider call — built from the same context the simulation uses. */
export function buildPrompt(ctx: StageContext, lang: Lang): { system: string; user: string } {
  const { task, agent, previous, notes, nextAgent } = ctx;
  const system = [
    `You are ${agent.name}, the ${roleName('en', agent)} on a small AI team that works in a shared office. Tasks move along a pipeline: each teammate does one step and hands the result to the next.`,
    ROLE_GUIDE[agent.role],
    agent.instructions && `Standing instructions from your manager:\n${agent.instructions}`,
    `Write your result in Markdown, in ${lang === 'th' ? 'Thai' : 'English'}. Deliver the work itself — no preamble about what you are going to do.`,
    collabInstructions(ctx),
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const parts = [`# Task: ${task.title}`, task.description];
  if (previous.length) {
    parts.push('## Work handed to you');
    // Keep the most recent hand-off whole; older steps are context, so they can be shortened.
    previous.forEach((p, i) => parts.push(`### Step ${p.stage + 1} by ${p.agentName}\n${clip(p.text, i === previous.length - 1 ? 24000 : 6000)}`));
  }
  if (notes.length) parts.push('## Notes from your manager', ...notes.map((n) => `- ${n.text}`));
  parts.push(qaForPrompt(ctx));
  parts.push(
    nextAgent
      ? `Your result goes next to ${nextAgent.name} (${roleName('en', nextAgent)}).`
      : 'Yours is the last step; your result goes to the manager for review.',
  );
  return { system, user: parts.filter(Boolean).join('\n\n') };
}

// ─── Simulated output ───────────────────────────────────────────────────────

const POOLS = {
  th: {
    plan: ['รวบรวมความต้องการและข้อจำกัด', 'กำหนดขอบเขตและสิ่งที่ต้องส่งมอบ', 'แบ่งเป็นงานย่อยพร้อมผู้รับผิดชอบ', 'กำหนดเกณฑ์ว่า "เสร็จ" คืออะไร', 'ประเมินความเสี่ยงและทางสำรอง', 'วางไทม์ไลน์คร่าวๆ'],
    research: ['แหล่งข้อมูล 3 แห่งให้ข้อสรุปสอดคล้องกัน', 'พบแนวทางที่นิยม 2 แบบ แบบแรกเรียบง่ายกว่า', 'คู่แข่งส่วนใหญ่เน้นความเร็วในการใช้งาน', 'ข้อควรระวัง: ข้อมูลบางส่วนเก่ากว่า 1 ปี', 'กลุ่มเป้าหมายให้ความสำคัญกับราคาเป็นอันดับแรก'],
    write: ['เปิดด้วยปัญหาที่ผู้อ่านเจอบ่อย', 'อธิบายทางเลือกพร้อมข้อดีข้อเสีย', 'ปิดท้ายด้วยคำแนะนำที่ทำได้ทันที', 'ใส่ตัวอย่างสั้นๆ ให้เห็นภาพ'],
    design: ['Header เรียบง่าย โลโก้ซ้าย เมนูขวา', 'Hero ใหญ่ พร้อมปุ่ม Call-to-action ชัดเจน', 'การ์ดแสดงเนื้อหา 3 คอลัมน์', 'Footer รวมช่องทางติดต่อ', 'ระยะห่างสม่ำเสมอ 8px grid'],
    review: ['โครงสร้างครบถ้วนตามโจทย์', 'เนื้อหาถูกต้องและสอดคล้องกัน', 'อ่านง่าย ไม่ยาวเกินไป', 'มีตัวอย่างประกอบ'],
    suggest: ['เพิ่มตัวอย่างอีก 1 กรณี', 'ตัดส่วนที่ซ้ำซ้อนออก', 'ตั้งชื่อหัวข้อให้ชัดขึ้น', 'ตรวจกรณีข้อมูลว่างเพิ่ม'],
    test: ['ข้อมูลปกติ', 'ข้อมูลว่าง', 'ค่าติดลบ', 'ข้อมูลขนาดใหญ่', 'รูปแบบไม่ถูกต้อง', 'กดซ้ำเร็วๆ'],
  },
  en: {
    plan: ['Gather requirements and constraints', 'Define scope and deliverables', 'Split into sub-tasks with owners', 'Agree on what "done" means', 'Assess risks and fallbacks', 'Sketch a rough timeline'],
    research: ['Three sources reach the same conclusion', 'Two common approaches; the first is simpler', 'Most competitors emphasize speed of use', 'Caveat: some data is over a year old', 'The audience ranks price as the top factor'],
    write: ['Open with a problem readers recognize', 'Walk through options with pros and cons', 'Close with advice they can act on today', 'Add a short example to make it concrete'],
    design: ['Simple header: logo left, menu right', 'Large hero with a clear call-to-action', 'Three-column content cards', 'Footer with contact channels', 'Consistent 8px spacing grid'],
    review: ['Structure covers the brief', 'Content is accurate and consistent', 'Easy to read, not too long', 'Includes supporting examples'],
    suggest: ['Add one more example', 'Remove the repeated section', 'Make the headings clearer', 'Handle the empty-input case'],
    test: ['normal input', 'empty input', 'negative values', 'large input', 'malformed input', 'rapid repeated clicks'],
  },
};

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(randInt(copy.length), 1)[0]);
  return out;
}

function fnName(title: string): string {
  const words = title.toLowerCase().match(/[a-z0-9]+/g);
  if (!words || !words.length) return 'runTask';
  return words.slice(0, 3).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
}

export function simulateOutput(ctx: StageContext, lang: Lang): { text: string; score: number } {
  const th = lang === 'th';
  const P = POOLS[lang];
  const { task, agent, previous, notes, nextAgent, model } = ctx;
  const lines: string[] = [];
  const prev = previous[previous.length - 1];

  if (prev) lines.push(th ? `↳ ต่อยอดจากงานของ ${prev.agentName} (ขั้นที่ ${prev.stage + 1})` : `↳ Building on ${prev.agentName}'s step ${prev.stage + 1}`);

  switch (agent.role) {
    case 'planner':
      lines.push(th ? `แผนงาน: ${task.title}` : `Plan: ${task.title}`);
      sample(P.plan, 4).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      break;
    case 'researcher':
      lines.push(th ? `สรุปผลค้นคว้า: ${task.title}` : `Research summary: ${task.title}`);
      sample(P.research, 3).forEach((s) => lines.push(`• ${s}`));
      break;
    case 'analyst': {
      const pos = 30 + randInt(40);
      const neg = 5 + randInt(Math.max(1, 90 - pos - 5));
      lines.push(th ? `สรุปความเห็นและข่าว: ${task.title}` : `Sentiment & news brief: ${task.title}`);
      lines.push(th ? `ภาพรวมความรู้สึก: บวก ${pos}% · กลาง ${100 - pos - neg}% · ลบ ${neg}%` : `Overall sentiment: ${pos}% positive · ${100 - pos - neg}% neutral · ${neg}% negative`);
      sample(P.research, 2).forEach((s) => lines.push(`• ${s}`));
      break;
    }
    case 'coder': {
      const fn = fnName(task.title);
      const n = 3 + randInt(4);
      lines.push('```ts', `// ${task.title}`, `export function ${fn}(input: Input): Result {`, `  if (!input) throw new Error('invalid input');`, `  const data = normalize(input);`, `  return compute(data);`, '}', '```');
      lines.push(th ? `✔ unit test ผ่าน ${n}/${n}` : `✔ ${n}/${n} unit tests passing`);
      break;
    }
    case 'writer':
      lines.push(`## ${task.title}`);
      sample(P.write, 3).forEach((s) => lines.push(`• ${s}`));
      lines.push(th ? `(ร่างแรก ~${300 + randInt(5) * 100} คำ)` : `(first draft, ~${300 + randInt(5) * 100} words)`);
      break;
    case 'designer':
      lines.push(th ? `แนวทางออกแบบ: ${task.title}` : `Design direction: ${task.title}`);
      sample(P.design, 3).forEach((s) => lines.push(`▸ ${s}`));
      break;
    case 'reviewer': {
      lines.push(th ? `ผลการตรวจ${prev ? `งานของ ${prev.agentName}` : ''}` : `Review${prev ? ` of ${prev.agentName}'s work` : ''}`);
      sample(P.review, 3).forEach((s) => lines.push(`✔ ${s}`));
      lines.push(`✎ ${pick(P.suggest)}`);
      lines.push('', simVerdict(ctx, lang));
      break;
    }
    case 'tester': {
      const cases = sample(P.test, 5);
      const fail = Math.random() < 0.3 ? randInt(cases.length) : -1;
      cases.forEach((c, i) => lines.push(`${i === fail ? '✘' : '✔'} ${c}`));
      lines.push(th ? `ผ่าน ${fail < 0 ? cases.length : cases.length - 1}/${cases.length} กรณี` : `${fail < 0 ? cases.length : cases.length - 1}/${cases.length} cases pass`);
      break;
    }
    default:
      lines.push(th ? `สรุปงาน: ${task.title}` : `Work summary: ${task.title}`);
      lines.push(th ? `• ทำตามคำสั่ง: ${agent.instructions || '—'}` : `• Following instructions: ${agent.instructions || '—'}`);
  }

  if (notes.length) {
    lines.push(th ? '📌 นำโน้ตมาพิจารณา:' : '📌 Took notes into account:');
    notes.slice(-3).forEach((n) => lines.push(`  – “${n.text}”`));
  }
  if (nextAgent) lines.push(th ? `→ ส่งต่อให้ ${nextAgent.name}` : `→ Handing off to ${nextAgent.name}`);

  const q = model?.quality ?? 3;
  const w = roleById(agent.role).weights.quality;
  const raw = q * (0.6 + w * 0.5) + 0.6 + (Math.random() - 0.5) * 1.4;
  const score = clamp(Math.round(raw * 2) / 2, 1, 5);
  return { text: lines.join('\n'), score };
}

/** Seconds of simulated work for one step. */
export function stageDuration(task: Task, model?: ModelDef): number {
  const base = { S: 16, M: 32, L: 64 }[task.size];
  const speed = model?.speed ?? 3;
  const factor = [1, 1.6, 1.3, 1.0, 0.8, 0.6][clamp(Math.round(speed), 1, 5)];
  return base * factor * (0.85 + Math.random() * 0.3);
}
