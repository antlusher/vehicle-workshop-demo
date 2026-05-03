# Vehicle Workshop Demo App

This repository contains a demo vehicle workshop web app with:

- user login and subscription gating
- reg/VIN lookup and saved projects
- AI-guided repair assistance
- demo fallback mode when OpenAI is not configured

## Docker deployment

### Build and run locally

Create or update `server/.env` with your settings.

Then run:

```bash
docker compose up --build
```

This starts:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

### Environment

The backend reads settings from `server/.env` via Docker Compose.

Frontend build uses `VITE_API_BASE_URL`, defaulting to `http://localhost:4000`.

### Server deployment

To deploy on a remote server, you need:

- SSH access or control over the server host
- Docker and Docker Compose installed
- the repo copied to the server
- a configured `server/.env` with `OPENAI_API_KEY` and lookup API settings

For a full deployment, the backend must run on a server or container host. GitHub Pages cannot host the backend service.

If you want, I can also add a single `Dockerfile` that serves the frontend through the backend in one container.
