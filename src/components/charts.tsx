// Small SVG charts for research reports and the Newsroom. Colors come from the --viz-* tokens in
// styles.css (validated against the card surface): a blue↔red diverging pair with a gray neutral for
// sentiment, categorical slots 1–2 for series. Every chart has a hover/focus tooltip and a table view.
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useT } from '../store';
import type { Point, SentimentSplit } from '../types';

// ─── Formatting ──────────────────────────────────────────────────────────────

export const compact = (n: number): string =>
  Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const signed = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
export const price = (n?: number) => (n === undefined ? '–' : `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 2 : 0 })}`);
export const shortDate = (t: number, lang: 'th' | 'en') => new Date(t).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' });

/** Draw at the container's real width so text and marks keep their pixel sizes at any window size. */
function useWidth(fallback = 520): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(280, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ─── Card with a table-view twin ─────────────────────────────────────────────

export interface TableData {
  head: string[];
  rows: (string | number)[][];
}

export function ChartCard({ title, subtitle, table, legend, children }: { title: string; subtitle?: string; table: TableData; legend?: ReactNode; children: ReactNode }) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="viz-card">
      <header className="viz-head">
        <div>
          <h4>{title}</h4>
          {subtitle && <div className="viz-sub">{subtitle}</div>}
        </div>
        <button className="btn sm" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
          {asTable ? `📊 ${t('viz_chart')}` : `▦ ${t('viz_table')}`}
        </button>
      </header>
      {asTable ? (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead>
              <tr>{table.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' || j > 0 ? 'num' : ''}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend && <div className="viz-legend">{legend}</div>}
          {children}
        </>
      )}
    </section>
  );
}

export const LegendItem = ({ color, label, line }: { color: string; label: string; line?: boolean }) => (
  <span className="viz-legend-item">
    <span className={line ? 'viz-key-line' : 'viz-key'} style={{ background: color }} />
    {label}
  </span>
);

/** Tooltip that follows the hovered mark inside a relatively positioned wrapper. */
function Tip({ tip }: { tip: { x: number; y: number; value: string; label: string } | null }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
}

// ─── Sentiment: diverging stacked bars centered on neutral ───────────────────

export const SENT_COLORS = { negative: 'var(--viz-neg)', neutral: 'var(--viz-neu)', positive: 'var(--viz-pos)' } as const;

export function SentimentLegend() {
  const t = useT();
  return (
    <>
      <LegendItem color={SENT_COLORS.negative} label={t('sent_negative')} />
      <LegendItem color={SENT_COLORS.neutral} label={t('sent_neutral')} />
      <LegendItem color={SENT_COLORS.positive} label={t('sent_positive')} />
    </>
  );
}

const GAP = 2;

/**
 * One row per item; the neutral segment straddles a shared center line so rows compare at a glance.
 * Percent labels sit inside segments only when they fit; otherwise the tooltip and table carry them.
 */
export function DivergingBars({ rows, labelWidth = 110 }: { rows: { label: string; note?: string; split: SentimentSplit }[]; labelWidth?: number }) {
  const t = useT();
  const [tip, setTip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const [wrapRef, W] = useWidth();
  const ROW = 30;
  const BAR = 18;
  const plotW = W - labelWidth - 8;
  const left = Math.max(...rows.map((r) => r.split.negative + r.split.neutral / 2), 50);
  const right = Math.max(...rows.map((r) => r.split.positive + r.split.neutral / 2), 50);
  const scale = plotW / (left + right);
  const cx = labelWidth + 8 + left * scale;
  const H = rows.length * ROW + 4;
  const names = { negative: t('sent_negative'), neutral: t('sent_neutral'), positive: t('sent_positive') };

  return (
    <div className="viz-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={rows.map((r) => `${r.label}: ${r.split.positive}% / ${r.split.neutral}% / ${r.split.negative}%`).join('; ')}>
        <line x1={cx} x2={cx} y1={0} y2={H} className="viz-axis" />
        {rows.map((r, i) => {
          const y = i * ROW + (ROW - BAR) / 2 + 2;
          const segs = (['negative', 'neutral', 'positive'] as const).map((k) => ({ k, v: r.split[k] }));
          let x = cx - (r.split.negative + r.split.neutral / 2) * scale;
          const visible = segs.filter((s) => s.v > 0);
          return (
            <g key={r.label}>
              <text x={labelWidth} y={y + BAR / 2} className="viz-label" textAnchor="end" dominantBaseline="central">
                {r.label}
                {r.note && <tspan className="viz-muted"> {r.note}</tspan>}
              </text>
              {segs.map((s) => {
                const w = s.v * scale;
                const x0 = x;
                x += w;
                if (w <= 0) return null;
                const first = s === visible[0];
                const last = s === visible[visible.length - 1];
                const inner = Math.max(0, w - (last ? 0 : GAP));
                const label = `${s.v}%`;
                const fits = inner > label.length * 7 + 8;
                const show = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
                  const box = (e.currentTarget.closest('.viz-wrap') as HTMLElement).getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, value: `${s.v}%`, label: `${r.label} · ${names[s.k]}` });
                };
                return (
                  <g key={s.k}>
                    <path d={roundedBar(x0, y, inner, BAR, first ? 4 : 0, last ? 4 : 0)} fill={SENT_COLORS[s.k]} />
                    {fits && (
                      <text x={x0 + inner / 2} y={y + BAR / 2} className={`viz-in ${s.k === 'neutral' ? 'dark' : ''}`} textAnchor="middle" dominantBaseline="central">
                        {label}
                      </text>
                    )}
                    <rect
                      x={x0} y={y - 4} width={Math.max(w, 6)} height={BAR + 8} fill="transparent" tabIndex={0}
                      aria-label={`${r.label} ${names[s.k]} ${s.v}%`}
                      onPointerMove={show}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => {
                        const rb = e.currentTarget.getBoundingClientRect();
                        show({ clientX: rb.left + rb.width / 2, clientY: rb.top, currentTarget: e.currentTarget });
                      }}
                      onBlur={() => setTip(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/** Horizontal bar with optional rounded ends (4px data-ends). */
function roundedBar(x: number, y: number, w: number, h: number, rl: number, rr: number): string {
  rl = Math.min(rl, w / 2, h / 2);
  rr = Math.min(rr, w / 2, h / 2);
  return [
    `M${x + rl},${y}`,
    `H${x + w - rr}`,
    rr ? `Q${x + w},${y} ${x + w},${y + rr}` : '',
    `V${y + h - rr}`,
    rr ? `Q${x + w},${y + h} ${x + w - rr},${y + h}` : '',
    `H${x + rl}`,
    rl ? `Q${x},${y + h} ${x},${y + h - rl}` : '',
    `V${y + rl}`,
    rl ? `Q${x},${y} ${x + rl},${y}` : '',
    'Z',
  ].join(' ');
}

// ─── Line (one series, optional zero baseline) ───────────────────────────────

export function LineChart({
  points, format, dateLabel, domain, baseline, height = 150, ariaLabel,
}: {
  points: Point[];
  format: (v: number) => string;
  dateLabel: (t: number) => string;
  domain?: [number, number];
  baseline?: number;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clip = useId();
  const [wrapRef, W] = useWidth();
  if (points.length < 2) return <div className="viz-empty">–</div>;
  const H = height;
  const pad = { l: 46, r: 56, t: 10, b: 22 };
  const xs = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  let [lo, hi] = domain ?? [Math.min(...vs), Math.max(...vs)];
  if (baseline !== undefined && !domain) {
    lo = Math.min(lo, baseline);
    hi = Math.max(hi, baseline);
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  if (!domain) {
    lo -= span * 0.08;
    hi += span * 0.08;
  }
  const x = (t: number) => pad.l + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = niceTicks(lo, hi, 3);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(xs[xs.length - 1])},${H - pad.b} L${x(xs[0])},${H - pad.b} Z`;
  const last = points[points.length - 1];
  const h = hover === null ? null : points[hover];

  const nearest = (clientX: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    });
    return best;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? points.length) - 1));
    else if (e.key === 'ArrowRight') setHover((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else return;
    e.preventDefault();
  };

  return (
    <div className="viz-wrap" ref={wrapRef}>
      <svg
        ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={ariaLabel} tabIndex={0}
        onPointerMove={(e) => setHover(nearest(e.clientX))} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
      >
        <clipPath id={clip}>
          <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} />
        </clipPath>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="viz-grid" />
            <text x={pad.l - 6} y={y(v)} className="viz-tick" textAnchor="end" dominantBaseline="central">{format(v)}</text>
          </g>
        ))}
        {baseline !== undefined && <line x1={pad.l} x2={W - pad.r} y1={y(baseline)} y2={y(baseline)} className="viz-axis" />}
        <text x={pad.l} y={H - 6} className="viz-tick">{dateLabel(xs[0])}</text>
        <text x={W - pad.r} y={H - 6} className="viz-tick" textAnchor="end">{dateLabel(xs[xs.length - 1])}</text>
        <g clipPath={`url(#${clip})`}>
          <path d={area} className="viz-area" />
          <path d={d} className="viz-line" />
        </g>
        <circle cx={x(last.t)} cy={y(last.v)} r={4} className="viz-dot" />
        <text x={x(last.t) + 8} y={y(last.v)} className="viz-label" dominantBaseline="central">{format(last.v)}</text>
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} className="viz-cross" />
            <circle cx={x(h.t)} cy={y(h.v)} r={4} className="viz-dot" />
          </g>
        )}
      </svg>
      {h && (
        <div className="viz-tip" style={{ left: `${(x(h.t) / W) * 100}%`, top: `${(y(h.v) / H) * 100}%` }} role="status">
          <strong>{format(h.v)}</strong>
          <span>{dateLabel(h.t)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Stacked columns (e.g. mentions per day: news + social) ──────────────────

export function StackedColumns({
  data, series, dateLabel, ariaLabel, format = compact,
}: {
  data: { t: number; values: number[] }[];
  series: { label: string; color: string }[];
  dateLabel: (t: number) => string;
  ariaLabel: string;
  format?: (v: number) => string;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const [wrapRef, W] = useWidth();
  const H = 140;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.values.reduce((s, v) => s + v, 0)));
  const nice = niceMax(max);
  const band = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(24, band * 0.7);
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const labelEvery = Math.ceil(data.length / 7);
  return (
    <div className="viz-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={ariaLabel}>
        {[0, nice / 2, nice].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'viz-axis' : 'viz-grid'} />
            <text x={pad.l - 6} y={y(v)} className="viz-tick" textAnchor="end" dominantBaseline="central">{format(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2;
          let acc = 0;
          const total = d.values.reduce((s, v) => s + v, 0);
          const top = d.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
          return (
            <g key={d.t}>
              {d.values.map((v, k) => {
                if (v <= 0) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const hgt = Math.max(0, y0 - y1 - (k === top ? 0 : GAP));
                return <path key={k} d={columnPath(cx - bw / 2, y0 - hgt, bw, hgt, k === top ? 4 : 0)} fill={series[k].color} />;
              })}
              {i % labelEvery === 0 && <text x={cx} y={H - 6} className="viz-tick" textAnchor="middle">{dateLabel(d.t)}</text>}
              <rect
                x={cx - band / 2} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" tabIndex={0}
                aria-label={`${dateLabel(d.t)}: ${series.map((s, k) => `${s.label} ${format(d.values[k])}`).join(', ')}`}
                onPointerMove={(e) => {
                  const box = (e.currentTarget.closest('.viz-wrap') as HTMLElement).getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, value: format(total), label: `${dateLabel(d.t)} · ${series.map((s, k) => `${s.label} ${format(d.values[k])}`).join(' · ')}` });
                }}
                onFocus={(e) => {
                  const box = (e.currentTarget.closest('.viz-wrap') as HTMLElement).getBoundingClientRect();
                  const rb = e.currentTarget.getBoundingClientRect();
                  setTip({ x: rb.left + rb.width / 2 - box.left, y: rb.top - box.top + 10, value: format(total), label: `${dateLabel(d.t)} · ${series.map((s, k) => `${s.label} ${format(d.values[k])}`).join(' · ')}` });
                }}
                onPointerLeave={() => setTip(null)}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/** Round tick values (1 / 2 / 2.5 / 5 × 10ⁿ steps) inside [lo, hi]. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Column rounded only at its data end (top). */
function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// ─── Horizontal bars (one series, e.g. steps per agent) ─────────────────────

export function HBars({ rows, format = (v) => compact(v), ariaLabel }: { rows: { label: string; value: number; note?: string }[]; format?: (v: number) => string; ariaLabel: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const [wrapRef, W] = useWidth();
  const ROW = 26;
  const BAR = 14;
  const labelW = 130;
  const valueW = 56;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const scale = (W - labelW - valueW - 12) / max;
  const H = rows.length * ROW + 4;
  return (
    <div className="viz-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}`}>
        <line x1={labelW + 8} x2={labelW + 8} y1={0} y2={H} className="viz-axis" />
        {rows.map((r, i) => {
          const y = i * ROW + (ROW - BAR) / 2 + 2;
          const w = Math.max(r.value > 0 ? 2 : 0, r.value * scale);
          const show = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
            const box = (e.currentTarget.closest('.viz-wrap') as HTMLElement).getBoundingClientRect();
            setTip({ x: e.clientX - box.left, y: e.clientY - box.top, value: format(r.value), label: r.note ? `${r.label} · ${r.note}` : r.label });
          };
          return (
            <g key={`${r.label}-${i}`}>
              <text x={labelW} y={y + BAR / 2} className="viz-label" textAnchor="end" dominantBaseline="central">{r.label}</text>
              {w > 0 && <path d={roundedBar(labelW + 8, y, w, BAR, 0, 4)} fill="var(--viz-s1)" />}
              <text x={labelW + 8 + w + 6} y={y + BAR / 2} className="viz-label" dominantBaseline="central">{format(r.value)}</text>
              <rect
                x={labelW + 8} y={y - 5} width={W - labelW - 8} height={BAR + 10} fill="transparent" tabIndex={0} aria-label={`${r.label}: ${format(r.value)}`}
                onPointerMove={show}
                onPointerLeave={() => setTip(null)}
                onFocus={(e) => {
                  const rb = e.currentTarget.getBoundingClientRect();
                  show({ clientX: rb.left + 40, clientY: rb.top, currentTarget: e.currentTarget });
                }}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ─── Stat tile & sparkline ───────────────────────────────────────────────────

export function Sparkline({ points, width = 120, height = 28 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const x = (i: number) => 2 + (i / (points.length - 1)) * (width - 8);
  const y = (v: number) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="viz-spark" aria-hidden>
      <path d={d} className="viz-spark-line" />
      <circle cx={x(points.length - 1)} cy={y(last.v)} r={3} className="viz-spark-dot" />
    </svg>
  );
}

export function StatTile({ label, value, sub, delta, trend }: { label: string; value: string; sub?: string; delta?: { value: number; text: string; period?: string }; trend?: Point[] }) {
  return (
    <div className="viz-stat">
      <div className="viz-stat-label">{label}</div>
      <div className="viz-stat-value">{value}</div>
      {sub && <div className="viz-stat-sub">{sub}</div>}
      {delta && (
        <div className={`viz-delta ${delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : ''}`}>
          {delta.value > 0 ? '▲' : delta.value < 0 ? '▼' : '■'} {delta.text}
          {delta.period && <span className="viz-muted"> {delta.period}</span>}
        </div>
      )}
      {trend && trend.length > 1 && <Sparkline points={trend} />}
    </div>
  );
}
