import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_URL || 'http://localhost:5200';

export default defineConfig({
  // Relative asset paths so the build works under any sub-path (GitHub Pages, tunnel, LAN).
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API server runs separately; proxy it so the app can use same-origin URLs.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
    },
  },
});
