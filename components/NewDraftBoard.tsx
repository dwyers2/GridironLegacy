import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Star, Trash2, Users } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { DraftablePlayerOption, searchDraftablePlayers } from '../services/yahooService';
import { DraftPick, ManagerKeepers, RosterPosition } from '../types';
import DraftByPositionView from './DraftByPositionView';

interface DraftBoardTeam {
  teamKey: string;
  managerName: string;
  draftSlot: number;
}

interface Props {
  leagueId: string;
  leagueName: string;
  teams: DraftBoardTeam[];
  rounds: number;
  seasonLabel?: string | null;
  keeperManagers?: ManagerKeepers[];
  /** Picks from the most recent season (current if drafted, prior year otherwise).
   *  Used to derive which pick slots were acquired via trade. */
  seasonPicks?: DraftPick[];
  rosterPositions?: RosterPosition[];
}

interface FutureDraftPickTrade {
  draftSeason: string;
  round: number;
  fromTeamKey: string;
  toTeamKey: string;
}

interface BoardCellValue {
  playerName: string;
  playerKey?: string;
  position?: string;
  nflTeam?: string;
  isKeeperPick?: boolean;
  keeperCost?: number;
  keeperStars?: number;
}

type BoardState = Record<string, BoardCellValue>;

// dark = pick number + position badge  |  light = player name
const POS_COLORS: Record<string, { dark: string; light: string; bg: string; border: string }> = {
  QB:    { dark: '#F87171', light: 'rgba(248,113,113,0.65)', bg: 'rgba(239,68,68,0.09)',   border: 'rgba(239,68,68,0.28)' },
  RB:    { dark: '#4ADE80', light: 'rgba(74,222,128,0.65)',  bg: 'rgba(34,197,94,0.09)',   border: 'rgba(34,197,94,0.28)' },
  WR:    { dark: '#60A5FA', light: 'rgba(96,165,250,0.65)',  bg: 'rgba(59,130,246,0.09)',  border: 'rgba(59,130,246,0.28)' },
  TE:    { dark: '#D4A017', light: 'rgba(212,160,23,0.65)',  bg: 'rgba(212,160,23,0.09)',  border: 'rgba(212,160,23,0.28)' },
  K:     { dark: '#C084FC', light: 'rgba(192,132,252,0.65)', bg: 'rgba(168,85,247,0.09)',  border: 'rgba(168,85,247,0.28)' },
  DEF:   { dark: '#94A3B8', light: 'rgba(148,163,184,0.65)', bg: 'rgba(100,116,139,0.09)', border: 'rgba(100,116,139,0.28)' },
  'D/ST':{ dark: '#94A3B8', light: 'rgba(148,163,184,0.65)', bg: 'rgba(100,116,139,0.09)', border: 'rgba(100,116,139,0.28)' },
};

const cellKey = (round: number, teamKey: string) => `${round}:${teamKey}`;

function normalizeStoredBoard(raw: unknown): BoardState {
  if (!raw || typeof raw !== 'object') return {};
  const next: BoardState = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (value.trim()) next[key] = { playerName: value };
    } else if (value && typeof value === 'object' && typeof (value as any).playerName === 'string') {
      const c = value as any;
      if (c.playerName.trim()) {
        next[key] = {
          playerName: c.playerName,
          playerKey: typeof c.playerKey === 'string' ? c.playerKey : undefined,
          position: typeof c.position === 'string' ? c.position : undefined,
          nflTeam: typeof c.nflTeam === 'string' ? c.nflTeam : undefined,
        };
      }
    }
  }
  return next;
}

export default function NewDraftBoard({
  leagueId, leagueName, teams, rounds, seasonLabel, keeperManagers = [], seasonPicks = [], rosterPositions,
}: Props) {
  const isMobile = useIsMobile(900);
  const storageKey = `new-draft-board:${leagueId}`;

  const [board, setBoard] = useState<BoardState>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DraftablePlayerOption[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<'round' | 'position'>('round');
  const [futureTrades, setFutureTrades] = useState<FutureDraftPickTrade[]>([]);
  const [sharedBoardLoaded, setSharedBoardLoaded] = useState(false);
  const lastSharedUpdateRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const cellEditedRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setBoard(raw ? normalizeStoredBoard(JSON.parse(raw)) : {});
    } catch { setBoard({}); }
    finally { setIsHydrated(true); }
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/new-draft-board/${encodeURIComponent(leagueId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        if (data.updatedAt && data.board && typeof data.board === 'object' && !Array.isArray(data.board)) {
          setBoard(normalizeStoredBoard(data.board));
        }
        lastSharedUpdateRef.current = data.updatedAt || null;
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSharedBoardLoaded(true); });
    return () => { cancelled = true; };
  }, [leagueId]);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(storageKey, JSON.stringify(board));
    if (!sharedBoardLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveInFlightRef.current = true;
      fetch(`/api/new-draft-board/${encodeURIComponent(leagueId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board }),
      }).then(res => res.ok ? res.json() : null)
        .then(data => { if (data?.updatedAt) lastSharedUpdateRef.current = data.updatedAt; })
        .catch(() => {})
        .finally(() => { saveInFlightRef.current = false; });
    }, 250);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [board, isHydrated, leagueId, sharedBoardLoaded, storageKey]);

  useEffect(() => {
    if (!sharedBoardLoaded) return;
    const poll = window.setInterval(() => {
      if (saveTimerRef.current || saveInFlightRef.current) return;
      fetch(`/api/new-draft-board/${encodeURIComponent(leagueId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data?.updatedAt || data.updatedAt === lastSharedUpdateRef.current) return;
          lastSharedUpdateRef.current = data.updatedAt;
          if (data.board && typeof data.board === 'object' && !Array.isArray(data.board)) {
            setBoard(normalizeStoredBoard(data.board));
          }
        }).catch(() => {});
    }, 3000);
    return () => window.clearInterval(poll);
  }, [leagueId, sharedBoardLoaded]);

  useEffect(() => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    const spacer = top?.firstElementChild as HTMLElement | null;
    if (!top || !table || !spacer) return;
    const syncTop = () => { table.scrollLeft = top.scrollLeft; };
    const syncTable = () => { top.scrollLeft = table.scrollLeft; };
    const updateWidth = () => { spacer.style.width = `${table.scrollWidth}px`; };
    top.addEventListener('scroll', syncTop);
    table.addEventListener('scroll', syncTable);
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    updateWidth();
    return () => {
      top.removeEventListener('scroll', syncTop);
      table.removeEventListener('scroll', syncTable);
      observer.disconnect();
    };
  }, [teams.length]);

  useEffect(() => {
    fetch(`/api/cache/future-draft-trades/${encodeURIComponent(leagueId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setFutureTrades(Array.isArray(data?.trades) ? data.trades : []))
      .catch(() => setFutureTrades([]));
  }, [leagueId]);

  const keeperPrefills = useMemo(() => {
    const next: BoardState = {};
    const validTeamKeys = new Set(teams.map(t => t.teamKey));
    const ownerForSlot = (round: number, defaultTeamKey: string): string | null => {
      // The trade's fromTeamKey identifies the original slot column; its
      // toTeamKey is the manager who owns that slot now.
      const trade = futureTrades.find(t => t.round === round && t.fromTeamKey === defaultTeamKey);
      return trade ? trade.toTeamKey : defaultTeamKey;
    };
    for (const manager of keeperManagers) {
      if (!validTeamKeys.has(manager.teamKey)) continue;
      for (const keeper of manager.keepers) {
        if (!keeper.keeperCost || keeper.keeperCost < 1 || keeper.keeperCost > rounds) continue;
        // A keeper consumes the team's owned slot at its cost round. If that
        // slot was traded away, use the next earlier slot the team owns.
        let assignedRound: number | null = null;
        let assignedSlotTeamKey: string | null = null;
        for (let round = keeper.keeperCost; round >= 1; round--) {
          // Use the latest pick in the snake-draft order when a manager owns
          // multiple slots in the keeper's cost round. Odd rounds run from
          // low to high slots; even rounds run from high to low slots.
          const ownedSlots = teams.filter(t => ownerForSlot(round, t.teamKey) === manager.teamKey);
          const slotTeamKey = ownedSlots
            .sort((a, b) => round % 2 === 1 ? b.draftSlot - a.draftSlot : a.draftSlot - b.draftSlot)[0]?.teamKey;
          if (slotTeamKey) {
            assignedRound = round;
            assignedSlotTeamKey = slotTeamKey;
            break;
          }
        }
        if (assignedRound == null || assignedSlotTeamKey == null) continue;
        next[cellKey(assignedRound, assignedSlotTeamKey)] = {
          playerName: keeper.playerName,
          playerKey: keeper.playerKey,
          position: keeper.position,
          nflTeam: keeper.nflTeam,
          isKeeperPick: true,
          keeperCost: assignedRound,
          keeperStars: Math.min(2, Math.max(1, keeper.consecutiveYears || 1)),
        };
      }
    }
    return next;
  }, [futureTrades, keeperManagers, rounds, teams]);

  const tradedPicks = useMemo(() => {
    const result: Record<string, string> = {};
    for (const pick of seasonPicks) {
      if (!pick.originalManagerName || pick.originalManagerName === pick.managerName) continue;
      const originalTeam = teams.find(t => t.managerName === pick.originalManagerName);
      if (originalTeam) result[cellKey(pick.round, originalTeam.teamKey)] = pick.managerName;
    }
    for (const trade of futureTrades) {
      const destination = teams.find(team => team.teamKey === trade.toTeamKey);
      if (destination) result[cellKey(trade.round, trade.fromTeamKey)] = destination.managerName;
    }
    return result;
  }, [futureTrades, seasonPicks, teams]);

  const displayedBoard = useMemo(() => {
    const next = { ...board };
    for (const [keeperKey, keeper] of Object.entries(keeperPrefills)) {
      const keeperName = keeper.playerName.trim().toLowerCase();
      for (const [key, value] of Object.entries(next)) {
        const isSameKeeper = value.playerKey && keeper.playerKey
          ? value.playerKey === keeper.playerKey
          : value.playerName.trim().toLowerCase() === keeperName;
        if (key !== keeperKey && isSameKeeper) delete next[key];
      }
      next[keeperKey] = keeper;
    }
    return next;
  }, [board, keeperPrefills]);
  const duplicatePlayerNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const value of Object.values(displayedBoard)) {
      const normalized = value.playerName.trim().toLowerCase();
      if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [displayedBoard]);
  const activeValue = activeCell ? (displayedBoard[activeCell]?.playerName ?? '') : '';

  const positionPicks = useMemo(() =>
    Object.entries(displayedBoard)
      .filter(([, v]) => v.playerName.trim())
      .map(([key, v]) => {
        const [roundStr, teamKey] = key.split(':');
        return { teamKey, playerName: v.playerName, position: v.position ?? '', round: parseInt(roundStr), isKeeper: v.isKeeperPick };
      }),
    [displayedBoard],
  );

  useEffect(() => {
    if (!activeCell || !cellEditedRef.current || activeValue.trim().length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    let cancelled = false;
    setLoadingSuggestions(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchDraftablePlayers(leagueId, activeValue, 10);
        if (!cancelled) setSuggestions(results);
      } catch { if (!cancelled) setSuggestions([]); }
      finally { if (!cancelled) setLoadingSuggestions(false); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeCell, activeValue, leagueId]);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [suggestions]);

  const totalFilled = useMemo(
    () => (Object.values(displayedBoard) as BoardCellValue[]).filter(v => v.playerName.trim().length > 0).length,
    [displayedBoard],
  );

  const numTeams = teams.length;

  // Overall pick number follows a snake: odd rounds run left-to-right, even rounds right-to-left.
  const getPickNum = (round: number, teamIndex: number, isSnakeOrdered: boolean) =>
    (round - 1) * numTeams + (isSnakeOrdered || round % 2 === 1 ? teamIndex : numTeams - teamIndex - 1) + 1;

  const updateCell = (round: number, teamKey: string, value: string) => {
    setBoard(prev => {
      const next = { ...prev };
      const key = cellKey(round, teamKey);
      const existing = displayedBoard[key];
      if (!value.trim()) {
        delete next[key];
      } else {
        next[key] = {
          playerName: value,
          playerKey: existing?.playerName === value ? existing.playerKey : undefined,
          position: existing?.playerName === value ? existing.position : undefined,
          nflTeam: existing?.playerName === value ? existing.nflTeam : undefined,
        };
      }
      return next;
    });
  };

  const selectSuggestion = (round: number, teamKey: string, player: DraftablePlayerOption) => {
    setBoard(prev => ({
      ...prev,
      [cellKey(round, teamKey)]: {
        playerName: player.playerName,
        playerKey: player.playerKey,
        position: player.position,
        nflTeam: player.nflTeam,
      },
    }));
    setActiveCell(null);
    setSuggestions([]);
  };

  const moveToNextCell = (round: number, teamIndex: number) => {
    if (teamIndex + 1 < teams.length) {
      setActiveCell(cellKey(round, teams[teamIndex + 1].teamKey));
    } else if (round < rounds) {
      setActiveCell(cellKey(round + 1, teams[0].teamKey));
    } else {
      setActiveCell(null);
    }
    cellEditedRef.current = false;
    setSuggestions([]);
  };

  const clearRound = (round: number) => {
    setBoard(prev => {
      const next = { ...prev };
      for (const team of teams) {
        const key = cellKey(round, team.teamKey);
        if (!keeperPrefills[key]) delete next[key];
      }
      return next;
    });
    if (activeCell?.startsWith(`${round}:`)) { setActiveCell(null); setSuggestions([]); }
  };

  const clearBoard = () => {
    setBoard({});
    setActiveCell(null);
    setSuggestions([]);
  };

  // ── Pick cell ──────────────────────────────────────────────────────────────
  const renderCell = (round: number, team: DraftBoardTeam, teamIndex: number, isSnakeOrdered = false) => {
    const key = cellKey(round, team.teamKey);
    const value = displayedBoard[key];
    const isActive = activeCell === key;
    const pos = value?.position;
    const colors = pos ? POS_COLORS[pos] : null;
    const isFilled = !!value?.playerName;
    const isKeeper = !!value?.isKeeperPick;
    const isDuplicate = isFilled && duplicatePlayerNames.has(value.playerName.trim().toLowerCase());
    const tradedTo = tradedPicks[key] ?? null;
    const pickNum = getPickNum(round, teamIndex, isSnakeOrdered);
    const showDropdown = isActive &&
      (loadingSuggestions || suggestions.length > 0 || activeValue.trim().length >= 2 || (isFilled && !isKeeper));

    // Border and background vary by state, with traded cells getting amber treatment
    const cellBg = tradedTo && !isFilled ? 'rgba(251,146,60,0.05)'
                 : isFilled && colors ? colors.bg
                 : isActive ? 'rgba(212,160,23,0.05)' : 'transparent';
    const cellBorderColor = tradedTo ? (isFilled ? 'rgba(251,146,60,0.3)' : 'rgba(251,146,60,0.45)')
                          : isFilled && colors ? colors.border
                          : isActive ? 'rgba(212,160,23,0.35)' : 'rgba(255,255,255,0.07)';
    const cellBorderStyle = tradedTo && !isFilled ? 'dashed' : 'solid';

    // Truncate traded-to name so it fits the narrow top line
    const tradedToShort = tradedTo
      ? (tradedTo.length > 9 ? tradedTo.slice(0, 8) + '…' : tradedTo)
      : null;
    const tradedTitle = tradedTo ? `Traded pick — acquired by ${tradedTo}` : undefined;

    return (
      <div key={key} style={{ position: 'relative' }}>
        <div
          onClick={() => { cellEditedRef.current = false; setActiveCell(key); }}
          title={tradedTitle}
          style={{
            height: '58px',
            padding: '0.36rem 0.5rem',
            borderRadius: '5px',
            background: cellBg,
            border: `1px ${cellBorderStyle} ${cellBorderColor}`,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.1s, background 0.1s',
          }}
          onMouseEnter={e => {
            if (!isFilled && !isActive && !tradedTo)
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={e => {
            if (!isFilled && !isActive && !tradedTo)
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
          }}
        >
          {/* ── Line 1: pick number · position badge · trade button ───────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'nowrap' }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '0.58rem',
              letterSpacing: '0.06em',
              lineHeight: 1,
              color: isFilled && colors ? colors.dark : tradedTo ? '#FB923C' : 'var(--text-muted)',
              opacity: (isFilled || tradedTo) ? 1 : 0.4,
              flexShrink: 0,
            }}>
              {pickNum}
            </span>

            {pos && colors && (
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '0.52rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '0.07rem 0.28rem',
                borderRadius: '2px',
                lineHeight: 1.3,
                color: colors.dark,
                background: `${colors.dark}1F`,
                flexShrink: 0,
              }}>
                {pos}
              </span>
            )}

            {/* Keeper badge — pushed to right */}
            {isKeeper && !tradedTo && (
              <span aria-label="Keeper" style={{
                marginLeft: 'auto',
                color: 'var(--gold)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '1px',
                flexShrink: 0,
              }}>
                {Array.from({ length: value?.keeperStars ?? 1 }, (_, i) => (
                  <Star key={i} size={10} fill="currentColor" strokeWidth={1.5} />
                ))}
              </span>
            )}

            {isDuplicate && (
              <AlertTriangle
                size={11}
                aria-label="Duplicate player"
                title="Duplicate player on this draft board"
                style={{ color: '#FB923C', flexShrink: 0 }}
              />
            )}

            {/* Traded pick indicator */}
            {tradedTo && (
              <span style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(251,146,60,0.14)',
                border: '1px solid rgba(251,146,60,0.3)',
                borderRadius: '2px',
                padding: '0.06rem 0.28rem',
                color: '#FB923C',
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '0.5rem',
                  letterSpacing: '0.06em',
                  lineHeight: 1,
                }}>
                  →{tradedToShort}
                </span>
              </span>
            )}
          </div>

          {/* ── Line 2: player name or input ─────────────────────────────── */}
          {isActive ? (
            <input
              autoFocus
              value={value?.playerName ?? ''}
              onChange={e => { cellEditedRef.current = true; updateCell(round, team.teamKey, e.target.value); }}
              onFocus={() => setActiveCell(key)}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  moveToNextCell(round, teamIndex);
                } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
                  e.preventDefault();
                  setSelectedSuggestionIndex(index => Math.min(index + 1, suggestions.length - 1));
                } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                  e.preventDefault();
                  setSelectedSuggestionIndex(index => Math.max(index - 1, 0));
                } else if (e.key === 'Enter' && suggestions[selectedSuggestionIndex]) {
                  e.preventDefault();
                  selectSuggestion(round, team.teamKey, suggestions[selectedSuggestionIndex]);
                } else if (e.key === 'Escape') {
                  setActiveCell(null);
                  setSuggestions([]);
                }
              }}
              onBlur={() => window.setTimeout(() => {
                setActiveCell(current => {
                  if (current === key) {
                    setSuggestions([]);
                    return null;
                  }
                  return current;
                });
              }, 150)}
              placeholder="type a name…"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                padding: 0,
                margin: 0,
                fontFamily: "'Outfit', sans-serif",
                fontSize: '0.74rem',
                fontWeight: 500,
                color: colors ? colors.light : 'var(--text-secondary)',
                caretColor: colors ? colors.dark : 'var(--gold)',
              }}
            />
          ) : (
            <div style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '0.74rem',
              fontWeight: isFilled ? 500 : 400,
              color: isFilled && colors ? colors.light
                   : tradedTo && !isFilled ? 'rgba(251,146,60,0.55)'
                   : 'var(--text-muted)',
              opacity: isFilled ? 1 : tradedTo ? 0.9 : 0.28,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
              userSelect: 'none',
            }}>
              {value?.playerName ?? (tradedTo ? `→ ${tradedTo}` : '—')}
            </div>
          )}
        </div>

        {/* ── Suggestion dropdown ──────────────────────────────────────────── */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 3px)',
            zIndex: 40,
            minWidth: '210px',
            borderRadius: '8px',
            border: '1px solid rgba(212,160,23,0.22)',
            background: '#0D1119',
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}>
            {loadingSuggestions ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.7rem 0.85rem',
                color: 'var(--text-muted)',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '0.74rem',
              }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)', flexShrink: 0 }} />
                Searching…
              </div>
            ) : suggestions.length === 0 && activeValue.trim().length >= 2 && cellEditedRef.current ? (
              <div style={{
                padding: '0.7rem 0.85rem',
                color: 'var(--text-muted)',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '0.74rem',
              }}>
                No results for "{activeValue}"
              </div>
            ) : suggestions.map((player, i) => {
              const pc = POS_COLORS[player.position || ''];
              return (
                <button
                  key={player.playerKey + i}
                  onMouseDown={e => { e.preventDefault(); selectSuggestion(round, team.teamKey, player); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.52rem 0.85rem',
                    textAlign: 'left',
                    border: 'none',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: i === selectedSuggestionIndex ? 'rgba(212,160,23,0.07)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '0.54rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '0.1rem 0.32rem',
                    borderRadius: '3px',
                    flexShrink: 0,
                    color: pc?.dark ?? 'var(--text-muted)',
                    background: pc ? `${pc.dark}1F` : 'rgba(255,255,255,0.07)',
                  }}>
                    {player.position || '—'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {player.playerName}
                    </div>
                    {player.nflTeam && (
                      <div style={{
                        fontFamily: 'monospace',
                        fontSize: '0.6rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.06rem',
                      }}>
                        {player.nflTeam}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {isFilled && !isKeeper && (
              <button
                onMouseDown={e => {
                  e.preventDefault();
                  updateCell(round, team.teamKey, '');
                  setActiveCell(null);
                  setSuggestions([]);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.52rem 0.85rem',
                  textAlign: 'left',
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#F87171',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '0.74rem',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={12} style={{ flexShrink: 0 }} />
                Clear pick
              </button>
            )}
          </div>
        )}

      </div>
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (teams.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0.75rem', padding: '5rem 2rem', textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '10px',
      }}>
        <Users size={36} style={{ color: 'var(--text-muted)', opacity: 0.22 }} />
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif", fontSize: '0.85rem' }}>
          Draft order not available yet.
        </p>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif", fontSize: '0.75rem', maxWidth: '320px' }}>
          Load draft history first so we can build the board from your league's latest manager slots.
        </p>
      </div>
    );
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const toolbar = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem',
    }}>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem',
          background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.25)',
          borderRadius: '4px', color: 'var(--gold)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          {teams.length} managers · {rounds} rounds
        </span>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem',
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
          borderRadius: '4px', color: 'var(--text-muted)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          {totalFilled} / {teams.length * rounds} filled
        </span>
        {seasonLabel && (
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
            borderRadius: '4px', color: 'var(--text-muted)',
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            from {seasonLabel}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.15rem' }}>
          {(['round', 'position'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '0.28rem 0.65rem',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === mode ? 'rgba(212,160,23,0.18)' : 'transparent',
                color: viewMode === mode ? 'var(--gold)' : 'var(--text-muted)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
              }}
            >
              {mode === 'round' ? 'By Round' : 'By Position'}
            </button>
          ))}
        </div>
        <button
          onClick={clearBoard}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.38rem 0.65rem', borderRadius: '5px',
            border: '1px solid rgba(239,68,68,0.22)',
            background: 'rgba(239,68,68,0.07)',
            color: '#FCA5A5',
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.22)'; e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; }}
        >
          <Trash2 size={12} />
          Clear Board
        </button>
      </div>
    </div>
  );

  // ── Position view (both mobile and desktop) ───────────────────────────────
  if (viewMode === 'position') {
    return (
      <div>
        {toolbar}
        <DraftByPositionView teams={teams} picks={positionPicks} rosterPositions={rosterPositions} />
      </div>
    );
  }

  // ── Mobile: accordion by round ────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        {toolbar}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {Array.from({ length: rounds }, (_, i) => i + 1).map(round => (
            <section key={round} style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--surface)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 0.85rem',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.74rem', letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                }}>
                  Round {round}
                </span>
                <button
                  onClick={() => clearRound(round)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                    color: 'var(--text-muted)',
                    fontFamily: "'Barlow Condensed', sans-serif", fontSize: '0.6rem',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}
                >
                  <RotateCcw size={10} /> Clear
                </button>
              </div>
              {(round % 2 === 0 ? [...teams].reverse() : teams).map((team, ti) => (
                <div key={team.teamKey} style={{
                  padding: '0.65rem 0.85rem',
                  borderTop: ti === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '0.66rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--gold)', marginBottom: '0.4rem',
                  }}>
                    {team.managerName}
                  </div>
                  {renderCell(round, team, ti, true)}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop: scrollable table ──────────────────────────────────────────────
  return (
    <div>
      {toolbar}
      <div ref={topScrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', height: '18px', marginBottom: '3px' }} aria-label="Scroll draft board horizontally">
        <div style={{ height: '1px' }} />
      </div>
      <div ref={tableScrollRef} style={{
        overflowX: 'auto',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        background: 'var(--surface)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: `${58 + teams.length * 142}px`,
          tableLayout: 'fixed',
        }}>
          {/* ── Column widths ── */}
          <colgroup>
            <col style={{ width: '58px' }} />
            {teams.map(t => <col key={t.teamKey} style={{ width: '142px' }} />)}
          </colgroup>

          {/* ── Manager headers ── */}
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={{
                padding: '0.65rem 0.75rem',
                borderBottom: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                textAlign: 'left',
                verticalAlign: 'bottom',
                position: 'sticky',
                left: 0,
                zIndex: 3,
                background: 'var(--surface)',
              }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.52rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}>
                  RD
                </span>
              </th>
              {teams.map((team, teamIndex) => (
                <th key={team.teamKey} style={{
                  padding: '0.65rem 0.6rem',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid rgba(212,160,23,0.07)',
                  textAlign: 'left',
                  verticalAlign: 'bottom',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '0.64rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--gold)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {team.managerName}
                  </div>
                  <div style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.1rem',
                  }}>
                    Slot {teamIndex + 1}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Round rows ── */}
          <tbody>
            {Array.from({ length: rounds }, (_, i) => i + 1).map(round => (
              <tr key={round}>
                {/* Round label */}
                <td style={{
                  padding: '0.45rem 0.75rem',
                  verticalAlign: 'middle',
                  background: 'var(--surface-2)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1,
                    marginBottom: '0.35rem',
                  }}>
                    {round}
                  </div>
                  <button
                    onClick={() => clearRound(round)}
                    title="Clear this round"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.18rem',
                      border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                      color: 'var(--text-muted)', opacity: 0.45,
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: '0.52rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
                  >
                    <RotateCcw size={9} /> CLR
                  </button>
                </td>

                {/* Pick cells */}
                {teams.map((team, ti) => (
                  <td key={team.teamKey} style={{
                    padding: '0.38rem',
                    verticalAlign: 'top',
                    borderLeft: '1px solid rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: round % 2 === 0 ? 'rgba(255,255,255,0.012)' : 'transparent',
                  }}>
                    {renderCell(round, team, ti)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
