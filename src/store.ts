// Client state: a mirror of the server's workspace for the signed-in user, kept fresh by SSE events.
// Every change goes through the API; the server's reply (and its event) is the truth.
import { create } from 'zustand';
import type {
  Agent, AgentRuntime, ApiKeyStatus, ColumnId, FeedItem, Lang, LiveText, LogParams, Modal, ModelDef, Note, PublicUser, Task, TeamAgent, UsageSummary,
  UserSettings, Watchlist, WatchSummary, Workspace,
} from './types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { translate } from '../shared/i18n';
import { API_BASE, api } from './lib/api';
import { session } from './lib/session';
import { configureSound } from './lib/sound';
import { toast } from './lib/toast';

export { MAX_DESKS } from '../shared/constants';

interface Data {
  user: PublicUser | null;
  settings: UserSettings;
  agents: Agent[];
  teamAgents: TeamAgent[];
  tasks: Task[];
  notes: Note[];
  models: ModelDef[];
  feed: FeedItem[];
  runtime: Record<string, AgentRuntime>;
  keys: ApiKeyStatus[];
  usage: UsageSummary;
  /** Text a real model is writing right now, by task id. */
  live: Record<string, LiveText>;
  watchlists: Watchlist[];
  watchSummaries: WatchSummary[];
  /** serverTime − Date.now(), to extrapolate runtime values that carry server timestamps. */
  clockOffset: number;
  loaded: boolean;
}

interface Actions {
  load: (ws: Workspace) => void;
  reset: () => void;
  setUser: (u: PublicUser) => void;

  setLang: (l: Lang) => void;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  togglePause: () => void;
  setSpeed: (n: number) => void;

  openModal: (m: Modal) => void;
  closeModal: () => void;

  addAgent: (a: Partial<Agent>) => Promise<Agent>;
  updateAgent: (id: string, patch: Partial<Agent>) => Promise<Agent>;
  removeAgent: (id: string) => Promise<void>;

  addTask: (t: TaskPatch) => Promise<Task>;
  updateTask: (id: string, patch: TaskPatch) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (id: string, column: ColumnId) => Promise<void>;
  restartTask: (id: string) => Promise<void>;
  approveTask: (id: string) => Promise<void>;
  requestChanges: (id: string, agentId: string, text: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  answerQuestion: (id: string, text: string) => Promise<void>;
  startArena: (id: string, stage: number, modelIds: string[], blind: boolean) => Promise<void>;
  pickArena: (id: string, modelId: string, use: boolean) => Promise<void>;
  closeArena: (id: string) => Promise<void>;
  setKeys: (keys: ApiKeyStatus[]) => void;
  refreshUsage: () => Promise<void>;

  saveWatchlist: (id: string | undefined, input: WatchlistInput) => Promise<Watchlist>;
  deleteWatchlist: (id: string) => Promise<void>;
  runWatchlist: (id: string) => Promise<void>;

  addNote: (n: NoteInput) => Promise<Note>;
  updateNote: (id: string, patch: NoteInput) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;

  addModel: (m: Partial<ModelDef>) => Promise<void>;
  updateModel: (id: string, patch: ModelPatch) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  resetModels: () => Promise<void>;

  /** Apply a server-sent event. */
  applyEvent: (name: string, data: unknown) => void;
}

export type State = Data & { modals: Modal[] } & Actions;

/** `null` prices clear them. */
export type ModelPatch = Partial<Omit<ModelDef, 'priceIn' | 'priceOut'>> & { priceIn?: number | null; priceOut?: number | null };

export type WatchlistInput = Partial<Pick<Watchlist, 'name' | 'scope' | 'research' | 'schedule' | 'agentId'>>;

/** `research: null` removes the research from a task. */
export type TaskPatch = Omit<Partial<Task>, 'research'> & { research?: Task['research'] | null };

/** `taskId: null` unlinks a note from its task. */
export type NoteInput = Partial<Omit<Note, 'taskId'>> & { taskId?: string | null };

const empty = (): Data => ({
  user: null,
  settings: { ...DEFAULT_SETTINGS, lang: session.lang() },
  agents: [],
  teamAgents: [],
  tasks: [],
  notes: [],
  models: [],
  feed: [],
  runtime: {},
  keys: [],
  usage: { month: '', costUsd: 0, tokensIn: 0, tokensOut: 0, calls: 0, byModel: [] },
  live: {},
  watchlists: [],
  watchSummaries: [],
  clockOffset: 0,
  loaded: false,
});

// ─── Deletes with undo ───────────────────────────────────────────────────────
// Deleting hides the item right away and shows an "Undo" toast; the server call happens a few
// seconds later (or immediately if the page is closed).
const UNDO_MS = 6500; // a little longer than the toast (6 s) so "Undo" is never too late
const pendingDeletes = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [, p] of pendingDeletes) {
      clearTimeout(p.timer);
      p.run();
    }
    pendingDeletes.clear();
  });
}

function deleteWithUndo(opts: { id: string; path: string; label: string; hide: () => void; restore: () => void }) {
  opts.hide();
  const run = () => {
    const token = session.token();
    // keepalive lets the request finish even while the page is unloading.
    void fetch(`${API_BASE}/api${opts.path}`, { method: 'DELETE', keepalive: true, headers: token ? { Authorization: `Bearer ${token}`, 'X-Lang': session.lang() } : {} })
      .then((r) => {
        if (!r.ok) opts.restore();
      })
      .catch(() => opts.restore());
  };
  const timer = setTimeout(() => {
    pendingDeletes.delete(opts.id);
    run();
  }, UNDO_MS);
  pendingDeletes.set(opts.id, { timer, run });
  toast.withAction(opts.label, translate(session.lang(), 'undo'), () => {
    clearTimeout(timer);
    pendingDeletes.delete(opts.id);
    opts.restore();
  });
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};
const without = <T extends { id: string }>(list: T[], id: string) => list.filter((x) => x.id !== id);

export const useStore = create<State>()((set, get) => {
  const applySettings = (settings: UserSettings) => {
    session.setLang(settings.lang);
    configureSound({ enabled: settings.sound, volume: settings.volume });
    set({ settings });
  };

  return {
    ...empty(),
    modals: [],

    load: (ws) => {
      applySettings(ws.settings);
      set({
        user: ws.user,
        agents: ws.agents,
        teamAgents: ws.teamAgents,
        tasks: ws.tasks,
        notes: ws.notes,
        models: ws.models,
        feed: ws.feed,
        runtime: Object.fromEntries(ws.runtime.map((r) => [r.agentId, r])),
        keys: ws.keys,
        usage: ws.usage,
        live: ws.live ?? {},
        watchlists: ws.watchlists ?? [],
        watchSummaries: ws.watchSummaries ?? [],
        clockOffset: ws.serverTime - Date.now(),
        loaded: true,
      });
    },
    reset: () => set({ ...empty(), modals: [] }),
    setUser: (user) => set({ user }),

    setLang: (lang) => {
      session.setLang(lang);
      set({ settings: { ...get().settings, lang } });
      if (get().user) void get().updateSettings({ lang });
    },
    updateSettings: async (patch) => {
      applySettings({ ...get().settings, ...patch }); // optimistic
      applySettings(await api<UserSettings>('/settings', { method: 'PUT', body: patch }));
    },
    togglePause: () => void get().updateSettings({ paused: !get().settings.paused }),
    setSpeed: (simSpeed) => void get().updateSettings({ simSpeed }),

    openModal: (m) => set((s) => ({ modals: [...s.modals, m] })),
    closeModal: () => set((s) => ({ modals: s.modals.slice(0, -1) })),

    addAgent: async (a) => {
      const agent = await api<Agent>('/agents', { method: 'POST', body: a });
      set((s) => ({ agents: upsert(s.agents, agent) }));
      return agent;
    },
    updateAgent: async (id, patch) => {
      const agent = await api<Agent>(`/agents/${id}`, { method: 'PUT', body: patch });
      set((s) => ({ agents: upsert(s.agents, agent) }));
      return agent;
    },
    removeAgent: async (id) => {
      await api(`/agents/${id}`, { method: 'DELETE' });
      set((s) => ({ agents: without(s.agents, id) }));
    },

    addTask: async (t) => {
      const task = await api<Task>('/tasks', { method: 'POST', body: t });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
      return task;
    },
    updateTask: async (id, patch) => {
      const task = await api<Task>(`/tasks/${id}`, { method: 'PUT', body: patch });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
      return task;
    },
    deleteTask: async (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      deleteWithUndo({
        id,
        path: `/tasks/${id}`,
        label: translate(get().settings.lang, 'deletedTask', { title: task.title }),
        hide: () => set((s) => ({ tasks: without(s.tasks, id) })),
        restore: () => set((s) => ({ tasks: upsert(s.tasks, task) })),
      });
    },
    moveTask: async (id, column) => {
      const before = get().tasks.find((t) => t.id === id);
      if (!before || before.column === column) return;
      set((s) => ({ tasks: upsert(s.tasks, { ...before, column, active: false }) })); // snappy drag & drop
      try {
        const task = await api<Task>(`/tasks/${id}/move`, { method: 'POST', body: { column } });
        set((s) => ({ tasks: upsert(s.tasks, task) }));
      } catch {
        set((s) => ({ tasks: upsert(s.tasks, before) }));
      }
    },
    restartTask: async (id) => {
      const task = await api<Task>(`/tasks/${id}/restart`, { method: 'POST' });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    approveTask: async (id) => {
      const task = await api<Task>(`/tasks/${id}/approve`, { method: 'POST' });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    requestChanges: async (id, agentId, text) => {
      const task = await api<Task>(`/tasks/${id}/request-changes`, { method: 'POST', body: { agentId, text } });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    retryTask: async (id) => {
      const task = await api<Task>(`/tasks/${id}/retry`, { method: 'POST' });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    answerQuestion: async (id, text) => {
      const task = await api<Task>(`/tasks/${id}/answer`, { method: 'POST', body: { text } });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    startArena: async (id, stage, modelIds, blind) => {
      const task = await api<Task>(`/tasks/${id}/arena`, { method: 'POST', body: { stage, modelIds, blind } });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    pickArena: async (id, modelId, use) => {
      const task = await api<Task>(`/tasks/${id}/arena/pick`, { method: 'POST', body: { modelId, use } });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    closeArena: async (id) => {
      const task = await api<Task>(`/tasks/${id}/arena`, { method: 'DELETE' });
      set((s) => ({ tasks: upsert(s.tasks, task) }));
    },
    setKeys: (keys) => set({ keys }),
    refreshUsage: async () => set({ usage: await api<UsageSummary>('/usage') }),

    saveWatchlist: async (id, input) => {
      const w = await api<Watchlist>(id ? `/watchlists/${id}` : '/watchlists', { method: id ? 'PUT' : 'POST', body: input });
      set((s) => ({ watchlists: upsert(s.watchlists, w) }));
      return w;
    },
    deleteWatchlist: async (id) => {
      await api(`/watchlists/${id}`, { method: 'DELETE' });
      set((s) => ({ watchlists: without(s.watchlists, id), watchSummaries: s.watchSummaries.filter((x) => x.watchlistId !== id) }));
    },
    runWatchlist: async (id) => {
      const w = await api<Watchlist>(`/watchlists/${id}/run`, { method: 'POST' });
      set((s) => ({ watchlists: upsert(s.watchlists, w) }));
    },

    addNote: async (n) => {
      const note = await api<Note>('/notes', { method: 'POST', body: n });
      set((s) => ({ notes: upsert(s.notes, note) }));
      return note;
    },
    updateNote: async (id, patch) => {
      const note = await api<Note>(`/notes/${id}`, { method: 'PUT', body: patch });
      set((s) => ({ notes: upsert(s.notes, note) }));
      return note;
    },
    deleteNote: async (id) => {
      const note = get().notes.find((n) => n.id === id);
      if (!note) return;
      deleteWithUndo({
        id,
        path: `/notes/${id}`,
        label: translate(get().settings.lang, 'deletedNote'),
        hide: () => set((s) => ({ notes: without(s.notes, id) })),
        restore: () => set((s) => ({ notes: upsert(s.notes, note) })),
      });
    },

    addModel: async (m) => set({ models: await api<ModelDef[]>('/models', { method: 'POST', body: m }) }),
    updateModel: async (id, patch) => set({ models: await api<ModelDef[]>(`/models/${id}`, { method: 'PUT', body: patch }) }),
    deleteModel: async (id) => set({ models: await api<ModelDef[]>(`/models/${id}`, { method: 'DELETE' }) }),
    resetModels: async () => set({ models: await api<ModelDef[]>('/models/reset', { method: 'POST' }) }),

    applyEvent: (name, data) => {
      const s = get();
      // Don't let live updates resurrect something waiting to be deleted.
      if ((name === 'task' || name === 'note') && pendingDeletes.has((data as { id: string }).id)) return;
      switch (name) {
        case 'task': {
          const t = data as Task;
          const live = s.live[t.id];
          // The streamed text is replaced by the stored result once the step ends.
          if (live && (!t.active || t.stage !== live.stage)) {
            const { [t.id]: _, ...rest } = s.live;
            set({ tasks: upsert(s.tasks, t), live: rest });
          } else set({ tasks: upsert(s.tasks, t) });
          break;
        }
        case 'task-stream': {
          const l = data as LiveText & { id: string };
          set({ live: { ...s.live, [l.id]: { stage: l.stage, text: l.text, agentId: l.agentId } } });
          break;
        }
        case 'keys-changed':
          set({ keys: data as ApiKeyStatus[] });
          break;
        case 'watchlist':
          set({ watchlists: upsert(s.watchlists, data as Watchlist) });
          break;
        case 'watchlist-deleted': {
          const id = (data as { id: string }).id;
          set({ watchlists: without(s.watchlists, id), watchSummaries: s.watchSummaries.filter((x) => x.watchlistId !== id) });
          break;
        }
        case 'watch-report': {
          const { summary } = data as { summary?: WatchSummary };
          if (summary) set({ watchSummaries: [...s.watchSummaries.filter((x) => x.watchlistId !== summary.watchlistId), summary] });
          break;
        }
        case 'usage-changed':
          void get().refreshUsage().catch(() => {});
          break;
        case 'task-deleted':
          set({ tasks: without(s.tasks, (data as { id: string }).id) });
          break;
        case 'task-progress': {
          const p = data as { id: string; stageProgress: number; active: boolean };
          const t = s.tasks.find((x) => x.id === p.id);
          if (t) set({ tasks: upsert(s.tasks, { ...t, stageProgress: p.stageProgress, active: p.active }) });
          break;
        }
        case 'note':
          set({ notes: upsert(s.notes, data as Note) });
          break;
        case 'note-deleted':
          set({ notes: without(s.notes, (data as { id: string }).id) });
          break;
        case 'agent':
          set({ agents: upsert(s.agents, data as Agent) });
          break;
        case 'team-agent':
          set({ teamAgents: upsert(s.teamAgents, data as TeamAgent) });
          break;
        case 'agent-deleted': {
          const id = (data as { id: string }).id;
          set({ agents: without(s.agents, id), teamAgents: without(s.teamAgents, id) });
          break;
        }
        case 'models':
          set({ models: data as ModelDef[] });
          break;
        case 'settings':
          applySettings(data as UserSettings);
          break;
        case 'feed':
          set({ feed: [data as FeedItem, ...s.feed].slice(0, 60) });
          break;
        case 'runtime': {
          const r = data as AgentRuntime;
          set({ runtime: { ...s.runtime, [r.agentId]: r } });
          break;
        }
      }
    },
  };
});

export const useT = () => {
  const lang = useStore((s) => s.settings.lang);
  return (key: string, params?: LogParams) => translate(lang, key, params);
};

export const useLang = () => useStore((s) => s.settings.lang);

export const modelById = (models: ModelDef[], id: string): ModelDef | undefined => models.find((m) => m.id === id);

/** An agent anywhere on the team (mine or someone else's), for pipelines and note recipients. */
export type AnyAgent = (Agent & { mine: true; ownerName?: string }) | (TeamAgent & { mine: false });

/** Both agent lists, selected separately so the selectors stay referentially stable. */
export function useTeam(): Pick<State, 'agents' | 'teamAgents'> {
  const agents = useStore((s) => s.agents);
  const teamAgents = useStore((s) => s.teamAgents);
  return { agents, teamAgents };
}

export const findAnyAgent = (s: Pick<State, 'agents' | 'teamAgents'>, id: string): AnyAgent | undefined => {
  const a = s.agents.find((x) => x.id === id);
  if (a) return { ...a, mine: true };
  const t = s.teamAgents.find((x) => x.id === id);
  return t ? { ...t, mine: false } : undefined;
};

/** Current extrapolated value (progress 0–100 or trip fraction 0–1) of an agent's runtime. */
export const runtimeValue = (r: AgentRuntime | undefined, clockOffset: number): number => {
  if (!r) return 0;
  const elapsed = (Date.now() + clockOffset - r.at) / 1000;
  const v = r.value + r.rate * Math.max(0, elapsed);
  return r.status === 'trip' ? Math.min(1, v) : Math.min(99.9, v);
};
