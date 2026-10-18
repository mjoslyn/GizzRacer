// Renders the GizzRacer soundtrack from its seqbaby songs to looping MP3s.
//
//   node tools/render-soundtrack.mjs [only-title-substring]
//
// Needs sibling checkouts: seqbaby (SEQBABY_DIR) for the engine and
// seqbaby-seed (SEQBABY_SEED_DIR) for the songs, plus Playwright's Chromium.
// It serves seqbaby's public/ engine on a local port, plays each song in a
// headless page, records the master bus, folds the release tail back onto
// the loop start so the loop is seamless, and writes public/music/<id>.mp3
// plus public/music/manifest.json with each loop's exact length.

import { Mp3Encoder } from '@breezystack/lamejs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEQBABY_DIR = path.resolve(process.env.SEQBABY_DIR || path.join(ROOT, '../mjoslyn/seqbaby'));
const SEED_DIR = path.resolve(process.env.SEQBABY_SEED_DIR || path.join(ROOT, '../seqbaby-seed'));
// MUSIC_OUT and RENDER_PORT let renders run side by side (a scratch folder each, a port each).
const OUT_DIR = path.resolve(process.env.MUSIC_OUT || path.join(ROOT, 'public/music'));
const PORT = Number(process.env.RENDER_PORT || 4321);
const SAMPLE_RATE = 44100;
const KBPS = 160;

/** Game cue -> seqbaby song title (account `gizzracer`), and how many chain passes to record. */
const CUES = [
  // Ice V's idiom: 7/8 patterns of two bars, so the loop length is given outright.
  { id: 'title', title: 'gizzracer title theme', bars: 16 },
  { id: 'infinite-loop-speedway', title: 'infinite loop speedway' },
  { id: 'rattlesnake-run', title: 'rattlesnake run' },
  { id: 'rattlesnake-run-final-lap', title: 'rattlesnake run (final lap)' },
  { id: 'volcano-fortress', title: 'volcano fortress' },
  { id: 'polygondwanaland-jungle', title: 'polygondwanaland jungle' },
  { id: 'podium', title: 'podium', bars: 4 },
  // Cup two, the Microtonal Cup. Chain repeats count bars, and these songs'
  // patterns run two or four bars, so the loop length is given outright.
  { id: 'fishies-lagoon', title: 'fishies lagoon', bars: 16 },
  { id: 'ice-v-glacier', title: 'ice v glacier', bars: 24 },
  { id: 'cyboogie-city', title: 'cyboogie city' },
  { id: 'butterfly-skyway', title: 'butterfly 3000 skyway', bars: 16 },
  { id: 'butterfly-skyway-final-lap', title: 'butterfly 3000 skyway (final lap)', bars: 16 },
  // The Apocalypse Cup's finale.
  { id: 'petrodragonic-apocalypse', title: 'petrodragonic apocalypse', bars: 16 },
  { id: 'petrodragonic-apocalypse-final-lap', title: 'petrodragonic apocalypse (final lap)', bars: 14 },
  { id: 'hell-on-mars', title: 'hell on mars', bars: 16 },
  { id: 'hell-on-mars-final-lap', title: 'hell on mars (final lap)', bars: 14 },
  { id: 'supercell', title: 'supercell', bars: 16 },
  { id: 'supercell-final-lap', title: 'supercell (final lap)', bars: 14 },
  { id: 'murder-of-the-universe', title: 'murder of the universe', bars: 16 },
  { id: 'murder-of-the-universe-final-lap', title: 'murder of the universe (final lap)', bars: 14 },
];

process.env.SEQBABY_DIR = SEQBABY_DIR;
const { PEOPLE } = await import(pathToFileURL(path.join(SEED_DIR, 'people.mjs')).href);
const person = PEOPLE.find((p) => p.handle === 'gizzracer');
if (!person) throw new Error('no gizzracer in seqbaby-seed/people.mjs');

// The remixes (seqbaby-seed gizzracer/remix-*.mjs) name their own cue and loop length.
for (const song of person.songs) if (song.cue && !CUES.some((c) => c.id === song.cue)) CUES.push({ id: song.cue, title: song.title, bars: song.bars });

const only = process.argv[2];
const cues = CUES.filter((c) => !only || c.id.includes(only));

const server = await serveEngine();
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
fs.mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = path.join(OUT_DIR, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

try {
  for (const cue of cues) {
    const song = person.songs.find((s) => s.title === cue.title)?.build();
    if (!song) throw new Error(`no song "${cue.title}"`);
    const bars = cue.bars ?? chainBars(song);
    const loopSec = (bars * barBeats(song) * 60) / song.bpm;
    console.log(`${cue.id}: ${bars} bars at ${song.bpm} bpm = ${loopSec.toFixed(2)} s`);
    const { channels, levels } = await record(song, loopSec + 2.5);
    const silent = levels.filter((t) => t.peak < 0.003).map((t) => t.name);
    if (silent.length) console.warn(`  silent tracks: ${silent.join(', ')}`);
    const loop = foldLoop(channels, Math.round(loopSec * SAMPLE_RATE));
    const gaps = dropouts(loop[0]);
    if (gaps) console.warn(`  ${gaps} dropout(s): the render may have glitched; re-run on an idle machine`);
    const mp3 = encodeMp3(loop);
    fs.writeFileSync(path.join(OUT_DIR, `${cue.id}.mp3`), mp3);
    manifest[cue.id] = { title: cue.title, bpm: song.bpm, bars, loopSamples: loop[0].length, sampleRate: SAMPLE_RATE };
    console.log(`  wrote ${cue.id}.mp3 (${(mp3.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await browser.close();
  server.close();
}

/** Bars in one pass of the song's chain (patterns that have any steps), or 1 bar in repeat mode. */
function chainBars(song) {
  if (song.patternMode !== 'chain') return 1;
  const used = new Set();
  for (const t of song.tracks) t.patterns.forEach((p, i) => p?.steps?.some(Boolean) && used.add(i));
  let bars = 0;
  for (const i of used) {
    const m = song.patternMeters[i];
    const longest = Math.max(...song.tracks.map((t) => t.length || 16));
    const stepsPerBar = (m.num * 16) / m.den;
    bars += song.patternRepeats[i] * Math.max(1, Math.round(longest / stepsPerBar));
  }
  return bars;
}

/** Quarter-note beats per bar of pattern 0 (7/8 is 3.5). */
function barBeats(song) {
  const m = song.patternMeters[0];
  return (m.num * 4) / m.den;
}

async function record(song, seconds) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/harness.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.seqbaby?.state?.tracks, null, { timeout: 60000 });
  await page.evaluate((s) => window.seqbaby.applySet(s), song);
  // One play/stop to build the audio graph and load samples before recording.
  await page.click('#play');
  await page.waitForFunction(() => window.seqbaby.state.ready && window.seqbaby.state.playing, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.seqbaby.stop());
  await page.waitForTimeout(800);
  const result = await page.evaluate(async (secs) => {
    const api = window.seqbaby;
    const st = api.state;
    const ctx = st.audioCtx;
    const out = st.masterLimiter || st.masterGain;
    const dest = ctx.createMediaStreamDestination();
    out.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 320000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    const peaks = st.tracks.map(() => 0);
    const buf = new Float32Array(2048);
    rec.start();
    await new Promise((r) => setTimeout(r, 300));
    api.play();
    const until = performance.now() + secs * 1000;
    while (performance.now() < until) {
      st.tracks.forEach((t, i) => {
        if (!t.meterAnalyser) return;
        t.meterAnalyser.getFloatTimeDomainData(buf);
        for (const v of buf) peaks[i] = Math.max(peaks[i], Math.abs(v));
      });
      await new Promise((r) => setTimeout(r, 40));
    }
    api.stop();
    await new Promise((r) => setTimeout(r, 200));
    rec.stop();
    await stopped;
    out.disconnect(dest);
    const audio = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await new Blob(chunks).arrayBuffer());
    const toB64 = (f32) => {
      const bytes = new Uint8Array(f32.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return {
      rate: audio.sampleRate,
      channels: [0, Math.min(1, audio.numberOfChannels - 1)].map((c) => toB64(audio.getChannelData(c))),
      levels: st.tracks.map((t, i) => ({ name: t.name, peak: peaks[i] })),
    };
  }, seconds);
  await page.close();
  if (errors.length) console.warn('  page errors:', errors.slice(0, 3));
  if (result.rate !== SAMPLE_RATE) throw new Error(`decoded at ${result.rate} Hz`);
  const channels = result.channels.map((b64) => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer));
  return { channels, levels: result.levels };
}

/**
 * Finds the downbeat (first clear onset), cuts exactly one loop from there,
 * and mixes whatever rings past the loop end back onto its start.
 */
function foldLoop(channels, loopLen) {
  const [l, r] = channels;
  let start = 0;
  while (start < l.length && Math.max(Math.abs(l[start]), Math.abs(r[start])) < 0.01) start++;
  // Back up over the attack so the downbeat's transient is kept whole.
  start = Math.max(0, start - 64);
  if (start + loopLen > l.length) throw new Error('recording shorter than one loop');
  return channels.map((ch) => {
    const out = ch.slice(start, start + loopLen);
    const tail = ch.subarray(start + loopLen);
    const fade = Math.min(tail.length, SAMPLE_RATE * 2);
    for (let i = 0; i < fade; i++) out[i] += tail[i] * (1 - i / fade);
    return out;
  });
}

/** Counts 5 ms windows of near silence wedged between loud ones: the signature of an audio-thread underrun. */
function dropouts(ch) {
  const win = Math.round(SAMPLE_RATE * 0.005);
  const rms = [];
  for (let i = 0; i + win <= ch.length; i += win) {
    let sq = 0;
    for (let j = i; j < i + win; j++) sq += ch[j] * ch[j];
    rms.push(Math.sqrt(sq / win));
  }
  let count = 0;
  for (let i = 2; i < rms.length - 2; i++) {
    if (rms[i] < 1e-4 && rms[i - 2] > 0.05 && rms[i + 2] > 0.05) count++;
  }
  return count;
}

function encodeMp3([l, r]) {
  const enc = new Mp3Encoder(2, SAMPLE_RATE, KBPS);
  const toPcm = (f) => Int16Array.from(f, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
  const L = toPcm(l);
  const R = toPcm(r);
  const parts = [];
  for (let i = 0; i < L.length; i += 1152) {
    const out = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
    if (out.length) parts.push(Buffer.from(out));
  }
  parts.push(Buffer.from(enc.flush()));
  return Buffer.concat(parts);
}

/** Serves seqbaby/public at the root plus a bare page that boots the studio engine. */
async function serveEngine() {
  const ts = createRequire(import.meta.url)('typescript');
  const src = fs.readFileSync(path.join(SEQBABY_DIR, 'app/studioMarkup.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, () => ({}));
  const harness = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>
${mod.exports.STUDIO_BODY}
<script src="/tone.js" defer></script><script src="/woscillators.js" defer></script><script src="/js/main.js" type="module"></script>
</body></html>`;
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.txt': 'text/plain', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
  const pub = path.join(SEQBABY_DIR, 'public');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/harness.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(harness);
      return;
    }
    const file = path.join(pub, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(PORT, r));
  return server;
}
