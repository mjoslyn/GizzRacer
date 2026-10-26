import * as THREE from 'three';
import { createKartState } from '../physics/kart';
import { RACERS } from '../physics/racers';
import { KartView } from './kartView';

const WIDTH = 192;
const HEIGHT = 144;

/**
 * A picture of every racer for the picker's grid: each drawn once,
 * three-quarters on, on a clear background, into a small image. A small
 * renderer of its own does it, one racer a frame so the picker never
 * stalls, and is let go when the last is done.
 */
export class Portraits {
  /** The image for each racer id, as they're ready. */
  readonly urls = new Map<string, string>();
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 100);
  private next = 0;

  constructor(private readonly onReady: (racerId: string, url: string) => void) {
    this.scene.add(new THREE.HemisphereLight(0xe8dcff, 0x402050, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0e0, 2.2);
    sun.position.set(-4, 8, 10);
    this.scene.add(sun);
  }

  get done(): boolean {
    return this.next >= RACERS.length;
  }

  /** Draws the next racer's picture. Call once a frame until done. */
  step(): void {
    if (this.done) return;
    const racer = RACERS[this.next++];
    try {
      this.renderer ??= this.makeRenderer();
      const view = new KartView(racer);
      const state = createKartState(0, 0, 0);
      state.heading = 0.6;
      view.update(state, 30, 0, 0);
      this.scene.add(view.root);
      // Framed to the model, whatever its size: a bolt, a dragon, a dog bed.
      const box = new THREE.Box3().setFromObject(view.root);
      const centre = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 0.62;
      this.camera.position.set(centre.x, centre.y + dist * 0.32, centre.z + dist);
      this.camera.lookAt(centre.x, centre.y - radius * 0.08, centre.z);
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      this.scene.remove(view.root);
      this.urls.set(racer.id, url);
      this.onReady(racer.id, url);
    } catch {
      // No WebGL for it: the grid keeps its plain tiles.
      this.next = RACERS.length;
    }
    if (this.done) this.release();
  }

  private makeRenderer(): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(WIDTH, HEIGHT, false);
    r.setClearColor(0x000000, 0);
    return r;
  }

  private release(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
