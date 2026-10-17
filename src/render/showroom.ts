import * as THREE from 'three';
import { createKartState } from '../physics/kart';
import { RACERS } from '../physics/racers';
import { KartView } from './kartView';
import { setTextureAnisotropy, skyTexture } from './textures';

/** `?showroom`: every racer on a turntable, for checking looks (and later, racer select). */
export function startShowroom(app: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);
  setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.background.mapping = THREE.EquirectangularReflectionMapping;
  scene.add(new THREE.HemisphereLight(0xc8dcff, 0x806040, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.position.set(-4, 8, 6);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4, 12.5);
  camera.lookAt(0, 0.8, 0);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x3a2a4a }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2;
  scene.add(floor);

  const cols = 3;
  const spacing = 4.4;
  const stands = RACERS.map((racer, i) => {
    const view = new KartView(racer);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * spacing;
    const z = row * -4.2 + 2;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2, 0.2, 32), new THREE.MeshPhongMaterial({ color: racer.color, shininess: 80 }));
    plinth.position.set(x, -0.1, z);
    scene.add(plinth, view.root, view.fx);
    const state = createKartState(x, z, 0);
    return { view, state };
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const [i, s] of stands.entries()) {
      s.state.heading = t * 0.5 + i * 0.6 + Number(new URLSearchParams(location.search).get('turn') ?? 0);
      s.view.update(s.state, 30, dt, t);
    }
    renderer.render(scene, camera);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
