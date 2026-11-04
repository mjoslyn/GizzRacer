# GizzRacer notes

See docs/DEVELOPMENT.md for how the game is built, run and tested, and SPEC.md for what it is.

## Live recordings (public/music/bootlegs.json)

- Every live song starts with the music and ends with it: trim the crowd noise, the tuning and the stage banter at both ends. `start` is where the music begins, `end` where it stops before the applause.
- When adding recordings for a song, run `node tools/starts-player.mjs add "<song title>" --slugs <two-letter slug> --cup "<cup>" --out <dir> --python <python with librosa>` (several songs and slugs at once are fine). It downloads each recording, runs `tools/live-edges.py` and writes `start` and `end` into bootlegs.json (only where there is none yet), cuts the two-minute clips (from 40 s before the `start`), adds the recordings to `tools/starts-player/items.json` and writes the filled player page to `<out>/index.html`. Check the strips it prints: keep a quiet intro or coda of the song itself and a segue into the next song.
- Drop a recording the Archive won't serve, and duplicates (the same release filed under two dates).
- Then let the owner check every start by ear before it ships: republish the Live Recording Starts player (https://claude.ai/artifact/Gg5bR8wCrHcKz7LwYBtfa3) from `<out>` (index.html and the new clips, which `add` lists), and when the owner has saved their choices, export its `starts` collection to a folder (one `<key>.json` a recording) and run `node tools/starts-player.mjs apply <folder>`: moved starts become the `start`, and recordings marked `drop` are taken out (and added to `SKIP` in tools/bootlegs.mjs so a re-run leaves them out).

## New songs

- Put new remixes in a player artifact for the owner to hear (each track's lap and final-lap loop), as the Gumboot Soup Cup's were (https://claude.ai/artifact/3Nfuss97ooYuf4fnAdhjrn).
