import { MUNT_CLAW, MUNT_COOL, MUNT_NAMES, MUNT_PARTS, MUNT_REACH, MUNT_SPACING, MuntSim, makeMunt, type CardSound, type MuntPart } from '../../core/cardSkills';
import { CREAM, GOLD, SimGame, clipStage, panel, say, type Stage, type Synth } from './kit';

const GRAB = new Set(['Space', 'Enter', 'ArrowDown', 'KeyS']);
const COLORS: Record<MuntPart, string> = { steel: '#a8b4c0', soy: '#e8d49a', tube: '#7ad8ff', vat: '#b07ae8' };
/** The belt's height (share down the stage). */
const BELT = 0.74;

/**
 * Soy-Protein Munt Machine: parts ride the belt under the claw; grab them
 * in order, steel, soy-protein, test tube, vat, and the machine is born.
 */
export class MuntMachineGame extends SimGame<MuntSim> {
  /** When the claw last came down, and on what (for its drop and a flash). */
  private grabAt = -9;
  private grabbed: 'fit' | 'wrong' | 'empty' = 'empty';
  private bornAt = -9;

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new MuntSim(makeMunt(seed, level, length)));
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && GRAB.has(code)) this.sim.grab();
  }

  tap(): void {
    this.sim.grab();
  }

  protected sound(x: CardSound): void {
    if (x.s === 'fit' || x.s === 'wrong' || x.s === 'empty') {
      this.grabAt = this.sim.t;
      this.grabbed = x.s;
    }
    if (x.s === 'fit') this.synth.note(261.63 * 2 ** ((x.n ?? 0) / 4), 0.2, 'square', 0.1);
    else if (x.s === 'wrong') this.synth.thud();
    else if (x.s === 'born') {
      this.bornAt = this.sim.t;
      this.synth.note(130.81, 0.6, 'sawtooth', 0.12);
      this.synth.note(523.25, 0.6, 'triangle', 0.1);
    } else this.synth.note(1400, 0.04, 'square', 0.04);
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    // The machine being built: four slots, the parts in, the next lit.
    MUNT_PARTS.forEach((p, i) => {
      const u = 0.17 + i * 0.22;
      const done = i < sim.parts;
      const next = i === sim.parts;
      g.fillStyle = done ? COLORS[p] : 'rgba(255,255,255,0.06)';
      g.fillRect(X(u - 0.09), Y(0.07), k * 0.18, k * 0.16);
      g.strokeStyle = next ? GOLD : 'rgba(255,246,208,0.3)';
      g.lineWidth = next ? 4 : 2;
      g.strokeRect(X(u - 0.09), Y(0.07), k * 0.18, k * 0.16);
      if (!done) this.part(s, p, u, 0.14, 0.6, next ? 1 : 0.35);
      say(s, MUNT_NAMES[p], u, 0.27, 0.036, next ? GOLD : 'rgba(255,246,208,0.7)', 'center', next);
    });
    if (sim.t - this.bornAt < 1) say(s, 'BORN FROM A TEST TUBE, INTO A VAT', 0.5, 0.36, 0.04, GOLD);
    else say(s, `Next: ${MUNT_NAMES[sim.needed]}`, 0.5, 0.36, 0.05, CREAM);
    clipStage(s);
    // The belt.
    g.fillStyle = '#2a2a30';
    g.fillRect(s.x, Y(BELT + 0.05), k, k * 0.05);
    g.strokeStyle = '#555';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const u = (((i / 12 + sim.run) % 1) + 1) % 1;
      g.beginPath();
      g.moveTo(X(u), Y(BELT + 0.05));
      g.lineTo(X(u), Y(BELT + 0.1));
      g.stroke();
    }
    // Where the claw reaches.
    g.strokeStyle = 'rgba(255, 210, 58, 0.6)';
    g.lineWidth = 2;
    g.strokeRect(X(MUNT_CLAW - MUNT_REACH), Y(BELT - 0.07), k * MUNT_REACH * 2, k * 0.12);
    // The parts on the belt.
    const near = Math.floor((sim.run + 0.1) / MUNT_SPACING);
    for (let i = Math.max(0, near - 7); i <= near; i++) {
      const u = sim.xOf(i);
      if (u < -0.1 || u > 1.1 || sim.taken.has(i)) continue;
      this.part(s, sim.game.belt[i], u, BELT, 1, 1);
      say(s, MUNT_NAMES[sim.game.belt[i]], u, BELT + 0.15, 0.033, CREAM, 'center', false);
    }
    // The claw, dropping as it grabs.
    const since = sim.t - this.grabAt;
    const drop = since < MUNT_COOL ? Math.sin((since / MUNT_COOL) * Math.PI) : 0;
    const clawV = 0.45 + drop * (BELT - 0.5);
    g.strokeStyle = this.grabbed === 'wrong' && since < 0.6 ? '#ff5a5a' : CREAM;
    g.lineWidth = Math.max(3, k * 0.01);
    g.beginPath();
    g.moveTo(X(MUNT_CLAW), Y(0.4));
    g.lineTo(X(MUNT_CLAW), Y(clawV));
    g.moveTo(X(MUNT_CLAW - 0.04), Y(clawV + 0.04));
    g.lineTo(X(MUNT_CLAW - 0.04), Y(clawV));
    g.lineTo(X(MUNT_CLAW + 0.04), Y(clawV));
    g.lineTo(X(MUNT_CLAW + 0.04), Y(clawV + 0.04));
    g.stroke();
    g.restore();
    // Machines built and wrong parts.
    say(s, `Machines ${sim.built} / ${sim.game.machines}`, 0.05, 0.46, 0.04, GOLD, 'left');
    say(s, `${'X '.repeat(sim.strikes)}${'- '.repeat(Math.max(0, sim.game.strikes - sim.strikes))}`.trim(), 0.95, 0.46, 0.04, '#ff5a5a', 'right');
    s.status(`Grab the ${MUNT_NAMES[sim.needed].toLowerCase()} · ${Math.max(0, Math.ceil(sim.game.length - sim.t))} s left`);
  }

  /** A part's picture at (u, v), `size` of its full size. */
  private part(s: Stage, p: MuntPart, u: number, v: number, size: number, alpha: number): void {
    const g = s.g;
    const k = s.size * size;
    const x = s.x + u * s.size;
    const y = s.y + v * s.size;
    g.globalAlpha = alpha;
    g.fillStyle = COLORS[p];
    if (p === 'steel') {
      // An I-beam.
      g.fillRect(x - k * 0.05, y - k * 0.04, k * 0.1, k * 0.018);
      g.fillRect(x - k * 0.05, y + k * 0.022, k * 0.1, k * 0.018);
      g.fillRect(x - k * 0.012, y - k * 0.04, k * 0.024, k * 0.08);
    } else if (p === 'soy') {
      // A lump of soy-protein.
      g.beginPath();
      g.ellipse(x, y, k * 0.05, k * 0.035, 0.3, 0, Math.PI * 2);
      g.fill();
    } else if (p === 'tube') {
      // A test tube, half full.
      g.strokeStyle = COLORS.tube;
      g.lineWidth = Math.max(2, k * 0.008);
      g.strokeRect(x - k * 0.014, y - k * 0.05, k * 0.028, k * 0.09);
      g.fillStyle = '#7aff9a';
      g.fillRect(x - k * 0.014, y, k * 0.028, k * 0.04);
    } else {
      // A vat.
      g.beginPath();
      g.moveTo(x - k * 0.06, y - k * 0.035);
      g.lineTo(x + k * 0.06, y - k * 0.035);
      g.lineTo(x + k * 0.045, y + k * 0.04);
      g.lineTo(x - k * 0.045, y + k * 0.04);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }
}
