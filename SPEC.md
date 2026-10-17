# GizzRacer Spec v0.1

## 1. Overview
- 3D arcade kart racer in the browser, built with Three.js
- Single player vs CPU racers, one kart per racer so every kart looks different (5 CPUs with the MVP's 6 racers; 7 once the roster reaches 8). Online multiplayer deferred
- Psychedelic garage-rock world with original characters
- Target: 60 fps on a mid-range laptop, Chrome/Firefox/Safari, keyboard and gamepad

## 2. MVP Scope
- 1 cup (4 tracks), 6 racers, 5 items
- Modes: Grand Prix, Time Trial
- 3 difficulty classes: 50cc, 100cc, 150cc
- Out of scope for MVP: online, battle mode, mobile touch controls

## 3. Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | Automatic (M toggles manual: W / Up) | Automatic (manual: A) |
| Brake / Reverse | S / Down | B |
| Steer | Left, Right / A, D | Left stick |
| Drift / Hop | Shift / Space | R1 |
| Use item | E | L1 |
| Look back | Q | Y |
| Pause | Esc | Start |

## 4. Kart Physics (custom arcade, not rigid body)
- Kart is a sphere collider for ground contact plus a visual model that tilts and bounces
- Stats per racer (1 to 5): top speed, acceleration, weight, handling, drift
- Off-road surfaces cut top speed by 40%
- Drift: hold while turning; sparks charge in 3 tiers (blue 0.45s, orange 0.9s, purple 1.4s) for 0.5s / 1.0s / 1.5s boosts
- Ramps: press hop at the lip for a trick boost on landing
- Weight affects bump knockback between karts
- Fall-off: respawn at last checkpoint after 1.5s

## 5. Racers
| Racer | Speed | Accel | Weight | Handling |
|---|---|---|---|---|
| Lizard Warlock | 3 | 3 | 3 | 3 |
| Cyborg Gourmand | 4 | 2 | 4 | 2 |
| Gila Rider | 3 | 5 | 2 | 3 |
| Swamp Witch | 2 | 3 | 3 | 5 |
| Microtonal Monk | 3 | 3 | 2 | 4 |
| Fuzz Golem | 5 | 1 | 5 | 2 |

All designs are original. No likenesses of band members or album art.

## 6. Items
| Item | Effect | Odds bias |
|---|---|---|
| Fuzz Pedal | 1.2s speed boost | All positions |
| Microtonal Mine | Dropped trap, wobbles steering 1.5s | Front |
| Feedback Wave | Radial spin-out, 8m range | Middle |
| Riff Missile | Homes on next racer ahead | Middle/back |
| Tempo Shift | Others slowed 3s | Last 2 only |

- Item boxes respawn 3s after pickup
- One item held at a time

## 7. Tracks (Cup 1)
1. Infinite Loop Speedway (easy)
2. Rattlesnake Run (medium, detailed below)
3. Volcano Fortress (hard)
4. Polygondwanaland Jungle (hard)

### Rattlesnake Run
**Visual direction:** sun-scorched desert in the spirit of the Rattlesnake visuals: burnt orange sand, red rock, cobalt sky, shimmering heat haze, hypnotic repetition. Original assets, not a recreation of the video.

**Layout**
- Track shape is a giant coiled snake seen from above: serpentine S-curves that tighten into a spiral near the end of each lap
- About 1.9 km per lap, 3 laps, ~90s per lap at 100cc (longer than the first draft by choice)
- Start line under an arch made from a huge bleached snake skeleton

**Sections**
1. Salt Flat Straight: wide, cracked white ground, boost pads, item boxes
2. Sidewinder S-Bends: six alternating curves built for chained drifts
3. Rattle Canyon: narrow red rock walls; giant rattle tails shake and drop boulders on a rhythm
4. The Coil: inward spiral with banked walls, built for mini-turbos
5. Snake's Mouth Shortcut: jump ramp into a fanged cave, needs a boost to clear the gap
6. Mesa Leap: big ramp over a dry riverbed into the finish straight

**Hazards**
- Rattlesnakes slithering across the S-Bends on a loop (spin-out on contact)
- Dust devils that wander the Salt Flat and push karts sideways
- Tumbleweeds bouncing through Rattle Canyon

**Psychedelic layer**
- Heat haze distortion shader, stronger on the straights
- Sky slowly cycles through hues each lap
- Lap 3: kaleidoscope pulse on screen edges synced to the music beat
- Diamond-back patterned textures scroll along the track barriers

**Music:** original driving motorik beat, chant-style hook, microtonal-inflected guitar; tempo rises slightly on the final lap.

## 8. CPU Racers
- Follow a waypoint spline with per-racer lateral offset and racing line variation
- Difficulty controls top speed cap, drift usage, and item intelligence
- Mild rubber-banding: trailing CPUs get up to +8% speed, leaders get none

## 9. Game Flow and UI
- Title > Mode select > Class > Racer select > Cup/Track > Race > Results > Next race
- HUD: position, lap counter, item slot, minimap, timer, drift spark meter
- Grand Prix points: 15, 12, 10, 8, 6, 4, 2, 1

## 10. Audio
- Music: the seqbaby soundtrack pre-rendered to looping MP3s (tools/render-soundtrack.mjs), played with Web Audio for sample-accurate loops. Howler.js still an option for SFX
- Engine pitch tied to speed; fuzz distortion on boosts
- Positional audio for hazards and nearby karts

## 11. Architecture
- Vite + TypeScript + Three.js
- `/core` game loop (fixed 60 Hz physics, interpolated render)
- `/physics` kart controller, collisions
- `/tracks` track data (spline, checkpoints, item boxes, hazards) as JSON + glTF meshes
- `/ai` CPU drivers
- `/items`, `/ui`, `/audio`
- Network-ready: inputs and state kept separate so Supabase Realtime can be added later

## 12. Milestones
1. Driving feel on a flat test track
2. Rattlesnake Run greybox with laps and checkpoints
3. CPU racers
4. Items and hazards
5. Menus, racer select, Grand Prix
6. Art and shader pass on Rattlesnake Run
7. Remaining 3 tracks
8. Online multiplayer

## 13. Open Questions
- Public release or private fan project? (affects naming and band references)
- ~~Art style~~: decided. Early-2000s console, high res: sharp tiled textures, Phong-shaded glossy karts with sky reflections, painted skybox with lens flare, blob shadows, distance fog, chunky gradient HUD lettering
- Music: first pass written in seqbaby (account `gizzracer`): title theme, one theme per Cup 1 track, a faster final-lap cut of Rattlesnake Run and a podium loop
