# Dynasty Alchemy

A fantasy football dynasty league analytics platform built on top of the Yahoo Fantasy Sports API. Track draft history, manage keepers, analyze manager tendencies, and get AI-powered insights across multiple seasons.

## Features

- **Draft History** — Full snake and auction draft boards across all seasons, with fantasy points overlay per pick
- **Keeper Board** — Designate and track keepers with streak badges, per-team limits, and eligibility rules
- **Player Ownership** — See which managers have owned which players across your league's history
- **Manager Tendencies** — AI-generated scouting reports on drafting and trading patterns per manager
- **Current Rosters** — Live roster snapshots with keeper eligibility highlighted; served from cache during offseason
- **Dynasty Rankings** — FantasyCalc dynasty value integrated into player views
- **Multi-league support** — Switch between leagues within the same Yahoo account; historical league chains preserved
- **Settings** — Per-league keeper league toggle and max keepers per team configuration

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite 6 |
| Backend | Express 4, Node 20, TSX |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | Yahoo OAuth 2.0 (Confidential Client) |
| AI | Google Gemini API |
| Deployment | Fly.io (Docker, persistent volume) |
| CI/CD | GitHub Actions |

## Prerequisites

- Node.js 20+
- A [Yahoo Developer app](https://developer.yahoo.com/apps/) with Fantasy Sports read permissions
- A [Gemini API key](https://aistudio.google.com/app/apikey)
- [ngrok](https://ngrok.com/) or similar for local OAuth redirect (Yahoo requires HTTPS)

## Local Setup

```bash
git clone https://github.com/dwyers2/GridironLegacy.git
cd GridironLegacy
npm install
```

Create a `.env` file in the project root:

```env
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
REDIRECT_URI=https://your-ngrok-url.ngrok.io/api/auth/callback
GEMINI_API_KEY=your_gemini_api_key
PORT=3001
NODE_ENV=development
```

> **Note:** Yahoo OAuth requires an HTTPS redirect URI even in development. Run `ngrok http 3001` and set `REDIRECT_URI` to your ngrok URL.

Start the development servers:

```bash
npm run dev:all
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

Vite proxies all `/api` requests to the backend automatically.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend (Vite, port 3000) |
| `npm run dev:backend` | Start backend with hot reload (tsx watch) |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Production frontend build |
| `npm run start` | Build + start production server |

## Deployment

The app deploys to [Fly.io](https://fly.io) via GitHub Actions on every push to `main`. A persistent volume (`dynasty_data`) at `/data` stores the SQLite database across deploys.

To deploy manually:

```bash
fly deploy
```

Set secrets on Fly.io:

```bash
fly secrets set YAHOO_CLIENT_ID=... YAHOO_CLIENT_SECRET=... REDIRECT_URI=... GEMINI_API_KEY=...
```

## Reporting Bugs

Open an issue at [github.com/dwyers2/GridironLegacy/issues](https://github.com/dwyers2/GridironLegacy/issues).
