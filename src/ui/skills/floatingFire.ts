import { BOLT_W, FIRE_R, FIRE_X, FireSim, makeFire, type CardSound } from '../../core/cardSkills';
import { GOLD, SimGame, clipStage, panel, say, type Stage, type Synth } from './kit';

const RISE = new Set(['Space', 'Enter', 'ArrowUp', 'KeyW']);

/**
 * The Floating Fire: clouds tear, the sky bleeds; hold to float the fire
 * up through the gaps in the lightning, catching golden wire.
 */
export class FloatingFireGame extends SimGame<FireSim> {
  /** The silver trail behind the fire: its recent heights. */
  private readonly trail: number[] = [];

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new FireSim(makeFire(seed, level, length)));
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && RISE.has(code)) this.sim.holding = true;
  }

  keyUp(code: string): void {
    if (RISE.has(code)) this.sim.holding = false;
  }

  tap(): void {
    this.sim.holding = true;
  }

  release(): void {
    this.sim.holding = false;
  }

  protected sound(x: CardSound): void {
    if (x.s === 'wire') this.synth.note(880 + ((x.n ?? 0) % 5) * 110, 0.15, 'triangle', 0.1);
    else {
      this.synth.rattle(0.25);
      this.synth.thud();
    }
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    clipStage(s);
    // The sky bleeding.
    const sky = g.createLinearGradient(0, s.y, 0, s.y + k);
    sky.addColorStop(0, '#3a0a2a');
    sky.addColorStop(1, '#8a1a2a');
    g.fillStyle = sky;
    g.fillRect(s.x, s.y, k, k);
    const scroll = sim.scroll;
    // Each bolt: lightning down to its gap and up from below it.
    for (const b of sim.game.bolts) {
      const u = b.x - scroll;
      if (u < -0.1 || u > 1.1) continue;
      const top = b.gap - b.size / 2;
      const bottom = b.gap + b.size / 2;
      for (const [from, to] of [
        [0, top],
        [1, bottom],
      ]) {
        g.strokeStyle = 'rgba(200, 220, 255, 0.35)';
        g.lineWidth = BOLT_W * 2 * k;
        this.zigzag(s, u, from, to, b.x);
        g.strokeStyle = '#f4f8ff';
        g.lineWidth = Math.max(2, k * 0.012);
        this.zigzag(s, u, from, to, b.x);
      }
    }
    // Golden wire.
    sim.game.wires.forEach((w, i) => {
      const u = w.x - scroll;
      if (sim.taken[i] || u < -0.06 || u > 1.06) return;
      g.fillStyle = 'rgba(255, 210, 58, 0.18)';
      g.beginPath();
      g.arc(X(u), Y(w.y), k * 0.045, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = GOLD;
      g.lineWidth = Math.max(2, k * 0.009);
      g.beginPath();
      // A coil of golden wire.
      for (let j = 0; j <= 16; j++) {
        const a = j / 16;
        const px = X(u - 0.035 + a * 0.07);
        const py = Y(w.y) + Math.sin(a * Math.PI * 6 + t * 5) * k * 0.016;
        if (j) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
    });
    // The silver trail, then the fire itself (flickering, safe, after a strike).
    this.trail.unshift(sim.y);
    this.trail.length = Math.min(this.trail.length, 14);
    this.trail.forEach((y, i) => {
      g.fillStyle = `rgba(220, 230, 255, ${0.3 * (1 - i / 14)})`;
      g.beginPath();
      g.arc(X(FIRE_X - i * 0.012), Y(y), k * FIRE_R * (1 - i / 18) * 0.7, 0, Math.PI * 2);
      g.fill();
    });
    if (sim.safe <= 0 || Math.floor(t * 12) % 2) {
      const flick = 1 + Math.sin(t * 30) * 0.08;
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.arc(X(FIRE_X), Y(sim.y), k * FIRE_R * 1.2 * flick, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffe07a';
      g.beginPath();
      g.arc(X(FIRE_X), Y(sim.y), k * FIRE_R * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Sparks left, and the wire caught.
    for (let i = 0; i < sim.game.sparks; i++) {
      g.fillStyle = i < sim.sparks ? '#ff7a1a' : 'rgba(255,255,255,0.2)';
      g.beginPath();
      g.arc(X(0.06 + i * 0.06), Y(0.06), k * 0.02, 0, Math.PI * 2);
      g.fill();
    }
    say(s, `${sim.caught} / ${sim.game.need}`, 0.94, 0.06, 0.05, GOLD, 'right');
    s.status(`${sim.holding ? 'Rising' : 'Sinking'} · ${sim.caught} golden wire of ${sim.game.need} · ${sim.sparks} ${sim.sparks === 1 ? 'spark' : 'sparks'} left`);
  }

  /** A bolt's jagged line at `u`, from height `from` to `to`, its kinks fixed by `seed`. */
  private zigzag(s: Stage, u: number, from: number, to: number, seed: number): void {
    const g = s.g;
    const steps = 6;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const v = from + ((to - from) * i) / steps;
      const jig = i === 0 || i === steps ? 0 : Math.sin(seed * 37 + i * 2.7) * 0.02;
      const px = s.x + (u + jig) * s.size;
      const py = s.y + v * s.size;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
  }
}
