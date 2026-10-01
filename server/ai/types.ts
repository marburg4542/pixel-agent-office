import type { DiscoveredModel, ModelDef } from '../../shared/types';

export type KeyFields = Record<string, string>;

export interface RunRequest {
  model: ModelDef;
  system: string;
  user: string;
  maxTokens: number;
  /** Let the model search the web itself (researcher/analyst roles), when the provider supports it. */
  webSearch: boolean;
  signal: AbortSignal;
  onText: (delta: string) => void;
}

export interface RunResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** e.g. max_tokens — useful to tell the user the answer was cut short. */
  truncated: boolean;
}

export interface ProviderAdapter {
  run(key: KeyFields, req: RunRequest): Promise<RunResult>;
  /** Cheap call that proves the key works. */
  test(key: KeyFields): Promise<void>;
  /** Models this key can use, as the provider lists them. */
  listModels?(key: KeyFields): Promise<DiscoveredModel[]>;
}

export type AiErrorKind = 'auth' | 'rate' | 'quota' | 'refusal' | 'network' | 'model' | 'aborted' | 'other';

/** Normalized provider failure the worker can react to (retry later, block the task, …). */
export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}
