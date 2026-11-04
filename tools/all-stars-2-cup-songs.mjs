// The All Stars Cup #2's remixes, written in seqbaby.
//
// Eight cues, the cup's four songs from four records, each a lap cut and a
// faster final-lap cut (busier drums, the hook up front):
//
//   hot-wax-remix(-final-lap)            "Hot Wax" (Oddments, 2014)
//   sadie-sorceress-remix(-final-lap)    "Sadie Sorceress" (Omnium Gatherum, 2022)
//   empty-remix(-final-lap)              "Empty" (I'm in Your Mind Fuzz, 2014)
//   billabong-valley-remix(-final-lap)   "Billabong Valley" (Flying Microtonal Banana, 2017)
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json): Hot Wax from Live in Bulgaria
// '25 (the soundboard), Sadie Sorceress from Live at Red Rocks '22 (the
// band's bootlegger release, the only recording of it the catalogue keeps),
// Empty from Live at Field of Vision '25 (the soundboard) and Billabong Valley
// from Live in Sydney '25 (the soundboard). No tab could be reached, so it is
// the recordings alone. No audio from the recordings goes in: these are
// notes. The four keep their own meters and sounds: Hot Wax a garage stomp
// (fuzz, the spring reverb's clang, the "Surfin' Safari" lift in the chorus),
// Sadie Sorceress a boom-bap groove (a heavy bass walking chromatically, an
// electric piano on the recreated 1968 sample, a light organ), Empty a quiet
// waltz (a jangle guitar, an electric piano, a flute, the hats ticking like
// the record's mechanical clicks) and Billabong Valley microtonal rock (a fuzz
// guitar, the zurna on a reed cycle gliding between the notes, the slow climax
// in half time). The hooks, the songs' titles, are sung on one choir voice,
// and a chip arp plays the video game on top. Each remix is the song's
// highlights in the song's own order, eight sections of four bars, every
// section handing to the next with a fill and a crash so the loop has no seam.
//
// How the recordings were measured, as the Gumboot Soup and All Stars #1
// Cups' were (tools/gumboot-soup-cup-songs.mjs): the tempo by the vector
// strength of the percussive onsets over beat periods in 0.05 bpm steps
// across a minute or two of a steady groove, checked against the onset
// autocorrelation; the bar from the lag at which the harmonic constant-Q
// spectrum repeats best; the downbeat from the kick band folded on the bar;
// the key from chroma (Krumhansl, the tuning pinned to 0); a bar-by-bar map
// of each song's bass and two strongest pitch classes for its sections; and
// per section, folded over every repeat of its bar or bars, each step's
// strongest constant-Q note of the harmonic stem in E1-E3 (the bass), the
// three strongest in E3-E6 (the riffs and the lead lines), each bar's three
// strongest pitch classes (the chords and the arp), and the kick, snare and
// hat onsets. Billabong Valley is microtonal (the record's 24-tone guitars and
// zurna): its quarter-tones read as the half-steps either side (F# with F and
// G, the strongest pitch classes after it) and are written so, the zurna
// gliding between them. The sung hooks are written over the measured tones in
// the singer's register; the words are the titles.
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
// 1. Hot Wax (remix): the garage stomp, the spring reverb's clang.
//
// Measured (Live in Bulgaria '25, the soundboard, 211 s; the song to 165 s,
// the last 40 s running on at another tempo into the next): 162.4 bpm in
// 4/4 (a bar 1.478 s), the kick on one, the and of two, three and the and of
// three, the snare on two and four. Key: A (A, E, A#, C, B the strongest),
// the fuzz on A power chords with the A# rubbing against the A over them, the
// bass dipping to E and walking A#-F#-G-F# back; the chorus lifts to C and E
// ("Surfin' Safari"), the bridge drops to F and D#. Section map:
//   intro       7-47 s    the A riff, the bass turning A-A#-G-G#-A
//   verse      59-130 s   the A pedal, A-A# over it, the bass to E and A#-F#-G, "hot wax"
//   chorus     47-52 s    C | E | A | A, the lift (and 160-168 s), "hot wax"
//   bridge    130-142 s   F | D# | A | A
//   outro     142-165 s   A with D and C over it
// Lap 162.4 bpm, final lap 170.4. A pick bass, power chords on a fuzz
// guitar, the high line on a fuzz lead, the spring reverb's clang on a bell
// through a long room, the organ on the chords, "hot wax" on the choir, the
// chip arp in eighths; the garage kit.
// ---------------------------------------------------------------------------

const E16 = 'x_x_x_x_x_x_x_x_';
const HW_T = {
  intro: { bars: 2, chords: ['A5', 'A5'], tones: ['A G# A#', 'A A# G#'],
    bass: { s: 'x_xx_xx_________ x___x_x_________', n: 'A1 A#1 G1 G#1 A1 A1 A#1 A1' },
    gtr: power(`${E16} ${E16}`, 'A2') },
  verse: { bars: 2, chords: ['A5', 'A5'], tones: ['A A# E', 'A A# G#'],
    bass: { s: 'x_____xx____x_x_ x_x___xx__xxxx_x', n: 'A1 A1 E1 A#1 A1 A1 A1 A1 E1 A#1 F#1 G1 F#1 A1' },
    gtr: power(`${E16} ${E16}`, 'A2 A2 A2 A2 A2 A2 A#2 A#2 A2 A2 A2 A2 A2 A#2 G2 F#2'),
    lead: { s: 'X_____x_x_x_xX__ X_x_________x_xx', n: 'A#4 A4 A4 A4 A4 A#4 A#4 A4 C5 A#4 G#4' },
    chant: say('x_______X_______ ................', 'A3 A3', 'hot waks') },
  chorus: { bars: 4, chords: ['C', 'E', 'A', 'A'], tones: ['C E G', 'E G# B', 'A C E', 'A C# E'],
    bass: { s: rep('X_______x_______', 4), n: 'C2 C2 E2 E2 A1 A1 A1 E1' },
    gtr: power('X_______x_______ X_______x_______ X_______x_______ X___x___x___x___', 'C3 C3 E3 E3 A2 A2 A2 A2 A2 A2'),
    chant: say('x___X___________ x___X___________ x___X___________ ................', 'G4 E4 G#4 E4 A4 E4', 'hot waks') },
  bridge: { bars: 4, chords: ['F', 'D#', 'Am', 'A'], tones: ['F A G#', 'D# A# G#', 'A C E', 'A E G#'],
    bass: { s: rep('X_______x_______', 4), n: 'F1 F1 D#1 D#1 A1 A1 A1 E1' },
    gtr: power(rep('X_______x_______', 4), 'F2 F2 D#2 D#2 A2 A2 A2 E2'),
    lead: { s: rep('X_______x_______', 4), n: 'A4 G#4 A4 G#4 C5 A4 E4 G#4' } },
  outro: { bars: 2, chords: ['A', 'A'], tones: ['A E D', 'A E C'],
    bass: { s: `${E16} ${E16}`, n: 'A1 A2' },
    gtr: power(rep('X___X___X___X___', 2), 'A2'),
    lead: { s: 'X_______x___x___ X_______x___x___', n: 'E5 D5 C5 E5 C5 A4' } },
};

const HOT_WAX = {
  meter: '4/4', spb: 16, rot: 0, bpm: 162.4, finalPlus: 8, mix: 0.64, finalMix: 0.63,
  arp: 'x.x.x.x.x.x.x.x.',
  tracks: [
    ...drums(),
    ebass('pick grind'),
    guitar('fuzz lead', 0.4),
    guitar('brit stack', 0.32, 'lead'),
    // The spring reverb Stu punched: a bell's clang into a long, wet room.
    { name: 'clang', engine: 'dm:hexop', preset: 'bell', params: { vol: 0.3 }, out: 'verb', fx: { shaper: { wet: 0.3, amount: 0.5 } } },
    choir(0.5),
    chip(0.16),
    pad('eorgan', 0.2),
    verbBus(3.4, 0.36, 0.22),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X.X...X.X.X.....', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '..............x.' }
      : { kick: 'X.....X.X.X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    // The chorus stomps: four on the floor, the open hat on the offbeats.
    stomp: (final) => ({ kick: 'X...X...X...X...', snare: '....X.......X...', hat: final ? 'xxxxxxxxxxxxxxxx' : 'x.x.x.x.x.x.x.x.', 'open hat': '..x...x...x...x.' }),
    half: (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.....X.........', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'verse', 'chorus', 'verse2', 'bridge', 'chorus2', 'outro', 'verse3'],
  finalOrder: ['chorus', 'verse', 'bridge', 'chorus2', 'verse2', 'outro', 'chorus3', 'verse3'],
  sections(final) {
    const T = HW_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const clang = { s: 'X_______________ ................', n: 'A3' };
    const hook = up(bare(T.chorus.chant), 1);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', extra: { clang } }),
      verse: s('verse', { extra: { voice: null } }),
      verse2: s('verse'),
      verse3: s('verse', { extra: { 'chip lead': up1('verse', 'lead') } }),
      chorus: s('chorus', { drums: 'stomp', extra: { clang, ...(final ? { 'chip lead': hook } : {}) } }),
      chorus2: s('chorus', { drums: 'stomp', extra: { 'chip lead': hook } }),
      chorus3: s('chorus', { drums: 'stomp', extra: { clang, 'chip lead': hook } }),
      bridge: s('bridge', { extra: { clang } }),
      outro: s('outro', { extra: { 'chip lead': up1('outro', 'lead') } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Sadie Sorceress (remix): Stu and Ambrose's boom-bap.
//
// Measured (Live at Red Rocks '22, the bootlegger release, 272 s, the music
// 26.5-250.5 s): 98.9 bpm in 4/4 (a bar 2.427 s), the beat a boom-bap. The
// riff is two bars, the bass walking chromatically between E and F
// (E-D#-F-F#-F-E; F, F#, D# and E the strongest pitch classes of the whole
// song), G, G# and A
// clustered over it on the keys; the intro is the recreated 1968 French pop
// sample, D over A, then A with B and E, and the end returns to it. Section
// map:
//   intro       0-25 s    the sample: D/A, B and F# high, then A with B and E
//   riff       25-245 s   the two-bar riff under the raps, "sadie sorceress"
//   break     232-245 s   the bass alone on E and F
//   outro     248-272 s   the sample again, quiet
// Lap 98.9 bpm, final lap 106.9. A dub bass, the electric piano on the
// sample and the stabs, the light organ on the chords, "sadie sorceress" on
// a soul voice, the chip arp in eighths; the garage kit, played as a
// boom-bap.
// ---------------------------------------------------------------------------

const SS_T = {
  intro: { bars: 2, chords: ['D/A', 'A'], tones: ['D A B', 'A B E'],
    bass: { s: 'x_x_x___________ X_______________', n: 'D2 A1 D2 A1' },
    riff: { s: 'X___x___x___x___ X_______x___x___', n: 'B4 F#5 F5 A#4 B4 D#5 E5' } },
  riff: { bars: 2, chords: ['E | F', 'E | F'], tones: ['F E G#', 'E F A'],
    bass: { s: 'xx__xx_____x_xxx xxxxx_x____x_xxx', n: 'D#1 E1 F1 F#1 F1 E1 F1 E1 E1 D#1 F1 F#1 F1 E1 F1 E1 F1 E1' },
    riff: { s: 'x___x___x___x___ x___x___x___x___', n: 'G#3 G3 A3 G#3 E3 G#3 F3 G#3' },
    chant: say('x_x_x_x_X_______ ................', 'F4 F4 F#4 F4 E4', 'say dee sor ser ess') },
  brk: { bars: 1, chords: ['E | F'], tones: ['E F G#'],
    bass: { s: 'X_______x_______', n: 'E1 F1' } },
};

const SADIE = {
  meter: '4/4', spb: 16, rot: 0, bpm: 98.9, finalPlus: 8, mix: 1.1, finalMix: 1,
  arp: 'x.x.x.x.x.x.x.x.',
  use: { guitar: null, keys: 'riff' },
  tracks: [
    ...drums(),
    ebass('dub', 0.9),
    { name: 'keys', engine: 'dm:hexop', preset: 'e.piano', params: { vol: 0.42 }, out: 'verb', fx: { chorus: { wet: 0.25 } } },
    choir(0.55, 'soul lead'),
    chip(0.16),
    pad('eorgan', 0.2),
    verbBus(2.2, 0.26, 0.16),
  ],
  grooves: {
    // Boom-bap: the kick on one, the and of two and the and of three, the snare on two and four.
    groove: (final) => final
      ? { kick: 'X.X....X..X.X...', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '..............x.' }
      : { kick: 'X......X..X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X.........X.....', snare: final ? '....X.......X...' : '', ride: 'x...x...x...x...' }),
  },
  fill: { kick: 'X.....X.........', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'riff', 'verse', 'riff2', 'verse2', 'brk', 'verse3', 'outro'],
  finalOrder: ['verse', 'riff', 'verse2', 'riff2', 'verse3', 'brk', 'verse4', 'riff3'],
  sections(final) {
    const T = SS_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const hook = up(bare(once(T.riff.chant, 16)), 1);
    return {
      intro: s('intro', { drums: 'half' }),
      outro: s('intro', { drums: 'half', extra: { 'chip lead': up1('intro', 'riff') } }),
      riff: s('riff', { extra: { voice: null } }),
      riff2: s('riff', { extra: { voice: null, 'chip lead': up1('riff', 'riff') } }),
      riff3: s('riff', { extra: { voice: null, 'chip lead': up(bare(tile4(this, T.riff, 'bass')), 3) } }),
      verse: s('riff', { extra: final ? { 'chip lead': hook } : {} }),
      verse2: s('riff', { extra: { 'chip lead': hook } }),
      verse3: s('riff', { extra: { 'chip lead': up1('riff', 'riff') } }),
      verse4: s('riff', { extra: { 'chip lead': hook } }),
      brk: s('brk', { drums: 'half' }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Empty (remix): the quiet waltz.
//
// Measured (Live at Field of Vision '25, the soundboard, 310 s, the music
// 1.5-238.5 s): 172.5 bpm in 3/4 (a bar 1.043 s), the kick on one and three,
// the snare on two. Key: C# minor (C#, G#, C, B, D the strongest), the C#
// pedal under nearly all of it, the bass leaning in from the C at the end of
// each bar, the guitar turning C#-G#-G-G#-C#-D; a turn through A, B, C and
// G#; and the bridge climbing D | D# | F# | C#, a fifth over each root (the D
// with the tritone G# over it). Section map:
//   verse      16-133 s   the C# pedal, the guitar's C#-G#-G-G#-C#-D/C, "empty"
//   turn       66-90 s    A | B | C | G#, back to C#
//   bridge    133-150 s   D | D# | F# | C#
// Lap 172.5 bpm, final lap 180.5. Counted two bars of three to a seqbaby bar
// (6/4), so a section is eight of the song's bars. A Motown bass, the riff on
// a jangle guitar, an electric piano cycle on the chords, the flute on the
// top line, "empty" on the choir, the chip arp on the beat; the garage kit
// light, the hats ticking like the record's mechanical clicks.
// ---------------------------------------------------------------------------

const W6 = 'x_x_x_x_x_x_';
const EM_T = {
  verse: { bars: 2, chords: ['C#m', 'C#m'], tones: ['C# G# G', 'C# G# C'],
    bass: { s: rep('X________x__', 4), n: 'C#2 C2' },
    riff: { s: `${W6}${W6} ${W6}${W6}`, n: 'C#4 G#3 G3 G#3 C#4 D4 C#4 G#3 G3 G#3 C#4 C4 C#4 G#3 G3 G3 C#4 D4 C#4 G#3 G3 G#3 C#4 C4' },
    lead: { s: 'X___________X___________ X___________X___________', n: 'G#4 G4 C#5 C5' },
    chant: say('X_______x_______________', 'C#4 C4', 'emp tee') },
  turn: { bars: 2, chords: ['A | B', 'C | G#'], tones: ['A E D#', 'C D# G#'],
    bass: { s: 'X___________X___________ X___________X___________', n: 'A1 B1 C2 G#1' },
    lead: { s: 'X_______x___X_______x___ X_______x___X_______x___', n: 'E5 D#5 F#5 D#5 D#5 B4 E5 C#5' } },
  bridge: { bars: 2, chords: ['D | D#', 'F# | C#'], tones: ['D A D#', 'F# C# G#'],
    bass: { s: rep('x___x___x___', 4), n: 'D2 G#2 D2 D#2 A#2 D#2 F#2 C#3 F#2 C#2 G#2 C#2' },
    lead: { s: 'X___x___x___X___x___x___ X___x___x___X___x___x___', n: 'F#5 D5 A4 A#4 G#5 E5 F#4 G#5 G5 C#5 C#6 G#5' } },
};

const EMPTY = {
  meter: '6/4', spb: 24, rot: 0, bpm: 172.5, finalPlus: 8, mix: 0.7, finalMix: 0.68,
  arp: 'x...x...x...x...x...x...',
  tracks: [
    ...drums({ hihat: 0.6 }, KIT.filter((x) => x !== 'openhat')),
    ebass('motown', 0.82),
    guitar('jangle', 0.4),
    flute('lead', 0.34),
    choir(0.48, 'angel ooh'),
    chip(0.14),
    pad('epiano', 0.26),
    verbBus(2.8, 0.32, 0.2),
  ],
  grooves: {
    // In three: the kick on one and three, the snare on two, the hats ticking every eighth.
    groove: (final) => final
      ? { kick: 'X...x...X...X...x...X...', snare: '....X...x.......X...x..o', hat: 'xxxxxxxxxxxxxxxxxxxxxxxx' }
      : { kick: 'X.......X...X.......X...', snare: '....X...........X.......', hat: 'x.x.x.x.x.x.x.x.x.x.x.x.' },
    half: (final) => ({ kick: 'X...........X...........', snare: final ? '....X...........X.......' : '', hat: 'x.x.x.x.x.x.x.x.x.x.x.x.', ride: 'x.......x.......x.......' }),
  },
  fill: { kick: 'X.......X...X...........', snare: '....X...........x.x.rrRR', hat: 'x.x.x.x.x.x.............', ride: '', 'tom hi': '............x.x.........', 'tom lo': '................x.x.....' },
  order: ['verse', 'verse2', 'turn', 'verse3', 'bridge', 'verse4', 'turn2', 'bridge2'],
  finalOrder: ['verse2', 'turn', 'bridge', 'verse3', 'verse4', 'bridge2', 'turn2', 'verse5'],
  sections(final) {
    const T = EM_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    const hook = up(bare(once(T.verse.chant, 24)), 1);
    return {
      verse: s('verse', { drums: final ? 'groove' : 'half', use: { lead: null }, extra: { voice: null } }),
      verse2: s('verse', { use: { lead: null }, extra: final ? { 'chip lead': hook } : {} }),
      verse3: s('verse', { extra: { voice: null, 'chip lead': up1('verse', 'riff') } }),
      verse4: s('verse', { extra: { 'chip lead': hook } }),
      verse5: s('verse', { extra: { 'chip lead': up1('verse', 'lead') } }),
      turn: s('turn'),
      turn2: s('turn', { extra: { voice: once(T.verse.chant, 24), 'chip lead': up1('turn', 'lead') } }),
      bridge: s('bridge', { drums: 'half' }),
      bridge2: s('bridge', { extra: { 'chip lead': up(bare(tile4(this, T.bridge, 'lead')), 0) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Billabong Valley (remix): the microtonal rocker, the zurna, the slow end.
//
// Measured (Live in Sydney '25, the soundboard, 433 s, the music 59.5-402.5
// s): 171.6 bpm in 4/4 (a bar 1.40 s) through the song, the kick on one and
// three, the snare on two and four; the climax slows to 127.1 (the remix
// plays it in half time). Key: F# (F#, C#, E, B the strongest), the F# drone
// under the riff with the quarter-tones round it read as F and G; the vocal
// sections move A | A | B | B and B | F# | E | C, a descent runs B | D#-D |
// B-A | G, and the climax rocks F-F# with E over it. Section map:
//   intro      40-60 s    quiet: the F# drone, the zurna
//   riff       96-140 s   the F# drone, the guitar on F#-F with C#, the bass to C#
//   verse     163-185 s   A | A | B | B, "billabong valley"
//   hook      185-207 s   B | F# | E | C
//   descent   207-228 s   B | D#-D | B-A | G
//   climax    330-395 s   slowed: F | F#, E and C# over it
// Lap 171.6 bpm, final lap 179.6. A pick bass, the riff and power chords on a
// fuzz guitar, the zurna (a reed cycle through a waveshaper, gliding between
// notes for the quarter-tones), the organ on the chords, "billabong valley"
// on the choir, the chip arp in eighths; the garage kit.
// ---------------------------------------------------------------------------

const BV_T = {
  intro: { bars: 2, chords: ['F#5', 'F#5'], tones: ['F# C# G#', 'F# C# A'],
    bass: { s: 'X_______________ X_______________', n: 'F#1 F#1' },
    lead: { s: 'X_______x_______ X___x___x_______', n: 'F#4 F4 F#4 G4 F4' } },
  riff: { bars: 2, chords: ['F#5', 'F#5'], tones: ['F# F C#', 'F# C# G'],
    bass: { s: 'X_______x_______ X_____x___x_____', n: 'F#1 F#1 F#1 C#2 F#1' },
    riff: { s: 'x_xx_x_xx_xx_x_x x_xx_x_xx_xx_x_x', n: 'F#3 F3 F#3 F#3 F3 F#3 C#4 F#3 F3 F#3 F#3 F3 F#3 C#3 C#3 F#3 C#4 F#3 G3 F#3' },
    lead: { s: 'X_______x_x_X___ X_______x_x_X___', n: 'C#5 F#4 G4 F#4 C#5 C#5 B4 C#5' } },
  verse: { bars: 4, chords: ['A', 'A', 'B', 'B'], tones: ['A E C#', 'A E F', 'B F# D#', 'B F# F'],
    bass: { s: rep('X_______x_______', 4), n: 'A1 A1 A1 E1 B1 B1 B1 F#1' },
    gtr: power(rep('X___x___X___x___', 4), 'A2 A2 A2 A2 A2 A2 A2 A2 B2 B2 B2 B2 B2 B2 B2 B2'),
    chant: say('x_x_x_x_X_______ ................ x_x_x_x_X_______ ................', 'C#4 C#4 B3 A3 E4 D#4 D#4 C#4 B3 F#4', 'bil a bong val ee') },
  hook: { bars: 4, chords: ['B', 'F#', 'E', 'C'], tones: ['B F# F', 'F# C# G', 'E F B', 'C F# F'],
    bass: { s: rep('X_______x_______', 4), n: 'B1 B1 F#1 F#1 E1 E1 C2 C2' },
    gtr: power(rep('X___x___X___x___', 4), 'B2 B2 B2 B2 F#2 F#2 F#2 F#2 E2 E2 E2 E2 C3 C3 C3 C3'),
    lead: { s: rep('X_______x_______', 4), n: 'F#4 F4 C#5 G4 B4 F4 F#4 F4' } },
  descent: { bars: 4, chords: ['B', 'D# | D', 'B | A', 'G'], tones: ['B C# F#', 'D# C D', 'B A F#', 'G D F#'],
    bass: { s: 'X_______________ X_______x_______ X_______x_______ X_______________', n: 'B1 D#2 D2 B1 A1 G1' },
    gtr: power('X_______________ X_______x_______ X_______x_______ X_______________', 'B2 D#3 D3 B2 A2 G2'),
    lead: { s: rep('X___x___x___x___', 4), n: 'F#4 C#5 B4 F#4 D#5 D5 C5 C#5 B4 A4 F#4 A4 G4 F#4 D5 G4' } },
  climax: { bars: 2, chords: ['F', 'F#'], tones: ['F E F#', 'F# C# G'],
    bass: { s: 'X_______________ X_______________', n: 'F1 F#1' },
    gtr: power('X_______X_______ X_______X_______', 'F2 F2 F#2 F#2'),
    lead: { s: 'X_______x_______ X_______x_______', n: 'E4 F4 C#5 G4' } },
};

const BILLABONG = {
  meter: '4/4', spb: 16, rot: 0, bpm: 171.6, finalPlus: 8, mix: 0.66, finalMix: 0.6,
  arp: 'x.x.x.x.x.x.x.x.',
  tracks: [
    ...drums(),
    ebass('pick grind'),
    guitar('fuzz lead', 0.4),
    // The zurna: the oboe's reed cycle bright, through a waveshaper, gliding between notes for the quarter-tones.
    { ...reed('lead', 'oboe', { vol: 0.36, warm: 0.75, detune: 0.1, decay: 0.8, fx: { shaper: { wet: 0.3, amount: 0.35 } } }), glide: 0.06 },
    choir(0.5),
    chip(0.16),
    pad('eorgan', 0.2),
    verbBus(2.6, 0.3, 0.18),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X.x.....X.x.....', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '......x.......x.' }
      : { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    // The slowed climax in half time.
    half: (final) => ({ kick: 'X...............', snare: '........X.......', ride: final ? 'x.x.x.x.x.x.x.x.' : 'x...x...x...x...' }),
  },
  fill: { kick: 'X.....X.........', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' },
  order: ['intro', 'riff', 'verse', 'riff2', 'hook', 'descent', 'climax', 'riff3'],
  finalOrder: ['riff', 'verse', 'hook', 'riff2', 'descent', 'hook2', 'climax', 'riff3'],
  sections(final) {
    const T = BV_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => up(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'half' }),
      riff: s('riff'),
      riff2: s('riff', { extra: { 'chip lead': up1('riff', 'lead') } }),
      riff3: s('riff', { extra: { voice: once(T.verse.chant, 16), 'chip lead': up1('riff', 'riff') } }),
      verse: s('verse', { extra: final ? { 'chip lead': up(bare(T.verse.chant), 1) } : {} }),
      hook: s('hook'),
      hook2: s('hook', { extra: { 'chip lead': up1('hook', 'lead') } }),
      descent: s('descent', { extra: { 'chip lead': up1('descent', 'lead') } }),
      climax: s('climax', { drums: 'half' }),
    };
  },
};

export const SONGS = [
  ...cue('hot wax', 'hot-wax-remix', HOT_WAX),
  ...cue('sadie sorceress', 'sadie-sorceress-remix', SADIE),
  ...cue('empty', 'empty-remix', EMPTY),
  ...cue('billabong valley', 'billabong-valley-remix', BILLABONG),
];
