
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'express-dom';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration - In a real app, these come from secure environment variables
const CLIENT_ID = process.env.YAHOO_CLIENT_ID || 'dj0yJmk9M2t6VlVNSERHa2dRJmQ9WVdrOVNEUTNjWEZKTXpRbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1lNA--';
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET || '011a5070590e2debc9221fc832ce7ce51f7e9640';
const REDIRECT_URI = process.env.REDIRECT_URI || ''https://nonexotically-nonphonetical-aidan.ngrok-free.dev'; // Should match the frontend origin

app.use(cors());
app.use(express.json());

// 1. Auth URL Generation
app.get('/api/auth/url', (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'fspt-r',
  });
  res.json({ url: `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}` });
});

// 2. Token Exchange
app.post('/api/auth/token', async (req, res) => {
  const { code } = req.body;
  try {
    const response = await axios.post('https://api.login.yahoo.com/oauth2/get_token', 
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// 3. Yahoo API Proxy
// This handles CORS and adds the Bearer token
app.get('/api/yahoo/*', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const yahooPath = req.params[0];
  const queryString = new URLSearchParams(req.query as any).toString();
  const url = `https://fantasysports.yahooapis.com/fantasy/v2/${yahooPath}${queryString ? '?' + queryString : ''}`;

  try {
    const response = await axios.get(url, {
      headers: { 
        'Authorization': token,
        'Accept': 'application/json'
      },
      params: { format: 'json' }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Yahoo API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'API request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
