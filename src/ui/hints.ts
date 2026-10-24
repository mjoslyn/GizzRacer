import { ITEMS, type ItemKind } from '../items/items';

/**
 * What each item does, in a line, for the hints ticker. Keyed by every
 * kind, so a new item can't go out without one.
 */
export const ITEM_HINTS: Record<ItemKind, string> = {
  fuzzPedal: 'a quick boost',
  drippingTap: 'one long boost, only for the back of the field',
  microtonalMine: 'drop it behind you; whoever hits it steers out of tune. Hold it to block a hit from behind',
  feedbackWave: 'a blast all round you that spins out anyone close',
  riffMissile: 'chases the kart one place ahead and spins it out. Hold it to block a hit from behind',
  tempoShift: 'slows every other kart, the leader longest',
  wooCannon: 'fly down the road to catch the pack, knocking aside anyone in the way',
  fluteFlurry: "Stu's: a spray of notes ahead that sends their steering out of tune",
  drumRoll: "Cavs's: a few seconds as a battering ram that nothing can touch",
  bassDrop: "Lukey's: slows every kart just ahead of you",
  patchCable: "Joey's: latches onto the kart ahead, slows it and slingshots you past",
  harmonicaWail: "Amby's: shoves the karts in front aside, with a little boost for you",
  keytarLaser: "Cookie's: a beam straight ahead that spins out the first kart in it",
  gizzardWave: 'rolls down the road to the leader. Leading? Hop as it reaches you to ride over it',
};

/** The controls, for whichever way the player is steering. */
function controls(touch: boolean): string[] {
  if (touch) {
    return [
      'Drag on the left half of the screen to steer (or turn on tilt in Settings)',
      'Tap anywhere to hop; hold DRIFT through a corner to drift',
      'ITEM fires what you hold; BRAKE slows you, and reverses when stopped',
      'Gliding? Drag up on the steering pad to climb, down to dive; steering by tilt, tip the phone back to climb, forward to dive',
    ];
  }
  return [
    'Steer with Left and Right (or A and D)',
    'Shift or Space to hop; hold it while turning to drift',
    'E uses your item, Q looks back, Down brakes and reverses',
    'Esc pauses, R restarts, M switches to manual throttle, N mutes the music',
    'Gliding? Up climbs, Down dives',
    'A gamepad works too: stick to steer, R1 drift, L1 item, B brake',
  ];
}

/** How to race well. */
export const TIPS: readonly string[] = [
  'Drift sparks go blue, orange, purple: let go for a boost, bigger the longer you held',
  'Hold a purple drift on through the corner for rainbow sparks, the longest boost there is',
  'Tap hop just as you leave a ramp or a crest: a trick, and a boost when you land',
  'Trick off a launcher to open your glider and soar over the jump',
  'Hop just as the countdown’s 1 goes out for a rocket start',
  'Tuck in behind another kart to charge a slipstream boost',
  'Every track has a shortcut, and some only open on certain laps',
  'Double item boxes sit on the risky lines',
  'Hazards can help: surf a wave, ride a vulture, hop onto a crashed plane for a ramp',
  'Way back in the field? Item boxes get kinder: a Woo Cannon or The Dripping Tap',
  'Turn hints at the top of the screen call the next bend, how sharp and how far',
  'Smart steering keeps you on the road; steer through it, or turn it off in Settings',
  'Style points for drifts, tricks, slipstreams and items; quick ones chain for a multiplier',
  'Gold in a cup at 150cc unlocks 200cc; gold in every cup unlocks Mirror',
  'Settings > Soundtrack plays the band live from their shows on the Internet Archive',
  'Too easy, too hard? Settings > CPUs',
];

/** Every hint, controls first, then the items and the tips shuffled together by `rand`. */
export function buildHints(touch: boolean, rand: () => number = Math.random): string[] {
  const items = (Object.keys(ITEM_HINTS) as ItemKind[]).map((k) => `${ITEMS[k].name}: ${ITEM_HINTS[k]}`);
  const rest = [...items, ...TIPS];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...controls(touch), ...rest];
}

/** Pixels a second the ticker scrolls at. */
const SPEED = 70;

/**
 * A ticker of hints along the bottom of the screen, on the picker and over
 * the flyover before a race: the controls, what every item does, and how to
 * race well. It scrolls on its own and stops while the pointer is over it.
 */
export class HintsTicker {
  private readonly el = document.createElement('div');
  private readonly track: HTMLElement;
  private shown = false;

  constructor(parent: HTMLElement) {
    this.el.className = 'hints-ticker';
    this.el.innerHTML = '<div class="hints-track"></div>';
    this.track = this.el.querySelector('.hints-track')!;
    parent.appendChild(this.el);
  }

  /** Shows it (with the hints fresh and reshuffled) or hides it. */
  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.el.classList.toggle('show', on);
    if (!on) return;
    const touch = document.body.classList.contains('touch-mode');
    const line = buildHints(touch)
      .map((h) => `<span class="hint">${esc(h)}</span>`)
      .join('<span class="hint-sep">&#10022;</span>');
    // Twice over, so the loop has no seam: the animation runs it half its width.
    this.track.innerHTML = `<span class="hints-run">${line}<span class="hint-sep">&#10022;</span></span><span class="hints-run" aria-hidden="true">${line}<span class="hint-sep">&#10022;</span></span>`;
    requestAnimationFrame(() => {
      const width = this.track.scrollWidth / 2;
      this.track.style.animationDuration = `${Math.max(20, width / SPEED)}s`;
    });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
