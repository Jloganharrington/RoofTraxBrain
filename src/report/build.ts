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
import type {
  ReportDataV2,
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
  /** Office-supplied fields the field app does not capture. */
  office?: {
    adjusterName?: string | null;
    dateFiled?: string | null;
    projectStatus?: string | null;
    reportId?: string | null;
  };
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
        (p) => p.stage === 'collateral' || p.area === 'collateral',
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

export function photoArea(photo: SubmittedPhotoLike): ClaimArea | null {
  if (photo.area) return photo.area;
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
  if (photo.stage === 'collateral' || photo.area === 'collateral') return 'collateral';
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
        condition: [d.damageType, ...d.observedIndicators].filter(Boolean).join(', '),
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
      if (p.stage !== 'collateral' && p.area !== 'collateral') continue;
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
// capitalised word, or worse a multi-word string like "No action" — produces a
// broken class attribute. So this returns a bare token or empty, never prose.
export function verdictForStatus(status: string): ScopeItem['verdict'] {
  const s = status.toLowerCase();
  if (['damaged', 'failed', 'deteriorated', 'missing', 'compromised', 'fractured'].some((k) => s.includes(k))) {
    return 'replace';
  }
  if (['repairable', 'minor', 'serviceable'].some((k) => s.includes(k))) return 'repair';
  if (['functional', 'ok', 'good', 'intact', 'no damage'].some((k) => s.includes(k))) return 'monitor';
  return '';
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
      .filter((p) => p.stage === 'collateral' || p.area === 'collateral')
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

const DETERMINATION_PROSE: Record<string, string> = {
  repairable: 'Repairable in place.',
  not_repairable: 'Not repairable in place — full replacement required.',
};

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
// Main entry point
// ---------------------------------------------------------------------------

export function buildReportData(
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  opts: BuildReportDataOptions = {},
): ReportDataV2 {
  const missing: string[] = [];
  const note = (what: string) => missing.push(what);

  const { impact, derived } = resolveAreasImpacted(inspection);
  if (derived) note('areasImpacted: derived from records — app did not send damage flags');
  if (inspection.damageFlags && inspection.damageFlags.interiorDamageFound === undefined) {
    note('areasImpacted.interior: derived from interior observations — app has no interior flag yet');
  }

  const generatedAt = opts.generatedAt ?? new Date();
  const ps = inspection.propertySummary;
  const cd = inspection.constructionDescription;
  if (!ps) note('propertySummary: not captured by the app');
  if (!cd) note('constructionDescription: not captured by the app');
  if (ps?.roofAgeYears != null && !ps.roofAgeBasis) {
    note('propertySummary.roofAgeBasis: roof age given without a stated basis');
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
  const credentials = (inspection.inspector.certifications ?? [])
    .map((c) => (c.issuingBody ? `${c.name} (${c.issuingBody})` : c.name))
    .join('; ');
  if (!ra) note('repairabilityAssessment: no field assessment recorded — section will be omitted');
  else if (!credentials) {
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
      ? { ...tr, performed: true as const, sourceLabel: 'Tarp Invoice & Mitigation Log' }
      : null;

  const pp = inspection.propertyProtectionPlan;
  const propertyProtectionPlan =
    pp && pp.specializedRequired === true
      ? {
          specializedRequired: true as const,
          sourceLabel: 'Property-Protection Plan',
          description: pp.whyOrdinaryTarpingInsufficient ?? '',
          featureProtected: pp.featureProtected,
          whyOrdinaryTarpingInsufficient: pp.whyOrdinaryTarpingInsufficient,
          proposedEquipment: pp.proposedEquipment,
          setupMethod: pp.setupMethod,
          laborEstimate: null, // office-supplied
          rentalCost: null, // office-supplied
          photoIds: pp.photoIds,
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
  const address = inspection.property.address;

  return {
    schemaVersion: 2,

    logoUrl: config.company.logoRef ?? '',
    companyName: config.company.brandName,
    coverPhotoTag: '',
    propertyAddress: address,
    propertyAddressShort: address.split(',')[0] ?? address,
    customerName: inspection.property.insuredName ?? '',
    carrier: inspection.property.carrier ?? '',
    claimNumber: inspection.property.claimNumber ?? '',
    policyNumber: inspection.property.policyNumber ?? '',
    adjusterName: office.adjusterName ?? '',
    lossDate: inspection.property.dateOfLoss ?? '',
    dateFiled: office.dateFiled ?? '',
    inspectorName: inspection.inspector.name,
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
          stormType: storm.primaryType,
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
          questionPresented: ra.questionPresented,
          methodology: ra.methodology,
          materialsReviewed: ra.materialsReviewed,
          fieldTestFindings: ra.fieldTestFindings,
          conditionScoring: ra.conditionScoring,
          repairAttemptRisks: ra.repairAttemptRisks,
          // Raw enum would print as "not_repairable" in the rendered PDF.
          determination: DETERMINATION_PROSE[ra.determination] ?? ra.determination,
          recommendation: ra.recommendation,
          assessorName: inspection.inspector.name,
          assessorCredentials: credentials || null,
          supportingPhotoIds: ra.supportingPhotoIds,
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
