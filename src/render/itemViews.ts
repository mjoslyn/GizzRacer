import * as THREE from 'three';
import { CORD_STAGES, SERPENT_LENGTH, SERPENT_STAGES, STRING_STAGES, ARROW_DEPTH, ARROW_LANES, ARROW_STAGES, ELBOW_DEPTH, ELBOW_STAGES, EYE_DEPTH, EYE_HEIGHT, EYE_STAGES, FUZZ_RADIUS, RAKE_DEPTH, RAKE_LANES, RAKE_STAGES, SHEET_HALF, SHEET_STAGES, TIMBER_STAGES, fuzzLevel, timberFall } from '../items/hazards';
import { AIRLOCK_DEPTH, AIRLOCK_STAGES, BOULDER_STAGES, CRUSHER_STAGES, FLARE_CLEAR, FLARE_STAGES, RAT_LENGTH, RAT_STAGES, SMOG_RADIUS, SMOG_STAGES, flareHeight, GAMMA_EDGE, GAMMA_STAGES, GEYSER_ERUPT, GUST_STAGES, HOLE_CORE, JAWS_LUNGE, JET_STAGES, LIGHTNING_STRIKE, ROBOT_STAGES, VULTURE_STAGES, WAH_LIFT, WAH_STAGES, prismColour, type HazardPose } from '../items/hazards';
import { goblinFigure } from './omnium';
import { robotFigure, vultureFigure, wahPedalFigure } from './nonagon';
import { ratFigure } from './infest';
import { arrowGeometry, eyeFigure } from './mindfuzz';
import { cameraParts, poseCameras } from './mendThePast';
import { BOX_RESPAWN, SHIELD_ITEMS, WAVE_RANGE, type ItemHolder, type ItemSystem } from '../items/items';
import type { KartState } from '../physics/kart';
import type { HazardSystem } from '../items/hazards';
import { CUT_RIM } from '../tracks/track';
import { CELLOPHANE_COLOURS, TETRA_COLOURS, basaltTexture, fuzzRoadTexture, meterTexture, castleWallTexture, dustTexture, wingTexture, flameTexture, furTexture, glowTexture, itemBoxTexture, scaleTexture, stoneTexture, warningTexture, woodTexture } from './textures';

const MINE_POOL = 12;
const MISSILE_POOL = 8;
const WAVE_POOL = 4;
const SNAKE_SEGMENTS = 9;
const KART_POOL = 12;
const NOTE_POOL = 32;
const NOTES_PER_FLURRY = 10;
const FX_POOL = 4;
/** Seconds a broken item box takes to burst and vanish. */
const BOX_POP = 0.22;
/** A dragon's head height over the road. */
const DRAGON_HEAD_Y = 2.2;
/** How much higher it hangs down a cut's wall from the rim, and its neck's segments. */
const DRAGON_HANG = 2.6;
const DRAGON_NECK = 5;
/** How high over the road a razor's rod hangs from its gantry. */
const RAZOR_PIVOT = 9;

/** A kart as the items view draws around it: where it's shown this frame, and what it holds. */
export interface ItemKartView {
  state: KartState;
  holder: ItemHolder;
}

/** Item boxes, mines, missiles and wave rings, mirrored from an ItemSystem each frame. */
export class ItemsView {
  readonly group = new THREE.Group();
  private readonly boxes: THREE.Mesh[] = [];
  private readonly mines: THREE.Group[] = [];
  private readonly missiles: THREE.Group[] = [];
  private readonly waves: THREE.Mesh[] = [];
  /** Mines and missiles held in the slot, trailing behind their karts as shields. */
  private readonly heldMines: THREE.Group[] = [];
  private readonly heldPicks: THREE.Group[] = [];
  /** Road Train: a ring of drumheads round the kart. */
  private readonly auras: THREE.Mesh[] = [];
  private readonly notes: THREE.Sprite[] = [];
  private readonly drops: THREE.Mesh[] = [];
  private readonly cables: THREE.Line[] = [];
  private readonly wails: THREE.Mesh[] = [];
  private readonly beams: THREE.Group[] = [];
  private readonly surge: THREE.Group;
  /** Shards of glass flying off a broken box. */
  private readonly shards: THREE.Sprite[] = [];

  constructor(private readonly items: ItemSystem) {
    const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const boxMat = new THREE.MeshPhongMaterial({ map: itemBoxTexture(), shininess: 90, specular: 0xffffff, emissive: 0x402050, transparent: true, opacity: 0.92 });
    // A double box glows gold and holds a second box inside it.
    const doubleMat = new THREE.MeshPhongMaterial({ map: itemBoxTexture(), shininess: 90, specular: 0xffffff, emissive: 0x806010, color: 0xffe080, transparent: true, opacity: 0.85 });
    for (const b of items.boxes) {
      const m = new THREE.Mesh(boxGeo, b.double ? doubleMat : boxMat);
      if (b.double) {
        const inner = new THREE.Mesh(boxGeo, boxMat);
        inner.scale.setScalar(0.55);
        inner.rotation.set(0.7, 0.7, 0);
        m.add(inner);
      }
      m.position.set(b.x, b.y, b.z);
      this.boxes.push(m);
      this.group.add(m);
    }

    const glow = glowTexture();
    for (let i = 0; i < 16; i++) {
      const sh = sprite(glow, 0xfff0ff, 0.5);
      sh.visible = false;
      this.shards.push(sh);
      this.group.add(sh);
    }
    // Microtonal Banana: a ripe banana dropped on the road, glowing faintly.
    const bananaCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.75, 0.25, 0), new THREE.Vector3(0, -0.45, 0), new THREE.Vector3(0.75, 0.25, 0));
    const bananaGeo = new THREE.TubeGeometry(bananaCurve, 16, 0.24, 10, false);
    const bananaMat = new THREE.MeshPhongMaterial({ color: 0xffe040, emissive: 0x4a3000, shininess: 70 });
    const tipGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const tipMat = new THREE.MeshPhongMaterial({ color: 0x4a2a10 });
    const fretMat = new THREE.MeshBasicMaterial({ color: 0x8a5a10 });
    const fretGeo = new THREE.TorusGeometry(0.245, 0.02, 4, 12);
    for (let i = 0; i < MINE_POOL; i++) {
      const g = new THREE.Group();
      const banana = new THREE.Group();
      banana.add(new THREE.Mesh(bananaGeo, bananaMat));
      for (const t of [0, 1]) {
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.copy(bananaCurve.getPoint(t));
        banana.add(tip);
      }
      // Frets down the neck, a quarter tone apart.
      for (let k = 1; k < 7; k++) {
        const fret = new THREE.Mesh(fretGeo, fretMat);
        const t = k / 7;
        fret.position.copy(bananaCurve.getPoint(t));
        fret.lookAt(fret.position.clone().add(bananaCurve.getTangent(t)));
        banana.add(fret);
      }
      banana.rotation.x = 0.4;
      g.add(banana, sprite(glow, 0xffe070, 2.2));
      g.visible = false;
      this.mines.push(g);
      this.group.add(g);
    }

    // Big Fig Wasp: a mechanical wasp, wings buzzing, red saw-blade eyes.
    const wingGeo = new THREE.PlaneGeometry(0.9, 0.4);
    wingGeo.translate(0.45, 0, 0);
    wingGeo.rotateX(-Math.PI / 2);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffc820, emissive: 0x3a2000, shininess: 110, specular: 0xffffff });
    const stripeMat = new THREE.MeshPhongMaterial({ color: 0x1a1018, shininess: 60 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const abdomenGeo = new THREE.SphereGeometry(0.34, 14, 10);
    abdomenGeo.scale(1, 1, 1.7);
    const stripeGeo = new THREE.TorusGeometry(0.31, 0.05, 6, 16);
    const headGeo = new THREE.SphereGeometry(0.26, 12, 10);
    const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const stingGeo = new THREE.ConeGeometry(0.07, 0.4, 8);
    stingGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MISSILE_POOL; i++) {
      const g = new THREE.Group();
      const wings = [1, -1].map((side) => {
        const w = new THREE.Mesh(wingGeo, wingMat);
        w.scale.x = side;
        w.position.set(0, 0.25, 0.1);
        return w;
      });
      const abdomen = new THREE.Mesh(abdomenGeo, bodyMat);
      abdomen.position.z = -0.45;
      const stripes = [-0.25, -0.5, -0.75].map((z) => {
        const st = new THREE.Mesh(stripeGeo, stripeMat);
        st.position.z = z;
        st.scale.setScalar(1 - Math.abs(z + 0.45) * 0.6);
        return st;
      });
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.z = 0.35;
      const eyes = [1, -1].map((side) => {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        e.position.set(side * 0.15, 0.06, 0.52);
        return e;
      });
      const sting = new THREE.Mesh(stingGeo, stripeMat);
      sting.position.z = -1.05;
      g.add(...wings, abdomen, ...stripes, head, ...eyes, sting, sprite(glow, 0xffb040, 2.4));
      g.visible = false;
      this.missiles.push(g);
      this.group.add(g);
    }

    const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < WAVE_POOL; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x5affd0, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.visible = false;
      this.waves.push(m);
      this.group.add(m);
    }

    // Held items: a smaller banana or wasp riding behind the kart.
    for (let i = 0; i < KART_POOL; i++) {
      const mine = this.mines[0].clone();
      mine.scale.setScalar(0.6);
      mine.visible = false;
      this.heldMines.push(mine);
      const pickHeld = this.missiles[0].clone();
      pickHeld.scale.setScalar(0.6);
      pickHeld.visible = false;
      this.heldPicks.push(pickHeld);
      this.group.add(mine, pickHeld);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      aura.rotation.x = Math.PI / 2;
      aura.visible = false;
      this.auras.push(aura);
      this.group.add(aura);
    }

    const note = noteTexture();
    for (let i = 0; i < NOTE_POOL; i++) {
      const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: note, color: 0xb0ffe8, transparent: true, depthWrite: false }));
      n.scale.setScalar(0.9);
      n.visible = false;
      this.notes.push(n);
      this.group.add(n);
    }
    for (let i = 0; i < FX_POOL; i++) {
      const drop = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9a40ff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      drop.visible = false;
      this.drops.push(drop);
      const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xe0e8ff }));
      cable.frustumCulled = false;
      cable.visible = false;
      this.cables.push(cable);
      const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
      coneGeo.rotateX(-Math.PI / 2);
      coneGeo.translate(0, 0, 0.5);
      const wail = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      wail.visible = false;
      this.wails.push(wail);
      const beamGeo = new THREE.CylinderGeometry(0.18, 0.18, 1, 8, 1, true);
      beamGeo.rotateX(Math.PI / 2);
      beamGeo.translate(0, 0, 0.5);
      const beam = new THREE.Group();
      const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffd0f8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const halo = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff2ad0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(3, 3, 1);
      beam.add(core, halo, sprite(glow, 0xff60e0, 3));
      beam.visible = false;
      this.beams.push(beam);
      this.group.add(drop, cable, wail, beam);
    }

    // Nonagon Infinity: a nine-sided ring of green fire rolling down the road, end over end.
    this.surge = new THREE.Group();
    const ring = new THREE.Group();
    ring.add(
      new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.32, 8, 9), new THREE.MeshBasicMaterial({ color: 0x30ff90, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })),
      new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.7, 8, 9), new THREE.MeshBasicMaterial({ color: 0x20a060, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })),
    );
    // Facing down the road, it rolls about its axle.
    ring.rotation.y = Math.PI / 2;
    ring.position.y = 2.3;
    this.surge.add(ring, sprite(glow, 0x80ffc0, 7));
    this.surge.children[1].position.y = 2.3;
    this.surge.visible = false;
    this.group.add(this.surge);
  }

  update(elapsed: number, karts: readonly ItemKartView[] = []): void {
    let shard = 0;
    this.items.boxes.forEach((b, i) => {
      const m = this.boxes[i];
      // Just broken: it swells and spins away in a spray of glass. Then it pops back in over the last half second of the respawn.
      const broken = BOX_RESPAWN - b.respawn;
      const popping = b.respawn > 0 && broken < BOX_POP;
      const scale = popping ? 1 + (broken / BOX_POP) * 0.9 : b.respawn === 0 ? 1 : Math.max(0, 1 - b.respawn / 0.5);
      m.visible = scale > 0.01;
      m.scale.setScalar(scale * (b.double ? 1.2 : 1));
      m.position.y = b.y + Math.sin(elapsed * 2.4 + i) * 0.18;
      m.rotation.set(0.5, elapsed * (popping ? 14 : 1.6) + i, 0.3);
      if (b.respawn > 0 && broken < 0.5) {
        const u = broken / 0.5;
        for (let k = 0; k < 4 && shard < this.shards.length; k++, shard++) {
          const sh = this.shards[shard];
          const a = i * 1.7 + k * (Math.PI / 2);
          sh.visible = true;
          sh.position.set(b.x + Math.cos(a) * u * 3, b.y + u * 2 - u * u * 3, b.z + Math.sin(a) * u * 3);
          sh.material.opacity = 1 - u;
          sh.material.color.setHex(b.double ? 0xffe080 : 0xfff0ff);
        }
      }
    });
    for (; shard < this.shards.length; shard++) this.shards[shard].visible = false;
    this.updateHeld(elapsed, karts);
    this.updateBursts(elapsed, karts);
    this.mines.forEach((g, i) => {
      const m = this.items.mines[i];
      g.visible = !!m;
      if (!m) return;
      g.position.set(m.x, m.y + 0.7 + Math.sin(elapsed * 5 + i) * 0.1, m.z);
      g.rotation.y = elapsed * 2.5;
    });
    this.missiles.forEach((g, i) => {
      const m = this.items.missiles[i];
      g.visible = !!m;
      if (!m) return;
      g.position.set(m.x, m.y, m.z);
      g.rotation.set(0, m.heading, 0);
      // Wings buzzing.
      const flap = Math.sin(elapsed * 60) * 0.5;
      g.children[0].rotation.z = flap;
      g.children[1].rotation.z = -flap;
    });
    this.waves.forEach((r, i) => {
      const w = this.items.waves[i];
      r.visible = !!w;
      if (!w) return;
      const t = w.age / 0.8;
      r.position.set(w.x, w.y + 0.5, w.z);
      r.scale.setScalar(1 + (WAVE_RANGE - 1) * Math.min(1, t * 1.6));
      (r.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    });
  }

  /** Shields trailing behind, and the Road Train's ring. */
  private updateHeld(elapsed: number, karts: readonly ItemKartView[]): void {
    for (let i = 0; i < KART_POOL; i++) {
      const k = karts[i];
      const held = k && k.holder.rolling === 0 ? k.holder.item : null;
      const shield = held && SHIELD_ITEMS.includes(held) ? held : null;
      const mine = this.heldMines[i];
      const pick = this.heldPicks[i];
      mine.visible = shield === 'microtonalMine';
      pick.visible = shield === 'riffMissile';
      const aura = this.auras[i];
      aura.visible = !!k && k.state.ramTime > 0;
      if (!k) continue;
      const s = k.state;
      const fx = Math.sin(s.heading);
      const fz = Math.cos(s.heading);
      const bob = Math.sin(elapsed * 6 + i) * 0.12;
      if (shield) {
        const g = shield === 'microtonalMine' ? mine : pick;
        g.position.set(s.x - fx * 2.3, s.y + 0.7 + bob, s.z - fz * 2.3);
        g.rotation.set(0, s.heading + (shield === 'microtonalMine' ? elapsed * 2.5 : 0), 0);
      }
      if (aura.visible) {
        aura.position.set(s.x, s.y + 0.6, s.z);
        aura.scale.setScalar(1 + Math.sin(elapsed * 30) * 0.08);
        (aura.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.ramTime) * (0.6 + 0.4 * Math.abs(Math.sin(elapsed * 15)));
      }
    }
  }

  /** The band's items going off, and the Nonagon Infinity. */
  private updateBursts(elapsed: number, karts: readonly ItemKartView[]): void {
    const at = (h: ItemHolder | null) => (h ? karts.find((k) => k.holder === h)?.state ?? h.state : null);
    let note = 0;
    let drop = 0;
    let cable = 0;
    let wail = 0;
    let beam = 0;
    for (const b of this.items.bursts) {
      const u = Math.min(1, b.age / b.life);
      const from = at(b.from);
      const ox = from?.x ?? b.x;
      const oy = from?.y ?? b.y;
      const oz = from?.z ?? b.z;
      switch (b.kind) {
        case 'fluteFlurry':
          // Notes fan out ahead along the cone.
          for (let k = 0; k < NOTES_PER_FLURRY && note < NOTE_POOL; k++, note++) {
            const n = this.notes[note];
            const a = b.heading + (k / (NOTES_PER_FLURRY - 1) - 0.5) * 0.9;
            const d = b.len * Math.min(1, u * 1.2 + (k % 3) * 0.05);
            n.visible = true;
            n.position.set(b.x + Math.sin(a) * d, b.y + 1.2 + Math.sin(elapsed * 12 + k) * 0.4, b.z + Math.cos(a) * d);
            n.material.opacity = 1 - u;
          }
          break;
        case 'bassDrop': {
          const r = this.drops[drop++];
          if (!r) break;
          r.visible = true;
          r.position.set(ox, oy + 0.4, oz);
          r.scale.setScalar(1 + b.len * 0.6 * u);
          (r.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
          break;
        }
        case 'patchCable': {
          const line = this.cables[cable++];
          const to = at(b.to);
          if (!line || !to) break;
          line.visible = true;
          // A cable sagging between the two karts, pulled taut as it ends.
          const pos = line.geometry.attributes.position as THREE.BufferAttribute;
          const sag = 1.5 * (1 - u);
          for (let k = 0; k < pos.count; k++) {
            const t = k / (pos.count - 1);
            pos.setXYZ(k, ox + (to.x - ox) * t, oy + 1 + (to.y - oy) * t - Math.sin(t * Math.PI) * sag, oz + (to.z - oz) * t);
          }
          pos.needsUpdate = true;
          break;
        }
        case 'harmonicaWail': {
          const c = this.wails[wail++];
          if (!c) break;
          c.visible = true;
          c.position.set(ox, oy + 0.8, oz);
          c.rotation.set(0, b.heading, 0);
          const reach = b.len * Math.min(1, u * 2);
          c.scale.set(reach * 0.7, 2, reach);
          (c.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - u);
          break;
        }
        case 'keytarLaser': {
          const g = this.beams[beam++];
          if (!g) break;
          g.visible = true;
          g.position.set(b.x, b.y + 1, b.z);
          g.rotation.set(0, b.heading, 0);
          for (const c of g.children.slice(0, 2)) c.scale.z = b.len;
          g.children[2].position.set(0, 0, b.len);
          g.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (c === g.children[1] ? 0.5 : 1) * (1 - u)));
          break;
        }
      }
    }
    for (; note < NOTE_POOL; note++) this.notes[note].visible = false;
    for (; drop < FX_POOL; drop++) this.drops[drop].visible = false;
    for (; cable < FX_POOL; cable++) this.cables[cable].visible = false;
    for (; wail < FX_POOL; wail++) this.wails[wail].visible = false;
    for (; beam < FX_POOL; beam++) this.beams[beam].visible = false;

    const w = this.items.surge;
    this.surge.visible = !!w;
    if (w) {
      this.surge.position.set(w.x, w.y, w.z);
      this.surge.rotation.y = w.heading;
      this.surge.children[0].rotation.x = -elapsed * 8;
    }
  }
}

let noteCache: THREE.CanvasTexture | null = null;

/** A pair of quavers, white on clear, for the Sleep Drifter. */
function noteTexture(): THREE.CanvasTexture {
  if (noteCache) return noteCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  for (const x of [16, 44]) {
    g.beginPath();
    g.ellipse(x, 48, 9, 7, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x + 7, 46);
    g.lineTo(x + 7, 12);
    g.stroke();
  }
  g.fillRect(21, 9, 32, 7);
  noteCache = new THREE.CanvasTexture(c);
  return noteCache;
}

/** Snakes, dust devils, tumbleweeds and boulders, posed from a HazardSystem each frame. */
export class HazardsView {
  readonly group = new THREE.Group();
  private readonly views: { pose: HazardPose; obj: THREE.Object3D; parts: THREE.Object3D[] }[] = [];

  constructor(hazards: HazardSystem) {
    const scales = scaleTexture('#c8a060', '#5a3a18');
    scales.repeat.set(2, 1);
    const snakeMat = new THREE.MeshPhongMaterial({ map: scales, shininess: 60, specular: 0x887755 });
    const bellyMat = new THREE.MeshPhongMaterial({ color: 0xe8d8a0, shininess: 30 });
    const segGeo = new THREE.SphereGeometry(0.42, 10, 8);
    const headGeo = new THREE.SphereGeometry(0.5, 12, 10);
    headGeo.scale(0.9, 0.7, 1.35);
    const rattleGeo = new THREE.SphereGeometry(0.15, 8, 6);
    rattleGeo.scale(1, 0.7, 1.4);
    const rattleMat = new THREE.MeshPhongMaterial({ color: 0xb89a60, shininess: 50 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe020 });
    const eyeGeo = new THREE.SphereGeometry(0.09, 6, 4);

    const dust = dustTexture();
    const funnelGeo = new THREE.CylinderGeometry(3.6, 0.6, 9, 24, 1, true);
    funnelGeo.translate(0, 4.5, 0);

    const twigMat = new THREE.LineBasicMaterial({ color: 0x8a6430 });
    const weedGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.9, 1));
    const weedCore = new THREE.MeshLambertMaterial({ color: 0x9a7438, transparent: true, opacity: 0.45 });
    const weedCoreGeo = new THREE.IcosahedronGeometry(0.75, 1);

    const rock = stoneTexture([92, 64, 44], [170, 128, 90]);
    const boulderGeo = new THREE.DodecahedronGeometry(1.7, 1);
    const boulderMat = new THREE.MeshPhongMaterial({ map: rock, shininess: 8, flatShading: true });
    const warnGeo = new THREE.PlaneGeometry(1, 1);
    warnGeo.rotateX(-Math.PI / 2);
    const warnTex = warningTexture();
    const dust0 = dustTexture();

    const magma = new THREE.MeshPhongMaterial({ map: basaltTexture(), color: 0x6a3020, emissive: 0xff3a08, emissiveIntensity: 0.6, flatShading: true });
    const crude = new THREE.MeshPhongMaterial({ color: 0x080506, emissive: 0x2a0800, shininess: 150, specular: 0xaa8866 });
    const dragonScales = new THREE.MeshPhongMaterial({ map: scaleTexture('#5a1410', '#0a0404'), shininess: 70, specular: 0x663322 });
    const dragonHorn = new THREE.MeshPhongMaterial({ color: 0x1a1010, shininess: 50 });
    const dragonEye = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    const heat = glowTexture('rgba(255,160,60,1)', 'rgba(255,60,0,0)');
    const flames = flameTexture();
    const nozzleGeo = new THREE.CylinderGeometry(0.45, 0.6, 1.2, 10);
    const iron = new THREE.MeshPhongMaterial({ color: 0x2a2224, shininess: 60, specular: 0x886655 });
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0x4a6a2a });
    const ropeGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
    ropeGeo.translate(0, -0.5, 0);
    const logGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.4, 12);
    logGeo.rotateX(Math.PI / 2);
    const logMat = new THREE.MeshLambertMaterial({ map: woodTexture() });
    const rollerGeo = new THREE.IcosahedronGeometry(1.5, 0);
    const rollerMat = new THREE.MeshPhongMaterial({ map: stoneTexture([70, 96, 60], [140, 160, 110]), flatShading: true, shininess: 10 });
    const fishGeo = new THREE.SphereGeometry(0.6, 14, 10);
    fishGeo.scale(0.55, 0.8, 1.6);
    const tailGeo = new THREE.ConeGeometry(0.55, 0.9, 4);
    tailGeo.rotateX(-Math.PI / 2);
    tailGeo.scale(0.25, 1, 1);
    const fishMats = [0xff8a2a, 0xffd23a, 0x3ad8ff].map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 110, specular: 0xffffff }));
    const finMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
    const iceGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, emissive: 0x16344a, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.8 });
    const beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
    beamGeo.rotateZ(Math.PI / 2);
    // Doom City's laser gates and Sleep Drifter's butterflies, in Flying Microtonal Banana's yellow and blue.
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const postMat = new THREE.MeshPhongMaterial({ color: 0x0a1030, emissive: 0x0a1a4a, shininess: 80 });
    const laserGlow = glowTexture('rgba(255,90,160,1)', 'rgba(255,40,120,0)');
    const gateGlow = glowTexture();
    const wingGeo = new THREE.PlaneGeometry(0.7, 0.7);
    wingGeo.translate(0.35, 0, 0);
    const wing = wingTexture();
    const wingMats = [0xffd21a, 0x3a6aff, 0xffe66a, 0x1f3fbf, 0xfff4c0].map((c) => new THREE.MeshBasicMaterial({ color: c, map: wing, side: THREE.DoubleSide, alphaTest: 0.5 }));

    const meteorMat = new THREE.MeshPhongMaterial({ map: stoneTexture([60, 30, 24], [120, 70, 50]), emissive: 0xff4a10, emissiveIntensity: 0.45, flatShading: true });
    const trailGeo = new THREE.ConeGeometry(1.4, 9, 10, 1, true);
    trailGeo.translate(0, 4.5, 0);
    const trailMat = new THREE.MeshBasicMaterial({ map: flames, color: 0xff8a40, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const hailMat = new THREE.MeshPhongMaterial({ color: 0xe8f4ff, emissive: 0x1a2a3a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.9, flatShading: true });
    const stormFunnel = funnelGeo.clone().scale(1.5, 2.6, 1.5);
    const debrisGeo = new THREE.BoxGeometry(0.6, 0.15, 1.1);
    const debrisMats = [0x6a4a2a, 0x8a8a8a, 0x3a5a2a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const boltGlow = glowTexture('rgba(200,220,255,1)', 'rgba(120,140,255,0)');
    const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const scorchGeo = new THREE.CircleGeometry(1, 20);
    scorchGeo.rotateX(-Math.PI / 2);
    const holeCore = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const diskGeo = new THREE.RingGeometry(HOLE_CORE * 1.1, 6, 48, 2);
    diskGeo.rotateX(-Math.PI / 2);
    const diskTex = flames.clone();
    diskTex.needsUpdate = true;

    const wispGlow = glowTexture();
    const wispColors = [0x7affe0, 0xc8a0ff, 0xe8fff8];
    const planeBody = new THREE.MeshPhongMaterial({ color: 0xd8302a, shininess: 60 });
    const planeWing = new THREE.MeshPhongMaterial({ color: 0xf4f4f0, shininess: 40 });
    const planeDark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    const stoneMat = new THREE.MeshPhongMaterial({ map: stoneTexture([80, 90, 70], [150, 160, 130]), flatShading: true, shininess: 6 });
    const stoneEye = new THREE.MeshBasicMaterial({ color: 0xb8ffd8 });
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x4ab0c8, emissive: 0x1a6a80, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false });
    const foamTex = glowTexture('rgba(240,250,255,1)', 'rgba(200,230,255,0)');

    const crystalMat = new THREE.MeshPhongMaterial({ color: 0xff4ad8, emissive: 0x6a0a5a, shininess: 160, specular: 0xffffff, transparent: true, opacity: 0.9, flatShading: true });
    const crystalGlow = glowTexture('rgba(255,140,240,1)', 'rgba(255,60,200,0)');
    const geyserMat = new THREE.MeshPhongMaterial({ color: 0x9ae8ff, emissive: 0x2a8aa8, shininess: 120, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    const bubbleMat = new THREE.MeshPhongMaterial({ color: 0xc8f6ff, emissive: 0x3a9ab8, transparent: true, opacity: 0.8 });
    const pliosaur = new THREE.MeshPhongMaterial({ color: 0x3a5060, shininess: 30, flatShading: true });
    const pliosaurBelly = new THREE.MeshLambertMaterial({ color: 0xc8c0a8 });
    const toothMat = new THREE.MeshLambertMaterial({ color: 0xfaf6e8 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x5a1010 });

    const masonry = new THREE.MeshPhongMaterial({ map: castleWallTexture(), shininess: 8, flatShading: true });
    const crusherEye = new THREE.MeshBasicMaterial({ color: 0xff3a10 });
    const crusherDark = new THREE.MeshBasicMaterial({ color: 0x0a0606 });
    // Standing across the road, so it reads from behind.
    const gustGeo = new THREE.PlaneGeometry(6, 0.35);
    const gustMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const vesicleMat = new THREE.MeshPhongMaterial({ color: 0xff8ac8, emissive: 0x6a1a4a, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    const cargoMat = new THREE.MeshLambertMaterial({ color: 0x9affd0, emissive: 0x2a6a4a });
    const prismGlass = new THREE.MeshPhongMaterial({ color: 0xf0f0ff, emissive: 0x3a3a6a, shininess: 150, specular: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
    const robotBody = new THREE.MeshPhongMaterial({ color: 0x8a9098, shininess: 60, specular: 0xffffff, flatShading: true });
    const robotEye = new THREE.MeshBasicMaterial({ color: 0xff3020 });
    const gammaBeam = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const gammaGlow = glowTexture('rgba(160,255,200,1)', 'rgba(60,255,140,0)');
    const shadowTex = glowTexture('rgba(0,0,0,1)', 'rgba(0,0,0,0)');
    const lockWhite = new THREE.MeshPhongMaterial({ color: 0xf0ece4, shininess: 90, specular: 0xffffff, flatShading: true });
    const lockGold = new THREE.MeshPhongMaterial({ color: 0xe0b040, shininess: 140, specular: 0xffffff, flatShading: true });
    const lockGlass = new THREE.MeshPhongMaterial({ color: 0x9ad0e8, emissive: 0x1a3040, shininess: 160, transparent: true, opacity: 0.6 });
    const flareGlow = glowTexture('rgba(255,230,150,1)', 'rgba(255,90,0,0)');
    const puff = glowTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
    // Lighter than the rats in the scenery, so a swarm reads against a dark road.
    const ratFur = new THREE.MeshLambertMaterial({ map: furTexture(), color: 0xd8c8b8, emissive: 0x2a1a14 });
    const ratEye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    const eyeGlow = glowTexture('rgba(255,60,30,1)', 'rgba(255,0,0,0)');
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mindGlow = glowTexture('rgba(255,200,255,1)', 'rgba(255,60,200,0)');
    const arrowGeo = arrowGeometry(2.6, 2, 0.3);
    const stripGeo = new THREE.PlaneGeometry(1, ARROW_DEPTH * 2);
    stripGeo.rotateX(-Math.PI / 2);
    const sheetGeo = new THREE.PlaneGeometry(SHEET_HALF * 2, 4.5);
    sheetGeo.translate(0, 2.25, 0);
    const sheetEdges = new THREE.EdgesGeometry(sheetGeo);
    const sheetEdgeMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const rollGeo = new THREE.CylinderGeometry(0.35, 0.35, 4.6, 10);
    rollGeo.translate(0, 2.3, 0);
    const fuzzMap = fuzzRoadTexture();
    const fuzzDiscGeo = new THREE.CircleGeometry(FUZZ_RADIUS, 28);
    fuzzDiscGeo.rotateX(-Math.PI / 2);
    const tuftGeo = new THREE.IcosahedronGeometry(0.45, 0);
    const meterMap = meterTexture();
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b090 });
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const heapGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const muckMat = new THREE.MeshPhongMaterial({ color: 0x5a3a1e, shininess: 40, specular: 0x3a3a30, flatShading: true });
    const muckStripGeo = new THREE.PlaneGeometry(1, RAKE_DEPTH * 2);
    muckStripGeo.rotateX(-Math.PI / 2);
    const rakeWood = new THREE.MeshLambertMaterial({ color: 0x8a6a40 });
    const rakeMetal = new THREE.MeshPhongMaterial({ color: 0x8a9090, shininess: 80 });
    const gantryMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    const bladeGeo = new THREE.BoxGeometry(0.08, 1.8, 2.6);
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0xd8dce4, shininess: 220, specular: 0xffffff });
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
    const cordMat = new THREE.MeshLambertMaterial({ color: 0xe8f0ff, emissive: 0xc8d8ff, emissiveIntensity: 1 });
    const cordGlass = new THREE.MeshPhongMaterial({ color: 0x14121a, shininess: 140, specular: 0xffffff });
    const silverGlow = glowTexture('rgba(255,255,255,1)', 'rgba(180,200,255,0)');
    const sunMat = new THREE.MeshLambertMaterial({ color: 0xffc030, emissive: 0xffa020, emissiveIntensity: 1 });
    const moonMat = new THREE.MeshLambertMaterial({ color: 0xe8ecff, emissive: 0xb0c0ff, emissiveIntensity: 0.8 });
    const sunGlow = glowTexture('rgba(255,220,120,1)', 'rgba(255,120,0,0)');
    const moonGlow = glowTexture('rgba(230,240,255,1)', 'rgba(120,160,255,0)');
    const pegMat = new THREE.MeshPhongMaterial({ color: 0xe0b040, shininess: 120, specular: 0xffffff });
    const scaleMat = new THREE.MeshPhongMaterial({ color: 0x4a7a2a, emissive: 0x1a2a08, shininess: 80, specular: 0xd0d080, flatShading: true });
    const plantMat = new THREE.MeshLambertMaterial({ color: 0x60ffb0, emissive: 0x30c080, emissiveIntensity: 0.9 });
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x2a8a3a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a7a34, flatShading: true });

    for (const pose of hazards.poses) {
      const obj = new THREE.Group();
      const parts: THREE.Object3D[] = [];
      switch (pose.kind) {
        case 'snakes': {
          for (let i = 0; i < SNAKE_SEGMENTS; i++) {
            const seg = new THREE.Mesh(i === 0 ? headGeo : segGeo, snakeMat);
            seg.scale.setScalar(i === 0 ? 1 : 1 - (i / SNAKE_SEGMENTS) * 0.55);
            parts.push(seg);
            obj.add(seg);
          }
          for (const x of [-0.24, 0.24]) {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(x, 0.22, 0.35);
            parts[0].add(eye);
          }
          const belly = new THREE.Mesh(segGeo, bellyMat);
          belly.scale.set(0.8, 0.3, 0.8);
          belly.position.y = -0.2;
          parts[0].add(belly);
          const rattle = new THREE.Group();
          for (let i = 0; i < 3; i++) {
            const r = new THREE.Mesh(rattleGeo, rattleMat);
            r.scale.setScalar(1 - i * 0.2);
            r.position.z = -0.1 - i * 0.18;
            rattle.add(r);
          }
          parts.push(rattle);
          obj.add(rattle);
          break;
        }
        case 'dustDevils': {
          for (let i = 0; i < 2; i++) {
            const tex = dust.clone();
            tex.needsUpdate = true;
            tex.repeat.set(2 + i, 1);
            const funnel = new THREE.Mesh(funnelGeo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.55 - i * 0.15, depthWrite: false, side: THREE.DoubleSide }));
            funnel.scale.setScalar(1 - i * 0.25);
            parts.push(funnel);
            obj.add(funnel);
          }
          break;
        }
        case 'tumbleweeds': {
          const ball = new THREE.Group();
          for (let i = 0; i < 3; i++) {
            const lines = new THREE.LineSegments(weedGeo, twigMat);
            lines.rotation.set(i * 1.1, i * 0.7, i * 0.4);
            lines.scale.setScalar(1 - i * 0.12);
            ball.add(lines);
          }
          ball.add(new THREE.Mesh(weedCoreGeo, weedCore));
          parts.push(ball);
          obj.add(ball);
          break;
        }
        case 'meteors':
        case 'hail': {
          const meteor = pose.kind === 'meteors';
          const b = new THREE.Mesh(boulderGeo, meteor ? meteorMat : hailMat);
          if (meteor) {
            // A flaming tail streaming up the way it came, and a glow.
            const trail = new THREE.Mesh(trailGeo, trailMat);
            b.add(trail, sprite(heat, 0xff6a20, 7));
          } else b.scale.setScalar(0.85);
          const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          parts.push(b, warn);
          this.group.add(warn);
          obj.add(b);
          break;
        }
        case 'lightning': {
          // A ring closing on the spot, then a jagged bolt from the clouds, then a scorch mark.
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9ac8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          ring.position.y = 0.08;
          const bolt = new THREE.Group();
          let x = 0;
          let z = 0;
          for (let k = 0; k < 10; k++) {
            const nx = k === 9 ? 0 : (Math.random() - 0.5) * 3;
            const nz = k === 9 ? 0 : (Math.random() - 0.5) * 3;
            const y0 = 60 - k * 6;
            const a = new THREE.Vector3(x, y0, z);
            const c = new THREE.Vector3(nx, y0 - 6, nz);
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, a.distanceTo(c), 5), boltMat);
            seg.position.copy(a).add(c).multiplyScalar(0.5);
            seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
            bolt.add(seg);
            x = nx;
            z = nz;
          }
          const flash = sprite(boltGlow, 0xc8d8ff, 12);
          flash.position.y = 1.5;
          bolt.add(flash);
          const scorch = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          scorch.scale.setScalar(2.4);
          scorch.position.y = 0.05;
          obj.add(ring, bolt, scorch);
          parts.push(ring, bolt, scorch);
          break;
        }
        case 'tornadoes': {
          // Three grey funnels turning at different rates, a cloud of debris orbiting the base.
          for (let i = 0; i < 3; i++) {
            const t = dust.clone();
            t.needsUpdate = true;
            t.repeat.set(2 + i, 1);
            const funnel = new THREE.Mesh(stormFunnel, new THREE.MeshLambertMaterial({ map: t, color: 0x7a8486, transparent: true, opacity: 0.7 - i * 0.15, depthWrite: false, side: THREE.DoubleSide }));
            funnel.scale.setScalar(1 - i * 0.2);
            parts.push(funnel);
            obj.add(funnel);
          }
          for (let k = 0; k < 14; k++) {
            const d = new THREE.Mesh(debrisGeo, debrisMats[k % 3]);
            d.userData.k = k;
            parts.push(d);
            obj.add(d);
          }
          break;
        }
        case 'blackHoles': {
          // A black sphere, a swirling disk of fire round it, light bending in a halo.
          const core = new THREE.Mesh(new THREE.SphereGeometry(HOLE_CORE, 24, 16), holeCore);
          const disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({ map: diskTex, color: 0xd88aff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
          disk.rotation.x = 0.25;
          const halo = sprite(glowTexture('rgba(180,120,255,0.35)', 'rgba(150,80,255,0)'), 0xb070ff, 16);
          const rim = sprite(glowTexture('rgba(255,220,255,1)', 'rgba(120,40,255,0)'), 0xc890ff, HOLE_CORE * 3.4);
          obj.add(rim, core, disk, halo);
          parts.push(disk, rim);
          break;
        }
        case 'boulders':
        case 'lavaBombs':
        case 'oilBombs': {
          const lava = pose.kind === 'lavaBombs';
          const oil = pose.kind === 'oilBombs';
          const b = new THREE.Mesh(boulderGeo, lava ? magma : oil ? crude : boulderMat);
          if (lava) b.add(sprite(heat, 0xff7a20, 7));
          // Burning crude: a black glob wrapped in flame.
          if (oil) b.add(sprite(heat, 0xff5a10, 6), sprite(flames, 0xffa040, 4.5));
          const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          parts.push(b, warn);
          this.group.add(warn);
          obj.add(b);
          break;
        }
        case 'flameJets': {
          // Nozzles at both road edges, a sheet of fire between them.
          const sheet = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 3.2),
            new THREE.MeshBasicMaterial({ map: flames.clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
          );
          (sheet.material.map as THREE.Texture).needsUpdate = true;
          sheet.position.y = 1.6;
          sheet.scale.x = pose.radius * 2;
          const glow = sprite(heat, 0xff8030, pose.radius * 1.6);
          glow.position.y = 1;
          obj.add(sheet, glow);
          for (const side of [-1, 1]) {
            const nozzle = new THREE.Mesh(nozzleGeo, iron);
            nozzle.position.set(side * pose.radius, 0.6, 0);
            const spit = sprite(heat, 0xffb050, 1.6);
            spit.position.set(side * pose.radius, 1.4, 0);
            obj.add(nozzle, spit);
            parts.push(spit);
          }
          parts.unshift(sheet, glow);
          break;
        }
        case 'dragonFire': {
          // A dragon's head reared at the road's edge, breathing a sheet of fire right across it.
          const sheet = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 3.6),
            new THREE.MeshBasicMaterial({ map: flames.clone(), color: 0xffb070, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
          );
          (sheet.material.map as THREE.Texture).needsUpdate = true;
          sheet.position.y = 1.8;
          sheet.scale.x = pose.radius * 2;
          const glow = sprite(heat, 0xff5020, pose.radius * 1.8);
          glow.position.y = 1.2;
          const head = new THREE.Group();
          head.position.set(-pose.radius - 1.4, DRAGON_HEAD_Y, 0);
          head.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.9), dragonScales));
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.7), dragonScales);
          jaw.position.set(0.3, -1.1, 0);
          head.add(jaw);
          for (const side of [-1, 1]) {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 6), dragonHorn);
            horn.position.set(-1.1, 1.4, side * 0.6);
            horn.rotation.z = 0.9;
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), dragonEye);
            eye.position.set(0.6, 0.55, side * 0.95);
            head.add(horn, eye);
          }
          // A long neck coiling out of the ground behind it (placed each frame: in a cut it climbs the wall to the rim).
          const neck: THREE.Object3D[] = [];
          for (let k = 0; k < DRAGON_NECK; k++) {
            const seg = new THREE.Mesh(new THREE.SphereGeometry(1.05 - k * 0.06, 10, 8), dragonScales);
            obj.add(seg);
            neck.push(seg);
          }
          const ember = sprite(heat, 0xff7030, 1.8);
          ember.position.set(1.8, -0.4, 0);
          head.add(ember);
          obj.add(sheet, glow, head);
          parts.push(sheet, glow, jaw, ember, head, ...neck);
          break;
        }
        case 'vines': {
          const rope = new THREE.Mesh(ropeGeo, ropeMat);
          const log = new THREE.Mesh(logGeo, logMat);
          // The rope lives in world space: it runs from a fixed anchor to the log.
          this.group.add(rope);
          obj.add(log);
          parts.push(rope, log);
          break;
        }
        case 'crystals': {
          // A tumbling magenta octahedron with a glow at its heart.
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), crystalMat);
          c.scale.y = 1.4;
          c.add(sprite(crystalGlow, 0xff6ae0, 3.5));
          obj.add(c);
          parts.push(c);
          break;
        }
        case 'crushers': {
          // A block of the castle's masonry with a scowl carved in it: hanging, shaking loose, slamming down.
          const block = new THREE.Group();
          block.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 4.4), masonry));
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.1), crusherEye);
            eye.position.set(side * 0.9, 0.5, -2.22);
            eye.rotation.z = side * 0.25;
            block.add(eye);
          }
          const mouth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.1), crusherDark);
          mouth.position.set(0, -0.6, -2.22);
          block.add(mouth);
          // Studs of stone down its sides.
          for (let i = 0; i < 4; i++) {
            const stud = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), masonry);
            stud.rotation.z = (i % 2 ? -1 : 1) * Math.PI / 2;
            stud.position.set((i % 2 ? 1 : -1) * 2.5, i < 2 ? 0.6 : -0.6, 0);
            block.add(stud);
          }
          const dust = new THREE.Group();
          for (let i = 0; i < 8; i++) {
            const d = sprite(dust0, 0xb8a898, 3);
            (d.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            d.userData.k = i;
            dust.add(d);
          }
          const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          this.group.add(warn);
          obj.add(block, dust);
          parts.push(block, dust, warn);
          break;
        }
        case 'gusts': {
          // Streaks of wind racing across the road, puffs of cloud gathering at the edge it blows from.
          const streaks = new THREE.Group();
          for (let i = 0; i < 9; i++) {
            const st = new THREE.Mesh(gustGeo, gustMat.clone());
            st.userData.k = i;
            streaks.add(st);
          }
          const puffs = new THREE.Group();
          for (let i = 0; i < 5; i++) {
            const pf = sprite(dust0, 0xffffff, 3);
            (pf.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            pf.userData.k = i;
            puffs.add(pf);
          }
          obj.add(streaks, puffs);
          parts.push(streaks, puffs);
          break;
        }
        case 'vesicles': {
          // A bubble of membrane with cargo jostling inside it.
          const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), vesicleMat);
          for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), cargoMat);
            c.userData.k = i;
            bubble.add(c);
          }
          obj.add(bubble);
          parts.push(bubble);
          break;
        }
        case 'prisms': {
          // A prism on a post at each edge, and the beam between them in one of four colours.
          const beam = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 2.6),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          );
          beam.position.y = 1.4;
          beam.scale.x = pose.radius * 2;
          const glow = sprite(laserGlow, 0xffffff, pose.radius * 1.4);
          glow.position.y = 1.4;
          obj.add(beam, glow);
          for (const side of [-1, 1]) {
            const post = new THREE.Mesh(nozzleGeo, postMat);
            post.position.set(side * pose.radius, 0.6, 0);
            const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 3), prismGlass);
            prism.position.set(side * pose.radius, 2, 0);
            obj.add(post, prism);
            parts.push(prism);
          }
          parts.unshift(beam, glow);
          break;
        }
        case 'goblins': {
          // A garden goblin, scurrying across, hat bobbing.
          const g = goblinFigure(0.6);
          obj.add(g);
          parts.push(g);
          break;
        }
        case 'robots': {
          // A robot marching across the road: legs and arms swinging, eyes lit red the moment it stops.
          const r = robotFigure(0.85, robotBody, robotEye.clone());
          const halt = sprite(glowTexture('rgba(255,80,40,1)', 'rgba(255,40,20,0)'), 0xff4020, 3);
          halt.position.y = 3.6;
          obj.add(r.group, halt);
          parts.push(r.group, halt, ...r.legs, ...r.arms, r.head);
          break;
        }
        case 'gammaRays': {
          // Thin beams converging from above on a crosshair on the road, and the burst where they meet.
          const beams = new THREE.Group();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 1, 5), gammaBeam);
            b.userData.a = a;
            beams.add(b);
          }
          const cross = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, color: 0x80ffb0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          this.group.add(cross);
          const burst = sprite(gammaGlow, 0xc0ffe0, 9);
          burst.position.y = 1.5;
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe0ffe8 }));
          core.position.y = 1;
          obj.add(beams, burst, core);
          parts.push(beams, cross, burst, core);
          break;
        }
        case 'vultures': {
          // A vulture, and its shadow on the road under it.
          const v = vultureFigure(0.9);
          const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          shadow.rotation.x = -Math.PI / 2;
          this.group.add(shadow);
          obj.add(v.group);
          parts.push(v.group, shadow, ...v.wings, v.neck);
          break;
        }
        case 'wahs': {
          // A giant wah pedal on the road, rocking; a glow under the toe when it is down.
          const pedal = wahPedalFigure(1.1, []);
          pedal.group.rotation.y = Math.PI;
          const stamp = sprite(laserGlow, 0xff60c0, 5);
          stamp.position.set(0, 0.5, -2);
          const dust = new THREE.Group();
          for (let i = 0; i < 6; i++) {
            const d = sprite(dust0, 0xd0b0e0, 2.5);
            (d.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            d.userData.k = i;
            dust.add(d);
          }
          obj.add(pedal.group, stamp, dust);
          parts.push(pedal.treadle, stamp, dust);
          break;
        }
        case 'smog': {
          // A bank of smog: a churning knot of brown and sick-green puffs, and its shadow on the road.
          const cloud = new THREE.Group();
          for (let i = 0; i < 10; i++) {
            const pf = sprite(puff, i % 3 ? 0xa8985e : 0x8a9a52, 4);
            (pf.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            pf.userData.k = i;
            cloud.add(pf);
          }
          const shadow = new THREE.Mesh(new THREE.PlaneGeometry(SMOG_RADIUS * 2.6, SMOG_RADIUS * 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          shadow.rotation.x = -Math.PI / 2;
          this.group.add(shadow);
          obj.add(cloud);
          parts.push(cloud, shadow);
          break;
        }
        case 'airlocks': {
          // A frame across the road (two pylons, a lintel, a lamp on top) and two doors sliding in from the pylons to a slit.
          const frame = new THREE.Group();
          const posts = [0, 1].map(() => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.6, 2), lockWhite);
            post.position.y = 3.3;
            frame.add(post);
            return post;
          });
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), lockGold);
          lintel.position.y = 7;
          frame.add(lintel);
          const lamp = sprite(laserGlow, 0x40ff60, 3.5);
          lamp.position.y = 8.2;
          frame.add(lamp);
          const doors = [0, 1].map(() => {
            const d = new THREE.Group();
            const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 5, AIRLOCK_DEPTH * 2), lockWhite);
            panel.position.y = 2.5;
            const trim = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, AIRLOCK_DEPTH * 2 + 0.1), lockGold);
            trim.position.y = 5.1;
            const pane = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, AIRLOCK_DEPTH * 2 + 0.05), lockGlass);
            pane.position.y = 3.4;
            d.add(panel, trim, pane);
            frame.add(d);
            return d;
          });
          obj.add(frame);
          parts.push(frame, posts[0], posts[1], lintel, lamp, doors[0], doors[1]);
          break;
        }
        case 'flares': {
          // A loop of plasma from one edge of the road to the other, the footpoints glowing as it gathers, a burn across the road while it's low.
          const arc = new THREE.Group();
          for (let i = 0; i <= 24; i++) {
            const d = sprite(flareGlow, i % 2 ? 0xff7a10 : 0xffd060, 3);
            d.userData.a = (i / 24) * Math.PI;
            arc.add(d);
          }
          const feet = [-1, 1].map((side) => {
            const f = sprite(flareGlow, 0xffa030, 4);
            f.position.set(side * pose.radius, 0.6, 0);
            obj.add(f);
            return f;
          });
          const burn = new THREE.Mesh(
            new THREE.PlaneGeometry(pose.radius * 2, 3.4),
            new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          );
          burn.rotation.x = -Math.PI / 2;
          burn.position.y = 0.1;
          obj.add(arc, burn);
          parts.push(arc, feet[0], feet[1], burn);
          break;
        }
        case 'rats': {
          // A stream of rats running across the road behind the lead one, and eyes glinting in the hole they pour out of.
          const swarm = new THREE.Group();
          for (let i = 0; i < 9; i++) {
            const r = ratFigure(1.9, ratFur, ratEye);
            r.group.userData.k = i;
            r.group.userData.rat = r;
            swarm.add(r.group);
          }
          const eyes = new THREE.Group();
          for (let i = 0; i < 6; i++) {
            const e = sprite(eyeGlow, 0xff3020, 0.6);
            e.userData.k = i;
            eyes.add(e);
          }
          this.group.add(eyes);
          obj.add(swarm);
          parts.push(swarm, eyes);
          break;
        }
        case 'eyes': {
          // An eye floating over the middle of the road, an arrow in front of it, the blast over one half and the gold over the other.
          const eye = eyeFigure(2.2);
          eye.group.position.y = EYE_HEIGHT;
          // Looking back down the road at the karts coming.
          eye.group.rotation.y = Math.PI;
          const halo = sprite(mindGlow, 0xff80e0, 9);
          halo.position.y = EYE_HEIGHT;
          const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffd040 }));
          arrow.position.set(0, EYE_HEIGHT, -3);
          arrow.scale.setScalar(1.4);
          // The blast: a curtain of light standing over its half of the road, and a burn on the road under it.
          const half = new THREE.PlaneGeometry(pose.radius, EYE_DEPTH * 2);
          half.rotateX(-Math.PI / 2);
          const curtainGeo = new THREE.PlaneGeometry(pose.radius, 3.6);
          curtainGeo.translate(0, 1.8, 0);
          // Deep violet, so it reads against the pink of the mind.
          const blastMat = new THREE.MeshBasicMaterial({ color: 0x6a10ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
          const blast = new THREE.Group();
          blast.add(new THREE.Mesh(half, blastMat), new THREE.Mesh(curtainGeo, blastMat));
          blast.position.y = 0.15;
          const gold = new THREE.Mesh(half, goldMat);
          gold.position.y = 0.12;
          obj.add(eye.group, halo, arrow, blast, gold);
          eye.group.userData.open = eye.open;
          parts.push(eye.group, halo, arrow, blast, gold);
          break;
        }
        case 'arrows': {
          // Four arrows standing across the road, left, down, up and right, and a strip on the road under each.
          const w = (2 * pose.radius) / ARROW_LANES;
          for (let k = 0; k < ARROW_LANES; k++) {
            const a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x404044 }));
            a.rotation.z = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][k];
            // Local +x is to the left: lane 0 (leftmost) sits at x = radius - w / 2.
            a.position.set(pose.radius - w * (k + 0.5), 2.4, 0);
            a.scale.setScalar(Math.min(1.6, w / 2.2));
            const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            strip.scale.x = w * 0.94;
            strip.position.set(a.position.x, 0.12, 0);
            obj.add(a, strip);
            parts.push(a, strip);
          }
          break;
        }
        case 'sheets': {
          // Two sheets of cellophane standing across the road, in two colours, rolled up at the edges until they slide; a glow where they line up.
          const k = this.views.length;
          const colours = [CELLOPHANE_COLOURS[k % 5], CELLOPHANE_COLOURS[(k + 2) % 5]];
          // Unlit, so the colours stay bright in the sun, with a white edge so each sheet reads as a sheet.
          const sheets = colours.map((c) => {
            const m = new THREE.Mesh(sheetGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
            m.add(new THREE.LineSegments(sheetEdges, sheetEdgeMat));
            obj.add(m);
            return m;
          });
          const rolls = colours.map((c) => {
            const r = new THREE.Mesh(rollGeo, new THREE.MeshPhongMaterial({ color: c, shininess: 120, specular: 0xffffff }));
            obj.add(r);
            return r;
          });
          const glow = sprite(mindGlow, 0xffffff, 6);
          glow.position.y = 2.2;
          obj.add(glow);
          parts.push(sheets[0], sheets[1], rolls[0], rolls[1], glow);
          break;
        }
        case 'elbows': {
          // An arm out of the wall, the upper arm out into the road and the forearm bent right back along it: its elbow leads.
          const shoulder = new THREE.Group();
          shoulder.position.y = 1.4;
          const reach = pose.radius;
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, reach * 0.62, 10), sleeveMat);
          upper.position.y = (reach * 0.62) / 2;
          const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), skinMat);
          elbow.position.y = reach * 0.62;
          const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, reach * 0.5, 10), skinMat);
          fore.position.set(0.9, reach * 0.62 - (reach * 0.5) / 2, 0.6);
          const fist = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), skinMat);
          fist.position.set(0.9, reach * 0.62 - reach * 0.5, 0.6);
          shoulder.add(upper, elbow, fore, fist);
          // Its half of the road, flashing red as it winds up; the other half gold as it's thrown.
          const half = new THREE.PlaneGeometry(pose.radius, ELBOW_DEPTH * 2);
          half.rotateX(-Math.PI / 2);
          const danger = new THREE.Mesh(half, new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          danger.position.y = 0.12;
          const gold = new THREE.Mesh(half, goldMat);
          gold.position.y = 0.12;
          obj.add(shoulder, danger, gold);
          parts.push(shoulder, danger, gold);
          break;
        }
        case 'rakes': {
          // Four lanes of muck heaped across the road, a strip under each, and the rake that drags one of them clean.
          const w = (2 * pose.radius) / RAKE_LANES;
          for (let k = 0; k < RAKE_LANES; k++) {
            const heap = new THREE.Mesh(heapGeo, muckMat);
            heap.scale.set(w * 0.48, 0.9, RAKE_DEPTH);
            heap.position.set(pose.radius - w * (k + 0.5), 0, 0);
            const strip = new THREE.Mesh(muckStripGeo, new THREE.MeshBasicMaterial({ color: 0x30ff80, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            strip.scale.x = w * 0.94;
            strip.position.set(heap.position.x, 0.12, 0);
            obj.add(heap, strip);
            parts.push(heap, strip);
          }
          const rake = new THREE.Group();
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), rakeWood);
          handle.rotation.x = -1.0;
          handle.position.set(0, 2.6, -2.4);
          const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.25, 0.25), rakeMetal);
          head.position.y = 0.5;
          rake.add(handle, head);
          for (let t = 0; t < 7; t++) {
            const tine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), rakeMetal);
            tine.position.set(-w * 0.42 + (t * w * 0.84) / 6, 0.2, 0);
            rake.add(tine);
          }
          obj.add(rake);
          parts.push(rake);
          break;
        }
        case 'razors': {
          // A cut-throat razor hung from a gantry over the road on a rod, swinging edge to edge.
          const gantry = new THREE.Group();
          const span = pose.gap + 1.5;
          for (const side of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, RAZOR_PIVOT + 0.5, 0.5), gantryMat);
            post.position.set(side * span, (RAZOR_PIVOT + 0.5) / 2, 0);
            gantry.add(post);
          }
          const bar = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.5, 0.5, 0.5), gantryMat);
          bar.position.y = RAZOR_PIVOT + 0.3;
          gantry.add(bar);
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), gantryMat);
          const razor = new THREE.Group();
          const blade = new THREE.Mesh(bladeGeo, bladeMat);
          blade.position.y = 1.3;
          const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          edge.position.y = 0.45;
          const tang = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.5), new THREE.MeshPhongMaterial({ color: 0x2a1a10, shininess: 80 }));
          tang.position.set(0, 2.9, -1.1);
          tang.rotation.x = 0.5;
          razor.add(blade, edge, tang);
          const glint = sprite(mindGlow, 0xffffff, 2);
          glint.position.y = 1.3;
          razor.add(glint);
          obj.add(gantry, rod, razor);
          parts.push(gantry, rod, razor, glint);
          break;
        }
        case 'cords': {
          // A silver cord across the road at a kart's height, between two spires of black glass; each half hangs from its own spire, to lash back when it snaps.
          const R = pose.radius;
          const halves: THREE.Object3D[] = [];
          for (const side of [-1, 1]) {
            const spire = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 5), cordGlass);
            spire.position.set(side * (R + 0.6), 3, 0);
            obj.add(spire);
            const pivot = new THREE.Group();
            pivot.position.set(side * R, 1.3, 0);
            const geo = new THREE.CylinderGeometry(0.09, 0.09, R, 6);
            geo.rotateZ(Math.PI / 2);
            geo.translate((-side * R) / 2, 0, 0);
            pivot.add(new THREE.Mesh(geo, cordMat));
            obj.add(pivot);
            halves.push(pivot);
          }
          const shine = sprite(silverGlow, 0xd8e4ff, 3);
          shine.position.y = 1.3;
          obj.add(shine);
          parts.push(halves[0], halves[1], shine);
          break;
        }
        case 'sunMoon': {
          // The sun and the moon, discs standing on their rims like wheels, rolling across the road past each other.
          const R = pose.radius;
          const disc = new THREE.CylinderGeometry(R, R, 0.5, 32);
          disc.rotateX(Math.PI / 2);
          const sun = new THREE.Group();
          sun.add(new THREE.Mesh(disc, sunMat));
          for (let k = 0; k < 12; k++) {
            const ray = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 4), sunMat);
            const a = (k / 12) * Math.PI * 2;
            ray.position.set(Math.cos(a) * (R + 0.4), Math.sin(a) * (R + 0.4), 0);
            ray.rotation.z = a - Math.PI / 2;
            sun.add(ray);
          }
          sun.add(sprite(sunGlow, 0xffc040, R * 4));
          const moon = new THREE.Group();
          moon.add(new THREE.Mesh(disc, moonMat));
          // Its dark seas.
          for (let k = 0; k < 4; k++) {
            const sea = new THREE.Mesh(new THREE.CircleGeometry(0.4 + k * 0.12, 12), new THREE.MeshBasicMaterial({ color: 0xa0a8c8 }));
            sea.position.set(Math.cos(k * 1.9) * R * 0.45, Math.sin(k * 1.9) * R * 0.45, 0.26);
            moon.add(sea);
          }
          moon.add(sprite(moonGlow, 0xd0e0ff, R * 3.5));
          obj.add(sun, moon);
          parts.push(sun, moon);
          break;
        }
        case 'strings': {
          // A string of the lyre across the road, made of lightning, between two gold pegs: segments that jump about when it's plucked and hum in a standing wave after.
          const R = pose.radius;
          for (const side of [-1, 1]) {
            const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3, 10), pegMat);
            peg.position.set(side * (R + 0.4), 1.5, 0);
            obj.add(peg);
          }
          const bolt = new THREE.Group();
          const n = 14;
          // Its own colour: each string is at its own stage.
          const lightning = new THREE.MeshBasicMaterial({ color: 0x405060 });
          for (let k = 0; k < n; k++) {
            const seg = new THREE.Mesh(new THREE.BoxGeometry((2 * R) / n + 0.1, 0.12, 0.12), lightning);
            seg.position.set(-R + ((k + 0.5) * 2 * R) / n, 1.4, 0);
            bolt.add(seg);
          }
          const hum = sprite(silverGlow, 0x80ffe0, 2 * R);
          hum.scale.set(2 * R, 3, 1);
          hum.position.y = 1.4;
          obj.add(bolt, hum);
          parts.push(bolt, hum);
          break;
        }
        case 'serpents': {
          // The snake: a head and a body of segments trailing it. The plant of immortality: a stem and a glowing flower, placed on the road each frame.
          const body = new THREE.Group();
          const n = 9;
          for (let k = 0; k < n; k++) {
            const seg = new THREE.Mesh(new THREE.SphereGeometry(0.55 - k * 0.03, 10, 8), scaleMat);
            seg.scale.set(1, 0.7, 1.3);
            seg.position.set(0, 0.4, -k * (SERPENT_LENGTH / n));
            body.add(seg);
          }
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd020 }));
            eye.position.set(side * 0.25, 0.65, 0.35);
            body.add(eye);
          }
          const plant = new THREE.Group();
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 6), stemMat);
          stem.position.y = 0.8;
          plant.add(stem);
          for (let k = 0; k < 6; k++) {
            const petal = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), plantMat);
            petal.scale.set(0.6, 0.3, 1.2);
            const a = (k / 6) * Math.PI * 2;
            petal.position.set(Math.cos(a) * 0.4, 1.7, Math.sin(a) * 0.4);
            petal.rotation.y = -a;
            plant.add(petal);
          }
          plant.add(sprite(silverGlow, 0x60ffb0, 3.5));
          (plant.children[plant.children.length - 1] as THREE.Sprite).position.y = 1.6;
          obj.add(body, plant);
          parts.push(body, plant);
          break;
        }
        case 'cameras':
          // Two cameras up on the hall's walls, their beams of light down onto the road.
          parts.push(...cameraParts(obj));
          break;
        case 'timber': {
          // A tree at the road's edge: its trunk, as long as the road is wide, and its crown; it leans, creaks and comes down across the road.
          const pivot = new THREE.Group();
          const len = pose.radius * 2 + 1;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, len, 10), barkMat);
          trunk.position.y = len / 2;
          const crown = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + (i % 2) * 0.8, 1), leafMat);
            c.position.set(Math.sin(i * 2.1) * 1.6, len + Math.cos(i * 1.7) * 1.2, Math.cos(i * 2.1) * 1.6);
            crown.add(c);
          }
          pivot.add(trunk, crown);
          // Where it'll come down: a shadow across the road while it leans.
          const shadow = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = 0.12;
          obj.add(pivot, shadow);
          parts.push(pivot, shadow, crown);
          break;
        }
        case 'fuzz': {
          // A patch of fuzz on the road, tufts bristling round it, and a little meter over it showing where its needle is.
          const disc = new THREE.Mesh(fuzzDiscGeo, new THREE.MeshBasicMaterial({ color: 0x80ff90, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          disc.position.y = 0.06;
          const tuftMat = new THREE.MeshLambertMaterial({ map: fuzzMap, color: 0xffffff, emissive: 0x80ff90, emissiveIntensity: 0.7, flatShading: true });
          const tufts = new THREE.Group();
          for (let i = 0; i < 14; i++) {
            const t = new THREE.Mesh(tuftGeo, tuftMat);
            const a = (i / 14) * Math.PI * 2;
            t.position.set(Math.cos(a) * FUZZ_RADIUS, 0.3, Math.sin(a) * FUZZ_RADIUS);
            tufts.add(t);
          }
          const meter = new THREE.Group();
          const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshBasicMaterial({ map: meterMap, side: THREE.DoubleSide }));
          // Facing the karts coming.
          face.rotation.y = Math.PI;
          const needle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.05), new THREE.MeshBasicMaterial({ color: 0x101010 }));
          needle.geometry.translate(0, 0.75, 0);
          const pivot = new THREE.Group();
          pivot.position.set(0, -0.9, -0.05);
          pivot.add(needle);
          meter.add(face, pivot);
          meter.position.y = 4.2;
          obj.add(disc, tufts, meter);
          parts.push(disc, tufts, meter, pivot);
          break;
        }
        case 'geysers': {
          // A ring of bubbles on the road (the warning), then a column of water bursting up.
          const bubbles = new THREE.Group();
          for (let i = 0; i < 9; i++) {
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bubbleMat);
            b.userData.k = i;
            bubbles.add(b);
          }
          const column = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 1, 16, 1, true), geyserMat);
          column.geometry.translate(0, 0.5, 0);
          const spray = new THREE.Group();
          for (let i = 0; i < 6; i++) {
            const f = sprite(foamTex, 0xe8f8ff, 4);
            (f.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            f.position.set(Math.cos(i) * 1.5, 0, Math.sin(i) * 1.5);
            spray.add(f);
          }
          obj.add(bubbles, column, spray);
          parts.push(bubbles, column, spray);
          break;
        }
        case 'jaws': {
          // Predator X: a fin cutting the water, then the head bursting out over the road's edge, jaws wide.
          const fin = new THREE.Group();
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 4), pliosaur);
          blade.scale.z = 0.25;
          // The wake it cuts, so it reads against dark water.
          const wake = sprite(foamTex, 0xf0faff, 3.2);
          (wake.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
          wake.position.y = -0.6;
          fin.add(blade, wake);
          const head = new THREE.Group();
          const skull = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 8), pliosaur);
          skull.rotation.x = Math.PI / 2;
          skull.scale.y = 1;
          skull.position.set(0, 0.5, 1.6);
          const jaw = new THREE.Group();
          const lower = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.6, 8), pliosaurBelly);
          lower.rotation.x = Math.PI / 2;
          lower.position.z = 1.6;
          lower.scale.x = 0.9;
          jaw.add(lower);
          const mouth = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.2, 8), mouthMat);
          mouth.rotation.x = Math.PI / 2;
          mouth.position.set(0, 0.1, 1.5);
          mouth.scale.y = 0.4;
          for (let k = 0; k < 6; k++) {
            for (const side of [-1, 1]) {
              const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 4), toothMat);
              const z = 0.4 + k * 0.55;
              const x = side * (1 - k * 0.15);
              t1.position.set(x, 0.1, z);
              t1.rotation.x = Math.PI;
              head.add(t1);
              const t2 = t1.clone();
              t2.rotation.x = 0;
              t2.position.y = 0.25;
              jaw.add(t2);
            }
          }
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
            eye.position.set(side * 0.9, 1.1, 0.2);
            head.add(eye);
          }
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 4, 10), pliosaur);
          neck.rotation.x = Math.PI / 2;
          neck.position.z = -2.2;
          head.add(skull, mouth, jaw, neck);
          const splash = new THREE.Group();
          for (let i = 0; i < 7; i++) {
            const f = sprite(foamTex, 0xe8f6ff, 3);
            (f.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            f.position.set((i / 6 - 0.5) * 5, 0.5, -1 + Math.sin(i * 2) * 1.5);
            splash.add(f);
          }
          fin.scale.multiplyScalar(1.5);
          head.scale.setScalar(1.6);
          obj.add(fin, head, splash);
          parts.push(fin, head, jaw, splash);
          break;
        }
        case 'rollers': {
          const r = new THREE.Mesh(rollerGeo, rollerMat);
          obj.add(r);
          parts.push(r);
          break;
        }
        case 'fish': {
          const body = new THREE.Group();
          const mat = fishMats[this.views.length % fishMats.length];
          const fish = new THREE.Mesh(fishGeo, mat);
          const tail = new THREE.Mesh(tailGeo, mat);
          tail.position.z = -1.2;
          const fin = new THREE.Mesh(tailGeo, finMat);
          fin.scale.setScalar(0.5);
          fin.rotation.z = Math.PI / 2;
          fin.position.set(0, 0.5, 0.1);
          body.add(fish, tail, fin);
          obj.add(body);
          parts.push(body, tail);
          break;
        }
        case 'iceBlocks': {
          const b = new THREE.Mesh(iceGeo, iceMat);
          obj.add(b);
          parts.push(b);
          break;
        }
        case 'lasers': {
          // Posts at both road edges; three beams between them, and a glow on each emitter.
          const beams = new THREE.Group();
          for (const y of [0.5, 1.1, 1.7]) {
            const beam = new THREE.Mesh(beamGeo, laserMat);
            beam.position.y = y;
            beam.scale.x = pose.radius * 2;
            beams.add(beam);
          }
          obj.add(beams);
          const glows: THREE.Object3D[] = [];
          for (const side of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), postMat);
            post.position.set(side * pose.radius, 1.2, 0);
            const glow = sprite(gateGlow, 0xffc81a, 1.6);
            glow.position.set(side * pose.radius, 1.1, 0);
            obj.add(post, glow);
            glows.push(glow);
          }
          parts.push(beams, ...glows);
          break;
        }
        case 'wisps': {
          // Ghost lights: a cluster of cold glows circling each other, one big and faint round them all.
          const haze = sprite(wispGlow, 0x8ab8ff, 9);
          (haze.material as THREE.SpriteMaterial).opacity = 0.35;
          obj.add(haze);
          for (let i = 0; i < 7; i++) {
            const w = sprite(wispGlow, wispColors[i % wispColors.length], 1.2 + (i % 3) * 0.5);
            obj.add(w);
            parts.push(w);
          }
          break;
        }
        case 'gliders': {
          // A light plane gliding in with its propeller stopped, and the shadow of where it's coming down.
          const craft = new THREE.Group();
          const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 6, 10), planeBody);
          fuse.rotation.x = Math.PI / 2;
          const wings = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 1.4), planeWing);
          wings.position.set(0, 0.4, 0.6);
          const tail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.8), planeWing);
          tail.position.set(0, 0.1, -2.7);
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.9), planeBody);
          fin.position.set(0, 0.7, -2.7);
          const prop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.06), planeDark);
          prop.position.z = 3.1;
          prop.rotation.z = 0.4;
          craft.add(fuse, wings, tail, fin, prop);
          const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          parts.push(craft, warn);
          this.group.add(warn);
          obj.add(craft);
          break;
        }
        case 'stones': {
          // A standing stone, awake: a face of two glowing eyes, shuffling across the road.
          const body = new THREE.Group();
          const st = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 3.6, 6), stoneMat);
          st.position.y = 0.3;
          body.add(st);
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), stoneEye);
            eye.position.set(side * 0.4, 1.3, 1.05);
            body.add(eye);
          }
          const hum = sprite(wispGlow, 0x9affd0, 3);
          hum.position.y = -1.2;
          body.add(hum);
          obj.add(body);
          parts.push(body);
          break;
        }
        case 'waves': {
          // A wall of water across the whole road: it swells, then breaks in a curl of foam.
          const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1, 16, 1, true, 0, Math.PI * 1.2), waterMat);
          wall.rotation.z = Math.PI / 2;
          wall.scale.y = pose.radius * 2;
          const foam = new THREE.Group();
          for (let i = 0; i < 8; i++) {
            const f = sprite(foamTex, 0xe8f6ff, 3);
            (f.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
            f.position.x = (i / 7 - 0.5) * pose.radius * 2;
            foam.add(f);
          }
          obj.add(wall, foam);
          parts.push(wall, foam);
          break;
        }
        case 'butterflies': {
          // A swarm: each butterfly two wings that flap, circling the centre.
          for (let i = 0; i < 16; i++) {
            const b = new THREE.Group();
            const mat = wingMats[i % wingMats.length];
            const left = new THREE.Mesh(wingGeo, mat);
            const right = new THREE.Mesh(wingGeo, mat);
            right.rotation.y = Math.PI;
            b.add(left, right);
            b.scale.setScalar(1.4 + (i % 3) * 0.4);
            obj.add(b);
            parts.push(b);
          }
          break;
        }
      }
      this.views.push({ pose, obj, parts });
      this.group.add(obj);
    }
  }

  update(elapsed: number): void {
    for (const { pose: p, obj, parts } of this.views) {
      obj.position.set(p.x, p.y, p.z);
      switch (p.kind) {
        case 'snakes': {
          obj.rotation.y = p.heading;
          // The body trails behind the head in a travelling S-wave; the rattle shakes.
          parts.forEach((seg, i) => {
            if (i === SNAKE_SEGMENTS) {
              const back = SNAKE_SEGMENTS * 0.42;
              seg.position.set(Math.sin(p.phase - SNAKE_SEGMENTS * 0.7) * 0.5, 0.4 + Math.sin(elapsed * 40) * 0.05, -back);
              seg.rotation.z = Math.sin(elapsed * 50) * 0.3;
              return;
            }
            seg.position.set(Math.sin(p.phase - i * 0.7) * (0.12 + i * 0.06), 0.35, -i * 0.42);
          });
          break;
        }
        case 'dustDevils':
          parts.forEach((f, i) => {
            f.rotation.y = elapsed * (5 + i * 3);
            f.position.x = Math.sin(elapsed * 2.3 + i) * 0.4;
          });
          break;
        case 'tumbleweeds':
          obj.rotation.y = p.heading;
          parts[0].rotation.x = elapsed * 7;
          break;
        case 'flameJets': {
          const [sheet, glow, ...spits] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const firing = u >= JET_STAGES.fire;
          const sputter = u >= JET_STAGES.sputter && !firing;
          sheet.visible = glow.visible = firing;
          if (firing) {
            sheet.scale.y = 0.85 + Math.random() * 0.3;
            const map = (sheet as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map!;
            map.offset.x = elapsed * 0.7;
          }
          for (const s of spits) {
            s.visible = firing || (sputter && Math.random() < 0.6);
            s.scale.setScalar(firing ? 2.4 : 0.8 + Math.random());
          }
          break;
        }
        case 'dragonFire': {
          const [sheet, glow, jaw, ember, head, ...neck] = parts;
          obj.rotation.y = p.heading;
          // Down in a cut the road's edge is a rock wall over the camera: the dragon comes over the rim
          // and hangs down the wall, its head out over the road looking down into the trench.
          const rim = CUT_RIM - p.ground;
          const hang = rim > DRAGON_HEAD_Y + DRAGON_HANG;
          const hx = hang ? -p.radius - 0.2 : -p.radius - 1.4;
          const hy = hang ? DRAGON_HEAD_Y + DRAGON_HANG : DRAGON_HEAD_Y;
          head.position.set(hx, hy, 0);
          head.rotation.z = hang ? -0.45 : 0;
          neck.forEach((seg, k) => {
            const f = k / (neck.length - 1);
            if (hang) seg.position.set(hx - 1.8 - f * 1.2, hy + 0.6 + f * (rim + 0.4 - hy), Math.sin(k) * 0.4);
            else seg.position.set(-p.radius - 2.6 - k * 0.6, 1.6 - k * 0.45, Math.sin(k) * 0.4);
          });
          const u = p.phase;
          const firing = u >= JET_STAGES.fire;
          const smoulder = u >= JET_STAGES.sputter && !firing;
          sheet.visible = glow.visible = firing;
          if (firing) {
            sheet.scale.y = 0.85 + Math.random() * 0.35;
            (sheet as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map!.offset.x = elapsed * 0.9;
          }
          // The jaw opens as it draws breath, embers glowing in its throat: the warning.
          jaw.rotation.z = firing ? -0.6 : smoulder ? -0.3 : 0;
          ember.visible = firing || smoulder;
          ember.scale.setScalar(firing ? 2.6 : 0.8 + Math.random() * 0.8);
          break;
        }
        case 'vines': {
          const [rope, log] = parts;
          obj.rotation.y = p.heading;
          log.rotation.z = p.phase * 0.25;
          // Anchor high above the road centre; the rope stretches to the log.
          const top = new THREE.Vector3(p.ax, p.ground + 15, p.az);
          const end = new THREE.Vector3(p.x, p.y + 0.3, p.z);
          rope.position.copy(top);
          rope.scale.y = top.distanceTo(end);
          rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), end.sub(top).normalize());
          break;
        }
        case 'crystals':
          obj.rotation.y = p.heading;
          parts[0].rotation.set(p.phase * 0.6, p.phase * 0.4, 0);
          parts[0].position.y = 0.2;
          break;
        case 'crushers': {
          const [block, dust, warn] = parts;
          const u = p.phase;
          const C = CRUSHER_STAGES;
          obj.rotation.y = p.heading;
          // Shaking loose before it drops; still once it's down.
          const shaking = u >= C.shake && u < C.slam;
          const shake = shaking ? (u - C.shake) / (C.slam - C.shake) : 0;
          block.position.set(Math.sin(elapsed * 70) * 0.12 * shake, 1.6, Math.cos(elapsed * 53) * 0.08 * shake);
          warn.visible = u >= C.shake && u < C.landed;
          warn.position.set(p.x, p.ground + 0.05, p.z);
          warn.scale.setScalar(2.5 + 3 * shake);
          (warn as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(elapsed * (6 + shake * 12)));
          // A burst of dust as it lands.
          const puff = u >= C.landed && u < C.landed + 0.12 ? (u - C.landed) / 0.12 : -1;
          dust.visible = puff >= 0;
          dust.position.y = -p.y + p.ground + 0.4;
          if (puff >= 0) {
            dust.children.forEach((d) => {
              const k = d.userData.k as number;
              const a = (k / 8) * Math.PI * 2;
              d.position.set(Math.cos(a) * (2.4 + puff * 3), puff * 0.8, Math.sin(a) * (2.4 + puff * 3));
              d.scale.setScalar(2 + puff * 3);
              ((d as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - puff;
            });
          }
          break;
        }
        case 'gusts': {
          const [streaks, puffs] = parts;
          const u = p.phase;
          obj.rotation.y = p.heading;
          const R = p.radius;
          // In the kart's frame +x is to the left, so a gust blowing right runs from +x to -x.
          const from = p.side * R;
          const blowing = u >= GUST_STAGES.blow;
          const gathering = u >= GUST_STAGES.gather && !blowing;
          streaks.visible = blowing;
          if (blowing) {
            const b = (u - GUST_STAGES.blow) / (1 - GUST_STAGES.blow);
            streaks.children.forEach((st) => {
              const k = st.userData.k as number;
              const f = (b * 1.6 + k * 0.13) % 1.2;
              st.position.set(from - p.side * f * 2 * R, 0.4 + (k % 3) * 0.7, ((k * 0.37) % 1 - 0.5) * 2.4);
              ((st as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.max(0, 1 - Math.abs(f - 0.6) * 1.4);
            });
          }
          puffs.visible = gathering || blowing;
          const g = gathering ? (u - GUST_STAGES.gather) / (GUST_STAGES.blow - GUST_STAGES.gather) : 1;
          puffs.children.forEach((pf) => {
            const k = pf.userData.k as number;
            const a = elapsed * 3 + k * 1.3;
            pf.position.set(from + p.side * (1 + Math.cos(a)), 0.8 + Math.sin(a) * 0.6 + k * 0.3, Math.sin(a * 0.7) * 1.5);
            pf.scale.setScalar(1.5 + g * 2.5);
          });
          break;
        }
        case 'vesicles': {
          obj.rotation.y = p.heading;
          const bubble = parts[0];
          const w = Math.sin(elapsed * 5 + p.phase);
          bubble.scale.set(1 + w * 0.08, 1 - w * 0.08, 1 + w * 0.05);
          bubble.children.forEach((c) => {
            const k = c.userData.k as number;
            c.position.set(Math.sin(elapsed * 1.3 + k * 1.7) * 0.8, Math.cos(elapsed * 1.1 + k * 2.3) * 0.7, Math.sin(elapsed * 0.9 + k) * 0.8);
          });
          break;
        }
        case 'prisms': {
          const [beam, glow, ...prisms] = parts;
          obj.rotation.y = p.heading;
          const { colour, lit } = prismColour(p.phase);
          const c = TETRA_COLOURS[colour];
          const mat = (beam as THREE.Mesh).material as THREE.MeshBasicMaterial;
          // The fourth colour shimmers, the others hold steady.
          beam.visible = glow.visible = lit;
          mat.color.setHex(c);
          mat.opacity = colour === 3 ? 0.6 + 0.35 * Math.sin(elapsed * 30) : 0.85;
          ((glow as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(c);
          for (const pr of prisms) pr.rotation.y = elapsed * 2;
          break;
        }
        case 'goblins':
          obj.rotation.y = p.heading;
          parts[0].position.set(0, Math.abs(Math.sin(p.phase * 3)) * 0.3 - 0.9, 0);
          parts[0].rotation.z = Math.sin(p.phase * 3) * 0.2;
          break;
        case 'robots': {
          const [figure, halt, legL, legR, armL, armR, head] = parts;
          const u = p.phase;
          const stopped = u >= ROBOT_STAGES.stop && u < ROBOT_STAGES.go;
          // Facing the way it walks; stopped, it turns to face the karts coming.
          obj.rotation.y = stopped ? p.heading + Math.PI : p.heading;
          const stride = stopped ? 0 : Math.sin(elapsed * 9);
          legL.rotation.x = stride * 0.7;
          legR.rotation.x = -stride * 0.7;
          armL.rotation.x = -stride * 0.6;
          armR.rotation.x = stopped ? -Math.PI / 2 : stride * 0.6;
          head.rotation.y = stopped ? Math.sin(elapsed * 1.5) * 0.3 : 0;
          figure.position.y = stopped ? 0 : Math.abs(stride) * 0.08;
          halt.visible = stopped;
          ((halt as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.4 + 0.5 * Math.abs(Math.sin(elapsed * 6));
          break;
        }
        case 'gammaRays': {
          const [beams, cross, burst, core] = parts;
          const u = p.phase;
          const G = GAMMA_STAGES;
          obj.rotation.y = p.heading;
          const aiming = u >= G.aim && u < G.fire;
          const firing = p.active;
          // The beams come down from a ring high over the road, closing on the focus as they aim.
          const a = aiming ? (u - G.aim) / (G.fire - G.aim) : 1;
          beams.visible = aiming || firing;
          beams.children.forEach((b) => {
            const ang = b.userData.a as number;
            const top = new THREE.Vector3(Math.cos(ang) * 9, 26, Math.sin(ang) * 9 - 6);
            const spread = firing ? 0 : (1 - a) * 4;
            const foot = new THREE.Vector3(Math.cos(ang) * spread, 0.6, Math.sin(ang) * spread);
            const len = top.distanceTo(foot);
            b.scale.set(firing ? 2.5 : 1, len, firing ? 2.5 : 1);
            b.position.copy(top).lerp(foot, 0.5);
            b.lookAt(obj.localToWorld(foot.clone()));
            b.rotateX(Math.PI / 2);
          });
          cross.visible = aiming;
          cross.position.set(p.x, p.ground + 0.05, p.z);
          cross.scale.setScalar(2 + 6 * (1 - a));
          (cross as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = (u >= GAMMA_EDGE ? 0.9 : 0.5) * (0.6 + 0.4 * Math.abs(Math.sin(elapsed * (5 + a * 12))));
          burst.visible = core.visible = firing;
          if (firing) {
            const f = (u - G.fire) / (G.done - G.fire);
            burst.scale.setScalar(4 + 8 * Math.sin(Math.PI * f));
            core.scale.setScalar(0.5 + 1.5 * Math.sin(Math.PI * f));
          }
          break;
        }
        case 'vultures': {
          const [figure, shadow, wingL, wingR, neck] = parts;
          const u = p.phase;
          const V = VULTURE_STAGES;
          obj.rotation.y = p.heading;
          // Circling: banked, going round. Diving and swooping: wings swept back, then flapping away up.
          const circling = u < V.dive;
          const climbing = u >= V.climb;
          figure.rotation.set(circling ? 0 : u < V.swoop ? -0.5 : climbing ? 0.4 : 0.1, circling ? elapsed * 1.6 : 0, circling ? 0.35 : 0);
          figure.position.set(circling ? Math.cos(elapsed * 1.6) * 4 : 0, 0, circling ? Math.sin(elapsed * 1.6) * 4 : 0);
          const flap = climbing || circling ? Math.sin(elapsed * (climbing ? 14 : 3)) * (climbing ? 0.7 : 0.15) : -0.25;
          wingL.rotation.z = flap + (u >= V.dive && u < V.swoop ? 0.9 : 0);
          wingR.rotation.z = -flap - (u >= V.dive && u < V.swoop ? 0.9 : 0);
          neck.rotation.x = circling ? 0.3 : p.active ? -0.2 : 0.1;
          shadow.visible = u < V.swoop;
          shadow.position.set(p.x + (circling ? Math.cos(elapsed * 1.6) * 4 : 0), p.ground + 0.05, p.z + (circling ? Math.sin(elapsed * 1.6) * 4 : 0));
          // The shadow is the warning: big enough to read from the road while the bird is up out of the chase camera's view.
          const closeness = 1 - Math.min(1, (p.y - p.ground) / 16);
          shadow.scale.setScalar(1.4 + 0.8 * closeness);
          (shadow as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.75 + 0.25 * closeness;
          break;
        }
        case 'wahs': {
          const [treadle, stamp, dust] = parts;
          const u = p.phase;
          const W = WAH_STAGES;
          obj.rotation.y = p.heading;
          // Toe up, the stamp, flat, and rocking back up: the treadle's angle over the cycle.
          let lift = 1;
          if (u >= W.stamp && u < W.down) lift = 1 - ((u - W.stamp) / (W.down - W.stamp)) ** 2;
          else if (u >= W.down && u < W.rise) lift = 0;
          else if (u >= W.rise) lift = Math.min(1, (u - W.rise) / (1 - W.rise) * 1.3);
          treadle.rotation.x = -Math.atan2(WAH_LIFT * lift, 4.6);
          stamp.visible = u >= W.down && u < W.rise;
          ((stamp as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.5 + 0.4 * Math.abs(Math.sin(elapsed * 8));
          const puff = u >= W.down && u < W.down + 0.08 ? (u - W.down) / 0.08 : -1;
          dust.visible = puff >= 0;
          if (puff >= 0) {
            dust.children.forEach((d) => {
              const k = d.userData.k as number;
              const a = (k / 6) * Math.PI * 2;
              d.position.set(Math.cos(a) * (2.5 + puff * 3), 0.3 + puff * 0.8, -2 + Math.sin(a) * (2.5 + puff * 3));
              d.scale.setScalar(1.5 + puff * 3);
              ((d as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - puff;
            });
          }
          break;
        }
        case 'smog': {
          const [cloud, shadow] = parts;
          const u = p.phase;
          const S = SMOG_STAGES;
          // Gathering at the stack: small and thick; rolling: full size; clearing: thinning and lifting away.
          const grow = u < S.roll ? 0.45 + 0.55 * (u / S.roll) : 1;
          const thin = u < S.clear ? 1 : Math.max(0, 1 - ((u - S.clear) / (1 - S.clear)) * 1.4);
          cloud.children.forEach((pf) => {
            const k = pf.userData.k as number;
            const a = elapsed * (0.6 + (k % 3) * 0.25) + k * 0.7;
            pf.position.set(Math.cos(a) * 2.6 * grow, (k % 4) * 1.1 * grow + (1 - thin) * 4, Math.sin(a) * 2.6 * grow);
            pf.scale.setScalar((5 + (k % 3) * 1.5) * grow * (1 + (1 - thin) * 0.5));
            ((pf as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.95 * thin;
          });
          shadow.position.set(p.x, p.ground + 0.05, p.z);
          shadow.visible = thin > 0.05;
          (shadow as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.45 * thin * grow;
          break;
        }
        case 'airlocks': {
          const [, postA, postB, lintel, lamp, doorA, doorB] = parts;
          obj.rotation.y = p.heading;
          const fx = Math.sin(p.heading);
          const fz = Math.cos(p.heading);
          // Local +x is to the left (a lateral L sits at x = -L), and the pose is the slit: the road's middle is at local x = c.
          const c = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
          const R = p.radius;
          postA.position.x = c + R + 0.7;
          postB.position.x = c - R - 0.7;
          lintel.position.x = c;
          lintel.scale.x = 2 * R + 2.8;
          const wA = c + R - p.gap;
          doorA.visible = wA > 0.05;
          doorA.position.x = (p.gap + c + R) / 2;
          doorA.scale.x = Math.max(0.05, wA);
          const wB = R - c - p.gap;
          doorB.visible = wB > 0.05;
          doorB.position.x = (c - R - p.gap) / 2;
          doorB.scale.x = Math.max(0.05, wB);
          const A = AIRLOCK_STAGES;
          const u = p.phase;
          const lampMat = (lamp as THREE.Sprite).material as THREE.SpriteMaterial;
          // Green open, amber blinking as they close, red while shut (that's when the slit pays).
          if (u >= A.shut && u < A.open) lampMat.color.setHex(0xff3020);
          else if (u >= A.close - 0.1 && u < A.shut) lampMat.color.setHex(Math.sin(elapsed * 18) > 0 ? 0xffb020 : 0x402000);
          else lampMat.color.setHex(p.active ? 0xffb020 : 0x40ff60);
          break;
        }
        case 'flares': {
          const [arc, footA, footB, burn] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const F = FLARE_STAGES;
          const h = flareHeight(u);
          const up = u >= F.erupt && u < F.land;
          const low = h < FLARE_CLEAR;
          arc.visible = up;
          if (up) {
            arc.children.forEach((d, i) => {
              const a = d.userData.a as number;
              const wobble = low ? Math.sin(elapsed * 20 + i) * 0.4 : Math.sin(elapsed * 6 + i) * 0.3;
              d.position.set(Math.cos(a) * p.radius, Math.sin(a) * Math.max(h, 0.8) + wobble + 0.3, Math.sin(elapsed * 4 + i * 0.7) * 0.4);
              d.scale.setScalar(low ? 4.5 + Math.sin(elapsed * 25 + i) : 5 + Math.sin(elapsed * 8 + i) * 0.8);
            });
          }
          // The footpoints glow from the warning on, brightest as it erupts.
          const g = u >= F.glow && u < F.done ? Math.min(1, (u - F.glow) / (F.erupt - F.glow)) : 0;
          footA.visible = footB.visible = g > 0;
          footA.scale.setScalar(2 + g * 5 + Math.sin(elapsed * 14) * 0.6);
          footB.scale.setScalar(2 + g * 5 + Math.cos(elapsed * 13) * 0.6);
          // A burn across the road while it boils low, and where it splashes down.
          burn.visible = p.active;
          (burn as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.35 + 0.25 * Math.abs(Math.sin(elapsed * 12));
          break;
        }
        case 'rats': {
          const [swarm, eyes] = parts;
          obj.rotation.y = p.heading;
          swarm.visible = p.active;
          if (p.active) {
            swarm.children.forEach((rg) => {
              const k = rg.userData.k as number;
              const r = rg.userData.rat as ReturnType<typeof ratFigure>;
              // Behind the lead rat along the way they run (-z), spread a little along the road (x).
              rg.position.set(Math.sin(k * 2.3) * 1 + Math.sin(elapsed * 6 + k) * 0.1, Math.abs(Math.sin(elapsed * 14 + k)) * 0.15, -(k / 8) * RAT_LENGTH);
              r.legs.forEach((l, j) => (l.rotation.x = Math.sin(elapsed * 22 + k + j * 1.6) * 0.7));
              r.tail.forEach((l, j) => (l.rotation.y = Math.sin(elapsed * 10 + k + j) * 0.4));
            });
          }
          // Eyes in the hole at the edge they're about to pour from: the warning.
          eyes.visible = p.phase < RAT_STAGES.pour;
          if (eyes.visible) {
            eyes.children.forEach((e) => {
              const k = e.userData.k as number;
              const pair = Math.floor(k / 2);
              const side = k % 2 ? 0.18 : -0.18;
              e.position.set(p.x + Math.cos(p.heading) * (side + (pair - 1) * 0.8), p.ground + 0.35 + (pair % 2) * 0.25, p.z - Math.sin(p.heading) * (side + (pair - 1) * 0.8));
              ((e as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.sin(elapsed * 3 + pair * 2) > -0.3 ? 1 : 0;
            });
          }
          break;
        }
        case 'eyes': {
          const [eye, halo, arrow, blast, gold] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const E = EYE_STAGES;
          // Shut, opening, wide open while it shows the arrow and reads, then shutting again.
          const open = u < E.open ? 0 : u < E.show ? (u - E.open) / (E.show - E.open) : u < E.done ? 1 : Math.max(0, 1 - (u - E.done) / 0.08);
          (eye.userData.open as (k: number) => void)(open);
          eye.position.y = EYE_HEIGHT + Math.sin(elapsed * 1.6) * 0.3;
          halo.position.y = eye.position.y;
          halo.visible = open > 0.05;
          halo.scale.setScalar(p.active ? 14 + Math.sin(elapsed * 30) * 2 : 9);
          // The arrow, pointing to the safe half (local +x is to the left: a lateral to the right is local -x).
          arrow.visible = u >= E.show && u < E.done && (p.active || Math.sin(elapsed * 14) > -0.2);
          arrow.rotation.z = p.side > 0 ? Math.PI / 2 : -Math.PI / 2;
          arrow.position.x = -p.side * 1.5;
          blast.visible = p.active;
          blast.position.x = (p.side * p.radius) / 2;
          const blastMat = (blast.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
          blastMat.opacity = 0.5 + 0.3 * Math.abs(Math.sin(elapsed * 20));
          blastMat.color.setHex(Math.sin(elapsed * 31) > 0.6 ? 0xffffff : 0x6a10ff);
          gold.visible = u >= E.show && u < E.done;
          gold.position.x = (-p.side * p.radius) / 2;
          break;
        }
        case 'arrows': {
          obj.rotation.y = p.heading;
          const u = p.phase;
          const A = ARROW_STAGES;
          const showing = u >= A.show && u < A.lit;
          for (let k = 0; k < ARROW_LANES; k++) {
            const a = parts[k * 2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
            const strip = parts[k * 2 + 1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
            const missing = k === p.lane && u >= A.show && u < A.off;
            // The one that isn't there: gone, and the road under it glowing white while the others are lit.
            a.visible = !missing;
            if (p.active) a.material.color.setHex(Math.sin(elapsed * 24 + k) > 0 ? 0xff2a6a : 0xffffff);
            else if (showing) a.material.color.setHex(Math.sin(elapsed * 16 + k * 2) > 0 ? 0xff2a6a : 0x404044);
            else a.material.color.setHex(0x404044);
            strip.visible = p.active || (missing && showing);
            // The way through glows green; the lit lanes red.
            strip.material.color.setHex(missing ? 0x30ff80 : 0xff2a6a);
            strip.material.opacity = missing ? 0.55 + 0.25 * Math.sin(elapsed * 10) : 0.7;
          }
          break;
        }
        case 'sheets': {
          const [sheetA, sheetB, rollA, rollB, glow] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const S = SHEET_STAGES;
          // The first sheet is at lateral -gap from the pose (local x = +gap), the second at +gap (local x = -gap).
          sheetA.visible = sheetB.visible = p.active;
          sheetA.position.x = p.gap;
          sheetB.position.x = -p.gap;
          const ripple = Math.sin(elapsed * 6) * 0.08;
          sheetA.rotation.y = ripple;
          sheetB.rotation.y = -ripple;
          // Rolled at the edges before they slide, and again once they're gone.
          const rolled = u < S.slide || u >= S.gone;
          rollA.visible = rollB.visible = rolled;
          const edge = Math.abs(p.gap) + SHEET_HALF;
          rollA.position.x = u < S.slide ? edge : -edge;
          rollB.position.x = -rollA.position.x;
          const g = Math.abs(p.gap);
          glow.visible = p.active && g < SHEET_HALF;
          glow.scale.setScalar(4 + 6 * (1 - g / SHEET_HALF));
          break;
        }
        case 'elbows': {
          const [shoulder, danger, gold] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const E = ELBOW_STAGES;
          // Out of the wall on its side (a lateral to the right is local -x), folded up at rest, wound back, then thrown flat across its half.
          shoulder.position.x = -p.side * p.radius;
          let angle = 0.15;
          if (u >= E.cock && u < E.throw) angle = -0.35 - 0.1 * Math.sin(elapsed * 30);
          else if (u >= E.throw && u < E.back) angle = Math.PI / 2 * Math.min(1, (u - E.throw) / 0.03);
          else if (u >= E.back) angle = (Math.PI / 2) * Math.max(0, 1 - (u - E.back) / 0.12);
          shoulder.rotation.z = -p.side * angle;
          // The forearm folds back toward whichever wall it came from.
          shoulder.scale.x = p.side;
          danger.visible = (u >= E.cock && u < E.throw && Math.sin(elapsed * 18) > 0) || p.active;
          danger.position.x = (-p.side * p.radius) / 2;
          gold.visible = p.active;
          gold.position.x = (p.side * p.radius) / 2;
          break;
        }
        case 'rakes': {
          obj.rotation.y = p.heading;
          const u = p.phase;
          const R = RAKE_STAGES;
          const w = (2 * p.radius) / RAKE_LANES;
          const heaped = u < R.drag ? 0 : u < R.muck ? (u - R.drag) / (R.muck - R.drag) : u < R.dry ? 1 : Math.max(0, 1 - (u - R.dry) / 0.1);
          for (let k = 0; k < RAKE_LANES; k++) {
            const heap = parts[k * 2];
            const strip = parts[k * 2 + 1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
            const furrow = k === p.lane;
            heap.visible = !furrow && heaped > 0.02;
            heap.scale.y = 0.9 * heaped + Math.sin(elapsed * 4 + k) * 0.05 * heaped;
            strip.visible = furrow && p.active;
            strip.material.opacity = 0.45 + 0.25 * Math.sin(elapsed * 10);
          }
          const rake = parts[RAKE_LANES * 2];
          rake.visible = u >= R.drag && u < R.dry;
          rake.position.x = p.radius - w * (p.lane + 0.5);
          // Dragged toward the karts coming through the furrow, then left lying at the end of it.
          rake.position.z = u < R.muck ? RAKE_DEPTH * (1 - 2 * ((u - R.drag) / (R.muck - R.drag))) : -RAKE_DEPTH;
          break;
        }
        case 'razors': {
          const [gantry, rod, razor, glint] = parts;
          obj.rotation.y = p.heading;
          // The road's centre, where the rod hangs from, in the blade's frame: its lateral (to the right) is local -x, so the centre is local +lateral.
          const lat = -(p.x - p.ax) * Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
          gantry.position.x = lat;
          const dy = RAZOR_PIVOT - 2.6;
          rod.position.set(lat / 2, 2.6 + dy / 2, 0);
          rod.scale.y = Math.hypot(lat, dy);
          rod.rotation.z = -Math.atan2(lat, dy);
          razor.rotation.z = -Math.atan2(lat, dy) * 0.5;
          // Edge-on as it swings, flashing as it passes the middle.
          razor.rotation.y = Math.PI / 2;
          glint.visible = Math.abs(lat) < 2;
          break;
        }
        case 'cords': {
          const [a, b, shine] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const C = CORD_STAGES;
          const R = p.radius;
          const taut = u < C.snap;
          for (const [k, half] of [a, b].entries()) {
            const side = k === 0 ? -1 : 1;
            half.visible = u < C.lash || u >= C.spun;
            half.scale.set(1, 1, 1);
            half.rotation.set(0, 0, 0);
            if (taut) {
              // Taut and humming; fraying, it shudders.
              const fray = u >= C.fray;
              half.position.y = 1.3 + (fray ? Math.sin(elapsed * 60 + k) * 0.12 : Math.sin(elapsed * 25) * 0.02);
            } else if (u < C.lash) {
              // Snapped: each end lashes back round toward its own spire.
              const w = (u - C.snap) / (C.lash - C.snap);
              half.rotation.y = side * w * Math.PI * 0.9;
            } else {
              // Spun anew from both spires.
              const g = (u - C.spun) / (1 - C.spun);
              half.scale.set(Math.max(0.01, g), 1, 1);
            }
            half.position.x = side * R;
          }
          shine.visible = taut;
          const fray = u >= C.fray && taut;
          (shine as THREE.Sprite).material.opacity = fray ? (Math.sin(elapsed * 40) > 0 ? 0.9 : 0.1) : 0.6;
          shine.scale.set(2 * R, 1.6, 1);
          break;
        }
        case 'sunMoon': {
          const [sun, moon] = parts;
          obj.rotation.y = p.heading;
          const R = p.radius;
          // The sun at the pose; the moon the other side of the road's centre (a lateral to the right is local -x).
          sun.position.set(0, R, 0);
          moon.position.set(2 * p.gap, R, 0);
          // Rolling: the sun one way, the moon the other.
          sun.rotation.z = p.gap / R;
          moon.rotation.z = -p.gap / R;
          break;
        }
        case 'strings': {
          const [bolt, hum] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const S = STRING_STAGES;
          const n = bolt.children.length;
          const plucked = u >= S.pluck && u < S.hum;
          const humming = u >= S.hum && u < S.fade;
          const trembling = u >= S.tremble && u < S.pluck;
          bolt.children.forEach((seg, k) => {
            const x = (k + 0.5) / n;
            let y = 1.4;
            if (plucked) y += (Math.sin(elapsed * 97 + k * 7.3) + Math.sin(elapsed * 61 + k * 3.1)) * 0.3;
            else if (humming) y += Math.sin(x * Math.PI) * Math.sin(elapsed * 45) * 0.35 * (1 - (u - S.hum) / (S.fade - S.hum));
            else if (trembling) y += Math.sin(x * Math.PI) * Math.sin(elapsed * 80) * 0.06;
            seg.position.y = y;
          });
          (bolt.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color.setHex(plucked ? 0xffffff : humming ? 0x80ffd0 : trembling ? 0x6aa0c0 : 0x405060);
          hum.visible = plucked || humming;
          (hum as THREE.Sprite).material.opacity = plucked ? 1 : 0.6;
          break;
        }
        case 'serpents': {
          const [body, plant] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          body.visible = p.active;
          body.children.forEach((seg, k) => {
            if (k < body.children.length - 2) seg.position.x = Math.sin(elapsed * 8 - k * 0.9) * 0.35 * Math.min(1, k / 2);
          });
          plant.visible = p.lane === 1;
          if (plant.visible) {
            // The plant where it grows: `gap` to the right of the road's centre, in this object's frame.
            const road = p.heading + (p.side * Math.PI) / 2;
            const dx = p.ax - Math.cos(road) * p.gap - p.x;
            const dz = p.az + Math.sin(road) * p.gap - p.z;
            const c = Math.cos(p.heading);
            const s = Math.sin(p.heading);
            plant.position.set(dx * c - dz * s, 0, dx * s + dz * c);
            plant.scale.setScalar(Math.min(1, (u - SERPENT_STAGES.sprout) / 0.08));
            plant.rotation.y = elapsed;
          }
          break;
        }
        case 'cameras':
          poseCameras(obj, parts, p, elapsed);
          break;
        case 'timber': {
          const [pivot, shadow] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const T = TIMBER_STAGES;
          const fall = timberFall(u);
          pivot.visible = u < T.gone;
          // From its edge (a lateral to the right is local -x) over toward the other.
          pivot.position.x = -p.side * (p.radius + 0.5);
          pivot.rotation.z = -p.side * (u < T.fall ? fall : 0.12 + (Math.PI / 2 - 0.12) * fall);
          shadow.visible = u >= T.lean && u < T.fall + 0.04;
          (shadow as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.25 + 0.2 * Math.sin(elapsed * 12);
          break;
        }
        case 'fuzz': {
          const [disc, tufts, meter, pivot] = parts;
          const level = fuzzLevel(p.phase);
          const red = level > 0.8;
          const goldBand = level >= 0.55 && !red;
          const colour = red ? (Math.sin(elapsed * 30) > 0 ? 0xff2a20 : 0xff8040) : goldBand ? 0xffd040 : 0x80ff90;
          (disc as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color.setHex(colour);
          const tuftMat = (tufts.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material;
          tuftMat.emissive.setHex(colour);
          tufts.rotation.y = elapsed * (0.5 + level * 3);
          tufts.children.forEach((t, i) => t.scale.setScalar(0.6 + level * 1.6 + (red ? Math.abs(Math.sin(elapsed * 25 + i)) * 0.8 : 0)));
          // The meter faces the karts coming (its back to +z), so to them the needle sweeps left to right as it turns the other way.
          meter.rotation.y = p.heading;
          pivot.rotation.z = ((100 * level - 50) * Math.PI) / 180;
          break;
        }
        case 'geysers': {
          const [bubbles, column, spray] = parts;
          const u = p.phase;
          const erupt = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + GEYSER_ERUPT;
          const warn = u > BOULDER_STAGES.land * 0.45 && u < BOULDER_STAGES.land;
          obj.position.y = p.ground;
          bubbles.visible = warn || erupt;
          const fizz = warn ? (u - BOULDER_STAGES.land * 0.45) / (BOULDER_STAGES.land * 0.55) : 1;
          bubbles.children.forEach((b) => {
            const k = b.userData.k as number;
            const a = k * 0.7 + elapsed * 1.5;
            const r = 0.6 + (k % 3) * 0.7;
            b.position.set(Math.cos(a) * r, ((elapsed * 2.5 + k * 0.37) % 1) * (0.4 + fizz), Math.sin(a) * r);
            b.scale.setScalar(0.5 + fizz * 0.8);
          });
          const e = erupt ? (u - BOULDER_STAGES.land) / GEYSER_ERUPT : 0;
          const h = erupt ? 16 * Math.sin(Math.PI * Math.min(1, e * 1.6 + 0.1)) + 2 : 0;
          column.visible = spray.visible = erupt;
          column.scale.set(1 + Math.sin(elapsed * 30) * 0.05, Math.max(0.1, h), 1);
          spray.position.y = h;
          spray.children.forEach((f, i) => f.scale.setScalar(3 + Math.sin(elapsed * 14 + i) * 1));
          break;
        }
        case 'jaws': {
          const [fin, head, jaw, splash] = parts;
          const u = p.phase;
          obj.rotation.y = p.heading;
          obj.position.y = p.ground;
          const lunging = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + JAWS_LUNGE * 2.2;
          // Circling: the fin traces small loops in the water beside the road.
          fin.visible = !lunging && u > 0.15;
          fin.position.set(Math.sin(elapsed * 2.2) * 2, 0.6, Math.cos(elapsed * 2.2) * 2);
          fin.rotation.y = elapsed * 2.2;
          head.visible = splash.visible = lunging;
          if (lunging) {
            const l = (u - BOULDER_STAGES.land) / (JAWS_LUNGE * 2.2);
            const rise = Math.sin(Math.PI * l);
            head.position.set(0, -1.5 + rise * 3.2, -2 + rise * 1.5);
            head.rotation.x = -0.5 + l * 0.9;
            const snap = l < 0.45 ? 1 : Math.max(0, 1 - (l - 0.45) * 5);
            jaw.rotation.x = 0.75 * snap;
            splash.children.forEach((f, i) => f.scale.setScalar(2 + rise * 2.5 + Math.sin(elapsed * 12 + i) * 0.5));
          }
          break;
        }
        case 'rollers':
          obj.rotation.y = p.heading;
          parts[0].rotation.x = p.phase;
          break;
        case 'iceBlocks':
          // Skating, not rolling: a slow spin and a little wobble.
          obj.rotation.y = p.heading + p.phase * 0.15;
          parts[0].rotation.z = Math.sin(elapsed * 3 + p.phase) * 0.05;
          break;
        case 'fish': {
          obj.visible = p.phase >= 0;
          obj.rotation.y = p.heading;
          // Nose up out of the water, level over the road, nose down back in.
          parts[0].rotation.x = (p.phase - 0.5) * 1.6;
          parts[1].rotation.y = Math.sin(elapsed * 20) * 0.5;
          break;
        }
        case 'lasers': {
          const [beams, ...glows] = parts;
          obj.rotation.y = p.heading;
          const firing = p.phase >= JET_STAGES.fire;
          const warning = p.phase >= JET_STAGES.sputter && !firing;
          beams.visible = firing || (warning && Math.sin(elapsed * 40) > 0);
          beams.scale.y = firing ? 1 : 0.4;
          ((beams.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = firing ? 0.95 : 0.4;
          for (const g of glows) g.scale.setScalar(firing ? 2.4 : warning ? 1.6 : 0.9);
          break;
        }
        case 'wisps':
          parts.forEach((w, i) => {
            const a = elapsed * (0.9 + (i % 3) * 0.3) + (i / parts.length) * Math.PI * 2;
            const r = 1.2 + (i % 4) * 0.8;
            w.position.set(Math.cos(a) * r, 0.6 + Math.sin(elapsed * 1.7 + i) * 0.8 + (i % 3) * 0.5, Math.sin(a) * r);
            w.scale.setScalar((1.2 + (i % 3) * 0.5) * (0.8 + Math.sin(elapsed * 5 + i * 2) * 0.2));
          });
          break;
        case 'gliders': {
          const [craft, warn] = parts;
          const u = p.phase;
          // Comes in from far up the road on a shallow glide, lands on the shadow, sits there wrecked, then sinks away.
          const start = 0.05;
          const g = Math.min(1, Math.max(0, (u - start) / (BOULDER_STAGES.land - start)));
          obj.position.set(p.x, p.ground, p.z);
          obj.rotation.y = p.heading + Math.PI;
          craft.visible = u >= start;
          if (u < BOULDER_STAGES.land) {
            craft.position.set(0, 1 + 26 * (1 - g), -70 * (1 - g));
            craft.rotation.set(0.32, 0, Math.sin(elapsed * 2) * 0.08);
          } else {
            craft.position.set(0, 0.7 + (p.y - p.ground - 1.7), 0);
            craft.rotation.set(-0.12, 0.5, 0.35);
          }
          warn.visible = u >= start && u < BOULDER_STAGES.land;
          warn.position.set(p.x, p.ground + 0.05, p.z);
          warn.scale.setScalar(1.5 + 3 * g);
          (warn as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(elapsed * (6 + g * 10)));
          break;
        }
        case 'stones': {
          // A waddle: rocking side to side as it shuffles.
          obj.rotation.y = p.heading;
          parts[0].rotation.z = Math.sin(p.phase * 2.2) * 0.14;
          parts[0].position.y = Math.abs(Math.sin(p.phase * 2.2)) * 0.25;
          break;
        }
        case 'waves': {
          const [wall, foam] = parts;
          obj.rotation.y = p.heading;
          const u = p.phase;
          const breaking = u >= JET_STAGES.fire;
          const swell = u >= JET_STAGES.sputter && !breaking;
          wall.visible = foam.visible = breaking || swell;
          const k = breaking ? 1 : swell ? 0.25 + 0.6 * ((u - JET_STAGES.sputter) / (JET_STAGES.fire - JET_STAGES.sputter)) : 0;
          wall.scale.x = wall.scale.z = Math.max(0.05, k);
          wall.position.y = 2.2 * k - 0.6;
          foam.position.y = 4.4 * k - 0.4;
          foam.children.forEach((f, i) => f.scale.setScalar((breaking ? 3.4 : 1.6) + Math.sin(elapsed * 12 + i) * 0.5));
          break;
        }
        case 'butterflies':
          parts.forEach((b, i) => {
            const a = elapsed * (0.8 + (i % 4) * 0.15) + (i / parts.length) * Math.PI * 2;
            const r = 1.5 + (i % 5) * 0.7;
            b.position.set(Math.cos(a) * r, 0.8 + (i % 6) * 0.5 + Math.sin(elapsed * 2 + i) * 0.4, Math.sin(a) * r);
            b.rotation.y = -a;
            const flap = Math.sin(elapsed * 18 + i) * 1.1;
            b.children[0].rotation.y = flap;
            b.children[1].rotation.y = Math.PI - flap;
          });
          break;
        case 'lightning': {
          const [ring, bolt, scorch] = parts;
          const u = p.phase;
          const strike = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + LIGHTNING_STRIKE;
          ring.visible = u < BOULDER_STAGES.land;
          const close = Math.min(1, u / BOULDER_STAGES.land);
          ring.scale.setScalar(6 - close * 3.4);
          (ring as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.3 + 0.7 * Math.abs(Math.sin(elapsed * (6 + close * 14)));
          bolt.visible = strike && Math.sin(elapsed * 70) > -0.3;
          scorch.visible = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.crumble;
          (scorch as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.7 * (1 - Math.max(0, u - BOULDER_STAGES.land) / (BOULDER_STAGES.crumble - BOULDER_STAGES.land));
          break;
        }
        case 'tornadoes':
          parts.forEach((f, i) => {
            if (i < 3) {
              f.rotation.y = elapsed * (4 + i * 2.5);
              f.position.x = Math.sin(elapsed * 1.7 + i) * 0.8;
              return;
            }
            const k = f.userData.k as number;
            const a = elapsed * (2.4 + (k % 4) * 0.4) + k * 0.9;
            const r = 3 + (k % 5) * 0.9;
            f.position.set(Math.cos(a) * r, 1 + ((k * 1.7 + elapsed * 2) % 9), Math.sin(a) * r);
            f.rotation.set(elapsed * 5 + k, elapsed * 3, k);
          });
          break;
        case 'blackHoles': {
          const [disk, rim] = parts;
          disk.rotation.y = -elapsed * 1.8;
          rim.scale.setScalar(HOLE_CORE * (3.2 + Math.sin(elapsed * 3) * 0.3));
          break;
        }
        case 'boulders':
        case 'lavaBombs':
        case 'oilBombs':
        case 'meteors':
        case 'hail': {
          const [b, warn] = parts;
          const u = p.phase;
          b.visible = u >= BOULDER_STAGES.fall;
          // A meteor keeps its tail pointed up the way it came; everything else tumbles.
          if (p.kind === 'meteors') b.rotation.set(0.5, u * 4, 0.3);
          else b.rotation.set(u * 9, u * 5, 0);
          if (p.kind === 'meteors') b.children[0].visible = u < BOULDER_STAGES.land;
          warn.visible = u < BOULDER_STAGES.land;
          warn.position.set(p.x, p.ground + 0.05, p.z);
          const grow = Math.min(1, u / BOULDER_STAGES.fall);
          warn.scale.setScalar(1.5 + 3 * grow);
          (warn as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(elapsed * (6 + grow * 10)));
          break;
        }
      }
    }
  }
}

function sprite(tex: THREE.Texture, color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}
