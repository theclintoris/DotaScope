import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  Crosshair,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { HeroMatchup, HeroMetric, HeroStat, PlayerHero } from '../types'
import { useMeta } from '../context/MetaContext'
import { useProfile } from '../context/ProfileContext'
import { fetchHeroMatchups, TTL } from '../lib/api'
import { HERO_ROLES, RANKS } from '../lib/constants'
import { useDocumentTitle, useLockBodyScroll, useRemote } from '../lib/hooks'
import { buildHeroMetrics } from '../lib/meta'
import { classNames, formatNumber, formatPercent } from '../lib/format'
import { ErrorState, HeroPortrait, PageHeader, PageLoader, PlayerAvatar } from '../components/ui'

type TeamSide = 'ally' | 'enemy'
type RoleFilter = 'all' | (typeof HERO_ROLES)[number]

interface HeroSlot {
  side: TeamSide
  index: number
}

interface Suggestion {
  metric: HeroMetric
  score: number
  counterEdge: number
  sample: number
  personal: { games: number; winRate: number } | null
  edges: {
    enemy: HeroStat
    games: number
    advantage: number
  }[]
}

const SLOT_COUNT = 5

function emptyTeam(): (HeroStat | null)[] {
  return Array.from({ length: SLOT_COUNT }, () => null)
}

function edgeLabel(value: number) {
  const points = value * 100
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)}%`
}

function filled<T>(value: T | null): value is T {
  return value !== null
}

export function DraftPage() {
  useDocumentTitle('Draft lab')
  const { heroes, metrics, population, bracket, setBracket, loading, error, refresh } = useMeta()
  const { accountId, profile } = useProfile()
  const myHeroes = useRemote<PlayerHero[]>(
    accountId ? `/players/${accountId}/heroes` : null,
    TTL.player,
  )
  const [personalFit, setPersonalFit] = useState(true)
  const personalPool = useMemo(
    () => new Map((myHeroes.data ?? []).map((hero) => [hero.hero_id, hero])),
    [myHeroes.data],
  )
  const [allyPicks, setAllyPicks] = useState<(HeroStat | null)[]>(emptyTeam)
  const [enemyPicks, setEnemyPicks] = useState<(HeroStat | null)[]>(emptyTeam)
  const [picker, setPicker] = useState<HeroSlot | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [pickerRole, setPickerRole] = useState<RoleFilter>('all')
  const [pickerQuery, setPickerQuery] = useState('')
  const [matchupData, setMatchupData] = useState<Record<number, HeroMatchup[]>>({})
  const [matchupLoading, setMatchupLoading] = useState(false)
  const [matchupError, setMatchupError] = useState('')
  const matchupCache = useRef(new Map<number, HeroMatchup[]>())
  useLockBodyScroll(Boolean(picker))

  const enemyIds = enemyPicks.filter(filled).map((hero) => hero.id)
  const enemyKey = enemyIds.join(',')
  const allyCount = allyPicks.filter(filled).length
  const enemyCount = enemyIds.length
  const allyFull = allyCount >= SLOT_COUNT
  const bracketLabel = RANKS.find((rank) => rank.value === bracket)?.label ?? 'All ranks'

  const draftMetrics = useMemo(
    () => (population === 'immortal' ? metrics : buildHeroMetrics(heroes, 'ranked', bracket)),
    [heroes, bracket, metrics, population],
  )

  useEffect(() => {
    const ids = enemyKey
      ? enemyKey.split(',').map((value) => Number(value)).filter(Number.isFinite)
      : []
    if (!ids.length) {
      setMatchupLoading(false)
      setMatchupError('')
      setMatchupData({})
      return
    }

    let cancelled = false
    setMatchupLoading(true)
    setMatchupError('')

    Promise.allSettled(
      ids.map(async (id) => {
        const cached = matchupCache.current.get(id)
        if (cached) return [id, cached] as const
        const rows = await fetchHeroMatchups(String(id))
        matchupCache.current.set(id, rows)
        return [id, rows] as const
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<number, HeroMatchup[]> = {}
      let failures = 0
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [id, rows] = result.value
          next[id] = rows
        } else {
          failures += 1
        }
      }
      setMatchupData((current) => ({ ...current, ...next }))
      if (failures === ids.length) {
        setMatchupError('Counter data is unavailable right now. The shortlist is still ranked by current meta strength.')
      }
    }).finally(() => {
      if (!cancelled) setMatchupLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [enemyKey])

  useEffect(() => {
    if (!picker) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicker(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [picker])

  const suggestions = useMemo<Suggestion[]>(() => {
    const selected = new Set(
      [...allyPicks, ...enemyPicks].filter(filled).map((hero) => hero.id),
    )
    const enemyHeroes = enemyPicks.filter(filled)
    const lookup = new Map<number, Map<number, HeroMatchup>>()
    for (const enemy of enemyHeroes) {
      const rows = matchupData[enemy.id] ?? []
      lookup.set(enemy.id, new Map(rows.map((row) => [row.hero_id, row])))
    }

    return draftMetrics
      .filter((metric) => !selected.has(metric.hero.id))
      .filter((metric) => roleFilter === 'all' || metric.hero.roles.includes(roleFilter))
      .map((metric) => {
        const edges: Suggestion['edges'] = []
        for (const enemy of enemyHeroes) {
          const row = lookup.get(enemy.id)?.get(metric.hero.id)
          if (!row || row.games_played < 1) continue
          const candidateWins = row.games_played - row.wins
          const adjusted = (candidateWins + 30) / (row.games_played + 60)
          edges.push({
            enemy,
            games: row.games_played,
            advantage: adjusted - 0.5,
          })
        }

        const counterEdge = edges.length
          ? edges.reduce((sum, edge) => sum + edge.advantage, 0) / edges.length
          : 0
        const metaEdge = (metric.metaScore - 50) / 50
        const baseEdge = metric.winRate - 0.5
        const bracketLift = population !== 'immortal' && bracket > 0
          ? Math.max(0, 0.485 - metric.winRate) * 220
          : 0
        const mine = personalPool.get(metric.hero.id)
        const personalGames = mine?.games ?? 0
        const personalWinRate = personalGames ? (mine?.win ?? 0) / personalGames : null
        const personalEdge = personalWinRate != null
          ? (personalWinRate - 0.5) * Math.min(1, personalGames / 25)
          : 0
        const comfortLift = personalFit && personalWinRate != null ? personalEdge * 70 : 0
        const rawScore = enemyHeroes.length
          ? 50 + counterEdge * 260 + metaEdge * 9 + baseEdge * 26 - bracketLift + comfortLift
          : metric.metaScore - bracketLift + comfortLift
        const score = Math.max(1, Math.min(99, Math.round(rawScore)))
        const sample = edges.reduce((sum, edge) => sum + edge.games, 0)

        return {
          metric,
          score,
          counterEdge,
          sample,
          personal: personalWinRate != null ? { games: personalGames, winRate: personalWinRate } : null,
          edges: edges.sort((a, b) => b.advantage - a.advantage),
        }
      })
      .sort((a, b) => b.score - a.score || b.metric.metaScore - a.metric.metaScore)
      .slice(0, 12)
  }, [allyPicks, enemyPicks, matchupData, draftMetrics, bracket, population, roleFilter, personalPool, personalFit])

  const pickerHero = picker
    ? (picker.side === 'ally' ? allyPicks[picker.index] : enemyPicks[picker.index])
    : null
  const pickerPool = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase()
    return heroes
      .filter((hero) => pickerRole === 'all' || hero.roles.includes(pickerRole))
      .filter((hero) => !query || hero.localized_name.toLowerCase().includes(query) || hero.roles.some((role) => role.toLowerCase().includes(query)))
      .sort((a, b) => a.localized_name.localeCompare(b.localized_name))
  }, [heroes, pickerQuery, pickerRole])

  const allPickedIds = new Set(
    [...allyPicks, ...enemyPicks]
      .filter(filled)
      .filter((hero) => hero.id !== pickerHero?.id)
      .map((hero) => hero.id),
  )

  const setSlot = (side: TeamSide, index: number, hero: HeroStat | null) => {
    if (side === 'ally') {
      setAllyPicks((current) => current.map((entry, slot) => (slot === index ? hero : entry)))
    } else {
      setEnemyPicks((current) => current.map((entry, slot) => (slot === index ? hero : entry)))
    }
  }

  const openPicker = (side: TeamSide, index: number) => {
    setPicker({ side, index })
    setPickerQuery('')
    setPickerRole('all')
  }

  const addSuggestion = (hero: HeroStat) => {
    const openSlot = allyPicks.findIndex((entry) => !entry)
    if (openSlot === -1) return
    setSlot('ally', openSlot, hero)
  }

  const resetDraft = () => {
    setAllyPicks(emptyTeam())
    setEnemyPicks(emptyTeam())
    setMatchupData({})
    setMatchupError('')
    setRoleFilter('all')
  }

  if (loading && !heroes.length) return <PageLoader label="Opening the draft room" />
  if (error && !heroes.length) return <ErrorState title="Draft room unavailable" error={error} onRetry={refresh} />

  const bestCounter = suggestions.reduce<{ suggestion: Suggestion; edge: Suggestion['edges'][number] } | null>((best, suggestion) => {
    const strongest = suggestion.edges[0]
    if (!strongest) return best
    if (!best || strongest.advantage > best.edge.advantage) return { suggestion, edge: strongest }
    return best
  }, null)

  return (
    <div className="page-stack draft-page">
      <PageHeader
        eyebrow="Draft intelligence"
        title={<>Pick the <em>better</em> side.</>}
        description="Build both teams, then read the counter board. Suggestions blend adjusted hero-vs-enemy win rates with the current meta sample — a comparison aid, not a win guarantee."
        actions={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetDraft} disabled={!allyCount && !enemyCount}>
              <RotateCcw size={14} /> Reset draft
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openPicker('enemy', enemyPicks.findIndex((entry) => !entry) === -1 ? 0 : enemyPicks.findIndex((entry) => !entry))}
            >
              <Crosshair size={14} /> Pick enemy
            </button>
          </>
        }
      />

      <div className="draft-layout">
        <div className="draft-main">
          <section className="panel draft-arena">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Matchup board</span>
                <h2>The draft room</h2>
              </div>
              <span className="draft-board-note">
                {enemyCount ? `${enemyCount}/5 enemies scouted` : 'Start with their side'}
              </span>
            </div>

            <div className="draft-arena-grid">
              <DraftTeam
                side="enemy"
                picks={enemyPicks}
                onOpen={(index) => openPicker('enemy', index)}
                onClear={(index) => setSlot('enemy', index, null)}
                onClearAll={() => setEnemyPicks(emptyTeam())}
              />
              <div className="draft-vs" aria-hidden="true">
                <span>VS</span>
                <div />
              </div>
              <DraftTeam
                side="ally"
                picks={allyPicks}
                onOpen={(index) => openPicker('ally', index)}
                onClear={(index) => setSlot('ally', index, null)}
                onClearAll={() => setAllyPicks(emptyTeam())}
              />
            </div>

            <div className="draft-board-foot">
              <span>
                <ShieldCheck size={14} /> {allyCount}/5 of your picks locked in
              </span>
              <span>
                <Sparkles size={14} /> {enemyCount ? 'Counter data live' : 'Meta leaders until enemies are picked'}
              </span>
            </div>
          </section>

          <section className="panel draft-read">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Board read</span>
                <h2>What stands out</h2>
              </div>
              <Swords size={17} className="panel-head-icon" />
            </div>
            <div className="draft-read-grid">
              <div>
                <span className="muted-label">Strongest counter found</span>
                <strong>
                  {bestCounter
                    ? `${bestCounter.suggestion.metric.hero.localized_name} vs ${bestCounter.edge.enemy.localized_name}`
                    : 'Add enemy heroes'}
                </strong>
                <small>
                  {bestCounter
                    ? `${edgeLabel(bestCounter.edge.advantage)} adjusted edge · ${formatNumber(bestCounter.edge.games)} parsed games`
                    : 'Counter edges appear once their side has at least one pick.'}
                </small>
              </div>
              <div>
                <span className="muted-label">Sample confidence</span>
                <strong>{suggestions[0]?.sample ? `${formatNumber(suggestions[0].sample)} games` : 'Meta prior'}</strong>
                <small>Adjusted toward 50% when the matchup sample is thin.</small>
              </div>
              <div>
                <span className="muted-label">Open allied slots</span>
                <strong>{SLOT_COUNT - allyCount} remaining</strong>
                <small>{allyFull ? 'Swap a hero or reset a slot to change the board.' : 'Add a suggestion directly from the shortlist.'}</small>
              </div>
            </div>
          </section>
        </div>

        <aside className="panel draft-suggestions">
          <div className="draft-suggest-head">
            <div>
              <span className="eyebrow">Best available</span>
              <h2>{roleFilter === 'all' ? 'Counter shortlist' : `${roleFilter} shortlist`}</h2>
            </div>
            <span className="draft-suggest-count">{suggestions.length} shown</span>
          </div>

          {accountId ? (
            <label className="draft-personal-switch">
              <input
                type="checkbox"
                checked={personalFit}
                onChange={(event) => setPersonalFit(event.target.checked)}
              />
              <PlayerAvatar
                src={profile?.profile.avatarfull}
                name={profile?.profile.personaname}
                size="xs"
              />
              <span className="draft-personal-copy">
                <strong>Weight by my hero pool</strong>
                <small>
                  {myHeroes.loading
                    ? 'Loading your comfort picks…'
                    : `${profile?.profile.personaname ?? 'Your profile'} · ${myHeroes.data?.length ?? 0} heroes played`}
                </small>
              </span>
              <span className="draft-personal-state">{personalFit ? 'On' : 'Off'}</span>
            </label>
          ) : (
            <Link to="/players" className="draft-personal-switch is-link">
              <Users size={15} />
              <span className="draft-personal-copy">
                <strong>Weight suggestions by your hero pool</strong>
                <small>Sign in from the player directory to use personal fit.</small>
              </span>
              <ChevronRight size={15} />
            </Link>
          )}

          {population === 'immortal' ? (
            <div className="draft-bracket-row">
              <span className="muted-label">Immortal lens</span>
              <span className="draft-bracket-note">
                <ShieldCheck size={13} /> Spectral weekly sample
              </span>
            </div>
          ) : (
            <div className="draft-bracket-row">
              <label htmlFor="draft-bracket">MMR bracket</label>
              <div className="select-wrap select-sm">
                <select
                  id="draft-bracket"
                  value={bracket}
                  onChange={(event) => setBracket(Number(event.target.value))}
                >
                  {RANKS.map((rank) => (
                    <option key={rank.value} value={rank.value}>{rank.label}</option>
                  ))}
                </select>
              </div>
              <span className="draft-bracket-note" title="Counter matchups are global OpenDota data. The bracket lens reweights suggestions using that MMR band's win and pick rates.">
                <ShieldCheck size={13} /> {bracket === 0 ? 'No bracket penalty' : `${bracketLabel} guardrail`}
              </span>
            </div>
          )}

          <p className="draft-bracket-hint">
            {population === 'immortal'
              ? 'Immortal hero win and pick rates come from the Spectral weekly sample; counter edges still use the global parsed matchup sample.'
              : bracket === 0
                ? 'Counter matchups are global. Pick an MMR bracket to apply its win-rate guardrail to the shortlist.'
                : `Counter matchups are global; the MMR lens reweights every suggestion with ${bracketLabel.toLowerCase()} win and pick rates so low-win-rate counters drop.`}
          </p>

          <div className="draft-role-row" role="group" aria-label="Filter suggestions by role">
            <button
              type="button"
              className={classNames('draft-role-chip', roleFilter === 'all' && 'is-active')}
              onClick={() => setRoleFilter('all')}
            >
              Any role
            </button>
            {HERO_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                className={classNames('draft-role-chip', roleFilter === role && 'is-active')}
                onClick={() => setRoleFilter(role)}
              >
                {role}
              </button>
            ))}
          </div>

          {matchupLoading ? (
            <div className="draft-inline-loading">
              <span className="spin" /> Scouting enemy matchups…
            </div>
          ) : null}
          {matchupError ? <div className="inline-alert">{matchupError}</div> : null}

          {suggestions.length ? (
            <div className="draft-suggest-list">
              {suggestions.map((suggestion, index) => {
                const hero = suggestion.metric.hero
                const open = !allyFull
                return (
                  <div className="draft-suggest-card" key={hero.id}>
                    <span className="draft-suggest-rank">{String(index + 1).padStart(2, '0')}</span>
                    <HeroPortrait hero={hero} size="sm" />
                    <div className="draft-suggest-copy">
                      <div className="draft-suggest-name">
                        <strong>{hero.localized_name}</strong>
                        <span className="draft-suggest-roles">{hero.roles.slice(0, 3).join(' · ')}</span>
                      </div>
                      <div className="draft-suggest-meta">
                        <span className={classNames('draft-edge', suggestion.counterEdge > 0.015 && 'is-good', suggestion.counterEdge < -0.015 && 'is-bad')}>
                          {suggestion.edges.length ? `${edgeLabel(suggestion.counterEdge)} vs threats` : 'No matchup sample'}
                        </span>
                        <span className="draft-suggest-meta-score">
                          <span className="meta-score-pill">{suggestion.metric.metaScore}</span>
                          <span className="muted-label">meta</span>
                        </span>
                        <span className="draft-bracket-wr">
                          {formatPercent(suggestion.metric.winRate, 1)} WR · {formatNumber(suggestion.metric.picks)}
                        </span>
                        {suggestion.personal ? (
                          <span className={classNames('draft-personal-stat', personalFit && 'is-weighted')}>
                            You: {formatNumber(suggestion.personal.games)} games · {formatPercent(suggestion.personal.winRate, 1)}
                          </span>
                        ) : null}
                      </div>
                      {suggestion.edges.length ? (
                        <div className="draft-edge-row">
                          {suggestion.edges.slice(0, 2).map((edge) => (
                            <span key={edge.enemy.id} className={classNames('draft-edge-chip', edge.advantage > 0 ? 'is-good' : 'is-bad')}>
                              {edge.enemy.localized_name} {edgeLabel(edge.advantage)}
                            </span>
                          ))}
                          {suggestion.edges.length > 2 ? <span className="draft-edge-more">+{suggestion.edges.length - 2}</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="draft-suggest-score">
                      <strong>{suggestion.score}</strong>
                      <span>score</span>
                    </div>
                    <button
                      type="button"
                      className="draft-add-btn"
                      onClick={() => addSuggestion(hero)}
                      disabled={!open}
                      aria-label={open ? `Add ${hero.localized_name} to your team` : 'Your team is full'}
                      title={open ? 'Add to your team' : 'Your team is full'}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="draft-empty">
              <Users size={20} />
              <strong>No heroes match this shape.</strong>
              <span>Switch the role filter or add another enemy pick.</span>
            </div>
          )}

          <div className="draft-suggest-foot">
            <span>
              <Swords size={13} /> Enemy-side matchup data from OpenDota
            </span>
            <span>No win-rate guarantee</span>
          </div>
        </aside>
      </div>

      <p className="draft-note">
        <Sparkles size={14} /> Counter scores are Bayesian-adjusted hero win rates versus the enemy picks, blended with current meta strength. Ally picks are excluded from the pool; they do not create a synergy score.
      </p>

      {picker ? createPortal(
        <div
          className="overlay modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPicker(null)
          }}
        >
          <div className="modal draft-picker" role="dialog" aria-modal="true" aria-label="Pick a hero">
            <div className="draft-picker-head">
              <div>
                <span className="eyebrow">{picker.side === 'enemy' ? 'Enemy side' : 'Your side'} · slot {picker.index + 1}</span>
                <h2>Choose a hero</h2>
              </div>
              <button type="button" className="icon-btn modal-close" onClick={() => setPicker(null)} aria-label="Close hero picker">
                <X size={18} />
              </button>
            </div>

            <div className="draft-picker-search">
              <Search size={15} />
              <input
                autoFocus
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Search heroes or roles…"
                aria-label="Search heroes"
              />
              {pickerQuery ? (
                <button type="button" className="input-clear" onClick={() => setPickerQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="draft-picker-roles">
              <button
                type="button"
                className={classNames('draft-role-chip', pickerRole === 'all' && 'is-active')}
                onClick={() => setPickerRole('all')}
              >
                All
              </button>
              {HERO_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={classNames('draft-role-chip', pickerRole === role && 'is-active')}
                  onClick={() => setPickerRole(role)}
                >
                  {role}
                </button>
              ))}
            </div>

            <div className="draft-picker-grid">
              {pickerPool.map((hero) => {
                const used = allPickedIds.has(hero.id)
                return (
                  <button
                    key={hero.id}
                    type="button"
                    className={classNames('draft-picker-hero', used && 'is-used')}
                    disabled={used}
                    onClick={() => {
                      setSlot(picker.side, picker.index, hero)
                      setPicker(null)
                    }}
                  >
                    <HeroPortrait hero={hero} size="sm" />
                    <span>
                      <strong>{hero.localized_name}</strong>
                      <small>{hero.roles.slice(0, 2).join(' · ')}</small>
                    </span>
                    {used ? <span className="draft-picker-used">Picked</span> : <ChevronRight size={14} />}
                  </button>
                )
              })}
            </div>

            {!pickerPool.length ? (
              <div className="draft-empty">
                <Search size={19} />
                <strong>No hero found.</strong>
                <span>Try a different name or role.</span>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function DraftTeam({
  side,
  picks,
  onOpen,
  onClear,
  onClearAll,
}: {
  side: TeamSide
  picks: (HeroStat | null)[]
  onOpen: (index: number) => void
  onClear: (index: number) => void
  onClearAll: () => void
}) {
  const count = picks.filter(filled).length
  const label = side === 'enemy' ? 'Enemy team' : 'Your team'
  return (
    <div className={classNames('draft-team', `draft-team-${side}`)}>
      <div className="draft-team-head">
        <div>
          <span className={classNames('draft-side-badge', side === 'enemy' ? 'is-dire' : 'is-radiant')}>
            {side === 'enemy' ? 'DIRE' : 'RADIANT'}
          </span>
          <strong>{label}</strong>
        </div>
        <div className="draft-team-actions">
          <span>{count}/5</span>
          {count ? (
            <button type="button" className="icon-btn" onClick={onClearAll} aria-label={`Clear ${label}`} title={`Clear ${label}`}>
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="draft-slots">
        {picks.map((hero, index) => (
          <div className={classNames('draft-slot', hero ? 'is-filled' : 'is-empty')} key={index}>
            {hero ? (
              <>
                <button type="button" className="draft-slot-main" onClick={() => onOpen(index)} aria-label={`Replace ${hero.localized_name}`}>
                  <HeroPortrait hero={hero} size="sm" />
                  <span className="draft-slot-copy">
                    <span className="draft-slot-index">Slot {index + 1}</span>
                    <strong>{hero.localized_name}</strong>
                    <small>{hero.roles.slice(0, 3).join(' · ')}</small>
                  </span>
                  <ChevronRight size={14} className="draft-slot-arrow" />
                </button>
                <button type="button" className="draft-slot-clear" onClick={() => onClear(index)} aria-label={`Remove ${hero.localized_name}`}>
                  <X size={13} />
                </button>
              </>
            ) : (
              <button type="button" className="draft-slot-main is-empty" onClick={() => onOpen(index)}>
                <span className="draft-slot-plus">
                  <Plus size={16} />
                </span>
                <span className="draft-slot-copy">
                  <span className="draft-slot-index">Slot {index + 1}</span>
                  <strong>Pick a hero</strong>
                  <small>Open the pool</small>
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
