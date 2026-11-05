import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Crosshair,
  Flame,
  Globe2,
  History,
  Search,
  Shield,
  Swords,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import type {
  PeerPlayer,
  PlayerHero,
  PlayerMatch,
  PlayerProfile,
  PlayerWinLoss,
  RecentMatch,
} from '../types'
import { useMeta } from '../context/MetaContext'
import { TTL } from '../lib/api'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { mergeRecentWithTurbo, useTurboHistory } from '../lib/turboHistory'
import { bracketWinRate } from '../lib/meta'
import {
  MATCH_MODE_COPY,
  heroPoolFromRecent,
  isPerformanceMatch,
  matchWon,
  passesMatchMode,
  recordFromMatches,
} from '../lib/matchMode'
import {
  gameModeName,
  rankLabel,
} from '../lib/constants'
import {
  classNames,
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUnixTime,
  timeAgo,
  timeAgoFromIso,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  HeroExpectationFlag,
  HeroPortrait,
  MetaGradeBadge,
  PageLoader,
  PlayerAvatar,
  RankBadge,
  SectionHeading,
  WinRate,
} from '../components/ui'
import { PerformanceReview, TurboBenchmark } from '../components/PerformanceReview'
import { TurboEloPanel } from '../components/TurboEloPanel'

type HeroSort = 'games' | 'winRate' | 'name'
type ResultFilter = 'all' | 'wins' | 'losses'
type PeerSort = 'games' | 'winRate'
const PEER_PAGE_SIZE = 8
const LANE_LABELS: Record<number, string> = {
  1: 'Safe lane',
  2: 'Mid lane',
  3: 'Off lane',
  4: 'Jungle',
}
const PAGE_SIZE = 12

export function PlayerDetailPage() {
  const { playerId } = useParams()
  const validId = Boolean(playerId && /^\d{1,12}$/.test(playerId))
  const meta = useMeta()
  const profile = useRemote<PlayerProfile>(validId ? `/players/${playerId}` : null, TTL.player)
  const wl = useRemote<PlayerWinLoss>(validId ? `/players/${playerId}/wl` : null, TTL.player)
  const wlRanked = useRemote<PlayerWinLoss>(validId ? `/players/${playerId}/wl?lobby_type=7` : null, TTL.player)
  const heroes = useRemote<PlayerHero[]>(validId ? `/players/${playerId}/heroes` : null, TTL.player)
  const heroesRanked = useRemote<PlayerHero[]>(
    validId ? `/players/${playerId}/heroes?lobby_type=7` : null,
    TTL.player,
  )
  const ranked = useRemote<PlayerMatch[]>(
    validId ? `/players/${playerId}/matches?limit=500&lobby_type=7` : null,
    TTL.player,
  )
  const recent = useRemote<RecentMatch[]>(validId ? `/players/${playerId}/recentMatches` : null, TTL.player)
  const turboHistory = useTurboHistory(validId ? Number(playerId) : null)
  const peers = useRemote<PeerPlayer[]>(validId ? `/players/${playerId}/peers` : null, TTL.player)
  useDocumentTitle(profile.data?.profile.personaname ?? 'Player')
  const [heroFilter, setHeroFilter] = useState('')
  const [minGames, setMinGames] = useState(1)
  const [heroSort, setHeroSort] = useState<HeroSort>('games')
  const [heroLimit, setHeroLimit] = useState(PAGE_SIZE)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [matchHeroFilter, setMatchHeroFilter] = useState('')
  const [peerSort, setPeerSort] = useState<PeerSort>('games')
  const [peerLimit, setPeerLimit] = useState(PEER_PAGE_SIZE)

  const matchMode = meta.matchMode
  const modeCopy = MATCH_MODE_COPY[matchMode]
  const heroMap = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const metricMap = useMemo(() => new Map(meta.metrics.map((metric) => [metric.hero.id, metric])), [meta.metrics])
  const rankBracket = profile.data?.rank_tier
    ? Math.min(7, Math.max(1, Math.floor(profile.data.rank_tier / 10)))
    : null
  const bracketLabel = rankBracket
    ? `${rankLabel(rankBracket * 10).replace(/\s+\d+$/, '')} bracket`
    : 'all-rank'

  const recentRows = useMemo(() => {
    return mergeRecentWithTurbo(recent.data ?? undefined, turboHistory.rows).map((match) => {
      const radiant = match.player_slot < 128
      return { ...match, radiant, won: matchWon(match) }
    })
  }, [recent.data, turboHistory.rows])

  const rankedRows = useMemo(() => {
    return (ranked.data ?? []).map((match) => {
      const radiant = match.player_slot < 128
      return { ...match, radiant, won: matchWon(match) }
    })
  }, [ranked.data])

  const turboRows = useMemo(
    () => recentRows.filter((match) => passesMatchMode(match, 'turbo')),
    [recentRows],
  )

  const modeRows = useMemo(() => {
    if (matchMode === 'ranked') return rankedRows.slice(0, 20)
    if (matchMode === 'turbo') return turboRows
    return recentRows
  }, [matchMode, rankedRows, recentRows, turboRows])

  const performanceRows = useMemo(() => recent.data ?? [], [recent.data])

  const heroPool = useMemo(() => {
    if (matchMode === 'ranked') return heroesRanked.data ?? []
    if (matchMode === 'turbo') return heroPoolFromRecent(recentRows, 'turbo')
    const base = new Map((heroes.data ?? []).map((entry) => [entry.hero_id, { ...entry }]))
    heroPoolFromRecent(recentRows, 'turbo').forEach((entry) => {
      const current = base.get(entry.hero_id)
      if (!current) {
        base.set(entry.hero_id, entry)
        return
      }
      current.games += entry.games
      current.win += entry.win
      current.last_played = Math.max(current.last_played, entry.last_played)
    })
    return [...base.values()]
  }, [matchMode, heroes.data, heroesRanked.data, recentRows])

  const heroPoolLoading =
    matchMode === 'ranked' ? heroesRanked.loading : recent.loading || heroes.loading
  const heroPoolError =
    matchMode === 'ranked' ? heroesRanked.error : recent.error ?? heroes.error
  const heroPoolRefresh =
    matchMode === 'ranked' ? heroesRanked.refresh : () => {
      recent.refresh()
      heroes.refresh()
    }

  const playerHeroMap = useMemo(
    () => new Map(heroPool.map((entry) => [entry.hero_id, entry])),
    [heroPool],
  )

  const recentForm = useMemo(() => {
    const rows = modeRows.slice(0, 10)
    const won = rows.filter((match) => match.won).length
    let streak = 0
    let streakType: 'W' | 'L' | null = null
    for (const match of rows) {
      const type = match.won ? 'W' : 'L'
      if (streakType == null) {
        streakType = type
        streak = 1
      } else if (type === streakType) {
        streak += 1
      } else break
    }
    return { rows, won, winRate: rows.length ? won / rows.length : null, streak, streakType }
  }, [modeRows])

  const heroRows = useMemo(() => {
    const query = heroFilter.trim().toLowerCase()
    const rows = heroPool
      .map((entry) => ({ ...entry, hero: heroMap.get(entry.hero_id) }))
      .filter((entry) => entry.hero && entry.games >= minGames)
      .filter((entry) => !query || entry.hero!.localized_name.toLowerCase().includes(query))
    return rows.sort((a, b) => {
      if (heroSort === 'name') return (a.hero?.localized_name ?? '').localeCompare(b.hero?.localized_name ?? '')
      if (heroSort === 'winRate') {
        return (b.games ? b.win / b.games : 0) - (a.games ? a.win / a.games : 0)
      }
      return b.games - a.games
    })
  }, [heroPool, heroMap, heroFilter, minGames, heroSort])

  const matchRows = useMemo(() => {
    const query = matchHeroFilter.trim().toLowerCase()
    return modeRows.filter((match) => {
      if (resultFilter === 'wins' && !match.won) return false
      if (resultFilter === 'losses' && match.won) return false
      if (query) {
        const hero = heroMap.get(match.hero_id)
        if (!hero?.localized_name.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [modeRows, resultFilter, matchHeroFilter, heroMap])

  const hasPerformanceColumns = matchRows.some(isPerformanceMatch)
  const logLoading = matchMode === 'ranked' ? ranked.loading : recent.loading
  const logError = matchMode === 'ranked' ? ranked.error : recent.error
  const logRefresh = matchMode === 'ranked' ? ranked.refresh : recent.refresh
  const laneRows = recentRows.filter((match) => passesMatchMode(match, matchMode))

  const peerRows = useMemo(() => {
    const rows = (peers.data ?? []).filter((peer) => peer.with_games > 0)
    return rows.sort((a, b) => {
      if (peerSort === 'winRate') {
        return (b.with_win / Math.max(b.with_games, 1)) - (a.with_win / Math.max(a.with_games, 1))
      }
      return b.with_games - a.with_games
    })
  }, [peers.data, peerSort])

  const attributeMix = useMemo(() => {
    const buckets = new Map<string, { games: number; wins: number }>()
    heroPool.forEach((entry) => {
      const hero = heroMap.get(entry.hero_id)
      if (!hero) return
      const current = buckets.get(hero.primary_attr) ?? { games: 0, wins: 0 }
      current.games += entry.games
      current.wins += entry.win
      buckets.set(hero.primary_attr, current)
    })
    const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.games, 0)
    return [...buckets.entries()]
      .map(([attr, bucket]) => ({ attr, ...bucket, share: total ? bucket.games / total : 0 }))
      .sort((a, b) => b.games - a.games)
  }, [heroPool, heroMap])

  const laneMix = useMemo(() => {
    const counts = new Map<number, number>()
    laneRows.forEach((match) => {
      if (match.lane_role == null || !LANE_LABELS[match.lane_role]) return
      counts.set(match.lane_role, (counts.get(match.lane_role) ?? 0) + 1)
    })
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
    return [...counts.entries()]
      .map(([lane, count]) => ({ lane, count, share: total ? count / total : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [laneRows])

  if (!validId) {
    return (
      <div className="page-stack">
        <Link to="/players" className="back-link"><ArrowLeft size={14} /> Player directory</Link>
        <EmptyState
          title="Invalid account ID"
          icon={<UserRound size={22} />}
          action={<Link className="btn btn-ghost btn-sm" to="/players">Search for a player</Link>}
        >
          Dota account IDs are numeric. Open the player directory and search by persona name if you only know
          someone's display name.
        </EmptyState>
      </div>
    )
  }

  if (profile.loading && !profile.data) return <PageLoader label="Building player dossier…" />

  if (!profile.data) {
    return (
      <div className="page-stack">
        <Link to="/players" className="back-link"><ArrowLeft size={14} /> Player directory</Link>
        <ErrorState
          error={profile.error ?? new Error('That account could not be loaded.')}
          onRetry={profile.refresh}
          title={`Player #${playerId} unavailable`}
        />
      </div>
    )
  }

  const player = profile.data.profile
  const record = matchMode === 'ranked'
    ? wlRanked.data
    : matchMode === 'turbo'
      ? recordFromMatches(recentRows, 'turbo')
      : wl.data
  const wins = record?.win ?? null
  const losses = record?.lose ?? null
  const totalGames = wins != null && losses != null ? wins + losses : null
  const careerWinRate = totalGames ? (wins ?? 0) / totalGames : null
  const recordLabel = matchMode === 'ranked' ? 'Ranked' : matchMode === 'turbo' ? 'Turbo' : 'Career'
  const recordNote = matchMode === 'ranked'
    ? 'OpenDota ranked career record'
    : matchMode === 'turbo'
      ? turboHistory.available
        ? 'OpenDota sample + parsed Turbo history'
        : 'From the latest 20-match sample'
      : 'OpenDota career record'
  const recordLoading = matchMode === 'ranked'
    ? wlRanked.loading && !wlRanked.data
    : matchMode === 'turbo'
      ? false
      : wl.loading && !wl.data
  const recordError = matchMode === 'ranked' ? wlRanked.error : matchMode === 'turbo' ? null : wl.error
  const rank = rankLabel(profile.data.rank_tier)
  const lastLogin = player.last_login ? timeAgoFromIso(player.last_login) : 'Unknown'

  return (
    <div className="page-stack player-detail-page">
      <Link to="/players" className="back-link"><ArrowLeft size={14} /> Player directory</Link>

      <section className="player-hero">
        <div className="player-hero-avatar">
          <PlayerAvatar src={player.avatarfull} name={player.personaname} size="xl" />
          <span className="player-id-tag">#{player.account_id}</span>
        </div>
        <div className="player-hero-copy">
          <span className="eyebrow">Player dossier</span>
          <h1>{player.personaname || 'Anonymous'}</h1>
          <div className="player-subline">
            {player.name && <span>{player.name}</span>}
            {player.loccountrycode && <span><Globe2 size={13} /> {player.loccountrycode}</span>}
            <span><CalendarDays size={13} /> last seen {lastLogin}</span>
          </div>
          <div className="player-badges">
            <RankBadge rankTier={profile.data.rank_tier} size="md" showLabel />
            {profile.data.leaderboard_rank && (
              <span className="badge badge-gold"><Flame size={12} /> Leaderboard #{profile.data.leaderboard_rank}</span>
            )}
            <span className="badge badge-muted"><Shield size={12} /> {player.plus ? 'Dota Plus' : 'Standard account'}</span>
          </div>
          <div className="player-hero-actions">
            <a className="btn btn-ghost btn-sm" href={player.profileurl} target="_blank" rel="noreferrer">
              Steam profile <ArrowUpRight size={13} />
            </a>
            <a className="btn btn-ghost btn-sm" href={`https://www.opendota.com/players/${player.account_id}`} target="_blank" rel="noreferrer">
              OpenDota <ArrowUpRight size={13} />
            </a>
            <Link className="btn btn-ghost btn-sm" to="/data-lab">
              <Zap size={13} /> Data Lab
            </Link>
          </div>
        </div>
        <div className="player-form-card">
          <span className="eyebrow">{modeCopy.short} · Last 10</span>
          <div className="form-pips">
            {recentForm.rows.map((match) => (
              <span
                className={classNames('form-pip', match.won ? 'is-win' : 'is-loss')}
                key={match.match_id}
                title={`${match.won ? 'Win' : 'Loss'} · ${gameModeName(match.game_mode)}`}
              >
                {match.won ? 'W' : 'L'}
              </span>
            ))}
            {!recentForm.rows.length && <span className="muted-label">No recent matches</span>}
          </div>
          <strong className={recentForm.streakType === 'W' ? 'text-good' : recentForm.streakType === 'L' ? 'text-bad' : ''}>
            {recentForm.streakType ? `${recentForm.streak}${recentForm.streakType}` : '—'}
          </strong>
          <small>current streak</small>
        </div>
      </section>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">{recordLabel} games</span><History size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{totalGames != null ? formatNumber(totalGames) : '—'}</div>
          <div className="kpi-foot">
            <span>
              {wins != null && losses != null
                ? `${formatNumber(wins)} wins · ${formatNumber(losses)} losses`
                : 'record unavailable'}
            </span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">{recordLabel} win rate</span><Target size={16} className="kpi-icon" /></div>
          <div className={classNames('kpi-value', careerWinRate != null && careerWinRate >= 0.5 ? 'text-good' : 'text-bad')}>
            {careerWinRate != null ? formatPercent(careerWinRate) : '—'}
          </div>
          <div className="kpi-foot">
            <span>{totalGames != null ? `${recordNote} · ${formatNumber(totalGames)} games` : 'record unavailable'}</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">Computed MMR</span><TrendingUp size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{profile.data.computed_mmr ? formatNumber(profile.data.computed_mmr) : '—'}</div>
          <div className="kpi-foot"><span>{profile.data.computed_mmr_turbo ? `${formatNumber(profile.data.computed_mmr_turbo)} turbo` : 'OpenDota estimate'}</span></div>
        </div>
        <div className="kpi-card kpi-accent">
          <div className="kpi-top"><span className="kpi-label">Recent form</span><Swords size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{recentForm.winRate != null ? formatPercent(recentForm.winRate) : '—'}</div>
          <div className="kpi-foot"><span>{recentForm.rows.length} {modeCopy.short} matches · {recentForm.won} wins</span></div>
        </div>
      </div>

      {matchMode === 'turbo' ? (
        <>
          <TurboEloPanel
            accountId={validId ? Number(playerId) : null}
            playerName={profile.data?.profile.personaname ?? null}
          />
          <TurboBenchmark matches={turboRows} accountId={validId ? Number(playerId) : null} />
        </>
      ) : (
        <PerformanceReview matches={performanceRows} />
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <SectionHeading
              eyebrow="Hero pool"
              title="Comfort picks"
              hint={`${formatNumber(heroRows.length)} heroes · ${modeCopy.label}`}
            />
            <div className="filter-bar compact hero-pool-filters">
              <label className="search-field">
                <Search size={15} />
                <input
                  value={heroFilter}
                  onChange={(event) => { setHeroFilter(event.target.value); setHeroLimit(PAGE_SIZE) }}
                  placeholder="Find a hero…"
                />
              </label>
              <label className="select-field">
                <span>Games</span>
                <select value={minGames} onChange={(event) => { setMinGames(Number(event.target.value)); setHeroLimit(PAGE_SIZE) }}>
                  <option value={1}>1+</option>
                  <option value={5}>5+</option>
                  <option value={10}>10+</option>
                  <option value={20}>20+</option>
                  <option value={50}>50+</option>
                </select>
              </label>
              <label className="select-field">
                <span>Sort</span>
                <select value={heroSort} onChange={(event) => setHeroSort(event.target.value as HeroSort)}>
                  <option value="games">Most played</option>
                  <option value="winRate">Win rate</option>
                  <option value="name">Hero name</option>
                </select>
              </label>
            </div>

            {heroPoolLoading && !heroPool.length ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span className="skeleton" key={key} style={{ height: 40 }} />)}</div>
            ) : heroPoolError && !heroPool.length ? (
              <ErrorState error={heroPoolError} onRetry={heroPoolRefresh} title="Hero pool unavailable" />
            ) : heroRows.length === 0 ? (
              <EmptyState title="No heroes match these filters" icon={<Crosshair size={20} />}>
                Lower the minimum game threshold or clear the hero search.
              </EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table player-hero-table">
                  <thead>
                    <tr>
                      <th>Hero</th>
                      <th className="num">Games</th>
                      <th>Win rate</th>
                      <th className="num">W / L</th>
                      <th className="num">Last played</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heroRows.slice(0, heroLimit).map((row) => {
                      const wr = row.games ? row.win / row.games : 0
                      return (
                        <tr key={row.hero_id}>
                          <td>
                            <Link
                              to={`/players/${playerId}/heroes/${row.hero_id}`}
                              className="table-hero"
                              title={`Open ${player.personaname || 'player'}'s ${row.hero?.localized_name ?? 'hero'} dossier`}
                            >
                              <HeroPortrait hero={row.hero} size="xs" />
                              <span className="player-hero-name">{row.hero?.localized_name}</span>
                              {metricMap.has(row.hero_id) ? (
                                <MetaGradeBadge score={metricMap.get(row.hero_id)!.metaScore} size="sm" />
                              ) : null}
                              {row.hero ? (
                                <HeroExpectationFlag
                                  actual={wr}
                                  expected={rankBracket ? bracketWinRate(row.hero, rankBracket) : null}
                                  games={row.games}
                                  bracketLabel={bracketLabel}
                                />
                              ) : null}
                              <ArrowUpRight size={12} className="row-arrow" />
                            </Link>
                          </td>
                          <td className="num mono">{formatNumber(row.games)}</td>
                          <td>
                            <div className="inline-winrate">
                              <span className={wr >= 0.5 ? 'text-good' : 'text-bad'}>{formatPercent(wr)}</span>
                              <span className="mini-bar"><span style={{ width: `${wr * 100}%` }} /></span>
                            </div>
                          </td>
                          <td className="num mono">{row.win} / {row.games - row.win}</td>
                          <td className="num muted-label">{row.last_played ? formatUnixTime(row.last_played) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {heroRows.length > heroLimit && (
              <div className="load-more-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setHeroLimit((limit) => limit + PAGE_SIZE)}>
                  Show more heroes <span>{formatNumber(heroRows.length - heroLimit)} remaining</span>
                </button>
              </div>
            )}
            <p className="panel-footnote">
              {matchMode === 'ranked'
                ? 'Ranked career aggregates from OpenDota.'
                : matchMode === 'turbo'
                  ? 'Turbo aggregate is a sample from the latest 20 public matches; OpenDota does not expose a Turbo career split.'
                  : 'Ranked career aggregates plus the latest mixed Turbo sample.'}
              {' '}Hero grades follow the current meta lens; +/− compares win rate with the {bracketLabel} baseline.
            </p>
          </section>

          <section className="panel squad-panel">
            <SectionHeading
              eyebrow="Squad performance"
              title="Friends & frequent teammates"
              hint={peers.data ? `${formatNumber(peerRows.length)} public peers` : 'OpenDota peer history'}
              action={
                <div className="segmented segmented-sm">
                  <button className={peerSort === 'games' ? 'is-active' : ''} onClick={() => setPeerSort('games')}>Most games</button>
                  <button className={peerSort === 'winRate' ? 'is-active' : ''} onClick={() => setPeerSort('winRate')}>Best WR</button>
                </div>
              }
            />
            <p className="squad-lede">
              How this account performs when queued with the people it plays with most. Open a teammate to inspect their own dossier.
            </p>
            {peers.loading && !peers.data ? (
              <div className="squad-grid">
                {[0, 1, 2, 3].map((key) => <span className="skeleton squad-skeleton" key={key} />)}
              </div>
            ) : peers.error && !peers.data ? (
              <ErrorState error={peers.error} onRetry={peers.refresh} title="Teammate history unavailable" />
            ) : peerRows.length === 0 ? (
              <EmptyState title="No public teammate history" icon={<Users size={20} />}>
                OpenDota does not have parsed games with repeat teammates for this account.
              </EmptyState>
            ) : (
              <>
                <div className="squad-grid">
                  {peerRows.slice(0, peerLimit).map((peer) => {
                    const winRate = peer.with_games ? peer.with_win / peer.with_games : 0
                    const avgGpm = peer.with_games && peer.with_gpm_sum
                      ? Math.round(peer.with_gpm_sum / peer.with_games)
                      : null
                    return (
                      <Link className="squad-card" to={`/players/${peer.account_id}`} key={peer.account_id}>
                        <PlayerAvatar src={peer.avatarfull ?? peer.avatar} name={peer.personaname ?? peer.name ?? 'Player'} size="md" />
                        <div className="squad-card-copy">
                          <div className="squad-card-top">
                            <strong>{peer.personaname || peer.name || `Account ${peer.account_id}`}</strong>
                            <span className={classNames('squad-rate', winRate >= 0.5 ? 'text-good' : 'text-bad')}>{formatPercent(winRate)}</span>
                          </div>
                          <span>{formatNumber(peer.with_games)} games together · {formatNumber(peer.with_win)} wins</span>
                          <small>
                            Last queued {timeAgo(peer.last_played)}
                            {avgGpm != null ? ` · ${formatNumber(avgGpm)} avg GPM` : ''}
                          </small>
                        </div>
                        <ArrowUpRight size={14} className="squad-arrow" />
                      </Link>
                    )
                  })}
                </div>
                {peerRows.length > peerLimit && (
                  <div className="load-more-row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPeerLimit((limit) => limit + PEER_PAGE_SIZE)}>
                      Show more teammates <span>{formatNumber(peerRows.length - peerLimit)} remaining</span>
                    </button>
                  </div>
                )}
              </>
            )}
            <p className="panel-footnote">
              Built from OpenDota&apos;s public peer history, not Steam&apos;s private friends list. Win rate is the duo&apos;s record when queued together.
            </p>
          </section>

          <section className="panel">
            <SectionHeading
              eyebrow="Recent matches"
              title="Form log"
              hint={`${formatNumber(matchRows.length)} shown · ${modeCopy.label}`}
              action={
                <div className="segmented segmented-sm">
                  {(['all', 'wins', 'losses'] as ResultFilter[]).map((value) => (
                    <button key={value} className={resultFilter === value ? 'is-active' : ''} onClick={() => setResultFilter(value)}>
                      {value === 'all' ? 'All' : value === 'wins' ? 'Wins' : 'Losses'}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="filter-bar compact match-log-filter">
              <label className="search-field">
                <Search size={15} />
                <input
                  value={matchHeroFilter}
                  onChange={(event) => setMatchHeroFilter(event.target.value)}
                  placeholder="Filter by hero…"
                />
              </label>
              <span className="muted-label">
                <Clock3 size={13} /> {matchMode === 'ranked'
                  ? 'Ranked · latest 20 shown'
                  : matchMode === 'turbo'
                    ? 'Turbo sample · latest 20 matches'
                    : 'OpenDota latest mixed sample'}
              </span>
            </div>

            {logLoading && !modeRows.length ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span className="skeleton" key={key} style={{ height: 44 }} />)}</div>
            ) : logError && !modeRows.length ? (
              <ErrorState error={logError} onRetry={logRefresh} title="Recent matches unavailable" />
            ) : matchRows.length === 0 ? (
              <EmptyState title="No matches in this slice" icon={<Swords size={20} />}>
                Clear the result or hero filter to see the full recent log.
              </EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table match-log-table">
                  <thead>
                    <tr>
                      <th>Result</th>
                      <th>Hero</th>
                      <th>K / D / A</th>
                      {hasPerformanceColumns && <th className="num">GPM / XPM</th>}
                      {hasPerformanceColumns && <th className="num">LH / DN</th>}
                      {hasPerformanceColumns && <th className="num">Hero dmg</th>}
                      <th>Mode</th>
                      <th className="num">Length</th>
                      <th className="num">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchRows.map((match) => {
                      const hero = heroMap.get(match.hero_id)
                      const heroMetric = metricMap.get(match.hero_id)
                      const heroAggregate = playerHeroMap.get(match.hero_id)
                      const historyWinRate = heroAggregate?.games
                        ? heroAggregate.win / heroAggregate.games
                        : null
                      return (
                        <tr key={match.match_id} className={match.won ? 'row-win' : 'row-loss'}>
                          <td>
                            <Link to={`/matches/${match.match_id}`} className={classNames('result-dot', match.won ? 'is-win' : 'is-loss')}>
                              <span />
                              {match.won ? 'Win' : 'Loss'}
                            </Link>
                          </td>
                          <td>
                            <Link
                              to={`/players/${playerId}/heroes/${match.hero_id}`}
                              className="table-hero"
                              title={`Open ${player.personaname || 'player'}'s hero dossier`}
                            >
                              <HeroPortrait hero={hero} size="xs" />
                              <span className="match-log-hero-copy">
                                <span>{hero?.localized_name ?? `Hero ${match.hero_id}`}</span>
                                <span className="match-log-hero-meta">
                                  {heroMetric ? <MetaGradeBadge score={heroMetric.metaScore} size="sm" /> : null}
                                  {historyWinRate != null && heroAggregate && hero ? (
                                    <HeroExpectationFlag
                                      actual={historyWinRate}
                                      expected={rankBracket ? bracketWinRate(hero, rankBracket) : null}
                                      games={heroAggregate.games}
                                      bracketLabel={bracketLabel}
                                    />
                                  ) : null}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="mono">{match.kills} / {match.deaths} / {match.assists}</td>
                          {hasPerformanceColumns && (
                            <>
                              <td className="num mono">
                                {isPerformanceMatch(match) ? `${match.gold_per_min} / ${match.xp_per_min}` : '—'}
                              </td>
                              <td className="num mono">
                                {isPerformanceMatch(match) ? `${match.last_hits} / ${match.denies ?? 0}` : '—'}
                              </td>
                              <td className="num mono">
                                {isPerformanceMatch(match) ? formatCompact(match.hero_damage) : '—'}
                              </td>
                            </>
                          )}
                          <td className="muted-label">{gameModeName(match.game_mode)}</td>
                          <td className="num mono">{formatDuration(match.duration)}</td>
                          <td className="num muted-label">{formatUnixTime(match.start_time)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="panel-footnote">
              Match rows link to the full scoreboard. Grades and +/− reflect this player's overall
              record on that hero, not the result of a single game. The public player feed does not
              include every historical match.
            </p>
          </section>
        </div>

        <div className="detail-side">
          <section className="panel">
            <SectionHeading eyebrow={`${recordLabel} record`} title="Win / loss" />
            {recordLoading ? (
              <span className="skeleton" style={{ height: 84 }} />
            ) : recordError ? (
              <ErrorState error={recordError} onRetry={matchMode === 'ranked' ? wlRanked.refresh : wl.refresh} title="Record unavailable" />
            ) : (
              <>
                <div className="wl-numbers">
                  <div><strong className="text-good">{formatNumber(wins ?? 0)}</strong><span>Wins</span></div>
                  <div><strong className="text-bad">{formatNumber(losses ?? 0)}</strong><span>Losses</span></div>
                </div>
                <div className="wl-bar">
                  <span className="wl-bar-win" style={{ width: `${careerWinRate != null ? careerWinRate * 100 : 50}%` }} />
                </div>
                <div className="wl-caption">
                  <span>{careerWinRate != null ? formatPercent(careerWinRate) : '—'} win rate</span>
                  <span>{totalGames != null ? formatNumber(totalGames) : '—'} games</span>
                </div>
                <WinRate value={careerWinRate} games={totalGames ?? undefined} size="sm" />
              </>
            )}
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Play style" title="Attribute comfort" />
            {attributeMix.length ? (
              <div className="attribute-mix">
                {attributeMix.map((bucket) => (
                  <div className="attribute-row" key={bucket.attr}>
                    <div className="attribute-row-head">
                      <span className={`attr-label attr-${bucket.attr}`}>{bucket.attr === 'all' ? 'Universal' : bucket.attr.toUpperCase()}</span>
                      <span>{formatPercent(bucket.share)}</span>
                      <small>{formatPercent(bucket.games ? bucket.wins / bucket.games : 0)} WR</small>
                    </div>
                    <span className="attribute-bar">
                      <span className={`attr-${bucket.attr}`} style={{ width: `${bucket.share * 100}%` }} />
                    </span>
                    <small>{formatNumber(bucket.games)} games</small>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted-copy">No hero pool data to summarise.</span>
            )}
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Recent lane mix" title="Where the games start" />
            {laneMix.length ? (
              <div className="lane-list">
                {laneMix.map((lane) => (
                  <div className="lane-row" key={lane.lane}>
                    <span>{LANE_LABELS[lane.lane]}</span>
                    <span className="lane-bar"><span style={{ width: `${lane.share * 100}%` }} /></span>
                    <strong>{formatPercent(lane.share)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted-copy">Lane data is missing from the recent matches.</span>
            )}
            <p className="panel-footnote">
              Derived from OpenDota lane_role in the latest mixed 20-match feed
              {matchMode !== 'all' ? ` · ${modeCopy.label} rows only` : ''}.
            </p>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Account facts" title="Identity" />
            <div className="fact-list">
              <div><span>Persona</span><strong>{player.personaname || '—'}</strong></div>
              <div><span>Real name</span><strong>{player.name || '—'}</strong></div>
              <div><span>Account</span><strong>#{player.account_id}</strong></div>
              <div><span>Steam ID</span><strong className="mono-small">{player.steamid}</strong></div>
              <div><span>Country</span><strong>{player.loccountrycode || '—'}</strong></div>
              <div><span>Rank</span><strong>{rank}</strong></div>
              <div><span>Last login</span><strong>{lastLogin}</strong></div>
            </div>
          </section>

          <div className="aside-note">
            <Users size={14} />
            <p>
              Stats are from OpenDota's public player endpoints. Private match data, unparsed games, and
              archived career seasons may be missing.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
