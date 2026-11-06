import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  Crosshair,
  Database,
  Eye,
  KeyRound,
  Layers3,
  Shield,
  Skull,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import type {
  HeroStat,
  ItemConstants,
  MatchDetail,
  MatchPlayer,
  PickBan,
} from '../types'
import { useMeta } from '../context/MetaContext'
import { requestMatchParse, TTL } from '../lib/api'
import { mergeLocalMatch, useArchiveMatchStats } from '../lib/localMatchStats'
import { WardMap } from '../components/WardMap'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { hasOpenDotaKey } from '../lib/settings'
import {
  gameModeName,
  heroImage,
  itemImage,
  lobbyName,
} from '../lib/constants'
import {
  classNames,
  formatCompact,
  formatDuration,
  formatKda,
  formatNumber,
  formatUnixTime,
  timeAgo,
} from '../lib/format'
import {
  AdvantageChart,
  ErrorState,
  HeroPortrait,
  PageLoader,
  RankChip,
  SectionHeading,
  TeamBadge,
} from '../components/ui'

export function MatchDetailPage() {
  const { matchId } = useParams()
  const meta = useMeta()
  const detail = useRemote<MatchDetail>(matchId ? `/matches/${matchId}` : null, TTL.detail)
  const localStats = useArchiveMatchStats(matchId)
  const items = useRemote<ItemConstants>('/constants/items', TTL.constants)
  const [chartMode, setChartMode] = useState<'gold' | 'xp'>('gold')
  const [parseState, setParseState] = useState<'idle' | 'requesting' | 'queued' | 'error'>('idle')
  const [parseError, setParseError] = useState<string | null>(null)
  const remoteMatch = detail.data
  const match = useMemo(
    () => (remoteMatch && localStats.data ? mergeLocalMatch(remoteMatch, localStats.data) : remoteMatch),
    [remoteMatch, localStats.data],
  )
  const localParsed = Boolean(localStats.data?.players?.length)
  const sharedParsed = localStats.source === 'shared'
  const parsedSourceLabel = sharedParsed ? 'Shared archive' : 'Parsed locally'
  const remoteParsed = Boolean(remoteMatch?.od_data?.has_parsed)
  const parsed = remoteParsed || localParsed
  useDocumentTitle(match ? `Match #${match.match_id}` : 'Match')

  const heroes = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const itemMap = useMemo(() => {
    const map = new Map<number, { img: string; dname: string }>()
    Object.values(items.data ?? {}).forEach((item) => map.set(item.id, item))
    return map
  }, [items.data])

  const players = useMemo(() => {
    if (!match) return { radiant: [], dire: [] }
    const sorted = [...match.players].sort((a, b) => a.player_slot - b.player_slot)
    return {
      radiant: sorted.filter((player) => player.isRadiant),
      dire: sorted.filter((player) => !player.isRadiant),
    }
  }, [match])

  const requestParse = async () => {
    if (!match) return
    if (!hasOpenDotaKey()) {
      window.dispatchEvent(new Event('dotascope:open-api-key'))
      return
    }
    setParseState('requesting')
    setParseError(null)
    try {
      await requestMatchParse(match.match_id)
      setParseState('queued')
    } catch (error) {
      setParseState('error')
      setParseError(error instanceof Error ? error.message : 'Could not request a replay parse.')
    }
  }

  if (detail.loading && !match) return <PageLoader label="Loading match dossier…" />

  if (!match) {
    return (
      <div className="page-stack">
        <Link to="/matches" className="back-link"><ArrowLeft size={14} /> Match explorer</Link>
        <ErrorState
          error={detail.error ?? new Error('That match could not be loaded.')}
          onRetry={detail.refresh}
          title={matchId ? `Match #${matchId} unavailable` : 'Invalid match ID'}
        />
      </div>
    )
  }

  const radiantName = match.radiant_team?.name || match.radiant_name || 'Radiant'
  const direName = match.dire_team?.name || match.dire_name || 'Dire'
  const radiantLogo = match.radiant_team?.logo_url || match.radiant_logo
  const direLogo = match.dire_team?.logo_url || match.dire_logo
  const goldData = match.radiant_gold_adv ?? []
  const xpData = match.radiant_xp_adv ?? []
  const activeData = chartMode === 'gold' ? goldData : xpData
  const finalAdvantage = activeData.length ? activeData[activeData.length - 1] : 0
  const radiantPlayers = players.radiant
  const direPlayers = players.dire
  const totalKills = match.players.reduce((sum, player) => sum + player.kills, 0)
  const totalNetWorth = match.players.reduce((sum, player) => sum + (player.net_worth ?? 0), 0)
  const avgGpm = match.players.length
    ? match.players.reduce((sum, player) => sum + player.gold_per_min, 0) / match.players.length
    : 0
  const draft = match.picks_bans ?? []

  return (
    <div className="page-stack match-detail-page">
      <Link to="/matches" className="back-link"><ArrowLeft size={14} /> Match explorer</Link>

      <section className="match-hero">
        <div className="match-hero-top">
          <div className="match-hero-tags">
            <span className="eyebrow">Match dossier</span>
            <span className="badge">#{match.match_id}</span>
            <span className="badge badge-muted">{gameModeName(match.game_mode)}</span>
            <span className="badge badge-muted">{lobbyName(match.lobby_type)}</span>
            {match.patch != null && <span className="badge badge-muted">Patch {match.patch}</span>}
            {localParsed && (
              <span className={classNames('badge', sharedParsed ? 'badge-shared' : 'badge-local')}>
                {parsedSourceLabel}
              </span>
            )}
          </div>
          <span className="muted-label">
            <CalendarDays size={13} /> {formatUnixTime(match.start_time)} · {timeAgo(match.start_time)}
          </span>
        </div>

        <div className="match-hero-score">
          <div className="match-hero-team">
            <TeamBadge name={radiantName} tag="RAD" logoUrl={radiantLogo} size="lg" />
            <div>
              <span>Radiant</span>
              <strong>{radiantName}</strong>
            </div>
          </div>
          <div className="match-hero-result">
            <div className="match-final-score">
              <strong className={match.radiant_win ? 'text-good' : ''}>{match.radiant_score}</strong>
              <span>:</span>
              <strong className={!match.radiant_win ? 'text-good' : ''}>{match.dire_score}</strong>
            </div>
            <span className={classNames('result-pill', match.radiant_win ? 'result-radiant' : 'result-dire')}>
              {match.radiant_win ? 'Radiant victory' : 'Dire victory'}
            </span>
            <small>{formatDuration(match.duration)} · {formatNumber(totalKills)} kills</small>
          </div>
          <div className="match-hero-team match-hero-team-right">
            <div>
              <span>Dire</span>
              <strong>{direName}</strong>
            </div>
            <TeamBadge name={direName} tag="DIR" logoUrl={direLogo} size="lg" />
          </div>
        </div>

        <div className="match-hero-meta">
          <span><Trophy size={13} /> {match.league?.name || (match.leagueid ? `League ${match.leagueid}` : 'Unranked / unknown league')}</span>
          <span><Coins size={13} /> {formatCompact(totalNetWorth)} net worth in game</span>
          <span><Activity size={13} /> {formatNumber(Math.round(avgGpm))} avg GPM</span>
          <span><Timer size={13} /> first blood {match.first_blood_time ? formatDuration(match.first_blood_time) : '—'}</span>
        </div>
      </section>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">Game length</span><Clock3 size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{formatDuration(match.duration)}</div>
          <div className="kpi-foot"><span>{formatNumber(Math.round(match.duration / 60))} minutes</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">Kills</span><Skull size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{formatNumber(totalKills)}</div>
          <div className="kpi-foot"><span>{(totalKills / Math.max(1, match.duration / 60)).toFixed(2)} kills / min</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top"><span className="kpi-label">Net worth</span><Coins size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{formatCompact(totalNetWorth)}</div>
          <div className="kpi-foot"><span>all ten players</span></div>
        </div>
        <div className="kpi-card kpi-accent">
          <div className="kpi-top"><span className="kpi-label">Final {chartMode} lead</span><TrendingUp size={16} className="kpi-icon" /></div>
          <div className="kpi-value">{finalAdvantage >= 0 ? '+' : ''}{formatCompact(finalAdvantage)}</div>
          <div className="kpi-foot"><span>{finalAdvantage >= 0 ? radiantName : direName}</span></div>
        </div>
      </div>

      <section className="panel">
        <SectionHeading
          eyebrow="Advantage graph"
          title="How the game swung"
          hint={`${activeData.length} parsed data points`}
          action={
            <div className="segmented segmented-sm">
              <button className={chartMode === 'gold' ? 'is-active' : ''} onClick={() => setChartMode('gold')}>Gold</button>
              <button className={chartMode === 'xp' ? 'is-active' : ''} onClick={() => setChartMode('xp')}>XP</button>
            </div>
          }
        />
        {activeData.length ? (
          <AdvantageChart
            data={activeData}
            duration={match.duration}
            radiantLabel={radiantName}
            direLabel={direName}
            height={190}
          />
        ) : (
          <p className="panel-empty">This match has no parsed advantage timeline. The scoreboard below may still be complete.</p>
        )}
        <p className="panel-footnote">
          Positive values favour Radiant; negative values favour Dire.{' '}
          {localParsed && !remoteParsed
            ? sharedParsed
              ? 'Advantage timeline from the shared community archive.'
              : 'Advantage timeline from the local replay parser.'
            : 'Parsed match data from OpenDota.'}
        </p>
      </section>

      {localParsed && !remoteParsed && (
        <section className={classNames('panel parse-panel', sharedParsed ? 'shared-parse-panel' : 'local-parse-panel')}>
          <SectionHeading
            eyebrow="Replay intelligence"
            title={sharedParsed ? 'Shared archive parse' : 'Parsed locally'}
            hint={sharedParsed
              ? 'Community-shared parse data; no local replay required'
              : "Local parser data is merged with OpenDota's basic match data"}
            action={<span className={classNames('badge', sharedParsed ? 'badge-shared' : 'badge-local')}>{sharedParsed ? 'Shared archive' : 'Local parser'}</span>}
          />
          <div className="parse-panel-body">
            <div>
              <p className="muted-copy">
                {sharedParsed
                  ? 'DotaScope loaded this parse from the shared community archive. No local replay is required; player display names and Steam IDs are stripped before upload.'
                  : 'DotaScope parsed this replay on this PC. No paid OpenDota API key is required. The scoreboard and vision data below use the local parse; OpenDota still supplies player identities and items.'}
              </p>
              <p className="muted-label">
                {localStats.loading
                  ? sharedParsed ? 'Refreshing shared parse…' : 'Refreshing local stats…'
                  : sharedParsed
                    ? 'Shared parse data is available for this match.'
                    : 'Local worker data is available for this match.'}
              </p>
            </div>
            <div className="parse-panel-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { localStats.refresh(); detail.refresh() }}>
                {sharedParsed ? 'Refresh shared parse' : 'Refresh local parse'}
              </button>
              <Link className="btn btn-ghost" to="/parser">Open Parser lab</Link>
            </div>
          </div>
        </section>
      )}

      {!parsed && (
        <section className="panel parse-panel">
          <SectionHeading
            eyebrow="Replay intelligence"
            title="This match is not parsed yet"
            hint="Parsed matches unlock wards, stacks, runes and stuns"
            action={<span className="muted-label"><Database size={13} /> Basic match data</span>}
          />
          <div className="parse-panel-body">
            <div>
              <p className="muted-copy">
                OpenDota can parse the replay for deeper economy and utility data. Replay parsing
                is a paid OpenDota feature, so it needs your own API key.
              </p>
              {parseError && <p className="inline-error">{parseError}</p>}
              {parseState === 'queued' && (
                <p className="inline-alert">
                  Parse requested. OpenDota usually finishes within a minute — refresh this match shortly.
                </p>
              )}
            </div>
            <div className="parse-panel-actions">
              {!hasOpenDotaKey() ? (
                <button type="button" className="btn btn-primary" onClick={requestParse}>
                  <KeyRound size={15} /> Add API key
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={requestParse}
                  disabled={parseState === 'requesting' || parseState === 'queued'}
                >
                  <Database size={15} /> {parseState === 'requesting' ? 'Requesting…' : parseState === 'queued' ? 'Queued' : 'Request replay parse'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => detail.refresh()}>
                Refresh match
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="panel scoreboard-panel">
        <SectionHeading
          eyebrow="Scoreboard"
          title="Ten-player breakdown"
          hint="Click a player name to open their profile"
          action={
            <span className="muted-label">
              <Database size={13} /> {localParsed ? parsedSourceLabel : remoteParsed ? 'Parsed match' : 'Basic match data'}
            </span>
          }
        />
        <div className="scoreboard">
          <TeamScoreboard
            name={radiantName}
            side="radiant"
            players={radiantPlayers}
            heroes={heroes}
            itemMap={itemMap}
            won={match.radiant_win}
          />
          <TeamScoreboard
            name={direName}
            side="dire"
            players={direPlayers}
            heroes={heroes}
            itemMap={itemMap}
            won={!match.radiant_win}
          />
        </div>
      </section>

      {parsed && (
        <VisionPanel
          players={match.players}
          heroes={heroes}
          radiantName={radiantName}
          direName={direName}
        />
      )}

      {localParsed && localStats.data?.wards?.length ? (
        <WardMap
          wards={localStats.data.wards}
          source={sharedParsed ? 'shared' : 'local'}
          players={match.players}
          heroes={heroes}
          radiantName={radiantName}
          direName={direName}
          duration={match.duration}
        />
      ) : null}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <SectionHeading eyebrow="Draft board" title="Picks & bans" hint="In draft order" />
            {draft.length ? (
              <div className="draft-board">
                {[0, 1].map((team) => {
                  const isRadiant = team === 0
                  const rows = draft.filter((entry) => entry.team === team)
                  return (
                    <div className="draft-side" key={team}>
                      <div className={classNames('draft-side-head', isRadiant ? 'draft-radiant' : 'draft-dire')}>
                        <Shield size={13} /> {isRadiant ? radiantName : direName}
                      </div>
                      <div className="draft-list">
                        {rows.map((entry) => (
                          <DraftEntry entry={entry} heroes={heroes} key={`${entry.team}-${entry.order}-${entry.hero_id}`} />
                        ))}
                        {!rows.length && <span className="muted-copy">No draft data.</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="panel-empty">OpenDota has no picks and bans for this match. Draft data is only available for drafted modes.</p>
            )}
          </section>
        </div>

        <div className="detail-side">
          <section className="panel">
            <SectionHeading eyebrow="Match facts" title="At a glance" />
            <div className="fact-list">
              <div><span>Match ID</span><strong>#{match.match_id}</strong></div>
              <div><span>Start time</span><strong>{formatUnixTime(match.start_time)}</strong></div>
              <div><span>Duration</span><strong>{formatDuration(match.duration)}</strong></div>
              <div><span>First blood</span><strong>{match.first_blood_time ? formatDuration(match.first_blood_time) : '—'}</strong></div>
              <div><span>Game mode</span><strong>{gameModeName(match.game_mode)}</strong></div>
              <div><span>Lobby</span><strong>{lobbyName(match.lobby_type)}</strong></div>
              <div><span>League</span><strong>{match.league?.name || '—'}</strong></div>
              <div><span>Patch</span><strong>{match.patch ?? '—'}</strong></div>
            </div>
            <a
              className="text-link"
              href={`https://www.opendota.com/matches/${match.match_id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open raw match on OpenDota <ArrowUpRight size={13} />
            </a>
            <Link className="text-link" to="/data-lab">
              <Database size={13} /> Query match tables
            </Link>
          </section>

          <div className="aside-note">
            <Check size={14} />
            <p>
              Item icons and hero portraits use Valve's CDN through OpenDota constants. Unparsed matches can
              have incomplete economy data.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const UTILITY_ITEMS = ['smoke_of_deceit', 'dust', 'gem'] as const

function utilityCount(player: MatchPlayer, key: string) {
  return (player.purchase_log ?? []).filter((entry) => entry.key === key).length
}

function VisionPanel({
  players,
  heroes,
  radiantName,
  direName,
}: {
  players: MatchPlayer[]
  heroes: Map<number, HeroStat>
  radiantName: string
  direName: string
}) {
  const rows = [...players].sort((a, b) => a.player_slot - b.player_slot)
  const totals = rows.reduce(
    (sum, player) => ({
      obs: sum.obs + (player.obs_placed ?? player.observers_placed ?? 0),
      sentries: sum.sentries + (player.sen_placed ?? 0),
      dewards: sum.dewards + (player.observer_kills ?? 0) + (player.sentry_kills ?? 0),
      camps: sum.camps + (player.camps_stacked ?? 0),
      runes: sum.runes + (player.rune_pickups ?? 0),
    }),
    { obs: 0, sentries: 0, dewards: 0, camps: 0, runes: 0 },
  )

  return (
    <section className="panel vision-panel">
      <SectionHeading
        eyebrow="Vision & utility"
        title="Beyond the scoreboard"
        hint={`${rows.length} parsed players`}
        action={<span className="muted-label"><Eye size={13} /> Parsed replay data</span>}
      />
      <div className="vision-summary">
        <div><Eye size={15} /><strong>{totals.obs}</strong><span>Observer wards</span></div>
        <div><Eye size={15} /><strong>{totals.sentries}</strong><span>Sentry wards</span></div>
        <div><Crosshair size={15} /><strong>{totals.dewards}</strong><span>Wards destroyed</span></div>
        <div><Layers3 size={15} /><strong>{totals.camps}</strong><span>Camps stacked</span></div>
        <div><Trophy size={15} /><strong>{totals.runes}</strong><span>Runes picked</span></div>
      </div>
      <div className="table-wrap vision-table-wrap">
        <table className="data-table vision-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Obs</th>
              <th className="num">Sen</th>
              <th className="num">Dewards</th>
              <th className="num">Camps</th>
              <th className="num">Runes</th>
              <th className="num">Stuns</th>
              <th>Utility</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => {
              const hero = heroes.get(player.hero_id)
              const side = player.isRadiant ? 'Radiant' : 'Dire'
              return (
                <tr key={player.player_slot} className={player.isRadiant ? 'row-radiant' : 'row-dire'}>
                  <td>
                    <div className="vision-player">
                      <HeroPortrait hero={hero} size="xs" />
                      <span>
                        <strong>{player.personaname || player.name || 'Anonymous'}</strong>
                        <small>{hero?.localized_name ?? `Hero ${player.hero_id}`} · {side}</small>
                      </span>
                    </div>
                  </td>
                  <td className="num">{player.obs_placed ?? player.observers_placed ?? 0}</td>
                  <td className="num">{player.sen_placed ?? 0}</td>
                  <td className="num">{(player.observer_kills ?? 0) + (player.sentry_kills ?? 0)}</td>
                  <td className="num">{player.camps_stacked ?? 0}</td>
                  <td className="num">{player.rune_pickups ?? 0}</td>
                  <td className="num">{Math.round(player.stuns ?? 0)}s</td>
                  <td>
                    <span className="muted-copy vision-utility">
                      {UTILITY_ITEMS.map((key) => {
                        const count = utilityCount(player, key)
                        return count > 0 ? `${key.replace(/_/g, ' ')} ${count}` : null
                      }).filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-footnote">
        Parsed replay data from OpenDota. Utility counts come from the purchase log; “wards destroyed”
        includes observer and sentry kills where available. {radiantName} and {direName} are the team labels.
      </p>
    </section>
  )
}

function TeamScoreboard({
  name,
  side,
  players,
  heroes,
  itemMap,
  won,
}: {
  name: string
  side: 'radiant' | 'dire'
  players: MatchPlayer[]
  heroes: Map<number, HeroStat>
  itemMap: Map<number, { img: string; dname: string }>
  won: boolean
}) {
  const kills = players.reduce((sum, player) => sum + player.kills, 0)
  const deaths = players.reduce((sum, player) => sum + player.deaths, 0)
  const assists = players.reduce((sum, player) => sum + player.assists, 0)
  const netWorth = players.reduce((sum, player) => sum + (player.net_worth ?? 0), 0)
  return (
    <div className={classNames('team-scoreboard', `team-scoreboard-${side}`, won && 'is-winner')}>
      <div className="team-scoreboard-head">
        <span className="team-side-pill">{side}</span>
        <strong>{name}</strong>
        {won && <span className="winner-tag"><Trophy size={11} /> Winner</span>}
        <span className="team-totals">{kills} / {deaths} / {assists} · {formatCompact(netWorth)} NW</span>
      </div>
      <div className="scoreboard-labels">
        <span>Player</span><span>K / D / A</span><span>Net worth</span><span>GPM / XPM</span><span>LH / DN</span><span>Damage</span><span>Items</span>
      </div>
      <div className="scoreboard-rows">
        {players.map((player) => {
          const hero = heroes.get(player.hero_id)
          return (
            <div className="score-player-row" key={player.player_slot}>
              <div className="score-player-identity">
                <HeroPortrait hero={hero} size="sm" />
                <div className="score-player-copy">
                  <div className="score-player-name">
                    {player.account_id ? (
                      <Link to={`/players/${player.account_id}`}>{player.personaname || player.name || 'Anonymous'}</Link>
                    ) : (
                      <span>{player.personaname || 'Anonymous'}</span>
                    )}
                    <span className="player-level">L{player.level}</span>
                  </div>
                  <span className="score-player-hero">{hero?.localized_name ?? `Hero ${player.hero_id}`}</span>
                  <RankChip rankTier={player.rank_tier} />
                </div>
              </div>
              <div className="score-kda">
                <strong>{player.kills} / {player.deaths} / {player.assists}</strong>
                <span>{formatKda(player.kills, player.deaths, player.assists)} KDA</span>
              </div>
              <div className="score-stat">
                <strong>{formatCompact(player.net_worth ?? 0)}</strong>
                <span>gold</span>
              </div>
              <div className="score-stat">
                <strong>{player.gold_per_min} / {player.xp_per_min}</strong>
                <span>per min</span>
              </div>
              <div className="score-stat">
                <strong>{player.last_hits} / {player.denies}</strong>
                <span>creeps</span>
              </div>
              <div className="score-stat">
                <strong>{formatCompact(player.hero_damage)}</strong>
                <span>{formatCompact(player.tower_damage)} bldg</span>
              </div>
              <div className="score-items">
                {[player.item_0, player.item_1, player.item_2, player.item_3, player.item_4, player.item_5].map((itemId, index) => (
                  <ItemSlot item={itemId ? itemMap.get(itemId) : undefined} key={index} />
                ))}
                <ItemSlot item={player.item_neutral ? itemMap.get(player.item_neutral) : undefined} neutral />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ItemSlot({ item, neutral = false }: { item?: { img: string; dname: string }; neutral?: boolean }) {
  return (
    <span className={classNames('match-item-slot', neutral && 'is-neutral')} title={item?.dname ?? 'Empty slot'}>
      {item ? <img src={itemImage(item.img)} alt={item.dname} loading="lazy" /> : <span className="item-slot-dot" />}
    </span>
  )
}

function DraftEntry({
  entry,
  heroes,
}: {
  entry: PickBan
  heroes: Map<number, HeroStat>
}) {
  const hero = heroes.get(entry.hero_id)
  return (
    <div className={classNames('draft-entry', entry.is_pick ? 'is-pick' : 'is-ban')}>
      <span className="draft-order">{entry.order}</span>
      {hero ? (
        <img src={heroImage(hero.img)} alt={hero.localized_name} loading="lazy" />
      ) : (
        <span className="draft-placeholder" />
      )}
      <span className="draft-hero">{hero?.localized_name ?? `Hero ${entry.hero_id}`}</span>
      <span className="draft-kind">{entry.is_pick ? <><Crosshair size={11} /> Pick</> : <><Ban size={11} /> Ban</>}</span>
    </div>
  )
}
