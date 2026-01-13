
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

export enum AppState {
  LOGIN = 'LOGIN',
  LEAGUE_SELECT = 'LEAGUE_SELECT',
  DASHBOARD = 'DASHBOARD'
}
