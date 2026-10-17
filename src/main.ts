import * as THREE from 'three';
import { NEUTRAL_INPUT, InputManager, type InputFrame } from './core/input';
import { FixedLoop } from './core/loop';
import { lerp, lerpAngle } from './core/math';
import { copyKartState, createKartState, stepKart, type KartState } from './physics/kart';
import { ENGINE_CLASSES, RACERS, kartParams, type EngineClass, type KartParams, type RacerDef } from './physics/racers';
import { ChaseCamera } from './render/chaseCamera';
import { KartView } from './render/kartView';
import { buildTrackView } from './render/trackView';
import { LapTracker } from './tracks/laps';
import { nearestOnSpline } from './tracks/spline';
import { TEST_TRACK } from './tracks/testTrack';
import { Track } from './tracks/track';
import { Hud } from './ui/hud';

const SKY = 0x1f3fbf;

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xe0a070, 120, 420);
scene.add(new THREE.HemisphereLight(0x9fc4ff, 0xc8763a, 1.4));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -25;
sun.shadow.camera.right = sun.shadow.camera.top = 25;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
const chase = new ChaseCamera(camera);

const track = new Track(TEST_TRACK);
const trackView = buildTrackView(track);
scene.add(trackView.group);

let racer: RacerDef = RACERS[0];
let engine: EngineClass = '100cc';
let params: KartParams = kartParams(racer.stats, engine);
const kartView = new KartView(racer);
scene.add(kartView.root);

const input = new InputManager();
const hud = new Hud(document.body);

// Simulation state. `prev` and `cur` bracket the render time for interpolation.
const cur = createKartState();
const prev = createKartState();
const snapshot = createKartState();
let laps = new LapTracker(track.spline.length, track.def.checkpoints);
let raceTime = 0;
let lapStart = 0;
let lapTimes: number[] = [];
let lastInput: InputFrame = NEUTRAL_INPUT;

function resetRace(): void {
  const slot = track.startSlot(0);
  Object.assign(cur, createKartState(slot.x, slot.z, slot.heading));
  copyKartState(cur, prev);
  laps = new LapTracker(track.spline.length, track.def.checkpoints);
  raceTime = 0;
  lapStart = 0;
  lapTimes = [];
  chase.snap();
}

function finished(): boolean {
  return laps.lap >= track.def.laps;
}

function step(dt: number): void {
  copyKartState(cur, prev);
  lastInput = input.sample();
  const events = stepKart(cur, lastInput, params, track, dt);
  if (events.landed > 3) kartView.impact(events.landed);
  if (events.boostTier > 0) chase.bump(0.3 + events.boostTier * 0.2);
  if (events.wallHit > 0.3) chase.bump(events.wallHit);

  if (finished()) return;
  raceTime += dt;
  if (laps.update(nearestOnSpline(track.spline, cur.x, cur.z).s)) {
    lapTimes.push(raceTime - lapStart);
    lapStart = raceTime;
  }
}

function interpolate(alpha: number): KartState {
  copyKartState(cur, snapshot);
  snapshot.x = lerp(prev.x, cur.x, alpha);
  snapshot.y = lerp(prev.y, cur.y, alpha);
  snapshot.z = lerp(prev.z, cur.z, alpha);
  snapshot.heading = lerpAngle(prev.heading, cur.heading, alpha);
  snapshot.slip = lerp(prev.slip, cur.slip, alpha);
  snapshot.speed = lerp(prev.speed, cur.speed, alpha);
  return snapshot;
}

let elapsed = 0;
const loop = new FixedLoop(step, (alpha, frameDt) => {
  if (input.consumePause()) loop.paused = !loop.paused;
  const dt = loop.paused ? 0 : frameDt;
  elapsed += dt;

  const s = interpolate(alpha);
  kartView.update(s, params.topSpeed, dt, elapsed);
  chase.update(s, params.topSpeed, lastInput.lookBack, dt);
  trackView.update(elapsed);

  sun.position.set(s.x + 30, 60, s.z + 20);
  sun.target.position.set(s.x, 0, s.z);

  hud.update({
    kart: s,
    lap: laps.lap,
    totalLaps: track.def.laps,
    raceTime,
    lapTimes,
    racerName: racer.name,
    engineClass: engine,
    autoAccelerate: input.autoAccelerate,
    paused: loop.paused,
  });
  renderer.render(scene, camera);
});

// Dev controls for milestone 1 tuning.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const n = Number(e.key);
  if (n >= 1 && n <= RACERS.length) {
    racer = RACERS[n - 1];
    params = kartParams(racer.stats, engine);
    kartView.setRacer(racer);
  } else if (e.code === 'KeyC') {
    engine = ENGINE_CLASSES[(ENGINE_CLASSES.indexOf(engine) + 1) % ENGINE_CLASSES.length];
    params = kartParams(racer.stats, engine);
  } else if (e.code === 'KeyR') {
    resetRace();
  } else if (e.code === 'KeyM') {
    input.autoAccelerate = !input.autoAccelerate;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRace();
loop.start();
