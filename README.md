# RoofTrax Pro Brain

Standalone, tenant- and state-aware service that turns a submitted forensic roof
inspection (contract v1, from RoofTraxMobile) into a claim-ready **BEI proof
package** (exhibits A–M). Web-based Node/TypeScript service.

**UPPA posture:** the package documents the contractor's *physical findings* and
*own fixed incurred cost* — it never adjusts, negotiates, or states what a carrier
owes. All state-specific legal/code content is configuration, counsel-reviewed
per state before go-live.

## Status

Built and locally verified: **B0–B5.**

| Phase | Scope | State |
|---|---|---|
| B0 | Scaffold + port protocol engine, weather engine, contract v1, tenancy, intake/status | ✅ |
| B1 | Config model (company packs + state packs), NuHome + Virginia seed | ✅ |
| B2 | PDF assembly pipeline (letterhead, tabs, summary/contents, footer/version) | ✅ |
| B3 | Exhibits A (homeowner), B (qualifications), C (methodology) | ✅ |
| B4 | Exhibits D (storm), E (damage + photo index), H (measurements) | ✅ |
| B5 | Exhibits I (codes), J (scope+pricing), K (adders), L (contract) — code→scope→price spine | ✅ |
| B7 | Package build route + byte-level photo re-hash (chain of custody) + download + CRM ingest seam | ✅ |
| **B6** | Exhibits F (repairability), G (manufacturer), M (signed conclusion) — **AI, Replit hand-off** | ⏳ |

The full A–L package renders end to end from a fixture (`npm run sample` →
`out/sample.pdf`, 21 pages) with correct pricing math — verified without a DB.
`tsx scripts/verify-b7.ts` verifies the chain-of-custody re-hash both ways
(matching bytes pass, tampered/unfetchable bytes reject) + the package store.

## Deferred (do not forget)

- **B6 — AI exhibits F/G/M.** Repairability/matching narrative, manufacturer
  docs, signed repairability conclusion (renders the on-file signature). Built via
  the Replit hand-off per the no-local-AI rule. Needs the Opus-vs-Gemini decision.
- **CRM report-ingest activation.** The outbound ingest is defined (`src/crm/ingest.ts`)
  but inert — no Brain-side `company_crm_config` table yet, so every tenant's CRM
  thread reports `pending`. Wire the config + per-tenant key when the CRM
  multi-tenant rollout provides them.
- **Async job wrapper.** `POST /submissions/:id/package` renders inline and awaits.
  A production deploy can wrap it in a job queue; the app polls `GET /status`, so
  no client change is needed then.
- **Object storage + DB at deploy.** The re-hash needs `OBJECT_STORAGE_BASE_URL`
  (403 → 503 without it); routes need a real `DATABASE_URL`.

## Run

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL to a real Postgres
pnpm run db:push              # create tables
pnpm run db:seed              # seed NuHome + Virginia (VA left NOT go-live)
pnpm run sample               # render out/sample.pdf from the fixture (no DB needed)
pnpm run dev                  # start the service
```

**Before enabling a state:** a licensed attorney/code official must review that
state's pack (code library, homeowner-rights, UPPA disclaimer) and set
`state_config.reviewed_at`. The config resolver refuses to render packages for a
state with `reviewed_at = NULL`.

## Layout

```
src/
  protocol/     ported gate engine (parity with the field app)
  weather/      ported deterministic storm engine
  tenancy/      company/state pack types
  submissions/  contract v1 types, intake store, validation
  config/       config resolver + packs (nuhome, virginia) + seed
  scope/        measurement math + code→scope→price computation
  pdf/          PdfDoc engine, summary, exhibit registry, exhibits/, assemble
  db/           drizzle schema + client
  routes/       health, submissions (intake/status)
scripts/build-sample.ts   fixture → out/sample.pdf (end-to-end verify, no DB)
```
