// Two contact sheets of a track, cheap to read (docs/DEVELOPMENT.md, "Building a world"):
//
//   <out>/<id>-landmarks.jpg  every landmark framed from a raised camera on the side the karts come from, labelled
//   <out>/<id>-seat.jpg       12 spots round the lap from the driver's seat, labelled with the stretch
//
//   node tools/landmark-shots.mjs <track id> <out dir> [dev server url] [--final] [--list]
//
// Drives a running dev server (npm run dev, http://localhost:5173/ by default); if none answers there, it
// starts vite itself for the run. --final takes the shots on the final lap's look; --list only prints the
// landmarks, their sizes and the cameras, no shots. Software rendering (no GPU)
// takes a second or so a frame. Playwright: the global install (NODE_PATH=$(npm root -g), or found on its own).
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const final = args.includes('--final');
const [id, out, url] = args.filter((a) => !a.startsWith('--'));
if (!id || !out) {
  console.error('usage: node tools/landmark-shots.mjs <track id> <out dir> [dev server url] [--final]');
  process.exit(1);
}
/** One frame's size; the sheets are four frames across. */
const W = 400;
const H = 225;
const COLS = 4;

const require = createRequire(import.meta.url);
function playwright() {
  try {
    return require('playwright');
  } catch {
    return require(`${execSync('npm root -g').toString().trim()}/playwright`);
  }
}
const { chromium } = playwright();

// The dev server: the one given or running, else our own.
let base = url ?? 'http://localhost:5173/';
let server = null;
const up = await fetch(base).then((r) => r.ok).catch(() => false);
if (!up) {
  if (url) {
    console.error(`no dev server at ${url}`);
    process.exit(1);
  }
  const { createServer } = await import('vite');
  server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 5199, strictPort: false }, logLevel: 'warn' });
  await server.listen();
  base = server.resolvedUrls.local[0];
  console.log(`started vite at ${base}`);
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// No tape look, full detail, no questions, no sound: a clean picture of the place.
await page.addInitScript(() => localStorage.setItem('gizzracer.settings', JSON.stringify({ steeringChosen: true, videoLook: 'off', videoLookChosen: true, detail: 'high', detailChosen: true, music: 0, sfx: 0 })));
await page.goto(`${base}?unlock=1`);
await page.waitForFunction(() => window.gizz, null, { timeout: 90000 });
const ids = await page.evaluate(() => window.gizz.tracks);
if (!ids.includes(id)) {
  console.error(`no track "${id}"; tracks: ${ids.join(', ')}`);
  await browser.close();
  await server?.close();
  process.exit(1);
}
await page.evaluate((t) => window.gizz.race_(t), id);
await page.waitForFunction(() => window.gizz.mode === 'race' && !document.body.classList.contains('intro'), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: 'body > :not(#app) { visibility: hidden !important; }' });
if (final) {
  await page.evaluate(() => {
    const r = window.gizz.race;
    for (const k of r.karts) k.laps.lap = r.laps - 1;
  });
  // The final lap's look comes up over a second or two.
  await page.waitForTimeout(3000);
}
await page.evaluate(() => window.gizz.freeze(true));
const shot = async () => (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');

/**
 * Where to stand to see a landmark. Most are framed from the side the karts come from (the road 60 m before
 * it), raised, close enough to fill the frame. One that runs along a whole stretch (a row of trees, a camp)
 * is seen from that road point, raised, looking into it; one far off in the sky or on the horizon from its
 * road point, as a driver would. The box leaves out glows and smoke, so a column of smoke doesn't push the
 * camera a kilometre off.
 */
function frame(lm) {
  const box = lm.box ?? { min: [lm.road.x - 8, lm.road.y, lm.road.z - 8], max: [lm.road.x + 8, lm.road.y + 12, lm.road.z + 8] };
  const c = box.min.map((v, k) => (v + box.max[k]) / 2);
  const size = box.max.map((v, k) => v - box.min[k]);
  const r = Math.max(6, Math.hypot(size[0], size[2]) / 2, size[1] * 0.6);
  const off = Math.hypot(c[0] - lm.road.x, c[2] - lm.road.z);
  const look = (y) => ({ x: c[0], y: Math.max(lm.road.y, Math.min(y, lm.road.y + 60)), z: c[2] });
  // Far off: from the road, as the driver sees it.
  if (off > 300 || r > 160) return { eye: { x: lm.road.x, y: lm.road.y + 10, z: lm.road.z }, target: look(c[1]) };
  // A whole stretch: from the road behind it, raised, looking in.
  if (r > 55) return { eye: { x: lm.back.x, y: lm.road.y + 14 + r * 0.15, z: lm.back.z }, target: look(box.min[1] + size[1] * 0.3) };
  // Look at it a third of the way up.
  const target = look(box.min[1] + size[1] * 0.35);
  let dx = lm.back.x - c[0];
  let dz = lm.back.z - c[2];
  let d = Math.hypot(dx, dz);
  if (d < 4) {
    dx = -lm.road.tx;
    dz = -lm.road.tz;
    d = 1;
  }
  const dist = r * 1.35 + 10;
  return { eye: { x: c[0] + (dx / d) * dist, y: target.y + r * 0.5 + 6, z: c[2] + (dz / d) * dist }, target };
}

const landmarks = await page.evaluate(() => window.gizz.landmarks);
if (args.includes('--list')) {
  // Just what's there: each landmark's kind, its size and where it stands from its road point.
  for (const lm of landmarks) {
    const size = lm.box ? lm.box.max.map((v, k) => Math.round(v - lm.box.min[k])).join(' x ') : 'no meshes';
    const off = lm.box ? Math.round(Math.hypot((lm.box.min[0] + lm.box.max[0]) / 2 - lm.road.x, (lm.box.min[2] + lm.box.max[2]) / 2 - lm.road.z)) : 0;
    console.log(`${lm.index + 1}. ${lm.kind}: ${size} m, ${off} m from the road point; camera ${JSON.stringify(frame(lm))}`);
  }
  await browser.close();
  await server?.close();
  process.exit(0);
}
const lmShots = [];
for (const lm of landmarks) {
  const { eye, target } = frame(lm);
  await page.evaluate(([e, t]) => window.gizz.look(e, t), [eye, target]);
  await page.waitForTimeout(700);
  lmShots.push({ img: await shot(), label: `${lm.index + 1}. ${lm.kind}${lm.box ? '' : ' (no meshes)'}` });
  console.log(`landmark ${lm.index + 1}/${landmarks.length} ${lm.kind}`);
}
await page.evaluate(() => window.gizz.look(null));

const seatShots = [];
for (let k = 0; k < 12; k++) {
  const f = k / 12 + 0.01;
  const section = await page.evaluate((x) => {
    window.gizz.warp(x);
    const r = window.gizz.race.track.main;
    const s = x * r.spline.length;
    let i = 0;
    while (i + 1 < r.spline.count && r.spline.dist[i + 1] <= s) i++;
    return r.sectionName(i);
  }, f);
  await page.waitForTimeout(900);
  seatShots.push({ img: await shot(), label: `${f.toFixed(2)} ${section}` });
  console.log(`seat ${k + 1}/12 ${section}`);
}

/** Lays the frames four across on one canvas, each labelled, and returns the JPEG. */
async function sheet(frames, title) {
  const p = await browser.newPage({ viewport: { width: W * COLS, height: 100 } });
  const jpeg = await p.evaluate(
    async ({ frames, W, H, COLS, title }) => {
      const rows = Math.ceil(frames.length / COLS);
      const c = document.createElement('canvas');
      c.width = W * COLS;
      c.height = H * rows + 24;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.font = 'bold 15px sans-serif';
      g.fillStyle = '#fff';
      g.fillText(title, 8, 17);
      for (let k = 0; k < frames.length; k++) {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${frames[k].img}`;
        await img.decode();
        const x = (k % COLS) * W;
        const y = 24 + Math.floor(k / COLS) * H;
        g.drawImage(img, x, y, W, H);
        g.font = 'bold 14px sans-serif';
        const w = g.measureText(frames[k].label).width;
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(x, y, w + 12, 22);
        g.fillStyle = '#ffe060';
        g.fillText(frames[k].label, x + 6, y + 16);
        g.strokeStyle = '#000';
        g.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
      }
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    },
    { frames, W, H, COLS, title },
  );
  await p.close();
  return Buffer.from(jpeg, 'base64');
}

mkdirSync(out, { recursive: true });
const tag = final ? '-final' : '';
const lmPath = `${out.replace(/\/$/, '')}/${id}${tag}-landmarks.jpg`;
const seatPath = `${out.replace(/\/$/, '')}/${id}${tag}-seat.jpg`;
writeFileSync(lmPath, await sheet(lmShots, `${id}: ${landmarks.length} landmarks, raised camera${final ? ', final lap' : ''}`));
writeFileSync(seatPath, await sheet(seatShots, `${id}: driver's seat round the lap${final ? ', final lap' : ''}`));
console.log(`wrote ${lmPath}\nwrote ${seatPath}`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
await server?.close();
