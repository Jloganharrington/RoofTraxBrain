import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit F — Repairability Assessment.
// AI-composed matching & uniformity narrative grounded in documented damage +
// product findings. Only renders when AI narratives are available (ctx.ai != null).
export const exhibitF: ExhibitGenerator = {
  letter: 'F',
  title: 'Repairability Assessment',
  subtitle:
    'Matching and uniformity analysis — whether a code-compliant, reasonably uniform repair ' +
    'can be achieved by partial replacement, based on documented damage and product findings.',
  applies: (ctx) => ctx.ai != null,
  render({ doc, ai }) {
    if (!ai) return; // type guard; applies() ensures this is non-null

    doc.paragraph(
      'The following assessment addresses whether partial replacement of the affected roof areas ' +
        'can achieve a code-compliant and reasonably uniform result. It is composed from the ' +
        'physical findings and product identification documented during the forensic inspection — ' +
        'not from photographic analysis or carrier estimates.',
    );

    doc.eyebrow('Assessment');
    // Split multi-paragraph summary on double-newline or render as a block
    for (const para of ai.repairability.summary.split(/\n\n+/)) {
      if (para.trim()) doc.paragraph(para.trim());
    }

    doc.eyebrow('Matching & Uniformity Factors');
    doc.bullets(ai.repairability.matchingFactors);

    doc.paragraph(
      'This assessment reflects the contractor\'s professional evaluation of the physical ' +
        'site conditions. It is not a coverage determination and does not constitute advice ' +
        'regarding any insurance claim.',
      { size: 8.5, italic: true },
    );
  },
};
