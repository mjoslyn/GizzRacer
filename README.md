# GizzRacer

Browser kart racer built with Three.js. See [SPEC.md](SPEC.md).

Play: https://www.gizzracer.com (Cloudflare Workers, also at gizzracer.mike-42e.workers.dev; deploys on every push to `master`). The old Netlify address redirects there (`netlify.toml`).

## Run

```sh
npm install
npm run dev       # http://localhost:5173
npm test          # vitest
npm run build     # typecheck + production build
npm run balance   # slow: all-CPU races on every track, wins and average place per racer
npm run dev:party # build, then run the game and its PartyKit servers locally on :8787 (wrangler dev)
npm run deploy    # build and deploy to Cloudflare (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)
npm run seed:ghosts  # post CPU starter ghosts to every leaderboard (SEED_URL=https://www.gizzracer.com for live)
```

## Status

Milestones 1 to 7 are in (driving feel, the Rattlesnake Run greybox, CPU racers, items and hazards, menus and Grand Prix, the psychedelic art pass, all four Cup 1 tracks), a second cup of four tracks, plus twelve racers with their own vehicles (karts, a rotor chopper, a hovercraft, a levitating lotus, a toadstool saucer, a monowheel, a drum tank; eight race at a time), themed worlds, and mobile play (touch controls, fullscreen, landscape). Online multiplayer (Milestone 8: Time Trial boards, rooms, live races) is in.

- Fixed 60 Hz physics with interpolated rendering (`src/core/loop.ts`)
- Keyboard + standard gamepad input as pure `InputFrame` data, auto-accelerate by default (`src/core/input.ts`)
- Arcade kart controller: per-racer stats, engine classes, off-road penalty, fine steering (gradual ramp-in, response curve), hop, 3-tier drift boosts, ramps that launch off their lip, trick boosts, boost pads, walls (`src/physics/kart.ts`)
- Track model: turtle-style builder (`src/tracks/builder.ts`), ribbons with per-section width, walls, surface and elevation, jump gaps over pits, branch shortcuts (`src/tracks/track.ts`)
- Infinite Loop Speedway (`src/tracks/infiniteLoopSpeedway.ts`): a figure-8 on green hills; the two long straights cross in the middle, one flying over the other on an overpass on pillars
- Volcano Fortress (`src/tracks/volcanoFortress.ts`): lava switchbacks, a walled basalt fortress behind two gatehouses with flame jets across the road, a rail-less bridge over a lava lake, and lava bombs on the open plains
- Polygondwanaland Jungle (`src/tracks/polygondwanalandJungle.ts`): vine hairpins with logs swinging across the road, a river jump, stone ruins behind a temple gate with polygon boulders rolling across, and a waterfall
- The Microtonal Cup, a second circuit sized for about 1:45 a race at 150cc:
  - Fishies Lagoon (`src/tracks/fishiesLagoon.ts`): a sand road over a turquoise lagoon, a plank causeway with fish leaping over it, reef esses, a pier jump, a lighthouse
  - Ice V Glacier (`src/tracks/iceVGlacier.ts`): sheet ice that slides karts wide through the turns, an icicle chicane, a crevasse jump, four hairpins between walls, ice blocks skating across a frozen lake
  - Cyboogie City (`src/tracks/cyboogieCity.ts`): Han-Tyumi's neon downtown at night, a walled alley of right angles, an elevated freeway, laser gates firing on a rhythm
  - Butterfly 3000 Skyway (`src/tracks/butterflySkyway.ts`): a rainbow road in the sky with nothing below it, butterfly swarms that buffet karts, a star leap, chrysalis hairpins
  - Each has its own theme, scenery, landmark and seqbaby song (a final-lap cut for the Skyway). Loops close with a turn-straight-turn (Dubins) path, `TrackBuilder.turnTo`
- Petrodragonic Apocalypse (`src/tracks/petrodragonicApocalypse.ts`), the hard finale of a third cup, the Apocalypse Cup: a burning oil field under a black sky, oil slicks that slide like ice, dragons breathing fire across a walled gullet, burning crude raining down, a jump over a moat of burning oil, a rail-less bridge over an oil lake, a dragon skull for a start gate and a dragon circling overhead
- Track Generator (`src/tracks/generator.ts`): a mode in the picker that builds a new track at race time from three dials: theme (any of the eight worlds), twists (complexity 1 to 5: narrower roads, tighter corners, chicanes, switchback hairpins, jumps and more hazards) and length (short, medium, long). A seeded rectangle skeleton is filled with themed corner modules, each measured before it's placed, and closed exactly on the line; a layout that crosses itself is re-rolled from the same seed. Every track gets a generated name; after racing one you can keep it under that name or your own (`src/ui/saveTrack.ts`). Saved tracks are just seed and dials in the browser (`src/core/savedTracks.ts`), listed in the picker's Track row with a Delete button
- Rattlesnake Run: Salt Flat Straight, Sidewinder S-Bends, Rattle Canyon, The Coil (a double spiral), Dry Wash with the Snake's Mouth shortcut (a 20 m jump: a boost at 50cc, flat out from 100cc), Mesa Leap (`src/tracks/rattlesnakeRun.ts`)
- Race: checkpointed laps, fall detection and respawn at the last checkpoint after 1.5 s (`src/core/race.ts`)
- CPU racers (`src/ai/cpuDriver.ts`): own racing lane, corner braking, drifts for mini-turbos, steer around karts ahead, recover when stuck; difficulty follows the class; mild rubber-banding; kart bumps by weight; positions and results
- Items (`src/items/items.ts`): Fuzz Pedal, Microtonal Mine, Feedback Wave, Riff Missile, Tempo Shift (longest on the leader, shortest on last place), and the Woo Cannon for the last three (a catch-up shell that flies itself down the road, with its own shout, `public/sfx/woo.mp3`), with position-biased odds, a 1 s roulette and item boxes that respawn after 3 s. CPUs save items for a good moment, more often at higher classes
- Hazards on Rattlesnake Run (`src/items/hazards.ts`): snakes crossing the S-Bends, dust devils on the Salt Flat, tumbleweeds and falling boulders in Rattle Canyon. Their motion is a pure function of race time; CPUs steer around them and around mines
- Modes (`src/ui/menu.ts`): Grand Prix (pick the Nonagon Cup or the Microtonal Cup, four tracks each, points 15/12/10/8/6/4, standings after each race, the leader starts at the back, a podium at the end; `src/core/grandPrix.ts`, `src/render/podium.ts`), Single Race, and Time Trial (one lap, alone, no items, best times kept in the browser, and your fastest run replays as a see-through ghost to race against; `src/core/ghost.ts`)
- Online Time Trial (Milestone 8a, docs/MULTIPLAYER.md): pick a display name in the picker, finished runs post to a leaderboard per track and class, and any listed run can be raced as a pink ghost next to your own. Servers in `party/` (PartyKit on Cloudflare Durable Objects): `players` (guest identities) and `trials` (boards and ghosts), with runs checked by `src/net/runCheck.ts`
- Online rooms (Milestone 8b): pick Online in the picker, create a room or join one by its 4-letter code or a `?room=` link. The lobby shows who's in, their racers and ping; the host picks track and class and starts once everyone is ready; CPUs fill the grid. Every client starts on the room's clock, and a pause from anyone pauses the race for everyone (anyone can resume). (`party/room.ts`, `src/net/room.ts`, `src/ui/lobby.ts`)
- Live online races (Milestone 8c): the room runs the race (CPUs, item boxes, items and hits) on a 60 Hz server loop and sends snapshots 15 times a second; each player drives their own kart locally and reports it, other karts are shown 0.1 s in the past, interpolated. Hits land on your kart as effects from the room, and the room calls the results (`src/net/roomRace.ts`, `src/net/onlineRace.ts`, `src/net/wire.ts`)
- Psychedelic layer (`src/render/postfx.ts`): heat haze that shimmers hardest on the straights (desert, and lighter on the volcano), the Rattlesnake Run sky turning a full circle of hue over the race, a kaleidoscope on the screen edges on the final lap pulsing with the music's beat, diamond-back barriers that crawl like scales, wheel dust off-road, and a camera flyover with a title card before each race
- Sound effects synthesized with Web Audio, no samples (`src/audio/sfx.ts`): engine pitched by speed with fuzz on boosts, tire squeal in drifts and hard turns, countdown, laps, drift sparks, hops, landings, walls, item pickups and uses, hits, and panned snake rattles and dust devil wind. The music sits under the effects and ducks for the big ones
- Soundtrack from seqbaby (account `gizzracer`), looping per track with a faster cut on the final lap, a title theme and a podium loop (`src/audio/music.ts`)
- Early-2000s look: procedural high-res textures, painted sky, lens flare, glossy karts, particle sparks, blob shadows, minimap
- Trackside detail (`src/render/trackDetail.ts`): painted edge and centre lines, a rubbered racing line that swings to the inside of each bend, themed edge posts and lights (fence posts, marker poles, torches, buoys, snow poles, neon street lamps, floating stars), chevron boards on sharp corners, a grandstand with a bouncing crowd and waving flags by the start, billboards and ground cover
- Scenery per theme (`src/render/trackView.ts`): saguaros, prickly pears, barrel cacti, skulls and hoodoos; fruit trees, hay bales, flower bushes and windmills; steaming lava pools, charred trees and basalt columns; giant flowers, glowing mushrooms and stone idols; stilt huts, rocking sailboats and gull rocks; igloos and snowmen; rooftop beacons and water tanks; floating islands and hot air balloons. A second, nearer ring of horizon silhouettes for depth

Flow: title, then a picker (mode, track, racer, class). Grand Prix: race, results, cup standings, next race, and a podium after the fourth. Single Race and Time Trial: race, results, back to the picker.

Controls: auto-accelerate, arrows steer, Down brakes/reverses, Shift/Space hop+drift (tap at a ramp lip for a trick), E (or X, gamepad L1) item, Q look back, Esc pause. Touch: drag on the left half to steer, DRIFT, BRAKE and ITEM on the right, and tap the screen anywhere else to hop (tap at a ramp lip for a trick).

Settings (title screen and pause menu): music and effects volume, automatic or manual throttle, and tilt steering for phones that have the sensor (turn the phone like a wheel; sensitivity, invert, recentre; it recentres at every race start, and the drag pad hides while it's on). The first tap on a phone with tilt asks drag or tilt, once. Phones: the first tap goes fullscreen and locks to landscape where the browser allows it (Android Chrome). Held upright, the game shows a "turn your phone sideways" card and pauses the race. iPhone Safari can't go fullscreen from a page, so the title suggests Share, Add to Home Screen; the web app manifest launches it fullscreen in landscape from there.

In a race: `R` restart, `M` manual throttle, `N` music on/off, `B` sound effects on/off. `?showroom` shows every racer on a turntable. In the console, `gizz.warp(0.5)` jumps halfway round the lap and `gizz.autopilot()` lets the CPU drive your kart, `gizz.give('riffMissile')` fills the item slot.

## Soundtrack

The songs live in seqbaby. `public/music/*.mp3` are rendered from them by playing each song in headless Chromium through seqbaby's own engine:

```sh
# needs ../mjoslyn/seqbaby and ../seqbaby-seed checkouts (or SEQBABY_DIR / SEQBABY_SEED_DIR)
node tools/render-soundtrack.mjs            # all cues
node tools/render-soundtrack.mjs podium     # one cue
```
