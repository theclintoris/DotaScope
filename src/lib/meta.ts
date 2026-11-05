import type { HeroMetric, HeroStat, Population } from '../types'

function numericField(hero: HeroStat, field: string): number {
  const value = hero[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function numericArray(hero: HeroStat, field: string): number[] {
  const value = hero[field]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is number => typeof entry === 'number')
}

export function getPickWin(hero: HeroStat, population: Population, bracket: number) {
  if (population === 'pro') {
    return { picks: hero.pro_pick ?? 0, wins: hero.pro_win ?? 0 }
  }
  if (population === 'turbo') {
    return { picks: hero.turbo_picks ?? 0, wins: hero.turbo_wins ?? 0 }
  }
  if (bracket > 0) {
    return {
      picks: numericField(hero, `${bracket}_pick`),
      wins: numericField(hero, `${bracket}_win`),
    }
  }
  return { picks: hero.pub_pick ?? 0, wins: hero.pub_win ?? 0 }
}

export function buildHeroMetrics(
  heroes: HeroStat[],
  population: Population,
  bracket: number,
): HeroMetric[] {
  const raw = heroes.map((hero) => {
    const { picks, wins } = getPickWin(hero, population, bracket)
    let pickTrend: number[] = []
    if (population === 'turbo') {
      pickTrend = numericArray(hero, 'turbo_picks_trend')
    } else if (population === 'ranked' && bracket === 0) {
      pickTrend = numericArray(hero, 'pub_pick_trend')
    }
    return { hero, picks, wins, pickTrend }
  })

  const totalPicks = raw.reduce((sum, entry) => sum + entry.picks, 0)
  const withGames = raw.filter((entry) => entry.picks > 0)
  const rates = withGames.map((entry) => entry.wins / entry.picks)
  const meanWinRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.5
  const winVariance = rates.length
    ? rates.reduce((sum, rate) => sum + (rate - meanWinRate) ** 2, 0) / rates.length
    : 0.0001
  const winStd = Math.max(Math.sqrt(winVariance), 0.007)
  const meanPickRate = totalPicks ? 1 / Math.max(heroes.length, 1) : 0
  const pickShares = withGames.map((entry) =>
    totalPicks ? entry.picks / totalPicks : 0,
  )
  const variancePick = pickShares.length
    ? pickShares.reduce((sum, rate) => sum + (rate - meanPickRate) ** 2, 0) / pickShares.length
    : 0.0001
  const pickStd = Math.max(Math.sqrt(variancePick), 0.0006)

  return raw.map(({ hero, picks, wins, pickTrend }) => {
    const winRate = picks > 0 ? wins / picks : 0
    const pickRate = totalPicks > 0 ? picks / totalPicks : 0
    const prev = pickTrend.length > 1 ? pickTrend[pickTrend.length - 2] : null
    const latest = pickTrend.length ? pickTrend[pickTrend.length - 1] : null
    const trendDelta =
      prev != null && latest != null && prev > 0 ? (latest - prev) / prev : latest === 0 ? 0 : null
    const winZ = picks > 0 ? (winRate - meanWinRate) / winStd : 0
    const pickZ = (pickRate - meanPickRate) / pickStd
    const metaScore = Math.max(1, Math.min(99, Math.round(50 + winZ * 10 + pickZ * 3.5)))
    return {
      hero,
      picks,
      wins,
      winRate,
      pickRate,
      proPicks: hero.pro_pick ?? 0,
      proWins: hero.pro_win ?? 0,
      proBans: hero.pro_ban ?? 0,
      pickTrend,
      trendDelta,
      metaScore,
    }
  })
}

export function metricForHero(
  metrics: HeroMetric[],
  heroId: number | string,
): HeroMetric | undefined {
  const id = typeof heroId === 'string' ? Number(heroId) : heroId
  return metrics.find((metric) => metric.hero.id === id)
}

export function bracketSnapshot(hero: HeroStat) {
  return Array.from({ length: 7 }, (_, index) => {
    const bracket = index + 1
    const picks = numericField(hero, `${bracket}_pick`)
    const wins = numericField(hero, `${bracket}_win`)
    return {
      bracket,
      picks,
      wins,
      winRate: picks > 0 ? wins / picks : 0,
    }
  })
}

export function publicTrend(hero: HeroStat) {
  const picks = numericArray(hero, 'pub_pick_trend')
  const wins = numericArray(hero, 'pub_win_trend')
  return picks.map((count, index) => ({
    picks: count,
    wins: wins[index] ?? 0,
    winRate: count > 0 ? (wins[index] ?? 0) / count : 0,
  }))
}

export function averageWinRate(metrics: HeroMetric[]): number {
  const totalPicks = metrics.reduce((sum, metric) => sum + metric.picks, 0)
  const totalWins = metrics.reduce((sum, metric) => sum + metric.wins, 0)
  return totalPicks ? totalWins / totalPicks : 0
}

export function totalGames(metrics: HeroMetric[]): number {
  return Math.round(metrics.reduce((sum, metric) => sum + metric.picks, 0) / 10)
}

export function sortMetrics(
  metrics: HeroMetric[],
  key: string,
  direction: 'asc' | 'desc',
): HeroMetric[] {
  const directionMultiplier = direction === 'asc' ? 1 : -1
  return [...metrics].sort((a, b) => {
    let aValue: number | string = 0
    let bValue: number | string = 0
    switch (key) {
      case 'name':
        aValue = a.hero.localized_name
        bValue = b.hero.localized_name
        break
      case 'winRate':
        aValue = a.winRate
        bValue = b.winRate
        break
      case 'pickRate':
        aValue = a.pickRate
        bValue = b.pickRate
        break
      case 'picks':
        aValue = a.picks
        bValue = b.picks
        break
      case 'pro':
        aValue = a.proPicks + a.proBans
        bValue = b.proPicks + b.proBans
        break
      case 'metaScore':
        aValue = a.metaScore
        bValue = b.metaScore
        break
      default:
        aValue = a.metaScore
        bValue = b.metaScore
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue) * directionMultiplier
    }
    return ((aValue as number) - (bValue as number)) * directionMultiplier
  })
}
