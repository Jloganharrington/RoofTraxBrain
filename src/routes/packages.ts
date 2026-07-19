import { Router } from 'express';
import { getSubmission, setStatus, setPackage } from '../submissions/store.js';
import { resolveConfig } from '../config/resolve.js';
import { assemblePackage } from '../packages/build.js';
import { LocalPackageStore } from '../packages/store.js';
import { HttpPhotoFetcher } from '../integrity/photoFetcher.js';
import { deliverReportToCrm, pendingCrmConfig } from '../crm/ingest.js';
import { resolveStormOfRecord, toStormBlock } from '../weather/noaa/query.js';
import { generateNarratives } from '../ai/generate.js';
import { GeminiGenerationError } from '../ai/gemini.js';
import { requireAdminOrMachine } from '../auth/session.js';
import { buildReportData } from '../report/build.js';
import type { SubmittedInspection } from '../submissions/types.js';
import type { ForensicNarratives } from '../ai/types.js';
import { env } from '../env.js';

// Phase-2 authoritative upgrade: if the ingested NOAA Storm Events corpus has a
// qualifying storm of record for this property + date of loss, overlay it onto
// the inspection's storm block (which otherwise holds the Phase-1 VisualCrossing
// event). Best-effort: any failure (empty corpus, no coordinates, DB down) falls
// back to the submitted storm so the package never fails on this account.
async function withAuthoritativeStorm(
  inspection: SubmittedInspection,
  stateCode: string,
): Promise<SubmittedInspection> {
  try {
    const dateOfLoss = inspection.property.dateOfLoss;
    if (!dateOfLoss) return inspection;
    const geo = inspection.photos.find((p) => p.gpsLat != null && p.gpsLng != null);
    const resolved = await resolveStormOfRecord({
      lat: geo?.gpsLat ?? null,
      lng: geo?.gpsLng ?? null,
      dateOfLoss,
      state: stateCode,
    });
    if (!resolved) return inspection;
    return { ...inspection, storm: toStormBlock(resolved) };
  } catch {
    return inspection; // never block a package on the enrichment lookup
  }
}

// Fetch signature image bytes — best-effort; failure → exhibit M renders text fallback.
async function fetchSignatureBytes(
  fetcher: HttpPhotoFetcher,
  signatureUrl: string | null,
): Promise<Uint8Array | null> {
  if (!signatureUrl) return null;
  try {
    return await fetcher.fetch(signatureUrl);
  } catch {
    return null;
  }
}

export const packagesRouter: Router = Router();

const store = new LocalPackageStore();

// Build the proof package for a submitted inspection: generate AI narratives
// (B6), re-hash photo bytes for chain of custody, render all exhibits A–M,
// store the PDF, flip to package_ready.
// (Runs inline and awaits; a production deploy can wrap this in a job queue —
// the app already polls GET /status, so no client change is needed then.)
packagesRouter.post('/submissions/:id/package', requireAdminOrMachine, async (req, res) => {
  const sub = await getSubmission(req.params.id as string);
  if (!sub) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!env.OBJECT_STORAGE_BASE_URL) {
    res.status(503).json({ error: 'object_storage_not_configured' });
    return;
  }
  if (!env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'gemini_not_configured', detail: 'Set GEMINI_API_KEY to enable AI exhibit generation.' });
    return;
  }

  let config;
  try {
    config = await resolveConfig(sub.companyId, sub.stateCode);
  } catch (err) {
    // state not counsel-reviewed (not go-live)
    res.status(409).json({ error: 'state_not_go_live', detail: (err as Error).message });
    return;
  }
  if (!config) {
    res.status(409).json({ error: 'config_unresolved', detail: 'missing company or state pack' });
    return;
  }

  // B6 — generate AI narratives before assembly (load-or-generate + guard + store)
  const regenerate = req.query['regenerate'] === 'true';
  await setStatus(sub.id, 'generating');

  let narratives;
  try {
    const result = await generateNarratives(sub.id, config, { regenerate });
    narratives = result.narratives;
    console.log(
      `[ai] narratives ${result.fromCache ? 'loaded from cache' : 'generated'} via ${result.model}`,
    );
  } catch (err) {
    await setStatus(sub.id, 'generation_failed');
    const violations = err instanceof GeminiGenerationError ? err.violations : [];
    res.status(422).json({
      error: 'generation_failed',
      detail: (err as Error).message,
      violations,
    });
    return;
  }

  await setStatus(sub.id, 'validating');
  const fetcher = new HttpPhotoFetcher(env.OBJECT_STORAGE_BASE_URL, env.BRAIN_API_TOKEN);
  const inspection = await withAuthoritativeStorm(sub.inspection, sub.stateCode);

  // Fetch inspector signature image bytes (best-effort for Exhibit M)
  const signatureUrl =
    sub.manifest.signatureOnFile?.url ?? inspection.inspector.signatureUrl ?? null;
  const signatureImageBytes = await fetchSignatureBytes(fetcher, signatureUrl);

  const result = await assemblePackage(inspection, config, sub.manifest, fetcher, {
    narratives,
    signatureImageBytes,
  });

  if (!result.ok) {
    await setStatus(sub.id, 'rejected');
    res.status(422).json({ error: 'integrity_failed', mismatches: result.integrity.mismatches });
    return;
  }

  const { ref } = await store.put(sub.inspectionId, result.bytes);
  await setPackage(sub.id, ref, result.sha256);

  const crm = await deliverReportToCrm(pendingCrmConfig(), {
    inspectionId: sub.inspectionId,
    companyId: sub.companyId,
    claimNumber: sub.inspection.property.claimNumber,
    packageRef: ref,
    packageSha256: result.sha256,
    exhibitLetters: result.exhibitLetters,
    generatedAtUtc: new Date().toISOString(),
  });

  res.status(200).json({
    id: sub.id,
    status: 'package_ready',
    packageSha256: result.sha256,
    pageCount: result.pageCount,
    exhibits: result.exhibitLetters,
    integrity: { checked: result.integrity.checked, ok: true },
    crm: { status: crm.status, delivered: crm.delivered },
  });
});

// Download the rendered package PDF.
packagesRouter.get('/submissions/:id/package', requireAdminOrMachine, async (req, res) => {
  const sub = await getSubmission(req.params.id as string);
  if (!sub) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!sub.packageRef) {
    res.status(409).json({ error: 'not_ready', status: sub.status });
    return;
  }
  const bytes = await store.get(sub.packageRef);
  if (!bytes) {
    res.status(410).json({ error: 'package_gone' });
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="proof-package-${sub.inspectionId}.pdf"`);
  res.send(Buffer.from(bytes));
});

// REPORT_DATA v2 — the JSON contract consumed by the Phase 2 proof-package HTML
// template. Deliberately does NOT require GEMINI_API_KEY: narratives are used if
// they were already generated and cached, but the structural data must be
// viewable (and the template developable) without the AI pipeline configured.
// Only the AI-authored narrative fields go null when narratives are absent.
packagesRouter.get('/submissions/:id/report-data', requireAdminOrMachine, async (req, res) => {
  const sub = await getSubmission(req.params.id as string);
  if (!sub) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  let config;
  try {
    // DATA INSPECTION path: allowed to resolve a state whose legal content has
    // not yet been counsel-reviewed, so the team can see what a submission
    // produced before go-live. The rendered-package path above does NOT pass
    // this and still hard-blocks. The response is stamped below so an
    // unreviewed payload can never be mistaken for a go-live one.
    config = await resolveConfig(sub.companyId, sub.stateCode, {
      allowUnreviewedState: true,
    });
  } catch (err) {
    res.status(409).json({ error: 'state_not_go_live', detail: (err as Error).message });
    return;
  }
  if (!config) {
    res.status(409).json({ error: 'config_unresolved', detail: 'missing company or state pack' });
    return;
  }

  const data = buildReportData(sub.inspection, config, {
    ai: (sub.aiNarratives as ForensicNarratives | null) ?? null,
    // Grounds the methodology enforcement evidence in what intake actually
    // verified, rather than asserting enforcement unquantified.
    manifest: sub.manifest,
  });

  // Surface incompleteness in the response envelope too, so a consumer that
  // ignores `missingInputs` still has a reason to look. A thin package must
  // never look identical to a complete one.
  const stateGoLive = config.stateReviewedAt != null;
  res.json({
    reportData: data,
    complete: data.missingInputs.length === 0,
    // Loud, structural marker: this payload is for inspection only until the
    // state's legal content clears counsel review.
    goLive: stateGoLive,
    ...(stateGoLive
      ? {}
      : {
          notGoLiveWarning:
            `State ${sub.stateCode} has not been counsel-reviewed. This data is for ` +
            'inspection only and MUST NOT be rendered or delivered as a proof package.',
        }),
  });
});
