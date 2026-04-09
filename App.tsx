import React, { useState, useEffect, useRef } from 'react';
import { AppState, League, PlayerStats, ManagerHistory, ManagerOwnershipData, ManagerTendency, FetchProgress, SeasonDraftData, KeeperSummary, TeamRoster } from './types';
import * as yahooService from './services/yahooService';
import * as geminiService from './services/geminiService';
import ManagerInsights from './components/ManagerInsights';
import DraftResults from './components/DraftResults';
import KeeperBoard from './components/KeeperBoard';
import OwnerPositionGrid from './components/OwnerPositionGrid';
import DynastyAlchemyLogo from './components/DynastyAlchemyLogo';
import {
  LayoutDashboard, Users, Award,
  ChevronRight, ArrowLeft, LogOut, Loader2, Sparkles,
  Trophy, TrendingUp, ShieldAlert, ClipboardList, Target, Shield
} from 'lucide-react';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppState>(AppState.LOGIN);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [playerData, setPlayerData] = useState<PlayerStats[]>([]);
  const [managerData, setManagerData] = useState<ManagerHistory[]>([]);
  const [managerOwnership, setManagerOwnership] = useState<ManagerOwnershipData[]>([]);
  const [managerTendencies, setManagerTendencies] = useState<ManagerTendency[]>([]);
  const [tendenciesLoading, setTendenciesLoading] = useState(false);
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
  const [currentRosters, setCurrentRosters] = useState<TeamRoster[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [tradeDeadline, setTradeDeadline] = useState<string | null>(null);
  const [rosterCacheAge, setRosterCacheAge] = useState<string | null>(null);
  const [dynastyRankings, setDynastyRankings] = useState<Map<string, { overallRank: number; positionRank: number; value: number }>>(new Map());
  const [currentUserGuid, setCurrentUserGuid] = useState<string | null>(null);

  // ✅ Prevent double-processing with ref
  const isProcessingOAuth = useRef(false);
  const hasProcessedCode = useRef(false);
  const pendingTabRestore = useRef<string | null>(null);

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
            yahooService.getCurrentUserGuid().then(guid => { if (guid) setCurrentUserGuid(guid); }).catch(() => {});
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
            yahooService.getCurrentUserGuid().then(guid => { if (guid) setCurrentUserGuid(guid); }).catch(() => {});
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

  // Persist selected league + tab so a browser refresh restores the same page
  useEffect(() => {
    if (currentStep === AppState.DASHBOARD) {
      localStorage.setItem('last_dashboard_tab', dashboardTab);
    }
  }, [dashboardTab, currentStep]);

  useEffect(() => {
    if (currentStep === AppState.DASHBOARD && pendingTabRestore.current) {
      setDashboardTab(pendingTabRestore.current as typeof dashboardTab);
      pendingTabRestore.current = null;
    }
  }, [currentStep]);

  useEffect(() => {
    if (leagues.length === 0 || currentStep !== AppState.LEAGUE_SELECT) return;
    const savedId = localStorage.getItem('last_league_id');
    if (!savedId) return;
    const saved = leagues.find((l: League) => l.id === savedId);
    if (saved) {
      pendingTabRestore.current = localStorage.getItem('last_dashboard_tab');
      handleSelectLeague(saved);
    }
  }, [leagues]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectLeague = async (league: League) => {
    localStorage.setItem('last_league_id', league.id);
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

      // Auto-load keeper summary in the background
      setKeeperLoading(true);
      fetch(`/api/keepers/summary/${encodeURIComponent(league.id)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setKeeperSummary(data); })
        .catch(() => {})
        .finally(() => setKeeperLoading(false));

      // Kick off draft history fetch in the background (non-blocking)
      setDraftLoading(true);
      yahooService.getMultiSeasonDraftResults(league.id).then(data => {
        setDraftData(data);
      }).catch(err => {
        console.warn('Draft history fetch failed:', err);
      }).finally(() => {
        setDraftLoading(false);
      });

      // Kick off current roster fetch in the background
      setRosterLoading(true);
      setCurrentRosters([]);
      setTradeDeadline(null);
      // Load cached snapshot instantly, then fetch live data from Yahoo
      const leagueSeason = league.seasons[0];
      yahooService.getCachedCurrentRosters(league.id, leagueSeason).then(({ rosters, cacheAge }) => {
        if (rosters.length > 0) {
          setCurrentRosters(rosters);
          setRosterCacheAge(cacheAge);
        }
      }).catch(() => {});
      Promise.all([
        yahooService.fetchCurrentRosters(league.id, leagueSeason),
        yahooService.fetchTradeDeadline(league.id),
      ]).then(([rosters, deadline]) => {
        // Only update if the live fetch returned actual players; never blank out the cache
        const totalPlayers = rosters.reduce((n, t) => n + t.players.length, 0);
        if (totalPlayers > 0) {
          setCurrentRosters(rosters);
          setRosterCacheAge(null);
        }
        if (deadline) setTradeDeadline(deadline.display);
      }).catch(err => {
        console.warn('Current roster fetch failed:', err);
      }).finally(() => {
        setRosterLoading(false);
      });

      // Kick off dynasty rankings fetch in the background
      yahooService.fetchDynastyRankings().then(r => setDynastyRankings(r)).catch(() => {});
    } catch (err: any) {
      console.error('Failed to load league details:', err);
      setError(`Failed to load league details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadOwnershipData = async () => {
    if (!selectedLeague) return;
    setLoading(true);
    setError(null);
    setFetchProgress(null);
    setDashboardTab('ownership');
    try {
      const { aggregatedOwnership, errors } = await yahooService.getMultiSeasonRosters(
        selectedLeague.id,
        { onProgress: (progress) => setFetchProgress(progress) }
      );
      if (errors.length > 0) console.warn('Some seasons had errors:', errors);
      setManagerOwnership(aggregatedOwnership);
    } catch (err: any) {
      console.error('Failed to load ownership data:', err);
      setError(`Failed to load ownership data: ${err.message}`);
    } finally {
      setLoading(false);
      setFetchProgress(null);
    }
  };

  const loadTendencies = async (ownership: ManagerOwnershipData[]) => {
    if (ownership.length === 0) return;
    setTendenciesLoading(true);
    try {
      // Always check cache first — never bypass it based on whether roster data was re-fetched
      let cachedTendencies: ManagerTendency[] = [];
      try {
        const cacheRes = await fetch('/api/cache/tendencies');
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          cachedTendencies = cacheData.tendencies || [];
          console.log(`💾 Found ${cachedTendencies.length} cached tendencies`);
        }
      } catch (err) {
        console.warn('⚠️ Could not check tendencies cache:', err);
      }

      const managersNeedingAnalysis = ownership.filter(m => {
        const cached = cachedTendencies.find(t => t.managerId === m.managerId);
        if (!cached) return true;
        const analysis = cached.analysis || '';
        const isFallback = (analysis.includes('Prefers') && analysis.includes('positions. Loyalty:'))
          || (analysis.includes('Favors') && analysis.includes('Loyalty score:'));
        return isFallback;
      });

      console.log(`🔍 ${managersNeedingAnalysis.length} managers need AI analysis`);

      if (managersNeedingAnalysis.length === 0) {
        console.log('✅ Using fully cached AI tendencies');
        setManagerTendencies(cachedTendencies);
        return;
      }

      let finalTendencies: ManagerTendency[] = [];
      try {
        const newTendencies = await geminiService.getManagerTendencies(managersNeedingAnalysis);
        const newTendencyMap = new Map(newTendencies.map(t => [t.managerId, t]));
        finalTendencies = ownership.map(manager => {
          if (newTendencyMap.has(manager.managerId)) return newTendencyMap.get(manager.managerId)!;
          const cached = cachedTendencies.find(t => t.managerId === manager.managerId);
          if (cached) return cached;
          const players = manager.players || [];
          const positionCounts: { [key: string]: number } = {};
          players.forEach(p => {
            if (p.position) positionCounts[p.position] = (positionCounts[p.position] || 0) + (p.timesOwned || 0);
          });
          const topPositions = Object.entries(positionCounts).sort(([,a],[,b]) => b-a).slice(0,3).map(([pos]) => pos);
          const loyaltyScore = Math.round((players.filter(p => (p.timesOwned||0) > 1).length / Math.max(players.length,1)) * 100);
          return { managerId: manager.managerId, managerName: manager.managerName, analysis: `Prefers ${topPositions.join(', ')} positions. Loyalty: ${loyaltyScore}%`, topPositions, loyaltyScore };
        });

        try {
          await fetch('/api/cache/tendencies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tendencies: finalTendencies })
          });
          console.log('💾 AI tendencies cached');
        } catch (cacheErr) {
          console.warn('⚠️ Failed to cache tendencies:', cacheErr);
        }
      } catch (geminiErr) {
        console.warn('⚠️ Gemini error, using cached + fallbacks:', geminiErr);
        finalTendencies = ownership.map(manager => {
          const cached = cachedTendencies.find(t => t.managerId === manager.managerId);
          if (cached) return cached;
          const players = manager.players || [];
          const positionCounts: { [key: string]: number } = {};
          players.forEach(p => {
            if (p.position) positionCounts[p.position] = (positionCounts[p.position] || 0) + (p.timesOwned || 0);
          });
          const topPositions = Object.entries(positionCounts).sort(([,a],[,b]) => b-a).slice(0,3).map(([pos]) => pos);
          const loyaltyScore = Math.round((players.filter(p => (p.timesOwned||0) > 1).length / Math.max(players.length,1)) * 100);
          return { managerId: manager.managerId, managerName: manager.managerName, analysis: `Prefers ${topPositions.join(', ')} positions. Loyalty: ${loyaltyScore}%`, topPositions, loyaltyScore };
        });
      }

      setManagerTendencies(finalTendencies);
    } finally {
      setTendenciesLoading(false);
    }
  };

  const handleLoadKeepers = async () => {
    if (!selectedLeague) return;
    setKeeperLoading(true);
    try {
      const res = await fetch(`/api/keepers/summary/${encodeURIComponent(selectedLeague.id)}`);
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
        await fetch('/api/cache/tendencies', {
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
    localStorage.removeItem('last_league_id');
    localStorage.removeItem('last_dashboard_tab');
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
                fontWeight: 400, fontSize: '1rem',
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
                SECURE OAUTH 2.0 &nbsp;·&nbsp; READ-ONLY &nbsp;·&nbsp; NO USER DATA STORED
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
                      lineHeight: 1.65, fontWeight: 400, margin: 0,
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
                { id: 'overview', icon: <Users size={15} />, label: 'Current Roster', onClick: () => setDashboardTab('overview') },
                {
                  id: 'draft', icon: <ClipboardList size={15} />, label: 'Draft History', onClick: () => setDashboardTab('draft'),
                  badge: draftLoading
                    ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
                    : draftData.length > 0
                      ? <span style={{ fontSize: '0.6rem', background: 'var(--gold-dim)', color: 'var(--gold)', padding: '0.1rem 0.4rem', borderRadius: '99px', fontWeight: 700, border: '1px solid rgba(212,160,23,0.25)' }}>{draftData.length}</span>
                      : null,
                },
                { id: 'ownership', icon: <Users size={15} />, label: 'Player Ownership', onClick: () => managerOwnership.length > 0 ? setDashboardTab('ownership') : loadOwnershipData() },
                { id: 'tendencies', icon: <Sparkles size={15} />, label: 'AI Tendencies', onClick: async () => {
                  setDashboardTab('tendencies');
                  if (managerOwnership.length === 0) {
                    // Need ownership data first, then load tendencies
                    setLoading(true);
                    setError(null);
                    setFetchProgress(null);
                    try {
                      const { aggregatedOwnership } = await yahooService.getMultiSeasonRosters(
                        selectedLeague!.id,
                        { onProgress: (p) => setFetchProgress(p) }
                      );
                      setManagerOwnership(aggregatedOwnership);
                      await loadTendencies(aggregatedOwnership);
                    } catch (err: any) {
                      setError(`Failed to load data: ${err.message}`);
                    } finally {
                      setLoading(false);
                      setFetchProgress(null);
                    }
                  } else if (managerTendencies.length === 0) {
                    await loadTendencies(managerOwnership);
                  }
                }},
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

            {/* Current Roster Tab */}
            {dashboardTab === 'overview' && (() => {
              const posColor: Record<string, string> = {
                QB: '#D4A017', RB: '#22A85F', WR: '#3B82F6', TE: '#A855F7',
                K: '#6B7280', DEF: '#6B7280', 'D/ST': '#6B7280',
              };
              const acqColor: Record<string, { bg: string; text: string; label: string }> = {
                draft:      { bg: 'rgba(212,160,23,0.12)',  text: '#D4A017', label: 'DRAFT' },
                freeagent:  { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6', label: 'FA' },
                waivers:    { bg: 'rgba(6,182,212,0.12)',   text: '#06B6D4', label: 'WIRE' },
                trade:      { bg: 'rgba(168,85,247,0.12)',  text: '#A855F7', label: 'TRADE' },
              };

              // Build draft round lookup from current season's draft data
              const currentSeasonDraft = selectedLeague
                ? draftData.find(d => d.leagueKey === selectedLeague.id)
                : null;
              const draftRoundByName = new Map<string, number>();
              if (currentSeasonDraft) {
                for (const pick of currentSeasonDraft.picks) {
                  draftRoundByName.set(pick.playerName.toLowerCase(), pick.round);
                }
              }

              // Build keeper map: playerName → timesKept (for players kept INTO this season)
              const keeperTimesKept = new Map<string, number>();
              for (const k of keeperSummary?.keptIntoCurrentSeason ?? []) {
                keeperTimesKept.set(k.playerName.toLowerCase(), k.timesKept);
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Page header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ padding: '0.75rem', background: 'var(--gold-dim)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px' }}>
                        <Users style={{ color: 'var(--gold)' }} size={22} />
                      </div>
                      <div>
                        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'var(--text-primary)', margin: 0, textTransform: 'uppercase' }}>Current Rosters</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.2rem 0 0', fontFamily: "'Outfit', sans-serif" }}>
                          {rosterCacheAge
                            ? `Cached · ${new Date(rosterCacheAge).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                            : rosterLoading ? 'Fetching live rosters from Yahoo…' : 'Live data from Yahoo Fantasy'}
                        </p>
                      </div>
                    </div>
                    {/* Trade deadline badge */}
                    {tradeDeadline && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.6rem 1.1rem',
                        background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.25)',
                        borderRadius: '6px',
                      }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E05252', flexShrink: 0, boxShadow: '0 0 6px rgba(224,82,82,0.6)' }} />
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.18em', color: '#E05252', textTransform: 'uppercase' }}>Trade Deadline</span>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{tradeDeadline}</span>
                      </div>
                    )}
                  </div>

                  {/* Loading skeleton */}
                  {rosterLoading && currentRosters.length === 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {[...Array(6)].map((_, i) => (
                        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ height: '1.1rem', width: '55%', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }} />
                          {[...Array(8)].map((_, j) => (
                            <div key={j} style={{ height: '0.85rem', width: `${70 + (j % 3) * 10}%`, background: 'rgba(255,255,255,0.04)', borderRadius: '3px' }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Roster grid */}
                  {currentRosters.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                      {[...currentRosters].sort((a, b) => {
                        const aIsMe = currentUserGuid && a.managerId === currentUserGuid ? -1 : 0;
                        const bIsMe = currentUserGuid && b.managerId === currentUserGuid ? -1 : 0;
                        return aIsMe - bIsMe;
                      }).map(team => (
                        <div key={team.teamKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                          {/* Team header */}
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1rem', letterSpacing: '0.08em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>{team.managerName}</div>
                            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{team.teamName}</div>
                          </div>

                          {/* Player list */}
                          <div style={{ padding: '0.5rem 0' }}>
                            {team.players.length === 0 && (
                              <div style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: "'Outfit', sans-serif" }}>No players found</div>
                            )}
                            {[...team.players].sort((a, b) => {
                              if (a.isOnIR !== b.isOnIR) return a.isOnIR ? 1 : -1;
                              const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'D/ST'];
                              const ai = posOrder.indexOf(a.position);
                              const bi = posOrder.indexOf(b.position);
                              const posDiff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                              if (posDiff !== 0) return posDiff;
                              const ar = dynastyRankings.get(a.playerName.toLowerCase())?.overallRank ?? Infinity;
                              const br = dynastyRankings.get(b.playerName.toLowerCase())?.overallRank ?? Infinity;
                              return ar - br;
                            }).map((player, idx, sorted) => {
                              const isIRDivider = idx > 0 && player.isOnIR && !sorted[idx - 1].isOnIR;
                              const nameLower = player.playerName.toLowerCase();
                              const timesKept = keeperTimesKept.get(nameLower) ?? 0;
                              const draftRound = draftRoundByName.get(nameLower);

                              const isKeeperIneligible = player.isKeeperIneligible ?? false;

                              // Determine acquisition badge
                              let acqBadge: { bg: string; text: string; label: string };
                              if (timesKept > 0 || player.acquisitionType === 'draft' || (!player.acquisitionDate && draftRound)) {
                                // Show round instead of generic DRAFT
                                acqBadge = draftRound
                                  ? { bg: 'rgba(212,160,23,0.12)', text: '#D4A017', label: `RND ${draftRound}` }
                                  : { bg: 'rgba(212,160,23,0.12)', text: '#D4A017', label: 'DRAFT' };
                              } else {
                                acqBadge = acqColor[player.acquisitionType] || { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-muted)', label: player.acquisitionType?.toUpperCase() || '—' };
                              }

                              const posClr = posColor[player.position] || '#6B7280';
                              return (
                                <React.Fragment key={player.playerKey}>
                                  {isIRDivider && (
                                    <div style={{ margin: '0.25rem 1.25rem', borderTop: '1px dashed rgba(224,82,82,0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0 0.25rem' }}>
                                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '0.6rem', letterSpacing: '0.18em', color: '#E05252', fontWeight: 700 }}>IR</span>
                                    </div>
                                  )}
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 1fr auto',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.45rem 1.25rem',
                                    opacity: player.isOnIR ? 0.55 : 1,
                                    background: isKeeperIneligible ? 'rgba(224,82,82,0.08)' : undefined,
                                    borderLeft: isKeeperIneligible ? '2px solid rgba(224,82,82,0.4)' : '2px solid transparent',
                                  }}>
                                    {/* Position badge */}
                                    <div style={{
                                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                                      fontSize: '0.6rem', letterSpacing: '0.06em',
                                      color: posClr, textAlign: 'center',
                                      background: `${posClr}18`, border: `1px solid ${posClr}35`,
                                      borderRadius: '3px', padding: '0.1rem 0',
                                    }}>{player.position || '—'}</div>

                                    {/* Name + team + date */}
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.playerName}</span>
                                        {timesKept > 0 && <span title={`Kept ${timesKept} year${timesKept > 1 ? 's' : ''}`} style={{ fontSize: '0.7rem', flexShrink: 0, letterSpacing: '-0.05em' }}>{'⭐'.repeat(Math.min(timesKept, 3))}</span>}
                                      </div>
                                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.05rem' }}>
                                        <span>{player.nflTeam || '—'}</span>
                                        {player.acquisitionDate && <><span style={{ opacity: 0.35 }}>·</span><span>{player.acquisitionDate}</span></>}
                                        {(() => {
                                          const fc = dynastyRankings.get(player.playerName.toLowerCase());
                                          if (!fc) return null;
                                          const color = fc.overallRank <= 75 ? '#22A85F' : fc.overallRank <= 150 ? '#D4A017' : '#E05252';
                                          return <><span style={{ opacity: 0.35 }}>·</span><span style={{ color }}>#{fc.overallRank}</span></>;
                                        })()}
                                      </div>
                                    </div>

                                    {/* Acquisition type badge */}
                                    <div style={{
                                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                                      fontSize: '0.7rem', letterSpacing: '0.08em',
                                      color: acqBadge.text, background: acqBadge.bg,
                                      padding: '0.2rem 0.55rem', borderRadius: '3px',
                                      whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>{acqBadge.label}</div>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {!rosterLoading && currentRosters.length === 0 && (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                      <Users size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                      <p style={{ margin: 0 }}>Roster data unavailable — try refreshing the page</p>
                    </div>
                  )}
                </div>
              );
            })()}

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
                  loading={tendenciesLoading}
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
