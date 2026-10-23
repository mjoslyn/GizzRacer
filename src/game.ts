import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop, PHYSICS_DT } from './core/loop';
import { clamp, damp, lerp, lerpAngle } from './core/math';
import { CPU_SKILL, CpuDriver, rivalSkill } from './ai/cpuDriver';
import { MusicPlayer } from './audio/music';
import { Sfx } from './audio/sfx';
import { remixCues } from './audio/songs';
import { GHOST_HZ, GHOST_OVERRUN, GhostRecorder, decodeGhost, encodeGhost, ghostPose, type GhostRun } from './core/ghost';
import { identity } from './net/identity';
import { TRIAL_LAPS, recordId } from './net/runCheck';
import { fetchGhost, uploadRun } from './net/trials';
import { LeaderboardPanel } from './ui/leaderboard';
import { RecordsPanel } from './ui/recordsPanel';
import { NamePrompt } from './ui/namePrompt';
import { cupBoard, postRecord, raceBoard } from './net/records';
import { foundShortcut, recordCup, recordRace, recordStyle } from './core/progress';
import { StyleMeter, driftMove } from './core/style';
import { SURGE_CLOSE, SURGE_CLOSING, SURGE_FAST } from './items/items';
import { LobbyScreen } from './ui/lobby';
import { SettingsScreen } from './ui/settings';
import { TiltSteering } from './ui/tilt';
import { onSettings, settings, updateSettings } from './core/settings';
import { OnlineRace } from './net/onlineRace';
import type { Effect, RoomStart } from './net/protocol';
import type { RoomClient } from './net/room';
import { GrandPrix } from './core/grandPrix';
import { Race, ordinal, type RaceKart } from './core/race';
import { DRIFT_TIERS, PHYSICS_VERSION, copyKartState, createKartState, driftTier, respawnKart, type KartState, type StepEvents } from './physics/kart';
import { FIELD_SIZE, RACERS, pickRivals, type RacerDef } from './physics/racers';
import type { HazardKind } from './items/hazards';
import { ITEMS, type ItemHolder, type ItemKind } from './items/items';
import { ChaseCamera, type CameraPlacement } from './render/chaseCamera';
import { HazardsView, ItemsView } from './render/itemViews';
import { KartView, setDustColor } from './render/kartView';
import { DETAIL_SPEC, setGraphicsDetail } from './render/detail';
import { PostFx } from './render/postfx';
import { RacerGallery } from './render/gallery';
import { flareRingTexture, glowTexture, setTextureAnisotropy } from './render/textures';
import { WATER_LEVEL, buildTrackView, type TrackView } from './render/trackView';
import { TRACK_LIST, randomCupTracks } from './tracks/index';
import { pointAt } from './tracks/spline';
import { generateTrack, trackId } from './tracks/generator';
import { Track, inPit, type TrackDef } from './tracks/track';
import { Hud, formatTime, type Table, type TableRow } from './ui/hud';
import { deleteSaved, findSaved, saveTrack, savedTracks } from './core/savedTracks';
import { DAILY_SLOT, Menu, chosenCup, newSeed, type MenuChoice } from './ui/menu';
import { SaveTrackPanel } from './ui/saveTrack';
import { Podium } from './render/podium';
import { ScreenFit } from './ui/screen';
import { TouchControls } from './ui/touch';
const SUN_DIR = new THREE.Vector3(-0.5, 0.55, -0.65).normalize();

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, DETAIL_SPEC.high.pixelRatio));
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
scene.add(sun, sun.target);
// Sun shadows (Settings > Detail): a shadow camera that rides with the kart being watched.
const SHADOW_REACH = 70;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_REACH;
sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_REACH;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 420;
// A depth bias only: a normal bias blanks the shadows outright on this Three.js's depth-texture shadow maps.
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0;
sun.shadow.camera.updateProjectionMatrix();
renderer.shadowMap.type = THREE.PCFShadowMap;

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
type Mode = 'title' | 'menu' | 'race' | 'results' | 'standings' | 'podium' | 'lobby';
let mode: Mode = 'title';

let choice: MenuChoice = {
  mode: 'grandPrix',
  track: 1,
  cup: 0,
  randomTracks: randomCupTracks(),
  gen: { slot: -1, params: { seed: newSeed(), theme: 'lagoon', complexity: 3, length: 'medium' } },
  racer: RACERS[0],
  engine: '100cc',
  mirror: false,
};
/** The cup in progress, if racing a Grand Prix. */
let gp: GrandPrix | null = null;
let podium: Podium | null = null;
/** The results screen's line under the title: a Time Trial's record, a race's style and best time. */
let trialNote = '';
/** The style meter for the race in progress (null in Time Trial and attract mode). */
let style: StyleMeter | null = null;
/** Time Trial: the gap to the ghost at each checkpoint passed, and the last checkpoint seen. */
let splits: { label: string; gap: number }[] = [];
let lastCheckpoint = -1;
/** The shortcut the player was last on, so a new one is noticed once. */
let lastBranch = -1;
/** The race's records have been written (once per race, when the player finishes). */
let raceRecorded = false;
/** The player's times and places through the cup in progress, for its record. */
let gpTimes: number[] = [];
let gpPlaces: number[] = [];
/** Snapshots mirrored for drawing in Mirror mode (one per kart, reused). */
const mirrorSnaps: KartState[] = [];
/** Time Trial: the run being recorded, and the best run replaying as a see-through kart. */
let recorder: GhostRecorder | null = null;
interface Ghost {
  run: GhostRun;
  view: KartView;
  state: KartState;
  /** Who set it, for the HUD: "you" or a leaderboard name. */
  label: string;
  /** Race distance (m, like RaceKart.distance) at each sample, never decreasing: for the live gap. */
  dist: Float32Array;
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
/** Draws the player's rivals; a new one each time the picker starts something, so a restart keeps the field. */
let fieldSeed = 1;
/** Flyover seconds left before the countdown starts. */
let intro = 0;
/** Smoothed post effect levels. */
/** Post effects, eased toward their targets each frame; `bite` is the red flash of a hit, decaying. */
const fx = { haze: 0, kaleido: 0, vhs: 0, duo: 0, box: 0, bite: 0, water: 0 };

/** The world's own fog, and the close blue-green of being under water, blended. */
const SEA_FOG = new THREE.Color(0x0a5a6a);
const airFog = { color: new THREE.Color(), near: 0, far: 0, known: false };
function underwaterFog(amount: number): void {
  const fog = scene.fog as THREE.Fog | null;
  if (!fog) return;
  if (!airFog.known || amount === 0) {
    airFog.color.copy(fog.color);
    airFog.near = fog.near;
    airFog.far = fog.far;
    airFog.known = true;
    if (amount === 0) return;
  }
  fog.color.copy(airFog.color).lerp(SEA_FOG, amount);
  fog.near = airFog.near + (4 - airFog.near) * amount;
  fog.far = airFog.far + (70 - airFog.far) * amount;
}

type VhsMoment = 'flyover' | 'attract' | 'race' | 'finalLap' | 'other';

/**
 * How much tape and duotone each VHS setting puts on each moment. Light
 * keeps the duotone to the flyover, the title and bites, so it never hides
 * the road; Full washes the races in it too.
 */
const VHS_LEVELS: Record<'full' | 'light' | 'off', { vhs: Record<VhsMoment, number>; duo: Record<VhsMoment, number>; bite: number }> = {
  light: { vhs: { flyover: 0.4, attract: 0.3, race: 0.25, finalLap: 0.35, other: 0 }, duo: { flyover: 0.35, attract: 0.3, race: 0, finalLap: 0, other: 0 }, bite: 0.35 },
  full: { vhs: { flyover: 1, attract: 0.9, race: 1, finalLap: 1, other: 0 }, duo: { flyover: 1, attract: 0.95, race: 0.4, finalLap: 0.55, other: 0 }, bite: 0.6 },
  off: { vhs: { flyover: 0, attract: 0, race: 0, finalLap: 0, other: 0 }, duo: { flyover: 0, attract: 0, race: 0, finalLap: 0, other: 0 }, bite: 0 },
};

/** A hit on the player: the screen takes a short red bite, like the Rattlesnake video. */
function bite(): void {
  if (settings().videoLook !== 'off') fx.bite = 1;
}
/** Debug: the simulation stands still without the pause menu (gizz.freeze). */
let frozen = false;
let lastInput: InputFrame = NEUTRAL_INPUT;
let musicMuted = false;
let sfxMuted = false;
/** What the player's kart was doing last tick, to turn changes into sounds. */
const heard = { count: 0, lap: 0, tier: 0, rolling: false };
/** A Nonagon Infinity is in earshot of you when it's this close (m). */
const SURGE_WARN = 120;
/** Seconds the player has been driving against the track. */
let wrongWay = 0;
const snapshots = new Map<RaceKart, KartState>();

/** Mirror mode is on for what's showing: a Grand Prix or Single Race offline with the picker's Mirror on. */
function mirrored(): boolean {
  return choice.mirror && !online && (choice.mode === 'grandPrix' || choice.mode === 'single');
}

/**
 * A kart as it's drawn in Mirror mode: the world is flipped left for right
 * (the track, item and hazard views are scaled by -1 in x), so a kart's
 * position and everything handed about it is flipped to match. The
 * simulation never knows.
 */
function mirrorState(s: KartState, out: KartState): KartState {
  copyKartState(s, out);
  out.x = -s.x;
  out.heading = -s.heading;
  out.steer = -s.steer;
  out.slip = -s.slip;
  out.driftDir = -s.driftDir as KartState['driftDir'];
  out.extX = -s.extX;
  out.spinAngle = -s.spinAngle;
  return out;
}

const menu = new Menu(
  document.body,
  choice,
  onMenuChange,
  (c) => {
    choice = { ...c };
    if (c.mode === 'online') return setMode('lobby');
    fieldSeed = Math.floor(Math.random() * 2 ** 31);
    gp = c.mode === 'grandPrix' ? new GrandPrix(defaultGrid(c.racer, fieldSeed), chosenCup(c).tracks) : null;
    gpTimes = [];
    gpPlaces = [];
    cupNote = '';
    startRace(true);
  },
  savedTracks,
  (t) => deleteSaved(t),
);
/** After a race on a generated track: keep it. */
const savePanel = new SaveTrackPanel(document.body);
savePanel.onSave = (name) => {
  const slot = saveTrack(choice.gen.params, name);
  menu.selectSaved(slot);
  choice = { ...choice, gen: menu.choice.gen };
  track.def.name = savedTracks()[slot].name;
};
/** The online race in progress: the room, its start, and my side of the race once it's built. */
let online: { client: RoomClient; start: RoomStart; net: OnlineRace | null } | null = null;
/** Physics ticks this online race, for reporting my kart 15 times a second. */
let netTicks = 0;
/** When I last asked the room to use my item (its answer takes a round trip). */
let itemSentAt = -Infinity;
const lobby = new LobbyScreen(document.body, () => choice.racer);
lobby.onBack = () => setMode('menu');
lobby.onSettings = (s) => {
  // The attract race behind the lobby shows the room's track.
  if (mode === 'lobby' && track.def.id !== TRACK_LIST[s.track].id) loadTrack(TRACK_LIST[s.track]);
};
lobby.onStart = (start, client) => {
  online = { client, start, net: null };
  client.onSnap = (snap) => online?.client === client && online.net?.receive(snap, performance.now() / 1000);
  client.onFx = (fx) => online?.client === client && onEffects(fx);
  gp = null;
  choice = { ...choice, engine: start.settings.engine };
  if (track.def.id !== TRACK_LIST[start.settings.track].id) loadTrack(TRACK_LIST[start.settings.track]);
  startRace(true);
};
/** A ?room= link opens the lobby and joins once past the title. */
const linkedRoom = new URLSearchParams(location.search).get('room');
const touch = new TouchControls(document.body, input, () => input.requestPause());
const screenFit = new ScreenFit(document.body, fitRenderer);
const board = new LeaderboardPanel(document.body, () => {
  // The local record for the board showing (the picker's track and class).
  try {
    const rec = JSON.parse(localStorage.getItem(`gizzracer.tt.${recordId(TRACK_LIST[choice.track].id)}.${choice.engine}.v${PHYSICS_VERSION}`) ?? 'null') as { total: number } | null;
    return rec ? Math.round(rec.total * 1000) : null;
  } catch {
    return null;
  }
});
/** The race-time and cup leaderboards beside the picker, in the modes that post to them. */
const records = new RecordsPanel(document.body);
/** Asks for a name on the results screen the first time there's something to post. */
const namePrompt = new NamePrompt(document.body);
const tilt = new TiltSteering(input);
const settingsScreen = new SettingsScreen(document.body, tilt);
/** The mix that sits right: music under the effects (see the audio commit). */
const MUSIC_LEVEL = 0.63;
onSettings((s) => {
  // Detail (render/detail.ts): shadows and the resolution switch at once; the road grain and the scenery arrive with the next track built.
  const spec = DETAIL_SPEC[s.detail];
  setGraphicsDetail(s.detail);
  renderer.shadowMap.enabled = spec.shadows;
  sun.castShadow = spec.shadows;
  KartView.realShadows = spec.shadows;
  if (spec.shadows && (sun.shadow.mapSize.x !== spec.shadowMap || sun.shadow.camera.right !== spec.shadowReach)) {
    // A new map size needs a new map; the reach is the shadow camera's frustum.
    sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -spec.shadowReach;
    sun.shadow.camera.right = sun.shadow.camera.top = spec.shadowReach;
    sun.shadow.camera.updateProjectionMatrix();
  }
  // Low draws at fewer pixels: on a phone that is most of the saving.
  const ratio = Math.min(window.devicePixelRatio, spec.pixelRatio);
  if (renderer.getPixelRatio() !== ratio) {
    renderer.setPixelRatio(ratio);
    fitRenderer();
  }
  music.setVolume(s.music * MUSIC_LEVEL);
  sfx.setVolume(s.sfx);
  input.autoAccelerate = s.autoAccelerate;
  touch.setTiltMode(s.tilt);
});
// Android allows the sensor straight away; iPhones need a tap (see touchend below).
if (settings().tilt) void tilt.start();
hud.onTitleSettings = () => settingsScreen.open();
hud.onTitleCredits = () => settingsScreen.openCredits();

/** The leaderboard shows beside the picker: Time Trial's ghosts, or the race-time and cup boards for the other modes. */
function updateBoard(refresh = false): void {
  // Beside the picker's track and speed screens only: the mode list and the racer gallery stand alone.
  const picking = mode === 'menu' && menu.showsBoard;
  const on = picking && choice.mode === 'timeTrial';
  board.show(on);
  const rec = picking && !on && choice.mode !== 'online';
  records.show(rec);
  document.body.classList.toggle('board-open', on || rec);
  if (on) board.load(TRACK_LIST[choice.track].id, TRACK_LIST[choice.track].name, choice.engine, refresh);
  if (!rec) return;
  const mirror = choice.mirror && choice.mode !== 'generator';
  const tag = `${choice.engine}${mirror ? ' · Mirror' : ''}`;
  if (choice.mode === 'grandPrix') {
    const cup = chosenCup(choice);
    records.load(cupBoard(cup.id, choice.engine, mirror), `${cup.name} · ${tag}`, refresh);
  } else {
    const t = choice.mode === 'generator' ? generatedTrack() : TRACK_LIST[choice.track];
    const name = choice.mode === 'generator' ? (choice.gen.slot === DAILY_SLOT ? `Daily: ${track.def.name}` : track.def.name) : TRACK_LIST[choice.track].name;
    records.load(raceBoard(t.id, choice.engine, mirror), `${name} · ${tag}`, refresh);
  }
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
  if (next !== 'results' && next !== 'standings' && next !== 'podium') namePrompt.hide();
  mode = next;
  document.body.dataset.mode = next;
  hud.showTitle(next === 'title');
  menu.show(next === 'menu');
  lobby.show(next === 'lobby');
  // A generated track can be kept once it's been raced.
  const generated = next === 'results' && choice.mode === 'generator' && !online;
  savePanel.show(generated ? track.def.name : null, generated && !!findSaved(choice.gen.params));
  touch.setVisible(next === 'race');
  loop.paused = false;
  if (next === 'title' || next === 'menu' || next === 'lobby') music.play(remixCues('title'));
  // Back at the picker: fetch the board again, it may include the run just posted.
  updateBoard(true);
}

function onMenuChange(c: MenuChoice, row: string): void {
  choice = { ...c };
  sfx.menu();
  if (row !== 'racer' && row !== 'engine') {
    const entry = menuTrack();
    if (track.def.id !== entry.id) loadTrack(entry);
  }
  updateBoard();
}

/** A track to load: one of the list, or a generated one. */
interface TrackEntry {
  id: string;
  build: () => TrackDef;
}

/** The generator's current track, under its saved name if it has one. */
function generatedTrack(): TrackEntry {
  const params = { ...choice.gen.params };
  return {
    id: trackId(params),
    build: () => {
      const def = generateTrack(params);
      return { ...def, name: findSaved(params)?.name ?? def.name };
    },
  };
}

/** The track the menu is showing: the cup's first for a Grand Prix. */
function menuTrack(): TrackEntry {
  if (choice.mode === 'generator') return generatedTrack();
  return TRACK_LIST[choice.mode === 'grandPrix' ? chosenCup(choice).tracks[0] : choice.track];
}

/** The track the next race with the player runs on. */
function raceTrack(): TrackEntry {
  if (gp) return TRACK_LIST[gp.trackIndex];
  return choice.mode === 'generator' ? generatedTrack() : TRACK_LIST[choice.track];
}

/** CPUs drawn from the roster by `seed` fill the field; the player starts from PLAYER_SLOT. */
function defaultGrid(racer: RacerDef | null, seed: number): RacerDef[] {
  const grid = pickRivals(new Set(racer ? [racer.id] : []), racer ? FIELD_SIZE - 1 : FIELD_SIZE, seed);
  if (racer) grid.splice(Math.min(PLAYER_SLOT, grid.length), 0, racer);
  return grid;
}

function loadTrack(entry: TrackEntry): void {
  if (trackView) {
    scene.remove(trackView.group);
    trackView.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  track = new Track(entry.build());
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
  const net = withPlayer ? online : null;
  if (withPlayer && !net && track.def.id !== raceTrack().id) loadTrack(raceTrack());
  const trial = withPlayer && !net && choice.mode === 'timeTrial';
  race = new Race(track, net ? net.start.seed : raceSeed++, !trial, trial ? TRIAL_LAPS : track.def.laps);
  setupGhost(trial);
  player = null;
  trialNote = '';
  Object.assign(heard, { count: 0, lap: 0, tier: 0, rolling: false });
  if (net) {
    // The room's grid: I drive my kart here; every other kart is the room's, shown from its snapshots.
    const me = identity().playerId;
    for (const slot of net.start.grid) {
      const r = RACERS.find((x) => x.id === slot.racerId) ?? RACERS[0];
      const k = race.addKart(r, choice.engine, slot.playerId === me ? null : CPU_SKILL[choice.engine]);
      if (slot.playerId === me) player = k;
    }
    net.net = player && new OnlineRace(race, player);
    netTicks = 0;
    itemSentAt = -Infinity;
  } else {
    const grid = !withPlayer ? defaultGrid(null, raceSeed) : trial ? [choice.racer] : gp ? gp.grid() : defaultGrid(choice.racer, fieldSeed);
    for (const r of grid) {
      if (withPlayer && r === choice.racer) player = race.addKart(r, choice.engine, null);
      else {
        // A Grand Prix rival drives a touch sharper, and wears the name.
        const rival = withPlayer && !!gp && gp.rivals.includes(r);
        race.addKart(r, choice.engine, rival ? rivalSkill(CPU_SKILL[choice.engine]) : CPU_SKILL[choice.engine]).rival = rival;
      }
    }
    // The CPUs ahead hold back a little for the player (Race.rubberBand), never for a ghost or the attract mode.
    race.focus = withPlayer && !trial ? player : null;
  }
  style = withPlayer && !net && !trial ? new StyleMeter() : null;
  splits = [];
  lastCheckpoint = -1;
  lastBranch = -1;
  raceRecorded = false;
  hud.minimap.setMirror(mirrored());
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
  // Straight ahead is however the phone is held as the race begins.
  if (withPlayer) tilt.recenter();
  intro = withPlayer && !net ? INTRO_TIME : 0;
  // Online, everyone's GO is the room's: count down to it on the room clock.
  if (net) race.time = Math.max(-10, -(net.start.at - net.client.serverNow()) / 1000);
  if (withPlayer) {
    setMode('race');
    music.play(remixCues(track.def.music.lap));
  }
}

// Keyed by physics version: older records and ghosts (e.g. 3-lap ones) don't carry over.
const ghostKey = () => `gizzracer.ghost.${recordId(track.def.id)}.${choice.engine}.v${PHYSICS_VERSION}`;

/**
 * In Time Trial, starts recording and brings back ONE ghost to chase: the
 * leaderboard run you picked, else the next one up from your best, else
 * (you lead the board, or it's out of reach) your own best run. Beat it
 * and the next race brings the one after.
 */
function setupGhost(trial: boolean): void {
  for (const g of ghosts) scene.remove(g.view.root, g.view.fx);
  ghosts = [];
  recorder = trial ? new GhostRecorder() : null;
  if (!trial) return;
  const own = () => {
    try {
      const text = localStorage.getItem(ghostKey());
      const run = text ? decodeGhost(text) : null;
      if (run && !ghosts.length) addGhost(run, 'you');
    } catch {
      // Storage blocked: race without your ghost.
    }
  };
  const picked = board.target;
  if (!picked) return own();
  const raceAtStart = race;
  fetchGhost(track.def.id, choice.engine, picked.runId)
    .then((run) => race === raceAtStart && addGhost(run, picked.name, 0xff5ad0))
    .catch(() => {
      if (race !== raceAtStart) return;
      hud.flash('GHOST UNAVAILABLE');
      own();
    });
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
  // Nor a shadow.
  view.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  scene.add(view.root, view.fx);
  ghosts.push({ run, view, state: createKartState(), label, dist: ghostDistances(run) });
}

/** How far round the course a ghost had got at each sample, measured like RaceKart.distance. */
function ghostDistances(run: GhostRun): Float32Array {
  const d = run.samples;
  const n = d.length / 6;
  const out = new Float32Array(n);
  const L = track.length;
  let hint = -1;
  let prev = 0;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const loc = track.locate(d[o], d[o + 2], d[o + 1], hint);
    hint = loc.hint;
    if (i === 0) {
      dist = loc.progress > L / 2 ? loc.progress - L : loc.progress;
    } else {
      let step = loc.progress - prev;
      if (step > L / 2) step -= L;
      else if (step < -L / 2) step += L;
      dist += step;
    }
    prev = loc.progress;
    out[i] = i === 0 ? dist : Math.max(out[i - 1], dist);
  }
  return out;
}

/** Seconds the player is behind (positive) or ahead of (negative) a ghost, or null before it's comparable. */
function ghostGap(g: Ghost, p: RaceKart): number | null {
  if (p.finishTime !== null) return p.finishTime - g.run.total;
  if (race.time <= 0) return null;
  const want = p.distance;
  const dist = g.dist;
  if (want <= dist[0] || want > dist[dist.length - 1]) return null;
  // First sample at or past the player's distance, then interpolate.
  let lo = 0;
  let hi = dist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] < want) lo = mid + 1;
    else hi = mid;
  }
  const a = dist[lo - 1];
  const b = dist[lo];
  const t = (lo - 1 + (b > a ? (want - a) / (b - a) : 1)) / GHOST_HZ;
  return race.time - t;
}

/** The ghost the HUD compares against: the leaderboard one if racing it, else your own. */
function rivalGhost(): Ghost | null {
  return ghosts.find((g) => g.label !== 'you') ?? ghosts[0] ?? null;
}

/** Swoops along the last stretch of the lap down onto the grid. */
function introCamera(): void {
  const u = 1 - intro / INTRO_TIME;
  const e = u * u * (3 - 2 * u);
  const s = lerp(-240, -36, e);
  const p = pointAt(track.spline, s);
  const a = pointAt(track.spline, s + 30);
  const lateral = lerp(16, 0, e);
  const m = mirrored() ? -1 : 1;
  camera.position.set(m * (p.x - p.tz * lateral), track.main.heightAt(((s % track.length) + track.length) % track.length) + lerp(24, 4.5, e), p.z + p.tx * lateral);
  camera.lookAt(m * a.x, track.main.heightAt(((s + 30 + track.length) % track.length)) + 1.5, a.z);
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
  // Mirror mode flips the world on screen, so left is right at the wheel too.
  if (mirrored() && (lastInput.steer !== 0)) lastInput = { ...lastInput, steer: -lastInput.steer };
  if (mode === 'podium') return;
  if (intro > 0) {
    intro = Math.max(0, intro - dt);
    if (intro === 0) chase.snap();
    return;
  }
  // Online countdowns follow the room's clock, so a slow frame can't make anyone late to GO.
  if (online && race.time < 0) race.time = Math.min(0, -(online.start.at - online.client.serverNow()) / 1000) - dt;
  const net = player && online?.net;
  if (net) netStep(net, player!);
  if (player) player.assist = settings().smartSteering;
  const inputs = race.karts.map((k) => (k === player ? lastInput : undefined));
  const events = race.step(dt, inputs);
  events.forEach((ev, i) => {
    if (ev.landed > 3) views[i].impact(ev.landed);
    if (ev.wallHit > 0.2) views[i].collide(ev.wallHit);
    const k = race.karts[i];
    if (k.bump > 3) views[i].collide(Math.min(1.5, k.bump / 8), k.bumpX, k.bumpZ);
    // Back from a fall: through the Nonagon gate.
    if (k.respawned) views[i].restore(k.state);
  });
  if (!player) {
    // Attract mode: once someone wins, start another heat.
    if (race.results.length > 0) startRace(false);
    return;
  }
  const ev = events[race.karts.indexOf(player)];
  style?.tick(dt);
  // Nothing scores after the flag: the autopilot's laps are not yours.
  const st = player.finishTime === null ? style : null;
  if (ev.boostTier > 0) {
    chase.bump(0.3 + ev.boostTier * 0.2);
    chase.kick(3 + ev.boostTier * 3);
    st?.add(driftMove(ev.boostTier));
  }
  if (ev.glided) {
    chase.bump(0.5);
    chase.kick(5);
  }
  if (ev.trick) {
    chase.bump(0.6);
    chase.kick(4 + ev.trickStreak * 2);
    st?.add('trick', ev.trickStreak);
  }
  if (player.drafted) {
    sfx.slipstream();
    chase.kick(6);
    st?.add('slipstream');
  }
  checkShortcut(player);
  checkSplit(player);
  if (player.bump > 3) sfx.bump(Math.min(1, player.bump / 10));
  if (ev.wallHit > 0.3) chase.bump(ev.wallHit);
  if (player.respawned) chase.snap();
  playerSounds(player, ev);
  if (race.time >= 0 && race.time - dt < 0 && player.launch) {
    hud.flash(player.launch === 'rocket' ? 'ROCKET START!' : 'TOO EARLY!');
    if (player.launch === 'rocket') {
      sfx.rocket();
      chase.kick(8);
      st?.add('rocket');
    } else {
      sfx.stall();
    }
  }
  checkWrongWay(player, dt);
  // Record a little past the line so the ghost visibly crosses it.
  if (recorder && (player.finishTime === null || race.time - player.finishTime < GHOST_OVERRUN)) recorder.record(race.time, player.state);
  for (const e of race.events) {
    if (e.type === 'pickup' && e.kart === player) sfx.pickup();
    if (e.type === 'box') boxSound(e.kart === player, e.x, e.z, e.double);
    if (e.type === 'block' || e.type === 'dodge') {
      const mine = e.kart === player;
      if (mine || e.from === player) hud.callout({ from: who(e.from), to: who(e.kart), by: e.by, kind: e.type === 'block' ? 'blocked' : 'dodged' });
      if (mine) {
        if (e.type === 'block') sfx.block();
        else sfx.dodge();
        st?.add(e.type === 'block' ? 'block' : 'dodge');
      }
      continue;
    }
    if (e.type === 'bonus') {
      if (e.kart === player) {
        hud.flash(BONUS_TEXT[e.by]);
        sfx.boost(2);
        st?.add('hazard');
      }
      continue;
    }
    if (e.type === 'use' && e.kart === player) {
      sfx.use(e.item);
      if (e.item === 'wooCannon') {
        hud.flash('WOO CANNON!');
        chase.bump(0.8);
      }
    } else if (e.type === 'use' && e.item === 'wooCannon') {
      // Someone else's cannon going off nearby: you hear it too, fading with distance.
      const o = e.kart.state;
      const d = Math.hypot(o.x - player.state.x, o.z - player.state.z);
      if (d < 80) sfx.woo(0.6 * (1 - d / 80));
    }
    if (e.type !== 'hit') continue;
    const item = e.by in ITEMS ? (e.by as ItemKind) : null;
    if (e.kart === player) {
      hud.flash(HIT_TEXT[e.by]);
      sfx.hurt(e.by);
      if (HIT_TEXT[e.by]) bite();
      if (e.by !== 'tempoShift' && e.by !== 'bassDrop') chase.bump(0.5);
      if (e.by === 'bassDrop') chase.bump(1.2);
      if (item && e.from) hud.callout({ from: who(e.from), to: 'you', by: item, kind: 'took' });
    } else if (e.from === player && item) {
      // Area items hit a crowd: one line each, but only one flash and sound.
      hud.callout({ from: 'you', to: who(e.kart), by: item, kind: 'landed' });
      // The feed says who you hit; a sound is enough on top of it.
      if (e.by !== 'tempoShift' && e.by !== 'bassDrop') sfx.scored();
      st?.add('hit');
    }
  }
  surgeWarning(player, dt);
  if (player.finishTime !== null && !raceRecorded) {
    raceRecorded = true;
    if (!online && choice.mode !== 'timeTrial') finishRace(player);
  }
  if (mode === 'race' && player.finishTime !== null && race.time - player.finishTime > RESULTS_DELAY) {
    if (choice.mode === 'timeTrial') {
      trialNote = saveTrial(player.finishTime, Math.min(...player.lapTimes), player.racer.id);
      const rival = rivalGhost();
      if (rival) {
        const gap = player.finishTime - rival.run.total;
        const who = rival.label === 'you' ? 'your best' : rival.label;
        trialNote += gap < 0 ? ` · beat ${who} by ${(-gap).toFixed(2)}s` : ` · ${gap.toFixed(2)}s behind ${who}`;
        // A picked ghost beaten is done with: the next race brings the next one up the board.
        if (gap < 0 && board.picked && rival.label !== 'you') board.picked = null;
      }
      postTrial(player);
    }
    setMode('results');
  }
  updateMusic(player);
}

/** Online: place the other karts, use my item through the room, and report where I am. */
function netStep(net: OnlineRace, p: RaceKart): void {
  const now = performance.now() / 1000;
  const heldItem = p.item;
  net.update(now);
  if (heldItem === null && p.item !== null) sfx.pickup();
  for (const b of net.popped) {
    const near = Math.hypot(b.x - p.state.x, b.z - p.state.z) < 3.5;
    boxSound(near, b.x, b.z, b.double);
  }
  // Items are the room's: ask it, and play the sound now rather than a round trip later.
  if (lastInput.itemPressed && p.item && p.rolling === 0 && race.started && p.finishTime === null && now - itemSentAt > 0.4) {
    itemSentAt = now;
    sfx.use(p.item);
    online!.client.send({ t: 'item' });
  }
  if (netTicks++ % 4 === 0) online!.client.send({ t: 'kart', s: net.report() });
}

/** Hits the room landed on my kart (and my fuzz boosts). */
function onEffects(fx: Effect[]): void {
  const net = online?.net;
  if (!net || mode !== 'race') return;
  for (const e of net.apply(fx)) {
    if (e.k === 'boost' || e.k === 'ram') continue;
    if (e.k === 'cannon') {
      hud.flash('WOO CANNON!');
      chase.bump(0.8);
      continue;
    }
    const by = e.by as ItemKind;
    const from = e.f !== undefined ? race.karts[e.f] : undefined;
    if (e.k === 'dodge') {
      sfx.dodge();
      if (from) hud.callout({ from: who(from), to: 'you', by, kind: 'dodged' });
      continue;
    }
    hud.flash(HIT_TEXT[by] ?? 'HIT!');
    sfx.hurt(by);
    bite();
    if (e.k !== 'slow') chase.bump(0.5);
    if (from && by in ITEMS) hud.callout({ from: who(from), to: 'you', by, kind: 'took' });
  }
}

/** A racer's name for the callout feed. */
function who(k: ItemHolder | undefined): string {
  if (!k) return '?';
  return k === player ? 'you' : (k as RaceKart).racer.name;
}

/** An item box breaking: loud when it's yours, fainter for someone else's nearby. */
function boxSound(mine: boolean, x: number, z: number, double: boolean): void {
  if (mine) {
    sfx.box(1, double);
    return;
  }
  if (!player) return;
  const d = Math.hypot(x - player.state.x, z - player.state.z);
  if (d < 40) sfx.box(0.45 * (1 - d / 40), double);
}

/**
 * How close a Nonagon Infinity coming for the player is, 0 (just in
 * earshot) .. 1 (arriving), and how many seconds until it does (from how
 * fast it closes: the gap it still has to make up at its closing speed),
 * or null. The HUD counts that down to the moment to hop.
 */
function surgeCloseness(p: RaceKart): { near: number; eta: number } | null {
  const w = race.items.surge;
  if (!w || w.target !== p || p.finishTime !== null) return null;
  const d = Math.hypot(w.x - p.state.x, w.z - p.state.z);
  if (d >= SURGE_WARN) return null;
  const gap = Math.max(0, p.distance - w.d);
  // Far off it runs flat out; near, at the leader's speed plus its closing rate.
  const closing = gap > SURGE_CLOSE ? Math.max(1, SURGE_FAST - Math.max(0, p.state.speed)) : SURGE_CLOSING;
  const eta = gap > SURGE_CLOSE ? (gap - SURGE_CLOSE) / closing + SURGE_CLOSE / SURGE_CLOSING : gap / closing;
  return { near: 1 - d / SURGE_WARN, eta };
}

/** The wave's alarm, faster as it closes. */
function surgeWarning(p: RaceKart, dt: number): void {
  const near = surgeCloseness(p);
  sfx.surgeAlarm(dt, near?.near ?? null);
}

/** A shortcut the player has just driven onto: style points, and noted in their progress. Quietly: no pop-up, no sting. */
function checkShortcut(p: RaceKart): void {
  const b = p.branch;
  if (b === lastBranch) return;
  lastBranch = b;
  if (b < 0 || !race.started || p.finishTime !== null) return;
  style?.add('shortcut');
  foundShortcut(track.def.id, track.def.branches[b]?.name ?? 'shortcut');
}

/** Time Trial: at each checkpoint, the gap to the ghost being chased as a split. */
function checkSplit(p: RaceKart): void {
  if (!recorder) return;
  const cp = p.laps.lastCheckpoint;
  if (cp === lastCheckpoint) return;
  lastCheckpoint = cp;
  if (cp < 0) return;
  const g = rivalGhost();
  const gap = g ? ghostGap(g, p) : null;
  if (gap !== null) splits.push({ label: `S${cp + 1}`, gap });
}

/** A finished race offline (Single Race or a Grand Prix race): the style tally, the best time, and the online board. */
function finishRace(p: RaceKart): void {
  const ms = Math.round(p.finishTime! * 1000);
  const mirror = mirrored();
  const parts: string[] = [];
  if (style) {
    parts.push(style.summary());
    if (recordStyle(track.def.id, choice.engine, style.score).best) parts.push('NEW STYLE BEST!');
  }
  const rec = recordRace(track.def.id, choice.engine, mirror, ms);
  parts.push(rec.best ? (rec.prevMs === null ? 'First race time set' : `BEST RACE! ${formatTime((rec.prevMs - ms) / 1000).replace(/^0:0?/, '-')}s`) : `Best race ${formatTime(rec.prevMs! / 1000)}`);
  if (gp) {
    // By round, so a restarted race replaces its own entry.
    gpTimes[gp.round] = p.finishTime!;
    gpPlaces[gp.round] = p.position;
  }
  trialNote = parts.join(' · ');
  const before = trialNote;
  const record = { kind: 'race' as const, trackId: track.def.id, engine: choice.engine, mirror, racerId: p.racer.id, lapsMs: p.lapTimes.map((l) => Math.round(l * 1000)), totalMs: p.lapTimes.reduce((a, l) => a + Math.round(l * 1000), 0), style: style?.score ?? 0 };
  // Only a best is worth asking a name for; a known name posts every race (the server keeps the best).
  if (!rec.best && !identity().name) return;
  namePrompt.ask('your race time', () => {
    postRecord(record)
      .then((r) => (trialNote = `${before} · ${r.best ? 'posted! ' : ''}online #${r.rank}`))
      .catch((err: Error) => (trialNote = `${before} · not posted: ${err.message}`));
  });
}

/** A finished cup: its trophy, what it unlocked, and the online cup board. Returns the podium's line. */
function finishCup(): string {
  const cup = chosenCup(choice);
  const table = gp!.standings();
  const place = table.findIndex((e) => e.racer === choice.racer) + 1;
  const entry = table[place - 1];
  // Quit mid-cup and the record is no record.
  if (!entry || gpTimes.length !== gp!.tracks.length || gpTimes.some((t) => t === undefined)) return '';
  const mirror = mirrored();
  const timeMs = Math.round(gpTimes.reduce((a, t) => a + t * 1000, 0));
  const res = recordCup(cup.id, choice.engine, mirror, { place, points: entry.points, timeMs, sweep: gpPlaces.every((p) => p === 1) });
  const parts: string[] = [];
  if (res.trophy) parts.push(`${res.trophy.toUpperCase()} TROPHY${res.improved ? '!' : ''}`);
  for (const u of res.unlocked) parts.push({ randomCup: 'RANDOM CUP UNLOCKED!', class200: '200cc UNLOCKED!', mirror: 'MIRROR MODE UNLOCKED!' }[u]);
  if (res.trophy || res.unlocked.length) sfx.fanfare();
  const record = { kind: 'cup' as const, cupId: cup.id, engine: choice.engine, mirror, racerId: choice.racer.id, points: entry.points, totalMs: timeMs, places: gpPlaces.slice() };
  namePrompt.ask('your cup result', () => postRecord(record).catch(() => {}));
  return parts.join(' · ');
}

const HIT_TEXT: Record<ItemKind | HazardKind, string> = {
  fuzzPedal: '',
  microtonalMine: 'DETUNED!',
  feedbackWave: 'FUSED!',
  riffMissile: 'STUNG!',
  tempoShift: 'TICK TOCK!',
  wooCannon: 'WOOOOO!',
  fluteFlurry: 'DOZED OFF!',
  drumRoll: 'ROAD TRAINED!',
  bassDrop: 'SUPERHEAVY!',
  patchCable: 'CORDED!',
  harmonicaWail: 'BOOGIED!',
  keytarLaser: 'SLICED!',
  gizzardWave: 'INFINITY!',
  drippingTap: '',
  snakes: 'SNAKEBITE!',
  dustDevils: 'DUST DEVIL!',
  tumbleweeds: 'TUMBLEWEED!',
  boulders: 'ROCKFALL!',
  lavaBombs: 'LAVA BOMB!',
  flameJets: 'TORCHED!',
  dragonFire: 'DRAGONFIRE!',
  oilBombs: 'OILED!',
  vines: 'TIMBER!',
  rollers: "POLYGON'D!",
  fish: 'FISHED!',
  iceBlocks: 'ICED!',
  lasers: 'ZAPPED!',
  butterflies: '',
  meteors: 'METEOR!',
  hail: 'HAILED!',
  lightning: 'STRUCK!',
  tornadoes: '',
  blackHoles: 'SPAGHETTIFIED!',
  wisps: '',
  gliders: 'DEADSTICKED!',
  stones: 'ROCKED!',
  waves: 'WIPED OUT!',
  crystals: 'CRYSTALLISED!',
  geysers: 'BLOWN SKY HIGH!',
  goblins: 'GOBLINED!',
  jaws: 'CHOMPED!',
  crushers: 'CRUSHED!',
  gusts: 'BLOWN AWAY!',
  vesicles: 'BOUNCED!',
  prisms: 'REFRACTED!',
  robots: 'ROBOT STOP!',
  gammaRays: 'PIERCED!',
  vultures: 'PICKED OFF!',
  wahs: 'STOMPED!',
};

/** What a hazard used well says: the ones that can help. */
const BONUS_TEXT: Record<HazardKind, string> = {
  wisps: 'SPIRITED AWAY!',
  gliders: 'WRECK RAMP!',
  lavaBombs: 'LAVA RAMP!',
  meteors: 'METEOR RAMP!',
  stones: 'STONE SMASH!',
  boulders: 'ROCK SMASH!',
  rollers: 'POLYGON SMASH!',
  iceBlocks: 'ICE BREAKER!',
  hail: 'HAIL BREAKER!',
  oilBombs: 'BLASTED THROUGH!',
  tumbleweeds: 'WEED WHACKER!',
  waves: 'SURFED!',
  snakes: 'CHARMED!',
  fish: 'CAUGHT ONE!',
  lasers: 'OVERCLOCKED!',
  flameJets: 'FIREWALKER!',
  dragonFire: 'DRAGON RIDER!',
  dustDevils: 'UPDRAFT!',
  tornadoes: 'TWISTED UP!',
  butterflies: 'ON THE WING!',
  blackHoles: 'GRAVITY ASSIST!',
  lightning: 'CHARGED!',
  vines: 'SWUNG!',
  crystals: 'CRYSTAL CRUSHER!',
  geysers: 'GEYSER RIDE!',
  goblins: 'GOBLIN HOP!',
  jaws: 'JUMPED THE JAWS!',
  crushers: 'SHOCKWAVE!',
  gusts: 'CAUGHT THE WIND!',
  vesicles: 'BOUNCE HOUSE!',
  prisms: 'THE FOURTH COLOUR!',
  robots: 'ROBOT HOP!',
  gammaRays: "KNIFE'S EDGE!",
  vultures: 'CARRIED OFF!',
  wahs: 'WAH!',
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
      const final = p.laps.lap === race.laps - 1;
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
  if (ev.glided) sfx.glide();
  if (ev.landed > 2) sfx.land(ev.landed);
  if (ev.wallHit > 0.2) sfx.wall(ev.wallHit);
  if (ev.boostTier > 0) sfx.boost(ev.boostTier);
  if (ev.trick) sfx.trick(ev.trickStreak);
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
  // The drift's charge sings higher toward purple; a draft whistles as it builds.
  sfx.driftCharge(racing && s && s.driftDir !== 0 ? Math.min(1, s.driftCharge / DRIFT_TIERS[DRIFT_TIERS.length - 1]) : 0);
  sfx.draft(racing && p ? p.draft : 0);
  sfx.cannonLoop(racing && !!s && s.cannonTime > 0);
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
      if (!best || d < best.d) best = { d, pan: d > 0 ? ((dx * -Math.cos(s.heading) + dz * Math.sin(s.heading)) / d) * (mirrored() ? -1 : 1) : 0 };
    }
    return best;
  };
  sfx.hazards(dt, near('snakes'), near('dustDevils') ?? near('tornadoes') ?? near('blackHoles') ?? near('butterflies') ?? near('wisps'));
}

function updateMusic(p: RaceKart): void {
  const { lap, finalLap } = track.def.music;
  if (p.finishTime !== null) music.play('podium');
  else if (race.laps > 1 && p.laps.lap === race.laps - 1) music.play(remixCues(finalLap ?? `${lap}-final-lap`).filter((c) => finalLap || c !== `${lap}-final-lap`));
  else music.play(remixCues(lap));
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
/** The racer gallery, built the first time the picker's racer row is used. */
let gallery: RacerGallery | null = null;

/** While the picker's racer row is in use, the gallery takes over the screen, focused on the chosen racer. */
function drawGallery(dt: number): boolean {
  if (mode !== 'menu' || !menu.visible || menu.activeRow !== 'racer') return false;
  const fresh = !gallery;
  gallery ??= new RacerGallery();
  gallery.focus(choice.racer, fresh);
  gallery.update(dt, elapsed, camera.aspect);
  postFx.render(gallery.scene, gallery.camera, { haze: 0, kaleido: 0, beat: (elapsed * 2.4) % 1, time: elapsed });
  return true;
}

const loop = new FixedLoop(step, (alpha, frameDt) => {
  if (input.consumePause() && mode === 'race') {
    if (hud.confirmingRestart) hud.onPauseAction?.('keepRacing');
    else requestPause(!loop.paused);
  }
  // A phone turned upright mid-race pauses; Resume once it's back on its side.
  if (screenFit.portrait && mode === 'race' && !loop.paused) requestPause(true);
  // A debug freeze (gizz.freeze) still animates the karts, so poses can be inspected.
  const dt = loop.paused && !frozen ? 0 : frameDt;
  elapsed += dt;
  // A slow frame (or a stalled tab) mustn't leave me racing in the past: keep up with the room's clock.
  if (online && !loop.paused && race.time > 0) {
    const behind = (online.client.serverNow() - online.start.at) / 1000 - race.time;
    if (behind > 0.1) loop.catchUp(behind);
  }

  const snaps = race.karts.map((k) => interpolate(k, alpha));
  const f = focus();
  // Mirror mode: the world's views are flipped in x, and the karts are drawn flipped to match (the podium stays as built).
  const flip = mirrored() && !podium;
  const m = flip ? -1 : 1;
  trackView!.group.scale.x = m;
  itemsView!.group.scale.x = m;
  hazardsView!.group.scale.x = m;
  const drawn = flip ? snaps.map((sn, i) => mirrorState(sn, (mirrorSnaps[i] ??= createKartState()))) : snaps;
  const s = drawn[race.karts.indexOf(f)];
  for (const g of ghosts) {
    ghostPose(g.run, Math.max(0, race.time - (1 - alpha) * PHYSICS_DT), g.state);
    g.view.update(g.state, 30, dt, elapsed);
  }
  if (podium) {
    podium.update(dt, elapsed, camera);
  } else if (intro > 0) {
    race.karts.forEach((k, i) => views[i].update(drawn[i], k.params.topSpeed, dt, elapsed, k.fallTime > 0));
    introCamera();
  } else {
    race.karts.forEach((k, i) => views[i].update(drawn[i], k.params.topSpeed, dt, elapsed, k.fallTime > 0));
    chase.update(s, f.params.topSpeed, player ? lastInput.lookBack : false, dt);
  }
  // Where the camera is in the world the simulation knows (the views are flipped, the camera isn't).
  const camWorld = flip ? new THREE.Vector3(-camera.position.x, camera.position.y, camera.position.z) : camera.position;
  document.body.classList.toggle('intro', intro > 0);
  const theme = trackView!.theme;
  const L = track.length;
  trackView!.update(elapsed, camWorld, theme.skyCycle ? Math.PI * 2 * clamp(f.distance / (L * race.laps), 0, 1) : 0, f.state);
  itemsView!.update(elapsed, race.karts.map((k, i) => ({ state: snaps[i], holder: k })));
  hazardsView!.update(elapsed);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);
  // The shadow camera follows the kart on screen.
  sun.target.position.set(s.x, s.y, s.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  updateSounds(dt);

  const finished = f.finishTime !== null;
  hud.update(
    {
      kart: s,
      lap: f.laps.lap,
      totalLaps: race.laps,
      raceTime: f.finishTime ?? Math.max(0, race.time),
      lapTimes: f.lapTimes,
      racerName: f.racer.name,
      engineClass: choice.engine,
      trackName: gp && !gp.finished ? `${track.def.name} · race ${gp.round + 1}/${gp.tracks.length}${gp.rivals.length ? ` · vs ${gp.rivals.map((r) => r.name).join(' & ')}` : ''}` : ghosts.length ? `${track.def.name} · ${ghosts.map((g) => `${g.label} ${formatTime(g.run.total)}`).join(' · ')}` : `${track.def.name}${mirrored() ? ' · Mirror' : ''}`,
      autoAccelerate: input.autoAccelerate,
      finished,
      paused: loop.paused && !frozen && !hud.confirmingRestart,
      pausedBy,
      online: !!online,
      ghostGap: (() => {
        const g = rivalGhost();
        const gap = g && player ? ghostGap(g, player) : null;
        return g && gap !== null ? { label: g.label === 'you' ? 'your best' : g.label, gap } : null;
      })(),
      position: f.position,
      karts: race.karts.length,
      countdown: intro > 0 ? -1 : -race.time,
      intro: intro > 0 ? { name: track.def.name, sub: gp ? `Race ${gp.round + 1} of ${gp.tracks.length}${gp.rivals.length ? ` · your rivals: ${gp.rivals.map((r) => r.name).join(' and ')}` : ''}${mirrored() ? ' · Mirror' : ''}` : choice.mode === 'timeTrial' ? 'Time Trial' : `${choice.engine}${mirrored() ? ' · Mirror' : ''}` } : null,
      table: table(),
      muted: musicMuted,
      sfxMuted,
      item: player?.item ?? null,
      rolling: player?.rolling ?? 0,
      spare: player?.spare ?? null,
      surge: player ? surgeCloseness(player) : null,
      style: style && player ? { score: style.score, chain: style.chainLeft > 0 ? style.chain : 0 } : null,
      splits,
    },
    elapsed,
  );
  hud.minimap.draw(race.karts.map((k, i) => ({ x: snaps[i].x, z: snaps[i].z, color: hex(k.racer.color), player: k === player, rival: k.rival })));
  // Heat haze shimmers hardest on the straights; the kaleidoscope runs on the player's final lap.
  const straight = 1 - clamp(track.main.maxCurvature(f.progressS, f.progressS + 80) * 25, 0, 1);
  const hazeTarget = podium ? 0 : theme.haze * (0.3 + 0.7 * straight);
  const finalLap = mode === 'race' && player !== null && player.finishTime === null && intro === 0 && race.laps > 1 && player.laps.lap === race.laps - 1;
  fx.haze += (hazeTarget - fx.haze) * damp(2, frameDt);
  fx.kaleido += ((finalLap ? 1 : 0) - fx.kaleido) * damp(1.5, frameDt);
  // The Rattlesnake video's look: full for the flyover and behind the title and menus, on tape through the race, a bite when hit.
  const look = VHS_LEVELS[settings().videoLook];
  const attract = !player && mode !== 'podium';
  const flyover = intro > 0;
  const moment = flyover ? 'flyover' : attract ? 'attract' : finalLap ? 'finalLap' : mode === 'race' ? 'race' : 'other';
  fx.bite = Math.max(0, fx.bite - frameDt * 1.6);
  fx.vhs += (look.vhs[moment] + fx.bite * 0.8 - fx.vhs) * damp(8, frameDt);
  fx.duo += (look.duo[moment] + fx.bite * look.bite - fx.duo) * damp(8, frameDt);
  fx.box += ((flyover && look.vhs.flyover > 0 ? 1 : 0) - fx.box) * damp(6, frameDt);
  // Under water: the camera is below a dive's surface.
  const submerged = trackView!.dives.some((p) => camWorld.y < WATER_LEVEL && inPit(p, camWorld.x, camWorld.z));
  fx.water += ((submerged ? 1 : 0) - fx.water) * damp(6, frameDt);
  underwaterFog(fx.water);
  music.setMuffle(fx.water);
  if (drawGallery(frameDt)) return;
  const beat = music.beatPhase();
  postFx.render(scene, camera, { haze: fx.haze, kaleido: fx.kaleido, beat: beat >= 0 ? beat : (elapsed * 2.4) % 1, time: elapsed, vhs: fx.vhs, duo: fx.duo, box: fx.box, palette: theme.duotone, water: fx.water });
});

/** The podium's extra line: the trophy and what it unlocked. */
let cupNote = '';

/** The panel for the results, cup standings and podium screens. */
function table(): Table | null {
  const kartRow = (k: RaceKart, i: number): TableRow => ({
    place: ordinal(i + 1),
    name: k.racer.name,
    color: hex(k.racer.color),
    value: k.finishTime === null ? '...' : formatTime(k.finishTime),
    extra: k.rival ? 'RIVAL' : undefined,
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
        extra: [mode === 'standings' && e.gained ? `+${e.gained}` : '', gp!.rivals.includes(e.racer) ? 'RIVAL' : ''].filter(Boolean).join(' ') || undefined,
        player: e.racer === choice.racer,
      }));
  if (mode === 'results') {
    const title = online ? `ROOM ${online.client.code} RESULTS` : gp ? `RACE ${gp.round + 1}/${gp.tracks.length} RESULTS` : choice.mode === 'timeTrial' ? 'TIME TRIAL' : 'RESULTS';
    const rows = online ? onlineRows(kartRow) : finishOrder().map(kartRow);
    return { kind: 'results', title, note: trialNote || undefined, rows };
  }
  if (mode === 'standings' && gp) {
    const next = gp.finished ? 'Final standings' : `Next: ${TRACK_LIST[gp.trackIndex].name}`;
    return { kind: 'cup', title: 'CUP STANDINGS', note: next, rows: cupRows(gp.entries.length) };
  }
  if (mode === 'podium' && gp) {
    const champ = gp.standings()[0];
    const me = gp.standings().findIndex((e) => e.racer === choice.racer) + 1;
    const note = `${champ.racer === choice.racer ? `You win the ${chosenCup(choice).name}!` : `You finished ${ordinal(me)}`}${cupNote ? ` · ${cupNote}` : ''}`;
    return { kind: 'podium', title: `${champ.racer.name.toUpperCase()} WINS!`, note, rows: cupRows(3) };
  }
  return null;
}

/** The room's results once it calls them (with players' names); until then, as things stand here. */
function onlineRows(kartRow: (k: RaceKart, i: number) => TableRow): TableRow[] {
  const s = online!.client.state;
  const results = s?.start?.race === online!.start.race ? s.results : null;
  if (!results) return finishOrder().map(kartRow);
  const me = identity().playerId;
  return results.map((r, i) => {
    const racer = RACERS.find((x) => x.id === r.racerId) ?? RACERS[0];
    const member = r.playerId ? s!.members.find((m) => m.playerId === r.playerId) : undefined;
    return {
      place: ordinal(i + 1),
      name: member ? `${member.name} (${racer.name})` : racer.name,
      color: hex(racer.color),
      value: r.time === null ? '-' : formatTime(r.time),
      player: r.playerId === me,
    };
  });
}

/** Karts by finishing place, unfinished ones by where they are now. */
function finishOrder(): RaceKart[] {
  return [...race.karts].sort((a, b) => a.position - b.position);
}

/** Stores a Time Trial run and describes it against the best so far. */
function saveTrial(total: number, bestLap: number, racerId: string): string {
  const key = `gizzracer.tt.${recordId(track.def.id)}.${choice.engine}.v${PHYSICS_VERSION}`;
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

/** Sends a finished Time Trial to the online leaderboard and adds the outcome to the results note (asking for a name first, once). */
function postTrial(p: RaceKart): void {
  if (!recorder) return;
  const run = recorder.finish(p.racer.id, p.finishTime!);
  const laps = p.lapTimes.slice();
  const trackId = track.def.id;
  const engine = choice.engine;
  const local = trialNote;
  namePrompt.ask('your run', () => {
    trialNote = `${local} · posting...`;
    uploadRun(trackId, engine, laps, run)
      .then((r) => (trialNote = `${local} · ${r.best ? 'posted! ' : ''}online #${r.rank}`))
      .catch((err: Error) => (trialNote = `${local} · not posted: ${err.message}`));
  });
}

/** Back to the picker, with the attract race on the picker's track. */
function toMenu(): void {
  gp = null;
  endPodium();
  setMode('menu');
  if (track.def.id !== menuTrack().id) loadTrack(menuTrack());
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
    // First time on a phone: drag or tilt? Asked once, saved.
    // Only where tilt is possible; otherwise it's drag steering and nothing to ask.
    if (touch.enabled && !settings().steeringChosen && tilt.available) settingsScreen.askSteering(() => updateSettings({ steeringChosen: true }));
    if (linkedRoom) {
      menu.choice.mode = choice.mode = 'online';
      setMode('lobby');
      lobby.joinCode(linkedRoom);
    }
    return true;
  }
  if (mode === 'results' && online) {
    backToLobby();
    return true;
  }
  if (mode === 'results') {
    if (!gp) {
      toMenu();
      return true;
    }
    gp.record(finishOrder().map((k) => k.racer), choice.racer);
    setMode('standings');
    return true;
  }
  if (mode === 'standings') {
    if (gp?.finished) {
      cupNote = finishCup();
      startPodium();
    } else startRace(true);
    return true;
  }
  if (mode === 'podium') {
    toMenu();
    return true;
  }
  return false;
}

/** Who paused an online race, for the pause screen ('' offline). */
let pausedBy = '';
/** An online pause or resume sent and not yet echoed by the room. */
let pendingPause: boolean | null = null;

function setPaused(paused: boolean): void {
  loop.paused = paused;
  touch.setVisible(!paused);
}

/** Offline, pause at once. Online, ask the room: it pauses (and resumes) everyone. */
function requestPause(paused: boolean): void {
  if (!online) return setPaused(paused);
  if (pendingPause === paused) return;
  pendingPause = paused;
  online.client.send({ t: 'pause', paused });
}

lobby.onRoomState = (s) => {
  if (!online) return;
  // The room went back to its lobby (the host, or a server restart): so do we.
  if (s.phase === 'lobby' && (mode === 'race' || mode === 'results')) return backToLobby();
  // GO moves back by any pause; keep the latest.
  if (s.start && s.start.race === online.start.race) online.start = s.start;
  pendingPause = null;
  pausedBy = s.pause?.name ?? '';
  if ((mode === 'race' || mode === 'results') && loop.paused !== !!s.pause) setPaused(!!s.pause);
};

/** After an online race, back to the room's lobby with the attract race behind it. */
function backToLobby(): void {
  // Don't leave the room paused behind us.
  if (online && loop.paused) online.client.send({ t: 'pause', paused: false });
  // Leaving mid-race: a CPU takes my kart at the room.
  if (online && player && player.finishTime === null) online.client.send({ t: 'quit' });
  online = null;
  pausedBy = '';
  setPaused(false);
  setMode('lobby');
  lobby.backToLobby();
  startRace(false);
}

/** Whether the pause menu was up when a restart was asked for, so declining goes back to it rather than the race. */
let restartFromPause = false;

hud.onPauseAction = (action) => {
  if (action === 'resume') {
    requestPause(false);
  } else if (action === 'restart') {
    // An online race runs on the room's clock: no restarts. Offline, ask first: R is next to nothing mid-race.
    if (online || hud.confirmingRestart) return;
    restartFromPause = loop.paused;
    setPaused(true);
    hud.confirmRestart(true);
  } else if (action === 'restartNow') {
    hud.confirmRestart(false);
    startRace(true);
  } else if (action === 'keepRacing') {
    hud.confirmRestart(false);
    if (!restartFromPause) setPaused(false);
  } else if (action === 'settings') {
    settingsScreen.open();
  } else if (action === 'quit') {
    if (online) backToLobby();
    else toMenu();
  }
};

// iOS only lets audio start inside a touch, and is strictest about touchend.
// Fullscreen and the landscape lock also need a gesture.
window.addEventListener(
  'touchend',
  () => {
    music.unlock();
    screenFit.enter();
    if (settings().tilt && !tilt.running) void tilt.start();
  },
  { passive: true },
);
window.addEventListener('pointerup', (e) => {
  if (settingsScreen.visible) return;
  if ((e.target as HTMLElement).closest('.settings, .hud-title-settings, .lobby, .board, .savetrack, .nameprompt')) return music.unlock();
  if (skipIntro()) return;
  if ((e.target as HTMLElement).closest('.menu, .touch, .hud-pause')) return music.unlock();
  advance();
});

window.addEventListener('keydown', (e) => {
  if (settingsScreen.visible) {
    if (e.code === 'Escape') {
      settingsScreen.close();
      // That Escape closes Settings; it isn't also a pause toggle.
      input.consumePause();
    }
    return;
  }
  if (advance()) return;
  if (!e.repeat && skipIntro()) return;
  if (menu.key(e.code)) return;
  if (e.repeat || mode !== 'race') return;
  if (hud.confirmingRestart) {
    if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') hud.onPauseAction?.('restartNow');
    else if (e.code === 'Backspace') hud.onPauseAction?.('keepRacing');
    return;
  }
  if (loop.paused) {
    if (e.code === 'KeyR') hud.onPauseAction?.('restart');
    else if (e.code === 'Backspace') hud.onPauseAction?.('quit');
    return;
  }
  if (e.code === 'KeyR') hud.onPauseAction?.('restart');
  else if (e.code === 'KeyM') updateSettings({ autoAccelerate: !settings().autoAccelerate });
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
    /** Moves the chase camera (trying placements): any of distance, height, lookAhead, lookHeight, fov. */
    camera(placement: Partial<CameraPlacement>) {
      Object.assign(chase.placement, placement);
      chase.snap();
    },
    /** Camera height, how far under water the view is, and how many dives the track has (testing). */
    get view() {
      return { camY: camera.position.y, water: fx.water, dives: trackView?.dives.length ?? 0 };
    },
    /** The kart views (testing animations). */
    get views() {
      return views;
    },
    get mode() {
      return mode;
    },
    /** The renderer, scene and sun (testing). */
    get three() {
      return { renderer, scene, sun, camera, postFx };
    },
    /** The sun shadow setup (testing): on, and how many meshes cast and receive. */
    get shadows() {
      let cast = 0;
      let receive = 0;
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.castShadow) cast++;
        if (o.receiveShadow) receive++;
      });
      return { enabled: renderer.shadowMap.enabled, sunCasts: sun.castShadow, cast, receive, frustum: sun.shadow.camera.right, mapSize: sun.shadow.mapSize.x };
    },
    /** Online race clock check: room offset, round trip, and seconds to GO by the room's clock. */
    get online() {
      const snap = online?.net?.latest;
      return online && { offset: online.client.offset, rtt: online.client.rtt, toGo: (online.start.at - online.client.serverNow()) / 1000, raceTime: race.time, roomTime: snap?.t, roomLaps: snap?.lap, roomFin: snap?.fin };
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
    /** Picks the player's racer by id for the next race (testing). */
    pick(id: string) {
      choice.racer = RACERS.find((r) => r.id === id) ?? choice.racer;
    },
    race_: (trackIndex: number) => {
      choice.track = trackIndex;
      setMode('menu');
      loadTrack(TRACK_LIST[trackIndex]);
      startRace(true);
    },
  },
});

loadTrack(TRACK_LIST[choice.track]);
setMode('title');
loop.start();
