import OpenAI from 'openai';
import type { KeyFields, ProviderAdapter, RunRequest, RunResult } from './types';

const client = (key: KeyFields) => new OpenAI({ apiKey: key.key, maxRetries: 2 });

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
};
