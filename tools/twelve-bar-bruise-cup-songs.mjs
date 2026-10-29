// The 12 Bar Bruise Cup's remixes, written in seqbaby.
//
// Eight cues, the four songs from 12 Bar Bruise (2012) the cup races to,
// each a lap cut and a faster final-lap cut (+8 bpm, busier drums, the hook
// up front):
//
//   elbow-remix(-final-lap)               "Elbow"
//   muckraker-remix(-final-lap)           "Muckraker"
//   cut-throat-boogie-remix(-final-lap)   "Cut Throat Boogie"
//   sea-of-trees-remix(-final-lap)        "Sea of Trees"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json): Elbow from Live at Red Rocks
// '24, Muckraker from the band's 2013 set live in PBS 106.7 FM's studio,
// Cut Throat Boogie from the Live in Barcelona '25 soundboard and Sea of
// Trees from Live At Red Rocks '22. The riffs and chords are checked against
// the tabs on Ultimate Guitar (Elbow, Muckraker, Sea of Trees; Cut Throat
// Boogie has no free tab, so it is the recording alone). No audio from the
// recordings goes in: these are notes. Each remix is the song's highlights
// in the song's own order, eight sections of four bars, every section
// handing to the next with a fill and a crash so the loop has no seam, in
// the band's key and feel. The vocal lines are written over the measured
// chords in the singer's register, not transcribed; the chants ("hey", "oh
// no", "muckraker") are the song's own words.
//
// How the recordings were measured: tempo and beats from percussive onsets
// (librosa), the bar line from where the kick lands, the key from chroma
// (Krumhansl), each bar's chord and three strongest pitch classes from
// beat-synchronous chroma on the harmonic stem, the bass and riff lines per
// sixteenth from the strongest constant-Q bin in E1-E3 and E3-E5, and the
// drum accents from band-limited percussive onsets. The tabs settle what the
// recordings blur: which notes the riffs walk, and the voicings.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import { chip, cue, kit, oct, rep, section, tile4, verbBus } from './polygondwanaland-cup-songs.mjs';

/** A power chord on every hit: the root's fifth and octave stacked on it (`roots` cycle over the hits). */
const power = (s, roots, { fifth = true } = {}) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => (r === '-' ? [] : fifth ? [up(r, 7), up(r, 12)] : [up(r, 12)])) };
};
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** A note name `semis` up, as MIDI. */
function up(name, semis) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]] + semis;
}
/** Repeat each word `k` times: `each('B1 A1', 4)` is B1 B1 B1 B1 A1 A1 A1 A1. */
const each = (words, k) => words.split(/\s+/).flatMap((w) => Array(k).fill(w)).join(' ');
/** A vox track that sings `text` (one syllable a note) or a `words` phrase. */
const voice = (name, { text, words, vol = 0.42, size = 0.6, voices = 3, preset } = {}) => ({
  name, engine: 'dm:vox', out: 'verb', ...(preset ? { preset } : {}),
  params: { vol, timb: size, morph: 0.25, sngvoices: voices, ...(text ? { sngtext: text } : {}), ...(words ? { sngwords: words } : {}) },
});

// ---------------------------------------------------------------------------
// 1. Elbow (remix): the band room on a Saturday night.
//
// Measured (Live at Red Rocks '24, 192 s): beats of 0.627 s with eighth-note
// chugs inside them, the kick on 1 and 3 of the punk beat, so 192 bpm in
// cut time; written here as 96 bpm in sixteenths (a bar here is two of the
// song's). Key: E (major, the A in every bar: E with the riff's A to G#, and
// the D# the bass circles E with),
// the IV on A, and the outro a whole step down in D, as the tab says. The
// bass sits on E2 with A1-A#1 pickups into it; the melodic riff walks G#-A-B
// on the low strings (the tab's 4-5-7-5-4), the second time up to C#.
// Section map (the phrases taken, in the song's order):
//   intro    0.8-21 s    the E chord struck and the melodic riff
//   verse   21.0-41 s    the E chug with gaps ("you want... you got...")
//   hey     41.2-56 s    E | A, the chant
//   riff2   56.4-79 s    the melodic riff, up to C# the second time
//   solo    79.2-101 s   the little solo, A-A#-C-A#-A on top
//   quiet  109.3-138 s   the verse riff palm muted, quieter
//   outro  151.2-178 s   down to D, the solo on D-E-F#, flanged
// then the chant again in E to turn back to the top.
// Lap 96 bpm, final lap 104. A pop punk bass, the riff on a grunge guitar,
// the solo on a fuzz lead, the "hey" on a shouting choir, chip arp and chip
// lead; salamander drums (a garage rock kit).
// ---------------------------------------------------------------------------

/** The bass bar measured under the verses (0.8-3.1 s and on): E2 with the D# under it, down A1-A#1-A1-G#1, and back up E2-F2. */
const ELBOW_WALK = { s: 'x__x_xxx.xxx____ x__x_xxx.xxx____', n: 'E2 D#2 A1 A#1 A1 G#1 E2 F2' };
const ELBOW_T = {
  intro: { bars: 2, chords: ['E', 'E'], tones: ['E G# A', 'E D# A'],
    bass: { s: 'X_______________ x_x_X_______x_x_', n: 'E2 A1 A#1 E2 G#1 A#1' },
    riff: { s: 'x.x.x.x.x.x.x... x.x.x.x.x.xxx.x.', n: 'G#3 A3 B3 A3 G#3 A3 G#3 G#3 A3 B3 A3 G#3 A3 A3 F#3 E3' },
    gtr: power('X_______________ ................', 'E3') },
  verse: { bars: 2, chords: ['E', 'E'], tones: ['E D# A', 'E G# A'],
    bass: ELBOW_WALK,
    gtr: power('xxxxxx....xxxxxx xxxxxx....xxxxx.', 'E3'),
    lead: { s: '....x_x_........ ....x_x_....x.x.', n: 'B3 E4 B3 E4 G#4 E4' } },
  hey: { bars: 2, chords: ['E', 'A'], tones: ['E G# B', 'A C# E'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('E2', 8) + ' ' + each('A1', 6) + ' A1 A#1' },
    gtr: power('xxxxxxxxxxxxxx.X xxxxxxxxxxxxxx.X', 'E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 E3 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 B2'),
    lead: { s: '..X...X...X..... ..X...X...X.....', n: 'B4 B4 B4 C#5 C#5 C#5' } },
  riff2: { bars: 2, chords: ['E', 'E'], tones: ['E G# A', 'E D# A'],
    bass: ELBOW_WALK,
    riff: { s: 'x.x.x.x.x.x.x... x.x.x.x.x.x.x...', n: 'G#3 A3 B3 A3 G#3 A3 G#3 G#3 A3 B3 C#4 B3 A3 G#3' } },
  solo: { bars: 2, chords: ['E', 'E'], tones: ['E A C', 'E A# D#'],
    bass: ELBOW_WALK,
    gtr: power('xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx', 'E3'),
    lead: { s: 'x.x.x.x.x.x.x... x.x.x.x.x.x.x...', n: 'A4 A#4 C5 A#4 A4 A#4 A4 A4 A#4 C5 D#5 C5 A#4 A4' } },
  outro: { bars: 2, chords: ['D', 'D'], tones: ['D F# A', 'D A C#'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('D2', 14) + ' C2 C#2' },
    gtr: power('xxxxxx....xxxxxx xxxxxx....xxxxx.', 'D3'),
    lead: { s: 'x_x.x.x.x___x.x_ x_x.x.x___x.x___', n: 'D4 E4 F#4 F#4 F#4 E4 F#4 E4 F#4 F#4 F#4 E4 D4' } },
};

const ELBOW = {
  meter: '4/4', spb: 16, rot: 0, bpm: 96, finalPlus: 8, mix: 0.92,
  tracks: [
    ...kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2'], vol: { hihat: 0.8 } }),
    { name: 'bass', engine: 'dm:bass', preset: 'pop punk', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'grunge', params: { vol: 0.5 }, out: 'verb', fx: { flanger: { wet: 0.22 } } },
    { name: 'riff', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.5 }, out: 'verb' },
    { name: 'lead', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.42 }, out: 'verb', fx: { flanger: { wet: 0.35 } } },
    voice('hey', { text: 'hey', vol: 0.5, size: 0.55, voices: 6 }),
    chip('chip arp', { vol: 0.26, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.3 }, out: 'verb' },
    verbBus(1.6, 0.26, 0.22),
  ],
  grooves: {
    // The punk beat, two of its bars to each of these: kick on 1 and 3, the snare on 2 and 4, eighths on the hat.
    groove: (final) => final
      ? { kick: 'X.x.x...X.x.x...', snare: '..X...X...X..oX.', hat: 'XoxoXoxoXoxoXoxo' }
      : { kick: 'X...x...X...x...', snare: '..X...X...X...X.', hat: 'xoxoxoxoxoxoxoxo' },
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', hat: 'x.x.x.x.x.x.x.x.' }),
  },
  fill: { kick: 'X...x...........', snare: '..X...X.x.x.rrRR', hat: 'x.x.x.x.........', 'tom hi': '........x.......', 'tom lo': '..........x.....' },
  order: ['intro', 'verse', 'hey', 'riff2', 'solo', 'quiet', 'outro', 'hey2'],
  finalOrder: ['hey', 'riff2', 'verse', 'solo', 'hey2', 'quiet', 'outro', 'hey3'],
  sections(final) {
    const T = ELBOW_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const g = (k) => T[k].gtr;
    const chant = (k) => ({ s: T[k].lead.s, n: T[k].lead.n });
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', use: { guitar: g('intro'), lead: null, riff: 'riff' } }),
      verse: s('verse', { use: { guitar: g('verse'), riff: null } }),
      hey: s('hey', { use: { guitar: g('hey'), lead: null }, extra: { hey: chant('hey'), ...(final ? { 'chip lead': oct(tile4(this, T.riff2, 'riff'), 1) } : {}) } }),
      hey2: s('hey', { use: { guitar: g('hey'), lead: null }, extra: { hey: chant('hey'), 'chip lead': oct(tile4(this, T.riff2, 'riff'), 1) } }),
      hey3: s('hey', { use: { guitar: g('hey'), lead: null }, extra: { hey: chant('hey'), 'chip lead': oct(tile4(this, T.intro, 'riff'), 1) } }),
      riff2: s('riff2', { use: { guitar: null, riff: 'riff', lead: null }, extra: { 'chip lead': oct(tile4(this, T.riff2, 'riff'), 1) } }),
      solo: s('solo', { use: { guitar: g('solo') } }),
      quiet: s('verse', { drums: 'half', use: { guitar: g('verse'), riff: null, lead: null } }),
      outro: s('outro', { use: { guitar: g('outro') }, extra: final ? { 'chip lead': oct(tile4(this, T.outro, 'lead'), 1) } : {} }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Muckraker (remix): Anglesea in the rain, on VHS.
//
// Measured (live in PBS 106.7 FM's studio, 2013, 177 s): 129 bpm in 4/4, a
// bar 1.85 s. Key: B major. The main riff is the bass and guitar together in
// eighths, half a bar to each chord, B | A | G#m | F# | E | F# | E | F#, the
// bass on B1-A1-G#1-F#1-E1 (measured bar for bar at 16-23 s, and the tab's).
// The intro rocks E-F# under a high riff on D#-B-C#-B; the verse is B for a
// bar and E-F#-E-F# for a bar; the bridge holds B, E, B, then F# | E | A | B
// ("Muckraker, oh muckraker"). Most of the song sits on B, A and A# leaning
// on it (the bass under the bridge goes B-A-A#-A-G). Section map:
//   intro    1.7-14 s    E | F# under the high riff
//   main    16.0-30 s    the main riff ("ooh"), the theremin on the chords
//   verse   30.8-45 s    B | E F# E F#
//   chorus  45.5-60 s    the main riff, "oh no, oh no"
//   bridge  73.1-88 s    B | B | E | B, "aah"
//   name    88.2-103 s   F# E | A B, "muckraker, oh muckraker"
// then the verse again and the main riff as the payoff, ending on B.
// Lap 129 bpm, final lap 137. A pick bass, the riff on a jangling garage
// guitar, the theremin on a whistling Moog lead (ladder) with a slow
// vibrato, voices for the chants, chip arp and chip lead; salamander drums.
// ---------------------------------------------------------------------------

const MAIN_ROOTS = 'B A G# F# E F# E F#';
const mainBass = { s: rep('x.x.x.x.', 8), n: each('B1 A1 G#1 F#1 E1 F#1 E1 F#1', 4) };
const mainGtr = power(rep('x.x.x.x.', 8), each('B2 A2 G#2 F#2 E2 F#2 E2 F#2', 4));
const MUCK_T = {
  intro: { bars: 2, chords: ['E', 'F#'], tones: ['E G# B', 'F# A# C#'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('E1 F#1 E1 F#1', 4) },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'D#4 B3 C#4 B3' } },
  main: { bars: 4, chords: ['B', 'G#m', 'E', 'E'], tones: ['B D# A', 'G# F# C#', 'E F# B', 'E F# B'],
    bass: mainBass, gtr: mainGtr,
    lead: { s: rep('X_______', 8), n: 'D#5 C#5 B4 A#4 B4 A#4 B4 A#4' } },
  verse: { bars: 2, chords: ['B', 'E'], tones: ['B D# F#', 'E F# B'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('B1', 8) + ' E1 E1 F#1 F#1 E1 E1 F#1 F#1' },
    gtr: power('X..x..x.X..x..x. X...X...X...X...', 'B2 B2 B2 B2 B2 B2 E2 F#2 E2 F#2'),
    lead: { s: '..x.x.x.x.x.X___ ..x.x.x.x.x.X___', n: 'F#4 F#4 F#4 E4 D#4 B3 B3 D#4 E4 D#4 C#4 B3' } },
  bridge: { bars: 4, chords: ['B', 'B', 'E', 'B'], tones: ['B A A#', 'B A A#', 'E G# B', 'B A A#'],
    // The B vamp's bass, measured at 80-90 s: B, down to A, A#, A, and G before the next B.
    bass: { s: rep('x___xxx____x___x', 4), n: 'B1 A1 A#1 A1 G1 A1 B1 A1 A#1 A1 G1 A1 E2 D2 D#2 D2 C2 D2 B1 A1 A#1 A1 G1 A1' },
    gtr: power(rep('X_______________', 4), 'B2 B2 E2 B2'),
    lead: { s: rep('X___x_X___x_x_x_', 4), n: 'F#4 E4 D#4 E4 D#4 C#4 B3' } },
  name: { bars: 2, chords: ['F#', 'A'], tones: ['F# A# C#', 'A B D#'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('F#1 E1 A1 B1', 4) },
    gtr: power('X.......X....... X.......X.......', 'F#2 E2 A2 B2'),
    lead: { s: 'x.x.X_____...... x.x.X_____......', n: 'F#4 D#4 C#4 E4 C#4 B3' } },
};

const MUCKRAKER = {
  meter: '4/4', spb: 16, rot: 0, bpm: 129, finalPlus: 8, mix: 0.7,
  tracks: [
    ...kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2'] }),
    { name: 'bass', engine: 'dm:bass', preset: 'pick grind', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'jangle', params: { vol: 0.5 }, out: 'verb' },
    { name: 'riff', engine: 'dm:guitar', preset: 'surf twang', params: { vol: 0.48 }, out: 'verb' },
    // The theremin: a whistling Moog lead sliding between notes, a slow vibrato on its pitch.
    { name: 'lead', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.4 }, glide: 0.35, out: 'verb', lfo: [{ target: 'pitch', shape: 'sine', amount: 0.12, length: '4 steps' }] },
    voice('vox', { words: 'oh no', vol: 0.45, size: 0.5, voices: 4 }),
    voice('aah', { text: 'aah', vol: 0.4, size: 0.5, voices: 5 }),
    voice('name', { text: 'muk ray ker oh muk ray ker', vol: 0.45, size: 0.55, voices: 4 }),
    chip('chip arp', { vol: 0.26, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.3 }, out: 'verb' },
    verbBus(2.2, 0.3, 0.24),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X.x...x.X.x...x.', snare: '....X..o....X.o.', hat: 'xoxoxoxoxoxoxoxo' }
      : { kick: 'X.....x.X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', hat: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.......X.......', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'tom hi': '........x.......', 'tom lo': '..........x.....' },
  order: ['intro', 'main', 'verse', 'chorus', 'bridge', 'name', 'verse2', 'outro'],
  finalOrder: ['chorus', 'verse', 'bridge', 'main2', 'name', 'chorus2', 'verse2', 'main'],
  sections(final) {
    const T = MUCK_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const ohNo = { s: rep('x_x_....x_x_....', 4), n: 'F#4 D#4 F#4 D#4 E4 C#4 E4 C#4' };
    const aah = { s: rep('X_______________', 4), n: 'D#4 D#4 G#4 D#4' };
    // "Muck-ra-ker, oh muck-ra-ker", over F# E | A B.
    const muck = { s: 'x.x.X_______x...x.x.X___________', n: 'F#4 F#4 F#4 E4 C#4 C#4 C#4' };
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', use: { guitar: null, lead: null, riff: 'riff' } }),
      main: s('main', { use: { guitar: T.main.gtr } }),
      main2: s('main', { use: { guitar: T.main.gtr }, extra: { 'chip lead': oct(tile4(this, T.intro, 'riff'), 1) } }),
      verse: s('verse', { use: { guitar: T.verse.gtr } }),
      verse2: s('verse', { use: { guitar: T.verse.gtr }, extra: { 'chip lead': oct(tile4(this, T.verse, 'lead'), 1) } }),
      chorus: s('main', { use: { guitar: T.main.gtr, lead: null }, extra: { vox: ohNo, ...(final ? { 'chip lead': oct(tile4(this, T.intro, 'riff'), 1) } : {}) } }),
      chorus2: s('main', { use: { guitar: T.main.gtr, lead: null }, extra: { vox: ohNo, 'chip lead': oct(tile4(this, T.intro, 'riff'), 1) } }),
      bridge: s('bridge', { drums: 'half', use: { guitar: T.bridge.gtr }, extra: { aah } }),
      name: s('name', { use: { guitar: T.name.gtr, lead: null }, extra: { name: muck, 'chip lead': oct(tile4(this, T.name, 'lead'), 1) } }),
      outro: s('main', { use: { guitar: T.main.gtr }, extra: { 'chip lead': oct(tile4(this, T.verse, 'lead'), 1) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Cut Throat Boogie (remix): the party, all night.
//
// Measured (Live in Barcelona '25, the soundboard, 533 s): beats of 0.627 s
// with the kick on every eighth inside them, a boogie at 192 in cut time;
// written here as 96 bpm in sixteenths, like Elbow. Key: A, a one-chord
// boogie (A7, the C natural against the C#: the blues), the IV on D, and at
// the end the chromatic slide from A# down onto A. The bass holds A2 with
// G#2 and A#2 either side of it and walks D2-F#2-G2-G#2 up into the A (measured at 37-53 s); the guitar rocks E3-A3 and E3-C4 on
// the eighths and turns round on G3-F#3-F3-E3 (40 s); the harmonica plays
// round C#5, D#5 and E5 (measured on the top line through the set). It was
// mixed in dual mono: one section here splits the guitar hard left and the
// harmonica hard right. Section map:
//   boogie  15.0-40 s    the A boogie, the bass walking up into it
//   four    52.8-58 s    D: the bass on D2, the riff A3-D4 and A3-F4
//   jam    240.0-270 s   the quiet A7 stretch, the harmonica on its own
//   end    494.0-509 s   A# | A, the slide down
// Lap 96 bpm, final lap 104. A Motown bass, the riff on a blues burn
// guitar, the harmonica on a reedy square (snarl through a bandpass), chip
// arp and chip lead; salamander drums.
// ---------------------------------------------------------------------------

const BOOGIE_T = {
  boogie: { bars: 2, chords: ['A7', 'A7'], tones: ['A C# E', 'A G C'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 D2 F#2 G2 G#2' },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'E3 A3 E3 C4 E3 A3 E3 C4 E3 A3 E3 C4 G3 F#3 F3 E3' },
    lead: { s: '........x_x_x.x. x_x.x_..x.x.x___', n: 'C5 C#5 E5 C#5 D#5 E5 C#5 A4 C5 A4' } },
  four: { bars: 2, chords: ['D7', 'A7'], tones: ['D F# A', 'A C# E'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'D2 D3 D2 D3 D2 D3 D2 D3 A1 A2 A1 A2 A1 B1 C2 C#2' },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'A3 D4 A3 F4 A3 D4 A3 F4 E3 A3 E3 C4 E3 A3 E3 C4' },
    lead: { s: 'x___x.x.x___x.x. x_x.x_..x.x.x___', n: 'F5 D5 C5 A4 C5 A4 D#5 E5 C#5 A4 C5 A4' } },
  end: { bars: 2, chords: ['A#7', 'A7'], tones: ['A# D F', 'A C# E'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: each('A#1 A#2', 4) + ' A1 A2 A1 A2 A1 A2 G2 G#2' },
    riff: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'F3 A#3 F3 C#4 F3 A#3 F3 C#4 E3 A3 E3 C4 E3 A3 E3 C4' },
    lead: { s: 'X_______x_x_x___ X_______x_x_x___', n: 'D5 C#5 D5 A#4 C#5 C5 C#5 A4' } },
};

const BOOGIE = {
  meter: '4/4', spb: 16, rot: 0, bpm: 96, finalPlus: 8, mix: 1,
  tracks: [
    ...kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride'] }),
    { name: 'bass', engine: 'dm:bass', preset: 'motown', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'blues burn', params: { vol: 0.5 }, out: 'verb' },
    { name: 'lead', engine: 'dm:snarl', params: { vol: 0.34, harm: 0.2, timb: 0.35, osc1: 0, osc2: 0.9, osc3: 0, osc4: 0, ultra: 0, fm: 0, metal: 0 }, filter: { cutoff: 0.5 }, out: 'verb', glide: 0.08, fx: { chorus: { wet: 0.2 } } },
    // Dual mono: the guitar on its own on the left, the harmonica on the right.
    { name: 'guitar L', engine: 'dm:guitar', preset: 'blues burn', params: { vol: 0.52 }, out: 'verb', fx: { pan: { pos: 0 } } },
    { name: 'harp R', engine: 'dm:snarl', params: { vol: 0.36, harm: 0.2, timb: 0.35, osc1: 0, osc2: 0.9, osc3: 0, osc4: 0, ultra: 0, fm: 0, metal: 0 }, filter: { cutoff: 0.5 }, out: 'verb', glide: 0.08, fx: { pan: { pos: 1 } } },
    chip('chip arp', { vol: 0.26, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.28 }, out: 'verb' },
    verbBus(1.8, 0.26, 0.2),
  ],
  grooves: {
    // The boogie: the kick on every beat of the song's cut time, the snare on its 2 and 4, eighths on the hat.
    groove: (final) => final
      ? { kick: 'X.x.X.x.X.x.X.x.', snare: '..X...X...X..oX.', hat: 'xoxoxoxoxoxoxoxo', 'open hat': '...............x' }
      : { kick: 'X.x.X.x.X.x.X.x.', snare: '..X...X...X...X.', hat: 'x.x.x.x.x.x.x.x.' },
    ride: (final) => ({ kick: 'X.x.X.x.X.x.X.x.', snare: '..X...X...X...X.', ride: final ? 'xoxoxoxoxoxoxoxo' : 'x.x.x.x.x.x.x.x.' }),
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.x.X.x.........', snare: '..X...X.x.x.rrRR', hat: 'x.x.x.x.........', ride: '', 'tom hi': '........x.......', 'tom lo': '..........x.....' },
  order: ['boogie', 'boogie2', 'four', 'boogie3', 'mono', 'four2', 'jam', 'end'],
  finalOrder: ['boogie2', 'four', 'boogie3', 'mono', 'four2', 'boogie', 'jam', 'end'],
  sections(final) {
    const T = BOOGIE_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const harpUp = (k) => oct(tile4(this, T[k], 'lead'), 0);
    return {
      boogie: s('boogie', { use: { lead: null } }),
      boogie2: s('boogie', { extra: final ? { 'chip lead': oct(tile4(this, T.boogie, 'riff'), 1) } : {} }),
      boogie3: s('boogie', { drums: 'ride', extra: { 'chip lead': oct(tile4(this, T.boogie, 'riff'), 1) } }),
      four: s('four'),
      four2: s('four', { drums: 'ride', extra: { 'chip lead': oct(tile4(this, T.four, 'riff'), 1) } }),
      mono: s('boogie', { use: { guitar: null, lead: null }, extra: { 'guitar L': tile4(this, T.boogie, 'riff'), 'harp R': harpUp('boogie') } }),
      jam: s('boogie', { drums: 'half', use: { guitar: null } }),
      end: s('end', { extra: { 'chip lead': oct(tile4(this, T.end, 'riff'), 1) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Sea of Trees (remix): the cup's finale, the forest like a sea.
//
// Measured (Live At Red Rocks '22, 592 s, the long version with Stu on
// flute): 123 bpm in 4/4, a bar 1.95 s. Key: G (mixolydian: the F natural
// and the C), the tab's shapes in the same key. The verse is the tab's
// guitar 1: F | C | F | C | F into a held G, and again from E-F-G; guitar 2
// walks F-E-D-C under the first four; the riff is E-F-G, F-E, C, then
// E-F-G, G-F-G-A; the big middle of the live version vamps G | F | C | G.
// The bass holds G2 with F2 and G#2 beside it (measured 16-30 s). Section
// map:
//   intro    9.0-30 s    quiet: the G drone, the flute (D4-B4-C5 round G)
//   pre     75.0-83 s    F C F C F | G, the band coming in
//   verse   83.0-99 s    the same, sung, and E-F-G back into G
//   riff    99.0-114 s   guitar 2's riff over G
//   jam    140.0-160 s   G | F | C | G, loud
//   quiet  322.0-370 s   the long quiet stretch, the flute on its own
// then the verse again, and the end: it cuts out, as the record runs out of
// tape, before the loop comes round.
// Lap 123 bpm, final lap 131. A Motown bass, the chords on a chime guitar,
// the riff on a fuzz lead, the flute on a whistling Moog lead (ladder),
// chip arp and chip lead; drskit drums.
// ---------------------------------------------------------------------------

const TREES_T = {
  intro: { bars: 2, chords: ['G', 'G'], tones: ['G B D', 'G C D'],
    bass: { s: 'X_______________ X_______________', n: 'G2 G2' },
    riff: { s: 'x..xx.x.x.x.x.x. x..xx.x.x.x.x.x.', n: 'E3 F3 F3 G3 G3 G3 G3 G3 G3' },
    lead: { s: 'x___x_______x_x_ x___x___x___x___', n: 'D5 B4 C5 B4 G4 B4 D5 G4' } },
  pre: { bars: 2, chords: ['F', 'G'], tones: ['F A C', 'G B D'],
    bass: { s: 'x__x__x__x__x... x.x.x.x.x.x.x.x.', n: 'F2 E2 D2 C2 F2 G2 G2 G2 G2 G2 G2 G2 G2' },
    gtr: { s: 'x..x..x..x..x... x.x.x.x.x.x.x.x.', n: 'F3 C3 F3 C3 F3 G3 G3 G3 G3 G3 G3 G3 G3', c: 'maj' } },
  verse: { bars: 4, chords: ['F', 'G', 'E', 'G'], tones: ['F A C', 'G B D', 'E F G', 'G B D'],
    bass: { s: 'x__x__x__x__x... x.x.x.x.x.x.x.x. x__.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'F2 E2 D2 C2 F2 ' + each('G2', 8) + ' E2 F2 ' + each('G2', 6) + ' ' + each('G2', 6) + ' F2 F#2' },
    gtr: { s: 'x..x..x..x..x... x.x.x.x.x.x.x.x. x__.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'F3 C3 F3 C3 F3 ' + each('G3', 8) + ' E3 F3 ' + each('G3', 6) + ' ' + each('G3', 8), c: 'maj' },
    lead: { s: 'x.x.x.x.x___x.x. X_______........ x.x.x.x.x___x.x. X_______........', n: 'C5 C5 A4 G4 A4 G4 F4 G4 B4 B4 A4 G4 A4 B4 C5 D5' } },
  riff: { bars: 2, chords: ['G', 'G'], tones: ['G E F', 'G F A'],
    bass: { s: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', n: 'G2 G2 G2 G2 F2 F2 G2 G2 G2 G2 G2 G2 F2 F2 G2 G#2' },
    riff: { s: 'x.x.x...x.x...x. x.x.x...x.x.x_x_', n: 'E3 F3 G3 F3 E3 C3 E3 F3 G3 G3 F3 G3 A3' } },
  jam: { bars: 4, chords: ['G', 'F', 'C', 'G'], tones: ['G B D', 'F A C', 'C E G', 'G B F'],
    bass: { s: rep('x.x.x.x.', 8), n: each('G2', 8) + ' ' + each('F2', 8) + ' ' + each('C2', 8) + ' ' + each('G2', 6) + ' F2 F#2' },
    gtr: power(rep('X.x.x.X.', 8), each('G2', 8) + ' ' + each('F2', 8) + ' ' + each('C3', 8) + ' ' + each('G2', 8)),
    lead: { s: 'x_x_x_x.x.x.X___ x_x_x_x.x.x.X___ x_x_x_x.x.x.X___ x_x_x.x.x___X___', n: 'B4 D5 G5 F5 D5 C5 D5 A4 C5 F5 E5 C5 A4 C5 G4 C5 E5 G5 E5 C5 D5 B4 D5 F5 D5 B4 G4' } },
};

const TREES = {
  meter: '4/4', spb: 16, rot: 0, bpm: 123, finalPlus: 8, mix: 0.7,
  tracks: [
    ...kit('drskit', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2', 'ride'], vol: { hihat: 0.9 }, tune: { tom1: 'D2', tom2: 'G1' } }),
    { name: 'bass', engine: 'dm:bass', preset: 'motown', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'chime', params: { vol: 0.46 }, out: 'verb' },
    { name: 'riff', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.46 }, out: 'verb' },
    // Stu's flute.
    { name: 'lead', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.38 }, out: 'verb', fx: { chorus: { wet: 0.15 } } },
    chip('chip arp', { vol: 0.26, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.32 }, out: 'verb' },
    verbBus(3.4, 0.34, 0.2),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X.....x.X.x...x.', snare: '....X..o....X.o.', hat: 'xoxoxoxoxoxoxoxo' }
      : { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    ride: (final) => ({ kick: final ? 'X.....x.X.x...x.' : 'X.....x.X.......', snare: '....X.......X...', ride: 'x.xxx.xxx.xxx.xx', hat: '....x.......x...' }),
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.......X.......', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'pre', 'verse', 'riff', 'jam', 'quiet', 'verse2', 'tape'],
  finalOrder: ['jam', 'verse', 'riff', 'jam2', 'quiet', 'verse2', 'riff2', 'tape'],
  sections(final) {
    const T = TREES_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const tape = s('riff', { extra: { 'chip lead': oct(tile4(this, T.riff, 'riff'), 1) } });
    // Out of tape: everything stops two beats before the loop comes round, and the drums count it back in.
    for (const [k, p] of Object.entries(tape.parts)) {
      if (k === 'crash') continue;
      const str = String(p.s ?? p).replace(/[\s|]/g, '');
      const cut = str.slice(0, str.length - 8) + (k === 'snare' ? '....X.X.' : k === 'kick' ? 'X.......' : '........');
      tape.parts[k] = typeof p === 'string' ? cut : { ...p, s: cut };
    }
    return {
      intro: s('intro', { drums: 'half', use: { riff: 'riff', guitar: null } }),
      pre: s('pre', { use: { guitar: T.pre.gtr } }),
      verse: s('verse', { use: { guitar: T.verse.gtr } }),
      verse2: s('verse', { drums: 'ride', use: { guitar: T.verse.gtr }, extra: { 'chip lead': oct(tile4(this, T.verse, 'lead'), 0) } }),
      riff: s('riff', { use: { riff: 'riff', guitar: null } }),
      riff2: s('riff', { drums: 'ride', use: { riff: 'riff', guitar: null }, extra: { 'chip lead': oct(tile4(this, T.riff, 'riff'), 1) } }),
      jam: s('jam', { drums: 'ride', use: { guitar: T.jam.gtr }, extra: final ? { 'chip lead': oct(tile4(this, T.jam, 'lead'), 0) } : {} }),
      jam2: s('jam', { drums: 'ride', use: { guitar: T.jam.gtr }, extra: { 'chip lead': oct(tile4(this, T.jam, 'lead'), 0) } }),
      quiet: s('intro', { drums: 'half', use: { riff: null, guitar: null } }),
      tape,
    };
  },
};

export const SONGS = [
  ...cue('elbow', 'elbow-remix', ELBOW),
  ...cue('muckraker', 'muckraker-remix', MUCKRAKER),
  ...cue('cut throat boogie', 'cut-throat-boogie-remix', BOOGIE),
  ...cue('sea of trees', 'sea-of-trees-remix', TREES),
];
