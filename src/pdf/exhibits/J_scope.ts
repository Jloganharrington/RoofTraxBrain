import type { ExhibitGenerator } from '../exhibit.js';

const money = (n: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

// Exhibit J — Scope of Work & Pricing Basis. Fixed per-square incurred cost +
// documented adders. Never carrier/Xactimate math.
export const exhibitJ: ExhibitGenerator = {
  letter: 'J',
  title: 'Scope of Work & Pricing Basis',
  subtitle: 'Fixed per-square incurred cost + a statement of the pricing methodology.',
  applies: ({ scope }) => scope.lineItems.length > 0,
  render({ doc, config, scope }) {
    const cur = scope.currency;
    doc.eyebrow('Pricing Basis');
    doc.paragraph(config.company.pricing.basisStatement);
    doc.keyValues([
      ['Base rate', `${money(scope.basePricePerSquare, cur)} / square`],
      ['Measured squares', scope.squares.toFixed(2)],
    ]);

    doc.eyebrow('Scope of Work');
    doc.table(
      [
        { header: 'Item', width: 0.44 },
        { header: 'Qty', width: 0.12 },
        { header: 'Unit', width: 0.1 },
        { header: 'Rate', width: 0.16 },
        { header: 'Total', width: 0.18 },
      ],
      scope.lineItems.map((li) => [
        li.description,
        li.quantity.toFixed(2),
        li.unit,
        money(li.unitPrice, cur),
        money(li.total, cur),
      ]),
    );

    doc.eyebrow('Total');
    doc.keyValues([['Fixed incurred cost (subtotal)', money(scope.subtotal, cur)]]);
    doc.paragraph(
      'This total is the insured’s actual contractual obligation under an executed fixed-price ' +
        'agreement (Exhibit L). It is not a carrier-software estimate and does not represent the ' +
        'amount owed by any carrier.',
      { size: 8.5, italic: true },
    );
  },
};
