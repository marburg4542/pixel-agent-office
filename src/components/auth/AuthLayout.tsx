import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ISO_H, ISO_W } from '../../scene/iso/geom';
import { renderIsoEmptyRoom } from '../../scene/iso/render';
import { SpritePreview } from '../SpritePreview';
import { randomLook } from '../../sprites/character';
import { useStore, useT } from '../../store';

/** Sign-in pages: the office dimmed in the background, a pixel window in front, a greeter on top. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const setLang = useStore((s) => s.setLang);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [greeter] = useState(randomLook);

  useEffect(() => {
    const c = bgRef.current;
    if (!c) return;
    // Drawn at 2× so the text on the wall board stays legible.
    const ctx = c.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    renderIsoEmptyRoom(ctx, 'Pixel Office');
  }, []);

  return (
    <div className="auth-page">
      <canvas ref={bgRef} className="auth-bg pixelated" width={ISO_W * 2} height={ISO_H * 2} aria-hidden />
      <button className="btn dark sm auth-lang" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>
        🌐 {t('language')}
      </button>
      <div className="auth-stack">
        <div className="auth-greeter">
          <SpritePreview look={greeter} scale={4} anim="idle" />
        </div>
        <div className="window auth-window">
          <div className="titlebar">
            <span>🏢 {t('appTitle')}</span>
          </div>
          <div className="window-body">
            <h2 className="auth-title">{title}</h2>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
