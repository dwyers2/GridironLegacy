# GridironLegacy Setup & Troubleshooting Guide

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

This will install the new required packages:
- `tsx` - TypeScript execution for the backend
- `concurrently` - Run frontend and backend simultaneously
- `dotenv` - Load environment variables
- `@types/node` - TypeScript types for Node.js

### 2. Configure Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Gemini AI API Key
GEMINI_API_KEY=your_actual_gemini_key

# Yahoo Fantasy Sports API Credentials
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret

# OAuth Redirect URI (must match Yahoo Developer Console)
REDIRECT_URI=https://your-ngrok-url.ngrok-free.app

# Backend Server Port
PORT=3001
```

### 3. Get Yahoo API Credentials

1. Go to https://developer.yahoo.com/apps/
2. Create a new app
3. Choose **"Installed Application"** type (for PKCE flow)
4. Copy the Client ID and Client Secret
5. Set the Redirect URI (use your ngrok URL for local development)

### 4. Setup ngrok (for local development)

Yahoo OAuth requires HTTPS, so you need ngrok:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok on port 3000 (Vite default)
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`) and:
- Add it to your `.env` as `REDIRECT_URI`
- Add it to your Yahoo Developer Console app settings

## Running the Application

### Option 1: Run Everything Together (Recommended)

```bash
npm run dev:all
```

This runs both the frontend (Vite) and backend (Express) concurrently.

### Option 2: Run Separately

Terminal 1 - Backend:
```bash
npm run backend
```

Terminal 2 - Frontend:
```bash
npm run dev
```

## Diagnosing Yahoo API 500 Errors

The application now has comprehensive logging. Here's what to check:

### 1. Check Backend is Running

Look for this startup message:
```
🔧 Configuration:
  CLIENT_ID: dj0yJmk9dnRMc3llQWFT...
  CLIENT_SECRET: ***cret
  REDIRECT_URI: https://your-url.ngrok-free.app
  PORT: 3001

🚀 Yahoo Fantasy Backend running on port 3001
```

### 2. Check Browser Console

Open Developer Tools (F12) and look for:
- `📋 Fetching leagues...` - Frontend is trying to fetch
- `🔗 URL:` - Shows the exact API endpoint being called
- `🎫 Token` - Confirms access token exists
- Error messages with status codes

### 3. Check Backend Logs

When the backend proxies requests, you'll see:

**Successful Request:**
```
🔗 Proxying Yahoo API request:
  Path: users;use_login=1/games;game_keys=nfl/leagues
  Full URL: https://fantasysports.yahooapis.com/fantasy/v2/...
  Auth: Bearer ya29.a0AfB_byD...
  Query Params: { format: 'json' }

✅ Yahoo API response received
  Status: 200
  Response Type: object
  Has fantasy_content: true
```

**Failed Request (with detailed error info):**
```
❌ Yahoo API proxy error:
  URL: https://fantasysports.yahooapis.com/...
  Status: 500
  Status Text: Internal Server Error
  Response Data: { ... }
  Yahoo API Server Error - This is on Yahoo's side
```

### 4. Common Error Causes & Solutions

#### Error: `No access token`
**Cause:** Not logged in or token expired
**Solution:** Click "Connect Yahoo Account" again

#### Error: `401 Unauthorized`
**Cause:** Invalid or expired access token
**Solution:**
- Check that your Yahoo app credentials are correct
- Token expires after 1 hour - the app should auto-refresh
- Clear localStorage and re-authenticate

#### Error: `403 Forbidden`
**Cause:** The Yahoo app itself is not authorized for Fantasy Sports access.
**Solution:** In the Yahoo Developer Console, verify the app has Fantasy Sports read access enabled, then re-run login and approve the consent screen again. If you are using the wrong Yahoo app credentials on Fly, update the Fly secrets and re-deploy.

#### Error: `500 Internal Server Error`
**Cause:** Yahoo's API is having issues OR incorrect API endpoint
**Solutions:**
1. Check the logged URL - does it match Yahoo's API format?
2. Try the request again after a few minutes
3. Check Yahoo's API status page
4. Verify the league ID format is correct (e.g., `423.l.123456`)

#### Error: `Cannot connect to backend`
**Cause:** Backend server not running
**Solution:**
```bash
npm run backend
```

#### Error: `CORS error`
**Cause:** Backend CORS misconfiguration
**Solution:** Already configured - should not happen

### 5. Test API Endpoints Manually

You can test the Yahoo API directly using curl:

```bash
# Get auth URL
curl http://localhost:3001/api/auth/url

# Test Yahoo API proxy (replace TOKEN with your access token)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/api/yahoo/users;use_login=1/games;game_keys=nfl/leagues
```

## Understanding Yahoo API Response Structure

Yahoo's Fantasy API uses an unusual nested array structure:

```javascript
{
  fantasy_content: {
    users: [
      {
        user: [
          { /* user metadata */ },
          {
            games: {
              count: 1,
              0: {
                game: [
                  { /* game metadata */ },
                  {
                    leagues: {
                      count: 2,
                      0: { league: [...] },
                      1: { league: [...] }
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    ]
  }
}
```

The code has been updated to properly parse this structure.

## Production Deployment

For production:

1. Use a real domain instead of ngrok
2. Set `NODE_ENV=production` in `.env`
3. Build the app:
   ```bash
   npm run build
   npm run build:backend
   ```
4. Run the production server:
   ```bash
   npm start
   ```

## Still Having Issues?

1. Check all console logs (browser + backend terminal)
2. Verify your Yahoo app settings match your `.env`
3. Make sure ngrok is running and the URL matches
4. Try clearing localStorage and cookies
5. Check that you're using the correct Yahoo API endpoints

The enhanced logging will help pinpoint exactly where the failure occurs!
