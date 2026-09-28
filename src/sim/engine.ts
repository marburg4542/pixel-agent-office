import { useStore } from '../store';
import { translate } from '../i18n';
import type { LogParams, Note, Task } from '../types';
import { BOARD_SLOTS, DESKS, pathFromBoard, pathToBoard, seatOf, type Pt } from '../scene/layout';
import { buildStageContext, simulateOutput, stageDuration } from './stage';
import { PROVIDERS } from '../data/models';

export type AgentStatus = 'idle' | 'walking' | 'reading' | 'working';

type Action =
  | { type: 'walk'; path: Pt[] }
  | { type: 'wait'; t: number; status: AgentStatus }
  | { type: 'call'; fn: () => void }
  | { type: 'work'; taskId: string };

export interface AgentRT {
  id: string;
  desk: number;
  x: number;
  y: number;
  facing: 'front' | 'back';
  moving: boolean;
  walkT: number;
  typeT: number;
  actions: Action[];
  status: AgentStatus;
  bubble: { text: string; t: number } | null;
  blinkT: number;
  blinking: boolean;
  idleT: number;
  decideT: number;
  boardSlot: number | null;
  reservedTaskId: string | null;
  work: { taskId: string; progress: number; duration: number; phase: number; noteT: number } | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  color: string;
}

interface Flyer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  to: string;
}

const WALK_SPEED = 42;
const PHASE_AT = [0, 10, 35, 90];
const PHASE_KEYS = ['read', 'plan', 'work', 'check'];
const PRIORITY_RANK = { high: 0, med: 1, low: 2 } as const;
const CONFETTI = ['#f2c94c', '#e05a8a', '#4f7cf0', '#4fbf7a', '#f08a3c'];

class Engine {
  agents = new Map<string, AgentRT>();
  particles: Particle[] = [];
  flyers: Flyer[] = [];
  /** Real seconds since start — drives cosmetic animation. */
  realTime = 0;

  private get s() {
    return useStore.getState();
  }

  private tr(key: string, params?: LogParams) {
    return translate(this.s.lang, key, params);
  }

  private name(id: string) {
    return this.s.agents.find((a) => a.id === id)?.name ?? '?';
  }

  update(dtReal: number): void {
    dtReal = Math.min(dtReal, 0.1);
    const s = this.s;
    this.realTime += dtReal;
    const dt = s.paused ? 0 : dtReal * s.simSpeed;
    this.sync();
    for (const rt of this.agents.values()) {
      this.animate(rt, dtReal, dt);
      if (dt > 0) this.step(rt, dt);
    }
    this.updateEffects(dt);
  }

  // ─── Queries used by the UI ─────────────────────────────────────────────

  unreadNotes(agentId: string): Note[] {
    return this.s.notes.filter((n) => (n.to === agentId || n.to === 'all') && !n.readBy.includes(agentId));
  }

  /** Tasks waiting on this agent, best first. */
  queueFor(agentId: string): Task[] {
    return this.s.tasks
      .filter((t) => (t.column === 'todo' || t.column === 'doing') && t.pipeline[t.stage] === agentId && !t.active)
      .sort(
        (a, b) =>
          (a.column === 'doing' ? 0 : 1) - (b.column === 'doing' ? 0 : 1) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          a.createdAt - b.createdAt,
      );
  }

  cheer(agentIds: string[]): void {
    for (const id of agentIds) {
      const rt = this.agents.get(id);
      if (rt) rt.bubble = { text: this.tr('bubble_yay'), t: 2 };
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  private sync(): void {
    const { agents } = this.s;
    const ids = new Set(agents.map((a) => a.id));
    for (const id of [...this.agents.keys()]) if (!ids.has(id)) this.agents.delete(id);
    for (const a of agents) {
      const desk = DESKS[a.desk] ?? DESKS[0];
      const rt = this.agents.get(a.id);
      if (!rt) {
        const seat = seatOf(desk);
        this.agents.set(a.id, {
          id: a.id, desk: a.desk, x: seat.x, y: seat.y, facing: 'front', moving: false, walkT: 0, typeT: 0,
          actions: [], status: 'idle', bubble: null, blinkT: 1 + Math.random() * 3, blinking: false,
          idleT: 0, decideT: 0.3 + Math.random() * 0.6, boardSlot: null, reservedTaskId: null, work: null,
        });
      } else if (rt.desk !== a.desk) {
        // Moved desks: drop whatever they were doing and sit at the new one.
        if (rt.work) this.s.setTaskActive(rt.work.taskId, false);
        const seat = seatOf(desk);
        Object.assign(rt, { desk: a.desk, x: seat.x, y: seat.y, actions: [], work: null, boardSlot: null, moving: false });
      }
    }
  }

  private animate(rt: AgentRT, dtReal: number, dt: number): void {
    if (rt.bubble && (rt.bubble.t -= dtReal) <= 0) rt.bubble = null;
    if ((rt.blinkT -= dtReal) <= 0) {
      rt.blinking = !rt.blinking;
      rt.blinkT = rt.blinking ? 0.14 : 2.5 + Math.random() * 3;
    }
    if (rt.moving) rt.walkT += dt;
    if (rt.status === 'working') rt.typeT += dt;
  }

  private step(rt: AgentRT, dt: number): void {
    let remaining = dt;
    for (let guard = 0; remaining > 0 && rt.actions.length && guard < 20; guard++) {
      const a = rt.actions[0];
      if (a.type === 'walk') {
        rt.status = 'walking';
        rt.moving = true;
        const target = a.path[0];
        if (!target) {
          rt.actions.shift();
          continue;
        }
        const dx = target.x - rt.x;
        const dy = target.y - rt.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dy) > Math.abs(dx)) rt.facing = dy < 0 ? 'back' : 'front';
        const len = WALK_SPEED * remaining;
        if (len >= dist) {
          rt.x = target.x;
          rt.y = target.y;
          remaining -= dist / WALK_SPEED;
          a.path.shift();
          if (!a.path.length) {
            rt.actions.shift();
            rt.moving = false;
          }
        } else {
          rt.x += (dx / dist) * len;
          rt.y += (dy / dist) * len;
          remaining = 0;
        }
      } else if (a.type === 'wait') {
        rt.status = a.status;
        rt.moving = false;
        if (a.status === 'reading') rt.facing = 'back';
        a.t -= remaining;
        if (a.t <= 0) {
          remaining = -a.t;
          rt.actions.shift();
        } else remaining = 0;
      } else if (a.type === 'call') {
        rt.actions.shift();
        a.fn();
      } else {
        rt.status = 'working';
        rt.moving = false;
        rt.facing = 'front';
        this.doWork(rt, remaining);
        remaining = 0;
      }
    }
    if (!rt.actions.length) {
      rt.moving = false;
      rt.status = 'idle';
      rt.facing = 'front';
      rt.idleT += dt;
      if ((rt.decideT -= dt) <= 0) {
        rt.decideT = 0.4;
        this.decide(rt);
      }
    } else rt.idleT = 0;
  }

  // ─── Decisions ──────────────────────────────────────────────────────────

  private decide(rt: AgentRT): void {
    const unread = this.unreadNotes(rt.id);
    const next = this.queueFor(rt.id)[0];
    if (!unread.length && !next) return;

    // Work handed straight to the desk — no need to visit the board.
    if (next && next.column === 'doing' && !unread.length) {
      this.startWork(rt, next.id);
      return;
    }

    const used = new Set([...this.agents.values()].filter((o) => o !== rt).map((o) => o.boardSlot));
    const slot = BOARD_SLOTS.findIndex((_, i) => !used.has(i));
    if (slot < 0) return; // board crowded — try again shortly
    const desk = DESKS[rt.desk];
    const slotX = BOARD_SLOTS[slot];
    rt.boardSlot = slot;
    rt.reservedTaskId = next && next.column === 'todo' ? next.id : null;
    rt.actions.push(
      { type: 'walk', path: pathToBoard(desk, slotX) },
      { type: 'wait', t: 1.4, status: 'reading' },
      { type: 'call', fn: () => this.atBoard(rt) },
      { type: 'walk', path: pathFromBoard(desk, slotX) },
    );
  }

  private atBoard(rt: AgentRT): void {
    this.readNotes(rt);
    const id = rt.reservedTaskId;
    rt.reservedTaskId = null;
    rt.boardSlot = null;
    if (!id) return;
    const t = this.s.tasks.find((x) => x.id === id);
    if (t && t.column === 'todo' && t.pipeline[t.stage] === rt.id && !t.active) {
      this.s.claimTask(t.id, rt.id);
      if (!rt.bubble) rt.bubble = { text: this.tr('bubble_hmm'), t: 1.2 };
    }
  }

  private readNotes(rt: AgentRT): boolean {
    const unread = this.unreadNotes(rt.id);
    if (!unread.length) return false;
    const s = this.s;
    const name = this.name(rt.id);
    s.markNotesRead(rt.id, unread.map((n) => n.id));
    for (const n of unread) {
      if (n.taskId) s.pushLog(n.taskId, 'log_noteRead', { agent: name, text: n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text });
    }
    s.pushFeed('feed_noteRead', { agent: name });
    rt.bubble = { text: this.tr('bubble_gotIt'), t: 1.8 };
    return true;
  }

  private startWork(rt: AgentRT, taskId: string): void {
    const s = this.s;
    const task = s.tasks.find((t) => t.id === taskId);
    const agent = s.agents.find((a) => a.id === rt.id);
    if (!task || !agent || task.column !== 'doing' || task.pipeline[task.stage] !== rt.id || task.active) return;
    const model = s.models.find((m) => m.id === agent.modelId);
    s.setTaskActive(task.id, true);
    rt.work = { taskId, progress: task.stageProgress, duration: stageDuration(task, model), phase: -1, noteT: 2 };
    rt.actions.push({ type: 'work', taskId });
  }

  private doWork(rt: AgentRT, dt: number): void {
    const s = this.s;
    const w = rt.work;
    const task = w && s.tasks.find((t) => t.id === w.taskId);
    if (!w || !task || !task.active || task.column !== 'doing' || task.pipeline[task.stage] !== rt.id) {
      // The task was moved, edited or deleted under us (the store already cleared `active`).
      rt.actions.shift();
      rt.work = null;
      return;
    }

    w.progress += (dt / w.duration) * 100;
    const phase = PHASE_AT.filter((p) => w.progress >= p).length - 1;
    if (phase !== w.phase) {
      w.phase = phase;
      s.pushLog(task.id, `log_phase_${PHASE_KEYS[phase]}`, { agent: this.name(rt.id) });
    }
    if ((w.noteT -= dt) <= 0) {
      w.noteT = 2;
      this.readNotes(rt);
    }
    if (w.progress >= 100) {
      this.finishStage(rt, task);
      return;
    }
    if (Math.floor(w.progress) !== Math.floor(task.stageProgress)) s.setTaskProgress(task.id, Math.floor(w.progress));

    // Little code sparks from the laptop
    if (Math.random() < dt * 4) {
      const d = DESKS[rt.desk];
      const provider = s.models.find((m) => m.id === s.agents.find((a) => a.id === rt.id)?.modelId)?.provider;
      this.particles.push({
        x: d.x + 6 + Math.random() * 10, y: d.y - 32, vx: (Math.random() - 0.5) * 4, vy: -10 - Math.random() * 6, g: 0,
        life: 1.2, max: 1.2, color: provider ? PROVIDERS[provider].color : '#9a8aff',
      });
    }
  }

  private finishStage(rt: AgentRT, task: Task): void {
    const s = this.s;
    const agent = s.agents.find((a) => a.id === rt.id)!;
    const ctx = buildStageContext(s, task, agent);
    const { text, score } = simulateOutput(ctx, s.lang);
    const res = s.completeStage(task.id, {
      stage: task.stage, agentId: agent.id, agentName: agent.name, modelId: agent.modelId,
      modelName: ctx.model?.name ?? agent.modelId, text, score, at: Date.now(),
    });
    rt.actions.shift();
    rt.work = null;
    rt.bubble = { text: this.tr('bubble_done'), t: 2 };
    this.burst(rt.x, rt.y - 24);
    s.pushFeed('feed_stageDone', { agent: agent.name, task: task.title });
    if (res.next) {
      s.pushFeed('feed_handoff', { agent: agent.name, next: this.name(res.next), task: task.title });
      this.fly(rt, res.next);
    } else if (res.column === 'review') s.pushFeed('feed_review', { task: task.title });
    else s.pushFeed('feed_done', { task: task.title });
  }

  // ─── Effects ────────────────────────────────────────────────────────────

  private burst(x: number, y: number): void {
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x, y, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30, g: 90,
        life: 1 + Math.random() * 0.4, max: 1.4, color: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  private fly(from: AgentRT, toId: string): void {
    const a = this.s.agents.find((x) => x.id === toId);
    if (!a) return;
    const d0 = DESKS[from.desk];
    const d1 = DESKS[a.desk];
    this.flyers.push({ x0: d0.x + 10, y0: d0.y - 30, x1: d1.x + 10, y1: d1.y - 30, t: 0, dur: 1.3, to: toId });
  }

  flyerPos(f: Flyer): Pt {
    const k = Math.min(1, f.t / f.dur);
    return { x: f.x0 + (f.x1 - f.x0) * k, y: f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 28 };
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.flyers) {
      f.t += dt;
      if (f.t >= f.dur) {
        const rt = this.agents.get(f.to);
        if (rt && !rt.bubble) rt.bubble = { text: '!', t: 1 };
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
  }
}

export const engine = new Engine();
