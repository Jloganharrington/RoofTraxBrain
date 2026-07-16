import type { ExhibitGenerator } from '../exhibit.js';
import { measuredSquares, totalRoofSqft, linearTotal } from '../../scope/measure.js';

// Exhibit H — Measurement Report. Establishes verifiable quantities from the raw
// field/aerial measurements (the Brain derives area/squares; the field ships raw).
export const exhibitH: ExhibitGenerator = {
  letter: 'H',
  title: 'Measurement Report',
  subtitle: 'Verifiable roof quantities derived from recorded field measurements.',
  applies: ({ inspection }) => inspection.measurements.length > 0,
  render({ doc, inspection }) {
    const slopeLabel = (id: string): string =>
      inspection.slopes.find((s) => s.id === id)?.label ?? id;

    const perSlope = inspection.measurements.filter((m) => m.measurementType === 'slope_area_sqft');
    if (perSlope.length > 0) {
      doc.eyebrow('Slope Areas');
      doc.table(
        [
          { header: 'Slope', width: 0.5 },
          { header: 'Area (sq ft)', width: 0.25 },
          { header: 'Squares', width: 0.25 },
        ],
        perSlope.map((m) => [
          slopeLabel(m.slopeId),
          m.value.toFixed(0),
          (m.value / 100).toFixed(2),
        ]),
      );
    }

    doc.eyebrow('Linear Measurements');
    doc.table(
      [
        { header: 'Type', width: 0.6 },
        { header: 'Length (lf)', width: 0.4 },
      ],
      [
        ['Ridge', linearTotal(inspection, 'ridge_lf').toFixed(0)],
        ['Eave', linearTotal(inspection, 'eave_lf').toFixed(0)],
        ['Rake', linearTotal(inspection, 'rake_lf').toFixed(0)],
      ],
    );

    doc.eyebrow('Totals');
    doc.keyValues([
      ['Total roof area', `${totalRoofSqft(inspection).toFixed(0)} sq ft`],
      ['Total squares (measured)', measuredSquares(inspection).toFixed(2)],
    ]);
    doc.paragraph(
      'Squares are measured area only; no waste factor is baked into this figure. Waste, starter, ' +
        'and ridge are documented as separate scope line items where applicable.',
      { size: 8.5, italic: true },
    );
  },
};
