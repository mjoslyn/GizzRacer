import { describe, expect, it } from 'vitest';
import { liveUrl, type LiveRecording } from '../src/audio/music';
import { TRACK_SONGS } from '../src/audio/songs';

import bootlegs from '../public/music/bootlegs.json';

const catalogue = bootlegs as Record<string, LiveRecording[]>;

describe('live bootlegs', () => {
  it("are keyed by the tracks' songs, and most songs have some", () => {
    const songs = new Set(Object.values(TRACK_SONGS).map((s) => s.title));
    for (const song of Object.keys(catalogue)) expect(songs.has(song), song).toBe(true);
    const tracks = Object.values(TRACK_SONGS).filter((s) => catalogue[s.title]?.length).length;
    expect(tracks).toBeGreaterThanOrEqual(24);
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
