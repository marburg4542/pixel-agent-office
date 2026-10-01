import OpenAI from 'openai';
import type { KeyFields, ProviderAdapter, RunRequest, RunResult } from './types';
import type { DiscoveredModel } from '../../shared/types';

const client = (key: KeyFields) => new OpenAI({ apiKey: key.key, maxRetries: 2 });

/** Chat/text models in OpenAI's list (it also has embeddings, speech, images…). */
const CHAT = /^(gpt-|o\d|chatgpt-)/i;
const NOT_CHAT = /(embed|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search)/i;

/** OpenRouter prices are USD per token as strings ("-1" = varies). */
const perMillion = (v?: string) => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1000) / 1000 : undefined;
};

/** OpenAI via the Responses API (streaming, optional built-in web search). */
export const openaiAdapter: ProviderAdapter = {
  async run(key, req: RunRequest): Promise<RunResult> {
    const stream = client(key).responses.stream(
      {
        model: req.model.apiId,
        instructions: req.system,
        input: req.user,
        max_output_tokens: req.maxTokens,
        ...(req.webSearch ? { tools: [{ type: 'web_search' as const }] } : {}),
      },
      { signal: req.signal },
    );
    let text = '';
    for await (const ev of stream) {
      if (ev.type === 'response.output_text.delta') {
        text += ev.delta;
        req.onText(ev.delta);
      }
    }
    const res = await stream.finalResponse();
    return {
      text: text || res.output_text || '',
      tokensIn: res.usage?.input_tokens ?? 0,
      tokensOut: res.usage?.output_tokens ?? 0,
      truncated: res.status === 'incomplete' && res.incomplete_details?.reason === 'max_output_tokens',
    };
  },

  async test(key) {
    await client(key).models.list();
  },

  async listModels(key) {
    const out: DiscoveredModel[] = [];
    for await (const m of client(key).models.list()) {
      if (CHAT.test(m.id) && !NOT_CHAT.test(m.id)) out.push({ apiId: m.id, name: m.id });
    }
    return out.sort((a, b) => a.apiId.localeCompare(b.apiId));
  },
};

/** OpenRouter speaks the OpenAI chat-completions protocol; ":online" adds its web search. */
export const openrouterAdapter: ProviderAdapter = {
  async run(key, req: RunRequest): Promise<RunResult> {
    const c = new OpenAI({ apiKey: key.key, baseURL: 'https://openrouter.ai/api/v1', maxRetries: 2 });
    const model = req.webSearch && !req.model.apiId.endsWith(':online') ? `${req.model.apiId}:online` : req.model.apiId;
    const stream = await c.chat.completions.create(
      {
        model,
        max_tokens: req.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      { signal: req.signal },
    );
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let finish: string | null | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        req.onText(delta);
      }
      finish = chunk.choices[0]?.finish_reason ?? finish;
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens;
        tokensOut = chunk.usage.completion_tokens;
      }
    }
    return { text, tokensIn, tokensOut, truncated: finish === 'length' };
  },

  async test(key) {
    const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key.key}` } });
    if (!res.ok) throw new OpenAI.APIError(res.status, undefined, `OpenRouter rejected the key (${res.status})`, res.headers);
  },

  async listModels(key) {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key.key}` } });
    if (!res.ok) throw new OpenAI.APIError(res.status, undefined, `OpenRouter answered ${res.status}`, res.headers);
    const json = (await res.json()) as { data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] };
    return (json.data ?? []).map((m) => ({
      apiId: m.id, name: m.name || m.id, contextWindow: m.context_length, priceIn: perMillion(m.pricing?.prompt), priceOut: perMillion(m.pricing?.completion),
    }));
  },
};
