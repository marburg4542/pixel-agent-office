export type Lang = 'th' | 'en';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama';

export interface ModelDef {
  /** Internal unique id (stable across edits). */
  id: string;
  provider: ProviderId;
  /** Model string sent to the provider API once real calls are wired up. */
  apiId: string;
  name: string;
  /** 1–5, used by the simulation to decide how long a stage takes. */
  speed: number;
  /** 1–5, used by the simulation to score outputs and suggest models per role. */
  quality: number;
  /** USD per 1M tokens, if known. */
  priceIn?: number;
  priceOut?: number;
  note?: string;
  custom?: boolean;
}

export type RoleId =
  | 'planner'
  | 'researcher'
  | 'coder'
  | 'writer'
  | 'designer'
  | 'reviewer'
  | 'tester'
  | 'custom';

export interface Look {
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  top: number;
  topColor: number;
  bottomColor: number;
  acc: number;
  accColor: number;
}

export interface Agent {
  id: string;
  name: string;
  role: RoleId;
  /** Only used when role === 'custom'. */
  roleLabel?: string;
  modelId: string;
  /** System prompt / standing instructions for this agent (used when real APIs are connected). */
  instructions: string;
  look: Look;
  desk: number;
  createdAt: number;
}

export type ColumnId = 'backlog' | 'todo' | 'doing' | 'review' | 'done';
export type Priority = 'low' | 'med' | 'high';
export type Size = 'S' | 'M' | 'L';

export interface StageOutput {
  stage: number;
  agentId: string;
  agentName: string;
  modelId: string;
  modelName: string;
  text: string;
  /** 1–5 stars */
  score: number;
  at: number;
}

export type LogParams = Record<string, string | number>;

export interface LogEntry {
  at: number;
  key: string;
  params?: LogParams;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  size: Size;
  /** Agent ids in hand-off order. */
  pipeline: string[];
  /** Index into pipeline of the stage currently in play. */
  stage: number;
  /** 0–100 progress of the current stage. */
  stageProgress: number;
  /** True while an agent is actively working the current stage (runtime; reset on load). */
  active: boolean;
  column: ColumnId;
  requireReview: boolean;
  outputs: StageOutput[];
  log: LogEntry[];
  createdAt: number;
  updatedAt: number;
  doneAt?: number;
}

export interface Note {
  id: string;
  text: string;
  /** Agent id or 'all'. */
  to: string;
  taskId?: string;
  color: number;
  createdAt: number;
  readBy: string[];
}

export interface FeedItem {
  id: string;
  at: number;
  key: string;
  params?: LogParams;
}

export type Modal =
  | { kind: 'board' }
  | { kind: 'task'; taskId: string }
  | { kind: 'taskEdit'; taskId?: string; preset?: Partial<Task> }
  | { kind: 'noteEdit'; noteId?: string; preset?: Partial<Note> }
  | { kind: 'agentEdit'; agentId?: string; desk?: number }
  | { kind: 'agent'; agentId: string }
  | { kind: 'models' }
  | { kind: 'confirm'; message: string; onYes: () => void; danger?: boolean };
