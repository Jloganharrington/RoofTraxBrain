import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDetailsCsv } from './parse.js';
import {
  isSevere,
  haversineMiles,
  selectStormOfRecord,
  toStormSummaryInput,
} from './select.js';
import { buildCoverageSet, filterToCoverage } from './coverage.js';
import { prepareEvents, pruneCutoffIso, windowYears } from './ingest.js';
import { composeStormSummary } from '../summary.js';

const CSV = readFileSync(new URL('./__fixtures__/details-sample.csv', import.meta.url), 'utf8');
const EVENTS = parseDetailsCsv(CSV);
// A property in Reston, VA (near the 6/19/2025 measured gust).
const RESTON = { lat: 38.96, lng: -77.34 };

test('isSevere uses NWS ≥ thresholds (hail ≥1.0", wind ≥58 mph, any tornado)', () => {
  const byId = Object.fromEntries(EVENTS.map((e) => [e.eventId, e]));
  assert.equal(isSevere(byId['1255702']!), true); // 71 mph wind
  assert.equal(isSevere(byId['1250201']!), true); // 1.25" hail
  assert.equal(isSevere(byId['1207690']!), true); // exactly 1.00" hail — must qualify (≥)
  assert.equal(isSevere(byId['1255742']!), false); // 52 mph wind — below 58
  assert.equal(isSevere(byId['1250250']!), true); // tornado
});

test('haversineMiles is roughly correct', () => {
  // ~1 degree of latitude ≈ 69 miles.
  assert.ok(Math.abs(haversineMiles(38, -77, 39, -77) - 69) < 1);
});

test('selectStormOfRecord picks the near, severe, in-window event', () => {
  const match = selectStormOfRecord(EVENTS, {
    lat: RESTON.lat,
    lng: RESTON.lng,
    dateOfLoss: '2025-06-19',
    withinMiles: 25,
    windowDays: 2,
  });
  assert.ok(match, 'a storm of record was selected');
  assert.equal(match!.event.eventId, '1255702'); // Reston wind, not far Stafford / off-date hail
  assert.ok(match!.distanceMi != null && match!.distanceMi < 3);
});

test('date window excludes off-date events', () => {
  const match = selectStormOfRecord(EVENTS, {
    lat: RESTON.lat,
    lng: RESTON.lng,
    dateOfLoss: '2025-05-16',
    withinMiles: 25,
    windowDays: 2,
  });
  // On 5/16 the tornado (severe, near-ish) should win over the wind on 6/19.
  assert.ok(match);
  assert.equal(match!.event.primaryType, 'tornado');
});

test('adapter → composeStormSummary yields authoritative NCEI attribution', () => {
  const match = selectStormOfRecord(EVENTS, {
    lat: RESTON.lat,
    lng: RESTON.lng,
    dateOfLoss: '2025-06-19',
  })!;
  const input = toStormSummaryInput(match, '2025-06-19');
  assert.equal(input.source, 'NOAA/NCEI Storm Events Database');
  assert.equal(input.officialEventId, '1255702');
  assert.equal(input.windSpeed, 71);

  const summary = composeStormSummary(input);
  assert.match(summary.sourceLine, /NOAA\/NCEI Storm Events Database/);
  assert.match(summary.sourceLine, /Event ID 1255702/);
  assert.match(summary.sourceLine, /WFO LWX \(Sterling, VA\)/);
  assert.ok(summary.episodeNarrative && /outbreak/.test(summary.episodeNarrative));
});

test('coverage filter keeps serviced counties + state zone events, drops others', () => {
  const cov = buildCoverageSet([{ state: 'VA', county: 'Fairfax' }]);
  const kept = filterToCoverage(EVENTS, cov);
  const ids = kept.map((e) => e.eventId);
  assert.ok(ids.includes('1255702')); // Fairfax county event
  assert.ok(ids.includes('1255266')); // VA zone event (state covered)
  assert.ok(!ids.includes('1255742')); // Stafford county — not serviced

  // prepareEvents = parse + filter in one step.
  assert.equal(prepareEvents(CSV, [{ state: 'VA', county: 'Fairfax' }]).length, kept.length);
});

test('rolling-window helpers', () => {
  const now = new Date('2026-07-16T00:00:00Z');
  assert.equal(pruneCutoffIso(now), '2024-07-16T00:00:00');
  assert.deepEqual(windowYears(now), [2024, 2025, 2026]);
});
