import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit G — Manufacturer & Product Documentation.
// AI-composed narrative from captured product identification and any manufacturer
// requirements present in config. Strictly factual — no discontinuation assertion
// unless that fact is present in the inspection data.
export const exhibitG: ExhibitGenerator = {
  letter: 'G',
  title: 'Manufacturer & Product Documentation',
  subtitle:
    'Product identification findings and applicable manufacturer requirements, ' +
    'relevant to the matching and uniformity assessment.',
  applies: (ctx) => ctx.ai != null && ctx.inspection.products.length > 0,
  render({ doc, inspection, ai }) {
    if (!ai) return;

    doc.paragraph(
      'Product identification was performed during the forensic inspection as documented below. ' +
        'Manufacturer requirements, where applicable, are drawn from the product information ' +
        'captured at the time of inspection.',
    );

    doc.eyebrow('Product Identification');
    for (const p of inspection.products) {
      const label = p.unidentifiable
        ? 'Product unidentifiable in field'
        : [p.brand, p.line].filter(Boolean).join(' ') || 'Unspecified';
      doc.keyValues([
        ['Identification type', p.identificationType.replace(/_/g, ' ')],
        ['Product', label],
      ]);
      doc.spacer(4);
    }

    doc.eyebrow('Manufacturer Summary');
    for (const para of ai.manufacturer.summary.split(/\n\n+/)) {
      if (para.trim()) doc.paragraph(para.trim());
    }

    doc.eyebrow('Product Statement');
    doc.paragraph(ai.manufacturer.productStatement);

    doc.paragraph(
      'This exhibit documents contractor findings only. No manufacturer warranty analysis ' +
        'or coverage determination is made here.',
      { size: 8.5, italic: true },
    );
  },
};
