import { describe, expect, it } from 'vitest';
import { liveUrl, type LiveRecording } from '../src/audio/music';
import { STORY_BOSS_SONGS, STORY_SONGS, TRACK_SONGS } from '../src/audio/songs';
import { ACTS } from '../src/core/story';

import bootlegs from '../public/music/bootlegs.json';

const catalogue = bootlegs as Record<string, LiveRecording[]>;

describe('live bootlegs', () => {
  it("are keyed by the tracks' songs (and story mode's), and most songs have some", () => {
    const songs = new Set([...Object.values(TRACK_SONGS), ...STORY_SONGS.flat()].map((s) => s.title));
    for (const song of Object.keys(catalogue)) expect(songs.has(song), song).toBe(true);
  });

  it("every track's song has live recordings (a new track's song goes in the catalogue: tools/bootlegs.mjs, then tools/bootleg-starts.mjs)", () => {
    // Never played live: those tracks race to their remix on Track song.
    const NEVER_LIVE = new Set<string>([]);
    for (const [id, s] of Object.entries(TRACK_SONGS)) {
      if (NEVER_LIVE.has(s.title)) continue;
      expect(catalogue[s.title]?.length, `${id}: ${s.title}`).toBeGreaterThan(0);
    }
  });

  it("every story chapter has songs of its own played live, enough for both its races", () => {
    expect(STORY_SONGS).toHaveLength(ACTS.length);
    for (const [i, songs] of STORY_SONGS.entries()) {
      const live = songs.filter((s) => catalogue[s.title]?.length);
      expect(live.length, ACTS[i].title).toBeGreaterThanOrEqual(2);
    }
    // Each boss duel's own song is one of its chapter's, played live.
    expect(STORY_BOSS_SONGS).toHaveLength(ACTS.length);
    STORY_BOSS_SONGS.forEach((title, i) => {
      expect(STORY_SONGS[i].some((s) => s.title === title), title).toBe(true);
      expect(catalogue[title]?.length, title).toBeGreaterThan(0);
    });
  });

  it('every recording names its show, file and date, one a date per song', () => {
    for (const [song, recs] of Object.entries(catalogue)) {
      expect(recs.length, song).toBeGreaterThan(0);
      expect(recs.length, song).toBeLessThanOrEqual(12);
      expect(new Set(recs.map((r) => r.date)).size, song).toBe(recs.length);
      for (const r of recs) {
        expect(r.id, song).toMatch(/^[\w.-]+$/);
        expect(r.file, song).toMatch(/\.mp3$/i);
        expect(r.date, song).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Where the music starts, past the talk: inside the recording, and inside the opening that was read.
        // The gain that evens it with the remixes: within the limits.
        if (r.gain !== undefined) {
          expect(r.gain, song).toBeGreaterThanOrEqual(-6);
          expect(r.gain, song).toBeLessThanOrEqual(17);
        }
        if (r.start !== undefined) {
          expect(r.start, song).toBeGreaterThanOrEqual(0);
          expect(r.start, song).toBeLessThan(Math.min(100, r.seconds || 100));
        }
      }
    }
  });

  it('streams from archive.org, a file in a folder keeping its slashes and everything else escaped', () => {
    expect(liveUrl({ id: 'kglw2022-12-10.x', file: 'a b/c#d.mp3', date: '', venue: '', seconds: 0 })).toBe('https://archive.org/download/kglw2022-12-10.x/a%20b/c%23d.mp3');
  });
});
