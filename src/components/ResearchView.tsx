// Charts and lists for one research result (an analyst's step or a Newsroom report).
import { useLang, useT } from '../store';
import { sourceDef } from '../../shared/research';
import type { ResearchResult } from '../types';
import { ChartCard, DivergingBars, LegendItem, LineChart, SentimentLegend, StackedColumns, StatTile, compact, price, shortDate, signed } from './charts';

const srcName = (id: string) => (id === 'web' ? 'Web' : (sourceDef(id)?.name ?? id));

/** Score −1…1 → a label key. */
export const sentimentKey = (score: number) =>
  score >= 0.45 ? 'sent_veryPositive' : score >= 0.15 ? 'sent_positive' : score > -0.15 ? 'sent_mixed' : score > -0.45 ? 'sent_negative' : 'sent_veryNegative';

export function ResearchView({ result }: { result: ResearchResult }) {
  const t = useT();
  const lang = useLang();
  const { pack, analysis } = result;
  const o = analysis.overall;
  const day = (ts: number) => shortDate(ts, lang);
  const totalNews = pack.news.length;
  const totalPosts = pack.posts.length;
  const volumeTrend = pack.volume.map((v) => ({ t: v.t, v: v.news + v.social }));
  const posts = [...pack.posts].sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0)).slice(0, 5);

  return (
    <div className="research">
      {analysis.estimated && <p className="hint research-note">⚠️ {t('res_estimated')}</p>}

      <div className="viz-kpis">
        <StatTile
          label={t('res_overall')}
          value={signed(o.score)}
          sub={`${t(sentimentKey(o.score))} · ${t('res_split', { pos: o.positive, neu: o.neutral, neg: o.negative })}`}
        />
        <StatTile label={t('res_mentions')} value={compact(totalNews + totalPosts)} sub={t('res_mentionsSplit', { news: totalNews, posts: totalPosts, days: pack.query.days })} trend={volumeTrend} />
        {pack.markets.map((m) => (
          <StatTile
            key={`${m.kind}-${m.symbol}`}
            label={m.name ? `${m.symbol} · ${m.name}` : m.symbol}
            value={price(m.price)}
            delta={m.changePct === undefined ? undefined : { value: m.changePct, text: `${signed(m.changePct)}%`, period: t('res_24h') }}
            sub={m.change7dPct !== undefined ? `7d ${signed(m.change7dPct)}%` : undefined}
            trend={m.series.slice(-30)}
          />
        ))}
        {pack.fearGreed && (
          <StatTile
            label={t('res_fearGreed')}
            value={String(pack.fearGreed.value)}
            sub={pack.fearGreed.label}
            delta={
              pack.fearGreed.series.length > 7
                ? (() => {
                    const ago = pack.fearGreed.series[pack.fearGreed.series.length - 8].v;
                    return { value: pack.fearGreed.value - ago, text: signed(pack.fearGreed.value - ago, 0), period: t('res_vs7d') };
                  })()
                : undefined
            }
            trend={pack.fearGreed.series}
          />
        )}
      </div>

      <ChartCard
        title={t('res_bySource')}
        subtitle={analysis.estimated ? t('res_bySourceEst') : undefined}
        legend={<SentimentLegend />}
        table={{
          head: [t('res_source'), 'n', t('sent_positive'), t('sent_neutral'), t('sent_negative')],
          rows: [
            [t('res_overallRow'), totalNews + totalPosts, `${o.positive}%`, `${o.neutral}%`, `${o.negative}%`],
            ...analysis.bySource.map((s) => [srcName(s.source), s.n, `${s.positive}%`, `${s.neutral}%`, `${s.negative}%`]),
          ],
        }}
      >
        <DivergingBars
          rows={[
            { label: t('res_overallRow'), split: o },
            ...analysis.bySource.map((s) => ({ label: srcName(s.source), note: `n=${s.n}`, split: s })),
          ]}
        />
      </ChartCard>

      {pack.markets.filter((m) => m.series.length > 1).slice(0, 3).map((m) => (
        <ChartCard
          key={`chart-${m.kind}-${m.symbol}`}
          title={t('res_priceOf', { symbol: m.symbol })}
          subtitle={`${m.currency ?? 'USD'} · ${t('res_daily')}`}
          table={{ head: [t('res_date'), t('res_price')], rows: m.series.map((p) => [day(p.t), price(p.v)]) }}
        >
          <LineChart points={m.series} format={(v) => price(v)} dateLabel={day} ariaLabel={t('res_priceOf', { symbol: m.symbol })} />
        </ChartCard>
      ))}

      {pack.tone && pack.tone.length > 1 && (
        <ChartCard
          title={t('res_tone')}
          subtitle={t('res_toneHint')}
          table={{ head: [t('res_date'), t('res_toneValue')], rows: pack.tone.map((p) => [day(p.t), p.v.toFixed(2)]) }}
        >
          <LineChart points={pack.tone} baseline={0} format={(v) => signed(v, 1)} dateLabel={day} ariaLabel={t('res_tone')} height={130} />
        </ChartCard>
      )}

      {pack.volume.length > 1 && (
        <ChartCard
          title={t('res_volume')}
          legend={
            <>
              <LegendItem color="var(--viz-s1)" label={t('res_news')} />
              <LegendItem color="var(--viz-s2)" label={t('res_social')} />
            </>
          }
          table={{ head: [t('res_date'), t('res_news'), t('res_social')], rows: pack.volume.map((v) => [day(v.t), v.news, v.social]) }}
        >
          <StackedColumns
            data={pack.volume.map((v) => ({ t: v.t, values: [v.news, v.social] }))}
            series={[
              { label: t('res_news'), color: 'var(--viz-s1)' },
              { label: t('res_social'), color: 'var(--viz-s2)' },
            ]}
            dateLabel={day}
            ariaLabel={t('res_volume')}
          />
        </ChartCard>
      )}

      {analysis.themes.length > 0 && (
        <section className="viz-card">
          <header className="viz-head">
            <h4>{analysis.estimated ? t('res_words') : t('res_themes')}</h4>
          </header>
          <table className="viz-table themes">
            <thead>
              <tr>
                <th>{t('res_theme')}</th>
                <th className="num">{t('res_share')}</th>
                <th>{t('res_feeling')}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.themes.map((th) => (
                <tr key={th.name}>
                  <td>
                    <strong>{th.name}</strong>
                    {th.quote && !analysis.estimated && <div className="hint">“{th.quote}”</div>}
                  </td>
                  <td className="num">{th.share}%</td>
                  <td>
                    <span className="theme-score">
                      <span className="theme-track">
                        <span
                          className={`theme-fill ${th.sentiment >= 0 ? 'pos' : 'neg'}`}
                          style={th.sentiment >= 0 ? { left: '50%', width: `${th.sentiment * 50}%` } : { right: '50%', width: `${-th.sentiment * 50}%` }}
                        />
                      </span>
                      {signed(th.sentiment)} · {t(sentimentKey(th.sentiment))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="research-lists">
        {pack.news.length > 0 && (
          <section className="viz-card">
            <header className="viz-head">
              <h4>📰 {t('res_headlines')}</h4>
            </header>
            <ul className="res-list">
              {pack.news.slice(0, 8).map((n) => (
                <li key={n.url}>
                  <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a>
                  <div className="hint">
                    {n.outlet ?? srcName(n.source)} · {day(n.at)}
                    {n.lang === 'th' && ' · TH'}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {posts.length > 0 && (
          <section className="viz-card">
            <header className="viz-head">
              <h4>💬 {t('res_voices')}</h4>
            </header>
            <ul className="res-list">
              {posts.map((p) => (
                <li key={p.url}>
                  <span className="res-quote">“{p.text.length > 220 ? `${p.text.slice(0, 219)}…` : p.text}”</span>
                  <div className="hint">
                    <a href={p.url} target="_blank" rel="noreferrer noopener">{srcName(p.source)}</a>
                    {p.author && ` · ${p.author}`}
                    {p.engagement ? ` · ▲${compact(p.engagement)}` : ''} · {day(p.at)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="res-sources">
        <span className="hint">{t('res_sources')}:</span>
        {pack.sources.map((s) => (
          <span key={s.source} className={`chip ${s.ok ? 'src-ok' : 'src-off'}`} title={s.note ?? ''}>
            {s.ok ? '✓' : '✕'} {srcName(s.source)}
            {s.ok ? ` ${s.count}` : s.note === 'no key' ? ` · ${t('res_noKey')}` : ''}
          </span>
        ))}
        {pack.query.sources.includes('web') && !analysis.estimated && <span className="chip src-ok">🔎 Web</span>}
      </div>
    </div>
  );
}
