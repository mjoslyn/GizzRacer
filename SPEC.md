# GizzRacer Spec v0.1

## 1. Overview
- 3D arcade kart racer in the browser, built with Three.js
- Single player vs CPU racers, one kart per racer so every kart looks different: 8 racers, so 7 CPUs. Online multiplayer deferred
- Psychedelic garage-rock world with original characters
- Target: 60 fps on a mid-range laptop, Chrome/Firefox/Safari, keyboard, gamepad and touch (phones and tablets, iOS included)
- Phones play in landscape, fullscreen where the browser allows it (installable web app for iPhone)

## 2. MVP Scope
- 1 cup (4 tracks), 8 racers (6 in the MVP, plus Neon Moth and Cosmic Coyote), 5 items
- Modes: Grand Prix, Time Trial
- 3 difficulty classes: 50cc, 100cc, 150cc
- Out of scope for MVP: online, battle mode

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

Touch: drag on the left half to steer (analog), DRIFT and BRAKE buttons on the right, pause at the bottom; acceleration is automatic. The first tap also unlocks audio (iOS needs a gesture).

## 4. Kart Physics (custom arcade, not rigid body)
- Kart is a sphere collider for ground contact plus a visual model that tilts and bounces
- Stats per racer (1 to 5): top speed, acceleration, weight, handling, drift
- Off-road surfaces cut top speed by 40%
- Drift: hold while turning; sparks charge in 3 tiers (blue 0.3s, orange 0.6s, purple 0.95s) for 0.5s / 1.0s / 1.5s boosts
- Ramps: press hop at the lip for a trick boost on landing
- Weight affects bump knockback between karts
- Fall-off: respawn at last checkpoint after 1.5s

## 5. Racers
| Racer | Speed | Accel | Weight | Handling | Drift |
|---|---|---|---|---|---|
| Lizard Warlock | 3 | 3 | 3 | 3 | 4 |
| Cyborg Gourmand | 4 | 2 | 4 | 2 | 3 |
| Gila Rider | 3 | 5 | 2 | 3 | 3 |
| Swamp Witch | 3 | 2 | 3 | 5 | 4 |
| Microtonal Monk | 3 | 3 | 2 | 4 | 3 |
| Fuzz Golem | 5 | 1 | 5 | 1 | 3 |
| Neon Moth | 2 | 5 | 2 | 4 | 5 |
| Cosmic Coyote | 4 | 2 | 3 | 2 | 3 |

Tuned with `npm run balance` (all-CPU races on every track at 100cc and 150cc) so no stat dominates: average finishing places run from about 3.5 to 5.5 of 8, and every racer reaches the podium. A speed point is worth about 2.7% top speed.

All designs are original. No likenesses of band members or album art. Every racer has their own character model and kart body (render/racerModels.ts).

## 6. Items
| Item | Effect | Odds bias |
|---|---|---|
| Fuzz Pedal | 1.2s speed boost | All positions |
| Microtonal Mine | Dropped trap, wobbles steering 1.5s | Front |
| Feedback Wave | Radial spin-out, 8m range | Middle |
| Riff Missile | Homes on next racer ahead | Middle/back |
| Tempo Shift | Others slowed 3s | Last 2 only |

- Item boxes respawn 3s after pickup
- One item held at a time, after a 1s roulette
- Hit karts are briefly immune (spin-outs: 1s longer than the spin)
- CPUs use items at a good moment (a straight for the Fuzz Pedal, a kart on their tail for a mine, company for the Feedback Wave) with a chance set by class; otherwise after a random wait

## 7. Tracks (Cup 1)

Each track has its own theme (render/themes.ts): desert (Rattlesnake Run), green speedway hills (Infinite Loop Speedway), basalt and lava (Volcano Fortress), jungle (Polygondwanaland Jungle). Not everything is desert.

1. Infinite Loop Speedway (easy): a figure-8 (an infinity sign from above), about 1.4 km. Wide road, two big loops, and two long straights that cross in the middle: one passes under, the other flies over on a 9 m overpass on pillars. Start gantry with the track name. No hazards
2. Rattlesnake Run (medium, detailed below)
3. Volcano Fortress (hard): Ash Plain, Lava Switchbacks, Fortress Gate (a walled basalt corridor behind two gatehouses), Magma Bridge (no rails, over a lava lake), Caldera Rim. Hazards: lava bombs that fall glowing onto the plain and the rim and smoulder on the road; flame jets that sweep across the whole fortress road on a rhythm (they sputter as a warning first)
4. Polygondwanaland Jungle (hard): Canopy Run, Vine Hairpins, River Jump, Polygon Ruins (through a stepped temple gate), Waterfall Bend. Hazards: logs swinging across the hairpin straights on vines; faceted polygon boulders rolling back and forth across the ruins

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
5. Snake's Mouth Shortcut: jump ramp into a fanged cave over a 20 m gap; at 50cc it takes a boost to clear, from 100cc a kart at full speed makes it
6. Mesa Leap: big ramp over a dry riverbed into the finish straight

**Hazards**
- Rattlesnakes slithering across the S-Bends on a loop (spin-out on contact)
- Dust devils that wander the Salt Flat and push karts sideways
- Tumbleweeds bouncing through Rattle Canyon (slow you down)
- Boulders that fall into Rattle Canyon on a rhythm: a warning ring, the drop, then a rock on the road until it crumbles
- Hazard motion is a pure function of race time, so it replays and syncs by the clock alone

**Psychedelic layer**
- Heat haze distortion shader, stronger on the straights
- Sky slowly cycles through hues: a full turn of the color wheel over the 3 laps, back to normal at the flag
- Lap 3: kaleidoscope pulse on screen edges synced to the music beat
- Diamond-back patterned textures scroll along the track barriers
- Built (Milestone 6): one post pass (render/postfx.ts) for haze and kaleidoscope, skipped when neither is on. The kaleidoscope runs on every track's final lap. Extras: off-road wheel dust, a pre-race flyover with a title card

**Music:** original driving motorik beat, chant-style hook, microtonal-inflected guitar; tempo rises slightly on the final lap.

## 8. CPU Racers
- Follow a waypoint spline with per-racer lateral offset and racing line variation
- Difficulty controls top speed cap, drift usage, and item intelligence
- Mild rubber-banding: trailing CPUs get up to +8% speed, leaders get none

## 9. Game Flow and UI
- Title > Mode select > Class > Racer select > Cup/Track > Race > Results > Next race
- Now: Title > picker (mode, track, racer, class) > Race (3 laps) > Results > Cup standings > next race ... > Podium (Grand Prix); Single Race and Time Trial go back to the picker after the results. CPUs race the chosen track behind the title and picker
- Grand Prix grid: first race as picked (player in 5th), then the standings reversed so the leader starts at the back. Ties go to the better place in the latest race
- Time Trial: alone, no item boxes, best total and lap per track and class saved in the browser
- Extra mode beyond the spec: Single Race (any track, full field)
- HUD: position, lap counter, item slot, minimap, timer, drift spark meter
- Grand Prix points: 15, 12, 10, 8, 6, 4, 2, 1

## 10. Audio
- Music: the seqbaby soundtrack pre-rendered to looping MP3s (tools/render-soundtrack.mjs), played with Web Audio for sample-accurate loops
- SFX: synthesized on the same AudioContext (audio/sfx.ts), no sample files. Mix: music around -22 dB RMS, one-shots around -20 dB with the music ducking under them, engine a quieter bed; tires squeal in drifts and hard turns on tarmac
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
