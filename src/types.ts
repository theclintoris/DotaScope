export type Population = 'ranked' | 'pro' | 'turbo' | 'immortal'

export type MatchMode = 'ranked' | 'turbo' | 'all'

export type Attribute = 'str' | 'agi' | 'int' | 'all'

export interface HeroStat {
  id: number
  name: string
  localized_name: string
  primary_attr: Attribute
  attack_type: 'Melee' | 'Ranged' | string
  roles: string[]
  img: string
  icon: string
  base_health: number
  base_health_regen: number
  base_mana: number
  base_mana_regen: number
  base_armor: number
  base_mr: number
  base_attack_min: number
  base_attack_max: number
  base_str: number
  base_agi: number
  base_int: number
  str_gain: number
  agi_gain: number
  int_gain: number
  attack_range: number
  projectile_speed: number
  attack_rate: number
  base_attack_time: number
  attack_point: number
  move_speed: number
  turn_rate: number | null
  cm_enabled: boolean
  legs: number
  day_vision: number
  night_vision: number
  pub_pick: number
  pub_win: number
  pub_pick_trend: number[]
  pub_win_trend: number[]
  turbo_picks: number
  turbo_wins: number
  turbo_picks_trend: number[]
  turbo_wins_trend: number[]
  pro_pick: number
  pro_win: number
  pro_ban: number
  [key: string]: unknown
}

export interface HeroMetric {
  hero: HeroStat
  picks: number
  wins: number
  winRate: number
  pickRate: number
  proPicks: number
  proWins: number
  proBans: number
  pickTrend: number[]
  trendDelta: number | null
  metaScore: number
}

export interface HeroMatchup {
  hero_id: number
  games_played: number
  wins: number
}

export interface ImmortalHeroRow {
  hero_id: number
  matches: number
  wins: number
  pick_rate: number
  win_rate: number
  hero_tag: string
}

export interface ImmortalSnapshot {
  total: number
  version: string
  starting_time: number
  fetchedAt: number
  response: Record<string, ImmortalHeroRow>
}

export interface ImmortalMatchupRow {
  hero_id: number
  matches: number
  wins: number
  winrate: number
  expectation: number
  same_lane_rate: number
  wr_diff: number
}

export interface HeroDuration {
  /** Bucket duration in seconds, in 5-minute increments. */
  duration_bin: number
  games_played: number
  wins: number
}

export type ItemPopularity = Record<
  'start_game_items' | 'early_game_items' | 'mid_game_items' | 'late_game_items',
  Record<string, number>
>

export interface DotaItem {
  id: number
  img: string
  dname: string
  cost: number
  qual?: string
}

export type ItemConstants = Record<string, DotaItem>

export interface ProMatch {
  match_id: number
  duration: number
  start_time: number
  radiant_team_id: number | null
  radiant_name: string | null
  dire_team_id: number | null
  dire_name: string | null
  leagueid: number | null
  league_name: string | null
  series_id: number | null
  series_type: number | null
  game_mode: number | null
  lobby_type: number | null
  radiant_score: number
  dire_score: number
  radiant_win: boolean
}

export interface PublicMatch {
  match_id: number
  match_seq_num: number
  radiant_win: boolean
  start_time: number
  duration: number
  lobby_type: number
  game_mode: number
  avg_rank_tier: number | null
  num_rank_tier: number | null
  cluster: number | null
  radiant_team: number[] | null
  dire_team: number[] | null
}

export interface Team {
  team_id: number
  rating: number
  wins: number
  losses: number
  last_match_time: number
  delta: number
  match_id: number
  name: string
  tag: string
  logo_url: string | null
}

export interface SearchPlayer {
  account_id: number
  avatarfull: string
  personaname: string
  last_match_time: string | null
  similarity?: number
}

export interface ProPlayer {
  account_id: number
  steamid: string
  avatar: string
  avatarmedium: string
  avatarfull: string
  profileurl: string
  personaname: string
  last_login: string | null
  full_history_time: string | null
  loccountrycode: string | null
  last_match_time: string | null
  name: string | null
  country_code: string | null
  fantasy_role: number | null
  team_id: number | null
  team_name: string | null
  team_tag: string | null
  is_pro: boolean | null
}

export interface PlayerProfile {
  profile: {
    account_id: number
    personaname: string
    name: string | null
    plus: boolean
    steamid: string
    avatar: string
    avatarmedium: string
    avatarfull: string
    profileurl: string
    last_login: string | null
    loccountrycode: string | null
  }
  rank_tier: number | null
  leaderboard_rank: number | null
  computed_mmr: number | null
  computed_mmr_turbo: number | null
  aliases?: { personaname: string; name_since: string }[]
}

export interface PlayerWinLoss {
  win: number
  lose: number
}

export interface PlayerHero {
  hero_id: number
  last_played: number
  games: number
  win: number
  with_games: number
  with_win: number
  against_games: number
  against_win: number
}

export interface PlayerMatch {
  match_id: number
  player_slot: number
  radiant_win: boolean
  hero_id: number
  start_time: number
  duration: number
  game_mode: number
  lobby_type: number
  version: number | null
  kills: number
  deaths: number
  assists: number
  average_rank: number | null
  leaver_status: number
  party_size: number | null
  hero_variant: number | null
}

export interface PeerPlayer {
  account_id: number
  last_played: number | null
  win: number
  games: number
  with_win: number
  with_games: number
  against_win: number
  against_games: number
  with_gpm_sum?: number
  with_xpm_sum?: number
  personaname: string | null
  name: string | null
  avatar: string | null
  avatarfull: string | null
  is_contributor?: boolean
  is_subscriber?: boolean
}

export interface RecentMatch {
  match_id: number
  player_slot: number
  radiant_win: boolean
  hero_id: number
  start_time: number
  duration: number
  game_mode: number
  lobby_type: number
  version: number | null
  kills: number
  deaths: number
  assists: number
  average_rank: number | null
  xp_per_min: number
  gold_per_min: number
  hero_damage: number
  tower_damage: number
  hero_healing: number
  last_hits: number
  denies: number
  lane: number | null
  lane_role: number | null
  is_roaming: boolean | null
  cluster: number | null
  leaver_status: number
  party_size: number | null
  hero_variant: number | null
}

export interface BenchmarkPoint {
  percentile: number
  value: number
}

export type BenchmarkMetric =
  | 'gold_per_min'
  | 'xp_per_min'
  | 'kills_per_min'
  | 'deaths_per_min'
  | 'assists_per_min'
  | 'last_hits_per_min'
  | 'denies_per_min'
  | 'hero_damage_per_min'
  | 'hero_healing_per_min'
  | 'tower_damage'

export interface HeroBenchmarks {
  hero_id: number
  result: Partial<Record<BenchmarkMetric, BenchmarkPoint[]>>
}

export interface MatchPlayer {
  account_id: number | null
  player_slot: number
  hero_id: number
  item_0: number
  item_1: number
  item_2: number
  item_3: number
  item_4: number
  item_5: number
  backpack_0: number
  backpack_1: number
  backpack_2: number
  item_neutral: number
  kills: number
  deaths: number
  assists: number
  last_hits: number
  denies: number
  gold_per_min: number
  xp_per_min: number
  level: number
  net_worth: number
  hero_damage: number
  tower_damage: number
  hero_healing: number
  personaname: string | null
  name: string | null
  rank_tier: number | null
  isRadiant: boolean
  win: number
  lose: number
  total_gold: number | null
  kda: number | null
  obs_placed?: number
  sen_placed?: number
  observers_placed?: number
  observer_kills?: number
  sentry_kills?: number
  camps_stacked?: number
  creeps_stacked?: number
  rune_pickups?: number
  stuns?: number
  purchase_log?: { time: number; key: string }[]
}

export interface PickBan {
  is_pick: boolean
  hero_id: number
  team: number
  order: number
}

export interface MatchTeam {
  team_id: number
  name: string
  tag: string
  logo_url: string | null
}

export interface MatchDetail {
  match_id: number
  players: MatchPlayer[]
  radiant_win: boolean
  duration: number
  start_time: number
  lobby_type: number
  game_mode: number
  leagueid: number | null
  radiant_score: number
  dire_score: number
  first_blood_time: number | null
  radiant_gold_adv: number[] | null
  radiant_xp_adv: number[] | null
  picks_bans: PickBan[] | null
  league: { leagueid: number; name: string; tier: string | null } | null
  radiant_team: MatchTeam | null
  dire_team: MatchTeam | null
  radiant_name: string | null
  dire_name: string | null
  radiant_logo: string | null
  dire_logo: string | null
  radiant_team_id: number | null
  dire_team_id: number | null
  patch: number | null
  od_data?: {
    has_parsed: boolean
    has_log?: boolean
    has_api?: boolean
    has_gcdata?: boolean
    has_archive?: boolean
  }
}

export interface RecordEntry {
  match_id: number
  start_time: number
  hero_id: number | null
  score: number
}

export interface ExplorerResponse {
  command?: string
  rowCount: number
  rows: Record<string, unknown>[]
  err?: string
}

export interface PatchInfo {
  name: string
  date: string
  id: number
}

export interface MatchSearch {
  match_id: number
  start_time: number
  duration: number
  radiant_win: boolean
  league_name?: string | null
  radiant_name?: string | null
  dire_name?: string | null
}
