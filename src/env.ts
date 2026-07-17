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

  // B6 — AI narrative generation via Replit's managed Gemini integration
  // (AI_INTEGRATIONS_GEMINI_* are auto-provisioned; the "API key" is an opaque
  // token valid only against the gateway base URL). A plain GEMINI_API_KEY
  // (direct Google endpoint, no base URL) still works as a fallback.
  // Optional at boot; the package route 503s if absent at call time.
  GEMINI_API_KEY: optional('AI_INTEGRATIONS_GEMINI_API_KEY') || optional('GEMINI_API_KEY'),
  GEMINI_BASE_URL: optional('AI_INTEGRATIONS_GEMINI_BASE_URL'),
  GEMINI_MODEL: optional('GEMINI_MODEL', 'gemini-2.5-pro'),
  GEMINI_TEMPERATURE: optional('GEMINI_TEMPERATURE', '0.2'),
  AI_MAX_RETRIES: Number(optional('AI_MAX_RETRIES', '2')),

  // Auth — two realms: machine bearer token (app→Brain API) and single admin
  // session (UI). Optional in development so offline scripts/tests still run;
  // production boot fails closed below if any is missing.
  BRAIN_API_TOKEN: optional('BRAIN_API_TOKEN'),
  ADMIN_USERNAME: optional('ADMIN_USERNAME'),
  // Either a pre-computed argon2 hash (takes precedence) or a plaintext
  // password that gets hashed once in memory at first login attempt.
  ADMIN_PASSWORD_HASH: optional('ADMIN_PASSWORD_HASH'),
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD'),
  SESSION_SECRET: optional('SESSION_SECRET'),
};

// Fail closed: a misconfigured production deploy must not start wide open.
if (env.NODE_ENV === 'production') {
  const missing = (['BRAIN_API_TOKEN', 'ADMIN_USERNAME', 'SESSION_SECRET'] as const)
    .filter((k) => !env[k]) as string[];
  if (!env.ADMIN_PASSWORD_HASH && !env.ADMIN_PASSWORD) {
    missing.push('ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD)');
  }
  if (missing.length > 0) {
    throw new Error(`Refusing to start in production with missing auth secrets: ${missing.join(', ')}`);
  }
}
