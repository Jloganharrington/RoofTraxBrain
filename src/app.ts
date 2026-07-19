import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { healthRouter } from './routes/health.js';
import { submissionsRouter } from './routes/submissions.js';
import { packagesRouter } from './routes/packages.js';
import { adminRouter } from './routes/admin.js';
import { configRouter } from './routes/config.js';
import { authRouter } from './auth/login.js';
import { requireAdmin } from './auth/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  // Behind Replit's proxy — needed for correct client IPs (rate limiting) and
  // Secure cookies.
  app.set('trust proxy', 1);

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
  // The UI is same-origin and app→Brain calls are server-to-server, so no
  // cross-origin browser access is needed. Same-origin requests don't send an
  // Origin header, so this allowlist (empty) effectively disables CORS instead
  // of reflecting arbitrary origins.
  app.use(cors({ origin: [], credentials: false }));
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());

  // Open: health (deploy checks) + login flow (rate-limited inside authRouter).
  app.use(healthRouter);
  app.use(authRouter);

  const publicDir = join(__dirname, '..', 'public');

  // Login page is the only open UI page.
  app.get('/login', (_req, res) => {
    res.sendFile(join(publicDir, 'login.html'));
  });

  // The dashboard itself requires an admin session (redirects to /login).
  app.get(['/', '/index.html'], requireAdmin, (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
  // Remaining static assets (none hold data; pages call the guarded APIs).
  app.use(express.static(publicDir, { index: false }));

  // Admin-only ops/settings API (dashboard data, go-live toggles, NOAA ops).
  app.use(requireAdmin, adminRouter);
  // API realms are guarded per-route inside these routers.
  app.use(submissionsRouter);
  app.use(packagesRouter);
  // Company self-service config (Site onboarding + wizards). Gates internally
  // with requireAdminOrMachine, like the submission/package routers above.
  app.use(configRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
