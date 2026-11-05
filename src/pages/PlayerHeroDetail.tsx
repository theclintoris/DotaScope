import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Crosshair,
  PackageOpen,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import type {
  ItemConstants,
  MatchDetail,
  MatchPlayer,
  PlayerHero,
  PlayerMatch,
  PlayerProfile,
  PlayerWinLoss,
  RecentMatch,
} from '../types'
import { useMeta } from '../context/MetaContext'
import { fetchMatch, TTL } from '../lib/api'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { mergeRecentWithTurbo, useTurboHistory } from '../lib/turboHistory'
import {
  MATCH_MODE_COPY,
  heroPoolFromRecent,
  matchWon,
  recordFromMatches,
  type MatchSummary,
} from '../lib/matchMode'
import {
  ATTR_MAP,
  gameModeName,
  heroImage,
  itemImage,
  rankLabel,
} from '../lib/constants'
import {
  classNames,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUnixTime,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  KpiCard,
  PageLoader,
  PlayerAvatar,
  RankBadge,
  SectionHeading,
} from '../components/ui'

const HISTORY_LIMIT = 1000
const BUILD_SAMPLE = 6
const PAGE_SIZE = 25
type ResultFilter = 'all' | 'wins' | 'losses'

type BuildRow = {
  summary: MatchSummary
  detail: MatchDetail
  me: MatchPlayer
  won: boolean
}

export function PlayerHeroDetailPage() {
  const { playerId, heroId } = useParams()
  const validPlayer = Boolean(playerId && /^\d{1,12}$/.test(playerId))
  const heroNumber = Number(heroId)
  const validHero = Number.isInteger(heroNumber) && heroNumber > 0
  const meta = useMeta()
  const matchMode = meta.matchMode
  const modeCopy = MATCH_MODE_COPY[matchMode]
  const profile = useRemote<PlayerProfile>(validPlayer ? `/players/${playerId}` : null, TTL.player)
  const wl = useRemote<PlayerWinLoss>(validPlayer ? `/players/${playerId}/wl` : null, TTL.player)
  const wlRanked = useRemote<PlayerWinLoss>(
    validPlayer ? `/players/${playerId}/wl?lobby_type=7` : null,
    TTL.player,
  )
  const playerHeroes = useRemote<PlayerHero[]>(validPlayer ? `/players/${playerId}/heroes` : null, TTL.player)
  const rankedHeroes = useRemote<PlayerHero[]>(
    validPlayer ? `/players/${playerId}/heroes?lobby_type=7` : null,
    TTL.player,
  )
  const recent = useRemote<RecentMatch[]>(
    validPlayer ? `/players/${playerId}/recentMatches` : null,
    TTL.player,
  )
  const turboHistory = useTurboHistory(validPlayer ? Number(playerId) : null)
  const allRecent = useMemo(
    () => mergeRecentWithTurbo(recent.data ?? undefined, turboHistory.rows),
    [recent.data, turboHistory.rows],
  )
  const history = useRemote<PlayerMatch[]>(
    validPlayer && validHero
      ? `/players/${playerId}/matches?hero_id=${heroNumber}&limit=${HISTORY_LIMIT}`
      : null,
    TTL.player,
  )
  const itemConstants = useRemote<ItemConstants>('/constants/items', TTL.constants)

  const hero = useMemo(
    () => meta.heroes.find((entry) => entry.id === heroNumber),
    [meta.heroes, heroNumber],
  )
  const turboHeroRows = useMemo(
    () => allRecent.filter((entry) => entry.hero_id === heroNumber && entry.game_mode === 23),
    [allRecent, heroNumber],
  )
  const aggregate = useMemo(() => {
    if (matchMode === 'turbo') {
      return heroPoolFromRecent(turboHeroRows, 'turbo')[0]
    }
    const base = matchMode === 'ranked'
      ? rankedHeroes.data?.find((entry) => entry.hero_id === heroNumber)
      : playerHeroes.data?.find((entry) => entry.hero_id === heroNumber)
    if (matchMode === 'ranked') return base
    const turbo = heroPoolFromRecent(turboHeroRows, 'turbo')[0]
    if (!base) return turbo
    if (!turbo) return base
    return {
      ...base,
      games: base.games + turbo.games,
      win: base.win + turbo.win,
      last_played: Math.max(base.last_played, turbo.last_played),
    }
  }, [matchMode, playerHeroes.data, rankedHeroes.data, turboHeroRows, heroNumber])
  const player = profile.data?.profile
  const rankTier = profile.data?.rank_tier ?? null
  const rank = rankTier ? rankLabel(rankTier) : 'Unranked'

  const rows = useMemo(() => {
    const regular = history.data ?? []
    const rankedHistory = regular.filter((entry) => entry.lobby_type === 7)
    const source = matchMode === 'ranked'
      ? rankedHistory
      : matchMode === 'turbo'
        ? turboHeroRows
        : [...regular, ...turboHeroRows]
    const unique = new Map<number, MatchSummary>()
    source.forEach((entry) => unique.set(entry.match_id, entry))
    return [...unique.values()].sort((a, b) => b.start_time - a.start_time)
  }, [history.data, matchMode, turboHeroRows])
  const enrichedRows = useMemo(() => rows.slice(0, BUILD_SAMPLE), [rows])
  const detailKey = useMemo(
    () => enrichedRows.map((entry) => entry.match_id).join(','),
    [enrichedRows],
  )
  const [details, setDetails] = useState<Record<number, MatchDetail>>({})
  const [buildsLoading, setBuildsLoading] = useState(false)
  const [buildsError, setBuildsError] = useState<string | null>(null)
  const [historyLimit, setHistoryLimit] = useState(PAGE_SIZE)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')

  useEffect(() => {
    setHistoryLimit(PAGE_SIZE)
    setResultFilter('all')
  }, [matchMode, heroNumber, playerId])

  useEffect(() => {
    if (!enrichedRows.length) {
      setDetails({})
      setBuildsError(null)
      return
    }
    let cancelled = false
    setBuildsLoading(true)
    setBuildsError(null)
    Promise.all(
      enrichedRows.map(async (entry) => {
        try {
          return [entry.match_id, await fetchMatch(String(entry.match_id))] as const
        } catch {
          return [entry.match_id, null] as const
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<number, MatchDetail> = {}
      let failures = 0
      entries.forEach(([matchId, detail]) => {
        if (detail) next[matchId] = detail
        else failures += 1
      })
      setDetails(next)
      setBuildsError(
        failures
          ? `Item data was unavailable for ${failures} of ${entries.length} recent matches.`
          : null,
      )
    }).finally(() => {
      if (!cancelled) setBuildsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [detailKey, enrichedRows.length])

  const itemsById = useMemo(() => {
    const map = new Map<number, { id: number; dname: string; img: string }>()
    Object.values(itemConstants.data ?? {}).forEach((item) => map.set(item.id, item))
    return map
  }, [itemConstants.data])

  const buildRows = useMemo<BuildRow[]>(() => {
    return enrichedRows.flatMap((summary) => {
      const detail = details[summary.match_id]
      if (!detail) return []
      const me =
        detail.players.find((entry) => entry.account_id === Number(playerId)) ??
        detail.players.find((entry) => entry.player_slot === summary.player_slot)
      if (!me) return []
      const radiant = summary.player_slot < 128
      return [{
        summary,
        detail,
        me,
        won: radiant === summary.radiant_win,
      }]
    })
  }, [details, enrichedRows, playerId])

  const stats = useMemo(() => {
    const games = aggregate?.games ?? rows.length
    const wins = aggregate?.win ?? rows.filter(matchWon).length
    const heroWinRate = games ? wins / games : null
    const recentGames = rows.slice(0, 10)
    const recentWins = recentGames.filter(matchWon).length
    const avgKda = recentGames.length
      ? recentGames.reduce((sum, entry) => sum + (entry.kills + entry.assists) / Math.max(entry.deaths, 1), 0) / recentGames.length
      : null
    const avgDuration = recentGames.length
      ? recentGames.reduce((sum, entry) => sum + entry.duration, 0) / recentGames.length
      : null
    const partyGames = recentGames.filter((entry) => (entry.party_size ?? 1) > 1).length
    const record = matchMode === 'ranked'
      ? wlRanked.data
      : matchMode === 'turbo'
        ? recordFromMatches(allRecent, 'turbo')
        : wl.data
    const careerGames = (record?.win ?? 0) + (record?.lose ?? 0)
    const careerWinRate = careerGames ? (record?.win ?? 0) / careerGames : null
    const delta = heroWinRate != null && careerWinRate != null ? heroWinRate - careerWinRate : null
    return {
      games,
      wins,
      heroWinRate,
      recent: recentGames,
      recentWins,
      recentWinRate: recentGames.length ? recentWins / recentGames.length : null,
      avgKda,
      avgDuration,
      partyShare: recentGames.length ? partyGames / recentGames.length : 0,
      careerWinRate,
      delta,
      lastPlayed: aggregate?.last_played ?? rows[0]?.start_time,
    }
  }, [aggregate, rows, allRecent, wl.data, wlRanked.data, matchMode])

  const historyLoading = matchMode === 'turbo'
    ? recent.loading && !recent.data
    : history.loading && !history.data
  const historyError = matchMode === 'turbo'
    ? recent.error
    : history.error
  const historyRefresh = matchMode === 'turbo' ? recent.refresh : history.refresh

  const formPips = stats.recent.map((entry) => ({
    won: matchWon(entry),
    id: entry.match_id,
  }))

  const slotItems = useMemo(() => {
    const maps = Array.from({ length: 6 }, () => new Map<number, number>())
    buildRows.forEach(({ me }) => {
      ;[me.item_0, me.item_1, me.item_2, me.item_3, me.item_4, me.item_5].forEach((itemId, index) => {
        if (!itemId) return
        maps[index].set(itemId, (maps[index].get(itemId) ?? 0) + 1)
      })
    })
    return maps.map((counts) =>
      [...counts.entries()]
        .map(([itemId, count]) => ({ item: itemsById.get(itemId), count }))
        .sort((a, b) => b.count - a.count),
    )
  }, [buildRows, itemsById])

  const topItems = useMemo(() => {
    const counts = new Map<number, number>()
    buildRows.forEach(({ me }) => {
      ;[me.item_0, me.item_1, me.item_2, me.item_3, me.item_4, me.item_5].forEach((itemId) => {
        if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
      })
    })
    return [...counts.entries()]
      .map(([itemId, count]) => ({ item: itemsById.get(itemId), itemId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [buildRows, itemsById])

  const filteredHistory = useMemo(() => {
    return rows.filter((entry) => {
      if (resultFilter === 'all') return true
      const won = (entry.player_slot < 128) === entry.radiant_win
      return resultFilter === 'wins' ? won : !won
    })
  }, [rows, resultFilter])

  useDocumentTitle(
    hero && player
      ? `${hero.localized_name} · ${player.personaname}`
      : 'Player hero dossier',
  )

  if (!validPlayer || !validHero) {
    return (
      <div className="page-stack">
        <Link to="/players" className="back-link"><ArrowLeft size={14} /> Player directory</Link>
        <EmptyState
          title="Invalid dossier"
          icon={<Crosshair size={22} />}
          action={<Link className="btn btn-ghost btn-sm" to="/players">Find a player</Link>}
        >
          Pick a player and choose a hero from their hero pool to open a hero-specific dossier.
        </EmptyState>
      </div>
    )
  }

  if ((profile.loading || meta.loading) && !profile.data) {
    return <PageLoader label="Opening player hero dossier…" />
  }

  if (profile.error && !profile.data) {
    return (
      <div className="page-stack">
        <Link to="/players" className="back-link"><ArrowLeft size={14} /> Player directory</Link>
        <ErrorState error={profile.error} onRetry={profile.refresh} title="Player dossier unavailable" />
      </div>
    )
  }

  if (!hero) {
    return (
      <div className="page-stack">
        <Link to={playerId ? `/players/${playerId}` : '/players'} className="back-link"><ArrowLeft size={14} /> Player dossier</Link>
        <EmptyState
          title="Unknown hero"
          icon={<Crosshair size={22} />}
          action={<Link className="btn btn-ghost btn-sm" to={playerId ? `/players/${playerId}` : '/players'}>Back to player</Link>}
        >
          This hero ID does not match the current Dota roster.
        </EmptyState>
      </div>
    )
  }

  const attr = ATTR_MAP[hero.primary_attr]
  const bannerStyle = { '--hero-attr': attr.color } as CSSProperties
  const firstGame = rows[rows.length - 1]

  return (
    <div className="page-stack player-hero-page">
      <div className="player-hero-backrow">
        <Link to={`/players/${playerId}`} className="back-link">
          <ArrowLeft size={14} /> {player?.personaname || 'Player dossier'}
        </Link>
        <Link to={`/heroes/${hero.id}`} className="text-link">
          Open the global hero page <ArrowUpRight size={13} />
        </Link>
      </div>

      <section className="hero-banner ph-banner" style={bannerStyle}>
        <div className="hero-banner-image">
          <img src={heroImage(hero.img)} alt={hero.localized_name} />
          <span className="hero-banner-fade" />
        </div>
        <div className="hero-banner-content">
          <div className="hero-banner-topline">
            <span className="eyebrow">Player hero dossier</span>
            <span className="badge badge-muted">{attr.short} · {hero.attack_type}</span>
          </div>
          <h1>{hero.localized_name}</h1>
          <div className="ph-player-line">
            <PlayerAvatar src={player?.avatarfull} name={player?.personaname ?? 'Player'} size="sm" />
            <strong>{player?.personaname || `Account ${playerId}`}</strong>
            <span className="muted-label">#{playerId}</span>
            <RankBadge rankTier={rankTier} size="sm" />
            <span className="muted-label">{rank}</span>
          </div>
          <div className="hero-banner-roles">
            {hero.roles.slice(0, 5).map((role) => <span key={role}>{role}</span>)}
          </div>
          <div className="hero-banner-actions">
            <Link className="btn btn-ghost btn-sm" to={`/players/${playerId}`}>
              <ArrowLeft size={14} /> Player dossier
            </Link>
            <a className="btn btn-ghost btn-sm" href={`https://www.opendota.com/players/${playerId}`} target="_blank" rel="noreferrer">
              OpenDota profile <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
        <div className="hero-banner-score">
          <div className="score-ring score-ring-lg" style={{ '--score': `${(stats.heroWinRate ?? 0) * 360}deg` } as CSSProperties}>
            <span>
              <strong>{stats.heroWinRate != null ? formatPercent(stats.heroWinRate, 0) : '—'}</strong>
              <small>WR</small>
            </span>
          </div>
        </div>
      </section>

      <div className="kpi-grid">
        <KpiCard label="Games on hero" value={formatNumber(stats.games)} icon={<Crosshair size={16} />} foot={`${formatNumber(stats.wins)} wins`} />
        <KpiCard label="Hero win rate" value={stats.heroWinRate != null ? formatPercent(stats.heroWinRate) : '—'} icon={<TrendingUp size={16} />} foot={stats.delta != null ? `${stats.delta >= 0 ? '+' : ''}${(stats.delta * 100).toFixed(1)} pts vs ${matchMode === 'ranked' ? 'ranked' : matchMode === 'turbo' ? 'Turbo sample' : 'career'}` : `${matchMode === 'ranked' ? 'Ranked' : matchMode === 'turbo' ? 'Turbo sample' : 'Career'} comparison unavailable`} tone={stats.delta != null && stats.delta > 0.02 ? 'good' : stats.delta != null && stats.delta < -0.02 ? 'bad' : 'default'} />
        <KpiCard label="Last 10 games" value={stats.recentWinRate != null ? formatPercent(stats.recentWinRate) : '—'} icon={<Swords size={16} />} foot={`${stats.recentWins}-${stats.recent.length - stats.recentWins} record`} />
        <KpiCard label="Average KDA" value={stats.avgKda != null ? stats.avgKda.toFixed(2) : '—'} icon={<Target size={16} />} foot="latest 10 matches" tone="accent" />
      </div>

      <div className="detail-layout ph-layout">
        <div className="detail-main">
          <section className="panel ph-form-panel">
            <SectionHeading
              eyebrow="Performance"
              title="Recent form"
              hint={`${formatNumber(rows.length)} ${modeCopy.short} matches loaded`}
            />
            <div className="ph-form-pips">
              <div className="form-pips">
                {formPips.map((pip) => (
                  <span key={pip.id} className={classNames('form-pip', pip.won ? 'is-win' : 'is-loss')} title={pip.won ? 'Win' : 'Loss'} />
                ))}
                {!formPips.length && <span className="muted-copy">No recent matches returned.</span>}
              </div>
              <span className="muted-label"><Clock3 size={13} /> Latest 10 {modeCopy.short.toLowerCase()} games</span>
            </div>
            <div className="ph-stat-grid">
              <div><span>Record</span><strong>{formatNumber(stats.wins)}–{formatNumber(stats.games - stats.wins)}</strong></div>
              <div><span>Avg length</span><strong>{stats.avgDuration ? formatDuration(stats.avgDuration) : '—'}</strong></div>
              <div><span>In a party</span><strong>{formatPercent(stats.partyShare, 0)}</strong></div>
              <div><span>Last played</span><strong>{stats.lastPlayed ? formatUnixTime(stats.lastPlayed) : '—'}</strong></div>
            </div>
            <p className="panel-footnote">
              {matchMode === 'ranked'
                ? 'Ranked career hero totals and the latest ten ranked games from OpenDota.'
                : matchMode === 'turbo'
                  ? 'Turbo sample only: OpenDota exposes Turbo games in the latest 20-match feed.'
                  : 'OpenDota ranked hero history plus the latest Turbo sample.'}
            </p>
          </section>

          <section className="panel ph-build-panel">
            <SectionHeading
              eyebrow="Item telemetry"
              title="Recent builds"
              hint={buildsLoading ? 'Loading parsed inventories…' : `${buildRows.length} parsed maps`}
            />
            {buildsLoading && !buildRows.length ? (
              <div className="build-grid">
                {Array.from({ length: 3 }, (_, index) => <span key={index} className="skeleton build-skeleton" />)}
              </div>
            ) : buildRows.length ? (
              <div className="build-grid">
                {buildRows.map((row) => (
                  <Link to={`/matches/${row.summary.match_id}`} className={classNames('build-card', row.won ? 'is-win' : 'is-loss')} key={row.summary.match_id}>
                    <div className="build-card-top">
                      <span className={classNames('build-result', row.won ? 'text-good' : 'text-bad')}>{row.won ? 'Win' : 'Loss'}</span>
                      <span className="mono">{formatDuration(row.summary.duration)}</span>
                    </div>
                    <div className="build-kda">
                      <strong>{row.summary.kills} / {row.summary.deaths} / {row.summary.assists}</strong>
                      <span>K / D / A</span>
                    </div>
                    <div className="build-items">
                      {[row.me.item_0, row.me.item_1, row.me.item_2, row.me.item_3, row.me.item_4, row.me.item_5].map((itemId, slot) => (
                        <BuildItem key={`${row.summary.match_id}-${slot}`} itemId={itemId} itemsById={itemsById} />
                      ))}
                      {row.me.item_neutral ? (
                        <span className="build-neutral">
                          <BuildItem itemId={row.me.item_neutral} itemsById={itemsById} />
                        </span>
                      ) : null}
                    </div>
                    <div className="build-foot">
                      <span>{row.me.gold_per_min} GPM</span>
                      <span>{row.me.xp_per_min} XPM</span>
                      <span>{row.me.last_hits}/{row.me.denies} LH</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No parsed inventories yet" icon={<PackageOpen size={20} />}>
                Item builds need parsed match detail. Open an individual match to see the full scoreboard.
              </EmptyState>
            )}
            {buildsError && <p className="inline-alert">{buildsError}</p>}
            <p className="panel-footnote">
              Final six-slot inventories from the latest {Math.min(BUILD_SAMPLE, rows.length) || BUILD_SAMPLE} parsed matches. These are outcomes, not a recommended build order.
            </p>
          </section>

          <section className="panel ph-history-panel">
            <SectionHeading
              eyebrow="Match archive"
              title="Full match history"
              hint={`${formatNumber(filteredHistory.length)} games`}
              action={
                <div className="segmented segmented-sm">
                  {(['all', 'wins', 'losses'] as ResultFilter[]).map((value) => (
                    <button
                      key={value}
                      className={resultFilter === value ? 'is-active' : ''}
                      onClick={() => { setResultFilter(value); setHistoryLimit(PAGE_SIZE) }}
                    >
                      {value === 'all' ? 'All' : value === 'wins' ? 'Wins' : 'Losses'}
                    </button>
                  ))}
                </div>
              }
            />
            {historyLoading ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span key={key} className="skeleton" style={{ height: 44 }} />)}</div>
            ) : historyError && !rows.length ? (
              <ErrorState error={historyError} onRetry={historyRefresh} title="History unavailable" />
            ) : !filteredHistory.length ? (
              <EmptyState title="No matches in this slice" icon={<Swords size={20} />}>
                Change the result filter or open a different hero.
              </EmptyState>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="data-table player-hero-history">
                    <thead>
                      <tr>
                        <th>Result</th>
                        <th>K / D / A</th>
                        <th className="num">Party</th>
                        <th>Mode</th>
                        <th className="num">Length</th>
                        <th className="num">Played</th>
                        <th>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.slice(0, historyLimit).map((entry) => {
                        const won = (entry.player_slot < 128) === entry.radiant_win
                        return (
                          <tr key={entry.match_id} className={won ? 'row-win' : 'row-loss'}>
                            <td><span className={classNames('build-result', won ? 'text-good' : 'text-bad')}>{won ? 'Win' : 'Loss'}</span></td>
                            <td className="mono">{entry.kills} / {entry.deaths} / {entry.assists}</td>
                            <td className="num mono">{entry.party_size && entry.party_size > 1 ? `Party ${entry.party_size}` : 'Solo'}</td>
                            <td className="muted-label">{gameModeName(entry.game_mode)}</td>
                            <td className="num mono">{formatDuration(entry.duration)}</td>
                            <td className="num muted-label">{formatUnixTime(entry.start_time)}</td>
                            <td><Link className="text-link" to={`/matches/${entry.match_id}`}>Open <ArrowUpRight size={13} /></Link></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredHistory.length > historyLimit && (
                  <div className="load-more-row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setHistoryLimit((limit) => limit + PAGE_SIZE)}>
                      Load more matches <span>{formatNumber(filteredHistory.length - historyLimit)} remaining</span>
                    </button>
                  </div>
                )}
              </>
            )}
            <p className="panel-footnote">
              {rows.length < stats.games
                ? `Showing the latest ${formatNumber(rows.length)} of ${formatNumber(stats.games)} games; older public matches may be unavailable.`
                : `All ${formatNumber(rows.length)} public matches returned for this hero.`}
              {firstGame ? ` Archive reaches back to ${formatUnixTime(firstGame.start_time)}.` : ''}
            </p>
          </section>
        </div>

        <div className="detail-side">
          <section className="panel ph-inventory-panel">
            <SectionHeading eyebrow="Final inventory" title="Typical build" hint={`${buildRows.length} maps`} />
            {buildRows.length ? (
              <>
                <div className="inventory-grid">
                  {slotItems.map((slot, index) => {
                    const top = slot[0]
                    return (
                      <div className="inventory-slot" key={index} title={slot.slice(0, 3).map((entry) => `${entry.item?.dname ?? `Item ${entry.count}`}: ${entry.count}`).join(' · ')}>
                        {top?.item ? <img src={itemImage(top.item.img)} alt={top.item.dname} loading="lazy" /> : <span className="inventory-empty" />}
                        {top ? <span className="inventory-count">{top.count}×</span> : null}
                      </div>
                    )
                  })}
                </div>
                <div className="top-item-list">
                  {topItems.map(({ item, itemId, count }) => (
                    <span className="top-item" key={itemId} title={`${item?.dname ?? `Item ${itemId}`} · ${count} appearances`}>
                      {item ? <img src={itemImage(item.img)} alt={item.dname} loading="lazy" /> : <span className="inventory-empty" />}
                      <small>{count}×</small>
                    </span>
                  ))}
                </div>
                <p className="panel-footnote">Most frequent final-slot items across the sampled parsed maps.</p>
              </>
            ) : (
              <span className="muted-copy">Item samples appear once recent parsed matches load.</span>
            )}
          </section>

          <section className="panel ph-record-panel">
            <SectionHeading eyebrow="Hero record" title="Win / loss" />
            <div className="wl-numbers">
              <div><strong className="text-good">{formatNumber(stats.wins)}</strong><span>Wins</span></div>
              <div><strong className="text-bad">{formatNumber(stats.games - stats.wins)}</strong><span>Losses</span></div>
            </div>
            <div className="wl-bar">
              <span className="wl-bar-win" style={{ width: `${(stats.heroWinRate ?? 0) * 100}%` }} />
            </div>
            <div className="wl-caption">
              <span>{stats.heroWinRate != null ? formatPercent(stats.heroWinRate) : '—'} on this hero</span>
              <span>{formatNumber(stats.games)} games</span>
            </div>
            <div className="fact-list">
              <div><span>{matchMode === 'ranked' ? 'Ranked career win rate' : matchMode === 'turbo' ? 'Turbo sample win rate' : 'Career win rate'}</span><strong>{stats.careerWinRate != null ? formatPercent(stats.careerWinRate) : '—'}</strong></div>
              <div><span>Delta vs {matchMode === 'ranked' ? 'ranked' : matchMode === 'turbo' ? 'sample' : 'career'}</span><strong className={stats.delta == null ? '' : stats.delta >= 0 ? 'text-good' : 'text-bad'}>{stats.delta != null ? `${stats.delta >= 0 ? '+' : ''}${(stats.delta * 100).toFixed(1)} pts` : '—'}</strong></div>
              <div><span>Last played</span><strong>{stats.lastPlayed ? formatUnixTime(stats.lastPlayed) : '—'}</strong></div>
            </div>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Sample" title="What's included" />
            <div className="fact-list">
              <div><span>Aggregate</span><strong>{matchMode === 'ranked' ? 'Ranked career' : matchMode === 'turbo' ? 'Latest 20 Turbo' : 'Career + Turbo sample'}</strong></div>
              <div><span>History</span><strong>{formatNumber(rows.length)} rows</strong></div>
              <div><span>Build sample</span><strong>{buildRows.length} maps</strong></div>
              <div><span>Rank context</span><strong>{rank}</strong></div>
            </div>
            <p className="panel-footnote">
              OpenDota only exposes parsed public games. Private, unparsed and some archived matches are omitted.
              {matchMode === 'turbo' ? ' Turbo history is limited to the latest 20-match sample.' : ''}
            </p>
          </section>

          <div className="aside-note">
            <Shield size={14} />
            <p>
              Performance is computed from public OpenDota data. Item builds are final inventories, not purchase order.
            </p>
          </div>
          <div className="aside-note">
            <Users size={14} />
            <p>
              Open {player?.personaname || 'this player'}'s full dossier for career totals, friends and recent match form.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuildItem({
  itemId,
  itemsById,
}: {
  itemId: number
  itemsById: Map<number, { id: number; dname: string; img: string }>
}) {
  if (!itemId) return <span className="build-item build-item-empty" />
  const item = itemsById.get(itemId)
  return (
    <span className="build-item" title={item?.dname ?? `Item ${itemId}`}>
      {item?.img ? <img src={itemImage(item.img)} alt={item.dname} loading="lazy" /> : <span className="item-id">{itemId}</span>}
    </span>
  )
}
