import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit D — Storm Event Verification (inspection-scoped, from the weather
// engine's confirmed storm of record).
export const exhibitD: ExhibitGenerator = {
  letter: 'D',
  title: 'Storm Event Verification',
  subtitle: 'Certified weather for the date of loss, establishing the causal event.',
  applies: ({ inspection }) => inspection.storm != null,
  render({ doc, inspection }) {
    const s = inspection.storm!;
    doc.paragraph(
      'The weather event below was confirmed as the storm of record for this claim. Retrieval and ' +
        'eligibility are deterministic; no AI scoring was used to select it.',
    );
    doc.keyValues([
      ['Confirmed event date', s.confirmedDate ?? '-'],
      ['Primary event type', s.primaryType ?? '-'],
      ['Max hail size', s.hailSize != null ? `${s.hailSize}"` : '-'],
      ['Max wind speed', s.windSpeed != null ? `${s.windSpeed} mph` : '-'],
      ['Distance from property', s.distance != null ? `${s.distance} mi` : '-'],
      ['Data source', s.source],
    ]);
    if (s.description) {
      doc.eyebrow('Event Description');
      doc.paragraph(s.description);
    }
    doc.paragraph(
      `Date of loss on file: ${inspection.property.dateOfLoss ?? '-'}.`,
      { size: 8.5, color: undefined },
    );
  },
};
