import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Axe,
  Castle,
  Clock3,
  Coins,
  Flame,
  Gem,
  HeartPulse,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import type { RecordEntry } from '../types'
import { RECORD_FIELDS } from '../lib/constants'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { formatDuration, formatNumber, timeAgo } from '../lib/format'
import { useMeta } from '../context/MetaContext'
import {
  EmptyState,
  ErrorState,
  HeroPortrait,
  PageHeader,
  PageLoader,
  SectionHeading,
} from '../components/ui'

type RecordField = (typeof RECORD_FIELDS)[number]
type RecordIconName = RecordField['icon']

const RECORD_ICONS: Record<RecordIconName, ReactNode> = {
  clock: <Clock3 size={16} />,
  kills: <Swords size={16} />,
  deaths: <Skull size={16} />,
  assists: <HeartPulse size={16} />,
  gpm: <Coins size={16} />,
  xpm: <Sparkles size={16} />,
  lasthits: <Axe size={16} />,
  denies: <Shield size={16} />,
  damage: <Flame size={16} />,
  tower: <Castle size={16} />,
  healing: <HeartPulse size={16} />,
  networth: <Gem size={16} />,
}

export function RecordsPage() {
  useDocumentTitle('Hall of records')
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const fieldParam = params.get('field')
  const activeField = RECORD_FIELDS.find((item) => item.field === fieldParam) ?? RECORD_FIELDS[0]
  const records = useRemote<RecordEntry[]>(`/records/${activeField.field}`, 10 * 60 * 1000)
  const [heroQuery, setHeroQuery] = useState('')
  const [windowKey, setWindowKey] = useState<'all' | '30' | '90' | '365'>('all')
  const [visible, setVisible] = useState(25)

  const heroMap = useMemo(() => new Map(meta.heroes.map((hero) => [hero.id, hero])), [meta.heroes])
  const query = heroQuery.trim().toLowerCase()

  const rows = useMemo(() => {
    const cutoff = windowKey === 'all' ? 0 : Date.now() / 1000 - Number(windowKey) * 24 * 60 * 60
    return (records.data ?? []).filter((record) => {
      if (record.start_time < cutoff) return false
      if (query) {
        const hero = record.hero_id ? heroMap.get(record.hero_id) : null
        if (!hero || !hero.localized_name.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [records.data, windowKey, query, heroMap])

  const selectField = (field: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('field', field)
      return next
    })
    setHeroQuery('')
    setVisible(25)
  }

  const topRecord = rows[0]
  const topHero = topRecord?.hero_id ? heroMap.get(topRecord.hero_id) : null
  const topValue = topRecord ? formatRecordValue(topRecord, activeField) : '—'

  return (
    <div className="page-stack records-page">
      <PageHeader
        eyebrow="Historical extremes"
        title="Hall of records"
        description="The highest single-match performances in OpenDota's parsed archive — the fastest stomps, the longest grinds, and the absurd stat lines in between."
        actions={
          <Link to="/data-lab" className="btn btn-ghost">
            <Sparkles size={14} /> Query the archive
          </Link>
        }
      />

      <div className="record-hero">
        <div className="record-hero-copy">
          <span className="record-hero-kicker"><Trophy size={13} /> Current record</span>
          <h2>{activeField.label}</h2>
          <div className="record-hero-score">
            <strong>{topValue}</strong>
            <span>{topHero ? topHero.localized_name : 'Archive leader'}</span>
          </div>
          {topRecord && (
            <Link to={`/matches/${topRecord.match_id}`} className="record-hero-link">
              Match {topRecord.match_id} · {timeAgo(topRecord.start_time)} <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
        <div className="record-hero-art" aria-hidden="true">
          {topHero ? <img src={`https://cdn.cloudflare.steamstatic.com${topHero.img}`} alt="" /> : <Trophy size={72} />}
        </div>
      </div>

      <div className="split-panels records-layout">
        <aside className="panel record-categories">
          <SectionHeading eyebrow="Categories" title="12 record books" />
          <div className="record-category-list">
            {RECORD_FIELDS.map((field) => (
              <button
                key={field.field}
                className={activeField.field === field.field ? 'record-category is-active' : 'record-category'}
                onClick={() => selectField(field.field)}
              >
                <span className="record-category-icon">{RECORD_ICONS[field.icon]}</span>
                <span>{field.label}</span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <p className="panel-footnote">
            Records come from parsed public matches. Unparsed games and private lobbies are excluded.
          </p>
        </aside>

        <section className="panel record-board">
          <SectionHeading
            eyebrow="Leaderboard"
            title={activeField.label}
            hint={`${formatNumber(rows.length)} matching records`}
            action={
              <select className="inline-select" value={windowKey} onChange={(event) => setWindowKey(event.target.value as typeof windowKey)}>
                <option value="all">All time</option>
                <option value="365">Last 365 days</option>
                <option value="90">Last 90 days</option>
                <option value="30">Last 30 days</option>
              </select>
            }
          />

          <div className="filter-bar compact">
            <label className="search-field">
              <Search size={15} />
              <input
                value={heroQuery}
                onChange={(event) => { setHeroQuery(event.target.value); setVisible(25) }}
                placeholder="Filter by hero…"
              />
              {heroQuery && <button className="icon-btn" onClick={() => setHeroQuery('')} aria-label="Clear hero filter"><X size={13} /></button>}
            </label>
            <span className="filter-note"><Clock3 size={13} /> Cached for 10 minutes</span>
            <span className="filter-note"><Zap size={13} /> Score is raw, not normalised</span>
          </div>

          {records.loading && !records.data ? (
            <PageLoader label={`Loading ${activeField.label.toLowerCase()}…`} />
          ) : records.error && !records.data ? (
            <ErrorState error={records.error} onRetry={records.refresh} title="Record book unavailable" />
          ) : rows.length === 0 ? (
            <EmptyState title="No records in this slice" icon={<Trophy size={22} />}>
              Try a wider time window or clear the hero filter.
            </EmptyState>
          ) : (
            <>
              <div className="record-list">
                {rows.slice(0, visible).map((record, index) => {
                  const hero = record.hero_id ? heroMap.get(record.hero_id) : null
                  return (
                    <Link to={`/matches/${record.match_id}`} className="record-row" key={`${record.match_id}-${index}`}>
                      <span className={index < 3 ? 'record-rank is-podium' : 'record-rank'}>{String(index + 1).padStart(2, '0')}</span>
                      {hero ? <HeroPortrait hero={hero} size="sm" /> : <span className="hero-portrait hero-portrait-sm portrait-fallback">?</span>}
                      <div className="record-row-hero">
                        <strong>{hero?.localized_name ?? 'Unknown hero'}</strong>
                        <span>{timeAgo(record.start_time)}</span>
                      </div>
                      <div className="record-row-score">
                        <strong>{formatRecordValue(record, activeField)}</strong>
                        <span>{activeField.unit === 'duration' ? 'match length' : 'record value'}</span>
                      </div>
                      <span className="record-row-match">#{record.match_id}</span>
                      <ArrowUpRight size={14} />
                    </Link>
                  )
                })}
              </div>
              {visible < rows.length && (
                <div className="load-more-row">
                  <button className="btn btn-ghost" onClick={() => setVisible((count) => count + 25)}>
                    Load more <span>{formatNumber(rows.length - visible)} remaining</span>
                  </button>
                </div>
              )}
            </>
          )}
          <p className="panel-footnote">
            A record belongs to the match, not the player. Open the match scoreboard to see who owns the line.
          </p>
        </section>
      </div>
    </div>
  )
}

function formatRecordValue(record: RecordEntry, field: RecordField) {
  return field.unit === 'duration' ? formatDuration(record.score) : formatNumber(record.score)
}
