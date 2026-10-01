// Newsroom: watchlists that an agent researches on a schedule, with the latest report and a trend.
import { useCallback, useEffect, useState } from 'react';
import { useLang, useStore, useT, type WatchlistInput } from '../store';
import { api } from '../lib/api';
import { onServerEvent } from '../lib/events';
import { toast } from '../lib/toast';
import { DEFAULT_RESEARCH, SOURCES, type ResearchQuery, type SourceGroup, type WatchEvery, type Watchlist, type WatchReport, type WatchSchedule } from '../types';
import { Avatar, ScopeBadge, Window } from './ui';
import { Markdown } from './Markdown';
import { ResearchView, sentimentKey } from './ResearchView';
import { LineChart, Sparkline, shortDate, signed } from './charts';
import { PixelIcon } from './PixelIcon';

type ScopeFilter = 'all' | 'personal' | 'shared';

const weekdayName = (d: number, lang: 'th' | 'en') => new Date(2026, 9, 4 + d).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'long' });

export function useScheduleText() {
  const t = useT();
  const lang = useLang();
  return (s: WatchSchedule) =>
    s.every === 'daily'
      ? t('every_daily', { time: s.time ?? '08:00' })
      : s.every === 'weekly'
        ? t('every_weekly', { day: weekdayName(s.weekday ?? 1, lang), time: s.time ?? '08:00' })
        : t(`every_${s.every}`);
}

const when = (ts: number, lang: 'th' | 'en') =>
  new Date(ts).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ─── Window ──────────────────────────────────────────────────────────────────

export function NewsroomWindow({ z, onClose, watchlistId }: { z: number; onClose: () => void; watchlistId?: string }) {
  const t = useT();
  const lang = useLang();
  const me = useStore((s) => s.user!);
  const watchlists = useStore((s) => s.watchlists);
  const summaries = useStore((s) => s.watchSummaries);
  const agents = useStore((s) => s.agents);
  const teamAgents = useStore((s) => s.teamAgents);
  const openModal = useStore((s) => s.openModal);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [selected, setSelected] = useState<string | undefined>(watchlistId);
  const schedule = useScheduleText();

  const shown = watchlists.filter((w) => scope === 'all' || w.scope === scope);
  const current = watchlists.find((w) => w.id === selected) ?? shown[0];
  const counts = { all: watchlists.length, personal: watchlists.filter((w) => w.scope === 'personal').length, shared: watchlists.filter((w) => w.scope === 'shared').length };

  return (
    <Window z={z} width={1060} title={<><PixelIcon name="tv" /> {t('newsroom')}</>} onClose={onClose} className="newsroom-window" bodyClassName="newsroom">
      <div className="board-toolbar">
        <button className="btn primary" onClick={() => openModal({ kind: 'watchEdit' })}>＋ {t('nr_new')}</button>
        <span className="seg" role="tablist">
          {(['all', 'personal', 'shared'] as ScopeFilter[]).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} className={`btn sm ${scope === s ? 'on' : ''}`} onClick={() => setScope(s)}>
              {s === 'all' ? t('filterAllTasks') : s === 'personal' ? `🔒 ${t('scope_personal')}` : `👥 ${t('scope_shared')}`} ({counts[s]})
            </button>
          ))}
        </span>
        <span className="hint" style={{ marginLeft: 'auto' }}>{t('nr_hint')}</span>
      </div>

      {!watchlists.length ? (
        <div className="nr-empty">
          <p>📺 {t('nr_empty')}</p>
          <button className="btn primary" onClick={() => openModal({ kind: 'watchEdit' })}>＋ {t('nr_new')}</button>
        </div>
      ) : (
        <div className="nr-layout">
          <ul className="nr-list" role="listbox" aria-label={t('newsroom')}>
            {shown.map((w) => {
              const sum = summaries.find((s) => s.watchlistId === w.id);
              const agent = agents.find((a) => a.id === w.agentId) ?? teamAgents.find((a) => a.id === w.agentId);
              return (
                <li key={w.id}>
                  <button className={`nr-item ${current?.id === w.id ? 'on' : ''}`} role="option" aria-selected={current?.id === w.id} onClick={() => setSelected(w.id)}>
                    <div className="row" style={{ gap: 6 }}>
                      {agent && <Avatar look={agent.look} size={24} />}
                      <strong className="nr-name">{w.name}</strong>
                      {w.runTaskId && <span className="chip run-chip">⚙</span>}
                    </div>
                    <div className="hint">
                      {w.scope === 'shared' && '👥 '}
                      {w.ownerId !== me.id && `${w.ownerName} · `}
                      {schedule(w.schedule)}
                    </div>
                    {sum ? (
                      <div className="nr-sum">
                        <span>
                          <strong>{signed(sum.score)}</strong> {t(sentimentKey(sum.score))}
                        </span>
                        <Sparkline points={sum.trend} width={80} height={20} />
                      </div>
                    ) : (
                      <div className="hint">{t('nr_noReportsShort')}</div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {current && <WatchDetail key={current.id} w={current} mine={current.ownerId === me.id} isAdmin={me.role === 'Admin'} lang={lang} />}
        </div>
      )}
    </Window>
  );
}

function WatchDetail({ w, mine, isAdmin, lang }: { w: Watchlist; mine: boolean; isAdmin: boolean; lang: 'th' | 'en' }) {
  const t = useT();
  const openModal = useStore((s) => s.openModal);
  const runWatchlist = useStore((s) => s.runWatchlist);
  const deleteWatchlist = useStore((s) => s.deleteWatchlist);
  const agents = useStore((s) => s.agents);
  const teamAgents = useStore((s) => s.teamAgents);
  const runTask = useStore((s) => s.tasks.find((x) => x.id === w.runTaskId));
  const schedule = useScheduleText();
  const [history, setHistory] = useState<{ id: string; at: number; score: number; label: string; simulated: number; agentName: string }[] | null>(null);
  const [reportId, setReportId] = useState<string>();
  const [report, setReport] = useState<WatchReport | null>(null);
  const [busy, setBusy] = useState(false);
  const agent = agents.find((a) => a.id === w.agentId) ?? teamAgents.find((a) => a.id === w.agentId);

  const loadHistory = useCallback(async (selectNewest: boolean) => {
    try {
      const list = await api<NonNullable<typeof history>>(`/watchlists/${w.id}/reports`, { quiet: true });
      setHistory(list);
      if (selectNewest || !reportId) setReportId(list[0]?.id);
    } catch {
      setHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.id]);

  useEffect(() => {
    void loadHistory(true);
    return onServerEvent('watch-report', (d) => {
      if ((d as { watchlistId: string }).watchlistId === w.id) void loadHistory(true);
    });
  }, [w.id, loadHistory]);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      return;
    }
    let live = true;
    api<WatchReport>(`/reports/${reportId}`, { quiet: true }).then(
      (r) => live && setReport(r),
      () => live && setReport(null),
    );
    return () => {
      live = false;
    };
  }, [reportId]);

  const run = async () => {
    setBusy(true);
    try {
      await runWatchlist(w.id);
      toast.success(t('nr_started', { agent: agent?.name ?? '?' }));
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };

  const trend = (history ?? []).slice().reverse().map((h) => ({ t: h.at, v: h.score }));

  return (
    <div className="nr-detail">
      <div className="nr-detail-head">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{w.name}</h3>
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            <ScopeBadge scope={w.scope} />
            <span className="chip">🔎 {w.research.query}</span>
            {w.research.symbols.map((s) => <span key={s} className="chip">📈 {s}</span>)}
            {w.research.coins.map((c) => <span key={c} className="chip">🪙 {c}</span>)}
            <span className="chip">🗓 {schedule(w.schedule)}</span>
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            {agent ? `${t('w_agent')}: ${agent.name}` : `⚠ ${t('nr_noAgent')}`}
            {w.lastRunAt && ` · ${t('nr_last', { when: when(w.lastRunAt, lang) })}`}
            {w.nextRunAt && ` · ${t('nr_next', { when: when(w.nextRunAt, lang) })}`}
          </div>
        </div>
        <div className="row" style={{ gap: 6, alignSelf: 'flex-start' }}>
          {mine && (
            <button className="btn primary" disabled={busy || !!w.runTaskId || !agent} onClick={() => void run()}>▶ {t('nr_runNow')}</button>
          )}
          {mine && <button className="btn" onClick={() => openModal({ kind: 'watchEdit', watchlistId: w.id })}>✏️ {t('edit')}</button>}
          {(mine || isAdmin) && (
            <button
              className="btn danger"
              aria-label={t('delete')}
              onClick={() =>
                openModal({ kind: 'confirm', danger: true, message: t('nr_deleteConfirm', { name: w.name }), onYes: () => void deleteWatchlist(w.id).catch(() => {}) })
              }
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {w.runTaskId && (
        <div className="nr-running">
          ⚙ {t('nr_running', { agent: agent?.name ?? '?' })}
          {runTask && <span className="hint"> · {Math.floor(runTask.stageProgress)}%</span>}
          {runTask?.blocked && <span className="chip" style={{ background: '#fbe3df' }}>⛔ {t('blocked_short')}</span>}
          {runTask && <button className="btn sm" onClick={() => openModal({ kind: 'task', taskId: runTask.id })}>{t('nr_openTask')}</button>}
        </div>
      )}

      {history && history.length === 0 && !w.runTaskId && <p className="hint">{t('nr_noReports')}</p>}

      {trend.length > 1 && (
        <section className="viz-card">
          <header className="viz-head">
            <div>
              <h4>{t('nr_trend')}</h4>
              <div className="viz-sub">{t('nr_trendHint')}</div>
            </div>
          </header>
          <LineChart points={trend} domain={[-1, 1]} baseline={0} format={(v) => signed(v)} dateLabel={(ts) => shortDate(ts, lang)} ariaLabel={t('nr_trend')} height={120} />
        </section>
      )}

      {history && history.length > 0 && (
        <div className="row" style={{ gap: 6, margin: '8px 0 0' }}>
          <label className="hint" htmlFor="nr-report">{t('nr_history')}</label>
          <select id="nr-report" className="select" style={{ width: 'auto' }} value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {when(h.at, lang)} · {signed(h.score)} · {h.agentName}
                {h.simulated ? ` · ${t('nr_simulated')}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {report && (
        <>
          <div className="hint" style={{ marginTop: 6 }}>
            {t('nr_by', { agent: report.agentName, model: report.modelName })}
            {report.simulated ? ` · ${t('nr_simulated')}` : ` · ⚡ ${t('realTag')}`}
          </div>
          <ResearchView result={report.research} />
          <details className="nr-full">
            <summary>📄 {t('nr_fullReport')}</summary>
            <div className="stage-out">
              <Markdown text={report.text} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export function WatchlistEditor({ z, onClose, watchlistId }: { z: number; onClose: () => void; watchlistId?: string }) {
  const t = useT();
  const lang = useLang();
  const existing = useStore((s) => s.watchlists.find((w) => w.id === watchlistId));
  const agents = useStore((s) => s.agents);
  const saveWatchlist = useStore((s) => s.saveWatchlist);
  const defaultAgent = agents.find((a) => a.role === 'analyst') ?? agents.find((a) => a.role === 'researcher') ?? agents[0];
  const [name, setName] = useState(existing?.name ?? '');
  const [scope, setScope] = useState(existing?.scope ?? 'personal');
  const [agentId, setAgentId] = useState(existing?.agentId || defaultAgent?.id || '');
  const [research, setResearch] = useState<ResearchQuery>(existing?.research ?? DEFAULT_RESEARCH);
  const [schedule, setSchedule] = useState<WatchSchedule>(existing?.schedule ?? { every: 'daily', time: '08:00' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!research.query.trim() && !name.trim()) {
      toast.error(t('nr_needTopic'));
      return;
    }
    setBusy(true);
    try {
      const input: WatchlistInput = { name: name.trim(), scope, agentId, research: { ...research, query: research.query.trim() || name.trim() }, schedule };
      await saveWatchlist(watchlistId, input);
      onClose();
    } catch {
      /* shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      z={z}
      width={640}
      title={<><PixelIcon name="tv" /> {existing ? existing.name : t('nr_new')}</>}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy || !agentId} onClick={() => void save()}>💾 {t('save')}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="w-name">{t('w_name')}</label>
        <input id="w-name" className="input" value={name} maxLength={80} placeholder={t('w_namePh')} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <span className="field-label">{t('scope')}</span>
        <span className="seg">
          {(['personal', 'shared'] as const).map((s) => (
            <button key={s} className={`btn sm ${scope === s ? 'on' : ''}`} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {s === 'personal' ? `🔒 ${t('scope_personal')}` : `👥 ${t('scope_shared')}`}
            </button>
          ))}
        </span>
        <div className="hint">{scope === 'personal' ? t('w_scopePersonal') : t('w_scopeShared')}</div>
      </div>
      <div className="field">
        <label htmlFor="w-agent">{t('w_agent')}</label>
        <select id="w-agent" className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {t(`role_${a.role}`)}
            </option>
          ))}
        </select>
        <div className="hint">{t('w_agentHint')}</div>
      </div>

      <ResearchFields value={research} onChange={setResearch} />

      <div className="field">
        <span className="field-label">{t('w_every')}</span>
        <div className="row" style={{ gap: 6 }}>
          <select className="select" style={{ width: 'auto' }} value={schedule.every} onChange={(e) => setSchedule({ ...schedule, every: e.target.value as WatchEvery })} aria-label={t('w_every')}>
            {(['manual', '6h', 'daily', 'weekly'] as WatchEvery[]).map((k) => (
              <option key={k} value={k}>{t(`every_opt_${k}`)}</option>
            ))}
          </select>
          {schedule.every === 'weekly' && (
            <select className="select" style={{ width: 'auto' }} value={schedule.weekday ?? 1} onChange={(e) => setSchedule({ ...schedule, weekday: Number(e.target.value) })} aria-label={t('w_weekday')}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>{weekdayName(d, lang)}</option>
              ))}
            </select>
          )}
          {(schedule.every === 'daily' || schedule.every === 'weekly') && (
            <input type="time" className="input" style={{ width: 'auto' }} value={schedule.time ?? '08:00'} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} aria-label={t('w_time')} />
          )}
        </div>
        <div className="hint">{t('w_scheduleHint')}</div>
      </div>
    </Window>
  );
}

// ─── Research query fields (also used by the task editor) ────────────────────

const splitList = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

export function ResearchFields({ value, onChange }: { value: ResearchQuery; onChange: (q: ResearchQuery) => void }) {
  const t = useT();
  const lang = useLang();
  const keys = useStore((s) => s.keys);
  const [symbols, setSymbols] = useState(value.symbols.join(', '));
  const [coins, setCoins] = useState(value.coins.join(', '));
  const hasKey = (k?: string) => !k || keys.some((x) => x.provider === k && x.configured);
  const toggleSource = (id: ResearchQuery['sources'][number]) =>
    onChange({ ...value, sources: value.sources.includes(id) ? value.sources.filter((s) => s !== id) : [...value.sources, id] });
  const toggleLang = (l: 'en' | 'th') => {
    const langs = value.langs.includes(l) ? value.langs.filter((x) => x !== l) : [...value.langs, l];
    if (langs.length) onChange({ ...value, langs });
  };

  return (
    <div className="research-fields">
      <div className="field">
        <label htmlFor="rq-query">{t('rq_query')}</label>
        <input id="rq-query" className="input" value={value.query} maxLength={200} placeholder={t('rq_queryPh')} onChange={(e) => onChange({ ...value, query: e.target.value })} />
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="rq-sym">{t('rq_symbols')}</label>
          <input id="rq-sym" className="input" value={symbols} placeholder="AAPL, NVDA" onChange={(e) => setSymbols(e.target.value)} onBlur={() => onChange({ ...value, symbols: splitList(symbols).map((s) => s.toUpperCase()).slice(0, 5) })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="rq-coins">{t('rq_coins')}</label>
          <input id="rq-coins" className="input" value={coins} placeholder="bitcoin, ETH" onChange={(e) => setCoins(e.target.value)} onBlur={() => onChange({ ...value, coins: splitList(coins).map((s) => s.toLowerCase()).slice(0, 5) })} />
        </div>
        <div className="field">
          <label htmlFor="rq-days">{t('rq_days')}</label>
          <select id="rq-days" className="select" style={{ width: 'auto' }} value={value.days} onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}>
            {[1, 3, 7, 14, 30].map((n) => (
              <option key={n} value={n}>{t('rq_daysN', { n })}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="field-label">{t('rq_langs')}</span>
        <span className="seg">
          {(['th', 'en'] as const).map((l) => (
            <button key={l} className={`btn sm ${value.langs.includes(l) ? 'on' : ''}`} aria-pressed={value.langs.includes(l)} onClick={() => toggleLang(l)}>
              {l === 'th' ? 'ไทย' : 'English'}
            </button>
          ))}
        </span>
      </div>
      <div className="field">
        <span className="field-label">{t('rq_sources')}</span>
        {(['news', 'social', 'market'] as SourceGroup[]).map((g) => (
          <div key={g} className="src-group">
            <span className="hint src-group-name">{t(`group_${g}`)}</span>
            {SOURCES.filter((s) => s.group === g).map((s) => {
              const on = value.sources.includes(s.id);
              const missingKey = s.key && s.key !== 'coingecko' && !hasKey(s.key);
              const idle = (s.needs === 'symbols' && !value.symbols.length) || (s.needs === 'coins' && !value.coins.length);
              return (
                <button
                  key={s.id}
                  className={`btn sm src-btn ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  title={s.note?.[lang] ?? ''}
                  onClick={() => toggleSource(s.id)}
                >
                  {on ? '☑' : '☐'} {s.name}
                  {on && missingKey && <span className="src-warn"> · 🔑 {t('rq_needsKey')}</span>}
                  {on && !missingKey && idle && <span className="src-warn"> · {t(s.needs === 'symbols' ? 'rq_needsSymbols' : 'rq_needsCoins')}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="hint">{t('rq_sourcesHint')}</div>
      </div>
    </div>
  );
}
