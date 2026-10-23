/**
 * Works out where the music starts in each recording of
 * public/music/bootlegs.json, past the band talking (src/audio/talk.ts), and
 * writes it back as each recording's `start`, so a race's song starts on the
 * band without the game reading the file first. Run after tools/bootlegs.mjs:
 *
 *   NODE_PATH=$(npm root -g) NODE_USE_ENV_PROXY=1 node tools/bootleg-starts.mjs
 *
 * It reads the opening of each file (about a minute and a half) and decodes
 * it in headless Chromium (Playwright, installed globally), as the game does
 * in the browser. Recordings that already have a `start` are skipped, so it
 * picks up where it left off; --all redoes them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FILE = new URL('../public/music/bootlegs.json', import.meta.url);
const OPENING_BYTES = 2_500_000;
const CONCURRENCY = 4;
const all = process.argv.includes('--all');

const talk = buildSync({ entryPoints: [new URL('../src/audio/talk.ts', import.meta.url).pathname], bundle: true, format: 'iife', globalName: 'Talk', write: false }).outputFiles[0].text;
const catalogue = JSON.parse(readFileSync(FILE, 'utf8'));
const url = (r) => `https://archive.org/download/${encodeURIComponent(r.id)}/${r.file.split('/').map(encodeURIComponent).join('/')}`;
const todo = Object.entries(catalogue).flatMap(([song, recs]) => recs.filter((r) => all || r.start === undefined).map((r) => ({ song, r })));
console.log(`${todo.length} recordings to read`);

async function opening(r) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url(r), { headers: { Range: `bytes=0-${OPENING_BYTES - 1}` } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // The Archive's file servers fail now and then: try again.
    }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
  }
  return null;
}

const browser = await chromium.launch();
let done = 0;
const save = () => writeFileSync(FILE, `${JSON.stringify(catalogue, null, 1)}\n`);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    const page = await browser.newPage();
    await page.addScriptTag({ content: talk });
    while (todo.length) {
      const { song, r } = todo.shift();
      const bytes = await opening(r);
      const start = bytes
        ? await page.evaluate(async (b64) => {
            const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            try {
              const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data.buffer);
              const ch = buf.getChannelData(0);
              if (buf.numberOfChannels > 1) {
                const right = buf.getChannelData(1);
                for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] + right[i]) / 2;
              }
              return Talk.musicStart(ch, buf.sampleRate);
            } catch {
              return null;
            }
          }, bytes.toString('base64'))
        : null;
      // Unreadable: left without one, so the game works it out itself (or plays from the top).
      if (start !== null) r.start = start;
      done++;
      if (start) console.log(`${song} ${r.date}: music at ${start}s`);
      if (done % 20 === 0) save();
    }
  }),
);
await browser.close();
save();
const recs = Object.values(catalogue).flat();
console.log(`${recs.filter((r) => r.start > 0).length} of ${recs.length} start past talk; ${recs.filter((r) => r.start === undefined).length} unread`);
