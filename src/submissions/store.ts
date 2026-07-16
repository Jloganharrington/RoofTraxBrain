import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { submissionsTable } from '../db/schema.js';
import type { SubmissionEnvelopeV1, SubmissionStatus } from './types.js';

// Persist a received submission. Idempotent by inspectionId: a re-submit of the
// same inspection replaces the stored envelope (the field app locks the record
// at submit, so a re-send carries identical, verified content).
export async function receiveSubmission(envelope: SubmissionEnvelopeV1): Promise<{ id: string }> {
  const { manifest, inspection } = envelope;

  const existing = await db
    .select({ id: submissionsTable.id })
    .from(submissionsTable)
    .where(eq(submissionsTable.inspectionId, inspection.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(submissionsTable)
      .set({
        companyId: inspection.companyId,
        stateCode: inspection.stateCode,
        protocolVersion: manifest.protocolVersion,
        manifest,
        inspection,
        status: 'received',
      })
      .where(eq(submissionsTable.id, existing[0].id));
    return { id: existing[0].id };
  }

  const inserted = await db
    .insert(submissionsTable)
    .values({
      inspectionId: inspection.id,
      companyId: inspection.companyId,
      stateCode: inspection.stateCode,
      protocolVersion: manifest.protocolVersion,
      manifest,
      inspection,
      status: 'received',
    })
    .returning({ id: submissionsTable.id });

  return { id: inserted[0]!.id };
}

export async function getSubmission(id: string) {
  const rows = await db.select().from(submissionsTable).where(eq(submissionsTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getSubmissionByInspection(inspectionId: string) {
  const rows = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.inspectionId, inspectionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setStatus(id: string, status: SubmissionStatus): Promise<void> {
  await db.update(submissionsTable).set({ status }).where(eq(submissionsTable.id, id));
}

export async function setPackage(
  id: string,
  packageRef: string,
  packageSha256: string,
): Promise<void> {
  await db
    .update(submissionsTable)
    .set({ status: 'package_ready', packageRef, packageSha256, packagedAt: new Date() })
    .where(eq(submissionsTable.id, id));
}
