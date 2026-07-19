import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData, resolveAreasImpacted, photoCaptureContext, photoArea, verdictForStatus, composeFieldTestProse, resolveInspector } from './build.js';
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
        fieldTestFindings: { repairAttemptMade: true, adjacentShinglesFractured: true,
          matchingMaterialSourceable: false, productDiscontinued: true, notes: null },
        conditionScoring: 'Brittle',
        repairAttemptRisks: 'Collateral breakage',
        determination: 'not_repairable',
        recommendation: 'Full replacement',
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
        questionPresented: 'Q', methodology: null, materialsReviewed: null,
        fieldTestFindings: {}, conditionScoring: null, repairAttemptRisks: null,
        determination: 'repairable', recommendation: null, supportingPhotoIds: [],
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
      specializedRequired: false, featureProtected: 'pool_spa',
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
      propertyProfile: { propertyType: 'single_family', stories: '2', roofType: 'gable',
        roofAgeYears: 14, roofAgeBasis: null, accessibilityNotes: null, recordedAtUtc: '2026-07-18T00:00:00Z' },
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
    // Closed enums from the app schema — mapped explicitly, not keyword-guessed.
    assert.equal(verdictForStatus('absent'), 'replace');   // must be installed
    assert.equal(verdictForStatus('present'), 'monitor');
    assert.equal(verdictForStatus('not_determined'), '');
    assert.equal(verdictForStatus('ceiling_stain'), 'repair');
    assert.equal(verdictForStatus('attic_pass'), 'monitor');
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
      propertyProfile: {
        buildingType: 'Wood-framed', attachedOrDetached: 'Detached',
        roofGeometry: ['Gable', 'Hip'], deckType: 'OSB', framingConditionNotes: 'Sound',
        recordedAtUtc: '2026-07-18T00:00:00Z',
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

  test('weather values are presentation-ready — the template prints them verbatim', () => {
    const r = build(inspection());
    assert.equal(r.weatherEvidence?.hailSize, '1.75 in');
    assert.equal(r.weatherEvidence?.windGust, '58 mph');
    // Raw enum would put lowercase "hail" in a carrier-facing document.
    assert.equal(r.weatherEvidence?.stormType, 'Hail');
  });

  test('determination renders as prose, not the raw enum', () => {
    const i = inspection({
      repairabilityAssessment: {
        questionPresented: 'Q', methodology: null, materialsReviewed: null,
        fieldTestFindings: {}, conditionScoring: null, repairAttemptRisks: null,
        determination: 'not_repairable', recommendation: null, supportingPhotoIds: [],
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
      propertyProtectionPlan: { specializedRequired: true, featureProtected: 'pool_spa',
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

// ---------------------------------------------------------------------------
// Field-test findings: the app stores discrete booleans; the template prints
// this value as text. It must become prose, and must never assert a fact that
// was not recorded.
// ---------------------------------------------------------------------------

describe('field-test findings prose', () => {
  test('renders a string, never an object (template would print [object Object])', () => {
    const i = inspection({
      repairabilityAssessment: {
        questionPresented: 'Q',
        fieldTestFindings: { repairAttemptMade: true, adjacentShinglesFractured: true },
        determination: 'not_repairable', supportingPhotoIds: [],
      },
    });
    const v = build(i).repairabilityAssessment?.fieldTestFindings;
    assert.equal(typeof v, 'string');
    assert.equal(String(v).includes('[object'), false);
  });

  test('states only what was recorded — silence is not a negative finding', () => {
    // Nothing observed about matching material or discontinuation: the prose
    // must not mention either. Asserting an unobserved fact is the exact
    // failure mode this whole module exists to prevent.
    const prose = composeFieldTestProse({ repairAttemptMade: true });
    assert.ok(prose.includes('repair attempt was performed'));
    assert.equal(/discontinued/i.test(prose), false);
    assert.equal(/matching material/i.test(prose), false);
  });

  test('distinguishes false from absent', () => {
    assert.ok(/did not fracture/i.test(composeFieldTestProse({ adjacentShinglesFractured: false })));
    assert.ok(/fractured during/i.test(composeFieldTestProse({ adjacentShinglesFractured: true })));
    assert.equal(composeFieldTestProse({}), '');
  });

  test('brittleness + discontinuation both surface when observed', () => {
    const prose = composeFieldTestProse({
      repairAttemptMade: true, adjacentShinglesFractured: true,
      matchingMaterialSourceable: false, productDiscontinued: true,
      notes: 'Sealant strip failed to release.',
    });
    assert.ok(/brittleness/i.test(prose));
    assert.ok(/could not be sourced/i.test(prose));
    assert.ok(/discontinued/i.test(prose));
    assert.ok(prose.endsWith('Sealant strip failed to release.'));
  });
});

// ---------------------------------------------------------------------------
// Inspection Methodology & Protocol — the section that turns "we looked at the
// roof" into a documented, enforced, repeatable method.
// ---------------------------------------------------------------------------

describe('methodology & protocol', () => {
  const manifest = {
    protocolVersion: '2.1',
    generatedAtUtc: '2026-07-18T15:00:00Z',
    records: {},
    photoHashes: [{ photoId: 'p1', sha256: 'a' }, { photoId: 'p2', sha256: 'b' }],
    gateResults: { deficiencies: [], softFlags: [{ x: 1 }] },
    signatureOnFile: null,
  };

  test('lists all 16 protocol steps in order', () => {
    const m = build(inspection()).methodology;
    assert.equal(m.steps.length, 16);
    assert.deepEqual(m.steps.map((s) => s.order), Array.from({ length: 16 }, (_, i) => i + 1));
    assert.equal(m.steps[0]?.name, 'Arrival Log');
    assert.equal(m.steps[15]?.name, 'Readiness & Submit');
  });

  test('a step that did not apply says WHY — never a silent omission', () => {
    const i = inspection({
      damageFlags: { roofDamageFound: true, sidingDamageFound: false,
        collateralDamageFound: false, interiorDamageFound: false },
    });
    const m = build(i).methodology;
    const siding = m.steps.find((s) => s.name === 'Siding Inspection')!;
    assert.equal(siding.applied, false);
    assert.match(siding.notApplicableReason ?? '', /no siding damage was identified/);
    // Always-on steps stay applied.
    assert.equal(m.steps.find((s) => s.name === 'Arrival Log')?.applied, true);
    assert.equal(m.steps.find((s) => s.name === 'Arrival Log')?.notApplicableReason, null);
  });

  test('repairability applies on roof OR siding', () => {
    const only = (over: Record<string, boolean>) => build(inspection({
      damageFlags: { roofDamageFound: false, sidingDamageFound: false,
        collateralDamageFound: false, interiorDamageFound: false, ...over },
    })).methodology.steps.find((s) => s.name === 'Repairability Assessment')!.applied;
    assert.equal(only({ roofDamageFound: true }), true);
    assert.equal(only({ sidingDamageFound: true }), true);
    assert.equal(only({ collateralDamageFound: true }), false);
  });

  test('enforcement evidence is grounded in the manifest, not asserted', () => {
    const withM = build(inspection(), { manifest });
    assert.deepEqual(withM.methodology.enforcementEvidence, {
      hardDeficienciesAtSubmission: 0,
      advisoryFlagsAtSubmission: 1,
      photosHashVerified: 2,
    });
    assert.equal(withM.methodology.protocolVersion, '2.1');
  });

  test('without a manifest the claim stays but is flagged as unquantified', () => {
    const r = build(inspection());
    assert.equal(r.methodology.enforcementEvidence, null);
    assert.equal(r.methodology.protocolVersion, 'unversioned');
    assert.ok(r.missingInputs.some((x) => x.includes('enforcementEvidence')));
  });

  test('photo counts are in PROTOCOL order and use step names, not raw keys', () => {
    const i = inspection();
    i.photos = [
      { ...i.photos[0]!, id: 'a', stage: 'test_squares' },
      { ...i.photos[0]!, id: 'b', stage: 'arrival' },
      { ...i.photos[0]!, id: 'c', stage: 'facets' },
      { ...i.photos[0]!, id: 'd', stage: 'facets' },
    ];
    const m = build(i).methodology;
    // arrival(1) -> facets(4) -> test_squares(5); alphabetical would invert these.
    assert.deepEqual(m.photosByStep, [
      { step: 'Arrival Log', count: 1 },
      { step: 'Roof Facets & Measurements', count: 2 },
      { step: 'Test Squares', count: 1 },
    ]);
  });

  test('unrecognised photo stages are surfaced as a sync warning, not dropped', () => {
    const i = inspection();
    i.photos = [{ ...i.photos[0]!, id: 'legacy', stage: 'S3' }];
    const r = build(i);
    assert.deepEqual(r.methodology.unknownSteps, ['S3']);
    assert.ok(r.missingInputs.some((x) => x.includes('out of sync')));
  });

  test('tie-in marking protocols are reported only when actually applied', () => {
    assert.deepEqual(build(inspection()).methodology.tieInProtocolsApplied, []);
    const i = inspection();
    i.slopes[0]!.tieInValley = true;
    i.slopes[1]!.tieInHipRidge = true;
    assert.deepEqual(build(i).methodology.tieInProtocolsApplied, ['Valley', 'Hip / Ridge']);
  });

  test('conditions come from the arrival log when present', () => {
    const i = inspection({
      arrival: { timeLocal: '2026-05-20T09:15:00', sky: 'Partly Cloudy',
        windCondition: 'Light', temp: '72F', personnelPresent: ['Homeowner', 'Adjuster'],
        latitude: null, longitude: null },
    });
    const c = build(i).methodology.conditions!;
    assert.equal(c.sky, 'Partly Cloudy');
    assert.deepEqual(c.personnelPresent, ['Homeowner', 'Adjuster']);
  });

  test('capture record counts real records', () => {
    const m = build(inspection()).methodology;
    const byItem = Object.fromEntries(m.captureRecord.map((r) => [r.item, r.recorded]));
    assert.equal(byItem['Roof facets documented'], sampleInspection.slopes.length);
    assert.equal(byItem['Total evidence photographs'], sampleInspection.photos.length);
  });
});

// ---------------------------------------------------------------------------
// Courier robustness — the field app's payload is the source of truth, but it
// must never be able to silently drop evidence.
// ---------------------------------------------------------------------------

describe('courier payload robustness', () => {
  const photo = (over: Record<string, unknown>) =>
    ({ id: 'x', stage: 'components', subjectType: 'component', subjectId: null, url: '', sha256: '',
       triadRole: 'wide', capturedAtUtc: null, gpsLat: null, gpsLng: null, caption: null, ...over }) as never;

  test('a component ZONE in the area field does not swallow the photo', () => {
    // The app's photo rows carry zone = eave_edge | ridge_hip for the component
    // gate. A courier mapping that onto `area` would otherwise produce an area
    // matching no claim area — filtering the photo out of the log entirely.
    assert.equal(photoArea(photo({ area: 'eave_edge' })), 'roof');
    assert.equal(photoArea(photo({ area: 'ridge_hip' })), 'roof');
    // A genuine claim area is still honoured.
    assert.equal(photoArea(photo({ area: 'siding' })), 'siding');
  });

  test('component photos survive into the photo log', () => {
    const i = inspection({
      damageFlags: { roofDamageFound: true, sidingDamageFound: false,
        collateralDamageFound: false, interiorDamageFound: false },
    });
    i.photos = [photo({ id: 'comp-1', area: 'eave_edge' }), photo({ id: 'comp-2', area: 'ridge_hip' })];
    const r = build(i);
    assert.equal(r.photos.length, 2, 'component photos must not be dropped');
    assert.deepEqual(r.photos.map((p) => p.area), ['roof', 'roof']);
  });

  test('inspector: nested signatureOnFile and flat fields both resolve', () => {
    const nested = resolveInspector({
      name: 'Sam Whitfield', certifications: [],
      signatureOnFile: { url: 'u', sha256: 'h', signedAt: '2026-05-20T00:00:00Z' },
    } as never);
    assert.equal(nested.signatureUrl, 'u');
    assert.equal(nested.signatureSha256, 'h');

    const flat = resolveInspector({
      name: 'Sam Whitfield', signatureUrl: 'u2', signatureSha256: 'h2', signedAt: null,
    } as never);
    assert.equal(flat.signatureUrl, 'u2');
  });

  test('a null inspector name never reaches the document', () => {
    // The courier joins first+last and sends null when the profile has neither.
    const r = resolveInspector({ name: null } as never);
    assert.equal(r.name, 'Inspector on file');
    assert.equal(typeof r.name, 'string');
  });
});

// ---------------------------------------------------------------------------
// Real payloads are looser than our types. The envelope validator only checks
// package identity + photos (.passthrough() on everything else), so a
// submission can legally omit any capture array. Missing data must degrade to
// a reportable gap, never a 500.
// ---------------------------------------------------------------------------

describe('sparse payload robustness', () => {
  const minimal = () =>
    ({
      id: 'i-1', companyId: 'RFTRAX', stateCode: 'VA',
      property: { address: '1 Test St', insuredName: null, carrier: null,
        policyNumber: null, claimNumber: null, dateOfLoss: null },
      storm: null,
      inspector: { name: 'Sam', licenseNumber: null, signatureUrl: null,
        signatureSha256: null, signedAt: null },
      methodology: null, homeownerFacts: null, submittedAt: '2026-07-19T00:00:00Z',
      // every collection deliberately omitted
    }) as never;

  test('a payload missing every capture array still builds', () => {
    const r = buildReportData(minimal(), sampleConfig, { generatedAt: AT });
    assert.equal(r.schemaVersion, 2);
    assert.equal(r.propertyAddress, '1 Test St');
    assert.deepEqual(r.photos, []);
    assert.equal(r.propertySummary.roofSlopeCount, 0);
    // The methodology section must still render its 16 steps.
    assert.equal(r.methodology.steps.length, 16);
  });

  test('absent collections are reported, not silently swallowed', () => {
    const r = buildReportData(minimal(), sampleConfig, { generatedAt: AT });
    const absentNotes = r.missingInputs.filter((m) => m.startsWith('payload.'));
    assert.ok(absentNotes.length > 0, 'expected payload.* gaps to be reported');
    assert.ok(absentNotes.some((m) => m.includes('slopes')));
    assert.ok(absentNotes.some((m) => m.includes('testSquares')));
  });

  test('a non-array where an array belongs is caught, not crashed on', () => {
    const bad = { ...(minimal() as object), slopes: 'not-an-array' } as never;
    const r = buildReportData(bad, sampleConfig, { generatedAt: AT });
    assert.ok(r.missingInputs.some((m) => m.includes('slopes (not an array)')));
  });

  test('a complete payload reports no payload gaps', () => {
    const r = build(inspection());
    assert.equal(r.missingInputs.filter((m) => m.startsWith('payload.')).length, 0);
  });
});
