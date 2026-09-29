// Strength meter + rule checklist under a password field — ported from WMS. Rules come from
// shared/credentialPolicy.ts, the same file the server enforces.
import { passwordChecks, passwordStrength } from '../../../shared/credentialPolicy';
import type { Lang } from '../../types';

const TONE = ['#d8453e', '#d8453e', '#f0a030', '#3fae6a', '#3fae6a'];
const LABELS = {
  th: ['อ่อนมาก', 'อ่อน', 'พอใช้', 'ดี', 'แข็งแรง'],
  en: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'],
};

export function PasswordStrength({ password, username = '', lang }: { password: string; username?: string; lang: Lang }) {
  if (!password) return null;
  const checks = passwordChecks(password, { username, lang });
  const failing = checks.some((c) => !c.ok);
  // Long and varied but still breaking a rule (e.g. contains the username) must not read as "good".
  const score = failing ? Math.min(passwordStrength(password), 1) : passwordStrength(password);
  return (
    <div className="pw-strength" aria-live="polite">
      <div className="pw-bars">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} style={{ background: i < Math.max(score, 1) ? TONE[score] : undefined }} />
        ))}
        <span style={{ color: TONE[score] }}>{LABELS[lang][score]}</span>
      </div>
      <ul>
        {checks
          .filter((c) => !(c.hiddenWhenOk && c.ok))
          .map((c) => (
            <li key={c.id} className={c.ok ? 'ok' : ''}>
              {c.ok ? '✓' : '○'} {c.label}
            </li>
          ))}
      </ul>
    </div>
  );
}
