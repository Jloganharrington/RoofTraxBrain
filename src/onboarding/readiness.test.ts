import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOnboardingStatus,
  enumerateRequiredAdders,
  type ReadinessInput,
  type ServiceArea,
} from './readiness.js';
import type { CompanyPack, StatePack, AdderRule } from '../tenancy/types.js';

const adder = (key: string, label: string): AdderRule => ({
  id: `ad-${key}`,
  key,
  label,
  triggerCondition: 'documented condition',
  unit: 'SQ',
});

function statePack(code: string, adders: AdderRule[]): StatePack {
  return {
    stateCode: code,
    stateName: code,
    homeownerRights: {
      title: '', subtitle: '', preparedByNote: '',
      sections: [], complaintBlock: [], closingDisclaimer: '',
    },
    uppaDisclaimer: { statuteCitation: '', body: '' },
    codeLibrary: [],
    adderRules: adders,
  };
}

function fullPack(over: Partial<CompanyPack> = {}): CompanyPack {
  return {
    legalName: 'NuHome Exteriors LLC',
    brandName: 'NuHome',
    logoRef: null,
    letterhead: {
      primaryColorHex: '#000', addressLines: ['1 Main St'],
      phone: '555-0100', email: 'a@b.com', website: null,
    },
    licenses: [{ state: 'VA', number: '2705-1234', classification: 'Class A' }],
    servicesOffered: ['roofing', 'siding'],
    qualifications: { statement: 'We do roofs.', experienceYears: 12, certifications: [] },
    pricing: { pricePerSquare: 0, currency: 'USD', basisStatement: '', adderRates: {} },
    contractTemplateRef: null,
    methodologyTemplate: {
      equipmentBaseline: [], testSquareProtocol: '', markingStandard: '', photoStandard: '',
    },
    ...over,
  };
}

const VA_ADDERS = [adder('steep_pitch', 'Steep pitch >8/12'), adder('two_story', 'Two story')];
const MD_ADDERS = [adder('steep_pitch', 'Steep pitch >8/12'), adder('restricted_access', 'Restricted access')];

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
  const areas: ServiceArea[] = [{ stateCode: 'VA', counties: ['Fairfax'] }];
  return {
    companyId: 'co-1',
    pack: fullPack(),
    serviceAreas: areas,
    statePacks: { VA: statePack('VA', VA_ADDERS) },
    priceBook: {
      version: 1,
      effectiveFrom: '2026-01-01',
      pricePerSquare: 425,
      basisStatement: 'Fixed incurred cost.',
      adderRates: { steep_pitch: 45, two_story: 30 },
      ...(over.priceBook === null ? {} : {}),
    },
    ...over,
  };
}

const step = (s: ReturnType<typeof computeOnboardingStatus>, key: string) =>
  s.steps.find((x) => x.key === key)!;

// ---------------------------------------------------------------------------

describe('price book is structurally locked behind service areas', () => {
  test('locked when no service areas are configured', () => {
    const s = computeOnboardingStatus(input({ serviceAreas: [], priceBook: null }));
    const pb = step(s, 'price_book');
    assert.equal(pb.status, 'locked');
    assert.equal(pb.blockedBy, 'service_areas');
    assert.equal(s.canBuildPackages, false);
  });

  test('unlocks once service areas are complete', () => {
    const s = computeOnboardingStatus(input());
    assert.equal(step(s, 'price_book').status, 'complete');
  });

  test('a state the platform does not serve keeps areas incomplete and the book locked', () => {
    const s = computeOnboardingStatus(
      input({ serviceAreas: [{ stateCode: 'TX', counties: ['Travis'] }], statePacks: {} }),
    );
    assert.equal(step(s, 'service_areas').status, 'incomplete');
    assert.ok(step(s, 'service_areas').missing.some((m) => m.includes('not yet available')));
    assert.equal(step(s, 'price_book').status, 'locked');
  });
});

describe('unrated adders block the price book', () => {
  test('a configured state adder with no rate is a blocker, not a warning', () => {
    const s = computeOnboardingStatus(
      input({
        priceBook: {
          version: 1, effectiveFrom: '2026-01-01', pricePerSquare: 425,
          basisStatement: 'Fixed incurred cost.',
          adderRates: { steep_pitch: 45 }, // two_story missing
        },
      }),
    );
    const pb = step(s, 'price_book');
    assert.equal(pb.status, 'incomplete');
    assert.ok(pb.missing.some((m) => m.includes('Two story')));
    assert.equal(s.canBuildPackages, false);
  });

  test('adders are deduped across states — one rate serves both', () => {
    const adders = enumerateRequiredAdders(
      [{ stateCode: 'VA', counties: ['Fairfax'] }, { stateCode: 'MD', counties: ['Montgomery'] }],
      { VA: statePack('VA', VA_ADDERS), MD: statePack('MD', MD_ADDERS) },
      { steep_pitch: 45 },
    );
    const keys = adders.map((a) => a.key);
    assert.deepEqual(keys, ['steep_pitch', 'two_story', 'restricted_access']);
    assert.equal(keys.filter((k) => k === 'steep_pitch').length, 1);
    assert.equal(adders.find((a) => a.key === 'steep_pitch')?.rated, true);
    assert.equal(adders.find((a) => a.key === 'two_story')?.rated, false);
  });

  test('a zero rate counts as rated — 0 is a deliberate price, not an absence', () => {
    const adders = enumerateRequiredAdders(
      [{ stateCode: 'VA', counties: ['Fairfax'] }],
      { VA: statePack('VA', VA_ADDERS) },
      { steep_pitch: 0, two_story: 30 },
    );
    assert.equal(adders.find((a) => a.key === 'steep_pitch')?.rated, true);
  });
});

describe('licensing and qualifications', () => {
  test('no licenses blocks — an empty licence block damages the package', () => {
    const s = computeOnboardingStatus(input({ pack: fullPack({ licenses: [] }) }));
    const lic = step(s, 'licensing');
    assert.equal(lic.status, 'incomplete');
    assert.equal(lic.required, true);
    assert.equal(s.canBuildPackages, false);
  });

  test('qualifications are encouraged but never block — the section omits cleanly', () => {
    const s = computeOnboardingStatus(
      input({
        pack: fullPack({
          qualifications: { statement: '', experienceYears: null, certifications: [] },
        }),
      }),
    );
    const q = step(s, 'qualifications');
    assert.equal(q.status, 'incomplete');
    assert.equal(q.required, false);
    assert.equal(s.canBuildPackages, true); // still shippable
  });

  test('a missing logo does not block — it degrades gracefully', () => {
    const s = computeOnboardingStatus(input({ pack: fullPack({ logoRef: null }) }));
    assert.equal(step(s, 'company_identity').status, 'complete');
  });
});

describe('overall readiness', () => {
  test('fully configured company can build packages', () => {
    const s = computeOnboardingStatus(input());
    assert.equal(s.canBuildPackages, true);
    assert.deepEqual(s.blockers, []);
  });

  test('a brand-new company reports every blocker, labelled for a human', () => {
    const s = computeOnboardingStatus({
      companyId: 'co-new', pack: null, serviceAreas: [], statePacks: {}, priceBook: null,
    });
    assert.equal(s.canBuildPackages, false);
    assert.ok(s.blockers.length >= 3);
    assert.ok(s.blockers.every((b) => b.includes(': ')));
    assert.ok(s.blockers.some((b) => b.startsWith('Licensing:')));
  });
});
