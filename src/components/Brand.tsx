import { Link } from 'react-router-dom'

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 2.75 39.35 12.6v20.8L22 43.25 4.65 33.4V12.6L22 2.75Z"
        stroke="currentColor"
        strokeOpacity=".28"
        strokeWidth="1.4"
      />
      <path
        d="M22 9.2 33.4 15.8v12.4L22 34.8 10.6 28.2V15.8L22 9.2Z"
        fill="url(#logo-core)"
        fillOpacity=".13"
        stroke="currentColor"
        strokeOpacity=".55"
        strokeWidth="1"
      />
      <path d="m22 12.5 7.4 18-7.4-4.8-7.4 4.8 7.4-18Z" fill="currentColor" />
      <path d="m22 12.5 7.4 18-7.4-4.8V12.5Z" fill="#fff" fillOpacity=".22" />
      <circle cx="22" cy="22" r="12.8" stroke="currentColor" strokeOpacity=".2" strokeDasharray="2 6" />
      <defs>
        <linearGradient id="logo-core" x1="12" y1="10" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0bd72" />
          <stop offset="1" stopColor="#c35d3d" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="DotaScope home">
      <span className="brand-glyph">
        <LogoMark size={compact ? 29 : 36} />
      </span>
      <span className="brand-type">
        <span className="brand-name">
          DOTA<span>SCOPE</span>
        </span>
        {!compact && <span className="brand-sub">META INTELLIGENCE</span>}
      </span>
    </Link>
  )
}
