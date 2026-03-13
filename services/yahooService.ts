import { League, PlayerStats, ManagerHistory, SeasonRosterData, TeamInfo, ManagerOwnershipData, PlayerOwnership, FetchProgress, DraftPick, SeasonDraftData } from '../types';

const BACKEND_URL = 'http://localhost:3001/api';

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
const getAccessToken = async (): Promise<string> => {
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
  const apiPath = 'users;use_login=1/games;game_keys=nfl/leagues';
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
          sport: 'nfl'
        };

        console.log('✅ Parsed league:', leagueInfo);
        allLeagues.push(leagueInfo);
      }
    }
  }

  console.log('📊 Total leagues found:', allLeagues.length);
  console.log('📊 All leagues:', allLeagues);

  return allLeagues;
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

  // 💾 STEP 2: Check cache for which seasons we already have
  console.log(`💾 Checking cache...`);
  let cachedSeasons: string[] = [];
  let cachedManagers: ManagerOwnershipData[] = [];

  try {
    const cacheRes = await fetch(`${BACKEND_URL}/cache/aggregated`);
    if (cacheRes.ok) {
      const cacheData = await cacheRes.json();
      cachedSeasons = cacheData.cachedSeasons || [];
      cachedManagers = cacheData.managers || [];
      console.log(`💾 Cached seasons: ${cachedSeasons.join(', ') || 'none'}`);
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

  // After fetching new data, reload the complete aggregated cache
  let finalAggregatedData: ManagerOwnershipData[] = [];

  try {
    const finalCacheRes = await fetch(`${BACKEND_URL}/cache/aggregated`);
    if (finalCacheRes.ok) {
      const finalCache = await finalCacheRes.json();
      finalAggregatedData = finalCache.managers || [];
      console.log(`📊 Final aggregated data: ${finalAggregatedData.length} managers across all seasons`);
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
  season: string
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
  const rawPicks: Array<{ round: number; pick: number; teamKey: string; playerKey: string }> = [];

  for (let i = 0; i < count; i++) {
    const dr = draftResultsWrapper[i]?.draft_result;
    if (!dr) continue;
    rawPicks.push({
      round: parseInt(dr.round),
      pick: parseInt(dr.pick),
      teamKey: dr.team_key,
      playerKey: dr.player_key || '',
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

  const picks: DraftPick[] = rawPicks.map((rp) => {
    const info = playerInfoMap.get(rp.playerKey);
    const originalTeamKey = originalOwnerMap.get(rp.pick);
    const wasTraded = originalTeamKey !== undefined && originalTeamKey !== rp.teamKey;
    return {
      round: rp.round,
      pick: rp.pick,
      teamKey: rp.teamKey,
      managerName: teamMap.get(rp.teamKey) || rp.teamKey,
      playerName: info?.playerName || '',
      position: info?.position || '',
      nflTeam: info?.nflTeam || '',
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
        })),
        trades,
      }),
    });
  } catch (_) {}

  const teams = teamsFromPicks(picks);
  return { season, leagueKey, picks, teams };
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
              originalManagerName: p.original_manager_name || undefined,
            }));
            return {
              season: s.season,
              leagueKey: s.leagueKey,
              picks,
              teams: teamsFromPicks(picks),
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
            originalManagerName: p.original_manager_name || undefined,
          }));
          results.push({
            season,
            leagueKey,
            picks: cachedPicks,
            teams: teamsFromPicks(cachedPicks),
          });
          continue;
        }
      }
    } catch (_) {}

    onProgress?.(i + 1, leagueChain.length, season);

    try {
      console.log(`  🌐 Fetching draft results for ${season} (${leagueKey})...`);
      const seasonDraft = await fetchLeagueDraftResults(leagueKey, season);
      if (seasonDraft.picks.length > 0) {
        results.push(seasonDraft);
        console.log(`  ✅ ${seasonDraft.picks.length} picks for ${season}`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Failed to fetch draft results for ${season}:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Store the chain so future loads skip Yahoo API entirely
  if (leagueChain.length > 0) {
    try {
      await fetch(`${BACKEND_URL}/cache/draft/chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootKey: currentLeagueKey, chain: leagueChain }),
      });
    } catch (_) {}
  }

  // Sort by season descending (most recent first)
  results.sort((a, b) => Number(b.season) - Number(a.season));
  return results;
};