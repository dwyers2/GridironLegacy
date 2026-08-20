import React from 'react';
import { Star, Lock } from 'lucide-react';
import { RosterPosition } from '../types';

export interface PosViewPick {
  teamKey: string;
  playerName: string;
  position: string;
  round: number;
  isKeeper?: boolean;
  pickNum?: number;
  seasonPoints?: number;
}

interface Props {
  teams: Array<{ teamKey: string; managerName: string }>;
  picks: PosViewPick[];
  rosterPositions?: RosterPosition[];
  onToggleKeeper?: (pickNum: number) => void;
  keeperPicks?: Set<number>;
  isLocked?: boolean;
}

// ── Style constants ────────────────────────────────────────────────────────────

const POS_COLOR: Record<string, { text: string; bg: string }> = {
  QB:   { text: '#F87171', bg: 'rgba(239,68,68,0.12)'   },
  RB:   { text: '#4ADE80', bg: 'rgba(34,197,94,0.12)'   },
  WR:   { text: '#60A5FA', bg: 'rgba(59,130,246,0.12)'  },
  TE:   { text: '#D4A017', bg: 'rgba(212,160,23,0.12)'  },
  K:    { text: '#C084FC', bg: 'rgba(168,85,247,0.12)'  },
  DEF:  { text: '#94A3B8', bg: 'rgba(100,116,139,0.12)' },
  FLEX: { text: '#FB923C', bg: 'rgba(251,146,60,0.12)'  },
  BENCH:{ text: '#6B7280', bg: 'rgba(107,114,128,0.1)'  },
};
const fallbackColor = { text: '#6B7280', bg: 'rgba(107,114,128,0.1)' };

// Yahoo single-letter abbreviations used inside flex position strings
const FLEX_ABBREV: Record<string, string> = { Q: 'QB', W: 'WR', R: 'RB', T: 'TE', K: 'K' };
// Positions that contain '/' but are single named slots, not flex combos
const NAMED_SLASH = new Set(['D/ST']);

function isFlexSlot(pos: string) {
  return pos.includes('/') && !NAMED_SLASH.has(pos);
}

function normalizePos(pos: string) {
  return pos === 'D/ST' ? 'DEF' : pos;
}

// ── Roster parsing ─────────────────────────────────────────────────────────────

interface FlexSlot { label: string; eligible: string[]; count: number }

function parseRoster(rosterPositions: RosterPosition[]): {
  starterCounts: Record<string, number>;
  flexSlots: FlexSlot[];
} {
  const starterCounts: Record<string, number> = {};
  const flexSlots: FlexSlot[] = [];

  for (const rp of rosterPositions) {
    const pos = rp.position;
    if (!pos || pos === 'BN' || pos === 'IR' || !rp.isStarting) continue;

    if (isFlexSlot(pos)) {
      const eligible = pos.split('/').map(a => FLEX_ABBREV[a] ?? a).filter(Boolean);
      flexSlots.push({ label: pos, eligible, count: rp.count });
    } else {
      const norm = normalizePos(pos);
      starterCounts[norm] = (starterCounts[norm] ?? 0) + rp.count;
    }
  }
  return { starterCounts, flexSlots };
}

// ── Per-team pick assignment ───────────────────────────────────────────────────

interface TeamSlots {
  starters: Map<string, PosViewPick[]>;  // normalizedPos → picks
  flex: PosViewPick[][];                 // one array per flexSlot index
  bench: PosViewPick[];
}

function assignTeam(
  picks: PosViewPick[],
  starterCounts: Record<string, number>,
  flexSlots: FlexSlot[],
): TeamSlots {
  const sorted = [...picks].sort((a, b) => a.round - b.round);
  const posUsed: Record<string, number> = {};
  const starters = new Map<string, PosViewPick[]>();
  const unassigned: PosViewPick[] = [];

  for (const pick of sorted) {
    const norm = normalizePos(pick.position);
    const limit = starterCounts[norm] ?? 0;
    if ((posUsed[norm] ?? 0) < limit) {
      if (!starters.has(norm)) starters.set(norm, []);
      starters.get(norm)!.push(pick);
      posUsed[norm] = (posUsed[norm] ?? 0) + 1;
    } else {
      unassigned.push(pick);
    }
  }

  // Assign flex slots from unassigned picks (earliest rounds first)
  const remaining = [...unassigned];
  const flex: PosViewPick[][] = flexSlots.map(slot => {
    const eligible = remaining.filter(p => slot.eligible.includes(normalizePos(p.position)));
    const assigned = eligible.slice(0, slot.count);
    for (const a of assigned) {
      const idx = remaining.indexOf(a);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return assigned;
  });

  return { starters, flex, bench: remaining };
}

// ── Static (no roster) groups ─────────────────────────────────────────────────

const STATIC_GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'Other'] as const;

function staticGroupFor(pos: string): string {
  const norm = normalizePos(pos);
  if (['QB','RB','WR','TE','K','DEF'].includes(norm)) return norm;
  return 'Other';
}

// ── Shared cell renderer ───────────────────────────────────────────────────────

function PickItem({
  pick, rowColor, onToggleKeeper, keeperPicks, isLocked, canToggle,
}: {
  pick: PosViewPick;
  rowColor: string;
  onToggleKeeper?: (n: number) => void;
  keeperPicks?: Set<number>;
  isLocked?: boolean;
  canToggle: boolean;
}) {
  const isKept = !!(pick.isKeeper || (pick.pickNum != null && keeperPicks?.has(pick.pickNum)));
  return (
    <div
      onClick={() => canToggle && onToggleKeeper!(pick.pickNum!)}
      style={{
        display: 'flex', alignItems: 'baseline', gap: '0.3rem',
        padding: '0.28rem 0.35rem', borderRadius: '4px',
        background: isKept ? 'rgba(212,160,23,0.07)' : 'transparent',
        border: isKept ? '1px solid rgba(212,160,23,0.3)' : '1px solid transparent',
        cursor: canToggle ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (canToggle) (e.currentTarget as HTMLElement).style.background = isKept ? 'rgba(212,160,23,0.12)' : 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { if (canToggle) (e.currentTarget as HTMLElement).style.background = isKept ? 'rgba(212,160,23,0.07)' : 'transparent'; }}
    >
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
        fontSize: '0.56rem', letterSpacing: '0.08em',
        color: rowColor, opacity: 0.75, flexShrink: 0, lineHeight: 1.4,
      }}>
        R{pick.round}
      </span>
      <span style={{
        fontFamily: "'Outfit', sans-serif", fontSize: '0.76rem',
        fontWeight: isKept ? 600 : 400,
        color: isKept ? 'var(--gold)' : 'var(--text-primary)',
        lineHeight: 1.3, flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {pick.playerName}
      </span>
      {pick.seasonPoints != null && (
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.56rem', color: '#4ADE80', flexShrink: 0 }}>
          {pick.seasonPoints.toFixed(0)}
        </span>
      )}
      {isKept && !isLocked && <Star size={9} style={{ color: 'var(--gold)', fill: 'var(--gold)', flexShrink: 0 }} />}
      {isLocked && isKept && <Lock size={8} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
    </div>
  );
}

function EmptyCell() {
  return <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', opacity: 0.3, padding: '0.28rem 0.3rem', display: 'block' }}>—</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DraftByPositionView({ teams, picks, rosterPositions, onToggleKeeper, keeperPicks, isLocked }: Props) {
  // Group picks by team
  const byTeam = new Map<string, PosViewPick[]>();
  for (const team of teams) byTeam.set(team.teamKey, []);
  for (const pick of picks) {
    if (pick.playerName.trim()) byTeam.get(pick.teamKey)?.push(pick);
  }

  const canToggle = !isLocked && !!onToggleKeeper;

  // ── Roster-aware view ──────────────────────────────────────────────────────
  if (rosterPositions && rosterPositions.length > 0) {
    const { starterCounts, flexSlots } = parseRoster(rosterPositions);

    // Pre-compute assignments for every team
    const teamSlots = new Map<string, TeamSlots>();
    for (const team of teams) {
      teamSlots.set(team.teamKey, assignTeam(byTeam.get(team.teamKey) ?? [], starterCounts, flexSlots));
    }

    // One row per slot — each team cell shows exactly one player
    type RowDef =
      | { kind: 'pos'; pos: string; label: string; slotIdx: number; groupKey: string }
      | { kind: 'flex'; flexIdx: number; slot: FlexSlot; slotIdx: number; groupKey: string }
      | { kind: 'bench'; groupKey: string };

    const rows: RowDef[] = [];

    const pushPos = (pos: string) => {
      const count = starterCounts[pos] ?? 0;
      for (let i = 0; i < count; i++) {
        rows.push({ kind: 'pos', pos, label: count > 1 ? `${pos}${i + 1}` : pos, slotIdx: i, groupKey: `pos-${pos}` });
      }
    };

    pushPos('QB');
    pushPos('RB');
    pushPos('WR');
    flexSlots.forEach((slot, flexIdx) => {
      for (let i = 0; i < slot.count; i++) {
        rows.push({ kind: 'flex', flexIdx, slot, slotIdx: i, groupKey: `flex-${flexIdx}`, });
      }
    });
    pushPos('TE');
    pushPos('K');
    pushPos('DEF');

    const hasBench = [...teamSlots.values()].some(ts => ts.bench.length > 0);
    if (hasBench) rows.push({ kind: 'bench', groupKey: 'bench' });

    const rowGroupKeys = rows.map(r => r.groupKey);
    const isGroupBoundary = (ri: number) =>
      ri < rows.length - 1 && rowGroupKeys[ri] !== rowGroupKeys[ri + 1];

    const rowColor = (row: RowDef) => {
      if (row.kind === 'pos') return (POS_COLOR[row.pos] ?? fallbackColor).text;
      if (row.kind === 'flex') return POS_COLOR.FLEX.text;
      return POS_COLOR.BENCH.text;
    };
    const rowBg = (row: RowDef) => {
      if (row.kind === 'pos') return (POS_COLOR[row.pos] ?? fallbackColor).bg;
      if (row.kind === 'flex') return POS_COLOR.FLEX.bg;
      return POS_COLOR.BENCH.bg;
    };
    const rowLabel = (row: RowDef) => {
      if (row.kind === 'pos') return row.label;
      if (row.kind === 'flex') return row.slot.count > 1 ? `${row.slot.label} ${row.slotIdx + 1}` : row.slot.label;
      return 'BENCH';
    };

    return (
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${64 + teams.length * 130}px`, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '64px' }} />
            {teams.map(t => <col key={t.teamKey} style={{ width: '130px' }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={{ padding: '0.65rem 0.6rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left' }}>POS</th>
              {teams.map(team => (
                <th key={team.teamKey} style={{ padding: '0.65rem 0.55rem', borderBottom: '1px solid var(--border)', borderLeft: '1px solid rgba(212,160,23,0.07)', textAlign: 'left', overflow: 'hidden' }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.64rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {team.managerName}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const color = rowColor(row);
              const bg = rowBg(row);
              const label = rowLabel(row);
              const isBench = row.kind === 'bench';
              const groupEnd = isGroupBoundary(ri);
              const borderBottom = isBench || ri === rows.length - 1
                ? 'none'
                : groupEnd
                  ? '1px solid var(--border)'
                  : '1px solid rgba(255,255,255,0.03)';
              return (
                <tr key={ri} style={{ borderBottom }}>
                  <td style={{ padding: '0.4rem 0.45rem', verticalAlign: 'middle', borderRight: '1px solid var(--border)', background: 'var(--surface-2)', borderTop: isBench ? '2px solid var(--border)' : undefined }}>
                    <span style={{ display: 'inline-block', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color, background: bg, padding: '0.2rem 0.4rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </td>
                  {teams.map((team, ti) => {
                    const slots = teamSlots.get(team.teamKey)!;
                    let cellPick: PosViewPick | undefined;
                    let benchPicks: PosViewPick[] = [];
                    if (row.kind === 'pos') {
                      cellPick = slots.starters.get(row.pos)?.[row.slotIdx];
                    } else if (row.kind === 'flex') {
                      cellPick = slots.flex[row.flexIdx]?.[row.slotIdx];
                    } else {
                      benchPicks = slots.bench;
                    }
                    const cellPicks = isBench ? benchPicks : (cellPick ? [cellPick] : []);
                    return (
                      <td key={team.teamKey} style={{ padding: '0.25rem 0.4rem', verticalAlign: isBench ? 'top' : 'middle', borderLeft: '1px solid rgba(255,255,255,0.03)', background: ti % 2 === 1 ? 'rgba(255,255,255,0.008)' : 'transparent', borderTop: isBench ? '2px solid var(--border)' : undefined }}>
                        {cellPicks.length === 0 ? <EmptyCell /> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {cellPicks.map((pick, pi) => (
                              <PickItem key={pi} pick={pick} rowColor={color} onToggleKeeper={onToggleKeeper} keeperPicks={keeperPicks} isLocked={isLocked} canToggle={canToggle && pick.pickNum != null} />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Static fallback (no roster positions) ─────────────────────────────────
  const grouped = new Map<string, Map<string, PosViewPick[]>>();
  for (const g of STATIC_GROUPS) grouped.set(g, new Map());
  for (const pick of picks) {
    if (!pick.playerName.trim()) continue;
    const g = staticGroupFor(pick.position);
    const tm = grouped.get(g)!;
    if (!tm.has(pick.teamKey)) tm.set(pick.teamKey, []);
    tm.get(pick.teamKey)!.push(pick);
  }
  for (const tm of grouped.values()) {
    for (const [, arr] of tm) arr.sort((a, b) => a.round - b.round);
  }
  const activeGroups = STATIC_GROUPS.filter(g => [...(grouped.get(g)?.values() ?? [])].some(a => a.length > 0));
  if (activeGroups.length === 0) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif", fontSize: '0.82rem' }}>No picks to display.</div>;
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${64 + teams.length * 130}px`, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '64px' }} />
          {teams.map(t => <col key={t.teamKey} style={{ width: '130px' }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <th style={{ padding: '0.65rem 0.6rem', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left' }}>POS</th>
            {teams.map(team => (
              <th key={team.teamKey} style={{ padding: '0.65rem 0.55rem', borderBottom: '1px solid var(--border)', borderLeft: '1px solid rgba(212,160,23,0.07)', textAlign: 'left', overflow: 'hidden' }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.64rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {team.managerName}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeGroups.map((group, gi) => {
            const color = (POS_COLOR[group] ?? fallbackColor).text;
            const bg = (POS_COLOR[group] ?? fallbackColor).bg;
            return (
              <tr key={group} style={{ borderBottom: gi < activeGroups.length - 1 ? '2px solid var(--border)' : 'none' }}>
                <td style={{ padding: '0.5rem 0.45rem', verticalAlign: 'top', borderRight: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <span style={{ display: 'inline-block', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color, background: bg, padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                    {group}
                  </span>
                </td>
                {teams.map((team, ti) => {
                  const teamPicks = grouped.get(group)?.get(team.teamKey) ?? [];
                  return (
                    <td key={team.teamKey} style={{ padding: '0.3rem 0.4rem', verticalAlign: 'top', borderLeft: '1px solid rgba(255,255,255,0.03)', background: ti % 2 === 1 ? 'rgba(255,255,255,0.008)' : 'transparent' }}>
                      {teamPicks.length === 0 ? <EmptyCell /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {teamPicks.map((pick, pi) => (
                            <PickItem key={pi} pick={pick} rowColor={color} onToggleKeeper={onToggleKeeper} keeperPicks={keeperPicks} isLocked={isLocked} canToggle={canToggle && pick.pickNum != null} />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
