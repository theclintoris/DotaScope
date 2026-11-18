import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, ArrowUpRight, Crown, Layers, Swords, TrendingUp, Users } from 'lucide-react'
import type { HeroMetric, ProMatch } from '../types'
import { useMeta } from '../context/MetaContext'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { TTL } from '../lib/api'
import { ATTRIBUTES, POPULATIONS, RANKS, heroImage } from '../lib/constants'
import { sortMetrics, totalGames } from '../lib/meta'
import { classNames, formatCompact, formatDuration, formatNumber, formatPercent, timeAgo } from '../lib/format'
import { ErrorState, HeroPortrait, PageLoader, Sparkline, TrendDelta } from '../components/ui'
import { ProfileStrip } from '../components/ProfilePanels'

const RANKING_OPTIONS = [
  { key: 'metaScore', label: 'Meta score' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'pickRate', label: 'Pick share' },
] as const

function MetaLeader({ metric }: { metric: HeroMetric }) {
  const { hero, winRate, pickRate, picks, metaScore } = metric
  return (
    <Link to={`/heroes/${hero.id}`} className="spotlight-card">
      {hero.img && <img className="spotlight-image" src={heroImage(hero.img)} alt="" />}
      <div className="spotlight-copy">
        <span className="spotlight-label"><Crown size={15} /> Meta leader</span>
        <div>
          <h2>{hero.localized_name}</h2>
          <p className="spotlight-roles">{hero.roles.slice(0, 3).join(' · ')}</p>
        </div>
        <dl className="spotlight-stats">
          <div><dt>Win rate</dt><dd>{formatPercent(winRate)}</dd></div>
          <div><dt>Pick share</dt><dd>{formatPercent(pickRate)}</dd></div>
          <div><dt>Picks</dt><dd>{formatCompact(picks)}</dd></div>
          <div><dt>Meta score</dt><dd>{metaScore}</dd></div>
        </dl>
        <span className="spotlight-link">Hero profile <ArrowUpRight size={15} /></span>
      </div>
    </Link>
  )
}

function HeroRankings({ ranked }: { ranked: HeroMetric[] }) {
  const [sort, setSort] = useState<(typeof RANKING_OPTIONS)[number]['key']>('metaScore')
  // The first meta rank already has its own card.
  const offset = sort === 'metaScore' ? 1 : 0
  const rows = useMemo(
    () => (sort === 'metaScore' ? ranked : sortMetrics(ranked, sort, 'desc')).slice(offset, offset + 5),
    [ranked, sort, offset],
  )

  return (
    <section className="panel" aria-labelledby="hero-rankings">
      <div className="panel-head">
        <h2 id="hero-rankings">Hero rankings</h2>
        <div className="ranking-sort" role="group" aria-label="Rank heroes by">
          {RANKING_OPTIONS.map(({ key, label }) => (
            <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <table className="ranking-table">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Hero</th><th scope="col">Win rate</th><th scope="col">Pick share</th><th scope="col">Score</th></tr>
          </thead>
          <tbody>
            {rows.map((metric, index) => (
              <tr key={metric.hero.id}>
                <td>{offset + index + 1}</td>
                <th scope="row">
                  <Link className="ranking-hero" to={`/heroes/${metric.hero.id}`}>
                    <HeroPortrait hero={metric.hero} size="xs" />
                    {metric.hero.localized_name}
                  </Link>
                </th>
                <td>
                  <span className={metric.winRate >= 0.525 ? 'text-good' : undefined}>{formatPercent(metric.winRate)}</span>
                  {sort === 'winRate' && (
                    <small className="ranking-sample">{formatCompact(metric.picks)} {metric.picks === 1 ? 'pick' : 'picks'}</small>
                  )}
                </td>
                <td>{formatPercent(metric.pickRate)}</td>
                <td><span className="meta-score-pill">{metric.metaScore}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="panel-empty">No additional heroes in this sample.</p>}
      <p className="rankings-note">Meta score combines win rate and pick share.</p>
    </section>
  )
}

export function OverviewPage() {
  useDocumentTitle('DotaScope')
  const meta = useMeta()
  const proMatches = useRemote<ProMatch[]>('/proMatches', TTL.feed)
  const { ranked, trending, attrMix, attrTotal, brackets, bracketMax } = useMemo(() => {
    const sampled = meta.metrics.filter((metric) => metric.picks > 0)
    const ranked = sortMetrics(sampled, 'metaScore', 'desc')
    const trending = sampled
      .filter((metric) => metric.trendDelta != null)
      .sort((a, b) => (b.trendDelta ?? 0) - (a.trendDelta ?? 0))
      .slice(0, 5)
    const attrMix = ATTRIBUTES.map((attribute) => ({
      ...attribute,
      picks: sampled
        .filter((metric) => metric.hero.primary_attr === attribute.value)
        .reduce((sum, metric) => sum + metric.picks, 0),
    }))
    const brackets = RANKS.slice(1).map((rank) => ({
      ...rank,
      picks: meta.heroes.reduce((sum, hero) => {
        const picks = hero[`${rank.value}_pick`]
        return sum + (typeof picks === 'number' ? picks : 0)
      }, 0),
    }))
    return {
      ranked,
      trending,
      attrMix,
      attrTotal: attrMix.reduce((sum, entry) => sum + entry.picks, 0),
      brackets,
      bracketMax: Math.max(1, ...brackets.map(({ picks }) => picks)),
    }
  }, [meta.metrics, meta.heroes])

  const top = ranked[0]
  const populationLabel = POPULATIONS.find(({ value }) => value === meta.population)?.label
  const sampleLabel = meta.population === 'ranked' && meta.bracket > 0
    ? RANKS[meta.bracket]?.label
    : populationLabel

  return (
    <div className="page-stack overview-page">
      <header className="overview-banner">
        <h1>Meta overview</h1>
        <Link className="btn btn-primary" to="/heroes">Explore heroes <ArrowRight size={16} /></Link>
      </header>

      <ProfileStrip />

      {meta.loading && !meta.metrics.length && <PageLoader />}
      {meta.error && !meta.metrics.length && <ErrorState error={meta.error} onRetry={meta.refresh} title="Meta data unavailable" />}

      {top && (
        <>
          <dl className="overview-stats">
            <div>
              <Activity size={19} />
              <dt>Games sampled</dt>
              <dd>{formatCompact(totalGames(meta.metrics))} <small>{sampleLabel}</small></dd>
            </div>
            <div>
              <Users size={19} />
              <dt>Heroes sampled</dt>
              <dd>{formatNumber(ranked.length)}</dd>
            </div>
            <div>
              <Layers size={19} />
              <dt>Latest patch</dt>
              <dd>
                {meta.latestPatch?.name ?? '—'}
                {meta.latestPatch && <small>{new Date(meta.latestPatch.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small>}
              </dd>
            </div>
          </dl>

          <div className="overview-feature-grid">
            <MetaLeader metric={top} />
            <HeroRankings ranked={ranked} />
          </div>
        </>
      )}
      {!top && !meta.loading && !meta.error && <p className="panel panel-empty">No hero picks in this sample.</p>}

      <div className="dashboard-grid overview-feeds">
        {top && (
          <section className="panel">
            <div className="panel-head">
              <h2><TrendingUp size={18} /> Pick trends</h2>
              {trending.length > 0 && <span className="panel-chip">vs. previous day</span>}
            </div>
            <div className="trend-list">
              {trending.map((metric) => (
                <Link key={metric.hero.id} to={`/heroes/${metric.hero.id}`} className="trend-row">
                  <HeroPortrait hero={metric.hero} size="xs" />
                  <span className="trend-name">{metric.hero.localized_name}</span>
                  <Sparkline data={metric.pickTrend} width={82} height={26} />
                  <TrendDelta value={metric.trendDelta} />
                </Link>
              ))}
              {!trending.length && <p className="panel-empty">Daily pick history is available for Turbo and Ranked with All ranks selected.</p>}
            </div>
          </section>
        )}

        <section className="panel pro-feed-panel">
          <div className="panel-head">
            <h2><Swords size={18} /> Latest pro matches</h2>
            <Link className="text-link" to="/pro">Pro scene <ArrowUpRight size={14} /></Link>
          </div>
          <div className="pro-mini-list">
            {(proMatches.data ?? []).slice(0, 5).map((match) => (
              <Link key={match.match_id} to={`/matches/${match.match_id}`} className="pro-mini-row">
                <span className={classNames('pro-mini-team', match.radiant_win && 'is-winner')}>{match.radiant_name ?? 'Radiant'}</span>
                <span className="pro-mini-score">
                  <strong>{match.radiant_score}</strong><span>:</span><strong>{match.dire_score}</strong>
                </span>
                <span className={classNames('pro-mini-team is-dire', !match.radiant_win && 'is-winner')}>{match.dire_name ?? 'Dire'}</span>
                <span className="pro-mini-meta">{formatDuration(match.duration)} · {timeAgo(match.start_time)}</span>
              </Link>
            ))}
            {proMatches.loading && !proMatches.data && (
              <div className="mini-skeletons" role="status" aria-label="Loading pro matches">
                {[0, 1, 2, 3].map((index) => <span className="skeleton" key={index} style={{ height: 30 }} />)}
              </div>
            )}
            {proMatches.error && !proMatches.data && <p className="panel-empty">Pro feed unavailable. {proMatches.error.message}</p>}
            {proMatches.data?.length === 0 && <p className="panel-empty">No recent pro matches.</p>}
          </div>
        </section>
      </div>

      {top && (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-head"><h2>Ranked picks by bracket</h2></div>
            <div className="bracket-bars">
              {brackets.map(({ value, picks, color, label, short }) => (
                <div className="bracket-bar-col" key={value} title={`${label}: ${formatNumber(picks)} picks`}>
                  <span className="bracket-bar-value">{formatCompact(picks)}</span>
                  <span className="bracket-bar" style={{ height: `${picks / bracketMax * 100}%`, background: color }} />
                  <span className="bracket-bar-label" aria-label={label}>{short}</span>
                </div>
              ))}
            </div>
            <p className="panel-footnote">OpenDota publishes brackets from Herald through Divine.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Pick share by attribute</h2></div>
            <div className="distribution-bar" aria-hidden="true">
              {attrMix.map(({ value, picks, color }) => (
                <span key={value} style={{ width: `${picks / Math.max(1, attrTotal) * 100}%`, background: color }} />
              ))}
            </div>
            <div className="attr-legend">
              {attrMix.map(({ value, picks, color, label }) => (
                <div key={value} className="attr-legend-row">
                  <span className="attr-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <strong>{formatPercent(picks / Math.max(1, attrTotal))}</strong>
                  <small>{formatCompact(picks)} picks</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
