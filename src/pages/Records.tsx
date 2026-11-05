import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Axe,
  Castle,
  Clock3,
  Coins,
  Flame,
  Gem,
  HeartPulse,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import type { PlayerMatch, RecentMatch, RecordEntry } from '../types'
import { RECORD_FIELDS } from '../lib/constants'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { formatDuration, formatNumber, timeAgo } from '../lib/format'
import { isPerformanceMatch, matchWon, type MatchSummary } from '../lib/matchMode'
import { mergeRecentWithTurbo, useTurboHistory } from '../lib/turboHistory'
import { useRankedHistory } from '../lib/rankedHistory'
import { apiGet } from '../lib/api'
import { useMeta } from '../context/MetaContext'
import { useProfile } from '../context/ProfileContext'
import {
  EmptyState,
  ErrorState,
  HeroPortrait,
  PageHeader,
  PageLoader,
  SectionHeading,
} from '../components/ui'

type RecordField = (typeof RECORD_FIELDS)[number]
type RecordIconName = RecordField['icon']

const RECORD_ICONS: Record<RecordIconName, ReactNode> = {
  clock: <Clock3 size={16} />,
  kills: <Swords size={16} />,
  deaths: <Skull size={16} />,
  assists: <HeartPulse size={16} />,
  gpm: <Coins size={16} />,
  xpm: <Sparkles size={16} />,
  lasthits: <Axe size={16} />,
  denies: <Shield size={16} />,
  damage: <Flame size={16} />,
  tower: <Castle size={16} />,
  healing: <HeartPulse size={16} />,
  networth: <Gem size={16} />,
}

export function RecordsPage() {
  useDocumentTitle('Hall of records')
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const fieldParam = params.get('field')
  const activeField = RECORD_FIELDS.find((item) => item.field === fieldParam) ?? RECORD_FIELDS[0]
  const records = useRemote<RecordEntry[]>(`/records/${activeField.field}`, 10 * 60 * 1000)
  const [heroQuery, setHeroQuery] = useState('')
  const [windowKey, setWindowKey] = useState<'all' | '30' | '90' | '365'>('all')
  const [visible, setVisible] = useState(25)

  const heroMap = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const query = heroQuery.trim().toLowerCase()

  const rows = useMemo(() => {
    const cutoff = windowKey === 'all' ? 0 : Date.now() / 1000 - Number(windowKey) * 24 * 60 * 60
    return (records.data ?? []).filter((record) => {
      if (record.start_time < cutoff) return false
      if (query) {
        const hero = record.hero_id ? heroMap.get(record.hero_id) : null
        if (!hero || !hero.localized_name.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [records.data, windowKey, query, heroMap])

  const selectField = (field: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('field', field)
      return next
    })
    setHeroQuery('')
    setVisible(25)
  }

  const topRecord = rows[0]
  const topHero = topRecord?.hero_id ? heroMap.get(topRecord.hero_id) : null
  const topValue = topRecord ? formatRecordValue(topRecord, activeField) : '—'

  return (
    <div className="page-stack records-page">
      <PageHeader
        eyebrow="Historical extremes"
        title="Hall of records"
        description="The highest single-match performances in OpenDota's parsed archive — the fastest stomps, the longest grinds, and the absurd stat lines in between."
        actions={
          <Link to="/data-lab" className="btn btn-ghost">
            <Sparkles size={14} /> Query the archive
          </Link>
        }
      />

      <PersonalRecordsSection />

      <div className="record-hero">
        <div className="record-hero-copy">
          <span className="record-hero-kicker"><Trophy size={13} /> Current record</span>
          <h2>{activeField.label}</h2>
          <div className="record-hero-score">
            <strong>{topValue}</strong>
            <span>{topHero ? topHero.localized_name : 'Archive leader'}</span>
          </div>
          {topRecord && (
            <Link to={`/matches/${topRecord.match_id}`} className="record-hero-link">
              Match {topRecord.match_id} · {timeAgo(topRecord.start_time)} <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
        <div className="record-hero-art" aria-hidden="true">
          {topHero ? <img src={`https://cdn.cloudflare.steamstatic.com${topHero.img}`} alt="" /> : <Trophy size={72} />}
        </div>
      </div>

      <div className="split-panels records-layout">
        <aside className="panel record-categories">
          <SectionHeading eyebrow="Categories" title="12 record books" />
          <div className="record-category-list">
            {RECORD_FIELDS.map((field) => (
              <button
                key={field.field}
                className={activeField.field === field.field ? 'record-category is-active' : 'record-category'}
                onClick={() => selectField(field.field)}
              >
                <span className="record-category-icon">{RECORD_ICONS[field.icon]}</span>
                <span>{field.label}</span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <p className="panel-footnote">
            Records come from parsed public matches. Unparsed games and private lobbies are excluded.
          </p>
        </aside>

        <section className="panel record-board">
          <SectionHeading
            eyebrow="Leaderboard"
            title={activeField.label}
            hint={`${formatNumber(rows.length)} matching records`}
            action={
              <select className="inline-select" value={windowKey} onChange={(event) => setWindowKey(event.target.value as typeof windowKey)}>
                <option value="all">All time</option>
                <option value="365">Last 365 days</option>
                <option value="90">Last 90 days</option>
                <option value="30">Last 30 days</option>
              </select>
            }
          />

          <div className="filter-bar compact">
            <label className="search-field">
              <Search size={15} />
              <input
                value={heroQuery}
                onChange={(event) => { setHeroQuery(event.target.value); setVisible(25) }}
                placeholder="Filter by hero…"
              />
              {heroQuery && <button className="icon-btn" onClick={() => setHeroQuery('')} aria-label="Clear hero filter"><X size={13} /></button>}
            </label>
            <span className="filter-note"><Clock3 size={13} /> Cached for 10 minutes</span>
            <span className="filter-note"><Zap size={13} /> Score is raw, not normalised</span>
          </div>

          {records.loading && !records.data ? (
            <PageLoader label={`Loading ${activeField.label.toLowerCase()}…`} />
          ) : records.error && !records.data ? (
            <ErrorState error={records.error} onRetry={records.refresh} title="Record book unavailable" />
          ) : rows.length === 0 ? (
            <EmptyState title="No records in this slice" icon={<Trophy size={22} />}>
              Try a wider time window or clear the hero filter.
            </EmptyState>
          ) : (
            <>
              <div className="record-list">
                {rows.slice(0, visible).map((record, index) => {
                  const hero = record.hero_id ? heroMap.get(record.hero_id) : null
                  return (
                    <Link to={`/matches/${record.match_id}`} className="record-row" key={`${record.match_id}-${index}`}>
                      <span className={index < 3 ? 'record-rank is-podium' : 'record-rank'}>{String(index + 1).padStart(2, '0')}</span>
                      {hero ? <HeroPortrait hero={hero} size="sm" /> : <span className="hero-portrait hero-portrait-sm portrait-fallback">?</span>}
                      <div className="record-row-hero">
                        <strong>{hero?.localized_name ?? 'Unknown hero'}</strong>
                        <span>{timeAgo(record.start_time)}</span>
                      </div>
                      <div className="record-row-score">
                        <strong>{formatRecordValue(record, activeField)}</strong>
                        <span>{activeField.unit === 'duration' ? 'match length' : 'record value'}</span>
                      </div>
                      <span className="record-row-match">#{record.match_id}</span>
                      <ArrowUpRight size={14} />
                    </Link>
                  )
                })}
              </div>
              {visible < rows.length && (
                <div className="load-more-row">
                  <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 25)}>
                    Load more <span>{formatNumber(rows.length - visible)} remaining</span>
                  </button>
                </div>
              )}
            </>
          )}
          <p className="panel-footnote">
            A record belongs to the match, not the player. Open the match scoreboard to see who owns the line.
          </p>
        </section>
      </div>
    </div>
  )
}

interface PersonalRecord {
  key: string
  label: string
  icon: ReactNode
  value: string
  row: MatchSummary
  hint: string
}

function makePersonalRecord(
  rows: MatchSummary[],
  label: string,
  icon: ReactNode,
  score: (row: MatchSummary) => number | null,
  format: (value: number) => string,
  hint: string,
): PersonalRecord | null {
  let best: MatchSummary | null = null
  let bestValue = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    const value = score(row)
    if (value == null || !Number.isFinite(value)) continue
    if (value > bestValue) {
      bestValue = value
      best = row
    }
  }
  if (!best) return null
  return { key: label, label, icon, value: format(bestValue), row: best, hint }
}

function longestWinStreak(rows: MatchSummary[]) {
  const ordered = [...rows].sort((a, b) => a.start_time - b.start_time)
  let best = 0
  let current = 0
  let bestRow: MatchSummary | null = null
  for (const row of ordered) {
    if (matchWon(row)) {
      current += 1
      if (current > best) {
        best = current
        bestRow = row
      }
    } else {
      current = 0
    }
  }
  return best > 0 && bestRow ? { value: best, row: bestRow } : null
}

function useAllRankedMatches(accountId: number | null) {
  const [state, setState] = useState<{ rows: PlayerMatch[]; loading: boolean; error: Error | null }>({
    rows: [],
    loading: Boolean(accountId),
    error: null,
  })

  useEffect(() => {
    if (!accountId) {
      setState({ rows: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState({ rows: [], loading: true, error: null })

    void (async () => {
      try {
        const all = new Map<number, PlayerMatch>()
        for (let page = 0; page < 10; page += 1) {
          const batch = await apiGet<PlayerMatch[]>(
            `/players/${accountId}/matches?limit=500&lobby_type=7&offset=${page * 500}`,
            { ttl: 5 * 60 * 1000 },
          )
          if (cancelled) return
          for (const match of batch) all.set(match.match_id, match)
          if (batch.length < 500) break
        }
        if (!cancelled) setState({ rows: [...all.values()], loading: false, error: null })
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            rows: current.rows,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accountId])

  return state
}

function PersonalRecordsSection() {
  const meta = useMeta()
  const { accountId } = useProfile()
  const [heroId, setHeroId] = useState('all')

  const ranked = useAllRankedMatches(accountId)
  const recent = useRemote<RecentMatch[]>(
    accountId ? `/players/${accountId}/recentMatches` : null,
    60 * 1000,
  )
  const turboHistory = useTurboHistory(accountId)
  const rankedHistory = useRankedHistory(accountId)

  const mode: 'ranked' | 'turbo' = meta.population === 'turbo' ? 'turbo' : 'ranked'
  const turboRows = useMemo(
    () => mergeRecentWithTurbo(recent.data ?? [], turboHistory.rows).filter((match) => match.game_mode === 23),
    [recent.data, turboHistory.rows],
  )
  const rankedPerformanceRows = useMemo(() => {
    const base = rankedHistory.rows.filter((match) => match.game_mode === 22 && match.lobby_type === 7)
    return heroId === 'all' ? base : base.filter((match) => match.hero_id === Number(heroId))
  }, [rankedHistory.rows, heroId])
  const rows = useMemo(() => {
    const base: MatchSummary[] = mode === 'ranked' ? ranked.rows : turboRows
    const filtered = heroId === 'all' ? base : base.filter((match) => match.hero_id === Number(heroId))
    return [...filtered].sort((a, b) => b.start_time - a.start_time)
  }, [mode, ranked.rows, turboRows, heroId])
  const performanceRows = mode === 'ranked' ? rankedPerformanceRows : rows
  const loading = mode === 'ranked'
    ? ranked.loading
    : recent.loading || turboHistory.loading

  const heroMap = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const heroOptions = useMemo(
    () => [...meta.heroes].sort((a, b) => a.localized_name.localeCompare(b.localized_name)),
    [meta.heroes],
  )
  const heroName = (id: number) => heroMap.get(id)?.localized_name ?? 'Unknown hero'
  const hero = heroId === 'all' ? null : heroMap.get(Number(heroId)) ?? null

  const personalRecords = useMemo(() => {
    const records: PersonalRecord[] = []
    const push = (record: PersonalRecord | null) => {
      if (record) records.push(record)
    }

    push(makePersonalRecord(rows, 'Most kills', <Swords size={16} />, (row) => row.kills, formatNumber, 'single game'))
    push(makePersonalRecord(rows, 'Most deaths', <Skull size={16} />, (row) => row.deaths, formatNumber, 'single game'))
    push(makePersonalRecord(rows, 'Most assists', <HeartPulse size={16} />, (row) => row.assists, formatNumber, 'single game'))
    push(makePersonalRecord(rows, 'Best KDA', <Zap size={16} />, (row) => (row.kills + row.assists) / Math.max(1, row.deaths), (value) => value.toFixed(2), 'kills + assists / deaths'))
    push(makePersonalRecord(rows, 'Longest game', <Clock3 size={16} />, (row) => row.duration, formatDuration, 'match length'))

    const streak = longestWinStreak(rows)
    if (streak) {
      records.push({
        key: 'win-streak',
        label: 'Longest win streak',
        icon: <Flame size={16} />,
        value: `${formatNumber(streak.value)} ${streak.value === 1 ? 'win' : 'wins'}`,
        row: streak.row,
        hint: 'consecutive wins',
      })
    }

    if (mode === 'turbo' || (mode === 'ranked' && performanceRows.length > 0)) {
      push(makePersonalRecord(performanceRows, 'Highest GPM', <Coins size={16} />, (row) => (isPerformanceMatch(row) ? row.gold_per_min : null), formatNumber, 'gold per minute'))
      push(makePersonalRecord(performanceRows, 'Highest XPM', <Sparkles size={16} />, (row) => (isPerformanceMatch(row) ? row.xp_per_min : null), formatNumber, 'experience per minute'))
      push(makePersonalRecord(performanceRows, 'Most last hits', <Axe size={16} />, (row) => (isPerformanceMatch(row) ? row.last_hits : null), formatNumber, 'single game'))
      push(makePersonalRecord(performanceRows, 'Most hero damage', <Shield size={16} />, (row) => (isPerformanceMatch(row) ? row.hero_damage : null), formatNumber, 'single game'))
    }

    return records
  }, [rows, performanceRows, mode])

  const sourceNote = mode === 'ranked'
    ? `Ranked · ${formatNumber(ranked.rows.length)} ranked matches${rankedHistory.count > 0 ? ` · ${formatNumber(rankedHistory.count)} parsed` : ''}`
    : `Turbo · ${formatNumber(turboRows.length)} OpenDota + locally parsed games`
  const scopeNote = hero
    ? `${hero.localized_name} only`
    : 'All heroes'

  return (
    <section className="panel personal-records">
      <SectionHeading
        eyebrow="Your record books"
        title="Personal bests"
        hint={`${sourceNote} · ${scopeNote}`}
        action={
          <div className="personal-record-controls">
            <div className="personal-record-mode" role="group" aria-label="Personal record mode">
              <button
                type="button"
                className={mode === 'ranked' ? 'is-active' : ''}
                aria-pressed={mode === 'ranked'}
                onClick={() => meta.setPopulation('ranked')}
              >
                Ranked
              </button>
              <button
                type="button"
                className={mode === 'turbo' ? 'is-active' : ''}
                aria-pressed={mode === 'turbo'}
                onClick={() => meta.setPopulation('turbo')}
              >
                Turbo
              </button>
            </div>
            <select
              className="inline-select personal-record-hero"
              value={heroId}
              onChange={(event) => setHeroId(event.target.value)}
              aria-label="Filter personal records by hero"
            >
              <option value="all">All heroes</option>
              {heroOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.localized_name}</option>
              ))}
            </select>
          </div>
        }
      />

      {!accountId ? (
        <div className="personal-records-empty">
          <Trophy size={24} />
          <div>
            <strong>Pin your profile to see your records.</strong>
            <p>Link your Steam account or open your player dossier first, then your ranked and Turbo record books will appear here.</p>
            <Link to="/players" className="record-hero-link">Open the player directory <ArrowUpRight size={13} /></Link>
          </div>
        </div>
      ) : loading && rows.length === 0 ? (
        <PageLoader label="Loading your record book…" />
      ) : personalRecords.length === 0 ? (
        <EmptyState title="No records in this slice" icon={<Trophy size={22} />}>
          {mode === 'turbo'
            ? 'No Turbo games in the current sample. Play or parse a Turbo game to start the record book.'
            : 'No ranked matches for this hero. Clear the hero filter or switch modes.'}
        </EmptyState>
      ) : (
        <>
          <div className="personal-record-grid">
            {personalRecords.map((record) => {
              const recordHero = heroMap.get(record.row.hero_id)
              return (
                <Link
                  key={record.key}
                  to={`/matches/${record.row.match_id}`}
                  className="personal-record-card"
                >
                  <div className="personal-record-card-head">
                    <span className="personal-record-icon">{record.icon}</span>
                    <span>{record.label}</span>
                    <ArrowUpRight size={13} />
                  </div>
                  <strong>{record.value}</strong>
                  <div className="personal-record-meta">
                    {recordHero ? <HeroPortrait hero={recordHero} size="sm" /> : null}
                    <span>{heroName(record.row.hero_id)} · {timeAgo(record.row.start_time)}</span>
                  </div>
                  <small>{record.hint}</small>
                </Link>
              )
            })}
          </div>
          <p className="panel-footnote">
            Ranked records page through all ranked matches OpenDota returns for the account; Turbo records use the
            latest 20-match sample plus every Turbo game parsed by your local worker. GPM, XPM, last hits and hero
            damage appear only for parsed Ranked or Turbo games.
          </p>
        </>
      )}
    </section>
  )
}

function formatRecordValue(record: RecordEntry, field: RecordField) {
  return field.unit === 'duration' ? formatDuration(record.score) : formatNumber(record.score)
}
