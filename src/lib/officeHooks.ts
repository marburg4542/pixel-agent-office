import { useEffect } from 'react';
import { useStore } from '../store';
import { onServerEvent } from './events';
import { translate } from '../../shared/i18n';
import { SIM_SPEEDS, MAX_DESKS } from '../../shared/constants';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Single-key shortcuts for the office (ignored while typing or when a dialog other than the board is open). */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const s = useStore.getState();
      const top = s.modals[s.modals.length - 1];
      if (top && top.kind !== 'board') return;
      const k = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (k === 'b') run(() => (top?.kind === 'board' ? s.closeModal() : s.openModal({ kind: 'board' })));
      else if (k === 'n') run(() => s.openModal({ kind: 'taskEdit' }));
      else if (k === 'm') run(() => s.openModal({ kind: 'noteEdit' }));
      else if (k === 'h' && s.agents.length < MAX_DESKS) run(() => s.openModal({ kind: 'agentEdit' }));
      else if (k === 's') run(() => s.openModal({ kind: 'settings' }));
      else if (k === '?' || (e.shiftKey && k === '/')) run(() => s.openModal({ kind: 'help' }));
      else if (e.key === ' ') run(() => s.togglePause());
      else if (/^[1-4]$/.test(e.key)) run(() => s.setSpeed(SIM_SPEEDS[Number(e.key) - 1]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const NOTIFY_KEY = 'pao.notify';
export const desktopNotify = {
  enabled: (): boolean => {
    try {
      return localStorage.getItem(NOTIFY_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted';
    } catch {
      return false;
    }
  },
  async enable(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    try {
      localStorage.setItem(NOTIFY_KEY, perm === 'granted' ? '1' : '0');
    } catch {
      /* ignore */
    }
    return perm === 'granted';
  },
  disable(): void {
    try {
      localStorage.setItem(NOTIFY_KEY, '0');
    } catch {
      /* ignore */
    }
  },
};

/** Tab title shows how many tasks wait for review; a desktop notification when one arrives while you're away. */
export function useReviewAlerts(): void {
  const review = useStore((s) => s.tasks.filter((t) => t.column === 'review').length);
  useEffect(() => {
    document.title = review > 0 ? `(${review}) Pixel Agent Office` : 'Pixel Agent Office';
  }, [review]);
  useEffect(() => () => void (document.title = 'Pixel Agent Office'), []);

  useEffect(
    () =>
      onServerEvent('feed', (d) => {
        const item = d as { key: string; params?: Record<string, string | number> };
        if (item.key !== 'feed_review' || !document.hidden || !desktopNotify.enabled()) return;
        const lang = useStore.getState().settings.lang;
        try {
          new Notification(translate(lang, 'notify_reviewTitle'), { body: translate(lang, item.key, item.params), tag: 'pao-review' });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }),
    [],
  );
}
