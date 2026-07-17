import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { healthRouter } from './routes/health.js';
import { submissionsRouter } from './routes/submissions.js';
import { packagesRouter } from './routes/packages.js';
import { adminRouter } from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
      },
    },
  }));
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // Serve the admin dashboard
  app.use(express.static(join(__dirname, '..', 'public')));

  app.use(healthRouter);
  app.use(adminRouter);
  app.use(submissionsRouter);
  app.use(packagesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
