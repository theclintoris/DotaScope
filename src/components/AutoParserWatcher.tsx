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

const WORKER_URL = 'http://127.0.0.1:5601'
const AUTO_PARSE_DELAY_MS = 12_000
const AUTO_RETRY_MS = 30_000
const MAX_ATTEMPTS = 3

export function AutoParserWatcher() {
  const native = isNativeGsiHost()
  const seen = useRef<Set<number>>(new Set())
  const attempts = useRef<Map<number, number>>(new Map())
  const busy = useRef(false)
  const toastTimer = useRef<number | null>(null)
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

    const check = async () => {
      if (busy.current) return
      let gsi
      try {
        gsi = await fetchGsiLatest()
      } catch {
        return
      }
      const map = gsi.payload?.map
      if (!map || map.game_state !== 'DOTA_GAMERULES_STATE_POST_GAME') return
      const matchId = Number(map.matchid)
      if (!Number.isFinite(matchId) || matchId <= 0 || seen.current.has(matchId)) return

      seen.current.add(matchId)
      const attempt = (attempts.current.get(matchId) ?? 0) + 1
      attempts.current.set(matchId, attempt)
      busy.current = true
      showToast({ kind: 'working', message: `Match finished. Reading replay ${matchId}…` })
      try {
        await new Promise((resolve) => window.setTimeout(resolve, AUTO_PARSE_DELAY_MS))
        const response = await fetch(`${WORKER_URL}/parse`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ matchId, download: true, competitiveOnly: true }),
        })
        const data = (await response.json().catch(() => null)) as
          | { error?: string; skipped?: boolean; reason?: string; match?: { gameModeName?: string } }
          | null
        if (!response.ok) throw new Error(data?.error ?? `Parser worker returned ${response.status}.`)
        attempts.current.delete(matchId)
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
        const canRetry = attempt < MAX_ATTEMPTS
        if (canRetry) {
          window.setTimeout(() => seen.current.delete(matchId), AUTO_RETRY_MS)
        }
        showToast({
          kind: 'error',
          message: `${error instanceof Error ? error.message : 'Automatic parsing failed.'} ${canRetry ? 'Retrying in 30 seconds.' : 'Use Parser lab to retry.'}`,
        })
      } finally {
        busy.current = false
      }
    }

    void check()
    const interval = window.setInterval(() => { void check() }, 3500)
    return () => {
      window.clearInterval(interval)
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [native])

  if (!native || !toast) return null

  const Icon = toast.kind === 'working' ? Loader2 : toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : CheckCircle2

  return (
    <div className={classNames('auto-parse-toast', `is-${toast.kind}`)} role="status" aria-live="polite">
      <span className="auto-parse-icon"><Icon size={17} className={toast.kind === 'working' ? 'spin' : undefined} /></span>
      <span className="auto-parse-copy">
        <strong>{toast.kind === 'working' ? 'Automatic replay parse' : toast.kind === 'success' ? 'Match data ready' : toast.kind === 'error' ? 'Auto-parse needs a hand' : 'Replay skipped'}</strong>
        <span>{toast.message}</span>
        <Link to="/parser">Open Parser lab</Link>
      </span>
      <button type="button" className="auto-parse-close" onClick={() => setToast(null)} aria-label="Dismiss parser notification">
        <X size={14} />
      </button>
    </div>
  )
}
