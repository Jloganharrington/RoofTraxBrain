import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData } from './build.js';
import { sampleInspection, sampleConfig } from '../pdf/fixtures.js';
import type { CodeProvision } from '../tenancy/types.js';
import type { SubmittedInspection } from '../submissions/types.js';

// Codex selection: an entry is chosen by claim area × material × condition.
// Every dimension is optional; null means "applies broadly". These prove the
// cedar-vs-asphalt exclusion Logan called out, plus condition gating.

function withCodex(entries: CodeProvision[]) {
  return { ...sampleConfig, state: { ...sampleConfig.state, codeLibrary: entries } };
}
function inspection(patch: Partial<SubmittedInspection> = {}): SubmittedInspection {
  return { ...structuredClone(sampleInspection), ...patch };
}
const cite = (over: Partial<CodeProvision>): CodeProvision => ({
  id: 'x', code: 'IRC', edition: '2021', title: 't', text: 'b', appliesTo: ['roof'], ...over,
});
const build = (i: SubmittedInspection, cfg = sampleConfig) =>
  buildReportData(i, cfg, { generatedAt: new Date('2026-07-19T00:00:00Z') });

describe('codex material selection', () => {
  test('cedar-shake roof pulls cedar codes and EXCLUDES asphalt codes', () => {
    const cfg = withCodex([
      cite({ id: 'asphalt', materials: ['asphalt_shingle'], title: 'Asphalt underlayment' }),
      cite({ id: 'cedar', materials: ['cedar_shake'], title: 'Cedar interlayment' }),
      cite({ id: 'both', materials: null, title: 'Deck fastening (all materials)' }),
    ]);
    const i = inspection();
    i.slopes = i.slopes.map((s) => ({ ...s, material: 'Cedar Shake' }));
    const keys = build(i, cfg).codeCitations.map((c) => c.key);
    assert.ok(keys.includes('cedar'), 'cedar code included');
    assert.ok(keys.includes('both'), 'material-agnostic code included');
    assert.equal(keys.includes('asphalt'), false, 'asphalt code EXCLUDED on a cedar roof');
  });

  test('asphalt roof pulls asphalt, excludes cedar', () => {
    const cfg = withCodex([
      cite({ id: 'asphalt', materials: ['asphalt_shingle'] }),
      cite({ id: 'cedar', materials: ['cedar_shake'] }),
    ]);
    const i = inspection();
    i.slopes = i.slopes.map((s) => ({ ...s, material: 'architectural asphalt shingle' }));
    const keys = build(i, cfg).codeCitations.map((c) => c.key);
    assert.ok(keys.includes('asphalt'));
    assert.equal(keys.includes('cedar'), false);
  });
});

describe('codex condition selection', () => {
  test('valley diagram appears only when a valley tie-in was captured', () => {
    const cfg = withCodex([cite({ id: 'valley', condition: 'valley', form: 'diagram', assetRef: 'objstore://d/valley.svg' })]);
    // no tie-in → excluded
    assert.equal(build(inspection(), cfg).codeCitations.some((c) => c.key === 'valley'), false);
    // valley tie-in set → included, as a diagram
    const i = inspection();
    i.slopes[0]!.tieInValley = true;
    const hit = build(i, cfg).codeCitations.find((c) => c.key === 'valley');
    assert.ok(hit, 'valley diagram included when tie-in present');
    assert.equal(hit?.form, 'diagram');
    assert.equal(hit?.assetRef, 'objstore://d/valley.svg');
  });

  test('siding WRB diagram gated on wrb-present + siding facets', () => {
    const cfg = withCodex([cite({ id: 'wrb', claimArea: 'siding', condition: 'siding_wrb', appliesTo: ['siding'] })]);
    const base = inspection({
      damageFlags: { roofDamageFound: false, sidingDamageFound: true, collateralDamageFound: false, interiorDamageFound: false },
    });
    base.sidingFacets = [{ id: 's1', label: 'S1', damaged: true, damageType: 'hail', componentCount: 1 }];
    base.sidingWrbPresent = true;
    assert.ok(build(base, cfg).codeCitations.some((c) => c.key === 'wrb'));
    const noWrb = { ...structuredClone(base), sidingWrbPresent: false };
    assert.equal(build(noWrb, cfg).codeCitations.some((c) => c.key === 'wrb'), false);
  });
});

describe('backward compatibility', () => {
  test('legacy entries (no material/condition) resolve by area exactly as before', () => {
    // The real Virginia pack has no material/condition set — must still render.
    const r = build(inspection());
    assert.ok(r.codeCitations.length > 0, 'legacy VA code library still resolves');
    assert.ok(r.codeCitations.every((c) => c.form === 'code'));
  });
});
