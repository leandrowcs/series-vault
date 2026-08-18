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
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
VITE_AUTHORIZED_EMAILS=leandrowcs@gmail.com
```

`VITE_AUTHORIZED_EMAILS` aceita uma lista de e-mails separados por vírgula. Contas fora da lista são deslogadas e permanecem na tela de login.

`VITE_API_BASE_URL` is optional when the frontend and Vercel Functions are deployed in the same Vercel project; the app defaults to `/api`. For a separate API host, set `VITE_API_BASE_URL=https://your-api-host.example.com/api`.

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
- Cloud Messaging: Web Push certificate / VAPID key
- Google Drive API in the same Google Cloud project, used only for the optional `drive.appdata` backup

Access to the app is gated by Google sign-in. To limit who can enter during testing, configure the allowed test users in Google Cloud / OAuth consent screen for the Firebase OAuth client.

The frontend stores:

- `seriesVaultUsers/{uid}`: Google profile metadata
- `seriesVaultUsers/{uid}/trackedSeries/{tmdbId}`: tracked series snapshots
- `seriesVaultUsers/{uid}/watchedEpisodes/{episodeKey}`: watched episode records
- `seriesVaultUsers/{uid}/notificationSubscriptions/{tokenId}`: FCM web push subscriptions

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

## Push notifications

The PWA can register an FCM token after the user signs in and taps the bell on the home page. The app stores the token in Firestore with the browser timezone, then Vercel Cron calls:

```txt
GET /api/notifications/daily
```

Set these server-side environment variables in Vercel:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=... # optional, but recommended
```

If `CRON_SECRET` is set, call the function with `Authorization: Bearer <CRON_SECRET>` for manual tests. The job checks each subscribed user's tracked series and sends a notification when TMDb reports `next_episode_to_air` or `last_episode_to_air` for the current date in that subscription's timezone.

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
