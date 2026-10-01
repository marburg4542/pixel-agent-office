import { useToasts } from '../lib/toast';

const ICON = { info: '💬', success: '✅', error: '⛔', warn: '⚠️' } as const;

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span>{ICON[t.tone]}</span>
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="btn sm"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="close">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
