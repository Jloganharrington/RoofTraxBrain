import { gunzipSync } from 'node:zlib';

// Network access to the public NCEI bulk archive. Kept isolated so the pure
// parse/select/coverage logic never depends on I/O and unit-tests offline.
// NOTE: this performs outbound downloads of public NOAA files; it is only
// invoked by the ingest jobs / CLI, never during a test run.

export const NCEI_BASE = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';

export interface DetailsFile {
  year: number; // data year (dYYYY)
  created: string; // cYYYYMMDD stamp
  filename: string;
  url: string;
}

// Parse the directory index and return the newest `details` file per data year.
export async function listDetailsFiles(base = NCEI_BASE): Promise<DetailsFile[]> {
  const res = await fetch(base);
  if (!res.ok) throw new Error(`NCEI directory listing failed: ${res.status}`);
  const html = await res.text();
  const re = /StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d{8})\.csv\.gz/g;
  const newestByYear = new Map<number, DetailsFile>();
  for (const m of html.matchAll(re)) {
    const year = Number(m[1]);
    const created = m[2]!;
    const filename = m[0];
    const prev = newestByYear.get(year);
    if (!prev || created > prev.created) {
      newestByYear.set(year, { year, created, filename, url: `${base}${filename}` });
    }
  }
  return [...newestByYear.values()].sort((a, b) => b.year - a.year);
}

// Download a gzipped details file and return the decompressed CSV text.
export async function downloadDetails(file: DetailsFile): Promise<string> {
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`NCEI download failed (${file.filename}): ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return gunzipSync(buf).toString('utf8');
}
