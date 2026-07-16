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

  // Preserve an existing reviewedAt if a human has already reviewed; never
  // auto-stamp it here.
  await db
    .insert(stateConfigTable)
    .values({ stateCode: virginiaStatePack.stateCode, pack: virginiaStatePack, reviewedAt: null })
    .onConflictDoUpdate({
      target: stateConfigTable.stateCode,
      set: { pack: virginiaStatePack, updatedAt: new Date() },
    });

  console.log('[brain] seed complete: NuHome (company) + Virginia (state, reviewedAt=NULL / not go-live)');
}

// Run when invoked directly (npm run db:seed).
seed()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[brain] seed failed:', err);
    process.exit(1);
  });
