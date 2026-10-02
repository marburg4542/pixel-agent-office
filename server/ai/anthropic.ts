import Anthropic from '@anthropic-ai/sdk';
import { AiError, type KeyFields, type ProviderAdapter, type RunRequest, type RunResult } from './types';
import type { DiscoveredModel } from '../../shared/types';

// Opus 5 / Fable 5.1 can decline a request via safety classifiers; server-side fallbacks re-run it on
// Anthropic's recommended model for that refusal category instead of returning the refusal.
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);
// Models that take the newer web search tool (dynamic filtering); older ones use the basic variant.
const NEW_SEARCH = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6)/;
const MAX_CONTINUATIONS = 3;

const client = (key: KeyFields) => new Anthropic({ apiKey: key.key, maxRetries: 2 });

export const anthropicAdapter: ProviderAdapter = {
  async run(key, req: RunRequest): Promise<RunResult> {
    const c = client(key);
    const apiId = req.model.apiId;
    const tools: Anthropic.Beta.BetaToolUnion[] = [];
    if (req.webSearch) {
      tools.push(
        NEW_SEARCH.test(apiId)
          ? { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }
          : { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
      );
    }
    const useFallback = FALLBACK_MODELS.has(apiId);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: req.user }];
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;

    // A long server-tool turn can pause (pause_turn); resume by sending the assistant turn back.
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const stream = c.beta.messages.stream(
        {
          model: apiId,
          max_tokens: req.maxTokens,
          system: req.system,
          messages,
          ...(tools.length ? { tools } : {}),
          ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: req.signal },
      );
      stream.on('text', (delta) => {
        text += delta;
        req.onText(delta);
      });
      const msg = await stream.finalMessage();
      tokensIn += msg.usage.input_tokens ?? 0;
      tokensOut += msg.usage.output_tokens ?? 0;

      if (msg.stop_reason === 'refusal') {
        throw new AiError('refusal', msg.stop_details?.explanation || 'The model declined this request.');
      }
      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content });
        continue;
      }
      return { text, tokensIn, tokensOut, truncated: msg.stop_reason === 'max_tokens' };
    }
    return { text, tokensIn, tokensOut, truncated: true };
  },

  async test(key) {
    await client(key).models.list({ limit: 1 });
  },

  async listModels(key) {
    const out: DiscoveredModel[] = [];
    for await (const m of client(key).models.list({ limit: 100 })) out.push({ apiId: m.id, name: m.display_name || m.id });
    return out;
  },
};
