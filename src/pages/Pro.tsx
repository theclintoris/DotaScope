import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  Ban,
  Crown,
  Flame,
  Globe2,
  Search,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import type { ProMatch, ProPlayer, Team } from '../types'
import { TTL } from '../lib/api'
import { useMeta } from '../context/MetaContext'
import { useDebouncedValue, useDocumentTitle, useRemote } from '../lib/hooks'
import {
  classNames,
  formatDuration,
  formatNumber,
  formatPercent,
  timeAgo,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  HeroPortrait,
  PageHeader,
  PageLoader,
  SectionHeading,
  TeamBadge,
} from '../components/ui'

type TeamSort = 'rating' | 'winRate' | 'wins' | 'recent'

export function ProPage() {
  useDocumentTitle('Pro circuit')
  const meta = useMeta()
  const teams = useRemote<Team[]>('/teams', TTL.detail)
  const matches = useRemote<ProMatch[]>('/proMatches', TTL.feed)
  const players = useRemote<ProPlayer[]>('/proPlayers', TTL.detail)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<TeamSort>('rating')
  const [recentOnly, setRecentOnly] = useState(true)
  const [visible, setVisible] = useState(24)
  const debounced = useDebouncedValue(search, 200)

  const rankMap = useMemo(() => {
    const sorted = [...(teams.data ?? [])].sort((a, b) => b.rating - a.rating)
    return new Map(sorted.map((team, index) => [team.team_id, index + 1]))
  }, [teams.data])

  const teamRows = useMemo(() => {
    const now = Date.now() / 1000
    const query = debounced.trim().toLowerCase()
    const rows = (teams.data ?? []).filter((team) => {
      if (recentOnly && now - team.last_match_time > 60 * 60 * 24 * 120) return false
      if (query && !`${team.name} ${team.tag}`.toLowerCase().includes(query)) return false
      return true
    })
    return rows.sort((a, b) => {
      if (sort === 'wins') return b.wins - a.wins
      if (sort === 'recent') return b.last_match_time - a.last_match_time
      if (sort === 'winRate') {
        const aRate = a.wins / Math.max(1, a.wins + a.losses)
        const bRate = b.wins / Math.max(1, b.wins + b.losses)
        return bRate - aRate
      }
      return b.rating - a.rating
    })
  }, [teams.data, debounced, sort, recentOnly])

  const proMeta = useMemo(() => {
    return meta.heroes
      .map((hero) => ({
        hero,
        picks: hero.pro_pick,
        bans: hero.pro_ban,
        wins: hero.pro_win,
        presence: hero.pro_pick + hero.pro_ban,
        winRate: hero.pro_pick ? hero.pro_win / hero.pro_pick : 0,
      }))
      .filter((entry) => entry.presence > 0)
      .sort((a, b) => b.presence - a.presence)
  }, [meta.heroes])

  const latest = useMemo(() => [...(matches.data ?? [])].sort((a, b) => b.start_time - a.start_time).slice(0, 16), [matches.data])

  const leagueCount = useMemo(() => {
    return new Set((matches.data ?? []).map((match) => match.leagueid).filter(Boolean)).size
  }, [matches.data])

  const avgRating = useMemo(() => {
    const rated = (teams.data ?? []).filter((team) => team.rating > 0)
    return rated.length ? Math.round(rated.reduce((sum, team) => sum + team.rating, 0) / rated.length) : 0
  }, [teams.data])

  const activeTeams = useMemo(() => {
    const cutoff = Date.now() / 1000 - 60 * 60 * 24 * 120
    return (teams.data ?? []).filter((team) => team.last_match_time > cutoff).length
  }, [teams.data])

  const resetTeamFilters = () => {
    setSearch('')
    setSort('rating')
    setRecentOnly(true)
    setVisible(24)
  }

  return (
    <div className="page-stack pro-page">
      <PageHeader
        eyebrow="Professional circuit"
        title="The pro theatre"
        description="Team ratings, the professional hero meta, and the latest results from OpenDota's tracked circuit. Refresh for the newest completed series."
        actions={
          <Link to="/matches" className="btn btn-ghost">
            <Swords size={14} /> Match explorer
          </Link>
        }
      />

      <div className="pro-summary">
        <div className="pro-summary-item">
          <span className="pro-summary-icon"><Trophy size={17} /></span>
          <div><strong>{formatNumber(teams.data?.length ?? 0)}</strong><span>tracked teams</span></div>
        </div>
        <div className="pro-summary-item">
          <span className="pro-summary-icon"><Users size={17} /></span>
          <div><strong>{formatNumber(players.data?.length ?? 0)}</strong><span>pro players</span></div>
        </div>
        <div className="pro-summary-item">
          <span className="pro-summary-icon"><Activity size={17} /></span>
          <div><strong>{formatNumber(activeTeams)}</strong><span>active in 120 days</span></div>
        </div>
        <div className="pro-summary-item">
          <span className="pro-summary-icon"><Globe2 size={17} /></span>
          <div><strong>{formatNumber(leagueCount)}</strong><span>leagues in feed</span></div>
        </div>
        <div className="pro-summary-item">
          <span className="pro-summary-icon"><Flame size={17} /></span>
          <div><strong>{avgRating ? formatNumber(avgRating) : '—'}</strong><span>average team Elo</span></div>
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <SectionHeading
              eyebrow="Team power index"
              title="Rated rosters"
              hint={`${formatNumber(teamRows.length)} teams after filters`}
              action={
                <span className="muted-label"><Trophy size={13} /> OpenDota team rating</span>
              }
            />
            <div className="filter-bar compact">
              <label className="search-field">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setVisible(24) }}
                  placeholder="Search teams or tags…"
                />
                {search && <button className="icon-btn" onClick={() => setSearch('')} aria-label="Clear team search"><X size={13} /></button>}
              </label>
              <label className="select-field">
                <span>Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as TeamSort)}>
                  <option value="rating">Team rating</option>
                  <option value="winRate">Win rate</option>
                  <option value="wins">Total wins</option>
                  <option value="recent">Recent activity</option>
                </select>
              </label>
              <label className="toggle-field">
                <input type="checkbox" checked={recentOnly} onChange={(event) => setRecentOnly(event.target.checked)} />
                <span>Active only</span>
              </label>
            </div>

            {teams.loading && !teams.data ? (
              <PageLoader label="Loading team ratings…" />
            ) : teams.error && !teams.data ? (
              <ErrorState error={teams.error} onRetry={teams.refresh} title="Team ratings unavailable" />
            ) : teamRows.length === 0 ? (
              <EmptyState
                title="No teams match"
                icon={<Users size={22} />}
                action={<button className="btn btn-ghost btn-sm" onClick={resetTeamFilters}>Clear team filters</button>}
              >
                Try a different team name, or include inactive rosters.
              </EmptyState>
            ) : (
              <>
                <div className="team-list">
                  {teamRows.slice(0, visible).map((team) => (
                    <TeamRow team={team} rank={rankMap.get(team.team_id) ?? 0} key={team.team_id} />
                  ))}
                </div>
                {visible < teamRows.length && (
                  <div className="load-more-row">
                    <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 24)}>
                      Load more <span>{formatNumber(teamRows.length - visible)} remaining</span>
                    </button>
                  </div>
                )}
              </>
            )}
            <p className="panel-footnote">Team rating is OpenDota's Elo estimate. Rosters change; a team's historical record is not a prediction of its current form.</p>
          </section>

          <section className="panel">
            <SectionHeading
              eyebrow="Latest results"
              title="Circuit scoreboard"
              hint={`${formatNumber(matches.data?.length ?? 0)} matches in feed`}
              action={<Link to="/matches" className="text-link">All matches <ArrowUpRight size={13} /></Link>}
            />
            {matches.loading && !matches.data ? (
              <div className="mini-skeletons">{[0, 1, 2, 3].map((key) => <span className="skeleton" key={key} style={{ height: 54 }} />)}</div>
            ) : matches.error && !matches.data ? (
              <ErrorState error={matches.error} onRetry={matches.refresh} title="Pro feed unavailable" />
            ) : (
              <div className="pro-result-list">
                {latest.map((match) => (
                  <Link to={`/matches/${match.match_id}`} className="pro-result-row" key={match.match_id}>
                    <div className="pro-result-league">
                      <Trophy size={11} />
                      <span>{match.league_name || 'Pro match'}</span>
                      <small>{timeAgo(match.start_time)}</small>
                    </div>
                    <div className="pro-result-teams">
                      <span className={match.radiant_win ? 'is-winner' : ''}>{match.radiant_name || 'Radiant'}</span>
                      <strong>{match.radiant_score} : {match.dire_score}</strong>
                      <span className={!match.radiant_win ? 'is-winner' : ''}>{match.dire_name || 'Dire'}</span>
                    </div>
                    <div className="pro-result-meta">
                      <span>{formatDuration(match.duration)}</span>
                      <ArrowUpRight size={13} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="detail-side">
          <section className="panel">
            <SectionHeading
              eyebrow="Pro hero meta"
              title="Draft presence"
              hint={`${formatNumber(meta.heroes.reduce((sum, hero) => sum + hero.pro_pick, 0))} picks sampled`}
            />
            {meta.loading && !meta.heroes.length ? (
              <div className="mini-skeletons">{[0, 1, 2, 3, 4].map((key) => <span className="skeleton" key={key} style={{ height: 34 }} />)}</div>
            ) : proMeta.length === 0 ? (
              <span className="muted-copy">The pro aggregate is empty right now.</span>
            ) : (
              <div className="pro-meta-list">
                {proMeta.slice(0, 10).map((entry, index) => (
                  <Link to={`/heroes/${entry.hero.id}`} className="pro-meta-row" key={entry.hero.id}>
                    <span className="pro-meta-rank">{String(index + 1).padStart(2, '0')}</span>
                    <HeroPortrait hero={entry.hero} size="xs" />
                    <span className="pro-meta-hero">{entry.hero.localized_name}</span>
                    <span className="pro-meta-picks">{entry.picks}P</span>
                    <span className="pro-meta-bans"><Ban size={10} /> {entry.bans}</span>
                    <span className="pro-meta-presence">{formatPercent(entry.winRate)}</span>
                  </Link>
                ))}
              </div>
            )}
            <p className="panel-footnote">Presence is picks plus bans. OpenDota's pro hero sample is small and updates as matches are parsed.</p>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Circuit pulse" title="Sample health" />
            <div className="fact-list">
              <div><span>Avg team Elo</span><strong>{avgRating ? formatNumber(avgRating) : '—'}</strong></div>
              <div><span>Active rosters</span><strong>{formatNumber(activeTeams)}</strong></div>
              <div><span>Pro player registry</span><strong>{formatNumber(players.data?.length ?? 0)}</strong></div>
              <div><span>Recent feed</span><strong>{formatNumber(matches.data?.length ?? 0)} matches</strong></div>
              <div><span>Leagues in feed</span><strong>{formatNumber(leagueCount)}</strong></div>
            </div>
            <Link className="text-link" to="/players">
              <Users size={13} /> Browse pro players
            </Link>
          </section>

          <div className="aside-note">
            <Crown size={14} />
            <p>
              OpenDota's team and league data depends on public match parsing and Valve's league metadata.
              Some exhibition and qualifier series may not be indexed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamRow({ team, rank }: { team: Team; rank: number }) {
  const games = team.wins + team.losses
  const winRate = games ? team.wins / games : 0
  return (
    <a
      className="team-row"
      href={`https://www.opendota.com/teams/${team.team_id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className={classNames('team-rank', rank <= 3 && 'is-podium')}>{String(rank).padStart(2, '0')}</span>
      <TeamBadge name={team.name} tag={team.tag} logoUrl={team.logo_url} size="md" />
      <div className="team-row-copy">
        <strong>{team.name}</strong>
        <span>
          {team.tag} · last match {team.last_match_time ? timeAgo(team.last_match_time) : 'unknown'}
        </span>
      </div>
      <div className="team-row-rating">
        <strong>{formatNumber(team.rating)}</strong>
        <span className={team.delta >= 0 ? 'text-good' : 'text-bad'}>
          {team.delta >= 0 ? '+' : ''}{formatNumber(Math.round(team.delta))}
        </span>
      </div>
      <div className="team-row-record">
        <strong>{formatNumber(team.wins)}–{formatNumber(team.losses)}</strong>
        <span className={winRate >= 0.5 ? 'text-good' : 'text-bad'}>{formatPercent(winRate)} WR</span>
      </div>
      <div className="team-row-winbar">
        <span style={{ width: `${winRate * 100}%` }} />
      </div>
      <ArrowUpRight size={14} className="team-row-open" />
    </a>
  )
}
