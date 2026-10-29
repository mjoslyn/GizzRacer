// The Silver Cord Cup's remixes, written in seqbaby.
//
// Eight cues, the four songs from The Silver Cord (2023) the cup races to,
// each a lap cut and a faster final-lap cut (+8 bpm, busier drums, the hook
// up front):
//
//   theia-remix(-final-lap)       "Theia"
//   set-remix(-final-lap)         "Set"
//   chang-e-remix(-final-lap)     "Chang'e"
//   gilgamesh-remix(-final-lap)   "Gilgamesh"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json): Theia from the Live in
// Barcelona '25 soundboard, Set from Live in New York City '25 (Rock Night),
// Chang'e from Live at Red Rocks '24 and Gilgamesh from Live at Field of
// Vision '25. Theia's chords are checked against its tab on Ultimate Guitar
// (A, A9sus4, D/A over an A drone; the chorus A7); the others have no free
// tab, so they are the recordings alone. No audio from the recordings goes
// in: these are notes. The album is the band's synth record (a modular
// Moog, drum machines, extended dance mixes), so the remixes are synths: a
// siege kick, a lancet clap, an acid bass, a Moog lead, arps and pads, and
// the chants ("Theia", "slay the mighty Set", "Chang'e", "Gilgamesh") on a
// choir. Each remix is the song's highlights in the song's own order, eight
// sections of four bars, every section handing to the next with a fill and
// a crash so the loop has no seam.
//
// How the recordings were measured: tempo and beats from percussive onsets
// (librosa), the bar line from where the kick lands, the key from chroma
// (Krumhansl), each bar's chord and three strongest pitch classes from
// beat-synchronous chroma on the harmonic stem, the bass and riff lines per
// sixteenth from pyin and constant-Q on the harmonic stem.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import { chip, cue, oct, rep, section, tile4, verbBus } from './polygondwanaland-cup-songs.mjs';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** A note name `semis` up, as MIDI. */
function up(name, semis) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]] + semis;
}
/** A power chord on every hit: the root's fifth and octave stacked on it (`roots` cycle over the hits). */
const power = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [up(r, 7), up(r, 12)]) };
};
/** Repeat each word `k` times: `each('B1 A1', 4)` is B1 B1 B1 B1 A1 A1 A1 A1. */
const each = (words, k) => words.split(/\s+/).flatMap((w) => Array(k).fill(w)).join(' ');
/** A choir that sings `text`, one syllable a note. */
const voice = (name, { text, vol = 0.45, size = 0.55, voices = 6 } = {}) => ({
  name, engine: 'dm:vox', out: 'verb',
  params: { vol, timb: size, morph: 0.25, sngvoices: voices, sngtext: text },
});
/** The synth kit every remix here plays: a siege kick tuned to the key, a lancet clap, sampled hats, crash and toms. */
const synthKit = (root, { kick = 0.75, clap = 0.62 } = {}) => [
  { name: 'kick', engine: 'dm:siege', preset: '909', params: { vol: kick, sgehpf: 'on' }, note: root },
  { name: 'snare', engine: 'dm:lancet', preset: 'fm clap', params: { vol: clap, decay: 0.3, lncrtimbre: 0.1, lncrlevel: 0.15 } },
  { name: 'hat', engine: 'sampler', sample: 'salamander/hihat', drum: true, params: { vol: 0.7 } },
  { name: 'open hat', engine: 'sampler', sample: 'salamander/openhat', drum: true, params: { vol: 0.42 } },
  { name: 'crash', engine: 'sampler', sample: 'salamander/crash', drum: true, params: { vol: 0.5 } },
  { name: 'tom hi', engine: 'sampler', sample: 'salamander/tom1', drum: true, params: { vol: 0.6 } },
  { name: 'tom lo', engine: 'sampler', sample: 'salamander/tom2', drum: true, params: { vol: 0.65 } },
];
/** The acid bass, ducking under the kick. */
const acid = (vol = 0.95) => ({ name: 'bass', engine: 'dm:silverbox', params: { vol, harm: 0.42, timb: 0.62, morph: 0.6, decay: 0.35, sbaccent: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
/** A four-on-the-floor rave beat; the final lap busier. */
const rave = (final) => final
  ? { kick: 'X...X...X...X...', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
  : { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x.X.x.X.x.X.x.X.', 'open hat': '..x...x...x...x.' };
const halfRave = (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', hat: '..x...x...x...x.' });
const FILL = { kick: 'X...X...X.X.X.X.', snare: '....X...x.x.xxXX', hat: 'x.x.x.x.........', 'open hat': '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' };

// ---------------------------------------------------------------------------
// 1. Theia (remix): the young Earth, and the planet coming on to hit it.
//
// Measured (Live in Barcelona '25, the soundboard, 552 s): 143.6 bpm in 4/4,
// a bar 1.67 s. Key: A mixolydian (the G natural in nearly every bar), an A
// drone under all of it. The verses move A | A9sus4 | D/A over the drone, as
// the tab has it; the pre-chorus chants "Theia" on the same three; the
// chorus ("meet our maker, dance with Theia") puts A7 in; and the long
// middle rides G | D | A | A7, the bass G1-D2-A1 (82-96 s and 148-168 s).
// Section map (the phrases taken, in the song's order):
//   intro     16-30 s    the A drone, the sequencer running A-E-A-G
//   verse     30-50 s    A | A | A9sus4 | D/A, the silver cord
//   pre       50-56 s    "Theia, Theia"
//   chorus    96-110 s   A | A7 | A | D/A, "meet our maker, dance with Theia"
//   gda      148-168 s   G | D | A | A7
//   solo     280-300 s   the A7 vamp, the lead running up the mode
//   destroy  "destroy Theia": A | D, back round to the top
// Lap 143.6 bpm, final lap 151.6. An acid bass, the sequencer on a pluck
// (a contagion supersaw with a short filter envelope), the vocal line on a
// Moog lead, a fuzz guitar on the G-D-A, the chants on a choir, chip arp
// and chip lead; the synth kit.
// ---------------------------------------------------------------------------

const THEIA_SEQ = 'A3 E4 A4 E4 G4 E4 A4 E4';
const THEIA_T = {
  intro: { bars: 2, chords: ['A', 'A'], tones: ['A E G', 'A C# E'],
    bass: { s: 'x.xx.xx.x.xx.xx. x.xx.xx.x.xx.x.x', n: 'A1 A1 A2 A1 A1 A2 A1 A1 A2 A1 A1 A2 A1 A1 A2 A1 A1 A2 G1 A1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: THEIA_SEQ } },
  verse: { bars: 4, chords: ['A', 'A', 'A9sus4', 'D/A'], tones: ['A C# E', 'A E G', 'A B E', 'A D F#'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 4), n: each('A1 A1 A2', 1) },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 4), n: 'A3 E4 A4 E4 G4 E4 A4 E4 A3 E4 A4 E4 G4 E4 A4 E4 A3 E4 B4 E4 A4 E4 B4 E4 A3 D4 F#4 D4 A4 D4 F#4 D4' },
    lead: { s: '..x.x.x.x_x.x___ ....x.x.x.x.x___ ..x.x.x.x_x.x___ ....x.x.x.x.x___', n: 'E4 E4 E4 C#4 E4 F#4 E4 E4 F#4 E4 D4 C#4 A4 E4 E4 E4 C#4 E4 F#4 E4 B4 A4 F#4 E4 D4 E4' } },
  pre: { bars: 2, chords: ['A', 'D/A'], tones: ['A C# E', 'A D F#'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 2), n: 'A1 A1 A2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'A3 E4 A4 E4 B4 E4 A4 E4 A3 D4 F#4 D4 A4 D4 F#4 D4' },
    lead: { s: 'x_x_x_x_x_x_x___ x_x_x_x_x_x_x___', n: 'A4 E4 A4 E4 B4 A4 E4 A4 E4 A4 E4 F#4 E4 D4' } },
  chorus: { bars: 4, chords: ['A', 'A7', 'A', 'D/A'], tones: ['A C# E', 'A C# G', 'A C# E', 'A D F#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: each('A1 A2', 4) + ' ' + each('A1 G1', 4) + ' ' + each('A1 A2', 4) + ' ' + each('D2 A1', 4) },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 4), n: 'A3 E4 A4 E4 C#5 E4 A4 E4 A3 E4 G4 E4 C#5 E4 G4 E4 A3 E4 A4 E4 C#5 E4 A4 E4 A3 D4 F#4 D4 A4 D4 F#4 D4' },
    lead: { s: 'X_x_x_x_........ X_x_x_x_x_x_____ X_x_x_x_........ X_x_x_x_x_x_____', n: 'E5 E5 C#5 A4 E5 E5 C#5 A4 G4 A4 E5 E5 C#5 A4 F#5 E5 D5 A4 F#4 A4' } },
  gda: { bars: 4, chords: ['G', 'D', 'A', 'A7'], tones: ['G B D', 'D F# A', 'A C# E', 'A C# G'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 4), n: each('G1', 6) + ' ' + each('D2', 6) + ' ' + each('A1', 6) + ' ' + each('A1', 4) + ' G1 G#1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 4), n: 'G3 D4 G4 D4 B4 D4 G4 D4 D4 A4 D5 A4 F#4 A4 D5 A4 A3 E4 A4 E4 C#5 E4 A4 E4 A3 E4 G4 E4 C#5 E4 G4 E4' },
    gtr: power('X_____x_X_____x_ X_____x_X_____x_ X_____x_X_____x_ X_____x_X_x_x_x_', 'G2 G2 G2 G2 D3 D3 D3 D3 A2 A2 A2 A2 A2 A2 A2 A2 G2 G#2'),
    lead: { s: 'x___x.x.x___x.x. x___x.x.x___x.x. x___x.x.x___x.x. x___x.x.x_x_x_x_', n: 'B4 A4 G4 D5 B4 A4 A4 F#4 D4 A4 F#4 E4 C#5 B4 A4 E5 C#5 A4 G4 E4 G4 A4 B4 C#5' } },
  solo: { bars: 2, chords: ['A7', 'A7'], tones: ['A C# G', 'A E G'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 2), n: 'A1 A1 A2 A1 A1 G1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: THEIA_SEQ },
    lead: { s: 'xxxxxxxxx_x_x___ xxxxxxxxx_x_x___', n: 'A4 B4 C#5 D5 E5 F#5 G5 A5 G5 E5 C#5 E5 D5 C#5 B4 A4 G4 E4 G4 A4 C#5 A4' } },
  destroy: { bars: 2, chords: ['A', 'D'], tones: ['A C# E', 'D F# A'],
    bass: { s: 'x.xx.xx.x.xx.xx. x.xx.xx.x.x.x.x.', n: 'A1 A1 A2 A1 A1 A2 A1 A1 A2 A1 D2 D2 D3 D2 D2 D3 D2 E2 F#2 G#2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'A3 E4 A4 E4 C#5 E4 A4 E4 D4 A4 D5 A4 F#5 A4 D5 A4' },
    lead: { s: 'X_x_x_x_........ X_x_x_x_x_______', n: 'E5 E5 C#5 A4 E5 D5 C#5 B4 A4' } },
};

const THEIA = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143.6, finalPlus: 8, mix: 0.68,
  tracks: [
    ...synthKit('A1'),
    acid(),
    { name: 'guitar', engine: 'dm:contagion', params: { vol: 0.34, harm: 0.7, timb: 0.15, morph: 0.4, decay: 0.2, vuni: '4', vunidet: 0.2, vfdec: 0.15, vfsus: 0.1, venvamt: 0.7 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'vibrato lead', params: { vol: 0.42 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
    { name: 'fuzz', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.42 }, out: 'verb' },
    voice('choir', { text: 'thee ah thee ah thee ah thee ah', vol: 0.5 }),
    chip('chip arp', { vol: 0.24, pw: 0.25 }),
    chip('chip lead', { vol: 0.28, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'strings', params: { vol: 0.3 }, out: 'verb' },
    verbBus(2.4, 0.3, 0.2),
  ],
  grooves: { groove: rave, half: halfRave },
  fill: FILL,
  order: ['intro', 'verse', 'pre', 'chorus', 'gda', 'solo', 'chorus2', 'destroy'],
  finalOrder: ['chorus', 'gda', 'verse', 'pre', 'solo', 'chorus2', 'gda2', 'destroy'],
  sections(final) {
    const T = THEIA_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const chant = (k) => ({ s: T[k].lead.s, n: T[k].lead.n });
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half' }),
      verse: s('verse'),
      pre: s('pre', { use: { lead: null }, extra: { choir: chant('pre') } }),
      chorus: s('chorus', { use: { lead: null }, extra: { choir: chant('chorus'), ...(final ? { 'chip lead': up1('chorus', 'lead') } : {}) } }),
      chorus2: s('chorus', { extra: { choir: chant('chorus'), 'chip lead': up1('chorus', 'lead') } }),
      gda: s('gda', { extra: { fuzz: T.gda.gtr } }),
      gda2: s('gda', { extra: { fuzz: T.gda.gtr, 'chip lead': up1('gda', 'lead') } }),
      solo: s('solo', { extra: { 'chip lead': up1('solo', 'lead') } }),
      destroy: s('destroy', { use: { lead: null }, extra: { choir: chant('destroy') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Set (remix): the god in the red land, at the edge of day and night.
//
// Measured (Live in New York City '25, Rock Night, the soundboard, 455 s):
// 129.2 bpm in 4/4, a bar 1.86 s. Key: G, dorian and bluesy (the B flat of
// Gm against the B of G7, the F natural, and C7 the IV). The verse rides Gm
// with C7 every fourth bar; "slay the mighty Set" is chanted over G7 | C7;
// a bright C stretch (C | C | G7 | Gm, 194-216 s) is the god of duality; a
// G5 vamp with the F (224-240 s) the breakdown; the end on C and G with B on
// top. Section map:
//   intro      1-16 s    the Gm vamp, the bass on G with F and B flat
//   verse     16-46 s    Gm | Gm | C7 | Gm
//   slay      61-90 s    G7 | C7, "slay the mighty Set"
//   duality  194-216 s   C | C | G7 | Gm
//   brk      224-240 s   G5 with the F, half time
//   outro    402-446 s   C | G, the B on top
// Lap 129.2 bpm, final lap 137.2. An acid bass, a wah guitar on the riff,
// the lead on a snarl (aggressive mono), the chant on a choir, chip arp and
// chip lead; the synth kit.
// ---------------------------------------------------------------------------

const SET_T = {
  intro: { bars: 2, chords: ['Gm', 'Gm'], tones: ['G A# D', 'G F A#'],
    bass: { s: 'x.xxx.x.x.xxx.x. x.xxx.x.x.x.x.x.', n: 'G1 G1 G2 G1 F1 G1 G1 G2 G1 A#1 G1 G1 G2 G1 F1 G1 A#1 C2 D2' },
    riff: { s: 'x..x..x.x..x..x. x..x..x.x.x.x.x.', n: 'G3 A#3 D4 G3 A#3 D4 G3 A#3 D4 F4 D4 C4 A#3' } },
  verse: { bars: 4, chords: ['Gm', 'Gm', 'C7', 'Gm'], tones: ['G A# D', 'G D F', 'C E A#', 'G A# D'],
    bass: { s: rep('x.xxx.x.x.xxx.x.', 4), n: each('G1 G1 G2 G1 F1 G1', 1) + ' ' + 'G1 G1 G2 G1 F1 G1 G1 G1 G2 G1 F1 G1 C2 C2 C3 C2 A#1 C2 C2 C2 C3 C2 A#1 C2 G1 G1 G2 G1 F1 G1 G1 A#1 C2 D2 F2 G2' },
    riff: { s: rep('x..x..x.x..x..x.', 4), n: 'G3 A#3 D4 G3 A#3 D4 G3 A#3 D4 G3 A#3 F4 C4 E4 G4 C4 E4 A#4 G3 A#3 D4 G3 A#3 D4' },
    lead: { s: '..x.x.x.x___.... ..x.x.x.x.x.x___ ..x.x.x.x___.... ..x.x.x.x.x.x___', n: 'D5 D5 A#4 G4 A4 A#4 C5 A#4 A4 G4 E5 E5 C5 A#4 D5 C5 A#4 A4 G4' } },
  slay: { bars: 2, chords: ['G7', 'C7'], tones: ['G B F', 'C E A#'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('G1 G2', 4) + ' ' + each('C2 C3', 3) + ' A#1 B1' },
    riff: { s: 'x..x..x.x..x..x. x..x..x.x..x..x.', n: 'G3 B3 D4 F4 D4 B3 C4 E4 G4 A#4 G4 E4' },
    lead: { s: 'X_x_X_x_X_______ X_x_X_x_X_______', n: 'G4 G4 B4 D5 D5 G4 G4 C5 E5 E5' } },
  duality: { bars: 4, chords: ['C', 'C', 'G7', 'Gm'], tones: ['C E G', 'C G B', 'G B F', 'G A# D'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: each('C2 C3', 8) + ' ' + each('G1 G2', 4) + ' ' + each('G1 G2', 3) + ' F1 F#1' },
    riff: { s: rep('x.xxx.x.x.xxx.x.', 4), n: 'C4 E4 G4 E4 C4 E4 G4 B4 G4 E4 C4 E4 G4 B4 D5 B4 G4 F4 D4 B3 G3 A#3 D4 F4 D4 A#3' },
    lead: { s: 'x___x.x.x___x.x. x___x___x_______ x___x.x.x___x.x. x___x___x_______', n: 'E5 D5 C5 G4 C5 D5 E5 G5 E5 B4 D5 F5 D5 B4 A#4 A4 G4' } },
  brk: { bars: 2, chords: ['G5', 'G5'], tones: ['G D F', 'G D F#'],
    bass: { s: 'X_______x_______ X_______x___x___', n: 'G1 G1 G1 F1 F#1' },
    riff: { s: 'x...x...x...x... x...x...x.x.x.x.', n: 'G3 D4 F4 D4 G3 D4 F4 D4 F#4 D4 C4' } },
  outro: { bars: 2, chords: ['C', 'G'], tones: ['C G B', 'G C D'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('C2 C3', 4) + ' ' + each('G1 G2', 3) + ' F1 F#1' },
    riff: { s: 'x..x..x.x..x..x. x..x..x.x..x..x.', n: 'C4 G4 B4 C4 G4 B4 G3 D4 G4 C4 D4 G4' },
    lead: { s: 'X_______x_x_x___ X_______x_x_x___', n: 'B4 C5 D5 B4 G4 C5 B4 A4' } },
};

const SET = {
  meter: '4/4', spb: 16, rot: 0, bpm: 129.2, finalPlus: 8, mix: 0.92,
  tracks: [
    ...synthKit('G1'),
    acid(),
    { name: 'guitar', engine: 'dm:guitar', preset: 'funk clean', params: { vol: 0.48 }, out: 'verb', fx: { autowah: { wet: 0.5 } } },
    { name: 'lead', engine: 'dm:snarl', params: { vol: 0.34, harm: 0.4, timb: 0.4, osc1: 0.7, osc2: 0.4, osc3: 0, osc4: 0, ultra: 0, fm: 0.1, metal: 0 }, filter: { cutoff: 0.6 }, out: 'verb', glide: 0.06 },
    voice('choir', { text: 'slay the might ee set', vol: 0.5, size: 0.7 }),
    chip('chip arp', { vol: 0.24, pw: 0.25 }),
    chip('chip lead', { vol: 0.28, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'dirty stab', params: { vol: 0.26 }, out: 'verb' },
    verbBus(2.0, 0.28, 0.2),
  ],
  grooves: { groove: rave, half: halfRave },
  fill: FILL,
  order: ['intro', 'verse', 'slay', 'duality', 'verse2', 'brk', 'slay2', 'outro'],
  finalOrder: ['slay', 'verse', 'duality', 'slay2', 'brk', 'verse2', 'duality2', 'outro'],
  sections(final) {
    const T = SET_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const chant = { s: T.slay.lead.s, n: T.slay.lead.n };
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half' }),
      verse: s('verse'),
      verse2: s('verse', { extra: { 'chip lead': up1('verse', 'lead') } }),
      slay: s('slay', { use: { lead: null }, extra: { choir: chant } }),
      slay2: s('slay', { use: { lead: null }, extra: { choir: chant, 'chip lead': up1('slay', 'riff') } }),
      duality: s('duality', { extra: final ? { 'chip lead': up1('duality', 'lead') } : {} }),
      duality2: s('duality', { extra: { 'chip lead': up1('duality', 'lead') } }),
      brk: s('brk', { drums: 'half' }),
      outro: s('outro'),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Chang'e (remix): the goddess of the Moon.
//
// Measured (Live at Red Rocks '24, the soundboard, 472 s): 161.5 bpm in 4/4,
// a bar 1.49 s. Key: F# major: a long F# drone with the G# and B as colour
// (the verses), the chorus ("be the auteur, Chang'e") climbing D#m | E | F#,
// and an F#7 stretch with the E (mixolydian) and a C#m (226-240 s). Section
// map:
//   intro      0-25 s    the quiet F#, the lyre picking it out
//   verse     37-86 s    F# | F# | F# | F#7, "ten suns explode in the sky"
//   chorus   120-144 s   D#m | E | F# | F#, "be the auteur, Chang'e"
//   moonsea  215-240 s   F#7 | F#7 | C#m | F#7, "sailing the moon-sea"
//   quiet    250-330 s   the F# drone again, quiet
// Lap 161.5 bpm, final lap 169.5. An acid bass, the lyre on a plucked string
// (plaits' string model), the vocal line on a Moog lead, the chant on a
// choir, chip arp and chip lead; the synth kit.
// ---------------------------------------------------------------------------

const CHANGE_T = {
  intro: { bars: 2, chords: ['F#', 'F#'], tones: ['F# A# C#', 'F# G# A#'],
    bass: { s: 'X_______________ X_______x___x___', n: 'F#1 F#1 C#2 E2' },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'F#4 A#4 C#5 A#4 F#5 C#5 A#4 C#5 F#4 G#4 A#4 C#5 F#5 C#5 A#4 G#4' } },
  verse: { bars: 4, chords: ['F#', 'F#', 'F#', 'F#7'], tones: ['F# A# C#', 'F# G# A#', 'F# A# C#', 'F# A# E'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 4), n: 'F#1 F#1 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'F#4 A#4 C#5 A#4 F#5 C#5 A#4 C#5 F#4 G#4 A#4 C#5 F#5 C#5 A#4 G#4 F#4 A#4 C#5 A#4 F#5 C#5 A#4 C#5 F#4 A#4 C#5 E5 F#5 E5 C#5 A#4' },
    lead: { s: '..x.x.x.x___.... ..x.x.x.x.x.x___ ..x.x.x.x___.... ..x.x.x.x.x.x___', n: 'C#5 C#5 A#4 F#4 F#4 G#4 A#4 C#5 A#4 G#4 C#5 C#5 A#4 F#4 E5 C#5 A#4 G#4 F#4' } },
  chorus: { bars: 4, chords: ['D#m', 'E', 'F#', 'F#'], tones: ['D# F# A#', 'E G# B', 'F# A# C#', 'F# A# C#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: each('D#2 D#1', 4) + ' ' + each('E2 E1', 4) + ' ' + each('F#2 F#1', 4) + ' ' + each('F#2 F#1', 3) + ' C#2 E2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'D#4 F#4 A#4 F#4 D#5 A#4 F#4 A#4 E4 G#4 B4 G#4 E5 B4 G#4 B4 F#4 A#4 C#5 A#4 F#5 C#5 A#4 C#5 F#4 A#4 C#5 A#4 F#5 C#5 A#4 C#5' },
    lead: { s: 'x_x_x___X_______ x_x_x___X_______ x_x_x___X_______ x_x_x_x_X_______', n: 'A#4 A#4 A#4 F#5 B4 B4 B4 G#5 C#5 C#5 C#5 A#5 C#5 A#4 G#4 F#4 F#4' } },
  moonsea: { bars: 4, chords: ['F#7', 'F#7', 'C#m', 'F#7'], tones: ['F# A# E', 'F# C# E', 'C# E G#', 'F# C# E'],
    bass: { s: rep('x.xx.xx.x.xx.xx.', 4), n: each('F#1 F#1 F#2', 4) + ' ' + each('C#2 C#2 C#3', 2) + ' ' + each('F#1 F#1 F#2', 2) },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'F#4 A#4 E5 A#4 F#5 E5 C#5 A#4 F#4 C#5 E5 C#5 F#5 E5 C#5 A#4 C#4 E4 G#4 E4 C#5 G#4 E4 G#4 F#4 C#5 E5 C#5 F#5 E5 C#5 A#4' },
    lead: { s: 'x___x.x.x___x.x. x___x.x.x_______ x___x.x.x___x.x. x___x.x.x_______', n: 'E5 C#5 A#4 F#4 A#4 C#5 E5 C#5 A#4 E5 C#5 G#4 E4 G#4 C#5 E5 C#5 A#4 F#4' } },
  quiet: { bars: 2, chords: ['F#', 'F#'], tones: ['F# A# C#', 'F# C# A#'],
    bass: { s: 'X_______________ X_______________', n: 'F#1 F#1' },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'F#4 C#5 A#4 C#5 F#5 C#5 A#4 C#5' } },
};

const CHANGE = {
  meter: '4/4', spb: 16, rot: 0, bpm: 161.5, finalPlus: 8, mix: 0.68,
  tracks: [
    ...synthKit('F#1'),
    acid(0.9),
    { name: 'guitar', engine: 'plaits:11', params: { vol: 0.5, harm: 0.4, timb: 0.6, morph: 0.5, decay: 0.55 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.4 }, out: 'verb', glide: 0.05, fx: { chorus: { wet: 0.2 } } },
    voice('choir', { text: 'chang eh chang eh', vol: 0.5, size: 0.35 }),
    chip('chip arp', { vol: 0.24, pw: 0.25 }),
    chip('chip lead', { vol: 0.28, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'glass', params: { vol: 0.3 }, out: 'verb' },
    verbBus(3.0, 0.34, 0.22),
  ],
  grooves: { groove: rave, half: halfRave },
  fill: FILL,
  order: ['intro', 'verse', 'chorus', 'moonsea', 'quiet', 'verse2', 'chorus2', 'outro'],
  finalOrder: ['chorus', 'verse', 'moonsea', 'chorus2', 'quiet', 'verse2', 'moonsea2', 'outro'],
  sections(final) {
    const T = CHANGE_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    const chant = { s: 'x___x___........ ................ x___x___........ ................', n: 'A#4 F#4 C#5 A#4' };
    return {
      intro: s('intro', { drums: 'half' }),
      verse: s('verse'),
      verse2: s('verse', { extra: { 'chip lead': up1('verse', 'lead') } }),
      chorus: s('chorus', { extra: { choir: chant, ...(final ? { 'chip lead': up1('chorus', 'lead') } : {}) } }),
      chorus2: s('chorus', { extra: { choir: chant, 'chip lead': up1('chorus', 'lead') } }),
      moonsea: s('moonsea'),
      moonsea2: s('moonsea', { extra: { 'chip lead': up1('moonsea', 'lead') } }),
      quiet: s('quiet', { drums: 'half' }),
      outro: s('intro', { extra: { choir: chant } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Gilgamesh (remix): the cup's finale, the hero's road out of Uruk.
//
// Measured (Live at Field of Vision '25, the soundboard, 628 s): 143.6 bpm in
// 4/4, a bar 1.67 s. Key: D#, phrygian (the E against the D# in nearly every
// bar: the riff grinds D#-E-D#, with the D and C# under it), D#7 colour (the
// C# and G). A C#7 stretch (272-290 s), the "swan song" passage in D# minor
// moving D#m | G#5 | B | D#5 (390-480 s), and Cm (508-520 s). Section map:
//   intro      7-30 s    the riff alone, D#-E-D#-D-C#
//   chant     60-86 s    the riff, "Gilgamesh, Gilgamesh"
//   verse    114-140 s   D#7, the riff with the G and C#
//   photon   272-290 s   C#7, "glorious photon"
//   swan     390-480 s   D#m | G#5 | B | D#5
//   drop     508-520 s   Cm | D#5
// Lap 143.6 bpm, final lap 151.6. An acid bass doubling the riff, the riff
// on a fuzz guitar, the lead on a snarl, the chant on a deep choir, chip arp
// and chip lead; the synth kit, half time in the drop.
// ---------------------------------------------------------------------------

const GIL_RIFF = 'D#2 D#2 E2 D#2 D2 C#2 D#2 A#1';
const GILGAMESH_T = {
  intro: { bars: 2, chords: ['D#5', 'D#5'], tones: ['D# E A#', 'D# E D'],
    bass: { s: 'x.xx.xx.x.x.x.x. x.xx.xx.x.x.x.x.', n: GIL_RIFF },
    riff: power('x.xx.xx.x.x.x.x. x.xx.xx.x.x.x.x.', 'D#3 D#3 E3 D#3 D3 C#3 D#3 A#2') },
  chant: { bars: 2, chords: ['D#5', 'D#5'], tones: ['D# E A#', 'D# E C#'],
    bass: { s: 'x.xx.xx.x.x.x.x. x.xx.xx.x.x.x.x.', n: GIL_RIFF },
    riff: power('x.xx.xx.x.x.x.x. x.xx.xx.x.x.x.x.', 'D#3 D#3 E3 D#3 D3 C#3 D#3 A#2'),
    lead: { s: 'X___x___X_______ X___x___X_______', n: 'D#4 D#4 A#3 D#4 D#4 C#4' } },
  verse: { bars: 2, chords: ['D#7', 'D#7'], tones: ['D# G C#', 'D# C# A#'],
    bass: { s: 'x.xx.xx.x.x.x.x. x.xx.xx.x.xxx.x.', n: 'D#2 D#2 E2 D#2 D2 C#2 D#2 A#1 D#2 D#2 E2 D#2 G2 F2 D#2 C#2 A#1' },
    riff: power('x.xx.xx.x.x.x.x. x.xx.xx.x.xxx.x.', 'D#3 D#3 E3 D#3 D3 C#3 D#3 A#2 D#3 D#3 E3 D#3 G3 F3 D#3 C#3 A#2'),
    lead: { s: '..x.x.x.x___x.x. ..x.x.x.x_______', n: 'A#4 G4 A#4 C#5 A#4 G4 F4 D#4 E4 D#4 C#4 D#4' } },
  photon: { bars: 2, chords: ['C#7', 'C#7'], tones: ['C# F B', 'C# D# B'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('C#2 C#1', 7) + ' D2 D#2' },
    riff: { s: 'xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx', n: 'C#4 F4 G#4 B4 C#5 B4 G#4 F4 C#4 D#4 G#4 B4 D#5 B4 G#4 D#4' },
    lead: { s: 'x_______x___x___ x___x___x_______', n: 'G#5 F5 D#5 C#5 B4 C#5' } },
  // The D natural grinds against the D# all through it (the riff's D, in every bar's three strongest).
  swan: { bars: 4, chords: ['D#m', 'G#5', 'B', 'D#5'], tones: ['D# D F#', 'G# D# D', 'B D# D', 'D# D C#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: each('D#2 D#1', 4) + ' ' + each('G#1 G#2', 4) + ' ' + each('B1 B2', 4) + ' ' + each('D#2 D#1', 3) + ' D2 C#2' },
    riff: power(rep('X_____x_x_x_X___', 4), 'D#3 D#3 D#3 D#3 G#2 G#2 G#2 G#2 B2 B2 B2 B2 D#3 D#3 D3 C#3'),
    lead: { s: 'x___x.x.x___x.x. x___x___x_______ x___x.x.x___x.x. x___x___x_______', n: 'F#4 D4 D#4 F#4 D#4 G#4 D5 D#5 F#4 D4 D#4 F#4 D#5 D5 C#5 D5 D#5' } },
  drop: { bars: 2, chords: ['Cm', 'D#5'], tones: ['C D# D', 'D# D C'],
    bass: { s: 'X_______x___x___ X_______x_x_x_x_', n: 'C2 C2 G1 D#2 D2 C#2 C2 A#1' },
    riff: power('X_______x___x___ X_______x_x_x_x_', 'C3 C3 G2 D#3 D3 C#3 C3 A#2') },
};

const GILGAMESH = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143.6, finalPlus: 8, mix: 0.67,
  tracks: [
    ...synthKit('D#1', { kick: 0.8 }),
    acid(),
    { name: 'guitar', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.4 }, out: 'verb' },
    { name: 'lead', engine: 'dm:snarl', params: { vol: 0.32, harm: 0.5, timb: 0.4, osc1: 0.7, osc2: 0.5, osc3: 0, osc4: 0, ultra: 0, fm: 0.2, metal: 0 }, filter: { cutoff: 0.6 }, out: 'verb', glide: 0.06 },
    voice('choir', { text: 'gil gah mesh gil gah mesh', vol: 0.52, size: 0.9 }),
    chip('chip arp', { vol: 0.24, pw: 0.25 }),
    chip('chip lead', { vol: 0.28, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'poly brass', params: { vol: 0.26 }, out: 'verb' },
    verbBus(2.2, 0.28, 0.18),
  ],
  grooves: {
    // Pounding: the kick on every beat and the off-beat sixteenth before the three.
    groove: (final) => final
      ? { kick: 'X...X..xX...X...', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
      : { kick: 'X...X..xX...X...', snare: '....X.......X...', hat: 'x.X.x.X.x.X.x.X.' },
    half: halfRave,
  },
  fill: FILL,
  order: ['intro', 'chant', 'verse', 'photon', 'chant2', 'swan', 'drop', 'chant3'],
  finalOrder: ['chant', 'verse', 'swan', 'chant2', 'photon', 'verse2', 'drop', 'chant3'],
  sections(final) {
    const T = GILGAMESH_T;
    // The riff is power chords: handed to the guitar whole, not as a line.
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o, use: { guitar: T[k].riff, ...(o.use ?? {}) } });
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    const chant = { s: T.chant.lead.s, n: T.chant.lead.n };
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half' }),
      chant: s('chant', { use: { lead: null }, extra: { choir: chant } }),
      chant2: s('chant', { use: { lead: null }, extra: { choir: chant, 'chip lead': up1('verse', 'lead') } }),
      chant3: s('chant', { use: { lead: null }, extra: { choir: chant, 'chip lead': up1('swan', 'lead') } }),
      verse: s('verse'),
      verse2: s('verse', { extra: { 'chip lead': up1('verse', 'lead') } }),
      photon: s('photon', { extra: final ? { 'chip lead': up1('photon', 'lead') } : {} }),
      swan: s('swan', { extra: { 'chip lead': up1('swan', 'lead') } }),
      drop: s('drop', { drums: 'half' }),
    };
  },
};

export const SONGS = [
  ...cue('theia', 'theia-remix', THEIA),
  ...cue('set', 'set-remix', SET),
  ...cue("chang'e", 'chang-e-remix', CHANGE),
  ...cue('gilgamesh', 'gilgamesh-remix', GILGAMESH),
];
