// The Altered Beast Cup's remixes, written in seqbaby.
//
// Eight cues, The Tale of the Altered Beast, the suite that opens Murder of
// the Universe (2017): each track an Altered Beast run straight into the
// Alter Me after it, as the band play them, as one piece. Each is a lap cut
// and a faster final-lap cut (+8 bpm, busier drums, the hook up front):
//
//   altered-beast-i-remix(-final-lap)     "A New World", "Altered Beast I", "Alter Me I"
//   altered-beast-ii-remix(-final-lap)    "Altered Beast II", "Alter Me II"
//   altered-beast-iii-remix(-final-lap)   "Altered Beast III", "Alter Me III"
//   altered-beast-iv-remix(-final-lap)    "Altered Beast IV" (and its Alter Me reprise)
//
// Transcribed from the band's own live recordings, the pairs the game streams
// for Track song (public/music/bootlegs.json), each pair played back to back
// at one show: Altered Beast I and Alter Me I from Rockin' in Melbourne '25
// (the soundboard), Altered Beast II and Alter Me II from the same show,
// Altered Beast III and Alter Me III from the Fillmore, San Francisco,
// 2017-10-12 (an audience tape: none of the pairs the game streams for the
// third is a soundboard), and Altered Beast IV from Live at Field of Vision
// II '26 (the soundboard). No tab could be reached, so it is the recordings
// alone. No audio from the recordings goes in: these are notes. The album is
// the band's heaviest: thrash riffs on one note with the half-step above it,
// Leah Senior narrating over them, flute and organ. So the remixes are a real
// drummer's kit (salamander), a pick bass, the riffs as power chords on a
// scooped metal guitar, the vocal lines on a flute (the whistling Moog lead),
// the organ on the chords, the narration and the chants ("altered beast,
// alter me") taking turns on one voice (seqbaby's vox, an alto, half breath,
// the narration on a monotone), and a chip arp on top through an 8-bit
// crusher, the chip lead's line taking its place where a section has one; A
// New World's eerie synth is a string pad holding the drone. They are kept
// light on the browser's audio thread, which has to play every part in real
// time to render it (see lite() below). Each remix is the songs' highlights
// in their own order, sections of four bars handing on with a fill and a
// crash, so the loop has no seam; A New World is two bars of drone and
// narration before Altered Beast I (one in the final lap), and Altered Beast
// II and IV get an intro of the same kind. The vocal lines are written over
// the measured chords in the singer's register (pyin could not hold a voice
// in these mixes); the chants and the narration are the songs' own words.
//
// How the recordings were measured: tempo from the onset autocorrelation
// (the pulse and the bar, so the odd meters show as the lag of a whole bar:
// nine eighths in Altered Beast II, eleven sixteenths in IV), the beats from
// percussive onsets (librosa), in the odd meters a steady pulse fitted to the
// onsets window by window, the bar line from where the kick lands, the key
// from chroma (Krumhansl), each bar's chord and three strongest pitch classes
// from chroma on the harmonic stem, the bass and riff lines per step from the
// strongest constant-Q bin of the harmonic stem in E1-E3 and E3-E5 and from
// chroma folded onto the bar in a low and a mid band over a section's bars,
// and the drum accents from band-limited onsets folded onto the bar.
//
// Two of these change meter mid-loop (Altered Beast II's 9/8 into Alter Me
// II's 4/4, Altered Beast IV's 11/16 into its 4/4 reprise), so they are put
// together by `composeMixed` below: the score helpers' compose with a meter
// per section (seqbaby keeps a meter per pattern). The loop length is given
// in bars of the first section's meter.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { kit, oct, rep, scoreOf, section, tile4, verbBus, words } from './polygondwanaland-cup-songs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEQBABY_DIR = path.resolve(process.env.SEQBABY_DIR || path.join(HERE, '../../mjoslyn/seqbaby'));
const sb = await import(pathToFileURL(path.join(SEQBABY_DIR, 'public/js/songBuilder.js')).href);

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
/** A note name `semis` up, as MIDI. */
function up(name, semis) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]] + semis;
}
/** A power chord on every hit: the root's fifth stacked on it (`roots` cycle over the hits). Two
 *  strings, not three: the scooped guitar fills it out, and each string costs the browser's audio thread. */
const power = (s, roots) => {
  const n = String(roots).trim().split(/\s+/);
  return { s, n, stack: n.map((r) => [up(r, 7)]) };
};
/** A part with only the hits that fall where `mask` (a bar's steps, repeating) has one, their notes kept with them. */
function thin(p, mask) {
  const tok = tokens(p.s);
  const m = tokens(mask);
  const s = [];
  const n = [];
  const stack = [];
  const notes = words(p.n);
  let h = 0;
  tok.forEach((c, k) => {
    if (!isHit(c)) { s.push(c === '_' && s.length && s[s.length - 1] === '.' ? '.' : c); return; }
    if (isHit(m[k % m.length])) { s.push(c); n.push(notes[h % notes.length]); if (p.stack) stack.push(p.stack[h % p.stack.length]); } else s.push('.');
    h++;
  });
  return { s: s.join(''), n, ...(p.stack ? { stack } : {}) };
}
/** A line a voice sings: one word of `text` a hit (seqbaby's vox sings a lyric one syllable a note). */
const say = (s, n, text) => ({ s, n, text });
/** A line without its power-chord stack, for the chip lead to double. */
const bare = (p) => (p ? { s: p.s, n: p.n } : null);
/** Steps per bar of a meter. */
const spbOf = (meter) => { const [n, d] = meter.split('/').map(Number); return (n * 16) / d; };
const beatsOf = (meter) => { const [n, d] = meter.split('/').map(Number); return (n * 4) / d; };
const tokens = (s) => String(s).replace(/[\s|]/g, '').split('');
const isHit = (c) => !'._-'.includes(c);

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

/** A real drummer's kit (salamander), with the ride. */
const drums = () => kit('salamander', { pieces: ['kick', 'snare', 'hihat', 'openhat', 'crash', 'tom1', 'tom2', 'ride'], vol: { hihat: 0.72, ride: 0.55, crash: 0.62 } });
/** A pick bass, ducking under the kick. */
const bass = (vol = 0.85) => ({ name: 'bass', engine: 'dm:bass', preset: 'pick grind', params: { vol }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } });
/** The riff as power chords on a scooped metal guitar. */
const guitar = (vol = 0.4) => ({ name: 'guitar', engine: 'dm:guitar', preset: 'scooped metal', params: { vol }, out: 'verb' });
/** The vocal lines on a flute: the whistling Moog lead. */
const flute = (vol = 0.36) => ({ name: 'lead', engine: 'dm:ladder', preset: 'whistle', params: { vol }, out: 'verb' });
/** The organ on the chords (section() voices each bar's measured tones on the `pad` track). */
const organ = (vol = 0.26) => ({ name: 'pad', engine: 'dm:hexop', preset: 'organ', params: { vol }, out: 'verb', fx: { phaser: { wet: 0.3, rate: 0.3, depth: 0.5 } } });
/** A New World's eerie synth: a string pad holding the drone. */
const drone = (vol = 0.34) => ({ name: 'drone', engine: 'dm:oracle', preset: 'strings', params: { vol }, out: 'verb' });
/**
 * The voice: Leah Senior's narration on a monotone and the chants ("altered
 * beast, alter me"), taking turns on one vox (its lines are `narrator` and
 * `choir` parts, merged by lite() below): an alto, half breath.
 */
const voice = (vol = 0.6) => ({ name: 'voice', engine: 'dm:vox', preset: 'whisper', out: 'verb', params: { vol, timb: 0.35, morph: 0.6, harm: 0.5, sngvoices: 1 } });
/** The video game on top: a Moog voice (cheap on the audio thread, unlike a pulse) into the chip bus. */
const chip = (vol = 0.24) => ({ name: 'chip arp', engine: 'dm:ladder', preset: 'percussive', params: { vol }, out: 'chips' });
/** The 8-bit crusher on a bus of its own (a crusher on a track cost the audio thread as much as a
 *  voice of the band), and an echo (no room: a reverb is costly too). */
const chipBus = () => ({ name: 'chips', engine: 'bus', fx: { crush: { bits: 6, rate: 1, wet: 0.55 }, delay: { sync: true, div: 0.75, fbk: 0.3, wet: 0.2 } } });
/** Every remix's band. */
const band = () => [...drums(), bass(), guitar(), flute(), organ(), drone(), voice(), chip(), chipBus()];

// Grooves in 4/4.
const ROCK = (final) => final
  ? { kick: 'X.x...x.X.x...x.', snare: '....X.......X..o', hat: 'x.xxx.xxx.xxx.xx', 'open hat': '..x.......x.....' }
  : { kick: 'X.....x.X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' };
// Thrash: the kick on every eighth under the backbeat (the recordings' kick lands on the eighths).
const CHUG = (final) => final
  ? { kick: 'X.x.X.x.X.x.X.x.', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx', 'open hat': '..x...x...x...x.' }
  : { kick: 'X.x.X.x.X.x.X.x.', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' };
// The Alter Me stomp: the kick on three, three and two eighths (the chant's accents).
const STOMP = (final) => final
  ? { kick: 'X.....X.....X.x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', 'tom lo': '..........x...x.', 'open hat': '......x.....x...' }
  : { kick: 'X.....X.....X...', snare: '....X.......X...', hat: 'x...x...x...x...', 'tom lo': '..........x.....' };
const HALF = (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', ride: final ? 'x.x.x.x.x.x.x.x.' : 'x...x...x...x...' });
const DOOM = (final) => final
  ? { kick: 'X.......X.x.....', snare: '........X.......', ride: 'x.x.x.x.x.x.x.x.', 'tom lo': '..............xx' }
  : { kick: 'X.......X.......', snare: '........X.......', 'open hat': 'x...x...x...x...' };
const FILL16 = { kick: 'X.......X.......', snare: '....X...x.x.rrRR', hat: 'x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' };

// ---------------------------------------------------------------------------
// Putting a remix together
// ---------------------------------------------------------------------------

/** A free intro of `bars` bars of 4/4 (A New World and the like): the parts as given, drums only in a fill at the end. */
function intro(bars, parts) {
  const rest = '.'.repeat(16);
  const kitParts = {};
  const half = { kick: '........X.......', snare: '........x.x.rrRR', 'tom hi': '........x.......', 'tom lo': '..........x.x...' };
  for (const [k, v] of Object.entries(half)) kitParts[k] = rep(rest, bars - 1) + (bars > 1 ? ' ' : '') + v;
  return { name: 'intro', bars, meter: '4/4', parts: { ...kitParts, ...parts } };
}

/** section() for a meter with an odd number of steps a bar: the chip arp's run made to fit the bar. */
function fitArp(sec, spb) {
  if (spb % 2 && sec.parts['chip arp']) sec.parts['chip arp'] = { ...sec.parts['chip arp'], s: rep('x.'.repeat((spb - 1) / 2) + 'x', sec.bars) };
  return sec;
}

/** Two sung lines that take turns in a section (the narration, then the chant) as one line, notes and words in order. */
function merge(a, b, steps) {
  if (!a || !b) return a ?? b;
  const lay = (p) => {
    const tok = tokens(p.s);
    const full = Array.from({ length: steps }, (_, k) => tok[k % tok.length]);
    const n = words(p.n);
    const w = p.text.trim().split(/\s+/);
    let h = 0;
    return full.map((c) => (isHit(c) ? { c, n: n[h % n.length], w: w[h++ % w.length] } : { c }));
  };
  const A = lay(a);
  const B = lay(b);
  const s = [];
  const n = [];
  const w = [];
  for (let k = 0; k < steps; k++) {
    const x = isHit(A[k].c) ? A[k] : isHit(B[k].c) ? B[k] : null;
    if (isHit(A[k].c) && isHit(B[k].c)) throw new Error(`two lines sung at once at step ${k}`);
    if (x) { s.push(x.c); n.push(x.n); w.push(x.w); } else s.push(A[k].c === '_' || B[k].c === '_' ? '_' : '.');
  }
  return { s: s.join(''), n, text: w.join(' ') };
}

/**
 * Lighter on the browser's audio thread, which renders every part in real
 * time: one voice (the narration and the chants take turns on it), one chip
 * track (the chip lead's line taking the arp's place where a section has
 * one, the arp in eighths, not sixteenths), and the organ holding two of the
 * bar's three measured tones.
 */
function lite(sec, meter) {
  const p = { ...sec.parts };
  if (p.choir || p.narrator) p.voice = merge(p.narrator, p.choir, sec.bars * spbOf(sec.meter ?? meter));
  delete p.choir;
  delete p.narrator;
  if (p['chip lead']) p['chip arp'] = p['chip lead'];
  else if (p['chip arp']) p['chip arp'] = { ...p['chip arp'], s: p['chip arp'].s.replace(/o/g, '.') };
  delete p['chip lead'];
  if (p.pad?.stack) p.pad = { ...p.pad, stack: p.pad.stack.map((x) => x.slice(0, 1)) };
  return { ...sec, parts: p };
}

/** Each vox track's lyric, the words of its parts in playing order (one word a hit), checked against its hits. */
function lyrics(tracks, sections, meter) {
  return tracks.map((t) => {
    if (t.engine !== 'dm:vox') return t;
    const all = [];
    for (const sec of sections) {
      const p = sec.parts[t.name];
      if (!p) continue;
      if (!p.text) throw new Error(`${sec.name}/${t.name}: a voice part without words`);
      const steps = sec.bars * spbOf(sec.meter ?? meter);
      const tok = tokens(p.s);
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
 * compose() from the score helpers, with a meter per section: `sec.meter`
 * where a section has one, else the song's. Everything else as there.
 */
function composeMixed({ bpm, meter = '4/4', mix = 1, tracks, sections }) {
  const RATCHET = { r: ['x', 2], R: ['X', 3], q: ['x', 4] };
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
    if (t.engine !== 'bus') song.tracks[i].params.vol = Math.round(Math.min(1, (song.tracks[i].params.vol ?? 0.8) * mix) * 1000) / 1000;
  }

  let slot = 0;
  const repeats = [];
  for (const sec of sections) {
    const m = sec.meter ?? meter;
    const spb = spbOf(m);
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
      for (let k = 0; k < full.length; k++) if (full[k] === '_' && (k === 0 || full[k - 1] === '.' || full[k - 1] === '-')) full[k] = '.';
      const hits = full.filter((c) => c !== '.' && c !== '-' && c !== '_').length;
      const cyc = (list) => (list ? Array.from({ length: hits }, (_, k) => list[k % list.length]) : null);
      parts[name] = { part, full, notes: cyc(part.n && words(part.n)), chords: cyc(part.c && words(part.c)), stack: cyc(part.stack) };
    }
    for (let c = 0; c < sec.bars / chunkBars; c++) {
      sb.setMeter(song, slot, m);
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
      }
      repeats[slot] = chunkBars;
      slot++;
    }
  }
  sb.setArrangement(song, { mode: 'chain', repeats, active: 0 });
  const v = sb.validate(song);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return song;
}

/** The lap and final-lap cues of one remix; `bars` counts bars of the first section's meter. */
function cue(title, id, song) {
  return [false, true].map((final) => {
    const raw = scoreOf(song, final);
    const score = { ...raw, sections: raw.sections.map((sec) => lite(sec, raw.meter)) };
    const first = score.sections[0].meter ?? score.meter;
    const beats = score.sections.reduce((n, s) => n + s.bars * beatsOf(s.meter ?? score.meter), 0);
    const bars = beats / beatsOf(first);
    if (!Number.isInteger(bars)) throw new Error(`${id}: ${beats} beats are not whole bars of ${first}`);
    const tracks = lyrics(score.tracks, score.sections, score.meter);
    return {
      title: final ? `${title} (remix, final lap)` : `${title} (remix)`,
      cue: final ? `${id}-final-lap` : id,
      bars,
      build: () => composeMixed({ ...score, tracks }),
    };
  });
}

// ---------------------------------------------------------------------------
// 1. Altered Beast I (remix): A New World, the beast by the tree, Alter Me I.
//
// Measured (Rockin' in Melbourne '25, the soundboard: Altered Beast I 207 s,
// then Alter Me I 64 s): 103.4 bpm in 4/4, a bar 2.32 s, the eighths as loud
// as the beats (the onset autocorrelation's eighth peak is the strongest: the
// riff chugs eighths, the kick with it). Alter Me I is the same tempo (102.2)
// and key, accented three, three and two eighths. Key: A, on an A pedal with
// the half-step and tritone colours of the album (A#, D#, G#, G); the break
// moves to D-F-G, a dream passage to A major with F#7, a stomp D-F-F#-G.
// Section map (the phrases taken, in the song's order):
//   intro      0-12 s    A New World: the A drone with D and F, Gm (A# D F#)
//   riff      13-27 s    A5 | D5, the bass on A with D#-D, the lick A-A#-D-E
//   verse     27-65 s    A on the pedal, G#, G, A# and G# in turn, "I think I see"
//   break     67-76 s    G5 | G5 | Dm | A, D-F-G, "I met an altered beast!"
//   dream     88-98 s    F#7 | F#7 | A | A7, "in a dream you can wake"
//   gsec     132-146 s   G7 on D-F-F#-G, "with an unsteady gait"
//   alter    Alter Me I  the A pedal, the bass A-G-A, "altered beast, alter me"
// Lap 103.4 bpm, final lap 111.4. The kit (the kick on the eighths in the
// riffs, the stomp in Alter Me), the pick bass, the riffs on the scooped
// guitar, the verse and dream lines on the flute, the organ, a string drone
// for A New World, the voice (Leah's lines in A New World, the gait and Alter
// Me, "I met an altered beast" and "altered beast, alter me"), the chip arp.
// ---------------------------------------------------------------------------

const AB1_T = {
  riff: { bars: 2, chords: ['A5', 'D5'], tones: ['A E D', 'A A# D'],
    bass: { s: 'x.xxx.xxx.xxx.xx x..x...x...x..x.', n: 'A1 A1 A1 A1 A1 A1 A1 A1 A1 A1 D#2 D2 A1 A1 A#1 D2 E2' },
    riff: power('X.xxx.xxX.xxx.xx X..x...x...x..x.', 'A2 A2 A2 A2 A2 A2 A2 A2 A2 A2 D#3 D3 A2 A2 A#2 D3 E3') },
  verse: { bars: 4, chords: ['A5', 'A5', 'A5', 'A7'], tones: ['A E G#', 'A E G', 'A E A#', 'A G# E'],
    bass: { s: rep('x.xxx.xxx.x.xxx.', 4), n: 'A1 A1 A2 A1 A1 G2 A1 A1 A2 A1 G#1 A1 A1 A2 A1 A1 G2 A1 A1 A2 A1 G1 A1 A1 A2 A1 A1 G2 A1 A1 A2 A#1 A#1 A1 A1 A2 A1 A1 G2 A1 G1 G#1 A1 E2' },
    riff: power(rep('X.x.x.x.X.x.x.xx', 4), 'A2 A2 A2 A2 A2 A2 A2 G#2 A2 A2 A2 A2 A2 A2 A2 A2 G2 A2 A2 A2 A2 A2 A2 A2 A2 A#2 A2 A2 A2 A2 A2 A2 A2 G2 E2 G2'),
    lead: { s: '..x.x.x.X___.... ..x.x.x.x.X___.. ....x.x.X___.... ..x.x.x.x.x.x.X_', n: 'E5 E5 G5 A5 A5 G5 E5 G5 A5 A#5 A5 E5 E5 G5 A5 G5 E5 D5 E5' } },
  break: { bars: 4, chords: ['G5', 'G5', 'Dm', 'A'], tones: ['D D# G', 'D F G', 'D F A', 'E C# C'],
    bass: { s: rep('X_x.X_x.x.x.x.xx', 4), n: 'G1 G1 G1 G1 G1 G1 G1 F1 F#1 G1 G1 G1 G1 F1 G1 D2 F2 G2 D2 D2 D2 D2 D2 D2 F2 G2 G#2 A1 A1 A1 A1 C#2 C2 A1 G1 G#1' },
    riff: power(rep('X_x.X_x.x.x.x.xx', 4), 'G2 G2 G2 G2 G2 G2 G2 F2 F#2 G2 G2 G2 G2 F2 G2 D3 F3 G3 D3 D3 D3 D3 D3 D3 F3 G3 G#3 A2 A2 A2 A2 C#3 C3 A2 G2 G#2'),
    lead: { s: '..x.x.x.x.x.X___ ................ ................ ................', n: 'D5 F5 G5 F5 D5 G5' },
    chant: say('................ ................ ..x.x.x.x.x.X___ ................', 'D3 F3 G3 F3 D3 E3', 'ai met an al terd beest') },
  dream: { bars: 4, chords: ['F#7', 'F#7', 'A', 'A7'], tones: ['E F# C#', 'E F B', 'E C# B', 'C# E D'],
    bass: { s: rep('X_______x___x___', 4), n: 'F#1 F#1 E2 F#1 F#1 F2 A1 A1 B1 A1 A1 D2' },
    riff: power('X_______________ X_______________ X_______________ X_______x_x_x_x_', 'F#2 F#2 A2 A2 A2 B2 C#3 D3'),
    lead: { s: 'x.x.x.x.x.x.X___ x.x.x.x.x.x.X___ x.x.x.x.x.x.X___ x.x.x.x.X_______', n: 'C#5 C#5 B4 A4 F#4 E4 F#4 A4 A4 B4 A4 F4 E4 F4 C#5 C#5 B4 A4 E4 C#5 B4 A4 B4 C#5 D5 E5' } },
  gsec: { bars: 4, chords: ['G7', 'G7', 'G7', 'D7'], tones: ['D F G', 'D G F', 'D F F#', 'F# G F'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'D2 D2 F2 F#2 G2 G2 F2 D2 D2 D2 F2 F#2 G2 G2 F2 D2 D2 D2 F2 F#2 G2 G2 F2 D2 F#2 F#2 G2 G2 F2 F2 E2 D#2' },
    riff: power(rep('X.x.x.x.X.x.x.x.', 4), 'D3 D3 F3 F#3 G3 G3 F3 D3 D3 D3 F3 F#3 G3 G3 F3 D3 D3 D3 F3 F#3 G3 G3 F3 D3 F#3 F#3 G3 G3 F3 F3 E3 D#3'),
    narr: say('..x.x.x.x.x.x.x. x.x.x.X_________ ................ ................', 'G3 G3 G3 A3 G3 G3 F3 G3 G3 G3 D3', 'with an un stead ee gayt the krit er moovs forth') },
  alter: { bars: 4, chords: ['A5', 'A5', 'A5', 'A5'], tones: ['A E G#', 'A E G', 'A A# E', 'A E G#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'A1 G2 A2 G2 A2 A2 A2 G#1 A1 G2 A2 G2 A2 A2 A2 G1 A1 G2 A2 G2 A2 A2 A#1 A#1 A1 G2 A2 G2 A2 G#1 G1 G#1' },
    riff: power(rep('X_____X_____X___', 4), 'A2 A2 A2 A2 A2 A2 A#2 A#2 A2 A2 G#2 G2'),
    chant: say(rep('X_x_X___________', 4), 'A3 A3 E4 A3 G3 A3', 'al terd beest al ter mee'),
    chant2: say('................ ................ X_x_X___________ X_x_X___________', 'A3 A3 E4 A3 G3 A3', 'al terd beest al ter mee'),
    narr: say('..x.x.x.x.x.x.x. x.x.x.X_________ ................ ................', 'A3 A3 A3 C4 A3 A3 A3 G3 A3 A3 E3', 'for all its re vul shun and warp and ta boo') },
};

const ALTERED_BEAST_I = {
  meter: '4/4', spb: 16, rot: 0, bpm: 103.4, finalPlus: 8, mix: 0.79,
  tracks: [...band(), verbBus(2.6, 0.3, 0.18)],
  grooves: { groove: ROCK, chug: CHUG, stomp: STOMP, half: HALF },
  fill: FILL16,
  order: ['intro', 'riff', 'verse', 'break', 'verse2', 'dream', 'gsec', 'alter', 'alter2'],
  finalOrder: ['intro', 'verse', 'break', 'riff', 'gsec', 'verse2', 'break2', 'alter', 'alter2'],
  sections(final) {
    const T = AB1_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    // A New World: the drone, Leah's first line over it, and the burst of guitars into the riff.
    const world = final
      ? intro(1, {
        drone: { s: 'X_______________', n: 'A2', stack: [[up('E3', 0), up('A#3', 0)]] },
        narrator: say('..x.x.x.........', 'A3 A3 C4', 'a noo werld'),
        guitar: power('........X_______', 'A2'), bass: { s: '........X_______', n: 'A1' },
      })
      : intro(2, {
        drone: { s: 'X_______________ X_______________', n: 'A2 A#2', stack: [[up('E3', 0), up('G3', 0)], [up('D3', 0), up('F#3', 0)]] },
        narrator: say('..x.x.x.x.x.x.x. x.x.x.x.x.......', 'A3 A3 A3 C4 A3 A3 G3 A3 A3 A3 G3 E3', 'a noo werld in playss of wair the old wun had bin'),
        guitar: power('................ ........X_______', 'A2'), bass: { s: '................ ........X_______', n: 'A1' },
      });
    return {
      intro: world,
      riff: s('riff', { drums: 'chug', use: { lead: null }, extra: final ? { 'chip lead': up1('riff', 'riff') } : {} }),
      verse: s('verse'),
      verse2: s('verse', { extra: { 'chip lead': oct(T.verse.lead, 0) } }),
      break: s('break', { drums: 'chug', extra: { choir: T.break.chant } }),
      break2: s('break', { drums: 'chug', extra: { choir: T.break.chant, 'chip lead': up1('break', 'riff') } }),
      dream: s('dream', { drums: 'half', extra: { drone: { s: rep('X_______________', 4), n: 'F#2 F#2 A2 A2' } } }),
      gsec: s('gsec', { drums: 'chug', use: { lead: null }, extra: { narrator: T.gsec.narr } }),
      alter: s('alter', { drums: 'stomp', use: { lead: null }, extra: { choir: T.alter.chant2, narrator: T.alter.narr } }),
      alter2: s('alter', { drums: 'stomp', use: { lead: null }, extra: { choir: T.alter.chant, 'chip lead': oct(T.alter.chant, 2) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Altered Beast II (remix): the foe, in nine.
//
// Measured (Rockin' in Melbourne '25, the soundboard: Altered Beast II 255 s,
// then Alter Me II 111 s): the riff in 9/8 grouped 2+2+2+3 (the kick on the
// first eighth of each group, the snare on the second group and the three),
// an eighth of 0.141 s (the bar's lag, 1.267 s, is nine of them), so
// quarter = 213 bpm; the "I see you" passage in the same nine at half speed
// (a bar of 2.63 s, nine eighths of 0.293 s). Alter Me II is 4/4 at 103.0,
// half of that pulse, on the A pedal like Alter Me I. Key: E, the guitar on
// E against the bass on D (D the commonest bass note at every step of the
// riff, over 39 bars; D and E equally strong in the whole recording) with
// D# and F, a B phrygian stretch (B with C), the vocal passage on A7 with
// the G#. Section map:
//   intro      0-10 s    the quiet E (E D A), "and now dear listener"
//   riff      10-60 s    E over D, the bass E-D-D-D#-D#-D-D-F-D, the guitar E with D
//   foe       61-71 s    B7 | E7 | B7 | D7, B with C and A#
//   seeyou    72-104 s   A7 in half time, "I see you, I want to"
//   bridge   104-113 s   F#7 | C7 | E | A, "I am an altered beast!"
//   quiet    114-133 s   the E drone, quiet
//   alter    Alter Me II A with G# and A#, "altered beast, alter me"
// Lap 212 bpm (the 9/8 bar 1.27 s; Alter Me II in 4/4 at half speed, 106),
// final lap 222. The kit in nine (2+2+2+3, the half-time passage on the
// kick and snare a song's bar), the pick bass, the riffs on the scooped
// guitar, the organ, the E drone on the strings in the intro and the quiet,
// the voice (Leah's lines, "I see you, I want to", "I am an altered beast",
// "altered beast, alter me"), the chip arp.
// ---------------------------------------------------------------------------

// The guitar on the groups' first eighths and the three's: the bass keeps every eighth.
const NINE_GTR = 'X...X...X...X.x.x.';
const AB2_T = {
  riff: { bars: 2, chords: ['E7', 'E7'], tones: ['E D D#', 'E D D#'],
    bass: { s: 'x.x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.x.', n: 'E2 D2 D2 D#2 D#2 D2 D2 F2 D2 E2 D2 D2 D2 C#2 D2 D#2 D#2 D2' },
    riff: thin(power('X.x.X.x.X.x.X.x.x. X.x.X.x.X.x.X.x.x.', 'E2 D3 E2 D3 E2 D3 F#2 D3 F2 E2 D3 E2 D3 E2 C#3 E2 D3 D#3'), NINE_GTR) },
  foe: { bars: 4, chords: ['B7', 'E7', 'B7', 'D7'], tones: ['B C A#', 'B D A#', 'B C F#', 'D B A'],
    bass: { s: rep('x.x.x.x.x.x.x.x.x.', 4), n: 'B1 B1 C2 B1 B1 C2 A#1 B1 C2 B1 B1 D2 B1 A#1 B1 D2 C#2 C2 B1 B1 C2 B1 B1 C2 F#2 F2 E2 D2 D2 B1 A1 D2 B1 A1 A#1 B1' },
    riff: thin(power(rep('X.x.X.x.X.x.X.x.x.', 4), 'B2 B2 C3 B2 B2 C3 A#2 B2 C3 B2 B2 D3 B2 A#2 B2 D3 C#3 C3 B2 B2 C3 B2 B2 C3 F#2 F2 E2 D3 D3 B2 A2 D3 B2 A2 A#2 B2'), NINE_GTR),
    narr: say('x.x.x.x.x.x.x.x.x. x.x.X_____________ .................. ..................', 'B3 B3 B3 C4 B3 B3 B3 A#3 B3 B3 C4 B3', 'ai am the dee mun bair ing miz er ee and feer') },
  // Half time: a bar of the song is two bars here, its eighths four steps.
  seeyou: { bars: 4, chords: ['A7', 'A7', 'A7', 'A7'], tones: ['A G G#', 'A G D', 'A G# G', 'G A E'],
    bass: { s: rep('x...x...x...x...x...x...x...x...x...', 2), n: 'A1 A1 G2 A1 A1 G#1 A1 A2 G1 A1 A1 G2 A1 A1 D2 E2 G2 G#2' },
    riff: power(rep('X_______X_______X_______X___________', 2), 'A2 A2 G2 A2 A2 A2 D3 E3'),
    chant: say(rep('x...x...X_______....x...x...X_______', 2), 'A3 A3 E3 A3 A3 G3 A3 A3 E3 G3 G#3 A3', 'ai see yoo ai want too brayk yor hed krus tee bred'),
    chant2: say(rep('x...x...X_______....x...x...X_______', 2), 'A3 A3 E3 A3 A3 G3 A3 A3 E3 G3 G#3 A3', 'ai see yoo ai want too seez yor brayn in my hed') },
  quiet: { bars: 4, chords: ['E7', 'E7', 'A5', 'E7'], tones: ['E D A', 'E D F#', 'E A D', 'E D B'],
    bass: { s: rep('X_________________', 4), n: 'E1 E1 A1 E1' },
    narr: say('..x.x.x.x.x.x.x.x. x.x.X_____________ .................. ..................', 'E3 E3 E3 G3 E3 E3 E3 D3 E3 E3 B2', 'too mee yoo ar gaym just a sweet bit of meet') },
  bridge: { bars: 4, chords: ['F#7', 'C7', 'E', 'A'], tones: ['F# G E', 'B C F#', 'E B A#', 'E A C#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.x.', 4), n: 'F#1 F#1 G1 F#1 E1 F#1 G1 F#1 E1 C2 C2 B1 C2 C2 B1 F#1 B1 C2 E1 E1 E2 E1 A#1 E1 B1 E1 E2 A1 A1 C#2 E2 A1 A1 C#2 E2 E2' },
    riff: thin(power(rep('X.x.X.x.X.x.X.x.x.', 4), 'F#2 F#2 G2 F#2 E2 F#2 G2 F#2 E2 C3 C3 B2 C3 C3 B2 F#2 B2 C3 E2 E2 E3 E2 A#2 E2 B2 E2 E3 A2 A2 C#3 E3 A2 A2 C#3 E3 E3'), NINE_GTR),
    chant: say('.................. .................. x.x.x.x.x.X_______ ..................', 'E3 E3 E3 G#3 A3 E3', 'ai am an al terd beest') },
  // Alter Me II, at half the pulse: a bar of it is two bars of 4/4 here.
  alter: { bars: 4, chords: ['A5', 'A5', 'A5', 'A5'], tones: ['A E G#', 'A E G#', 'A A# E', 'A A# E'],
    bass: { s: rep('x...x...x...x...x...x...x...x...', 2), n: 'A1 G2 A2 G2 A2 A2 A2 G#1 A1 G2 A2 G2 A2 A2 A#1 A#1' },
    riff: power(rep('X___________X___________X_______', 2), 'A2 A2 A2 A2 A#2 G#2'),
    chant: say(rep('X___x___X_______________________', 2), 'A3 A3 E4 A3 G3 A3', 'al terd beest al ter mee'),
    chant2: say('................................ X___x___X_______X___x___X_______', 'A3 A3 E4 A3 G3 A3', 'al terd beest al ter mee'),
    narr: say('..x.x.x.x.x.x.x. x.x.x.X_________ ................ ................', 'A3 A3 A3 C4 A3 A3 A3 G3 A3 A3 E3', 'yor dum hyoo mun hed iz ful of nye eev tay') },
};

const NINE = {
  groove: (final) => final
    ? { kick: 'X.x.x...X.x.X.x...', snare: '....X.....X...o.X.', hat: 'xxxxxxxxxxxxxxxxxx', 'open hat': '..x...x...x...x...' }
    : { kick: 'X...x...X...X.....', snare: '....X.....X.....X.', hat: 'x.x.x.x.x.x.x.x.x.' },
  // The half-time passage: a kick and snare a song's bar, the hat on its eighths.
  back: (final) => final
    ? { kick: 'X.......x...x.....', snare: '........X.......o.', hat: 'x.x.x.x.x.x.x.x.x.' }
    : { kick: 'X...........x.....', snare: '........X.........', hat: 'x...x...x...x.....' },
  half: (final) => ({ kick: 'X.......X.........', snare: final ? '........X.........' : '', ride: 'x...x...x...x.....' }),
};
const FILL18 = { kick: 'X...X...X...X.....', snare: '....x...x.x.x.rrRR', hat: 'x.x.x.x.x.........', 'open hat': '', ride: '', 'tom hi': '........x.x.......', 'tom lo': '............x.x...' };
// Alter Me at half the pulse: sixteen steps here are two of its beats.
const ALTER_HALF = (final) => final
  ? { kick: 'X.......x.......', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.', 'open hat': '....x.......x...' }
  : { kick: 'X...............', snare: '........X.......', hat: 'x...x...x...x...' };

const ALTERED_BEAST_II = {
  meter: '9/8', spb: 18, rot: 0, bpm: 212, finalPlus: 10, mix: 0.8,
  tracks: [...band(), verbBus(2.4, 0.3, 0.16)],
  grooves: NINE,
  fill: FILL18,
  order: ['intro', 'riff', 'riff2', 'foe', 'seeyou', 'seeyou2', 'quiet', 'riff3', 'bridge', 'alter', 'alter2'],
  finalOrder: ['intro', 'riff', 'seeyou', 'foe', 'riff2', 'seeyou2', 'bridge', 'riff3', 'riff4', 'alter', 'alter2'],
  sections(final) {
    const T = AB2_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    // Alter Me II's sections in 4/4.
    const four = { ...this, spb: 16, grooves: { groove: ALTER_HALF }, fill: FILL16 };
    const s4 = (k, o = {}) => ({ ...section(four, { name: k, ...T[k] }, { final, ...o }), meter: '4/4' });
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      intro: intro(2, {
        drone: { s: 'X_______________ X_______________', n: 'E2 E2', stack: [[up('B2', 0), up('D3', 0)], [up('A2', 0), up('D3', 0)]] },
        narrator: say('..x.x.x.x.x.x.x. x.x.X___........', 'E3 E3 E3 G3 E3 E3 E3 D3 E3 B2', 'and now deer lis ner we kross to the foe'),
      }),
      riff: s('riff'),
      riff2: s('riff', { extra: { 'chip lead': up1('riff', 'riff') } }),
      riff3: s('riff', { extra: final ? { 'chip lead': up1('riff', 'riff') } : {} }),
      riff4: s('riff', { extra: { 'chip lead': oct(bare(tile4(this, T.riff, 'bass')), 2) } }),
      foe: s('foe', { extra: { narrator: T.foe.narr } }),
      seeyou: s('seeyou', { drums: 'back', extra: { choir: T.seeyou.chant } }),
      seeyou2: s('seeyou', { drums: 'back', extra: { choir: T.seeyou.chant2, 'chip lead': oct(bare(T.seeyou.chant), 2) } }),
      quiet: s('quiet', { drums: 'half', use: { guitar: null }, extra: { narrator: T.quiet.narr, drone: { s: rep('X_________________', 4), n: 'E2 E2 A2 E2' } } }),
      bridge: s('bridge', { extra: { choir: T.bridge.chant } }),
      alter: s4('alter', { extra: { choir: T.alter.chant2, narrator: T.alter.narr } }),
      alter2: s4('alter', { extra: { choir: T.alter.chant, 'chip lead': oct(bare(T.alter.chant), 2) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Altered Beast III (remix): the change, and the doom.
//
// Measured (the Fillmore, San Francisco, 2017-10-12, an audience recording:
// Altered Beast III 162 s, then Alter Me III 55 s): 104.3 bpm in 4/4, a bar
// 2.30 s, eighths steady through it; Alter Me III 102.3 in 4/4. Key: A, the
// verse on A7 then E with F over it (the half-step again, E phrygian), C7 and
// Dm-G for "and he said"; the doom section (the band's "doom metal" part) in
// half time on F and E with the B (the bass F-F-F-F-F-E-E-E, measured a
// sixteenth at a time); Alter Me III back on A with C#, F and F#. Section
// map:
//   intro      0-10 s    A5 | A5 | Dm | G5, the A with A#
//   verse     19-28 s    A | A7 | A7 | A7, "I know I see an altered beast"
//   versb     28-37 s    A7 | E7 | E7 | C, E against F
//   said      46-55 s    Dm | Dm | G7 | G5, "and he said: I see you"
//   teeth     92-100 s   A5 | A7 | F#7 | A5, "nine white teeth"
//   doom     107-130 s   E5 | G7 | E5 | F5 in half time, "nine pearl fangs"
//   outro    131-140 s   A7 with F | A | A, "I am an altered beast!"
//   alter    Alter Me III A7 with C#, F, F#, "altered beast, alter me"
// Lap 104.3 bpm, final lap 112.3. The kit (half time in the doom, the open
// hat on the beat), the pick bass, the riffs on the scooped guitar, the
// verse lines on the flute, the organ, the voice (Stu's "I see you", "nine
// pearl fangs", "I am an altered beast", Leah's line in Alter Me III,
// "altered beast, alter me"), the chip arp.
// ---------------------------------------------------------------------------

const AB3_T = {
  intro: { bars: 4, chords: ['A5', 'A5', 'Dm', 'G5'], tones: ['A E A#', 'A A# E', 'A D E', 'D G C'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'A1 A1 A1 A#1 A1 A1 A1 A#1 A1 A1 A1 A#1 A1 A1 A1 A#1 D2 D2 D2 E2 D2 D2 D2 E2 G1 G1 G1 C2 G1 G1 A1 A#1' },
    riff: power(rep('X.......x.x.x...', 4), 'A2 A2 A#2 A2 A2 A2 A#2 A2 D3 D3 E3 D3 G2 G2 A2 A#2') },
  verse: { bars: 4, chords: ['A', 'A7', 'A7', 'A7'], tones: ['E D C#', 'E A G', 'A E F', 'A E D'],
    bass: { s: rep('x.xxx.x.x.xxx.x.', 4), n: 'A1 A1 A2 A1 C#2 A1 A1 A2 A1 E2 A1 A1 A2 A1 G2 A1 A1 A2 A1 G1 A1 A1 A2 A1 F2 A1 A1 A2 A1 F1 A1 A1 A2 A1 D2 A1 A1 A2 E2 F2' },
    riff: power(rep('X.x.x.x.X.x.x.x.', 4), 'A2 A2 A2 A2 A2 A2 C#3 A2 A2 A2 A2 A2 A2 A2 G2 A2 A2 A2 A2 A2 A2 A2 F2 E2 A2 A2 A2 A2 A2 A2 D3 E3'),
    lead: { s: '..x.x.x.X___.... ..x.x.x.x.X___.. ....x.x.X___.... ..x.x.x.x.X_____', n: 'E5 E5 G5 A5 A5 G5 E5 F5 E5 F5 E5 D5 C#5 D5 E5 F5 E5' } },
  versb: { bars: 4, chords: ['A7', 'E7', 'E7', 'C'], tones: ['E F A', 'E F D#', 'E F D#', 'E F C'],
    bass: { s: rep('x.xxx.x.x.xxx.x.', 4), n: 'A1 A1 A2 A1 F2 A1 A1 A2 A1 E2 E1 E1 E2 E1 F1 E1 E1 E2 D#2 E2 E1 E1 E2 E1 F1 E1 E1 E2 F2 E2 C2 C2 C3 C2 A#1 C2 C2 C3 F2 E2' },
    riff: power(rep('X.x.x.x.X.x.x.x.', 4), 'A2 A2 A2 A2 A2 A2 F2 A2 E2 E2 E2 E2 E2 E2 F2 E2 E2 E2 E2 E2 E2 F2 D#2 E2 C3 C3 C3 C3 C3 C3 F2 E2'),
    lead: { s: '..x.x.x.x.x.X___ ....x.x.X_______ ..x.x.x.x.x.X___ ................', n: 'E5 F5 E5 D#5 E5 F5 E5 F5 A5 F5 E5 D#5 E5 F5 E5' } },
  said: { bars: 4, chords: ['Dm', 'Dm', 'G7', 'G5'], tones: ['D E F', 'D G F', 'D F G', 'D G A'],
    bass: { s: rep('X_x.X_x.x.x.x.xx', 4), n: 'D2 D2 D2 D2 D2 D2 D2 E2 F2 D2 D2 D2 D2 G1 D2 F2 E2 D2 G1 G1 G1 G1 G1 G1 F1 G1 D2 G1 G1 G1 G1 A1 G1 A1 A#1 B1' },
    riff: power(rep('X_x.X_x.x.x.x.xx', 4), 'D3 D3 D3 D3 D3 D3 D3 E3 F3 D3 D3 D3 D3 G2 D3 F3 E3 D3 G2 G2 G2 G2 G2 G2 F2 G2 D3 G2 G2 G2 G2 A2 G2 A2 A#2 B2'),
    lead: { s: '..x.x.X_________ ................ ................ ................', n: 'D5 F5 G5' },
    chant: say('................ x.x.X___x.x.x.x. x.X_______...... ................', 'D3 F3 D3 D3 F3 G3 F3 D3 D3', 'ai see yoo and ai kan see ryt throo') },
  teeth: { bars: 4, chords: ['A5', 'A7', 'F#7', 'A5'], tones: ['A E G', 'A E F', 'A# A E', 'A E F'],
    bass: { s: rep('x.xxx.xxx.x.xxx.', 4), n: 'A1 A1 A2 A1 A1 G2 A1 A1 A2 A1 G1 A1 A1 A2 A1 A1 F2 A1 A1 A2 A1 F1 A#1 A#1 A#2 A#1 A#1 A2 A#1 A#1 A#2 A1 E2 A1 A1 A2 A1 A1 F2 A1 A1 E2 F2 E2' },
    riff: power(rep('X.x.x.x.X.x.x.xx', 4), 'A2 A2 A2 A2 A2 A2 A2 G2 A2 A2 A2 A2 A2 A2 A2 A2 F2 A2 A#2 A#2 A#2 A#2 A#2 A#2 A#2 A2 A#2 A2 A2 A2 A2 A2 A2 F2 E2 F2'),
    lead: { s: '..x.x.X_____.... ..x.x.x.X_______ ..x.x.X_____.... ..x.x.x.X_______', n: 'A5 G5 E5 A5 G5 F5 E5 A5 G5 E5 F5 E5 D5 E5' } },
  // In half time: the bass held F for five sixteenths, E for three.
  doom: { bars: 4, chords: ['E5', 'G7', 'E5', 'F5'], tones: ['E F F#', 'F E G', 'E F B', 'F E F#'],
    bass: { s: rep('X____X__X____X__', 4), n: 'F1 E1 F1 E1 F1 E1 G1 F1 E1 F1 E1 B1 F1 E1 F#1 F1' },
    riff: power(rep('X____X__X____X__', 4), 'F2 E2 F2 E2 F2 E2 G2 F2 E2 F2 E2 B2 F2 E2 F#2 F2'),
    chant: say('X___x___X___x___ X___x___X_______ X___x___X_______ ................', 'E3 F3 E3 B2 E3 F3 G3 F3 E3 E3', 'nyn perl fangz a troo syn that yor de formd') },
  outro: { bars: 4, chords: ['A7', 'A7', 'A7', 'A'], tones: ['F E A', 'E F A', 'E D C#', 'E A D'],
    bass: { s: rep('x.xxx.xxx.x.xxx.', 4), n: 'A1 A1 A2 A1 A1 F2 A1 A1 A2 A1 F1 A1 A1 A2 A1 A1 F2 A1 A1 A2 A1 E2 A1 A1 A2 A1 A1 C#2 A1 A1 A2 A1 D2 A1 A1 A2 A1 A1 E2 A1 A1 D2 C#2 C2' },
    riff: power(rep('X.x.x.x.X.x.x.xx', 4), 'A2 A2 A2 A2 A2 A2 A2 F2 A2 A2 A2 A2 A2 A2 A2 A2 F2 E2 A2 A2 A2 A2 A2 A2 C#3 D3 E3 A2 A2 A2 A2 A2 A2 G2 G#2 A2'),
    lead: { s: '..x.x.X___x.x.x. x.X_____........ ................ ................', n: 'E5 F5 E5 E5 F5 A5 F5 E5' },
    chant: say('................ ................ x.x.x.x.x.X_____ ________________', 'E3 E3 E3 A3 G3 A3', 'ai am an al terd beest') },
  alter: { bars: 4, chords: ['A7', 'A7', 'A7', 'A7'], tones: ['A E C#', 'A C# F', 'A F F#', 'A D C#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'A1 A1 C#2 A1 E2 A1 C#2 A1 A1 A1 C#2 A1 F2 A1 C#2 A1 A1 A1 F2 A1 F#2 A1 F2 A1 A1 A1 D2 A1 C#2 A1 C2 G1' },
    riff: power(rep('X_____X_____X___', 4), 'A2 A2 A2 A2 A2 F2 A2 A2 F#2 A2 A2 G2'),
    chant: say(rep('X_x_X___________', 4), 'A3 A3 E4 A3 C#4 A3', 'al terd beest al ter mee'),
    chant2: say('................ ................ X_x_X___________ X_x_X___________', 'A3 A3 E4 A3 C#4 A3', 'al terd beest al ter mee'),
    narr: say('..x.x.x.x.x.x.x. x.x.x.x.x.x..... ................ ................', 'A3 A3 A3 C#4 A3 A3 A3 A3 G3 A3 A3 A3 E3', 'the beest dee en ay haz dug in too yor noo klee us') },
};

const ALTERED_BEAST_III = {
  meter: '4/4', spb: 16, rot: 0, bpm: 104.3, finalPlus: 8, mix: 0.75,
  tracks: [...band(), verbBus(2.8, 0.32, 0.18)],
  grooves: { groove: ROCK, chug: CHUG, stomp: STOMP, half: HALF, doom: DOOM },
  fill: FILL16,
  order: ['intro', 'verse', 'versb', 'said', 'teeth', 'doom', 'outro', 'alter', 'alter2'],
  finalOrder: ['said', 'verse', 'versb', 'doom', 'teeth2', 'outro', 'said2', 'alter', 'alter2'],
  sections(final) {
    const T = AB3_T;
    const s = (k, o = {}) => section(this, { name: k, ...T[k] }, { final, ...o });
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      intro: s('intro', { drums: 'half', extra: { drone: { s: rep('X_______________', 4), n: 'A2 A2 D2 G2' } } }),
      verse: s('verse'),
      versb: s('versb', { drums: 'chug' }),
      said: s('said', { drums: 'chug', extra: { choir: T.said.chant } }),
      said2: s('said', { drums: 'chug', extra: { choir: T.said.chant, 'chip lead': up1('said', 'riff') } }),
      teeth: s('teeth'),
      teeth2: s('teeth', { extra: { 'chip lead': oct(T.teeth.lead, 0) } }),
      doom: s('doom', { drums: 'doom', extra: { choir: T.doom.chant } }),
      outro: s('outro', { drums: 'chug', extra: { choir: T.outro.chant } }),
      alter: s('alter', { drums: 'stomp', extra: { choir: T.alter.chant2, narrator: T.alter.narr } }),
      alter2: s('alter', { drums: 'stomp', extra: { choir: T.alter.chant, 'chip lead': oct(bare(T.alter.chant), 2) } }),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Altered Beast IV (remix): the cup's finale, in eleven.
//
// Measured (Live at Field of Vision II '26, the soundboard, 349 s): the riff
// in 11/16, a sixteenth of 0.138 s (the bar's lag, 1.517 s, is eleven of
// them and twelve is no peak), so quarter = 108.6 bpm; the bass A-A-C-C-A#-A#
// | A-A-C-C-A# (six and five sixteenths), the riff's pairs on A, C and A#,
// measured a sixteenth at a time; the chorus a little slower (a sixteenth of
// 0.143 s) on the same shape a fourth up, D#-D#-D-D-F | D#-D#-D-D-F-E; the
// "I don't feel heinous" mantra quiet on E with G and F#; the Alter Me reprise
// in 4/4 at 101 bpm on A with G# and G; the end in A major. Key: A, minor and
// phrygian (the A# in every bar of the riff), D phrygian in the chorus.
// Section map:
//   intro      0-17 s    quiet: A, A# and B
//   riff      18-80 s    the 11/16 riff, Leah: "you don't feel a thing"
//   chorus    81-92 s    D with D# and F, "I'm completely satisfied"
//   never     93-118 s   A with G# and A#, then E: "Never!"
//   heinous  110-160 s   E with G and F#, "I don't feel heinous, I don't feel no pain"
//   alter    270-308 s   the reprise, 4/4: A with G# and G, "altered beast, alter me"
//   inside   315-345 s   A | E | F | A, "I think I see an altered beast inside me"
// Lap 108.6 bpm, final lap 116.6. The kit in eleven (the kick on 1 and 7,
// the snare on 4 and 10), the reprise and the end in 4/4, the pick bass, the
// riffs on the scooped guitar, the chorus line on the flute, the organ, the
// voice (Leah's verses over the riff, "Never!", the heinous mantra, "altered
// beast, alter me", "I think I see an altered beast inside me"), the chip arp.
// ---------------------------------------------------------------------------

const AB4_T = {
  riff: { bars: 1, chords: ['A5'], tones: ['A A# C'],
    bass: { s: 'Xxxxxxxxxxx', n: 'A1 A1 C2 C2 A#1 A#1 A1 A1 C2 C2 A#1' },
    riff: power('X.x.x.X.x.x', 'A2 C3 A#2 A2 C3 A#2'),
    narr: say('x.x.x.x.x.x x.x.x.x.x__ ........... ...........', 'A3 A3 A3 C4 A3 A3 A3 A#3 A3 A3 G3', 'yoo dont feel a thing in yor sin yoo us hed'),
    narr2: say('x.x.x.x.x.x x.x.x______ ........... ...........', 'A3 A3 A3 C4 A3 A3 A#3 A3 G3', 'no luv no payn and no feer of dred'),
    narr3: say('x.x.x.x.x.x x.x.x.x.x.x x.......... ...........', 'A3 A3 A3 C4 A3 A3 A3 A#3 A3 A3 G3 A3 E3', 'yor ap a thet ik dis pash un haz mayd yoo dis tort') },
  chorus: { bars: 2, chords: ['Dm', 'Dm'], tones: ['D D# F', 'D F D#'],
    bass: { s: 'Xxxxxxxxxxx Xxxxxxxxxxx', n: 'D#2 D#2 D2 D2 F2 D#2 D#2 D2 D2 F2 E2 D#2 D#2 D2 D2 F2 E2 D#2 D2 D2 F2 E2' },
    riff: power('X.x.xX.x.x. X.x.xX.x.xx', 'D#2 D2 F2 D#2 D2 F2 D#2 D2 F2 E2 D2 F2 E2'),
    lead: { s: 'x.x.x.x.x.x x.X________', n: 'F5 F5 D5 F5 G#5 F5 D#5 D5 F5 F5 D5 F5 A5 G#5 F5 D5' } },
  never: { bars: 2, chords: ['A5', 'E5'], tones: ['A G# A#', 'E B A#'],
    bass: { s: 'Xxxxxxxxxxx X__________', n: 'A1 A1 G#1 G#1 A#1 A#1 A1 A1 G#1 G#1 A#1 E1' },
    riff: power('X.x.x.X.x.x X__________', 'A2 G#2 A#2 A2 G#2 A#2 E2'),
    lead: { s: 'x.x.x.x.x.x ...........', n: 'E5 D#5 E5 F5 E5 D#5' },
    chant: say('........... X___x______', 'E3 B2', 'nev er') },
  heinous: { bars: 4, chords: ['E5', 'F#5', 'E5', 'F5'], tones: ['E G F#', 'F# G A#', 'E B A#', 'F F# G'],
    bass: { s: rep('X__________', 4), n: 'E1 F#1 E1 F1' },
    riff: power(rep('X__________', 4), 'E2 F#2 E2 F2'),
    // The mantra runs across the bar lines: seven words a bar, the line's own seven syllables a few at a time.
    chant: say(rep('x.xx.x.x.xx', 4), 'E3 E3 G3 F#3 E3 D3 E3', 'ai dont feel hay nus ai dont feel no payn ai dont feel nuh thing ai dont feel en ee thing ai dont feel hay nus ai dont') },
  alter: { bars: 4, chords: ['A7', 'A7', 'A7', 'A7'], tones: ['A G# G', 'A G# G', 'A A# G#', 'A G# B'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'A1 G2 A2 G2 A2 A2 A2 G#1 A1 G2 A2 G2 A2 A2 A2 G1 A1 G2 A2 G2 A2 A2 A#1 A#1 A1 G2 A2 G2 A2 G#1 B1 G#1' },
    riff: power(rep('X_____X_____X___', 4), 'A2 A2 A2 A2 A2 A2 A#2 A#2 A2 A2 G#2 G2'),
    chant: say(rep('X_x_X___________', 4), 'A3 A3 E4 A3 G3 A3', 'al terd beest al ter mee') },
  inside: { bars: 4, chords: ['A', 'E', 'F', 'A'], tones: ['A C# E', 'E G# A', 'F G G#', 'A C# E'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 4), n: 'A1 A1 A2 A1 C#2 A1 E2 A1 E1 E1 E2 E1 G#1 E1 B1 E1 F1 F1 F2 F1 G1 G1 G2 G#1 A1 A1 A2 A1 C#2 E2 A2 G#1' },
    riff: power(rep('X.......X.......', 4), 'A2 A2 E2 E2 F2 G2 A2 A2'),
    lead: { s: '................ ................ x.x.x.x.x.X_____ ________________', n: 'C5 C5 A4 F4 G4 A4' },
    chant: say('x.x.x.x.x.x.X___ x.x.x.X_________ ................ ................', 'A3 A3 A3 C#4 E4 E4 C#4 E4 E4 G#3 A3', 'ai think ai see an al terd beest in syd mee') },
};

const ELEVEN = {
  groove: (final) => final
    ? { kick: 'X.x.x.X.x.x', snare: '...X..o..X.', hat: 'xxxxxxxxxxx', 'open hat': '......x....' }
    : { kick: 'X.x...X.x..', snare: '...X.....X.', hat: 'x.x.x.x.x.x' },
  half: (final) => final
    ? { kick: 'X.....x....', snare: '......X....', ride: 'x.xx.xx.xx.' }
    : { kick: 'X..........', ride: 'x..x..x..x.' },
};
const FILL11 = { kick: 'X.....X....', snare: '...x..x.rRR', hat: 'x.x.x......', 'open hat': '', ride: '', 'tom hi': '......x.x..', 'tom lo': '........x.x' };

const ALTERED_BEAST_IV = {
  meter: '11/16', spb: 11, rot: 0, bpm: 108.6, finalPlus: 8, mix: 0.77,
  tracks: [...band(), verbBus(2.6, 0.3, 0.18)],
  grooves: ELEVEN,
  fill: FILL11,
  order: ['intro', 'riff', 'riff2', 'chorus', 'never', 'heinous', 'riff3', 'riff4', 'chorus2', 'alter', 'inside'],
  finalOrder: ['intro', 'chorus', 'riff', 'never', 'riff2', 'heinous2', 'chorus2', 'riff3', 'never2', 'alter', 'inside'],
  sections(final) {
    const T = AB4_T;
    const s = (k, o = {}) => fitArp(section(this, { name: k, ...T[k] }, { final, ...o }), 11);
    const four = { ...this, spb: 16, grooves: { groove: STOMP, rock: ROCK }, fill: FILL16 };
    const s4 = (k, o = {}) => ({ ...section(four, { name: k, ...T[k] }, { final, ...o }), meter: '4/4' });
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      intro: intro(1, {
        drone: { s: 'X_______________', n: 'A2', stack: [[up('A#2', 0), up('B2', 0)]] },
        guitar: { s: 'x.x.x.x.........', n: 'A3 A#3 B3 A#3' },
      }),
      riff: s('riff', { use: { lead: null }, extra: { narrator: T.riff.narr } }),
      riff2: s('riff', { use: { lead: null }, extra: { narrator: T.riff.narr2, ...(final ? { 'chip lead': up1('riff', 'riff') } : {}) } }),
      riff3: s('riff', { use: { lead: null }, extra: { narrator: T.riff.narr3, ...(final ? { 'chip lead': up1('riff', 'riff') } : {}) } }),
      riff4: s('riff', { use: { lead: null }, extra: { 'chip lead': oct(bare(tile4(this, T.riff, 'bass')), 3) } }),
      chorus: s('chorus', { extra: final ? { 'chip lead': oct(T.chorus.lead, 0) } : {} }),
      chorus2: s('chorus', { extra: { 'chip lead': oct(T.chorus.lead, 0) } }),
      never: s('never', { extra: { choir: T.never.chant } }),
      never2: s('never', { extra: { choir: T.never.chant, 'chip lead': up1('never', 'riff') } }),
      heinous: s('heinous', { drums: 'half', use: { guitar: null }, extra: { choir: T.heinous.chant, drone: { s: rep('X__________', 4), n: 'E2 F#2 E2 F2' } } }),
      heinous2: s('heinous', { extra: { 'chip lead': oct(bare(T.heinous.chant), 2) } }),
      alter: s4('alter', { extra: { choir: T.alter.chant } }),
      inside: s4('inside', { drums: 'rock', extra: { choir: T.inside.chant } }),
    };
  },
};

export const SONGS = [
  ...cue('altered beast i', 'altered-beast-i-remix', ALTERED_BEAST_I),
  ...cue('altered beast ii', 'altered-beast-ii-remix', ALTERED_BEAST_II),
  ...cue('altered beast iii', 'altered-beast-iii-remix', ALTERED_BEAST_III),
  ...cue('altered beast iv', 'altered-beast-iv-remix', ALTERED_BEAST_IV),
];
