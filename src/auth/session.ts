import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';
import { machineTokenValid } from './machine.js';

// Single-admin session realm: stateless HS256 JWT in an httpOnly cookie.
// No session store needed for one operator.
export const SESSION_COOKIE = 'brain_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h

export function issueSessionCookie(res: Response): void {
  // Fail closed: never sign a session with a missing/empty secret.
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not configured; refusing to issue admin session');
  }
  const token = jwt.sign({ sub: 'admin' }, env.SESSION_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function adminSessionValid(req: Request): boolean {
  // Fail closed: with no signing secret, no cookie can ever be valid.
  if (!env.SESSION_SECRET) return false;
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, env.SESSION_SECRET);
    return typeof payload === 'object' && payload.sub === 'admin';
  } catch {
    return false;
  }
}

// UI/settings guard. API-ish requests get 401 JSON; page navigations redirect to /login.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (env.AUTH_DISABLED || adminSessionValid(req)) {
    next();
    return;
  }
  const wantsHtml = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
  if (wantsHtml) {
    res.redirect('/login');
  } else {
    res.status(401).json({ error: 'unauthorized' });
  }
}

// Either realm may trigger builds / read status.
export function requireAdminOrMachine(req: Request, res: Response, next: NextFunction): void {
  if (env.AUTH_DISABLED || adminSessionValid(req) || machineTokenValid(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthorized' });
}
