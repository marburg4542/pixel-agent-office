// Stats: how the agents and models are doing, what it costs, the team's board, and the news mood.
import { useEffect, useState } from 'react';
import { useLang, useStore, useT } from '../store';
import { api } from '../lib/api';
import { onServerEvent } from '../lib/events';
import { COLUMNS } from '../../shared/constants';
import type { Stats } from '../types';
import { usd } from '../util';
import { Avatar, Window } from './ui';
import { ChartCard, HBars, Sparkline, StackedColumns, StatTile, shortDate, signed } from './charts';
import { sentimentKey } from './ResearchView';

const duration = (s: number | null, lang: 'th' | 'en') => {
  if (s === null) return '–';
  if (s < 90) return lang === 'th' ? `${s} วิ.` : `${s}s`;
  const m = Math.round(s / 60);
  return lang === 'th' ? `${m} นาที` : `${m} min`;
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export function StatsWindow({ z, onClose }: { z: number; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const openModal = useStore((s) => s.openModal);
  const watchlists = useStore((s) => s.watchlists);
  const summaries = useStore((s) => s.watchSummaries);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<Stats>('/stats', { quiet: true }).then(
        (s) => live && setStats(s),
        () => live && setError(true),
      );
    void load();
    // Refresh when work finishes or money is spent (throttled by the events themselves).
    const offs = [onServerEvent('stage-done', () => void load()), onServerEvent('usage-changed', () => void load())];
    return () => {
      live = false;
      offs.forEach((off) => off());
    };
  }, []);

  const day = (d: string) => shortDate(Date.parse(`${d}T00:00:00`), lang);

  return (
    <Window z={z} width={980} title={`📊 ${t('stats')}`} onClose={onClose} bodyClassName="viz-root">
      {!stats ? (
        <p className="hint">{error ? t('stats_error') : t('loading')}</p>
      ) : (
        <div className="stats">
          <div className="viz-kpis">
            <StatTile label={t('stats_steps')} value={String(stats.totals.steps)} sub={t('stats_stepsSub')} />
            <StatTile label={t('stats_avgTime')} value={duration(stats.totals.avgSeconds, lang)} sub={t('stats_avgTimeSub')} />
            <StatTile
              label={t('stats_firstPass')}
              value={pct(stats.totals.firstPass, stats.totals.reviewed)}
              sub={t('stats_firstPassSub', { n: stats.totals.firstPass, of: stats.totals.reviewed })}
            />
            <StatTile label={t('stats_cost')} value={usd(stats.totals.costUsd)} sub={t('stats_costSub')} trend={stats.costDaily.map((d) => ({ t: Date.parse(d.day), v: d.costUsd }))} />
            <StatTile label={t('stats_autoRevisions')} value={String(stats.totals.autoRevisions)} sub={t('stats_autoRevisionsSub')} />
          </div>

          <h3 className="stats-h">🧑‍💼 {t('stats_agents')}</h3>
          <ChartCard
            title={t('stats_stepsByAgent')}
            subtitle={t('stats_stepsByAgentSub')}
            table={{
              head: [t('stats_agent'), t('stats_owner'), t('stats_model'), t('stats_stepsShort'), t('stats_avgTime'), t('stats_sentBack'), t('stats_questions'), t('stats_costShort')],
              rows: stats.agents.map((a) => [a.name, a.ownerName, a.modelName, a.steps, duration(a.avgSeconds, lang), a.sentBack, a.questions, a.costUsd === null ? '–' : usd(a.costUsd)]),
            }}
          >
            <HBars rows={stats.agents.map((a) => ({ label: a.mine ? a.name : `${a.name} (${a.ownerName})`, value: a.steps, note: `${a.modelName} · ${t('stats_sentBack')} ${a.sentBack}` }))} ariaLabel={t('stats_stepsByAgent')} />
          </ChartCard>
          <div className="stats-agent-grid">
            {stats.agents.filter((a) => a.mine).map((a) => (
              <div key={a.agentId} className="viz-stat stats-agent">
                <div className="row" style={{ gap: 6 }}>
                  <Avatar look={a.look} size={28} />
                  <strong>{a.name}</strong>
                </div>
                <div className="hint">{a.modelName}</div>
                <div className="stats-agent-nums">
                  <span>✅ {a.steps}</span>
                  <span title={t('stats_avgTime')}>⏱ {duration(a.avgSeconds, lang)}</span>
                  <span title={t('stats_sentBack')}>↩ {a.sentBack}</span>
                  <span title={t('stats_questions')}>❓ {a.questions}</span>
                  <span title={t('stats_costShort')}>💰 {usd(a.costUsd ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="stats-h">🧠 {t('stats_models')}</h3>
          <section className="viz-card">
            <table className="viz-table">
              <thead>
                <tr>
                  <th>{t('stats_model')}</th>
                  <th className="num">{t('stats_stepsShort')}</th>
                  <th className="num">{t('stats_avgTime')}</th>
                  <th className="num">{t('stats_calls')}</th>
                  <th className="num">{t('stats_costShort')}</th>
                  <th className="num">{t('stats_arenaWins')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.models.map((m) => (
                  <tr key={m.modelName}>
                    <td>{m.modelName}</td>
                    <td className="num">{m.steps}</td>
                    <td className="num">{duration(m.avgSeconds, lang)}</td>
                    <td className="num">{m.calls}</td>
                    <td className="num">{usd(m.costUsd)}</td>
                    <td className="num">{m.arenaGames ? `${m.arenaWins}/${m.arenaGames} (${pct(m.arenaWins, m.arenaGames)})` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginBottom: 0 }}>{t('stats_modelsHint')}</p>
          </section>

          <ChartCard
            title={t('stats_costDaily')}
            subtitle={t('stats_costDailySub', { since: day(stats.sinceDay) })}
            table={{ head: [t('res_date'), t('stats_costShort'), t('stats_calls')], rows: stats.costDaily.map((d) => [day(d.day), usd(d.costUsd), d.calls]) }}
          >
            {stats.costDaily.some((d) => d.costUsd > 0) ? (
              <StackedColumns
                data={stats.costDaily.map((d) => ({ t: Date.parse(`${d.day}T00:00:00`), values: [d.costUsd] }))}
                series={[{ label: t('stats_costShort'), color: 'var(--viz-s1)' }]}
                dateLabel={(ts) => shortDate(ts, lang)}
                format={(v) => usd(v)}
                ariaLabel={t('stats_costDaily')}
              />
            ) : (
              <p className="hint">{t('stats_noCost')}</p>
            )}
          </ChartCard>

          {(stats.arena.team.length > 0 || stats.arena.mine.length > 0) && (
            <section className="viz-card">
              <header className="viz-head">
                <div>
                  <h4>⚔️ {t('stats_arena')}</h4>
                  <div className="viz-sub">{t('stats_arenaSub')}</div>
                </div>
              </header>
              <table className="viz-table">
                <thead>
                  <tr>
                    <th>{t('stats_model')}</th>
                    <th className="num">{t('stats_arenaMine')}</th>
                    <th className="num">{t('stats_arenaTeam')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.arena.team.map((r) => {
                    const m = stats.arena.mine.find((x) => x.modelKey === r.modelKey);
                    return (
                      <tr key={r.modelKey}>
                        <td>{r.modelName}</td>
                        <td className="num">{m ? `${m.wins}/${m.games} (${pct(m.wins, m.games)})` : '–'}</td>
                        <td className="num">{`${r.wins}/${r.games} (${pct(r.wins, r.games)})`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <h3 className="stats-h">👥 {t('stats_team')}</h3>
          <div className="viz-kpis">
            {COLUMNS.map((c) => (
              <StatTile key={c} label={`${t('scope_shared')} · ${t(`col_${c}`)}`} value={String(stats.team.columns[c])} />
            ))}
            <StatTile label={`❓ ${t('stats_waitingAnswers')}`} value={String(stats.team.questions)} />
            <StatTile label={`⛔ ${t('blocked_short')}`} value={String(stats.team.blocked)} />
          </div>
          {stats.team.contributors.length > 0 && (
            <ChartCard
              title={t('stats_contributors')}
              subtitle={t('stats_contributorsSub')}
              table={{ head: [t('stats_owner'), t('stats_stepsShort')], rows: stats.team.contributors.map((c) => [c.userName, c.steps]) }}
            >
              <HBars rows={stats.team.contributors.map((c) => ({ label: c.userName, value: c.steps }))} ariaLabel={t('stats_contributors')} />
            </ChartCard>
          )}

          <h3 className="stats-h">📺 {t('stats_news')}</h3>
          {watchlists.length === 0 ? (
            <p className="hint">{t('nr_empty')}</p>
          ) : (
            <section className="viz-card">
              <table className="viz-table">
                <thead>
                  <tr>
                    <th>{t('w_name')}</th>
                    <th className="num">{t('res_overall')}</th>
                    <th>{t('nr_trend')}</th>
                    <th className="num">{t('stats_lastRun')}</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlists.map((w) => {
                    const s = summaries.find((x) => x.watchlistId === w.id);
                    return (
                      <tr key={w.id}>
                        <td>
                          <button className="link-btn" onClick={() => openModal({ kind: 'newsroom', watchlistId: w.id })}>{w.name}</button>
                          {w.scope === 'shared' && ' 👥'}
                        </td>
                        <td className="num">{s ? `${signed(s.score)} · ${t(sentimentKey(s.score))}` : '–'}</td>
                        <td>{s && s.trend.length > 1 ? <Sparkline points={s.trend} width={90} height={22} /> : '–'}</td>
                        <td className="num">{s ? shortDate(s.at, lang) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </Window>
  );
}
