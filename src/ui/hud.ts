import { DRIFT_TIERS, driftTier, type KartState } from '../physics/kart';

const TIER_NAMES = ['', 'BLUE', 'ORANGE', 'PURPLE'];
const TIER_COLORS = ['#fff2a8', 'var(--tier-1)', 'var(--tier-2)', 'var(--tier-3)'];
const MAX_CHARGE = DRIFT_TIERS[DRIFT_TIERS.length - 1];

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export interface HudData {
  kart: KartState;
  lap: number;
  totalLaps: number;
  raceTime: number;
  lapTimes: number[];
  racerName: string;
  engineClass: string;
  paused: boolean;
}

export class Hud {
  private readonly el = document.createElement('div');
  private readonly lap: HTMLElement;
  private readonly time: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly surface: HTMLElement;
  private readonly driftFill: HTMLElement;
  private readonly driftLabel: HTMLElement;
  private readonly racer: HTMLElement;
  private readonly pause: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el.className = 'hud';
    const ticks = DRIFT_TIERS.slice(0, -1)
      .map((t) => `<div class="hud-drift-tick" style="left:${(t / MAX_CHARGE) * 100}%"></div>`)
      .join('');
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap"></div>
        <div class="hud-time"></div>
        <div class="hud-laps"></div>
      </div>
      <div class="hud-tr"></div>
      <div class="hud-drift">
        <div class="hud-drift-bar"><div class="hud-drift-fill"></div>${ticks}</div>
        <div class="hud-drift-label"></div>
      </div>
      <div class="hud-br">
        <div class="hud-speed"></div>
        <div class="hud-surface"></div>
      </div>
      <div class="hud-help">
        W/S accel/brake &middot; A/D steer &middot; Shift/Space hop+drift &middot; Q look back &middot; Esc pause<br />
        1-6 racer &middot; C class &middot; R reset
      </div>
      <div class="hud-pause">PAUSED</div>`;
    parent.appendChild(this.el);
    const q = (sel: string) => this.el.querySelector<HTMLElement>(sel)!;
    this.lap = q('.hud-lap');
    this.time = q('.hud-time');
    this.laps = q('.hud-laps');
    this.speed = q('.hud-speed');
    this.surface = q('.hud-surface');
    this.driftFill = q('.hud-drift-fill');
    this.driftLabel = q('.hud-drift-label');
    this.racer = q('.hud-tr');
    this.pause = q('.hud-pause');
  }

  update(d: HudData): void {
    const k = d.kart;
    this.lap.textContent = d.lap >= d.totalLaps ? 'FINISH' : `LAP ${d.lap + 1}/${d.totalLaps}`;
    this.time.textContent = formatTime(d.raceTime);
    const best = d.lapTimes.length ? Math.min(...d.lapTimes) : 0;
    this.laps.innerHTML = d.lapTimes
      .map((t, i) => `L${i + 1} ${formatTime(t)}${t === best ? ' &#9733;' : ''}`)
      .join('<br />');
    this.speed.innerHTML = `${Math.round(Math.abs(k.speed) * 3.6)}<small>km/h</small>`;
    this.surface.innerHTML = k.boostTime > 0 ? '<span class="hud-boost">BOOST</span>' : k.surface;
    this.racer.innerHTML = `${d.racerName}<br />${d.engineClass}`;

    const drifting = k.driftDir !== 0;
    const tier = drifting ? driftTier(k.driftCharge) : 0;
    this.driftFill.style.width = drifting ? `${Math.min(k.driftCharge / MAX_CHARGE, 1) * 100}%` : '0';
    this.driftFill.style.background = TIER_COLORS[tier];
    this.driftLabel.textContent = drifting ? TIER_NAMES[tier] || 'DRIFT' : '';
    this.driftLabel.style.color = TIER_COLORS[tier];
    this.pause.classList.toggle('show', d.paused);
  }
}
