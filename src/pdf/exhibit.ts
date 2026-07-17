import type { PDFImage } from 'pdf-lib';
import type { PdfDoc } from './doc.js';
import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig } from '../tenancy/types.js';
import type { ScopeResult } from '../scope/types.js';
import type { ForensicNarratives } from '../ai/types.js';

export interface ExhibitContext {
  doc: PdfDoc;
  inspection: SubmittedInspection;
  config: ResolvedConfig;
  scope: ScopeResult;
  // B6 — AI narratives (null when GEMINI_API_KEY not configured or not yet generated)
  ai: ForensicNarratives | null;
  // B6 — pre-embedded signature image (null when absent or failed to embed)
  signatureImage: PDFImage | null;
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
