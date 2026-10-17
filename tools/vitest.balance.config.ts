import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `npm run balance`: the slow balance report, kept out of `npm test`. */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['tools/balance.test.ts'],
    testTimeout: 600000,
  },
});
