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
  "KGLW2022-04-28/KG_TLW.2022-04-28.t08.mp3",
  "gizz2016-02-28/03-Robot Stop _.mp3",
  "gizz2016-02-28/16-I'm in Your Mind Fuzz.mp3",
  "kglw2014-10-31.nyctaper.matrix.flac16/KingGizzard2014-10-31_nyctaper_t09.mp3",
  "kglw2015-06-19/05 - Robot Stop.mp3",
  "kglw2015-06-24.matrix.flac1644/KingGizzard2015-06-24_nyctaper_t02.mp3",
  "kglw2016-05-07.hifiindy2016/02 - Hot Water -.mp3",
  "kglw2016-05-07.hifiindy2016/06 - People-Vultures.mp3",
  "kglw2016-05-07.hifiindy2016/09 - I'm Not In Your Mind -.mp3",
  "kglw2016-05-23/12-I'm In Your Mind Fuzz.mp3",
  "kglw2016-12-09.ca14.flac2448/14 - Robot Stop.mp3",
  "kglw2017-04-01.mysteryjack/05 Billabong Valley.mp3",
  "kglw2017-04-14.sp-cmc-8.flac1644/kgatlz-2017-04-14-coachella-aud-t08-people-vultures.mp3",
  "kglw2017-09-28.mysteryjack/07 Cellophane.mp3",
  "kglw2017-09-28.mysteryjack/21 Gamma Knife.mp3",
  "kglw2017-10-07.mysteryjack/03 People-Vultures.mp3",
  "kglw2017-10-07.mysteryjack/17 Robot Stop.mp3",
  "kglw2017-10-12.ccm4.flac1644/kglw2017-10-12t10.mp3",
  "kglw2018-06-02.ccm4.flac16/kglw2018-06-02t05.mp3",
  "kglw2018-06-02.ccm4.flac16/kglw2018-06-02t19.mp3",
  "kglw2018-06-07.aud.flac.norm.16.44/02 Billabong Valley.mp3",
  "kglw2018-06-20.ca14.flac1644/03-Hot Wax .mp3",
  "kglw2018-06-20.ca14.flac1644/11-Billabong Valley.mp3",
  "kglw2018-06-20.ca14.flac1644/20-Wah Wah .mp3",
  "kglw2018-06-22/06 - Cellophane.mp3",
  "kglw2018-08-22.AUD.FLAC16/KGLW_2018-08-22_AUD_t13_I'm Not In Your Mind.mp3",
  "kglw2019-09-02.ca14.flac1648/04-Robot Stop.mp3",
  "kglw2019-09-02.ca14.flac1648/06-Gamma Knife.mp3",
  "kglw2019-10-16.ca-11.flac1644/KG&TLW_2019-10-16_AUD_t08.mp3",
  "kglw2020-02-21/13 - People-Vultures.mp3",
  "kglw2020-02-21/27 - Wah Wah.mp3",
  "kglw2022-03-07/03-I'm Not In Your Mind _.mp3",
  "kglw2022-03-07/04-Cellophane _.mp3",
  "kglw2022-03-07/05-I'm In Your Mind Fuzz.mp3",
  "kglw2022-10-02.adk/02 Wah Wah.mp3",
  "kglw2022-10-23.vwmule/kglw2022-10-23.vwmule.t04.mp3",
  "kglw2022-10-23.vwmule/kglw2022-10-23.vwmule.t04.mp3",
  "kglw2022-10-23.vwmule/kglw2022-10-23.vwmule.t04.mp3",
  "kglw2022-10-27.twenty8/kglw202204.mp3",
  "kglw2022-10-28/kglw2022-10-28 09-I'm in Your Mind Fuzz.mp3",
  "kglw2023-03-04.daank/03 Billabong Valley.mp3",
  "kglw2023-03-20/kglw202311.mp3",
  "kglw2023-08-29/kglw2023-08-29d2t03 Hot Wax.mp3",
  "kglw2024-05-22.Hamburg24/03 - People-Vultures.mp3",
  "kglw2024-05-26.dankski/kglw2024.05.26t01.mp3",
  "kglw2024-05-29.dankski/kglw2024.05.29t06.mp3",
  "kglw2024-08-20.mk4v.cmc1k.sx-r4.flac/kglw2024-08-20.mk4v.cmc1k.sx-r4+.24bit-10.mp3",
  "kglw2024-08-31.bandcampbootlegger/King Gizzard & The Lizard Wizard - Live at Ascend Amphitheater- Nashville- TN (8-31-24) 2/King Gizzard & The Lizard Wizard - Live at Ascend Amphitheater, Nashville, TN (8-31-24) - 11 I'm In Your Mind Fuzz (Live).mp3",
  "kglw2024-09-01.ToraTapesMX/01 - Robot Stop.mp3",
  "kglw2024-09-05.16bit/kglw2024-09-05d1t20_Gamma_Knife.mp3",
  "kglw2024-09-09.LATESHOW-mysteryjackofficial/06 Wah Wah.mp3",
  "kglw2024-09-09.late/kglw2024-09-09-late_12.mp3",
  "kglw2024-11-15/kglw2024-11-15-mk21_05.mp3",
  "kglw2024-11-17/kglw202417.mp3",
  "kglw2026-08-20/11-I'm In Your Mind _.mp3",
  "kglw2026-08-20/12- I'm Not In Your Mind _.mp3",
  "kg2022-11-02/73. Hot Wax (Live At Red Rocks '22).mp3",
  "kg2022-11-02/70. Sadie Sorceress (Live At Red Rocks '22).mp3",
  "KGATLW082319/19.Head On Pill.mp3",
  "kglw2014-10-31.nyctaper.matrix.flac16/KingGizzard2014-10-31_nyctaper_t01.mp3",
  "kglw2018-06-07.aud.flac.norm.16.44/08  Head On Pill.mp3",
  "kglw2018-12-01/06-The Great Chain Of Being (Live at Gizzfest '18).mp3",
  "kglw2018-12-01/12-Cut Throat Boogie (Live at Gizzfest '18).mp3",
  "kglw2019-09-04/03 - The Great Chain of Being.mp3",
  "kglw2019-10-09/17 Float Along - Fill Your Lungs (Live In Brussels '19).mp3",
  "kglw2019-10-11.dpa4061.flac2448/09 - Cyboogie.mp3",
  "kglw2020-02-21/24 - Let Me Mend The Past.mp3",
  "kglw2020-02-21/30 - Sea of Trees.mp3",
  "kglw2020-02-21/34 - Float Along - Fill Your Lungs.mp3",
  "kglw2022-04-28.ak50/10-Sea of Trees.mp3",
  "kglw2022-09-30.aud2.flac24/kgatlw-2022-09-30-desert-daze-aud2-24bit-t14-float-along.mp3",
  "kglw2022-10-02.MC59/14-Straws in the Wind.mp3",
  "kglw2023-03-09.daank/06 Let Me Mend the Past.mp3",
  "kglw2023-03-09.daank/17 Float Along - Fill Your Lungs.mp3",
  "kglw2023-08-21.aud1/KGLW_2023-08-21_AUD_t02_Head On.Pill.mp3",
  "kglw2024-03-18/kglw2024-03-18-hi8_15.mp3",
  "kglw2024-05-22.Hamburg24/02 - Float Along – Fill Your Lungs.mp3",
  "kglw2024-05-23.SBD.flac/King Gizzard & The Lizard Wizard - Live in Barcelona '25 - 06 Muddy Water (Live in Barcelona '25).mp3",
  "kglw2024-08-19.SBD/King Gizzard & The Lizard Wizard - Live at Suffolk Downs, Boston, MA (8-19-24) - 17 Float Along - Fill Your Lungs (Live).mp3",
  "kglw2024-08-20.mk4v.cmc1k.sx-r4.flac/kglw2024-08-20.mk4v.cmc1k.sx-r4+.24bit-15.mp3",
  "kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-14-4ch_discocape_16.mp3",
  "kglw2026-08-16.SBD/King Gizzard & The Lizard Wizard - Live at Field of Vision II '26 - 01 Pill (Continued) (Live at Field of Vision II '26).mp3",
  "king-gizzard-the-lizard-wizard-one-off-acoustic-show-at-the-brunswick-ballroom-on-12132021-audio/06 Let Me Mend the Past.mp3",
  "KGATLW060918/12.The Wheel.mp3",
  "kg2019-06-27/23-Cyboogie.mp3",
  "kglw2018-06-07.mysteryjack/17 The Wheel.mp3",
  "kglw2018-06-14/kglw2018-06-14d1t12.mp3",
  "kglw2018-06-18.SchoepsMK41.Burns.Flac24/kinggizzard2018-06-18t17_24bit.mp3",
  "kglw2018-08-22.AUD.FLAC16/KGLW_2018-08-22_AUD_t17_The Wheel.mp3",
  "kglw2019-09-02.ca14.flac1648/14-Cyboogie.mp3",
  "kglw2022-04-15/kgatlw-2022-04-15-coachella-aud-16bit-t08-gaia.mp3",
  "kglw2022-04-27.AT2022/06-Gaia.mp3",
  "kglw2022-04-27.AT2022/16-Muddy Water.mp3",
  "kglw2022-10-02/18 Gaia.mp3",
  "kglw2022-10-21.p170/kglw2022-10-21t09.mp3",
  "kglw2023-03-18/kglw2023.03.18.spacebandit/kglw202305.mp3",
  "kglw2023-08-29/kglw2023-08-29d2t06 Gaia.mp3",
  "kglw2024-05-16.KGLWOffenbach24/11-Straws in the Wind.mp3",
  "kglw2024-05-27.dankski/kglw2024.05.27t09.mp3",
  "kglw2025-05-20.SBD.flac/King Gizzard & The Lizard Wizard - Live in Lisbon '25 - 05 Straws In The Wind (Live in Lisbon '25).mp3",
  "kglw2025-06-10.SBD.flac/King Gizzard & The Lizard Wizard - Live in Bulgaria '25 - 38 The Wheel (Live in Bulgaria '25).mp3",
  "kglw2025-11-04/13-Gaia.mp3",
  "kglw2026-08-20/15- Straws In The Wind.mp3",
  "kglw2026-08-21.birds/14-Cyboogie.mp3",
  "kglw2026-10-18.h1n.flac16/kglw2026-10-18t09.mp3",
  "kglw2024-08-20.SBD/King Gizzard & The Lizard Wizard - Live at Thompson's Point, Portland, ME (8-20-24) - 01 Theia (Live).mp3",
  "kglw2025-10-31.SBD/King Gizzard & The Lizard Wizard - Live in Manchester '25 - 01 Theia (Live in Manchester '25).mp3",
  "kglw2025-06-08.SBD.flac/King Gizzard & The Lizard Wizard - Live in Bulgaria '25 - 10 Sea of Trees (Live in Bulgaria '25).mp3",
  "kg2022-10-11/38. Sea Of Trees (Live At Red Rocks '22).mp3",
  "kg2022-11-02/67. Cut Throat Boogie (Live At Red Rocks '22).mp3",
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-14-4ch_discocape_20.mp3',
  "kg2022-11-02/76. Head On'Pill (Live At Red Rocks '22).mp3",
  "kg2022-11-02/83. Let Me Mend The Past (Live At Red Rocks '22).mp3",
  "kg2022-10-11/47. Altered Beast I (Live At Red Rocks '22).mp3",
  "kg2022-10-11/49. Altered Beast II (Live At Red Rocks '22).mp3",
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-15-4ch-discocape_18.mp3',
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-15-4ch-discocape_15.mp3',
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-15-4ch-discocape_16.mp3',
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-14-4ch_discocape_14.mp3',
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-14-4ch_discocape_15.mp3',
  'kglw2026-08-16.Full-Three-Shows-discocape/kglw2026-08-15-4ch-discocape_13.mp3',
  "kglw2025-06-08.SBD.flac/King Gizzard & The Lizard Wizard - Live in Bulgaria '25 - 11 Altered Beast III (Live in Bulgaria '25).mp3",
]);
/** Start points already found (tools/bootleg-starts.mjs, or set by ear), and ends (tools/live-edges.py), kept across a re-run. */
const known = new Map();
try {
  for (const recs of Object.values(JSON.parse(readFileSync(OUT, 'utf8'))))
    for (const r of recs) if (r.start !== undefined) known.set(`${r.id}/${r.file}${r.then ? `>${r.then.file}` : ''}`, { start: r.start, ...(r.end !== undefined ? { end: r.end } : {}), ...(r.then ? { then: r.then } : {}) });
} catch {
  // First run.
}

// The songs, read from songs.ts so the two can't drift apart.
const songsSrc = readFileSync(new URL('../src/audio/songs.ts', import.meta.url), 'utf8');
const SONGS = [...new Set([...songsSrc.matchAll(/title: '((?:[^'\\]|\\.)*)'|title: "([^"]*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")))];
/** Letters and digits only, and no leading "the" ("Lord of Lightning" is The Lord of Lightning). */
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/^the/, '');
const WANT = new Map(SONGS.map((t) => [norm(t), t]));
/**
 * Tracks that are two songs (TrackSong.also), which the band play one into
 * the other: their pairs, played back to back at a show, are kept under
 * "first / second" with the second file as the recording's `then`, so the
 * two play through together.
 */
const PAIRS = [...songsSrc.matchAll(/title: '((?:[^'\\]|\\.)*)'[^\n}]*also: '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]].map((s) => s.replace(/\\'/g, "'")));
for (const pair of PAIRS) for (const s of pair) if (!WANT.has(norm(s))) WANT.set(norm(s), s);
/** Other names a song goes by on tapers' set lists: the closer of Float Along is mostly just "Fill Your Lungs" live. */
const ALIASES = { 'Fill Your Lungs': 'Float Along – Fill Your Lungs' };
for (const [alias, song] of Object.entries(ALIASES)) if (SONGS.includes(song)) WANT.set(norm(alias), song);

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
const found = new Map([...SONGS, ...PAIRS.map((p) => p.join(' / '))].map((t) => [t, new Map()]));
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
  const titleOf = (f) => f.title ?? f.name.replace(/\.mp3$/i, '').replace(/^[\dds]+[-_. ]+/i, '');
  // A pair played back to back: the first song's file, the second's straight after it in the set.
  const inOrder = mp3s.filter((f) => !SKIP.has(`${show.identifier}/${f.name}`)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (let i = 0; i + 1 < inOrder.length; i++) {
    const [a, b] = [songsIn(titleOf(inOrder[i])), songsIn(titleOf(inOrder[i + 1]))];
    for (const pair of PAIRS) {
      if (a.length !== 1 || b.length !== 1 || !((a[0] === pair[0] && b[0] === pair[1]) || (a[0] === pair[1] && b[0] === pair[0]))) continue;
      const byDate = found.get(pair.join(' / '));
      if (byDate.has(date)) continue;
      const [f, g] = [inOrder[i], inOrder[i + 1]];
      const rec = { id: show.identifier, file: f.name, date, venue, seconds: seconds(f.length), then: { file: g.name, seconds: seconds(g.length) } };
      const read = known.get(`${rec.id}/${rec.file}>${g.name}`);
      byDate.set(date, read ? { ...rec, ...read } : rec);
    }
  }
  for (const f of meta.files) {
    if (f.format !== 'VBR MP3' || SKIP.has(`${show.identifier}/${f.name}`)) continue;
    const title = titleOf(f);
    for (const song of songsIn(title)) {
      const byDate = found.get(song);
      if (byDate.has(date)) continue;
      const rec = { id: show.identifier, file: f.name, date, venue, seconds: seconds(f.length) };
      // Where its music starts and ends, if they were already worked out.
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
  const all = [...byDate.values()].filter((r) => r.seconds === 0 || r.seconds >= 90 || r.then).sort((a, b) => a.date.localeCompare(b.date));
  const pick = all.length <= PER_SONG ? all : Array.from({ length: PER_SONG }, (_, k) => all[Math.floor(((k + 0.5) * all.length) / PER_SONG)]);
  if (pick.length) out[song] = pick;
  console.log(`${song}: ${all.length} recorded, ${pick.length} kept`);
}
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
const showList = [...playable.values()].sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(SHOWS_OUT, `${JSON.stringify(showList, null, 1)}\n`);
console.log(`${showList.length} shows to play whole`);
console.log(`wrote ${OUT.pathname}`);
