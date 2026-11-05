import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Crown,
  Database,
  Flame,
  Gauge,
  RefreshCw,
  Shield,
  Swords,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react'
import type { ProMatch } from '../types'
import { useMeta } from '../context/MetaContext'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { TTL } from '../lib/api'
import { ATTRIBUTES, POPULATIONS, RANKS, heroImage } from '../lib/constants'
import {
  averageWinRate,
  totalGames,
} from '../lib/meta'
import {
  classNames,
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  timeAgo,
} from '../lib/format'
import {
  ErrorState,
  HeroPortrait,
  KpiCard,
  PageHeader,
  PageLoader,
  ProgressBar,
  Sparkline,
  TrendDelta,
  WinRate,
} from '../components/ui'
import { ProfileStrip } from '../components/ProfilePanels'

const ATTR_COLORS: Record<string, string> = {
  str: 'var(--attr-str)',
  agi: 'var(--attr-agi)',
  int: 'var(--attr-int)',
  all: 'var(--attr-all)',
}

export function OverviewPage() {
  useDocumentTitle('DotaScope')
  const meta = useMeta()
  const proMatches = useRemote<ProMatch[]>('/proMatches', TTL.feed)

  const derived = useMemo(() => {
    const metrics = meta.metrics
    const ranked = [...metrics].sort((a, b) => b.metaScore - a.metaScore)
    const top = ranked[0]
    const mostPicked = [...metrics].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5)
    const highestWin = [...metrics]
      .filter((metric) => metric.picks > 0)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 6)
    const trending = [...metrics]
      .filter((metric) => metric.pickTrend.length > 1)
      .sort((a, b) => (b.trendDelta ?? -99) - (a.trendDelta ?? -99))
      .slice(0, 5)
    const topFive = ranked.filter((metric) => metric.picks > 0).slice(0, 5)
    const totalProPicks = metrics.reduce((sum, metric) => sum + metric.proPicks, 0)
    const attrMix = ATTRIBUTES.map((attribute) => {
      const picks = metrics
        .filter((metric) => metric.hero.primary_attr === attribute.value)
        .reduce((sum, metric) => sum + metric.picks, 0)
      return { ...attribute, picks }
    })
    const attrTotal = attrMix.reduce((sum, entry) => sum + entry.picks, 0) || 1
    const bracketTotals = Array.from({ length: 7 }, (_, index) => {
      const field = `${index + 1}_pick`
      const picks = meta.heroes.reduce((sum, hero) => {
        const value = hero[field]
        return sum + (typeof value === 'number' ? value : 0)
      }, 0)
      return { bracket: index + 1, ...RANKS[index + 1], picks }
    })
    const bracketMax = Math.max(...bracketTotals.map((entry) => entry.picks), 1)
    return {
      top,
      topFive,
      mostPicked,
      highestWin,
      trending,
      totalProPicks,
      attrMix,
      attrTotal,
      bracketTotals,
      bracketMax,
    }
  }, [meta.metrics, meta.heroes])

  if (meta.loading && !meta.heroes.length) return <PageLoader />
  if (meta.error && !meta.heroes.length) return <ErrorState error={meta.error} onRetry={meta.refresh} />

  const { top } = derived
  const populationLabel =
    POPULATIONS.find((entry) => entry.value === meta.population)?.label ?? 'Ranked pubs'

  return (
    <div className="page-stack overview-page">
      <PageHeader
        eyebrow={
          <>
            <span className="live-dot" /> Live meta snapshot
          </>
        }
        title={
          <>
            The meta, <em>in focus.</em>
          </>
        }
        description="Every hero, bracket, and pro draft — translated into one clear picture of the game. Powered by OpenDota's public dataset."
        actions={
          <>
            <Link className="btn btn-ghost" to="/data-lab">
              <Database size={15} /> Query the data
            </Link>
            <Link className="btn btn-primary" to="/heroes">
              Explore heroes <ArrowUpRight size={15} />
            </Link>
          </>
        }
      />

      <ProfileStrip />

      <div className="kpi-grid">
        <KpiCard
          label="Games sampled"
          value={formatCompact(totalGames(meta.metrics))}
          icon={<Gauge size={17} />}
          foot={<span>{populationLabel} · current lens</span>}
          tone="accent"
        />
        <KpiCard
          label="Meta leader"
          value={top?.hero.localized_name ?? '—'}
          icon={<Crown size={17} />}
          foot={
            top ? (
              <span>
                Score <strong>{top.metaScore}</strong> · {formatPercent(top.winRate)} WR
              </span>
            ) : (
              <span>Awaiting sample</span>
            )
          }
        />
        <KpiCard
          label="Highest win rate"
          value={derived.highestWin[0] ? formatPercent(derived.highestWin[0].winRate) : '—'}
          icon={<Trophy size={17} />}
          foot={
            derived.highestWin[0] ? (
              <span>
                {derived.highestWin[0].hero.localized_name} · {formatCompact(derived.highestWin[0].picks)}{' '}
                picks
              </span>
            ) : null
          }
          tone="good"
        />
        <KpiCard
          label="Latest patch"
          value={meta.latestPatch?.name ?? '—'}
          icon={<Shield size={17} />}
          foot={
            <span>
              {meta.latestPatch
                ? new Date(meta.latestPatch.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Patch feed unavailable'}
            </span>
          }
        />
      </div>

      <div className="overview-feature-grid">
        {top && (
          <Link to={`/heroes/${top.hero.id}`} className="spotlight-card">
            <div className="spotlight-image">
              <img src={heroImage(top.hero.img)} alt={top.hero.localized_name} />
              <span className="spotlight-vignette" />
            </div>
            <div className="spotlight-copy">
              <div className="spotlight-topline">
                <span className="badge badge-accent">
                  <Flame size={12} /> #1 meta score
                </span>
                <span className="spotlight-lens">{populationLabel}</span>
              </div>
              <div className="spotlight-title">
                <h2>{top.hero.localized_name}</h2>
                <span className="score-ring" style={{ '--score': `${top.metaScore * 3.6}deg` } as CSSProperties}>
                  <strong>{top.metaScore}</strong>
                  <small>META</small>
                </span>
              </div>
              <p className="spotlight-roles">{top.hero.roles.join(' · ')}</p>
              <div className="spotlight-stats">
                <div>
                  <strong>{formatPercent(top.winRate)}</strong>
                  <span>Win rate</span>
                </div>
                <div>
                  <strong>{formatPercent(top.pickRate)}</strong>
                  <span>Pick share</span>
                </div>
                <div>
                  <strong>{formatCompact(top.picks)}</strong>
                  <span>Games</span>
                </div>
                <div>
                  <strong>{formatNumber(top.proPicks)}</strong>
                  <span>Pro picks</span>
                </div>
              </div>
              <span className="spotlight-link">
                Open hero dossier <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        )}

        <div className="pulse-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Meta pulse</span>
              <h3>Top of the food chain</h3>
            </div>
            <Link className="text-link" to="/heroes">
              Full index <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="pulse-list">
            {derived.topFive.map((metric, index) => (
              <Link
                key={metric.hero.id}
                to={`/heroes/${metric.hero.id}`}
                className="pulse-row"
              >
                <span className="pulse-rank">{String(index + 1).padStart(2, '0')}</span>
                <HeroPortrait hero={metric.hero} size="sm" />
                <span className="pulse-name">
                  <strong>{metric.hero.localized_name}</strong>
                  <small>{metric.hero.roles[0]}</small>
                </span>
                <span className="pulse-metrics">
                  <strong>{formatPercent(metric.winRate)}</strong>
                  <small>WR</small>
                </span>
                <span className="pulse-metrics">
                  <strong>{formatPercent(metric.pickRate)}</strong>
                  <small>PICK</small>
                </span>
                <span className="meta-score-pill">{metric.metaScore}</span>
              </Link>
            ))}
          </div>
          <div className="panel-note">
            <TrendingUp size={13} /> Scores blend win rate and pick share against the current sample.
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Pick pressure</span>
              <h3>Most contested heroes</h3>
            </div>
            <Swords size={17} className="panel-head-icon" />
          </div>
          <div className="contested-list">
            {derived.mostPicked.map((metric) => (
              <Link key={metric.hero.id} to={`/heroes/${metric.hero.id}`} className="contested-row">
                <HeroPortrait hero={metric.hero} size="xs" />
                <span className="contested-name">{metric.hero.localized_name}</span>
                <span className="contested-bar">
                  <ProgressBar
                    value={metric.pickRate / Math.max(derived.mostPicked[0]?.pickRate ?? 1, 0.0001)}
                    tone="accent"
                    height={4}
                  />
                </span>
                <span className="contested-rate">{formatPercent(metric.pickRate)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Daily shift</span>
              <h3>Trending picks</h3>
            </div>
            <span className="panel-chip">Δ vs prior day</span>
          </div>
          <div className="trend-list">
            {derived.trending.map((metric) => (
              <Link key={metric.hero.id} to={`/heroes/${metric.hero.id}`} className="trend-row">
                <HeroPortrait hero={metric.hero} size="xs" />
                <span className="trend-name">{metric.hero.localized_name}</span>
                <Sparkline data={metric.pickTrend} width={82} height={26} />
                <TrendDelta value={metric.trendDelta} />
              </Link>
            ))}
            {!derived.trending.length && (
              <p className="panel-empty">
                Trend history is only published for ranked and Turbo samples. Switch the meta lens to see
                movement.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-3">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Sample anatomy</span>
              <h3>Ranked by bracket</h3>
            </div>
            <Users size={17} className="panel-head-icon" />
          </div>
          <div className="bracket-bars">
            {derived.bracketTotals.map((entry) => (
              <div className="bracket-bar-col" key={entry.bracket}>
                <span className="bracket-bar-value">{formatCompact(entry.picks)}</span>
                <span
                  className="bracket-bar"
                  style={{
                    height: `${Math.max(5, (entry.picks / derived.bracketMax) * 100)}%`,
                    background: entry.color,
                  }}
                  title={`${entry.label}: ${formatNumber(entry.picks)} picks`}
                />
                <span className="bracket-bar-label">{entry.short}</span>
              </div>
            ))}
          </div>
          <p className="panel-footnote">
            Raw ranked pick volume per rank bracket. OpenDota publishes no Immortal bracket sample.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Composition</span>
              <h3>Attribute balance</h3>
            </div>
            <Braces size={17} className="panel-head-icon" />
          </div>
          <div className="distribution-bar">
            {derived.attrMix.map((entry) => (
              <span
                key={entry.value}
                style={{
                  width: `${(entry.picks / derived.attrTotal) * 100}%`,
                  background: ATTR_COLORS[entry.value],
                }}
                title={`${entry.label}: ${formatCompact(entry.picks)} picks`}
              />
            ))}
          </div>
          <div className="attr-legend">
            {derived.attrMix.map((entry) => (
              <div key={entry.value} className="attr-legend-row">
                <span className="attr-dot" style={{ background: ATTR_COLORS[entry.value] }} />
                <span>{entry.label}</span>
                <strong>{formatPercent(entry.picks / derived.attrTotal)}</strong>
                <small>{formatCompact(entry.picks)} picks</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel pro-feed-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">The circuit</span>
              <h3>Latest pro matches</h3>
            </div>
            <Link className="text-link" to="/pro">
              Pro scene <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="pro-mini-list">
            {(proMatches.data ?? []).slice(0, 5).map((match) => {
              const radiantWon = match.radiant_win
              return (
                <Link key={match.match_id} to={`/matches/${match.match_id}`} className="pro-mini-row">
                  <span className={classNames('pro-mini-team', radiantWon && 'is-winner')}>
                    {match.radiant_name ?? 'Radiant'}
                  </span>
                  <span className="pro-mini-score">
                    <strong>{match.radiant_score}</strong>
                    <span>:</span>
                    <strong>{match.dire_score}</strong>
                  </span>
                  <span className={classNames('pro-mini-team is-dire', !radiantWon && 'is-winner')}>
                    {match.dire_name ?? 'Dire'}
                  </span>
                  <span className="pro-mini-meta">
                    {formatDuration(match.duration)} · {timeAgo(match.start_time)}
                  </span>
                </Link>
              )
            })}
            {proMatches.loading && !proMatches.data && (
              <div className="mini-skeletons">
                {[0, 1, 2, 3].map((index) => (
                  <span className="skeleton" key={index} style={{ height: 30 }} />
                ))}
              </div>
            )}
            {proMatches.error && !proMatches.data && (
              <p className="panel-empty">Pro feed unavailable. {proMatches.error.message}</p>
            )}
          </div>
        </section>
      </div>

      <section className="panel wide-table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Outliers</span>
            <h3>Highest win rates</h3>
          </div>
          <span className="panel-chip">Current lens · sample dependent</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th>Hero</th>
                <th>Win rate</th>
                <th>Pick share</th>
                <th className="num">Picks</th>
                <th className="num">Pro picks</th>
                <th>Daily</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {derived.highestWin.map((metric, index) => (
                <tr key={metric.hero.id}>
                  <td className="col-rank">{String(index + 1).padStart(2, '0')}</td>
                  <td>
                    <Link className="hero-cell" to={`/heroes/${metric.hero.id}`}>
                      <HeroPortrait hero={metric.hero} size="xs" />
                      <span>
                        <strong>{metric.hero.localized_name}</strong>
                        <small>{metric.hero.roles.slice(0, 2).join(' · ')}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <WinRate value={metric.winRate} />
                  </td>
                  <td>{formatPercent(metric.pickRate)}</td>
                  <td className="num mono">{formatCompact(metric.picks)}</td>
                  <td className="num mono">{formatNumber(metric.proPicks)}</td>
                  <td>
                    <TrendDelta value={metric.trendDelta} />
                  </td>
                  <td className="col-action">
                    <Link className="row-arrow" to={`/heroes/${metric.hero.id}`} aria-label="Open hero">
                      <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="overview-footer-grid">
        <section className="meta-note-card">
          <div className="meta-note-icon">
            <Database size={18} />
          </div>
          <div>
            <span className="eyebrow">Open by design</span>
            <h3>Ask the dataset your own questions</h3>
            <p>
              The Data Lab exposes OpenDota's read-only SQL explorer. Query heroes, matches, picks, teams,
              and parsed player records with the same data that powers this page.
            </p>
            <Link className="text-link" to="/data-lab">
              Open SQL data lab <ArrowUpRight size={13} />
            </Link>
          </div>
        </section>
        <section className="meta-note-card meta-note-compact">
          <div className="meta-note-icon">
            <RefreshCw size={18} className={meta.loading ? 'spin' : undefined} />
          </div>
          <div>
            <span className="eyebrow">Sample health</span>
            <h3>{formatPercent(averageWinRate(meta.metrics))} average win rate</h3>
            <p>
              {lastUpdatedLabel(meta.lastUpdated)} · {meta.metrics.length} heroes ·{' '}
              {formatCompact(derived.totalProPicks)} pro picks across the sample.
            </p>
            <button type="button" className="text-link as-button" onClick={meta.refresh}>
              Refresh snapshot <RefreshCw size={12} />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function lastUpdatedLabel(timestamp: number | null): string {
  return timestamp ? `Synced ${timeAgo(timestamp / 1000)}` : 'Waiting for first sync'
}
