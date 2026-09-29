import type { ModelDef, ProviderId } from './types';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Logo colors used on the laptop lid in the office. */
  color: string;
  accent: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { id: 'anthropic', name: 'Anthropic', color: '#d97757', accent: '#f4e6d8' },
  openai: { id: 'openai', name: 'OpenAI', color: '#10a37f', accent: '#e8fff6' },
  google: { id: 'google', name: 'Google', color: '#4285f4', accent: '#fbbc05' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', color: '#7c5cff', accent: '#e9e3ff' },
  ollama: { id: 'ollama', name: 'Ollama (local)', color: '#e8e8e8', accent: '#2a2a2a' },
};

export const PROVIDER_ORDER: ProviderId[] = ['anthropic', 'openai', 'google', 'openrouter', 'ollama'];

/**
 * Seed catalog (checked against provider docs, Sept 2026). Speed/quality are rough
 * 1–5 estimates that only drive the simulation — every entry is editable in the Model Library.
 */
export const DEFAULT_MODELS: ModelDef[] = [
  { id: 'claude-fable-5-1', provider: 'anthropic', apiId: 'claude-fable-5-1', name: 'Claude Fable 5.1', speed: 2, quality: 5, priceIn: 10, priceOut: 50 },
  { id: 'claude-opus-5', provider: 'anthropic', apiId: 'claude-opus-5', name: 'Claude Opus 5', speed: 3, quality: 5, priceIn: 5, priceOut: 25 },
  { id: 'claude-sonnet-5', provider: 'anthropic', apiId: 'claude-sonnet-5', name: 'Claude Sonnet 5', speed: 4, quality: 4, priceIn: 2, priceOut: 10 },
  { id: 'claude-haiku-4-5', provider: 'anthropic', apiId: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', speed: 5, quality: 3, priceIn: 1, priceOut: 5 },

  { id: 'gpt-6-astra', provider: 'openai', apiId: 'gpt-6-astra', name: 'GPT-6 Astra', speed: 2, quality: 5, priceIn: 10, priceOut: 50 },
  { id: 'gpt-6-sol', provider: 'openai', apiId: 'gpt-6-sol', name: 'GPT-6 Sol', speed: 4, quality: 4, priceIn: 2, priceOut: 10 },
  { id: 'gpt-6-luna', provider: 'openai', apiId: 'gpt-6-luna', name: 'GPT-6 Luna', speed: 5, quality: 3, priceIn: 0.1, priceOut: 0.5 },

  { id: 'gemini-3.1-pro', provider: 'google', apiId: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)', speed: 3, quality: 5 },
  { id: 'gemini-3.8-flash', provider: 'google', apiId: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', speed: 4, quality: 4, priceIn: 0.75, priceOut: 3.75 },
  { id: 'gemini-3.5-flash-lite', provider: 'google', apiId: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', speed: 5, quality: 3, priceIn: 0.3, priceOut: 2.5 },

  { id: 'openrouter-auto', provider: 'openrouter', apiId: 'openrouter/auto', name: 'OpenRouter Auto', speed: 3, quality: 4, note: 'Routes to a model automatically' },

  { id: 'ollama-local', provider: 'ollama', apiId: 'llama3.3', name: 'Local model (Ollama)', speed: 3, quality: 2, priceIn: 0, priceOut: 0, note: 'Example — set apiId to a model you have pulled' },
];
