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

// POST /admin/login — { username, password }.
// Generic 401 on any failure: never reveal which field was wrong.
authRouter.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  const fail = (): void => {
    res.status(401).json({ error: 'invalid_credentials' });
  };
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !env.ADMIN_USERNAME ||
    !env.ADMIN_PASSWORD_HASH ||
    !env.SESSION_SECRET
  ) {
    fail();
    return;
  }
  try {
    const userOk = username === env.ADMIN_USERNAME;
    // Always run the (constant-cost) hash verify so username mismatch isn't timeable.
    const passOk = await argon2.verify(env.ADMIN_PASSWORD_HASH, password);
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
