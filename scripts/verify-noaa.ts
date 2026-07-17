import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { buildPackage } from '../src/pdf/assemble.js';
import { sampleInspection, sampleConfig } from '../src/pdf/fixtures.js';
import { parseDetailsCsv } from '../src/weather/noaa/parse.js';
import { selectStormOfRecord, toStormSummaryInput } from '../src/weather/noaa/select.js';
import { toStormBlock } from '../src/weather/noaa/query.js';
import { composeStormSummary } from '../src/weather/summary.js';

// End-to-end offline proof of the NOAA authoritative-storm path (no DB, no
// network): parse the bulk-format fixture → select the storm of record for a
// Reston property + date of loss → overlay it onto the fixture inspection →
// render the package. Exhibit D should show NCEI attribution + the episode
// synopsis rather than the VisualCrossing storm.
async function main(): Promise<void> {
  const csv = await readFile(new URL('../src/weather/noaa/__fixtures__/details-sample.csv', import.meta.url), 'utf8');
  const events = parseDetailsCsv(csv);

  const match = selectStormOfRecord(events, {
    lat: 38.96,
    lng: -77.34,
    dateOfLoss: '2025-06-19',
    withinMiles: 25,
    windowDays: 2,
  });
  if (!match) throw new Error('no storm of record selected');

  const input = toStormSummaryInput(match, '2025-06-19');
  const summary = composeStormSummary(input);
  console.log('[verify-noaa] storm of record:', match.event.eventId, `(${match.distanceMi?.toFixed(2)} mi)`);
  console.log('[verify-noaa] source:', summary.sourceLine);
  console.log('[verify-noaa] narrative:', summary.narrative);

  const inspection = { ...sampleInspection, storm: toStormBlock(input) };
  const built = await buildPackage(inspection, sampleConfig, {
    generatedAt: new Date('2026-05-20T15:10:00Z'),
  });
  await mkdir('out', { recursive: true });
  await writeFile('out/noaa-sample.pdf', built.bytes);
  console.log(`[verify-noaa] wrote out/noaa-sample.pdf — ${built.pageCount} pages.`);
}

main().catch((err) => {
  console.error('[verify-noaa] failed:', err);
  process.exit(1);
});
