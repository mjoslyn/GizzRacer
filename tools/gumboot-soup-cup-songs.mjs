// The Gumboot Soup Cup's remixes, written in seqbaby.
//
// Eight cues, the four songs from Gumboot Soup (2017) the cup races to, each a
// lap cut and a faster final-lap cut (busier drums, the hook up front):
//
//   muddy-water-remix(-final-lap)            "Muddy Water"
//   great-chain-of-being-remix(-final-lap)   "The Great Chain of Being"
//   all-is-known-remix(-final-lap)           "All Is Known"
//   the-wheel-remix(-final-lap)              "The Wheel"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json), a soundboard each: Muddy Water
// from Live at Field of Vision II '26 (2026-08-15), The Great Chain of Being
// from the next night of the same festival (2026-08-16), All Is Known from
// Live at Field of Vision '25 and The Wheel from Live in Bulgaria '25. No tab
// could be reached, so it is the recordings alone. No audio from the
// recordings goes in: these are notes. Gumboot Soup is the year's leftovers,
// four songs that share nothing but the band, so each remix keeps its own
// meter and feel: Muddy Water and All Is Known are jigs in 12/8 with the
// bass or the snare three against the kick's two, The Great Chain of Being
// grinds in seven, and The Wheel swings in seven. They are played on the
// band's instruments: a garage kit (salamander, with the ride), an electric
// bass, a fuzz guitar, a drawbar organ or a Rhodes on the chords, Stu's
// saxophone on Muddy Water (an alto sax cycle, the drone and its grace notes
// played like pipes), a harmonica on All Is Known (a reed cycle), a flute on
// The Wheel, and the hooks (the songs' titles) on one choir voice, with a chip
// arp for the video game on top. Each remix is the song's highlights in the
// song's own order, eight sections of four bars, every section handing to the
// next with a fill and a crash so the loop has no seam; The Wheel's loop is
// its locked groove.
//
// How the recordings were measured: the tempo by the vector strength of the
// percussive onsets over beat periods in 0.05 bpm steps (refined to 0.005)
// across a minute or two of a steady groove, checked against the onset
// autocorrelation; the bar from the lag at which the harmonic constant-Q
// spectrum repeats best (a riff's whole cycle: one 12/8 bar in Muddy Water and
// All Is Known, seven beats in The Great Chain of Being's riffs and The
// Wheel), refined in 0.02% steps; the subdivision from the onsets folded on
// the beat (three to a beat in the jigs, swung eighths in The Wheel); the
// downbeat from the kick band folded on the bar; the key from chroma
// (Krumhansl, the tuning pinned to 0: all four sit within 5 cents of A440);
// and per section, folded over every repeat of its bar or two, each step's
// strongest constant-Q note of the harmonic stem in E1-E3 (the bass), the
// three strongest in E3-E6 (the riff, the sax, the harmonica and the keys),
// each bar's three strongest pitch classes (the chords and the arp), and the
// kick, snare and hat onsets. The sung hooks are written over the measured
// tones in the singer's register; the words are the titles.
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
/** Power chords: the root's fifth stacked on each hit (two strings: the fuzz fills it out, and each string costs the audio thread). */
const power = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [midi(r, 7)]) };
};

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

/** The garage kit every remix here plays, a real drummer's (salamander), with the ride. */
const garage = (vol = {}, pieces = ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride']) => kit('salamander', { pieces, vol: { hihat: 0.75, ride: 0.6, ...vol } });
const bass = (preset, vol = 0.85) => ({ name: 'bass', engine: 'dm:bass', preset, params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
const guitar = (preset, vol = 0.42, name = 'guitar') => ({ name, engine: 'dm:guitar', preset, params: { vol, decay: 0.5 }, out: 'verb' });
/** The organ on the chords (section() voices each bar's measured tones on the `pad` track), the drawbars through a phaser for the spin. */
const organ = (vol = 0.28) => ({ name: 'pad', engine: 'dm:hexop', preset: 'organ', params: { vol }, out: 'verb', fx: { phaser: { wet: 0.35, rate: 0.35, depth: 0.5 } } });
/** A Rhodes on the chords: hexop's electric piano, a slow chorus on it. */
const rhodes = (vol = 0.4) => ({ name: 'pad', engine: 'dm:hexop', preset: 'e.piano', params: { vol }, out: 'verb', fx: { chorus: { wet: 0.3, rate: 0.25, depth: 0.5 } } });
/**
 * A reed or a pipe from seqbaby's single-cycle wavetables (wt:akwf, `harm` picks the cycle out of
 * 24): a looped buffer a note, the cheapest melodic voice there is on the audio thread.
 */
const AKWF = ['bw_sin', 'bw_tri', 'bw_sawrounded', 'bw_saw', 'bw_sawbright', 'bw_squrounded', 'bw_squ', 'eorgan', 'epiano', 'piano', 'cello', 'violin', 'flute', 'oboe', 'clarinett', 'altosax', 'ebass', 'eguitar', 'theremin', 'fmsynth', 'overtone', 'distorted', 'oscchip', 'vgame'];
const reed = (name, wave, { vol = 0.4, warm = 0.55, detune = 0.15, decay = 0.75, fx = {} } = {}) => ({
  name, engine: 'wt:akwf', out: 'verb',
  params: { vol, harm: AKWF.indexOf(wave) / (AKWF.length - 1), timb: warm, morph: detune, decay },
  fx,
});
/** The hooks on one choir voice (a voice is the dearest part on the audio thread). */
const choir = (vol = 0.5, preset = 'choir aah') => ({ name: 'voice', engine: 'dm:vox', preset, out: 'verb', params: { vol, sngvoices: 2 } });
/** The video game on top: a Moog voice through an 8-bit crusher. */
const chip = (vol = 0.2) => ({ name: 'chip arp', engine: 'dm:ladder', preset: 'percussive', params: { vol }, out: 'verb', fx: { crush: { bits: 6, rate: 1, wet: 0.55 } } });

// ---------------------------------------------------------------------------
// Putting a remix together
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

/**
 * The chip arp on a rhythm of the song's own (`song.arp`, one bar), running up
 * and down each bar's three measured tones: one note a hit, so it fits any
 * meter (section()'s own arp runs in sixteenths and assumes an even bar).
 */
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
 * guitar (its power chords where the phrase has them), the lead line on the
 * song's lead, the chip arp in the song's own rhythm, and the phrase's hook
 * sung once.
 */
function sec(song, T, k, final, o = {}) {
  const ph = T[k];
  const gtr = ph.gtr ? ph.gtr : 'riff';
  return section(song, { name: k, ...ph }, {
    final,
    drums: o.drums,
    crash: o.crash,
    use: { guitar: gtr, ...(o.use ?? {}) },
    extra: { 'chip arp': arpOf(song, ph), voice: once(ph.chant, song.spb), ...(o.extra ?? {}) },
  });
}

/** The lap and final-lap cues of one remix. */
function cue(title, id, song) {
  return [false, true].map((final) => {
    const raw = scoreOf(song, final);
    // The final lap's own level where it has one (scoreOf's is the lap's, a little down).
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
// 1. Muddy Water (remix): Stu's jig, the bagpipe sax over the mud.
//
// Measured (Live at Field of Vision II '26, 15 August, the soundboard, 394 s,
// the music to 359.5 s): 143.03 bpm, three onsets to the beat (triplet
// eighths), the kick on every beat and the snare on two and four, so 12/8, a
// bar 1.678 s; the riff repeats on the bar. The bass and the guitar play the
// riff in quarter notes against it, two to the kick's three, a step ahead of
// the beat (the syncopation the band pairs with The Bitter Boogie). Key: D,
// minor, the D# and the C# either side of it (D, A, C, C# the strongest, F# the
// weakest of all twelve), and the
// high D of the sax trilling to C# and D# over a D pedal for most of the song
// (the bagpipe drone). Section map (the phrases taken, in the song's order):
//   intro      0-36 s    quiet: the bass climbing D-A-A#-C-C#-D, the sax's D5 with D#5 and C#5
//   verse     40-70 s    the D pedal, F and A over it, then G-G#
//   verseb    70-90 s    the bass D-D#-C, A# and G# over the A
//   grind    120-150 s   loud: the bass on D with E, D#, F and C#, the sax trilling D-C#-D-D#
//   riff     150-185 s   the hemiola: A-C-D in quarters a step ahead of the kick, "muddy water"
//   brk      186-200 s   the D pedal, G#-A over it, the D-D#-C# turn
//   jam      200-340 s   the long jam: the D pedal, the bass dipping to C, the sax's trill
// Lap 143.03 bpm, final lap 151 (the beat; seqbaby counts the 12/8 bar as
// 6/8 of triplet-eighth steps, so 107.27 and 113.27). A pick bass, the riff on
// a fuzz guitar, the sax on its drone and trills, the organ on the chords,
// "muddy water" on the choir, the chip arp in triplets; the garage kit.
// ---------------------------------------------------------------------------

const MW_T = {
  intro: { bars: 2, chords: ['D5', 'D5'], tones: ['D A C#', 'D C# D#'],
    bass: { s: 'X_x_xxxxx_xx X_x_xxxxx_xx', n: 'D2 A1 A#1 C2 C#2 D2 A1 A#1 C2' },
    lead: { s: 'X_______x_x_ X_______x_x_', n: 'D5 D#5 D5 D5 C#5 D5' } },
  verse: { bars: 2, chords: ['Dm', 'D'], tones: ['D F A', 'D G G#'],
    bass: { s: 'x__x__x__x__ x__x__x__x__', n: 'D2 D2 D3 D2 D2 D2 D3 D2' },
    riff: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'F3 E3 F3 A3 D3 F3 A3 F3 G3 G#3 G3 F3 A3 E3 F3 A3' } },
  verseb: { bars: 2, chords: ['D', 'Dm'], tones: ['D A A#', 'D A C#'],
    bass: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'D2 D#2 D2 C2 D2 D2 D#2 D2 D2 D#2 D2 C2 D2 D2 C#2 D2' },
    gtr: power('X_____X_____ X_____X__x__', 'D3 D3 D3 C3 C#3'),
    lead: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'A4 G#4 G4 A4 A#4 A4 G#4 A4 G4 G#4 G4 F4 A4 F4 G4 A4' } },
  grind: { bars: 2, chords: ['D5', 'D5'], tones: ['D D# C#', 'D D# C#'],
    bass: { s: 'X_xX_xX_xX_x X_xX_xX_xX_x', n: 'D2 E2 D#2 D2 D2 F2 D2 D2 D2 F2 D2 D2 D2 F2 C#2 D2' },
    gtr: power('X_xX_xX_xX_x X_xX_xX_xX_x', 'D3 E3 D#3 D3 D3 D3 D3 D3 D3 D3 D3 D3 D3 D3 C#3 D3'),
    lead: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'D5 C#5 D5 D#5 D5 C#5 D5 D#5 D5 C#5 D5 D#5 D5 D#5 D5 C#5' },
    chant: say('x_x_x_X_____ x_x_x_X_____', 'D4 D4 C#4 D4 D4 D4 D#4 D4', 'mud dee wo ter') },
  riff: { bars: 2, chords: ['A5 | C5 | D5', 'D5 | A5'], tones: ['A D G#', 'D C# A'],
    // The riff a triplet eighth ahead of the beat: the A ties over the bar line.
    bass: { s: '_x_x_x_x_x_x _x_x_x_x_x_x', n: 'C2 D2 A1 C2 D2 A1' },
    gtr: power('_x_x_x_x_x_x _x_x_x_x_x_x', 'C3 D3 A2 C3 D3 A2'),
    lead: { s: 'X_____x_x___ X_____x_x___', n: 'A4 G#4 A4 D5 C#5 D5' },
    chant: say('x_x_x_X_____ x_x_x_X_____', 'A3 C4 D4 D4 A3 C4 D4 A3', 'mud dee wo ter') },
  brk: { bars: 2, chords: ['D', 'D'], tones: ['D G# A', 'D A G#'],
    bass: { s: 'X___________ X_____x__x__', n: 'D2 D2 D#2 C#2' },
    riff: { s: 'x__x__x__x__ x__x__x__x__', n: 'G#3 A3 D4 D4 G#3 G#3 A3 A3' },
    lead: { s: '....x_xx_x__ ............', n: 'D5 D#5 D5 C#5' } },
  jam: { bars: 2, chords: ['D5', 'D5'], tones: ['D C# D#', 'D D# C'],
    bass: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'D2 D2 D2 C2 D2 D2 D2 D2 D2 D2 D2 C2 D2 D2 C2 C2' },
    gtr: power('X__x__X__x__ X__x__X__x__', 'D3'),
    lead: { s: 'x_xx_xx_xx_x x_xx_xx_xx_x', n: 'D5 D#5 D5 C#5 D5 D#5 D5 C#5 D5 D#5 D5 C#5 D5 E5 D5 C#5' } },
};

const MUDDY_WATER = {
  meter: '6/8', spb: 12, rot: 0, bpm: 107.27, finalPlus: 6, mix: 0.62, finalMix: 0.59,
  arp: 'x.xx.xx.xx.x',
  tracks: [
    ...garage(),
    bass('pick grind'),
    guitar('fuzz lead', 0.4),
    // Stu's sax: the alto cycle a little bright, a slow vibrato, played like pipes (the drone and its grace notes).
    reed('lead', 'altosax', { vol: 0.42, warm: 0.62, detune: 0.12, decay: 0.8, fx: { chorus: { wet: 0.15 } } }),
    choir(0.5),
    chip(0.2),
    organ(0.26),
    verbBus(2.2, 0.28, 0.18),
  ],
  grooves: {
    // The jig: the kick on every beat, the snare on two and four, the hat in triplets.
    groove: (final) => final
      ? { kick: 'X..X..X..X.x', snare: '...X.....X.o', hat: 'xxXxxXxxXxxX', 'open hat': '.....x.....x' }
      : { kick: 'X..X..X..X..', snare: '...X.....X..', hat: 'x.xx.xx.xx.x' },
    half: (final) => ({ kick: 'X.....X.....', snare: final ? '...X.....X..' : '......X.....', ride: 'x..x..x..x..' }),
  },
  fill: { kick: 'X.....x.....', snare: '...x..x.rrRR', hat: 'x..x..x.....', 'open hat': '', ride: '', 'tom hi': '......x.x...', 'tom lo': '.........x.x' },
  order: ['intro', 'verse', 'verseb', 'grind', 'riff', 'brk', 'jam', 'riff2'],
  finalOrder: ['riff', 'grind', 'jam', 'verse', 'riff2', 'brk', 'jam2', 'grind2'],
  sections(final) {
    const T = MW_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'half', use: { guitar: null } }),
      verse: s('verse', { drums: final ? 'groove' : 'half' }),
      verseb: s('verseb'),
      grind: s('grind', { extra: final ? { 'chip lead': up(bare(once(T.grind.chant, 12)), 1) } : {} }),
      grind2: s('grind', { extra: { 'chip lead': up1('grind', 'lead') } }),
      riff: s('riff', { extra: final ? { 'chip lead': up(bare(once(T.riff.chant, 12)), 1) } : {} }),
      riff2: s('riff', { extra: { 'chip lead': up1('riff', 'lead') } }),
      brk: s('brk', { drums: 'half' }),
      jam: s('jam'),
      jam2: s('jam', { extra: { voice: once(T.riff.chant, 12), 'chip lead': up1('jam', 'lead') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. The Great Chain of Being (remix): the crushing riff in seven.
//
// Measured (Live at Field of Vision II '26, 16 August, the soundboard, 361 s,
// the music 2.5-301.5 s): the band play it in B now (C# until 2022). The
// riffs repeat every seven beats: 3.51 s at 119.6 bpm (112-150 s), 3.455 s
// at 121.6 (210-260 s), a hit on every beat, so 7/4; the verse's phrase
// repeats every thirteen beats (6.60 s at 118.2), a seven and a six, and the
// remix takes its first seven. The quiet intro is slower (112 bpm) and the
// end doubles up (a 0.372 s pulse). Key: B, with the C over it and the A#
// under it (B phrygian and its leading note: B, F#, C, C#, A# the strongest),
// the guitars grinding G and F against the F# of the B power chord. Section
// map:
//   intro     2-40 s    quiet: the F# drone, the guitar's F#5 with G5 and F5 high
//   verse    62-100 s   the B pedal five beats, then the bass A-C-F-A-D-A-C-G (also 150-180 s)
//   riff     112-150 s  the B riff: B on every beat, F# with G and F over it
//   brk      182-200 s  quieter: B, F#-G-F, up to B, C and F#4
//   chain    210-260 s  the crushing riff: C-B-A#-B ... A#-G, C-B-A-B
//   outro    274-300 s  double time: the B pedal, E and F over it
// Lap 120 bpm, final lap 128. A pick bass, power chords on a grunge guitar,
// the high lines on a fuzz lead, the organ on the chords, "the great chain of
// being" on the choir, the chip arp on the beat; the garage kit, the kick on
// the odd beats and the snare on the even, the ride on every beat.
// ---------------------------------------------------------------------------

const GC_T = {
  intro: { bars: 1, chords: ['F#5'], tones: ['F# G B'],
    bass: { s: 'X___________x_______________', n: 'F#2 B1' },
    lead: { s: 'X_______x___x_______X_______', n: 'F#5 G5 F#5 F5' } },
  verse: { bars: 1, chords: ['B5 | A C F D G'], tones: ['B G F#'],
    bass: { s: 'X___________x_x_x_x_x_x_x_x_', n: 'B1 A1 C2 F2 A1 D2 A1 C2 G1' },
    gtr: power('X___________x_x_x_x_x_x_x_x_', 'B2 A2 C3 F2 A2 D3 A2 C3 G2'),
    lead: { s: 'x___x___x_______............', n: 'F#4 G4 F#4' },
    chant: say('x___x___x___x___x___X_______', 'B3 B3 C4 B3 A#3 B3', 'the grayt chayn of bee ing') },
  riff: { bars: 1, chords: ['B5'], tones: ['B G F#'],
    bass: { s: 'X___x___x___x___x___x___x___', n: 'B1' },
    gtr: power('X___x___x___x___x___x___x___', 'B2'),
    riff: { s: 'x___x___x___x___x___x___x___', n: 'F#3 G3 F#3 F3 F#3 G3 F#3' },
    lead: { s: 'X_______x___x___X_______x___', n: 'F#4 G4 F#4 F4 F#4' } },
  brk: { bars: 1, chords: ['B5'], tones: ['B C F#'],
    bass: { s: 'X___________________________', n: 'B1' },
    lead: { s: 'x___x___x___x___x___x___x___', n: 'F#3 G3 F#3 F3 B3 C4 F#4' } },
  chain: { bars: 1, chords: ['C | B | A# | G | C | B | A'], tones: ['B C A#'],
    bass: { s: 'x__xxx_______x_xx__xxx______', n: 'C2 B1 A#1 B1 A#1 G1 C2 B1 A1 B1' },
    gtr: power('x__xxx_______x_xx__xxx______', 'C3 B2 A#2 B2 A#2 G2 C3 B2 A2 B2'),
    lead: { s: 'X___________x___X___________', n: 'B4 A#4 C5' },
    chant: say('x___x___x___x___x___X_______', 'B3 B3 C4 B3 A#3 B3', 'the grayt chayn of bee ing') },
  outro: { bars: 1, chords: ['B5'], tones: ['B E F'],
    bass: { s: 'x_x_x_x_x_x_x_x_x_x_x_x_x_x_', n: 'B1 B1 C2 B1 B1 A#1 B1' },
    gtr: power('x_x_x_x_x_x_x_x_x_x_x_x_x_x_', 'B2 B2 C3 B2 B2 A#2 B2'),
    lead: { s: 'X_______X_______X_______x___', n: 'F4 E4 B4 A#4' } },
};

const GREAT_CHAIN = {
  meter: '7/4', spb: 28, rot: 0, bpm: 120, finalPlus: 8, mix: 0.74, finalMix: 0.71,
  arp: 'x...x...x...x...x...x...x...',
  tracks: [
    ...garage({}, ['kick', 'snare', 'crash', 'tom1', 'tom2', 'ride']),
    bass('pick grind', 0.88),
    guitar('grunge', 0.42),
    guitar('fuzz lead', 0.34, 'lead'),
    choir(0.52, 'monk chant'),
    chip(0.18),
    organ(0.26),
    verbBus(2.8, 0.3, 0.16),
  ],
  grooves: {
    // Seven: the kick on the odd beats, the snare on the even, the ride on every one.
    groove: (final) => final
      ? { kick: 'X.x.....X.x.....X.x.....X...', snare: '....X.......X.......X.....o.', ride: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.' }
      : { kick: 'X.......X.......X.......X...', snare: '....X.......X.......X.......', ride: 'x...x...x...x...x...x...x...' },
    quiet: (final) => ({ kick: 'X...........................', snare: final ? '............X...............' : '', ride: 'x.......x.......x.......x...' }),
    // The end doubled up: the kick on every eighth, the snare between.
    blast: () => ({ kick: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.', snare: '..x...x...x...x...x...x...x.', ride: 'x...x...x...x...x...x...x...' }),
  },
  fill: { kick: 'X.......X.......X...........', snare: '................x...x...rrRR', ride: 'x...x...x...x...............', 'tom hi': '..................x.x.......', 'tom lo': '......................x.x...' },
  order: ['intro', 'verse', 'riff', 'verse2', 'chain', 'brk', 'chain2', 'outro'],
  finalOrder: ['chain', 'verse', 'riff', 'chain2', 'outro', 'verse2', 'brk', 'chain3'],
  sections(final) {
    const T = GC_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'quiet', use: { guitar: null } }),
      verse: s('verse', { drums: final ? 'groove' : 'quiet' }),
      verse2: s('verse', { use: { lead: null }, extra: { 'chip lead': up(bare(once(T.verse.chant, 28)), 1) } }),
      riff: s('riff'),
      brk: s('brk', { drums: 'quiet', use: { guitar: null } }),
      chain: s('chain', { extra: final ? { 'chip lead': up(bare(once(T.chain.chant, 28)), 1) } : {} }),
      chain2: s('chain', { extra: { 'chip lead': up1('chain', 'lead') } }),
      chain3: s('chain', { extra: { 'chip lead': up(bare(once(T.chain.chant, 28)), 1) } }),
      outro: s('outro', { drums: 'blast' }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. All Is Known (remix): the harmonica's garage stomp.
//
// Measured (Live at Field of Vision '25, the soundboard, 346 s, the music to
// 259.5 s): the riff repeats every 1.704 s; the kick lands four times in it
// (140.8 bpm) and the snare, the hats and the strongest onsets six times
// (0.284 s, 211 a minute), so 12/8 with the drums three against the kick's
// two, the riff on the triplet-eighth grid. Key: A, the C against the C#
// (A, E, B, C, A# the strongest), the riff around A-C-C# in the bass with
// the E-F of the guitars over it; the intro's high notes slide between the
// half-steps (the microtonal guitar). Section map:
//   intro      0-20 s    the A pedal, the high notes wandering A#-B-C, D#-E
//   build     20-68 s    the A pedal in octaves, A7 over it (C#, E, G), the A-A# wobble
//   riff      80-130 s   the riff: A . A C# C . A . C C# A E, E and F over it
//   harp     130-150 s   the harmonica high, C-D-D#-B-A, the bass turning D-C#-E
//   verse    150-170 s   the bass walking C-A-B-C#, E, F and F# over it
//   brk      205-240 s   the breakdown: the A drone, the harmonica wailing D-G-B, E-D#
//   end      240-259 s   the bass climbing C-B-C-D-C#, frantic, to the end
// Lap 140.8 bpm, final lap 148.8 (the beat; seqbaby counts the bar as 6/8
// of triplet-eighth steps, 105.6 and 111.6). A pick bass, the riff on a fuzz
// guitar, the harmonica (a reed cycle, bent between the half-steps) on the
// high lines, the organ on the chords, "all is known" on the choir, the chip
// arp three against two; the garage kit.
// ---------------------------------------------------------------------------

const AIK_T = {
  intro: { bars: 2, chords: ['A5', 'A5'], tones: ['A A# G#', 'A E A#'],
    bass: { s: 'X___________ X___________', n: 'A1 A1' },
    lead: { s: 'x__x__x__x__ x__x__x__x__', n: 'C5 B4 E5 A#4 A#4 G#4 A4 E5' } },
  build: { bars: 2, chords: ['A7', 'A7'], tones: ['A C# E', 'A G A#'],
    bass: { s: 'x__x__x__x__ x__x__x__x__', n: 'A1 A2 A1 A2 A2 A1 A2 A1' },
    lead: { s: 'X_____X_____ x__x__xx_x_x', n: 'E5 C#5 G5 C#5 A4 A#4 E5 G5' } },
  riff: { bars: 2, chords: ['A', 'A'], tones: ['A C# E', 'A C F'],
    bass: { s: 'x_xxx_x_xxxx x_xxx_x_xxxx', n: 'A2 A1 C#2 C2 A1 C2 C#2 A1 E2 A1 A1 C#2 C2 A1 B1 C2 A1 E2' },
    gtr: power('x_xxx_x_xxxx x_xxx_x_xxxx', 'A2 A2 C#3 C3 A2 C3 C#3 A2 E2 A2 A2 C#3 C3 A2 B2 C3 A2 E2'),
    riff: { s: 'x__x__x__x__ x__x__x__x__', n: 'E4 F4 E4 F4 E4 F4 G4 F4' },
    chant: say('X__x__X_____ X__x__X_____', 'E4 E4 A3 C#4 C4 A3', 'all iz nohn') },
  harp: { bars: 2, chords: ['A', 'A | D C# E'], tones: ['A C# D', 'A D E'],
    bass: { s: 'x__x__x__x__ x__x__x_xx__', n: 'A1 A1 A1 A1 A1 A1 D2 C#2 E2' },
    gtr: power('X_____X_____ X_____x_xx__', 'A2 A2 A2 D3 C#3 E3'),
    lead: { s: 'x_x___xxxx_x x__x__x__x__', n: 'C5 D5 D5 D#5 D5 B4 A4 C#5 D5 D5 E4' } },
  verse: { bars: 2, chords: ['A', 'A'], tones: ['A E F', 'A E F#'],
    bass: { s: 'xxxxx_x_xxxx xxx_x_xxx_xx', n: 'C2 A1 B1 C#2 A1 B1 C2 B1 A1 E2 B1 A1 E2 A1 C2 B1 C2 A1 E2' },
    gtr: power('X_____X_____ X_____X_____', 'A2 A2 A2 E2'),
    riff: { s: 'x__x__x__x__ x__x__x__x__', n: 'E4 F4 F#4 F4 E4 F4 F#4 G4' },
    chant: say('X__x__X_____ X__x__X_____', 'E4 E4 A3 E4 F4 E4', 'all iz nohn') },
  brk: { bars: 2, chords: ['A5', 'A5'], tones: ['A D G', 'A E D#'],
    bass: { s: 'X___________ X___________', n: 'A1 A1' },
    lead: { s: 'x_x_xxx_x_x_ ___x_xx_x_x_', n: 'D5 G4 D5 G4 D5 B4 B4 E4 E5 D#5 C#5 D5' } },
  end: { bars: 2, chords: ['C | C# | D', 'C# | D'], tones: ['C# D A', 'C# A D#'],
    bass: { s: 'xxxx_xxxxx__ xxx__xxxx_xx', n: 'C2 B1 C2 D2 C#2 D2 C2 D2 C#2 C2 B1 C#2 D2 C#2 D2 C#2 C2 C#2' },
    gtr: power('xxxx_xxxxx__ xxx__xxxx_xx', 'C3 B2 C3 D3 C#3 D3 C3 D3 C#3 C3 B2 C#3 D3 C#3 D3 C#3 C3 C#3'),
    lead: { s: 'X_____X_____ X_____X_____', n: 'G5 F#5 E5 F#5' } },
};

const ALL_IS_KNOWN = {
  meter: '6/8', spb: 12, rot: 0, bpm: 105.6, finalPlus: 6, mix: 0.72, finalMix: 0.64,
  arp: 'x.x.x.x.x.x.',
  tracks: [
    ...garage(),
    bass('pick grind'),
    guitar('fuzz lead', 0.4),
    // The harmonica: the oboe's reed cycle, a little detuned for the two reeds, a quick vibrato.
    reed('lead', 'oboe', { vol: 0.4, warm: 0.6, detune: 0.2, decay: 0.7, fx: { chorus: { wet: 0.2, rate: 0.6, depth: 0.3 } } }),
    choir(0.5),
    chip(0.2),
    organ(0.26),
    verbBus(2.2, 0.28, 0.18),
  ],
  grooves: {
    // The stomp: the kick on the four beats, the snare and hats on the six (three against two).
    groove: (final) => final
      ? { kick: 'X..X..X..X.x', snare: '....X...X..o', hat: 'XxxxXxxxXxxx', 'open hat': '..x...x...x.' }
      : { kick: 'X..X..X..X..', snare: '....X...X...', hat: 'X.x.X.x.X.x.' },
    half: (final) => ({ kick: 'X.....X.....', snare: final ? '....X...X...' : '', ride: 'x..x..x..x..' }),
    none: () => ({}),
  },
  fill: { kick: 'X.....x.....', snare: '....x...rrRR', hat: 'X.x.X.x.....', 'open hat': '', ride: '', 'tom hi': '......x.x...', 'tom lo': '.........x.x' },
  order: ['intro', 'build', 'riff', 'verse', 'harp', 'riff2', 'brk', 'end'],
  finalOrder: ['riff', 'verse', 'harp', 'riff2', 'end', 'build', 'harp2', 'end2'],
  sections(final) {
    const T = AIK_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: final ? 'half' : 'none', crash: final, use: { guitar: null } }),
      build: s('build', { drums: 'half', use: { guitar: null } }),
      riff: s('riff', { extra: final ? { 'chip lead': up(bare(once(T.riff.chant, 12)), 1) } : {} }),
      riff2: s('riff', { extra: { 'chip lead': up1('riff', 'riff') } }),
      verse: s('verse'),
      harp: s('harp'),
      harp2: s('harp', { extra: { voice: once(T.riff.chant, 12), 'chip lead': up1('harp', 'lead') } }),
      brk: s('brk', { drums: 'half', use: { guitar: null } }),
      end: s('end', { extra: final ? { 'chip lead': up1('end', 'lead') } : {} }),
      end2: s('end', { extra: { voice: once(T.verse.chant, 12), 'chip lead': up(bare(tile4(this, T.end, 'bass')), 2) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. The Wheel (remix): the somber jazz in seven, keys-led, the locked groove.
//
// Measured (Live in Bulgaria '25, the soundboard, 409 s, the music from
// 4.5 s): the band's phrase repeats every 2.398 s in seven beats (0.3425 s,
// 175.2 bpm), the onsets between the beats two-thirds of the way through them
// (swung eighths), so 7/4, swung; the kick on one, three and four, the snare
// on four, nothing on five to seven but the ride. Key: C# minor (C#, F#,
// G#, E the strongest), the keys turning C#-C-B and C#-D over a C# pedal, the
// verse's bass falling C#-G-G#-C# (the G its tritone), the chorus on F# with
// the F under it and E and G round it. The chords are the sections' chroma,
// C#m (C#-E-G#) and F#m7 under the chorus: the bars' own strongest tones are
// the keys' passing C and D, and voiced as chords they turned the song major.
// Section map:
//   intro      4-84 s    quiet: the C# drone, the keys circling C#, G, F, C, D
//   jam       94-144 s   the C# pedal, G# on three, the keys C#-C-C#
//   chorus   144-184 s   F#: the bass F#-F-F#-F-F#, F, F#, E, G over it (Stu's)
//   verse    184-224 s   the bass C#-G-G#-C#, G#, C and C# over it (Ambrose's)
//   chorus2  224-264 s   F# again
//   verse2   264-324 s   the bass C#-F#-G-C#, G#-G-A over it
//   climax   330-404 s   loud: the bass falling C#-C-B-G-C#, the keys up to C#5 and D5
// Lap 175.2 bpm, final lap 183.2 (the beat; seqbaby counts the bar in
// triplet-eighth steps, 21/16, so 131.4 and 137.4). A walking bass, the riff
// on a jazz guitar, the Rhodes on the chords, the flute on the top line,
// "the wheel" on the choir, the chip arp in swung eighths; the garage kit on
// the ride.
// ---------------------------------------------------------------------------

const TW_T = {
  intro: { bars: 2, chords: ['C#m', 'C#m'], tones: ['C# E G#', 'C# E C'],
    bass: { s: 'X____________________ X____________________', n: 'C#2 C#2' },
    riff: { s: 'x____x__x__xx_xx_____ x_____x_____x________', n: 'C#4 G3 C#4 F3 C4 D4 C#4 C#4 E3 C4' } },
  jam: { bars: 1, chords: ['C#m'], tones: ['C# G# E'],
    bass: { s: 'x__x__x__x__x__x__x__', n: 'C#2 C#2 G#2 C#2 C#2 C#2 C#2' },
    riff: { s: 'x_xx__x_x_________x_x', n: 'C#4 C4 C#4 C4 C#4 C4 C#4' },
    lead: { s: 'X________x_____x_____', n: 'G#5 C6 C#6' } },
  chorus: { bars: 1, chords: ['F#m7'], tones: ['F# A E'],
    bass: { s: 'x__x________x_xx_____', n: 'F#2 F2 F#2 F2 F#2' },
    riff: { s: 'x_____x__x_____x__x__', n: 'F#3 F3 E3 F#3 G3' },
    lead: { s: 'X_____x__x__X________', n: 'C5 B4 C5 C#5' },
    chant: say('x__X_________________ x__X_________________', 'F#4 F4 E4 F4', 'the weel') },
  verse: { bars: 1, chords: ['C#m | G | G# | C#'], tones: ['C# E G#'],
    bass: { s: 'x_____x_xx_____x_xx__', n: 'C#3 G2 G#2 C#2 C#3 G2 C#3' },
    riff: { s: 'x_____x__x____x___x__', n: 'C#4 G3 G#3 C4 C#4' },
    chant: say('x__X_________________ .....................', 'C#4 G#3', 'the weel') },
  verse2: { bars: 1, chords: ['C#m | F# | G | C#'], tones: ['C# G# E'],
    bass: { s: 'xx_x__x__x_x___x_____', n: 'C#3 F#2 C#3 F#2 G2 C#2 C#3' },
    riff: { s: 'x_____x__x__x_____x__', n: 'C4 G#3 G3 A3 C#4' },
    lead: { s: 'X________X________x__', n: 'G#5 G5 A5' } },
  climax: { bars: 1, chords: ['C#m | C B G | C#'], tones: ['C# E G#'],
    bass: { s: 'x____xx_xx_x___x_____', n: 'C#3 C3 B2 G2 C#3 C#2 C#3' },
    riff: { s: 'x_xx__x_x_________x_x', n: 'C#4 C4 C#4 C4 C#4 C4 C#4' },
    lead: { s: '.........x_x___X_____', n: 'C#5 D5 C#5' } },
};

const THE_WHEEL = {
  meter: '21/16', spb: 21, rot: 0, bpm: 131.4, finalPlus: 6, mix: 0.73, finalMix: 0.66,
  arp: 'x.xx.xx.xx.xx.xx.xx.x',
  tracks: [
    ...garage({ ride: 0.7 }),
    bass('walking jazz', 0.9),
    guitar('jazz box', 0.42),
    { name: 'lead', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.36 }, out: 'verb', fx: { chorus: { wet: 0.15 } } },
    choir(0.48, 'angel ooh'),
    chip(0.16),
    rhodes(0.42),
    verbBus(3, 0.34, 0.2),
  ],
  grooves: {
    // Seven, swung: the kick on one, three and four, the snare on four, the ride's ding-ding-a.
    groove: (final) => final
      ? { kick: 'X.....x..X.....x..x..', snare: '...x.....X.....x..x.x', ride: 'x.xx.xx.xx.xx.xx.xx.x', hat: '...x.....x.....x.....' }
      : { kick: 'X.....x..x...........', snare: '.........X..........x', ride: 'x..x.xx..x.xx..x.xx..', hat: '...x.....x.....x.....' },
    quiet: (final) => ({ kick: 'X....................', snare: final ? '.........x...........' : '', ride: 'x..x..x..x..x..x..x..' }),
  },
  fill: { kick: 'X.....x..............', snare: '.........x..x..x.rrRR', ride: 'x..x..x..x...........', hat: '', 'open hat': '', 'tom hi': '...........x.x.......', 'tom lo': '..............x.x....' },
  order: ['intro', 'jam', 'chorus', 'verse', 'chorus2', 'verse2', 'climax', 'climax2'],
  finalOrder: ['chorus', 'jam', 'verse', 'climax', 'chorus2', 'verse2', 'climax2', 'chorus3'],
  sections(final) {
    const T = TW_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'quiet', crash: false, use: { bass: final ? 'bass' : null } }),
      jam: s('jam', { drums: final ? 'groove' : 'quiet' }),
      chorus: s('chorus', { extra: final ? { 'chip lead': up(bare(once(T.chorus.chant, 21)), 1) } : {} }),
      chorus2: s('chorus', { extra: { 'chip lead': up1('chorus', 'lead') } }),
      chorus3: s('chorus', { extra: { 'chip lead': up(bare(once(T.chorus.chant, 21)), 1) } }),
      verse: s('verse'),
      verse2: s('verse2'),
      climax: s('climax'),
      climax2: s('climax', { extra: { voice: once(T.chorus.chant, 21), 'chip lead': up1('climax', 'riff') } }),
    };
  },
};

export const SONGS = [
  ...cue('muddy water', 'muddy-water-remix', MUDDY_WATER),
  ...cue('the great chain of being', 'great-chain-of-being-remix', GREAT_CHAIN),
  ...cue('all is known', 'all-is-known-remix', ALL_IS_KNOWN),
  ...cue('the wheel', 'the-wheel-remix', THE_WHEEL),
];
