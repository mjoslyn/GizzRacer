import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { PitDef, RoadSurface } from '../tracks/builder';
import { BANK, branchOpen, inPit, type BranchDef, type LapContext, type Launcher, type Ribbon, type Track } from '../tracks/track';
import * as tex from './textures';
import { trackLife } from './trackLife';
import { DETAIL_SPEC, densityScale, graphicsDetail } from './detail';
import { THEMES, type Theme } from './themes';
import { CURB_WIDTH, atmosphere, roadPaint, trackDetail } from './trackDetail';
import { colonyFeature, colonyGate, cosmosFeature, plainsFeature, rodGate, starGate, stormWeather, voidEye } from './apocalypse';
import { alienSeaFeature, crystalGate, gardenFeature, goblinGate, jawsGate, keplerArch, magentaPeak, peaksFeature, shoreFeature } from './omnium';
import { floralCarpetTexture, lockedDoor, nanFeature, teacups } from './mendThePast';
import { blackCup, headtripFeature, lostLegs, paisleyRoadTexture, pillTube, sitarGate } from './headOnPill';
import { cordGate, deshretFeature, hadeanFeature, jadePortal, moonPalace, moonPalaceFeature, setColossus, setGate, theiaPlanet, urukFeature, urukGate, ziggurat } from './silverCord';
import { faceCloud, farmDam, gravelTexture, oldFord, paddockFeature } from './floatAlong';
import { bandroomFeature, bentArm, canopyFeature, elbowGate, harmonicaGate, mirrorBall, partyFeature, powerStation, rakeGate, snowPeak, trunkGate, wetlandFeature } from './twelveBarBruise';
import { arrowGate, cellophaneBloom, emptyHead, eyeGate, filmGate, fuzzGate, fuzzMeter, mindFace, neuronsFeature, opartFeature, panesFeature, staticFeature } from './mindfuzz';
import { blightFeature, burningEarth, coronaFeature, domeGate, domesFeature, hellGate, pitFeature, ratsNest, richDome, shipGate, smogGate, theSun } from './infest';
import { carcass, carrionGate, boneyardFeature, factoryGate, foundryFeature, gammaGate, gammaRing, pedalboardFeature, robotColossus, theatreFeature, wahGate, wahPedal } from './nonagon';
import { airCastle, castleGate, castleKeep, cellGate, cloudGate, cloudsFeature, cytoplasmFeature, nucleus, prismEye, prismGate, ruinsFeature, skyTower, spectrumFeature } from './polygondwanaland';
import { airstripFeature, groveFeature, isleFeature, phantomArch, runwayGate, seaFeature, treeGate, worldTree, wreckGate } from './phantom';
import { bitumenTexture, heavenGate, hillHouse, suburbFeature } from './godIsCalling';

/** Meters of road per texture repeat along the track. */
const ROAD_TILE = 14;
/** Draw roads a hair above their physical height to stay clear of the ground. */
const ROAD_LIFT = 0.03;

/** Height of the surface of water in a pit; under it, the camera is under water. */
export const WATER_LEVEL = -2.5;

export interface TrackView {
  group: THREE.Group;
  theme: Theme;
  /** Pits of water a road dives into, for the under-water look (game.ts). */
  dives: PitDef[];
  /**
   * `skyHue` rotates the sky's colors, in radians; `lap` is the lap of the
   * kart being watched, for the roads that are only there on some laps.
   */
  update(time: number, cameraPos: THREE.Vector3, skyHue?: number, lap?: LapContext): void;
}

interface Materials {
  road: Record<RoadSurface, THREE.Material>;
  curb: THREE.Material;
  strata: THREE.Material;
  barrier: THREE.MeshLambertMaterial;
  mud: THREE.Material;
  bone: THREE.Material;
  cactus: THREE.Material;
  rock: THREE.Material;
  lava: THREE.MeshBasicMaterial;
  water: THREE.MeshPhongMaterial;
  oil: THREE.MeshPhongMaterial;
}

function materials(theme: Theme): Materials {
  const lambert = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ map, ...extra });
  // Flying Microtonal Banana's worlds lay their roads in its cobalt and banana yellow.
  const banana = !!theme.banana;
  const sand = banana ? tex.sandTexture(tex.BANANA.sandDark, tex.BANANA.sandLight) : tex.sandTexture();
  const rockMap: Record<Theme['decor'], () => THREE.Texture> = {
    desert: theme.banana ? () => tex.stoneTexture([24, 40, 140], [70, 110, 220]) : tex.dirtTexture,
    meadow: () => tex.stoneTexture([96, 100, 92], [160, 164, 150]),
    volcanic: tex.basaltTexture,
    jungle: () => tex.stoneTexture([60, 80, 52], [120, 140, 100]),
    lagoon: () => tex.stoneTexture([170, 150, 120], [230, 214, 180]),
    glacier: () => tex.stoneTexture([110, 130, 150], [200, 215, 230]),
    city: () => tex.stoneTexture([40, 34, 56], [90, 80, 110]),
    sky: () => tex.stoneTexture([220, 200, 240], [255, 250, 255]),
    wasteland: () => tex.stoneTexture([30, 22, 22], [80, 58, 50]),
    colony: () => tex.stoneTexture([100, 40, 22], [180, 90, 54]),
    plains: () => tex.stoneTexture([70, 74, 70], [130, 136, 128]),
    cosmos: () => tex.stoneTexture([50, 30, 80], [130, 100, 180]),
    isle: () => tex.stoneTexture([62, 66, 82], [130, 136, 160]),
    airstrip: () => tex.stoneTexture([150, 140, 120], [220, 210, 190]),
    grove: () => tex.stoneTexture([70, 84, 60], [140, 150, 110]),
    sea: () => tex.stoneTexture([26, 32, 36], [80, 92, 100]),
    peaks: () => tex.stoneTexture([110, 40, 100], [210, 120, 200]),
    alienSea: () => tex.stoneTexture([70, 50, 110], [150, 120, 200]),
    garden: () => tex.stoneTexture([120, 110, 90], [190, 180, 150]),
    shore: () => tex.stoneTexture([46, 46, 50], [110, 106, 100]),
    ruins: () => tex.stoneTexture([62, 60, 64], [126, 122, 120]),
    clouds: () => tex.stoneTexture([200, 190, 180], [250, 246, 236]),
    cytoplasm: () => tex.stoneTexture([130, 50, 110], [230, 140, 190]),
    spectrum: () => tex.stoneTexture([30, 26, 60], [110, 100, 180]),
    foundry: () => tex.stoneTexture([50, 52, 58], [110, 112, 118]),
    theatre: () => tex.stoneTexture([30, 60, 56], [90, 150, 130]),
    boneyard: () => tex.stoneTexture([120, 90, 60], [190, 160, 110]),
    pedalboard: () => tex.stoneTexture([40, 20, 50], [120, 60, 130]),
    blight: () => tex.stoneTexture([40, 36, 32], [96, 88, 76]),
    domes: () => tex.stoneTexture([120, 46, 24], [200, 104, 64]),
    corona: () => tex.stoneTexture([40, 20, 14], [110, 60, 40]),
    pit: () => tex.stoneTexture([20, 10, 10], [70, 34, 28]),
    neurons: () => tex.stoneTexture([110, 40, 80], [220, 130, 170]),
    opart: () => tex.stoneTexture([20, 20, 24], [230, 228, 222]),
    panes: () => tex.stoneTexture([90, 110, 160], [200, 220, 250]),
    static: () => tex.stoneTexture([30, 20, 44], [100, 70, 130]),
    bandroom: () => tex.stoneTexture([40, 34, 38], [100, 90, 96]),
    wetland: () => tex.stoneTexture([70, 62, 48], [130, 120, 100]),
    party: () => tex.stoneTexture([40, 30, 40], [110, 90, 110]),
    canopy: tex.lavaRockTexture,
    hadean: tex.crustWallTexture,
    deshret: () => tex.stoneTexture([150, 80, 44], [220, 150, 96]),
    moonpalace: () => tex.stoneTexture([110, 110, 120], [200, 200, 210]),
    uruk: () => tex.stoneTexture([110, 90, 64], [180, 150, 110]),
    nanshouse: () => tex.stoneTexture([200, 190, 170], [250, 244, 230]),
    suburb: () => tex.stoneTexture([120, 110, 96], [196, 186, 166]),
    headtrip: () => tex.stoneTexture([70, 20, 80], [200, 90, 170]),
    paddock: () => tex.stoneTexture([130, 116, 96], [200, 188, 166]),
  };
  const neon = banana ? tex.neonRoadTexture(tex.BANANA.neon) : tex.neonRoadTexture();
  const rainbow = banana ? tex.rainbowTexture(tex.BANANA.bands) : tex.rainbowTexture();
  // High detail: the road's own texture as a bump map, so its grain catches the sun.
  const grain = DETAIL_SPEC[graphicsDetail()].grain;
  const bumpy = (map: THREE.Texture, scale: number, extra: THREE.MeshLambertMaterialParameters = {}) => lambert(map, grain ? { bumpMap: map, bumpScale: scale, ...extra } : extra);
  const m: Materials = {
    road: {
      asphalt: bumpy(tex.asphaltTexture(), 0.08),
      salt: bumpy(tex.saltTexture(), 0.05),
      rock: bumpy(tex.dirtTexture(), 0.1),
      sand: bumpy(sand, 0.06),
      boards: bumpy(tex.boardsTexture(), 0.08),
      ice: new THREE.MeshPhongMaterial({ map: tex.iceTexture(), shininess: 60, specular: 0x4a5a6a }),
      neon: lambert(neon, { emissive: 0xffffff, emissiveMap: neon, emissiveIntensity: 0.7 }),
      rainbow: lambert(rainbow, { emissive: 0xffffff, emissiveMap: rainbow, emissiveIntensity: 0.35 }),
      // Wet and black, with a hard highlight: it looks as slippery as it is.
      oil: new THREE.MeshPhongMaterial({ map: tex.oilRoadTexture(), shininess: 110, specular: 0x8a7a90 }),
      regolith: bumpy(tex.regolithRoadTexture(), 0.1),
      wet: new THREE.MeshPhongMaterial({ map: tex.wetRoadTexture(), shininess: 80, specular: 0x6a7a80 }),
      crystal: (() => {
        const map = tex.crystalRoadTexture();
        return lambert(map, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.25 });
      })(),
      reef: bumpy(tex.reefRoadTexture(), 0.1),
      paving: bumpy(tex.pavingTexture(), 0.12),
      flagstone: bumpy(tex.flagstoneTexture(), 0.12),
      cloud: (() => {
        const map = tex.cloudRoadTexture();
        return lambert(map, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.2 });
      })(),
      membrane: new THREE.MeshPhongMaterial({ map: tex.membraneTexture(), shininess: 70, specular: 0x8a4a6a }),
      prism: (() => {
        const map = tex.prismRoadTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.15, shininess: 60, specular: 0x8a8aa0 });
      })(),
      steel: new THREE.MeshPhongMaterial({ map: tex.steelPlateTexture(), shininess: 50, specular: 0x8a8a90 }),
      chrome: (() => {
        const map = tex.chromeTileTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12, shininess: 90, specular: 0xa0ffd0 });
      })(),
      scorched: bumpy(tex.scorchedTexture(), 0.1),
      fret: new THREE.MeshPhongMaterial({ map: tex.fretboardTexture(), shininess: 40, specular: 0x6a5a4a }),
      tar: bumpy(tex.tarTexture(), 0.1),
      gilded: new THREE.MeshPhongMaterial({ map: tex.gildedTexture(), shininess: 100, specular: 0xfff0d0 }),
      heatshield: (() => {
        const map = tex.heatShieldTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.25, shininess: 30, specular: 0x6a4a3a });
      })(),
      brimstone: (() => {
        const map = tex.brimstoneTexture();
        return lambert(map, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.4 });
      })(),
      neural: (() => {
        const map = tex.neuralTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12, shininess: 50, specular: 0x8a4a6a });
      })(),
      opart: lambert(tex.opartTexture()),
      film: (() => {
        const map = tex.filmTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3, shininess: 90, specular: 0x50506a });
      })(),
      fuzz: (() => {
        const map = tex.fuzzRoadTexture();
        return bumpy(map, 0.12, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.25 });
      })(),
      carpet: (() => {
        const map = tex.carpetTexture();
        return bumpy(map, 0.08, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.12 });
      })(),
      muck: new THREE.MeshPhongMaterial({ map: tex.muckTexture(), shininess: 40, specular: 0x4a4a40 }),
      dancefloor: (() => {
        const map = tex.danceFloorTexture();
        return lambert(map, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.6 });
      })(),
      moss: bumpy(tex.mossRoadTexture(), 0.1),
      silver: (() => {
        const map = tex.silverCordTexture();
        return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, shininess: 120, specular: 0xffffff });
      })(),
      hieroglyph: bumpy(tex.hieroglyphTexture(), 0.12),
      jade: new THREE.MeshPhongMaterial({ map: tex.jadeTexture(), shininess: 110, specular: 0xd0fff0 }),
      mudbrick: bumpy(tex.mudbrickTexture(), 0.1),
      // The Float Along Cup's roads.
      paisley: bumpy(paisleyRoadTexture(), 0.06),
      // God Is Calling Me Back Home's street, its white line down the middle.
      bitumen: bumpy(bitumenTexture(), 0.08),
      florals: bumpy(floralCarpetTexture(), 0.1),
      // The Altered Beast Cup's roads (placeholders until each track's world is built).
      crust: bumpy(tex.sandTexture(), 0.06),
      butcher: bumpy(tex.carpetTexture(), 0.1),
      fur: bumpy(tex.carpetTexture(), 0.1),
      bone: bumpy(tex.sandTexture(), 0.06),
      gravel: bumpy(gravelTexture(), 0.1),
      cosmic: (() => {
        const map = tex.cosmicRoadTexture();
        return lambert(map, { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.55 });
      })(),
    },
    curb: (() => {
      const map = tex.curbTexture();
      const glow = (theme.roadGlow ?? 0) * 1.5;
      return lambert(map, glow > 0 ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow } : {});
    })(),
    strata: bumpy(theme.cliff(), 0.25, { side: THREE.DoubleSide }),
    barrier: lambert(theme.barrier.map(), { side: THREE.DoubleSide }),
    mud: lambert(tex.mudTexture()),
    bone: new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 }),
    cactus: lambert(tex.cactusTexture()),
    rock: new THREE.MeshLambertMaterial({ map: rockMap[theme.decor](), flatShading: true }),
    lava: new THREE.MeshBasicMaterial({ map: tex.lavaTexture(), side: THREE.DoubleSide }),
    water: new THREE.MeshPhongMaterial({ color: 0x2a7a8a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    oil: new THREE.MeshPhongMaterial({ color: 0x0a0608, emissive: 0x2a0800, shininess: 140, specular: 0xaa8866, side: THREE.DoubleSide }),
  };
  // A dark world: every road surface lit a little by its own texture, so it reads against the ground.
  const glow = theme.roadGlow ?? 0;
  if (glow > 0) {
    for (const mat of Object.values(m.road) as (THREE.MeshLambertMaterial | THREE.MeshPhongMaterial)[]) {
      if (mat.emissiveMap) continue;
      mat.emissive.set(0xffffff);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = glow;
    }
  }
  return m;
}

/** Textured visuals for a spline track, in a sharp early-2000s console style. */
export function buildTrackView(track: Track): TrackView {
  const group = new THREE.Group();
  const theme = THEMES[track.def.theme];
  const mats = materials(theme);

  const abyss = !!track.def.abyss;
  group.add(sky(theme));
  // The sky track floats over a sea of cloud far below; everywhere else has ground, with pits cut in it.
  if (abyss) group.add(cloudSea(theme));
  else {
    group.add(ground(track, theme));
    for (const pit of track.def.pits) group.add(pitMesh(pit, mats));
  }
  const lapRoads: LapRoad[] = [];
  [track.main, ...track.branches].forEach((ribbon, i) => {
    const g = ribbonMeshes(ribbon, mats, abyss);
    group.add(g);
    const def = i > 0 ? track.def.branches[i - 1] : null;
    if (def?.openOn) {
      g.add(roadPaint(ribbon, theme.decor, theme.edgeLine, theme.edgeWidth));
      lapRoads.push(lapRoad(def, ribbon, g));
    }
  });

  const animated: ((time: number) => void)[] = [];
  const padTexture = tex.chevronTexture();
  for (const pad of track.def.boostPads) {
    const p = pointAt(track.spline, track.mainS(pad.s + pad.length / 2));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.halfWidth * 2, pad.length),
      new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
    mesh.position.set(p.x - p.tz * pad.lateral, track.main.heightAt(track.mainS(pad.s)) + 0.06, p.z + p.tx * pad.lateral);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  for (const l of track.def.launchers ?? []) group.add(launcher(track, l, animated));

  group.add(startLine(track));
  for (const lm of track.def.landmarks) {
    const ribbon = track.ribbon(lm.ribbon);
    const s = lm.s * ribbon.scale;
    if (lm.kind === 'skeletonArch') group.add(skeletonArch(ribbon, s, mats));
    if (lm.kind === 'fangs') group.add(snakeMouth(ribbon, s, mats));
    if (lm.kind === 'fortressGate') group.add(fortressGate(ribbon, s, mats));
    if (lm.kind === 'templeGate') group.add(templeGate(ribbon, s, mats));
    if (lm.kind === 'gantry') group.add(gantry(ribbon, s, track.def.name));
    if (lm.kind === 'iceArch') group.add(iceArch(ribbon, s));
    if (lm.kind === 'neonArch') group.add(neonArch(ribbon, s, !!theme.banana));
    if (lm.kind === 'rainbowArch') group.add(rainbowArch(ribbon, s, !!theme.banana));
    if (lm.kind === 'mushroomArch') group.add(mushroomArch(ribbon, s, animated));
    if (lm.kind === 'dragonGate') group.add(dragonGate(ribbon, s, mats));
    if (lm.kind === 'colonyGate') group.add(colonyGate(ribbon, s, animated));
    if (lm.kind === 'rodGate') group.add(rodGate(ribbon, s, animated));
    if (lm.kind === 'voidEye') group.add(voidEye(ribbon, s, animated));
    if (lm.kind === 'starGate') group.add(starGate(ribbon, s, animated));
    if (lm.kind === 'phantomArch') group.add(phantomArch(ribbon, s, animated));
    if (lm.kind === 'runwayGate') group.add(runwayGate(ribbon, s, animated));
    if (lm.kind === 'treeGate') group.add(treeGate(ribbon, s, animated));
    if (lm.kind === 'wreckGate') group.add(wreckGate(ribbon, s, animated));
    if (lm.kind === 'worldTree') group.add(worldTree(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'crystalGate') group.add(crystalGate(ribbon, s, animated));
    if (lm.kind === 'magentaPeak') group.add(magentaPeak(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'keplerArch') group.add(keplerArch(ribbon, s, animated));
    if (lm.kind === 'goblinGate') group.add(goblinGate(ribbon, s, animated));
    if (lm.kind === 'jawsGate') group.add(jawsGate(ribbon, s, animated));
    if (lm.kind === 'castleGate') group.add(castleGate(ribbon, s, animated));
    if (lm.kind === 'castleKeep') group.add(castleKeep(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'cloudGate') group.add(cloudGate(ribbon, s, animated));
    if (lm.kind === 'airCastle') group.add(airCastle(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'skyTower') group.add(skyTower(ribbon, s, lm.lateral ?? 0));
    if (lm.kind === 'cellGate') group.add(cellGate(ribbon, s, animated));
    if (lm.kind === 'nucleus') group.add(nucleus(ribbon, s, animated));
    if (lm.kind === 'prismGate') group.add(prismGate(ribbon, s, animated));
    if (lm.kind === 'prismEye') group.add(prismEye(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'factoryGate') group.add(factoryGate(ribbon, s, animated));
    if (lm.kind === 'robotColossus') group.add(robotColossus(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'gammaGate') group.add(gammaGate(ribbon, s, animated));
    if (lm.kind === 'gammaRing') group.add(gammaRing(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'carrionGate') group.add(carrionGate(ribbon, s, animated));
    if (lm.kind === 'carcass') group.add(carcass(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'wahGate') group.add(wahGate(ribbon, s, animated));
    if (lm.kind === 'wahPedal') group.add(wahPedal(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'smogGate') group.add(smogGate(ribbon, s, animated));
    if (lm.kind === 'burningEarth') group.add(burningEarth(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'domeGate') group.add(domeGate(ribbon, s, animated));
    if (lm.kind === 'richDome') group.add(richDome(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'shipGate') group.add(shipGate(ribbon, s, animated));
    if (lm.kind === 'theSun') group.add(theSun(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'hellGate') group.add(hellGate(ribbon, s, animated));
    if (lm.kind === 'ratsNest') group.add(ratsNest(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'eyeGate') group.add(eyeGate(ribbon, s, animated));
    if (lm.kind === 'mindFace') group.add(mindFace(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'arrowGate') group.add(arrowGate(ribbon, s, animated));
    if (lm.kind === 'emptyHead') group.add(emptyHead(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'filmGate') group.add(filmGate(ribbon, s, animated));
    if (lm.kind === 'cellophaneBloom') group.add(cellophaneBloom(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'fuzzGate') group.add(fuzzGate(ribbon, s, animated));
    if (lm.kind === 'fuzzMeter') group.add(fuzzMeter(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'elbowGate') group.add(elbowGate(ribbon, s, animated));
    if (lm.kind === 'bentArm') group.add(bentArm(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'rakeGate') group.add(rakeGate(ribbon, s, animated));
    if (lm.kind === 'powerStation') group.add(powerStation(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'harmonicaGate') group.add(harmonicaGate(ribbon, s, animated));
    if (lm.kind === 'mirrorBall') group.add(mirrorBall(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'trunkGate') group.add(trunkGate(ribbon, s, animated));
    if (lm.kind === 'snowPeak') group.add(snowPeak(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'cordGate') group.add(cordGate(ribbon, s, animated));
    if (lm.kind === 'theiaPlanet') group.add(theiaPlanet(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'setGate') group.add(setGate(ribbon, s, animated));
    if (lm.kind === 'setColossus') group.add(setColossus(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'jadePortal') group.add(jadePortal(ribbon, s, animated));
    if (lm.kind === 'moonPalace') group.add(moonPalace(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'urukGate') group.add(urukGate(ribbon, s, animated));
    if (lm.kind === 'ziggurat') group.add(ziggurat(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'lockedDoor') group.add(lockedDoor(ribbon, s, animated));
    if (lm.kind === 'teacups') group.add(teacups(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'heavenGate') group.add(heavenGate(ribbon, s, animated));
    if (lm.kind === 'hillHouse') group.add(hillHouse(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'sitarGate') group.add(sitarGate(ribbon, s, animated));
    if (lm.kind === 'blackCup') group.add(blackCup(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'lostLegs') group.add(lostLegs(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'pillTube') group.add(pillTube(ribbon, s, animated));
    if (lm.kind === 'oldFord') group.add(oldFord(ribbon, s, animated));
    if (lm.kind === 'faceCloud') group.add(faceCloud(ribbon, s, lm.lateral ?? 0, animated));
    if (lm.kind === 'farmDam') group.add(farmDam(ribbon, s, track.def.pits, WATER_LEVEL, animated));
    if (lm.kind === 'dragonFlight') {
      const d = dragonFlight(track.def.bounds);
      group.add(d.group);
      animated.push(d.update);
    }
    if (lm.kind === 'lighthouse') {
      const l = lighthouse(ribbon, s, !!theme.banana);
      group.add(l.group);
      animated.push(l.update);
    }
    if (lm.kind === 'waterfall') {
      const w = waterfall(ribbon, s, mats);
      group.add(w.group);
      animated.push(w.update);
    }
  }
  // Where a road dives under water: kelp, fish, bubbles and light from the surface.
  const dives = abyss ? [] : track.def.pits.filter((p) => p.liquid === 'water' && divesInto(track, p));
  for (const p of dives) group.add(underwater(track, p, animated));
  if (!abyss) group.add(boundaryCliffs(track.def.bounds, mats));
  group.add(trackDetail(track, theme, animated));
  const life = trackLife(track, theme, animated);
  group.add(life.group);
  group.add(decor(track, mats, theme, animated));
  group.add(distant(theme));

  const skyMesh = group.children[0] as THREE.Mesh;
  const skyHue = skyMesh.userData.hue as { value: number };
  // Sun shadows (drawn only while the renderer's shadow map is on): everything solid casts and receives,
  // except the sky, the decals laid on the road, and anything see-through.
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o === skyMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const decal = o.renderOrder > 0 || mats.some((mt) => mt.polygonOffset || mt.transparent || mt.depthWrite === false);
    o.receiveShadow = !decal;
    o.castShadow = !decal && mats.every((mt) => (mt as THREE.MeshLambertMaterial).side !== THREE.BackSide);
  });
  const weather = theme.storm ? stormWeather(skyMesh.material as THREE.MeshBasicMaterial) : null;
  if (weather) group.add(weather.group);
  return {
    group,
    theme,
    dives,
    update(time: number, cameraPos: THREE.Vector3, hue = 0, lap?: LapContext) {
      for (const r of lapRoads) r.update(time, lap);
      skyHue.value = hue;
      padTexture.offset.y = -time * 2;
      // Desert barrier diamonds crawl along like scales.
      if (theme.barrier.crawl && mats.barrier.map) mats.barrier.map.offset.x = -time * 0.15;
      if (mats.lava.map) mats.lava.map.offset.set(time * 0.02, time * 0.035);
      skyMesh.position.copy(cameraPos);
      atmosphere.finalLap += ((lap?.lastLap ? 1 : 0) - atmosphere.finalLap) * 0.05;
      for (const a of animated) a(time);
      life.update(time, cameraPos);
      weather?.update(time, cameraPos);
    },
  };
}

function sky(theme: Theme): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: tex.skyTexture(theme.sky), side: THREE.BackSide, fog: false, depthWrite: false });
  const hue = { value: 0 };
  // Hue rotation about the grey axis, for the psychedelic sky cycle.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = hue;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHue;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          const vec3 k = vec3(0.57735);
          float c = cos(uHue);
          diffuseColor.rgb = diffuseColor.rgb * c + cross(k, diffuseColor.rgb) * sin(uHue) + k * dot(k, diffuseColor.rgb) * (1.0 - c);
        }`,
      );
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.userData.hue = hue;
  mesh.renderOrder = -1;
  return mesh;
}

/** The sky track's floor: a sea of cloud a long way down. */
function cloudSea(theme: Theme): THREE.Mesh {
  const map = theme.ground();
  map.repeat.set(2800 / theme.groundTile, 2800 / theme.groundTile);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), new THREE.MeshBasicMaterial({ map, fog: true }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -70;
  return mesh;
}

/** Desert floor with holes cut for pits. */
function ground(track: Track, theme: Theme): THREE.Mesh {
  const E = 1400;
  const shape = new THREE.Shape([
    new THREE.Vector2(-E, -E),
    new THREE.Vector2(E, -E),
    new THREE.Vector2(E, E),
    new THREE.Vector2(-E, E),
  ]);
  for (const p of track.def.pits) {
    // Shape space is (x, -z) because the mesh is rotated onto the XZ plane.
    const hole = pitCorners(p).map(([x, z]) => new THREE.Vector2(x, -z));
    shape.holes.push(new THREE.Path(hole));
  }
  // Roads sunk into the ground: the earth opens along them out to their rock walls.
  for (const r of [track.main, ...track.branches]) for (const hole of cutHoles(r)) shape.holes.push(new THREE.Path(hole));
  const geo = new THREE.ShapeGeometry(shape);
  const map = theme.ground();
  map.repeat.set(1 / theme.groundTile, 1 / theme.groundTile);
  // Pushed back in depth so roads lying at ground level never z-fight it.
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** How far out from the centerline each sample's walls stand: tall walls are jagged rock (wallJag), low ones a straight barrier. */
function wallOffsets(ribbon: Ribbon): Float32Array {
  const jag = wallJag(ribbon);
  return Float32Array.from(ribbon.halfWidth, (hw, i) => hw + 0.3 + (ribbon.wallHeight[i] >= 4 ? jag[i] : 0));
}

/** The jag of a ribbon's tall rock walls, the same every time it's asked for. */
function wallJag(ribbon: Ribbon): Float32Array {
  const rand = seededRandom(ribbon.spline.count);
  return Float32Array.from({ length: ribbon.spline.count }, () => rand() * 1.4);
}

/** Outlines (shape space: x, -z) of the ground to open over each sunk stretch of a ribbon, wall to wall. */
function cutHoles(ribbon: Ribbon): THREE.Vector2[][] {
  const sp = ribbon.spline;
  const off = wallOffsets(ribbon);
  const holes: THREE.Vector2[][] = [];
  for (let i = 0; i < sp.count; i++) {
    if (!ribbon.cut[i]) continue;
    let j = i;
    while (j + 1 < sp.count && ribbon.cut[j + 1]) j++;
    // One sample more each end, so the road's first dip below the ground shows too.
    const a = Math.max(0, i - 1);
    const b = Math.min(sp.count - 1, j + 1);
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    for (let k = a; k <= b; k++) {
      left.push(new THREE.Vector2(sp.px[k] + sp.tz[k] * off[k], -(sp.pz[k] - sp.tx[k] * off[k])));
      right.push(new THREE.Vector2(sp.px[k] - sp.tz[k] * off[k], -(sp.pz[k] + sp.tx[k] * off[k])));
    }
    holes.push([...left, ...right.reverse()]);
    i = j;
  }
  return holes;
}

/** Whether any road runs under the surface of pit `p`. */
function divesInto(track: Track, p: PitDef): boolean {
  return [track.main, ...track.branches].some((r) => {
    const sp = r.spline;
    for (let i = 0; i < sp.count; i++) if (r.heightAt(sp.dist[i]) < WATER_LEVEL - 1 && inPit(p, sp.px[i], sp.pz[i])) return true;
    return false;
  });
}

/**
 * The world under a lagoon's surface: kelp swaying on the floor, fish
 * circling, bubbles rising, shafts of light from above, and the surface
 * rippling overhead. Kept off the road.
 */
function underwater(track: Track, p: PitDef, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(Math.round(p.x * 7 + p.z * 13));
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const floor = -p.depth;
  const at = (a: number, b: number): [number, number] => [p.x + fx * a * p.halfLength - fz * b * p.halfWidth, p.z + fz * a * p.halfLength + fx * b * p.halfWidth];
  const offRoad = (x: number, z: number, margin: number) => [track.main, ...track.branches].every((r) => nearestOnSpline(r.spline, x, z).distance > Math.max(...r.halfWidth) + margin);

  // Kelp: tall ribbons rooted on the floor, swaying.
  const kelpGeo = new THREE.PlaneGeometry(0.9, 1, 1, 8);
  kelpGeo.translate(0, 0.5, 0);
  const kelpMats = [0x2a8a3a, 0x4aa040, 0x6a8a20].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  const kelp: { m: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    if (!offRoad(x, z, 2.5)) continue;
    const m = new THREE.Mesh(kelpGeo, kelpMats[i % 3]);
    const h = 4 + rand() * (p.depth - 5);
    m.scale.set(0.6 + rand() * 0.8, h, 1);
    m.position.set(x, floor, z);
    m.rotation.y = rand() * Math.PI;
    g.add(m);
    kelp.push({ m, phase: rand() * 6.3 });
  }
  // Rocks and coral heads on the floor.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const coralMats = [0xff6a8a, 0xffa040, 0xb070ff, 0x8a9aa0].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  for (let i = 0; i < 40; i++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    if (!offRoad(x, z, 1.5)) continue;
    const m = new THREE.Mesh(rockGeo, coralMats[i % 4]);
    m.scale.set(0.6 + rand() * 1.6, 0.5 + rand() * 1.4, 0.6 + rand() * 1.6);
    m.position.set(x, floor + 0.3, z);
    m.rotation.set(rand(), rand() * 6, rand());
    g.add(m);
  }
  // Fish: little schools circling at different depths.
  const fishGeo = new THREE.ConeGeometry(0.22, 0.8, 6);
  fishGeo.rotateX(Math.PI / 2);
  const fishMats = [0xffd23a, 0x3adcff, 0xff7a3a, 0xffffff].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 }));
  const schools: { fish: THREE.Mesh[]; cx: number; cz: number; y: number; r: number; speed: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const [cx, cz] = at(rand() * 1.6 - 0.8, rand() * 1.6 - 0.8);
    const fish: THREE.Mesh[] = [];
    for (let k = 0; k < 7; k++) {
      const f = new THREE.Mesh(fishGeo, fishMats[i % 4]);
      g.add(f);
      fish.push(f);
    }
    schools.push({ fish, cx, cz, y: floor + 2 + rand() * (p.depth - 5), r: 4 + rand() * 7, speed: (0.3 + rand() * 0.4) * (rand() < 0.5 ? -1 : 1) });
  }
  // Bubbles rising from the floor to the surface, and back round again.
  const bubbleTex = tex.glowTexture('rgba(255,255,255,0.9)', 'rgba(200,240,255,0)', 64);
  const bubbles: { s: THREE.Sprite; x: number; z: number; phase: number; speed: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, color: 0xd8f8ff, transparent: true, depthWrite: false, opacity: 0.7 }));
    s.scale.setScalar(0.15 + rand() * 0.3);
    g.add(s);
    bubbles.push({ s, x, z, phase: rand(), speed: 0.1 + rand() * 0.15 });
  }
  // Shafts of light slanting down from the surface.
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const [x, z] = at(rand() * 1.8 - 0.9, rand() * 1.8 - 0.9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5 + rand() * 3, p.depth), shaftMat);
    m.position.set(x, WATER_LEVEL - p.depth / 2, z);
    m.rotation.set(0, rand() * Math.PI, 0.25);
    g.add(m);
  }
  // The surface seen from below: a rippling sheet of light.
  const ripples = tex.lagoonTexture();
  ripples.repeat.set(p.halfLength / 6, p.halfWidth / 6);
  const corners = pitCorners(p);
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x, WATER_LEVEL - 0.05, z]).flat(), 3));
  under.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  under.setIndex([0, 1, 2, 0, 2, 3]);
  const ceiling = new THREE.Mesh(under, new THREE.MeshBasicMaterial({ map: ripples, color: 0x9ff0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  g.add(ceiling);

  animated.push((time) => {
    for (const k of kelp) k.m.rotation.z = Math.sin(time * 0.9 + k.phase) * 0.12;
    for (const sc of schools) {
      sc.fish.forEach((f, k) => {
        const a = time * sc.speed + k * 0.35;
        f.position.set(sc.cx + Math.cos(a) * sc.r + Math.sin(k * 2.1) * 0.6, sc.y + Math.sin(time * 1.3 + k) * 0.4, sc.cz + Math.sin(a) * sc.r);
        f.rotation.y = -a + (sc.speed > 0 ? 0 : Math.PI);
      });
    }
    for (const b of bubbles) {
      const u = (b.phase + time * b.speed) % 1;
      b.s.position.set(b.x + Math.sin(time * 2 + b.phase * 9) * 0.25, floor + u * (WATER_LEVEL - floor), b.z);
    }
    shaftMat.opacity = 0.06 + 0.03 * Math.sin(time * 0.7);
    ripples.offset.set(time * 0.03, time * 0.02);
  });
  return g;
}

function pitCorners(p: { x: number; z: number; heading: number; halfLength: number; halfWidth: number }): [number, number][] {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const rx = -fz;
  const rz = fx;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [p.x + fx * a * p.halfLength + rx * b * p.halfWidth, p.z + fz * a * p.halfLength + rz * b * p.halfWidth]);
}

function pitMesh(p: PitDef, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const corners = pitCorners(p);
  const floorGeo = new THREE.BufferGeometry();
  const floor = corners.map(([x, z]) => [x, -p.depth, z]).flat();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x / 12, z / 12]).flat(), 2));
  floorGeo.setIndex([0, 2, 1, 0, 3, 2]);
  floorGeo.computeVertexNormals();
  g.add(new THREE.Mesh(floorGeo, mats.mud));
  if (p.liquid) {
    // A glowing lava or water surface a little below ground level.
    const surface = new THREE.BufferGeometry();
    surface.setAttribute('position', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x, WATER_LEVEL, z]).flat(), 3));
    surface.setAttribute('uv', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x / 10, z / 10]).flat(), 2));
    surface.setIndex([0, 2, 1, 0, 3, 2]);
    surface.computeVertexNormals();
    g.add(new THREE.Mesh(surface, p.liquid === 'lava' ? mats.lava : p.liquid === 'oil' ? mats.oil : mats.water));
    if (p.liquid === 'oil') g.add(oilFires(corners));
  }

  const pos: number[] = [];
  const uv: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az) / 10;
    const v = p.depth / 10;
    pos.push(ax, 0, az, bx, 0, bz, ax, -p.depth, az, ax, -p.depth, az, bx, 0, bz, bx, -p.depth, bz);
    uv.push(0, v, len, v, 0, 0, 0, 0, len, v, len, 0);
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wallGeo.computeVertexNormals();
  g.add(new THREE.Mesh(wallGeo, mats.strata));
  return g;
}

/** How high a launcher's deck stands at its lip; the physics is the surface, so this is only the look of it. */
const LAUNCHER_LIFT = 0.7;

/**
 * A launcher (physics/kart.ts): a wedge across the road, rising along its
 * length to a lip, its deck of climbing chevrons scrolling up it, with a
 * glowing post at either end of the lip.
 */
function launcher(track: Track, l: Launcher, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const n = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const side: number[] = [];
  const edge = (k: number) => {
    const s = track.mainS(l.s + (l.length * k) / n);
    const p = pointAt(track.spline, s);
    const y = track.main.heightAt(s) + ROAD_LIFT;
    const lift = 0.05 + (LAUNCHER_LIFT * k) / n;
    const at = (lat: number) => [p.x - p.tz * lat, p.z + p.tx * lat] as const;
    return { left: at(l.lateral - l.halfWidth), right: at(l.lateral + l.halfWidth), y, lift };
  };
  const rows = Array.from({ length: n + 1 }, (_, k) => edge(k));
  for (let k = 0; k < n; k++) {
    const a = rows[k];
    const b = rows[k + 1];
    // The deck.
    const quad = [
      [a.left[0], a.y + a.lift, a.left[1], 0, k / n],
      [a.right[0], a.y + a.lift, a.right[1], 1, k / n],
      [b.right[0], b.y + b.lift, b.right[1], 1, (k + 1) / n],
      [b.left[0], b.y + b.lift, b.left[1], 0, (k + 1) / n],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(quad[i][0], quad[i][1], quad[i][2]);
      uv.push(quad[i][3], quad[i][4]);
    }
    // Its two sides, down to the road.
    for (const e of ['left', 'right'] as const) {
      const v = [
        [a[e][0], a.y, a[e][1]],
        [b[e][0], b.y, b[e][1]],
        [b[e][0], b.y + b.lift, b[e][1]],
        [a[e][0], a.y + a.lift, a[e][1]],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) side.push(...v[i]);
    }
  }
  // The lip's face.
  const z = rows[n];
  const face = [
    [z.left[0], z.y, z.left[1]],
    [z.right[0], z.y, z.right[1]],
    [z.right[0], z.y + z.lift, z.right[1]],
    [z.left[0], z.y + z.lift, z.left[1]],
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) side.push(...face[i]);

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const map = tex.launcherTexture();
  map.repeat.set(1, 2);
  g.add(new THREE.Mesh(deckGeo, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })));
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  sideGeo.computeVertexNormals();
  g.add(new THREE.Mesh(sideGeo, new THREE.MeshLambertMaterial({ color: 0x2a1a5a, side: THREE.DoubleSide })));

  // A post at each end of the lip, its lamp pulsing.
  const lamps: THREE.MeshBasicMaterial[] = [];
  for (const e of [z.left, z.right]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0xe8e8f4 }));
    post.position.set(e[0], z.y + 1.2, e[1]);
    g.add(post);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x6ae0ff });
    lamps.push(lampMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lampMat);
    lamp.position.set(e[0], z.y + 2.55, e[1]);
    g.add(lamp);
  }
  const cool = new THREE.Color(0x6ae0ff);
  const warm = new THREE.Color(0xc86aff);
  animated.push((time) => {
    map.offset.y = -time * 1.5;
    const k = 0.5 + 0.5 * Math.sin(time * 6);
    for (const m of lamps) m.color.copy(cool).lerp(warm, k);
  });
  return g;
}

/** Builds road, curbs, walls, ramp skirts and lip faces for one ribbon. */
/** `floating`: every stretch is a deck with an underside (the sky track), with no pillars. */
interface LapRoad {
  update(time: number, lap?: LapContext): void;
}

/** How deep a flooded road sinks: under the water's surface. */
const FLOOD_DEPTH = 4.5;

/**
 * A road that's only there on some laps (BranchDef.openOn), shown for the
 * lap of the kart being watched. A phantom flickers into being and out
 * again; a flooded road sinks under the tide.
 */
function lapRoad(def: BranchDef, ribbon: Ribbon, g: THREE.Group): LapRoad {
  let shown = 1;
  let last = 0;
  // A flooded road sinks its own height and then some, so even an arched bridge goes under.
  let floodDepth = FLOOD_DEPTH;
  for (let s = 0; s < ribbon.spline.length; s += 4) floodDepth = Math.max(floodDepth, FLOOD_DEPTH + ribbon.heightAt(s));
  return {
    update(time, lap) {
      const target = branchOpen(def, lap) ? 1 : 0;
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      // A second or so to come and go; at once on a fresh track.
      shown = time < 0.2 ? target : target > shown ? Math.min(1, shown + dt * 0.7) : Math.max(0, shown - dt * 0.7);
      switch (def.shut?.kind) {
        case 'vanish':
          g.visible = shown >= 1 || (shown > 0 && Math.random() < shown);
          break;
        case 'flood':
          g.position.y = -floodDepth * (1 - shown);
          g.visible = shown > 0;
          break;
      }
    },
  };
}

function ribbonMeshes(ribbon: Ribbon, mats: Materials, floating = false): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const segs = sp.closed ? sp.count : sp.count - 1;
  const road = new Map<RoadSurface, GeoBuilder>();
  const curbs = new GeoBuilder();
  const tallWalls = new GeoBuilder();
  const lowWalls = new GeoBuilder();
  const skirts = new GeoBuilder();

  const y = (i: number) => ribbon.heightAt(sp.dist[i]) + ROAD_LIFT;
  const edge = (i: number, lat: number, h: number): V3 => [sp.px[i] - sp.tz[i] * lat, h, sp.pz[i] + sp.tx[i] * lat];
  const jag = wallJag(ribbon);

  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % sp.count;
    const sMid = (sp.dist[i] + (j === 0 ? sp.length : sp.dist[j])) / 2;
    const prevGap = ribbon.inGap(sp.dist[i] - 0.01);
    const gap = ribbon.inGap(sMid);
    const hwi = ribbon.halfWidth[i];
    const hwj = ribbon.halfWidth[j];
    const yi = y(i);
    const yj = y(j);
    const v0 = sp.dist[i] / ROAD_TILE;
    const v1 = (j === 0 ? sp.length : sp.dist[j]) / ROAD_TILE;

    if (gap) {
      // Lip face where the road ends over a pit.
      if (!prevGap) skirts.quad(edge(i, -hwi, yi), edge(i, hwi, yi), edge(i, -hwi, -14), edge(i, hwi, -14), [0, 1], [0, 1.6]);
      continue;
    }
    if (ribbon.inGap(sp.dist[i] - 1.5)) {
      // Landing face rising out of the pit.
      skirts.quad(edge(i, hwi, yi), edge(i, -hwi, yi), edge(i, hwi, -14), edge(i, -hwi, -14), [0, 1], [0, 1.6]);
    }

    const surface = ribbon.surfaceAt(i);
    if (!road.has(surface)) road.set(surface, new GeoBuilder());
    const rb = road.get(surface)!;
    const uScale = surface === 'salt' ? 13 / ROAD_TILE : 1;
    rb.quad(edge(i, -hwi, yi), edge(j, -hwj, yj), edge(i, hwi, yi), edge(j, hwj, yj), [-uScale, uScale], [v0, v1], true);

    const wall = ribbon.wallHeight[i];
    if (wall === 0) {
      for (const side of [-1, 1]) {
        const a0 = edge(i, side * hwi, yi + 0.04);
        const a1 = edge(j, side * hwj, yj + 0.04);
        const b0 = edge(i, side * (hwi + CURB_WIDTH), yi + 0.04);
        const b1 = edge(j, side * (hwj + CURB_WIDTH), yj + 0.04);
        const cv0 = sp.dist[i] / 4;
        const cv1 = (j === 0 ? sp.length : sp.dist[j]) / 4;
        if (side < 0) curbs.quad(b0, b1, a0, a1, [0, 1], [cv0, cv1], true);
        else curbs.quad(a0, a1, b0, b1, [1, 0], [cv0, cv1], true);
      }
    } else {
      const tall = wall >= 4;
      const target = tall ? tallWalls : lowWalls;
      for (const side of [-1, 1]) {
        const off = (k: number, hw: number) => side * (hw + 0.3 + (tall ? jag[k] : 0));
        const vScale = tall ? 10 : 1;
        const u0 = sp.dist[i] / (tall ? 10 : 2.4);
        const u1 = (j === 0 ? sp.length : sp.dist[j]) / (tall ? 10 : 2.4);
        target.quad(
          edge(i, off(i, hwi), yi + wall),
          edge(j, off(j, hwj), yj + wall),
          edge(i, off(i, hwi), yi - 0.1),
          edge(j, off(j, hwj), yj - 0.1),
          [u0, u1],
          [wall / vScale, 0],
          false,
          true,
        );
      }
    }

    const deck = floating || ribbon.def.sections[ribbon.sectionIndex[i]]?.bridge;
    if (deck) {
      // Overpass: a slab with fascia, open underneath for the road below.
      const li = hwi + 0.6;
      const lj = hwj + 0.6;
      skirts.quad(edge(i, -li, yi - DECK_DEPTH), edge(j, -lj, yj - DECK_DEPTH), edge(i, li, yi - DECK_DEPTH), edge(j, lj, yj - DECK_DEPTH), [0, 1], [0, 1], true);
      for (const side of [-1, 1]) {
        skirts.quad(edge(i, side * li, yi + 0.05), edge(j, side * lj, yj + 0.05), edge(i, side * li, yi - DECK_DEPTH), edge(j, side * lj, yj - DECK_DEPTH), [sp.dist[i] / 10, sp.dist[j] / 10], [0.15, 0], false, true);
      }
    } else if ((yi < -0.05 || yj < -0.05) && !ribbon.cut[i]) {
      // Under water over a pit: the road runs on a bank of sand down to the floor.
      for (const side of [-1, 1]) {
        const lat = side * (hwi + CURB_WIDTH);
        const latj = side * (hwj + CURB_WIDTH);
        skirts.quad(edge(i, lat, yi), edge(j, latj, yj), edge(i, lat * 1.6, -16), edge(j, latj * 1.6, -16), [sp.dist[i] / 10, sp.dist[j] / 10], [1.6, 0], false, true);
      }
    } else if (yi > 0.05 || yj > 0.05) {
      for (const side of [-1, 1]) {
        const lat = side * (wall === 0 ? hwi + CURB_WIDTH : hwi + 0.3);
        const latj = side * (wall === 0 ? hwj + CURB_WIDTH : hwj + 0.3);
        if (ribbon.bank[i] && ribbon.bank[j]) {
          // An earth bank sloping down to the ground, as the physics has it (Track.bankHeight).
          const bi = lat + side * Math.max(0, yi) * BANK;
          const bj = latj + side * Math.max(0, yj) * BANK;
          skirts.quad(edge(i, lat, yi), edge(j, latj, yj), edge(i, bi, -0.05), edge(j, bj, -0.05), [sp.dist[i] / 10, sp.dist[j] / 10], [Math.max(yi, yj) / 6, 0], false, true);
        } else {
          skirts.quad(edge(i, lat, yi), edge(j, latj, yj), edge(i, lat, -14), edge(j, latj, -14), [sp.dist[i] / 10, sp.dist[j] / 10], [1.6, 0], false, true);
        }
      }
    }
  }

  for (const [surface, b] of road) g.add(b.mesh(mats.road[surface]));
  g.add(curbs.mesh(mats.curb));
  g.add(tallWalls.mesh(mats.strata));
  g.add(lowWalls.mesh(mats.barrier));
  g.add(skirts.mesh(mats.strata));
  if (!floating) g.add(pillars(ribbon, mats));
  return g;
}

const DECK_DEPTH = 1.3;

/** Columns under overpass decks, wherever they won't stand in the road below. */
function pillars(ribbon: Ribbon, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const geo = new THREE.CylinderGeometry(0.8, 1, 1, 10);
  let last = -Infinity;
  for (let i = 0; i < sp.count; i++) {
    if (!ribbon.def.sections[ribbon.sectionIndex[i]]?.bridge || sp.dist[i] - last < 14) continue;
    last = sp.dist[i];
    const top = ribbon.heightAt(sp.dist[i]) - DECK_DEPTH;
    for (const side of [-1, 1]) {
      const lat = side * (ribbon.halfWidth[i] - 1.5);
      const x = sp.px[i] - sp.tz[i] * lat;
      const z = sp.pz[i] + sp.tx[i] * lat;
      // Keep clear of any other stretch of this road (the one passing underneath).
      let blocked = false;
      for (let k = 0; k < sp.count && !blocked; k++) {
        const along = Math.abs(sp.dist[k] - sp.dist[i]);
        if (Math.min(along, sp.length - along) < 60) continue;
        blocked = Math.hypot(sp.px[k] - x, sp.pz[k] - z) < ribbon.halfWidth[k] + 3;
      }
      if (blocked) continue;
      const col = new THREE.Mesh(geo, mats.strata);
      col.scale.set(1, top, 1);
      col.position.set(x, top / 2, z);
      g.add(col);
    }
  }
  return g;
}

type V3 = [number, number, number];

/** Accumulates textured quads into one non-indexed geometry. */
class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];

  /**
   * Quad from a0-a1 (one edge) to b0-b1 (the other). With `uAlong`, u runs
   * a->b and v runs 0->1; otherwise u runs 0->1 along and v across.
   */
  quad(a0: V3, a1: V3, b0: V3, b1: V3, u: [number, number], v: [number, number], acrossU = false, alongU = false): void {
    this.pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
    if (acrossU) {
      this.uv.push(u[0], v[0], u[0], v[1], u[1], v[0], u[1], v[0], u[0], v[1], u[1], v[1]);
    } else if (alongU) {
      this.uv.push(u[0], v[0], u[1], v[0], u[0], v[1], u[0], v[1], u[1], v[0], u[1], v[1]);
    } else {
      this.uv.push(u[0], v[0], u[1], v[0], u[0], v[1], u[0], v[1], u[1], v[0], u[1], v[1]);
    }
  }

  mesh(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeVertexNormals();
    // Roads are wound inconsistently by side; render both faces.
    (material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    return new THREE.Mesh(geo, material);
  }
}

function startLine(track: Track): THREE.Mesh {
  const hw = track.main.halfWidth[0];
  const p = pointAt(track.spline, 0);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, 2.5),
    new THREE.MeshLambertMaterial({ map: tex.checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
  mesh.position.set(p.x, track.main.heightAt(0) + 0.05, p.z);
  return mesh;
}

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  const tl = Math.hypot(p.tx, p.tz) || 1;
  return { x: p.x, z: p.z, fx: p.tx / tl, fz: p.tz / tl, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

/** Giant bleached snake skeleton arching over the start line. */
function skeletonArch(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const span = ribbon.halfWidth[0] + 4;
  const rise = span * 0.9;
  const vert = new THREE.SphereGeometry(1, 12, 8);
  const rib = new THREE.TorusGeometry(2.6, 0.22, 6, 16, Math.PI * 1.2);
  const count = 23;
  for (let k = 0; k <= count; k++) {
    const a = (k / count) * Math.PI;
    const x = -Math.cos(a) * span;
    const y = Math.sin(a) * rise + 1;
    const v = new THREE.Mesh(vert, mats.bone);
    v.position.set(x, y, 0);
    v.scale.set(1.1, 0.9, 1.3);
    g.add(v);
    if (k > 1 && k < count - 1) {
      const r = new THREE.Mesh(rib, mats.bone);
      r.position.set(x, y, 0);
      r.rotation.set(0, Math.PI / 2, a - Math.PI / 2 + Math.PI * 0.4);
      g.add(r);
    }
  }
  // Skull resting on one end, jaws open toward the road.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), mats.bone);
  skull.scale.set(1.3, 0.8, 1.8);
  skull.position.set(span + 1.5, 2.2, 0);
  g.add(skull);
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 8), mats.bone);
    fang.rotation.x = Math.PI;
    fang.position.set(span + 1.5 + side * 0.9, 0.9, 2.6);
    g.add(fang);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Basalt gatehouse over the road: two crenellated towers, a lintel with glowing eyes. */
function fortressGate(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const tower = new THREE.BoxGeometry(5, 16, 5);
  const merlon = new THREE.BoxGeometry(1.2, 1.4, 1.2);
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(tower, mats.strata);
    t.position.set(side * (hw + 2.5), 8, 0);
    g.add(t);
    for (const [mx, mz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
      const m = new THREE.Mesh(merlon, mats.strata);
      m.position.set(side * (hw + 2.5) + mx, 16.7, mz);
      g.add(m);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 10, 3, 4), mats.strata);
  lintel.position.y = 12.5;
  g.add(lintel);
  const glow = tex.glowTexture('rgba(255,200,80,1)', 'rgba(255,60,0,0)');
  for (const side of [-1, 1]) {
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff7020, blending: THREE.AdditiveBlending, depthWrite: false }));
    eye.position.set(side * 2.6, 12.6, 2.2);
    eye.scale.setScalar(3);
    g.add(eye);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Stepped stone arch with a big faceted polygon on top. */
function templeGate(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const w = 5 - k;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 3, w), mats.strata);
      step.position.set(side * (hw + 2.5), 1.5 + k * 3, 0);
      g.add(step);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.4, 3.2), mats.strata);
  lintel.position.y = 12.6;
  g.add(lintel);
  const gem = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3, 0),
    new THREE.MeshPhongMaterial({ color: 0x3ad8a0, emissive: 0x0a4a30, shininess: 120, specular: 0xffffff, flatShading: true }),
  );
  gem.position.y = 17;
  g.add(gem);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A cliff beside the road with a falling sheet of water, mist and a pool. */
function waterfall(ribbon: Ribbon, s: number, mats: Materials): { group: THREE.Group; update: (time: number) => void } {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  // Set back from the road and angled to face oncoming karts.
  const falls = new THREE.Group();
  falls.position.set(ribbon.halfWidthAtS(s) + 16, 0, 0);
  falls.rotation.y = -0.7;
  g.add(falls);
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(34, 30, 10), mats.strata);
  cliff.position.set(9, 15, 0);
  cliff.rotation.y = Math.PI / 2;
  const waterTex = tex.waterfallTexture();
  waterTex.repeat.set(1.5, 1);
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 29),
    new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  fall.position.set(3.8, 15, 0);
  fall.rotation.y = Math.PI / 2;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24), mats.water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.08, 0);
  falls.add(cliff, fall, pool);
  const mist = tex.glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mist, transparent: true, opacity: 0.5, depthWrite: false }));
    m.position.set(1, 2 + k, (k - 1.5) * 3);
    m.scale.setScalar(9);
    falls.add(m);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return { group: g, update: (time) => (waterTex.offset.y = time * 1.6) };
}

/** Start gantry: two pylons and a banner with the track name between infinity signs. */
function gantry(ribbon: Ribbon, s: number, name: string): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const steel = new THREE.MeshPhongMaterial({ color: 0xd8dde8, shininess: 90, specular: 0xffffff });
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), steel);
    pylon.position.set(side * hw, 4.5, 0);
    g.add(pylon);
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  ['#ff5ad0', '#3ad8ff', '#7affb0', '#ffd23a', '#ff5ad0'].forEach((col, i) => grad.addColorStop(i / 4, col));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = 'italic 900 78px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2a0636';
  const label = `\u221E  ${name.toUpperCase()}  \u221E`;
  ctx.strokeText(label, 512, 68);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 512, 68);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 2.4, 0.4), [steel, steel, steel, steel, new THREE.MeshBasicMaterial({ map }), new THREE.MeshBasicMaterial({ map })]);
  banner.position.y = 8.2;
  g.add(banner);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A striped lighthouse beside the road, its lamp sweeping a beam round: red and white, or cobalt and banana yellow. */
function lighthouse(ribbon: Ribbon, s: number, banana = false): { group: THREE.Group; update: (time: number) => void } {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const tower = new THREE.Group();
  tower.position.set(-(ribbon.halfWidthAtS(s) + 14), 0, 0);
  g.add(tower);
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const r0 = 3.4 - k * 0.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.3, r0, 4, 16), new THREE.MeshLambertMaterial({ color: k % 2 ? (banana ? 0xffd21a : 0xf4f0e8) : banana ? 0x1f3fbf : 0xd8302a }));
    band.position.y = 2 + k * 4;
    tower.add(band);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 12), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
  lamp.position.y = 25.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  roof.position.y = 27.6;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture('rgba(255,250,210,1)', 'rgba(255,240,180,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 25.2;
  glow.scale.setScalar(9);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4, 60, 16, 1, true).translate(0, -30, 0).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const pivot = new THREE.Group();
  pivot.position.y = 25.2;
  pivot.add(beam);
  tower.add(lamp, roof, glow, pivot);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return { group: g, update: (time) => (pivot.rotation.y = time * 0.9) };
}

/** Two pillars of glacier ice and a lintel, see-through and glinting. */
function iceArch(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const ice = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, emissive: 0x1a3a5a, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(2.6 - k * 0.4, 0), ice);
      shard.scale.set(1, 2.4, 1);
      shard.position.set(side * (hw + 2 + k * 0.4), 4.5 + k * 3.6, (k - 1) * 0.6);
      shard.rotation.y = k + side;
      g.add(shard);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.2, 3), ice);
  lintel.position.y = 13;
  g.add(lintel);
  for (let k = -3; k <= 3; k++) {
    const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4 + Math.abs(k % 2) * 1.4, 6), ice);
    icicle.rotation.x = Math.PI;
    icicle.position.set((k / 3) * hw, 11.2, 0);
    g.add(icicle);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A gantry of neon tubes over the road with the city's name in lights. */
function neonArch(ribbon: Ribbon, s: number, banana = false): THREE.Group {
  const [aGlow, b, bGlow, ink, text] = banana ? ['#ffb81a', '#7aa4ff', '#2a5aff', '#fff4c0', 'DOOM CITY'] : ['#ff3ad8', '#8af0ff', '#3adcff', '#ffd0f4', 'CYBOOGIE CITY'];
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const tube = (color: number) => new THREE.MeshBasicMaterial({ color });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), new THREE.MeshLambertMaterial({ color: 0x1a1428 }));
    post.position.set(side * hw, 5, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), tube(new THREE.Color(side < 0 ? aGlow : bGlow).getHex()));
    stripe.position.set(side * hw, 5, 0.6);
    g.add(post, stripe);
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = banana ? '#050a24' : '#0a0614';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = '900 80px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 24;
  ctx.shadowColor = aGlow;
  ctx.fillStyle = ink;
  ctx.fillText(text, 512, 68);
  ctx.shadowColor = bGlow;
  ctx.strokeStyle = b;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 1008, 112);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1428 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 2.6, 0.4), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map }), new THREE.MeshBasicMaterial({ map })]);
  sign.position.y = 9;
  g.add(sign);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A rainbow bowed over the road, seven bands (cobalt and banana yellow in turn, in Flying Microtonal Banana's worlds). */
function rainbowArch(ribbon: Ribbon, s: number, banana = false): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const r = ribbon.halfWidthAtS(s) + 4;
  const colors = banana ? [0x1f3fbf, 0xffd21a, 0x3a6ae8, 0xffe66a, 0x16309a, 0xffc400, 0x2a4ad0] : [0xff5a7a, 0xffa64a, 0xffe45a, 0x6aef7a, 0x4ad0ff, 0x7a7aff, 0xc86aff];
  colors.forEach((color, k) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + k * 0.9, 0.45, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    g.add(band);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Iron Lung's gate: two giant toadstools leaning in over the road till their caps touch, spores drifting down from the gills. */
function mushroomArch(ribbon: Ribbon, s: number, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const stalk = new THREE.MeshLambertMaterial({ color: 0xf4ecd8 });
  const gills = new THREE.MeshLambertMaterial({ color: 0xe8d0a8, side: THREE.DoubleSide });
  const caps = ['#d8302a', '#8a4ad8'].map((c) => new THREE.MeshLambertMaterial({ map: tex.spotsTexture(c, '#fff8e8', 18) }));
  const H = 14;
  const R = hw * 0.75;
  for (const side of [-1, 1]) {
    const t = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, H, 14), stalk);
    stem.position.y = H / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), caps[side < 0 ? 0 : 1]);
    cap.scale.y = 0.6;
    cap.position.y = H;
    const under = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 24).rotateX(Math.PI / 2), gills);
    under.position.y = H + 0.02;
    t.add(stem, cap, under);
    t.position.x = side * (hw + 1.5);
    // Leaning in over the road, so the caps meet above its middle.
    t.rotation.z = side * 0.32;
    g.add(t);
  }
  // Spores: motes of light drifting down from the caps and round again.
  const spore = new THREE.SpriteMaterial({ map: tex.glowTexture('rgba(220,255,230,1)', 'rgba(150,255,210,0)'), blending: THREE.AdditiveBlending, depthWrite: false });
  const motes: THREE.Sprite[] = [];
  for (let k = 0; k < 24; k++) {
    const m = new THREE.Sprite(spore);
    m.scale.setScalar(0.5);
    m.position.set((k / 24 - 0.5) * hw * 2, 0, ((k * 7) % 5) - 2);
    g.add(m);
    motes.push(m);
  }
  animated.push((time) => {
    motes.forEach((m, k) => {
      m.position.y = H - 1 - ((time * 0.8 + k * 0.53) % (H - 1));
      m.position.x += Math.sin(time + k) * 0.004;
    });
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Fanged cave mouth swallowing the shortcut. */
function snakeMouth(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidth[0] + 1;
  const head = new THREE.MeshPhongMaterial({ color: 0x5d7a3a, shininess: 50, specular: 0x334422, map: tex.diamondTexture() });
  // Upper jaw slab and snout.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6, 3, 10), head);
  jaw.position.set(0, 8, 2);
  g.add(jaw);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 10), head);
    cheek.position.set(side * (hw + 1.5), 4, 2);
    g.add(cheek);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 10), mats.bone);
    fang.rotation.x = Math.PI;
    fang.position.set(side * hw * 0.55, 4.6, -2.6);
    g.add(fang);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshPhongMaterial({ color: 0xffd23a, emissive: 0x664400, shininess: 90 }));
    eye.position.set(side * (hw - 1), 9.8, -1);
    g.add(eye);
  }
  // Cave roof over the next stretch.
  const roofLen = 50;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2, 2, roofLen), mats.strata);
  roof.position.set(0, 7, 7 + roofLen / 2);
  g.add(roof);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

function boundaryCliffs(bounds: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const len = bounds * 2 + 40;
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.BoxGeometry(len, 30, 6);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 30), uv.getY(i) * 1);
    const wall = new THREE.Mesh(geo, mats.strata);
    const angle = (k * Math.PI) / 2;
    wall.position.set(Math.sin(angle) * (bounds + 4), 13, Math.cos(angle) * (bounds + 4));
    wall.rotation.y = angle;
    g.add(wall);
  }
  return g;
}

/** Silhouettes on the horizon, washed out by haze: mesas, hills, volcanoes or peaks, in two rings for depth. */
function distant(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(5);
  const far = new THREE.MeshLambertMaterial({ color: theme.distant.color });
  // The nearer ring sits a little out of the haze: a touch darker and more saturated.
  const near = new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.distant.color).multiplyScalar(0.8) });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false });
  const windowMats = [0xffd23a, 0xff3ad8, 0x3adcff].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
  for (const [ring, count, r0, rSpan, scale] of [[far, 18, 800, 300, 1], [near, 12, 560, 120, 0.6]] as const) {
    const mat = ring;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rand() * 0.2 + (scale < 1 ? 0.13 : 0);
      const r = r0 + rand() * rSpan;
      const h = (40 + rand() * 90) * scale;
      const w = (60 + rand() * 140) * scale;
      let mesh: THREE.Mesh;
      switch (theme.distant.shape) {
        case 'mesa':
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w, h, 7), mat);
          mesh.position.y = h / 2 - 2;
          // A darker cap band, like the hard layer that made the mesa.
          {
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w * 0.84, h * 0.12, 7), new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.distant.color).multiplyScalar(0.7) }));
            cap.position.y = h * 0.44;
            mesh.add(cap);
          }
          break;
        case 'hill':
          mesh = new THREE.Mesh(new THREE.SphereGeometry(w, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
          mesh.scale.y = (h / w) * 0.9;
          break;
        case 'volcano': {
          const vh = h * 2;
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.18, w, vh, 10), mat);
          mesh.position.y = vh / 2 - 2;
          const crater = new THREE.Mesh(new THREE.CircleGeometry(w * 0.16, 12), glowMat);
          crater.rotation.x = -Math.PI / 2;
          crater.position.y = vh / 2 + 0.5;
          mesh.add(crater);
          // A lava trickle down one flank.
          const flow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.04, vh * 0.6, w * 0.02), glowMat);
          flow.position.set(0, vh * 0.15, w * 0.45);
          flow.rotation.x = -0.4;
          mesh.add(flow);
          break;
        }
        case 'mountain': {
          mesh = new THREE.Mesh(new THREE.ConeGeometry(w, h * 2.2, 7), mat);
          mesh.position.y = h * 1.1 - 2;
          // Snow on the peak.
          const snow = new THREE.Mesh(new THREE.ConeGeometry(w * 0.34, h * 0.75, 7), new THREE.MeshLambertMaterial({ color: 0xf4f8ff }));
          snow.position.y = h * 0.73;
          mesh.add(snow);
          break;
        }
        case 'city': {
          // A cluster of towers with lit windows and a beacon on the tallest.
          mesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, h * 2, w * 0.3), mat);
          mesh.position.y = h - 2;
          for (let t = 0; t < 4; t++) {
            const th = h * (0.8 + rand() * 1.8);
            const tower = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, th, w * 0.2), mat);
            tower.position.set((rand() - 0.5) * w, th / 2 - h, (rand() - 0.5) * w * 0.4);
            mesh.add(tower);
            for (let wv = 0; wv < 3; wv++) {
              const lit = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.03, th * 0.05), windowMats[Math.floor(rand() * 3)]);
              lit.position.set((rand() - 0.5) * w * 0.14, (rand() - 0.5) * th * 0.8, w * 0.101);
              tower.add(lit);
            }
          }
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(w * 0.02, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false }));
          beacon.position.y = h + 1;
          mesh.add(beacon);
          break;
        }
        case 'cloud':
          mesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.6, 14, 10), mat);
          mesh.scale.set(1.6, 0.6, 1);
          mesh.position.y = (rand() - 0.3) * 120;
          break;
        case 'anvil': {
          // A supercell: a dark tower of cloud spreading into a flat anvil, a funnel hanging from its belly.
          const ah = h * 2.4;
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.7, ah, 14), mat);
          mesh.position.y = ah / 2 - 2;
          const top = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.6, w * 0.8, ah * 0.18, 16), mat);
          top.position.y = ah * 0.5;
          mesh.add(top);
          if (rand() < 0.35) {
            const funnel = new THREE.Mesh(new THREE.ConeGeometry(w * 0.08, ah * 0.5, 10), new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.distant.color).multiplyScalar(1.4) }));
            funnel.rotation.x = Math.PI;
            funnel.position.set(w * 0.9, -ah * 0.25, 0);
            mesh.add(funnel);
          }
          break;
        }
        case 'planet': {
          // Dead worlds hanging over the void, some ringed.
          mesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.5, 20, 14), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.6 + rand() * 0.35, 0.5, 0.25 + rand() * 0.15) }));
          mesh.position.y = 40 + rand() * 260 * scale;
          if (rand() < 0.5) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(w * 0.65, w * 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xc8a8ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, fog: false }));
            ring.rotation.x = Math.PI / 2 - 0.35;
            mesh.add(ring);
          }
          break;
        }
        case 'flare': {
          // A ruined refinery stack, a gas flare burning on top, smoke leaning off it.
          const sh = h * 1.6;
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.05, w * 0.09, sh, 8), mat);
          mesh.position.y = sh / 2 - 2;
          const fire = new THREE.Mesh(new THREE.ConeGeometry(w * 0.06, w * 0.22, 8), glowMat);
          fire.position.y = sh / 2 + w * 0.1;
          mesh.add(fire);
          const smoke = new THREE.Mesh(new THREE.SphereGeometry(w * 0.3, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1a0c0a, transparent: true, opacity: 0.7 }));
          smoke.scale.set(1.8, 0.7, 1);
          smoke.position.set(w * 0.25, sh / 2 + w * 0.35, 0);
          mesh.add(smoke);
          // A low black hill of spoil around its foot.
          const spoil = new THREE.Mesh(new THREE.SphereGeometry(w * 0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
          spoil.scale.y = 0.25;
          spoil.position.y = -sh / 2;
          mesh.add(spoil);
          break;
        }
      }
      mesh.position.x = Math.cos(a) * r;
      mesh.position.z = Math.sin(a) * r;
      mesh.rotation.y = rand() * 3;
      g.add(mesh);
    }
  }
  return g;
}

/** Rocks plus the theme's own scenery scattered off the road, for speed perception. */
function decor(track: Track, mats: Materials, theme: Theme, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7);
  const b = track.def.bounds - 6;
  const ribbons = [track.main, ...track.branches];
  const clear = (x: number, z: number) =>
    ribbons.every((r) => nearestOnSpline(r.spline, x, z).distance > Math.max(...r.halfWidth) + 8) &&
    track.def.pits.every((p) => !inPit({ ...p, halfWidth: p.halfWidth + 6, halfLength: p.halfLength + 6 }, x, z));

  const scale = densityScale();
  const rockCount = Math.round(scale * ({ jungle: 120, city: 0, sky: 0, lagoon: 60, glacier: 140, wasteland: 150, colony: 170, plains: 60, cosmos: 0, isle: 90, airstrip: 40, grove: 90, sea: 70, peaks: 120, alienSea: 40, garden: 30, shore: 110, ruins: 160, clouds: 0, cytoplasm: 60, spectrum: 40, foundry: 60, theatre: 30, boneyard: 140, pedalboard: 20, blight: 120, domes: 90, corona: 0, pit: 160, neurons: 50, opart: 0, panes: 20, static: 60, bandroom: 30, wetland: 60, party: 10, canopy: 90, hadean: 110, deshret: 60, moonpalace: 70, uruk: 90, nanshouse: 0, suburb: 30, headtrip: 40, paddock: 40 }[theme.decor as string] ?? 220));
  const featureCount = Math.round(scale * ({ jungle: 150, meadow: 110, lagoon: 120, glacier: 160, city: 90, sky: 90, wasteland: 110, colony: 110, plains: 140, cosmos: 110, isle: 140, airstrip: 110, grove: 170, sea: 120, peaks: 140, alienSea: 150, garden: 170, shore: 140, ruins: 120, clouds: 110, cytoplasm: 160, spectrum: 150, foundry: 150, theatre: 150, boneyard: 160, pedalboard: 160, blight: 150, domes: 140, corona: 160, pit: 160, neurons: 170, opart: 150, panes: 160, static: 170, bandroom: 160, wetland: 180, party: 160, canopy: 260, hadean: 170, deshret: 160, moonpalace: 170, uruk: 180, nanshouse: 190, suburb: 170, headtrip: 190, paddock: 170 }[theme.decor as string] ?? 70));
  // Sky and void scenery floats at all heights; city towers need room off the road.
  const floating = theme.decor === 'sky' || theme.decor === 'cosmos' || theme.decor === 'clouds';
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mats.rock, rockCount);
  const feature = featureBuilder(theme, mats, animated);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let features = 0;
  for (let tries = 0; tries < 4000 && (placed < rockCount || features < featureCount); tries++) {
    const x = (rand() * 2 - 1) * b;
    const z = (rand() * 2 - 1) * b;
    if (!clear(x, z)) continue;
    if (placed < rockCount && rand() < 0.6) {
      const s = 0.6 + rand() * 3.2;
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, s * 0.35, z), q, new THREE.Vector3(s, s * (0.5 + rand() * 0.8), s));
      rocks.setMatrixAt(placed++, m);
    } else if (features < featureCount) {
      const obj = feature(x, z, rand);
      if (floating) obj.position.y = -40 + rand() * 70;
      g.add(obj);
      features++;
    }
  }
  rocks.count = placed;
  g.add(rocks);
  return g;
}

type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;

/** Picks one of `kinds` by weight. */
function pick(rand: () => number, kinds: [number, Feature][]): Feature {
  const total = kinds.reduce((s, [w]) => s + w, 0);
  let r = rand() * total;
  for (const [w, f] of kinds) if ((r -= w) <= 0) return f;
  return kinds[kinds.length - 1][1];
}

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const blobGeo = new THREE.IcosahedronGeometry(1, 1);

/** Builds one piece of a theme's characteristic scenery; anything that moves registers in `animated`. */
function featureBuilder(theme: Theme, mats: Materials, animated: ((time: number) => void)[]): Feature {
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 1, 10);
  const at = (t: THREE.Object3D, x: number, z: number, rand: () => number, spin = true) => {
    t.position.set(x, 0, z);
    if (spin) t.rotation.y = rand() * Math.PI * 2;
    return t;
  };
  switch (theme.decor) {
    case 'wasteland':
      return wastelandFeature(mats, animated, trunkGeo);
    case 'colony':
      return colonyFeature(mats.rock, animated);
    case 'plains':
      return plainsFeature(animated);
    case 'cosmos':
      return cosmosFeature(mats.rock, animated);
    case 'isle':
      return isleFeature(mats.rock, animated);
    case 'airstrip':
      return airstripFeature(animated);
    case 'grove':
      return groveFeature(animated);
    case 'sea':
      return seaFeature(mats.rock, animated);
    case 'peaks':
      return peaksFeature(mats.rock, animated);
    case 'alienSea':
      return alienSeaFeature(animated);
    case 'garden':
      return gardenFeature(animated);
    case 'shore':
      return shoreFeature(mats.rock, animated);
    case 'ruins':
      return ruinsFeature(mats.rock, animated);
    case 'clouds':
      return cloudsFeature(animated);
    case 'cytoplasm':
      return cytoplasmFeature(animated);
    case 'spectrum':
      return spectrumFeature(animated);
    case 'foundry':
      return foundryFeature(mats.rock, animated);
    case 'theatre':
      return theatreFeature(animated);
    case 'boneyard':
      return boneyardFeature(mats.rock, animated);
    case 'pedalboard':
      return pedalboardFeature(animated);
    case 'blight':
      return blightFeature(mats.rock, animated);
    case 'domes':
      return domesFeature(mats.rock, animated);
    case 'corona':
      return coronaFeature(animated);
    case 'pit':
      return pitFeature(mats.rock, animated);
    case 'neurons':
      return neuronsFeature(animated);
    case 'opart':
      return opartFeature(animated);
    case 'panes':
      return panesFeature(animated);
    case 'static':
      return staticFeature(animated);
    case 'bandroom':
      return bandroomFeature(animated);
    case 'wetland':
      return wetlandFeature(animated);
    case 'party':
      return partyFeature(animated);
    case 'canopy':
      return canopyFeature(animated);
    case 'hadean':
      return hadeanFeature(animated);
    case 'deshret':
      return deshretFeature(animated);
    case 'moonpalace':
      return moonPalaceFeature(animated);
    case 'uruk':
      return urukFeature(animated);
    case 'nanshouse':
      return nanFeature(animated);
    case 'suburb':
      return suburbFeature(animated);
    case 'headtrip':
      return headtripFeature(animated);
    case 'paddock':
      return paddockFeature(animated);
    case 'lagoon': {
      const bark = lambert(0x9a7a52);
      const frond = lambert(0x3aa04a, { side: THREE.DoubleSide, flatShading: true });
      const frondGeo = new THREE.ConeGeometry(0.7, 4.4, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2.2).scale(1, 0.15, 1);
      const sand = lambert(0xe8d8a8);
      const thatch = lambert(0xc8a050, { flatShading: true });
      const plank = lambert(0x8a6a42);
      const sail = lambert(0xfff8ec, { side: THREE.DoubleSide });
      const stripes = (theme.banana ? [0x1f3fbf, 0xffd21a, 0x3a6ae8] : [0xff5a7a, 0x3adcff, 0xffd23a]).map((c) => lambert(c, { side: THREE.DoubleSide }));
      const islet: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        // A little sand islet with a palm or two leaning out over the water, sometimes a beach umbrella.
        const r0 = 3 + rand() * 3;
        const isle = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 + 1 + rand() * 2, 0.6, 14), sand);
        isle.position.y = 0.2;
        t.add(isle);
        const palms = rand() < 0.4 ? 2 : 1;
        for (let p = 0; p < palms; p++) t.add(palmTree(rand, trunkGeo, bark, frondGeo, frond, p * 2.2));
        if (rand() < 0.4) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), plank);
          pole.position.set(-r0 * 0.5, 1.6, 0);
          const shade = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 8, 1, true), stripes[Math.floor(rand() * 3)]);
          shade.position.set(-r0 * 0.5, 2.9, 0);
          const towel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 1.6), stripes[Math.floor(rand() * 3)]);
          towel.position.set(-r0 * 0.5 + 1, 0.52, 0.3);
          t.add(pole, shade, towel);
        }
        return at(t, x, z, rand);
      };
      const hut: Feature = (x, z, rand) => {
        // A thatched hut on stilts over the water, with a ladder down.
        const t = new THREE.Group();
        for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), plank);
          post.position.set(px, 1.5, pz);
          t.add(post);
        }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 4.4), plank);
        deck.position.y = 3;
        const room = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), lambert(0xd8b880));
        room.position.y = 4.1;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.2, 4), thatch);
        roof.position.y = 6.2;
        roof.rotation.y = Math.PI / 4;
        const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), lambert(0x3a2a1a));
        door.position.set(0, 3.8, 1.51);
        t.add(deck, room, roof, door);
        for (let k = 0; k < 4; k++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), plank);
          rung.position.set(0, 0.5 + k * 0.7, 2.3);
          t.add(rung);
        }
        return at(t, x, z, rand);
      };
      const boat: Feature = (x, z, rand) => {
        // A little sailboat rocking at anchor.
        const t = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 3.6, 8, 1, false, 0, Math.PI), stripes[Math.floor(rand() * 3)]);
        hull.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        hull.position.y = 0.4;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 6), plank);
        mast.position.y = 2.6;
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 3.8), new THREE.Vector2(1.9, 0)]);
        const sheet = new THREE.Mesh(new THREE.ShapeGeometry(shape), sail);
        sheet.position.set(0, 0.7, 0.1);
        sheet.rotation.y = Math.PI / 2;
        t.add(hull, mast, sheet);
        const ph = rand() * 6;
        animated.push((time) => {
          t.rotation.z = Math.sin(time * 1.1 + ph) * 0.08;
          t.position.y = Math.sin(time * 0.9 + ph) * 0.1;
        });
        return at(t, x, z, rand);
      };
      const gullRock: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + rand(), 0), mats.rock);
        rock.scale.y = 0.8;
        rock.position.y = 0.6;
        const gull = new THREE.Group();
        const white = lambert(0xffffff);
        gull.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.8, 1.6), white));
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.25), lambert(0x8a8a90));
          wing.position.set(side * 0.3, 0.05, -0.05);
          wing.rotation.z = side * 0.4;
          gull.add(wing);
        }
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), lambert(0xffb020));
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0.08, 0.42);
        gull.add(beak);
        gull.position.y = 1.9;
        t.add(rock, gull);
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[6, islet], [1.4, hut], [1.5, boat], [1.2, gullRock]])(x, z, rand);
    }
    case 'glacier': {
      const needles = lambert(0x2a5a48, { flatShading: true });
      const snow = lambert(0xf4f8ff, { flatShading: true });
      const ice = new THREE.MeshPhongMaterial({ color: 0xa8dcff, emissive: 0x10283a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.85, flatShading: true });
      const pine: Feature = (x, z, rand) => {
        // A snowy pine: stacked cones, white-capped, on a little drift.
        const t = new THREE.Group();
        const h = 5 + rand() * 6;
        const trunk = new THREE.Mesh(trunkGeo, lambert(0x4a3420));
        trunk.scale.set(0.4, h * 0.3, 0.4);
        trunk.position.y = h * 0.15;
        t.add(trunk);
        for (let k = 0; k < 3; k++) {
          const r = (1 - k * 0.25) * h * 0.32;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.45, 7), needles);
          cone.position.y = h * (0.3 + k * 0.22);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h * 0.2, 7), snow);
          cap.position.y = cone.position.y + h * 0.14;
          t.add(cone, cap);
        }
        const drift = new THREE.Mesh(new THREE.SphereGeometry(h * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), snow);
        drift.scale.y = 0.25;
        t.add(drift);
        return at(t, x, z, rand);
      };
      const shards: Feature = (x, z, rand) => {
        // Ice shards breaking through the snow.
        const t = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const h = 2 + rand() * 7;
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.9, h, 5), ice);
          shard.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
          shard.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6);
          t.add(shard);
        }
        return at(t, x, z, rand, false);
      };
      const igloo: Feature = (x, z, rand) => {
        // An igloo with its block courses and an entrance tunnel.
        const t = new THREE.Group();
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snow);
        t.add(dome);
        for (let k = 1; k < 4; k++) {
          const a = (k / 4) * (Math.PI / 2);
          const course = new THREE.Mesh(new THREE.TorusGeometry(Math.cos(a) * 2.62, 0.04, 4, 24), lambert(0xc8d8e8));
          course.rotation.x = Math.PI / 2;
          course.position.y = Math.sin(a) * 2.62;
          t.add(course);
        }
        const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 10, 1, false, 0, Math.PI), snow);
        tunnel.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        tunnel.rotation.order = 'ZXY';
        tunnel.position.set(0, 0, 2.6);
        const dark = new THREE.Mesh(new THREE.CircleGeometry(0.75, 10, 0, Math.PI), lambert(0x1a2a3a));
        dark.position.set(0, 0.01, 3.51);
        t.add(tunnel, dark);
        return at(t, x, z, rand);
      };
      const snowman: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        for (const [y, r] of [[0.8, 0.9], [2.1, 0.65], [3.1, 0.45]]) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), snow);
          ball.position.y = y;
          t.add(ball);
        }
        const coal = lambert(0x111111);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), coal);
          eye.position.set(side * 0.15, 3.2, 0.4);
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 5), lambert(0x5a3a22));
          arm.position.set(side * 1.0, 2.4, 0);
          arm.rotation.z = side * -1.0;
          t.add(eye, arm);
        }
        for (let k = 0; k < 3; k++) {
          const button = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), coal);
          button.position.set(0, 1.9 + k * 0.25, 0.62);
          t.add(button);
        }
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), lambert(0xff7a1a));
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 3.1, 0.65);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), coal);
        brim.position.y = 3.5;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 12), coal);
        crown.position.y = 3.8;
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 6, 14), lambert(0xd8302a));
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = 2.65;
        t.add(nose, brim, crown, scarf);
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[6, pine], [3, shards], [0.8, igloo], [0.7, snowman]])(x, z, rand);
    }
    case 'city': {
      const windows = theme.banana ? tex.windowsTexture(tex.BANANA.windows, tex.BANANA.windowDark) : tex.windowsTexture();
      const roofMat = lambert(theme.banana ? 0x080c22 : 0x120c1c);
      const trims = (theme.banana ? [0xffd21a, 0x3a6aff, 0xffe66a, 0x1f3fbf] : [0xff3ad8, 0x3adcff, 0xffd23a, 0x7aff9a]).map((c) => new THREE.MeshBasicMaterial({ color: c }));
      const metal = lambert(0x3a3448);
      const beacon = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
      const beacons: THREE.Mesh[] = [];
      animated.push((time) => {
        const on = Math.sin(time * 4) > 0.2;
        for (const b of beacons) b.visible = on;
      });
      return (x, z, rand) => {
        const t = new THREE.Group();
        const w = 5 + rand() * 4;
        const d = 5 + rand() * 4;
        const h = 12 + rand() * 50;
        const wall = (bw: number, bh: number) => {
          const map = windows.clone();
          map.needsUpdate = true;
          map.repeat.set(bw / 8, bh / 8);
          return new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.8 });
        };
        const lower = wall(w, h);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [lower, lower, roofMat, roofMat, lower, lower]);
        tower.position.y = h / 2;
        const trimMat = trims[Math.floor(rand() * trims.length)];
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), trimMat);
        trim.position.y = h;
        t.add(tower, trim);
        let top = h;
        // Some step back into a second, narrower block.
        if (rand() < 0.45) {
          const h2 = 6 + rand() * 16;
          const upper = wall(w * 0.6, h2);
          const set = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h2, d * 0.6), [upper, upper, roofMat, roofMat, upper, upper]);
          set.position.y = h + h2 / 2;
          const trim2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6 + 0.3, 0.3, d * 0.6 + 0.3), trimMat);
          trim2.position.y = h + h2;
          t.add(set, trim2);
          top = h + h2;
        }
        // A neon strip down one corner.
        if (rand() < 0.5) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.7, 0.25), trims[Math.floor(rand() * trims.length)]);
          strip.position.set(w / 2 + 0.1, h * 0.55, d / 2 + 0.1);
          t.add(strip);
        }
        // Rooftop clutter: an antenna with a blinking light, a water tank or vents.
        if (rand() < 0.5) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 6, 6), metal);
          mast.position.y = top + 3;
          const light = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), beacon);
          light.position.y = top + 6.1;
          beacons.push(light);
          t.add(mast, light);
        } else if (rand() < 0.6) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), lambert(0x5a4a3a));
          tank.position.y = top + 2.2;
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.8, 10), lambert(0x3a2a20));
          cap.position.y = top + 3.5;
          for (const lx of [-0.7, 0.7]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), metal);
            leg.position.set(lx, top + 0.65, 0);
            t.add(leg);
          }
          t.add(tank, cap);
        } else {
          for (let k = 0; k < 3; k++) {
            const vent = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), metal);
            vent.position.set((rand() - 0.5) * w * 0.5, top + 0.4, (rand() - 0.5) * d * 0.5);
            t.add(vent);
          }
        }
        t.position.set(x, 0, z);
        t.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
        return t;
      };
    }
    case 'sky': {
      const banana = theme.banana;
      const puff = lambert(banana ? 0xfff4d8 : 0xffffff, { emissive: banana ? 0x3a4a8a : 0x6a5a7a, flatShading: true });
      const crystal = (banana ? [0xffd21a, 0x3a6aff, 0xffe66a, 0x7aa4ff] : [0xff9ad8, 0x9ad8ff, 0xffe89a, 0xb89aff]).map((c) => new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, shininess: 120, flatShading: true }));
      const grass = lambert(banana ? 0xffd84a : 0x8ae07a, { flatShading: true });
      const earth = lambert(banana ? 0x2a48c0 : 0xb89ad8, { flatShading: true });
      const bands = (banana ? [0x1f3fbf, 0xffd21a, 0x3a6ae8, 0xffe66a, 0x16309a, 0xffc400] : [0xff5a7a, 0xffa64a, 0xffe45a, 0x6aef7a, 0x4ad0ff, 0xc86aff]).map((c) => lambert(c));
      const cloud: Feature = (x, z, rand) => {
        // A cloud: a few overlapping puffs.
        const t = new THREE.Group();
        const n = 3 + Math.floor(rand() * 4);
        for (let k = 0; k < n; k++) {
          const p = new THREE.Mesh(blobGeo, puff);
          const r = 2 + rand() * 4;
          p.scale.set(r * 1.3, r * 0.8, r);
          p.position.set((k - n / 2) * 3, rand() * 1.5, (rand() - 0.5) * 3);
          t.add(p);
        }
        return at(t, x, z, rand, false);
      };
      const gem: Feature = (x, z, rand) => {
        // A floating crystal, slowly turning.
        const t = new THREE.Group();
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.5 + rand() * 2.5, 0), crystal[Math.floor(rand() * crystal.length)]);
        c.scale.y = 1.8;
        t.add(c);
        const sp = 0.2 + rand() * 0.4;
        animated.push((time) => (c.rotation.y = time * sp));
        return at(t, x, z, rand, false);
      };
      const island: Feature = (x, z, rand) => {
        // A floating island: a rock cone hanging under a grassy top, a little crystal tree.
        const t = new THREE.Group();
        const r = 3 + rand() * 4;
        const under = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.8, 7), earth);
        under.rotation.x = Math.PI;
        under.position.y = -r * 0.9;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 0.6, 7), grass);
        t.add(under, top);
        const trunk = new THREE.Mesh(trunkGeo, lambert(0x8a6a9a));
        trunk.scale.set(0.5, 2.5, 0.5);
        trunk.position.set(r * 0.3, 1.5, 0);
        const crown = new THREE.Mesh(blobGeo, crystal[Math.floor(rand() * crystal.length)]);
        crown.scale.setScalar(1.5);
        crown.position.set(r * 0.3, 3.3, 0);
        t.add(trunk, crown);
        const inner = new THREE.Group();
        inner.add(...t.children);
        t.add(inner);
        const ph = rand() * 6;
        animated.push((time) => (inner.position.y = Math.sin(time * 0.6 + ph) * 0.8));
        return at(t, x, z, rand);
      };
      const balloon: Feature = (x, z, rand) => {
        // A hot air balloon in rainbow gores, bobbing.
        const t = new THREE.Group();
        const gores = 6;
        for (let k = 0; k < gores; k++) {
          const g = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 12, (k / gores) * Math.PI * 2, (Math.PI * 2) / gores), bands[(k + Math.floor(rand() * 6)) % 6]);
          g.scale.y = 1.2;
          g.position.y = 6;
          t.add(g);
        }
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.6, 1.4, 10, 1, true), bands[0]);
        skirt.position.y = 2.6;
        const basket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), lambert(0x9a6a3a));
        basket.position.y = 0.6;
        t.add(skirt, basket);
        for (const [rx, rz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), lambert(0x5a4a3a));
          rope.position.set(rx * 1.4, 1.6, rz * 1.4);
          t.add(rope);
        }
        const ph = rand() * 6;
        const inner = new THREE.Group();
        inner.add(...t.children);
        t.add(inner);
        animated.push((time) => (inner.position.y = Math.sin(time * 0.7 + ph) * 1.2));
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[6, cloud], [2, gem], [1.5, island], [0.8, balloon]])(x, z, rand);
    }
    case 'desert': {
      const flower = lambert(theme.banana ? 0x3a6aff : 0xff6ab0);
      const yellow = lambert(0xffd23a);
      const saguaro: Feature = (x, z, rand) => {
        const c = cactus(x, z, 3 + rand() * 4, rand() * Math.PI, trunkGeo, mats.cactus);
        if (rand() < 0.5) {
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flower);
          bloom.position.y = c.children[1].position.y + 0.35;
          c.add(bloom);
        }
        return c;
      };
      const pear: Feature = (x, z, rand) => {
        // Prickly pear: flat pads stacked edge on edge, pink fruit on the top ones.
        const t = new THREE.Group();
        const pad = new THREE.SphereGeometry(0.7, 10, 8).scale(1, 1.2, 0.25);
        const place = (px: number, py: number, rot: number, depth: number) => {
          const m = new THREE.Mesh(pad, mats.cactus);
          m.position.set(px, py, 0);
          m.rotation.set(0, rand() * 0.8, rot);
          t.add(m);
          if (depth === 0) {
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), flower);
            fruit.position.set(px + Math.sin(-rot) * 0.8, py + Math.cos(rot) * 0.8, 0);
            t.add(fruit);
            return;
          }
          for (const side of [-1, 1]) if (rand() < 0.75) place(px + side * 0.55, py + 1.1, rot + side * 0.45, depth - 1);
        };
        place(0, 0.8, 0, 2);
        return at(t, x, z, rand);
      };
      const barrels: Feature = (x, z, rand) => {
        // A cluster of barrel cacti, ribbed, with yellow crowns.
        const t = new THREE.Group();
        const n = 2 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const r = 0.4 + rand() * 0.4;
          const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mats.cactus);
          b.scale.y = 1.3;
          b.position.set((rand() - 0.5) * 2, r * 1.1, (rand() - 0.5) * 2);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), yellow);
          crown.position.set(b.position.x, b.position.y + r * 1.25, b.position.z);
          t.add(b, crown);
        }
        return at(t, x, z, rand, false);
      };
      const skull: Feature = (x, z, rand) => {
        // A bleached longhorn skull on a flat rock.
        const t = new THREE.Group();
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), mats.rock);
        rock.scale.set(1.3, 0.4, 1);
        rock.position.y = 0.3;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mats.bone);
        head.scale.set(1, 0.8, 1.4);
        head.position.y = 0.95;
        const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.6, 8), mats.bone);
        snout.rotation.x = Math.PI / 2;
        snout.position.set(0, 0.8, 0.6);
        t.add(rock, head, snout);
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.4, 6), mats.bone);
          horn.position.set(side * 0.9, 1.15, -0.1);
          horn.rotation.z = side * -1.2;
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), lambert(0x2a1a10));
          socket.position.set(side * 0.2, 1.05, 0.35);
          t.add(horn, socket);
        }
        return at(t, x, z, rand);
      };
      const hoodoo: Feature = (x, z, rand) => {
        // A hoodoo: eroded discs of strata pinched at the waist, a hard cap rock on top.
        const t = new THREE.Group();
        const n = 3 + Math.floor(rand() * 3);
        let y = 0;
        for (let k = 0; k < n; k++) {
          const h = 1.6 + rand() * 1.2;
          const r = 1.4 - Math.abs(k - n * 0.4) * 0.25 + rand() * 0.3;
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 9), mats.strata);
          disc.position.y = y + h / 2;
          disc.rotation.y = rand() * 3;
          t.add(disc);
          y += h;
        }
        const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), mats.rock);
        cap.scale.set(1.2, 0.45, 1.1);
        cap.position.y = y + 0.4;
        t.add(cap);
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[4.5, saguaro], [1.6, pear], [1.2, barrels], [0.8, skull], [1.3, hoodoo]])(x, z, rand);
    }
    case 'meadow': {
      const bark = lambert(0x6a4a2a);
      const leaves = [0x3f8f3a, 0x5aa840, 0x2f7a3a].map((c) => lambert(c, { flatShading: true }));
      const petals = [0xff5a7a, 0xffe45a, 0xffffff, 0xc86aff].map((c) => lambert(c));
      const tree: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        const h = 3 + rand() * 4;
        const trunk = new THREE.Mesh(trunkGeo, bark);
        trunk.scale.set(0.6, h, 0.6);
        trunk.position.y = h / 2;
        t.add(trunk);
        const mat = leaves[Math.floor(rand() * leaves.length)];
        for (let k = 0; k < 3; k++) {
          const crown = new THREE.Mesh(blobGeo, mat);
          const r = 1.6 + rand() * 1.4;
          crown.scale.setScalar(r);
          crown.position.set((rand() - 0.5) * 1.6, h + r * 0.4 + k * 0.6, (rand() - 0.5) * 1.6);
          t.add(crown);
        }
        // Some carry fruit.
        if (rand() < 0.35) {
          const fruit = lambert(rand() < 0.5 ? 0xd8202a : 0xffa020);
          for (let k = 0; k < 6; k++) {
            const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), fruit);
            const a = rand() * Math.PI * 2;
            f.position.set(Math.cos(a) * 1.8, h + 0.6 + rand() * 1.4, Math.sin(a) * 1.8);
            t.add(f);
          }
        }
        return at(t, x, z, rand, false);
      };
      const bales: Feature = (x, z, rand) => {
        // Round hay bales lying in the grass.
        const t = new THREE.Group();
        const straw = lambert(0xe0c060);
        for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 14), straw);
          b.rotation.z = Math.PI / 2;
          b.position.set(k * 2.1, 0.9, (rand() - 0.5) * 1.5);
          const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 4, 16), lambert(0xc8a040));
          swirl.rotation.y = Math.PI / 2;
          swirl.position.set(k * 2.1 + 0.71, 0.9, b.position.z);
          t.add(b, swirl);
        }
        return at(t, x, z, rand);
      };
      const flowers: Feature = (x, z, rand) => {
        // A flowering bush.
        const t = new THREE.Group();
        const bush = new THREE.Mesh(blobGeo, leaves[Math.floor(rand() * leaves.length)]);
        bush.scale.set(1.6, 1, 1.6);
        bush.position.y = 0.8;
        t.add(bush);
        const mat = petals[Math.floor(rand() * petals.length)];
        for (let k = 0; k < 10; k++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), mat);
          const a = rand() * Math.PI * 2;
          const e = rand() * 1.2;
          f.position.set(Math.cos(a) * Math.cos(e) * 1.6, 0.8 + Math.sin(e) * 1.0, Math.sin(a) * Math.cos(e) * 1.6);
          t.add(f);
        }
        return at(t, x, z, rand, false);
      };
      const windmill: Feature = (x, z, rand) => {
        // A little windmill, its sails turning.
        const t = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 7, 8), lambert(0xf4ece0));
        body.position.y = 3.5;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2, 8), lambert(0xa83a2a));
        cap.position.y = 8;
        const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), lambert(0x5a3a22));
        door.position.set(0, 0.8, 1.75);
        door.rotation.x = -0.08;
        const sails = new THREE.Group();
        sails.position.set(0, 7, 1.7);
        for (let k = 0; k < 4; k++) {
          const arm = new THREE.Group();
          arm.rotation.z = (k * Math.PI) / 2;
          const sail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.6, 0.05), lambert(0xfff8ec));
          sail.position.set(0.45, 2.2, 0);
          const spar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), bark);
          spar.position.y = 2.1;
          arm.add(sail, spar);
          sails.add(arm);
        }
        t.add(body, cap, door, sails);
        const sp = 0.5 + rand() * 0.6;
        animated.push((time) => (sails.rotation.z = time * sp));
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[6, tree], [1.2, bales], [1.6, flowers], [0.5, windmill]])(x, z, rand);
    }
    case 'volcanic': {
      const lava = new THREE.MeshBasicMaterial({ color: 0xff5a10 });
      const crust = lambert(0x1a1214, { flatShading: true });
      const ember = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
      const steam = tex.glowTexture('rgba(255,230,220,0.8)', 'rgba(255,230,220,0)');
      const pool: Feature = (x, z, rand) => {
        // A bubbling lava pool with a dark crust rim and a plume of steam.
        const t = new THREE.Group();
        const r = 2 + rand() * 4;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 16), lava);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.06;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.5, 6, 18), crust);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.1;
        t.add(disc, rim);
        const puffs: THREE.Sprite[] = [];
        for (let k = 0; k < 3; k++) {
          const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: steam, transparent: true, depthWrite: false, opacity: 0.4 }));
          t.add(p);
          puffs.push(p);
        }
        const ph = rand() * 10;
        animated.push((time) => {
          puffs.forEach((p, k) => {
            const u = (time * 0.25 + ph + k / 3) % 1;
            p.position.set(Math.sin(u * 4 + k) * 0.6, 1 + u * 9, 0);
            p.scale.setScalar(r * (0.8 + u * 1.6));
            p.material.opacity = 0.45 * (1 - u);
          });
        });
        return at(t, x, z, rand);
      };
      const spikes: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const h = 2 + rand() * 6;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.6 + rand(), h, 5), crust);
          spike.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
          spike.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
          t.add(spike);
        }
        return at(t, x, z, rand, false);
      };
      const charred: Feature = (x, z, rand) => {
        // A charred dead tree, its branch tips still glowing.
        const t = new THREE.Group();
        const h = 4 + rand() * 4;
        const trunk = new THREE.Mesh(trunkGeo, crust);
        trunk.scale.set(0.5, h, 0.5);
        trunk.position.y = h / 2;
        t.add(trunk);
        for (let k = 0; k < 4; k++) {
          const len = 1.2 + rand() * 1.6;
          const branch = new THREE.Group();
          branch.position.y = h * (0.5 + k * 0.12);
          branch.rotation.set(0, rand() * Math.PI * 2, 0.7 + rand() * 0.4);
          const stick = new THREE.Mesh(trunkGeo, crust);
          stick.scale.set(0.18, len, 0.18);
          stick.position.y = len / 2;
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), ember);
          tip.position.y = len;
          branch.add(stick, tip);
          t.add(branch);
        }
        return at(t, x, z, rand);
      };
      const columns: Feature = (x, z, rand) => {
        // Basalt columns: a cluster of hexagonal prisms at stepped heights.
        const t = new THREE.Group();
        const hex = new THREE.CylinderGeometry(0.7, 0.7, 1, 6);
        for (let k = 0; k < 9; k++) {
          const h = 1.5 + rand() * 6;
          const col = new THREE.Mesh(hex, mats.rock);
          const a = (k / 9) * Math.PI * 2;
          const rr = k === 0 ? 0 : 1.2 + (k % 2) * 0.6;
          col.scale.y = h;
          col.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
          t.add(col);
        }
        return at(t, x, z, rand);
      };
      return (x, z, rand) => pick(rand, [[3.5, pool], [3, spikes], [1.6, charred], [1.4, columns]])(x, z, rand);
    }
    case 'jungle': {
      const bark = lambert(0x7a5a36);
      const frond = lambert(0x2f8a3a, { side: THREE.DoubleSide, flatShading: true });
      const fern = lambert(0x4aa040, { flatShading: true });
      const frondGeo = new THREE.ConeGeometry(0.7, 4, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2).scale(1, 0.15, 1);
      const moss = lambert(0x4a7a3a, { flatShading: true });
      const palm: Feature = (x, z, rand) => at(palmTree(rand, trunkGeo, bark, frondGeo, frond), x, z, rand);
      const ferns: Feature = (x, z, rand) => {
        const t = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), fern);
          leaf.position.set((rand() - 0.5) * 1.5, 1, (rand() - 0.5) * 1.5);
          leaf.rotation.set((rand() - 0.5) * 1.2, rand() * 3, (rand() - 0.5) * 1.2);
          t.add(leaf);
        }
        return at(t, x, z, rand);
      };
      const bloom: Feature = (x, z, rand) => {
        // A giant jungle flower: five fleshy spotted petals round a deep centre.
        const t = new THREE.Group();
        const petal = lambert(rand() < 0.5 ? 0xd8303a : 0xff7a2a);
        const spot = lambert(0xfff0d0);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const p = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), petal);
          p.scale.set(0.9, 0.18, 1.3);
          p.position.set(Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2);
          p.rotation.y = -a + Math.PI / 2;
          t.add(p);
          for (let s = 0; s < 3; s++) {
            const d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), spot);
            d.position.set(Math.cos(a) * (0.9 + s * 0.4) + (s - 1) * 0.15, 0.48, Math.sin(a) * (0.9 + s * 0.4));
            t.add(d);
          }
        }
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.6, 12, 1, true), lambert(0x5a1a1a, { side: THREE.DoubleSide }));
        core.position.y = 0.5;
        t.add(core);
        return at(t, x, z, rand);
      };
      const shrooms: Feature = (x, z, rand) => {
        // A clump of tall glowing-capped mushrooms.
        const t = new THREE.Group();
        const capMat = new THREE.MeshLambertMaterial({ color: 0x6ad8c8, emissive: 0x1a5a50 });
        for (let k = 0; k < 3 + Math.floor(rand() * 3); k++) {
          const h = 1 + rand() * 2.5;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 8), lambert(0xf0e8d0));
          const px = (rand() - 0.5) * 2;
          const pz = (rand() - 0.5) * 2;
          stem.position.set(px, h / 2, pz);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4 + h * 0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
          cap.position.set(px, h, pz);
          t.add(stem, cap);
        }
        return at(t, x, z, rand, false);
      };
      const idol: Feature = (x, z, rand) => {
        // A mossy polygon idol: a blocky stone head half sunk in the ground.
        const t = new THREE.Group();
        const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 2.2), mats.rock);
        head.position.y = 1.4;
        head.rotation.z = (rand() - 0.5) * 0.2;
        const brow = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.6), mats.rock);
        brow.position.set(0, 2.3, 1.1);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.7), mats.rock);
        nose.position.set(0, 1.5, 1.3);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.1), lambert(0x1a1a14));
        mouth.position.set(0, 0.6, 1.12);
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 2.3), moss);
        top.position.y = 3.2;
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3ad8a0 });
        t.add(head, brow, nose, mouth, top);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), eyeMat);
          eye.position.set(side * 0.65, 1.95, 1.12);
          t.add(eye);
        }
        return at(t, x, z, rand);
      };
      // Iron Lung: the jungle's floor is a fungus's, toadstools taller than the trees and rings of them in the clearings.
      const capColors = [0xd8302a, 0xe8902a, 0x8a4ad8, 0xf0e0c0];
      const caps = capColors.map((c) => lambert(0xffffff, { map: tex.spotsTexture(`#${c.toString(16).padStart(6, '0')}`, '#fff8e8', 16) }));
      const gills = lambert(0xe8d8b8, { side: THREE.DoubleSide });
      const stalk = lambert(0xf4ecd8);
      const glow = new THREE.MeshLambertMaterial({ color: 0x9affd8, emissive: 0x2aa880, emissiveIntensity: 0.9 });
      const toadstool = (h: number, r: number, cap: THREE.Material, rand: () => number): THREE.Group => {
        const t = new THREE.Group();
        const lean = (rand() - 0.5) * 0.25;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.24, h, 12), stalk);
        stem.position.y = h / 2;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.2, h * 0.06, 12, 1, true), stalk);
        ring.position.y = h * 0.78;
        const top = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), cap);
        top.scale.y = 0.7;
        top.position.y = h - r * 0.1;
        const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 20).rotateX(Math.PI / 2), gills);
        under.position.y = h - r * 0.1 + 0.02;
        t.add(stem, ring, top, under);
        t.rotation.z = lean;
        return t;
      };
      const giant: Feature = (x, z, rand) => {
        // A toadstool the height of a house, sometimes with a smaller one leaning off its foot.
        const t = new THREE.Group();
        const h = 6 + rand() * 9;
        t.add(toadstool(h, h * (0.35 + rand() * 0.15), caps[Math.floor(rand() * caps.length)], rand));
        if (rand() < 0.5) {
          const small = toadstool(h * 0.45, h * 0.18, caps[Math.floor(rand() * caps.length)], rand);
          small.position.set(h * 0.3, 0, h * 0.1);
          t.add(small);
        }
        return at(t, x, z, rand);
      };
      const fairyRing: Feature = (x, z, rand) => {
        // A fairy ring: a circle of little toadstools on threads of glowing mycelium.
        const t = new THREE.Group();
        const R = 2.5 + rand() * 2.5;
        const cap = caps[Math.floor(rand() * caps.length)];
        const n = 9 + Math.floor(rand() * 5);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const m = toadstool(0.5 + rand() * 0.6, 0.35 + rand() * 0.2, cap, rand);
          m.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
          t.add(m);
        }
        const thread = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 4, 40).rotateX(Math.PI / 2), glow);
        thread.position.y = 0.05;
        t.add(thread);
        for (let k = 0; k < 4; k++) {
          const a = rand() * Math.PI * 2;
          const len = R * (1.5 + rand());
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 4).rotateZ(Math.PI / 2).translate(R + len / 2, 0.05, 0), glow);
          strand.rotation.y = a;
          t.add(strand);
        }
        return at(t, x, z, rand, false);
      };
      return (x, z, rand) => pick(rand, [[2.5, palm], [2.5, ferns], [0.6, bloom], [2.5, shrooms], [2.8, giant], [1.1, fairyRing], [0.4, idol]])(x, z, rand);
    }
  }
}

/** A palm with a leaning, segmented trunk and a crown of fronds; `offset` shifts it across its spot. */
function palmTree(
  rand: () => number,
  trunkGeo: THREE.BufferGeometry,
  bark: THREE.Material,
  frondGeo: THREE.BufferGeometry,
  frond: THREE.Material,
  offset = 0,
): THREE.Group {
  const t = new THREE.Group();
  const h = 6 + rand() * 6;
  const lean = (rand() - 0.5) * 0.7;
  const segs = 5;
  let top = new THREE.Vector3();
  for (let k = 0; k < segs; k++) {
    const seg = new THREE.Mesh(trunkGeo, bark);
    seg.scale.set(0.5 - k * 0.04, h / segs, 0.5 - k * 0.04);
    seg.position.set(Math.sin(lean * (k / segs)) * k * 0.8, (k + 0.5) * (h / segs), 0);
    seg.rotation.z = -lean * (k / segs);
    t.add(seg);
    top = seg.position.clone().setY(h);
  }
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(frondGeo, frond);
    f.position.copy(top);
    f.rotation.set(0.5 + rand() * 0.3, (k / 7) * Math.PI * 2, 0, 'YXZ');
    t.add(f);
  }
  t.position.x = offset;
  t.rotation.y = rand() * Math.PI * 2;
  return t;
}

function cactus(x: number, z: number, h: number, rot: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Group {
  const c = new THREE.Group();
  const trunk = new THREE.Mesh(geo, mat);
  trunk.scale.set(1, h, 1);
  trunk.position.y = h / 2;
  c.add(trunk);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  cap.position.y = h;
  c.add(cap);
  for (const side of [-1, 1]) {
    const armH = h * (0.25 + 0.15 * (side + 1));
    const arm = new THREE.Mesh(geo, mat);
    arm.scale.set(0.7, armH, 0.7);
    arm.position.set(side * 1.1, h * 0.5 + armH / 2, 0);
    c.add(arm);
    const elbow = new THREE.Mesh(geo, mat);
    elbow.scale.set(0.7, 1.1, 0.7);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.6, h * 0.5, 0);
    c.add(elbow);
  }
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  return c;
}

/** Fire licking across a burning oil pit: flame sprites over the slick, each flickering on its own. */
function oilFires(corners: [number, number][]): THREE.Group {
  const g = new THREE.Group();
  const flame = tex.glowTexture('rgba(255,200,90,1)', 'rgba(255,50,0,0)');
  const rand = seededRandom(Math.round(corners[0][0] * 7 + corners[0][1] * 13));
  const [a, b, , d] = corners;
  for (let k = 0; k < 14; k++) {
    const u = rand();
    const v = rand();
    const x = a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v;
    const z = a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: k % 3 ? 0xff7a20 : 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false }));
    const size = 3 + rand() * 4;
    const ph = rand() * 10;
    s.position.set(x, -1.5, z);
    s.scale.set(size, size * 1.6, 1);
    s.onBeforeRender = () => {
      const t = performance.now() / 1000;
      const k2 = 0.8 + Math.sin(t * 9 + ph) * 0.12 + Math.sin(t * 23 + ph * 2) * 0.08;
      s.scale.set(size * k2, size * 1.6 * k2, 1);
    };
    g.add(s);
  }
  return g;
}

/** The skull of a petrodragon arched over the road: fanged jaws for pillars, horns raking back, eyes still burning. */
function dragonGate(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), color: 0x9a8a7a, shininess: 25, specular: 0x332a22 });
  const black = new THREE.MeshPhongMaterial({ color: 0x140a0a, shininess: 60, specular: 0x553322 });
  // Lower jaw bones as the two pillars, teeth along their tops.
  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 13, 8), bone);
    jaw.position.set(side * (hw + 2), 6.5, 0);
    jaw.rotation.z = side * 0.12;
    g.add(jaw);
    for (let k = 0; k < 4; k++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 6), mats.bone);
      tooth.position.set(side * (hw + 0.6), 3 + k * 2.6, 0.8);
      tooth.rotation.z = side * -Math.PI / 2;
      g.add(tooth);
    }
  }
  // The cranium across the top, its snout pushed out over the oncoming road.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), bone);
  skull.scale.set(hw + 3, 4.2, 6);
  skull.position.set(0, 14.5, -1);
  g.add(skull);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.2, 9, 10), bone);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 13.2, -8);
  g.add(snout);
  // Upper fangs hanging over the road.
  for (let k = -3; k <= 3; k++) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.6 - Math.abs(k) * 0.3, 6), mats.bone);
    fang.rotation.x = Math.PI;
    fang.position.set((k / 3) * hw * 0.9, 10.4, -4 + Math.abs(k) * 0.8);
    g.add(fang);
  }
  // Horns raking back from the brow, nostrils, and eye sockets with fire still in them.
  for (const side of [-1, 1]) {
    const horn = new THREE.Group();
    horn.position.set(side * (hw * 0.6), 17, 1);
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - k * 0.13, 1.05 - k * 0.13, 2.2, 8), black);
      seg.position.set(side * k * 0.6, k * 1.8 - k * k * 0.12, k * 1.6);
      seg.rotation.set(0.6 + k * 0.12, 0, side * -0.3);
      horn.add(seg);
    }
    g.add(horn);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), black);
    socket.position.set(side * (hw * 0.45), 14.8, -5.6);
    g.add(socket);
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture('rgba(255,120,40,1)', 'rgba(255,20,0,0)'), color: 0xff3a10, blending: THREE.AdditiveBlending, depthWrite: false }));
    ember.position.set(side * (hw * 0.45), 14.8, -6.8);
    ember.scale.setScalar(4);
    g.add(ember);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), black);
    nostril.position.set(side * 1.2, 14, -12.4);
    g.add(nostril);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A petrodragon circling high over the track: black-red scales, bat wings beating, fire in its throat now and then. */
function dragonFlight(bounds: number): { group: THREE.Group; update: (time: number) => void } {
  const g = new THREE.Group();
  const dragon = new THREE.Group();
  g.add(dragon);
  const scales = new THREE.MeshPhongMaterial({ map: tex.scaleTexture('#5a1410', '#0a0404'), shininess: 70, specular: 0x663322 });
  const belly = new THREE.MeshPhongMaterial({ color: 0x3a2014, shininess: 30 });
  const membrane = new THREE.MeshPhongMaterial({ color: 0x2a0a08, emissive: 0x200402, side: THREE.DoubleSide, shininess: 20, transparent: true, opacity: 0.92 });
  // Neck, body and tail as a chain of shrinking segments along z.
  const segs: [number, number][] = [[10, 1.1], [8.5, 1.4], [7, 1.8], [5, 2.6], [2.5, 3.2], [0, 3.4], [-2.5, 3.0], [-5, 2.4], [-7.5, 1.8], [-10, 1.3], [-12.5, 0.9], [-15, 0.6], [-17.5, 0.35]];
  const body: THREE.Mesh[] = [];
  for (const [z, r] of segs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), z > 1 && z < 6 ? belly : scales);
    m.position.z = z;
    m.scale.y = 0.8;
    dragon.add(m);
    body.push(m);
  }
  // Spines down the back.
  for (const [z, r] of segs.slice(1, -2)) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, r * 0.9, 5), scales);
    spine.position.set(0, r * 0.75, z);
    spine.rotation.x = -0.5;
    dragon.add(spine);
  }
  // The head: a long jaw, horns, burning eyes.
  const head = new THREE.Group();
  head.position.set(0, 0.6, 12.4);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.2), scales));
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.6), scales);
  jaw.position.set(0, -1, 0.3);
  head.add(jaw);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 6), belly);
    horn.position.set(side * 0.8, 1.4, -1.6);
    horn.rotation.x = -1.1;
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
    eye.position.set(side * 0.95, 0.5, 1.2);
    head.add(eye);
  }
  const breath = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture('rgba(255,210,120,1)', 'rgba(255,60,0,0)'), color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false }));
  breath.position.set(0, -0.6, 5);
  head.add(breath);
  dragon.add(head);
  // Bat wings: a membrane on three finger bones, hinged at the shoulder.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(6, 3);
  wingShape.lineTo(14, 1.5);
  wingShape.quadraticCurveTo(11, -1, 13, -4);
  wingShape.quadraticCurveTo(9, -3, 9, -6);
  wingShape.quadraticCurveTo(5, -4, 3, -7);
  wingShape.quadraticCurveTo(1.5, -4, 0, -3.5);
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(Math.PI / 2);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 2.4, 1.2, 2.5);
    const w = new THREE.Mesh(wingGeo, membrane);
    w.scale.set(side, 1, 1);
    hinge.add(w);
    hinge.userData.side = side;
    dragon.add(hinge);
    wings.push(hinge);
  }
  dragon.scale.setScalar(1.4);
  const radius = bounds * 0.55;
  return {
    group: g,
    update: (time) => {
      // Circle the field, dipping and climbing, banked into the turn.
      const a = time * 0.09;
      dragon.position.set(Math.cos(a) * radius, 58 + Math.sin(time * 0.31) * 10, Math.sin(a) * radius);
      dragon.rotation.set(Math.sin(time * 0.31 + 1) * 0.12, -a + Math.PI, 0.35);
      const beat = Math.sin(time * 2.6);
      for (const w of wings) w.rotation.z = (w.userData.side as number) * (beat * 0.6 + 0.1);
      body.forEach((m, k) => (m.position.y = Math.sin(time * 2.6 - k * 0.5) * 0.4));
      // A burst of fire every eleven seconds or so.
      const u = (time % 11) / 11;
      const firing = u > 0.85;
      breath.visible = firing;
      breath.scale.setScalar(firing ? 6 + Math.random() * 4 : 0.01);
      jaw.rotation.x = firing ? 0.5 : 0.1;
    },
  };
}

/** The Petrodragonic wasteland: nodding pumpjacks, burning barrels, dead trees, dragon bones, flaring derricks, tar pits. */
function wastelandFeature(mats: Materials, animated: ((time: number) => void)[], trunkGeo: THREE.BufferGeometry): Feature {
  const iron = lambert(0x2a2224, { flatShading: true });
  const rust = new THREE.MeshLambertMaterial({ map: tex.rustTexture() });
  const ash = lambert(0x2a2422, { flatShading: true });
  const tar = new THREE.MeshPhongMaterial({ color: 0x050304, shininess: 150, specular: 0x9a8aa0 });
  const flame = tex.glowTexture('rgba(255,200,90,1)', 'rgba(255,50,0,0)');
  const fire = (parent: THREE.Object3D, y: number, size: number, ph: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.y = y;
    parent.add(s);
    animated.push((time) => s.scale.set(size * (0.85 + Math.sin(time * 11 + ph) * 0.15), size * (1.4 + Math.sin(time * 17 + ph) * 0.25), 1));
    return s;
  };
  const at = (t: THREE.Object3D, x: number, z: number, rand: () => number) => {
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI * 2;
    return t;
  };
  const pumpjack: Feature = (x, z, rand) => {
    // A nodding pumpjack: A-frame, walking beam with a horse head, crank and counterweight.
    const t = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 7), iron);
    base.position.y = 0.2;
    t.add(base);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.6, 0.25), rust);
      leg.position.set(side * 0.7, 2.4, 0);
      leg.rotation.z = side * 0.18;
      t.add(leg);
    }
    const beam = new THREE.Group();
    beam.position.y = 4.6;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 6.4), rust);
    const horseHead = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 12, 1, false, 0, Math.PI), iron);
    horseHead.rotation.set(0, 0, Math.PI / 2);
    horseHead.position.set(0, -0.3, 3.2);
    beam.add(bar, horseHead);
    t.add(beam);
    const crank = new THREE.Group();
    crank.position.set(0, 1.6, -2.6);
    const weight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.4), iron);
    weight.position.y = 0.8;
    crank.add(weight);
    t.add(crank);
    const wellhead = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 8), iron);
    wellhead.position.set(0, 0.9, 3.2);
    t.add(wellhead);
    const ph = rand() * 6;
    const rate = 0.9 + rand() * 0.5;
    animated.push((time) => {
      beam.rotation.x = Math.sin(time * rate + ph) * 0.28;
      crank.rotation.x = time * rate + ph;
    });
    return at(t, x, z, rand);
  };
  const barrels: Feature = (x, z, rand) => {
    // A huddle of oil drums, one burning.
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 12), k === 0 ? rust : lambert(rand() < 0.5 ? 0x5a1a14 : 0x2a3a2a));
      const lying = k > 2 && rand() < 0.6;
      drum.position.set((rand() - 0.5) * 2.4, lying ? 0.45 : 0.65, (rand() - 0.5) * 2.4);
      if (lying) drum.rotation.set(Math.PI / 2, 0, rand() * 3);
      t.add(drum);
      if (k === 0) fire(drum, 1.2, 2.4, rand() * 6).position.set(0, 1.2, 0);
    }
    return at(t, x, z, rand);
  };
  const deadTree: Feature = (x, z, rand) => {
    // A dead, ash-grey tree, all thorns.
    const t = new THREE.Group();
    const h = 4 + rand() * 5;
    const trunk = new THREE.Mesh(trunkGeo, ash);
    trunk.scale.set(0.45, h, 0.45);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    t.add(trunk);
    for (let k = 0; k < 5; k++) {
      const len = 1 + rand() * 2;
      const branch = new THREE.Group();
      branch.position.y = h * (0.4 + k * 0.12);
      branch.rotation.set(0, rand() * Math.PI * 2, 0.6 + rand() * 0.6);
      const stick = new THREE.Mesh(trunkGeo, ash);
      stick.scale.set(0.14, len, 0.14);
      stick.position.y = len / 2;
      branch.add(stick);
      t.add(branch);
    }
    return at(t, x, z, rand);
  };
  const bones: Feature = (x, z, rand) => {
    // A dragon's ribcage half sunk in the ground, its skull nearby.
    const t = new THREE.Group();
    const rib = new THREE.TorusGeometry(3.2, 0.25, 6, 16, Math.PI);
    for (let k = 0; k < 7; k++) {
      const r = new THREE.Mesh(rib, mats.bone);
      r.position.z = (k - 3) * 1.4;
      r.scale.setScalar(1 - Math.abs(k - 3) * 0.12);
      r.rotation.z = (rand() - 0.5) * 0.2;
      t.add(r);
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 6), mats.bone);
    spine.rotation.x = Math.PI / 2;
    spine.position.y = 3.1;
    t.add(spine);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), mats.bone);
    skull.scale.set(0.9, 0.7, 1.6);
    skull.position.set(1.5, 0.8, 7.5);
    skull.rotation.z = 0.4;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.4, 6), lambert(0x1a1010));
    horn.position.set(1.5, 2, 6.5);
    horn.rotation.x = -0.8;
    t.add(skull, horn);
    return at(t, x, z, rand);
  };
  const derrick: Feature = (x, z, rand) => {
    // An oil derrick: a tapering lattice tower with a gas flare roaring at the top.
    const t = new THREE.Group();
    const h = 14 + rand() * 8;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 5), rust);
      leg.position.set(lx * 1.2, h / 2, lz * 1.2);
      leg.rotation.set(-lz * 0.08, 0, lx * 0.08);
      t.add(leg);
    }
    for (let k = 1; k < 6; k++) {
      const s = 2.6 * (1 - k / 7);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(s, 0.12, s), rust);
      ring.position.y = (k / 6) * h;
      t.add(ring);
    }
    fire(t, h + 1.2, 4, rand() * 6);
    return at(t, x, z, rand);
  };
  const tarPit: Feature = (x, z, rand) => {
    // A tar pit: a glossy black pool with bubbles swelling and bursting.
    const t = new THREE.Group();
    const r = 2.5 + rand() * 3;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 18), tar);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 5, 18), ash);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    t.add(pool, rim);
    const bubbles: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tar);
      b.position.set((rand() - 0.5) * r, 0.05, (rand() - 0.5) * r);
      t.add(b);
      bubbles.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) => bubbles.forEach((b, k) => b.scale.setScalar(Math.max(0.01, ((time * 0.6 + ph + k * 0.37) % 1) * 1.6))));
    return at(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, pumpjack], [2, barrels], [3, deadTree], [1, bones], [1, derrick], [1.4, tarPit]])(x, z, rand);
}
