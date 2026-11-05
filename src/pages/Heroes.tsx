import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronsUpDown,
  Download,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Swords,
} from 'lucide-react'
import type { Attribute, HeroMetric } from '../types'
import { useMeta } from '../context/MetaContext'
import { useDocumentTitle } from '../lib/hooks'
import { ATTRIBUTES, HERO_ROLES, POPULATIONS } from '../lib/constants'
import {
  classNames,
  formatCompact,
  formatNumber,
  formatPercent,
} from '../lib/format'
import {
  EmptyState,
  ErrorState,
  HeroPortrait,
  MetaGradeBadge,
  PageHeader,
  PageLoader,
  Sparkline,
  TrendDelta,
  WinRate,
} from '../components/ui'
import { MetaLens as MetaLensComponent } from '../components/MetaLens'

type SortKey = 'name' | 'winRate' | 'pickRate' | 'picks' | 'trend' | 'metaScore' | 'pro'
type Direction = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Hero' },
  { key: 'winRate', label: 'Win rate', numeric: true },
  { key: 'pickRate', label: 'Pick share', numeric: true },
  { key: 'picks', label: 'Picks', numeric: true },
  { key: 'trend', label: 'Daily trend', numeric: true },
  { key: 'metaScore', label: 'Meta grade', numeric: true },
  { key: 'pro', label: 'Pro presence', numeric: true },
]

function compareRows(a: HeroMetric, b: HeroMetric, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.hero.localized_name.localeCompare(b.hero.localized_name)
    case 'winRate':
      return a.winRate - b.winRate
    case 'pickRate':
      return a.pickRate - b.pickRate
    case 'picks':
      return a.picks - b.picks
    case 'trend': {
      const aValue = a.trendDelta
      const bValue = b.trendDelta
      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1
      return aValue - bValue
    }
    case 'metaScore':
      return a.metaScore - b.metaScore
    case 'pro':
      return a.proPicks + a.proBans - (b.proPicks + b.proBans)
    default:
      return 0
  }
}

export function HeroesPage() {
  useDocumentTitle('Heroes')
  const meta = useMeta()
  const [query, setQuery] = useState('')
  const [attr, setAttr] = useState<Attribute | 'any'>('any')
  const [role, setRole] = useState('any')
  const [attack, setAttack] = useState('any')
  const [cmOnly, setCmOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('metaScore')
  const [direction, setDirection] = useState<Direction>('desc')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = meta.metrics.filter((metric) => {
      const hero = metric.hero
      if (needle) {
        const haystack = `${hero.localized_name} ${hero.name} ${hero.roles.join(' ')}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      if (attr !== 'any' && hero.primary_attr !== attr) return false
      if (role !== 'any' && !hero.roles.includes(role)) return false
      if (attack !== 'any' && hero.attack_type !== attack) return false
      if (cmOnly && !hero.cm_enabled) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      const value = compareRows(a, b, sortKey)
      return direction === 'asc' ? value : -value
    })
  }, [meta.metrics, query, attr, role, attack, cmOnly, sortKey, direction])

  const activeFilters =
    Number(attr !== 'any') +
    Number(role !== 'any') +
    Number(attack !== 'any') +
    Number(cmOnly) +
    Number(Boolean(query.trim()))

  const handlerSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection(key === 'name' ? 'asc' : 'desc')
    }
  }

  const resetFilters = () => {
    setQuery('')
    setAttr('any')
    setRole('any')
    setAttack('any')
    setCmOnly(false)
  }

  const exportCsv = () => {
    const header = [
      'Hero',
      'Attribute',
      'Attack type',
      'Roles',
      'Win rate %',
      'Pick share %',
      'Picks',
      'Wins',
      'Meta score',
      'Pro picks',
      'Pro bans',
    ]
    const body = rows.map((metric) => [
      metric.hero.localized_name,
      metric.hero.primary_attr,
      metric.hero.attack_type,
      metric.hero.roles.join(' / '),
      (metric.winRate * 100).toFixed(2),
      (metric.pickRate * 100).toFixed(2),
      metric.picks,
      metric.wins,
      metric.metaScore,
      metric.proPicks,
      metric.proBans,
    ])
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const csv = [header, ...body].map((row) => row.map(escape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `dotascope-heroes-${meta.population}-${meta.bracket}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (meta.loading && !meta.heroes.length) return <PageLoader />
  if (meta.error && !meta.heroes.length) return <ErrorState error={meta.error} onRetry={meta.refresh} />

  const populationLabel =
    POPULATIONS.find((entry) => entry.value === meta.population)?.label ?? 'Ranked'

  return (
    <div className="page-stack heroes-page">
      <PageHeader
        eyebrow={<><Swords size={12} /> Hero intelligence</>}
        title={<>Every hero. <em>Every angle.</em></>}
        description="Sort the full roster by win rate, pick share, meta grade, or pro presence. Filter by attribute, role, attack type, and Captain's Mode eligibility."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} /> Export CSV
            </button>
            <Link className="btn btn-primary" to="/data-lab">
              Open data lab <ArrowUpRight size={15} />
            </Link>
          </>
        }
      />

      <div className="heroes-layout">
        <div className="heroes-main">
          <div className="filter-panel">
            <div className="filter-search-row">
              <div className="input-wrap search-input">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search hero name or role…"
                  aria-label="Search heroes"
                />
                {query && (
                  <button type="button" className="input-clear" onClick={() => setQuery('')}>
                    Clear
                  </button>
                )}
              </div>
              <div className="filter-count">
                <strong>{rows.length}</strong>
                <span>of {meta.metrics.length} heroes</span>
              </div>
            </div>

            <div className="filter-row">
              <div className="filter-group filter-attributes">
                <span className="filter-label">Attribute</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={classNames('filter-chip', attr === 'any' && 'is-active')}
                    onClick={() => setAttr('any')}
                  >
                    All
                  </button>
                  {ATTRIBUTES.map((attribute) => (
                    <button
                      type="button"
                      key={attribute.value}
                      className={classNames('filter-chip', attr === attribute.value && 'is-active')}
                      onClick={() => setAttr(attribute.value)}
                      style={{ '--chip-color': attribute.color } as CSSProperties}
                    >
                      <span className="chip-dot" />
                      {attribute.short}
                    </button>
                  ))}
                </div>
              </div>

              <label className="filter-group">
                <span className="filter-label">Role</span>
                <span className="select-wrap select-sm">
                  <select value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="any">All roles</option>
                    {HERO_ROLES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <SlidersHorizontal size={12} className="select-chevron" />
                </span>
              </label>

              <label className="filter-group">
                <span className="filter-label">Attack</span>
                <span className="select-wrap select-sm">
                  <select value={attack} onChange={(event) => setAttack(event.target.value)}>
                    <option value="any">Any type</option>
                    <option value="Melee">Melee</option>
                    <option value="Ranged">Ranged</option>
                  </select>
                  <SlidersHorizontal size={12} className="select-chevron" />
                </span>
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  checked={cmOnly}
                  onChange={(event) => setCmOnly(event.target.checked)}
                />
                <span>CM eligible</span>
              </label>

              <label className="filter-group sort-field">
                <span className="filter-label">Sort</span>
                <span className="select-wrap select-sm">
                  <select
                    value={`${sortKey}:${direction}`}
                    onChange={(event) => {
                      const [nextKey, nextDirection] = event.target.value.split(':') as [
                        SortKey,
                        Direction,
                      ]
                      setSortKey(nextKey)
                      setDirection(nextDirection)
                    }}
                  >
                    <option value="metaScore:desc">Meta score · high</option>
                    <option value="winRate:desc">Win rate · high</option>
                    <option value="winRate:asc">Win rate · low</option>
                    <option value="pickRate:desc">Pick share · high</option>
                    <option value="picks:desc">Picks · high</option>
                    <option value="trend:desc">Trending · rising</option>
                    <option value="pro:desc">Pro presence · high</option>
                    <option value="name:asc">Name · A–Z</option>
                  </select>
                  <SlidersHorizontal size={12} className="select-chevron" />
                </span>
              </label>

              {activeFilters > 0 && (
                <button type="button" className="btn btn-quiet btn-sm reset-btn" onClick={resetFilters}>
                  <RotateCcw size={13} /> Reset
                  <span className="filter-badge">{activeFilters}</span>
                </button>
              )}
            </div>
          </div>

          <div className="table-panel heroes-table-panel">
            {rows.length === 0 ? (
              <EmptyState
                title="No heroes match that lens"
                action={
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
                    Clear filters
                  </button>
                }
              >
                Try a broader role, a different attribute, or clear the search.
              </EmptyState>
            ) : (
              <div className="table-wrap heroes-table-wrap">
                <table className="data-table heroes-table">
                  <thead>
                    <tr>
                      <th className="col-rank">#</th>
                      {COLUMNS.map((column, index) => (
                        <th
                          key={column.key}
                          className={classNames(column.numeric ? 'num' : '', index === 0 && 'hero-col')}
                        >
                          <button
                            type="button"
                            className={classNames('sort-button', sortKey === column.key && 'is-sorted')}
                            onClick={() => handlerSort(column.key)}
                          >
                            {column.label}
                            {sortKey === column.key ? (
                              direction === 'asc' ? (
                                <ArrowUp size={12} />
                              ) : (
                                <ArrowDown size={12} />
                              )
                            ) : (
                              <ChevronsUpDown size={12} />
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((metric, index) => (
                      <tr key={metric.hero.id}>
                        <td className="col-rank">{String(index + 1).padStart(2, '0')}</td>
                        <td>
                          <Link className="hero-cell" to={`/heroes/${metric.hero.id}`}>
                            <HeroPortrait hero={metric.hero} size="xs" />
                            <span>
                              <strong>{metric.hero.localized_name}</strong>
                              <small>{metric.hero.roles.slice(0, 2).join(' · ')}</small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <WinRate value={metric.winRate} games={metric.picks} />
                        </td>
                        <td>
                          <span className="pick-share">
                            <span className="mono">{formatPercent(metric.pickRate)}</span>
                            <span className="pick-bar">
                              <span
                                style={{
                                  width: `${Math.min(100, (metric.pickRate / 0.25) * 100)}%`,
                                }}
                              />
                            </span>
                          </span>
                        </td>
                        <td className="num mono">{formatCompact(metric.picks)}</td>
                        <td className="num">
                          <span className="trend-cell">
                            <Sparkline data={metric.pickTrend} width={64} height={22} />
                            <TrendDelta value={metric.trendDelta} />
                          </span>
                        </td>
                        <td className="num">
                          <MetaGradeBadge score={metric.metaScore} />
                        </td>
                        <td className="num">
                          <span className="pro-presence">
                            <strong>{formatNumber(metric.proPicks + metric.proBans)}</strong>
                            <small>
                              {formatNumber(metric.proPicks)}P / {formatNumber(metric.proBans)}B
                            </small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="hero-mobile-grid">
            {rows.map((metric) => (
              <Link key={metric.hero.id} className="hero-mobile-card" to={`/heroes/${metric.hero.id}`}>
                <div className="hero-mobile-head">
                  <HeroPortrait hero={metric.hero} size="sm" />
                  <div>
                    <strong>{metric.hero.localized_name}</strong>
                    <small>{metric.hero.roles.slice(0, 2).join(' · ')}</small>
                  </div>
                  <MetaGradeBadge score={metric.metaScore} size="sm" />
                </div>
                <div className="hero-mobile-stats">
                  <div>
                    <span>Win rate</span>
                    <strong>{formatPercent(metric.winRate)}</strong>
                  </div>
                  <div>
                    <span>Pick share</span>
                    <strong>{formatPercent(metric.pickRate)}</strong>
                  </div>
                  <div>
                    <span>Picks</span>
                    <strong>{formatCompact(metric.picks)}</strong>
                  </div>
                </div>
                <div className="hero-mobile-foot">
                  <Sparkline data={metric.pickTrend} width={88} height={24} />
                  <TrendDelta value={metric.trendDelta} />
                </div>
              </Link>
            ))}
          </div>

          <div className="table-caption">
            <span>
              Population: <strong>{populationLabel}</strong>
              {meta.bracket > 0 ? ` · bracket ${meta.bracket}` : ' · all brackets'}
            </span>
            <span>OpenDota heroStats · sample size varies by hero</span>
          </div>
        </div>

        <aside className="heroes-aside">
          <MetaLensComponent compact />
          <div className="aside-note">
            <span className="eyebrow">Reading the numbers</span>
            <p>
              Win rates are blended across the selected population. Pick share is this hero's portion of
              all picks in the sample. Meta grade blends win and pick strength: S 75+, A 65–74, B 55–64,
              C 45–54, D below 45. Pro presence counts drafted picks and bans.
            </p>
            <div className="aside-legend">
              <span>
                <i className="legend-swatch legend-high" /> ≥ 52.5% strong
              </span>
              <span>
                <i className="legend-swatch legend-even" /> 47.5–52.5% even
              </span>
              <span>
                <i className="legend-swatch legend-low" /> ≤ 47.5% weak
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
