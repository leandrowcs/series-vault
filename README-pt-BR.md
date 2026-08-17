# Series Vault

Series Vault e um aplicativo pessoal para acompanhar series de TV, inspirado em Letterboxd e TV Time. Ele permite buscar series, marcar episodios assistidos, visualizar calendario/estatisticas e manter dados do usuario com integracoes Firebase/Google.

Documentacao em ingles: [README.md](README.md)

## Stack

- Frontend: React 18, Vite, TypeScript
- PWA: manifesto web, service worker, assets instalaveis
- Autenticacao: Google OAuth e Firebase Authentication
- Dados do usuario: Firebase Firestore
- Backend: FastAPI
- Banco local: SQLite
- API serverless: Vercel Functions
- API externa: TMDb
- Integracoes opcionais: Firebase Cloud Messaging e backup no Google Drive `appDataFolder`

## Estrutura do Repositorio

```txt
api/       rotas de API serverless da Vercel
backend/   app FastAPI, modelos SQLite, servicos de sincronizacao, testes
docs/      notas de deploy e integracao
frontend/  PWA React + Vite
```

## Pre-requisitos

- Git
- Node.js 18 ou superior
- npm
- Python 3.10 ou superior
- Uma chave de API do TMDb
- Um cliente OAuth do Google Cloud para OAuth local no backend
- Um projeto Firebase se voce quiser login, Firestore, push notifications ou backup no Google Drive
- Vercel CLI ou uma conta Vercel se voce quiser fazer deploy

## Configuracao de Servicos Externos

### TMDb

Crie uma chave de API na sua conta TMDb e use-a como `TMDB_API_KEY`.

### Google OAuth para o backend FastAPI

Crie um cliente OAuth 2.0 no Google Cloud e configure este redirect URI local:

```txt
http://localhost:8000/auth/google/callback
```

Use o client ID e o client secret gerados no arquivo `backend/.env`.

### Firebase

Crie um projeto Firebase e habilite os produtos necessarios:

- Authentication: habilite o provedor Google.
- Firestore Database: armazena os dados do usuario.
- Cloud Messaging: necessario apenas para push notifications web.
- Google Drive API no mesmo projeto Google Cloud: necessario apenas para o backup opcional com `drive.appdata`.

Adicione seus dominios locais e de deploy na lista de dominios autorizados do Firebase Authentication.

O frontend le a configuracao do Firebase a partir de `frontend/.env`. O app pode iniciar sem esses valores, mas login, Firestore, mensagens e backup dependem deles.

## Variaveis de Ambiente

Nunca faca commit de arquivos `.env` reais.

### Backend

Crie `backend/.env` a partir do exemplo:

```powershell
Copy-Item backend\.env.example backend\.env
```

Ou no macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Preencha:

```env
DATABASE_URL=sqlite:///./series_vault.db
TMDB_API_KEY=your_tmdb_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
SECRET_KEY=replace_with_secure_random_value
```

Opcional:

```env
FRONTEND_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

### Frontend

Crie `frontend/.env` a partir do exemplo:

```powershell
Copy-Item frontend\.env.example frontend\.env
```

Ou no macOS/Linux:

```bash
cp frontend/.env.example frontend/.env
```

Para desenvolvimento local com FastAPI, mantenha:

```env
VITE_API_BASE_URL=/api
```

O Vite faz proxy de `/api` para `http://127.0.0.1:8000` em desenvolvimento.

Preencha os valores do Firebase quando usar recursos baseados no Firebase:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

## Desenvolvimento Local

### 1. Clonar o repositorio

```bash
git clone <repository-url>
cd series-vault
```

### 2. Iniciar o backend

A partir da raiz do repositorio:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn --app-dir backend app.main:app --reload --host 0.0.0.0 --port 8000
```

No macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn --app-dir backend app.main:app --reload --host 0.0.0.0 --port 8000
```

A API deve responder em:

```txt
http://localhost:8000/
```

A documentacao interativa da API fica em:

```txt
http://localhost:8000/docs
```

### 3. Iniciar o frontend

Em um segundo terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra:

```txt
http://localhost:3000
```

## Build

```bash
cd frontend
npm run build
```

Para visualizar o build de producao localmente:

```bash
cd frontend
npm run preview
```

## Testes

Os testes do backend ficam em `backend/tests`.

Instale a ferramenta de teste se ela ainda nao estiver disponivel no seu ambiente:

```bash
pip install pytest
```

Execute:

```bash
python -m pytest backend/tests
```

Ainda nao existe script de teste frontend configurado em `frontend/package.json`. Use o build de producao como validacao atual do frontend:

```bash
cd frontend
npm run build
```

## Deploy na Vercel

O `vercel.json` da raiz esta configurado para deploy a partir da raiz do repositorio:

```json
{
  "installCommand": "cd frontend && npm ci",
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist"
}
```

Configure estas variaveis de ambiente na Vercel:

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

`VITE_API_BASE_URL` e opcional quando o frontend e as Vercel Functions estao no mesmo projeto Vercel, porque o app usa `/api` por padrao.

Para push notifications, configure tambem:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=
```

`CRON_SECRET` e opcional, mas recomendado. O cron diario de notificacoes esta configurado em `vercel.json` no caminho `/api/notifications/daily`.

Mais notas de deploy estao em [docs/vercel-firebase.md](docs/vercel-firebase.md).

## Notas de Dados e Armazenamento

- O TMDb fornece os metadados das series. Mantenha atribuicao visivel ao TMDb no frontend.
- O backend FastAPI cria o banco SQLite local na inicializacao.
- O Firestore armazena os dados do usuario em `seriesVaultUsers/{uid}`.
- O backup do Google Drive grava `seriesvault_data.json` na pasta oculta `appDataFolder`.
- O Firebase Cloud Messaging armazena inscricoes do navegador no Firestore.

## Solucao de Problemas

- Se chamadas de API do frontend falharem localmente, confirme que o backend esta rodando em `http://127.0.0.1:8000` e que `VITE_API_BASE_URL=/api`.
- Se o login Google falhar localmente, confirme que o redirect URI OAuth e exatamente `http://localhost:8000/auth/google/callback`.
- Se o login Firebase falhar, confirme que a configuracao web do Firebase esta preenchida e que `localhost` e um dominio autorizado no Firebase Authentication.
- Se as functions da Vercel retornarem `TMDB_API_KEY is not configured`, adicione `TMDB_API_KEY` nas variaveis de ambiente do projeto Vercel.
- Se push notifications nao funcionarem, confirme HTTPS, a VAPID key do Firebase, a permissao de notificacao do navegador e as variaveis da service account do Firebase.
