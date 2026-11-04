/**
 * The scenery toolkit: proven parts for a track's world, factored out of
 * what the richest worlds (Gaia, The Grim Reaper, Hot Wax, Sadie Sorceress,
 * Billabong Valley, Empty) each built for themselves. A track's render
 * module (`src/render/<track>.ts`) imports from here; this imports no
 * shared render system (trackView, trackDetail, trackLife, themes), so
 * there's no cycle. docs/DEVELOPMENT.md, "Building a world", shows how to
 * put a stretch together from it.
 *
 * - base: shared materials (`matte`, `lit`, `palette`), `glowSprite`,
 *   `smokeSprite`, `weighted`, `jitter`, `once`, canvases.
 * - road: `frameAt`, `offRoad`, `beside`, `clearance`, `inPits`,
 *   `standsClear`, `nearOtherStretch`, `sectionNamer`, `stretch`,
 *   `faceToward`, `faceOncoming`.
 * - scatter: `scatter` (varied props along a stretch, off the roads and
 *   pits), `scatterInstanced` (one mesh many times, colour-jittered),
 *   `scatterSites` (just the places).
 * - crowd: `crowd` (rows of figures facing the road, moving on the beat,
 *   holding lights up).
 * - signs: `textFace` (board, neon, poster), `signPanel`, `roadBanner`,
 *   `buzz`.
 * - fire: `flame`, `torch`, `lamp`, `fire`, `lightPool`, `flicker`.
 * - air: `motes`, `smokeColumn`, `swarm`, `flock`.
 * - skyline: `skyline` (a ring of towers, spires, hills, domes or stacks
 *   round the play area, windows lit, beacons blinking).
 * - setPiece: `setPiece` (a body on a base with a glow, moving),
 *   `standBeside` (off the road, facing the karts).
 * - beat: `beat(bpm)` (phase, kick, pulse, sway, count), `finalLap`.
 */
export * from './base';
export * from './road';
export * from './beat';
export * from './scatter';
export * from './crowd';
export * from './signs';
export * from './fire';
export * from './air';
export * from './skyline';
export * from './setPiece';
