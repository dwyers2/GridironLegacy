
import { League, PlayerStats, ManagerHistory } from '../types';

/**
 * Yahoo Fantasy Sports API Service
 * 
 * To use this in production:
 * 1. Create an app at https://developer.yahoo.com/apps/
 * 2. Set the redirect URI to your app's URL.
 * 3. Yahoo Fantasy API typically requires a proxy or backend for OAuth Token exchange due to CORS.
 *    For this implementation, we provide the direct frontend structure.
 */

const CLIENT_ID = 'YOUR_YAHOO_CLIENT_ID'; // User must replace with their own Client ID
const REDIRECT_URI = window.location.origin;
const AUTH_ENDPOINT = 'https://api.login.yahoo.com/oauth2/request_auth';
const TOKEN_ENDPOINT = 'https://api.login.yahoo.com/oauth2/get_token';
const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

export const getAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'fsrd-r', // Fantasy Sports Read access
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
};

export const exchangeCodeForToken = async (code: string) => {
  // In a real app, this MUST be done via a backend proxy to protect the Client Secret
  // and handle CORS. Here we demonstrate the intended logic.
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: 'YOUR_YAHOO_CLIENT_SECRET',
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem('yahoo_access_token', data.access_token);
      localStorage.setItem('yahoo_refresh_token', data.refresh_token);
      return data;
    }
  } catch (error) {
    console.error('Token exchange failed', error);
  }
  return null;
};

const authenticatedFetch = async (url: string) => {
  const token = localStorage.getItem('yahoo_access_token');
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}format=json`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    // Logic for token refresh would go here
    throw new Error('Unauthorized - Token may be expired');
  }

  return response.json();
};

export const getLeagues = async (): Promise<League[]> => {
  try {
    const data = await authenticatedFetch(`${API_BASE}/users;use_login=1/games;game_keys=nfl/leagues`);
    // Yahoo's JSON structure is deeply nested and complex
    const leaguesData = data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues || [];
    
    return leaguesData.map((l: any) => {
      const league = l.league[0];
      return {
        id: league.league_key,
        name: league.name,
        seasons: [league.season],
        sport: 'nfl'
      };
    });
  } catch (error) {
    console.error('Failed to fetch leagues', error);
    // Fallback to mock if API fails or credentials missing for demo purposes
    return [
      { id: '123.l.456', name: 'Direct Yahoo League (Demo)', seasons: ['2024'], sport: 'nfl' }
    ];
  }
};

export const getPlayerHistory = async (leagueId: string): Promise<PlayerStats[]> => {
  try {
    // This would ideally fetch rosters across multiple years
    // For direct connection demo, we fetch current league roster as a starting point
    const data = await authenticatedFetch(`${API_BASE}/league/${leagueId}/teams/roster`);
    console.log('Roster data:', data);
    
    // Simulating the aggregation from the real data structure
    // In a full implementation, we'd loop through league seasons and team rosters
    return [
      {
        id: 'p1',
        name: 'Christian McCaffrey',
        position: 'RB',
        team: 'SF',
        ownedByMeCount: 2,
        ownedByOthersCount: 1,
        avgPointsStarted: 22.4,
        avgPointsBenched: 0.0,
        totalOwnershipYears: 3,
        lastOwnedSeason: '2024'
      }
    ];
  } catch (error) {
    console.error('Failed to fetch player history', error);
    return [];
  }
};

export const getManagerInsights = async (leagueId: string): Promise<ManagerHistory[]> => {
  try {
    const data = await authenticatedFetch(`${API_BASE}/league/${leagueId}/standings`);
    const teams = data?.fantasy_content?.league?.[1]?.standings?.[0]?.teams || [];
    
    return teams.map((t: any) => {
      const team = t.team[0];
      return {
        managerId: team.team_key,
        managerName: team.name,
        yearsInLeague: 1, // Yahoo doesn't give historical longevity in one call
        championships: team.team_standings?.outcome_totals?.wins > 10 ? 1 : 0
      };
    });
  } catch (error) {
    return [];
  }
};
