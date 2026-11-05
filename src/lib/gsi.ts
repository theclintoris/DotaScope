export interface GsiItemSlot {
  name?: string
  count?: number
}

export interface GsiDraftTeam {
  [key: string]: unknown
}

export interface GsiPayload {
  provider?: {
    name?: string
    appid?: number
    version?: number
    timestamp?: number
  }
  map?: {
    name?: string
    matchid?: string
    game_state?: string
    clock_time?: number
    game_time?: number
    daytime?: boolean
    team2_score?: number
    team3_score?: number
  }
  player?: {
    steamid?: string
    accountid?: number
    name?: string
    team?: number
    activity?: string
    kills?: number
    deaths?: number
    assists?: number
    gold?: number
    gold_reliable?: number
    gold_unreliable?: number
    gpm?: number
    xpm?: number
    net_worth?: number
    last_hits?: number
    denies?: number
  }
  hero?: {
    id?: number
    hero_id?: number
    name?: string
    level?: number
    alive?: boolean
    health?: number
    max_health?: number
    mana?: number
    max_mana?: number
    xpos?: number
    ypos?: number
  }
  items?: Record<string, GsiItemSlot | string | null>
  draft?: {
    team2?: GsiDraftTeam
    team3?: GsiDraftTeam
  }
  events?: unknown[]
  allplayers?: Record<string, unknown>
}

export interface GsiEnvelope {
  bridge: boolean
  available: boolean
  receivedAt: string | null
  payload: GsiPayload | null
}

export interface OwnGsiItem {
  slot: number
  rawName: string
  key: string
  count: number
  neutral: boolean
}

const LIVE_ORIGIN = 'http://127.0.0.1:53000/gsi/latest'

export function isNativeGsiHost() {
  return new URLSearchParams(window.location.search).get('runtime') === 'desktop'
}

export async function fetchGsiLatest(signal?: AbortSignal): Promise<GsiEnvelope> {
  const response = await fetch(LIVE_ORIGIN, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`GSI bridge returned ${response.status}.`)
  }
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('The local GSI bridge is not available in this browser.')
  }
  return (await response.json()) as GsiEnvelope
}

export function normalizeGsiItemName(value: string | undefined | null) {
  if (!value) return ''
  return value.replace(/^item_/, '')
}

function readSlotValue(value: GsiItemSlot | string | null | undefined) {
  if (!value) return { rawName: '', count: 1 }
  if (typeof value === 'string') {
    return { rawName: value, count: 1 }
  }
  return {
    rawName: value.name ?? '',
    count: typeof value.count === 'number' && value.count > 0 ? value.count : 1,
  }
}

export function readOwnItems(items: GsiPayload['items'] | undefined): OwnGsiItem[] {
  if (!items) return []
  const result: OwnGsiItem[] = []
  for (let slot = 0; slot < 6; slot += 1) {
    const value = items[`slot${slot}`] ?? items[`item${slot}`] ?? items[`item_${slot}`]
    const { rawName, count } = readSlotValue(value)
    const key = normalizeGsiItemName(rawName)
    if (key) {
      result.push({ slot, rawName, key, count, neutral: false })
    }
  }

  for (let slot = 0; slot < 3; slot += 1) {
    const value = items[`neutral${slot}`] ?? items[`neutral_${slot}`]
    const { rawName, count } = readSlotValue(value)
    const key = normalizeGsiItemName(rawName)
    if (key) {
      result.push({ slot: 6 + slot, rawName, key, count, neutral: true })
    }
  }
  return result
}

function numericHeroId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return parsed > 0 ? parsed : null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return numericHeroId(record.id) ?? numericHeroId(record.hero_id)
  }
  return null
}

export function readDraftHeroIds(team: GsiDraftTeam | undefined): number[] {
  if (!team) return []
  const ids: number[] = []
  for (let slot = 0; slot < 5; slot += 1) {
    const candidates = [
      team[`pick${slot}_id`],
      team[`pick${slot}`],
      team[`pick_id_${slot}`],
      team[`hero_${slot}`],
      team[`pick${slot}_hero_id`],
    ]
    let id: number | null = null
    for (const candidate of candidates) {
      id = numericHeroId(candidate)
      if (id) break
    }
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function teamLabel(team: number | undefined) {
  if (team === 2) return 'Radiant'
  if (team === 3) return 'Dire'
  return 'Spectator'
}

export function sideFromTeam(team: number | undefined) {
  if (team === 2) return 'radiant'
  if (team === 3) return 'dire'
  return null
}

export function gameStateLabel(state: string | undefined) {
  if (!state) return 'Waiting for draft'
  const clean = state.replace(/^DOTA_GAMERULES_STATE_/, '').replace(/_/g, ' ').toLowerCase()
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function clockText(seconds: number | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '-' : ''
  const value = Math.abs(Math.round(seconds))
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return `${sign}${minutes}:${String(rest).padStart(2, '0')}`
}
