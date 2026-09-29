import { config } from './config';
import { seedAdminIfNeeded } from './users';
import { loadAll } from './workspace/store';
import * as worker from './worker/engine';
import { createApp } from './app';
import { verifyEmailTransport } from './email/send';

seedAdminIfNeeded();
loadAll();
worker.start();

createApp().listen(config.port, () => {
  console.log(`🏢 Pixel Agent Office server on http://localhost:${config.port}`);
  verifyEmailTransport();
});
