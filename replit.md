# RoofTrax Brain

Standalone, tenant- and state-aware Node/TypeScript service that turns a submitted forensic roof inspection (contract v1, from RoofTraxMobile) into a claim-ready **BEI proof package** (exhibits A–M).

## Stack

- **Runtime:** Node ≥ 20, TypeScript via `tsx`
- **Framework:** Express 5
- **Database:** PostgreSQL (Replit built-in), via Drizzle ORM + `pg`
- **PDF:** `pdf-lib`
- **Validation:** Zod

## Admin Dashboard

A built-in admin UI is served at `/` (port 5000). It provides:

- **Overview** — live service/DB health, submission counts, states go-live status
- **Companies** — registered tenants and their config packs
- **States** — counsel-review go-live toggle (`reviewedAt` stamp) per state
- **Submissions** — last 50 inspection envelopes with status and download links
- **NOAA Weather** — storm events corpus size, county coverage, ingest run history

## Running on Replit

The **"Start application"** workflow runs `pnpm run dev` and listens on port 5000.

### First-time setup (already done)

```bash
pnpm install          # install dependencies
pnpm run db:push      # apply schema to Postgres
pnpm run db:seed      # seed NuHome company + Virginia state pack
```

### Health check

```
GET /healthz  →  { ok: true, service: "rooftrax-brain", db: true }
```

### Other useful scripts

```bash
pnpm run sample        # render out/sample.pdf from fixture (no DB needed)
pnpm run verify:noaa   # offline NOAA proof from bundled fixture
pnpm test              # unit tests (NOAA parser + selector)
pnpm run db:push       # re-apply schema after changes
pnpm run db:seed       # re-seed company/state config
```

## Environment variables

| Key | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | Managed by Replit automatically |
| `PORT` | — | Set to `5000` (Replit webview) |
| `NODE_ENV` | — | `development` |
| `VISUALCROSSING_API_KEY` | optional | Weather engine (Exhibit D) |
| `OBJECT_STORAGE_BASE_URL` | optional | Photo re-hash / chain of custody |

## Build phases

| Phase | Scope | State |
|-------|-------|-------|
| B0 | Scaffold, protocol engine, weather engine, contract v1, tenancy, intake/status | ✅ |
| B1 | Config model (company packs + state packs), NuHome + Virginia seed | ✅ |
| B2 | PDF assembly pipeline (letterhead, tabs, summary, footer/version) | ✅ |
| B3 | Exhibits A (homeowner), B (qualifications), C (methodology) | ✅ |
| B4 | Exhibits D (storm), E (damage + photo index), H (measurements) | ✅ |
| B5 | Exhibits I (codes), J (scope+pricing), K (adders), L (contract) | ✅ |
| B7 | Package build route, byte-level photo re-hash, download, CRM ingest seam | ✅ |
| **B6** | Exhibits F (repairability), G (manufacturer), M (signed conclusion) — AI | ⏳ next |

## Key deferred items

- **B6 AI exhibits:** F/G/M require an LLM decision (Opus vs Gemini) per the no-local-AI rule.
- **State go-live gate:** `state_config.reviewed_at` must be set by a licensed attorney before any state renders packages. Virginia seed has `reviewed_at = NULL` intentionally.
- **CRM ingest:** defined in `src/crm/ingest.ts` but inert — no `company_crm_config` table yet.
- **Async job wrapper:** `POST /submissions/:id/package` renders inline; can be wrapped in a job queue for production without client changes.
- **Object storage at deploy:** re-hash needs `OBJECT_STORAGE_BASE_URL` (403 → 503 without it).

## User preferences

- B6 instructions will be provided by the user.
