import { useEffect, useMemo, useState } from 'react'
import type { RecentMatch } from '../types'

const RANKED_HISTORY_ORIGIN = 'http://127.0.0.1:5601'

interface RankedHistoryRow {
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

interface RankedHistoryResponse {
  matches?: RankedHistoryRow[]
}

function toRecentMatch(row: RankedHistoryRow): RecentMatch {
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

export interface RankedHistoryState {
  rows: RecentMatch[]
  loading: boolean
  available: boolean
  count: number
}

export function useRankedHistory(accountId: number | null): RankedHistoryState {
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

    fetch(`${RANKED_HISTORY_ORIGIN}/ranked-history?accountId=${accountId}&limit=2000`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Ranked history unavailable (${response.status})`)
        return (await response.json()) as RankedHistoryResponse
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

export function useMergedRanked(
  recent: RecentMatch[] | undefined,
  accountId: number | null,
): RecentMatch[] {
  const history = useRankedHistory(accountId)
  return useMemo(() => {
    const merged = new Map<number, RecentMatch>()
    for (const match of recent ?? []) merged.set(match.match_id, match)
    for (const match of history.rows) {
      if (!merged.has(match.match_id)) merged.set(match.match_id, match)
    }
    return [...merged.values()].sort((a, b) => b.start_time - a.start_time)
  }, [recent, history.rows])
}
