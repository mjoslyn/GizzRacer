# GizzRacer

Browser kart racer built with Three.js. See [SPEC.md](SPEC.md).

## Run

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # vitest
npm run build     # typecheck + production build
```

## Status

Milestones 1 to 3 are in: driving feel, the Rattlesnake Run greybox, and CPU racers.

- Fixed 60 Hz physics with interpolated rendering (`src/core/loop.ts`)
- Keyboard + standard gamepad input as pure `InputFrame` data, auto-accelerate by default (`src/core/input.ts`)
- Arcade kart controller: per-racer stats, engine classes, off-road penalty, fine steering (gradual ramp-in, response curve), hop, 3-tier drift boosts, ramps that launch off their lip, trick boosts, boost pads, walls (`src/physics/kart.ts`)
- Track model: turtle-style builder (`src/tracks/builder.ts`), ribbons with per-section width, walls, surface and elevation, jump gaps over pits, branch shortcuts (`src/tracks/track.ts`)
- Rattlesnake Run: Salt Flat Straight, Sidewinder S-Bends, Rattle Canyon, The Coil (a double spiral), Dry Wash with the boost-only Snake's Mouth shortcut, Mesa Leap (`src/tracks/rattlesnakeRun.ts`)
- Race: checkpointed laps, fall detection and respawn at the last checkpoint after 1.5 s (`src/core/race.ts`)
- CPU racers (`src/ai/cpuDriver.ts`): own racing lane, corner braking, drifts for mini-turbos, steer around karts ahead, recover when stuck; difficulty follows the class; mild rubber-banding; kart bumps by weight; positions and results
- Soundtrack from seqbaby (account `gizzracer`), looping per track with a faster cut on the final lap, a title theme and a podium loop (`src/audio/music.ts`)
- Early-2000s look: procedural high-res textures, painted sky, lens flare, glossy karts, particle sparks, blob shadows, minimap, section banners

Controls: auto-accelerate, arrows steer, Down brakes/reverses, Shift/Space hop+drift (tap at a ramp lip for a trick), Q look back, Esc pause.

Dev keys: `1`-`6` switch racer, `C` cycle class, `T` switch track, `M` toggle manual throttle, `N` music on/off, `R` restart. In the console, `gizz.warp(0.5)` jumps to halfway round the lap.

## Soundtrack

The songs live in seqbaby. `public/music/*.mp3` are rendered from them by playing each song in headless Chromium through seqbaby's own engine:

```sh
# needs ../mjoslyn/seqbaby and ../seqbaby-seed checkouts (or SEQBABY_DIR / SEQBABY_SEED_DIR)
node tools/render-soundtrack.mjs            # all cues
node tools/render-soundtrack.mjs podium     # one cue
```
