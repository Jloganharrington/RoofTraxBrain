import { Router } from 'express';
import { db, schema } from '../db/client.js';
import { pingDb } from '../db/client.js';
import { desc, asc, count, eq, and, sql } from 'drizzle-orm';
import { env } from '../env.js';
import { isSubscriptionTier, isPaymentStatus, TIER_PRICING } from '../billing/types.js';
import { isDocumentKind, isDocumentScope } from '../documents/types.js';

export const adminRouter: Router = Router();

// ── Health ────────────────────────────────────────────────────────────────────

adminRouter.get('/api/admin/health', async (_req, res) => {
  let dbOk = false;
  try { dbOk = await pingDb(); } catch { /* ignore */ }
  res.json({ ok: dbOk, service: 'rooftrax-brain', db: dbOk, ts: new Date().toISOString() });
});

// ── Companies ─────────────────────────────────────────────────────────────────
// One grouped rollup (not N+1) gives every company its month-to-date and
// year-to-date volume. Two different numbers are exposed deliberately:
//   • submissions  — envelopes received
//   • reports      — packages that actually reached package_ready (the BILLABLE
//                    event, since pricing is per report). A submission that fails
//                    or is rejected never becomes a billable report.

adminRouter.get('/api/admin/companies', async (_req, res) => {
  const companies = await db
    .select({
      id: schema.companiesTable.id,
      name: schema.companiesTable.name,
      createdAt: schema.companiesTable.createdAt,
      pack: schema.companyConfigTable.pack,
      configUpdatedAt: schema.companyConfigTable.updatedAt,
      tier: schema.subscriptionsTable.tier,
      paymentStatus: schema.subscriptionsTable.status,
      currentPeriodEnd: schema.subscriptionsTable.currentPeriodEnd,
    })
    .from(schema.companiesTable)
    .leftJoin(
      schema.companyConfigTable,
      eq(schema.companyConfigTable.companyId, schema.companiesTable.id),
    )
    .leftJoin(
      schema.subscriptionsTable,
      eq(schema.subscriptionsTable.companyId, schema.companiesTable.id),
    )
    .orderBy(asc(schema.companiesTable.name));

  const s = schema.submissionsTable;
  const stats = await db
    .select({
      companyId: s.companyId,
      mtdSubmissions: sql<number>`count(*) filter (where ${s.receivedAt} >= date_trunc('month', now()))`,
      ytdSubmissions: sql<number>`count(*) filter (where ${s.receivedAt} >= date_trunc('year', now()))`,
      mtdReports: sql<number>`count(*) filter (where ${s.status} = 'package_ready' and ${s.packagedAt} >= date_trunc('month', now()))`,
      ytdReports: sql<number>`count(*) filter (where ${s.status} = 'package_ready' and ${s.packagedAt} >= date_trunc('year', now()))`,
    })
    .from(s)
    .groupBy(s.companyId);

  const byCompany = new Map(stats.map((r) => [r.companyId, r]));
  const rows = companies.map((c) => {
    const st = byCompany.get(c.id);
    const tier = c.tier ?? 'payg';
    const mtdReports = Number(st?.mtdReports ?? 0);
    return {
      ...c,
      tier,
      paymentStatus: c.paymentStatus ?? 'none',
      mtdSubmissions: Number(st?.mtdSubmissions ?? 0),
      ytdSubmissions: Number(st?.ytdSubmissions ?? 0),
      mtdReports,
      ytdReports: Number(st?.ytdReports ?? 0),
      // Indicative month-to-date charge at the published rates, for the ops view.
      mtdCharge: TIER_PRICING[tier].base + mtdReports * TIER_PRICING[tier].perReport,
    };
  });

  res.json(rows);
});

// Set a company's subscription tier / payment status.
// Manual for now; once Stripe webhooks land, Stripe owns these fields and this
// becomes an override/repair path rather than the primary writer.
adminRouter.put('/api/admin/companies/:id/subscription', async (req, res) => {
  const id = req.params['id'] as string;
  const { tier, status } = (req.body ?? {}) as { tier?: unknown; status?: unknown };
  if (!isSubscriptionTier(tier) || !isPaymentStatus(status)) {
    res.status(400).json({ error: 'invalid_subscription', detail: 'Unknown tier or status.' });
    return;
  }
  const exists = await db
    .select({ id: schema.companiesTable.id })
    .from(schema.companiesTable)
    .where(eq(schema.companiesTable.id, id))
    .limit(1);
  if (exists.length === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  await db
    .insert(schema.subscriptionsTable)
    .values({ companyId: id, tier, status, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.subscriptionsTable.companyId,
      set: { tier, status, updatedAt: new Date() },
    });
  res.json({ ok: true, companyId: id, tier, status });
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
      eq(schema.stateConfigTable.stateCode, schema.statesTable.code),
    )
    .orderBy(asc(schema.statesTable.name));
  res.json(rows);
});

// Set a state go-live (stamp reviewedAt = now)
adminRouter.post('/api/admin/states/:code/go-live', async (req, res) => {
  const code = req.params['code'] as string;
  await db
    .update(schema.stateConfigTable)
    .set({ reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.stateConfigTable.stateCode, code));
  res.json({ ok: true, code, reviewedAt: new Date().toISOString() });
});

// Clear a state's go-live stamp
adminRouter.delete('/api/admin/states/:code/go-live', async (req, res) => {
  const code = req.params['code'] as string;
  await db
    .update(schema.stateConfigTable)
    .set({ reviewedAt: null, updatedAt: new Date() })
    .where(eq(schema.stateConfigTable.stateCode, code));
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
      aiModel: schema.submissionsTable.aiModel,
    })
    .from(schema.submissionsTable)
    .orderBy(desc(schema.submissionsTable.receivedAt))
    .limit(50);

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
    .orderBy(asc(schema.countyCoverageTable.stateAbbr), asc(schema.countyCoverageTable.countyName));

  const runs = await db
    .select()
    .from(schema.noaaIngestRunsTable)
    .orderBy(desc(schema.noaaIngestRunsTable.startedAt))
    .limit(10);

  const eventCount = await db.select({ n: count() }).from(schema.stormEventsTable);

  res.json({ coverage, runs, eventCount: Number(eventCount[0]?.n ?? 0) });
});

// ── Documents ─────────────────────────────────────────────────────────────────
// Versioned rendering config. Exactly one row per (kind,key,scope,scopeRef) is
// active; activating a version deactivates its siblings, so history is preserved
// and rollback is just re-activating an older row.

adminRouter.get('/api/admin/documents', async (_req, res) => {
  const rows = await db
    .select({
      id: schema.documentsTable.id,
      kind: schema.documentsTable.kind,
      scope: schema.documentsTable.scope,
      scopeRef: schema.documentsTable.scopeRef,
      key: schema.documentsTable.key,
      name: schema.documentsTable.name,
      version: schema.documentsTable.version,
      contentType: schema.documentsTable.contentType,
      active: schema.documentsTable.active,
      notes: schema.documentsTable.notes,
      updatedAt: schema.documentsTable.updatedAt,
    })
    .from(schema.documentsTable)
    .orderBy(
      asc(schema.documentsTable.kind),
      asc(schema.documentsTable.key),
      desc(schema.documentsTable.version),
    );
  res.json(rows);
});

// Full document incl. body (separate from the list so the table stays light).
adminRouter.get('/api/admin/documents/:id', async (req, res) => {
  const id = req.params['id'] as string;
  const rows = await db
    .select()
    .from(schema.documentsTable)
    .where(eq(schema.documentsTable.id, id))
    .limit(1);
  const doc = rows[0];
  if (!doc) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(doc);
});

// Create a new version of a document (or the first one). Never mutates an
// existing version in place — an edit always produces a new version, so the
// rendered history of any package stays reconstructible.
adminRouter.post('/api/admin/documents', async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const { kind, scope, key, name } = b;
  if (!isDocumentKind(kind) || !isDocumentScope(scope)) {
    res.status(400).json({ error: 'invalid_document', detail: 'Unknown kind or scope.' });
    return;
  }
  if (typeof key !== 'string' || !key.trim() || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'invalid_document', detail: 'key and name are required.' });
    return;
  }
  const scopeRef = typeof b['scopeRef'] === 'string' && b['scopeRef'] ? b['scopeRef'] : null;
  const body = typeof b['body'] === 'string' ? b['body'] : null;
  const contentType = typeof b['contentType'] === 'string' ? b['contentType'] : 'text/html';
  const notes = typeof b['notes'] === 'string' ? b['notes'] : null;
  const activate = b['activate'] === true;

  const prior = await db
    .select({ version: schema.documentsTable.version })
    .from(schema.documentsTable)
    .where(
      and(
        eq(schema.documentsTable.kind, kind),
        eq(schema.documentsTable.key, key),
        eq(schema.documentsTable.scope, scope),
        scopeRef
          ? eq(schema.documentsTable.scopeRef, scopeRef)
          : sql`${schema.documentsTable.scopeRef} is null`,
      ),
    )
    .orderBy(desc(schema.documentsTable.version))
    .limit(1);
  const version = (prior[0]?.version ?? 0) + 1;

  const inserted = await db
    .insert(schema.documentsTable)
    .values({ kind, scope, scopeRef, key, name, version, contentType, body, notes, active: false })
    .returning({ id: schema.documentsTable.id });

  const id = inserted[0]?.id;
  if (activate && id) await activateDocument(id);
  res.status(201).json({ ok: true, id, version });
});

// Activate a version — deactivates every sibling in the same logical document.
async function activateDocument(id: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.documentsTable)
    .where(eq(schema.documentsTable.id, id))
    .limit(1);
  const doc = rows[0];
  if (!doc) return false;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.documentsTable)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.documentsTable.kind, doc.kind),
          eq(schema.documentsTable.key, doc.key),
          eq(schema.documentsTable.scope, doc.scope),
          doc.scopeRef
            ? eq(schema.documentsTable.scopeRef, doc.scopeRef)
            : sql`${schema.documentsTable.scopeRef} is null`,
        ),
      );
    await tx
      .update(schema.documentsTable)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(schema.documentsTable.id, doc.id));
  });
  return true;
}

adminRouter.post('/api/admin/documents/:id/activate', async (req, res) => {
  const ok = await activateDocument(req.params['id'] as string);
  if (!ok) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ ok: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────
// Read-only operational view. Secret VALUES are never returned — only whether
// each is configured. (Never print, echo, log, or transmit .env contents.)

adminRouter.get('/api/admin/settings', async (_req, res) => {
  const isSet = (v: string): boolean => Boolean(v && v.trim());
  res.json({
    ai: {
      model: env.GEMINI_MODEL,
      temperature: env.GEMINI_TEMPERATURE,
      maxRetries: env.AI_MAX_RETRIES,
      gatewayMode: isSet(env.GEMINI_BASE_URL) ? 'replit_managed' : 'direct_google',
    },
    service: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
    },
    // Presence only — never values.
    secrets: {
      DATABASE_URL: isSet(env.DATABASE_URL),
      GEMINI_API_KEY: isSet(env.GEMINI_API_KEY),
      GEMINI_BASE_URL: isSet(env.GEMINI_BASE_URL),
      OBJECT_STORAGE_BASE_URL: isSet(env.OBJECT_STORAGE_BASE_URL),
      VISUALCROSSING_API_KEY: isSet(env.VISUALCROSSING_API_KEY),
      BRAIN_API_TOKEN: isSet(env.BRAIN_API_TOKEN),
      ADMIN_USERNAME: isSet(env.ADMIN_USERNAME),
      ADMIN_PASSWORD: isSet(env.ADMIN_PASSWORD_HASH) || isSet(env.ADMIN_PASSWORD),
      SESSION_SECRET: isSet(env.SESSION_SECRET),
    },
    pricing: TIER_PRICING,
  });
});
