import { ChevronDown, Database, Info, RotateCcw } from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { POPULATIONS, RANKS, rankMedal } from '../lib/constants'
import { formatCompact, classNames } from '../lib/format'
import { totalGames } from '../lib/meta'

export function MetaLens({ compact = false }: { compact?: boolean }) {
  const {
    bracket,
    setBracket,
    population,
    setPopulation,
    latestPatch,
    metrics,
    loading,
  } = useMeta()
  const ranked = population === 'ranked'
  const games = totalGames(metrics)
  return (
    <section className={classNames('meta-lens', compact && 'meta-lens-compact')} aria-label="Meta lens filters">
      <div className="meta-lens-head">
        <div>
          <span className="eyebrow">Meta lens</span>
          {!compact && <p>Shape every stat on the site.</p>}
        </div>
        <span className="tip" data-tip="OpenDota's heroStats endpoint only exposes samples by rank bracket and mode. Pro and Turbo data are separate populations.">
          <Info size={14} />
        </span>
      </div>

      <div className="lens-field">
        <span className="lens-label">Population</span>
        <div className="segmented" role="group" aria-label="Population">
          {POPULATIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={classNames('segment', population === item.value && 'is-active')}
              onClick={() => setPopulation(item.value)}
              aria-pressed={population === item.value}
            >
              {item.short}
            </button>
          ))}
        </div>
      </div>

      <div className="lens-field">
        <label className="lens-label" htmlFor="rank-bracket">
          Rank bracket
          {!ranked && <span className="lens-label-note">ranked pubs only</span>}
        </label>
        <div className={classNames('select-wrap', !ranked && 'is-disabled')}>
          <select
            id="rank-bracket"
            value={bracket}
            onChange={(event) => setBracket(Number(event.target.value))}
            disabled={!ranked}
          >
            {RANKS.map((rank) => (
              <option key={rank.value} value={rank.value}>
                {rank.label}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="select-chevron" />
          {ranked && bracket > 0 && (
            <span
              className="rank-dot"
              style={{ background: rankMedal(bracket * 10).color }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      <div className="lens-sample">
        <Database size={13} />
        <span>
          {loading ? 'Sampling…' : `${formatCompact(games)} games · ${metrics.length} heroes`}
        </span>
      </div>

      {latestPatch && (
        <div className="lens-patch">
          <span className="live-dot" />
          <span>{latestPatch.name}</span>
          <span className="lens-patch-date">
            {new Date(latestPatch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}

      <button
        type="button"
        className="lens-reset"
        onClick={() => {
          setPopulation('ranked')
          setBracket(0)
        }}
      >
        <RotateCcw size={12} /> Reset lens
      </button>
    </section>
  )
}
