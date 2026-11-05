import type {
  ExplorerResponse,
  HeroBenchmarks,
  HeroDuration,
  HeroMatchup,
  ItemConstants,
  MatchDetail,
  PatchInfo,
  PlayerHero,
  PlayerProfile,
  PlayerWinLoss,
  ProMatch,
  PublicMatch,
  RecentMatch,
  RecordEntry,
  SearchPlayer,
  Team,
  ProPlayer,
} from '../types'

const API_BASE = 'https://api.opendota.com/api'
const CACHE_PREFIX = 'dotascope.cache.v1:'
const MAX_CACHE_ENTRIES = 36

export const TTL = {
  meta: 5 * 60 * 1000,
  feed: 2 * 60 * 1000,
  detail: 60 * 60 * 1000,
  player: 5 * 60 * 1000,
  constants: 24 * 60 * 60 * 1000,
  search: 10 * 60 * 1000,
}

interface CacheEntry<T = unknown> {
  savedAt: number
  data: T
}

const memory = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()

export class ApiError extends Error {
  status: number
  detail?: string

  constructor(message: string, status = 0, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function fullUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function readPersistent<T>(key: string): CacheEntry<T> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

function prunePersistentCache(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const entries: { key: string; savedAt: number; size: number }[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key?.startsWith(CACHE_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      let savedAt = 0
      try {
        savedAt = (JSON.parse(raw) as CacheEntry).savedAt ?? 0
      } catch {
        savedAt = 0
      }
      entries.push({ key, savedAt, size: raw.length })
    }
    entries.sort((a, b) => a.savedAt - b.savedAt)
    while (entries.length > MAX_CACHE_ENTRIES) {
      const oldest = entries.shift()
      if (oldest) localStorage.removeItem(oldest.key)
    }
  } catch {
    // Cache pruning is best-effort; a full quota should never break the app.
  }
}

function writePersistent(key: string, entry: CacheEntry): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry))
    prunePersistentCache()
  } catch {
    // Quota or privacy mode: keep using the in-memory cache.
  }
}

function cacheKey(path: string): string {
  return path
}

async function requestJson<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(fullUrl(path), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail = ''
      try {
        detail = (await response.text()).slice(0, 300)
      } catch {
        detail = ''
      }
      if (response.status === 429) {
        throw new ApiError('OpenDota rate limit reached. Please wait a minute and retry.', 429, detail)
      }
      if (response.status === 404) {
        throw new ApiError('That record was not found on OpenDota.', 404, detail)
      }
      throw new ApiError(`OpenDota returned ${response.status}.`, response.status, detail)
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('OpenDota took too long to respond. Try again.', 0, 'Request timed out')
    }
    throw new ApiError(
      'Could not reach OpenDota. Check your connection and try again.',
      0,
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function apiGet<T>(
  path: string,
  options: { ttl?: number; force?: boolean; persist?: boolean } = {},
): Promise<T> {
  const ttl = options.ttl ?? TTL.feed
  const key = cacheKey(path)
  const cached: CacheEntry<T> | undefined =
    (memory.get(key) as CacheEntry<T> | undefined) ?? readPersistent<T>(key) ?? undefined
  if (cached) {
    memory.set(key, cached)
    if (!options.force && Date.now() - cached.savedAt < ttl) {
      return cached.data
    }
  }

  if (!options.force && pending.has(key)) {
    return pending.get(key) as Promise<T>
  }

  const promise = requestJson<T>(path)
    .then((data) => {
      const entry: CacheEntry<T> = { savedAt: Date.now(), data }
      memory.set(key, entry)
      if (options.persist !== false) writePersistent(key, entry)
      return data
    })
    .catch((error: unknown) => {
      // If the network is down, stale data is far more useful than an empty screen.
      if (cached) return cached.data
      throw error
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, promise)
  return promise
}

export function fetchHeroStats(force = false) {
  return apiGet('/heroStats', { ttl: TTL.meta, force })
}

export function fetchProMatches(force = false) {
  return apiGet<ProMatch[]>('/proMatches', { ttl: TTL.feed, force })
}

export function fetchPublicMatches(force = false) {
  return apiGet<PublicMatch[]>('/publicMatches', { ttl: TTL.feed, force })
}

export function fetchTeams(force = false) {
  return apiGet<Team[]>('/teams', { ttl: 10 * 60 * 1000, force })
}

export function fetchProPlayers(force = false) {
  return apiGet<ProPlayer[]>('/proPlayers', { ttl: 30 * 60 * 1000, force })
}

export function fetchPatches(force = false) {
  return apiGet<PatchInfo[]>('/constants/patch', { ttl: TTL.constants, force })
}

export function fetchItems(force = false) {
  return apiGet<ItemConstants>('/constants/items', { ttl: TTL.constants, force })
}

export function fetchSearchPlayers(query: string) {
  return apiGet<SearchPlayer[]>(`/search?q=${encodeURIComponent(query)}`, {
    ttl: TTL.search,
    persist: false,
  })
}

export function fetchPlayer(accountId: string) {
  return apiGet<PlayerProfile>(`/players/${accountId}`, { ttl: TTL.player })
}

export function fetchPlayerWinLoss(accountId: string) {
  return apiGet<PlayerWinLoss>(`/players/${accountId}/wl`, { ttl: TTL.player })
}

export function fetchPlayerHeroes(accountId: string) {
  return apiGet<PlayerHero[]>(`/players/${accountId}/heroes`, { ttl: TTL.player })
}

export function fetchRecentMatches(accountId: string) {
  return apiGet<RecentMatch[]>(`/players/${accountId}/recentMatches`, { ttl: TTL.feed })
}

export function fetchMatch(matchId: string) {
  return apiGet<MatchDetail>(`/matches/${matchId}`, { ttl: TTL.detail })
}

export function fetchHeroMatchups(heroId: string) {
  return apiGet<HeroMatchup[]>(`/heroes/${heroId}/matchups`, { ttl: TTL.detail })
}

export function fetchHeroDurations(heroId: string) {
  return apiGet<HeroDuration[]>(`/heroes/${heroId}/durations`, { ttl: TTL.detail })
}

export function fetchHeroItems(heroId: string) {
  return apiGet<Record<string, Record<string, number>>>(`/heroes/${heroId}/itemPopularity`, {
    ttl: TTL.detail,
  })
}

export function fetchHeroBenchmarks(heroId: string) {
  return apiGet<HeroBenchmarks>(`/benchmarks?hero_id=${heroId}`, {
    ttl: TTL.constants,
  })
}

export function fetchRecords(field: string) {
  return apiGet<RecordEntry[]>(`/records/${field}`, { ttl: 10 * 60 * 1000 })
}

export async function runExplorer(sql: string): Promise<ExplorerResponse> {
  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new ApiError('Only read-only SELECT queries are supported.', 400)
  }
  const trimmed = sql.trim().replace(/;+$/, '')
  const bounded = /\blimit\b/i.test(trimmed) ? trimmed : `${trimmed}\nLIMIT 100`
  const response = await fetch(`${API_BASE}/explorer?sql=${encodeURIComponent(bounded)}`, {
    headers: { Accept: 'application/json' },
  })
  const payload = (await response.json().catch(() => ({}))) as ExplorerResponse
  if (!response.ok || payload.err) {
    const message =
      response.status === 429
        ? 'The OpenDota explorer rate limit was reached. Wait a minute and retry.'
        : payload.err ?? `The query failed with status ${response.status}.`
    throw new ApiError(message, response.status, payload.err)
  }
  return payload
}

export async function fetchTableSchema(table: string) {
  if (!/^[a-z_]+$/i.test(table)) throw new ApiError('Invalid table name.', 400)
  const response = await runExplorer(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`,
  )
  return response.rows.map((row) => ({
    name: String(row.column_name ?? ''),
    type: String(row.data_type ?? ''),
  }))
}
