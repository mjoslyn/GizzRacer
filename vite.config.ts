import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // three.js alone is ~550 kB minified.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
