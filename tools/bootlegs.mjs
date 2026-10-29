/**
 * Builds public/music/bootlegs.json (live recordings of each track's song)
 * and public/music/shows.json (every show with MP3s, one a date, for
 * Infinite mode's live sets, whose set list is read from archive.org when
 * one plays). bootlegs.json: live recordings of each track's song
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
const SHOWS_OUT = new URL('../public/music/shows.json', import.meta.url);
/**
 * Recordings left out: ones the Archive won't serve, duplicates of
 * recordings already in (the same release filed under another date), and
 * show openers whose music starts more than 100 s in (past the crowd and
 * the tuning), later than a start may be.
 */
const SKIP = new Set([
  "kglw2024-08-20.SBD/King Gizzard & The Lizard Wizard - Live at Thompson's Point, Portland, ME (8-20-24) - 01 Theia (Live).mp3",
  "kglw2025-10-31.SBD/King Gizzard & The Lizard Wizard - Live in Manchester '25 - 01 Theia (Live in Manchester '25).mp3",
  "kglw2025-06-08.SBD.flac/King Gizzard & The Lizard Wizard - Live in Bulgaria '25 - 10 Sea of Trees (Live in Bulgaria '25).mp3",
  "kg2022-10-11/38. Sea Of Trees (Live At Red Rocks '22).mp3",
  "kg2022-11-02/67. Cut Throat Boogie (Live At Red Rocks '22).mp3",
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-14-4ch_discocape_20.mp3',
]);
/** Start points and gains already found (tools/bootleg-starts.mjs), and ends (tools/live-edges.py), kept across a re-run. */
const known = new Map();
try {
  for (const recs of Object.values(JSON.parse(readFileSync(OUT, 'utf8')))) for (const r of recs) if (r.start !== undefined) known.set(`${r.id}/${r.file}`, { start: r.start, ...(r.end !== undefined ? { end: r.end } : {}), gain: r.gain });
} catch {
  // First run.
}

// The songs, read from songs.ts so the two can't drift apart.
const songsSrc = readFileSync(new URL('../src/audio/songs.ts', import.meta.url), 'utf8');
const SONGS = [...new Set([...songsSrc.matchAll(/title: '((?:[^'\\]|\\.)*)'|title: "([^"]*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")))];
/** Letters and digits only, and no leading "the" ("Lord of Lightning" is The Lord of Lightning). */
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/^the/, '');
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

/**
 * A track's title without what tapers add around the song: "(Live in Athens
 * '25)", "[take 1]", "(with Leah Senior)", a leading "*", and a file name's
 * prefix ("KGLW_2018-08-22_AUD_t03_", "KingGizzard2022-10-05t12 - ", "King
 * Gizzard & The Lizard Wizard - Live in Asheville '19 - 04 ").
 */
function cleanTitle(title) {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/^\*+\s*/, '')
    .replace(/^KGLW_.*?_t\d+_/i, '')
    .replace(/\s+-\s*$/, '')
    .replace(/^.*\s-\s+/, '')
    .replace(/^\d+[-_. ]+/, '')
    .trim();
}

/**
 * Songs whose name only differs from another of the band's by its
 * apostrophe: Chang'e (The Silver Cord) is not Change (Changes), so a file
 * is only Chang'e when its title says so.
 */
const APOSTROPHE = new Set(["Chang'e"]);

/** The song titles a track is: a medley ("Robot Stop / Big Fig Wasp") is each of them. */
function songsIn(title) {
  return cleanTitle(title)
    .replace(/\s*-?>+\s*$/, '')
    .split(/\s*(?:\/|->|>|\+)\s*/)
    .map((s) => {
      const song = WANT.get(norm(s));
      return song && APOSTROPHE.has(song) && !/['’]/.test(s) ? undefined : song;
    })
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
    if (f.format !== 'VBR MP3' || SKIP.has(`${show.identifier}/${f.name}`)) continue;
    const title = f.title ?? f.name.replace(/\.mp3$/i, '').replace(/^[\dds]+[-_. ]+/i, '');
    for (const song of songsIn(title)) {
      const byDate = found.get(song);
      if (byDate.has(date)) continue;
      const rec = { id: show.identifier, file: f.name, date, venue, seconds: seconds(f.length) };
      // Where its music starts and ends and its gain, if they were already worked out.
      const read = known.get(`${rec.id}/${rec.file}`);
      byDate.set(date, read ? { ...rec, ...read } : rec);
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
