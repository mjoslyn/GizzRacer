import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_KINDS } from '../src/items/items';
import { ITEM_HINTS, buildHints } from '../src/ui/hints';

describe('hints ticker', () => {
  it('describes every item, by the name players see', () => {
    for (const k of ITEM_KINDS) expect(ITEM_HINTS[k], k).toBeTruthy();
    const all = buildHints(false).join('\n');
    for (const k of ITEM_KINDS) expect(all).toContain(`${ITEMS[k].name}: `);
  });

  it('leads with the controls for the way you play, keys or touch', () => {
    const keys = buildHints(false, () => 0.5);
    const touch = buildHints(true, () => 0.5);
    expect(keys[0]).toMatch(/Left and Right/);
    expect(touch[0]).toMatch(/Drag/);
    expect(touch.join(' ')).not.toMatch(/Shift or Space/);
    // Same hints after the controls, whatever the order.
    expect(new Set(keys.slice(6))).toEqual(new Set(touch.slice(4)));
  });
});
