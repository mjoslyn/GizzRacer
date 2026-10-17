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

Milestone 1 (driving feel on a flat test track):

- Fixed 60 Hz physics with interpolated rendering (`src/core/loop.ts`)
- Keyboard + standard gamepad input as pure `InputFrame` data (`src/core/input.ts`)
- Arcade kart controller: per-racer stats, engine classes, off-road penalty, hop, 3-tier drift boosts, boost pads, walls (`src/physics/kart.ts`)
- Spline track with surface queries, start grid and checkpointed lap counting (`src/tracks`)
- Chase camera, placeholder kart model with sparks/flame, HUD with drift meter and lap times

Dev keys: `1`-`6` switch racer, `C` cycle class, `R` reset.
