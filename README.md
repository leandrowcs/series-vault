# Series Vault

Series Vault is a personal TV tracking app inspired by Letterboxd and TV Time. It lets users search TV shows, track watched episodes, view calendar/stats data, and keep user-owned state with Firebase/Google integrations.

Portuguese documentation: [README-pt-BR.md](README-pt-BR.md)

## Stack

- Frontend: React 18, Vite, TypeScript
- PWA: web manifest, service worker, installable app assets
- Authentication: Google OAuth and Firebase Authentication
- User data: Firebase Firestore
- Backend: FastAPI
- Local database: SQLite
- Serverless API: Vercel Functions
- External API: TMDb
- Optional integrations: Firebase Cloud Messaging and Google Drive `appDataFolder` backup

## Repository Structure

```txt
api/       Vercel serverless API routes
backend/   FastAPI app, SQLite models, sync services, tests
docs/      deployment and integration notes
frontend/  React + Vite PWA
```

## Prerequisites

- Git
- Node.js 18 or newer
- npm
- Python 3.10 or newer
- A TMDb API key
- A Google Cloud OAuth client for local backend OAuth
- A Firebase project if you want sign-in, Firestore sync, push notifications, or Google Drive backup
- Vercel CLI or a Vercel account if you want to deploy

## External Service Setup

### TMDb

Create an API key in your TMDb account and use it as `TMDB_API_KEY`.

### Google OAuth for the FastAPI backend

Create an OAuth 2.0 client in Google Cloud and configure this local redirect URI:

```txt
http://localhost:8000/auth/google/callback
```

Use the generated client ID and client secret in `backend/.env`.

### Firebase

Create a Firebase project and enable the products you need:

- Authentication: enable the Google provider.
- Firestore Database: stores user-owned app data.
- Cloud Messaging: needed only for web push notifications.
- Google Drive API in the same Google Cloud project: needed only for the optional `drive.appdata` backup.

Add your local and deployed domains to the authorized domains list in Firebase Authentication.

The frontend reads Firebase config from `frontend/.env`. The app can start without Firebase values, but sign-in, Firestore, messaging, and backup features require them.

## Environment Variables

Never commit real `.env` files.

### Backend

Create `backend/.env` from the example:

```powershell
Copy-Item backend\.env.example backend\.env
```

Or on macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Fill in:

```env
DATABASE_URL=sqlite:///./series_vault.db
TMDB_API_KEY=your_tmdb_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
SECRET_KEY=replace_with_secure_random_value
```

Optional:

```env
FRONTEND_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

### Frontend

Create `frontend/.env` from the example:

```powershell
Copy-Item frontend\.env.example frontend\.env
```

Or on macOS/Linux:

```bash
cp frontend/.env.example frontend/.env
```

For local FastAPI development, keep:

```env
VITE_API_BASE_URL=/api
```

Vite proxies `/api` to `http://127.0.0.1:8000` in development.

Fill Firebase values when using Firebase-backed features:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

## Local Development

### 1. Clone the repository

```bash
git clone <repository-url>
cd series-vault
```

### 2. Start the backend

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn --app-dir backend app.main:app --reload --host 0.0.0.0 --port 8000
```

On macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn --app-dir backend app.main:app --reload --host 0.0.0.0 --port 8000
```

The API should respond at:

```txt
http://localhost:8000/
```

Interactive API docs are available at:

```txt
http://localhost:8000/docs
```

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Build

```bash
cd frontend
npm run build
```

Preview the production build locally:

```bash
cd frontend
npm run preview
```

## Tests

Backend tests live in `backend/tests`.

Install test tooling if it is not already available in your environment:

```bash
pip install pytest
```

Run:

```bash
python -m pytest backend/tests
```

There is no frontend test script configured in `frontend/package.json` yet. Use the production build as the current frontend validation step:

```bash
cd frontend
npm run build
```

## Vercel Deployment

The root `vercel.json` is configured for deployment from the repository root:

```json
{
  "installCommand": "cd frontend && npm ci",
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist"
}
```

Set these environment variables in Vercel:

```env
TMDB_API_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

`VITE_API_BASE_URL` is optional when the frontend and Vercel Functions are deployed in the same Vercel project because the app defaults to `/api`.

For push notifications, also set:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=
```

`CRON_SECRET` is optional but recommended. The daily notification cron is configured in `vercel.json` at `/api/notifications/daily`.

More deployment notes are available in [docs/vercel-firebase.md](docs/vercel-firebase.md).

## Data and Storage Notes

- TMDb provides TV metadata. Keep visible TMDb attribution in the frontend.
- The FastAPI backend creates the local SQLite database on startup.
- Firestore stores user-owned state under `seriesVaultUsers/{uid}`.
- Google Drive backup writes `seriesvault_data.json` to the hidden `appDataFolder`.
- Firebase Cloud Messaging stores browser subscriptions in Firestore.

## Troubleshooting

- If frontend API calls fail locally, confirm the backend is running on `http://127.0.0.1:8000` and `VITE_API_BASE_URL=/api`.
- If Google login fails locally, confirm the OAuth redirect URI is exactly `http://localhost:8000/auth/google/callback`.
- If Firebase sign-in fails, confirm the Firebase web app config is present and `localhost` is an authorized Firebase Authentication domain.
- If Vercel functions return `TMDB_API_KEY is not configured`, add `TMDB_API_KEY` to the Vercel project environment variables.
- If push notifications do not work, confirm HTTPS, the Firebase VAPID key, browser notification permission, and the Firebase service account variables.
