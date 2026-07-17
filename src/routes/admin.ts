import { Router } from 'express';
import { db, schema } from '../db/client.js';
import { pingDb } from '../db/client.js';
import { desc, count, sql } from 'drizzle-orm';

export const adminRouter: Router = Router();

// ── Health ────────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/health', async (_req, res) => {
  let dbOk = false;
  try { dbOk = await pingDb(); } catch { /* ignore */ }
  res.json({ ok: dbOk, service: 'rooftrax-brain', db: dbOk, ts: new Date().toISOString() });
});

// ── Companies ─────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/companies', async (_req, res) => {
  const rows = await db
    .select({
      id: schema.companiesTable.id,
      name: schema.companiesTable.name,
      createdAt: schema.companiesTable.createdAt,
      pack: schema.companyConfigTable.pack,
      configUpdatedAt: schema.companyConfigTable.updatedAt,
    })
    .from(schema.companiesTable)
    .leftJoin(
      schema.companyConfigTable,
      sql`${schema.companyConfigTable.companyId} = ${schema.companiesTable.id}`,
    )
    .orderBy(schema.companiesTable.name);
  res.json(rows);
});

// ── States ────────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/states', async (_req, res) => {
  const rows = await db
    .select({
      code: schema.statesTable.code,
      name: schema.statesTable.name,
      reviewedAt: schema.stateConfigTable.reviewedAt,
      configUpdatedAt: schema.stateConfigTable.updatedAt,
      pack: schema.stateConfigTable.pack,
    })
    .from(schema.statesTable)
    .leftJoin(
      schema.stateConfigTable,
      sql`${schema.stateConfigTable.stateCode} = ${schema.statesTable.code}`,
    )
    .orderBy(schema.statesTable.name);
  res.json(rows);
});

// Set a state go-live (stamp reviewedAt = now)
adminRouter.post('/api/admin/states/:code/go-live', async (req, res) => {
  const { code } = req.params;
  await db
    .update(schema.stateConfigTable)
    .set({ reviewedAt: new Date(), updatedAt: new Date() })
    .where(sql`${schema.stateConfigTable.stateCode} = ${code}`);
  res.json({ ok: true, code, reviewedAt: new Date().toISOString() });
});

// Clear a state's go-live stamp
adminRouter.delete('/api/admin/states/:code/go-live', async (req, res) => {
  const { code } = req.params;
  await db
    .update(schema.stateConfigTable)
    .set({ reviewedAt: null, updatedAt: new Date() })
    .where(sql`${schema.stateConfigTable.stateCode} = ${code}`);
  res.json({ ok: true, code, reviewedAt: null });
});

// ── Submissions ───────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/submissions', async (_req, res) => {
  const rows = await db
    .select({
      id: schema.submissionsTable.id,
      inspectionId: schema.submissionsTable.inspectionId,
      companyId: schema.submissionsTable.companyId,
      stateCode: schema.submissionsTable.stateCode,
      status: schema.submissionsTable.status,
      protocolVersion: schema.submissionsTable.protocolVersion,
      packageRef: schema.submissionsTable.packageRef,
      packageSha256: schema.submissionsTable.packageSha256,
      receivedAt: schema.submissionsTable.receivedAt,
      packagedAt: schema.submissionsTable.packagedAt,
    })
    .from(schema.submissionsTable)
    .orderBy(desc(schema.submissionsTable.receivedAt))
    .limit(50);

  // Status counts
  const counts = await db
    .select({ status: schema.submissionsTable.status, n: count() })
    .from(schema.submissionsTable)
    .groupBy(schema.submissionsTable.status);

  res.json({ rows, counts });
});

// ── NOAA ──────────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/noaa', async (_req, res) => {
  const coverage = await db
    .select()
    .from(schema.countyCoverageTable)
    .orderBy(schema.countyCoverageTable.stateAbbr, schema.countyCoverageTable.countyName);

  const runs = await db
    .select()
    .from(schema.noaaIngestRunsTable)
    .orderBy(desc(schema.noaaIngestRunsTable.startedAt))
    .limit(10);

  const eventCount = await db
    .select({ n: count() })
    .from(schema.stormEventsTable);

  res.json({ coverage, runs, eventCount: eventCount[0]?.n ?? 0 });
});
