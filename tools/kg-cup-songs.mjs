// The K.G. Cup's remixes, written in seqbaby (Minimum Brain Size's is in
// tools/minimum-brain-size-songs.mjs).
//
// Four cues, two of the cup's other songs from K.G. (2020), each a lap cut and a
// faster final-lap cut (busier drums, the hook up front):
//
//   automation-remix(-final-lap)    "Automation"
//   intrasport-remix(-final-lap)    "Intrasport"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json): Automation from Live in Athens
// '25 (the soundboard of 4 June 2025, track 2, the music 3.5-220.5 s), with
// Live at The Caverns '23 (2 June 2023, 0-197.5 s) as a check on the tempo;
// Intrasport from Live at Field of
// Vision '25 (the soundboard of 15 August 2025, track 7, 1.5-227.5 s). No tab
// could be reached, so it is the recordings alone, and no audio from them
// goes in: these are notes. K.G. is the second of the band's microtonal
// records (the 24-tone guitars and keys): its quarter-tones read as the
// half-steps either side of them (a G between F# and G#, an A# half-sharp
// between A# and B and C) and are written so, the leads bending between
// them. Each remix is the song's highlights in the song's own order, every
// section handing to the next with a fill and a crash so the loop has no
// seam. The hooks, the titles, are sung on one choir voice, with a chip arp on
// top.
//
// How the recordings were measured, as Minimum Brain Size's was
// (tools/minimum-brain-size-songs.mjs, after the Gumboot Soup and All Stars
// Cups'): the tempo first by the vector strength of the percussive onsets
// over the beat period in 0.0003 s steps across 30 s windows, checked against
// the onset autocorrelation (the sixteenth, the beat and the bar), then by a
// dynamic-programming beat tracker on the percussive onsets with that tempo
// as its prior, the mean beat over the whole song taken as the tempo; the
// bar from the lag at which the beat-by-beat constant-Q spectrum of the
// harmonic stem repeats best, and from where the harmony and the bass change
// when folded on the bar; the downbeat from those changes (the kick band, 30
// to 70 Hz, folded on the bar, was blurred by the bass in all three mixes);
// the key from chroma (Krumhansl, the tuning pinned to 0); a bar-by-bar map
// of each song's bass and three strongest pitch classes for its sections; and
// per section, folded over every repeat of its bar or bars, each sixteenth's
// strongest constant-Q note of the harmonic stem in E1-E3 (the bass, with how
// much it rose from the step before, for the attacks), the three strongest in
// E3-E6 (the riffs and the lead lines), each bar's three strongest pitch
// classes (the chords and the arp), and the kick, snare (1.5-4 kHz) and hat
// (8-11 kHz) onsets. The live drumming and the soundboard mixes, with the
// kick low under the bass, push the grid about, so the folds are noisy and the
// drum parts are written from the clearest of them; the bar-level map is the
// firm part. The sung hooks are written over the measured tones in the
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

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

const KIT = ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride'];
/** A real drummer's kit (salamander), with the ride. */
const drums = (vol = {}, pieces = KIT) => kit('salamander', { pieces, vol: { hihat: 0.75, ride: 0.6, ...vol } });
/** A drum machine for the house track: a siege kick tuned to the key, an FM clap, sampled hats, crash and toms. */
const machine = (root, { kick = 0.78, clap = 0.58 } = {}) => [
  { name: 'kick', engine: 'dm:siege', preset: '909', params: { vol: kick, sgehpf: 'on' }, note: root },
  { name: 'snare', engine: 'dm:lancet', preset: 'fm clap', params: { vol: clap, decay: 0.3, lncrtimbre: 0.1, lncrlevel: 0.15 } },
  { name: 'hat', engine: 'sampler', sample: 'salamander/hihat', drum: true, params: { vol: 0.6 } },
  { name: 'open hat', engine: 'sampler', sample: 'salamander/openhat', drum: true, params: { vol: 0.4 } },
  { name: 'crash', engine: 'sampler', sample: 'salamander/crash', drum: true, params: { vol: 0.48 } },
  { name: 'tom hi', engine: 'sampler', sample: 'salamander/tom1', drum: true, params: { vol: 0.58 } },
  { name: 'tom lo', engine: 'sampler', sample: 'salamander/tom2', drum: true, params: { vol: 0.62 } },
];
const ebass = (preset, vol = 0.85) => ({ name: 'bass', engine: 'dm:bass', preset, params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
/** A Moog bass (ladder), ducking under the kick. */
const moogBass = (vol = 0.7) => ({ name: 'bass', engine: 'dm:ladder', preset: 'model d bass', params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
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
/** The chords (section() voices each bar's measured tones on the `pad` track) on a wavetable cycle. */
const pad = (wave = 'eorgan', vol = 0.24) => reed('pad', wave, { vol, warm: 0.45, detune: 0.25, decay: 0.9, fx: { phaser: { wet: 0.3, rate: 0.3, depth: 0.5 } } });
/** The hooks on one choir voice (a voice is the dearest part on the audio thread). */
const choir = (vol = 0.5, preset = 'choir aah') => ({ name: 'voice', engine: 'dm:vox', preset, out: 'verb', params: { vol, sngvoices: 2 } });
/** The video game on top: a Moog voice through an 8-bit crusher. */
const chip = (vol = 0.18) => ({ name: 'chip arp', engine: 'dm:ladder', preset: 'percussive', params: { vol }, out: 'verb', fx: { crush: { bits: 6, rate: 1, wet: 0.55 } } });

// ---------------------------------------------------------------------------
// Putting a remix together (as tools/minimum-brain-size-songs.mjs does)
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
// 1. Automation (remix): the machine groove, the robot singing the title.
//
// Measured (Live in Athens '25, the soundboard, 253 s, the music 3.5-220.5
// s): 97.7 bpm in 4/4 (a beat of 0.614 s over the whole song, 97.5 to 99.4
// in 30 s windows; the onset autocorrelation's sixteenth 0.151 s and bar
// 2.450 s; the 146 bpm the quarter-note search finds is the same pulse
// counted in sixes of the sixteenth), the sixteenth 0.154 s. Live at The
// Caverns '23 runs it at 95.7 on the same grid. Key: F# (F# and C# by far
// the strongest pitch classes, Krumhansl F# major 0.82 and minor 0.78, so
// both the A and the A#), the F# a pedal with its quarter-tones (F and G)
// round it in the riff. The bass holds F# half a bar, turns down A-G#-G and
// lands on F# again on the and of four, every bar (the harmony's changes
// fall on the fourth beat when folded on the bar). Section map:
//   intro      4.5-27 s    the riff alone on F#3 with the F and the G, thin
//   verse       29-73 s    the F# groove, the voice on C#5 bending to D and C
//   chorus      73-90 s    F# | F# | C to A | B to G#-A, "automation" on F-E
//                          (again 112-124 and 154-163 s)
//   verse      92-154 s    the groove again
//   bridge    174-193 s    C# | A: the bass C# then G#-B, the lead D#5-E5-G#5-C6
//   outro     193-220 s    the F# groove
// Lap 97.7 bpm, final lap 105.7. A fingered bass, a funk guitar's stabs, a
// Moog on the lead line, the organ on the chords, "automation" on the robot
// choir (the song is about the machine taking over), the chip arp in
// sixteenths; the salamander kit, the kick pushing the ands.
// ---------------------------------------------------------------------------

const AU_T = {
  intro: { bars: 1, chords: ['F#'], tones: ['F# F G'],
    bass: { s: 'X_______x_____x_', n: 'F#1 F#1 F#2' },
    gtr: { s: 'x_x_xx__x_xx_x__', n: 'F#3 F#3 F3 F#3 F#4 F#3 G3 F#3' },
    lead: { s: 'X_______________', n: 'F#4' } },
  verse: { bars: 2, chords: ['F#', 'F#'], tones: ['F# C# F', 'F# C# G'],
    bass: { s: 'X__x__x_xx_xx_X_ X__x__xxX_x_x_X_', n: 'F#1 F#2 F#1 C#2 A1 G#1 G1 F#1 F#1 F#2 F#1 G1 A1 G1 A1 F#1' },
    gtr: power('x__x__x___x_x___ x__x__x___x_x___', 'F#3 F#3 F#3 A3 G#3 F#3 F#3 F#3 A3 G3'),
    lead: { s: 'X_______x_x_X___ X_______x___x_x_', n: 'C#5 C#5 D5 C#5 C#5 D5 D#5 C#5' } },
  chorus: { bars: 4, chords: ['F#', 'F#', 'A', 'B'], tones: ['F# F C#', 'F# C# G', 'C C# F#', 'B A# C'],
    bass: { s: 'X_x__xx___xx_xX_ X___x___X_x__xX_ X__x__X___x_x__x X___xx_x__xxx_X_',
      n: 'F#1 B1 G1 A1 G#1 G1 G1 F#1 F#1 F#1 A1 G1 C#2 F#1 F#1 F#1 C2 C2 A1 B1 B1 B1 G#1 A1 G#1 G1 B1 F#1' },
    gtr: power(rep('x__x__x___x_x___', 4), 'F#3 F#3 F#3 G3 F#3 F#3 F#3 F#3 A3 G3 F#3 F#3 C4 A3 A3 B3 B3 B3 G#3 A3'),
    lead: { s: 'X___x___x___x___ X_______x_______ X_______x___x___ X___x___x_______', n: 'F5 E5 F5 E5 C#5 C#5 C#5 B4 A#4 D#5 C#5 C5' },
    chant: say('X___x___x___X___', 'F4 E4 F4 E4', 'au to ma tion') },
  bridge: { bars: 2, chords: ['C#', 'A'], tones: ['C# C D', 'C# D A'],
    bass: { s: 'X__x__x_xx_xxx__ X_x___xx_x_xx_x_', n: 'C#2 C#2 C2 G#1 B1 G#1 B1 G#1 A1 C#2 A1 C#2 C#2 A1 A#1 C#2' },
    gtr: power(rep('x_x_x_x_x_x_x_x_', 2), 'C#3 C#3 C#3 C#3 G#2 B2 G#2 B2 A2 A2 A2 A2 E3 F3 D#3 E3'),
    lead: { s: 'X_______x_x_X___ X_____x_x_x___x_', n: 'D#5 C6 E5 C6 G#4 D#5 B5 E5 D#5' } },
};

const AUTOMATION = {
  meter: '4/4', spb: 16, rot: 0, bpm: 97.7, finalPlus: 8, mix: 0.86, finalMix: 0.83,
  arp: 'x.xx.x.xx.x.xx.x',
  use: { guitar: 'gtr' },
  tracks: [
    ...drums({ hihat: 0.6 }),
    ebass('svt fingers', 0.86),
    { name: 'guitar', engine: 'dm:guitar', preset: 'funk clean', params: { vol: 0.44, decay: 0.45 }, out: 'verb', fx: { autowah: { wet: 0.4 } } },
    // The lead line on a Moog voice, gliding over the quarter-tones.
    { name: 'lead', engine: 'dm:ladder', preset: 'vibrato lead', params: { vol: 0.3 }, out: 'verb', glide: 0.04, fx: { chorus: { wet: 0.2 } } },
    choir(0.55, 'robot choir'),
    chip(0.14),
    pad('eorgan', 0.18),
    verbBus(2.2, 0.26, 0.2),
  ],
  grooves: {
    // The kick pushing the ands (the band's pocket), the snare on two and four.
    groove: (final) => final
      ? { kick: 'X.x...x.X.x...x.', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '..............x.' }
      : { kick: 'X.x.....X.x...x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    // The riff alone: the kick on the one and the hats on the ride.
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.x.....X.......', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'verse', 'verse2', 'chorus', 'verse3', 'bridge', 'chorus2', 'outro'],
  finalOrder: ['chorus', 'verse', 'verse2', 'bridge', 'chorus2', 'verse3', 'intro', 'outro'],
  sections(final) {
    const T = AU_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const hook = up(bare(T.chorus.chant), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', use: { lead: null } }),
      verse: s('verse', { use: { lead: null }, extra: final ? { 'chip lead': { ...hook, s: hook.s + ' ' + '.'.repeat(48) } } : {} }),
      verse2: s('verse', { use: { lead: 'lead' } }),
      verse3: s('verse', { use: { lead: 'lead' }, extra: { 'chip lead': up1('verse', 'lead') } }),
      chorus: s('chorus', { use: { lead: 'lead' } }),
      chorus2: s('chorus', { use: { lead: 'lead' }, extra: { 'chip lead': up1('chorus', 'lead') } }),
      bridge: s('bridge', { use: { lead: 'lead' }, extra: final ? { 'chip lead': up1('bridge', 'lead') } : {} }),
      outro: s('verse', { use: { lead: 'lead' }, extra: { voice: once(T.chorus.chant, 16), 'chip lead': up1('verse', 'lead') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Intrasport (remix): the house track, four on the floor.
//
// Measured (Live at Field of Vision '25, the soundboard, 236 s, the music
// 1.5-227.5 s): 110.8 bpm in 4/4 (a beat of 0.542 s over the whole song,
// pushing from 107.7 in the first half minute to 112.4 from 151 s on; the
// onset autocorrelation's eighth 0.279 s, beat 0.546 s and bar 2.206 s; the
// 161.5 bpm the search finds in the first minute is the intro riff's figure,
// three to two beats), the kick on every beat and the clap on two and four.
// Key: G (Krumhansl G major 0.81; G and D the strongest pitch classes), G#
// and F# the quarter-tones round the G, the second chord an A# half-sharp
// (A#, B and C almost equal). Section map:
//   intro        3-67 s    the D pedal (with C# and D#), the bass pumping on
//                          the offbeat sixteenths, the guitar circling
//                          G3-G#3-A3; the band in full from 32 s
//   groove      67-103 s   G | A#: the bass G G G-G G G | A# A# A# C B C B,
//                          the lead G5-D5 | D5-A5 (again 136-170, 187-224 s)
//   break      103-112 s   D with C and B, quiet
//   build      112-130 s   no bass, the kick and the lead G5-G#5 | D5-A5-A#5
//                          over G (again 172-187 s)
// Lap 110.8 bpm, final lap 118.8. A drum machine (a siege kick tuned to G,
// an FM clap, hats), a Moog bass, a funk guitar's stabs, a Moog lead
// gliding over the quarter-tones, a pad, "intrasport" on the soul choir, the
// chip arp in sixteenths.
// ---------------------------------------------------------------------------

const IN_T = {
  intro: { bars: 2, chords: ['D', 'D'], tones: ['D C# D#', 'D C# D#'],
    bass: { s: '...X..Xx...X..Xx ...X..Xx...X..Xx', n: 'D2 D2 D1 D2 D2 D1' },
    gtr: { s: '...x..xx...x..xx ...x..xx...x..xx', n: 'G#3 G3 A3 G#3 G3 A3 G3 F#3 G#3 G#3 G3 A3' },
    lead: { s: 'X_______x_____x_ ................', n: 'D5 G5 F#5' } },
  groove: { bars: 2, chords: ['G', 'A#'], tones: ['G G# F#', 'A# B C'],
    bass: { s: 'X__x__x_x__x__x_ X__x__x_x_x_x_x_', n: 'G1 G1 G2 G1 G1 G2 A#1 A#1 A#2 C2 B1 C2 B1' },
    gtr: power('...x..x....x..x. ...x..x....x..x.', 'G3 G#3 G3 F#3 A#3 B3 A#3 C4'),
    lead: { s: 'X_____x_x_x_____ X___x___x___x___', n: 'G5 G4 G5 D5 D5 A5 G4 G5' },
    chant: say('x___x___X_______', 'G4 G4 D5', 'in tra sport') },
  build: { bars: 2, chords: ['G', 'G'], tones: ['G G# D', 'G G# D'],
    lead: { s: 'x_x_x_x_x_x_x_x_ x_x_x_x_x_x_x_x_', n: 'G5 G#5 G5 G#5 G5 G#5 G4 G#4 D5 A5 A#5 A5 A#5 A5 G5 G#5' } },
  brk: { bars: 1, chords: ['D'], tones: ['D C B'],
    bass: { s: 'X_______x___x___', n: 'D2 C2 B1' },
    lead: { s: 'X_______x___x___', n: 'D5 C5 B4' } },
};

const INTRASPORT = {
  meter: '4/4', spb: 16, rot: 0, bpm: 110.8, finalPlus: 8, mix: 0.84, finalMix: 0.81,
  arp: 'x.xx.x.xx.x.xx.x',
  use: { guitar: 'gtr' },
  tracks: [
    ...machine('G1'),
    moogBass(0.72),
    { name: 'guitar', engine: 'dm:guitar', preset: 'funk clean', params: { vol: 0.4, decay: 0.4 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.3 }, out: 'verb', glide: 0.04, fx: { chorus: { wet: 0.2 } } },
    choir(0.52, 'soul lead'),
    chip(0.13),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.22 }, out: 'verb' },
    verbBus(2.2, 0.26, 0.2),
  ],
  grooves: {
    // Four on the floor, the clap on two and four, the open hat on the offbeats.
    groove: (final) => final
      ? { kick: 'X...X...X...X...', snare: '....X.......X..o', hat: 'xx.xxx.xxx.xxx.x', 'open hat': '..x...x...x...x.' }
      : { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x...x...x...x...', 'open hat': '..x...x...x...x.' },
    // The break: the kick on one and three, the hats.
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '', hat: '..x...x...x...x.' }),
  },
  fill: { kick: 'X...X...X.X.X.X.', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'intro2', 'groove', 'brk', 'build', 'groove2', 'build2', 'groove3'],
  finalOrder: ['groove', 'build', 'groove2', 'intro2', 'brk', 'build2', 'groove3', 'groove4'],
  sections(final) {
    const T = IN_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', use: { lead: null } }),
      intro2: s('intro', { use: { lead: 'lead' } }),
      groove: s('groove', { use: { lead: null } }),
      groove2: s('groove', { extra: { 'chip lead': up1('groove', 'lead') } }),
      groove3: s('groove', { extra: { voice: null, 'chip lead': up1('groove', 'lead') } }),
      groove4: s('groove', { extra: { 'chip lead': up1('build', 'lead') } }),
      brk: s('brk', { drums: 'half' }),
      build: s('build'),
      build2: s('build', { extra: { voice: once(T.groove.chant, 16), 'chip lead': up(bare(tile4(this, T.build, 'lead')), 0) } }),
    };
  },
};

export const SONGS = [
  ...cue('automation', 'automation-remix', AUTOMATION),
  ...cue('intrasport', 'intrasport-remix', INTRASPORT),
];
