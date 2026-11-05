import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Compass,
  Globe2,
  Loader2,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { ProPlayer, SearchPlayer, Team } from '../types'
import { TTL } from '../lib/api'
import { useDebouncedValue, useDocumentTitle, useRemote } from '../lib/hooks'
import {
  formatNumber,
  timeAgoFromIso,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  PlayerAvatar,
  SectionHeading,
  TeamBadge,
} from '../components/ui'

type DirectorySort = 'recent' | 'name' | 'team'

export function PlayersPage() {
  useDocumentTitle('Players')
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [sort, setSort] = useState<DirectorySort>('recent')
  const [visible, setVisible] = useState(48)
  const debounced = useDebouncedValue(query, 320)
  const directoryQuery = useDebouncedValue(nameFilter, 180)

  const searchPath = debounced.trim().length >= 2 ? `/search?q=${encodeURIComponent(debounced.trim())}` : null
  const search = useRemote<SearchPlayer[]>(searchPath, TTL.search)
  const pro = useRemote<ProPlayer[]>('/proPlayers', TTL.detail)
  const teams = useRemote<Team[]>('/teams', TTL.detail)
  const sampleProfileId = debounced.trim().match(/^\d{5,12}$/)?.[0]

  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>()
    ;(pro.data ?? []).forEach((player) => {
      if (player.team_name) counts.set(player.team_name, (counts.get(player.team_name) ?? 0) + 1)
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([name, count]) => ({ name, count }))
  }, [pro.data])

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    ;(pro.data ?? []).forEach((player) => {
      const code = player.country_code || player.loccountrycode
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([code]) => code)
  }, [pro.data])

  const directory = useMemo(() => {
    const queryValue = directoryQuery.trim().toLowerCase()
    const rows = (pro.data ?? []).filter((player) => {
      if (teamFilter !== 'all' && player.team_name !== teamFilter) return false
      if (countryFilter !== 'all' && (player.country_code || player.loccountrycode) !== countryFilter) return false
      if (queryValue) {
        const haystack = `${player.personaname} ${player.name ?? ''} ${player.team_name ?? ''} ${player.team_tag ?? ''} ${player.country_code ?? ''}`.toLowerCase()
        if (!haystack.includes(queryValue)) return false
      }
      return true
    })
    return rows.sort((a, b) => {
      if (sort === 'name') return a.personaname.localeCompare(b.personaname)
      if (sort === 'team') return (a.team_name ?? 'zzz').localeCompare(b.team_name ?? 'zzz')
      return (b.last_match_time ?? '').localeCompare(a.last_match_time ?? '')
    })
  }, [pro.data, directoryQuery, teamFilter, countryFilter, sort])

  const summary = useMemo(() => {
    const players = pro.data ?? []
    const teamCount = new Set(players.map((player) => player.team_name).filter(Boolean)).size
    const countryCount = new Set(players.map((player) => player.country_code).filter(Boolean)).size
    const latest = players.reduce((max, player) => {
      const stamp = player.last_match_time ? new Date(player.last_match_time).getTime() : 0
      return Math.max(max, stamp)
    }, 0)
    return [
      { label: 'Tracked pros', value: formatNumber(players.length), note: 'OpenDota pro registry' },
      { label: 'Teams', value: formatNumber(teamCount), note: 'represented rosters' },
      { label: 'Countries', value: formatNumber(countryCount), note: 'declared regions' },
      { label: 'Latest match', value: latest ? timeAgoFromIso(new Date(latest).toISOString()) : '—', note: 'pro activity' },
    ]
  }, [pro.data])

  const submitSearch = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    if (/^\d{5,12}$/.test(trimmed)) {
      navigate(`/players/${trimmed}`)
      return
    }
    if (search.data?.length) navigate(`/players/${search.data[0].account_id}`)
  }

  const clearSearch = () => setQuery('')

  return (
    <div className="page-stack players-page">
      <PageHeader
        eyebrow="Player intelligence"
        title="Player directory"
        description="Search any Dota account by name or account ID, inspect professional rosters, and open a full career dossier with hero pool and recent form."
      />

      <section className="player-search-panel">
        <div className="player-search-copy">
          <span className="eyebrow"><Sparkles size={12} /> Global lookup</span>
          <h2>Find a player across OpenDota</h2>
          <p>Search by persona name, real name, or paste an account ID. Results are live from the public player index.</p>
        </div>
        <div className="player-search-box">
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch()
            }}
            placeholder="e.g. 295731192, Miracle-, or a team name"
            aria-label="Search players"
          />
          {search.loading && <Loader2 size={17} className="spin" />}
          {query && !search.loading && (
            <button className="icon-btn" onClick={clearSearch} aria-label="Clear player search"><X size={15} /></button>
          )}
          <button className="btn btn-primary btn-sm" onClick={submitSearch} disabled={!query.trim()}>
            Search
          </button>
        </div>
        {sampleProfileId && (
          <button className="search-shortcut" onClick={() => navigate(`/players/${sampleProfileId}`)}>
            <UserRound size={14} /> Open account <strong>#{sampleProfileId}</strong> directly <ArrowRight size={14} />
          </button>
        )}

        {debounced.trim().length >= 2 && (
          <div className="player-search-results">
            {search.error && !search.data ? (
              <div className="inline-alert">Search is temporarily unavailable. Try the account ID, or retry in a moment.</div>
            ) : search.loading && !search.data ? (
              <div className="inline-loading"><Loader2 size={15} className="spin" /> Searching player index…</div>
            ) : search.data?.length ? (
              <div className="search-result-list">
                {search.data.slice(0, 8).map((player) => (
                  <Link to={`/players/${player.account_id}`} className="search-result-row" key={player.account_id}>
                    <PlayerAvatar src={player.avatarfull} name={player.personaname} size="sm" />
                    <div>
                      <strong>{player.personaname}</strong>
                      <span>Account #{player.account_id}{player.last_match_time ? ` · played ${timeAgoFromIso(player.last_match_time)}` : ''}</span>
                    </div>
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="inline-alert">
                No player matched “{debounced.trim()}”. Try a different spelling or use the numeric account ID.
              </div>
            )}
          </div>
        )}
        {!query && (
          <div className="search-example-row">
            <span>Try the command palette <kbd>Ctrl</kbd><kbd>K</kbd> from anywhere.</span>
            <span>Account IDs open directly at <code>/players/&lt;id&gt;</code>.</span>
          </div>
        )}
      </section>

      <div className="directory-summary">
        {summary.map((item) => (
          <div className="feed-summary-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>

      <section className="panel pro-directory-panel">
        <SectionHeading
          eyebrow="Professional registry"
          title="Pro players"
          hint={`${formatNumber(directory.length)} of ${formatNumber(pro.data?.length ?? 0)} shown`}
          action={
            <Link to="/pro" className="btn btn-ghost btn-sm">
              <Compass size={14} /> Pro circuit
            </Link>
          }
        />
        <div className="filter-bar compact">
          <label className="search-field">
            <Search size={15} />
            <input
              value={nameFilter}
              onChange={(event) => {
                setNameFilter(event.target.value)
                setVisible(48)
              }}
              placeholder="Filter pros by name, team, country…"
            />
            {nameFilter && (
              <button className="icon-btn" onClick={() => setNameFilter('')} aria-label="Clear filter"><X size={13} /></button>
            )}
          </label>
          <label className="select-field">
            <span>Team</span>
            <select value={teamFilter} onChange={(event) => { setTeamFilter(event.target.value); setVisible(48) }}>
              <option value="all">All teams</option>
              {teamOptions.map((team) => (
                <option value={team.name} key={team.name}>{team.name} ({team.count})</option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>Country</span>
            <select value={countryFilter} onChange={(event) => { setCountryFilter(event.target.value); setVisible(48) }}>
              <option value="all">All countries</option>
              {countryOptions.map((code) => <option value={code} key={code}>{code}</option>)}
            </select>
          </label>
          <label className="select-field">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as DirectorySort)}>
              <option value="recent">Recent activity</option>
              <option value="name">Name</option>
              <option value="team">Team</option>
            </select>
          </label>
        </div>

        {pro.loading && !pro.data ? (
          <PageLoader label="Loading professional registry…" />
        ) : pro.error && !pro.data ? (
          <ErrorState error={pro.error} onRetry={pro.refresh} title="Pro registry unavailable" />
        ) : directory.length === 0 ? (
          <EmptyState title="No pros match these filters" icon={<Users size={22} />}>
            Clear the team or country filter, or search for a different name.
          </EmptyState>
        ) : (
          <>
            <div className="pro-player-grid">
              {directory.slice(0, visible).map((player) => (
                <Link to={`/players/${player.account_id}`} className="pro-player-card" key={player.account_id}>
                  <PlayerAvatar src={player.avatarfull} name={player.personaname} size="md" />
                  <div className="pro-player-copy">
                    <div className="pro-player-name">
                      <strong>{player.personaname}</strong>
                      {player.is_pro && <BadgeCheck size={13} className="verified-icon" />}
                    </div>
                    <span>{player.name || 'Professional player'}</span>
                    <div className="pro-player-meta">
                      {player.team_name ? (
                        <TeamBadge name={player.team_name} tag={player.team_tag || 'TEAM'} size="xs" />
                      ) : (
                        <span className="badge badge-muted">Free agent</span>
                      )}
                      {player.country_code && <span className="country-tag"><Globe2 size={11} /> {player.country_code}</span>}
                    </div>
                  </div>
                  <div className="pro-player-side">
                    <small>{player.last_match_time ? timeAgoFromIso(player.last_match_time) : 'No recent match'}</small>
                    <ArrowUpRight size={14} />
                  </div>
                </Link>
              ))}
            </div>
            {visible < directory.length && (
              <div className="load-more-row">
                <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 48)}>
                  Load more <span>{formatNumber(directory.length - visible)} remaining</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="split-panels">
        <section className="panel">
          <SectionHeading eyebrow="Roster coverage" title="Teams and regions" />
          <div className="mini-stat-grid">
            <div><strong>{formatNumber(teams.data?.length ?? 0)}</strong><span>rated teams</span></div>
            <div><strong>{teamOptions[0]?.name ?? '—'}</strong><span>largest tracked roster</span></div>
            <div><strong>{countryOptions.length}</strong><span>active regions</span></div>
          </div>
          <p className="panel-footnote">The pro registry is a snapshot of OpenDota's tracked professional accounts. It is not an exhaustive list of every high-MMR player.</p>
        </section>
        <section className="panel">
          <SectionHeading eyebrow="Profile coverage" title="What a dossier includes" />
          <ul className="simple-list">
            <li><span><Users size={14} /> Career win/loss and calibrated rank</span></li>
            <li><span><Compass size={14} /> Hero pool with games and win rate</span></li>
            <li><span><UserRound size={14} /> Recent match form and KDA</span></li>
            <li><span><Globe2 size={14} /> Country, team, and Steam identity</span></li>
          </ul>
        </section>
      </div>
    </div>
  )
}
