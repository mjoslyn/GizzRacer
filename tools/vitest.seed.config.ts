import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `npm run seed:ghosts`: posts starter ghosts to the leaderboards (see tools/seed-ghosts.test.ts). */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['tools/seed-ghosts.test.ts'],
    testTimeout: 600000,
  },
});
