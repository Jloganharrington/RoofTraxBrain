// Deterministic storm-event summary composer. Turns the confirmed storm-of-record
// (as forwarded from the field app's Phase 1 VisualCrossing selection) into the
// exact strings Exhibit D renders: a fact block, a source attribution line, a
// plain-language narrative, and an optional NWS note. Pure string/number work —
// no I/O, no Date/timezone math (the datetime is already local to the property,
// so we parse its components directly rather than construct a Date, which would
// re-interpret it in the server's timezone and shift the printed time).

export type StormType = 'hail' | 'wind' | 'tornado';

export interface StormSummaryInput {
  confirmedDate: string | null; // 'YYYY-MM-DD' (day of the confirmed report)
  datetimeLocal?: string | null; // 'YYYY-MM-DDTHH:mm:ss' local to the property, if captured
  primaryType: StormType | null;
  hailSize: number | null; // inches
  windSpeed: number | null; // mph
  distance: number | null; // miles from the property
  latitude?: number | null;
  longitude?: number | null;
  station?: string | null; // NWS WFO code (e.g. 'LWX'); if absent, parsed from description
  description: string | null; // raw VisualCrossing/NWS report text
  source: string; // provider, e.g. 'VisualCrossing' or 'NOAA/NCEI Storm Events Database'
  // Present when the storm of record came from the authoritative NCEI Storm
  // Events archive (Phase-2 upgrade): the official Event ID and the episode-level
  // meteorological synopsis that frames the whole storm system.
  officialEventId?: string | null;
  episodeNarrative?: string | null;
  dateOfLoss?: string | null; // claim date of loss on file, for cross-reference
}

export interface StormSummary {
  rows: Array<[string, string]>; // fact block for doc.keyValues
  sourceLine: string; // full source attribution
  narrative: string; // plain-language sentence
  note: string | null; // cleaned NWS remark (e.g. a correction), or null
  episodeNarrative: string | null; // NCEI episode synopsis, when available
}

// NWS Weather Forecast Offices — code → "City, ST". Extensible; unknown codes
// fall back to just the bare code. Mid-Atlantic (NuHome's market) first.
const WFO_OFFICES: Record<string, string> = {
  LWX: 'Sterling, VA',
  AKQ: 'Wakefield, VA',
  RNK: 'Blacksburg, VA',
  RLX: 'Charleston, WV',
  PHI: 'Mount Holly, NJ',
  CTP: 'State College, PA',
  GSP: 'Greer, SC',
  RAH: 'Raleigh, NC',
  OUN: 'Norman, OK',
  FWD: 'Fort Worth, TX',
  EWX: 'Austin/San Antonio, TX',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 'YYYY-MM-DD' -> 'May 16, 2025'. Returns the raw input if it doesn't parse.
export function formatMonthDay(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${MONTHS[monthIdx]} ${day}, ${year}`;
}

// 'YYYY-MM-DDTHH:mm(:ss)' -> '9:38 PM' (local, no timezone conversion).
export function formatLocalTime(datetimeLocal: string | null | undefined): string | null {
  if (!datetimeLocal) return null;
  const m = /T(\d{2}):(\d{2})/.exec(datetimeLocal);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12}:${String(min).padStart(2, '0')} ${period}`;
}

// Pull the trailing NWS station code, e.g. "...City. (OUN)" -> "OUN".
export function parseStation(description: string | null | undefined): string | null {
  if (!description) return null;
  const matches = description.match(/\(([A-Za-z0-9]{2,5})\)/g);
  const last = matches?.[matches.length - 1];
  if (!last) return null;
  return last.replace(/[()]/g, '').toUpperCase();
}

// The report text minus the trailing "(XXX)" station token. Returns null when
// nothing meaningful remains (a bare "(OUN)" desc carries no narrative note).
export function cleanNote(description: string | null | undefined): string | null {
  if (!description) return null;
  let text = description.replace(/\(([A-Za-z0-9]{2,5})\)\s*$/, '').trim();
  if (!/[A-Za-z]/.test(text)) return null;
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function fmtHail(n: number): string {
  return `${n.toFixed(2)}"`;
}
function fmtDistance(n: number): string {
  return Number.isInteger(n) ? `${n} mi` : `${n.toFixed(1)} mi`;
}
function fmtCoords(lat: number, lng: number): string {
  return `${lat}, ${lng}`;
}

function eventLabel(input: StormSummaryInput): string {
  switch (input.primaryType) {
    case 'hail':
      return input.hailSize != null ? `Hail — ${fmtHail(input.hailSize)}` : 'Hail';
    case 'tornado':
      return 'Tornado';
    case 'wind':
    default:
      return input.windSpeed != null
        ? `Thunderstorm wind gust — ${input.windSpeed} mph`
        : 'Thunderstorm wind';
  }
}

// The verb phrase for the narrative sentence, per event type.
function eventClause(input: StormSummaryInput): string {
  switch (input.primaryType) {
    case 'hail':
      return input.hailSize != null
        ? `logged a hail report measuring ${fmtHail(input.hailSize)} in diameter`
        : 'logged a hail report';
    case 'tornado':
      return 'confirmed a tornado';
    case 'wind':
    default:
      return input.windSpeed != null
        ? `recorded a thunderstorm wind gust of ${input.windSpeed} mph`
        : 'recorded a thunderstorm wind event';
  }
}

export function composeStormSummary(input: StormSummaryInput): StormSummary {
  const station = input.station ?? parseStation(input.description);
  const office = station ? WFO_OFFICES[station] : undefined;
  const isStormEvents = /storm events|ncei/i.test(input.source);
  const provider = /visual/i.test(input.source) ? 'Visual Crossing' : input.source;

  const nwsAuthority = station
    ? `NWS ${station}${office ? ` (${office})` : ''}`
    : 'National Weather Service';
  const wfoBit = station ? ` — WFO ${station}${office ? ` (${office})` : ''}` : '';
  const sourceLine = isStormEvents
    ? `NOAA/NCEI Storm Events Database${wfoBit}${
        input.officialEventId ? `, Event ID ${input.officialEventId}` : ''
      }`
    : `NOAA/NWS Local Storm Report${wfoBit}, via ${provider}`;

  const dateLabel = formatMonthDay(input.confirmedDate);
  const timeLabel = formatLocalTime(input.datetimeLocal);
  const dateTimeCell =
    dateLabel && timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel ?? '-';

  const rows: Array<[string, string]> = [
    ['Confirmed event', eventLabel(input)],
    ['Date & local time', dateTimeCell],
    ['Distance from property', input.distance != null ? fmtDistance(input.distance) : '-'],
  ];
  if (input.latitude != null && input.longitude != null) {
    rows.push(['Report location', fmtCoords(input.latitude, input.longitude)]);
  }
  rows.push(['Source', sourceLine]);

  // Narrative sentence.
  const when = dateLabel
    ? `On ${dateLabel}${timeLabel ? ` at ${timeLabel} local time` : ''}`
    : 'On the date of loss';
  const distancePhrase =
    input.distance != null ? ` approximately ${fmtDistance(input.distance)} from the insured property` : '';
  const coordsPhrase =
    input.latitude != null && input.longitude != null
      ? ` (${fmtCoords(input.latitude, input.longitude)})`
      : '';
  const narrative =
    `${when}, the ${nwsAuthority} ${eventClause(input)}${distancePhrase}${coordsPhrase}. ` +
    'Retrieval and eligibility are deterministic — this event was selected as the storm of record ' +
    'under fixed severe-weather gates, with no AI scoring.';

  return {
    rows,
    sourceLine,
    narrative,
    note: cleanNote(input.description),
    episodeNarrative: input.episodeNarrative ?? null,
  };
}
