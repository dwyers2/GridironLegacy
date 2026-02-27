import React, { useState } from 'react';
import { ManagerOwnershipData, ManagerTendency, FetchProgress } from '../types';
import { Users, Trophy, TrendingUp, Sparkles, Heart, Filter, RefreshCw } from 'lucide-react';

interface ManagerInsightsProps {
  ownershipData: ManagerOwnershipData[];
  tendencies: ManagerTendency[];
  loading: boolean;
  fetchProgress?: FetchProgress | null;
  onRefreshTendency?: (managerId: string) => void;
  refreshingManagers?: Set<string>;
}

const ManagerInsights: React.FC<ManagerInsightsProps> = ({
  ownershipData,
  tendencies,
  loading,
  fetchProgress,
  onRefreshTendency,
  refreshingManagers
}) => {
  const [activeTab, setActiveTab] = useState<'ownership' | 'tendencies'>('ownership');
  const [ownershipFilter, setOwnershipFilter] = useState(3);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xl font-bold text-slate-400">Analyzing Manager Histories...</p>
          {fetchProgress && (
            <div className="mt-4">
              <p className="text-indigo-400 font-medium">
                Fetching {fetchProgress.season} season...
              </p>
              <div className="w-64 h-2 bg-slate-700 rounded-full mt-2 mx-auto overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {fetchProgress.current} of {fetchProgress.total} seasons
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Calculate stats for display
  const totalSeasons = new Set(ownershipData.flatMap(m => m.seasonsTracked || [])).size;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-5xl font-black tracking-tighter text-white mb-2">MANAGER INSIGHTS</h1>
        <p className="text-indigo-400 font-bold uppercase tracking-widest text-sm">
          Deep Dive into Ownership Patterns & Tendencies
          {totalSeasons > 0 && (
            <span className="ml-2 text-slate-500">• {totalSeasons} seasons analyzed</span>
          )}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-8 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('ownership')}
          className={`px-6 py-4 font-black uppercase tracking-wider transition-all relative ${
            activeTab === 'ownership'
              ? 'text-indigo-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users size={20} />
            Player Ownership
          </div>
          {activeTab === 'ownership' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('tendencies')}
          className={`px-6 py-4 font-black uppercase tracking-wider transition-all relative ${
            activeTab === 'tendencies'
              ? 'text-indigo-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={20} />
            AI Tendencies
          </div>
          {activeTab === 'tendencies' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500" />
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'ownership' ? (
        <div className="space-y-8">
          {/* Filter Controls */}
          <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-4">
              <Filter size={20} className="text-slate-500" />
              <span className="text-sm font-bold text-slate-400">Min. Ownership:</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    onClick={() => setOwnershipFilter(num)}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                      ownershipFilter === num
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {num}+
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-500">
              Showing players owned {ownershipFilter}+ times
            </span>
          </div>

          {/* Manager Cards */}
          {ownershipData.map((manager) => {
            const filteredPlayers = manager.players.filter(p => p.timesOwned >= ownershipFilter);

            // Hide managers with no qualifying players
            if (filteredPlayers.length === 0) return null;

            return (
              <div
                key={manager.managerId}
                className="bg-slate-800/40 border border-slate-700/50 rounded-3xl overflow-hidden shadow-lg"
              >
                {/* Manager Header */}
                <div className="p-6 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-indigo-900/30 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                        <Users className="text-indigo-400" size={32} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white">{manager.managerName}</h2>
                        <p className="text-slate-400 font-medium">
                          {filteredPlayers.length} players with {ownershipFilter}+ seasons
                        </p>
                        {/* Seasons tracked */}
                        {manager.seasonsTracked && manager.seasonsTracked.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {manager.seasonsTracked.map(season => (
                              <span
                                key={season}
                                className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-500"
                              >
                                {season}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-indigo-400">
                        {filteredPlayers.reduce((sum, p) => sum + p.timesOwned, 0)}
                      </div>
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        Total Ownerships
                      </div>
                    </div>
                  </div>
                </div>

                {/* Player Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900/50">
                      <tr className="text-slate-500 text-xs uppercase font-black tracking-wider">
                        <th className="px-6 py-4 text-left">Rank</th>
                        <th className="px-6 py-4 text-left">Player</th>
                        <th className="px-6 py-4 text-center">Position</th>
                        <th className="px-6 py-4 text-center">Team</th>
                        <th className="px-6 py-4 text-center">Times Owned</th>
                        <th className="px-6 py-4 text-left">Seasons</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredPlayers
                        .sort((a, b) => b.timesOwned - a.timesOwned)
                        .map((player, index) => (
                          <tr
                            key={player.playerId}
                            className="hover:bg-indigo-500/5 transition-colors group"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {index < 3 && (
                                  <Trophy
                                    className={
                                      index === 0
                                        ? 'text-yellow-400'
                                        : index === 1
                                        ? 'text-slate-400'
                                        : 'text-orange-600'
                                    }
                                    size={16}
                                  />
                                )}
                                <span className="font-bold text-slate-400">#{index + 1}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-black text-white group-hover:text-indigo-100">
                                {player.playerName}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-block px-3 py-1 bg-slate-700/50 border border-slate-600 rounded-lg text-sm font-bold text-indigo-400">
                                {player.position}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-sm font-bold text-slate-400">
                                {player.team}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {player.timesOwned > 1 && (
                                  <Heart className="text-red-400" size={16} />
                                )}
                                <span className="text-2xl font-black text-emerald-400">
                                  {player.timesOwned}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {player.seasons
                                  .sort((a, b) => Number(b) - Number(a))
                                  .map((season) => (
                                    <span
                                      key={season}
                                      className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 rounded text-xs font-bold text-indigo-400"
                                    >
                                      {season}
                                    </span>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Show message if no managers have qualifying players */}
          {ownershipData.every(m => m.players.filter(p => p.timesOwned >= ownershipFilter).length === 0) && (
            <div className="text-center py-16 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">
                No players found with {ownershipFilter}+ seasons of ownership.
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Try lowering the minimum ownership filter.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {tendencies.map((tendency) => (
            <div
              key={tendency.managerId}
              className="bg-gradient-to-br from-indigo-600/10 via-slate-900/90 to-purple-600/10 border border-white/10 p-8 rounded-3xl shadow-2xl"
            >
              {/* Manager Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                  <Sparkles className="text-indigo-400" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-white">{tendency.managerName}</h3>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                    AI Analysis
                  </p>
                </div>
                {onRefreshTendency && (
                  <button
                    onClick={() => onRefreshTendency(tendency.managerId)}
                    disabled={refreshingManagers?.has(tendency.managerId)}
                    className="p-2 rounded-lg bg-slate-800/60 hover:bg-indigo-500/20 border border-slate-700 hover:border-indigo-500/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Refresh AI summary"
                  >
                    <RefreshCw
                      size={15}
                      className={`text-slate-400 hover:text-indigo-400 transition-colors ${refreshingManagers?.has(tendency.managerId) ? 'animate-spin' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                    Loyalty Score
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="text-red-400" size={16} />
                    <span className="text-2xl font-black text-white">
                      {tendency.loyaltyScore}%
                    </span>
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                    Top Position
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-emerald-400" size={16} />
                    <span className="text-2xl font-black text-white">
                      {tendency.topPositions[0] || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Positions */}
              <div className="mb-6">
                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">
                  Position Preferences
                </div>
                <div className="flex gap-2 flex-wrap">
                  {tendency.topPositions.map((pos, i) => (
                    <span
                      key={pos}
                      className={`px-3 py-1 rounded-lg text-sm font-bold ${
                        i === 0
                          ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400'
                          : 'bg-slate-700/50 border border-slate-600 text-slate-400'
                      }`}
                    >
                      {pos}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI Analysis */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <p className="text-slate-200 leading-relaxed italic">
                  "{tendency.analysis}"
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManagerInsights;
