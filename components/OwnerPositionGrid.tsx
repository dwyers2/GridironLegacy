import React, { useState } from 'react';
import { SeasonDraftData } from '../types';
import { Loader2, Target } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

interface Props {
  draftSeasons: SeasonDraftData[];
  loading: boolean;
  myManagerName?: string | null;
}

const POSITION_COLORS: Record<string, string> = {
  QB:  '#F87171',
  RB:  '#4ADE80',
  WR:  '#60A5FA',
  TE:  '#D4A017',
  K:   '#C084FC',
  DEF: '#94A3B8',
};

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const MAX_ROUNDS = 16;

function dotColor(pos: string): string {
  return POSITION_COLORS[pos] ?? '#64748B';
}

interface Entry {
  season: string;
  position: string;
  playerName: string;
}

export default function OwnerPositionGrid({ draftSeasons, loading, myManagerName }: Props) {
  const isMobile = useIsMobile();
  const [selectedManagerName, setSelectedManagerName] = useState<string | null>(null);

  if (loading && draftSeasons.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', gap: '1rem' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} size={36} />
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.18em', color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>
          Loading draft data...
        </p>
      </div>
    );
  }

  if (draftSeasons.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
        <Target style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.3 }} size={44} />
        <p style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif", margin: '0 0 0.5rem' }}>
          No draft data available yet.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
          Visit the Draft History tab first to load season data.
        </p>
      </div>
    );
  }

  // Sort seasons chronologically
  const sorted = [...draftSeasons].sort((a, b) => Number(a.season) - Number(b.season));
  const mostRecent = sorted[sorted.length - 1];

  // Log raw team data so you can see exactly what name Yahoo assigned to each team slot
  console.log('[OwnerPositionGrid] Most recent season:', mostRecent.season);
  console.log('[OwnerPositionGrid] Teams in most recent season:', mostRecent.teams.map(t => ({
    slot: t.draftSlot,
    name: t.managerName,
    key: t.teamKey,
  })));

  // Deduplicate managers by name (Yahoo sometimes returns two team slots with the same
  // manager name, e.g. if someone co-manages or the API returns a stale entry).
  // We keep all teamKeys for a given name so their picks still populate correctly.
  const nameToTeamKeys = new Map<string, string[]>();
  const seenNames = new Set<string>();
  const recentManagers: Array<{ teamKey: string; managerName: string; draftSlot: number }> = [];

  const sortedTeams = [...mostRecent.teams].sort((a, b) => {
    if (myManagerName) {
      const aIsMe = a.managerName === myManagerName ? -1 : 0;
      const bIsMe = b.managerName === myManagerName ? -1 : 0;
      if (aIsMe !== bIsMe) return aIsMe - bIsMe;
    }
    return a.draftSlot - b.draftSlot;
  });
  for (const t of sortedTeams) {
    // Track every teamKey associated with this name across the most recent season
    const keys = nameToTeamKeys.get(t.managerName) ?? [];
    keys.push(t.teamKey);
    nameToTeamKeys.set(t.managerName, keys);

    // Only add one column per unique name
    if (!seenNames.has(t.managerName)) {
      seenNames.add(t.managerName);
      recentManagers.push(t);
    }
  }

  const recentManagerNames = new Set(recentManagers.map(m => m.managerName));

  // Build grid: managerName → round → Entry[]
  const grid = new Map<string, Map<number, Entry[]>>();
  for (const m of recentManagers) {
    const roundMap = new Map<number, Entry[]>();
    for (let r = 1; r <= MAX_ROUNDS; r++) roundMap.set(r, []);
    grid.set(m.managerName, roundMap);
  }

  // Walk every season in chronological order and populate cells
  for (const season of sorted) {
    const teamToManager = new Map(season.teams.map(t => [t.teamKey, t.managerName]));
    for (const pick of season.picks) {
      const manager = teamToManager.get(pick.teamKey);
      if (!manager || !recentManagerNames.has(manager)) continue;
      if (pick.round < 1 || pick.round > MAX_ROUNDS) continue;
      if (!pick.position) continue;
      grid.get(manager)?.get(pick.round)?.push({
        season: season.season,
        position: pick.position,
        playerName: pick.playerName || `Pick ${pick.pick}`,
      });
    }
  }

  const allSeasons = sorted.map(s => s.season);
  const averagePositionCounts = new Map<number, Map<string, number>>();
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    averagePositionCounts.set(round, new Map(POSITION_ORDER.map(pos => [pos, 0])));
  }
  for (const season of sorted) {
    for (const pick of season.picks) {
      if (pick.round < 1 || pick.round > MAX_ROUNDS || !pick.position) continue;
      const position = pick.position === 'D/ST' ? 'DEF' : pick.position;
      const counts = averagePositionCounts.get(pick.round);
      if (counts?.has(position)) counts.set(position, (counts.get(position) ?? 0) + 1);
    }
  }
  for (const counts of averagePositionCounts.values()) {
    for (const position of POSITION_ORDER) counts.set(position, (counts.get(position) ?? 0) / sorted.length);
  }
  const formatAveragePositions = (round: number) => {
    const counts = averagePositionCounts.get(round);
    if (!counts) return '—';
    return POSITION_ORDER
      .filter(position => (counts.get(position) ?? 0) > 0)
      .map(position => `${position} ${(counts.get(position) ?? 0).toFixed(1)}`)
      .join(' · ') || '—';
  };

  if (isMobile) {
    const displayManager = selectedManagerName
      ? recentManagers.find(m => m.managerName === selectedManagerName) ?? recentManagers[0]
      : recentManagers[0];
    return (
      <div>
        {/* Manager pill picker */}
        <div className="pill-scroll" style={{ marginBottom: '1rem' }}>
          {recentManagers.map(m => (
            <button
              key={m.teamKey}
              onClick={() => setSelectedManagerName(m.managerName)}
              style={{
                padding: '0.45rem 0.875rem',
                borderRadius: '20px',
                background: displayManager?.managerName === m.managerName ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                color: displayManager?.managerName === m.managerName ? '#0C0F16' : 'var(--text-secondary)',
                border: displayManager?.managerName === m.managerName ? '1px solid var(--gold)' : '1px solid var(--border-muted)',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '0.8rem', letterSpacing: '0.06em',
                cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              {m.managerName}
            </button>
          ))}
        </div>

        {/* Position legend */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.875rem' }}>
          {POSITION_ORDER.map(pos => (
            <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor(pos), boxShadow: `0 0 6px ${dotColor(pos)}80`, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{pos}</span>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 1rem', fontStyle: 'italic' }}>
          Each dot = one draft pick · hover for details
        </p>

        {/* Single-manager dot grid */}
        {displayManager && (
          <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--surface)', minWidth: '72px' }}>Round</th>
                  <th style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid rgba(212,160,23,0.07)', background: 'var(--surface)', textAlign: 'center', minWidth: '220px' }}>Avg / Position</th>
                  <th style={{ padding: '0.75rem 1rem', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.06em', color: 'var(--gold)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid rgba(212,160,23,0.07)', background: 'var(--surface)', textAlign: 'center' }}>
                    {displayManager.managerName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1).map(round => {
                  const entries = grid.get(displayManager.managerName)?.get(round) ?? [];
                  return (
                    <tr key={round}>
                      <td style={{ padding: '0.55rem 1rem', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--text-muted)', borderBottom: '1px solid rgba(212,160,23,0.05)', background: 'var(--surface-2)' }}>
                        {round}
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', fontFamily: "'Outfit', sans-serif", fontSize: '0.64rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(212,160,23,0.04)', borderLeft: '1px solid rgba(212,160,23,0.05)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {formatAveragePositions(round)}
                      </td>
                      <td style={{ padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(212,160,23,0.04)', borderLeft: '1px solid rgba(212,160,23,0.05)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', minHeight: '18px' }}>
                          {entries.length > 0 ? entries.map((entry, idx) => (
                            <div
                              key={idx}
                              title={`${entry.season}: ${entry.playerName} (${entry.position})`}
                              style={{ width: '12px', height: '12px', borderRadius: '50%', background: dotColor(entry.position), boxShadow: `0 0 5px ${dotColor(entry.position)}55`, flexShrink: 0, cursor: 'help' }}
                            />
                          )) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', opacity: 0.3 }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Legend + season index */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Position
          </span>
          {POSITION_ORDER.map(pos => (
            <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: dotColor(pos),
                boxShadow: `0 0 6px ${dotColor(pos)}80`,
                flexShrink: 0,
              }} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
                {pos}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.68rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Seasons:</span>
          {allSeasons.map(s => (
            <span key={s} style={{
              fontFamily: 'monospace', fontSize: '0.65rem',
              padding: '0.1rem 0.4rem',
              background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
              borderRadius: '3px', color: 'var(--gold)',
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 1.25rem', fontStyle: 'italic' }}>
        Managers active in {mostRecent.season} · each dot = one draft (left→right: oldest→newest) · hover a dot for details
      </p>

      {/* Grid */}
      <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
                <th style={{
                padding: '0.75rem 1rem',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'var(--text-muted)', textAlign: 'left',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
                position: 'sticky', left: 0, zIndex: 10,
                minWidth: '72px',
              }}>
                Round
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap',
                borderBottom: '1px solid var(--border)',
                borderLeft: '1px solid rgba(212,160,23,0.07)',
                background: 'var(--surface)',
              }}>
                Avg / Position
              </th>
              {recentManagers.map(manager => (
                <th key={manager.teamKey} style={{
                  padding: '0.75rem 1rem',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.7rem', letterSpacing: '0.06em',
                  color: 'var(--gold)',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid rgba(212,160,23,0.07)',
                  background: 'var(--surface)',
                  textAlign: 'center', whiteSpace: 'nowrap',
                  minWidth: '120px',
                }}>
                  {manager.managerName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1).map(round => (
              <tr
                key={round}
                style={{ transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Round number — sticky left column */}
                <td style={{
                  padding: '0.55rem 1rem',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '0.75rem', letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid rgba(212,160,23,0.05)',
                  background: 'var(--surface-2)',
                  position: 'sticky', left: 0, zIndex: 5,
                }}>
                  {round}
                </td>
                <td style={{
                  padding: '0.45rem 0.75rem',
                  fontFamily: "'Outfit', sans-serif", fontSize: '0.64rem',
                  color: 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap',
                  borderBottom: '1px solid rgba(212,160,23,0.04)',
                  borderLeft: '1px solid rgba(212,160,23,0.05)',
                }}>
                  {formatAveragePositions(round)}
                </td>

                {/* One cell per manager */}
                {recentManagers.map(manager => {
                  const entries = grid.get(manager.managerName)?.get(round) ?? [];
                  return (
                    <td key={manager.teamKey} style={{
                      padding: '0.45rem 0.75rem',
                      borderBottom: '1px solid rgba(212,160,23,0.04)',
                      borderLeft: '1px solid rgba(212,160,23,0.05)',
                      verticalAlign: 'middle',
                    }}>
                      <div style={{
                        display: 'flex', gap: '4px', flexWrap: 'wrap',
                        justifyContent: 'center', alignItems: 'center',
                        minHeight: '18px',
                      }}>
                        {entries.length > 0 ? entries.map((entry, idx) => (
                          <div
                            key={idx}
                            title={`${entry.season}: ${entry.playerName} (${entry.position})`}
                            style={{
                              width: '12px', height: '12px',
                              borderRadius: '50%',
                              background: dotColor(entry.position),
                              boxShadow: `0 0 5px ${dotColor(entry.position)}55`,
                              flexShrink: 0,
                              cursor: 'help',
                              transition: 'transform 0.1s, box-shadow 0.1s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scale(1.5)';
                              e.currentTarget.style.boxShadow = `0 0 10px ${dotColor(entry.position)}99`;
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = `0 0 5px ${dotColor(entry.position)}55`;
                            }}
                          />
                        )) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', opacity: 0.3 }}>—</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
