import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Clock3,
  Crosshair,
  Gauge,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
  TrendingUp,
} from 'lucide-react'
import type { BenchmarkMetric, BenchmarkPoint, HeroBenchmarks, PeerPlayer, RecentMatch } from '../types'
import { fetchHeroBenchmarks, fetchRecentMatches, TTL } from '../lib/api'
import { useRemote } from '../lib/hooks'
import { toRecentMatch, useTurboPeerHistory } from '../lib/turboHistory'
import { classNames, formatCompact, formatNumber } from '../lib/format'
import { SectionHeading, Skeleton } from './ui'

type MetricKey = 'gold_per_min' | 'xp_per_min' | 'last_hits_per_min' | 'hero_damage_per_min' | 'assists_per_min' | 'deaths_per_min'

interface MetricSpec {
  key: MetricKey
  label: string
  detail: string
  better: 'high' | 'low'
  raw: (match: RecentMatch) => number
  format: (value: number) => string
  icon: ReactNode
}

interface GameSample {
  match: RecentMatch
  won: boolean
  percentiles: Partial<Record<MetricKey, number>>
}

interface ReviewFlag {
  title: string
  detail: string
  matchId: number
  tone: 'warn' | 'info'
  icon: ReactNode
}

const RANKED_LOBBY_TYPES = new Set([5, 6, 7])

const METRICS: MetricSpec[] = [
  {
    key: 'gold_per_min',
    label: 'Farm',
    detail: 'GPM',
    better: 'high',
    raw: (match) => match.gold_per_min,
    format: (value) => `${formatNumber(Math.round(value))} GPM`,
    icon: <Gauge size={14} />,
  },
  {
    key: 'xp_per_min',
    label: 'Experience',
    detail: 'XPM',
    better: 'high',
    raw: (match) => match.xp_per_min,
    format: (value) => `${formatNumber(Math.round(value))} XPM`,
    icon: <TrendingUp size={14} />,
  },
  {
    key: 'last_hits_per_min',
    label: 'Last hits',
    detail: 'LH / min',
    better: 'high',
    raw: (match) => match.last_hits / Math.max(match.duration / 60, 1),
    format: (value) => `${value.toFixed(1)} / min`,
    icon: <Crosshair size={14} />,
  },
  {
    key: 'hero_damage_per_min',
    label: 'Hero impact',
    detail: 'Hero dmg / min',
    better: 'high',
    raw: (match) => match.hero_damage / Math.max(match.duration / 60, 1),
    format: (value) => `${formatCompact(Math.round(value))} / min`,
    icon: <Swords size={14} />,
  },
  {
    key: 'assists_per_min',
    label: 'Teamfight',
    detail: 'Assists / min',
    better: 'high',
    raw: (match) => match.assists / Math.max(match.duration / 60, 1),
    format: (value) => `${value.toFixed(2)} / min`,
    icon: <Sparkles size={14} />,
  },
  {
    key: 'deaths_per_min',
    label: 'Survival',
    detail: 'Deaths / 10 min',
    better: 'low',
    raw: (match) => match.deaths / Math.max(match.duration / 60, 1),
    format: (value) => `${(value * 10).toFixed(1)} / 10m`,
    icon: <Skull size={14} />,
  },
]

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function percentileFor(points: BenchmarkPoint[] | undefined, value: number): number | null {
  if (!points?.length || !Number.isFinite(value)) return null
  const sorted = [...points].sort((a, b) => a.percentile - b.percentile)
  if (value <= sorted[0].value) return Math.max(1, Math.round(sorted[0].percentile * 100))
  const last = sorted[sorted.length - 1]
  if (value >= last.value) return Math.min(99, Math.round(last.percentile * 100))

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]
    const next = sorted[index]
    if (value <= next.value) {
      const span = next.value - previous.value
      const ratio = span > 0 ? (value - previous.value) / span : 1
      return Math.max(
        1,
        Math.min(99, Math.round((previous.percentile + ratio * (next.percentile - previous.percentile)) * 100)),
      )
    }
  }
  return 50
}

function benchedPercentile(
  benchmarks: HeroBenchmarks | undefined,
  metric: MetricSpec,
  value: number,
): number | null {
  const key = metric.key as BenchmarkMetric
  const raw = percentileFor(benchmarks?.result[key], value)
  if (raw == null) return null
  return metric.better === 'low' ? 100 - raw : raw
}

function scoreBand(score: number | null) {
  if (score == null) return 'Waiting for sample'
  if (score >= 72) return 'Above the curve'
  if (score >= 55) return 'Around the middle'
  if (score >= 42) return 'Room to lift'
  return 'Below the curve'
}

function scoreTone(score: number | null) {
  if (score == null) return 'is-neutral'
  if (score >= 60) return 'is-good'
  if (score <= 38) return 'is-bad'
  return 'is-even'
}

export function PerformanceReview({ matches }: { matches: RecentMatch[] }) {
  const reviewMatches = useMemo(
    () =>
      matches
        .filter((match) => RANKED_LOBBY_TYPES.has(match.lobby_type) && match.game_mode !== 23)
        .slice(0, 10),
    [matches],
  )
  const heroKey = useMemo(
    () => Array.from(new Set(reviewMatches.map((match) => match.hero_id))).join(','),
    [reviewMatches],
  )
  const [benchmarks, setBenchmarks] = useState<Record<number, HeroBenchmarks>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ids = heroKey
      ? heroKey.split(',').map(Number).filter(Number.isFinite)
      : []
    if (!ids.length) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.allSettled(ids.map((id) => fetchHeroBenchmarks(String(id))))
      .then((results) => {
        if (cancelled) return
        const next: Record<number, HeroBenchmarks> = {}
        let failures = 0
        results.forEach((result) => {
          if (result.status === 'fulfilled') next[result.value.hero_id] = result.value
          else failures += 1
        })
        setBenchmarks((current) => ({ ...current, ...next }))
        if (failures === ids.length) {
          setError('Hero benchmarks are unavailable right now. Review flags still use the raw match sample.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [heroKey])

  const gameSamples = useMemo<GameSample[]>(() => {
    return reviewMatches.map((match) => {
      const won = match.player_slot < 128 === match.radiant_win
      const percentiles: Partial<Record<MetricKey, number>> = {}
      for (const metric of METRICS) {
        const value = metric.raw(match)
        const percentile = benchedPercentile(benchmarks[match.hero_id], metric, value)
        if (percentile != null) percentiles[metric.key] = percentile
      }
      return { match, won, percentiles }
    })
  }, [reviewMatches, benchmarks])

  const metricStats = useMemo(
    () =>
      METRICS.map((metric) => {
        const values = gameSamples
          .map((sample) => sample.percentiles[metric.key])
          .filter((value): value is number => value != null)
        const rawValues = gameSamples.map((sample) => metric.raw(sample.match))
        return {
          ...metric,
          percentile: median(values),
          sample: values.length,
          typical: median(rawValues),
        }
      }),
    [gameSamples],
  )

  const measuredGames = gameSamples.filter((sample) => Object.keys(sample.percentiles).length > 0).length
  const overall = median(
    metricStats
      .map((metric) => metric.percentile)
      .filter((value): value is number => value != null),
  )
  const strongest = metricStats
    .filter((metric) => metric.percentile != null)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0]

  const flags = useMemo<ReviewFlag[]>(() => {
    const list: ReviewFlag[] = []
    const farmWithoutImpact = gameSamples.filter(
      (sample) =>
        !sample.won &&
        (sample.percentiles.gold_per_min ?? 0) >= 65 &&
        (sample.percentiles.hero_damage_per_min ?? 100) <= 40,
    )
    if (farmWithoutImpact.length >= 2) {
      list.push({
        title: 'Farm without follow-through',
        detail: `${farmWithoutImpact.length} losses paired top-quartile farm with low hero damage. Check whether those games needed earlier fight participation.`,
        matchId: farmWithoutImpact[0].match.match_id,
        tone: 'warn',
        icon: <Gauge size={16} />,
      })
    }

    const highDeathLosses = gameSamples.filter((sample) => !sample.won && sample.match.deaths >= 8)
    if (highDeathLosses.length >= 2) {
      list.push({
        title: 'Deaths piled up in losses',
        detail: `${highDeathLosses.length} losses included 8+ deaths. Review the replay around your first two deaths for a repeatable cause.`,
        matchId: highDeathLosses[0].match.match_id,
        tone: 'warn',
        icon: <Skull size={16} />,
      })
    }

    const longLosses = gameSamples.filter(
      (sample) => !sample.won && sample.match.duration >= 2400,
    )
    if (longLosses.length >= 2) {
      list.push({
        title: 'Long games slipped away',
        detail: `${longLosses.length} losses ran past 40 minutes. Check late-game item timings, buyback use and objective decisions.`,
        matchId: longLosses[0].match.match_id,
        tone: 'info',
        icon: <Clock3 size={16} />,
      })
    }

    return list.slice(0, 3)
  }, [gameSamples])

  if (!reviewMatches.length) return null

  return (
    <section className="performance-review">
      <SectionHeading
        eyebrow="Performance review"
        title="Ranked games, benchmarked"
        hint={`${measuredGames} ranked ${measuredGames === 1 ? 'game' : 'games'} measured`}
        action={
          <span className="badge badge-muted">
            <ShieldCheck size={12} /> Hero-level benchmarks
          </span>
        }
      />

      <div className="review-grid">
        <div className="panel review-panel">
          <div className="review-score-head">
            <div>
              <span className="eyebrow">Overall percentile</span>
              <div className="review-score-number">
                <strong className={scoreTone(overall)}>{overall != null ? Math.round(overall) : '—'}</strong>
                <span>{scoreBand(overall)}</span>
              </div>
              <p>
                Across six efficiency signals, the median of your {measuredGames || 0} ranked games.
              </p>
            </div>
            <div
              className="review-score-orbit"
              style={{ background: `conic-gradient(var(--accent) ${(overall ?? 0) * 3.6}deg, var(--line) 0deg)` }}
              aria-hidden="true"
            >
              <span>{overall != null ? Math.round(overall) : '—'}</span>
            </div>
          </div>

          {loading && !measuredGames ? (
            <div className="review-skeletons">
              {[0, 1, 2, 3, 4, 5].map((key) => <Skeleton key={key} height={30} />)}
            </div>
          ) : (
            <div className="benchmark-list">
              {metricStats.map((metric) => (
                <div className="benchmark-row" key={metric.key}>
                  <span className="benchmark-label">
                    {metric.icon} {metric.label}
                    <small>{metric.detail}</small>
                  </span>
                  <div className="benchmark-track" aria-hidden="true">
                    <span
                      className={classNames(
                        metric.percentile != null && metric.percentile >= 60 && 'is-good',
                        metric.percentile != null && metric.percentile <= 38 && 'is-bad',
                      )}
                      style={{ width: `${metric.percentile ?? 0}%` }}
                    />
                  </div>
                  <strong>{metric.percentile != null ? Math.round(metric.percentile) : '—'}</strong>
                  <small className="benchmark-raw">
                    {metric.typical != null ? metric.format(metric.typical) : '—'}
                  </small>
                </div>
              ))}
            </div>
          )}

          {error ? <div className="inline-alert">{error}</div> : null}
          <p className="panel-footnote">
            Ranked standard matches only; Turbo and unranked games are excluded. Percentiles compare your
            hero-level rate to OpenDota's parsed public sample, which is not bracket-split.
          </p>
        </div>

        <div className="panel review-panel review-flags">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Review flags</span>
              <h2>Patterns worth a look</h2>
            </div>
            <span className="badge badge-muted">{reviewMatches.length} ranked</span>
          </div>

          {flags.length ? (
            <div className="review-flag-list">
              {flags.map((flag) => (
                <Link className="review-flag" to={`/matches/${flag.matchId}`} key={flag.title}>
                  <span className={classNames('review-flag-icon', `is-${flag.tone}`)}>{flag.icon}</span>
                  <span className="review-flag-copy">
                    <strong>{flag.title}</strong>
                    <span>{flag.detail}</span>
                  </span>
                  <ArrowUpRight size={14} className="review-flag-arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="review-all-clear">
              <ShieldCheck size={20} />
              <strong>No repeated red flags.</strong>
              <span>No high-confidence pattern crossed the threshold in this sample. Keep the sample moving.</span>
            </div>
          )}

          {strongest && strongest.percentile != null && strongest.percentile >= 60 ? (
            <div className="review-strength">
              <Sparkles size={16} />
              <div>
                <strong>Strongest signal: {strongest.label}</strong>
                <span>
                  {Math.round(strongest.percentile)}th percentile at {strongest.format(strongest.typical ?? 0)}.
                  This is the part of your game doing the most work.
                </span>
              </div>
            </div>
          ) : null}

          <p className="panel-footnote">
            Flags are heuristics, not causal coaching. A pattern needs at least two matching games and still
            needs replay context.
          </p>
        </div>
      </div>
    </section>
  )
}

type TurboBenchmarkScope = 'personal' | 'friends' | 'lobby'

const TURBO_SCOPE_LABELS: Record<TurboBenchmarkScope, string> = {
  personal: 'Personal',
  friends: 'Frequent teammates',
  lobby: 'My games',
}

export function TurboBenchmark({
  matches,
  accountId,
}: {
  matches: RecentMatch[]
  accountId: number | null
}) {
  const sample = useMemo(
    () =>
      matches
        .filter((match) => match.game_mode === 23 && match.duration > 300)
        .sort((a, b) => b.start_time - a.start_time),
    [matches],
  )
  const latest = useMemo(() => sample.slice(0, 5), [sample])
  const personalBaseline = useMemo(() => sample.slice(5), [sample])
  const [scope, setScope] = useState<TurboBenchmarkScope>('personal')
  const [friendSample, setFriendSample] = useState<RecentMatch[]>([])
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendError, setFriendError] = useState('')

  const peers = useRemote<PeerPlayer[]>(
    accountId ? `/players/${accountId}/peers` : null,
    TTL.player,
  )
  const peerHistory = useTurboPeerHistory(accountId)

  const frequentPeers = useMemo(
    () =>
      (peers.data ?? [])
        .filter((peer) => peer.with_games >= 2 && Number.isFinite(peer.account_id))
        .sort((a, b) => b.with_games - a.with_games)
        .slice(0, 6),
    [peers.data],
  )

  const lobbySample = useMemo(
    () =>
      peerHistory.rows
        .filter((row) => Number(row.account_id) !== accountId)
        .map(toRecentMatch),
    [accountId, peerHistory.rows],
  )

  useEffect(() => {
    if (scope !== 'friends' || !accountId || !peers.data) return
    if (!frequentPeers.length) {
      setFriendSample([])
      setFriendError('No frequent teammates have a parsed Turbo sample yet.')
      setFriendLoading(false)
      return
    }

    let cancelled = false
    setFriendLoading(true)
    setFriendError('')
    Promise.allSettled(
      frequentPeers.map((peer) => fetchRecentMatches(String(peer.account_id))),
    )
      .then((results) => {
        if (cancelled) return
        const rows: RecentMatch[] = []
        let failures = 0
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            rows.push(...result.value.filter((match) => match.game_mode === 23 && match.duration > 300))
          } else {
            failures += 1
          }
        })
        setFriendSample(rows)
        if (failures === results.length) {
          setFriendError('Teammate match history is unavailable right now.')
        }
      })
      .finally(() => {
        if (!cancelled) setFriendLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accountId, frequentPeers, peers.data, scope])

  const comparisonRows = useMemo(() => {
    if (scope === 'friends') return friendSample
    if (scope === 'lobby') return lobbySample
    return personalBaseline.length ? personalBaseline : sample
  }, [friendSample, lobbySample, personalBaseline, sample, scope])

  const comparisonLabel =
    scope === 'friends'
      ? `${frequentPeers.length} frequent teammates' recent Turbo games`
      : scope === 'lobby'
        ? `${lobbySample.length} other players from your parsed Turbo games`
        : `${Math.max(comparisonRows.length, 1)} earlier Turbo games`

  const scopeBusy =
    scope === 'friends' && (peers.loading || friendLoading || (peers.loading && !peers.data))

  const metricStats = useMemo(() => {
    return METRICS.map((metric) => {
      const latestValue = median(latest.map(metric.raw))
      const baselineValue = median(comparisonRows.map(metric.raw))
      const delta =
        latestValue != null && baselineValue != null && baselineValue !== 0
          ? (metric.better === 'low' ? baselineValue - latestValue : latestValue - baselineValue) / Math.abs(baselineValue)
          : null
      const score =
        delta == null
          ? null
          : Math.max(1, Math.min(99, Math.round(50 + delta * 100)))
      return {
        ...metric,
        latest: latestValue,
        baseline: baselineValue,
        score,
      }
    })
  }, [comparisonRows, latest])

  const overall = median(
    metricStats
      .map((metric) => metric.score)
      .filter((value): value is number => value != null),
  )
  const strongest = metricStats
    .filter((metric) => metric.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const wins = latest.filter((match) => match.player_slot < 128 === match.radiant_win).length

  if (sample.length < 6) {
    return (
      <section className="panel mode-note-panel">
        <SectionHeading eyebrow="Turbo benchmark" title="Build the sample" />
        <p className="muted-copy">
          Turbo benchmarks need at least six parsed Turbo games. DotaScope will keep adding games to your
          local history as you play with the desktop app open.
        </p>
      </section>
    )
  }

  const flags: ReviewFlag[] = []
  const farm = metricStats.find((metric) => metric.key === 'gold_per_min')
  const impact = metricStats.find((metric) => metric.key === 'hero_damage_per_min')
  const deaths = metricStats.find((metric) => metric.key === 'deaths_per_min')
  const deathValue = deaths?.latest
  const deathBaseline = deaths?.baseline

  if (farm?.score != null && impact?.score != null && farm.score >= 62 && impact.score <= 42) {
    flags.push({
      title: 'Farm is up, impact is flat',
      detail: 'Your recent Turbo farm is ahead of baseline while hero damage is below it. Check whether the extra gold is reaching fights.',
      matchId: latest[0]?.match_id ?? 0,
      tone: 'info',
      icon: <Gauge size={16} />,
    })
  }
  if (deathValue != null && deathBaseline != null && deathValue > deathBaseline * 1.2) {
    flags.push({
      title: 'Deaths above your baseline',
      detail: `You are dying ${(deathValue / deathBaseline).toFixed(1)}× more often than your Turbo baseline. Look at the first two deaths in the latest games.`,
      matchId: latest[0]?.match_id ?? 0,
      tone: 'warn',
      icon: <Skull size={16} />,
    })
  }
  const longLosses = latest.filter(
    (match) => !(match.player_slot < 128 === match.radiant_win) && match.duration >= 2400,
  )
  if (longLosses.length >= 2) {
    flags.push({
      title: 'Late Turbo games slipping',
      detail: `${longLosses.length} of your last five Turbo games were 40+ minute losses. Review late-game buyback and objective timing.`,
      matchId: longLosses[0].match_id,
      tone: 'warn',
      icon: <Clock3 size={16} />,
    })
  }

  return (
    <section className="performance-review">
      <SectionHeading
        eyebrow="Turbo benchmark"
        title="Turbo games, benchmarked"
        hint={`latest 5 vs ${comparisonLabel}`}
        action={
          <span className="badge badge-muted">
            <ShieldCheck size={12} /> {TURBO_SCOPE_LABELS[scope]}
          </span>
        }
      />

      <div className="benchmark-scopes" role="tablist" aria-label="Benchmark comparison">
        {(['personal', 'friends', 'lobby'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={scope === value}
            className={classNames('benchmark-scope', scope === value && 'is-active')}
            onClick={() => setScope(value)}
          >
            {TURBO_SCOPE_LABELS[value]}
          </button>
        ))}
        <span className="benchmark-scope-note">
          {scope === 'personal'
            ? 'Your latest five games against your earlier Turbo history.'
            : scope === 'friends'
              ? 'Players you have shared at least two games with; their recent Turbo sample.'
              : 'Every other player in your locally parsed Turbo games.'}
        </span>
      </div>

      {scope !== 'personal' && (scopeBusy || friendError || (!comparisonRows.length && !peerHistory.loading)) ? (
        <p className={classNames('benchmark-scope-status', friendError && 'is-error')}>
          {scopeBusy
            ? 'Pulling comparison sample…'
            : friendError || 'No comparison sample is available yet. Parse more games to widen this benchmark.'}
        </p>
      ) : null}

      <div className="review-grid">
        <div className="panel review-panel">
          <div className="review-score-head">
            <div>
              <span className="eyebrow">Form index</span>
              <div className="review-score-number">
                <strong className={scoreTone(overall)}>{overall != null ? Math.round(overall) : '—'}</strong>
                <span>{scoreBand(overall)}</span>
              </div>
              <p>
                Latest five Turbo games ({wins}-{latest.length - wins}) compared with{' '}
                {scope === 'personal'
                  ? 'your earlier Turbo history'
                  : scope === 'friends'
                    ? 'frequent teammates’ recent Turbo games'
                    : 'other players in your parsed Turbo games'}.
              </p>
            </div>
            <div
              className="review-score-orbit"
              style={{ background: `conic-gradient(var(--accent) ${(overall ?? 0) * 3.6}deg, var(--line) 0deg)` }}
              aria-hidden="true"
            >
              <span>{overall != null ? Math.round(overall) : '—'}</span>
            </div>
          </div>

          <div className="benchmark-list">
            {metricStats.map((metric) => (
              <div
                className="benchmark-row"
                key={metric.key}
                title={metric.baseline != null ? `Turbo baseline: ${metric.format(metric.baseline)}` : undefined}
              >
                <span className="benchmark-label">
                  {metric.icon} {metric.label}
                  <small>{metric.detail}</small>
                </span>
                <div className="benchmark-track" aria-hidden="true">
                  <span
                    className={classNames(
                      metric.score != null && metric.score >= 60 && 'is-good',
                      metric.score != null && metric.score <= 38 && 'is-bad',
                    )}
                    style={{ width: `${metric.score ?? 0}%` }}
                  />
                </div>
                <strong>{metric.score != null ? Math.round(metric.score) : '—'}</strong>
                <small className="benchmark-raw">
                  {metric.latest != null ? metric.format(metric.latest) : '—'}
                </small>
              </div>
            ))}
          </div>

          <p className="panel-footnote">
            {scope === 'personal'
              ? 'OpenDota has no global Turbo benchmark split. This compares your latest five parsed Turbo games with your earlier Turbo history. Local parser games join the sample automatically; small samples are noisy.'
              : scope === 'friends'
                ? 'Frequent teammates are players with at least two shared games. Their latest OpenDota Turbo games form the baseline; this measures your form against the people you queue with, not a global percentile.'
                : 'The lobby baseline uses every other player in your locally parsed Turbo matches, teammates and opponents. It is a same-games peer benchmark, not a global percentile.'}
          </p>
        </div>

        <div className="panel review-panel review-flags">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Turbo flags</span>
              <h2>What changed lately</h2>
            </div>
            <span className="badge badge-muted">{sample.length} games</span>
          </div>

          {flags.length ? (
            <div className="review-flag-list">
              {flags.map((flag) => (
                <Link className="review-flag" to={`/matches/${flag.matchId}`} key={flag.title}>
                  <span className={classNames('review-flag-icon', `is-${flag.tone}`)}>{flag.icon}</span>
                  <span className="review-flag-copy">
                    <strong>{flag.title}</strong>
                    <span>{flag.detail}</span>
                  </span>
                  <ArrowUpRight size={14} className="review-flag-arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="review-all-clear">
              <ShieldCheck size={20} />
              <strong>No repeated Turbo red flags.</strong>
              <span>No high-confidence pattern crossed the threshold in this sample. Keep the history growing.</span>
            </div>
          )}

          {strongest && strongest.score != null && strongest.score >= 60 ? (
            <div className="review-strength">
              <Sparkles size={16} />
              <div>
                <strong>Strongest signal: {strongest.label}</strong>
                <span>
                  {strongest.score} form score at {strongest.latest != null ? strongest.format(strongest.latest) : '—'}.
                  This is the part of your Turbo game doing the most work.
                </span>
              </div>
            </div>
          ) : null}

          <p className="panel-footnote">
            Form scores are relative to your own Turbo baseline, not a global percentile. At least six parsed
            Turbo games are required before the benchmark appears.
          </p>
        </div>
      </div>
    </section>
  )
}
