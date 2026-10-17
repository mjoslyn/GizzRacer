import * as THREE from 'three';
import { damp, wrapAngle } from '../core/math';
import { createKartState, type KartState } from '../physics/kart';
import { RACERS, type RacerDef } from '../physics/racers';
import { KartView } from './kartView';
import { glowTexture, skyTexture } from './textures';

/** Metres of ring between neighbouring plinths. */
const SPACING = 4.6;
const RADIUS = (RACERS.length * SPACING) / (Math.PI * 2);

/**
 * The racer gallery behind the picker: every racer on a plinth round a
 * carousel, which turns to bring the selected one to the front, lit and
 * turning on its turntable, with its neighbours either side. The picker's
 * panel is on the left, so the focus sits right of centre.
 */
export class RacerGallery {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 400);
  private readonly ring = new THREE.Group();
  private readonly stands: { racer: RacerDef; view: KartView; state: KartState; plinth: THREE.Mesh; angle: number }[] = [];
  private readonly spot: THREE.SpotLight;
  private readonly halo: THREE.Sprite;
  private angle = 0;
  private target = 0;
  private selected = 0;
  private spin = 0;

  constructor() {
    const sky = skyTexture({ zenith: '#0a0418', high: '#2a0a48', low: '#6a2a8a', horizon: '#ff8ad8', below: '#2a0a3a', ground: '#140820', cloud: '200,150,255', clouds: 18 });
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(0x2a0a3a, 30, 90);
    this.scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x402050, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.8);
    sun.position.set(-6, 10, 12);
    this.scene.add(sun);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 30, 64), new THREE.MeshPhongMaterial({ color: 0x1e0c2c, shininess: 60, specular: 0x6a3a8a }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    this.scene.add(floor);
    // A ring of light round the carousel's rim.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 2.6, 0.08, 6, 96), new THREE.MeshBasicMaterial({ color: 0xff5ad0 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.15;
    this.ring.add(rim);
    this.scene.add(this.ring);

    RACERS.forEach((racer, i) => {
      const angle = (i / RACERS.length) * Math.PI * 2;
      const view = new KartView(racer);
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(1.9, 2.05, 0.24, 32),
        new THREE.MeshPhongMaterial({ color: racer.color, emissive: racer.color, emissiveIntensity: 0, shininess: 80 }),
      );
      this.ring.add(plinth);
      this.scene.add(view.root, view.fx);
      this.stands.push({ racer, view, state: createKartState(0, 0, 0), plinth, angle });
    });

    this.spot = new THREE.SpotLight(0xffffff, 60, 30, 0.45, 0.6, 1.2);
    this.spot.position.set(0, 9, RADIUS + 3);
    this.spot.target.position.set(0, 0, RADIUS);
    this.scene.add(this.spot, this.spot.target);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(6, 3, 1);
    this.halo.position.set(0, 0.2, RADIUS);
    this.scene.add(this.halo);
  }

  /** Turns the carousel to `racer` (the long way never: always the short way round). */
  focus(racer: RacerDef, snap = false): void {
    const i = Math.max(0, this.stands.findIndex((s) => s.racer.id === racer.id));
    if (i !== this.selected) this.spin = 0;
    this.selected = i;
    // Bring stand i to the front (+z): rotate the ring by -its angle.
    this.target = this.angle + wrapAngle(-this.stands[i].angle - this.angle);
    if (snap) this.angle = this.target;
  }

  update(dt: number, time: number, aspect: number): void {
    this.angle += (this.target - this.angle) * damp(6, dt);
    this.spin += dt;
    this.ring.rotation.y = this.angle;
    for (const [i, s] of this.stands.entries()) {
      // Stand i sits at ring angle a: (sin a, cos a) * R, carried round by the ring.
      const a = s.angle + this.angle;
      const x = Math.sin(a) * RADIUS;
      const z = Math.cos(a) * RADIUS;
      s.plinth.position.set(Math.sin(s.angle) * RADIUS, -0.08, Math.cos(s.angle) * RADIUS);
      s.state.x = x;
      s.state.z = z;
      const on = i === this.selected;
      // The chosen one turns to show itself off, starting three-quarters on; the rest face out and idle.
      s.state.heading = on ? 0.6 + this.spin * 0.7 : a + Math.sin(time * 0.4 + i) * 0.3;
      s.view.update(s.state, 30, dt, time);
      (s.plinth.material as THREE.MeshPhongMaterial).emissiveIntensity = on ? 0.35 + Math.sin(time * 3) * 0.1 : 0;
    }
    // The panel is on the left: on a wide screen, look left of the racer so it sits right of centre.
    const shift = aspect > 1.2 ? Math.min(3.4, (aspect - 1) * 3.9) : 0;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(-shift * 0.6, 3.3, RADIUS + 10.5);
    this.camera.lookAt(-shift, 1, RADIUS);
  }
}
