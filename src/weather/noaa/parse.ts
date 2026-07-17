import { resolveState, normalizeCountyName } from './states.js';

// Parser for NOAA/NCEI Storm Events "details" rows. Header-driven (matches by
// column NAME, not position) and tolerant of two layouts: the bulk FTP file
// (BEGIN_YEARMONTH/BEGIN_DAY/BEGIN_TIME, DAMAGE_PROPERTY like "250K",
// magnitude in knots for wind) and the Storm-Events search UI export
// (BEGIN_DATE/BEGIN_TIME, DAMAGE_PROPERTY_NUM numeric, CZ_NAME_STR). All output
// is normalized: wind magnitude → mph, hail → inches, county name → stable key.

export type StormEventType = 'hail' | 'wind' | 'tornado';

export interface NoaaEvent {
  eventId: string;
  episodeId: string | null;
  state: string; // upper, e.g. 'VIRGINIA'
  stateFips: string; // '51'
  czType: string; // 'C' | 'Z'
  czFips: string;
  czName: string; // normalized upper county/zone key
  wfo: string | null;
  eventType: string; // raw, e.g. 'Thunderstorm Wind'
  primaryType: StormEventType | 'other';
  beginLocal: string; // 'YYYY-MM-DDTHH:mm:ss' local wall time
  czTimezone: string | null;
  magnitude: number | null; // NORMALIZED (wind=mph, hail=in)
  magnitudeUnit: 'mph' | 'in' | null;
  magnitudeType: string | null;
  magnitudeRaw: number | null; // raw NOAA value (knots for wind)
  torFScale: string | null;
  damageProperty: number | null; // USD
  source: string | null;
  beginRange: number | null;
  beginAzimuth: string | null;
  beginLocation: string | null;
  beginLat: number | null;
  beginLon: number | null;
  episodeNarrative: string | null;
  eventNarrative: string | null;
}

// ---- RFC-4180-ish CSV reader (quoted fields, embedded commas/newlines) ----
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // handled by the \n branch; ignore lone CR
    } else {
      field += c;
    }
  }
  // trailing field/row (no final newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function numOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function classifyType(rawType: string | undefined): StormEventType | 'other' {
  const t = (rawType ?? '').toLowerCase();
  if (t.includes('hail')) return 'hail';
  if (t.includes('tornado')) return 'tornado';
  if (t.includes('wind')) return 'wind'; // Thunderstorm/High/Strong/Marine Wind
  return 'other';
}

const KNOTS_TO_MPH = 1.15078;
export function knotsToMph(kt: number): number {
  return Math.round(kt * KNOTS_TO_MPH);
}

// Storm Events wind magnitude is in KNOTS; hail is in INCHES. Normalize wind to
// mph so downstream gates/formatting are unit-consistent with VisualCrossing.
export function normalizeMagnitude(
  eventType: string | undefined,
  rawMagnitude: number | null,
): { value: number | null; unit: 'mph' | 'in' | null; raw: number | null } {
  const type = classifyType(eventType);
  if (rawMagnitude == null) return { value: null, unit: null, raw: null };
  if (type === 'hail') return { value: rawMagnitude, unit: 'in', raw: rawMagnitude };
  if (type === 'wind') return { value: knotsToMph(rawMagnitude), unit: 'mph', raw: rawMagnitude };
  return { value: null, unit: null, raw: rawMagnitude };
}

// Bulk DAMAGE_PROPERTY is a suffixed string ("250K", "1.50M", "10.00K", "0.00K");
// the search export gives a plain number. Handle both.
export function parseDamage(v: string | undefined): number | null {
  if (v == null) return null;
  const t = v.trim().toUpperCase();
  if (t === '' || t === '0' || t === '0.00K') return t === '' ? null : 0;
  const m = /^(\d+(?:\.\d+)?)([KMBT]?)$/.exec(t);
  if (!m) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const base = Number(m[1]);
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : m[2] === 'T' ? 1e12 : 1;
  return Math.round(base * mult);
}

// Build a local ISO timestamp. Prefers the bulk YEARMONTH/DAY/TIME triple;
// falls back to a search-export BEGIN_DATE ('MM/DD/YYYY') + BEGIN_TIME ('HHMM').
export function buildBeginLocal(
  yearmonth: string | undefined,
  day: string | undefined,
  time: string | undefined,
  beginDate?: string | undefined,
): string | null {
  const hhmm = (time ?? '').trim().padStart(4, '0');
  const hh = hhmm.slice(0, 2);
  const mm = hhmm.slice(2, 4);
  if (yearmonth && yearmonth.trim().length === 6 && day) {
    const y = yearmonth.slice(0, 4);
    const mo = yearmonth.slice(4, 6);
    const d = String(day).trim().padStart(2, '0');
    return `${y}-${mo}-${d}T${hh}:${mm}:00`;
  }
  if (beginDate) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(beginDate.trim());
    if (m) return `${m[3]}-${m[1]}-${m[2]}T${hh}:${mm}:00`;
  }
  return null;
}

// Header lookup that tolerates alternate column names across the two layouts.
function makeGetter(header: string[]) {
  const idx = new Map<string, number>();
  header.forEach((h, i) => idx.set(h.trim().toUpperCase(), i));
  return (row: string[], ...names: string[]): string | undefined => {
    for (const n of names) {
      const i = idx.get(n.toUpperCase());
      if (i != null) {
        const v = row[i];
        if (v != null && v.trim() !== '') return v.trim();
      }
    }
    return undefined;
  };
}

export function parseDetailsCsv(text: string): NoaaEvent[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0]!;
  const get = makeGetter(header);
  const out: NoaaEvent[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.length === 1 && (row[0] ?? '').trim() === '') continue; // blank line
    const eventId = get(row, 'EVENT_ID');
    if (!eventId) continue;

    const eventType = get(row, 'EVENT_TYPE') ?? '';
    const stateRaw = get(row, 'STATE', 'STATE_ABBR');
    const stateFipsRaw = get(row, 'STATE_FIPS');
    const resolved = resolveState(stateFipsRaw ?? stateRaw);
    const rawMag = numOrNull(get(row, 'MAGNITUDE'));
    const mag = normalizeMagnitude(eventType, rawMag);
    const beginLocal = buildBeginLocal(
      get(row, 'BEGIN_YEARMONTH'),
      get(row, 'BEGIN_DAY'),
      get(row, 'BEGIN_TIME'),
      get(row, 'BEGIN_DATE'),
    );
    if (!beginLocal) continue; // cannot place the event in time — skip

    out.push({
      eventId,
      episodeId: get(row, 'EPISODE_ID') ?? null,
      state: (resolved?.name ?? stateRaw ?? '').toUpperCase(),
      stateFips: resolved?.fips ?? stateFipsRaw ?? '',
      czType: (get(row, 'CZ_TYPE') ?? 'C').toUpperCase(),
      czFips: get(row, 'CZ_FIPS') ?? '',
      czName: normalizeCountyName(get(row, 'CZ_NAME', 'CZ_NAME_STR')),
      wfo: get(row, 'WFO') ?? null,
      eventType,
      primaryType: classifyType(eventType),
      beginLocal,
      czTimezone: get(row, 'CZ_TIMEZONE') ?? null,
      magnitude: mag.value,
      magnitudeUnit: mag.unit,
      magnitudeType: get(row, 'MAGNITUDE_TYPE') ?? null,
      magnitudeRaw: mag.raw,
      torFScale: get(row, 'TOR_F_SCALE') ?? null,
      damageProperty: parseDamage(get(row, 'DAMAGE_PROPERTY', 'DAMAGE_PROPERTY_NUM')),
      source: get(row, 'SOURCE') ?? null,
      beginRange: numOrNull(get(row, 'BEGIN_RANGE')),
      beginAzimuth: get(row, 'BEGIN_AZIMUTH') ?? null,
      beginLocation: get(row, 'BEGIN_LOCATION') ?? null,
      beginLat: numOrNull(get(row, 'BEGIN_LAT')),
      beginLon: numOrNull(get(row, 'BEGIN_LON')),
      episodeNarrative: get(row, 'EPISODE_NARRATIVE') ?? null,
      eventNarrative: get(row, 'EVENT_NARRATIVE') ?? null,
    });
  }
  return out;
}
