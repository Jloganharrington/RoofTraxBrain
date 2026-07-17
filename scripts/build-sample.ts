import { writeFile, mkdir } from 'node:fs/promises';
import { buildPackage } from '../src/pdf/assemble.js';
import { sampleInspection, sampleConfig } from '../src/pdf/fixtures.js';
import { MOCK_NARRATIVES } from '../src/ai/generate.js';

// Renders the fixture inspection into a real proof-package PDF at out/sample.pdf.
// This is the Brain's end-to-end verification — no DB, no network, no API key.
// B6 exhibits F/G/M are rendered via MOCK_NARRATIVES (fixed, offline).
async function main(): Promise<void> {
  const built = await buildPackage(sampleInspection, sampleConfig, {
    generatedAt: new Date('2026-05-20T15:10:00Z'),
    narratives: MOCK_NARRATIVES,
    // signatureImageBytes: omitted — Exhibit M renders the text fallback
  });
  await mkdir('out', { recursive: true });
  await writeFile('out/sample.pdf', built.bytes);
  console.log(
    `[sample] wrote out/sample.pdf — ${built.pageCount} pages, ${built.bytes.length} bytes, ` +
      `exhibits: [${built.exhibitLetters.join(', ') || 'none'}]`,
  );
}

main().catch((err) => {
  console.error('[sample] failed:', err);
  process.exit(1);
});
