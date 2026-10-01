import type { State } from '../store';
import { engine, type VisualAgent } from '../sim/engine';
import { getSprite } from '../sprites/character';
import { COLUMNS, NOTE_COLORS } from '../../shared/constants';
import { PROVIDERS } from '../../shared/models';
import { roleById } from '../../shared/roles';
import { translate } from '../../shared/i18n';
import type { Look, Note } from '../types';
import { BOARD, DESKS, NOTES_AREA, TV, inRect, seatOf, type Pt } from './layout';

/** Feelings that last as long as their reason: a question waiting for an answer, a stuck task. */
function standingEmote(agentId: string, s: State): EmoteKind | null {
  for (const t of s.tasks) {
    if (t.pipeline[t.stage] !== agentId || (t.column !== 'todo' && t.column !== 'doing')) continue;
    if (t.question) return 'question';
    if (t.blocked) return 'sweat';
  }
  return null;
}
import {
  drawBoard, drawBubble, drawCabinet, drawChair, drawClockHands, drawDesk, drawEnvelope, drawPaper,
  drawEmote, drawNight, setOfficeTheme, drawPlant, drawProgress, drawTv, drawWallNotes, drawWaterCooler, drawWindows, lampLight, nightLevel, rect, text,
  type EmoteKind,
} from './office';

export type HoverTarget =
  | { kind: 'agent'; id: string }
  | { kind: 'board' }
  | { kind: 'desk'; index: number }
  | { kind: 'note'; id: string }
  | { kind: 'tv' };

const PRIO = { high: 0, med: 1, low: 2 } as const;

/** A wall note wiggles while any agent it's meant for hasn't read it yet. */
function noteUnread(n: Note, s: State): boolean {
  if (n.to !== 'all') return !n.readBy.includes(n.to);
  const targets = n.scope === 'shared' ? s.agents : s.agents.filter((a) => a.ownerId === n.createdBy);
  return targets.some((a) => !n.readBy.includes(a.id));
}

/** Agents sitting in the room on screen. */
export const roomAgents = (s: Pick<State, 'agents' | 'room'>) => s.agents.filter((a) => (a.room ?? 0) === s.room);

export function renderScene(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, s: State, hover: HoverTarget | null): void {
  const agents = roomAgents(s);
  setOfficeTheme(s.settings.officeTheme);
  const t = engine.realTime;
  const now = engine.debugHour !== undefined ? new Date(2026, 0, 1, engine.debugHour, 30) : new Date();
  const night = nightLevel(now);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0);
  drawWindows(ctx, now, t);
  drawClockHands(ctx, now);

  const columns = COLUMNS.map((id) => ({
    id,
    cards: s.tasks
      .filter((x) => x.column === id)
      .sort((a, b) => PRIO[a.priority] - PRIO[b.priority])
      .map((x) => ({ priority: x.priority, active: x.active, blocked: !!x.blocked, asking: !!x.question })),
  }));
  drawBoard(ctx, columns, translate(s.settings.lang, 'board'), hover?.kind === 'board', t);
  const latest = [...s.watchSummaries].sort((a, b) => b.at - a.at)[0];
  drawTv(ctx, t, { trend: latest?.trend.map((p) => p.v) ?? [], live: s.watchlists.some((w) => !!w.runTaskId), hover: hover?.kind === 'tv' });
  drawWallNotes(ctx, s.notes.map((n) => ({ color: NOTE_COLORS[n.color] ?? NOTE_COLORS[0], unread: noteUnread(n, s) })), t);

  // Depth-sorted scene objects
  const items: { y: number; draw: () => void }[] = [];
  const byDesk = new Map(agents.map((a) => [a.desk, a]));
  for (const d of DESKS) {
    const a = byDesk.get(d.index);
    const seat = seatOf(d);
    const va = a && engine.agents.get(a.id);
    const model = a && s.models.find((m) => m.id === a.modelId);
    items.push({ y: seat.y - 0.5, draw: () => drawChair(ctx, seat.x, seat.y) });
    items.push({
      y: d.y,
      draw: () =>
        drawDesk(ctx, d, {
          empty: !a,
          name: a?.name,
          roleColor: a ? roleById(a.role).color : undefined,
          provider: model ? PROVIDERS[model.provider] : undefined,
          working: va?.status === 'working',
          queue: a ? engine.queueFor(a.id).length : 0,
          hover: hover?.kind === 'desk' && hover.index === d.index,
          night: a && va && va.status !== 'walking' ? night : 0,
          t,
        }),
    });
  }
  for (const a of agents) {
    const va = engine.agents.get(a.id);
    if (va) items.push({ y: va.y, draw: () => drawAgent(ctx, a.look, va, t, s.settings.paused) });
  }
  items.push({ y: 90, draw: () => drawPlant(ctx, 14, 90, true) });
  items.push({ y: 90, draw: () => drawPlant(ctx, 386, 90, true) });
  items.push({ y: 172, draw: () => drawCabinet(ctx, 14, 172) });
  items.push({ y: 172, draw: () => drawWaterCooler(ctx, 388, 172, t) });
  items.push({ y: 222, draw: () => drawPlant(ctx, 12, 222, false) });
  items.push({ y: 222, draw: () => drawPlant(ctx, 390, 222, false) });
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

  if (night > 0) {
    const lights: { x: number; y: number; r: number }[] = [];
    for (const a of agents) {
      const va = engine.agents.get(a.id);
      if (!va || va.status === 'walking' || va.status === 'reading') continue;
      lights.push({ ...lampLight(DESKS[a.desk] ?? DESKS[0]), r: va.status === 'working' ? 34 : 26 });
    }
    lights.push({ x: TV.x + TV.w / 2, y: TV.y + TV.h / 2, r: 22 });
    drawNight(ctx, night, lights);
  }

  // Overlays (always on top)
  for (const a of agents) {
    const va = engine.agents.get(a.id);
    if (!va) continue;
    const head = Math.round(va.y - 26);
    let top = head;
    if (va.status === 'working') {
      drawProgress(ctx, va.x, head - 9, va.progress, roleById(a.role).color);
      top = head - 9;
    }
    const emote = va.emote?.kind ?? standingEmote(a.id, s);
    if (va.bubble) drawBubble(ctx, va.x, top, va.bubble.text);
    else if (emote) drawEmote(ctx, va.x + 7, top - 9 + Math.round(Math.sin(t * 3)), emote);
    else if (engine.unreadNotes(a.id).length) drawEnvelope(ctx, va.x + 5, top - 8 + Math.round(Math.sin(t * 4)));
    else if (va.status === 'idle' && t - va.idleSince > 20) {
      const k = (t * 0.8) % 1;
      text(ctx, 'z', va.x + 6 + k * 3, head - 2 - k * 8, { size: 5 + k * 3, color: `rgba(255,255,255,${1 - k})`, outline: `rgba(42,30,46,${1 - k})`, weight: 700 });
    }
    if (hover?.kind === 'agent' && hover.id === a.id) {
      const y = top - (va.bubble ? 16 : 6) + Math.round(Math.sin(t * 6));
      rect(ctx, va.x - 3, y, 7, 1, '#2a1e2e');
      rect(ctx, va.x - 2, y + 1, 5, 1, '#ffe066');
      rect(ctx, va.x - 1, y + 2, 3, 1, '#ffe066');
      rect(ctx, va.x, y + 3, 1, 1, '#ffe066');
    }
  }

  for (const p of engine.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    rect(ctx, p.x, p.y, 1, 1, p.color);
  }
  ctx.globalAlpha = 1;
  for (const f of engine.flyers) {
    const pos = engine.flyerPos(f);
    drawPaper(ctx, pos.x, pos.y);
  }
}

function drawAgent(ctx: CanvasRenderingContext2D, look: Look, va: VisualAgent, t: number, paused: boolean): void {
  const step = Math.floor(va.walkDist / 5) % 2;
  const legs = va.moving ? (step ? 'walk1' : 'walk2') : 'stand';
  const arms = va.status === 'working' && !paused ? (Math.floor(va.typeT * 7) % 2 ? 'typeL' : 'typeR') : 'rest';
  const view = va.facing === 'left' || va.facing === 'right' ? 'side' : va.facing;
  const spr = getSprite(look, { view, legs, arms, blink: va.blinking });
  const bob = va.moving ? -step : va.status === 'idle' ? Math.floor(t * 1.1) % 2 : 0;
  if (va.status === 'walking' || va.status === 'reading') rect(ctx, va.x - 5, va.y - 1, 10, 2, 'rgba(40,20,10,0.25)');
  const x = Math.round(va.x - 8);
  const y = Math.round(va.y - 26 + bob);
  if (va.facing === 'left') {
    ctx.save();
    ctx.translate(x + 16, y);
    ctx.scale(-1, 1);
    ctx.drawImage(spr, 0, 0);
    ctx.restore();
  } else ctx.drawImage(spr, x, y);
}

export function hitTest(p: Pt, s: State): HoverTarget | null {
  const vas = [...engine.agents.values()].sort((a, b) => b.y - a.y);
  for (const va of vas) {
    if (Math.abs(p.x - va.x) <= 7 && p.y >= va.y - 26 && p.y <= va.y) return { kind: 'agent', id: va.id };
  }
  // Individual sticky notes on the wall (same grid as drawWallNotes).
  if (inRect(p, NOTES_AREA)) {
    const col = Math.floor((p.x - NOTES_AREA.x) / 11);
    const row = Math.floor((p.y - NOTES_AREA.y + 1) / 10);
    const n = s.notes[row * 3 + col];
    if (col < 3 && n && (p.x - NOTES_AREA.x) % 11 < 9) return { kind: 'note', id: n.id };
  }
  if (inRect(p, TV)) return { kind: 'tv' };
  if (inRect(p, { x: BOARD.x, y: BOARD.y - 6, w: BOARD.w, h: BOARD.h + 6 }) || inRect(p, NOTES_AREA)) return { kind: 'board' };
  for (const d of DESKS) {
    if (p.x >= d.x - 26 && p.x <= d.x + 26 && p.y >= d.y - 42 && p.y <= d.y + 2) {
      const a = roomAgents(s).find((x) => x.desk === d.index);
      return a ? { kind: 'agent', id: a.id } : { kind: 'desk', index: d.index };
    }
  }
  return null;
}
