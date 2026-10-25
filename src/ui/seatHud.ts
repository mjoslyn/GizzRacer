import { ordinal } from '../core/race';
import { ITEMS, ITEM_KINDS, type ItemKind } from '../items/items';
import { DRIFT_TIERS, driftTier, type KartState } from '../physics/kart';
import type { Rect } from '../render/split';
import type { Callout } from './hud';
import { itemIcon } from './itemIcons';

const FLASH_TIME = 1;
const ROULETTE_STEP = 0.07;
const CALLOUT_TIME = 2.5;
const TIER_COLORS = ['#fff2a8', 'var(--tier-1)', 'var(--tier-2)', 'var(--tier-3)', 'var(--tier-4)'];
const MAX_CHARGE = DRIFT_TIERS[DRIFT_TIERS.length - 1];

/** What a seat's corner of the screen shows, each frame. */
export interface SeatHudData {
  kart: KartState;
  lap: number;
  totalLaps: number;
  position: number;
  karts: number;
  finished: boolean;
  item: ItemKind | null;
  rolling: number;
  spare: ItemKind | null;
  /** A Nonagon Infinity is on its way to this seat: hop when it says. */
  hop: boolean;
  /** Hidden: paused, on the results, or the flyover before the race. */
  hidden: boolean;
}

/**
 * Party mode's HUD for one player's part of a split screen: who they are,
 * their place and lap, their item, and the big callouts (hits, laps, the
 * finish). The full HUD (hud.ts) keeps the countdown, the map and the
 * screens between races for everyone.
 */
export class SeatHud {
  private readonly el = document.createElement('div');
  private readonly lapEl: HTMLElement;
  private readonly posEl: HTMLElement;
  private readonly itemEl: HTMLElement;
  private readonly itemImg: HTMLImageElement;
  private readonly itemName: HTMLElement;
  private readonly spareImg: HTMLImageElement;
  private readonly flashEl: HTMLElement;
  private readonly calloutEl: HTMLElement;
  private readonly driftEl: HTMLElement;
  private readonly biteEl: HTMLElement;
  private flashText = '';
  private flashAt = -Infinity;
  private flashPending = false;
  private calloutAt = -Infinity;
  private lastIcon = '';
  private lastSpare = '';
  private lastHtml = { lap: '', pos: '' };

  constructor(parent: HTMLElement, label: string, color: string) {
    this.el.className = 'seat-hud';
    this.el.style.setProperty('--seat', color);
    this.el.innerHTML = `
      <div class="seat-tag"></div>
      <div class="seat-lap hud-big"></div>
      <div class="seat-pos hud-big"></div>
      <div class="seat-item"><img alt="" /><div class="seat-item-name"></div><div class="seat-spare"><img alt="" /></div></div>
      <div class="seat-drift"></div>
      <div class="seat-flash hud-big"></div>
      <div class="seat-callout"></div>
      <div class="seat-bite"></div>`;
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    q('.seat-tag').textContent = label;
    this.lapEl = q('.seat-lap');
    this.posEl = q('.seat-pos');
    this.itemEl = q('.seat-item');
    this.itemImg = q('.seat-item img') as HTMLImageElement;
    this.itemName = q('.seat-item-name');
    this.spareImg = q('.seat-spare img') as HTMLImageElement;
    this.flashEl = q('.seat-flash');
    this.calloutEl = q('.seat-callout');
    this.driftEl = q('.seat-drift');
    this.biteEl = q('.seat-bite');
    parent.appendChild(this.el);
  }

  place(r: Rect): void {
    Object.assign(this.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  flash(text: string): void {
    this.flashText = text;
    this.flashPending = true;
  }

  /** One line of who hit whom, the item's name between: there's no room for a feed. */
  callout(c: Callout): void {
    const verb = { landed: 'hit', took: 'hit', blocked: 'blocked by', dodged: 'dodged' }[c.kind];
    this.calloutEl.textContent = c.kind === 'blocked' || c.kind === 'dodged' ? `${c.to} ${verb} ${ITEMS[c.by].name}` : `${c.from} ${verb} ${c.to} · ${ITEMS[c.by].name}`;
    this.calloutAt = performance.now() / 1000;
  }

  /** A hit: this player's part of the screen takes the red bite. */
  bite(): void {
    this.biteEl.classList.remove('on');
    void this.biteEl.offsetWidth;
    this.biteEl.classList.add('on');
  }

  remove(): void {
    this.el.remove();
  }

  update(d: SeatHudData, now: number): void {
    this.el.classList.toggle('hidden', d.hidden);
    if (d.hidden) return;
    const lap = d.finished ? 'FINISH' : `LAP ${d.lap + 1}/${Number.isFinite(d.totalLaps) ? d.totalLaps : '∞'}`;
    if (lap !== this.lastHtml.lap) this.lapEl.textContent = this.lastHtml.lap = lap;
    const pos = `${ordinal(d.position)}<small>/${d.karts}</small>`;
    if (pos !== this.lastHtml.pos) this.posEl.innerHTML = this.lastHtml.pos = pos;

    const kind = d.rolling > 0 ? ITEM_KINDS[Math.floor(now / ROULETTE_STEP) % ITEM_KINDS.length] : d.item;
    if ((kind ?? '') !== this.lastIcon) {
      this.lastIcon = kind ?? '';
      if (kind) this.itemImg.src = itemIcon(kind);
      this.itemImg.style.visibility = kind ? 'visible' : 'hidden';
    }
    this.itemName.textContent = d.item && d.rolling === 0 ? ITEMS[d.item].name : '';
    this.itemEl.classList.toggle('rolling', d.rolling > 0);
    this.itemEl.classList.toggle('ready', !!d.item && d.rolling === 0);
    const spare = d.spare ? (d.rolling > 0 ? ITEM_KINDS[(Math.floor(now / ROULETTE_STEP) + 5) % ITEM_KINDS.length] : d.spare) : null;
    if ((spare ?? '') !== this.lastSpare) {
      this.lastSpare = spare ?? '';
      if (spare) this.spareImg.src = itemIcon(spare);
    }
    this.itemEl.classList.toggle('spare', !!spare);

    const k = d.kart;
    const tier = k.driftDir !== 0 ? driftTier(k.driftCharge) : 0;
    this.driftEl.style.width = k.driftDir !== 0 ? `${Math.min(k.driftCharge / MAX_CHARGE, 1) * 100}%` : '0';
    this.driftEl.style.background = TIER_COLORS[tier];

    if (this.flashPending) {
      this.flashPending = false;
      this.flashAt = now;
      this.flashEl.textContent = this.flashText;
      this.flashEl.classList.remove('pop');
      void this.flashEl.offsetWidth;
      this.flashEl.classList.add('pop');
    }
    if (d.hop && now - this.flashAt >= FLASH_TIME) this.flashEl.textContent = 'HOP!';
    this.flashEl.classList.toggle('show', now - this.flashAt < FLASH_TIME || d.hop);
    this.calloutEl.classList.toggle('show', performance.now() / 1000 - this.calloutAt < CALLOUT_TIME);
  }
}
