import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { createKartState, type KartState } from '../physics/kart';
import type { RacerDef } from '../physics/racers';
import type { Track } from '../tracks/track';
import { KartView } from './kartView';

/**
 * Places 1st, 2nd, 3rd: lateral offset (m, kart's right) and block height.
 * The camera faces the karts, so 2nd on their right is on the viewer's left.
 */
const STEPS = [
  { lateral: 0, height: 1.8, color: 0xffd23a },
  { lateral: 3.6, height: 1.25, color: 0xd8dde8 },
  { lateral: -3.6, height: 0.85, color: 0xd88a48 },
];
const CONFETTI = 140;
const CONFETTI_COLORS = [0xff5ad0, 0x3ad8ff, 0xffd23a, 0x7affb0, 0xc070ff, 0xff8a1f];

/** End-of-cup podium on the start straight: the top three on blocks, confetti, and a slow camera sweep. */
export class Podium {
  readonly group = new THREE.Group();
  private readonly center: THREE.Vector3;
  private readonly forward: THREE.Vector3;
  private readonly karts: { view: KartView; state: KartState; top: number }[] = [];
  private readonly confetti: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private readonly rand = seededRandom(31);

  constructor(track: Track, top3: readonly RacerDef[]) {
    const pose = track.respawnPose(30);
    const h = pose.heading;
    this.center = new THREE.Vector3(pose.x, pose.y, pose.z);
    this.forward = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const right = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h));

    top3.forEach((racer, i) => {
      const step = STEPS[i];
      const at = this.center.clone().addScaledVector(right, step.lateral);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(3.3, step.height, 3),
        new THREE.MeshPhongMaterial({ color: step.color, shininess: 110, specular: 0xffffff }),
      );
      block.position.set(at.x, at.y + step.height / 2, at.z);
      block.rotation.y = h;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1), transparent: true }));
      label.position.set(0, 0, 1.51);
      block.add(label);
      this.group.add(block);

      const view = new KartView(racer);
      this.group.add(view.root, view.fx);
      const state = createKartState(at.x, at.z, h);
      state.y = state.groundY = at.y + step.height;
      this.karts.push({ view, state, top: state.y });
    });

    const geo = new THREE.PlaneGeometry(0.22, 0.14);
    for (let i = 0; i < CONFETTI; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], side: THREE.DoubleSide }));
      const c = { mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
      this.respawnConfetti(c, true);
      this.confetti.push(c);
      this.group.add(mesh);
    }
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.karts.forEach((k, i) => {
      // The winner bounces.
      k.state.y = k.top + (i === 0 ? Math.abs(Math.sin(elapsed * 3.2)) * 0.45 : 0);
      k.state.grounded = k.state.y === k.top;
      k.view.update(k.state, 30, dt, elapsed);
    });
    for (const c of this.confetti) {
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      if (c.mesh.position.y < this.center.y) this.respawnConfetti(c, false);
    }
    // Sweep slowly across the front of the podium.
    const a = Math.sin(elapsed * 0.25) * 0.55;
    const dir = this.forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(this.center).addScaledVector(dir, 10);
    camera.position.y += 3.4;
    camera.lookAt(this.center.x, this.center.y + 2, this.center.z);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  private respawnConfetti(c: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }, anywhere: boolean): void {
    const r = this.rand;
    c.mesh.position.set(this.center.x + (r() - 0.5) * 16, this.center.y + (anywhere ? r() * 12 : 10 + r() * 3), this.center.z + (r() - 0.5) * 10);
    c.vel.set((r() - 0.5) * 1.2, -1.2 - r() * 1.5, (r() - 0.5) * 1.2);
    c.spin.set(r() * 8, r() * 8, 0);
  }
}

function numberTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = 'italic 900 110px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = '#3a0f45';
  g.strokeText(String(n), 64, 68);
  g.fillStyle = '#fff6e0';
  g.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
