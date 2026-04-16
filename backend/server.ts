import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db';
import * as cacheService from './cacheService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize database
db.initializeDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const CLIENT_ID = process.env.YAHOO_CLIENT_ID || '[REDACTED_YAHOO_CLIENT_ID]';
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET || '[REDACTED_YAHOO_CLIENT_SECRET]';
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
  const { managers, targetManagerIds } = req.body;

  if (!managers || !Array.isArray(managers)) {
    return res.status(400).json({ error: 'Invalid request - managers array required' });
  }

  const { skipAI } = req.body;
  const targetSet: Set<string> | null = targetManagerIds ? new Set<string>(targetManagerIds) : null;

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

  // If caller only wants data-driven stats, return immediately
  if (skipAI) {
    res.json({ tendencies });
    return;
  }

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

      // Skip if not in target list (when refreshing specific managers)
      if (targetSet && !targetSet.has(manager.managerId)) {
        continue;
      }

      // Calculate this manager's rank (percentile-based to avoid overlap bugs with tight score ranges)
      const loyaltyRank = sortedScores.indexOf(loyaltyScore) + 1;
      const loyaltyPercentile = 1 - (loyaltyRank - 1) / Math.max(managers.length - 1, 1);
      const loyaltyDescription = loyaltyPercentile >= 0.8 ? 'one of the most loyal'
        : loyaltyPercentile >= 0.6 ? 'more loyal than most'
        : loyaltyPercentile >= 0.4 ? 'about average loyalty'
        : loyaltyPercentile >= 0.2 ? 'less loyal than most'
        : 'one of the least loyal';

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
      if (targetSet && !targetSet.has(manager.managerId)) continue;

      const loyaltyRank = sortedScores.indexOf(loyaltyScore) + 1;
      const loyaltyPercentile = 1 - (loyaltyRank - 1) / Math.max(managers.length - 1, 1);
      const loyaltyDescription = loyaltyPercentile >= 0.8 ? 'one of the most loyal'
        : loyaltyPercentile >= 0.6 ? 'more loyal than most'
        : loyaltyPercentile >= 0.4 ? 'about average loyalty'
        : loyaltyPercentile >= 0.2 ? 'less loyal than most'
        : 'one of the least loyal';

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

// Single-manager AI enhancement (called per-manager from frontend for progressive loading)
app.post('/api/manager-tendencies/single', async (req, res) => {
  const { manager, leagueContext } = req.body;
  if (!manager) return res.status(400).json({ error: 'manager required' });

  const { minLoyalty, maxLoyalty, avgLoyalty, loyaltyRank, totalManagers, loyaltyDescription } = leagueContext || {};

  const players = manager.players || [];
  const topPlayers = [...players].sort((a: any, b: any) => (b.timesOwned || 0) - (a.timesOwned || 0)).slice(0, 5);
  const positionCounts: { [k: string]: number } = {};
  players.forEach((p: any) => { positionCounts[p.position || 'Unknown'] = (positionCounts[p.position || 'Unknown'] || 0) + (p.timesOwned || 1); });
  const topPositions = Object.entries(positionCounts).sort(([,a],[,b]) => (b as number)-(a as number)).slice(0,3).map(([pos]) => pos);

  const prompt = `You are a fantasy football analyst. Write 2-3 punchy sentences about this manager's tendencies:

Manager: ${manager.managerName}
Top players owned: ${topPlayers.map((p: any) => `${p.playerName} (${p.position}, owned ${p.timesOwned}x)`).join(', ')}
Position preference: ${topPositions.join(', ')}
Loyalty score: ${manager.loyaltyScore}%${loyaltyDescription ? ` (${loyaltyDescription} in this league)` : ''}
${leagueContext ? `League context: Loyalty scores range from ${minLoyalty}% to ${maxLoyalty}%, league average is ${avgLoyalty}%. This manager ranks #${loyaltyRank} of ${totalManagers}.` : ''}

Focus on their player preferences and draft tendencies. Only mention loyalty if it's notably high or low relative to the league. Keep it analytical but entertaining. Return ONLY the analysis text, no JSON.`;

  let analysis = manager.analysis; // fallback to data-driven
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await callGeminiWithRetry(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }));
    const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) analysis = text.trim();
  } catch {
    const deepSeekResult = await callDeepSeek(prompt);
    if (deepSeekResult) analysis = deepSeekResult.trim();
  }

  res.json({ tendency: { ...manager, analysis, topPositions, fromAI: analysis !== manager.analysis } });
});

// Fetch and cache season fantasy points for all players in a league/season draft
app.post('/api/draft-stats/:leagueKey/:season', async (req, res) => {
  const { leagueKey, season } = req.params;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No Authorization header' });

  // Check DB cache first — if any points are already stored, return them
  const cachedRows = db.db.prepare(
    `SELECT player_key, season_points FROM draft_picks WHERE league_key = ? AND season = ? AND player_key != '' AND season_points IS NOT NULL`
  ).all(leagueKey, season) as Array<{ player_key: string; season_points: number }>;

  if (cachedRows.length > 0) {
    const cachedPoints: Record<string, number> = {};
    for (const r of cachedRows) cachedPoints[r.player_key] = r.season_points;
    console.log(`💾 Returning ${cachedRows.length} cached season points for ${leagueKey}/${season}`);
    return res.json({ points: cachedPoints });
  }

  // Get all player keys stored for this league/season
  const rows = db.db.prepare(
    `SELECT player_key FROM draft_picks WHERE league_key = ? AND season = ? AND player_key != ''`
  ).all(leagueKey, season) as Array<{ player_key: string }>;

  if (rows.length === 0) return res.json({ points: {} });

  const playerKeys = rows.map(r => r.player_key);
  const BATCH = 25;
  const points: Record<string, number> = {};

  for (let i = 0; i < playerKeys.length; i += BATCH) {
    const batch = playerKeys.slice(i, i + BATCH).join(',');
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/players;player_keys=${batch};out=stats?format=json`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: authHeader, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });
      const leagueArr = response.data?.fantasy_content?.league;
      const playersObj = Array.isArray(leagueArr) ? leagueArr[1]?.players : null;
      if (!playersObj) continue;
      const count = playersObj.count || 0;
      for (let j = 0; j < count; j++) {
        const playerArr = playersObj[j]?.player;
        if (!Array.isArray(playerArr)) continue;
        const meta = playerArr[0];
        const statsBlock = playerArr[1];
        // player key is in meta array
        const playerKey = Array.isArray(meta) ? meta.find((m: any) => m?.player_key)?.player_key : meta?.player_key;
        const total = statsBlock?.player_points?.total ?? statsBlock?.player_stats?.total;
        if (playerKey && total !== undefined) {
          points[playerKey] = parseFloat(total) || 0;
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ Stats batch ${i}-${i + BATCH} failed:`, err.message);
    }
  }

  // Persist to DB
  db.updateDraftPickPoints(leagueKey, season, points);
  console.log(`✅ Stored season points for ${Object.keys(points).length} players in ${leagueKey}/${season}`);
  res.json({ points });
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

// Get cached aggregated data, optionally scoped to a comma-separated list of leagueKeys
app.get('/api/cache/aggregated', (req, res) => {
  try {
    const leagueKeysParam = req.query.leagueKeys as string | undefined;
    const leagueKeys = leagueKeysParam ? leagueKeysParam.split(',').filter(Boolean) : [];

    const data = leagueKeys.length > 0
      ? cacheService.getCachedAggregatedDataForLeagues(leagueKeys)
      : cacheService.getCachedAggregatedData();
    const cachedSeasons = leagueKeys.length > 0
      ? db.getCachedSeasonsByLeagueKeys(leagueKeys)
      : db.getCachedSeasons();

    console.log(`📋 GET aggregated: managers=${data.length} cachedSeasons=[${cachedSeasons.join(',')}]${leagueKeys.length ? ` (scoped to ${leagueKeys.length} leagues)` : ''}`);
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
    console.log(`📋 GET tendencies: count=${tendencies.length} needsUpdate=${needsUpdate}`);
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

// Save current roster snapshot (with acquisition data) for a league
app.post('/api/cache/current-rosters', (req, res) => {
  try {
    const { leagueKey, season, teams, entries } = req.body;
    if (!leagueKey || !season || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'leagueKey, season, and entries[] required' });
    }

    // Ensure the league row exists (FK for teams)
    db.cacheLeague(leagueKey, `League ${season}`, season, leagueKey.split('.')[0] || '');

    // Ensure all referenced teams exist in the teams table
    if (Array.isArray(teams)) {
      for (const t of teams) {
        if (t.teamKey) {
          db.cacheTeam(t.teamKey, leagueKey, t.teamName || '', t.managerId || '', t.managerName || '', season);
        }
      }
    }

    // Ensure all referenced players exist in the players table
    for (const e of entries) {
      if (e.playerName && e.playerId) {
        db.cachePlayer(e.playerId, e.playerName, e.position || '', e.nflTeam || '');
      }
    }

    // Compute is_keeper_ineligible once at save time so reads are instant
    const tradeDeadline = db.getTradeDeadline(leagueKey);
    const deadlineMs = tradeDeadline ? new Date(tradeDeadline + 'T23:59:59').getTime() : null;
    const roundByPlayerId = db.getDraftRoundsForLeague(leagueKey);
    const everKeptIds = db.getEverKeptPlayerIds();

    // Kept 2+ consecutive years → no longer eligible
    const chain = db.getChainContaining(leagueKey);
    const chainKeys = chain ? chain.map((c: any) => c.leagueKey) : [];
    const priorSeason = String(Number(season) - 1);
    const timesKeptById = db.getTimesKeptPerPlayer(chainKeys, priorSeason);

    const enriched = entries.map((e: any) => {
      const draftRound = roundByPlayerId.get(e.playerId);
      const wasEverKept = everKeptIds.has(e.playerId);
      const timesKept = timesKeptById.get(e.playerId) || 0;
      const isPostDeadline = !!deadlineMs && !!e.acquisitionDate
        && (e.acquisitionType === 'freeagent' || e.acquisitionType === 'waivers')
        && new Date(e.acquisitionDate).getTime() > deadlineMs;
      const isTopRound = !wasEverKept && draftRound !== undefined && draftRound <= 4;
      const isMaxKept = timesKept >= 2;
      return { ...e, isKeeperIneligible: isPostDeadline || isTopRound || isMaxKept };
    });

    db.saveCurrentRosters(leagueKey, season, enriched);
    console.log(`💾 Saved current rosters for ${leagueKey} season ${season}: ${enriched.length} entries`);
    res.json({ success: true, count: enriched.length });
  } catch (err: any) {
    console.error('Failed to save current rosters:', err);
    res.status(500).json({ error: 'Failed to save current rosters', message: err.message });
  }
});

// FantasyCalc dynasty rankings — cached in DB for 24 hours
app.get('/api/fantasycalc/rankings', async (req, res) => {
  try {
    const FANTASYCALC_URL = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1';
    const cacheAge = db.getFantasyCalcCacheAge();
    const isFresh = cacheAge !== null && (Date.now() - cacheAge.getTime()) < 24 * 60 * 60 * 1000;

    if (isFresh) {
      return res.json({ players: db.getAllFantasyCalcRankings(), cached: true });
    }

    const response = await fetch(FANTASYCALC_URL);
    if (!response.ok) throw new Error(`FantasyCalc API error: ${response.status}`);
    const data = await response.json() as Array<{
      player: { id: number; name: string; position: string };
      overallRank: number;
      positionRank: number;
      value: number;
    }>;

    db.saveFantasyCalcRankings(data.map(p => ({
      fcId: p.player.id,
      playerName: p.player.name,
      position: p.player.position,
      overallRank: p.overallRank,
      positionRank: p.positionRank,
      value: p.value,
    })));

    return res.json({ players: db.getAllFantasyCalcRankings(), cached: false });
  } catch (err: any) {
    console.error('FantasyCalc rankings error:', err);
    res.status(500).json({ error: 'Failed to fetch FantasyCalc rankings', message: err.message });
  }
});

// Store trade deadline for a league (called by frontend after fetching from Yahoo)
app.post('/api/cache/trade-deadline', (req, res) => {
  try {
    const { leagueKey, raw } = req.body;
    if (!leagueKey || !raw) return res.status(400).json({ error: 'leagueKey and raw required' });
    db.setTradeDeadline(leagueKey, raw);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get cached current roster for a league — is_keeper_ineligible is a stored column, no computation here
app.get('/api/cache/current-rosters/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    // Prefer explicit season param; fall back to what's stored for this league in the DB
    const season = (req.query.season as string) || db.getLeagueSeason(leagueKey) || new Date().getFullYear().toString();
    console.log(`📋 GET current-rosters: leagueKey=${leagueKey} season=${season}`);
    const rows = db.getCachedCurrentRosters(leagueKey, season);
    console.log(`   → ${rows.length} rows found`);
    const cacheAge = db.getCurrentRosterCacheAge(leagueKey, season);

    const teamsMap = new Map<string, any>();
    for (const row of rows) {
      if (!teamsMap.has(row.team_key)) {
        teamsMap.set(row.team_key, {
          teamKey: row.team_key,
          teamName: row.team_name,
          managerName: row.manager_name,
          managerId: row.manager_id,
          players: [],
        });
      }
      teamsMap.get(row.team_key).players.push({
        playerId: row.player_id,
        playerName: row.player_name,
        position: row.position,
        nflTeam: row.nfl_team,
        acquisitionType: row.acquisition_type,
        acquisitionDate: row.acquisition_date,
        isOnIR: row.is_on_ir === 1,
        isKeeperIneligible: row.is_keeper_ineligible === 1,
      });
    }

    res.json({
      rosters: Array.from(teamsMap.values()),
      cacheAge: cacheAge?.toISOString() || null,
      season,
    });
  } catch (err: any) {
    console.error('Failed to get current rosters:', err);
    res.status(500).json({ error: 'Failed to get current rosters', message: err.message });
  }
});

// Clear current roster cache for a league so a fresh fetch+recompute happens
app.delete('/api/cache/current-rosters/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const season = (req.query.season as string) || db.getLeagueSeason(leagueKey) || new Date().getFullYear().toString();
    db.db.prepare('DELETE FROM roster_entries WHERE league_key = ? AND season = ?').run(leagueKey, season);
    console.log(`🗑️ Cleared roster cache for ${leagueKey} season ${season}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save a batch of transaction rows for a league
app.post('/api/cache/transactions', (req, res) => {
  try {
    const { leagueKey, rows } = req.body;
    if (!leagueKey || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'leagueKey and rows[] required' });
    }
    db.cacheTransactions(leagueKey, rows);
    console.log(`💾 Cached ${rows.length} transactions for ${leagueKey}`);
    res.json({ success: true, count: rows.length });
  } catch (err: any) {
    console.error('Failed to cache transactions:', err);
    res.status(500).json({ error: 'Failed to cache transactions', message: err.message });
  }
});

// Get cached transactions for a league/season
app.get('/api/cache/transactions/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const season = (req.query.season as string) || new Date().getFullYear().toString();
    const rows = db.getTransactionsForLeague(leagueKey, season);
    const count = db.getTransactionCount(leagueKey, season);
    const latestTs = db.getLatestTransactionTimestamp(leagueKey, season);
    res.json({ rows, count, latestTimestamp: latestTs, season });
  } catch (err: any) {
    console.error('Failed to get transactions:', err);
    res.status(500).json({ error: 'Failed to get transactions', message: err.message });
  }
});

// Look up acquisition info for a specific player+team
app.get('/api/cache/transactions/:leagueKey/player/:playerKey', (req, res) => {
  try {
    const { leagueKey, playerKey } = req.params;
    const teamKey = req.query.teamKey as string;
    if (!teamKey) return res.status(400).json({ error: 'teamKey query param required' });
    const acq = db.getPlayerAcquisition(playerKey, teamKey, leagueKey);
    res.json({ acquisition: acq });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get acquisition', message: err.message });
  }
});

// Bulk resolve player names from player_keys
app.post('/api/players/resolve', (req, res) => {
  try {
    const { playerKeys } = req.body;
    if (!Array.isArray(playerKeys)) {
      return res.status(400).json({ error: 'playerKeys array required' });
    }
    const resolved = db.resolvePlayersByKeys(playerKeys);
    res.json({ players: resolved });
  } catch (err: any) {
    console.error('❌ Failed to resolve players:', err);
    res.status(500).json({ error: 'Failed to resolve players', message: err.message });
  }
});

// Bulk cache teams (used for migration/seeding)
app.post('/api/cache/teams', (req, res) => {
  try {
    const { teams } = req.body;
    if (!Array.isArray(teams)) return res.status(400).json({ error: 'teams array required' });
    for (const t of teams) {
      db.cacheLeague(t.leagueKey, `League ${t.season}`, t.season, t.leagueKey.split('.')[0] || '');
      db.cacheTeam(t.teamKey, t.leagueKey, t.teamName || '', t.managerId || '', t.managerName || '', t.season);
    }
    res.json({ success: true, count: teams.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to cache teams', message: err.message });
  }
});

// Cache draft results for a league season
app.post('/api/cache/draft', (req, res) => {
  try {
    const { leagueKey, season, picks, trades, rootKey, chain } = req.body;
    if (!leagueKey || !season || !Array.isArray(picks)) {
      return res.status(400).json({ error: 'leagueKey, season, and picks array required' });
    }
    console.log(`📥 Caching draft data for ${season} (${leagueKey}) - ${picks.length} picks`);
    db.cacheDraftPicks(picks.map((p: any) => ({ ...p, leagueKey, season })));
    if (Array.isArray(trades) && trades.length > 0) {
      db.cacheDraftPickTrades(leagueKey, trades);
      console.log(`🔄 Cached ${trades.length} traded picks for ${season}`);
    }
    // Atomically store the league chain when provided (sent with the root/current season's picks)
    if (rootKey && Array.isArray(chain) && chain.length > 0) {
      db.storeLeagueChain(rootKey, chain);
      console.log(`💾 Stored draft chain for ${rootKey}: ${chain.length} seasons`);
    }
    console.log(`✅ Cached ${picks.length} draft picks for ${season}`);
    res.json({ success: true, count: picks.length });
  } catch (err: any) {
    console.error('❌ Failed to cache draft data:', err);
    res.status(500).json({ error: 'Failed to cache draft data', message: err.message });
  }
});

// Store the league chain for a root key (called after first full traversal)
app.post('/api/cache/draft/chain', (req, res) => {
  try {
    const { rootKey, chain } = req.body;
    if (!rootKey || !Array.isArray(chain)) {
      return res.status(400).json({ error: 'rootKey and chain array required' });
    }
    db.storeLeagueChain(rootKey, chain);
    console.log(`💾 Stored draft chain for ${rootKey}: ${chain.length} seasons`);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`❌ Failed to store chain for ${req.body?.rootKey}:`, err.message);
    res.status(500).json({ error: 'Failed to store chain', message: err.message });
  }
});

// Get full draft data for a known chain in one request (avoids Yahoo API traversal)
app.get('/api/cache/draft/chain/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const chain = db.getLeagueChain(leagueKey);
    console.log(`📋 GET draft/chain: leagueKey=${leagueKey} chainFound=${!!chain} chainLen=${chain?.length ?? 0}`);
    if (!chain) return res.json({ found: false });

    const seasons = chain.map(({ leagueKey: lk, season }) => {
      const picks = db.hasDraftData(lk) ? db.getDraftResultsForLeague(lk) : [];
      const hasNames = picks.some(p => p.player_name && p.player_name.length > 0);
      console.log(`  season=${season} lk=${lk} picks=${picks.length} hasNames=${hasNames}`);
      return { leagueKey: lk, season, picks, hasNames };
    });

    // A season with 0 picks is OK (draft hasn't happened yet) — but at least one season must have picks
    const allCached = seasons.some(s => s.picks.length > 0) && seasons.every(s => s.picks.length === 0 || s.hasNames);
    console.log(`  allCached=${allCached}`);
    res.json({ found: true, allCached, seasons });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get chain', message: err.message });
  }
});

// Clear cached draft data for a league (and its full historical chain)
app.delete('/api/cache/draft/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const result = db.clearDraftCacheForChain(leagueKey);
    console.log(`🗑️ Cleared draft cache for chain containing ${leagueKey}: ${result.deletedPicks} picks, leagues: ${result.leaguesCleared.join(', ')}`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('❌ Failed to clear draft cache:', err);
    res.status(500).json({ error: 'Failed to clear draft cache', message: err.message });
  }
});

// Get/set league settings (keeper flag + max keepers)
app.get('/api/league-settings/:leagueKey', (req, res) => {
  const { leagueKey } = req.params;
  res.json({
    isKeeperLeague: db.getIsKeeperLeague(leagueKey),
    maxKeepers: db.getMaxKeepers(leagueKey),
    maxYearsKept: db.getMaxYearsKept(leagueKey),
  });
});

app.post('/api/league-settings/:leagueKey', (req, res) => {
  const { leagueKey } = req.params;
  const { isKeeperLeague, maxKeepers, maxYearsKept } = req.body;
  if (isKeeperLeague !== undefined) {
    if (typeof isKeeperLeague !== 'boolean') return res.status(400).json({ error: 'isKeeperLeague must be boolean' });
    db.setIsKeeperLeague(leagueKey, isKeeperLeague);
  }
  if (maxKeepers !== undefined) {
    const val = maxKeepers === null ? null : Number(maxKeepers);
    if (maxKeepers !== null && (isNaN(val as number) || (val as number) < 0)) return res.status(400).json({ error: 'maxKeepers must be a non-negative number or null' });
    db.setMaxKeepers(leagueKey, val);
  }
  if (maxYearsKept !== undefined) {
    const val = maxYearsKept === null ? null : Number(maxYearsKept);
    if (maxYearsKept !== null && (isNaN(val as number) || (val as number) < 1)) return res.status(400).json({ error: 'maxYearsKept must be a positive number or null' });
    db.setMaxYearsKept(leagueKey, val);
  }
  res.json({ success: true });
});

// Get cached draft results for a league
app.get('/api/cache/draft/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const exists = db.hasDraftData(leagueKey);
    const picks = exists ? db.getDraftResultsForLeague(leagueKey) : [];
    res.json({ picks, count: picks.length, exists });
  } catch (err: any) {
    console.error('❌ Failed to get draft data:', err);
    res.status(500).json({ error: 'Failed to get draft data', message: err.message });
  }
});

// Get keeper summary for upcoming year (grouped by manager, with consecutive-year streaks)
app.get('/api/keepers/summary/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const chain = db.getLeagueChain(leagueKey);
    if (!chain || chain.length === 0) return res.json({ upcomingYear: null, managers: [] });

    // Derive most recent season from the chain itself (don't require keepers to exist)
    const sortedChain = [...chain].sort((a: any, b: any) => Number(b.season) - Number(a.season));
    const mostRecentChainEntry = sortedChain[0] as any;
    const mostRecentSeason = mostRecentChainEntry.season as string;
    const mostRecentLeagueKey = mostRecentChainEntry.leagueKey as string;
    const upcomingYear = String(Number(mostRecentSeason) + 1);

    const chainLeagueKeys = chain.map((c: any) => c.leagueKey);
    const allKeepers = db.getKeeperSummaryForChain(chainLeagueKeys);

    // Normalize player_key to just the numeric ID so cross-season comparisons work
    // e.g. "423.p.30977" (2024) and "420.p.30977" (2023) both map to "30977"
    const extractPlayerId = (playerKey: string): string => {
      const m = playerKey.match(/\.p\.(\d+)$/);
      return m ? m[1] : playerKey;
    };

    // Build a set of seasons each player has been kept (for consecutive count)
    const playerKeptSeasons: Record<string, Set<number>> = {};
    for (const k of allKeepers) {
      const pid = extractPlayerId(k.player_key);
      if (!playerKeptSeasons[pid]) playerKeptSeasons[pid] = new Set();
      playerKeptSeasons[pid].add(Number(k.season));
    }

    const getConsecutiveYears = (playerKey: string): number => {
      const kept = playerKeptSeasons[extractPlayerId(playerKey)] || new Set();
      let count = 0;
      let year = Number(mostRecentSeason);
      while (kept.has(year)) { count++; year--; }
      return count;
    };

    // Seed map with ALL teams from most recent league so every manager gets a card
    const managerMap: Record<string, { teamKey: string; managerName: string; keepers: any[] }> = {};
    for (const t of db.getTeamsForLeague(mostRecentLeagueKey)) {
      managerMap[t.team_key] = { teamKey: t.team_key, managerName: t.manager_name, keepers: [] };
    }

    // Add draft-based keepers
    const currentKeepers = allKeepers.filter((k: any) => k.season === mostRecentSeason);
    for (const k of currentKeepers) {
      if (!managerMap[k.team_key]) {
        managerMap[k.team_key] = { teamKey: k.team_key, managerName: k.manager_name, keepers: [] };
      }
      managerMap[k.team_key].keepers.push({
        playerKey: k.player_key,
        playerName: k.player_name,
        position: k.position,
        nflTeam: k.nfl_team,
        roundDrafted: k.round,
        keeperCost: k.round - 1,
        consecutiveYears: getConsecutiveYears(k.player_key),
        isManual: false,
      });
    }

    // Add manual keepers
    for (const mk of db.getManualKeepersForLeague(mostRecentLeagueKey)) {
      if (managerMap[mk.team_key]) {
        managerMap[mk.team_key].keepers.push({
          playerKey: mk.player_key || '',
          playerName: mk.player_name,
          position: mk.position,
          nflTeam: mk.nfl_team,
          roundDrafted: 0,
          keeperCost: 0,
          consecutiveYears: mk.player_key ? getConsecutiveYears(mk.player_key) : 0,
          isManual: true,
        });
      }
    }

    // Resolve keeper cost conflicts: if two keepers would cost the same round,
    // bump one to roundDrafted - 2 (one round earlier than the conflict round)
    for (const m of Object.values(managerMap)) {
      const usedCosts = new Set<number>();
      for (const keeper of m.keepers as any[]) {
        if (keeper.isManual || keeper.keeperCost <= 0) continue;
        if (usedCosts.has(keeper.keeperCost)) {
          keeper.keeperCost = keeper.roundDrafted - 2;
        }
        usedCosts.add(keeper.keeperCost);
      }
    }

    for (const m of Object.values(managerMap)) {
      m.keepers.sort((a: any, b: any) => {
        if (a.isManual && !b.isManual) return 1;
        if (!a.isManual && b.isManual) return -1;
        return a.keeperCost - b.keeperCost;
      });
    }

    const managers = Object.values(managerMap).sort((a: any, b: any) => a.managerName.localeCompare(b.managerName));

    // Players kept INTO the current season (designated from the prior season)
    // timesKept = consecutive years the player was kept, counting backwards from priorSeason
    const priorSeason = String(Number(mostRecentSeason) - 1);
    const getTimesKept = (playerKey: string): number => {
      const kept = playerKeptSeasons[extractPlayerId(playerKey)] || new Set();
      let count = 0;
      let year = Number(priorSeason);
      while (kept.has(year)) { count++; year--; }
      return count;
    };
    const keptIntoCurrentSeason = allKeepers
      .filter((k: any) => k.season === priorSeason)
      .map((k: any) => ({ playerName: k.player_name as string, timesKept: getTimesKept(k.player_key) }));

    res.json({ upcomingYear, managers, leagueKey: mostRecentLeagueKey, keptIntoCurrentSeason });
  } catch (err: any) {
    console.error('Failed to get keeper summary:', err);
    res.status(500).json({ error: 'Failed to get keeper summary', message: err.message });
  }
});

// Player search for keeper autocomplete
app.get('/api/players/search', (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json({ players: [] });
    const players = db.searchPlayers(q, 10);
    res.json({ players });
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// Add a manual keeper
app.post('/api/keepers/manual', (req, res) => {
  try {
    const { leagueKey, teamKey, playerKey, playerName, position, nflTeam } = req.body;
    if (!leagueKey || !teamKey || !playerName) {
      return res.status(400).json({ error: 'leagueKey, teamKey, and playerName required' });
    }
    db.addManualKeeper(leagueKey, teamKey, playerKey || '', playerName, position || '', nflTeam || '');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add manual keeper', message: err.message });
  }
});

// Remove a manual keeper
app.delete('/api/keepers/manual', (req, res) => {
  try {
    const { leagueKey, teamKey, playerName } = req.body;
    if (!leagueKey || !teamKey || !playerName) {
      return res.status(400).json({ error: 'leagueKey, teamKey, and playerName required' });
    }
    db.removeManualKeeper(leagueKey, teamKey, playerName);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove manual keeper', message: err.message });
  }
});

// Get keeper designations for a league
app.get('/api/keepers/:leagueKey', (req, res) => {
  try {
    const { leagueKey } = req.params;
    const keepers = db.getKeepersForLeague(leagueKey);
    res.json({ keepers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get keepers', message: err.message });
  }
});

// Toggle a keeper designation (pick = overall pick number in the draft)
app.post('/api/keepers/toggle', (req, res) => {
  try {
    const { leagueKey, pick } = req.body;
    if (!leagueKey || pick === undefined) return res.status(400).json({ error: 'leagueKey and pick are required' });
    const isKeeper = db.toggleKeeper(leagueKey, Number(pick));
    res.json({ isKeeper, pick });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle keeper', message: err.message });
  }
});

// Bulk set keeper designations (idempotent, used for migration)
app.post('/api/keepers/bulk', (req, res) => {
  try {
    const { keepers } = req.body; // [{leagueKey, pick}]
    if (!Array.isArray(keepers)) return res.status(400).json({ error: 'keepers array required' });
    db.bulkSetKeepers(keepers);
    res.json({ success: true, count: keepers.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to bulk set keepers', message: err.message });
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

// Serve built frontend in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Yahoo Fantasy Backend running on port ${PORT}`);
  console.log(`📍 Redirect URI: ${REDIRECT_URI}`);
  console.log(`💾 Database initialized and ready`);
});