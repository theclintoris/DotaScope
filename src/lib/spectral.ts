import type { ImmortalMatchupRow, ImmortalSnapshot } from '../types'

const BASE = 'https://stats.spectral.gg/lrg2/immapi/'
export const IMMORTAL_REPORT = 'imm_ranked_meta_last_7'
export const IMMORTAL_SOURCE = 'https://stats.spectral.gg/lrg2/immapi/'
export const IMMORTAL_ATTRIBUTION = 'https://spectral.gg/?immortal_rank_api&loc=en'

const CACHE_PREFIX = 'dotascope.spectral.v1:'
const SNAPSHOT_KEY = 'heroes'
const MATCHUP_KEY = 'matchups:'
const SNAPSHOT_TTL = 30 * 60 * 1000
const MATCHUP_TTL = 30 * 60 * 1000

interface Cached<T> {
  savedAt: number
  data: T
}

function readCache<T>(key: string, ttl: number): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    if (!parsed.savedAt || Date.now() - parsed.savedAt > ttl) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ savedAt: Date.now(), data } satisfies Cached<T>),
    )
  } catch {
    /* Cache is a convenience; the live response is still used. */
  }
}

async function spectralGet<T>(
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(BASE)
  url.searchParams.set('report', IMMORTAL_REPORT)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Spectral Immortal API returned ${response.status}.`)
  }
  const payload = (await response.json()) as T & { error?: string }
  if (payload.error) throw new Error(payload.error)
  return payload
}

export async function fetchImmortalSnapshot(force = false): Promise<ImmortalSnapshot> {
  if (!force) {
    const cached = readCache<ImmortalSnapshot>(SNAPSHOT_KEY, SNAPSHOT_TTL)
    if (cached) return cached
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const payload = await spectralGet<Omit<ImmortalSnapshot, 'fetchedAt'>>(
      { endpoint: 'heroes' },
      controller.signal,
    )
    const snapshot: ImmortalSnapshot = { ...payload, fetchedAt: Date.now() }
    writeCache(SNAPSHOT_KEY, snapshot)
    return snapshot
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function fetchImmortalMatchups(
  heroId: number,
  force = false,
): Promise<ImmortalMatchupRow[]> {
  const key = `${MATCHUP_KEY}${heroId}`
  if (!force) {
    const cached = readCache<ImmortalMatchupRow[]>(key, MATCHUP_TTL)
    if (cached) return cached
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const payload = await spectralGet<{
      response: Record<string, Record<string, ImmortalMatchupRow>>
    }>(
      {
        endpoint: 'heroesversus',
        hero: heroId,
        // Spectral rejects large windows (502); 25 covers the high-volume
        // meta matchups without dropping the meaningful samples.
        limit: 25,
      },
      controller.signal,
    )
    const rows = Object.values(payload.response?.[String(heroId)] ?? {}).sort(
      (a, b) => b.matches - a.matches,
    )
    writeCache(key, rows)
    return rows
  } finally {
    window.clearTimeout(timeout)
  }
}
