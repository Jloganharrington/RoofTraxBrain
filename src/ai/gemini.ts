// GeminiGenerator — the ONLY file that calls the Google GenAI API.
// All other AI files are pure and network-free.
import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';
import { UPPA_SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { NARRATIVE_SCHEMA, parseNarratives } from './schema.js';
import { runGuard } from './guard.js';
import type { ForensicNarratives, GenerationInput } from './types.js';

export class GeminiGenerationError extends Error {
  constructor(
    message: string,
    public readonly violations: string[] = [],
  ) {
    super(message);
    this.name = 'GeminiGenerationError';
  }
}

export class GeminiGenerator {
  private ai: GoogleGenAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new GeminiGenerationError('GEMINI_API_KEY is not configured');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generate(input: GenerationInput): Promise<ForensicNarratives> {
    const userPrompt = buildUserPrompt(input);
    const maxAttempts = env.AI_MAX_RETRIES + 1;
    let lastViolations: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt =
        attempt === 1
          ? userPrompt
          : `${userPrompt}\n\nPREVIOUS ATTEMPT REJECTED — violations:\n${lastViolations.map((v) => `- ${v}`).join('\n')}\nFix these and try again.`;

      const res = await this.ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: UPPA_SYSTEM_PROMPT,
          temperature: Number(env.GEMINI_TEMPERATURE),
          responseMimeType: 'application/json',
          responseSchema: NARRATIVE_SCHEMA,
        },
      });

      const raw = res.text;
      if (!raw) {
        lastViolations = ['empty response from model'];
        continue;
      }

      let parsed: ForensicNarratives;
      try {
        parsed = parseNarratives(JSON.parse(raw));
      } catch (err) {
        lastViolations = [`schema validation failed: ${(err as Error).message}`];
        continue;
      }

      const guard = runGuard(parsed, input);
      if (guard.ok) return parsed;

      lastViolations = guard.violations;
      console.warn(`[ai] attempt ${attempt}/${maxAttempts} — guard rejected (${guard.violations.length} violations):`, guard.violations);
    }

    throw new GeminiGenerationError(
      `Narrative generation failed after ${maxAttempts} attempts — guard violations not resolved`,
      lastViolations,
    );
  }
}
