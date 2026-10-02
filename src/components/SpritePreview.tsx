import { useEffect, useRef } from 'react';
import type { Look } from '../types';
import { getSprite, SPR_H, SPR_W, type View } from '../sprites/character';

export type PreviewAnim = 'idle' | 'work' | 'walk';

/** Animated, scaled-up character for the creator, the agent profile and the sign-in greeter. */
export function SpritePreview({ look, view = 'front', anim = 'idle', scale = 6 }: { look: Look; view?: View; anim?: PreviewAnim; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = SPR_W * scale;
  const h = (SPR_H + 1) * scale;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const t = (now - start) / 1000;
      const step = Math.floor(t * 6) % 2;
      const spr = getSprite(look, {
        view,
        pose: anim === 'walk' ? (step ? 'walk1' : 'walk2') : 'stand',
        arms: anim === 'work' && view !== 'back' ? (Math.floor(t * 7) % 2 ? 'typeL' : 'typeR') : 'rest',
        blink: t % 3.2 < 0.14,
      });
      const bob = anim === 'walk' ? -step : anim === 'idle' ? Math.floor(t * 1.1) % 2 : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(spr, 0, 0, SPR_W, SPR_H, 0, (1 + bob) * scale, w, SPR_H * scale);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [look, view, anim, scale, w, h]);

  return <canvas ref={ref} width={w} height={h} className="pixelated" style={{ width: w, height: h }} />;
}
