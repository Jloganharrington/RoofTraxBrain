import type { NoaaEvent } from './parse.js';
import type { StormSummaryInput } from '../summary.js';

// Selects the storm of record for a property from the ingested NOAA corpus, and
// adapts it into the composeStormSummary input. Pure — operates on an array, so
// it unit-tests without a DB (the DB wrapper just supplies the candidate rows).

// NWS SEVERE criteria (the ≥ fix): hail ≥ 1.00", thunderstorm/high wind ≥ 58 mph
// (50 kt), or any tornado. Deliberately ≥, not > — a textbook 1.00"/58 mph
// report is a genuine severe event and must qualify.
export const SEVERE_HAIL_IN = 1.0;
export const SEVERE_WIND_MPH = 58;

export function isSevere(ev: NoaaEvent): boolean {
  if (ev.primaryType === 'tornado') return true;
  if (ev.primaryType === 'hail' && ev.magnitude != null) return ev.magnitude >= SEVERE_HAIL_IN;
  if (ev.primaryType === 'wind' && ev.magnitudeUnit === 'mph' && ev.magnitude != null) {
    return ev.magnitude >= SEVERE_WIND_MPH;
  }
  return false;
}

const EARTH_RADIUS_MI = 3958.8;
function toRad(d: number): number {
  return (d * Math.PI) / 180;
}
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

function localDate(iso: string): string {
  return iso.slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Infinity;
  return Math.abs(ta - tb) / 86_400_000;
}

export interface SelectOptions {
  lat?: number | null;
  lng?: number | null;
  dateOfLoss: string; // 'YYYY-MM-DD'
  withinMiles?: number; // default 25
  windowDays?: number; // ± days around dateOfLoss, default 2
  requireSevere?: boolean; // default true
}

export interface StormMatch {
  event: NoaaEvent;
  distanceMi: number | null;
}

// Higher is better. Severe events dominate; then magnitude; then proximity.
function score(ev: NoaaEvent, distanceMi: number | null): number {
  let s = 0;
  if (isSevere(ev)) s += 1000;
  if (ev.primaryType === 'tornado') s += 500;
  if (ev.magnitudeUnit === 'in' && ev.magnitude != null) s += ev.magnitude * 40;
  if (ev.magnitudeUnit === 'mph' && ev.magnitude != null) s += ev.magnitude * 0.6;
  if (distanceMi != null) s += Math.max(0, 30 - distanceMi); // closer = better
  else s -= 5; // zone event with no coordinates: mild penalty
  return s;
}

export function selectStormOfRecord(
  events: NoaaEvent[],
  opts: SelectOptions,
): StormMatch | null {
  const withinMiles = opts.withinMiles ?? 25;
  const windowDays = opts.windowDays ?? 2;
  const requireSevere = opts.requireSevere ?? true;
  const hasProp = opts.lat != null && opts.lng != null;

  const candidates: StormMatch[] = [];
  for (const ev of events) {
    if (daysBetween(localDate(ev.beginLocal), opts.dateOfLoss) > windowDays) continue;
    if (requireSevere && !isSevere(ev)) continue;

    let distanceMi: number | null = null;
    if (hasProp && ev.beginLat != null && ev.beginLon != null) {
      distanceMi = haversineMiles(opts.lat!, opts.lng!, ev.beginLat, ev.beginLon);
      if (distanceMi > withinMiles) continue; // point event out of radius
    }
    candidates.push({ event: ev, distanceMi });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => score(b.event, b.distanceMi) - score(a.event, a.distanceMi));
  return candidates[0]!;
}

// Adapt a matched NOAA event into the composeStormSummary input, tagging it as
// the authoritative NCEI Storm Events source and carrying the episode synopsis.
export function toStormSummaryInput(match: StormMatch, dateOfLoss: string): StormSummaryInput {
  const ev = match.event;
  const primaryType = ev.primaryType === 'other' ? null : ev.primaryType;
  return {
    confirmedDate: ev.beginLocal.slice(0, 10),
    datetimeLocal: ev.beginLocal,
    primaryType,
    hailSize: ev.magnitudeUnit === 'in' ? ev.magnitude : null,
    windSpeed: ev.magnitudeUnit === 'mph' ? ev.magnitude : null,
    distance: match.distanceMi != null ? Math.round(match.distanceMi * 10) / 10 : ev.beginRange,
    latitude: ev.beginLat,
    longitude: ev.beginLon,
    station: ev.wfo,
    description: ev.eventNarrative,
    source: 'NOAA/NCEI Storm Events Database',
    officialEventId: ev.eventId,
    episodeNarrative: ev.episodeNarrative,
    dateOfLoss,
  };
}
