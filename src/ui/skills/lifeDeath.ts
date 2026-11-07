import { MIRROR_PICK, MirrorSim, makeMirror, type CardSound } from '../../core/cardSkills';
import { seededRandom } from '../../core/math';
import { CREAM, GOLD, SimGame, clipStage, marks, panel, say, type Stage, type Synth } from './kit';

/** Where the figures stand (share down the stage). */
const ROW = 0.52;

/**
 * Life / Death: are you you, or the copy? You, lit, among your copies in
 * the labyrinth; they swap places, then pick yourself out.
 */
export class LifeDeathGame extends SimGame<MirrorSim> {
  /** The labyrinth's walls, faint behind: [u0, v0, u1, v1]. */
  private readonly walls: number[][] = [];

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new MirrorSim(makeMirror(seed, level, length)));
    const rand = seededRandom(seed + 9);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        const u = 0.06 + i * 0.11;
        const v = 0.06 + j * 0.11;
        this.walls.push(rand() < 0.5 ? [u, v, u + 0.11, v] : [u, v, u, v + 0.11]);
      }
  }

  key(code: string, repeat: boolean): void {
    if (repeat) return;
    const sim = this.sim;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m && Number(m[1]) <= sim.game.figures) sim.choose(Number(m[1]) - 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') sim.move(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') sim.move(1);
    else if (code === 'Space' || code === 'Enter') sim.choose(sim.cursor);
  }

  tap(u: number, v: number): void {
    if (u < 0 || u > 1 || v < 0.2 || v > 0.9) return;
    this.sim.choose(Math.min(this.sim.game.figures - 1, Math.floor(u * this.sim.game.figures)));
  }

  protected sound(x: CardSound): void {
    if (x.s === 'swap') this.synth.note(330 + Math.random() * 60, 0.12, 'sine', 0.06);
    else if (x.s === 'good') this.synth.note(784, 0.35, 'triangle', 0.14);
    else this.synth.note(82, 0.5, 'sawtooth', 0.1);
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const n = sim.game.figures;
    clipStage(s);
    g.strokeStyle = 'rgba(255, 246, 208, 0.12)';
    g.lineWidth = Math.max(2, s.size * 0.008);
    g.beginPath();
    for (const [u0, v0, u1, v1] of this.walls) {
      g.moveTo(s.x + u0 * s.size, s.y + v0 * s.size);
      g.lineTo(s.x + u1 * s.size, s.y + v1 * s.size);
    }
    g.stroke();
    g.restore();
    const sw = sim.swapping;
    const ease = (p: number) => p * p * (3 - 2 * p);
    const slotU = (slot: number) => (slot + 0.5) / n;
    const lost = sim.phase === 'reveal' && !sim.marks[sim.marks.length - 1];
    for (let f = 0; f < n; f++) {
      let at = sim.slots[f];
      let lift = 0;
      if (sw && (at === sw.a || at === sw.b)) {
        const to = at === sw.a ? sw.b : sw.a;
        lift = Math.sin(sw.p * Math.PI) * 0.1 * (at === sw.a ? -1 : 1);
        at = at + (to - at) * ease(sw.p);
      }
      const you = f === 0;
      const showYou = you && (sim.phase === 'show' || sim.phase === 'reveal');
      // A copy picked for you turns to bone: return to the ground and ossify.
      const bone = sim.phase === 'reveal' && sim.picked === sim.slots[f] && !you;
      this.figure(s, slotU(at), ROW + lift, showYou ? GOLD : bone ? '#8a8a80' : CREAM, showYou);
      if (showYou) say(s, 'YOU', slotU(at), ROW - 0.17 + lift, 0.06, GOLD);
    }
    if (sim.phase === 'pick' || sim.phase === 'reveal') {
      g.strokeStyle = sim.phase === 'pick' || !lost ? GOLD : '#ff5a5a';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(s.x + slotU(sim.cursor) * s.size, s.y + (ROW + 0.15) * s.size, s.size * 0.09, s.size * 0.025, 0, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < n; i++) say(s, `${i + 1}`, slotU(i), ROW + 0.24, 0.05, 'rgba(255,246,208,0.7)');
    }
    const head = sim.phase === 'show' ? 'Are you you? Watch yourself' : sim.phase === 'shuffle' ? 'Or someone in between?' : sim.phase === 'pick' ? `Which one is you? ${Math.ceil(MIRROR_PICK - sim.clock)}` : lost ? 'Return to the ground and ossify' : 'You knew yourself';
    say(s, head, 0.5, 0.13, 0.055, lost ? '#ff9a9a' : CREAM);
    marks(s, sim.marks.slice(-10), Math.min(10, sim.marks.length + 1), 0.5, 0.93);
    s.status(`Round ${sim.round + 1} · ${sim.right} of ${sim.marks.length} right, ${Math.round(sim.game.share * 100)}% needed · ${Math.max(0, Math.ceil(sim.game.length - sim.t))} s`);
  }

  /** A figure in the labyrinth: head and robe, centred on (u, v). */
  private figure(s: Stage, u: number, v: number, color: string, glow: boolean): void {
    const g = s.g;
    const x = s.x + u * s.size;
    const y = s.y + v * s.size;
    const k = s.size;
    if (glow) {
      g.fillStyle = 'rgba(255, 210, 58, 0.25)';
      g.beginPath();
      g.arc(x, y, k * 0.12, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - k * 0.07, k * 0.035, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x - k * 0.02, y - k * 0.035);
    g.lineTo(x + k * 0.02, y - k * 0.035);
    g.lineTo(x + k * 0.05, y + k * 0.12);
    g.lineTo(x - k * 0.05, y + k * 0.12);
    g.closePath();
    g.fill();
  }
}
