# B6 — AI Exhibits (F, G, M) with Gemini 3.1 Pro

**Repo:** RoofTraxBrain (this repo). **Runtime:** the existing Node/TS/Express/Drizzle Brain.
**Who builds this:** Replit. This is the LLM phase, intentionally not built locally.

B6 adds the three judgment-heavy exhibits the deterministic B0–B5 spine left out:

| Exhibit | Title | What the LLM produces |
|---|---|---|
| **F** | Repairability Assessment | Matching & uniformity narrative — why a code-compliant, reasonably uniform repair can/can't be achieved by partial replacement, from the documented damage + discontinued-product status. |
| **G** | Manufacturer & Product Documentation | Narrative composed from the captured product identification + any manufacturer requirements in config. Discontinuation / installation-requirement framing. |
| **M** | Signed Repairability Conclusion | The final conclusion narrative **+ the inspector's on-file signature** (image + signedAt). Last exhibit. |

---

## 0. The non-negotiable contract (UPPA + no fabrication)

This is a legal/forensic document under UPPA discipline. The LLM's ONLY job is to
**compose professional narrative from facts already verified and computed by the
Brain.** It must never:

- state or imply **insurance coverage**, what a carrier **owes**, or that a claim
  should be paid/accepted/denied ("covered", "coverage", "the carrier owes",
  "you are entitled to payment", "policy limits", "bad faith", "fair settlement");
- introduce any **fact, number, measurement, date, dollar amount, brand, or code
  citation** not present in the structured input;
- give the homeowner **advice** or recommend a claim action;
- analyze photos or invent damage observations (B6 is **text-in / narrative-out**;
  vision/hail-scoring is explicitly out of scope and stays deferred).

It documents **the contractor's physical findings and own fixed incurred cost** —
nothing else. Two enforcement layers are required (see §7): a constraining system
prompt **and** a deterministic post-generation guard. If the guard fails, the
package is not produced — we fail closed, never emit an unvetted narrative.

---

## 1. Model, SDK, Secrets

- **SDK:** `@google/genai` (the current unified Google GenAI SDK). Add to deps.
- **Model:** read from env `GEMINI_MODEL`. **Confirm the exact model id** in Google
  AI Studio before wiring — "Gemini 3.1 Pro" must resolve to a real API string
  (e.g. `gemini-3.1-pro` / `gemini-3-pro-preview`); an invalid id fails at call
  time. Default the env to the confirmed id.
- **Secrets to add in Replit** (never commit; the repo is public):
  - `GEMINI_API_KEY` — Google AI Studio (Gemini Developer API) key. (If you use
    Vertex instead, wire the Vertex auth path in the SDK and document it.)
  - `GEMINI_MODEL` — the confirmed model id.
  - `GEMINI_TEMPERATURE` — default `0.2` (low, for reproducible legal prose).
  - `AI_MAX_RETRIES` — default `2`.
- Extend `src/env.ts` with these (GEMINI_API_KEY optional at boot so `sample`/tests
  still run without it; the package route 503s if it's missing at call time, same
  pattern as `OBJECT_STORAGE_BASE_URL`).

Call pattern (confirm shapes against the installed SDK version):

```ts
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const res = await ai.models.generateContent({
  model: env.GEMINI_MODEL,
  contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  config: {
    systemInstruction: UPPA_SYSTEM_PROMPT,
    temperature: Number(env.GEMINI_TEMPERATURE),
    responseMimeType: 'application/json',
    responseSchema: NARRATIVE_SCHEMA,   // force structured JSON out
  },
});
const narratives = JSON.parse(res.text);  // validate before use
```

---

## 2. Architecture — keep `buildPackage` pure

`src/pdf/assemble.ts::buildPackage(inspection, config, opts)` is deliberately pure
(no DB/network; `ctx = { doc, inspection, config, scope }`, synchronous
`render(ctx)`). Do **not** call Gemini or fetch the signature inside an exhibit.
Instead:

1. Generate narratives + fetch the signature image **before** assembly (in the
   package route, which already has DB + a `PhotoFetcher`).
2. Pass them in: extend `ExhibitContext` with
   `ai: ForensicNarratives | null` and `signatureImage: Uint8Array | null`, and
   add `opts.narratives` / `opts.signatureImage` to `buildPackage`. Exhibits F/G/M
   read `ctx.ai` / `ctx.signatureImage`. `buildPackage` stays pure (inputs-in).

This preserves the fixture-based, no-DB verifiability of the whole PDF pipeline
(a mock narrative object renders F/G/M offline — see §8).

---

## 3. Files

```
src/ai/
  types.ts        ForensicNarratives + GenerationInput types
  prompt.ts       UPPA system prompt + buildUserPrompt(input) (pure)
  schema.ts       NARRATIVE_SCHEMA (responseSchema) + zod validator
  guard.ts        deterministic post-gen guard (banned phrases + number grounding)  ← pure, unit-tested
  gemini.ts       GeminiGenerator (the only file that calls the API)
  generate.ts     generateNarratives(input): load-or-generate + store + guard
src/pdf/exhibits/
  F_repairability.ts
  G_manufacturer.ts
  M_conclusion.ts
src/pdf/exhibit.ts     + ai, signatureImage on ExhibitContext
src/pdf/assemble.ts    + opts.narratives / opts.signatureImage → ctx
src/pdf/registry.ts    insert F,G between E and H; M last
src/db/schema.ts       + ai_narratives columns on submissions (see §6)
src/routes/packages.ts generate/fetch before assemble; status + failure handling
src/env.ts             + GEMINI_* vars
scripts/verify-b6.ts   gated live smoke test
```

Registry order becomes: `A B C D E F G H I J K L M`.

---

## 4. Grounding input (what Gemini may use — and only this)

Build one pure function `buildGenerationInput(inspection, config, scope)` that
assembles a compact **facts object** from data already in the submission. The
prompt says: *use only these facts.* Include:

- Property: address, dateOfLoss, claimNumber (identity only).
- Storm of record (from `inspection.storm`): type, date, magnitude, source.
- Damage: each `damageInstances[]` (slope/elevation, damageType, observedIndicators,
  causationNote), test squares (hit counts), components/penetrations status.
- Product ID (`products[]`): brand/line, `unidentifiable`, and — critically — the
  **discontinued** status if captured (this is the linchpin of the F/M matching
  argument). If discontinuation isn't in the data, the narrative must not assert it.
- Scope (`ScopeResult`): squares, line items (description/qty/unit), subtotal, and
  the governing `codeRefs` per element. These are the contractor's fixed incurred
  cost — the narrative may reference them but must not recompute or editorialize.
- State code library (`config.state.codeLibrary`) for the code citations F/M lean on.

Do **not** pass raw photos. Do not pass anything the report shouldn't cite.

---

## 5. Structured output (what Gemini returns)

`NARRATIVE_SCHEMA` forces JSON matching `ForensicNarratives`:

```ts
interface ForensicNarratives {
  repairability: {           // Exhibit F
    summary: string;         // 1–3 short paragraphs
    matchingFactors: string[]; // bullet points, each grounded in a provided fact
  };
  manufacturer: {            // Exhibit G
    summary: string;
    productStatement: string; // brand/line + identified/unidentifiable/discontinued (from input only)
  };
  conclusion: {              // Exhibit M
    statement: string;       // the signed repairability conclusion
    basis: string[];         // the ordered factual basis (storm, damage, discontinuation, code)
  };
}
```

Validate with zod after `JSON.parse`. Reject on schema miss → retry (§7).

---

## 6. Determinism — generate once, store, reuse

LLM output varies run-to-run; a legal document must be stable. So:

- Add to the `submissions` table: `aiNarratives jsonb | null`, `aiModel text | null`,
  `aiGeneratedAt timestamptz | null` (drizzle; `db:push`).
- `generateNarratives(sub)`: if `aiNarratives` is present, **reuse it**; else call
  Gemini, run the guard, and store the result on the submission. Package rebuilds
  then reuse the stored narrative → identical PDF.
- Provide an explicit `?regenerate=true` path (role-gated later) to force a fresh
  generation when a human wants one. Never silently regenerate.

---

## 7. Guardrails (both layers required)

**System prompt** (`src/ai/prompt.ts`) — encode §0 verbatim as rules, state the
UPPA role ("licensed contractor documenting physical findings and fixed incurred
cost; not a public adjuster; no coverage opinions"), and instruct: *if a fact is
not provided, omit it; never infer or invent.*

**Deterministic guard** (`src/ai/guard.ts`, pure + unit-tested) — after generation:

1. **Banned-phrase check** (case-insensitive): coverage/owes/advice terms from §0 →
   fail.
2. **Number grounding:** extract every number (dollar amounts, measurements,
   percentages, dates) from the narrative; each must appear in the input facts set.
   An ungrounded number → fail.
3. On fail: retry up to `AI_MAX_RETRIES` with the violation fed back; if still
   failing, return an error → route sets status `generation_failed` (do NOT render
   the package). Fail closed.

---

## 8. Flow, status, failure

In `POST /submissions/:id/package` (before `assemblePackage`):

1. `setStatus('generating')`.
2. `narratives = await generateNarratives(sub)` (load-or-generate+guard+store).
3. `signatureImage = await fetcher.fetch(inspection.signatureOnFile.url)` bytes
   (best-effort; if absent, M renders "signature on file" text + signedAt, no image).
4. `assemblePackage(inspection, config, manifest, fetcher, { narratives, signatureImage })`.
5. On generation/guard failure → `setStatus('generation_failed')`, 422 with reason.
   The existing integrity gate (B7) still runs first-or-alongside as today.

Latency: Gemini adds seconds. The build already "runs inline and awaits" (B7 note)
— acceptable for now; when you wrap package build in the deferred job queue, the AI
step lives inside that job (the app already polls `GET /status`).

---

## 9. Exhibits F / G / M (rendering)

Use the existing `PdfDoc` helpers (`heading`, `paragraph`, `eyebrow`, `bullets`,
note-box) exactly like D/E/I so they match the house style (Arial, ≥10pt, justified
body). Each `applies(ctx)` returns `ctx.ai != null` (F/G/M only render when
narratives exist).

- **F** — heading + `ai.repairability.summary` paragraphs + `matchingFactors`
  bullets. If `products[].unidentifiable`/discontinued drove it, the narrative will
  already say so (grounded).
- **G** — `ai.manufacturer.summary` + `productStatement`. Keep factual; if no
  manufacturer requirement data exists, this stays a short product statement.
- **M** — `ai.conclusion.statement` + `basis` bullets, then the **signature block**:
  render `ctx.signatureImage` (if present) with the inspector name, license, and
  `signatureOnFile.signedAt`; else a "Signature on file — signed {date}" line.
  This is the exhibit that closes the package.

---

## 10. Testing / verification

- **Unit (offline, no API):** guard.ts (banned phrase + number grounding — pass and
  fail cases), prompt/input builder (grounding facts present), schema validator.
- **PDF (offline):** a `MockGenerator` returning fixed `ForensicNarratives` so
  `npm run sample` renders F/G/M from the fixture with **no API call** — keep the
  fixture path API-free (this is how the whole pipeline stays verifiable).
- **Live smoke (gated):** `scripts/verify-b6.ts` runs one real Gemini generation
  from the fixture, prints the narrative + guard result, renders `out/b6-sample.pdf`.
  Requires `GEMINI_API_KEY`; do not run in CI without the key.

## 11. Definition of done

- `npm run typecheck` + `npm test` clean; `npm run sample` renders A–M (F/G/M via
  mock) with no network.
- With `GEMINI_API_KEY` set, `scripts/verify-b6.ts` produces a guarded, grounded
  F/G/M and a full A–M PDF.
- Narratives are stored on the submission and reused on rebuild (stable output).
- Guard blocks a coverage phrase and an ungrounded number in tests.
- No secret committed; `GEMINI_*` only in Replit Secrets.

## 12. Explicitly out of scope for B6

Photo/vision analysis and any hail-severity **scoring** by the model (that stays
deferred and, if ever built, is a separate deterministic-vs-AI decision). B6 is
grounded narrative composition only.
