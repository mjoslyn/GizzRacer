import { EMBER_CATCH, EMBER_FROM, EmberSim, makeEmbers, pct, type CardSound } from '../../core/cardSkills';
import { CREAM, GOLD, SimGame, clipStage, panel, say, type Stage, type Synth } from './kit';

/** Each lane's height (share down the stage). */
const LANE_V = [0.32, 0.52, 0.72];

/**
 * The Acrid Corpse: the Balrog's corpse smoulders and its crimson-orange
 * light drifts off to melt into the setting sun; move the jar up and down
 * to catch what you can of it before the moonless night.
 */
export class AcridCorpseGame extends SimGame<EmberSim> {
  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new EmberSim(makeEmbers(seed, level, length)));
  }

  key(code: string, repeat: boolean): void {
    if (repeat) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
    if (m) this.sim.lane = Number(m[1]) - 1;
    else if (code === 'ArrowUp' || code === 'KeyW') this.sim.move(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.sim.move(1);
  }

  tap(_u: number, v: number): void {
    // The lane nearest the tap.
    let best = 0;
    LANE_V.forEach((lv, i) => {
      if (Math.abs(lv - v) < Math.abs(LANE_V[best] - v)) best = i;
    });
    this.sim.lane = best;
  }

  protected sound(x: CardSound): void {
    if (x.s === 'ember') this.synth.note(523.25 + ((x.n ?? 0) % 6) * 65, 0.18, 'triangle', 0.1);
    else if (x.s === 'final') {
      this.synth.note(1046.5, 0.6, 'triangle', 0.16);
      this.synth.rattle(0.2);
    } else this.synth.note(90, 0.3, 'sawtooth', 0.08);
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    const dusk = Math.min(1, sim.t / sim.game.end);
    clipStage(s);
    // The sky going from sunset to the moonless night.
    const sky = g.createLinearGradient(0, s.y, 0, s.y + k);
    sky.addColorStop(0, `rgb(${Math.round(120 - 100 * dusk)}, ${Math.round(50 - 40 * dusk)}, ${Math.round(80 - 50 * dusk)})`);
    sky.addColorStop(1, `rgb(${Math.round(240 - 200 * dusk)}, ${Math.round(120 - 105 * dusk)}, ${Math.round(40 - 20 * dusk)})`);
    g.fillStyle = sky;
    g.fillRect(s.x, s.y, k, k);
    // The sun, sinking on the right.
    const sunV = 0.3 + dusk * 0.72;
    g.fillStyle = '#ff7a2a';
    g.beginPath();
    g.arc(X(0.96), Y(sunV), k * 0.11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a0a10';
    g.fillRect(s.x, Y(0.88), k, k * 0.12);
    // The corpse, smouldering on the left.
    g.fillStyle = '#2a1010';
    g.beginPath();
    g.ellipse(X(EMBER_FROM), Y(0.6), k * 0.07, k * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255, 90, 30, ${0.4 + Math.sin(t * 4) * 0.2})`;
    for (const v of LANE_V) {
      g.beginPath();
      g.arc(X(EMBER_FROM + 0.03), Y(v), k * 0.015, 0, Math.PI * 2);
      g.fill();
    }
    // The lanes, faint.
    g.strokeStyle = 'rgba(255, 246, 208, 0.1)';
    g.lineWidth = 1;
    for (const v of LANE_V) {
      g.beginPath();
      g.moveTo(X(0.15), Y(v));
      g.lineTo(X(1), Y(v));
      g.stroke();
    }
    // The embers, smoke and the final clap of light, drifting right.
    sim.game.items.forEach((it, i) => {
      const fate = sim.fate[i];
      if (fate === 'caught') return;
      const u = sim.xOf(it);
      if (u < EMBER_FROM || u > 1.05) return;
      const fade = fate === 'gone' ? Math.max(0, 1 - (u - EMBER_CATCH) / 0.2) : 1;
      const px = X(u);
      const py = Y(LANE_V[it.lane]) + Math.sin(t * 3 + i) * k * 0.01;
      g.globalAlpha = fade;
      if (it.kind === 'smoke') {
        g.fillStyle = '#222';
        for (const d of [-1, 0, 1]) {
          g.beginPath();
          g.arc(px + d * k * 0.02, py - Math.abs(d) * k * 0.006, k * 0.024, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        const r = it.kind === 'final' ? 0.04 : 0.022;
        g.fillStyle = it.kind === 'final' ? 'rgba(255, 255, 220, 0.35)' : 'rgba(255, 120, 40, 0.35)';
        g.beginPath();
        g.arc(px, py, k * r * 1.8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = it.kind === 'final' ? '#fffbe0' : '#ff5a1a';
        g.beginPath();
        g.arc(px, py, k * r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    });
    // The jar.
    const jy = Y(LANE_V[sim.lane]);
    const jx = X(EMBER_CATCH);
    const glow = Math.min(1, sim.light / sim.game.need);
    g.fillStyle = `rgba(255, 140, 50, ${0.15 + glow * 0.5})`;
    g.fillRect(jx - k * 0.035, jy - k * 0.045, k * 0.07, k * 0.09);
    g.strokeStyle = CREAM;
    g.lineWidth = 3;
    g.strokeRect(jx - k * 0.035, jy - k * 0.045, k * 0.07, k * 0.09);
    g.restore();
    say(s, `${pct(sim.light / sim.game.total)} / ${pct(sim.game.share)}`, 0.06, 0.07, 0.055, GOLD, 'left');
    s.status(`${pct(sim.light / sim.game.total)} of the light caught, ${pct(sim.game.share)} needed · the sun is ${dusk < 0.5 ? 'setting' : dusk < 0.85 ? 'going' : 'nearly gone'}`);
  }
}
