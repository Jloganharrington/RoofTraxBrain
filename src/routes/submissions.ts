import { Router } from 'express';
import { parseEnvelope } from '../submissions/validate.js';
import { receiveSubmission, getSubmission } from '../submissions/store.js';
import { getCompany, getStateConfig } from '../config/resolve.js';
import { requireMachineToken } from '../auth/machine.js';
import { requireAdminOrMachine } from '../auth/session.js';

export const submissionsRouter: Router = Router();

// Intake — the field app couriers a contract-v1 envelope here.
// Machine realm only: the mobile api-server sends Authorization: Bearer $BRAIN_API_TOKEN.
// (Byte-level photo re-hash against object storage is a hardening step wired in
// B7; intake trusts the field app's server-verified hashes for B0–B5.)
submissionsRouter.post('/submissions', requireMachineToken, async (req, res) => {
  const parsed = parseEnvelope(req.body);
  if (!parsed.ok) {
    res.status(422).json({ error: 'invalid_envelope', detail: parsed.error });
    return;
  }
  const { inspection } = parsed.value;

  // Tenant + jurisdiction must be known to the Brain (registry check).
  const company = await getCompany(inspection.companyId);
  if (!company) {
    res.status(409).json({ error: 'unknown_company', companyId: inspection.companyId });
    return;
  }
  const stateConfig = await getStateConfig(inspection.stateCode);
  if (!stateConfig) {
    res.status(409).json({ error: 'unknown_state', stateCode: inspection.stateCode });
    return;
  }
  // A state's PACKAGE (the rendered legal document, citing its homeowner-rights/
  // UPPA content) is not go-live until counsel review — that gate lives at
  // POST /package and stays absolute. Storing the field-captured submission
  // itself carries no legal claim and must never be blocked on the same check:
  // this used to short-circuit here with a 2xx "warning" response and skip
  // receiveSubmission() entirely, so the courier reported successful delivery
  // while the data was silently discarded. Always persist; just tell the
  // caller whether package generation is currently available.
  const { id } = await receiveSubmission(parsed.value);
  res.status(201).json({
    id,
    status: 'received',
    packageBlockedReason: stateConfig.reviewedAt ? null : 'state_not_reviewed',
  });
});

// Status / receipt — the app polls this after submitting.
submissionsRouter.get('/submissions/:id/status', requireAdminOrMachine, async (req, res) => {
  const sub = await getSubmission(req.params.id as string);
  if (!sub) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({
    id: sub.id,
    inspectionId: sub.inspectionId,
    status: sub.status,
    receipt: {
      recordCount: Object.values(sub.manifest.records).reduce((n, ids) => n + ids.length, 0),
      verifiedPhotoCount: sub.manifest.photoHashes.length,
      packageRef: sub.packageRef,
      isStub: sub.status !== 'package_ready',
    },
  });
});
