import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_DESKS, useStore, useT } from '../store';
import { MAX_ROOMS } from '../../shared/constants';
import { engine } from '../sim/engine';
import { SCENE_H, SCENE_W } from '../scene/layout';
import { renderBackground } from '../scene/office';
import { hitTest, renderScene, type HoverTarget } from '../scene/render';
import { ModelLabel, RoleLabel, useTicker } from './ui';

/** Narrow and upright: the office sits above the inbox (landscape phones get the laptop layout). */
const PORTRAIT_PHONE = '(max-width: 760px) and (orientation: portrait)';

export function OfficeCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const hoverRef = useRef<HoverTarget | null>(null);
  const [tip, setTip] = useState<{ target: HoverTarget; x: number; y: number } | null>(null);
  const openModal = useStore((s) => s.openModal);
  const theme = useStore((s) => s.settings.officeTheme);
  const bg = useMemo(() => renderBackground(theme), [theme]);

  // Integer device-pixel scale keeps every art pixel crisp.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const cs = getComputedStyle(wrap);
      const w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;
      // On phones the office sits above the inbox and grows with its width (the page scrolls).
      const phone = window.matchMedia(PORTRAIT_PHONE).matches;
      const tabs = wrap.querySelector('.room-tabs')?.getBoundingClientRect().height ?? 0;
      const h = phone ? Infinity : wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 12 - tabs;
      const best = Math.min((w * dpr) / SCENE_W, (h * dpr) / SCENE_H);
      // Whole-number scales keep pixels perfectly crisp; on small screens where that would waste
      // lots of space, fill the space instead (pixels become a hair uneven, which is hard to see).
      let s = Math.max(1, Math.floor(best));
      if (s < best * 0.8) s = Math.max(0.5, best);
      canvas.width = Math.round(SCENE_W * s);
      canvas.height = Math.round(SCENE_H * s);
      canvas.style.width = `${(SCENE_W * s) / dpr}px`;
      canvas.style.height = `${(SCENE_H * s) / dpr}px`;
      scaleRef.current = s;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      engine.update((now - last) / 1000);
      last = now;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const s = scaleRef.current;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        renderScene(ctx, bg, useStore.getState(), hoverRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bg]);

  const locate = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * SCENE_W) / r.width, y: ((e.clientY - r.top) * SCENE_H) / r.height };
  };

  const onMove = (e: React.MouseEvent) => {
    const target = hitTest(locate(e), useStore.getState());
    hoverRef.current = target;
    canvasRef.current!.style.cursor = target ? 'var(--cursor-pointer, pointer)' : 'var(--cursor, default)';
    const wr = wrapRef.current!.getBoundingClientRect();
    setTip(target ? { target, x: e.clientX - wr.left + 16, y: e.clientY - wr.top + 12 } : null);
  };

  const onClick = (e: React.MouseEvent) => {
    const target = hitTest(locate(e), useStore.getState());
    if (!target) return;
    if (target.kind === 'board') openModal({ kind: 'board' });
    else if (target.kind === 'tv') openModal({ kind: 'newsroom' });
    else if (target.kind === 'note') openModal({ kind: 'noteEdit', noteId: target.id });
    else if (target.kind === 'agent') openModal({ kind: 'agent', agentId: target.id });
    else openModal({ kind: 'agentEdit', desk: target.index, room: useStore.getState().room });
  };

  return (
    <div className="stage" ref={wrapRef}>
      <RoomTabs />
      <canvas
        ref={canvasRef}
        className="pixelated"
        onMouseMove={onMove}
        onMouseLeave={() => {
          hoverRef.current = null;
          setTip(null);
        }}
        onClick={onClick}
      />
      {tip && <Tooltip target={tip.target} x={tip.x} y={tip.y} />}
    </div>
  );
}

function Tooltip({ target, x, y }: { target: HoverTarget; x: number; y: number }) {
  const t = useT();
  const agents = useStore((s) => s.agents);
  const teamAgents = useStore((s) => s.teamAgents);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  useTicker(300, target.kind === 'agent');

  let body: React.ReactNode;
  if (target.kind === 'board') body = <div>📋 {t('openBoard')}</div>;
  else if (target.kind === 'tv') body = <div>📺 {t('openNewsroom')}</div>;
  else if (target.kind === 'note') {
    const n = notes.find((x) => x.id === target.id);
    if (!n) return null;
    const to = n.to === 'all' ? t('everyone') : [...agents, ...teamAgents].find((a) => a.id === n.to)?.name ?? '?';
    body = (
      <>
        <div className="tt-sub">📝 → {to}</div>
        <div className="tt-note">{n.text}</div>
      </>
    );
  }
  else if (target.kind === 'desk') body = <div>🪑 {t('clickToHire')}</div>;
  else {
    const a = agents.find((x) => x.id === target.id);
    const va = engine.agents.get(target.id);
    if (!a || !va) return null;
    const task = va.status === 'working' ? tasks.find((x) => x.id === va.taskId) : undefined;
    const unread = engine.unreadNotes(a.id).length;
    body = (
      <>
        <div className="tt-title">{a.name}</div>
        <div className="tt-sub"><RoleLabel agent={a} /> · <ModelLabel modelId={a.modelId} /></div>
        <div style={{ marginTop: 4 }}>
          {t(`st_${va.status}`)}
          {task && ` — ${task.title} (${Math.floor(va.progress)}%)`}
        </div>
        {unread > 0 && <div className="tt-sub">📩 {unread} {t('unread')}</div>}
      </>
    );
  }
  return (
    <div className="tooltip" style={{ left: x, top: y }}>
      {body}
    </div>
  );
}

/** Room tabs: switch rooms, double-click to rename, add up to MAX_ROOMS, remove the last one when empty. */
function RoomTabs() {
  const t = useT();
  const rooms = useStore((s) => s.settings.rooms ?? ['']);
  const room = useStore((s) => s.room);
  const agents = useStore((s) => s.agents);
  const setRoom = useStore((s) => s.setRoom);
  const updateSettings = useStore((s) => s.updateSettings);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const name = (i: number) => rooms[i] || t('roomN', { n: i + 1 });
  const count = (i: number) => agents.filter((a) => (a.room ?? 0) === i).length;

  useEffect(() => {
    if (room >= rooms.length) setRoom(rooms.length - 1);
  }, [room, rooms.length, setRoom]);

  const rename = (i: number) => {
    setEditing(null);
    const v = draft.trim().slice(0, 24);
    if (v !== rooms[i]) void updateSettings({ rooms: rooms.map((r, k) => (k === i ? v : r)) }).catch(() => {});
  };
  const last = rooms.length - 1;

  return (
    <div className="room-tabs" role="tablist" aria-label={t('rooms')}>
      {rooms.map((_, i) =>
        editing === i ? (
          <input
            key={i}
            className="input room-input"
            value={draft}
            maxLength={24}
            autoFocus
            aria-label={t('roomRename')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => rename(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename(i);
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <button
            key={i}
            role="tab"
            aria-selected={room === i}
            className={`room-tab ${room === i ? 'on' : ''}`}
            title={t('roomRenameHint')}
            onClick={() => setRoom(i)}
            onDoubleClick={() => {
              setDraft(rooms[i]);
              setEditing(i);
            }}
          >
            {name(i)} <span className="room-count">{count(i)}/{MAX_DESKS}</span>
          </button>
        ),
      )}
      {rooms.length < MAX_ROOMS && (
        <button
          className="room-tab add"
          title={t('roomAdd')}
          aria-label={t('roomAdd')}
          onClick={() =>
            void updateSettings({ rooms: [...rooms, ''] })
              .then(() => setRoom(rooms.length))
              .catch(() => {})
          }
        >
          ＋
        </button>
      )}
      {rooms.length > 1 && room === last && count(last) === 0 && (
        <button className="room-tab add" title={t('roomRemove')} aria-label={t('roomRemove')} onClick={() => void updateSettings({ rooms: rooms.slice(0, -1) }).catch(() => {})}>
          ✕
        </button>
      )}
    </div>
  );
}
