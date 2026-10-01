import { AiError, type KeyFields, type ProviderAdapter, type RunRequest, type RunResult } from './types';
import type { DiscoveredModel } from '../../shared/types';
import { OLLAMA_DEFAULT_CTX } from '../../shared/constants';

const base = (key: KeyFields) => (key.baseUrl || 'http://localhost:11434').replace(/\/$/, '');

/** fetch() to a server that isn't running only says "fetch failed" — name the address instead. */
async function call(key: KeyFields, path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${base(key)}${path}`, init);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new AiError('network', `Can't reach Ollama at ${base(key)} — is it running?`, 30);
  }
}

/** Local models via Ollama's HTTP API (streams newline-delimited JSON). No web search. */
export const ollamaAdapter: ProviderAdapter = {
  async run(key, req: RunRequest): Promise<RunResult> {
    const res = await call(key, '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: req.signal,
      body: JSON.stringify({
        model: req.model.apiId,
        stream: true,
        // Ollama's default context is short and cuts long prompts silently; ask for more.
        options: { num_predict: req.maxTokens, num_ctx: req.model.numCtx ?? OLLAMA_DEFAULT_CTX },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      throw new AiError(res.status === 404 ? 'model' : 'other', `Ollama ${res.status}: ${body.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { message?: { content?: string }; done?: boolean; done_reason?: string; prompt_eval_count?: number; eval_count?: number; error?: string };
        if (msg.error) throw new AiError('other', msg.error);
        const delta = msg.message?.content;
        if (delta) {
          text += delta;
          req.onText(delta);
        }
        if (msg.done) {
          tokensIn = msg.prompt_eval_count ?? 0;
          tokensOut = msg.eval_count ?? 0;
          truncated = msg.done_reason === 'length';
        }
      }
    }
    return { text, tokensIn, tokensOut, truncated };
  },

  async test(key) {
    const res = await call(key, '/api/tags');
    if (!res.ok) throw new AiError('network', `Ollama answered ${res.status}`);
  },

  /** Models pulled on that machine, with size and (when Ollama says) their maximum context. */
  async listModels(key) {
    const res = await call(key, '/api/tags');
    if (!res.ok) throw new AiError('network', `Ollama answered ${res.status}`);
    const json = (await res.json()) as { models?: { name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string } }[] };
    const out: DiscoveredModel[] = [];
    for (const m of json.models ?? []) {
      let contextWindow: number | undefined;
      try {
        const show = await call(key, '/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name }) });
        if (show.ok) {
          const info = ((await show.json()) as { model_info?: Record<string, unknown> }).model_info ?? {};
          const k = Object.keys(info).find((x) => x.endsWith('.context_length'));
          if (k) contextWindow = Number(info[k]) || undefined;
        }
      } catch {
        /* the size and name are enough */
      }
      const note = [m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(' · ');
      out.push({ apiId: m.name, name: m.name, sizeGb: m.size ? Math.round(m.size / 1e8) / 10 : undefined, contextWindow, note: note || undefined });
    }
    return out;
  },
};
