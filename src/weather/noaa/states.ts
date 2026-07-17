// US state reference (name / abbr / FIPS) and county-name normalization.
// NOAA Storm Events rows carry a STATE name and a CZ_NAME; a serviced county is
// entered as name + state. We resolve both to a stable {fips, abbr} and a
// normalized county key so coverage matching is exact regardless of the label
// form ("FAUQUIER CO." vs "FAUQUIER" vs "Fauquier County").

export interface UsState {
  abbr: string;
  fips: string;
  name: string;
}

const STATES: UsState[] = [
  { abbr: 'AL', fips: '01', name: 'ALABAMA' },
  { abbr: 'AK', fips: '02', name: 'ALASKA' },
  { abbr: 'AZ', fips: '04', name: 'ARIZONA' },
  { abbr: 'AR', fips: '05', name: 'ARKANSAS' },
  { abbr: 'CA', fips: '06', name: 'CALIFORNIA' },
  { abbr: 'CO', fips: '08', name: 'COLORADO' },
  { abbr: 'CT', fips: '09', name: 'CONNECTICUT' },
  { abbr: 'DE', fips: '10', name: 'DELAWARE' },
  { abbr: 'DC', fips: '11', name: 'DISTRICT OF COLUMBIA' },
  { abbr: 'FL', fips: '12', name: 'FLORIDA' },
  { abbr: 'GA', fips: '13', name: 'GEORGIA' },
  { abbr: 'HI', fips: '15', name: 'HAWAII' },
  { abbr: 'ID', fips: '16', name: 'IDAHO' },
  { abbr: 'IL', fips: '17', name: 'ILLINOIS' },
  { abbr: 'IN', fips: '18', name: 'INDIANA' },
  { abbr: 'IA', fips: '19', name: 'IOWA' },
  { abbr: 'KS', fips: '20', name: 'KANSAS' },
  { abbr: 'KY', fips: '21', name: 'KENTUCKY' },
  { abbr: 'LA', fips: '22', name: 'LOUISIANA' },
  { abbr: 'ME', fips: '23', name: 'MAINE' },
  { abbr: 'MD', fips: '24', name: 'MARYLAND' },
  { abbr: 'MA', fips: '25', name: 'MASSACHUSETTS' },
  { abbr: 'MI', fips: '26', name: 'MICHIGAN' },
  { abbr: 'MN', fips: '27', name: 'MINNESOTA' },
  { abbr: 'MS', fips: '28', name: 'MISSISSIPPI' },
  { abbr: 'MO', fips: '29', name: 'MISSOURI' },
  { abbr: 'MT', fips: '30', name: 'MONTANA' },
  { abbr: 'NE', fips: '31', name: 'NEBRASKA' },
  { abbr: 'NV', fips: '32', name: 'NEVADA' },
  { abbr: 'NH', fips: '33', name: 'NEW HAMPSHIRE' },
  { abbr: 'NJ', fips: '34', name: 'NEW JERSEY' },
  { abbr: 'NM', fips: '35', name: 'NEW MEXICO' },
  { abbr: 'NY', fips: '36', name: 'NEW YORK' },
  { abbr: 'NC', fips: '37', name: 'NORTH CAROLINA' },
  { abbr: 'ND', fips: '38', name: 'NORTH DAKOTA' },
  { abbr: 'OH', fips: '39', name: 'OHIO' },
  { abbr: 'OK', fips: '40', name: 'OKLAHOMA' },
  { abbr: 'OR', fips: '41', name: 'OREGON' },
  { abbr: 'PA', fips: '42', name: 'PENNSYLVANIA' },
  { abbr: 'RI', fips: '44', name: 'RHODE ISLAND' },
  { abbr: 'SC', fips: '45', name: 'SOUTH CAROLINA' },
  { abbr: 'SD', fips: '46', name: 'SOUTH DAKOTA' },
  { abbr: 'TN', fips: '47', name: 'TENNESSEE' },
  { abbr: 'TX', fips: '48', name: 'TEXAS' },
  { abbr: 'UT', fips: '49', name: 'UTAH' },
  { abbr: 'VT', fips: '50', name: 'VERMONT' },
  { abbr: 'VA', fips: '51', name: 'VIRGINIA' },
  { abbr: 'WA', fips: '53', name: 'WASHINGTON' },
  { abbr: 'WV', fips: '54', name: 'WEST VIRGINIA' },
  { abbr: 'WI', fips: '55', name: 'WISCONSIN' },
  { abbr: 'WY', fips: '56', name: 'WYOMING' },
];

const BY_ABBR = new Map(STATES.map((s) => [s.abbr, s]));
const BY_FIPS = new Map(STATES.map((s) => [s.fips, s]));
const BY_NAME = new Map(STATES.map((s) => [s.name, s]));

// Accepts an abbr ('VA'), full name ('Virginia'), or 2-digit FIPS ('51').
export function resolveState(input: string | null | undefined): UsState | null {
  if (!input) return null;
  const t = input.trim().toUpperCase();
  if (BY_ABBR.has(t)) return BY_ABBR.get(t)!;
  if (BY_NAME.has(t)) return BY_NAME.get(t)!;
  const fips = t.length === 1 ? `0${t}` : t;
  if (BY_FIPS.has(fips)) return BY_FIPS.get(fips)!;
  return null;
}

// Normalize a county / zone label to a stable comparison key. Strips the
// county/zone suffixes and the independent-city marker NOAA uses ("(C)"), so
// "FAIRFAX CO.", "FAIRFAX (C) CO.", "Fairfax County", and "FAIRFAX" all collapse
// to "FAIRFAX". Independent cities intentionally fold into the same key as the
// surrounding county — over-inclusive is safe (the per-report query filters by
// radius), under-inclusive would drop real events.
export function normalizeCountyName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toUpperCase()
    .replace(/\(C\)/g, ' ') // independent-city marker
    .replace(/\(ZONE\)/g, ' ')
    .replace(/\bCO\.?\b/g, ' ')
    .replace(/\bCOUNTY\b/g, ' ')
    .replace(/\bPARISH\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
