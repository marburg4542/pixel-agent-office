import type { ApiKeyProvider } from './types';

export interface KeyField {
  name: string;
  label: { th: string; en: string };
  secret: boolean;
  placeholder?: string;
}

export interface KeyProviderDef {
  id: ApiKeyProvider;
  group: 'ai' | 'data';
  name: string;
  /** Where to get a key. */
  url: string;
  fields: KeyField[];
  note?: { th: string; en: string };
}

const KEY = (placeholder: string): KeyField => ({ name: 'key', label: { th: 'API key', en: 'API key' }, secret: true, placeholder });

export const KEY_PROVIDERS: KeyProviderDef[] = [
  { id: 'anthropic', group: 'ai', name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys', fields: [KEY('sk-ant-…')] },
  { id: 'openai', group: 'ai', name: 'OpenAI', url: 'https://platform.openai.com/api-keys', fields: [KEY('sk-…')] },
  { id: 'google', group: 'ai', name: 'Google (Gemini)', url: 'https://aistudio.google.com/apikey', fields: [KEY('AIza…')] },
  { id: 'openrouter', group: 'ai', name: 'OpenRouter', url: 'https://openrouter.ai/keys', fields: [KEY('sk-or-…')] },
  {
    id: 'ollama',
    group: 'ai',
    name: 'Ollama (local)',
    url: 'https://ollama.com/download',
    fields: [{ name: 'baseUrl', label: { th: 'ที่อยู่เซิร์ฟเวอร์', en: 'Server URL' }, secret: false, placeholder: 'http://localhost:11434' }],
    note: { th: 'Ollama ต้องรันบนเครื่องเดียวกับเซิร์ฟเวอร์ของแอป', en: 'Ollama must run on the same machine as the app server' },
  },
  { id: 'finnhub', group: 'data', name: 'Finnhub (stocks)', url: 'https://finnhub.io/register', fields: [KEY('')] },
  { id: 'alphavantage', group: 'data', name: 'Alpha Vantage (stocks)', url: 'https://www.alphavantage.co/support/#api-key', fields: [KEY('')] },
  {
    id: 'coingecko',
    group: 'data',
    name: 'CoinGecko (crypto)',
    url: 'https://www.coingecko.com/en/developers/dashboard',
    fields: [KEY('CG-…')],
    note: { th: 'ไม่ใส่ก็ได้ — จะใช้แบบไม่มี key (โควตาน้อยกว่า)', en: 'Optional — works keyless with a lower quota' },
  },
  {
    id: 'reddit',
    group: 'data',
    name: 'Reddit',
    url: 'https://www.reddit.com/prefs/apps',
    fields: [
      { name: 'clientId', label: { th: 'Client ID', en: 'Client ID' }, secret: false },
      { name: 'clientSecret', label: { th: 'Client secret', en: 'Client secret' }, secret: true },
    ],
  },
  { id: 'youtube', group: 'data', name: 'YouTube Data API', url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', fields: [KEY('AIza…')] },
  {
    id: 'bluesky',
    group: 'data',
    name: 'Bluesky',
    url: 'https://bsky.app/settings/app-passwords',
    fields: [
      { name: 'handle', label: { th: 'Handle', en: 'Handle' }, secret: false, placeholder: 'you.bsky.social' },
      { name: 'appPassword', label: { th: 'App password', en: 'App password' }, secret: true },
    ],
  },
];

export const keyProvider = (id: string): KeyProviderDef | undefined => KEY_PROVIDERS.find((p) => p.id === id);
