import { and, gte, lte, lt, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  stormEventsTable,
  countyCoverageTable,
  noaaIngestRunsTable,
} from '../../db/schema.js';
import type { NoaaEvent } from './parse.js';
import { classifyType } from './parse.js';
import { resolveState, normalizeCountyName } from './states.js';
import type { ServicedCounty } from './coverage.js';

// Drizzle persistence for the rolling NOAA corpus. Selection/scoring live in the
// pure select.ts; this module only moves rows in and out of Postgres.

function toRow(ev: NoaaEvent, fileYear: number, fileCreated: string) {
  return {
    eventId: ev.eventId,
    episodeId: ev.episodeId,
    state: ev.state,
    stateFips: ev.stateFips,
    czType: ev.czType,
    czFips: ev.czFips,
    czName: ev.czName,
    wfo: ev.wfo,
    eventType: ev.eventType,
    beginLocal: ev.beginLocal,
    czTimezone: ev.czTimezone,
    magnitude: ev.magnitude,
    magnitudeUnit: ev.magnitudeUnit,
    magnitudeType: ev.magnitudeType,
    magnitudeRaw: ev.magnitudeRaw,
    torFScale: ev.torFScale,
    damageProperty: ev.damageProperty,
    source: ev.source,
    beginRange: ev.beginRange,
    beginAzimuth: ev.beginAzimuth,
    beginLocation: ev.beginLocation,
    beginLat: ev.beginLat,
    beginLon: ev.beginLon,
    episodeNarrative: ev.episodeNarrative,
    eventNarrative: ev.eventNarrative,
    fileYear,
    fileCreated,
  };
}

// Reconstruct the NoaaEvent shape from a stored row (for the select step).
function fromRow(row: typeof stormEventsTable.$inferSelect): NoaaEvent {
  return {
    eventId: row.eventId,
    episodeId: row.episodeId,
    state: row.state,
    stateFips: row.stateFips,
    czType: row.czType,
    czFips: row.czFips,
    czName: row.czName,
    wfo: row.wfo,
    eventType: row.eventType,
    primaryType: classifyType(row.eventType),
    beginLocal: row.beginLocal,
    czTimezone: row.czTimezone,
    magnitude: row.magnitude,
    magnitudeUnit: (row.magnitudeUnit as NoaaEvent['magnitudeUnit']) ?? null,
    magnitudeType: row.magnitudeType,
    magnitudeRaw: row.magnitudeRaw,
    torFScale: row.torFScale,
    damageProperty: row.damageProperty,
    source: row.source,
    beginRange: row.beginRange,
    beginAzimuth: row.beginAzimuth,
    beginLocation: row.beginLocation,
    beginLat: row.beginLat,
    beginLon: row.beginLon,
    episodeNarrative: row.episodeNarrative,
    eventNarrative: row.eventNarrative,
  };
}

// Idempotent upsert keyed on EVENT_ID — re-ingesting a revised file corrects the
// stored row in place. Chunked to keep parameter counts sane.
export async function upsertStormEvents(
  events: NoaaEvent[],
  fileYear: number,
  fileCreated: string,
): Promise<number> {
  if (events.length === 0) return 0;
  const CHUNK = 500;
  let n = 0;
  for (let i = 0; i < events.length; i += CHUNK) {
    const rows = events.slice(i, i + CHUNK).map((ev) => toRow(ev, fileYear, fileCreated));
    await db
      .insert(stormEventsTable)
      .values(rows)
      .onConflictDoUpdate({
        target: stormEventsTable.eventId,
        set: {
          magnitude: sqlExcluded('magnitude'),
          eventNarrative: sqlExcluded('event_narrative'),
          episodeNarrative: sqlExcluded('episode_narrative'),
          damageProperty: sqlExcluded('damage_property'),
          fileCreated: sqlExcluded('file_created'),
          fileYear: sqlExcluded('file_year'),
        },
      });
    n += rows.length;
  }
  return n;
}

// `excluded.<col>` reference for the upsert SET clause.
function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

// Drop everything with a begin time older than the cutoff (the rolling window).
export async function pruneOlderThan(cutoffIso: string): Promise<number> {
  const res = await db.delete(stormEventsTable).where(lt(stormEventsTable.beginLocal, cutoffIso));
  return res.rowCount ?? 0;
}

// Candidate rows near a date of loss (optionally scoped to a state), fed to the
// pure selectStormOfRecord. `from`/`to` are 'YYYY-MM-DD' bounds.
export async function queryCandidates(opts: {
  from: string;
  to: string;
  stateFips?: string;
}): Promise<NoaaEvent[]> {
  const conds = [
    gte(stormEventsTable.beginLocal, `${opts.from}T00:00:00`),
    lte(stormEventsTable.beginLocal, `${opts.to}T23:59:59`),
  ];
  if (opts.stateFips) conds.push(eq(stormEventsTable.stateFips, opts.stateFips));
  const rows = await db
    .select()
    .from(stormEventsTable)
    .where(and(...conds));
  return rows.map(fromRow);
}

// ---- Coverage ----

export async function addCoverage(serviced: ServicedCounty[]): Promise<void> {
  const rows = serviced
    .map((sc) => {
      const st = resolveState(sc.state);
      if (!st) return null;
      return {
        stateAbbr: st.abbr,
        stateFips: st.fips,
        countyName: normalizeCountyName(sc.county),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (rows.length === 0) return;
  await db.insert(countyCoverageTable).values(rows).onConflictDoNothing();
}

export async function listCoverage(): Promise<ServicedCounty[]> {
  const rows = await db.select().from(countyCoverageTable);
  return rows.map((r) => ({ state: r.stateFips, county: r.countyName }));
}

export async function markBackfilled(
  stateFips: string,
  countyName: string,
  fileCreated: string,
): Promise<void> {
  await db
    .update(countyCoverageTable)
    .set({ lastBackfilledAt: new Date(), lastFileCreated: fileCreated })
    .where(
      and(
        eq(countyCoverageTable.stateFips, stateFips),
        eq(countyCoverageTable.countyName, normalizeCountyName(countyName)),
      ),
    );
}

export async function recordRun(run: {
  kind: 'backfill' | 'monthly';
  filesProcessed: string[];
  rowsUpserted: number;
  rowsPruned: number;
  note?: string;
}): Promise<void> {
  await db.insert(noaaIngestRunsTable).values({
    kind: run.kind,
    finishedAt: new Date(),
    filesProcessed: run.filesProcessed,
    rowsUpserted: run.rowsUpserted,
    rowsPruned: run.rowsPruned,
    note: run.note ?? null,
  });
}
