import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Filter,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import type { ProMatch, PublicMatch } from '../types'
import { TTL } from '../lib/api'
import { useDebouncedValue, useDocumentTitle, useRemote } from '../lib/hooks'
import {
  GAME_MODE_FILTERS,
  LOBBY_FILTERS,
  gameModeName,
  lobbyName,
  rankMedal,
} from '../lib/constants'
import {
  classNames,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUnixTime,
  timeAgo,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  SectionHeading,
  TeamBadge,
} from '../components/ui'

type Tab = 'pro' | 'public'
type ProSort = 'newest' | 'longest' | 'closest'
type WindowFilter = 'all' | '24h' | '7d'

export function MatchesPage() {
  useDocumentTitle('Matches')
  const [tab, setTab] = useState<Tab>('pro')
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('all')
  const [lobby, setLobby] = useState('all')
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all')
  const [proSort, setProSort] = useState<ProSort>('newest')
  const [rankFilter, setRankFilter] = useState('all')
  const [visible, setVisible] = useState(24)
  const debouncedSearch = useDebouncedValue(search, 220)

  const pro = useRemote<ProMatch[]>('/proMatches', TTL.feed)
  const pubs = useRemote<PublicMatch[]>('/publicMatches', TTL.feed)

  const proRows = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    const query = debouncedSearch.trim().toLowerCase()
    const rows = (pro.data ?? []).filter((match) => {
      if (windowFilter !== 'all') {
        const hours = windowFilter === '24h' ? 24 : 24 * 7
        if (now - match.start_time > hours * 3600) return false
      }
      if (query) {
        const haystack = `${match.match_id} ${match.radiant_name ?? ''} ${match.dire_name ?? ''} ${match.league_name ?? ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
    return rows.sort((a, b) => {
      if (proSort === 'longest') return b.duration - a.duration
      if (proSort === 'closest') {
        return Math.abs(a.radiant_score - a.dire_score) - Math.abs(b.radiant_score - b.dire_score)
      }
      return b.start_time - a.start_time
    })
  }, [pro.data, debouncedSearch, windowFilter, proSort])

  const publicRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    return (pubs.data ?? [])
      .filter((match) => {
        if (mode !== 'all' && match.game_mode !== Number(mode)) return false
        if (lobby !== 'all' && match.lobby_type !== Number(lobby)) return false
        if (rankFilter !== 'all') {
          const rank = match.avg_rank_tier ? Math.floor(match.avg_rank_tier / 10) : 0
          if (rank !== Number(rankFilter)) return false
        }
        if (query && !String(match.match_id).includes(query)) return false
        return true
      })
      .sort((a, b) => b.start_time - a.start_time)
  }, [pubs.data, debouncedSearch, mode, lobby, rankFilter])

  const activeRows = tab === 'pro' ? proRows : publicRows
  const active = tab === 'pro' ? pro : pubs
  const filtersActive =
    Boolean(search) ||
    windowFilter !== 'all' ||
    (tab === 'public' && (mode !== 'all' || lobby !== 'all' || rankFilter !== 'all'))

  const summary = useMemo(() => {
    if (tab === 'pro') {
      const rows = pro.data ?? []
      const totalDuration = rows.reduce((sum, match) => sum + match.duration, 0)
      const radiantWins = rows.filter((match) => match.radiant_win).length
      return [
        { label: 'Pro matches', value: formatNumber(rows.length), foot: 'latest feed' },
        {
          label: 'Average length',
          value: rows.length ? formatDuration(Math.round(totalDuration / rows.length)) : '—',
          foot: 'parsed games',
        },
        {
          label: 'Radiant win rate',
          value: rows.length ? formatPercent(radiantWins / rows.length) : '—',
          foot: `${radiantWins} radiant wins`,
        },
        { label: 'Visible now', value: formatNumber(activeRows.length), foot: 'after filters' },
      ]
    }
    const rows = pubs.data ?? []
    const totalDuration = rows.reduce((sum, match) => sum + match.duration, 0)
    const rad = rows.filter((match) => match.radiant_win).length
    return [
      { label: 'Public matches', value: formatNumber(rows.length), foot: 'latest sample' },
      {
        label: 'Average length',
        value: rows.length ? formatDuration(Math.round(totalDuration / rows.length)) : '—',
        foot: 'unparsed games',
      },
      {
        label: 'Radiant win rate',
        value: rows.length ? formatPercent(rad / rows.length) : '—',
        foot: `${rad} radiant wins`,
      },
      { label: 'Visible now', value: formatNumber(activeRows.length), foot: 'after filters' },
    ]
  }, [tab, pro.data, pubs.data, activeRows.length])

  const resetFilters = () => {
    setSearch('')
    setMode('all')
    setLobby('all')
    setRankFilter('all')
    setWindowFilter('all')
    setProSort('newest')
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Match intelligence"
        title="Match explorer"
        description="Track the professional circuit and the live public queue. Filter the latest OpenDota sample, then open any match for a full scoreboard."
        actions={
          <button className="btn btn-ghost" onClick={() => active.refresh()} disabled={active.loading}>
            <RefreshCw size={14} className={active.loading ? 'spin' : undefined} /> Refresh feed
          </button>
        }
      />

      <section className="feed-summary">
        {summary.map((item) => (
          <div className="feed-summary-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.foot}</small>
          </div>
        ))}
      </section>

      <div className="feed-tabs">
        <button
          className={classNames('feed-tab', tab === 'pro' && 'is-active')}
          onClick={() => {
            setTab('pro')
            setSearch('')
            setMode('all')
            setLobby('all')
            setRankFilter('all')
            setWindowFilter('all')
            setVisible(24)
          }}
        >
          <Trophy size={15} /> Pro scene <span>{formatNumber(pro.data?.length ?? 0)}</span>
        </button>
        <button
          className={classNames('feed-tab', tab === 'public' && 'is-active')}
          onClick={() => {
            setTab('public')
            setSearch('')
            setMode('all')
            setLobby('all')
            setRankFilter('all')
            setWindowFilter('all')
            setVisible(24)
          }}
        >
          <Radio size={15} /> Public queue <span>{formatNumber(pubs.data?.length ?? 0)}</span>
        </button>
        <span className="feed-live">
          <span className="live-dot" /> OpenDota feed
        </span>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setVisible(24)
            }}
            placeholder={tab === 'pro' ? 'Search teams, league, match ID…' : 'Search match ID…'}
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>
        {tab === 'public' && (
          <label className="select-field">
            <span>Mode</span>
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value)
                setVisible(24)
              }}
            >
              <option value="all">All modes</option>
              {GAME_MODE_FILTERS.map((entry) => (
                <option value={entry.value} key={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === 'pro' ? (
          <>
            <label className="select-field">
              <span>Window</span>
              <select value={windowFilter} onChange={(event) => setWindowFilter(event.target.value as WindowFilter)}>
                <option value="all">All feed</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
            </label>
            <label className="select-field">
              <span>Sort</span>
              <select value={proSort} onChange={(event) => setProSort(event.target.value as ProSort)}>
                <option value="newest">Newest first</option>
                <option value="longest">Longest match</option>
                <option value="closest">Closest score</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="select-field">
              <span>Lobby</span>
              <select value={lobby} onChange={(event) => setLobby(event.target.value)}>
                <option value="all">All lobbies</option>
                {LOBBY_FILTERS.map((entry) => (
                  <option value={entry.value} key={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>Average rank</span>
              <select value={rankFilter} onChange={(event) => setRankFilter(event.target.value)}>
                <option value="all">Any rank</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((tier) => (
                  <option value={tier} key={tier}>
                    {rankMedal(tier * 10).label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {filtersActive && (
          <button className="btn btn-ghost btn-sm filter-reset" onClick={resetFilters}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {active.loading && !active.data ? (
        <PageLoader label={tab === 'pro' ? 'Loading pro matches…' : 'Loading public matches…'} />
      ) : active.error && !active.data ? (
        <ErrorState error={active.error} onRetry={active.refresh} title="Match feed unavailable" />
      ) : activeRows.length === 0 ? (
        <EmptyState
          title="No matches match these filters"
          icon={<Filter size={22} />}
          action={
            <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
              Clear all filters
            </button>
          }
        >
          The latest OpenDota feed has no rows matching the current query. Try widening the time window or
          clearing the search.
        </EmptyState>
      ) : tab === 'pro' ? (
        <div className="match-feed">
          {(activeRows as ProMatch[]).slice(0, visible).map((match) => (
            <ProMatchCard match={match} key={match.match_id} />
          ))}
          {visible < activeRows.length && (
            <div className="load-more-row">
              <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 24)}>
                Load more <span>{formatNumber(activeRows.length - visible)} remaining</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="public-grid">
          {(activeRows as PublicMatch[]).slice(0, visible).map((match) => (
            <PublicMatchCard match={match} key={match.match_id} />
          ))}
          {visible < activeRows.length && (
            <div className="load-more-row public-load-more">
              <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 24)}>
                Load more <span>{formatNumber(activeRows.length - visible)} remaining</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="split-panels">
        <section className="panel">
          <SectionHeading eyebrow="Reading the feed" title="What this sample is" />
          <p className="muted-copy">
            OpenDota exposes the most recent 100 pro matches and 100 public matches. The feed is not a complete
            archive: pro rows include league and team metadata, while public rows expose only an average rank
            tier and mode. Both link to the full parsed match page.
          </p>
        </section>
        <section className="panel">
          <SectionHeading eyebrow="Need a specific game" title="Jump by match ID" />
          <p className="muted-copy">
            Every match ID can be opened directly. Use the command palette, or navigate to a URL such as
            <code className="inline-code"> /matches/8840000000</code>.
          </p>
        </section>
      </div>
    </div>
  )
}

function ProMatchCard({ match }: { match: ProMatch }) {
  return (
    <Link to={`/matches/${match.match_id}`} className="pro-match-card">
      <div className="pro-match-top">
        <span className="league-label">
          <Trophy size={12} /> {match.league_name || 'Professional match'}
        </span>
        <span className="match-top-right">
          #{match.match_id} · {timeAgo(match.start_time)}
        </span>
      </div>
      <div className="pro-match-body">
        <div className={classNames('match-team', match.radiant_win ? 'is-winner' : 'is-loser')}>
          <TeamBadge
            name={match.radiant_name || 'Radiant'}
            tag={(match.radiant_name || 'RAD').slice(0, 3).toUpperCase()}
            size="md"
          />
          <span className="match-team-side">Radiant</span>
        </div>
        <div className="match-score">
          <strong className={match.radiant_win ? 'text-good' : 'text-muted'}>{match.radiant_score}</strong>
          <span>:</span>
          <strong className={!match.radiant_win ? 'text-good' : 'text-muted'}>{match.dire_score}</strong>
          <small>{formatDuration(match.duration)}</small>
        </div>
        <div className={classNames('match-team match-team-right', !match.radiant_win ? 'is-winner' : 'is-loser')}>
          <TeamBadge
            name={match.dire_name || 'Dire'}
            tag={(match.dire_name || 'DIR').slice(0, 3).toUpperCase()}
            size="md"
          />
          <span className="match-team-side">Dire</span>
        </div>
      </div>
      <div className="pro-match-foot">
        <span><CalendarDays size={12} /> {formatUnixTime(match.start_time)}</span>
        {match.game_mode != null && (
          <span><Clock3 size={12} /> {gameModeName(match.game_mode)}</span>
        )}
        {match.series_type != null && <span>Series {match.series_type}</span>}
        <span className="match-open">Open match <ArrowUpRight size={13} /></span>
      </div>
    </Link>
  )
}

function PublicMatchCard({ match }: { match: PublicMatch }) {
  const rank = match.avg_rank_tier ? rankMedal(Math.floor(match.avg_rank_tier / 10) * 10) : null
  return (
    <Link to={`/matches/${match.match_id}`} className="public-match-card">
      <div className="public-match-top">
        <span className={classNames('result-pill', match.radiant_win ? 'result-radiant' : 'result-dire')}>
          {match.radiant_win ? 'Radiant victory' : 'Dire victory'}
        </span>
        <span>#{match.match_id}</span>
      </div>
      <div className="public-teams">
        <span className={match.radiant_win ? 'text-good' : 'text-muted'}>
          <Shield size={13} /> Radiant
        </span>
        <span className="vs">vs</span>
        <span className={!match.radiant_win ? 'text-good' : 'text-muted'}>
          <Swords size={13} /> Dire
        </span>
      </div>
      <div className="public-stats">
        <span><Clock3 size={12} /> {formatDuration(match.duration)}</span>
        <span><Users size={12} /> {rank?.label ?? 'Unranked'}</span>
        <span>{gameModeName(match.game_mode)}</span>
      </div>
      <div className="public-foot">
        <span>{lobbyName(match.lobby_type)} · {timeAgo(match.start_time)}</span>
        <ArrowUpRight size={13} />
      </div>
    </Link>
  )
}
