import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Agent, ColumnId, FeedItem, Lang, LogParams, Modal, ModelDef, Note, StageOutput, Task,
} from './types';
import { DEFAULT_MODELS } from './data/models';
import { createSeed, makeTask } from './data/seed';
import { translate } from './i18n';
import { uid } from './util';

const MAX_FEED = 60;
const MAX_LOG = 80;
export const MAX_DESKS = 8;

interface Data {
  lang: Lang;
  agents: Agent[];
  tasks: Task[];
  notes: Note[];
  models: ModelDef[];
  feed: FeedItem[];
  simSpeed: number;
  paused: boolean;
}

interface Actions {
  setLang: (l: Lang) => void;
  togglePause: () => void;
  setSpeed: (n: number) => void;

  openModal: (m: Modal) => void;
  closeModal: () => void;

  addAgent: (a: Omit<Agent, 'id' | 'createdAt'>) => string;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  removeAgent: (id: string) => void;

  addTask: (t: Partial<Task> & Pick<Task, 'title'>) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, column: ColumnId) => void;
  restartTask: (id: string) => void;
  approveTask: (id: string) => void;
  requestChanges: (id: string, agentId: string, text: string) => void;

  /** Simulation hooks — called by the engine. */
  claimTask: (id: string, agentId: string) => void;
  setTaskActive: (id: string, active: boolean) => void;
  setTaskProgress: (id: string, p: number) => void;
  completeStage: (id: string, output: StageOutput) => { next: string | null; column: ColumnId };
  pushLog: (taskId: string, key: string, params?: LogParams) => void;
  pushFeed: (key: string, params?: LogParams) => void;

  addNote: (n: Omit<Note, 'id' | 'createdAt' | 'readBy'>) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  markNotesRead: (agentId: string, ids: string[]) => void;

  addModel: (m: Omit<ModelDef, 'id'>) => void;
  updateModel: (id: string, patch: Partial<ModelDef>) => void;
  deleteModel: (id: string) => void;
  resetModels: () => void;

  resetWorkspace: () => void;
}

export type State = Data & { modals: Modal[] } & Actions;

const initialLang: Lang = 'th';

function withLog(t: Task, key: string, params?: LogParams): Task {
  const log = [...t.log, { at: Date.now(), key, params }];
  return { ...t, log: log.length > MAX_LOG ? log.slice(-MAX_LOG) : log, updatedAt: Date.now() };
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const patchTask = (id: string, fn: (t: Task) => Task) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));
      const agentName = (id: string) => get().agents.find((a) => a.id === id)?.name ?? '?';
      const colName = (c: ColumnId) => translate(get().lang, `col_${c}`);

      return {
        lang: initialLang,
        ...createSeed(initialLang),
        models: DEFAULT_MODELS,
        feed: [],
        simSpeed: 1,
        paused: false,
        modals: [],

        setLang: (lang) => set({ lang }),
        togglePause: () => set((s) => ({ paused: !s.paused })),
        setSpeed: (simSpeed) => set({ simSpeed }),

        openModal: (m) => set((s) => ({ modals: [...s.modals, m] })),
        closeModal: () => set((s) => ({ modals: s.modals.slice(0, -1) })),

        addAgent: (a) => {
          const agent: Agent = { ...a, id: uid(), createdAt: Date.now() };
          set((s) => ({ agents: [...s.agents, agent] }));
          get().pushFeed('feed_hired', { agent: agent.name });
          return agent.id;
        },
        updateAgent: (id, patch) =>
          set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
        removeAgent: (id) =>
          set((s) => ({
            agents: s.agents.filter((a) => a.id !== id),
            tasks: s.tasks.map((t) => {
              if (!t.pipeline.includes(id)) return t;
              const idx = t.pipeline.indexOf(id);
              const pipeline = t.pipeline.filter((x) => x !== id);
              let stage = t.stage;
              let stageProgress = t.stageProgress;
              if (idx < t.stage) stage -= 1;
              else if (idx === t.stage) stageProgress = 0;
              return { ...t, pipeline, stage: Math.min(stage, pipeline.length), stageProgress, active: false };
            }),
            notes: s.notes
              .filter((n) => n.to !== id)
              .map((n) => ({ ...n, readBy: n.readBy.filter((r) => r !== id) })),
          })),

        addTask: (partial) => {
          const task = makeTask(partial);
          set((s) => ({ tasks: [...s.tasks, task] }));
          return task.id;
        },
        updateTask: (id, patch) =>
          patchTask(id, (t) => {
            const next = { ...t, ...patch, updatedAt: Date.now() };
            if (patch.pipeline) {
              next.stage = Math.min(next.stage, next.pipeline.length);
              if (next.pipeline[next.stage] !== t.pipeline[t.stage]) {
                next.active = false;
                next.stageProgress = 0;
              }
            }
            return next;
          }),
        deleteTask: (id) =>
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id),
            notes: s.notes.map((n) => (n.taskId === id ? { ...n, taskId: undefined } : n)),
          })),
        moveTask: (id, column) =>
          patchTask(id, (t) => {
            if (t.column === column) return t;
            let next: Task = { ...t, column, active: false };
            if ((column === 'todo' || column === 'doing') && t.stage >= t.pipeline.length) {
              next = withLog({ ...next, stage: 0, stageProgress: 0 }, 'log_restarted');
            }
            if (column === 'done') next.doneAt = Date.now();
            return withLog(next, 'log_moved', { col: colName(column) });
          }),
        restartTask: (id) =>
          patchTask(id, (t) =>
            withLog({ ...t, stage: 0, stageProgress: 0, active: false, column: 'todo', doneAt: undefined }, 'log_restarted'),
          ),
        approveTask: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          patchTask(id, (x) => withLog({ ...x, column: 'done', active: false, doneAt: Date.now() }, 'log_approved'));
          if (t) get().pushFeed('feed_done', { task: t.title });
        },
        requestChanges: (id, agentId, text) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          const stage = Math.max(0, t.pipeline.indexOf(agentId));
          get().addNote({ text, to: agentId, taskId: id, color: 1 });
          patchTask(id, (x) =>
            withLog(
              { ...x, stage, stageProgress: 0, active: false, column: 'todo', doneAt: undefined },
              'log_changes',
              { agent: agentName(agentId), text },
            ),
          );
          get().pushFeed('feed_changes', { task: t.title });
        },

        claimTask: (id, agentId) => {
          const t = get().tasks.find((x) => x.id === id);
          patchTask(id, (x) => withLog({ ...x, column: 'doing' }, 'log_picked', { agent: agentName(agentId) }));
          if (t) get().pushFeed('feed_picked', { agent: agentName(agentId), task: t.title });
        },
        setTaskActive: (id, active) => patchTask(id, (t) => ({ ...t, active })),
        setTaskProgress: (id, p) => patchTask(id, (t) => ({ ...t, stageProgress: p })),
        completeStage: (id, output) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return { next: null, column: 'done' };
          const nextStage = t.stage + 1;
          const hasNext = nextStage < t.pipeline.length;
          const column: ColumnId = hasNext ? 'doing' : t.requireReview ? 'review' : 'done';
          patchTask(id, (x) => {
            let n: Task = {
              ...x,
              outputs: [...x.outputs, output],
              stage: nextStage,
              stageProgress: 0,
              active: false,
              column,
              doneAt: column === 'done' ? Date.now() : x.doneAt,
            };
            n = withLog(n, 'log_stageDone', { agent: output.agentName, n: output.stage + 1, model: output.modelName });
            if (hasNext) n = withLog(n, 'log_handoff', { agent: output.agentName, next: agentName(x.pipeline[nextStage]) });
            else n = withLog(n, column === 'review' ? 'log_toReview' : 'log_done');
            return n;
          });
          return { next: hasNext ? t.pipeline[nextStage] : null, column };
        },
        pushLog: (taskId, key, params) => patchTask(taskId, (t) => withLog(t, key, params)),
        pushFeed: (key, params) =>
          set((s) => ({ feed: [{ id: uid(), at: Date.now(), key, params }, ...s.feed].slice(0, MAX_FEED) })),

        addNote: (n) => set((s) => ({ notes: [...s.notes, { ...n, id: uid(), createdAt: Date.now(), readBy: [] }] })),
        updateNote: (id, patch) =>
          set((s) => ({
            notes: s.notes.map((n) => {
              if (n.id !== id) return n;
              const changed = patch.text !== undefined && patch.text !== n.text;
              const retarget = patch.to !== undefined && patch.to !== n.to;
              // An edited note must be re-read.
              return { ...n, ...patch, readBy: changed || retarget ? [] : n.readBy };
            }),
          })),
        deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
        markNotesRead: (agentId, ids) =>
          set((s) => ({
            notes: s.notes.map((n) =>
              ids.includes(n.id) && !n.readBy.includes(agentId) ? { ...n, readBy: [...n.readBy, agentId] } : n,
            ),
          })),

        addModel: (m) => set((s) => ({ models: [...s.models, { ...m, id: uid(), custom: true }] })),
        updateModel: (id, patch) =>
          set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
        deleteModel: (id) => set((s) => ({ models: s.models.filter((m) => m.id !== id) })),
        resetModels: () =>
          set((s) => {
            // Keep custom models that agents still use so nobody ends up without a model.
            const used = new Set(s.agents.map((a) => a.modelId));
            const keep = s.models.filter((m) => m.custom && used.has(m.id));
            return { models: [...DEFAULT_MODELS, ...keep] };
          }),

        resetWorkspace: () =>
          set((s) => ({ ...createSeed(s.lang), models: DEFAULT_MODELS, feed: [], modals: [], paused: false })),
      };
    },
    {
      name: 'pixel-agent-office-v1',
      version: 1,
      partialize: (s): Data => ({
        lang: s.lang,
        agents: s.agents,
        tasks: s.tasks,
        notes: s.notes,
        models: s.models,
        feed: s.feed,
        simSpeed: s.simSpeed,
        paused: s.paused,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        return {
          ...current,
          ...p,
          // Nobody is mid-keystroke after a reload; agents re-pick their work.
          tasks: (p.tasks ?? current.tasks).map((t) => ({ ...t, active: false })),
        };
      },
    },
  ),
);

export const useT = () => {
  const lang = useStore((s) => s.lang);
  return (key: string, params?: LogParams) => translate(lang, key, params);
};

export const modelById = (models: ModelDef[], id: string): ModelDef | undefined => models.find((m) => m.id === id);
