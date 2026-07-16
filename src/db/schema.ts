import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { CompanyPack, StatePack } from '../tenancy/types.js';
import type {
  SubmissionManifestV1,
  SubmittedInspection,
  SubmissionStatus,
} from '../submissions/types.js';

// ---- Tenancy: the Brain is the registry for the Pro system ----

export const companiesTable = pgTable('companies', {
  id: text('id').primaryKey(), // stable tenant id, mapped to CRM/app tenant at onboarding
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statesTable = pgTable('states', {
  code: text('code').primaryKey(), // e.g. "VA"
  name: text('name').notNull(),
});

// Company pack (company-scoped config). One row per company.
export const companyConfigTable = pgTable('company_config', {
  companyId: text('company_id')
    .primaryKey()
    .references(() => companiesTable.id, { onDelete: 'cascade' }),
  pack: jsonb('pack').$type<CompanyPack>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// State pack (state-scoped config). One row per state.
// `reviewedAt` is the counsel-review stamp — a state is not go-live until set.
export const stateConfigTable = pgTable('state_config', {
  stateCode: text('state_code')
    .primaryKey()
    .references(() => statesTable.code, { onDelete: 'cascade' }),
  pack: jsonb('pack').$type<StatePack>().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Submissions: what the field app couriers up ----

export const submissionsTable = pgTable('submissions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: text('inspection_id').notNull(),
  companyId: text('company_id')
    .notNull()
    .references(() => companiesTable.id),
  stateCode: text('state_code').notNull(),
  status: text('status').$type<SubmissionStatus>().notNull().default('received'),
  protocolVersion: text('protocol_version').notNull(),
  manifest: jsonb('manifest').$type<SubmissionManifestV1>().notNull(),
  inspection: jsonb('inspection').$type<SubmittedInspection>().notNull(),
  // Set once a package has been rendered (B7). Path/ref to the produced PDF.
  packageRef: text('package_ref'),
  packageSha256: text('package_sha256'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  packagedAt: timestamp('packaged_at', { withTimezone: true }),
});

export type CompanyRow = typeof companiesTable.$inferSelect;
export type StateRow = typeof statesTable.$inferSelect;
export type CompanyConfigRow = typeof companyConfigTable.$inferSelect;
export type StateConfigRow = typeof stateConfigTable.$inferSelect;
export type SubmissionRow = typeof submissionsTable.$inferSelect;
