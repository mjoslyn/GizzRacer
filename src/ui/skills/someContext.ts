import { OVERTURE_APPROACH, OvertureSim, makeOverture, type CardSound } from '../../core/cardSkills';
import { CREAM, GOLD, SimGame, clipStage, panel, type Stage, type Synth } from './kit';

const PRESS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** The cloud's middle (shares of the stage) and the target ring's radius. */
const CU = 0.5;
const CV = 0.42;
const TARGET = 0.1;

/**
 * Some Context: the storm's overture. Rings close in on the cloud, one a
 * hit; strike each as it lands, and the lightning answers.
 */
export class SomeContextGame extends SimGame<OvertureSim> {
  /** When the last hit landed (the sim's clock), for its bolt. */
  private flashAt = -9;
  private flashGood = false;

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new OvertureSim(makeOverture(seed, level, length)));
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && PRESS.has(code)) this.sim.press();
  }

  tap(): void {
    this.sim.press();
  }

  protected sound(x: CardSound): void {
    if (x.s === 'beat') this.synth.kick(x.n === 0 ? 0.3 : 0.14);
    else if (x.s === 'hit') {
      this.flashAt = this.sim.t;
      this.flashGood = x.n === 1;
      this.synth.rattle(0.22);
      this.synth.note(x.n === 1 ? 110 : 98, 0.4, 'sawtooth', 0.12);
    } else this.synth.thud();
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const t = sim.t;
    const cx = s.x + CU * s.size;
    const cy = s.y + CV * s.size;
    clipStage(s);
    // Rain.
    g.strokeStyle = 'rgba(160, 190, 255, 0.25)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 40; i++) {
      const u = ((i * 0.618 + t * 0.07) % 1) * s.size;
      const v = ((i * 0.37 + t * 1.3) % 1) * s.size;
      g.moveTo(s.x + u, s.y + v);
      g.lineTo(s.x + u - 4, s.y + v + 12);
    }
    g.stroke();
    // The bolt off the last hit landed.
    const since = t - this.flashAt;
    if (since < 0.3) {
      g.fillStyle = `rgba(255, 255, 255, ${0.25 * (1 - since / 0.3)})`;
      g.fillRect(s.x, s.y, s.size, s.size);
      g.strokeStyle = this.flashGood ? '#fff6a0' : '#c8d8ff';
      g.lineWidth = Math.max(3, s.size * 0.012);
      g.beginPath();
      g.moveTo(cx, cy);
      let x = cx;
      for (let y = cy; y < s.y + s.size; y += s.size * 0.08) {
        x += (Math.sin(y * 13.1 + this.flashAt * 50) * 0.5) * s.size * 0.08;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    // The cloud.
    g.fillStyle = '#4a4a6a';
    for (const [du, dv, r] of [
      [-0.08, 0.01, 0.07],
      [0.0, -0.03, 0.09],
      [0.09, 0.01, 0.07],
      [0.0, 0.04, 0.08],
    ]) {
      g.beginPath();
      g.arc(cx + du * s.size, cy + dv * s.size, r * s.size, 0, Math.PI * 2);
      g.fill();
    }
    // The target ring, and a ring closing in for each hit to come.
    g.strokeStyle = GOLD;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, TARGET * s.size * 1.6, 0, Math.PI * 2);
    g.stroke();
    sim.game.hits.forEach((h, i) => {
      const ahead = h - t;
      const state = sim.judged[i];
      if (state === 'good' || state === 'ok' || ahead > OVERTURE_APPROACH || ahead < -0.25) return;
      const r = (TARGET * 1.6 + Math.max(0, ahead / OVERTURE_APPROACH) * 0.26) * s.size;
      g.strokeStyle = state === 'miss' ? 'rgba(255, 90, 90, 0.5)' : `rgba(255, 246, 208, ${0.35 + 0.65 * (1 - ahead / OVERTURE_APPROACH)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    });
    // The bars gone by.
    const first = sim.game.hits[0] ?? 0;
    const share = Math.min(1, Math.max(0, (t - first) / (sim.game.length - first)));
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(s.x + s.size * 0.1, s.y + s.size * 0.92, s.size * 0.8, s.size * 0.025);
    g.fillStyle = CREAM;
    g.fillRect(s.x + s.size * 0.1, s.y + s.size * 0.92, s.size * 0.8 * share, s.size * 0.025);
    s.status(t < first ? 'Count in...' : `${sim.landed} struck${sim.strays ? ` · ${sim.strays} stray` : ''}`);
  }
}
