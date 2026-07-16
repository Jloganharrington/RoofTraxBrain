import type { PdfDoc } from './doc.js';
import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import type { ScopeResult } from '../scope/types.js';

export interface ExhibitContext {
  doc: PdfDoc;
  inspection: SubmittedInspection;
  config: ResolvedConfig;
  scope: ScopeResult;
}

export interface ExhibitGenerator {
  letter: string; // "A".."M"
  title: string;
  subtitle: string;
  // Some exhibits are conditional (e.g. interior only when documented). Return
  // false to omit the exhibit from this package.
  applies(ctx: ExhibitContext): boolean;
  render(ctx: ExhibitContext): void;
}

// Helper: does an exhibit divider + render, returning the exhibit for the
// contents table if it applied.
export function runExhibit(gen: ExhibitGenerator, ctx: ExhibitContext): boolean {
  if (!gen.applies(ctx)) return false;
  ctx.doc.exhibitCover(gen.letter, gen.title, gen.subtitle);
  gen.render(ctx);
  return true;
}
