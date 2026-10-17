import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop } from './core/loop';
import { lerp, lerpAngle } from './core/math';
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

let trackIndex = 0;
let track: Track;
let trackView: TrackView | null = null;
let race: Race;
let player: RaceKart;
let racer: RacerDef = RACERS[0];
let engine: EngineClass = '100cc';
const kartView = new KartView(racer);
scene.add(kartView.root, kartView.fx);
let lastInput: InputFrame = NEUTRAL_INPUT;
const snapshot = createKartState();

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

function startRace(): void {
  race = new Race(track);
  player = race.addKart(racer, engine);
  chase.snap();
}

function step(dt: number): void {
  lastInput = input.sample();
  const [events] = race.step(dt, [lastInput]);
  if (events.landed > 3) kartView.impact(events.landed);
  if (events.boostTier > 0) chase.bump(0.3 + events.boostTier * 0.2);
  if (events.trick) chase.bump(0.6);
  if (events.wallHit > 0.3) chase.bump(events.wallHit);
  if (player.respawned) chase.snap();
}

function interpolate(kart: RaceKart, alpha: number): KartState {
  const { prev, state } = kart;
  copyKartState(state, snapshot);
  snapshot.x = lerp(prev.x, state.x, alpha);
  snapshot.y = lerp(prev.y, state.y, alpha);
  snapshot.z = lerp(prev.z, state.z, alpha);
  snapshot.heading = lerpAngle(prev.heading, state.heading, alpha);
  snapshot.slip = lerp(prev.slip, state.slip, alpha);
  snapshot.speed = lerp(prev.speed, state.speed, alpha);
  snapshot.groundY = lerp(prev.groundY, state.groundY, alpha);
  return snapshot;
}

let elapsed = 0;
const loop = new FixedLoop(step, (alpha, frameDt) => {
  if (input.consumePause()) loop.paused = !loop.paused;
  const dt = loop.paused ? 0 : frameDt;
  elapsed += dt;

  const s = interpolate(player, alpha);
  kartView.update(s, player.params.topSpeed, dt, elapsed);
  chase.update(s, player.params.topSpeed, lastInput.lookBack, dt);
  trackView!.update(elapsed, camera.position);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);

  hud.update(
    {
      kart: s,
      lap: player.laps.lap,
      totalLaps: track.def.laps,
      raceTime: player.finishTime ?? race.time,
      lapTimes: player.lapTimes,
      racerName: racer.name,
      engineClass: engine,
      trackName: track.def.name,
      section: player.section,
      autoAccelerate: input.autoAccelerate,
      finished: player.finishTime !== null,
      paused: loop.paused,
    },
    elapsed,
  );
  hud.minimap.draw([{ x: s.x, z: s.z, color: `#${racer.color.toString(16).padStart(6, '0')}`, player: true }]);
  renderer.render(scene, camera);
});

// Dev controls.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const n = Number(e.key);
  if (n >= 1 && n <= RACERS.length) {
    racer = RACERS[n - 1];
    player.setRacer(racer, engine);
    kartView.setRacer(racer);
  } else if (e.code === 'KeyC') {
    engine = ENGINE_CLASSES[(ENGINE_CLASSES.indexOf(engine) + 1) % ENGINE_CLASSES.length];
    player.setRacer(racer, engine);
  } else if (e.code === 'KeyR') {
    startRace();
  } else if (e.code === 'KeyT') {
    loadTrack((trackIndex + 1) % TRACKS.length);
  } else if (e.code === 'KeyM') {
    input.autoAccelerate = !input.autoAccelerate;
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
  },
});

loadTrack(0);
loop.start();
