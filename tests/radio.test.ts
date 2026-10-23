import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveOptions, LiveRecording, MusicCue, MusicPlayer } from '../src/audio/music';
import { LiveRadio } from '../src/audio/radio';

const rec = (id: string, file: string): LiveRecording => ({ id, file, date: '2024-01-01', venue: 'Somewhere', seconds: 300 });

/** A stand-in for the music player: remembers what it was told to play. */
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

function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[key] };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('live soundtrack', () => {
  it('track song: a recording of the song, a different one on next, the one before on back', async () => {
    stubFetch({ 'bootlegs.json': { Magma: [rec('a', 'a.mp3'), rec('b', 'b.mp3'), rec('c', 'c.mp3')] } });
    const { music, last } = fakeMusic();
    let n = 0;
    const radio = new LiveRadio(music, () => [0.1, 0.5, 0.9][n++ % 3]);
    const changes = vi.fn();
    radio.onChange(changes);
    expect(await radio.playSong('Magma', ['rattlesnake-remix'])).toBe(true);
    const first = radio.playing!.rec;
    expect(radio.playing!.title).toBe('Magma');
    expect(last().live).toBe(first);
    // Looping for the race: no play-through.
    expect(last().opts?.onEnded).toBeUndefined();
    expect(changes).toHaveBeenCalled();
    radio.next();
    await vi.waitFor(() => expect(radio.playing!.rec).not.toBe(first));
    radio.prev();
    expect(radio.playing!.rec).toBe(first);
    expect(last().live).toBe(first);
    // A song never played live: nothing to play, the caller plays the remix.
    expect(await radio.playSong('Catching Smoke', ['x'])).toBe(false);
    expect(radio.playing).toBe(null);
  });

  it("lets go on stop, and a late answer doesn't start a song after it", async () => {
    stubFetch({ 'bootlegs.json': { Magma: [rec('a', 'a.mp3')] } });
    const { music, calls } = fakeMusic();
    const radio = new LiveRadio(music);
    const pending = radio.playSong('Magma', []);
    radio.stop();
    await pending;
    expect(radio.playing).toBe(null);
    expect(calls).toHaveLength(0);
  });
});
