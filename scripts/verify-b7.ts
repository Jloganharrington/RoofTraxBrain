import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { assemblePackage } from '../src/packages/build.js';
import { MapPhotoFetcher } from '../src/integrity/photoFetcher.js';
import { LocalPackageStore } from '../src/packages/store.js';
import { sampleInspection, sampleConfig } from '../src/pdf/fixtures.js';
import type { SubmissionManifestV1 } from '../src/submissions/types.js';

const sha256Hex = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

async function main(): Promise<void> {
  // Deterministic bytes per photo URL; the manifest's hashes are the REAL
  // sha256 of those bytes, so a correct submission passes integrity.
  const bytesByUrl = new Map<string, Uint8Array>();
  for (const p of sampleInspection.photos) {
    bytesByUrl.set(p.url, new TextEncoder().encode(`bytes-for-${p.id}`));
  }
  const fetcher = new MapPhotoFetcher(bytesByUrl);

  const goodManifest: SubmissionManifestV1 = {
    protocolVersion: 'v1',
    generatedAtUtc: '2026-05-20T15:05:00Z',
    records: { photos: sampleInspection.photos.map((p) => p.id) },
    photoHashes: sampleInspection.photos.map((p) => ({
      photoId: p.id,
      sha256: sha256Hex(bytesByUrl.get(p.url)!),
    })),
    gateResults: { deficiencies: [], softFlags: [] },
    signatureOnFile: { url: sampleInspection.inspector.signatureUrl!, sha256: 'x', signedAt: 'now' },
  };

  // 1. Correct bytes -> integrity passes, package renders.
  const good = await assemblePackage(sampleInspection, sampleConfig, goodManifest, fetcher, {
    generatedAt: new Date('2026-05-20T15:10:00Z'),
  });
  assert.equal(good.ok, true, 'expected integrity to pass for correct hashes');
  if (good.ok) {
    assert.equal(good.integrity.checked, sampleInspection.photos.length, 'all photos checked');
    assert.ok(good.pageCount > 15, 'package rendered with pages');
    assert.equal(good.sha256.length, 64, 'package sha256 present');
    console.log(
      `[verify] PASS integrity+render — ${good.integrity.checked} photos re-hashed, ` +
        `${good.pageCount} pages, exhibits [${good.exhibitLetters.join(', ')}]`,
    );

    // store round-trip
    const store = new LocalPackageStore('out/packages');
    const { ref } = await store.put(sampleInspection.id, good.bytes);
    const back = await store.get(ref);
    assert.ok(back && back.length === good.bytes.length, 'store round-trip preserves bytes');
    console.log(`[verify] PASS store round-trip — ${ref} (${back!.length} bytes)`);
  }

  // 2. Tampered manifest (one hash flipped) -> integrity fails, render blocked.
  const tampered: SubmissionManifestV1 = {
    ...goodManifest,
    photoHashes: goodManifest.photoHashes.map((h, i) =>
      i === 0 ? { ...h, sha256: 'f'.repeat(64) } : h,
    ),
  };
  const bad = await assemblePackage(sampleInspection, sampleConfig, tampered, fetcher);
  assert.equal(bad.ok, false, 'expected integrity to FAIL for a tampered hash');
  if (!bad.ok) {
    assert.equal(bad.reason, 'integrity_failed');
    assert.ok(
      bad.integrity.mismatches.some((m) => m.reason === 'hash_mismatch'),
      'expected a hash_mismatch',
    );
    console.log(
      `[verify] PASS tamper-rejected — ${bad.integrity.mismatches.length} mismatch(es): ` +
        bad.integrity.mismatches.map((m) => `${m.photoId}:${m.reason}`).join(', '),
    );
  }

  // 3. Missing photo bytes -> fetch_failed.
  const emptyFetcher = new MapPhotoFetcher(new Map());
  const missing = await assemblePackage(sampleInspection, sampleConfig, goodManifest, emptyFetcher);
  assert.equal(missing.ok, false, 'expected integrity to fail when bytes are unfetchable');
  if (!missing.ok) {
    assert.ok(missing.integrity.mismatches.every((m) => m.reason === 'fetch_failed'));
    console.log(`[verify] PASS unfetchable-rejected — ${missing.integrity.mismatches.length} fetch_failed`);
  }

  console.log('[verify] ALL B7 CHECKS PASSED');
}

main().catch((err) => {
  console.error('[verify] FAILED:', err);
  process.exit(1);
});
