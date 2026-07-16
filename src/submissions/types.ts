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

export interface SubmittedPhoto {
  id: string;
  stage: string; // S0..S9
  subjectType: string; // inspection | elevation | slope | test_square | test_square_hit | damage_instance | ...
  subjectId: string | null;
  url: string;
  sha256: string;
  triadRole: 'wide' | 'mid' | 'close' | null;
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
    primaryType: 'hail' | 'wind' | 'tornado' | null;
    hailSize: number | null;
    windSpeed: number | null;
    distance: number | null;
    description: string | null;
    source: string;
  } | null;
  inspector: {
    name: string;
    licenseNumber: string | null;
    signatureUrl: string | null;
    signatureSha256: string | null;
    signedAt: string | null;
  };
  methodology: {
    inspectedAt: string | null;
    conditions: string | null; // sky / wind / temp recorded on site
    equipment: string[];
  } | null;
  slopes: Array<{
    id: string;
    label: string;
    direction: string | null;
    pitch: string | null;
    material: string | null;
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

export type SubmissionStatus = 'received' | 'validating' | 'package_ready' | 'rejected';
