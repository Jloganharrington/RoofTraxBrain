import { z } from 'zod';
import type { SubmissionEnvelopeV1 } from './types.js';

// Pragmatic structural validation of the contract-v1 envelope. Validates the
// package-identity fields and the manifest shape strictly; nested capture
// arrays are shape-checked loosely (they were already validated + gated by the
// field app's intake before submission). Rejects malformed envelopes early.

const photoHash = z.object({ photoId: z.string(), sha256: z.string() });

const manifest = z.object({
  protocolVersion: z.string().min(1),
  generatedAtUtc: z.string().min(1),
  records: z.record(z.array(z.string())),
  photoHashes: z.array(photoHash),
  gateResults: z.object({
    deficiencies: z.array(z.unknown()),
    softFlags: z.array(z.unknown()),
  }),
  signatureOnFile: z
    .object({ url: z.string(), sha256: z.string(), signedAt: z.string() })
    .nullable(),
});

const inspection = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    stateCode: z.string().min(2),
    property: z.object({ address: z.string().min(1) }).passthrough(),
    photos: z.array(z.object({ id: z.string(), sha256: z.string() }).passthrough()),
  })
  .passthrough();

export const envelopeSchema = z.object({ manifest, inspection });

export function parseEnvelope(body: unknown):
  | { ok: true; value: SubmissionEnvelopeV1 }
  | { ok: false; error: string } {
  const res = envelopeSchema.safeParse(body);
  if (!res.success) {
    return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  // Structural validation passed; the fuller SubmittedInspection shape is trusted
  // (already gated by the field app). Cast through unknown to the contract type.
  return { ok: true, value: res.data as unknown as SubmissionEnvelopeV1 };
}
