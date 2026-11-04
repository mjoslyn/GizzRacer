import * as THREE from 'three';
import { buildBillabongValley } from '../../tracks/billabongValley';
import { Track } from '../../tracks/track';
import { buildTrackView } from '../trackView';
import * as kit from './index';

/**
 * The scenery toolkit's test page (dev server only: http://localhost:5173/scenery.html):
 * Billabong Valley's start straight dressed with every part of the toolkit,
 * a layer of each, the camera circling it (`?seat` for the driver's eye
 * along the road, `?s=<metres>` to move along the lap). It isn't in the
 * game and isn't built; it's for seeing the parts and trying new ones.
 */

const params = new URLSearchParams(location.search);
const track = new Track(buildBillabongValley());
const view = buildTrackView(track);
const theme = view.theme;
const scene = new THREE.Scene();
scene.add(view.group);
scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
sun.position.set(200, 300, 100);
scene.add(sun);

const ribbon = track.main;
const from = Number(params.get('s') ?? 40);
const to = from + 260;
const animated: kit.Animated = [];
const music = kit.beat(120);
const layers = new THREE.Group();
scene.add(layers);

// Foreground: three kinds of prop either side, and tufts by the hundred.
const tent: kit.Prop = (rand) => {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 4, 1, true), kit.matte(rand() < 0.5 ? 0xc8bca0 : 0x8a7a60, { double: true }));
  cloth.position.y = 1.3;
  cloth.rotation.y = Math.PI / 4;
  g.add(cloth);
  return g;
};
const cairn: kit.Prop = (rand) => {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const r = 0.9 - k * 0.18;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), kit.matte(0x4a4440, { flat: true }));
    st.position.y = 0.4 + k * r * 1.3;
    st.rotation.set(rand(), rand(), rand());
    g.add(st);
  }
  return g;
};
const brazier: kit.Prop = (rand) => kit.torch(animated, rand() * 9, { kind: 'basket', height: 1.4 });
layers.add(kit.scatter({ track, ribbon, from, to, spacing: 14, band: [4, 16], kinds: [[2, tent], [2, cairn], [1, brazier]] }));
layers.add(kit.scatterInstanced({ track, ribbon, from, to, spacing: 1.6, band: [2, 26], geometry: new THREE.ConeGeometry(0.25, 1, 4), material: new THREE.MeshLambertMaterial({ color: 0xffffff }), colors: [0x4a4a30, 0x6a5a38, 0x8a7448], lift: 0.5, stretchY: [0.6, 1.6], tilt: 0.25 }));

// The crowd: two rows on the left, waving on the beat, lighters up.
layers.add(kit.crowd({ track, ribbon, from: from + 30, to: from + 110, side: 'left', rows: 3, motion: 'wave', beat: music, lights: { color: 0xffb050, every: 3 } }, animated).group);

// A banner over the road.
layers.add(kit.roadBanner(ribbon, from + 140, ['SCENERY KIT'], { style: 'neon', lift: 6, glowColor: 0xff3aa8 }, animated));

// Mid-ground: a set piece standing off the road, glowing and turning, a swarm round it and a flock over it.
const obelisk = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 22, 6), kit.matte(0x241a14, { flat: true }));
shaft.position.y = 11;
const tip = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 6), kit.lit(0xffa040));
tip.position.y = 24;
obelisk.add(shaft, tip);
const piece = kit.standBeside(kit.setPiece({ body: obelisk, base: 'ring', baseColor: 0x6a6058, glow: { color: 0xffa040, y: 24, size: 16 }, spin: 0.15, beat: music }, animated), ribbon, from + 190, -45, { track, radius: 14 });
layers.add(piece);
const flies = kit.swarm({ count: 60, radius: 9, height: 6, color: 0xc0ff60, size: 0.6, speed: 0.15 }, animated);
flies.position.set(piece.position.x, 14, piece.position.z);
const crows = kit.flock({ count: 10, radius: 30, height: 34, color: 0x0e0a08, size: 1.6 }, animated);
crows.position.set(piece.position.x, 0, piece.position.z);
layers.add(flies, crows);

// A bonfire on the right, its smoke column and embers going up.
const blaze = kit.beside(ribbon, from + 80, 1, 34);
const bonfire = kit.fire(animated, 0, { size: 5 });
bonfire.position.set(blaze.x, 0, blaze.z);
const smoke = kit.smokeColumn({ height: 70, width: 7, under: 0x6a2a1a }, animated);
smoke.position.copy(bonfire.position);
const embers = kit.motes({ count: 120, radius: 12, height: 40, color: 0xff7a30, drift: 'rise', speed: 3 }, animated);
embers.position.copy(bonfire.position);
// A lamp hanging from a gallows by it.
const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), kit.matte(0x2a1e16));
post.position.set(blaze.x + 8, 2.5, blaze.z);
const lantern = kit.lamp(animated, 1.7);
lantern.position.set(blaze.x + 8, 5, blaze.z);
layers.add(bonfire, smoke, embers, post, lantern);

// The skyline: a ring of towers and spires round the play area, windows lit, beacons blinking.
layers.add(kit.skyline({ track, shapes: [[3, 'tower'], [2, 'spire'], [1, 'dome']], color: 0x0c0a10, windows: 0xffc070, beacons: { color: 0xff2a1a } }, animated));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

const mid = kit.frameAt(ribbon, (from + to) / 2);
const seat = params.has('seat');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();
  if (seat) {
    // The driver's eye, crawling along the stretch.
    const s = from + ((time * 8) % (to - from));
    const f = kit.frameAt(ribbon, s);
    const a = kit.frameAt(ribbon, s + 20);
    camera.position.set(f.x, f.y + 2.2, f.z);
    camera.lookAt(a.x, a.y + 1.5, a.z);
  } else {
    const a = time * 0.08;
    camera.position.set(mid.x + Math.cos(a) * 120, 45, mid.z + Math.sin(a) * 120);
    camera.lookAt(mid.x, 4, mid.z);
  }
  view.update(time, camera.position);
  for (const f of animated) f(time);
  renderer.render(scene, camera);
});
