import { SatSim, makeSats, pct, type CardSound } from '../../core/cardSkills';
import { CREAM, GOLD, SimGame, panel, say, type Stage, type Synth } from './kit';

/** The satellites' orbit: its middle and radius (shares of the stage). */
const OU = 0.5;
const OV = 0.52;
const OR = 0.32;

/**
 * Welcome to an Altered Future: digitised satellites fade toward digital
 * black, faster as the world goes dark; light them back up, one by one.
 */
export class AlteredFutureGame extends SimGame<SatSim> {
  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new SatSim(makeSats(seed, level, length)));
  }

  /** Where satellite `i` sits on the orbit, as shares of the stage. */
  private at(i: number): [number, number] {
    const n = this.sim.light.length;
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [OU + Math.cos(a) * OR, OV + Math.sin(a) * OR];
  }

  key(code: string, repeat: boolean): void {
    if (repeat) return;
    const sim = this.sim;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) sim.charge(Number(m[1]) - 1);
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') sim.move(-1);
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS') sim.move(1);
    else if (code === 'Space' || code === 'Enter') sim.charge();
  }

  tap(u: number, v: number): void {
    let best = -1;
    let bestD = 0.15;
    this.sim.light.forEach((_, i) => {
      const [x, y] = this.at(i);
      const d = Math.hypot(x - u, y - v);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) this.sim.charge(best);
  }

  protected sound(x: CardSound): void {
    if (x.s === 'charge') this.synth.note(440 * 2 ** ((x.n ?? 0) / 5), 0.2, 'square', 0.06);
    else if (x.s === 'black') this.synth.note(55, 0.8, 'sawtooth', 0.12);
    else this.synth.thud();
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    // The world fading to black: a grid of digital light going out.
    g.fillStyle = `rgba(0, 0, 0, ${0.2 + sim.gloom * 0.6})`;
    g.fillRect(s.x + 3, s.y + 3, k - 6, k - 6);
    g.strokeStyle = `rgba(90, 255, 200, ${0.15 * (1 - sim.gloom)})`;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 10; i++) {
      g.moveTo(X(i / 10), s.y + 3);
      g.lineTo(X(i / 10), s.y + k - 3);
      g.moveTo(s.x + 3, Y(i / 10));
      g.lineTo(s.x + k - 3, Y(i / 10));
    }
    g.stroke();
    // The unremembered god in the middle: an eye, closing as it darkens.
    g.fillStyle = `rgba(255, 246, 208, ${0.5 * (1 - sim.gloom)})`;
    g.beginPath();
    g.ellipse(X(OU), Y(OV), k * 0.08, k * 0.04 * (1 - sim.gloom * 0.8), 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 246, 208, 0.2)';
    g.beginPath();
    g.arc(X(OU), Y(OV), k * OR, 0, Math.PI * 2);
    g.stroke();
    sim.light.forEach((l, i) => {
      const [u, v] = this.at(i);
      const px = X(u);
      const py = Y(v);
      const dead = l <= 0;
      const low = !dead && l < 0.3 && Math.floor(t * 6) % 2 === 0;
      if (!dead) {
        g.fillStyle = `rgba(90, 255, 200, ${l * 0.45})`;
        g.beginPath();
        g.arc(px, py, k * (0.04 + l * 0.05), 0, Math.PI * 2);
        g.fill();
      }
      // Body and panels.
      g.fillStyle = dead ? '#111' : low ? '#ff5a5a' : `rgb(${Math.round(60 + 160 * l)}, ${Math.round(80 + 175 * l)}, ${Math.round(90 + 150 * l)})`;
      g.fillRect(px - k * 0.025, py - k * 0.025, k * 0.05, k * 0.05);
      g.fillStyle = dead ? '#111' : '#3a6aaa';
      g.fillRect(px - k * 0.07, py - k * 0.012, k * 0.04, k * 0.024);
      g.fillRect(px + k * 0.03, py - k * 0.012, k * 0.04, k * 0.024);
      // Its charge, under it, and its key.
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(px - k * 0.05, py + k * 0.045, k * 0.1, k * 0.015);
      g.fillStyle = l < 0.3 ? '#ff5a5a' : '#5affc8';
      g.fillRect(px - k * 0.05, py + k * 0.045, k * 0.1 * l, k * 0.015);
      say(s, dead ? 'BLACK' : `${i + 1}`, u, v - 0.065, 0.045, dead ? '#ff5a5a' : CREAM);
      if (i === sim.cursor) {
        g.strokeStyle = GOLD;
        g.lineWidth = 3;
        g.strokeRect(px - k * 0.085, py - k * 0.1, k * 0.17, k * 0.17);
      }
    });
    const left = Math.max(0, Math.ceil(sim.game.length - sim.t));
    say(s, `${left}`, 0.5, 0.08, 0.06, GOLD);
    say(s, `${pct(sim.kept)} lit / ${pct(sim.game.share)}`, 0.06, 0.08, 0.04, sim.kept >= sim.game.share ? CREAM : '#ff5a5a', 'left');
    s.status(`The sky ${pct(sim.kept)} lit so far, ${pct(sim.game.share)} needed · ${sim.lit} of ${sim.light.length} shining · ${left} s to go`);
  }
}
