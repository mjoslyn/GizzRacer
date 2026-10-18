import * as THREE from 'three';
import { BOULDER_STAGES, HOLE_CORE, JET_STAGES, LIGHTNING_STRIKE, type HazardPose } from '../items/hazards';
import { BOX_RESPAWN, SHIELD_ITEMS, WAVE_RANGE, type ItemHolder, type ItemSystem } from '../items/items';
import type { KartState } from '../physics/kart';
import type { HazardSystem } from '../items/hazards';
import { basaltTexture, dustTexture, wingTexture, flameTexture, glowTexture, itemBoxTexture, scaleTexture, stoneTexture, warningTexture, woodTexture } from './textures';

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
  /** Drum Roll: a ring of drumheads round the kart. */
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
    const mineGeo = new THREE.OctahedronGeometry(0.7, 0);
    const mineMat = new THREE.MeshPhongMaterial({ color: 0xb04aff, emissive: 0x5a1080, shininess: 80, flatShading: true });
    const coreGeo = new THREE.IcosahedronGeometry(0.42, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x7dffd8 });
    for (let i = 0; i < MINE_POOL; i++) {
      const g = new THREE.Group();
      const spikes = new THREE.Mesh(mineGeo, mineMat);
      spikes.scale.set(1, 1.3, 1);
      const spikes2 = spikes.clone();
      spikes2.rotation.set(Math.PI / 4, Math.PI / 4, 0);
      g.add(spikes, spikes2, new THREE.Mesh(coreGeo, coreMat), sprite(glow, 0xc070ff, 2.6));
      g.visible = false;
      this.mines.push(g);
      this.group.add(g);
    }

    // Riff Missile: a fat guitar pick riding a flame.
    const pick = new THREE.Shape();
    pick.moveTo(0, -0.9);
    pick.bezierCurveTo(0.75, -0.6, 0.7, 0.55, 0, 0.75);
    pick.bezierCurveTo(-0.7, 0.55, -0.75, -0.6, 0, -0.9);
    const pickGeo = new THREE.ExtrudeGeometry(pick, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    pickGeo.center();
    const pickMat = new THREE.MeshPhongMaterial({ color: 0x3a9aff, emissive: 0x0a2a70, shininess: 120, specular: 0xffffff });
    const flameGeo = new THREE.ConeGeometry(0.35, 1.8, 10);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -1.3);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 });
    for (let i = 0; i < MISSILE_POOL; i++) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(pickGeo, pickMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = Math.PI; // point first
      g.add(p, new THREE.Mesh(flameGeo, flameMat), sprite(glow, 0xffb040, 3));
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

    // Held items: a smaller mine or pick riding behind the kart.
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
      const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xff3a8a }));
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

    // The Gizzard Wave: a curling wall of green across the road, foam on its lip.
    this.surge = new THREE.Group();
    const curl = new THREE.CylinderGeometry(1.6, 1.6, 12, 20, 1, true, 0, Math.PI);
    curl.rotateZ(Math.PI / 2);
    curl.translate(0, 0.6, 0);
    this.surge.add(
      new THREE.Mesh(curl, new THREE.MeshBasicMaterial({ color: 0x30ff90, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })),
      sprite(glow, 0x80ffc0, 9),
    );
    for (let i = 0; i < 6; i++) {
      const foam = sprite(glow, 0xe0fff0, 1.4);
      foam.position.set(-5 + i * 2, 2.1, 0);
      this.surge.add(foam);
    }
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
      g.children[0].rotation.y = elapsed * 9;
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

  /** Shields trailing behind, and the Drum Roll's ring. */
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

  /** The band's items going off, and the Gizzard Wave. */
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
      this.surge.children.slice(2).forEach((f, k) => (f.position.y = 2.1 + Math.sin(elapsed * 10 + k) * 0.3));
    }
  }
}

let noteCache: THREE.CanvasTexture | null = null;

/** A pair of quavers, white on clear, for the Flute Flurry. */
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
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const postMat = new THREE.MeshPhongMaterial({ color: 0x1a1428, emissive: 0x3a0a2a, shininess: 80 });
    const laserGlow = glowTexture('rgba(255,90,160,1)', 'rgba(255,40,120,0)');
    const wingGeo = new THREE.PlaneGeometry(0.7, 0.7);
    wingGeo.translate(0.35, 0, 0);
    const wing = wingTexture();
    const wingMats = [0xff7ad8, 0x7ae8ff, 0xffe07a, 0xb07aff, 0x7aff9a].map((c) => new THREE.MeshBasicMaterial({ color: c, map: wing, side: THREE.DoubleSide, alphaTest: 0.5 }));

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
          head.position.set(-pose.radius - 1.4, 2.2, 0);
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
          // A long neck coiling down out of the ground behind it.
          for (let k = 0; k < 5; k++) {
            const seg = new THREE.Mesh(new THREE.SphereGeometry(1.05 - k * 0.06, 10, 8), dragonScales);
            seg.position.set(-pose.radius - 2.6 - k * 0.6, 1.6 - k * 0.45, Math.sin(k) * 0.4);
            obj.add(seg);
          }
          const ember = sprite(heat, 0xff7030, 1.8);
          ember.position.set(1.8, -0.4, 0);
          head.add(ember);
          obj.add(sheet, glow, head);
          parts.push(sheet, glow, jaw, ember);
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
            const glow = sprite(laserGlow, 0xff3a8a, 1.6);
            glow.position.set(side * pose.radius, 1.1, 0);
            obj.add(post, glow);
            glows.push(glow);
          }
          parts.push(beams, ...glows);
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
          const [sheet, glow, jaw, ember] = parts;
          obj.rotation.y = p.heading;
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
