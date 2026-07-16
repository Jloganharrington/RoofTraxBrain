import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health.js';
import { submissionsRouter } from './routes/submissions.js';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '25mb' })); // submissions carry manifests + record payloads

  app.use(healthRouter);
  app.use(submissionsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
