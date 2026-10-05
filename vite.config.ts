import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The repo lives on a network/WSL share where native fs events are unreliable.
    // Set VITE_WATCH_POLLING=false to use native watching on a local disk.
    watch: {
      usePolling: process.env.VITE_WATCH_POLLING !== 'false',
      interval: 300,
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
