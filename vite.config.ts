import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /pixel-agent-office/ subpath.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
