import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Eye, Radio, Swords } from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { fetchHeroMatchups } from '../lib/api'
import { RANKS } from '../lib/constants'
import { classNames, formatPercent } from '../lib/format'
import {
  clockText,
  fetchGsiLatest,
  gameStateLabel,
  isNativeGsiHost,
  readDraftHeroIds,
  type GsiPayload,
} from '../lib/gsi'
import { useDocumentTitle } from '../lib/hooks'
import { buildHeroMetrics } from '../lib/meta'
import type { HeroMatchup, HeroMetric, HeroStat } from '../types'
import { HeroPortrait } from '../components/ui'
import '../overlay.css'

// A compact, mirror-only view of Draft Lab. It is intentionally separate
// from the full page so the native overlay window can load a small document
// and never needs the navigation shell.
interface Suggestion {
  metric: HeroMetric
  score: number
  edge: number
  sample: number
  edges: { enemy: HeroStat; games: number; advantage: number }[]
}

function signedPercent(value: number) {
  const points = value * 100
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)}%`
}

export function DraftOverlayPage() {
  useDocumentTitle('Draft overlay')
  const native = isNativeGsiHost()
  const { heroes, metrics, population, bracket, loading } = useMeta()
  const [payload, setPayload] = useState<GsiPayload | null>(null)
  const [gsiError, setGsiError] = useState('')
  const [matchups, setMatchups] = useState<Record<number, HeroMatchup[]>>({})

  const heroById = useMemo(
    () => new Map(heroes.map((hero) => [hero.id, hero])),
    [heroes],
  )
  const draftMetrics = useMemo(
    () => (population === 'immortal' ? metrics : buildHeroMetrics(heroes, 'ranked', bracket)),
    [heroes, bracket, metrics, population],
  )

  // The overlay is only meaningful when the native GSI bridge is feeding it.
  // Poll at the same cadence as the main Live surface; the page is tiny.
  useEffect(() => {
    if (!native) return
    let cancelled = false
    let timer = 0

    const poll = async () => {
      try {
        const envelope = await fetchGsiLatest()
        if (cancelled) return
        setPayload(envelope.available ? envelope.payload : null)
        setGsiError('')
      } catch (error) {
        if (!cancelled) {
          setPayload(null)
          setGsiError(error instanceof Error ? error.message : 'GSI unavailable')
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2000)
      }
    }

    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [native])

  const teams = useMemo(() => {
    const team2 = readDraftHeroIds(payload?.draft?.team2)
    const team3 = readDraftHeroIds(payload?.draft?.team3)
    const ownTeam = payload?.player?.team
    const ally = ownTeam === 3 ? team3 : team2
    const enemy = ownTeam === 3 ? team2 : team3
    return {
      ally,
      enemy,
      allyHeroes: ally.map((id) => heroById.get(id)).filter((hero): hero is HeroStat => Boolean(hero)),
      enemyHeroes: enemy.map((id) => heroById.get(id)).filter((hero): hero is HeroStat => Boolean(hero)),
    }
  }, [heroById, payload])

  const enemyKey = teams.enemy.join(',')
  useEffect(() => {
    if (!enemyKey) {
      setMatchups({})
      return
    }

    let cancelled = false
    const ids = enemyKey.split(',').map(Number).filter(Number.isFinite)
    Promise.allSettled(ids.map((id) => fetchHeroMatchups(String(id)))).then((results) => {
      if (cancelled) return
      const next: Record<number, HeroMatchup[]> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[ids[index]] = result.value
      })
      setMatchups(next)
    })

    return () => {
      cancelled = true
    }
  }, [enemyKey])

  const suggestions = useMemo<Suggestion[]>(() => {
    const selected = new Set([...teams.ally, ...teams.enemy])
    return draftMetrics
      .filter((metric) => !selected.has(metric.hero.id))
      .map((metric) => {
        let sample = 0
        let weightedEdge = 0
        const edges = teams.enemyHeroes
          .map((enemy) => {
            const row = (matchups[enemy.id] ?? []).find((entry) => entry.hero_id === metric.hero.id)
            if (!row || row.games_played < 10) return null
            // matchup rows are from the enemy hero's perspective.
            const candidateWins = row.games_played - row.wins
            const adjusted = (candidateWins + 30) / (row.games_played + 60)
            const advantage = adjusted - 0.5
            sample += row.games_played
            weightedEdge += advantage * row.games_played
            return { enemy, games: row.games_played, advantage }
          })
          .filter((edge): edge is { enemy: HeroStat; games: number; advantage: number } => Boolean(edge))

        const edge = sample ? weightedEdge / sample : 0
        return {
          metric,
          score: metric.metaScore + edge * 120 + Math.min(sample, 200) / 25,
          edge,
          sample,
          edges,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [draftMetrics, matchups, teams])

  const state = payload?.map?.game_state
  const clock = payload?.map?.clock_time
  const bracketLabel = RANKS.find((rank) => rank.value === bracket)?.label ?? 'All ranks'
  const waiting = native && !payload

  return (
    <main className="overlay-shell">
      <header className="overlay-header">
        <div>
          <div className="overlay-eyebrow">
            <Crosshair size={12} />
            DotaScope draft
          </div>
          <h1>{native ? gameStateLabel(state) : 'Desktop overlay'}</h1>
        </div>
        <div className="overlay-clock">{clockText(clock)}</div>
      </header>

      {!native ? (
        <section className="overlay-empty">
          <Radio size={24} />
          <strong>Open this in the DotaScope desktop app.</strong>
          <p>The draft overlay needs the local GSI bridge.</p>
        </section>
      ) : waiting ? (
        <section className="overlay-empty">
          <Radio size={24} />
          <strong>Waiting for a draft</strong>
          <p>{gsiError || 'Start a match in Dota 2; this window updates automatically.'}</p>
        </section>
      ) : (
        <>
          <section className="overlay-picks">
            <div className="overlay-pick-group">
              <span className="overlay-label"><Eye size={11} /> Their picks</span>
              <div className="overlay-hero-row">
                {teams.enemyHeroes.length
                  ? teams.enemyHeroes.map((hero) => (
                      <div className="overlay-pick" key={hero.id}>
                        <HeroPortrait hero={hero} size="sm" />
                        <span>{hero.localized_name}</span>
                      </div>
                    ))
                  : <span className="overlay-muted">No enemy picks yet</span>}
              </div>
            </div>
            <div className="overlay-pick-group">
              <span className="overlay-label"><Crosshair size={11} /> Your side</span>
              <div className="overlay-hero-row">
                {teams.allyHeroes.length
                  ? teams.allyHeroes.map((hero) => (
                      <div className="overlay-pick" key={hero.id}>
                        <HeroPortrait hero={hero} size="xs" />
                        <span>{hero.localized_name}</span>
                      </div>
                    ))
                  : <span className="overlay-muted">No allied picks yet</span>}
              </div>
            </div>
          </section>

          <section className="overlay-suggestions">
            <div className="overlay-section-head">
              <span className="overlay-label"><Swords size={11} /> Counter picks</span>
              <span className={classNames('overlay-meta', loading && 'is-loading')}>
                {bracketLabel} · {suggestions.length} shown
              </span>
            </div>
            {suggestions.length ? suggestions.map((suggestion) => (
              <article className="overlay-card" key={suggestion.metric.hero.id}>
                <HeroPortrait hero={suggestion.metric.hero} size="sm" />
                <div className="overlay-card-copy">
                  <div className="overlay-card-title">
                    <strong>{suggestion.metric.hero.localized_name}</strong>
                    <span className={suggestion.edge >= 0 ? 'is-good' : 'is-bad'}>
                      {signedPercent(suggestion.edge)}
                    </span>
                  </div>
                  <span className="overlay-card-roles">
                    {suggestion.metric.hero.roles.slice(0, 3).join(' · ')}
                  </span>
                  <span className="overlay-card-detail">
                    {suggestion.edges.length
                      ? suggestion.edges
                          .filter((edge) => edge.advantage > 0)
                          .slice(0, 2)
                          .map((edge) => `${edge.enemy.localized_name} ${formatPercent(edge.advantage, 1)}`)
                          .join(' · ') || 'No positive sample edge'
                      : `${formatPercent(suggestion.metric.winRate, 1)} WR · no enemy sample`}
                  </span>
                </div>
                <div className="overlay-score" title="Blended meta + matchup score">
                  {Math.round(suggestion.score)}
                </div>
              </article>
            )) : (
              <div className="overlay-loading">
                {loading ? 'Loading hero data…' : 'Waiting for enemy picks…'}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="overlay-footer">
        <span>Ctrl+Shift+D to hide</span>
        <span>Borderless / windowed mode</span>
      </footer>
    </main>
  )
}
