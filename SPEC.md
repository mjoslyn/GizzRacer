# GizzRacer Spec v0.1

## 1. Overview
- 3D arcade kart racer in the browser, built with Three.js
- Single player vs CPU racers, one kart per racer so every kart looks different: a roster of 20, twelve to a race, so 11 CPUs drawn at random from the rest with no repeats (a new draw each time the picker starts a race or cup; a restart keeps the field, and a cup keeps the same twelve for every race). Online rooms fill the places humans leave with CPUs the same way
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

Touch: drag on the left half to steer (analog), DRIFT and BRAKE buttons on the right, pause at the bottom, and a tap anywhere else on the screen (or a quick tap on the steering side) hops, so a tap at a ramp lip is a trick; acceleration is automatic. The first tap also unlocks audio (iOS needs a gesture).

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
| Mantis Shredder | 3 | 4 | 2 | 3 | 4 |
| Gator Drummer | 4 | 2 | 4 | 2 | 3 |
| Mushroom Sage | 3 | 3 | 2 | 4 | 4 |
| Arlo | 3 | 4 | 2 | 4 | 3 |
| Octo Organist | 4 | 2 | 3 | 2 | 3 |
| Amby | 3 | 5 | 2 | 3 | 3 |
| Cavs | 4 | 2 | 3 | 2 | 3 |
| Cookie | 3 | 2 | 3 | 5 | 4 |
| Jason | 3 | 4 | 2 | 3 | 4 |
| Joey | 3 | 3 | 2 | 4 | 3 |
| Lukey | 4 | 2 | 4 | 2 | 3 |
| Stu | 3 | 3 | 3 | 3 | 4 |

Tuned with `npm run balance` (all-CPU races on every track at 100cc and 150cc, twelve-kart fields drawn round the roster) so no stat dominates: average finishing places run from about 5.3 to 8.2 of 12, and every racer reaches the podium. A speed point is worth about 2.7% top speed.

All designs are original, with no album art. The band races too, with their blessing, under their nicknames, in alphabetical order on the picker: Amby (a chrome harmonica racer, harmonica raised), Cavs (rolling on two bass drums, sticks up), Cookie (a synth-guitar hybrid: a keytar body with a keyboard down the deck and a fretted neck out front), Jason, their visual artist (a rolling lighting rig with moving heads sweeping their beams), Joey (a modular-synth buggy with patch cables, its back pink and signed "Yikes" in script), Lukey (an 8x10 bass cab on wheels) and Stu (riding the Flying Microtonal Banana: a giant banana that is also a guitar, its neck fretted in quarter tones, a flute on his back). They're drawn in the NBA Jam manner, big sculpted heads on smaller bodies, their hair, moustaches, glasses and colouring taken from photos, all in work coveralls with their names on the patch. Every racer has their own character model and vehicle (render/racerModels.ts), and not every vehicle is a kart: Gila Rider flies a rotor chopper, Swamp Witch a fan hovercraft, Microtonal Monk a levitating lotus, Mushroom Sage a toadstool saucer, Mantis Shredder rides a monowheel and Gator Drummer a tracked kick-drum tank, and Arlo (an apricot standard poodle, all curls, ears flapping and tail wagging) drives a plush dog bed on wheels with a tennis ball on the front. All of them drive with the same kart physics; the difference is in the look (hovering craft bob and bank, leave no skid marks, and their drift kicks up ground instead of tire smoke). Drivers lean into turns and look where they steer, and every racer has their own trick move.

## 6. Items
| Item | Effect | Odds bias |
|---|---|---|
| Fuzz Pedal | 1.2s speed boost | All positions |
| Microtonal Mine | Dropped trap, wobbles steering 1.5s | Front |
| Feedback Wave | Radial spin-out, 8m range | Middle |
| Riff Missile | Homes on next racer ahead | Middle/back |
| Tempo Shift | Others slowed: 4s for the leader down to 1.5s for last place | Last 2 only |
| Woo Cannon | Turns you into a cannon shell that flies itself down the road at 1.9x top speed, immune, spinning out anyone it touches, until it has caught the pack (the middle of the field) and gone 5 to 45 m past it (1.5 to 9 s); never lets go over a pit. The woo loops for the whole flight | Last 3 only, likelier further back |

- Item boxes respawn 3s after pickup
- One item held at a time, after a 1s roulette
- Hit karts are briefly immune (spin-outs: 1s longer than the spin)
- CPUs use items at a good moment (a straight for the Fuzz Pedal, a kart on their tail for a mine, company for the Feedback Wave) with a chance set by class; otherwise after a random wait

## 7. Tracks (Cup 1: the Nonagon Cup)

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

### Cup 2: the Microtonal Cup

Four harder tracks: narrower roads, short straights, more corners, each sized for about 1:45 a race at 150cc (CPU winner times, `TrackBuilder.scale`).

1. Fishies Lagoon (Fishing for Fishies): a sand road over a shallow turquoise lagoon (off-road is wading), a plank causeway low over deeper water with fish leaping across it, Fish Leap, Reef Esses, a walled pier jump, Palm Shuffle, and a striped lighthouse with a sweeping beam
2. Ice V Glacier (Ice, Death, Planets...): ice sections where turning momentum carries karts wide (`ICE_SLIDE`), an Icicle Chicane, a crevasse jump, four hairpins between walls, and a frozen lake with ice blocks skating across. Ice arches over the road
3. Cyboogie City (Han-Tyumi): neon downtown at night with lit towers, a tight walled alley of right angles, an elevated freeway on pillars, and laser gates that warn, then fire across the whole road, on a rhythm
4. Butterfly 3000 Skyway (Butterfly 3000): a rainbow road in a pastel sky with no ground (leave the road and you fall to the respawn), butterfly swarms in the walled garden that buffet karts, a star leap over the void, chrysalis hairpins, and an open, unwalled Metamorphosis Mile. Rainbow arches; the cup's finale, with a final-lap music cut

### Cup 3: the Apocalypse Cup

Four ends of the world, all hard, each with its own songs (a lap theme and a faster final-lap cut). Race order: Hell on Mars, Supercell, Murder of the Universe, Petrodragonic Apocalypse.

1. Hell on Mars (Infest the Rats' Nest): a colony on the red planet, overrun and burning, under a rust-and-blood sky. Landing Strip under an airlock gate (two pressure towers, beacons, a HELL ON MARS sign, one tower on fire), Hab Chicane, Olympus Climb, Valles Rift (a leap from the heights over a rift of lava), Crater Rim, the Rats' Nest (a walled run of tight wiggles) and Meteor Mile. Hazards: meteors that streak down trailing fire, land and smoulder on the road; dust devils roaming the crater rim. Scenery: glass domes over hydroponics, habs on legs with blinking beacons, a crashed rocket nose-down and smoking, wrecked rovers, comms dishes still turning, solar arrays, hoodoos and craters
2. Supercell (PetroDragonic Apocalypse): prairie roads under a county-sized storm in green-black light, rain sheeting down and lightning lighting up the sky. County Road under two lightning-rod pylons arcing between their tips, Tornado Alley (tornadoes wander the road flinging karts round and out), the Silo Hairpins, Hailstone Farm (hail the size of boulders), a rail-less bridge over a flooded creek, the Washout jump and Downdraft. Lightning strikes where a ring of warning closes, spinning out anyone inside it. Scenery: farmhouses with their roofs torn away, silos, windpumps spinning flat out, leaning telephone poles, hay bales, trees bent over in the wind, scattered roofing
3. Murder of the Universe: a road of starlight over nothing (leave it and you fall), under dead planets. Event Horizon through a chrome ring with a great eye on top, the Lord of Lightning straight, Balrog Bend, a Void Leap, the Dead Star Spiral and the Han-Tyumi Straight. Hazards: black holes drifting across the road that drag karts round and in and spin out anyone who touches the core; lightning strikes. Scenery floats at every height: asteroids, ringed planets, glowing crystals, chrome cyborg heads with one red eye, giant watching eyeballs
4. Petrodragonic Apocalypse, detailed below

### Petrodragonic Apocalypse (hard)

A burning oil field under a black, smoke-choked sky with a blood-red sun, a dragon circling overhead. Narrow roads; Ashen Grid under a giant dragon skull, Derrick Row (burning crude rains down), Crude Slick (an oil surface that slides like ice), Dragon's Gullet (a walled corridor where dragons rear up at the edge and breathe fire across the whole road on a rhythm, their jaws opening and throats glowing first), Burning Moat (a jump over a pit of burning oil), Wyrm Coil (hairpins on the slick), Skull Bridge (no rails over an oil lake) and Apocalypse Mile. Scenery: nodding pumpjacks, burning barrels, dead trees, dragon bones, flaring derricks, tar pits. It closes the Apocalypse Cup.

### Generated tracks

The Track Generator mode builds a track at race time from a seed and three dials: theme (desert, speedway, volcano, jungle, lagoon, glacier, neon city, sky, petrodragonic, mars, supercell, void), twists (complexity 1 to 5) and length (short about 0.85 km, medium 1.2 km, long 1.7 km). Each theme brings its road surfaces, liquid for bridges and jumps, hazards, landmarks, music and words for names. The layout is a rectangle skeleton whose sides are filled with modules (straights, S-bends, esses, chicanes, switchback hairpins, jumps, bridges), each measured before it's placed so the sides keep their length; the last two sides aim for the final corner, which a Dubins path closes onto the finish line. A layout that crosses itself or needs a loop to get home is re-rolled from the same seed, so a seed always builds the same track. Every track gets a name (Gizzard-ish adjective, theme place, kind of course); after a race it can be saved under that name or another. Saved tracks are kept in the browser as seed and dials.

## 8. CPU Racers
- Follow a waypoint spline with per-racer lateral offset and racing line variation
- Difficulty controls top speed cap, drift usage, and item intelligence
- Mild rubber-banding: trailing CPUs get up to +8% speed, leaders get none

## 9. Game Flow and UI
- Title > Mode select > Class > Racer select > Cup/Track > Race > Results > Next race
- Now: Title > picker (mode, track, racer, class; while the racer row is in use, the screen behind it is a gallery of every racer on a carousel that turns to the one chosen, `src/render/gallery.ts`) > Race (3 laps) > Results > Cup standings > next race ... > Podium (Grand Prix); Single Race and Time Trial go back to the picker after the results. CPUs race the chosen track behind the title and picker
- Grand Prix grid: first race as picked (player in 5th), then the standings reversed so the leader starts at the back. Ties go to the better place in the latest race
- Time Trial: a single lap, alone, no item boxes, best total and lap per track and class saved in the browser. The fastest run per track and class is recorded (15 samples/s, about 75 KB) and replays as a see-through ghost
- Extra mode beyond the spec: Single Race (any track, full field)
- HUD: position, lap counter, item slot, minimap, timer, drift spark meter
- Grand Prix points: 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 (twelve to a race)

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
- Network-ready: inputs and state kept separate; online play runs on PartyKit (docs/MULTIPLAYER.md)

## 12. Milestones
1. Driving feel on a flat test track
2. Rattlesnake Run greybox with laps and checkpoints
3. CPU racers
4. Items and hazards
5. Menus, racer select, Grand Prix
6. Art and shader pass on Rattlesnake Run
7. Remaining 3 tracks
8. Online multiplayer on PartyKit (Cloudflare Durable Objects): see [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) (8a online Time Trial runs and ghosts, 8b rooms, 8c race netcode, 8d hardening)

## 13. Open Questions
- Public release or private fan project? (affects naming and band references)
- ~~Art style~~: decided. Early-2000s console, high res: sharp tiled textures, Phong-shaded glossy karts with sky reflections, painted skybox with lens flare, blob shadows, distance fog, chunky gradient HUD lettering
- Music: written in seqbaby (account `gizzracer`): title theme, one theme per track of both cups, faster final-lap cuts of Rattlesnake Run and Butterfly 3000 Skyway, and a podium loop
