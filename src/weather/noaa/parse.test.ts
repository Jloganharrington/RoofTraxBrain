import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseDetailsCsv,
  parseDamage,
  knotsToMph,
  normalizeMagnitude,
  buildBeginLocal,
  classifyType,
} from './parse.js';
import { normalizeCountyName, resolveState } from './states.js';

const CSV = readFileSync(new URL('./__fixtures__/details-sample.csv', import.meta.url), 'utf8');

test('parseDamage handles bulk suffixes and plain numbers', () => {
  assert.equal(parseDamage('500K'), 500_000);
  assert.equal(parseDamage('1.50M'), 1_500_000);
  assert.equal(parseDamage('10.00K'), 10_000);
  assert.equal(parseDamage('0.00K'), 0);
  assert.equal(parseDamage('250000'), 250_000);
  assert.equal(parseDamage(''), null);
});

test('knots→mph and magnitude normalization by event type', () => {
  assert.equal(knotsToMph(62), 71);
  assert.equal(knotsToMph(50), 58);
  assert.deepEqual(normalizeMagnitude('Thunderstorm Wind', 62), { value: 71, unit: 'mph', raw: 62 });
  assert.deepEqual(normalizeMagnitude('Hail', 1.75), { value: 1.75, unit: 'in', raw: 1.75 });
  assert.deepEqual(normalizeMagnitude('Tornado', null), { value: null, unit: null, raw: null });
});

test('buildBeginLocal from YEARMONTH/DAY/TIME and from MM/DD/YYYY', () => {
  assert.equal(buildBeginLocal('202506', '19', '1459'), '2025-06-19T14:59:00');
  assert.equal(buildBeginLocal('202506', '5', '905'), '2025-06-05T09:05:00');
  assert.equal(buildBeginLocal(undefined, undefined, '1545', '08/03/2024'), '2024-08-03T15:45:00');
});

test('classifyType + county normalization', () => {
  assert.equal(classifyType('Thunderstorm Wind'), 'wind');
  assert.equal(classifyType('High Wind'), 'wind');
  assert.equal(classifyType('Marine Hail'), 'hail');
  assert.equal(classifyType('Flash Flood'), 'other');
  assert.equal(normalizeCountyName('FAIRFAX CO.'), 'FAIRFAX');
  assert.equal(normalizeCountyName('FAIRFAX (C) CO.'), 'FAIRFAX');
  assert.equal(normalizeCountyName('Fauquier County'), 'FAUQUIER');
  assert.equal(resolveState('VA')?.fips, '51');
  assert.equal(resolveState('Virginia')?.abbr, 'VA');
  assert.equal(resolveState('51')?.name, 'VIRGINIA');
});

test('parseDetailsCsv parses the Reston derecho row with all fields', () => {
  const events = parseDetailsCsv(CSV);
  assert.equal(events.length, 6);

  const reston = events.find((e) => e.eventId === '1255702');
  assert.ok(reston, 'Reston event present');
  assert.equal(reston!.primaryType, 'wind');
  assert.equal(reston!.magnitude, 71); // 62 kt → 71 mph
  assert.equal(reston!.magnitudeUnit, 'mph');
  assert.equal(reston!.magnitudeRaw, 62);
  assert.equal(reston!.beginLocal, '2025-06-19T14:59:00');
  assert.equal(reston!.czName, 'FAIRFAX');
  assert.equal(reston!.stateFips, '51');
  assert.equal(reston!.wfo, 'LWX');
  assert.equal(reston!.damageProperty, 500_000);
  assert.equal(reston!.beginLat, 38.9805);
  assert.match(reston!.eventNarrative ?? '', /houses/);
  assert.match(reston!.episodeNarrative ?? '', /severe weather outbreak/);
});

test('parses hail in inches and a zone event with no coordinates', () => {
  const events = parseDetailsCsv(CSV);
  const hail = events.find((e) => e.eventId === '1250201');
  assert.equal(hail!.primaryType, 'hail');
  assert.equal(hail!.magnitude, 1.25);
  assert.equal(hail!.magnitudeUnit, 'in');

  const zone = events.find((e) => e.eventId === '1255266');
  assert.equal(zone!.czType, 'Z');
  assert.equal(zone!.beginLat, null);
  assert.equal(zone!.magnitude, 62); // 54 kt → 62 mph
});
