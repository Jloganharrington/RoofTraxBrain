import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  doublePrecision,
  bigint,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { CompanyPack, StatePack } from '../tenancy/types.js';
import type { SubscriptionTier, PaymentStatus } from '../billing/types.js';
import type { DocumentKind, DocumentScope } from '../documents/types.js';
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
// `reviewedAt` is the STATE ENABLEMENT stamp: this state's pack has been
// prepared and checked. Null = not go-live, and the resolver refuses to render
// packages for it — the guard against shipping a package for a state whose
// content nobody has done yet.
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
  // B6 — stored AI narratives (determinism: generate once, reuse on rebuild)
  aiNarratives: jsonb('ai_narratives'),
  aiModel: text('ai_model'),
  aiGeneratedAt: timestamp('ai_generated_at', { withTimezone: true }),
});

// ---- Billing: subscription tier + payment status per tenant ----
// Stripe is the intended source of truth once webhooks land; these columns
// mirror it. Until then they're set from the admin UI. The Brain never stores
// card data — only the tier/status it needs for entitlement.

export const subscriptionsTable = pgTable('subscriptions', {
  companyId: text('company_id')
    .primaryKey()
    .references(() => companiesTable.id, { onDelete: 'cascade' }),
  tier: text('tier').$type<SubscriptionTier>().notNull().default('payg'),
  status: text('status').$type<PaymentStatus>().notNull().default('none'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Document Center: versioned, human-editable rendering config ----

export const documentsTable = pgTable(
  'documents',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    kind: text('kind').$type<DocumentKind>().notNull(),
    scope: text('scope').$type<DocumentScope>().notNull().default('global'),
    scopeRef: text('scope_ref'), // state code or company id when scoped
    key: text('key').notNull(), // stable slug, e.g. 'phase2-forensic-report'
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    contentType: text('content_type').notNull().default('text/html'),
    body: text('body'), // inline content (HTML templates)
    storageRef: text('storage_ref'), // object-storage ref for binaries (PDFs)
    active: boolean('active').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byKey: index('documents_key_idx').on(t.kind, t.key),
    uniqVersion: uniqueIndex('documents_version_uniq').on(t.kind, t.key, t.scope, t.scopeRef, t.version),
  }),
);

// ---- NOAA Storm Events: rolling 24-month severe-weather corpus ----
// Ingested from NCEI bulk `StormEvents_details` files, filtered to serviced
// counties. A monthly job re-pulls recent years (for NOAA's revisions) and
// prunes anything older than 24 months, so the table is a trailing window.

export const stormEventsTable = pgTable(
  'storm_events',
  {
    eventId: text('event_id').primaryKey(), // NOAA EVENT_ID
    episodeId: text('episode_id'),
    state: text('state').notNull(), // 'VIRGINIA'
    stateFips: text('state_fips').notNull(), // '51'
    czType: text('cz_type').notNull(), // 'C' county | 'Z' forecast zone
    czFips: text('cz_fips').notNull(),
    czName: text('cz_name').notNull(), // normalized upper, e.g. 'FAIRFAX'
    wfo: text('wfo'), // 'LWX'
    eventType: text('event_type').notNull(), // 'Thunderstorm Wind' | 'Hail' | ...
    beginLocal: timestamp('begin_local', { withTimezone: false, mode: 'string' }).notNull(), // local wall time 'YYYY-MM-DDTHH:mm:ss'
    czTimezone: text('cz_timezone'), // 'EST-5'
    magnitude: doublePrecision('magnitude'), // NORMALIZED: wind=mph, hail=inches
    magnitudeUnit: text('magnitude_unit'), // 'mph' | 'in' | null
    magnitudeType: text('magnitude_type'), // 'EG' | 'MG' | 'MS' | 'ES'
    magnitudeRaw: doublePrecision('magnitude_raw'), // raw NOAA value (knots for wind)
    torFScale: text('tor_f_scale'),
    damageProperty: bigint('damage_property', { mode: 'number' }), // USD
    source: text('source'), // report source, e.g. 'Mesonet'
    beginRange: doublePrecision('begin_range'),
    beginAzimuth: text('begin_azimuth'),
    beginLocation: text('begin_location'),
    beginLat: doublePrecision('begin_lat'),
    beginLon: doublePrecision('begin_lon'),
    episodeNarrative: text('episode_narrative'),
    eventNarrative: text('event_narrative'),
    fileYear: integer('file_year').notNull(), // data year of the source file
    fileCreated: text('file_created').notNull(), // cYYYYMMDD stamp of the source file
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBeginLocal: index('storm_events_begin_local_idx').on(t.beginLocal),
    byCounty: index('storm_events_county_idx').on(t.stateFips, t.czFips),
    byLatLon: index('storm_events_latlon_idx').on(t.beginLat, t.beginLon),
  }),
);

// The serviced-county set the corpus is maintained for. Written when a company
// adds a service county; the nightly reconciler backfills any gaps.
export const countyCoverageTable = pgTable(
  'county_coverage',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    stateAbbr: text('state_abbr').notNull(), // 'VA'
    stateFips: text('state_fips').notNull(), // '51'
    countyName: text('county_name').notNull(), // normalized upper, e.g. 'FAIRFAX'
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    lastBackfilledAt: timestamp('last_backfilled_at', { withTimezone: true }),
    lastFileCreated: text('last_file_created'), // newest cYYYYMMDD stamp ingested
  },
  (t) => ({
    uniqCounty: uniqueIndex('county_coverage_uniq').on(t.stateFips, t.countyName),
  }),
);

// Ingest-run audit trail (observability for the scheduled jobs).
export const noaaIngestRunsTable = pgTable('noaa_ingest_runs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  kind: text('kind').notNull(), // 'backfill' | 'monthly'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  filesProcessed: jsonb('files_processed').$type<string[]>(),
  rowsUpserted: integer('rows_upserted'),
  rowsPruned: integer('rows_pruned'),
  note: text('note'),
});

export type CompanyRow = typeof companiesTable.$inferSelect;
export type StateRow = typeof statesTable.$inferSelect;
export type SubscriptionRow = typeof subscriptionsTable.$inferSelect;
export type DocumentRow = typeof documentsTable.$inferSelect;
export type StormEventRow = typeof stormEventsTable.$inferSelect;
export type CountyCoverageRow = typeof countyCoverageTable.$inferSelect;
export type NoaaIngestRunRow = typeof noaaIngestRunsTable.$inferSelect;
export type CompanyConfigRow = typeof companyConfigTable.$inferSelect;
export type StateConfigRow = typeof stateConfigTable.$inferSelect;
export type SubmissionRow = typeof submissionsTable.$inferSelect;

// ---- Company self-service configuration (set up via the Site's wizards) ----

// Versioned, effective-dated price books. NEVER edited in place: the whole
// defensibility argument is that pricing was published BEFORE the loss, so a
// package must be able to cite the version in force on its date of loss.
// Editing a row retroactively would invalidate that claim for every package
// already issued.
export const companyPriceBooksTable = pgTable(
  'company_price_books',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => companiesTable.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    // Date (not timestamp): resolution is by date of loss.
    effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD
    pricePerSquare: doublePrecision('price_per_square'),
    currency: text('currency').notNull().default('USD'),
    basisStatement: text('basis_statement'),
    // Keyed by StatePack.adderRules[].key — enumerated from the company's
    // configured service states, never free-text.
    adderRates: jsonb('adder_rates').$type<Record<string, number>>().notNull().default({}),
    // Labor build-up inputs feeding the §14 Pricing Support exhibit.
    laborBuildUp: jsonb('labor_build_up').$type<Record<string, number>>(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text('published_by'), // audit: who published this version
  },
  (t) => ({
    byCompany: index('price_books_company_idx').on(t.companyId, t.effectiveFrom),
    uniqVersion: uniqueIndex('price_books_version_uniq').on(t.companyId, t.version),
  }),
);

// Service areas drive THREE things: which state pack resolves for a claim,
// which adder keys the price book must rate, and which counties the NOAA storm
// corpus ingests. Adding a county should trigger the 24-month backfill.
export const companyServiceAreasTable = pgTable(
  'company_service_areas',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => companiesTable.id, { onDelete: 'cascade' }),
    stateCode: text('state_code').notNull(),
    countyName: text('county_name').notNull(),
    stateFips: text('state_fips'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: text('added_by'),
    // Set once the NOAA 24-month backfill for this county has completed.
    stormBackfillAt: timestamp('storm_backfill_at', { withTimezone: true }),
  },
  (t) => ({
    byCompany: index('service_areas_company_idx').on(t.companyId),
    uniqArea: uniqueIndex('service_areas_uniq').on(t.companyId, t.stateCode, t.countyName),
  }),
);

// Append-only audit of company configuration changes. This is financial and
// legal configuration; "who changed the roof rate and when" will be asked.
export const companyConfigAuditTable = pgTable(
  'company_config_audit',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => companiesTable.id, { onDelete: 'cascade' }),
    area: text('area').notNull(), // price_book | service_areas | company_pack
    action: text('action').notNull(), // published | added | removed | updated
    actor: text('actor'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byCompany: index('config_audit_company_idx').on(t.companyId, t.at) }),
);
