import { SKILLS, skillRules, type SkillKind } from '../core/skills';
import { BOONS, CLEAR_PLACE, type StoryRun } from '../core/story';
import type { RacerDef } from '../physics/racers';

/** A story card: a chapter opening, a boon to pick, or how the run ended. */
export interface StoryCard {
  /** Small line over the title: the chapter, the lives. */
  kicker: string;
  title: string;
  body: string;
  /** Exactly what to do, under the body (a skill game's rules). */
  detail?: string;
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
      .map((o, i) => `<button class="story-opt${i === this.at ? ' on' : ''}" data-pick="${esc(o.id)}"><span class="story-opt-name">${esc(o.name)}</span><span class="story-opt-blurb">${esc(o.blurb)}</span></button>`)
      .join('');
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="story-kicker">${esc(c.kicker)}</div>
        <div class="menu-title hud-big">${esc(c.title)}</div>
        <div class="story-body">${esc(c.body)}</div>
        ${c.detail ? `<div class="story-rules">${esc(c.detail)}</div>` : ''}
        <div class="story-opts">${opts}</div>
        ${c.footer ? `<div class="story-footer">${esc(c.footer)}</div>` : ''}
        <div class="menu-hint">${c.opts.length > 1 ? '&uarr;&darr; choose &middot; ' : ''}Enter to go on</div>
      </div>`;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export type StoryPhase = 'chapter' | 'skill' | 'boss' | 'boon' | 'failed' | 'over' | 'won';

/** Lives as hearts, for the cards and the race intro. */
export function hearts(lives: number): string {
  return '\u2665'.repeat(Math.max(0, lives));
}

/** The card for where a run is: what it says and what can be picked. `note` is how the last stage went. */
export function storyCard(run: StoryRun, phase: StoryPhase, player: RacerDef, note = ''): StoryCard {
  const act = run.actDef;
  const race = run.race;
  const kicker = `${act.chapter} · ${hearts(run.lives)}`;
  const footer = run.boons.length ? `Boons: ${run.boons.map((b) => BOONS[b].name).join(', ')}` : undefined;
  const go = (name: string, blurb: string) => [{ id: 'go', name, blurb }];
  const ends = [
    { id: 'again', name: 'Loop again', blurb: 'A new run from Chapter I, with the same racer' },
    { id: 'menu', name: 'Back to the picker', blurb: 'Leave the loop for now' },
  ];
  const lead = (text: string) => (note ? `${note}. ${text}` : text);
  switch (phase) {
    case 'chapter':
      return { kicker, title: act.title, body: act.intro, opts: go('Begin', `Two races, a skill game, then the boss one on one. Finish each race in the top ${CLEAR_PLACE}.`), footer };
    case 'skill': {
      const k = SKILLS[race.skill!];
      return { kicker: `${act.chapter} · Skill game · ${hearts(run.lives)}`, title: k.name, body: k.intro, detail: skillRules(race.skill!, race.act), opts: go('Play', 'Ready when you are'), footer };
    }
    case 'boss': {
      const boss = run.bossRacer(player);
      return { kicker: `${act.chapter} · Boss · ${hearts(run.lives)}`, title: boss.name, body: act.boss.taunt, opts: go('Race', `One on one: beat ${boss.name} to the line`), footer };
    }
    case 'boon':
      return {
        kicker: `Cleared! · ${hearts(run.lives)}`,
        title: 'Take a boon',
        body: lead(race.index === 0 ? `${act.chapter} begins: ${act.title}. Something to carry in.` : 'The loop gives something back. Take one with you.'),
        opts: run.offer.map((b) => ({ id: b, name: BOONS[b].name, blurb: BOONS[b].text })),
        footer,
      };
    case 'failed':
      return {
        kicker,
        title: 'The loop bends back',
        body: lead(`Planet B takes the hit. ${race.boss ? `${run.bossRacer(player).name} waits at the line again.` : race.skill ? 'Have another go.' : 'Back to the line: the race starts over.'}`),
        opts: go('Try again', `${run.lives} ${run.lives === 1 ? 'life' : 'lives'} left`),
        footer,
      };
    case 'over':
      return {
        kicker: `${act.chapter} · ${race.boss ? 'Boss' : race.skill ? SKILLS[race.skill].name : `Race ${race.index + 1}`}`,
        title: 'The loop begins again',
        body: lead(`Out of lives in ${act.title}, ${run.cleared} ${run.cleared === 1 ? 'stage' : 'stages'} into the loop. Nonagon Infinity never ends: the door opens once more, and you are back at the start.`),
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

/** Skill Games' card after a game: how it went, and another go or back to the picker. */
export function practiceCard(kind: SkillKind, level: string, r: { passed: boolean; note: string }): StoryCard {
  return {
    kicker: `Skill Games · ${level}`,
    title: r.passed ? 'Nailed it' : 'Not this time',
    body: `${SKILLS[kind].name}: ${r.note}.`,
    opts: [
      { id: 'again', name: 'Play again', blurb: 'Another go, a new draw' },
      { id: 'menu', name: 'Back to the picker', blurb: 'Another game, or another level' },
    ],
  };
}
