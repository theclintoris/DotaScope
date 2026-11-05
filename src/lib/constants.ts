import type { Attribute, Population } from '../types'

export const CDN = 'https://cdn.cloudflare.steamstatic.com'

export const ATTRIBUTES: { value: Attribute | 'all'; label: string; short: string; color: string }[] = [
  { value: 'all', label: 'Universal', short: 'UNI', color: 'var(--attr-all)' },
  { value: 'str', label: 'Strength', short: 'STR', color: 'var(--attr-str)' },
  { value: 'agi', label: 'Agility', short: 'AGI', color: 'var(--attr-agi)' },
  { value: 'int', label: 'Intelligence', short: 'INT', color: 'var(--attr-int)' },
]

export const ATTR_MAP = {
  all: { label: 'Universal', short: 'UNI', color: 'var(--attr-all)' },
  str: { label: 'Strength', short: 'STR', color: 'var(--attr-str)' },
  agi: { label: 'Agility', short: 'AGI', color: 'var(--attr-agi)' },
  int: { label: 'Intelligence', short: 'INT', color: 'var(--attr-int)' },
} as const

export const RANKS = [
  { value: 0, label: 'All ranks', short: 'ALL', color: '#d7d2c4' },
  { value: 1, label: 'Herald', short: 'HER', color: '#b7b2a8' },
  { value: 2, label: 'Guardian', short: 'GUA', color: '#adc19b' },
  { value: 3, label: 'Crusader', short: 'CRU', color: '#b9c8dd' },
  { value: 4, label: 'Archon', short: 'ARC', color: '#8cc4bd' },
  { value: 5, label: 'Legend', short: 'LEG', color: '#d5ba7c' },
  { value: 6, label: 'Ancient', short: 'ANC', color: '#d69773' },
  { value: 7, label: 'Divine', short: 'DIV', color: '#d98a8a' },
] as const

export const RANK_MEDALS = [
  { value: 0, label: 'Uncalibrated', color: '#8a94a3' },
  { value: 1, label: 'Herald', color: '#b7b2a8' },
  { value: 2, label: 'Guardian', color: '#adc19b' },
  { value: 3, label: 'Crusader', color: '#b9c8dd' },
  { value: 4, label: 'Archon', color: '#8cc4bd' },
  { value: 5, label: 'Legend', color: '#d5ba7c' },
  { value: 6, label: 'Ancient', color: '#d69773' },
  { value: 7, label: 'Divine', color: '#d98a8a' },
  { value: 8, label: 'Immortal', color: '#e2b15c' },
]

export const POPULATIONS: {
  value: Population
  label: string
  short: string
  description: string
}[] = [
  { value: 'ranked', label: 'Ranked pubs', short: 'Pubs', description: 'Public ranked sample' },
  { value: 'pro', label: 'Pro scene', short: 'Pro', description: 'Professional matches' },
  { value: 'turbo', label: 'Turbo', short: 'Turbo', description: 'Turbo match sample' },
  { value: 'immortal', label: 'Immortal rank', short: 'Imm', description: 'Top-ladder Spectral sample' },
]

export const HERO_ROLES = [
  'Carry',
  'Support',
  'Nuker',
  'Disabler',
  'Initiator',
  'Durable',
  'Escape',
  'Pusher',
  'Jungler',
] as const

const GAME_MODE_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'All Pick',
  2: 'Captains Mode',
  3: 'Random Draft',
  4: 'Single Draft',
  5: 'All Random',
  6: 'Intro',
  7: 'Diretide',
  8: 'Reverse Captains Mode',
  9: 'Greeviling',
  10: 'Tutorial',
  11: 'Mid Only',
  12: 'Least Played',
  13: 'Limited Heroes',
  14: 'Compendium',
  15: 'Custom',
  16: 'Captains Draft',
  17: 'Balanced Draft',
  18: 'Ability Draft',
  19: 'Event',
  20: 'All Random Deathmatch',
  21: '1v1 Mid',
  22: 'All Draft',
  23: 'Turbo',
  24: 'Mutation',
  25: "Coach's Challenge",
}

const LOBBY_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Practice',
  2: 'Tournament',
  3: 'Tutorial',
  4: 'Co-op Bots',
  5: 'Ranked Team',
  6: 'Ranked Solo',
  7: 'Ranked',
  8: '1v1 Mid',
  9: 'Battle Cup',
  10: 'Local Bots',
  11: 'Spectator',
  12: 'Event',
  13: 'Gauntlet',
  14: 'New Player',
  15: 'Featured',
}

export const GAME_MODE_FILTERS = [1, 2, 3, 4, 5, 16, 18, 20, 22, 23].map((id) => ({
  value: id,
  label: GAME_MODE_LABELS[id],
}))

export const LOBBY_FILTERS = [0, 1, 2, 5, 6, 7, 9, 12, 14].map((id) => ({
  value: id,
  label: LOBBY_LABELS[id],
}))

export function gameModeName(id: number | null | undefined): string {
  if (id == null) return 'Unknown'
  return GAME_MODE_LABELS[id] ?? `Mode ${id}`
}

export function lobbyName(id: number | null | undefined): string {
  if (id == null) return 'Unknown'
  return LOBBY_LABELS[id] ?? `Lobby ${id}`
}

export function attributeInfo(attr: string) {
  if (attr === 'str' || attr === 'agi' || attr === 'int' || attr === 'all') {
    return ATTR_MAP[attr]
  }
  return ATTR_MAP.all
}

export function heroImage(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${CDN}${path}`
}

export function itemImage(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${CDN}${path}`
}

export function rankMedal(rankTier: number | null | undefined) {
  if (!rankTier) return RANK_MEDALS[0]
  const medal = Math.max(1, Math.min(8, Math.floor(rankTier / 10)))
  return RANK_MEDALS[medal] ?? RANK_MEDALS[0]
}

export function rankLabel(rankTier: number | null | undefined): string {
  if (!rankTier) return 'Uncalibrated'
  const medal = Math.floor(rankTier / 10)
  const star = rankTier % 10
  const base = RANK_MEDALS[medal]?.label ?? 'Unknown'
  if (medal === 8 || star === 0) return base
  return `${base} ${star}`
}

export const POSITIONS = [
  { value: 1, label: 'Carry' },
  { value: 2, label: 'Mid' },
  { value: 3, label: 'Offlane' },
  { value: 4, label: 'Soft support' },
  { value: 5, label: 'Hard support' },
]

export const RECORD_FIELDS = [
  { field: 'duration', label: 'Longest match', unit: 'duration', icon: 'clock' },
  { field: 'kills', label: 'Most kills', unit: 'number', icon: 'kills' },
  { field: 'deaths', label: 'Most deaths', unit: 'number', icon: 'deaths' },
  { field: 'assists', label: 'Most assists', unit: 'number', icon: 'assists' },
  { field: 'gold_per_min', label: 'Highest GPM', unit: 'number', icon: 'gpm' },
  { field: 'xp_per_min', label: 'Highest XPM', unit: 'number', icon: 'xpm' },
  { field: 'last_hits', label: 'Most last hits', unit: 'number', icon: 'lasthits' },
  { field: 'denies', label: 'Most denies', unit: 'number', icon: 'denies' },
  { field: 'hero_damage', label: 'Hero damage', unit: 'number', icon: 'damage' },
  { field: 'tower_damage', label: 'Tower damage', unit: 'number', icon: 'tower' },
  { field: 'hero_healing', label: 'Hero healing', unit: 'number', icon: 'healing' },
  { field: 'net_worth', label: 'Highest net worth', unit: 'number', icon: 'networth' },
] as const
