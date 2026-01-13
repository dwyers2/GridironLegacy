
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration - In a real app, these come from secure environment variables
const CLIENT_ID = process.env.YAHOO_CLIENT_ID || 'dj0yJmk9M2t6VlVNSERHa2dRJmQ9WVdrOVNEUTNjWEZKTXpRbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1lNA--';
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET || '011a5070590e2debc9221fc832ce7ce51f7e9640';
// Fixed REDIRECT_URI syntax from previous iteration
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://nonexotically-nonphonetical-aidan.ngrok-free.dev'; 

// Fix: Address 'NextHandleFunction' vs 'PathParams' mismatch by casting to any
app.use(cors() as any);
app.use(express.json() as any);

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

// 4. Gemini Insights Endpoint
app.post('/api/insights', async (req, res) => {
  const { playerData } = req.body;
  
  const prompt = `Analyze this fantasy football ownership history. 
  Player Data: ${JSON.stringify(playerData)}
  
  Provide 3 key insights about this manager's legacy in the league. 
  1. Highlight their most successful "Frequent Pick" (high starts, high points).
  2. Identify a "Missed Opportunity" (player they owned but often benched while they scored well).
  3. A "League Rival's Jewel" (player they never get, but always hurts them).
  
  Keep it concise and punchy in a JSON format.`;

  // Fix: Initialize GoogleGenAI right before the API call to ensure use of the latest environment configuration
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            frequentPick: { type: Type.STRING },
            missedOpportunity: { type: Type.STRING },
            rivalJewel: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          // Fix: Use propertyOrdering instead of required to match SDK guidelines
          propertyOrdering: ["frequentPick", "missedOpportunity", "rivalJewel", "summary"]
        }
      }
    });

    // Fix: Access response.text property directly as a getter (not a method)
    const text = response.text?.trim() || "{}";
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini Error:", error);
    res.status(500).json({
      frequentPick: "Historical Stalwart - Analysis failed.",
      missedOpportunity: "Unknown potential.",
      rivalJewel: "League Rival - Shadow hidden.",
      summary: "We couldn't reach the scouter's office. Using default legacy profile."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
