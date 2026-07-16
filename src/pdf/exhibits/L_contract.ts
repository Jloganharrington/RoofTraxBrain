import type { ExhibitGenerator } from '../exhibit.js';

const money = (n: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

// Exhibit L — Contract Exhibit. The executed fixed-price agreement is the
// evidence of the insured's ACTUAL incurred cost. The Brain summarizes the
// agreement terms; the signed contract document itself is attached/on file.
export const exhibitL: ExhibitGenerator = {
  letter: 'L',
  title: 'Contract Exhibit',
  subtitle: 'Executed fixed-price agreement — evidence of actual incurred cost.',
  applies: ({ scope }) => scope.subtotal > 0,
  render({ doc, inspection, config, scope }) {
    doc.paragraph(
      'The insured has entered into a fixed-price agreement with the contractor to restore the ' +
        'property to its pre-loss, code-compliant condition. The agreed price below is the insured’s ' +
        'actual incurred cost — the amount the insured is contractually obligated to pay — and is ' +
        'the basis for the documented loss.',
    );
    doc.keyValues([
      ['Insured', inspection.property.insuredName ?? '-'],
      ['Property', inspection.property.address],
      ['Contractor', config.company.legalName],
      ['Agreement type', 'Fixed-price (incurred cost)'],
      ['Agreed price', money(scope.subtotal, scope.currency)],
    ]);
    doc.spacer(4);
    if (config.company.contractTemplateRef) {
      doc.paragraph(
        `The executed agreement (template ref: ${config.company.contractTemplateRef}) is attached ` +
          'and incorporated by reference.',
        { size: 9 },
      );
    } else {
      doc.paragraph(
        'The executed, signed fixed-price agreement is on file and incorporated by reference. ' +
          '(No contract template is configured for this tenant yet — attach the executed document.)',
        { size: 9, italic: true },
      );
    }
    doc.paragraph(
      'This exhibit evidences the contractor’s and insured’s own agreed cost. It is not a carrier ' +
        'estimate and does not state what any carrier owes.',
      { size: 8.5, italic: true },
    );
  },
};
