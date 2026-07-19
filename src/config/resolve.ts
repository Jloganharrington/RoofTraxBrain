import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { companiesTable, companyConfigTable, stateConfigTable } from '../db/schema.js';
import type { ResolvedConfig } from '../tenancy/types.js';

export async function getCompany(companyId: string) {
  const rows = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompanyConfig(companyId: string) {
  const rows = await db
    .select()
    .from(companyConfigTable)
    .where(eq(companyConfigTable.companyId, companyId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStateConfig(stateCode: string) {
  const rows = await db
    .select()
    .from(stateConfigTable)
    .where(eq(stateConfigTable.stateCode, stateCode))
    .limit(1);
  return rows[0] ?? null;
}

// Resolve the two config dimensions for one inspection: exactly one company pack
// + one state pack. Returns null if either is missing (the package cannot render
// without both). Throws if the state pack has not been counsel-reviewed.
//
// `allowUnreviewedState` exists for DATA INSPECTION ONLY (GET /report-data), so
// the team can see what a submission produced before counsel has signed off on
// the state's legal content. It must never be passed by the package-rendering
// path: a rendered proof package cites the state's homeowner-rights and UPPA
// content, and that is precisely what review exists to gate. Callers that set it
// are responsible for marking their output as non-go-live.
export async function resolveConfig(
  companyId: string,
  stateCode: string,
  opts: { allowUnreviewedState?: boolean } = {},
): Promise<ResolvedConfig | null> {
  const [company, state] = await Promise.all([
    getCompanyConfig(companyId),
    getStateConfig(stateCode),
  ]);
  if (!company || !state) return null;
  if (!state.reviewedAt && !opts.allowUnreviewedState) {
    throw new Error(
      `State ${stateCode} config has not been counsel-reviewed; refusing to render a package for a non-go-live state.`,
    );
  }
  return {
    companyId,
    company: company.pack,
    stateCode,
    state: state.pack,
    stateReviewedAt: state.reviewedAt ?? null,
  };
}
