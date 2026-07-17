import { z } from 'zod';

// ── Gemini responseSchema ─────────────────────────────────────────────────────
// Matches the ForensicNarratives interface. Gemini uses JSON-Schema-style objects
// for responseSchema; we use plain string type identifiers that the SDK accepts.

export const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    repairability: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        matchingFactors: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'matchingFactors'],
    },
    manufacturer: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        productStatement: { type: 'string' },
      },
      required: ['summary', 'productStatement'],
    },
    conclusion: {
      type: 'object',
      properties: {
        statement: { type: 'string' },
        basis: { type: 'array', items: { type: 'string' } },
      },
      required: ['statement', 'basis'],
    },
  },
  required: ['repairability', 'manufacturer', 'conclusion'],
};

// ── Zod validator ─────────────────────────────────────────────────────────────
// Applied after JSON.parse to reject schema misses before the guard runs.

export const narrativesSchema = z.object({
  repairability: z.object({
    summary: z.string().min(1),
    matchingFactors: z.array(z.string()).min(1),
  }),
  manufacturer: z.object({
    summary: z.string().min(1),
    productStatement: z.string().min(1),
  }),
  conclusion: z.object({
    statement: z.string().min(1),
    basis: z.array(z.string()).min(1),
  }),
});

export type ValidatedNarratives = z.infer<typeof narrativesSchema>;

export function parseNarratives(raw: unknown) {
  return narrativesSchema.parse(raw);
}
