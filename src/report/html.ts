// Stage 1 of the HTML package renderer: assemble a self-contained HTML document
// from REPORT_DATA v2 + the report template + embedded photo bytes.
//
// Pure with respect to I/O: photo bytes are supplied by an injected resolver, so
// this is unit-testable without a network. The route wires the real resolver
// (fetch through the app photo proxy). HTML→PDF (Stage 2) consumes the string
// this returns.

import type { ReportDataV2 } from './types.js';

// The template ships a demo `const REPORT_DATA = {...};` block terminated by
// `const sectionMeta = {};`. We replace the object literal in-place so the
// template's own render script runs against real data. Same seam the local
// injector used; kept identical so the bundled template and the Document-Center
// template are interchangeable.
const DATA_START = 'const REPORT_DATA =';
const DATA_END = '\nconst sectionMeta';

export interface PhotoBytes {
  bytes: Uint8Array;
  contentType: string; // e.g. 'image/jpeg'
}

/** Resolve a photo id to its raw bytes, or null if unavailable. */
export type PhotoResolver = (photoId: string) => Promise<PhotoBytes | null>;

function toDataUri(p: PhotoBytes): string {
  // Buffer is available in the Brain's Node runtime.
  const b64 = Buffer.from(p.bytes).toString('base64');
  return `data:${p.contentType || 'image/jpeg'};base64,${b64}`;
}

export interface AssembleHtmlResult {
  html: string;
  embeddedPhotos: number;
  missingPhotos: string[]; // ids the resolver could not supply
}

/**
 * Populate each photo's `src` (via the resolver) and inject the finished
 * REPORT_DATA into the template, returning a self-contained HTML string.
 *
 * A photo the resolver cannot supply is left with `src: null` and reported in
 * `missingPhotos` — it renders as a placeholder rather than failing the whole
 * document. (Integrity verification upstream already guarantees the bytes exist
 * for a package build; this is defence in depth.)
 */
export async function assembleReportHtml(
  reportData: ReportDataV2,
  templateHtml: string,
  resolvePhoto: PhotoResolver,
): Promise<AssembleHtmlResult> {
  const missingPhotos: string[] = [];
  let embeddedPhotos = 0;

  const photos = await Promise.all(
    reportData.photos.map(async (photo) => {
      try {
        const bytes = await resolvePhoto(photo.id);
        if (bytes) {
          embeddedPhotos += 1;
          return { ...photo, src: toDataUri(bytes) };
        }
      } catch {
        // fall through to missing
      }
      missingPhotos.push(photo.id);
      return { ...photo, src: null };
    }),
  );

  const data: ReportDataV2 = { ...reportData, photos };

  const start = templateHtml.indexOf(DATA_START);
  const end = templateHtml.indexOf(DATA_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      'report template is missing the injectable REPORT_DATA block ' +
        '(`const REPORT_DATA = …;` followed by `const sectionMeta`)',
    );
  }

  const html =
    templateHtml.slice(0, start) +
    `const REPORT_DATA = ${JSON.stringify(data)};` +
    templateHtml.slice(end);

  return { html, embeddedPhotos, missingPhotos };
}
