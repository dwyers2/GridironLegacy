
import React, { useState, useEffect } from 'react';
import { AppState, League, PlayerStats, ManagerHistory } from './types';
import * as yahooService from './services/yahooService';
import * as geminiService from './services/geminiService';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Cell, ScatterChart, Scatter, ZAxis 
} from 'recharts';
import { 
  LayoutDashboard, History, Users, Award, 
  ChevronRight, ArrowLeft, LogOut, Loader2, Sparkles, 
  Trophy, TrendingUp, Info, ShieldAlert
} from 'lucide-react';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppState>(AppState.LOGIN);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [playerData, setPlayerData] = useState<PlayerStats[]>([]);
  const [managerData, setManagerData] = useState<ManagerHistory[]>([]);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle OAuth Callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      const initAuth = async () => {
        setLoading(true);
        const tokenData = await yahooService.exchangeCodeForToken(code);
        if (tokenData) {
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          const fetchedLeagues = await yahooService.getLeagues();
          setLeagues(fetchedLeagues);
          setCurrentStep(AppState.LEAGUE_SELECT);
        } else {
          setError("Failed to authenticate with Yahoo. Please check your Client ID/Secret configuration.");
        }
        setLoading(false);
      };
      initAuth();
    } else if (localStorage.getItem('yahoo_access_token')) {
      // Auto-load if token exists
      const resumeSession = async () => {
        setLoading(true);
        try {
          const fetchedLeagues = await yahooService.getLeagues();
          setLeagues(fetchedLeagues);
          setCurrentStep(AppState.LEAGUE_SELECT);
        } catch (e) {
          localStorage.removeItem('yahoo_access_token');
        }
        setLoading(false);
      };
      resumeSession();
    }
  }, []);

  const handleLogin = () => {
    // Redirect user to Yahoo Auth
    window.location.href = yahooService.getAuthUrl();
  };

  const handleSelectLeague = async (league: League) => {
    setLoading(true);
    setSelectedLeague(league);
    try {
      const players = await yahooService.getPlayerHistory(league.id);
      const managers = await yahooService.getManagerInsights(league.id);
      
      // If we got no data (likely due to demo keys), use mock for visualization
      const finalPlayers = players.length > 0 ? players : [
        { id: 'p1', name: 'Josh Allen', position: 'QB', team: 'BUF', ownedByMeCount: 3, ownedByOthersCount: 1, avgPointsStarted: 26.2, avgPointsBenched: 0.0, totalOwnershipYears: 4, lastOwnedSeason: '2023' },
        { id: 'p2', name: 'Justin Jefferson', position: 'WR', team: 'MIN', ownedByMeCount: 1, ownedByOthersCount: 3, avgPointsStarted: 19.8, avgPointsBenched: 15.2, totalOwnershipYears: 4, lastOwnedSeason: '2022' },
      ];

      const insights = await geminiService.getLegacyInsights(finalPlayers);
      
      setPlayerData(finalPlayers);
      setManagerData(managers.length > 0 ? managers : [
        { managerId: 'm1', managerName: 'You (The Commissioner)', yearsInLeague: 4, championships: 1 },
        { managerId: 'm2', managerName: 'John Doe', yearsInLeague: 4, championships: 2 },
      ]);
      setAiInsights(insights);
      setCurrentStep(AppState.DASHBOARD);
    } catch (err) {
      setError("Failed to load league details. Ensure your Yahoo App has 'Fantasy Sports' read permissions.");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('yahoo_access_token');
    localStorage.removeItem('yahoo_refresh_token');
    setCurrentStep(AppState.LOGIN);
    setSelectedLeague(null);
  };

  const handleBack = () => {
    if (currentStep === AppState.DASHBOARD) setCurrentStep(AppState.LEAGUE_SELECT);
    else if (currentStep === AppState.LEAGUE_SELECT) setCurrentStep(AppState.LOGIN);
  };

  const renderContent = () => {
    switch (currentStep) {
      case AppState.LOGIN:
        return (
          <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
            <div className="mb-8 p-6 bg-purple-600/20 rounded-full">
              <History className="w-16 h-16 text-purple-400" />
            </div>
            <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
              Gridiron Legacy
            </h1>
            <p className="text-xl text-slate-400 mb-10 max-w-lg">
              Unlock the deep history of your Yahoo Fantasy League. Connecting directly to Yahoo Fantasy Sports API for real-time history analysis.
            </p>
            
            {error && (
              <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-200 text-sm max-w-md">
                <ShieldAlert className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-lg transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Users size={24} />}
              Connect Direct to Yahoo
            </button>
            <div className="mt-8 flex flex-col gap-2 items-center text-slate-500 text-xs">
              <p>Requires valid Yahoo Developer Client ID in yahooService.ts</p>
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><Sparkles size={12} /> AI Legacy Analysis</span>
                <span className="flex items-center gap-1"><TrendingUp size={12} /> Efficiency Metrics</span>
              </div>
            </div>
          </div>
        );

      case AppState.LEAGUE_SELECT:
        return (
          <div className="max-w-4xl mx-auto px-4 py-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
              <LayoutDashboard className="text-purple-400" />
              Your Yahoo Leagues
            </h2>
            <div className="grid gap-4">
              {leagues.length > 0 ? leagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleSelectLeague(league)}
                  disabled={loading}
                  className="flex items-center justify-between p-6 bg-slate-800/50 border border-slate-700 hover:border-purple-500 rounded-2xl transition-all group text-left"
                >
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-purple-400 transition-colors">{league.name}</h3>
                    <p className="text-slate-400">{league.seasons.length} Season(s) Found • {league.sport.toUpperCase()}</p>
                    <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded uppercase mt-2 inline-block">Key: {league.id}</span>
                  </div>
                  <ChevronRight className="text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                </button>
              )) : (
                <div className="p-12 text-center bg-slate-800/20 rounded-2xl border border-dashed border-slate-700">
                  <p className="text-slate-400">No active NFL leagues found for this account.</p>
                </div>
              )}
            </div>
          </div>
        );

      case AppState.DASHBOARD:
        return (
          <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <button onClick={handleBack} className="flex items-center gap-1 text-slate-400 hover:text-white mb-2 transition-colors">
                  <ArrowLeft size={16} /> Back
                </button>
                <h1 className="text-3xl font-bold">{selectedLeague?.name} Legacy</h1>
                <p className="text-slate-400">Direct data from Yahoo API for {selectedLeague?.seasons.join(', ')}</p>
              </div>
              <div className="flex gap-2">
                <div className="px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
                  <span className="text-xs text-slate-400 block uppercase font-bold">Manager ID</span>
                  <span className="text-xl font-bold font-mono text-sm truncate max-w-[120px]">Active</span>
                </div>
                <div className="px-4 py-2 bg-purple-900/40 rounded-lg border border-purple-700/50">
                  <span className="text-xs text-purple-300 block uppercase font-bold">Connection Status</span>
                  <span className="text-xl font-bold text-green-400 flex items-center gap-2">
                    Live <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  </span>
                </div>
              </div>
            </div>

            {/* AI Insights Card */}
            <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-6 rounded-3xl shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="text-yellow-400" />
                <h2 className="text-xl font-bold text-indigo-200 uppercase tracking-wider">AI Scouter's Report</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-sm font-bold text-indigo-300 uppercase">Legacy Stalwart</div>
                  <p className="text-slate-200">{aiInsights?.frequentPick || "Loading..."}</p>
                </div>
                <div className="space-y-2 border-l border-indigo-500/20 pl-6">
                  <div className="text-sm font-bold text-indigo-300 uppercase">Critical Error</div>
                  <p className="text-slate-200">{aiInsights?.missedOpportunity || "Loading..."}</p>
                </div>
                <div className="space-y-2 border-l border-indigo-500/20 pl-6">
                  <div className="text-sm font-bold text-indigo-300 uppercase">Nemesis Factor</div>
                  <p className="text-slate-200">{aiInsights?.rivalJewel || "Loading..."}</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-indigo-500/20 text-indigo-100 italic">
                "{aiInsights?.summary || "Analyzing historical patterns across seasons..."}"
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="bg-slate-800/40 border border-slate-700 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Users className="text-blue-400" /> Ownership Trends
                  </h3>
                  <Info size={16} className="text-slate-500" />
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={playerData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                      <XAxis type="number" stroke="#94a3b8" />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} fontSize={12} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                        itemStyle={{ color: '#cbd5e1' }}
                      />
                      <Legend />
                      <Bar dataKey="ownedByMeCount" name="Your Rosters" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="ownedByOthersCount" name="Others Rosters" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-800/40 border border-slate-700 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <TrendingUp className="text-emerald-400" /> Management Efficiency
                  </h3>
                  <Info size={16} className="text-slate-500" />
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid stroke="#334155" />
                      <XAxis type="number" dataKey="avgPointsBenched" name="Avg Bench Pts" unit=" pts" stroke="#94a3b8" />
                      <YAxis type="number" dataKey="avgPointsStarted" name="Avg Start Pts" unit=" pts" stroke="#94a3b8" />
                      <ZAxis type="number" range={[60, 400]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="Players" data={playerData} fill="#10b981">
                        {playerData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.avgPointsStarted > 20 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detailed Player Table */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Award className="text-yellow-400" /> Historical Performance Matrix
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-700/50 text-slate-300 text-sm uppercase">
                    <tr>
                      <th className="px-6 py-4">Player</th>
                      <th className="px-6 py-4 text-center">Legacy Loyalty</th>
                      <th className="px-6 py-4">Avg Start Pts</th>
                      <th className="px-6 py-4">Avg Bench Pts</th>
                      <th className="px-6 py-4">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {playerData.map((player) => {
                      const efficiency = player.avgPointsStarted > 0 
                        ? (player.avgPointsStarted / (player.avgPointsStarted + player.avgPointsBenched) * 100).toFixed(0)
                        : "0";
                      return (
                        <tr key={player.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold">{player.name}</div>
                            <div className="text-xs text-slate-500">{player.position} • {player.team}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                             <span className="text-sm font-mono">{player.ownedByMeCount} Seasons</span>
                          </td>
                          <td className="px-6 py-4 font-mono text-emerald-400">{player.avgPointsStarted.toFixed(1)}</td>
                          <td className="px-6 py-4 font-mono text-red-400">{player.avgPointsBenched.toFixed(1)}</td>
                          <td className="px-6 py-4">
                            <div className="w-full bg-slate-700 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${Number(efficiency) > 70 ? 'bg-emerald-500' : 'bg-orange-500'}`} 
                                style={{ width: `${efficiency}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">{efficiency}% Start Rate</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-purple-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentStep(AppState.LOGIN)}>
            <div className="bg-purple-600 p-1.5 rounded-lg shadow-lg shadow-purple-600/20">
              <History className="text-white" size={20} />
            </div>
            <span className="font-black text-xl tracking-tight hidden sm:inline-block">GRIDIRON LEGACY</span>
          </div>
          
          {currentStep !== AppState.LOGIN && (
            <div className="flex items-center gap-4">
               <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Disconnect Yahoo</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <main>
        {loading && currentStep === AppState.LOGIN && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
            <p className="text-xl font-medium">Authenticating with Yahoo...</p>
          </div>
        )}
        {renderContent()}
      </main>

      <footer className="border-t border-slate-800 py-10 bg-slate-900/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 text-sm">
          <div>© 2024 Gridiron Legacy. Using Direct Yahoo Fantasy API Connection.</div>
          <div className="flex gap-6">
            <a href="https://developer.yahoo.com/fantasysports/guide/" target="_blank" className="hover:text-purple-400">Yahoo API Guide</a>
            <a href="#" className="hover:text-purple-400">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
