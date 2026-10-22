import { DRIFT_TIERS, driftTier, type KartState } from '../physics/kart';
import { ordinal } from '../core/race';
import { ITEMS, ITEM_KINDS, type ItemKind } from '../items/items';
import { itemIcon } from './itemIcons';
import { Minimap } from './minimap';

const TIER_NAMES = ['', 'BLUE', 'ORANGE', 'PURPLE', 'RAINBOW'];
const TIER_COLORS = ['#fff2a8', 'var(--tier-1)', 'var(--tier-2)', 'var(--tier-3)', 'var(--tier-4)'];
const MAX_CHARGE = DRIFT_TIERS[DRIFT_TIERS.length - 1];
const FLASH_TIME = 1;
/** With a Nonagon Infinity this close (s), it's time to hop. */
export const SURGE_HOP_WINDOW = 0.55;
/** The warning's bar fills over the last few seconds of its approach. */
const SURGE_BAR_TIME = 4;
/** Seconds per face of the item roulette. */
const ROULETTE_STEP = 0.07;

const q = (el: HTMLElement, sel: string) => el.querySelector<HTMLElement>(sel)!;

function renderTable(t: Table): string {
  const rows = t.rows
    .map(
      (r) =>
        `<div class="hud-standing${r.player ? ' me' : ''}"><span class="pos">${r.place}</span><span class="dot" style="background:${r.color}"></span><span class="name">${r.name}</span><span class="time">${r.value}${r.extra ? ` <small>${r.extra}</small>` : ''}</span></div>`,
    )
    .join('');
  return (
    `<div class="hud-standings-head hud-big">${t.title}</div>` +
    (t.note ? `<div class="hud-standings-note">${t.note}</div>` : '') +
    rows +
    `<div class="hud-standings-next">${'ontouchstart' in window ? 'tap' : 'press any key'} to continue</div>`
  );
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export interface TableRow {
  place: string;
  name: string;
  color: string;
  /** Right-hand column: a time or a points total. */
  value: string;
  /** Small note after the value, e.g. points gained. */
  extra?: string;
  player: boolean;
}

/** A results-style panel: race results, cup standings, or the podium banner. */
export interface Table {
  kind: 'results' | 'cup' | 'podium';
  title: string;
  /** Line under the title. */
  note?: string;
  rows: TableRow[];
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
  autoAccelerate: boolean;
  finished: boolean;
  paused: boolean;
  /** Online: who paused the race for everyone. */
  pausedBy: string;
  online: boolean;
  /** Time Trial: seconds behind (+) or ahead (-) of the ghost being chased. */
  ghostGap: { label: string; gap: number } | null;
  position: number;
  karts: number;
  /** Seconds until the green light; <= 0 once racing. */
  countdown: number;
  table: Table | null;
  /** Track title card during the pre-race flyover. */
  intro: { name: string; sub: string } | null;
  muted: boolean;
  sfxMuted: boolean;
  /** Item in the slot, and roulette time left (> 0 while it spins). */
  item: ItemKind | null;
  rolling: number;
  /** A second item from a double box. */
  spare: ItemKind | null;
  /** A Nonagon Infinity closing in on you: 0 far .. 1 arriving, and seconds until it does; null when none is. */
  surge: { near: number; eta: number } | null;
  /** The style meter: the running score and the chain (core/style.ts); null in Time Trial. */
  style: { score: number; chain: number } | null;
  /** Time Trial: the gap to the ghost at each checkpoint passed this run. */
  splits: { label: string; gap: number }[];
}

/** Who hit whom with what, for the callout feed. */
export interface Callout {
  from: string;
  to: string;
  by: ItemKind;
  /** 'landed' you hit them, 'took' they hit you, 'blocked' your held item stopped it, 'dodged' you rode a wave. */
  kind: 'landed' | 'took' | 'blocked' | 'dodged';
}

const CALLOUT_TIME = 2.5;
const CALLOUT_MAX = 2;

export type PauseAction = 'resume' | 'restart' | 'restartNow' | 'keepRacing' | 'quit' | 'settings';

export class Hud {
  readonly minimap = new Minimap();
  onPauseAction: ((action: PauseAction) => void) | null = null;
  private readonly el = document.createElement('div');
  private readonly lap: HTMLElement;
  private readonly time: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly surface: HTMLElement;
  private readonly driftFill: HTMLElement;
  private readonly driftLabel: HTMLElement;
  private readonly racer: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly pause: HTMLElement;
  private confirmEl: HTMLElement;
  private readonly position: HTMLElement;
  private readonly count: HTMLElement;
  private readonly standings: HTMLElement;
  private readonly title: HTMLElement;
  private readonly itemSlot: HTMLElement;
  private readonly spareSlot: HTMLElement;
  private readonly spareImg: HTMLImageElement;
  private lastSpare = '';
  private readonly calloutsEl: HTMLElement;
  private readonly callouts: { el: HTMLElement; at: number }[] = [];
  private readonly warnEl: HTMLElement;
  private readonly warnBar: HTMLElement;
  private readonly styleEl: HTMLElement;
  private readonly splitsEl: HTMLElement;
  private lastSplits = '';
  private readonly itemImg: HTMLImageElement;
  private readonly itemName: HTMLElement;
  private readonly flashEl: HTMLElement;
  private flashText = '';
  private flashAt = -Infinity;
  private flashPending = false;
  private lastIcon = '';
  private readonly introEl: HTMLElement;
  private lastIntro = '';
  private lastTable = '';
  private lastCount = '';
  private lastPosition = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'hud';
    const ticks = DRIFT_TIERS.slice(0, -1)
      .map((t) => `<div class="hud-drift-tick" style="left:${(t / MAX_CHARGE) * 100}%"></div>`)
      .join('');
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-lap hud-big"></div>
        <div class="hud-time"></div>
        <div class="hud-ghost-gap"></div>
        <div class="hud-laps"></div>
        <div class="hud-splits"></div>
        <div class="hud-style"></div>
        <div class="hud-callouts"></div>
      </div>
      <div class="hud-tr"><div class="hud-racer"></div></div>
      <div class="hud-item"><img alt="" /><div class="hud-item-name"></div><div class="hud-spare"><img alt="" /></div></div>
      <div class="hud-warn"><div class="hud-warn-text hud-big">NONAGON INFINITY!</div><div class="hud-warn-bar"><i></i></div><div class="hud-warn-hop hud-big">HOP!</div></div>
      <div class="hud-flash hud-big"></div>
      <div class="hud-intro"><div class="hud-intro-name hud-big"></div><div class="hud-intro-sub"></div><div class="hud-intro-skip">${'ontouchstart' in window ? 'tap' : 'press any key'} to skip</div></div>
      <div class="hud-drift">
        <div class="hud-drift-bar"><div class="hud-drift-fill"></div>${ticks}</div>
        <div class="hud-drift-label"></div>
      </div>
      <div class="hud-br">
        <div class="hud-position hud-big"></div>
        <div class="hud-speed hud-big"></div>
        <div class="hud-surface"></div>
      </div>
      <div class="hud-help">
        &larr;/&rarr; steer &middot; &darr; brake/reverse &middot; Shift/Space hop+drift (tap at a ramp lip for a trick) &middot; E item &middot; Q look back &middot; Esc pause<br />
        R restart &middot; M auto/manual throttle &middot; N music on/off &middot; B sound effects on/off
      </div>
      <div class="hud-count hud-big"></div>
      <div class="hud-banner hud-big">FINISH!</div>
      <div class="hud-standings"></div>
      <div class="hud-pause">
        <div class="hud-big">PAUSED</div>
        <div class="hud-pause-by"></div>
        <div class="hud-pause-buttons">
          <button data-act="resume">Resume <small>Esc</small></button>
          <button data-act="restart">Restart <small>R</small></button>
          <button data-act="settings">Settings</button>
          <button data-act="quit">Quit to menu <small>Backspace</small></button>
        </div>
      </div>
      <div class="hud-confirm">
        <div class="hud-confirm-box">
          <div class="hud-big">RESTART?</div>
          <div class="hud-confirm-sub">The race starts over from the grid.</div>
          <div class="hud-pause-buttons">
            <button data-act="restartNow">Restart <small>R / Enter</small></button>
            <button data-act="keepRacing">Keep racing <small>Esc</small></button>
          </div>
        </div>
      </div>
      <div class="hud-title">
        <div class="hud-title-logo hud-big">GIZZRACER</div>
        <div class="hud-title-sub">psychedelic kart racing</div>
        <div class="hud-title-press">${'ontouchstart' in window ? 'tap to start' : 'press any key'}</div>
        <div class="hud-title-buttons">
          <button class="hud-title-settings" data-title="settings">SETTINGS</button>
          <button class="hud-title-settings" data-title="credits">CREDITS</button>
        </div>
        <div class="hud-title-ios">For full screen: Share &rarr; Add to Home Screen</div>
      </div>`;
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
    this.banner = q('.hud-banner');
    this.pause = q('.hud-pause');
    this.position = q('.hud-position');
    this.count = q('.hud-count');
    this.standings = q('.hud-standings');
    this.title = q('.hud-title');
    q('[data-title="settings"]').addEventListener('click', () => this.onTitleSettings?.());
    q('[data-title="credits"]').addEventListener('click', () => this.onTitleCredits?.());
    this.itemSlot = q('.hud-item');
    this.itemImg = q('.hud-item img') as HTMLImageElement;
    this.itemName = q('.hud-item-name');
    this.flashEl = q('.hud-flash');
    this.spareSlot = q('.hud-spare');
    this.spareImg = q('.hud-spare img') as HTMLImageElement;
    this.calloutsEl = q('.hud-callouts');
    this.warnEl = q('.hud-warn');
    this.warnBar = q('.hud-warn-bar i');
    this.styleEl = q('.hud-style');
    this.splitsEl = q('.hud-splits');
    this.introEl = q('.hud-intro');
    q('.hud-tr').appendChild(this.minimap.canvas);
    this.confirmEl = q('.hud-confirm');
    this.confirmEl.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act as PauseAction | undefined;
      if (act) this.onPauseAction?.(act);
    });
    this.pause.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act as PauseAction | undefined;
      if (act) this.onPauseAction?.(act);
    });
  }

  /** Asks before a restart (R, or the pause menu's Restart): a key is easy to press by accident mid-race. */
  confirmRestart(on: boolean): void {
    this.confirmEl.classList.toggle('show', on);
  }

  get confirmingRestart(): boolean {
    return this.confirmEl.classList.contains('show');
  }

  /** Big callout in the middle of the screen: hits taken and landed. */
  flash(text: string): void {
    this.flashText = text;
    this.flashPending = true;
  }

  /** Adds a line to the callout feed: who hit whom, with the item's icon between them. Timed on the wall clock, so a slow frame can't skip it. */
  callout(c: Callout): void {
    const now = performance.now() / 1000;
    const el = document.createElement('div');
    el.className = `hud-callout ${c.kind}`;
    const name = (n: string) => {
      const span = document.createElement('span');
      span.textContent = n.toUpperCase();
      return span;
    };
    const img = document.createElement('img');
    img.src = itemIcon(c.by);
    img.alt = ITEMS[c.by].name;
    el.append(name(c.from), img, name(c.to));
    if (c.kind === 'blocked' || c.kind === 'dodged') el.append(name(c.kind === 'blocked' ? 'blocked' : 'dodged'));
    this.calloutsEl.prepend(el);
    this.callouts.unshift({ el, at: now });
    while (this.callouts.length > CALLOUT_MAX) this.callouts.pop()!.el.remove();
  }

  /** The title screen's Settings button. */
  onTitleSettings: (() => void) | null = null;
  onTitleCredits: (() => void) | null = null;

  showTitle(show: boolean): void {
    this.title.classList.toggle('show', show);
  }

  update(d: HudData, now: number): void {
    const k = d.kart;
    this.lap.textContent = d.finished ? 'FINISH' : `LAP ${d.lap + 1}/${d.totalLaps}`;
    this.time.textContent = formatTime(d.raceTime);
    const gapEl = this.el.querySelector<HTMLElement>('.hud-ghost-gap')!;
    if (d.ghostGap) {
      const g = d.ghostGap.gap;
      gapEl.textContent = `${g > 0 ? '+' : '-'}${Math.abs(g).toFixed(2)}s vs ${d.ghostGap.label}`;
      gapEl.classList.toggle('ahead', g < 0);
    } else {
      gapEl.textContent = '';
    }
    const best = d.lapTimes.length ? Math.min(...d.lapTimes) : 0;
    this.laps.innerHTML = d.lapTimes
      .map((t, i) => `L${i + 1} ${formatTime(t)}${t === best ? ' &#9733;' : ''}`)
      .join('<br />');
    const splits = d.splits.map((s) => `<span class="${s.gap < 0 ? 'ahead' : 'behind'}">${s.label} ${s.gap > 0 ? '+' : '-'}${Math.abs(s.gap).toFixed(2)}</span>`).join(' ');
    if (splits !== this.lastSplits) {
      this.lastSplits = splits;
      this.splitsEl.innerHTML = splits;
    }
    this.updateStyle(d);
    this.speed.innerHTML = `${Math.round(Math.abs(k.speed) * 3.6)}<small>km/h</small>`;
    this.surface.innerHTML = k.boostTime > 0 ? '<span class="hud-boost">BOOST!</span>' : k.surface;
    this.racer.innerHTML = `${d.trackName}<br />${d.racerName} &middot; ${d.engineClass}${d.autoAccelerate ? '' : ' &middot; manual'}${d.muted ? ' &middot; music off' : ''}${d.sfxMuted ? ' &middot; sfx off' : ''}`;
    this.position.innerHTML = `${ordinal(d.position)}<small>/${d.karts}</small>`;
    if (d.position !== this.lastPosition) {
      // Pop on every change, green when gaining a place, red when losing one.
      if (this.lastPosition && d.countdown <= 0) {
        this.position.classList.remove('gain', 'lose');
        void this.position.offsetWidth;
        this.position.classList.add(d.position < this.lastPosition ? 'gain' : 'lose');
      }
      this.lastPosition = d.position;
    }

    // 3, 2, 1, GO! then clear.
    const count = d.countdown > 0 ? String(Math.ceil(d.countdown)) : d.countdown > -0.8 ? 'GO!' : '';
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.count.textContent = count;
      this.count.classList.remove('pop');
      void this.count.offsetWidth; // restart the pop animation
      if (count) this.count.classList.add('pop');
    }

    const drifting = k.driftDir !== 0;
    const tier = drifting ? driftTier(k.driftCharge) : 0;
    this.driftFill.style.width = drifting ? `${Math.min(k.driftCharge / MAX_CHARGE, 1) * 100}%` : '0';
    this.driftFill.style.background = TIER_COLORS[tier];
    this.driftFill.style.color = TIER_COLORS[tier];
    this.driftLabel.textContent = drifting ? TIER_NAMES[tier] || 'DRIFT' : '';
    this.driftLabel.style.color = TIER_COLORS[tier];
    this.banner.textContent = d.finished ? `FINISH! ${ordinal(d.position)}` : '';
    this.banner.classList.toggle('show', d.finished && !d.paused && !d.table);
    this.standings.classList.toggle('show', !!d.table && !d.paused);
    this.standings.dataset.kind = d.table?.kind ?? '';
    const html = d.table ? renderTable(d.table) : '';
    if (html !== this.lastTable) {
      this.lastTable = html;
      this.standings.innerHTML = html;
    }
    this.pause.classList.toggle('show', d.paused);
    this.pause.classList.toggle('online', d.online);
    const by = d.pausedBy ? `Paused by ${d.pausedBy} for everyone` : '';
    const byEl = this.pause.querySelector<HTMLElement>('.hud-pause-by')!;
    if (byEl.textContent !== by) byEl.textContent = by;
    this.updateItem(d, now);
    const intro = d.intro ? `${d.intro.name}|${d.intro.sub}` : '';
    if (intro !== this.lastIntro) {
      this.lastIntro = intro;
      if (d.intro) {
        q(this.introEl, '.hud-intro-name').textContent = d.intro.name.toUpperCase();
        q(this.introEl, '.hud-intro-sub').textContent = d.intro.sub;
      }
      this.introEl.classList.toggle('show', !!d.intro);
    }
  }

  /** The running style score under the laps: the score and the chain, nothing popping. */
  private updateStyle(d: HudData): void {
    const st = d.style;
    this.styleEl.classList.toggle('show', !!st && st.score > 0);
    if (!st) return;
    const chain = st.chain > 1 ? ` <b>x${st.chain}</b>` : '';
    const html = `STYLE ${st.score.toLocaleString('en-US')}${chain}`;
    if (this.styleEl.innerHTML !== html) this.styleEl.innerHTML = html;
  }

  private updateItem(d: HudData, now: number): void {
    const kind = d.rolling > 0 ? ITEM_KINDS[Math.floor(now / ROULETTE_STEP) % ITEM_KINDS.length] : d.item;
    const icon = kind ?? '';
    if (icon !== this.lastIcon) {
      this.lastIcon = icon;
      if (kind) this.itemImg.src = itemIcon(kind);
      this.itemImg.style.visibility = kind ? 'visible' : 'hidden';
    }
    this.itemName.textContent = d.item && d.rolling === 0 ? ITEMS[d.item].name : '';
    this.itemSlot.classList.toggle('rolling', d.rolling > 0);
    this.itemSlot.classList.toggle('ready', !!d.item && d.rolling === 0);
    // The spare spins with the roulette, then sits small beside the slot.
    const spare = d.spare ? (d.rolling > 0 ? ITEM_KINDS[(Math.floor(now / ROULETTE_STEP) + 5) % ITEM_KINDS.length] : d.spare) : null;
    if ((spare ?? '') !== this.lastSpare) {
      this.lastSpare = spare ?? '';
      if (spare) this.spareImg.src = itemIcon(spare);
    }
    this.spareSlot.classList.toggle('show', !!spare);

    const wall = performance.now() / 1000;
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      if (wall - c.at > CALLOUT_TIME || d.paused) {
        c.el.remove();
        this.callouts.splice(i, 1);
      }
    }
    this.warnEl.classList.toggle('show', d.surge !== null && !d.paused);
    if (d.surge !== null) {
      this.warnEl.style.setProperty('--near', d.surge.near.toFixed(2));
      this.warnBar.style.width = `${Math.round(Math.min(1, Math.max(0, 1 - d.surge.eta / SURGE_BAR_TIME)) * 100)}%`;
      this.warnEl.classList.toggle('now', d.surge.eta <= SURGE_HOP_WINDOW);
    }

    if (this.flashPending) {
      this.flashPending = false;
      this.flashAt = now;
      this.flashEl.textContent = this.flashText;
      this.flashEl.classList.remove('pop');
      void this.flashEl.offsetWidth;
      this.flashEl.classList.add('pop');
    }
    this.flashEl.classList.toggle('show', now - this.flashAt < FLASH_TIME && !d.paused);
  }
}
