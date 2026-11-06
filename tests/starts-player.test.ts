// @ts-nocheck: runs the node tool as a process (tsc here has no node types).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'starts-player.mjs');
const dir = mkdtempSync(join(tmpdir(), 'starts-player-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const rec = (id: string, file: string, start: number) => ({ id, file, date: '2020-01-01', venue: 'v', seconds: 200, start });
const item = (key: string, song: string, id: string, file: string) => ({ key, cup: 'C', song, date: '2020-01-01', venue: 'v', id, file, start: 0, end: 100, seconds: 200, clip: `clips/${key}.mp3`, clipStart: 0 });

describe('starts-player apply', () => {
  const saved = join(dir, 'saved');
  mkdirSync(saved);
  const files = {
    bootlegs: join(dir, 'bootlegs.json'),
    skip: join(dir, 'bootlegs.mjs'),
    items: join(dir, 'items.json'),
  };
  writeFileSync(
    files.bootlegs,
    `${JSON.stringify({ Song: [rec('a', 'a.mp3', 0), rec('b', 'dir/b 1.mp3', 5), rec('c', 'c.mp3', 3), rec('d', 'd.mp3', 7)], Other: [rec('e', 'e.mp3', 1)] }, null, 1)}\n`,
  );
  writeFileSync(files.skip, 'const SKIP = new Set([\n  "x/old.mp3",\n  "d/d.mp3",\n]);\nconsole.log(SKIP.size);\n');
  writeFileSync(
    files.items,
    JSON.stringify([item('zz00', 'Song', 'a', 'a.mp3'), item('zz01', 'Song', 'b', 'dir/b 1.mp3'), item('zz02', 'Song', 'c', 'c.mp3'), item('zz03', 'Song', 'd', 'd.mp3'), item('zz04', 'Other', 'e', 'e.mp3')]),
  );
  // Exported docs come wrapped in {data}, or plain.
  writeFileSync(join(saved, 'zz00.json'), JSON.stringify({ data: { start: 12, status: 'moved', was: 0 } }));
  writeFileSync(join(saved, 'zz01.json'), JSON.stringify({ start: 5, status: 'ok' }));
  writeFileSync(join(saved, 'zz02.json'), JSON.stringify({ data: { start: 3, status: 'drop' } }));
  writeFileSync(join(saved, 'zz03.json'), JSON.stringify({ start: 7, status: 'ok' })); // dropped before, now un-dropped
  writeFileSync(join(saved, 'zz04.json'), JSON.stringify({ start: 1.25, status: 'moved' }));

  const run = () => spawnSync('node', [TOOL, 'apply', saved, '--bootlegs', files.bootlegs, '--skip-file', files.skip, '--items', files.items], { encoding: 'utf8' });

  it('moves starts, drops into SKIP, reports', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    const cat = JSON.parse(readFileSync(files.bootlegs, 'utf8'));
    expect(cat.Song.map((x) => x.id)).toEqual(['a', 'b', 'd']);
    expect(cat.Song[0].start).toBe(12);
    expect(cat.Song[1].start).toBe(5);
    expect(cat.Other[0].start).toBe(1.3);
    const skip = readFileSync(files.skip, 'utf8');
    expect(skip).toContain('  "c/c.mp3",\n]);');
    execFileSync('node', ['--check', files.skip]);
    expect(r.stdout).toContain('Song: 1 moved, 1 dropped, 2 left');
    expect(r.stdout).toContain('Other: 1 moved, 0 dropped, 0 left');
  });

  it('is idempotent, and reports a recording the owner un-dropped', () => {
    const before = [readFileSync(files.bootlegs, 'utf8'), readFileSync(files.skip, 'utf8')];
    // d was never in the catalogue this time: take it out as a drop earlier would have.
    const cat = JSON.parse(before[0]);
    cat.Song = cat.Song.filter((x) => x.id !== 'd');
    writeFileSync(files.bootlegs, `${JSON.stringify(cat, null, 1)}\n`);
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(files.skip, 'utf8')).toBe(before[1]);
    expect(JSON.parse(readFileSync(files.bootlegs, 'utf8')).Song.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.stdout).toContain('NOTE zz03');
    expect(r.stdout).toContain('Song: 0 moved, 0 dropped, 2 left');
  });
});

describe('starts-player apply, for the story suites', () => {
  const base = join(dir, 'suites');
  const saved = join(base, 'saved');
  mkdirSync(saved, { recursive: true });
  const files = {
    bootlegs: join(base, 'bootlegs.json'),
    suites: join(base, 'suites.json'),
    skip: join(base, 'bootlegs.mjs'),
    items: join(base, 'items.json'),
  };
  const bootlegsText = `${JSON.stringify({ Song: [rec('a', 'a.mp3', 0)] }, null, 1)}\n`;
  const skipText = 'const SKIP = new Set([\n  "x/old.mp3",\n]);\n';
  writeFileSync(files.bootlegs, bootlegsText);
  writeFileSync(files.skip, skipText);
  writeFileSync(files.suites, `${JSON.stringify({ s: { Song: { ...rec('a', 'a.mp3', 0), end: null }, Next: rec('n', 'n.mp3', 2) } }, null, 1)}\n`);
  const suiteItem = (key: string, song: string, id: string, file: string) => ({ ...item(key, song, id, file), cup: 'Story: S', suite: 's' });
  // The same song and file as a bootlegs.json recording: the suite's item changes the suite's.
  writeFileSync(files.items, JSON.stringify([suiteItem('yy00', 'Song', 'a', 'a.mp3'), suiteItem('yy01', 'Next', 'n', 'n.mp3'), item('zz00', 'Song', 'a', 'a.mp3')]));
  writeFileSync(join(saved, 'yy00.json'), JSON.stringify({ data: { start: 4.04, status: 'moved', was: 0 } }));
  writeFileSync(join(saved, 'yy01.json'), JSON.stringify({ start: 2, status: 'drop' }));

  it('moves starts and drops entries in suites.json, leaving bootlegs.json and SKIP alone', () => {
    const r = spawnSync('node', [TOOL, 'apply', saved, '--bootlegs', files.bootlegs, '--suites', files.suites, '--skip-file', files.skip, '--items', files.items], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const s = JSON.parse(readFileSync(files.suites, 'utf8'));
    expect(s.s.Song.start).toBe(4);
    expect(s.s.Song.end).toBeNull();
    expect(Object.keys(s.s)).toEqual(['Song']);
    expect(readFileSync(files.bootlegs, 'utf8')).toBe(bootlegsText);
    expect(readFileSync(files.skip, 'utf8')).toBe(skipText);
    expect(r.stdout).toContain('Story: S: Song: 1 moved, 0 dropped, 0 left');
    expect(r.stdout).toContain('Story: S: Next: 0 moved, 1 dropped, 0 left');
  });
});
