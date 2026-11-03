// The All Stars Cup #1's remixes, written in seqbaby.
//
// Eight cues, the cup's four songs from four records, each a lap cut and a
// faster final-lap cut (busier drums, the hook up front):
//
//   straws-in-the-wind-remix(-final-lap)   "Straws in the Wind" (K.G., 2020)
//   cyboogie-remix(-final-lap)             "Cyboogie" (Fishing for Fishies, 2019)
//   the-grim-reaper-remix(-final-lap)      "The Grim Reaper" (Omnium Gatherum, 2022)
//   gaia-remix(-final-lap)                 "Gaia" (Omnium Gatherum, 2022)
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json), a soundboard each: Straws in
// the Wind from Live at Field of Vision '25 (2025-08-16), Cyboogie from Live
// in Berlin '25, The Grim Reaper from Live in New York City '25 (Rock Night)
// and Gaia from Live in Lithuania '25. No tab could be reached, so it is the
// recordings alone. No audio from the recordings goes in: these are notes.
// The four come from four records and keep their own meters and sounds: Straws
// in the Wind is an acoustic boogie in three (a strummed clean guitar,
// harmonica, sitar and flute), Cyboogie a synth boogie in a shuffle (a Moog bass, a
// sequenced synth, the vocoder on a robot choir), The Grim Reaper a slow
// hip-hop groove under a bağlama riff with the modular synths' outro, and Gaia
// drop-B metal in nine (chugging power chords, a lead guitar). The hooks, the
// songs' titles, are sung on one choir voice, and a chip arp plays the video
// game on top. Each remix is the song's highlights in the song's own order,
// eight sections of four bars, every section handing to the next with a fill
// and a crash so the loop has no seam.
//
// How the recordings were measured, as the Gumboot Soup Cup's were
// (tools/gumboot-soup-cup-songs.mjs): the tempo by the vector strength of the
// percussive onsets over beat periods in 0.05 bpm steps across a minute or
// two of a steady groove, checked against the onset autocorrelation; the bar
// from the lag at which the harmonic constant-Q spectrum repeats best,
// refined in 0.02% steps; the subdivision from the onset autocorrelation
// (Cyboogie's thirds of a beat, Gaia's nine eighths); the downbeat from the
// kick band folded on the bar; the key from chroma (Krumhansl, the tuning
// pinned to 0: all four within 5 cents of A440); a bar-by-bar map of each
// song's bass and two strongest pitch classes for its sections; and per
// section, folded over every repeat of its bar or bars, each step's strongest
// constant-Q note of the harmonic stem in E1-E3 (the bass), the three
// strongest in E3-E6 (the riffs and the lead lines), each bar's three
// strongest pitch classes (the chords and the arp), and the kick, snare and
// hat onsets. The sung hooks are written over the measured tones in the
// singer's register; the words are the titles.
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
// 1. Straws in the Wind (remix): Ambrose's acoustic boogie in three.
//
// Measured (Live at Field of Vision '25, the soundboard, 590 s, the music
// 36.5-546.5 s): 171.1 bpm in 3/4 (a bar 1.055 s), quickening through the
// jam to about 176 (1.025 s); the kick on one and the and of two, the snare
// on two and three. The phrase is four bars (4.2 s): B | C#m | C#m | E, the
// bass walking B-D-C#, C#-C-B-C-D and E-D#-D-G#-A-C back round, the guitars
// grinding F#-F-G and G#-G over it, with long stretches on the C# pedal
// between. Key: C# minor (C#, B, G#, C, E the strongest). Section map:
//   intro      40-65 s    the C# pedal, the acoustic picking G#-E-C#, B and D# pick-ups
//   verse      65-82 s    the C# pedal, G#-G over it
//   cycle      82-125 s   the phrase, B | C#m | C#m | E (and 133-180 s, 200-240 s, 330-345 s), "straws in the wind"
//   jam       400-500 s   the long jam on C#, the bass dipping to B and D
//   grind     355-395 s   the bass rocking C-C#, the lead high on G#-D#-F#-F-C#
// Lap 173 bpm, final lap 181. Counted two bars of three to a seqbaby bar
// (6/4), so a section is the song's eight-bar phrase twice over. A bass on
// fingers, the strummed clean guitar, the harmonica on the top line, the sitar in
// the grind and the jam, Stu's flute in the intro, the organ on the chords,
// "straws in the wind" on the choir, the chip arp on the beat; the garage kit.
// ---------------------------------------------------------------------------

const W12 = 'x_x_x_x_x_x_';
const SW_T = {
  intro: { bars: 2, chords: ['C#m', 'C#m'], tones: ['C# G# E', 'C# G# E'],
    bass: { s: 'X___________X___________ X___________x_____x_x___', n: 'C#2 C#2 C#2 C#2 B1 D#2' },
    riff: { s: `${W12}${W12} ${W12}${W12}`, n: 'G#4 G#4 E4 C#4 E4 F4 E4 E4 E4 C#4 C#4 C#4 G#4 G4 G#4 C#4 C#4 C#4 C#5 C#5 C#5 C#5 G#4 G#4' },
    flute: { s: 'X_______________________ X___________X___________', n: 'G#5 E5 C#5' } },
  verse: { bars: 2, chords: ['C#m', 'C#m'], tones: ['C# G# G', 'C# G# G'],
    bass: { s: rep('x___x___x___', 4), n: 'C#2 C#2 C#3' },
    gtr: power(rep('x___x___x___', 4), 'C#3'),
    lead: { s: 'X_____x___x_X_____x___x_ X_____x___x_X_____x_____', n: 'G#4 G4 G#4 G#4 G4 G#4 G#4 G4 G#4 G#4 A4' } },
  cycle: { bars: 2, chords: ['B | C#m', 'C#m | E'], tones: ['C# B F#', 'C# E G#'],
    bass: { s: 'x___x_xxx__xX_____x_____ x_____xxxxx_x_____xxx_xx', n: 'B1 D2 B1 D2 C#2 C#2 C#2 C#2 C#2 C#2 C2 B1 C2 D2 E2 D#2 D2 G#1 A1 C2' },
    gtr: power(rep('x___x___x___', 4), 'B2 B2 B2 C#3 C#3 C#3 C#3 C#3 C#3 E3 E3 E3'),
    lead: { s: 'X___x___x___X_______x___ X___x___x___X_______x___', n: 'F#4 F4 E4 G#4 G4 G4 F#4 G#4 E4 F4' },
    chant: say('x___x___x___X___________', 'C#4 B3 G#3 C#4', 'strawz in the wind') },
  grind: { bars: 1, chords: ['C | C#'], tones: ['C# C G#'],
    bass: { s: 'x____x____xxx__x_xxxxxxx', n: 'C2 C#2 C#3 C2 C2 B1 C2 C#3 C#2 C2 C#2 C#3 C2' },
    gtr: power(rep('x___x___x___', 2), 'C3 C#3 C#3 C3 C#3 C#3'),
    sitar: { s: rep(W12, 2), n: 'G#4 D#5 F#4 F4 C#4 G#4 G#4 F#4 D#5 F4 C#4 G#4' } },
  jam: { bars: 1, chords: ['C#m'], tones: ['C# G# D'],
    bass: { s: 'x___x___x___x___x___x_x_', n: 'C#2 C#2 C#3 C#2 C#2 B1 D2' },
    gtr: power(rep('x___x___x___', 2), 'C#3'),
    sitar: { s: 'x_x_x___x___x_x_x___x___', n: 'C#5 D5 C#5 G#4 C#5 B4 G#4 E4' },
    lead: { s: 'X_______________________', n: 'C#5' } },
};

const STRAWS = {
  meter: '6/4', spb: 24, rot: 0, bpm: 173, finalPlus: 8, mix: 0.6, finalMix: 0.52,
  arp: 'x...x...x...x...x...x...',
  tracks: [
    ...drums(),
    ebass('svt fingers'),
    // The strummed acoustic on the clean chime guitar (polyphonic: plaits' string plays one note at a time).
    guitar('chime', 0.44),
    harmonica(0.36),
    sitar('sitar', 0.42),
    flute('flute', 0.32),
    choir(0.5),
    chip(0.16),
    pad('eorgan', 0.22),
    verbBus(2.4, 0.3, 0.18),
  ],
  grooves: {
    // In three: the kick on one and the and of two, the snare on two and three.
    groove: (final) => final
      ? { kick: 'X.....x.x...X.....x.x...', snare: '....X...X.......X...X..o', hat: 'xxXxxxXxxxXxxxXxxxXxxxXx', 'open hat': '..........x...........x.' }
      : { kick: 'X.....x.....X.....x.....', snare: '....X...X.......X...X...', hat: 'x.x.x.x.x.x.x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X...........X...........', snare: final ? '....X...X.......X...X...' : '', ride: 'x...x...x...x...x...x...' }),
  },
  fill: { kick: 'X.....x.....X.....x.....', snare: '....X...X.......x.x.rrRR', hat: 'x.x.x.x.x.x.............', 'open hat': '', ride: '', 'tom hi': '............x.x.........', 'tom lo': '................x.x.....' },
  order: ['intro', 'verse', 'cycle', 'verse2', 'cycle2', 'grind', 'jam', 'cycle3'],
  finalOrder: ['cycle', 'verse', 'cycle2', 'grind', 'jam', 'cycle3', 'grind2', 'cycle4'],
  sections(final) {
    const T = SW_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const sit = (k) => tile4(this, T[k], 'sitar');
    const hook = up(bare(once(T.cycle.chant, 24)), 1);
    return {
      intro: s('intro', { drums: 'half', extra: { flute: tile4(this, T.intro, 'flute') } }),
      verse: s('verse', { drums: final ? 'groove' : 'half' }),
      verse2: s('verse', { extra: { flute: tile4(this, T.intro, 'flute') } }),
      cycle: s('cycle', { extra: final ? { 'chip lead': hook } : {} }),
      cycle2: s('cycle', { extra: { 'chip lead': up1('cycle', 'lead') } }),
      cycle3: s('cycle', { extra: { 'chip lead': hook } }),
      cycle4: s('cycle', { extra: { sitar: up(bare(tile4(this, T.cycle, 'lead')), 0), 'chip lead': hook } }),
      grind: s('grind', { extra: { sitar: sit('grind') } }),
      grind2: s('grind', { extra: { sitar: sit('grind'), voice: once(T.cycle.chant, 24), 'chip lead': up1('grind', 'sitar') } }),
      jam: s('jam', { extra: { sitar: sit('jam') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Cyboogie (remix): the cyborg's synth boogie.
//
// Measured (Live in Berlin '25, the soundboard, 545 s, the music from 33.5 s
// to the segue at 405 s): 132.9 bpm, the onsets three to the beat (the
// autocorrelation's 0.151 s), so a shuffle, 12/8, a bar 1.806 s; the kick on
// every beat, the offbeat accent on the beat's last third, the bass an A
// pedal bouncing octaves. Key: A (A, E, C#, A#, G# the strongest: A major
// with its half-steps either side), the E and the F rubbing over it in the
// second half, and a bridge climbing B | E | F-F#-G | E. Section map:
//   intro      33-48 s    the G# under E and C, then G (the band coming in)
//   boogie     48-105 s   the A boogie, G# and A# round it, "cyboogie"
//   rub       105-190 s   the boogie, E and F over it
//   bridge    193-210 s   B | E | F-F#-G | E, the bass climbing (and 265-290 s)
// Lap 132.9 bpm, final lap 140.9 (the beat; seqbaby counts the bar as 6/8 of
// triplet-eighth steps, 99.68 and 105.68). A Moog bass, the sequenced synth
// on the riff (a percussive Moog), a Moog lead, the vocoder (a robot choir)
// on "cyboogie", a saw pad on the chords, the chip arp in the shuffle; the
// garage kit. Han-Tyumi's reversed speech at the end isn't taken.
// ---------------------------------------------------------------------------

const SH = 'x_xx_xx_xx_x';
const CY_T = {
  intro: { bars: 2, chords: ['G#', 'G#'], tones: ['G# E C', 'G# E G'],
    bass: { s: 'X_____X_____ X_____X_____', n: 'G#1 G#1 G#1 A1' },
    riff: { s: 'x__x__x__x__ x__x__x__x__', n: 'E4 C4 E4 G4 E4 C#4 E4 F4' } },
  boogie: { bars: 2, chords: ['A', 'A'], tones: ['A G# E', 'A A# E'],
    bass: { s: `${SH} ${SH}`, n: 'A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 G#1 A#1' },
    riff: { s: `${SH} ${SH}`, n: 'A3 A4 E4 A4 A3 A4 E4 A4 A3 A4 E4 A4 A3 A4 G#4 A#4' },
    lead: { s: 'X__x__X__x__ X__x__x__x__', n: 'A4 E5 A4 E4 A4 E5 C#5 B4' },
    chant: say('X__x__X_____ X__x__X_____', 'A3 C#4 A3 A3 G#3 A3', 'sai boo gee') },
  rub: { bars: 2, chords: ['A', 'A'], tones: ['A F E', 'A F E'],
    bass: { s: `${SH} ${SH}`, n: 'A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 E2' },
    riff: { s: `${SH} ${SH}`, n: 'A3 A4 F4 E4 A3 A4 F4 E4 A3 A4 F4 E4 A3 A4 F4 A4' },
    lead: { s: 'X_____x__x__ X_____x__x__', n: 'E5 F5 E5 A4 F4 E4' } },
  bridge: { bars: 4, chords: ['B', 'E', 'F | F# | G', 'E'], tones: ['B C A#', 'E D# F', 'F E F#', 'E D# B'],
    bass: { s: `${SH} ${SH} ${SH} ${SH}`, n: 'B1 B2 B1 B2 C2 D2 A#1 B1 E2 D#2 E2 E2 E2 F2 F2 F2 F#2 G2 G2 F#2 E2 B1 E2 D#2 D#2 E2 E2 D#2 E2 A#1 D2 A1' },
    riff: { s: 'X__x__X__x__ X__x__X__x__ X__x__X__x__ X__x__X__x__', n: 'B3 B3 C4 D4 E4 E4 E4 F4 F#4 G4 G4 F#4 E4 E4 D#4 E4' },
    lead: { s: 'X___________ X_____X_____ X_____X_____ X___________', n: 'B4 E5 F5 F#5 G5 E5' } },
};

const CYBOOGIE = {
  meter: '6/8', spb: 12, rot: 0, bpm: 99.68, finalPlus: 6, mix: 1.08, finalMix: 1,
  arp: 'x.xx.xx.xx.x',
  use: { guitar: null, synth: 'riff' },
  tracks: [
    ...drums({}, KIT.filter((x) => x !== 'ride')),
    moogBass(0.72),
    { name: 'synth', engine: 'dm:ladder', preset: 'percussive', params: { vol: 0.4 }, out: 'verb', fx: { delay: { sync: true, div: 0.75, fbk: 0.25, wet: 0.15 } } },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.36 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
    choir(0.55, 'robot choir'),
    chip(0.16),
    pad('bw_sawrounded', 0.2),
    verbBus(2, 0.26, 0.18),
  ],
  grooves: {
    // The shuffle: the kick on every beat, the snare on two and four, the hat on the triplets.
    groove: (final) => final
      ? { kick: 'X..X..X..X.x', snare: '...X.....X.o', hat: 'xxXxxXxxXxxX', 'open hat': '.....x.....x' }
      : { kick: 'X..X..X..X..', snare: '...X.....X..', hat: 'x.xx.xx.xx.x' },
    half: (final) => ({ kick: 'X.....X.....', snare: final ? '...X.....X..' : '......X.....', hat: 'x..x..x..x..' }),
  },
  fill: { kick: 'X.....x.....', snare: '...x..x.rrRR', hat: 'x..x..x.....', 'open hat': '', 'tom hi': '......x.x...', 'tom lo': '.........x.x' },
  order: ['intro', 'boogie', 'rub', 'bridge', 'boogie2', 'rub2', 'bridge2', 'boogie3'],
  finalOrder: ['boogie2', 'rub', 'bridge', 'boogie3', 'rub2', 'bridge2', 'boogie', 'boogie4'],
  sections(final) {
    const T = CY_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const hook = up(bare(once(T.boogie.chant, 12)), 1);
    return {
      intro: s('intro', { drums: 'half' }),
      boogie: s('boogie', { use: { lead: null } }),
      boogie2: s('boogie', { extra: final ? { 'chip lead': hook } : {} }),
      boogie3: s('boogie', { extra: { 'chip lead': up1('boogie', 'lead') } }),
      boogie4: s('boogie', { extra: { 'chip lead': hook } }),
      rub: s('rub', { use: { lead: null } }),
      rub2: s('rub', { extra: { voice: once(T.boogie.chant, 12), 'chip lead': up1('rub', 'riff') } }),
      bridge: s('bridge'),
      bridge2: s('bridge', { extra: { 'chip lead': up1('bridge', 'lead') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. The Grim Reaper (remix): Ambrose's rap over the bağlama.
//
// Measured (Live in New York City '25, Rock Night, the soundboard, 440 s, the
// music to 423.5 s): 101.05 bpm in 4/4 (a bar 2.374 s), the kick in a 3-3-2
// (one, the and of two, the a of three), the snare on two and four. Key: B
// (B, F#, A#, C, A the strongest), the bağlama's sample riff turning
// F#-G-F#-E-C-B over the B pedal, the bass dipping to A# under the snare;
// a stretch on the B drone with F#-F; a louder one with C against the B; and
// the modular synths' outro on B minor with its major seventh (B, D, F#, A#),
// the kick on every beat. Section map:
//   intro       0-15 s    D# and A# with D, the band coming in
//   verse      15-195 s   the B pedal, the bağlama riff, the bass dipping to A#, "the grim reaper"
//   drone     195-255 s   the B drone, F# and F over it
//   loud      270-345 s   the B pedal with C, the kick in fives
//   outro     374-423 s   the modular outro, B3 on every step, F#, D and A# round it
// Lap 101.05 bpm, final lap 109. A dub bass, the bağlama (a plucked string
// through a waveshaper) on the riff, the modular sequence on a percussive
// Moog, a cello cycle on the chords, "the grim reaper" on the choir, the chip
// arp in eighths; the garage kit, played as a breakbeat.
// ---------------------------------------------------------------------------

const GR_T = {
  intro: { bars: 1, chords: ['D#m'], tones: ['D# A# D'],
    bass: { s: 'X_______x_______', n: 'D#2 D2' },
    riff: { s: 'x___x___x___x___', n: 'A#4 D#5 D5 A#4' } },
  verse: { bars: 2, chords: ['B', 'B'], tones: ['B F# A#', 'B F# C'],
    bass: { s: 'X_____x__x____x_ X___x_x__x__xx_x', n: 'B1 B1 B1 C2 B1 A#1 B1 B1 A#1 A#1 A1' },
    riff: { s: 'x_xx__xxx_x___x_ x_x__xxx_xx__xxx', n: 'F#4 G4 F#4 E4 C4 B3 G4 E4 F#4 F#4 B3 E4 C4 F#4 F#4 B3 E4 G4' },
    chant: say('x_x_x___X_______ ................', 'B3 B3 A#3 B3', 'the grim ree per') },
  drone: { bars: 1, chords: ['B5'], tones: ['B F# F'],
    bass: { s: 'X_______________', n: 'B1' },
    riff: { s: 'x___x___x___x___', n: 'B3 F#4 B3 F4' } },
  loud: { bars: 1, chords: ['B | C | B'], tones: ['B F# C'],
    bass: { s: 'X_x__x_x__x_____', n: 'B1 B1 B1 C2 B1' },
    riff: { s: 'x___x_x___x_x_x_', n: 'F#4 B3 G4 F#4 B4 C5' },
    chant: say('x_x_x___X_______', 'B3 B3 C4 B3', 'the grim ree per') },
  outro: { bars: 1, chords: ['Bm(maj7)'], tones: ['B D A#'],
    bass: { s: 'X___X___X___X___', n: 'B1 B1 A#1 B1' },
    seq: { s: 'x_x_x_x_x_x_x_x_', n: 'B3 F#4 B3 D4 B3 A#3 B3 D4' } },
};

const GRIM_REAPER = {
  meter: '4/4', spb: 16, rot: 0, bpm: 101.05, finalPlus: 8, mix: 0.75, finalMix: 0.75,
  arp: 'x.x.x.x.x.x.x.x.',
  use: { guitar: null, baglama: 'riff', seq: 'seq' },
  tracks: [
    ...drums(),
    // A dub bass, round and nearly all fundamental (a Moog's odd harmonics put F# and F over the B).
    ebass('dub', 0.9),
    sitar('baglama', 0.5, 0.45),
    { name: 'seq', engine: 'dm:ladder', preset: 'percussive', params: { vol: 0.4 }, out: 'verb', fx: { delay: { sync: true, div: 0.75, fbk: 0.35, wet: 0.2 } } },
    choir(0.52, 'monk chant'),
    chip(0.16),
    pad('cello', 0.22),
    verbBus(2.6, 0.3, 0.2),
  ],
  grooves: {
    // The breakbeat: the kick in a 3-3-2, the snare on two and four.
    groove: (final) => final
      ? { kick: 'X.....X..X.X....', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx' }
      : { kick: 'X.....X..X......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    loud: (final) => ({ kick: final ? 'X.X..X.X..X..X..' : 'X.X..X....X.....', snare: '....X.......X...', hat: 'x.xxx.xxx.xxx.xx', 'open hat': '..............x.' }),
    four: (final) => ({ kick: 'X...X...X...X...', snare: final ? '....X.......X...' : '', hat: '..x...x...x...x.', 'open hat': final ? '......x.......x.' : '' }),
    half: (final) => ({ kick: 'X.........X.....', snare: final ? '....X.......X...' : '', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.....X.........', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'verse', 'verse2', 'drone', 'loud', 'loud2', 'outro', 'outro2'],
  finalOrder: ['verse2', 'loud', 'verse', 'outro', 'loud2', 'drone', 'outro2', 'verse3'],
  sections(final) {
    const T = GR_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'half' }),
      verse: s('verse', { extra: { voice: null } }),
      verse2: s('verse', { extra: final ? { 'chip lead': up(bare(once(T.verse.chant, 16)), 1) } : {} }),
      verse3: s('verse', { extra: { 'chip lead': up1('verse', 'riff') } }),
      drone: s('drone', { drums: 'half' }),
      loud: s('loud', { drums: 'loud', extra: { voice: null } }),
      loud2: s('loud', { drums: 'loud', extra: { 'chip lead': up1('loud', 'riff') } }),
      outro: s('outro', { drums: 'four' }),
      outro2: s('outro', { drums: 'four', extra: { voice: once(T.loud.chant, 16), 'chip lead': up1('outro', 'seq') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Gaia (remix): the drop-B metal in nine, on Cavs' beat.
//
// Measured (Live in Lithuania '25, the soundboard, 357 s, the music
// 74.5-346.5 s): the eighths at 268.7 a minute (0.223 s), the riff
// repeating every nine of them (2.01 s), so 9/8, the quarter 134.35 bpm; the
// kick on the first, second and sixth eighths and the last sixteenth, the
// snare on the third and the seventh. Key: B (B, F#, C, A#, A the strongest,
// drop B), the guitars grinding F#-F and F#-G over the chug (the tritone and
// the minor sixth). It ends a half-step up, on a C pedal (in four, the
// quarter at 114: kept in nine here). Section map:
//   intro      74-90 s    the bass creeping B-C-C#-C, B and C above, A#-B high
//   riff      104-165 s   the B chug, F#-F over it, then F#-G (and 185-250 s), "gaia"
//   erise     165-180 s   E with F, back to B with E and D#
//   gsec      250-280 s   G, then B with A# and C
//   turn      280-296 s   C | C# | F#, the turn
//   quiet     296-312 s   quiet: the B drone, F#-F
//   end       312-344 s   the C pedal, F#-F-E and G#-A over it
// Lap 134.35 bpm, final lap 142.35. A pick bass, the drop-B chug (root and
// octave) on a metal guitar, the high lines on a fuzz lead, a dark organ on the chords,
// "gaia" on the choir, the chip arp in eighths; the garage kit.
// ---------------------------------------------------------------------------

const CHUG = 'x_x_x_x_x_x_x_x_x_';
const GA_T = {
  intro: { bars: 2, chords: ['B | C', 'B | C# | C'], tones: ['B C A#', 'B C# C'],
    bass: { s: 'x_x_x_______x_x___ x_x___x___x____x__', n: 'B1 C2 B1 C2 B1 B1 C#2 C2 C#2 C2' },
    riff: { s: 'x___x___x___x___x_ x___x___x___x___x_', n: 'B3 C4 B3 C4 C#4 B3 C4 C#4 C4 B3' },
    lead: { s: 'X_______x_________ X_______x_________', n: 'B5 A#5 A#5 B5' } },
  riff: { bars: 2, chords: ['B5', 'B5'], tones: ['B F F#', 'B G F#'],
    bass: { s: `${CHUG} ${CHUG}`, n: 'B1' },
    gtr: chug(`x_xx_xx_x_xx_xx_x_ x_xx_xx_x_xx_xx_x_`, 'B1'),
    lead: { s: 'X___x___x___x_____ X___x___x___x_____', n: 'F#4 F4 F#4 B4 F#4 G4 F#4 B4' },
    chant: say('X_______x_________ X_______x_________', 'B3 F#3 B3 G3', 'gai a') },
  erise: { bars: 2, chords: ['E5', 'B5'], tones: ['E F B', 'B E D#'],
    bass: { s: `${CHUG} ${CHUG}`, n: 'E2 E2 E2 E2 E2 E2 E2 E2 F2 B1 B1 B1 B1 B1 B1 B1 D#2 E2' },
    gtr: chug(`x_xx_xx_x_xx_xx_x_ x_xx_xx_x_xx_xx_x_`, 'E2 E2 E2 E2 E2 E2 E2 E2 E2 F2 F2 B1 B1 B1 B1 B1 B1 B1 B1 B1 D#2 E2'),
    lead: { s: 'X_______x___x_____ X_______x___x_____', n: 'E4 F4 B4 D#4 E4 B3' } },
  gsec: { bars: 2, chords: ['G5', 'B5'], tones: ['G B F#', 'B A# C'],
    bass: { s: `${CHUG} ${CHUG}`, n: 'G1 G1 G1 G1 G1 G1 G1 G1 F#1 B1 B1 B1 B1 B1 A#1 B1 C2 B1' },
    gtr: chug(`x_xx_xx_x_xx_xx_x_ x_xx_xx_x_xx_xx_x_`, 'G1 G1 G1 G1 G1 G1 G1 G1 G1 F#1 F#1 B1 B1 B1 B1 B1 B1 B1 A#1 A#1 C2 B1'),
    lead: { s: 'X___x___x___x_____ X___x___x___x_____', n: 'F#4 G4 B4 G4 A#4 B4 C5 B4' } },
  turn: { bars: 2, chords: ['C | C#', 'F#'], tones: ['C B C#', 'F# F B'],
    bass: { s: `${CHUG} ${CHUG}`, n: 'C2 C2 C2 C2 C2 C#2 C#2 C#2 C#2 F#1 F#1 F#1 F#1 F#1 F#1 F#1 F1 F#1' },
    gtr: chug('X_____x_____X_____ X_____x_____X_____', 'C2 C2 C#2 F#1 F#1 F#1'),
    lead: { s: 'X_____x_____X_____ X_____x_____X_____', n: 'B4 C5 C#5 F#4 F4 B4' } },
  quiet: { bars: 1, chords: ['B5'], tones: ['B F F#'],
    bass: { s: 'X_________________', n: 'B1' },
    lead: { s: 'X_______x_________', n: 'F#4 F4' } },
  end: { bars: 2, chords: ['C5', 'C5'], tones: ['C F# E', 'C G# A'],
    bass: { s: `${CHUG} ${CHUG}`, n: 'C2 C2 C2 C2 B1 C2 C2 C2 C2 C2 C2 C2 C2 B1 C2 C2 C2 C2' },
    gtr: chug(`x_xx_xx_x_xx_xx_x_ x_xx_xx_x_xx_xx_x_`, 'C2'),
    lead: { s: 'X___x___x___x_____ X___x___x___x_____', n: 'F#4 F4 E4 F#4 G#4 A4 G#4 E4' },
    chant: say('X_______x_________ X_______x_________', 'C4 G3 C4 G#3', 'gai a') },
};

const GAIA = {
  meter: '9/8', spb: 18, rot: 0, bpm: 134.35, finalPlus: 8, mix: 0.76, finalMix: 0.7,
  arp: 'x.x.x.x.x.x.x.x.x.',
  tracks: [
    ...drums({}, KIT.filter((x) => x !== 'openhat')),
    ebass('pick grind', 0.88),
    guitar('scooped metal', 0.4),
    guitar('fuzz lead', 0.34, 'lead'),
    choir(0.52, 'monk chant'),
    chip(0.16),
    pad('eorgan', 0.18),
    verbBus(2.6, 0.28, 0.16),
  ],
  grooves: {
    // Nine eighths: the kick on the first, second and sixth and the last sixteenth, the snare on the third and seventh.
    groove: (final) => final
      ? { kick: 'XxX.......X.X...X.', snare: '....X.......X....o', ride: 'x.x.x.x.x.x.x.x.x.', hat: '.x.x.x.x.x.x.x.x.x' }
      : { kick: 'X.X.......X.....X.', snare: '....X.......X.....', ride: 'x.x.x.x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X.................', snare: final ? '........X.........' : '', ride: 'x...x...x...x...x.' }),
  },
  fill: { kick: 'X.......X.........', snare: '.........x.x.xrRRR', ride: 'x.x.x.x.x.........', hat: '', 'tom hi': '..........x.x.....', 'tom lo': '..............x.x.' },
  order: ['intro', 'riff', 'erise', 'riff2', 'gsec', 'turn', 'quiet', 'end'],
  finalOrder: ['riff', 'erise', 'riff2', 'gsec', 'end', 'riff3', 'turn', 'end2'],
  sections(final) {
    const T = GA_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'half', use: { guitar: 'riff' } }),
      riff: s('riff', { extra: final ? { 'chip lead': up(bare(once(T.riff.chant, 18)), 2) } : {} }),
      riff2: s('riff', { extra: { voice: null, 'chip lead': up1('riff', 'lead') } }),
      riff3: s('riff', { extra: { 'chip lead': up(bare(once(T.riff.chant, 18)), 2) } }),
      erise: s('erise'),
      gsec: s('gsec', { extra: { 'chip lead': up1('gsec', 'lead') } }),
      turn: s('turn'),
      quiet: s('quiet', { drums: 'half', use: { guitar: null } }),
      end: s('end'),
      end2: s('end', { extra: { 'chip lead': up1('end', 'lead') } }),
    };
  },
};

export const SONGS = [
  ...cue('straws in the wind', 'straws-in-the-wind-remix', STRAWS),
  ...cue('cyboogie', 'cyboogie-remix', CYBOOGIE),
  ...cue('the grim reaper', 'the-grim-reaper-remix', GRIM_REAPER),
  ...cue('gaia', 'gaia-remix', GAIA),
];
