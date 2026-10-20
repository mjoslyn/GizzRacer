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
- Drift: hold while turning, Mario Kart style: a steady arc you hold through the corner, the nose angled in. Centred it's gentler than full lock gripping, steering in tightens it to about full lock, steering out opens it up; the kart slides a little wide of its nose, more when steered hard into the drift (CPUs yaw into their own slide). Gripping, it holds its line: only a little momentum carries wide through a turn on the road (more on dirt, a lot on ice and oil) and dies away fast; sparks charge in 3 tiers (blue 0.15s, orange 0.3s, purple 0.475s) for 0.5s / 1.0s / 1.5s boosts. The charge hums higher toward purple, and each release kicks the camera's field of view
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
| Nonagon Infinity | gizzardWave | A nine-sided ring that rolls down the road under everyone to the leader: fast, then closing at a readable pace with a warning and an alarm; it spins them out 1.8s unless they're in the air (a hop as it arrives rides over it). One at a time | 4th and back in fields of 6 or more |

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
3. Panpsych Grove (Panpsych): a forest older than anyone where everything is awake, amber light through the canopy. The Heartwood Path under two great trees leaning in over the road, a face in each trunk watching; Humming Stones (two kickers, standing stones with glowing eyes waddling across the road and back), the Root Bridge (esses on a deck of living roots up to 14 m) and the Canopy Drop, Lichen Hollow sunk 6 m with logs swinging across on vines, a jump over Mossy Ford, and Silent Spirit round a still pond. Shortcut: the Hollow Log, a fallen trunk across the pond. Scenery: great trees, half of them with eyes that look about and blink, humming stones with faces and a pulsing ring of light, glowing mushrooms, ferns, drifting motes of pollen
4. Sea of Doubt (Sea of Doubt): the cup's finale, a causeway over a black sea at night in a gale, rain and lightning. The Breakwater through the ribs of a wreck, a lantern swinging from its keel; the Undertow Causeway (two kickers, and waves that swell and then break right across the road on a rhythm), the Sea Stack Trestle (two big climbing hairpins on a deck to 18 m and a plunge), Spacesick Swells, a rail-less bridge out past Lighthouse Rock, the Undertow Cave sunk 6 m and a jump over the breakwater, then the last bend round a whirlpool. Shortcut: Riptide, a plank walk across it. Lightning strikes all the way round. Scenery: sea stacks, wrecks heeled over, bell buoys rolling with a red light, breakers going white

### Generated tracks

The Track Generator mode builds a track at race time from a seed and three dials: theme (desert, speedway, volcano, jungle, lagoon, glacier, neon city, sky, petrodragonic, mars, supercell, void, phantom island, airfield, grove, sea of doubt), twists (complexity 1 to 5) and length (short about 0.85 km, medium 1.2 km, long 1.7 km). Each theme brings its road surfaces, liquid for bridges and jumps, hazards, landmarks, music and words for names. The layout is a rectangle skeleton whose sides are filled with modules (straights, S-bends, esses, chicanes, switchback hairpins, jumps, bridges), each measured before it's placed so the sides keep their length; the last two sides aim for the final corner, which a Dubins path closes onto the finish line. A layout that crosses itself or needs a loop to get home is re-rolled from the same seed, so a seed always builds the same track. Every track gets a name (Gizzard-ish adjective, theme place, kind of course); after a race it can be saved under that name or another. Saved tracks are kept in the browser as seed and dials. Generated tracks roll over hills scaled by the twists dial, with humps for airtime; from twists 3 each has a coaster (a climb onto a pillared deck, a crest you leave the road from, a plunge), higher over the sky and void, and now and then a walled stretch is sunk into a cut on worlds with ground.

### Elevation: cuts, dives and crests

- A road that runs below the ground is sunk in a cut (`Track.cutInto`): the ground opens along it and its sides are rock walls up to ground level and 1.5 m over. Rattle Canyon drops 8 m into the desert floor
- `TrackBuilder.dive` takes a road down under the surface of a pit of water and back out. Fishies Lagoon's Coral Causeway dives 8 m to the lagoon floor instead of riding over it: kelp, coral, circling fish, bubbles, light shafts and the surface rippling overhead; with the camera under the surface the picture turns blue-green and wavers with caustics, the fog closes in and the music is muffled
- A kart is only falling if it's below ground with no road under it, so sunk and submerged roads hold
- A road raised on the ground sits on an earth bank (1 m up for every 2 m out) that you can drive back up; a deck on pillars (`bridge` sections) has nothing under it, and dropping off one (or 5 m below the last road under you) is a fall
- `TrackBuilder.profile` shapes a stretch of road's height after the layout is drawn (hills, dips, coaster drops). Over a crest that drops away faster than gravity, a kart takes off with the climb it had: airtime and a trick window, like a ramp lip
- Every cup track climbs and dips, with at least one coaster stretch and crest airtime. Nonagon Cup: People-Vultures and a camelback on the speedway, Rattle Canyon sunk, the volcano and jungle climbs and drops. Microtonal Cup: dunes and a high pier on Fishies Lagoon, a glacier climb and plunge plus a sunk ice canyon on Ice V, a pillared freeway skyway over Cyboogie City, and a lift to 26 m with a climbing helix on the Butterfly 3000 Skyway. Apocalypse Cup: Olympus Climb and the Valles Rift leap on Hell on Mars, a pillared trestle through the Silo Hairpins on Supercell, a whole-lap coaster on Murder of the Universe (nothing sunk over the abyss), and Dragon's Gullet dug 8 m down with Skull Bridge 12 m over the oil lake on Petrodragonic Apocalypse, where the dragons hang down the gullet's walls. Phantom Island Cup: the Wraith Cliffs and Mist Hollow on Phantom Island, the Holding Pattern helix to 18 m, the Deadstick drop and the Hangar Cutting on Deadstick Drop, the Root Bridge into the canopy and Lichen Hollow on Panpsych Grove, and the Sea Stack Trestle to 18 m and the Undertow Cave on Sea of Doubt
- A landing never sends a kart upward, so a curb or a rising road under a landing can't throw it into the air

### Shortcuts, kickers and double boxes

Every track has a shortcut or alternate route (a branch) that trades risk for time, one to three trick kickers on its straights, and a row of double item boxes on the risky line, with sections named for the album the track is themed on: Invisible Face (Infinite Loop Speedway, whose sections are the nine Nonagon Infinity songs in order), Snake's Mouth (Rattlesnake Run, now through Sleep Drifter, Billabong Valley and Deserted Dunes), Hell's Itch (Volcano Fortress), The Fourth Colour (Polygondwanaland Jungle), Open Water (Fishies Lagoon), Mycelium (Ice V Glacier), the Soy-Protein Munt Machine (Cyboogie City), Catching Smoke (Butterfly 3000 Skyway), Mars for the Rich (Hell on Mars), Converge (Supercell), Digital Black (Murder of the Universe), Flamethrower (Petrodragonic Apocalypse), Eternal Return (Phantom Island), Tailwind (Deadstick Drop), the Hollow Log (Panpsych Grove) and Riptide (Sea of Doubt). A branch's walls are open where it leaves and rejoins the main road. Generated tracks get kickers (more at higher twists, sometimes in pairs), a double box row out on a risky edge, and from twists 3 a shortcut chord across a bulge. CPUs keep to the main road.

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
- Each track is themed on a King Gizzard & the Lizard Wizard song (audio/songs.ts): Robot Stop, Rattlesnake, Magma, Crumbling Castle, Fishing for Fishies, Ice V, Cyboogie, Catching Smoke, Mars for the Rich, Supercell, The Lord of Lightning, Dragon, Phantom Island, Deadstick, Panpsych and Sea of Doubt. Races play a video game style remix of the song, written in seqbaby (seqbaby-seed gizzracer/remix-*.mjs, cues `<track>-remix` and `<track>-remix-final-lap`); there's no setting for it. A track with no remix file falls back to its classic theme, which is also the title and podium music. Song names aren't shown in the game
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
- Music: written in seqbaby (account `gizzracer`): title theme, one theme per track of every cup, faster final-lap cuts of Rattlesnake Run, Butterfly 3000 Skyway and every Apocalypse and Phantom Island Cup track, video game remixes of every track's song, and a podium loop
