import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit C — Inspection Methodology (company template + the inspection's own
// auto-logged capture record). Proves *how* the inspection was performed.
export const exhibitC: ExhibitGenerator = {
  letter: 'C',
  title: 'Inspection Methodology',
  subtitle: 'Date, conditions, protocol, and the auto-logged capture record.',
  applies: () => true,
  render({ doc, inspection, config }) {
    const m = config.company.methodologyTemplate;
    const insp = inspection.methodology;

    doc.eyebrow('Conditions of Inspection');
    doc.keyValues([
      ['Inspected', insp?.inspectedAt ?? '-'],
      ['Inspector', inspection.inspector.name],
      ['On-site conditions', insp?.conditions ?? '-'],
      ['Equipment', (insp?.equipment ?? m.equipmentBaseline).join(', ')],
    ]);

    doc.eyebrow('Protocol');
    doc.paragraph(`Test squares — ${m.testSquareProtocol}`);
    doc.paragraph(`Marking — ${m.markingStandard}`);
    doc.paragraph(`Photography — ${m.photoStandard}`);

    // Auto-logged capture record — plain counts derived from the submission.
    const photosByStage = new Map<string, number>();
    for (const p of inspection.photos) {
      photosByStage.set(p.stage, (photosByStage.get(p.stage) ?? 0) + 1);
    }
    const totalHits = inspection.testSquares.reduce((n, ts) => n + ts.hitCount, 0);

    doc.eyebrow('Auto-Logged Capture Record');
    doc.table(
      [
        { header: 'Item', width: 0.6 },
        { header: 'Recorded', width: 0.4 },
      ],
      [
        ['Elevations photographed', String(inspection.elevations.length)],
        ['Slopes documented', String(inspection.slopes.length)],
        ['Test squares marked', String(inspection.testSquares.length)],
        ['Impacts recorded (all squares)', String(totalHits)],
        ['Damage instances documented', String(inspection.damageInstances.length)],
        ['Measurements recorded', String(inspection.measurements.length)],
        ['Total evidence photos', String(inspection.photos.length)],
      ],
    );

    if (photosByStage.size > 0) {
      const stages = [...photosByStage.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
      doc.paragraph(
        'Photos by capture stage: ' + stages.map(([s, n]) => `${s}=${n}`).join(', ') + '.',
        { size: 8.5, color: undefined },
      );
    }
  },
};
