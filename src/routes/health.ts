import { Router } from 'express';
import { pingDb } from '../db/client.js';

export const healthRouter: Router = Router();

healthRouter.get('/healthz', async (_req, res) => {
  let dbOk = false;
  try {
    dbOk = await pingDb();
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, service: 'rooftrax-brain', db: dbOk });
});
