import { League, PlayerStats, ManagerHistory, SeasonRosterData, TeamInfo, ManagerOwnershipData, PlayerOwnership, FetchProgress, DraftPick, SeasonDraftData, RosterPlayer, TeamRoster } from '../types';

const BACKEND_URL = '/api';

// NFL Fantasy Football Game IDs by year (code: "nfl")
// Note: Some IDs like 416 are "nfls" (Survivor), not regular fantasy
const NFL_GAME_IDS: { [year: string]: string } = {
  '2025': '449',
  '2024': '423',
  '2023': '420',  // Was 422 - trying 420
  '2022': '419',  // Was 421 - trying 419
  '2021': '418',
  '2020': '406',  // Was 416 (that's nfls/Survivor!)
  '2019': '399',
  '2018': '390',
  '2017': '380',
  '2016': '371',
  '2015': '359',
};

// Helper to extract base league ID from league key
// "423.l.12345" -> "12345"
const extractLeagueId = (leagueKey: string): string => {
  const match = leagueKey.match(/\.l\.(\d+)/);
  return match ? match[1] : leagueKey;
};

// Helper to extract game ID from league key
// "423.l.12345" -> "423"
const extractGameId = (leagueKey: string): string => {
  const match = leagueKey.match(/^(\d+)\./);
  return match ? match[1] : '';
};

// Helper to construct league key for a specific season
// ("12345", "2023") -> "422.l.12345"
const buildLeagueKey = (baseLeagueId: string, year: string): string | null => {
  const gameId = NFL_GAME_IDS[year];
  if (!gameId) return null;
  return `${gameId}.l.${baseLeagueId}`;
};

// 1️⃣ Get Yahoo OAuth URL
export const getAuthUrl = async (): Promise<string> => {
  const res = await fetch(`${BACKEND_URL}/auth/url`);
  if (!res.ok) throw new Error('Failed to get auth URL from backend');
  const data = await res.json();
  
  // Store sessionId for PKCE verification
  sessionStorage.setItem('oauth_session_id', data.sessionId);
  
  return data.url;
};

// 2️⃣ Exchange code for token
export const exchangeCodeForToken = async (code: string): Promise<{ access_token: string, refresh_token: string }> => {
  console.log('🔄 Exchanging authorization code...');
  
  // Get the session ID for PKCE
  const sessionId = sessionStorage.getItem('oauth_session_id');
  if (!sessionId) {
    throw new Error('No session ID found - please restart OAuth flow');
  }
  
  const res = await fetch(`${BACKEND_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, sessionId }),
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    console.error('❌ Token exchange failed:', errorData);
    throw new Error(errorData.error_description || 'Failed to exchange code for token');
  }
  
  const data = await res.json();
  
  console.log('✅ Token received:', {
    access_token: data.access_token?.substring(0, 20) + '...',
    expires_in: data.expires_in,
    token_type: data.token_type,
    has_refresh: !!data.refresh_token
  });
  
  // Clean up session ID
  sessionStorage.removeItem('oauth_session_id');
  
  // Store ALL token data
  localStorage.setItem('yahoo_access_token', data.access_token);
  localStorage.setItem('yahoo_refresh_token', data.refresh_token);
  localStorage.setItem('yahoo_access_token_expires', (Date.now() + (data.expires_in * 1000)).toString());
  
  window.history.replaceState({}, document.title, window.location.pathname);
  
  return data;
};

// 3️⃣ Get access token (with auto-refresh)
export const getAccessToken = async (): Promise<string> => {
  let token = localStorage.getItem('yahoo_access_token');
  const expiresAt = localStorage.getItem('yahoo_access_token_expires');

  console.log('🔑 Token status:', {
    exists: !!token,
    expiresAt: expiresAt ? new Date(Number(expiresAt)).toISOString() : 'none',
    isExpired: expiresAt ? Date.now() > Number(expiresAt) : 'unknown'
  });

  if (!token || !expiresAt || Date.now() > Number(expiresAt)) {
    console.log('🔄 Token expired or missing, refreshing...');
    
    const refreshToken = localStorage.getItem('yahoo_refresh_token');
    if (!refreshToken) {
      console.error('❌ No refresh token available');
      throw new Error('No refresh token, login required');
    }

    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('❌ Token refresh failed:', errorData);
      throw new Error('Failed to refresh token - please log in again');
    }

    const data = await res.json();
    token = data.access_token;
    const expiresIn = data.expires_in || 3600;

    console.log('✅ Token refreshed successfully');

    localStorage.setItem('yahoo_access_token', token);
    localStorage.setItem('yahoo_access_token_expires', (Date.now() + expiresIn * 1000).toString());
  }
  
  return token;
};

// 4️⃣ Fetch user leagues via backend proxy
export const getLeagues = async (): Promise<any[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  console.log('📋 Fetching leagues...');

  // Correct Yahoo Fantasy API endpoint structure
  // Path: users;use_login=1/games;game_keys=nfl/leagues
  // This gets the current user's NFL leagues
  const apiPath = 'users;use_login=1/games;game_codes=nfl/leagues';
  const url = `${BACKEND_URL}/yahoo/${apiPath}`;

  console.log('🔗 URL:', url);
  console.log('🎫 Token (first 20 chars):', token.substring(0, 20) + '...');

  // Backend will add format=json automatically
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ Leagues fetch failed:', {
      status: res.status,
      statusText: res.statusText,
      error: errorText
    });

    // Try to parse as JSON
    try {
      const errorData = JSON.parse(errorText);
      console.error('Parsed error:', errorData);
    } catch (e) {
      console.error('Raw error:', errorText);
    }

    throw new Error(`Failed to fetch leagues: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log('✅ Full response:', JSON.stringify(data, null, 2));

  // Yahoo API response structure:
  // fantasy_content -> users -> [0] -> user -> [1] -> games -> [count, 0, 1, ...]
  const users = data.fantasy_content?.users;
  console.log('Users array:', users);

  if (!users || users.length === 0) {
    console.warn('No users found in response');
    return [];
  }

  // The structure is: users[0].user[1].games
  const user = users[0]?.user;
  console.log('User data:', user);

  if (!user || !Array.isArray(user)) {
    console.warn('User data not in expected format');
    return [];
  }

  // user is an array where [0] is metadata and [1] is games
  const gamesWrapper = user[1]?.games;
  console.log('Games wrapper:', gamesWrapper);

  if (!gamesWrapper) {
    console.warn('No games found in user data');
    return [];
  }

  // Extract leagues from all games
  const allLeagues: any[] = [];

  // gamesWrapper is an object like { count: 1, 0: { game: [...] } }
  // We need to iterate through numeric keys
  const gameCount = gamesWrapper.count || 0;
  console.log('🎮 Game count:', gameCount);

  for (let i = 0; i < gameCount; i++) {
    const gameWrapper = gamesWrapper[i];
    console.log(`Game ${i}:`, gameWrapper);

    if (!gameWrapper?.game) {
      console.warn(`Game ${i} missing game property`);
      continue;
    }

    const game = gameWrapper.game;
    console.log(`Game ${i} structure:`, Array.isArray(game) ? 'array' : 'object', game);

    // game is an array where [0] is game metadata and [1] might be leagues
    const leaguesWrapper = game[1]?.leagues;
    console.log(`Game ${i} leagues wrapper:`, leaguesWrapper);

    if (!leaguesWrapper) {
      console.warn(`Game ${i} has no leagues`);
      continue;
    }

    const leagueCount = leaguesWrapper.count || 0;
    console.log(`Game ${i} has ${leagueCount} leagues`);

    for (let j = 0; j < leagueCount; j++) {
      const leagueWrapper = leaguesWrapper[j];
      console.log(`Processing league ${j}:`, leagueWrapper);

      if (leagueWrapper?.league) {
        const rawLeague = leagueWrapper.league;
        console.log('Raw league data:', rawLeague);

        // League data might be an array where [0] is the actual data
        const leagueData = Array.isArray(rawLeague) ? rawLeague[0] : rawLeague;

        const leagueInfo = {
          id: leagueData.league_key || leagueData.league_id || `unknown_${i}_${j}`,
          name: leagueData.name || 'Unknown League',
          seasons: [leagueData.season || '2024'],
          sport: 'nfl',
          isKeeperLeague: false, // will be overridden below by draft-pick detection
          draftStatus: leagueData.draft_status || 'postdraft',
        };

        console.log('✅ Parsed league:', leagueInfo);
        allLeagues.push(leagueInfo);
      }
    }
  }

  const currentYear = new Date().getFullYear();
  const hasCurrentYearDrafted = allLeagues.some(
    l => Number(l.seasons[0]) === currentYear && l.draftStatus !== 'predraft'
  );
  const recentLeagues = allLeagues.filter(l => {
    const s = Number(l.seasons[0]);
    if (!(s === currentYear || s === currentYear - 1)) return false;
    // Hide current-year leagues where the draft hasn't happened yet
    if (s === currentYear && l.draftStatus === 'predraft') return false;
    // Hide prior-year leagues once the current year has drafted (accessible via chain)
    if (s === currentYear - 1 && hasCurrentYearDrafted) return false;
    return true;
  });

  console.log('📊 Showing leagues from current/prior year →', recentLeagues.length, 'league(s)');

  // Read keeper flag from DB (user-controlled, persists across sessions)
  const leaguesWithKeeper = await Promise.all(
    recentLeagues.map(async (league) => {
      try {
        const settingsRes = await fetch(`${BACKEND_URL}/league-settings/${encodeURIComponent(league.id)}`);
        if (!settingsRes.ok) return league;
        const { isKeeperLeague, maxKeepers, maxYearsKept } = await settingsRes.json();
        // null means never been set — default false
        return { ...league, isKeeperLeague: isKeeperLeague === true, maxKeepers: maxKeepers ?? null, maxYearsKept: maxYearsKept ?? null };
      } catch (e) {
        return league;
      }
    })
  );

  return leaguesWithKeeper;
};

// 5️⃣ Fetch manager insights
export const getManagerInsights = async (leagueId: string): Promise<ManagerHistory[]> => {
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No access token');

    console.log('👥 Fetching manager insights for league:', leagueId);

    // Correct Yahoo API path for league standings
    // Format: league/{league_key}/standings
    const apiPath = `league/${leagueId}/standings`;
    const url = `${BACKEND_URL}/yahoo/${apiPath}`;

    console.log('🔗 Standings URL:', url);

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Manager insights fetch failed:', errorText);
      throw new Error('Failed to fetch league standings');
    }

    const data = await res.json();
    console.log('✅ Standings data received');

    // Yahoo API response structure:
    // fantasy_content -> league -> [0] (metadata), [1] -> standings -> [0] -> teams
    const league = data?.fantasy_content?.league;

    if (!league || !Array.isArray(league)) {
      console.warn('League data not in expected format');
      return [];
    }

    const standingsWrapper = league[1]?.standings;

    if (!standingsWrapper || !Array.isArray(standingsWrapper)) {
      console.warn('Standings data not in expected format');
      return [];
    }

    const teamsWrapper = standingsWrapper[0]?.teams;

    if (!teamsWrapper) {
      console.warn('Teams data not found');
      return [];
    }

    const teamCount = teamsWrapper.count || 0;
    const managers: ManagerHistory[] = [];

    for (let i = 0; i < teamCount; i++) {
      const teamWrapper = teamsWrapper[i];
      if (!teamWrapper?.team) continue;

      const team = teamWrapper.team;

      // team is an array where [0] contains team info
      const teamInfo = team[0] || {};
      const teamStandings = team[1]?.team_standings || {};
      const outcomeTotal = teamStandings.outcome_totals || {};

      managers.push({
        managerId: teamInfo.team_key || 'unknown',
        managerName: teamInfo.name || 'Unknown Manager',
        yearsInLeague: 1, // Would need historical data to calculate
        championships: parseInt(outcomeTotal.wins || '0') > 10 ? 1 : 0,
      });
    }

    console.log('📊 Found', managers.length, 'managers');
    return managers;
  } catch (err) {
    console.error('Failed to get manager insights:', err);
    return [];
  }
};

// 6️⃣ Fetch player history
export const getPlayerHistory = async (leagueId: string): Promise<any[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  console.log('⚡ Fetching player history for league:', leagueId);

  // Correct Yahoo API path for league players
  // Format: league/{league_key}/players
  // Note: This might require additional parameters like status, position, etc.
  const apiPath = `league/${leagueId}/players`;
  const url = `${BACKEND_URL}/yahoo/${apiPath}`;

  console.log('🔗 Players URL:', url);

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ Player history fetch failed:', errorText);
    throw new Error('Failed to fetch player history');
  }

  const data = await res.json();
  console.log('✅ Player data received');

  // Yahoo API response structure:
  // fantasy_content -> league -> [1] -> players
  const league = data.fantasy_content?.league;

  if (!league || !Array.isArray(league)) {
    console.warn('League data not in expected format');
    return [];
  }

  const playersWrapper = league[1]?.players;

  if (!playersWrapper) {
    console.warn('No players found');
    return [];
  }

  const playerCount = playersWrapper.count || 0;
  const players: any[] = [];

  for (let i = 0; i < playerCount; i++) {
    const playerWrapper = playersWrapper[i];
    if (playerWrapper?.player) {
      players.push(playerWrapper.player);
    }
  }

  console.log('📊 Found', players.length, 'players');
  return players;
};

// 7️⃣ Fetch all historical rosters for a league across all seasons
export const getHistoricalRosters = async (leagueKey: string): Promise<any> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  console.log('📜 Fetching historical rosters for league:', leagueKey);

  try {
    // Get all teams in the league
    const apiPath = `league/${leagueKey}/teams`;
    const url = `${BACKEND_URL}/yahoo/${apiPath}`;

    console.log('🔗 Teams URL:', url);

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Teams fetch failed:', errorText);
      throw new Error('Failed to fetch teams');
    }

    const data = await res.json();
    console.log('✅ Teams data received');

    const league = data?.fantasy_content?.league;
    if (!league || !Array.isArray(league)) {
      console.warn('League data not in expected format');
      return { teams: [], rosters: {} };
    }

    const teamsWrapper = league[1]?.teams;
    if (!teamsWrapper) {
      console.warn('No teams found');
      return { teams: [], rosters: {} };
    }

    const teamCount = teamsWrapper.count || 0;
    const teams: any[] = [];
    const rosters: { [teamKey: string]: any[] } = {};

    // Fetch roster for each team
    for (let i = 0; i < teamCount; i++) {
      const teamWrapper = teamsWrapper[i];
      if (!teamWrapper?.team) continue;

      const team = teamWrapper.team;
      const teamInfo = team[0] || {};
      const teamKey = teamInfo.team_key;

      teams.push({
        teamKey,
        name: teamInfo.name,
        managerId: teamInfo.manager_id,
        managerName: teamInfo.managers?.[0]?.manager?.nickname || teamInfo.name,
      });

      // Fetch roster for this team
      try {
        const roster = await getTeamRoster(teamKey);
        rosters[teamKey] = roster;
      } catch (err) {
        console.error(`Failed to fetch roster for team ${teamKey}:`, err);
        rosters[teamKey] = [];
      }
    }

    console.log('📊 Found', teams.length, 'teams with rosters');
    return { teams, rosters };
  } catch (err) {
    console.error('Failed to get historical rosters:', err);
    return { teams: [], rosters: {} };
  }
};

// 8️⃣ Fetch roster for a specific team
export const getTeamRoster = async (teamKey: string): Promise<any[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  const apiPath = `team/${teamKey}/roster`;
  const url = `${BACKEND_URL}/yahoo/${apiPath}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch roster for team ${teamKey}`);
  }

  const data = await res.json();
  const team = data?.fantasy_content?.team;

  if (!team || !Array.isArray(team)) {
    return [];
  }

  const rosterWrapper = team[1]?.roster;
  if (!rosterWrapper) {
    return [];
  }

  const playersWrapper = rosterWrapper[0]?.players;
  if (!playersWrapper) {
    return [];
  }

  const playerCount = playersWrapper.count || 0;
  const players: any[] = [];

  for (let i = 0; i < playerCount; i++) {
    const playerWrapper = playersWrapper[i];
    if (playerWrapper?.player) {
      players.push(playerWrapper.player);
    }
  }

  return players;
};

// Helper to fetch user's leagues for a specific NFL season
const getLeaguesForSeason = async (gameId: string, year: string): Promise<any[]> => {
  const token = await getAccessToken();
  if (!token) {
    console.log(`  ❌ No access token for ${year}!`);
    return [];
  }

  console.log(`  🔍 Fetching user's leagues for ${year} (game_id: ${gameId})...`);

  // Get user's leagues for this specific game/season
  const apiPath = `users;use_login=1/games;game_keys=${gameId}/leagues`;
  const url = `${BACKEND_URL}/yahoo/${apiPath}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log(`  ⚠️ Error fetching leagues for ${year}: ${res.status} - ${errorText.substring(0, 200)}`);
      return [];
    }

    const data = await res.json();
    console.log(`  🔍 Raw API response structure for ${year}:`, JSON.stringify(data).substring(0, 500));

    const users = data.fantasy_content?.users;
    if (!users || users.length === 0) {
      console.log(`  ⚠️ No users array found for ${year}`);
      return [];
    }

    const user = users[0]?.user;
    if (!user || !Array.isArray(user)) {
      console.log(`  ⚠️ User data not an array for ${year}:`, typeof user);
      return [];
    }

    const gamesWrapper = user[1]?.games;
    if (!gamesWrapper) {
      console.log(`  ⚠️ No games wrapper found for ${year}. user[1]:`, user[1]);
      return [];
    }

    const leagues: any[] = [];
    const gameCount = gamesWrapper.count || 0;

    for (let i = 0; i < gameCount; i++) {
      const gameWrapper = gamesWrapper[i];
      if (!gameWrapper?.game) continue;

      const game = gameWrapper.game;
      const leaguesWrapper = game[1]?.leagues;
      if (!leaguesWrapper) continue;

      // Check that this game matches the NFL game_id we requested
      const gameInfo = Array.isArray(game[0]) ? game[0].reduce((acc: any, item: any) => ({ ...acc, ...item }), {}) : game[0];
      const returnedGameKey = gameInfo?.game_key || '';

      // Skip if this isn't the NFL game we requested
      if (returnedGameKey !== gameId) {
        console.log(`  ⏭️ Skipping non-NFL game: ${returnedGameKey} (expected ${gameId})`);
        continue;
      }

      const leagueCount = leaguesWrapper.count || 0;
      for (let j = 0; j < leagueCount; j++) {
        const leagueWrapper = leaguesWrapper[j];
        if (leagueWrapper?.league) {
          const rawLeague = leagueWrapper.league;
          const leagueData = Array.isArray(rawLeague) ? rawLeague[0] : rawLeague;

          // Double-check this is an NFL league by verifying league_key starts with NFL game_id
          const leagueKey = leagueData.league_key || '';
          if (!leagueKey.startsWith(gameId + '.')) {
            console.log(`  ⏭️ Skipping non-NFL league: ${leagueData.name} (${leagueKey})`);
            continue;
          }

          leagues.push({
            league_key: leagueKey,
            name: leagueData.name || 'Unknown League',
            season: year
          });
        }
      }
    }

    console.log(`  ✅ Found ${leagues.length} NFL leagues for ${year}:`, leagues.map(l => `${l.name} (${l.league_key})`));
    return leagues;
  } catch (err: any) {
    console.warn(`  ⚠️ Error fetching leagues for ${year}:`, err.message);
    return [];
  }
};

// Helper to convert renew format "449_108780" to league key "449.l.108780"
const parseRenewToLeagueKey = (renew: string): string => {
  // Format: "gameId_leagueId" -> "gameId.l.leagueId"
  const parts = renew.split('_');
  if (parts.length === 2) {
    return `${parts[0]}.l.${parts[1]}`;
  }
  return renew; // Return as-is if format doesn't match
};

// Helper to fetch league details and extract the renew (previous year) link
const getLeagueDetails = async (leagueKey: string): Promise<{ season: string; renew?: string; name: string } | null> => {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/yahoo/league/${leagueKey}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const league = data?.fantasy_content?.league;
    if (!Array.isArray(league)) return null;

    const leagueInfo = league[0] || {};

    // Convert renew format from "449_108780" to "449.l.108780"
    const renewRaw = leagueInfo.renew;
    const renewKey = renewRaw ? parseRenewToLeagueKey(renewRaw) : undefined;

    return {
      season: leagueInfo.season || '',
      renew: renewKey,
      name: leagueInfo.name || ''
    };
  } catch (err) {
    return null;
  }
};

// 9️⃣ Fetch multi-season rosters and aggregate ownership data
export interface MultiSeasonOptions {
  onProgress?: (progress: FetchProgress) => void;
}

export const getMultiSeasonRosters = async (
  currentLeagueKey: string,
  options?: MultiSeasonOptions
): Promise<{
  allSeasonData: SeasonRosterData[];
  aggregatedOwnership: ManagerOwnershipData[];
  errors: { season: string; message: string }[];
}> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  console.log(`📜 Fetching multi-season rosters for league: ${currentLeagueKey}`);

  // 🔗 STEP 1: Build the league chain by following 'renew' links
  console.log(`🔗 Building league chain from renew links...`);
  const leagueChain: Array<{ leagueKey: string; season: string; name: string }> = [];
  let currentKey: string | undefined = currentLeagueKey;

  while (currentKey) {
    const details = await getLeagueDetails(currentKey);
    if (!details) {
      console.log(`  ⚠️ Could not fetch details for ${currentKey}`);
      break;
    }

    leagueChain.push({
      leagueKey: currentKey,
      season: details.season,
      name: details.name
    });
    console.log(`  📅 ${details.season}: ${details.name} (${currentKey})${details.renew ? ` → renew: ${details.renew}` : ' (no renew link)'}`);

    currentKey = details.renew;
  }

  console.log(`🔗 Found ${leagueChain.length} linked seasons`);

  // 💾 STEP 2: Check cache for which seasons we already have (scoped to this league chain)
  console.log(`💾 Checking cache...`);
  let cachedSeasons: string[] = [];
  let cachedManagers: ManagerOwnershipData[] = [];

  const chainKeys = leagueChain.map(l => l.leagueKey);
  const aggregatedUrl = `${BACKEND_URL}/cache/aggregated?leagueKeys=${encodeURIComponent(chainKeys.join(','))}`;

  try {
    const cacheRes = await fetch(aggregatedUrl);
    if (cacheRes.ok) {
      const cacheData = await cacheRes.json();
      cachedSeasons = cacheData.cachedSeasons || [];
      cachedManagers = cacheData.managers || [];
      console.log(`💾 Cached seasons (this league): ${cachedSeasons.join(', ') || 'none'}`);
    }
  } catch (err: any) {
    console.log(`⚠️ Cache error: ${err.message}`);
  }

  // Filter to only non-cached seasons
  const leaguesToFetch = leagueChain.filter(l => !cachedSeasons.includes(l.season));

  if (leaguesToFetch.length === 0) {
    console.log(`✅ All ${leagueChain.length} seasons already cached! Returning cached data.`);
    return {
      allSeasonData: [],
      aggregatedOwnership: cachedManagers,
      errors: []
    };
  }

  console.log(`🌐 Need to fetch ${leaguesToFetch.length} seasons: ${leaguesToFetch.map(l => l.season).join(', ')}`);
  const allSeasonData: SeasonRosterData[] = [];
  const errors: { season: string; message: string }[] = [];

  // 🌐 STEP 3: Fetch rosters for each non-cached season
  for (let i = 0; i < leaguesToFetch.length; i++) {
    const { leagueKey, season, name } = leaguesToFetch[i];

    console.log(`\n📆 ===== PROCESSING ${season}: ${name} (${i + 1}/${leaguesToFetch.length}) =====`);

    // Report progress
    options?.onProgress?.({
      season: season,
      current: i + 1,
      total: leaguesToFetch.length
    });

    try {
      const seasonData = await fetchSeasonRoster(leagueKey, season);
      if (seasonData.teams.length > 0) {
        allSeasonData.push(seasonData);
        console.log(`  ✅ Found ${seasonData.teams.length} teams`);

        // 💾 Cache this season data immediately
        try {
          await fetch(`${BACKEND_URL}/cache/season`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seasonData)
          });
          console.log(`  💾 Cached ${season} data`);
        } catch (cacheErr) {
          console.warn(`  ⚠️ Failed to cache ${season}:`, cacheErr);
        }
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Error fetching rosters for ${leagueKey}:`, err.message);
      errors.push({ season: `${season} (${name})`, message: err.message });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`📊 Found data for ${allSeasonData.length} newly fetched league-seasons`);

  // After fetching new data, reload the aggregated cache scoped to this league chain
  let finalAggregatedData: ManagerOwnershipData[] = [];

  try {
    const finalCacheRes = await fetch(aggregatedUrl);
    if (finalCacheRes.ok) {
      const finalCache = await finalCacheRes.json();
      finalAggregatedData = finalCache.managers || [];
      console.log(`📊 Final aggregated data: ${finalAggregatedData.length} managers for this league`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Could not reload final cache, using cached data:`, err.message);
    finalAggregatedData = cachedManagers;
  }

  return { allSeasonData, aggregatedOwnership: finalAggregatedData, errors };
};

// Helper function to fetch single season roster
const fetchSeasonRoster = async (
  leagueKey: string,
  year: string
): Promise<SeasonRosterData> => {
  const token = await getAccessToken();
  // Extract game ID from league key (e.g., "359.l.12345" -> "359")
  const gameId = extractGameId(leagueKey);

  // Fetch teams for this season
  const teamsUrl = `${BACKEND_URL}/yahoo/league/${leagueKey}/teams`;
  const teamsRes = await fetch(teamsUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!teamsRes.ok) {
    throw new Error(`Failed to fetch teams: ${teamsRes.status}`);
  }

  const teamsData = await teamsRes.json();
  const league = teamsData?.fantasy_content?.league;

  if (!league || !Array.isArray(league)) {
    console.warn(`  ⚠️ Unexpected league structure for ${leagueKey}`);
    return { season: year, gameId, leagueKey, teams: [], rosters: {} };
  }

  const teamsWrapper = league[1]?.teams;
  if (!teamsWrapper) {
    console.warn(`  ⚠️ No teams wrapper found for ${leagueKey}`);
    return { season: year, gameId, leagueKey, teams: [], rosters: {} };
  }

  const teamCount = teamsWrapper.count || 0;
  console.log(`  📋 Processing ${teamCount} teams for ${leagueKey}`);
  const teams: TeamInfo[] = [];
  const rosters: { [teamKey: string]: any[] } = {};

  // Fetch roster for each team
  for (let i = 0; i < teamCount; i++) {
    const teamWrapper = teamsWrapper[i];
    if (!teamWrapper?.team) {
      console.warn(`  ⚠️ Team ${i} has no team property`);
      continue;
    }

    const team = teamWrapper.team;

    // Team data is an array of objects, each containing one property
    // Convert array to a single object for easier access
    let teamInfo: any = {};
    if (Array.isArray(team[0])) {
      // team[0] is an array like [{"team_key":"..."}, {"team_id":"..."}, {"name":"..."}, ...]
      team[0].forEach((item: any) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(teamInfo, item);
        }
      });
    } else {
      teamInfo = team[0] || {};
    }

    const teamKey = teamInfo.team_key;

    // Skip if no valid team key
    if (!teamKey) {
      console.warn(`  ⚠️ Team ${i} missing team_key after parsing`);
      continue;
    }

    console.log(`  👥 Team ${i}: ${teamInfo.name} (${teamKey})`);

    // Extract manager info - handle different API response structures
    let managerName = teamInfo.name;
    let managerId = teamKey;

    if (teamInfo.managers && Array.isArray(teamInfo.managers)) {
      const manager = teamInfo.managers[0]?.manager;
      if (manager) {
        managerId = manager.guid || manager.manager_id || teamKey;
        managerName = manager.nickname || manager.email || teamInfo.name;
      }
    }

    teams.push({
      teamKey,
      name: teamInfo.name,
      managerId,
      managerName,
      season: year
    });

    // Fetch roster and strip to minimal fields to keep payload small
    try {
      const rosterPlayers = await getTeamRoster(teamKey);
      rosters[teamKey] = rosterPlayers.map(playerWrapper => {
        let playerInfo: any = {};
        if (Array.isArray(playerWrapper)) {
          const first = playerWrapper[0];
          if (Array.isArray(first)) {
            first.forEach((item: any) => { if (typeof item === 'object' && item !== null) Object.assign(playerInfo, item); });
          } else if (typeof first === 'object') {
            playerInfo = first;
          }
        } else if (typeof playerWrapper === 'object') {
          playerInfo = playerWrapper;
        }
        const playerId = playerInfo.player_id || playerInfo.player_key;
        if (!playerId) return null;
        return {
          player_id: playerId,
          player_name: playerInfo.name?.full || playerInfo.name || 'Unknown',
          position: playerInfo.display_position || playerInfo.position_type || playerInfo.primary_position || 'N/A',
          nfl_team: playerInfo.editorial_team_abbr || playerInfo.team_abbr || 'FA',
        };
      }).filter(Boolean);
    } catch (err) {
      console.warn(`  Failed to fetch roster for ${teamKey}:`, err);
      rosters[teamKey] = [];
    }
  }

  return {
    season: year,
    gameId,
    leagueKey,
    teams,
    rosters
  };
};

// Aggregate player ownership across all seasons per manager
const aggregatePlayerOwnership = (
  allSeasonData: SeasonRosterData[]
): ManagerOwnershipData[] => {
  // Map: managerId -> { managerName, seasonsTracked, playerMap }
  const managerMap = new Map<string, {
    managerName: string;
    seasonsTracked: Set<string>;
    playerMap: Map<string, PlayerOwnership>;
  }>();

  for (const seasonData of allSeasonData) {
    for (const team of seasonData.teams) {
      const managerId = team.managerId;

      if (!managerMap.has(managerId)) {
        managerMap.set(managerId, {
          managerName: team.managerName,
          seasonsTracked: new Set(),
          playerMap: new Map()
        });
      }

      const managerEntry = managerMap.get(managerId)!;
      managerEntry.seasonsTracked.add(seasonData.season);

      // Process roster
      const roster = seasonData.rosters[team.teamKey] || [];
      console.log(`    Processing ${roster.length} players for ${team.managerName} (${team.teamKey})`);

      for (const playerWrapper of roster) {
        // playerWrapper is likely an array like team data was
        let playerInfo: any = {};

        if (Array.isArray(playerWrapper)) {
          // First element might be an array of objects like team data
          const firstElement = playerWrapper[0];
          if (Array.isArray(firstElement)) {
            // Convert array of single-property objects to one object
            firstElement.forEach((item: any) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(playerInfo, item);
              }
            });
          } else if (typeof firstElement === 'object') {
            playerInfo = firstElement;
          }
        } else if (typeof playerWrapper === 'object') {
          playerInfo = playerWrapper;
        }

        const playerId = playerInfo.player_id || playerInfo.player_key;
        if (!playerId) {
          console.warn(`      ⚠️ Player missing ID, skipping. Data:`, JSON.stringify(playerInfo).substring(0, 150));
          continue;
        }

        const playerName = playerInfo.name?.full || playerInfo.name || 'Unknown';
        const position = playerInfo.display_position || playerInfo.position_type || playerInfo.primary_position || 'N/A';
        const nflTeam = playerInfo.editorial_team_abbr || playerInfo.team_abbr || 'FA';

        console.log(`      ✅ Player: ${playerName} (${position}, ${nflTeam})`);

        if (!managerEntry.playerMap.has(playerId)) {
          managerEntry.playerMap.set(playerId, {
            playerId,
            playerName,
            position,
            team: nflTeam,
            timesOwned: 0,
            seasons: []
          });
        }

        const player = managerEntry.playerMap.get(playerId)!;
        player.timesOwned += 1;
        if (!player.seasons.includes(seasonData.season)) {
          player.seasons.push(seasonData.season);
        }
        // Keep team updated to most recent
        player.team = nflTeam;
      }
    }
  }

  // Convert to array
  return Array.from(managerMap.entries()).map(([managerId, data]) => ({
    managerId,
    managerName: data.managerName,
    seasonsTracked: Array.from(data.seasonsTracked).sort((a, b) => Number(b) - Number(a)),
    players: Array.from(data.playerMap.values())
  }));
};

/** Build an ordered teams array from picks — handles traded-pick drafts where not every team has a round-1 pick */
function teamsFromPicks(picks: DraftPick[]): Array<{ teamKey: string; managerName: string; draftSlot: number }> {
  const teamFirstPick = new Map<string, { managerName: string; firstPick: number }>();
  for (const p of picks) {
    const existing = teamFirstPick.get(p.teamKey);
    if (!existing || p.pick < existing.firstPick) {
      teamFirstPick.set(p.teamKey, { managerName: p.managerName, firstPick: p.pick });
    }
  }
  return [...teamFirstPick.entries()]
    .sort((a, b) => a[1].firstPick - b[1].firstPick)
    .map((e, idx) => ({ teamKey: e[0], managerName: e[1].managerName, draftSlot: idx + 1 }));
}

// 🏈 Fetch & cache draft results for a single league season
// Returns SeasonDraftData. Also caches results to backend DB.
const fetchLeagueDraftResults = async (
  leagueKey: string,
  season: string,
  chainOpts?: { rootKey: string; chain: Array<{ leagueKey: string; season: string }> }
): Promise<SeasonDraftData> => {
  const token = await getAccessToken();

  // Fetch teams to build teamKey -> managerName + draftPosition maps
  const teamMap: Map<string, string> = new Map();
  const draftPositionMap: Map<string, number> = new Map(); // teamKey -> draft position (1-based)
  try {
    const teamsRes = await fetch(`${BACKEND_URL}/yahoo/league/${leagueKey}/teams`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (teamsRes.ok) {
      const teamsData = await teamsRes.json();
      const league = teamsData?.fantasy_content?.league;
      if (Array.isArray(league)) {
        const teamsWrapper = league[1]?.teams;
        const teamCount = teamsWrapper?.count || 0;
        for (let i = 0; i < teamCount; i++) {
          const teamWrapper = teamsWrapper[i];
          if (!teamWrapper?.team) continue;
          const team = teamWrapper.team;
          let teamInfo: any = {};
          if (Array.isArray(team[0])) {
            team[0].forEach((item: any) => { if (typeof item === 'object') Object.assign(teamInfo, item); });
          } else {
            teamInfo = team[0] || {};
          }
          const teamKey = teamInfo.team_key;
          if (!teamKey) continue;
          let managerName = teamInfo.name;
          if (teamInfo.managers && Array.isArray(teamInfo.managers)) {
            const mgr = teamInfo.managers[0]?.manager;
            if (mgr) managerName = mgr.nickname || mgr.email || teamInfo.name;
          }
          teamMap.set(teamKey, managerName || teamKey);
          const draftPos = parseInt(teamInfo.draft_position);
          if (draftPos > 0) draftPositionMap.set(teamKey, draftPos);
        }
      }
    }
  } catch (_) {}

  // Fetch draft results
  const draftRes = await fetch(`${BACKEND_URL}/yahoo/league/${leagueKey}/draftresults`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!draftRes.ok) {
    throw new Error(`Failed to fetch draft results for ${leagueKey}: ${draftRes.status}`);
  }

  const draftData = await draftRes.json();
  const leagueArr = draftData?.fantasy_content?.league;
  if (!Array.isArray(leagueArr)) {
    return { season, leagueKey, picks: [], teams: [] };
  }

  const draftResultsWrapper = leagueArr[1]?.draft_results;
  if (!draftResultsWrapper) {
    return { season, leagueKey, picks: [], teams: [] };
  }

  const count = draftResultsWrapper.count || 0;
  const rawPicks: Array<{ round: number; pick: number; teamKey: string; playerKey: string; cost?: number; isKeeper?: boolean }> = [];

  for (let i = 0; i < count; i++) {
    const dr = draftResultsWrapper[i]?.draft_result;
    if (!dr) continue;
    rawPicks.push({
      round: parseInt(dr.round),
      pick: parseInt(dr.pick),
      teamKey: dr.team_key,
      playerKey: dr.player_key || '',
      cost: dr.cost !== undefined ? parseInt(dr.cost) : undefined,
      isKeeper: dr.is_keeper === '1' || dr.is_keeper === 1,
    });
  }

  if (rawPicks.length === 0) {
    return { season, leagueKey, picks: [], teams: [] };
  }

  // Step 1: try to resolve player names from backend DB cache
  const playerInfoMap: Map<string, { playerName: string; position: string; nflTeam: string }> = new Map();
  try {
    const resolveRes = await fetch(`${BACKEND_URL}/players/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerKeys: rawPicks.map(p => p.playerKey) }),
    });
    if (resolveRes.ok) {
      const { players: resolved } = await resolveRes.json();
      for (const p of resolved) {
        if (p.player_name) {
          playerInfoMap.set(p.player_key, { playerName: p.player_name, position: p.position, nflTeam: p.nfl_team });
        }
      }
    }
  } catch (_) {}

  // Step 2: for any players not in DB, fetch from Yahoo batch player API
  const missingKeys = rawPicks.map(p => p.playerKey).filter(k => !playerInfoMap.has(k));
  if (missingKeys.length > 0) {
    const BATCH_SIZE = 25;
    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
      const batch = missingKeys.slice(i, i + BATCH_SIZE);
      try {
        const playerKeysParam = batch.join(',');
        const yahooRes = await fetch(
          `${BACKEND_URL}/yahoo/players;player_keys=${playerKeysParam}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (yahooRes.ok) {
          const data = await yahooRes.json();
          const playersWrapper = data?.fantasy_content?.players;
          if (playersWrapper) {
            const pCount = playersWrapper.count || 0;
            for (let j = 0; j < pCount; j++) {
              const playerArr = playersWrapper[j]?.player;
              if (!Array.isArray(playerArr)) continue;
              // playerArr[0] is an array of single-property objects
              let playerInfo: any = {};
              if (Array.isArray(playerArr[0])) {
                playerArr[0].forEach((item: any) => { if (typeof item === 'object') Object.assign(playerInfo, item); });
              } else {
                playerInfo = playerArr[0] || {};
              }
              const pKey = playerInfo.player_key;
              const pName = playerInfo.name?.full || playerInfo.name || '';
              const pPos = playerInfo.display_position || playerInfo.position_type || '';
              const pTeam = playerInfo.editorial_team_abbr || '';
              if (pKey && pName) {
                playerInfoMap.set(pKey, { playerName: pName, position: pPos, nflTeam: pTeam });
              }
            }
          }
        }
      } catch (_) {}
      if (i + BATCH_SIZE < missingKeys.length) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  // Compute original pick owners via snake-draft formula using draft positions.
  // If a pick's actual team differs from the original owner, it was traded.
  const numTeams = teamMap.size;
  const originalOwnerMap = new Map<number, string>(); // overallPick -> original teamKey
  if (draftPositionMap.size === numTeams && numTeams > 0) {
    const posToTeam = new Map<number, string>();
    draftPositionMap.forEach((pos, key) => posToTeam.set(pos, key));
    const maxRound = Math.ceil(rawPicks.length / numTeams);
    for (let round = 1; round <= maxRound; round++) {
      for (let slot = 1; slot <= numTeams; slot++) {
        const pickInRound = round % 2 === 1 ? slot : numTeams - slot + 1;
        const overallPick = (round - 1) * numTeams + pickInRound;
        const teamKey = posToTeam.get(slot);
        if (teamKey) originalOwnerMap.set(overallPick, teamKey);
      }
    }
  }

  const isAuction = rawPicks.some(rp => rp.cost !== undefined && rp.cost > 0);

  const picks: DraftPick[] = rawPicks.map((rp) => {
    const info = playerInfoMap.get(rp.playerKey);
    const originalTeamKey = originalOwnerMap.get(rp.pick);
    const wasTraded = !isAuction && originalTeamKey !== undefined && originalTeamKey !== rp.teamKey;
    return {
      round: rp.round,
      pick: rp.pick,
      teamKey: rp.teamKey,
      managerName: teamMap.get(rp.teamKey) || rp.teamKey,
      playerName: info?.playerName || '',
      position: info?.position || '',
      nflTeam: info?.nflTeam || '',
      playerKey: rp.playerKey,
      cost: rp.cost,
      originalManagerName: wasTraded ? (teamMap.get(originalTeamKey!) || originalTeamKey) : undefined,
    };
  });

  // Build list of traded picks for caching
  const trades = rawPicks
    .map(rp => {
      const originalTeamKey = originalOwnerMap.get(rp.pick);
      return (originalTeamKey && originalTeamKey !== rp.teamKey)
        ? { pick: rp.pick, originalTeamKey }
        : null;
    })
    .filter(Boolean) as Array<{ pick: number; originalTeamKey: string }>;

  // Cache to backend DB (keep raw player_key for SQL join resolution)
  try {
    await fetch(`${BACKEND_URL}/cache/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagueKey,
        season,
        picks: rawPicks.map((rp, idx) => ({
          round: rp.round,
          pick: rp.pick,
          teamKey: rp.teamKey,
          playerKey: rp.playerKey,
          playerName: picks[idx].playerName,
          position: picks[idx].position,
          nflTeam: picks[idx].nflTeam,
          cost: rp.cost ?? null,
          managerName: picks[idx].managerName,
        })),
        trades,
        ...(chainOpts ? { rootKey: chainOpts.rootKey, chain: chainOpts.chain } : {}),
      }),
    });
  } catch (_) {}

  const teams = teamsFromPicks(picks);
  return { season, leagueKey, picks, teams, isAuction };
};

// 🏈 Get multi-season draft results (follows renew links, uses cache)
export const getMultiSeasonDraftResults = async (
  currentLeagueKey: string,
  onProgress?: (current: number, total: number, season: string) => void
): Promise<SeasonDraftData[]> => {
  console.log(`🏈 Fetching multi-season draft results for ${currentLeagueKey}`);

  // Short-circuit: check if we have a stored chain with all seasons already cached
  try {
    const chainRes = await fetch(`${BACKEND_URL}/cache/draft/chain/${currentLeagueKey}`);
    if (chainRes.ok) {
      const chainData = await chainRes.json();
      if (chainData.found && chainData.allCached) {
        console.log(`💾 Full draft chain cached — loading ${chainData.seasons.length} seasons from DB`);
        const results: SeasonDraftData[] = chainData.seasons
          .filter((s: any) => s.picks.length > 0)
          .map((s: any) => {
            const picks: DraftPick[] = s.picks.map((p: any) => ({
              round: p.round,
              pick: p.pick,
              teamKey: p.team_key,
              managerName: p.manager_name,
              playerName: p.player_name,
              position: p.position,
              nflTeam: p.nfl_team,
              playerKey: p.player_key || undefined,
              seasonPoints: p.season_points ?? undefined,
              cost: p.cost ?? undefined,
              originalManagerName: p.original_manager_name || undefined,
            }));
            const isAuction = picks.some(p => (p.cost ?? 0) > 0);
            return {
              season: s.season,
              leagueKey: s.leagueKey,
              picks,
              teams: teamsFromPicks(picks),
              isAuction,
            };
          });
        results.sort((a, b) => Number(b.season) - Number(a.season));
        return results;
      }
    }
  } catch (_) {}

  // Cache miss — build league chain by following renew links
  const leagueChain: Array<{ leagueKey: string; season: string }> = [];
  let currentKey: string | undefined = currentLeagueKey;

  while (currentKey) {
    const details = await getLeagueDetails(currentKey);
    if (!details) break;
    leagueChain.push({ leagueKey: currentKey, season: details.season });
    currentKey = details.renew;
  }

  console.log(`🔗 Draft chain: ${leagueChain.map(l => l.season).join(', ')}`);

  const results: SeasonDraftData[] = [];

  for (let i = 0; i < leagueChain.length; i++) {
    const { leagueKey, season } = leagueChain[i];

    // Check cache first
    try {
      const cacheRes = await fetch(`${BACKEND_URL}/cache/draft/${leagueKey}`);
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        // Only use cache if player names are populated (not empty from a failed first fetch)
        const hasNames = cacheData.picks.some((p: any) => p.player_name && p.player_name.length > 0);
        if (cacheData.exists && cacheData.picks.length > 0 && hasNames) {
          console.log(`  💾 Using cached draft data for ${season}`);
          const cachedPicks: DraftPick[] = cacheData.picks.map((p: any) => ({
            round: p.round,
            pick: p.pick,
            teamKey: p.team_key,
            managerName: p.manager_name,
            playerName: p.player_name,
            position: p.position,
            nflTeam: p.nfl_team,
            cost: p.cost ?? undefined,
            originalManagerName: p.original_manager_name || undefined,
          }));
          results.push({
            season,
            leagueKey,
            picks: cachedPicks,
            teams: teamsFromPicks(cachedPicks),
            isAuction: cachedPicks.some(p => (p.cost ?? 0) > 0),
          });
          continue;
        }
      }
    } catch (_) {}

    onProgress?.(i + 1, leagueChain.length, season);

    try {
      console.log(`  🌐 Fetching draft results for ${season} (${leagueKey})...`);
      // Pass chain along when fetching the root league so server stores it atomically with picks
      const chainOpts = leagueKey === currentLeagueKey ? { rootKey: currentLeagueKey, chain: leagueChain } : undefined;
      const seasonDraft = await fetchLeagueDraftResults(leagueKey, season, chainOpts);
      if (seasonDraft.picks.length > 0) {
        results.push(seasonDraft);
        console.log(`  ✅ ${seasonDraft.picks.length} picks for ${season}`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Failed to fetch draft results for ${season}:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Always store the chain after traversal — even if all picks came from cache.
  // The atomic pick-save only fires on cache misses, so this covers the all-cached case.
  if (leagueChain.length > 0) {
    fetch(`${BACKEND_URL}/cache/draft/chain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootKey: currentLeagueKey, chain: leagueChain }),
    }).catch(err => console.warn('Failed to store draft chain:', err.message));
  }

  // Sort by season descending (most recent first)
  results.sort((a, b) => Number(b.season) - Number(a.season));
  return results;
};

// ─── Transaction cache ─────────────────────────────────────────────────────

// Parse the Yahoo transactions API response page into flat row objects.
// Yahoo wraps each transaction as:
//   transactions["0"] = { transaction: [ {meta}, { players: { "0": { player: [...] }, count } } ] }
const parseTransactionPage = (data: any, season: string): Array<{
  transaction_key: string; season: string; type: string; source_type: string | null;
  player_key: string; player_id: string | null; player_name: string | null;
  team_key: string | null; timestamp: number;
}> => {
  const rows: any[] = [];
  const league = data?.fantasy_content?.league;
  if (!Array.isArray(league)) return rows;

  const txWrapper = league[1]?.transactions;
  if (!txWrapper) return rows;

  const count: number = txWrapper.count || 0;
  for (let i = 0; i < count; i++) {
    const txEntry = txWrapper[String(i)];
    if (!txEntry?.transaction) continue;

    const [meta, body] = txEntry.transaction as [any, any];
    if (!meta || !body) continue;

    const txKey: string = meta.transaction_key || '';
    const txType: string = meta.type || '';          // 'add/drop', 'trade', 'commissioner'
    const ts: number = parseInt(meta.timestamp || '0', 10);
    const playersWrapper = body?.players;
    if (!playersWrapper) continue;

    const pCount: number = playersWrapper.count || 0;
    for (let j = 0; j < pCount; j++) {
      const pw = playersWrapper[String(j)];
      if (!pw?.player) continue;

      const playerInfoArr: any[] = Array.isArray(pw.player[0]) ? pw.player[0] : [];
      const pInfo: any = {};
      for (const item of playerInfoArr) {
        if (item && typeof item === 'object') Object.assign(pInfo, item);
      }

      const txDataRaw = pw.player[1]?.transaction_data;
      if (!txDataRaw) continue;

      // add/drop transactions: transaction_data is a single object
      // trade transactions:    transaction_data is an array [{add side}, {drop side}]
      const txDataItems: any[] = Array.isArray(txDataRaw) ? txDataRaw : [txDataRaw];

      const playerKeyFull: string = pInfo.player_key || '';
      const keyMatch = playerKeyFull.match(/\.p\.(\d+)$/);
      const playerId: string | null = keyMatch ? keyMatch[1] : null;
      const playerName: string | null = pInfo.name?.full || null;

      for (const txData of txDataItems) {
        const playerType: string = txData.type || '';
        const sourceType: string | null = txData.source_type || null;
        const destTeamKey: string | null = txData.destination_team_key || null;
        const srcTeamKey: string | null = txData.source_team_key || null;

        if (txType === 'trade') {
          // Yahoo sends each trade player ONCE with both source and destination keys.
          // Emit both sides so we can look up who received the player.
          if (destTeamKey) {
            rows.push({ transaction_key: txKey, season, type: 'trade_add', source_type: 'team',
              player_key: playerKeyFull, player_id: playerId, player_name: playerName,
              team_key: destTeamKey, timestamp: ts });
          }
          if (srcTeamKey) {
            rows.push({ transaction_key: txKey, season, type: 'trade_drop', source_type: 'team',
              player_key: playerKeyFull, player_id: playerId, player_name: playerName,
              team_key: srcTeamKey, timestamp: ts });
          }
        } else {
          rows.push({
            transaction_key: txKey, season,
            type: playerType, // 'add' or 'drop'
            source_type: sourceType,
            player_key: playerKeyFull, player_id: playerId, player_name: playerName,
            team_key: playerType === 'add' ? destTeamKey : srcTeamKey,
            timestamp: ts,
          });
        }
      }
    }
  }
  return rows;
};

// Fetch ALL transactions for a league in a given season, paginating 25 at a time.
// Persists every page to the DB immediately (INSERT OR IGNORE — safe to re-run).
export const fetchAndCacheTransactions = async (
  leagueKey: string,
  season: string,
  onProgress?: (fetched: number) => void
): Promise<number> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  const PAGE_SIZE = 25;
  let start = 0;
  let totalFetched = 0;

  console.log(`📋 Fetching transactions for ${leagueKey} season ${season}…`);

  while (true) {
    // Fetch all transaction types — Yahoo's combined type is "add/drop", not separate "add,drop"
    // Filter to relevant types in parseTransactionPage instead of on the URL
    const url = `${BACKEND_URL}/yahoo/league/${leagueKey}/transactions?start=${start}&count=${PAGE_SIZE}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
      console.warn(`  ⚠️ Transactions fetch failed at start=${start}: ${res.status}`);
      break;
    }

    const data = await res.json();

    // Log first page to confirm structure
    if (start === 0) {
      console.log('[tx debug] raw response keys:', JSON.stringify(Object.keys(data?.fantasy_content?.league?.[1] ?? {})));
      const sample = data?.fantasy_content?.league?.[1]?.transactions;
      console.log('[tx debug] transactions wrapper keys:', JSON.stringify(Object.keys(sample ?? {})));
      console.log('[tx debug] first entry:', JSON.stringify(sample?.['0'])?.substring(0, 400));
    }

    // How many transaction *headers* did Yahoo return for this page?
    const leagueArr = data?.fantasy_content?.league;
    const txCount: number = Array.isArray(leagueArr)
      ? (leagueArr[1]?.transactions?.count || 0)
      : 0;

    if (txCount === 0) break; // no more transactions

    const rows = parseTransactionPage(data, season);

    if (rows.length > 0) {
      await fetch(`${BACKEND_URL}/cache/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueKey, rows }),
      });
      totalFetched += rows.length;
      onProgress?.(totalFetched);
      console.log(`  📋 Transactions: ${totalFetched} player-legs cached so far…`);
    }

    if (txCount < PAGE_SIZE) break; // last page

    start += PAGE_SIZE;
    if (start > 2500) break; // safety ceiling for very active leagues
  }

  console.log(`  ✅ Transactions complete: ${totalFetched} rows cached for ${leagueKey}`);
  return totalFetched;
};

// Build a lookup map { "playerKey|teamKey" → { type, source_type, timestamp } }
// from cached transaction data (fetched from the DB endpoint)
export const buildAcquisitionMap = async (
  leagueKey: string,
  season: string
): Promise<Map<string, { type: string; source_type: string | null; timestamp: number }>> => {
  const res = await fetch(`${BACKEND_URL}/cache/transactions/${leagueKey}?season=${season}`);
  const map = new Map<string, { type: string; source_type: string | null; timestamp: number }>();
  if (!res.ok) return map;

  const data = await res.json();
  const rows: Array<{
    player_key: string; player_id: string | null; team_key: string | null;
    type: string; source_type: string | null; timestamp: number;
  }> = data.rows || [];

  // Keep only "add" legs (add / trade_add) — newest first within each player+team
  for (const row of rows) {
    if (row.type !== 'add' && row.type !== 'trade_add') continue;
    if (!row.team_key) continue;
    const key = `${row.player_key}|${row.team_key}`;
    const existing = map.get(key);
    if (!existing || row.timestamp > existing.timestamp) {
      map.set(key, { type: row.type, source_type: row.source_type, timestamp: row.timestamp });
    }
    // Also index by numeric player_id for cross-reference
    if (row.player_id) {
      const idKey = `${row.player_id}|${row.team_key}`;
      const existingId = map.get(idKey);
      if (!existingId || row.timestamp > existingId.timestamp) {
        map.set(idKey, { type: row.type, source_type: row.source_type, timestamp: row.timestamp });
      }
    }
  }

  return map;
};

// ─── Current Roster helpers ────────────────────────────────────────────────

// Parse a Yahoo player array (from roster context) into a structured object.
// player[0] = array of field objects; player[1] = { selected_position, ... }
const parseRosterPlayer = (playerArray: any[]): RosterPlayer | null => {
  const infoArr: any[] = Array.isArray(playerArray[0]) ? playerArray[0] : [];
  const info: any = {};
  for (const item of infoArr) {
    if (item && typeof item === 'object') Object.assign(info, item);
  }
  if (!info.player_key) return null;

  // player[1] holds per-roster metadata: selected_position, acquisition_type, etc.
  const meta: any = playerArray[1] || {};
  // Log first player's meta once to confirm Yahoo's actual field structure
  if (info.player_key && (meta.acquisition_type || info.acquisition_type)) {
    // field found — no-op
  } else if (info.player_key) {
    console.log(`[roster debug] player_key=${info.player_key} player[1] keys:`, Object.keys(meta));
  }
  // Yahoo puts acquisition_type in player[1]; it may also appear in the player[0] field array
  const acqObj = meta.acquisition_type ?? info.acquisition_type;
  const acqType: string = acqObj?.type || 'unknown';
  let acquisitionDate: string | null = null;
  const rawDate = acqObj?.date;
  if (rawDate && rawDate !== '0' && rawDate !== 0) {
    const epoch = typeof rawDate === 'string' ? parseInt(rawDate, 10) : rawDate;
    if (!isNaN(epoch) && epoch > 0) {
      acquisitionDate = new Date(epoch * 1000).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    }
  }

  // Selected position lives at player[1].selected_position[1].position
  const selPosArr: any[] = meta.selected_position || [];
  const selectedPos: string = selPosArr[1]?.position || '';
  const isOnIR = selectedPos === 'IR';

  // Extract player ID (numeric part of player_key "423.p.30977" → "30977")
  const playerKeyMatch = (info.player_key as string).match(/\.p\.(\d+)$/);
  const playerId = playerKeyMatch ? playerKeyMatch[1] : info.player_key;

  return {
    playerKey: info.player_key,
    playerName: info.name?.full || '',
    position: info.display_position || info.position_type || '',
    nflTeam: info.editorial_team_abbr || '',
    acquisitionType: acqType,
    acquisitionDate,
    isOnIR,
    // Extra field used only for caching; stripped from RosterPlayer type
    _playerId: playerId,
  } as any;
};

// Fetch trade deadline from league settings
export const fetchTradeDeadline = async (leagueKey: string): Promise<{ display: string; raw: string } | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/yahoo/league/${leagueKey}/settings`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const league = data?.fantasy_content?.league;
    if (!Array.isArray(league)) return null;
    const tradeEndDate: string | undefined = league[1]?.settings?.[0]?.trade_end_date;
    if (!tradeEndDate) return null;
    // "2025-11-03" → "November 3, 2025"
    const d = new Date(tradeEndDate + 'T12:00:00');
    const result = {
      display: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      raw: tradeEndDate, // YYYY-MM-DD
    };
    // Persist so the server can use it for eligibility computation
    fetch(`${BACKEND_URL}/cache/trade-deadline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueKey, raw: tradeEndDate }),
    }).catch(() => {});
    return result;
  } catch {
    return null;
  }
};

// Resolve acquisition type label from transaction row type + source_type
const resolveAcqType = (type: string, sourceType: string | null): RosterPlayer['acquisitionType'] => {
  if (type === 'trade_add') return 'trade';
  if (sourceType === 'waivers') return 'waivers';
  if (sourceType === 'freeagents') return 'freeagent';
  if (type === 'add') return 'freeagent'; // fallback for unlabelled adds
  return type as any;
};

// Fetch all teams' current rosters.
// Step 1: fetch & cache ALL transactions for the season from Yahoo.
// Step 2: fetch each team's current roster from Yahoo.
// Step 3: for every player, look up their most recent "add" transaction to
//         determine the true acquisition date and method, overriding the
//         often-stale value Yahoo returns on the roster endpoint.
// Step 4: persist enriched roster snapshot to DB.
export const fetchCurrentRosters = async (leagueKey: string, season?: string): Promise<TeamRoster[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  // Short-circuit: if we already have a cached roster in the DB, return it.
  // No need to re-fetch transactions or rosters from Yahoo every load.
  const { rosters: cached } = await getCachedCurrentRosters(leagueKey, season);
  const cachedPlayerCount = cached.reduce((n, t) => n + t.players.length, 0);
  if (cachedPlayerCount > 0) {
    console.log(`💾 Using cached current rosters (${cachedPlayerCount} players) — skipping Yahoo fetch`);
    return cached;
  }

  // season is the NFL season year (e.g. "2025"), resolved from the league object or DB
  // Falls back to current calendar year only as last resort
  const currentSeason = season || new Date().getFullYear().toString();

  // ── Step 1: transactions ─────────────────────────────────────────────────
  console.log('📋 Fetching transactions…');
  try {
    await fetchAndCacheTransactions(leagueKey, currentSeason);
  } catch (err) {
    console.warn('Transaction fetch failed (continuing without):', err);
  }

  // Build the lookup map once (reads from DB cache)
  const acqMap = await buildAcquisitionMap(leagueKey, currentSeason);
  console.log(`  🗂 Acquisition map: ${acqMap.size} entries`);

  // ── Step 2: teams list ───────────────────────────────────────────────────
  const teamsRes = await fetch(`${BACKEND_URL}/yahoo/league/${leagueKey}/teams`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!teamsRes.ok) throw new Error('Failed to fetch teams');

  const teamsData = await teamsRes.json();
  const leagueArr = teamsData?.fantasy_content?.league;
  if (!Array.isArray(leagueArr)) return [];

  const teamsWrapper = leagueArr[1]?.teams;
  if (!teamsWrapper) return [];

  const teamCount: number = teamsWrapper.count || 0;
  const teamInfos: Array<{ teamKey: string; teamName: string; managerName: string; managerId: string }> = [];

  for (let i = 0; i < teamCount; i++) {
    const tw = teamsWrapper[i];
    if (!tw?.team) continue;
    const team = tw.team;
    const infoArr: any[] = Array.isArray(team[0]) ? team[0] : [];
    const info: any = {};
    for (const item of infoArr) {
      if (item && typeof item === 'object') Object.assign(info, item);
    }
    const mgr = info.managers?.[0]?.manager;
    teamInfos.push({
      teamKey: info.team_key || '',
      teamName: info.name || 'Unknown Team',
      managerName: mgr?.nickname || info.name || 'Unknown',
      managerId: mgr?.guid || mgr?.manager_id || info.team_key || '',
    });
  }

  // ── Step 3: rosters ──────────────────────────────────────────────────────
  const results: TeamRoster[] = [];
  const dbEntries: any[] = [];
  const posOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'W/R/T', 'W/T', 'K', 'DEF', 'D/ST', 'BN', 'IR'];

  for (const ti of teamInfos) {
    try {
      const rRes = await fetch(`${BACKEND_URL}/yahoo/team/${ti.teamKey}/roster`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!rRes.ok) { results.push({ ...ti, players: [] }); continue; }

      const rData = await rRes.json();
      const teamArr = rData?.fantasy_content?.team;
      const rosterWrapper = Array.isArray(teamArr) ? teamArr[1]?.roster : null;
      const playersWrapper = rosterWrapper?.[0]?.players;
      if (!playersWrapper) { results.push({ ...ti, players: [] }); continue; }

      const playerCount: number = playersWrapper.count || 0;
      const players: RosterPlayer[] = [];

      for (let i = 0; i < playerCount; i++) {
        const pw = playersWrapper[i];
        if (!pw?.player) continue;
        const parsed = parseRosterPlayer(pw.player) as any;
        if (!parsed) continue;

        // ── Step 3a: enrich with transaction data ──────────────────────────
        // Try full player_key first, then numeric id — both keyed by team
        const txByKey = acqMap.get(`${parsed.playerKey}|${ti.teamKey}`);
        const txById  = acqMap.get(`${parsed._playerId}|${ti.teamKey}`);
        const tx = txByKey || txById;

        if (tx) {
          parsed.acquisitionType = resolveAcqType(tx.type, tx.source_type);
          parsed.acquisitionDate = new Date(tx.timestamp * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
        }
        // Drafted players often have tx.timestamp = 0 or no tx at all —
        // keep the roster-endpoint value in that case (already set to 'draft' by Yahoo).

        players.push(parsed as RosterPlayer);
        dbEntries.push({
          teamKey: ti.teamKey,
          playerId: parsed._playerId,
          playerName: parsed.playerName,
          position: parsed.position,
          nflTeam: parsed.nflTeam,
          acquisitionType: parsed.acquisitionType !== 'unknown' ? parsed.acquisitionType : null,
          acquisitionDate: parsed.acquisitionDate,
          isOnIR: parsed.isOnIR,
        });
      }

      players.sort((a, b) => {
        if (a.isOnIR !== b.isOnIR) return a.isOnIR ? 1 : -1;
        const ai = posOrder.indexOf(a.position);
        const bi = posOrder.indexOf(b.position);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      results.push({ ...ti, players });
    } catch (err) {
      console.warn(`Roster fetch failed for ${ti.teamKey}:`, err);
      results.push({ ...ti, players: [] });
    }
  }

  // ── Step 4: persist enriched snapshot ────────────────────────────────────
  if (dbEntries.length > 0) {
    fetch(`${BACKEND_URL}/cache/current-rosters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueKey, season: currentSeason, teams: teamInfos, entries: dbEntries }),
    }).catch(err => console.warn('Failed to persist current rosters:', err));
  }

  return results.sort((a, b) => a.managerName.localeCompare(b.managerName));
};

// Get the GUID of the currently authenticated Yahoo user
export const getCurrentUserGuid = async (): Promise<string | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/yahoo/users;use_login=1`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.fantasy_content?.users?.[0]?.user;
    if (!Array.isArray(user)) return null;
    return user[0]?.guid || null;
  } catch {
    return null;
  }
};

// Load cached current rosters from DB (no Yahoo call needed)
export const getCachedCurrentRosters = async (leagueKey: string, season?: string): Promise<{
  rosters: TeamRoster[];
  cacheAge: string | null;
}> => {
  // If caller doesn't know the season, omit it and let the server resolve it from the DB
  const url = season
    ? `${BACKEND_URL}/cache/current-rosters/${leagueKey}?season=${season}`
    : `${BACKEND_URL}/cache/current-rosters/${leagueKey}`;
  const res = await fetch(url);
  if (!res.ok) return { rosters: [], cacheAge: null };
  const data = await res.json();
  return { rosters: data.rosters || [], cacheAge: data.cacheAge || null };
};

// Clear the DB roster cache for a league then re-fetch from Yahoo (forces ineligibility recompute)
export const refreshCurrentRosters = async (leagueKey: string, season?: string): Promise<TeamRoster[]> => {
  const url = season
    ? `${BACKEND_URL}/cache/current-rosters/${leagueKey}?season=${season}`
    : `${BACKEND_URL}/cache/current-rosters/${leagueKey}`;
  await fetch(url, { method: 'DELETE' });
  return fetchCurrentRosters(leagueKey, season);
};

export const fetchDynastyRankings = async (): Promise<Map<string, { overallRank: number; positionRank: number; value: number }>> => {
  try {
    const res = await fetch(`${BACKEND_URL}/fantasycalc/rankings`);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, { overallRank: number; positionRank: number; value: number }>();
    for (const p of data.players ?? []) {
      map.set((p.player_name as string).toLowerCase(), {
        overallRank: p.overall_rank,
        positionRank: p.position_rank,
        value: p.value,
      });
    }
    return map;
  } catch {
    return new Map();
  }
};