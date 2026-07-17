import type { NoaaEvent } from './parse.js';
import { resolveState, normalizeCountyName } from './states.js';

// Coverage matching for the ingest filter. A serviced county is (state, name).
// County ('C') events match on (stateFips, normalized county name). Zone ('Z')
// events (High Wind, Winter Storm, …) are keyed to forecast zones, not counties,
// and carry no county FIPS or lat/lon — so we retain them whenever their STATE
// is serviced. That's deliberately over-inclusive: a handful of extra zone rows
// per covered state is cheap, and the per-report query still filters by county
// and date, so nothing spurious reaches a proof package.

export interface ServicedCounty {
  state: string; // abbr, name, or FIPS
  county: string; // any label form
}

export interface CoverageSet {
  counties: Set<string>; // `${stateFips}:${normalizedCountyName}`
  states: Set<string>; // stateFips with at least one serviced county
}

export function countyKey(stateFips: string, countyName: string): string {
  return `${stateFips}:${normalizeCountyName(countyName)}`;
}

export function buildCoverageSet(serviced: ServicedCounty[]): CoverageSet {
  const counties = new Set<string>();
  const states = new Set<string>();
  for (const sc of serviced) {
    const st = resolveState(sc.state);
    if (!st) continue;
    counties.add(countyKey(st.fips, sc.county));
    states.add(st.fips);
  }
  return { counties, states };
}

export function matchesCoverage(ev: NoaaEvent, cov: CoverageSet): boolean {
  if (ev.czType === 'Z') return cov.states.has(ev.stateFips);
  return cov.counties.has(`${ev.stateFips}:${ev.czName}`);
}

export function filterToCoverage(events: NoaaEvent[], cov: CoverageSet): NoaaEvent[] {
  return events.filter((ev) => matchesCoverage(ev, cov));
}
