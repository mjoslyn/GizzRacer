import { SHADOW_DUST, ShadowSim, makeShadow, type CardSound } from '../../core/cardSkills';
import { seededRandom } from '../../core/math';
import { CREAM, GOLD, SimGame, clipStage, panel, say, type Stage, type Synth } from './kit';

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
/** Where the horizon is, and where you walk (shares down the stage). */
const HORIZON = 0.3;
const WALK = 0.84;

/**
 * A New World: as the dust settles a brute like a bear wanders by the
 * meadow; keep inside its long dark shadow, walking left and right with it.
 */
export class NewWorldGame extends SimGame<ShadowSim> {
  private left = false;
  private right = false;
  /** Pools of blood and crusted mud on the meadow. */
  private readonly pools: { u: number; v: number; r: number; blood: boolean }[];

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new ShadowSim(makeShadow(seed, level, length)));
    const rand = seededRandom(seed + 3);
    this.pools = Array.from({ length: 7 }, () => ({ u: 0.06 + rand() * 0.88, v: HORIZON + 0.12 + rand() * 0.5, r: 0.02 + rand() * 0.035, blood: rand() < 0.4 }));
  }

  private steer(): void {
    this.sim.dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  key(code: string, repeat: boolean): void {
    if (repeat) return;
    if (LEFT.has(code)) this.left = true;
    else if (RIGHT.has(code)) this.right = true;
    this.steer();
  }

  keyUp(code: string): void {
    if (LEFT.has(code)) this.left = false;
    else if (RIGHT.has(code)) this.right = false;
    this.steer();
  }

  tap(u: number): void {
    this.left = u < 0.5;
    this.right = !this.left;
    this.steer();
  }

  release(): void {
    this.left = this.right = false;
    this.steer();
  }

  protected sound(x: CardSound): void {
    if (x.s === 'in') this.synth.note(196, 0.3, 'triangle', 0.07);
    else this.synth.note(98, 0.25, 'square', 0.06);
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const X = (u: number) => s.x + u * s.size;
    const Y = (v: number) => s.y + v * s.size;
    clipStage(s);
    // A new world: a pale sky, the meadow under it.
    g.fillStyle = '#c8a878';
    g.fillRect(s.x, s.y, s.size, s.size * HORIZON);
    g.fillStyle = '#5a8a3a';
    g.fillRect(s.x, Y(HORIZON), s.size, s.size * (1 - HORIZON));
    for (const p of this.pools) {
      g.fillStyle = p.blood ? '#8a1a1a' : '#5a4028';
      g.beginPath();
      g.ellipse(X(p.u), Y(p.v), s.size * p.r * 1.6, s.size * p.r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // The shadow: from the bear's feet down the meadow, widening to its full width where you walk.
    const c = sim.shadow;
    const w = sim.width;
    g.fillStyle = 'rgba(10, 10, 30, 0.6)';
    g.beginPath();
    g.moveTo(X(c - 0.05), Y(HORIZON + 0.03));
    g.lineTo(X(c + 0.05), Y(HORIZON + 0.03));
    g.lineTo(X(c + w / 2 + 0.03), Y(1));
    g.lineTo(X(c - w / 2 - 0.03), Y(1));
    g.closePath();
    g.fill();
    // Where it counts, along your path.
    g.strokeStyle = 'rgba(255, 210, 58, 0.5)';
    g.lineWidth = 2;
    g.strokeRect(X(c - w / 2), Y(WALK - 0.08), w * s.size, s.size * 0.12);
    // The brute like a bear, on the horizon.
    const bob = Math.sin(t * 5) * s.size * 0.004;
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.ellipse(X(c), Y(HORIZON - 0.04) + bob, s.size * 0.075, s.size * 0.045, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(X(c + 0.06), Y(HORIZON - 0.075) + bob, s.size * 0.03, 0, Math.PI * 2);
    g.fill();
    for (const ex of [0.045, 0.075]) {
      g.beginPath();
      g.arc(X(c + ex), Y(HORIZON - 0.105) + bob, s.size * 0.01, 0, Math.PI * 2);
      g.fill();
    }
    for (const lx of [-0.05, -0.02, 0.025, 0.05]) g.fillRect(X(c + lx) - s.size * 0.008, Y(HORIZON - 0.02) + bob, s.size * 0.016, s.size * 0.035);
    // Its eye: red while you are out in the open.
    g.fillStyle = sim.hidden ? '#664' : '#ff3a3a';
    g.beginPath();
    g.arc(X(c + 0.07), Y(HORIZON - 0.08) + bob, s.size * 0.006, 0, Math.PI * 2);
    g.fill();
    // You, barefoot.
    const px = X(sim.x);
    const py = Y(WALK);
    g.fillStyle = sim.hidden ? '#8a9ac8' : CREAM;
    g.beginPath();
    g.arc(px, py - s.size * 0.05, s.size * 0.02, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - s.size * 0.012, py - s.size * 0.03, s.size * 0.024, s.size * 0.05);
    if (!sim.hidden) say(s, '!', sim.x, WALK - 0.12, 0.07, '#ff5a5a');
    // The dust settling.
    const dust = Math.max(0, 1 - sim.t / SHADOW_DUST);
    if (dust > 0) {
      g.fillStyle = `rgba(170, 140, 100, ${dust * 0.9})`;
      g.fillRect(s.x, s.y, s.size, s.size);
    }
    g.restore();
    // In the shadow so far, of what's needed.
    const share = Math.min(1, sim.inside / sim.game.need);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(X(0.1), Y(0.94), s.size * 0.8, s.size * 0.03);
    g.fillStyle = GOLD;
    g.fillRect(X(0.1), Y(0.94), s.size * 0.8 * share, s.size * 0.03);
    s.status(`${sim.hidden ? 'Hidden' : 'SEEN: back into the shadow'} · ${Math.floor(sim.inside)} of ${sim.game.need} s · ${Math.max(0, Math.ceil(sim.game.length - sim.t))} s left`);
  }
}
