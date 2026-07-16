import { createHash } from 'node:crypto';
import { buildPackage } from '../pdf/assemble.js';
import { verifyPhotoIntegrity, type IntegrityResult } from '../integrity/verify.js';
import type { PhotoFetcher } from '../integrity/photoFetcher.js';
import type { SubmittedInspection, SubmissionManifestV1 } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';

export type AssembleResult =
  | {
      ok: true;
      bytes: Uint8Array;
      sha256: string;
      integrity: IntegrityResult;
      exhibitLetters: string[];
      pageCount: number;
    }
  | { ok: false; reason: 'integrity_failed'; integrity: IntegrityResult };

// Assemble a package for a submission: FIRST re-hash the actual photo bytes
// against the manifest (chain of custody), then render the exhibits. Integrity
// failure blocks rendering. Pure — no DB/HTTP beyond the injected fetcher — so
// it is fully verifiable with a fixture + mock fetcher.
export async function assemblePackage(
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  manifest: SubmissionManifestV1,
  fetcher: PhotoFetcher,
  opts?: { generatedAt?: Date },
): Promise<AssembleResult> {
  const integrity = await verifyPhotoIntegrity(inspection.photos, manifest.photoHashes, fetcher);
  if (!integrity.ok) {
    return { ok: false, reason: 'integrity_failed', integrity };
  }

  const built = await buildPackage(inspection, config, { generatedAt: opts?.generatedAt });
  const sha256 = createHash('sha256').update(built.bytes).digest('hex');
  return {
    ok: true,
    bytes: built.bytes,
    sha256,
    integrity,
    exhibitLetters: built.exhibitLetters,
    pageCount: built.pageCount,
  };
}
