import { useMemo, useState } from 'react'
import { Eye, ScanEye } from 'lucide-react'
import type { HeroStat, MatchPlayer } from '../types'
import type { LocalParsedWard } from '../lib/localMatchStats'
import { classNames, formatDuration } from '../lib/format'

interface WardMapProps {
  wards: LocalParsedWard[]
  players: MatchPlayer[]
  heroes: Map<number, HeroStat>
  radiantName: string
  direName: string
  duration: number
}

type KindFilter = 'all' | 'observer' | 'sentry'
type TeamFilter = 'all' | 'radiant' | 'dire'

/** OpenDota's ward coordinates are 0..127 after the 64-unit game offset. */
function mapPosition(x: number, y: number) {
  return {
    left: Math.min(100, Math.max(0, ((x - 64) / 127) * 100)),
    top: Math.min(100, Math.max(0, ((191 - y) / 127) * 100)),
  }
}

export function WardMap({
  wards,
  players,
  heroes,
  radiantName,
  direName,
  duration,
}: WardMapProps) {
  const [kind, setKind] = useState<KindFilter>('all')
  const [team, setTeam] = useState<TeamFilter>('all')
  const [hovered, setHovered] = useState<string | null>(null)

  const playerBySlot = useMemo(
    () => new Map(players.map((player) => [player.player_slot, player])),
    [players],
  )
  const visible = useMemo(
    () =>
      wards.filter(
        (ward) =>
          (kind === 'all' || ward.kind === kind) &&
          (team === 'all' || ward.team === team),
      ),
    [kind, team, wards],
  )
  const observers = wards.filter((ward) => ward.kind === 'observer').length
  const sentries = wards.length - observers

  return (
    <section className="panel ward-map-panel">
      <div className="panel-head ward-map-head">
        <div>
          <span className="eyebrow">Local replay intelligence</span>
          <h2>Ward map</h2>
          <p>Hover or tap a marker for the placement time and hero.</p>
        </div>
        <span className="badge badge-local">
          <Eye size={12} /> {wards.length} wards
        </span>
      </div>

      <div className="ward-map-toolbar" role="group" aria-label="Ward filters">
        <div className="ward-filter-group">
          <span className="muted-label">Type</span>
          {(['all', 'observer', 'sentry'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={classNames('ward-filter', kind === value && 'is-active')}
              onClick={() => setKind(value)}
            >
              {value === 'all' ? 'All' : value === 'observer' ? 'Observers' : 'Sentries'}
              <span>{value === 'all' ? wards.length : value === 'observer' ? observers : sentries}</span>
            </button>
          ))}
        </div>
        <div className="ward-filter-group">
          <span className="muted-label">Team</span>
          {(['all', 'radiant', 'dire'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={classNames('ward-filter', team === value && 'is-active')}
              onClick={() => setTeam(value)}
            >
              {value === 'all' ? 'All' : value === 'radiant' ? radiantName : direName}
            </button>
          ))}
        </div>
        <span className="ward-map-count">
          {visible.length} shown · {formatDuration(duration)} match
        </span>
      </div>

      <div className="ward-map-frame">
        <img src="/assets/map/dota-map.webp" alt="Dota 2 minimap" />
        {visible.map((ward) => {
          const position = mapPosition(ward.x, ward.y)
          const player = playerBySlot.get(ward.playerSlot)
          const hero = ward.heroId != null ? heroes.get(ward.heroId) : undefined
          const name = hero?.localized_name ?? player?.personaname ?? 'Unknown hero'
          const active = hovered === ward.id
          return (
            <button
              type="button"
              key={ward.id}
              className={classNames(
                'ward-pin',
                `ward-pin-${ward.kind}`,
                `ward-pin-${ward.team}`,
                active && 'is-active',
              )}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
              aria-label={`${ward.kind === 'observer' ? 'Observer' : 'Sentry'} ward, ${name}, placed ${formatDuration(ward.time)}`}
              onMouseEnter={() => setHovered(ward.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(ward.id)}
              onBlur={() => setHovered(null)}
              onClick={() => setHovered((current) => (current === ward.id ? null : ward.id))}
            >
              <span className="ward-pin-core">
                {ward.kind === 'observer' ? <Eye size={11} /> : <ScanEye size={11} />}
              </span>
              {active && (
                <span className="ward-tooltip" role="status">
                  <span className="ward-tooltip-head">
                    {ward.kind === 'observer' ? 'Observer Ward' : 'Sentry Ward'}
                    <small>{ward.team === 'radiant' ? 'Radiant' : 'Dire'}</small>
                  </span>
                  <strong>{name}</strong>
                  <span className="ward-tooltip-meta">
                    Placed {formatDuration(ward.time)}
                    {ward.destroyed
                      ? ` · destroyed ${formatDuration(ward.endTime)}`
                      : ` · expires ${formatDuration(ward.endTime)}`}
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="ward-map-legend">
        <span><i className="ward-legend-dot is-observer" /> Observer</span>
        <span><i className="ward-legend-dot is-sentry" /> Sentry</span>
        <span><i className="ward-legend-ring is-radiant" /> Radiant</span>
        <span><i className="ward-legend-ring is-dire" /> Dire</span>
        <span className="ward-map-source">
          <DatabaseIcon /> Positions from the local parser; hover timestamps are match time.
        </span>
      </div>
    </section>
  )
}

function DatabaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="2" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
