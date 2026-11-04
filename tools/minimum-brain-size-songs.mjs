// Minimum Brain Size's remix, written in seqbaby.
//
// Two cues, a lap cut and a faster final-lap cut (busier drums, the hook up
// front):
//
//   minimum-brain-size-remix(-final-lap)   "Minimum Brain Size" (Omnium Gatherum, 2022)
//
// Transcribed from the band's own live recording, the one the game streams for
// Track song (public/music/bootlegs.json): Live in New York City '25 (Rock
// Night), the soundboard of 2 August 2025, 310 s, the music 21-300.5 s. (Live
// at Field of Vision II '26's file could not be fetched from the Archive.) No
// tab could be reached, so it is the recording alone, and no audio from it
// goes in: these are notes. The song is a tight, groovy funk-rock with a
// hip-hop swagger: a boom-bap pocket (kick pushed off the beat, the snare on
// two and four), a bass on a fixed F# that bends down through E and up to A and
// A#, a clean wah guitar stabbing F# with the F and G either side of it, a
// synth over the riff and Stu rapping the title. The riff stops and starts,
// so the lines are written with holes in them. The title is sung on one choir
// voice, with a chip arp on top. The remix is the song's highlights in the
// song's own order, eight sections of four bars, every section handing to the
// next with a fill and a crash so the loop has no seam.
//
// How the recording was measured, as the Gumboot Soup and All Stars Cups'
// were (tools/gumboot-soup-cup-songs.mjs): the tempo by the vector strength of
// the percussive onsets over the beat period in 0.0003 s steps across 30 s
// windows through the song (the sixteenth 0.159-0.162 s everywhere, so 92.5
// to 94.2 bpm, 93.2 bpm on average; the 132 bpm that a quarter-note search
// finds is the same pulse counted in threes of the sixteenth), checked against
// the onset autocorrelation (peaks at 0.163, 0.325 and 0.476 s) and the riff's
// repeat at 2.57 s; the bar from the lag at which the harmonic constant-Q
// spectrum repeats best; the downbeat from the kick band folded on the bar; the
// key from chroma (Krumhansl, the tuning pinned to 0); a bar-by-bar map of the
// song's bass and two strongest pitch classes for its sections; and per
// section, folded over every repeat of its bar or bars, each step's strongest
// constant-Q note of the harmonic stem in E1-E3 (the bass), the three
// strongest in E3-E6 (the riffs and the lead lines), each bar's three
// strongest pitch classes (the chords and the arp), and the kick, snare and hat
// onsets. The live drumming and playing push the grid about, so the folds
// are noisy; the bar-level map is the firm part. The sung hook is written over
// the measured tones in the singer's register; the words are the title.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import { compose, kit, rep, scoreOf, section, tile4, verbBus, words } from './polygondwanaland-cup-songs.mjs';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const tokens = (s) => String(s).replace(/[\s|]/g, '').split('');
const isHit = (c) => !'._-'.includes(c);
/** A note name as MIDI, `semis` up. */
function midi(name, semis = 0) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]] + semis;
}
/** A line the voice sings: one word of `text` a hit (seqbaby's vox sings a lyric one syllable a note). */
const say = (s, n, text) => ({ s, n, text });
/** A line sung once in a four-bar section, rests after it to the end of the section. */
const once = (p, spb) => {
  if (!p) return null;
  const left = 4 * spb - tokens(p.s).length;
  return { ...p, s: `${p.s} ${'.'.repeat(left)}` };
};
/** A line without its words, for the chip to double. */
const bare = (p) => (p ? { s: p.s, n: p.n } : null);
/** A line moved by octaves. */
const up = (p, n) => (p ? { s: p.s, n: words(p.n).map((x) => (x == null ? null : midi(x, 12 * n))) } : null);
/** Power chords: the root's fifth stacked on each hit (two strings: the drive fills it out, and each string costs the audio thread). */
const power = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [midi(r, 7)]) };
};
/** The drop-B chug: each root with its octave (the fifths of a chug made the F# outweigh the B). */
const chug = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [midi(r, 12)]) };
};

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

const KIT = ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride'];
/** A real drummer's kit (salamander), with the ride. */
const drums = (vol = {}, pieces = KIT) => kit('salamander', { pieces, vol: { hihat: 0.75, ride: 0.6, ...vol } });
const ebass = (preset, vol = 0.85) => ({ name: 'bass', engine: 'dm:bass', preset, params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
/** A Moog bass (ladder), ducking under the kick. */
const moogBass = (vol = 0.7) => ({ name: 'bass', engine: 'dm:ladder', preset: 'model d bass', params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
const guitar = (preset, vol = 0.42, name = 'guitar') => ({ name, engine: 'dm:guitar', preset, params: { vol, decay: 0.5 }, out: 'verb' });
/** A sitar or a bağlama: a plaits string, stiff and bright, through a waveshaper for the buzz of the bridge. */
const sitar = (name, vol = 0.45, decay = 0.55) => ({
  name, engine: 'plaits:11', params: { vol, harm: 0.32, timb: 0.85, morph: 0.7, decay }, out: 'verb', glide: 0.03,
  fx: { shaper: { wet: 0.35, amount: 0.4 }, chorus: { wet: 0.15 } },
});
/**
 * A reed, a pipe or an organ from seqbaby's single-cycle wavetables (wt:akwf, `harm` picks the cycle
 * out of 24): a looped buffer a note, the cheapest melodic voice there is on the audio thread.
 */
const AKWF = ['bw_sin', 'bw_tri', 'bw_sawrounded', 'bw_saw', 'bw_sawbright', 'bw_squrounded', 'bw_squ', 'eorgan', 'epiano', 'piano', 'cello', 'violin', 'flute', 'oboe', 'clarinett', 'altosax', 'ebass', 'eguitar', 'theremin', 'fmsynth', 'overtone', 'distorted', 'oscchip', 'vgame'];
const reed = (name, wave, { vol = 0.4, warm = 0.55, detune = 0.15, decay = 0.75, fx = {} } = {}) => ({
  name, engine: 'wt:akwf', out: 'verb',
  params: { vol, harm: AKWF.indexOf(wave) / (AKWF.length - 1), timb: warm, morph: detune, decay },
  fx,
});
/** The harmonica: the oboe's reed cycle, detuned a little for the two reeds, a quick chorus for the hand. */
const harmonica = (vol = 0.38) => reed('lead', 'oboe', { vol, warm: 0.6, detune: 0.2, decay: 0.7, fx: { chorus: { wet: 0.2, rate: 0.6, depth: 0.3 } } });
const flute = (name = 'flute', vol = 0.34) => ({ name, engine: 'dm:ladder', preset: 'whistle', params: { vol }, out: 'verb', fx: { chorus: { wet: 0.15 } } });
/** The chords (section() voices each bar's measured tones on the `pad` track) on a wavetable cycle. */
const pad = (wave = 'eorgan', vol = 0.24) => reed('pad', wave, { vol, warm: 0.45, detune: 0.25, decay: 0.9, fx: { phaser: { wet: 0.3, rate: 0.3, depth: 0.5 } } });
/** The hooks on one choir voice (a voice is the dearest part on the audio thread). */
const choir = (vol = 0.5, preset = 'choir aah') => ({ name: 'voice', engine: 'dm:vox', preset, out: 'verb', params: { vol, sngvoices: 2 } });
/** The video game on top: a Moog voice through an 8-bit crusher. */
const chip = (vol = 0.18) => ({ name: 'chip arp', engine: 'dm:ladder', preset: 'percussive', params: { vol }, out: 'verb', fx: { crush: { bits: 6, rate: 1, wet: 0.55 } } });

// ---------------------------------------------------------------------------
// Putting a remix together (as tools/gumboot-soup-cup-songs.mjs does)
// ---------------------------------------------------------------------------

/**
 * Lighter on the browser's audio thread, which renders every part in real
 * time: one chip track (the chip lead's line taking the arp's place where a
 * section has one), and the pad holding two of the bar's three measured tones.
 */
function lite(sec) {
  const p = { ...sec.parts };
  for (const k of Object.keys(p)) if (p[k] == null) delete p[k];
  if (p['chip lead']) p['chip arp'] = p['chip lead'];
  delete p['chip lead'];
  if (p.pad?.stack) p.pad = { ...p.pad, stack: p.pad.stack.map((x) => x.slice(0, 1)) };
  return { ...sec, parts: p };
}

/** The voice's lyric, the words of its parts in playing order (one word a hit), checked against its hits. */
function lyrics(tracks, sections, spb) {
  return tracks.map((t) => {
    if (t.engine !== 'dm:vox') return t;
    const all = [];
    for (const sec of sections) {
      const p = sec.parts[t.name];
      if (!p) continue;
      if (!p.text) throw new Error(`${sec.name}/${t.name}: a voice part without words`);
      const steps = sec.bars * spb;
      const tok = tokens(p.s);
      if (steps % tok.length) throw new Error(`${sec.name}/${t.name}: ${tok.length} steps do not tile ${steps}`);
      const hits = tok.filter(isHit).length * (steps / tok.length);
      const w = p.text.trim().split(/\s+/);
      if (hits % w.length) throw new Error(`${sec.name}/${t.name}: ${hits} hits for ${w.length} words`);
      for (let k = 0; k < hits / w.length; k++) all.push(...w);
    }
    if (!all.length) return t;
    const text = all.join(' ');
    if (all.length > 128 || text.length > 400) throw new Error(`${t.name}: lyric too long (${all.length} words, ${text.length} characters)`);
    return { ...t, params: { ...t.params, sngtext: text } };
  });
}

/** The chip arp on a rhythm of the song's own (`song.arp`, one bar), up and down each bar's three measured tones. */
function arpOf(song, phrase) {
  const pat = tokens(song.arp);
  const hitsPerBar = pat.filter(isHit).length;
  const n = [];
  for (let i = 0; i < 4; i++) {
    const pcs = words(phrase.tones[i % phrase.bars]);
    const a = midi(pcs[0] + '4');
    const ups = pcs.slice(1).map((pc) => { let m = midi(pc + '4'); while (m <= a) m += 12; while (m > a + 12) m -= 12; return m; }).sort((x, y) => x - y);
    const cyc = [a, ...ups, a + 12, ...ups.slice().reverse()];
    for (let k = 0; k < hitsPerBar; k++) n.push(cyc[k % cyc.length]);
  }
  return { s: rep(song.arp, 4), n };
}

/**
 * One section of a remix: section() from the score helpers, the riff on the
 * guitar (its power chords where the phrase has them) or on whichever track
 * the song's `use` names, the chip arp in the song's own rhythm, and the
 * phrase's hook sung once.
 */
function sec(song, T, k, final, o = {}) {
  const ph = T[k];
  return section(song, { name: k, ...ph }, {
    final,
    drums: o.drums,
    crash: o.crash,
    use: { guitar: ph.gtr ? ph.gtr : 'riff', ...(song.use ?? {}), ...(o.use ?? {}) },
    extra: { 'chip arp': arpOf(song, ph), voice: once(ph.chant, song.spb), ...(o.extra ?? {}) },
  });
}

/** The lap and final-lap cues of one remix. */
function cue(title, id, song) {
  return [false, true].map((final) => {
    const raw = scoreOf(song, final);
    const score = { ...raw, mix: final ? song.finalMix ?? raw.mix : raw.mix, sections: raw.sections.map(lite) };
    const tracks = lyrics(score.tracks, score.sections, song.spb);
    return {
      title: final ? `${title} (remix, final lap)` : `${title} (remix)`,
      cue: final ? `${id}-final-lap` : id,
      bars: score.sections.reduce((n, s) => n + s.bars, 0),
      build: () => compose({ ...score, tracks }),
    };
  });
}

// ---------------------------------------------------------------------------
// Minimum Brain Size (remix): the funk-rock swagger, the stop-start riff.
//
// Measured (Live in New York City '25, the soundboard, 310 s, the music
// 21-300.5 s): 93.2 bpm in 4/4 (a bar 2.576 s), the sixteenth 0.161 s, the
// kick pushed off the beat (the and of one, the and of two, the four) and
// the snare on two and four, the hats busy. Key: F# (F#, F and G the
// strongest pitch classes of the whole song, C# next), the F# a pedal under
// nearly everything with the F and G rubbing against it in the guitar, the
// bass bending E, F, A and A# off F#. Section map:
//   intro      21-41 s    the riff over F# | C | A# | C and C | A# | A# | C#, stop-start
//   verse      41-83 s    the F# groove (bass F#, bending to E, F, A, A#), "minimum brain size"
//   bridge     83-103 s   C# | B | D# | D, the build
//   verse     103-144 s   the F# groove again
//   riff      144-165 s   D | E | B | F#, the second riff (also 206-268 s: D, E, B, C)
//   verse     165-186 s   the F# groove
//   break     186-206 s   G and G# clustered over the F# pedal, thin
//   outro     268-300 s   F# with C#, then D, then D#
// Lap 93.2 bpm, final lap 101.2. A fingered bass, a wah guitar on the stabs,
// a Moog on the synth line, the organ on the chords, "minimum brain size" on
// the choir, the chip arp in sixteenths; the garage kit, played as a
// boom-bap.
// ---------------------------------------------------------------------------

const E_ = 'x_x_x_x_x_x_x_x_';
const MB_T = {
  intro: { bars: 4, chords: ['F#', 'C', 'A#', 'C'], tones: ['F# G F', 'C F# G', 'A# F# F', 'C F# G'],
    bass: { s: rep('X_xx__x_X_x_x___', 4), n: 'F#1 F#1 A1 F#1 F#1 E1 F#1 C2 C2 D#2 C2 C2 A#1 C2 A#1 A#1 C#2 A#1 A#1 G#1 A#1 C2 C2 D#2 C2 C2 A#1 C2' },
    gtr: { s: rep('x_x__x____x_x___', 4), n: 'F#3 F#3 G3 F3 F#3 C4 C4 D4 C4 C4 A#3 A#3 A#3 C4 C4 C4 D4 C4' },
    lead: { s: 'X_______x_______ X_______x_______ X_______x_______ X_____x_x_______', n: 'F#4 G4 C5 A#4 A#4 C5 C5 D5 C5' } },
  verse: { bars: 4, chords: ['F#', 'F#', 'F#', 'F#'], tones: ['F# G F', 'F# F G', 'F# G F', 'F# F E'],
    bass: { s: 'X__x_xx_X_x__x_x X__x__x_x_x__xx_ X_xx_xx_X_x__x__ X__x__x_x_x_____', n: 'F#1 F#1 A1 E1 F#1 F#1 F#1 F#1 F1 A#1 F#1 F#1 F#1 F#1 F1 F#1 F#1 F#1 E1 F#1 F#1 F#1 A1 E1 F#1 F#1 F#1' },
    gtr: { s: 'x_x__x__x_x__x__ x_x__x__x_x_x___ x_x__x__x_x__x__ x_x__x__x_______', n: 'F#3 G3 F#3 F3 F#3 G3 F#3 F3 F#3 G3 F#3 F3 F#3 G3 F3 F#3 F#3 G3 F#3 F3 F#3 G3 F#3 F3 F#3 F#3 G3 F#3 F3 F#3 F#3 F3' },
    lead: { s: 'X_______x_x_____ X_x_____x_______ X_______x_x_____ X_x_____X_______', n: 'F#4 F4 G4 F#4 F4 G4 F#4 F4 G4 F#4 F4 G4 F#4' },
    chant: say('x_x_x_x_X_______ ................ ................ ................', 'F#4 F#4 G4 F#4 F4', 'min i mum brain size') },
  bridge: { bars: 4, chords: ['C#', 'B', 'D#', 'D'], tones: ['C# F# F', 'B F# A', 'D# F# G', 'D F# F'],
    bass: { s: rep('X_xx__x_X_x_____', 4), n: 'C#2 C#2 F#2 C#2 C#2 C#2 B1 B1 E2 B1 B1 B1 D#2 D#2 G#2 D#2 D#2 D#2 D2 D2 G2 D2 D2 D2' },
    gtr: { s: rep('x_x__x__x_______', 4), n: 'C#3 F#3 F3 C#4 B3 F#3 A3 B3 D#3 F#3 G3 D#4 D3 F#3 F3 D4' },
    lead: { s: 'X_______x_______ X_______x_______ X_______x_______ X_______x___x___', n: 'F#4 F4 F#4 A4 G4 F#4 F4 F#4 A4' } },
  riff: { bars: 4, chords: ['D', 'E', 'B', 'F#'], tones: ['D F# F', 'E F F#', 'B E D#', 'F# C# F'],
    bass: { s: rep('X__x__x_X_x__x_x', 4), n: 'D2 D2 D2 C2 D2 D2 D2 E2 E2 E2 D2 E2 E2 E2 B1 B1 B1 A1 B1 B1 B1 F#1 F#1 F#1 E1 F#1 F#1 F#1' },
    gtr: { s: rep('x__x__x_x_x_____', 4), n: 'D4 D4 C4 D4 F#4 E4 E4 D#4 E4 G4 B3 B3 A3 B3 D#4 F#3 F#3 G3 F#3 F3' },
    lead: { s: 'X_______x___x___ X_______x___x___ X_______x___x___ X_______X_______', n: 'F#4 A4 F#4 G#4 B4 G#4 D#5 B4 D#5 F#4 F4' } },
  brk: { bars: 2, chords: ['F# G', 'F# G#'], tones: ['F# G G#', 'F# G# G'],
    bass: { s: 'X_______X_x_____ X_______X_x_____', n: 'F#1 F#1 G1 F#1 F#1 G#1' },
    gtr: { s: 'x_x___x_x_x_____ x_x___x_x_x_____', n: 'F#3 G3 G#3 G3 F#3 F#3 G#3 G3 G#3 G3' },
    lead: { s: 'X_______________ X_______x_______', n: 'G5 G#5 G5' } },
  coda: { bars: 4, chords: ['F#', 'C#', 'D', 'D#'], tones: ['F# C# F', 'C# F# G', 'D F# F', 'D# F# G'],
    bass: { s: rep('X_______x_x_____', 4), n: 'F#1 F#1 F#1 C#2 C#2 C#2 D2 D2 D2 D#2 D#2 D#2' },
    gtr: { s: rep('x_x_____x_______', 4), n: 'F#3 G3 F3 C#4 D4 C#4 D4 F4 D4 D#4 F4 D#4' },
    lead: { s: 'X_______x_______ X_______x_______ X_______x_______ X_______________', n: 'C#5 F#4 C#5 F#4 D5 F#4 D#5' } },
};

const MINIMUM_BRAIN_SIZE = {
  meter: '4/4', spb: 16, rot: 0, bpm: 93.2, finalPlus: 8, mix: 0.88, finalMix: 0.85,
  arp: 'x.xx.x.xx.x.xx.x',
  use: { guitar: 'gtr' },
  tracks: [
    ...drums({ hihat: 0.6 }),
    ebass('svt fingers', 0.88),
    { name: 'guitar', engine: 'dm:guitar', preset: 'funk clean', params: { vol: 0.46, decay: 0.45 }, out: 'verb', fx: { autowah: { wet: 0.55 } } },
    // The synth over the riff: a Moog voice.
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.3 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
    choir(0.5),
    chip(0.14),
    pad('eorgan', 0.18),
    verbBus(2.2, 0.26, 0.2),
  ],
  grooves: {
    // Boom-bap: the kick off the beat, the snare on two and four, the hats busy.
    groove: (final) => final
      ? { kick: 'X.....x..x.x...x', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '......x.......x.' }
      : { kick: 'X.....x..x.x....', snare: '....X.......X...', hat: 'x.xxx.xxx.xxx.xx' },
    // The stop-start: the break leaves the kick and rim only.
    half: (final) => ({ kick: 'X.........x.....', snare: final ? '....X.......X...' : '', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.....x.........', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'verse', 'bridge', 'verse2', 'riff', 'brk', 'verse3', 'coda'],
  finalOrder: ['verse', 'riff', 'bridge', 'verse2', 'brk', 'riff2', 'verse3', 'coda'],
  sections(final) {
    const T = MB_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const hook = up(bare(T.verse.chant), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', use: { lead: 'lead' } }),
      verse: s('verse', { use: { lead: null }, extra: final ? { 'chip lead': hook } : {} }),
      verse2: s('verse', { use: { lead: 'lead' }, extra: { voice: null } }),
      verse3: s('verse', { use: { lead: 'lead' }, extra: { 'chip lead': up1('verse', 'lead') } }),
      bridge: s('bridge', { use: { lead: 'lead' }, extra: { 'chip lead': up1('bridge', 'lead') } }),
      riff: s('riff', { use: { lead: 'lead' } }),
      riff2: s('riff', { use: { lead: 'lead' }, extra: { 'chip lead': up1('riff', 'lead') } }),
      brk: s('brk', { drums: 'half', use: { lead: 'lead' } }),
      coda: s('coda', { use: { lead: 'lead' }, extra: { voice: once(T.verse.chant, 16), 'chip lead': up1('coda', 'lead') } }),
    };
  },
};

export const SONGS = [
  ...cue('minimum brain size', 'minimum-brain-size-remix', MINIMUM_BRAIN_SIZE),
];
