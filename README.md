# GVMC → PS 26013 (NAKSHA)

AI-enabled platform to **integrate, harmonize, validate, and synchronize** multi-source
geospatial land datasets, built for Ministry of Rural Development / Dept. of Land Resources
Problem Statement **PS 26013** under the **NAKSHA** programme. Originally a GVMC
change-detection dashboard, repositioned to PS 26013 and rebuilt on a **$0 free / open-source
stack** (no AWS). See `final.md` for the full build spec — architecture, API reference,
database schema, module code, and execution order.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) on **Vercel** |
| Backend API | Node.js + **NestJS** (one service, feature modules) |
| Database | **Supabase PostgreSQL 16** |
| Spatial | **PostGIS** (`geometry(*, 4326)`, GiST indexes) |
| Object storage | **Cloudflare R2** (S3-compatible) |
| Auth | **Supabase Auth** — roles `admin`, `official`, `analyst`, `citizen` |
| Queue | **Upstash Redis** (list-based job queue) |
| Async worker | **Python worker** (container) |
| OCR | **Tesseract** (`pytesseract`) |
| Spatial processing | **PostGIS + GDAL** |
| LLM | **Groq** (`llama-3.3-70b-versatile`) |
| CI/CD | **GitHub Actions** |
| Container registry | **GitHub Container Registry (GHCR)** |
| DNS / TLS / WAF | **Cloudflare** |
| Security / XDR | **Wazuh** |
| Logging | **Pino** (structured JSON) → Wazuh; OpenTelemetry later |
| Email | **Resend / Brevo** (free tier) |
| Remote admin | **SSH / Tailscale** |

## Repository layout

```text
gvmc/
├── frontend/     # Next.js (App Router) → Vercel
├── backend/      # NestJS API → GHCR image → host
├── worker/       # Python worker (OCR, GDAL/rasterio, pyproj, shapely) → GHCR image → host
├── database/     # SQL migrations + seed data
└── .github/      # CI/CD workflows
```

See `final.md` §2 for the full tree and §13 for the sprint-by-sprint build order.

## Getting started

1. Copy `.env.example` to `.env` and fill in the values (Supabase, R2, Upstash Redis, Groq —
   see `final.md` §14 for what each var is for).
2. Bring up the local stack:

   ```bash
   docker compose up
   ```

   This starts `db` (Postgres 16 + PostGIS), `redis`, `api` (NestJS), and `worker` (Python).
3. Apply the database migrations and seed data in `database/migrations` and `database/seed`
   (the `db` service auto-runs everything in `database/migrations` on first init via
   `docker-entrypoint-initdb.d`; see `final.md` §15 for the full verification walkthrough,
   including loading `database/seed/seed.sql`).
4. Run the frontend separately for local development:

   ```bash
   cd frontend && npm install && npm run dev
   ```

   The app serves on `http://localhost:3001` and talks to the API on `http://localhost:3000`.

Deployment is automated via the workflows in `.github/workflows/` (`deploy-backend.yml`,
`deploy-worker.yml`, `deploy-frontend.yml`) plus `test.yml` for CI — see `final.md` §12 and §18.
