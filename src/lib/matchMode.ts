import type { MatchMode, PlayerHero, PlayerMatch, RecentMatch, PlayerWinLoss } from '../types'

type ModeMatch = {
  game_mode: number | null
  lobby_type: number | null
}

type PlayerModeMatch = ModeMatch & {
  player_slot: number
  radiant_win: boolean
  hero_id: number
  start_time: number
}

export const MATCH_MODE_COPY: Record<MatchMode, { label: string; short: string; note: string }> = {
  ranked: {
    label: 'Ranked',
    short: 'Ranked',
    note: 'Ranked matchmaking only.',
  },
  turbo: {
    label: 'Turbo sample',
    short: 'Turbo',
    note: 'OpenDota exposes Turbo games only in the latest 20-match sample.',
  },
  all: {
    label: 'All modes',
    short: 'All',
    note: 'OpenDota ranked history plus the latest mixed sample.',
  },
}

export function passesMatchMode(match: ModeMatch, mode: MatchMode): boolean {
  if (mode === 'turbo') return match.game_mode === 23
  if (mode === 'ranked') return match.lobby_type === 7
  return true
}

export function matchWon(match: Pick<PlayerModeMatch, 'player_slot' | 'radiant_win'>): boolean {
  return (match.player_slot < 128) === match.radiant_win
}

export function heroPoolFromRecent(matches: RecentMatch[], mode: MatchMode): PlayerHero[] {
  const pool = new Map<number, PlayerHero>()
  for (const match of matches) {
    if (!passesMatchMode(match, mode)) continue
    const current = pool.get(match.hero_id) ?? {
      hero_id: match.hero_id,
      last_played: 0,
      games: 0,
      win: 0,
      with_games: 0,
      with_win: 0,
      against_games: 0,
      against_win: 0,
    }
    current.games += 1
    current.win += matchWon(match) ? 1 : 0
    current.last_played = Math.max(current.last_played, match.start_time)
    pool.set(match.hero_id, current)
  }
  return [...pool.values()].sort((a, b) => b.games - a.games)
}

export function recordFromMatches(matches: RecentMatch[], mode: MatchMode): PlayerWinLoss {
  const rows = matches.filter((match) => passesMatchMode(match, mode))
  const win = rows.filter(matchWon).length
  return { win, lose: rows.length - win }
}

export type MatchSummary = PlayerMatch | RecentMatch

export function isPerformanceMatch(match: MatchSummary): match is RecentMatch {
  return 'gold_per_min' in match
}
