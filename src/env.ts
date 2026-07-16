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
};
