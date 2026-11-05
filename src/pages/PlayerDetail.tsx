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
  PlayerProfile,
  PlayerWinLoss,
  RecentMatch,
} from '../types'
import { useMeta } from '../context/MetaContext'
import { TTL } from '../lib/api'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { bracketWinRate } from '../lib/meta'
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
import { PerformanceReview } from '../components/PerformanceReview'

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
  const heroes = useRemote<PlayerHero[]>(validId ? `/players/${playerId}/heroes` : null, TTL.player)
  const recent = useRemote<RecentMatch[]>(validId ? `/players/${playerId}/recentMatches` : null, TTL.player)
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

  const heroMap = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const metricMap = useMemo(() => new Map(meta.metrics.map((metric) => [metric.hero.id, metric])), [meta.metrics])
  const playerHeroMap = useMemo(
    () => new Map((heroes.data ?? []).map((entry) => [entry.hero_id, entry])),
    [heroes.data],
  )
  const rankBracket = profile.data?.rank_tier
    ? Math.min(7, Math.max(1, Math.floor(profile.data.rank_tier / 10)))
    : null
  const bracketLabel = rankBracket
    ? `${rankLabel(rankBracket * 10).replace(/\s+\d+$/, '')} bracket`
    : 'all-rank'

  const recentRows = useMemo(() => {
    return (recent.data ?? []).map((match) => {
      const radiant = match.player_slot < 128
      return { ...match, radiant, won: radiant === match.radiant_win }
    })
  }, [recent.data])

  const recentForm = useMemo(() => {
    const rows = recentRows.slice(0, 10)
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
    const avgGpm = rows.length ? rows.reduce((sum, match) => sum + match.gold_per_min, 0) / rows.length : 0
    const avgXpm = rows.length ? rows.reduce((sum, match) => sum + match.xp_per_min, 0) / rows.length : 0
    return { rows, won, winRate: rows.length ? won / rows.length : null, streak, streakType, avgGpm, avgXpm }
  }, [recentRows])

  const heroRows = useMemo(() => {
    const query = heroFilter.trim().toLowerCase()
    const rows = (heroes.data ?? [])
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
  }, [heroes.data, heroMap, heroFilter, minGames, heroSort])

  const matchRows = useMemo(() => {
    const query = matchHeroFilter.trim().toLowerCase()
    return recentRows.filter((match) => {
      if (resultFilter === 'wins' && !match.won) return false
      if (resultFilter === 'losses' && match.won) return false
      if (query) {
        const hero = heroMap.get(match.hero_id)
        if (!hero?.localized_name.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [recentRows, resultFilter, matchHeroFilter, heroMap])

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
    ;(heroes.data ?? []).forEach((entry) => {
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
  }, [heroes.data, heroMap])

  const laneMix = useMemo(() => {
    const counts = new Map<number, number>()
    recentRows.forEach((match) => {
      if (match.lane_role == null || !LANE_LABELS[match.lane_role]) return
      counts.set(match.lane_role, (counts.get(match.lane_role) ?? 0) + 1)
    })
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
    return [...counts.entries()]
      .map(([lane, count]) => ({ lane, count, share: total ? count / total : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [recentRows])

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
  const wins = wl.data?.win ?? null
  const losses = wl.data?.lose ?? null
  const totalGames = wins != null && losses != null ? wins + losses : null
  const careerWinRate = totalGames ? (wins ?? 0) / totalGames : null
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
          <span className="eyebrow">Last 10</span>
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
          <div className="kpi-top"><span className="kpi-label">Career games</span><History size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{totalGames != null ? formatNumber(totalGames) : '—'}</div>
          <div className="kpi-foot">
            <span>
              {wins != null && losses != null
                ? `${formatNumber(wins)} wins · ${formatNumber(losses)} losses`
                : 'career record unavailable'}
            </span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">Career win rate</span><Target size={16} className="kpi-icon" /></div>
          <div className={classNames('kpi-value', careerWinRate != null && careerWinRate >= 0.5 ? 'text-good' : 'text-bad')}>
            {careerWinRate != null ? formatPercent(careerWinRate) : '—'}
          </div>
          <div className="kpi-foot">
            <span>{totalGames != null ? `across ${formatNumber(totalGames)} recorded games` : 'career record unavailable'}</span>
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
          <div className="kpi-foot"><span>{recentForm.rows.length} match sample · {recentForm.won} wins</span></div>
        </div>
      </div>

      <PerformanceReview matches={recent.data ?? []} />

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <SectionHeading
              eyebrow="Hero pool"
              title="Comfort picks"
              hint={`${formatNumber(heroes.data?.length ?? 0)} heroes played`}
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

            {heroes.loading && !heroes.data ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span className="skeleton" key={key} style={{ height: 40 }} />)}</div>
            ) : heroes.error && !heroes.data ? (
              <ErrorState error={heroes.error} onRetry={heroes.refresh} title="Hero pool unavailable" />
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
              Hero grades follow the current meta lens. The +/− compares this player's hero win rate with
              OpenDota's {bracketLabel} baseline; hover for the exact rates and sample.
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
              hint={`${formatNumber(matchRows.length)} shown`}
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
              <span className="muted-label"><Clock3 size={13} /> OpenDota returns the latest 20 parsed matches</span>
            </div>

            {recent.loading && !recent.data ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span className="skeleton" key={key} style={{ height: 44 }} />)}</div>
            ) : recent.error && !recent.data ? (
              <ErrorState error={recent.error} onRetry={recent.refresh} title="Recent matches unavailable" />
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
                      <th className="num">GPM / XPM</th>
                      <th className="num">LH / DN</th>
                      <th className="num">Hero dmg</th>
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
                          <td className="num mono">{match.gold_per_min} / {match.xp_per_min}</td>
                          <td className="num mono">{match.last_hits} / {match.denies ?? 0}</td>
                          <td className="num mono">{formatCompact(match.hero_damage)}</td>
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
            <SectionHeading eyebrow="Career record" title="Win / loss" />
            {wl.loading && !wl.data ? (
              <span className="skeleton" style={{ height: 84 }} />
            ) : wl.error && !wl.data ? (
              <ErrorState error={wl.error} onRetry={wl.refresh} title="Record unavailable" />
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
            <p className="panel-footnote">Derived from OpenDota lane_role in the latest 20 matches.</p>
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
