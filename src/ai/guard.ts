import type { ForensicNarratives } from './types.js';
import type { GenerationInput } from './types.js';

// ── Banned phrases (§0 UPPA contract) ────────────────────────────────────────
// Case-insensitive substring checks. The list encodes the exact prohibitions
// from the no-fabrication contract: coverage opinions, entitlement claims,
// homeowner advice, carrier conclusions, settlement/negotiation language.

const BANNED_PHRASES = [
  'coverage',
  'covered by',
  'the carrier owes',
  'carrier owes',
  'you are entitled',
  'entitled to payment',
  'entitled to receive',
  'policy limit',
  'bad faith',
  'fair settlement',
  'settlement offer',
  'claim should be paid',
  'claim should be accepted',
  'claim should be denied',
  'claim will be paid',
  'should be compensated',
  'recommend filing',
  'recommend you file',
  'you should file',
  'advise you to',
  'we advise',
];

export interface GuardResult {
  ok: boolean;
  violations: string[];
}

// Collect the full text of all narrative fields into one string.
function narrativeText(n: ForensicNarratives): string {
  return [
    n.repairability.summary,
    ...n.repairability.matchingFactors,
    n.manufacturer.summary,
    n.manufacturer.productStatement,
    n.conclusion.statement,
    ...n.conclusion.basis,
  ].join('\n');
}

// ── Banned-phrase check ───────────────────────────────────────────────────────
function checkBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase)).map(
    (phrase) => `banned phrase: "${phrase}"`,
  );
}

// ── Number grounding ──────────────────────────────────────────────────────────
// Extract every numeric token from the narrative text. Each must appear verbatim
// in the serialized input facts — if a number isn't in the facts, the model
// invented or recomputed it, which violates the no-fabrication contract.
//
// Matches: integers (42), decimals (1.75), percentages (12%), fractions (6/12).
// Single-digit numerals (0–9) are skipped — they're too common in prose to
// ground reliably (e.g. ordinals, generic quantities).
const NUM_RE = /\b\d+(?:\.\d+)?(?:%|\/\d+)?\b/g;

function extractNumbers(text: string): string[] {
  const tokens = text.match(NUM_RE) ?? [];
  // Skip bare single-digit integers; keep everything else.
  return [...new Set(tokens.filter((t) => t.length >= 2 || t.includes('.')))];
}

function checkGrounding(text: string, input: GenerationInput): string[] {
  const factsJson = JSON.stringify(input);
  const numbers = extractNumbers(text);
  return numbers
    .filter((n) => !factsJson.includes(n))
    .map((n) => `ungrounded number: "${n}" not found in input facts`);
}

// ── Main guard entry point ────────────────────────────────────────────────────
export function runGuard(narratives: ForensicNarratives, input: GenerationInput): GuardResult {
  const text = narrativeText(narratives);
  const violations = [...checkBanned(text), ...checkGrounding(text, input)];
  return { ok: violations.length === 0, violations };
}
