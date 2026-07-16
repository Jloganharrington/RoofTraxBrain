import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit A — Homeowner Information (state-scoped, educational only).
export const exhibitA: ExhibitGenerator = {
  letter: 'A',
  title: 'Homeowner Information',
  subtitle: 'Insurer claim-handling standards & policyholder rights (educational, not advice).',
  applies: () => true,
  render({ doc, config }) {
    const rights = config.state.homeownerRights;
    doc.heading(rights.title, 2);
    doc.paragraph(rights.body);
    doc.spacer(6);
    doc.paragraph(
      'This information is educational and is not legal advice or an interpretation of your policy.',
      { italic: true, size: 8.5 },
    );
  },
};
