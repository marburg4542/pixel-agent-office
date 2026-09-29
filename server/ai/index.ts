import { getKey } from '../keys';
import { getSettings } from '../workspace/store';
import { usageSummary } from '../usage';
import { toAiError } from './errors';
import { anthropicAdapter } from './anthropic';
import { openaiAdapter, openrouterAdapter } from './openai';
import { googleAdapter } from './google';
import { ollamaAdapter } from './ollama';
import type { ModelDef, ProviderId } from '../../shared/types';
import type { KeyFields, ProviderAdapter, RunRequest, RunResult } from './types';

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  openrouter: openrouterAdapter,
  ollama: ollamaAdapter,
};

export type AiDecision = { real: true; key: KeyFields } | { real: false; reason: 'sim-mode' | 'no-key' | 'budget' };

/** Should this agent's step call the real model? (AI mode on, a key for the provider, budget not used up.) */
export function decideAi(userId: number, model: ModelDef | undefined): AiDecision {
  const s = getSettings(userId);
  if (s.aiMode === 'sim' || !model) return { real: false, reason: 'sim-mode' };
  const key = getKey(userId, model.provider);
  if (!key) return { real: false, reason: 'no-key' };
  if (s.budgetUsd > 0 && usageSummary(userId).costUsd >= s.budgetUsd) return { real: false, reason: 'budget' };
  return { real: true, key };
}

export async function runModel(key: KeyFields, req: RunRequest): Promise<RunResult> {
  try {
    return await ADAPTERS[req.model.provider].run(key, req);
  } catch (e) {
    throw toAiError(e);
  }
}

/** Check a key with a cheap call. Returns an error message, or null when it works. */
export async function testAiKey(provider: ProviderId, key: KeyFields): Promise<string | null> {
  try {
    await ADAPTERS[provider].test(key);
    return null;
  } catch (e) {
    return toAiError(e).message || 'failed';
  }
}
