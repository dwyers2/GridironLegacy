
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

export interface DraftPick {
  round: number;
  pick: number;
  teamKey: string;
  managerName: string;
  playerName: string;
  position: string;
  nflTeam: string;
  /** Set when this pick slot was acquired via trade; holds the original owner's name */
  originalManagerName?: string;
  /** User-designated keeper from a prior season */
  isKeeper?: boolean;
}

export interface SeasonDraftData {
  season: string;
  leagueKey: string;
  picks: DraftPick[];
  // Ordered by draft slot (round-1 pick order)
  teams: Array<{ teamKey: string; managerName: string; draftSlot: number }>;
}

export interface KeeperEntry {
  playerKey: string;
  playerName: string;
  position: string;
  nflTeam: string;
  roundDrafted: number;
  keeperCost: number;
  consecutiveYears: number;
  isManual?: boolean;
}

export interface ManagerKeepers {
  teamKey: string;
  managerName: string;
  keepers: KeeperEntry[];
}

export interface KeeperSummary {
  upcomingYear: string | null;
  managers: ManagerKeepers[];
  leagueKey?: string;
  /** Players kept INTO the current season (from prior-year designations) */
  keptIntoCurrentSeason?: Array<{ playerName: string; timesKept: number }>;
}

export interface RosterPlayer {
  playerKey: string;
  playerName: string;
  position: string;
  nflTeam: string;
  acquisitionType: 'draft' | 'freeagent' | 'waivers' | 'trade' | string;
  acquisitionDate: string | null;
  isOnIR: boolean;
  isKeeperIneligible?: boolean;
}

export interface TeamRoster {
  teamKey: string;
  teamName: string;
  managerName: string;
  managerId?: string;
  players: RosterPlayer[];
}

export enum AppState {
  LOGIN = 'LOGIN',
  LEAGUE_SELECT = 'LEAGUE_SELECT',
  DASHBOARD = 'DASHBOARD',
  MANAGER_INSIGHTS = 'MANAGER_INSIGHTS'
}
