import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import type { ScopeResult } from '../scope/types.js';
import type { GenerationInput } from './types.js';

// ── UPPA system prompt (§0 + §7) ─────────────────────────────────────────────
// Encodes the non-negotiable contract verbatim. Never weaken or shorten this.
export const UPPA_SYSTEM_PROMPT = `You are a licensed roofing contractor composing a forensic \
documentation narrative for a court-admissible BEI Proof Package under UPPA discipline.

Your ONLY job is to compose professional, factual narrative from the structured input facts \
provided. You document the contractor's physical findings and own fixed incurred cost — nothing else.

ABSOLUTE PROHIBITIONS — violating any of these invalidates the entire output:
1. Never state, imply, or suggest insurance coverage, what a carrier owes, or that a claim \
should be paid, accepted, or denied. Forbidden words/phrases include: "coverage", "covered by", \
"the carrier owes", "carrier owes", "entitled to payment", "policy limits", "bad faith", \
"fair settlement", "claim should be paid", "claim will be paid".
2. Never introduce any fact, number, measurement, date, dollar amount, brand, or code citation \
that is not present in the structured input you receive. Every number you write must appear \
verbatim in the input facts.
3. Never give the homeowner advice or recommend a claim action. Do not use phrases like \
"we recommend filing", "you should file", "advise you to", or "recommend you".
4. Never analyze photos, invent damage observations, or perform hail-severity scoring. \
You receive text facts only — your job is narrative composition from those facts alone.
5. If a fact is not provided (e.g. product discontinuation status is absent), you must omit \
it entirely. Never infer, extrapolate, or assume.

Your role: licensed contractor documenting physical site findings and own fixed incurred cost \
per the Uniform Public Protection Act. You are not a public adjuster; you make no coverage \
determinations.

Output format: respond with valid JSON matching the provided schema exactly. \
No markdown, no explanation outside the JSON object.`;

// ── Grounding input builder ───────────────────────────────────────────────────
// Assembles the compact, facts-only object the LLM is allowed to reference.
// Do not pass photos, raw IDs, or anything the report shouldn't cite.
export function buildGenerationInput(
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  scope: ScopeResult,
): GenerationInput {
  const slopeLabel = (id: string | null): string =>
    id ? (inspection.slopes.find((s) => s.id === id)?.label ?? id) : '';
  const elevLabel = (id: string | null): string =>
    id ? (inspection.elevations.find((e) => e.id === id)?.direction ?? id) : '';

  // Damage: resolve slope/elevation labels for clarity
  const damage = inspection.damageInstances.map((d) => ({
    location: d.slopeId ? `Slope: ${slopeLabel(d.slopeId)}` : `Elevation: ${elevLabel(d.elevationId)}`,
    damageType: d.damageType,
    observedIndicators: d.observedIndicators,
    causationNote: d.causationNote,
  }));

  // Test squares: resolve slope labels + hit counts
  const testSquares = inspection.testSquares.map((ts) => ({
    slopeLabel: slopeLabel(ts.slopeId),
    hitCount: ts.hitCount,
  }));

  // Components: only those with a notable status
  const components = inspection.components.map((c) => ({
    componentType: c.componentType,
    status: c.status,
  }));

  // Products: pass brand/line/unidentifiable only — no ids, no discontinued assertion
  // unless the field is present in the data (currently not in the contract v1 type)
  const products = inspection.products.map((p) => ({
    brand: p.brand,
    line: p.line,
    unidentifiable: p.unidentifiable,
    identificationType: p.identificationType,
  }));

  // Scope: squares, subtotal, line item descriptions + code refs (no unit prices / raw math)
  const scopeInput = {
    squares: scope.squares,
    subtotal: scope.subtotal,
    currency: scope.currency,
    lineItems: scope.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      codeRefs: li.codeRefs,
    })),
  };

  // Code provisions: only those referenced in this scope
  const scopeKeys = new Set(scope.lineItems.flatMap((li) => li.codeRefs));
  const codeProvisions = config.state.codeLibrary
    .filter((c) => scopeKeys.size === 0 || c.appliesTo.some((k) => scopeKeys.has(k)))
    .map((c) => ({ code: c.code, title: c.title, text: c.text }));

  // Storm: compacted for prompt (no raw coordinates or redundant fields)
  const storm = inspection.storm
    ? {
        type: inspection.storm.primaryType,
        date: inspection.storm.confirmedDate,
        magnitude:
          inspection.storm.hailSize != null
            ? `${inspection.storm.hailSize} inches hail`
            : inspection.storm.windSpeed != null
              ? `${inspection.storm.windSpeed} mph wind`
              : null,
        source: inspection.storm.source,
      }
    : null;

  return {
    property: {
      address: inspection.property.address,
      dateOfLoss: inspection.property.dateOfLoss,
      claimNumber: inspection.property.claimNumber,
    },
    storm,
    damage,
    testSquares,
    components,
    products,
    scope: scopeInput,
    codeProvisions,
  };
}

// ── User prompt ───────────────────────────────────────────────────────────────
// Wraps the grounding input in the task instruction. The system prompt carries
// all the constraints; the user prompt delivers the facts and requests output.
export function buildUserPrompt(input: GenerationInput): string {
  return `Compose the three forensic narratives for this roof inspection proof package.
Use ONLY the facts in the JSON below — cite no numbers, dates, or details not present here.

GROUNDING FACTS:
${JSON.stringify(input, null, 2)}

Return a single JSON object matching the required schema: repairability (summary + matchingFactors), \
manufacturer (summary + productStatement), and conclusion (statement + basis array).`;
}
