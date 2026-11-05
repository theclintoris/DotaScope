import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FlaskConical, Gem, Info, Sparkles, Swords, Wrench } from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { fetchHeroItems, fetchHeroMatchups, runExplorer } from '../lib/api'
import { TTL } from '../lib/api'
import { fetchImmortalMatchups } from '../lib/spectral'
import { formatNumber, formatPercent } from '../lib/format'
import { heroImage, itemImage } from '../lib/constants'
import type {
  DotaItem,
  HeroMetric,
  ItemConstants,
} from '../types'
import {
  EmptyState,
  HeroPortrait,
  MetaGradeBadge,
  PageHeader,
  SectionHeading,
  Skeleton,
} from '../components/ui'

const ITEM_CACHE_KEY = 'dotascope.metaEscape.items.v1'
const ITEM_CACHE_TTL = 6 * 60 * 60 * 1000
function metaBuildQuery(heroIds: number[]): string {
  const ids = heroIds
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 5)
    .join(',')
  return `
WITH recent AS (
  SELECT match_id, radiant_win
  FROM matches
  WHERE start_time > extract(epoch from now()) - 90 * 86400
),
hero_games AS (
  SELECT pm.hero_id, count(*)::int AS games
  FROM player_matches pm
  JOIN recent m USING (match_id)
  WHERE pm.hero_id IN (${ids})
  GROUP BY pm.hero_id
),
buys AS (
  SELECT pm.hero_id, v.item_id,
    count(*)::int AS purchases,
    sum(CASE WHEN (pm.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END)::int AS wins
  FROM player_matches pm
  JOIN recent m USING (match_id)
  CROSS JOIN LATERAL (
    VALUES (pm.item_0), (pm.item_1), (pm.item_2),
      (pm.item_3), (pm.item_4), (pm.item_5), (pm.item_neutral)
  ) AS v(item_id)
  WHERE pm.hero_id IN (${ids}) AND v.item_id IS NOT NULL AND v.item_id <> 0
  GROUP BY pm.hero_id, v.item_id
)
SELECT b.hero_id, b.item_id, i.name, i.cost, hg.games, b.purchases,
  round(100.0 * b.purchases / NULLIF(hg.games, 0), 2) AS buy_rate,
  round(100.0 * b.wins / NULLIF(b.purchases, 0), 2) AS win_rate
FROM buys b
JOIN items i ON i.id = b.item_id
JOIN hero_games hg USING (hero_id)
WHERE i.cost >= 2500 AND b.purchases >= 20
ORDER BY b.hero_id, win_rate DESC, b.purchases DESC
LIMIT 100
`
}

function parseBuildRows(rows: Record<string, unknown>[]): MetaBuildRow[] {
  return rows.map((row) => ({
    ...parseItemRow(row),
    hero_id: numberValue(row.hero_id),
    games: numberValue(row.games),
    buy_rate: numberValue(row.buy_rate),
  }))
}

const ITEM_QUERY = `
WITH recent AS (
  SELECT match_id, radiant_win
  FROM matches
  WHERE start_time > extract(epoch from now()) - 30 * 86400
),
player_games AS (
  SELECT count(*)::int AS total
  FROM player_matches pm
  JOIN recent m USING (match_id)
),
buys AS (
  SELECT v.item_id,
    count(*)::int AS purchases,
    sum(CASE WHEN (pm.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END)::int AS wins
  FROM player_matches pm
  JOIN recent m USING (match_id)
  CROSS JOIN LATERAL (
    VALUES (pm.item_0), (pm.item_1), (pm.item_2),
      (pm.item_3), (pm.item_4), (pm.item_5), (pm.item_neutral)
  ) AS v(item_id)
  WHERE v.item_id IS NOT NULL AND v.item_id <> 0
  GROUP BY v.item_id
)
SELECT b.item_id, i.name, i.cost, b.purchases,
  round(100.0 * b.purchases / NULLIF(pg.total, 0), 2) AS pick_rate,
  round(100.0 * b.wins / NULLIF(b.purchases, 0), 2) AS win_rate
FROM buys b
JOIN items i ON i.id = b.item_id
CROSS JOIN player_games pg
WHERE i.cost >= 2500 AND b.purchases >= 80
ORDER BY b.purchases DESC
LIMIT 100
`

interface ItemRow {
  item_id: number
  name: string
  cost: number
  purchases: number
  pick_rate: number
  win_rate: number
}

interface MetaBuildRow extends ItemRow {
  hero_id: number
  games: number
  buy_rate: number
}

interface MetaBuildItem extends MetaBuildRow {
  item: DotaItem | null
  lift: number
}

interface MetaPunisher {
  metric: HeroMetric
  games: number
  winRate: number
  edge: number
}

interface MetaBuild {
  metric: HeroMetric
  items: MetaBuildItem[]
  punishers: MetaPunisher[]
}

interface CounterTarget {
  metric: HeroMetric
  games: number
  winRate: number
  edge: number
}

interface EscapeMatchup {
  hero_id: number
  games: number
  winRate: number
}

interface EscapeHero {
  metric: HeroMetric
  counters: CounterTarget[]
  strength: number
}

interface EscapeItem {
  row: ItemRow
  item: DotaItem | null
  carrier: EscapeHero | null
  carrierPurchases: number
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseItemRow(row: Record<string, unknown>): ItemRow {
  return {
    item_id: numberValue(row.item_id),
    name: String(row.name ?? ''),
    cost: numberValue(row.cost),
    purchases: numberValue(row.purchases),
    pick_rate: numberValue(row.pick_rate),
    win_rate: numberValue(row.win_rate),
  }
}

function parseItemRows(rows: Record<string, unknown>[]): ItemRow[] {
  return rows.map(parseItemRow)
}

function readItemCache(): { at: number; rows: ItemRow[] } | null {
  try {
    const raw = localStorage.getItem(ITEM_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; rows?: ItemRow[] }
    if (!parsed.at || !Array.isArray(parsed.rows)) return null
    if (Date.now() - parsed.at > ITEM_CACHE_TTL) return null
    return { at: parsed.at, rows: parsed.rows }
  } catch {
    return null
  }
}

function cleanItemName(name: string): string {
  return name.replace(/^item_/, '').replace(/_/g, ' ')
}

function getCounters(matchups: EscapeMatchup[] | undefined, topMeta: HeroMetric[]): CounterTarget[] {
  if (!matchups?.length) return []
  return topMeta
    .flatMap((metric) => {
      const row = matchups.find((matchup) => matchup.hero_id === metric.hero.id)
      if (!row || row.games < 20) return []
      if (row.winRate <= 0.505) return []
      return [{ metric, games: row.games, winRate: row.winRate, edge: row.winRate - 0.5 }]
    })
    .sort((a, b) => b.edge - a.edge)
}

function topMetaHeroes(metrics: HeroMetric[]): HeroMetric[] {
  return [...metrics]
    .filter((metric) => metric.picks > 0)
    .sort((a, b) => b.metaScore - a.metaScore)
    .slice(0, 5)
}

export function MetaEscapePage() {
  useDocumentTitle('Meta escape')
  const meta = useMeta()
  const items = useRemote<ItemConstants>('/constants/items', TTL.constants)
  const [itemRows, setItemRows] = useState<ItemRow[]>([])
  const [itemLoading, setItemLoading] = useState(true)
  const [itemError, setItemError] = useState<string | null>(null)
  const [itemNonce, setItemNonce] = useState(0)
  const [matchupMap, setMatchupMap] = useState<Record<number, EscapeMatchup[]>>({})
  const [matchupLoading, setMatchupLoading] = useState(false)
  const [popularity, setPopularity] = useState<
    Record<number, Record<string, Record<string, number>>>
  >({})
  const [popularityLoading, setPopularityLoading] = useState(false)
  const [buildRows, setBuildRows] = useState<MetaBuildRow[]>([])
  const [buildLoading, setBuildLoading] = useState(true)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [punisherMap, setPunisherMap] = useState<Record<number, EscapeMatchup[]>>({})

  const topMeta = useMemo(() => topMetaHeroes(meta.metrics), [meta.metrics])
  const topMetaKey = topMeta.map((metric) => metric.hero.id).join(',')

  const escapeCandidates = useMemo(() => {
    const active = meta.metrics.filter((metric) => metric.picks >= 50)
    if (!active.length) return []
    const rates = active.map((metric) => metric.pickRate).sort((a, b) => a - b)
    const median = rates[Math.floor(rates.length / 2)] ?? 0
    return active
      .filter((metric) => metric.pickRate <= median && metric.winRate >= 0.5)
      .sort((a, b) => b.metaScore - a.metaScore || b.winRate - a.winRate)
      .slice(0, 10)
  }, [meta.metrics])

  const candidateKey = escapeCandidates.map((metric) => metric.hero.id).join(',')

  useEffect(() => {
    let cancelled = false
    const cached = itemNonce === 0 ? readItemCache() : null
    if (cached) {
      setItemRows(cached.rows)
      setItemLoading(false)
      setItemError(null)
      return
    }

    setItemLoading(true)
    setItemError(null)
    runExplorer(ITEM_QUERY)
      .then((response) => {
        if (cancelled) return
        const rows = parseItemRows(response.rows)
        setItemRows(rows)
        setItemLoading(false)
        try {
          localStorage.setItem(ITEM_CACHE_KEY, JSON.stringify({ at: Date.now(), rows }))
        } catch {
          /* The sample still renders if storage is unavailable. */
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setItemRows([])
        setItemLoading(false)
        setItemError(error instanceof Error ? error.message : 'The item sample could not be loaded.')
      })

    return () => {
      cancelled = true
    }
  }, [itemNonce])

  useEffect(() => {
    if (!topMetaKey) return
    let cancelled = false
    setBuildLoading(true)
    setBuildError(null)
    runExplorer(metaBuildQuery(topMetaKey.split(',').map(Number)))
      .then((response) => {
        if (cancelled) return
        setBuildRows(parseBuildRows(response.rows))
        setBuildLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setBuildRows([])
        setBuildLoading(false)
        setBuildError(
          error instanceof Error ? error.message : 'The off-meta build sample could not be loaded.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [topMetaKey])

  useEffect(() => {
    if (!topMetaKey) return
    let cancelled = false
    const ids = topMetaKey.split(',').map(Number)
    setPunisherMap({})
    Promise.allSettled(
      ids.map(async (heroId) => {
        if (meta.population === 'immortal') {
          const rows = await fetchImmortalMatchups(heroId)
          return [
            heroId,
            rows.map((row) => ({
              hero_id: row.hero_id,
              games: row.matches,
              winRate: row.winrate / 100,
            })),
          ] as const
        }
        const rows = await fetchHeroMatchups(String(heroId))
        return [
          heroId,
          rows.map((row) => ({
            hero_id: row.hero_id,
            games: row.games_played,
            winRate: row.games_played > 0 ? row.wins / row.games_played : 0,
          })),
        ] as const
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<number, EscapeMatchup[]> = {}
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [heroId, rows] = result.value
          next[heroId] = rows
        }
      }
      setPunisherMap(next)
    })
    return () => {
      cancelled = true
    }
  }, [topMetaKey, meta.population])

  useEffect(() => {
    if (!candidateKey) return
    let cancelled = false
    const ids = candidateKey.split(',').map(Number)
    setMatchupMap({})
    setMatchupLoading(true)
    Promise.allSettled(
      ids.map(async (heroId) => {
        if (meta.population === 'immortal') {
          const rows = await fetchImmortalMatchups(heroId)
          return [
            heroId,
            rows.map((row) => ({
              hero_id: row.hero_id,
              games: row.matches,
              winRate: row.winrate / 100,
            })),
          ] as const
        }
        const rows = await fetchHeroMatchups(String(heroId))
        return [
          heroId,
          rows.map((row) => ({
            hero_id: row.hero_id,
            games: row.games_played,
            winRate: row.games_played > 0 ? row.wins / row.games_played : 0,
          })),
        ] as const
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<number, EscapeMatchup[]> = {}
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [heroId, rows] = result.value
          next[heroId] = rows
        }
      }
      setMatchupMap(next)
      setMatchupLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [candidateKey, meta.population])

  const escapeHeroes = useMemo<EscapeHero[]>(() => {
    return escapeCandidates
      .map((metric) => {
        const counters = getCounters(matchupMap[metric.hero.id], topMeta)
        return {
          metric,
          counters,
          strength: counters.reduce((sum, counter) => sum + counter.edge, 0),
        }
      })
      .filter((entry) => entry.counters.length > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
  }, [escapeCandidates, matchupMap, topMeta])

  const escapeKey = escapeHeroes.map((entry) => entry.metric.hero.id).join(',')

  useEffect(() => {
    if (!escapeKey) return
    let cancelled = false
    const ids = escapeKey.split(',').map(Number)
    setPopularity({})
    setPopularityLoading(true)
    Promise.allSettled(
      ids.map(async (heroId) => {
        const data = await fetchHeroItems(String(heroId))
        return [heroId, data] as const
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<number, Record<string, Record<string, number>>> = {}
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [heroId, data] = result.value
          next[heroId] = data
        }
      }
      setPopularity(next)
      setPopularityLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [escapeKey])

  const escapeItems = useMemo<EscapeItem[]>(() => {
    if (!itemRows.length || !escapeHeroes.length) return []
    return itemRows
      .filter(
        (row) =>
          row.cost >= 2500 &&
          row.purchases >= 80 &&
          row.pick_rate <= 5.2 &&
          row.win_rate >= 54,
      )
      .map((row) => {
        let carrier: EscapeHero | null = null
        let carrierPurchases = 0
        for (const hero of escapeHeroes) {
          const count = numberValue(
            popularity[hero.metric.hero.id]?.late_game_items?.[String(row.item_id)],
          )
          if (count > carrierPurchases) {
            carrier = hero
            carrierPurchases = count
          }
        }
        const itemKey = row.name.replace(/^item_/, '')
        return {
          row,
          item: items.data?.[row.name] ?? items.data?.[itemKey] ?? null,
          carrier,
          carrierPurchases,
        }
      })
      .filter((entry) => entry.carrier && entry.carrierPurchases >= 3)
      .sort((a, b) => b.row.win_rate - a.row.win_rate)
      .slice(0, 6)
  }, [escapeHeroes, itemRows, items.data, popularity])

  const metaBuilds = useMemo<MetaBuild[]>(() => {
    if (!buildRows.length) return []
    return topMeta
      .map((metric) => {
        const baseline = metric.winRate * 100
        const buildItems = buildRows
          .filter(
            (row) =>
              row.hero_id === metric.hero.id &&
              row.games >= 30 &&
              row.purchases >= 15 &&
              row.buy_rate <= 45,
          )
          .map((row) => {
            const itemKey = row.name.replace(/^item_/, '')
            return {
              ...row,
              item: items.data?.[row.name] ?? items.data?.[itemKey] ?? null,
              lift: row.win_rate - baseline,
            }
          })
          .filter((row) => row.win_rate >= 54 && row.lift >= 1.2)
          .sort((a, b) => b.lift - a.lift)
          .slice(0, 2)
        const punishers = (punisherMap[metric.hero.id] ?? [])
          .filter((row) => row.games >= 20 && row.winRate < 0.49)
          .map((row) => {
            const enemy = meta.metrics.find((candidate) => candidate.hero.id === row.hero_id)
            return enemy
              ? {
                  metric: enemy,
                  games: row.games,
                  winRate: row.winRate,
                  edge: 0.5 - row.winRate,
                }
              : null
          })
          .filter((row): row is MetaPunisher => Boolean(row))
          .sort((a, b) => b.edge - a.edge)
          .slice(0, 2)
        return { metric, items: buildItems, punishers }
      })
      .filter((build) => build.items.length > 0)
      .slice(0, 5)
  }, [buildRows, items.data, meta.metrics, punisherMap, topMeta])

  if (meta.loading && !meta.heroes.length) {
    return (
      <div className="page-stack meta-escape-page">
        <PageHeader
          eyebrow="Meta escape"
          title={<>Find the <em>outside edge.</em></>}
          description="Underplayed heroes and items that are quietly performing, cross-referenced against the strongest heroes in the current lens."
        />
        <div className="escape-loading-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={160} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-stack meta-escape-page">
      <PageHeader
        eyebrow="Meta escape"
        title={<>Find the <em>outside edge.</em></>}
        description="Underplayed heroes and items that are quietly performing, cross-referenced against the strongest heroes in the current lens. A scouting board, not a promise."
        actions={
          <Link className="btn btn-ghost btn-sm" to="/draft">
            <Swords size={15} /> Open draft lab
          </Link>
        }
      />

      <section className="panel escape-thesis">
        <div className="escape-thesis-head">
          <div>
            <span className="eyebrow"><Sparkles size={12} /> The current wall</span>
            <h2>What everyone is picking</h2>
            <p>The top five heroes by blended meta score. Escape cards below look for underplayed answers to this group.</p>
          </div>
          <span className="badge badge-muted">
            {meta.population === 'ranked'
              ? 'Ranked pubs'
              : meta.population === 'pro'
                ? 'Pro scene'
                : meta.population === 'turbo'
                  ? 'Turbo'
                  : 'Immortal · Spectral'}
          </span>
        </div>
        <div className="escape-top-meta">
          {topMeta.map((metric, index) => (
            <Link className="escape-threat" to={`/heroes/${metric.hero.id}`} key={metric.hero.id}>
              <span className="escape-threat-rank">{String(index + 1).padStart(2, '0')}</span>
              <img src={heroImage(metric.hero.icon)} alt="" loading="lazy" />
              <span className="escape-threat-copy">
                <strong>{metric.hero.localized_name}</strong>
                <small>{formatPercent(metric.pickRate, 1)} pick · {formatPercent(metric.winRate, 1)} WR</small>
              </span>
              <ArrowUpRight size={13} />
            </Link>
          ))}
        </div>
      </section>

      <section className="escape-section">
        <SectionHeading
          eyebrow="Underplayed heroes"
          title="Meta escape candidates"
          hint={matchupLoading ? 'Reading matchup samples…' : 'Below-median pick rate · positive win rate · at least one winning matchup into the top five'}
          action={<span className="escape-count">{escapeHeroes.length || '—'} heroes</span>}
        />
        {escapeHeroes.length ? (
          <div className="escape-hero-grid">
            {escapeHeroes.map(({ metric, counters }, index) => (
              <article className="panel escape-card" key={metric.hero.id}>
                <div className="escape-card-head">
                  <span className="escape-ribbon">{String(index + 1).padStart(2, '0')}</span>
                  <HeroPortrait hero={metric.hero} size="md" />
                  <div className="escape-card-title">
                    <Link to={`/heroes/${metric.hero.id}`}>{metric.hero.localized_name}</Link>
                    <span>{metric.hero.roles.slice(0, 3).join(' · ')}</span>
                  </div>
                  <span className="escape-score" title="Meta score">{metric.metaScore}<small>META</small></span>
                </div>
                <div className="escape-statline">
                  <span><strong>{formatPercent(metric.winRate, 1)}</strong><small>win rate</small></span>
                  <span><strong>{formatPercent(metric.pickRate, 1)}</strong><small>pick rate</small></span>
                  <span><strong>{formatNumber(metric.picks)}</strong><small>picks</small></span>
                </div>
                <div className="escape-counter-head">
                  <span className="muted-label">Wins against the wall</span>
                  <span>{counters.length} target{counters.length === 1 ? '' : 's'}</span>
                </div>
                <div className="escape-counter-list">
                  {counters.slice(0, 3).map((counter) => (
                    <Link className="escape-counter" to={`/heroes/${counter.metric.hero.id}`} key={counter.metric.hero.id}>
                      <img src={heroImage(counter.metric.hero.icon)} alt="" loading="lazy" />
                      <span>
                        <strong>{counter.metric.hero.localized_name}</strong>
                        <small>{counter.games} games · {formatPercent(counter.winRate, 1)} WR</small>
                      </span>
                      <em>+{formatPercent(counter.edge, 1)}</em>
                    </Link>
                  ))}
                </div>
                <Link className="escape-card-link" to={`/heroes/${metric.hero.id}`}>
                  Open hero dossier <ArrowUpRight size={13} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel escape-empty">
            <EmptyState
              title={matchupLoading ? 'Reading the matchup board' : 'No clear escape edge in this sample'}
              icon={<FlaskConical size={22} />}
            >
              {matchupLoading
                ? 'Pulling counter samples for the underplayed heroes in the current lens.'
                : 'Try a different rank bracket or wait for the public sample to refresh.'}
            </EmptyState>
          </div>
        )}
      </section>

      <section className="escape-section">
        <SectionHeading
          eyebrow="Underbought items"
          title="Weapons outside the build sheet"
          hint={
            itemLoading
              ? 'Aggregating the last 30 days of parsed purchases…'
              : popularityLoading
                ? 'Matching item carriers to escape heroes…'
                : '30-day parsed buy sample · expensive, infrequent, above-baseline win rate'
          }
          action={<span className="escape-count"><Gem size={12} /> {escapeItems.length || '—'} items</span>}
        />
        {itemError ? (
          <div className="panel escape-empty">
            <EmptyState
              title="The item sample could not be loaded"
              icon={<Info size={22} />}
              action={
                <button className="btn btn-ghost btn-sm" onClick={() => setItemNonce((value) => value + 1)}>
                  Retry item read
                </button>
              }
            >
              {itemError}
            </EmptyState>
          </div>
        ) : itemLoading || popularityLoading ? (
          <div className="escape-item-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} height={216} />
            ))}
          </div>
        ) : escapeItems.length ? (
          <div className="escape-item-grid">
            {escapeItems.map(({ row, item, carrier, carrierPurchases }) => (
              <article className="panel escape-item-card" key={row.item_id}>
                <div className="escape-item-head">
                  <span className="escape-item-art">
                    {item ? (
                      <img src={itemImage(item.img)} alt="" loading="lazy" />
                    ) : (
                      <Gem size={22} />
                    )}
                  </span>
                  <div>
                    <span className="eyebrow">Underbought</span>
                    <h3>{item?.dname ?? cleanItemName(row.name).replace(/\b\w/g, (letter) => letter.toUpperCase())}</h3>
                    <small>{formatNumber(item?.cost ?? row.cost)} gold</small>
                  </div>
                  <span className="escape-score">{formatPercent(row.win_rate / 100, 1)}</span>
                </div>
                <div className="escape-statline">
                  <span><strong>{formatPercent(row.pick_rate / 100, 1)}</strong><small>buy rate</small></span>
                  <span><strong>{formatNumber(row.purchases)}</strong><small>purchases</small></span>
                  <span><strong>{formatPercent(row.win_rate / 100, 1)}</strong><small>win rate</small></span>
                </div>
                {carrier ? (
                  <>
                    <div className="escape-carrier">
                      <HeroPortrait hero={carrier.metric.hero} size="xs" />
                      <span>
                        <small>Escape carrier</small>
                        <Link to={`/heroes/${carrier.metric.hero.id}`}>{carrier.metric.hero.localized_name}</Link>
                      </span>
                      <em>{carrierPurchases} late buys</em>
                    </div>
                    <div className="escape-counter-list">
                      {carrier.counters.slice(0, 2).map((counter) => (
                        <Link className="escape-counter" to={`/heroes/${counter.metric.hero.id}`} key={counter.metric.hero.id}>
                          <img src={heroImage(counter.metric.hero.icon)} alt="" loading="lazy" />
                          <span>
                            <strong>{counter.metric.hero.localized_name}</strong>
                            <small>{formatPercent(counter.winRate, 1)} in {counter.games} games</small>
                          </span>
                          <em>+{formatPercent(counter.edge, 1)}</em>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : null}
                <p className="escape-item-note">
                  {carrier
                    ? `Counter signals belong to ${carrier.metric.hero.localized_name}, not the item itself.`
                    : 'No escape carrier in this sample yet.'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel escape-empty">
            <EmptyState title="No underbought item has an escape carrier yet" icon={<Gem size={22} />}>
              The item and carrier samples update independently. Try the current lens again later.
            </EmptyState>
          </div>
        )}
      </section>

      <section className="escape-section">
        <SectionHeading
          eyebrow="Off-meta builds"
          title="Break the script"
          hint={
            buildLoading
              ? 'Aggregating 90-day parsed final inventories…'
              : 'Low ownership · above hero baseline · parsed items only'
          }
          action={
            <span className="escape-count">
              <Wrench size={12} /> {metaBuilds.length || '—'} builds
            </span>
          }
        />
        {buildError ? (
          <div className="panel escape-empty">
            <EmptyState title="The off-meta build sample could not be loaded" icon={<Info size={22} />}>
              {buildError}
            </EmptyState>
          </div>
        ) : buildLoading ? (
          <div className="escape-build-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} height={236} />
            ))}
          </div>
        ) : metaBuilds.length ? (
          <div className="escape-build-grid">
            {metaBuilds.map((build) => (
              <article className="panel escape-build-card" key={build.metric.hero.id}>
                <div className="escape-build-head">
                  <HeroPortrait hero={build.metric.hero} size="sm" />
                  <div>
                    <span className="eyebrow">Meta hero, unusual finish</span>
                    <Link to={`/heroes/${build.metric.hero.id}`}>
                      {build.metric.hero.localized_name}
                    </Link>
                    <small>
                      {formatPercent(build.metric.winRate, 1)} hero WR · {build.metric.picks} picks
                    </small>
                  </div>
                  <MetaGradeBadge score={build.metric.metaScore} size="sm" />
                </div>

                <div className="escape-build-items">
                  {build.items.map((row) => (
                    <div className="escape-build-item" key={row.item_id}>
                      <span className="escape-build-item-art">
                        {row.item ? (
                          <img src={itemImage(row.item.img)} alt="" loading="lazy" />
                        ) : (
                          <Wrench size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{row.item?.dname ?? cleanItemName(row.name)}</strong>
                        <small>
                          {formatPercent(row.buy_rate / 100, 1)} buy rate ·{' '}
                          {formatPercent(row.win_rate / 100, 1)} WR · {row.purchases} games
                        </small>
                      </div>
                      <em>+{formatPercent(row.lift / 100, 1)}</em>
                    </div>
                  ))}
                </div>

                <div className="escape-build-counters">
                  <span className="muted-label">Punished by</span>
                  {build.punishers.length ? (
                    build.punishers.map((counter) => (
                      <Link
                        className="escape-build-punisher"
                        to={`/heroes/${counter.metric.hero.id}`}
                        key={counter.metric.hero.id}
                      >
                        <HeroPortrait hero={counter.metric.hero} size="xs" />
                        <span>{counter.metric.hero.localized_name}</span>
                        <small>{build.metric.hero.localized_name} wins {formatPercent(counter.winRate, 1)}</small>
                        <em>+{formatPercent(counter.edge, 1)}</em>
                      </Link>
                    ))
                  ) : (
                    <span className="escape-build-none">No reliable counter sample yet.</span>
                  )}
                </div>

                <p className="escape-build-note">
                  OpenDota final-inventory sample, 90 days, all parsed ranks. “Punished by” uses
                  the current matchup lens, not the item.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel escape-empty">
            <EmptyState title="No off-meta build cleared the sample bar" icon={<Wrench size={22} />}>
              The parsed final-inventory sample is thin for this meta group. Raise the sample
              window later or inspect another lens.
            </EmptyState>
          </div>
        )}
      </section>

      <p className="escape-footnote">
        <Info size={13} /> Counter edges are computed from{' '}
        {meta.population === 'immortal'
          ? "Spectral's seven-day Immortal matchup sample"
          : "OpenDota's global parsed pub matchups"}
        ; the lens changes which heroes look strong, not the historical head-to-head sample.
        Item and build win rates are descriptive OpenDota snapshots (30-day underbought items,
        90-day build cards); carrier edges are not item-specific causal effects. Small samples are noisy.
      </p>
    </div>
  )
}
