import { GoogleGenAI } from '@google/genai';
import type { KeyFields, ProviderAdapter, RunRequest, RunResult } from './types';
import type { DiscoveredModel } from '../../shared/types';

const client = (key: KeyFields) => new GoogleGenAI({ apiKey: key.key });

/** Gemini via the Google GenAI SDK; web search = grounding with Google Search. */
export const googleAdapter: ProviderAdapter = {
  async run(key, req: RunRequest): Promise<RunResult> {
    const stream = await client(key).models.generateContentStream({
      model: req.model.apiId,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens,
        abortSignal: req.signal,
        ...(req.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let finish: string | undefined;
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        req.onText(delta);
      }
      finish = chunk.candidates?.[0]?.finishReason ?? finish;
      if (chunk.usageMetadata) {
        tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn;
        tokensOut = chunk.usageMetadata.candidatesTokenCount ?? tokensOut;
      }
    }
    return { text, tokensIn, tokensOut, truncated: finish === 'MAX_TOKENS' };
  },

  async test(key) {
    const pager = await client(key).models.list({ config: { pageSize: 1 } });
    void pager.page;
  },

  async listModels(key) {
    const out: DiscoveredModel[] = [];
    const pager = await client(key).models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      if (!m.name || !/gemini/i.test(m.name) || (m.supportedActions && !m.supportedActions.includes('generateContent'))) continue;
      out.push({ apiId: m.name.replace(/^models\//, ''), name: m.displayName || m.name, contextWindow: m.inputTokenLimit });
    }
    return out;
  },
};
