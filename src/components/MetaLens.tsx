import { ArrowUpRight, ChevronDown, Database, Info, RotateCcw } from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { POPULATIONS, RANKS, rankMedal } from '../lib/constants'
import { formatCompact, classNames } from '../lib/format'
import { totalGames } from '../lib/meta'
import { IMMORTAL_ATTRIBUTION } from '../lib/spectral'

export function MetaLens({ compact = false }: { compact?: boolean }) {
  const {
    bracket,
    setBracket,
    population,
    setPopulation,
    latestPatch,
    metrics,
    loading,
    error,
  } = useMeta()
  const ranked = population === 'ranked'
  const immortal = population === 'immortal'
  const games = totalGames(metrics)
  return (
    <section className={classNames('meta-lens', compact && 'meta-lens-compact')} aria-label="Meta lens filters">
      <div className="meta-lens-head">
        <div>
          <span className="eyebrow">Meta lens</span>
          {!compact && <p>Shape every stat on the site.</p>}
        </div>
        <span className="tip" data-tip="OpenDota's heroStats endpoint only exposes rank brackets 1–7. Immortal is a separate seven-day sample from Spectral.">
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
          {!ranked && (
            <span className="lens-label-note">
              {immortal ? 'not split by medal' : 'ranked pubs only'}
            </span>
          )}
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

      <div className={classNames('lens-sample', error && 'is-error')}>
        <Database size={13} />
        <span>
          {immortal && error
            ? 'Immortal sample unavailable'
            : loading
              ? 'Sampling…'
              : `${formatCompact(games)} games · ${metrics.length} heroes`}
        </span>
      </div>

      {immortal && (
        <a
          className="lens-source"
          href={IMMORTAL_ATTRIBUTION}
          target="_blank"
          rel="noreferrer"
          title="Immortal data source"
        >
          Immortal sample by Spectral <ArrowUpRight size={10} />
        </a>
      )}

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
