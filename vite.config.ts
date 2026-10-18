import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // three.js alone is ~550 kB minified.
    chunkSizeWarningLimit: 800,
  },
  server: {
    // `wrangler dev` runs the PartyKit servers on 8787 (npm run dev:party).
    proxy: { '/parties': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Whole races at 60 Hz: seconds alone, much longer on a busy machine.
    testTimeout: 60000,
  },
});
