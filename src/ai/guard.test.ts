import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGuard } from './guard.js';
import type { ForensicNarratives, GenerationInput } from './types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseInput: GenerationInput = {
  property: {
    address: '1420 Chain Bridge Rd, Fairfax, VA 22030',
    dateOfLoss: '2026-05-18',
    claimNumber: 'CLM-2026-0417',
  },
  storm: { type: 'hail', date: '2026-05-18', magnitude: '1.75 inches hail', source: 'VisualCrossing' },
  damage: [],
  testSquares: [{ slopeLabel: 'Front (South)', hitCount: 9 }],
  components: [],
  products: [{ brand: 'GAF', line: 'Timberline HDZ', unidentifiable: false, identificationType: 'field_identified' }],
  scope: { squares: 30, subtotal: 13500, currency: 'USD', lineItems: [] },
  codeProvisions: [],
};

const baseNarratives: ForensicNarratives = {
  repairability: {
    summary:
      'The 1.75-inch hail event on 2026-05-18 caused widespread granule displacement across 30 squares of roofing.',
    matchingFactors: ['9 hail strikes documented on the front slope test square'],
  },
  manufacturer: {
    summary: 'The identified product is GAF Timberline HDZ asphalt shingle.',
    productStatement: 'Product identified as GAF Timberline HDZ via field identification.',
  },
  conclusion: {
    statement:
      'Based on the documented storm, damage, and product findings, the roof system requires ' +
      'full replacement to restore code-compliant conditions. Total incurred cost is $13500 USD ' +
      'for 30 squares.',
    basis: ['1.75-inch hail on 2026-05-18', 'GAF Timberline HDZ product', '30 squares affected'],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test('guard passes clean grounded narratives', () => {
  const result = runGuard(baseNarratives, baseInput);
  assert.equal(result.ok, true, `Expected ok but got violations: ${result.violations.join('; ')}`);
  assert.deepEqual(result.violations, []);
});

test('guard blocks banned phrase "coverage"', () => {
  const bad: ForensicNarratives = {
    ...baseNarratives,
    conclusion: {
      ...baseNarratives.conclusion,
      statement: 'This damage is coverage under the homeowner policy.',
    },
  };
  const result = runGuard(bad, baseInput);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('coverage')), `violations: ${result.violations}`);
});

test('guard blocks "carrier owes"', () => {
  const bad: ForensicNarratives = {
    ...baseNarratives,
    conclusion: {
      ...baseNarratives.conclusion,
      statement: 'The carrier owes the homeowner the full cost of replacement.',
    },
  };
  const result = runGuard(bad, baseInput);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('carrier owes')), `violations: ${result.violations}`);
});

test('guard blocks "policy limit"', () => {
  const bad: ForensicNarratives = {
    ...baseNarratives,
    manufacturer: {
      ...baseNarratives.manufacturer,
      summary: 'The policy limit may not cover all costs.',
    },
  };
  const result = runGuard(bad, baseInput);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('policy limit')), `violations: ${result.violations}`);
});

test('guard blocks ungrounded dollar amount', () => {
  const bad: ForensicNarratives = {
    ...baseNarratives,
    conclusion: {
      ...baseNarratives.conclusion,
      statement: 'The total replacement cost is $99999.',
    },
  };
  const result = runGuard(bad, baseInput);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('99999')), `violations: ${result.violations}`);
});

test('guard allows grounded numbers from scope and storm', () => {
  // All numbers (1.75, 2026, 18, 9, 30, 13500) are in baseInput
  const result = runGuard(baseNarratives, baseInput);
  assert.equal(result.ok, true, `Unexpected violations: ${result.violations.join('; ')}`);
});

test('guard rejects substring-collision numbers (exact token match)', () => {
  // "35" is a substring of the grounded "13500" but is NOT itself a fact token.
  const bad: ForensicNarratives = {
    ...baseNarratives,
    conclusion: {
      ...baseNarratives.conclusion,
      statement: 'Approximately 35 shingles were displaced.',
    },
  };
  const result = runGuard(bad, baseInput);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('"35"')), `violations: ${result.violations}`);
});

test('guard allows numbers from test square hit count', () => {
  const good: ForensicNarratives = {
    ...baseNarratives,
    repairability: {
      ...baseNarratives.repairability,
      matchingFactors: ['9 confirmed hail strikes on front slope'],
    },
  };
  const result = runGuard(good, baseInput);
  assert.equal(result.ok, true, `Unexpected violations: ${result.violations.join('; ')}`);
});
