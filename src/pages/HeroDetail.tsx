import { useMemo, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Braces,
  ChartNoAxesCombined,
  Check,
  Crown,
  Database,
  Eye,
  Gauge,
  Shield,
  Swords,
  Target,
  Trophy,
  Zap,
} from 'lucide-react'
import type {
  HeroDuration,
  HeroMatchup,
  HeroStat,
  ItemConstants,
  ItemPopularity,
} from '../types'
import { useMeta } from '../context/MetaContext'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { TTL } from '../lib/api'
import {
  RANKS,
  attributeInfo,
  heroImage,
  itemImage,
  rankMedal,
} from '../lib/constants'
import {
  bracketSnapshot,
  metricForHero,
} from '../lib/meta'
import {
  classNames,
  formatCompact,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  HeroPortrait,
  PageLoader,
  SectionHeading,
  TrendDelta,
} from '../components/ui'

type StageKey = keyof ItemPopularity

const ITEM_STAGES: { key: StageKey; label: string; note: string }[] = [
  { key: 'start_game_items', label: 'Starting build', note: '0–10 min' },
  { key: 'early_game_items', label: 'Early game', note: '10–25 min' },
  { key: 'mid_game_items', label: 'Mid game', note: '25–40 min' },
  { key: 'late_game_items', label: 'Late game', note: '40+ min' },
]

function matchupWinRate(matchup: HeroMatchup): number {
  return matchup.games_played ? matchup.wins / matchup.games_played : 0
}

export function HeroDetailPage() {
  const { heroId } = useParams()
  const meta = useMeta()
  const hero = meta.heroes.find((entry) => String(entry.id) === heroId)
  const metric = hero ? metricForHero(meta.metrics, hero.id) : undefined
  const matchups = useRemote<HeroMatchup[]>(heroId ? `/heroes/${heroId}/matchups` : null, TTL.detail)
  const durations = useRemote<HeroDuration[]>(heroId ? `/heroes/${heroId}/durations` : null, TTL.detail)
  const popularity = useRemote<ItemPopularity>(heroId ? `/heroes/${heroId}/itemPopularity` : null, TTL.detail)
  const items = useRemote<ItemConstants>('/constants/items', TTL.constants)
  useDocumentTitle(hero?.localized_name ?? 'Hero detail')

  const matchupGroups = useMemo(() => {
    if (!matchups.data?.length) return { good: [], bad: [], threshold: 20 }
    const byId = new Map(meta.heroes.map((entry) => [entry.id, entry]))
    const enriched = matchups.data
      .map((matchup) => ({
        ...matchup,
        opponent: byId.get(matchup.hero_id),
        winRate: matchupWinRate(matchup),
      }))
      .filter(
        (matchup): matchup is HeroMatchup & { opponent: HeroStat; winRate: number } =>
          Boolean(matchup.opponent) && matchup.hero_id !== hero?.id,
      )
    const threshold = 20
    const eligible = enriched.filter((matchup) => matchup.games_played >= threshold)
    const pool = eligible.length >= 10 ? eligible : enriched
    return {
      good: [...pool].sort((a, b) => b.winRate - a.winRate).slice(0, 5),
      bad: [...pool].sort((a, b) => a.winRate - b.winRate).slice(0, 5),
      threshold,
    }
  }, [matchups.data, meta.heroes, hero?.id])

  if (meta.loading && !meta.heroes.length) return <PageLoader label="Loading hero dossier…" />

  if (!hero) {
    return (
      <EmptyState
        title="Hero not found"
        icon={<Swords size={22} />}
        action={
          <Link to="/heroes" className="btn btn-ghost btn-sm">
            <ArrowLeft size={14} /> Back to hero index
          </Link>
        }
      >
        That hero ID is not part of the current OpenDota roster. It may have been renamed or removed.
      </EmptyState>
    )
  }

  const attr = attributeInfo(hero.primary_attr)
  const picks = metric?.picks ?? 0
  const winRate = picks ? (metric?.wins ?? 0) / picks : null
  const proWinRate = hero.pro_pick ? hero.pro_win / hero.pro_pick : null
  const snapshot = bracketSnapshot(hero)
  const bracketMax = Math.max(...snapshot.map((entry) => entry.picks), 1)
  const trend = metric?.pickTrend ?? []
  const trendMax = Math.max(...trend, 1)
  const itemStages = ITEM_STAGES.map((stage) => {
    const counts = popularity.data?.[stage.key] ?? {}
    const top = Object.entries(counts)
      .map(([id, count]) => ({ id, count, item: items.data?.[id] }))
      .filter((entry) => entry.item)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    const max = Math.max(...top.map((entry) => entry.count), 1)
    return { ...stage, top, max }
  })

  return (
    <div className="page-stack hero-detail-page">
      <Link to="/heroes" className="back-link">
        <ArrowLeft size={14} /> Hero index
      </Link>

      <section className="hero-banner">
          <div className="hero-banner-image" style={{ '--hero-attr': attr.color } as CSSProperties}>
          <img src={heroImage(hero.img)} alt={hero.localized_name} />
          <span className="hero-banner-fade" />
        </div>
        <div className="hero-banner-content">
          <div className="hero-banner-topline">
            <span className="eyebrow" style={{ color: attr.color }}>
              <span className="attr-dot" style={{ background: attr.color }} /> {attr.label} hero
            </span>
            <span className="badge">{hero.attack_type}</span>
            {hero.cm_enabled && (
              <span className="badge badge-muted">
                <Check size={11} /> CM eligible
              </span>
            )}
          </div>
          <h1>{hero.localized_name}</h1>
          <p className="hero-banner-roles">{hero.roles.join(' · ')}</p>
          <div className="hero-banner-meta">
            <span>
              <Crown size={13} /> Meta score <strong>{metric?.metaScore ?? '—'}</strong>
            </span>
            <span>
              <Gauge size={13} /> {formatPercent(metric?.pickRate ?? 0)} pick share
            </span>
            <span>
              <Database size={13} /> {formatCompact(picks)} sampled games
            </span>
          </div>
          <div className="hero-banner-actions">
            <a
              className="btn btn-primary"
              href={`https://www.opendota.com/heroes/${hero.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on OpenDota <ArrowUpRight size={14} />
            </a>
            <Link className="btn btn-ghost" to="/data-lab">
              <Braces size={14} /> Query this hero
            </Link>
          </div>
        </div>
        <div className="hero-banner-score">
          <span className="score-ring score-ring-lg" style={{ '--score': `${(metric?.metaScore ?? 0) * 3.6}deg` } as CSSProperties}>
            <strong>{metric?.metaScore ?? '—'}</strong>
            <small>META</small>
          </span>
        </div>
      </section>

      <div className="kpi-grid hero-kpis">
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Win rate</span>
            <Trophy size={16} className="kpi-icon" />
          </div>
          <div className={classNames('kpi-value', winRate != null && winRate >= 0.5 ? 'text-good' : 'text-bad')}>
            {winRate != null ? formatPercent(winRate) : '—'}
          </div>
          <div className="kpi-foot">
            <span>{formatCompact(picks)} picks in {meta.population}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Pick share</span>
            <Target size={16} className="kpi-icon" />
          </div>
          <div className="kpi-value">{formatPercent(metric?.pickRate ?? 0)}</div>
          <div className="kpi-foot">
            <span className="rank-dot-inline" style={{ background: attr.color }} /> {attr.label} pool
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Pro presence</span>
            <Shield size={16} className="kpi-icon" />
          </div>
          <div className="kpi-value">{formatNumber(hero.pro_pick + hero.pro_ban)}</div>
          <div className="kpi-foot">
            <span>{hero.pro_pick}P / {hero.pro_ban}B</span>
          </div>
        </div>
        <div className="kpi-card kpi-accent">
          <div className="kpi-top">
            <span className="kpi-label">7-day movement</span>
            <ChartNoAxesCombined size={16} className="kpi-icon" />
          </div>
          <div className="kpi-value">
            <TrendDelta value={metric?.trendDelta} suffix="picks" neutralLabel="—" />
          </div>
          <div className="kpi-foot">
            <span>{trend.length ? `${trend.length}-week pick history` : 'No weekly series'}</span>
          </div>
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <SectionHeading
              eyebrow="Matchup matrix"
              title="Who this hero beats"
              hint={
                matchups.data
                  ? `${formatNumber(matchups.data.reduce((sum, entry) => sum + entry.games_played, 0))} matchup games`
                  : undefined
              }
            />
            {matchups.loading && !matchups.data ? (
              <div className="mini-skeletons">
                {[0, 1, 2, 3].map((key) => (
                  <span className="skeleton" key={key} style={{ height: 42 }} />
                ))}
              </div>
            ) : matchups.error && !matchups.data ? (
              <ErrorState error={matchups.error} onRetry={matchups.refresh} title="Matchup feed unavailable" />
            ) : (
              <div className="matchup-columns">
                <div>
                  <div className="mini-heading">
                    <span className="trend-up"><Zap size={12} /> Favorable</span>
                    <small>≥ {matchupGroups.threshold} games</small>
                  </div>
                  <div className="matchup-list">
                    {matchupGroups.good.map((matchup) => (
                      <MatchupRow key={matchup.hero_id} matchup={matchup} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mini-heading">
                    <span className="trend-down"><Shield size={12} /> Difficult</span>
                    <small>≥ {matchupGroups.threshold} games</small>
                  </div>
                  <div className="matchup-list">
                    {matchupGroups.bad.map((matchup) => (
                      <MatchupRow key={matchup.hero_id} matchup={matchup} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <p className="panel-footnote">
              Win rate is from this hero's perspective in matchups recorded by OpenDota. Small samples are
              volatile.
            </p>
          </section>

          <section className="panel">
            <SectionHeading
              eyebrow="Duration profile"
              title="When the game ends"
              hint="Share of sampled wins by game length"
            />
            {durations.loading && !durations.data ? (
              <div className="duration-bars">
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <span className="skeleton" key={key} style={{ height: 110 }} />
                ))}
              </div>
            ) : durations.error && !durations.data ? (
              <ErrorState error={durations.error} onRetry={durations.refresh} title="Duration feed unavailable" />
            ) : (
              <div className="duration-chart">
                {(durations.data ?? [])
                  .slice()
                  .sort((a, b) => a.duration_bin - b.duration_bin)
                  .map((entry) => {
                    const totalGames = durations.data?.reduce((sum, item) => sum + item.games_played, 0) ?? 1
                    const share = entry.games_played / (totalGames || 1)
                    const wr = entry.games_played ? entry.wins / entry.games_played : 0
                    return (
                      <div className="duration-col" key={entry.duration_bin}>
                        <span className="duration-wr">{formatPercent(wr, 0)}</span>
                        <span className="duration-bar-track">
                          <span
                            className={classNames('duration-bar', wr >= 0.5 ? 'is-good' : 'is-bad')}
                            style={{ height: `${Math.max(4, share * 240)}%` }}
                          />
                        </span>
                        <span className="duration-label">{entry.duration_bin} min</span>
                        <span className="duration-games">{formatCompact(entry.games_played)}</span>
                      </div>
                    )
                  })}
              </div>
            )}
            <p className="panel-footnote">Bars show the distribution of match duration; colour marks win rate above or below 50%.</p>
          </section>

          <section className="panel">
            <SectionHeading
              eyebrow="Item telemetry"
              title="Popular builds"
              hint="Most purchased items by phase"
            />
            {popularity.loading && !popularity.data ? (
              <div className="item-stage-grid">
                {[0, 1, 2, 3].map((key) => (
                  <span className="skeleton" key={key} style={{ height: 130 }} />
                ))}
              </div>
            ) : popularity.error && !popularity.data ? (
              <ErrorState error={popularity.error} onRetry={popularity.refresh} title="Item feed unavailable" />
            ) : (
              <div className="item-stage-grid">
                {itemStages.map((stage) => (
                  <div className="item-stage" key={stage.key}>
                    <div className="item-stage-head">
                      <strong>{stage.label}</strong>
                      <small>{stage.note}</small>
                    </div>
                    <div className="item-grid">
                      {stage.top.map((entry) => (
                        <span
                          className="item-tile"
                          key={entry.id}
                          title={`${entry.item?.dname ?? 'Item'} · ${formatCompact(entry.count)} purchases`}
                        >
                          <img src={itemImage(entry.item?.img)} alt={entry.item?.dname ?? 'Item'} loading="lazy" />
                          <span className="item-count">{formatCompact(entry.count)}</span>
                        </span>
                      ))}
                      {!stage.top.length && <span className="item-empty">No item sample</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="panel-footnote">Purchase counts are aggregated across parsed matches; they are not a recommended build order.</p>
          </section>
        </div>

        <div className="detail-side">
          <section className="panel">
            <SectionHeading eyebrow="Bracket performance" title="Ranked spread" />
            <div className="bracket-table">
              {snapshot.map((entry) => {
                const rank = RANKS[entry.bracket]
                return (
                  <div
                    className={classNames('bracket-table-row', meta.bracket === entry.bracket && 'is-current')}
                    key={entry.bracket}
                  >
                    <span className="bracket-table-rank" style={{ color: rank.color }}>
                      <span className="rank-dot-inline" style={{ background: rankMedal(entry.bracket * 10).color }} />
                      {rank.label}
                    </span>
                    <span className="bracket-table-bar">
                      <span style={{ width: `${(entry.picks / bracketMax) * 100}%`, background: rank.color }} />
                    </span>
                    <span className="bracket-table-wr">{formatPercent(entry.winRate, 0)}</span>
                    <span className="bracket-table-games">{formatCompact(entry.picks)}</span>
                  </div>
                )
              })}
            </div>
            <p className="panel-footnote">OpenDota publishes brackets 1–7 only; Immortal has no aggregated sample.</p>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Pro dossier" title="Draft presence" />
            <div className="pro-stat-grid">
              <div>
                <strong>{formatNumber(hero.pro_pick)}</strong>
                <span>Picks</span>
              </div>
              <div>
                <strong>{formatNumber(hero.pro_ban)}</strong>
                <span>Bans</span>
              </div>
              <div>
                <strong>{proWinRate != null ? formatPercent(proWinRate) : '—'}</strong>
                <span>Win rate</span>
              </div>
            </div>
            <div className="pro-stat-bar">
              <div>
                <span>Pick / ban split</span>
                <strong>{formatPercent(hero.pro_pick / Math.max(1, hero.pro_pick + hero.pro_ban))}</strong>
              </div>
              <span className="split-bar">
                <span style={{ width: `${(hero.pro_pick / Math.max(1, hero.pro_pick + hero.pro_ban)) * 100}%` }} />
              </span>
            </div>
            <Link className="text-link" to="/pro">
              Explore pro circuit <ArrowUpRight size={13} />
            </Link>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Momentum" title={`${trend.length || 7}-week pick pulse`} />
            {trend.length ? (
              <>
                <div className="week-bars">
                  {trend.map((value, index) => (
                    <div className="week-bar-col" key={index}>
                      <span
                        className="week-bar"
                        style={{ height: `${Math.max(6, (value / trendMax) * 100)}%` }}
                        title={`${formatNumber(value)} picks`}
                      />
                      <span className="week-label">{index === trend.length - 1 ? 'Now' : `W-${trend.length - 1 - index}`}</span>
                    </div>
                  ))}
                </div>
                <div className="week-summary">
                  <span>Latest <strong>{formatCompact(trend[trend.length - 1])}</strong> picks</span>
                  <TrendDelta value={metric?.trendDelta} />
                </div>
              </>
            ) : (
              <p className="panel-empty">Weekly pick trends are not exposed for this population.</p>
            )}
            <p className="panel-footnote">OpenDota's weekly series covers the last seven buckets for ranked all-bracket and Turbo samples.</p>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Base sheet" title="Starting attributes" />
            <div className="base-stat-list">
              <BaseStat label="Health" value={formatNumber(hero.base_health)} sub={`+${hero.base_health_regen.toFixed(1)} regen`} />
              <BaseStat label="Mana" value={formatNumber(hero.base_mana)} sub={`+${hero.base_mana_regen.toFixed(1)} regen`} />
              <BaseStat label="Armour" value={hero.base_armor.toFixed(1)} sub={`${hero.base_mr}% magic resist`} />
              <BaseStat label="Attack" value={`${hero.base_attack_min}–${hero.base_attack_max}`} sub={`${hero.attack_type} · ${hero.attack_range} range`} />
              <BaseStat label="Strength" value={`${hero.base_str}`} sub={`+${hero.str_gain.toFixed(1)} / level`} />
              <BaseStat label="Agility" value={`${hero.base_agi}`} sub={`+${hero.agi_gain.toFixed(1)} / level`} />
              <BaseStat label="Intelligence" value={`${hero.base_int}`} sub={`+${hero.int_gain.toFixed(1)} / level`} />
              <BaseStat label="Move speed" value={`${hero.move_speed}`} sub={`${hero.turn_rate ?? '—'} turn rate`} />
              <BaseStat label="Vision" value={`${hero.day_vision}/${hero.night_vision}`} sub={`${hero.legs} legs`} />
              <BaseStat label="Attack rate" value={hero.attack_rate.toFixed(2)} sub={`${hero.base_attack_time}s base`} />
            </div>
          </section>

          <div className="aside-note">
            <Eye size={14} />
            <p>
              These aggregates come from OpenDota's public heroStats and hero-specific endpoints. They are
              samples, not live match telemetry.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MatchupRow({
  matchup,
}: {
  matchup: HeroMatchup & {
    opponent: HeroStat
    winRate: number
  }
}) {
  if (!matchup.opponent) return null
  const advantage = matchup.winRate - 0.5
  return (
    <div className="matchup-row">
      <HeroPortrait hero={matchup.opponent} size="xs" />
      <span className="matchup-name">{matchup.opponent.localized_name}</span>
      <span className="matchup-games">{formatCompact(matchup.games_played)} games</span>
      <span className={classNames('matchup-rate', matchup.winRate >= 0.5 ? 'text-good' : 'text-bad')}>
        {formatPercent(matchup.winRate)}
      </span>
      <span className={classNames('matchup-adv', advantage >= 0 ? 'text-good' : 'text-bad')}>
        {formatSignedPercent(advantage)}
      </span>
    </div>
  )
}

function BaseStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="base-stat-row">
      <span className="base-stat-label">{label}</span>
      <span className="base-stat-value">{value}</span>
      {sub && <span className="base-stat-sub">{sub}</span>}
    </div>
  )
}
