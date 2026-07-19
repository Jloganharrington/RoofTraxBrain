// Builds REPORT_DATA v2 from a submitted inspection + resolved config.
// Pure and synchronous — no DB, no HTTP — so it is fully testable from a fixture.
//
// Two rules govern every branch in this file:
//
//   NEVER FABRICATE. A conditional module is null unless the app explicitly said
//   it happened. An absent input becomes an entry in `missingInputs`, never a
//   plausible-looking default. The proof package's whole value is that a reader
//   can trust every field came from the field.
//
//   AREA-CONDITIONAL CONTENT IS EMPTIED, NOT OMITTED. An unimpacted area produces
//   zero content everywhere it would otherwise appear, so the template's
//   all-or-nothing area behaviour has something to act on.
//
// Output shape is dictated by what the HTML template actually reads — see
// report/types.ts for the places that diverge from the structure-map prose.

import type { SubmittedInspection, ClaimArea, CaptureContext } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import type { ScopeResult } from '../scope/types.js';
import type { ForensicNarratives } from '../ai/types.js';
import { PROTOCOL_STEPS, STEP_BY_KEY, type DamageFlagKey } from '../protocol/steps.js';
import { adaptSubmittedInspection } from '../submissions/adapt.js';
import type { SubmissionManifestV1 } from '../submissions/types.js';
import type {
  ReportDataV2,
  ReportMethodology,
  ReportMethodologyStep,
  ReportPhoto,
  ObservedDamageEntry,
  ScopeCategory,
  ScopeItem,
  ReportCodeCitation,
  AreaImpactEntry,
  ExhibitRef,
} from './types.js';

const ALL_AREAS: ClaimArea[] = ['roof', 'siding', 'interior', 'collateral'];
const AREA_NAMES: Record<ClaimArea, string> = {
  roof: 'Roof',
  siding: 'Siding',
  interior: 'Interior',
  collateral: 'Collateral',
};

type ImpactMap = Record<ClaimArea, boolean>;

export interface BuildReportDataOptions {
  scope?: ScopeResult | null;
  ai?: ForensicNarratives | null;
  generatedAt?: Date;
  attachments?: Partial<Record<keyof ReportDataV2['exhibits'], boolean>>;
  documentIndex?: Array<{ filename: string; category: string }>;
  /** Submission manifest — grounds the methodology enforcement evidence. */
  manifest?: SubmissionManifestV1 | null;
  /** Office-supplied fields the field app does not capture. */
  office?: {
    adjusterName?: string | null;
    dateFiled?: string | null;
    projectStatus?: string | null;
    reportId?: string | null;
  };
}


// ---------------------------------------------------------------------------
// Payload normalisation
// ---------------------------------------------------------------------------

// The envelope validator deliberately checks only package identity + photos and
// lets every other capture array through with .passthrough(). Our types declare
// those arrays as required, so a real payload that omits one used to crash the
// whole report with "Cannot read properties of undefined" — a 500 with no clue
// which field was at fault.
//
// Normalise every collection to an array here, and REPORT which ones were
// absent rather than silently treating missing data as empty. A missing
// collection is a courier gap worth knowing about; an empty one is a fact.
// Contract-required: absence means the courier dropped something it should
// have sent, and that is worth surfacing.
const REQUIRED_COLLECTIONS = [
  'slopes', 'elevations', 'damageInstances', 'testSquares', 'measurements',
  'components', 'penetrations', 'products', 'interiorObservations',
  'attestations', 'addenda', 'photos',
] as const;

// Genuinely optional in the contract — a roof-only claim has no siding facets,
// and most inspections exclude nothing. Absence is a fact, not a gap; coerce
// quietly so it does not drown the real signal.
const OPTIONAL_COLLECTIONS = ['sidingFacets', 'existingOrUnrelatedConditions'] as const;

export function normaliseInspection(
  inspection: SubmittedInspection,
): { inspection: SubmittedInspection; absent: string[] } {
  const absent: string[] = [];
  const patched = { ...inspection } as Record<string, unknown>;

  for (const key of REQUIRED_COLLECTIONS) {
    const v = patched[key];
    if (v == null) {
      absent.push(key);
      patched[key] = [];
    } else if (!Array.isArray(v)) {
      absent.push(`${key} (not an array)`);
      patched[key] = [];
    }
  }
  for (const key of OPTIONAL_COLLECTIONS) {
    const v = patched[key];
    if (v == null) {
      patched[key] = [];
    } else if (!Array.isArray(v)) {
      // Wrong type is still worth flagging even on an optional field.
      absent.push(`${key} (not an array)`);
      patched[key] = [];
    }
  }
  return { inspection: patched as unknown as SubmittedInspection, absent };
}

// ---------------------------------------------------------------------------
// Area impact
// ---------------------------------------------------------------------------

// Prefer the app's explicit damage flags. Derive from record presence only when
// flags are absent (pre-v2.1 submissions) — deriving loses the inspector's
// explicit claim-scope judgment, so it is a fallback, not the primary path.
export function resolveAreasImpacted(inspection: SubmittedInspection): {
  impact: ImpactMap;
  derived: boolean;
} {
  const flags = inspection.damageFlags;
  if (flags) {
    return {
      derived: false,
      impact: {
        roof: flags.roofDamageFound,
        siding: flags.sidingDamageFound,
        collateral: flags.collateralDamageFound,
        // The app is still adding this fourth flag. Until it ships, fall back to
        // interior observations rather than reporting `false`, which would
        // silently drop a documented interior claim.
        interior: flags.interiorDamageFound ?? inspection.interiorObservations.length > 0,
      },
    };
  }
  return {
    derived: true,
    impact: {
      roof: inspection.slopes.length > 0 || inspection.damageInstances.length > 0,
      siding: (inspection.sidingFacets ?? []).length > 0,
      interior: inspection.interiorObservations.length > 0,
      collateral: inspection.photos.some(
        (p) => p.stage === 'collateral' || photoArea(p) === 'collateral',
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

type SubmittedPhotoLike = SubmittedInspection['photos'][number];

const TRIAD_TO_CONTEXT: Record<string, CaptureContext> = {
  wide: 'overview',
  mid: 'mid-range',
  close: 'close-up',
};

const PRELIMINARY_TO_CONTEXT: Record<string, CaptureContext> = {
  front_elevation: 'overview',
  roof_overview: 'overview',
  damage_closeup: 'close-up',
  damage_closeup_roof: 'close-up',
  damage_closeup_siding: 'close-up',
  damage_closeup_collateral: 'collateral',
};

const CLAIM_AREAS = new Set<string>(ALL_AREAS);

// The field app's courier nests the signature under `signatureOnFile` and can
// send a null name; earlier submissions used three flat signature fields.
// Normalise both here rather than scattering fallbacks through the builder.
export function resolveInspector(
  inspector: SubmittedInspection['inspector'] | null | undefined,
) {
  // The envelope validator does not require `inspector`, so a payload can omit
  // the whole block. Reading through it unguarded threw and took the entire
  // report down with a 500. Degrade to a named placeholder instead.
  if (!inspector) {
    return {
      name: 'Inspector on file',
      licenseNumber: null,
      signatureUrl: null,
      signatureSha256: null,
      signedAt: null,
    };
  }
  return {
    name: inspector.name?.trim() || 'Inspector on file',
    licenseNumber: inspector.licenseNumber ?? null,
    signatureUrl: inspector.signatureOnFile?.url ?? inspector.signatureUrl ?? null,
    signatureSha256: inspector.signatureOnFile?.sha256 ?? inspector.signatureSha256 ?? null,
    signedAt: inspector.signatureOnFile?.signedAt ?? inspector.signedAt ?? null,
  };
}

export function photoArea(photo: SubmittedPhotoLike): ClaimArea | null {
  // Trust an explicit area ONLY when it is a real claim area. The app's photo
  // rows also carry a `zone` (eave_edge / ridge_hip) for the component gate,
  // and a courier that maps that onto `area` would otherwise put a value here
  // that matches no area — silently filtering the photo out of the log and
  // dropping evidence from the package. Fall through to derivation instead.
  if (photo.area && CLAIM_AREAS.has(photo.area)) return photo.area;
  if (photo.subjectType === 'siding_facet' || photo.stage === 'siding') return 'siding';
  if (photo.subjectType === 'interior' || photo.stage === 'interior') return 'interior';
  if (photo.stage === 'collateral') return 'collateral';
  if (
    ['facets', 'test_squares', 'components', 'product', 'elevation_access'].includes(photo.stage) ||
    ['slope', 'test_square', 'test_square_hit', 'damage_instance', 'elevation'].includes(
      photo.subjectType,
    )
  ) {
    return 'roof';
  }
  return null;
}

export function photoCaptureContext(photo: SubmittedPhotoLike): CaptureContext | null {
  if (photo.subjectType === 'measurement') return 'measurement';
  if (photo.stage === 'collateral' || photoArea(photo) === 'collateral') return 'collateral';
  if (photo.triadRole) return TRIAD_TO_CONTEXT[photo.triadRole] ?? null;
  if (photo.preliminaryRole) return PRELIMINARY_TO_CONTEXT[photo.preliminaryRole] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Observed damage
// ---------------------------------------------------------------------------

function buildObservedDamage(
  inspection: SubmittedInspection,
  impact: ImpactMap,
): Record<ClaimArea, ObservedDamageEntry[]> {
  const out: Record<ClaimArea, ObservedDamageEntry[]> = {
    roof: [], siding: [], interior: [], collateral: [],
  };
  const slopeLabel = new Map(inspection.slopes.map((s) => [s.id, s.label]));

  if (impact.roof) {
    for (const d of inspection.damageInstances) {
      if (!d.slopeId) continue;
      out.roof.push({
        location: slopeLabel.get(d.slopeId) ?? d.slopeId,
        condition: [d.damageType, ...(d.observedIndicators ?? [])].filter(Boolean).join(', '),
        note: d.causationNote,
      });
    }
  }
  if (impact.siding) {
    for (const f of inspection.sidingFacets ?? []) {
      if (!f.damaged) continue;
      out.siding.push({
        location: f.label,
        condition: f.damageType ?? 'damage documented',
        note: null,
      });
    }
  }
  if (impact.interior) {
    for (const o of inspection.interiorObservations) {
      out.interior.push({
        location: o.location,
        condition: o.observationType,
        note: o.moistureReading != null ? `Moisture reading: ${o.moistureReading}` : null,
      });
    }
  }
  if (impact.collateral) {
    for (const p of inspection.photos) {
      if (p.stage !== 'collateral' && photoArea(p) !== 'collateral') continue;
      out.collateral.push({
        location: p.caption ?? 'Collateral item',
        condition: 'Documented',
        note: null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scope of work
// ---------------------------------------------------------------------------

// The template interpolates the verdict straight into `class="verdict ${v}"`,
// and only `.replace` / `.repair` / `.monitor` are styled. Anything else — a
// capitalised word, or a multi-word string like "No action" — produces a broken
// class attribute. So this returns a bare token or empty, never prose.
//
// These vocabularies are CLOSED enums in the app schema, so map them explicitly
// rather than keyword-matching. Keyword matching missed `absent`, which silently
// dropped the verdict on a missing drip edge — a real scope line, and money off
// the estimate.
const COMPONENT_STATUS_VERDICT: Record<string, ScopeItem['verdict']> = {
  // An absent component has to be installed — that is replacement scope.
  absent: 'replace',
  present: 'monitor',
  // Genuinely unknown: no verdict rather than a guess.
  not_determined: '',
};

const INTERIOR_OBSERVATION_VERDICT: Record<string, ScopeItem['verdict']> = {
  ceiling_stain: 'repair',
  wall_stain: 'repair',
  moisture_reading: 'monitor',
  attic_pass: 'monitor',
  other: '',
};

export function verdictForStatus(status: string): ScopeItem['verdict'] {
  const s = status.trim().toLowerCase();
  return COMPONENT_STATUS_VERDICT[s] ?? INTERIOR_OBSERVATION_VERDICT[s] ?? '';
}

function buildComponents(
  inspection: SubmittedInspection,
  impact: ImpactMap,
): ReportDataV2['components'] {
  const method = 'Visual inspection';

  const roof: ScopeCategory[] = [];
  if (impact.roof) {
    const base = inspection.components.map((c) => ({
      component: c.componentType,
      condition: c.status,
      method,
      verdict: verdictForStatus(c.status),
    }));
    const pen = inspection.penetrations.map((p) => ({
      component: p.penetrationType,
      condition: `${p.count} documented`,
      method,
      verdict: '' as const,
    }));
    if (base.length) roof.push({ category: 'Base Roof System', items: base });
    if (pen.length) roof.push({ category: 'Additional Roof Work', items: pen });
  }

  const siding: ScopeCategory[] = [];
  if (impact.siding) {
    const items = (inspection.sidingFacets ?? []).map((f) => ({
      component: f.label,
      condition: f.damaged ? (f.damageType ?? 'damaged') : 'undamaged',
      method,
      verdict: (f.damaged ? 'replace' : 'monitor') as ScopeItem['verdict'],
    }));
    if (items.length) siding.push({ category: 'Siding & Elevations', items });
  }

  const interior: ScopeCategory[] = [];
  if (impact.interior) {
    const items = inspection.interiorObservations.map((o) => ({
      component: o.location,
      condition: o.observationType,
      method,
      verdict: verdictForStatus(o.observationType),
    }));
    if (items.length) interior.push({ category: 'Interior — By Room', items });
  }

  const collateral: ScopeCategory[] = [];
  if (impact.collateral) {
    const items = inspection.photos
      .filter((p) => p.stage === 'collateral' || photoArea(p) === 'collateral')
      .map((p) => ({
        component: p.caption ?? 'Collateral item',
        condition: 'Documented',
        method,
        verdict: '' as const,
      }));
    if (items.length) collateral.push({ category: 'Collateral Items', items });
  }

  return { roof, siding, interior, collateral };
}

// ---------------------------------------------------------------------------
// Code citations
// ---------------------------------------------------------------------------

// Unknown keys yield null ("not area-specific") — safer than mis-tagging a
// provision into an area that then filters it out of a report where it belonged.
function areaForScopeKey(key: string): ClaimArea | null {
  const k = key.toLowerCase();
  if (k.includes('siding') || k.includes('wrap') || k.includes('elevation')) return 'siding';
  if (k.includes('interior') || k.includes('drywall') || k.includes('ceiling')) return 'interior';
  if (['roof', 'shingle', 'deck', 'drip', 'flash', 'ridge', 'valley', 'underlay'].some((t) => k.includes(t))) {
    return 'roof';
  }
  return null;
}

function buildCodeCitations(config: ResolvedConfig, impact: ImpactMap): ReportCodeCitation[] {
  const out: ReportCodeCitation[] = [];
  for (const p of config.state.codeLibrary) {
    const area = p.appliesTo.map(areaForScopeKey).find((a): a is ClaimArea => a != null) ?? null;
    if (area && !impact[area]) continue;
    out.push({ key: p.id, area, title: p.title, cite: p.code, body: p.text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers — the template prints these verbatim, so units belong here.
// ---------------------------------------------------------------------------

// The app captures field-test findings as discrete booleans so the report can
// never assert brittleness or discontinuation that was not actually observed.
// The template prints `fieldTestFindings` as text, so an object would render as
// "[object Object]" — compose prose here, stating ONLY what was recorded.
export function composeFieldTestProse(
  f: NonNullable<SubmittedInspection['repairabilityAssessment']>['fieldTestFindings'],
): string {
  const parts: string[] = [];
  if (f.repairAttemptMade === true) parts.push('A repair attempt was performed on site.');
  else if (f.repairAttemptMade === false) parts.push('No repair attempt was performed.');
  if (f.adjacentShinglesFractured === true) {
    parts.push('Adjacent shingles fractured during the attempt, indicating brittleness.');
  } else if (f.adjacentShinglesFractured === false) {
    parts.push('Adjacent shingles did not fracture during the attempt.');
  }
  if (f.matchingMaterialSourceable === true) parts.push('Matching material was sourceable.');
  else if (f.matchingMaterialSourceable === false) parts.push('Matching material could not be sourced.');
  if (f.productDiscontinued === true) parts.push('The installed product is discontinued.');
  else if (f.productDiscontinued === false) parts.push('The installed product remains available.');
  if (f.notes) parts.push(f.notes);
  return parts.join(' ');
}

const DETERMINATION_PROSE: Record<string, string> = {
  repairable: 'Repairable in place.',
  not_repairable: 'Not repairable in place — full replacement required.',
};

// Storm type is a lowercase enum on the wire; the template prints it verbatim,
// so present it here rather than shipping "hail" into a carrier-facing document.
const STORM_TYPE_LABEL: Record<string, string> = {
  hail: 'Hail',
  wind: 'Wind',
  tornado: 'Tornado',
};

function formatStormType(t: string | null): string | null {
  if (!t) return null;
  return STORM_TYPE_LABEL[t] ?? t;
}

function formatHail(inches: number | null): string | null {
  return inches == null ? null : `${inches} in`;
}
function formatWind(mph: number | null): string | null {
  return mph == null ? null : `${mph} mph`;
}

const EXHIBIT_DESCRIPTIONS: Record<keyof ReportDataV2['exhibits'], string> = {
  measurements:
    'Roof areas, squares, slopes, pitch, eaves, rakes, ridges, hips, valleys, waste factor, and roof diagram.',
  estimate:
    'Detailed line items, quantities, pricing, taxes, overhead & profit, and area/category recaps.',
  priceBook:
    'Standard roof-system rate, CDX/FRT rates, restricted-access rate, and other consistently applied unit pricing.',
  pricingSupport:
    'Supplier quotes, material invoices, labor-cost build-up, and normalized comparable bids.',
  constructionAgreement:
    'Executed agreement establishing scope, pricing method, payment terms, and change-order procedure.',
  permitInspection:
    'Permit application, fee schedule, issued permit, inspection requests and results, and closed-permit record.',
};


// ---------------------------------------------------------------------------
// Inspection Methodology & Protocol
// ---------------------------------------------------------------------------

// Why a conditional step did not run. Stated explicitly rather than silently
// omitted: a reader seeing 11 of 16 steps should know the protocol ADAPTED by
// design, not that five steps were skipped.
const FLAG_REASON: Record<DamageFlagKey, string> = {
  roofDamageFound: 'no roof damage was identified',
  sidingDamageFound: 'no siding damage was identified',
  collateralDamageFound: 'no collateral damage was identified',
  interiorDamageFound: 'no interior damage was identified',
};

// This is the claim that separates a documented method from an assertion. It is
// only true because the app gates capture AND intake re-derives the gate
// server-side from stored rows — a field device cannot submit around it.
const ENFORCEMENT_STATEMENT =
  'This inspection was captured through a software-enforced protocol. Each step below ' +
  'defines the evidence it requires, and the application blocked submission until every ' +
  'applicable requirement was satisfied. At submission the gate was re-evaluated on the ' +
  'server from the stored records, and every photograph was re-hashed against the ' +
  'submission manifest — the capturing device could not bypass either check.';

function buildMethodology(
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  impact: ImpactMap,
  manifest: SubmissionManifestV1 | null,
): ReportMethodology {
  const flags: Record<DamageFlagKey, boolean> = {
    roofDamageFound: impact.roof,
    sidingDamageFound: impact.siding,
    collateralDamageFound: impact.collateral,
    interiorDamageFound: impact.interior,
  };

  const steps: ReportMethodologyStep[] = PROTOCOL_STEPS.map((def) => {
    const applied = def.appliesWhen.length === 0 || def.appliesWhen.some((f) => flags[f]);
    return {
      order: def.order,
      name: def.name,
      description: def.description,
      applied,
      notApplicableReason: applied
        ? null
        : `Not applicable — ${def.appliesWhen.map((f) => FLAG_REASON[f]).join(' and ')}.`,
    };
  });

  // Photo counts in PROTOCOL order, not alphabetical, and by step name.
  const counts = new Map<string, number>();
  for (const p of inspection.photos) counts.set(p.stage, (counts.get(p.stage) ?? 0) + 1);
  const photosByStep = PROTOCOL_STEPS.filter((d) => counts.has(d.key)).map((d) => ({
    step: d.name,
    count: counts.get(d.key) ?? 0,
  }));
  // Stages we do not recognise (legacy S0..S9, or a step added to the app and
  // not mirrored here). Surfaced rather than dropped.
  const unknownSteps = [...counts.keys()].filter((k) => !STEP_BY_KEY.has(k));

  const tieIns: string[] = [];
  if (inspection.slopes.some((s) => s.tieInValley)) tieIns.push('Valley');
  if (inspection.slopes.some((s) => s.tieInHipRidge)) tieIns.push('Hip / Ridge');

  const arrival = inspection.arrival;
  const legacy = inspection.methodology;
  const m = config.company.methodologyTemplate;

  const who = resolveInspector(inspection.inspector);
  const whoM = resolveInspector(inspection.inspector);  // null-safe
  const credentials = (inspection.inspector?.certifications ?? [])
    .map((c) => (c.issuingBody ? `${c.name} (${c.issuingBody})` : c.name))
    .join('; ');

  const totalHits = inspection.testSquares.reduce((n, ts) => n + ts.hitCount, 0);

  return {
    protocolName: 'RoofTrax Forensic Inspection Protocol',
    protocolVersion: manifest?.protocolVersion ?? 'unversioned',
    enforcementStatement: ENFORCEMENT_STATEMENT,
    enforcementEvidence: manifest
      ? {
          hardDeficienciesAtSubmission: manifest.gateResults?.deficiencies?.length ?? 0,
          advisoryFlagsAtSubmission: manifest.gateResults?.softFlags?.length ?? 0,
          photosHashVerified: manifest.photoHashes?.length ?? 0,
        }
      : null,
    conditions:
      arrival || legacy
        ? {
            inspectedAt: arrival?.timeLocal ?? legacy?.inspectedAt ?? null,
            sky: arrival?.sky ?? null,
            windCondition: arrival?.windCondition ?? null,
            temp: arrival?.temp ?? null,
            personnelPresent: arrival?.personnelPresent ?? [],
          }
        : null,
    inspector: {
      name: whoM.name,
      credentials: credentials || null,
      licenseNumber: whoM.licenseNumber,
    },
    equipment: legacy?.equipment?.length ? legacy.equipment : m.equipmentBaseline,
    standards: {
      testSquareProtocol: m.testSquareProtocol,
      markingStandard: m.markingStandard,
      photoStandard: m.photoStandard,
    },
    tieInProtocolsApplied: tieIns,
    steps,
    captureRecord: [
      { item: 'Elevations photographed', recorded: inspection.elevations.length },
      { item: 'Roof facets documented', recorded: inspection.slopes.length },
      { item: 'Siding facets documented', recorded: (inspection.sidingFacets ?? []).length },
      { item: 'Test squares marked', recorded: inspection.testSquares.length },
      { item: 'Impacts counted (all squares)', recorded: totalHits },
      { item: 'Damage instances documented', recorded: inspection.damageInstances.length },
      { item: 'Components & penetrations', recorded: inspection.components.length + inspection.penetrations.length },
      { item: 'Interior observations', recorded: inspection.interiorObservations.length },
      { item: 'Measurements recorded', recorded: inspection.measurements.length },
      { item: 'Total evidence photographs', recorded: inspection.photos.length },
    ],
    photosByStep,
    unknownSteps,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildReportData(
  rawInspection: SubmittedInspection,
  config: ResolvedConfig,
  opts: BuildReportDataOptions = {},
): ReportDataV2 {
  const missing: string[] = [];
  const note = (what: string) => missing.push(what);

  // Reconcile the app's wire shape to the contract (renames + derivations),
  // then coerce absent collections to []. Both report what they could not
  // resolve, so a gap surfaces as data rather than a 500.
  // Order matters: normalise SHAPE first so a genuinely absent (or wrong-typed)
  // collection is still reported, then adapt FIELD NAMES on arrays that are now
  // guaranteed to exist. Adapting first would coerce everything to [] and
  // silently swallow the very gaps we want surfaced.
  const { inspection: normalised, absent } = normaliseInspection(rawInspection);
  for (const key of absent) {
    note(`payload.${key}: absent from the submission — treated as empty`);
  }
  const adapted = adaptSubmittedInspection(normalised as never);
  for (const field of adapted.unmapped) {
    note(`contract.${field}: no source field in the app payload`);
  }
  const inspection = adapted.inspection as unknown as SubmittedInspection;

  if (!inspection.inspector) {
    note('payload.inspector: absent from the submission — the report cannot name who inspected');
  }

  const { impact, derived } = resolveAreasImpacted(inspection);
  if (derived) note('areasImpacted: derived from records — app did not send damage flags');
  if (inspection.damageFlags && inspection.damageFlags.interiorDamageFound === undefined) {
    note('areasImpacted.interior: derived from interior observations — app has no interior flag yet');
  }

  const generatedAt = opts.generatedAt ?? new Date();
  // One block on the app side; the report splits it across two sections.
  const pp0 = inspection.propertyProfile;
  const ps = pp0;
  const cd = pp0;
  if (!pp0) note('propertyProfile: not captured by the app');
  if (ps?.roofAgeYears != null && !ps?.roofAgeBasis) {
    note('propertySummary.roofAgeBasis: roof age given without a stated basis');
  }

  const methodology = buildMethodology(inspection, config, impact, opts.manifest ?? null);
  if (!opts.manifest) {
    note('methodology.enforcementEvidence: submission manifest not supplied — enforcement is stated but unquantified');
  }
  if (methodology.unknownSteps.length) {
    note(`methodology: unrecognised photo stages (protocol out of sync): ${methodology.unknownSteps.join(', ')}`);
  }

  const observedDamage = buildObservedDamage(inspection, impact);
  const components = buildComponents(inspection, impact);

  // An area flagged impacted that yields no content anywhere is a real defect,
  // not an empty section: the inspector asserted damage the record does not
  // support. Surface it rather than shipping a hollow section.
  for (const area of ALL_AREAS) {
    if (!impact[area]) continue;
    if (observedDamage[area].length === 0 && components[area].length === 0) {
      note(`areasImpacted.${area}: flagged impacted but no damage or scope records were captured`);
    }
  }

  const photos: ReportPhoto[] = inspection.photos
    .map((p) => ({
      id: p.id,
      area: photoArea(p),
      label: (photoArea(p) ?? '').toUpperCase(),
      desc: p.caption ?? '',
      captureContext: photoCaptureContext(p),
    }))
    .filter((p) => p.area == null || impact[p.area]);
  if (photos.some((p) => p.captureContext == null)) {
    note('photos.captureContext: some photos carry neither triadRole nor preliminaryRole');
  }

  const ra = inspection.repairabilityAssessment ?? null;
  const who = resolveInspector(inspection.inspector);
  const credentials = (inspection.inspector?.certifications ?? [])
    .map((c) => (c.issuingBody ? `${c.name} (${c.issuingBody})` : c.name))
    .join('; ');
  if (!ra) note('repairabilityAssessment: no field assessment recorded — section will be omitted');
  else if (!ra.assessorCredentials && !credentials) {
    note('repairabilityAssessment.assessorCredentials: inspector has no certifications on file');
  }

  const identified = inspection.products.find((p) => !p.unidentifiable && p.brand);
  const manufacturerSpecs = identified
    ? {
        productIdentified: true,
        manufacturerName: identified.brand,
        productLine: identified.line,
        publicationDate: null,
        relevantPages: '',
      }
    : null;
  if (!manufacturerSpecs) note('manufacturerSpecs: no identified product — section will be omitted');

  const tr = inspection.temporaryRepairs;
  const temporaryRepairs =
    tr && tr.performed === true
      ? {
          ...tr,
          performed: true as const,
          beforeAfterPhotoIds: tr.beforeAfterPhotoIds ?? [],
          sourceLabel: 'Tarp Invoice & Mitigation Log',
        }
      : null;

  const pp = inspection.propertyProtectionPlan;
  const propertyProtectionPlan =
    pp && pp.specializedRequired === true
      ? {
          specializedRequired: true as const,
          sourceLabel: 'Property-Protection Plan',
          description: pp.whyOrdinaryTarpingInsufficient ?? '',
          // Single-select on the app side; the report models it as a list.
          featureProtected: pp.featureProtected ? [pp.featureProtected] : [],
          whyOrdinaryTarpingInsufficient: pp.whyOrdinaryTarpingInsufficient ?? null,
          proposedEquipment: pp.proposedEquipment ?? null,
          setupMethod: pp.setupMethod ?? null,
          laborEstimate: null, // office-supplied
          rentalCost: null, // office-supplied
          photoIds: pp.photoIds ?? [],
        }
      : null;

  const att = opts.attachments ?? {};
  const exhibitRef = (key: keyof ReportDataV2['exhibits'], sourceLabel: string): ExhibitRef => {
    const attached = att[key] === true;
    if (!attached) note(`exhibits.${key}: not attached`);
    return { attached, sourceLabel, description: EXHIBIT_DESCRIPTIONS[key] };
  };

  const storm = inspection.storm;
  const areasImpacted: AreaImpactEntry[] = ALL_AREAS.map((key) => ({
    key,
    name: AREA_NAMES[key],
    impacted: impact[key],
  }));

  const office = opts.office ?? {};
  // `property.address` is the one field the envelope validator enforces, so
  // this should never be absent in practice — guarded anyway so no caller can
  // turn a data question into a 500.
  const property = inspection.property ?? ({} as SubmittedInspection['property']);
  const address = property.address ?? '';

  return {
    schemaVersion: 2,

    logoUrl: config.company.logoRef ?? '',
    companyName: config.company.brandName,
    coverPhotoTag: '',
    propertyAddress: address,
    propertyAddressShort: address.split(',')[0] ?? address,
    customerName: property.insuredName ?? '',
    carrier: property.carrier ?? '',
    claimNumber: property.claimNumber ?? '',
    policyNumber: property.policyNumber ?? '',
    adjusterName: office.adjusterName ?? '',
    lossDate: property.dateOfLoss ?? '',
    dateFiled: office.dateFiled ?? '',
    inspectorName: who.name,
    inspectorTitle: credentials || 'Field Inspector',
    reportId: office.reportId ?? inspection.id,
    purposeNote:
      'This report is a contractor scope submission documenting the physical condition of the ' +
      'property following the storm event referenced above. It presents observed damage, applicable ' +
      'building-code requirements, and repair method — it does not offer an opinion on coverage or ' +
      'policy interpretation.',
    certificationText:
      'I certify that the observations, measurements, and photographic evidence contained in this ' +
      'report were made by me or under my direct supervision, and accurately represent the condition ' +
      'of the property identified above on the date of inspection. This report constitutes a ' +
      'contractor scope submission and does not represent a coverage determination.',
    concealedConditionProcedure: [
      '1. Stop affected work when practical.',
      '2. Photograph and measure the condition.',
      '3. Notify the homeowner.',
      '4. Notify the carrier and provide a reinspection opportunity when appropriate.',
      '5. Prepare a written change order.',
      '6. Apply the previously disclosed unit price.',
      '7. Obtain homeowner authorization.',
      '8. Preserve invoices and installation photographs.',
      '',
      'This procedure applies with particular care to concealed sheathing conditions discovered during tear-off.',
    ].join('\n'),
    forensicSummary: opts.ai?.conclusion.statement ?? '',

    methodology,
    propertySummary: {
      propertyType: ps?.propertyType ?? null,
      stories: ps?.stories ?? null,
      roofType: ps?.roofType ?? null,
      roofAgeYears: ps?.roofAgeYears ?? null,
      roofAgeBasis: ps?.roofAgeBasis ?? null,
      roofSlopeCount: inspection.slopes.length,
      accessibilityNotes: ps?.accessibilityNotes ?? null,
      areasAffected: ALL_AREAS.filter((a) => impact[a]),
      temporaryRepairsCompleted: temporaryRepairs != null,
      projectStatus: office.projectStatus ?? null,
    },
    areasImpacted,
    restorationReport: {
      purposeAndScope: opts.ai?.conclusion.basis.join(' ') ?? '',
      construction: {
        buildingType: cd?.buildingType ?? null,
        configuration: cd?.attachedOrDetached ?? null,
        roofCovering:
          inspection.products.find((p) => p.brand)?.brand ??
          inspection.slopes.find((s) => s.material)?.material ??
          null,
        roofGeometry: cd?.roofGeometry?.length ? cd.roofGeometry.join(', ') : null,
        deckType: cd?.deckType ?? null,
        framingNotes: cd?.framingConditionNotes ?? null,
        flashingsAndPenetrations: [
          ...inspection.components.map((c) => c.componentType),
          ...inspection.penetrations.map((p) => p.penetrationType),
        ],
        interiorAreasInspected: inspection.interiorObservations.map((o) => o.location),
      },
      observedDamage,
      existingOrUnrelatedConditions: (inspection.existingOrUnrelatedConditions ?? []).map((c) => ({
        location: c.location,
        note: c.note,
      })),
      recommendedScopeNarrative: opts.ai?.conclusion.statement ?? '',
    },
    photos,
    weatherEvidence: storm
      ? {
          stormDate: storm.confirmedDate,
          stormType: formatStormType(storm.primaryType),
          windGust: formatWind(storm.windSpeed),
          hailSize: formatHail(storm.hailSize),
          stormSource: storm.source,
          stormStation: storm.station ?? null,
          causationSummary: storm.description,
          ifNotForNote:
            inspection.damageInstances.find((d) => d.causationNote)?.causationNote ?? null,
        }
      : null,
    repairabilityAssessment: ra
      ? {
          questionPresented: ra.questionPresented ?? null,
          methodology: ra.methodology ?? null,
          materialsReviewed: ra.materialsReviewed ?? null,
          fieldTestFindings: composeFieldTestProse(ra.fieldTestFindings),
          conditionScoring: ra.conditionScoring ?? null,
          repairAttemptRisks: ra.repairAttemptRisks ?? null,
          // Raw enum would print as "not_repairable" in the rendered PDF.
          determination: DETERMINATION_PROSE[ra.determination] ?? ra.determination,
          recommendation: ra.recommendation ?? null,
          // Prefer the identity recorded at assessment time over the live
          // profile: credentials can change, and the record should show what
          // they were when the opinion was rendered.
          assessorName: ra.assessorName || who.name,
          assessorCredentials: ra.assessorCredentials || credentials || null,
          supportingPhotoIds: ra.supportingPhotoIds ?? [],
        }
      : null,
    codeCitations: buildCodeCitations(config, impact),
    components,
    manufacturerSpecs,
    temporaryRepairs,
    propertyProtectionPlan,
    exhibits: {
      measurements: exhibitRef('measurements', 'Measurement Report'),
      estimate: exhibitRef('estimate', 'Contractor Estimate'),
      priceBook: exhibitRef('priceBook', `${config.company.brandName} Price Book`),
      pricingSupport: exhibitRef('pricingSupport', 'Supplier Quotes / Labor Build-Up'),
      constructionAgreement: exhibitRef('constructionAgreement', 'Signed Construction Agreement'),
      permitInspection: exhibitRef('permitInspection', 'Permit & Inspection Records'),
    },
    digitalDocIndex: { fileList: opts.documentIndex ?? [] },
    missingInputs: missing,
  };
}
