import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { timeAgo } from '../lib/format'

const COLLECTOR_URL = 'http://127.0.0.1:5601/collector'

interface CollectorStatus {
  accountId: number | null
  paused: boolean
  coordinator: 'desktop-required' | 'available' | 'linked'
  lastScan: number | null
  scanError: string | null
  pending: number
  current: string | null
  entries: {
    matchId: string
    status: 'queued' | 'waiting' | 'parsed' | 'skipped' | 'unavailable'
    message?: string | null
  }[]
}

async function collectorRequest(
  settings?: { accountId?: number | null; paused?: boolean; scan?: boolean },
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(5000)
  const response = await fetch(COLLECTOR_URL, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(settings && {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  })
  if (!response.ok) throw new Error('The local replay collector is unavailable.')
  return response.json() as Promise<CollectorStatus>
}

export function ReplayCollectorProfileSync() {
  const { accountId } = useProfile()
  const lastAccount = useRef<number | null>(null)
  useEffect(() => {
    if (!['dotascope.local', 'localhost', '127.0.0.1'].includes(location.hostname)) return
    if (!accountId && !lastAccount.current) return
    const controller = new AbortController()
    const retry = { timer: 0 }
    const sync = async () => {
      try {
        await collectorRequest({ accountId }, controller.signal)
        if (!controller.signal.aborted) lastAccount.current = accountId
      } catch {
        if (!controller.signal.aborted) retry.timer = window.setTimeout(() => { void sync() }, 30_000)
      }
    }
    void sync()
    return () => {
      controller.abort()
      window.clearTimeout(retry.timer)
    }
  }, [accountId])
  return null
}

const LABELS = {
  queued: 'Queued',
  waiting: 'Waiting for retry',
  parsed: 'Parsed',
  skipped: 'Skipped',
  unavailable: 'Replay unavailable',
}

export function ReplayCollector() {
  const { accountId } = useProfile()
  const [status, setStatus] = useState<CollectorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const webview = (window as Window & { chrome?: { webview?: { postMessage: (command: string) => void } } }).chrome?.webview

  useEffect(() => {
    const controller = new AbortController()
    const nextPoll = { timer: 0 }
    const poll = async () => {
      try {
        const next = await collectorRequest(undefined, controller.signal)
        if (!controller.signal.aborted) setStatus(next)
      } catch {
        if (!controller.signal.aborted) setStatus(null)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          nextPoll.timer = window.setTimeout(() => { void poll() }, 5000)
        }
      }
    }
    void poll()
    return () => {
      controller.abort()
      window.clearTimeout(nextPoll.timer)
    }
  }, [])

  async function update(settings: { paused?: boolean; scan?: boolean }) {
    setUpdating(true)
    setError(null)
    try {
      setStatus(await collectorRequest(settings))
    } catch {
      setError('Could not update the local replay collector.')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <section className="panel replay-collector" aria-labelledby="collector-title">
      <div className="replay-collector-heading">
        <div>
          <h2 id="collector-title">Automatic Turbo replays</h2>
          <p>Find recent Turbo matches, download their replays, and parse them on this PC.</p>
        </div>
        {status && (
          <div className="replay-collector-actions">
            <button type="button" className="btn btn-ghost" disabled={updating || status.paused || !status.accountId} onClick={() => void update({ scan: true })}>Check now</button>
            <button type="button" className="btn btn-ghost" disabled={updating || !status.accountId} onClick={() => void update({ paused: !status.paused })}>{status.paused ? 'Resume catch-up' : 'Pause catch-up'}</button>
          </div>
        )}
      </div>
      {loading && <p className="muted-copy">Checking the local worker…</p>}
      {!loading && !status && <p className="muted-copy">Start the local parser worker with the Windows desktop app.</p>}
      {status && (
        <>
          <div className="replay-collector-setup">
            <div>
              <strong>{status.paused ? 'Paused' : status.accountId ? 'Tracking account ' + status.accountId : 'No tracked profile'}</strong>
              <p>{status.accountId
                ? status.lastScan ? 'Last checked ' + timeAgo(status.lastScan / 1000) + ' · ' + status.pending + ' pending' : status.pending + ' pending'
                : accountId ? 'Connecting your pinned profile…' : 'Pin your Dota profile to start catching up on recent Turbo matches.'}</p>
              {!accountId && !status.accountId && <Link className="text-link" to="/players">Open Players</Link>}
            </div>
            <div>
              <strong>{status.coordinator === 'linked' ? 'Steam replay access connected' : 'Steam replay access'}</strong>
              <p>{status.coordinator === 'linked' ? 'Valve can be checked when OpenDota has no replay link.' : status.coordinator === 'desktop-required' ? 'The Windows portable app can check Valve directly.' : 'Connect a separate Steam account once to check Valve directly.'}</p>
              {webview && status.coordinator !== 'desktop-required' && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => webview.postMessage(status.coordinator === 'linked' ? 'replay-steam-unlink' : 'replay-steam-link')}>
                  {status.coordinator === 'linked' ? 'Disconnect' : 'Connect with Steam Guard'}
                </button>
              )}
            </div>
          </div>
          {status.scanError && <p className="muted-copy">{status.scanError} Another check is scheduled.</p>}
          {status.entries.length > 0 && (
            <ul className="replay-collector-list" aria-label="Recent replay activity">
              {status.entries.map((entry) => (
                <li key={entry.matchId}>
                  <Link className="text-link" to={`/matches/${entry.matchId}`}>{entry.matchId}</Link>
                  <strong>{entry.matchId === status.current ? 'Collecting replay…' : LABELS[entry.status]}</strong>
                  {entry.message && <small>{entry.message}</small>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert" className="parser-error-text">{error}</p>}
    </section>
  )
}
