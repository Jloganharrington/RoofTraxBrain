import type { ExhibitGenerator } from '../exhibit.js';
import { composeStormSummary } from '../../weather/summary.js';

// Exhibit D — Storm Event Verification (inspection-scoped, from the weather
// engine's confirmed storm of record). Renders an enriched single-event summary:
// a fact block (event, exact date + local time, distance, report coordinates,
// NWS source), a plain-language narrative, and the raw NWS note when present.
export const exhibitD: ExhibitGenerator = {
  letter: 'D',
  title: 'Storm Event Verification',
  subtitle: 'Certified weather for the date of loss, establishing the causal event.',
  applies: ({ inspection }) => inspection.storm != null,
  render({ doc, inspection }) {
    const s = inspection.storm!;
    const summary = composeStormSummary({
      confirmedDate: s.confirmedDate,
      datetimeLocal: s.datetimeLocal,
      primaryType: s.primaryType,
      hailSize: s.hailSize,
      windSpeed: s.windSpeed,
      distance: s.distance,
      latitude: s.latitude,
      longitude: s.longitude,
      station: s.station,
      description: s.description,
      source: s.source,
      officialEventId: s.officialEventId,
      episodeNarrative: s.episodeNarrative,
      dateOfLoss: inspection.property.dateOfLoss,
    });

    doc.paragraph(
      'The weather event below was confirmed as the storm of record for this claim. Retrieval and ' +
        'eligibility are deterministic; no AI scoring was used to select it.',
    );
    doc.keyValues(summary.rows);

    doc.eyebrow('Event Summary');
    doc.paragraph(summary.narrative);

    if (summary.note) {
      doc.eyebrow('Reporting Note (verbatim)');
      doc.paragraph(summary.note, { italic: true });
    }

    if (summary.episodeNarrative) {
      doc.eyebrow('Storm System Context (NWS episode)');
      doc.paragraph(summary.episodeNarrative);
    }

    doc.paragraph(`Date of loss on file: ${inspection.property.dateOfLoss ?? '-'}.`, {
      size: 8.5,
      color: undefined,
    });
  },
};
