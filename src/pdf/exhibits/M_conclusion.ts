import type { ExhibitGenerator } from '../exhibit.js';
import { resolveInspector } from '../../report/build.js';

// Exhibit M — Signed Repairability Conclusion.
// The final exhibit. AI-composed conclusion narrative + the inspector's on-file
// signature (rendered as image if available, else a "signature on file" line).
export const exhibitM: ExhibitGenerator = {
  letter: 'M',
  title: 'Signed Repairability Conclusion',
  subtitle:
    'The contractor\'s final forensic conclusion on roof system condition, ' +
    'signed under the inspector\'s on-file attestation.',
  applies: (ctx) => ctx.ai != null,
  render({ doc, inspection, ai, signatureImage }) {
    if (!ai) return;

    doc.paragraph(
      'The following conclusion is the licensed contractor\'s professional determination based ' +
        'solely on the physical findings documented in this proof package. It is not a coverage ' +
        'determination, does not constitute advice regarding an insurance claim, and does not ' +
        'represent the position of any carrier or adjuster.',
    );

    doc.eyebrow('Conclusion');
    for (const para of ai.conclusion.statement.split(/\n\n+/)) {
      if (para.trim()) doc.paragraph(para.trim());
    }

    doc.eyebrow('Factual Basis');
    doc.bullets(ai.conclusion.basis);

    doc.hr();

    // ── Signature block ───────────────────────────────────────────────────────
    doc.eyebrow('Inspector Attestation');

    const inspector = inspection.inspector;
    const signedAt = inspector.signedAt ?? null;

    if (signatureImage) {
      // Render the embedded signature image
      doc.signatureBlock(signatureImage, {
        name: resolveInspector(inspector).name,
        license: resolveInspector(inspector).licenseNumber,
        signedAt,
      });
    } else {
      // Fallback: text attestation line
      doc.paragraph(
        `Signature on file — ${inspector.name}` +
          (inspector.licenseNumber ? ` · License ${inspector.licenseNumber}` : '') +
          (signedAt ? ` · Signed ${signedAt}` : ''),
        { italic: true },
      );
    }

    doc.spacer(8);
    doc.paragraph(
      'This document was prepared by a licensed roofing contractor for forensic documentation ' +
        'purposes only, consistent with UPPA requirements. The contractor documents physical ' +
        'findings and own fixed incurred cost — not carrier obligations or coverage.',
      { size: 8.5, italic: true },
    );
  },
};
