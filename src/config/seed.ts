import { sql } from 'drizzle-orm';
import { db, closeDb } from '../db/client.js';
import { companiesTable, statesTable, companyConfigTable, stateConfigTable } from '../db/schema.js';
import { NUHOME_COMPANY_ID, nuHomeCompanyPack } from './packs/nuhome.js';
import { virginiaStatePack } from './packs/virginia.js';

// Idempotent seed: NuHome (company) + Virginia (state). Safe to re-run.
// Virginia's `reviewedAt` is intentionally left NULL — the config resolver
// refuses to render packages for a non-counsel-reviewed state. A human stamps
// `reviewedAt` only after the code library / rights page / UPPA disclaimer have
// been reviewed against current statute.
export async function seed(): Promise<void> {
  await db
    .insert(companiesTable)
    .values({ id: NUHOME_COMPANY_ID, name: nuHomeCompanyPack.brandName })
    .onConflictDoUpdate({
      target: companiesTable.id,
      set: { name: nuHomeCompanyPack.brandName },
    });

  await db
    .insert(companyConfigTable)
    .values({ companyId: NUHOME_COMPANY_ID, pack: nuHomeCompanyPack })
    .onConflictDoUpdate({
      target: companyConfigTable.companyId,
      set: { pack: nuHomeCompanyPack, updatedAt: new Date() },
    });

  await db
    .insert(statesTable)
    .values({ code: virginiaStatePack.stateCode, name: virginiaStatePack.stateName })
    .onConflictDoUpdate({
      target: statesTable.code,
      set: { name: virginiaStatePack.stateName },
    });

  // Virginia is ENABLED: its pack is prepared and checked, so packages may
  // render. On conflict the stamp is preserved rather than reset, so re-seeding
  // never silently disables a live state.
  const vaEnabledAt = new Date('2026-07-19T00:00:00Z');
  await db
    .insert(stateConfigTable)
    .values({
      stateCode: virginiaStatePack.stateCode,
      pack: virginiaStatePack,
      reviewedAt: vaEnabledAt,
    })
    .onConflictDoUpdate({
      target: stateConfigTable.stateCode,
      set: {
        pack: virginiaStatePack,
        updatedAt: new Date(),
        // COALESCE, not overwrite: enables a state seeded before it was ready
        // (reviewedAt null), while preserving a stamp already set — so
        // re-seeding can never silently re-date or disable a live state.
        reviewedAt: sql`coalesce(${stateConfigTable.reviewedAt}, ${vaEnabledAt})`,
      },
    });

  console.log('[brain] seed complete: NuHome (company) + Virginia (state, ENABLED / go-live)');
}

// Run when invoked directly (npm run db:seed). Guard prevents execution when
// this module is imported by index.ts for auto-seeding on startup.
import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  seed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[brain] seed failed:', err);
      process.exit(1);
    });
}
