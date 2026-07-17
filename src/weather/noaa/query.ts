import { queryCandidates } from './store.js';
import { selectStormOfRecord, toStormSummaryInput } from './select.js';
import type { StormSummaryInput } from '../summary.js';
import type { SubmittedInspection } from '../../submissions/types.js';
import { resolveState } from './states.js';

type StormBlock = NonNullable<SubmittedInspection['storm']>;

// Map a resolved NOAA storm into the SubmittedInspection.storm shape, so it flows
// through the unchanged Exhibit D path as the authoritative storm of record.
export function toStormBlock(input: StormSummaryInput): StormBlock {
  return {
    confirmedDate: input.confirmedDate,
    datetimeLocal: input.datetimeLocal ?? null,
    primaryType: input.primaryType,
    hailSize: input.hailSize,
    windSpeed: input.windSpeed,
    distance: input.distance,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    station: input.station ?? null,
    description: input.description,
    source: input.source,
    officialEventId: input.officialEventId ?? null,
    episodeNarrative: input.episodeNarrative ?? null,
  };
}

// Add/subtract whole days from a 'YYYY-MM-DD' date (UTC), returning 'YYYY-MM-DD'.
export function addDays(dateStr: string, delta: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(t)) return dateStr;
  return new Date(t + delta * 86_400_000).toISOString().slice(0, 10);
}

// Render-time lookup: find the authoritative NOAA storm of record for a property
// + date of loss from the ingested corpus, adapted into composeStormSummary
// input. Best-effort — returns null if nothing qualifies or the corpus is empty,
// so the package builder can fall back to the Phase-1 (VisualCrossing) storm
// rather than fail. This is the Phase-2 authoritative upgrade seam.
export async function resolveStormOfRecord(opts: {
  lat?: number | null;
  lng?: number | null;
  dateOfLoss: string;
  state?: string | null;
  withinMiles?: number;
  windowDays?: number;
}): Promise<StormSummaryInput | null> {
  const windowDays = opts.windowDays ?? 2;
  const from = addDays(opts.dateOfLoss, -windowDays);
  const to = addDays(opts.dateOfLoss, windowDays);
  const stateFips = opts.state ? resolveState(opts.state)?.fips : undefined;

  const candidates = await queryCandidates({ from, to, stateFips });
  const match = selectStormOfRecord(candidates, {
    lat: opts.lat,
    lng: opts.lng,
    dateOfLoss: opts.dateOfLoss,
    withinMiles: opts.withinMiles,
    windowDays,
  });
  return match ? toStormSummaryInput(match, opts.dateOfLoss) : null;
}
