// Rough sentiment without AI: small English/Thai word lists + emoji. Used for simulated steps and as
// a fallback when a model's answer has no readable sentiment block. Results are marked `estimated`.
import type { ResearchPack, SentimentAnalysis, SentimentSplit } from '../../shared/research';

const POS_EN = `good great excellent amazing awesome love loved loving like likes best better win wins winning won bullish rally surge surges soared soar gain gains gained
growth grow growing profit profitable beat beats strong stronger record boost boosted upgrade upgraded positive optimistic success successful
happy glad impressive innovative recommend recommended reliable fast easy smooth helpful fantastic wonderful solid rebound recovery recovered
breakthrough exciting excited approve approved praise praised safe secure affordable cheap fair outperform upbeat thrilled`;
const NEG_EN = `bad worse worst terrible awful horrible hate hated hates dislike poor weak weaker loss losses lose losing lost bearish crash crashed plunge plunged
drop dropped drops fall fell falling decline declined slump selloff sell-off fear fears scam fraud lawsuit sued fine fined ban banned
problem problems issue issues bug bugs broken fail failed failure fails risk risky concern concerns worried worry angry disappointed
disappointing expensive overpriced slow outage delay delayed recall recalled layoff layoffs cut cuts downgrade downgraded negative
pessimistic toxic boycott backlash scandal hack hacked breach leak leaked crisis inflation recession debt default bankrupt bankruptcy`;
const POS_TH = `ดี ดีมาก เยี่ยม ยอดเยี่ยม สุดยอด ชอบ รัก ประทับใจ คุ้ม คุ้มค่า แนะนำ ปัง เจ๋ง เก่ง สะดวก ง่าย เร็ว ถูก อร่อย สวย
ปลอดภัย พอใจ เติบโต กำไร พุ่ง ทะยาน บวก ขึ้น ฟื้น ฟื้นตัว สำเร็จ ชนะ มั่นใจ ดีใจ สนุก น่าสนใจ ขอบคุณ เชื่อถือ ทำได้ดี`;
const NEG_TH = `แย่ แย่มาก ห่วย เกลียด ไม่ชอบ ผิดหวัง เสียใจ โกง หลอก แพง ช้า พัง เสีย ปัญหา ข้อผิดพลาด บั๊ก ล่ม ขาดทุน ร่วง ดิ่ง
ลบ ลง ตก ทรุด วิกฤต เสี่ยง กังวล กลัว โกรธ ด่า ดราม่า แบน ฟ้อง ปลด เลิกจ้าง เงินเฟ้อ ถดถอย หนี้ ล้มละลาย ไม่คุ้ม รำคาญ อันตราย`;
const NEGATORS = new Set(['not', 'no', 'never', "don't", "doesn't", "isn't", "wasn't", "aren't", "won't", "can't", 'ไม่', 'ไม่ได้', 'ไม่ค่อย']);

const toSet = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const POS = new Set([...toSet(POS_EN), ...toSet(POS_TH)]);
const NEG = new Set([...toSet(NEG_EN), ...toSet(NEG_TH)]);
const POS_EMOJI = /[😀😃😄😁😊😍🥰😎👍🙌🎉🚀💪❤🔥✨💯]/gu;
const NEG_EMOJI = /[😡😠🤬😢😭😞😩👎💩😤🤮📉]/gu;

const segmenter = new Intl.Segmenter('th', { granularity: 'word' });

/** Words of any language (Thai has no spaces, so use the ICU word segmenter). */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const s of segmenter.segment(text.toLowerCase())) if (s.isWordLike) out.push(s.segment);
  return out;
}

/** −1…1 */
export function scoreText(text: string): number {
  const ws = words(text);
  let pos = 0;
  let neg = 0;
  ws.forEach((w, i) => {
    const flipped = NEGATORS.has(ws[i - 1] ?? '') || NEGATORS.has(ws[i - 2] ?? '');
    if (POS.has(w)) flipped ? neg++ : pos++;
    else if (NEG.has(w)) flipped ? pos++ : neg++;
  });
  pos += (text.match(POS_EMOJI) ?? []).length;
  neg += (text.match(NEG_EMOJI) ?? []).length;
  if (!pos && !neg) return 0;
  return (pos - neg) / (pos + neg + 1);
}

export const sentimentLabel = (score: number): string =>
  score >= 0.45 ? 'very positive' : score >= 0.15 ? 'positive' : score > -0.15 ? 'mixed / neutral' : score > -0.45 ? 'negative' : 'very negative';

const bucket = (s: number) => (s >= 0.15 ? 'positive' : s <= -0.15 ? 'negative' : 'neutral');

function split(scores: number[]): SentimentSplit {
  const n = scores.length || 1;
  const c = { positive: 0, neutral: 0, negative: 0 };
  for (const s of scores) c[bucket(s)]++;
  const positive = Math.round((c.positive / n) * 100);
  const negative = Math.round((c.negative / n) * 100);
  return { positive, negative, neutral: Math.max(0, 100 - positive - negative) };
}

const STOP = toSet(`the a an and or of to in on for with is are was were be been being it its this that these those from by at as about after
before over into onto out up down off new says said say will would could should can cannot has have had having not but than then more
most just also what who whom whose how why when where which while your you our their they them his her him she he we me my mine
i us there here very much many some any all each every both few other others another such only own same so too again once
because since until though although if else does did doing done do get got gets make made makes take took one two three first last
time times way thing things people really still even ever never always now today yesterday tomorrow week weeks year years day days
month months like going go goes went know think want need use used using via per vs etc yes no ok okay well good bad lot lots
https http www com news update updates report reports reported according amid among across within without against between
ที่ และ ของ ใน ได้ ให้ เป็น มี การ จะ ว่า ไป มา กับ แล้ว ก็ นี้ ไม่ ความ คน หรือ แต่ อยู่ ยัง ซึ่ง โดย เพื่อ จาก ถึง อีก ทั้ง เลย นั้น ทำ`);

/** Score every item that has no sentiment yet (in place). */
export function scorePack(pack: ResearchPack): void {
  for (const n of pack.news) n.sentiment ??= scoreText(`${n.title} ${n.snippet ?? ''}`);
  for (const p of pack.posts) p.sentiment ??= scoreText(p.text);
}

/** Overall / per-source split and frequent themes, from the item scores. */
export function estimate(pack: ResearchPack): SentimentAnalysis {
  scorePack(pack);
  const items = [
    ...pack.news.map((n) => ({ source: n.source, text: `${n.title} ${n.snippet ?? ''}`, s: n.sentiment ?? 0, w: 1 })),
    ...pack.posts.map((p) => ({ source: p.source, text: p.text, s: p.sentiment ?? 0, w: 1 + Math.log10(1 + Math.max(0, p.engagement ?? 0)) })),
  ];
  const all = items.map((i) => i.s);
  const weighted = items.reduce((s, i) => s + i.s * i.w, 0) / (items.reduce((s, i) => s + i.w, 0) || 1);

  const bySourceMap = new Map<string, number[]>();
  for (const i of items) bySourceMap.set(i.source, [...(bySourceMap.get(i.source) ?? []), i.s]);
  const bySource = [...bySourceMap].map(([source, ss]) => ({ source, n: ss.length, ...split(ss) })).sort((a, b) => b.n - a.n);

  // Themes: frequent words that aren't the query itself.
  const queryWords = new Set(words(pack.query.query));
  const counts = new Map<string, { n: number; s: number; quote: string }>();
  for (const i of items) {
    for (const w of new Set(words(i.text))) {
      if (w.length < 3 || STOP.has(w) || queryWords.has(w) || /^\d+$/.test(w) || /['’]/.test(w)) continue;
      const c = counts.get(w) ?? { n: 0, s: 0, quote: i.text };
      c.n++;
      c.s += i.s;
      counts.set(w, c);
    }
  }
  const themes = [...counts]
    .filter(([, c]) => c.n >= 3)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 6)
    .map(([name, c]) => ({ name, sentiment: Math.round((c.s / c.n) * 100) / 100, share: Math.round((c.n / (items.length || 1)) * 100), quote: c.quote.slice(0, 160) }));

  const score = Math.round(weighted * 100) / 100;
  return { overall: { ...split(all), score, label: sentimentLabel(score) }, bySource, themes, estimated: true };
}
