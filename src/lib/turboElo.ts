import { useEffect, useState } from 'react'

export interface TurboEloPoint {
  matchId: string
  rating: number
  delta: number
  at: number
}

export interface TurboEloPlayer {
  accountId: number
  personaname: string | null
  rating: number
  games: number
  wins: number
  losses: number
  peak: number
  lastDelta: number
  lastMatch: string | null
  lastAt: number | null
  rank: number | null
  history: TurboEloPoint[]
}

export interface TurboEloData {
  baseline: number
  matchesProcessed: number
  playersTracked: number
  updatedAt: number
  player: TurboEloPlayer | null
  leaderboard: TurboEloPlayer[]
}

const ELO_URL = 'http://127.0.0.1:5601/turbo-elo'

export function useTurboElo(accountId: number | null) {
  const [data, setData] = useState<TurboEloData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accountId) {
      setData(null)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 3500)
    setLoading(true)
    fetch(`${ELO_URL}?accountId=${accountId}&limit=100`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: TurboEloData | null) => {
        if (!cancelled) setData(payload)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [accountId])

  return { data, loading }
}
