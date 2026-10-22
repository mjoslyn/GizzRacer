// The Polygondwanaland Cup's remixes, written in seqbaby.
//
// Eight cues, four songs from Polygondwanaland (2017), each a lap cut and a
// faster final-lap cut with busier drums and the hook up front:
//
//   polygondwanaland-jungle-remix(-final-lap)  "Polygondwanaland"
//   castle-in-the-air-remix(-final-lap)        "The Castle in the Air"
//   inner-cell-remix(-final-lap)               "Inner Cell"
//   tetrachromacy-remix(-final-lap)            "Tetrachromacy"
//
// Exports SONGS, an array of { title, cue, bars, build } in the shape
// tools/render-soundtrack.mjs reads from seqbaby-seed's people.mjs (the
// gizzracer person's songs). `bars` is one pass of the chain in bars of
// pattern 0's meter (every song here keeps one meter throughout), and build()
// returns the session window.seqbaby.applySet loads. Import it from a seed
// checkout's people.mjs as `songs: [...otherSongs, ...SONGS]`; the renderer
// sets SEQBABY_DIR before it imports people.mjs, and songBuilder.js is loaded
// from there.
//
// These are written from memory of the album, not transcribed from a
// recording: keys, meters and tempos are the composer's best guess at the
// originals, and the riffs and hooks are written in their spirit (the vocal
// hook is the song title's syllables sung to a new tune). Each song's comment
// says what is meant and what each part plays.
//
// Every song is chain mode: eight sections of four bars, each handing to the
// next with a fill and a crash so the loop has no seam.

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
/** Join bar strings, or note lists. */
const cat = (...xs) => xs.join(' ');

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
      const part = typeof raw === 'string' ? { s: raw } : raw;
      const tok = tokens(part.s);
      if (steps % tok.length) throw new Error(`${sec.name}/${name}: ${tok.length} steps do not tile ${steps}`);
      const full = Array.from({ length: steps }, (_, k) => tok[k % tok.length]);
      const hits = full.filter((c) => c !== '.' && c !== '-' && c !== '_').length;
      const cyc = (list) => (list ? Array.from({ length: hits }, (_, k) => list[k % list.length]) : null);
      parts[name] = { part, full, notes: cyc(part.n && words(part.n)), chords: cyc(part.c && words(part.c)) };
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
        if (tok[0] === '_') tok[0] = '.';
        const ratchets = [];
        const str = tok.map((ch, k) => (RATCHET[ch] ? (ratchets.push([k, RATCHET[ch][1]]), RATCHET[ch][0]) : ch)).join('');
        if (!/[^._-]/.test(str)) continue;
        sb.setSteps(song, i, { pattern: slot, steps: str, velocity: p.part.v });
        const pat = song.tracks[i].patterns[slot];
        const hitSteps = pat.steps.map((on, k) => (on ? k : -1)).filter((k) => k >= 0);
        if (p.notes) sb.setNotes(song, i, { pattern: slot, notes: p.notes.slice(before, before + hitSteps.length) });
        for (const [k, n] of ratchets) sb.setStep(song, i, { pattern: slot, step: k, ratchet: n });
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

/** Per bar, the bar's chord tones picked by index: pick(['E3 G3 B3 D4'], [0, 1, 2]) -> E3 G3 B3. */
const pick = (tonesPerBar, order, semis = 0) => tonesPerBar.flatMap((tones) => order.map((k) => sb.toMidi(words(tones)[k]) + semis));

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

/** One held chord a bar, arpeggiated: the chip arp. */
const arpBars = (spb, roots, types, { rate = 0.125, range = 2, dir = 'updown' } = {}) =>
  ({ s: rep('X' + '_'.repeat(spb - 1), roots.length), n: roots, c: types, arp: { rate, range, dir } });

/** A chord per bar, struck on every hit of `bar`. */
function stabs(bar, roots, types, strumMs = 14) {
  const hits = tokens(bar).filter((c) => !'._-'.includes(c)).length;
  return { s: rep(bar, roots.length), n: roots.flatMap((r) => Array(hits).fill(r)), c: types.flatMap((t) => Array(hits).fill(t)), strum: strumMs };
}

/** A bassline: `bar` per chord root, the hits' notes as semitone offsets from the root. */
const bassBars = (bar, roots, offsets) => ({ s: rep(bar, roots.length), n: roots.flatMap((r) => offsets.map((o) => sb.toMidi(r) + o)) });

// ---------------------------------------------------------------------------
// Shared sounds
// ---------------------------------------------------------------------------

/** A sampler drum kit, one track per piece. */
function kit(name, { vol = {}, pieces = ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2'] } = {}) {
  const base = { kick: 0.9, snare: 0.8, hihat: 0.85, openhat: 0.55, crash: 0.7, tom1: 0.6, tom2: 0.65, ride: 0.55, rim: 0.6 };
  const names = { kick: 'kick', snare: 'snare', hihat: 'hat', openhat: 'open hat', crash: 'crash', tom1: 'tom hi', tom2: 'tom lo', ride: 'ride', rim: 'rim' };
  return pieces.map((p) => ({ name: names[p], engine: 'sampler', sample: `${name}/${p}`, drum: true, params: { vol: vol[p] ?? base[p] } }));
}

/** The fx bus every melodic part sends to: a room and a dotted-eighth echo. */
const verbBus = (decay = 2.4, wet = 0.32, delay = 0.18) => ({
  name: 'verb', engine: 'bus',
  fx: { delay: { sync: true, div: 0.75, fbk: 0.32, wet: delay }, reverb: { decay, wet } },
});

/** An 8-bit pulse: snarl with only its pulse oscillator, through a bit crusher. */
const chip = (name, { vol = 0.45, pw = 0.5, bits = 6, out = 'verb', cutoff = 0.85 } = {}) => ({
  name, engine: 'dm:snarl', out,
  params: { vol, harm: 0, timb: pw, osc1: 0, osc2: 0.9, osc3: 0, osc4: 0, ultra: 0, fm: 0, metal: 0 },
  filter: { cutoff },
  fx: { crush: { bits, rate: 0.55, wet: 0.7 } },
});

// ---------------------------------------------------------------------------
// 1. Polygondwanaland (remix): the jungle track.
//
// Key E dorian (E F# G A B C# D), 4/4, 132 bpm lap / 140 final lap. My memory
// of the title track is an acoustic, flute-led song that swells into a full
// band groove with the title sung as the hook; the meter here is a straight
// four (a guess), pushed along by jungle toms and a shaker.
//   riff    Em | G | D | A (i III VII IV, the dorian IV): a jangly guitar
//           arpeggio riff in eighths with a sixteenth pickup, the bass pumping
//           octaves under it
//   hook    C | D | Em | Em: the flute (ladder whistle) and a sung "po-ly-gon-
//           dwa-na-land" twice, the second time falling home to E
//   break   Am | Em | C | B: half time, toms, the chip arp alone on top
//   chip    a square-wave arp, a bar a chord, all the way through; a chip
//           lead doubles the hook an octave up the second time round
//   drums   drskit: rock groove, open hat on the "and" of four, tom fills and
//           a crash into every section; toms and shaker carry the intro
// ---------------------------------------------------------------------------

function polygondwanaland(final) {
  const tracks = [
    ...kit('drskit', { vol: { hihat: 1, crash: 0.9, openhat: 0.7 } }),
    { name: 'shaker', engine: 'dm:halo', preset: 'shaker', params: { vol: 0.42 } },
    { name: 'bass', engine: 'dm:bass', preset: 'pick grind', params: { vol: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'jangle', params: { vol: 0.55 }, out: 'verb' },
    { name: 'flute', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.5 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
    { name: 'voice', engine: 'dm:vox', preset: 'choir aah', params: { vol: 0.5, timb: 0.6, morph: 0.15, sngtext: 'po ly gon dwa na land' }, out: 'verb' },
    chip('chip arp', { vol: 0.32, pw: 0.25 }),
    chip('chip lead', { vol: 0.34, pw: 0.5 }),
    verbBus(2.6, 0.3, 0.16),
  ];

  // Drums, by bar. `fill` is the last bar of a section heading into the next.
  const groove = final
    ? { kick: 'X.....x.X.x...x.', snare: '....X..o....X.o.', hat: 'xoxoxoxoxoxoxoxo', ohat: '......x.......x.' }
    : { kick: 'X.....x.X.x.....', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.o.', ohat: '..............x.' };
  const fill = { kick: 'X.....x.X.......', snare: '....X...x.xxrrRR', hat: 'x.o.x.o.........', ohat: '................', tom1: '........x.x.....', tom2: '............x.x.' };
  const jungleToms = { tom1: '..x...x...x..x..', tom2: 'x.....x.x....x.x' };
  const drums = (bars, { toms = false, half = false, crash = true } = {}) => {
    const g = half ? { kick: 'X.......x.......', snare: '........X.......', hat: 'x...x...x...x...', ohat: '................' } : groove;
    const body = (k) => rep(g[k], bars - 1) + ' ' + fill[k];
    const out = { kick: body('kick'), snare: body('snare'), hat: body('hat'), 'open hat': body('ohat'), shaker: rep('xoxoxoxoxoxoxoxo', bars) };
    out['tom hi'] = (toms ? rep(jungleToms.tom1, bars - 1) : rep('................', bars - 1)) + ' ' + fill.tom1;
    out['tom lo'] = (toms ? rep(jungleToms.tom2, bars - 1) : rep('................', bars - 1)) + ' ' + fill.tom2;
    if (crash) out.crash = 'X' + '.'.repeat(bars * 16 - 1);
    return out;
  };

  const bassBar = final ? 'X.xxX.x.X.xxX.x.' : 'X.x.x.xxX.x.x.x.';
  const bassNotes = (roots) => roots.map((r) => {
    const m = sb.toMidi(r);
    return final ? [m, m + 12, m + 12, m, m + 7, m + 12, m + 7, m, m + 12, m] : [m, m, m + 12, m, m + 7, m, m + 12, m + 7, m + 12];
  }).flat();
  const bass = (roots) => ({ s: rep(bassBar, roots.length), n: bassNotes(roots) });

  // The guitar riff: chord tones in eighths with a sixteenth pickup.
  const RIFF = {
    Em: 'E4 B3 G4 B3 F#4 B3 E4 B3 D4',
    G: 'G4 D4 B4 D4 A4 D4 G4 D4 F#4',
    D: 'F#4 A3 D4 A3 E4 A3 F#4 A3 A4',
    A: 'E4 A3 C#4 A3 E4 A3 F#4 E4 C#4',
  };
  const riff = (chords) => ({ s: rep('X.x.x.x.x.x.x.xx', chords.length), n: chords.map((c) => RIFF[c]).join(' ') });
  const riffUp = (chords) => ({ s: rep('X.x.x.x.x.x.x.xx', chords.length), n: chords.map((c) => RIFF[c]).join(' ').replace(/(\d)/g, (d) => String(Number(d) + 1)) });

  // A strummed chord on the guitar, the hook's rhythm.
  const strum = (roots, types) => ({ s: rep(final ? 'X..x..x...x.x.x.' : 'X.....x...x.....', roots.length), n: roots.flatMap((r) => Array(final ? 6 : 3).fill(r)), c: types.flatMap((t) => Array(final ? 6 : 3).fill(t)), strum: 14 });
  const chipArp = (roots, types) => ({ s: rep('X_______________', roots.length), n: roots, c: types, arp: { rate: 0.125, range: 2, dir: 'updown' } });

  // The hook: "po-ly-gon-dwa-na-land", then again falling to E.
  const hookFlute = {
    s: 'x_x_X___x_x_X___ __________x_x_x_ x_x_X___x_x_X___ ________x_x_x_x_',
    n: 'G4 A4 B4 A4 B4 D5  E5 D5 B4  G4 A4 B4 A4 G4 E4  F#4 G4 A4 B4',
  };
  const hookVoice = {
    s: 'x_x_X___x_x_X___ ____............ x_x_X___x_x_X___ ____............',
    n: 'G3 A3 B3 A3 B3 D4  G3 A3 B3 A3 G3 E3',
  };
  const hookChip = { s: hookFlute.s, n: words(hookFlute.n).map((x) => x.replace(/\d/, (d) => String(Number(d) + 1))) };
  // The flute's counter-line over the riff.
  const counter = { s: 'X_______x___x___ X_______x_x_x___ X_______x___x___ X___x___x___x___', n: 'B4 G4 A4  B4 A4 B4 D5  F#5 E5 D5  E5 C#5 A4 C#5' };

  const RIFFC = ['Em', 'G', 'D', 'A'];
  const sections = {
    intro: { name: 'intro', bars: 4, parts: {
      ...drums(4, { toms: true }), kick: rep('X.......X.......', 3) + ' X.....x.X.......', snare: rep('................', 3) + ' ' + fill.snare,
      hat: rep('................', 4), 'open hat': rep('................', 4),
      bass: { s: rep('X.x.x.x.X.x.x.x.', 4), n: 'E2 E2 E3 E2' },
      guitar: { s: rep('................', 2) + ' ' + rep('X.x.x.x.x.x.x.xx', 2), n: RIFF.Em },
      'chip arp': chipArp(['E4', 'E4', 'E4', 'E4'], ['min7', 'min7', 'min7', 'min7']),
    } },
    riffA: { name: 'riff', bars: 4, parts: { ...drums(4), bass: bass(['E2', 'G2', 'D2', 'A2']), guitar: riff(RIFFC), 'chip arp': chipArp(['E4', 'G4', 'D4', 'A4'], ['min', 'maj', 'maj', 'maj']) } },
    riffB: { name: 'riff + flute', bars: 4, parts: { ...drums(4, { toms: final }), bass: bass(['E2', 'G2', 'D2', 'A2']), guitar: riff(RIFFC), flute: counter, 'chip arp': chipArp(['E4', 'G4', 'D4', 'A4'], ['min', 'maj', 'maj', 'maj']) } },
    hook: { name: 'hook', bars: 4, parts: { ...drums(4), bass: bass(['C2', 'D2', 'E2', 'E2']), guitar: strum(['C3', 'D3', 'E3', 'E3'], ['maj7', 'maj', 'min', 'min7']), flute: hookFlute, voice: hookVoice, 'chip arp': chipArp(['C4', 'D4', 'E4', 'E4'], ['maj7', 'maj', 'min', 'min7']) } },
    hook2: { name: 'hook, bigger', bars: 4, parts: { ...drums(4, { toms: true }), bass: bass(['C2', 'D2', 'E2', 'E2']), guitar: strum(['C3', 'D3', 'E3', 'E3'], ['maj7', 'maj', 'min', 'min7']), flute: hookFlute, voice: hookVoice, 'chip lead': hookChip } },
    brk: { name: 'break', bars: 4, parts: {
      ...drums(4, { toms: true, half: !final }),
      bass: { s: rep('X_______x_______', 4), n: 'A1 A2 E2 E3 C2 C3 B1 B2' },
      guitar: { s: rep('X_______________', 4), n: 'A3 E3 C3 B2', c: 'min min maj dom7', strum: 22 },
      'chip arp': { s: rep('X_______________', 4), n: 'A4 E4 C5 B4', c: 'min min maj dom7', arp: { rate: 0.125, range: 2, dir: 'up' } },
      'chip lead': { s: 'X___x___x_x_X___ x_______x___x___ X___x___x_x_X___ X_______x___x___', n: 'E5 C5 A4 B4 C5  B4 G4 E4  G5 E5 C5 D5 E5  D#5 F#5 B4' },
    } },
    riffC: { name: 'riff, flute doubling', bars: 4, parts: { ...drums(4, { toms: true }), bass: bass(['E2', 'G2', 'D2', 'A2']), guitar: riff(RIFFC), flute: riffUp(RIFFC), 'chip arp': chipArp(['E4', 'G4', 'D4', 'A4'], ['min', 'maj', 'maj', 'maj']) } },
    turn: { name: 'turn back', bars: 4, parts: {
      ...drums(4, { toms: true }),
      bass: bass(['C2', 'D2', 'E2', 'B1']),
      guitar: { s: 'X.....x...x..... X.....x...x..... X.x.x.x.x.x.x.xx X_______________', n: 'C3 C3 C3 D3 D3 D3 ' + RIFF.Em + ' B2', c: 'maj7 maj7 maj7 maj maj maj - - - - - - - - - dom7', strum: 14 },
      flute: { s: 'x_x_X___x_x_X___ __________x_x_x_ ................ x_x_x_x_X___X___', n: 'G4 A4 B4 A4 B4 D5  E5 D5 B4  F#4 A4 B4 D#5 F#5 B4' },
      voice: { s: 'x_x_X___x_x_X___ ____............ ................ ................', n: 'G3 A3 B3 A3 B3 D4' },
      'chip arp': chipArp(['C4', 'D4', 'E4', 'B3'], ['maj7', 'maj', 'min', 'dom7']),
    } },
  };
  const s = sections;
  const order = final
    ? [s.hook, s.riffA, s.hook2, s.riffC, s.brk, s.hook2, s.riffB, s.turn]
    : [s.intro, s.riffA, s.riffB, s.hook, s.hook2, s.brk, s.riffC, s.turn];
  return { bpm: final ? 140 : 132, meter: '4/4', mix: final ? 0.62 : 0.66, tracks, sections: order };
}

// ---------------------------------------------------------------------------
// 2. The Castle in the Air (remix): the castle floating in the sky.
//
// Key D dorian (D E F G A B C), 5/4, 144 bpm lap / 152 final lap. The record
// is Stu's spoken story over a lilting, flute-heavy band; I remember its feel
// better than its notes, so the meter (a five, felt 3+3+4 in eighths) and the
// key are guesses, and the hook is the title sung to a new tune.
//   riff    Dm7 | Cmaj7 | G7 | Dm: hexop bells ring a 3+3+4 ostinato on the
//           chord tones, a Moog bass (ladder) pumps octaves, the guitar
//           (chime) strikes the chord on each group
//   hook    F | C | G | A7: the flute sings "the cas-tle in the air" up to A,
//           answers, sings it again and turns on A7 back to D; a voice sings
//           the words under it; the ride takes the time
//   break   Bbmaj7 | Fmaj7 | Gm7 | A7: half time, an angel-ooh choir holds the
//           chords, a chip fanfare climbs each one
//   chip    the square arp on every bar's chord; a chip lead doubles the flute
//   drums   salamander kit: kick on 1, the "and" of 2 and 3, 5; snares on 2
//           and 4; tom and snare-roll fills, a crash into every section
// ---------------------------------------------------------------------------

function castleInTheAir(final) {
  const SPB = 20;
  const tracks = [
    ...kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'crash', 'tom1', 'tom2', 'ride'], vol: { ride: 0.95 } }),
    { name: 'bass', engine: 'dm:ladder', preset: 'model d bass', params: { vol: 1 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'bells', engine: 'dm:hexop', preset: 'bell', params: { vol: 0.34 }, out: 'verb' },
    { name: 'guitar', engine: 'dm:guitar', preset: 'chime', params: { vol: 0.5 }, out: 'verb' },
    { name: 'flute', engine: 'dm:ladder', preset: 'whistle', params: { vol: 0.5 }, out: 'verb', fx: { chorus: { wet: 0.25 } } },
    { name: 'voice', engine: 'dm:vox', preset: 'choir aah', params: { vol: 0.5, timb: 0.6, morph: 0.15, sngtext: 'the kas tel in the air' }, out: 'verb' },
    { name: 'choir', engine: 'dm:vox', preset: 'angel ooh', params: { vol: 0.32 }, out: 'verb' },
    chip('chip arp', { vol: 0.3, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    verbBus(3.2, 0.34, 0.18),
  ];

  const R = '.'.repeat(SPB);
  const groove = final
    ? { kick: 'X.....x.x.x.....x.x.', snare: '....X..o....X..o..o.', hat: 'xoxoxoxoxoxoxoxoxoxo' }
    : { kick: 'X.....x...x.....x...', snare: '....X.......X......o', hat: 'x.o.x.o.x.o.x.o.x.o.' };
  const rideGroove = { ...groove, hat: '..x...x...x...x...x.', ride: final ? 'x.oxx.oxx.oxx.oxx.ox' : 'x.o.x.o.x.o.x.o.x.o.' };
  const fill = { kick: 'X.......x...........', snare: '....X...........rrRR', hat: 'x.o.x.o.x...........', ride: '', 'tom hi': '........x.x.x.......', 'tom lo': '.............x.x....' };
  const half = { kick: 'X...............x...', snare: '........X...........', hat: 'x...x...x...x...x...' };
  const drums = (g = groove) => beat(4, SPB, g, fill);

  const TONES = { Dm7: 'D4 F4 A4 C5', C: 'C4 E4 G4 B4', G: 'G3 B3 D4 F4', Dm: 'D4 F4 A4 D5', F: 'F4 A4 C5 E5', A: 'A3 C#4 E4 G4', Bb: 'Bb3 D4 F4 A4', Gm: 'G3 Bb3 D4 F4' };
  const TYPE = { Dm7: 'min7', C: 'maj7', G: 'dom7', Dm: 'min', F: 'maj7', A: 'dom7', Bb: 'maj7', Gm: 'min7' };
  const BASS = { Dm7: 'D2', C: 'C2', G: 'G1', Dm: 'D2', F: 'F1', A: 'A1', Bb: 'Bb1', Gm: 'G1' };
  const GTR = { Dm7: 'D3', C: 'C3', G: 'G2', Dm: 'D3', F: 'F2', A: 'A2', Bb: 'Bb2', Gm: 'G2' };
  const roots = (map, cs) => cs.map((c) => map[c]);
  const types = (cs) => cs.map((c) => TYPE[c]);

  const bells = (cs) => ({ s: rep('X.x.x.X.x.x.X.x.x.x.', cs.length), n: pick(cs.map((c) => TONES[c]), [0, 2, 1, 0, 2, 1, 3, 2, 1, 2]) });
  const bass = (cs) => final
    ? bassBars('X.x.x.x.x.x.X.x.x.x.', roots(BASS, cs), [0, 12, 0, 7, 0, 12, 0, 12, 7, 12])
    : bassBars('X.x...x.x...X.x.x.x.', roots(BASS, cs), [0, 12, 0, 7, 0, 12, 7, 12]);
  const guitar = (cs) => stabs(final ? 'X..x..x..x..X.x.x.x.' : 'X.....x.....X...x...', roots(GTR, cs), types(cs));
  const chipArp = (cs) => arpBars(SPB, cs.map((c) => words(TONES[c])[0]), types(cs));
  const choir = (cs) => ({ s: rep('X' + '_'.repeat(SPB - 1), cs.length), n: roots(GTR, cs).map((r) => sb.toMidi(r) + 12), c: types(cs) });

  // "the cas-tle in the air", its answer, the line again, and the turn on A7.
  const hookFlute = {
    s: 'x_X___x_x_x_X_______ X___x___x___x_x_X___ x_X___x_x_x_X_______ X_______x_x_x___x___',
    n: 'C5 F5 E5 F5 G5 A5  G5 E5 C5 D5 E5 C5  B4 D5 C5 B4 C5 D5  E5 G5 F5 E5 C#5',
  };
  const hookVoice = { s: 'x_X___x_x_x_X_______ ____................ x_X___x_x_x_X_______ ____................', n: 'C4 F4 E4 F4 G4 A4  B3 D4 C4 B3 C4 D4' };
  const counter = { s: 'X_______x___x___x___ X_______________x___ X_______x___x___x___ X_______________....', n: 'A4 C5 A4 G4  E5 D5  D5 B4 C5 D5  A4' };

  const RIFF = ['Dm7', 'C', 'G', 'Dm'];
  const HOOK = ['F', 'C', 'G', 'A'];
  const BRK = ['Bb', 'F', 'Gm', 'A'];
  const s = {
    intro: { name: 'intro', bars: 4, parts: {
      ...beat(4, SPB, { kick: 'X...x...x...x...x...', ride: 'x.o.x.o.x.o.x.o.x.o.' }, fill),
      bells: bells(['Dm7', 'Dm7', 'Dm7', 'Dm7']), choir: choir(['Dm7', 'Dm7', 'Dm7', 'Dm7']),
      bass: { s: R + R + rep('X.x...x.x...X.x.x.x.', 2), n: tr('D2 D3 D2 A2 D2 D3 A2 D3', 0) },
      'chip arp': { ...chipArp(['Dm7', 'Dm7', 'Dm7', 'Dm7']), s: R + rep('X' + '_'.repeat(SPB - 1), 3) },
    } },
    riffA: { name: 'riff', bars: 4, parts: { ...drums(), bells: bells(RIFF), bass: bass(RIFF), guitar: guitar(RIFF), 'chip arp': chipArp(RIFF) } },
    riffB: { name: 'riff + flute', bars: 4, parts: { ...drums(), bells: bells(RIFF), bass: bass(RIFF), guitar: guitar(RIFF), flute: counter, 'chip arp': chipArp(RIFF) } },
    hook: { name: 'hook', bars: 4, parts: { ...drums(rideGroove), bass: bass(HOOK), guitar: guitar(HOOK), flute: hookFlute, voice: hookVoice, choir: choir(HOOK), 'chip arp': chipArp(HOOK) } },
    hook2: { name: 'hook, bigger', bars: 4, parts: {
      ...drums(rideGroove), 'tom hi': rep('..........x.........', 3) + ' ' + fill['tom hi'], 'tom lo': rep('................x.x.', 3) + ' ' + fill['tom lo'],
      bass: bass(HOOK), guitar: guitar(HOOK), bells: bells(HOOK), flute: hookFlute, voice: hookVoice, 'chip lead': hookFlute, choir: choir(HOOK),
    } },
    brk: { name: 'break', bars: 4, parts: {
      ...beat(4, SPB, final ? { ...half, hat: 'x.x.x.x.x.x.x.x.x.x.' } : half, fill),
      bass: { s: rep('X_________x_________', 4), n: BRK.flatMap((c) => [sb.toMidi(BASS[c]), sb.toMidi(BASS[c]) + 12]) },
      choir: choir(BRK),
      bells: { s: rep('X_________X_________', 4), n: 'Bb4 D5 F4 A4 G4 Bb4 A4 C#5' },
      'chip arp': chipArp(BRK),
      'chip lead': { s: 'x_x_x_X_______x_x_x_ X___________x_x_x_x_ x_x_x_X_______x_x_x_ X_______x_x_x_x_x_x_', n: 'Bb4 D5 F5 A5 G5 F5 D5  C5 A4 C5 E5 F5  G4 Bb4 D5 F5 E5 D5 Bb4  C#5 E5 G5 A5 G5 E5 C#5' },
    } },
    riffC: { name: 'riff, chip counter', bars: 4, parts: {
      ...drums(), 'tom hi': rep('..........x.........', 3) + ' ' + fill['tom hi'],
      bells: bells(RIFF), bass: bass(RIFF), guitar: guitar(RIFF), 'chip lead': counter, flute: { s: R + R + R + 'X_______________....', n: 'A5' }, 'chip arp': chipArp(RIFF),
    } },
    turn: { name: 'turn back', bars: 4, parts: {
      ...drums(rideGroove),
      bass: bass(HOOK), guitar: guitar(HOOK), choir: choir(HOOK), 'chip arp': chipArp(HOOK),
      flute: { s: 'x_X___x_x_x_X_______ X___x___x___x_x_X___ x_x_x_x_x_x_X_______ X_______x_x_x___x___', n: 'C5 F5 E5 F5 G5 A5  G5 E5 C5 D5 E5 C5  D5 C5 B4 A4 G4 B4 D5  E5 G5 F5 E5 C#5' },
      voice: { s: 'x_X___x_x_x_X_______ ____................ ' + R + ' ' + R, n: 'C4 F4 E4 F4 G4 A4' },
    } },
  };
  const order = final
    ? [s.hook, s.riffA, s.hook2, s.riffC, s.brk, s.hook2, s.riffB, s.turn]
    : [s.intro, s.riffA, s.riffB, s.hook, s.hook2, s.brk, s.riffC, s.turn];
  return { bpm: final ? 152 : 144, meter: '5/4', mix: final ? 0.62 : 0.66, tracks, sections: order };
}

// ---------------------------------------------------------------------------
// 3. Inner Cell (remix): inside a giant living cell.
//
// Key A minor (aeolian, with the phrygian Bb in the riff), 4/4, 136 bpm lap /
// 144 final lap. What I remember of the song is a tight, circling, slightly
// sinister groove with a riff the bass and guitar play together; the key,
// tempo and the riff's notes are my guesses, written in that manner.
//   riff    a two-bar unison riff on A (A-C-D-E down to G, then the Bb
//           half-step): an acid bass (silverbox, accents and slides) and a
//           fuzz guitar an octave up; the B riff moves it to D and back
//   hook    F | G | Am | Am: a Moog lead (ladder, funk lead) sings "in-ner
//           cell, in-ner cell" twice up to A, and a robot choir sings the
//           words with it
//   break   F | Em | Dm | E: half time, the chip arp and a wailing lead, the
//           E major turning it home; particles drip like a cell's insides
//   chip    the square arp on every bar's chord; a chip lead doubles the riff
//           two octaves up, and the hook an octave down
//   drums   a synth kit (siege kick, lancet snare, a halo hat that opens on
//           the "and" of four), salamander toms for the fills, a crash on
//           every section
// ---------------------------------------------------------------------------

function innerCell(final) {
  const tracks = [
    { name: 'kick', engine: 'dm:siege', preset: '909', params: { vol: 0.72, sgehpf: 'on' } },
    { name: 'snare', engine: 'dm:lancet', preset: 'fat analog', params: { vol: 0.58, lncrtimbre: 0.15, lncrlevel: 0.15 } },
    { name: 'hat', engine: 'dm:halo', preset: 'pedal hat', params: { vol: 0.5 } },
    { name: 'crash', engine: 'dm:halo', preset: 'crash', params: { vol: 0.38 } },
    { name: 'tom hi', engine: 'sampler', sample: 'salamander/tom1', drum: true, params: { vol: 0.6 } },
    { name: 'tom lo', engine: 'sampler', sample: 'salamander/tom2', drum: true, params: { vol: 0.65 } },
    { name: 'bass', engine: 'dm:silverbox', params: { vol: 1, harm: 0.45, timb: 0.6, morph: 0.6, decay: 0.4, sbaccent: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'fuzz lead', params: { vol: 0.42 }, out: 'verb' },
    { name: 'lead', engine: 'dm:ladder', preset: 'funk lead', params: { vol: 0.45 }, out: 'verb' },
    { name: 'voice', engine: 'dm:vox', preset: 'robot choir', params: { vol: 0.62, sngtext: 'in ner sel' }, out: 'verb' },
    { name: 'cell', engine: 'plaits:10', params: { vol: 0.55, harm: 0.6, timb: 0.4, morph: 0.6, decay: 0.8 }, out: 'verb' },
    chip('chip arp', { vol: 0.3, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.125 }),
    verbBus(2.2, 0.3, 0.2),
  ];

  const groove = final
    ? { kick: 'X..x..x.X.x..x..', snare: '....X..o.o..X..o', hat: 'xoxoxoxoxoxox___' }
    : { kick: 'X.....x.X.x...x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x___' };
  const fill = { kick: 'X.....x.X.......', snare: '....X.....xxrrRR', hat: 'x.x.x.x.x.......', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' };
  const half = { kick: 'X.........x.....', snare: '........X.......', hat: 'x...x...x...x___' };
  const drums = (g = groove) => beat(4, 16, g, fill);

  // The riff: two bars on A, written at the bass's octave.
  const RIFF_BASS = 'X.xx.xx_x.xXx.x. X.xx.xx_x.x.x.x.';
  const RIFF_GTR = 'x.xx.xx.x.xxx.x. x.xx.xx.x.x.x.x.';
  const RIFF_N = 'A2 A2 C3 A2 D3 E3 D3 C3 A2 G2  A2 A2 C3 A2 Bb2 A2 G2 E2 G2';
  const riff = (semis) => ({
    bass: { s: RIFF_BASS, n: tr(RIFF_N, semis) },
    guitar: { s: RIFF_GTR, n: tr(RIFF_N, semis + 12) },
  });
  const riffAA = { bass: { s: rep(RIFF_BASS, 2), n: tr(RIFF_N, 0) }, guitar: { s: rep(RIFF_GTR, 2), n: tr(RIFF_N, 12) } };
  const riffDA = { bass: { s: rep(RIFF_BASS, 2), n: [...riff(5).bass.n, ...riff(0).bass.n] }, guitar: { s: rep(RIFF_GTR, 2), n: [...riff(5).guitar.n, ...riff(0).guitar.n] } };
  const chipRiff = { s: rep(RIFF_GTR, 2), n: tr(RIFF_N, 24) };

  const T = { Am: ['A3', 'min'], F: ['F3', 'maj7'], G: ['G3', 'maj'], Dm: ['D3', 'min7'], Em: ['E3', 'min'], E: ['E3', 'dom7'] };
  const chipArp = (cs) => arpBars(16, cs.map((c) => sb.toMidi(T[c][0]) + 12), cs.map((c) => T[c][1]));
  const cell = (n) => ({ s: rep('X_______________', n), n: 'A5 E6 C6 G5' });
  const hookBass = (cs) => bassBars(final ? 'X.xxX.x.X.xxX.x.' : 'X.x.x.x.X.x.x.x.', cs.map((c) => sb.toMidi(T[c][0]) - 12), final ? [0, 12, 12, 0, 7, 12, 0, 12, 0, 12] : [0, 12, 0, 12, 0, 12, 7, 12]);
  const hookGtr = (cs) => bassBars('X.x.x.x.X.x.x.x.', cs.map((c) => T[c][0]), [0, 0, 7, 0, 0, 0, 7, 12]);

  // "in-ner cell, in-ner cell", answered; again up to A.
  const hookLead = { s: 'x_x_X_____x_x_X_ X_______x_x_x___ x_x_X_____x_x_X_ X_______x_x_x_x_', n: 'C5 D5 E5 C5 D5 F5  G5 F5 E5 D5  C5 D5 E5 E5 G5 A5  A5 G5 E5 D5 E5' };
  const hookVoice = { s: 'x_x_X_____x_x_X_ ________........ x_x_X_____x_x_X_ ________........', n: 'C4 D4 E4 C4 D4 F4  C4 D4 E4 E4 G4 A4' };
  const counter = { s: 'X_______________ X_______x___x___ X_______________ X_______x___x___', n: 'F5 E5 D5 C5 E5 D5 C5 B4' };

  const HOOK = ['F', 'G', 'Am', 'Am'];
  const BRK = ['F', 'Em', 'Dm', 'E'];
  const s = {
    intro: { name: 'intro', bars: 4, parts: {
      ...beat(4, 16, { kick: 'X...X...X...X...', hat: 'x.x.x.x.x.x.x___' }, fill),
      bass: riffAA.bass, guitar: { s: rep('................', 2) + ' ' + RIFF_GTR, n: tr(RIFF_N, 12) },
      cell: cell(4), 'chip arp': chipArp(['Am', 'Am', 'Am', 'Am']),
    } },
    riffA: { name: 'riff', bars: 4, parts: { ...drums(), ...riffAA, 'chip arp': chipArp(['Am', 'Am', 'Am', 'Am']) } },
    riffB: { name: 'riff on D', bars: 4, parts: { ...drums(), ...riffDA, lead: counter, 'chip arp': chipArp(['Dm', 'Dm', 'Am', 'Am']) } },
    hook: { name: 'hook', bars: 4, parts: { ...drums(), bass: hookBass(HOOK), guitar: hookGtr(HOOK), lead: hookLead, voice: hookVoice, 'chip arp': chipArp(HOOK) } },
    hook2: { name: 'hook, bigger', bars: 4, parts: {
      ...drums(), 'tom lo': rep('..............x.', 3) + ' ' + fill['tom lo'],
      bass: hookBass(HOOK), guitar: hookGtr(HOOK), lead: hookLead, voice: hookVoice, 'chip lead': { s: hookLead.s, n: tr(hookLead.n, -12) }, cell: cell(4),
    } },
    brk: { name: 'break', bars: 4, parts: {
      ...beat(4, 16, final ? { ...half, hat: 'x.x.x.x.x.x.x___' } : half, fill),
      bass: { s: rep('X_____x_X_______', 4), n: BRK.flatMap((c) => [sb.toMidi(T[c][0]) - 12, sb.toMidi(T[c][0]), sb.toMidi(T[c][0]) - 12]) },
      lead: { s: 'X_______x___x___ X_______x___x___ X_______x___x___ X___x___x___x___', n: 'A5 G5 F5  G5 E5 B4  F5 E5 D5  G#5 B5 G#5 E5' },
      'chip arp': chipArp(BRK), cell: cell(4),
    } },
    riffC: { name: 'riff, chip doubling', bars: 4, parts: { ...drums(), 'tom hi': rep('..........x.....', 3) + ' ' + fill['tom hi'], ...riffAA, 'chip lead': chipRiff, cell: cell(4) } },
    turn: { name: 'turn back', bars: 4, parts: {
      ...drums(),
      bass: { s: 'X.x.x.x.X.x.x.x. X.x.x.x.X.x.x.x. ' + RIFF_BASS.split(' ')[0] + ' X.x.x.x.X.......', n: [...hookBass(['F', 'G']).n, ...riff(0).bass.n.slice(0, 10), ...tr('E2 E3 E2 E3 B1', 0)] },
      guitar: { s: 'X.x.x.x.X.x.x.x. X.x.x.x.X.x.x.x. ' + RIFF_GTR.split(' ')[0] + ' X_______________', n: [...hookGtr(['F', 'G']).n, ...riff(0).guitar.n.slice(0, 10), sb.toMidi('E3')] },
      lead: { s: 'x_x_X_____x_x_X_ X_______x_x_x___ ................ X___x___x_x_x_x_', n: 'C5 D5 E5 C5 D5 F5  G5 F5 E5 D5  G#5 B5 A5 G#5 E5' },
      voice: { s: 'x_x_X_____x_x_X_ ________........ ................ ................', n: 'C4 D4 E4 C4 D4 F4' },
      'chip arp': chipArp(['F', 'G', 'Am', 'E']),
    } },
  };
  const order = final
    ? [s.hook, s.riffA, s.hook2, s.riffC, s.brk, s.hook2, s.riffB, s.turn]
    : [s.intro, s.riffA, s.riffB, s.hook, s.hook2, s.brk, s.riffC, s.turn];
  return { bpm: final ? 144 : 136, meter: '4/4', mix: final ? 0.62 : 0.66, tracks, sections: order };
}

// ---------------------------------------------------------------------------
// 4. Tetrachromacy (remix): the cup's finale, four-colour vision and prisms.
//
// Key F# minor (aeolian, with the dorian B major as the "fourth colour"),
// 7/8, 156 bpm lap / 164 final lap. I remember Tetrachromacy as one of the
// album's dreamier, lighter-touch songs with the title as its sung hook; the
// 7/8 (felt 2+2+3), the key and the tempo are my choices for a finale, not a
// transcription.
//   riff    F#m | E | D | E: a driven guitar (brit stack) and the bass in
//           octaves play the chord tones 2+2+3 (root, root, third, root,
//           fifth, third, root, seventh)
//   hook    D | A | E | B: a supersaw (contagion) through the prism pedal
//           sings "te-tra-chro-ma-cy" twice, climbing to B; a choir sings the
//           words under it; the guitar strikes the chords
//   break   Bm | F#m | G | C#7: half time, the lead soars, the Neapolitan G
//           and the C#7 bring it home to F#m
//   chip    the square arp on every bar's chord; a chip lead doubles the hook
//           and plays the riff two octaves up
//   drums   drskit: kick on 1 and 3, snare on 2 and the last eighth, eighth
//           hats; sixteenths and more kicks on the final lap; fills and crashes
// ---------------------------------------------------------------------------

function tetrachromacy(final) {
  const SPB = 14;
  const tracks = [
    ...kit('drskit', { vol: { hihat: 1, crash: 0.9, openhat: 0.7 } }),
    { name: 'bass', engine: 'dm:bass', preset: 'growl', params: { vol: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
    { name: 'guitar', engine: 'dm:guitar', preset: 'brit stack', params: { vol: 0.56 }, out: 'verb' },
    { name: 'lead', engine: 'dm:contagion', params: { vol: 0.42, harm: 0.68, timb: 0.15, morph: 0.7, decay: 0.7, vuni: '6', vunidet: 0.3, vunispread: 0.8, vatk: 0.02, vsus: 0.85, vrel: 0.3 }, out: 'verb', fx: { prism: { wet: 0.45 } } },
    { name: 'voice', engine: 'dm:vox', preset: 'choir aah', params: { vol: 0.48, timb: 0.6, morph: 0.15, sngtext: 'te tra kro ma see' }, out: 'verb' },
    chip('chip arp', { vol: 0.3, pw: 0.25 }),
    chip('chip lead', { vol: 0.3, pw: 0.5 }),
    verbBus(2.8, 0.32, 0.2),
  ];

  const R = '.'.repeat(SPB);
  const groove = final
    ? { kick: 'X.....x.X.x.x.', snare: '....X..o....X.', hat: 'xoxoxoxoxoxoxo', 'open hat': '......x.......' }
    : { kick: 'X.......X.x...', snare: '....X.......X.', hat: 'X.x.x...X.x.x.', 'open hat': '......x.......' };
  const fill = { kick: 'X.......X.....', snare: '....X.....rrRR', hat: 'x.x.x.x.......', 'open hat': '', 'tom hi': '......x.......', 'tom lo': '........x.x...' };
  const half = { kick: 'X.............', snare: '........X.....', hat: 'x...x...x.....' };
  const drums = (g = groove) => beat(4, SPB, g, fill);

  const TONES = {
    'F#m': 'F#3 A3 C#4 E4', E: 'E3 G#3 B3 D4', D: 'D3 F#3 A3 C#4', A: 'A3 C#4 E4 G#4', B: 'B2 D#3 F#3 A3',
    Bm: 'B2 D3 F#3 A3', G: 'G3 B3 D4 F#4', 'C#7': 'C#3 F3 G#3 B3',
  };
  const TYPE = { 'F#m': 'min', E: 'maj', D: 'maj7', A: 'maj', B: 'maj', Bm: 'min7', G: 'maj7', 'C#7': 'dom7' };
  const root = (c) => words(TONES[c])[0];
  const RIFF_BAR = final ? 'X.x.X.xxX.xxx.' : 'X.x.X.x.X.xxx.';
  const RIFF_IDX = final ? [0, 0, 1, 0, 0, 2, 1, 0, 3] : [0, 0, 1, 0, 2, 1, 0, 3];
  const riff = (cs, semis = 0) => ({ s: rep(RIFF_BAR, cs.length), n: pick(cs.map((c) => TONES[c]), RIFF_IDX, semis) });
  const chipArp = (cs) => arpBars(SPB, cs.map((c) => sb.toMidi(root(c)) + 12), cs.map((c) => TYPE[c]), { rate: 0.125, range: 2, dir: 'up' });
  const hookGtr = (cs) => stabs(final ? 'X.x.X.x.X.x.x.' : 'X...X...X.x...', cs.map(root), cs.map((c) => TYPE[c]));
  const hookBass = (cs) => bassBars(final ? 'X.x.X.x.X.xxx.' : 'X.x.X.x.X.x.x.', cs.map((c) => sb.toMidi(root(c)) - 12), final ? [0, 12, 0, 12, 0, 7, 12, 7] : [0, 12, 0, 12, 0, 7, 12]);

  // "te-tra-chro-ma-cy", its answer, again up to B, and the turn on B.
  const hookLead = { s: 'x_X_x_x_X_____ X___x_x_X_____ x_X_x_x_X_____ X_______x_x_x_', n: 'A4 D5 C#5 D5 F#5  E5 C#5 B4 C#5  B4 E5 F#5 G#5 B5  D#5 F#5 E5 D#5' };
  const hookVoice = { s: 'x_X_x_x_X_____ ____.......... x_X_x_x_X_____ ____..........', n: 'A3 D4 C#4 D4 F#4  B3 E4 F#4 G#4 B4' };
  const counter = { s: 'X_____________ X_______x_____ X_____________ X_____x_____x_', n: 'C#5 B4 G#4 A4 B4 D5 E5' };

  const RIFF = ['F#m', 'E', 'D', 'E'];
  const HOOK = ['D', 'A', 'E', 'B'];
  const BRK = ['Bm', 'F#m', 'G', 'C#7'];
  const s = {
    intro: { name: 'intro', bars: 4, parts: {
      ...beat(4, SPB, { kick: 'X.......X.....', hat: 'x.x.x.x.x.x.x.' }, fill),
      guitar: riff(['F#m', 'F#m', 'F#m', 'F#m']),
      bass: { s: R + R + rep(RIFF_BAR, 2), n: pick([TONES['F#m']], RIFF_IDX, -12) },
      'chip arp': chipArp(['F#m', 'F#m', 'F#m', 'F#m']),
    } },
    riffA: { name: 'riff', bars: 4, parts: { ...drums(), guitar: riff(RIFF), bass: riff(RIFF, -12), 'chip arp': chipArp(RIFF) } },
    riffB: { name: 'riff + lead', bars: 4, parts: { ...drums(), guitar: riff(RIFF), bass: riff(RIFF, -12), lead: counter, 'chip arp': chipArp(RIFF) } },
    hook: { name: 'hook', bars: 4, parts: { ...drums(), bass: hookBass(HOOK), guitar: hookGtr(HOOK), lead: hookLead, voice: hookVoice, 'chip arp': chipArp(HOOK) } },
    hook2: { name: 'hook, bigger', bars: 4, parts: {
      ...drums(), 'tom lo': rep('..........x.x.', 3) + ' ' + fill['tom lo'],
      bass: hookBass(HOOK), guitar: hookGtr(HOOK), lead: hookLead, voice: hookVoice, 'chip lead': hookLead, 'chip arp': chipArp(HOOK),
    } },
    brk: { name: 'break', bars: 4, parts: {
      ...beat(4, SPB, final ? { ...half, hat: 'x.x.x.x.x.x.x.' } : half, fill),
      bass: { s: rep('X_______x_____', 4), n: BRK.flatMap((c) => [sb.toMidi(root(c)) - 12, sb.toMidi(root(c))]) },
      guitar: { s: rep('X_____________', 4), n: BRK.map(root), c: BRK.map((c) => TYPE[c]), strum: 24 },
      lead: { s: 'X_______x___x_ X_______x___x_ X___x___x___x_ X_______x_x_x_', n: 'F#5 E5 D5  C#5 E5 F#5  D5 F#5 G5 B5  G#5 F5 C#5 B4' },
      'chip arp': chipArp(BRK),
    } },
    riffC: { name: 'riff, chip doubling', bars: 4, parts: { ...drums(), 'tom hi': rep('......x.......', 3) + ' ' + fill['tom hi'], guitar: riff(RIFF), bass: riff(RIFF, -12), 'chip lead': riff(RIFF, 24), 'chip arp': chipArp(RIFF) } },
    turn: { name: 'turn back', bars: 4, parts: {
      ...drums(),
      bass: hookBass(['D', 'A', 'E', 'C#7']), guitar: hookGtr(['D', 'A', 'E', 'C#7']),
      lead: { s: 'x_X_x_x_X_____ X___x_x_X_____ ' + R + ' X_______x_x_x_', n: 'A4 D5 C#5 D5 F#5  E5 C#5 B4 C#5  G#5 F5 G#5 B5' },
      voice: { s: 'x_X_x_x_X_____ ____.......... ' + R + ' ' + R, n: 'A3 D4 C#4 D4 F#4' },
      'chip arp': chipArp(['D', 'A', 'E', 'C#7']),
    } },
  };
  const order = final
    ? [s.hook, s.riffA, s.hook2, s.riffC, s.brk, s.hook2, s.riffB, s.turn]
    : [s.intro, s.riffA, s.riffB, s.hook, s.hook2, s.brk, s.riffC, s.turn];
  return { bpm: final ? 164 : 156, meter: '7/8', mix: final ? 0.62 : 0.66, tracks, sections: order };
}

// ---------------------------------------------------------------------------

function cue(title, id, make) {
  return [false, true].map((final) => {
    const score = make(final);
    return {
      title: final ? `${title} (remix, final lap)` : `${title} (remix)`,
      cue: final ? `${id}-final-lap` : id,
      bars: barsOf(score.sections),
      build: () => compose(score),
    };
  });
}

export const SONGS = [
  ...cue('polygondwanaland', 'polygondwanaland-jungle-remix', polygondwanaland),
  ...cue('castle in the air', 'castle-in-the-air-remix', castleInTheAir),
  ...cue('inner cell', 'inner-cell-remix', innerCell),
  ...cue('tetrachromacy', 'tetrachromacy-remix', tetrachromacy),
];
