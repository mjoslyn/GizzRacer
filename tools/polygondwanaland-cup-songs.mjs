// The Polygondwanaland Cup's remixes, written in seqbaby.
//
// Six cues, three songs from Polygondwanaland (2017), each a lap cut and a
// faster final-lap cut (+8 bpm, busier drums, the hook up front):
//
//   castle-in-the-air-remix(-final-lap)        "The Castle in the Air"
//   inner-cell-remix(-final-lap)               "Inner Cell"
//   tetrachromacy-remix(-final-lap)            "Tetrachromacy"
//
// Transcribed from the band's own album masters (their free Bootlegger
// release): each remix is the song's highlights in the song's own order,
// eight sections of four bars, every section handing to the next with a fill
// and a crash so the loop has no seam, in the band's key, meter and feel. No
// audio from the recordings goes in. The transcription data and the section
// map of each song are below, with how they were measured.
//
// Exports SONGS, an array of { title, cue, bars, build } in the shape
// tools/render-soundtrack.mjs reads from seqbaby-seed's people.mjs (the
// gizzracer person's songs). `bars` is one pass of the chain in bars of
// pattern 0's meter (every song here keeps one meter throughout), and build()
// returns the session window.seqbaby.applySet loads. Import it from a seed
// checkout's people.mjs as `songs: [...otherSongs, ...SONGS]`; the renderer
// sets SEQBABY_DIR before it imports people.mjs, and songBuilder.js is loaded
// from there.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEQBABY_DIR = path.resolve(process.env.SEQBABY_DIR || path.join(HERE, '../../mjoslyn/seqbaby'));
const sb = await import(pathToFileURL(path.join(SEQBABY_DIR, 'public/js/songBuilder.js')).href);

// ---------------------------------------------------------------------------
// A small score format on top of songBuilder.
//
// A song is { bpm, meter, tracks, sections }. A track is the engine and its
// sound (preset, params, filter, eq, comp, fx, out: the name of an fx bus).
// A section is { name, bars, parts: { trackName: part } }, where a part is a
// step string, or { s, n, c, arp, strum, v }:
//   s     step string over the section (a shorter one tiles), as songBuilder
//         spells them, plus ratchets: r = x rolled in two, R = X in three,
//         q = x in four
//   n     notes, cycling over the hits ("E2 G2 -", or an array; - is none)
//   c     a chord per hit, cycling ("min maj7 -")
//   arp   { rate, range, dir } on every chord hit
//   stack extra notes stacked on each hit, cycling (an array of arrays)
//   strum ms between a chord's notes
//   v     velocity scale
// A section longer than one pattern (64 steps) is split across slots on its
// bar lines; chain mode then plays the slots in order.
// ---------------------------------------------------------------------------

const RATCHET = { r: ['x', 2], R: ['X', 3], q: ['x', 4] };
const words = (v) => (Array.isArray(v) ? v : String(v).trim().split(/\s+/)).map((x) => (x === '-' ? null : x));
const tokens = (s) => String(s).replace(/[\s|]/g, '').split('');
/** Repeat a step string (or anything) n times. */
const rep = (s, n) => Array(n).fill(s).join(' ');

function compose({ bpm, meter = '4/4', mix = 1, tracks, sections }) {
  const [num, den] = meter.split('/').map(Number);
  const spb = (num * 16) / den;
  const song = sb.newSong({ bpm });
  const idx = {};
  for (const t of tracks) {
    const { index } = sb.addTrack(song, { engine: t.engine, name: t.name, sample: t.sample, drumKit: t.drum });
    idx[t.name] = index;
  }
  for (const t of tracks) {
    const i = idx[t.name];
    if (t.preset) sb.applyPreset(song, i, t.preset);
    if (t.params) {
      const { warnings } = sb.setParams(song, i, t.params);
      if (warnings.length) throw new Error(`${t.name}: ${warnings.join('; ')}`);
    }
    if (t.filter) sb.setFilter(song, i, t.filter);
    if (t.eq) sb.setEq(song, i, t.eq);
    if (t.comp) sb.setComp(song, i, { ...t.comp, ...(typeof t.comp.source === 'string' ? { source: idx[t.comp.source] } : {}) });
    for (const [stage, s] of Object.entries(t.fx || {})) sb.setFx(song, i, stage, s);
    if (t.out) sb.setTrack(song, i, { out: idx[t.out] });
    if (t.glide) sb.setTrack(song, i, { glide: t.glide });
    if (t.note) sb.setTrack(song, i, { pitchLock: false });
    for (const l of t.lfo || []) sb.addLfo(song, i, l);
    // `mix` trims every part at once: the level the cup's other remixes sit at.
    if (t.engine !== 'bus') song.tracks[i].params.vol = Math.round(Math.min(1, (song.tracks[i].params.vol ?? 0.8) * mix) * 1000) / 1000;
  }

  let slot = 0;
  const repeats = [];
  for (const sec of sections) {
    const steps = sec.bars * spb;
    let chunkBars = Math.min(sec.bars, Math.floor(64 / spb));
    while (sec.bars % chunkBars) chunkBars--;
    const chunkSteps = chunkBars * spb;
    const parts = {};
    for (const [name, raw] of Object.entries(sec.parts)) {
      if (!(name in idx)) throw new Error(`${sec.name}: no track "${name}"`);
      const def = tracks.find((t) => t.name === name);
      const part = { ...(typeof raw === 'string' ? { s: raw } : raw) };
      if (!part.n && def.note) part.n = def.note;
      const tok = tokens(part.s);
      if (steps % tok.length) throw new Error(`${sec.name}/${name}: ${tok.length} steps do not tile ${steps}`);
      const full = Array.from({ length: steps }, (_, k) => tok[k % tok.length]);
      // A tie with no note before it (a phrase rotated or tiled across a rest) is a rest.
      for (let k = 0; k < full.length; k++) if (full[k] === '_' && (k === 0 || full[k - 1] === '.' || full[k - 1] === '-')) full[k] = '.';
      const hits = full.filter((c) => c !== '.' && c !== '-' && c !== '_').length;
      const cyc = (list) => (list ? Array.from({ length: hits }, (_, k) => list[k % list.length]) : null);
      parts[name] = { part, full, notes: cyc(part.n && words(part.n)), chords: cyc(part.c && words(part.c)), stack: cyc(part.stack) };
    }
    for (let c = 0; c < sec.bars / chunkBars; c++) {
      sb.setMeter(song, slot, meter);
      for (const t of tracks) {
        if (t.engine === 'bus') continue;
        sb.setTrack(song, idx[t.name], { length: chunkSteps, pattern: slot });
        sb.clearPattern(song, idx[t.name], slot);
        sb.setTrack(song, idx[t.name], { length: chunkSteps, pattern: slot });
      }
      for (const [name, p] of Object.entries(parts)) {
        const i = idx[name];
        const before = p.full.slice(0, c * chunkSteps).filter((ch) => ch !== '.' && ch !== '-' && ch !== '_').length;
        const tok = p.full.slice(c * chunkSteps, (c + 1) * chunkSteps);
        for (let k = 0; k < tok.length; k++) if (tok[k] === '_' && (k === 0 || tok[k - 1] === '.')) tok[k] = '.';
        const ratchets = [];
        const str = tok.map((ch, k) => (RATCHET[ch] ? (ratchets.push([k, RATCHET[ch][1]]), RATCHET[ch][0]) : ch)).join('');
        if (!/[^._-]/.test(str)) continue;
        sb.setSteps(song, i, { pattern: slot, steps: str, velocity: p.part.v });
        const pat = song.tracks[i].patterns[slot];
        const hitSteps = pat.steps.map((on, k) => (on ? k : -1)).filter((k) => k >= 0);
        if (p.notes) sb.setNotes(song, i, { pattern: slot, notes: p.notes.slice(before, before + hitSteps.length) });
        for (const [k, n] of ratchets) sb.setStep(song, i, { pattern: slot, step: k, ratchet: n });
        if (p.stack) hitSteps.forEach((k, h) => p.stack[before + h]?.length && sb.setStep(song, i, { pattern: slot, step: k, extraNotes: p.stack[before + h] }));
        if (p.chords) {
          hitSteps.forEach((k, h) => {
            const ch = p.chords[before + h];
            if (!ch) return;
            sb.setStep(song, i, { pattern: slot, step: k, chord: ch, ...(p.part.strum ? { strum: p.part.strum } : {}) });
            if (p.part.arp) sb.setStep(song, i, { pattern: slot, step: k, arp: true, arpRate: p.part.arp.rate, arpRange: p.part.arp.range ?? 1, arpDir: p.part.arp.dir ?? 'up' });
          });
        }
      }
      repeats[slot] = chunkBars;
      slot++;
    }
  }
  sb.setArrangement(song, { mode: 'chain', repeats, active: 0 });
  const v = sb.validate(song);
  if (!v.ok) throw new Error(v.errors.join('; '));
  Object.defineProperty(song, "_warnings", { value: v.warnings, enumerable: false });
  return song;
}

/** Bars of one chain pass, for the cue's loop length. */
const barsOf = (sections) => sections.reduce((n, s) => n + s.bars, 0);

/** Notes moved by `semis` semitones: tr('A2 C3', 12) -> [A3, C4]. */
const tr = (notes, semis) => words(notes).map((x) => (x == null ? null : sb.toMidi(x) + semis));

/** Drum parts for a section: `groove` per piece for every bar but the last, `fill` for the last
 *  (a piece missing from the fill keeps its groove; '' rests), and a crash on the one. */
function beat(bars, spb, groove, fill = {}, { crash = true } = {}) {
  const rest = '.'.repeat(spb);
  const out = {};
  for (const k of new Set([...Object.keys(groove), ...Object.keys(fill)])) {
    const g = groove[k] || rest;
    const f = k in fill ? fill[k] || rest : g;
    out[k] = bars > 1 ? rep(g, bars - 1) + ' ' + f : f;
  }
  if (crash) out.crash = 'X' + '.'.repeat(bars * spb - 1);
  return out;
}

// ---------------------------------------------------------------------------
// Shared sounds
// ---------------------------------------------------------------------------

/** A sampler drum kit, one track per piece. */
function kit(name, { vol = {}, pieces = ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2'], tune = {} } = {}) {
  const base = { kick: 0.9, snare: 0.8, hihat: 0.85, openhat: 0.55, crash: 0.7, tom1: 0.6, tom2: 0.65, ride: 0.55, rim: 0.6 };
  const names = { kick: 'kick', snare: 'snare', hihat: 'hat', openhat: 'open hat', crash: 'crash', tom1: 'tom hi', tom2: 'tom lo', ride: 'ride', rim: 'rim' };
  return pieces.map((p) => ({ name: names[p], engine: 'sampler', sample: `${name}/${p}`, drum: true, params: { vol: vol[p] ?? base[p] }, ...(tune[p] ? { note: tune[p] } : {}) }));
}

/** The fx bus every melodic part sends to: a room and a dotted-eighth echo. */
const verbBus = (decay = 2.4, wet = 0.32, delay = 0.18) => ({
  name: 'verb', engine: 'bus',
  fx: { delay: { sync: true, div: 0.75, fbk: 0.32, wet: delay }, reverb: { decay, wet } },
});

/** An 8-bit pulse: snarl with only its pulse oscillator, through a bit crusher. */
const chip = (name, { vol = 0.45, pw = 0.5, bits = 8, out = 'verb', cutoff = 0.55 } = {}) => ({
  name, engine: 'dm:snarl', out,
  params: { vol, harm: 0, timb: pw, osc1: 0, osc2: 0.9, osc3: 0, osc4: 0, ultra: 0, fm: 0, metal: 0 },
  filter: { cutoff },
  fx: { crush: { bits, rate: 1, wet: 0.5 } },
});

// ---------------------------------------------------------------------------
// The transcriptions.
//
// Taken from the band's own album masters (Polygondwanaland, 2017, the free
// release on their Bootlegger page). No audio from the recordings goes in:
// these are notes. For each song the pulse, the meter, the bar line and the
// key were measured (onset autocorrelation over a tracked pulse grid, chroma);
// each section below is a phrase that recurs in the song, and its lines are
// the consensus of every time it recurs (the stems split by HPSS and band,
// basic-pitch for the riff and the melody, a constant-Q track for the bass,
// band-limited percussive onsets for where the drums accent). Times are where
// the phrase sits in the recording. Each line is a step string (sixteenths)
// and its notes; chords are per bar, read from the chroma and the bass, and
// tones are each bar's three strongest pitch classes (the chip arp and the pad
// play them).
//
//   bass   the bass line          riff   the guitar / keys riff (mid band)
//   lead   the top line: the vocal melody or the lead instrument (high band)
//   kick, snare, hat   the transcribed accents (the grooves below are written
//          from them)
// ---------------------------------------------------------------------------

const POLY = {
  // intro: from 7.3s, 11.0s, 14.6s, 18.2s
  intro: { bars: 2, chords: ['F#sus2', 'F#sus2'], tones: ['F# G C#', 'F# G G#'],
    bass: { s: 'x_x___xx_x__xx__xx__ _xx_x_xx__x_x___xx_x', n: 'F#2 F#2 A1 G#1 F#2 F#1 F#2 A1 G#1 F2 F2 F#2 A#1 G#1 F#2 F#2 F#2 G#1 F#2' },
    riff: { s: '...x___x________x___ ___X___x_____.......', n: 'C#4 F#3 C#4 F#3 C#4' },
    lead: { s: '.................... ....x....x_........x', n: 'A#4 C#5 A#4' },
    kick: '......X.....x...X... ......X.........X...', snare: '..x...X.....X...X... ..X...X.....X...X...', hat: '..x...X.x.x.x...x.x. x.x...x.x.x.x.x.X.x.' },
  // verseb: from 21.8s, 25.4s, 29.1s, 32.7s
  verseb: { bars: 2, chords: ['B7', 'A'], tones: ['F# B A', 'E A C#'],
    bass: { s: 'x_x_..x____..x_.x___ __xx_.x_____....x___', n: 'C#3 B2 F#2 B2 A2 A2 B2 E2 C#3' },
    riff: { s: '...x..Xx________..x_ ______X______X__X___', n: 'B3 B3 F#3 F#3 E3 F#3 C#4' },
    lead: { s: '.......x__....x_.x.. ......xx_____...X___', n: 'B4 B4 G5 B4 B4 F5' },
    kick: '..x...X.........x... .xx...X.....x...X...', snare: '..x...X.....X...X... ..x...X.....x...X...', hat: '..x...x...x.x...x.x. x.x...X.x.x.x...x.X.' },
  // verse: from 36.3s, 39.9s, 89.8s, 93.4s
  verse: { bars: 2, chords: ['F#m', 'Amaj7'], tones: ['F# B A', 'A C# E'],
    bass: { s: 'x_xxx.x____..x_.x___ __xxx..x__x_....x___', n: 'C#3 C3 B2 C3 F#2 B2 A2 A#2 B2 B2 E2 E2 C#3' },
    riff: { s: '......x_X____x..x_X_ x___x_x___xx____xx__', n: 'C#4 C#4 B3 C#4 A3 C#4 G#3 E3 A3 A3 G#3 G#3' },
    lead: { s: '............x_....x_ __........X____.x___', n: 'F#4 A4 E5 G#4' },
    kick: '..x..xX.......x.X... .xx...X...x...x.X...', snare: '..x...X.....X...X.X. .........xx.....x...', hat: '......X...X.x.x.x.x. ..x...x.x.x...x.x.x.' },
  // hook: from 50.6s, 100.7s, 165.5s
  hook: { bars: 4, chords: ['F#', 'Dmaj7', 'F#m', 'F7'], tones: ['F# C# B', 'D C# F#', 'F# C# A', 'D# C A'],
    bass: { s: 'x_x___x_____x__.x___ __x__xx_xx__x_xxx___ __x_..x_____x__.x___ __x__.x___xxxx_..x_x', n: 'C#3 B2 F#2 F#2 F#2 F#2 D3 D2 C#2 D2 D2 D2 D3 A2 A2 F#2 F#2 F#2 F#2 D#2 D2 D#2 D2 D#2 C3 D#2' },
    riff: { s: 'x_x..xxx____________ __....Xxxx___x___x__ _....xX______x______ __...xxxx___Xx______', n: 'A3 B3 C#4 F#3 C#4 C#4 C#4 C#4 C#4 C#4 C#4 F#3 C#4 C#4 A3 C4 C4 A3 C4 C4' },
    lead: { s: '......xx_________... ......XX_X__________ _....xX_______...... ......xXx_..XX______', n: 'C#4 C#4 C#4 C#4 C#4 A#4 C#4 C4 C4 A4 C4 C4' },
    kick: '....x.X.........X... .X...xX.........X... x.x...X.......x.X... ......X.........X...', snare: '..X...x.....x...X... x.X.xx......x...X... x.X.........x...X... xxX.x.......x...x.x.', hat: '..x...X...x.....x.X. x...........x...x.X. x.x...x.........x.X. x.x...x...x.x...x.x.' },
  // post: from 65.1s, 68.7s, 115.3s, 118.9s
  post: { bars: 2, chords: ['Bm7', 'Amaj7'], tones: ['F# B A', 'A G# E'],
    bass: { s: 'xxx_xxx_x_x.x_x_xxx_ x_x_x_x_x_x_x_x.x_x_', n: 'E2 C3 C3 C#3 C3 F#2 F#2 F#2 B2 B2 B2 A2 A2 A2 A2 G#2 G#2 A2 A2 A2 A2 E2 E2' },
    riff: { s: '.x_...X_____x__...X_ __xxx_..xxXxxx..x___', n: 'C#4 F#3 B3 A3 C#4 C#4 G#4 C#4 C#4 A3 C#4 C#4 A3 E3' },
    lead: { s: '......x___x_......x_ __..X___x_x___...x__', n: 'F#4 A#4 A4 G#4 A#4 A4 B4' },
    kick: '..x...X.....x.x...X. ....X.x..xX.....X...', snare: 'x.x.X.X.....x...x.x. ..x.x...........x...', hat: '....x.x.....X.x.x.x. ..x.....xxx.....x...' },
  // brk: from 79.2s, 80.9s, 82.7s, 84.5s
  brk: { bars: 1, chords: ['Bmaj7'], tones: ['B A# C'],
    bass: { s: 'x_xx_.xx____xx_.xx__', n: 'B1 B1 B2 A#1 B1 B1 B2 A#1 B1' },
    riff: { s: '.............x___...', n: 'B3' },
    lead: { s: '...x__..............', n: 'B4' },
    kick: '.X....X...xx..x.x...', snare: '..X...X.....X...X...', hat: '..x...X...x...x.x.x.' },
  // bridge: from 136.6s, 140.2s, 143.8s, 147.5s
  bridge: { bars: 2, chords: ['B7', 'E'], tones: ['F# B A', 'E C# G#'],
    bass: { s: 'x_xx_.x____..x_.x___ __xx..x___x_x...x___', n: 'C#3 C3 B2 F#2 B2 A2 A2 B2 E2 E2 E2 C#3' },
    riff: { s: '......x_______x_x_X_ ___...X___x_x_x___x_', n: 'E4 G#4 G#4 F#4 E3 G#4 F#3 G#4 F#4' },
    lead: { s: '....x_x__x_xx.x_x__. ..........x___x___x_', n: 'B4 B4 C#5 C#5 B4 G#4 G#4 G#4 G#4 F#4' },
    kick: '.x....X...x.x...X... ..x...X.....X.x.X...', snare: '..X...x.....x...x.x. ..x...X.....x...X...', hat: 'x.x...x...x.x.....x. x.x...X...x.....x.x.' },
};
const CASTLE = {
  // intro: from 0.0s, 7.0s, 13.9s
  intro: { bars: 2, chords: ['Bmaj7', 'Bmaj7'], tones: ['B A# A', 'B A# E'],
    bass: { s: 'x__xx_x___xxxx__x_x___.. x___x_x___.x............', n: 'B1 B2 B2 B2 B1 B2 B1 B2 B2 B2 B2 B2 B2 B2' },
    riff: { s: 'X...........X_x__.....x_ X_____xx_x.x..x___..x..x', n: 'B3 A#3 B3 B3 B3 B3 B3 F#3 F#3 B3 A#3 B3' },
    lead: { s: 'xx_x__.....x_.x____....x Xxx_.........xx_........', n: 'F#4 B4 D#5 F#4 F#4 F#4 E4 B4 E5 F#4 B4' },
    kick: 'x.....x.....X.....X..x.. X..x..X.....x.....X..x..', snare: '......x.....x..xx.X..xx. ...x..x..xx.X..xx.x..xx.', hat: '........xx..x..x..x..x.. ...x..x..x..x..X..x..X..' },
  // verse: from 20.8s, 27.8s, 34.7s
  verse: { bars: 2, chords: ['B', 'E'], tones: ['B F# A#', 'B G# E'],
    bass: { s: '.x__x_x___x_x___x_x__... .x__x_x___x_xx__x.xx.xx.', n: 'B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 B2 C3 B2 B2 G#2 G2 G#2 G2' },
    riff: { s: 'x______________x..x__x_. X__x__xx___x_x.........x', n: 'F#4 B3 B4 B4 E4 B3 G#4 B3 E4 E4 B3' },
    lead: { s: 'x_________________x__x.. X_____xx_x_______.x.....', n: 'F#4 B4 B4 E4 G#4 E4 G#4 G#4' },
    kick: 'x.....X.....X.....X..... X.....X.....x.x...X.x...', snare: '...x..X..xx.x..xx.x..... ......x..xx.x..xx.X..xx.', hat: '..xx..x..x..x.xx..x..x.. ...X..x..x.....x..x..x..' },
  // riff: from 41.6s, 48.4s
  riff: { bars: 2, chords: ['Bm7', 'Bm7'], tones: ['B A# C', 'B A# A'],
    bass: { s: 'x_____x_____x__xx_xxxxx_ x__xx_x___x_x__xxxx____x', n: 'B2 B2 B2 B2 B2 B2 E2 D3 C3 B2 B2 B2 B2 B2 B2 B2 C3 B2 C3 E2 A2' },
    riff: { s: 'xXXXxxxxx_xxX_xX_xxxxxx_ XxxXxxxxxxxxx_XxxxxxXXxX', n: 'E4 E4 B3 E4 B3 B3 B3 B3 A3 B3 D4 B3 B3 A3 B3 G#3 E3 B3 E4 E3 E4 B3 B3 E4 D4 D4 B3 A4 A3 B3 D4 D4 B3 B3 A3 B3 B3 B3 E3 B3 B3 E3 B3' },
    lead: { s: 'xx.x.XxxX....x.x..x.xx.. .xxx.xxxxxx_..xxxx.xxXx_', n: 'B4 A4 B4 B4 B4 A4 A4 B4 A4 B4 B4 B4 B4 A4 E4 D5 E5 B4 E5 A4 D5 D#5 A4 B4 A4 B4 B4 B4 B4' },
    kick: 'X.....X.....x.....X..X.x x..x..X.....x.....X.....', snare: 'X..x..x...X.X..X........ ...x........x..x....x...', hat: 'X.....x.....x.....x..... X..x..x.....x.xX..X.....' },
  // chorus: from 55.3s, 62.0s
  chorus: { bars: 2, chords: ['Bm', 'Bm'], tones: ['B D F#', 'B E D'],
    bass: { s: 'x__xx_x_x_x_x___xxx__xxx x_x_x_x_x___xx_xxxx_x_xx', n: 'B2 B2 B2 B2 B2 B2 B2 D3 B2 E2 E2 A2 B2 B2 B2 B2 B2 D3 D3 D2 B2 E2 E2 E2 E2 E2 E2' },
    riff: { s: 'xXXxXX_XxXXXX_x_x_xX__x_ xxxxxXx_xx_Xxxxxx_X_X__x', n: 'B3 B3 B3 F#3 B3 B3 B3 A3 B3 B3 B3 F#3 B3 B3 E3 B3 B3 F#3 B3 B3 F#3 B3 B3 B3 A3 B3 B3 F#3 E4 A3 A3 B3 B3 B3 B3' },
    lead: { s: '....xx_xxxx.xx_..x.xxxxx x_xx.x.xxxx_..xxxxx_Xxx_', n: 'B4 B4 D5 A4 B4 B4 F#4 B4 A4 B4 A4 B4 A4 F#4 A4 D5 A4 B4 F#5 A4 B4 B4 F#5 A4 B4 B4 B4 B4 D#5 B4' },
    kick: 'x.....x....xX.....x....x X.....X......x....X....X', snare: '......x.....x.xx......x. x.xx..x..x..x.....X.x...', hat: '...x.....x..x....xX.x... x.....x.....x.xx..X.x...' },
  // em: from 75.8s
  em: { bars: 2, chords: ['Em7', 'Em7'], tones: ['B D E', 'B G D'],
    bass: { s: '.x__x_x_x_x_x___x_.x_xxx x_____x_xx__x__xx_.xxxx_', n: 'B2 B2 B2 D3 D3 D3 E2 G2 E2 E2 G2 B2 B2 C3 D3 D3 G#2 E2 G2 E2 G2 B2' },
    riff: { s: 'X_XXXXX_X_XxxxX_XXXXXxX_ X_XXX_Xx_X_X__xXX_XXX_X_', n: 'F#3 B3 B3 F#3 B3 B3 D3 A3 D4 A3 B3 A3 E3 B3 B3 E4 B3 E4 B3 F#3 B3 B3 F#3 F#3 A3 A3 A3 B4 B3 B3 B3 B3 B3 B3' },
    lead: { s: '.xXx...xX_X_X_X_XXXX____ X_..X.xX_XX_x_XX_.xXX_X_', n: 'A4 D#5 B4 B4 A4 A4 A4 E5 B4 E4 B4 B4 F#4 F#4 B4 A4 A4 A4 E5 B4 B4 B4 B4 B4 D#5' },
    kick: 'x.....X.X.x.X..X..x..x.. ......x.....X.......x...', snare: '......x.X...x.xX.xx..XX. ......x.x...............', hat: '.......xx.....x......x.. ......X.xXX............x' },
  // full: from 82.7s, 89.5s, 96.2s
  full: { bars: 2, chords: ['Bm7', 'Bm7'], tones: ['B A F#', 'B E F#'],
    bass: { s: 'xx_xx_xxxx__xx_xx_xxxx__ x___x_xxxx__xxxx_xxxxxxx', n: 'B1 B2 B2 A2 B2 F#2 F#1 A1 A1 B1 B2 D2 E2 F#2 E2 B2 B2 A2 B2 F#2 F#2 E2 C#2 D2 B2 B2 E2 F2 E2 E2 F2 E2 E2' },
    riff: { s: 'xXXxXxxx_X_XXXXX_xx__xx_ xXXX__x_xxX____x_.x_xxx.', n: 'B3 B3 B3 E4 B3 B3 B3 B3 B3 B3 B3 B3 B3 A3 B3 G#3 B3 B3 E4 B3 B3 E4 B3 A3 B3 B3 A3 E3 B3 E4 E4' },
    lead: { s: 'x_X_x_X__xx__xxX__.X_Xx_ ...x..x_x_x___....x_x___', n: 'B4 B4 B4 B4 B4 B4 C#5 B4 E5 B4 B4 D#5 B4 B4 F#5 B4 B4 B4' },
    kick: 'X..xx................... X..x..X.X...X........X..', snare: 'x.x...x.....x........... .....x......x..XXxX.....', hat: 'x.....x..x....xx.....xx. x..x..X.....x..x..X.xx..' },
  // brk: from 110.3s, 117.2s, 124.2s
  brk: { bars: 2, chords: ['Amaj7', 'Amaj7'], tones: ['A G# B', 'G# A B'],
    bass: { s: 'xxxxxxxxxxxxxxxxxxxxxxx_ xxxxxxxx_xxxxxxxxxxxxxxx', n: 'A#1 G#1 A#1 A1 G#1 G1 A1 G#1 B1 A1 G#1 A#1 A#1 G#1 B1 A#1 G#1 B1 A1 G#1 A1 A1 G#1 A1 G#1 A#1 A1 G#1 B1 A#1 G#1 A1 G#1 B1 A#1 G#1 B1 A1 G#1 A#2 A1 G#1 B1 A1 G#1 G1' },
    riff: { s: '.......x................ .............xx_...x_...', n: 'B3 B3 B3 B3' },
    
    kick: 'x..x..x..X..x.xx..x..X.. X..x..x..x..X..x..x..x..', snare: 'X.....x.x...x...x...x... X..xx.x.x...x.x.x.x.....', hat: 'x...x...x...x...x...x... x...x...x...X...X.x.x...' },
  // payoff: from 145.0s, 151.9s
  payoff: { bars: 2, chords: ['Bm7', 'E7'], tones: ['B D E', 'B A A#'],
    bass: { s: 'x__x__x_xx__x__x.xx__x__ x_xx__x_xx__x__xx_xx_x__', n: 'B2 B2 B2 D3 D3 D3 D3 E2 E2 E2 B2 C3 B2 B2 C3 D3 D3 D3 B2 B2 E2 E2' },
    riff: { s: 'x_xxxx__x.XxXx__x_X_X_X_ x_x_X_x_...XX_X_X__XX_X_', n: 'B3 F#3 B3 F#3 B3 A3 A3 A3 A3 A3 B3 B3 B3 B3 B3 F#3 B3 F#3 A3 A3 A3 B3 B3 B3 B3' },
    lead: { s: '.x__.....xX_.xx...x___.x ...x_x.x.xx__.x.x____xx_', n: 'F#4 A4 A4 F#4 A4 B4 B4 F#4 B4 F#4 E5 A4 E5 B4 B4 B4' },
    kick: 'xx.x........X........X.. x.....X.....X..x..x.....', snare: 'x.x.....X.....X.x.X....x x........x.............x', hat: 'x.............X.x.x.X.x. X...x.......x..xx..x.x..' },
};
const CELL = {
  // intro: from 0.0s, 6.2s, 12.4s
  intro: { bars: 4, chords: ['F#m', 'F#m', 'F#m', 'F#m'], tones: ['F# C# B', 'F# C# A', 'F# C# B', 'F# C# B'],
    bass: { s: 'x_x_______ __x____x__ x_xx_x__x_ _____x__xx', n: 'F#2 F#2 F#2 F#2 C#3 C#3 F#2 F#2 F#2 F#2 A2 B2' },
    riff: { s: '.....x_x__ __________ xx....x_x_ xX______x_', n: 'B3 F#3 C#4 B3 F#3 C#4 A3 F#3 C#4' },
    lead: { s: '..xx_..x__ ........x_ _.......x_ xxx.......', n: 'A4 B4 F#4 E4 C#4 A4 F#4 F#5' },
    kick: 'x......X.. .......x.. ..XX.x.... ...x......', snare: 'X...x.x... ........x. .........X ....x.....', hat: 'x...x.x... ...xx..X.x ..X......x ..xx..x.x.' },
  // verse: from 18.7s, 25.0s
  verse: { bars: 4, chords: ['F#m', 'F#m', 'F#m', 'F#m'], tones: ['F# C# F', 'F# C# F', 'F# C# B', 'F# C# F'],
    bass: { s: 'x_x__xx___ x_xx__x___ x.xxxxx___ ____x_x___', n: 'F#2 C#3 C#3 F#2 F#2 F#2 F#2 F#2 F#2 A2 B2 C3 C#3 F#2 F#2 F#2' },
    riff: { s: '.x_xx__xx_ x__x___x_x x_x__Xxx_x x__xxX__xx', n: 'E4 C#4 F#3 F#3 D4 C#4 F#3 B3 F#3 C#4 F#3 F#3 B3 B3 B3 F#3 F#3 A3 F#3 A3 F#3' },
    lead: { s: 'xx__...x_. x__x.x.x_X __...Xxx__ __x_xx__..', n: 'F#4 A4 F#4 C#4 F#5 F#4 B4 F#4 F#4 A4 F#4 F#4 A4 F#4' },
    kick: '....xX.... ......X..x x.X...X... ......X...', snare: '.....x.... ...x.Xx.x. x.x.....X. x..x..x.x.', hat: '.....x.... ...xx...X. ..x...x... X..xx...x.' },
  // csharp: from 40.5s, 46.7s, 101.8s, 108.0s
  csharp: { bars: 4, chords: ['C#7', 'C#7', 'C#7', 'C#7'], tones: ['C# B C', 'C# B D', 'C# B G#', 'C# B D'],
    bass: { s: 'x_x_xx____ x.xxxx__x. ..x_xx___x .xx_xx__xx', n: 'B2 B2 B2 C#2 C#3 C#3 D3 C#3 C#3 B2 G#2 B1 C#2 C#2 B2 C#3 C#3 C#3 B2 B2' },
    riff: { s: '......x_x_ ...x_xx.x. ....xxx... x_...xx_x.', n: 'G#3 F#3 A3 G#3 C#4 G#3 F#3 C#4 C#4 G#3 G#3 G#3 B3' },
    lead: { s: '.x_xx.x__. x.x..x.... ....x..... ......x.xx', n: 'C#5 C#5 C#5 C#5 C#5 C#5 C#5 F5 G#4 F#4 F5' },
    kick: '.x..xx.... ....xX.x.x ........x. .....X....', snare: 'xxX.xX...x ..x..x...X .........x ..........', hat: '.X...x...X ...x...... .X.......x .x.x......' },
  // pre: from 71.4s, 77.5s, 129.8s, 135.9s
  pre: { bars: 4, chords: ['D#m7', 'A7', 'D#7', 'A#7'], tones: ['D# G G#', 'D# A G#', 'A# A G#', 'D# G# A'],
    bass: { s: 'xxx__x___x xxxx_x_x.. xxx.xxx__. xxx__x_x..', n: 'A1 F#2 G2 D#2 D#2 A1 A1 G#1 E2 D#2 G#1 A1 A1 G#1 B2 A1 D#2 A1 A1 E2 D#2 G#1' },
    riff: { s: '.......... ..Xx_Xx... ..Xx_Xx... ..XX_X__..', n: 'E3 B3 D#3 A#3 A#3 A#3 A#3 D#4 E3 B3 D#3' },
    lead: { s: '.......... .....x_... ..x_.x..x_ __.x.xx...', n: 'A#4 A#4 A#4 D#5 B4 A#4 D#5' },
    kick: 'x......... X...xx.... X..x...... X....x....', snare: '.x.......x .x.......X .x.......X .X.......X', hat: '.X...x.... .X.......x .X.....x.. .X.x.....x' },
  // chorus: from 83.6s, 89.6s
  chorus: { bars: 4, chords: ['G#m7', 'F#m', 'G#m7', 'F#m'], tones: ['F# G A', 'F# G# A', 'F# C# G#', 'F# G# G'],
    bass: { s: 'xxxxxx___x ____xx_x__ xxx__x___x __x___xx_x', n: 'G#1 A1 G#1 G2 G2 F#2 F#2 F#2 G#1 F#2 G#1 A1 C#3 F#2 F#2 F#2 A1 F#2 F2' },
    riff: { s: 'xxXx_XxxXx xXx_x_xxx_ xXxxxxXxxx xx__x_xxXx', n: 'D#4 F#3 G3 D5 A3 F#3 B3 B3 F#3 A3 F#3 F#3 F#3 F#3 A3 A3 B3 A3 C#4 F#3 B3 F#3 F#4 F#4 D4 F#3 F#4 F#3 F#3 B3 B3 F#3 C#4' },
    lead: { s: '.x_X_xX_x_ xxXXxX__xX XX_x.Xx_xx XxxXx_XxXX', n: 'A4 D5 A4 F#5 F#5 A4 C#5 F#5 F#5 C#5 F#5 B4 F#5 B4 F#5 F#4 F#4 B4 F#5 D5 F#5 B4 F#5 F#5 D5 D5 F#5 F#5 F#5' },
    kick: 'X...xx.... .....x.... X....X.... x....x....', snare: '.XX....... .......... .......... ..........', hat: '.xxx.....x .xx...X... .......... ..x..X....' },
  // brk: from 145.0s, 151.2s
  brk: { bars: 4, chords: ['F#m', 'F#', 'F#m', 'F#m'], tones: ['F# C# B', 'F# C# B', 'F# C# B', 'F# C# A'],
    bass: { s: 'x___xx____ _x___x____ x..xx__x.. xx_x_x__.x', n: 'F#2 F#2 F#2 F#2 F#2 F2 F2 F2 F2 F2 F2 F#2 F2 C#3' },
    riff: { s: 'xxx_xx_x_. .x_xxxxXxx _.xxxxx__x ___x_xxxxx', n: 'E4 A3 C#4 B3 F#3 D4 F#3 A3 C#4 C#4 B3 B3 F#3 B3 A3 F#3 B3 A3 F#3 F#3 A3 C#4 G3 A3 F#3 F#3' },
    lead: { s: 'xxx__xx_.x _x_.x_x___ x_..xxx_xx x_xxxxx...', n: 'E4 A4 C#4 A#4 F#4 C#4 F#5 C#4 B4 C#4 B4 A4 F#4 A4 F#5 F#4 F#4 A4 A4 F#5 F#4' },
    kick: 'XX.x.x.... .......... ...X...... ..xx.xx..X', snare: '....x..... .X........ .X.x...x.. ....xX....', hat: '....x....x ...x...... .X......X. ...x.x..X.' },
  // hooka: from 160.3s, 190.4s
  hooka: { bars: 4, chords: ['Dmaj7', 'D', 'E', 'E'], tones: ['F# D C#', 'D F# A', 'E F# D', 'E G# B'],
    bass: { s: 'xxxx.x___x x____xxxx_ xxxx_x____ _xx__xxxxx', n: 'G#1 A1 G#1 C#3 D2 D2 D2 A1 A1 G#1 D2 A1 A1 D2 D3 E2 A1 E2 G#1 A1 G#1 E2 E2' },
    riff: { s: '.XX_xXXXxX _x_xXxxx_x _X_x_xXxXx __x_xX_Xx_', n: 'C#4 A3 F#4 F#4 F#4 F#3 D5 F#3 C#4 F#4 F#3 F#4 B3 E4 F#3 F#3 F#3 C#4 B3 B3 B3 B3 G#3 C#4 G#3 B3 B3' },
    lead: { s: 'xXX_XxXXXx XxXXXX_x_x .x_x_xxXX_ x_x__xx_xx', n: 'C#5 C#5 C#5 A4 F#4 D5 F#4 D5 A4 D5 F#5 F#5 F#5 F#5 D5 A4 F#4 A4 D5 F#5 B4 B4 B4 E5 F#5 B4 B4 E5 F#5' },
    kick: 'X....x.... x....xx... X....X.... .....X....', snare: 'X......... .xxxX.x... x.....x..X .......x.x', hat: 'x.x......x .....x.... .........X ..X...x..X' },
  // hookb: from 166.4s, 196.4s
  hookb: { bars: 4, chords: ['E', 'E', 'B7', 'B7'], tones: ['B G# E', 'B F# G#', 'B F# A', 'B D# F#'],
    bass: { s: 'xxx_xxx___ xxx__x____ xxx_xx____ xxx__xxx__', n: 'G#1 A1 E2 E2 G#1 B2 G#1 A1 B2 B2 B2 A1 B2 B2 B2 B2 A1 B2 B2 D#2 B2' },
    riff: { s: 'XxX_..x_xX __.XX__x_x xXXxX_Xxxx __x_xXXx_x', n: 'E4 C#4 C#4 F#3 D4 C#4 B3 C#4 F#3 F#4 F#4 B3 B3 B3 B3 B3 B3 D#3 B4 D#3 D#4 D#4 B4 F#3 D#4' },
    lead: { s: 'xxX_x_xx_x xXXxxxXXxX xXXXxx_xxX Xx__xx__xX', n: 'B4 G#4 F#5 F#5 F#5 B4 B4 B4 F#5 F#5 F#5 D5 B4 D5 D5 F#5 F#4 D5 F#5 B4 F#5 B4 F#5 D#5 B4 B4 F#5 D#5 D#5 D#5 F#5 F#5' },
    kick: 'x....Xx... X....x.... X....X.... X....X....', snare: '....x..... ....x.Xx.. .Xx.x..... .....xXx..', hat: '........X. ..X.xxx..x ...x...xX. ..x....x..' },
};
const TETRA = {
  // intro: from 6.7s, 13.4s, 20.0s
  intro: { bars: 2, chords: ['B7', 'Bm7'], tones: ['B A A#', 'B A A#'],
    bass: { s: 'x_x_x___x_.x__xxx___x_x_ __x_x__xxxx___x_x___x_x_', n: 'B2 B2 B2 B2 B2 E2 B2 B2 B2 B2 B2 B2 E2 E2 B2 B2 B2 B2 B2 B2' },
    riff: { s: '......x__x_____.X__..xx_ x_x_______x_x_x_x_x___x_', n: 'B3 B3 B3 B3 B3 A3 B3 D4 A3 B3 E4 B3 A3' },
    lead: { s: '..x___..x___..........x_ x__x_xx___x___X_X___..x_', n: 'G#4 E4 B5 E4 D#5 F#4 B4 D4 B5 E4 E5' },
    kick: '....X.....X.....X.....X. ....x...x.X.....X.....X.', snare: '..X.x...X.X...X.x...X.x. ..x.....x.x...x.x...x.x.', hat: 'x.x...X...x.x.x...x.x.X. x.....x...x.x.x.x.x...x.' },
  // verse: from 26.5s, 33.0s, 39.6s, 46.1s
  verse: { bars: 2, chords: ['E', 'Bmaj7'], tones: ['B A A#', 'B A# C'],
    bass: { s: 'x_xxx___x_x___x_xxx_xxx_ _xx_xx_xx_xxx_xxx_x_xxxx', n: 'E2 E2 B2 B2 C#3 B2 A2 A#2 A2 A#2 G#2 B2 B2 B1 B1 A#1 B2 B1 B1 B1 B2 B1 B1 B2 B2 B1 B1 B2 B2 D3' },
    riff: { s: 'x__...X_x_x_....x.....x_ x_Xx___x_.....x___X___x_', n: 'B3 B3 C#4 B3 B3 B3 A3 B3 B3 B3 B3 B3 A3' },
    lead: { s: '..x_....x_xxx.....x___x_ ..x.x_x___........xx....', n: 'D#5 F5 D#5 D#5 D#5 D#5 D#5 B4 D#5 B4 B4 D#5' },
    kick: '.x..X...x.X...........X. ...xx.x...x.....x....xX.', snare: '..X.X.x.x.X...........X. x.x.....x.X...x.x.....x.', hat: 'x.x.x.X...x...........X. X.x.x.x...x.x...........' },
  // verseb: from 52.6s, 59.2s, 105.0s, 111.6s
  verseb: { bars: 2, chords: ['Bmaj7', 'Bmaj7'], tones: ['B A# A', 'B A# A'],
    bass: { s: 'x_xxxx__xxxx__xxx_x_x_x_ __x_xx__x_xxxxx_x___x_x_', n: 'B2 B2 B1 B1 B2 B2 B1 B1 B2 B2 B1 B1 B2 B2 B2 B2 B1 B2 B2 B1 B2 B1 B2 B2 B2 B2 B2' },
    riff: { s: '..x_x_..x_x____x__x__.xX x_x_x.x_____x.x___x_..x_', n: 'B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3 B3' },
    lead: { s: 'x_x_x_......xx........x. x.x.xxx_....x...x_x_....', n: 'B4 D#5 B4 D#5 F#4 B4 D#5 B4 B4 B4 D#5 B4 D#5 D#5' },
    kick: '.X..x.....x...x.x...X.x. ....X.....x.....X.....X.', snare: '..x.x...x.....X.x.....x. ..x.......X...x.x...x.X.', hat: 'x...x.X.......x...x...x. x.....X.....x.x...x.x.x.' },
  // var: from 72.1s, 78.8s
  var: { bars: 2, chords: ['E', 'E'], tones: ['B A# C', 'B A# C'],
    bass: { s: 'x_xxxxx_x_xx__x_x_x_x_x_ x_xxxx__xxx_x_xxx_____x_', n: 'E2 B1 B2 B1 B2 B1 C#2 B1 B2 A1 B1 B2 B2 D3 E2 B1 B2 A#1 B2 A#2 C#3 B1 B2 A2 A1 B2 B2' },
    riff: { s: 'x_xX_x..xxx_X_..x_X_.... X_xX__X_..x_x_...xX__xx_', n: 'E3 B3 B3 B3 C#4 C#4 B3 C#4 B3 B3 E3 B3 B3 B3 B3 C#4 B3 B3 B3 B3' },
    lead: { s: '.XxXX_X_...x....xxX__x.. X_xXx_x_..........X__X__', n: 'B4 D#5 F#4 D#5 F#4 F#4 F#4 D#5 F#4 D#5 B4 F#4 F#4 D#5 F#4 F#4 D#5' },
    kick: '.....x..x.x..xX.x.XX..X. ....X..x.............x..', snare: '..X...x..xX.x...x.x..XX. ......x...x...x.......X.', hat: '....x...x...xx..x.....X. .X..x.....X....x......X.' },
  // chorus: from 85.3s, 91.9s
  chorus: { bars: 2, chords: ['Bmaj7', 'E'], tones: ['B E A#', 'B E A#'],
    bass: { s: 'x_x_x___x_x___xx.x__xx.. ......x.x..x__x_.x__....', n: 'B2 B2 B2 B2 B2 E2 B2 B2 E2 B2 E2 E2 B2 B2 B2' },
    riff: { s: 'x_XX______x_x_X_xxXxX___ X_x__xX_xxXxx_xx__xx..X_', n: 'A3 B3 B3 D4 E3 B3 A3 B3 B3 E4 B3 B3 D4 E3 B3 E4 B3 B3 B3 B3 A3 B3 G#3 D4 B3' },
    lead: { s: 'x_Xxx_x__xx_x__.xxx_x___ x_xxX______X__Xxxx..x_x_', n: 'E4 B4 F#4 D#5 B4 B4 D4 B4 B4 B4 E4 B4 D#5 B4 D4 B4 D#5 B4 D#5 B4 F#4 B4 B4' },
    kick: '....x.....X.....x.....x. ....X.....X.....X...x.X.', snare: '..........X...X.......x. x.X.x.....x...x.....X.x.', hat: 'x.....x...x.x.x...x..... x.x...X.x...x.x...x...x.' },
  // fsm: from 141.0s, 147.4s
  fsm: { bars: 2, chords: ['F#m', 'F#m'], tones: ['F# C# G', 'F# C# G'],
    bass: { s: 'xxx_x_xxxxxxxx..xxxx__xx x_x_x_xxx____xx_xx____x_', n: 'G#2 C#3 F#2 F#2 G1 G2 F#1 F#2 F#1 A2 G#2 F#2 A#2 A2 A#2 A2 A2 B2 C#3 F#2 F#2 G1 G2 F#2 F#2 E2 A#2 A2 B1' },
    riff: { s: 'x_xX___x.x_x_.X_X__X__x. ..xx__x_Xx__....xXxxXxx_', n: 'C#4 C#4 C#4 G3 F#3 C#4 B3 F#3 C#4 C#4 C#4 F#3 G3 F#3 C#4 F#3 C#4 C#4 F#3 B3 C#4 B3' },
    lead: { s: '..........x_Xx_.X_....xx _X.xXXx.XxX__..x_x_x_x_X', n: 'F#4 C#5 C#5 C#5 C#5 C#5 C#5 F#4 C#5 C#5 F#4 C#5 C#5 C#5 C#5 C#5 F#4 C#5 C#5' },
    kick: '..X.x...........Xx...x.. x...x.....xxx......x.xX.', snare: 'x.X...........x...x..XX. ..x...x...x.......X...x.', hat: '..Xx.........x..x....xx. .x....x.x.....x.X.....X.' },
  // bm: from 153.9s, 160.3s
  bm: { bars: 2, chords: ['Bm', 'Bm7'], tones: ['B E F#', 'B A E'],
    bass: { s: 'x_x_x_________x_x___x_xx x_x_x_x_x_x_x_x_x_x_x_x_', n: 'B1 B2 B2 B2 B1 B2 C#3 B1 B1 A2 A2 B2 B2 B2 B2 B2 B2 G#2 A2 B2' },
    riff: { s: 'x_.xxx_XXxX___x_xxXxxxxx X_xx_.x_Xxx_x_x_x_x_xxx_', n: 'D4 B3 B3 B3 B3 E3 B3 B3 F#4 B4 B3 B4 F#4 B3 E4 B3 B3 B3 C#4 A4 A4 B4 F#3 B3 B3 B3 E3 F#4 E4 D4 E4' },
    lead: { s: '......x____xxxx__xXxxxx_ __xx_xx_Xx__XxXxx_X__xx_', n: 'B4 F#5 F#5 F#5 F#4 B4 B4 F#4 B4 A4 B4 A4 B4 E4 B4 B4 F#4 F#4 F#4 B4 A4 A4 B4 F#4 A4' },
    kick: '...x............x..X.... xx..X.X..x......X...X.x.', snare: '.....xx...x...X.......x. ......x.X.Xx.xx.....x...', hat: '........x.............X. x...x...X.x.x.X...x.X...' },
  // payoff: from 170.0s, 176.4s, 183.0s
  payoff: { bars: 2, chords: ['E', 'B7'], tones: ['B A A#', 'B A A#'],
    bass: { s: 'x_x_x_x_x_x___x_x_x_x_xx xxx_x_x_x_x___xxx_xxx_xx', n: 'E2 B2 B2 B2 C#3 B2 A2 B2 B1 B2 A#2 A2 G#2 E2 B2 B2 B2 C#3 B2 A#2 A2 B2 B1 B2 G#2 C2 D2' },
    riff: { s: '..xx_xx___x.x_..X_Xx__.. x_X___x.......X_.xx_____', n: 'B3 B3 B4 B4 B3 C#4 B3 B3 B3 E3 B3 B3 A3 B3 B3' },
    lead: { s: 'x_xXxx_____x.......xx_x_ x_xXxx.....x..x_x_x_.X.x', n: 'B4 B4 B4 D#5 B4 F#4 D#5 D#5 F#5 B4 B4 F#4 F#5 B4 C#5 B5 B4 B4 B4 B4' },
    kick: '..X..x....x...x......... ..Xx..x...x..........XX.', snare: '..x...x...x.......x..xX. ..x...x..xX...x...x...x.', hat: 'x...X...........x.x..... ....x.....X.......x.xXX.' },
};

// ---------------------------------------------------------------------------
// Building a remix from a transcription.
// ---------------------------------------------------------------------------

const isHit = (c) => !'._-'.includes(c);
const hits = (s) => tokens(s).filter(isHit).length;

/** Rotate a phrase to start `k` steps later (so the bar line falls on the band's downbeat), notes and all. */
function rotate(part, k) {
  if (!part || !k) return part;
  const tok = tokens(part.s);
  const n = words(part.n);
  const kk = ((k % tok.length) + tok.length) % tok.length;
  const moved = tok.slice(0, kk).filter(isHit).length;
  return { s: tok.slice(kk).concat(tok.slice(0, kk)).join(''), n: n.slice(moved).concat(n.slice(0, moved)) };
}

/** Move a line by octaves. */
const oct = (part, n) => (part ? { s: part.s, n: tr(part.n, 12 * n) } : null);

/**
 * One four-bar section from a transcribed phrase. `song` holds the meter's
 * steps per bar, the rotation, the grooves and the fill; `use` says which
 * lines play on which tracks (by default the bass, riff and lead on the bass,
 * guitar and lead tracks; the chip arp and the pad on each bar's measured
 * tones); `extra` adds or
 * overrides parts.
 */
function section(song, phrase, { final = false, use = {}, extra = {}, drums = 'groove', crash = true } = {}) {
  const { spb, rot = 0, rowBars = 1 } = song;
  const bars = 4;
  const tile = (p) => (p && hits(p.s) ? { s: rep(p.s, bars / (phrase.bars * rowBars)), n: p.n } : null);
  const line = (k) => tile(rotate(phrase[k], rot));
  const parts = {};
  const lines = { bass: 'bass', guitar: 'riff', lead: 'lead', ...use };
  for (const [track, src] of Object.entries(lines)) {
    if (!src) continue;
    const p = typeof src === 'string' ? line(src) : src;
    if (p && hits(p.s) >= 3) parts[track] = p;
  }
  // The chip arp runs up and down the bar's three strongest pitch classes in the recording.
  const arp = [];
  for (let i = 0; i < bars; i++) {
    const pcs = words(phrase.tones[Math.floor(i / rowBars) % phrase.bars]);
    const a = sb.toMidi(pcs[0] + '4');
    const up = pcs.slice(1).map((pc) => { let m = sb.toMidi(pc + '4'); while (m <= a) m += 12; while (m > a + 12) m -= 12; return m; }).sort((x, y) => x - y);
    const cyc = [a, ...up, a + 12, ...up.slice().reverse()];
    for (let k = 0; k < spb; k++) arp.push(cyc[k % cyc.length]);
  }
  parts['chip arp'] = { s: rep('xo'.repeat(spb / 2), bars), n: arp };
  // The pad holds the same three pitch classes, voiced from the strongest up within C3..C5.
  const pad = Array.from({ length: bars }, (_, i) => {
    const pcs = words(phrase.tones[Math.floor(i / rowBars) % phrase.bars]);
    const a = sb.toMidi(pcs[0] + '3');
    return [a, ...pcs.slice(1).map((pc) => { let m = sb.toMidi(pc + '3'); while (m <= a) m += 12; return m; })];
  });
  parts.pad = { s: rep('X' + '_'.repeat(spb - 1), bars), n: pad.map((c) => c[0]), stack: pad.map((c) => c.slice(1)) };
  const g = song.grooves[drums](final);
  Object.assign(parts, beat(bars, spb, g, song.fill, { crash }));
  return { name: phrase.name, bars, parts: { ...parts, ...extra } };
}

/** The lap and final-lap scores of one song: `order` / `finalOrder` name its sections in playing order. */
function scoreOf(song, final) {
  const order = final ? song.finalOrder : song.order;
  return {
    bpm: final ? song.bpm + song.finalPlus : song.bpm,
    meter: song.meter,
    mix: final ? song.mix * 0.94 : song.mix,
    tracks: song.tracks,
    sections: order.map((k) => song.sections(final)[k]),
  };
}

// ---------------------------------------------------------------------------
// 1. Polygondwanaland (remix): once the jungle track's, not raced now.
//
// Measured: a pulse of 0.180 s (333 eighths a minute, quarter = 166.7 bpm)
// in groups of five, the harmony changing every ten pulses, so 10/8 felt
// 3+2+3+2 (kick on 1 and 3, snare on 2 and 4 of those groups). Key: F#,
// minor and phrygian (the G against F#), with F# major and D/F7 colour in
// the hook. Section map (the phrases taken, in the song's order):
//   intro   7.3-21.8 s   the F# vamp; the bass on F# with A-G# pickups
//   verseb 21.8-36.3 s   B7 | A, the bass falling C#-B-F#
//   verse  36.3-50.6 s   F#m | Amaj7, the bass's chromatic C#-C-B ... A#-A
//   hook   50.6-65.1 s   F# | Dmaj7 | F#m | F7 (also at 100.7 and 165.5 s)
//   post   65.1-79.2 s   Bm7 | Amaj7, the bass walking B-A-G#
//   brk    79.2-86.2 s   the B pedal, B-A# in the bass
//   bridge 136.6-151 s   B7 | E, the lead up to C#5
// then the hook again as the payoff, the chip lead on top, turning back to F#.
// Lap 166.7 bpm, final lap 174.7. Bass (electric, pick grind), the riff on a
// jangly guitar, the top line on a flute (ladder whistle), a chip arp on the
// chords, a chip lead doubling the top line an octave up in the hooks;
// drskit drums with jungle toms and a shaker.
// ---------------------------------------------------------------------------

const POLYGONDWANALAND = {
  meter: '10/8', spb: 20, rot: 16, bpm: 166.7, finalPlus: 8, mix: 0.76,
  tracks: [
    ...kit('drskit', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2'], vol: { hihat: 1, crash: 0.9 }, tune: { tom1: 'C#2', tom2: 'A#1' } }),
    { name: 'shaker', engine: 'dm:halo', preset: 'shaker', params: { vol: 0.4 } },
    { name: 'bass', engine: 'dm:bass', preset: 'pick grind', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'jangle', params: { vol: 0.58 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.45, harm: 0.36, timb: 0.3, morph: 0.3 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
    chip('chip arp', { vol: 0.28, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.34 }, out: 'verb' },
    verbBus(2.6, 0.3, 0.16),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X...x....xX.....x...', snare: '......X..o......X.o.', hat: 'xoxoxoxoxoxoxoxoxoxo', shaker: 'x.x.x.x.x.x.x.x.x.x.' }
      : { kick: 'X....x....X.........', snare: '......X.........X...', hat: 'X.x.x.X.x.X.x.x.X.x.', shaker: 'xoxoxoxoxoxoxoxoxoxo' },
    toms: (final) => ({ kick: 'X.........X.........', 'tom hi': '..x...x.....x...x.x.', 'tom lo': 'x....x....x.x....x..', shaker: 'xoxoxoxoxoxoxoxoxoxo', ...(final ? { snare: '......X.........X...' } : {}) }),
  },
  fill: { kick: 'X.........X.........', snare: '......X.........rrRR', hat: 'X.x.x.X.x...........', 'tom hi': '..........x.x.......', 'tom lo': '..............x.x...' },
  order: ['intro', 'verseb', 'verse', 'hook', 'post', 'brk', 'bridge', 'payoff'],
  finalOrder: ['hook', 'post', 'verseb', 'verse', 'payoff', 'brk', 'bridge', 'verse2'],
  sections(final) {
    const T = POLY;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const leadUp = (k) => oct(tile4(this, T[k], 'lead'), 1);
    return {
      intro: s('intro', { drums: 'toms', use: { lead: null } }),
      verseb: s('verseb'),
      verse: s('verse'),
      verse2: s('verse', { extra: { 'chip lead': leadUp('verse') } }),
      hook: s('hook', { extra: final ? { 'chip lead': oct(tile4(this, T.hook, 'riff'), 1) } : {} }),
      post: s('post'),
      brk: s('brk', { drums: 'toms', use: { lead: null } }),
      bridge: s('bridge', { extra: final ? { 'chip lead': leadUp('bridge') } : {} }),
      payoff: s('hook', { drums: final ? 'groove' : 'toms', extra: { 'chip lead': oct(tile4(this, T.hook, 'riff'), 1) } }),
    };
  },
};

/** A transcribed line rotated and tiled over four bars, for a part `section` does not place itself. */
function tile4(song, phrase, k) {
  const p = rotate(phrase[k], song.rot || 0);
  return p && hits(p.s) ? { s: rep(p.s, 4 / (phrase.bars * (song.rowBars || 1))), n: p.n } : null;
}

// ---------------------------------------------------------------------------
// 2. The Castle in the Air (remix): the castle floating in the sky.
//
// Measured: a pulse of 0.284 s in threes with sixteenths inside it, so 6/8
// (quarter = 105.5 bpm, a bar 1.71 s), kick on 1 and 4. Key: B, a pedal
// under nearly the whole song, B7 and Bmaj7 colour (the A and the A#), the
// E and Em7 bars its only real moves, and a quiet stretch on A. Section map:
//   intro    0.0-20.8 s  the B vamp (the riff around B3-A#3, the lead F#4-B4-D#5)
//   verse   20.8-41.6 s  B | E, the bass on B2, the line up to G#4
//   riff    41.6-55.3 s  Bm7: the busy B3 picking riff with the D and the A
//   chorus  55.3-68.9 s  Bm: louder, the lead on B4-D5-F#5
//   em      75.8-82.7 s  Em7, the contrast
//   full    82.7-103 s   Bm7, the full band, the bass walking B-A-F#-E
//   brk    110.3-131 s   on A, quiet: the bass circling A-G#-A#-B
//   payoff 145.0-158 s   Bm7 | E7, the loud last stretch
// Lap 105.5 bpm, final lap 113.5. A Moog bass (ladder), the riff on a chime
// guitar, the top line on a flute (ladder whistle), hexop bells on the riff
// an octave up in the chorus and payoff, chip arp and chip lead; salamander
// drums with the ride in the chorus.
// ---------------------------------------------------------------------------

const CASTLE_IN_THE_AIR = {
  meter: '6/8', spb: 12, rowBars: 2, rot: 0, bpm: 105.5, finalPlus: 8, mix: 0.74,
  tracks: [
    ...kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2', 'ride'], vol: { ride: 0.95 } }),
    { name: 'bass', engine: 'dm:ladder', preset: 'model d bass', params: { vol: 1 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'chime', params: { vol: 0.52 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.45, harm: 0.36, timb: 0.3, morph: 0.3 }, out: 'verb', fx: { chorus: { wet: 0.25 } } },
    { name: 'bells', engine: 'dm:hexop', preset: 'e.piano', params: { vol: 0.34 }, out: 'verb' },
    chip('chip arp', { vol: 0.28, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.34 }, out: 'verb' },
    verbBus(3.2, 0.34, 0.18),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X..x.....xx.', snare: '...o..X....o', hat: 'xoxoxoxoxoxo' }
      : { kick: 'X........x..', snare: '......X.....', hat: 'X.x.x.X.x.x.' },
    ride: (final) => final
      ? { kick: 'X..x.....xx.', snare: '...o..X....o', ride: 'xoxxoxxoxxox', hat: '......x.....' }
      : { kick: 'X........x..', snare: '......X.....', ride: 'X.x.x.X.x.x.', hat: '......x.....' },
    half: (final) => ({ kick: 'X...........', snare: final ? '......X.....' : '............', ride: 'x..x..x..x..', hat: '......x.....' }),
  },
  fill: { kick: 'X...........', snare: '......X..rRR', hat: 'X.x.x.......', ride: '', 'tom hi': '..x.x.......', 'tom lo': '......x.x...' },
  order: ['intro', 'verse', 'riff', 'chorus', 'em', 'full', 'brk', 'payoff'],
  finalOrder: ['chorus', 'riff', 'em', 'full', 'brk', 'payoff', 'verse', 'riff2'],
  sections(final) {
    const T = CASTLE;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up = (k, line, n) => oct(tile4(this, T[k], line), n);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half' }),
      verse: s('verse'),
      riff: s('riff'),
      riff2: s('riff', { extra: { 'chip lead': up('riff', 'lead', 1) } }),
      chorus: s('chorus', { drums: 'ride', extra: { bells: up('chorus', 'riff', 1), ...(final ? { 'chip lead': up('chorus', 'lead', 1) } : {}) } }),
      em: s('em'),
      full: s('full', { extra: final ? { 'chip lead': up('full', 'lead', 1) } : {} }),
      brk: s('brk', { drums: 'half', use: { lead: up('brk', 'riff', 1) } }),
      payoff: s('payoff', { drums: 'ride', extra: { bells: up('payoff', 'riff', 1), 'chip lead': up('payoff', 'lead', 1) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Inner Cell (remix): inside a giant living cell.
//
// Measured: a pulse of 0.151 s, ten to the bar in two fives (kick on pulses
// 1 and 6, the snare on the pulse before each), so 5/8 in sixteenths at a
// quarter of 99.4 bpm (a bar 1.51 s). Key: F#, minor, with the C#7 riff (its
// C natural against the C#), a D#/A stretch, and an F#m-D-E-B7 run at the
// end. Section map:
//   intro    0.0-18.7 s  the F#m vamp, the bass F#2-C#3
//   verse   18.7-31.4 s  F#m, the riff F#3-C#4-B3 and the line on F#4-A4
//   csharp  40.5-52.9 s  C#7 (also 101.8-114.2 s): the bass B-C#-D-C#
//   pre     71.4-83.6 s  D#m7 | A7 | D#7 | A#7 over the A pedal (also 129.8 s)
//   chorus  83.6-95.7 s  the loud F#m, the top line on F#5
//   brk    145.0-157 s   the quiet F#m breakdown
//   hooka  160.3-166 s   Dmaj7 | D | E | E (also 190.4 s)
//   hookb  166.4-172 s   E | E | B7 | B7 (also 196.4 s)
// Lap 99.4 bpm, final lap 107.4. An acid bass (silverbox), the riff on a fuzz
// guitar, the top line on a Moog lead (ladder, funk lead), particles in the
// breakdown, chip arp and chip lead; a synth kit (siege kick, lancet snare,
// salamander hat, crash and toms).
// ---------------------------------------------------------------------------

const INNER_CELL = {
  meter: '5/8', spb: 10, rot: 0, bpm: 99.4, finalPlus: 8, mix: 0.6,
  tracks: [
    // The siege kick is a tuned sine: tuned to the key's root rather than its default C.
    { name: 'kick', engine: 'dm:siege', preset: '909', params: { vol: 0.72, sgehpf: 'on' }, note: 'F#1' },
    { name: 'snare', engine: 'dm:lancet', preset: 'tight analog', params: { vol: 0.6, decay: 0.3, lncrtimbre: 0.1, lncrlevel: 0.15 } },
    // Sampled cymbals: the halo's metal model is six fixed-pitch squares, which colour the key.
    { name: 'hat', engine: 'sampler', sample: 'salamander/hihat', drum: true, params: { vol: 0.75 } },
    { name: 'crash', engine: 'sampler', sample: 'salamander/crash', drum: true, params: { vol: 0.5 } },
    { name: 'tom hi', engine: 'sampler', sample: 'salamander/tom1', drum: true, params: { vol: 0.6 } },
    { name: 'tom lo', engine: 'sampler', sample: 'salamander/tom2', drum: true, params: { vol: 0.65 } },
    { name: 'bass', engine: 'dm:silverbox', params: { vol: 1, harm: 0.45, timb: 0.6, morph: 0.6, decay: 0.4, sbaccent: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.42 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.42 }, out: 'verb' },
    { name: 'cell', engine: 'plaits:10', params: { vol: 0.4, harm: 0.03, timb: 0.4, morph: 0.6, decay: 0.8 }, out: 'verb' },
    chip('chip arp', { vol: 0.28, pw: 0.25 }),
    chip('chip lead', { vol: 0.28, pw: 0.125 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.34 }, out: 'verb' },
    verbBus(2.2, 0.3, 0.2),
  ],
  arpRate: 0.125,
  grooves: {
    groove: (final) => final
      ? { kick: 'X..x.X..x.', snare: '..o.x...oX', hat: 'xxxxxxxxxx' }
      : { kick: 'X....X....', snare: '....x....X', hat: 'x.x.x.x.x.' },
    half: (final) => ({ kick: 'X.........', snare: final ? '....x....X' : '.........x', hat: 'x...x...x.' }),
  },
  fill: { kick: 'X....X....', snare: '....x.rrRR', hat: 'x.x.......', 'tom hi': '.x.x......', 'tom lo': '.....x.x..' },
  order: ['intro', 'verse', 'csharp', 'pre', 'chorus', 'brk', 'hooka', 'hookb'],
  finalOrder: ['hooka', 'hookb', 'verse', 'csharp', 'pre', 'chorus', 'hooka2', 'hookb2'],
  sections(final) {
    const T = CELL;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up = (k, line, n) => oct(tile4(this, T[k], line), n);
    const drip = { s: rep('X_________', 4), n: 'F#5 C#6 A5 E6' };
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half', extra: { cell: drip } }),
      verse: s('verse'),
      csharp: s('csharp'),
      pre: s('pre', { extra: { 'chip lead': up('pre', 'riff', 1) } }),
      chorus: s('chorus', { extra: final ? { 'chip lead': up('chorus', 'riff', 1) } : {} }),
      brk: s('brk', { drums: 'half', extra: { cell: drip } }),
      hooka: s('hooka', { extra: final ? { 'chip lead': up('hooka', 'riff', 1) } : {} }),
      hookb: s('hookb', { extra: { 'chip lead': up('hookb', 'riff', 1) } }),
      hooka2: s('hooka', { extra: { 'chip lead': up('hooka', 'riff', 1), cell: drip } }),
      hookb2: s('hookb', { extra: { 'chip lead': up('hookb', 'riff', 1) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Tetrachromacy (remix): the cup's finale, four-colour vision and prisms.
//
// Measured: a pulse of 0.273 s in threes, so 6/8 (quarter = 110 bpm, a bar
// 1.64 s), the kick on 1 and 4 two pulses after where the harmony's rows
// start (the phrases are rotated onto it), the snare on 3 and 6. Key: B, a
// pedal with chromatic colour (A, A#, C, C# against B), the E bars, and one
// F#m stretch with G (phrygian) before the quiet Bm. Section map:
//   intro    6.7-26.5 s  B7 | Bm7, quiet, the bass on B2 with E2 turns
//   verse   26.5-52.6 s  E | B, the bass rocking E2-B2-C#3, the line on D#5
//   verseb  52.6-59.2 s  B, the riff on B3 (also 105-118 s)
//   var     72.1-85.3 s  E, the C#-C colour, bass B1-B2-A#1
//   chorus  85.3-98.5 s  B | E, the refrain, the lead E4-B4-D#5
//   fsm    141.0-153 s   F#m with the G: the contrast
//   bm     153.9-163 s   Bm, quiet, the line on B4-F#5
//   payoff 170.0-189 s   E | B7, the last loud stretch
// Lap 110 bpm, final lap 118. Bass (growl), the riff on a brit-stack guitar,
// the top line on a supersaw (contagion) through the prism pedal, chip arp
// and chip lead; drskit drums.
// ---------------------------------------------------------------------------

const TETRACHROMACY = {
  meter: '6/8', spb: 12, rowBars: 2, rot: 4, bpm: 110, finalPlus: 8, mix: 0.68,
  tracks: [
    ...kit('drskit', { vol: { hihat: 1, crash: 0.9, openhat: 0.7 }, tune: { tom1: 'B1', tom2: 'A#1' } }),
    { name: 'bass', engine: 'dm:bass', preset: 'growl', params: { vol: 0.85 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'brit stack', params: { vol: 0.5 }, out: 'verb' },
    { name: 'lead', engine: 'dm:contagion', params: { vol: 0.42, harm: 0.68, timb: 0.15, morph: 0.7, decay: 0.7, vuni: '6', vunidet: 0.3, vunispread: 0.8, vatk: 0.02, vsus: 0.85, vrel: 0.3 }, out: 'verb', fx: { prism: { wet: 0.45 } } },
    chip('chip arp', { vol: 0.28, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    { name: 'pad', engine: 'dm:oracle', preset: 'warm pad', params: { vol: 0.34 }, out: 'verb' },
    verbBus(2.8, 0.32, 0.2),
  ],
  grooves: {
    groove: (final) => final
      ? { kick: 'X..x..X..x..', snare: '....x..o..X.', hat: 'xoxoxoxoxoxo', 'open hat': '..........x.' }
      : { kick: 'X.....X.....', snare: '....x.....X.', hat: 'X.x.x.X.....', 'open hat': '........x...' },
    half: (final) => ({ kick: 'X...........', snare: final ? '....x.....X.' : '..........X.', hat: 'x.....x.....', 'open hat': '' }),
  },
  fill: { kick: 'X.....X.....', snare: '....x...rrRR', hat: 'X.x.x.......', 'open hat': '', 'tom hi': '..x.x.......', 'tom lo': '......x.x...' },
  order: ['intro', 'verse', 'verseb', 'var', 'chorus', 'fsm', 'bm', 'payoff'],
  finalOrder: ['chorus', 'verse', 'verseb', 'var', 'chorus2', 'fsm', 'bm', 'payoff'],
  sections(final) {
    const T = TETRA;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up = (k, line, n) => oct(tile4(this, T[k], line), n);
    return {
      intro: s('intro', { drums: final ? 'groove' : 'half' }),
      verse: s('verse'),
      verseb: s('verseb', { extra: final ? { 'chip lead': up('verseb', 'riff', 1) } : {} }),
      var: s('var'),
      chorus: s('chorus', { extra: final ? { 'chip lead': up('chorus', 'lead', 0) } : {} }),
      chorus2: s('chorus', { extra: { 'chip lead': up('chorus', 'lead', 0) } }),
      fsm: s('fsm', { extra: { 'chip lead': up('fsm', 'riff', 1) } }),
      bm: s('bm', { drums: 'half' }),
      payoff: s('payoff', { extra: { 'chip lead': up('payoff', 'lead', 0) } }),
    };
  },
};

// ---------------------------------------------------------------------------

function cue(title, id, song) {
  return [false, true].map((final) => {
    const score = scoreOf(song, final);
    return {
      title: final ? `${title} (remix, final lap)` : `${title} (remix)`,
      cue: final ? `${id}-final-lap` : id,
      bars: barsOf(score.sections),
      build: () => compose(score),
    };
  });
}

// Polygondwanaland's transcription stays above, but no track plays it: the
// jungle track is Mycelium now, in the Ice, Death, Planets, Lungs, Mushrooms
// and Lava Cup.
export const SONGS = [
  ...cue('castle in the air', 'castle-in-the-air-remix', CASTLE_IN_THE_AIR),
  ...cue('inner cell', 'inner-cell-remix', INNER_CELL),
  ...cue('tetrachromacy', 'tetrachromacy-remix', TETRACHROMACY),
];
