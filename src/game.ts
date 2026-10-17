import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop, PHYSICS_DT } from './core/loop';
import { clamp, damp, lerp, lerpAngle } from './core/math';
import { CPU_SKILL, CpuDriver } from './ai/cpuDriver';
import { MusicPlayer, type MusicCue } from './audio/music';
import { Sfx } from './audio/sfx';
import { GHOST_OVERRUN, GhostRecorder, decodeGhost, encodeGhost, ghostPose, type GhostRun } from './core/ghost';
import { identity } from './net/identity';
import { fetchGhost, uploadRun } from './net/trials';
import { LeaderboardPanel } from './ui/leaderboard';
import { GrandPrix } from './core/grandPrix';
import { Race, ordinal, type RaceKart } from './core/race';
import { copyKartState, createKartState, driftTier, respawnKart, type KartState, type StepEvents } from './physics/kart';
import { RACERS, type RacerDef } from './physics/racers';
import type { HazardKind } from './items/hazards';
import type { ItemKind } from './items/items';
import { ChaseCamera } from './render/chaseCamera';
import { HazardsView, ItemsView } from './render/itemViews';
import { KartView, setDustColor } from './render/kartView';
import { PostFx } from './render/postfx';
import { flareRingTexture, glowTexture, setTextureAnisotropy } from './render/textures';
import { buildTrackView, type TrackView } from './render/trackView';
import { TRACK_LIST } from './tracks/index';
import { pointAt } from './tracks/spline';
import { Track } from './tracks/track';
import { Hud, formatTime, type Table, type TableRow } from './ui/hud';
import { Menu, type MenuChoice } from './ui/menu';
import { Podium } from './render/podium';
import { ScreenFit } from './ui/screen';
import { TouchControls } from './ui/touch';
const SUN_DIR = new THREE.Vector3(-0.5, 0.55, -0.65).normalize();

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);
setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const fog = new THREE.Fog(0xe9b88a, 180, 900);
scene.fog = fog;
const hemi = new THREE.HemisphereLight(0xa8c8ff, 0xc07a48, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 4000);
const chase = new ChaseCamera(camera);

// Sun with lens flare, parked far along the light direction.
const flare = new Lensflare();
flare.addElement(new LensflareElement(glowTexture('rgba(255,250,230,1)', 'rgba(255,220,160,0)', 256), 500, 0, new THREE.Color(0xfff2d0)));
flare.addElement(new LensflareElement(flareRingTexture(), 120, 0.4, new THREE.Color(0x9fd0ff)));
flare.addElement(new LensflareElement(glowTexture(), 70, 0.6, new THREE.Color(0xffb070)));
flare.addElement(new LensflareElement(flareRingTexture(), 200, 0.9, new THREE.Color(0xc0a0ff)));
const sunAnchor = new THREE.Object3D();
sunAnchor.add(flare);
scene.add(sunAnchor);

const postFx = new PostFx(renderer);
const input = new InputManager();
const hud = new Hud(document.body);
const music = new MusicPlayer();
const sfx = new Sfx(
  () => music.context,
  (level, hold) => music.duck(level, hold),
);

/** Grid slot the player starts from; CPUs fill the rest. */
const PLAYER_SLOT = 4;
/** Seconds after crossing the line before the results table. */
const RESULTS_DELAY = 2.5;
/** Seconds of camera flyover before the countdown. */
const INTRO_TIME = 4.5;

/**
 * title -> menu -> race -> results -> menu. A Grand Prix goes
 * results -> standings -> next race, and after the last one -> podium.
 * Behind the title and the menu, CPUs race the chosen track as an attract mode.
 */
type Mode = 'title' | 'menu' | 'race' | 'results' | 'standings' | 'podium';
let mode: Mode = 'title';

let choice: MenuChoice = { mode: 'grandPrix', track: 1, racer: RACERS[0], engine: '100cc' };
/** The cup in progress, if racing a Grand Prix. */
let gp: GrandPrix | null = null;
let podium: Podium | null = null;
/** Time Trial result line for the results screen. */
let trialNote = '';
/** Time Trial: the run being recorded, and the best run replaying as a see-through kart. */
let recorder: GhostRecorder | null = null;
interface Ghost {
  run: GhostRun;
  view: KartView;
  state: KartState;
  /** Who set it, for the HUD: "you" or a leaderboard name. */
  label: string;
}
let ghosts: Ghost[] = [];
let track: Track;
let trackView: TrackView | null = null;
let race: Race;
/** The human's kart, or null in attract mode. */
let player: RaceKart | null = null;
let views: KartView[] = [];
let itemsView: ItemsView | null = null;
let hazardsView: HazardsView | null = null;
let raceSeed = 1;
/** Flyover seconds left before the countdown starts. */
let intro = 0;
/** Smoothed post effect levels. */
const fx = { haze: 0, kaleido: 0 };
/** Debug: the simulation stands still without the pause menu (gizz.freeze). */
let frozen = false;
let lastInput: InputFrame = NEUTRAL_INPUT;
let musicMuted = false;
let sfxMuted = false;
/** What the player's kart was doing last tick, to turn changes into sounds. */
const heard = { count: 0, lap: 0, tier: 0, rolling: false };
/** Seconds the player has been driving against the track. */
let wrongWay = 0;
const snapshots = new Map<RaceKart, KartState>();

const menu = new Menu(document.body, choice, onMenuChange, (c) => {
  choice = { ...c };
  gp = c.mode === 'grandPrix' ? new GrandPrix(defaultGrid(c.racer), TRACK_LIST.map((_, i) => i)) : null;
  startRace(true);
});
const touch = new TouchControls(document.body, input, () => input.requestPause());
const screenFit = new ScreenFit(document.body, fitRenderer);
const board = new LeaderboardPanel(document.body);

/** The leaderboard shows beside the picker in Time Trial mode. */
function updateBoard(refresh = false): void {
  const on = mode === 'menu' && choice.mode === 'timeTrial';
  board.show(on);
  document.body.classList.toggle('board-open', on);
  if (on) board.load(TRACK_LIST[choice.track].id, TRACK_LIST[choice.track].name, choice.engine, refresh);
}

/** Matches the drawing buffer and camera to the viewport. */
function fitRenderer(): void {
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // CSS sizes the canvas; only the drawing buffer changes here.
  renderer.setSize(width, height, false);
}

function setMode(next: Mode): void {
  mode = next;
  document.body.dataset.mode = next;
  hud.showTitle(next === 'title');
  menu.show(next === 'menu');
  touch.setVisible(next === 'race');
  loop.paused = false;
  if (next === 'title' || next === 'menu') music.play('title');
  // Back at the picker: fetch the board again, it may include the run just posted.
  updateBoard(true);
}

function onMenuChange(c: MenuChoice, row: string): void {
  choice = { ...c };
  sfx.menu();
  updateBoard();
  if (row === 'track' || row === 'mode') {
    const idx = menuTrack();
    if (track.def.id !== TRACK_LIST[idx].id) loadTrack(idx);
  }
}

/** The track the menu is showing: the cup's first for a Grand Prix. */
function menuTrack(): number {
  return choice.mode === 'grandPrix' ? 0 : choice.track;
}

/** The track the next race with the player runs on. */
function raceTrack(): number {
  return gp ? gp.trackIndex : choice.track;
}

/** CPUs fill the grid; the player starts from PLAYER_SLOT. */
function defaultGrid(racer: RacerDef | null): RacerDef[] {
  const grid = RACERS.filter((r) => r !== racer);
  if (racer) grid.splice(Math.min(PLAYER_SLOT, grid.length), 0, racer);
  return grid;
}

function loadTrack(index: number): void {
  if (trackView) {
    scene.remove(trackView.group);
    trackView.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  track = new Track(TRACK_LIST[index].build());
  trackView = buildTrackView(track);
  scene.add(trackView.group);
  const t = trackView.theme;
  setDustColor(t.dust);
  fog.color.setHex(t.fog.color);
  fog.near = t.fog.near;
  fog.far = t.fog.far;
  hemi.color.setHex(t.hemi.sky);
  hemi.groundColor.setHex(t.hemi.ground);
  hemi.intensity = t.hemi.intensity;
  sun.color.setHex(t.sun.color);
  sun.intensity = t.sun.intensity;
  hud.minimap.setTrack(track);
  startRace(false);
}

/**
 * One kart per racer: the Grand Prix grid, the default grid for a single
 * race, the player alone in Time Trial, or all CPUs for the attract mode.
 */
function startRace(withPlayer: boolean): void {
  if (withPlayer && track.def.id !== TRACK_LIST[raceTrack()].id) {
    loadTrack(raceTrack());
  }
  const trial = withPlayer && choice.mode === 'timeTrial';
  race = new Race(track, raceSeed++, !trial);
  setupGhost(trial);
  player = null;
  trialNote = '';
  Object.assign(heard, { count: 0, lap: 0, tier: 0, rolling: false });
  const grid = !withPlayer ? defaultGrid(null) : trial ? [choice.racer] : gp ? gp.grid() : defaultGrid(choice.racer);
  for (const r of grid) {
    if (withPlayer && r === choice.racer) player = race.addKart(r, choice.engine, null);
    else race.addKart(r, choice.engine, CPU_SKILL[choice.engine]);
  }
  // Attract mode skips the countdown.
  if (!withPlayer) race.time = 0;
  for (const v of [itemsView, hazardsView]) if (v) dispose(v.group);
  itemsView = new ItemsView(race.items);
  hazardsView = new HazardsView(race.hazards);
  scene.add(itemsView.group, hazardsView.group);
  for (const v of views) scene.remove(v.root, v.fx);
  views = race.karts.map((k) => {
    const v = new KartView(k.racer);
    scene.add(v.root, v.fx);
    return v;
  });
  snapshots.clear();
  chase.snap();
  intro = withPlayer ? INTRO_TIME : 0;
  if (withPlayer) {
    setMode('race');
    music.play(track.def.music.lap as MusicCue);
  }
}

const ghostKey = () => `gizzracer.ghost.${track.def.id}.${choice.engine}`;

/** In Time Trial, starts recording and brings back your best run, and any leaderboard run you picked, as ghosts. */
function setupGhost(trial: boolean): void {
  for (const g of ghosts) scene.remove(g.view.root, g.view.fx);
  ghosts = [];
  recorder = trial ? new GhostRecorder() : null;
  if (!trial) return;
  try {
    const text = localStorage.getItem(ghostKey());
    const run = text ? decodeGhost(text) : null;
    if (run) addGhost(run, 'you');
  } catch {
    // Storage blocked: race without your ghost.
  }
  const picked = board.picked;
  if (picked) {
    const raceAtStart = race;
    fetchGhost(track.def.id, choice.engine, picked.runId)
      .then((run) => race === raceAtStart && addGhost(run, picked.name, 0xff5ad0))
      .catch(() => hud.flash('GHOST UNAVAILABLE'));
  }
}

/** A see-through kart replaying `run`, optionally tinted so two ghosts can be told apart. */
function addGhost(run: GhostRun, label: string, tint?: number): void {
  const id = run.racerId;
  const view = new KartView(RACERS.find((r) => r.id === id) ?? choice.racer);
  const tintColor = tint === undefined ? null : new THREE.Color(tint);
  view.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m: THREE.Material) => {
      const c = m.clone() as THREE.MeshPhongMaterial;
      c.transparent = true;
      c.opacity = 0.38;
      c.depthWrite = false;
      if (tintColor && c.color) c.color.lerp(tintColor, 0.6);
      return c;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  // No shadow or sparks: it isn't really there.
  view.fx.visible = false;
  scene.add(view.root, view.fx);
  ghosts.push({ run, view, state: createKartState(), label });
}

/** Swoops along the last stretch of the lap down onto the grid. */
function introCamera(): void {
  const u = 1 - intro / INTRO_TIME;
  const e = u * u * (3 - 2 * u);
  const s = lerp(-240, -36, e);
  const p = pointAt(track.spline, s);
  const a = pointAt(track.spline, s + 30);
  const lateral = lerp(16, 0, e);
  camera.position.set(p.x - p.tz * lateral, track.main.heightAt(((s % track.length) + track.length) % track.length) + lerp(24, 4.5, e), p.z + p.tx * lateral);
  camera.lookAt(a.x, track.main.heightAt(((s + 30 + track.length) % track.length)) + 1.5, a.z);
}

function skipIntro(): boolean {
  if (mode !== 'race' || intro <= 0) return false;
  intro = 0;
  chase.snap();
  return true;
}

/** The kart the camera follows: the player, or the leader in attract mode. */
function focus(): RaceKart {
  return player ?? race.karts.find((k) => k.position === 1)!;
}

function step(dt: number): void {
  lastInput = input.sample();
  if (mode === 'podium') return;
  if (intro > 0) {
    intro = Math.max(0, intro - dt);
    if (intro === 0) chase.snap();
    return;
  }
  const inputs = race.karts.map((k) => (k === player ? lastInput : undefined));
  const events = race.step(dt, inputs);
  events.forEach((ev, i) => {
    if (ev.landed > 3) views[i].impact(ev.landed);
  });
  if (!player) {
    // Attract mode: once someone wins, start another heat.
    if (race.results.length > 0) startRace(false);
    return;
  }
  const ev = events[race.karts.indexOf(player)];
  if (ev.boostTier > 0) chase.bump(0.3 + ev.boostTier * 0.2);
  if (ev.trick) chase.bump(0.6);
  if (ev.wallHit > 0.3) chase.bump(ev.wallHit);
  if (player.respawned) chase.snap();
  playerSounds(player, ev);
  checkWrongWay(player, dt);
  // Record a little past the line so the ghost visibly crosses it.
  if (recorder && (player.finishTime === null || race.time - player.finishTime < GHOST_OVERRUN)) recorder.record(race.time, player.state);
  for (const e of race.events) {
    if (e.type === 'pickup' && e.kart === player) sfx.pickup();
    if (e.type === 'use' && e.kart === player) sfx.use(e.item);
    if (e.type !== 'hit') continue;
    if (e.kart === player) {
      hud.flash(HIT_TEXT[e.by]);
      sfx.hurt(e.by);
      if (e.by !== 'tempoShift') chase.bump(0.5);
    } else if (e.from === player && e.by !== 'tempoShift') {
      hud.flash(`HIT ${(e.kart as RaceKart).racer.name.toUpperCase()}!`);
      sfx.scored();
    }
  }
  if (mode === 'race' && player.finishTime !== null && race.time - player.finishTime > RESULTS_DELAY) {
    if (choice.mode === 'timeTrial') {
      trialNote = saveTrial(player.finishTime, Math.min(...player.lapTimes), player.racer.id);
      postTrial(player);
    }
    setMode('results');
  }
  updateMusic(player);
}

const HIT_TEXT: Record<ItemKind | HazardKind, string> = {
  fuzzPedal: '',
  microtonalMine: 'OUT OF TUNE!',
  feedbackWave: 'FEEDBACK!',
  riffMissile: 'RIFFED!',
  tempoShift: 'TEMPO SHIFT!',
  snakes: 'SNAKEBITE!',
  dustDevils: 'DUST DEVIL!',
  tumbleweeds: 'TUMBLEWEED!',
  boulders: 'ROCKFALL!',
  lavaBombs: 'LAVA BOMB!',
  flameJets: 'TORCHED!',
  vines: 'TIMBER!',
  rollers: "POLYGON'D!",
};

/** Takes a group out of the scene and frees what it built. */
function dispose(group: THREE.Group): void {
  scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
}

/** Countdown beeps, laps, drift sparks, hops, landings and the like for the player's kart. */
function playerSounds(p: RaceKart, ev: StepEvents): void {
  const count = race.time < 0 ? Math.ceil(-race.time) : 0;
  if (count !== heard.count) {
    if (count > 0) sfx.countdown(false);
    else if (heard.count === 1) sfx.countdown(true);
    heard.count = count;
  }
  if (p.laps.lap !== heard.lap) {
    if (p.finishTime !== null) sfx.finish();
    else if (p.laps.lap > heard.lap) {
      const final = p.laps.lap === track.def.laps - 1;
      sfx.lap(final);
      hud.flash(final ? 'FINAL LAP!' : `LAP ${p.laps.lap + 1}`);
    }
    heard.lap = p.laps.lap;
  }
  const s = p.state;
  const tier = s.driftDir !== 0 ? driftTier(s.driftCharge) : 0;
  if (tier > heard.tier) sfx.driftTier(tier);
  heard.tier = tier;
  const rolling = p.rolling > 0;
  if (heard.rolling && !rolling && p.item) sfx.itemReady();
  heard.rolling = rolling;
  if (ev.hopped) sfx.hop();
  if (ev.landed > 2) sfx.land(ev.landed);
  if (ev.wallHit > 0.2) sfx.wall(ev.wallHit);
  if (ev.boostTier > 0) sfx.boost(ev.boostTier);
  if (ev.trick) sfx.trick();
}

/** Warns a player who has been driving the wrong way for a second, every 1.5 s until they turn round. */
function checkWrongWay(p: RaceKart, dt: number): void {
  const s = p.state;
  const a = pointAt(track.spline, p.progressS);
  const along = Math.sin(s.heading) * a.tx + Math.cos(s.heading) * a.tz;
  const backwards = race.started && p.finishTime === null && s.speed > 4 && along < -0.3 * Math.hypot(a.tx, a.tz);
  wrongWay = backwards ? wrongWay + dt : 0;
  if (wrongWay > 1 && (wrongWay - 1) % 1.5 < dt) hud.flash('WRONG WAY!');
}

/** How hard the tires squeal, 0..1: always in a drift, and on hard turns at speed. Dirt doesn't squeal. */
function tireScreech(s: KartState, speedRatio: number): number {
  if (!s.grounded || s.surface === 'offroad' || Math.abs(s.speed) < 8 || s.spinTime > 0) return 0;
  if (s.driftDir !== 0) return 0.6 + 0.4 * Math.min(1, Math.abs(s.slip) * 2);
  return clamp((Math.abs(s.steer) * speedRatio - 0.55) / 0.4, 0, 1) * 0.55;
}

/** Engine note, tire squeal and hazard ambience, every frame. */
function updateSounds(dt: number): void {
  const p = player;
  const racing = mode === 'race' && !loop.paused && p !== null;
  const s = p?.state;
  const speedRatio = s ? Math.abs(s.speed) / p!.baseParams.topSpeed : 0;
  sfx.updateEngine(racing ? 1 : 0, speedRatio, !!s && s.boostTime > 0, !!s && s.driftDir !== 0, s ? tireScreech(s, speedRatio) : 0);
  if (!racing || !s) {
    sfx.hazards(dt, null, null);
    return;
  }
  const near = (kind: HazardKind) => {
    let best: { d: number; pan: number } | null = null;
    for (const h of race.hazards.poses) {
      if (h.kind !== kind) continue;
      const dx = h.x - s.x;
      const dz = h.z - s.z;
      const d = Math.hypot(dx, dz);
      // Pan by which side of the kart it's on.
      if (!best || d < best.d) best = { d, pan: d > 0 ? (dx * -Math.cos(s.heading) + dz * Math.sin(s.heading)) / d : 0 };
    }
    return best;
  };
  sfx.hazards(dt, near('snakes'), near('dustDevils'));
}

function updateMusic(p: RaceKart): void {
  if (p.finishTime !== null) music.play('podium');
  else if (track.def.music.finalLap && p.laps.lap === track.def.laps - 1) music.play(track.def.music.finalLap as MusicCue);
  else music.play(track.def.music.lap as MusicCue);
}

function interpolate(kart: RaceKart, alpha: number): KartState {
  let snap = snapshots.get(kart);
  if (!snap) snapshots.set(kart, (snap = createKartState()));
  const { prev, state } = kart;
  copyKartState(state, snap);
  snap.x = lerp(prev.x, state.x, alpha);
  snap.y = lerp(prev.y, state.y, alpha);
  snap.z = lerp(prev.z, state.z, alpha);
  snap.heading = lerpAngle(prev.heading, state.heading, alpha);
  snap.slip = lerp(prev.slip, state.slip, alpha);
  snap.speed = lerp(prev.speed, state.speed, alpha);
  snap.groundY = lerp(prev.groundY, state.groundY, alpha);
  return snap;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

let elapsed = 0;
const loop = new FixedLoop(step, (alpha, frameDt) => {
  if (input.consumePause() && mode === 'race') {
    loop.paused = !loop.paused;
    touch.setVisible(!loop.paused);
  }
  // A phone turned upright mid-race pauses; Resume once it's back on its side.
  if (screenFit.portrait && mode === 'race' && !loop.paused) {
    loop.paused = true;
    touch.setVisible(false);
  }
  const dt = loop.paused ? 0 : frameDt;
  elapsed += dt;

  const snaps = race.karts.map((k) => interpolate(k, alpha));
  const f = focus();
  const s = snaps[race.karts.indexOf(f)];
  for (const g of ghosts) {
    ghostPose(g.run, Math.max(0, race.time - (1 - alpha) * PHYSICS_DT), g.state);
    g.view.update(g.state, 30, dt, elapsed);
  }
  if (podium) {
    podium.update(dt, elapsed, camera);
  } else if (intro > 0) {
    race.karts.forEach((k, i) => views[i].update(snaps[i], k.params.topSpeed, dt, elapsed));
    introCamera();
  } else {
    race.karts.forEach((k, i) => views[i].update(snaps[i], k.params.topSpeed, dt, elapsed));
    chase.update(s, f.params.topSpeed, player ? lastInput.lookBack : false, dt);
  }
  document.body.classList.toggle('intro', intro > 0);
  const theme = trackView!.theme;
  const L = track.length;
  trackView!.update(elapsed, camera.position, theme.skyCycle ? Math.PI * 2 * clamp(f.distance / (L * track.def.laps), 0, 1) : 0);
  itemsView!.update(elapsed);
  hazardsView!.update(elapsed);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);
  updateSounds(dt);

  const finished = f.finishTime !== null;
  hud.update(
    {
      kart: s,
      lap: f.laps.lap,
      totalLaps: track.def.laps,
      raceTime: f.finishTime ?? Math.max(0, race.time),
      lapTimes: f.lapTimes,
      racerName: f.racer.name,
      engineClass: choice.engine,
      trackName: gp && !gp.finished ? `${track.def.name} · race ${gp.round + 1}/${gp.tracks.length}` : ghosts.length ? `${track.def.name} · ${ghosts.map((g) => `${g.label} ${formatTime(g.run.total)}`).join(' · ')}` : track.def.name,
      section: f.section,
      autoAccelerate: input.autoAccelerate,
      finished,
      paused: loop.paused && !frozen,
      position: f.position,
      karts: race.karts.length,
      countdown: intro > 0 ? -1 : -race.time,
      intro: intro > 0 ? { name: track.def.name, sub: gp ? `Race ${gp.round + 1} of ${gp.tracks.length}` : choice.mode === 'timeTrial' ? 'Time Trial' : `${choice.engine}` } : null,
      table: table(),
      muted: musicMuted,
      sfxMuted,
      item: player?.item ?? null,
      rolling: player?.rolling ?? 0,
    },
    elapsed,
  );
  hud.minimap.draw(race.karts.map((k, i) => ({ x: snaps[i].x, z: snaps[i].z, color: hex(k.racer.color), player: k === player })));
  // Heat haze shimmers hardest on the straights; the kaleidoscope runs on the player's final lap.
  const straight = 1 - clamp(track.main.maxCurvature(f.progressS, f.progressS + 80) * 25, 0, 1);
  const hazeTarget = podium ? 0 : theme.haze * (0.3 + 0.7 * straight);
  const finalLap = mode === 'race' && player !== null && player.finishTime === null && intro === 0 && player.laps.lap === track.def.laps - 1;
  fx.haze += (hazeTarget - fx.haze) * damp(2, frameDt);
  fx.kaleido += ((finalLap ? 1 : 0) - fx.kaleido) * damp(1.5, frameDt);
  const beat = music.beatPhase();
  postFx.render(scene, camera, { haze: fx.haze, kaleido: fx.kaleido, beat: beat >= 0 ? beat : (elapsed * 2.4) % 1, time: elapsed });
});

/** The panel for the results, cup standings and podium screens. */
function table(): Table | null {
  const kartRow = (k: RaceKart, i: number): TableRow => ({
    place: ordinal(i + 1),
    name: k.racer.name,
    color: hex(k.racer.color),
    value: k.finishTime === null ? '...' : formatTime(k.finishTime),
    player: k === player,
  });
  const cupRows = (n: number) =>
    gp!
      .standings()
      .slice(0, n)
      .map((e, i): TableRow => ({
        place: ordinal(i + 1),
        name: e.racer.name,
        color: hex(e.racer.color),
        value: `${e.points} pts`,
        extra: mode === 'standings' && e.gained ? `+${e.gained}` : undefined,
        player: e.racer === choice.racer,
      }));
  if (mode === 'results') {
    const title = gp ? `RACE ${gp.round + 1}/${gp.tracks.length} RESULTS` : choice.mode === 'timeTrial' ? 'TIME TRIAL' : 'RESULTS';
    return { kind: 'results', title, note: trialNote || undefined, rows: finishOrder().map(kartRow) };
  }
  if (mode === 'standings' && gp) {
    const next = gp.finished ? 'Final standings' : `Next: ${TRACK_LIST[gp.trackIndex].name}`;
    return { kind: 'cup', title: 'CUP STANDINGS', note: next, rows: cupRows(RACERS.length) };
  }
  if (mode === 'podium' && gp) {
    const champ = gp.standings()[0];
    const me = gp.standings().findIndex((e) => e.racer === choice.racer) + 1;
    const note = champ.racer === choice.racer ? `You win the ${choice.engine} cup!` : `You finished ${ordinal(me)}`;
    return { kind: 'podium', title: `${champ.racer.name.toUpperCase()} WINS!`, note, rows: cupRows(3) };
  }
  return null;
}

/** Karts by finishing place, unfinished ones by where they are now. */
function finishOrder(): RaceKart[] {
  return [...race.karts].sort((a, b) => a.position - b.position);
}

/** Stores a Time Trial run and describes it against the best so far. */
function saveTrial(total: number, bestLap: number, racerId: string): string {
  const key = `gizzracer.tt.${track.def.id}.${choice.engine}`;
  let prev: { total: number; lap: number } | null = null;
  try {
    prev = JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    // Storage blocked (private mode): no records, no harm.
  }
  const best = { total: Math.min(total, prev?.total ?? Infinity), lap: Math.min(bestLap, prev?.lap ?? Infinity) };
  try {
    localStorage.setItem(key, JSON.stringify(best));
    // The fastest run becomes the ghost to beat.
    if (recorder && (!prev || total < prev.total)) localStorage.setItem(ghostKey(), encodeGhost(recorder.finish(racerId, total)));
  } catch {
    // As above (or out of space for the ghost).
  }
  if (!prev) return `First record set! Best lap ${formatTime(bestLap)}`;
  if (total < prev.total) return `NEW RECORD! ${formatTime(prev.total - total).replace(/^0:0?/, '-')}s`;
  return `Record ${formatTime(prev.total)} · best lap ${formatTime(best.lap)}`;
}

/** Sends a finished Time Trial to the online leaderboard and adds the outcome to the results note. */
function postTrial(p: RaceKart): void {
  if (!recorder) return;
  if (!identity().name) {
    trialNote += ' · set a name in the picker to post runs online';
    return;
  }
  const local = trialNote;
  trialNote = `${local} · posting...`;
  uploadRun(track.def.id, choice.engine, p.lapTimes, recorder.finish(p.racer.id, p.finishTime!))
    .then((r) => (trialNote = `${local} · ${r.best ? 'posted! ' : ''}online #${r.rank}`))
    .catch((err: Error) => (trialNote = `${local} · not posted: ${err.message}`));
}

/** Back to the picker, with the attract race on the picker's track. */
function toMenu(): void {
  gp = null;
  endPodium();
  setMode('menu');
  if (track.def.id !== TRACK_LIST[menuTrack()].id) loadTrack(menuTrack());
  else startRace(false);
}

function startPodium(): void {
  const top3 = gp!.standings().slice(0, 3).map((e) => e.racer);
  podium = new Podium(track, top3);
  scene.add(podium.group);
  for (const v of views) v.root.visible = v.fx.visible = false;
  itemsView!.group.visible = hazardsView!.group.visible = false;
  setMode('podium');
  music.play('podium');
}

function endPodium(): void {
  if (!podium) return;
  scene.remove(podium.group);
  podium.dispose();
  podium = null;
  chase.snap();
}

/** Any key or tap moves past the title, results, standings and podium. The first one also unlocks audio. */
function advance(): boolean {
  music.unlock();
  if (mode === 'title') {
    toMenu();
    return true;
  }
  if (mode === 'results') {
    if (!gp) {
      toMenu();
      return true;
    }
    gp.record(finishOrder().map((k) => k.racer));
    setMode('standings');
    return true;
  }
  if (mode === 'standings') {
    if (gp?.finished) startPodium();
    else startRace(true);
    return true;
  }
  if (mode === 'podium') {
    toMenu();
    return true;
  }
  return false;
}

hud.onPauseAction = (action) => {
  if (action === 'resume') {
    loop.paused = false;
    touch.setVisible(true);
  } else if (action === 'restart') startRace(true);
  else if (action === 'quit') toMenu();
};

// iOS only lets audio start inside a touch, and is strictest about touchend.
// Fullscreen and the landscape lock also need a gesture.
window.addEventListener(
  'touchend',
  () => {
    music.unlock();
    screenFit.enter();
  },
  { passive: true },
);
window.addEventListener('pointerup', (e) => {
  if (skipIntro()) return;
  if ((e.target as HTMLElement).closest('.menu, .touch, .hud-pause')) return music.unlock();
  advance();
});

window.addEventListener('keydown', (e) => {
  if (advance()) return;
  if (!e.repeat && skipIntro()) return;
  if (menu.key(e.code)) return;
  if (e.repeat || mode !== 'race') return;
  if (loop.paused) {
    if (e.code === 'KeyR') hud.onPauseAction?.('restart');
    else if (e.code === 'Backspace') hud.onPauseAction?.('quit');
    return;
  }
  if (e.code === 'KeyR') startRace(true);
  else if (e.code === 'KeyM') input.autoAccelerate = !input.autoAccelerate;
  else if (e.code === 'KeyN') musicMuted = music.toggleMute();
  else if (e.code === 'KeyB') sfxMuted = sfx.toggleMute();
});


// Debug handle for the console and automated screenshots: gizz.warp(0.4) jumps to 40% of the lap.
Object.assign(window, {
  gizz: {
    warp(fraction: number) {
      const k = focus();
      const pose = track.respawnPose(fraction * track.length);
      respawnKart(k.state, pose.x, pose.y, pose.z, pose.heading);
      k.state.speed = k.params.topSpeed;
      copyKartState(k.state, k.prev);
      chase.snap();
    },
    get kart() {
      return focus().state;
    },
    get race() {
      return race;
    },
    get mode() {
      return mode;
    },
    advance,
    /** Puts an item straight in the player's slot (testing). */
    give(item: ItemKind) {
      if (player) Object.assign(player, { item, rolling: 0, held: 0 });
    },
    /** Fires the player's item as if the item button were tapped. */
    useItem() {
      input.pressItem();
    },
    /** Stops (or restarts) the simulation without showing the pause menu; gizz.simulate still steps it. */
    freeze(on: boolean) {
      frozen = on;
      loop.paused = on;
    },
    /** Hands the player's kart to the CPU driver (testing). */
    autopilot() {
      if (player) player.driver = new CpuDriver(CPU_SKILL['150cc'], 99);
    },
    /** Runs the simulation ahead by `seconds` without rendering (testing). */
    simulate(seconds: number) {
      for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
    },
    race_: (trackIndex: number) => {
      choice.track = trackIndex;
      setMode('menu');
      loadTrack(trackIndex);
      startRace(true);
    },
  },
});

loadTrack(choice.track);
setMode('title');
loop.start();
