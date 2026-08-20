# Dynasty Alchemy

Dynasty Alchemy is a fantasy-football dynasty analytics app built around Yahoo Fantasy data. It tracks multi-season drafts, rosters, player ownership, keepers, trades, and manager tendencies in a local SQLite cache.

## Features

- **Draft History** — Snake and auction draft boards across cached seasons, traded-pick indicators, keeper markers, and optional fantasy-points overlays.
- **New Draft Board** — A local planning board for the upcoming draft with saved team order, keeper prefills, position view, player search, and future traded-pick markers.
- **Keeper Management** — Keeper designations, streaks, keeper costs, eligibility rules, per-team limits, audit log, and manual keepers.
- **Current Rosters** — Cached roster snapshots with acquisition details and keeper eligibility.
- **Player Ownership** — Multi-season ownership and manager history scoped to the selected league chain.
- **Manager Tendencies** — Data-driven and AI-assisted manager profiles.
- **Dynasty Rankings** — FantasyCalc dynasty values integrated into player views.
- **Multi-league support** — Switch between Yahoo leagues and preserved historical league chains.
- **Cached recovery mode** — Read and update locally cached data when Yahoo Fantasy API access is unavailable.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Express 4, Node 20, TSX |
| Database | SQLite with `better-sqlite3` and WAL mode |
| Authentication | Yahoo OAuth 2.0 confidential-client flow |
| AI | Google Gemini API |
| Deployment | Fly.io with Docker and a persistent volume |

## Requirements

- Node.js 20 or newer
- Yahoo OAuth client ID and secret
- Yahoo Fantasy Sports API access with read permission
- Gemini API key for AI-generated analysis
- HTTPS OAuth redirect URL for local development, usually provided by ngrok

Yahoo has moved Fantasy Sports API access toward an application submission and review process. If Fantasy Sports is no longer available in the normal Yahoo app-creation checklist, apply through the [Yahoo Fantasy Sports Developer Portal](https://sports.yahoo.com/developer/access/) using the existing App ID when applicable.

## Local Development

Install dependencies:

```bash
npm install
```

Create a root `.env` file:

```env
YAHOO_CLIENT_ID=your_yahoo_client_id
YAHOO_CLIENT_SECRET=your_yahoo_client_secret
REDIRECT_URI=https://your-ngrok-url.ngrok-free.app
GEMINI_API_KEY=your_gemini_api_key
PORT=3001
NODE_ENV=development
```

The redirect URI must exactly match the URI registered with Yahoo. Start an HTTPS tunnel to the frontend/backend flow as needed:

```bash
ngrok http 3000
```

Run the frontend and backend together:

```bash
npm run dev:all
```

The frontend runs at `http://localhost:3000` and the backend at `http://localhost:3001`. Vite proxies `/api` requests to the backend.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite frontend |
| `npm run dev:backend` | Start backend with `tsx watch` |
| `npm run dev:all` | Start frontend and backend together |
| `npm run build` | Build the production frontend |
| `npm run build:backend` | Compile the backend |
| `npm start` | Build and run the production server |

## Recovery Mode

Recovery mode is intended for the app owner when Yahoo access is unavailable. It authenticates with a server-side Fly secret, loads cached leagues, skips live Yahoo requests, and permits local cached-data writes such as keeper settings, keeper designations, and draft-board changes.

Configure it on Fly without committing the key:

```bash
fly secrets set CACHE_RECOVERY_CODE=your_private_recovery_code
```

The recovery session expires after 12 hours. The recovery key does not grant Yahoo API access and should be treated as a private administrative credential.

## Draft-Pick Trades

Yahoo’s web transaction history can show draft picks traded alongside players. The app stores future-pick ownership separately from completed draft results so upcoming draft trades can be displayed even when the Yahoo API is unavailable.

Future trades are represented by:

- Draft season
- Round
- Original/source team
- Destination team

When a pick is traded more than once, the New Draft Board uses the final owner while preserving the original pick source. This prevents a traded pick from being incorrectly assigned to the intermediate team’s own draft slot.

## Deployment

The production app is configured in `fly.toml` and stores SQLite data on the `dynasty_data` persistent volume. Configure production secrets before deployment:

```bash
fly secrets set \
  YAHOO_CLIENT_ID=... \
  YAHOO_CLIENT_SECRET=... \
  REDIRECT_URI=https://your-production-domain.example \
  GEMINI_API_KEY=... \
  CACHE_RECOVERY_CODE=...
```

Deploy manually with:

```bash
fly deploy
```

After deployment, verify the app at the Fly hostname and use `fly logs -a <app-name>` for backend and OAuth diagnostics.

## Troubleshooting Yahoo 403 Errors

If OAuth succeeds but the Fantasy API returns:

> This application is not authorized to perform this action.

the token exchange is working, but Yahoo is rejecting the Fantasy API request. Check:

1. The Yahoo Fantasy Sports API application request has been approved.
2. The app has private-user-data read permission.
3. Fly’s `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` belong to that same Yahoo app.
4. The production redirect URI matches exactly.
5. Existing Yahoo app access has been revoked before retrying consent.

If Yahoo access remains unavailable, use the configured recovery key to work with cached data.

## Data and Security Notes

- Yahoo access and refresh tokens are stored in the browser’s local storage by the current OAuth flow.
- Yahoo client secrets and recovery keys belong in environment variables or Fly secrets only.
- SQLite database files, WAL files, `.env` files, Fly credentials, and local tool configuration should not be committed.
- Recovery mode exposes the app’s cached league data to anyone with the recovery key; rotate the key if it is shared accidentally.

## Further Documentation

- [Setup and troubleshooting guide](SETUP.md)
- [Yahoo Fantasy Sports API documentation](https://sports.yahoo.com/developer/docs/)
- [Yahoo Fantasy API access application](https://sports.yahoo.com/developer/access/)
- [GitHub issues](https://github.com/dwyers2/GridironLegacy/issues)
