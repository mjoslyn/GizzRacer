import type { HazardKind } from '../items/hazards';
import type { ItemKind } from '../items/items';

/**
 * Synthesized sound effects (spec section 10): no samples, everything is
 * oscillators and filtered noise on the music's AudioContext. The engine
 * is a continuous voice pitched by speed with fuzz on boosts; hazards are
 * panned and faded by distance from the listener.
 */
export class Sfx {
  private out: GainNode | null = null;
  /** One-shot effects ride louder than the engine bed. */
  private mainShots: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Engine and tire voices: one for the solo player, one per seat in Party mode. */
  private readonly voices: { engine: Engine; screech: Screech; bus: GainNode; pan: StereoPannerNode; panned: boolean }[] = [];
  /** Party mode: the one-shots of a seat lean to its side of the screen (see `at`). */
  private panning = 0;
  private readonly panShots = new Map<number, GainNode>();
  private hum: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private wind: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private alarmWait = 0;
  private devil: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode } | null = null;
  private rattleWait = 0;
  /** The Woo Cannon's shout: the one sound that's a recording (public/sfx/woo.mp3), fetched once. */
  private wooBuffer: AudioBuffer | null = null;
  private wooLoad: Promise<void> | null = null;
  /** The woo looping for as long as the player's cannon flies. */
  private wooLoop: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  muted = false;
  volume = 1;

  constructor(
    private readonly context: () => AudioContext | null,
    /** Called for the big sounds, so the music can dip under them. */
    private readonly onDuck: (level: number, hold: number) => void = () => {},
  ) {}

  private get ctx(): AudioContext | null {
    const ctx = this.context();
    if (!ctx) return null;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.volume;
      // A compressor lets quiet effects sit louder without stacked ones clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      const makeup = ctx.createGain();
      makeup.gain.value = 1.6;
      this.out.connect(comp).connect(makeup).connect(ctx.destination);
      this.mainShots = ctx.createGain();
      this.mainShots.gain.value = 5;
      this.mainShots.connect(this.out);
      this.noise = whiteNoise(ctx);
      this.wooLoad = fetch('sfx/woo.mp3')
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => void (this.wooBuffer = buffer))
        .catch(() => {});
    }
    return ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out && !this.muted) this.out.gain.value = v;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  /**
   * The player's engine and tires. `level` 0 silences them (menus, pause);
   * speed is a 0..1 fraction of top speed; `screech` 0..1 is how hard the
   * tires are sliding (drifts, hard turns).
   */
  updateEngine(level: number, speed: number, boosting: boolean, drifting: boolean, screech = 0, voice = 0, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.voice(ctx, voice, pan);
    v.engine.set(ctx, level, speed, boosting, drifting);
    v.screech.set(ctx, level * screech, speed);
  }

  /** Silences the engine voices from `from` on (Party mode's seats, once the party's over). */
  quietEngines(from: number): void {
    const ctx = this.context();
    if (!ctx) return;
    for (let i = from; i < this.voices.length; i++) {
      this.voices[i].engine.set(ctx, 0, 0, false, false);
      this.voices[i].screech.set(ctx, 0, 0);
    }
  }

  /** An engine voice, made the first time it's asked for; off centre, it goes through a panner. */
  private voice(ctx: AudioContext, i: number, pan: number) {
    while (this.voices.length <= i) {
      const bus = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.connect(this.out!);
      bus.connect(this.out!);
      this.voices.push({ engine: new Engine(ctx, bus), screech: new Screech(ctx, bus, this.noise!), bus, pan: p, panned: false });
    }
    const v = this.voices[i];
    const panned = pan !== 0;
    if (panned !== v.panned) {
      // Straight out when centred: a panner would take a mono voice down 3 dB.
      v.bus.disconnect();
      v.bus.connect(panned ? v.pan : this.out!);
      v.panned = panned;
    }
    if (panned) v.pan.pan.value = pan;
    return v;
  }

  /** Plays what `play` sounds leaning `pan` (-1 left .. 1 right): a Party seat's own sounds. */
  at(pan: number, play: () => void): void {
    this.panning = pan;
    try {
      play();
    } finally {
      this.panning = 0;
    }
  }

  /** Where one-shots go: the main bus, or a seat's panned one. */
  private get shots(): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || this.panning === 0) return this.mainShots;
    let bus = this.panShots.get(this.panning);
    if (!bus) {
      bus = ctx.createGain();
      bus.gain.value = 5;
      const p = ctx.createStereoPanner();
      p.pan.value = this.panning;
      bus.connect(p).connect(this.out!);
      this.panShots.set(this.panning, bus);
    }
    return bus;
  }

  countdown(go: boolean): void {
    this.onDuck(0.5, go ? 0.6 : 0.25);
    this.tone(go ? 880 : 440, go ? 0.5 : 0.18, 'square', 0.16);
    if (go) this.tone(1320, 0.5, 'square', 0.06);
  }

  hop(): void {
    this.tone(260, 0.08, 'square', 0.06, 520);
  }

  land(intensity: number): void {
    this.hit(0.12, 260, Math.min(0.35, 0.08 + intensity * 0.03));
  }

  wall(intensity: number): void {
    this.hit(0.14, 700, Math.min(0.4, 0.1 + intensity * 0.12));
  }

  /** A drift reached spark tier 1..4. */
  driftTier(tier: number): void {
    const f = [0, 660, 880, 1175, 1568][tier];
    this.tone(f, 0.12, 'triangle', 0.12);
    this.tone(f * 2, 0.1, 'sine', 0.05, undefined, 0.03);
  }

  boost(tier: number): void {
    this.onDuck(0.65, 0.4);
    this.whoosh(0.35 + tier * 0.1, 500, 2600, 0.18 + tier * 0.05);
    // A purple release kicks in with a fuzzed fifth under it.
    if (tier >= 2) this.tone(tier === 3 ? 147 : 110, 0.35, 'sawtooth', 0.04 + tier * 0.015, tier === 3 ? 294 : 220, 0, true);
    if (tier === 3) this.tone(1760, 0.25, 'sine', 0.06, 2637);
    // A rainbow release: the fifth and a shimmer on top.
    if (tier >= 4) [1760, 2217, 2637].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.05, f * 1.5, i * 0.05));
  }

  /** Off a launcher: a rush of air up the ramp and the glider snapping open, a rising whistle over it. */
  glide(): void {
    this.whoosh(0.6, 400, 2400, 0.22);
    this.whoosh(0.12, 3000, 1200, 0.18);
    this.tone(523, 0.35, 'sine', 0.06, 1047, 0.05);
  }

  /** A trick landed; each one in a streak climbs a step higher. */
  trick(streak = 1): void {
    const up = 2 ** ((Math.max(1, streak) - 1) * 2 / 12);
    [784, 988, 1319].forEach((f, i) => this.tone(f * up, 0.09, 'triangle', 0.1, undefined, i * 0.06));
    if (streak > 1) this.tone(1568 * up, 0.18, 'sine', 0.07, undefined, 0.2);
  }

  /** While drifting: a hum that rises with the spark charge, 0..1 (0 silences it). */
  driftCharge(charge: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.hum) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.out!);
      osc.start();
      osc2.start();
      this.hum = { osc, osc2, gain };
    }
    const t = ctx.currentTime;
    const f = 220 * 2 ** (charge * 2);
    this.hum.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.hum.osc2.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this.hum.gain.gain.setTargetAtTime(charge > 0 ? 0.012 + charge * 0.02 : 0, t, 0.04);
  }

  /** A slipstream building, 0..1: wind rushing past. */
  draft(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.out!);
      src.start();
      this.wind = { gain, bp };
    }
    const t = ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(level > 0.05 ? 0.05 + level * 0.12 : 0, t, 0.08);
    this.wind.bp.frequency.setTargetAtTime(700 + level * 1800, t, 0.08);
  }

  /** The draft is full and fires. */
  slipstream(): void {
    this.onDuck(0.6, 0.4);
    this.whoosh(0.5, 900, 3500, 0.22);
    this.tone(660, 0.2, 'triangle', 0.06, 1320);
  }

  /** Off the line in the window: the engine screams and launches. */
  rocket(): void {
    this.onDuck(0.5, 0.6);
    this.tone(180, 0.45, 'sawtooth', 0.08, 900, 0, true);
    this.whoosh(0.6, 400, 3000, 0.25);
  }

  /** Jumped the start: the engine coughs and dies for a moment. */
  stall(): void {
    for (let i = 0; i < 4; i++) {
      this.tone(70 - i * 6, 0.09, 'square', 0.08, 45, i * 0.14, true);
      this.hit(0.08, 400, 0.18);
    }
  }

  /** Kart on kart: a thud with a clank of metal. */
  bump(intensity: number): void {
    this.hit(0.12, 320, 0.2 + intensity * 0.3);
    this.tone(1900 + Math.random() * 400, 0.07, 'square', 0.03 + intensity * 0.04, 900);
  }

  /** Drove through an item box: glass breaking and a sparkle; a double box sparkles twice. */
  box(level: number, double: boolean): void {
    const ctx = this.ctx;
    if (!ctx || level <= 0) return;
    if (level > 0.8) this.onDuck(0.7, 0.2);
    const t = ctx.currentTime;
    // The crack: a bright, short burst of noise.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(hp).connect(gain).connect(this.shots!);
    src.start(t, Math.random());
    src.stop(t + 0.2);
    this.hit(0.1, 500, 0.25 * level);
    // Shards tinkling down, and the twinkle of what's inside.
    const shards = [2637, 3136, 3520, 4186, 3951];
    for (let i = 0; i < 5; i++) this.tone(shards[(i * 3) % 5] * (0.97 + Math.random() * 0.06), 0.06, 'triangle', 0.05 * level, undefined, 0.03 + i * 0.035 + Math.random() * 0.02);
    const sparkle = double ? [1568, 2093, 2637, 3136, 2637, 3136, 4186] : [1568, 2093, 2637];
    sparkle.forEach((f, i) => this.tone(f, 0.12, 'sine', 0.05 * level, undefined, 0.08 + i * 0.05));
  }

  /** A held item took a hit for you: a clang. */
  block(): void {
    this.onDuck(0.6, 0.3);
    this.tone(1245, 0.35, 'triangle', 0.1);
    this.tone(1318, 0.35, 'triangle', 0.08);
    this.hit(0.1, 3000, 0.3);
  }

  /** Rode over a Nonagon Infinity. */
  dodge(): void {
    this.onDuck(0.6, 0.4);
    this.whoosh(0.4, 600, 2800, 0.2);
    [988, 1319, 1976].forEach((f, i) => this.tone(f, 0.1, 'sine', 0.08, undefined, i * 0.05));
  }

  /** A Nonagon Infinity closing on you, 0..1 (null when there's none): beeps that come faster as it closes. */
  surgeAlarm(dt: number, near: number | null): void {
    if (near === null) {
      this.alarmWait = 0;
      return;
    }
    this.alarmWait -= dt;
    if (this.alarmWait > 0) return;
    this.alarmWait = 0.5 - near * 0.38;
    this.tone(880 + near * 440, 0.07, 'square', 0.05 + near * 0.04);
  }

  pickup(): void {
    this.onDuck(0.6, 0.3);
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.07, 'triangle', 0.08, undefined, i * 0.045));
  }

  itemReady(): void {
    this.tone(1568, 0.08, 'sine', 0.08);
    this.tone(2093, 0.14, 'sine', 0.08, undefined, 0.07);
  }

  use(item: ItemKind): void {
    this.onDuck(0.5, 0.6);
    switch (item) {
      case 'fuzzPedal':
        // A fuzzed power chord, the boost's own engine fuzz follows.
        [110, 165, 220].forEach((f) => this.tone(f, 0.45, 'sawtooth', 0.07, undefined, 0, true));
        break;
      case 'microtonalMine':
        this.tone(620, 0.35, 'triangle', 0.12, 590);
        this.tone(640, 0.35, 'triangle', 0.1, 600);
        break;
      case 'feedbackWave':
        this.tone(1800, 0.5, 'sine', 0.12, 120);
        this.whoosh(0.5, 2000, 300, 0.12);
        break;
      case 'riffMissile':
        [220, 277, 330, 440].forEach((f, i) => this.tone(f, 0.08, 'sawtooth', 0.07, undefined, i * 0.05, true));
        break;
      case 'tempoShift':
        this.tone(880, 0.7, 'square', 0.08, 220);
        break;
      case 'wooCannon':
        // The woo itself loops for the whole flight (cannonLoop).
        this.whoosh(0.8, 300, 2400, 0.2);
        break;
      case 'fluteFlurry':
        // A breathy run up the scale with a trill on top.
        [1175, 1319, 1480, 1760, 1976, 2349, 1976, 2349].forEach((f, i) => {
          this.tone(f, 0.09, 'sine', 0.07, f * 1.01, i * 0.045);
        });
        this.whoosh(0.4, 3000, 5000, 0.04);
        break;
      case 'drumRoll':
        // A roll on the toms building into a crash.
        for (let i = 0; i < 12; i++) this.hit(0.07, 260 + i * 25, 0.14 + i * 0.015);
        for (let i = 0; i < 12; i++) this.tone(150 - i * 4, 0.06, 'sine', 0.08, 80, i * 0.05);
        this.whoosh(0.7, 6000, 3000, 0.08);
        break;
      case 'bassDrop':
        this.onDuck(0.25, 1);
        this.tone(110, 1, 'sine', 0.25, 32);
        this.tone(55, 1, 'sawtooth', 0.06, 30, 0, true);
        break;
      case 'patchCable':
        // A jack going in: a crackle, then an oscillator sweeping up.
        this.hit(0.05, 5000, 0.2);
        this.tone(160, 0.4, 'square', 0.07, 1400, 0.04);
        this.tone(163, 0.4, 'sawtooth', 0.05, 1450, 0.04);
        break;
      case 'harmonicaWail':
        // Two reeds bending up into a wail.
        [466, 587, 698].forEach((f) => this.tone(f * 0.94, 0.65, 'square', 0.035, f));
        this.whoosh(0.55, 800, 1600, 0.07);
        break;
      case 'keytarLaser':
        this.tone(2400, 0.3, 'sawtooth', 0.07, 180, 0, true);
        this.tone(1200, 0.3, 'square', 0.04, 90);
        break;
      case 'drippingTap':
        // A tap turned on: drips quickening into a stream.
        for (let i = 0; i < 8; i++) this.tone(1400 - i * 60, 0.05, 'sine', 0.08, 900, i * i * 0.012);
        this.whoosh(0.9, 400, 2200, 0.1);
        break;
      case 'gizzardWave':
        this.onDuck(0.4, 1.2);
        this.whoosh(1.2, 120, 900, 0.3);
        this.tone(98, 1.2, 'sawtooth', 0.06, 196, 0, true);
        break;
    }
  }

  /** Loops the woo while `on` (the player is in the cannon), fading it out when the flight ends. */
  cannonLoop(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    if (on && !this.wooLoop && this.wooBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.wooBuffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      src.connect(gain).connect(this.out);
      src.start();
      this.wooLoop = { src, gain };
    }
    if (this.wooLoop) this.onDuck(0.3, 0.2);
    if (!on && this.wooLoop) {
      const { src, gain } = this.wooLoop;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.25);
      src.stop(t + 0.3);
      this.wooLoop = null;
    }
  }

  /** The Woo Cannon's shout at `level` (1 for your own, quieter for someone else's nearby). */
  woo(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    if (!this.wooBuffer) {
      // Not loaded yet: shout as soon as it is, if that's soon.
      const asked = ctx.currentTime;
      void this.wooLoad?.then(() => this.wooBuffer && ctx.currentTime - asked < 0.4 && this.woo(level));
      return;
    }
    this.onDuck(0.3, this.wooBuffer.duration);
    const src = ctx.createBufferSource();
    src.buffer = this.wooBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9 * level;
    src.connect(gain).connect(this.out);
    src.start();
  }

  /** The player got hit, by an item or a hazard. */
  hurt(by: ItemKind | HazardKind): void {
    if (by === 'tumbleweeds') {
      this.hit(0.18, 1200, 0.25);
      return;
    }
    if (by === 'dustDevils' || by === 'butterflies' || by === 'tornadoes' || by === 'wisps') return;
    this.onDuck(0.4, 0.8);
    if (by === 'boulders' || by === 'lavaBombs' || by === 'oilBombs' || by === 'meteors' || by === 'hail' || by === 'rollers' || by === 'vines' || by === 'iceBlocks' || by === 'stones' || by === 'gliders' || by === 'crystals' || by === 'goblins') this.hit(0.3, 180, 0.5);
    // A geyser goes up in a roar of water; Predator X snaps with a bellow.
    if (by === 'geysers') this.whoosh(0.9, 300, 2600, 0.35);
    if (by === 'jaws') this.tone(70, 0.7, 'sawtooth', 0.14, 40, 0, true);
    // Masonry slamming down is a deep crunch; a gust a rush of air; a vesicle a rubbery boing; a prism beam a glassy zap.
    if (by === 'crushers') this.hit(0.6, 70, 0.8);
    if (by === 'gusts') this.whoosh(0.7, 500, 2200, 0.3);
    if (by === 'vesicles') this.tone(180, 0.35, 'sine', 0.12, 520);
    if (by === 'prisms') this.tone(2600, 0.25, 'triangle', 0.07, 900);
    // A robot walks into you with a clank; the gamma knife is a glassy zap; a vulture a screech; a wah pedal a stamp and a sweep.
    if (by === 'robots') this.tone(240, 0.3, 'square', 0.08, 120);
    if (by === 'gammaRays') this.tone(3400, 0.35, 'sawtooth', 0.06, 700);
    if (by === 'vultures') this.tone(1900, 0.4, 'sawtooth', 0.07, 1100);
    if (by === 'wahs') {
      this.hit(0.4, 120, 0.6);
      this.tone(320, 0.45, 'sawtooth', 0.09, 1500);
    }
    // Smog is a choking rush of air; an airlock door a hiss and a clunk; a flare a low roar; the rats a squeal.
    if (by === 'smog') this.whoosh(0.7, 900, 250, 0.3);
    if (by === 'airlocks') {
      this.whoosh(0.3, 3000, 1200, 0.2);
      this.hit(0.35, 140, 0.6);
    }
    if (by === 'flares') this.tone(60, 0.8, 'sawtooth', 0.12, 120, 0, true);
    if (by === 'rats') this.tone(2400, 0.35, 'square', 0.05, 3600);
    // An eye's blast is a psychic zap; an arrow a buzz; cellophane a crinkle; fuzz a burst of distorted noise.
    if (by === 'eyes') this.tone(900, 0.5, 'sine', 0.1, 200);
    if (by === 'arrows') this.tone(180, 0.3, 'square', 0.08, 120);
    if (by === 'sheets') this.whoosh(0.35, 5000, 2500, 0.18);
    if (by === 'fuzz') {
      this.whoosh(0.4, 1400, 600, 0.25);
      this.tone(110, 0.4, 'sawtooth', 0.1, 90, 0, true);
    }
    // A wave breaking over you: a crash of white noise; a glider comes in with a whistle of wind.
    if (by === 'waves') this.whoosh(0.8, 2400, 300, 0.35);
    if (by === 'gliders') this.whoosh(0.5, 1800, 500, 0.2);
    if (by === 'fish') this.hit(0.25, 900, 0.4);
    if (by === 'lasers') this.tone(1760, 0.3, 'square', 0.06, 220);
    if (by === 'flameJets' || by === 'lavaBombs' || by === 'oilBombs' || by === 'dragonFire' || by === 'meteors') this.whoosh(0.6, 300, 1400, 0.3);
    // Thunder on a strike; a falling moan into a black hole.
    if (by === 'lightning') {
      this.hit(0.5, 90, 0.7);
      this.tone(2200, 0.15, 'square', 0.07, 400);
    }
    if (by === 'blackHoles') this.tone(320, 1.2, 'sine', 0.12, 40);
    // A dragon roars as it burns you.
    if (by === 'dragonFire') this.tone(90, 0.8, 'sawtooth', 0.12, 45, 0, true);
    this.tone(700, 0.55, 'sawtooth', 0.09, 140);
    this.tone(720, 0.55, 'sawtooth', 0.07, 150);
  }

  /** The player's item hit someone. */
  /** A shortcut found for the first time: a rising secret-found chime. */
  discover(): void {
    this.onDuck(0.6, 0.5);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, undefined, i * 0.07));
    this.tone(2093, 0.5, 'sine', 0.06, undefined, 0.35);
  }

  /** A cup trophy, or something unlocked: a fanfare. */
  fanfare(): void {
    this.onDuck(0.5, 1.2);
    [392, 392, 392, 523, 659, 784].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.16, 'square', 0.07, undefined, i * 0.14));
    [196, 262, 330].forEach((f, i) => this.tone(f, 0.7, 'sawtooth', 0.04, undefined, 0.7 + i * 0.02, true));
  }

  scored(): void {
    this.onDuck(0.55, 0.4);
    this.tone(523, 0.1, 'square', 0.08);
    this.tone(784, 0.18, 'square', 0.08, undefined, 0.08);
  }

  lap(final: boolean): void {
    this.onDuck(0.45, final ? 0.7 : 0.4);
    const notes = final ? [659, 784, 988, 1319] : [784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, 'square', 0.08, undefined, i * 0.1));
  }

  finish(): void {
    this.onDuck(0.35, 1.2);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.14, 'square', 0.08, undefined, i * 0.12));
  }

  menu(): void {
    this.tone(660, 0.05, 'square', 0.05);
  }

  /**
   * Hazard ambience. `rattle` and `devil` are the nearest snake and dust
   * devil as distance (m) and pan (-1 left .. 1 right), or null.
   */
  hazards(dt: number, rattle: { d: number; pan: number } | null, devil: { d: number; pan: number } | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.rattleWait -= dt;
    if (rattle && rattle.d < 35 && this.rattleWait <= 0) {
      this.rattleWait = 0.55;
      this.rattleBurst(ctx, (1 - rattle.d / 35) * 0.35, rattle.pan);
    }
    if (!this.devil) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(bp).connect(gain).connect(pan).connect(this.out!);
      src.start();
      this.devil = { src, gain, pan };
    }
    const level = devil && devil.d < 45 ? (1 - devil.d / 45) ** 2 * 0.5 : 0;
    this.devil.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.1);
    this.devil.pan.pan.setTargetAtTime(devil?.pan ?? 0, ctx.currentTime, 0.1);
  }

  private rattleBurst(ctx: AudioContext, level: number, pan: number): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const gain = ctx.createGain();
    // A fast train of clicks: the rattle.
    gain.gain.setValueAtTime(0, t);
    for (let i = 0; i < 9; i++) {
      gain.gain.setValueAtTime(level, t + i * 0.035);
      gain.gain.setValueAtTime(level * 0.15, t + i * 0.035 + 0.015);
    }
    gain.gain.setValueAtTime(0, t + 0.33);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(hp).connect(gain).connect(p).connect(this.shots!);
    src.start(t, Math.random());
    src.stop(t + 0.35);
  }

  private tone(freq: number, dur: number, type: OscillatorType, level: number, slideTo?: number, delay = 0, fuzz = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    let node: AudioNode = osc;
    if (fuzz) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = fuzzCurve();
      node = node.connect(shaper);
    }
    node.connect(gain).connect(this.shots!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A low-passed noise thump. */
  private hit(dur: number, cutoff: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(gain).connect(this.shots!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** A band-passed noise sweep. */
  private whoosh(dur: number, from: number, to: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + dur * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(gain).connect(this.shots!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}

/** Two detuned oscillators through a low-pass, with a fuzz send that opens on boosts. */
class Engine {
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly clean: GainNode;
  private readonly dirty: GainNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.a = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.b = ctx.createOscillator();
    this.b.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 4;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.a.connect(mix);
    this.b.connect(mix);
    mix.connect(this.filter);
    this.clean = ctx.createGain();
    this.clean.gain.value = 0;
    this.dirty = ctx.createGain();
    this.dirty.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    shaper.curve = fuzzCurve();
    this.filter.connect(this.clean).connect(out);
    this.filter.connect(shaper).connect(this.dirty).connect(out);
    this.a.start();
    this.b.start();
  }

  set(ctx: AudioContext, level: number, speed: number, boosting: boolean, drifting: boolean): void {
    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1.3, speed));
    // Idle burble up to a howl; drifting revs a little higher.
    const f = 42 + v * 120 + (drifting ? 14 : 0);
    this.a.frequency.setTargetAtTime(f, t, 0.06);
    this.b.frequency.setTargetAtTime(f * 0.501, t, 0.06);
    this.filter.frequency.setTargetAtTime(380 + v * 1500, t, 0.08);
    this.clean.gain.setTargetAtTime(level * (0.03 + v * 0.025), t, 0.08);
    this.dirty.gain.setTargetAtTime(boosting ? level * 0.035 : 0, t, 0.05);
  }
}

/**
 * Tire squeal: noise through two narrow band-passes (the pitched squeal)
 * wobbled by a slow LFO, so it chirps rather than hisses.
 */
class Screech {
  private readonly gain: GainNode;
  private readonly bands: BiquadFilterNode[];

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.bands = [2300, 3400].map((f) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 14;
      src.connect(bp).connect(this.gain);
      return bp;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 120;
    lfo.connect(depth);
    for (const b of this.bands) depth.connect(b.frequency);
    this.gain.connect(out);
    src.start();
    lfo.start();
  }

  set(ctx: AudioContext, amount: number, speed: number): void {
    const t = ctx.currentTime;
    // Narrow bands are quiet: they need a lot of gain to be heard.
    this.gain.gain.setTargetAtTime(Math.min(1, amount) * 0.6, t, amount > 0 ? 0.04 : 0.09);
    const pitch = 0.85 + Math.min(1.2, speed) * 0.25;
    this.bands[0].frequency.setTargetAtTime(2300 * pitch, t, 0.1);
    this.bands[1].frequency.setTargetAtTime(3400 * pitch, t, 0.1);
  }
}

let fuzz: Float32Array<ArrayBuffer> | null = null;

/** Hard-ish clipping curve for the fuzz. */
function fuzzCurve(): Float32Array<ArrayBuffer> {
  if (fuzz) return fuzz;
  const n = 1024;
  fuzz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    fuzz[i] = Math.tanh(x * 9) * 0.8;
  }
  return fuzz;
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
