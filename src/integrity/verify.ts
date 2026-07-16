import { createHash } from 'node:crypto';
import type { PhotoFetcher } from './photoFetcher.js';
import type { SubmittedPhoto, SubmissionManifestV1 } from '../submissions/types.js';

export interface IntegrityMismatch {
  photoId: string;
  reason: 'photo_not_in_submission' | 'fetch_failed' | 'hash_mismatch';
  detail?: string;
}

export interface IntegrityResult {
  ok: boolean;
  checked: number;
  mismatches: IntegrityMismatch[];
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// The chain-of-custody check the Brain owes (M-F carryover). Intake trusted the
// field app's server-verified hashes; the Brain independently re-hashes the
// ACTUAL bytes from object storage and compares to the manifest. Any mismatch,
// missing photo, or unfetchable object fails integrity and blocks rendering.
export async function verifyPhotoIntegrity(
  photos: SubmittedPhoto[],
  expected: SubmissionManifestV1['photoHashes'],
  fetcher: PhotoFetcher,
): Promise<IntegrityResult> {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const mismatches: IntegrityMismatch[] = [];
  let checked = 0;

  for (const { photoId, sha256 } of expected) {
    const photo = byId.get(photoId);
    if (!photo) {
      mismatches.push({ photoId, reason: 'photo_not_in_submission' });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await fetcher.fetch(photo.url);
    } catch (err) {
      mismatches.push({ photoId, reason: 'fetch_failed', detail: (err as Error).message });
      continue;
    }
    checked += 1;
    if (sha256Hex(bytes).toLowerCase() !== sha256.toLowerCase()) {
      mismatches.push({ photoId, reason: 'hash_mismatch' });
    }
  }

  return { ok: mismatches.length === 0, checked, mismatches };
}
