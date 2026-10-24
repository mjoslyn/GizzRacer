/**
 * The manual (manual.html): the hand-written parts are in the page; the
 * lists that grow with the game (the modes, items, racers, cups and tracks,
 * the tips) are filled in here from the game's own data, so the manual can't
 * fall behind it.
 */
import { TRACK_SONGS } from './audio/songs';
import { ITEMS, ITEM_KINDS, SIGNATURE_ITEMS } from './items/items';
import { RACERS } from './physics/racers';
import { CUPS, TRACK_LIST } from './tracks/index';
import { ITEM_HINTS, TIPS } from './ui/hints';
import { MODE_BLURBS, MODE_NAMES, type RaceMode } from './ui/modes';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const STATS = ['speed', 'accel', 'weight', 'handling', 'drift'] as const;

function fill(name: string, html: string): void {
  const el = document.querySelector(`[data-fill="${name}"]`);
  if (el) el.innerHTML = html;
}

fill(
  'modes',
  (Object.keys(MODE_NAMES) as RaceMode[]).map((m) => `<dt>${esc(MODE_NAMES[m])}</dt><dd>${esc(MODE_BLURBS[m])}</dd>`).join(''),
);

// The band's items say whose they are.
const owner = new Map(Object.entries(SIGNATURE_ITEMS).map(([racer, item]) => [item, RACERS.find((r) => r.id === racer)?.name]));
fill(
  'items',
  ITEM_KINDS.map((k) => {
    const who = owner.get(k);
    return `<dt>${esc(ITEMS[k].name)}${who ? ` <small>${esc(who)}'s</small>` : ''}</dt><dd>${esc(ITEM_HINTS[k].replace(/^[^:]+'s: /, ''))}</dd>`;
  }).join(''),
);

fill(
  'racers',
  RACERS.map((r) => {
    const bars = STATS.map((k) => `<div class="stat"><span>${k}</span><i style="width:${r.stats[k] * 20}%;background:${hex(r.color)}"></i></div>`).join('');
    return `<article class="racer" style="--c:${hex(r.color)};--a:${hex(r.accent)}"><h3>${esc(r.name)}</h3><p>${esc(r.bio)}</p><div class="stats">${bars}</div></article>`;
  }).join(''),
);

fill(
  'cups',
  CUPS.map((cup) => {
    const tracks = cup.tracks
      .map((i) => {
        const t = TRACK_LIST[i];
        const song = TRACK_SONGS[t.id];
        return `<li><b>${esc(t.name)}</b>${song ? `<small>${esc(song.album)}, ${song.year}</small>` : ''}</li>`;
      })
      .join('');
    return `<article class="cup"><h3>${esc(cup.name)}</h3><ol>${tracks}</ol></article>`;
  }).join(''),
);

fill('tips', TIPS.map((t) => `<li>${esc(t)}</li>`).join(''));
