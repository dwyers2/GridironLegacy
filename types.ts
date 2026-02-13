
export interface League {
  id: string;
  name: string;
  seasons: string[];
  sport: string;
}

export interface PlayerStats {
  id: string;
  name: string;
  position: string;
  team: string;
  ownedByMeCount: number;
  ownedByOthersCount: number;
  avgPointsStarted: number;
  avgPointsBenched: number;
  totalOwnershipYears: number;
  lastOwnedSeason: string;
}

export interface ManagerHistory {
  managerId: string;
  managerName: string;
  yearsInLeague: number;
  championships: number;
}

export interface PlayerOwnership {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  timesOwned: number;
  seasons: string[];
}

export interface ManagerOwnershipData {
  managerId: string;
  managerName: string;
  players: PlayerOwnership[];
  seasonsTracked?: string[];  // which seasons this manager was found in
}

export interface TeamInfo {
  teamKey: string;
  name: string;
  managerId: string;
  managerName: string;
  season?: string;
}

export interface SeasonRosterData {
  season: string;
  gameId: string;
  leagueKey: string;
  teams: TeamInfo[];
  rosters: { [teamKey: string]: any[] };
}

export interface FetchProgress {
  season: string;
  current: number;
  total: number;
}

export interface ManagerTendency {
  managerId: string;
  managerName: string;
  analysis: string;
  topPositions: string[];
  loyaltyScore: number;
}

export enum AppState {
  LOGIN = 'LOGIN',
  LEAGUE_SELECT = 'LEAGUE_SELECT',
  DASHBOARD = 'DASHBOARD',
  MANAGER_INSIGHTS = 'MANAGER_INSIGHTS'
}
