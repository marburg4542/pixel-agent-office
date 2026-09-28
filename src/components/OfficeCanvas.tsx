import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { engine } from '../sim/engine';
import { SCENE_H, SCENE_W } from '../scene/layout';
import { renderBackground } from '../scene/office';
import { hitTest, renderScene, type HoverTarget } from '../scene/render';
import { ModelLabel, RoleLabel, useTicker } from './ui';

export function OfficeCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const hoverRef = useRef<HoverTarget | null>(null);
  const [tip, setTip] = useState<{ target: HoverTarget; x: number; y: number } | null>(null);
  const openModal = useStore((s) => s.openModal);
  const bg = useMemo(() => renderBackground(), []);

  // Integer device-pixel scale keeps every art pixel crisp.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const cs = getComputedStyle(wrap);
      const w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;
      const h = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 12;
      const s = Math.max(1, Math.floor(Math.min((w * dpr) / SCENE_W, (h * dpr) / SCENE_H)));
      canvas.width = SCENE_W * s;
      canvas.height = SCENE_H * s;
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
    canvasRef.current!.style.cursor = target ? 'pointer' : 'default';
    const wr = wrapRef.current!.getBoundingClientRect();
    setTip(target ? { target, x: e.clientX - wr.left + 16, y: e.clientY - wr.top + 12 } : null);
  };

  const onClick = (e: React.MouseEvent) => {
    const target = hitTest(locate(e), useStore.getState());
    if (!target) return;
    if (target.kind === 'board') openModal({ kind: 'board' });
    else if (target.kind === 'agent') openModal({ kind: 'agent', agentId: target.id });
    else openModal({ kind: 'agentEdit', desk: target.index });
  };

  return (
    <div className="stage" ref={wrapRef}>
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
  const tasks = useStore((s) => s.tasks);
  useTicker(300, target.kind === 'agent');

  let body: React.ReactNode;
  if (target.kind === 'board') body = <div>📋 {t('openBoard')}</div>;
  else if (target.kind === 'desk') body = <div>🪑 {t('clickToHire')}</div>;
  else {
    const a = agents.find((x) => x.id === target.id);
    const rt = engine.agents.get(target.id);
    if (!a || !rt) return null;
    const task = rt.work && tasks.find((x) => x.id === rt.work!.taskId);
    const unread = engine.unreadNotes(a.id).length;
    body = (
      <>
        <div className="tt-title">{a.name}</div>
        <div className="tt-sub"><RoleLabel agent={a} /> · <ModelLabel modelId={a.modelId} /></div>
        <div style={{ marginTop: 4 }}>
          {t(`st_${rt.status}`)}
          {task && ` — ${task.title} (${Math.floor(rt.work!.progress)}%)`}
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
