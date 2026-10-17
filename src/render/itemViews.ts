import * as THREE from 'three';
import { BOULDER_STAGES, type HazardPose } from '../items/hazards';
import { WAVE_RANGE, type ItemSystem } from '../items/items';
import type { HazardSystem } from '../items/hazards';
import { dustTexture, glowTexture, itemBoxTexture, scaleTexture, stoneTexture, warningTexture } from './textures';

const MINE_POOL = 12;
const MISSILE_POOL = 8;
const WAVE_POOL = 4;
const SNAKE_SEGMENTS = 9;

/** Item boxes, mines, missiles and wave rings, mirrored from an ItemSystem each frame. */
export class ItemsView {
  readonly group = new THREE.Group();
  private readonly boxes: THREE.Mesh[] = [];
  private readonly mines: THREE.Group[] = [];
  private readonly missiles: THREE.Group[] = [];
  private readonly waves: THREE.Mesh[] = [];

  constructor(private readonly items: ItemSystem) {
    const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const boxMat = new THREE.MeshPhongMaterial({ map: itemBoxTexture(), shininess: 90, specular: 0xffffff, emissive: 0x402050, transparent: true, opacity: 0.92 });
    for (const b of items.boxes) {
      const m = new THREE.Mesh(boxGeo, boxMat);
      m.position.set(b.x, b.y, b.z);
      this.boxes.push(m);
      this.group.add(m);
    }

    const glow = glowTexture();
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
  }

  update(elapsed: number): void {
    this.items.boxes.forEach((b, i) => {
      const m = this.boxes[i];
      // Pop back in over the last half second of the respawn.
      const scale = b.respawn === 0 ? 1 : Math.max(0, 1 - b.respawn / 0.5);
      m.visible = scale > 0.01;
      m.scale.setScalar(scale);
      m.position.y = b.y + Math.sin(elapsed * 2.4 + i) * 0.18;
      m.rotation.set(0.5, elapsed * 1.6 + i, 0.3);
    });
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
        case 'boulders': {
          const b = new THREE.Mesh(boulderGeo, boulderMat);
          const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
          parts.push(b, warn);
          this.group.add(warn);
          obj.add(b);
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
        case 'boulders': {
          const [b, warn] = parts;
          const u = p.phase;
          b.visible = u >= BOULDER_STAGES.fall;
          b.rotation.set(u * 9, u * 5, 0);
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
