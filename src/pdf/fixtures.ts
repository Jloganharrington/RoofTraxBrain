import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import { NUHOME_COMPANY_ID, nuHomeCompanyPack } from '../config/packs/nuhome.js';
import { virginiaStatePack } from '../config/packs/virginia.js';

// A realistic Fairfax County, VA hail claim used to verify the package renderer
// end to end without a database. Exercises every B0-B5 exhibit.
export const sampleInspection: SubmittedInspection = {
  id: 'insp-sample-0001',
  companyId: NUHOME_COMPANY_ID,
  stateCode: 'VA',
  property: {
    address: '1420 Chain Bridge Rd, Fairfax, VA 22030',
    insuredName: 'Jordan & Alex Reyes',
    carrier: 'USAA',
    policyNumber: 'USAA-88231145',
    claimNumber: 'CLM-2026-0417',
    dateOfLoss: '2026-05-18',
  },
  storm: {
    confirmedDate: '2026-05-18',
    primaryType: 'hail',
    hailSize: 1.75,
    windSpeed: 58,
    distance: 2.1,
    description: 'Severe thunderstorm with 1.75" hail reported 2.1 mi from the property.',
    source: 'VisualCrossing',
  },
  inspector: {
    name: 'Sam Whitfield',
    licenseNumber: 'VA-CLASS-A-PLACEHOLDER',
    signatureUrl: 'objstore://signatures/sam-whitfield.png',
    signatureSha256: 'a'.repeat(64),
    signedAt: '2026-05-20T15:04:00Z',
  },
  methodology: {
    inspectedAt: '2026-05-20T13:30:00Z',
    conditions: 'Clear, 74F, winds calm.',
    equipment: ['Extension ladder', 'Chalk line', 'Hail gauge', 'Pitch gauge', 'GPS camera'],
  },
  slopes: [
    { id: 'slope-front', label: 'Front (South)', direction: 'S', pitch: '6/12', material: 'Asphalt shingle' },
    { id: 'slope-back', label: 'Back (North)', direction: 'N', pitch: '6/12', material: 'Asphalt shingle' },
  ],
  elevations: [
    { id: 'elev-front', direction: 'front' },
    { id: 'elev-right', direction: 'right' },
    { id: 'elev-back', direction: 'back' },
    { id: 'elev-left', direction: 'left' },
  ],
  damageInstances: [
    {
      id: 'dmg-1',
      slopeId: 'slope-front',
      elevationId: null,
      material: 'Asphalt shingle',
      damageType: 'hail_impact',
      observedIndicators: ['hail_hit', 'granule_loss', 'mat_exposure'],
      causationNote:
        'If not for the 5/18 hail event, this mat fracture with granule loss would not be present; ' +
        'the impact bruise pattern is consistent with hail, not foot traffic or manufacturing defect.',
    },
    {
      id: 'dmg-2',
      slopeId: 'slope-back',
      elevationId: null,
      material: 'Asphalt shingle',
      damageType: 'hail_impact',
      observedIndicators: ['hail_hit', 'granule_loss'],
      causationNote:
        'North slope impacts corroborate a multi-directional hail event consistent with the storm of record.',
    },
    {
      id: 'dmg-3',
      slopeId: null,
      elevationId: 'elev-left',
      material: 'Aluminum gutter',
      damageType: 'soft_metal_spatter',
      observedIndicators: ['soft_metal_dents'],
      causationNote: 'Spatter marks on soft metals are collateral evidence of hail size and direction.',
    },
  ],
  testSquares: [
    {
      id: 'ts-front',
      slopeId: 'slope-front',
      hitCount: 9,
      inaccessible: false,
      inaccessibleReason: null,
      hits: Array.from({ length: 9 }, (_v, i) => ({ id: `ts-front-h${i + 1}`, classification: 'hail_strike' })),
    },
    {
      id: 'ts-back',
      slopeId: 'slope-back',
      hitCount: 7,
      inaccessible: false,
      inaccessibleReason: null,
      hits: Array.from({ length: 7 }, (_v, i) => ({ id: `ts-back-h${i + 1}`, classification: 'hail_strike' })),
    },
  ],
  measurements: [
    { id: 'm-front-area', slopeId: 'slope-front', measurementType: 'slope_area_sqft', value: 1520, unit: 'sqft' },
    { id: 'm-back-area', slopeId: 'slope-back', measurementType: 'slope_area_sqft', value: 1480, unit: 'sqft' },
    { id: 'm-ridge', slopeId: '', measurementType: 'ridge_lf', value: 42, unit: 'lf' },
    { id: 'm-eave', slopeId: '', measurementType: 'eave_lf', value: 96, unit: 'lf' },
    { id: 'm-rake', slopeId: '', measurementType: 'rake_lf', value: 68, unit: 'lf' },
  ],
  components: [
    { id: 'cmp-drip', componentType: 'drip_edge', status: 'absent', note: 'No drip edge present at eaves or rakes.' },
    { id: 'cmp-deck', componentType: 'decking', status: 'deteriorated', note: 'Two sheets of delaminated OSB at the north eave.' },
    { id: 'cmp-vent', componentType: 'ventilation', status: 'present', note: 'Ridge vent present.' },
  ],
  penetrations: [
    { id: 'pen-vent', penetrationType: 'plumbing_vent', count: 3 },
    { id: 'pen-chimney', penetrationType: 'chimney', count: 1 },
  ],
  products: [
    { id: 'prod-1', identificationType: 'field_identified', brand: 'GAF', line: 'Timberline HDZ', unidentifiable: false },
  ],
  interiorObservations: [
    { id: 'int-1', location: 'Upstairs bedroom ceiling', observationType: 'water_stain', moistureReading: 18.5 },
  ],
  homeownerFacts: {
    dateOfLossAwareness: 'Homeowner recalled a loud hail storm on the evening of 5/18.',
    priorRepairsOrClaims: 'No prior roof claims disclosed.',
  },
  photos: [
    { id: 'ph-overview', stage: 'S0', subjectType: 'inspection', subjectId: null, url: 'objstore://p/overview.jpg', sha256: '1'.repeat(64), triadRole: null, capturedAtUtc: '2026-05-20T13:31:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Front of home' },
    { id: 'ph-elev-front', stage: 'S1', subjectType: 'elevation', subjectId: 'elev-front', url: 'objstore://p/elev-front.jpg', sha256: '2'.repeat(64), triadRole: 'wide', capturedAtUtc: '2026-05-20T13:33:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Front elevation' },
    { id: 'ph-slope-front', stage: 'S3', subjectType: 'slope', subjectId: 'slope-front', url: 'objstore://p/slope-front.jpg', sha256: '3'.repeat(64), triadRole: 'wide', capturedAtUtc: '2026-05-20T13:40:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Front slope overview' },
    { id: 'ph-dmg1-wide', stage: 'S5', subjectType: 'damage_instance', subjectId: 'dmg-1', url: 'objstore://p/dmg1-wide.jpg', sha256: '4'.repeat(64), triadRole: 'wide', capturedAtUtc: '2026-05-20T13:45:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Hail damage wide' },
    { id: 'ph-dmg1-close', stage: 'S5', subjectType: 'damage_instance', subjectId: 'dmg-1', url: 'objstore://p/dmg1-close.jpg', sha256: '5'.repeat(64), triadRole: 'close', capturedAtUtc: '2026-05-20T13:46:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Hail damage close (scale)' },
    { id: 'ph-ts-front', stage: 'S4', subjectType: 'test_square', subjectId: 'ts-front', url: 'objstore://p/ts-front.jpg', sha256: '6'.repeat(64), triadRole: 'wide', capturedAtUtc: '2026-05-20T13:50:00Z', gpsLat: 38.8462, gpsLng: -77.3064, caption: 'Front test square' },
  ],
  attestations: [
    { id: 'att-equip', stage: 'S0', attestationType: 'equipment', details: { equipment: ['ladder', 'chalk', 'gauge'] }, hash: '7'.repeat(64) },
    { id: 'att-sign', stage: 'S8', attestationType: 'stage_signoff', details: { declarationHash: '8'.repeat(64) }, hash: '9'.repeat(64) },
    { id: 'att-final', stage: 'S9', attestationType: 'stage_signoff', details: { kind: 'final_review' }, hash: '0'.repeat(64) },
  ],
  addenda: [],
  submittedAt: '2026-05-20T15:05:00Z',
};

// Resolved config fixture (bypasses the DB + review gate for verification).
export const sampleConfig: ResolvedConfig = {
  companyId: NUHOME_COMPANY_ID,
  company: nuHomeCompanyPack,
  stateCode: 'VA',
  state: virginiaStatePack,
};
