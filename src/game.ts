import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { InputManager, NEUTRAL_INPUT, type InputFrame } from './core/input';
import { FixedLoop, PHYSICS_DT } from './core/loop';
import { clamp, damp, lerp, lerpAngle } from './core/math';
import { CPU_SKILL, CpuDriver, DIFFICULTY_PACE, rivalSkill, withDifficulty } from './ai/cpuDriver';
import { MusicPlayer } from './audio/music';
import { LiveRadio } from './audio/radio';
import { chosenShow, setShows } from './audio/shows';
import { MiniPlayer } from './ui/miniPlayer';
import { HintsTicker } from './ui/hints';
import { Sfx } from './audio/sfx';
import { DEADSTICK_CUE, STORY_BOSS_SONGS, STORY_SONGS, TRACK_SONGS, remixCues } from './audio/songs';
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
import { ACTS, CLEAR_PLACE, SKILL_STAGE, STAGES_PER_ACT, StoryRun, type BoonId } from './core/story';
import { DEADSTICK_LAUNCH, DEADSTICK_RUNUP, DEADSTICK_SHOTS, DEADSTICK_SHOT_TIME, planDeadstick, type DeadstickPlan, type SkillKind } from './core/skills';
import { SkillScreen, type SkillResult } from './ui/skillScreen';
import { StoryScreen, hearts, practiceCard, practiceRulesCard, storyCard, type StoryPhase } from './ui/storyScreen';
import { Race, TOUCH_CPU_PACE, ordinal, type RaceKart } from './core/race';
import { ASSIST_NORMAL, ASSIST_TOUCH } from './physics/steerAssist';
import { DRIFT_TIERS, PHYSICS_VERSION, copyKartState, createKartState, driftTier, respawnKart, type KartState, type StepEvents } from './physics/kart';
import { FIELD_SIZE, RACERS, pickRivals, type RacerDef } from './physics/racers';
import type { HazardKind } from './items/hazards';
import { ITEMS, type ItemHolder, type ItemKind } from './items/items';
import { ChaseCamera, DEFAULT_PLACEMENT, type CameraPlacement } from './render/chaseCamera';
import { HazardsView, ItemsView } from './render/itemViews';
import { KartView, setDustColor } from './render/kartView';
import { DETAIL_SPEC, setGraphicsDetail } from './render/detail';
import { PostFx } from './render/postfx';
import { DynamicResolution } from './render/resolution';
import { RacerGallery } from './render/gallery';
import { flareRingTexture, glowTexture, setTextureAnisotropy } from './render/textures';
import { WATER_LEVEL, buildTrackView, type TrackView } from './render/trackView';
import { TRACK_LIST, randomCupTracks } from './tracks/index';
import { findBends, nextBend, type Bend } from './tracks/turns';
import { pointAt } from './tracks/spline';
import { GEN_COMPLEXITY_MAX, GEN_LENGTHS, GEN_THEMES, generateTrack, trackId, type GenParams } from './tracks/generator';
import { Track, inPit, type TrackDef } from './tracks/track';
import { Hud, SURGE_HOP_WINDOW, formatTime, type Callout, type HudData, type Table, type TableAction, type TableRow } from './ui/hud';
import { Keyboard, SEAT_COLORS, SeatInput, remotePad, type RemotePad, type SeatSource } from './core/seatInput';
import { PartyScreen, type PartySeat } from './ui/party';
import { SeatHud } from './ui/seatHud';
import { seatPan, splitFov, splitRects } from './render/split';
import { deleteSaved, findSaved, saveTrack, savedTracks } from './core/savedTracks';
import { DAILY_SLOT, Menu, SKILL_LEVELS, SONG_SWITCH_LAPS, chosenCup, newSeed, racesToSongEnd, type MenuChoice } from './ui/menu';
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
/** Drops the resolution while frames run long, and brings it back once they don't. */
const resolution = new DynamicResolution();
let resolutionDetail = settings().detail;
const input = new InputManager();
const hud = new Hud(document.body);
const music = new MusicPlayer();
/** The live soundtrack (Settings > Soundtrack): a race's song live. */
const radio = new LiveRadio(music);
// The shows a Full set can play, for the picker and Settings.
void radio.shows().then(setShows);
const miniPlayer = new MiniPlayer(document.body, radio, music);
/** Whether the phone's music player paused the race, so closing it resumes. */
let playerPaused = false;
miniPlayer.onOpen = (open) => {
  if (open) {
    // A race offline stops while you pick a song (online the clock is the room's).
    if (mode === 'race' && !online && !loop.paused) {
      playerPaused = true;
      setPaused(true);
    }
  } else if (playerPaused) {
    playerPaused = false;
    if (mode === 'race' && loop.paused && !hud.confirmingRestart) setPaused(false);
  }
};
/** Controls, items and tips scrolling along the bottom of the picker and the flyover before a race. */
const hints = new HintsTicker(document.body);
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
 * Story goes results -> story (a card: a boon, a retry, the next chapter) -> next stage;
 * a skill game is played in 'skill' (or, the Deadstick Landing, in 'race').
 * Party mode goes menu -> party (the join screen) -> race -> results -> party.
 * Behind the title and the menu, CPUs race the chosen track as an attract mode.
 */
type Mode = 'title' | 'menu' | 'race' | 'results' | 'standings' | 'podium' | 'lobby' | 'story' | 'skill' | 'party';
let mode: Mode = 'title';

let choice: MenuChoice = {
  mode: 'grandPrix',
  track: 4,
  cup: 0,
  randomTracks: randomCupTracks(),
  gen: { slot: -1, params: { seed: newSeed(), theme: 'lagoon', complexity: 3, length: 'medium' } },
  racer: RACERS[0],
  engine: '100cc',
  mirror: false,
  switchEvery: 'never',
  generative: 'off',
  watch: false,
  skill: 'riff',
  skillLevel: 0,
};
/** Infinite mode: a race of laps without end. */
const INFINITE_LAPS = 1_000_000;
/** Infinite with a Full set, switching with each song: or after this many laps of a long one. */
const TOUR_SET_LAPS = 8;
/** Laps without end turn the sky over every this many laps. */
const SKY_LAPS = 3;
/** A race to the song's end lasts at least this long (s): a song ending sooner, it runs to the end of the next. */
const SONG_RACE_MIN = 60;
/** A race to the song's end with no song heard this long (s) into it goes back to laps. */
const SONG_WAIT = 15;
/**
 * Race to the song's end (the picker's Race to): `on` for a race set up so
 * (laps without end, no race times kept); `live` while it waits on the song,
 * the recording it's on (`key`) and how far in (`at`, s), `ended` once that
 * song ends (loops round, or the next comes on), `silent` for how long no song
 * has been heard (s); `over` once the song ended it.
 */
const songRace = { on: false, live: false, over: false, key: null as string | null, at: 0, ended: false, silent: 0 };
/** The cup in progress has had a race run to the song's end: no cup time to post. */
let gpSongRace = false;
/** Watching: how long (s) the camera stays on one racer before moving on. */
const WATCH_HOLD = 25;
/** Watching the CPUs race (Infinite, Watch): no kart of mine, the camera on `watchIndex`'s. */
let watching = false;
let watchIndex = 0;
let watchTimer = 0;
/** Which way the steering was held last tick, so a press switches once. */
let watchSteer = 0;
/** Infinite's generated track (Generative on or mix), null on the game's own. */
let infiniteGen: GenParams | null = null;
/** The Full set song the tour last moved on at. */
let tourSong: string | null = null;
/** The cup in progress, if racing a Grand Prix. */
let gp: GrandPrix | null = null;
/** The story run in progress, its card showing between races, and the boss's kart on a boss race. */
let story: StoryRun | null = null;
let storyPhase: StoryPhase = 'chapter';
let storyBoss: RaceKart | null = null;
/** Skill Games: the game played on its own, how hard (0..2, a story chapter's), and its draw (new each go). */
let practice: { kind: SkillKind; level: number; seed: number } | null = null;
/** The Deadstick Landing in progress: its ring, and the shots flown at it. */
interface Deadstick {
  plan: DeadstickPlan;
  ring: THREE.Group;
  shots: number;
  best: number;
  flying: boolean;
  /** Seconds into this shot, and seconds left before the next (or the end). */
  shotTime: number;
  wait: number;
  result: SkillResult | null;
}
let deadstick: Deadstick | null = null;
let podium: Podium | null = null;
/** The results screen's line under the title: a Time Trial's record, a race's style and best time. */
let trialNote = '';
/** The style meter for the race in progress (null in Time Trial and attract mode). */
let style: StyleMeter | null = null;
/** Time Trial: the gap to the ghost at each checkpoint passed, and the last checkpoint seen. */
let splits: { label: string; gap: number }[] = [];
let lastCheckpoint = -1;
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
/** The main road's bends, for the next-turn indicator. */
let bends: Bend[] = [];
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
/** A Nonagon Infinity is in earshot of you when it's this close (m). */
const SURGE_WARN = 120;
const snapshots = new Map<RaceKart, KartState>();

/**
 * A human at the wheel: the solo player, or one of Party mode's players.
 * Each has its own controls, camera, callouts and sounds (leaning to its
 * side of the screen). With more than one the screen splits
 * (render/split.ts) and each gets a SeatHud; one alone has the whole
 * screen, the full HUD and the main camera, as a solo race does.
 */
interface Seat {
  kart: RaceKart;
  /** 'P1'..'P4' in Party mode, '' for the solo player. */
  label: string;
  /** Party mode's controls for this seat; the solo player drives with `input`. */
  input: SeatInput | null;
  last: InputFrame;
  camera: THREE.PerspectiveCamera;
  chase: ChaseCamera;
  hud: SeatHud | null;
  pan: number;
  /** What the kart was doing last tick, to turn changes into sounds. */
  heard: { count: number; lap: number; tier: number; rolling: boolean };
  /** Seconds driving against the track. */
  wrongWay: number;
  /** The shortcut it was last on, so a new one is noticed once. */
  lastBranch: number;
}
let seats: Seat[] = [];
/** The keyboard as Party mode's seats read it: a half each. */
const keyboard = new Keyboard();
/** Party mode: who's playing (from the join screen), and whether this race is theirs. */
let partySeats: PartySeat[] | null = null;
let partyOn = false;
/** Phones driving Party seats: their buttons as last sent, by id. */
const remotes = new Map<string, RemotePad>();
/** Party mode: the time each seat crossed the line is in its kart; this is when the results come anyway, for a straggler. */
const PARTY_GRACE = 30;

/** The screen is split: Party mode with more than one player. */
function split(): boolean {
  return seats.length > 1;
}

function seatFlash(seat: Seat, text: string): void {
  if (seat.hud) seat.hud.flash(text);
  else hud.flash(text);
}

function seatCallout(seat: Seat, c: Callout): void {
  if (seat.hud) seat.hud.callout(c);
  else hud.callout(c);
}

function seatBite(seat: Seat): void {
  if (seat.hud) {
    if (settings().videoLook !== 'off') seat.hud.bite();
  } else bite();
}

/** The seat driving a kart, if a human is. */
function seatOf(k: ItemHolder | undefined): Seat | undefined {
  return k ? seats.find((s) => s.kart === k) : undefined;
}

/** How far (m) the nearest human is from a point, for sounds that fade with distance. */
function nearestSeat(x: number, z: number): number {
  let best = Infinity;
  for (const s of seats) best = Math.min(best, Math.hypot(x - s.kart.state.x, z - s.kart.state.z));
  return best;
}

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
    if (c.mode === 'party') {
      gp = null;
      story = null;
      practice = null;
      infiniteGen = null;
      return setMode('party');
    }
    gp = c.mode === 'grandPrix' ? new GrandPrix(defaultGrid(c.racer, fieldSeed), chosenCup(c).tracks) : null;
    story = c.mode === 'story' ? new StoryRun(fieldSeed) : null;
    gpTimes = [];
    gpPlaces = [];
    gpSongRace = false;
    cupNote = '';
    practice = c.mode === 'skills' ? { kind: c.skill, level: c.skillLevel, seed: newSeed() } : null;
    // Infinite starts on the picked track, or with Generative on (or mix, by the toss) a generated one.
    infiniteGen = null;
    if (c.mode === 'infinite' && c.generative !== 'off') chooseInfiniteTrack(0);
    if (story) showStory('chapter');
    else if (practice) playPractice();
    else startRace(true);
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
const party = new PartyScreen(document.body, () => choice.racer);
party.onBack = () => setMode('menu');
party.onStart = (joined) => {
  partySeats = joined;
  // A phone's buttons start from nothing held each race.
  for (const p of joined) if (p.source.kind === 'remote') remotes.set(p.source.id, remotePad());
  startRace(true);
};
const storyScreen = new StoryScreen(document.body);
const skillScreen = new SkillScreen(
  document.body,
  () => music.context,
  () => (sfxMuted ? 0 : settings().sfx),
);
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
  story = null;
  practice = null;
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
  // Back to the game's remixes: the live soundtrack lets go at once.
  const set = radio.playing?.mode === 'show';
  if (s.soundtrack === 'remix' && radio.playing) {
    radio.stop();
    liveRace = false;
    heldSong = false;
    music.play(mode === 'race' ? remixCues(raceMusic().lap) : remixCues('title'));
  } else if (s.soundtrack === 'show') {
    // A Full set picked, or another show: it plays at once, wherever you are, and stays.
    ensureSet();
  } else if (set) {
    // From a Full set to a song a race: this race's (or the menus') music now.
    radio.stop();
    if (mode === 'race') startRaceMusic();
    else menuMusic();
  }
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
  // Low draws at fewer pixels: on a phone that is most of the saving. A new level starts back at full resolution.
  if (s.detail !== resolutionDetail) {
    resolutionDetail = s.detail;
    resolution.reset();
  }
  applyPixelRatio();
  music.setVolume(s.music * MUSIC_LEVEL);
  sfx.setVolume(s.sfx);
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
  const rec = picking && !on && choice.mode !== 'online' && choice.mode !== 'infinite' && choice.mode !== 'story' && choice.mode !== 'skills' && choice.mode !== 'party';
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

/** The Detail level's pixel ratio, scaled down by dynamic resolution while frames are dropping. */
function applyPixelRatio(): void {
  const ratio = Math.min(window.devicePixelRatio, DETAIL_SPEC[settings().detail].pixelRatio) * resolution.scale;
  if (renderer.getPixelRatio() === ratio) return;
  renderer.setPixelRatio(ratio);
  fitRenderer();
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
  party.show(next === 'party');
  if (next !== 'story') storyScreen.show(null);
  if (next !== 'skill') skillScreen.stop();
  // A generated track can be kept once it's been raced.
  const generated = next === 'results' && choice.mode === 'generator' && !online;
  savePanel.show(generated ? track.def.name : null, generated && !!findSaved(choice.gen.params));
  touch.setVisible(next === 'race' && !watching && !partyOn);
  if (next !== 'race') {
    watching = false;
    document.body.classList.remove('watching');
  }
  loop.paused = false;
  if (next === 'title' || next === 'menu' || next === 'lobby' || next === 'party') menuMusic();
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
function generatedTrack(from: GenParams = choice.gen.params): TrackEntry {
  const params = { ...from };
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
  if (story) return storyTrack();
  if (practice?.kind === 'deadstick') return launchTrack(practice.level, practice.seed);
  if (choice.mode === 'infinite' && infiniteGen) return generatedTrack(infiniteGen);
  return choice.mode === 'generator' ? generatedTrack() : TRACK_LIST[choice.track];
}


/** A new track to generate: any world, shape and length. */
function randomGen(): GenParams {
  const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
  return { seed: newSeed(), theme: pick(GEN_THEMES), complexity: 1 + Math.floor(Math.random() * GEN_COMPLEXITY_MAX), length: pick(GEN_LENGTHS) };
}

/** Infinite's next track by its Generative setting: a generated one (on, or mix at a coin toss), else the game's own (`step` on from the last). */
function chooseInfiniteTrack(step: number): void {
  const g = choice.generative;
  const generate = g === 'on' || (g === 'mix' && Math.random() < 0.5);
  infiniteGen = generate ? randomGen() : null;
  if (!generate) choice.track = menu.choice.track = (choice.track + step) % TRACK_LIST.length;
}

/** CPUs drawn from the roster by `seed` fill the field; the player starts from PLAYER_SLOT. */
function defaultGrid(racer: RacerDef | null, seed: number): RacerDef[] {
  const grid = pickRivals(new Set(racer ? [racer.id] : []), racer ? FIELD_SIZE - 1 : FIELD_SIZE, seed);
  if (racer) grid.splice(Math.min(PLAYER_SLOT, grid.length), 0, racer);
  return grid;
}

/** Party mode's grid: the players side by side from PLAYER_SLOT, CPUs drawn by `seed` round them. */
function partyGrid(humans: RacerDef[], seed: number): RacerDef[] {
  const grid = pickRivals(new Set(humans.map((r) => r.id)), Math.max(0, FIELD_SIZE - humans.length), seed);
  grid.splice(Math.min(PLAYER_SLOT, grid.length), 0, ...humans);
  return grid;
}

/**
 * The humans for the race just set up: the solo player alone, with the main
 * camera and HUD; or Party mode's players, each with a camera and a HUD of
 * their own once there's more than one.
 */
function makeSeats(party: PartySeat[] | null): void {
  for (const s of seats) s.hud?.remove();
  const seat = (kart: RaceKart, label: string, input: SeatInput | null, own: boolean, pan: number): Seat => {
    const cam = own ? new THREE.PerspectiveCamera(DEFAULT_PLACEMENT.fov, 1, 0.1, 4000) : camera;
    return { kart, label, input, last: NEUTRAL_INPUT, camera: cam, chase: own ? new ChaseCamera(cam) : chase, hud: own ? new SeatHud(document.body, `${label} · ${kart.racer.name}`, SEAT_COLORS[Number(label.slice(1)) - 1]) : null, pan, heard: { count: 0, lap: 0, tier: 0, rolling: false }, wrongWay: 0, lastBranch: -1 };
  };
  if (party) {
    const own = party.length > 1;
    seats = party.flatMap((p, i) => {
      const kart = race.karts.find((k) => k.racer === p.racer && !k.isCpu);
      return kart ? [seat(kart, `P${i + 1}`, partyInput(p.source), own, seatPan(i, party.length))] : [];
    });
  } else seats = player ? [seat(player, '', null, false, 0)] : [];
}

/** A Party seat's controls: a half of the keyboard, a gamepad, or a phone (its buttons as the room last passed them on). */
function partyInput(source: SeatSource): SeatInput {
  return new SeatInput(source, keyboard, () => (source.kind === 'remote' ? (remotes.get(source.id) ?? null) : null));
}

function loadTrack(entry: TrackEntry): void {
  if (trackView) {
    scene.remove(trackView.group);
    trackView.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  track = new Track(entry.build());
  bends = findBends(track.main);
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
function startRace(withPlayer: boolean, keepSong = false, seamless = false): void {
  const net = withPlayer ? online : null;
  // Infinite's track switch runs straight on: every kart keeps its speed, the camera its racer (taken before the new track loads).
  const carry = seamless ? new Map(race.karts.map((k) => [k.racer.id, k.state.speed])) : null;
  const followed = seamless && watching ? race.karts[watchIndex]?.racer.id : undefined;
  if (withPlayer && !net && track.def.id !== raceTrack().id) loadTrack(raceTrack());
  // After the track loads: loading it starts the attract race, which isn't holding anything.
  heldSong = withPlayer && keepSong && !net;
  // A held live song that ends mid-race goes on into the rest of its show, not round again.
  if (withPlayer) music.setLiveEnd(heldSong ? () => void radio.playOnInShow() : null);
  const trial = withPlayer && !net && choice.mode === 'timeTrial';
  const infinite = withPlayer && !net && choice.mode === 'infinite';
  watching = infinite && choice.watch;
  document.body.classList.toggle('watching', watching);
  // The Deadstick Landing: the player alone, no items, flying at a ring.
  const solo = withPlayer && !net && skillStage()?.kind === 'deadstick';
  // Party mode: every player who joined drives a kart of their own.
  const party = withPlayer && !net && choice.mode === 'party' && partySeats?.length ? partySeats : null;
  partyOn = !!party;
  const toSongEnd = withPlayer && !net && racesToSongEnd(choice.mode);
  Object.assign(songRace, { on: toSongEnd, live: toSongEnd, over: false, key: null, at: 0, ended: false, silent: 0 });
  if (toSongEnd && gp) gpSongRace = true;
  race = new Race(track, net ? net.start.seed : raceSeed++, !trial && !solo, trial ? TRIAL_LAPS : infinite || toSongEnd ? INFINITE_LAPS : track.def.laps);
  endDeadstickRing();
  setupGhost(trial);
  player = null;
  trialNote = '';
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
    const boss = withPlayer && story?.race.boss ? story.bossRacer(choice.racer) : null;
    const humans = party ? party.map((p) => p.racer) : [choice.racer];
    const grid = !withPlayer ? defaultGrid(null, raceSeed) : watching ? defaultGrid(null, fieldSeed) : trial || solo ? [choice.racer] : gp ? gp.grid() : story ? storyGrid(boss) : party ? partyGrid(humans, fieldSeed) : defaultGrid(choice.racer, fieldSeed);
    storyBoss = null;
    for (const r of grid) {
      if (withPlayer && !watching && humans.includes(r)) {
        const k = race.addKart(r, choice.engine, null);
        // The first player's kart is `player`: the HUD, the music and the sky follow it.
        if (r === humans[0]) player = k;
        if (story) storyBoons(k, story);
      } else {
        // A Grand Prix rival, or a story boss, drives a touch sharper and wears the name.
        const rival = withPlayer && ((!!gp && gp.rivals.includes(r)) || r === boss);
        // The difficulty setting shapes how every CPU drives, offline (online the room decides).
        const skill = withDifficulty(CPU_SKILL[choice.engine], settings().cpuDifficulty);
        const k = race.addKart(r, choice.engine, rival ? rivalSkill(skill) : skill);
        k.rival = rival;
        if (r === boss) storyBoss = k;
      }
    }
    // The CPUs ahead hold back a little for the player (Race.rubberBand), never for a ghost or the attract mode. In Party mode, for the one at the back (step).
    race.focus = withPlayer && !trial ? player : null;
  }
  style = withPlayer && !net && !trial && !watching && !party ? new StyleMeter() : null;
  makeSeats(party);
  if (carry) {
    for (const k of race.karts) {
      const v = carry.get(k.racer.id);
      if (v !== undefined) k.state.speed = k.prev.speed = v;
    }
  }
  if (watching) {
    const same = race.karts.findIndex((k) => k.racer.id === followed);
    watchIndex = same >= 0 ? same : Math.floor(Math.random() * race.karts.length);
    if (same < 0) watchTimer = 0;
  }
  splits = [];
  lastCheckpoint = -1;
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
  for (const seat of seats) seat.chase.snap();
  // Straight ahead is however the phone is held as the race begins.
  if (withPlayer) tilt.recenter();
  intro = withPlayer && !net && !solo && !seamless ? INTRO_TIME : 0;
  if (solo && player) beginDeadstick(player);
  // Online, everyone's GO is the room's: count down to it on the room clock.
  if (net) race.time = Math.max(-10, -(net.start.at - net.client.serverNow()) / 1000);
  // Watching, the field goes as the flyover ends: no countdown to sit through.
  if (watching || seamless) race.time = 0;
  liveRace = false;
  if (withPlayer) {
    setMode('race');
    // Same song: the music from the results plays on, as it is.
    if (!heldSong) startRaceMusic();
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
  if (player) return player;
  if (watching && race.karts[watchIndex]) return race.karts[watchIndex];
  return race.karts.find((k) => k.position === 1)!;
}

/** Watching: the camera to the racer `dir` places behind (1) or ahead (-1) of the one it's on. */
function switchWatch(dir: number): void {
  const order = [...race.karts].sort((a, b) => a.position - b.position);
  const at = order.indexOf(race.karts[watchIndex]);
  watchIndex = race.karts.indexOf(order[(at + dir + order.length) % order.length]);
  watchTimer = 0;
  chase.snap();
}

/** Watching: ←/→ pick another racer; and every WATCH_HOLD seconds the camera moves on by itself, often to the leader. */
function watchStep(dt: number): void {
  const steer = Math.sign(Math.round(lastInput.steer));
  if (steer !== 0 && steer !== watchSteer) switchWatch(steer);
  watchSteer = steer;
  watchTimer += dt;
  if (watchTimer < WATCH_HOLD) return;
  const leader = race.karts.findIndex((k) => k.position === 1);
  if (Math.random() < 0.4 && leader !== watchIndex) {
    watchIndex = leader;
    watchTimer = 0;
    chase.snap();
  } else switchWatch(1 + Math.floor(Math.random() * (race.karts.length - 1)));
}

/**
 * Race to the song's end: follows the song playing (every frame, paused or
 * not) and notes when it ends: it loops back round, or another comes on.
 * Only the song the radio asked for counts, not the one before still
 * playing while it buffers.
 */
function watchSong(dt: number): void {
  if (!songRace.live || mode !== 'race') return;
  const p = radio.playing;
  const rec = music.live;
  const at = music.liveProgress()?.at;
  const key = p ? `${p.rec.id}/${p.rec.file}` : null;
  if (!rec || at === undefined || `${rec.id}/${rec.file}` !== key) {
    if (race.started) songRace.silent += dt;
    return;
  }
  songRace.silent = 0;
  if (songRace.key !== null && (key !== songRace.key || at < songRace.at - 2)) songRace.ended = true;
  songRace.key = key;
  songRace.at = at;
}

/** Race to the song's end: the song over (and the race long enough), everyone finishes where they are; no song to hear, it's laps again. */
function songRaceStep(p: RaceKart): void {
  const ended = songRace.ended;
  songRace.ended = false;
  if (!race.started || p.finishTime !== null) return;
  if (ended && race.time >= SONG_RACE_MIN) {
    songRace.live = false;
    songRace.over = true;
    race.endNow();
    sfx.finish();
    hud.flash("THE SONG'S OVER!");
  } else if (songRace.silent > SONG_WAIT) {
    // The stream won't play: race to the line after the leader's next lap, at least the track's own laps.
    songRace.live = false;
    race.laps = Math.max(track.def.laps, ...race.karts.map((k) => k.laps.lap + 1));
    hud.flash(`NO SONG: ${race.laps} LAPS`);
  }
}

/** Race to the song's end: what's left of the song that will end the race (s), for the HUD; null when that isn't known yet. */
function songLeft(): number | null {
  if (!songRace.live || songRace.key === null) return null;
  const p = music.liveProgress();
  if (!p || !p.length) return null;
  const left = Math.max(0, p.length - p.at);
  // A song ending before the race is long enough doesn't end it: the next one's length isn't known yet.
  return Math.max(0, race.time) + left >= SONG_RACE_MIN ? left : null;
}

/** Infinite's track switch: on to the next track once the leader (or I) has done its laps; Each song moves on with a Full set's songs instead. */
function tourStep(): boolean {
  const every = choice.switchEvery;
  if (every === 'never' || intro > 0) return false;
  const k = player ?? race.karts.find((x) => x.position === 1)!;
  if (k.laps.lap < (every !== 'song' ? every : setPlaying() ? TOUR_SET_LAPS : SONG_SWITCH_LAPS)) return false;
  nextTour();
  return true;
}

function nextTour(): void {
  chooseInfiniteTrack(1);
  // No flyover, title card or countdown: the race goes straight on, on the next track. The music follows the soundtrack setting as ever.
  startRace(true, false, true);
}

// A Full set's next song moves the tour on.
radio.onChange(() => {
  const set = radio.playing?.set;
  const key = set ? `${set.show.id}#${set.index}` : null;
  const moved = key !== null && tourSong !== null && key !== tourSong;
  if (key) tourSong = key;
  if (moved && mode === 'race' && choice.mode === 'infinite' && choice.switchEvery === 'song' && intro === 0 && !loop.paused) nextTour();
});

function step(dt: number): void {
  // Up fires the item, but with the glider open it climbs.
  input.gliding = !!player && player.state.glideTime > 0;
  lastInput = input.sample();
  // Mirror mode flips the world on screen, so left is right at the wheel too.
  if (mirrored() && (lastInput.steer !== 0)) lastInput = { ...lastInput, steer: -lastInput.steer };
  for (const seat of seats) {
    if (!seat.input) {
      seat.last = lastInput;
      continue;
    }
    seat.input.gliding = seat.kart.state.glideTime > 0;
    seat.last = seat.input.sample();
  }
  keyboard.endTick();
  if (mode === 'podium') return;
  if (intro > 0) {
    intro = Math.max(0, intro - dt);
    if (intro === 0) {
      chase.snap();
      for (const seat of seats) seat.chase.snap();
    }
    return;
  }
  // Online countdowns follow the room's clock, so a slow frame can't make anyone late to GO.
  if (online && race.time < 0) race.time = Math.min(0, -(online.start.at - online.client.serverNow()) / 1000) - dt;
  const net = player && online?.net;
  if (net) netStep(net, player!);
  if (player) {
    // On touch (a phone or tablet): a firmer hand on the wheel, and the CPUs a little slower. The difficulty sets their pace too.
    // A Party player on a phone gets the touch hand too.
    let touchSeat = false;
    for (const seat of seats) {
      const onTouch = seat.input ? seat.input.source.kind === 'remote' : touch.enabled;
      seat.kart.assist = settings().smartSteering;
      seat.kart.assistLevel = onTouch ? ASSIST_TOUCH : ASSIST_NORMAL;
      touchSeat ||= onTouch;
    }
    race.cpuPace = DIFFICULTY_PACE[settings().cpuDifficulty] * (touchSeat ? TOUCH_CPU_PACE : 1) * (story ? story.pace : 1);
    // Party: the CPUs ahead hold back for whoever is at the back.
    if (partyOn) race.focus = seats.filter((x) => x.kart.finishTime === null).sort((a, b) => a.kart.distance - b.kart.distance)[0]?.kart ?? null;
  }
  const inputs = race.karts.map((k) => seatOf(k)?.last);
  const events = race.step(dt, inputs);
  if (deadstick && player) deadstickStep(dt, events[race.karts.indexOf(player)]);
  events.forEach((ev, i) => {
    if (ev.landed > 3) views[i].impact(ev.landed);
    if (ev.wallHit > 0.2) views[i].collide(ev.wallHit);
    const k = race.karts[i];
    if (k.bump > 3) views[i].collide(Math.min(1.5, k.bump / 8), k.bumpX, k.bumpZ);
    // Back from a fall: through the Nonagon gate.
    if (k.respawned) views[i].restore(k.state);
  });
  // A new track mid-step: this step's events were the old race's.
  if (mode === 'race' && choice.mode === 'infinite' && !online && tourStep()) return;
  if (!player) {
    if (watching) watchStep(dt);
    // Attract mode: once someone wins, start another heat.
    else if (race.results.length > 0) startRace(false);
    return;
  }
  if (songRace.live) songRaceStep(player);
  style?.tick(dt);
  for (const seat of seats) sfx.at(seat.pan, () => seatStep(seat, events[race.karts.indexOf(seat.kart)], dt));
  checkSplit(player);
  // Record a little past the line so the ghost visibly crosses it.
  if (recorder && (player.finishTime === null || race.time - player.finishTime < GHOST_OVERRUN)) recorder.record(race.time, player.state);
  // The wave's alarm, faster as it closes on whoever it's after.
  let surge: number | null = null;
  for (const seat of seats) {
    const near = surgeCloseness(seat.kart)?.near;
    if (near !== undefined) surge = Math.max(surge ?? 0, near);
  }
  sfx.surgeAlarm(dt, surge);
  if (player.finishTime !== null && !raceRecorded) {
    raceRecorded = true;
    if (story) finishStoryRace(player);
    // Party races keep no records: whose would they be?
    else if (!online && choice.mode !== 'timeTrial' && !practice && !partyOn) finishRace(player);
  }
  if (mode === 'race' && partyOn) {
    if (partyOver()) setMode('results');
  } else if (mode === 'race' && player.finishTime !== null && race.time - player.finishTime > RESULTS_DELAY) {
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
  // Party: the music's final lap is the leading player's.
  updateMusic(partyOn ? leadSeat().kart : player);
}

/** Party mode's race is over for the screen: everyone's over the line (and had a moment), or the first did long enough ago. */
function partyOver(): boolean {
  const times = seats.map((s) => s.kart.finishTime);
  const done = times.filter((t): t is number => t !== null);
  if (!done.length) return false;
  if (done.length === times.length) return race.time - Math.max(...done) > RESULTS_DELAY;
  return race.time - Math.min(...done) > PARTY_GRACE;
}

/** The player furthest round the course. */
function leadSeat(): Seat {
  return seats.reduce((a, b) => (b.kart.distance > a.kart.distance ? b : a));
}

/** One human's tick: their camera's kicks, their sounds and callouts, laps and the wrong way. Their sounds lean to their side of the screen (sfx.at). */
function seatStep(seat: Seat, ev: StepEvents, dt: number): void {
  const p = seat.kart;
  const c = seat.chase;
  // Nothing scores after the flag: the autopilot's laps are not yours. Style is the solo player's.
  const st = p === player && p.finishTime === null ? style : null;
  if (ev.boostTier > 0) {
    c.bump(0.3 + ev.boostTier * 0.2);
    c.kick(3 + ev.boostTier * 3);
    st?.add(driftMove(ev.boostTier));
  }
  if (ev.glided) {
    c.bump(0.5);
    c.kick(5);
  }
  if (ev.trick) {
    c.bump(0.6);
    c.kick(4 + ev.trickStreak * 2);
    st?.add('trick', ev.trickStreak);
  }
  if (p.drafted) {
    sfx.slipstream();
    c.kick(6);
    st?.add('slipstream');
  }
  checkShortcut(seat);
  if (p.bump > 3) sfx.bump(Math.min(1, p.bump / 10));
  if (ev.wallHit > 0.3) c.bump(ev.wallHit);
  if (p.respawned) c.snap();
  playerSounds(seat, ev);
  if (race.time >= 0 && race.time - dt < 0 && p.launch) {
    seatFlash(seat, p.launch === 'rocket' ? 'ROCKET START!' : 'TOO EARLY!');
    if (p.launch === 'rocket') {
      sfx.rocket();
      c.kick(8);
      st?.add('rocket');
    } else {
      sfx.stall();
    }
  }
  checkWrongWay(seat, dt);
  // Sounds of someone else's doing nearby are played once, for the first seat: not once per player.
  const first = seat === seats[0];
  for (const e of race.events) {
    const mine = e.kart === p;
    if (e.type === 'pickup' && mine) sfx.pickup();
    if (e.type === 'box' && (mine || (first && !seatOf(e.kart)))) boxSound(mine, e.x, e.z, e.double);
    if (e.type === 'block' || e.type === 'dodge') {
      if (mine || e.from === p) seatCallout(seat, { from: who(e.from, seat), to: who(e.kart, seat), by: e.by, kind: e.type === 'block' ? 'blocked' : 'dodged' });
      if (mine) {
        if (e.type === 'block') sfx.block();
        else sfx.dodge();
        st?.add(e.type === 'block' ? 'block' : 'dodge');
      }
      continue;
    }
    if (e.type === 'bonus') {
      if (mine) {
        seatFlash(seat, BONUS_TEXT[e.by]);
        sfx.boost(2);
        st?.add('hazard');
      }
      continue;
    }
    if (e.type === 'use' && mine) {
      sfx.use(e.item);
      if (e.item === 'wooCannon') {
        seatFlash(seat, 'WOO CANNON!');
        c.bump(0.8);
      }
    } else if (e.type === 'use' && e.item === 'wooCannon' && first && !seatOf(e.kart)) {
      // Someone else's cannon going off nearby: you hear it too, fading with distance.
      const o = e.kart.state;
      const d = nearestSeat(o.x, o.z);
      if (d < 80) sfx.woo(0.6 * (1 - d / 80));
    }
    if (e.type !== 'hit') continue;
    const item = e.by in ITEMS ? (e.by as ItemKind) : null;
    if (mine) {
      seatFlash(seat, HIT_TEXT[e.by]);
      sfx.hurt(e.by);
      if (HIT_TEXT[e.by]) seatBite(seat);
      if (e.by !== 'tempoShift' && e.by !== 'bassDrop') c.bump(0.5);
      if (e.by === 'bassDrop') c.bump(1.2);
      if (item && e.from) seatCallout(seat, { from: who(e.from, seat), to: 'you', by: item, kind: 'took' });
    } else if (e.from === p && item) {
      // Area items hit a crowd: one line each, but only one flash and sound.
      seatCallout(seat, { from: 'you', to: who(e.kart, seat), by: item, kind: 'landed' });
      // The feed says who you hit; a sound is enough on top of it.
      if (e.by !== 'tempoShift' && e.by !== 'bassDrop') sfx.scored();
      st?.add('hit');
    }
  }
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

/** A racer's name for a seat's callouts: 'you', another player by seat, or the racer's name. */
function who(k: ItemHolder | undefined, seat: Seat | undefined = seats[0]): string {
  if (!k) return '?';
  if (seat ? k === seat.kart : k === player) return 'you';
  const other = seatOf(k);
  return other?.label ? other.label : (k as RaceKart).racer.name;
}

/** An item box breaking: loud when it's yours, fainter for someone else's nearby. */
function boxSound(mine: boolean, x: number, z: number, double: boolean): void {
  if (mine) {
    sfx.box(1, double);
    return;
  }
  if (!player) return;
  const d = seats.length ? nearestSeat(x, z) : Math.hypot(x - player.state.x, z - player.state.z);
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

/**
 * The next bend for the HUD: only racing, on the main road (a shortcut has
 * bends of its own), with the hints on. Mirrored, left is right.
 */
function turnHint(): HudData['turn'] {
  if (!player || !settings().turnIndicator || !race.started || player.finishTime !== null || player.branch >= 0) return null;
  const next = nextBend(bends, track.length, player.progressS);
  if (!next) return null;
  const { bend, distance } = next;
  return { dir: mirrored() ? (-bend.dir as -1 | 1) : bend.dir, angle: bend.angle, severity: bend.severity, distance };
}

/** A shortcut a player has just driven onto: style points, and noted in their progress. Quietly: no pop-up, no sting. */
function checkShortcut(seat: Seat): void {
  const p = seat.kart;
  const b = p.branch;
  if (b === seat.lastBranch) return;
  seat.lastBranch = b;
  if (b < 0 || !race.started || p.finishTime !== null) return;
  if (p === player) style?.add('shortcut');
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
  if (gp) {
    // By round, so a restarted race replaces its own entry.
    gpTimes[gp.round] = p.finishTime!;
    gpPlaces[gp.round] = p.position;
  }
  // Raced to the song's end: no race length to compare, so no best time or style to keep.
  if (songRace.on) {
    trialNote = [style?.summary(), `${p.laps.lap} lap${p.laps.lap === 1 ? '' : 's'} to the song`].filter(Boolean).join(' · ');
    return;
  }
  if (style) {
    parts.push(style.summary());
    if (recordStyle(track.def.id, choice.engine, style.score).best) parts.push('NEW STYLE BEST!');
  }
  const rec = recordRace(track.def.id, choice.engine, mirror, ms);
  parts.push(rec.best ? (rec.prevMs === null ? 'First race time set' : `BEST RACE! ${formatTime((rec.prevMs - ms) / 1000).replace(/^0:0?/, '-')}s`) : `Best race ${formatTime(rec.prevMs! / 1000)}`);
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

/**
 * A story race's verdict for the results. Nothing is recorded or posted:
 * boons change the kart, so its times aren't comparable.
 */
function finishStoryRace(p: RaceKart): void {
  const boss = storyBoss;
  const lost = story!.lives > 1 ? 'a life lost' : 'the loop ends';
  const parts = [story!.passes(p.position, boss?.position ?? null) ? 'CLEARED!' : boss ? `${boss.racer.name} beat you: ${lost}` : `Top ${CLEAR_PLACE} needed: ${lost}`];
  if (style) parts.push(style.summary());
  trialNote = parts.join(' · ');
}

/** The race intro's line in story mode: the chapter, the race or the boss, the lives. */
function storyIntro(run: StoryRun): string {
  const r = run.race;
  return `${run.actDef.chapter} · ${r.boss ? `Boss: ${run.bossRacer(choice.racer).name}, one on one` : `Race ${r.index + 1}`} · ${hearts(run.lives)}`;
}

/** A story race's track: a new one in the chapter's worlds, the boss's own, or one to fly the Deadstick Landing on. */
function storyTrack(): TrackEntry {
  const r = story!.race;
  if (r.skill === 'deadstick') {
    const id = story!.launchTrack;
    return TRACK_LIST.find((t) => t.id === id) ?? TRACK_LIST[0];
  }
  if (r.gen) {
    const params = r.gen;
    return { id: trackId(params), build: () => generateTrack(params) };
  }
  const id = story!.actDef.boss.trackId;
  return TRACK_LIST.find((t) => t.id === id) ?? TRACK_LIST[0];
}

/** The field for a story race: the run's CPUs, or the boss and the player alone for a boss duel. */
function storyGrid(boss: RacerDef | null): RacerDef[] {
  return boss ? [boss, choice.racer] : defaultGrid(choice.racer, fieldSeed);
}

/** The player's kart as the run's boons have made it. */
function storyBoons(k: RaceKart, run: StoryRun): void {
  run.applyBoons(k.baseParams);
  k.params = { ...k.baseParams };
  k.favour = run.favour;
  if (run.startItem) k.item = run.startItem;
}

/** Shows a story card between stages; `note` says how the last one went. */
function showStory(phase: StoryPhase, note = ''): void {
  storyPhase = phase;
  setMode('story');
  storyScreen.show(storyCard(story!, phase, choice.racer, note));
}

/** Scores the stage just played and shows what comes of it. */
function storyResult(passed: boolean, note = ''): void {
  const out = story!.record(passed);
  showStory(out === 'cleared' ? 'boon' : out, note);
}

/** On to the run's next stage, by way of the chapter's, the skill game's or the boss's card when one is due. */
function storyNext(): void {
  const run = story!;
  const r = run.race;
  if (run.actStart && storyPhase !== 'chapter') return showStory('chapter');
  if (r.skill && storyPhase !== 'skill') return showStory('skill');
  if (r.boss && storyPhase !== 'boss') return showStory('boss');
  // A skill game makes its own sound, and the Deadstick Landing flies to its own: no song carries into those.
  const keep = storySameSong && !r.skill;
  storySameSong = false;
  if (r.skill && r.skill !== 'deadstick') return startSkillScreen(r.skill, r.seed, r.act);
  startRace(true, keep);
}

/** Story mode's same song: picked on a race's results, the song plays on over the cards between to the next race. */
let storySameSong = false;

/** A skill game on its card over the game. */
function startSkillScreen(kind: SkillKind, seed: number, level: number): void {
  setMode('skill');
  // The game makes its own sound: the soundtrack waits (unless a Full set is playing).
  if (setPlaying()) ensureSet();
  else music.stop();
  skillScreen.start(kind, seed, level);
}

/** The skill game being played, a story stage's or Skill Games', with its draw and how hard. */
function skillStage(): { kind: SkillKind; seed: number; level: number } | null {
  const r = story?.race;
  if (r?.skill) return { kind: r.skill, seed: r.seed, level: r.act };
  return practice;
}

/** Skill Games: the game picked, on its card or (the Deadstick Landing) on a track. */
function playPractice(): void {
  const p = practice!;
  if (p.kind !== 'deadstick') return startSkillScreen(p.kind, p.seed, p.level);
  // Its rules first, on a card (the card games show theirs over the game).
  setMode('story');
  storyScreen.show(practiceRulesCard(p.kind, SKILL_LEVELS[p.level], p.level));
}

/** A skill game's over: on with the story, or Skill Games' result. */
function skillDone(r: SkillResult): void {
  if (story) return storyResult(r.passed, r.note);
  if (!practice) return;
  setMode('story');
  storyScreen.show(practiceCard(practice.kind, SKILL_LEVELS[practice.level], r));
}

/** A track to fly the Deadstick Landing on: one of a chapter's, by the draw. */
function launchTrack(level: number, seed: number): TrackEntry {
  const list = ACTS[level].launchTracks;
  const id = list[seed % list.length];
  return TRACK_LIST.find((t) => t.id === id) ?? TRACK_LIST[0];
}

skillScreen.onDone = (r) => {
  if (!story && !practice) return;
  menuMusic();
  skillDone(r);
};

/** Puts the ring on the road past the launcher and the player on the run-up. */
function beginDeadstick(p: RaceKart): void {
  const stage = skillStage()!;
  const plan = planDeadstick(track, stage.seed, stage.level);
  if (!plan) {
    // A track with nowhere to land: nothing to fly, so nothing lost.
    hud.flash('NO RAMP HERE');
    return;
  }
  const ring = new THREE.Group();
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
  const band = new THREE.Mesh(new THREE.RingGeometry(plan.radius - 1.2, plan.radius, 48), gold);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xff5ad0, side: THREE.DoubleSide, depthWrite: false }));
  for (const m of [band, eye]) {
    m.rotation.x = -Math.PI / 2;
    ring.add(m);
  }
  eye.position.y = 0.02;
  // A tall beam and a hoop over the ring, so it can be seen from the run-up.
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), glow);
  beam.position.y = 30;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(plan.radius, 0.35, 8, 48), glow);
  hoop.position.y = 9;
  hoop.rotation.y = Math.atan2(plan.target.x - track.respawnPose(plan.launchS).x, plan.target.z - track.respawnPose(plan.launchS).z);
  ring.add(beam, hoop);
  ring.position.set(plan.target.x, plan.target.y + 0.15, plan.target.z);
  scene.add(ring);
  deadstick = { plan, ring, shots: 0, best: Infinity, flying: false, shotTime: 0, wait: 0, result: null };
  placeShot(p, false);
}

/** The player back on the run-up: standing for the countdown, or rolling for the next shot. */
function placeShot(p: RaceKart, rolling: boolean): void {
  const d = deadstick!;
  const pose = track.respawnPose(d.plan.launchS - DEADSTICK_RUNUP);
  respawnKart(p.state, pose.x, pose.y, pose.z, pose.heading);
  p.state.speed = rolling ? p.params.topSpeed : 0;
  copyKartState(p.state, p.prev);
  chase.snap();
  d.flying = false;
  d.shotTime = 0;
  hud.flash(`SHOT ${d.shots + 1} OF ${DEADSTICK_SHOTS}: HOP ON THE RAMP`);
}

/** Watches the shot in the air and scores where it comes down. */
function deadstickStep(dt: number, ev: StepEvents | undefined): void {
  const d = deadstick!;
  const p = player!;
  if (d.wait > 0) {
    d.wait -= dt;
    if (d.wait > 0) return;
    if (d.result) return endDeadstick();
    return placeShot(p, true);
  }
  if (!race.started) return;
  d.shotTime += dt;
  if (ev?.launched) {
    d.flying = true;
    // A harder throw than a race's ramp: a long flight before the landing.
    p.state.vy *= DEADSTICK_LAUNCH.lift;
    p.state.speed *= DEADSTICK_LAUNCH.speed;
  }
  const next = () => {
    if (d.shots < DEADSTICK_SHOTS) d.wait = 1.4;
    else finish(false);
  };
  const finish = (passed: boolean) => {
    d.result = { passed, note: passed ? `Down in the ring, ${d.best.toFixed(1)} m from the middle` : d.best < Infinity ? `Closest: ${d.best.toFixed(1)} m from the middle (the ring is ${d.plan.radius} m)` : 'Never got off the ramp' };
    d.wait = 1.8;
    if (passed) sfx.fanfare();
  };
  if (d.flying && p.state.grounded) {
    const off = Math.hypot(p.state.x - d.plan.target.x, p.state.z - d.plan.target.z);
    d.shots++;
    d.best = Math.min(d.best, off);
    if (off <= d.plan.radius) {
      hud.flash('BULLSEYE!');
      finish(true);
    } else {
      hud.flash(`${off.toFixed(1)} M OFF`);
      next();
    }
  } else if (!d.flying && d.shotTime > DEADSTICK_SHOT_TIME) {
    d.shots++;
    hud.flash('MISSED THE RAMP');
    next();
  }
}

/** Takes the ring away. */
function endDeadstickRing(): void {
  if (!deadstick) return;
  scene.remove(deadstick.ring);
  dispose(deadstick.ring);
  deadstick = null;
}

/** The Deadstick Landing's done: on to the story's card. */
function endDeadstick(): void {
  const r = deadstick!.result!;
  endDeadstickRing();
  skillDone(r);
}

storyScreen.onPick = (id) => {
  if (practice) {
    if (id === 'play') return startRace(true);
    if (id !== 'again') return toMenu();
    // Another go, a new draw.
    practice.seed = newSeed();
    return playPractice();
  }
  if (!story) return;
  if (id === 'menu') return toMenu();
  if (id === 'again') {
    story = new StoryRun(Math.floor(Math.random() * 2 ** 31));
    return showStory('chapter');
  }
  if (storyPhase === 'boon') story.take(id as BoonId);
  storyNext();
};

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
  // A race run to the song's end has no time to compare: the trophy stands, the online cup board doesn't get it.
  if (gpSongRace) return parts.join(' · ');
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
  smog: 'CHOKED!',
  airlocks: 'LOCKED OUT!',
  flares: 'SCORCHED!',
  rats: 'INFESTED!',
  eyes: 'MIND READ!',
  arrows: 'ZAPPED!',
  sheets: 'WRAPPED!',
  fuzz: 'CLIPPED!',
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
  smog: 'UP IN SMOKE!',
  airlocks: 'SLIPPED THROUGH!',
  flares: 'SOLAR WIND!',
  rats: 'RAT RACE!',
  eyes: 'ONE STEP AHEAD!',
  arrows: 'NOT THERE!',
  sheets: 'LINED UP!',
  fuzz: 'RIDE THE FUZZ!',
};

/** Takes a group out of the scene and frees what it built. */
function dispose(group: THREE.Group): void {
  scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
}

/** Countdown beeps, laps, drift sparks, hops, landings and the like for a player's kart. */
function playerSounds(seat: Seat, ev: StepEvents): void {
  const p = seat.kart;
  const heard = seat.heard;
  const count = race.time < 0 ? Math.ceil(-race.time) : 0;
  if (count !== heard.count) {
    // The countdown is everyone's: heard once.
    if (seat === seats[0]) {
      if (count > 0) sfx.countdown(false);
      else if (heard.count === 1) sfx.countdown(true);
    }
    heard.count = count;
  }
  if (p.laps.lap !== heard.lap) {
    if (p.finishTime !== null) {
      sfx.finish();
      if (seat.hud) seatFlash(seat, `FINISH! ${ordinal(p.position)}`);
    } else if (p.laps.lap > heard.lap) {
      const final = p.laps.lap === race.laps - 1;
      sfx.lap(final);
      seatFlash(seat, final ? 'FINAL LAP!' : `LAP ${p.laps.lap + 1}`);
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
function checkWrongWay(seat: Seat, dt: number): void {
  const p = seat.kart;
  const s = p.state;
  const a = pointAt(track.spline, p.progressS);
  const along = Math.sin(s.heading) * a.tx + Math.cos(s.heading) * a.tz;
  const backwards = race.started && p.finishTime === null && s.speed > 4 && along < -0.3 * Math.hypot(a.tx, a.tz);
  seat.wrongWay = backwards ? seat.wrongWay + dt : 0;
  if (seat.wrongWay > 1 && (seat.wrongWay - 1) % 1.5 < dt) seatFlash(seat, 'WRONG WAY!');
}

/** How hard the tires squeal, 0..1: always in a drift, and on hard turns at speed. Dirt doesn't squeal. */
function tireScreech(s: KartState, speedRatio: number): number {
  if (!s.grounded || s.surface === 'offroad' || Math.abs(s.speed) < 8 || s.spinTime > 0) return 0;
  if (s.driftDir !== 0) return 0.6 + 0.4 * Math.min(1, Math.abs(s.slip) * 2);
  return clamp((Math.abs(s.steer) * speedRatio - 0.55) / 0.4, 0, 1) * 0.55;
}

/** Engine note, tire squeal and hazard ambience, every frame. */
function updateSounds(dt: number): void {
  if (split()) return partySounds(dt);
  const p = player;
  const racing = mode === 'race' && !loop.paused && p !== null;
  const s = p?.state;
  const speedRatio = s ? Math.abs(s.speed) / p!.baseParams.topSpeed : 0;
  sfx.updateEngine(racing ? 1 : 0, speedRatio, !!s && s.boostTime > 0, !!s && s.driftDir !== 0, s ? tireScreech(s, speedRatio) : 0);
  // Party's other engines, quiet once it's over.
  sfx.quietEngines(1);
  // The drift's charge sings higher toward purple; a draft whistles as it builds.
  sfx.driftCharge(racing && s && s.driftDir !== 0 ? Math.min(1, s.driftCharge / DRIFT_TIERS[DRIFT_TIERS.length - 1]) : 0);
  sfx.draft(racing && p ? p.draft : 0);
  sfx.cannonLoop(racing && !!s && s.cannonTime > 0);
  if (!racing || !s) {
    sfx.hazards(dt, null, null);
    return;
  }
  hazardSounds(dt, [s]);
}

/**
 * Party mode's engines: one each, leaning to each player's side and a
 * little quieter so four don't drown the music. The drift's song, the
 * draft and the cannon are the loudest player's.
 */
function partySounds(dt: number): void {
  const racing = mode === 'race' && !loop.paused;
  const level = racing ? 1 / Math.sqrt(seats.length) : 0;
  let charge = 0;
  let draft = 0;
  let cannon = false;
  seats.forEach((seat, i) => {
    const p = seat.kart;
    const s = p.state;
    const speedRatio = Math.abs(s.speed) / p.baseParams.topSpeed;
    sfx.updateEngine(level, speedRatio, s.boostTime > 0, s.driftDir !== 0, tireScreech(s, speedRatio), i, seat.pan);
    if (s.driftDir !== 0) charge = Math.max(charge, Math.min(1, s.driftCharge / DRIFT_TIERS[DRIFT_TIERS.length - 1]));
    draft = Math.max(draft, p.draft);
    cannon ||= s.cannonTime > 0;
  });
  sfx.quietEngines(seats.length);
  sfx.driftCharge(racing ? charge : 0);
  sfx.draft(racing ? draft : 0);
  sfx.cannonLoop(racing && cannon);
  if (!racing) {
    sfx.hazards(dt, null, null);
    return;
  }
  hazardSounds(dt, seats.map((x) => x.kart.state));
}

/** The rattle and the whirl of the nearest hazards of their kinds to any of `karts`, panned by which side of that kart they're on. */
function hazardSounds(dt: number, karts: KartState[]): void {
  const near = (kind: HazardKind) => {
    let best: { d: number; pan: number } | null = null;
    for (const h of race.hazards.poses) {
      if (h.kind !== kind) continue;
      for (const s of karts) {
        const dx = h.x - s.x;
        const dz = h.z - s.z;
        const d = Math.hypot(dx, dz);
        // Pan by which side of the kart it's on.
        if (!best || d < best.d) best = { d, pan: d > 0 ? ((dx * -Math.cos(s.heading) + dz * Math.sin(s.heading)) / d) * (mirrored() ? -1 : 1) : 0 };
      }
    }
    return best;
  };
  sfx.hazards(dt, near('snakes'), near('dustDevils') ?? near('tornadoes') ?? near('blackHoles') ?? near('butterflies') ?? near('wisps'));
}

/** The live soundtrack has this race's music (it falls back to the game's own by itself if a stream won't play). */
let liveRace = false;
/** Same song (the buttons between races): the song from the race before plays on through this one, unchanged. */
let heldSong = false;

/**
 * Full set: the show plays for all the game's music, from the moment it's
 * picked until the game is closed: the title and menus, every race, the
 * podium, the skill games and the Deadstick Landing.
 */
function setPlaying(): boolean {
  return settings().soundtrack === 'show';
}

/** Full set: the picked show playing (kept going if it already is), the game's music meanwhile and if it won't load. */
function ensureSet(): void {
  const cues = remixCues(mode === 'race' ? raceMusic().lap : 'title');
  if (mode === 'race') liveRace = true;
  void radio.shows().then((all) => {
    const show = chosenShow(all, settings().liveShow);
    if (!setPlaying()) return;
    if (show) return radio.ensureShow(show, cues);
    liveRace = false;
    music.play(cues);
  });
}

/**
 * The songs a race can play live, first choice first: the track's own; or
 * on a story run, its chapter's songs from Murder of the Universe (the
 * boss's own first in a duel, else from the stage's place in the chapter
 * on), then the track's own.
 */
function raceSongs(): string[] {
  const own = TRACK_SONGS[track.def.id]?.title;
  const r = story?.race;
  if (!r) return own ? [own] : [];
  const list = (STORY_SONGS[r.act] ?? []).map((s) => s.title);
  const lead = r.boss ? [STORY_BOSS_SONGS[r.act]] : [];
  const chapter = [...lead, ...list.map((_, i) => list[(r.index + i) % list.length])];
  return [...new Set([...chapter, ...(own ? [own] : [])].filter(Boolean))];
}

/** The Deadstick Landing flies to the game's own Deadstick remix, never a live recording or a set. */
function deadstickMusic(): boolean {
  return skillStage()?.kind === 'deadstick';
}

/** The race's own music cues: the track's, or the Deadstick Landing's. */
function raceMusic(): TrackDef['music'] {
  return deadstickMusic() ? { lap: DEADSTICK_CUE } : track.def.music;
}

/**
 * The race's music, by Settings > Soundtrack: the game's remix of the
 * track's song; a live recording of the song, at random (a song never
 * played live, or a generated track with no song, gets the remix); a live
 * recording of any song (Random song); or the Full set, kept going.
 */
function startRaceMusic(): void {
  heldSong = false;
  music.setLiveEnd(null);
  // A Full set is all the music, the Deadstick Landing's too.
  if (setPlaying()) return ensureSet();
  if (deadstickMusic()) {
    liveRace = false;
    if (radio.playing) radio.stop();
    music.play(remixCues(DEADSTICK_CUE));
    return;
  }
  const cues = remixCues(track.def.music.lap);
  const mode = settings().soundtrack;
  const songs = raceSongs();
  if (mode === 'random') {
    liveRace = true;
    const forRace = race;
    void radio.playRandom(cues).then((ok) => {
      if (ok || race !== forRace) return;
      liveRace = false;
      music.play(cues);
    });
    return;
  }
  if (mode === 'song' && songs.length) {
    liveRace = true;
    const forRace = race;
    void (async () => {
      // The first with a recording; none, and it's the remix.
      for (const song of songs) {
        if (race !== forRace || (await radio.playSong(song, cues))) return;
      }
      if (race !== forRace) return;
      liveRace = false;
      music.play(cues);
    })();
    return;
  }
  liveRace = false;
  if (radio.playing) radio.stop();
  music.play(cues);
}

/** The menus' music: the title remix, unless a Full set is playing on. */
function menuMusic(): void {
  music.setLiveEnd(null);
  if (setPlaying()) return ensureSet();
  if (radio.playing) radio.stop();
  music.play(remixCues('title'));
}

/** The credit for the live recording playing, for the HUD (on touch, where there's no mini player). */
function nowPlaying(): string | null {
  const rec = music.live;
  const p = radio.playing;
  if (!rec || !p) return null;
  return `${p.title}, live${rec.venue ? ` at ${rec.venue}` : ''}, ${rec.date}`;
}

function updateMusic(p: RaceKart): void {
  const { lap, finalLap } = raceMusic();
  // Over the line, the song plays on through the results and standings (the podium has its own).
  // A live recording, or a song held from the race before, plays the whole race through: no final-lap cut.
  if (p.finishTime !== null || liveRace || heldSong) return;
  if (race.laps > 1 && p.laps.lap === race.laps - 1) music.play(remixCues(finalLap ?? `${lap}-final-lap`).filter((c) => finalLap || c !== `${lap}-final-lap`));
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

const splitSize = new THREE.Vector2();

/** Each player's part of the screen, in CSS pixels. */
function seatRects() {
  renderer.getSize(splitSize);
  return splitRects(seats.length, splitSize.x, splitSize.y);
}

/**
 * Party mode's split screen: each player's view drawn into their part of
 * the screen, the sky, the sun and the lap's roads set for theirs. The
 * post effects (haze, the tape) are a full-screen pass, so they sit out.
 */
function renderSplit(hue: number, drawn: KartState[]): void {
  const rects = seatRects();
  const h = splitSize.y;
  renderer.setScissorTest(true);
  // The quarter no one has, with three players: the map sits there.
  renderer.setViewport(0, 0, splitSize.x, h);
  renderer.setScissor(0, 0, splitSize.x, h);
  renderer.clear();
  seats.forEach((seat, i) => {
    const r = rects[i];
    const cam = seat.camera;
    // The GL viewport counts from the bottom.
    renderer.setViewport(r.x, h - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, h - r.y - r.h, r.w, r.h);
    const k = drawn[race.karts.indexOf(seat.kart)];
    trackView!.update(elapsed, cam.position, hue, seat.kart.state);
    sunAnchor.position.copy(cam.position).addScaledVector(SUN_DIR, 1400);
    sun.target.position.set(k.x, k.y, k.z);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
    renderer.render(scene, cam);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, splitSize.x, h);
}

/** Party mode's HUDs, one over each player's part of the screen; their cameras set for its shape. */
function updateSeatHuds(): void {
  const rects = seatRects();
  const hidden = mode !== 'race' || loop.paused || intro > 0;
  seats.forEach((seat, i) => {
    const r = rects[i];
    const aspect = r.w / Math.max(1, r.h);
    if (seat.camera.aspect !== aspect) {
      seat.camera.aspect = aspect;
      seat.chase.placement.fov = splitFov(DEFAULT_PLACEMENT.fov, aspect);
      seat.camera.updateProjectionMatrix();
    }
    const p = seat.kart;
    const surge = surgeCloseness(p);
    seat.hud?.place(r);
    seat.hud?.update(
      {
        kart: p.state,
        lap: p.laps.lap,
        totalLaps: race.laps >= INFINITE_LAPS ? Infinity : race.laps,
        position: p.position,
        karts: race.karts.length,
        finished: p.finishTime !== null,
        item: p.item,
        rolling: p.rolling,
        spare: p.spare,
        hop: !!surge && surge.eta <= SURGE_HOP_WINDOW,
        hidden,
      },
      elapsed,
    );
  });
}

const loop = new FixedLoop(step, (alpha, frameDt) => {
  if (resolution.sample(frameDt)) applyPixelRatio();
  if (mode === 'party') party.poll(performance.now() / 1000);
  // A Party player's Start (every seat's checked, so none is left pending).
  const seatPause = seats.map((x) => x.input?.consumePause() ?? false).some(Boolean);
  if ((input.consumePause() || seatPause) && mode === 'race') {
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
    chase.update(s, f.params.topSpeed, seats[0]?.last.lookBack ?? false, dt);
    if (split()) for (const seat of seats) seat.chase.update(drawn[race.karts.indexOf(seat.kart)], seat.kart.params.topSpeed, seat.last.lookBack, dt);
  }
  // Where the camera is in the world the simulation knows (the views are flipped, the camera isn't).
  const camWorld = flip ? new THREE.Vector3(-camera.position.x, camera.position.y, camera.position.z) : camera.position;
  document.body.classList.toggle('intro', intro > 0);
  const theme = trackView!.theme;
  const L = track.length;
  // The sky turns over the race; laps without end turn it every few laps, round and round.
  const skyLaps = race.laps >= INFINITE_LAPS ? SKY_LAPS : race.laps;
  const skyTurn = race.laps >= INFINITE_LAPS ? (f.distance / (L * skyLaps)) % 1 : clamp(f.distance / (L * race.laps), 0, 1);
  trackView!.update(elapsed, camWorld, theme.skyCycle ? Math.PI * 2 * skyTurn : 0, f.state);
  itemsView!.update(elapsed, race.karts.map((k, i) => ({ state: snaps[i], holder: k })));
  hazardsView!.update(elapsed);
  sunAnchor.position.copy(camera.position).addScaledVector(SUN_DIR, 1400);
  // The shadow camera follows the kart on screen.
  sun.target.position.set(s.x, s.y, s.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  updateSounds(dt);
  watchSong(frameDt);

  const finished = f.finishTime !== null;
  hints.show(mode === 'menu' || (mode === 'race' && intro > 0 && !!player));
  hud.update(
    {
      kart: s,
      lap: f.laps.lap,
      totalLaps: race.laps >= INFINITE_LAPS ? Infinity : race.laps,
      raceTime: f.finishTime ?? Math.max(0, race.time),
      lapTimes: f.lapTimes,
      racerName: f.racer.name,
      engineClass: `${choice.engine}${!online && choice.mode !== 'timeTrial' && settings().cpuDifficulty !== 'normal' ? ` · ${settings().cpuDifficulty} CPUs` : ''}`,
      trackName: gp && !gp.finished ? `${track.def.name} · race ${gp.round + 1}/${gp.tracks.length}${gp.rivals.length ? ` · vs ${gp.rivals.map((r) => r.name).join(' & ')}` : ''}` : ghosts.length ? `${track.def.name} · ${ghosts.map((g) => `${g.label} ${formatTime(g.run.total)}`).join(' · ')}` : `${track.def.name}${mirrored() ? ' · Mirror' : ''}`,
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
      intro: intro > 0 ? { name: track.def.name, sub: story ? storyIntro(story) : gp ? `Race ${gp.round + 1} of ${gp.tracks.length}${gp.rivals.length ? ` · your rivals: ${gp.rivals.map((r) => r.name).join(' and ')}` : ''}${mirrored() ? ' · Mirror' : ''}` : choice.mode === 'timeTrial' ? 'Time Trial' : choice.mode === 'infinite' ? `${watching ? 'Watching the CPUs' : 'Infinite'}${choice.switchEvery === 'never' ? '' : ` · ${choice.switchEvery === 'song' ? 'a new track each song' : `a new track every ${choice.switchEvery === 1 ? 'lap' : `${choice.switchEvery} laps`}`}`} · ${choice.engine}` : `${choice.engine}${mirrored() ? ' · Mirror' : ''}` } : null,
      table: table(),
      muted: musicMuted,
      sfxMuted,
      item: player?.item ?? null,
      rolling: player?.rolling ?? 0,
      spare: player?.spare ?? null,
      surge: player ? surgeCloseness(player) : null,
      style: style && player ? { score: style.score, chain: style.chainLeft > 0 ? style.chain : 0 } : null,
      splits,
      turn: turnHint(),
      nowPlaying: nowPlaying(),
      songLeft: mode === 'race' ? songLeft() : null,
    },
    elapsed,
  );
  hud.minimap.draw(race.karts.map((k, i) => ({ x: snaps[i].x, z: snaps[i].z, color: hex(k.racer.color), player: !!seatOf(k), rival: k.rival })));
  const splitView = split() && intro === 0;
  document.body.classList.toggle('split', splitView);
  document.body.classList.toggle('split-3', splitView && seats.length === 3);
  if (split()) updateSeatHuds();
  // Heat haze shimmers hardest on the straights; the kaleidoscope runs on the player's final lap.
  const straight = 1 - clamp(track.main.maxCurvature(f.progressS, f.progressS + 80) * 25, 0, 1);
  const hazeTarget = podium ? 0 : theme.haze * (0.3 + 0.7 * straight);
  const finalLap = mode === 'race' && player !== null && player.finishTime === null && intro === 0 && race.laps > 1 && player.laps.lap === race.laps - 1;
  fx.haze += (hazeTarget - fx.haze) * damp(2, frameDt);
  fx.kaleido += ((finalLap ? 1 : 0) - fx.kaleido) * damp(1.5, frameDt);
  // The Rattlesnake video's look: full for the flyover and behind the title and menus, on tape through the race, a bite when hit.
  const look = VHS_LEVELS[settings().videoLook];
  const attract = !player && mode !== 'podium' && !watching;
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
  // A skill game covers the screen: the world behind it holds still rather than spend the frame.
  if (mode === 'skill') return;
  if (splitView) return renderSplit(theme.skyCycle ? Math.PI * 2 * skyTurn : 0, drawn);
  const beat = music.beatPhase();
  postFx.render(scene, camera, { haze: fx.haze, kaleido: fx.kaleido, beat: beat >= 0 ? beat : (elapsed * 2.4) % 1, time: elapsed, vhs: fx.vhs, duo: fx.duo, box: fx.box, palette: theme.duotone, water: fx.water });
});

/** The podium's extra line: the trophy and what it unlocked. */
let cupNote = '';

/** The panel for the results, cup standings and podium screens. */
function table(): Table | null {
  const kartRow = (k: RaceKart, i: number): TableRow => ({
    place: ordinal(i + 1),
    // Party mode: each player by seat.
    name: seatOf(k)?.label ? `${seatOf(k)!.label} · ${k.racer.name}` : k.racer.name,
    color: hex(k.racer.color),
    // Ended by the song, everyone finished at once: the laps each got round count.
    value: k.finishTime === null ? '...' : songRace.over ? `${k.laps.lap} lap${k.laps.lap === 1 ? '' : 's'}` : formatTime(k.finishTime),
    extra: k.rival ? 'RIVAL' : undefined,
    player: !!seatOf(k),
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
    const title = online ? `ROOM ${online.client.code} RESULTS` : story ? `${story.actDef.chapter.toUpperCase()} · ${story.race.boss ? 'BOSS DUEL' : `RACE ${story.race.index + 1}`}` : gp ? `RACE ${gp.round + 1}/${gp.tracks.length} RESULTS` : choice.mode === 'timeTrial' ? 'TIME TRIAL' : partyOn ? 'PARTY RESULTS' : 'RESULTS';
    const rows = online ? onlineRows(kartRow) : finishOrder().map(kartRow);
    return { kind: 'results', title, note: trialNote || undefined, rows, actions: betweenActions() };
  }
  if (mode === 'standings' && gp) {
    const next = gp.finished ? 'Final standings' : `Next: ${TRACK_LIST[gp.trackIndex].name}`;
    return { kind: 'cup', title: 'CUP STANDINGS', note: next, rows: cupRows(gp.entries.length), actions: betweenActions() };
  }
  if (mode === 'podium' && gp) {
    const champ = gp.standings()[0];
    const me = gp.standings().findIndex((e) => e.racer === choice.racer) + 1;
    const note = `${champ.racer === choice.racer ? `You win the ${chosenCup(choice).name}!` : `You finished ${ordinal(me)}`}${cupNote ? ` · ${cupNote}` : ''}`;
    return { kind: 'podium', title: `${champ.racer.name.toUpperCase()} WINS!`, note, rows: cupRows(3) };
  }
  return null;
}

/**
 * The buttons between races, the default first (any key or tap does it):
 * in a Grand Prix, on to the next race with its own song or with the one
 * playing; after a single race, a time trial or a generated track, the menu,
 * or the same track again (or the next one) with the song playing on. A
 * Full set plays on anyway, so there they don't say "same song". On a
 * story run, on to the run's cards, the song kept for the next race if
 * asked. None online or in practice, which have their own way on.
 */
function betweenActions(): TableAction[] | undefined {
  if (online || practice) return undefined;
  const set = setPlaying();
  const same = set ? '' : ', SAME SONG';
  const song: TableAction = { id: 'song', label: 'NEXT SONG', key: 'N' };
  if (story) {
    if (mode !== 'results' || !player) return undefined;
    const next: TableAction = { id: 'next', label: 'CONTINUE' };
    // Continue already brings the next race's own song; only a Full set has a next song to skip to.
    return set ? [next, song] : [next, { id: 'again', label: `CONTINUE${same}`, key: 'S' }];
  }
  if (gp) {
    // A Grand Prix's buttons are on the cup standings, the second screen between races; its results just carry on to them.
    if (mode !== 'standings' || gp.finished) return undefined;
    const next: TableAction = { id: 'next', label: 'NEXT RACE' };
    return set ? [next] : [next, { id: 'again', label: `NEXT RACE${same}`, key: 'S' }];
  }
  if (mode !== 'results' || choice.mode === 'infinite') return undefined;
  const actions: TableAction[] = [
    { id: 'next', label: partyOn ? 'PLAYERS' : 'MENU' },
    { id: 'again', label: `RACE AGAIN${same}`, key: 'S' },
  ];
  if (choice.mode === 'single' || partyOn) actions.push({ id: 'nextTrack', label: `NEXT TRACK${same}`, key: 'T' });
  actions.push(song);
  return actions;
}

/**
 * A button between races: the default carries on as any key does; the same
 * song ones start the next race with the song playing on; NEXT SONG starts
 * the next race (the next track after a single race, the same one again
 * after a time trial or a generated track) with its own song, or a Full
 * set's next song.
 */
function betweenRaces(id: string): void {
  music.unlock();
  if (id === 'song' && setPlaying()) radio.next();
  if (id === 'next' || story) {
    // Story: on to the run's cards as usual, the song kept for the next race if asked.
    storySameSong = !!story && id === 'again';
    advance();
    return;
  }
  if (id === 'nextTrack' || (id === 'song' && (choice.mode === 'single' || partyOn))) choice.track = menu.choice.track = (choice.track + 1) % TRACK_LIST.length;
  startRace(true, id !== 'song');
}

hud.onTableAction = betweenRaces;

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
  storySameSong = false;
  infiniteGen = null;
  gp = null;
  story = null;
  practice = null;
  endDeadstickRing();
  endPodium();
  setMode('menu');
  if (track.def.id !== menuTrack().id) loadTrack(menuTrack());
  else startRace(false);
}

/** Party mode: back to the join screen, the players still there, with the attract race behind it. */
function toParty(): void {
  setMode('party');
  startRace(false);
}

function startPodium(): void {
  const top3 = gp!.standings().slice(0, 3).map((e) => e.racer);
  podium = new Podium(track, top3);
  scene.add(podium.group);
  for (const v of views) v.root.visible = v.fx.visible = false;
  itemsView!.group.visible = hazardsView!.group.visible = false;
  setMode('podium');
  if (!setPlaying()) music.play('podium');
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
  if (mode === 'results' && partyOn) {
    toParty();
    return true;
  }
  if (mode === 'results' && story && player) {
    storyResult(story.passes(player.position, storyBoss?.position ?? null));
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
    // A story race is run once: a miss costs a life, not a restart.
    if (story) return hud.flash('NO RESTARTS IN THE LOOP');
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
    else if (partyOn) toParty();
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
  if ((e.target as HTMLElement).closest('.settings, .hud-title-settings, .lobby, .party, .board, .savetrack, .nameprompt, .skill')) return music.unlock();
  if (skipIntro()) return;
  if ((e.target as HTMLElement).closest('.menu, .touch, .hud-pause, .mini-player, .mp-fab, .hud-standings-actions')) return music.unlock();
  // Watching: a tap anywhere on the race picks another racer to follow.
  if (watching && mode === 'race' && !loop.paused) return switchWatch(1);
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
  if (mode === 'party') {
    party.key(e.code);
    return;
  }
  // A button between races by its letter (S: same song, T: next track, N: next song).
  if ((mode === 'results' || mode === 'standings') && !e.repeat) {
    const act = betweenActions()?.find((a) => a.key && e.code === `Key${a.key}`);
    if (act) return betweenRaces(act.id);
  }
  if (advance()) return;
  if (!e.repeat && skipIntro()) return;
  if (mode === 'story') {
    if (!e.repeat) storyScreen.key(e.code);
    return;
  }
  if (mode === 'skill') {
    skillScreen.key(e.code, e.repeat);
    return;
  }
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
    /** What's playing: the game's cue, or the live song's title (testing). */
    get music() {
      return { cue: music.cue, live: radio.playing?.title ?? null };
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
    /** Starts a story run at a chapter's skill game, as `kind` (testing). */
    storySkill(kind: SkillKind, act = 0) {
      choice = { ...choice, mode: 'story' };
      story = new StoryRun(12345);
      story.cleared = act * STAGES_PER_ACT + SKILL_STAGE;
      story.skills[act] = kind;
      showStory('skill');
    },
    /** Starts a Party race for `n` players on the keyboard halves and the first gamepads (testing). */
    party(n = 2) {
      const sources: SeatSource[] = [{ kind: 'keys', side: 'left' }, { kind: 'keys', side: 'right' }, { kind: 'pad', index: 0 }, { kind: 'pad', index: 1 }];
      partySeats = sources.slice(0, n).map((source, i) => ({ source, racer: RACERS[i], ready: true }));
      choice = { ...choice, mode: 'party' };
      startRace(true);
    },
    get seats() {
      return seats.map((x) => ({ label: x.label, racer: x.kart.racer.id, lap: x.kart.laps.lap, place: x.kart.position, finished: x.kart.finishTime !== null }));
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

