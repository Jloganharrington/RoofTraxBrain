import { Router } from 'express';
import { getSubmission, setStatus, setPackage } from '../submissions/store.js';
import { resolveConfig } from '../config/resolve.js';
import { assemblePackage } from '../packages/build.js';
import { LocalPackageStore } from '../packages/store.js';
import { HttpPhotoFetcher } from '../integrity/photoFetcher.js';
import { deliverReportToCrm, pendingCrmConfig } from '../crm/ingest.js';
import { env } from '../env.js';

export const packagesRouter: Router = Router();

const store = new LocalPackageStore();

// Build the proof package for a submitted inspection: re-hash photo bytes for
// chain of custody, render the exhibits, store the PDF, flip to package_ready.
// (Runs inline and awaits; a production deploy can wrap this in a job queue —
// the app already polls GET /status, so no client change is needed then.)
packagesRouter.post('/submissions/:id/package', async (req, res) => {
  const sub = await getSubmission(req.params.id);
  if (!sub) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!env.OBJECT_STORAGE_BASE_URL) {
    res.status(503).json({ error: 'object_storage_not_configured' });
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

  await setStatus(sub.id, 'validating');
  const fetcher = new HttpPhotoFetcher(env.OBJECT_STORAGE_BASE_URL);
  const result = await assemblePackage(sub.inspection, config, sub.manifest, fetcher);

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
packagesRouter.get('/submissions/:id/package', async (req, res) => {
  const sub = await getSubmission(req.params.id);
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
