// One shared EventSource for the whole app (browsers cap connections per origin) — adapted from WMS.
// Data events update the store; the rest (bubbles, confetti, hand-offs…) go to listeners.
import { API_BASE } from './api';
import { session } from './session';
import { useStore } from '../store';

const STORE_EVENTS = [
  'task', 'task-deleted', 'task-progress', 'task-stream', 'note', 'note-deleted', 'agent', 'team-agent', 'agent-deleted', 'models', 'settings', 'feed',
  'runtime', 'keys-changed', 'usage-changed', 'watchlist', 'watchlist-deleted', 'watch-report',
];
const BUS_EVENTS = ['bubble', 'stage-done', 'handoff', 'users', 'session-replaced', 'account-disabled'];

type Listener = (data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
let source: EventSource | null = null;
let lastSeen = 0;
let watchdog: ReturnType<typeof setInterval> | undefined;

const emit = (name: string, data: unknown) => {
  for (const fn of listeners.get(name) ?? []) {
    try {
      fn(data);
    } catch (e) {
      console.error('event handler failed', name, e);
    }
  }
};

export function connectEvents(): void {
  if (source) return;
  const token = session.token();
  if (!token) return;
  // EventSource can't send headers, so the token rides in the query string (the server checks it).
  source = new EventSource(`${API_BASE}/api/events?token=${encodeURIComponent(token)}`);
  lastSeen = Date.now();
  for (const name of [...STORE_EVENTS, ...BUS_EVENTS]) {
    source.addEventListener(name, (e) => {
      lastSeen = Date.now();
      let data: unknown = {};
      try {
        data = JSON.parse((e as MessageEvent).data || '{}');
      } catch {
        /* ignore */
      }
      if (STORE_EVENTS.includes(name)) useStore.getState().applyEvent(name, data);
      emit(name, data);
    });
  }
  source.addEventListener('ping', () => (lastSeen = Date.now()));
  source.addEventListener('open', () => {
    lastSeen = Date.now();
    emit('open', {});
  });
  // The server pings every 10 s. A stream that goes quiet for longer was dropped somewhere without the
  // browser noticing (a proxy kept it open) — reconnect, which re-syncs the workspace on 'open'.
  watchdog ??= setInterval(() => {
    if (source && Date.now() - lastSeen > 25_000) {
      source.close();
      source = null;
      connectEvents();
    }
  }, 5_000);
}

export function disconnectEvents(): void {
  source?.close();
  source = null;
  if (watchdog) clearInterval(watchdog);
  watchdog = undefined;
}

export function onServerEvent(name: string, fn: Listener): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}
