# SeriesVault on Vercel + Firebase

This setup keeps the current FastAPI/TMDb backend available while the frontend becomes Vercel-friendly.

## Frontend deployment

Vercel can build from the repository root using `vercel.json`:

```json
{
  "installCommand": "cd frontend && npm ci",
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist"
}
```

Set these environment variables in Vercel:

```bash
VITE_API_BASE_URL=https://your-api-host.example.com/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

For local development, `VITE_API_BASE_URL` can stay empty or `/api`; Vite proxies `/api` to the local FastAPI server.

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
