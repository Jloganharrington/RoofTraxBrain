import { PdfDoc } from './doc.js';
import { renderSummary, type ContentsEntry } from './summary.js';
import { EXHIBITS } from './registry.js';
import { runExhibit, type ExhibitContext } from './exhibit.js';
import { computeScope } from '../scope/compute.js';
import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';

export interface BuiltPackage {
  bytes: Uint8Array;
  exhibitLetters: string[];
  pageCount: number;
}

// Build the assembled proof-package PDF from a submitted inspection + its
// resolved company/state config. Pure: no DB or network — the caller resolves
// config and (B7) verifies photo integrity first. Runs the summary/contents
// frame, then every applicable exhibit on tenant letterhead.
export async function buildPackage(
  inspection: SubmittedInspection,
  config: ResolvedConfig,
  opts?: { generatedAt?: Date },
): Promise<BuiltPackage> {
  const scope = computeScope(inspection, config);
  const generatedAt = opts?.generatedAt ?? new Date();

  const doc = await PdfDoc.create({
    brandName: config.company.brandName,
    primaryHex: config.company.letterhead.primaryColorHex,
    packageTitle: `Proof Package · ${inspection.property.claimNumber ?? inspection.property.address}`,
    version: `v1 · ${generatedAt.toISOString().slice(0, 10)}`,
  });

  const ctx: ExhibitContext = { doc, inspection, config, scope };

  // Decide which exhibits apply, for the contents table.
  const applicable = EXHIBITS.filter((gen) => gen.applies(ctx));
  const contents: ContentsEntry[] = applicable.map((gen) => ({
    letter: gen.letter,
    title: gen.title,
    proves: gen.subtitle,
  }));

  renderSummary(doc, inspection, config, contents);

  const rendered: string[] = [];
  for (const gen of applicable) {
    if (runExhibit(gen, ctx)) rendered.push(gen.letter);
  }

  const bytes = await doc.bytes();
  return { bytes, exhibitLetters: rendered, pageCount: doc.pdf.getPageCount() };
}
