import { Router } from 'express';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { env } from '../env.js';
import { issueSessionCookie, clearSessionCookie, requireAdmin } from './session.js';

export const authRouter: Router = Router();

// Blunt brute force on the single login endpoint: 5 attempts/min/IP.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

// Resolve the admin password hash once: an explicit ADMIN_PASSWORD_HASH wins;
// otherwise a plaintext ADMIN_PASSWORD is argon2id-hashed in memory on first use.
let hashPromise: Promise<string | undefined> | undefined;
function adminPasswordHash(): Promise<string | undefined> {
  hashPromise ??= (async () => {
    if (env.ADMIN_PASSWORD_HASH) return env.ADMIN_PASSWORD_HASH;
    if (env.ADMIN_PASSWORD) return argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id });
    return undefined;
  })();
  return hashPromise;
}

// POST /admin/login — { username, password }.
// Generic 401 on any failure: never reveal which field was wrong.
authRouter.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  const fail = (): void => {
    res.status(401).json({ error: 'invalid_credentials' });
  };
  const passwordHash = await adminPasswordHash();
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !env.ADMIN_USERNAME ||
    !passwordHash ||
    !env.SESSION_SECRET
  ) {
    fail();
    return;
  }
  try {
    const userOk = username === env.ADMIN_USERNAME;
    // Always run the (constant-cost) hash verify so username mismatch isn't timeable.
    const passOk = await argon2.verify(passwordHash, password);
    if (!userOk || !passOk) {
      fail();
      return;
    }
  } catch {
    fail();
    return;
  }
  issueSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/admin/logout', requireAdmin, (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
