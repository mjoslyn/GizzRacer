/**
 * The owner checks every live recording's start by ear in a private web
 * player (CLAUDE.md, "Live recordings"). This builds that player for new
 * songs and applies what the owner saved there.
 *
 *   node tools/starts-player.mjs add <song title> [<song title> ...] --slugs <slug> [<slug> ...]
 *        [--out <dir>] [--cup <name>] [--tmp <dir>] [--python <python>]
 *
 *     For each song (already in public/music/bootlegs.json): downloads its
 *     recordings into a new temp dir (--tmp, default the OS temp dir; never
 *     the repo), runs tools/live-edges.py (needs librosa: --python picks the
 *     interpreter that has it, run with -I) to read `start` and `end` of
 *     those with no start yet and writes them to bootlegs.json, cuts a clip
 *     of each (two minutes from 40 s before its start, mono 24 kHz 40 kbps,
 *     ffmpeg) into <out>/clips/, adds the recordings to the top of
 *     tools/starts-player/items.json (keys: slug + index, a slug of two
 *     letters not used before) and writes the filled player to
 *     <out>/index.html. Prints the new clip paths, to publish with the page;
 *     the downloads are deleted at the end.
 *
 *   node tools/starts-player.mjs apply <saved-dir>
 *
 *     <saved-dir> holds the player's saved docs (its `starts` collection),
 *     one <key>.json each, {data: {...}} or the plain {start, status, ...}.
 *     moved and ok starts become the recording's `start` in bootlegs.json;
 *     `drop` takes the recording out and adds it to SKIP in
 *     tools/bootlegs.mjs, so a re-run of that leaves it out. Safe to run
 *     again. Prints, per song, what moved, was dropped and was left.
 *
 * Options for tests: --bootlegs, --skip-file, --items replace the repo's files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PLAYER = join(HERE, 'starts-player');
const CLIP_LEAD = 40;
const CLIP_SECONDS = 120;

/** Positional arguments and --flag values (a flag takes every value up to the next flag). */
function parse(argv) {
  const pos = [];
  const flags = {};
  let cur = null;
  for (const a of argv) {
    if (a.startsWith('--')) flags[(cur = a.slice(2))] = [];
    else if (cur) flags[cur].push(a);
    else pos.push(a);
  }
  return { pos, flags };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`);
const round1 = (x) => Math.round(x * 10) / 10;

/** The Archive's address for a file of an item: every path segment URL-encoded. */
const archiveUrl = (id, file) => `https://archive.org/download/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed (${r.status}): ${(r.stderr || '').slice(-400)}`);
  return r.stdout;
}

function add(pos, flags) {
  const songs = pos;
  const slugs = flags.slugs ?? [];
  if (!songs.length) fail('add: name at least one song');
  if (slugs.length !== songs.length) fail(`add: ${songs.length} song(s) need ${songs.length} slug(s) after --slugs, got ${slugs.length}`);
  if (!flags.out?.[0]) fail('add: --out <dir> is required');
  const out = resolve(flags.out[0]);
  const cup = flags.cup?.[0] ?? 'New songs';
  const python = flags.python?.[0] ?? 'python3';
  const bootlegsPath = flags.bootlegs?.[0] ?? join(HERE, '..', 'public', 'music', 'bootlegs.json');
  const itemsPath = flags.items?.[0] ?? join(PLAYER, 'items.json');

  const catalogue = readJson(bootlegsPath);
  const items = readJson(itemsPath);
  const used = new Set(items.map((i) => i.key.replace(/\d+$/, '')));
  for (const [n, slug] of slugs.entries()) {
    if (!/^[a-z]{2}$/.test(slug)) fail(`add: slug "${slug}" is not two lowercase letters`);
    if (used.has(slug)) fail(`add: slug "${slug}" is already used in ${itemsPath}`);
    if (slugs.indexOf(slug) !== n) fail(`add: slug "${slug}" given twice`);
  }
  for (const song of songs) {
    if (!catalogue[song]?.length) fail(`add: no recordings of "${song}" in ${bootlegsPath}`);
    if (items.some((i) => i.song === song)) fail(`add: "${song}" is already in ${itemsPath}`);
  }

  const dl = mkdtempSync(join(resolve(flags.tmp?.[0] ?? tmpdir()), 'starts-'));
  try {
    const recs = songs.flatMap((song, n) => catalogue[song].map((r, i) => ({ song, r, key: `${slugs[n]}${String(i).padStart(2, '0')}`, path: join(dl, `${slugs[n]}${String(i).padStart(2, '0')}.mp3`) })));
    for (const x of recs) {
      console.log(`download ${x.key} ${x.r.id}/${x.r.file}`);
      run('curl', ['-sSfL', '--retry', '5', '--retry-all-errors', '--retry-delay', '3', '-o', x.path, archiveUrl(x.r.id, x.r.file)]);
    }

    const fresh = recs.filter((x) => x.r.start === undefined);
    if (fresh.length) {
      console.log(`reading edges of ${fresh.length} recording(s)`);
      // One at a time: a file the Archive served broken fails alone, and is named.
      const broken = [];
      for (const x of fresh) {
        let text;
        try {
          text = run(python, ['-I', join(HERE, 'live-edges.py'), x.path]);
        } catch (e) {
          broken.push(`${x.key} ${x.r.id}/${x.r.file}: ${String(e.message).split('\n').slice(-2).join(' ').slice(0, 160)}`);
          continue;
        }
        console.log(text);
        const m = /^\S+\.mp3 {2}[\d.]+ s {2}music ([\d.]+) s to ([\d.]+) s$/m.exec(text);
        if (!m) continue;
        x.r.start = Number(m[1]);
        x.r.end = Number(m[2]);
        console.log(`  ${x.key}: ${m[1]} s to ${m[2]} s`);
      }
      if (broken.length) throw new Error(`unreadable recordings (the Archive does not serve them: take them out of bootlegs.json and add them to SKIP in tools/bootlegs.mjs, then run again):\n${broken.join('\n')}`);
      const missing = fresh.filter((x) => x.r.start === undefined);
      if (missing.length) throw new Error(`no edges read for ${missing.map((x) => x.key).join(', ')}`);
      writeJson(bootlegsPath, catalogue);
    }

    mkdirSync(join(out, 'clips'), { recursive: true });
    const added = [];
    const clips = [];
    for (const x of recs) {
      const clipStart = Math.max(0, round1(x.r.start - CLIP_LEAD));
      const clip = `clips/${x.key}.mp3`;
      run('ffmpeg', ['-y', '-v', 'error', '-ss', String(clipStart), '-t', String(CLIP_SECONDS), '-i', x.path, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '40k', join(out, clip)]);
      clips.push(join(out, clip));
      added.push({ key: x.key, cup, song: x.song, date: x.r.date, venue: x.r.venue ?? '', id: x.r.id, file: x.r.file, start: x.r.start, end: x.r.end, seconds: x.r.seconds, clip, clipStart });
    }

    const all = [...added, ...items];
    writeJson(itemsPath, all);
    const html = readFileSync(join(PLAYER, 'index.html'), 'utf8');
    if (!html.includes('/*ITEMS*/[]')) throw new Error('player template has no /*ITEMS*/ placeholder');
    // The page needs no ids or file names.
    const shown = all.map(({ id, file, ...rest }) => rest);
    writeFileSync(join(out, 'index.html'), html.replace('/*ITEMS*/[]', () => JSON.stringify(shown)));
    console.log(`\nwrote ${join(out, 'index.html')} (${all.length} recordings, ${added.length} new)`);
    console.log('new clips:');
    for (const c of clips) console.log(c);
  } finally {
    rmSync(dl, { recursive: true, force: true });
  }
}

function apply(pos, flags) {
  const dir = pos[0];
  if (!dir || !existsSync(dir)) fail('apply: give the folder of saved docs');
  const bootlegsPath = flags.bootlegs?.[0] ?? join(HERE, '..', 'public', 'music', 'bootlegs.json');
  const skipPath = flags['skip-file']?.[0] ?? join(HERE, 'bootlegs.mjs');
  const itemsPath = flags.items?.[0] ?? join(PLAYER, 'items.json');

  const catalogue = readJson(bootlegsPath);
  const byKey = new Map(readJson(itemsPath).map((i) => [i.key, i]));
  let skipText = readFileSync(skipPath, 'utf8');
  const open = skipText.indexOf('const SKIP = new Set([');
  const close = skipText.indexOf('\n]);', open);
  if (open < 0 || close < 0) fail(`apply: no SKIP set in ${skipPath}`);
  const inSkip = (k) => skipText.slice(open, close).includes(JSON.stringify(k));

  const report = new Map();
  const note = (song) => report.get(song) ?? report.set(song, { moved: [], dropped: [], left: 0, notes: [] }).get(song);
  const newSkips = [];

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const key = basename(name, '.json');
    const raw = readJson(join(dir, name));
    const doc = raw.data ?? raw;
    const item = byKey.get(key);
    if (!item) {
      console.warn(`${key}: not in ${itemsPath}, skipped`);
      continue;
    }
    const r = note(item.song);
    const list = catalogue[item.song] ?? [];
    const at = list.findIndex((x) => x.id === item.id && x.file === item.file);
    const path = `${item.id}/${item.file}`;
    const label = `${key} (${item.date})`;
    if (doc.status === 'drop') {
      if (at < 0) continue; // Already dropped.
      list.splice(at, 1);
      if (!list.length) delete catalogue[item.song];
      if (!inSkip(path) && !newSkips.includes(path)) newSkips.push(path);
      r.dropped.push(label);
    } else if ((doc.status === 'ok' || doc.status === 'moved') && typeof doc.start === 'number') {
      if (at < 0) {
        r.notes.push(`${label} was dropped, but the owner now has it ${doc.status} at ${doc.start} s: put it back by hand (and take ${path} out of SKIP)`);
        continue;
      }
      const start = round1(doc.start);
      if (list[at].start !== start) {
        r.moved.push(`${label} ${list[at].start ?? '-'} -> ${start}`);
        list[at].start = start;
      } else r.left++;
    } else {
      r.notes.push(`${label}: unreadable doc (status ${doc.status})`);
    }
  }

  writeJson(bootlegsPath, catalogue);
  if (newSkips.length) {
    const lines = newSkips.map((k) => `  ${JSON.stringify(k)},\n`).join('');
    skipText = `${skipText.slice(0, close + 1)}${lines}${skipText.slice(close + 1)}`;
    writeFileSync(skipPath, skipText);
    const check = spawnSync(process.execPath, ['--check', skipPath], { encoding: 'utf8' });
    if (check.status !== 0) fail(`apply: ${skipPath} is no longer valid JS:\n${check.stderr}`);
  }

  for (const [song, r] of report) {
    console.log(`${song}: ${r.moved.length} moved, ${r.dropped.length} dropped, ${r.left} left`);
    for (const m of r.moved) console.log(`  moved ${m}`);
    for (const d of r.dropped) console.log(`  dropped ${d}`);
    for (const n of r.notes) console.log(`  NOTE ${n}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = parse(rest);
if (cmd === 'add') add(pos, flags);
else if (cmd === 'apply') apply(pos, flags);
else fail('usage: node tools/starts-player.mjs add <song> ... --slugs <slug> ... --out <dir> | apply <saved-dir>');
