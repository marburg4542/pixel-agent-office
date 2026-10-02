// pm2 process for the server (it also serves the built app from dist/ on the same port).
// First time: `npm run build`, then `pm2 start ecosystem.config.cjs` and `pm2 save` so it comes back after a reboot.
// After pulling changes: `npm run build` and `pm2 restart pixel-office`.
module.exports = {
  apps: [
    {
      name: 'pixel-office',
      script: 'server/index.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
