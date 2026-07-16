import type { StatePack } from '../../tenancy/types.js';

// State pack for Virginia. State-scoped content: adopted building-code library,
// homeowner-rights page, UPPA disclaimer, and conditional adder rules.
//
// ⚠ COUNSEL-REVIEW REQUIRED. Every provision, citation, rights statement, and
// disclaimer below is STARTER content and MUST be verified against current
// Virginia statute and the adopted USBC edition by a licensed attorney / code
// official before Virginia is enabled for go-live. The seed intentionally
// leaves `reviewedAt = null`, which the config resolver treats as
// "not go-live" and refuses to render packages for. Do not stamp `reviewedAt`
// until this content has been reviewed and confirmed current.

// Scope-element keys the code library and adder rules cross-reference (shared
// with the B5 scope chain). Keep in sync with scope/elements.ts.
export const VA_STATE_CODE = 'VA';

export const virginiaStatePack: StatePack = {
  stateCode: 'VA',
  stateName: 'Virginia',
  homeownerRights: {
    title: 'Homeowner Information — Your Rights in the Claims Process',
    body:
      'This page is provided for your information and education. It is not legal advice and does ' +
      'not interpret your insurance policy. Under Virginia law, you as the policyholder have the ' +
      'right to file a claim for covered storm damage, to receive fair and prompt handling of that ' +
      'claim by your insurer, to obtain and rely on documentation of the physical condition of your ' +
      'property, and to select the licensed contractor of your choice to perform any repairs. This ' +
      'proof package documents the physical damage your contractor observed, the weather event ' +
      'believed to have caused it, the applicable building-code requirements for a compliant repair, ' +
      'and your contractor’s fixed cost to restore the property. Decisions about coverage and the ' +
      'amount payable under your policy are made between you and your insurer.',
  },
  uppaDisclaimer: {
    statuteCitation: 'Va. Code § 38.2-1845.1 et seq.',
    body:
      'NuHome Exteriors is a licensed contractor, not a public adjuster. Under Virginia’s public ' +
      'adjuster licensing law (Va. Code § 38.2-1845.1 et seq.), only a licensed public adjuster may ' +
      'negotiate or effect the settlement of a claim on behalf of an insured. Nothing in this ' +
      'package negotiates, adjusts, or advises on the settlement of your claim, and nothing here ' +
      'states what any carrier owes. This package documents the contractor’s physical findings and ' +
      'the contractor’s own fixed incurred cost to perform a code-compliant repair. [COUNSEL REVIEW ' +
      'REQUIRED before go-live.]',
  },
  // Exhibit I — starter provisions. Editions/citations are illustrative and
  // MUST be confirmed against the currently adopted Virginia USBC edition.
  codeLibrary: [
    {
      id: 'va-irc-r908-3',
      code: 'IRC R908.3',
      edition: 'IRC as adopted by the Virginia USBC (confirm current edition)',
      title: 'Roof replacement',
      text:
        'Roof replacement shall include the removal of existing layers of roof coverings down to the ' +
        'roof deck. Required where existing coverings are damaged such that repair is not permitted.',
      appliesTo: ['roof_covering'],
    },
    {
      id: 'va-irc-r905-2-8-5',
      code: 'IRC R905.2.8.5',
      edition: 'IRC as adopted by the Virginia USBC (confirm current edition)',
      title: 'Drip edge',
      text:
        'A drip edge shall be provided at eaves and rake edges of shingle roofs. Adjacent segments ' +
        'shall be lapped and the drip edge fastened per code spacing.',
      appliesTo: ['drip_edge'],
    },
    {
      id: 'va-irc-r905-1-1',
      code: 'IRC R905.1.1',
      edition: 'IRC as adopted by the Virginia USBC (confirm current edition)',
      title: 'Underlayment application',
      text:
        'Underlayment shall be applied in accordance with the manufacturer’s installation ' +
        'instructions and the code for the roof-covering type and roof slope.',
      appliesTo: ['underlayment'],
    },
    {
      id: 'va-irc-r905-1-2',
      code: 'IRC R905.1.2',
      edition: 'IRC as adopted by the Virginia USBC (confirm current edition)',
      title: 'Ice barrier',
      text:
        'In areas where there has been a history of ice forming along the eaves, an ice barrier ' +
        'shall be installed for asphalt shingles. Applicability is climate/jurisdiction dependent — ' +
        'confirm for the property’s location.',
      appliesTo: ['ice_barrier'],
    },
    {
      id: 'va-irc-r803-decking',
      code: 'IRC R803',
      edition: 'IRC as adopted by the Virginia USBC (confirm current edition)',
      title: 'Roof sheathing / decking',
      text:
        'Roof sheathing shall be of an approved type and thickness for the span and shall provide a ' +
        'sound substrate for the roof covering. Deteriorated or non-conforming decking exposed during ' +
        'tear-off must be replaced to receive the new covering.',
      appliesTo: ['decking'],
    },
  ],
  // Exhibit K — conditional adders. Each is billed ONLY when its documented
  // triggering condition is present in the inspection record.
  adderRules: [
    {
      id: 'va-adder-decking',
      key: 'decking',
      label: 'Replacement roof decking',
      triggerCondition:
        'Deteriorated, delaminated, or non-conforming decking documented (photo + component status) ' +
        'during tear-off.',
      unit: 'SHEET',
    },
    {
      id: 'va-adder-drip-edge',
      key: 'drip_edge',
      label: 'Drip edge (code-required where absent)',
      triggerCondition: 'Existing roof documented without a compliant drip edge at eaves/rakes.',
      unit: 'LF',
    },
    {
      id: 'va-adder-ice-water',
      key: 'ice_barrier',
      label: 'Ice & water barrier at eaves/valleys',
      triggerCondition: 'Ice-barrier code provision applicable for the property location.',
      unit: 'SQ',
    },
    {
      id: 'va-adder-steep',
      key: 'steep_high',
      label: 'Steep / high adder',
      triggerCondition: 'Documented roof pitch exceeding 8/12 or access two stories or greater.',
      unit: 'SQ',
    },
    {
      id: 'va-adder-permit',
      key: 'permit',
      label: 'Building permit',
      triggerCondition: 'Jurisdiction requires a permit for roof replacement at this property.',
      unit: 'EA',
    },
  ],
};
