import * as db from './db';

interface SeasonRosterData {
  season: string;
  gameId: string;
  leagueKey: string;
  teams: Array<{
    teamKey: string;
    name: string;
    managerId: string;
    managerName: string;
    season?: string;
  }>;
  rosters: { [teamKey: string]: any[] };
}

/**
 * Cache season roster data to database
 */
export function cacheSeasonRosterData(data: SeasonRosterData) {
  db.runInTransaction(() => {
    // Cache league
    db.cacheLeague(data.leagueKey, `League ${data.season}`, data.season, data.gameId);

    // Cache each team and their roster
    for (const team of data.teams) {
      db.cacheTeam(
        team.teamKey,
        data.leagueKey,
        team.name,
        team.managerId,
        team.managerName,
        data.season
      );

      // Cache roster entries
      const roster = data.rosters[team.teamKey] || [];
      for (const playerWrapper of roster) {
        let playerInfo: any = {};

        if (Array.isArray(playerWrapper)) {
          // Raw Yahoo nested format
          const firstElement = playerWrapper[0];
          if (Array.isArray(firstElement)) {
            firstElement.forEach((item: any) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(playerInfo, item);
              }
            });
          } else if (typeof firstElement === 'object') {
            playerInfo = firstElement;
          }
        } else if (typeof playerWrapper === 'object') {
          // Slim pre-parsed format: { player_id, player_name, position, nfl_team }
          playerInfo = playerWrapper;
        }

        const playerId = playerInfo.player_id || playerInfo.player_key;
        if (!playerId) continue;

        // Support both slim format (player_name) and raw Yahoo format (name.full)
        const playerName = playerInfo.player_name || playerInfo.name?.full || playerInfo.name || 'Unknown';
        const position = playerInfo.position || playerInfo.display_position || playerInfo.position_type || playerInfo.primary_position || 'N/A';
        const nflTeam = playerInfo.nfl_team || playerInfo.editorial_team_abbr || playerInfo.team_abbr || 'FA';

        // Cache player
        db.cachePlayer(playerId, playerName, position, nflTeam);

        // Cache roster entry
        db.cacheRosterEntry(team.teamKey, playerId, data.season);
      }
    }
  });

  console.log(`💾 Cached ${data.teams.length} teams from ${data.season} (${data.leagueKey})`);
}

/**
 * Get all cached roster data (aggregated by manager)
 */
export function getCachedAggregatedData() {
  return db.getAllManagersWithRosters();
}

/**
 * Get cached roster data scoped to a specific league's history chain
 */
export function getCachedAggregatedDataForLeagues(leagueKeys: string[]) {
  return db.getManagersWithRostersByLeagueKeys(leagueKeys);
}

/**
 * Check if we should fetch fresh data for a season
 * Returns true if cache is older than 7 days or doesn't exist
 */
export function shouldFetchSeasonData(leagueKey: string): boolean {
  const cacheAge = db.getLeagueCacheAge(leagueKey);
  if (!cacheAge) return true;

  const season = db.getLeagueSeason(leagueKey);
  const currentYear = new Date().getFullYear().toString();
  const isCurrentSeason = season === currentYear;

  const daysSinceCache = (Date.now() - cacheAge.getTime()) / (1000 * 60 * 60 * 24);
  // Past seasons never change — only re-fetch if somehow missing entirely
  // Current season rosters update during the year — refresh daily
  return isCurrentSeason ? daysSinceCache > 1 : false;
}

/**
 * Get list of seasons we need to fetch (those not cached or stale)
 */
export function getMissingSeasonsForLeague(allLeagueKeys: string[]): string[] {
  return allLeagueKeys.filter(key => shouldFetchSeasonData(key));
}
