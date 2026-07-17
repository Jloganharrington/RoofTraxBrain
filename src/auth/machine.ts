import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';

// Constant-time bearer-token check for the app→Brain API realm.
// Fail closed: missing config, missing header, or mismatch all → 401.
export function machineTokenValid(req: Request): boolean {
  if (!env.BRAIN_API_TOKEN) return false; // not configured → nothing authenticates
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(env.BRAIN_API_TOKEN, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function requireMachineToken(req: Request, res: Response, next: NextFunction): void {
  if (machineTokenValid(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthorized' });
}
