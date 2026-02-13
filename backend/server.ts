import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import * as db from './db';
import * as cacheService from './cacheService';

// Load environment variables
dotenv.config();

// Initialize database
db.initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = process.env.YAHOO_CLIENT_ID || 'dj0yJmk9dnRMc3llQWFTQkljJmQ9WVdrOVF6Y3diRVpEUjNjbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTA2';
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET || '1105953219bf6b129a438e91cf792557eed39458';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://nonexotically-nonphonetical-aidan.ngrok-free.dev';

// Log configuration on startup
console.log('\n🔧 Configuration:');
console.log('  CLIENT_ID:', CLIENT_ID ? CLIENT_ID.substring(0, 20) + '...' : 'NOT SET');
console.log('  CLIENT_SECRET:', CLIENT_SECRET ? '***' + CLIENT_SECRET.substring(CLIENT_SECRET.length - 4) : 'NOT SET');
console.log('  REDIRECT_URI:', REDIRECT_URI);
console.log('  PORT:', PORT);
console.log('');

// Exponential backoff helper for Gemini API calls
async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.response?.status;

      // Only retry on 429 (rate limit) or 503 (service unavailable)
      if (status !== 429 && status !== 503) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`  ⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// DeepSeek API helper (OpenAI-compatible)
async function callDeepSeek(prompt: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.log('  ⚠️ DeepSeek API key not configured');
    return null;
  }

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data?.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    console.log(`  ⚠️ DeepSeek error (${status}): ${detail}`);
    return null;
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large roster payloads

// 1️⃣ Generate Yahoo OAuth URL (Confidential Client - No PKCE)
app.get('/api/auth/url', (req, res) => {
  // For confidential clients, we don't use PKCE
  // Yahoo requires choosing between PKCE (public clients) or client_secret (confidential clients)
  const sessionId = crypto.randomBytes(16).toString('hex');

  console.log('🔐 Generating OAuth URL for Confidential Client:');
  console.log('  Session ID:', sessionId);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
  });

  const url = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  console.log('🔗 Generated OAuth URL (Confidential Client flow)');

  res.json({ url, sessionId });
});

// 2️⃣ Exchange authorization code for tokens (Confidential Client - No PKCE)
app.post('/api/auth/token', async (req, res) => {
  const { code, sessionId } = req.body;
  if (!code) return res.status(400).json({ error: 'No authorization code provided' });
  if (!sessionId) return res.status(400).json({ error: 'No session ID provided' });

  console.log('🔄 Exchanging code for token (Confidential Client)...');
  console.log('Code:', code.substring(0, 20) + '...');

  try {
    const response = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    console.log('✅ Token exchange successful');
    console.log('Token type:', response.data.token_type);
    console.log('Expires in:', response.data.expires_in);

    res.json(response.data);
  } catch (err: any) {
    console.error('❌ Token exchange error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data?.error || 'token_exchange_failed',
      error_description: err.response?.data?.error_description || err.message 
    });
  }
});

// 3️⃣ Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'No refresh token provided' });

  console.log('🔄 Refreshing token...');

  try {
    const response = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        refresh_token,
        grant_type: 'refresh_token',
        // ✅ No client_secret needed for installed apps
      }).toString(),
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        } 
      }
    );
    
    console.log('✅ Token refresh successful');
    res.json(response.data);
  } catch (err: any) {
    console.error('❌ Token refresh error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data?.error || 'token_refresh_failed',
      error_description: err.response?.data?.error_description || err.message
    });
  }
});

// 4️⃣ Proxy Yahoo Fantasy API
app.get('/api/yahoo/*', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error('❌ No Authorization header');
    return res.status(401).json({ error: 'No Authorization header provided' });
  }

  const path = req.params[0];

  const queryParams = new URLSearchParams(req.query as any);
  if (!queryParams.has('format')) {
    queryParams.set('format', 'json');
  }

  const queryString = queryParams.toString();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/${path}${queryString ? '?' + queryString : '?format=json'}`;

  console.log('\n🔗 Proxying Yahoo API request:');
  console.log('  Path:', path);
  console.log('  Full URL:', url);
  console.log('  Auth:', authHeader.substring(0, 30) + '...');
  console.log('  Query Params:', Object.fromEntries(queryParams));

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000 // 15 second timeout
    });

    console.log('✅ Yahoo API response received');
    console.log('  Status:', response.status);
    console.log('  Response Type:', typeof response.data);
    console.log('  Has fantasy_content:', !!response.data?.fantasy_content);

    res.json(response.data);
  } catch (err: any) {
    console.error('\n❌ Yahoo API proxy error:');
    console.error('  URL:', url);
    console.error('  Status:', err.response?.status);
    console.error('  Status Text:', err.response?.statusText);

    if (err.response?.data) {
      console.error('  Response Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('  Error Message:', err.message);
    }

    if (err.code) {
      console.error('  Error Code:', err.code);
    }

    // Log headers for debugging auth issues
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.error('  Auth Issue Detected - Token might be expired or invalid');
    }

    // Log rate limiting
    if (err.response?.status === 429) {
      console.error('  Rate Limit Exceeded - Too many requests');
    }

    // Log server errors
    if (err.response?.status >= 500) {
      console.error('  Yahoo API Server Error - This is on Yahoo\'s side');
      console.error('  Response Headers:', err.response?.headers);
    }

    res.status(err.response?.status || 500).json({
      error: 'yahoo_api_error',
      status: err.response?.status,
      statusText: err.response?.statusText,
      yahoo_error: err.response?.data || { error: 'API request failed' },
      message: err.message,
      code: err.code,
      url: url,
      timestamp: new Date().toISOString()
    });
  }
});

// 5️⃣ Legacy insights endpoint - computes stats from data, Gemini only for summaries
app.post('/api/insights', async (req, res) => {
  const { playerData } = req.body;

  if (!playerData || !Array.isArray(playerData)) {
    return res.status(400).json({ error: 'Invalid request - playerData array required' });
  }

  console.log('\n📊 Generating legacy insights...');
  console.log(`  Received ${playerData.length} players`);

  // Log sample player structure to debug
  if (playerData.length > 0) {
    console.log('  Sample player structure:', JSON.stringify(playerData[0], null, 2));
  }

  // Find the player owned most by user
  const mostOwnedByMe = playerData
    .filter((p: any) => p.Phi > 0)
    .sort((a: any, b: any) => b.ownedByMeCount - a.ownedByMeCount)[0];

  // Find player with most bench points (missed opportunity)
  const mostBenchedPoints = playerData
    .filter((p: any) => p.avgPointsBenched > 5)
    .sort((a: any, b: any) => b.avgPointsBenched - a.avgPointsBenched)[0];

  // Find player most owned by others
  const rivalPlayer = playerData
    .filter((p: any) => p.ownedByOthersCount > 0)
    .sort((a: any, b: any) => b.ownedByOthersCount - a.ownedByOthersCount)[0];

  console.log('  Most owned by me:', mostOwnedByMe?.name || 'none found');
  console.log('  Most benched points:', mostBenchedPoints?.name || 'none found');
  console.log('  Rival player:', rivalPlayer?.name || 'none found');

  // Build base insights from computed data (no AI needed for this)
  const baseInsights = {
    frequentPick: mostOwnedByMe
      ? `${mostOwnedByMe.name} (${mostOwnedByMe.position}) - Owned ${mostOwnedByMe.ownedByMeCount} seasons`
      : 'No consistent favorites identified',
    missedOpportunity: mostBenchedPoints
      ? `${mostBenchedPoints.name} - Averaged ${mostBenchedPoints.avgPointsBenched.toFixed(1)} pts on bench`
      : 'Good start/sit decisions overall',
    rivalJewel: rivalPlayer
      ? `${rivalPlayer.name} - Owned by opponents ${rivalPlayer.ownedByOthersCount} times`
      : 'No clear rival favorites',
    summary: '',
    // Include raw stats for the frontend
    stats: {
      mostOwnedByMe: mostOwnedByMe || null,
      mostBenchedPoints: mostBenchedPoints || null,
      rivalPlayer: rivalPlayer || null,
      totalPlayers: playerData.length
    }
  };

  // Try to get AI-generated summary (optional enhancement)
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // Only call Gemini if we have actual data to summarize
    if (mostOwnedByMe || mostBenchedPoints || rivalPlayer) {
      console.log('  🤖 Requesting AI summary...');

      const prompt = `You are a fantasy football analyst. Write ONE punchy 1-2 sentence summary of this manager's tendencies based on these facts:

${mostOwnedByMe ? `- Most loyal pick: ${mostOwnedByMe.name} (${mostOwnedByMe.position}) owned ${mostOwnedByMe.ownedByMeCount} seasons` : ''}
${mostBenchedPoints ? `- Biggest bench mistake: ${mostBenchedPoints.name} averaged ${mostBenchedPoints.avgPointsBenched} points while benched` : ''}
${rivalPlayer ? `- Rival's prize: ${rivalPlayer.name} was owned by opponents ${rivalPlayer.ownedByOthersCount} times` : ''}

Keep it analytical but entertaining, like a color commentator. Return ONLY the summary text, no JSON.`;

      const result = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        })
      );

      const summary = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      baseInsights.summary = summary.trim();
      console.log('  ✅ AI summary generated');
    } else {
      baseInsights.summary = 'Not enough historical data to analyze management patterns yet.';
    }

    res.json({ ...baseInsights, fromAI: true });
  } catch (err: any) {
    console.error('  ⚠️ Gemini API error (using fallback summary):', err.message);

    // Fallback summary without AI
    baseInsights.summary = mostOwnedByMe
      ? `Your management style shows loyalty to key players like ${mostOwnedByMe.name}.`
      : 'Building your fantasy legacy - keep playing to reveal your management patterns!';

    res.json({ ...baseInsights, fromAI: false });
  }
});

// 6️⃣ Manager tendency analysis - computes stats from data, Gemini only for summaries
app.post('/api/manager-tendencies', async (req, res) => {
  const { managers } = req.body;

  if (!managers || !Array.isArray(managers)) {
    return res.status(400).json({ error: 'Invalid request - managers array required' });
  }

  console.log('\n📊 Generating manager tendency analysis...');
  console.log(`  Received ${managers.length} managers`);

  // Pre-compute all manager stats (this is the core logic - no AI needed)
  const managerStats = managers.map(manager => {
    const players = manager.players || [];

    const topPlayers = [...players]
      .sort((a: any, b: any) => (b.timesOwned || 0) - (a.timesOwned || 0))
      .slice(0, 10);

    const positionCounts: { [key: string]: number } = {};
    players.forEach((p: any) => {
      const pos = p.position || 'Unknown';
      positionCounts[pos] = (positionCounts[pos] || 0) + (p.timesOwned || 1);
    });

    const topPositions = Object.entries(positionCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([pos]) => pos);

    const multiYearPlayers = players.filter((p: any) => (p.timesOwned || 0) > 1);
    const loyaltyScore = Math.round((multiYearPlayers.length / Math.max(players.length, 1)) * 100);

    // Build a data-driven analysis string (no AI needed)
    const topPlayer = topPlayers[0];
    const dataAnalysis = topPlayer
      ? `Favors ${topPositions[0] || 'various'} positions. Top pick: ${topPlayer.playerName || 'Unknown'} (owned ${topPlayer.timesOwned || 1}x). Loyalty score: ${loyaltyScore}%.`
      : `Limited ownership data available. Loyalty score: ${loyaltyScore}%.`;

    return {
      manager,
      topPlayers,
      positionCounts,
      topPositions,
      loyaltyScore,
      dataAnalysis
    };
  });

  // Calculate league-wide stats for context
  const allLoyaltyScores = managerStats.map(m => m.loyaltyScore);
  const avgLoyalty = Math.round(allLoyaltyScores.reduce((a, b) => a + b, 0) / allLoyaltyScores.length);
  const minLoyalty = Math.min(...allLoyaltyScores);
  const maxLoyalty = Math.max(...allLoyaltyScores);
  const sortedScores = [...allLoyaltyScores].sort((a, b) => b - a);

  console.log(`  📊 League loyalty stats: min=${minLoyalty}%, max=${maxLoyalty}%, avg=${avgLoyalty}%`);

  // Build base tendencies from computed data
  const tendencies = managerStats.map(({ manager, topPositions, loyaltyScore, dataAnalysis, topPlayers }) => ({
    managerId: manager.managerId,
    managerName: manager.managerName,
    analysis: dataAnalysis,
    topPositions,
    loyaltyScore,
    topPlayers: topPlayers.slice(0, 5), // Include top 5 players in response
    fromAI: false
  }));

  // Try to enhance with AI summaries (optional)
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    for (let i = 0; i < managerStats.length; i++) {
      const { manager, topPlayers, positionCounts, topPositions, loyaltyScore } = managerStats[i];

      // Skip AI if no meaningful data
      if (topPlayers.length === 0) {
        console.log(`  Skipping AI for ${manager.managerName} - no player data`);
        continue;
      }

      // Calculate this manager's rank
      const loyaltyRank = sortedScores.indexOf(loyaltyScore) + 1;
      const loyaltyDescription = loyaltyScore >= maxLoyalty - 5 ? 'one of the most loyal'
        : loyaltyScore <= minLoyalty + 5 ? 'one of the least loyal'
        : loyaltyScore >= avgLoyalty + 10 ? 'more loyal than most'
        : loyaltyScore <= avgLoyalty - 10 ? 'less loyal than most'
        : 'about average loyalty';

      console.log(`  🤖 Getting AI summary for ${manager.managerName}...`);

      const prompt = `You are a fantasy football analyst. Write 2-3 punchy sentences about this manager's tendencies:

Manager: ${manager.managerName}
Top players owned: ${topPlayers.slice(0, 5).map((p: any) => `${p.playerName} (${p.position}, owned ${p.timesOwned}x)`).join(', ')}
Position preference: ${topPositions.join(', ')}
Loyalty score: ${loyaltyScore}% (${loyaltyDescription} in this league)
League context: Loyalty scores range from ${minLoyalty}% to ${maxLoyalty}%, league average is ${avgLoyalty}%. This manager ranks #${loyaltyRank} of ${managers.length}.

Focus on their player preferences and draft tendencies. Only mention loyalty if it's notably high or low relative to the league. Keep it analytical but entertaining, like a color commentator. Return ONLY the analysis text, no JSON.`;

      try {
        const result = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
          })
        );

        const aiAnalysis = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiAnalysis) {
          tendencies[i].analysis = aiAnalysis.trim();
          tendencies[i].fromAI = true;
        }
        console.log(`  ✅ Gemini summary complete for ${manager.managerName}`);
      } catch (err: any) {
        console.log(`  ⚠️ Gemini failed for ${manager.managerName}, trying DeepSeek...`);

        // Fallback to DeepSeek
        const deepSeekResult = await callDeepSeek(prompt);
        if (deepSeekResult) {
          tendencies[i].analysis = deepSeekResult.trim();
          tendencies[i].fromAI = true;
          console.log(`  ✅ DeepSeek summary complete for ${manager.managerName}`);
        } else {
          console.log(`  ⚠️ DeepSeek also failed, using data-driven analysis`);
          // Keep the data-driven analysis already in tendencies[i]
        }
      }
    }
  } catch (err: any) {
    console.error('  ⚠️ Gemini API unavailable, trying DeepSeek for all managers...');

    // Try DeepSeek for all managers if Gemini completely fails
    for (let i = 0; i < managerStats.length; i++) {
      const { manager, topPlayers, topPositions, loyaltyScore } = managerStats[i];
      if (topPlayers.length === 0) continue;

      const loyaltyRank = sortedScores.indexOf(loyaltyScore) + 1;
      const loyaltyDescription = loyaltyScore >= maxLoyalty - 5 ? 'one of the most loyal'
        : loyaltyScore <= minLoyalty + 5 ? 'one of the least loyal'
        : loyaltyScore >= avgLoyalty + 10 ? 'more loyal than most'
        : loyaltyScore <= avgLoyalty - 10 ? 'less loyal than most'
        : 'about average loyalty';

      const prompt = `You are a fantasy football analyst. Write 2-3 punchy sentences about this manager's tendencies:

Manager: ${manager.managerName}
Top players owned: ${topPlayers.slice(0, 5).map((p: any) => `${p.playerName} (${p.position}, owned ${p.timesOwned}x)`).join(', ')}
Position preference: ${topPositions.join(', ')}
Loyalty score: ${loyaltyScore}% (${loyaltyDescription} in this league)
League context: Loyalty scores range from ${minLoyalty}% to ${maxLoyalty}%, league average is ${avgLoyalty}%. This manager ranks #${loyaltyRank} of ${managers.length}.

Focus on their player preferences and draft tendencies. Only mention loyalty if it's notably high or low relative to the league. Keep it analytical but entertaining, like a color commentator. Return ONLY the analysis text, no JSON.`;

      const deepSeekResult = await callDeepSeek(prompt);
      if (deepSeekResult) {
        tendencies[i].analysis = deepSeekResult.trim();
        tendencies[i].fromAI = true;
        console.log(`  ✅ DeepSeek summary complete for ${manager.managerName}`);
      }
    }
  }

  console.log('✅ All manager analyses complete');
  res.json({ tendencies });
});

// 🗄️ Cache Management Endpoints

// Cache season roster data
app.post('/api/cache/season', (req, res) => {
  try {
    const seasonData = req.body;
    console.log(`📥 Caching season ${seasonData.season} - ${seasonData.teams?.length || 0} teams, league: ${seasonData.leagueKey}`);
    cacheService.cacheSeasonRosterData(seasonData);
    console.log(`✅ Successfully cached ${seasonData.season}`);
    res.json({ success: true, message: 'Season data cached successfully' });
  } catch (err: any) {
    console.error('❌ Failed to cache season data:', err);
    res.status(500).json({ error: 'Failed to cache data', message: err.message });
  }
});

// Get all cached aggregated data
app.get('/api/cache/aggregated', (req, res) => {
  try {
    const data = cacheService.getCachedAggregatedData();
    const cachedSeasons = db.getCachedSeasons();
    res.json({
      managers: data,
      count: data.length,
      cached: true,
      cachedSeasons: cachedSeasons
    });
  } catch (err: any) {
    console.error('Failed to retrieve cached data:', err);
    res.status(500).json({ error: 'Failed to retrieve cached data', message: err.message });
  }
});

// Check if season data exists in cache
app.get('/api/cache/check/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const exists = db.hasSeasonData(leagueKey);
    const shouldFetch = cacheService.shouldFetchSeasonData(leagueKey);
    const cacheAge = db.getLeagueCacheAge(leagueKey);

    res.json({
      exists,
      shouldFetch,
      cacheAge: cacheAge?.toISOString() || null
    });
  } catch (err: any) {
    console.error('Failed to check cache:', err);
    res.status(500).json({ error: 'Failed to check cache', message: err.message });
  }
});

// Clear all cache (for testing/debugging)
app.post('/api/cache/clear', (req, res) => {
  try {
    db.clearAllCache();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (err: any) {
    console.error('Failed to clear cache:', err);
    res.status(500).json({ error: 'Failed to clear cache', message: err.message });
  }
});

// Get cached AI tendencies
app.get('/api/cache/tendencies', (req, res) => {
  try {
    const tendencies = db.getCachedTendencies();
    const needsUpdate = db.tendenciesNeedUpdate([]);
    res.json({
      tendencies,
      count: tendencies.length,
      needsUpdate
    });
  } catch (err: any) {
    console.error('Failed to get cached tendencies:', err);
    res.status(500).json({ error: 'Failed to get tendencies', message: err.message });
  }
});

// Save AI tendencies to cache
app.post('/api/cache/tendencies', (req, res) => {
  try {
    const { tendencies } = req.body;
    const cachedSeasons = db.getCachedSeasons();

    for (const t of tendencies) {
      db.cacheTendency(
        t.managerId,
        t.managerName,
        t.analysis,
        t.topPositions || [],
        t.loyaltyScore || 0,
        cachedSeasons
      );
    }

    console.log(`💾 Cached ${tendencies.length} AI tendencies`);
    res.json({ success: true, count: tendencies.length });
  } catch (err: any) {
    console.error('Failed to cache tendencies:', err);
    res.status(500).json({ error: 'Failed to cache tendencies', message: err.message });
  }
});

// Clear only AI tendencies cache (keeps roster data)
app.post('/api/cache/tendencies/clear', (req, res) => {
  try {
    db.db.exec('DELETE FROM manager_tendencies');
    console.log('🗑️ AI tendencies cache cleared');
    res.json({ success: true, message: 'AI tendencies cache cleared' });
  } catch (err: any) {
    console.error('Failed to clear tendencies cache:', err);
    res.status(500).json({ error: 'Failed to clear tendencies', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Yahoo Fantasy Backend running on port ${PORT}`);
  console.log(`📍 Redirect URI: ${REDIRECT_URI}`);
  console.log(`💾 Database initialized and ready`);
});