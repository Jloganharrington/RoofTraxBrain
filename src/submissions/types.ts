// Contract v1 — the submission boundary between the field app and the Brain.
// Mirrors RoofTraxMobile's SubmissionManifestV1 + the inspection payload the app
// couriers up. The Brain stores this verbatim and renders the package from it.
// The Brain computes derived values (squares, waste, priced scope) — the app
// ships only raw facts.

export interface SubmissionManifestV1 {
  protocolVersion: string;
  generatedAtUtc: string;
  // record-type -> ids included in this package
  records: Record<string, string[]>;
  // photo integrity pairs, re-verified by intake before the Brain ever sees them
  photoHashes: Array<{ photoId: string; sha256: string }>;
  // client's advisory gate snapshot (the Brain re-derives its own if needed)
  gateResults: { deficiencies: unknown[]; softFlags: unknown[] };
  // server-authoritative signature reference
  signatureOnFile: { url: string; sha256: string; signedAt: string } | null;
}

// Photo capture context for the REPORT_DATA v2 curated photo log. Maps from the
// app's existing `triadRole` (wide|mid|close) plus two values the app adds for
// measurement and collateral shots. Phase-1 photos carry `preliminaryRole`
// instead of `triadRole` and map separately — see report/build.ts.
export type CaptureContext =
  | 'overview'
  | 'mid-range'
  | 'close-up'
  | 'measurement'
  | 'collateral';

// The four claim areas. `interior` is the fourth area the report renderer gates
// on; the app currently emits three damage flags and is adding the fourth.
export type ClaimArea = 'roof' | 'siding' | 'interior' | 'collateral';

export interface SubmittedPhoto {
  id: string;
  // Protocol v2 step key (`arrival`, `elevation_access`, `facets`, `test_squares`,
  // `siding`, ...). Legacy submissions carry the retired `S0..S9` vocabulary.
  stage: string;
  subjectType: string; // inspection | elevation | slope | test_square | test_square_hit | damage_instance | ...
  subjectId: string | null;
  url: string;
  sha256: string;
  triadRole: 'wide' | 'mid' | 'close' | null;
  // Phase-1 single-shot slot; mutually exclusive with triadRole.
  preliminaryRole?: string | null;
  // Which claim area this photo documents. Drives the area-conditional photo log.
  area?: ClaimArea | null;
  capturedAtUtc: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  caption: string | null;
}

export interface SubmittedInspection {
  id: string;
  companyId: string;
  stateCode: string; // jurisdiction, e.g. "VA"
  property: {
    address: string;
    insuredName: string | null;
    carrier: string | null;
    policyNumber: string | null;
    claimNumber: string | null;
    dateOfLoss: string | null;
  };
  storm: {
    confirmedDate: string | null;
    // Full local timestamp of the confirmed report ('YYYY-MM-DDTHH:mm:ss'), if the
    // field app captured the event time (not just the day). Local to the property.
    datetimeLocal?: string | null;
    primaryType: 'hail' | 'wind' | 'tornado' | null;
    hailSize: number | null;
    windSpeed: number | null;
    distance: number | null;
    // Strike/report point of the confirmed event.
    latitude?: number | null;
    longitude?: number | null;
    // NWS WFO code (e.g. 'LWX'); if absent, parsed from `description`.
    station?: string | null;
    description: string | null;
    source: string;
    // Set when the storm of record was upgraded to the authoritative NCEI Storm
    // Events archive at package build (Phase-2): official Event ID + the episode
    // synopsis. Absent for the Phase-1 (VisualCrossing) storm.
    officialEventId?: string | null;
    episodeNarrative?: string | null;
  } | null;
  inspector: {
    name: string;
    licenseNumber: string | null;
    signatureUrl: string | null;
    signatureSha256: string | null;
    signedAt: string | null;
    // Individual credentials. A forensic opinion's weight attaches to the person
    // who rendered it, not the company (company-level creds live in the company
    // pack). Feeds `repairabilityAssessment.assessorCredentials`.
    certifications?: Array<{
      name: string;
      issuingBody: string | null;
      number: string | null;
      expiresOn: string | null;
    }>;
    yearsExperience?: number | null;
  };

  // ---- Protocol v2.1 — damage-area flags -------------------------------------
  // The app emits three today; `interior` is being added. Absent => fall back to
  // deriving impact from the presence of records for that area.
  damageFlags?: {
    roofDamageFound: boolean;
    sidingDamageFound: boolean;
    collateralDamageFound: boolean;
    interiorDamageFound?: boolean;
  } | null;

  // ---- Protocol v2.1 — arrival log (data only, no photos) ---------------------
  arrival?: {
    timeLocal: string | null;
    sky: string | null;
    windCondition: string | null;
    temp: string | null;
    personnelPresent: string[];
    latitude: number | null;
    longitude: number | null;
  } | null;

  // ---- REPORT_DATA v2 §3.1 — property + construction description --------------
  propertySummary?: {
    propertyType: string | null;
    stories: string | null;
    roofType: string | null;
    roofAgeYears: number | null;
    // How roof age was established — an unsourced age is attackable.
    roofAgeBasis: string | null;
    accessibilityNotes: string | null;
  } | null;

  constructionDescription?: {
    buildingType: string | null;
    attachedOrDetached: string | null;
    roofGeometry: string[];
    deckType: string | null;
    framingConditionNotes: string | null;
  } | null;

  // Pre-existing / non-storm conditions the inspector explicitly excludes.
  // Documenting what is NOT storm damage is what makes the rest credible.
  existingOrUnrelatedConditions?: Array<{
    id: string;
    location: string;
    note: string;
  }>;

  // ---- REPORT_DATA v2 §3.1 — conditional modules ------------------------------
  // Presence (non-null) is the render trigger. NEVER fabricate a default.
  repairabilityAssessment?: {
    questionPresented: string | null;
    methodology: string | null;
    materialsReviewed: string | null;
    fieldTestFindings: string | null;
    conditionScoring: string | null;
    repairAttemptRisks: string | null;
    determination: 'repairable' | 'not_repairable';
    recommendation: string | null;
    productDiscontinued: boolean | null;
    matchingMaterialAvailable: boolean | null;
    supportingPhotoIds: string[];
  } | null;

  temporaryRepairs?: {
    performed: boolean; // must be explicitly true
    description: string | null;
    datePerformed: string | null;
    materialsUsed: string | null;
    crewAndEquipment: string | null;
    tarpInvoiceRef: string | null;
    beforeAfterPhotoIds: string[];
  } | null;

  propertyProtectionPlan?: {
    // Explicit flag for scaffold/specialized cases — never inferred from
    // "some protection exists". Ordinary tarping does not qualify.
    specializedRequired: boolean;
    featureProtected: string[];
    whyOrdinaryTarpingInsufficient: string | null;
    proposedEquipment: string | null;
    setupMethod: string | null;
    photoIds: string[];
  } | null;

  // Siding facets (protocol v2.1). No area/pitch/material — quantities come from
  // the office-side measurement report.
  sidingFacets?: Array<{
    id: string;
    label: string; // S1, S2, ...
    damaged: boolean;
    damageType: string | null; // wind | hail | tree
    componentCount: number;
  }>;
  methodology: {
    inspectedAt: string | null;
    conditions: string | null; // sky / wind / temp recorded on site
    equipment: string[];
  } | null;
  slopes: Array<{
    id: string;
    label: string; // F1, F2, ... (facet label)
    direction: string | null;
    pitch: string | null;
    material: string | null;
    // Protocol v2 — per-facet area feeds squares/pricing; damageType drives the
    // hail-gated test-square rule. Optional until every submission carries them.
    areaSqft?: number | null;
    damagePresent?: boolean;
    damageType?: string | null; // hail | wind | hail_and_wind | none
    // Tie-in protocol selections — drive fixed exhibit inclusion.
    tieInValley?: boolean;
    tieInHipRidge?: boolean;
  }>;
  elevations: Array<{ id: string; direction: string }>;
  damageInstances: Array<{
    id: string;
    slopeId: string | null;
    elevationId: string | null;
    material: string | null;
    damageType: string;
    observedIndicators: string[];
    causationNote: string | null;
  }>;
  testSquares: Array<{
    id: string;
    slopeId: string;
    hitCount: number;
    inaccessible: boolean;
    inaccessibleReason: string | null;
    hits: Array<{ id: string; classification: string }>;
  }>;
  measurements: Array<{
    id: string;
    slopeId: string; // "" for whole-roof
    measurementType: string; // e.g. "slope_area_sqft", "ridge_lf", "pitch"
    value: number;
    unit: string;
  }>;
  components: Array<{ id: string; componentType: string; status: string; note: string | null }>;
  penetrations: Array<{ id: string; penetrationType: string; count: number }>;
  products: Array<{
    id: string;
    identificationType: string; // field_identified | itel_sample | unidentifiable
    brand: string | null;
    line: string | null;
    unidentifiable: boolean;
  }>;
  interiorObservations: Array<{
    id: string;
    location: string;
    observationType: string;
    moistureReading: number | null;
  }>;
  homeownerFacts: {
    dateOfLossAwareness: string | null;
    priorRepairsOrClaims: string | null;
  } | null;
  photos: SubmittedPhoto[];
  attestations: Array<{
    id: string;
    stage: string;
    attestationType: string;
    details: Record<string, unknown> | null;
    hash: string | null;
  }>;
  addenda: Array<{ id: string; note: string; createdAt: string }>;
  submittedAt: string;
}

// The full POST body the app sends to the Brain at submission.
export interface SubmissionEnvelopeV1 {
  manifest: SubmissionManifestV1;
  inspection: SubmittedInspection;
}

export type SubmissionStatus =
  | 'received'
  | 'validating'
  | 'generating'        // B6: AI narrative generation in progress
  | 'package_ready'
  | 'rejected'
  | 'generation_failed'; // B6: AI guard/model failure (fail-closed)
