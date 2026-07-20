import type { CompanyPack } from '../../tenancy/types.js';

// Company pack for NuHome Exteriors (the first tenant). Company-scoped content:
// branding, licensure, qualifications, fixed $/SQ pricing basis, and the
// methodology/contract template references. Pricing is the tenant's own
// incurred-cost rate — never Xactimate/carrier math.
//
// NOTE: pricePerSquare and license numbers are placeholders to be confirmed by
// the tenant before go-live. They are configuration, not code.
//
// ID matches RoofTraxMobile's existing companies.id for this dev/test tenant
// ("RFTRAX") so the courier's payload validates without a mapping layer. This
// is a placeholder scaffold, not the real NuHome onboarding — when NuHome is
// onboarded as a paying customer through the real flow, it gets its own
// company row and this placeholder can be retired.

export const NUHOME_COMPANY_ID = 'RFTRAX';

export const nuHomeCompanyPack: CompanyPack = {
  legalName: 'NuHome Exteriors LLC',
  brandName: 'NuHome Exteriors',
  logoRef: null,
  letterhead: {
    primaryColorHex: '#14263B',
    addressLines: ['NuHome Exteriors', 'Fairfax County, VA'],
    phone: '(000) 000-0000',
    email: 'claims@nuhomeexteriors.example',
    website: null,
  },
  licenses: [
    { state: 'VA', number: '2705-064938A', classification: 'VA Class A Contractor' },
  ],
  servicesOffered: ['roofing', 'siding'],
  qualifications: {
    statement:
      'NuHome Exteriors is a licensed Virginia Class A roofing contractor specializing in storm ' +
      'restoration. This report documents physical findings observed during a forensic roof ' +
      'inspection and the contractor’s fixed incurred cost to restore the property to its ' +
      'pre-loss condition. It is a statement of contractor findings and cost, not an assessment ' +
      'of policy coverage or the amount owed by any carrier.',
    experienceYears: null,
    certifications: [],
  },
  pricing: {
    pricePerSquare: 650,
    currency: 'USD',
    basisStatement:
      'Pricing reflects NuHome Exteriors’ fixed incurred cost per roofing square (100 sq ft), ' +
      'inclusive of materials and labor. Permits, special conditions, and items such as replacement ' +
      'decking are billed separately as documented adders. This is the insured’s actual ' +
      'contractual obligation under an executed fixed-price agreement — it is not a ' +
      'carrier-software (Xactimate) estimate and does not represent what any carrier owes.',
    adderRates: {
      drip_edge: 3.5, // per LF
      ice_barrier: 60, // per SQ
      decking: 85, // per SHEET
      steep_high: 45, // per SQ
      permit: 350, // per EA
    },
  },
  contractTemplateRef: null,
  methodologyTemplate: {
    equipmentBaseline: [
      'Extension ladder',
      'Chalk line',
      'Hail gauge / scale reference',
      'Pitch gauge',
      'Digital camera (GPS/EXIF enabled)',
    ],
    testSquareProtocol:
      'A 10′×10′ test square is chalked on each accessible directional slope. Each ' +
      'impact within the square is circled and photographed with a scale reference; hits are counted ' +
      'and classified. A documented zero-hit square is a valid finding.',
    markingStandard:
      'All documented damage is circled in contrasting chalk/keel and photographed wide, mid, and ' +
      'close (a wide/mid/close triad) with a scale reference in the close photo.',
    photoStandard:
      'Full-resolution originals are preserved unaltered. Every photo carries capture time (UTC), ' +
      'GPS coordinates, and a content hash (SHA-256) recorded at capture for chain-of-custody.',
  },
};
