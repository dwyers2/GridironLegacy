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

// Transaction helper for bulk inserts
export function runInTransaction<T>(fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
