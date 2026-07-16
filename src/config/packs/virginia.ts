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
  // Real, sourced Virginia homeowner-rights content (Homeowner-Rights-Information-Page).
  // State-scoped/company-agnostic: {{contractor}} / {{license}} are substituted
  // from the resolved company pack at render. References current as of
  // preparation; verify at law.lis.virginia.gov before go-live.
  homeownerRights: {
    title: 'Homeowner Information Page',
    subtitle: 'Your Property Insurance Claim: What Virginia Law Provides',
    preparedByNote: 'Provided for general educational purposes by {{contractor}} — {{license}}.',
    sections: [
      {
        heading: 'Our Role — and What It Is Not',
        paragraphs: [
          '{{contractor}} is your contractor. Our role in this claim is limited to matters within our professional expertise: identifying and documenting physical damage, assessing repairability, preparing the scope and cost of repairs, and citing the building codes and manufacturer requirements that govern how those repairs must be performed.',
          'We are not a public adjuster, attorney, or insurance advisor. Under Virginia law (Va. Code § 38.2-1845.1 et seq.), only a licensed public adjuster or a licensed attorney may negotiate, adjust, or provide advice regarding the settlement of your insurance claim on your behalf. All decisions regarding your claim — including whether to accept, dispute, or appeal any coverage determination — are yours alone to make. The information below is general, publicly available information about Virginia law. It is not advice about your specific claim.',
        ],
      },
      {
        heading: 'What Virginia Law Requires of Your Insurance Company',
        paragraphs: [
          "Virginia's Unfair Claim Settlement Practices rules (Va. Code § 38.2-510 and 14VAC5-400) establish minimum standards insurers must follow when handling property claims. Among them:",
          'Acknowledgment. Your insurer must acknowledge receipt of your claim within 15 calendar days, and must respond to your inquiries within 15 calendar days. (14VAC5-400-50)',
          'Prompt decision. Within 15 calendar days after receiving your properly executed proof of loss, your insurer must advise you whether the claim is accepted or denied. If it needs more time, it must tell you why in writing and continue to provide written status updates while the investigation remains open. (14VAC5-400-60)',
          'Written denials with reasons. Any denial must be given to you in writing and must include a reasonable written explanation of its basis; if the denial relies on a policy provision, the insurer must specifically reference that provision. (14VAC5-400-70)',
          'No misrepresentation. An insurer may not misrepresent policy provisions or knowingly conceal from you, directly or by omission, benefits, coverages, or other provisions of your policy that apply to your claim. (14VAC5-400-40)',
          'Fair settlement practices. Virginia law prohibits insurers from failing to attempt in good faith to make prompt, fair, and equitable settlements of claims in which liability has become reasonably clear. (Va. Code § 38.2-510)',
        ],
      },
      {
        heading: 'Your Rights as a Virginia Policyholder',
        paragraphs: [
          'You have the right to communicate directly with your insurer. You may speak with your adjuster, request documents, and ask that any coverage position be put in writing.',
          'You have the right to a written explanation. If any part of your claim is denied or reduced, you may request the specific policy language the insurer is relying upon.',
          "You have the right to select your own contractor. Unless your policy explicitly requires otherwise, you are entitled to hire the licensed contractor of your choice to perform repairs to your property. Virginia's Unfair Claim Settlement Practices Act (Va. Code § 38.2-510) prohibits insurers from conditioning payment, delaying processing, or applying pressure designed to cause you to abandon your chosen contractor. Where a signed repair contract already exists, insurer conduct intended to cause you to breach that contract may give rise to additional legal claims under Virginia common law. If your insurer suggests or implies that you should use a different contractor than the one you have selected, request that communication in writing and contact the Virginia Bureau of Insurance.",
          'You have the right to review your policy. You are entitled to a complete copy of your policy, including all endorsements, from your insurer or agent.',
          "You have the right to professional representation. You may, at your option, hire a licensed public adjuster (licensed by the Virginia Bureau of Insurance under Va. Code § 38.2-1845.2) or a licensed attorney to advise on or negotiate your claim. You can verify a public adjuster's license through the State Corporation Commission's license lookup.",
          "You have the right to invoke your policy's dispute provisions. Most property policies contain provisions (such as an appraisal clause) that establish a process for resolving disagreements about the amount of loss. Whether and how to invoke any such provision is your decision.",
          'You have the right to file a complaint. If you believe your insurer has not handled your claim in accordance with Virginia law, you may file a complaint with the Virginia State Corporation Commission, Bureau of Insurance:',
        ],
      },
      {
        heading: 'How This Proof Package Fits In',
        paragraphs: [
          'The documentation in this package — storm data, photographs, code citations, and our repairability assessment — reflects our professional findings as your contractor regarding the physical condition of your property and the scope of repairs required. You are free to share this package with your insurer, your public adjuster, or your attorney. What you do with it, and every decision about your claim, remains entirely in your hands.',
        ],
      },
    ],
    complaintBlock: [
      'Virginia Bureau of Insurance — Consumer Services',
      'P.O. Box 1157, Richmond, VA 23218',
      'Toll-free: 1-877-310-6560',
      'scc.virginia.gov (Bureau of Insurance -> File a Complaint)',
    ],
    closingDisclaimer:
      'This document is provided for general informational purposes only and does not constitute legal, ' +
      'insurance, or claims advice. {{contractor}} does not negotiate, adjust, or advise on the settlement ' +
      'of insurance claims. For advice regarding your specific claim, consult a licensed public adjuster or ' +
      'attorney. Statutory and regulatory references are current as of the date of preparation; verify ' +
      'current law at law.lis.virginia.gov.',
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
