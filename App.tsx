import React, { useState, useEffect, useRef } from 'react';
import { AppState, League, PlayerStats, ManagerHistory, ManagerOwnershipData, ManagerTendency, FetchProgress, SeasonDraftData } from './types';
import * as yahooService from './services/yahooService';
import * as geminiService from './services/geminiService';
import ManagerInsights from './components/ManagerInsights';
import DraftResults from './components/DraftResults';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  LayoutDashboard, History, Users, Award,
  ChevronRight, ArrowLeft, LogOut, Loader2, Sparkles,
  Trophy, TrendingUp, Info, ShieldAlert, BarChart3, ClipboardList
} from 'lucide-react';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppState>(AppState.LOGIN);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [playerData, setPlayerData] = useState<PlayerStats[]>([]);
  const [managerData, setManagerData] = useState<ManagerHistory[]>([]);
  const [managerOwnership, setManagerOwnership] = useState<ManagerOwnershipData[]>([]);
  const [managerTendencies, setManagerTendencies] = useState<ManagerTendency[]>([]);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  const [draftData, setDraftData] = useState<SeasonDraftData[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'draft'>('overview');

  // ✅ Prevent double-processing with ref
  const isProcessingOAuth = useRef(false);
  const hasProcessedCode = useRef(false);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Prevent concurrent execution
      if (isProcessingOAuth.current) {
        console.log('OAuth already being processed, skipping...');
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      // ✅ Check if we already have valid tokens FIRST
      const existingToken = localStorage.getItem('yahoo_access_token');
      const expiresAt = localStorage.getItem('yahoo_access_token_expires');
      
      if (existingToken && expiresAt && Date.now() < Number(expiresAt)) {
        console.log('Valid token already exists, loading leagues...');
        try {
          const fetchedLeagues = await yahooService.getLeagues();
          console.log('Leagues fetched:', fetchedLeagues);

          if (fetchedLeagues && fetchedLeagues.length > 0) {
            setLeagues(fetchedLeagues);
            setCurrentStep(AppState.LEAGUE_SELECT);
          } else {
            console.warn('No leagues returned from API');
            setError('No leagues found. Make sure you have active Yahoo Fantasy leagues.');
            setCurrentStep(AppState.LOGIN);
          }

          // Clean up URL if there's a code
          if (code) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (err: any) {
          console.error('Failed to load leagues:', err);
          setError(`Failed to load leagues: ${err.message}`);
          setCurrentStep(AppState.LOGIN);
        }
        return;
      }

      // ✅ Only process code if we have one AND haven't processed it yet
      if (code && !hasProcessedCode.current) {
        isProcessingOAuth.current = true;
        hasProcessedCode.current = true;
        setLoading(true);
        
        try {
          console.log('Exchanging OAuth code...');
          
          // ❌ DON'T store tokens here - exchangeCodeForToken already does it
          await yahooService.exchangeCodeForToken(code);
          
          console.log('Token exchange successful, fetching leagues...');
          const fetchedLeagues = await yahooService.getLeagues();
          console.log('Leagues fetched after OAuth:', fetchedLeagues);

          if (fetchedLeagues && fetchedLeagues.length > 0) {
            setLeagues(fetchedLeagues);
            setCurrentStep(AppState.LEAGUE_SELECT);
            setError(null);
          } else {
            console.warn('No leagues found after successful OAuth');
            setError('Authentication successful but no leagues found. Make sure you have active Yahoo Fantasy Football leagues.');
          }
        } catch (err: any) {
          console.error('OAuth exchange error:', err);
          setError(`Authentication failed: ${err.message}`);
          
          // Clean URL on error
          window.history.replaceState({}, document.title, window.location.pathname);
        } finally {
          setLoading(false);
          isProcessingOAuth.current = false;
        }
      }
    };

    handleOAuthCallback();
  }, []); // Only run once on mount

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const authUrl = await yahooService.getAuthUrl();
      console.log('Redirecting to Yahoo OAuth:', authUrl);
      window.location.href = authUrl;
    } catch (err: any) {
      console.error('Failed to get auth URL:', err);
      setError('Could not connect to the backend server. Make sure it is running on port 3001.');
      setLoading(false);
    }
  };

  const handleSelectLeague = async (league: League) => {
    setLoading(true);
    setSelectedLeague(league);
    setError(null);
    
    try {
      console.log('Loading league data for:', league.name);
      const players = await yahooService.getPlayerHistory(league.id);
      const managers = await yahooService.getManagerInsights(league.id);
      
      const finalPlayers = players.length > 0 ? players : [
        { id: 'p1', name: 'Josh Allen', position: 'QB', team: 'BUF', ownedByMeCount: 3, ownedByOthersCount: 1, avgPointsStarted: 26.2, avgPointsBenched: 0.0, totalOwnershipYears: 4, lastOwnedSeason: '2023' },
        { id: 'p2', name: 'Justin Jefferson', position: 'WR', team: 'MIN', ownedByMeCount: 1, ownedByOthersCount: 3, avgPointsStarted: 19.8, avgPointsBenched: 15.2, totalOwnershipYears: 4, lastOwnedSeason: '2022' },
        { id: 'p3', name: 'Travis Kelce', position: 'TE', team: 'KC', ownedByMeCount: 0, ownedByOthersCount: 4, avgPointsStarted: 18.2, avgPointsBenched: 0.0, totalOwnershipYears: 4, lastOwnedSeason: '2023' },
      ];

      console.log('Using fallback insights (Gemini disabled)...');
      const insights = {
        frequentPick: finalPlayers[0]?.name ? `${finalPlayers[0].name} - Your go-to player` : "Loading...",
        missedOpportunity: "Good start/sit decisions overall",
        rivalJewel: "Analysis in progress",
        summary: "Manager insights available in the dedicated tab."
      };

      setPlayerData(finalPlayers);
      setManagerData(managers.length > 0 ? managers : [
        { managerId: 'm1', managerName: 'You (The Commissioner)', yearsInLeague: 4, championships: 1 },
        { managerId: 'm2', managerName: 'League Rival', yearsInLeague: 4, championships: 2 },
      ]);
      setAiInsights(insights);
      setDraftData([]);
      setDashboardTab('overview');
      setCurrentStep(AppState.DASHBOARD);

      // Kick off draft history fetch in the background (non-blocking)
      setDraftLoading(true);
      yahooService.getMultiSeasonDraftResults(league.id).then(data => {
        setDraftData(data);
      }).catch(err => {
        console.warn('Draft history fetch failed:', err);
      }).finally(() => {
        setDraftLoading(false);
      });
    } catch (err: any) {
      console.error('Failed to load league details:', err);
      setError(`Failed to load league details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewManagerInsights = async () => {
    if (!selectedLeague) return;

    setLoading(true);
    setError(null);
    setFetchProgress(null);
    setCurrentStep(AppState.MANAGER_INSIGHTS);

    try {
      console.log('Loading multi-season manager ownership data...');

      // Use new multi-season fetching function
      const { allSeasonData, aggregatedOwnership, errors } = await yahooService.getMultiSeasonRosters(
        selectedLeague.id,
        {
          onProgress: (progress) => {
            setFetchProgress(progress);
          }
        }
      );

      // Log any non-critical errors
      if (errors.length > 0) {
        console.warn('Some seasons had errors:', errors);
      }

      console.log('📊 Aggregated ownership data:', aggregatedOwnership);
      console.log('📊 Number of managers:', aggregatedOwnership.length);
      aggregatedOwnership.forEach(manager => {
        console.log(`  Manager: ${manager.managerName}, Players: ${manager.players.length}, Seasons: ${manager.seasonsTracked?.join(', ')}`);
      });

      setManagerOwnership(aggregatedOwnership);
      setFetchProgress(null);

      // Check for cached AI tendencies and identify which managers need analysis
      console.log('💾 Checking for cached AI tendencies...');
      console.log(`📊 allSeasonData.length = ${allSeasonData.length} (if >0, new data was fetched)`);
      let cachedTendencies: ManagerTendency[] = [];
      const newDataFetched = allSeasonData.length > 0;

      try {
        const cacheRes = await fetch('http://localhost:3001/api/cache/tendencies');
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          cachedTendencies = cacheData.tendencies || [];
          console.log(`💾 Found ${cachedTendencies.length} cached tendencies`);
        }
      } catch (err) {
        console.warn('⚠️ Could not check tendencies cache:', err);
      }

      // Find managers missing AI analysis (either no cache entry or basic fallback text)
      const managersNeedingAnalysis = newDataFetched
        ? aggregatedOwnership // If new data fetched, regenerate all
        : aggregatedOwnership.filter(m => {
            const cached = cachedTendencies.find(t => t.managerId === m.managerId);
            if (!cached) return true; // Not cached at all

            // Detect fallback patterns (both frontend and backend generated)
            const analysis = cached.analysis || '';
            const isFrontendFallback = analysis.includes('Prefers') && analysis.includes('positions. Loyalty:');
            const isBackendFallback = analysis.includes('Favors') && analysis.includes('Loyalty score:');
            const isFallbackText = isFrontendFallback || isBackendFallback;

            if (isFallbackText) {
              console.log(`  📝 ${m.managerName} has fallback text, needs AI regeneration`);
            }
            return isFallbackText;
          });

      console.log(`🔄 newDataFetched=${newDataFetched}, managersNeedingAnalysis=${managersNeedingAnalysis.length}`);

      console.log(`🔍 ${managersNeedingAnalysis.length} managers need AI analysis`);

      let finalTendencies: ManagerTendency[] = [];

      if (managersNeedingAnalysis.length === 0) {
        // All managers have valid cached tendencies
        console.log('✅ Using fully cached AI tendencies');
        finalTendencies = cachedTendencies;
      } else {
        // Need to generate tendencies for some/all managers
        console.log(`🤖 Requesting AI analysis for ${managersNeedingAnalysis.length} managers...`);

        try {
          const newTendencies = await geminiService.getManagerTendencies(managersNeedingAnalysis);
          console.log(`✅ Received ${newTendencies.length} AI tendencies`);

          // Merge: use new tendencies for analyzed managers, keep cached for others
          const newTendencyMap = new Map(newTendencies.map(t => [t.managerId, t]));
          finalTendencies = aggregatedOwnership.map(manager => {
            // Prefer newly generated, then cached, then generate basic fallback
            if (newTendencyMap.has(manager.managerId)) {
              return newTendencyMap.get(manager.managerId)!;
            }
            const cached = cachedTendencies.find(t => t.managerId === manager.managerId);
            if (cached) {
              return cached;
            }
            // Fallback for any remaining
            const positionCounts: { [key: string]: number } = {};
            const players = manager.players || [];
            players.forEach(p => {
              if (p.position) {
                positionCounts[p.position] = (positionCounts[p.position] || 0) + (p.timesOwned || 0);
              }
            });
            const topPositions = Object.entries(positionCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([pos]) => pos);
            const loyaltyScore = Math.round((players.filter(p => (p.timesOwned || 0) > 1).length / Math.max(players.length, 1)) * 100);
            return {
              managerId: manager.managerId,
              managerName: manager.managerName,
              analysis: `Prefers ${topPositions.join(', ')} positions. Loyalty: ${loyaltyScore}%`,
              topPositions,
              loyaltyScore
            };
          });

          // Cache all tendencies (including newly generated ones)
          try {
            await fetch('http://localhost:3001/api/cache/tendencies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tendencies: finalTendencies })
            });
            console.log('💾 AI tendencies cached');
          } catch (cacheErr) {
            console.warn('⚠️ Failed to cache tendencies:', cacheErr);
          }
        } catch (geminiErr) {
          console.warn('⚠️ Gemini error, using cached + basic fallbacks:', geminiErr);
          // Use whatever we have cached, generate basic for the rest
          finalTendencies = aggregatedOwnership.map(manager => {
            const cached = cachedTendencies.find(t => t.managerId === manager.managerId);
            if (cached) return cached;

            const positionCounts: { [key: string]: number } = {};
            const players = manager.players || [];
            players.forEach(p => {
              if (p.position) {
                positionCounts[p.position] = (positionCounts[p.position] || 0) + (p.timesOwned || 0);
              }
            });
            const topPositions = Object.entries(positionCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([pos]) => pos);
            const loyaltyScore = Math.round((players.filter(p => (p.timesOwned || 0) > 1).length / Math.max(players.length, 1)) * 100);
            return {
              managerId: manager.managerId,
              managerName: manager.managerName,
              analysis: `Prefers ${topPositions.join(', ')} positions. Loyalty: ${loyaltyScore}%`,
              topPositions,
              loyaltyScore
            };
          });
        }
      }

      setManagerTendencies(finalTendencies);

      console.log('✅ Multi-season manager insights loaded');
    } catch (err: any) {
      console.error('Failed to load manager insights:', err);
      setError(`Failed to load manager insights: ${err.message}`);
      setCurrentStep(AppState.DASHBOARD);
    } finally {
      setLoading(false);
      setFetchProgress(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('yahoo_access_token');
    localStorage.removeItem('yahoo_refresh_token');
    localStorage.removeItem('yahoo_access_token_expires');
    hasProcessedCode.current = false; // Reset for next login
    setCurrentStep(AppState.LOGIN);
    setSelectedLeague(null);
    setLeagues([]);
    setError(null);
  };

  const handleBack = () => {
    if (currentStep === AppState.MANAGER_INSIGHTS) setCurrentStep(AppState.DASHBOARD);
    else if (currentStep === AppState.DASHBOARD) setCurrentStep(AppState.LEAGUE_SELECT);
    else if (currentStep === AppState.LEAGUE_SELECT) setCurrentStep(AppState.LOGIN);
  };

  const renderContent = () => {
    switch (currentStep) {
      case AppState.LOGIN:
        return (
          <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
            <div className="mb-8 p-6 bg-indigo-600/20 rounded-full border border-indigo-500/30 animate-pulse">
              <History className="w-16 h-16 text-indigo-400" />
            </div>
            <h1 className="text-5xl font-black mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              GRIDIRON LEGACY
            </h1>
            <p className="text-xl text-slate-400 mb-10 max-w-lg font-light leading-relaxed">
              Experience the definitive history of your Yahoo Fantasy Football league through the lens of advanced AI analysis.
            </p>
            
            {error && (
              <div className="mb-8 p-4 bg-red-900/30 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-200 text-sm max-w-md animate-in fade-in slide-in-from-bottom-2">
                <ShieldAlert className="shrink-0 text-red-400" />
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="group relative flex items-center gap-3 px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-xl transition-all shadow-2xl shadow-indigo-600/40 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Users size={24} className="group-hover:scale-110 transition-transform" />}
              Connect Yahoo Account
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
            </button>
            <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-8 text-slate-500">
              <div className="flex flex-col items-center gap-2">
                <Trophy className="text-yellow-500/50" size={24} />
                <span className="text-xs uppercase font-bold tracking-widest">History</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Sparkles className="text-purple-500/50" size={24} />
                <span className="text-xs uppercase font-bold tracking-widest">AI Scouter</span>
              </div>
              <div className="flex flex-col items-center gap-2 hidden md:flex">
                <TrendingUp className="text-emerald-500/50" size={24} />
                <span className="text-xs uppercase font-bold tracking-widest">Efficiency</span>
              </div>
            </div>
          </div>
        );

      case AppState.LEAGUE_SELECT:
        return (
          <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-4xl font-black tracking-tight flex items-center gap-3">
                <LayoutDashboard className="text-indigo-400" />
                SELECT LEAGUE
              </h2>
            </div>
            <div className="grid gap-6">
              {leagues.length > 0 ? leagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleSelectLeague(league)}
                  disabled={loading}
                  className="flex items-center justify-between p-8 bg-slate-800/40 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/60 rounded-3xl transition-all group text-left shadow-lg"
                >
                  <div className="flex gap-6 items-center">
                    <div className="w-16 h-16 bg-indigo-900/30 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:scale-105 transition-transform">
                       <Award className="text-indigo-400" size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold group-hover:text-indigo-400 transition-colors">{league.name || 'Unnamed League'}</h3>
                      <p className="text-slate-400 font-medium">NFL • {league.seasons?.join(', ') || 'N/A'}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-md font-mono border border-slate-600">ID: {league.id}</span>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Historical Data Active</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-2 transition-all" size={32} />
                </button>
              )) : (
                <div className="p-16 text-center bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">Looking for your active gridiron battles...</p>
                </div>
              )}
            </div>
          </div>
        );

      case AppState.DASHBOARD:
        return (
          <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-24">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div>
                <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 font-bold text-sm uppercase tracking-widest transition-colors">
                  <ArrowLeft size={16} /> Back to Leagues
                </button>
                <h1 className="text-5xl font-black tracking-tighter text-white">{selectedLeague?.name.toUpperCase()}</h1>
                <p className="text-indigo-400 font-bold uppercase tracking-[0.2em] text-sm flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Historical Legacy Dashboard
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleViewManagerInsights}
                  className="group flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl font-bold transition-all shadow-xl shadow-purple-600/20"
                >
                  <BarChart3 size={20} className="group-hover:scale-110 transition-transform" />
                  Manager Insights
                </button>
                <div className="px-6 py-3 bg-slate-800/80 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-sm">
                  <span className="text-[10px] text-slate-500 block uppercase font-black tracking-widest mb-1">Status</span>
                  <span className="text-lg font-bold text-green-400 flex items-center gap-2">
                    Synced <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  </span>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-2 border-b border-slate-700/50 pb-0">
              <button
                onClick={() => setDashboardTab('overview')}
                className={`flex items-center gap-2 px-5 py-3 font-bold text-sm uppercase tracking-widest transition-all border-b-2 -mb-px ${dashboardTab === 'overview' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                <BarChart3 size={16} />
                Overview
              </button>
              <button
                onClick={() => setDashboardTab('draft')}
                className={`flex items-center gap-2 px-5 py-3 font-bold text-sm uppercase tracking-widest transition-all border-b-2 -mb-px ${dashboardTab === 'draft' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                <ClipboardList size={16} />
                Draft History
                {draftLoading && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                {!draftLoading && draftData.length > 0 && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-black border border-indigo-500/30">
                    {draftData.length}
                  </span>
                )}
              </button>
            </div>

            {/* Overview Tab */}
            {dashboardTab === 'overview' && (
              <>
                {/* AI Insights Card */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600/20 via-slate-900/90 to-purple-600/20 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-xl group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Sparkles size={120} className="text-indigo-400" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                        <Sparkles className="text-indigo-400" size={24} />
                      </div>
                      <h2 className="text-2xl font-black text-white uppercase tracking-tighter">AI Scouter's Legacy Report</h2>
                    </div>
                    <div className="grid md:grid-cols-3 gap-10">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                            <Trophy size={12} className="text-emerald-400" />
                          </div>
                          <div className="text-xs font-black text-indigo-300 uppercase tracking-widest">Stalwart Pick</div>
                        </div>
                        <p className="text-lg text-slate-200 font-medium leading-snug">{aiInsights?.frequentPick || "Analyzing rosters..."}</p>
                      </div>
                      <div className="space-y-3 border-l border-white/5 pl-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                            <TrendingUp size={12} className="text-red-400" />
                          </div>
                          <div className="text-xs font-black text-indigo-300 uppercase tracking-widest">Efficiency Gap</div>
                        </div>
                        <p className="text-lg text-slate-200 font-medium leading-snug">{aiInsights?.missedOpportunity || "Crunching stats..."}</p>
                      </div>
                      <div className="space-y-3 border-l border-white/5 pl-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                            <Award size={12} className="text-purple-400" />
                          </div>
                          <div className="text-xs font-black text-indigo-300 uppercase tracking-widest">The Nemesis</div>
                        </div>
                        <p className="text-lg text-slate-200 font-medium leading-snug">{aiInsights?.rivalJewel || "Identifying rivals..."}</p>
                      </div>
                    </div>
                    <div className="mt-10 pt-8 border-t border-white/5">
                      <div className="text-2xl font-light text-indigo-100 italic leading-relaxed">
                        "{aiInsights?.summary || "Deep-diving into league history to reveal your management identity..."}"
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid lg:grid-cols-2 gap-8">
                  <div className="bg-slate-800/40 border border-slate-700/50 p-8 rounded-3xl shadow-lg backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-blue-500/20 rounded-lg"><Users className="text-blue-400" size={20} /></div>
                        OWNERSHIP DENSITY
                      </h3>
                      <div className="p-1.5 hover:bg-slate-700 rounded-full cursor-help transition-colors">
                        <Info size={18} className="text-slate-500" />
                      </div>
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={playerData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                          <XAxis type="number" stroke="#64748b" axisLine={false} tickLine={false} fontSize={10} />
                          <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} fontSize={12} fontWeight="bold" axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                            itemStyle={{ color: '#cbd5e1', fontSize: '12px' }}
                            cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                          />
                          <Legend verticalAlign="top" align="right" iconType="circle" />
                          <Bar dataKey="ownedByMeCount" name="Your Teams" fill="#6366f1" radius={[0, 10, 10, 0]} barSize={20} />
                          <Bar dataKey="ownedByOthersCount" name="Opponents" fill="#3b82f6" radius={[0, 10, 10, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/50 p-8 rounded-3xl shadow-lg backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-emerald-500/20 rounded-lg"><TrendingUp className="text-emerald-400" size={20} /></div>
                        MANAGEMENT PRECISION
                      </h3>
                      <div className="p-1.5 hover:bg-slate-700 rounded-full cursor-help transition-colors">
                        <Info size={18} className="text-slate-500" />
                      </div>
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <CartesianGrid stroke="#334155" strokeDasharray="5 5" />
                          <XAxis type="number" dataKey="avgPointsBenched" name="Avg Bench Pts" unit=" pts" stroke="#64748b" axisLine={false} tickLine={false} fontSize={10} label={{ value: 'Efficiency Penalty (Bench Pts)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 10 }} />
                          <YAxis type="number" dataKey="avgPointsStarted" name="Avg Start Pts" unit=" pts" stroke="#64748b" axisLine={false} tickLine={false} fontSize={10} label={{ value: 'Start Success', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                          <ZAxis type="number" range={[100, 1000]} />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl">
                                    <p className="font-black text-indigo-400">{data.name}</p>
                                    <p className="text-sm text-slate-300">Started: {data.avgPointsStarted} pts</p>
                                    <p className="text-sm text-slate-500">Benched: {data.avgPointsBenched} pts</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Scatter name="Players" data={playerData}>
                            {playerData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.avgPointsStarted > 20 ? '#10b981' : '#f43f5e'} stroke="white" strokeWidth={2} />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Detailed Player Table */}
                <div className="bg-slate-800/20 border border-slate-700/50 rounded-[2rem] overflow-hidden shadow-2xl backdrop-blur-sm">
                  <div className="p-8 border-b border-slate-700/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="text-3xl font-black flex items-center gap-4 tracking-tighter uppercase">
                      <div className="p-3 bg-yellow-500/20 rounded-2xl"><Award className="text-yellow-400" size={24} /></div>
                      Historical Matrix
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/50 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">
                        <tr>
                          <th className="px-10 py-6">Player Identity</th>
                          <th className="px-6 py-6 text-center">Legacy Loyalty</th>
                          <th className="px-6 py-6 text-center">Scoring Power</th>
                          <th className="px-6 py-6 text-center">Bench Impact</th>
                          <th className="px-10 py-6">Decision Efficiency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {playerData.map((player) => {
                          const avgStarted = player.avgPointsStarted ?? 0;
                          const avgBenched = player.avgPointsBenched ?? 0;
                          const efficiency = avgStarted > 0
                            ? (avgStarted / (avgStarted + avgBenched) * 100).toFixed(0)
                            : "0";
                          return (
                            <tr key={player.id} className="hover:bg-indigo-500/5 transition-all duration-300 group">
                              <td className="px-10 py-8">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center font-black text-lg group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                                    {player.name ? player.name.split(' ').map(n => n[0]).join('') : '??'}
                                  </div>
                                  <div>
                                    <div className="font-black text-lg text-white group-hover:text-indigo-100">{player.name || 'Unknown Player'}</div>
                                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{player.position || 'N/A'} • {player.team || 'FA'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-8 text-center">
                                <div className="inline-block px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm font-black text-indigo-400">
                                  {player.ownedByMeCount ?? 0} SEASONS
                                </div>
                              </td>
                              <td className="px-6 py-8 text-center font-black text-xl text-emerald-400">{avgStarted.toFixed(1)}</td>
                              <td className="px-6 py-8 text-center font-black text-xl text-red-500/70">{avgBenched.toFixed(1)}</td>
                              <td className="px-10 py-8">
                                <div className="flex items-center gap-4">
                                  <div className="flex-1 bg-slate-700/50 rounded-full h-3 p-0.5">
                                    <div
                                      className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(0,0,0,0.3)] ${Number(efficiency) > 75 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-orange-600 to-orange-400'}`}
                                      style={{ width: `${efficiency}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-black text-white w-10">{efficiency}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Draft History Tab */}
            {dashboardTab === 'draft' && (
              <div className="pt-2">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/20">
                    <ClipboardList className="text-indigo-400" size={24} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter uppercase text-white">Draft History</h2>
                    <p className="text-slate-500 text-sm font-medium mt-0.5">All-time draft results — expand a year to view the grid</p>
                  </div>
                </div>
                <DraftResults draftSeasons={draftData} loading={draftLoading} />
              </div>
            )}
          </div>
        );

      case AppState.MANAGER_INSIGHTS:
        console.log('Rendering MANAGER_INSIGHTS view', {
          ownershipCount: managerOwnership.length,
          tendenciesCount: managerTendencies.length,
          loading,
          hasError: !!error
        });
        return (
          <div className="max-w-7xl mx-auto px-4 py-8">
            <button onClick={handleBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 font-bold text-sm uppercase tracking-widest transition-colors">
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
            <ManagerInsights
              ownershipData={managerOwnership}
              tendencies={managerTendencies}
              loading={loading}
              fetchProgress={fetchProgress}
            />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-indigo-500/30">
      <nav className="border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCurrentStep(AppState.LOGIN)}>
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-2.5 rounded-2xl shadow-2xl shadow-indigo-600/20 group-hover:scale-110 transition-transform">
              <History className="text-white" size={24} />
            </div>
            <span className="font-black text-2xl tracking-tighter text-white group-hover:text-indigo-400 transition-colors">GRIDIRON LEGACY</span>
          </div>
          
          {currentStep !== AppState.LOGIN && (
            <div className="flex items-center gap-6">
               <button 
                onClick={handleLogout}
                className="group flex items-center gap-2 text-slate-500 hover:text-white transition-colors font-black text-xs uppercase tracking-widest"
              >
                <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
                Disconnect
              </button>
            </div>
          )}
        </div>
      </nav>

      <main>
        {loading && currentStep === AppState.LOGIN && (
          <div className="fixed inset-0 bg-[#020617]/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-in fade-in">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <History className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={32} />
            </div>
            <p className="text-2xl font-black mt-8 tracking-tighter text-white uppercase italic">Contacting League Central...</p>
            <p className="text-slate-500 mt-2 font-medium">Securing OAuth 2.0 Handshake</p>
          </div>
        )}
        {renderContent()}
      </main>

      <footer className="border-t border-white/5 py-12 bg-slate-900/20 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">
            © 2024 GRIDIRON LEGACY • BUILT WITH SECURE PROXY ARCHITECTURE
          </div>
          <div className="flex gap-8">
            <a href="https://developer.yahoo.com/fantasysports/guide/" target="_blank" className="text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors">Yahoo API</a>
            <a href="#" className="text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors">Security</a>
            <a href="#" className="text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
