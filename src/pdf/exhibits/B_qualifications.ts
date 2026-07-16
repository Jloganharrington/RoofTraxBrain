import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit B — Statement of Qualifications (company-scoped).
export const exhibitB: ExhibitGenerator = {
  letter: 'B',
  title: 'Statement of Qualifications',
  subtitle: 'Licensure, experience, and the professional basis for the findings.',
  applies: () => true,
  render({ doc, config }) {
    const c = config.company;
    doc.heading(c.legalName, 2);
    doc.paragraph(c.qualifications.statement);

    if (c.qualifications.experienceYears != null) {
      doc.keyValues([['Experience', `${c.qualifications.experienceYears} years`]]);
    }

    doc.eyebrow('Licensure');
    if (c.licenses.length === 0) {
      doc.paragraph('No licenses on file.', { italic: true });
    } else {
      doc.table(
        [
          { header: 'State', width: 0.18 },
          { header: 'License #', width: 0.42 },
          { header: 'Classification', width: 0.4 },
        ],
        c.licenses.map((l) => [l.state, l.number, l.classification]),
      );
    }

    if (c.qualifications.certifications.length > 0) {
      doc.eyebrow('Certifications');
      doc.bullets(c.qualifications.certifications);
    }
  },
};
