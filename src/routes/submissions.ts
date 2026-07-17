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
  if (!stateConfig.reviewedAt) {
    // A state is not go-live until its pack (code library / rights / disclaimer)
    // has been counsel-reviewed. Accept the submission but flag it.
    res.status(202).json({
      warning: 'state_not_reviewed',
      detail: `State ${inspection.stateCode} config has not been counsel-reviewed; package generation is blocked until review.`,
    });
    return;
  }

  const { id } = await receiveSubmission(parsed.value);
  res.status(201).json({ id, status: 'received' });
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
