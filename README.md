# Series Vault

Aplicativo pessoal para registrar séries de TV assistidas, inspirado em Letterboxd/TV Time.

## Stack

- Backend: FastAPI
- Banco de dados: SQLite
- Frontend: React + Vite
- Autenticação: Google OAuth
- API externa: TMDb

## Estrutura

- `backend/` - API e sincronização TMDb
- `frontend/` - aplicação React

## Como começar

### Backend

1. Criar ambiente Python:
   ```bash
   python -m venv .venv
   ```
2. Ativar o ambiente:
   - Windows PowerShell:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - Windows CMD:
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
   - Git Bash / WSL / bash:
     ```bash
     source .venv/Scripts/activate
     ```
3. Instalar dependências:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Copiar `backend/.env.example` para `backend/.env` e preencher as variáveis.
5. Rodar a API na raiz do repositório:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend

1. Entrar em `frontend/`
2. Instalar dependências:
   ```bash
   npm install
   ```
3. Rodar desenvolvimento:
   ```bash
   npm run dev
   ```

## Notas

- TMDb requer atribuição visível no frontend.
- O backend sincroniza séries, temporadas, episódios, elenco e gêneros.
- O modelo de dados mantém histórico de episódios assistidos por usuário.
