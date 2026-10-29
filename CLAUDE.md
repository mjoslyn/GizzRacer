# GizzRacer notes

See docs/DEVELOPMENT.md for how the game is built, run and tested, and SPEC.md for what it is.

## Live recordings (public/music/bootlegs.json)

- Every live song starts with the music and ends with it: trim the crowd noise, the tuning and the stage banter at both ends. `start` is where the music begins, `end` where it stops before the applause.
- When adding recordings, download each one and run `python3 tools/live-edges.py <file.mp3> ...` (needs librosa) to read `start` and `end`; check its strips, keep a quiet intro or coda of the song itself and a segue into the next song.
- Drop a recording the Archive won't serve, and duplicates (the same release filed under two dates).
