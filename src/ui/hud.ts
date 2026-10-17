import { DRIFT_TIERS, driftTier, type KartState } from '../physics/kart';
import { Minimap } from './minimap';

const TIER_NAMES = ['', 'BLUE', 'ORANGE', 'PURPLE'];
const TIER_COLORS = ['#fff2a8', 'var(--tier-1)', 'var(--tier-2)', 'var(--tier-3)'];
const MAX_CHARGE = DRIFT_TIERS[DRIFT_TIERS.length - 1];
const SECTION_BANNER_TIME = 2.2;

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
  trackName: string;
  section: string;
  autoAccelerate: boolean;
  finished: boolean;
  paused: boolean;
}

export class Hud {
  readonly minimap = new Minimap();
  private readonly el = document.createElement('div');
  private readonly lap: HTMLElement;
  private readonly time: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly surface: HTMLElement;
  private readonly driftFill: HTMLElement;
  private readonly driftLabel: HTMLElement;
  private readonly racer: HTMLElement;
  private readonly section: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly pause: HTMLElement;
  private lastSection = '';
  private sectionShownAt = -Infinity;

  constructor(parent: HTMLElement) {
    this.el.className = 'hud';
    const ticks = DRIFT_TIERS.slice(0, -1)
      .map((t) => `<div class="hud-drift-tick" style="left:${(t / MAX_CHARGE) * 100}%"></div>`)
      .join('');
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap hud-big"></div>
        <div class="hud-time"></div>
        <div class="hud-laps"></div>
      </div>
      <div class="hud-tr"><div class="hud-racer"></div></div>
      <div class="hud-section hud-big"></div>
      <div class="hud-drift">
        <div class="hud-drift-bar"><div class="hud-drift-fill"></div>${ticks}</div>
        <div class="hud-drift-label"></div>
      </div>
      <div class="hud-br">
        <div class="hud-speed hud-big"></div>
        <div class="hud-surface"></div>
      </div>
      <div class="hud-help">
        &larr;/&rarr; steer &middot; &darr; brake/reverse &middot; Shift/Space hop+drift (tap at a ramp lip for a trick) &middot; Q look back &middot; Esc pause<br />
        1-6 racer &middot; C class &middot; T track &middot; M auto/manual throttle &middot; R restart
      </div>
      <div class="hud-banner hud-big">FINISH!</div>
      <div class="hud-pause hud-big">PAUSED</div>`;
    parent.appendChild(this.el);
    const q = (sel: string) => this.el.querySelector<HTMLElement>(sel)!;
    this.lap = q('.hud-lap');
    this.time = q('.hud-time');
    this.laps = q('.hud-laps');
    this.speed = q('.hud-speed');
    this.surface = q('.hud-surface');
    this.driftFill = q('.hud-drift-fill');
    this.driftLabel = q('.hud-drift-label');
    this.racer = q('.hud-racer');
    this.section = q('.hud-section');
    this.banner = q('.hud-banner');
    this.pause = q('.hud-pause');
    q('.hud-tr').appendChild(this.minimap.canvas);
  }

  update(d: HudData, now: number): void {
    const k = d.kart;
    this.lap.textContent = d.finished ? 'FINISH' : `LAP ${d.lap + 1}/${d.totalLaps}`;
    this.time.textContent = formatTime(d.raceTime);
    const best = d.lapTimes.length ? Math.min(...d.lapTimes) : 0;
    this.laps.innerHTML = d.lapTimes
      .map((t, i) => `L${i + 1} ${formatTime(t)}${t === best ? ' &#9733;' : ''}`)
      .join('<br />');
    this.speed.innerHTML = `${Math.round(Math.abs(k.speed) * 3.6)}<small>km/h</small>`;
    this.surface.innerHTML = k.boostTime > 0 ? '<span class="hud-boost">BOOST!</span>' : k.surface;
    this.racer.innerHTML = `${d.trackName}<br />${d.racerName} &middot; ${d.engineClass}${d.autoAccelerate ? '' : ' &middot; manual'}`;

    if (d.section !== this.lastSection) {
      this.lastSection = d.section;
      this.sectionShownAt = now;
      this.section.textContent = d.section.toUpperCase();
    }
    this.section.classList.toggle('show', now - this.sectionShownAt < SECTION_BANNER_TIME);

    const drifting = k.driftDir !== 0;
    const tier = drifting ? driftTier(k.driftCharge) : 0;
    this.driftFill.style.width = drifting ? `${Math.min(k.driftCharge / MAX_CHARGE, 1) * 100}%` : '0';
    this.driftFill.style.background = TIER_COLORS[tier];
    this.driftFill.style.color = TIER_COLORS[tier];
    this.driftLabel.textContent = drifting ? TIER_NAMES[tier] || 'DRIFT' : '';
    this.driftLabel.style.color = TIER_COLORS[tier];
    this.banner.classList.toggle('show', d.finished && !d.paused);
    this.pause.classList.toggle('show', d.paused);
  }
}
