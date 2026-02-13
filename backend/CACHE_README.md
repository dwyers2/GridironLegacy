# GridironLegacy Database Cache System

## Overview

The backend now uses SQLite to cache historical roster data, dramatically improving performance and reducing Yahoo API calls.

## How It Works

### First Load (Cache Miss)
1. Frontend requests Manager Insights
2. Backend checks cache - finds nothing
3. Fetches all historical data from Yahoo API (slow, ~30-60 seconds)
4. **Automatically caches each season as it's fetched**
5. Returns aggregated data to frontend

### Subsequent Loads (Cache Hit)
1. Frontend requests Manager Insights
2. Backend checks cache - **finds data!**
3. Returns cached data instantly (~100ms)
4. No Yahoo API calls needed

## Database Schema

### Tables
- **leagues** - League metadata (name, season, game_id)
- **teams** - Team information (team name, manager, season)
- **players** - Unique player records (name, position, NFL team)
- **roster_entries** - Which players were on which teams in which seasons

### Cache Freshness
- Data is considered fresh for **7 days**
- After 7 days, system will re-fetch from Yahoo to catch roster changes
- Can manually clear cache via `/api/cache/clear` endpoint

## API Endpoints

### `GET /api/cache/aggregated`
Returns all cached manager ownership data (aggregated across all seasons).

**Response:**
```json
{
  "managers": [
    {
      "managerId": "GUID",
      "managerName": "John Doe",
      "seasonsTracked": ["2024", "2023", "2022"],
      "players": [
        {
          "playerId": "12345",
          "playerName": "Patrick Mahomes",
          "position": "QB",
          "team": "KC",
          "timesOwned": 3,
          "seasons": ["2024", "2023", "2022"]
        }
      ]
    }
  ],
  "count": 10,
  "cached": true
}
```

### `POST /api/cache/season`
Cache data for a single season.

**Request Body:** SeasonRosterData object

### `GET /api/cache/check/:leagueKey`
Check if a league's data is cached and whether it needs refreshing.

**Response:**
```json
{
  "exists": true,
  "shouldFetch": false,
  "cacheAge": "2024-01-15T10:30:00.000Z"
}
```

### `POST /api/cache/clear`
Clear all cached data (useful for testing or troubleshooting).

## Frontend Integration

The `yahooService.ts` automatically:
1. Checks cache first
2. Returns cached data instantly if available
3. Falls back to Yahoo API if cache miss
4. Caches new data as it's fetched

## Database Location

`backend/db/gridiron_legacy.db`

This is a SQLite database file. You can inspect it with tools like:
- [DB Browser for SQLite](https://sqlitebrowser.org/)
- `sqlite3` command-line tool

## Benefits

✅ **Instant load times** after first fetch
✅ **Reduced API calls** - no more rate limiting issues
✅ **Persistent data** - survives server restarts
✅ **Automatic caching** - no manual intervention needed
✅ **Smart freshness** - re-fetches stale data automatically

## Future Enhancements

- Weekly roster snapshots (currently only caches season rosters)
- Per-user caching (different users can have different leagues)
- Incremental updates (only fetch new weeks, not entire seasons)
- Export functionality (download your historical data as CSV/JSON)
