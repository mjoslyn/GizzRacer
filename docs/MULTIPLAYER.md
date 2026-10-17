# GizzRacer Online (Milestone 8)

Spec for online play on **PartyKit**: saved Time Trial runs with leaderboards and downloadable ghosts, then rooms and real-time races. Builds on SPEC.md section 11 (inputs and state kept separate, fixed 60 Hz simulation).

## 1. Goals

- Time Trial runs saved online: personal bests, a leaderboard per track and class, and any listed run downloadable as a ghost to race against.
- Private rooms for up to 8 players, joined with a short code; empty grid slots filled with CPUs.
- Single Race and Grand Prix online, with items and hazards.
- Feels local: your own kart never waits on the network.
- Works on phones (Safari included) without installs.

Not in scope: public matchmaking, password accounts, chat, spectating, anti-cheat beyond sanity checks.

## 2. Platform

**PartyKit** in its current form: the `partyserver` library on Cloudflare Durable Objects, deployed with `wrangler` to our own Cloudflare account, plus the `partysocket` client (a WebSocket that reconnects and buffers while offline).

Why PartyKit:
- **A server per room.** Each room is one Durable Object, a small stateful server that lives as long as the room does.
- **Shared code.** It runs TypeScript, so the room can run our own race simulation (`src/core/race.ts` has no browser dependencies) for CPUs, items and results. That means no host player and no host handover.
- **Fewer messages.** The room bundles every kart into one update per tick: each client receives one message per tick instead of one per other player.
- **Storage built in.** SQLite storage (2 MB per row) holds leaderboards and ghosts, so no second backend is needed.
- **Cheap.** Idle connections hibernate and aren't billed; incoming WebSocket messages are billed as requests at 20 to 1.

The game itself stays a static site and can be hosted anywhere (Netlify, Cloudflare Pages); it connects to the party host by URL.

### Parties

| Party | One instance per | Holds |
|---|---|---|
| `room` | room code (`KZRT`) | lobby, race simulation, Grand Prix standings |
| `trials` | leaderboard (`rattlesnake-run.100cc.v3`) | runs table, ghosts, top-N cache |
| `players` | single instance (`global`) | guest identities and display names |

Code lives in `party/` (server) and `src/net/` (client), sharing `src/core`, `src/physics`, `src/items`, `src/tracks` and `src/ai`.

## 3. Identity

No sign-up. On first online use the game makes a guest identity: a random `playerId` and a random secret `token`, kept in localStorage. The player picks a display name (3 to 16 characters, filtered).

- `players` stores `playerId`, a hash of the token, and the name. It checks the token on name changes and on run uploads; other parties ask it to verify (or the client sends a short-lived signed ticket issued by `players`).
- Clearing browser data loses the identity. A later option: export or import the identity as a code, or add real sign-in.

## 4. Phases

| Phase | Ships |
|---|---|
| 8a | Online Time Trial: guest identity, run uploads, leaderboards, ghost downloads. **Built** |
| 8b | Rooms: create or join by code, lobby, host settings, ready up |
| 8c | Online races: the room runs the race; clients drive their own karts |
| 8d | Hardening: disconnects, reconnect into a running race, phone testing, load test |

8a stands alone, so it goes first.

## 5. Time Trial online (8a)

### 5.1 Player flow

- After a Time Trial finish, the results offer "Upload run". A new personal best uploads automatically once the player has a name.
- In Time Trial mode the picker gains a **Leaderboard** row: top 10 for the track and class, plus your rank.
- Pick any row to race that run's ghost. Your own best local ghost can show alongside it, tinted differently.
- Offline, everything stays local exactly as now.

### 5.2 What a run carries

- **Header:** track, engine, racer, physics version, total and lap times in ms, game build.
- **Ghost:** x, y, z, heading, slip, steer at 15 Hz from the green light, already recorded today (`src/core/ghost.ts`, about 75 KB for 3 laps, gzipped for upload).
- **Inputs (new):** the `InputFrame` stream, run-length encoded with steer quantized to 1/64. It's a few KB and lets the server re-simulate a run later if needed.

### 5.3 The `trials` party

One instance per board: `{track}.{engine}.v{physics}`. HTTP endpoints (`onRequest`):

- `GET /` returns the top 50 (name, racer, total, laps, run id) and, with `?player=`, that player's rank and best.
- `GET /ghost/{runId}` returns the ghost blob.
- `POST /` (identity token required) checks the run (5.4) and keeps it only if it beats that player's best; the reply has the rank either way. Each player has one run (their best) and its ghost per board.

SQLite tables in the instance: `runs (player_id primary key, run_id, name, racer_id, total_ms, laps_ms, created_at)` and `ghosts (run_id, data)`.

As built: `party/trials.ts`, `party/players.ts`, `party/index.ts` (routing; everything else is the game's static files), checks in `src/net/runCheck.ts` (shared with the tests), client in `src/net/` and `src/ui/leaderboard.ts`. The input stream (5.2) isn't uploaded yet; the ghost path is what gets checked.

### 5.4 Validation (cheap, not bulletproof)

The server rejects a run when:
- the lap times don't sum to the total, or any lap beats the track's floor (a per-track constant set from the fastest CPU and dev runs, minus a margin);
- the ghost path misses a checkpoint or takes them out of order on any lap, or moves faster than boost top speed between samples (with slack for respawns);
- the physics version isn't current.

Re-simulating from the inputs is the stronger check, and it can run in the party since it's the same code. But floating point can differ between a phone and the server, so a replay would only need to land within a tolerance. That stays a later option.

### 5.5 Versioning

`PHYSICS_VERSION` in `src/physics/kart.ts` is bumped whenever kart physics, racer stats or a track layout change lap times. It's part of the board name, so a bump starts fresh boards; the old ones stay readable.

## 6. Rooms and lobby (8b)

- **Room code:** 4 letters with no vowels (no accidental words), for example `KZRT`. It's also the `room` party instance name. Join link: `/?room=KZRT`.
- **Lobby state** is held by the room and pushed to everyone on change: members (`playerId`, name, racer, ready, ping), host, settings.
- **Host:** the creator, then the longest-connected member if they leave. The host picks mode (Single Race or Grand Prix), track or cup, and class, and can start once everyone is ready. The room enforces everything; the host only sends requests.
- **Racers:** one kart per racer, so two players can't both pick the same racer; first come keeps it.
- **Start:** the room fills empty slots with CPUs, picks the seed and grid, and announces a start time about 3 s ahead on its clock.
- **Lifetime:** an empty room closes after 10 minutes; an alarm clears its state.

## 7. Race netcode (8c)

### 7.1 Who decides what

| Thing | Decided by | Why |
|---|---|---|
| Your kart's movement | you, simulated locally at 60 Hz | no input lag; floating point can differ between devices, so there's no lockstep |
| CPU karts | the room, running `Race` with the same `CpuDriver` | no host player needed |
| Item boxes, pickups and rolls | the room | one source of truth for who got what |
| Mines, missiles, waves, Tempo Shift, and every item hit | the room, against the latest reported kart positions | one authority for items keeps hits consistent for everyone |
| Hazards (snakes, boulders, jets...) | each client for its own kart, from race time | already a pure function of time (`src/items/hazards.ts`); nothing to send |
| Kart-to-kart bumps | each client for its own kart, against others' shown positions | no teleporting; bumps feel slightly soft at high ping |
| Laps, finish times, results, Grand Prix points | the room, from kart reports and its own checks | |

The room keeps a full `Race`, where human karts are "remote": each tick it places them at their latest reported state instead of simulating them. That way CPUs steer around them, missiles home on them and positions rank correctly.

### 7.2 Clock

The room's race clock is the reference. On connect and every few seconds, clients send a ping and keep the lowest round trip to estimate their offset. Race start is an instant on the room's clock, so all karts leave the grid together to within a frame or two.

### 7.3 Messages

JSON over the room WebSocket, with compact arrays for kart states.

**Client to room:**

| Message | Rate | Content |
|---|---|---|
| `kart` | 15 Hz | race time, x, y, z, heading, speed, vy, slip, steer, driftDir, drift tier, boostTime, spinTime, wobbleTime, slowTime, lap, progress, flags (about 120 bytes) |
| `use-item` | on press | item slot only; the room checks the player really holds it |
| `hazard-hit` | on hit | which hazard, so the room knows (for its kart copy and the HUD of others) |
| `ping` | 0.5 Hz | timestamp |

**Room to clients:**

| Message | Rate | Content |
|---|---|---|
| `snap` | 15 Hz | race time, every kart's state (humans as reported, CPUs as simulated), item entities (mines, missiles, waves), box respawn bits |
| `you` | on change | your item and roulette, hits you took (spin, wobble, slow) to apply to your kart |
| `event` | on event | pickups, item uses, hits, lap and finish callouts for the HUD |
| `results`, `gp` | per race | finishing order, points, standings |
| `lobby` | on change | members and settings |

### 7.4 Hits on your kart

When the room decides an item hit you (a missile reached your reported position, you're inside a wave, you drove over a mine), it sends `you` with the effect. Your client applies it at once, unless you're still immune from an earlier hit. This lands up to one round trip late, about 50 to 150 ms. If that feels unfair in testing, the fallback is to let the victim's client decide mine and missile hits from the entities it sees.

### 7.5 Smoothing

- **Other karts and item entities:** buffered from `snap`s and rendered 100 ms in the past, interpolating between the two states around that time.
- **Late packets:** if the buffer runs dry, extrapolate along heading and speed for up to 250 ms, then hold.
- **Big jumps:** respawns and moves over 8 m snap instead of interpolating.
- **Your own kart** is never moved by the network, only affected by hits.

### 7.6 Finishing and Grand Prix

Clients report their finish; the room checks it against its lap tracking for that kart and records the time on its clock. If a human hasn't finished 30 s after the winner, they're placed where they are. Grand Prix standings live in the room; the next race starts when the host continues, and everyone loads the same track.

### 7.7 Load and cost

A race of 8 humans, 15 Hz each way, 3 minutes:
- **Incoming to the room:** 8 × 15 × 180 = 21,600 messages, billed as about 1,080 requests (20:1).
- **Outgoing:** 15 bundles a second to each client. Outgoing WebSocket messages aren't billed as requests.
- **Compute:** the room is awake for the race (it ticks at 60 Hz), so it's billed for duration while racing and hibernates in an idle lobby.

Even many races a day should stay within or near Cloudflare's free and entry tiers, but check the current Durable Objects pricing before launch. A Durable Object handles about 1,000 requests a second; a room uses about 120, so there's headroom.

## 8. Disconnects (8d)

- **Drops:** if a player's socket closes, or no `kart` arrives for 2 s, the room hands that kart to a `CpuDriver` from its last state, so it keeps racing as a CPU.
- **Reconnects:** `partysocket` reconnects on its own. If the player is back within the race, they get a snapshot and take their kart back from wherever the CPU left it; otherwise they rejoin at the next race.
- **Host:** the host role passes to the next member. Nothing is lost, because the room, not the host, runs the race.
- **Backgrounded phones:** a hidden tab stops sending, which counts as a drop; the kart is handed back when the tab returns.

## 9. Code changes

- `party/room.ts`: the `room` party. Lobby, a 60 Hz race loop with `Race` on remote karts, message handling, results and Grand Prix.
- `party/trials.ts`, `party/players.ts`: leaderboards, ghosts, identities.
- `wrangler.toml`: Durable Object bindings (SQLite storage), routes via `routePartykitRequest`.
- `src/net/socket.ts`: `partysocket` connections, clock sync, message encode and decode.
- `src/net/identity.ts`, `src/net/trials.ts`: guest identity, uploads, leaderboard and ghost fetch.
- `src/net/remoteKart.ts`: interpolation buffer, producing a render snapshot the same shape as `interpolate()` in game.ts.
- `src/core/race.ts`: karts get an owner (`local`, `remote`, `cpu`); `step()` only simulates owned karts; remote karts take their state from the network. The item system can run on the server only, with clients applying effects from `you`.
- `src/core/input.ts`, `src/core/ghost.ts`: input-stream recording for uploads.
- `src/ui/`: name prompt, leaderboard panel, lobby screen (code, members, ready, host settings), connection indicator.

## 10. Testing

- **Unit:** message encode and decode, interpolation buffer, clock offset estimate, run validation (fed real and doctored runs).
- **Sim:** the room's race loop and two or more client `Race`s in one vitest process, joined by a fake transport that adds latency (50 to 250 ms), jitter and 5% loss. Check that every kart finishes, that client and room positions agree within tolerance, and that each item hit is applied exactly once.
- **Local server:** `wrangler dev` runs the parties locally; Playwright drives two pages (one phone-sized) in one room.
- **Real devices:** an iPhone on cellular plus a desktop on Wi-Fi in one room before 8c is called done.

## 11. Open questions

- **Cloudflare account:** the parties deploy to a Cloudflare account; whose, and is a custom domain wanted for the party host?
- **Public or private:** public leaderboards mean name moderation; the spec's open question on public release still stands.
- **Identity:** guest identities are tied to one browser. Is an export code enough, or is real sign-in wanted later?
- **Ghost access:** may anyone download any top-50 ghost, or only the top 10?
