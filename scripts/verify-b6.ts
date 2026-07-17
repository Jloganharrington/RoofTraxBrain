// B6 live smoke-test — requires GEMINI_API_KEY.
// Runs one real Gemini generation from the fixture, prints the narrative + guard
// result, and renders out/b6-sample.pdf (full A–M with AI exhibits).
// Do NOT run in CI without the key; the package route 503s if it's absent.
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { sampleInspection, sampleConfig } from '../src/pdf/fixtures.js';
import { computeScope } from '../src/scope/compute.js';
import { buildGenerationInput } from '../src/ai/prompt.js';
import { GeminiGenerator } from '../src/ai/gemini.js';
import { runGuard } from '../src/ai/guard.js';
import { buildPackage } from '../src/pdf/assemble.js';
import { env } from '../src/env.js';

async function main(): Promise<void> {
  if (!env.GEMINI_API_KEY) {
    console.error('[verify-b6] GEMINI_API_KEY is not set — set it in .env or Replit Secrets.');
    process.exit(1);
  }

  console.log(`[verify-b6] model: ${env.GEMINI_MODEL}, temperature: ${env.GEMINI_TEMPERATURE}`);

  // Build grounding input from the fixture
  const scope = computeScope(sampleInspection, sampleConfig);
  const input = buildGenerationInput(sampleInspection, sampleConfig, scope);
  console.log('[verify-b6] grounding input built — calling Gemini...');

  const generator = new GeminiGenerator();
  const start = Date.now();
  const narratives = await generator.generate(input);
  const elapsed = Date.now() - start;

  console.log(`[verify-b6] generation complete in ${elapsed}ms`);
  console.log('\n── Repairability summary ──');
  console.log(narratives.repairability.summary);
  console.log('\n── Matching factors ──');
  narratives.repairability.matchingFactors.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log('\n── Manufacturer summary ──');
  console.log(narratives.manufacturer.summary);
  console.log('\n── Conclusion ──');
  console.log(narratives.conclusion.statement);
  console.log('\n── Basis ──');
  narratives.conclusion.basis.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));

  // Run guard
  const guard = runGuard(narratives, input);
  if (guard.ok) {
    console.log('\n[verify-b6] ✓ guard passed — no violations');
  } else {
    console.error('\n[verify-b6] ✗ guard FAILED:');
    guard.violations.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  // Render full A–M PDF
  console.log('\n[verify-b6] rendering A–M PDF...');
  const built = await buildPackage(sampleInspection, sampleConfig, {
    generatedAt: new Date(),
    narratives,
  });

  await mkdir('out', { recursive: true });
  await writeFile('out/b6-sample.pdf', built.bytes);
  console.log(
    `[verify-b6] ✓ wrote out/b6-sample.pdf — ${built.pageCount} pages, ` +
      `${built.bytes.length} bytes, exhibits: [${built.exhibitLetters.join(', ')}]`,
  );
}

main().catch((err) => {
  console.error('[verify-b6] fatal:', err);
  process.exit(1);
});
