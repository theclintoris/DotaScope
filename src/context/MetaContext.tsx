import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { HeroMetric, HeroStat, PatchInfo, Population } from '../types'
import { buildHeroMetrics } from '../lib/meta'
import { usePersistentState, useRemote } from '../lib/hooks'
import { TTL } from '../lib/api'

interface MetaContextValue {
  heroes: HeroStat[]
  metrics: HeroMetric[]
  loading: boolean
  error: Error | null
  refresh: () => void
  lastUpdated: number | null
  bracket: number
  setBracket: (value: number) => void
  population: Population
  setPopulation: (value: Population) => void
  latestPatch: PatchInfo | null
}

const MetaContext = createContext<MetaContextValue | null>(null)

export function MetaProvider({ children }: { children: ReactNode }) {
  const [bracket, setBracket] = usePersistentState<number>('dotascope.bracket.v1', 0)
  const [population, setPopulation] = usePersistentState<Population>(
    'dotascope.population.v1',
    'ranked',
  )
  const heroQuery = useRemote<HeroStat[]>('/heroStats', TTL.meta)
  const patches = useRemote<PatchInfo[]>('/constants/patch', TTL.constants)

  const heroes = useMemo(() => heroQuery.data ?? [], [heroQuery.data])
  const metrics = useMemo(
    () => buildHeroMetrics(heroes, population, bracket),
    [heroes, population, bracket],
  )
  const latestPatch = useMemo(() => {
    if (!patches.data?.length) return null
    return [...patches.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
  }, [patches.data])

  const value: MetaContextValue = {
    heroes,
    metrics,
    loading: heroQuery.loading,
    error: heroQuery.error,
    refresh: heroQuery.refresh,
    lastUpdated: heroQuery.lastUpdated,
    bracket,
    setBracket,
    population,
    setPopulation,
    latestPatch,
  }

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>
}

export function useMeta(): MetaContextValue {
  const context = useContext(MetaContext)
  if (!context) throw new Error('useMeta must be used inside MetaProvider')
  return context
}
