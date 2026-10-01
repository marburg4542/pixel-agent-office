// Types shared by the browser app and the server.
import type { ResearchQuery, ResearchResult, Watchlist, WatchSummary } from './research';

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
  /** News & sentiment data and the reading of it (analyst steps of research tasks). */
  research?: ResearchResult;
  /** When the step began (for timing stats). */
  startedAt?: number;
  /** Chosen in the Model Arena. */
  arena?: boolean;
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
  /** A real AI call failed (bad key, rate limit…). Agents skip the task until `until` or a manual retry. */
  blocked?: { reason: string; kind: string; at: number; until?: number };
  /** Makes the analyst step (or the first step) gather news & social data before writing. */
  research?: ResearchQuery;
  /** Set on the run task of a Newsroom watchlist. */
  watchlistId?: string;
  /** An agent paused to ask something; agents skip the task until someone answers. */
  question?: { agentId: string; agentName: string; stage: number; text: string; at: number };
  /** Answered questions — each goes into the prompt of the step that asked. */
  qa?: { stage: number; agentName: string; question: string; answer: string; by: string; at: number }[];
  /** Times a reviewer agent sent the work back by itself (at most MAX_AUTO_REVISIONS). */
  autoRevisions?: number;
  /** Model Arena: one step re-run on several models side by side. */
  arena?: Arena;
}

export interface ArenaEntry {
  modelId: string;
  modelName: string;
  provider: ProviderId;
  status: 'running' | 'done' | 'error';
  text: string;
  error?: string;
  simulated: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  ms?: number;
}

export interface Arena {
  id: string;
  stage: number;
  agentId: string;
  /** Who started it — their keys pay and only they pick the winner. */
  byUserId: number;
  byName?: string;
  /** Hide model names until a winner is picked. */
  blind: boolean;
  entries: ArenaEntry[];
  createdAt: number;
  pickedModelId?: string;
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
  /** 'auto' = call the real model whenever the agent's provider has a key; 'sim' = always simulate. */
  aiMode: 'auto' | 'sim';
  /** Monthly spending cap in USD for real AI calls (0 = no cap). Over the cap, agents fall back to simulation. */
  budgetUsd: number;
}

/** Real-AI spending for the current month. */
export interface UsageSummary {
  month: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  calls: number;
  byModel: { modelId: string; modelName: string; costUsd: number; calls: number; tokensIn: number; tokensOut: number }[];
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
  keys: ApiKeyStatus[];
  usage: UsageSummary;
  /** Text streamed so far for steps a real model is answering right now, by task id. */
  live: Record<string, LiveText>;
  watchlists: Watchlist[];
  watchSummaries: WatchSummary[];
  serverTime: number;
}

export interface LiveText {
  stage: number;
  text: string;
  agentId?: string;
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

// ─── Stats page ──────────────────────────────────────────────────────────────

export interface StatsAgentRow {
  agentId: string;
  name: string;
  ownerName: string;
  mine: boolean;
  role: RoleId;
  look: Look;
  modelName: string;
  /** Results delivered (every version, incl. redone steps). */
  steps: number;
  /** Average time per step in seconds, when known. */
  avgSeconds: number | null;
  /** Times their step was sent back (by a person or a reviewer agent). */
  sentBack: number;
  questions: number;
  /** Your spending on this agent in the window (only for your own agents). */
  costUsd: number | null;
}

export interface StatsModelRow {
  modelName: string;
  steps: number;
  avgSeconds: number | null;
  costUsd: number;
  calls: number;
  arenaWins: number;
  arenaGames: number;
}

export interface ArenaScore {
  modelKey: string;
  modelName: string;
  wins: number;
  games: number;
}

export interface Stats {
  /** Cost figures cover the days since this date ("YYYY-MM-DD"). */
  sinceDay: string;
  totals: { steps: number; tasksDone: number; firstPass: number; reviewed: number; costUsd: number; avgSeconds: number | null; autoRevisions: number };
  agents: StatsAgentRow[];
  models: StatsModelRow[];
  costDaily: { day: string; costUsd: number; calls: number }[];
  team: { columns: Record<ColumnId, number>; contributors: { userName: string; steps: number }[]; questions: number; blocked: number };
  arena: { mine: ArenaScore[]; team: ArenaScore[] };
}
