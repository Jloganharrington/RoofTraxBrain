// Company self-service configuration API — consumed by the RoofTraxSite
// onboarding page and its two wizards (Service Areas & Building Code, and
// Price Book).
//
// The Site owns the UI and the company's authenticated session; the Brain
// remains the source of truth for configuration and calls the shots on what
// is valid. Every write is audited.

import { Router } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { companyPriceBooksTable, companyServiceAreasTable } from '../db/schema.js';
import { requireAdminOrMachine } from '../auth/session.js';
import {
  listOfferableStates,
  getOnboardingStatus,
  getRequiredAdders,
  getServiceAreas,
  recordConfigAudit,
} from '../onboarding/store.js';

export const configRouter: Router = Router();

// States the platform can actually serve. Unreviewed states come back with
// available:false so the wizard can show "coming soon" instead of hiding them
// — a contractor whose state is missing should learn why, not guess.
configRouter.get('/config/states', requireAdminOrMachine, async (_req, res) => {
  res.json({ states: await listOfferableStates() });
});

// Onboarding readiness for the Site's progress UI. `blockers` is human-readable
// and `canBuildPackages` is the single gate the rest of the product keys off.
configRouter.get('/companies/:companyId/onboarding', requireAdminOrMachine, async (req, res) => {
  res.json(await getOnboardingStatus(req.params.companyId as string));
});

// The adders this company must rate, derived from its configured service
// states. The price-book wizard renders one input per entry — never a
// free-text key, so a rate can't drift away from the scope engine.
configRouter.get('/companies/:companyId/adders', requireAdminOrMachine, async (req, res) => {
  res.json({ adders: await getRequiredAdders(req.params.companyId as string) });
});

configRouter.get('/companies/:companyId/service-areas', requireAdminOrMachine, async (req, res) => {
  res.json({ serviceAreas: await getServiceAreas(req.params.companyId as string) });
});

// Add a service county. Idempotent: re-adding an existing county is a no-op
// rather than an error, so a wizard retry cannot fail the step.
//
// NOTE: adding a county should also trigger the NOAA 24-month backfill for it
// (`stormBackfillAt` stays null until that completes). Wiring the trigger is
// the next step — the column exists so the state is representable now.
configRouter.post(
  '/companies/:companyId/service-areas',
  requireAdminOrMachine,
  async (req, res) => {
    const companyId = req.params.companyId as string;
    const { stateCode, countyName, stateFips, actor } = req.body ?? {};
    if (typeof stateCode !== 'string' || typeof countyName !== 'string') {
      res.status(400).json({ error: 'stateCode and countyName are required' });
      return;
    }

    const offerable = await listOfferableStates();
    const state = offerable.find((s) => s.stateCode === stateCode);
    if (!state?.available) {
      // Fail closed: a state whose legal content has not cleared counsel review
      // must not become selectable through the API just because the UI allowed it.
      res.status(409).json({
        error: 'state_not_available',
        detail: `${stateCode} is not yet available on the platform.`,
      });
      return;
    }

    const existing = await db
      .select({ id: companyServiceAreasTable.id })
      .from(companyServiceAreasTable)
      .where(
        and(
          eq(companyServiceAreasTable.companyId, companyId),
          eq(companyServiceAreasTable.stateCode, stateCode),
          eq(companyServiceAreasTable.countyName, countyName),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(companyServiceAreasTable).values({
        companyId,
        stateCode,
        countyName,
        stateFips: typeof stateFips === 'string' ? stateFips : null,
        addedBy: typeof actor === 'string' ? actor : null,
      });
      await recordConfigAudit({
        companyId,
        area: 'service_areas',
        action: 'added',
        actor: typeof actor === 'string' ? actor : null,
        detail: { stateCode, countyName },
      });
    }

    res.status(200).json({ serviceAreas: await getServiceAreas(companyId) });
  },
);

// Publish a new price-book version. NEVER an update: a new row with its own
// effective date, so packages already issued keep citing the pricing that was
// in force when their loss occurred.
configRouter.post('/companies/:companyId/price-book', requireAdminOrMachine, async (req, res) => {
  const companyId = req.params.companyId as string;
  const { pricePerSquare, basisStatement, adderRates, laborBuildUp, effectiveFrom, actor } =
    req.body ?? {};

  if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    res.status(400).json({ error: 'effectiveFrom must be a YYYY-MM-DD date' });
    return;
  }
  const rates: Record<string, number> =
    adderRates && typeof adderRates === 'object' ? adderRates : {};

  // Reject rates for keys this company's states don't define — a stray key is
  // money allocated to an adder the scope engine will never emit.
  const required = await getRequiredAdders(companyId);
  const validKeys = new Set(required.map((a) => a.key));
  const unknown = Object.keys(rates).filter((k) => !validKeys.has(k));
  if (unknown.length) {
    res.status(400).json({
      error: 'unknown_adder_keys',
      detail: 'These keys are not defined by any of your service states.',
      keys: unknown,
    });
    return;
  }

  const [latest] = await db
    .select({ version: companyPriceBooksTable.version })
    .from(companyPriceBooksTable)
    .where(eq(companyPriceBooksTable.companyId, companyId))
    // DESC: we need the highest existing version to increment from. Ascending
    // would read version 1 every time and collide on (companyId, version).
    .orderBy(desc(companyPriceBooksTable.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;

  await db.insert(companyPriceBooksTable).values({
    companyId,
    version,
    effectiveFrom,
    pricePerSquare: typeof pricePerSquare === 'number' ? pricePerSquare : null,
    basisStatement: typeof basisStatement === 'string' ? basisStatement : null,
    adderRates: rates,
    laborBuildUp: laborBuildUp && typeof laborBuildUp === 'object' ? laborBuildUp : null,
    publishedBy: typeof actor === 'string' ? actor : null,
  });
  await recordConfigAudit({
    companyId,
    area: 'price_book',
    action: 'published',
    actor: typeof actor === 'string' ? actor : null,
    detail: { version, effectiveFrom, pricePerSquare, adderRateCount: Object.keys(rates).length },
  });

  res.status(201).json({ version, effectiveFrom, onboarding: await getOnboardingStatus(companyId) });
});

// Version history — the wizard shows this so a publisher understands they are
// creating a new version, not editing the current one.
configRouter.get('/companies/:companyId/price-book/history', requireAdminOrMachine, async (req, res) => {
  const rows = await db
    .select({
      version: companyPriceBooksTable.version,
      effectiveFrom: companyPriceBooksTable.effectiveFrom,
      pricePerSquare: companyPriceBooksTable.pricePerSquare,
      publishedAt: companyPriceBooksTable.publishedAt,
      publishedBy: companyPriceBooksTable.publishedBy,
    })
    .from(companyPriceBooksTable)
    .where(eq(companyPriceBooksTable.companyId, req.params.companyId as string))
    .orderBy(asc(companyPriceBooksTable.version));
  res.json({ versions: rows });
});
