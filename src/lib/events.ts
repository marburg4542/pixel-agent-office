// One shared EventSource for the whole app (browsers cap connections per origin) — adapted from WMS.
// Data events update the store; the rest (bubbles, confetti, hand-offs…) go to listeners.
import { API_BASE } from './api';
import { session } from './session';
import { useStore } from '../store';

const STORE_EVENTS = [
  'task', 'task-deleted', 'task-progress', 'note', 'note-deleted', 'agent', 'team-agent', 'agent-deleted', 'models', 'settings', 'feed', 'runtime',
];
const BUS_EVENTS = ['bubble', 'stage-done', 'handoff', 'users', 'session-replaced', 'account-disabled'];

type Listener = (data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
let source: EventSource | null = null;

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
  for (const name of [...STORE_EVENTS, ...BUS_EVENTS]) {
    source.addEventListener(name, (e) => {
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
  source.addEventListener('open', () => emit('open', {}));
}

export function disconnectEvents(): void {
  source?.close();
  source = null;
}

export function onServerEvent(name: string, fn: Listener): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}
