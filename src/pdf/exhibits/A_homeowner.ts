import type { ExhibitGenerator, ExhibitContext } from '../exhibit.js';

// Substitute company tokens into the state-scoped homeowner-rights content so
// the state pack stays company-agnostic while the rendered page names the actual
// contractor + license.
function fill(text: string, ctx: ExhibitContext): string {
  const c = ctx.config.company;
  const stateLicense =
    c.licenses.find((l) => l.state === ctx.config.stateCode) ?? c.licenses[0];
  const license = stateLicense
    ? `${stateLicense.classification} License #${stateLicense.number}`
    : '';
  return text.replace(/\{\{contractor\}\}/g, c.legalName).replace(/\{\{license\}\}/g, license);
}

// Exhibit A — Homeowner Information (state-scoped, educational only). Renders the
// real, sourced homeowner-rights content section by section.
export const exhibitA: ExhibitGenerator = {
  letter: 'A',
  title: 'Homeowner Information',
  subtitle: 'Insurer claim-handling standards & policyholder rights — educational, not advice.',
  applies: () => true,
  render(ctx) {
    const { doc } = ctx;
    const r = ctx.config.state.homeownerRights;

    doc.heading(r.title, 2);
    doc.paragraph(r.subtitle, { italic: true });
    doc.paragraph(fill(r.preparedByNote, ctx), { size: 8.5, color: undefined });

    for (const section of r.sections) {
      doc.eyebrow(section.heading);
      for (const p of section.paragraphs) {
        doc.paragraph(fill(p, ctx), { size: 9 });
      }
    }

    // Complaint contact block (highlighted).
    if (r.complaintBlock.length > 0) {
      doc.spacer(2);
      doc.bullets(r.complaintBlock.map((line) => fill(line, ctx)), { size: 9 });
    }

    doc.spacer(4);
    doc.paragraph(fill(r.closingDisclaimer, ctx), { size: 8, italic: true });
  },
};
