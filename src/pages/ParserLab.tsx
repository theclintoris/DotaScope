import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  HardDrive,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  Server,
  Terminal,
} from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { useProfile } from '../context/ProfileContext'
import { useDocumentTitle } from '../lib/hooks'
import { formatDuration, formatNumber, timeAgoFromIso } from '../lib/format'
import { HeroPortrait, PageHeader, SectionHeading } from '../components/ui'

interface WorkerHealth {
  ok: boolean
  parser: boolean
  replayDir: string
  dataDir: string
  javaBin: string
  parserJar: string
  replays: number
}

interface ReplayFile {
  matchId: string
  name: string
  bytes: number
  modifiedAt: string
}

interface ParsedPlayer {
  slot: number
  playerSlot: number
  accountId: number | null
  personaname: string | null
  steamId: string | null
  heroId: number
  heroName: string
  level: number
  team: 'radiant' | 'dire'
  win: boolean
  kills: number
  deaths: number
  assists: number
  kda: number
  lastHits: number
  denies: number
  netWorth: number
  goldPerMin: number
  xpPerMin: number
  heroDamage: number
  towerDamage: number
  stuns: number
  obsPlaced: number
  senPlaced: number
  campsStacked: number
  creepsStacked: number
  runePickups: number
}

interface ParsedMatch {
  cached?: boolean
  match: {
    matchId: string
    gameMode: number
    gameModeName: string
    startTime: number
    duration: number
    radiantWin: boolean
    radiantKills: number
    direKills: number
    lobbyType: number
    source: string
    rawLogLines: number
  }
  players: ParsedPlayer[]
  generatedAt: string
}

interface BackfillResult {
  matchId: string
  status: 'parsed' | 'cached' | 'skipped' | 'error'
  gameMode?: number | null
  reason?: string
  error?: string
}

interface BackfillState {
  id: string
  status: 'running' | 'complete' | 'cancelled'
  startedAt: string
  finishedAt: string | null
  total: number
  completed: number
  current: string | null
  results: BackfillResult[]
}

interface RecentTurboMatch {
  matchId: string
  startTime: number
  duration: number
  heroId: number
  win: boolean
}

const WORKER_BASE = 'http://127.0.0.1:5601'

async function workerGet<T>(path: string): Promise<T> {
  const response = await fetch(`${WORKER_BASE}${path}`, { cache: 'no-store' })
  if (!response.ok) throw new Error((await response.text()) || `Worker returned ${response.status}`)
  return response.json() as Promise<T>
}

function bytesLabel(bytes: number) {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}

export function ParserLabPage() {
  useDocumentTitle('Parser lab')
  const { heroes } = useMeta()
  const { accountId } = useProfile()
  const heroById = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes])
  const [health, setHealth] = useState<WorkerHealth | null>(null)
  const [replays, setReplays] = useState<ReplayFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [result, setResult] = useState<ParsedMatch | null>(null)
  const [parsingId, setParsingId] = useState<string | null>(null)
  const [idsText, setIdsText] = useState('')
  const [backfill, setBackfill] = useState<BackfillState | null>(null)
  const [backfillError, setBackfillError] = useState<string | null>(null)
  const [loadingIds, setLoadingIds] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await workerGet<WorkerHealth>('/health')
      setHealth(status)
      const listing = await workerGet<{ replays: ReplayFile[] }>('/replays')
      setReplays(listing.replays)
      setSelectedId((current) => current ?? listing.replays[0]?.matchId ?? null)
    } catch (loadError) {
      setHealth(null)
      setReplays([])
      setError(loadError instanceof Error ? loadError.message : 'The local parser worker is not reachable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    let cancelled = false
    void workerGet<{ backfill: BackfillState | null }>('/backfill')
      .then((payload) => {
        if (!cancelled) setBackfill(payload.backfill)
      })
      .catch(() => {
        // Health/offline state is the more useful message for a missing worker.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (backfill?.status !== 'running') return
    const timer = window.setInterval(() => {
      void workerGet<{ backfill: BackfillState | null }>('/backfill')
        .then((payload) => {
          setBackfill(payload.backfill)
          if (payload.backfill?.status !== 'running') void load()
        })
        .catch(() => undefined)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [backfill?.id, backfill?.status])

  const loadRecentTurbo = async () => {
    if (!accountId) {
      setBackfillError('Pin a player profile first so the worker knows whose history to load.')
      return
    }
    setLoadingIds(true)
    setBackfillError(null)
    try {
      const payload = await workerGet<{ matches: RecentTurboMatch[] }>(
        `/recent-turbo?accountId=${accountId}`,
      )
      if (!payload.matches.length) {
        setBackfillError('OpenDota returned no recent Turbo matches for this profile.')
        return
      }
      setIdsText(payload.matches.map((match) => match.matchId).join('\n'))
    } catch (recentError) {
      setBackfillError(recentError instanceof Error ? recentError.message : 'Could not load recent Turbo matches.')
    } finally {
      setLoadingIds(false)
    }
  }

  const startBackfill = async () => {
    const matchIds = [...new Set(
      idsText
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => /^\d{1,20}$/.test(value)),
    )]
    if (!matchIds.length) {
      setBackfillError('Paste at least one numeric match ID.')
      return
    }
    setBackfillError(null)
    try {
      const response = await fetch(`${WORKER_BASE}/backfill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchIds }),
      })
      const payload = (await response.json()) as { backfill?: BackfillState; error?: string }
      if (!response.ok || !payload.backfill) {
        throw new Error(payload.error ?? 'Could not start the backfill queue.')
      }
      setBackfill(payload.backfill)
    } catch (startError) {
      setBackfillError(startError instanceof Error ? startError.message : 'Could not start the backfill queue.')
    }
  }

  const cancelBackfill = async () => {
    try {
      await fetch(`${WORKER_BASE}/backfill/cancel`, { method: 'POST' })
    } catch {
      // The polling status will report the final state.
    }
  }

  const parse = async (matchId: string) => {
    setParsingId(matchId)
    setError(null)
    try {
      const response = await fetch(`${WORKER_BASE}/parse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchId, force: true }),
      })
      const payload = (await response.json()) as ParsedMatch | { error?: string }
      if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'Parser worker failed.')
      setResult(payload as ParsedMatch)
      setSelectedId(matchId)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse this replay.')
    } finally {
      setParsingId(null)
    }
  }

  const selectedReplay = replays.find((replay) => replay.matchId === selectedId) ?? null

  return (
    <div className="page-stack parser-page">
      <PageHeader
        eyebrow="LOCAL REPLAY INTELLIGENCE"
        title={<>Parse the <em>unparsed</em>.</>}
        description="Run the OpenDota replay parser locally to unlock Turbo stats, ward work, purchases and the details the public feed leaves out."
        actions={
          <>
            <span className={`parser-status-pill${health ? ' is-online' : ''}`}>
              <span className="live-dot" />
              {health ? 'Worker online' : 'Worker offline'}
            </span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
          </>
        }
      />

      <section className="panel parser-intro">
        <div className="parser-intro-icon"><Cpu size={23} /></div>
        <div>
          <p className="eyebrow">Desktop worker</p>
          <h2>Local replay lab</h2>
          <p>
            The parser is a local Java worker. It reads the actual <code>.dem</code> replay from your Dota 2 folder,
            so it can recover Turbo data and utility stats that are not in the public match feed.
          </p>
        </div>
        <div className="parser-source-note">
          <Server size={17} />
          <span>Runs on this PC only</span>
          <small>Web and Android can connect when the worker is reachable.</small>
        </div>
      </section>

      <section className="panel parser-backfill">
        <div className="parser-backfill-head">
          <div>
            <p className="eyebrow">TURBO BACKFILL</p>
            <h2>Build the archive while you sleep.</h2>
            <p>
              Queue match IDs newest-first. The worker downloads Valve replays when OpenDota has a replay URL,
              then parses each one locally and extends your Turbo history.
            </p>
          </div>
          <span className={`parser-backfill-pill${backfill?.status === 'running' ? ' is-running' : ''}`}>
            {backfill?.status === 'running'
              ? `Running ${backfill.completed}/${backfill.total}`
              : backfill?.status === 'complete'
                ? 'Queue complete'
                : backfill?.status === 'cancelled'
                  ? 'Queue cancelled'
                  : 'Queue ready'}
          </span>
        </div>

        <div className="parser-backfill-grid">
          <div className="parser-backfill-input">
            <label htmlFor="backfill-ids">Match IDs</label>
            <textarea
              id="backfill-ids"
              value={idsText}
              onChange={(event) => setIdsText(event.target.value)}
              placeholder={'9077012903\n9074125467\n9074160600'}
              spellCheck={false}
              disabled={backfill?.status === 'running'}
            />
            <div className="parser-backfill-actions">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => void loadRecentTurbo()}
                disabled={!health || loadingIds || backfill?.status === 'running'}
              >
                {loadingIds ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                Use latest Turbo sample
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => void startBackfill()}
                disabled={!health || !idsText.trim() || backfill?.status === 'running'}
              >
                <Play size={14} /> Start queue
              </button>
              {backfill?.status === 'running' ? (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void cancelBackfill()}>
                  <PauseCircle size={14} /> Cancel
                </button>
              ) : null}
            </div>
            <small>
              OpenDota only lists your latest 20 Turbo matches. Paste IDs from another history source for older
              games; Valve replay retention is roughly 14 days, so some older matches cannot be recovered.
            </small>
            {backfillError ? <p className="parser-error-text"><AlertTriangle size={14} /> {backfillError}</p> : null}
          </div>

          <div className="parser-backfill-progress">
            <div className="parser-backfill-progress-head">
              <span>Queue progress</span>
              <strong>{backfill ? `${Math.round((backfill.completed / Math.max(backfill.total, 1)) * 100)}%` : '0%'}</strong>
            </div>
            <div className="parser-backfill-bar">
              <span style={{ width: `${backfill ? (backfill.completed / Math.max(backfill.total, 1)) * 100 : 0}%` }} />
            </div>
            {backfill?.current ? (
              <p className="parser-backfill-current">
                <Loader2 size={13} className="spin" /> Parsing match {backfill.current}…
              </p>
            ) : (
              <p className="parser-backfill-current">
                {backfill?.status === 'complete'
                  ? 'Queue finished. New Turbo rows are available in player stats.'
                  : backfill?.status === 'cancelled'
                    ? 'Queue stopped before the remaining matches.'
                    : 'Keep DotaScope and the worker open while the queue runs.'}
              </p>
            )}
            <div className="parser-backfill-results">
              {backfill?.results.length ? (
                backfill.results.slice(-8).reverse().map((entry) => (
                  <span key={`${entry.matchId}-${entry.status}`} className={`parser-backfill-result is-${entry.status}`}>
                    <strong>{entry.matchId}</strong>
                    {entry.status === 'skipped' ? 'not Turbo' : entry.status === 'error' ? 'could not parse' : entry.status}
                  </span>
                ))
              ) : (
                <span className="muted-copy">No queue entries yet.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="panel parser-loading">
          <Loader2 size={22} className="spin" />
          <div>
            <strong>Looking for the replay worker…</strong>
            <p>Checking the local parser and your Dota 2 replay directory.</p>
          </div>
        </section>
      ) : !health ? (
        <section className="panel parser-offline">
          <div className="state-icon"><Terminal size={22} /></div>
          <div>
            <p className="eyebrow">Worker offline</p>
            <h2>Start the local parser</h2>
            <p>
              Run this from the DotaScope project folder, then refresh this page. The worker starts the
              OpenDota Java parser automatically.
            </p>
            <pre className="parser-command"><code>node worker/parser-worker.mjs</code></pre>
            <p className="muted-copy">
              Requires Java 21 and a local Dota replay. See <code>worker/README.md</code> for setup,
              environment variables and limits.
            </p>
            <div className="parser-setup-facts">
              <span><FolderOpen size={14} /> Replay folder stays local</span>
              <span><HardDrive size={14} /> Parsed output is cached in worker/data</span>
              <span><FileArchive size={14} /> One .dem at a time</span>
            </div>
            {error ? <p className="parser-error-text"><AlertTriangle size={14} /> {error}</p> : null}
          </div>
        </section>
      ) : (
        <>
          <div className="parser-layout">
            <aside className="panel parser-replays">
              <SectionHeading eyebrow="LOCAL ARCHIVE" title="Replay shelf" hint={`${replays.length} found`} />
              <p className="parser-path" title={health.replayDir}>
                <FolderOpen size={13} /> {health.replayDir}
              </p>
              {replays.length ? (
                <div className="parser-replay-list">
                  {replays.map((replay) => (
                    <button
                      key={replay.matchId}
                      type="button"
                      className={`parser-replay${selectedId === replay.matchId ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(replay.matchId)}
                    >
                      <span className="parser-replay-icon"><FileArchive size={17} /></span>
                      <span className="parser-replay-copy">
                        <strong>Match {replay.matchId}</strong>
                        <small>{bytesLabel(replay.bytes)} · {timeAgoFromIso(replay.modifiedAt)}</small>
                      </span>
                      <span className="parser-replay-action">
                        {parsingId === replay.matchId ? <Loader2 size={15} className="spin" /> : <Play size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="parser-empty">
                  <FileArchive size={24} />
                  <strong>No replays found</strong>
                  <p>Download a replay in Dota 2, then refresh this page.</p>
                </div>
              )}
              <div className="parser-worker-meta">
                <span><span className="live-dot" /> OpenDota parser {health.parser ? 'ready' : 'starting'}</span>
                <small>{health.dataDir}</small>
              </div>
            </aside>

            <main className="parser-main">
              {selectedReplay ? (
                <section className="panel parser-selected">
                  <div>
                    <p className="eyebrow">SELECTED REPLAY</p>
                    <h2>Match {selectedReplay.matchId}</h2>
                    <p>Parse brings the replay data into DotaScope. It does not upload the replay.</p>
                  </div>
                  <div className="parser-actions">
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://www.opendota.com/matches/${selectedReplay.matchId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} /> OpenDota
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={!health.parser || parsingId !== null}
                      onClick={() => void parse(selectedReplay.matchId)}
                    >
                      {parsingId === selectedReplay.matchId ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                      {parsingId === selectedReplay.matchId ? 'Parsing…' : 'Parse replay'}
                    </button>
                  </div>
                </section>
              ) : null}

              {error ? <p className="parser-error-banner"><AlertTriangle size={15} /> {error}</p> : null}

              {result ? (
                <section className="panel parser-result">
                  <div className="parser-result-head">
                    <div>
                      <p className="eyebrow">PARSED MATCH {result.cached ? '· CACHED' : ''}</p>
                      <h2>{result.match.gameModeName}</h2>
                      <p className="parser-result-sub">
                        <span>{formatDuration(result.match.duration)}</span>
                        <span>·</span>
                        <span>{result.match.radiantWin ? 'Radiant' : 'Dire'} victory</span>
                        <span>·</span>
                        <span>{result.match.radiantKills}–{result.match.direKills}</span>
                        <span>·</span>
                        <span>{result.players.length} players</span>
                      </p>
                    </div>
                    <span className="parser-verified"><CheckCircle2 size={15} /> Local parser</span>
                  </div>

                  <div className="table-wrap parser-table-wrap">
                    <table className="data-table parser-table">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>K / D / A</th>
                          <th className="num">GPM</th>
                          <th className="num">XPM</th>
                          <th className="num">LH / DN</th>
                          <th className="num">Net worth</th>
                          <th className="num">Obs / Sen</th>
                          <th className="num">Stuns</th>
                          <th className="num">Runes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.players.map((player) => {
                          const hero = heroById.get(player.heroId)
                          return (
                            <tr key={player.slot} className={player.win ? 'row-win' : 'row-loss'}>
                              <td>
                                <div className="parser-player-cell">
                                  <HeroPortrait hero={hero} size="sm" />
                                  <div>
                                    <strong>{hero?.localized_name ?? player.heroName}</strong>
                                    <small>{player.personaname ?? (player.accountId ? `#${player.accountId}` : 'Anonymous')} · {player.team}</small>
                                  </div>
                                </div>
                              </td>
                              <td><strong>{player.kills} / {player.deaths} / {player.assists}</strong><small>{player.kda.toFixed(2)} KDA</small></td>
                              <td className="num">{formatNumber(player.goldPerMin)}</td>
                              <td className="num">{formatNumber(player.xpPerMin)}</td>
                              <td className="num">{player.lastHits} / {player.denies}</td>
                              <td className="num">{formatNumber(player.netWorth)}</td>
                              <td className="num">{player.obsPlaced} / {player.senPlaced}</td>
                              <td className="num">{player.stuns.toFixed(1)}s</td>
                              <td className="num">{player.runePickups}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="parser-result-foot">
                    <span><CheckCircle2 size={14} /> {result.match.rawLogLines.toLocaleString()} parser events</span>
                    <span>GPM / XPM derived from the final interval</span>
                    <span>OpenDota metadata enriches names when available</span>
                  </div>
                </section>
              ) : (
                <section className="panel parser-awaiting">
                  <div className="state-icon"><Cpu size={22} /></div>
                  <h2>Choose a replay to parse</h2>
                  <p>
                    Pick a local <code>.dem</code> file, run the OpenDota parser, and inspect the
                    utility layer that the unparsed public match feed cannot provide.
                  </p>
                  <div className="parser-note-grid">
                    <div><strong>Turbo ready</strong><span>The parser reads the replay format, not a curated mode list.</span></div>
                    <div><strong>Private by default</strong><span>Replays stay on this machine; only OpenDota metadata is fetched.</span></div>
                    <div><strong>First pass</strong><span>Final inventories and multi-match squad splits come next.</span></div>
                  </div>
                </section>
              )}
            </main>
          </div>
        </>
      )}
    </div>
  )
}
