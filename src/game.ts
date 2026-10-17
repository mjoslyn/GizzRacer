import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop } from './core/loop';
import { lerp, lerpAngle } from './core/math';
import { CPU_SKILL, CpuDriver } from './ai/cpuDriver';
import { MusicPlayer, type MusicCue } from './audio/music';
import { Race, type RaceKart } from './core/race';
import { copyKartState, createKartState, respawnKart, type KartState } from './physics/kart';
import { RACERS } from './physics/racers';
import type { HazardKind } from './items/hazards';
import type { ItemKind } from './items/items';
import { ChaseCamera } from './render/chaseCamera';
import { HazardsView, ItemsView } from './render/itemViews';
import { KartView } from './render/kartView';
import { flareRingTexture, glowTexture, setTextureAnisotropy } from './render/textures';
import { buildTrackView, type TrackView } from './render/trackView';
import { TRACK_LIST } from './tracks/index';
import { Track } from './tracks/track';
import { Hud } from './ui/hud';
import { Menu, type MenuChoice } from './ui/menu';
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

const input = new InputManager();
const hud = new Hud(document.body);
const music = new MusicPlayer();

/** Grid slot the player starts from; CPUs fill the rest. */
const PLAYER_SLOT = 4;
/** Seconds after crossing the line before the results table. */
const RESULTS_DELAY = 2.5;

/**
 * title -> menu -> race -> results -> menu. Behind the title and the menu,
 * CPUs race the chosen track as an attract mode.
 */
type Mode = 'title' | 'menu' | 'race' | 'results';
let mode: Mode = 'title';

let choice: MenuChoice = { track: 1, racer: RACERS[0], engine: '100cc' };
let track: Track;
let trackView: TrackView | null = null;
let race: Race;
/** The human's kart, or null in attract mode. */
let player: RaceKart | null = null;
let views: KartView[] = [];
let itemsView: ItemsView | null = null;
let hazardsView: HazardsView | null = null;
let raceSeed = 1;
/** Debug: the simulation stands still without the pause menu (gizz.freeze). */
let frozen = false;
let lastInput: InputFrame = NEUTRAL_INPUT;
let musicMuted = false;
const snapshots = new Map<RaceKart, KartState>();

const menu = new Menu(document.body, choice, onMenuChange, (c) => {
  choice = { ...c };
  startRace(true);
});
const touch = new TouchControls(document.body, input, () => input.requestPause());
const screenFit = new ScreenFit(document.body);

function setMode(next: Mode): void {
  mode = next;
  document.body.dataset.mode = next;
  hud.showTitle(next === 'title');
  menu.show(next === 'menu');
  touch.setVisible(next === 'race');
  loop.paused = false;
  if (next === 'title' || next === 'menu') music.play('title');
}

function onMenuChange(c: MenuChoice, row: string): void {
  choice = { ...c };
  if (row === 'track') loadTrack(choice.track);
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

/** One kart per racer. With a human, they take PLAYER_SLOT and CPUs take the rest; without, all CPUs. */
function startRace(withPlayer: boolean): void {
  if (withPlayer && track.def.id !== TRACK_LIST[choice.track].id) {
    loadTrack(choice.track);
  }
  race = new Race(track, raceSeed++);
  player = null;
  const racer = withPlayer ? choice.racer : null;
  const cpus = RACERS.filter((r) => r !== racer);
  const playerSlot = Math.min(PLAYER_SLOT, RACERS.length - 1);
  for (let slot = 0, c = 0; slot < RACERS.length; slot++) {
    if (racer && slot === playerSlot) player = race.addKart(racer, choice.engine, null);
    else race.addKart(cpus[c++], choice.engine, CPU_SKILL[choice.engine]);
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
  if (withPlayer) {
    setMode('race');
    music.play(track.def.music.lap as MusicCue);
  }
}

/** The kart the camera follows: the player, or the leader in attract mode. */
function focus(): RaceKart {
  return player ?? race.karts.find((k) => k.position === 1)!;
}

function step(dt: number): void {
  lastInput = input.sample();
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
  for (const e of race.events) {
    if (e.type !== 'hit') continue;
    if (e.kart === player) {
      hud.flash(HIT_TEXT[e.by]);
      if (e.by !== 'tempoShift') chase.bump(0.5);
    } else if (e.from === player && e.by !== 'tempoShift') {
      hud.flash(`HIT ${(e.kart as RaceKart).racer.name.toUpperCase()}!`);
    }
  }
  if (mode === 'race' && player.finishTime !== null && race.time - player.finishTime > RESULTS_DELAY) setMode('results');
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
};

/** Takes a group out of the scene and frees what it built. */
function dispose(group: THREE.Group): void {
  scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
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
  race.karts.forEach((k, i) => views[i].update(snaps[i], k.params.topSpeed, dt, elapsed));
  const f = focus();
  const s = snaps[race.karts.indexOf(f)];
  chase.update(s, f.params.topSpeed, player ? lastInput.lookBack : false, dt);
  trackView!.update(elapsed, camera.position);
  itemsView!.update(elapsed);
  hazardsView!.update(elapsed);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);

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
      trackName: track.def.name,
      section: f.section,
      autoAccelerate: input.autoAccelerate,
      finished,
      paused: loop.paused && !frozen,
      position: f.position,
      karts: race.karts.length,
      countdown: -race.time,
      standings:
        mode === 'results'
          ? [...race.karts]
              .sort((a, b) => a.position - b.position)
              .map((k) => ({ name: k.racer.name, color: hex(k.racer.color), time: k.finishTime, player: k === player }))
          : [],
      muted: musicMuted,
      item: player?.item ?? null,
      rolling: player?.rolling ?? 0,
    },
    elapsed,
  );
  hud.minimap.draw(race.karts.map((k, i) => ({ x: snaps[i].x, z: snaps[i].z, color: hex(k.racer.color), player: k === player })));
  renderer.render(scene, camera);
});

/** Any key or tap moves past the title and the results. The first one also unlocks audio. */
function advance(): boolean {
  music.unlock();
  if (mode === 'title' || mode === 'results') {
    setMode('menu');
    if (track.def.id !== TRACK_LIST[choice.track].id) loadTrack(choice.track);
    else startRace(false);
    return true;
  }
  return false;
}

hud.onPauseAction = (action) => {
  if (action === 'resume') {
    loop.paused = false;
    touch.setVisible(true);
  } else if (action === 'restart') startRace(true);
  else if (action === 'quit') {
    setMode('menu');
    startRace(false);
  }
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
  if ((e.target as HTMLElement).closest('.menu, .touch, .hud-pause')) return music.unlock();
  advance();
});

window.addEventListener('keydown', (e) => {
  if (advance()) return;
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
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
