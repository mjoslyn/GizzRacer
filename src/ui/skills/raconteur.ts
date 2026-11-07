import { EchoSim, makeEcho, type CardSound } from '../../core/cardSkills';
import { CREAM, GOLD, SimGame, marks, panel, say, type Stage, type Synth } from './kit';

const PRESS = new Set(['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** A minor pentatonic: the ostinato's notes. */
const SCALE = [220, 261.63, 293.66, 329.63, 392];

/**
 * The Reticent Raconteur: from his hiding place in the quagmire the teller
 * taps out his secret, a little longer each time; tap it back in time.
 */
export class RaconteurGame extends SimGame<EchoSim> {
  /** When the teller's drum and your own last sounded (the sim's round clock), for their glow. */
  private tellerAt = -9;
  private youAt = -9;

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new EchoSim(makeEcho(seed, level, length)));
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && PRESS.has(code)) this.sim.tap();
  }

  tap(): void {
    this.sim.tap();
  }

  protected sound(x: CardSound): void {
    if (x.s === 'teller') {
      this.tellerAt = this.sim.clock;
      this.synth.note(SCALE[x.n ?? 0], 0.3, 'triangle', 0.16);
    } else if (x.s === 'tap') {
      this.youAt = this.sim.clock;
      this.synth.note(SCALE[x.n ?? 0] * 2, 0.25, 'triangle', 0.14);
    } else if (x.s === 'turn') this.synth.note(1200, 0.05, 'square', 0.05);
    else if (x.s === 'good') this.synth.note(784, 0.35, 'sine', 0.12);
    else this.synth.thud();
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    // The quagmire.
    g.fillStyle = '#2a3a22';
    g.fillRect(s.x + 3, s.y + k * 0.62, k - 6, k * 0.38 - 3);
    // The teller, on the right, his drum glowing as he plays.
    const glow = Math.max(0, 1 - (sim.clock - this.tellerAt) / 0.25);
    const tx = s.x + k * 0.72;
    const ty = s.y + k * 0.5;
    g.fillStyle = '#6a4a8a';
    g.beginPath();
    g.arc(tx, ty - k * 0.11, k * 0.04, 0, Math.PI * 2);
    g.fill();
    g.fillRect(tx - k * 0.04, ty - k * 0.07, k * 0.08, k * 0.14);
    g.fillStyle = `rgba(255, 210, 58, ${0.4 + glow * 0.6})`;
    g.beginPath();
    g.ellipse(tx + k * 0.08, ty + k * 0.06, k * 0.06, k * 0.025, 0, 0, Math.PI * 2);
    g.fill();
    // You, peering from the reeds on the left.
    g.strokeStyle = '#5a7a3a';
    g.lineWidth = Math.max(2, k * 0.008);
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = s.x + k * (0.08 + i * 0.03);
      g.moveTo(x, s.y + k * 0.66);
      g.lineTo(x + Math.sin(i * 2.3) * k * 0.02, s.y + k * (0.38 + (i % 3) * 0.04));
    }
    g.stroke();
    const you = Math.max(0, 1 - (sim.clock - this.youAt) / 0.25);
    g.fillStyle = sim.phase === 'echo' ? `rgb(255, ${210 + you * 45}, ${58 + you * 190})` : CREAM;
    for (const dx of [0, 0.035]) {
      g.beginPath();
      g.arc(s.x + k * (0.17 + dx), s.y + k * 0.5, k * 0.012, 0, Math.PI * 2);
      g.fill();
    }
    // The rhythm: the teller's notes along a line, your taps under them.
    const o = sim.offsets;
    const span = o[o.length - 1] || 1;
    const X = (sec: number) => s.x + k * (0.12 + (sec / span) * 0.76);
    const lineY = s.y + k * 0.78;
    g.strokeStyle = 'rgba(255, 246, 208, 0.3)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(0) - 10, lineY);
    g.lineTo(X(span) + 10, lineY);
    g.stroke();
    o.forEach((sec, i) => {
      const heard = sim.phase !== 'listen' || i < sim.played;
      g.fillStyle = heard ? GOLD : 'rgba(255, 210, 58, 0.2)';
      g.beginPath();
      g.arc(X(sec), lineY, k * 0.022, 0, Math.PI * 2);
      g.fill();
    });
    if (sim.taps.length) {
      const t0 = sim.taps[0];
      sim.taps.forEach((tp, i) => {
        const off = Math.abs(tp - t0 - (o[i] ?? Infinity)) <= sim.game.tolerance;
        g.fillStyle = off ? '#9ad83a' : '#ff5a5a';
        g.fillRect(X(tp - t0) - k * 0.008, lineY + k * 0.04, k * 0.016, k * 0.06);
      });
    }
    const last = sim.marks[sim.marks.length - 1];
    const head = sim.phase === 'listen' ? 'LISTEN' : sim.phase === 'echo' ? 'YOUR TURN: TAP IT BACK' : last ? 'IN TIME' : 'OFF THE STORY';
    say(s, head, 0.5, 0.15, 0.065, sim.phase === 'judge' && !last ? '#ff5a5a' : sim.phase === 'echo' ? GOLD : CREAM);
    say(s, `${o.length} notes`, 0.5, 0.24, 0.04, 'rgba(255,246,208,0.7)', 'center', false);
    marks(s, sim.marks.slice(-10), Math.min(10, sim.marks.length + 1), 0.5, 0.94);
    s.status(`Telling ${sim.round + 1} · ${sim.right} of ${sim.marks.length} echoed, ${Math.round(sim.game.share * 100)}% needed · ${Math.max(0, Math.ceil(sim.game.length - sim.t))} s`);
  }
}
