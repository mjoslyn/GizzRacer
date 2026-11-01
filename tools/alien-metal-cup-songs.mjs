// The Alien Metal Cup's remixes, written in seqbaby.
//
// Eight cues, the four songs from Alien Metal (2026) the cup races to, each a
// lap cut and a faster final-lap cut (+8 bpm, busier drums, the hook up
// front):
//
//   alien-metal-remix(-final-lap)          "Alien Metal"
//   kill-for-the-steel-remix(-final-lap)   "Kill for the Steel"
//   level-5-remix(-final-lap)              "Level 5"
//   rapid-alpha-decay-remix(-final-lap)    "Rapid Alpha Decay"
//
// Transcribed from the band's own live recordings, the ones the game streams
// for Track song (public/music/bootlegs.json): Alien Metal and Kill for the
// Steel from Live at Field of Vision II '26, the 15 August soundboard (played
// back to back, Alien Metal running into Kill for the Steel), Level 5 and
// Rapid Alpha Decay from the 14 August soundboard of the same festival (back
// to back too). The album is new and has no tab, so it is the recordings
// alone. No audio from the recordings goes in: these are notes. The album is
// the band's EDM record, jammed on modular synths "with one tempo and key
// throughout", and the recordings keep to it: all four run on one clock,
// 143.000 bpm (the same to a hundredth of a beat in every one of them), and
// in one key, F# with its half-steps either side (the G of F# phrygian
// against the F, the E and the G# under it: the cluster every groove of the
// record grinds on). So the four remixes are at one tempo and in one key,
// and the cup plays as one set, Rapid Alpha Decay's last section handing on
// to Alien Metal's first as the album loops back on itself. Synths after the
// album: a siege kick tuned to F#, an FM clap, sampled hats, an acid bass
// (silverbox) on the band's bass lines and a sub under it pumping on the
// kick, the modular sequences on a percussive Moog, a Moog lead, a pad on
// each bar's measured tones, a chip arp through an 8-bit crusher for the
// video game, and the vocal hooks ("water, fire... clouds and ice", "we will
// kill for the steel", "we're on level five", "keeper of the energy") and the
// other lines, a section each, on one robot choir (seqbaby's vox, two
// voices). Each remix is the song's highlights in the song's own order,
// eight sections of four bars, every section handing to the next with a fill
// and a crash so the loop has no seam. They are written light for the
// browser's audio thread, which renders every part in real time (see lite()
// below), as the Altered Beast Cup's are.
//
// How the recordings were measured: the tempo from the percussive onsets
// folded on every candidate beat period in 0.02 ms steps over two minutes of
// a steady groove (the sharpest fold: 0.41958 s, 143.000 bpm, in all four);
// the beat phase from the kick band's onsets folded on that period, the bar
// line from the clap's backbeat; the key from chroma (Krumhansl, the tuning
// pinned to 0); per section each step's strongest constant-Q note of the
// harmonic stem in E1-E3 (the bass) and the three strongest in E3-E6 (the
// sequences and the chords), and the kick, clap and hat onsets, folded onto
// the bar over the section's bars. The vocal lines are written over the
// measured tones in the singer's register (the voices sit under the synths
// in these mixes); the words are the songs' own.
//
// Exports SONGS in the shape tools/render-soundtrack.mjs reads from
// seqbaby-seed's people.mjs, like tools/polygondwanaland-cup-songs.mjs, whose
// score helpers it uses.

import { compose, oct, rep, scoreOf, section, tile4, verbBus, words } from './polygondwanaland-cup-songs.mjs';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const tokens = (s) => String(s).replace(/[\s|]/g, '').split('');
const isHit = (c) => !'._-'.includes(c);
const REST = '.'.repeat(16);
/** A line the voice sings: one word of `text` a hit (seqbaby's vox sings a lyric one syllable a note). */
const say = (s, n, text) => ({ s, n, text });
/** A two-bar sung line sung once in a four-bar section, the last two bars resting. */
const once = (p) => (p ? { ...p, s: `${p.s} ${REST} ${REST}` } : null);
/** A line without its words, for the chip to double. */
const bare = (p) => (p ? { s: p.s, n: p.n } : null);
/** The sub's note for a pitch class: F#1 up to F2, under the acid bass. */
const subNote = (pc) => 30 + ((NOTE[pc] - 6 + 12) % 12);

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

/** The band every remix here plays; `o` names a song's presets. */
const band = ({ kick = 'techno', pad = 'warm pad', lead = 'vibrato lead', mix = {} } = {}) => [
  // A siege kick tuned to the key, an FM clap, sampled hats, crash and toms.
  { name: 'kick', engine: 'dm:siege', preset: kick, params: { vol: mix.kick ?? 0.8 }, note: 'F#1' },
  { name: 'snare', engine: 'dm:lancet', preset: 'fm clap', params: { vol: 0.6, decay: 0.3, lncrtimbre: 0.1, lncrlevel: 0.15 } },
  { name: 'hat', engine: 'sampler', sample: 'salamander/hihat', drum: true, params: { vol: 0.7 } },
  { name: 'open hat', engine: 'sampler', sample: 'salamander/openhat', drum: true, params: { vol: 0.4 } },
  { name: 'crash', engine: 'sampler', sample: 'salamander/crash', drum: true, params: { vol: 0.48 } },
  { name: 'tom hi', engine: 'sampler', sample: 'salamander/tom1', drum: true, params: { vol: 0.58 } },
  { name: 'tom lo', engine: 'sampler', sample: 'salamander/tom2', drum: true, params: { vol: 0.62 } },
  // The acid bass on the band's bass lines, and the sub under it, both ducking under the kick.
  { name: 'bass', engine: 'dm:silverbox', params: { vol: mix.bass ?? 0.72, harm: 0.42, timb: 0.62, morph: 0.6, decay: 0.35, sbaccent: 0.8 }, comp: { source: 'kick', threshold: -28, ratio: 4, release: 0.12 } },
  { name: 'sub', engine: 'dm:sub', preset: 'house sub', params: { vol: mix.sub ?? 0.26 }, comp: { source: 'kick', threshold: -30, ratio: 6, release: 0.16 } },
  // The modular sequences on a percussive Moog, the lead on a Moog too (cheap on the audio thread).
  { name: 'seq', engine: 'dm:ladder', preset: 'percussive', params: { vol: mix.seq ?? 0.44 }, out: 'verb' },
  { name: 'lead', engine: 'dm:ladder', preset: lead, params: { vol: mix.lead ?? 0.42 }, out: 'verb', fx: { chorus: { wet: 0.2 } } },
  { name: 'pad', engine: 'dm:oracle', preset: pad, params: { vol: mix.pad ?? 0.32 }, out: 'verb' },
  // The vocals on one robot choir, two voices (a voice is the dearest part on the audio thread).
  { name: 'voice', engine: 'dm:vox', preset: 'robot choir', out: 'verb', params: { vol: mix.voice ?? 0.66, sngvoices: 2 } },
  // The video game on top: a Moog voice into an 8-bit crusher on a bus of its own.
  { name: 'chip arp', engine: 'dm:ladder', preset: 'percussive', params: { vol: mix.chip ?? 0.26 }, out: 'chips' },
  { name: 'chips', engine: 'bus', fx: { crush: { bits: 6, rate: 1, wet: 0.55 }, delay: { sync: true, div: 0.75, fbk: 0.3, wet: 0.2 } } },
];

// Four on the floor: the final lap busier.
const TECHNO = (final) => final
  ? { kick: 'X...X...X...X...', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
  : { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', 'open hat': '..x...x...x...x.' };
const HALF = (final) => ({ kick: 'X.......X.......', snare: final ? '....X.......X...' : '........X.......', hat: '..x...x...x...x.' });
const FILL = { kick: 'X...X...X.X.X.X.', snare: '....X...x.x.xxXX', hat: 'x.x.x.x.........', 'open hat': '', 'tom hi': '........x.x.....', 'tom lo': '............x.x.' };

// ---------------------------------------------------------------------------
// Putting a remix together
// ---------------------------------------------------------------------------

/**
 * Lighter on the browser's audio thread, which renders every part in real
 * time: one chip track (the chip lead's line taking the arp's place where a
 * section has one, the arp in eighths, not sixteenths), and the pad holding
 * two of the bar's three measured tones.
 */
function lite(sec) {
  const p = { ...sec.parts };
  for (const k of Object.keys(p)) if (p[k] == null) delete p[k];
  if (p['chip lead']) p['chip arp'] = p['chip lead'];
  else if (p['chip arp']) p['chip arp'] = { ...p['chip arp'], s: p['chip arp'].s.replace(/o/g, '.') };
  delete p['chip lead'];
  if (p.pad?.stack) p.pad = { ...p.pad, stack: p.pad.stack.map((x) => x.slice(0, 1)) };
  return { ...sec, parts: p };
}

/** The voice's lyric, the words of its parts in playing order (one word a hit), checked against its hits. */
function lyrics(tracks, sections) {
  return tracks.map((t) => {
    if (t.engine !== 'dm:vox') return t;
    const all = [];
    for (const sec of sections) {
      const p = sec.parts[t.name];
      if (!p) continue;
      if (!p.text) throw new Error(`${sec.name}/${t.name}: a voice part without words`);
      const steps = sec.bars * 16;
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
 * One section of a remix: section() from the score helpers with the riff on
 * the sequencer, the sub on each bar's root (the phrase's `root`, else its
 * strongest tone), and the phrase's chant sung once.
 */
function sec(song, T, k, final, o = {}) {
  const ph = T[k];
  const roots = words(ph.root ?? ph.tones.map((t) => words(t)[0]).join(' '));
  const sub = { s: rep('X' + '_'.repeat(15), 4), n: Array.from({ length: 4 }, (_, i) => subNote(roots[i % roots.length])) };
  return section(song, { name: k, ...ph }, {
    final,
    drums: o.drums,
    use: { guitar: null, seq: 'riff', ...(o.use ?? {}) },
    extra: { sub, voice: once(ph.chant), ...(o.extra ?? {}) },
  });
}

/** The lap and final-lap cues of one remix. */
function cue(title, id, song) {
  return [false, true].map((final) => {
    const raw = scoreOf(song, final);
    // The final lap's own level where it has one (scoreOf's is the lap's, a little down).
    const score = { ...raw, mix: final ? song.finalMix ?? raw.mix : raw.mix, sections: raw.sections.map(lite) };
    const tracks = lyrics(score.tracks, score.sections);
    return {
      title: final ? `${title} (remix, final lap)` : `${title} (remix)`,
      cue: final ? `${id}-final-lap` : id,
      bars: score.sections.reduce((n, s) => n + s.bars, 0),
      build: () => compose({ ...score, tracks }),
    };
  });
}

// ---------------------------------------------------------------------------
// 1. Alien Metal (remix): the astral blacksmith's forge among the stars.
//
// Measured (Live at Field of Vision II '26, 15 August, the soundboard, 790 s,
// the music from 36 s): 143.000 bpm in 4/4, a bar 1.68 s. Key: F#, the G
// above it and the F and E below it in nearly every bar (F#, G, F, E the
// four strongest pitch classes of the long grooves), F# minor in the
// opening (A and C#). Section map (the phrases taken, in the song's order):
//   stars     36-60 s    the C# pedal, A, E and G#, the bass wandering C#-D-D#-E, "fall asleep under the stars"
//   breeze    60-115 s   F#, the acid trilling F#-F a sixteenth apart, A and E over it, "summer breeze"
//   water    120-185 s   the sequence G#-G-F#-C# a beat, F# with F and G#, "water, fire... clouds and ice"
//   slip     190-245 s   F# with A# and A, the bass F#-G-F#-F#-D#, "transforming through the slipstream"
//   reborn   250-305 s   the A drone over D# (D# F# A), the bass falling D#-B-A#-G#, "rebirth, reborn"
//   groove   310-450 s   the long F# groove, the bass G-G-F#-F#-F#-F#-F#-E, the chant again
//   smith    450-510 s   D, the bass D-C#-D-F# a beat, the kick on one and three, "astral blacksmith"
//   secret   560-610 s   quiet: F# and C# high, the bass C# against G, "I can keep it a secret"
// Lap 143 bpm, final lap 151. The band above; half time in the reborn,
// smith and secret sections; the chip lead doubles the chant in the final
// lap and the repeats.
// ---------------------------------------------------------------------------

const AM_T = {
  stars: { bars: 2, chords: ['C#m', 'F#m/C#'], tones: ['C# G# E', 'A C# F#'], root: 'C# C#',
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'C#2 C#3 C#3 D#2 D2 C#2 D2 C#2 D#2 E2 D#2 B1 C#2 C#3 D#2 C#3' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G#3 E4 G#3 E4 G#3 C#4 G#3 E4 G#3 E4 G#3 C#4 A3 E4 A3 C#4 A3 F#4 A3 E4 A3 F#4 A3 C#4 G#3 E4 G#3 C#4 A3 F#4 A3 E4' },
    chant: say('..x.x.x.x.x.x.X_ ................', 'G#3 G#3 A3 G#3 E3 F#3 C#4', 'fol a sleep un der the starz') },
  breeze: { bars: 2, chords: ['F#', 'F#m'], tones: ['F# A E', 'F# A F'],
    bass: { s: rep('XxxxXxxxXxxxXxxx', 2), n: 'F#1 F#1 F1 F1 F#1 F#1 F1 F1 F#1 F#1 F#1 F1 F#1 F#1 F1 F1 F#1 F#1 F1 F1 F#1 F#1 F#1 F1 F#1 F#1 F1 F1 F#1 F#1 F1 F1' },
    riff: { s: rep('x.xxx.xxx.xxx.xx', 2), n: 'E4 A4 F#4 E4 F#4 F#4 F4 A4 A4 F4 A4 F#4 F4 A4 G#4 F#4 F4 A4 A4 E4 F4 A4 F#4 F#4' },
    chant: say('x.x.X___x.x.x.x. ..X_____........', 'A3 A3 F#3 E3 F3 F#3 A3 F#3', 'sum mer breez laysd with pee see pee') },
  water: { bars: 2, chords: ['F#', 'F#'], tones: ['F# G# F', 'F# E G#'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G#1 G1 F#1 C#3' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#4 F#4 G#4 F#4 F4 F#4 G#4 F#4 F#4 F#4 G#4 F#4 E4 F#4 G#4 F#4' },
    chant: say('x.x.X___x.x.X___ x.x.X___x.x.X___', 'F#3 F#3 G#3 F#3 F#3 G#3 F#3 F#3 G#3 C#4 C#4 F#3', 'wo ter fair wo ter fair wo ter fair klowdz and ais') },
  slip: { bars: 2, chords: ['F#', 'F#m'], tones: ['F# A# F', 'F# A E'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#2 G1 F#2 F#2 D#2 G1 F#2 F#2 A2 G1 F#2 F#2 D#2 G1 F#2 E2 F#2 G1 F#2 F#2 F#2 G1 F#2 E2 D#2 G1 D#2 F#2 D#2 G1 F#1 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#4 A#4 E4 F4 A#4 F#4 E4 A4 F#4 A4 E4 F4 A4 F#4 E4 F#4' },
    lead: { s: '................ x_x_x_x_X_______', n: 'F#4 A4 A#4 C#5 F5' },
    chant: say('x.x.x.x.x.x.X___ ................', 'F#3 A#3 A#3 A3 F#3 E3 F#3', 'trans form ing thru the slip streem') },
  reborn: { bars: 2, chords: ['D#dim', 'D#dim'], tones: ['A D# F#', 'A G# D#'], root: 'D# D#',
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#2 D#2 B1 A#1 D#2 D#3 D#2 D#3 A2 D#3 D3 D#3 F#2 D#3 D3 D#3' },
    riff: { s: rep('x...x...x...x...', 2), n: 'A3 F#4 A3 D#4 A3 G#3 A3 F#4' },
    chant: say('x.X_x.X_........ x.x.x.x.x.x.x.X_', 'A3 G#3 A3 D#4 A3 A3 G#3 F#3 A3 G#3 F#3 D#3', 'ree berth ree born in ter stel lar ree al i tee') },
  groove: { bars: 2, chords: ['F#', 'F#'], tones: ['F# G F', 'F# E G'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G2 G2 F#2 F#2 F#2 F#2 F#2 E2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#4 G4 F#4 F4 F#4 F#5 F#4 G4 F#4 E4 F#4 G4 F#4 F#5 F4 E4' },
    lead: { s: 'X_______x_x_X___ X_______x_x_X___', n: 'F#5 G5 F5 F#5 E5 F5 G5 F#5' } },
  smith: { bars: 2, chords: ['D', 'D'], tones: ['D F# A', 'D F# G'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'D2 C#2 D2 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#4 A4 F#4 G4 F#4 A4 F4 F#4 D5 B4 F#4 A4 F#4 C#5 F4 F#4' },
    chant: say('x.x.x.X_x.x.x.x. x.X_____........', 'D4 D4 F#4 F#4 A4 F#4 G4 F#4 E4 D4', 'as trel blak smith wont yoo gim mee a fiks') },
  secret: { bars: 2, chords: ['F#5', 'C#'], tones: ['F# C# G', 'C# F# G'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'C#3 C#3 G2 F#2 F#2 F#2 G2 F#2 C#3 C#3 G2 C#3 C#3 C#3 G2 D#3' },
    riff: { s: rep('x...x...x...x...', 2), n: 'F#4 C#5 F#4 F#4 C#5 F#4 F#4 F#4' },
    chant: say('x.x.x.x.x.x.x... x.x.X___........', 'C#4 C#4 F#3 F#3 G3 F#3 C#4 C#4 C#4 F#3', 'ai prom is ai kan keep it a see kret') },
};

const ALIEN_METAL = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143, finalPlus: 8, mix: 0.91, finalMix: 0.77,
  tracks: [...band({ kick: 'techno', pad: 'warm pad' }), verbBus(2.6, 0.3, 0.2)],
  grooves: { groove: TECHNO, half: HALF },
  fill: FILL,
  order: ['stars', 'breeze', 'water', 'slip', 'reborn', 'groove', 'smith', 'secret'],
  finalOrder: ['water', 'breeze', 'groove', 'smith', 'slip', 'water2', 'secret', 'groove2'],
  sections(final) {
    const T = AM_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    const chant = once(T.water.chant);
    return {
      stars: s('stars', { drums: final ? 'groove' : 'half' }),
      breeze: s('breeze'),
      water: s('water', { extra: final ? { 'chip lead': oct(bare(chant), 1) } : {} }),
      water2: s('water', { extra: { 'chip lead': up1('water', 'riff') } }),
      slip: s('slip'),
      reborn: s('reborn', { drums: 'half' }),
      groove: s('groove', { extra: { voice: chant } }),
      groove2: s('groove', { extra: { voice: chant, 'chip lead': oct(bare(chant), 1) } }),
      smith: s('smith', { drums: final ? 'groove' : 'half' }),
      secret: s('secret', { drums: 'half' }),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Kill for the Steel (remix): the open-cut mine, the rigs fighting over it.
//
// Measured (Live at Field of Vision II '26, 15 August, the soundboard, 563 s,
// straight on from Alien Metal, the music to 468 s): 143.000 bpm (142.99) in
// 4/4. Key: F#, the G above and the F and E below it again, with B as the
// chord against it (B and D# under the F#) and a G minor bar (the phrygian
// II, G-A#-D) after F# minor. Section map:
//   death      0-28 s    F#-G over B, then E-F over B, the acid jumping to B an octave up, "we don't wish death"
//   wish      28-56 s    the B pedal, D# under it, F# over, "any bad luck or any ill will"
//   groove    80-135 s   the F# pedal, G pick-ups, the sequence on G#-F#-A-G-F
//   upon     155-188 s   F#m | Gm (F#-A-C#, G-A#-D), "we don't wish death upon you"
//   steel    190-255 s   the climax: the acid writhing G-F-E-G#-G-F#, G#-A-A# over it, "we will kill for the steel"
//   quiet    330-365 s   quiet: C# and D high over the F#
//   level    405-448 s   F# major (A# and C#) with the G, "we're on level five", into Level 5
// Lap 143 bpm, final lap 151. The band above, the kick pounding (the
// off-beat sixteenth before the three, as the recording's), half time in
// the quiet.
// ---------------------------------------------------------------------------

const KFTS_T = {
  death: { bars: 2, chords: ['F#sus4', 'Esus4'], tones: ['F# G B', 'E F B'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#1 B2 B2 B2 F#2 B2 B2 B2 F#2 B2 B2 B2 F#2 F#2 E2 F2 F#2 E2 E2 F#2 E2 E2 E2 F2 E2 E2 F2 F#2 F2 B2 B2 B2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#4 G4 F#4 G4 F#4 G4 B4 G4 E4 F4 E4 F4 E4 F4 B4 F4' },
    chant: say('x.x.x.X_x.x.x.X_ x.x.x.X_x.x.X___', 'F#3 F#3 G3 F#3 F#3 F#3 G3 F#3 E3 E3 F3 E3 F#3 F3 E3', 'wee dont wish deth wee dont wish deth wee dont wish deth a pon yoo') },
  wish: { bars: 2, chords: ['B', 'B'], tones: ['F# D# F', 'F# B G'], root: 'B B',
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'B1 B2 D#2 D#3 D#2 D#3 D#2 D#3 D#2 D#3 B1 B2 B1 B2 B1 B2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#4 F4 F#4 E4 F#4 F4 E4 F#4 F#4 G4 F#4 G4 F#4 F#5 F#4 G4' },
    chant: say('x.x.x.x.x.x.X___ x.x.x.x.X_______', 'F#3 F#3 F3 E3 F#3 D#3 F#3 F#3 G3 F#3 D#3 F#3', 'wee dont wish e nee bad luk or e nee il wil') },
  groove: { bars: 2, chords: ['F#', 'F#'], tones: ['F# G# A', 'F# G G#'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G1 G1 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 F#1 F#2 G1 G2 G1 G2' },
    riff: { s: rep('x.xxx.xxx.xxx.xx', 2), n: 'G#4 F#4 F4 G4 C#5 A4 G4 F4 G4 A4 F4 G4 A4 F4 F#4 G#4 F4 G4 A4 G4 G#4 A4 G#4 G4' },
    lead: { s: 'X___x___X_x_x___ X___x___X_______', n: 'F#5 G5 G#5 A5 G#5 G5 F#5 F5' } },
  upon: { bars: 2, chords: ['F#m', 'Gm'], tones: ['F# A C#', 'G A# D'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#1 F#2 F#1 C#2 F#1 F#2 F#1 F#2 G1 G2 G1 D2 G1 G2 G#1 F#1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#4 C#4 A4 C5 C#4 F#4 A4 A4 C#4 C#4 F#4 F#4 C#4 C#5 C#4 A4 G4 D4 A#4 G4 D4 G4 A#4 A4 C#4 C#4 F#4 C#4 C#4 C#5 A4 F#4' },
    chant: say('x.x.x.X_........ x.X_X___........', 'F#3 F#3 A3 F#3 G3 A#3 A3', 'wee dont wish deth a pon yoo') },
  steel: { bars: 2, chords: ['G', 'G'], tones: ['G G# A', 'G E F'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G1 F1 E1 G#2 G2 F#1 G1 F#1 G1 F1 G#2 G#2 G1 G#2 G2 F#1 G1 F1 E1 G#2 G2 F#1 G1 F#1 G1 F1 G2 G2 G#2 G#2 G2 F1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'G#4 A#4 G4 A4 A#4 G#4 A4 E4 G#4 C#5 G4 E4 G4 G4 G#4 E4' },
    chant: say('x.x.x.X_x.x.X___ x.x.x.X_x.x.X___', 'G3 G3 G#3 A3 G3 F3 G3 G3 G3 G#3 A3 A#3 A3 G3', 'but wee wil kil for the steel but wee wil kil for the steel') },
  quiet: { bars: 2, chords: ['F#', 'F#'], tones: ['C# D F#', 'F# C# G'], root: 'F# F#',
    bass: { s: 'X___________x___ x_X_____________', n: 'F#1 G1 G1 F#1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'C#5 D5 C#5 D5 C#5 D5 C#5 G#5 C#5 G4 F#4 C#5 F#4 F#4 C#5 F#4' },
    chant: say('x.x.x.x.x.x.X___ x.x.x.x.X_______', 'C#4 C#4 D4 C#4 F#3 G3 F#3 C#4 C#4 D4 C#4 F#3', 'wee dont wish e nee bad luk or e nee il wil') },
  level: { bars: 2, chords: ['F#', 'F#'], tones: ['F# A# C#', 'F# G C#'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#1 C#2 C#2 C#2 G1 F#1 F#1 F#1 F#1 F#1 F#1 F#1 F#1 D#2 F#1 F#1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G4 F#3 F#3 F#4 G4 G4 A#4 G4 G4 G4 F#3 F#3 F#4 F#3 F#3 F#3 F#4 F#4 G4 G4 G4 F#4 F#4 G4 G4 G4 F#3 F#3 F#3 G4 G3 F#3' },
    chant: say('x.x.x.x.X___.... x.x.x.x.X___....', 'F#3 F#3 A#3 A#3 C#4 F#3 F#3 A#3 G3 F#3', 'weer on lev el faiv weer on lev el faiv') },
};

const KILL_FOR_THE_STEEL = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143, finalPlus: 8, mix: 0.9, finalMix: 0.78,
  tracks: [...band({ kick: 'hard trance', pad: 'dirty stab', lead: 'funk lead' }), verbBus(2.2, 0.28, 0.2)],
  grooves: {
    // Pounding: the kick on every beat and the off-beat sixteenth before the three.
    groove: (final) => final
      ? { kick: 'X...X..xX...X...', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
      : { kick: 'X...X..xX...X...', snare: '....X.......X...', hat: 'x.X.x.X.x.X.x.X.', 'open hat': '..x...x...x...x.' },
    half: HALF,
  },
  fill: FILL,
  order: ['death', 'wish', 'groove', 'upon', 'steel', 'quiet', 'steel2', 'level'],
  finalOrder: ['steel', 'wish', 'groove', 'upon', 'steel2', 'death', 'groove2', 'level'],
  sections(final) {
    const T = KFTS_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      death: s('death', { drums: final ? 'groove' : 'half' }),
      wish: s('wish'),
      groove: s('groove', { extra: { voice: once(T.upon.chant) } }),
      groove2: s('groove', { extra: { voice: once(T.upon.chant), 'chip lead': up1('groove', 'lead') } }),
      upon: s('upon'),
      steel: s('steel', { extra: final ? { 'chip lead': oct(bare(tile4(this, T.steel, 'chant')), 1) } : {} }),
      steel2: s('steel', { extra: { 'chip lead': oct(bare(tile4(this, T.steel, 'chant')), 1) } }),
      quiet: s('quiet', { drums: 'half' }),
      level: s('level'),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Level 5 (remix): the driverless city at the end of the world.
//
// Measured (Live at Field of Vision II '26, 14 August, the soundboard, 539 s,
// the music from 58 s): 143.000 bpm in 4/4. Key: F#, the G above it the
// strongest note after it again, with A and A# in turn (F# minor and major),
// a C# pedal, a D with G# over it (lydian), and a G major seven bar (the
// phrygian II again). Section map:
//   level      58-118 s   F# and G, the bass sliding A#-G#-G-F#, "we're on level five"
//   milk      120-148 s   the C# pedal, the sequence G#-G-D in threes, "the milk's gone bad"
//   auto      150-268 s   the loud F# pedal, A and A# over it, "we're on level five autonomy"
//   mort      290-320 s   D with A and G# over it, then D#, "mortician"
//   date      320-368 s   F# with A and G#, the bass walking F#-D-E-D#-D-C#, "got a date with the end of the world"
//   sky       370-398 s   G major seven (G B D F#), "the sky dematerialised"
//   stars     400-460 s   G, E, F#, G, the A# over them, "stars fell flat, rebellion"
//   outro     470-530 s   the F# drone, F#-G with E-F, "our faith is blind", "we're on level five"
// Lap 143 bpm, final lap 151. The band above, motorik (the hats on every
// sixteenth), half time under the sky.
// ---------------------------------------------------------------------------

const L5_T = {
  level: { bars: 2, chords: ['F#', 'F#'], tones: ['F# G G#', 'F# G A#'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'A#1 G#1 G1 G#1 G#1 G1 G1 G1 G1 F#1 G#1 G1 G1 F#1 F#1 F#1 F#1 F#1 F#1 F#1 F#1 G1 F#1 G1 G1 F#1 G#1 G1 G1 G1 G1 G1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#3 F#4 G3 F#4 F#3 F#4 G#3 F#4 F#3 F#4 G3 F#4 F#3 F#4 A#3 F#4' },
    chant: say('x.x.x.x.X___.... x.x.x.x.X___....', 'F#3 F#3 G3 G3 F#3 F#3 F#3 G#3 G3 F#3', 'weer on lev el faiv weer on lev el faiv') },
  milk: { bars: 2, chords: ['C#', 'C#'], tones: ['C# G# G', 'C# D D#'], root: 'C# C#',
    bass: { s: rep('X_x.x.x.X_x.x.x.', 2), n: 'C#2 C#2 C#3 C#2 C#2 C#2 C#3 C#2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'C#4 G#3 G3 C#4 C#4 C#4 C#4 C#4 F#4 C#4 G#3 G3 C#4 G3 D#4 D#4 D#4 G#3 G3 D4 G#3 G3 D4 G#3 G3 D4 G#3 G3 G3 G3 A#3 A#3' },
    chant: say('x.x.x.X_x.x.X___ x.x.x.x.x.x.x.X_', 'C#4 C#4 D4 C#4 G#3 G3 G#3 C#4 C#4 D4 D#4 D4 C#4 G#3 C#4', 'the milks gon bad ex pai ree drop ing laik flaiz on the wind skreen') },
  auto: { bars: 2, chords: ['F#m', 'F#'], tones: ['F# A C#', 'F# A# G#'],
    bass: { s: rep('x.xxx.xxx.xxx.xx', 2), n: 'F#1 F#2 F#1 F#1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#4 F#4 F#4 F#4 A4 F#4 F#4 A4 F#4 A4 A4 A4 A4 A4 A4 A4 F#4 C#5 F#4 C#5 A4 A#4 A#4 A4 A#4 A4 F#4 F#4 A4 G4 G4 A4' },
    lead: { s: 'X___x.x.X___x.x. X_______x.x.x.x.', n: 'C#5 A4 A#4 A4 F#4 G#4 F#4 A4 A#4 C#5 A#4' },
    chant: say('x.x.x.x.X___x.x. x.X_____........', 'F#3 F#3 A3 A3 C#4 A3 A#3 A3 F#3', 'weer on lev el faiv aw ton o mee') },
  mort: { bars: 2, chords: ['D', 'D#'], tones: ['D A G#', 'D# A G#'], root: 'D D#',
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'D2 D2 D2 D2 D2 D2 D2 D#2 D2 D2 D#2 D#2 D2 D#2 D#2 D#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'A4 G#4 A4 D5 A4 G#4 A4 D#5' },
    chant: say('x.x.x.x.x.x.x.x. x.x.X_______....', 'A3 A3 G#3 A3 A3 G#3 A3 D4 D4 D4 A3', 'mor ti shun dont mayk mee look ug lee to nait') },
  date: { bars: 2, chords: ['F#', 'D'], tones: ['F# A G#', 'D A F#'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#1 F#1 F#2 F#1 G1 F#1 G1 G2 F#1 F#1 F#2 F#1 F#1 F#2 F#1 F#2 F#2 D2 F#2 E2 D2 F#2 F#2 E2 F#2 D#2 D2 D#2 C#2 D2 G1 F#1' },
    riff: { s: rep('x.xxx.xxx.xxx.xx', 2), n: 'A4 A4 A4 A4 F#4 C#5 A4 F#4 A4 A4 F#4 F#4 A4 A4 G#4 A4 A4 A4 A4 A4 C#5 C#5 C#5 F#4' },
    chant: say('x.x.X_x.x.x.x.x. X___x.x.x.X_____', 'F#3 F#3 A3 A3 G#3 F#3 A3 A3 D4 A3 A3 F#3 D3', 'got a dayt with the end of the werld weer out of taim') },
  sky: { bars: 2, chords: ['Gmaj7', 'G'], tones: ['G B F#', 'G B D'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'B1 D2 D#2 F2 G1 G2 G1 G2 G1 G2 D2 D2 G1 G2 D2 B1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'G4 B4 D5 F#5 D5 B4 G4 B4 G4 B4 D5 B4 G4 B4 F#4 B4' },
    chant: say('x.x.X_x.x.x.x.x. x.x.X_______....', 'G3 G3 B3 B3 D4 D4 B3 B3 G3 F#3 G3', 'kon di shund the skai dee ma teer ee al aizd') },
  stars: { bars: 2, chords: ['G | E', 'F# | G'], tones: ['G B A#', 'F# A# G'],
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'G1 G2 E2 E1 E2 E1 F#1 F#2 F#1 F#2 G1 G2 G1 G2 G1 G2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G4 G4 B4 B4 F#4 A#4 F#4 A#4 A#4 A#4 A#4 F#4 F#4 F#4 F#4 F#4 F#4 F#5 F#5 F#5 F#4 F#4 G4 G4 F#4 D5 F#4 F#4 F#4 F#4 F#4 B4' },
    chant: say('X___X___X_______ x.x.x.x.x.x.X___', 'G4 F#4 A#3 F#3 G3 A#3 G3 F#3 G3 B3', 'starz fel flat re bel yun me kan ik raiz') },
  outro: { bars: 2, chords: ['F#', 'F#'], tones: ['F# G E', 'F# G F'],
    bass: { s: rep('X_______X_______', 2), n: 'F#1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'F#4 G4 F#4 G4 E4 F4 E4 F#4 F#4 G4 F#4 G4 F#4 G4 F#4 G4' },
    chant: say('x.x.x.X_________ x.x.x.x.X_______', 'F#3 G3 F#3 E3 F#3 F#3 G3 G3 F#3', 'our fayth iz blaind weer on lev el faiv') },
};

const LEVEL_5 = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143, finalPlus: 8, mix: 0.89, finalMix: 0.76,
  tracks: [...band({ kick: '909', pad: 'glass', lead: 'vibrato lead' }), verbBus(2.4, 0.28, 0.22)],
  grooves: {
    // Motorik: the hats on every sixteenth, the driverless cars' steady pulse.
    groove: (final) => final
      ? { kick: 'X...X...X...X.x.', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
      : { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x.......x.....' },
    half: HALF,
  },
  fill: FILL,
  order: ['level', 'milk', 'auto', 'mort', 'date', 'sky', 'stars', 'outro'],
  finalOrder: ['auto', 'level', 'mort', 'date', 'auto2', 'sky', 'stars', 'outro'],
  sections(final) {
    const T = L5_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      level: s('level', { drums: final ? 'groove' : 'half' }),
      milk: s('milk'),
      auto: s('auto', { extra: final ? { 'chip lead': up1('auto', 'lead') } : {} }),
      auto2: s('auto', { extra: { 'chip lead': up1('auto', 'riff') } }),
      mort: s('mort'),
      date: s('date'),
      sky: s('sky', { drums: 'half' }),
      stars: s('stars', { extra: { 'chip lead': up1('stars', 'riff') } }),
      outro: s('outro'),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Rapid Alpha Decay (remix): the reactor's core, the keeper of the energy.
//
// Measured (Live at Field of Vision II '26, 14 August, the soundboard, 739 s,
// straight on from Level 5, the music to 645 s): 143.000 bpm in 4/4. Key: F#,
// with E, G# and G the strongest after it (F# mixolydian and phrygian at
// once), B major and E over B in the second section, A over E and F# in the
// keeper's, F#7 (A# and E) at the climax. Section map:
//   walls      0-58 s    the F# drone, D#-E-B high over it, "climb the walls"
//   flame     60-105 s   the B pedal (A and D# under it), E and G# over, "burning in a rapid flame"
//   decay    110-135 s   the bass trilling D-D#-D-C#, F#-F and C# high, "rapid alpha decay"
//   lead     140-258 s   the acid G#-E-G-G-F#-G-F#-F#, E and B over it, "pump my body full with lead"
//   keeper   290-395 s   the bass E-E-E-F#, A and C# over it, "I love the keeper of the energy"
//   energy   488-508 s   the F# pedal falling to E, A and G# held, "energy and heat"
//   iam      510-615 s   the climax: the acid F#-G-G#, A# and E over it (F#7), "I am the keeper of the energy"
// Lap 143 bpm, final lap 151. The band above, the kick rolling into the bar
// in the climax, half time on the walls.
// ---------------------------------------------------------------------------

const RAD_T = {
  walls: { bars: 2, chords: ['F#sus', 'F#sus'], tones: ['F# E D#', 'F# B E'],
    bass: { s: rep('x.xxx.xxx.xxx.xx', 2), n: 'F#1 F#1 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'D#5 E5 B4 E5 D#5 E5 F#5 E5 B4 E5 F#5 E5 D#5 E5 B4 F#4' },
    chant: say('x.x.X___........ x.x.X___........', 'F#3 E3 D#3 F#3 E3 B3', 'klaim the wolz klaim the wolz') },
  flame: { bars: 2, chords: ['E/B', 'B'], tones: ['B E G#', 'B D# F#'], root: 'B B',
    bass: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'A1 D#2 B1 B1 B1 B1 B1 B1 B1 B1 D#2 D#2 A1 D#2 A1 A1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'B4 G#4 B4 F#4 B4 E4 B4 E4 B4 D#4 B4 E4 B4 E4 B4 E4 B4 G#4 B4 F#4 E5 B4 F#4 B4 B4 E5 B4 F#4 B4 E4 E4 F#4' },
    chant: say('x.x.x.x.x.x.X___ ................', 'B3 B3 G#3 B3 E4 D#4 B3', 'bern ing in a rap id flaym') },
  decay: { bars: 2, chords: ['D', 'D'], tones: ['F# F C#', 'D F# C#'], root: 'D D',
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'D2 D#2 D2 C#2' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#5 F#4 F4 F#4 F#4 F#4 F#4 F#4 F#5 F#4 F4 F#4 F#4 F#4 F#4 F#4 F#5 F#4 F#4 C#6 C#6 F#5 F#4 F#4 F#5 F#4 C#6 C#6 F#4 F#4 F#4 F#4' },
    chant: say('x.x.x.x.x.X___.. x.x.x.x.x.X___..', 'F#3 F3 F#3 C#4 D4 C#4 F#3 F3 F#3 C#4 D4 F#3', 'rap id al fa de kay rap id al fa de kay') },
  lead: { bars: 2, chords: ['E', 'E'], tones: ['E B F', 'E C# D#'], root: 'G# G#',
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'G#1 E2 G1 G1 F#2 G1 F#2 F#2 G#1 E2 G1 G1 F#2 G1 F#2 F#2 G#1 G#1 G1 G1 G#1 G1 G1 G#1 G#1 E2 G1 G1 F#2 G1 G1 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'B4 E5 E5 B4 B4 E5 C#5 E4 F#4 C#5 B4 C#5 E5 E5 B4 E4' },
    lead: { s: 'X___X___X_x_X___ X___X___X_______', n: 'E5 F5 F#5 G5 G#5 G5 F#5 E5' },
    chant: say('x.x.x.x.x.x.X___ x.x.x.x.x.x.X___', 'E3 E3 F#3 G3 G#3 F#3 E3 B3 B3 C#4 B3 G#3 F#3 E3', 'pump mai bo dee ful with led feel it run thru me tal ik'),
    chant2: say('x.x.x.x.x.X___.. x.x.x.x.x.X___..', 'E3 E3 F#3 G3 G#3 E3 B3 B3 C#4 B3 G#3 E3', 'jump start mai hart stat ik trans end thru the rap id') },
  keeper: { bars: 2, chords: ['A/E | F#m', 'A/E | F#m'], tones: ['A C# G#', 'F# A C#'], root: 'F# F#',
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'E1 E1 E2 F#1 F#1 F#2 F#1 F#2' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'C#5 G#4 C#5 A4 A4 G#4 A4 C#5 C#5 E4 C#5 A4 G#4 F#4 C#5 A4' },
    chant: say('x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.X_', 'C#4 A3 C#4 A3 C#4 A3 C#4 A3 G#3 A3 C#4 A3 G#3 A3 F#3 E3', 'ai luv ai luv ai luv ai luv the keep er of the en er jee') },
  energy: { bars: 2, chords: ['F#m', 'E'], tones: ['F# A G#', 'E A G#'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#1 F#1 F#2 F#1 E1 E1 F1 F#1 F#1 F#1 F#2 F#1 E1 E1 E2 F#1' },
    riff: { s: rep('x.x.x.x.x.x.x.x.', 2), n: 'A4 G#4 A4 E5 A4 G#4 A4 F#4' },
    chant: say('x.x.x.x.X_______ x.x.x.x.X_______', 'A3 G#3 F#3 E3 F#3 A3 G#3 F#3 E3 F#3', 'en er jee and heet en er jee and heet') },
  iam: { bars: 2, chords: ['F#7', 'F#7'], tones: ['F# A# E', 'F# B F'],
    bass: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'F#1 F#1 G1 F#1 F#1 G1 G#1 G1 F#1 F#1 G1 F#1 F#1 G1 A1 G1 F#1 F#1 G1 F#1 F#1 G1 G#1 G1 F#1 F#1 G1 F#1 F#1 G1 G#1 G1' },
    riff: { s: rep('xxxxxxxxxxxxxxxx', 2), n: 'A#4 E4 A#4 A#4 E4 A#4 E4 A#4 A#4 F4 A#4 A#4 E4 A#4 E4 A#4 A#4 E4 A#4 A#4 E4 B4 E4 A#4 A#4 E4 A#4 A#4 E4 A#4 E4 A#4' },
    lead: { s: 'X_______X_______ X___X___X___X___', n: 'A#5 B5 A#5 F5 E5 F#5' },
    chant: say('x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.X_', 'A#3 F#3 A#3 F#3 A#3 F#3 A#3 F#3 E3 F#3 A#3 F#3 E3 F#3 F3 F#3', 'ai am ai am ai am ai am the keep er of the en er jee') },
};

const RAPID_ALPHA_DECAY = {
  meter: '4/4', spb: 16, rot: 0, bpm: 143, finalPlus: 8, mix: 0.86, finalMix: 0.72,
  tracks: [...band({ kick: 'techno', pad: 'strings', lead: 'funk lead', mix: { bass: 0.62 } }), verbBus(2.8, 0.3, 0.2)],
  grooves: {
    // The kick rolling into the next bar (the climax's), the hats driving.
    groove: (final) => final
      ? { kick: 'X...X...X...X.x.', snare: '....X.......X..o', hat: 'xxXxxxXxxxXxxxXx', 'open hat': '..x...x...x...x.' }
      : { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x.X.x.X.x.X.x.X.', 'open hat': '..x...x...x...x.' },
    half: HALF,
  },
  fill: FILL,
  order: ['walls', 'flame', 'decay', 'lead', 'keeper', 'energy', 'lead2', 'iam'],
  finalOrder: ['iam', 'decay', 'lead', 'keeper', 'flame', 'lead2', 'energy', 'iam2'],
  sections(final) {
    const T = RAD_T;
    const s = (k, o) => sec(this, T, k, final, o);
    const up1 = (k, line) => oct(bare(tile4(this, T[k], line)), 1);
    return {
      walls: s('walls', { drums: final ? 'groove' : 'half' }),
      flame: s('flame'),
      decay: s('decay'),
      lead: s('lead', { use: { lead: null } }),
      lead2: s('lead', { extra: { voice: once(T.lead.chant2), 'chip lead': up1('lead', 'riff') } }),
      keeper: s('keeper', { extra: final ? { 'chip lead': oct(bare(once(T.keeper.chant)), 1) } : {} }),
      energy: s('energy'),
      iam: s('iam', { extra: final ? { 'chip lead': up1('iam', 'lead') } : {} }),
      iam2: s('iam', { extra: { 'chip lead': oct(bare(once(T.iam.chant)), 1) } }),
    };
  },
};

export const SONGS = [
  ...cue('alien metal', 'alien-metal-remix', ALIEN_METAL),
  ...cue('kill for the steel', 'kill-for-the-steel-remix', KILL_FOR_THE_STEEL),
  ...cue('level 5', 'level-5-remix', LEVEL_5),
  ...cue('rapid alpha decay', 'rapid-alpha-decay-remix', RAPID_ALPHA_DECAY),
];
