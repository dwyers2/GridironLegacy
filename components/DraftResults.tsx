import React, { useState, useEffect, useCallback } from 'react';
import { SeasonDraftData, DraftPick } from '../types';
import { ChevronDown, ChevronRight, Loader2, ClipboardList, Star } from 'lucide-react';

const BACKEND_URL = 'http://localhost:3001/api';

interface Props {
  draftSeasons: SeasonDraftData[];
  loading: boolean;
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  QB:  { background: 'rgba(239,68,68,0.12)',  color: '#F87171', border: '1px solid rgba(239,68,68,0.28)' },
  RB:  { background: 'rgba(34,197,94,0.12)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.28)' },
  WR:  { background: 'rgba(59,130,246,0.12)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.28)' },
  TE:  { background: 'rgba(212,160,23,0.12)', color: '#D4A017', border: '1px solid rgba(212,160,23,0.3)' },
  K:   { background: 'rgba(168,85,247,0.12)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.28)' },
  DEF: { background: 'rgba(100,116,139,0.12)',color: '#94A3B8', border: '1px solid rgba(100,116,139,0.28)' },
};

function positionBadgeStyle(position: string): React.CSSProperties {
  return POSITION_STYLES[position] || { background: 'rgba(100,116,139,0.1)', color: '#94A3B8', border: '1px solid rgba(100,116,139,0.2)' };
}

interface DraftGridProps {
  season: SeasonDraftData;
  keeperPicks: Set<number>;
  onToggleKeeper: (pick: number) => void;
}

function DraftGrid({ season, keeperPicks, onToggleKeeper }: DraftGridProps) {
  const { picks, teams } = season;
  if (picks.length === 0) return (
    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '1.5rem', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
      No draft data available for this season.
    </p>
  );

  const numTeams = teams.length;
  const maxRound = Math.max(...picks.map(p => p.round));

  // Compute each team's home slot from odd-round picks.
  // In a snake draft odd rounds go L→R, so posInRound = slot.
  const teamSlotTally: Record<string, Record<number, number>> = {};
  for (const pick of picks) {
    if (pick.round % 2 !== 1) continue;
    const posInRound = ((pick.pick - 1) % numTeams) + 1;
    if (!teamSlotTally[pick.teamKey]) teamSlotTally[pick.teamKey] = {};
    teamSlotTally[pick.teamKey][posInRound] = (teamSlotTally[pick.teamKey][posInRound] || 0) + 1;
  }
  const teamHomeSlot: Record<string, number> = {};
  for (const team of teams) {
    const tally = teamSlotTally[team.teamKey];
    if (!tally) { teamHomeSlot[team.teamKey] = team.draftSlot; continue; }
    let best = team.draftSlot;
    let bestCount = 0;
    for (const [slotStr, count] of Object.entries(tally)) {
      if (count > bestCount) { bestCount = count; best = Number(slotStr); }
    }
    teamHomeSlot[team.teamKey] = best;
  }

  // Sort teams by home slot — this defines the column order
  const sortedTeams = [...teams].sort((a, b) => teamHomeSlot[a.teamKey] - teamHomeSlot[b.teamKey]);

  // Build lookup: overall pick number → DraftPick
  const pickByNumber = new Map(picks.map(p => [p.pick, p]));

  // grid[roundIdx][slotIdx] = the pick made at slot (slotIdx+1) in that round.
  // For a snake draft: odd rounds go L→R so posInRound = slot;
  // even rounds go R→L so posInRound = numTeams - slot + 1.
  const grid: (DraftPick | null)[][] = Array.from({ length: maxRound }, (_, roundIdx) =>
    Array.from({ length: numTeams }, (_, slotIdx) => {
      const slot = slotIdx + 1;
      const round = roundIdx + 1;
      const posInRound = round % 2 === 1 ? slot : numTeams - slot + 1;
      const overallPick = (round - 1) * numTeams + posInRound;
      return pickByNumber.get(overallPick) ?? null;
    })
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 'max-content' }}>
        <thead>
          <tr style={{ background: 'var(--surface)' }}>
            <th style={{
              padding: '0.75rem 1rem',
              color: 'var(--text-muted)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase',
              borderBottom: '1px solid var(--border)',
              position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 10, minWidth: '72px',
            }}>
              Round
            </th>
            {sortedTeams.map(team => (
              <th key={team.teamKey} style={{
                padding: '0.75rem',
                color: 'var(--gold)',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap', minWidth: '130px', maxWidth: '160px',
              }}>
                {team.managerName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr
              key={roundIdx}
              style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{
                padding: '0.6rem 1rem',
                color: 'var(--text-muted)',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '0.75rem', letterSpacing: '0.1em',
                position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 10,
              }}>
                {roundIdx + 1}
              </td>
              {row.map((pick, slotIdx) => {
                const homeTeam = sortedTeams[slotIdx];
                const isForeignPick = pick !== null && pick.teamKey !== homeTeam.teamKey;
                const isKeeper = pick !== null && keeperPicks.has(pick.pick);

                return (
                  <td key={slotIdx} style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
                    {pick === null ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                    ) : (
                      <div
                        style={{
                          display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative',
                          cursor: 'pointer',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '5px',
                          border: isKeeper
                            ? '1px solid rgba(212,160,23,0.5)'
                            : isForeignPick
                              ? '1px solid rgba(99,102,241,0.3)'
                              : '1px solid transparent',
                          background: isKeeper
                            ? 'rgba(212,160,23,0.07)'
                            : isForeignPick
                              ? 'rgba(99,102,241,0.07)'
                              : 'transparent',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        className={isForeignPick ? 'group/foreignpick' : ''}
                        onClick={() => onToggleKeeper(pick.pick)}
                        title={isKeeper ? 'Click to remove keeper designation' : 'Click to designate as keeper'}
                      >
                        {/* Hover tooltip for foreign (traded) picks */}
                        {isForeignPick && (
                          <div style={{
                            position: 'absolute', zIndex: 50,
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(99,102,241,0.35)',
                            borderRadius: '6px', padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem', whiteSpace: 'nowrap',
                            bottom: '100%', left: 0, marginBottom: '0.375rem',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                            pointerEvents: 'none',
                          }} className="hidden group-hover/foreignpick:block">
                            <span style={{ color: 'var(--text-secondary)' }}>Drafted by </span>
                            <span style={{ color: '#818cf8', fontWeight: 700 }}>{pick.managerName}</span>
                          </div>
                        )}

                        {/* Foreign pick manager label */}
                        {isForeignPick && (
                          <span style={{
                            fontSize: '0.55rem', color: '#818cf8',
                            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                          }}>
                            ↗ {pick.managerName}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.25rem' }}>
                          <span style={{
                            color: isKeeper ? 'var(--gold)' : isForeignPick ? '#a5b4fc' : 'var(--text-primary)',
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '0.8rem', lineHeight: 1.3, fontWeight: isKeeper ? 600 : 500,
                            flex: 1,
                          }}>
                            {pick.playerName || `Pick ${pick.pick}`}
                          </span>
                          {isKeeper && (
                            <Star size={11} style={{ color: 'var(--gold)', fill: 'var(--gold)', flexShrink: 0, marginTop: '0.1rem' }} />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {isKeeper && (
                            <span style={{
                              fontSize: '0.55rem', fontWeight: 700,
                              padding: '0.1rem 0.35rem', borderRadius: '3px',
                              background: 'rgba(212,160,23,0.15)',
                              border: '1px solid rgba(212,160,23,0.4)',
                              color: 'var(--gold)',
                              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                            }}>
                              KEEPER
                            </span>
                          )}
                          {pick.position && (
                            <span style={{
                              fontSize: '0.6rem', fontWeight: 700,
                              padding: '0.1rem 0.35rem', borderRadius: '3px',
                              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em',
                              ...positionBadgeStyle(pick.position),
                            }}>
                              {pick.position}
                            </span>
                          )}
                          {pick.nflTeam && (
                            <span style={{ fontSize: '0.6rem', color: isForeignPick ? '#6366f1' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {pick.nflTeam}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DraftResults({ draftSeasons, loading }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(draftSeasons.length > 0 ? [draftSeasons[0].season] : [])
  );
  // leagueKey -> set of overall pick numbers that are keepers
  const [keepersByLeague, setKeepersByLeague] = useState<Record<string, Set<number>>>({});

  const toggle = (season: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  // Fetch keepers for a league if not already loaded
  const fetchKeepers = useCallback(async (leagueKey: string) => {
    if (keepersByLeague[leagueKey]) return;
    try {
      const res = await fetch(`${BACKEND_URL}/keepers/${encodeURIComponent(leagueKey)}`);
      if (!res.ok) return;
      const data = await res.json();
      setKeepersByLeague(prev => ({ ...prev, [leagueKey]: new Set(data.keepers as number[]) }));
    } catch {
      // ignore
    }
  }, [keepersByLeague]);

  // Load keepers for any currently-expanded seasons
  useEffect(() => {
    for (const season of draftSeasons) {
      if (expanded.has(season.season)) {
        fetchKeepers(season.leagueKey);
      }
    }
  }, [expanded, draftSeasons, fetchKeepers]);

  const handleToggleKeeper = useCallback(async (leagueKey: string, pick: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/keepers/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueKey, pick }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setKeepersByLeague(prev => {
        const current = new Set(prev[leagueKey] || []);
        if (data.isKeeper) {
          current.add(pick);
        } else {
          current.delete(pick);
        }
        return { ...prev, [leagueKey]: current };
      });
    } catch {
      // ignore
    }
  }, []);

  if (loading && draftSeasons.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', gap: '1rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} size={36} />
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.75rem', letterSpacing: '0.18em',
          color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0,
        }}>
          Loading draft history...
        </p>
      </div>
    );
  }

  if (!loading && draftSeasons.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', gap: '1rem' }}>
        <ClipboardList style={{ color: 'var(--text-muted)', opacity: 0.3 }} size={44} />
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: '0.75rem', letterSpacing: '0.18em',
          color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0,
        }}>
          No draft data found
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '280px', textAlign: 'center', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
          Draft results may not be available for this league, or data is still loading.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          color: 'var(--gold)', fontSize: '0.75rem',
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em',
          padding: '0 0.5rem 0.5rem',
        }}>
          <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={14} />
          <span>FETCHING DRAFT HISTORY IN BACKGROUND...</span>
        </div>
      )}

      {draftSeasons.map(season => {
        const isOpen = expanded.has(season.season);
        const numPicks = season.picks.length;
        const numTeams = season.teams.length;
        const numRounds = numTeams > 0 ? Math.round(numPicks / numTeams) : 0;
        const keeperPicks = keepersByLeague[season.leagueKey] || new Set<number>();
        const numKeepers = keeperPicks.size;

        return (
          <div
            key={season.season}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${isOpen ? 'rgba(212,160,23,0.22)' : 'var(--border)'}`,
              borderRadius: '8px', overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}
          >
            <button
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                background: 'none', border: 'none', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => toggle(season.season)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{
                  fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: '1.5rem',
                  letterSpacing: '0.04em',
                  color: isOpen ? 'var(--gold)' : 'var(--text-primary)',
                  transition: 'color 0.2s',
                }}>
                  {season.season}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                    background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
                    borderRadius: '4px', color: 'var(--gold)',
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>{numTeams} teams</span>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
                    borderRadius: '4px', color: 'var(--text-muted)',
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>{numRounds} rounds</span>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
                    borderRadius: '4px', color: 'var(--text-muted)',
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>{numPicks} picks</span>
                  {numKeepers > 0 && (
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.5rem',
                      background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)',
                      borderRadius: '4px', color: 'var(--gold)',
                      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.12em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                    }}>
                      <Star size={8} style={{ fill: 'var(--gold)' }} />
                      {numKeepers} {numKeepers === 1 ? 'keeper' : 'keepers'}
                    </span>
                  )}
                </div>
              </div>
              {isOpen
                ? <ChevronDown style={{ color: 'var(--gold)' }} size={18} />
                : <ChevronRight style={{ color: 'var(--text-muted)' }} size={18} />
              }
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <div style={{
                  padding: '0.5rem 1rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.7rem', color: 'var(--text-muted)',
                  fontFamily: "'Outfit', sans-serif",
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <Star size={11} style={{ color: 'var(--gold)' }} />
                  Click any pick to designate as a keeper
                </div>
                <DraftGrid
                  season={season}
                  keeperPicks={keeperPicks}
                  onToggleKeeper={(pick) => handleToggleKeeper(season.leagueKey, pick)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
