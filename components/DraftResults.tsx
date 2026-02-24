import React, { useState } from 'react';
import { SeasonDraftData, DraftPick } from '../types';
import { ChevronDown, ChevronRight, Loader2, ClipboardList } from 'lucide-react';

interface Props {
  draftSeasons: SeasonDraftData[];
  loading: boolean;
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-300 border-red-500/30',
  RB: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  WR: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  TE: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  K:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  DEF:'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function positionBadgeClass(position: string): string {
  return POSITION_COLORS[position] || 'bg-slate-600/20 text-slate-400 border-slate-600/30';
}

function DraftGrid({ season }: { season: SeasonDraftData }) {
  const { picks, teams } = season;
  if (picks.length === 0) return <p className="text-slate-500 italic p-6">No draft data available for this season.</p>;

  const numTeams = teams.length;
  const maxRound = Math.max(...picks.map(p => p.round));

  // Build lookup: teamKey -> draftSlot (column index 0-based)
  const teamSlot = new Map(teams.map(t => [t.teamKey, t.draftSlot - 1]));

  // Build grid: grid[round][slot] = DraftPick
  const grid: (DraftPick | null)[][] = Array.from({ length: maxRound }, () =>
    Array(numTeams).fill(null)
  );

  for (const pick of picks) {
    const slot = teamSlot.get(pick.teamKey);
    if (slot !== undefined && pick.round >= 1 && pick.round <= maxRound) {
      grid[pick.round - 1][slot] = pick;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm min-w-max">
        <thead>
          <tr className="bg-slate-900/60">
            <th className="px-4 py-3 text-slate-500 font-black text-[10px] uppercase tracking-widest border-b border-slate-700/50 sticky left-0 bg-slate-900/90 z-10 min-w-[72px]">
              Round
            </th>
            {teams.map(team => (
              <th
                key={team.teamKey}
                className="px-3 py-3 text-indigo-300 font-bold text-[11px] border-b border-slate-700/50 whitespace-nowrap min-w-[130px] max-w-[160px]"
              >
                {team.managerName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr key={roundIdx} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
              <td className="px-4 py-2.5 text-slate-500 font-black text-xs sticky left-0 bg-[#020617]/80 z-10">
                {roundIdx + 1}
              </td>
              {row.map((pick, slotIdx) => (
                <td key={slotIdx} className="px-3 py-2.5 align-top">
                  {pick ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-200 font-medium text-xs leading-tight">
                        {pick.playerName || `Pick ${pick.pick}`}
                      </span>
                      <div className="flex items-center gap-1">
                        {pick.position && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${positionBadgeClass(pick.position)}`}>
                            {pick.position}
                          </span>
                        )}
                        {pick.nflTeam && (
                          <span className="text-[9px] text-slate-500 font-mono">{pick.nflTeam}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-700 text-xs">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DraftResults({ draftSeasons, loading }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    // Auto-expand the most recent season
    new Set(draftSeasons.length > 0 ? [draftSeasons[0].season] : [])
  );

  const toggle = (season: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  if (loading && draftSeasons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
        <Loader2 className="animate-spin w-10 h-10 text-indigo-500" />
        <p className="font-bold uppercase tracking-widest text-sm">Loading draft history...</p>
      </div>
    );
  }

  if (!loading && draftSeasons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-4">
        <ClipboardList className="w-12 h-12 opacity-40" />
        <p className="font-bold uppercase tracking-widest text-sm">No draft data found</p>
        <p className="text-xs text-slate-700 max-w-xs text-center">Draft results may not be available for this league, or data is still loading.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center gap-3 text-indigo-400 text-sm font-bold px-2 pb-2">
          <Loader2 className="animate-spin w-4 h-4" />
          <span>Fetching draft history in background...</span>
        </div>
      )}

      {draftSeasons.map(season => {
        const isOpen = expanded.has(season.season);
        const numPicks = season.picks.length;
        const numTeams = season.teams.length;
        const numRounds = numTeams > 0 ? Math.round(numPicks / numTeams) : 0;

        return (
          <div
            key={season.season}
            className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-800/50 transition-colors group"
              onClick={() => toggle(season.season)}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-white tracking-tight">{season.season}</span>
                <div className="flex gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {numTeams} teams
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400 border border-slate-600/30">
                    {numRounds} rounds
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400 border border-slate-600/30">
                    {numPicks} picks
                  </span>
                </div>
              </div>
              {isOpen
                ? <ChevronDown className="text-indigo-400 group-hover:scale-110 transition-transform" size={20} />
                : <ChevronRight className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" size={20} />
              }
            </button>

            {isOpen && (
              <div className="border-t border-slate-700/50">
                <DraftGrid season={season} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
