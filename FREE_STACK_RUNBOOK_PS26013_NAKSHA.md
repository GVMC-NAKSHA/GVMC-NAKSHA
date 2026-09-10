# FREE STACK RUNBOOK
## PS 26013 / NAKSHA Edition

**Target:** $0/month during development/demo, subject to free-tier limits  
**Primary database:** PostgreSQL + PostGIS  
**Frontend:** Next.js  
**Backend:** Node.js / NestJS  
**Storage:** Cloudflare R2  
**Authentication:** Supabase Auth  
**OCR:** Tesseract  
**Queue:** Upstash Redis  
**CI/CD:** GitHub Actions  
**DNS/WAF:** Cloudflare  
**LLM:** Groq  
**Security:** Wazuh

---

## 0. Scope & source of truth

> **`final.md` is the authoritative build spec.** It owns the database schema, the API routes, the
> module layout, the worker job types, and the MVP-vs-roadmap feature scope (`final.md` §16).
> **This runbook covers *infrastructure migration only*** — how each former AWS service maps to a
> free/open-source equivalent. Where a name here differs from `final.md`, `final.md` wins.

**This runbook is a zero-AWS target.** The PS 26013 build has **no AWS footprint** — CloudTrail /
S3-for-logs paths below are retained only as a "if AWS is ever reintroduced" aside; ignore them for
the NAKSHA deployment. Security logs come from the app (Pino), Supabase/Postgres, GitHub, and
Cloudflare — shipped to Wazuh.

**`GROQ_API_KEY` is optional.** Per `final.md` §7/§11 the API boots and the worker starts without
it; Groq-backed features (`/chat`, `/explain`, `/brief`, `/alert`, schema-mapping) fall back to
templated output / deterministic name-matching until a key is set.

### Generic name → canonical name (see `final.md` §2/§3/§4)

| This runbook (illustrative) | `final.md` (authoritative) |
|---|---|
| `parcels` | `source_features` (per-source) + `harmonized_parcels` (golden record, B.10) |
| `documents` | `data_sources` rows with `scanned = true` |
| `owners`, `survey_records` | `source_features.properties` (jsonb) + `ocr_results` |
| `spatial_matches` | `matches` (+ `conflicts`, `schema_mappings`) |
| modules `parcels/ documents/ matching/ explain/` | `sources/ harmonization/ conflicts/ confidence/ harmonized/ drone/` |
| routes `GET /parcels`, `POST /match`, `POST /documents` | see `final.md` §3 — `/api/sources/*`, `/api/harmonization/*`, `/api/harmonized/*`, … |
| job `DOCUMENT_OCR`, `SPATIAL_MATCH` | `DIGITIZE_SOURCE`, `HARMONIZE_WARD`, `DETECT_CONFLICTS`, `ASSEMBLE_WARD`, `EXPORT_HARMONIZED` |

---

## 1. Target Architecture

```text
                           USERS
                             |
                             v
                    +-----------------+
                    |   Cloudflare    |
                    | DNS + TLS + WAF |
                    +--------+--------+
                             |
                             v
                    +-----------------+
                    |     Vercel      |
                    | Next.js Frontend|
                    +--------+--------+
                             |
                             v
                    +-----------------+
                    | Node.js / NestJS|
                    |    REST API     |
                    +--------+--------+
                             |
             +---------------+----------------+
             |               |                |
             v               v                v
      +-------------+ +-------------+ +-------------+
      |  Supabase   | | Cloudflare  | |   Upstash   |
      | PostgreSQL  | |     R2      | |    Redis    |
      | + PostGIS   | |   Storage   | |    Queue    |
      +------+------+ +-------------+ +------+------+
             |                               |
             |                               v
             |                        +-------------+
             |                        | Python      |
             |                        | Worker      |
             |                        |             |
             |                        | Tesseract   |
             |                        | GDAL        |
             |                        +------+------+
             |                               |
             +-------------------------------+
                             |
                             v
                      +-------------+
                      |    Groq     |
                      |     LLM     |
                      +-------------+

 Security logs (zero-AWS):
 app (Pino) + audit_logs + GitHub + Cloudflare + Supabase/Postgres -> Wazuh -> alerts
```

---

# 2. Service Replacement Matrix

| # | Original AWS Service | FREE STACK Replacement | Status |
|---|---|---|---|
| 1 | IAM Identity Center / IAM | GitHub + provider RBAC | Replace |
| 2 | CloudTrail | **N/A (zero-AWS)** — application `audit_logs` + GitHub + Cloudflare + Supabase/Postgres logs → Wazuh | Replace |
| 3 | GuardDuty | Wazuh | Replace |
| 4 | AWS Budgets + Cost Anomaly Detection | Provider alerts + $0 cost policy | Replace |
| 5 | KMS | Provider-managed encryption | Replace |
| 6 | S3 | Cloudflare R2 | Replace |
| 7 | Secrets Manager | GitHub/Vercel/Supabase secrets | Replace |
| 8 | Cognito | Supabase Auth | Replace |
| 9 | IAM OIDC + deploy roles | GitHub Actions | Replace |
| 10 | GitHub Environments | GitHub Environments | Keep |
| 11 | CloudFormation/SAM | Docker + GitHub Actions | Replace |
| 12 | Lambda | Node.js/NestJS backend | Replace |
| 13 | API Gateway | NestJS/Express API | Replace |
| 14 | AWS WAF | Cloudflare WAF | Replace |
| 15 | Amplify Hosting | Vercel | Replace |
| 16 | CloudWatch | Pino + Wazuh; Grafana later if needed | Replace |
| 17 | SNS | Resend/Brevo | Replace |
| 18 | X-Ray | OpenTelemetry | Replace |
| 19 | ACM + Route 53 | Cloudflare TLS + DNS | Replace |
| 20 | RDS PostgreSQL + PostGIS | Supabase PostgreSQL + PostGIS | Replace |
| 21 | EC2 satellite pipeline | **Skipped for PS 26013** — the legacy NDBI/NDVI GEE pipeline is out of MVP scope; dataset-version *change detection* is a designed roadmap item (`final.md` §16) | Skip |
| 22 | Systems Manager | SSH/Tailscale | Replace/Optional |
| 23 | Bedrock + Bedrock Agent | Groq | Replace |
| 24 | Textract | Tesseract OCR | Replace |
| 25 | SQS + worker Lambda | Upstash Redis + Python worker | Replace |
| 26 | ECR | GitHub Container Registry | Replace |

> Note: The original runbook's numbering has 27 entries in some variants. This free-stack runbook consolidates the optional/variant services into one implementation plan.
>
> Rows 2 and 21 (CloudTrail, EC2 pipeline) are **not used** in the PS 26013 build — see §0. The
> deployment target has no AWS account.

---

# 3. Phase 1 - Identity and Security

## 3.1 GitHub Access

Use GitHub repository permissions instead of AWS IAM for application development.

Recommended repository roles:

- Owner
- Maintainer
- Developer
- Read-only

Enable MFA for all team members.

Never commit:

```text
DATABASE_PASSWORD
GROQ_API_KEY
R2_ACCESS_KEY
R2_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
```

to source control.

---

# 4. Phase 2 - Audit Logging

## 4.1 Log sources → Wazuh (zero-AWS)

The PS 26013 build has no AWS account, so **there is no CloudTrail**. The primary audit flow:

```text
Application audit_logs (Pino / DB table)
        +
GitHub audit logs
        +
Cloudflare logs
        +
Supabase / PostgreSQL logs
        |
        v
      Wazuh
        |
        v
Security alerts (email — Resend/Brevo)
```

The `audit_logs` table (`final.md` §4) records every source ingest, conflict resolution, and verify
transition. Ship Pino's structured JSON plus the provider logs above to Wazuh.

> *Aside — only if AWS is ever reintroduced:* `CloudTrail → S3 log bucket → Wazuh → alerts`.

---

# 5. Phase 3 - GuardDuty Replacement

## 5.1 Wazuh

Remove GuardDuty from the architecture.

Use Wazuh as the open-source SIEM/XDR layer.

Wazuh can provide:

- Security event monitoring
- Log analysis
- Threat detection
- File integrity monitoring
- Vulnerability detection
- Security configuration assessment
- MITRE ATT&CK mapping
- Alerting

Architecture (zero-AWS):

```text
App (Pino) + audit_logs + GitHub + Cloudflare + Supabase/Postgres logs
      |
      v
Wazuh
      |
+-----+------+
|            |
v            v
Alerts     Dashboard
```

### Important limitation

Wazuh is not a one-to-one replacement for GuardDuty. GuardDuty is deeply integrated with AWS-native telemetry and threat intelligence. Wazuh is a broader SIEM/XDR platform that requires configuration.

For a development, academic, or demonstration deployment, Wazuh is a strong zero-license-cost alternative.

### Wazuh hosting

The Wazuh software is free, but it requires compute.

Preferred order:

1. Existing laptop/desktop/server
2. Existing college/project VM
3. Existing AWS EC2 capacity
4. Other free compute

Do not create a paid VM solely for Wazuh if the project must remain at $0.

---

# 6. Phase 4 - Cost Control

## 6.1 $0 Policy

Use this policy for development:

```text
Maximum target: $0/month

Allowed:
- Free tiers
- Open-source software
- Existing infrastructure

Not allowed:
- Automatic paid upgrades
- Paid databases
- Reserved instances
- Uncontrolled API usage
- Production-scale workloads
```

Before deploying any service, verify:

- Free-tier quota
- Whether a payment method is required
- Whether the service can automatically upgrade
- Data retention limits
- Dormancy/pause behavior

---

# 7. Phase 5 - Encryption

## 7.1 KMS Replacement

Do not create an AWS KMS dependency.

Use:

- TLS/HTTPS
- Provider-managed encryption
- Private storage buckets
- Database TLS
- Application secrets

Secrets should live in:

```text
GitHub Secrets
Vercel Environment Variables
Supabase configuration
```

Never store secrets in the frontend.

---

# 8. Phase 6 - Object Storage

## 8.1 Cloudflare R2

Replace S3 with Cloudflare R2.

Recommended buckets:

```text
gvmc-data
gvmc-photos
gvmc-documents
gvmc-logs
```

Suggested object structure:

```text
documents/
  <document-id>/

photos/
  <parcel-id>/

geojson/
  <dataset-id>/

exports/
  <export-id>/
```

Use private buckets for sensitive data.

Use signed URLs for controlled downloads.

R2 is S3-compatible, so existing S3 SDK usage can often be adapted by changing the endpoint and credentials.

---

# 9. Phase 7 - Secrets

## 9.1 Replace AWS Secrets Manager

Use environment secrets.

Required variables may include:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY            # optional — API boots / worker starts without it (templated fallbacks)
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
REDIS_URL
```

The authoritative env-var table (with `NEXT_PUBLIC_*`, `API_URL`, `FRONTEND_ORIGIN`, email, deploy
secrets) is `final.md` §14.

Local development:

```text
.env
.env.local
```

Ensure they are ignored:

```text
.env
.env.*
!.env.example
```

Provide an `.env.example` containing variable names but no secrets.

---

# 10. Phase 8 - Authentication

## 10.1 Supabase Auth

Replace Cognito with Supabase Auth.

Recommended roles:

```text
admin
official
analyst
citizen
```

Architecture:

```text
User
 |
 v
Supabase Auth
 |
 v
JWT
 |
 v
NestJS API
 |
 v
PostgreSQL
```

Use database authorization/RLS where appropriate.

Do not expose the Supabase service-role key to the browser.

---

# 11. Phase 9 - CI/CD

## 11.1 GitHub Actions

Replace AWS OIDC deployment roles and CloudFormation deployment flows with GitHub Actions.

Pipeline:

```text
Developer
    |
    v
GitHub
    |
    v
Pull Request
    |
    v
Tests
    |
    v
Build
    |
    v
Production approval
    |
    v
Deploy
```

Recommended workflow files:

```text
.github/
  workflows/
    test.yml
    build.yml
    deploy-frontend.yml
    deploy-backend.yml
    deploy-worker.yml
```

---

# 12. Phase 10 - Production Approval

## 12.1 GitHub Environments

Keep GitHub Environments.

Create:

```text
production
```

Configure:

- Required reviewer
- Production secrets
- Deployment protection

Deployment flow:

```text
Merge
  |
  v
CI
  |
  v
Production approval
  |
  v
Deployment
```

---

# 13. Phase 11 - Backend

## 13.1 Replace CloudFormation/SAM

Use:

```text
Docker
+
GitHub Actions
```

Suggested repository:

```text
gvmc/
├── frontend/
├── backend/
├── worker/
├── database/
├── docker/
└── .github/
    └── workflows/
```

---

# 14. Phase 12 - Replace Lambda

## 14.1 Node.js + NestJS

Instead of multiple Lambda functions:

```text
API Gateway
     |
     v
Lambda
```

use:

```text
HTTP request
     |
     v
NestJS API
     |
     +-- Auth
     +-- Parcels
     +-- Documents
     +-- Matching
     +-- Chat
     +-- Explain
     +-- Brief
     +-- Alerts
     |
     v
PostgreSQL/PostGIS
```

Suggested backend structure *(illustrative — the authoritative module list is `final.md` §2:
`auth wards properties stats verify export alerts brief admin chat llm tickets sources
harmonization conflicts confidence harmonized drone health`)*:

```text
backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── parcels/
│   ├── documents/
│   ├── matching/
│   ├── chat/
│   ├── explain/
│   ├── brief/
│   ├── alerts/
│   └── health/
├── Dockerfile
└── package.json
```

This is simpler to develop and debug than many separate Lambda functions.

---

# 15. Phase 13 - API Gateway

## 15.1 NestJS REST API

Replace API Gateway with the backend application.

Suggested routes *(illustrative only — the complete, authoritative route table is `final.md` §3:
`/api/auth/*`, `/api/wards/*`, `/api/properties/*`, `/api/sources/*`, `/api/harmonization/*`,
`/api/conflicts/*`, `/api/harmonized/*`, `/api/tickets/*`, `/api/stats`, `/api/health`, …)*:

```text
POST /auth
GET  /parcels
GET  /parcels/:id
POST /documents
POST /match
POST /chat
POST /explain
POST /brief
POST /alerts
GET  /health
```

Example:

```text
https://api.example.com/api/sources
```

---

# 16. Phase 14 - WAF

## 16.1 Cloudflare WAF

Replace AWS WAF with Cloudflare.

Architecture:

```text
User
 |
 v
Cloudflare
 +-- DNS
 +-- TLS
 +-- WAF
 +-- Rate limiting
 |
 v
Frontend/API
```

Protect sensitive routes:

```text
/login
/upload
/chat
/explain
/match
```

Apply stricter rate limits to AI and upload endpoints.

---

# 17. Phase 15 - Frontend

## 17.1 Next.js + Vercel

Replace Amplify with Vercel.

Architecture:

```text
GitHub
   |
   v
Vercel
   |
   v
Next.js
```

Frontend responsibilities:

- Authentication UI
- Map interface
- Parcel search
- Document upload
- Spatial results
- Chat interface
- Explanation interface
- Alerts
- Admin dashboard

Keep API keys and service credentials out of client-side code.

---

# 18. Phase 16 - Observability

## 18.1 Replace CloudWatch

Start with structured application logging.

For Node.js, use Pino or another structured logger.

Example:

```json
{
  "level": "info",
  "event": "parcel_match",
  "parcelId": "parcel_123",
  "userId": "user_123",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

Priority:

```text
Logging          HIGH
Error tracking   HIGH
Metrics          MEDIUM
Distributed      MEDIUM
Tracing
```

Do not add a full Grafana/Loki stack until it is needed.

---

# 19. Phase 17 - Notifications

## 19.1 Replace SNS

Use an email provider such as Resend or Brevo within its free allowance.

Architecture:

```text
Application
     |
     v
Email provider
     |
     v
Team inbox
```

For security alerts:

```text
Wazuh
  |
  v
Security notification
```

---

# 20. Phase 18 - Tracing

## 20.1 OpenTelemetry

Replace AWS X-Ray with OpenTelemetry.

Potential flow:

```text
Frontend
   |
   v
API
   |
   v
Database
   |
   v
Worker
```

Start with basic request IDs and structured logs.

Add full distributed tracing later if needed.

---

# 21. Phase 19 - Domain

## 21.1 Cloudflare DNS + TLS

Replace:

```text
Route 53
ACM
```

with:

```text
Cloudflare DNS
Cloudflare TLS
```

Recommended:

```text
app.example.com
api.example.com
```

Architecture:

```text
Domain
  |
  v
Cloudflare DNS
  |
  +--> Vercel frontend
  |
  +--> Backend
```

---

# 22. Phase 20 - PostgreSQL + PostGIS

## 22.1 Supabase PostgreSQL

This is the core database for PS 26013 / NAKSHA.

Enable PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Example schema:

```sql
CREATE TABLE parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_number TEXT,
    owner_name TEXT,
    district TEXT,
    mandal TEXT,
    village TEXT,
    area NUMERIC,
    geometry geometry(MultiPolygon, 4326),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Create a spatial index:

```sql
CREATE INDEX parcels_geometry_idx
ON parcels
USING GIST (geometry);
```

Spatial operations can include:

```text
ST_Intersects()
ST_Within()
ST_Contains()
ST_Distance()
```

Recommended logical data model *(illustrative — the authoritative schema is `final.md` §4,
migrations `0001`–`0010`)*:

```text
profiles            # (users)
wards
properties          # change-detection demo domain
data_sources        # every uploaded source (incl. scanned "documents")
source_features     # normalized per-source geometry + attributes (owners / survey_records live in .properties jsonb)
ocr_results
schema_mappings
matches             # (spatial_matches)
conflicts
harmonized_parcels  # B.10 golden record
harmonized_exports
tickets             # ground-truthing capture
alerts
audit_logs
```

---

# 23. Phase 21 - Spatial Matching

## 23.1 NAKSHA Spatial Workflow

```text
GeoJSON
   |
   v
Validation
   |
   v
PostGIS
   |
   v
Spatial index
   |
   v
Candidate search
   |
   v
ST_Intersects / ST_Within
   |
   v
Matching score
   |
   v
Results
```

Do not perform large spatial matching operations in the browser.

Perform them in PostgreSQL/PostGIS or the backend worker.

---

# 24. Phase 22 - Satellite Pipeline

## 24.1 Skipped for PS 26013

The original satellite EC2 / Google Earth Engine pipeline (NDBI/NDVI change detection) is **out of
MVP scope** — `final.md` does not build it and `properties` is demo seed data. What PS 26013 calls
"change detection" is a **designed roadmap item** in `final.md` §16 (dataset-version diffing of
successive `data_sources` → a `change_events` table), independent of the old GEE pipeline.

If the GEE pipeline is ever wanted anyway:

```text
Python
+
GDAL
+
Google Earth Engine
```

Run it on:

- Existing computer
- Existing VM
- Existing server

Do not provision paid EC2 solely for the pipeline if the goal is $0.

---

# 25. Phase 23 - Remote Administration

## 25.1 Replace Systems Manager

If you do not use EC2, SSM is unnecessary.

For an existing server:

```text
SSH
```

or:

```text
Tailscale
```

is sufficient for a project environment.

Use SSH keys, not passwords.

---

# 26. Phase 24 - LLM

## 26.1 Keep Groq

Do not add Bedrock.

Architecture:

```text
NestJS API
     |
     v
   Groq
     |
     v
LLM response
```

Functions (see `final.md` §8/§9): `/chat`, `/explain`, `/brief`, `/alert`, and B.5 schema-mapping.

Keep the Groq API key server-side. It is **optional**: with no `GROQ_API_KEY`, `LlmService` and the
worker's `schema_map.py` build no client and return templated fallbacks / deterministic
column-name matching — the API still boots and the worker still starts (`final.md` §7, §11).

---

# 27. Phase 25 - OCR

## 27.1 Tesseract

Replace Textract with Tesseract.

Pipeline:

```text
Scanned document
       |
       v
      R2
       |
       v
  Redis queue
       |
       v
 Python worker
       |
       v
   Tesseract
       |
       v
Extracted text
       |
       v
 PostgreSQL
       |
       v
     Groq
```

Tesseract is appropriate for a zero-license-cost OCR pipeline.

### Limitation

Tesseract is primarily OCR, not a complete managed document-AI service.

For:

- Poor-quality scans
- Tables
- Handwriting
- Complex government forms

additional preprocessing and document parsing may be necessary.

---

# 28. Phase 26 - Queue

## 28.1 Upstash Redis

Replace SQS with Redis.

Current conceptual flow:

```text
API
 |
 | enqueue job
 v
Redis
 |
 | consume job
 v
Python Worker
```

Example job:

```json
{
  "jobType": "DOCUMENT_OCR",
  "documentId": "doc_123",
  "objectKey": "documents/doc_123/file.pdf"
}
```

Possible job types:

```text
DOCUMENT_OCR
SPATIAL_MATCH
GEOJSON_IMPORT
PHOTO_PROCESSING
DOCUMENT_EXTRACTION
```

---

# 29. Phase 27 - Worker

## 29.1 Python Worker

Use Python for:

- Tesseract
- GDAL
- GeoJSON processing
- Spatial preprocessing
- Document processing

Suggested structure:

```text
worker/
├── src/
│   ├── ocr/
│   ├── spatial/
│   ├── documents/
│   ├── jobs/
│   └── database/
├── Dockerfile
└── requirements.txt
```

Worker flow:

```text
Redis
  |
  v
Job consumer
  |
  +--> OCR
  +--> GDAL
  +--> PostGIS
  +--> R2
  |
  v
Job status
```

Implement retries and a failed-job state.

---

# 30. Phase 28 - Container Registry

## 30.1 GitHub Container Registry

Replace ECR with GHCR.

Suggested images:

```text
ghcr.io/<org>/gvmc-backend
ghcr.io/<org>/gvmc-worker
```

Pipeline:

```text
GitHub
   |
   v
GitHub Actions
   |
   v
Docker build
   |
   v
GHCR
   |
   v
Deployment
```

---

# 31. Phase 29 - Application Security

Minimum security checklist:

```text
[ ] HTTPS enabled
[ ] MFA enabled for team accounts
[ ] Secrets removed from source code
[ ] Database credentials stored as secrets
[ ] R2 buckets private by default
[ ] Signed URLs used for private objects
[ ] Supabase service key server-side only
[ ] Groq key server-side only
[ ] API rate limits enabled
[ ] Authentication required for protected routes
[ ] Authorization checks implemented
[ ] PostgreSQL RLS evaluated where appropriate
[ ] Input validation enabled
[ ] File upload restrictions enabled
[ ] Wazuh configured (ingests app / audit_logs / GitHub / Cloudflare / Supabase logs — no CloudTrail)
[ ] Audit logging enabled (audit_logs row per source ingest / conflict resolve / verify transition)
[ ] Server Components call the API with a forwarded Supabase JWT (never a bare fetch) — final.md §10
```

*(See `final.md` §17 for the full security & hygiene checklist.)*

---

# 32. Deployment Architecture

## Development

```text
Developer laptop
 |
 +-- Next.js
 +-- NestJS
 +-- Python worker
 |
 +-- Supabase
 +-- R2
 +-- Upstash
 +-- Groq
```

## Production/demo

```text
                    Internet
                       |
                       v
                  Cloudflare
                  DNS/WAF/TLS
                       |
              +--------+--------+
              |                 |
              v                 v
           Vercel           Backend host
          Next.js           NestJS API
                                |
                    +-----------+-----------+
                    |           |           |
                    v           v           v
                Supabase       R2        Upstash
                Postgres                 Redis
                + PostGIS                   |
                                            v
                                       Python worker

App / audit_logs / GitHub / Cloudflare / Supabase logs -> Wazuh   (no AWS)
```

---

# 33. Repository Structure

*Illustrative — the authoritative tree (real module and worker-package names) is `final.md` §2.
`backend/src/` folders are `sources/ harmonization/ conflicts/ harmonized/ …`; `worker/src/` is
`ingest/ spatial/ ocr/ harmonize/`.*

```text
gvmc/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   ├── parcels/
│   │   ├── documents/
│   │   ├── matching/
│   │   ├── chat/
│   │   ├── explain/
│   │   ├── brief/
│   │   └── alerts/
│   ├── Dockerfile
│   └── package.json
│
├── worker/
│   ├── src/
│   │   ├── ocr/
│   │   ├── spatial/
│   │   ├── documents/
│   │   └── jobs/
│   ├── Dockerfile
│   └── requirements.txt
│
├── database/
│   ├── migrations/
│   ├── seed/
│   └── schema/
│
├── docs/
│
├── docker-compose.yml
│
├── .github/
│   └── workflows/
│       ├── test.yml
│       ├── deploy-frontend.yml
│       ├── deploy-backend.yml
│       └── deploy-worker.yml
│
├── .env.example
├── .gitignore
└── README.md
```

---

# 34. Implementation Order

*Infrastructure milestones only. The feature-level sprint plan (B.1–B.10) is `final.md` §13.*

## Sprint 1 - Foundation

```text
1. GitHub repository
2. Supabase project
3. PostgreSQL
4. PostGIS
5. Supabase Auth
6. Cloudflare account
7. R2 bucket
```

## Sprint 2 - Application

```text
8. Next.js frontend
9. NestJS backend
10. Authentication
11. PostgreSQL models
12. GeoJSON ingestion
13. PostGIS spatial queries
```

## Sprint 3 - Documents

```text
14. R2 document storage
15. Upstash Redis
16. Python worker
17. Tesseract
18. Document extraction (B.9)
19. Multi-source ingestion adapters (B.1) + CRS transform (B.2) + topology (B.4)
20. PostGIS spatial matching (B.3) + conflict resolution (B.6) + confidence scoring (B.7)
21. Harmonized-parcel assembly + cadastre export (B.10)
```

## Sprint 4 - AI

```text
22. Groq integration (optional key)
23. /chat
24. /explain
25. /brief
26. /alert
27. Attribute mapping (B.5) — Groq + deterministic fallback
```

## Sprint 5 - Security

```text
28. Cloudflare WAF
29. Wazuh (app / audit_logs / GitHub / Cloudflare / Supabase logs — no CloudTrail)
30. Security rules
31. Audit logging
```

## Sprint 6 - Deployment

```text
32. GitHub Actions
33. Production environment
34. Vercel deployment
35. Backend deployment
36. Worker deployment
37. Domain + DNS
38. Final security test
```

---

# 35. Final Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Frontend hosting | Vercel |
| Backend | Node.js + NestJS |
| Database | Supabase PostgreSQL |
| Spatial database | PostGIS |
| Object storage | Cloudflare R2 |
| Authentication | Supabase Auth |
| Queue | Upstash Redis |
| OCR | Tesseract |
| Spatial processing | PostGIS + GDAL |
| LLM | Groq |
| CI/CD | GitHub Actions |
| Container registry | GitHub Container Registry |
| DNS | Cloudflare |
| TLS | Cloudflare |
| WAF | Cloudflare |
| Security/XDR | Wazuh |
| Audit logs | App `audit_logs` + Pino → Wazuh (no CloudTrail) |
| Tracing | OpenTelemetry |
| Email | Resend/Brevo |
| Remote administration | SSH/Tailscale |

---

# 36. What Remains on AWS?

**Nothing.** The PS 26013 / NAKSHA build has no AWS account: no CloudTrail, no S3, no EC2. Audit and
security logs are app `audit_logs` + Pino + GitHub + Cloudflare + Supabase/Postgres → Wazuh.

The block below is retained only as the *general* migration guidance for a project that still has an
AWS presence — it does **not** describe this deployment:

```text
AWS (only if the org still runs AWS for other reasons)
 |
 +-- CloudTrail  -> S3 (logs) -> Wazuh
 |
 +-- Optional EC2 if someone revives the GEE satellite pipeline
```

For PS 26013, everything is on the free/open-source stack.

---

# 37. Recommended Architecture Decision

For PS 26013 / NAKSHA, use:

> **Next.js + NestJS + Supabase PostgreSQL/PostGIS + Cloudflare R2 + Upstash Redis + Python worker + Tesseract + Groq + Wazuh**

Do not replace Lambda with another serverless provider merely for the sake of replacing Lambda.

A conventional backend plus worker is simpler for this project:

```text
NestJS API
    +
Python Worker
    +
PostgreSQL/PostGIS
```

It is easier to:

- Develop locally
- Debug
- Demonstrate
- Test
- Explain in a project review
- Migrate to AWS/Azure/GCP later

---

# 38. Free-Tier Caveats

The stack is designed for a $0 development/demo target, not unlimited production usage.

Monitor:

- Database storage
- Object storage
- Egress
- API usage
- Redis commands
- LLM usage
- CI/CD minutes
- Worker compute
- Wazuh hosting resources

Some free services can pause inactive projects or impose quotas. Verify current provider limits before production deployment.

---

# 39. Final Migration Summary

```text
AWS SERVERLESS / MANAGED STACK
            |
            | migration
            v
================================================

IAM              -> GitHub/provider RBAC
GuardDuty        -> Wazuh
S3               -> Cloudflare R2
Secrets Manager  -> Environment secrets
Cognito          -> Supabase Auth
Lambda            -> NestJS
API Gateway      -> NestJS REST API
WAF              -> Cloudflare WAF
Amplify          -> Vercel
CloudWatch       -> Pino + Wazuh
SNS              -> Resend/Brevo
X-Ray            -> OpenTelemetry
ACM              -> Cloudflare TLS
Route 53         -> Cloudflare DNS
RDS              -> Supabase PostgreSQL
PostGIS          -> Supabase PostGIS
Textract         -> Tesseract
SQS              -> Upstash Redis
Lambda Worker    -> Python Worker
ECR              -> GitHub Container Registry
CloudFormation   -> Docker + GitHub Actions
SSM              -> SSH/Tailscale
Bedrock          -> Groq (optional key)
CloudTrail       -> app audit_logs + GitHub/Cloudflare/Supabase logs -> Wazuh
EC2 GEE pipeline -> dropped (change detection is a final.md §16 roadmap item)

================================================

TARGET:
$0/month for development/demo — zero AWS footprint
```

## 40. Definition of Done

*Infrastructure DoD. Feature-level acceptance (B.1–B.10 end-to-end) is `final.md` §15.*

```text
[ ] User can register/login
[ ] Role-based access works
[ ] Frontend is deployed
[ ] Backend API is deployed (boots with GROQ_API_KEY unset)
[ ] PostgreSQL is connected
[ ] PostGIS is enabled
[ ] Migrations 0001-0010 applied
[ ] GeoJSON can be imported (defaults to EPSG:4326)
[ ] Spatial queries work
[ ] Documents upload to R2
[ ] OCR jobs enter Redis
[ ] Python worker processes jobs (starts with GROQ_API_KEY unset)
[ ] Tesseract extracts text
[ ] Extracted data is stored (+ metadata.fields for structured sources)
[ ] Spatial matching works (B.3)
[ ] Conflicts generated + resolvable (B.6)
[ ] Harmonized parcels assembled + cadastre exports (GeoJSON / GeoPackage) (B.10)
[ ] Groq chat works when a key is set; templated fallback when not
[ ] Explanation endpoint works
[ ] Brief generation works
[ ] Alerts work
[ ] Dashboards load (Server Components forward the JWT — no 401)
[ ] Cloudflare WAF is active
[ ] Secrets are not exposed
[ ] Wazuh is receiving security events (no CloudTrail dependency)
[ ] GitHub Actions CI works
[ ] Production approval is enabled
[ ] Backups/export strategy is documented
[ ] Free-tier limits are documented
```

### Scope vs PS 26013

This runbook = infrastructure migration. **Feature completeness against the PS 26013 requirements —
including which capabilities are MVP vs roadmap (learned matching, change detection, full topology,
GCP georeferencing, imagery feature extraction) — is tracked in `final.md` §16.**

**End of Free Stack Runbook**
