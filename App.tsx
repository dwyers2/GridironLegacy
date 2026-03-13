import React, { useState, useEffect, useRef } from 'react';
import { AppState, League, PlayerStats, ManagerHistory, ManagerOwnershipData, ManagerTendency, FetchProgress, SeasonDraftData, KeeperSummary } from './types';
import * as yahooService from './services/yahooService';
import * as geminiService from './services/geminiService';
import ManagerInsights from './components/ManagerInsights';
import DraftResults from './components/DraftResults';
import KeeperBoard from './components/KeeperBoard';
import OwnerPositionGrid from './components/OwnerPositionGrid';
import DynastyAlchemyLogo from './components/DynastyAlchemyLogo';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  LayoutDashboard, Users, Award,
  ChevronRight, ArrowLeft, LogOut, Loader2, Sparkles,
  Trophy, TrendingUp, Info, ShieldAlert, BarChart3, ClipboardList, Target, Shield
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
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'draft' | 'ownership' | 'tendencies' | 'owner-position' | 'keepers'>('overview');
  const [keeperSummary, setKeeperSummary] = useState<KeeperSummary | null>(null);
  const [keeperLoading, setKeeperLoading] = useState(false);
  const [refreshingManagers, setRefreshingManagers] = useState<Set<string>>(new Set());

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

  const handleViewManagerInsights = async (targetTab: 'ownership' | 'tendencies' = 'ownership') => {
    if (!selectedLeague) return;

    setLoading(true);
    setError(null);
    setFetchProgress(null);
    setDashboardTab(targetTab);

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
    } finally {
      setLoading(false);
      setFetchProgress(null);
    }
  };

  const handleLoadKeepers = async () => {
    if (!selectedLeague) return;
    setKeeperLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/keepers/summary/${encodeURIComponent(selectedLeague.id)}`);
      if (res.ok) setKeeperSummary(await res.json());
    } catch (e) {
      console.warn('Failed to load keeper summary:', e);
    } finally {
      setKeeperLoading(false);
    }
  };

  const handleRefreshTendency = async (managerId: string) => {
    setRefreshingManagers(prev => new Set(prev).add(managerId));
    try {
      const newTendencies = await geminiService.getManagerTendencies(
        managerOwnership,
        { targetManagerIds: [managerId] }
      );
      const refreshed = newTendencies.find(t => t.managerId === managerId);
      if (refreshed) {
        const updated = managerTendencies.map(t => t.managerId === managerId ? refreshed : t);
        setManagerTendencies(updated);
        await fetch('http://localhost:3001/api/cache/tendencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tendencies: updated })
        });
      }
    } catch (err) {
      console.error('Failed to refresh tendency:', err);
    } finally {
      setRefreshingManagers(prev => {
        const next = new Set(prev);
        next.delete(managerId);
        return next;
      });
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
          <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--obsidian)' }}>

            {/* ── Atmospheric background layers ── */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* Central gold radial bloom */}
              <div style={{
                position: 'absolute', top: '38%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '900px', height: '700px',
                background: 'radial-gradient(ellipse at center, rgba(212,160,23,0.11) 0%, rgba(212,160,23,0.04) 45%, transparent 72%)',
                borderRadius: '50%',
                animation: 'pulse-gold 6s ease-in-out infinite',
              }} />
              {/* Subtle grid — abstracted field lines */}
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'linear-gradient(rgba(212,160,23,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(212,160,23,0.025) 1px, transparent 1px)',
                backgroundSize: '64px 64px',
              }} />
              {/* Grain noise layer */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}>
                <filter id="grain">
                  <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#grain)" />
              </svg>
              {/* Bottom vignette */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
                background: 'linear-gradient(to top, rgba(12,15,22,0.8), transparent)',
              }} />
            </div>

            {/* ── Hero content ── */}
            <div style={{
              position: 'relative', zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center',
              padding: '6rem 1.5rem 4rem',
              minHeight: '82vh',
            }}>



              {/* Wordmark */}
              <div className="animate-fade-up-2" style={{ marginBottom: '0.5rem', lineHeight: 1 }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontWeight: 900,
                  fontSize: 'clamp(3.5rem, 11vw, 7.5rem)',
                  letterSpacing: '0.06em',
                  color: 'var(--text-primary)',
                  textShadow: '0 0 100px rgba(212,160,23,0.15)',
                }}>
                  DYNASTY
                </div>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontWeight: 700,
                  fontSize: 'clamp(1.4rem, 4.5vw, 3rem)',
                  letterSpacing: '0.32em',
                  color: 'var(--gold)',
                  textShadow: '0 0 50px rgba(212,160,23,0.5)',
                }}>
                  ALCHEMY
                </div>
              </div>

              {/* Gold rule divider */}
              <div className="animate-fade-up-2" style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.75rem 0', width: '260px' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(212,160,23,0.35))' }} />
                <div style={{ width: '5px', height: '5px', background: 'var(--gold)', transform: 'rotate(45deg)', flexShrink: 0, boxShadow: '0 0 8px var(--gold)' }} />
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(212,160,23,0.35))' }} />
              </div>

              {/* Tagline */}
              <p className="animate-fade-up-3" style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 300, fontSize: '1rem',
                color: 'var(--text-secondary)',
                maxWidth: '380px', lineHeight: 1.75,
                letterSpacing: '0.015em', marginBottom: '2.5rem',
              }}>
                Uncover the hidden patterns of your league's history. Multi-season analytics, AI manager profiles, and the complete record of your dynasty.
              </p>

              {/* Error state */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.875rem 1.25rem', marginBottom: '1.5rem',
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: '8px', color: '#FCA5A5', fontSize: '0.875rem', maxWidth: '380px',
                }}>
                  <ShieldAlert size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <p style={{ margin: 0 }}>{error}</p>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleLogin}
                disabled={loading}
                className="btn-gold animate-fade-up-3"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '1.1rem 2.75rem',
                  background: 'linear-gradient(145deg, #D4A017 0%, #C8860A 100%)',
                  border: '1px solid rgba(212,160,23,0.5)',
                  borderRadius: '3px',
                  color: '#0C0F16',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700, fontSize: '1rem', letterSpacing: '0.18em',
                  textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.55 : 1,
                  boxShadow: '0 0 40px rgba(212,160,23,0.2), inset 0 1px 0 rgba(255,255,255,0.18)',
                  transition: 'all 0.25s ease',
                }}
              >
                {loading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Users size={20} />}
                Connect Yahoo Account
              </button>

              <p className="animate-fade-up-4" style={{
                marginTop: '1.25rem', fontSize: '0.7rem',
                color: 'var(--text-muted)', letterSpacing: '0.07em',
                fontFamily: "'Outfit', sans-serif",
              }}>
                SECURE OAUTH 2.0 &nbsp;·&nbsp; READ-ONLY &nbsp;·&nbsp; NO DATA STORED
              </p>
            </div>

            {/* ── Feature trinity ── */}
            <div
              className="animate-fade-up-5"
              style={{
                position: 'relative', zIndex: 10,
                maxWidth: '860px', width: '100%', margin: '0 auto',
                padding: '0 1.5rem 6rem',
              }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                border: '1px solid var(--border)',
                borderRadius: '6px', overflow: 'hidden',
                gap: '1px', background: 'var(--border)',
              }}>
                {[
                  {
                    icon: <Trophy size={26} style={{ color: 'var(--gold)' }} />,
                    label: 'LEAGUE LEGACY',
                    desc: 'Every season, every draft, every championship. Your complete franchise history in one place.',
                  },
                  {
                    icon: <Sparkles size={26} style={{ color: 'var(--gold)' }} />,
                    label: 'AI SCOUTING',
                    desc: 'Gemini-powered manager profiles that expose tendencies, blind spots, and competitive archetypes.',
                  },
                  {
                    icon: <TrendingUp size={26} style={{ color: 'var(--gold)' }} />,
                    label: 'PATTERN INTEL',
                    desc: 'Multi-season ownership maps reveal who hoards RBs, who chases upside, and who never adapts.',
                  },
                ].map(({ icon, label, desc }) => (
                  <div
                    key={label}
                    className="feature-card"
                    style={{
                      padding: '2rem 1.75rem',
                      background: 'var(--surface)',
                      display: 'flex', flexDirection: 'column', gap: '1rem',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: '50px', height: '50px',
                      background: 'var(--gold-dim)',
                      border: '1px solid rgba(212,160,23,0.18)',
                      borderRadius: '6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {icon}
                    </div>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700, fontSize: '0.75rem',
                      letterSpacing: '0.2em', color: 'var(--gold)',
                    }}>
                      {label}
                    </div>
                    <p style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: '0.875rem', color: 'var(--text-secondary)',
                      lineHeight: 1.65, fontWeight: 300, margin: 0,
                    }}>
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case AppState.LEAGUE_SELECT:
        return (
          <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="flex items-center justify-between mb-10">
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '2rem', letterSpacing: '0.1em',
                color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <LayoutDashboard style={{ color: 'var(--gold)' }} />
                SELECT LEAGUE
              </h2>
            </div>
            <div className="grid gap-4">
              {leagues.length > 0 ? leagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleSelectLeague(league)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1.75rem 2rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.2s, background 0.2s',
                    opacity: loading ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(212,160,23,0.4)';
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                >
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{
                      width: '56px', height: '56px',
                      background: 'var(--gold-dim)',
                      border: '1px solid rgba(212,160,23,0.2)',
                      borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Award style={{ color: 'var(--gold)' }} size={28} />
                    </div>
                    <div>
                      <h3 style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.04em',
                        color: 'var(--text-primary)', margin: 0,
                      }}>{league.name || 'Unnamed League'}</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0.5rem', fontFamily: "'Outfit', sans-serif" }}>
                        NFL &nbsp;·&nbsp; {league.seasons?.join(', ') || 'N/A'}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.65rem', padding: '0.2rem 0.5rem',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-muted)',
                          borderRadius: '4px', color: 'var(--text-muted)',
                          fontFamily: 'monospace', letterSpacing: '0.05em',
                        }}>ID: {league.id}</span>
                        <span style={{
                          fontSize: '0.65rem', padding: '0.2rem 0.5rem',
                          background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)',
                          borderRadius: '4px', color: 'var(--gold)',
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em',
                        }}>HISTORICAL DATA ACTIVE</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight style={{ color: 'var(--text-muted)', flexShrink: 0 }} size={24} />
                </button>
              )) : (
                <div style={{
                  padding: '4rem 2rem', textAlign: 'center',
                  background: 'var(--surface)', border: '1px dashed var(--border)',
                  borderRadius: '8px',
                }}>
                  <Loader2 style={{ color: 'var(--gold)', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} size={28} />
                  <p style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif", margin: 0 }}>
                    Looking for your active gridiron battles...
                  </p>
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
                <button
                  onClick={handleBack}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em',
                    textTransform: 'uppercase', transition: 'color 0.2s', marginBottom: '1rem',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <ArrowLeft size={14} /> Back to Leagues
                </button>
                <h1 style={{
                  fontFamily: "'Cinzel', serif",
                  fontWeight: 900, fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                  letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0,
                }}>{selectedLeague?.name.toUpperCase()}</h1>
              </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
              {([
                { id: 'overview', icon: <BarChart3 size={15} />, label: 'Overview', onClick: () => setDashboardTab('overview') },
                {
                  id: 'draft', icon: <ClipboardList size={15} />, label: 'Draft History', onClick: () => setDashboardTab('draft'),
                  badge: draftLoading
                    ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
                    : draftData.length > 0
                      ? <span style={{ fontSize: '0.6rem', background: 'var(--gold-dim)', color: 'var(--gold)', padding: '0.1rem 0.4rem', borderRadius: '99px', fontWeight: 700, border: '1px solid rgba(212,160,23,0.25)' }}>{draftData.length}</span>
                      : null,
                },
                { id: 'ownership', icon: <Users size={15} />, label: 'Player Ownership', onClick: () => managerOwnership.length > 0 ? setDashboardTab('ownership') : handleViewManagerInsights('ownership') },
                { id: 'tendencies', icon: <Sparkles size={15} />, label: 'AI Tendencies', onClick: () => managerOwnership.length > 0 ? setDashboardTab('tendencies') : handleViewManagerInsights('tendencies') },
                { id: 'owner-position', icon: <Target size={15} />, label: 'Owner Position', onClick: () => setDashboardTab('owner-position') },
                { id: 'keepers', icon: <Shield size={15} />, label: 'Keepers', onClick: () => { setDashboardTab('keepers'); handleLoadKeepers(); } },
              ] as const).map(({ id, icon, label, onClick, badge }: any) => {
                const active = dashboardTab === id;
                return (
                  <button
                    key={id}
                    onClick={onClick}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.75rem 1.25rem',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                      marginBottom: '-1px',
                      color: active ? 'var(--gold)' : 'var(--text-muted)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em',
                      textTransform: 'uppercase', transition: 'color 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    {icon}{label}{badge}
                  </button>
                );
              })}
            </div>

            {/* Overview Tab */}
            {dashboardTab === 'overview' && (
              <>
                {/* AI Insights Card */}
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '2.5rem', borderRadius: '12px',
                }}>
                  {/* Background glow */}
                  <div style={{
                    position: 'absolute', top: '-60px', right: '-60px',
                    width: '300px', height: '300px',
                    background: 'radial-gradient(circle, rgba(212,160,23,0.07) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', opacity: 0.06, pointerEvents: 'none' }}>
                    <Sparkles size={100} style={{ color: 'var(--gold)' }} />
                  </div>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                      <div style={{
                        padding: '0.5rem', background: 'var(--gold-dim)',
                        border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px',
                      }}>
                        <Sparkles style={{ color: 'var(--gold)' }} size={20} />
                      </div>
                      <h2 style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.14em',
                        color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase',
                      }}>AI Scouter's Legacy Report</h2>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(34,168,95,0.15)', border: '1px solid rgba(34,168,95,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trophy size={11} style={{ color: 'var(--green)' }} />
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase' }}>Stalwart Pick</div>
                        </div>
                        <p style={{ fontSize: '1rem', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", margin: 0, lineHeight: 1.5 }}>{aiInsights?.frequentPick || "Analyzing rosters..."}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingUp size={11} style={{ color: 'var(--red)' }} />
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase' }}>Efficiency Gap</div>
                        </div>
                        <p style={{ fontSize: '1rem', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", margin: 0, lineHeight: 1.5 }}>{aiInsights?.missedOpportunity || "Crunching stats..."}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Award size={11} style={{ color: 'var(--gold)' }} />
                          </div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.18em', color: 'var(--gold)', textTransform: 'uppercase' }}>The Nemesis</div>
                        </div>
                        <p style={{ fontSize: '1rem', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", margin: 0, lineHeight: 1.5 }}>{aiInsights?.rivalJewel || "Identifying rivals..."}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: '2rem', paddingTop: '1.75rem', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 300, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.7, fontFamily: "'Outfit', sans-serif" }}>
                        "{aiInsights?.summary || "Deep-diving into league history to reveal your management identity..."}"
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid lg:grid-cols-2 gap-8">
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '2rem', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                      <h3 style={{
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        fontSize: '1rem', letterSpacing: '0.14em', color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, textTransform: 'uppercase',
                      }}>
                        <div style={{ padding: '0.4rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.18)', borderRadius: '6px' }}>
                          <Users style={{ color: 'var(--gold)' }} size={16} />
                        </div>
                        Ownership Density
                      </h3>
                      <Info size={16} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={playerData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,160,23,0.08)" horizontal={true} vertical={false} />
                          <XAxis type="number" stroke="#3A4A62" axisLine={false} tickLine={false} fontSize={10} />
                          <YAxis dataKey="name" type="category" stroke="#8A9BB5" width={100} fontSize={11} fontWeight="600" axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--surface-2)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                            itemStyle={{ color: 'var(--text-primary)', fontSize: '12px' }}
                            cursor={{ fill: 'rgba(212,160,23,0.06)' }}
                          />
                          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ color: 'var(--text-secondary)', fontSize: '12px' }} />
                          <Bar dataKey="ownedByMeCount" name="Your Teams" fill="#D4A017" radius={[0, 6, 6, 0]} barSize={16} />
                          <Bar dataKey="ownedByOthersCount" name="Opponents" fill="#3A4A62" radius={[0, 6, 6, 0]} barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '2rem', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                      <h3 style={{
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        fontSize: '1rem', letterSpacing: '0.14em', color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, textTransform: 'uppercase',
                      }}>
                        <div style={{ padding: '0.4rem', background: 'rgba(34,168,95,0.1)', border: '1px solid rgba(34,168,95,0.2)', borderRadius: '6px' }}>
                          <TrendingUp style={{ color: 'var(--green)' }} size={16} />
                        </div>
                        Management Precision
                      </h3>
                      <Info size={16} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                    </div>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <CartesianGrid stroke="rgba(212,160,23,0.08)" strokeDasharray="5 5" />
                          <XAxis type="number" dataKey="avgPointsBenched" name="Avg Bench Pts" unit=" pts" stroke="#3A4A62" axisLine={false} tickLine={false} fontSize={10} label={{ value: 'Efficiency Penalty (Bench Pts)', position: 'insideBottom', offset: -10, fill: '#3A4A62', fontSize: 10 }} />
                          <YAxis type="number" dataKey="avgPointsStarted" name="Avg Start Pts" unit=" pts" stroke="#3A4A62" axisLine={false} tickLine={false} fontSize={10} label={{ value: 'Start Success', angle: -90, position: 'insideLeft', fill: '#3A4A62', fontSize: 10 }} />
                          <ZAxis type="number" range={[100, 1000]} />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3', stroke: 'rgba(212,160,23,0.3)' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(212,160,23,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                                    <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: 'var(--gold)', margin: '0 0 0.25rem', letterSpacing: '0.05em' }}>{data.name}</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: '0.1rem 0', fontFamily: "'Outfit', sans-serif" }}>Started: {data.avgPointsStarted} pts</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Benched: {data.avgPointsBenched} pts</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Scatter name="Players" data={playerData}>
                            {playerData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.avgPointsStarted > 20 ? '#22A85F' : '#E05252'} stroke="rgba(12,15,22,0.8)" strokeWidth={2} />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                
              </>
            )}

            {/* Draft History Tab */}
            {dashboardTab === 'draft' && (
              <div className="pt-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px' }}>
                    <ClipboardList style={{ color: 'var(--gold)' }} size={22} />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' }}>Draft History</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.2rem 0 0', fontFamily: "'Outfit', sans-serif" }}>All-time draft results — expand a year to view the grid</p>
                  </div>
                </div>
                <DraftResults draftSeasons={draftData} loading={draftLoading} />
              </div>
            )}

            {/* Keepers Tab */}
            {dashboardTab === 'keepers' && (
              <div className="pt-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px' }}>
                    <Shield style={{ color: 'var(--gold)' }} size={22} />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' }}>
                      {keeperSummary?.upcomingYear ? `${keeperSummary.upcomingYear} Keepers` : 'Keepers'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.2rem 0 0', fontFamily: "'Outfit', sans-serif" }}>
                      Designated keepers for the upcoming draft — mark picks in Draft History to add them here
                    </p>
                  </div>
                </div>
                <KeeperBoard summary={keeperSummary} loading={keeperLoading} leagueKey={selectedLeague?.id || ''} onRefresh={handleLoadKeepers} />
              </div>
            )}

            {/* Player Ownership Tab */}
            {dashboardTab === 'ownership' && (
              <div className="pt-2">
                <ManagerInsights
                  ownershipData={managerOwnership}
                  tendencies={managerTendencies}
                  loading={loading}
                  fetchProgress={fetchProgress}
                  onRefreshTendency={handleRefreshTendency}
                  refreshingManagers={refreshingManagers}
                  tab="ownership"
                />
              </div>
            )}

            {/* AI Tendencies Tab */}
            {dashboardTab === 'tendencies' && (
              <div className="pt-2">
                <ManagerInsights
                  ownershipData={managerOwnership}
                  tendencies={managerTendencies}
                  loading={loading}
                  fetchProgress={fetchProgress}
                  onRefreshTendency={handleRefreshTendency}
                  refreshingManagers={refreshingManagers}
                  tab="tendencies"
                />
              </div>
            )}

            {/* Owner Position Tab */}
            {dashboardTab === 'owner-position' && (
              <div className="pt-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px' }}>
                    <Target style={{ color: 'var(--gold)' }} size={22} />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' }}>
                      Owner Position Map
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.2rem 0 0', fontFamily: "'Outfit', sans-serif" }}>
                      What position each manager drafted in every round, across all seasons
                    </p>
                  </div>
                </div>
                <OwnerPositionGrid draftSeasons={draftData} loading={draftLoading} />
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
            <button
              onClick={handleBack}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em',
                textTransform: 'uppercase', transition: 'color 0.2s', marginBottom: '1.5rem',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
            <ManagerInsights
              ownershipData={managerOwnership}
              tendencies={managerTendencies}
              loading={loading}
              fetchProgress={fetchProgress}
              onRefreshTendency={handleRefreshTendency}
              refreshingManagers={refreshingManagers}
            />
          </div>
        );
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--obsidian)', color: 'var(--text-primary)' }}>
      {currentStep !== AppState.LOGIN && <nav style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(12,15,22,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="max-w-7xl mx-auto px-6" style={{ height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            className="cursor-pointer"
            onClick={() => setCurrentStep(AppState.LOGIN)}
            style={{ opacity: 0.9, transition: 'opacity 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}
          >
            <DynastyAlchemyLogo size={44} withText />
          </div>

          {currentStep !== AppState.LOGIN && (
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em',
                textTransform: 'uppercase', transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <LogOut size={16} />
              Disconnect
            </button>
          )}
        </div>
      </nav>}

      <main>
        {loading && currentStep === AppState.LOGIN && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(12,15,22,0.95)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            zIndex: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ marginBottom: '1.5rem', filter: 'drop-shadow(0 0 40px rgba(212,160,23,0.3))' }}>
              <DynastyAlchemyLogo size={80} />
            </div>
            <p style={{
              fontFamily: "'Cinzel', serif", fontWeight: 700,
              fontSize: '1.25rem', letterSpacing: '0.06em',
              color: 'var(--text-primary)', marginTop: '1rem', textTransform: 'uppercase',
            }}>Contacting League Central...</p>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontFamily: "'Outfit', sans-serif", fontSize: '0.875rem' }}>
              Securing OAuth 2.0 Handshake
            </p>
          </div>
        )}
        {renderContent()}
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '3rem 0', background: 'var(--surface)', marginTop: '5rem' }}>
        <div className="max-w-7xl mx-auto px-6" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '0.7rem', letterSpacing: '0.2em',
            color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase',
          }}>
            © 2025 Dynasty Alchemy &nbsp;·&nbsp; Built with Secure Proxy Architecture
          </div>
          <div style={{ display: 'flex', gap: '2.5rem' }}>
            {[
              { label: 'Yahoo API', href: 'https://developer.yahoo.com/fantasysports/guide/' },
              { label: 'Security', href: '#' },
              { label: 'Privacy', href: '#' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.18em',
                  color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
