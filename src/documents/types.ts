// Document Center types.
//
// The Brain renders from configuration; the Document Center is where the human
// -editable parts of that configuration live — report templates and the
// state-scoped legal/code source documents — so they can be updated and
// versioned without a code push.
//
// Versioning: many rows may share (kind, key, scope, scopeRef); exactly one is
// `active`. Activating a version deactivates its siblings, so history is kept
// and rollback is just re-activating an older row.

export type DocumentKind =
  | 'report_template' // Phase-2 forensic proof-package HTML template
  | 'preliminary_template' // Phase-1 homeowner report HTML template
  | 'state_legal' // homeowner rights / UPPA disclaimer (state-scoped)
  | 'code_document' // adopted building-code source doc (state-scoped)
  | 'user_guide'; // customer-facing guides served from the site

export type DocumentScope = 'global' | 'state' | 'company';

export const DOCUMENT_KINDS: DocumentKind[] = [
  'report_template',
  'preliminary_template',
  'state_legal',
  'code_document',
  'user_guide',
];

export const DOCUMENT_SCOPES: DocumentScope[] = ['global', 'state', 'company'];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  report_template: 'Report Template',
  preliminary_template: 'Preliminary Template',
  state_legal: 'State Legal',
  code_document: 'Code Document',
  user_guide: 'User Guide',
};

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as string[]).includes(v);
}

export function isDocumentScope(v: unknown): v is DocumentScope {
  return typeof v === 'string' && (DOCUMENT_SCOPES as string[]).includes(v);
}
