import { eq, and, desc, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  companyConfigTable,
  stateConfigTable,
  companyPriceBooksTable,
  companyServiceAreasTable,
  companyConfigAuditTable,
} from '../db/schema.js';
import type { StatePack } from '../tenancy/types.js';
import {
  computeOnboardingStatus,
  type OnboardingStatus,
  type ServiceArea,
  type PriceBookSummary,
} from './readiness.js';

// A state is offerable only once its pack has been counsel-reviewed
// (`reviewedAt`). Unreviewed states are surfaced as "coming soon" rather than
// hidden, so a contractor understands why their state is absent instead of
// assuming the product is broken.
export async function listOfferableStates(): Promise<
  Array<{ stateCode: string; stateName: string; available: boolean }>
> {
  const rows = await db
    .select({
      stateCode: stateConfigTable.stateCode,
      pack: stateConfigTable.pack,
      reviewedAt: stateConfigTable.reviewedAt,
    })
    .from(stateConfigTable);
  return rows.map((r) => ({
    stateCode: r.stateCode,
    stateName: r.pack.stateName,
    available: r.reviewedAt != null,
  }));
}

export async function getServiceAreas(companyId: string): Promise<ServiceArea[]> {
  const rows = await db
    .select({
      stateCode: companyServiceAreasTable.stateCode,
      countyName: companyServiceAreasTable.countyName,
    })
    .from(companyServiceAreasTable)
    .where(eq(companyServiceAreasTable.companyId, companyId));

  const byState = new Map<string, string[]>();
  for (const r of rows) {
    const list = byState.get(r.stateCode) ?? [];
    list.push(r.countyName);
    byState.set(r.stateCode, list);
  }
  return [...byState].map(([stateCode, counties]) => ({ stateCode, counties }));
}

// Resolve the price book IN FORCE on a given date — not the current one. A
// package must cite the pricing that was published before the loss; using the
// latest version would let a later edit rewrite the basis of an issued package.
export async function getPriceBookForDate(
  companyId: string,
  onDate: string,
): Promise<PriceBookSummary | null> {
  const [row] = await db
    .select()
    .from(companyPriceBooksTable)
    .where(
      and(
        eq(companyPriceBooksTable.companyId, companyId),
        lte(companyPriceBooksTable.effectiveFrom, onDate),
      ),
    )
    .orderBy(desc(companyPriceBooksTable.effectiveFrom), desc(companyPriceBooksTable.version))
    .limit(1);
  if (!row) return null;
  return {
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    pricePerSquare: row.pricePerSquare,
    adderRates: row.adderRates,
    basisStatement: row.basisStatement,
  };
}

export async function getCurrentPriceBook(companyId: string): Promise<PriceBookSummary | null> {
  const [row] = await db
    .select()
    .from(companyPriceBooksTable)
    .where(eq(companyPriceBooksTable.companyId, companyId))
    .orderBy(desc(companyPriceBooksTable.version))
    .limit(1);
  if (!row) return null;
  return {
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    pricePerSquare: row.pricePerSquare,
    adderRates: row.adderRates,
    basisStatement: row.basisStatement,
  };
}

async function statePacksFor(areas: ServiceArea[]): Promise<Record<string, StatePack>> {
  const out: Record<string, StatePack> = {};
  for (const a of areas) {
    const [row] = await db
      .select({ pack: stateConfigTable.pack, reviewedAt: stateConfigTable.reviewedAt })
      .from(stateConfigTable)
      .where(eq(stateConfigTable.stateCode, a.stateCode))
      .limit(1);
    // An unreviewed state is deliberately treated as unavailable, so readiness
    // reports it as a blocker rather than letting a package build against
    // legal content that has not cleared review.
    if (row?.reviewedAt) out[a.stateCode] = row.pack;
  }
  return out;
}

export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatus> {
  const [cfg] = await db
    .select({ pack: companyConfigTable.pack })
    .from(companyConfigTable)
    .where(eq(companyConfigTable.companyId, companyId))
    .limit(1);

  const serviceAreas = await getServiceAreas(companyId);
  const [statePacks, priceBook] = await Promise.all([
    statePacksFor(serviceAreas),
    getCurrentPriceBook(companyId),
  ]);

  return computeOnboardingStatus({
    companyId,
    pack: cfg?.pack ?? null,
    serviceAreas,
    statePacks,
    priceBook,
  });
}

// Adders the company must rate, for the price-book wizard to render.
export async function getRequiredAdders(companyId: string) {
  const areas = await getServiceAreas(companyId);
  const packs = await statePacksFor(areas);
  const book = await getCurrentPriceBook(companyId);
  const { enumerateRequiredAdders } = await import('./readiness.js');
  return enumerateRequiredAdders(areas, packs, book?.adderRates ?? {});
}

export async function recordConfigAudit(entry: {
  companyId: string;
  area: string;
  action: string;
  actor: string | null;
  detail: Record<string, unknown>;
}): Promise<void> {
  await db.insert(companyConfigAuditTable).values(entry);
}
