import { parseDetailsCsv } from './parse.js';
import type { NoaaEvent } from './parse.js';
import { buildCoverageSet, filterToCoverage } from './coverage.js';
import type { ServicedCounty } from './coverage.js';
import { listDetailsFiles, downloadDetails } from './fetch.js';
import type { DetailsFile } from './fetch.js';
import {
  upsertStormEvents,
  pruneOlderThan,
  addCoverage,
  listCoverage,
  markBackfilled,
  recordRun,
} from './store.js';
import { resolveState, normalizeCountyName } from './states.js';

const WINDOW_MONTHS = 24;

// ---- Pure helpers (unit-tested) ----

// Parse a details CSV and keep only serviced-county rows.
export function prepareEvents(csvText: string, serviced: ServicedCounty[]): NoaaEvent[] {
  const all = parseDetailsCsv(csvText);
  return filterToCoverage(all, buildCoverageSet(serviced));
}

// The rolling-window cutoff: 'YYYY-MM-DDTHH:mm:ss' at `months` before `now`.
export function pruneCutoffIso(now: Date, months = WINDOW_MONTHS): string {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 19);
}

// The data years a trailing `months`-window touches, given "now".
export function windowYears(now: Date, months = WINDOW_MONTHS): number[] {
  const end = now.getUTCFullYear();
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - months);
  const first = start.getUTCFullYear();
  const years: number[] = [];
  for (let y = first; y <= end; y++) years.push(y);
  return years;
}

// ---- Orchestration (network + DB; guarded, not run in tests) ----

// Fires when a company adds a service county: ensures the last 24 months for that
// county are present. Pulls only the year files the window spans, filters to the
// county, upserts. Idempotent.
export async function backfillCounty(
  serviced: ServicedCounty,
  now = new Date(),
): Promise<{ upserted: number; files: string[] }> {
  await addCoverage([serviced]);
  const st = resolveState(serviced.state);
  if (!st) throw new Error(`Unknown state: ${serviced.state}`);

  const years = new Set(windowYears(now));
  const files = (await listDetailsFiles()).filter((f) => years.has(f.year));
  let upserted = 0;
  const processed: string[] = [];
  let newestStamp = '';
  for (const f of files) {
    const csv = await downloadDetails(f);
    const events = prepareEvents(csv, [serviced]);
    upserted += await upsertStormEvents(events, f.year, f.created);
    processed.push(f.filename);
    if (f.created > newestStamp) newestStamp = f.created;
  }
  await markBackfilled(st.fips, normalizeCountyName(serviced.county), newestStamp);
  await recordRun({ kind: 'backfill', filesProcessed: processed, rowsUpserted: upserted, rowsPruned: 0 });
  return { upserted, files: processed };
}

// Monthly cron: re-pull the current + prior data-year files (to absorb NOAA's
// revisions and newly published months), upsert all serviced counties, then
// prune anything past the 24-month window.
export async function monthlyRefresh(
  now = new Date(),
): Promise<{ upserted: number; pruned: number; files: string[] }> {
  const serviced = await listCoverage();
  if (serviced.length === 0) {
    return { upserted: 0, pruned: 0, files: [] };
  }
  const recentYears = new Set([now.getUTCFullYear(), now.getUTCFullYear() - 1]);
  const files = (await listDetailsFiles()).filter((f) => recentYears.has(f.year));
  let upserted = 0;
  const processed: string[] = [];
  for (const f of files) {
    const csv = await downloadDetails(f);
    const events = prepareEvents(csv, serviced);
    upserted += await upsertStormEvents(events, f.year, f.created);
    processed.push(f.filename);
  }
  const pruned = await pruneOlderThan(pruneCutoffIso(now));
  await recordRun({
    kind: 'monthly',
    filesProcessed: processed,
    rowsUpserted: upserted,
    rowsPruned: pruned,
  });
  return { upserted, pruned, files: processed };
}

export type { DetailsFile };
