import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MatchDetail, MatchPlayer } from '../types'

const LOCAL_ORIGIN = 'http://127.0.0.1:5601'

export interface LocalParsedPlayer {
  playerSlot: number
  accountId: number | null
  personaname?: string | null
  heroId: number
  team: 'radiant' | 'dire'
  win: boolean
  kills: number
  deaths: number
  assists: number
  lastHits: number
  denies: number
  netWorth: number
  gold: number
  xp: number
  goldPerMin: number
  xpPerMin: number
  heroDamage: number
  towerDamage: number
  stuns: number
  obsPlaced: number
  senPlaced: number
  observersPlaced: number
  campsStacked: number
  creepsStacked: number
  runePickups: number
  teamfightParticipation: number
  towersKilled: number
  roshansKilled: number
}

export interface LocalParsedTimelinePoint {
  minute: number
  radiantGold: number
  direGold: number
  radiantXp: number
  direXp: number
}

export interface LocalParsedMatch {
  match?: {
    matchId: string | number
    gameMode?: number
    duration?: number
    radiantWin?: boolean
    startTime?: number
  }
  players?: LocalParsedPlayer[]
  timeline?: LocalParsedTimelinePoint[]
}

export interface LocalMatchState {
  data: LocalParsedMatch | null
  loading: boolean
  available: boolean
  refresh: () => void
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toAdvantage(
  timeline: LocalParsedTimelinePoint[] | undefined,
  duration: number,
  field: 'gold' | 'xp',
): number[] {
  if (!timeline?.length) return []
  const lastMinute = Math.max(0, Math.floor(duration / 60))
  const points = new Map(timeline.map((point) => [point.minute, point]))
  const values = new Array<number>(lastMinute + 1).fill(0)
  let lastValue = 0
  for (let minute = 0; minute <= lastMinute; minute += 1) {
    const point = points.get(minute)
    if (point) {
      lastValue =
        field === 'gold'
          ? point.radiantGold - point.direGold
          : point.radiantXp - point.direXp
    }
    values[minute] = lastValue
  }
  return values
}

/**
 * Merge the worker's locally parsed stats over OpenDota's basic match payload.
 * OpenDota still supplies identity, items, draft and the base match record.
 */
export function mergeLocalMatch(match: MatchDetail, local: LocalParsedMatch): MatchDetail {
  if (!local.players?.length) return match
  const bySlot = new Map(local.players.map((player) => [player.playerSlot, player]))
  const byAccount = new Map(
    local.players
      .filter((player) => player.accountId != null)
      .map((player) => [player.accountId as number, player]),
  )

  const players: MatchPlayer[] = match.players.map((player) => {
    const localPlayer =
      bySlot.get(player.player_slot) ??
      (player.account_id != null ? byAccount.get(player.account_id) : undefined)
    if (!localPlayer) return player

    return {
      ...player,
      account_id: player.account_id ?? localPlayer.accountId,
      personaname: localPlayer.personaname ?? player.personaname,
      kills: finite(localPlayer.kills, player.kills),
      deaths: finite(localPlayer.deaths, player.deaths),
      assists: finite(localPlayer.assists, player.assists),
      last_hits: finite(localPlayer.lastHits, player.last_hits),
      denies: finite(localPlayer.denies, player.denies),
      gold_per_min: finite(localPlayer.goldPerMin, player.gold_per_min),
      xp_per_min: finite(localPlayer.xpPerMin, player.xp_per_min),
      net_worth: finite(localPlayer.netWorth, player.net_worth),
      total_gold: finite(localPlayer.gold, player.total_gold ?? 0),
      hero_damage: finite(localPlayer.heroDamage, player.hero_damage),
      tower_damage: finite(localPlayer.towerDamage, player.tower_damage),
      stuns: finite(localPlayer.stuns, player.stuns ?? 0),
      obs_placed: finite(localPlayer.obsPlaced, player.obs_placed ?? 0),
      sen_placed: finite(localPlayer.senPlaced, player.sen_placed ?? 0),
      observers_placed: finite(localPlayer.observersPlaced, player.observers_placed ?? 0),
      camps_stacked: finite(localPlayer.campsStacked, player.camps_stacked ?? 0),
      creeps_stacked: finite(localPlayer.creepsStacked, player.creeps_stacked ?? 0),
      rune_pickups: finite(localPlayer.runePickups, player.rune_pickups ?? 0),
    }
  })

  const gold = toAdvantage(local.timeline, match.duration, 'gold')
  const xp = toAdvantage(local.timeline, match.duration, 'xp')

  return {
    ...match,
    players,
    radiant_gold_adv: gold.length ? gold : match.radiant_gold_adv,
    radiant_xp_adv: xp.length ? xp : match.radiant_xp_adv,
  }
}

export function useLocalMatchStats(matchId: string | undefined): LocalMatchState {
  const [data, setData] = useState<LocalParsedMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const numericId = matchId && /^\d+$/.test(matchId) ? matchId : null

  useEffect(() => {
    if (!numericId) {
      setData(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 2500)
    let active = true
    setLoading(true)

    fetch(`${LOCAL_ORIGIN}/stats/${numericId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Local parser unavailable (${response.status})`)
        return (await response.json()) as LocalParsedMatch
      })
      .then((payload) => {
        if (active) setData(payload?.players?.length ? payload : null)
      })
      .catch(() => {
        if (active) setData(null)
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (active) setLoading(false)
      })

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [numericId, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return useMemo(
    () => ({ data, loading, available: Boolean(data?.players?.length), refresh }),
    [data, loading, refresh],
  )
}
