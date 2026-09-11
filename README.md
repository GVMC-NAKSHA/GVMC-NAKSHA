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

## Run the MVP locally (no keys required)

Postgres+PostGIS, Redis, the DB migrations, and an auth-bypass are all **bundled** — the demo
runs with zero external accounts. Add keys later to switch on the real services.

### 1. Start the backend + worker + db

```bash
cp .env.example .env
docker compose up --build
```

This brings up `db` (Postgres 16 + PostGIS), `redis`, a one-shot `migrate` job that applies
`database/migrations/0001…0010` and seeds 5 wards, then `api` (:3000) and `worker`. Migrations
are tracked in `schema_migrations`, so re-runs only apply new files.

Check it: `curl localhost:3000/api/health` → `db` and `redis` are `"ok"` (`r2` shows `"down"`
until you add R2 keys — expected).

### 2. Start the frontend

```bash
cd frontend
cp .env.local.example .env.local     # paste your Google Maps JS API key for the basemap
npm install
npm run dev
```

The **map** uses Google Maps (`hybrid` satellite + labels) — set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
in `frontend/.env.local`. Without it the app still loads; the map panel just shows a hint.
Everything else stays keyless. Open **http://localhost:3001** → `/login` → pick a role (`admin`) →
officer dashboard. `/integration` is the PS-26013 view: assemble the golden record and export the
harmonized cadastre.

### 3. Turn on the real services (optional)

Edit `.env`:

| Set | To enable | Get it from |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (in `frontend/.env.local`) | the map basemap | console.cloud.google.com → Maps JavaScript API + billing |
| `AUTH_DEV_BYPASS=false` + `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | real sign-in (first user → admin) | supabase.com → project → Settings → API |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | uploading source files, exporting the cadastre to storage | Cloudflare → R2 → bucket + API token |
| `GROQ_API_KEY` | live AI text instead of templated fallbacks | console.groq.com/keys |

For real auth, put the matching `NEXT_PUBLIC_SUPABASE_*` values in `frontend/.env.local` too, then
restart `npm run dev`.

### End-to-end demo (Admin dashboard)

1. **Upload source** — pick `cadastral` + Ward 4, choose a GeoJSON of parcel polygons, Upload.
   Repeat for a `building_footprint` GeoJSON. (The browser PUTs straight to R2 via a presigned
   URL, so add a CORS rule on the R2 bucket allowing `PUT` from `http://localhost:3001` —
   R2 dashboard → bucket → Settings → CORS Policy.)
2. **Harmonize ward 4** — runs matching → conflicts → auto-assembles the golden record.
3. **Export cadastre (GeoJSON)** — opens a presigned download of the integrated parcel layer.

> No `GROQ_API_KEY`? Everything above still works; AI replies are templated and schema-mapping
> uses deterministic column-name matching. No `SUPABASE_*`? The API boots but you can't sign in.

Deployment is automated via the workflows in `.github/workflows/` — see `final.md` §12 and §18.
