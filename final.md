# FINAL — GVMC → PS 26013 (NAKSHA) on the Free Stack

**Single source of truth for the double pivot.** This document merges two changes:

1. **Problem-statement pivot** — GVMC Change-Detection Dashboard → **PS 26013** (Ministry of Rural
   Development / Dept. of Land Resources): an AI-enabled platform to *integrate, harmonize, validate,
   and synchronize* multi-source geospatial land datasets under the **NAKSHA** programme. The
   repositioning narrative and the original B.1–B.9 feature blueprint come from `change of action.md`
   (B.10 — the harmonized cadastre output — and the §16 MVP/roadmap split are added here).
2. **Tech-stack pivot** — the original AWS serverless stack (Lambda, API Gateway, RDS MySQL, S3,
   Textract, SQS, ECR, Bedrock, Amplify, Cognito) is replaced by a **$0 free / open-source stack**
   defined in `FREE_STACK_RUNBOOK_PS26013_NAKSHA.md`.

### How to read this doc

- **This file supersedes `change of action.md` for stack, architecture, routes, schema, and code.**
- `change of action.md` remains the reference for the verbatim *current* AWS/Python/Vite codebase
  (its Part C) and the detailed PS 26013 requirement analysis (its Part D).
- All code below is **complete enough to build the MVP from this file alone** — every route,
  table, migration, module, `*.module.ts`, config file, CI workflow, and the demo seed data
  has a snippet; §18 is the create-repo-and-push runbook. Consistent conventions: NestJS
  feature modules, a thin `pg` `Pool` wrapper (Prisma/TypeORM are drop-in alternatives),
  class-validator DTOs, Supabase-Auth JWT guard.
- **MVP vs roadmap.** The MVP builds multi-source ingestion (B.1), CRS transform (B.2), spatial
  matching (B.3), geometry-validity correction (B.4), attribute mapping (B.5), conflict resolution
  (B.6), confidence scoring (B.7), and the **harmonized cadastre golden record + export (B.10)**.
  Headline PS 26013 capabilities *beyond* the MVP — a learned match scorer, dataset-version change
  detection, full parcel-fabric topology, GCP-based raster georeferencing, and building/road
  extraction from imagery — are captured as **designed roadmap items in §16**, not shipped code.
  §16 tags every PS requirement as *Built in MVP* or *Roadmap*.
- **Assembly:** each fenced block's first line is a `// path/to/file` (or a heading) — create
  that file with that content. The tree is in §2; the order to work through is §13.

### Contents

1. Target Architecture & Stack
2. Repository Layout
3. **Complete API Reference** — every route & endpoint
4. **Complete Database Schema** — every table, enum, index (Postgres + PostGIS)
5. Queue job types
6. Part A — Repositioning Map
7. Shared / Infrastructure code (bootstrap, pg, R2, queue, auth guard, health)
8. Ported existing modules (wards, properties, stats, verify, export, alerts, brief, admin, chat, llm, tickets)
9. Part B — PS 26013 feature modules (B.1–B.10) with full code
10. Frontend (Next.js) additions
11. Python worker — full source
12. Docker, docker-compose, GitHub Actions
13. Execution Order
14. External Dependencies / Env Vars
15. Verification
16. PS 26013 Requirement Coverage
17. Security & Hygiene Checklist
18. Repository setup & push (GVMC-NAKSHA)

---

## 1. Target Architecture & Stack

```text
                 USERS
                   │
                   ▼
          ┌──────────────────┐
          │   Cloudflare     │  DNS + TLS + WAF + rate limiting
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │  Vercel          │  Next.js frontend (App Router)
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │ Node.js / NestJS │  REST API  (auth, wards, properties, stats, verify,
          │                  │   export, alerts, brief, admin, chat, sources,
          │                  │   harmonization, conflicts, drone, tickets, health)
          └────────┬─────────┘
        ┌──────────┼───────────────┬──────────────┐
        ▼          ▼               ▼              ▼
 ┌────────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
 │  Supabase  │ │ Cloudflare│ │  Upstash  │ │   Groq    │
 │ PostgreSQL │ │    R2     │ │   Redis   │ │   LLM     │
 │ + PostGIS  │ │  storage  │ │   queue   │ │           │
 └─────┬──────┘ └───────────┘ └─────┬─────┘ └───────────┘
       │                            ▼
       │                     ┌───────────────┐
       │                     │ Python worker │  Tesseract OCR · GDAL/rasterio ·
       │                     │               │  pyproj · shapely · GeoJSON/Shapefile
       │                     └───────┬───────┘
       └─────────────────────────────┘
                   │
                   ▼
        App + Supabase + Cloudflare logs ──► Wazuh (SIEM/XDR) ──► alerts
```

### Final stack

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

### AWS → free-stack replacement (GVMC-relevant rows only)

| Original (AWS) | Replacement | Notes |
|---|---|---|
| Lambda single-function + API Gateway regex router | NestJS feature modules + decorators | one long-running service |
| RDS MySQL 8 + PyMySQL | Supabase PostgreSQL 16 + PostGIS | real `geometry` columns; `ST_*` operators |
| S3 (`gvmc-sw14-data`) | Cloudflare R2 | S3 SDK v3 with custom `endpoint` + R2 keys |
| Cognito (planned) | Supabase Auth | JWT verified in a NestJS guard |
| SQS + worker Lambda | Upstash Redis + Python worker | API enqueues, returns `202`; worker consumes |
| Textract | Tesseract in the Python worker | tradeoff: weaker on poor scans / tables / handwriting |
| Bedrock / Bedrock Agent | Groq (single-shot `chat.completions`) | prompts ported verbatim from `pipeline/bedrock_client.py` |
| CloudFormation / SAM | Docker + `docker-compose` + GitHub Actions | |
| ECR | GHCR (`ghcr.io/<org>/gvmc-backend`, `-worker`) | |
| Amplify + React/Vite SPA | Next.js on Vercel | Redux Toolkit slices may be kept for client state |
| CloudWatch / GuardDuty / WAF / X-Ray | Pino + Wazuh + Cloudflare WAF + OpenTelemetry | |
| ACM + Route 53 | Cloudflare TLS + DNS | `app.` and `api.` subdomains |
| Systems Manager + EC2 GEE pipeline | **skipped** for the MVP | NAKSHA rasters arrive via B.1 upload |

---

## 2. Repository Layout

```text
gvmc/
├── frontend/                      # Next.js (App Router) → Vercel
│   ├── app/
│   │   ├── (dashboard)/officer/page.tsx
│   │   ├── (dashboard)/supervisor/page.tsx
│   │   ├── (dashboard)/commissioner/page.tsx
│   │   ├── (dashboard)/admin/page.tsx
│   │   ├── integration/page.tsx           # NEW — B.3/B.6 harmonization view
│   │   ├── integration/IntegrationView.tsx
│   │   └── layout.tsx
│   ├── components/ (MapCanvas, ConfidenceCard, ConflictPanel, LayerToggles, ChatPanel, ...)
│   ├── lib/ (api.ts, supabase.ts, mappers.ts)
│   ├── middleware.ts                       # Supabase Auth session gate
│   └── package.json
│
├── backend/                       # NestJS → GHCR image → host
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/ (auth.guard.ts, roles.decorator.ts, http-exception.filter.ts)
│   │   ├── infra/ (pg.provider.ts, r2.client.ts, queue.client.ts, supabase.ts)
│   │   ├── health/
│   │   ├── auth/
│   │   ├── wards/
│   │   ├── properties/
│   │   ├── stats/
│   │   ├── verify/
│   │   ├── export/
│   │   ├── alerts/
│   │   ├── brief/
│   │   ├── admin/
│   │   ├── chat/
│   │   ├── llm/                            # Groq client (ported from pipeline/bedrock_client.py)
│   │   ├── tickets/
│   │   ├── sources/                        # B.1 + B.9
│   │   ├── harmonization/                  # B.3 + B.5
│   │   ├── conflicts/                      # B.6
│   │   ├── confidence/                     # B.7
│   │   ├── harmonized/                     # B.10 (golden record + cadastre export)
│   │   └── drone/                          # B.8 (roadmap stub)
│   ├── test/                               # e2e specs with ST_GeomFromGeoJSON fixtures
│   ├── Dockerfile
│   └── package.json
│
├── worker/                        # Python async worker → GHCR image → host
│   ├── src/
│   │   ├── main.py                         # Redis consumer loop
│   │   ├── db.py                           # psycopg2 helpers
│   │   ├── r2.py                           # boto3 → R2
│   │   ├── ingest/adapters.py              # B.1 adapter registry
│   │   ├── spatial/geo_transform.py        # B.2
│   │   ├── spatial/topology.py             # B.4
│   │   ├── harmonize/match.py              # B.3 batch
│   │   ├── harmonize/conflicts.py          # B.6 generation
│   │   ├── harmonize/assemble.py           # B.10 golden record + EXPORT_HARMONIZED
│   │   └── ocr/digitize.py                 # B.9
│   ├── Dockerfile
│   └── requirements.txt
│
├── database/
│   ├── migrations/
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_core.sql                   # wards, properties, verification_status, admin_config, alerts
│   │   ├── 0003_tickets.sql
│   │   ├── 0004_profiles_audit.sql
│   │   ├── 0005_data_sources.sql           # B.1
│   │   ├── 0006_matches.sql                # B.3
│   │   ├── 0007_schema_mappings.sql        # B.5
│   │   ├── 0008_conflicts.sql              # B.6
│   │   ├── 0009_drone_tiles.sql            # B.8
│   │   └── 0010_harmonized_parcels.sql    # B.10
│   └── seed/seed.sql
│
├── docker-compose.yml
├── .github/workflows/ (test.yml, build.yml, deploy-frontend.yml, deploy-backend.yml, deploy-worker.yml)
├── .env.example
└── README.md
```

---

## 3. Complete API Reference

Global prefix `/api` (`app.setGlobalPrefix('api')`). All non-public routes require a Supabase JWT
(`Authorization: Bearer <token>`); `@Roles(...)` narrows further. `202` responses carry
`{ status: 'processing', jobId }` — put `@HttpCode(202)` (from `@nestjs/common`) on every
enqueue handler: `POST /admin/refresh`, `POST /sources/upload`, `POST /sources/:id/digitize`,
`POST /harmonization/run`, `POST /drone/flagged-tile`, `POST /harmonized/assemble`.
`GET /harmonized/export` is synchronous for `?format=geojson` (200, same pattern as
`POST /alerts/export`) and sets `res.status(202)` dynamically for `?format=gpkg` (worker job).

### Auth & health

| Method | Path | Module | Roles | Purpose |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | auth | public | Exchange email+password for a Supabase session (proxy to Supabase Auth) |
| `POST` | `/api/auth/refresh` | auth | public | Refresh an access token |
| `GET` | `/api/auth/me` | auth | any | Current user + role from the JWT |
| `GET` | `/api/health` | health | public | Liveness + DB/Redis/R2 reachability |

### Wards

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/wards` | any | List wards + detection counts + bbox |
| `GET` | `/api/wards/:id/changes` | any | Presigned R2 URL for the ward's GeoJSON |
| `GET` | `/api/wards/:id/unassessed` | any | Flagged properties in a ward (`?type=&status=`) |
| `GET` | `/api/wards/:id/alerts` | any | Stored alerts for a ward |
| `GET` | `/api/wards/:id/geojson` | any | The ward's normalized `source_features` as a GeoJSON FeatureCollection (NEW — feeds the map). *`wards.boundary` is included once populated — see §8 note.* |

### Properties

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/properties/:id` | any | Full property detail + `confidence_breakdown` |
| `POST` | `/api/properties/:id/verify` | official, admin | Set verification status (`pending`/`verified`/`underassessed`/`false_positive`/`already_assessed`) |
| `GET` | `/api/properties/:id/explain` | any | Groq explanation (was `agentApi GET /api/explain/:id`) |

### Stats / export / alerts / brief

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/stats` | any | City or per-ward KPIs (`?ward_id=`) |
| `GET` | `/api/stats/all-wards` | any | Per-ward table + city totals + ticket rollup |
| `POST` | `/api/alerts/export` | official, admin | Export properties CSV to R2, return presigned URL (`?ward_id=`) |
| `POST` | `/api/alerts/generate` | analyst, admin | Generate + store an AI ward alert (Groq) |
| `GET` | `/api/brief` | commissioner*, admin | Commissioner daily brief (Groq) — *role `analyst` acts as commissioner |

### Admin

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/admin/upload-csv` | admin | Legacy CSV archive (kept; superseded by `/sources/upload`) |
| `POST` | `/api/admin/db-config` | admin | Set `ndbi_threshold` / `min_area_sqm` / `cloud_cover_max` |
| `POST` | `/api/admin/refresh` | admin | Enqueue a city-wide `HARMONIZE_WARD` batch (was: SSM trigger) |

### Chat

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/chat` | any | Officer chatbot — real Groq call via `LlmService` (replaces `_STUB_REPLIES`) |

### Tickets (Ground-Truthing capture)

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/tickets` | official | Raise a GT ticket (now with `parcel_id`, `gnss_lat`, `gnss_lng`) |
| `GET` | `/api/tickets` | official, admin | List tickets (`?ward_id=&status=`) |
| `GET` | `/api/tickets/:id` | official, admin | Ticket detail + presigned photo URL |
| `PATCH` | `/api/tickets/:id/review` | official, admin | Supervisor review (`under_review`/`resolved`) |
| `POST` | `/api/tickets/photo-upload` | official | Presigned R2 PUT URL for a ticket photo |

### B.1 / B.9 — Sources

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/sources/upload` | admin, analyst | Register a source + return an R2 presigned PUT URL; enqueue `NORMALIZE_SOURCE` (or mark `pending_ocr`) |
| `GET` | `/api/sources` | any | List sources (`?type=&ward_id=&status=`) |
| `GET` | `/api/sources/:id` | any | Source detail + presigned download URL + `metadata` |
| `POST` | `/api/sources/:id/digitize` | admin, analyst | Enqueue `DIGITIZE_SOURCE` (Tesseract OCR) for a scanned doc |
| `GET` | `/api/sources/:id/features` | any | Normalized `source_features` as a GeoJSON FeatureCollection |

### B.3 / B.5 — Harmonization

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/harmonization/run` | admin, analyst | Enqueue `HARMONIZE_WARD` for `?wardId=` (all wards if omitted) |
| `GET` | `/api/harmonization/matches` | any | List matches (`?wardId=&minScore=`) |
| `GET` | `/api/harmonization/matches/:id` | any | Match detail + both feature geometries + confidence breakdown |
| `POST` | `/api/harmonization/schema-map` | admin, analyst | Groq field-to-field mapping between two datasets; persists to `schema_mappings` |
| `GET` | `/api/harmonization/schema-map` | any | List stored mappings (`?sourceAId=&sourceBId=`) |

### B.6 — Conflicts

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/conflicts` | any | List conflicts (`?wardId=&status=&severity=`) |
| `GET` | `/api/conflicts/:id` | any | Conflict detail + linked match + suggested resolution |
| `POST` | `/api/conflicts/:id/resolve` | official, admin | Transition status (`resolved`/`needs_review`/`rejected`) + notes |

### B.8 — Drone edge layer (roadmap stub)

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/drone/flagged-tile` | official | Accept a drone-flagged tile (metadata + confidence + R2 ref) → `data_sources` + match job |
| `GET` | `/api/drone/tiles` | any | List flagged tiles (`?wardId=&minConfidence=`) |

### B.10 — Harmonized cadastre (golden record + export)

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/harmonized/assemble` | admin, analyst | Enqueue `ASSEMBLE_WARD` for `?wardId=` (all wards if omitted) — clusters matched features into one golden-record parcel each |
| `GET` | `/api/harmonized` | any | List harmonized parcels (`?wardId=&minConfidence=`) |
| `GET` | `/api/harmonized/:id` | any | One harmonized parcel — geometry + merged `attributes` + `attribute_provenance` + linked `match_ids` |
| `GET` | `/api/harmonized/export` | official, admin | Export the integrated cadastre for `?wardId=` (required). `?format=geojson` (default) builds + presigns synchronously → `{ presigned_url, feature_count }`; `?format=gpkg` enqueues `EXPORT_HARMONIZED` → `202 { status:'processing', jobId }` (GeoPackage is written by the worker via `fiona`) |
| `GET` | `/api/harmonized/exports` | official, admin | List completed export files for `?wardId=` with presigned URLs |

---

## 4. Complete Database Schema

Supabase Postgres 16 + PostGIS. Migrations run in order under `database/migrations/`.

### `0001_extensions.sql`

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()

-- enums
CREATE TYPE detection_type   AS ENUM ('new_build','change_of_use');
CREATE TYPE property_status  AS ENUM ('pending','verified','underassessed','false_positive','already_assessed');
CREATE TYPE alert_severity   AS ENUM ('danger','warning','info');
CREATE TYPE ticket_status    AS ENUM ('open','under_review','resolved');
CREATE TYPE user_role        AS ENUM ('admin','official','analyst','citizen');

CREATE TYPE source_type AS ENUM (
  'drone_imagery','ori','dsm_dtm','cadastral','revenue',
  'municipal_gis','utility','ground_truth','gnss_cors','building_footprint'
);
CREATE TYPE source_status    AS ENUM ('processing','pending_ocr','ready','failed');
CREATE TYPE conflict_type    AS ENUM ('geometry_mismatch','attribute_mismatch','both');
CREATE TYPE conflict_sev     AS ENUM ('low','medium','high','critical');
CREATE TYPE conflict_status  AS ENUM ('pending','resolved','needs_review','rejected');
```

### `0002_core.sql` — ported from `gvmc-backend/schema.sql` (MySQL → Postgres/PostGIS)

```sql
CREATE TABLE wards (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  bbox_north  numeric(10,6),
  bbox_south  numeric(10,6),
  bbox_east   numeric(10,6),
  bbox_west   numeric(10,6),
  geojson_r2  text,                                   -- R2 key (was geojson_s3)
  boundary    geometry(MultiPolygon, 4326)           -- NEW: real geometry
);
CREATE INDEX wards_boundary_idx ON wards USING GIST (boundary);

CREATE TABLE properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  lat                  numeric(10,7),
  lng                  numeric(10,7),
  geom                 geometry(Point, 4326)          -- NEW: derived from lat/lng
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
  area_sqm             numeric(12,2),
  detection_type       detection_type,
  confidence           numeric(5,4),
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at          timestamptz,
  geojson_r2           text,                          -- was s3_geojson_key
  status               property_status NOT NULL DEFAULT 'pending',
  notes                text,
  updated_by           text,
  updated_at           timestamptz,
  ai_explanation       text
);
CREATE INDEX properties_ward_idx  ON properties (ward_id, status);
CREATE INDEX properties_geom_idx  ON properties USING GIST (geom);

CREATE TABLE verification_status (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  status      property_status NOT NULL,
  updated_by  text,
  updated_at  timestamptz,
  notes       text
);

CREATE TABLE admin_config (
  key_name   text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id    text REFERENCES wards(id),
  severity   alert_severity NOT NULL,
  text       text NOT NULL,
  score      int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_ward_idx ON alerts (ward_id, created_at DESC);
```

### `0003_tickets.sql` — ported + GT extension

```sql
CREATE TABLE tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id          text NOT NULL REFERENCES wards(id),
  property_id      uuid REFERENCES properties(id),
  parcel_id        uuid,                                   -- NEW: GT ↔ cadastral link.
                                                           -- FK -> source_features(id) is added by the
                                                           -- deferred ALTER at the end of 0005 (source_features
                                                           -- does not exist yet at 0003). Keep it nullable.
  house_number     text NOT NULL,
  description      text NOT NULL,
  tax_pending      numeric(12,2),
  gnss_lat         numeric(10,7),                          -- NEW: field GNSS capture
  gnss_lng         numeric(10,7),
  gnss_accuracy_m  numeric(6,2),                           -- NEW
  photo_r2_key     text,
  status           ticket_status NOT NULL DEFAULT 'open',
  supervisor_notes text,
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_ward_idx   ON tickets (ward_id);
CREATE INDEX tickets_status_idx ON tickets (status);
```

### `0004_profiles_audit.sql`

```sql
-- On Supabase the `auth` schema + `auth.users` already exist, so these two
-- IF NOT EXISTS statements are no-ops there. On a plain local Postgres
-- (docker-compose `postgis/postgis`) they create a minimal shim so this
-- migration — and local role testing — still works.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- Supabase manages auth.users; this mirrors role + display data for joins.
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text,
  role        user_role NOT NULL DEFAULT 'citizen',
  ward_scope  text[] DEFAULT '{}',                    -- wards this user may act on ('{}' = all)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor      uuid,
  action     text NOT NULL,                           -- 'source.ingest', 'conflict.resolve', ...
  entity     text NOT NULL,                           -- 'data_sources:<id>'
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, created_at DESC);

-- Auto-provision a profile for every new auth user. Without this an
-- authenticated user has no `profiles` row, AuthGuard falls back to role
-- 'citizen', and every @Roles('admin'|'official'|'analyst') route 403s.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'citizen')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Promote the first admin AFTER that user signs up:
--   UPDATE profiles SET role = 'admin' WHERE email = 'you@example.com';
```

### `0005_data_sources.sql` — B.1 + B.9

```sql
CREATE TABLE data_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         source_type   NOT NULL,
  ward_id      text REFERENCES wards(id),
  r2_key       text NOT NULL,                          -- sources/<type>/<uuid>.<ext>
  original_name text,
  crs          text,                                   -- e.g. 'EPSG:32644'
  captured_at  timestamptz,
  scanned      boolean NOT NULL DEFAULT false,
  status       source_status NOT NULL DEFAULT 'processing',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- OCR fields, band info, feature count...
  error        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_sources_type_ward_idx ON data_sources (type, ward_id, status);

CREATE TABLE source_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  geom        geometry(Geometry, 4326) NOT NULL,       -- Point | Polygon | LineString | Multi*
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  was_invalid boolean NOT NULL DEFAULT false,          -- B.4 flagged + fixed this geometry
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_features_geom_idx   ON source_features USING GIST (geom);
CREATE INDEX source_features_source_idx ON source_features (source_id);

-- deferred FK from 0003
ALTER TABLE tickets
  ADD CONSTRAINT tickets_parcel_fk FOREIGN KEY (parcel_id) REFERENCES source_features(id);

-- optional structured store for OCR output (also mirrored into data_sources.metadata)
CREATE TABLE ocr_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  field       text NOT NULL,                           -- 'khata_no', 'owner_name', ...
  value       text,
  confidence  numeric(5,2),                            -- 0-100 (mean word confidence)
  page        int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ocr_results_source_idx ON ocr_results (source_id);
```

### `0006_matches.sql` — B.3

```sql
CREATE TABLE matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id             text REFERENCES wards(id),
  feature_a_id        uuid NOT NULL REFERENCES source_features(id) ON DELETE CASCADE,
  feature_b_id        uuid NOT NULL REFERENCES source_features(id) ON DELETE CASCADE,
  source_a_type       source_type NOT NULL,
  source_b_type       source_type NOT NULL,
  geometry_iou        numeric(5,4),
  centroid_distance_m numeric(8,2),
  match_score         numeric(5,2) NOT NULL,           -- 0-100
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,  -- B.7 (4 terms)
  matched_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_a_id, feature_b_id)
);
CREATE INDEX matches_ward_score_idx ON matches (ward_id, match_score DESC);
```

### `0007_schema_mappings.sql` — B.5

```sql
CREATE TABLE schema_mappings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_a_id  uuid REFERENCES data_sources(id) ON DELETE CASCADE,
  source_b_id  uuid REFERENCES data_sources(id) ON DELETE CASCADE,
  field_a      text NOT NULL,
  field_b      text NOT NULL,
  confidence   numeric(4,3) NOT NULL,                  -- 0-1 from the LLM
  rationale    text,
  approved     boolean,                                -- analyst override (null = unreviewed)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schema_mappings_pair_idx ON schema_mappings (source_a_id, source_b_id);
```

### `0008_conflicts.sql` — B.6

```sql
CREATE TABLE conflicts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  match_id             uuid REFERENCES matches(id) ON DELETE CASCADE,
  conflict_type        conflict_type   NOT NULL,
  severity             conflict_sev    NOT NULL,
  detail               jsonb NOT NULL DEFAULT '{}'::jsonb,   -- which attrs disagree, deltas
  suggested_resolution text,
  status               conflict_status NOT NULL DEFAULT 'pending',
  resolved_by          text,
  resolved_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conflicts_ward_status_idx ON conflicts (ward_id, status, severity);
```

### `0009_drone_tiles.sql` — B.8 (roadmap)

```sql
CREATE TABLE drone_tiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id      text REFERENCES wards(id),
  source_id    uuid REFERENCES data_sources(id),
  bbox         geometry(Polygon, 4326) NOT NULL,
  confidence   numeric(5,2) NOT NULL,                  -- on-device model score
  r2_key       text NOT NULL,
  captured_at  timestamptz,
  buffered     boolean NOT NULL DEFAULT false,         -- low-confidence, held on device
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drone_tiles_bbox_idx ON drone_tiles USING GIST (bbox);
```

### `0010_harmonized_parcels.sql` — B.10 (golden record + export)

One row per matched cluster: the canonical parcel the whole pipeline exists to produce.
`geom` is copied from the highest-reliability member source; `attributes` is merged field-by-field
(via `schema_mappings`); `attribute_provenance` records which `source_type` each field came from.

```sql
CREATE TABLE harmonized_parcels (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  geom                 geometry(MultiPolygon, 4326) NOT NULL,
  geom_source_id       uuid REFERENCES data_sources(id),        -- where geom came from
  geom_source_type     source_type,
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,      -- merged canonical fields
  attribute_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { field: source_type }
  member_feature_ids   uuid[]  NOT NULL DEFAULT '{}',           -- source_features in this cluster
  match_ids            uuid[]  NOT NULL DEFAULT '{}',
  confidence           numeric(5,4),                            -- mean of member matches' blended score
  conflict_count       int     NOT NULL DEFAULT 0,              -- unresolved conflicts touching this cluster
  assembled_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ward_id, member_feature_ids)
);
CREATE INDEX harmonized_parcels_geom_idx ON harmonized_parcels USING GIST (geom);
CREATE INDEX harmonized_parcels_ward_idx ON harmonized_parcels (ward_id, confidence DESC);

-- completed cadastre export files (GeoJSON built by the API, GeoPackage by the worker)
CREATE TABLE harmonized_exports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id      text REFERENCES wards(id),
  format       text NOT NULL CHECK (format IN ('geojson','gpkg')),
  r2_key       text,
  feature_count int,
  status       text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing','ready','failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX harmonized_exports_ward_idx ON harmonized_exports (ward_id, created_at DESC);
```

### `seed/seed.sql`

```sql
INSERT INTO admin_config (key_name, value) VALUES
  ('data_mode','demo'), ('pipeline_status','idle'),
  ('last_refresh','2026-07-30T04:00:00.000Z'), ('ndbi_threshold','0.15')
ON CONFLICT (key_name) DO NOTHING;

INSERT INTO wards (id, name, bbox_north, bbox_south, bbox_east, bbox_west, geojson_r2) VALUES
  ('1','Seethammadhara',17.745,17.715,83.315,83.280,'geojson/ward-1.json'),
  ('2','Gopalapatnam',  17.778,17.748,83.278,83.245,'geojson/ward-2.json'),
  ('3','Maddilapalem',  17.728,17.700,83.302,83.270,'geojson/ward-3.json'),
  ('4','Asilmetta',     17.710,17.685,83.230,83.200,'geojson/ward-4.json'),
  ('5','Dwaraka Nagar', 17.695,17.668,83.220,83.190,'geojson/ward-5.json')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
```

### `seed/demo_properties.sql` — ~25 flagged properties so the ported dashboard renders

`admin/upload-csv` is archive-only (`properties_imported: 0`, faithfully ported), and the B.1
`data_sources` lineage is separate — so `properties` is empty without this. `confidence` is
stored **0–1** (readers `*100`); `confidence_breakdown` carries the signal fields the LLM reads.

```sql
INSERT INTO properties
  (ward_id, lat, lng, area_sqm, detection_type, confidence, confidence_breakdown, detected_at, status)
SELECT w, lat, lng, area, dtype::detection_type, conf,
       jsonb_build_object('ndbi_delta', ndbi, 'area_delta', adelta, 'ndvi_drop', ndvi,
                          'osm_status', osm, 'db_match', dbm),
       now() - (rn || ' days')::interval, st::property_status
FROM (VALUES
  ('1',17.7305,83.3005,142.5,'new_build',   0.91,0.34,120.0,0.22,'absent',false,'pending',1),
  ('1',17.7288,83.2971,88.0, 'change_of_use',0.63,0.16, 40.0,0.05,'present',true, 'pending',2),
  ('1',17.7331,83.3040,210.0,'new_build',   0.88,0.29,180.0,0.19,'absent',false,'underassessed',3),
  ('1',17.7269,83.2955,64.0, 'new_build',   0.55,0.12, 55.0,0.03,'absent',false,'pending',4),
  ('1',17.7350,83.3062,320.0,'new_build',   0.94,0.41,300.0,0.27,'absent',false,'verified',5),
  ('2',17.7602,83.2612,175.0,'new_build',   0.86,0.28,150.0,0.18,'absent',false,'pending',2),
  ('2',17.7635,83.2650,95.0, 'change_of_use',0.71,0.19, 48.0,0.08,'present',true, 'pending',3),
  ('2',17.7580,83.2588,58.0, 'new_build',   0.49,0.10, 45.0,0.02,'absent',false,'false_positive',6),
  ('2',17.7660,83.2668,240.0,'new_build',   0.90,0.33,220.0,0.24,'absent',false,'underassessed',4),
  ('2',17.7555,83.2560,130.0,'new_build',   0.78,0.24,110.0,0.14,'absent',false,'pending',5),
  ('3',17.7150,83.2860,160.0,'new_build',   0.83,0.27,140.0,0.17,'absent',false,'pending',1),
  ('3',17.7128,83.2835,72.0, 'change_of_use',0.60,0.15, 35.0,0.04,'present',true, 'pending',7),
  ('3',17.7175,83.2888,290.0,'new_build',   0.92,0.38,270.0,0.25,'absent',false,'verified',8),
  ('3',17.7100,83.2810,50.0, 'new_build',   0.44,0.09, 40.0,0.01,'absent',false,'pending',9),
  ('3',17.7190,83.2905,205.0,'new_build',   0.87,0.30,185.0,0.20,'absent',false,'underassessed',2),
  ('4',17.7005,83.2160,185.0,'new_build',   0.89,0.31,165.0,0.21,'absent',false,'pending',1),
  ('4',17.6988,83.2135,110.0,'change_of_use',0.68,0.17, 52.0,0.07,'present',true, 'pending',3),
  ('4',17.7028,83.2190,340.0,'new_build',   0.95,0.44,320.0,0.29,'absent',false,'pending',2),
  ('4',17.6960,83.2110,66.0, 'new_build',   0.52,0.11, 50.0,0.02,'absent',false,'already_assessed',10),
  ('4',17.7040,83.2205,150.0,'new_build',   0.80,0.25,130.0,0.15,'absent',false,'verified',6),
  ('5',17.6805,83.2050,170.0,'new_build',   0.85,0.28,150.0,0.18,'absent',false,'pending',1),
  ('5',17.6788,83.2025,90.0, 'change_of_use',0.66,0.16, 44.0,0.06,'present',true, 'pending',4),
  ('5',17.6828,83.2080,260.0,'new_build',   0.91,0.36,240.0,0.24,'absent',false,'underassessed',3),
  ('5',17.6760,83.2000,54.0, 'new_build',   0.47,0.10, 42.0,0.02,'absent',false,'pending',8),
  ('5',17.6840,83.2095,200.0,'new_build',   0.88,0.31,180.0,0.20,'absent',false,'pending',2)
) AS t(w, lat, lng, area, dtype, conf, ndbi, adelta, ndvi, osm, dbm, st, rn);
```

### `seed/fixtures/` — ward polygons + a synthetic multi-source set

Not committed as code — generate + upload once so the map and B.1/B.3/B.6 flow work:

```text
seed/fixtures/
  geojson/ward-1.json … ward-5.json   # ward-boundary polygons (from gvmc_wards_reference CSV).
                                      # Upload to r2://$R2_BUCKET_NAME/geojson/ward-N.json —
                                      # GET /api/wards/:id/changes presigns exactly that key.
  cadastral_ward4.geojson             # ~8 parcel polygons in ward 4
  footprints_ward4.geojson            # ~8 building footprints, deliberate overlaps + 2 gaps vs cadastral
  gnss_ward4.csv                      # lon,lat,<attrs> — 3 CORS points

# load: POST /api/sources/upload {type:'cadastral', wardId:'4'} -> PUT file to the returned URL,
# repeat for building_footprint + gnss_cors, then POST /api/harmonization/run?wardId=4,
# then POST /api/harmonized/assemble?wardId=4  (B.10 golden record).
#
# CRS: GeoJSON/.json with no embedded `crs` member defaults to EPSG:4326 (RFC 7946) — no need to
# pass `crs` on upload for these fixtures. Shapefile (.shp) and GeoTIFF (.tif) uploads still need a
# declared or embedded CRS (the adapter raises "no CRS: declare one on upload" otherwise).
```

---

## 5. Queue job types (Upstash Redis)

The API `LPUSH`es JSON jobs onto `queue:ingest`; the worker `BRPOP`s them. Failed jobs go to
`queue:ingest:dead` with an `error` + `attempts` field.

| `jobType` | Enqueued by | Worker handler | Effect |
|---|---|---|---|
| `NORMALIZE_SOURCE` | `POST /sources/upload` | `ingest/adapters.normalize_source` | adapter → reproject (B.2) → topology (B.4) → `source_features`; records the attribute schema into `data_sources.metadata.fields`; status → `ready` |
| `DIGITIZE_SOURCE` | `POST /sources/:id/digitize` | `ocr/digitize.digitize` | Tesseract → `ocr_results` + `data_sources.metadata`; enqueues `SCHEMA_MAP` |
| `SCHEMA_MAP` | worker (after OCR) / `POST /harmonization/schema-map` | `harmonize/schema_map` | Groq mapping (deterministic name-match fallback if no `GROQ_API_KEY`) → `schema_mappings` |
| `HARMONIZE_WARD` | `POST /harmonization/run`, `POST /admin/refresh` | `harmonize/match.match_ward` | PostGIS IoU/centroid → `matches` + `confidence_breakdown` (B.7) → enqueues `DETECT_CONFLICTS` |
| `DETECT_CONFLICTS` | worker (after match) | `harmonize/conflicts.detect` | disagreements → `conflicts` with severity → enqueues `ASSEMBLE_WARD` |
| `ASSEMBLE_WARD` | worker (after conflicts) / `POST /harmonized/assemble` | `harmonize/assemble.assemble_ward` | union-find clusters over `matches` → one `harmonized_parcels` golden record per cluster (geom from most-reliable source, attributes merged via `schema_mappings`, provenance + confidence + `conflict_count`) |
| `EXPORT_HARMONIZED` | `GET /harmonized/export?format=gpkg` | `harmonize/assemble.export_harmonized` | read `harmonized_parcels` for the ward → write GeoPackage via `fiona` → R2 → `harmonized_exports` row `ready` |

```json
{ "jobType": "NORMALIZE_SOURCE", "sourceId": "…", "r2Key": "sources/cadastral/….geojson", "type": "cadastral" }
{ "jobType": "HARMONIZE_WARD",   "wardId": "4" }
{ "jobType": "ASSEMBLE_WARD",    "wardId": "4" }
{ "jobType": "EXPORT_HARMONIZED","wardId": "4", "exportId": "…", "format": "gpkg" }
```

---

## 6. Part A — Repositioning Map (PS 26013 requirement → GVMC asset → free-stack home → gap)

| PS 26013 requirement | Existing GVMC coverage | Free-stack home | Gap to close |
|---|---|---|---|
| Multi-source dataset integration (drone, ORI, DSM/DTM, cadastral, revenue, municipal GIS, utility, GT, GNSS/CORS, footprints) | Only Sentinel-2 optical + OSM + tax DB | `sources` module + `data_sources`/`source_features` + worker adapters | **B.1** (rasters land as a footprint feature only — pixel analysis → §16 roadmap) |
| AI/ML spatial matching | None — per-ward NDBI/NDVI thresholding | `harmonization` module + PostGIS IoU/`ST_Distance` + attribute-name overlap | **B.3** — deterministic; learned match scorer → **§16 roadmap** |
| Automated topology correction | None (MySQL) | `ST_MakeValid` / `buffer(0)` in the worker path | **B.4** — geometry-validity only; parcel-fabric topology (snap/gap/overlap/sliver) → **§16 roadmap** |
| Intelligent attribute mapping | None | `LlmService.suggestFieldMapping()` (Groq, deterministic fallback) | **B.5** |
| Geo-referencing / CRS transform | Implicit (assumes WGS84) | `worker/spatial/geo_transform.py` (pyproj) | **B.2** — CRS transform of already-georeferenced inputs; GCP georeferencing + DSM/DTM sampling → **§16 roadmap** |
| Change detection | Legacy NDBI/NDVI delta — GEE/EC2 pipeline **skipped**, `properties` is demo seed | n/a in MVP | **Not in MVP** — dataset-version change detection (`change_events`) → **§16 roadmap** |
| Spatial conflict resolution | None | `conflicts` module (reuses verify pattern) | **B.6** |
| Confidence scoring | ✅ Partial — 5-signal `confidence_breakdown` | `confidence` service + `ConfidenceCard` | **B.7** |
| Harmonized cadastre output (golden record + export) | None | `harmonized` module + `harmonized_parcels` + GeoJSON/GeoPackage export | **B.10** |
| Ground-truthing capture | ✅ Strong asset — `tickets` domain | `tickets` module + `parcel_id`/GNSS columns | Extend |
| Inter-departmental exchange | ✅ REST API + presigned GeoJSON | NestJS REST + R2 presigned URLs + B.10 cadastre export | Framing + B.10 |
| Document digitization (Computer Vision) | None | Tesseract in the worker | **B.9** |

---

## 7. Shared / Infrastructure code

### `backend/src/main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());   // LookupError→404, ValueError→400 parity
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### `backend/src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InfraModule } from './infra/infra.module';
import { AuthGuard } from './common/auth.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { WardsModule } from './wards/wards.module';
import { PropertiesModule } from './properties/properties.module';
import { StatsModule } from './stats/stats.module';
import { VerifyModule } from './verify/verify.module';
import { ExportModule } from './export/export.module';
import { AlertsModule } from './alerts/alerts.module';
import { BriefModule } from './brief/brief.module';
import { AdminModule } from './admin/admin.module';
import { ChatModule } from './chat/chat.module';
import { LlmModule } from './llm/llm.module';
import { TicketsModule } from './tickets/tickets.module';
import { SourcesModule } from './sources/sources.module';
import { HarmonizationModule } from './harmonization/harmonization.module';
import { ConflictsModule } from './conflicts/conflicts.module';
import { ConfidenceModule } from './confidence/confidence.module';
import { HarmonizedModule } from './harmonized/harmonized.module';
import { DroneModule } from './drone/drone.module';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    InfraModule, HealthModule, AuthModule, LlmModule,
    WardsModule, PropertiesModule, StatsModule, VerifyModule, ExportModule,
    AlertsModule, BriefModule, AdminModule, ChatModule, TicketsModule,
    SourcesModule, HarmonizationModule, ConflictsModule, ConfidenceModule,
    HarmonizedModule, DroneModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
```

### `backend/src/infra/infra.module.ts` + `pg.provider.ts`

```ts
// infra.module.ts
import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { R2 } from './r2.client';
import { Queue } from './queue.client';

export const PG = 'PG_POOL';

@Global()
@Module({
  providers: [
    { provide: PG, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) },
    R2, Queue,
  ],
  exports: [PG, R2, Queue],
})
export class InfraModule {}
```

```ts
// pg helper used by every service
import { Pool, QueryResultRow } from 'pg';
export async function q<T extends QueryResultRow = any>(pool: Pool, sql: string, params: unknown[] = []) {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}
export const one = async <T extends QueryResultRow = any>(pool: Pool, sql: string, params: unknown[] = []) =>
  (await q<T>(pool, sql, params))[0] ?? null;
```

### `backend/src/infra/r2.client.ts`

```ts
import { Injectable } from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2 {
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  private readonly bucket = process.env.R2_BUCKET_NAME!;

  presignPut(key: string, contentType: string, expiresIn = 300) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn });
  }
  presignGet(key: string, expiresIn = 3600) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
  async putObject(key: string, body: Buffer | string, contentType = 'application/octet-stream') {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async ping(): Promise<'ok' | 'down'> {
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); return 'ok'; }
    catch { return 'down'; }
  }
}
```

### `backend/src/infra/queue.client.ts`

```ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createClient } from 'redis';

@Injectable()
export class Queue implements OnModuleDestroy {
  private client = createClient({ url: process.env.REDIS_URL });
  private ready = this.client.connect();

  async enqueue(stream: 'ingest', job: Record<string, unknown>) {
    await this.ready;
    const jobId = randomUUID();
    await this.client.lPush(`queue:${stream}`, JSON.stringify({ jobId, ...job }));
    return jobId;
  }
  async ping(): Promise<'ok' | 'down'> {
    try { await this.ready; return (await this.client.ping()) === 'PONG' ? 'ok' : 'down'; }
    catch { return 'down'; }
  }
  onModuleDestroy() { return this.client.quit(); }
}
```

### `backend/src/infra/supabase.ts` + `common/auth.guard.ts` + `roles.decorator.ts`

```ts
// supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,   // server-side only
  { auth: { autoRefreshToken: false, persistSession: false } },
);
```

```ts
// roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata('isPublic', true);
```

```ts
// auth.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { supabaseAdmin } from '../infra/supabase';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('missing bearer token');

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid token');

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role, ward_scope').eq('id', data.user.id).single();
    req.user = { id: data.user.id, email: data.user.email, role: profile?.role ?? 'citizen',
                 wardScope: profile?.ward_scope ?? [] };

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException(`requires role: ${roles.join('|')}`);
    return true;
  }
}
```

### `backend/src/common/http-exception.filter.ts`

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof HttpException) {
      return res.status(err.getStatus()).json({ message: err.message, ...(err.getResponse() as object) });
    }
    const msg = (err as Error)?.message ?? 'Internal server error';
    const code = /not found/i.test(msg) ? HttpStatus.NOT_FOUND
               : /invalid|required|must be/i.test(msg) ? HttpStatus.BAD_REQUEST
               : HttpStatus.INTERNAL_SERVER_ERROR;
    return res.status(code).json({ message: code === 500 ? 'Internal server error' : msg });
  }
}
```

### `backend/src/health/health.module.ts` + `health.controller.ts`

```ts
// health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

```ts
// health.controller.ts
import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { R2 } from '../infra/r2.client';
import { Queue } from '../infra/queue.client';
import { Public } from '../common/roles.decorator';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  @Public()
  @Get()
  async check() {
    const db = await this.pg.query('SELECT 1').then(() => 'ok' as const).catch(() => 'down' as const);
    const [redis, r2] = await Promise.all([this.queue.ping(), this.r2.ping()]);
    const status = db === 'ok' && redis === 'ok' && r2 === 'ok' ? 'ok' : 'degraded';
    return { status, db, redis, r2, ts: new Date().toISOString() };
  }
}
```

### `backend/src/auth/auth.module.ts` + `auth.controller.ts` + `dto.ts`

```ts
// auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

@Module({ controllers: [AuthController] })
export class AuthModule {}
```

```ts
// auth/dto.ts
import { IsEmail, IsString } from 'class-validator';
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
```

```ts
// auth.controller.ts
import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { supabaseAdmin } from '../infra/supabase';
import { Public } from '../common/roles.decorator';
import { LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: dto.email, password: dto.password });
    if (error) throw new UnauthorizedException(error.message);
    return { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token,
             user: { id: data.user!.id, email: data.user!.email } };
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refresh_token') rt: string) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: rt });
    if (error) throw new UnauthorizedException(error.message);
    return { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
  }

  @Get('me')
  me(@Req() req: any) { return req.user; }
}
```

---

## 8. Ported existing modules

Each is a mechanical port of `gvmc-backend/<domain>/<domain>_service.py` (see `change of action.md`
Part C for the originals). Pattern: `@Controller` + `@Injectable` service + `pg` query.

### Module files (all §8 + §9 domains)

`wards` shows its `*.module.ts` below; every other domain follows the identical shape — one
file per folder, wiring the controller + service (+ any peer service it delegates to). Create
all of these so `app.module.ts` resolves:

```ts
// properties/properties.module.ts
import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { VerifyModule } from '../verify/verify.module';
@Module({ imports: [VerifyModule], controllers: [PropertiesController], providers: [PropertiesService] })
export class PropertiesModule {}

// verify/verify.module.ts
import { Module } from '@nestjs/common';
import { VerifyService } from './verify.service';
@Module({ providers: [VerifyService], exports: [VerifyService] })
export class VerifyModule {}

// stats/stats.module.ts
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
@Module({ controllers: [StatsController], providers: [StatsService], exports: [StatsService] })
export class StatsModule {}

// export/export.module.ts
import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
@Module({ providers: [ExportService], exports: [ExportService] })
export class ExportModule {}

// alerts/alerts.module.ts
import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { ExportModule } from '../export/export.module';
@Module({ imports: [ExportModule], controllers: [AlertsController], providers: [AlertsService] })
export class AlertsModule {}

// brief/brief.module.ts
import { Module } from '@nestjs/common';
import { BriefController } from './brief.controller';
import { BriefService } from './brief.service';
import { StatsModule } from '../stats/stats.module';
@Module({ imports: [StatsModule], controllers: [BriefController], providers: [BriefService] })
export class BriefModule {}

// admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}

// chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
@Module({ controllers: [ChatController] })
export class ChatModule {}

// tickets/tickets.module.ts
import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
@Module({ controllers: [TicketsController], providers: [TicketsService] })
export class TicketsModule {}

// harmonization/harmonization.module.ts
import { Module } from '@nestjs/common';
import { HarmonizationController } from './harmonization.controller';
import { HarmonizationService } from './harmonization.service';
@Module({ controllers: [HarmonizationController], providers: [HarmonizationService] })
export class HarmonizationModule {}

// conflicts/conflicts.module.ts
import { Module } from '@nestjs/common';
import { ConflictsController } from './conflicts.controller';
import { ConflictsService } from './conflicts.service';
@Module({ controllers: [ConflictsController], providers: [ConflictsService] })
export class ConflictsModule {}

// harmonized/harmonized.module.ts
import { Module } from '@nestjs/common';
import { HarmonizedController } from './harmonized.controller';
import { HarmonizedService } from './harmonized.service';
@Module({ controllers: [HarmonizedController], providers: [HarmonizedService] })
export class HarmonizedModule {}

// drone/drone.module.ts
import { Module } from '@nestjs/common';
import { DroneController } from './drone.controller';
@Module({ controllers: [DroneController] })
export class DroneModule {}
```

(`LlmModule`, `InfraModule` and `ConfidenceModule` are `@Global()` / exported — see §7 and §9 B.7.
`sources/sources.module.ts` is shown in §9 B.1.)

### `wards` (module + controller + service)

```ts
// wards/wards.module.ts
@Module({ controllers: [WardsController], providers: [WardsService] })
export class WardsModule {}
```

```ts
// wards/wards.controller.ts
@Controller('wards')
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  @Get()                       list() { return this.wards.listWards(); }
  @Get(':id/changes')          changes(@Param('id') id: string) { return this.wards.getChanges(id); }
  @Get(':id/unassessed')       unassessed(@Param('id') id: string, @Query() q: UnassessedQueryDto) {
                                 return this.wards.getUnassessed(id, q); }
  @Get(':id/alerts')           alerts(@Param('id') id: string) { return this.wards.getAlerts(id); }
  @Get(':id/geojson')          geojson(@Param('id') id: string) { return this.wards.getWardGeoJSON(id); }
}
```

```ts
// wards/wards.service.ts
@Injectable()
export class WardsService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2) {}

  async listWards() {
    return q(this.pg, `
      SELECT w.id, w.name, w.bbox_north, w.bbox_south, w.bbox_east, w.bbox_west, w.geojson_r2,
             COUNT(p.id)::int AS detection_count
      FROM wards w LEFT JOIN properties p ON p.ward_id = w.id
      GROUP BY w.id ORDER BY w.id`)
      .then(rows => rows.map(r => ({ ...r,
        bbox: { north: +r.bbox_north || 0, south: +r.bbox_south || 0, east: +r.bbox_east || 0, west: +r.bbox_west || 0 } })));
  }

  async getChanges(wardId: string) {
    const row = await one(this.pg, `SELECT geojson_r2 FROM wards WHERE id = $1`, [wardId]);
    if (!row?.geojson_r2) throw new NotFoundException('No GeoJSON found for this ward');
    return { presigned_url: await this.r2.presignGet(row.geojson_r2) };
  }

  async getUnassessed(wardId: string, f: UnassessedQueryDto) {
    const where = ['p.ward_id = $1']; const params: unknown[] = [wardId];
    if (f.type)   { params.push(f.type);   where.push(`p.detection_type = $${params.length}`); }
    if (f.status) { params.push(f.status); where.push(`p.status = $${params.length}`); }
    return q(this.pg, `
      SELECT p.id, p.ward_id, w.name AS ward_name, p.lat, p.lng, p.area_sqm, p.detection_type,
             p.confidence, p.confidence_breakdown, p.detected_at, p.geojson_r2, p.status, p.ai_explanation
      FROM properties p JOIN wards w ON w.id = p.ward_id
      WHERE ${where.join(' AND ')} ORDER BY p.confidence DESC`, params);
  }

  async getAlerts(wardId: string) {
    return q(this.pg, `SELECT id, severity, text, ward_id, created_at FROM alerts
                       WHERE ward_id = $1 ORDER BY created_at DESC`, [wardId]);
  }

  async getWardGeoJSON(wardId: string) {
    const rows = await q(this.pg, `
      SELECT sf.id, ST_AsGeoJSON(sf.geom)::json AS geometry, sf.properties
      FROM source_features sf JOIN data_sources ds ON ds.id = sf.source_id
      WHERE ds.ward_id = $1`, [wardId]);
    return { type: 'FeatureCollection',
             features: rows.map(r => ({ type: 'Feature', id: r.id, geometry: r.geometry, properties: r.properties })) };
  }
}
```

### `properties`

```ts
// properties/properties.controller.ts
@Controller('properties')
export class PropertiesController {
  constructor(private readonly props: PropertiesService, private readonly verify: VerifyService) {}

  @Get(':id')                     get(@Param('id') id: string) { return this.props.getProperty(id); }
  @Post(':id/verify')
  @Roles('official', 'admin')     verifyProp(@Param('id') id: string, @Body() dto: VerifyDto, @Req() req: any) {
                                    return this.verify.updateStatus(id, { ...dto, updatedBy: dto.updatedBy ?? req.user.email }); }
  @Get(':id/explain')            explain(@Param('id') id: string) { return this.props.explain(id); }
}
```

```ts
// properties/properties.service.ts
@Injectable()
export class PropertiesService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService) {}

  async getProperty(id: string) {
    const row = await one(this.pg, `
      SELECT p.*, w.name AS ward_name, p.updated_at AS verified_at
      FROM properties p JOIN wards w ON w.id = p.ward_id WHERE p.id = $1`, [id]);
    if (!row) throw new NotFoundException('Property not found');
    return row;
  }

  async explain(id: string) {
    const p = await this.getProperty(id);
    const text = await this.llm.explainProperty({
      ward_name: p.ward_name, ward_id: p.ward_id, area_sqm: p.area_sqm,
      detection_type: p.detection_type, confidence: Math.round((p.confidence ?? 0) * 100),
      confidence_breakdown: p.confidence_breakdown, detected_at: p.detected_at,
    });
    await this.pg.query(`UPDATE properties SET ai_explanation = $1 WHERE id = $2`, [text, id]);
    return { ai_explanation: text };
  }
}
```

### `verify`

```ts
// verify/verify.service.ts
@Injectable()
export class VerifyService {
  private static readonly VALID = new Set(
    ['pending','verified','underassessed','false_positive','already_assessed']);
  constructor(@Inject(PG) private pg: Pool) {}

  async updateStatus(propertyId: string, dto: { status: string; notes?: string; updatedBy?: string }) {
    if (!VerifyService.VALID.has(dto.status))
      throw new BadRequestException(`Invalid status. Must be one of: ${[...VerifyService.VALID].sort().join(', ')}`);
    const exists = await one(this.pg, `SELECT id FROM properties WHERE id = $1`, [propertyId]);
    if (!exists) throw new NotFoundException('Property not found');

    const now = new Date();
    await this.pg.query(
      `UPDATE properties SET status=$1, updated_by=$2, updated_at=$3, notes=$4 WHERE id=$5`,
      [dto.status, dto.updatedBy ?? 'officer', now, dto.notes ?? '', propertyId]);
    await this.pg.query(
      `INSERT INTO verification_status (property_id, status, updated_by, updated_at, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (property_id) DO UPDATE SET
         status=EXCLUDED.status, updated_by=EXCLUDED.updated_by,
         updated_at=EXCLUDED.updated_at, notes=EXCLUDED.notes`,
      [propertyId, dto.status, dto.updatedBy ?? 'officer', now, dto.notes ?? '']);
    return { status: dto.status };
  }
}
```

### `stats`

```ts
// stats/stats.service.ts  (KPI queries ported 1:1 from stats_service.py)
@Injectable()
export class StatsService {
  constructor(@Inject(PG) private pg: Pool) {}

  async getStats(wardId?: string) {
    const params = wardId ? [wardId] : [];
    const where  = wardId ? 'WHERE p.ward_id = $1' : '';
    const row = await one(this.pg, `
      SELECT COUNT(*)::int AS total_detections,
             COUNT(*) FILTER (WHERE detection_type='new_build')::int      AS new_builds,
             COUNT(*) FILTER (WHERE detection_type='change_of_use')::int  AS change_of_use,
             COUNT(*) FILTER (WHERE COALESCE(status,'pending')='pending')::int AS pending_verification,
             COUNT(*) FILTER (WHERE status='verified')::int              AS verified,
             COUNT(*) FILTER (WHERE status='false_positive')::int        AS false_positives,
             COALESCE(SUM(CASE WHEN COALESCE(status,'pending') IN ('pending','underassessed')
                  THEN area_sqm * CASE WHEN detection_type='new_build' THEN 80 ELSE 40 END ELSE 0 END),0) AS revenue_estimate
      FROM properties p ${where}`, params);
    const cfg = Object.fromEntries((await q(this.pg,
      `SELECT key_name, value FROM admin_config
       WHERE key_name IN ('data_mode','pipeline_status','last_refresh','ndbi_threshold')`))
      .map((r: any) => [r.key_name, r.value]));
    return { ...row, ward_id: wardId ?? null,
             data_mode: cfg.data_mode ?? 'demo', pipeline_status: cfg.pipeline_status ?? 'idle',
             last_refresh: cfg.last_refresh ?? null, ndbi_threshold: +(cfg.ndbi_threshold ?? 0.15) };
  }

  async getAllWards() {
    const wards = await q(this.pg, `
      SELECT w.id AS ward_id, w.name AS ward_name,
             COUNT(DISTINCT p.id)::int AS total_detections,
             COUNT(p.id) FILTER (WHERE p.detection_type='new_build')::int AS unassessed_count,
             COALESCE(t.open_tickets,0)::int     AS open_tickets,
             COALESCE(t.resolved_tickets,0)::int AS resolved_tickets
      FROM wards w
      LEFT JOIN properties p ON p.ward_id = w.id
      LEFT JOIN (SELECT ward_id,
                        COUNT(*) FILTER (WHERE status IN ('open','under_review')) AS open_tickets,
                        COUNT(*) FILTER (WHERE status='resolved') AS resolved_tickets
                 FROM tickets GROUP BY ward_id) t ON t.ward_id = w.id
      GROUP BY w.id, w.name, t.open_tickets, t.resolved_tickets
      ORDER BY unassessed_count DESC`);
    const totals = await this.getStats();
    return { wards: wards.map(w => ({ ...w, ai_brief: null })), ai_brief: null, totals };
  }
}
```

### `export`

```ts
// export/export.service.ts
@Injectable()
export class ExportService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2) {}

  async exportCsv(wardId?: string) {
    const params = wardId ? [wardId] : [];
    const rows = await q(this.pg, `
      SELECT p.id, w.name AS ward_name, p.lat, p.lng, p.area_sqm, p.detection_type, p.confidence,
             p.detected_at, COALESCE(vs.status,'pending') AS verification_status, vs.updated_by, vs.notes
      FROM properties p JOIN wards w ON w.id = p.ward_id
      LEFT JOIN verification_status vs ON vs.property_id = p.id
      ${wardId ? 'WHERE p.ward_id = $1' : ''} ORDER BY p.confidence DESC`, params);
    if (!rows.length) throw new BadRequestException('No rows to export');

    const header = Object.keys(rows[0]).join(',');
    const body   = rows.map(r => Object.values(r).map(v => JSON.stringify(v ?? '')).join(',')).join('\n');
    const key    = `exports/gvmc_properties_${new Date().toISOString().replace(/[:.]/g,'').slice(0,15)}.csv`;
    await this.r2.putObject(key, `${header}\n${body}`, 'text/csv');
    return { presigned_url: await this.r2.presignGet(key), row_count: rows.length };
  }
}
```

### `alerts` (export passthrough + AI alert generate)

```ts
// alerts/alerts.controller.ts
@Controller('alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService, private readonly exp: ExportService) {}

  @Post('export')
  @Roles('official', 'admin')
  export(@Query('ward_id') wardId?: string) { return this.exp.exportCsv(wardId); }

  @Post('generate')
  @Roles('analyst', 'admin')
  generate(@Body() dto: GenerateAlertDto) { return this.svc.generateAndStore(dto.wardId); }
}
```

```ts
// alerts/alerts.service.ts
@Injectable()
export class AlertsService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService) {}

  async generateAndStore(wardId: string) {
    const wardData = await one(this.pg, `
      SELECT w.id AS ward_id, w.name AS ward_name,
             COUNT(p.id) FILTER (WHERE p.detected_at > now() - interval '7 days')::int AS new_count,
             AVG(p.confidence) * 100 AS avg_confidence
      FROM wards w LEFT JOIN properties p ON p.ward_id = w.id
      WHERE w.id = $1 GROUP BY w.id, w.name`, [wardId]);
    const { text, severity, score } = await this.llm.generateWardAlert({
      ward_name: wardData.ward_name, ward_id: wardData.ward_id,
      new_count: wardData.new_count, monthly_baseline: 20,
      spike_pct: 0, avg_confidence: wardData.avg_confidence ?? 0, historical_fp_rate: 0.08,
      type_split: {}, largest_property_sqm: 0,
    });
    const sev = severity === 'HIGH' ? 'danger' : severity === 'MEDIUM' ? 'warning' : 'info';
    const row = await one(this.pg,
      `INSERT INTO alerts (ward_id, severity, text, score) VALUES ($1,$2,$3,$4) RETURNING *`,
      [wardId, sev, text, score]);
    return row;
  }
}
```

### `brief`

```ts
// brief/brief.controller.ts
@Controller('brief')
export class BriefController {
  constructor(private readonly svc: BriefService) {}
  @Get()
  @Roles('analyst', 'admin')            // 'analyst' == commissioner in this deployment
  get() { return this.svc.dailyBrief(); }
}
```

```ts
// brief/brief.service.ts
@Injectable()
export class BriefService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService, private stats: StatsService) {}

  async dailyBrief() {
    const all = await this.stats.getAllWards();
    const text = await this.llm.generateCommissionerBrief({
      city_totals: {
        data_as_of: new Date().toISOString().slice(0, 10),
        total_detected: all.totals.total_detections,
        total_unassessed: all.totals.new_builds,
        total_underassessed: all.totals.change_of_use,
        est_revenue_cr: (all.totals.revenue_estimate / 1e7).toFixed(2),
      },
      top_wards: all.wards.slice(0, 10).map((w: any) => ({
        ward_id: w.ward_id, ward_name: w.ward_name,
        new_builds: w.unassessed_count, change_of_use: 0,
        false_positive_rate: 0.08, est_revenue_lakhs: 0,
      })),
    });
    return { ai_brief: text, generated_at: new Date().toISOString() };
  }
}
```

### `admin`

```ts
// admin/admin.service.ts
@Injectable()
export class AdminService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  async uploadCsv(dto: UploadCsvDto) {                       // legacy archive-only behaviour kept
    const key = `uploads/${dto.filename ?? 'assessment_data.csv'}`;
    await this.r2.putObject(key, Buffer.from(dto.fileContent, 'base64'), 'text/csv');
    await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ('data_mode','live')
                         ON CONFLICT (key_name) DO UPDATE SET value='live', updated_at=now()`);
    return { properties_imported: 0, message: 'CSV uploaded. Use POST /sources/upload for real ingestion.' };
  }

  async dbConfig(dto: Record<string, unknown>) {
    const allowed = ['ndbi_threshold', 'min_area_sqm', 'cloud_cover_max'];
    for (const k of allowed) if (dto[k] != null)
      await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ($1,$2)
                           ON CONFLICT (key_name) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
                          [k, String(dto[k])]);
    return {};
  }

  async refresh() {                                          // was: SSM send-command to EC2
    const wards = await q(this.pg, `SELECT id FROM wards`);
    const jobs = await Promise.all(wards.map(w => this.queue.enqueue('ingest', { jobType: 'HARMONIZE_WARD', wardId: w.id })));
    await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ('pipeline_status','running')
                         ON CONFLICT (key_name) DO UPDATE SET value='running', updated_at=now()`);
    return { triggered: true, jobs: jobs.length };
  }
}
```

### `chat` (now a real Groq call)

```ts
// chat/chat.controller.ts
@Controller('chat')
export class ChatController {
  constructor(private readonly llm: LlmService, @Inject(PG) private pg: Pool) {}

  @Post()
  async chat(@Body() dto: ChatDto) {
    if (!dto.message?.trim()) throw new BadRequestException('message is required');
    // single-shot: give the model the ward/stat context it needs (no ReAct loop)
    const stats = await q(this.pg, `SELECT id, name FROM wards ORDER BY id`);
    const response = await this.llm.chatReply(dto.message.trim(), { wards: stats });
    return { response };
  }
}
```

### `llm` — Groq client (ported from `pipeline/bedrock_client.py`, prompts verbatim)

```ts
// llm/llm.module.ts
@Global()
@Module({ providers: [LlmService], exports: [LlmService] })
export class LlmModule {}
```

```ts
// llm/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';

// ── Templated fallbacks (ported from pipeline/bedrock_client.py). Any Groq error —
//    or a missing GROQ_API_KEY — returns one of these so an AI outage never 500s the API. ──
const FALLBACK = {
  explain: (p: any) =>
    `Satellite change-detection flagged this ${p.area_sqm ?? 'unknown'} sqm ${p.detection_type ?? 'structure'} ` +
    `in Ward ${p.ward_id} (${p.ward_name ?? ''}) at ${Math.round(p.confidence ?? 0)}% confidence. ` +
    `Built-up (NDBI) change and footprint growth suggest recent construction not yet on the assessment roll; ` +
    `a field visit is recommended to confirm. Indicative annual tax: ` +
    `${p.detection_type === 'new_build' ? 'Rs 12–40 per sqm/year by use' : 'Rs 18–25 per sqm/year on the added area'}.`,
  brief: (s: any) => {
    const t = s.city_totals ?? {};
    return `Daily brief (fallback — AI unavailable). City-wide: ${t.total_detected ?? 0} properties detected, ` +
      `${t.total_unassessed ?? 0} unassessed new builds, ${t.total_underassessed ?? 0} change-of-use, ` +
      `est. additional revenue Rs ${t.est_revenue_cr ?? 0} crore. Prioritise the wards with the highest ` +
      `unassessed counts in the table below and deploy field teams there first.`;
  },
  alert: (w: any, severity: string) =>
    `Ward ${w.ward_id} (${w.ward_name ?? ''}) recorded ${w.new_count ?? 0} new detections this run vs a ` +
    `baseline of ${w.monthly_baseline ?? 0}. Recommended action: schedule a ${severity} priority field ` +
    `verification sweep for this ward.`,
  chat: () =>
    `The assistant is temporarily unavailable. For ward data use the dashboard filters, or retry shortly.`,
};

@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name);
  private readonly model = 'llama-3.3-70b-versatile';

  // Lazy — construct the client only on first use, and only if a key is set. This keeps the
  // backend booting (and CI green) with no GROQ_API_KEY: every method below already wraps
  // `chat()` in try/catch and returns a templated FALLBACK, so a missing key degrades AI
  // output to templates instead of crashing at module load.
  private _groq?: Groq;
  private get groq(): Groq {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set — using templated fallback');
    return (this._groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));   // server-side only
  }

  private async chat(prompt: string, maxTokens = 400, temperature = 0.5): Promise<string> {
    const r = await this.groq.chat.completions.create({
      model: this.model, max_tokens: maxTokens, temperature,
      messages: [{ role: 'user', content: prompt }],
    });
    return r.choices[0].message.content!.trim();
  }

  // ── Spot 1: Property Explainer (prompt text unchanged from pipeline/bedrock_client.py) ──
  async explainProperty(p: any): Promise<string> {
    const c = p.confidence ?? 0;
    const verdict = c >= 80 ? 'High confidence — likely a real unassessed structure'
                  : c >= 60 ? 'Moderate confidence — field visit recommended to confirm'
                  : 'Low confidence — manual check needed before assessment';
    const b = p.confidence_breakdown ?? {};
    const taxHint = p.detection_type === 'new_build'
      ? 'Residential new build: Rs 12–18 per sqm/year. Commercial: Rs 25–40 per sqm/year.'
      : 'Change of use / expansion: Rs 18–25 per sqm/year on the additional area only.';
    try {
      return await this.chat(
`You are a GVMC Revenue assistant helping field officers in Visakhapatnam.

A property has been flagged by satellite detection. In exactly 3 sentences:
1. Describe what the satellite signals suggest about this property and when it was likely built.
2. Explain the strongest evidence signals (NDBI change, area, NDVI drop).
3. Give an estimated annual property tax in Rs based on area and type.

Confidence verdict: ${verdict}
Tax guidance: ${taxHint}

Property data:
- Ward: ${p.ward_name} (Ward ${p.ward_id})
- Area: ${p.area_sqm} sqm
- Detection type: ${p.detection_type}
- Overall confidence: ${c}%
- NDBI change (built-up signal): ${b.ndbi_delta} (threshold 0.15)
- Area footprint delta: ${b.area_delta} sqm
- OSM status: ${b.osm_status}
- NDVI drop (vegetation cleared): ${b.ndvi_drop}
- In assessment DB: ${b.db_match}
- Detected at: ${p.detected_at}

Write in plain English. Be specific. Do not use bullet points.`, 300);
    } catch (e) { this.log.warn(`explainProperty fallback: ${e}`); return FALLBACK.explain(p); }
  }

  // ── Spot 2: Commissioner Daily Brief ──
  async generateCommissionerBrief(s: any): Promise<string> {
    const t = s.city_totals ?? {};
    const wardsSummary = (s.top_wards ?? []).slice(0, 10).map((w: any) =>
      `- Ward ${w.ward_id} (${w.ward_name}): ${w.new_builds} new builds, ${w.change_of_use} change-of-use, `
      + `FP rate ${Math.round(w.false_positive_rate * 100)}%, est. Rs ${(+w.est_revenue_lakhs).toFixed(1)}L`).join('\n');
    try {
      return await this.chat(
`You are an AI assistant generating a daily brief for the GVMC Commissioner in Visakhapatnam.

Write a 3-paragraph brief:
Paragraph 1: City-wide summary of today's satellite detection results.
Paragraph 2: Highlight the top 3 wards needing urgent attention and why.
Paragraph 3: Staff deployment recommendation — which wards to prioritize and why.

Be specific about ward names, numbers, and rupee amounts. Use a formal but clear tone.

City-wide totals (as of ${t.data_as_of}):
- Total properties detected: ${t.total_detected}
- Unassessed (new builds): ${t.total_unassessed}
- Underassessed (change of use): ${t.total_underassessed}
- Estimated additional revenue: Rs ${t.est_revenue_cr} crore

Ward breakdown:
${wardsSummary}`, 500);
    } catch (e) { this.log.warn(`brief fallback: ${e}`); return FALLBACK.brief(s); }
  }

  // ── Spot 3: AI Alert Generator ──
  async generateWardAlert(w: any): Promise<{ text: string; severity: string; score: number }> {
    const spike = w.spike_pct ?? 0, avgConf = w.avg_confidence ?? 0, fp = w.historical_fp_rate ?? 0;
    let score = 0;
    if (spike > 200) score += 40; else if (spike > 100) score += 20;
    if (avgConf > 80) score += 30; else if (avgConf > 60) score += 15;
    if (fp < 0.10) score += 20;
    if ((w.type_split?.change_of_use ?? 0) > 5) score += 10;
    const severity = score >= 71 ? 'HIGH' : score >= 41 ? 'MEDIUM' : 'LOW';
    const ts = w.type_split ?? {};
    let text: string;
    try {
      text = await this.chat(
`You are an AI system generating a concise alert for GVMC Revenue supervisors.

Write a 2-sentence alert for this ward. First sentence: state the detection spike and pattern.
Second sentence: state the recommended action and urgency level (${severity}).

Ward: ${w.ward_name} (Ward ${w.ward_id})
New detections this run: ${w.new_count}
Monthly baseline: ${w.monthly_baseline}
Spike above baseline: ${spike.toFixed(0)}%
New builds: ${ts.new_build ?? 0} | Change of use: ${ts.change_of_use ?? 0}
Average detection confidence: ${avgConf.toFixed(1)}%
Historical false-positive rate: ${Math.round(fp * 100)}%
Largest property: ${w.largest_property_sqm} sqm
Severity: ${severity}

Do not use bullet points. Keep it under 60 words total.`, 150);
    } catch (e) { this.log.warn(`alert fallback: ${e}`); text = FALLBACK.alert(w, severity); }
    return { text, severity, score };
  }

  // ── Officer chatbot: single-shot (no ReAct tool loop — see change of action.md gotcha #2) ──
  async chatReply(message: string, ctx: { wards: { id: string; name: string }[] }): Promise<string> {
    const wardRef = ctx.wards.map(w => `- Ward ${w.id} = ${w.name}`).join('\n');
    try {
      return await this.chat(
`You are an AI assistant for GVMC field revenue officers. Answer concisely.
Ward reference:
${wardRef}

Officer question: ${message}`, 400);
    } catch (e) { this.log.warn(`chatReply fallback: ${e}`); return FALLBACK.chat(); }
  }

  // ── B.5: Schema mapper (Agent D) ──
  async suggestFieldMapping(a: DatasetSample, b: DatasetSample): Promise<FieldMapping[]> {
    try {
      const raw = await this.chat(
`You are a data-integration assistant for the NAKSHA land-records programme.
Given two datasets' column headers and sample rows, propose a field-to-field mapping.
For each mapping output an object: {"field_a","field_b","confidence"(0-1),"rationale"(one line)}.
Return a JSON array only, no prose.

Dataset A columns: ${JSON.stringify(a.columns)}
Dataset A sample rows: ${JSON.stringify(a.sampleRows.slice(0, 3))}
Dataset B columns: ${JSON.stringify(b.columns)}
Dataset B sample rows: ${JSON.stringify(b.sampleRows.slice(0, 3))}`, 700, 0.2);
      return JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)) as FieldMapping[];
    } catch (e) {
      this.log.warn(`suggestFieldMapping fallback (exact-name match): ${e}`);
      // deterministic fallback: map columns that share a (case-insensitive) name
      const bl = b.columns.map(c => c.toLowerCase());
      return a.columns
        .filter(c => bl.includes(c.toLowerCase()))
        .map(c => ({ field_a: c, field_b: b.columns[bl.indexOf(c.toLowerCase())],
                     confidence: 0.5, rationale: 'exact column-name match (LLM unavailable)' }));
    }
  }
}

export interface DatasetSample { columns: string[]; sampleRows: Record<string, unknown>[]; }
export interface FieldMapping { field_a: string; field_b: string; confidence: number; rationale: string; }
```

### `tickets` (ported + GT fields)

```ts
// tickets/tickets.controller.ts
@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  @Post()             @Roles('official')          create(@Body() dto: CreateTicketDto) { return this.svc.create(dto); }
  @Get()              @Roles('official','admin')  list(@Query() q: ListTicketsDto)      { return this.svc.list(q); }
  @Get(':id')         @Roles('official','admin')  get(@Param('id') id: string)          { return this.svc.get(id); }
  @Patch(':id/review')@Roles('official','admin')  review(@Param('id') id: string, @Body() dto: ReviewTicketDto) { return this.svc.review(id, dto); }
  @Post('photo-upload')@Roles('official')         photo(@Body() dto: PhotoUploadDto)     { return this.svc.photoUploadUrl(dto); }
}
```

```ts
// tickets/tickets.service.ts
@Injectable()
export class TicketsService {
  private static readonly REVIEW = new Set(['under_review', 'resolved']);
  constructor(@Inject(PG) private pg: Pool, private r2: R2) {}

  async create(dto: CreateTicketDto) {
    for (const f of ['wardId', 'houseNumber', 'description'] as const)
      if (!dto[f]?.trim()) throw new BadRequestException(`${f} is required`);
    if (!await one(this.pg, `SELECT id FROM wards WHERE id = $1`, [dto.wardId]))
      throw new NotFoundException('Ward not found');
    const row = await one(this.pg, `
      INSERT INTO tickets (ward_id, property_id, parcel_id, house_number, description,
                           tax_pending, gnss_lat, gnss_lng, gnss_accuracy_m, photo_r2_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, status`,
      [dto.wardId, dto.propertyId ?? null, dto.parcelId ?? null, dto.houseNumber, dto.description,
       dto.taxPending ?? null, dto.gnssLat ?? null, dto.gnssLng ?? null, dto.gnssAccuracyM ?? null,
       dto.photoR2Key ?? null]);
    return row;
  }

  async list(f: ListTicketsDto) {
    const where: string[] = []; const params: unknown[] = [];
    if (f.wardId) { params.push(f.wardId); where.push(`t.ward_id = $${params.length}`); }
    if (f.status) { params.push(f.status); where.push(`t.status = $${params.length}`); }
    const rows = await q(this.pg, `
      SELECT t.*, w.name AS ward_name FROM tickets t JOIN wards w ON w.id = t.ward_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.created_at DESC`, params);
    return { tickets: rows };
  }

  async get(id: string) {
    const row = await one(this.pg, `
      SELECT t.*, w.name AS ward_name FROM tickets t JOIN wards w ON w.id = t.ward_id WHERE t.id = $1`, [id]);
    if (!row) throw new NotFoundException('Ticket not found');
    if (row.photo_r2_key) row.photo_url = await this.r2.presignGet(row.photo_r2_key);
    return { ticket: row };
  }

  async review(id: string, dto: ReviewTicketDto) {
    if (!TicketsService.REVIEW.has(dto.status))
      throw new BadRequestException(`status must be one of: ${[...TicketsService.REVIEW].sort().join(', ')}`);
    const { rowCount } = await this.pg.query(
      `UPDATE tickets SET status=$1, supervisor_notes=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
       WHERE id=$4`, [dto.status, dto.supervisorNotes ?? '', dto.reviewedBy ?? 'supervisor', id]);
    if (!rowCount) throw new NotFoundException('Ticket not found');
    return { status: dto.status };
  }

  async photoUploadUrl(dto: PhotoUploadDto) {
    const ext = (dto.filename?.split('.').pop() ?? 'jpg').toLowerCase();
    const safe = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? ext : 'jpg';
    const key = `uploads/tickets/${crypto.randomUUID()}.${safe}`;
    const ct  = safe === 'jpg' || safe === 'jpeg' ? 'image/jpeg' : `image/${safe}`;
    return { upload_url: await this.r2.presignPut(key, ct), r2_key: key };
  }
}
```

### DTOs (shared style — class-validator)

```ts
// common DTO examples
export class VerifyDto {
  @IsIn(['pending','verified','underassessed','false_positive','already_assessed']) status!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() updatedBy?: string;
}
export class UnassessedQueryDto {
  @IsOptional() @IsIn(['new_build','change_of_use']) type?: string;
  @IsOptional() @IsString() status?: string;
}
export class ChatDto { @IsString() @MinLength(1) message!: string; }
export class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
export class CreateTicketDto {
  @IsString() wardId!: string; @IsString() houseNumber!: string; @IsString() description!: string;
  @IsOptional() @IsUUID() propertyId?: string; @IsOptional() @IsUUID() parcelId?: string;
  @IsOptional() @IsNumber() taxPending?: number;
  @IsOptional() @IsNumber() gnssLat?: number; @IsOptional() @IsNumber() gnssLng?: number;
  @IsOptional() @IsNumber() gnssAccuracyM?: number; @IsOptional() @IsString() photoR2Key?: string;
}
```

---

## 9. Part B — PS 26013 feature modules (full code)

### B.1 — `sources` module (multi-source ingestion) + B.9 hook

```ts
// sources/sources.module.ts
@Module({ controllers: [SourcesController], providers: [SourcesService] })
export class SourcesModule {}
```

```ts
// sources/sources.controller.ts
@Controller('sources')
export class SourcesController {
  constructor(private readonly svc: SourcesService) {}

  @Post('upload')
  @Roles('admin', 'analyst')
  createUpload(@Body() dto: CreateSourceDto, @Req() req: any) { return this.svc.registerAndPresign(dto, req.user.id); }

  @Get()
  list(@Query() q: ListSourcesDto) { return this.svc.list(q); }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.svc.getWithDownloadUrl(id); }

  @Get(':id/features')
  features(@Param('id') id: string) { return this.svc.featuresGeoJSON(id); }

  @Post(':id/digitize')
  @Roles('admin', 'analyst')
  digitize(@Param('id') id: string) { return this.svc.enqueueOcr(id); }
}
```

```ts
// sources/sources.service.ts
const EXT: Record<string, string> = {
  drone_imagery: 'tif', ori: 'tif', dsm_dtm: 'tif',
  cadastral: 'geojson', municipal_gis: 'geojson', utility: 'geojson', building_footprint: 'geojson',
  revenue: 'csv', ground_truth: 'gpx', gnss_cors: 'csv',
};
const CT: Record<string, string> = {
  tif: 'image/tiff', geojson: 'application/geo+json', csv: 'text/csv', gpx: 'application/gpx+xml', pdf: 'application/pdf',
};

@Injectable()
export class SourcesService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  async registerAndPresign(dto: CreateSourceDto, userId: string) {
    const scanned = dto.type === 'revenue' && dto.scanned === true;
    const ext = scanned ? 'pdf' : EXT[dto.type];
    const id  = crypto.randomUUID();
    const key = `sources/${dto.type}/${id}.${ext}`;
    const status: string = scanned ? 'pending_ocr' : 'processing';

    await this.pg.query(`
      INSERT INTO data_sources (id, type, ward_id, r2_key, original_name, crs, captured_at, scanned, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, dto.type, dto.wardId ?? null, key, dto.originalName ?? null, dto.crs ?? null,
       dto.capturedAt ?? null, scanned, status, userId]);

    const uploadUrl = await this.r2.presignPut(key, CT[ext]);
    let jobId: string | null = null;
    if (!scanned)
      jobId = await this.queue.enqueue('ingest', { jobType: 'NORMALIZE_SOURCE', sourceId: id, r2Key: key, type: dto.type });

    await this.audit(userId, 'source.register', `data_sources:${id}`, { type: dto.type, scanned });
    return { sourceId: id, uploadUrl, status, jobId };
  }

  async list(f: ListSourcesDto) {
    const where: string[] = []; const params: unknown[] = [];
    for (const [col, val] of [['type', f.type], ['ward_id', f.wardId], ['status', f.status]] as const)
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    return q(this.pg, `
      SELECT id, type, ward_id, status, crs, captured_at, scanned, metadata, created_at
      FROM data_sources ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`, params);
  }

  async getWithDownloadUrl(id: string) {
    const row = await one(this.pg, `SELECT * FROM data_sources WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Source not found');
    return { ...row, download_url: await this.r2.presignGet(row.r2_key) };
  }

  async featuresGeoJSON(id: string) {
    const rows = await q(this.pg, `
      SELECT id, ST_AsGeoJSON(geom)::json AS geometry, properties, was_invalid
      FROM source_features WHERE source_id = $1`, [id]);
    return { type: 'FeatureCollection',
             features: rows.map(r => ({ type: 'Feature', id: r.id, geometry: r.geometry,
                                        properties: { ...r.properties, _was_invalid: r.was_invalid } })) };
  }

  async enqueueOcr(id: string) {
    const row = await one(this.pg, `SELECT id, status FROM data_sources WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Source not found');
    const jobId = await this.queue.enqueue('ingest', { jobType: 'DIGITIZE_SOURCE', sourceId: id });
    await this.pg.query(`UPDATE data_sources SET status='processing' WHERE id=$1`, [id]);
    return { status: 'processing', jobId };
  }

  private audit(actor: string, action: string, entity: string, detail: object) {
    return this.pg.query(`INSERT INTO audit_logs (actor, action, entity, detail) VALUES ($1,$2,$3,$4)`,
                         [actor, action, entity, detail]);
  }
}
```

```ts
// sources/dto.ts
export class CreateSourceDto {
  @IsIn(['drone_imagery','ori','dsm_dtm','cadastral','revenue','municipal_gis','utility','ground_truth','gnss_cors','building_footprint'])
  type!: string;
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsString() originalName?: string;
  @IsOptional() @Matches(/^EPSG:\d{4,6}$/) crs?: string;
  @IsOptional() @IsDateString() capturedAt?: string;
  @IsOptional() @IsBoolean() scanned?: boolean;
}
export class ListSourcesDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsString() status?: string;
}
```

### B.3 + B.5 — `harmonization` module

```ts
// harmonization/harmonization.controller.ts
@Controller('harmonization')
export class HarmonizationController {
  constructor(private readonly svc: HarmonizationService, private readonly llm: LlmService,
              @Inject(PG) private pg: Pool) {}

  @Post('run')
  @Roles('admin', 'analyst')
  async run(@Query('wardId') wardId?: string) {
    const wards = wardId ? [wardId] : (await q(this.pg, `SELECT id FROM wards`)).map((r: any) => r.id);
    const jobs = await Promise.all(wards.map(w => this.svc.enqueueBatch(w)));
    return { status: 'processing', jobs };
  }

  @Get('matches')
  matches(@Query('wardId') wardId?: string, @Query('minScore') minScore = '0') {
    return this.svc.listMatches(wardId, Number(minScore));
  }

  @Get('matches/:id')
  matchDetail(@Param('id') id: string) { return this.svc.matchDetail(id); }

  @Post('schema-map')
  @Roles('admin', 'analyst')
  async schemaMap(@Body() dto: SchemaMapDto) {
    const mappings = await this.llm.suggestFieldMapping(dto.a, dto.b);
    if (dto.sourceAId && dto.sourceBId) await this.svc.persistMappings(dto.sourceAId, dto.sourceBId, mappings);
    return { mappings };
  }

  @Get('schema-map')
  listMappings(@Query('sourceAId') a?: string, @Query('sourceBId') b?: string) {
    return this.svc.listMappings(a, b);
  }
}
```

```ts
// harmonization/harmonization.service.ts
@Injectable()
export class HarmonizationService {
  constructor(@Inject(PG) private pg: Pool, private queue: Queue) {}

  enqueueBatch(wardId: string) {
    return this.queue.enqueue('ingest', { jobType: 'HARMONIZE_WARD', wardId });
  }

  listMatches(wardId: string | undefined, minScore: number) {
    const where: string[] = ['match_score >= $1']; const params: unknown[] = [minScore];
    if (wardId) { params.push(wardId); where.push(`ward_id = $${params.length}`); }
    return q(this.pg, `SELECT * FROM matches WHERE ${where.join(' AND ')} ORDER BY match_score DESC`, params);
  }

  async matchDetail(id: string) {
    const row = await one(this.pg, `
      SELECT m.*,
             ST_AsGeoJSON(fa.geom)::json AS feature_a_geom, fa.properties AS feature_a_props,
             ST_AsGeoJSON(fb.geom)::json AS feature_b_geom, fb.properties AS feature_b_props
      FROM matches m
      JOIN source_features fa ON fa.id = m.feature_a_id
      JOIN source_features fb ON fb.id = m.feature_b_id
      WHERE m.id = $1`, [id]);
    if (!row) throw new NotFoundException('Match not found');
    return row;
  }

  async persistMappings(a: string, b: string, mappings: FieldMapping[]) {
    for (const m of mappings)
      await this.pg.query(`
        INSERT INTO schema_mappings (source_a_id, source_b_id, field_a, field_b, confidence, rationale)
        VALUES ($1,$2,$3,$4,$5,$6)`, [a, b, m.field_a, m.field_b, m.confidence, m.rationale]);
  }

  listMappings(a?: string, b?: string) {
    const where: string[] = []; const params: unknown[] = [];
    if (a) { params.push(a); where.push(`source_a_id = $${params.length}`); }
    if (b) { params.push(b); where.push(`source_b_id = $${params.length}`); }
    return q(this.pg, `SELECT * FROM schema_mappings ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                       ORDER BY confidence DESC`, params);
  }
}
```

```ts
// harmonization/dto.ts
export class DatasetSampleDto {
  @IsArray() @IsString({ each: true }) columns!: string[];
  @IsArray() sampleRows!: Record<string, unknown>[];
}
export class SchemaMapDto {
  @ValidateNested() @Type(() => DatasetSampleDto) a!: DatasetSampleDto;
  @ValidateNested() @Type(() => DatasetSampleDto) b!: DatasetSampleDto;
  @IsOptional() @IsUUID() sourceAId?: string;
  @IsOptional() @IsUUID() sourceBId?: string;
}
```

**B.3 core algorithm — the PostGIS matching query.** Save this block verbatim as
**`worker/src/harmonize/match_ward.sql`** — `match.py` loads it with
`open(os.path.join(os.path.dirname(__file__), "match_ward.sql")).read()` and passes
`{"ward": <id>}`. Output columns `a_id, b_id, a_type, b_type, iou, dist_m, match_score` are
consumed 1:1 by `match_ward()`.

```sql
-- worker/src/harmonize/match_ward.sql
WITH pairs AS (
  SELECT a.id AS a_id, b.id AS b_id, da.type AS a_type, db.type AS b_type,
         CASE WHEN ST_Dimension(a.geom) = 2 AND ST_Dimension(b.geom) = 2
              THEN ST_Area(ST_Intersection(a.geom, b.geom))
                   / NULLIF(ST_Area(ST_Union(a.geom, b.geom)), 0)
         END AS iou,
         CASE WHEN ST_Dimension(a.geom) = 0 OR ST_Dimension(b.geom) = 0
              THEN ST_Distance(a.geom::geography, ST_Centroid(b.geom)::geography)
         END AS dist_m
  FROM source_features a
  JOIN data_sources   da ON da.id = a.source_id
  JOIN source_features b  ON b.id > a.id
       AND ST_DWithin(a.geom::geography, b.geom::geography, 50)   -- GiST-indexed prune
  JOIN data_sources   db ON db.id = b.source_id
  WHERE da.ward_id = %(ward)s AND db.ward_id = %(ward)s AND da.type <> db.type
)
SELECT *, round(100 * COALESCE(iou, GREATEST(0, 1 - dist_m / 25.0)), 2) AS match_score
FROM pairs
WHERE COALESCE(iou, 0) >= 0.30 OR COALESCE(dist_m, 999) <= 25;
```

### B.6 — `conflicts` module

```ts
// conflicts/conflicts.controller.ts
@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly svc: ConflictsService) {}

  @Get()
  list(@Query() q: ListConflictsDto) { return this.svc.list(q); }

  @Get(':id')
  get(@Param('id') id: string) { return this.svc.get(id); }

  @Post(':id/resolve')
  @Roles('official', 'admin')
  resolve(@Param('id') id: string, @Body() dto: ResolveConflictDto, @Req() req: any) {
    return this.svc.resolve(id, { ...dto, resolvedBy: dto.resolvedBy ?? req.user.email });
  }
}
```

```ts
// conflicts/conflicts.service.ts
@Injectable()
export class ConflictsService {
  private static readonly VALID = new Set(['pending', 'resolved', 'needs_review', 'rejected']);
  constructor(@Inject(PG) private pg: Pool) {}

  list(f: ListConflictsDto) {
    const where: string[] = []; const params: unknown[] = [];
    for (const [col, val] of [['ward_id', f.wardId], ['status', f.status], ['severity', f.severity]] as const)
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    return q(this.pg, `SELECT * FROM conflicts ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                       ORDER BY array_position(ARRAY['critical','high','medium','low']::text[], severity::text),
                                created_at DESC`, params);
  }

  async get(id: string) {
    const row = await one(this.pg, `
      SELECT c.*, row_to_json(m.*) AS match FROM conflicts c
      LEFT JOIN matches m ON m.id = c.match_id WHERE c.id = $1`, [id]);
    if (!row) throw new NotFoundException('Conflict not found');
    return row;
  }

  async resolve(id: string, dto: { status: string; notes?: string; resolvedBy?: string }) {
    if (!ConflictsService.VALID.has(dto.status))
      throw new BadRequestException(`status must be one of: ${[...ConflictsService.VALID].join(', ')}`);
    const { rowCount } = await this.pg.query(`
      UPDATE conflicts SET status=$1, notes=COALESCE($2, notes), resolved_by=$3, resolved_at=now()
      WHERE id=$4`, [dto.status, dto.notes ?? null, dto.resolvedBy ?? 'official', id]);
    if (!rowCount) throw new NotFoundException('Conflict not found');
    await this.pg.query(`INSERT INTO audit_logs (action, entity, detail) VALUES ('conflict.resolve', $1, $2)`,
                        [`conflicts:${id}`, dto]);
    return { status: dto.status };
  }
}
```

```ts
// conflicts/dto.ts
export class ListConflictsDto {
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsIn(['pending','resolved','needs_review','rejected']) status?: string;
  @IsOptional() @IsIn(['low','medium','high','critical']) severity?: string;
}
export class ResolveConflictDto {
  @IsIn(['resolved','needs_review','rejected']) status!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() resolvedBy?: string;
}
```

### B.7 — `confidence` service (consumed by the worker after matching)

```ts
// confidence/confidence.service.ts
const SOURCE_RELIABILITY: Record<string, number> = {
  gnss_cors: 1.0, cadastral: 0.95, ground_truth: 0.9, building_footprint: 0.8,
  municipal_gis: 0.8, utility: 0.75, ori: 0.7, dsm_dtm: 0.7, revenue: 0.65, drone_imagery: 0.6,
};

@Injectable()
export class ConfidenceService {
  build(input: {
    matchScore: number;                 // 0-100 from B.3
    fieldMappings: { confidence: number }[];
    sourceAType: string; sourceBType: string;
    capturedAt: Date | null;
  }) {
    const geometric   = input.matchScore / 100;
    const attribute   = input.fieldMappings.length
      ? input.fieldMappings.reduce((s, m) => s + m.confidence, 0) / input.fieldMappings.length : 0.5;
    const reliability = (SOURCE_RELIABILITY[input.sourceAType] + SOURCE_RELIABILITY[input.sourceBType]) / 2;
    const ageYears    = input.capturedAt ? (Date.now() - input.capturedAt.getTime()) / 3.15576e10 : 5;
    const recency     = Math.max(0, 1 - ageYears / 5);

    const breakdown = {
      geometric_match_score: round4(geometric),
      attribute_match_score: round4(attribute),
      source_reliability_weight: round4(reliability),
      recency_score: round4(recency),
    };
    const weights = [0.4, 0.3, 0.2, 0.1];
    const score = Math.round(100 *
      [geometric, attribute, reliability, recency].reduce((s, v, i) => s + v * weights[i], 0));
    return { score, breakdown };
  }
}
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
```

```ts
// confidence/confidence.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfidenceService } from './confidence.service';

// @Global so any module can inject ConfidenceService without importing ConfidenceModule
// (matches the §8 note). The worker owns the batch path (match.py::_confidence); this
// API-side service is only an optional on-demand recompute — e.g. after an analyst
// approves schema mappings. It is imported in AppModule (§7).
@Global()
@Module({ providers: [ConfidenceService], exports: [ConfidenceService] })
export class ConfidenceModule {}
```

> The **worker owns the batch path**: `worker/src/harmonize/match.py::_confidence` re-implements
> this exact 0.4 / 0.3 / 0.2 / 0.1 blend in Python and writes `matches.confidence_breakdown`
> during `HARMONIZE_WARD`. `ConfidenceService` here is the API-side copy for any on-demand
> recompute (e.g. after an analyst approves schema mappings). Keep the two weight sets in sync.

### B.8 — `drone` module (roadmap stub)

```ts
// drone/drone.controller.ts
@Controller('drone')
export class DroneController {
  constructor(@Inject(PG) private pg: Pool, private queue: Queue) {}

  @Post('flagged-tile')
  @Roles('official')
  async ingestFlaggedTile(@Body() dto: FlaggedTileDto) {
    const src = await one(this.pg, `
      INSERT INTO data_sources (type, ward_id, r2_key, crs, captured_at, status)
      VALUES ('drone_imagery', $1, $2, 'EPSG:4326', $3, 'processing') RETURNING id`,
      [dto.wardId, dto.r2Key, dto.capturedAt ?? null]);
    await this.pg.query(`
      INSERT INTO drone_tiles (ward_id, source_id, bbox, confidence, r2_key, captured_at, buffered)
      VALUES ($1,$2, ST_GeomFromGeoJSON($3), $4, $5, $6, $7)`,
      [dto.wardId, src.id, JSON.stringify(dto.bbox), dto.confidence, dto.r2Key, dto.capturedAt ?? null,
       dto.confidence < 50]);
    const jobId = await this.queue.enqueue('ingest',
      { jobType: 'NORMALIZE_SOURCE', sourceId: src.id, r2Key: dto.r2Key, type: 'drone_imagery' });
    return { status: 'processing', sourceId: src.id, jobId };
  }

  @Get('tiles')
  tiles(@Query('wardId') wardId?: string, @Query('minConfidence') minConfidence = '0') {
    const where: string[] = ['confidence >= $1']; const params: unknown[] = [Number(minConfidence)];
    if (wardId) { params.push(wardId); where.push(`ward_id = $${params.length}`); }
    return q(this.pg, `SELECT id, ward_id, confidence, r2_key, ST_AsGeoJSON(bbox)::json AS bbox,
                              captured_at, buffered
                       FROM drone_tiles WHERE ${where.join(' AND ')} ORDER BY confidence DESC`, params);
  }
}
```

```ts
// drone/dto.ts
export class FlaggedTileDto {
  @IsString() wardId!: string;
  @IsString() r2Key!: string;
  @IsNumber() @Min(0) @Max(100) confidence!: number;
  @IsObject() bbox!: object;                       // GeoJSON Polygon
  @IsOptional() @IsDateString() capturedAt?: string;
}
```

> B.8 stays a documented roadmap slide: INT8-quantized on-device footprint model → only flagged
> tiles + metadata upload first; low-confidence tiles are buffered on the device (`buffered=true`),
> not discarded. Not required for the v1 demo.

### B.10 — `harmonized` module (golden record + cadastre export)

The deliverable PS 26013 actually asks for: a single canonical parcel per matched cluster, plus an
export of the integrated cadastre for inter-departmental exchange. `matches` + `conflicts` are
intermediate; `harmonized_parcels` is the product. Batch assembly is done by the worker
(`ASSEMBLE_WARD`, §11); this module enqueues it, serves the result, and does the (synchronous)
GeoJSON export — GeoPackage is offloaded to the worker.

```ts
// harmonized/harmonized.controller.ts
@Controller('harmonized')
export class HarmonizedController {
  constructor(private readonly svc: HarmonizedService, @Inject(PG) private pg: Pool) {}

  @Post('assemble')
  @Roles('admin', 'analyst')
  @HttpCode(202)
  async assemble(@Query('wardId') wardId?: string) {
    const wards = wardId ? [wardId] : (await q(this.pg, `SELECT id FROM wards`)).map((r: any) => r.id);
    const jobs = await Promise.all(wards.map(w => this.svc.enqueueAssemble(w)));
    return { status: 'processing', jobs };
  }

  @Get()
  list(@Query('wardId') wardId?: string, @Query('minConfidence') minConfidence = '0') {
    return this.svc.list(wardId, Number(minConfidence));
  }

  // static routes before ':id'
  @Get('exports')
  @Roles('official', 'admin')
  listExports(@Query('wardId') wardId: string) { return this.svc.listExports(wardId); }

  @Get('export')
  @Roles('official', 'admin')
  async export(@Query('wardId') wardId: string, @Query('format') format = 'geojson', @Res({ passthrough: true }) res: any) {
    if (!wardId) throw new BadRequestException('wardId is required');
    if (format === 'gpkg') { res.status(202); return this.svc.enqueueGpkgExport(wardId); }
    return this.svc.exportGeojson(wardId);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.svc.detail(id); }
}
```

```ts
// harmonized/harmonized.service.ts
@Injectable()
export class HarmonizedService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  enqueueAssemble(wardId: string) {
    return this.queue.enqueue('ingest', { jobType: 'ASSEMBLE_WARD', wardId });
  }

  list(wardId: string | undefined, minConfidence: number) {
    const where = ['COALESCE(confidence,0) >= $1']; const params: unknown[] = [minConfidence / 100 || 0];
    if (wardId) { params.push(wardId); where.push(`ward_id = $${params.length}`); }
    return q(this.pg, `
      SELECT id, ward_id, geom_source_type, attributes, confidence, conflict_count,
             array_length(member_feature_ids, 1) AS member_count, assembled_at
      FROM harmonized_parcels WHERE ${where.join(' AND ')} ORDER BY confidence DESC NULLS LAST`, params);
  }

  async detail(id: string) {
    const row = await one(this.pg, `
      SELECT h.*, ST_AsGeoJSON(h.geom)::json AS geometry FROM harmonized_parcels h WHERE h.id = $1`, [id]);
    if (!row) throw new NotFoundException('Harmonized parcel not found');
    return row;
  }

  // synchronous GeoJSON build → R2 → presigned URL (same pattern as ExportService.exportCsv)
  async exportGeojson(wardId: string) {
    const rows = await q(this.pg, `
      SELECT id, ST_AsGeoJSON(geom)::json AS geometry, attributes, attribute_provenance,
             confidence, conflict_count
      FROM harmonized_parcels WHERE ward_id = $1`, [wardId]);
    if (!rows.length) throw new BadRequestException('No harmonized parcels — run POST /api/harmonized/assemble first');
    const fc = { type: 'FeatureCollection',
      features: rows.map(r => ({ type: 'Feature', id: r.id, geometry: r.geometry,
        properties: { ...r.attributes, _provenance: r.attribute_provenance,
                      _confidence: r.confidence, _conflict_count: r.conflict_count } })) };
    const key = `exports/harmonized/${wardId}_${new Date().toISOString().replace(/[:.]/g,'').slice(0,15)}.geojson`;
    await this.r2.putObject(key, JSON.stringify(fc), 'application/geo+json');
    await this.pg.query(
      `INSERT INTO harmonized_exports (ward_id, format, r2_key, feature_count, status)
       VALUES ($1,'geojson',$2,$3,'ready')`, [wardId, key, rows.length]);
    return { presigned_url: await this.r2.presignGet(key), feature_count: rows.length, format: 'geojson' };
  }

  async enqueueGpkgExport(wardId: string) {
    const row = await one(this.pg,
      `INSERT INTO harmonized_exports (ward_id, format, status) VALUES ($1,'gpkg','processing') RETURNING id`,
      [wardId]);
    const jobId = await this.queue.enqueue('ingest',
      { jobType: 'EXPORT_HARMONIZED', wardId, exportId: row.id, format: 'gpkg' });
    return { status: 'processing', exportId: row.id, jobId };
  }

  async listExports(wardId: string) {
    const rows = await q(this.pg, `
      SELECT id, format, status, feature_count, error, created_at, r2_key
      FROM harmonized_exports WHERE ward_id = $1 ORDER BY created_at DESC`, [wardId]);
    return Promise.all(rows.map(async r => ({
      ...r, r2_key: undefined,
      download_url: r.status === 'ready' && r.r2_key ? await this.r2.presignGet(r.r2_key) : null,
    })));
  }
}
```

`harmonized` is query-only — no DTO file; the two query params are validated inline in the
controller (`wardId` required, `format` in `geojson|gpkg`).

---

## 10. Frontend (Next.js) additions

### `frontend/middleware.ts` — Supabase Auth session gate

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/officer', '/supervisor', '/commissioner', '/admin', '/integration'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => req.cookies.get(n)?.value,
                 set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
                 remove: (n, o) => res.cookies.set({ name: n, value: '', ...o }) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && PROTECTED.some(p => req.nextUrl.pathname.startsWith(p)))
    return NextResponse.redirect(new URL('/login', req.url));
  return res;
}
export const config = { matcher: ['/officer/:path*','/supervisor/:path*','/commissioner/:path*','/admin/:path*','/integration/:path*'] };
```

### `frontend/lib/api.ts` — typed fetch wrapper (replaces the axios `client.js`)

```ts
import { createBrowserClient } from '@supabase/ssr';

const base = process.env.NEXT_PUBLIC_API_URL!;
const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json',
               ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
               ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
  return res.json();
}
```

### `frontend/lib/server-api.ts` — authenticated fetch for Server Components

**Every non-public API route requires a Supabase JWT** (global `AuthGuard`, §7). A bare
`fetch(`${process.env.API_URL}${path}`)` from a Server Component carries no token and gets a
`401`, so all dashboard pages must fetch through this helper — it reads the caller's Supabase
session from the request cookies and forwards `Authorization: Bearer …`. (Marking the read
routes `@Public()` was rejected: PS 26013 wants access-controlled inter-departmental exchange,
and `ward_scope` scoping in `AuthGuard` depends on the JWT.)

```ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function serverApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } });
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json',
               ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
               ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
  return res.json() as Promise<T>;
}
```

### `frontend/app/integration/page.tsx` — server component

```tsx
import { serverApi } from '@/lib/server-api';
import { IntegrationView } from './IntegrationView';

export default async function IntegrationPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '4';
  const [conflicts, matches, features] = await Promise.all([
    serverApi(`/api/conflicts?wardId=${ward}&status=pending`),
    serverApi(`/api/harmonization/matches?wardId=${ward}&minScore=50`),
    serverApi(`/api/wards/${ward}/geojson`),
  ]);
  return <IntegrationView ward={ward} conflicts={conflicts} matches={matches} features={features} />;
}
```

### `frontend/app/integration/IntegrationView.tsx` — client component

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { MapCanvas } from '@/components/MapCanvas';
import { ConflictPanel } from '@/components/ConflictPanel';
import { LayerToggles } from '@/components/LayerToggles';

const confidenceColor = (score: number) =>
  score >= 80 ? '#1a9850' : score >= 60 ? '#fee08b' : score >= 40 ? '#fdae61' : '#d73027';

export function IntegrationView({ ward, conflicts, matches, features }: Props) {
  const [layers, setLayers] = useState({ cadastral: true, ori: false, utility: true, building_footprint: true });
  const [list, setList] = useState(conflicts);

  async function resolve(id: string, status: string) {
    await api(`/api/conflicts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status }) });
    setList((cs: any[]) => cs.filter(c => c.id !== id));
  }

  return (
    <div className="integration-grid">
      <aside>
        <LayerToggles value={layers} onChange={setLayers} />
        <ConflictPanel items={list} onResolve={resolve} />
      </aside>
      <MapCanvas
        wardId={ward}
        featureCollection={features}
        layers={layers}
        matches={matches}
        colorForMatch={(m: any) => confidenceColor(Number(m.match_score))}
      />
    </div>
  );
}
```

### `frontend/components/MapCanvas.tsx` — MapLibre GL (no API key needed)

```tsx
'use client';
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapCanvas({ featureCollection, matches, colorForMatch }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json',
      center: [83.30, 17.72], zoom: 12,
    });
    map.on('load', () => {
      map.addSource('features', { type: 'geojson', data: featureCollection });
      map.addLayer({ id: 'poly', type: 'fill', source: 'features',
        paint: { 'fill-color': '#3388ff', 'fill-opacity': 0.25, 'fill-outline-color': '#1a1a1a' } });
      map.addSource('matches', { type: 'geojson',
        data: { type: 'FeatureCollection', features: matches.map((m: any) => ({
          type: 'Feature', geometry: m.feature_a_geom,
          properties: { color: colorForMatch(m), score: m.match_score } })) } });
      map.addLayer({ id: 'match-fill', type: 'fill', source: 'matches',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 } });
    });
    return () => map.remove();
  }, [featureCollection, matches]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
```

### `frontend/components/ConfidenceCard.tsx` — 4-bar breakdown (B.7)

```tsx
const LABELS: Record<string, string> = {
  geometric_match_score: 'Geometric match',
  attribute_match_score: 'Attribute match',
  source_reliability_weight: 'Source reliability',
  recency_score: 'Recency',
};

export function ConfidenceCard({ score, breakdown }: { score: number; breakdown: Record<string, number> }) {
  return (
    <div className="confidence-card">
      <div className="score">{score}<span>/100</span></div>
      {Object.entries(breakdown).map(([k, v]) => (
        <div key={k} className="bar-row">
          <span>{LABELS[k] ?? k}</span>
          <div className="bar"><div style={{ width: `${Math.round(v * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
```

### `frontend/lib/supabase.ts` + `frontend/app/layout.tsx`

```ts
// lib/supabase.ts — browser client (anon key only; never the service-role key)
import { createBrowserClient } from '@supabase/ssr';
export const supabaseBrowser = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```

```tsx
// app/layout.tsx
export const metadata = { title: 'GVMC · NAKSHA', description: 'Land-record integration & harmonization' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```

### `frontend/components/ConflictPanel.tsx` · `LayerToggles.tsx` · `ChatPanel.tsx`

```tsx
// components/ConflictPanel.tsx
export function ConflictPanel({ items, onResolve }:
  { items: any[]; onResolve: (id: string, status: string) => void }) {
  if (!items?.length) return <p className="muted">No open conflicts.</p>;
  return (
    <ul className="conflict-panel">
      {items.map(c => (
        <li key={c.id} className={`sev-${c.severity}`}>
          <b>{c.conflict_type}</b> · {c.severity}
          <p>{c.suggested_resolution}</p>
          <div className="row">
            <button onClick={() => onResolve(c.id, 'resolved')}>Resolve</button>
            <button onClick={() => onResolve(c.id, 'needs_review')}>Needs review</button>
            <button onClick={() => onResolve(c.id, 'rejected')}>Reject</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// components/LayerToggles.tsx
type Layers = Record<string, boolean>;
export function LayerToggles({ value, onChange }: { value: Layers; onChange: (v: Layers) => void }) {
  return (
    <fieldset className="layer-toggles">
      <legend>Layers</legend>
      {Object.keys(value).map(k => (
        <label key={k}>
          <input type="checkbox" checked={value[k]}
                 onChange={e => onChange({ ...value, [k]: e.target.checked })} />
          {k.replace(/_/g, ' ')}
        </label>
      ))}
    </fieldset>
  );
}
```

```tsx
// components/ChatPanel.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export function ChatPanel() {
  const [log, setLog] = useState<{ role: 'you' | 'ai'; text: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = msg.trim();
    if (!q || busy) return;
    setLog(l => [...l, { role: 'you', text: q }]); setMsg(''); setBusy(true);
    try {
      const { response } = await api<{ response: string }>('/api/chat',
        { method: 'POST', body: JSON.stringify({ message: q }) });
      setLog(l => [...l, { role: 'ai', text: response }]);
    } catch (e: any) {
      setLog(l => [...l, { role: 'ai', text: `error: ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="chat-panel">
      <div className="chat-log">
        {log.map((m, i) => <p key={i} className={m.role}><b>{m.role}:</b> {m.text}</p>)}
      </div>
      <div className="row">
        <input value={msg} onChange={e => setMsg(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about a ward…" />
        <button onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  );
}
```

### `frontend/app/(dashboard)/{officer,supervisor,commissioner,admin}/page.tsx`

Thin server components over the ported API — cards + a table + the shared map. Not a port of
the old React SPA. `officer` is shown; the other three swap the fetch + heading:

```tsx
// app/(dashboard)/officer/page.tsx
import { serverApi } from '@/lib/server-api';   // forwards the Supabase JWT — see §10
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';

export default async function OfficerPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '1';
  const [stats, unassessed, features] = await Promise.all([
    serverApi(`/api/stats?ward_id=${ward}`),
    serverApi(`/api/wards/${ward}/unassessed?status=pending`),
    serverApi(`/api/wards/${ward}/geojson`),
  ]);
  return (
    <main className="dashboard">
      <h1>Officer · Ward {ward}</h1>
      <section className="cards">
        <div><b>{stats.total_detections}</b><span>detections</span></div>
        <div><b>{stats.pending_verification}</b><span>pending</span></div>
        <div><b>{stats.new_builds}</b><span>new builds</span></div>
        <div><b>Rs {Math.round((stats.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <div className="split">
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Area</th><th>Conf.</th><th>Status</th></tr></thead>
          <tbody>
            {unassessed.map((p: any) => (
              <tr key={p.id}>
                <td>{p.id.slice(0, 8)}</td><td>{p.detection_type}</td>
                <td>{p.area_sqm}</td><td>{Math.round((p.confidence ?? 0) * 100)}%</td><td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <MapCanvas wardId={ward} featureCollection={features} matches={[]} colorForMatch={() => '#3388ff'} />
      </div>
      <ChatPanel />
    </main>
  );
}
```

- **`supervisor`** → `serverApi('/api/tickets?status=open')` + `PATCH /api/tickets/:id/review` buttons.
- **`commissioner`** → `serverApi('/api/stats/all-wards')` + `serverApi('/api/brief')`, render the per-ward table + brief text.
- **`admin`** → `serverApi('/api/stats')` + a source-type `<select>` + file picker that calls
  `POST /api/sources/upload` then PUTs the file to the returned R2 URL, `POST /api/admin/refresh`,
  and (B.10) `POST /api/harmonized/assemble` + a link to `GET /api/harmonized/export?wardId=…`.

All four pages fetch through `serverApi` (§10) — never a bare `fetch` — so the request carries the
signed-in user's JWT; a bare `fetch` to a non-public route returns `401`.

**Other frontend changes:** all "property tax assessment" copy → "cadastral / land-record
verification". Existing Redux Toolkit slices can stay for client-side state — only data
fetching moves to `lib/api.ts` / server components.

---

## 11. Python worker — full source

### `worker/requirements.txt`

```text
redis==5.0.8
psycopg2-binary==2.9.9
boto3==1.35.0
pyproj==3.6.1
shapely==2.0.6
rasterio==1.3.11
fiona==1.10.1
pyshp==2.3.1
gpxpy==1.6.2
pytesseract==0.3.13
pdf2image==1.17.0
opencv-python-headless==4.10.0.84
numpy==2.1.1
groq==0.11.0
```

System packages (Dockerfile): `tesseract-ocr gdal-bin libgdal-dev poppler-utils`.

### `worker/src/main.py` — the consumer loop

```python
import json, os, time, traceback
import redis
from ingest.adapters import normalize_source
from ocr.digitize import digitize
from harmonize.match import match_ward
from harmonize.conflicts import detect_conflicts
from harmonize.schema_map import run_schema_map
from harmonize.assemble import assemble_ward, export_harmonized

HANDLERS = {
    "NORMALIZE_SOURCE": normalize_source,
    "DIGITIZE_SOURCE":  digitize,
    "SCHEMA_MAP":       run_schema_map,
    "HARMONIZE_WARD":   match_ward,
    "DETECT_CONFLICTS": detect_conflicts,
    "ASSEMBLE_WARD":    assemble_ward,       # B.10 golden record
    "EXPORT_HARMONIZED": export_harmonized,  # B.10 GeoPackage export
}

# None of these modules construct a Groq client at import time — schema_map.py and assemble.py
# read GROQ_API_KEY lazily and fall back to deterministic behaviour when it is unset, so the
# worker starts with only DATABASE_URL / REDIS_URL / R2_* set.

r = redis.from_url(os.environ["REDIS_URL"])
QUEUE, DEAD = "queue:ingest", "queue:ingest:dead"

def run():
    print("[worker] up, waiting on", QUEUE)
    while True:
        item = r.brpop(QUEUE, timeout=5)
        if not item:
            continue
        job = json.loads(item[1])
        handler = HANDLERS.get(job.get("jobType"))
        if not handler:
            print("[worker] unknown jobType", job.get("jobType")); continue
        try:
            handler(job)
            print("[worker] done", job["jobType"], job.get("jobId"))
        except Exception as e:                                   # noqa: BLE001
            traceback.print_exc()
            job["error"], job["attempts"] = str(e), job.get("attempts", 0) + 1
            (r.lpush(QUEUE, json.dumps(job)) if job["attempts"] < 3
             else r.lpush(DEAD, json.dumps(job)))

if __name__ == "__main__":
    run()
```

### `worker/src/db.py`

```python
import os, json
from contextlib import contextmanager
import psycopg2, psycopg2.extras

@contextmanager
def cursor():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with conn, conn.cursor() as cur:
            yield cur
    finally:
        conn.close()

def get_data_source(source_id):
    with cursor() as cur:
        cur.execute("SELECT * FROM data_sources WHERE id = %s", (source_id,))
        return cur.fetchone()

def insert_source_feature(source_id, geom_geojson, properties, was_invalid):
    with cursor() as cur:
        cur.execute(
            """INSERT INTO source_features (source_id, geom, properties, was_invalid)
               VALUES (%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s)""",
            (source_id, json.dumps(geom_geojson), json.dumps(properties), was_invalid))

def set_status(source_id, status, error=None):
    with cursor() as cur:
        cur.execute("UPDATE data_sources SET status=%s, error=%s WHERE id=%s", (status, error, source_id))

def update_source_metadata(source_id, patch: dict):
    with cursor() as cur:
        cur.execute("UPDATE data_sources SET metadata = metadata || %s::jsonb WHERE id=%s",
                    (json.dumps(patch), source_id))
```

### `worker/src/r2.py`

```python
import os, boto3, tempfile
_s3 = boto3.client(
    "s3", region_name="auto",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
)
BUCKET = os.environ["R2_BUCKET_NAME"]

def download(key: str) -> str:
    fd, path = tempfile.mkstemp(suffix="_" + key.split("/")[-1])
    os.close(fd)
    _s3.download_file(BUCKET, key, path)
    return path

def upload(path: str, key: str, content_type: str = "application/octet-stream") -> str:
    _s3.upload_file(path, BUCKET, key, ExtraArgs={"ContentType": content_type})
    return key
```

### `worker/src/spatial/geo_transform.py` — B.2

```python
import json
from pyproj import Transformer, CRS
from shapely.geometry import shape, mapping
from shapely.ops import transform as shp_transform
import rasterio, fiona

def reproject_to_wgs84(geom, source_crs: str):
    if CRS.from_user_input(source_crs).to_epsg() == 4326:
        return geom
    t = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    return shp_transform(t.transform, geom)

def to_utm(geom, ward_centroid):
    # Unused today — matching runs in `geography` so metric ops need no projected CRS.
    # Retained for the §16 roadmap items (parcel-fabric topology, DSM/DTM sampling) that
    # want a local metre-based CRS.
    zone = int((ward_centroid.x + 180) // 6) + 1
    epsg = 32600 + zone                              # northern hemisphere
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return shp_transform(t.transform, geom)

def detect_crs(path: str) -> str | None:
    try:
        if path.lower().endswith((".tif", ".tiff")):
            with rasterio.open(path) as ds:
                return str(ds.crs) if ds.crs else None
        if path.lower().endswith((".geojson", ".json")):
            # RFC 7946: GeoJSON with no `crs` member is WGS84 lon/lat.
            gj = json.load(open(path))
            named = gj.get("crs", {}).get("properties", {}).get("name")
            return named or "EPSG:4326"
        with fiona.open(path) as src:
            crs = src.crs
            init = crs.get("init") if hasattr(crs, "get") else None
            return init or (src.crs_wkt and CRS.from_wkt(src.crs_wkt).to_string()) or None
    except Exception:
        return None
```

### `worker/src/spatial/topology.py` — B.4

```python
from shapely.validation import make_valid

def validate_and_fix(geom):
    if geom.is_valid:
        return geom, False
    fixed = make_valid(geom)
    if not fixed.is_valid:
        fixed = fixed.buffer(0)
    return fixed, True
```

### `worker/src/ingest/adapters.py` — B.1 adapter registry

```python
import json
import rasterio, fiona, shapefile, gpxpy
from shapely.geometry import shape, mapping, box, Point
from db import get_data_source, insert_source_feature, set_status, update_source_metadata
from r2 import download
from spatial.geo_transform import reproject_to_wgs84, detect_crs
from spatial.topology import validate_and_fix

def geotiff_adapter(path):
    with rasterio.open(path) as ds:
        b = ds.bounds
        yield {"geometry": box(b.left, b.bottom, b.right, b.top),
               "properties": {"bands": ds.count, "res": ds.res, "dtype": ds.dtypes[0]}}, str(ds.crs)

def vector_adapter(path):
    if path.lower().endswith(".shp"):
        r = shapefile.Reader(path)
        for sr in r.shapeRecords():
            yield {"geometry": shape(sr.shape.__geo_interface__),
                   "properties": dict(zip([f[0] for f in r.fields[1:]], sr.record))}, None
    else:                                           # GeoJSON
        gj = json.load(open(path))
        for feat in gj.get("features", [gj]):
            yield {"geometry": shape(feat["geometry"]), "properties": feat.get("properties", {})}, \
                  (gj.get("crs", {}).get("properties", {}).get("name"))

def point_adapter(path):
    if path.lower().endswith(".gpx"):
        g = gpxpy.parse(open(path))
        for wpt in g.waypoints:
            yield {"geometry": Point(wpt.longitude, wpt.latitude),
                   "properties": {"name": wpt.name, "ele": wpt.elevation}}, "EPSG:4326"
    else:                                           # CSV: lon,lat,<attrs>
        import csv
        for row in csv.DictReader(open(path)):
            yield {"geometry": Point(float(row["lon"]), float(row["lat"])),
                   "properties": {k: v for k, v in row.items() if k not in ("lon", "lat")}}, "EPSG:4326"

ADAPTERS = {
    "drone_imagery": geotiff_adapter, "ori": geotiff_adapter, "dsm_dtm": geotiff_adapter,
    "cadastral": vector_adapter, "revenue": vector_adapter, "municipal_gis": vector_adapter,
    "utility": vector_adapter, "building_footprint": vector_adapter,
    "ground_truth": point_adapter, "gnss_cors": point_adapter,
}

def normalize_source(job):
    src = get_data_source(job["sourceId"])
    path = download(job["r2Key"])
    try:
        adapter = ADAPTERS[job["type"]]
        count = 0
        field_names: set[str] = set()
        for rec, embedded_crs in adapter(path):
            crs = src["crs"] or embedded_crs or detect_crs(path)
            if not crs:
                raise ValueError("no CRS: declare one on upload")   # only .shp / .tif without an embedded CRS
            geom = reproject_to_wgs84(rec["geometry"], crs)          # B.2
            geom, was_invalid = validate_and_fix(geom)               # B.4
            props = rec["properties"] or {}
            field_names.update(props.keys())
            insert_source_feature(src["id"], mapping(geom), props, was_invalid)
            count += 1
        # B.5 needs the attribute schema of *structured* sources — record it so schema_map.py
        # has real "Dataset B fields" to map an OCR'd document against.
        update_source_metadata(src["id"], {"fields": sorted(field_names), "feature_count": count})
        set_status(src["id"], "ready")
        print(f"[normalize] {src['id']} -> {count} features, {len(field_names)} fields")
    except Exception as e:                                           # noqa: BLE001
        set_status(src["id"], "failed", str(e)); raise
```

### `worker/src/ocr/digitize.py` — B.9 (Tesseract)

```python
import os, re, json
import numpy as np, cv2, pytesseract, redis
from pdf2image import convert_from_path
from db import get_data_source, set_status, update_source_metadata, cursor
from r2 import download

_r = redis.from_url(os.environ["REDIS_URL"])

FIELD_PATTERNS = {
    "khata_no":   r"(?:khata|khatha)\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Z0-9/\-]+)",
    "owner_name": r"(?:owner|name)\s*[:\-]?\s*([A-Z][A-Za-z .]{3,})",
    "survey_no":  r"(?:survey|s\.?y\.?)\s*(?:no\.?)?\s*[:\-]?\s*([0-9/\-A-Z]+)",
    "area":       r"(?:area|extent)\s*[:\-]?\s*([0-9,.]+)\s*(sq\.?\s?m|acres?|cents?)",
}

def _preprocess(pil_img):
    g = cv2.cvtColor(np.array(pil_img), cv2.COLOR_BGR2GRAY)
    g = cv2.fastNlMeansDenoising(g, h=10)
    return cv2.threshold(g, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]

def digitize(job):
    src = get_data_source(job["sourceId"])
    path = download(src["r2_key"])
    pages = convert_from_path(path) if path.lower().endswith(".pdf") else [cv2.imread(path)]

    extracted, confidences = {}, {}
    for page_no, img in enumerate(pages, 1):
        data = pytesseract.image_to_data(_preprocess(img),
                                         output_type=pytesseract.Output.DICT, config="--psm 6")
        text = " ".join(w for w in data["text"] if w.strip())
        confs = [int(c) for c in data["conf"] if c not in ("-1", -1)]
        for field, pat in FIELD_PATTERNS.items():
            if field in extracted:
                continue
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                extracted[field] = m.group(1).strip()
                confidences[field] = round(sum(confs) / len(confs), 1) if confs else 0.0
                with cursor() as cur:
                    cur.execute(
                        """INSERT INTO ocr_results (source_id, field, value, confidence, page)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (src["id"], field, extracted[field], confidences[field], page_no))

    update_source_metadata(src["id"], {"ocr": extracted, "ocr_confidence": confidences})
    set_status(src["id"], "ready")

    # feed B.5: schema-map the freshly OCR'd fields against the newest structured
    # (cadastral / municipal_gis / revenue) source for the same ward.
    with cursor() as cur:
        cur.execute(
            """SELECT id FROM data_sources
               WHERE ward_id = %s AND status = 'ready' AND id <> %s
                 AND type IN ('cadastral','municipal_gis','revenue','building_footprint')
               ORDER BY created_at DESC LIMIT 1""",
            (src["ward_id"], src["id"]))
        row = cur.fetchone()
    if row:
        _r.lpush("queue:ingest", json.dumps({
            "jobType": "SCHEMA_MAP", "sourceAId": src["id"], "sourceBId": row["id"],
        }))
        print(f"[digitize] {src['id']} -> enqueued SCHEMA_MAP against {row['id']}")
    else:
        print(f"[digitize] {src['id']} ready; no structured source in ward {src['ward_id']} to map against yet")
```

### `worker/src/harmonize/match.py` — B.3 batch + B.7

```python
import json
import redis, os
from db import cursor

_r = redis.from_url(os.environ["REDIS_URL"])

MATCH_SQL = open(os.path.join(os.path.dirname(__file__), "match_ward.sql")).read()  # the WITH pairs ... query

SOURCE_RELIABILITY = {
    "gnss_cors": 1.0, "cadastral": 0.95, "ground_truth": 0.9, "building_footprint": 0.8,
    "municipal_gis": 0.8, "utility": 0.75, "ori": 0.7, "dsm_dtm": 0.7, "revenue": 0.65, "drone_imagery": 0.6,
}

def _confidence(match_score, a_type, b_type, captured_at):
    geometric  = match_score / 100
    attribute  = 0.5                                        # refined once schema_mappings exist
    reliability = (SOURCE_RELIABILITY[a_type] + SOURCE_RELIABILITY[b_type]) / 2
    recency    = 1.0                                        # decay applied when captured_at known
    score = round(100 * (0.4*geometric + 0.3*attribute + 0.2*reliability + 0.1*recency))
    return score, {"geometric_match_score": round(geometric, 4),
                   "attribute_match_score": round(attribute, 4),
                   "source_reliability_weight": round(reliability, 4),
                   "recency_score": round(recency, 4)}

def match_ward(job):
    ward = job["wardId"]
    with cursor() as cur:
        cur.execute(MATCH_SQL, {"ward": ward})
        pairs = cur.fetchall()
        for p in pairs:
            score, breakdown = _confidence(float(p["match_score"]), p["a_type"], p["b_type"], None)
            cur.execute(
                """INSERT INTO matches (ward_id, feature_a_id, feature_b_id, source_a_type, source_b_type,
                                        geometry_iou, centroid_distance_m, match_score, confidence_breakdown)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (feature_a_id, feature_b_id) DO UPDATE SET
                       match_score = EXCLUDED.match_score,
                       confidence_breakdown = EXCLUDED.confidence_breakdown,
                       matched_at = now()""",
                (ward, p["a_id"], p["b_id"], p["a_type"], p["b_type"],
                 p["iou"], p["dist_m"], p["match_score"], json.dumps(breakdown)))
    _r.lpush("queue:ingest", json.dumps({"jobType": "DETECT_CONFLICTS", "wardId": ward}))
    print(f"[match] ward {ward}: {len(pairs)} matches")
```

### `worker/src/harmonize/conflicts.py` — B.6 generation

```python
import json, os
import redis
from db import cursor

_r = redis.from_url(os.environ["REDIS_URL"])

def _severity(match_score, attr_disagree_ratio, hard_geometry_disagreement):
    if match_score < 40 or hard_geometry_disagreement:
        return "critical"
    if match_score < 70:
        return "high"
    if match_score < 90 or attr_disagree_ratio > 0.34:
        return "medium"
    return "low"

def detect_conflicts(job):
    ward = job["wardId"]
    with cursor() as cur:
        cur.execute("""
            SELECT m.id, m.match_score, m.geometry_iou,
                   fa.properties AS a_props, fb.properties AS b_props
            FROM matches m
            JOIN source_features fa ON fa.id = m.feature_a_id
            JOIN source_features fb ON fb.id = m.feature_b_id
            WHERE m.ward_id = %s
              AND NOT EXISTS (SELECT 1 FROM conflicts c WHERE c.match_id = m.id)""", (ward,))
        rows = cur.fetchall()
        made = 0
        for r in rows:
            a, b = r["a_props"] or {}, r["b_props"] or {}
            shared = set(a) & set(b)
            disagree = [k for k in shared if str(a[k]).strip().lower() != str(b[k]).strip().lower()]
            geom_bad = (r["geometry_iou"] is not None and float(r["geometry_iou"]) < 0.30)
            if not disagree and not geom_bad:
                continue
            ctype = "both" if (disagree and geom_bad) else ("attribute_mismatch" if disagree else "geometry_mismatch")
            sev = _severity(float(r["match_score"]), len(disagree) / max(len(shared), 1), geom_bad)
            cur.execute("""
                INSERT INTO conflicts (ward_id, match_id, conflict_type, severity, detail, suggested_resolution)
                VALUES (%s,%s,%s,%s,%s,%s)""",
                (ward, r["id"], ctype, sev,
                 json.dumps({"disagreeing_fields": disagree, "iou": r["geometry_iou"]}),
                 f"Reconcile {', '.join(disagree) or 'geometry'}; trust the higher-reliability source."))
            made += 1
    # B.10: (re)assemble the ward's golden record now that matches + conflicts are known.
    _r.lpush("queue:ingest", json.dumps({"jobType": "ASSEMBLE_WARD", "wardId": ward}))
    print(f"[conflicts] ward {ward}: {made} created; enqueued ASSEMBLE_WARD")
```

### `worker/src/harmonize/schema_map.py` — B.5 (worker side)

No Groq client at import time — it is built lazily and only when `GROQ_API_KEY` is set. With no
key (or on any Groq error) it falls back to deterministic normalized column-name matching, so the
worker runs, and `run_schema_map` still writes `schema_mappings`.

```python
import os, json, re
from db import cursor

def _fields(meta: dict) -> list[str]:
    """OCR'd docs expose their fields under metadata.ocr; structured sources under
    metadata.fields (written by adapters.normalize_source)."""
    meta = meta or {}
    if isinstance(meta.get("ocr"), dict) and meta["ocr"]:
        return list(meta["ocr"].keys())
    if isinstance(meta.get("fields"), list):
        return list(meta["fields"])
    return [k for k in meta.keys() if k not in ("ocr", "ocr_confidence", "feature_count")]

_norm = lambda s: re.sub(r"[^a-z0-9]", "", str(s).lower())

def _fallback_map(a_fields, b_fields):
    bn = {_norm(f): f for f in b_fields}
    out = []
    for fa in a_fields:
        fb = bn.get(_norm(fa))
        if fb:
            out.append({"field_a": fa, "field_b": fb, "confidence": 0.5,
                        "rationale": "normalized column-name match (LLM unavailable)"})
    return out

def _llm_map(a_fields, b_fields):
    from groq import Groq
    groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    prompt = (
        "You are a data-integration assistant for the NAKSHA land-records programme.\n"
        "Given two datasets' field names, propose field-to-field mappings as a JSON array of "
        '{"field_a","field_b","confidence"(0-1),"rationale"}.\n'
        f"Dataset A fields: {a_fields}\n"
        f"Dataset B fields: {b_fields}\n"
        "Return a JSON array only, no prose.")
    raw = groq.chat.completions.create(
        model="llama-3.3-70b-versatile", temperature=0.2, max_tokens=700,
        messages=[{"role": "user", "content": prompt}]).choices[0].message.content
    return json.loads(raw[raw.index("["): raw.rindex("]") + 1])

def run_schema_map(job):
    a_id, b_id = job["sourceAId"], job["sourceBId"]
    with cursor() as cur:
        cur.execute("SELECT metadata FROM data_sources WHERE id = %s", (a_id,))
        a_fields = _fields(cur.fetchone()["metadata"])
        cur.execute("SELECT metadata FROM data_sources WHERE id = %s", (b_id,))
        b_fields = _fields(cur.fetchone()["metadata"])

    try:
        mappings = _llm_map(a_fields, b_fields) if os.environ.get("GROQ_API_KEY") else _fallback_map(a_fields, b_fields)
    except Exception as e:                                          # noqa: BLE001
        print(f"[schema_map] LLM failed ({e}); using name-match fallback")
        mappings = _fallback_map(a_fields, b_fields)

    with cursor() as cur:
        for m in mappings:
            cur.execute("""INSERT INTO schema_mappings
                           (source_a_id, source_b_id, field_a, field_b, confidence, rationale)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (a_id, b_id, m["field_a"], m["field_b"], m["confidence"], m.get("rationale")))
    print(f"[schema_map] {a_id} <-> {b_id}: {len(mappings)} mappings")
```

### `worker/src/harmonize/assemble.py` — B.10 (golden record + export)

`assemble_ward` clusters the ward's `matches` into connected components (union-find over
`feature_a_id`/`feature_b_id`), then writes one `harmonized_parcels` row per cluster: geometry from
the highest-`SOURCE_RELIABILITY` polygonal member, attributes merged field-by-field (most-reliable
source wins; `schema_mappings` renames B's fields onto A's canonical names), provenance recorded,
`confidence` = mean member `match_score`, `conflict_count` = unresolved conflicts on the cluster.
A full re-assemble is idempotent: it deletes the ward's rows first.

```python
import json, tempfile
from db import cursor
from r2 import upload

SOURCE_RELIABILITY = {
    "gnss_cors": 1.0, "cadastral": 0.95, "ground_truth": 0.9, "building_footprint": 0.8,
    "municipal_gis": 0.8, "utility": 0.75, "ori": 0.7, "dsm_dtm": 0.7, "revenue": 0.65, "drone_imagery": 0.6,
}

class _UF:
    def __init__(self): self.p = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)

def assemble_ward(job):
    ward = job["wardId"]
    with cursor() as cur:
        cur.execute("""SELECT id, feature_a_id, feature_b_id, match_score FROM matches WHERE ward_id = %s""", (ward,))
        matches = cur.fetchall()
        cur.execute("""SELECT field_a, field_b FROM schema_mappings sm
                       JOIN data_sources da ON da.id = sm.source_a_id
                       WHERE da.ward_id = %s AND COALESCE(sm.approved, true)""", (ward,))
        rename = {r["field_b"]: r["field_a"] for r in cur.fetchall()}   # B's field -> A's canonical name

        uf = _UF()
        for m in matches:
            uf.union(m["feature_a_id"], m["feature_b_id"])
        clusters: dict = {}
        for m in matches:
            clusters.setdefault(uf.find(m["feature_a_id"]), {"features": set(), "matches": [], "scores": []})
            c = clusters[uf.find(m["feature_a_id"])]
            c["features"].update([m["feature_a_id"], m["feature_b_id"]])
            c["matches"].append(m["id"]); c["scores"].append(float(m["match_score"]))

        cur.execute("DELETE FROM harmonized_parcels WHERE ward_id = %s", (ward,))
        made = 0
        for c in clusters.values():
            fids = list(c["features"])
            cur.execute("""
                SELECT sf.id, ds.type, ST_GeometryType(sf.geom) AS gtype,
                       ST_AsGeoJSON(ST_Multi(sf.geom))::json AS geojson, sf.properties
                FROM source_features sf JOIN data_sources ds ON ds.id = sf.source_id
                WHERE sf.id = ANY(%s)""", (fids,))
            members = sorted(cur.fetchall(), key=lambda r: SOURCE_RELIABILITY.get(r["type"], 0.5), reverse=True)
            poly = next((r for r in members if "Polygon" in (r["gtype"] or "")), None)
            if not poly:
                continue                                             # no polygonal member -> skip (roadmap: hull/point parcels)

            attrs, prov = {}, {}
            for r in members:                                        # most-reliable first
                for k, v in (r["properties"] or {}).items():
                    key = rename.get(k, k)
                    if key not in attrs and v not in (None, ""):
                        attrs[key] = v; prov[key] = r["type"]

            cur.execute("""SELECT count(*) AS n FROM conflicts
                           WHERE match_id = ANY(%s) AND status <> 'resolved'""", (c["matches"],))
            conflict_count = cur.fetchone()["n"]
            confidence = round(sum(c["scores"]) / len(c["scores"]) / 100, 4) if c["scores"] else None

            cur.execute("""
                INSERT INTO harmonized_parcels
                  (ward_id, geom, geom_source_id, geom_source_type, attributes, attribute_provenance,
                   member_feature_ids, match_ids, confidence, conflict_count)
                VALUES (%s, ST_SetSRID(ST_GeomFromGeoJSON(%s),4326), %s, %s, %s, %s, %s, %s, %s, %s)""",
                (ward, json.dumps(poly["geojson"]), poly["id"], poly["type"],
                 json.dumps(attrs), json.dumps(prov), fids, c["matches"], confidence, conflict_count))
            made += 1
    print(f"[assemble] ward {ward}: {made} harmonized parcels")

def export_harmonized(job):
    import fiona
    ward, export_id, fmt = job["wardId"], job["exportId"], job.get("format", "gpkg")
    try:
        with cursor() as cur:
            cur.execute("""SELECT id, ST_AsGeoJSON(geom)::json AS geom, attributes, confidence
                           FROM harmonized_parcels WHERE ward_id = %s""", (ward,))
            rows = cur.fetchall()
        keys = sorted({k for r in rows for k in (r["attributes"] or {})})
        schema = {"geometry": "MultiPolygon",
                  "properties": {**{k: "str" for k in keys}, "hp_id": "str", "confidence": "float"}}
        path = tempfile.mkstemp(suffix=f"_{ward}.gpkg")[1]
        with fiona.open(path, "w", driver="GPKG", crs="EPSG:4326", schema=schema) as dst:
            for r in rows:
                dst.write({"geometry": r["geom"],
                           "properties": {**{k: str((r["attributes"] or {}).get(k, "")) for k in keys},
                                          "hp_id": str(r["id"]), "confidence": r["confidence"] or 0.0}})
        key = f"exports/harmonized/{ward}_{export_id}.gpkg"
        upload(path, key, "application/geopackage+sqlite3")
        with cursor() as cur:
            cur.execute("""UPDATE harmonized_exports SET status='ready', r2_key=%s, feature_count=%s
                           WHERE id=%s""", (key, len(rows), export_id))
        print(f"[export] ward {ward}: {len(rows)} parcels -> {key}")
    except Exception as e:                                            # noqa: BLE001
        with cursor() as cur:
            cur.execute("UPDATE harmonized_exports SET status='failed', error=%s WHERE id=%s", (str(e), export_id))
        raise
```

---

## 12. Docker, docker-compose, GitHub Actions

### `backend/Dockerfile`

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install            # use `npm ci` once package-lock.json is committed
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### `worker/Dockerfile`

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr gdal-bin libgdal-dev poppler-utils libgl1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
CMD ["python", "src/main.py"]
```

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment: { POSTGRES_DB: gvmcdb, POSTGRES_USER: gvmc, POSTGRES_PASSWORD: dev }
    ports: ["5432:5432"]
    volumes: ["./database/migrations:/docker-entrypoint-initdb.d"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  api:
    build: ./backend
    env_file: .env
    environment:
      DATABASE_URL: postgres://gvmc:dev@db:5432/gvmcdb
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]
    ports: ["3000:3000"]
  worker:
    build: ./worker
    env_file: .env
    environment:
      DATABASE_URL: postgres://gvmc:dev@db:5432/gvmcdb
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]
```

> `env_file: .env` — run `cp .env.example .env` **before** `docker compose up` (compose errors if
> the file is missing). `GROQ_API_KEY` may be left blank: the API boots and the worker starts;
> chat/explain/brief/alert/schema-map return templated fallbacks until a key is set (§7, §11).
> The `db` service auto-runs `database/migrations/*.sql` in filename order (`0001`…`0010`) on first
> init; `database/seed/*.sql` is **not** auto-run — load it manually (§15).

### `.github/workflows/deploy-backend.yml`

```yaml
name: deploy-backend
on:
  push:
    branches: [main]
    paths: ['backend/**']
jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: ./backend
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/gvmc-backend:${{ github.sha }},ghcr.io/${{ github.repository_owner }}/gvmc-backend:latest
  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    environment: production            # required-reviewer gate
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository_owner }}/gvmc-backend:latest
            docker compose -f /opt/gvmc/docker-compose.yml up -d api
```

### `.github/workflows/deploy-worker.yml`

```yaml
name: deploy-worker
on:
  push:
    branches: [main]
    paths: ['worker/**', '.github/workflows/deploy-worker.yml']
jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: ./worker
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/gvmc-worker:${{ github.sha }},ghcr.io/${{ github.repository_owner }}/gvmc-worker:latest
  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository_owner }}/gvmc-worker:latest
            docker compose -f /opt/gvmc/docker-compose.yml up -d worker
```

### `.github/workflows/deploy-frontend.yml`

```yaml
name: deploy-frontend
on:
  push:
    branches: [main]
    paths: ['frontend/**', '.github/workflows/deploy-frontend.yml']
# Skip this file entirely if you connect the repo in the Vercel dashboard
# (root directory = frontend/) — Vercel then deploys on push by itself.
# Secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - working-directory: ./frontend
        run: |
          npm i -g vercel@latest
          vercel pull --yes --environment=production --token "$VERCEL_TOKEN"
          vercel build --prod --token "$VERCEL_TOKEN"
          vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN"
```

### `.github/workflows/test.yml`

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]
jobs:
  backend:
    runs-on: ubuntu-latest
    if: ${{ hashFiles('backend/package.json') != '' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - working-directory: ./backend
        run: |
          npm install
          npm run build
          npm test
  worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: sudo apt-get update && sudo apt-get install -y --no-install-recommends gdal-bin libgdal-dev tesseract-ocr poppler-utils libgl1
      - working-directory: ./worker
        run: |
          pip install --no-cache-dir -r requirements.txt pytest
          pytest -q || [ $? -eq 5 ]   # exit 5 = no tests collected yet
```

### Project config & manifest files

```jsonc
// backend/package.json
{
  "name": "gvmc-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "test": "jest --passWithNoTests"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.645.0",
    "@aws-sdk/s3-request-presigner": "^3.645.0",
    "@nestjs/common": "^10.4.1",
    "@nestjs/core": "^10.4.1",
    "@nestjs/platform-express": "^10.4.1",
    "@supabase/supabase-js": "^2.45.4",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "groq-sdk": "^0.7.0",
    "nestjs-pino": "^4.1.0",
    "pg": "^8.12.0",
    "pino-http": "^10.3.0",
    "reflect-metadata": "^0.2.2",
    "redis": "^4.7.0",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/schematics": "^10.1.4",
    "@nestjs/testing": "^10.4.1",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.13",
    "@types/node": "^20.16.5",
    "@types/pg": "^8.11.10",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.2"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

```jsonc
// backend/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs", "target": "ES2021", "outDir": "./dist",
    "declaration": true, "sourceMap": true, "incremental": true,
    "emitDecoratorMetadata": true, "experimentalDecorators": true,
    "esModuleInterop": true, "resolveJsonModule": true,
    "skipLibCheck": true, "strictNullChecks": true, "noImplicitAny": false,
    "baseUrl": "./"
  }
}
```

```jsonc
// backend/tsconfig.build.json
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "test", "dist", "**/*spec.ts"] }
```

```json
// backend/nest-cli.json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics",
  "sourceRoot": "src", "compilerOptions": { "deleteOutDir": true } }
```

```text
# backend/.dockerignore
node_modules
dist
coverage
.env
.env.*
test
**/*.spec.ts
```

```jsonc
// frontend/package.json
{
  "name": "gvmc-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": { "dev": "next dev -p 3001", "build": "next build", "start": "next start" },
  "dependencies": {
    "@supabase/ssr": "^0.5.1",
    "@supabase/supabase-js": "^2.45.4",
    "maplibre-gl": "^4.7.1",
    "next": "^14.2.13",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.16.5",
    "@types/react": "^18.3.8",
    "typescript": "^5.6.2"
  }
}
```

```js
// frontend/next.config.mjs
/** @type {import('next').NextConfig} */
export default { reactStrictMode: true };
```

```jsonc
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2021", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```gitignore
# repo-root .gitignore
node_modules/
dist/
build/
.next/
coverage/
*.tsbuildinfo
__pycache__/
*.py[cod]
.venv/
venv/
.env
.env.*
!.env.example
.DS_Store
*.pem
.vercel
```

```gitattributes
# repo-root .gitattributes — keep LF in the repo on Windows checkouts
* text=auto eol=lf
*.png binary
*.jpg binary
*.tif binary
*.pdf binary
```

---

## 13. Execution Order

**Sprint 1 — Foundation**
1. GitHub org + `gvmc/` monorepo; MFA; branch protection; `.env.example`.
2. Supabase project → Postgres 16 → run `0001`–`0004` migrations (`postgis` extension). (Local
   `docker compose` auto-runs all of `0001`–`0010`.)
3. Supabase Auth roles + `profiles` trigger (`on auth.user created → insert profile`).
4. Cloudflare account + R2 buckets (`gvmc-data`, `gvmc-photos`, `gvmc-documents`, `gvmc-logs`).
5. Upstash Redis database.

**Sprint 2 — App skeleton + ingestion**
6. NestJS scaffold: `InfraModule` (pg/R2/queue), `AuthGuard`, `HttpExceptionFilter`, Pino.
7. Port `wards`/`properties`/`stats`/`verify`/`export`/`tickets` (mechanical from `routing.py`).
8. **B.2** `geo_transform.py` + **B.1** `sources` module + `0005` migration + presigned upload + enqueue.
9. Next.js scaffold on Vercel; `middleware.ts`; `lib/api.ts` + **`lib/server-api.ts`** (JWT-forwarding
   fetch for Server Components — every dashboard page uses it, never a bare `fetch`); relabel copy.

**Sprint 3 — Worker + documents**
10. Python worker: `main.py` consumer, `db.py`, `r2.py`; container → GHCR.
11. **B.4** topology in `adapters.normalize_source`.
12. **B.9** Tesseract path (`digitize.py`) + `ocr_results` + `POST /sources/:id/digitize`.

**Sprint 4 — Matching + AI**
13. **B.3** `harmonization` module + `match.py` + `0006` migration.
14. **B.7** `confidence` service, consumed by `match.py`.
15. **B.5** `LlmService` (Groq port, lazy client + deterministic fallback) → `POST /harmonization/schema-map`
    **+ fixes `POST /chat`** + `0007`; `adapters.normalize_source` writes `metadata.fields`.
16. **B.6** `conflicts` module + `conflicts.py` (enqueues `ASSEMBLE_WARD`) + `0008`.
17. **B.10** `harmonized` module + `assemble.py` (`ASSEMBLE_WARD` + `EXPORT_HARMONIZED`) + `0010`
    migration + `GET /harmonized/export`.
18. Extend `tickets` with `parcel_id`/GNSS (GT capture) — parallel with 13–17.
19. `alerts`/`brief` modules wired to `LlmService`.

**Sprint 5 — Frontend + security**
20. Next.js `/integration` view (MapLibre + `ConflictPanel` + `ConfidenceCard`) + a harmonized-parcels
    layer / export button on the `admin` page.
21. Cloudflare WAF + rate limits on `/chat` `/sources/upload` `/harmonization/*` `/harmonized/*` `/properties/*/explain`.
22. Wazuh host (existing laptop/VM — **not** a paid VM); ship app + Supabase + Cloudflare logs.

**Sprint 6 — Deployment**
23. GitHub Actions: `test.yml`, `deploy-frontend.yml` (Vercel), `deploy-backend.yml` + `deploy-worker.yml` (GHCR).
24. GitHub Environment `production` + required reviewer.
25. Cloudflare DNS: `app.` → Vercel, `api.` → backend host. Final security test.

**Hygiene** — remove any committed plaintext DB creds; `.gitignore` `.env*` (keep `.env.example`);
add `tickets` + `sources` + `conflicts` route coverage to the backend test suite.

---

## 14. External Dependencies / Env Vars

| Var / service | Used by | Purpose | Secret? |
|---|---|---|---|
| `DATABASE_URL` | NestJS `pg` pool, worker `psycopg2` | Supabase Postgres/PostGIS DSN | ✅ |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | auth guard, frontend | project URL | public-ish |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | client auth | public |
| `SUPABASE_SERVICE_ROLE_KEY` | NestJS only | verify JWTs, admin ops, RLS bypass | ✅ **never in browser** |
| `GROQ_API_KEY` | `LlmService`, worker `schema_map.py` | `llama-3.3-70b-versatile` for chat/explain/brief/alert/schema-map. **Optional** — absent, the API still boots and the worker still starts; those features return templated fallbacks / deterministic name-matching until it is set | ✅ server-side (when set) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | NestJS `R2`, worker `r2.py` | Cloudflare R2 (S3-compatible) | ✅ |
| `REDIS_URL` | NestJS `Queue`, worker `main.py` | Upstash Redis job queue | ✅ |
| `NEXT_PUBLIC_API_URL` / `API_URL` | frontend | backend REST base URL | public |
| `NEXT_PUBLIC_MAP_STYLE_URL` | frontend `MapCanvas` | MapLibre style JSON (free; no key) | public |
| `FRONTEND_ORIGIN` | NestJS CORS | allowed origins | config |
| `RESEND_API_KEY` / `BREVO_API_KEY` | notifications | email alerts (SNS replacement) | ✅ |
| `WAZUH_HOST` | log shipper | SIEM ingest | infra |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` | GitHub Actions | SSH deploy of GHCR images | ✅ CI secret |

**Dropped** (AWS-only): `DB_URL` (PyMySQL), `EC2_INSTANCE_ID`, `SECRET_NAME` / `SECRETS_NAME`,
`GVMC_S3_BUCKET`, and everything for Textract / SQS / ECR / SSM.

**Not this project:** root `D:\hackthon\.env` (`JWT_SECRET`, `RAZORPAY_*`, `MSG91_*`,
`WEBSOCKET_ENDPOINT_URL`) belongs to `reference/` — do not read it.

Local dev: `.env` / `.env.local`; commit only `.env.example`. Prod secrets in GitHub Actions
secrets, Vercel env vars, Supabase config.

---

## 15. Verification (end-to-end)

1. `cp .env.example .env` (leave `GROQ_API_KEY` blank to verify graceful degradation), then
   `docker compose up` — `db` (postgis 16), `redis`, `api`, `worker`. Confirm `SELECT postgis_version();`
   and that migrations `0001`–`0010` applied clean. `curl localhost:3000/api/health` → `db/redis/r2 ok`.
   **The API must boot and the worker log `[worker] up` with no `GROQ_API_KEY`.**
2. `psql "$DATABASE_URL" -f database/seed/seed.sql` — 5 wards + admin config.
3. **Synthetic multi-source set**: a few cadastral polygons + building-footprint polygons with
   deliberate overlaps/gaps + 2–3 GNSS points (plain GeoJSON, no `crs` member), uploaded via B.1.
4. **B.1**: `POST /api/sources/upload` (`type=cadastral`) → PUT the file to the returned R2 URL →
   `data_sources` row flips to `ready`; `source_features` rows appear (`GET /api/sources/:id/features`);
   `data_sources.metadata->'fields'` lists the cadastral attribute names.
5. **B.9**: upload a scanned `revenue` PDF → `POST /api/sources/:id/digitize` → confirm `ocr_results`
   rows + `data_sources.metadata->'ocr'` populated → a `SCHEMA_MAP` job runs and `schema_mappings`
   rows appear (deterministic name-match when `GROQ_API_KEY` is blank).
6. **B.3/B.6/B.7**: `POST /api/harmonization/run?wardId=4` → `matches` rows with sane `geometry_iou`
   / `match_score` / 4-term `confidence_breakdown`; `conflicts` rows for disagreements.
7. **B.10**: `DETECT_CONFLICTS` auto-enqueues `ASSEMBLE_WARD` → `harmonized_parcels` rows for ward 4
   with `attributes`, `attribute_provenance`, `confidence`, `conflict_count`
   (`GET /api/harmonized?wardId=4`). `GET /api/harmonized/export?wardId=4&format=geojson` returns a
   presigned URL to a valid `FeatureCollection`; `&format=gpkg` returns `202` and a
   `harmonized_exports` row flips to `ready` with a downloadable `.gpkg`.
8. **B.5 (API path)**: `POST /api/harmonization/schema-map` with two column sets → JSON mapping array +
   `schema_mappings` rows. `POST /api/chat` returns a Groq answer when a key is set, else the
   templated fallback string (never a 500).
9. **Frontend**: `npm run dev`, sign in via Supabase Auth, open `/integration` and each dashboard —
   pages load (Server Components fetch through `serverApi`, so **no `401`**), layer toggles,
   confidence-colored geometries, conflict resolve round-trips, `admin` can trigger assemble + export.
10. **Tests (to be written — no spec code in this file yet)**: NestJS e2e per module with
    `ST_GeomFromGeoJSON` fixtures of known IoU; `pytest` for the worker adapters / topology /
    union-find assembly with synthetic shapely geometries. `test.yml` currently passes on
    `--passWithNoTests` / `pytest` exit-5.

---

## 16. PS 26013 Requirement Coverage — MVP vs Roadmap

This is deliberately honest about what the code in this file builds versus what is *designed but not
built*. "Built in MVP" = a snippet exists here (module + migration + worker handler). "Roadmap" =
a design note + the file it plugs into, not shipped code.

### Datasets to integrate — 10/10 ingested (rasters at footprint level)

Each is a `source_type` enum value routed to a worker adapter: drone imagery / ORI / DSM-DTM →
`geotiff_adapter`; cadastral / structured revenue / municipal GIS / utility / building footprints →
`vector_adapter`; scanned revenue → **B.9 Tesseract**; ground truthing → `point_adapter` + `tickets`;
GNSS/CORS → `point_adapter`. **Caveat:** GeoTIFFs currently land as a single bounding-box
`source_feature` (footprint), not analysed pixel-by-pixel — see *Imagery feature extraction* and
*DSM/DTM analysis* below.

### Core capabilities

| PS 26013 capability | Built in MVP | Roadmap (designed, not built) — plug-in point |
|---|---|---|
| **AI/ML spatial matching** | B.3 — PostGIS IoU + centroid distance (`match_ward.sql`) + normalized attribute-name overlap; deterministic 0–100 `match_score` | Learned scorer — logistic-regression / gradient-boost over `[iou, centroid_dist, area_ratio, name_similarity, shared_attr_agreement]`, trained on analyst-confirmed `matches` + `conflicts.resolve` outcomes (the label source). Replace the linear blend in `worker/src/harmonize/match.py::_confidence`; keep `match_ward.sql` as the candidate generator. |
| **Automated topology correction** | B.4 — per-geometry validity (`make_valid` → `buffer(0)`) in `spatial/topology.py`, `was_invalid` flagged | Parcel-fabric pass — snap vertices within tolerance (`ST_Snap` / `ST_SnapToGrid`), rebuild via `ST_Node` + `ST_Polygonize`, drop slivers (`ST_Area < ε`), close gaps. New `worker/src/spatial/fabric.py`, run per ward after `NORMALIZE_SOURCE`. |
| **Intelligent attribute mapping** | B.5 — `LlmService.suggestFieldMapping` (Groq) + `worker/harmonize/schema_map.py`, both with a deterministic name-match fallback; `schema_mappings` table | Embedding-similarity mapping + value-distribution checks (type, cardinality, regex) to raise/lower confidence; analyst approve/reject already modelled (`schema_mappings.approved`). |
| **Geo-referencing / coordinate transformation** | B.2 — `pyproj` reprojection of already-georeferenced inputs to EPSG:4326 (`spatial/geo_transform.py`); GeoJSON defaults to 4326 per RFC 7946 | GCP-based georeferencing of *raw* drone frames / scanned cadastral sheets — `gdal.Warp(dstSRS, GCPs=…)` in a new `worker/src/spatial/georeference.py`, GCPs captured in the `/integration` UI or from a sidecar. |
| **DSM/DTM analysis** | — (raster stored as footprint only) | Per-parcel height / slope sampling with `rasterstats.zonal_stats` over `harmonized_parcels`; write `attributes.mean_height_m` etc. New `EXTRACT_RASTER_STATS` job. |
| **Change detection** | — (legacy NDBI/NDVI GEE pipeline is out of scope; `properties` is demo seed) | Dataset-version diffing — keep prior `data_sources` of the same `(type, ward_id)`, `ST_Difference` on geometry + attribute delta → `change_events(ward_id, kind, before, after, geom, detected_at)`. Enqueued after `NORMALIZE_SOURCE` when a prior version exists. |
| **Imagery feature extraction** ("AI-generated feature extraction outputs") | — (B.8 is a stub: on-device flagged-tile ingest only) | Building/road segmentation over ORI tiles in the worker (pretrained UNet / SAM-derived footprint model, ONNX runtime) → `source_features` with `source_type='building_footprint'`, then straight into B.3. New `worker/src/cv/extract.py`. |
| **Spatial conflict resolution** | B.6 — `conflicts` module + `worker/harmonize/conflicts.py` (geometry + attribute disagreement, severity, resolve workflow) | LLM-suggested reconciliation text per conflict; auto-resolve when one source dominates on reliability + recency. |
| **Confidence scoring** | B.7 — 4-term blend (`geometric / attribute / source_reliability / recency`), written by the worker into `matches.confidence_breakdown` and aggregated into `harmonized_parcels.confidence` | Calibrate weights against ground-truth (`tickets` GNSS) instead of the hardcoded `0.4/0.3/0.2/0.1`. |
| **Harmonized cadastre output** | **B.10** — `harmonized_parcels` golden record (union-find clustering, most-reliable-source geometry, field-by-field attribute merge with provenance) + `GET /api/harmonized/export` GeoJSON (sync) / GeoPackage (worker) | Incremental re-assemble (below); publish as OGC API - Features (below). |
| **Synchronize multi-source datasets** | Full recompute — `POST /api/admin/refresh` and `POST /api/harmonization/run` re-run `HARMONIZE_WARD` → `ASSEMBLE_WARD` for every ward | Incremental — on a new/updated source, re-harmonize only the `harmonized_parcels` whose geometry intersects the new features. |
| **Standards / interoperability** | Canonical EPSG:4326, generic `source_type` model, REST + R2 presigned exchange, GeoJSON + **GeoPackage** export (QGIS-ready) | OGC API - Features endpoint over `harmonized_parcels`; LGD district/mandal/village codes on `data_sources` + `harmonized_parcels`; DILRMP / Bhu-Naksha field alignment. |

### Suggested technologies

AI/ML → B.5 mapping + B.7 scoring (+ roadmap learned matcher) · GeoAI → B.3 candidate generation
(+ roadmap CV extraction) · GIS & Web-GIS → Next.js `/integration` (MapLibre) · Spatial Databases →
**Supabase PostGIS** · ETL Automation → B.1 NestJS ingest + Python worker (upload → adapter →
reproject → topology → persist → match → assemble) · Computer Vision → **B.9 Tesseract** (+ roadmap
imagery segmentation) · Cloud Computing → **Vercel + Supabase + R2 + Upstash** (zero AWS) · Spatial
Analytics → B.3 / B.7 / B.10 · API Integration Frameworks → NestJS REST + R2 presigned exchange +
B.10 cadastre export.

### Expected outcomes

- **Reduce manual GIS integration** → B.1–B.6 + B.10 pipeline runs upload-to-golden-record unattended.
- **Improve accuracy / consistency** → B.4 validity + B.6 conflicts + B.7 confidence + B.10 provenance.
- **Seamless inter-departmental exchange** → authenticated NestJS REST + the `data_sources` contract +
  the B.10 GeoJSON/GeoPackage cadastre export (OGC API - Features on the roadmap).
- **Accelerate cadastral finalization** → B.3 matching + B.6 resolution + B.10 assembly replace the
  manual overlay/reconcile loop.
- **Improve interoperability** → generic source model + canonical CRS + standard REST + GeoPackage.
- **Standardized digital land governance** → NAKSHA-aligned `source_type` schema + PostGIS +
  confidence-scored, provenance-tracked `harmonized_parcels` + `audit_logs` (LGD codes on the roadmap).

**MVP scope: remaining work is assembly + deploy, not design** — every B.1–B.7 and B.10 module,
migration, worker handler and frontend panel has a snippet in this file; §18 pushes it to
`GVMC-NAKSHA/gvmc`. The roadmap rows above are the work *beyond* the MVP.

---

## 17. Security & Hygiene Checklist

```text
[ ] HTTPS everywhere (Cloudflare TLS)
[ ] MFA on all GitHub / Supabase / Cloudflare accounts
[ ] No secrets in source; .env.* gitignored, .env.example kept
[ ] DATABASE_URL / GROQ_API_KEY / R2 keys / SERVICE_ROLE_KEY as CI + host secrets only
[ ] Supabase service-role key server-side only (never shipped to the browser)
[ ] Groq API key server-side only (all LLM calls via NestJS LlmService or the worker)
[ ] R2 buckets private by default; signed URLs for every download; presigned PUT (300s) for uploads
[ ] Supabase Auth required on protected routes; @Roles enforced in AuthGuard
[ ] Server Components fetch via lib/server-api.ts (forwards the Supabase JWT) — never a bare fetch to /api
[ ] Postgres RLS evaluated for citizen-facing reads
[ ] Cloudflare WAF + stricter rate limits on /chat /sources/upload /harmonization/* /harmonized/* /properties/*/explain
[ ] class-validator DTOs on every endpoint; file-type + size limits on uploads
[ ] Wazuh receiving app (Pino) + Supabase + Cloudflare logs; alerts to email (Resend/Brevo)
[ ] Structured JSON logging (Pino) with request IDs
[ ] audit_logs row for every source ingest, conflict resolution, verify transition
[ ] Remove plaintext DB credentials from any committed config
[ ] $0 policy: verify free-tier quotas (DB storage, R2 egress, Redis commands, Groq usage, CI minutes, Vercel bandwidth) before deploy
```

---

## 18. Repository setup & push (GVMC-NAKSHA)

One private monorepo — `github.com/GVMC-NAKSHA/gvmc` — containing `frontend/ backend/ worker/
database/` + `.github/workflows/` + `docker-compose.yml` + `.env.example`. Run everything from
the repo root. `gh` must be authed as a **member/admin of `GVMC-NAKSHA` with `repo` + `workflow`
scopes** (`gh auth status`; `gh auth refresh -h github.com -s admin:org` only if you also want
org-level secrets).

### 18.1 — Assemble the tree from this document

Create the layout in §2 and paste each fenced block into the path named in its first comment
line / heading. Minimum before the first push: `database/`, `.github/workflows/`,
`docker-compose.yml`, `.env.example`, root `.gitignore` + `.gitattributes`, `README.md`.
`backend/` and `frontend/` and `worker/` source can land in the same commit or follow-ups.

### 18.2 — First commit

```bash
git init -b main
git add -A
git status                         # confirm: no .env, no node_modules, no *.pem
git commit -m "feat: GVMC / PS 26013 (NAKSHA) free-stack monorepo"
```

### 18.3 — Create the org repo + push (one shot)

```bash
gh repo create GVMC-NAKSHA/gvmc \
  --private --source . --remote origin --push \
  --description "GVMC / PS 26013 (NAKSHA) — geospatial land-record integration & harmonization (free stack)"
```

Fallback if org policy blocks `gh repo create`: make an **empty** private repo in the web UI
(no README/licence), then `git remote add origin https://github.com/GVMC-NAKSHA/gvmc.git &&
git push -u origin main`.

### 18.4 — Protect `main`

```bash
gh api -X PUT repos/GVMC-NAKSHA/gvmc/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "enforce_admins=true" -F "required_status_checks=null" -F "restrictions=null"
```

Then Settings → Environments → **New environment `production`** → enable *Required reviewers*
(add yourself). `deploy-backend.yml` / `deploy-worker.yml` already declare `environment: production`.

### 18.5 — Repo Actions secrets

```bash
for s in DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY GROQ_API_KEY \
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME \
         REDIS_URL DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_KEY; do
  gh secret set "$s" --repo GVMC-NAKSHA/gvmc
done
```

GHCR needs **no** secret — the workflows use the built-in `GITHUB_TOKEN` (`packages: write`);
first run publishes `ghcr.io/GVMC-NAKSHA/gvmc-backend` and `…/gvmc-worker`. Frontend env
(`NEXT_PUBLIC_*`) goes in Vercel, not GitHub.

### 18.6 — Deploy targets

- **Vercel:** import `GVMC-NAKSHA/gvmc`, **Root Directory = `frontend/`**, set `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAP_STYLE_URL`.
- **API + worker host:** any SSH box with Docker; put `docker-compose.yml` at `/opt/gvmc/` and
  set the `DEPLOY_*` secrets. The workflows `docker pull` + `docker compose up -d`.

### 18.7 — Verify

```bash
gh repo view GVMC-NAKSHA/gvmc --web
git remote -v                              # origin -> github.com/GVMC-NAKSHA/gvmc.git
docker compose up                          # migrations 0001-0009 apply in order, clean
psql "$DATABASE_URL" -f database/seed/seed.sql
psql "$DATABASE_URL" -f database/seed/demo_properties.sql
curl localhost:3000/api/health             # {status:'ok', db:'ok', redis:'ok', r2:'ok'}
```

Open a throwaway branch → PR → confirm a direct push to `main` is rejected and 1 approval is
required; merge → `deploy-backend.yml` builds the image and waits on the `production` reviewer.

---

*End of FINAL. For the verbatim current-codebase reference and the full PS 26013 requirement
analysis, see `change of action.md` Parts C and D.*
