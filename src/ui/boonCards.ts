import { BOONS, BOON_IDS, type BoonId } from '../core/story';
import './boonCards.css';

/**
 * Story mode's boons as a deck of playing cards, drawn in SVG: a rank and a
 * Gizzard suit in two opposite corners, and the boon's song in the middle.
 * The boon chooser deals the offer as cards in a fan; the run's hand shows
 * every boon held as a small card, doubles stacked and counted.
 */

export type Suit = 'lizard' | 'eye' | 'flame' | 'nonagon';

/** The deck's four suits: the reptiles, the mind, the fire and the infinite loop. */
export const SUITS: Record<Suit, { name: string; colour: string }> = {
  lizard: { name: 'Lizards', colour: '#1e9a4a' },
  eye: { name: 'Eyes', colour: '#d0288f' },
  flame: { name: 'Flames', colour: '#e8590c' },
  nonagon: { name: 'Nonagons', colour: '#6a2ad0' },
};

export interface BoonCard {
  rank: 'A' | 'K' | 'Q' | 'J' | '9' | '2';
  suit: Suit;
  /** What the middle shows, in words (tests, the card's label). */
  art: string;
  /** The art panel, drawn in the card's 100 x 140 box; `u` keeps its gradient ids unique. */
  draw: (u: string) => string;
}

const RANK_NAMES: Record<BoonCard['rank'], string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', '9': 'Nine', '2': 'Two' };

// The art panel: inside the corner indexes, with the card's middle at (50, 70).
const PX = 19;
const PY = 7;
const PW = 62;
const PH = 126;

const n = (v: number) => Math.round(v * 10) / 10;

/** An Archimedean spiral round (cx, cy) from radius r0 to r1 over `turns`, as a path. */
function spiral(cx: number, cy: number, r0: number, r1: number, turns: number, start = 0): string {
  const steps = Math.ceil(turns * 28);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    pts.push(`${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`);
  }
  return `M${pts.join(' L')}`;
}

/** A regular polygon's points. */
function poly(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * Math.PI * 2;
    return `${n(cx + Math.cos(a) * r)},${n(cy + Math.sin(a) * r)}`;
  }).join(' ');
}

/** The art panel's background: a rect over the whole panel. */
const panel = (fill: string) => `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" fill="${fill}"/>`;

/** A few fixed stars. */
function stars(fill: string, pts: [number, number, number][]): string {
  return pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
}

/** Mind Fuzz: an eye whose iris is a spiral, the fuzz rayed round it. */
function mindFuzz(u: string): string {
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const r0 = 30;
    const r1 = i % 2 ? 40 : 52;
    return `<line x1="${n(50 + Math.cos(a) * r0)}" y1="${n(70 + Math.sin(a) * r0 * 0.9)}" x2="${n(50 + Math.cos(a) * r1)}" y2="${n(70 + Math.sin(a) * r1 * 1.25)}"/>`;
  }).join('');
  return `<defs>
      <radialGradient id="${u}bg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ff5ad0"/><stop offset="0.55" stop-color="#7a2a8a"/><stop offset="1" stop-color="#2a0636"/></radialGradient>
      <radialGradient id="${u}iris"><stop offset="0" stop-color="#ffe14d"/><stop offset="0.6" stop-color="#ff8a1f"/><stop offset="1" stop-color="#d0288f"/></radialGradient>
    </defs>
    ${panel(`url(#${u}bg)`)}
    <g stroke="#ffd23a" stroke-width="2" stroke-linecap="round" opacity="0.85">${rays}</g>
    <path d="M21 70 Q50 40 79 70 Q50 100 21 70Z" fill="#fff6d0" stroke="#2a0636" stroke-width="2.4"/>
    <circle cx="50" cy="70" r="14" fill="url(#${u}iris)" stroke="#2a0636" stroke-width="1.6"/>
    <path d="${spiral(50, 70, 1, 13, 3.2)}" fill="none" stroke="#2a0636" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="50" cy="70" r="2.4" fill="#2a0636"/>
    <g stroke="#2a0636" stroke-width="1.8" stroke-linecap="round"><line x1="30" y1="60" x2="26" y2="54"/><line x1="40" y1="55" x2="38" y2="48"/><line x1="50" y1="54" x2="50" y2="46"/><line x1="60" y1="55" x2="62" y2="48"/><line x1="70" y1="60" x2="74" y2="54"/></g>`;
}

/** Rattlesnake: coiled in the desert at sunset, head up, tongue out, the rattle raised. */
function rattlesnake(u: string): string {
  const body = '#8a9a2a';
  const dark = '#3d4a12';
  const coil = (cy: number, rx: number, ry: number) =>
    `<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${body}" stroke-width="7"/><ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${dark}" stroke-width="2.6" stroke-dasharray="3 4"/>`;
  return `<defs>
      <linearGradient id="${u}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5ad0"/><stop offset="0.45" stop-color="#ff8a1f"/><stop offset="0.75" stop-color="#ffd23a"/></linearGradient>
    </defs>
    ${panel(`url(#${u}sky)`)}
    <circle cx="66" cy="34" r="11" fill="#fff6d0" opacity="0.8"/>
    <path d="M${PX} 104 Q38 94 58 102 T${PX + PW} 100 V${PY + PH} H${PX}Z" fill="#c8642a"/>
    <path d="M${PX} 116 Q44 108 64 116 T${PX + PW} 114 V${PY + PH} H${PX}Z" fill="#8a3a1a"/>
    ${coil(110, 24, 7)}${coil(101, 19, 6)}${coil(93, 13, 5)}
    <path d="M50 92 C34 80 66 66 50 50" fill="none" stroke="${body}" stroke-width="7" stroke-linecap="round"/>
    <path d="M50 92 C34 80 66 66 50 50" fill="none" stroke="${dark}" stroke-width="2.6" stroke-dasharray="3 4"/>
    <path d="M44 48 Q46 38 56 40 Q64 42 62 48 Q56 53 44 48Z" fill="${body}" stroke="${dark}" stroke-width="1.6"/>
    <circle cx="57" cy="44" r="1.6" fill="#2a0636"/>
    <path d="M62 46 L69 47 L72 44 M69 47 L72 50" fill="none" stroke="#e8203a" stroke-width="1.4" stroke-linecap="round"/>
    <g fill="#f0d08a" stroke="${dark}" stroke-width="1"><ellipse cx="75" cy="106" rx="3" ry="2.4"/><ellipse cx="76.5" cy="101.5" rx="2.7" ry="2.2"/><ellipse cx="77.8" cy="97.4" rx="2.3" ry="2"/></g>`;
}

/** Gila Monster's Hide: the Gila's beaded scales, black and salmon, on a shield. */
function gilaHide(u: string): string {
  const beads: string[] = [];
  for (let row = 0, y = 12; y < 132; row++, y += 5.6) {
    for (let x = 14 + (row % 2) * 3.3; x < 88; x += 6.6) {
      const pink = Math.sin(x * 0.16 + y * 0.07) + Math.sin(y * 0.19 - x * 0.06) > -0.1;
      beads.push(`<circle cx="${n(x)}" cy="${n(y)}" r="2.9" fill="${pink ? '#ff8a6a' : '#241018'}"/>`);
    }
  }
  const shield = 'M24 18 H76 V66 C76 96 62 114 50 124 C38 114 24 96 24 66Z';
  return `<defs>
      <clipPath id="${u}shield"><path d="${shield}"/></clipPath>
      <linearGradient id="${u}sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff8a1f"/></linearGradient>
    </defs>
    ${panel(`url(#${u}sand)`)}
    <path d="${shield}" fill="#3a1420"/>
    <g clip-path="url(#${u}shield)">${beads.join('')}</g>
    <path d="${shield}" fill="none" stroke="#2a0636" stroke-width="3"/>
    <path d="${shield}" fill="none" stroke="#fff6d0" stroke-width="1" transform="translate(50 70) scale(0.9) translate(-50 -70)" opacity="0.6"/>`;
}

/** Sleep Drifter: asleep in a nightcap on a drifting cloud, under the moon. */
function sleepDrifter(u: string): string {
  return `<defs>
      <linearGradient id="${u}night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1440"/><stop offset="1" stop-color="#4a1a6a"/></linearGradient>
    </defs>
    ${panel(`url(#${u}night)`)}
    ${stars('#fff6d0', [[26, 16, 0.9], [40, 24, 0.7], [30, 44, 0.8], [74, 54, 0.7], [24, 66, 0.6], [46, 12, 0.6], [77, 76, 0.8]])}
    <path d="M66 14 A13 13 0 1 0 76 38 A10 10 0 1 1 66 14Z" fill="#ffe14d"/>
    <g fill="#fff6d0" font-family="Georgia, serif" font-weight="bold" font-style="italic"><text x="50" y="72" font-size="8">z</text><text x="56" y="62" font-size="11">z</text><text x="62" y="50" font-size="14">Z</text></g>
    <g fill="#d8c8ff"><circle cx="30" cy="98" r="8"/><circle cx="42" cy="93" r="10"/><circle cx="56" cy="94" r="10"/><circle cx="68" cy="99" r="8"/><rect x="26" y="96" width="46" height="10" rx="5"/></g>
    <rect x="40" y="80" width="30" height="11" rx="5" fill="#3fa9ff" stroke="#2a0636" stroke-width="1.2"/>
    <circle cx="38" cy="84" r="6.5" fill="#ffd9b0" stroke="#2a0636" stroke-width="1.2"/>
    <path d="M34.5 84.5 q2 1.6 4 0" fill="none" stroke="#2a0636" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M32 81 Q34 72 44 79 Q38 77 32 81Z" fill="#ff5ad0" stroke="#2a0636" stroke-width="1"/>
    <path d="M32 81 Q26 80 25 86" fill="none" stroke="#ff5ad0" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="25" cy="87" r="2.2" fill="#fff6d0"/>
    <g fill="none" stroke="#d8c8ff" stroke-width="1.4" stroke-linecap="round" opacity="0.6"><path d="M22 114 q6 -3 12 0 t12 0"/><path d="M48 120 q6 -3 12 0 t12 0"/><path d="M30 127 q5 -2.5 10 0"/></g>`;
}

/** Microtonal Tuning: a banana-yellow neck with a fret at every quarter tone. */
function microtonal(u: string): string {
  const frets: string[] = [];
  let y = 12;
  for (let i = 0; i < 26 && y < 132; i++) {
    const full = i % 2 === 0;
    frets.push(full ? `<line x1="38" y1="${n(y)}" x2="62" y2="${n(y)}" stroke="#2a0636" stroke-width="1.8"/>` : `<line x1="38" y1="${n(y)}" x2="62" y2="${n(y)}" stroke="#d0288f" stroke-width="1" stroke-dasharray="2 1.5"/>`);
    y += 7.4 - i * 0.13;
  }
  const strings = [41, 44.6, 48.2, 51.8, 55.4, 59].map((x, i) => `<line x1="${x}" y1="${PY}" x2="${x}" y2="${PY + PH}" stroke="#fff6d0" stroke-width="${n(1.3 - i * 0.12)}"/>`).join('');
  // A half sharp: the quarter tone's sign, one stem and two bars.
  const halfSharp = (x: number, yy: number) => `<g stroke="#ffe14d" stroke-width="1.8" stroke-linecap="round"><line x1="${x}" y1="${yy - 9}" x2="${x}" y2="${yy + 9}"/><line x1="${x - 5}" y1="${yy - 2}" x2="${x + 5}" y2="${yy - 5}"/><line x1="${x - 5}" y1="${yy + 5}" x2="${x + 5}" y2="${yy + 2}"/></g>`;
  return `<defs>
      <linearGradient id="${u}teal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a0a0"/><stop offset="1" stop-color="#0a3048"/></linearGradient>
    </defs>
    ${panel(`url(#${u}teal)`)}
    <rect x="37" y="${PY}" width="26" height="${PH}" fill="#f5d36b" stroke="#2a0636" stroke-width="1.6"/>
    ${frets.join('')}
    <g fill="#d0288f"><circle cx="50" cy="44" r="2"/><circle cx="50" cy="74" r="2"/><circle cx="46" cy="104" r="2"/><circle cx="54" cy="104" r="2"/></g>
    ${strings}
    ${halfSharp(28, 34)}${halfSharp(72, 98)}`;
}

/** Planet B: a ringed planet among the stars, a B on its face. */
function planetB(u: string): string {
  return `<defs>
      <radialGradient id="${u}space" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#4a1a6a"/><stop offset="1" stop-color="#12021c"/></radialGradient>
      <radialGradient id="${u}globe" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#7cf09a"/><stop offset="0.55" stop-color="#1e9a6a"/><stop offset="1" stop-color="#1f3fbf"/></radialGradient>
      <clipPath id="${u}ball"><circle cx="50" cy="70" r="18"/></clipPath>
    </defs>
    ${panel(`url(#${u}space)`)}
    ${stars('#fff6d0', [[26, 18, 1], [70, 22, 0.8], [36, 36, 0.6], [76, 44, 1.1], [24, 100, 0.8], [62, 116, 0.7], [44, 124, 1], [74, 108, 0.6], [30, 58, 0.6]])}
    <g transform="rotate(-20 50 70)">
      <path d="M17 70 A33 9 0 0 1 83 70" fill="none" stroke="#ff8a1f" stroke-width="4"/>
      <path d="M17 70 A33 9 0 0 1 83 70" fill="none" stroke="#ffd23a" stroke-width="1.2"/>
    </g>
    <circle cx="50" cy="70" r="18" fill="url(#${u}globe)"/>
    <g clip-path="url(#${u}ball)" fill="none" stroke="#fff6d0" stroke-width="2" opacity="0.35"><path d="M30 62 Q50 56 70 62"/><path d="M30 76 Q50 82 70 76"/></g>
    <text x="50" y="77" font-family="Georgia, serif" font-weight="bold" font-size="19" text-anchor="middle" fill="#fff6d0" opacity="0.9">B</text>
    <circle cx="50" cy="70" r="18" fill="none" stroke="#2a0636" stroke-width="1.4"/>
    <g transform="rotate(-20 50 70)">
      <path d="M17 70 A33 9 0 0 0 83 70" fill="none" stroke="#ff8a1f" stroke-width="4"/>
      <path d="M17 70 A33 9 0 0 0 83 70" fill="none" stroke="#ffd23a" stroke-width="1.2"/>
    </g>`;
}

/** Nuclear Fusion: an atom, three orbits round a glowing nucleus. */
function nuclearFusion(u: string): string {
  const orbits = [0, 60, 120]
    .map(
      (r) => `<g transform="rotate(${r} 50 70)"><ellipse cx="50" cy="70" rx="28" ry="10" fill="none" stroke="#2a0636" stroke-width="3.4"/><ellipse cx="50" cy="70" rx="28" ry="10" fill="none" stroke="#fff6d0" stroke-width="1.6"/><circle cx="78" cy="70" r="3.4" fill="#3fa9ff" stroke="#2a0636" stroke-width="1"/></g>`,
    )
    .join('');
  const core = [
    [50, 70, '#c04bff'],
    [46, 67, '#ff3a3a'],
    [54, 67, '#c04bff'],
    [46.5, 73.5, '#c04bff'],
    [53.5, 73.5, '#ff3a3a'],
    [50, 64.5, '#ff3a3a'],
    [50, 75.5, '#c04bff'],
  ]
    .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${c}" stroke="#2a0636" stroke-width="0.9"/>`)
    .join('');
  return `<defs>
      <radialGradient id="${u}glow" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#fff6d0"/><stop offset="0.25" stop-color="#ffd23a"/><stop offset="0.6" stop-color="#ff6a1a"/><stop offset="1" stop-color="#5a0a2a"/></radialGradient>
    </defs>
    ${panel(`url(#${u}glow)`)}
    ${orbits}${core}`;
}

/** Big Fig Wasp Nest: a fig on the comb, its wasps flying round it. */
function figWasps(u: string): string {
  const hexes: string[] = [];
  for (let row = 0, y = 8; y < 140; row++, y += 9) {
    for (let x = 14 + (row % 2) * 5.2; x < 92; x += 10.4) hexes.push(`<polygon points="${poly(x, y, 5.6, 6, Math.PI / 6)}"/>`);
  }
  const wasp = (x: number, y: number, rot: number) => `<g transform="translate(${x} ${y}) rotate(${rot})">
      <ellipse cx="-1" cy="-3.4" rx="3" ry="2" fill="#fff6d0" opacity="0.85"/><ellipse cx="1.6" cy="-3.2" rx="2.6" ry="1.8" fill="#fff6d0" opacity="0.85"/>
      <ellipse cx="0" cy="0" rx="5" ry="2.4" fill="#ffd23a" stroke="#1a0a12" stroke-width="0.8"/>
      <path d="M-1.6 -2.2 V2.2 M1.2 -2.3 V2.3" stroke="#1a0a12" stroke-width="1.2"/>
      <circle cx="5.4" cy="0" r="1.8" fill="#1a0a12"/></g>`;
  return `<defs>
      <radialGradient id="${u}fig" cx="40%" cy="40%" r="70%"><stop offset="0" stop-color="#c04bff"/><stop offset="0.6" stop-color="#7a2a8a"/><stop offset="1" stop-color="#3a0f45"/></radialGradient>
    </defs>
    ${panel('#6a3200')}
    <g fill="#ffb02e" stroke="#7a3a00" stroke-width="1.4">${hexes.join('')}</g>
    <path d="M50 44 C63 44 72 62 72 80 C72 98 62 108 50 108 C38 108 28 98 28 80 C28 62 37 44 50 44Z" fill="url(#${u}fig)" stroke="#2a0636" stroke-width="2"/>
    <path d="M50 44 Q51 36 57 33" fill="none" stroke="#3d4a12" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M55 35 Q64 26 70 32 Q62 38 55 35Z" fill="#1e9a4a" stroke="#2a0636" stroke-width="1"/>
    <path d="M40 60 Q36 74 40 90" fill="none" stroke="#fff6d0" stroke-width="2" opacity="0.35" stroke-linecap="round"/>
    <polygon points="${poly(50, 104, 2.6, 5)}" fill="#ff5ad0"/>
    ${wasp(30, 30, -20)}${wasp(73, 62, 200)}${wasp(30, 118, 15)}`;
}

/** The Gamma Knife: a blade at the top, its gamma beam cutting down across the card. */
function gammaKnife(u: string): string {
  return `<defs>
      <linearGradient id="${u}dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0a1a"/><stop offset="1" stop-color="#2a0636"/></linearGradient>
      <linearGradient id="${u}beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaffd0"/><stop offset="0.4" stop-color="#3fff7a"/><stop offset="1" stop-color="#3fff7a" stop-opacity="0.2"/></linearGradient>
    </defs>
    ${panel(`url(#${u}dark)`)}
    <polygon points="47,53 108,124 80,141" fill="url(#${u}beam)" opacity="0.45"/>
    <polygon points="47,53 98,128 88,134" fill="url(#${u}beam)"/>
    <line x1="47" y1="53" x2="93" y2="131" stroke="#ffffff" stroke-width="1.4"/>
    <g stroke="#3fff7a" stroke-width="1" opacity="0.7"><line x1="58" y1="64" x2="70" y2="58"/><line x1="66" y1="80" x2="80" y2="76"/><line x1="52" y1="72" x2="44" y2="84"/><line x1="62" y1="90" x2="54" y2="104"/></g>
    <g transform="translate(36 34) rotate(-30)">
      <rect x="-4" y="-30" width="8" height="19" rx="2" fill="#7a2a8a" stroke="#ffd23a" stroke-width="1.2"/>
      <rect x="-8" y="-12" width="16" height="3.6" rx="1.4" fill="#ffd23a" stroke="#2a0636" stroke-width="0.8"/>
      <path d="M-4 -8.4 L4 -8.4 L3.4 14 L0 22 L-3.4 14Z" fill="#dfe6ff" stroke="#2a0636" stroke-width="1"/>
      <line x1="0" y1="-7" x2="0" y2="16" stroke="#9aa8d8" stroke-width="1"/>
    </g>
    <text x="34" y="116" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="30" fill="#3fff7a" stroke="#0a0a1a" stroke-width="0.8" text-anchor="middle">&#947;</text>`;
}

/** The deck: rank, suit and centre art for every boon. */
export const BOON_CARDS: Record<BoonId, BoonCard> = {
  rattlesnake: { rank: 'A', suit: 'lizard', art: 'a rattlesnake coiled in the desert at sunset, its rattle up', draw: rattlesnake },
  gilaHide: { rank: 'K', suit: 'lizard', art: "the Gila monster's beaded scales on a shield", draw: gilaHide },
  mindFuzz: { rank: 'A', suit: 'eye', art: 'an eye with a spiral for an iris, rays of fuzz round it', draw: mindFuzz },
  microtonal: { rank: 'Q', suit: 'eye', art: 'a banana-yellow guitar neck fretted at every quarter tone, half-sharp signs', draw: microtonal },
  sleepDrifter: { rank: 'J', suit: 'eye', art: 'a drifter asleep in a nightcap on a drifting cloud under the moon', draw: sleepDrifter },
  nuclearFusion: { rank: 'A', suit: 'flame', art: 'an atom, three orbits round a glowing nucleus', draw: nuclearFusion },
  planetB: { rank: '2', suit: 'flame', art: 'a ringed planet with a B on it, among the stars', draw: planetB },
  gammaKnife: { rank: 'K', suit: 'nonagon', art: 'a knife firing a green gamma beam down the card', draw: gammaKnife },
  figWasps: { rank: '9', suit: 'nonagon', art: 'a fig on a honeycomb with fig wasps flying round it', draw: figWasps },
};

/** A suit's sign, centred on (0, 0) about 20 across, in `fill`. */
export function suitSign(suit: Suit, fill = SUITS[suit].colour): string {
  switch (suit) {
    case 'lizard':
      return `<g fill="${fill}" stroke="${fill}" stroke-linecap="round"><ellipse cx="0" cy="-1" rx="3.2" ry="5.6" stroke="none"/><ellipse cx="0" cy="-7.6" rx="2.6" ry="2.8" stroke="none"/><path d="M-2 -3 L-6.5 -6.5 M2 -3 L6.5 -6.5 M-2 2.4 L-6.5 5.4 M2 2.4 L6.5 5.4" stroke-width="1.8" fill="none"/><path d="M0 4 Q4 8 0 10.5" stroke-width="2" fill="none"/></g>`;
    case 'eye':
      return `<path d="M-10.5 0 Q0 -9 10.5 0 Q0 9 -10.5 0Z" fill="${fill}"/><circle cx="0" cy="0" r="3.8" fill="#fff6d0"/><circle cx="0" cy="0" r="1.8" fill="#2a0636"/>`;
    case 'flame':
      return `<path d="M0 -10.5 C4 -5 8.5 -2 7.5 3.5 C6.6 8 3 10.5 0 10.5 C-3 10.5 -7 8 -7.5 3.5 C-8 -1 -4.4 -2.6 -3.4 -7 C-1.6 -3.6 0.4 -3.4 0 -10.5Z" fill="${fill}"/><path d="M0 0 C2 2.4 3.4 4 3 6.4 C2.6 8.4 -2.6 8.4 -3 6.4 C-3.4 4 -1.2 3.4 0 0Z" fill="#ffd23a"/>`;
    case 'nonagon':
      return `<polygon points="${poly(0, 0, 10, 9)}" fill="${fill}"/><polygon points="${poly(0, 0, 4.2, 9)}" fill="#fff6d0"/>`;
  }
}

let uid = 0;

/** "Ace of Lizards". */
export function cardTitle(id: BoonId): string {
  const c = BOON_CARDS[id];
  return `${RANK_NAMES[c.rank]} of ${SUITS[c.suit].name}`;
}

/** A boon's playing card as an SVG: the card, its two corner indexes, and the art. */
export function boonCardSvg(id: BoonId): string {
  const c = BOON_CARDS[id];
  const col = SUITS[c.suit].colour;
  const u = `bc${++uid}-`;
  const corner = `<text x="10.5" y="20" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="${c.rank.length > 1 ? 13 : 16}" text-anchor="middle" fill="${col}">${c.rank}</text><g transform="translate(10.5 30) scale(0.62)">${suitSign(c.suit)}</g>`;
  return `<svg class="boon-svg" viewBox="0 0 100 140" role="img" aria-label="${esc(`${cardTitle(id)}: ${BOONS[id].name}`)}" data-boon="${id}">
    <defs><clipPath id="${u}panel"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="4"/></clipPath></defs>
    <rect x="1.5" y="1.5" width="97" height="137" rx="8" fill="#fff6d0" stroke="#2a0636" stroke-width="2"/>
    <g clip-path="url(#${u}panel)">${c.draw(u)}</g>
    <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="4" fill="none" stroke="${col}" stroke-width="2"/>
    ${corner}
    <g transform="rotate(180 50 70)">${corner}</g>
  </svg>`;
}

export function isBoonId(id: string): id is BoonId {
  return (BOON_IDS as string[]).includes(id);
}

/** Whether a card's choices are all boons (the boon chooser). */
export function isBoonChoice(opts: readonly { id: string }[]): boolean {
  return opts.length > 0 && opts.every((o) => isBoonId(o.id));
}

let dealt = '';

/** The boon chooser's offer as a fan of cards, `at` lit and lifted; each with its name and effect under it. */
export function boonChoiceHtml(opts: readonly { id: string; name: string; blurb: string }[], at: number): string {
  const key = opts.map((o) => o.id).join();
  // Dealt in once as the offer shows, not again as the arrows move along it.
  const deal = key !== dealt;
  dealt = key;
  const mid = (opts.length - 1) / 2;
  const cards = opts
    .map((o, i) => {
      const id = o.id as BoonId;
      return `<button class="boon-pick${i === at ? ' on' : ''}" data-pick="${esc(o.id)}" style="--i:${i};--off:${i - mid}">
        <span class="boon-card">${boonCardSvg(id)}</span>
        <span class="boon-name">${esc(o.name)}</span>
        <span class="boon-of">${cardTitle(id)}</span>
        <span class="boon-text">${esc(o.blurb)}</span>
      </button>`;
    })
    .join('');
  return `<div class="boon-row${deal ? ' deal' : ''}">${cards}</div>`;
}

/** The run's hand: every boon held as a small card, doubles stacked with a count. */
export function boonHandHtml(deck: readonly { name: string; text: string; count: number }[]): string {
  const cards = deck
    .map((b) => {
      const id = BOON_IDS.find((k) => BOONS[k].name === b.name);
      if (!id) return '';
      const under = '<i class="boon-mini-under"></i>'.repeat(Math.min(b.count, 4) - 1);
      return `<div class="boon-mini" title="${esc(`${b.name}${b.count > 1 ? ` x${b.count}` : ''}: ${b.text}`)}" style="--k:${Math.min(b.count, 4) - 1}">
        <span class="boon-mini-stack">${under}<span class="boon-mini-card">${boonCardSvg(id)}</span>${b.count > 1 ? `<b class="boon-mini-count">&times;${b.count}</b>` : ''}</span>
        <span class="boon-mini-name">${esc(b.name)}</span>
      </div>`;
    })
    .join('');
  return `<div class="boon-hand"><div class="story-kicker">Your hand</div>${cards ? `<div class="boon-hand-cards">${cards}</div>` : '<div class="story-footer">Empty so far: this pick is its first card.</div>'}</div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
