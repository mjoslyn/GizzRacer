import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop } from './core/loop';
import { lerp, lerpAngle } from './core/math';
import { CPU_SKILL } from './ai/cpuDriver';
import { MusicPlayer, type MusicCue } from './audio/music';
import { Race, type RaceKart } from './core/race';
import { copyKartState, createKartState, respawnKart, type KartState } from './physics/kart';
import { ENGINE_CLASSES, RACERS, type EngineClass, type RacerDef } from './physics/racers';
import { ChaseCamera } from './render/chaseCamera';
import { KartView } from './render/kartView';
import { flareRingTexture, glowTexture, setTextureAnisotropy } from './render/textures';
import { buildTrackView, type TrackView } from './render/trackView';
import { buildRattlesnakeRun } from './tracks/rattlesnakeRun';
import { TEST_TRACK } from './tracks/testTrack';
import { Track, type TrackDef } from './tracks/track';
import { Hud } from './ui/hud';

const TRACKS: (() => TrackDef)[] = [buildRattlesnakeRun, () => TEST_TRACK];
const SUN_DIR = new THREE.Vector3(-0.5, 0.55, -0.65).normalize();

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);
setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9b88a, 180, 900);
scene.add(new THREE.HemisphereLight(0xa8c8ff, 0xc07a48, 1.5));
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

let trackIndex = 0;
let track: Track;
let trackView: TrackView | null = null;
let race: Race;
let player: RaceKart;
let racer: RacerDef = RACERS[0];
let engine: EngineClass = '100cc';
let views: KartView[] = [];
let lastInput: InputFrame = NEUTRAL_INPUT;
let onTitle = true;
const snapshots = new Map<RaceKart, KartState>();

function loadTrack(index: number): void {
  trackIndex = index;
  if (trackView) {
    scene.remove(trackView.group);
    trackView.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  track = new Track(TRACKS[index]());
  trackView = buildTrackView(track);
  scene.add(trackView.group);
  hud.minimap.setTrack(track);
  startRace();
}

/** One kart per racer: the player's pick, and a CPU for each of the others. */
function startRace(): void {
  race = new Race(track);
  const cpus = RACERS.filter((r) => r !== racer);
  const grid: (RacerDef | null)[] = [];
  for (let slot = 0, c = 0; slot < RACERS.length; slot++) grid.push(slot === Math.min(PLAYER_SLOT, RACERS.length - 1) ? null : cpus[c++]);
  for (const r of grid) {
    if (r === null) player = race.addKart(racer, engine, null);
    else race.addKart(r, engine, CPU_SKILL[engine]);
  }
  for (const v of views) scene.remove(v.root, v.fx);
  views = race.karts.map((k) => {
    const v = new KartView(k.racer);
    scene.add(v.root, v.fx);
    return v;
  });
  snapshots.clear();
  chase.snap();
  if (!onTitle) music.play(track.def.music.lap as MusicCue);
}

function step(dt: number): void {
  if (onTitle) return;
  lastInput = input.sample();
  const inputs = race.karts.map((k) => (k === player ? lastInput : undefined));
  const events = race.step(dt, inputs);
  events.forEach((ev, i) => {
    if (ev.landed > 3) views[i].impact(ev.landed);
  });
  const ev = events[race.karts.indexOf(player)];
  if (ev.boostTier > 0) chase.bump(0.3 + ev.boostTier * 0.2);
  if (ev.trick) chase.bump(0.6);
  if (ev.wallHit > 0.3) chase.bump(ev.wallHit);
  if (player.respawned) chase.snap();
  updateMusic();
}

function updateMusic(): void {
  if (player.finishTime !== null) music.play('podium');
  else if (track.def.music.finalLap && player.laps.lap === track.def.laps - 1) music.play(track.def.music.finalLap as MusicCue);
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
  if (input.consumePause() && !onTitle) loop.paused = !loop.paused;
  const dt = loop.paused ? 0 : frameDt;
  elapsed += dt;

  const snaps = race.karts.map((k) => interpolate(k, alpha));
  race.karts.forEach((k, i) => views[i].update(snaps[i], k.params.topSpeed, dt, elapsed));
  const s = snaps[race.karts.indexOf(player)];
  chase.update(s, player.params.topSpeed, lastInput.lookBack, dt);
  trackView!.update(elapsed, camera.position);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);

  const finished = player.finishTime !== null;
  hud.update(
    {
      kart: s,
      lap: player.laps.lap,
      totalLaps: track.def.laps,
      raceTime: player.finishTime ?? Math.max(0, race.time),
      lapTimes: player.lapTimes,
      racerName: racer.name,
      engineClass: engine,
      trackName: track.def.name,
      section: player.section,
      autoAccelerate: input.autoAccelerate,
      finished,
      paused: loop.paused,
      position: player.position,
      karts: race.karts.length,
      countdown: onTitle ? 99 : -race.time,
      // Results once the player has crossed the line and the banner has had its moment.
      standings:
        finished && race.time - player.finishTime! > 2.5
          ? [...race.karts]
              .sort((a, b) => a.position - b.position)
              .map((k) => ({ name: k.racer.name, color: hex(k.racer.color), time: k.finishTime, player: k === player }))
          : [],
      muted: musicMuted,
    },
    elapsed,
  );
  hud.minimap.draw(race.karts.map((k, i) => ({ x: snaps[i].x, z: snaps[i].z, color: hex(k.racer.color), player: k === player })));
  renderer.render(scene, camera);
});

let musicMuted = false;

/** The title card's "press any key" doubles as the gesture browsers need before audio can play. */
function leaveTitle(): void {
  if (!onTitle) return;
  onTitle = false;
  hud.showTitle(false);
  music.unlock();
  startRace();
}

window.addEventListener('pointerdown', () => {
  music.unlock();
  leaveTitle();
});

// Dev controls.
window.addEventListener('keydown', (e) => {
  music.unlock();
  if (onTitle) {
    leaveTitle();
    return;
  }
  if (e.repeat) return;
  const n = Number(e.key);
  if (n >= 1 && n <= RACERS.length) {
    racer = RACERS[n - 1];
    startRace();
  } else if (e.code === 'KeyC') {
    engine = ENGINE_CLASSES[(ENGINE_CLASSES.indexOf(engine) + 1) % ENGINE_CLASSES.length];
    startRace();
  } else if (e.code === 'KeyR') {
    startRace();
  } else if (e.code === 'KeyT') {
    loadTrack((trackIndex + 1) % TRACKS.length);
  } else if (e.code === 'KeyM') {
    input.autoAccelerate = !input.autoAccelerate;
  } else if (e.code === 'KeyN') {
    musicMuted = music.toggleMute();
  }
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
      const pose = track.respawnPose(fraction * track.length);
      respawnKart(player.state, pose.x, pose.y, pose.z, pose.heading);
      player.state.speed = player.params.topSpeed;
      copyKartState(player.state, player.prev);
      chase.snap();
    },
    get kart() {
      return player.state;
    },
    get race() {
      return race;
    },
    start: leaveTitle,
  },
});

loadTrack(0);
hud.showTitle(true);
music.play('title');
loop.start();
