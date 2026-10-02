import type { State } from '../../store';
import { engine, type VisualAgent } from '../../sim/engine';
import { getSprite, SPR_W } from '../../sprites/character';
import { COLUMNS, NOTE_COLORS } from '../../../shared/constants';
import { PROVIDERS } from '../../../shared/models';
import { roleById } from '../../../shared/roles';
import { translate } from '../../../shared/i18n';
import type { Look, Note } from '../../types';
import { inRect } from '../layout';
import {
  drawBoard, drawBubble, drawClockHands, drawEmote, drawEnvelope, drawNight, drawPaper, drawProgress, drawTv, drawWallNotes, drawWindows,
  nightLevel, rect, setOfficeTheme, text, themeColors, type EmoteKind,
} from '../office';
import { ISO_H, ISO_W, RIGHT_WALL, WALL_H, screenToWall, toGrid, toScreen, wallToScreen, type Pt } from './geom';
import { floorShadow } from './pixels';
import { LEFT_DECOR, RIGHT_DECOR, drawIsoWalls, renderIsoBackground } from './room';
import { DESKS, DESK_D, DESK_H, DESK_W, deskBox, seatOf, type IsoDesk } from './layout';
import {
  chairBackKey, deskKey, drawIsoBookshelf, drawIsoBoxes, drawIsoCabinet, drawIsoChairBack, drawIsoChairSeat, drawIsoCoffee, drawIsoCooler, drawIsoDesk,
  drawIsoHireHint, drawIsoNameTag, drawIsoPlant, isoLampLight,
} from './furniture';

export type HoverTarget =
  | { kind: 'agent'; id: string }
  | { kind: 'board' }
  | { kind: 'desk'; index: number }
  | { kind: 'note'; id: string }
  | { kind: 'tv' };

const PRIO = { high: 0, med: 1, low: 2 } as const;
/** Sticky-note grid on the wall (same as drawWallNotes). */
const NOTE_COLS = 3;
const NOTE_DX = 11;
const NOTE_DY = 10;

/** Feelings that last as long as their reason: a question waiting for an answer, a stuck task. */
function standingEmote(agentId: string, s: State): EmoteKind | null {
  for (const t of s.tasks) {
    if (t.pipeline[t.stage] !== agentId || (t.column !== 'todo' && t.column !== 'doing')) continue;
    if (t.question) return 'question';
    if (t.blocked) return 'sweat';
  }
  return null;
}

/** A wall note wiggles while any agent it's meant for hasn't read it yet. */
function noteUnread(n: Note, s: State): boolean {
  if (n.to !== 'all') return !n.readBy.includes(n.to);
  const targets = n.scope === 'shared' ? s.agents : s.agents.filter((a) => a.ownerId === n.createdBy);
  return targets.some((a) => !n.readBy.includes(a.id));
}

/** Agents sitting in the room on screen. */
export const roomAgents = (s: Pick<State, 'agents' | 'room'>) => s.agents.filter((a) => (a.room ?? 0) === s.room);

/** Top of an agent's sprite on screen (seated people sit on the chair, 11 px up). */
const spriteTop = (va: VisualAgent, p: Pt) => (va.seated ? p.y - 35 : p.y - 37);

function drawAgent(ctx: CanvasRenderingContext2D, look: Look, va: VisualAgent, t: number, paused: boolean): void {
  const p = toScreen(va.gx, va.gy);
  const step = Math.floor(va.walkDist * 5) % 2;
  const pose = va.seated ? 'sit' : va.moving ? (step ? 'walk1' : 'walk2') : 'stand';
  const arms = va.status === 'working' && !paused ? (Math.floor(va.typeT * 7) % 2 ? 'typeL' : 'typeR') : 'rest';
  const back = va.facing === 'ne' || va.facing === 'nw';
  const mirror = va.facing === 'sw' || va.facing === 'nw';
  const spr = getSprite(look, { view: back ? 'back' : 'side', pose, arms, blink: va.blinking });
  const bob = va.moving ? -step : va.seated && va.status === 'idle' ? Math.floor(t * 1.1) % 2 : 0;
  if (!va.seated) floorShadow(ctx, va.gx, va.gy, 7);
  const x = Math.round(p.x - SPR_W / 2);
  const y = Math.round(spriteTop(va, p) + bob);
  if (mirror) {
    ctx.save();
    ctx.translate(x + SPR_W, y);
    ctx.scale(-1, 1);
    ctx.drawImage(spr, 0, 0);
    ctx.restore();
  } else ctx.drawImage(spr, x, y);
}

export function renderIsoScene(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement, s: State, hover: HoverTarget | null): void {
  const agents = roomAgents(s);
  const theme = s.settings.officeTheme ?? 'wood';
  setOfficeTheme(theme);
  const t = engine.realTime;
  const now = engine.debugHour !== undefined ? new Date(2026, 0, 1, engine.debugHour, 30) : new Date();
  const night = nightLevel(now);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0);

  // Walls with everything that changes on them
  const columns = COLUMNS.map((id) => ({
    id,
    cards: s.tasks
      .filter((x) => x.column === id)
      .sort((a, b) => PRIO[a.priority] - PRIO[b.priority])
      .map((x) => ({ priority: x.priority, active: x.active, blocked: !!x.blocked, asking: !!x.question })),
  }));
  const latest = [...s.watchSummaries].sort((a, b) => b.at - a.at)[0];
  drawIsoWalls(ctx, theme, {
    right: (w) => {
      drawClockHands(w, now, RIGHT_DECOR.clock);
      drawTv(w, t, { trend: latest?.trend.map((p) => p.v) ?? [], live: s.watchlists.some((x) => !!x.runTaskId), hover: hover?.kind === 'tv' }, RIGHT_DECOR.tv);
      drawBoard(w, columns, translate(s.settings.lang, 'board'), hover?.kind === 'board', t, RIGHT_DECOR.board);
      drawWallNotes(w, s.notes.map((n) => ({ color: NOTE_COLORS[n.color] ?? NOTE_COLORS[0], unread: noteUnread(n, s) })), t, RIGHT_DECOR.notes);
    },
    left: (w) => drawWindows(w, now, t, LEFT_DECOR.windows),
  });

  // Everything standing on the floor, back to front
  const pal = themeColors();
  const items: { k: number; draw: () => void }[] = [];
  const byDesk = new Map(agents.map((a) => [a.desk, a]));
  for (const d of DESKS) {
    const a = byDesk.get(d.index);
    const va = a && engine.agents.get(a.id);
    const model = a && s.models.find((m) => m.id === a.modelId);
    items.push(...chairItems(ctx, d, pal));
    items.push({
      k: deskKey(d),
      draw: () => {
        drawIsoDesk(ctx, d, {
          empty: !a,
          provider: model ? PROVIDERS[model.provider] : undefined,
          working: va?.status === 'working',
          queue: a ? engine.queueFor(a.id).length : 0,
          night: va?.seated ? night : 0,
          t,
        });
        if (!a && hover?.kind === 'desk' && hover.index === d.index) drawIsoHireHint(ctx, d);
      },
    });
  }
  for (const a of agents) {
    const va = engine.agents.get(a.id);
    if (va) items.push({ k: va.gx + va.gy, draw: () => drawAgent(ctx, a.look, va, t, s.settings.paused) });
  }
  items.push(...furniture(ctx, t));
  items.sort((a, b) => a.k - b.k).forEach((i) => i.draw());

  if (night > 0) {
    const lights: { x: number; y: number; r: number }[] = [];
    for (const a of agents) {
      const va = engine.agents.get(a.id);
      if (va?.seated) lights.push({ ...isoLampLight(DESKS[a.desk] ?? DESKS[0]), r: va.status === 'working' ? 48 : 36 });
    }
    const tv = RIGHT_DECOR.tv;
    lights.push({ ...wallToScreen(RIGHT_WALL, tv.x + tv.w / 2, WALL_H - tv.y - tv.h / 2), r: 30 });
    drawNight(ctx, night, lights, ISO_W, ISO_H);
  }

  // Name tags, then what floats above people (always readable, even at night)
  for (const a of agents) {
    const d = DESKS[a.desk];
    if (d) drawIsoNameTag(ctx, d, a.name, roleById(a.role).color);
  }
  for (const a of agents) {
    const va = engine.agents.get(a.id);
    if (!va) continue;
    const p = toScreen(va.gx, va.gy);
    const head = Math.round(spriteTop(va, p));
    let top = head;
    if (va.status === 'working') {
      drawProgress(ctx, p.x, head - 9, va.progress, roleById(a.role).color);
      top = head - 9;
    }
    const emote = va.emote?.kind ?? standingEmote(a.id, s);
    if (va.bubble) drawBubble(ctx, p.x, top, va.bubble.text);
    else if (emote) drawEmote(ctx, p.x + 7, top - 9 + Math.round(Math.sin(t * 3)), emote);
    else if (engine.unreadNotes(a.id).length) drawEnvelope(ctx, p.x + 5, top - 8 + Math.round(Math.sin(t * 4)));
    else if (va.status === 'idle' && t - va.idleSince > 20) {
      const k = (t * 0.8) % 1;
      text(ctx, 'z', p.x + 6 + k * 3, head - 2 - k * 8, { size: 5 + k * 3, color: `rgba(255,255,255,${1 - k})`, outline: `rgba(42,30,46,${1 - k})`, weight: 700 });
    }
    if (hover?.kind === 'agent' && hover.id === a.id) {
      const y = top - (va.bubble ? 16 : 6) + Math.round(Math.sin(t * 6));
      rect(ctx, p.x - 3, y, 7, 1, '#2a1e2e');
      rect(ctx, p.x - 2, y + 1, 5, 1, '#ffe066');
      rect(ctx, p.x - 1, y + 2, 3, 1, '#ffe066');
      rect(ctx, p.x, y + 3, 1, 1, '#ffe066');
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

/** A desk's chair as two pieces — seat under the sitter, backrest behind them — each sorted on its own. */
function chairItems(ctx: CanvasRenderingContext2D, d: IsoDesk, pal: { chair: string; chairHi: string }): { k: number; draw: () => void }[] {
  const seat = seatOf(d);
  return [
    { k: seat.gx + seat.gy - 0.02, draw: () => drawIsoChairSeat(ctx, seat, d.facing, pal.chair, pal.chairHi) },
    { k: chairBackKey(seat, d.facing), draw: () => drawIsoChairBack(ctx, seat, d.facing, pal.chair, pal.chairHi) },
  ];
}

/** The room's fixed furniture, with depth keys (gx + gy of each piece's middle). */
function furniture(ctx: CanvasRenderingContext2D, t: number): { k: number; draw: () => void }[] {
  return [
    { k: 1.1, draw: () => drawIsoPlant(ctx, 0.55, 0.55, true) },
    { k: 2.6, draw: () => drawIsoBookshelf(ctx, 0.05, 1.1, 2.3) },
    { k: 8.3, draw: () => drawIsoCabinet(ctx, 0.08, 7.3) },
    { k: 12.6, draw: () => drawIsoBoxes(ctx, 0.25, 11.6) },
    { k: 13.9, draw: () => drawIsoPlant(ctx, 0.6, 13.3, false) },
    { k: 16.2, draw: () => drawIsoCoffee(ctx, 14.9, 0.12, t) },
    { k: 17.6, draw: () => drawIsoCooler(ctx, 17.15, 0.45, t) },
    { k: 22.55, draw: () => drawIsoPlant(ctx, 17.4, 5.15, true) },
    { k: 30.6, draw: () => drawIsoPlant(ctx, 17.3, 13.3, false) },
  ];
}

/** The office with nobody in it — the backdrop of the sign-in pages. */
export function renderIsoEmptyRoom(ctx: CanvasRenderingContext2D, title: string): void {
  const now = new Date();
  setOfficeTheme('wood');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(renderIsoBackground('wood'), 0, 0);
  drawIsoWalls(ctx, 'wood', {
    right: (w) => {
      drawClockHands(w, now, RIGHT_DECOR.clock);
      drawTv(w, 0, { trend: [], live: false, hover: false }, RIGHT_DECOR.tv);
      drawBoard(w, COLUMNS.map((id) => ({ id, cards: [] })), title, false, 0, RIGHT_DECOR.board);
    },
    left: (w) => drawWindows(w, now, 0, LEFT_DECOR.windows),
  });
  const pal = themeColors();
  const items: { k: number; draw: () => void }[] = furniture(ctx, 0);
  for (const d of DESKS) {
    items.push(...chairItems(ctx, d, pal));
    items.push({ k: deskKey(d), draw: () => drawIsoDesk(ctx, d, { empty: true, t: 0 }) });
  }
  items.sort((a, b) => a.k - b.k).forEach((i) => i.draw());
}

/** What's under a scene point: people first, then desks, then the things on the wall. */
export function isoHitTest(p: Pt, s: State): HoverTarget | null {
  const visible = new Set(roomAgents(s).map((a) => a.id));
  const vas = [...engine.agents.values()].filter((va) => visible.has(va.id)).sort((a, b) => b.gx + b.gy - (a.gx + a.gy));
  for (const va of vas) {
    const q = toScreen(va.gx, va.gy);
    const top = spriteTop(va, q);
    const bottom = va.seated ? q.y - 10 : q.y;
    if (Math.abs(p.x - q.x) <= 7 && p.y >= top && p.y <= bottom) return { kind: 'agent', id: va.id };
  }

  const desks = [...DESKS].sort((a, b) => deskKey(b) - deskKey(a));
  for (const d of desks) {
    // Is the point over the desk (or its chair) at any height up to a seated person's head?
    const area = deskBox(d, -0.1, DESK_W + 0.1, -0.8, DESK_D);
    for (const z of [0, 5, 10, DESK_H, 22, 30]) {
      const g = toGrid(p.x, p.y + z);
      if (g.gx >= area.gx && g.gx <= area.gx + area.w && g.gy >= area.gy && g.gy <= area.gy + area.d) {
        const a = roomAgents(s).find((x) => x.desk === d.index);
        return a ? { kind: 'agent', id: a.id } : { kind: 'desk', index: d.index };
      }
    }
  }

  const w = screenToWall(RIGHT_WALL, p);
  if (w) {
    const fp = { x: w.f, y: WALL_H - w.v };
    const n = RIGHT_DECOR.notes;
    if (inRect(fp, n)) {
      const col = Math.floor((fp.x - n.x) / NOTE_DX);
      const row = Math.floor((fp.y - n.y + 1) / NOTE_DY);
      const note = s.notes[row * NOTE_COLS + col];
      if (col < NOTE_COLS && note && (fp.x - n.x) % NOTE_DX < 9) return { kind: 'note', id: note.id };
      return { kind: 'board' };
    }
    if (inRect(fp, RIGHT_DECOR.tv)) return { kind: 'tv' };
    const b = RIGHT_DECOR.board;
    if (inRect(fp, { x: b.x, y: b.y - 6, w: b.w, h: b.h + 6 })) return { kind: 'board' };
  }
  return null;
}
