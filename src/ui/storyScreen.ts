import { BOONS, CLEAR_PLACE, type StoryRun } from '../core/story';
import type { RacerDef } from '../physics/racers';

/** A story card: a chapter opening, a boon to pick, or how the run ended. */
export interface StoryCard {
  /** Small line over the title: the chapter, or how it went. */
  kicker: string;
  title: string;
  body: string;
  /** What can be picked; the first is lit to start. */
  opts: { id: string; name: string; blurb: string }[];
  /** Small line under the choices: the boons held. */
  footer?: string;
}

/**
 * Story mode's screens between races, in the picker's look: a card of
 * text and a list to pick from. Arrows and Enter, a click or a tap.
 */
export class StoryScreen {
  /** A choice was made (an option's id). */
  onPick: (id: string) => void = () => {};
  private readonly el = document.createElement('div');
  private card: StoryCard | null = null;
  private at = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'menu story';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
      if (t?.dataset.pick) this.onPick(t.dataset.pick);
    });
  }

  get visible(): boolean {
    return this.card !== null;
  }

  show(card: StoryCard | null): void {
    this.card = card;
    this.at = 0;
    this.el.classList.toggle('show', card !== null);
    this.render();
  }

  /** Returns true if the key was used. */
  key(code: string): boolean {
    const c = this.card;
    if (!c) return false;
    const n = c.opts.length;
    if (code === 'ArrowUp' || code === 'KeyW') this.at = (this.at - 1 + n) % n;
    else if (code === 'ArrowDown' || code === 'KeyS') this.at = (this.at + 1) % n;
    else if (code === 'Enter' || code === 'Space') {
      this.onPick(c.opts[this.at].id);
      return true;
    } else return false;
    this.render();
    return true;
  }

  private render(): void {
    const c = this.card;
    if (!c) {
      this.el.innerHTML = '';
      return;
    }
    const opts = c.opts
      .map((o, i) => `<button class="menu-opt${i === this.at ? ' on' : ''}" data-pick="${esc(o.id)}"><span class="menu-opt-name hud-big">${esc(o.name)}</span><span class="menu-opt-blurb">${esc(o.blurb)}</span></button>`)
      .join('');
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="story-kicker">${esc(c.kicker)}</div>
        <div class="menu-title hud-big">${esc(c.title)}</div>
        <div class="story-body">${esc(c.body)}</div>
        <div class="menu-opts on">${opts}</div>
        ${c.footer ? `<div class="story-footer">${esc(c.footer)}</div>` : ''}
        <div class="menu-hint">${c.opts.length > 1 ? '&uarr;&darr; choose &middot; ' : ''}Enter to go on</div>
      </div>`;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export type StoryPhase = 'chapter' | 'boss' | 'boon' | 'over' | 'won';

/** The card for where a run is: what it says and what can be picked. */
export function storyCard(run: StoryRun, phase: StoryPhase, player: RacerDef): StoryCard {
  const act = run.actDef;
  const race = run.race;
  const kicker = act.chapter;
  const footer = run.boons.length ? `Boons: ${run.boons.map((b) => BOONS[b].name).join(', ')}` : undefined;
  const go = (name: string, blurb: string) => [{ id: 'go', name, blurb }];
  const ends = [
    { id: 'again', name: 'Loop again', blurb: 'A new run from Chapter I, with the same racer' },
    { id: 'menu', name: 'Back to the picker', blurb: 'Leave the loop for now' },
  ];
  switch (phase) {
    case 'chapter':
      return { kicker, title: act.title, body: act.intro, opts: go('Begin', `Two races, then the boss. Finish in the top ${CLEAR_PLACE} every time: one miss and the run is over.`), footer };
    case 'boss': {
      const boss = run.bossRacer(player);
      return { kicker: `${act.chapter} · Boss`, title: boss.name, body: act.boss.taunt, opts: go('Race', `Beat ${boss.name} to the line, in the top ${CLEAR_PLACE}`), footer };
    }
    case 'boon':
      return {
        kicker: 'Cleared!',
        title: 'Take a boon',
        body: race.index === 0 ? `${act.chapter} begins: ${act.title}. Something to carry in.` : 'The loop gives something back. Take one with you.',
        opts: run.offer.map((b) => ({ id: b, name: BOONS[b].name, blurb: BOONS[b].text })),
        footer,
      };
    case 'over':
      return {
        kicker: `${act.chapter} · ${race.boss ? 'Boss' : `Race ${race.index + 1}`}`,
        title: 'The loop begins again',
        body: `${race.boss ? `${run.bossRacer(player).name} beat you to the line` : `You fell out of the top ${CLEAR_PLACE}`}, ${run.cleared} ${run.cleared === 1 ? 'race' : 'races'} into the loop. Nonagon Infinity never ends: the door opens once more, and you are back at the start.`,
        opts: ends,
        footer,
      };
    case 'won':
      return {
        kicker: 'Murder of the Universe',
        title: 'The universe is murdered',
        body: 'Han-Tyumi got what he wanted, and everything else went with it. The loop closes on itself, and somewhere Nonagon Infinity opens the door again.',
        opts: ends,
        footer,
      };
  }
}
