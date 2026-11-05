import { useEffect, useMemo, useState } from 'react'
import type { RecentMatch } from '../types'

const TURBO_HISTORY_ORIGIN = 'http://127.0.0.1:5601'

export interface TurboHistoryRow {
  match_id: number
  account_id: number
  player_slot: number
  radiant_win: boolean
  hero_id: number
  start_time: number
  duration: number
  game_mode: number
  lobby_type: number
  kills: number
  deaths: number
  assists: number
  gold_per_min: number
  xp_per_min: number
  last_hits: number
  denies: number
  hero_damage: number
  source?: string
}

interface TurboHistoryResponse {
  matches?: TurboHistoryRow[]
}

export function toRecentMatch(row: TurboHistoryRow): RecentMatch {
  return {
    match_id: row.match_id,
    player_slot: row.player_slot,
    radiant_win: row.radiant_win,
    hero_id: row.hero_id,
    start_time: row.start_time,
    duration: row.duration,
    game_mode: row.game_mode,
    lobby_type: row.lobby_type,
    version: null,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    average_rank: null,
    xp_per_min: row.xp_per_min,
    gold_per_min: row.gold_per_min,
    hero_damage: row.hero_damage,
    tower_damage: 0,
    hero_healing: 0,
    last_hits: row.last_hits,
    denies: row.denies,
    lane: null,
    lane_role: null,
    is_roaming: null,
    cluster: null,
    leaver_status: 0,
    party_size: null,
    hero_variant: null,
  }
}

export interface TurboHistoryState {
  rows: RecentMatch[]
  loading: boolean
  available: boolean
  count: number
}

export function useTurboHistory(accountId: number | null): TurboHistoryState {
  const [rows, setRows] = useState<RecentMatch[]>([])
  const [loading, setLoading] = useState(Boolean(accountId))
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!accountId) {
      setRows([])
      setLoading(false)
      setAvailable(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    setLoading(true)

    fetch(`${TURBO_HISTORY_ORIGIN}/turbo-history?accountId=${accountId}&limit=2000`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Turbo history unavailable (${response.status})`)
        return (await response.json()) as TurboHistoryResponse
      })
      .then((payload) => {
        const next = (payload.matches ?? [])
          .map(toRecentMatch)
          .filter((match) => Number.isFinite(match.match_id))
        setRows(next)
        setAvailable(next.length > 0)
      })
      .catch(() => {
        setAvailable(false)
      })
      .finally(() => {
        window.clearTimeout(timeout)
        setLoading(false)
      })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [accountId])

  return { rows, loading, available, count: rows.length }
}

export function mergeRecentWithTurbo(
  recent: RecentMatch[] | undefined,
  parsed: RecentMatch[],
): RecentMatch[] {
  const merged = new Map<number, RecentMatch>()
  for (const match of recent ?? []) merged.set(match.match_id, match)
  for (const match of parsed) {
    if (!merged.has(match.match_id)) merged.set(match.match_id, match)
  }
  return [...merged.values()].sort((a, b) => b.start_time - a.start_time)
}

export function useMergedRecent(
  recent: RecentMatch[] | undefined,
  accountId: number | null,
): RecentMatch[] {
  const history = useTurboHistory(accountId)
  return useMemo(
    () => mergeRecentWithTurbo(recent, history.rows),
    [recent, history.rows],
  )
}

export interface TurboPeerHistoryState {
  rows: TurboHistoryRow[]
  loading: boolean
  available: boolean
}

/** All players from the local history that belong to this account's matches. */
export function useTurboPeerHistory(accountId: number | null): TurboPeerHistoryState {
  const [rows, setRows] = useState<TurboHistoryRow[]>([])
  const [loading, setLoading] = useState(Boolean(accountId))
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!accountId) {
      setRows([])
      setLoading(false)
      setAvailable(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    setLoading(true)

    fetch(
      `${TURBO_HISTORY_ORIGIN}/turbo-history?accountId=${accountId}&includePeers=1&limit=5000`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Turbo peer history unavailable (${response.status})`)
        return (await response.json()) as TurboHistoryResponse
      })
      .then((payload) => {
        const next = (payload.matches ?? []).filter((row) => Number.isFinite(row.match_id))
        setRows(next)
        setAvailable(next.length > 0)
      })
      .catch(() => {
        setAvailable(false)
      })
      .finally(() => {
        window.clearTimeout(timeout)
        setLoading(false)
      })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [accountId])

  return { rows, loading, available }
}
