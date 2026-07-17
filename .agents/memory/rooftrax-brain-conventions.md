---
name: RoofTrax Brain conventions
description: Durable architecture rules for the Brain's PDF/AI pipeline and auth realms
---

## PDF pipeline stays pure
`buildPackage`/`assemblePackage` must never fetch or hit the DB — narratives, signature bytes, and config are resolved in the route and passed in via opts. **Why:** keeps `pnpm run sample` and tests fully offline/deterministic. **How to apply:** any new exhibit input goes through opts → `ExhibitContext`, never a fetch inside an exhibit.

## AI narrative guard is fail-closed and token-exact
Generated narratives (exhibits F/G/M) must pass the UPPA guard (banned phrases + number grounding). Grounding is **exact numeric token matching** against tokens extracted from the input facts — substring matching was rejected in review because "35" would pass via "13500". Guard failure after retries → status `generation_failed`, 422, no package emitted.

## Gemini via Replit-managed integration (gateway quirks)
User chose Replit's managed Gemini (provisioned with `setupReplitAIIntegrations`, slug `gemini` → `AI_INTEGRATIONS_GEMINI_BASE_URL`/`_API_KEY`). The key is an opaque token valid ONLY against the gateway base URL — it 400s ("API key not valid") on Google's direct endpoint. The gateway rejects the SDK's default `/v1beta` path prefix; `@google/genai` must be constructed with `httpOptions: { baseUrl, apiVersion: '' }`. Narratives are cached on the submission (`aiNarratives`); rebuilds reuse them unless `?regenerate=true`.

## Auth: two realms, fail closed everywhere
Machine bearer token (timingSafeEqual) for app→Brain API; single-admin HS256 JWT cookie for UI. No dev bypass — missing secrets mean guards reject (and prod boot refuses to start). `SESSION_SECRET` absent → sessions can neither be issued nor verified (explicit checks, not just jwt errors).
