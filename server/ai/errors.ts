import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ApiError as GoogleApiError } from '@google/genai';
import { AiError } from './types';

const short = (m: unknown) => String(m ?? '').replace(/\s+/g, ' ').slice(0, 240);

const byStatus = (status: number | undefined, message: string, retryAfter?: number): AiError => {
  if (status === 401 || status === 403) return new AiError('auth', message);
  if (status === 429) return new AiError(/quota|billing|credit|insufficient/i.test(message) ? 'quota' : 'rate', message, retryAfter ?? 60);
  if (status === 402) return new AiError('quota', message);
  if (status === 404 || status === 400) return new AiError(/model/i.test(message) ? 'model' : 'other', message);
  if (status && status >= 500) return new AiError('rate', message, 30);
  return new AiError('other', message);
};

/** Map any SDK / network error to an AiError, using each SDK's typed classes (never string-matching the class). */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Error && (e.name === 'AbortError' || e instanceof Anthropic.APIUserAbortError || e instanceof OpenAI.APIUserAbortError)) {
    return new AiError('aborted', 'aborted');
  }
  if (e instanceof Anthropic.APIConnectionError || e instanceof OpenAI.APIConnectionError) return new AiError('network', short(e.message), 30);
  if (e instanceof Anthropic.APIError) {
    const retry = Number(e.headers?.get?.('retry-after')) || undefined;
    return byStatus(e.status, short(e.message), retry);
  }
  if (e instanceof OpenAI.APIError) {
    const retry = Number(e.headers?.get?.('retry-after')) || undefined;
    return byStatus(e.status, short(e.message), retry);
  }
  if (e instanceof GoogleApiError) return byStatus(e.status, short(e.message));
  if (e instanceof TypeError && /fetch failed|terminated|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|UND_ERR/i.test(e.message + String((e as { cause?: unknown }).cause ?? ''))) {
    return new AiError('network', short(e.message), 30);
  }
  return new AiError('other', short(e instanceof Error ? e.message : e));
}
