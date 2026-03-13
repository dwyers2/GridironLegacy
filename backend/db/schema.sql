-- GridironLegacy Database Schema
-- Caches Yahoo Fantasy data to minimize API calls

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
  league_key TEXT PRIMARY KEY,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  game_id TEXT NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  team_key TEXT PRIMARY KEY,
  league_key TEXT NOT NULL,
  team_name TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  season TEXT NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (league_key) REFERENCES leagues(league_key)
);

-- Players table (stores unique players)
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  position TEXT,
  nfl_team TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roster entries (which players were on which teams in which seasons)
CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_key TEXT NOT NULL,
  player_id TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER DEFAULT NULL, -- NULL means season roster, specific week for weekly rosters
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_key) REFERENCES teams(team_key),
  FOREIGN KEY (player_id) REFERENCES players(player_id),
  UNIQUE(team_key, player_id, season, week)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league_key);
CREATE INDEX IF NOT EXISTS idx_teams_manager ON teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_teams_season ON teams(season);
CREATE INDEX IF NOT EXISTS idx_roster_team ON roster_entries(team_key);
CREATE INDEX IF NOT EXISTS idx_roster_player ON roster_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_roster_season ON roster_entries(season);

-- Cache metadata (track when data was last fetched)
CREATE TABLE IF NOT EXISTS cache_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Draft picks (historical draft results for all seasons)
CREATE TABLE IF NOT EXISTS draft_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_key TEXT NOT NULL,
  season TEXT NOT NULL,
  round INTEGER NOT NULL,
  pick INTEGER NOT NULL,
  team_key TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  nfl_team TEXT NOT NULL DEFAULT '',
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_key, round, pick)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_key);
CREATE INDEX IF NOT EXISTS idx_draft_picks_season ON draft_picks(season);
CREATE INDEX IF NOT EXISTS idx_draft_picks_team ON draft_picks(team_key);

-- Draft pick trades (records which picks were traded before the draft)
CREATE TABLE IF NOT EXISTS draft_pick_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_key TEXT NOT NULL,
  pick INTEGER NOT NULL,
  original_team_key TEXT NOT NULL,
  UNIQUE(league_key, pick)
);
CREATE INDEX IF NOT EXISTS idx_pick_trades_league ON draft_pick_trades(league_key);

-- Keeper designations (user-marked players kept from prior seasons)
CREATE TABLE IF NOT EXISTS keeper_designations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_key TEXT NOT NULL,
  pick INTEGER NOT NULL,
  UNIQUE(league_key, pick)
);
CREATE INDEX IF NOT EXISTS idx_keepers_league ON keeper_designations(league_key);

-- Manually added keepers (not tied to a draft pick)
CREATE TABLE IF NOT EXISTS manual_keepers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_key TEXT NOT NULL,
  team_key TEXT NOT NULL,
  player_key TEXT NOT NULL DEFAULT '',
  player_name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  nfl_team TEXT NOT NULL DEFAULT '',
  UNIQUE(league_key, team_key, player_name)
);
CREATE INDEX IF NOT EXISTS idx_manual_keepers_league ON manual_keepers(league_key);

-- AI-generated manager tendencies (cached to avoid regenerating)
CREATE TABLE IF NOT EXISTS manager_tendencies (
  manager_id TEXT PRIMARY KEY,
  manager_name TEXT NOT NULL,
  analysis TEXT NOT NULL,
  top_positions TEXT, -- JSON array of positions
  loyalty_score INTEGER,
  seasons_analyzed TEXT, -- Comma-separated list of seasons used for this analysis
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
