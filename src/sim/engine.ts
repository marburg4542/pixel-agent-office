// Visual engine: turns the server's agent runtime (idle / trip / working, see shared/types) into
// positions and animation for the canvas. All decisions happen on the server — nothing here
// changes data.
import { runtimeValue, useStore } from '../store';
import { AISLE_MID, AISLE_TOP, BOARD_SLOTS, DESKS, SCENE_W, pathFromBoard, pathToBoard, seatOf, type DeskPos, type Pt } from '../scene/layout';
import type { EmoteKind } from '../scene/office';
import { TRIP_ARRIVE, TRIP_LEAVE } from '../../shared/constants';
import { PROVIDERS } from '../../shared/models';
import { translate } from '../../shared/i18n';
import type { Agent, Note, Task } from '../types';
import { onServerEvent } from '../lib/events';
import { play } from '../lib/sound';
import { openStepFor } from '../../shared/pipeline';

export type AgentStatus = 'idle' | 'walking' | 'reading' | 'working';

export interface VisualAgent {
  id: string;
  desk: number;
  x: number;
  y: number;
  facing: 'front' | 'back' | 'left' | 'right';
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
  /** A short feeling shown above the head. */
  emote: { kind: EmoteKind; t: number } | null;
  /** Something to do while idle: a walk to the water cooler or a plant and back. */
  wander: Wander | null;
}

interface Wander {
  kind: 'coffee' | 'plant';
  there: Pt[];
  len: number;
  d: number;
  phase: 'go' | 'stay' | 'back';
  stay: number;
}

/** Where idle agents like to go. */
const SPOTS = {
  coffee: { x: 374, y: 174 },
  plantL: { x: 28, y: 92 },
  plantR: { x: 372, y: 92 },
};
const CORRIDOR_XS = [106, 200, 294];
const WANDER_SPEED = 26;

/** Seat → spot, along the aisles (row-0 desks go around their desk through a corridor). */
function pathToSpot(desk: DeskPos, spot: Pt, viaMid: boolean): Pt[] {
  const seat = seatOf(desk);
  if (!viaMid) {
    const pts = pathToBoard(desk, spot.x);
    pts[pts.length - 1] = spot;
    return [seat, ...pts];
  }
  if (desk.row === 1) return [seat, { x: seat.x, y: AISLE_MID }, { x: spot.x, y: AISLE_MID }, spot];
  const cx = CORRIDOR_XS.reduce((b, c) => (Math.abs(c - seat.x) < Math.abs(b - seat.x) ? c : b), CORRIDOR_XS[0]);
  return [seat, { x: seat.x, y: AISLE_TOP }, { x: cx, y: AISLE_TOP }, { x: cx, y: AISLE_MID }, { x: spot.x, y: AISLE_MID }, spot];
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

/** Which way to face while walking along (dx, dy). */
const faceFor = (dx: number, dy: number): VisualAgent['facing'] =>
  Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'back' : 'front') : dx < 0 ? 'left' : 'right';

/** Is this note addressed to this agent? Mirrors the server rule. */
const noteTargets = (n: Note, a: Agent) => n.to === a.id || (n.to === 'all' && (n.scope === 'shared' || n.createdBy === a.ownerId));

class Engine {
  agents = new Map<string, VisualAgent>();
  particles: Particle[] = [];
  flyers: Flyer[] = [];
  /** Real seconds since start — cosmetic animation clock. */
  realTime = 0;
  /** Pretend it is this hour (0–23) for the day/night look — handy for testing, unset normally. */
  debugHour: number | undefined = undefined;

  constructor() {
    onServerEvent('bubble', (d) => {
      const { agentId, key } = d as { agentId: string; key: string };
      this.say(agentId, translate(useStore.getState().settings.lang, `bubble_${key}`));
      if (key === 'gotIt') play('note');
      if (key === 'oops') play('error');
      if (key === 'ask' || key === 'revise') play('review');
      this.emote(agentId, key === 'oops' ? 'anger' : key === 'ask' ? 'question' : key === 'revise' ? 'sweat' : key === 'done' ? 'heart' : null);
    });
    onServerEvent('stage-done', (d) => {
      const va = this.agents.get((d as { agentId: string }).agentId);
      if (va) {
        this.burst(va.x, va.y - 24);
        va.emote = { kind: 'heart', t: 2.5 };
      }
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
      .tasks.filter((t) => (t.column === 'todo' || t.column === 'doing') && openStepFor(t, agentId) >= 0 && !t.question)
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
    for (const id of agentIds) {
      this.say(id, text, 2);
      this.emote(id, 'heart', 3);
    }
  }

  emote(agentId: string, kind: EmoteKind | null, t = 2.5): void {
    const va = this.agents.get(agentId);
    if (va && kind) va.emote = { kind, t };
  }

  // ─── Frame update ────────────────────────────────────────────────────────

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.realTime += dt;
    const s = useStore.getState();
    this.sync(s.agents.filter((a) => (a.room ?? 0) === s.room));

    let typing = false;
    for (const va of this.agents.values()) {
      if (va.bubble && (va.bubble.t -= dt) <= 0) va.bubble = null;
      if (va.emote && (va.emote.t -= dt) <= 0) va.emote = null;
      if ((va.blinkT -= dt) <= 0) {
        va.blinking = !va.blinking;
        va.blinkT = va.blinking ? 0.14 : 2.5 + Math.random() * 3;
      }

      const rt = s.runtime[va.id];
      const seat = seatOf(DESKS[va.desk] ?? DESKS[0]);
      va.moving = false;
      va.taskId = rt?.taskId;

      if (rt?.status === 'trip' || rt?.status === 'working') va.wander = null;
      if (rt?.status === 'trip') {
        this.placeOnTrip(va, runtimeValue(rt, s.clockOffset));
      } else if (va.wander || (!s.settings.paused && this.maybeWander(va, dt))) {
        if (!s.settings.paused) this.stepWander(va, dt);
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
          blinkT: 1 + Math.random() * 3, blinking: false, idleSince: this.realTime, slot: null, progress: 0, emote: null, wander: null,
        });
      } else if (va.desk !== a.desk) {
        va.desk = a.desk;
      }
    }
  }

  /** Idle for a while? Sometimes get a coffee or water a plant. */
  private maybeWander(va: VisualAgent, dt: number): boolean {
    if (va.status !== 'idle' || this.realTime - va.idleSince < 15 || Math.random() > dt / 45) return false;
    if ([...this.agents.values()].filter((o) => o.wander).length >= 2) return false;
    const desk = DESKS[va.desk] ?? DESKS[0];
    const coffee = Math.random() < 0.6;
    const spot = coffee ? SPOTS.coffee : seatOf(desk).x < 200 ? SPOTS.plantL : SPOTS.plantR;
    const there = pathToSpot(desk, spot, coffee);
    va.wander = { kind: coffee ? 'coffee' : 'plant', there, len: pathLength(there), d: 0, phase: 'go', stay: coffee ? 4 : 3 };
    return true;
  }

  private stepWander(va: VisualAgent, dt: number) {
    const w = va.wander!;
    if (w.phase === 'stay') {
      va.facing = w.kind === 'coffee' ? 'right' : 'back';
      if (!va.emote) va.emote = { kind: w.kind === 'coffee' ? 'cup' : 'drop', t: w.stay };
      if (w.kind === 'plant' && Math.random() < dt * 6) {
        const spot = w.there[w.there.length - 1];
        this.particles.push({ x: spot.x - 12 + Math.random() * 6, y: spot.y - 14, vx: 0, vy: 12, g: 30, life: 0.6, max: 0.6, color: '#7ec8ff' });
      }
      if ((w.stay -= dt) <= 0) {
        w.phase = 'back';
        w.d = 0;
        va.emote = null;
      }
      return;
    }
    w.d += WANDER_SPEED * dt;
    const path = w.phase === 'go' ? w.there : [...w.there].reverse();
    const pos = pointAlong(path, Math.min(w.d, w.len));
    va.x = pos.p.x;
    va.y = pos.p.y;
    va.walkDist = w.d;
    va.moving = true;
    va.status = 'walking';
    va.facing = faceFor(pos.dx, pos.dy);
    if (w.d >= w.len) {
      if (w.phase === 'go') w.phase = 'stay';
      else {
        va.wander = null;
        va.status = 'idle';
        va.idleSince = this.realTime;
        va.moving = false;
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
    else va.facing = faceFor(pos.dx, pos.dy);
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

// Dev only: reach the engine from the console (e.g. paoEngine.debugHour = 21 to see the night).
if (import.meta.env.DEV) (window as unknown as { paoEngine?: Engine }).paoEngine = engine;
