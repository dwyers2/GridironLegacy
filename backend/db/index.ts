import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, 'gridiron_legacy.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Initialize database
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better concurrency

// Initialize schema
export function initializeDatabase() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  console.log('✅ Database initialized');
}

// Cache a league
export function cacheLeague(leagueKey: string, leagueName: string, season: string, gameId: string) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO leagues (league_key, league_name, season, game_id, last_updated)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(leagueKey, leagueName, season, gameId);
}

// Cache a team
export function cacheTeam(
  teamKey: string,
  leagueKey: string,
  teamName: string,
  managerId: string,
  managerName: string,
  season: string
) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO teams (team_key, league_key, team_name, manager_id, manager_name, season, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(teamKey, leagueKey, teamName, managerId, managerName, season);
}

// Cache a player
export function cachePlayer(playerId: string, playerName: string, position: string, nflTeam: string) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO players (player_id, player_name, position, nfl_team, last_updated)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(playerId, playerName, position, nflTeam);
}

// Cache a roster entry
export function cacheRosterEntry(teamKey: string, playerId: string, season: string, week: number | null = null) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO roster_entries (team_key, player_id, season, week, last_updated)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(teamKey, playerId, season, week);
}

// Get all cached seasons for a manager
export function getCachedSeasonsForManager(managerId: string): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT season FROM teams WHERE manager_id = ? ORDER BY season DESC
  `);
  return stmt.all(managerId).map((row: any) => row.season);
}

// Get all managers with their cached data
export function getAllManagersWithRosters() {
  const managers = db.prepare(`
    SELECT DISTINCT manager_id, manager_name FROM teams ORDER BY manager_name
  `).all() as Array<{ manager_id: string; manager_name: string }>;

  return managers.map(manager => {
    const seasons = db.prepare(`
      SELECT DISTINCT season FROM teams WHERE manager_id = ? ORDER BY season DESC
    `).all(manager.manager_id).map((row: any) => row.season);

    const players = db.prepare(`
      SELECT
        p.player_id,
        p.player_name,
        p.position,
        p.nfl_team,
        COUNT(DISTINCT r.season) as times_owned,
        GROUP_CONCAT(DISTINCT r.season) as seasons
      FROM roster_entries r
      JOIN teams t ON r.team_key = t.team_key
      JOIN players p ON r.player_id = p.player_id
      WHERE t.manager_id = ?
      GROUP BY p.player_id
      ORDER BY times_owned DESC, p.player_name
    `).all(manager.manager_id) as Array<{
      player_id: string;
      player_name: string;
      position: string;
      nfl_team: string;
      times_owned: number;
      seasons: string;
    }>;

    return {
      managerId: manager.manager_id,
      managerName: manager.manager_name,
      seasonsTracked: seasons,
      players: players.map(p => ({
        playerId: p.player_id,
        playerName: p.player_name,
        position: p.position,
        team: p.nfl_team,
        timesOwned: p.times_owned,
        seasons: p.seasons.split(',')
      }))
    };
  });
}

// Check if we have cached data for a specific season/league
export function hasSeasonData(leagueKey: string): boolean {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM leagues WHERE league_key = ?`);
  const result = stmt.get(leagueKey) as { count: number };
  return result.count > 0;
}

// Get all unique managers across all leagues
export function getAllManagers() {
  return db.prepare(`
    SELECT DISTINCT manager_id, manager_name FROM teams ORDER BY manager_name
  `).all() as Array<{ manager_id: string; manager_name: string }>;
}

// Get cache timestamp for a league
export function getLeagueCacheAge(leagueKey: string): Date | null {
  const stmt = db.prepare(`SELECT last_updated FROM leagues WHERE league_key = ?`);
  const result = stmt.get(leagueKey) as { last_updated: string } | undefined;
  return result ? new Date(result.last_updated) : null;
}

// Get all cached seasons
export function getCachedSeasons(): string[] {
  const stmt = db.prepare(`SELECT DISTINCT season FROM leagues ORDER BY season DESC`);
  const results = stmt.all() as Array<{ season: string }>;
  return results.map(r => r.season);
}

// Clear all cache (for testing/reset)
export function clearAllCache() {
  db.exec(`
    DELETE FROM roster_entries;
    DELETE FROM teams;
    DELETE FROM players;
    DELETE FROM leagues;
    DELETE FROM cache_metadata;
    DELETE FROM manager_tendencies;
  `);
  console.log('🗑️ Cache cleared');
}

// Cache a manager tendency (AI-generated analysis)
export function cacheTendency(
  managerId: string,
  managerName: string,
  analysis: string,
  topPositions: string[],
  loyaltyScore: number,
  seasonsAnalyzed: string[]
) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO manager_tendencies
    (manager_id, manager_name, analysis, top_positions, loyalty_score, seasons_analyzed, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    managerId,
    managerName,
    analysis,
    JSON.stringify(topPositions),
    loyaltyScore,
    seasonsAnalyzed.join(',')
  );
}

// Get all cached tendencies
export function getCachedTendencies(): Array<{
  managerId: string;
  managerName: string;
  analysis: string;
  topPositions: string[];
  loyaltyScore: number;
  seasonsAnalyzed: string[];
}> {
  const stmt = db.prepare(`SELECT * FROM manager_tendencies`);
  const results = stmt.all() as Array<{
    manager_id: string;
    manager_name: string;
    analysis: string;
    top_positions: string;
    loyalty_score: number;
    seasons_analyzed: string;
  }>;

  return results.map(r => ({
    managerId: r.manager_id,
    managerName: r.manager_name,
    analysis: r.analysis,
    topPositions: JSON.parse(r.top_positions || '[]'),
    loyaltyScore: r.loyalty_score,
    seasonsAnalyzed: r.seasons_analyzed ? r.seasons_analyzed.split(',') : []
  }));
}

// Check if tendencies need to be regenerated (seasons changed)
export function tendenciesNeedUpdate(currentSeasons: string[]): boolean {
  const cached = getCachedTendencies();
  if (cached.length === 0) return true;

  // Check if the seasons analyzed match the current cached seasons
  const cachedSeasons = getCachedSeasons().sort().join(',');
  const analyzedSeasons = cached[0]?.seasonsAnalyzed?.sort().join(',') || '';

  return cachedSeasons !== analyzedSeasons;
}

// Cache draft picks in bulk
export function cacheDraftPicks(picks: Array<{
  leagueKey: string;
  season: string;
  round: number;
  pick: number;
  teamKey: string;
  playerKey: string;
  playerName: string;
  position: string;
  nflTeam: string;
}>) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO draft_picks (league_key, season, round, pick, team_key, player_key, player_name, position, nfl_team, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const transaction = db.transaction(() => {
    for (const p of picks) {
      stmt.run(p.leagueKey, p.season, p.round, p.pick, p.teamKey, p.playerKey, p.playerName, p.position, p.nflTeam);
    }
  });
  transaction();
}

// Check if draft data exists for a league
export function hasDraftData(leagueKey: string): boolean {
  const result = db.prepare(`SELECT COUNT(*) as count FROM draft_picks WHERE league_key = ?`).get(leagueKey) as { count: number };
  return result.count > 0;
}

// Get draft results for a specific league with manager names + player info from cache
export function getDraftResultsForLeague(leagueKey: string): Array<{
  round: number;
  pick: number;
  team_key: string;
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
  season: string;
  manager_name: string;
}> {
  // Join with players table using the numeric part of player_key ("423.p.30977" -> "30977")
  // Falls back to stored player_name if player not in players table yet
  return db.prepare(`
    SELECT dp.round, dp.pick, dp.team_key, dp.player_key, dp.season,
           CASE WHEN dp.player_name != '' THEN dp.player_name
                ELSE COALESCE(p.player_name, dp.player_key) END as player_name,
           CASE WHEN dp.position != '' THEN dp.position
                ELSE COALESCE(p.position, '') END as position,
           CASE WHEN dp.nfl_team != '' THEN dp.nfl_team
                ELSE COALESCE(p.nfl_team, '') END as nfl_team,
           COALESCE(t.manager_name, dp.team_key) as manager_name,
           dpt.original_team_key,
           COALESCE(t2.manager_name, dpt.original_team_key) as original_manager_name
    FROM draft_picks dp
    LEFT JOIN teams t ON dp.team_key = t.team_key
    LEFT JOIN players p ON SUBSTR(dp.player_key, INSTR(dp.player_key, '.p.') + 3) = p.player_id
    LEFT JOIN draft_pick_trades dpt ON dp.league_key = dpt.league_key AND dp.pick = dpt.pick
    LEFT JOIN teams t2 ON dpt.original_team_key = t2.team_key
    WHERE dp.league_key = ?
    ORDER BY dp.round, dp.pick
  `).all(leagueKey) as any[];
}

// Bulk resolve player info from player_keys (e.g. "423.p.30977")
export function resolvePlayersByKeys(playerKeys: string[]): Array<{
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
}> {
  if (playerKeys.length === 0) return [];
  const placeholders = playerKeys.map(() => '?').join(', ');
  const numericIds = playerKeys.map(k => {
    const m = k.match(/\.p\.(\d+)$/);
    return m ? m[1] : k;
  });
  const rows = db.prepare(`
    SELECT player_id, player_name, position, nfl_team FROM players
    WHERE player_id IN (${placeholders})
  `).all(...numericIds) as Array<{ player_id: string; player_name: string; position: string; nfl_team: string }>;

  const idToRow = new Map(rows.map(r => [r.player_id, r]));
  return playerKeys.map((key, i) => {
    const row = idToRow.get(numericIds[i]);
    return {
      player_key: key,
      player_name: row?.player_name || '',
      position: row?.position || '',
      nfl_team: row?.nfl_team || '',
    };
  });
}

// Cache traded pick info for a league (which picks were acquired via trade)
export function cacheDraftPickTrades(leagueKey: string, trades: Array<{ pick: number; originalTeamKey: string }>) {
  if (trades.length === 0) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO draft_pick_trades (league_key, pick, original_team_key)
    VALUES (?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    for (const t of trades) {
      stmt.run(leagueKey, t.pick, t.originalTeamKey);
    }
  });
  transaction();
}

// Store the ordered league chain for a root league key
export function storeLeagueChain(rootKey: string, chain: Array<{ leagueKey: string; season: string }>) {
  db.prepare(`
    INSERT OR REPLACE INTO cache_metadata (key, value, last_updated)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(`draft_chain:${rootKey}`, JSON.stringify(chain));
}

// Retrieve the stored league chain for a root league key
export function getLeagueChain(rootKey: string): Array<{ leagueKey: string; season: string }> | null {
  const row = db.prepare(`SELECT value FROM cache_metadata WHERE key = ?`).get(`draft_chain:${rootKey}`) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

// Get all teams for a specific league
export function getTeamsForLeague(leagueKey: string): Array<{
  team_key: string;
  manager_id: string;
  manager_name: string;
}> {
  return db.prepare(`
    SELECT team_key, manager_id, manager_name FROM teams WHERE league_key = ? ORDER BY manager_name
  `).all(leagueKey) as any[];
}

// Search players by name (for keeper autocomplete)
export function searchPlayers(query: string, limit = 10): Array<{
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
}> {
  return db.prepare(`
    SELECT player_id as player_key, player_name, position, nfl_team
    FROM players WHERE player_name LIKE ? ORDER BY player_name LIMIT ?
  `).all(`%${query}%`, limit) as any[];
}

// Add a manual keeper
export function addManualKeeper(
  leagueKey: string, teamKey: string, playerKey: string,
  playerName: string, position: string, nflTeam: string
) {
  db.prepare(`
    INSERT OR REPLACE INTO manual_keepers (league_key, team_key, player_key, player_name, position, nfl_team)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leagueKey, teamKey, playerKey, playerName, position, nflTeam);
}

// Remove a manual keeper
export function removeManualKeeper(leagueKey: string, teamKey: string, playerName: string) {
  db.prepare(`
    DELETE FROM manual_keepers WHERE league_key = ? AND team_key = ? AND player_name = ?
  `).run(leagueKey, teamKey, playerName);
}

// Get all manual keepers for a league
export function getManualKeepersForLeague(leagueKey: string): Array<{
  team_key: string;
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
}> {
  return db.prepare(`
    SELECT team_key, player_key, player_name, position, nfl_team
    FROM manual_keepers WHERE league_key = ? ORDER BY team_key, player_name
  `).all(leagueKey) as any[];
}

// Get all keeper entries across a set of league keys (for summary/consecutive-years calculation)
// The owning manager is resolved from the final-season roster (roster_entries), not the
// original draft pick, so traded players are attributed to their end-of-year owner.
export function getKeeperSummaryForChain(chainLeagueKeys: string[]): Array<{
  league_key: string;
  season: string;
  player_key: string;
  player_name: string;
  position: string;
  nfl_team: string;
  round: number;
  team_key: string;
  manager_name: string;
  manager_id: string;
}> {
  if (chainLeagueKeys.length === 0) return [];
  const placeholders = chainLeagueKeys.map(() => '?').join(', ');
  return db.prepare(`
    SELECT kd.league_key, dp.season, dp.player_key, dp.player_name, dp.position, dp.nfl_team,
           dp.round,
           COALESCE(final_owner.team_key, dp.team_key) as team_key,
           COALESCE(t_owner.manager_name, t_draft.manager_name, dp.team_key) as manager_name,
           COALESCE(t_owner.manager_id, t_draft.manager_id, '') as manager_id
    FROM keeper_designations kd
    JOIN draft_picks dp ON kd.league_key = dp.league_key AND kd.pick = dp.pick
    LEFT JOIN teams t_draft ON dp.team_key = t_draft.team_key
    LEFT JOIN (
      SELECT re.player_id, re.season, t_re.league_key, MIN(re.team_key) as team_key
      FROM roster_entries re
      INNER JOIN teams t_re ON re.team_key = t_re.team_key
      GROUP BY re.player_id, re.season, t_re.league_key
    ) final_owner ON final_owner.player_id = SUBSTR(dp.player_key, INSTR(dp.player_key, '.p.') + 3)
                  AND final_owner.season = dp.season
                  AND final_owner.league_key = kd.league_key
    LEFT JOIN teams t_owner ON final_owner.team_key = t_owner.team_key
    WHERE kd.league_key IN (${placeholders})
    ORDER BY dp.season DESC, COALESCE(final_owner.team_key, dp.team_key), dp.round
  `).all(...chainLeagueKeys) as any[];
}

// Get all keeper-designated pick numbers for a league
export function getKeepersForLeague(leagueKey: string): number[] {
  return (db.prepare(`SELECT pick FROM keeper_designations WHERE league_key = ?`).all(leagueKey) as Array<{ pick: number }>).map(r => r.pick);
}

// Toggle a keeper designation; returns true if now a keeper, false if removed
export function toggleKeeper(leagueKey: string, pick: number): boolean {
  const existing = db.prepare(`SELECT id FROM keeper_designations WHERE league_key = ? AND pick = ?`).get(leagueKey, pick);
  if (existing) {
    db.prepare(`DELETE FROM keeper_designations WHERE league_key = ? AND pick = ?`).run(leagueKey, pick);
    return false;
  } else {
    db.prepare(`INSERT INTO keeper_designations (league_key, pick) VALUES (?, ?)`).run(leagueKey, pick);
    return true;
  }
}

// Transaction helper for bulk inserts
export function runInTransaction<T>(fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
