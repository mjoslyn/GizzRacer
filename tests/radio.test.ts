import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveOptions, LiveRecording, MusicCue, MusicPlayer } from '../src/audio/music';
import { LiveRadio, cleanTitle, playable, setFromFiles, type Show } from '../src/audio/radio';
import shows from '../public/music/shows.json';

const rec = (id: string, file: string): LiveRecording => ({ id, file, date: '2024-01-01', venue: 'Somewhere', seconds: 300 });

/** A stand-in for the music player: remembers what it was told to play, and lets a song end. */
function fakeMusic() {
  const calls: { live?: LiveRecording; cues?: readonly MusicCue[] | MusicCue; opts?: LiveOptions }[] = [];
  const music = {
    playLive: (r: LiveRecording, _f: readonly MusicCue[], opts: LiveOptions = {}) => calls.push({ live: r, opts }),
    play: (cues: readonly MusicCue[] | MusicCue) => calls.push({ cues }),
    toggleLivePause: () => true,
    livePaused: false,
  } as unknown as MusicPlayer;
  return { music, calls, last: () => calls[calls.length - 1] };
}

const SHOW: Show = { id: 'kglw2024-01-01.sbd', date: '2024-01-01', venue: 'Somewhere' };
const FILES = [
  { name: 'kglw2024-01-01t10.mp3', format: 'VBR MP3', title: 'Robot Stop ->' },
  { name: 'kglw2024-01-01t02.mp3', format: 'VBR MP3', title: 'Magma' },
  { name: 'kglw2024-01-01t02.flac', format: 'Flac', title: 'Magma' },
  { name: 'kglw2024-01-01t01.mp3', format: 'VBR MP3' },
];

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[key] };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('live soundtrack', () => {
  it("reads a show's set in order from its MP3s, titled from their tags or names", () => {
    const set = setFromFiles(SHOW, FILES);
    expect(set.songs.map((s) => s.file)).toEqual(['kglw2024-01-01t01.mp3', 'kglw2024-01-01t02.mp3', 'kglw2024-01-01t10.mp3']);
    expect(set.titles).toEqual(['Track 1', 'Magma', 'Robot Stop']);
    expect(cleanTitle('03-Sapience.mp3')).toBe('Sapience');
    expect(cleanTitle('d1t04 Gamma Knife.mp3')).toBe('Gamma Knife');
    expect(cleanTitle('People-Vultures >')).toBe('People-Vultures');
    expect(cleanTitle('kglw2022.12.10.progdog1.flac2444/kglw202212.mp3')).toBe('kglw202212');
  });

  it('matching song: a recording of the song, a different one on next, the one before on back', async () => {
    stubFetch({ 'bootlegs.json': { Magma: [rec('a', 'a.mp3'), rec('b', 'b.mp3'), rec('c', 'c.mp3')] } });
    const { music, last } = fakeMusic();
    let n = 0;
    const radio = new LiveRadio(music, () => [0.1, 0.5, 0.9][n++ % 3]);
    expect(await radio.playSong('Magma', ['rattlesnake-remix'])).toBe(true);
    const first = radio.playing!.rec;
    expect(last().live).toBe(first);
    // Looping for the race: no play-through.
    expect(last().opts?.onEnded).toBeUndefined();
    radio.next();
    await Promise.resolve();
    await Promise.resolve();
    const second = radio.playing!.rec;
    expect(second).not.toBe(first);
    radio.prev();
    expect(radio.playing!.rec).toBe(first);
    // A song never played live: nothing to play, the caller plays the remix.
    expect(await radio.playSong('Catching Smoke', ['x'])).toBe(false);
    expect(radio.playing).toBe(null);
  });

  it('play a set: the set in order from where the music starts, kept across races, then another show at its end', async () => {
    stubFetch({ 'shows.json': [SHOW], '/files': { result: FILES } });
    const { music, last } = fakeMusic();
    // Magma opens with the band talking, and was taped quiet.
    const radio = new LiveRadio(music, () => 0, async (r) => (r.file.includes('t02') ? { start: 12.5, gain: 7 } : { start: 0, gain: 0 }));
    await radio.ensureShow(['remix']);
    expect(radio.playing!.set!.index).toBe(0);
    expect(radio.playing!.title).toBe('Track 1');
    await vi.waitFor(() => expect(last().live?.file).toBe('kglw2024-01-01t01.mp3'));
    // Song after song: the end of one plays the next, past its talk.
    last().opts!.onEnded!();
    expect(radio.playing!.title).toBe('Magma');
    await vi.waitFor(() => expect(last().opts?.start).toBe(12.5));
    expect(last().opts?.gain).toBe(7);
    // The next race keeps the show going.
    const before = radio.playing;
    await radio.ensureShow(['other-remix']);
    expect(radio.playing).toBe(before);
    radio.next();
    expect(radio.playing!.title).toBe('Robot Stop');
    // Past the last song: another show from its first.
    radio.next();
    await vi.waitFor(() => expect(radio.playing!.set!.index).toBe(0));
  });

  it("keep playing: the track's song live, then its show plays on from it, and stays put the next race", async () => {
    const magma: LiveRecording = { id: SHOW.id, file: 'kglw2024-01-01t02.mp3', date: SHOW.date, venue: SHOW.venue, seconds: 600 };
    stubFetch({ 'bootlegs.json': { Magma: [magma] }, '/files': { result: FILES }, 'shows.json': [SHOW] });
    const { music, last } = fakeMusic();
    const radio = new LiveRadio(music, () => 0, async () => ({ start: 0, gain: 0 }));
    await radio.ensureKeep('Magma', ['remix']);
    expect(radio.playing!.mode).toBe('keep');
    expect(last().live).toBe(magma);
    // Once its set list is in, it knows where it is in the show.
    await vi.waitFor(() => expect(radio.playing!.set?.index).toBe(1));
    last().opts!.onEnded!();
    expect(radio.playing!.title).toBe('Robot Stop');
    // A new race on another track doesn't cut away.
    await radio.ensureKeep('Rattlesnake', ['x']);
    expect(radio.playing!.title).toBe('Robot Stop');
    // A song never played live: a show from the top instead.
    radio.stop();
    await radio.ensureKeep('Catching Smoke', ['x']);
    await vi.waitFor(() => expect(radio.playing?.mode).toBe('keep'));
    expect(radio.playing!.set!.index).toBe(0);
  });

  it("skips a set's talk tracks and snippets, either way", () => {
    const song = (file: string, seconds = 300) => ({ id: 'x', file, date: '', venue: '', seconds });
    const set = {
      songs: [song('1'), song('2'), song('3', 20), song('4'), song('5')],
      titles: ['Crowd', 'Rattlesnake', 'Tuning', 'Stage Banter', 'Gamma Knife'],
    };
    expect(playable(set, 0, 1)).toBe(1);
    expect(playable(set, 2, 1)).toBe(4);
    expect(playable(set, 3, -1)).toBe(1);
    expect(playable({ songs: [song('1')], titles: ['Banter'] }, 0, 1)).toBe(1);
  });

  it('a show list of real shows, one a date', () => {
    const list = shows as Show[];
    expect(list.length).toBeGreaterThan(100);
    expect(new Set(list.map((s) => s.date)).size).toBe(list.length);
    for (const s of list) {
      expect(s.id).toMatch(/^[\w.-]+$/);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
