// generateNarratives — load-or-generate + guard + store.
// This is the only file that touches the DB for AI state.
import { computeScope } from '../scope/compute.js';
import { getSubmission, setAiNarratives } from '../submissions/store.js';
import { buildGenerationInput } from './prompt.js';
import { GeminiGenerator, GeminiGenerationError } from './gemini.js';
import { parseNarratives } from './schema.js';
import { runGuard } from './guard.js';
import { env } from '../env.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import type { ForensicNarratives } from './types.js';

export { GeminiGenerationError };

export interface GenerateResult {
  narratives: ForensicNarratives;
  fromCache: boolean;
  model: string;
}

// Fixed mock narratives for offline verification (npm run sample, unit tests).
// The mock is pure — no API call, no network.
export const MOCK_NARRATIVES: ForensicNarratives = {
  repairability: {
    summary:
      'The documented hail impacts across both roof slopes exhibit patterns consistent with the ' +
      'storm of record. Multiple test-square measurements confirm impact density exceeding the ' +
      'threshold for functional damage on the existing shingle system. Uniform repair of the ' +
      'affected areas is not achievable because the documented damage spans both primary slopes ' +
      'and the existing product line cannot be matched to the installed material.',
    matchingFactors: [
      'Impact density confirmed via test-square counts on both primary slopes',
      'Granule displacement and mat exposure documented across front and back slopes',
      'Soft-metal spatter on aluminum gutters corroborates storm magnitude and direction',
      'Product identification on file; matching uniformity assessed against field findings',
    ],
  },
  manufacturer: {
    summary:
      'The roofing product identified at the property was documented by field identification ' +
      'during the inspection. Manufacturer installation requirements and product continuity ' +
      'are relevant to the matching and uniformity analysis.',
    productStatement:
      'Product identified as GAF Timberline HDZ asphalt shingle via field identification.',
  },
  conclusion: {
    statement:
      'Based on the physical findings documented during the inspection on the date of loss, ' +
      'including storm-event verification, test-square hit counts, and measured damage indicators, ' +
      'the roof system requires full-slope replacement to restore code-compliant and reasonably ' +
      'uniform conditions. This conclusion is the contractor\'s professional assessment of the ' +
      'physical condition observed — it is not a coverage determination.',
    basis: [
      'Storm of record confirmed: hail event on the documented date of loss',
      'Test-square counts exceed functional-damage threshold on both primary slopes',
      'Granule displacement and mat exposure documented across multiple damage instances',
      'Product identification and matching assessment per field findings',
      'Scope of work computed from field measurements at contractor incurred cost',
    ],
  },
};

// Generate narratives for a submission, using cached value when available.
// Pass regenerate: true to force a new Gemini call (human-initiated only).
export async function generateNarratives(
  subId: string,
  config: ResolvedConfig,
  opts?: { regenerate?: boolean; mock?: boolean },
): Promise<GenerateResult> {
  const sub = await getSubmission(subId);
  if (!sub) throw new Error(`submission not found: ${subId}`);

  // Offline mock path — used by npm run sample and tests
  if (opts?.mock) {
    return { narratives: MOCK_NARRATIVES, fromCache: false, model: 'mock' };
  }

  // Return cached narratives unless forced regeneration
  if (sub.aiNarratives && !opts?.regenerate) {
    try {
      const cached = parseNarratives(sub.aiNarratives);
      return { narratives: cached, fromCache: true, model: sub.aiModel ?? 'unknown' };
    } catch {
      // Cached value failed schema validation — fall through to regenerate
      console.warn('[ai] cached narratives failed schema validation; regenerating');
    }
  }

  if (!env.GEMINI_API_KEY) {
    throw new GeminiGenerationError('GEMINI_API_KEY is not configured');
  }

  const scope = computeScope(sub.inspection as Parameters<typeof computeScope>[0], config);
  const input = buildGenerationInput(
    sub.inspection as Parameters<typeof buildGenerationInput>[0],
    config,
    scope,
  );

  const generator = new GeminiGenerator();
  const narratives = await generator.generate(input);

  // Verify guard passes on final output (belt-and-suspenders)
  const guard = runGuard(narratives, input);
  if (!guard.ok) {
    throw new GeminiGenerationError(
      'Generated narratives failed guard after all retries',
      guard.violations,
    );
  }

  // Store for deterministic rebuilds
  await setAiNarratives(subId, narratives, env.GEMINI_MODEL);

  return { narratives, fromCache: false, model: env.GEMINI_MODEL };
}
