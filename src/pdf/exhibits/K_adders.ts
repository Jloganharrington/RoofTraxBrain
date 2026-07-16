import type { ExhibitGenerator } from '../exhibit.js';

const money = (n: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

// Exhibit K — Conditions & Adders. Every conditional line item paired with the
// documented condition that triggered it (no adder appears without its trigger).
export const exhibitK: ExhibitGenerator = {
  letter: 'K',
  title: 'Conditions & Adders',
  subtitle: 'Each conditional line item paired with its documented triggering condition.',
  applies: ({ scope }) => scope.lineItems.some((li) => li.isAdder),
  render({ doc, scope }) {
    const cur = scope.currency;
    const adders = scope.lineItems.filter((li) => li.isAdder);
    doc.paragraph(
      'The items below are conditional adders. Each is included only because the triggering ' +
        'condition noted was documented during the inspection; none is priced by default.',
    );
    for (const a of adders) {
      doc.heading(a.description, 3);
      doc.keyValues([
        ['Triggering condition', a.triggerCondition ?? '-'],
        ['Quantity', `${a.quantity.toFixed(2)} ${a.unit}`],
        ['Rate', money(a.unitPrice, cur)],
        ['Total', money(a.total, cur)],
        ['Governing code', a.codeRefs.join(', ') || '-'],
      ]);
      doc.spacer(2);
    }
  },
};
