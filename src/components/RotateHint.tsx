import { useT } from '../store';

/**
 * Phones and tablets held upright see this instead of the app (CSS shows it only for touch screens in
 * portrait). Installed on Android the app is locked to landscape; iOS can't lock, so it asks.
 */
export function RotateHint() {
  const t = useT();
  return (
    <div className="rotate-hint">
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
        <rect x="4" y="1" width="8" height="14" fill="#2a1e2e" />
        <rect x="5" y="2" width="6" height="10" fill="#7fb7ff" />
        <rect x="6" y="3" width="2" height="2" fill="#ffe066" />
        <rect x="7" y="13" width="2" height="1" fill="#c9ccd6" />
      </svg>
      <strong>{t('rotate_title')}</strong>
      <span>{t('rotate_body')}</span>
    </div>
  );
}
