CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  game_mode INTEGER NOT NULL DEFAULT 0,
  radiant_win INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'dotascope',
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  match_id TEXT NOT NULL,
  account_id INTEGER,
  player_slot INTEGER NOT NULL,
  hero_id INTEGER NOT NULL,
  team TEXT NOT NULL,
  won INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  gold_per_min INTEGER NOT NULL DEFAULT 0,
  xp_per_min INTEGER NOT NULL DEFAULT 0,
  last_hits INTEGER NOT NULL DEFAULT 0,
  denies INTEGER NOT NULL DEFAULT 0,
  hero_damage INTEGER NOT NULL DEFAULT 0,
  tower_damage INTEGER NOT NULL DEFAULT 0,
  hero_healing INTEGER NOT NULL DEFAULT 0,
  obs_placed INTEGER NOT NULL DEFAULT 0,
  sen_placed INTEGER NOT NULL DEFAULT 0,
  camps_stacked INTEGER NOT NULL DEFAULT 0,
  rune_pickups INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_slot)
);

CREATE INDEX IF NOT EXISTS idx_players_account ON players(account_id);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_mode ON matches(game_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_events_ip ON upload_events(ip_hash, created_at DESC);
