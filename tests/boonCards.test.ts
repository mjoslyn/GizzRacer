import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOONS, BOON_IDS, StoryRun } from '../src/core/story';
import { BOON_CARDS, SUITS, boonCardSvg, boonChoiceHtml, boonHandHtml, cardTitle, isBoonChoice } from '../src/ui/boonCards';
import { StoryScreen, storyCard } from '../src/ui/storyScreen';
import { RACERS } from '../src/physics/racers';

/** Enough of a DOM for the story screen: an element whose markup can be read back. */
function fakeDom() {
  const el = { className: '', innerHTML: '', classList: { toggle: () => {} }, addEventListener: () => {} };
  vi.stubGlobal('document', { createElement: () => el, body: { appendChild: () => {} } });
  return el;
}

afterEach(() => vi.unstubAllGlobals());

describe('boon cards', () => {
  it('gives every boon a card: a rank, a suit and its own art', () => {
    for (const id of BOON_IDS) {
      const c = BOON_CARDS[id];
      expect(c, id).toBeDefined();
      expect(c.rank).toMatch(/^(A|K|Q|J|[2-9]|10)$/);
      expect(Object.keys(SUITS)).toContain(c.suit);
      expect(c.art.length).toBeGreaterThan(10);
    }
    expect(Object.keys(BOON_CARDS).sort()).toEqual([...BOON_IDS].sort());
  });

  it('makes every card different: rank and suit, art, and drawing', () => {
    const faces = BOON_IDS.map((id) => `${BOON_CARDS[id].rank} ${BOON_CARDS[id].suit}`);
    expect(new Set(faces).size).toBe(BOON_IDS.length);
    expect(new Set(BOON_IDS.map((id) => BOON_CARDS[id].art)).size).toBe(BOON_IDS.length);
    expect(new Set(BOON_IDS.map((id) => BOON_CARDS[id].draw('x'))).size).toBe(BOON_IDS.length);
  });

  it('uses all four suits, so the set reads as one deck', () => {
    expect(new Set(BOON_IDS.map((id) => BOON_CARDS[id].suit)).size).toBe(4);
  });

  it('draws a card with the rank and suit in two corners and unique gradient ids', () => {
    const a = boonCardSvg('rattlesnake');
    const b = boonCardSvg('rattlesnake');
    expect(a).toMatch(/^<svg[^>]*viewBox="0 0 100 140"/);
    expect(a).toContain('aria-label="Ace of Lizards: Rattlesnake"');
    expect(a.match(/>A<\/text>/g)).toHaveLength(2);
    expect(a).toContain('rotate(180 50 70)');
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).some((i) => ids(b).includes(i))).toBe(false);
    expect(cardTitle('gammaKnife')).toBe('King of Nonagons');
  });

  it('deals the offer as cards, the lit one marked, each with its name and effect', () => {
    const opts = (['mindFuzz', 'planetB', 'figWasps'] as const).map((id) => ({ id, name: BOONS[id].name, blurb: BOONS[id].text }));
    expect(isBoonChoice(opts)).toBe(true);
    expect(isBoonChoice([{ id: 'go' }])).toBe(false);
    const html = boonChoiceHtml(opts, 1);
    expect(html.match(/class="boon-pick/g)).toHaveLength(3);
    expect(html).toContain('class="boon-pick on" data-pick="planetB"');
    for (const o of opts) {
      expect(html).toContain(`data-boon="${o.id}"`);
      expect(html).toContain(o.blurb);
    }
  });

  it('shows the hand with doubles stacked and counted', () => {
    const html = boonHandHtml([
      { ...BOONS.mindFuzz, count: 3 },
      { ...BOONS.rattlesnake, count: 1 },
    ]);
    expect(html).toContain('data-boon="mindFuzz"');
    expect(html).toContain('data-boon="rattlesnake"');
    expect(html).toContain('&times;3');
    expect(html.match(/boon-mini-under/g)).toHaveLength(2);
    expect(boonHandHtml([])).toContain('Empty so far');
  });

  it('renders them on the boon screen, arrows moving along the row', () => {
    const el = fakeDom();
    const run = new StoryRun(4242);
    run.boons.push('mindFuzz', 'mindFuzz', 'gilaHide');
    run.offer = ['sleepDrifter', 'nuclearFusion', 'gammaKnife'];
    const screen = new StoryScreen(document.body);
    screen.show(storyCard(run, 'boon', RACERS[0]));
    for (const id of run.offer) expect(el.innerHTML).toContain(`data-boon="${id}"`);
    expect(el.innerHTML).toContain('class="boon-pick on" data-pick="sleepDrifter"');
    expect(el.innerHTML).toContain('class="boon-hand"');
    expect(el.innerHTML).toContain('&times;2');
    expect(screen.key('ArrowRight')).toBe(true);
    expect(el.innerHTML).toContain('class="boon-pick on" data-pick="nuclearFusion"');
    let picked = '';
    screen.onPick = (id) => (picked = id);
    screen.key('Enter');
    expect(picked).toBe('nuclearFusion');
  });

  it('keeps the plain list for cards that are not a boon pick', () => {
    const el = fakeDom();
    const run = new StoryRun(4242);
    const screen = new StoryScreen(document.body);
    screen.show(storyCard(run, 'chapter', RACERS[0]));
    expect(el.innerHTML).toContain('story-opt');
    expect(el.innerHTML).not.toContain('boon-pick');
  });
});
