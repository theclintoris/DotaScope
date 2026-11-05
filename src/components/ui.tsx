import { useId, type CSSProperties, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { HeroStat } from '../types'
import { attributeInfo, heroImage, rankMedal, rankLabel } from '../lib/constants'
import { classNames, formatCompact, formatPercent, initials } from '../lib/format'

export function Skeleton({
  width,
  height = 12,
  className,
  style,
}: {
  width?: number | string
  height?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={classNames('skeleton', className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <RefreshCw className="spin" size={size} aria-hidden="true" />
}

export function PageLoader({ label = 'Pulling telemetry from OpenDota…' }: { label?: string }) {
  return (
    <div className="state-panel state-loading" role="status">
      <div className="loader-orbit">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = 'Signal lost',
}: {
  error?: Error | null
  onRetry?: () => void
  title?: string
}) {
  return (
    <div className="state-panel state-error" role="alert">
      <span className="state-icon">
        <AlertTriangle size={22} />
      </span>
      <h3>{title}</h3>
      <p>{error?.message ?? 'The data feed did not respond. Please try again.'}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={onRetry}>
          <RefreshCw size={14} /> Retry request
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  icon,
  action,
}: {
  title: string
  children?: ReactNode
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="state-panel state-empty">
      <span className="state-icon">{icon ?? <Inbox size={22} />}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function HeroPortrait({
  hero,
  size = 'md',
  className,
  showName = false,
}: {
  hero: HeroStat | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showName?: boolean
}) {
  const attr = attributeInfo(hero?.primary_attr ?? 'all')
  return (
    <figure
      className={classNames('hero-portrait', `hero-portrait-${size}`, className)}
      style={{ '--hero-attr': attr.color } as CSSProperties}
      title={hero?.localized_name}
    >
      {hero?.img ? (
        <img src={heroImage(hero.img)} alt={hero.localized_name} loading="lazy" />
      ) : (
        <span className="hero-portrait-fallback">{hero ? initials(hero.localized_name) : '?'}</span>
      )}
      {showName && hero && <figcaption>{hero.localized_name}</figcaption>}
    </figure>
  )
}

export function PlayerAvatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null
  name?: string | null
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const pixels = typeof size === 'number' ? size : { xs: 24, sm: 28, md: 40, lg: 56, xl: 92 }[size]
  return (
    <span
      className={classNames('player-avatar', className)}
      style={{ width: pixels, height: pixels }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initials(name)}</span>}
    </span>
  )
}

export function RankBadge({
  rankTier,
  size = 'md',
  showLabel = false,
}: {
  rankTier: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}) {
  const medal = rankMedal(rankTier)
  const star = rankTier ? rankTier % 10 : 0
  const level = rankTier ? Math.floor(rankTier / 10) : 0
  return (
    <span className={classNames('rank-badge-wrap', `rank-${size}`)}>
      <span
        className="rank-medal"
        style={{ '--rank-color': medal.color, '--rank-glow': `${medal.color}33` } as CSSProperties}
      >
        <span className="rank-medal-inner">
          <span className="rank-medal-tier">{level === 8 ? 'IMM' : level || '?'}</span>
          {star > 0 && <span className="rank-medal-stars">{'★'.repeat(star)}</span>}
        </span>
      </span>
      {showLabel && <span className="rank-label">{rankLabel(rankTier)}</span>}
    </span>
  )
}

export function RankChip({ rankTier }: { rankTier: number | null | undefined }) {
  const medal = rankMedal(rankTier)
  return (
    <span className="rank-chip">
      <span className="rank-chip-dot" style={{ background: medal.color }} />
      {rankLabel(rankTier)}
    </span>
  )
}

export function TeamBadge({
  name,
  tag,
  logoUrl,
  size = 28,
}: {
  name?: string | null
  tag?: string | null
  logoUrl?: string | null
  size?: number | 'xs' | 'sm' | 'md' | 'lg'
}) {
  const pixels = typeof size === 'number' ? size : { xs: 22, sm: 28, md: 34, lg: 48 }[size]
  return (
    <span className="team-badge">
      <span className="team-logo" style={{ width: pixels, height: pixels }}>
        {logoUrl ? <img src={logoUrl} alt="" loading="lazy" /> : <span>{initials(tag || name)}</span>}
      </span>
      <span className="team-badge-text">
        <strong>{name ?? 'Unknown team'}</strong>
        {tag && <small>{tag}</small>}
      </span>
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-lede">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string
  title: string
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      <div className="section-heading-right">
        {hint && <span className="section-hint">{hint}</span>}
        {action}
      </div>
    </div>
  )
}

export function Sparkline({
  data,
  width = 96,
  height = 30,
  color,
  label,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  label?: string
}) {
  const rawId = useId()
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  if (!data.length) return <span className="sparkline-empty">—</span>
  const max = Math.max(...data)
  const min = Math.min(...data)
  const spread = max - min || 1
  const padding = 3
  const points = data.map((value, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width
    const y = padding + (1 - (value - min) / spread) * (height - padding * 2)
    return [x, y] as const
  })
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const rising = data[data.length - 1] >= data[0]
  const stroke = color ?? (rising ? 'var(--good)' : 'var(--bad)')
  const last = points[points.length - 1]
  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? 'Recent trend'}
      style={{ color: stroke }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity=".24" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />}
    </svg>
  )
}

export function TrendDelta({
  value,
  suffix = 'd',
  neutralLabel = 'flat',
}: {
  value: number | null | undefined
  suffix?: string
  neutralLabel?: string
}) {
  if (value == null) return <span className="trend-delta trend-flat">—</span>
  if (Math.abs(value) < 0.0005) {
    return <span className="trend-delta trend-flat">{neutralLabel}</span>
  }
  const up = value > 0
  return (
    <span className={classNames('trend-delta', up ? 'trend-up' : 'trend-down')}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {formatPercent(Math.abs(value), 1)}
      <span className="trend-suffix">{suffix}</span>
    </span>
  )
}

export function WinRate({
  value,
  games,
  size = 'md',
  showBar = true,
}: {
  value: number | null | undefined
  games?: number
  size?: 'sm' | 'md' | 'lg'
  showBar?: boolean
}) {
  if (value == null) {
    return (
      <span className={classNames('winrate', `winrate-${size}`, 'winrate-na')}>
        <span className="winrate-value">—</span>
      </span>
    )
  }
  const tone = value >= 0.525 ? 'high' : value <= 0.475 ? 'low' : 'even'
  return (
    <span className={classNames('winrate', `winrate-${size}`, `winrate-${tone}`)}>
      <span className="winrate-value">{formatPercent(value)}</span>
      {showBar && (
        <span className="winrate-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
        </span>
      )}
      {games != null && <span className="winrate-games">{formatCompact(games)}</span>}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  icon,
  foot,
  trend,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  foot?: ReactNode
  trend?: number | null
  tone?: 'default' | 'accent' | 'good' | 'bad'
}) {
  return (
    <article className={classNames('kpi-card', `kpi-${tone}`)}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {trend != null && <TrendDelta value={trend} />}
        {foot}
      </div>
    </article>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  height = 6,
}: {
  value: number
  tone?: 'accent' | 'good' | 'bad' | 'muted'
  height?: number
}) {
  return (
    <span className={classNames('progress', `progress-${tone}`)} style={{ height }}>
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </span>
  )
}

export function AdvantageChart({
  data,
  duration,
  radiantLabel,
  direLabel,
  height = 158,
}: {
  data: number[]
  duration: number
  radiantLabel: string
  direLabel: string
  height?: number
}) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const width = 720
  const pad = 4
  const center = height / 2
  const maxAbs = Math.max(1000, ...data.map((value) => Math.abs(value)))
  const scale = (center - pad) / maxAbs
  const xFor = (index: number) =>
    data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width
  const yFor = (value: number) => center - value * scale
  const points = data.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`)
  const line = data.length ? `M${points.join(' L')}` : ''
  const area = data.length ? `${line} L${width},${center} L0,${center} Z` : ''
  const last = data.length ? data[data.length - 1] : 0
  const lastLabel = last >= 0 ? radiantLabel : direLabel
  return (
    <div className="advantage-chart">
      <div className="advantage-head">
        <span className="adv-team adv-radiant">
          <span className="adv-dot" /> {radiantLabel}
        </span>
        <span className="adv-mid">
          <span className={last >= 0 ? 'text-radiant' : 'text-dire'}>
            {last >= 0 ? '+' : ''}
            {formatCompact(last)}
          </span>{' '}
          <small>{lastLabel} advantage</small>
        </span>
        <span className="adv-team adv-dire">
          {direLabel} <span className="adv-dot" />
        </span>
      </div>
      <svg
        className="adv-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Radiant gold advantage over match time"
        style={{ height }}
      >
        <defs>
          <clipPath id={`pos-${uid}`}>
            <rect x="0" y="0" width={width} height={center} />
          </clipPath>
          <clipPath id={`neg-${uid}`}>
            <rect x="0" y={center} width={width} height={center} />
          </clipPath>
          <linearGradient id={`posfill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--radiant)" stopOpacity=".45" />
            <stop offset="100%" stopColor="var(--radiant)" stopOpacity=".02" />
          </linearGradient>
          <linearGradient id={`negfill-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--dire)" stopOpacity=".45" />
            <stop offset="100%" stopColor="var(--dire)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={width * ratio}
            x2={width * ratio}
            y1="0"
            y2={height}
            stroke="var(--line)"
            strokeDasharray="4 6"
          />
        ))}
        <line x1="0" x2={width} y1={center} y2={center} stroke="var(--line-strong)" strokeDasharray="3 5" />
        <path d={area} fill={`url(#posfill-${uid})`} clipPath={`url(#pos-${uid})`} />
        <path d={area} fill={`url(#negfill-${uid})`} clipPath={`url(#neg-${uid})`} />
        <path d={line} fill="none" stroke="var(--text)" strokeOpacity=".86" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="advantage-axis">
        <span>0:00</span>
        <span>{Math.round(duration / 120)} min</span>
        <span>{Math.round(duration / 60)} min</span>
      </div>
    </div>
  )
}
