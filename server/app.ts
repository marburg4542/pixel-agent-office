import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config, SERVER_DIR } from './config';
import eventsRouter from './events';
import authRoutes from './routes/auth';
import userRoutes, { UPLOADS_DIR } from './routes/users';
import workspaceRoutes from './routes/workspace';

export function createApp() {
  const app = express();
  // Trust only the loopback proxy (cloudflared runs on localhost) so rate limits see real client IPs.
  app.set('trust proxy', 'loopback');
  app.use(cors({ origin: config.frontendUrls, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // File names are timestamp + random, never reused — safe to cache for a long time.
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

  app.use('/api', eventsRouter);
  app.use('/api', authRoutes);
  app.use('/api', userRoutes);
  app.use('/api', workspaceRoutes);

  // Serve the built web app too (dist/) → one URL for both site and API, which keeps tunnels simple.
  const distPath = path.join(SERVER_DIR, '..', 'dist');
  if (fs.existsSync(distPath)) app.use(express.static(distPath));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('💥', err);
    res.status(500).json({ success: false, message: 'Server error' });
  });
  return app;
}
