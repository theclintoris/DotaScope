import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { fetchGsiLatest, isNativeGsiHost } from '../lib/gsi'
import { isSharedUploadEnabled, uploadSharedMatch } from '../lib/sharedArchive'
import type { LocalParsedMatch } from '../lib/localMatchStats'
import { classNames } from '../lib/format'

type ToastKind = 'working' | 'success' | 'info' | 'error'

interface ToastState {
  kind: ToastKind
  message: string
}

interface PendingReplay {
  matchId: number
  firstSeen: number
  attempts: number
  nextAttemptAt: number
  lastError?: string
}

const WORKER_URL = 'http://127.0.0.1:5601'
const PENDING_KEY = 'dotascope.pendingReplays'
const AUTO_PARSE_DELAY_MS = 12_000
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
const MAX_PENDING = 25

function loadPending(): PendingReplay[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (entry): entry is PendingReplay =>
        entry &&
        Number.isFinite(entry.matchId) &&
        entry.matchId > 0 &&
        Number.isFinite(entry.firstSeen) &&
        Number.isFinite(entry.attempts) &&
        Number.isFinite(entry.nextAttemptAt),
    )
  } catch {
    return []
  }
}

function savePending(entries: PendingReplay[]) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(entries.slice(-MAX_PENDING)))
  } catch {
    // Storage can be unavailable in private/embedded contexts; queued retries still work this session.
  }
}

function retryDelay(attempts: number): number {
  if (attempts <= 1) return 30_000
  if (attempts === 2) return 2 * 60_000
  if (attempts === 3) return 5 * 60_000
  if (attempts <= 6) return 15 * 60_000
  return 30 * 60_000
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Automatic parsing failed.'
}

export function AutoParserWatcher() {
  const native = isNativeGsiHost()
  const seen = useRef<Set<number>>(new Set())
  const busy = useRef(false)
  const toastTimer = useRef<number | null>(null)
  const failureNotified = useRef<Set<number>>(new Set())
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!native) return

    const showToast = (next: ToastState) => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      setToast(next)
      if (next.kind !== 'working') {
        toastTimer.current = window.setTimeout(
          () => setToast(null),
          next.kind === 'success' ? 9000 : 14_000,
        )
      }
    }

    const enqueue = (matchId: number) => {
      if (seen.current.has(matchId)) return
      seen.current.add(matchId)
      const pending = loadPending()
      if (pending.some((entry) => entry.matchId === matchId)) return
      const now = Date.now()
      pending.push({
        matchId,
        firstSeen: now,
        attempts: 0,
        nextAttemptAt: now + AUTO_PARSE_DELAY_MS,
      })
      savePending(pending)
      showToast({
        kind: 'info',
        message: `Match ${matchId} finished. Waiting for a replay source; DotaScope will retry automatically.`,
      })
    }

    const checkGsi = async () => {
      let gsi
      try {
        gsi = await fetchGsiLatest()
      } catch {
        return
      }
      const map = gsi.payload?.map
      if (!map || map.game_state !== 'DOTA_GAMERULES_STATE_POST_GAME') return
      const matchId = Number(map.matchid)
      if (!Number.isFinite(matchId) || matchId <= 0) return
      enqueue(matchId)
    }

    const processQueue = async () => {
      if (busy.current) return
      const now = Date.now()
      const pending = loadPending()
      if (pending.length === 0) return

      // Expire old entries even when their next retry is in the future.
      const expired = pending.filter((entry) => now - entry.firstSeen > PENDING_TTL_MS)
      if (expired.length > 0) {
        const expiredIds = new Set(expired.map((entry) => entry.matchId))
        savePending(pending.filter((entry) => !expiredIds.has(entry.matchId)))
        const last = expired[expired.length - 1]
        showToast({
          kind: 'error',
          message: `No replay source became available for match ${last.matchId}. Download the replay in Dota 2 to parse it locally.`,
        })
        return
      }

      const entry = pending
        .filter((candidate) => candidate.nextAttemptAt <= now)
        .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0]
      if (!entry) return

      busy.current = true
      try {
        const response = await fetch(`${WORKER_URL}/parse`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ matchId: entry.matchId, download: true, competitiveOnly: true }),
        })
        const data = (await response.json().catch(() => null)) as
          | { error?: string; skipped?: boolean; reason?: string; match?: { gameModeName?: string } }
          | null
        if (!response.ok) throw new Error(data?.error ?? `Parser worker returned ${response.status}.`)

        // Always remove on success or an intentional skip.
        savePending(loadPending().filter((candidate) => candidate.matchId !== entry.matchId))
        failureNotified.current.delete(entry.matchId)

        if (data?.skipped) {
          showToast({ kind: 'info', message: 'That match was not Ranked or Turbo, so it was left alone.' })
        } else {
          if (data && isSharedUploadEnabled()) {
            void uploadSharedMatch(data as unknown as LocalParsedMatch)
          }
          showToast({
            kind: 'success',
            message: `Replay parsed${data?.match?.gameModeName ? ` · ${data.match.gameModeName}` : ''}. Open Parser lab for the full line-up.`,
          })
        }
      } catch (error) {
        const attempts = entry.attempts + 1
        const delay = retryDelay(attempts)
        const nextAttemptAt = Date.now() + delay
        const withinWindow = Date.now() - entry.firstSeen <= PENDING_TTL_MS
        if (withinWindow) {
          const current = loadPending()
          const index = current.findIndex((candidate) => candidate.matchId === entry.matchId)
          if (index >= 0) {
            current[index] = {
              ...current[index],
              attempts,
              nextAttemptAt,
              lastError: errorText(error),
            }
            savePending(current)
          }
        } else {
          savePending(loadPending().filter((candidate) => candidate.matchId !== entry.matchId))
        }

        if (!failureNotified.current.has(entry.matchId) || !withinWindow) {
          failureNotified.current.add(entry.matchId)
          showToast({
            kind: withinWindow ? 'info' : 'error',
            message: withinWindow
              ? `Replay not available yet (${errorText(error)}). Retrying automatically for up to 24 hours.`
              : `No replay source became available for match ${entry.matchId}. Download the replay in Dota 2 to parse it locally.`,
          })
        }
      } finally {
        busy.current = false
      }
    }

    void checkGsi()
    void processQueue()
    const gsiTimer = window.setInterval(() => { void checkGsi() }, 3500)
    const queueTimer = window.setInterval(() => { void processQueue() }, 5000)

    return () => {
      window.clearInterval(gsiTimer)
      window.clearInterval(queueTimer)
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [native])

  if (!native || !toast) return null

  const Icon = toast.kind === 'working' ? Loader2 : toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : CheckCircle2

  return (
    <div className={classNames('auto-parse-toast', `is-${toast.kind}`)} role="status" aria-live="polite">
      <span className="auto-parse-icon"><Icon size={17} className={toast.kind === 'working' ? 'spin' : undefined} /></span>
      <span className="auto-parse-copy">
        <strong>{toast.kind === 'working' ? 'Automatic replay parse' : toast.kind === 'success' ? 'Match data ready' : toast.kind === 'error' ? 'Auto-parse needs a hand' : 'Waiting for replay'}</strong>
        <span>{toast.message}</span>
        <Link to="/parser">Open Parser lab</Link>
      </span>
      <button type="button" className="auto-parse-close" onClick={() => setToast(null)} aria-label="Dismiss parser notification">
        <X size={14} />
      </button>
    </div>
  )
}
