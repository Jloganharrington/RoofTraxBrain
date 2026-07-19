// Emits a REPORT_DATA v2 sample from the standing fixture so the HTML template
// track can bind against real output instead of the spec prose.
// Two variants: a rich roof+siding+interior claim, and a roof-only claim that
// demonstrates the area-conditional emptying rules (§2.1).
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildReportData } from '../src/report/build.js';
import { sampleInspection, sampleConfig } from '../src/pdf/fixtures.js';
import { MOCK_NARRATIVES } from '../src/ai/generate.js';
import type { SubmittedInspection } from '../src/submissions/types.js';

const at = new Date('2026-07-18T12:00:00Z');
mkdirSync('samples', { recursive: true });

const rich: SubmittedInspection = structuredClone(sampleInspection);
rich.damageFlags = {
  roofDamageFound: true, sidingDamageFound: true,
  collateralDamageFound: true, interiorDamageFound: true,
};
rich.arrival = {
  timeLocal: '2026-05-20T09:15:00', sky: 'Partly Cloudy', windCondition: 'Light, 5-10 mph',
  temp: '74F', personnelPresent: ['Homeowner', 'Contractor/Rep'],
  latitude: 38.8462, longitude: -77.3064,
};
rich.slopes[0]!.tieInValley = true;
rich.slopes[1]!.tieInHipRidge = true;
rich.propertyProfile = {
  propertyType: 'Single-family detached', stories: '2', roofType: 'Gable',
  roofAgeYears: 14, roofAgeBasis: 'Permit record (2012 re-roof)',
  accessibilityNotes: 'Rear elevation requires 28ft ladder; no roof hatch.',
  buildingType: 'Wood-framed residential', attachedOrDetached: 'Detached',
  roofGeometry: ['Gable', 'Cross-gable'], deckType: 'OSB 7/16"',
  framingConditionNotes: 'Rafters sound; no deflection observed at ridge.',
  recordedAtUtc: '2026-07-18T14:00:00Z',
};
rich.sidingFacets = [
  { id: 'sf-1', label: 'S1', damaged: true, damageType: 'hail', componentCount: 2 },
  { id: 'sf-2', label: 'S2', damaged: false, damageType: null, componentCount: 1 },
];
rich.existingOrUnrelatedConditions = [
  { id: 'x-1', location: 'North elevation, lower course',
    note: 'Pre-existing mechanical damage consistent with ladder contact; excluded from this claim.' },
];
rich.repairabilityAssessment = {
  questionPresented: 'Can a code-compliant, reasonably uniform repair be achieved by partial replacement?',
  methodology: 'Attempted controlled repair on facet F2; sourced matching material through two suppliers.',
  materialsReviewed: 'Existing architectural laminate; discontinued line, no ASTM-equivalent match located.',
  fieldTestFindings: {
    repairAttemptMade: true, adjacentShinglesFractured: true,
    matchingMaterialSourceable: false, productDiscontinued: true,
    notes: 'Sealant strip failed to release cleanly at 3 of 4 attempts.',
  },
  conditionScoring: 'Brittle — thermal cracking on flex',
  repairAttemptRisks: 'Collateral breakage to undamaged courses; compromised water-shedding at tie-in.',
  determination: 'not_repairable',
  recommendation: 'Full replacement of affected slopes to achieve uniform, code-compliant result.',
  supportingPhotoIds: rich.photos.slice(0, 2).map((p) => p.id),
  recordedAtUtc: '2026-07-18T15:00:00Z',
};
rich.temporaryRepairs = {
  performed: true, description: 'Emergency tarp installed over rear slope penetration.',
  datePerformed: '2026-05-19', materialsUsed: '20x30 poly tarp, furring strips',
  crewAndEquipment: '2-person crew, 28ft ladder', tarpInvoiceRef: 'INV-2026-0519-01',
  beforeAfterPhotoIds: [], recordedAtUtc: '2026-05-19T10:00:00Z',
};
rich.propertyProtectionPlan = {
  specializedRequired: true, featureProtected: 'solar_panels',
  whyOrdinaryTarpingInsufficient:
    'Solar array requires licensed de-energize/remove-reset; pool requires rigid debris shielding, not sheeting.',
  proposedEquipment: 'Scaffold shielding, rigid pool cover', setupMethod: 'Perimeter scaffold with debris netting',
  photoIds: [], recordedAtUtc: '2026-07-18T15:30:00Z',
};
rich.inspector.certifications = [
  { name: 'HAAG Certified Inspector — Residential Roofs', issuingBody: 'HAAG Engineering', number: 'HCI-20417', expiresOn: '2028-03-31' },
];
rich.inspector.yearsExperience = 11;

const roofOnly: SubmittedInspection = structuredClone(rich);
roofOnly.damageFlags = {
  roofDamageFound: true, sidingDamageFound: false,
  collateralDamageFound: false, interiorDamageFound: false,
};

// A representative manifest so the methodology section's enforcement evidence
// is grounded rather than merely asserted.
const manifest = {
  protocolVersion: '2.1',
  generatedAtUtc: '2026-07-18T15:00:00Z',
  records: {},
  photoHashes: rich.photos.map((p) => ({ photoId: p.id, sha256: p.sha256 })),
  gateResults: { deficiencies: [], softFlags: [] },
  signatureOnFile: null,
};

for (const [name, insp] of [['rich', rich], ['roof-only', roofOnly]] as const) {
  const data = buildReportData(insp, sampleConfig, {
    generatedAt: at, ai: MOCK_NARRATIVES, manifest,
    attachments: { measurements: true, estimate: true, priceBook: true, constructionAgreement: true },
    documentIndex: insp.photos.slice(0, 3).map((p, i) => ({ filename: `photo-${i + 1}.jpg`, category: 'Photographic Evidence' })),
  });
  writeFileSync(`samples/report-data.${name}.json`, JSON.stringify(data, null, 2));
  console.log(`\n=== ${name} ===`);
  console.log('areasAffected      :', data.propertySummary.areasAffected.join(', ') || '(none)');
  console.log('photos             :', data.photos.length);
  console.log('observedDamage     :', Object.entries(data.restorationReport.observedDamage).map(([k, v]) => `${k}=${v.length}`).join(' '));
  console.log('components         :', Object.entries(data.components).map(([k, v]) => `${k}=${v.length}`).join(' '));
  console.log('codeCitations      :', data.codeCitations.length);
  console.log('repairability      :', data.repairabilityAssessment ? data.repairabilityAssessment.determination : 'null (omitted)');
  console.log('temporaryRepairs   :', data.temporaryRepairs ? 'included' : 'null (omitted)');
  console.log('propertyProtection :', data.propertyProtectionPlan ? 'included' : 'null (omitted)');
  const m = data.methodology;
  console.log('protocol          :', m.protocolName, 'v' + m.protocolVersion);
  console.log('steps applied     :', m.steps.filter((s) => s.applied).length + '/' + m.steps.length);
  console.log('not applicable    :', m.steps.filter((s) => !s.applied).map((s) => s.name).join(', ') || '(none)');
  console.log('enforcement       :', JSON.stringify(m.enforcementEvidence));
  console.log('photosByStep      :', m.photosByStep.map((p) => p.step + '=' + p.count).join(', '));
  console.log('missingInputs      :', data.missingInputs.length);
  for (const m of data.missingInputs) console.log('   -', m);
}
