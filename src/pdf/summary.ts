import type { PdfDoc } from './doc.js';
import { resolveInspector } from '../report/build.js';
import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';

export interface ContentsEntry {
  letter: string;
  title: string;
  proves: string;
}

// The summary & contents page — the first page of the package. Establishes the
// claim/property identity and lists the exhibit tabs, then closes with the
// state-specific UPPA disclaimer.
export function renderSummary(
  doc: PdfDoc,
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  contents: ContentsEntry[],
): void {
  doc.newPage();
  doc.heading('Proof Package — Summary & Contents', 1);
  doc.paragraph(
    `Prepared by ${config.company.legalName} documenting physical roof damage, the weather event ` +
      `believed to have caused it, the building-code requirements for a compliant repair, and the ` +
      `contractor's fixed incurred cost to restore the property to its pre-loss condition.`,
    { color: undefined },
  );

  doc.eyebrow('Claim & Property');
  const p = inspection.property;
  doc.keyValues([
    ['Insured', p.insuredName ?? '-'],
    ['Property', p.address],
    ['Carrier', p.carrier ?? '-'],
    ['Policy #', p.policyNumber ?? '-'],
    ['Claim #', p.claimNumber ?? '-'],
    ['Date of loss', p.dateOfLoss ?? '-'],
    ['Inspector', resolveInspector(inspection.inspector).name],
    ['Jurisdiction', `${config.state.stateName} (${config.stateCode})`],
  ]);

  doc.eyebrow('Contents');
  if (contents.length === 0) {
    doc.paragraph('(No exhibits applicable to this inspection.)', { italic: true });
  } else {
    doc.table(
      [
        { header: 'Tab', width: 0.08 },
        { header: 'Exhibit', width: 0.34 },
        { header: 'What it proves', width: 0.58 },
      ],
      contents.map((c) => [c.letter, c.title, c.proves]),
    );
  }

  doc.spacer(8);
  doc.eyebrow('Disclaimer');
  doc.paragraph(config.state.uppaDisclaimer.body, { size: 8.5, italic: true, color: undefined });
  doc.paragraph(`Governing statute: ${config.state.uppaDisclaimer.statuteCitation}`, {
    size: 8,
    color: undefined,
  });
}
