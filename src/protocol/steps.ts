// The forensic protocol step definitions, mirrored from the field app's
// `lib/protocol/src/stages.ts` (the source of truth).
//
// This exists so the Methodology exhibit can describe the protocol that was
// ACTUALLY enforced — its named steps, what each requires, and which are
// conditional — rather than a prose summary that drifts from the software.
//
// The retired `S0..S9` vocabulary in ./stages.ts predates this and is kept only
// for legacy submissions.
//
// KEEP IN SYNC with the app. If a step is added there and not here, the
// methodology section under-reports the protocol; `unknownSteps` in the built
// methodology block surfaces that rather than hiding it.

export type DamageFlagKey =
  | 'roofDamageFound'
  | 'sidingDamageFound'
  | 'collateralDamageFound'
  | 'interiorDamageFound';

export interface ProtocolStepDef {
  key: string;
  order: number;
  name: string;
  description: string;
  /** Damage flags that make this step apply. Empty = always applies. */
  appliesWhen: DamageFlagKey[];
}

export const PROTOCOL_STEPS: readonly ProtocolStepDef[] = [
  { key: 'arrival', order: 1, name: 'Arrival Log', appliesWhen: [],
    description: 'On-site conditions (sky, wind, temp), personnel present, GPS + time.' },
  { key: 'property_profile', order: 2, name: 'Property Profile', appliesWhen: [],
    description: 'Property & construction description — type, stories, roof age with basis, deck type.' },
  { key: 'elevation_access', order: 3, name: 'Elevation Walk', appliesWhen: [],
    description: 'A wide photo of each of the four elevations, plus the damage-found determinations.' },
  { key: 'facets', order: 4, name: 'Roof Facets & Measurements', appliesWhen: ['roofDamageFound'],
    description: 'Every roof facet with area, material, pitch and damage documentation, plus whole-roof linears.' },
  { key: 'test_squares', order: 5, name: 'Test Squares', appliesWhen: ['roofDamageFound'],
    description: 'A test-square photo on every facet that carries hail damage.' },
  { key: 'components', order: 6, name: 'Roof Components & Penetrations', appliesWhen: ['roofDamageFound'],
    description: 'Existing components and roof penetrations, each with a photo.' },
  { key: 'product', order: 7, name: 'Roofing Product ID', appliesWhen: ['roofDamageFound'],
    description: 'At least one roofing-product identification record.' },
  { key: 'siding', order: 8, name: 'Siding Inspection', appliesWhen: ['sidingDamageFound'],
    description: 'Siding facets: damage classification, facet photo, and per-component photos.' },
  { key: 'collateral', order: 9, name: 'Collateral Sweep', appliesWhen: ['collateralDamageFound'],
    description: 'Labeled collateral photos, roof-level then ground-level.' },
  { key: 'interior', order: 10, name: 'Interior / Attic', appliesWhen: ['interiorDamageFound'],
    description: 'Interior/attic evidence, or an explicit no-interior-claim waiver.' },
  { key: 'repairability', order: 11, name: 'Repairability Assessment',
    appliesWhen: ['roofDamageFound', 'sidingDamageFound'],
    description: 'Explicit repair-vs-replace field determination — never defaulted.' },
  { key: 'mitigation', order: 12, name: 'Temporary Repairs & Mitigation', appliesWhen: [],
    description: 'Emergency tarping / mitigation performed, with before & after photos.' },
  { key: 'homeowner', order: 13, name: 'Homeowner', appliesWhen: [],
    description: 'Factual homeowner intake (prior repairs, prior claims).' },
  { key: 'existing_conditions', order: 14, name: 'Existing / Unrelated Conditions', appliesWhen: [],
    description: 'Pre-existing or non-storm conditions explicitly excluded from the claim.' },
  { key: 'declaration', order: 15, name: 'Declaration', appliesWhen: [],
    description: 'The inspector signs off on the completeness of the capture.' },
  { key: 'submit', order: 16, name: 'Readiness & Submit', appliesWhen: [],
    description: 'Zero hard deficiencies remain and the package is confirmed ready.' },
] as const;

export const STEP_BY_KEY: ReadonlyMap<string, ProtocolStepDef> = new Map(
  PROTOCOL_STEPS.map((s) => [s.key, s]),
);

export function stepName(key: string): string {
  return STEP_BY_KEY.get(key)?.name ?? key;
}
