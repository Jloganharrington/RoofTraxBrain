import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { adaptSubmittedInspection, formatPitch } from './adapt.js';

// These fixtures use the field app's REAL column names (verified against
// RoofTraxMobile lib/db/src/schema/inspections.ts), not the contract's names.
// If the app renames a column, this file is where it should fail.

describe('wire → contract adaptation', () => {
  test('slopes: materialType→material, pitchRise/Run→pitch', () => {
    const { inspection } = adaptSubmittedInspection({
      slopes: [{ id: 's1', label: 'F1', materialType: 'architectural', pitchRise: 6, pitchRun: 12 }],
    });
    const s = inspection.slopes[0];
    assert.equal(s.material, 'architectural');
    assert.equal(s.pitch, '6/12');
  });

  test('slopes: a missing pitch is null, never a bogus 0/12', () => {
    assert.equal(formatPitch(null, 12), null);
    assert.equal(formatPitch(6, null), null);
    assert.equal(formatPitch(6, 0), null);
    assert.equal(formatPitch(6, 12), '6/12');
  });

  test('damageInstances: observedIndicators absent app-side → severity, not fabrication', () => {
    const { inspection, unmapped } = adaptSubmittedInspection({
      damageInstances: [{ id: 'd1', damageType: 'hail', severity: 'moderate', causationNote: 'x' }],
    });
    // This is the exact shape that used to throw "undefined is not iterable".
    assert.deepEqual(inspection.damageInstances[0].observedIndicators, ['moderate']);
    assert.ok(unmapped.includes('damageInstances[].observedIndicators'));
  });

  test('damageInstances: no severity → empty, never invented', () => {
    const { inspection } = adaptSubmittedInspection({
      damageInstances: [{ id: 'd1', damageType: 'wind' }],
    });
    assert.deepEqual(inspection.damageInstances[0].observedIndicators, []);
  });

  test('testSquares: hitCount derived from attached hits', () => {
    const { inspection } = adaptSubmittedInspection({
      testSquares: [{ id: 't1', slopeId: 's1', hits: [{ id: 'h1', hitType: 'hail' }, { id: 'h2', hitType: 'hail' }] }],
    });
    const ts = inspection.testSquares[0];
    assert.equal(ts.hitCount, 2);
    assert.equal(ts.hits[0].classification, 'hail');
  });

  test('products: productLine→line, unidentifiable derived from reason/brand', () => {
    const { inspection } = adaptSubmittedInspection({
      products: [
        { id: 'p1', brand: 'GAF', productLine: 'Timberline', identificationMethod: 'field' },
        { id: 'p2', brand: null, unidentifiableReason: 'no legible markings' },
      ],
    });
    assert.equal(inspection.products[0].line, 'Timberline');
    assert.equal(inspection.products[0].identificationType, 'field');
    assert.equal(inspection.products[0].unidentifiable, false);
    assert.equal(inspection.products[1].unidentifiable, true);
  });

  test('penetrations: each row is one penetration (no count column app-side)', () => {
    const { inspection } = adaptSubmittedInspection({
      penetrations: [{ id: 'x', penetrationType: 'plumbing_vent' }],
    });
    assert.equal(inspection.penetrations[0].count, 1);
  });

  test('measurements: subjectId→slopeId only when the subject IS a slope', () => {
    const { inspection } = adaptSubmittedInspection({
      measurements: [
        { id: 'm1', subjectType: 'slope', subjectId: 's1', measurementType: 'area', value: 10, unit: 'sq' },
        { id: 'm2', subjectType: 'inspection', subjectId: 'i1', measurementType: 'ridge_lf', value: 40, unit: 'lf' },
      ],
    });
    assert.equal(inspection.measurements[0].slopeId, 's1');
    // Whole-roof linears must NOT be attributed to a slope.
    assert.equal(inspection.measurements[1].slopeId, '');
  });

  test('sidingFacets: `components` count app-side → componentCount', () => {
    const { inspection } = adaptSubmittedInspection({
      sidingFacets: [{ id: 'sf1', label: 'S1', damaged: true, damageType: 'hail', components: 3 }],
    });
    assert.equal(inspection.sidingFacets[0].componentCount, 3);
  });

  test('components: notes (plural) app-side → note', () => {
    const { inspection } = adaptSubmittedInspection({
      components: [{ id: 'c1', componentType: 'drip_edge', status: 'absent', notes: 'missing at eave' }],
    });
    assert.equal(inspection.components[0].note, 'missing at eave');
  });

  test('property: carrierName→carrier', () => {
    const { inspection } = adaptSubmittedInspection({
      property: { address: '1 Test St', carrierName: 'USAA', claimNumber: 'CLM-1' },
    });
    assert.equal(inspection.property.carrier, 'USAA');
    // Fields that already match must survive untouched.
    assert.equal(inspection.property.claimNumber, 'CLM-1');
  });

  test('an empty payload adapts without throwing', () => {
    const { inspection } = adaptSubmittedInspection({});
    for (const k of ['slopes','damageInstances','components','penetrations','products','testSquares','measurements','sidingFacets','interiorObservations','elevations']) {
      assert.ok(Array.isArray(inspection[k]), `${k} should be an array`);
    }
  });
});
