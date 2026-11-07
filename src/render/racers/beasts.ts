import * as THREE from 'three';
import type { RacerDef } from '../../physics/racers';
import { arm, ball, box, brass, chrome, cone, cyl, eyes, glow, glowSprite, headlights, matte, pipes, put, ring, rod, steeringWheel, tex, type KartModel } from '../racerModels';
import { sparkleTexture } from '../textures';
import { bake, css, decal, disc, Mats, sticker, studs, swinger, tube, type V3 } from './kit';

// ---- Blue Morpho: fresh out of the Butterfly 3000 chrysalis, on a featherweight trike ----

/** The forewing's outline, in the shape's own units (root at the origin, tip out along +x). */
function wingPath(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.3, 1.1, 0.25, 1.05, -0.2);
  s.bezierCurveTo(0.9, -0.55, 0.4, -0.45, 0, 0);
  return s;
}

/**
 * A morpho's wing, drawn over the shape's own coordinates (x 0..1.1, y -0.55..0.3):
 * `top` is the shimmering blue with a black border and white spots, the
 * underside brown with a row of eyespots.
 */
function morphoTexture(blue: number, edge: number): THREE.CanvasTexture {
  return decal(`morpho-${blue}`, 256, 256, (g, w, h) => {
    const X = (x: number) => (x / 1.1) * w;
    const Y = (y: number) => (1 - (y + 0.55) / 0.85) * h;
    const path = () => {
      g.beginPath();
      g.moveTo(X(0), Y(0));
      g.bezierCurveTo(X(0.5), Y(0.3), X(1.1), Y(0.25), X(1.05), Y(-0.2));
      g.bezierCurveTo(X(0.9), Y(-0.55), X(0.4), Y(-0.45), X(0), Y(0));
    };
    g.fillStyle = '#05060c';
    g.fillRect(0, 0, w, h);
    const grad = g.createRadialGradient(X(0.25), Y(-0.05), 10, X(0.45), Y(-0.05), w * 0.55);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(0.25, css(blue));
    grad.addColorStop(1, css(edge));
    g.fillStyle = grad;
    path();
    g.fill();
    // Veins out from the root.
    g.strokeStyle = 'rgba(10,20,60,0.55)';
    g.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(X(0.05), Y(0));
      g.lineTo(X(0.3 + k * 0.14), Y(0.22 - k * 0.12));
      g.stroke();
    }
    // The black border all round, white spots along it.
    g.strokeStyle = '#05060c';
    g.lineWidth = 34;
    path();
    g.stroke();
    g.fillStyle = '#ffffff';
    for (const [x, y] of [[0.95, 0.05], [1.0, -0.1], [0.98, -0.24], [0.88, -0.36], [0.75, -0.42], [0.82, 0.14]]) {
      g.beginPath();
      g.arc(X(x), Y(y), 5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function neonMoth(r: RacerDef): KartModel {
  const M = new Mats();
  const body = new THREE.Group();
  const paint = M.gloss(r.color, { emissive: 0x0a3a4a });
  const trim = M.gloss(r.accent);
  // A morpho is velvet black-brown in the body, not a moth's cream.
  const velvet = M.matte(0x2a2026, { shininess: 20, specular: 0x334466 });
  const velvetLight = M.matte(0x4a3a40, { shininess: 10 });
  const leg = M.matte(0x1a1214);
  const steel = chrome();

  // A narrow tube-frame trike: one front wheel, two rear, a seat on a strut.
  put(body, box(0.5, 0.22, 2.3), paint, [0, 0.42, 0]);
  put(body, box(1.3, 0.14, 0.5), trim, [0, 0.4, -0.85]);
  for (const side of [-1, 1]) put(body, box(0.04, 0.05, 2.2), M.glow(r.color), [side * 0.26, 0.42, 0]);
  // BUTTERFLY 3000 down both sides of the frame.
  const logo = decal('butterfly-3000', 256, 40, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'italic 900 30px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (const [t, c] of [[0, '#ffe45a'], [0.5, '#ff7ae8'], [1, '#7ae8ff']] as const) grad.addColorStop(t, c);
    g.fillStyle = grad;
    g.strokeStyle = '#140a24';
    g.lineWidth = 5;
    g.strokeText('BUTTERFLY 3000', w / 2, h / 2 + 1, w - 8);
    g.fillText('BUTTERFLY 3000', w / 2, h / 2 + 1, w - 8);
  });
  for (const side of [-1, 1]) sticker(body, logo, [side * 0.252, 0.36, 0.25], [0, side * (Math.PI / 2), 0], 1.1, 0.17);
  put(body, cyl(0.06, 0.06, 1.1), steel, [0, 0.75, 1.05], [0.5, 0, 0]);
  put(body, box(0.5, 0.04, 0.04), steel, [0, 1.0, 0.95]);
  // A chrome mudguard over the front wheel; ribbons streaming off the handlebar ends.
  put(body, new THREE.TorusGeometry(0.4, 0.05, 4, 16, Math.PI * 0.8), steel, [0, 0.34, 1.15], [0, Math.PI / 2, Math.PI * 0.15], [1, 1, 1.6]);
  const ribbons = [-1, 1].map((side) => {
    put(body, cyl(0.03, 0.03, 0.1, 8), M.matte(0x1a1a1a), [side * 0.28, 1.0, 0.95], [0, 0, Math.PI / 2]);
    const { pivot, inner } = swinger(body, [side * 0.33, 1.0, 0.95], 'y', side * 0.8);
    for (const [k, c] of [r.accent, 0xffe45a, 0x7ae8ff].entries()) put(inner, box(0.012, 0.03, 0.36), M.matte(c, { side: THREE.DoubleSide }), [side * 0.01 * k, -0.02 * k, -0.18], [0, side * 0.08 * k, 0]);
    return pivot;
  });
  // Glowing lamp on the nose, the light it can't stop chasing, a tiny morpho already circling it.
  put(body, ball(0.16), M.glow(0xfff2a8), [0, 1.0, 1.35]);
  put(body, cyl(0.17, 0.2, 0.12, 14), steel, [0, 1.0, 1.24], [Math.PI / 2, 0, 0]);
  glowSprite(body, [0, 1.0, 1.4], 1.4, 0xfff2a8);
  const lampOrbit = new THREE.Group();
  lampOrbit.position.set(0, 1.0, 1.35);
  const tiny = new THREE.Group();
  tiny.position.set(0.3, 0.05, 0);
  put(tiny, ball(0.025, 6, 4), velvet, [0, 0, 0]);
  for (const side of [-1, 1]) put(tiny, box(0.09, 0.005, 0.06), M.glow(0x3a9aff), [side * 0.045, 0, 0], [0, 0, side * 0.4]);
  lampOrbit.add(tiny);
  body.add(lampOrbit);

  // The chrysalis it came out of, hung from a hook over the back axle: jade, gold-dotted, split open and empty.
  const jade = M.gloss(0x5ac86a, { shininess: 90, specular: 0xaaffaa, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const goldDot = M.gloss(0xffd23a, { specular: 0xffffff, shininess: 140 });
  rod(body, [0, 0.5, -1.05], [0, 1.42, -1.1], 0.02, steel);
  put(body, new THREE.TorusGeometry(0.04, 0.008, 4, 10, Math.PI * 1.3), steel, [0, 1.42, -1.07], [0, Math.PI / 2, 0]);
  put(body, cyl(0.012, 0.012, 0.06, 4), leg, [0, 1.36, -1.03]);
  for (const side of [-1, 1]) {
    const half = put(body, new THREE.SphereGeometry(0.13, 10, 8, side > 0 ? 0 : Math.PI, Math.PI * 0.8), jade, [side * 0.03, 1.15, -1.03], [0, 0, side * 0.25], [1, 1.9, 1]);
    half.rotation.order = 'ZYX';
    for (let k = 0; k < 3; k++) put(body, ball(0.012, 5, 4), goldDot, [side * (0.09 + k * 0.01), 1.22 - k * 0.05, -0.98 + k * 0.02]);
  }
  put(body, new THREE.TorusGeometry(0.1, 0.012, 4, 14), goldDot, [0, 1.25, -1.03], [Math.PI / 2, 0, 0], [1, 0.8, 1]);

  // The butterfly: velvet thorax, big dark eyes, clubbed antennae, six legs, four great blue wings.
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.3);
  put(d, ball(0.34, 14, 10), velvet, [0, 0.42, 0], [0, 0, 0], [1, 1.2, 1]);
  studs(d, velvetLight, [0, 0.42, 0], [0.34, 0.41, 0.34], 60, 0.05, (_x, y) => y > -0.3, 0.5, [5, 3]);
  // A collar of blue-tipped fur at the neck.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    put(d, cone(0.06, 0.16, 4), k % 2 ? velvetLight : M.matte(r.color, { emissive: 0x0a2a4a }), [Math.sin(a) * 0.28, 0.72, Math.cos(a) * 0.28], [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]);
  }
  put(d, ball(0.24, 12, 10), velvet, [0, 0.15, -0.35], [0.6, 0, 0], [0.7, 0.7, 1.5]);
  for (let k = 0; k < 4; k++) put(d, new THREE.TorusGeometry(0.15 - k * 0.025, 0.018, 4, 14), velvetLight, [0, 0.12 - k * 0.05, -0.42 - k * 0.1], [0.9, 0, 0]);
  // Front legs on the bars; the rest gripping the frame.
  for (const side of [-1, 1]) {
    arm(d, [side * 0.18, 0.5, 0.2], [side * 0.25, 0.45, 1.25], 0.025, leg, leg);
    rod(d, [side * 0.2, 0.3, 0.1], [side * 0.3, -0.13, 0.3], 0.02, leg);
    rod(d, [side * 0.2, 0.3, -0.05], [side * 0.3, -0.13, -0.3], 0.02, leg);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.05);
  put(head, ball(0.22, 14, 10), velvet, [0, 0, 0]);
  const eyeMat = M.gloss(0x14202a, { shininess: 140, specular: 0x88aaff, flatShading: true });
  for (const side of [-1, 1]) {
    put(head, new THREE.IcosahedronGeometry(0.14, 1), eyeMat, [side * 0.15, 0.04, 0.12]);
    // A big glint, and a ring of the wings' blue round it: wide awake and new to the world.
    put(head, ball(0.035, 6, 4), M.glow(0xffffff), [side * 0.17, 0.11, 0.25]);
    put(head, ball(0.015, 4, 3), M.glow(0xffffff), [side * 0.2, 0.05, 0.255]);
    // Clubbed antennae.
    const tipAt: V3 = [side * 0.3, 0.58, 0.32];
    tube(head, [[side * 0.06, 0.17, 0.1], [side * 0.15, 0.4, 0.18], tipAt], 0.012, leg, 0.01, 4);
    put(head, ball(0.035, 8, 6), M.matte(r.accent), tipAt, [0, 0, 0], [1, 1.6, 1]);
  }
  // A curled proboscis, and a little smile under it.
  put(head, new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI * 1.6), M.matte(0x3a2a20), [0, -0.14, 0.2], [0, Math.PI / 2, 0]);
  put(head, new THREE.TorusGeometry(0.05, 0.01, 4, 10, Math.PI * 0.8), M.matte(0x0a0608), [0, -0.05, 0.205], [0, 0, Math.PI * 1.1]);
  d.add(head);
  const wingGeo = new THREE.ShapeGeometry(wingPath(), 10);
  const topMat = new THREE.MeshPhongMaterial({ map: morphoTexture(r.color, 0x0a2a8a), emissive: 0x0a1a4a, shininess: 120, specular: 0x88ccff, side: THREE.DoubleSide });
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.18, 0, -0.1);
    pivot.userData.side = side;
    for (const [y, tilt, s] of [[0.55, 0.35, 1], [0.35, -0.15, 0.7]] as const) {
      const w = new THREE.Group();
      w.position.set(0, y, 0);
      w.rotation.order = 'YXZ';
      w.rotation.set(0, side * -0.35, tilt * side);
      w.scale.set(side * s, s, 1);
      put(w, wingGeo, topMat, [0, 0, 0]);
      pivot.add(w);
    }
    d.add(pivot);
    flappers.push(pivot);
  }
  body.add(d);

  // Map the shape's coordinates onto the texture.
  topMat.map!.repeat.set(1 / 1.1, 1 / 0.85);
  topMat.map!.offset.set(0, 0.55 / 0.85);
  const exhausts = pipes(body, 0.25, 0.45, -1.2, 0.09);
  bake(body, [head, lampOrbit, ...ribbons, ...flappers]);
  bake(head);
  for (const f of flappers) bake(f);
  for (const r2 of ribbons) bake(r2);
  return {
    body,
    wheels: [
      { x: 0, z: 1.15, radius: 0.34, width: 0.18, front: true },
      { x: 0.72, z: -0.85, radius: 0.4, width: 0.26, front: false },
      { x: -0.72, z: -0.85, radius: 0.4, width: 0.26, front: false },
    ],
    exhausts,
    rearTrack: 0.72,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.2, 3.0],
    rotors: [lampOrbit],
    head,
    flappers: [...flappers, ...ribbons],
  };
}


// Arlo: an apricot standard poodle in a plush grey dog bed on wheels, ears flapping, tail going.
export function arlo(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const coat = matte(r.color, { shininess: 6 });
  const face = matte(0xe8c69a, { shininess: 10 });
  const plush = matte(0xffffff, { map: tex('plush', () => sparkleTexture([150, 150, 154])), shininess: 4 });
  const plushDark = matte(0x8a8a8e, { shininess: 4 });

  // The bed: a padded base, a bolster all round open at the front, on four wheels.
  put(body, cyl(0.9, 0.95, 0.3, 28), plushDark, [0, 0.42, 0], [0, 0, 0], [0.95, 1, 1.35]);
  put(body, cyl(0.8, 0.8, 0.06, 28), plush, [0, 0.58, 0], [0, 0, 0], [0.95, 1, 1.35]);
  // The bolster runs round the sides and back, open at the front, its ends rounded off.
  const rim = Array.from({ length: 13 }, (_, k) => {
    const a = Math.PI * (0.32 + (k / 12) * 1.36);
    return new THREE.Vector3(Math.sin(a) * 0.78, 0.7, Math.cos(a) * 1.08 - 0.05);
  });
  put(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 40, 0.2, 12, false), plush, [0, 0, 0]);
  for (const end of [rim[0], rim[rim.length - 1]]) put(body, ball(0.2, 12, 10), plush, end.toArray() as [number, number, number]);
  // A tennis ball riding on the front.
  put(body, ball(0.17, 16, 12), matte(0xd8f03a), [0.35, 0.72, 1.2]);
  put(body, ring(0.17, 0.012), matte(0xffffff), [0.35, 0.72, 1.2], [0.6, 0.4, 0]);
  headlights(body, 0.4, 0.5, 1.3, 0.07);

  const M = new Mats();
  // Stitching round the bolster, paw prints on the base, a chew bone on the cushion.
  const rimCurve = new THREE.CatmullRomCurve3(rim);
  const stitch = M.matte(0xd8d8dc);
  for (let k = 1; k < 30; k++) {
    const p = rimCurve.getPoint(k / 30);
    const t = rimCurve.getTangent(k / 30);
    put(body, box(0.012, 0.012, 0.05), stitch, [p.x, p.y + 0.198, p.z], [0, Math.atan2(t.x, t.z), 0]);
  }
  const pawMat = M.matte(0x5a5a62);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const at: V3 = [Math.sin(a) * 0.87, 0.42, Math.cos(a) * 1.25];
    const n: V3 = [Math.sin(a), 0, Math.cos(a) / 1.35];
    disc(body, [at[0] * 1.015, at[1], at[2] * 1.015], n, 0.045, pawMat, 8);
    for (let t = 0; t < 3; t++) {
      const tx = Math.cos(a) * (t - 1) * 0.04;
      const tz = -Math.sin(a) * (t - 1) * 0.04;
      disc(body, [at[0] * 1.015 + tx, at[1] + 0.06 - Math.abs(t - 1) * 0.015, at[2] * 1.015 + tz], n, 0.018, pawMat, 6);
    }
  }
  const boneMat = M.matte(0xf0e8d8);
  rod(body, [-0.45, 0.65, 0.65], [-0.2, 0.65, 0.9], 0.03, boneMat);
  for (const [x, z] of [[-0.45, 0.65], [-0.2, 0.9]] as const) for (const o of [-1, 1]) put(body, ball(0.04, 6, 5), boneMat, [x + o * 0.03, 0.65, z - o * 0.03]);
  // Booked on Flight b741: a little suitcase strapped on behind, covered in stickers.
  const caseMat = M.matte(0x8a4a2a, { shininess: 40 });
  const suitcase = new THREE.Group();
  suitcase.position.set(0, 0.86, -1.18);
  suitcase.rotation.x = -0.15;
  put(suitcase, box(0.62, 0.38, 0.18), caseMat, [0, 0, 0]);
  for (const x of [-0.2, 0.2]) put(suitcase, box(0.04, 0.39, 0.19), M.matte(0x3a2414), [x, 0, 0]);
  put(suitcase, new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), M.matte(0x2a1a10), [0, 0.19, 0]);
  for (const x of [-0.29, 0.29]) for (const y of [-0.17, 0.17]) put(suitcase, ball(0.022, 5, 4), M.gloss(0xd8a83a), [x, y, -0.09]);
  const stickers: [string, string, string][] = [['b741', '#ff7aa8', '#1a1a24'], ['WHEN PIGS FLY', '#ffe45a', '#1a1a24'], ['WOOF', '#7ae8ff', '#1a1a24']];
  for (const [k, [text, bg, fg]] of stickers.entries()) {
    const t = decal(`sticker-${text}`, 128, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = bg;
      g.beginPath();
      g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = fg;
      g.font = `900 ${text.length > 6 ? 16 : 28}px "Arial Black", Impact, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 1, w - 16);
    });
    sticker(suitcase, t, [-0.12 + k * 0.13, (k % 2 ? 0.08 : -0.06), -0.092], [0, Math.PI, (k - 1) * 0.25], 0.2, 0.1);
  }
  body.add(suitcase);
  for (const x of [-0.2, 0.2]) rod(body, [x, 0.7, -1.1], [x, 0.98, -1.22], 0.015, M.matte(0x2a1a10));

  const d = new THREE.Group();
  d.position.set(0, 0.62, -0.1);
  // Sitting up: a curly chest and haunches, the trimmed legs, curly paws on the wheel.
  const coatDeep = M.matte(new THREE.Color(r.color).multiplyScalar(0.82).getHex(), { shininess: 6 });
  curls(d, coat, [0, 0.42, 0], [0.32, 0.4, 0.3], 130, 0.07, 3, undefined, coatDeep);
  curls(d, coat, [0, 0.15, -0.3], [0.36, 0.2, 0.28], 80, 0.065, 5, undefined, coatDeep);
  const grips = steeringWheel(d, 0.5, 0.5, 0.2);
  for (const g of grips) {
    const side = Math.sign(g[0]);
    rod(d, [side * 0.18, 0.62, 0.12], g, 0.07, coat);
    curls(d, coat, g, [0.07, 0.07, 0.08], 12, 0.04, 9 + side);
  }
  // The tail, straight up and curly at the tip, wagging.
  // A sweeper turns about its own y axis: tipped back a quarter turn, that axis runs fore and aft, so the turn is a wag.
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.55);
  tail.rotation.x = -Math.PI / 2;
  tail.userData.phase = 0;
  const stub = new THREE.Group();
  stub.rotation.x = Math.PI / 2;
  rod(stub, [0, 0, 0], [0, 0.5, -0.12], 0.05, coat);
  curls(stub, coat, [0, 0.58, -0.14], [0.08, 0.12, 0.08], 16, 0.045, 13);
  tail.add(stub);
  d.add(tail);

  // The head: a long trimmed muzzle, a black nose, a curly topknot and long curly ears.
  const head = new THREE.Group();
  head.position.set(0, 1.02, 0.08);
  head.scale.setScalar(1.5);
  put(head, ball(0.2, 18, 14), face, [0, 0, 0], [0, 0, 0], [0.95, 1, 1.05]);
  put(head, cyl(0.1, 0.13, 0.3, 14), face, [0, -0.06, 0.2], [Math.PI / 2 - 0.15, 0, 0]);
  // A curly moustache round the muzzle, and the beard under it.
  curls(head, coat, [0, -0.1, 0.28], [0.1, 0.07, 0.07], 18, 0.035, 17, (_x, y, z) => z > 0.6 && y > 0);
  put(head, ball(0.065, 14, 10), matte(0x0a0a0a, { shininess: 120, specular: 0x666666 }), [0, -0.03, 0.37], [0, 0, 0], [1.1, 0.8, 0.8]);
  put(head, ball(0.06, 12, 8), matte(0x3a0a0a), [0, -0.14, 0.27], [0, 0, 0], [1, 0.4, 0.6]);
  // Panting: a pink tongue lolling out of the side of the mouth.
  put(head, ball(0.045, 8, 6), M.matte(0xf07a90, { shininess: 50 }), [0.03, -0.18, 0.3], [0.5, 0.3, 0], [0.8, 0.35, 1.5]);
  // Eyebrows that lift: a pair of tufts.
  for (const side of [-1, 1]) put(head, ball(0.035, 6, 4), coatDeep, [side * 0.08, 0.1, 0.17], [0, 0, side * -0.4], [1.4, 0.6, 0.8]);
  for (const side of [-1, 1]) {
    put(head, ball(0.04, 12, 10), matte(0x120806, { shininess: 100, specular: 0xffffff }), [side * 0.085, 0.04, 0.165]);
    put(head, ball(0.012, 6, 4), glow(0xffffff), [side * 0.085 + 0.012, 0.055, 0.2]);
  }
  curls(head, coat, [0, 0.17, -0.03], [0.19, 0.12, 0.19], 44, 0.05, 19, (_x, y, z) => y < -0.2 && z > 0.3);
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.17, 0.08, -0.02);
    ear.userData.side = side;
    curls(ear, coat, [side * 0.05, -0.2, 0], [0.065, 0.2, 0.06], 34, 0.042, 23 + side);
    head.add(ear);
    flappers.push(ear);
  }
  d.add(head);
  // A grey-blue collar.
  put(d, ring(0.2, 0.025), matte(0x3a4250), [0, 0.8, 0.04], [Math.PI / 2 - 0.2, 0, 0]);
  // On the collar, a bone-shaped tag: b741.
  const tag = decal('arlo-tag', 64, 32, (g, w, h) => {
    g.fillStyle = '#d8dee8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a24';
    g.font = '900 20px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('b741', w / 2, h / 2 + 1);
  });
  sticker(d, tag, [0, 0.72, 0.245], [0.3, 0, 0], 0.1, 0.05);
  for (const x of [-0.055, 0.055]) for (const y of [0.7, 0.74]) put(d, ball(0.016, 5, 4), M.gloss(0xd8dee8), [x, y, 0.238]);
  rod(d, [0, 0.76, 0.25], [0, 0.79, 0.22], 0.005, M.gloss(0xd8dee8));
  body.add(d);

  const exhausts = pipes(body, 0.3, 0.4, -1.3);
  bake(body, [head, tail]);
  bake(head, flappers);
  for (const f of flappers) bake(f);
  bake(tail);
  return {
    body,
    wheels: [0.82, -0.82].flatMap((x) => [
      { x, z: 0.95, radius: 0.32, width: 0.28, front: true },
      { x, z: -0.95, radius: 0.38, width: 0.32, front: false },
    ]),
    exhausts,
    rearTrack: 0.82,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.4, 3.3],
    head,
    flappers,
    sweepers: [tail],
  };
}

// Flying Pig: Flight b741's captain, for the day pigs fly. A pink pig on feathered wings, in a leather
// flying cap with goggles up, a white scarf streaming, a b741 luggage tag on the collar, curly tail going.
export function flyingPig(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const skin = matte(r.color, { shininess: 22, specular: 0x332222 });
  const blush = matte(0xf7b8c6, { shininess: 18 });
  const dark = matte(0x3a1a1e, { shininess: 40 });
  const leather = matte(0x6a3a1a, { shininess: 50, specular: 0x332211 });
  const feather = matte(0xfdfaf2, { shininess: 14, side: THREE.DoubleSide });
  const scarfMat = matte(0xf8f6f0, { side: THREE.DoubleSide });
  const M = new Mats();
  const featherTip = matte(0xece6dc, { shininess: 14, side: THREE.DoubleSide });
  const quill = M.matte(0xb8b0a0);
  // It flies: everything rides a metre off the road.
  const pig = new THREE.Group();
  pig.position.y = 0.95;
  body.add(pig);

  // A round barrel of a body, a paler belly, a plump rump.
  put(pig, ball(0.5, 22, 16), skin, [0, 0, 0], [0, 0, 0], [1, 0.86, 1.35]);
  put(pig, ball(0.42, 18, 12), blush, [0, -0.14, 0.05], [0, 0, 0], [0.95, 0.7, 1.2]);
  // Four trotters tucked up under it in flight, dark little hooves.
  for (const side of [-1, 1]) {
    for (const z of [0.38, -0.38]) {
      const hip: [number, number, number] = [side * 0.27, -0.25, z];
      const foot: [number, number, number] = [side * 0.3, -0.5, z - 0.12];
      rod(pig, hip, foot, 0.09, skin, 0.075);
      put(pig, cyl(0.07, 0.08, 0.08, 10), dark, [foot[0], foot[1] - 0.04, foot[2]]);
      // Cloven: a notch down the front of each hoof.
      put(pig, box(0.012, 0.09, 0.05), skin, [foot[0], foot[1] - 0.04, foot[2] + 0.06]);
    }
  }

  // The curly tail, wagging. Tipped back a quarter turn, the sweeper's turn is a wag (Arlo's trick).
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.66);
  tail.rotation.x = -Math.PI / 2;
  tail.userData.phase = 1.3;
  const curl = new THREE.Group();
  curl.rotation.x = Math.PI / 2;
  const spiral = Array.from({ length: 24 }, (_, k) => {
    const t = k / 23;
    const a = t * Math.PI * 4;
    return new THREE.Vector3(Math.sin(a) * 0.07 * (1 - t * 0.4), Math.cos(a) * 0.07 * (1 - t * 0.4) + t * 0.12, -t * 0.26);
  });
  put(curl, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 48, 0.025, 8, false), skin, [0, 0, 0]);
  tail.add(curl);
  pig.add(tail);

  // Feathered wings from the shoulders: a fan of long white flight feathers, the longest at the tip, swept back.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.38, 0.22, 0.2);
    wing.userData.side = side;
    put(wing, ball(0.16, 12, 10), feather, [side * 0.12, 0, 0], [0, 0, 0], [1.4, 0.45, 1.1]);
    for (let k = 0; k < 6; k++) {
      const len = 0.45 + k * 0.09;
      const f = put(wing, ball(0.5, 10, 6), k % 2 ? feather : featherTip, [0, 0, 0], [0, 0, 0], [len, 0.035, 0.11]);
      // The quill down its middle.
      put(f, box(0.9, 0.6, 0.06), quill, [0, 0.35, 0]);
      // Each feather fans further back than the one before.
      const a = 0.15 + k * 0.17;
      f.rotation.y = side * a;
      f.position.set(side * (0.12 + Math.cos(a) * len * 0.5), 0.01 * k, 0.05 - Math.sin(a) * len * 0.5);
    }
    pig.add(wing);
    // A row of short coverts over the roots of the flight feathers.
    for (let k = 0; k < 5; k++) {
      const a = 0.1 + k * 0.2;
      const f = put(wing, ball(0.5, 8, 5), feather, [0, 0, 0], [0, 0, 0], [0.32, 0.05, 0.1]);
      f.rotation.y = side * a;
      f.position.set(side * (0.14 + Math.cos(a) * 0.16), 0.03, 0.05 - Math.sin(a) * 0.16);
    }
    // Navigation lights on the wingtips, red to port and green to starboard, like any aircraft.
    const tipA = 0.49;
    const tip: V3 = [side * (0.12 + Math.cos(tipA) * 0.63), 0.03, 0.05 - Math.sin(tipA) * 0.63];
    put(wing, ball(0.035, 8, 6), M.glow(side < 0 ? 0xff2a2a : 0x2aff5a), tip);
    glowSprite(wing, tip, 0.3, side < 0 ? 0xff2a2a : 0x2aff5a);
    flappers.push(wing);
  }
  // A soft glow of cloud under it, kicking up the road.
  const pads = [glowSprite(pig, [0, -0.6, 0], 0.9, 0xffe6ee), ...[-1, 1].map((side) => glowSprite(pig, [side * 0.9, -0.45, -0.1], 0.55, 0xfff4f8))];

  // The head: round, a flat pink snout with two nostrils, floppy ears, the flying cap and goggles.
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.72);
  head.scale.setScalar(1.12);
  put(head, ball(0.34, 20, 16), skin, [0, 0, 0], [0, 0, 0], [1, 0.95, 1]);
  for (const side of [-1, 1]) put(head, ball(0.08, 10, 8), blush, [side * 0.2, -0.1, 0.22], [0, 0, 0], [1, 0.7, 0.5]);
  put(head, cyl(0.15, 0.16, 0.14, 20), blush, [0, -0.06, 0.33], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) put(head, ball(0.035, 10, 8), dark, [side * 0.055, -0.06, 0.4], [0, 0, 0], [0.8, 1.2, 0.5]);
  eyes(head, 0.1, 0.26, 0.13, 0.06, 0x3a2a1a);
  // A grin under the snout.
  put(head, new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), dark, [0, -0.17, 0.3], [0, 0, Math.PI]);
  const capTop = new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  put(head, capTop, leather, [0, 0.04, -0.02]);
  // The cap's earflaps hang down either side, the pig's own ears poking out under them, flopping.
  for (const side of [-1, 1]) {
    put(head, ball(0.12, 12, 10), leather, [side * 0.31, -0.06, -0.02], [0, 0, side * 0.15], [0.35, 1, 0.8]);
    const ear = new THREE.Group();
    ear.position.set(side * 0.24, 0.24, 0.02);
    ear.userData.side = side;
    put(ear, cone(0.1, 0.22, 4), skin, [side * 0.06, 0.04, 0.06], [0.9, 0, -side * 0.5], [1, 1, 0.35]);
    head.add(ear);
    flappers.push(ear);
  }
  // Goggles pushed up on the cap, brass rims, sky in the lenses.
  for (const side of [-1, 1]) {
    put(head, ring(0.075, 0.018), brass(), [side * 0.09, 0.26, 0.24], [-0.7, 0, 0]);
    put(head, new THREE.CircleGeometry(0.07, 18), glow(0x9ad8ff), [side * 0.09, 0.262, 0.243], [-0.7, 0, 0]);
  }
  // The captain's badge on the cap: gold wings.
  const gold = M.gloss(0xd8a83a, { specular: 0xffe0a0 });
  put(head, ball(0.025, 8, 6), gold, [0, 0.36, 0.2]);
  for (const side of [-1, 1]) put(head, ball(0.05, 8, 5), gold, [side * 0.055, 0.365, 0.19], [0, 0, side * -0.25], [1, 0.25, 0.4]);
  // Freckles over the snout.
  for (const [x, y] of [[-0.12, -0.0], [-0.15, -0.05], [0.13, -0.02], [0.16, -0.06], [0.1, -0.06]] as const) put(head, ball(0.012, 4, 3), M.matte(0xc8607a), [x, y, 0.3 - Math.abs(x) * 0.3]);
  pig.add(head);

  // The scarf round the neck, its two ends streaming back over the shoulder.
  put(pig, ring(0.34, 0.07), scarfMat, [0, 0.14, 0.6], [Math.PI / 2 - 0.25, 0, 0], [1, 1, 0.8]);
  // The ends stream back and flutter.
  const { pivot: scarf, inner: scarfIn } = swinger(pig, [0.1, 0.44, 0.48], 'z', 0.7);
  put(scarfIn, box(0.18, 0.03, 0.62), scarfMat, [0.1, 0.02, -0.3], [-0.12, 0.3, -0.15]);
  put(scarfIn, box(0.15, 0.03, 0.46), scarfMat, [0.0, 0.0, -0.24], [-0.08, 0.12, 0.1]);
  for (const [x, z] of [[0.17, -0.58], [0.04, -0.46]] as const) for (let k = 0; k < 4; k++) put(scarfIn, box(0.012, 0.012, 0.08), scarfMat, [x - 0.06 + k * 0.035, 0.0, z - 0.05]);
  // A luggage tag on the collar: FLIGHT b741.
  const label = tex('b741-tag', () => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2e6c8';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = `#${r.accent.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 128, 14);
    g.fillStyle = '#1a1a24';
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'center';
    g.fillText('FLIGHT', 64, 30);
    g.font = '900 26px Impact, "Arial Black", sans-serif';
    g.fillText('b741', 64, 58);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const tag = new THREE.Group();
  // Hung from the scarf under the chin, turned out a little.
  tag.position.set(-0.17, -0.18, 0.92);
  tag.rotation.set(0.1, -0.3, 0.12);
  put(tag, new THREE.PlaneGeometry(0.26, 0.13), new THREE.MeshBasicMaterial({ map: label, side: THREE.DoubleSide }), [0, 0, 0]);
  rod(pig, [-0.12, -0.02, 0.86], [-0.16, -0.11, 0.91], 0.006, matte(0x8a6a3a));
  pig.add(tag);
  // Its flight number on the rump, where an airliner has its registration: b741. A white strobe over the tail.
  const reg = decal('b741-rump', 128, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1a2a5a';
    g.font = '900 38px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('b741', w / 2, h / 2 + 2);
  });
  sticker(pig, reg, [0, 0.1, -0.665], [-0.05, Math.PI, 0], 0.34, 0.13);
  put(pig, ball(0.03, 8, 6), M.glow(0xffffff), [0, 0.38, -0.55]);
  glowSprite(pig, [0, 0.38, -0.55], 0.25, 0xffffff);
  bake(body, [pig]);
  bake(pig, [head, tail, scarf, ...flappers]);
  bake(head, flappers);
  for (const f of flappers) bake(f);
  bake(scarf);
  bake(tail);

  return {
    body,
    wheels: [],
    // Boost fire out of the back, under the tail: a pig with a jet in it.
    exhausts: [new THREE.Vector3(0, 0.95, -0.72)],
    rearTrack: 0.5,
    rearZ: -0.7,
    spinners: [],
    shadow: [2.6, 3.0],
    hover: { bob: 0.13, pads },
    head,
    flappers: [...flappers, scarf],
    sweepers: [tail],
  };
}
/** Curls over an ellipsoid: small balls scattered on its surface, each a little in or out, for a poodle's coat. */
function curls(parent: THREE.Object3D, mat: THREE.Material, at: [number, number, number], radii: [number, number, number], count: number, size: number, seed: number, skip?: (x: number, y: number, z: number) => boolean, shade?: THREE.Material): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Low-poly: there are hundreds, and they're merged into one mesh (bake).
  const geo = new THREE.SphereGeometry(size, 8, 6);
  for (let k = 0; k < count; k++) {
    // Even spread over the sphere (golden spiral), then stretched to the ellipsoid.
    const y = 1 - (2 * (k + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = k * 2.399963;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (skip?.(x, y, z)) continue;
    const out = 0.92 + rnd() * 0.16;
    put(parent, geo, shade && k % 3 === 0 ? shade : mat, [at[0] + x * radii[0] * out, at[1] + y * radii[1] * out, at[2] + z * radii[2] * out], [0, 0, 0], [1, 0.9 + rnd() * 0.3, 1]);
  }
  put(parent, new THREE.SphereGeometry(1, 16, 12), mat, at, [0, 0, 0], [radii[0] * 0.95, radii[1] * 0.95, radii[2] * 0.95]);
}
