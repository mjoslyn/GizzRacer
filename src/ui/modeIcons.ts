import type { RaceMode } from './modes';

/** The gold and outline every mode icon is drawn in. */
const G = 'fill="#ffd23a" stroke="#3a0f45" stroke-width="3" stroke-linejoin="round"';
const LINE = 'fill="none" stroke="#3a0f45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

const svg = (body: string) => `<svg class="menu-mode-icon" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

/** A picture for each mode on the picker's first screen, in the HUD's gold. */
export const MODE_ICONS: Record<RaceMode, string> = {
  // A trophy.
  grandPrix: svg(
    `<path ${G} d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z"/><path ${LINE} d="M18 13H9c0 9 4 13 10 14M46 13h9c0 9-4 13-10 14"/><path ${G} d="M28 38h8v8h-8z"/><path ${G} d="M20 46h24v8H20z"/><path ${LINE} d="M27 18l5 6 5-6"/>`,
  ),
  // An open book, an eye on its pages.
  story: svg(
    `<path ${G} d="M6 14c9-3 18-2 26 4v36c-8-6-17-7-26-4z"/><path ${G} d="M58 14c-9-3-18-2-26 4v36c8-6 17-7 26-4z"/><path ${LINE} d="M12 31c3-4 9-4 12 0-3 4-9 4-12 0z"/><circle cx="18" cy="31" r="2" fill="#3a0f45"/><path ${LINE} d="M39 26h13M39 32h13M39 38h9"/>`,
  ),
  // A gamepad.
  skills: svg(
    `<path ${G} d="M14 20h36c6 0 9 5 10 12l2 12c1 6-6 9-10 4l-6-7H18l-6 7c-4 5-11 2-10-4l2-12c1-7 4-12 10-12z"/><path ${LINE} d="M20 27v10M15 32h10"/><circle cx="43" cy="29" r="2.6" fill="#3a0f45"/><circle cx="49" cy="35" r="2.6" fill="#3a0f45"/>`,
  ),
  // A chequered flag.
  single: svg(
    `<path ${LINE} d="M12 58V6"/><path ${G} d="M12 8c10-4 18 4 28 0s12-2 14-1v26c-4-2-8-2-14 1s-18-4-28 0z"/><path fill="#3a0f45" d="M12 8h7v7h-7zM26 9h7v7h-7zM40 8h7v7h-7zM19 15h7v8h-7zM33 16h7v8h-7zM47 15h7v8h-7zM12 23h7v8h-7zM26 24h7v8h-7zM40 23h7v8h-7z"/>`,
  ),
  // A stopwatch.
  timeTrial: svg(
    `<circle ${G} cx="32" cy="36" r="21"/><path ${G} d="M27 6h10v8H27z"/><path ${LINE} d="M48 17l4-4"/><path ${LINE} d="M32 36V22M32 36l9 6"/><circle cx="32" cy="36" r="2.5" fill="#3a0f45"/>`,
  ),
  // A winding road laid out on the spot, with a spark.
  generator: svg(
    `<path ${G} d="M8 56c6-14 26-6 30-18S22 20 30 10h12c-8 10 10 18 4 30S22 44 22 56z"/><path fill="none" stroke="#3a0f45" stroke-width="2" stroke-dasharray="4 4" d="M15 55c5-10 25-4 29-16S28 21 36 11"/><path ${G} d="M52 4l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>`,
  ),
  // Infinity.
  infinite: svg(
    `<path fill="none" stroke="#3a0f45" stroke-width="13" stroke-linecap="round" d="M32 32c-7-9-12-12-18-12a12 12 0 0 0 0 24c6 0 11-3 18-12s12-12 18-12a12 12 0 0 1 0 24c-6 0-11-3-18-12z"/><path fill="none" stroke="#ffd23a" stroke-width="7" stroke-linecap="round" d="M32 32c-7-9-12-12-18-12a12 12 0 0 0 0 24c6 0 11-3 18-12s12-12 18-12a12 12 0 0 1 0 24c-6 0-11-3-18-12z"/>`,
  ),
  // Two phones, steering.
  party: svg(
    `<rect ${G} x="5" y="16" width="26" height="40" rx="5" transform="rotate(-12 18 36)"/><rect ${G} x="33" y="16" width="26" height="40" rx="5" transform="rotate(12 46 36)"/><path ${LINE} d="M13 30l5 5 5-5M41 30l5 5 5-5"/>`,
  ),
  // A globe.
  online: svg(
    `<circle ${G} cx="32" cy="32" r="25"/><path ${LINE} d="M7 32h50M32 7c-9 8-9 42 0 50M32 7c9 8 9 42 0 50M11 19h42M11 45h42"/>`,
  ),
};

/** The Random Cup's tile: a die. */
export const RANDOM_CUP_ICON = svg(
  `<rect ${G} x="10" y="10" width="44" height="44" rx="8"/><g fill="#3a0f45"><circle cx="22" cy="22" r="4"/><circle cx="42" cy="22" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="22" cy="42" r="4"/><circle cx="42" cy="42" r="4"/></g>`,
);
