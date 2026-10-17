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

Milestone 1 (driving feel) and Milestone 2 (Rattlesnake Run greybox) are in.

- Fixed 60 Hz physics with interpolated rendering (`src/core/loop.ts`)
- Keyboard + standard gamepad input as pure `InputFrame` data, auto-accelerate by default (`src/core/input.ts`)
- Arcade kart controller: per-racer stats, engine classes, off-road penalty, fine steering (gradual ramp-in, response curve), hop, 3-tier drift boosts, ramps that launch off their lip, trick boosts, boost pads, walls (`src/physics/kart.ts`)
- Track model: turtle-style builder (`src/tracks/builder.ts`), ribbons with per-section width, walls, surface and elevation, jump gaps over pits, branch shortcuts (`src/tracks/track.ts`)
- Rattlesnake Run: Salt Flat Straight, Sidewinder S-Bends, Rattle Canyon, The Coil (a double spiral), Dry Wash with the boost-only Snake's Mouth shortcut, Mesa Leap (`src/tracks/rattlesnakeRun.ts`)
- Race: checkpointed laps, fall detection and respawn at the last checkpoint after 1.5 s (`src/core/race.ts`)
- Early-2000s look: procedural high-res textures, painted sky, lens flare, glossy karts, particle sparks, blob shadows, minimap, section banners

Controls: auto-accelerate, arrows steer, Down brakes/reverses, Shift/Space hop+drift (tap at a ramp lip for a trick), Q look back, Esc pause.

Dev keys: `1`-`6` switch racer, `C` cycle class, `T` switch track, `M` toggle manual throttle, `R` restart. In the console, `gizz.warp(0.5)` jumps to halfway round the lap.
