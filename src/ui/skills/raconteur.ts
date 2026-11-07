import { HIDE_LOOK, HIDE_WARN, HIDE_X, HideSim, beamEnters, beamLead, makeHide, type CardSound, type HideBeam } from '../../core/cardSkills';
import { seededRandom } from '../../core/math';
import { CREAM, GOLD, SimGame, clipStage, panel, say, type Stage, type Synth } from './kit';

const DUCK = new Set(['Space', 'Enter', 'ArrowDown', 'KeyS']);
/** The horizon, the top of the quagmire, where you hide, and the bottom of the marsh (shares down the stage). */
const HORIZON = 0.44;
const MARSH = 0.5;
const YOU_V = 0.76;
const FLOOR = 0.89;
/** The lightning lord and the Balrog, far off on the battlefield, and where the battle flares between them. */
const LORD = { u: 0.17, v: 0.29 };
const BALROG = { u: 0.83, v: 0.27 };
const FLARE = { u: 0.5, v: 0.2 };
const COLOR = { light: '#bfe8ff', fire: '#ff7a1a' };
const CAPTION = { light: 'death become of light', fire: 'life become of fire' };

/**
 * The Reticent Raconteur: "I saw it from my hiding place within the
 * quagmire". Beams of lightning and the Balrog's fire sweep the marsh,
 * an arrow at the edge warning of each: hold to duck under the mud as one
 * passes, let go to come up for air and to glimpse the battle as it flares.
 * Nothing in it needs to be heard.
 */
export class RaconteurGame extends SimGame<HideSim> {
  /** When each flare was glimpsed (the sim's clock), for its flash. */
  private readonly gotAt: number[];
  private readonly reeds: { u: number; h: number; lean: number }[];

  constructor(synth: Synth, seed: number, level: number, length?: number) {
    super(synth, new HideSim(makeHide(seed, level, length)));
    this.gotAt = this.sim.game.flares.map(() => -9);
    const rand = seededRandom(seed + 11);
    this.reeds = Array.from({ length: 34 }, (_, i) => ({ u: 0.02 + (i / 33) * 0.96 + (rand() - 0.5) * 0.02, h: 0.08 + rand() * 0.09, lean: (rand() - 0.5) * 0.04 }));
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && DUCK.has(code)) this.sim.holding = true;
  }

  keyUp(code: string): void {
    if (DUCK.has(code)) this.sim.holding = false;
  }

  tap(): void {
    this.sim.holding = true;
  }

  release(): void {
    this.sim.holding = false;
  }

  protected sound(x: CardSound): void {
    if (x.s === 'down') this.synth.note(110, 0.2, 'sine', 0.1);
    else if (x.s === 'up') this.synth.note(330, 0.12, 'triangle', 0.06);
    else if (x.s === 'warn') this.synth.note(1200, 0.05, 'square', 0.04);
    else if (x.s === 'glimpse') this.synth.note(659.25 + ((x.n ?? 0) % 4) * 98, 0.3, 'triangle', 0.12);
    else {
      this.synth.rattle(0.2);
      this.synth.thud();
    }
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const sim = this.sim;
    const game = sim.game;
    const k = s.size;
    const now = sim.t;
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    sim.got.forEach((got, i) => {
      if (got && this.gotAt[i] < 0) this.gotAt[i] = now;
    });
    clipStage(s);
    // The storm over the battlefield.
    const sky = g.createLinearGradient(0, Y(0), 0, Y(HORIZON));
    sky.addColorStop(0, '#140a26');
    sky.addColorStop(1, '#3a1a3a');
    g.fillStyle = sky;
    g.fillRect(X(0), Y(0), k, HORIZON * k);
    // The hills, the lord on his and the Balrog on its.
    g.fillStyle = '#1a1020';
    g.beginPath();
    g.moveTo(X(0), Y(HORIZON));
    g.quadraticCurveTo(X(0.17), Y(0.3), X(0.36), Y(HORIZON));
    g.quadraticCurveTo(X(0.5), Y(0.4), X(0.64), Y(HORIZON));
    g.quadraticCurveTo(X(0.83), Y(0.3), X(1), Y(HORIZON));
    g.closePath();
    g.fill();
    this.lord(s, t);
    this.balrog(s, t);
    // The quagmire.
    const mud = g.createLinearGradient(0, Y(HORIZON), 0, Y(1));
    mud.addColorStop(0, '#2c3420');
    mud.addColorStop(1, '#1a1c10');
    g.fillStyle = mud;
    g.fillRect(X(0), Y(HORIZON), k, (1 - HORIZON) * k);
    g.fillStyle = 'rgba(90, 110, 70, 0.25)';
    for (const [u, v, w] of [
      [0.2, 0.6, 0.12],
      [0.75, 0.66, 0.1],
      [0.35, 0.84, 0.14],
      [0.82, 0.82, 0.08],
    ]) {
      g.beginPath();
      g.ellipse(X(u), Y(v), w * k, w * k * 0.18, 0, 0, Math.PI * 2);
      g.fill();
    }
    // The reeds behind you.
    this.reedRow(s, t, (r) => Math.abs(r.u - HIDE_X) > 0.07, MARSH + 0.12);
    // The flares of the battle, their rings closing.
    this.flares(s, t);
    // The beams sweeping the quagmire, and the warnings of those to come.
    for (const b of game.beams) this.beam(s, b, now);
    this.warnings(s, now, t);
    // You, up among the reeds or under the mud.
    this.you(s, t);
    this.reedRow(s, t, (r) => Math.abs(r.u - HIDE_X) <= 0.07, YOU_V + 0.04);
    // Under: the world through the murk.
    if (sim.under) {
      g.fillStyle = 'rgba(40, 30, 10, 0.22)';
      g.fillRect(X(0), Y(0), k, k);
    }
    // The cue over your head.
    const coming = game.beams.find((b) => b.at - now > -b.dur && b.at - now < 0.75);
    if (!sim.under && sim.gasp > 0) say(s, 'GASPING!', HIDE_X, YOU_V - 0.13, 0.05, '#ff5a5a');
    else if (!sim.under && coming) say(s, 'DUCK!', HIDE_X, YOU_V - 0.13, 0.06, '#ff5a5a');
    else if (sim.under && sim.air < 0.35) say(s, 'AIR!', HIDE_X, YOU_V - 0.13, 0.055, Math.floor(t * 6) % 2 ? '#ff5a5a' : CREAM);
    // The air left.
    g.fillStyle = 'rgba(10, 8, 4, 0.75)';
    g.fillRect(X(0), Y(FLOOR), k, (1 - FLOOR) * k);
    g.restore();
    const low = sim.air < 0.35;
    say(s, 'AIR', 0.04, 0.945, 0.035, low ? '#ff5a5a' : CREAM, 'left');
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(X(0.2), Y(0.928), k * 0.5, k * 0.034);
    g.fillStyle = low ? '#ff5a5a' : sim.under ? '#5ac8ff' : '#9ad8ff';
    g.fillRect(X(0.2), Y(0.928), k * 0.5 * sim.air, k * 0.034);
    say(s, sim.gasp > 0 ? 'GASPING' : sim.under ? 'UNDER' : 'UP', 0.96, 0.945, 0.035, sim.gasp > 0 ? '#ff5a5a' : sim.under ? '#5ac8ff' : GOLD, 'right');
    // Seen so far, of the times you can be: the eyes after the word, however wide it came out.
    say(s, 'SEEN', 0.04, 0.05, 0.035, CREAM, 'left');
    const after = (g.measureText('SEEN').width + 6) / k + 0.04;
    for (let i = 0; i < game.lives; i++) this.eye(s, after + 0.03 + i * 0.065, 0.05, i < sim.seen);
    // Flares glimpsed, of those so far.
    say(s, sim.past ? `${sim.glimpsed} / ${sim.past} glimpsed` : 'watch the battle', 0.96, 0.05, 0.035, GOLD, 'right');
    const need = Math.round(game.share * 100);
    s.status(`${sim.gasp > 0 ? 'Gasping for air' : sim.under ? `Under the mud, ${Math.round(sim.air * 100)}% air` : 'Up in the reeds'} · ${sim.glimpsed} of ${sim.past} flares glimpsed, ${need}% needed · seen ${sim.seen} of ${game.lives} · ${Math.max(0, Math.ceil(game.length - now))} s`);
  }

  /** The lightning lord on his hill, crowned in light. */
  private lord(s: Stage, t: number): void {
    const g = s.g;
    const k = s.size;
    const x = s.x + LORD.u * k;
    const y = s.y + LORD.v * k;
    g.fillStyle = `rgba(190, 232, 255, ${0.2 + Math.sin(t * 7) * 0.08})`;
    g.beginPath();
    g.arc(x, y - k * 0.06, k * 0.06, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0c0a18';
    g.beginPath();
    g.moveTo(x - k * 0.035, y + k * 0.05);
    g.lineTo(x, y - k * 0.06);
    g.lineTo(x + k * 0.035, y + k * 0.05);
    g.fill();
    g.beginPath();
    g.arc(x, y - k * 0.07, k * 0.018, 0, Math.PI * 2);
    g.fill();
    // His staff, crackling.
    g.strokeStyle = COLOR.light;
    g.lineWidth = Math.max(1.5, k * 0.006);
    g.beginPath();
    g.moveTo(x + k * 0.03, y + k * 0.05);
    g.lineTo(x + k * 0.05, y - k * 0.1);
    g.stroke();
  }

  /** The Balrog on its hill: horns, wings, burning eyes. */
  private balrog(s: Stage, t: number): void {
    const g = s.g;
    const k = s.size;
    const x = s.x + BALROG.u * k;
    const y = s.y + BALROG.v * k;
    g.fillStyle = `rgba(255, 110, 30, ${0.22 + Math.sin(t * 5) * 0.08})`;
    g.beginPath();
    g.arc(x, y, k * 0.08, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a0606';
    g.beginPath();
    // Wings.
    g.moveTo(x, y - k * 0.02);
    g.lineTo(x - k * 0.1, y - k * 0.07);
    g.lineTo(x - k * 0.06, y + k * 0.02);
    g.lineTo(x, y + k * 0.06);
    g.lineTo(x + k * 0.06, y + k * 0.02);
    g.lineTo(x + k * 0.1, y - k * 0.07);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(x, y - k * 0.04, k * 0.025, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1a0606';
    g.lineWidth = Math.max(1.5, k * 0.008);
    g.beginPath();
    g.moveTo(x - k * 0.015, y - k * 0.06);
    g.lineTo(x - k * 0.03, y - k * 0.09);
    g.moveTo(x + k * 0.015, y - k * 0.06);
    g.lineTo(x + k * 0.03, y - k * 0.09);
    g.stroke();
    g.fillStyle = COLOR.fire;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.arc(x + d * k * 0.009, y - k * 0.043, k * 0.005, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** A row of reeds: those `which` picks, their feet at `foot`. */
  private reedRow(s: Stage, t: number, which: (r: { u: number }) => boolean, foot: number): void {
    const g = s.g;
    const k = s.size;
    g.strokeStyle = '#5a7a3a';
    g.lineWidth = Math.max(1.5, k * 0.006);
    g.beginPath();
    for (const r of this.reeds) {
      if (!which(r)) continue;
      const sway = Math.sin(t * 1.3 + r.u * 9) * k * 0.006;
      const base = s.y + (foot + (Math.abs(r.u - HIDE_X) <= 0.07 ? 0 : (r.u * 7) % 0.1)) * k;
      g.moveTo(s.x + r.u * k, base);
      g.lineTo(s.x + (r.u + r.lean) * k + sway, base - r.h * k);
    }
    g.stroke();
  }

  /** The battle flaring between the two, a ring closing on it before; what you saw when you saw it. */
  private flares(s: Stage, t: number): void {
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const now = sim.t;
    const cx = s.x + FLARE.u * k;
    const cy = s.y + FLARE.v * k;
    sim.game.flares.forEach((f, i) => {
      const got = sim.got[i];
      const since = now - this.gotAt[i];
      if (got && since < 1.4) {
        // What you saw: the lord's bolt into the Balrog, or its fire back at him.
        const a = Math.max(0, 1 - since / 1.4);
        g.globalAlpha = a;
        if (f.kind === 'light') {
          g.strokeStyle = '#f4fbff';
          g.lineWidth = Math.max(2, k * 0.01);
          g.beginPath();
          for (let j = 0; j <= 8; j++) {
            const p = j / 8;
            const px = s.x + (LORD.u + 0.05 + (BALROG.u - LORD.u - 0.05) * p) * k;
            const py = s.y + (LORD.v - 0.1 + (BALROG.v - LORD.v + 0.1) * p) * k + (j % 2 ? -1 : 1) * (j && j < 8 ? k * 0.025 : 0);
            if (j) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          g.stroke();
        } else {
          for (let j = 0; j < 9; j++) {
            const p = j / 8;
            g.fillStyle = j % 2 ? '#ffd23a' : COLOR.fire;
            g.beginPath();
            g.arc(s.x + (BALROG.u - 0.04 - (BALROG.u - LORD.u - 0.08) * p) * k, s.y + (BALROG.v - 0.03 + Math.sin(p * Math.PI) * -0.05) * k, k * (0.03 - p * 0.012), 0, Math.PI * 2);
            g.fill();
          }
        }
        g.globalAlpha = 1;
        say(s, `I saw ${CAPTION[f.kind]}`, 0.5, 0.38, 0.04, f.kind === 'light' ? COLOR.light : '#ffb05a', 'center', false);
        return;
      }
      if (got) return;
      const to = f.at - f.w - now;
      if (to > HIDE_LOOK || now > f.at + f.w + 0.5) return;
      const col = f.kind === 'light' ? COLOR.light : COLOR.fire;
      if (now > f.at + f.w) {
        // Missed, under the mud.
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, k * 0.05, 0, Math.PI * 2);
        g.stroke();
        return;
      }
      const open = to <= 0;
      const r = open ? 0.05 : 0.05 + (to / HIDE_LOOK) * 0.13;
      g.strokeStyle = col;
      g.lineWidth = Math.max(2, k * (open ? 0.012 : 0.007));
      g.beginPath();
      g.arc(cx, cy, k * r, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = open ? col : 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(cx, cy, k * 0.05, 0, Math.PI * 2);
      g.fill();
      // An eye in it: look.
      g.fillStyle = '#140a26';
      g.beginPath();
      g.ellipse(cx, cy, k * 0.03, k * 0.016, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = open ? col : CREAM;
      g.beginPath();
      g.arc(cx, cy, k * 0.009, 0, Math.PI * 2);
      g.fill();
      if (open) say(s, 'LOOK!', 0.5, 0.31, 0.045, Math.floor(t * 6) % 2 ? GOLD : CREAM);
    });
  }

  /** A beam sweeping across: a cone from the sky down to its band on the quagmire, and the band itself. */
  private beam(s: Stage, b: HideBeam, now: number): void {
    const lead = beamLead(b, now);
    const trail = lead + b.from * b.dur * b.speed;
    const lo = Math.max(-0.05, Math.min(lead, trail));
    const hi = Math.min(1.05, Math.max(lead, trail));
    if (hi <= lo) return;
    const g = s.g;
    const k = s.size;
    const src = b.kind === 'light' ? LORD : BALROG;
    const col = COLOR[b.kind];
    const X = (u: number) => s.x + u * k;
    const Y = (v: number) => s.y + v * k;
    const over = now > b.at && now < b.at + b.dur;
    g.globalAlpha = 0.16;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(X(src.u), Y(src.v - 0.04));
    g.lineTo(X(lo), Y(MARSH));
    g.lineTo(X(hi), Y(MARSH));
    g.closePath();
    g.fill();
    g.globalAlpha = over ? 0.5 : 0.36;
    g.fillRect(X(lo), Y(MARSH), (hi - lo) * k, (FLOOR - MARSH) * k);
    g.globalAlpha = 1;
    // Its leading edge, bright, and chevrons showing which way it goes.
    g.strokeStyle = col;
    g.lineWidth = Math.max(2, k * 0.008);
    g.beginPath();
    g.moveTo(X(lead), Y(MARSH));
    g.lineTo(X(lead), Y(FLOOR));
    g.stroke();
    const d = -b.from;
    g.fillStyle = col;
    for (let i = 0; i < 3; i++) {
      const u = lead - d * (0.03 + i * 0.05);
      if (u < lo || u > hi) continue;
      const v = MARSH + 0.06;
      g.beginPath();
      g.moveTo(X(u + d * 0.015), Y(v));
      g.lineTo(X(u - d * 0.01), Y(v - 0.02));
      g.lineTo(X(u - d * 0.01), Y(v + 0.02));
      g.closePath();
      g.fill();
    }
  }

  /** An arrow at the edge each beam will come from, filling as it nears. */
  private warnings(s: Stage, now: number, t: number): void {
    const g = s.g;
    const k = s.size;
    for (const b of this.sim.game.beams) {
      const enter = beamEnters(b);
      const to = enter - now;
      if (to > HIDE_WARN || to < 0) continue;
      const fill = Math.min(1, 1 - to / HIDE_WARN);
      const d = -b.from;
      const u = b.from < 0 ? 0.065 : 0.935;
      const x = s.x + u * k;
      const y = s.y + YOU_V * k;
      const r = k * (0.035 + 0.008 * Math.sin(t * 12) * (to < 0.6 ? 1 : 0));
      g.fillStyle = 'rgba(10, 8, 4, 0.6)';
      g.beginPath();
      g.arc(x, y, r * 1.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = COLOR[b.kind];
      g.lineWidth = Math.max(2, k * 0.007);
      g.beginPath();
      g.arc(x, y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      g.stroke();
      g.fillStyle = COLOR[b.kind];
      g.beginPath();
      g.moveTo(x + d * r, y);
      g.lineTo(x - d * r * 0.6, y - r * 0.8);
      g.lineTo(x - d * r * 0.6, y + r * 0.8);
      g.closePath();
      g.fill();
    }
  }

  /** You: a hooded head and two eyes over the mud, or ripples and bubbles where you went under. */
  private you(s: Stage, t: number): void {
    const g = s.g;
    const sim = this.sim;
    const k = s.size;
    const x = s.x + HIDE_X * k;
    const y = s.y + YOU_V * k;
    g.strokeStyle = 'rgba(150, 170, 120, 0.5)';
    g.lineWidth = Math.max(1.5, k * 0.004);
    g.beginPath();
    g.ellipse(x, y, k * (sim.under ? 0.05 + Math.sin(t * 4) * 0.006 : 0.045), k * 0.012, 0, 0, Math.PI * 2);
    g.stroke();
    if (sim.under) {
      g.fillStyle = 'rgba(200, 220, 180, 0.6)';
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.8 + i / 3) % 1;
        g.beginPath();
        g.arc(x + Math.sin(i * 2.1 + t) * k * 0.015, y - p * k * 0.05, k * 0.006 * (1 - p * 0.5), 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    const seenNow = this.sim.game.beams.some((b, i) => this.sim.caught[i] && sim.t > b.at && sim.t < b.at + b.dur + 0.4);
    g.fillStyle = seenNow ? '#7a2020' : '#4a3a5e';
    g.beginPath();
    g.arc(x, y - k * 0.012, k * 0.043, Math.PI, 0);
    g.lineTo(x + k * 0.043, y);
    g.lineTo(x - k * 0.043, y);
    g.closePath();
    g.fill();
    g.fillStyle = sim.gasp > 0 ? '#ff9a9a' : CREAM;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.arc(x + d * k * 0.016, y - k * 0.018, k * 0.009, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** An eye: shut and faint while it hasn't seen you, open and red once it has. */
  private eye(s: Stage, u: number, v: number, open: boolean): void {
    const g = s.g;
    const k = s.size;
    const x = s.x + u * k;
    const y = s.y + v * k;
    g.strokeStyle = open ? '#ff5a5a' : 'rgba(255,246,208,0.45)';
    g.lineWidth = Math.max(1.5, k * 0.005);
    g.beginPath();
    g.ellipse(x, y, k * 0.024, k * (open ? 0.013 : 0.004), 0, 0, Math.PI * 2);
    g.stroke();
    if (open) {
      g.fillStyle = '#ff5a5a';
      g.beginPath();
      g.arc(x, y, k * 0.007, 0, Math.PI * 2);
      g.fill();
    }
  }
}
