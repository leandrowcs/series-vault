# SeriesVault on Vercel + Firebase

This setup keeps the current FastAPI/TMDb backend available while the frontend becomes Vercel-friendly.

## Frontend deployment

Vercel can build from the repository root using `vercel.json`. In the Vercel project settings, leave **Root Directory** as the repository root:

```json
{
  "installCommand": "cd frontend && npm ci",
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist"
}
```

If you set **Root Directory** to `frontend` in Vercel instead, remove the root `vercel.json` commands or change them to:

```txt
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

Set these environment variables in Vercel:

```bash
TMDB_API_KEY=...
VITE_API_BASE_URL=/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

For local development, `VITE_API_BASE_URL` can stay empty or `/api`; Vite proxies `/api` to the local FastAPI server.

## Public API on Vercel

The root `api/` directory contains Vercel Functions that proxy TMDb without exposing your TMDb key to the browser:

- `GET /api/series?query=...`
- `POST /api/series` with `{ "tmdb_id": 1396 }`
- `GET /api/series/{tmdbId}/episodes`

The following compatibility endpoints return empty/default values while Firestore owns user data:

- `GET /api/series/tracked`
- `GET /api/calendar`
- `GET /api/calendar/new-episodes`
- `GET /api/stats/*`
- `PATCH|DELETE /api/watch/episodes/{episodeId}`

## Firebase setup

Enable these Firebase products:

- Authentication: Google provider
- Firestore Database

The frontend stores:

- `seriesVaultUsers/{uid}`: Google profile metadata
- `seriesVaultUsers/{uid}/trackedSeries/{tmdbId}`: tracked series snapshots
- `seriesVaultUsers/{uid}/watchedEpisodes/{episodeKey}`: watched episode records

Suggested Firestore rules:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /seriesVaultUsers/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## Google Drive backup

The Google login requests the `drive.appdata` scope. When Google returns a Drive access token, the app saves a private backup file named:

```txt
seriesvault_data.json
```

The file lives in the hidden Google Drive `appDataFolder`, so it does not appear in the user's normal Drive files.

## Current migration state

- FastAPI is still used for TMDb search/sync and local SQLite compatibility.
- Firestore stores the user-owned state: tracked series and watched episodes.
- Google Drive stores a JSON backup that can restore tracked series, watched episodes, and episode cache.
- A later migration can replace the FastAPI/SQLite data store with small Vercel API routes that only proxy/cache TMDb.
