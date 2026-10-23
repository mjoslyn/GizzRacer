/**
 * Builds public/music/bootlegs.json (live recordings of each track's song)
 * and public/music/shows.json (every show with MP3s, one a date, for the
 * full-show soundtrack, whose set list is read from archive.org when it
 * plays). bootlegs.json: live recordings of each track's song
 * (src/audio/songs.ts), from King Gizzard & the Lizard Wizard's collection
 * on the Internet Archive's Live Music Archive. The band are taper-friendly
 * and let anyone use their live recordings; the game streams these straight
 * from archive.org when Settings > Soundtrack is on Live bootleg, and
 * nothing is rehosted here.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/bootlegs.mjs
 *
 * Re-run now and then to pick up new shows, then tools/bootleg-starts.mjs
 * for the new recordings' start points (the ones already found are kept). Up to PER_SONG recordings a
 * song, spread across the years, one a show date.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const COLLECTION = 'KingGizzardAndTheLizardWizard';
const PER_SONG = 12;
const CONCURRENCY = 8;
const OUT = new URL('../public/music/bootlegs.json', import.meta.url);
/** Start points already found (tools/bootleg-starts.mjs), kept across a re-run. */
const known = new Map();
try {
  for (const recs of Object.values(JSON.parse(readFileSync(OUT, 'utf8')))) for (const r of recs) if (r.start !== undefined) known.set(`${r.id}/${r.file}`, r.start);
} catch {
  // First run.
}
const SHOWS_OUT = new URL('../public/music/shows.json', import.meta.url);

// The songs, read from songs.ts so the two can't drift apart.
const songsSrc = readFileSync(new URL('../src/audio/songs.ts', import.meta.url), 'utf8');
const SONGS = [...new Set([...songsSrc.matchAll(/title: '((?:[^'\\]|\\.)*)'|title: "([^"]*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")))];
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const WANT = new Map(SONGS.map((t) => [norm(t), t]));

async function json(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

async function items() {
  const out = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ q: `collection:${COLLECTION}`, rows: '500', page: String(page), output: 'json' });
    for (const f of ['identifier', 'date', 'venue', 'coverage', 'source']) q.append('fl[]', f);
    const d = await json(`https://archive.org/advancedsearch.php?${q}`);
    out.push(...d.response.docs);
    if (out.length >= d.response.numFound || !d.response.docs.length) return out;
  }
}

/** The song titles a track is: a medley ("Robot Stop / Big Fig Wasp") is each of them. */
function songsIn(title) {
  return title
    .replace(/\s*-?>+\s*$/, '')
    .split(/\s*(?:\/|->|>|\+)\s*/)
    .map((s) => WANT.get(norm(s)))
    .filter(Boolean);
}

function seconds(length) {
  if (!length) return 0;
  if (/^\d+(\.\d+)?$/.test(length)) return Math.round(Number(length));
  return length.split(':').reduce((a, b) => a * 60 + Number(b), 0);
}

const shows = await items();
// Soundboards first, then by identifier, so the one kept for a date is the best of them.
shows.sort((a, b) => Number(/sbd/i.test(b.identifier + b.source)) - Number(/sbd/i.test(a.identifier + a.source)) || a.identifier.localeCompare(b.identifier));
console.log(`${shows.length} shows; looking for ${SONGS.length} songs`);

/** song title -> date -> recording */
const found = new Map(SONGS.map((t) => [t, new Map()]));
/** date -> show with MP3s, the first (best) one per date. */
const playable = new Map();
let done = 0;
async function scan(show) {
  const meta = await json(`https://archive.org/metadata/${show.identifier}`).catch(() => null);
  done++;
  if (!meta?.files) return;
  const date = String(show.date ?? meta.metadata?.date ?? '').slice(0, 10);
  const venue = String(meta.metadata?.venue ?? meta.metadata?.coverage ?? show.venue ?? '').trim();
  const mp3s = meta.files.filter((f) => f.format === 'VBR MP3');
  // A show worth playing whole: a real set, not a one-song snippet.
  if (mp3s.length >= 4 && date && !playable.has(date)) playable.set(date, { id: show.identifier, date, venue });
  for (const f of meta.files) {
    if (f.format !== 'VBR MP3') continue;
    const title = f.title ?? f.name.replace(/\.mp3$/i, '').replace(/^[\dds]+[-_. ]+/i, '');
    for (const song of songsIn(title)) {
      const byDate = found.get(song);
      if (byDate.has(date)) continue;
      const rec = { id: show.identifier, file: f.name, date, venue, seconds: seconds(f.length) };
      // Where its music starts, if tools/bootleg-starts.mjs already worked it out.
      const start = known.get(`${rec.id}/${rec.file}`);
      byDate.set(date, start === undefined ? rec : { ...rec, start });
    }
  }
}
const queue = shows.slice();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      await scan(queue.shift());
      if (done % 50 === 0) console.log(`${done}/${shows.length}`);
    }
  }),
);

const out = {};
for (const [song, byDate] of found) {
  // Long enough to be the song, not a snippet; spread evenly across the dates.
  const all = [...byDate.values()].filter((r) => r.seconds === 0 || r.seconds >= 90).sort((a, b) => a.date.localeCompare(b.date));
  const pick = all.length <= PER_SONG ? all : Array.from({ length: PER_SONG }, (_, k) => all[Math.floor(((k + 0.5) * all.length) / PER_SONG)]);
  if (pick.length) out[song] = pick;
  console.log(`${song}: ${all.length} recorded, ${pick.length} kept`);
}
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
const showList = [...playable.values()].sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(SHOWS_OUT, `${JSON.stringify(showList, null, 1)}\n`);
console.log(`${showList.length} shows to play whole`);
console.log(`wrote ${OUT.pathname}`);
