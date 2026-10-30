// The Float Along Cup's remixes, written in seqbaby.
//
// Eight cues, the four songs from Float Along – Fill Your Lungs (2013) the
// cup races to, each a lap cut and a faster final-lap cut (+8 bpm, busier
// drums, the hook up front):
//
//   head-on-pill-remix(-final-lap)     "Head On/Pill"
//   god-is-calling-remix(-final-lap)   "God Is Calling Me Back Home"
//   mend-the-past-remix(-final-lap)    "Let Me Mend the Past"
//   float-along-remix(-final-lap)      "Float Along – Fill Your Lungs"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json), a soundboard each: Head On/Pill
// from Live at Field of Vision II '26 (2026-08-15), God Is Calling Me Back
// Home from Live in Bulgaria '25, Let Me Mend the Past from Live in Lithuania
// '25 and Float Along – Fill Your Lungs from Live at Field of Vision '25. No
// tab could be reached, so it is the recordings alone. No audio from the
// recordings goes in: these are notes. The album is the band's garage-psych
// record (fuzz guitars, a sitar, organ, flute, two drummers on Head On/Pill),
// so the remixes are played on those: a garage kit (salamander), electric
// bass, fuzz and jangle guitars, a sitar (a plucked string through a
// waveshaper), a drawbar organ on the chords, a flute (the whistling Moog
// lead), the chants on a choir, and on top a chip arp, the chip lead taking
// its place where it plays (one track, as the browser renders it all). Each
// remix is the song's highlights in the song's own order, eight sections of
// four bars, every section handing to the next with a fill and a crash so the
// loop has no seam. The vocal lines are the measured top line where it is
// clear, and written over the measured chords in the singer's register where
// it is not; the chants are the songs' own words.
//
// How the recordings were measured: beats from percussive onsets (librosa),
// the tempo from a straight line fitted through the bar onsets of each
// stretch and checked against the onset autocorrelation, the bar line from
// where the kick lands (of four phases, or five for Float Along), the key
// from chroma (Krumhansl), each bar's chord and three strongest pitch classes
// from beat-synchronous chroma on the harmonic stem, the bass and riff lines
// per sixteenth from the strongest constant-Q bin in E1-E3 and E3-E5 on the
// harmonic stem, the vocal line from pyin, and the drum accents from
// band-limited onsets folded onto the bar.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import { cue, kit, oct, rep, section, tile4, verbBus } from './polygondwanaland-cup-songs.mjs';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** A note name `semis` up, as MIDI. */
function up(name, semis) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]] + semis;
}
/** A power chord on every hit: the root's fifth stacked on it (`roots` cycle over the hits). Two notes,
 *  not three: the fuzz fills it out, and each string costs the browser's audio thread. */
const power = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [up(r, 7)]) };
};
/** Repeat each word `k` times: `each('B1 A1', 4)` is B1 B1 B1 B1 A1 A1 A1 A1. */
const each = (words, k) => words.split(/\s+/).flatMap((w) => Array(k).fill(w)).join(' ');
/** A part repeated `k` times over (a two-bar power-chord line over a four-bar section), notes and stack cycling. */
const times = (p, k) => (p ? { ...p, s: rep(p.s, k) } : null);
/** A choir that sings `text`, one syllable a note. */
const voice = (name, { text, words, vol = 0.45, size = 0.55, voices = 3, preset } = {}) => ({
  name, engine: 'dm:vox', out: 'verb', ...(preset ? { preset } : {}),
  params: { vol, timb: size, morph: 0.25, sngvoices: voices, ...(text ? { sngtext: text } : {}), ...(words ? { sngwords: words } : {}) },
});
/** The garage kit every remix here plays, a real drummer's (salamander), with the ride. */
const garage = (vol = {}) => kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride'], vol: { hihat: 0.75, ride: 0.6, ...vol } });
const shaker = (vol = 0.36) => ({ name: 'shaker', engine: 'dm:halo', preset: 'shaker', params: { vol } });
const bass = (preset, vol = 0.85) => ({ name: 'bass', engine: 'dm:bass', preset, params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
/** The organ on the chords (section() voices each bar's measured tones on the `pad` track), the drawbars through a phaser for the spin. */
const organ = (vol = 0.3) => ({ name: 'pad', engine: 'dm:hexop', preset: 'organ', params: { vol }, out: 'verb', fx: { phaser: { wet: 0.35, rate: 0.35, depth: 0.5 } } });
/** A sitar: a plaits string, stiff and bright, ringing long, through a waveshaper for the buzz of the bridge. */
const sitar = (name, vol = 0.5) => ({
  name, engine: 'plaits:11', params: { vol, harm: 0.32, timb: 0.85, morph: 0.7, decay: 0.55 }, out: 'verb', glide: 0.03,
  fx: { shaper: { wet: 0.35, amount: 0.4 }, chorus: { wet: 0.15 } },
});
/** The video game on top: a Moog voice through an 8-bit crusher. (The other cups' chip, a snarl pulse,
 *  costs the browser's audio thread several times what a ladder does, and these remixes carry a lot.) */
const chip = (name, { vol = 0.24, lead = false } = {}) => ({
  name, engine: 'dm:ladder', preset: lead ? 'funk lead' : 'percussive', params: { vol }, out: 'verb',
  fx: { crush: { bits: 6, rate: 1, wet: 0.55 } },
});
const flute = (name = 'flute', vol = 0.38) => ({ name, engine: 'dm:ladder', preset: 'whistle', params: { vol }, out: 'verb', fx: { chorus: { wet: 0.15 } } });
/**
 * Lighter on the browser's audio thread, which renders every part in real time: the chip lead takes
 * the chip arp's place where it plays (one chip track, not two), and the organ holds two of the
 * bar's three measured tones.
 */
function lite(sec) {
  const p = sec.parts;
  if (p['chip lead']) { p['chip arp'] = p['chip lead']; delete p['chip lead']; }
  if (p.pad?.stack) p.pad = { ...p.pad, stack: p.pad.stack.map((x) => x.slice(0, 1)) };
  return sec;
}
const FILL16 = { kick: 'X.......X.......', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', shaker: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' };

// ---------------------------------------------------------------------------
// 1. Head On/Pill (remix): the band's first jam, the trip and the wrong pill.
//
// Measured (Live at Field of Vision II '26, the soundboard, 756 s): Head On
// is 131 bpm rising to 136 in 4/4, a bar 1.83 s; Pill, from 293 s, is 205
// bpm (a bar 1.17 s), its beat two-thirds of Head On's (the beat tracker
// hears Pill at 137, three of Pill's beats to two of its own). So the remix
// counts both on one pulse, a sixteenth of 102 bpm: Head On's beat is three
// of them (136 bpm), Pill's two (204 bpm), and the bars are 6/8, one Head On
// bar, or a Pill bar and a half. Key: G, with the G# and the F (the sitar's
// mode: G-G#-A in nearly every bar), and an intro in E phrygian (the F
// natural). Section map (the phrases taken, in the song's order):
//   sitar     1-29 s    the E drone, the riff F-E-D-E-B, B-D-E
//   riff     30-44 s    the G drone, the bass turn G-F-G#-A-G-F#-D#-D
//   climb    44-59 s    G-G#-A-A#-B-C, up to B7 and E
//   verse   145-155 s   the G pedal, the vocal G-B-D up to C
//   hook    152-160 s   G | G | G | F-E-C, "head on"
//   drone   217-240 s   the quiet breakdown on the G pedal
//   pill    293-310 s   Pill: the bass G-G#-A-G, the climb A-A#-B-C
//   pill2   311-317 s   the Em bar and G-F-E-C
// Lap 102 bpm (Head On 136, Pill 204), final lap 110 (147, 220). A pick
// bass, the riff on a fuzz guitar, the sitar on the top line, Stu's flute
// in Pill, "head on" on a choir, the organ on the chords, chip arp and chip
// lead; two drummers (the garage kit and a second kit's snare and floor tom)
// and a tambourine.
// ---------------------------------------------------------------------------

const HOP_T = {
  sitar: { bars: 2, chords: ['E5', 'E5'], tones: ['E F B', 'E B D'],
    bass: { s: 'X___________ X________x__', n: 'E2 E2 D#2' },
    lead: { s: 'x.xx.xxx.x.x x__x__x_____', n: 'F4 E4 D4 E4 E4 B3 E3 B3 B3 D4 E4' } },
  riff: { bars: 2, chords: ['G7', 'G5'], tones: ['G F A', 'G D E'],
    bass: { s: 'x__x__xx_xxx x___xxx_____', n: 'G2 F2 G#2 A2 G2 F#2 D#2 D2 D#2 F2 G2' },
    riff: { s: 'x__x__xx_xxx x___xxx_____', n: 'G3 F3 G#3 A3 G3 F#3 D#3 D3 D#3 F3 G3' },
    lead: { s: 'x.xx.xx.xx.x x.x.x.x_____', n: 'G4 G#4 A4 G4 D5 G4 F4 G4 D5 B4 A4 G4' } },
  climb: { bars: 4, chords: ['G', 'A7', 'B7', 'E'], tones: ['B G A', 'G A G#', 'B A D', 'B G# G'],
    bass: { s: 'x.xx.xxx.x__ x_____xx____ x_____x_____ x________xxx', n: 'G2 G#2 A2 A#2 B2 C3 B2 A2 G#2 G2 A2 B2 B2 G#2 G2 F#2' },
    gtr: power('X_____X_____ X_____X_____ X_____X_____ X___________', 'G2 C3 A2 G2 A2 B2 E2'),
    lead: { s: 'x__x__x__x__ x_____x_____ x__x__x__x__ x___________', n: 'D5 G4 D5 B4 E5 D5 D5 B4 C5 B4 E5' } },
  verse: { bars: 4, chords: ['G5', 'C5', 'G5', 'G5'], tones: ['G D G#', 'G G# C', 'G G# D#', 'G G# F#'],
    bass: { s: 'X___________ X___________ X___________ X_____x__x_x', n: 'G2 G2 G2 G2 G2 F#2 G#2' },
    gtr: power(rep('x..x..x..x..', 4), 'G2'),
    lead: { s: 'x.xx.xx.xx.x xxx.x_x_____ x.xx.xx.xx.x x_____x__x__', n: 'G4 G4 G#4 B4 D5 B4 D5 B4 B4 G4 B4 G5 C5 C5 F5 C5 E5 D5 D#5 E5 D5 D5 B4 G4' } },
  hook: { bars: 4, chords: ['G5', 'C5', 'G5', 'C5'], tones: ['G D D#', 'G B F#', 'G G# F', 'C G F'],
    bass: { s: 'X___________ X___________ X_____x_____ x.xx_______x', n: 'G2 G2 G2 G#2 F2 E2 C2 G2' },
    gtr: power('X..x..x..x.. X..x..x..x.. X..x..x..x.. X.xX________', each('G2', 12) + ' F2 E2 C2'),
    lead: { s: 'x.xx.xx_____ ............ x.xx.xx_____ ............', n: 'D5 C5 B4 C5 G4 D5 C5 B4 C5 G4' },
    chant: { s: '............ X_____X_____ ............ X_____X_____', n: 'C5 G4' } },
  drone: { bars: 4, chords: ['G5', 'G5', 'G5', 'C5'], tones: ['G D F#', 'G A G#', 'G A F#', 'C G F#'],
    bass: { s: 'X___________ X___________ X___________ x.xx________', n: 'G2 G2 G2 F2 E2 C2' },
    lead: { s: 'x..x..x..x.. x.x.x.x.x.x. x..x..x..x.. x_____x_____', n: 'D5 G4 D5 G4 A4 G4 A4 G4 A4 G4 D5 G4 D5 G4 F4 C5' } },
  // Pill's bars are eight steps here: three of them to the phrase's two bars.
  pill: { bars: 2, chords: ['G5', 'A7'], tones: ['G G# A', 'G A A#'],
    bass: { s: 'xxxxxxxxxxxx xxxxxx_x_xxx', n: 'G2 G#2 A2 G2 G2 G2 A2 G2 G2 G#2 A2 G2 G2 G2 A2 G2 G2 A2 F2 A#2 B2 C3' },
    gtr: power('x.x.x.x.x.x. x.x.x.x.x.x.', 'G2 G2 G2 G2 G2 G2 G2 G2 G2 A2 A#2 C3'),
    lead: { s: 'X_____x_____ X_____x.x.x.', n: 'E5 D5 E5 A5 G5 D5' },
    flute: { s: 'x_x_x_x_x_x_ x_x_x___x___', n: 'D5 B4 C5 G4 B4 G4 E5 C5 E5 D5' } },
  pill2: { bars: 2, chords: ['G5', 'C'], tones: ['G G# B', 'G F C'],
    bass: { s: 'xxxxxxxxxxxx xxxxx__x_xxx', n: 'G2 G#2 A2 G2 G2 G2 A2 G2 G2 G#2 A#2 A2 G2 B2 F2 E2 G2 F2 E2 C3 C2' },
    gtr: power('x.x.x.x.x.x. x.x.x.x.x.x.', 'G2 G2 G2 G2 G2 G2 G2 E2 G2 F2 E2 C3'),
    flute: { s: 'x_x_x_x_x_x_ x_x_x___x___', n: 'D5 B4 C5 G4 B4 G4 E5 C5 E5 D5' },
  },
};

const HEAD_ON_PILL = {
  meter: '6/8', spb: 12, rot: 0, bpm: 102, finalPlus: 8, mix: 0.45,
  tracks: [
    ...garage(),
    // The second drummer: another kit's snare and floor tom.
    { name: 'snare 2', engine: 'sampler', sample: 'drskit/snare', drum: true, params: { vol: 0.5 } },
    { name: 'floor', engine: 'sampler', sample: 'drskit/tom2', drum: true, params: { vol: 0.55 } },
    shaker(),
    bass('pick grind'),
    { name: 'guitar', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.42, decay: 0.5 }, out: 'verb' },
    sitar('lead', 0.55),
    flute(),
    voice('choir', { text: 'hed on hed on', vol: 0.5, size: 0.6 }),
    chip('chip arp', { vol: 0.2 }),
    organ(0.26),
    verbBus(2.4, 0.3, 0.2),
  ],
  grooves: {
    // Head On: four beats of three steps, the kick on 1 and 3, the snare on 2 and 4.
    groove: (final) => final
      ? { kick: 'X.....X.x...', snare: '...X.....X.o', hat: 'x.xx.xx.xx.x', shaker: 'xxxxxxxxxxxx', floor: '.........x.x' }
      : { kick: 'X.....x.....', snare: '...X.....X..', hat: 'x..x..x..x..', shaker: 'x.xx.xx.xx.x' },
    // Pill: beats of two steps, kick and snare in turn, both drummers on it, the floor tom on every beat.
    pill: (final) => final
      ? { kick: 'X.x.X.x.X.x.', snare: '..X...X...X.', 'snare 2': '..x.o.x.o.x.', hat: 'xxxxxxxxxxxx', floor: 'x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxx' }
      : { kick: 'X...X...X...', snare: '..X...X...X.', 'snare 2': '..x...x...x.', hat: 'xoxoxoxoxoxo', floor: 'x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X...........', snare: final ? '......X.....' : '', ride: 'x..x..x..x..', shaker: 'x..x..x..x..' }),
  },
  fill: { kick: 'X.....x.....', snare: '...x..x.rrRR', hat: 'x..x..x.....', ride: '', shaker: '', 'snare 2': '', floor: '', 'tom hi': '......x.x...', 'tom lo': '.........x.x' },
  order: ['sitar', 'riff', 'climb', 'verse', 'hook', 'drone', 'pill', 'pill2'],
  finalOrder: ['hook', 'riff', 'pill', 'climb', 'pill2', 'verse2', 'pill3', 'pill4'],
  sections(final) {
    const T = HOP_T;
    const s = (k, o = {}) => lite(section(this, { name: k, ...T[k] }, { final, ...o }));
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    const g = (k) => times(T[k].gtr, 4 / T[k].bars);
    return {
      sitar: s('sitar', { drums: 'half', use: { guitar: null } }),
      riff: s('riff', { drums: final ? 'groove' : 'half' }),
      climb: s('climb', { use: { guitar: g('climb') } }),
      verse: s('verse', { use: { guitar: g('verse') } }),
      verse2: s('verse', { use: { guitar: g('verse') }, extra: { 'chip lead': up1('verse', 'lead') } }),
      hook: s('hook', { use: { guitar: g('hook') }, extra: { choir: T.hook.chant, ...(final ? { 'chip lead': up1('hook', 'lead') } : {}) } }),
      drone: s('drone', { drums: 'half', use: { guitar: null } }),
      pill: s('pill', { drums: 'pill', use: { guitar: g('pill') }, extra: { flute: tile4(this, T.pill, 'flute') } }),
      pill2: s('pill2', { drums: 'pill', use: { guitar: g('pill2'), lead: null }, extra: { flute: tile4(this, T.pill2, 'flute') } }),
      pill3: s('pill', { drums: 'pill', use: { guitar: g('pill') }, extra: { flute: tile4(this, T.pill, 'flute'), 'chip lead': up1('pill', 'flute') } }),
      pill4: s('pill2', { drums: 'pill', use: { guitar: g('pill2'), lead: null }, extra: { flute: tile4(this, T.pill2, 'flute'), 'chip lead': up1('pill2', 'flute') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. God Is Calling Me Back Home (remix): the house on the hill, and the call.
//
// Measured (Live in Bulgaria '25, the soundboard, 358 s): 129.6 bpm in 4/4, a
// bar 1.85 s, quiet and loud alike. Key: E, a drone under nearly all of it,
// minor and mixolydian (the G and the D natural, the D# the bass circles E
// with); the call moves to A, an F# stretch climbs F#-A-G-G# back to E, and
// the end turns round on C | D | E. Section map:
//   intro      2-28 s    quiet: the acoustic on the E drone, E-D#
//   verse     30-52 s    E | A, the bass climbing G-G#-A into E
//   call      63-77 s    A | A-G | A-E | E, "then I hear God call"
//   fsharp   101-110 s   F# | F#-A | A-F# | F#-G-G#
//   jam      110-138 s   the explosion: E with the D, loud
//   egae     140-170 s   Em-G | A-E, "God is calling me back home"
//   cde      170-176 s   E-C | C-D | D-E, back to the top
// Lap 129.6 bpm, final lap 137.6. An acoustic (a plucked string) in the
// quiet part, a Motown bass, power chords on a fuzz guitar, the vocal line
// and the high-flying lead on a singing guitar, the call on a choir,
// the organ on the chords, chip arp and chip lead; the garage kit, on the
// ride once it explodes.
// ---------------------------------------------------------------------------

const GOD_T = {
  intro: { bars: 2, chords: ['E5', 'E5'], tones: ['E D# B', 'E B D'],
    bass: { s: 'X_______x_x_x___ x_x_x_x_x_______', n: 'E2 D#2 E2 D#2 E2 F#2 G2 G#2 A2' },
    acoustic: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'E3 B3 E4 D#4 E4 B3 E4 B3 E3 B3 E4 F#4 G4 F#4 E4 D#4' } },
  verse: { bars: 2, chords: ['E5', 'A5'], tones: ['E D# D', 'E D# B'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'E2 E2 D#2 D#2 E2 E2 D#2 E2 G2 G#2 E2 D#2 E2 E2 D2 D#2' },
    acoustic: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'E3 B3 E4 D#4 E4 B3 D4 B3 E3 A3 E4 D#4 E4 A3 G4 F#4' },
    lead: { s: 'x.x.x.x.x___x.x. x.x.x.x.x_______', n: 'B4 B4 B4 A4 G4 E4 G4 E4 F#4 G4 E4 D#4' } },
  call: { bars: 4, chords: ['A5', 'A7', 'A5', 'E7'], tones: ['E A D#', 'G A E', 'E A F', 'E D# D'],
    bass: { s: 'x_______x_______ x_____x_xxx___x_ x_______x_______ x_x_x_x_x_x_x_x_', n: 'E2 A2 A2 D2 G2 F#2 G2 G#2 A2 E2 E2 D#2 E2 E2 E2 E2 D#2 D2' },
    gtr: power('X_______X_______ X_______X_______ X_______X_______ X___X___X___X___', 'E2 A2 A2 G2 A2 E2 E2 E2 E2 E2'),
    chant: { s: 'x.x.x.x.x.x.X___ ................ x.x.x.x.x.x.X___ ................', n: 'E5 E5 C#5 A4 A4 B4 A4 A4 A4 G4 A4 B4 A4 E4' },
    lead: { s: 'x___x___x_x_X___ x___x___x_______ x___x___x_x_X___ x.x.x.x.x_______', n: 'E5 F#5 E5 C#5 A4 C#5 B4 G4 E5 F#5 E5 C#5 A4 B4 A4 G4 E4 D4' } },
  fsharp: { bars: 4, chords: ['F#7', 'F#m', 'F#m', 'F#5'], tones: ['F# E D#', 'F# A E', 'F# A E', 'F# G G#'],
    bass: { s: 'x_______________ x_______x_______ x_______x_______ x______xx_____x_', n: 'F#2 F#2 A2 A2 F#2 F#2 A2 G2 G#2' },
    gtr: power('X_______X_______ X_______X_______ X_______X_______ X______xX_____X_', 'F#2 F#2 F#2 A2 A2 F#2 F#2 A2 G2 G#2'),
    lead: { s: 'x___x___x_x_x___ x_x_x___x_x_x_x_ x___x___x___x___ x_______x___x___', n: 'F#5 C#5 F#5 E5 F#5 F#5 E5 C#5 C#5 A4 E5 C#5 E5 C#5 A4 F#4 F#5 G5 G#5' } },
  jam: { bars: 2, chords: ['E5', 'E7'], tones: ['E D# F', 'E D D#'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'E2 E2 E2 E2 E2 E2 D#2 E2 E2 B2 D2 C#2 E2 E2 E2 D#2' },
    gtr: power('X.x.x.x.X.x.x.x. X.x.x.x.X.x.x.x.', 'E2 E2 E2 E2 E2 E2 D#2 E2 E2 E2 D2 D2 E2 E2 E2 E2'),
    lead: { s: 'x_x_x_x_X_______ x.x.x.x.x_x_x___', n: 'B4 F#5 E5 D5 E5 B5 A5 F#5 E5 D5 E5 B4' } },
  egae: { bars: 2, chords: ['Em', 'A5'], tones: ['E G F#', 'E A B'],
    bass: { s: 'x_______x_____x_ x_x_____x_______', n: 'E2 G2 F#2 G#2 A2 E2' },
    gtr: power('X_______X_______ X_______X_______', 'E2 G2 A2 E2'),
    chant: { s: 'x.x.x.x.x.x.X___ ................', n: 'E5 E5 D5 B4 D5 B4 E4' },
    lead: { s: 'x___x.x.x___x.x. x___x___x_______', n: 'B4 G4 A4 B4 D5 E5 E5 F#5 E5' } },
  cde: { bars: 4, chords: ['C', 'D', 'E5', 'E7'], tones: ['E C D#', 'C D E', 'E D B', 'E B D#'],
    bass: { s: 'x_______x_______ x_______x_______ x_______x_______ x_x_x_x_x_x_x_x_', n: 'E2 C2 C2 D2 D2 E2 E2 E2 D#2 E2 E2 E2 D2 D#2' },
    gtr: power('X_______X_______ X_______X_______ X_______X_______ X.x.x.x.X.x.x.x.', 'E2 C2 C2 D2 D2 E2 E2 E2 E2 E2 E2 E2 D2 D#2'),
    lead: { s: 'x_______x_______ x_______x_______ x_______x_______ x.x.x.x.x___x___', n: 'E5 G5 G5 A5 A5 B5 B5 A5 G5 E5 D5 E5' } },
};

const GOD = {
  meter: '4/4', spb: 16, rot: 0, bpm: 129.6, finalPlus: 8, mix: 0.67,
  tracks: [
    ...garage(),
    shaker(0.32),
    bass('motown'),
    { name: 'guitar', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.44, decay: 0.5 }, out: 'verb' },
    { name: 'acoustic', engine: 'plaits:11', params: { vol: 0.55, harm: 0.08, timb: 0.6, morph: 0.55, decay: 0.55 }, out: 'verb', comp: { threshold: -24, ratio: 4, release: 0.1 } },
    { name: 'lead', engine: 'dm:guitar', preset: 'singing lead', params: { vol: 0.38, decay: 0.7 }, out: 'verb', fx: { delay: { sync: true, div: 0.75, fbk: 0.3, wet: 0.15 } } },
    voice('choir', { text: 'god iz call ing mee bak hohm', vol: 0.5, size: 0.65 }),
    chip('chip arp', { vol: 0.2 }),
    organ(0.28),
    verbBus(2.2, 0.3, 0.18),
  ],
  grooves: {
    quiet: (final) => final
      ? { kick: 'X.......X.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' }
      : { kick: 'X...............', hat: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' },
    groove: (final) => final
      ? { kick: 'X.....x.X.x.....', snare: '....X.......X..o', hat: 'xoxoXoxoxoxoXoxo', shaker: 'x.x.x.x.x.x.x.x.' }
      : { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' },
    // Exploded: the ride and the open hat, the kick pushing.
    loud: (final) => final
      ? { kick: 'X.x...x.X.x...x.', snare: '....X..o....X..o', ride: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
      : { kick: 'X.....x.X.x.....', snare: '....X.......X...', ride: 'x.X.x.X.x.X.x.X.', 'open hat': '......x.......x.' },
  },
  fill: FILL16,
  order: ['intro', 'verse', 'call', 'fsharp', 'jam', 'egae', 'call2', 'cde'],
  finalOrder: ['call', 'jam', 'egae', 'fsharp', 'jam2', 'verse', 'egae2', 'cde'],
  sections(final) {
    const T = GOD_T;
    const s = (k, o = {}) => lite(section(this, { name: k, ...T[k] }, { final, ...o }));
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    const g = (k) => times(T[k].gtr, 4 / T[k].bars);
    const ac = (k) => tile4(this, T[k], 'acoustic');
    return {
      intro: s('intro', { drums: 'quiet', use: { guitar: null }, extra: { acoustic: ac('intro') } }),
      verse: s('verse', { drums: final ? 'groove' : 'quiet', use: { guitar: null }, extra: { acoustic: ac('verse') } }),
      call: s('call', { use: { guitar: g('call'), lead: null }, extra: { choir: T.call.chant, ...(final ? { 'chip lead': up1('call', 'lead') } : {}) } }),
      call2: s('call', { drums: 'loud', use: { guitar: g('call') }, extra: { choir: T.call.chant } }),
      fsharp: s('fsharp', { drums: 'loud', use: { guitar: g('fsharp') } }),
      jam: s('jam', { drums: 'loud', use: { guitar: g('jam') } }),
      jam2: s('jam', { drums: 'loud', use: { guitar: g('jam') }, extra: { 'chip lead': up1('jam', 'lead') } }),
      egae: s('egae', { drums: 'loud', use: { guitar: g('egae'), lead: null }, extra: { choir: tile4(this, T.egae, 'chant') } }),
      egae2: s('egae', { drums: 'loud', use: { guitar: g('egae') }, extra: { choir: tile4(this, T.egae, 'chant'), 'chip lead': up1('egae', 'lead') } }),
      cde: s('cde', { drums: 'loud', use: { guitar: g('cde') }, extra: final ? { 'chip lead': up1('cde', 'lead') } : {} }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Let Me Mend the Past (remix): Ambrose's song, the family at his nan's.
//
// Measured (Live in Lithuania '25, the soundboard, 184 s): 101 bpm in 4/4, a
// bar 2.39 s, straight eighths. Key: D major and its B minor: the verse
// Bm | Bm | A | A | G | A | Bm | D, the bass walking D-C#-B under the Bm;
// the chorus climbing D | E | F# | Gm to a held A, the top line F#-A#-A
// with it ("let me mend the past"); the bridge F#m | Bm | D | Bm; and the end
// Bm on the D pedal into G and F#7. Section map:
//   intro      3-17 s    the keys alone
//   versea    19-29 s    Bm | Bm | A | A
//   verseb    29-38 s    G | A | Bm | D
//   chorusa   55-64 s    D | E | Bm | A-G
//   chorusb   64-76 s    D | E | F# | Gm, to the A
//   bridge   136-146 s   F#m | Bm | D | Bm
//   coda     158-177 s   Bm | Bm/D | G/D | F#7
// Lap 101 bpm, final lap 109. A Motown bass, the chords broken on an
// electric piano (Ambrose's keys) and held on the organ, the vocal line on a
// singing guitar, doo-wop backing voices, chip arp and chip lead; the garage
// kit, the ride in the chorus.
// ---------------------------------------------------------------------------

const MEND_T = {
  versea: { bars: 4, chords: ['Bm', 'Bm', 'A', 'A'], tones: ['D B C#', 'D C# B', 'A E F#', 'A E G#'],
    bass: { s: 'x___x_xx___x____ x___x_x_x___x_xx x___x_x__x__x_x_ x_______x___x_x_', n: 'D2 B1 C#2 D2 B1 D2 B1 C#2 D2 B1 D2 F#2 A1 F#1 A1 A1 C#2 D2 A1 A1 G#1 F#1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'B3 D4 F#4 D4 B3 D4 F#4 D4 B3 D4 F#4 C#4 B3 D4 F#4 D4 A3 C#4 E4 C#4 A3 C#4 E4 C#4 A3 C#4 E4 F#4 A3 C#4 E4 G#3' },
    lead: { s: 'x_____x_x_x_x___ x_____x_x_______ x_x_x_______x_x_ ....x_______x_x_', n: 'D4 B4 B4 B4 F#4 D4 B3 F#4 A4 A4 G#4 E4 E4 E4 E4 E4' } },
  verseb: { bars: 4, chords: ['G', 'A', 'Bm', 'D'], tones: ['G D B', 'A E C#', 'D B A', 'D A D#'],
    bass: { s: 'x___x_x_x_x_x_xx x___x_x__x__x_x_ x___x_xx___x____ x______xxxxxx___', n: 'G1 D2 G1 F#1 G#1 G1 A1 G#1 A1 F#1 A1 A1 C#2 D2 D2 B1 C#2 D2 B1 D2 A2 G#2 G2 G#2 G2 D#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'G3 B3 D4 B3 G3 B3 D4 B3 A3 C#4 E4 C#4 A3 C#4 E4 C#4 B3 D4 F#4 D4 B3 D4 F#4 D4 D4 F#4 A4 F#4 D4 F#4 A4 F#4' },
    lead: { s: 'x_____x_____x_x_ x_____x_____x___ x_____x_x_x_x___ x_______x_x_x___', n: 'G4 F#4 F4 D4 F4 A4 C#5 D4 B4 B4 B4 F#4 A4 F#4 E4 D4' } },
  chorusa: { bars: 4, chords: ['D', 'E', 'Bm', 'A7'], tones: ['D A D#', 'E D# C#', 'B G F#', 'G A D'],
    bass: { s: 'x_______xxxxx___ x_______________ x_________x_x___ x___x_______x_x_', n: 'D2 A2 G#2 G2 G#2 G2 E2 B1 D2 F#2 A1 A1 G1 G1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'D4 F#4 A4 F#4 D4 F#4 A4 F#4 E4 G#4 B4 G#4 E4 G#4 B4 G#4 B3 D4 F#4 D4 B3 D4 F#4 D4 A3 C#4 E4 C#4 G3 B3 D4 B3' },
    lead: { s: '..x.x.x.X_______ ..x.x.x.X_______ ....x.x.x_______ ....x_______x_x_', n: 'A4 A4 B4 A4 B4 B4 C#5 B4 F#4 F4 B3 F#4 E4 E4' },
    doo: { s: 'X_______X_______ X_______X_______ X_______X_______ X_______X_______', n: 'F#4 F#4 G#4 G#4 F#4 F#4 E4 D4' } },
  chorusb: { bars: 4, chords: ['D', 'E', 'F#', 'Gm'], tones: ['D A D#', 'E B D#', 'F# F E', 'G A# A'],
    bass: { s: 'x_______________ x_______________ x_______________ x___________x_x_', n: 'D2 E2 F#2 G2 G#2 A2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'D4 F#4 A4 F#4 D4 F#4 A4 F#4 E4 G#4 B4 G#4 E4 G#4 B4 G#4 F#4 A#4 C#5 A#4 F#4 A#4 C#5 A#4 G4 A#4 D5 A#4 A3 C#4 E4 A4' },
    lead: { s: 'x.x.x.X_________ x.x.x.X_________ x.x.x.X_________ X_______x.x.x.x.', n: 'A3 D4 E4 F#4 B3 E4 F#4 G#4 C#4 F#4 G#4 A#4 A#4 A4 A#4 A4 A4' },
    doo: { s: 'X_______X_______ X_______X_______ X_______X_______ X_______X_______', n: 'F#4 F#4 G#4 G#4 A#4 A#4 A#4 A4' } },
  bridge: { bars: 4, chords: ['F#m', 'Bm', 'D', 'Bm'], tones: ['A F# E', 'D C# B', 'A C# D', 'D C# B'],
    bass: { s: 'x_________x_x_x_ x___xxx_x___x___ x_______x___xxx_ x___xxx_x___x___', n: 'A1 G#1 G1 C#2 D2 C#2 B1 D2 C#2 B1 A1 A1 F#2 F2 D2 D2 C#2 B1 D2 C#2 B1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'F#3 A3 C#4 A3 F#3 A3 C#4 E4 B3 D4 F#4 D4 B3 D4 F#4 C#4 D4 F#4 A4 F#4 D4 F#4 A4 C#5 B3 D4 F#4 D4 B3 D4 F#4 C#4' },
    lead: { s: 'x_x_x___x_x_X___ x_______x_x_x___ x_x_x___x_x_X___ x_______x___x___', n: 'A4 A4 F#4 E4 F#4 E4 D5 C#5 B4 C#5 A4 A4 D5 E5 D5 C#5 B4 A4 F#4' },
    doo: { s: 'X_______X_______ X_______X_______ X_______X_______ X_______X_______', n: 'C#4 C#4 D4 D4 F#4 F#4 D4 D4' } },
  coda: { bars: 4, chords: ['Bm', 'Bm', 'G5', 'F#7'], tones: ['B D F#', 'D B F#', 'D G B', 'C# D E'],
    bass: { s: 'X_______________ X_______________ X_______x_______ X_______x___x___', n: 'B1 D2 G1 D2 F#1 C#2 A#1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'B3 D4 F#4 D4 B3 D4 F#4 D4 D4 F#4 B4 F#4 D4 F#4 B4 F#4 G3 B3 D4 B3 G3 B3 D4 B3 F#3 A#3 C#4 E4 F#4 E4 C#4 A#3' },
    lead: { s: 'x_______x_x_x___ x_______________ x_______x_x_x___ x_______x_______', n: 'F#4 B4 A4 F#4 D4 G4 B4 A4 G4 F#4 E4' } },
};

const MEND = {
  meter: '4/4', spb: 16, rot: 0, bpm: 101, finalPlus: 8, mix: 0.66,
  tracks: [
    ...garage(),
    shaker(0.3),
    bass('motown'),
    { name: 'keys', engine: 'dm:hexop', preset: 'e.piano', params: { vol: 0.4 }, out: 'verb', fx: { chorus: { wet: 0.25 } } },
    { name: 'lead', engine: 'dm:guitar', preset: 'singing lead', params: { vol: 0.36, decay: 0.7 }, out: 'verb', fx: { delay: { sync: true, div: 0.75, fbk: 0.3, wet: 0.18 } } },
    voice('doo', { words: 'doo wop', preset: 'doo wop', vol: 0.38, voices: 2 }),
    chip('chip arp', { vol: 0.18 }),
    organ(0.24),
    verbBus(2.8, 0.32, 0.2),
  ],
  grooves: {
    // The ballad: the kick on 1 and the and of 2, the backbeat, eighths on the hat.
    groove: (final) => final
      ? { kick: 'X.....x.X.x.....', snare: '....X.......X..o', hat: 'x.x.x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxxxxxx' }
      : { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' },
    ride: (final) => ({ kick: final ? 'X.....x.X.x.....' : 'X.....x.X.......', snare: '....X.......X...', ride: final ? 'x.xxx.xxx.xxx.xx' : 'x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' }),
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', ride: 'x...x...x...x...' }),
    none: () => ({}),
  },
  fill: FILL16,
  order: ['intro', 'versea', 'verseb', 'chorusa', 'chorusb', 'versea2', 'bridge', 'coda'],
  finalOrder: ['chorusa', 'chorusb', 'versea', 'verseb', 'chorusa2', 'chorusb2', 'bridge', 'coda'],
  sections(final) {
    const T = MEND_T;
    const s = (k, o = {}) => lite(section(this, { name: k, ...T[k] }, { final, ...o, use: { guitar: null, ...(o.use ?? {}) }, extra: { keys: T[k].riff, ...(o.extra ?? {}) } }));
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    return {
      intro: s('versea', { drums: 'none', crash: false, use: { lead: null, bass: null } }),
      versea: s('versea', { drums: 'half' }),
      versea2: s('versea', { extra: { 'chip lead': up1('versea', 'lead') } }),
      verseb: s('verseb'),
      chorusa: s('chorusa', { drums: 'ride', extra: { doo: T.chorusa.doo, ...(final ? { 'chip lead': up1('chorusa', 'lead') } : {}) } }),
      chorusa2: s('chorusa', { drums: 'ride', extra: { doo: T.chorusa.doo, 'chip lead': up1('chorusa', 'lead') } }),
      chorusb: s('chorusb', { drums: 'ride', extra: { doo: T.chorusb.doo } }),
      chorusb2: s('chorusb', { drums: 'ride', extra: { doo: T.chorusb.doo, 'chip lead': up1('chorusb', 'lead') } }),
      bridge: s('bridge', { extra: { doo: T.bridge.doo } }),
      coda: s('coda', { drums: 'half' }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Float Along – Fill Your Lungs (remix): the cup's finale, in 5/4.
//
// Measured (Live at Field of Vision '25, the soundboard, 713 s): 142.5 bpm in
// 5/4, a bar 2.12 s; the bar halves (1.06 s, five eighths each) are the old
// Ford's lights-on chime, the kick on 1 and the and of 3, the accents on the
// and of 2 and on 5. Key: D, the drop-D drone under nearly all of it, the
// riff falling D-C#-C-B over it; "I saw you" moves Bm | G | G | Bm on the D
// pedal after a bass walk D-A-G-F#-F-E; the chorus ("float along and fill
// your lungs") is C-G-B | D twice, the bass walking C-G-A-A#-B; the long jam
// grinds D against D#; and the coda is Bm | D-C-G-A, quiet. Section map:
//   intro     47-60 s    the D drone, the riff alone
//   riff      62-95 s    the riff with the band
//   lungs     95-106 s   the walk, Bm | G | Bm on the D pedal
//   verse    106-118 s   D, the vocal on F#-E, "breathe a deep breath"
//   chorus   238-255 s   C-G-B | D | C-G-B | D, "float along and fill your lungs"
//   jam      426-440 s   D with the D#, loud (the metal jam)
//   coda     560-575 s   Bm | D-C-G-A, quiet
// Lap 142.5 bpm, final lap 150.5. A bass on fingers, the riff on a jangle
// guitar (a droning twelve-string), fuzz power chords in the jam, the vocal
// line on the flute, the chorus on a choir, the organ on the chords, chip arp
// and chip lead; the garage kit in five, the ride in the chorus.
// ---------------------------------------------------------------------------

const FLOAT_RIFF = 'x_x_x_x___x_x_x_x___';
const FLOAT_T = {
  intro: { bars: 2, chords: ['D5', 'D5'], tones: ['D A C#', 'D A E'],
    bass: { s: 'X___________________ X___________________', n: 'D2 D2' },
    riff: { s: FLOAT_RIFF + ' ' + FLOAT_RIFF, n: 'D4 A4 D5 C#5 D4 A4 C5 B4 D4 A4 D5 C#5 D4 A4 B4 A4' } },
  riff: { bars: 2, chords: ['D5', 'D7'], tones: ['D A C#', 'D A C'],
    bass: { s: 'x_____x___x_____x___ x_____x___x_____x_x_', n: 'D2 D3 D2 A2 D2 D3 D2 C#2 C2' },
    riff: { s: FLOAT_RIFF + ' ' + FLOAT_RIFF, n: 'D4 A4 D5 C#5 D4 A4 C5 B4 D4 A4 D5 C#5 D4 A4 B4 A4' },
    gtr: power('X_________X_________ X_________X_______x_', 'D2 D2 D2 D2 C2') },
  lungs: { bars: 4, chords: ['D', 'Bm', 'G', 'Bm'], tones: ['C# D B', 'B D A', 'A B G', 'F# D G'],
    bass: { s: 'x____x__x_xxx___x___ X___________________ X___________________ X_______________x_x_', n: 'D3 A2 G2 F#2 F2 E2 D#2 D2 D2 D2 C#2 A1' },
    riff: { s: rep(FLOAT_RIFF, 4), n: 'D4 A4 D5 C#5 C#4 A4 B4 A4 B3 D4 F#4 A4 B3 D4 F#4 D4 G3 B3 D4 B4 G3 B3 D4 A4 B3 D4 F#4 B4 B3 D4 F#4 A4' },
    lead: { s: '................x_x_ X_______x___x_______ x___x_x_x___x_x_x___ x_______x___x___x___', n: 'A4 B4 B4 B4 A4 B4 A4 B4 D5 G4 A4 G4 F#4 G4 B4 D5' } },
  verse: { bars: 2, chords: ['D', 'D'], tones: ['E D F#', 'D E F#'],
    bass: { s: 'x_____x___x_____x___ x_____x___x_____x___', n: 'D2 D3 D2 A2 D2 D3 D2 A2' },
    riff: { s: FLOAT_RIFF + ' ' + FLOAT_RIFF, n: 'D4 A4 D5 C#5 D4 A4 C5 B4 D4 A4 D5 C#5 D4 A4 B4 A4' },
    lead: { s: 'x___x_x_x___x_x_x___ x___x_x_x___x_x_x_x_', n: 'D5 F#4 E4 F#4 F#4 E4 F#4 F#4 F#4 E4 F#4 B4 D5 D5 A4' } },
  chorus: { bars: 4, chords: ['Cmaj7', 'D', 'Cmaj7', 'D'], tones: ['B G C', 'D A F#', 'C B G', 'D A C#'],
    bass: { s: 'x_____x___x_x_______ x________________x_x x_____x__xxx________ x___________________', n: 'C2 G2 D2 B1 D2 C#2 A1 C2 G2 G#2 A2 B1 D2' },
    riff: { s: rep(FLOAT_RIFF, 4), n: 'C4 G4 C5 B4 G3 D4 B4 G4 D4 A4 D5 C#5 D4 A4 F#4 A4 C4 G4 C5 B4 G3 D4 A4 B4 D4 A4 D5 C#5 D4 A4 C5 A4' },
    gtr: power('X_____X___X_X_______ X___________________ X_____X___X_X_______ X_______________x_x_', 'C3 G2 D3 B2 D3 C3 G2 D3 B2 D3 C3 C#3'),
    lead: { s: 'x_x_x_x_x___x_______ x_______________x_x_ x_x_x_x_x___x_______ x___________x_x_x___', n: 'B4 B4 C5 A4 G4 F#4 F#4 D5 D5 A4 G4 G4 C5 G4 F#4 A4 F#4 E5 D5' },
    chant: { s: 'x_x_x_x_x___x_______ X___________________ x_x_x_x_x___x_______ X___________________', n: 'B4 B4 C5 A4 G4 F#4 F#4' } },
  jam: { bars: 2, chords: ['D5', 'D5'], tones: ['D D# C#', 'D D# A'],
    bass: { s: 'x__x_________xxxx_xx x__xxx_x_x_____x_xx_', n: 'D#2 D2 D#2 D2 D#2 C#2 D2 D#2 D#2 D2 D#2 D2 D#2 D2 C#2 C2 D2' },
    gtr: power('X__x_________xxxx_xx X__xxx_x_x_____x_xx_', 'D#2 D2 D#2 D2 D#2 C#2 D2 D#2 D#2 D2 D#2 D2 D#2 D2 C#2 C2 D2'),
    lead: { s: 'x___x___x___x___x___ x_x_x_x_x_x_x_x_x___', n: 'A#4 A4 A#4 C5 A#4 F5 F5 A#4 A#4 A#4 A4 A4 A#4 A4' } },
  coda: { bars: 2, chords: ['Bm', 'D7'], tones: ['D B A', 'D C A'],
    bass: { s: 'x___x___x___________ x______xx_____x__xx_', n: 'B1 B2 D2 D2 C#2 C2 G2 A1 A#1' },
    riff: { s: FLOAT_RIFF + ' ' + FLOAT_RIFF, n: 'B3 F#4 B4 A4 D4 F#4 A4 F#4 D4 A4 C5 A4 C4 G4 A4 A#4' },
    lead: { s: 'x_______x___x_______ x_______x___x___x___', n: 'F#5 E5 D5 C5 A4 G4 A4' } },
};

const FLOAT = {
  meter: '5/4', spb: 20, rot: 0, bpm: 142.5, finalPlus: 8, mix: 0.57,
  tracks: [
    ...garage(),
    shaker(0.32),
    bass('svt fingers'),
    { name: 'guitar', engine: 'dm:guitar', preset: 'jangle', params: { vol: 0.42, decay: 0.45 }, out: 'verb', fx: { chorus: { wet: 0.35, rate: 0.3, depth: 0.5 } } },
    { name: 'fuzz', engine: 'dm:guitar', preset: 'brit stack', params: { vol: 0.42, decay: 0.5 }, out: 'verb' },
    flute('lead', 0.38),
    voice('choir', { text: 'float a long and fill yor lungs', vol: 0.5, size: 0.55 }),
    chip('chip arp', { vol: 0.2 }),
    organ(0.28),
    verbBus(3.2, 0.34, 0.2),
  ],
  grooves: {
    // In five, the chime's two halves: the kick on 1 and the and of 3, the snare on the and of 2 and on 5.
    groove: (final) => final
      ? { kick: 'X.....x...X.....x...', snare: '......X.........X..o', hat: 'x.X.x.x.X.x.X.x.x.X.', shaker: 'xxxxxxxxxxxxxxxxxxxx' }
      : { kick: 'X.........X.........', snare: '......x.........X...', hat: 'x.x.x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.x.x.' },
    ride: (final) => ({ kick: final ? 'X.....x...X.....x...' : 'X.........X.........', snare: '......x.........X...', ride: final ? 'x.xxx.xxx.x.xxx.xxx.' : 'x.x.x.x.x.x.x.x.x.x.', shaker: 'x.x.x.x.x.x.x.x.x.x.' }),
    // The metal jam: the kick doubled up under the grind.
    metal: (final) => ({ kick: final ? 'XxX.XxX.X.XxX.XxX.X.' : 'X.x.X.x.X.X.x.X.x.X.', snare: '......X.........X...', ride: 'x...x...x...x...x...', 'open hat': '..x.......x.........' }),
    half: (final) => ({ kick: 'X.........X.........', snare: final ? '................X...' : '', ride: 'x...x...x...x...x...', shaker: 'x...x...x...x...x...' }),
  },
  fill: { kick: 'X.........X.........', snare: '......x...x.x.x.rrRR', hat: 'x.x.x.x.x.x.........', 'open hat': '', ride: '', shaker: '', 'tom hi': '..........x.x.......', 'tom lo': '..............x.x...' },
  order: ['intro', 'riff', 'lungs', 'verse', 'chorus', 'jam', 'coda', 'chorus2'],
  finalOrder: ['chorus', 'riff', 'jam', 'chorus2', 'lungs', 'jam2', 'verse', 'chorus3'],
  sections(final) {
    const T = FLOAT_T;
    const s = (k, o = {}) => lite(section(this, { name: k, ...T[k] }, { final, ...o }));
    const up1 = (k, line) => oct(tile4(this, T[k], line), 1);
    const g = (k) => times(T[k].gtr, 4 / T[k].bars);
    const chant = T.chorus.chant;
    return {
      intro: s('intro', { drums: 'half' }),
      riff: s('riff', { extra: { fuzz: g('riff') } }),
      lungs: s('lungs'),
      verse: s('verse', { extra: final ? { 'chip lead': up1('verse', 'lead') } : {} }),
      chorus: s('chorus', { drums: 'ride', extra: { fuzz: g('chorus'), choir: chant, ...(final ? { 'chip lead': up1('chorus', 'lead') } : {}) } }),
      chorus2: s('chorus', { drums: 'ride', use: { lead: null }, extra: { fuzz: g('chorus'), choir: chant, 'chip lead': up1('chorus', 'lead') } }),
      chorus3: s('chorus', { drums: 'ride', extra: { fuzz: g('chorus'), choir: chant, 'chip lead': up1('chorus', 'riff') } }),
      jam: s('jam', { drums: 'metal', use: { guitar: null }, extra: { fuzz: g('jam') } }),
      jam2: s('jam', { drums: 'metal', use: { guitar: null }, extra: { fuzz: g('jam'), 'chip lead': up1('jam', 'lead') } }),
      coda: s('coda', { drums: 'half' }),
    };
  },
};

export const SONGS = [
  ...cue('head on/pill', 'head-on-pill-remix', HEAD_ON_PILL),
  ...cue('god is calling me back home', 'god-is-calling-remix', GOD),
  ...cue('let me mend the past', 'mend-the-past-remix', MEND),
  ...cue('float along', 'float-along-remix', FLOAT),
];
