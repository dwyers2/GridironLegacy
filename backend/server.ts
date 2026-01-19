import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = process.env.YAHOO_CLIENT_ID || 'dj0yJmk9dnRMc3llQWFTQkljJmQ9WVdrOVF6Y3diRVpEUjNjbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTA2';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://nonexotically-nonphonetical-aidan.ngrok-free.dev';

// ✅ PKCE Helper Functions
function base64URLEncode(str: Buffer): string {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(32);
  return base64URLEncode(buffer);
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

// Store code_verifier temporarily (in production, use Redis or session storage)
const verifierStore = new Map<string, string>();

app.use(cors());
app.use(express.json());

// 1️⃣ Generate Yahoo OAuth URL with PKCE
app.get('/api/auth/url', (req, res) => {
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Store verifier with a session ID (simple approach - use session middleware in production)
  const sessionId = crypto.randomBytes(16).toString('hex');
  verifierStore.set(sessionId, codeVerifier);
  
  console.log('🔐 Generated PKCE parameters:');
  console.log('  Code Verifier:', codeVerifier.substring(0, 20) + '...');
  console.log('  Code Challenge:', codeChallenge.substring(0, 20) + '...');
  console.log('  Session ID:', sessionId);
  
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile fspt-r',
    // ✅ PKCE parameters
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  const url = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  console.log('🔗 Generated OAuth URL with PKCE');
  
  res.json({ url, sessionId });
});

// 2️⃣ Exchange authorization code for tokens (with PKCE)
app.post('/api/auth/token', async (req, res) => {
  const { code, sessionId } = req.body;
  if (!code) return res.status(400).json({ error: 'No authorization code provided' });
  if (!sessionId) return res.status(400).json({ error: 'No session ID provided' });

  // Retrieve the code_verifier
  const codeVerifier = verifierStore.get(sessionId);
  if (!codeVerifier) {
    return res.status(400).json({ error: 'Invalid or expired session' });
  }

  console.log('🔄 Exchanging code for token with PKCE...');
  console.log('Code:', code.substring(0, 20) + '...');
  console.log('Code Verifier:', codeVerifier.substring(0, 20) + '...');

  try {
    const response = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
        // ✅ PKCE: Use code_verifier instead of client_secret
        code_verifier: codeVerifier,
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
    
    // Clean up the verifier
    verifierStore.delete(sessionId);

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

  console.log('🔗 Proxying Yahoo API request:');
  console.log('  Path:', path);
  console.log('  Full URL:', url);
  console.log('  Auth:', authHeader.substring(0, 30) + '...');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    console.log('✅ Yahoo API response received');
    console.log('  Status:', response.status);
    
    res.json(response.data);
  } catch (err: any) {
    console.error('❌ Yahoo API proxy error:');
    console.error('  Status:', err.response?.status);
    console.error('  Error:', err.response?.data || err.message);
    
    res.status(err.response?.status || 500).json({
      error: 'yahoo_api_error',
      yahoo_error: err.response?.data || { error: 'API request failed' },
      message: err.message,
      url: url
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Yahoo Fantasy Backend running on port ${PORT}`);
  console.log(`📍 Redirect URI: ${REDIRECT_URI}`);
  console.log(`🔐 Using PKCE flow (no client secret needed)`);
});