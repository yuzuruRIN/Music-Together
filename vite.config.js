import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://localhost:${process.env.PORT || 3001}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/audio': target,
      '/mock-thumb': target,
      '/socket.io': { target, ws: true },
    },
  },
});
