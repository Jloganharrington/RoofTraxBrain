// Onboarding readiness — what a company still has to configure before it can
// produce a proof package.
//
// Pure and synchronous: takes the company pack, its service areas, and the
// state packs those areas resolve to, and returns the step model the Site's
// onboarding page renders. No DB, no HTTP.
//
// Two rules shape this file:
//
//   THE PRICE BOOK IS LOCKED UNTIL SERVICE AREAS EXIST. Adder rates are keyed to
//   StatePack.adderRules[].key, so authoring a price book before service areas
//   are known means rating keys nobody can enumerate. The lock is structural,
//   not advisory.
//
//   AN UNRATED ADDER IS A SILENT HOLE. A configured service state whose adder has
//   no company rate produces a $0 or dropped scope line — money quietly missing
//   from an estimate. It blocks completion rather than warning.

import type { CompanyPack, StatePack, AdderRule } from '../tenancy/types.js';

export type OnboardingStepKey =
  | 'company_identity'
  | 'licensing'
  | 'qualifications'
  | 'service_areas'
  | 'price_book';

export type OnboardingStepStatus = 'complete' | 'incomplete' | 'locked';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  status: OnboardingStepStatus;
  /** Whether an incomplete state blocks package building. */
  required: boolean;
  /** Set when status is 'locked' — the step that must be completed first. */
  blockedBy?: OnboardingStepKey;
  /** Specific, user-facing things still missing. */
  missing: string[];
}

export interface ServiceArea {
  stateCode: string;
  counties: string[];
}

export interface PriceBookSummary {
  version: number;
  effectiveFrom: string;
  pricePerSquare: number | null;
  adderRates: Record<string, number>;
  basisStatement: string | null;
}

export interface OnboardingStatus {
  companyId: string;
  steps: OnboardingStep[];
  /** True only when every required step is complete. */
  canBuildPackages: boolean;
  /** Flat list of blocking reasons, for a summary banner. */
  blockers: string[];
  /** Adders the company must rate, across all configured service states. */
  requiredAdders: Array<AdderRule & { stateCode: string; rated: boolean }>;
}

export interface ReadinessInput {
  companyId: string;
  pack: CompanyPack | null;
  serviceAreas: ServiceArea[];
  /** State packs for the configured service areas, keyed by state code. */
  statePacks: Record<string, StatePack>;
  priceBook: PriceBookSummary | null;
}

// Union of adder rules across every configured service state, tagged with
// whether the company's active price book rates them. Deduped by key: two
// states defining the same adder key need one rate, not two.
export function enumerateRequiredAdders(
  serviceAreas: ServiceArea[],
  statePacks: Record<string, StatePack>,
  adderRates: Record<string, number>,
): Array<AdderRule & { stateCode: string; rated: boolean }> {
  const seen = new Set<string>();
  const out: Array<AdderRule & { stateCode: string; rated: boolean }> = [];
  for (const area of serviceAreas) {
    const pack = statePacks[area.stateCode];
    if (!pack) continue;
    for (const rule of pack.adderRules) {
      if (seen.has(rule.key)) continue;
      seen.add(rule.key);
      out.push({
        ...rule,
        stateCode: area.stateCode,
        rated: typeof adderRates[rule.key] === 'number',
      });
    }
  }
  return out;
}

function identityStep(pack: CompanyPack | null): OnboardingStep {
  const missing: string[] = [];
  if (!pack) missing.push('Company profile not started');
  else {
    if (!pack.legalName) missing.push('Legal business name');
    if (!pack.brandName) missing.push('Brand/display name');
    const lh = pack.letterhead;
    if (!lh?.addressLines?.length) missing.push('Business address');
    if (!lh?.phone) missing.push('Phone number');
    if (!lh?.email) missing.push('Email address');
    // Logo is deliberately NOT required — a missing logo degrades the letterhead
    // gracefully, unlike a missing license which actively damages the package.
  }
  return {
    key: 'company_identity',
    label: 'Company Information',
    status: missing.length ? 'incomplete' : 'complete',
    required: true,
    missing,
  };
}

function licensingStep(pack: CompanyPack | null): OnboardingStep {
  const missing: string[] = [];
  const licenses = pack?.licenses ?? [];
  if (licenses.length === 0) {
    // Not cosmetic: a package that renders "No licenses on file" to a carrier
    // hands an adjuster a ready-made line of attack.
    missing.push('At least one contractor license');
  }
  for (const l of licenses) {
    if (!l.state || !l.number) missing.push(`Incomplete license entry (${l.state || l.number || '?'})`);
  }
  return {
    key: 'licensing',
    label: 'Licensing',
    status: missing.length ? 'incomplete' : 'complete',
    required: true,
    missing,
  };
}

function qualificationsStep(pack: CompanyPack | null): OnboardingStep {
  const missing: string[] = [];
  const q = pack?.qualifications;
  if (!q?.statement) missing.push('Statement of qualifications');
  if (q && q.experienceYears == null) missing.push('Years in business');
  return {
    key: 'qualifications',
    label: 'Qualifications',
    status: missing.length ? 'incomplete' : 'complete',
    // Not required: an empty qualifications block omits the section cleanly
    // rather than damaging the package. Encouraged, not enforced.
    required: false,
    missing,
  };
}

function serviceAreasStep(
  serviceAreas: ServiceArea[],
  statePacks: Record<string, StatePack>,
): OnboardingStep {
  const missing: string[] = [];
  if (serviceAreas.length === 0) missing.push('At least one service area');
  for (const area of serviceAreas) {
    if (!statePacks[area.stateCode]) {
      missing.push(`${area.stateCode} is not yet available on the platform`);
    }
    if (area.counties.length === 0) {
      missing.push(`No counties selected for ${area.stateCode}`);
    }
  }
  return {
    key: 'service_areas',
    label: 'Service Areas & Building Code',
    status: missing.length ? 'incomplete' : 'complete',
    required: true,
    missing,
  };
}

function priceBookStep(
  priceBook: PriceBookSummary | null,
  serviceAreasComplete: boolean,
  requiredAdders: Array<AdderRule & { rated: boolean }>,
): OnboardingStep {
  // Structural lock — see the header note.
  if (!serviceAreasComplete) {
    return {
      key: 'price_book',
      label: 'Price Book',
      status: 'locked',
      required: true,
      blockedBy: 'service_areas',
      missing: ['Complete Service Areas first — adder rates depend on the codes for your area'],
    };
  }

  const missing: string[] = [];
  if (!priceBook) missing.push('No price book published');
  else {
    if (priceBook.pricePerSquare == null) missing.push('Base roof system rate ($/square)');
    if (!priceBook.basisStatement) missing.push('Pricing basis statement');
    for (const a of requiredAdders) {
      if (!a.rated) missing.push(`Unrated adder: ${a.label} (${a.unit})`);
    }
  }
  return {
    key: 'price_book',
    label: 'Price Book',
    status: missing.length ? 'incomplete' : 'complete',
    required: true,
    missing,
  };
}

export function computeOnboardingStatus(input: ReadinessInput): OnboardingStatus {
  const { companyId, pack, serviceAreas, statePacks, priceBook } = input;

  const identity = identityStep(pack);
  const licensing = licensingStep(pack);
  const qualifications = qualificationsStep(pack);
  const areas = serviceAreasStep(serviceAreas, statePacks);

  const requiredAdders = enumerateRequiredAdders(
    serviceAreas,
    statePacks,
    priceBook?.adderRates ?? {},
  );
  const price = priceBookStep(priceBook, areas.status === 'complete', requiredAdders);

  const steps = [identity, licensing, qualifications, areas, price];
  const blockers = steps
    .filter((s) => s.required && s.status !== 'complete')
    .flatMap((s) => s.missing.map((m) => `${s.label}: ${m}`));

  return {
    companyId,
    steps,
    canBuildPackages: blockers.length === 0,
    blockers,
    requiredAdders,
  };
}
