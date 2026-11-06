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
