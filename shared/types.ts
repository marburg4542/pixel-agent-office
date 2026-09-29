// Types shared by the browser app and the server.

export type Lang = 'th' | 'en';

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama';

export interface ModelDef {
  /** Internal unique id (stable across edits). */
  id: string;
  provider: ProviderId;
  /** Model string sent to the provider API. */
  apiId: string;
  name: string;
  /** 1–5, drives simulated duration and model suggestions. */
  speed: number;
  /** 1–5, drives simulated scores and model suggestions. */
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
  | 'analyst'
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
  ownerId: number;
  name: string;
  role: RoleId;
  /** Only used when role === 'custom'. */
  roleLabel?: string;
  modelId: string;
  /** System prompt / standing instructions for this agent. */
  instructions: string;
  look: Look;
  desk: number;
  createdAt: number;
}

/** Another user's agent — enough to show it in shared pipelines and address notes to it. */
export interface TeamAgent {
  id: string;
  ownerId: number;
  ownerName: string;
  name: string;
  role: RoleId;
  roleLabel?: string;
  look: Look;
  modelName: string;
}

export type ColumnId = 'backlog' | 'todo' | 'doing' | 'review' | 'done';
export type Priority = 'low' | 'med' | 'high';
export type Size = 'S' | 'M' | 'L';
export type Scope = 'personal' | 'shared';

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
  simulated?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

export type LogParams = Record<string, string | number>;

export interface LogEntry {
  at: number;
  key: string;
  params?: LogParams;
}

export interface Task {
  id: string;
  scope: Scope;
  ownerId: number;
  ownerName: string;
  title: string;
  description: string;
  priority: Priority;
  size: Size;
  /** Agent ids in hand-off order (shared tasks may mix agents of several users). */
  pipeline: string[];
  /** Index into pipeline of the stage in play; === pipeline.length once every step is done. */
  stage: number;
  /** 0–100 progress of the current stage. */
  stageProgress: number;
  /** True while an agent is actively working the current stage. */
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
  scope: Scope;
  createdBy: number;
  createdByName: string;
  text: string;
  /** Agent id or 'all' (all of the creator's agents for personal notes, everyone's for shared). */
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

export interface UserSettings {
  lang: Lang;
  sound: boolean;
  /** 0–1 */
  volume: number;
  simSpeed: number;
  paused: boolean;
}

export type UserRole = 'Admin' | 'Member';
export type UserStatus = 'Pending' | 'Active' | 'Denied';

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string;
}

export type RuntimeStatus = 'idle' | 'trip' | 'working';

/**
 * What an agent is doing right now, as decided by the server's worker.
 * `value` is trip fraction (0–1) or stage progress (0–100) at server time `at`;
 * the browser extrapolates with `rate` (units per real second) between updates.
 */
export interface AgentRuntime {
  agentId: string;
  status: RuntimeStatus;
  taskId?: string;
  value: number;
  rate: number;
  at: number;
}

export interface Workspace {
  user: PublicUser;
  settings: UserSettings;
  agents: Agent[];
  teamAgents: TeamAgent[];
  tasks: Task[];
  notes: Note[];
  models: ModelDef[];
  feed: FeedItem[];
  runtime: AgentRuntime[];
  serverTime: number;
}

export type ApiKeyProvider =
  | ProviderId
  | 'finnhub'
  | 'alphavantage'
  | 'coingecko'
  | 'reddit'
  | 'youtube'
  | 'bluesky';

export interface ApiKeyStatus {
  provider: ApiKeyProvider;
  configured: boolean;
  /** e.g. "sk-…a1b2" — never the secret itself. */
  hint: string;
  updatedAt?: number;
}
