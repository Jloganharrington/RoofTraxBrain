import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit E — Damage Documentation & Photo Index. Documents each damage
// instance with its causation thread, and provides a photo-to-subject index
// with per-photo content hashes (chain of custody).
export const exhibitE: ExhibitGenerator = {
  letter: 'E',
  title: 'Damage Documentation & Photo Index',
  subtitle: 'Full photo record by area, with a photo-to-subject index and content hashes.',
  applies: ({ inspection }) =>
    inspection.damageInstances.length > 0 || inspection.photos.length > 0,
  render({ doc, inspection }) {
    const slopeLabel = (id: string | null): string =>
      id ? inspection.slopes.find((s) => s.id === id)?.label ?? id : '';
    const elevLabel = (id: string | null): string =>
      id ? inspection.elevations.find((e) => e.id === id)?.direction ?? id : '';

    doc.eyebrow('Documented Damage Instances');
    if (inspection.damageInstances.length === 0) {
      doc.paragraph('No discrete damage instances recorded.', { italic: true });
    } else {
      for (const d of inspection.damageInstances) {
        const loc = d.slopeId ? `Slope: ${slopeLabel(d.slopeId)}` : `Elevation: ${elevLabel(d.elevationId)}`;
        doc.heading(`${d.damageType} — ${loc}`, 3);
        doc.keyValues([
          ['Material', d.material ?? '-'],
          ['Observed indicators', d.observedIndicators.join(', ') || '-'],
        ]);
        if (d.causationNote) doc.paragraph(`Causation: ${d.causationNote}`, { size: 9 });
        doc.spacer(2);
      }
    }

    doc.eyebrow('Photo Index (chain of custody)');
    doc.paragraph(
      'Each photo below is preserved full-resolution and unaltered; the SHA-256 was recorded at ' +
        'capture and verified by intake against the stored bytes.',
      { size: 8.5 },
    );
    const subjectFor = (subjectType: string, subjectId: string | null): string => {
      if (subjectType === 'slope') return `Slope ${slopeLabel(subjectId)}`;
      if (subjectType === 'elevation') return `Elevation ${elevLabel(subjectId)}`;
      if (subjectType === 'inspection') return 'Property';
      return `${subjectType}${subjectId ? ` ${subjectId}` : ''}`;
    };
    doc.table(
      [
        { header: 'Stage', width: 0.1 },
        { header: 'Documents', width: 0.28 },
        { header: 'Caption', width: 0.34 },
        { header: 'SHA-256 (first 12)', width: 0.28 },
      ],
      inspection.photos.map((p) => [
        p.stage,
        subjectFor(p.subjectType, p.subjectId),
        p.caption ?? '-',
        p.sha256.slice(0, 12) + '...',
      ]),
    );
  },
};
