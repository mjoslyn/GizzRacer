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
- Smart steering (Settings > Steering: Smart, the default, or Manual; `src/physics/steerAssist.ts`), after Mario Kart's: it looks half a second ahead and steers you back in before you run off an edge (firmly at an open edge or a drop, lightly at a wall, never where a shortcut peels off), and with the stick let go it eases the nose back in line with the road on straights and gentle bends. You can always steer through it; CPUs don't use it
- Drift: hold while turning, Mario Kart style: a steady arc you hold through the corner, the nose angled in. Centred it's gentler than full lock gripping, steering in tightens it to about full lock, steering out opens it up; the kart slides a little wide of its nose, more when steered hard into the drift (CPUs yaw into their own slide). Gripping, it holds its line: only a little momentum carries wide through a turn on the road (more on dirt, a lot on ice and oil) and dies away fast. How far a kart skids wide, gripping or drifting, scales with its handling stat (`KartParams.slide`: handling 3 is the surface's own slide, handling 1 a fifth more, handling 5 a fifth less; wider than that and the low-handling CPUs slid off the edges), so a Fuzz Golem runs wide where Beowulf's Witch holds the line; sparks charge in 4 tiers (blue 0.15s, orange 0.3s, purple 0.475s, rainbow 0.8s) for 0.5s / 1.0s / 1.5s / 2.1s boosts; the rainbow is the expert's reward for holding a purple on through the corner (CPUs reach it at 200cc only). The charge hums higher toward purple, and each release kicks the camera's field of view
- Rocket start: hop in the last half second before GO for a 1 s boost off the line; hop earlier than that (after the 3) and the engine bogs for 0.7 s. CPUs get rocket starts by skill
- Slipstream: tucked in behind a kart at speed (3 to 22 m back, nearly in line) a draft charges over 1.1 s, with wind rising, then fires a 0.9 s boost
- Ramps and kickers: press hop at the lip for a trick boost on landing. Tricks landed within 3 s of each other are a streak: each one boosts 40% longer, up to x4. Kickers (`TrackBuilder.kicker`) are short full-width ramps with a sheer drop, on most tracks' straights. CPUs trick off lips by skill
- Weight affects bump knockback between karts; bumps thud and clank
- Fall-off: respawn at the last checkpoint after 1 s, rolling at half speed with a little boost and 1.5 s of immunity

## 5. Racers
| Racer | Speed | Accel | Weight | Handling | Drift |
|---|---|---|---|---|---|
| Lizard Wizard | 3 | 3 | 3 | 3 | 4 |
| Han-Tyumi | 4 | 2 | 4 | 2 | 3 |
| Gila Rider | 3 | 5 | 2 | 3 | 3 |
| Beowulf's Witch | 3 | 2 | 3 | 5 | 4 |
| Microtonal Monk | 3 | 3 | 2 | 4 | 3 |
| Fuzz Golem | 5 | 1 | 5 | 1 | 3 |
| Blue Morpho | 2 | 5 | 2 | 4 | 5 |
| Mad Dog Morgan | 4 | 2 | 3 | 2 | 3 |
| Mantis Shredder | 3 | 4 | 2 | 3 | 4 |
| Gator Drummer | 4 | 2 | 4 | 2 | 3 |
| Mushroom Sage | 3 | 3 | 2 | 4 | 4 |
| Arlo | 3 | 4 | 2 | 4 | 3 |
| Kraken | 4 | 2 | 3 | 2 | 3 |
| Amby | 3 | 5 | 2 | 3 | 3 |
| Cavs | 4 | 2 | 3 | 2 | 3 |
| Cookie | 3 | 2 | 3 | 5 | 4 |
| Jason | 3 | 4 | 2 | 3 | 4 |
| Joey | 3 | 3 | 2 | 4 | 3 |
| Lukey | 4 | 2 | 4 | 2 | 3 |
| Stu | 3 | 3 | 3 | 3 | 4 |

Every racer is tied to the Gizzverse, with a one-line bio on the picker (`RacerDef.bio`): the Lizard Wizard of the castle on the misty mountain, Han-Tyumi the confused cyborg, the Gila Rider and Beowulf's Witch (her black cat knocked the candle over) from PetroDragonic Apocalypse, Blue Morpho fresh from the Butterfly 3000 chrysalis, Mad Dog Morgan of Billabong Valley, the Kraken from Open Water, and so on. Racer ids are unchanged, so records and ghosts carry over.

Tuned with `npm run balance` (all-CPU races on every track at 100cc and 150cc, twelve-kart fields drawn round the roster) so no stat dominates: average finishing places run from about 5.3 to 8.2 of 12, and every racer reaches the podium. A speed point is worth about 2.7% top speed.

Classes: 50cc (0.8x), 100cc, 150cc (1.15x) and 200cc (1.3x, `physics/racers.ts` `CLASS_SPEED`), the last unlocked by a gold at 150cc (see section 9).

All designs are original, with no album art. The band races too, under their nicknames, in alphabetical order on the picker: Amby (a chrome harmonica racer, harmonica raised), Cavs (rolling on two bass drums, sticks up), Cookie (a synth-guitar hybrid: a keytar body with a keyboard down the deck and a fretted neck out front), Jason, their visual artist (a rolling lighting rig with moving heads sweeping their beams), Joey (a modular-synth buggy with patch cables, its back pink and signed "Yikes" in script), Lukey (an 8x10 bass cab on wheels) and Stu (riding the Flying Microtonal Banana: a giant banana that is also a guitar, its neck fretted in quarter tones, a flute on his back). They're drawn in the NBA Jam manner, big sculpted heads on smaller bodies, their hair, moustaches, glasses and colouring taken from photos, all in work coveralls with their names on the patch. Every racer has their own character model and vehicle (render/racerModels.ts), and not every vehicle is a kart: Gila Rider is a flying Gila monster on bat wings (after the PetroDragonic cover), Han-Tyumi drives a fishing dinghy on wheels as the Fishing for Fishies robot, Swamp Witch a fan hovercraft, Microtonal Monk a levitating lotus, Mushroom Sage a toadstool saucer, Mantis Shredder rides a monowheel and Gator Drummer a tracked kick-drum tank, and Arlo (an apricot standard poodle, all curls, ears flapping and tail wagging) drives a plush dog bed on wheels with a tennis ball on the front. All of them drive with the same kart physics; the difference is in the look (hovering craft bob and bank, leave no skid marks, and their drift kicks up ground instead of tire smoke). Drivers lean into turns and look where they steer, and every racer has their own trick move.

## 6. Items

Named for the Gizzverse. Internally the kinds keep the names they were built under (`ItemKind` in items/items.ts); online snapshots send an item as its index in `ITEM_KINDS`, so new kinds go on the end.

| Item | Kind | Effect | Odds bias |
|---|---|---|---|
| Mind Fuzz | fuzzPedal | 1.2s speed boost | All positions |
| Microtonal Banana | microtonalMine | Dropped banana, fretted in quarter tones; wobbles steering 1.5s | Front |
| Nuclear Fusion | feedbackWave | Radial spin-out, 8m range | Middle |
| Big Fig Wasp | riffMissile | A mechanical wasp that homes on the next racer ahead | Middle/back |
| Horology | tempoShift | Others slowed: 4s for the leader down to 1.5s for last place | Last 2 only |
| Woo Cannon | wooCannon | Turns you into a cannon shell that flies itself down the road at 1.9x top speed (up to 3.2x the further behind the kart it's chasing, from 40 m back to 300 m), immune, spinning out anyone it touches, until it has caught the pack and gone 5 to 45 m past it (1.5 to 9 s); never lets go over a pit | Last 3 only, likelier further back |
| Sleep Drifter (Stu) | fluteFlurry | A flurry of flute notes in a cone ahead (26 m, 30 degrees each side): wobbles 1.3s | Everywhere, more up front |
| Road Train (Cavs) | drumRoll | 3 s as a battering ram: immune, 10% faster, four times as heavy, spins out whoever it touches | Everywhere, more at the back |
| Superheavy (Lukey) | bassDrop | Slows every kart up to 90 m ahead for 1.6s | Not the leader |
| The Silver Cord (Joey) | patchCable | Latches onto the nearest kart up to 55 m ahead: slows it 1.5s and slingshots you (2.2s boost) | Not the leader |
| Boogieman Sam (Amby) | harmonicaWail | A wail in a cone ahead (20 m) that shoves karts aside and wobbles them; a little boost for you | Everywhere |
| Gamma Knife (Cookie) | keytarLaser | A beam straight ahead (70 m): the first kart in it spins out 1.2s. Aim by steering | Not the leader |
| Nonagon Infinity | gizzardWave | A nine-sided ring that rolls down the road under everyone to the leader: fast, then closing at a readable pace with a warning and an alarm; it spins them out 1.8s unless they're in the air (a hop as it arrives rides over it). The HUD's warning carries a bar that fills to the moment to hop and says HOP in the last half second (`SURGE_HOP_WINDOW`, from the ring's distance and closing speed) | 4th and back in fields of 6 or more |
| The Dripping Tap | drippingTap | One long boost (3.2s): the jam that keeps going | Back half only, likelier further back |

The comeback band is the back half of the field, not the last two or three places (`COMEBACK_HOROLOGY` 0.6, `COMEBACK_CANNON` 0.7, `COMEBACK_TAP` 0.5 of the way from first to last): in a field of twelve a bad hit on lap 2 puts you 8th, and 8th used to get nothing but fuzz. Horology from 60% back, the Woo Cannon from 70%, the Dripping Tap from halfway, all likelier the further back.

- Each band member's own item comes up twice as often for them (`SIGNATURE_ITEMS`)
- Item boxes respawn 3s after pickup, and break with a sound every time they're hit, full slot or not
- Double boxes (gold, a box inside a box) sit on the risky lines (shortcuts, edges by drops): they give two items, the second waits beside the slot and moves in when the first is used
- One item held at a time (plus a spare from a double box), after a 1s roulette
- Shields: a Microtonal Banana or Big Fig Wasp held in the slot trails behind the kart and takes a wasp or a banana for you, and is gone
- Hit karts are briefly immune (spin-outs: 1s longer than the spin)
- Who hit whom with what shows in a callout feed under the item slot
- CPUs use items at a good moment (a straight for Mind Fuzz, a kart on their tail for a banana, company for Nuclear Fusion, a kart in the cone or the beam for the band's items) with a chance set by class; otherwise after a random wait. CPU leaders hop over a Nonagon Infinity by skill

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
- Built (Milestone 6): one post pass (render/postfx.ts) for haze and kaleidoscope, skipped when nothing is on.
- The look of the Rattlesnake video (render/postfx.ts): tape (red and blue bleeding apart, wobbling lines, scanlines, grain), a posterized duotone in each world's own colours (`Theme.duotone`: shadows, body, and highlights that burn like a snake's eye) and letterbox bars. Settings > VHS: Light (the default) is a softer tape: lighter on the pre-race flyover and behind the title and menus, a faint tape through every race (a bit more on the final lap), and a short bite of duotone when you're hit; Full washes the races in the duotone too; Off turns it off. Nothing strobes. The kaleidoscope runs on every track's final lap. Extras: off-road wheel dust, a pre-race flyover with a title card

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

### Cup 4: the Phantom Island Cup

After Phantom Island (2025), the orchestral album. Four new worlds, each with its own landmark, scenery and hazard, and a pair of songs (a lap theme and a faster final-lap cut, plus their remixes). Race order: Phantom Island, Deadstick Drop, Panpsych Grove, Sea of Doubt.

1. Phantom Island (Phantom Island): an island that comes and goes in a sea mist at dusk, violet sky and teal water. The Tideline under a stone arch that fades in and out, ghost lights circling it; the Ghost Light Flats (two kickers, ghost lights drifting over the road that buffet karts round), the Wraith Cliffs (switchbacks up an earth bank to 15 m and a plunge off the top), Lantern Woods, a rail-less Ruined Pier over the water, Mist Hollow sunk 6 m and the Phantom Gap jump, then the Vanishing Bend round a tidal pool. Shortcut: Eternal Return, a narrow causeway with no rails across the pool. A ghost lighthouse on the point. Scenery: ruined arches, bare trees with lanterns swinging, wrecks whose sails of light come and go, rings of standing stones, ghost lights, banks of mist
2. Deadstick Drop (Deadstick): a cliff-top airfield on a bright windy day. The Main Runway under two striped masts with a plane hung between them whose propeller winds down, stops dead and catches again; the Prop Wash (two kickers, planes gliding in with their propellers stopped to crash-land on the road: a shadow grows where each will come down, and the wreck sits there until it sinks away), the Holding Pattern (a full circle climbing on a deck over the road it started on, to 18 m), the Clifftop Runway, and the Deadstick: off the end of the runway, a jump 10 m down that every kart clears at 50cc. Then the rail-less Seaplane Slip, the Hangar Cutting sunk 6 m with a hump out of it, and the Crosswind round the seaplane basin. Shortcut: Tailwind, a plank taxiway across the basin. Scenery: hangars with planes rolled half out, parked planes and seaplanes (a few idling), windsocks, control towers, fuel tanks, a cardboard plane nose-down in the grass
3. Panpsych Grove (Panpsych): a forest older than anyone where everything is awake, amber light through the canopy. The Heartwood Path under two great trees leaning in over the road, a face in each trunk watching; Humming Stones (two kickers, standing stones with glowing eyes waddling across the road and back), the Root Knot (a climbing loop on a deck of living roots round the World Tree, up to 14 m and over the road it came in on) and the Canopy Drop, Lichen Hollow sunk 6 m with logs swinging across on vines, a jump over Mossy Ford, and Silent Spirit round a still pond. Shortcut: the Hollow Log, a fallen trunk across the pond. Scenery: great trees, half of them with eyes that look about and blink, humming stones with faces and a pulsing ring of light, glowing mushrooms, ferns, drifting motes of pollen
4. Sea of Doubt (Sea of Doubt): the cup's finale, a causeway over a black sea at night in a gale, rain and lightning. The Breakwater through the ribs of a wreck, a lantern swinging from its keel; the Undertow Causeway (two kickers, and waves that swell and then break right across the road on a rhythm), the Sea Stack Trestle (two big climbing hairpins on a deck to 18 m and a plunge), Spacesick Swells, a rail-less bridge out past Lighthouse Rock, the Undertow Cave sunk 6 m and a jump over the breakwater, then the last bend round a whirlpool. Shortcut: Riptide, a plank walk across it. Lightning strikes all the way round. Scenery: sea stacks, wrecks heeled over, bell buoys rolling with a red light, breakers going white

### Cup 5: the Omnium Gatherum Cup

After Omnium Gatherum (2022). Four new worlds, each with its own landmark, scenery and hazard, and a pair of songs (a lap theme and a faster final-lap cut, plus their remixes). Race order: Magenta Mountain, Kepler-22b, Goblin Garden, Predator X.

1. Magenta Mountain (Magenta Mountain): a pink mountain under a sky that cycles through every colour over the race, the mountain itself standing in the infield with a glowing crystal crown. Base Camp between two leaning towers of crystal; the Crystal Fields (two kickers, magenta crystals tumbling across the road and back), the Switchbacks (two great hairpins on a ledge up to the summit at 25 m) and Avalanche Run, the long fall back down with hail coming down on it, the Pink Snowfield, a rail-less crystal bridge over the Rosy Tarn, the Crystal Cave sunk 6 m and a jump over a crevasse, then the Altitude Bend round a frozen tarn. Shortcut: the Snow Bridge, a span across the tarn, buried under a wall of pink snow on lap 2. Scenery: crystal clusters, pines under pink snow, glowing orbs drifting, magenta boulders
2. Kepler-22b (Kepler-22b): an ocean world in the habitable zone, teal water and a ringed planet in the sky. Splashdown under an arch of alien coral hung with glowing orbs; the Weightless Shallows (gravity at 45%, so the two kickers float you far over the water), the Orbital Ring (a full circle climbing on a deck over the road it started on, to 18 m), the Ocean Ridge with geysers going off, and the Freefall, a jump 10 m down off its end. Then a rail-less Reef Bridge, the Trench sunk 6 m, and the Habitable Zone round a lagoon. Shortcut: the Membrane, a causeway across the lagoon sealed by a glowing membrane on lap 1. Scenery: towers of glowing kelp, coral fans, jellyfish floating over the shallows, spiral shells
3. Goblin Garden (The Garden Goblin): a garden seen from a goblin's height on a sunny day. The Garden Gate, a rose-covered trellis arch with a giant goblin peering round it; the Rose Beds (two kickers, garden goblins scurrying across), the Trellis (three quarters of a turn up a rose trellis to 14 m and over the path it came in on), the Hedge Maze (hedges 5 m tall either side), the Worm Tunnel sunk 6 m with more goblins in it, a jump over the Lily Pond, and the Gnome Lawn round a pond. Shortcut: the Goblin Hole, a plank across the pond, hedged up on lap 2. Scenery: flowers taller than a house, toadstools, flower pots, a watering can, goblins standing about, snails
4. Predator X (Predator X): the cup's finale, a primeval coast at a smoky dusk where the pliosaur hunts. Bone Beach under the reared skull of a pliosaur, jaws open; the Fossil Flats (two kickers, geysers), the Fossil Cliffs (switchbacks up to 15 m and a plunge off the top), the Cycad Woods, then the Pliosaur Causeway: a rail-less causeway over its water, where a fin circles off one side (its wake the warning) before the jaws come up over the road's edge and snap, one side then the other. The Abyssal Cut sunk 6 m and a jump, then the Apex Bend round a lagoon. Shortcut: the Bone Bridge, a spine across the lagoon, gone on the final lap. Scenery: tree ferns and cycads, ammonite shells, sea stacks, pterosaurs wheeling, bones on the sand

### Cup 6: the Polygondwanaland Cup

After Polygondwanaland (2017), in album order. Four new worlds, each with its own landmark, scenery and hazard, and a remix of the song transcribed from the album master (tempo, meter, key, sections, bass, riff, chords and top line measured from the recording), with a faster final-lap cut. Race order: Crumbling Castle, The Castle in the Air, Inner Cell, Tetrachromacy. Polygondwanaland Jungle (Cup 1) now plays the title song, Polygondwanaland, so Crumbling Castle's remix goes with its own track.

1. Crumbling Castle (Crumbling Castle): laid out like the castle course on the N64, a dark castle in a lava moat under a red night sky, falling apart. The Drawbridge (a kicker) and the Moat Bridge over lava, in at a gatehouse with its portcullis up, then the Thwomp Hall, walled 6 m high, where blocks of masonry with a scowl in them hang from the crumbling ceiling, shake loose and slam down on alternating sides; the Crooked Corridor (two right angles) into the Great Hall, wide, with four crushers zigzagging across it; the Grand Stair, half a turn on a deck up to the upper floor at 10 m, and out along the Castle Garden on the battlements; back inside and off the top through the Lava Galleries (right angles, fire across the passage), under the castle through the Dungeon sunk 6 m, the rail-less Lava Walk, The Leap over lava and the Moat Road home. Shortcut: The Breach, across the garden where its wall has crumbled: barred by the wall on lap 1, open from lap 2. The keep stands in the infield shedding blocks into its moat. Scenery: broken towers losing stones off the top, half-fallen walls, braziers, lava pools
2. The Castle in the Air (The Castle in the Air): a white castle on the clouds in a golden afternoon, nothing below (off the road is a long fall). A cloud road with two kickers under a gate of two towers and a bank of cloud, the Rampart Bend and the Battlements (gusts blowing across), the Tower Spiral (a full turn round a tower, climbing to 20 m and over its own start), the Sky Bridge and the Keep Switchbacks down, the Drawbridge Leap, the Courtyard swinging round its well and the Wind Gallery (another gust) home. Shortcut: the Cloud Bridge, straight across the courtyard, there on lap 2 only. The castle floats on its island in the infield. Scenery: floating islands with turrets, clouds drifting, kites
3. Inner Cell (Inner Cell): inside a living cell, a violet murk lit pink by the membranes. The Membrane Pass (two kickers) under a ring of membrane studded with protein channels, the Cytoplasm Stream with vesicles drifting across, the Mitochondria Esses, the Endoplasmic Loop (three quarters of a turn up to 13 m and over the road it came in on), the Golgi Switchbacks between stacked membranes, the Lysosome Sink 6 m down with more vesicles, the Ribosome Jump over a pool of cytoplasm and the Nuclear Rim round the nucleus. Shortcut: the Nuclear Pore, straight through the nucleus (a great see-through sphere, the nucleolus inside), open laps 1 and 2 and closed by a glowing membrane on the final lap. Scenery: mitochondria, ribosomes, vesicles bobbing, Golgi stacks, strands of cytoskeleton
4. Tetrachromacy (Tetrachromacy): the cup's finale, a black world split into four colours of light, on a road of glass tiles in red, green, blue and the fourth colour. Spectrum Straight (two kickers) under a great prism slung across the road, fanning out four beams; the Cone Cells, the Refraction Spiral (a full turn to 14 m over its own start) and the Rainbow Descent; the Mirror Maze (right angles between mirror walls 5 m tall) and the Afterimage Trench sunk 6 m, both crossed by prism beams; the Prism Leap over a chasm and the Ultraviolet Bend round another. Shortcut: Ultraviolet, a road in the fourth colour straight over the chasm, there on the final lap only. A great eye with four rings of colour in its iris watches from the infield and blinks. Scenery: prisms turning in the air, pillars of light, eyes on stalks, glass spikes

New hazards, each with a way to use it: crushers (a crusher slamming down on you squashes you, spun out and slowed to 40%; once down it's a block you bump off; its shockwave throws a kart just past it on, on a boost), gusts (shove you across the road one way and then the other; hop as one blows and you catch the wind, a boost), vesicles (drive into one and it bounces you back, slowed; hop onto it and it bounces you up high for a trick), prism beams (red, green and blue spin you out; the fourth colour is a boost).

### The Nonagon Infinity Cup

After Nonagon Infinity (2016), the album that never ends: its last song runs into its first, and so the cup's last track hands back to Robot Stop. Four new worlds in album order, each with its own landmark, scenery and hazard, and a remix of the song transcribed from the band's own live recording (Live In Brussels '19 for the first three, Live In Chicago '23 for Wah Wah), with a faster final-lap cut. Race order: Robot Stop, Gamma Knife, People-Vultures, Wah Wah. Infinite Loop Speedway (Cup 1) keeps its own Robot Stop remix; this cup's Robot Stop plays the transcribed one.

1. Robot Stop (Robot Stop): a robot factory at night under sodium lamps, on diamond plate steel. The Assembly Line (two kickers) under a gate with a robot's head over it, the Loosen Up Esses, the Conveyor Climb (a full turn to 14 m over its own start) and Time to Drop off the top; right angles through the Press Hall between riveted steel walls 6 m tall, where robots march across the road and stop dead in the middle of it, the Smelter Trench sunk 6 m with more of them, the Scrapyard Leap over molten metal and the Nonagon Door round a scrap pit. Shortcut: The Open Door, straight across the pit over a steel plank: open on laps 1 and 2, then the line stops and a shutter comes down for the final lap. A colossal robot dances from the waist in the infield, one hand raised to say stop. Scenery: smokestacks puffing, robot arms swinging, vats of molten metal, crates, robots frozen mid-stride
2. Gamma Knife (Gamma Knife): a black operating theatre lit green and violet, white tiles with green seams for a road. Operating Straight (two kickers) under a ring whose beams meet on one point of the road ahead, the Cranial Bend and the Cortex Esses, the Collimator Spiral (a full turn to 15 m) and the Synapse Drop; right angles through Scalpel Alley between tiled walls 5 m tall and the Lesion Trench sunk 6 m, both under the knife: thin beams converge on a crosshair that closes on the road, then the burst. The Isotope Leap over a pool and the Focal Bend round a chasm. Shortcut: Pierced Through, a bridge of focused light straight over the chasm, nothing there on lap 1 and holding from lap 2. The collimator, a great tilted ring, stands in the infield, two dozen beams following a point of light that wanders under it. Scenery: isotope crystals, chrome spheres on poles, cones of light, lenses turning in the air, racks of vials
3. People-Vultures (People-Vultures): a dry lake under a bruised afternoon sky, on cracked, scorched earth. Carcass Straight (two kickers) under a gate of vulture totems with a spine for a lintel, the Scavenger Bend with tumbleweeds, the Thermal Spiral (a full turn to 15 m, the way a vulture rides a thermal) and The Swoop off the top; Ribcage Run between ribs 4 m tall, Bone Gully sunk 6 m where vultures circle over the road (their shadow on it) and dive to swoop low along it, the Gizzard Leap over a gulch and the Circling Bend round another. Shortcut: the Carrion Bridge, a span of bones straight over the gulch, there on laps 1 and 2 and picked clean by the final lap. A great ribcage lies in the infield with seven vultures wheeling over it. Scenery: dead trees, ribcages, skulls, vultures perched on posts, carcasses
4. Wah Wah (Wah Wah): the cup's finale, a pedalboard the size of a city under a purple night, on a road that is a fretboard. Pedalboard Straight (two kickers) under an arch of neon that sweeps heel to toe with the filter, the Heel Down Bend, the Sweep Spiral (a full turn to 14 m) and the Resonance Drop; right angles through Feedback Alley between speaker stacks 5 m tall and the Filter Trench sunk 6 m, giant wah pedals rocking up and stamping down across both; the Octave Leap over a pit and the Toe Down Bend round another. Shortcut: the Open Pedal, a patch cable of a road straight across the pit, barred by a lit boom until the final lap, when the pedal opens. A colossal wah pedal rocks in the infield, a ring of sound going out every time its toe goes down. Scenery: stomp boxes with blinking LEDs, speaker stacks pulsing with the beat, patch cables, picks spinning in the air, rings of sound

New hazards, each with a way to use it: robots (marching across the road one walks straight into you; stopped dead it's a block to drive round and a ramp if you hop onto it), the gamma knife (its burst spins you out; slip through the crosshair as it closes and the knife misses, a boost), vultures (one that swoops into you knocks you flying; hop as it comes and it carries you, up and on with a boost), wah pedals (caught under the stamp you're squashed, spun out and slowed to half; stamped flat, a pedal is a springboard if you hop onto it, up high with a boost).

**Roads that come and go, hazards that help.** Every track's shortcut is only there on some laps (`BranchDef.openOn`, by the lap each kart is on, so the change always comes at the line), and is something else the rest of the time (`shut`): gone (a phantom: drive on and you fall), drowned (by the tide, the magma, the storm surge) or barred (a striped boom, or a wall of ice, fire, bone, neon or gold that sinks away when it opens). Invisible Face shows itself from lap 2; the snake shuts its jaws on lap 2; magma floods Hell's Itch, the Fourth Colour crumbles and Digital Black is murdered on the final lap; Open Water is under the tide and Mycelium frozen shut on lap 1; the Munt Machine is only open on lap 2; Catching Smoke is only there on the final lap; the rich close Mars for the Rich after lap 1; the storm surge floods Converge on lap 2; a wall of fire bars Flamethrower until the final lap; Eternal Return is a phantom on lap 2 only; Tailwind is barred until the final lap; the Hollow Log wanders off on lap 2; the tide drowns Riptide on the final lap; an avalanche buries the Snow Bridge on lap 2; the Membrane opens from lap 2; the goblins hedge up the Goblin Hole on lap 2; the Bone Bridge is gone on the final lap; The Breach is walled up on lap 1; the Cloud Bridge is only there on lap 2; the Nuclear Pore closes on the final lap; Ultraviolet is only there on the final lap; The Open Door shuts for the final lap; Pierced Through is nothing on lap 1; the Carrion Bridge is picked clean on the final lap; the Open Pedal opens on the final lap only. A Time Trial is lap 1 of a one-lap race. And every hazard can be used well (a `bonus` event, a flash and a boost): something that has come down (a crashed plane, a lava bomb, a meteor) is a ramp if you hop onto it; rammed on a boost, stones, boulders, rollers, ice blocks, hail, tumbleweeds and burning oil give way and the boost runs on; a snake hopped, a fish caught by hopping and a wave surfed are boosts; a laser gate or flame jet slipped through while it warms up is a boost; hop in a dust devil or tornado and it throws you up for a trick; drifting through a butterfly swarm charges the sparks faster; skimming a black hole on a boost is a gravity assist; a ghost light's core boosts you; a crystal rammed on a boost gives way; a goblin hopped is a boost; hop as Predator X snaps and you're over its jaws on a boost; a geyser throws you up whatever you do, but hopped onto, you ride it high on a boost, and caught, it costs you half your speed; a stopped robot is a ramp; the gamma knife's closing crosshair is a boost; a swooping vulture carries a kart that hops; a stamped wah pedal is a springboard. Panpsych Grove's signature is the Root Knot: three quarters of a turn round the World Tree's trunk on a deck of roots, climbing 14 m and crossing over the road it came in on.

**Walls.** An impact slows you and bounces you off: square-on you're thrown straight back, glancing you lose a little speed and the nose turns along the wall so you glance off rather than grinding along it; contact after that only scrapes, and a light graze just shaves a little speed. Physics version 10 (Time Trial records started over).

### Generated tracks

The Track Generator mode builds a track at race time from a seed and three dials: theme (desert, speedway, volcano, jungle, lagoon, glacier, neon city, sky, petrodragonic, mars, supercell, void, phantom island, airfield, grove, sea of doubt, magenta mountain, kepler-22b, goblin garden, predator x, crumbling castle, castle in the air, inner cell, tetrachromacy, robot stop, gamma knife, people-vultures, wah wah), twists (complexity 1 to 5) and length (short about 0.85 km, medium 1.2 km, long 1.7 km). Each theme brings its road surfaces, liquid for bridges and jumps, hazards, landmarks, music and words for names. The layout is a rectangle skeleton whose sides are filled with modules (straights, S-bends, esses, chicanes, switchback hairpins, jumps, bridges), each measured before it's placed so the sides keep their length; the last two sides aim for the final corner, which a Dubins path closes onto the finish line. A layout that crosses itself or needs a loop to get home is re-rolled from the same seed, so a seed always builds the same track. Every track gets a name (Gizzard-ish adjective, theme place, kind of course); after a race it can be saved under that name or another. Saved tracks are kept in the browser as seed and dials. Generated tracks roll over hills scaled by the twists dial, with humps for airtime; from twists 3 each has a coaster (a climb onto a pillared deck, a crest you leave the road from, a plunge), higher over the sky and void, and now and then a walled stretch is sunk into a cut on worlds with ground.

### Elevation: cuts, dives and crests

- A road that runs below the ground is sunk in a cut (`Track.cutInto`): the ground opens along it and its sides are rock walls up to ground level and 1.5 m over. Rattle Canyon drops 8 m into the desert floor
- `TrackBuilder.dive` takes a road down under the surface of a pit of water and back out. Fishies Lagoon's Coral Causeway dives 8 m to the lagoon floor instead of riding over it: kelp, coral, circling fish, bubbles, light shafts and the surface rippling overhead; with the camera under the surface the picture turns blue-green and wavers with caustics, the fog closes in and the music is muffled
- A kart is only falling if it's below ground with no road under it, so sunk and submerged roads hold
- A road raised on the ground sits on an earth bank (1 m up for every 2 m out) that you can drive back up; a deck on pillars (`bridge` sections) has nothing under it, and dropping off one (or 5 m below the last road under you) is a fall
- `TrackBuilder.profile` shapes a stretch of road's height after the layout is drawn (hills, dips, coaster drops). Over a crest that drops away faster than gravity, a kart takes off with the climb it had: airtime and a trick window, like a ramp lip
- Every cup track climbs and dips, with at least one coaster stretch and crest airtime. Nonagon Cup: People-Vultures and a camelback on the speedway, Rattle Canyon sunk, the volcano and jungle climbs and drops. Microtonal Cup: dunes and a high pier on Fishies Lagoon, a glacier climb and plunge plus a sunk ice canyon on Ice V, a pillared freeway skyway over Cyboogie City, and a lift to 26 m with a climbing helix on the Butterfly 3000 Skyway. Apocalypse Cup: Olympus Climb and the Valles Rift leap on Hell on Mars, a pillared trestle through the Silo Hairpins on Supercell, a whole-lap coaster on Murder of the Universe (nothing sunk over the abyss), and Dragon's Gullet dug 8 m down with Skull Bridge 12 m over the oil lake on Petrodragonic Apocalypse, where the dragons hang down the gullet's walls. Phantom Island Cup: the Wraith Cliffs and Mist Hollow on Phantom Island, the Holding Pattern helix to 18 m, the Deadstick drop and the Hangar Cutting on Deadstick Drop, the Root Knot into the canopy and Lichen Hollow on Panpsych Grove, and the Sea Stack Trestle to 18 m and the Undertow Cave on Sea of Doubt. Omnium Gatherum Cup: the Switchbacks to a 25 m summit, Avalanche Run and the Crystal Cave on Magenta Mountain, the Orbital Ring to 18 m, the Freefall and the Trench on Kepler-22b, the Trellis to 14 m and the Worm Tunnel on Goblin Garden, the Fossil Cliffs and the Abyssal Cut on Predator X. Polygondwanaland Cup: the Grand Stair to the castle's upper floor at 10 m and the Dungeon on Crumbling Castle, the Tower Spiral to 20 m over the abyss on The Castle in the Air, the Endoplasmic Loop to 13 m and the Lysosome Sink on Inner Cell, the Refraction Spiral to 14 m and the Afterimage Trench on Tetrachromacy. Nonagon Infinity Cup: the Conveyor Climb to 14 m and the Smelter Trench on Robot Stop, the Collimator Spiral to 15 m and the Lesion Trench on Gamma Knife, the Thermal Spiral to 15 m and Bone Gully on People-Vultures, the Sweep Spiral to 14 m and the Filter Trench on Wah Wah
- A landing never sends a kart upward, so a curb or a rising road under a landing can't throw it into the air

### Layout extras (`src/tracks/enrich.ts`)

Every hand-built track gets a few more moments a lap laid over its geometry at build time (`enrichTrack`, applied by `TRACK_LIST`; `RAW_TRACK_LIST` is the tracks as drawn):

- **Rhythm humps** on long straights that run near level (70 m of road straighter than 0.012 rad/m, within 0.5 m of a line between its ends): a sharp-topped rise of 1.5 m over two 20 m parabolic ramps, the generator's own shape, laid on the road's own profile. Up to three a track. Karts fly off the crest; a hop there is a trick.
- **Apex pads** on the inside of the two longest bends (60 degrees or more at 0.03 rad/m or tighter): a 7 m boost pad at the apex, so the tight line pays and a wide one costs.
- **A slalom** on the longest straight of a track with no level straight for a hump: three pads 15 m apart, staggered left, right, left.

Nothing is placed within 30 m of a junction (40), a jump, an item row, a pad, a landmark or a fixed hazard, on a bridge or in low gravity, within 40 m of the grid or 90 m of the line. Hazards that roam a stretch (snakes, fish, goblins) share the road with a hump. `planEnrichment` says what a track gets; `tests/enrich.test.ts` pins the rules. Changing a layout changes its lap times: the physics version bumps and the boards start fresh.

### Trackside life (`src/render/trackLife.ts`)

Over `trackDetail.ts`'s paint, posts, boards, grandstand and ground cover, every track (generated ones included) gets: a name board on a post at the start of each named section of the main road, facing the karts coming at it (`signTexture`); the grid boxes painted on the start slots and the track's name painted across the road past the line; small stands of spectators on the outside of the two sharpest bends (the grandstand's own builder, three tiers); a flock per world circling the infield over clear ground, that climbs and speeds up when a kart comes within reach (vultures, birds, gulls, bats, moths, or glowing orbs: ghost lights, drones, fireflies, vesicles); and motes in the air round the camera, world-anchored and wrapped like the storm's rain, in the world's own stuff (dust, pollen, snow, embers, sparks, spores, bubbles, stars; `LIFE` by decor kind). On the final lap (`atmosphere.finalLap`, set by `trackView.update` from the watched kart's lap) every light along the road pulses and the flags go wild.

### Shortcuts, kickers and double boxes

Every track has a shortcut or alternate route (a branch) that trades risk for time, one to three trick kickers on its straights, and a row of double item boxes on the risky line, with sections named for the album the track is themed on: Invisible Face (Infinite Loop Speedway, whose sections are the nine Nonagon Infinity songs in order), Snake's Mouth (Rattlesnake Run, now through Sleep Drifter, Billabong Valley and Deserted Dunes), Hell's Itch (Volcano Fortress), The Fourth Colour (Polygondwanaland Jungle), Open Water (Fishies Lagoon), Mycelium (Ice V Glacier), the Soy-Protein Munt Machine (Cyboogie City), Catching Smoke (Butterfly 3000 Skyway), Mars for the Rich (Hell on Mars), Converge (Supercell), Digital Black (Murder of the Universe), Flamethrower (Petrodragonic Apocalypse), Eternal Return (Phantom Island), Tailwind (Deadstick Drop), the Hollow Log (Panpsych Grove) and Riptide (Sea of Doubt). A branch's walls are open where it leaves and rejoins the main road. Generated tracks get kickers (more at higher twists, sometimes in pairs), a double box row out on a risky edge, and from twists 3 a shortcut chord across a bulge. CPUs keep to the main road.

## 8. CPU Racers
- Follow a waypoint spline with per-racer lateral offset and racing line variation
- Difficulty controls top speed cap, drift usage, and item intelligence
- Rubber-banding, offline only (`Race.focus` is the player's kart; the room has none): trailing CPUs get up to +8% top speed by how far they are behind the leader (`RUBBER_BAND_MAX`), and CPUs ahead of the player give up to 4% by how far ahead they are (`DRAG_MAX`, fully on 150 m ahead), so the pack stays in play and the last lap is a fight. The leader gets no help, and the player's own kart is never touched
- Rivals (core/grandPrix.ts `rivals`, `RIVALS` 2): after each race of a cup the two racers nearest the player in the standings, the one just above and the one just below, become rivals for the next race. They drive on `rivalSkill` (a touch more speed cap, drift, item sense, less wander), they're named on the title card and the HUD's corner, ringed gold on the minimap, and tagged RIVAL in the results and standings

## 9. Game Flow and UI
- Title > Mode select > Class > Racer select > Cup/Track > Race > Results > Next race
- Now: Title > picker (mode, track, racer, class; while the racer row is in use, the screen behind it is a gallery of every racer on a carousel that turns to the one chosen, `src/render/gallery.ts`) > Race (3 laps) > Results > Cup standings > next race ... > Podium (Grand Prix); Single Race and Time Trial go back to the picker after the results. CPUs race the chosen track behind the title and picker
- Grand Prix cups: the six album cups, then the Random Cup, four of the premade tracks drawn at random (no repeats), a new four each time the picker lands on it, listed under its name
- Grand Prix grid: first race as picked (player in 5th), then the standings reversed so the leader starts at the back. Ties go to the better place in the latest race
- Time Trial: a single lap, alone, no item boxes, best total and lap per track and class saved in the browser. The fastest run per track and class is recorded (15 samples/s, about 75 KB) and replays as a see-through ghost. One ghost a race: the leaderboard run you picked, else the next one up from your best, else your own best (`LeaderboardPanel.target`, `setupGhost`); beat it and the next race brings the next one up, a picked run included
- Extra mode beyond the spec: Single Race (any track, full field)
- HUD: position, lap counter, item slot, minimap, timer, drift spark meter
- Grand Prix points: 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 (twelve to a race)
- Graphics detail (`src/render/detail.ts`, Settings > Detail, `settings.detail`; High unless the device has a coarse pointer, until the player picks): High turns on sun shadows (`renderer.shadowMap`, a 2048 PCF map from a shadow camera 70 m either side of the kart on screen, riding with it; every solid mesh casts and receives, the sky, decals and anything see-through excepted; the karts' blob shadows go), the road textures as their own bump maps (`bumpy` in `materials`), and 1.5x the scenery, ground cover and motes (`densityScale`). Low also caps the drawing buffer at 1.25 device pixels per CSS pixel (`PIXEL_RATIO`; High allows 2), which on a phone is most of the saving. Shadows and the resolution switch at once; the grain and the density come with the next track built. Phones and tablets (a coarse pointer, `coarseDevice` in core/settings.ts) start on Low until the player picks. A normal bias blanks the shadows on this Three.js's depth-texture shadow maps, so only a depth bias is used
- Posting online asks for a name once (`src/ui/namePrompt.ts`): on the results screen, the first time there's a run, a race time or a cup result to post, with Not now as an answer; the leaderboards beside the picker only show. They hide below 1040px, where they'd sit on the picker
- Progress (`src/core/progress.ts`, localStorage `gizzracer.progress`): a trophy per cup, class and mirror (gold, silver, bronze for the top three; a star for winning every race), the best full-race time per track and class, the best style score per track, and the shortcuts found. The cup picker shows the trophies won; the track row your best race. Unlocks fall out of it: any trophy opens the Random Cup, a gold at 150cc in an album cup opens 200cc, gold in all seven album cups (any class, not mirrored) opens Mirror. The Random Cup and mirrored cups count toward nothing but the Random Cup itself
- Mirror mode (picker row once unlocked, `MenuChoice.mirror`): the track flipped left for right. The simulation never knows: the track, item and hazard views are scaled by -1 in x, the karts are drawn from mirrored snapshots (`mirrorState`), the minimap flips, steering is flipped at the wheel, and hazard sound pans with it. Records are kept apart (`.mirror` in their keys and board names); Time Trial and online play are never mirrored
- Style (`src/core/style.ts`): drift releases (by tier), tricks (more for a streak), slipstreams, rocket starts, hazards used well, items landed, dodged and blocked, and shortcuts score points, multiplied by a chain that grows while moves land within 4 s of each other (up to x5). The HUD shows the running score and chain under the laps and nothing else (no pop per move: the score line is the whole of it, and the old TRICK x2 flash is gone too); the results line tallies it; the best per track and class is kept and a new one is called out. Nothing scores after the flag
- Shortcuts: a kart's `branch` (the shortcut it's on) is read from the track; driving onto one scores, and the first time on each track it's called out with a sting (`sfx.discover`) and remembered
- Time Trial splits: at every checkpoint the gap to the ghost being chased is kept as a split under the lap times
- Picker extras: a random racer (R, or the dice under the racer), and the Track Generator's Daily (`src/core/daily.ts`: dials drawn from the UTC date, the same for everyone, never the plainest or the hardest), with its own race-time leaderboard

## 10. Audio
- Music: the seqbaby soundtrack pre-rendered to looping MP3s (tools/render-soundtrack.mjs), played with Web Audio for sample-accurate loops
- Each track is themed on a King Gizzard & the Lizard Wizard song (audio/songs.ts): Robot Stop, Rattlesnake, Magma, Crumbling Castle, Fishing for Fishies, Ice V, Cyboogie, Catching Smoke, Mars for the Rich, Supercell, The Lord of Lightning, Dragon, Phantom Island, Deadstick, Panpsych, Sea of Doubt, Magenta Mountain, Kepler-22b, The Garden Goblin, Predator X, Crumbling Castle, The Castle in the Air, Inner Cell, Tetrachromacy, and Robot Stop, Gamma Knife, People-Vultures and Wah Wah again for the Nonagon Infinity Cup (Polygondwanaland Jungle plays Polygondwanaland). Races play a video game style remix of the song, written in seqbaby (seqbaby-seed gizzracer/remix-*.mjs, cues `<track>-remix` and `<track>-remix-final-lap`); there's no setting for it. A track with no remix file falls back to its classic theme. The title, menus and lobby play `title-remix` (Ice V) and fall back to the classic title theme, which is also the podium music. Song names aren't shown in the game; the credits list them
- Remixes from the band's recordings: the Polygondwanaland Cup (Crumbling Castle among them) and Polygondwanaland Jungle (from the album masters), the Phantom Island, Omnium Gatherum and Nonagon Infinity Cups and the title music are transcribed from King Gizzard's own recordings (their Bootlegger releases, which anyone may use, and for the Phantom Island Cup the Live in New York '25 soundboard on the Live Music Archive; the Nonagon Infinity Cup's from Live In Brussels '19 and, for Wah Wah, Live In Chicago '23) and rewritten in seqbaby (seqbaby-seed gizzracer/remix-live.mjs). Each is the song's highlights in the song's own order (intro, verse, hook or chorus, a contrasting section, the payoff, a turn back to the top), eight sections of four bars, every section handing to the next with a fill and a crash so the loop has no seam, on the whole seqbaby palette in the band's key, meter and feel. No audio from the recording goes in. The method, the tools and the checks (pitch content against the recording, even levels, no noise from the voices) are in seqbaby-seed gizzracer/REMIXING.md; new remixes should be made that way
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
- Music: written in seqbaby (account `gizzracer`): title theme, one theme per track of every cup, faster final-lap cuts of Rattlesnake Run, Butterfly 3000 Skyway and every Apocalypse, Phantom Island and Omnium Gatherum Cup track, video game remixes of every track's song (the Polygondwanaland and Nonagon Infinity Cups have only the remixes), and a podium loop
