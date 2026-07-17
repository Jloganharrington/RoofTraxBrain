import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  PORT: Number(optional('PORT', '4000')),
  VISUALCROSSING_API_KEY: optional('VISUALCROSSING_API_KEY'),
  OBJECT_STORAGE_BASE_URL: optional('OBJECT_STORAGE_BASE_URL'),
  NODE_ENV: optional('NODE_ENV', 'development'),

  // B6 — AI narrative generation. Optional at boot; the package route 503s if
  // GEMINI_API_KEY is absent at call time (same pattern as OBJECT_STORAGE_BASE_URL).
  // Verify the exact model id string in Google AI Studio before setting GEMINI_MODEL.
  GEMINI_API_KEY: optional('GEMINI_API_KEY'),
  GEMINI_MODEL: optional('GEMINI_MODEL', 'gemini-2.5-pro'),
  GEMINI_TEMPERATURE: optional('GEMINI_TEMPERATURE', '0.2'),
  AI_MAX_RETRIES: Number(optional('AI_MAX_RETRIES', '2')),
};
