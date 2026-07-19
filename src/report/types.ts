// REPORT_DATA v2 — the payload consumed by the Phase 2 proof-package HTML
// template. Shaped to what the template ACTUALLY reads, which diverges from the
// structure-map prose in a few places (noted inline). The template is the real
// consumer, so it wins; the divergences are listed in the reconciliation notes
// handed back to the template track.

import type { ClaimArea, CaptureContext } from '../submissions/types.js';

// The template iterates `REPORT_DATA.areasImpacted.forEach(...)`, so this is an
// ARRAY — not the `{ roof: { impacted } }` object the spec text described.
export interface AreaImpactEntry {
  key: ClaimArea;
  name: string;
  impacted: boolean;
}

export interface ObservedDamageEntry {
  location: string;
  condition: string;
  // Carries the causation note. NOTE: the current template renders only
  // `location` + `condition` and drops this — flagged to the template track.
  note: string | null;
}

export interface ReportPhoto {
  id: string;
  area: ClaimArea | null;
  label: string;
  desc: string;
  captureContext: CaptureContext | null;
}

export interface ScopeItem {
  component: string;
  condition: string;
  method: string;
  // Lowercase token ONLY — the template interpolates this straight into
  // `class="verdict ${verdict}"` and styles `.verdict.replace/.repair/.monitor`.
  // Any capitalised or multi-word value produces a broken class attribute.
  verdict: 'replace' | 'repair' | 'monitor' | '';
}

export interface ScopeCategory {
  category: string;
  items: ScopeItem[];
}

export interface ReportComponents {
  roof: ScopeCategory[];
  siding: ScopeCategory[];
  interior: ScopeCategory[];
  collateral: ScopeCategory[];
}

export interface ReportPropertySummary {
  propertyType: string | null;
  stories: string | null;
  roofType: string | null;
  roofAgeYears: number | null;
  roofAgeBasis: string | null;
  roofSlopeCount: number;
  accessibilityNotes: string | null;
  areasAffected: ClaimArea[];
  temporaryRepairsCompleted: boolean;
  projectStatus: string | null;
}

// Template reads `restorationReport.construction` (not `constructionDescription`)
// and uses `configuration` / `framingNotes`, with roofGeometry as a STRING.
export interface ReportConstruction {
  buildingType: string | null;
  configuration: string | null;
  roofCovering: string | null;
  roofGeometry: string | null;
  deckType: string | null;
  framingNotes: string | null;
  flashingsAndPenetrations: string[];
  interiorAreasInspected: string[];
}

// ---------- Inspection Methodology & Protocol (folds into §3) ----------

export interface ReportMethodologyStep {
  order: number;
  name: string;
  description: string;
  applied: boolean;
  /** Why a step did not apply — stated, not silently omitted. */
  notApplicableReason: string | null;
}

export interface ReportMethodology {
  protocolName: string;
  protocolVersion: string;
  /**
   * The claim that distinguishes this from a narrative "we followed a
   * protocol": the application BLOCKED submission until every applicable
   * requirement was met, and the gate was re-evaluated server-side from stored
   * records so the device could not bypass it.
   */
  enforcementStatement: string;
  /** Grounded evidence for the statement above; null when not supplied. */
  enforcementEvidence: {
    hardDeficienciesAtSubmission: number;
    advisoryFlagsAtSubmission: number;
    photosHashVerified: number;
  } | null;
  conditions: {
    inspectedAt: string | null;
    sky: string | null;
    windCondition: string | null;
    temp: string | null;
    personnelPresent: string[];
  } | null;
  inspector: {
    name: string;
    credentials: string | null;
    licenseNumber: string | null;
  };
  equipment: string[];
  standards: {
    testSquareProtocol: string;
    markingStandard: string;
    photoStandard: string;
  };
  /** Tie-in marking protocols actually applied on this inspection. */
  tieInProtocolsApplied: string[];
  steps: ReportMethodologyStep[];
  captureRecord: Array<{ item: string; recorded: number }>;
  /** Photo counts per step, in protocol order (not alphabetical). */
  photosByStep: Array<{ step: string; count: number }>;
  /** Photo stages the Brain does not recognise — a sync warning, not hidden. */
  unknownSteps: string[];
}

export interface ReportRestorationReport {
  purposeAndScope: string;
  construction: ReportConstruction;
  observedDamage: Record<ClaimArea, ObservedDamageEntry[]>;
  existingOrUnrelatedConditions: Array<{ location: string; note: string }>;
  recommendedScopeNarrative: string;
}

export interface ReportWeatherEvidence {
  stormDate: string | null;
  stormType: string | null;
  // Pre-formatted with units — the template prints these verbatim.
  windGust: string | null;
  hailSize: string | null;
  stormSource: string;
  stormStation: string | null;
  causationSummary: string | null;
  ifNotForNote: string | null;
}

export interface ReportRepairabilityAssessment {
  questionPresented: string | null;
  methodology: string | null;
  materialsReviewed: string | null;
  fieldTestFindings: string | null;
  conditionScoring: string | null;
  repairAttemptRisks: string | null;
  determination: string; // human-readable prose, not the raw enum
  recommendation: string | null;
  assessorName: string;
  assessorCredentials: string | null;
  supportingPhotoIds: string[];
}

export interface ReportCodeCitation {
  key: string;
  area: ClaimArea | null;
  title: string;
  cite: string;
  body: string;
}

export interface ReportManufacturerSpecs {
  productIdentified: boolean;
  manufacturerName: string | null;
  productLine: string | null;
  publicationDate: string | null;
  relevantPages: string; // template interpolates directly — string, not array
}

export interface ReportTemporaryRepairs {
  performed: boolean;
  sourceLabel: string;
  description: string | null;
  datePerformed: string | null;
  materialsUsed: string | null;
  crewAndEquipment: string | null;
  tarpInvoiceRef: string | null;
  beforeAfterPhotoIds: string[];
}

export interface ReportPropertyProtectionPlan {
  specializedRequired: boolean;
  sourceLabel: string;
  description: string;
  featureProtected: string[];
  whyOrdinaryTarpingInsufficient: string | null;
  proposedEquipment: string | null;
  setupMethod: string | null;
  laborEstimate: number | null;
  rentalCost: number | null;
  photoIds: string[];
}

// Template reads `attached`, `sourceLabel` AND `description`.
export interface ExhibitRef {
  attached: boolean;
  sourceLabel: string;
  description: string;
}

export interface ReportExhibits {
  measurements: ExhibitRef;
  estimate: ExhibitRef;
  priceBook: ExhibitRef;
  pricingSupport: ExhibitRef;
  constructionAgreement: ExhibitRef;
  permitInspection: ExhibitRef;
}

export interface ReportDataV2 {
  schemaVersion: 2;

  // ---- flat fields bound by the template's `data-field` attributes ----
  // `bindFields` strips a trailing digit, so `customerName2` resolves here too.
  logoUrl: string;
  companyName: string;
  coverPhotoTag: string;
  propertyAddress: string;
  propertyAddressShort: string;
  customerName: string;
  carrier: string;
  // Frequently unavailable — a claim is often worked before the carrier issues
  // a number. Null (not '') so the template can OMIT the row entirely rather
  // than printing "Claim Number: —" on a carrier-facing document.
  claimNumber: string | null;
  policyNumber: string;
  adjusterName: string;
  lossDate: string;
  dateFiled: string;
  inspectorName: string;
  inspectorTitle: string;
  reportId: string;
  purposeNote: string;
  certificationText: string;
  concealedConditionProcedure: string;
  forensicSummary: string;

  // ---- structured ----
  propertySummary: ReportPropertySummary;
  methodology: ReportMethodology;
  areasImpacted: AreaImpactEntry[];
  restorationReport: ReportRestorationReport;
  photos: ReportPhoto[];
  weatherEvidence: ReportWeatherEvidence | null;
  repairabilityAssessment: ReportRepairabilityAssessment | null;
  codeCitations: ReportCodeCitation[];
  components: ReportComponents;
  manufacturerSpecs: ReportManufacturerSpecs | null;
  temporaryRepairs: ReportTemporaryRepairs | null;
  propertyProtectionPlan: ReportPropertyProtectionPlan | null;
  exhibits: ReportExhibits;
  digitalDocIndex: { fileList: Array<{ filename: string; category: string }> };

  missingInputs: string[];
}
