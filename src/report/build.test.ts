import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData, resolveAreasImpacted, photoCaptureContext, photoArea, verdictForStatus } from './build.js';
import { sampleInspection, sampleConfig } from '../pdf/fixtures.js';
import type { SubmittedInspection } from '../submissions/types.js';

// Deep-clone the fixture so each test mutates in isolation.
function inspection(patch: Partial<SubmittedInspection> = {}): SubmittedInspection {
  return { ...structuredClone(sampleInspection), ...patch };
}

const AT = new Date('2026-07-18T12:00:00Z');
const build = (i: SubmittedInspection, opts = {}) =>
  buildReportData(i, sampleConfig, { generatedAt: AT, ...opts });

// ---------------------------------------------------------------------------
// Rule 1 — never fabricate. Absent input must never become a plausible default.
// ---------------------------------------------------------------------------

describe('never fabricates conditional modules', () => {
  test('repairability is null when no field assessment was recorded', () => {
    const r = build(inspection({ repairabilityAssessment: null }));
    assert.equal(r.repairabilityAssessment, null);
    assert.ok(r.missingInputs.some((m) => m.startsWith('repairabilityAssessment:')));
  });

  test('repairability renders only from a real record, with assessor identity attached', () => {
    const i = inspection({
      repairabilityAssessment: {
        questionPresented: 'Can the roof be repaired?',
        methodology: 'Field repair attempt on F2.',
        materialsReviewed: 'Existing 3-tab, no match sourced.',
        fieldTestFindings: 'Adjacent shingles fractured on lift.',
        conditionScoring: 'Brittle',
        repairAttemptRisks: 'Collateral breakage',
        determination: 'not_repairable',
        recommendation: 'Full replacement',
        productDiscontinued: true,
        matchingMaterialAvailable: false,
        supportingPhotoIds: ['p-1'],
      },
    });
    i.inspector.certifications = [{ name: 'HAAG Certified Inspector', issuingBody: 'HAAG', number: 'H-1', expiresOn: null }];

    const r = build(i);
    assert.ok(r.repairabilityAssessment?.determination.startsWith('Not repairable'));
    assert.equal(r.repairabilityAssessment?.assessorName, i.inspector.name);
    assert.equal(r.repairabilityAssessment?.assessorCredentials, 'HAAG Certified Inspector (HAAG)');
  });

  test('flags missing credentials rather than inventing them', () => {
    const i = inspection({
      repairabilityAssessment: {
        questionPresented: null, methodology: null, materialsReviewed: null,
        fieldTestFindings: null, conditionScoring: null, repairAttemptRisks: null,
        determination: 'repairable', recommendation: null,
        productDiscontinued: null, matchingMaterialAvailable: null, supportingPhotoIds: [],
      },
    });
    i.inspector.certifications = [];
    const r = build(i);
    assert.equal(r.repairabilityAssessment?.assessorCredentials, null);
    assert.ok(r.missingInputs.some((m) => m.includes('assessorCredentials')));
  });

  test('temporary repairs require performed === true, not merely present', () => {
    const base = {
      performed: false, description: 'tarp', datePerformed: '2026-05-19',
      materialsUsed: null, crewAndEquipment: null, tarpInvoiceRef: null, beforeAfterPhotoIds: [],
    };
    assert.equal(build(inspection({ temporaryRepairs: base })).temporaryRepairs, null);
    assert.ok(build(inspection({ temporaryRepairs: { ...base, performed: true } })).temporaryRepairs);
  });

  test('property protection requires specializedRequired === true (ordinary tarping does not qualify)', () => {
    const base = {
      specializedRequired: false, featureProtected: ['pool'],
      whyOrdinaryTarpingInsufficient: null, proposedEquipment: null, setupMethod: null, photoIds: [],
    };
    assert.equal(build(inspection({ propertyProtectionPlan: base })).propertyProtectionPlan, null);
    const on = build(inspection({ propertyProtectionPlan: { ...base, specializedRequired: true } }));
    assert.equal(on.propertyProtectionPlan?.specializedRequired, true);
    // Money is office-supplied — the Brain must not invent it from field data.
    assert.equal(on.propertyProtectionPlan?.laborEstimate, null);
    assert.equal(on.propertyProtectionPlan?.rentalCost, null);
  });

  test('manufacturer specs are null when no product was identified', () => {
    const i = inspection();
    i.products = [{ id: 'pr-1', identificationType: 'unidentifiable', brand: null, line: null, unidentifiable: true }];
    assert.equal(build(i).manufacturerSpecs, null);
  });

  test('temporaryRepairsCompleted mirrors the real record, not an assumption', () => {
    assert.equal(build(inspection({ temporaryRepairs: null })).propertySummary.temporaryRepairsCompleted, false);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — an unimpacted area produces zero content everywhere (spec §2.1).
// ---------------------------------------------------------------------------

describe('area-conditional content', () => {
  const flags = {
    roofDamageFound: true, sidingDamageFound: false,
    collateralDamageFound: false, interiorDamageFound: false,
  };

  test('roof-only claim empties every non-roof area', () => {
    const i = inspection({ damageFlags: flags });
    i.sidingFacets = [{ id: 's-1', label: 'S1', damaged: true, damageType: 'wind', componentCount: 1 }];
    i.interiorObservations = [{ id: 'i-1', location: 'Kitchen', observationType: 'stain', moistureReading: 18 }];

    const r = build(i);
    assert.deepEqual(r.restorationReport.observedDamage.siding, []);
    assert.deepEqual(r.restorationReport.observedDamage.interior, []);
    assert.deepEqual(r.components.siding, []);
    assert.deepEqual(r.components.interior, []);
    assert.deepEqual(r.propertySummary.areasAffected, ['roof']);
    // Siding evidence exists in the submission but must not surface anywhere.
    assert.ok(r.restorationReport.observedDamage.roof.length > 0);
  });

  test('photos from an unimpacted area are dropped from the log', () => {
    const i = inspection({ damageFlags: flags });
    i.photos = [
      ...i.photos,
      { id: 'ph-sid', stage: 'siding', subjectType: 'siding_facet', subjectId: 's-1',
        url: 'u', sha256: 'x', triadRole: 'close', capturedAtUtc: null, gpsLat: null, gpsLng: null, caption: 'S1' },
    ];
    const r = build(i);
    assert.equal(r.photos.some((p) => p.id === 'ph-sid'), false);
  });

  test('explicit flags win over record-derived impact', () => {
    const i = inspection({ damageFlags: { ...flags, sidingDamageFound: true } });
    i.sidingFacets = []; // flag says impacted even with no facets yet
    const { impact, derived } = resolveAreasImpacted(i);
    assert.equal(derived, false);
    assert.equal(impact.siding, true);
  });

  test('falls back to derivation and says so when flags are absent', () => {
    const i = inspection({ damageFlags: null });
    const r = build(i);
    assert.ok(r.missingInputs.some((m) => m.includes('derived from records')));
  });

  test('interior falls back to observations while the app lacks the fourth flag', () => {
    const i = inspection({
      damageFlags: { roofDamageFound: true, sidingDamageFound: false, collateralDamageFound: false },
    });
    i.interiorObservations = [{ id: 'i-1', location: 'Kitchen', observationType: 'stain', moistureReading: null }];
    const r = build(i);
    // A documented interior claim must not be silently dropped.
    assert.equal(r.areasImpacted.find((a) => a.key === 'interior')?.impacted, true);
    assert.ok(r.missingInputs.some((m) => m.includes('interior')));
  });
});

// ---------------------------------------------------------------------------
// Derivations and mappings
// ---------------------------------------------------------------------------

describe('derived fields and photo mapping', () => {
  test('captureContext maps from the existing triadRole vocabulary', () => {
    const p = (over: Record<string, unknown>) =>
      ({ id: 'x', stage: 'facets', subjectType: 'slope', subjectId: null, url: '', sha256: '',
         triadRole: null, capturedAtUtc: null, gpsLat: null, gpsLng: null, caption: null, ...over }) as never;
    assert.equal(photoCaptureContext(p({ triadRole: 'wide' })), 'overview');
    assert.equal(photoCaptureContext(p({ triadRole: 'mid' })), 'mid-range');
    assert.equal(photoCaptureContext(p({ triadRole: 'close' })), 'close-up');
    assert.equal(photoCaptureContext(p({ stage: 'collateral' })), 'collateral');
    assert.equal(photoCaptureContext(p({ subjectType: 'measurement' })), 'measurement');
    // Phase-1 photos carry preliminaryRole instead.
    assert.equal(photoCaptureContext(p({ preliminaryRole: 'front_elevation' })), 'overview');
  });

  test('photo area derives from stage/subject when not explicitly tagged', () => {
    const p = (over: Record<string, unknown>) =>
      ({ id: 'x', stage: 'facets', subjectType: 'slope', subjectId: null, url: '', sha256: '',
         triadRole: null, capturedAtUtc: null, gpsLat: null, gpsLng: null, caption: null, ...over }) as never;
    assert.equal(photoArea(p({})), 'roof');
    assert.equal(photoArea(p({ stage: 'siding' })), 'siding');
    assert.equal(photoArea(p({ stage: 'collateral' })), 'collateral');
    assert.equal(photoArea(p({ area: 'interior' })), 'interior');
  });

  test('roofSlopeCount is derived from facets rather than re-asked', () => {
    const r = build(inspection());
    assert.equal(r.propertySummary.roofSlopeCount, sampleInspection.slopes.length);
  });

  test('roof age without a stated basis is flagged as attackable', () => {
    const r = build(inspection({
      propertySummary: { propertyType: 'single_family', stories: '2', roofType: 'gable',
        roofAgeYears: 14, roofAgeBasis: null, accessibilityNotes: null },
    }));
    assert.ok(r.missingInputs.some((m) => m.includes('roofAgeBasis')));
  });

  test('unattached exhibits are reported, never silently blank', () => {
    const r = build(inspection());
    assert.equal(r.exhibits.estimate.attached, false);
    assert.ok(r.missingInputs.some((m) => m === 'exhibits.estimate: not attached'));
    const withEstimate = build(inspection(), { attachments: { estimate: true } });
    assert.equal(withEstimate.exhibits.estimate.attached, true);
  });

  test('legacy submissions still build (backward compatible)', () => {
    const r = build(inspection()); // fixture carries none of the v2 fields
    assert.equal(r.schemaVersion, 2);
    assert.equal(r.propertyAddress, sampleInspection.property.address);
    assert.ok(r.missingInputs.length > 0); // thin, but honest about it
  });
});

// ---------------------------------------------------------------------------
// Template contract — the HTML template interpolates these values directly, so
// shape errors here render as broken markup rather than type errors.
// ---------------------------------------------------------------------------

describe('HTML template contract', () => {
  test('areasImpacted is an ARRAY of {key,name,impacted} (template calls .forEach)', () => {
    const r = build(inspection());
    assert.ok(Array.isArray(r.areasImpacted));
    assert.equal(r.areasImpacted.length, 4);
    assert.deepEqual(
      r.areasImpacted.map((a) => a.key),
      ['roof', 'siding', 'interior', 'collateral'],
    );
    assert.equal(typeof r.areasImpacted[0]?.name, 'string');
  });

  test('verdict is a bare lowercase CSS token — never prose or multi-word', () => {
    // `class="verdict ${verdict}"`: "No action" would emit two classes and break.
    const allowed = new Set(['replace', 'repair', 'monitor', '']);
    assert.equal(verdictForStatus('Damaged'), 'replace');
    assert.equal(verdictForStatus('functional'), 'monitor');
    assert.equal(verdictForStatus('something unmapped'), '');
    for (const v of Object.values(verdictForStatus)) void v;

    const i = inspection({
      damageFlags: { roofDamageFound: true, sidingDamageFound: true, collateralDamageFound: false, interiorDamageFound: false },
    });
    i.sidingFacets = [{ id: 's1', label: 'S1', damaged: true, damageType: 'hail', componentCount: 0 }];
    const r = build(i);
    for (const area of ['roof', 'siding', 'interior', 'collateral'] as const) {
      for (const cat of r.components[area]) {
        for (const item of cat.items) {
          assert.ok(allowed.has(item.verdict), `bad verdict token: "${item.verdict}"`);
          assert.equal(item.verdict.includes(' '), false);
        }
      }
    }
  });

  test('construction block uses the template key names', () => {
    const i = inspection({
      constructionDescription: {
        buildingType: 'Wood-framed', attachedOrDetached: 'Detached',
        roofGeometry: ['Gable', 'Hip'], deckType: 'OSB', framingConditionNotes: 'Sound',
      },
    });
    const c = build(i).restorationReport.construction;
    assert.equal(c.configuration, 'Detached');   // not attachedOrDetached
    assert.equal(c.framingNotes, 'Sound');       // not framingConditionNotes
    assert.equal(c.roofGeometry, 'Gable, Hip');  // string, not array
  });

  test('exhibits carry a description — template renders it', () => {
    const r = build(inspection());
    for (const ref of Object.values(r.exhibits)) {
      assert.equal(typeof ref.description, 'string');
      assert.ok(ref.description.length > 0);
      assert.ok(ref.sourceLabel.length > 0);
    }
  });

  test('weather magnitudes are pre-formatted with units', () => {
    const r = build(inspection());
    assert.equal(r.weatherEvidence?.hailSize, '1.75 in');
    assert.equal(r.weatherEvidence?.windGust, '58 mph');
  });

  test('determination renders as prose, not the raw enum', () => {
    const i = inspection({
      repairabilityAssessment: {
        questionPresented: null, methodology: null, materialsReviewed: null,
        fieldTestFindings: null, conditionScoring: null, repairAttemptRisks: null,
        determination: 'not_repairable', recommendation: null,
        productDiscontinued: null, matchingMaterialAvailable: null, supportingPhotoIds: [],
      },
    });
    const d = build(i).repairabilityAssessment?.determination ?? '';
    assert.equal(d.includes('_'), false);
    assert.ok(d.startsWith('Not repairable'));
  });

  test('conditional exhibit modules carry the sourceLabel the template reads', () => {
    const i = inspection({
      temporaryRepairs: { performed: true, description: 'Tarp', datePerformed: '2026-05-19',
        materialsUsed: null, crewAndEquipment: null, tarpInvoiceRef: null, beforeAfterPhotoIds: [] },
      propertyProtectionPlan: { specializedRequired: true, featureProtected: ['Pool'],
        whyOrdinaryTarpingInsufficient: 'Rigid shielding required', proposedEquipment: null,
        setupMethod: null, photoIds: [] },
    });
    const r = build(i);
    assert.ok((r.temporaryRepairs?.sourceLabel ?? '').length > 0);
    assert.ok((r.propertyProtectionPlan?.sourceLabel ?? '').length > 0);
    assert.ok((r.propertyProtectionPlan?.description ?? '').length > 0);
  });

  test('flat cover fields the template binds are all present', () => {
    const r = build(inspection(), { office: { adjusterName: 'A. Adjuster', dateFiled: '2026-05-20' } });
    assert.equal(r.customerName, 'Jordan & Alex Reyes');
    assert.equal(r.policyNumber, 'USAA-88231145');
    assert.equal(r.adjusterName, 'A. Adjuster');
    assert.equal(r.propertyAddressShort, '1420 Chain Bridge Rd');
    assert.ok(r.concealedConditionProcedure.includes('change order'));
    assert.ok(r.certificationText.length > 0);
  });
});
