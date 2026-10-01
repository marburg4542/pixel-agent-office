// Turns a data pack into model input, reads the model's sentiment block back out, and writes the
// no-AI (simulated) report.
import { estimate, sentimentLabel } from './sentiment';
import { sourceDef, type ResearchPack, type SentimentAnalysis, type SentimentSplit } from '../../shared/research';
import type { Lang } from '../../shared/types';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const pct = (n?: number) => (n === undefined || Number.isNaN(n) ? '–' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const money = (n?: number, cur = 'USD') => (n === undefined ? '–' : `${cur === 'USD' ? '$' : ''}${n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 })}`);
const src = (id: string) => sourceDef(id)?.name ?? id;
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The data pack as compact Markdown for the prompt. */
export function packForPrompt(pack: ResearchPack): string {
  const q = pack.query;
  const out: string[] = [
    `## Research data (fetched ${new Date(pack.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC, last ${q.days} days)`,
    `Topic: ${q.query}${q.symbols.length ? ` · stocks: ${q.symbols.join(', ')}` : ''}${q.coins.length ? ` · crypto: ${q.coins.join(', ')}` : ''}`,
  ];
  if (pack.markets.length || pack.fearGreed) {
    out.push('### Market numbers');
    for (const m of pack.markets) {
      const first = m.series[0];
      const range = m.series.length ? ` · ${day(first.t)}→now: ${money(first.v)} → ${money(m.price)}` : '';
      out.push(`- ${m.symbol}${m.name ? ` (${m.name})` : ''}, ${m.kind}: ${money(m.price, m.currency)} · 24h ${pct(m.changePct)}${m.change7dPct !== undefined ? ` · 7d ${pct(m.change7dPct)}` : ''}${range}`);
    }
    if (pack.fearGreed) {
      const old = pack.fearGreed.series[0];
      out.push(`- Crypto Fear & Greed index: ${pack.fearGreed.value} (${pack.fearGreed.label})${old ? `; ${day(old.t)}: ${old.v}` : ''}`);
    }
  }
  if (pack.tone?.length) {
    out.push('### Average tone of news coverage per day (GDELT, about −10 very negative … +10 very positive)');
    out.push(pack.tone.map((p) => `${day(p.t)}: ${p.v.toFixed(2)}`).join(' · '));
  }
  out.push('### Volume per day (news / social)', pack.volume.map((v) => `${day(v.t)}: ${v.news}/${v.social}`).join(' · '));
  if (pack.news.length) {
    out.push(`### News articles (${pack.news.length})`);
    pack.news.forEach((n, i) =>
      out.push(`${i + 1}. [${day(n.at)}] ${n.outlet ?? src(n.source)}${n.lang === 'th' ? ' (TH)' : ''} — ${oneLine(n.title)}${n.snippet ? ` — ${oneLine(n.snippet).slice(0, 200)}` : ''} <${n.url}>`),
    );
  }
  if (pack.posts.length) {
    out.push(`### Social posts and comments (${pack.posts.length})`);
    pack.posts.forEach((p) => out.push(`- [${src(p.source)}${p.engagement ? ` ▲${p.engagement}` : ''} ${day(p.at)}] "${oneLine(p.text).slice(0, 300)}" <${p.url}>`));
  }
  const failed = pack.sources.filter((s) => !s.ok);
  if (failed.length) out.push(`(Unavailable this time: ${failed.map((s) => `${src(s.source)} — ${s.note}`).join('; ')})`);
  return out.join('\n');
}

const SCHEMA = `{"overall":{"positive":0,"neutral":0,"negative":0,"score":0},"bySource":[{"source":"reddit","positive":0,"neutral":0,"negative":0,"n":0}],"themes":[{"name":"","sentiment":0,"share":0,"quote":""}]}`;

/** Extra system instructions for a research step. */
export function researchInstructions(lang: Lang, webSearch: boolean): string {
  return [
    'This step is a news & social-sentiment analysis. You are given a data pack of recent news articles, social media posts and market numbers.',
    webSearch
      ? 'You may also search the web to check facts or fill gaps; cite every source you use with a link.'
      : 'Work only from the data pack; do not invent facts, numbers or quotes.',
    `Write the report in ${lang === 'th' ? 'Thai' : 'English'} with these sections: Summary (3–5 bullet points) · Overall sentiment (what people feel and why) · By platform · Key themes and representative quotes (short, attributed to the platform) · The numbers (prices, changes, indices, volume — only from the data or cited sources) · Risks and things to watch · Sources (links).`,
    'Judge sentiment from what people actually say. Separate facts (news) from opinions (posts). If the data is thin or one-sided, say so.',
    `End with a fenced \`\`\`json block containing ONLY your sentiment reading in this exact shape: ${SCHEMA}. Percentages are integers that add up to 100; "score" and theme "sentiment" run from -1 (very negative) to 1 (very positive); "share" is the % of items about that theme; "n" is how many items of that source you judged. Use source ids from the data (gdelt, gnews, hn, reddit, youtube, bluesky, finnhub, alphavantage) or "web".`,
  ].join('\n');
}

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
};
function cleanSplit(o: Record<string, unknown>): SentimentSplit {
  const p = num(o.positive, 0, 100);
  const neg = num(o.negative, 0, 100);
  const neu = num(o.neutral, 0, 100);
  const total = p + neg + neu || 1;
  const positive = Math.round((p / total) * 100);
  const negative = Math.round((neg / total) * 100);
  return { positive, negative, neutral: Math.max(0, 100 - positive - negative) };
}

/** Pull the model's ```json sentiment block out of its answer. Falls back to the word-list estimate. */
export function readAnalysis(text: string, pack: ResearchPack): { text: string; analysis: SentimentAnalysis } {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const last = blocks[blocks.length - 1];
  if (last) {
    try {
      const raw = JSON.parse(last[1]) as Record<string, any>;
      const overall = cleanSplit(raw.overall ?? {});
      const score = Math.round(num(raw.overall?.score ?? (overall.positive - overall.negative) / 100, -1, 1) * 100) / 100;
      const analysis: SentimentAnalysis = {
        overall: { ...overall, score, label: sentimentLabel(score) },
        bySource: (Array.isArray(raw.bySource) ? raw.bySource : [])
          .slice(0, 12)
          .map((s: Record<string, unknown>) => ({ source: String(s.source ?? '?').slice(0, 30), n: Math.round(num(s.n, 0, 10000)), ...cleanSplit(s) })),
        themes: (Array.isArray(raw.themes) ? raw.themes : []).slice(0, 8).map((t: Record<string, unknown>) => ({
          name: String(t.name ?? '').slice(0, 60),
          sentiment: Math.round(num(t.sentiment, -1, 1) * 100) / 100,
          share: Math.round(num(t.share, 0, 100)),
          quote: t.quote ? String(t.quote).slice(0, 240) : undefined,
        })),
        estimated: false,
      };
      const cleaned = (text.slice(0, last.index) + text.slice(last.index! + last[0].length)).trim();
      return { text: cleaned, analysis };
    } catch {
      /* unreadable — fall through */
    }
  }
  return { text, analysis: estimate(pack) };
}

/** Report for a simulated step (no AI): real data, word-list sentiment. */
export function simulatedReport(pack: ResearchPack, a: SentimentAnalysis, lang: Lang): string {
  const th = lang === 'th';
  const q = pack.query;
  const o = a.overall;
  const lines: string[] = [];
  lines.push(`## ${th ? 'ภาพรวมความรู้สึกต่อ' : 'Sentiment snapshot:'} ${q.query}`);
  lines.push(
    th
      ? `จาก ${pack.news.length} ข่าว และ ${pack.posts.length} โพสต์/คอมเมนต์ ใน ${q.days} วันที่ผ่านมา: **บวก ${o.positive}% · กลาง ${o.neutral}% · ลบ ${o.negative}%** (คะแนน ${o.score >= 0 ? '+' : ''}${o.score})`
      : `From ${pack.news.length} articles and ${pack.posts.length} posts/comments over the last ${q.days} days: **${o.positive}% positive · ${o.neutral}% neutral · ${o.negative}% negative** (score ${o.score >= 0 ? '+' : ''}${o.score})`,
  );
  if (pack.markets.length || pack.fearGreed) {
    lines.push(`### ${th ? 'ตัวเลขตลาด' : 'Market numbers'}`);
    for (const m of pack.markets) lines.push(`- **${m.symbol}** ${money(m.price, m.currency)} · 24h ${pct(m.changePct)}${m.change7dPct !== undefined ? ` · 7d ${pct(m.change7dPct)}` : ''}`);
    if (pack.fearGreed) lines.push(`- Fear & Greed: **${pack.fearGreed.value}** (${pack.fearGreed.label})`);
  }
  if (a.bySource.length) {
    lines.push(`### ${th ? 'แยกตามแหล่ง' : 'By source'}`);
    lines.push(`| ${th ? 'แหล่ง' : 'Source'} | n | ${th ? 'บวก' : 'Pos'} | ${th ? 'กลาง' : 'Neu'} | ${th ? 'ลบ' : 'Neg'} |`, '|---|---:|---:|---:|---:|');
    for (const s of a.bySource) lines.push(`| ${src(s.source)} | ${s.n} | ${s.positive}% | ${s.neutral}% | ${s.negative}% |`);
  }
  if (a.themes.length) {
    lines.push(`### ${th ? 'คำที่พูดถึงบ่อย' : 'Frequent words'}`);
    lines.push(a.themes.map((t) => `${t.name} (${t.share}%, ${t.sentiment >= 0 ? '+' : ''}${t.sentiment})`).join(' · '));
  }
  if (pack.news.length) {
    lines.push(`### ${th ? 'ข่าวล่าสุด' : 'Latest headlines'}`);
    for (const n of pack.news.slice(0, 6)) lines.push(`- [${oneLine(n.title)}](${n.url}) — ${n.outlet ?? src(n.source)}, ${day(n.at)}`);
  }
  const loud = [...pack.posts].sort((x, y) => (y.engagement ?? 0) - (x.engagement ?? 0)).slice(0, 4);
  if (loud.length) {
    lines.push(`### ${th ? 'เสียงจากโซเชียล' : 'What people say'}`);
    for (const p of loud) lines.push(`> “${oneLine(p.text).slice(0, 180)}” — [${src(p.source)}](${p.url})`, '');
  }
  const missing = pack.sources.filter((s) => !s.ok);
  if (missing.length) lines.push(`_${th ? 'แหล่งที่ใช้ไม่ได้รอบนี้' : 'Not available this time'}: ${missing.map((s) => `${src(s.source)} (${s.note})`).join(', ')}_`);
  lines.push(
    '',
    th
      ? '> ⚠️ ค่าความรู้สึกนี้ประมาณจากรายการคำ (ไม่ได้ใช้ AI) — ใส่ API key ของโมเดลเพื่อให้เอเจนต์อ่านและวิเคราะห์จริง'
      : "> ⚠️ Sentiment estimated from word lists (no AI) — add your model's API key for a real reading by the agent.",
  );
  return lines.join('\n');
}
