# GizzRacer

**Psychedelic kart racing in the Gizzverse.** A free kart racer that runs in your browser, on desktop and on phones, themed on the songs, albums and lore of King Gizzard & the Lizard Wizard.

**Play now: [gizzracer.com](https://www.gizzracer.com)**

No install and no account. It will always be free.

## What's in it

- **24 tracks in 6 cups**, plus a Random Cup of four drawn from them,, each built around an album or a song
  - **Nonagon Cup:** Infinite Loop Speedway, Rattlesnake Run, Volcano Fortress, Polygondwanaland Jungle
  - **Microtonal Cup:** Fishies Lagoon, Ice V Glacier, Cyboogie City, Butterfly 3000 Skyway
  - **Apocalypse Cup:** Hell on Mars, Supercell, Murder of the Universe, Petrodragonic Apocalypse
  - **Phantom Island Cup:** Phantom Island, Deadstick Drop, Panpsych Grove, Sea of Doubt
  - **Omnium Gatherum Cup:** Magenta Mountain, Kepler-22b, Goblin Garden, Predator X
  - **Polygondwanaland Cup:** Crumbling Castle (on the N64 castle's layout), The Castle in the Air, Inner Cell, Tetrachromacy
- **Roller-coaster tracks:** climbs onto pillared decks, plunges you fly off, canyons sunk into the ground, and a causeway that dives under the lagoon
- **Shortcuts on every track** that come and go by lap: a phantom causeway that only appears on lap 2, a snake that shuts its jaws, a tide that floods the boardwalk, a wall of fire that only drops on the final lap. Trick kickers on the straights and double item boxes on the risky lines
- **Hazards** from the songs: rattlesnakes, flame jets, tornadoes, black holes, dragons breathing fire across a gullet, planes gliding in with their propellers stopped, waves breaking over a causeway, garden goblins, geysers, a pliosaur snapping over the road's edge, castle masonry slamming down, gusts over the clouds, vesicles and prism beams in four colours. Use them well and they help: surf the wave, catch the fourth colour, hop onto a crashed plane for a ramp, ram a boulder on a boost, slip through a laser gate as it warms up
- **20 racers**, each with their own vehicle: the Lizard Wizard, Han-Tyumi in a fishing dinghy, a flying Gila monster, Beowulf's Witch, the Fuzz Golem, Arlo the poodle in a dog bed, and more. The band are in it too: Amby, Cavs, Cookie, Jason, Joey, Lukey and Stu
- **13 items**, each with a Gizzverse name:
  - Mind Fuzz, Microtonal Banana, Nuclear Fusion, Big Fig Wasp, Horology and the Woo Cannon
  - a signature move for each band member, for example Stu's Sleep Drifter flute flurry or Cavs's Road Train
  - the Nonagon Infinity, a nine-sided ring that rolls down the road to the leader
- **Track Generator:** a new track from a seed, with your choice of world, twists and length. Save the ones you like.
- **A soundtrack** of video-game remixes of the band's songs, one per track, with a faster cut on the final lap
- **A VHS look** after the Rattlesnake video: tape wobble and a duotone in each world's colours. You can turn it down or off.

## Modes

- **Grand Prix:** four races, points after each, and a podium at the end
- **Single Race:** any track, any class (50cc, 100cc, 150cc)
- **Time Trial:** one lap alone. Online leaderboards, and you race against your best run as a ghost.
- **Online:** make a room, share the four-letter code or link with friends, and race live. CPUs fill the empty grid slots.

## How to play

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | Left / Right (or A / D) | Left stick | Drag on the left half (or tilt the phone) |
| Accelerate | Automatic (M for manual: Up / W) | Automatic (manual: A) | Automatic |
| Brake / reverse | Down / S | B | BRAKE |
| Hop and drift | Shift / Space | R1 | DRIFT, or tap anywhere |
| Use item | E | L1 | ITEM |
| Look back | Q | Y | |
| Pause | Esc | Start | Pause button |

- **Drift:** hold hop while turning. Sparks charge from blue to orange to purple, and letting go gives a boost. The longer you hold, the bigger it is.
- **Tricks:** tap hop just as you leave a ramp or a crest for a boost when you land. Chain them for bigger ones.
- **Rocket start:** hop just as the countdown's 1 goes out.
- **Slipstream:** tuck in behind another kart to charge a boost.
- **Nonagon Infinity:** hop as it reaches you to ride over it.

Smart Steering is on by default. It steers you back from edges and straightens you up out of turns, and you can always steer through it. Turn it off under Settings > Steering.

On phones, turn the phone sideways. On iPhone, use Share, then Add to Home Screen to play full screen.

## Credits

- GizzRacer is an unofficial fan game, made with love for King Gizzard & the Lizard Wizard and their fans
- The music is written and remixed in [seqbaby](https://playseqbaby.com). The Crumbling Castle, Omnium Gatherum Cup and title remixes are transcribed from the band's own recordings (Polygondwanaland and their live bootlegs), which King Gizzard & the Lizard Wizard released for anyone to use
- Lettering in Metal Mania by Open Window (SIL Open Font License, `public/fonts/OFL.txt`)
- Built with [Three.js](https://threejs.org). Online play runs on [PartyKit](https://www.partykit.io) and Cloudflare.

## For developers

```sh
npm install
npm run dev   # http://localhost:5173
npm test
```

The design is in [SPEC.md](SPEC.md), online play in [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md), and build, deploy and tooling notes in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
