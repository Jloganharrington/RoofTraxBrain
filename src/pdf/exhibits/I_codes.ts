import type { ExhibitGenerator } from '../exhibit.js';

// Exhibit I — Applicable Codes & Regulations, cross-referenced FROM the scope of
// work (each governing provision is tied to the scope element it applies to).
export const exhibitI: ExhibitGenerator = {
  letter: 'I',
  title: 'Applicable Codes & Regulations',
  subtitle: 'Code provisions governing the repairs, cross-referenced from the scope of work.',
  applies: ({ config }) => config.state.codeLibrary.length > 0,
  render({ doc, config, scope }) {
    doc.paragraph(
      `Code provisions below are drawn from the ${config.state.stateName} adopted code library and ` +
        `are cross-referenced to the specific scope element each governs. Editions are subject to ` +
        `confirmation against the currently adopted code.`,
    );

    // Only show provisions that actually govern a scope element present in this job.
    const scopeKeys = new Set(scope.lineItems.map((li) => li.key));
    const relevant = config.state.codeLibrary.filter((c) =>
      c.appliesTo.some((k) => scopeKeys.has(k)),
    );
    const provisions = relevant.length > 0 ? relevant : config.state.codeLibrary;

    for (const c of provisions) {
      doc.heading(`${c.code} — ${c.title}`, 3);
      doc.keyValues([
        ['Edition', c.edition],
        ['Governs scope element', c.appliesTo.join(', ')],
      ]);
      doc.paragraph(c.text, { size: 9 });
      doc.spacer(2);
    }
  },
};
