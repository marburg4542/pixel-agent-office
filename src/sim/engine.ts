// Visual engine: turns the server's agent runtime (idle / trip / working, see shared/types) into
// positions and animation for the canvas. All decisions happen on the server — nothing here
// changes data.
import { runtimeValue, useStore } from '../store';
import { BOARD_SLOTS, DESKS, SCENE_W, pathFromBoard, pathToBoard, seatOf, type Pt } from '../scene/layout';
import { TRIP_ARRIVE, TRIP_LEAVE } from '../../shared/constants';
import { PROVIDERS } from '../../shared/models';
import { translate } from '../../shared/i18n';
import type { Agent, Note, Task } from '../types';
import { onServerEvent } from '../lib/events';
import { play } from '../lib/sound';

export type AgentStatus = 'idle' | 'walking' | 'reading' | 'working';

export interface VisualAgent {
  id: string;
  desk: number;
  x: number;
  y: number;
  facing: 'front' | 'back';
  moving: boolean;
  /** distance walked — drives the leg animation */
  walkDist: number;
  typeT: number;
  status: AgentStatus;
  bubble: { text: string; t: number } | null;
  blinkT: number;
  blinking: boolean;
  idleSince: number;
  slot: number | null;
  progress: number;
  taskId?: string;
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
}

const CONFETTI = ['#f2c94c', '#e05a8a', '#4f7cf0', '#4fbf7a', '#f08a3c'];
const PRIORITY_RANK = { high: 0, med: 1, low: 2 } as const;
const DOOR: Pt = { x: SCENE_W + 12, y: 150 };

const pathLength = (pts: Pt[]) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

function pointAlong(pts: Pt[], dist: number): { p: Pt; dy: number; dx: number } {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i === pts.length - 1) {
      const k = len ? Math.min(1, left / len) : 1;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, dx: b.x - a.x, dy: b.y - a.y };
    }
    left -= len;
  }
  return { p: pts[pts.length - 1], dx: 0, dy: 0 };
}

/** Is this note addressed to this agent? Mirrors the server rule. */
const noteTargets = (n: Note, a: Agent) => n.to === a.id || (n.to === 'all' && (n.scope === 'shared' || n.createdBy === a.ownerId));

class Engine {
  agents = new Map<string, VisualAgent>();
  particles: Particle[] = [];
  flyers: Flyer[] = [];
  /** Real seconds since start — cosmetic animation clock. */
  realTime = 0;

  constructor() {
    onServerEvent('bubble', (d) => {
      const { agentId, key } = d as { agentId: string; key: string };
      this.say(agentId, translate(useStore.getState().settings.lang, `bubble_${key}`));
      if (key === 'gotIt') play('note');
    });
    onServerEvent('stage-done', (d) => {
      const va = this.agents.get((d as { agentId: string }).agentId);
      if (va) this.burst(va.x, va.y - 24);
      play('done');
    });
    onServerEvent('handoff', (d) => this.handoff(d as { from: string; to: string }));
    onServerEvent('feed', (d) => {
      if ((d as { key: string }).key === 'feed_review') play('review');
    });
  }

  // ─── Queries used by the UI ──────────────────────────────────────────────

  unreadNotes(agentId: string): Note[] {
    const s = useStore.getState();
    const a = s.agents.find((x) => x.id === agentId);
    if (!a) return [];
    return s.notes.filter((n) => noteTargets(n, a) && !n.readBy.includes(agentId));
  }

  /** Tasks waiting on this agent, best first (same ordering as the server). */
  queueFor(agentId: string): Task[] {
    return useStore
      .getState()
      .tasks.filter((t) => (t.column === 'todo' || t.column === 'doing') && t.pipeline[t.stage] === agentId && !t.active)
      .sort(
        (a, b) =>
          (a.column === 'doing' ? 0 : 1) - (b.column === 'doing' ? 0 : 1) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          a.createdAt - b.createdAt,
      );
  }

  say(agentId: string, text: string, t = 1.8): void {
    const va = this.agents.get(agentId);
    if (va) va.bubble = { text, t };
  }

  cheer(agentIds: string[]): void {
    const text = translate(useStore.getState().settings.lang, 'bubble_yay');
    for (const id of agentIds) this.say(id, text, 2);
  }

  // ─── Frame update ────────────────────────────────────────────────────────

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.realTime += dt;
    const s = useStore.getState();
    this.sync(s.agents);

    let typing = false;
    for (const va of this.agents.values()) {
      if (va.bubble && (va.bubble.t -= dt) <= 0) va.bubble = null;
      if ((va.blinkT -= dt) <= 0) {
        va.blinking = !va.blinking;
        va.blinkT = va.blinking ? 0.14 : 2.5 + Math.random() * 3;
      }

      const rt = s.runtime[va.id];
      const seat = seatOf(DESKS[va.desk] ?? DESKS[0]);
      va.moving = false;
      va.taskId = rt?.taskId;

      if (rt?.status === 'trip') {
        this.placeOnTrip(va, runtimeValue(rt, s.clockOffset));
      } else {
        if (va.status === 'walking' || va.status === 'reading') va.slot = null;
        va.x = seat.x;
        va.y = seat.y;
        va.facing = 'front';
        if (rt?.status === 'working') {
          va.status = 'working';
          va.progress = runtimeValue(rt, s.clockOffset);
          if (!s.settings.paused) {
            va.typeT += dt;
            typing = true;
            this.sparks(va, dt);
          }
        } else {
          if (va.status !== 'idle') va.idleSince = this.realTime;
          va.status = 'idle';
        }
      }
    }
    if (typing && Math.random() < dt * 3) play('type');
    this.updateEffects(dt);
  }

  private sync(agents: Agent[]) {
    const ids = new Set(agents.map((a) => a.id));
    for (const id of [...this.agents.keys()]) if (!ids.has(id)) this.agents.delete(id);
    for (const a of agents) {
      const va = this.agents.get(a.id);
      if (!va) {
        const seat = seatOf(DESKS[a.desk] ?? DESKS[0]);
        this.agents.set(a.id, {
          id: a.id, desk: a.desk, x: seat.x, y: seat.y, facing: 'front', moving: false, walkDist: 0, typeT: 0, status: 'idle', bubble: null,
          blinkT: 1 + Math.random() * 3, blinking: false, idleSince: this.realTime, slot: null, progress: 0,
        });
      } else if (va.desk !== a.desk) {
        va.desk = a.desk;
      }
    }
  }

  private placeOnTrip(va: VisualAgent, f: number) {
    if (va.slot === null) {
      const used = new Set([...this.agents.values()].map((o) => o.slot));
      va.slot = BOARD_SLOTS.findIndex((_, i) => !used.has(i));
      if (va.slot < 0) va.slot = 0;
    }
    const desk = DESKS[va.desk] ?? DESKS[0];
    const slotX = BOARD_SLOTS[va.slot];
    const there = [seatOf(desk), ...pathToBoard(desk, slotX)];
    const back = [there[there.length - 1], ...pathFromBoard(desk, slotX)];
    let pos: { p: Pt; dx: number; dy: number };
    if (f < TRIP_ARRIVE) {
      const d = (f / TRIP_ARRIVE) * pathLength(there);
      pos = pointAlong(there, d);
      va.walkDist = d;
      va.status = 'walking';
      va.moving = true;
    } else if (f < TRIP_LEAVE) {
      pos = { p: there[there.length - 1], dx: 0, dy: -1 };
      va.status = 'reading';
    } else {
      const d = ((f - TRIP_LEAVE) / (1 - TRIP_LEAVE)) * pathLength(back);
      pos = pointAlong(back, d);
      va.walkDist = d;
      va.status = 'walking';
      va.moving = f < 1;
    }
    va.x = pos.p.x;
    va.y = pos.p.y;
    if (va.status === 'reading') va.facing = 'back';
    else if (Math.abs(pos.dy) > Math.abs(pos.dx)) va.facing = pos.dy < 0 ? 'back' : 'front';
  }

  // ─── Effects ─────────────────────────────────────────────────────────────

  private sparks(va: VisualAgent, dt: number) {
    if (Math.random() >= dt * 4) return;
    const s = useStore.getState();
    const d = DESKS[va.desk] ?? DESKS[0];
    const agent = s.agents.find((a) => a.id === va.id);
    const provider = s.models.find((m) => m.id === agent?.modelId)?.provider;
    this.particles.push({
      x: d.x + 6 + Math.random() * 10, y: d.y - 32, vx: (Math.random() - 0.5) * 4, vy: -10 - Math.random() * 6, g: 0,
      life: 1.2, max: 1.2, color: provider ? PROVIDERS[provider].color : '#9a8aff',
    });
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x, y, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30, g: 90,
        life: 1 + Math.random() * 0.4, max: 1.4, color: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  private deskPoint(agentId: string): Pt | null {
    const va = this.agents.get(agentId);
    if (!va) return null;
    const d = DESKS[va.desk] ?? DESKS[0];
    return { x: d.x + 10, y: d.y - 30 };
  }

  /** Paper flies desk → desk; to or from another person's office it goes through the door. */
  private handoff({ from, to }: { from: string; to: string }) {
    const a = this.deskPoint(from);
    const b = this.deskPoint(to);
    if (!a && !b) return;
    const start = a ?? DOOR;
    const end = b ?? DOOR;
    this.flyers.push({ x0: start.x, y0: start.y, x1: end.x, y1: end.y, t: 0, dur: 1.3 });
    play('paper');
    if (b) setTimeout(() => this.say(to, '!', 1), 1300);
  }

  flyerPos(f: Flyer): Pt {
    const k = Math.min(1, f.t / f.dur);
    return { x: f.x0 + (f.x1 - f.x0) * k, y: f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 28 };
  }

  private updateEffects(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.flyers) f.t += dt;
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
  }
}

export const engine = new Engine();
