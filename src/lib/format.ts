export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(digits)}%`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const safe = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatMinutes(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  return `${(seconds / 60).toFixed(1)} min`
}

export function formatUnixDate(unix: number | null | undefined): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatUnixTime(unix: number | null | undefined): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(unix: number | string | null | undefined): string {
  if (!unix) return '—'
  const then = typeof unix === 'string' ? new Date(unix).getTime() / 1000 : unix
  if (!then || Number.isNaN(then)) return '—'
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - then))
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return formatUnixDate(then)
}

export function timeAgoFromIso(value: string | null | undefined): string {
  if (!value) return '—'
  return timeAgo(new Date(value).getTime() / 1000)
}

export function formatKda(kills: number, deaths: number, assists: number): string {
  const kd = deaths === 0 ? kills + assists : (kills + assists) / deaths
  return kd.toFixed(2)
}

export function formatWinRate(wins: number, games: number, digits = 1): string {
  if (!games) return '—'
  return `${((wins / games) * 100).toFixed(digits)}%`
}

export function plural(count: number, word: string, pluralWord?: string): string {
  return `${formatNumber(count)} ${count === 1 ? word : pluralWord ?? `${word}s`}`
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
