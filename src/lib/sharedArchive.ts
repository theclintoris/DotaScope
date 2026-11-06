import type { LocalParsedMatch } from './localMatchStats'

export const SHARED_ARCHIVE_URL = 'https://dotascope-shared.dotascope.workers.dev'
const OPT_IN_KEY = 'dotascope.sharedArchiveOptIn'

export interface SharedArchiveHealth {
  ok: boolean
  matches: number
}

export interface SharedArchiveMatch {
  stats: LocalParsedMatch & { generatedAt?: number; source?: string }
  sharedAt: number
}

function storageAvailable() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function isSharedUploadEnabled(): boolean {
  if (!storageAvailable()) return false
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

export function setSharedUploadEnabled(enabled: boolean): void {
  if (!storageAvailable()) return
  try {
    if (enabled) window.localStorage.setItem(OPT_IN_KEY, '1')
    else window.localStorage.removeItem(OPT_IN_KEY)
    window.dispatchEvent(new Event('dotascope:shared-archive-changed'))
  } catch {
    // Private mode or storage denied: keep the toggle non-persistent.
  }
}

/**
 * The archive only needs the parsed match shape. Player display names and
 * Steam IDs are public data but are not needed for records or benchmarks, so
 * they are stripped before the payload leaves this device.
 */
export function sanitizeSharedMatch(stats: LocalParsedMatch): LocalParsedMatch {
  const players = (stats.players ?? []).map((player) => {
    const clone = { ...player } as Record<string, unknown>
    delete clone.personaname
    delete clone.steamId
    delete clone.steam_id
    return clone as unknown as NonNullable<LocalParsedMatch['players']>[number]
  })
  return {
    ...stats,
    players,
    timeline: stats.timeline ?? [],
    wards: stats.wards ?? [],
  }
}

export async function uploadSharedMatch(stats: LocalParsedMatch): Promise<{
  ok: boolean
  duplicate: boolean
  error: string | null
}> {
  if (!isSharedUploadEnabled()) return { ok: false, duplicate: false, error: 'Sharing is off.' }
  try {
    const response = await fetch(`${SHARED_ARCHIVE_URL}/v1/matches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ match: sanitizeSharedMatch(stats) }),
      signal: AbortSignal.timeout(12_000),
    })
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; duplicate?: boolean; error?: string }
      | null
    if (!response.ok) {
      return { ok: false, duplicate: false, error: payload?.error ?? `Archive returned ${response.status}.` }
    }
    return { ok: true, duplicate: Boolean(payload?.duplicate), error: null }
  } catch (error) {
    return {
      ok: false,
      duplicate: false,
      error: error instanceof Error ? error.message : 'The shared archive is unreachable.',
    }
  }
}

export async function fetchSharedMatch(matchId: string): Promise<SharedArchiveMatch | null> {
  if (!/^\d+$/.test(matchId)) return null
  try {
    const response = await fetch(`${SHARED_ARCHIVE_URL}/v1/matches/${matchId}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    if (!response.ok) return null
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; sharedAt?: number; payload?: LocalParsedMatch }
      | null
    if (!payload?.ok || !payload.payload?.players?.length) return null
    return {
      stats: payload.payload as LocalParsedMatch & { generatedAt?: number; source?: string },
      sharedAt: Number(payload.sharedAt ?? 0),
    }
  } catch {
    return null
  }
}

export interface SharedTurboRow {
  match_id: number
  account_id: number | null
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
  tower_damage: number
  hero_healing: number
  obs_placed?: number
  sen_placed?: number
  camps_stacked?: number
  rune_pickups?: number
  source?: string
}

export async function fetchSharedTurboRows(
  accountId: number,
  limit = 20,
): Promise<SharedTurboRow[]> {
  try {
    const response = await fetch(
      `${SHARED_ARCHIVE_URL}/v1/players/${accountId}/turbo-rows?limit=${limit}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
    )
    if (!response.ok) return []
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; matches?: SharedTurboRow[] }
      | null
    if (!payload?.ok || !Array.isArray(payload.matches)) return []
    return payload.matches.filter(
      (row) =>
        Number.isFinite(row.match_id) &&
        Number.isFinite(row.account_id) &&
        Number(row.match_id) > 0 &&
        Number(row.account_id) > 0,
    )
  } catch {
    return []
  }
}

/**
 * Pull the account's shared Turbo matches and merge them into the local
 * worker's Turbo history. The local worker recalculates the Elo ledger and
 * dedupes by match/account, so imports are idempotent.
 */
export async function syncSharedTurboHistory(
  accountId: number,
  limit = 20,
): Promise<{ fetched: number; added: number }> {
  const rows = await fetchSharedTurboRows(accountId, limit)
  if (!rows.length) return { fetched: 0, added: 0 }
  try {
    const response = await fetch('http://127.0.0.1:5601/shared-history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return { fetched: rows.length, added: 0 }
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; added?: number }
      | null
    const added = Number(payload?.added ?? 0)
    if (added > 0) {
      window.dispatchEvent(new Event('dotascope:turbo-history'))
      window.dispatchEvent(new Event('dotascope:turbo-elo'))
    }
    return { fetched: rows.length, added: Number.isFinite(added) ? added : 0 }
  } catch {
    return { fetched: rows.length, added: 0 }
  }
}

export async function fetchSharedArchiveHealth(): Promise<SharedArchiveHealth | null> {
  try {
    const response = await fetch(`${SHARED_ARCHIVE_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return null
    const payload = (await response.json().catch(() => null)) as { matches?: number } | null
    if (!payload) return null
    return { ok: true, matches: Number(payload.matches ?? 0) }
  } catch {
    return null
  }
}
