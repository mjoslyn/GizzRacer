import * as THREE from 'three';
import { BOULDER_STAGES, JET_STAGES, type HazardPose } from '../items/hazards';
import { WAVE_RANGE, type ItemSystem } from '../items/items';
import type { HazardSystem } from '../items/hazards';
import { basaltTexture, dustTexture, wingTexture, flameTexture, glowTexture, itemBoxTexture, scaleTexture, stoneTexture, warningTexture, woodTexture } from './textures';

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

    const magma = new THREE.MeshPhongMaterial({ map: basaltTexture(), color: 0x6a3020, emissive: 0xff3a08, emissiveIntensity: 0.6, flatShading: true });
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
        case 'boulders':
        case 'lavaBombs': {
          const lava = pose.kind === 'lavaBombs';
          const b = new THREE.Mesh(boulderGeo, lava ? magma : boulderMat);
          if (lava) b.add(sprite(heat, 0xff7a20, 7));
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
        case 'boulders':
        case 'lavaBombs': {
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
