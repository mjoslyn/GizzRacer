# GizzRacer Online (Milestone 8)

Spec for online play on Supabase: saved Time Trial runs with leaderboards and downloadable ghosts, then rooms and real-time races. Builds on SPEC.md section 11 (inputs and state kept separate, fixed 60 Hz simulation).

## 1. Goals

- Time Trial runs saved online: personal bests, a leaderboard per track and class, and any listed run downloadable as a ghost to race against.
- Private rooms for up to 8 players, joined with a short code; empty grid slots filled with CPUs.
- Single Race and Grand Prix online, with items and hazards.
- Feels local: your own kart never waits on the network.
- Works on phones (Safari included) without installs or extra ports.

Not in scope: public matchmaking, accounts with passwords, voice or text chat, spectating, anti-cheat beyond sanity checks.

## 2. Phases

| Phase | Ships | Needs |
|---|---|---|
| 8a | Online Time Trial: sign-in as a guest, upload runs, leaderboards, download ghosts | Supabase project, tables, storage, one Edge Function |
| 8b | Rooms: create/join by code, lobby with presence, host picks track/class/mode, ready up | Realtime presence and broadcast |
| 8c | Online races: kart state sync, items, hits, finish and results | Netcode below |
| 8d | Hardening: disconnects, host handover, reconnect, late join as spectator, phone testing | |

8a stands alone and is useful on its own, so it goes first.

## 3. Backend

A new Supabase project, `gizzracer` (no existing project fits; the seqbaby project stays separate).

**Auth:** anonymous sign-in on first online use, so there's no sign-up form. The player picks a display name (3 to 16 chars, profanity-filtered on insert). Optional later: link an email to keep the identity across devices.

**Tables** (all with RLS on):

```sql
profiles (
  id uuid primary key references auth.users,
  name text not null check (char_length(name) between 3 and 16),
  created_at timestamptz default now()
)
-- read: everyone. insert/update: own row only.

trial_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  track_id text not null,          -- 'rattlesnake-run'
  engine text not null,            -- '50cc' | '100cc' | '150cc'
  racer_id text not null,
  physics_version int not null,    -- see section 4.4
  total_ms int not null,
  lap_ms int[] not null,           -- one entry per lap
  ghost_path text not null,        -- object in the ghosts bucket
  created_at timestamptz default now()
)
-- read: everyone. insert: only through the submit-run Edge Function (service role).
-- index (track_id, engine, physics_version, total_ms)

trial_best (view) -- each user's fastest run per (track, engine, physics_version), for leaderboards
```

**Storage:** bucket `ghosts`, public read, write by the Edge Function only. One object per run: `{track}/{engine}/{run id}.ghost`, the same compact format as local ghosts (`src/core/ghost.ts`, about 75 KB for 3 laps), gzip on upload.

**Edge Function `submit-run`:** takes the run summary and the ghost, checks it (section 4.3), stores the ghost, inserts the row, and prunes the user's older runs for that board beyond their best 3.

## 4. Time Trial online (8a)

### 4.1 Player flow

- After a Time Trial finish: "Upload run?" on the results (on by default once the player has a name). A new personal best uploads automatically.
- The picker gains a **Leaderboard** row in Time Trial mode, showing the top 10 for the track and class, plus your rank.
- Pick any row to race that run's ghost; your own best local ghost can show alongside it (two ghosts, tinted differently).
- Offline or signed out, everything stays local exactly as now.

### 4.2 What a run carries

- Header: track, engine, racer, physics version, total and lap times in ms, game build.
- Ghost samples: x, y, z, heading, slip, steer at 15 Hz from the green light (already recorded today).
- Inputs (new): the player's `InputFrame` stream, run-length encoded (steer quantized to 1/64). It is small (a few KB) and lets the server or a later tool re-simulate the run.

### 4.3 Validation (cheap, not bulletproof)

The Edge Function rejects a run when:
- the lap times don't sum to the total, or any lap is faster than the track's floor (a per-track constant set from the fastest CPU and dev runs, minus a margin);
- the ghost path doesn't pass every checkpoint in order on every lap, or moves faster than boost top speed between samples (with slack for falls and respawns);
- the physics version isn't current.

Full re-simulation from inputs is the stronger check, but browsers don't produce bit-identical floating point, so the result can drift. It stays a later option: re-simulate in Deno and accept the run if the replayed finish lands within a tolerance.

### 4.4 Versioning

`PHYSICS_VERSION` in `src/physics/kart.ts` is bumped whenever kart physics, racer stats or a track layout change lap times. Leaderboards and ghost downloads filter on the current version; old runs stay in the table but drop off the boards.

## 5. Rooms and lobby (8b)

- **Room code:** 4 letters (no vowels, so no accidental words), e.g. `KZRT`. The room is a Realtime channel `room:KZRT`. No table needed; an optional `rooms` row (code, host, created_at) helps prevent code clashes and gives join links: `/?room=KZRT`.
- **Presence:** each client tracks `{ userId, name, racerId, ready, ping }`. The lobby lists members from presence.
- **Host:** whoever created the room. The host picks mode (Single Race or Grand Prix), track or cup, and class. Racer choice is per player; two players can't pick the same racer (first come keeps it, like the one-kart-per-racer rule today).
- **Start:** when everyone is ready, the host broadcasts `start` with the settings, the grid, a race seed and a start time on the shared clock (section 6.2), about 3 s ahead. Empty slots get CPUs, all run by the host.
- Up to 8 karts; up to 8 humans.

## 6. Netcode (8c)

### 6.1 Model: everyone drives their own kart

The simulation only uses seeded randomness, but JavaScript floating point isn't guaranteed to match across browsers and phones, so lockstep (everyone simulating everyone from inputs) would drift. Instead:

- **Your kart:** simulated locally at 60 Hz exactly as now, no waiting. Its state is broadcast to the others.
- **Other humans' karts:** shown from their broadcast states, interpolated about 100 ms in the past, with short extrapolation if a packet is late.
- **CPU karts, item boxes, the race clock, results:** owned by the host and broadcast like a human kart.
- **Hazards:** already a pure function of race time (`src/items/hazards.ts`), so every client computes them locally from the shared clock; nothing is sent.
- **Collisions between karts:** each client resolves bumps for its own kart only, against the others' displayed positions. Bumps feel slightly soft at high ping, but nobody gets teleported.

This is the usual approach for kart racers: it stays smooth on a laggy phone, and cheating isn't a concern among friends.

### 6.2 Shared clock

Each client estimates its offset to the host with a few ping/pong broadcasts in the lobby (take the lowest round trip), then keeps refining it during the race. "Race time" everywhere is the host's race clock. The countdown starts at the agreed instant, so all karts leave the grid together to within about a frame or two.

### 6.3 Messages

All on the room channel as Realtime broadcasts. Kart state uses compact arrays rather than objects.

| Message | From | Rate | Payload |
|---|---|---|---|
| `state` | each human, the host for each CPU | 12 Hz | race time, x, y, z, heading, speed, vy, slip, steer, driftDir, drift tier, boostTime, spinTime, wobbleTime, slowTime, lap, progress, item, flags (about 120 bytes as JSON) |
| `item-use` | firer | on use | item, id (`{player}:{n}`), position, heading, target id for missiles |
| `hit` | victim | on hit | by (item id or hazard kind); the victim decides it was hit |
| `box` | host | on change | box index, respawn time |
| `finish` | each kart's owner | once | finish time, lap times |
| `results` / `gp-standings` | host | per race | finishing order, points |
| `ping` / `pong` | anyone | 1 Hz | timestamps for clock sync and the lobby ping display |

Item rules:
- **Pickups:** a kart that drives through a box rolls its own item locally (the seeded RNG takes the player id and box id) and tells the host, which marks the box used. If two karts grab the same box within one round trip, both keep their item; it's rare and harmless.
- **Projectiles and mines:** simulated on every client from the `item-use` message.
- **Hits:** decided by the victim. Your client checks your kart against the mines, missiles and waves it sees, applies the spin locally and announces it. Being hit by something you can see is what feels fair.
- **Tempo Shift:** applies on each receiving client.

### 6.4 Smoothing and corrections

- Remote karts: a buffer of recent states; render at (now minus 100 ms), lerp between the two states around it. If the buffer runs dry, extrapolate along heading and speed for up to 250 ms, then hold.
- Respawns and big jumps (over 8 m) snap instead of lerping.
- Your own kart is never corrected by others, except for item hits you announce yourself.

### 6.5 Finishing and Grand Prix

Each owner announces its own finish time on the shared clock; the host collects them into results. If a human hasn't finished 30 s after the winner, they're placed in their current position. Grand Prix standings are kept by the host and broadcast after each race; the next race starts when the host continues.

### 6.6 Bandwidth and quotas

At 12 Hz, 8 senders and 7 receivers each, a 3-minute race delivers roughly 8 × 12 × 7 × 180 ≈ 120,000 messages. Supabase meters Realtime messages per month and limits per-second throughput by plan, so this needs checking against the project's plan before launch. Ways to cut it if needed:
- **Lower rate:** drop to 8 to 10 Hz when more than 4 humans are in a room.
- **Host relay:** the host bundles all state into one message per tick, giving 1 send and 7 receives per tick instead of 8 × 7. That halves the latency headroom but cuts messages about 8 times.
- **WebRTC upgrade:** Realtime only does signaling and karts talk over WebRTC data channels, with no per-message cost and lower latency. The catch is a TURN server for strict NATs (some mobile carriers). Kept as a later option, not the first version.

## 7. Disconnects and host handover (8d)

- **Leaving:** a player who drops (presence leave, or no `state` for 3 s) has their kart taken over by a CPU on the host, who keeps their slot and position. If they come back within the race they spectate; they're back in the grid next race.
- **Host handover:** if the host drops, the remaining client with the lowest user id becomes host. It already has every kart's latest state and the item box table (from broadcasts), so it takes over the CPUs from their last states.
- **Backgrounding:** a backgrounded phone tab stops sending; to others it looks like a drop, and the kart goes to a CPU until it resumes.

## 8. Code changes

- `src/net/supabase.ts`: client, anonymous auth, profile name.
- `src/net/trials.ts`: upload, leaderboard query, ghost download. Reuses `encodeGhost` / `decodeGhost`.
- `src/net/room.ts`: channel, presence, clock sync, message encode/decode.
- `src/net/remoteKart.ts`: interpolation buffer for one remote kart, giving a render snapshot the same shape as `interpolate()` in game.ts.
- `src/core/race.ts`: karts get an owner (`local`, `remote`, `cpu`); `step()` simulates only karts this client owns, and remote karts take their pose from `remoteKart`. Item system: fire from events; hits only for local karts.
- `src/core/input.ts` / `ghost.ts`: input-stream recording for Time Trial uploads.
- `src/ui/`: name prompt, leaderboard row and panel, lobby screen (room code, members, ready, host settings), connection indicator.
- `supabase/`: migrations for tables and RLS, the `submit-run` Edge Function, bucket policy.

## 9. Testing

- **Unit:** message encode/decode, the interpolation buffer, clock offset estimation, ghost validation rules (fed real and doctored runs).
- **Sim:** two or more `Race` instances in one vitest process joined by a fake transport that adds latency (50 to 250 ms), jitter and 5% loss. Check that every kart finishes, that positions agree within tolerance between clients, and that item hits are announced once.
- **Browser:** Playwright with two pages in one room, including a phone viewport; screenshots of the lobby and the race.
- **Real devices:** an iPhone on cellular plus a desktop on Wi-Fi in one room before calling 8c done.

## 10. Open questions

- **Public or private:** public leaderboards mean display-name moderation and a project that's publicly reachable; the spec's open question on public release still stands.
- **Plan and cost:** whether the free Supabase plan's Realtime quotas are enough (section 6.6), or the project goes on a paid plan.
- **Accounts:** guest-only identities are tied to one browser; is email linking wanted in 8a or later?
- **Ghost rights:** may anyone download anyone's ghost, or only the top N per board?
