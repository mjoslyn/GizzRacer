import * as THREE from 'three';
import type { RacerDef } from '../../physics/racers';
import { arm, ball, box, brass, chrome, cone, cyl, eyes, glow, glowSprite, gloss, headlights, matte, pipes, put, ring, rod, rubberMat, steeringWheel, tex, type KartModel } from '../racerModels';
import { keysTexture, skyEnvMap, spotsTexture, woodTexture } from '../textures';
import { bake, decal, disc, Mats, rivets, spike, sticker, studs, swinger, tube, type V3 } from './kit';

/** A name lettered in paint, for a hull or a fin: `w` by `h` px, transparent round the letters. */
function letteringTexture(text: string, color: string, w = 256, h = 64, font = '900 40px Impact, "Arial Black", sans-serif', outline = '#1a1a24'): THREE.CanvasTexture {
  return decal(`letters-${text}-${color}`, w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = outline;
    g.strokeText(text, w / 2, h / 2 + 2, w - 12);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2, w - 12);
  });
}

// ---- Han-Tyumi: the Fishing for Fishies robot in a clinker dinghy on wheels -----

/** A fish crate's end: pale slats stencilled FISH FO FISH, as on the Fishing for Fishies crate. */
function crateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d')!;
  // Three slats with dark seams and a little grain.
  for (let k = 0; k < 3; k++) {
    g.fillStyle = ['#d8b884', '#cfae78', '#dcbe8c'][k];
    g.fillRect(0, k * 64, 256, 64);
    g.fillStyle = 'rgba(90,60,30,0.25)';
    for (let j = 0; j < 5; j++) g.fillRect(0, k * 64 + 8 + j * 12 + (j % 2) * 3, 256, 2);
    g.fillStyle = 'rgba(40,24,10,0.7)';
    g.fillRect(0, k * 64 + 61, 256, 3);
  }
  g.font = '900 54px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#22304f';
  ['FISH', 'FO', 'FISH'].forEach((word, k) => g.fillText(word, 128, 34 + k * 62, 220));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function cyborgGourmand(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const M = new Mats();
  // Brushed steel rather than mirror chrome, so it reads as metal under any sky.
  const steel = gloss(r.color, { reflectivity: 0.12, shininess: 70, specular: 0x999999 });
  const dark = matte(0x222222);
  const wood = matte(0xffffff, { map: tex('wood', woodTexture) });
  const rail = matte(0x7a5634);
  const rope = matte(0xc8a86a);
  // Weathered paint: the strakes alternate a sun-faded teal, the top one a chipped red.
  const strakeMats = [matte(0x4f8a98), matte(0x67a4b0), matte(0x548f9c), matte(0xb04a3c)];

  // A clinker hull: four overlapping strakes a side, each flaring out over the one below,
  // drawn in a little at the transom and all the way to a raked stem at the bow.
  const STERN = -1.12;
  const FLARE = 0.45;
  const strakes = [0, 1, 2, 3].map((k) => ({ y: 0.44 + k * 0.13, hw: 0.42 + k * 0.1, stem: 1.2 + k * 0.08 }));
  const outline = (hw: number, stem: number, side: number): [number, number][] => [
    [side * hw * 0.86, STERN],
    [side * hw, -0.3],
    [side * hw, 0.4],
    [side * 0.03, stem],
  ];
  for (const side of [-1, 1]) {
    for (const [k, st] of strakes.entries()) {
      const pts = outline(st.hw, st.stem, side);
      for (let j = 0; j < 3; j++) {
        const [a, b] = [pts[j], pts[j + 1]];
        const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
        put(body, box(0.05, 0.17, Math.hypot(dx, dz) + 0.05), strakeMats[k], [(a[0] + b[0]) / 2, st.y, (a[1] + b[1]) / 2], [0, Math.atan2(dx, dz), -side * FLARE]);
      }
    }
    // The gunwale rail along the top strake, an oarlock on it.
    const top = outline(0.77, 1.47, side);
    for (let j = 0; j < 3; j++) rod(body, [top[j][0], 0.93, top[j][1]], [top[j + 1][0], 0.93, top[j + 1][1]], 0.035, rail);
    put(body, ring(0.05, 0.012, Math.PI), steel, [side * 0.77, 0.98, -0.25], [0, Math.PI / 2, 0]);
    // Ribs inside, so it reads as a boat from above.
    for (const z of [-0.8, -0.3, 0.3]) rod(body, [side * 0.38, 0.48, z], [side * 0.7, 0.9, z], 0.02, wood);
  }
  // Transom boards across the stern, a bottom and floorboards inside.
  for (const [k, st] of strakes.entries()) put(body, box(st.hw * 1.72 + 0.05, 0.155, 0.05), strakeMats[k], [0, st.y, STERN - 0.01]);
  put(body, box(0.8, 0.04, 1.55), strakeMats[0], [0, 0.37, -0.37]);
  for (let k = -1; k <= 1; k++) put(body, box(0.2, 0.03, 1.5), wood, [k * 0.23, 0.48, -0.3]);
  // The stem post, raked forward, and a foredeck.
  rod(body, [0, 0.36, 1.15], [0, 1.05, 1.58], 0.045, rail);
  const deck = new THREE.Shape();
  deck.moveTo(-0.46, 0.85);
  deck.lineTo(0.46, 0.85);
  deck.lineTo(0, 1.46);
  deck.closePath();
  put(body, new THREE.ExtrudeGeometry(deck, { depth: 0.04, bevelEnabled: false }).rotateX(Math.PI / 2), wood, [0, 0.94, 0]);
  // Thwarts: the robot sits on the middle one; the stern one carries the catch.
  put(body, box(1.42, 0.05, 0.28), wood, [0, 0.86, 0.15]);
  put(body, box(1.32, 0.05, 0.34), wood, [0, 0.86, -0.8]);

  // A hurricane lantern hung off the stem for a headlight.
  rod(body, [0, 1.05, 1.58], [0, 1.14, 1.72], 0.015, dark);
  put(body, cone(0.07, 0.06, 10), dark, [0, 1.1, 1.72]);
  put(body, cyl(0.055, 0.055, 0.1, 10), glow(0xffd88a), [0, 1.02, 1.72]);
  put(body, cyl(0.07, 0.07, 0.025, 10), dark, [0, 0.96, 1.72]);
  glowSprite(body, [0, 1.02, 1.74], 0.45, 0xffc870);
  // A coil of rope on the foredeck, its end made fast to the stem.
  for (let k = 0; k < 3; k++) put(body, ring(0.11 - k * 0.012, 0.025), rope, [-0.17, 0.95 + k * 0.035, 1.02], [Math.PI / 2, 0, 0]);
  rod(body, [-0.08, 1.02, 1.08], [0, 1.0, 1.52], 0.015, rope);

  // The catch on the stern thwart: the FISH FO FISH crate, a bucket with a goldfish's tail out of it, a tackle box.
  const slats = matte(0xffffff, { map: tex('fish-crate', crateTexture) });
  const plain = matte(0xd0ae78);
  put(body, box(0.44, 0.32, 0.32), [slats, slats, plain, plain, slats, slats], [0.32, 1.045, -0.8]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) put(body, box(0.04, 0.33, 0.04), matte(0x8a6a40), [0.32 + x * 0.21, 1.045, -0.8 + z * 0.15]);
  const tin = gloss(0xb8c2cc, { reflectivity: 0.2 });
  put(body, cyl(0.12, 0.1, 0.22, 14), tin, [-0.45, 0.995, -0.8]);
  put(body, ring(0.12, 0.012), tin, [-0.45, 1.105, -0.8], [Math.PI / 2, 0, 0]);
  put(body, cyl(0.11, 0.11, 0.01, 14), glow(0x3a7ab8), [-0.45, 1.09, -0.8]);
  put(body, ring(0.12, 0.008, Math.PI), dark, [-0.45, 1.1, -0.8], [0, Math.PI / 2, 0]);
  const fish = new THREE.Group();
  fish.position.set(-0.47, 1.1, -0.8);
  fish.rotation.set(-Math.PI / 2 + 0.35, 0, 0.3);
  const scales = gloss(0xf09a2a);
  put(fish, ball(0.06, 10, 8), scales, [0, 0, 0.02], [0, 0, 0], [0.6, 1, 1.9]);
  for (const side of [-1, 1]) put(fish, box(0.012, 0.11, 0.06), scales, [0, side * 0.04, 0.16], [side * 0.5, 0, 0]);
  body.add(fish);
  const tackle = gloss(0x2f8a48);
  put(body, box(0.22, 0.14, 0.3), tackle, [-0.12, 0.955, -0.8]);
  put(body, box(0.235, 0.04, 0.315), matte(0x1e5a30), [-0.12, 1.04, -0.8]);
  put(body, ring(0.06, 0.012, Math.PI), dark, [-0.12, 1.06, -0.8], [0, Math.PI / 2, 0]);
  put(body, box(0.05, 0.04, 0.01), brass(), [-0.12, 1.01, -0.96]);

  // An outboard on the transom: clamp, cowling with a red band and a tiller, the leg down to a propeller.
  put(body, box(0.2, 0.18, 0.12), dark, [0, 0.88, STERN - 0.07]);
  const cowl = matte(0xeeeae0, { shininess: 60, specular: 0x444444 });
  put(body, box(0.3, 0.26, 0.4), cowl, [0, 1.1, -1.34]);
  put(body, ball(0.2, 14, 10), cowl, [0, 1.23, -1.34], [0, 0, 0], [0.75, 0.45, 1.0]);
  put(body, box(0.31, 0.05, 0.41), gloss(r.accent), [0, 1.03, -1.34]);
  put(body, box(0.08, 0.04, 0.02), dark, [0, 1.15, -1.55]);
  rod(body, [-0.1, 1.08, -1.16], [-0.3, 1.22, -0.98], 0.025, dark);
  put(body, cyl(0.035, 0.035, 0.1, 8), matte(0x111111), [-0.33, 1.24, -0.95], [0, 0, Math.PI / 2]);
  put(body, box(0.1, 0.62, 0.12), dark, [0, 0.66, -1.4]);
  put(body, box(0.26, 0.02, 0.22), dark, [0, 0.42, -1.42]);
  put(body, cyl(0.07, 0.05, 0.3, 10), dark, [0, 0.3, -1.42], [Math.PI / 2, 0, 0]);
  const prop = new THREE.Group();
  prop.position.set(0, 0.3, -1.6);
  const blade = box(0.06, 0.15, 0.015).translate(0, 0.075, 0);
  for (let k = 0; k < 3; k++) put(prop, blade, brass(), [0, 0, 0], [0, 0.3, (k * Math.PI * 2) / 3]);
  put(prop, cyl(0.03, 0.03, 0.06, 8), dark, [0, 0, 0], [Math.PI / 2, 0, 0]);
  body.add(prop);

  // A net draped over the starboard side, corks along the top, a little fish caught in it.
  const net = matte(0x5a6a3a);
  for (let k = 0; k < 6; k++) {
    const z = -0.42 + k * 0.14;
    rod(body, [-0.79, 0.93, z], [-0.55, 0.5, z + 0.28], 0.007, net);
    rod(body, [-0.79, 0.93, z + 0.28], [-0.55, 0.5, z], 0.007, net);
  }
  for (let k = 0; k < 4; k++) put(body, cyl(0.03, 0.03, 0.05, 8), matte(0xd88a3a), [-0.8, 0.95, -0.35 + k * 0.2], [0, 0, Math.PI / 2]);
  put(body, ball(0.04, 8, 6), gloss(0x7ac0d8), [-0.67, 0.68, -0.05], [0, 0, 0], [0.5, 1, 1.8]);
  put(body, cone(0.035, 0.06, 4), gloss(0x7ac0d8), [-0.67, 0.68, 0.07], [-Math.PI / 2, 0, 0], [0.4, 1, 1]);
  // Lily pads plastered to the port planks, fresh out of the pond, one in flower, and weed off the stem.
  for (const [k, z, a] of [[1, 0.1, 0.4], [0, -0.55, 2.2], [2, -0.3, 4.1]] as const) {
    const pad = new THREE.Group();
    pad.position.set(strakes[k].hw + 0.035, strakes[k].y, z);
    pad.rotation.z = -FLARE;
    put(pad, new THREE.CircleGeometry(0.12, 14, a, Math.PI * 2 - 0.6), matte(0x4a9a3a, { side: THREE.DoubleSide }), [0, 0, 0], [0, Math.PI / 2, 0]);
    body.add(pad);
  }
  put(body, ball(0.04, 8, 6), matte(0xf4a0c0), [strakes[1].hw + 0.06, strakes[1].y, 0.1]);
  for (let k = 0; k < 3; k++) put(body, cone(0.025, 0.22, 5), matte(0x3a7a2a), [-0.02 + k * 0.02, 0.5, 1.22 + k * 0.04], [Math.PI, 0, 0.2 - k * 0.2]);

  // Stub axles out to the wheels, red mudguards over them.
  for (const side of [-1, 1]) {
    for (const z of [0.85, -0.85]) {
      rod(body, [side * (z > 0 ? 0.2 : 0.38), 0.36, z], [side * 0.86, 0.36, z], 0.04, steel);
      put(body, ring(0.42, 0.035, Math.PI), gloss(r.accent), [side * 0.9, 0.36, z], [0, Math.PI / 2, 0]);
    }
  }
  // The cast: a bobber where the line ends.
  put(body, ball(0.05, 10, 8), gloss(0xd8302a), [0.8, 2.08, -1.15]);
  put(body, ball(0.05, 10, 8), gloss(0xffffff), [0.8, 2.12, -1.15], [0, 0, 0], [1, 0.4, 1]);

  // The Fishing for Fishies robot: blue overalls stitched in yellow, a bucket hat, a rod over the shoulder.
  const d = new THREE.Group();
  d.position.set(0, 0.9, 0.15);
  const denim = matte(0x2d5cb8);
  const stitch = matte(0xf2c230);
  put(d, box(0.54, 0.5, 0.36), steel, [0, 0.34, 0]);
  put(d, box(0.6, 0.34, 0.42), denim, [0, 0.2, 0]);
  put(d, box(0.4, 0.26, 0.04), denim, [0, 0.46, 0.2]);
  for (const side of [-1, 1]) {
    // Straps over the shoulders, a button each, a pocket each side of the bib.
    put(d, box(0.08, 0.04, 0.4), denim, [side * 0.16, 0.6, 0], [0.15, 0, 0]);
    put(d, ball(0.03, 8, 6), stitch, [side * 0.15, 0.56, 0.22]);
    put(d, box(0.13, 0.1, 0.02), denim, [side * 0.12, 0.42, 0.225]);
    put(d, box(0.13, 0.012, 0.025), stitch, [side * 0.12, 0.47, 0.226]);
    put(d, box(0.012, 0.26, 0.025), stitch, [side * 0.18, 0.46, 0.226]);
  }
  put(d, box(0.36, 0.012, 0.025), stitch, [0, 0.335, 0.226]);
  for (const side of [-1, 1]) put(d, ball(0.1, 10, 8), steel, [side * 0.34, 0.52, 0], [0, 0, 0], [1, 0.8, 1]);
  const grips = steeringWheel(d, 0.32, 0.65, 0.2);
  arm(d, [-0.34, 0.5, 0.02], grips[0], 0.06, steel, dark);
  // The other hand holds a fishing rod up over the cart, the line trailing back.
  arm(d, [0.34, 0.5, 0.02], [0.55, 0.75, 0.25], 0.06, steel, dark);
  rod(d, [0.55, 0.68, 0.3], [0.58, 0.95, 0.2], 0.035, matte(0xc89a5a));
  rod(d, [0.58, 0.95, 0.2], [0.75, 2.1, -0.6], 0.015, matte(0x2a2a2a));
  // The reel turns as it goes, line guides up the rod.
  const reel = new THREE.Group();
  reel.position.set(0.62, 0.86, 0.26);
  reel.rotation.y = Math.PI / 2;
  put(reel, cyl(0.055, 0.055, 0.05, 10), steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
  put(reel, box(0.012, 0.09, 0.012), dark, [0, 0.04, 0.03]);
  put(reel, cyl(0.015, 0.015, 0.03, 6), M.matte(0xc8202a), [0, 0.085, 0.045], [Math.PI / 2, 0, 0]);
  d.add(reel);
  for (const t of [0.25, 0.5, 0.75, 0.95]) put(d, new THREE.TorusGeometry(0.018, 0.004, 3, 8), steel, [0.58 + 0.17 * t, 0.95 + 1.15 * t - 0.02, 0.2 - 0.8 * t], [0, Math.PI / 2, 0]);
  rod(d, [0.75, 2.1, -0.6], [0.8, 1.2, -1.3], 0.004, matte(0xeeeeee));
  put(d, cyl(0.07, 0.11, 0.18), denim, [0, 0.66, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.92, 0.02);
  put(head, box(0.48, 0.4, 0.42), steel, [0, 0, 0]);
  // Red round eyes in dark sockets, a grille of teeth for a mouth.
  for (const side of [-1, 1]) {
    put(head, cyl(0.08, 0.08, 0.03, 14), dark, [side * 0.11, 0.06, 0.215], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.05, 0.05, 0.03, 14), glow(0xff2a2a), [side * 0.11, 0.06, 0.23], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.06, 0.06, 0.06, 12), dark, [side * 0.26, 0, 0], [0, 0, Math.PI / 2]);
  }
  put(head, box(0.3, 0.1, 0.02), dark, [0, -0.11, 0.215]);
  for (let k = 0; k < 6; k++) put(head, box(0.04, 0.08, 0.02), matte(0xd8d8d8), [-0.125 + k * 0.05, -0.11, 0.225]);
  // Bucket hat, brim turned down.
  const hat = matte(0x2a63c8);
  put(head, cyl(0.25, 0.27, 0.2, 18), hat, [0, 0.29, 0]);
  put(head, cyl(0.25, 0.25, 0.02, 18), hat, [0, 0.4, 0]);
  put(head, cyl(0.29, 0.38, 0.06, 20), hat, [0, 0.2, 0]);
  // Han-Tyumi, confused: rivets round the face plate, one brow up and one down, a cheek vent, an aerial with a lamp.
  rivets(head, steel, [-0.22, 0.18, 0.215], [0.22, 0.18, 0.215], 6, 0.014);
  rivets(head, steel, [-0.22, -0.18, 0.215], [0.22, -0.18, 0.215], 6, 0.014);
  put(head, box(0.13, 0.025, 0.02), dark, [-0.11, 0.17, 0.225], [0, 0, 0.35]);
  put(head, box(0.13, 0.025, 0.02), dark, [0.11, 0.14, 0.225], [0, 0, 0.08]);
  for (let k = 0; k < 3; k++) put(head, box(0.012, 0.012, 0.12), dark, [0.245, -0.08 + k * 0.03, 0.05]);
  rod(head, [-0.18, 0.2, -0.1], [-0.24, 0.62, -0.18], 0.008, steel);
  put(head, ball(0.03, 8, 6), M.glow(0xff3a2a), [-0.24, 0.64, -0.18]);
  // A hose from the chest into the jaw: the feeding tube of a cyborg who longs to eat.
  tube(d, [[0.12, 0.52, 0.2], [0.2, 0.62, 0.28], [0.16, 0.76, 0.24]], 0.022, M.matte(0x3a3a3a));
  rivets(d, M.matte(0x8a8a8a), [0.12, 0.6, 0.235], [0.12, 0.6, 0.235], 1, 0.03);
  d.add(head);
  body.add(d);

  // Leaky: a patch nailed over a sprung plank, water spurting from the seam beside it into the road.
  const patch = M.matte(0x8a6a48);
  put(body, box(0.05, 0.16, 0.3), patch, [-(strakes[1].hw + 0.04), strakes[1].y, -0.55], [0, 0, FLARE]);
  rivets(body, M.matte(0x3a3a3a), [-(strakes[1].hw + 0.07), strakes[1].y + 0.06, -0.68], [-(strakes[1].hw + 0.07), strakes[1].y + 0.06, -0.42], 4, 0.012);
  rivets(body, M.matte(0x3a3a3a), [-(strakes[1].hw + 0.03), strakes[1].y - 0.06, -0.68], [-(strakes[1].hw + 0.03), strakes[1].y - 0.06, -0.42], 4, 0.012);
  const water = M.haze(0x8ad8ff, 0.75);
  for (const [z, up] of [[-0.25, 0.1], [0.2, 0.05]] as const) {
    const pts: V3[] = Array.from({ length: 5 }, (_, k) => [-(strakes[1].hw + 0.05) - k * 0.07, strakes[1].y + up * k - 0.025 * k * k, z - k * 0.04]);
    tube(body, pts, 0.014, water, 0.006, 5);
    for (let k = 0; k < 3; k++) put(body, ball(0.014, 5, 4), water, [pts[4][0] - 0.05 - k * 0.04, pts[4][1] - 0.05 - k * 0.06, pts[4][2] - k * 0.03]);
  }
  // Copper nails down every strake, and her name on the topsides: HAN-TYUMI.
  const copper = M.matte(0xb8703a, { shininess: 60 });
  for (const side of [-1, 1]) {
    for (const st of strakes) {
      const x = side * (st.hw + 0.03);
      rivets(body, copper, [x * 0.88, st.y - 0.06, STERN + 0.08], [x, st.y - 0.06, -0.3], 4, 0.011);
      rivets(body, copper, [x, st.y - 0.06, -0.15], [x, st.y - 0.06, 0.4], 3, 0.011);
    }
    const nameplate = new THREE.Group();
    nameplate.position.set(side * (strakes[3].hw + 0.045), strakes[3].y, 0.06);
    nameplate.rotation.z = -side * FLARE;
    sticker(nameplate, letteringTexture('HAN-TYUMI', '#f4ecd8', 256, 64, '900 44px Georgia, "Times New Roman", serif', '#16243a'), [0, 0, 0], [0, side * (Math.PI / 2), 0], 0.62, 0.15);
    body.add(nameplate);
  }
  // A red fuel can in the stern with its hose to the outboard.
  put(body, box(0.18, 0.2, 0.12), M.gloss(0xc8302a), [0.42, 0.98, -1.0]);
  put(body, cyl(0.02, 0.02, 0.05, 6), M.matte(0x222222), [0.47, 1.1, -1.0]);
  tube(body, [[0.47, 1.12, -1.0], [0.35, 1.2, -1.15], [0.15, 1.15, -1.28]], 0.012, M.matte(0x222222));
  // The fish in the bucket flaps.
  fish.userData.side = 0.8;
  bake(body, [head, prop, fish, reel]);
  bake(head);

  return {
    body,
    wheels: [0.9, -0.9].flatMap((x) => [
      { x, z: 0.85, radius: 0.36, width: 0.28, front: true },
      { x, z: -0.85, radius: 0.36, width: 0.28, front: false },
    ]),
    // The outboard's propeller hub is the exhaust.
    exhausts: [new THREE.Vector3(0, 0.3, -1.66)],
    rearTrack: 0.9,
    rearZ: -0.9,
    spinners: [prop, reel],
    flappers: [fish],
    shadow: [2.3, 3.3],
    head,
  };
}

// ---- Cosmic Coyote: space coyote in a rocket roadster ---------------------------

export function cosmicCoyote(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.color);
  const trim = gloss(r.accent);
  const fur = matte(0xc89060);
  const belly = matte(0xf0d8b0);

  // Low roadster with a rocket on its back, tail fins, portholes and a radar dish.
  put(body, box(1.2, 0.3, 2.6), paint, [0, 0.42, 0]);
  put(body, cone(0.55, 0.9, 16), paint, [0, 0.45, 1.6], [Math.PI / 2, 0, 0], [1, 1, 0.55]);
  put(body, box(1.22, 0.06, 2.0), trim, [0, 0.58, -0.1]);
  for (const side of [-1, 1]) {
    put(body, box(0.06, 0.55, 0.6), trim, [side * 0.58, 0.75, -1.05], [0, 0, side * 0.25]);
    for (let k = 0; k < 2; k++) {
      put(body, cyl(0.1, 0.1, 0.03, 14), chrome(), [side * 0.61, 0.44, 0.9 - k * 0.35], [0, 0, Math.PI / 2]);
      put(body, cyl(0.07, 0.07, 0.035, 14), glow(0x7ad8ff), [side * 0.615, 0.44, 0.9 - k * 0.35], [0, 0, Math.PI / 2]);
    }
  }
  const rocket = put(body, cyl(0.24, 0.24, 1.3, 14), chrome(), [0, 0.82, -0.9], [Math.PI / 2, 0, 0]);
  put(rocket, cone(0.24, 0.4, 14), trim, [0, 0.85, 0]);
  for (let k = 0; k < 3; k++) put(rocket, box(0.03, 0.4, 0.3), trim, [0, -0.45, 0], [0, (k * Math.PI * 2) / 3, 0]);
  put(rocket, ring(0.24, 0.03), trim, [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  put(rocket, cyl(0.2, 0.26, 0.12, 14), matte(0x2a2a2a), [0, -0.7, 0]);
  rod(body, [-0.45, 0.6, -0.5], [-0.45, 1.1, -0.6], 0.02, chrome());
  // The radar dish sweeps the sky for the troopers.
  const radar = new THREE.Group();
  radar.position.set(-0.45, 1.1, -0.6);
  radar.userData.phase = 0.5;
  put(radar, new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome(), [0, 0.02, 0], [-0.9, 0, 0]);
  rod(radar, [0, 0.02, 0], [0, 0.1, 0.1], 0.008, chrome());
  put(radar, ball(0.02, 6, 4), glow(0xff3a3a), [0, 0.1, 0.1]);
  body.add(radar);
  // Stars painted down the sides, a ringed planet on the nose.
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) put(body, new THREE.OctahedronGeometry(0.06), glow(0xfff2a8), [side * 0.61, 0.45, 0.4 - k * 0.4]);
  put(body, ball(0.1, 12, 8), glow(0xff9a1f), [0, 0.68, 1.35]);
  put(body, ring(0.16, 0.012), glow(0xfff2a8), [0, 0.68, 1.35], [1.2, 0, 0.3]);
  headlights(body, 0.35, 0.48, 1.62, 0.08, 0xc8f0ff);

  // The coyote: long snout, tall ears, goggles, scarf, a bubble helmet, a bushy tail.
  const d = new THREE.Group();
  d.position.set(0, 0.58, -0.2);
  put(d, cyl(0.3, 0.38, 0.65), fur, [0, 0.4, 0]);
  put(d, cyl(0.33, 0.33, 0.12, 14), trim, [0, 0.72, 0]);
  // The scarf streams out behind.
  for (let k = 0; k < 5; k++) put(d, box(0.14 - k * 0.012, 0.03, 0.22), trim, [0.18 + k * 0.03, 0.72 + Math.sin(k * 1.4) * 0.06, -0.25 - k * 0.2], [0, 0.1, Math.sin(k) * 0.3]);
  for (let k = 0; k < 5; k++) put(d, ball(0.16 - k * 0.015, 10, 8), k > 3 ? belly : fur, [0, 0.12 + k * 0.08, -0.35 - k * 0.12]);
  const grips = steeringWheel(d, 0.55, 0.62, 0.2);
  for (const [k, side] of [-1, 1].entries()) arm(d, [side * 0.33, 0.62, 0.05], grips[k], 0.07, fur, matte(0x7a4a2a));
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.05);
  put(head, ball(0.27), fur, [0, 0, 0], [0, 0, 0], [1, 0.95, 1]);
  put(head, cone(0.15, 0.42, 12), fur, [0, -0.06, 0.36], [Math.PI / 2, 0, 0]);
  put(head, ball(0.06), matte(0x1a1010), [0, -0.05, 0.58]);
  put(head, ball(0.14), belly, [0, -0.13, 0.14], [0, 0, 0], [1.2, 0.6, 1]);
  // A toothy grin along the snout.
  for (let k = 0; k < 3; k++) put(head, cone(0.015, 0.04, 4), matte(0xffffff), [-0.04 + k * 0.04, -0.15, 0.38 + k * 0.02], [Math.PI, 0, 0]);
  for (const side of [-1, 1]) {
    put(head, cone(0.1, 0.38, 6), fur, [side * 0.15, 0.3, -0.02], [0, 0, side * -0.2]);
    put(head, cone(0.055, 0.25, 6), matte(0xf0b8a0), [side * 0.15, 0.28, 0.02], [0, 0, side * -0.2]);
    put(head, cyl(0.08, 0.08, 0.06, 12), chrome(), [side * 0.11, 0.08, 0.22], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.06, 0.06, 0.065, 12), glow(r.accent), [side * 0.11, 0.08, 0.23], [Math.PI / 2, 0, 0]);
  }
  put(head, box(0.42, 0.04, 0.04), matte(0x2a2a2a), [0, 0.08, 0.2]);
  // Fishbowl helmet with a little antenna.
  put(head, ball(0.5, 20, 14), new THREE.MeshPhongMaterial({ color: 0xc8e8ff, transparent: true, opacity: 0.22, shininess: 140, specular: 0xffffff, depthWrite: false, envMap: tex('sky-env', skyEnvMap), reflectivity: 0.4 }), [0, 0.02, 0.08]);
  put(head, ring(0.36, 0.04), chrome(), [0, -0.3, 0.08], [Math.PI / 2, 0, 0]);
  rod(head, [0.2, 0.42, -0.1], [0.28, 0.72, -0.15], 0.012, chrome());
  put(head, ball(0.035, 8, 6), glow(0xff3a3a), [0.28, 0.74, -0.15]);
  // Mad Dog Morgan, bushranger: a slouch hat pinned up at the side, a wild beard, a bandolier and a revolver.
  const M = new Mats();
  const felt = M.matte(0x5a3a22, { shininess: 10 });
  put(head, cyl(0.29, 0.29, 0.02, 18), felt, [0, 0.24, -0.02]);
  put(head, new THREE.CircleGeometry(0.29, 12, 0, Math.PI), M.matte(0x5a3a22, { side: THREE.DoubleSide }), [-0.02, 0.25, -0.02], [-Math.PI / 2, 0.9, Math.PI / 2], [1, 0.55, 1]);
  put(head, cyl(0.15, 0.17, 0.15, 14), felt, [0, 0.32, -0.02]);
  put(head, box(0.04, 0.03, 0.24), M.matte(0x3a2414), [0, 0.39, -0.02]);
  put(head, cyl(0.172, 0.172, 0.04, 14), M.matte(0x2a1a10), [0, 0.27, -0.02]);
  put(head, new THREE.OctahedronGeometry(0.03), M.gloss(0xd8a83a), [-0.17, 0.3, 0.02]);
  const beardMat = M.matte(0x3a2414, { shininess: 6 });
  for (let k = 0; k < 9; k++) {
    const a = ((k - 4) / 4) * 1.1;
    spike(head, [Math.sin(a) * 0.16, -0.14, 0.12 + Math.cos(a) * 0.12], [Math.sin(a) * 0.22, -0.36 - (k % 3) * 0.05, 0.14 + Math.cos(a) * 0.12], 0.05, beardMat, 5);
  }
  for (const side of [-1, 1]) spike(head, [side * 0.05, -0.1, 0.42], [side * 0.18, -0.16, 0.36], 0.03, beardMat, 5);
  const leather = M.matte(0x4a2a14, { shininess: 30 });
  const brassy = M.gloss(0xd8a83a, { specular: 0xffe0a0 });
  const sashR = 0.37;
  put(d, new THREE.TorusGeometry(sashR, 0.035, 4, 20), leather, [0, 0.45, 0], [Math.PI / 2, 0.55, 0], [1, 1, 1]);
  for (let k = 0; k < 9; k++) {
    const t = 0.25 + (k / 8) * (Math.PI - 0.5);
    const p = new THREE.Vector3(Math.cos(t) * sashR, 0, Math.sin(t) * sashR + 0.02).applyEuler(new THREE.Euler(0, 0, 0.55));
    put(d, cyl(0.016, 0.016, 0.07, 6), brassy, [p.x, 0.45 + p.y, p.z]);
  }
  put(d, box(0.09, 0.2, 0.08), leather, [0.38, 0.22, 0.12], [0.2, 0, -0.15]);
  put(d, box(0.05, 0.1, 0.06), M.matte(0x7a4a22), [0.4, 0.36, 0.1], [0.5, 0, -0.15]);
  // Painted on the fins: WANTED, DEAD OR ALIVE.
  const wanted = decal('wanted-mad-dog', 128, 160, (g, w, h) => {
    g.fillStyle = '#e8d8a8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a3a1a';
    g.lineWidth = 4;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#2a1a0a';
    g.textAlign = 'center';
    g.font = '900 28px Georgia, serif';
    g.fillText('WANTED', w / 2, 34, w - 16);
    // A dog's head in silhouette, ears up.
    g.beginPath();
    g.ellipse(64, 82, 22, 20, 0, 0, Math.PI * 2);
    g.moveTo(46, 72);
    g.lineTo(40, 44);
    g.lineTo(58, 64);
    g.moveTo(82, 72);
    g.lineTo(88, 44);
    g.lineTo(70, 64);
    g.moveTo(60, 92);
    g.lineTo(64, 112);
    g.lineTo(68, 92);
    g.fill();
    g.font = 'bold 15px Georgia, serif';
    g.fillText('MAD DOG MORGAN', w / 2, 132, w - 14);
    g.font = '11px Georgia, serif';
    g.fillText('DEAD OR ALIVE', w / 2, 148, w - 14);
  });
  for (const side of [-1, 1]) {
    const fin = new THREE.Group();
    fin.position.set(side * 0.58, 0.75, -1.05);
    fin.rotation.z = side * 0.25;
    sticker(fin, wanted, [side * 0.033, 0, 0], [0, side * (Math.PI / 2), 0], 0.44, 0.5);
    body.add(fin);
  }
  // The Southern Cross picked out on the bonnet; rivets round the rocket.
  for (const [x, z, sc] of [[0, 1.12, 1], [0, 0.76, 1.1], [-0.13, 0.96, 0.9], [0.11, 0.9, 0.85], [0.05, 0.82, 0.6]] as const) {
    put(body, new THREE.OctahedronGeometry(0.04 * sc), M.glow(0xffffff), [x, 0.6, z], [0, 0.4, 0], [1, 0.3, 1]);
  }
  for (const y of [0.45, -0.25]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      put(rocket, ball(0.014, 4, 3), M.matte(0x8a8a9a), [Math.cos(a) * 0.243, y, Math.sin(a) * 0.243]);
    }
  }
  d.add(head);
  body.add(d);
  bake(body, [head, radar]);
  bake(head);
  bake(radar);

  return {
    body,
    wheels: [
      { x: 0.74, z: 0.95, radius: 0.33, width: 0.28, front: true },
      { x: -0.74, z: 0.95, radius: 0.33, width: 0.28, front: true },
      { x: 0.78, z: -0.9, radius: 0.44, width: 0.38, front: false },
      { x: -0.78, z: -0.9, radius: 0.44, width: 0.38, front: false },
    ],
    // The rocket nozzle is the exhaust.
    exhausts: [new THREE.Vector3(0, 0.82, -1.6)],
    rearTrack: 0.78,
    rearZ: -1,
    spinners: [],
    shadow: [2.4, 3.4],
    head,
    sweepers: [radar],
  };
}

// ---- Octo Organist: octopus at the keys of a steam pipe-organ car --------------

export function octoOrganist(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.accent);
  const brassMat = brass();
  const skin = matte(0xffffff, { map: tex('octo', () => spotsTexture('#ff7aa8', '#ffc8dc', 30)), shininess: 60, specular: 0x553344 });
  const wood = matte(0x5a2a1a, { shininess: 50, specular: 0x442211 });

  // A carved organ cabinet on a low brass-trimmed chassis.
  put(body, box(1.3, 0.3, 2.5), paint, [0, 0.45, 0]);
  put(body, box(1.34, 0.06, 2.54), brassMat, [0, 0.62, 0]);
  put(body, box(1.0, 0.25, 0.5), paint, [0, 0.55, 1.25], [-0.15, 0, 0]);
  put(body, ring(0.2, 0.04, Math.PI), brassMat, [0, 0.5, 1.5], [0, 0, 0]);
  headlights(body, 0.38, 0.6, 1.5, 0.1, 0xfff0d0);
  put(body, box(1.2, 0.55, 0.9), wood, [0, 0.9, -0.75]);
  for (let k = 0; k < 4; k++) put(body, box(0.02, 0.4, 0.84), brassMat, [-0.6 + (k % 2) * 1.2, 0.9, -0.75]);
  // The pipes, tallest in the middle, flared mouths along the front.
  const pipeMat = chrome();
  for (let k = 0; k < 9; k++) {
    const x = -0.52 + k * 0.13;
    const h = 0.5 + (1 - Math.abs(k - 4) / 4) * 0.9;
    put(body, cyl(0.05, 0.05, h, 10), k % 2 ? brassMat : pipeMat, [x, 1.17 + h / 2, -0.95]);
    put(body, box(0.06, 0.04, 0.02), matte(0x111111), [x, 1.3, -0.9]);
    put(body, cone(0.05, 0.06, 10), k % 2 ? brassMat : pipeMat, [x, 1.17 + h + 0.03, -0.95], [Math.PI, 0, 0]);
  }
  for (let k = 0; k < 5; k++) put(body, cyl(0.04, 0.04, 0.4 + k * 0.08, 10), brassMat, [-0.4 + k * 0.2, 1.4 + k * 0.04, -1.15]);
  // The console: two manuals of keys and a row of stops.
  const keys = matte(0xffffff, { map: tex('keys', keysTexture) });
  const kMap = keys.map!.clone();
  kMap.needsUpdate = true;
  kMap.repeat.set(3, 1);
  keys.map = kMap;
  for (let k = 0; k < 2; k++) {
    put(body, box(0.95, 0.04, 0.18), keys, [0, 0.92 + k * 0.1, 0.35 - k * 0.12]);
    put(body, box(1.0, 0.1, 0.2), wood, [0, 0.87 + k * 0.1, 0.35 - k * 0.12]);
  }
  for (let k = 0; k < 8; k++) put(body, cyl(0.03, 0.03, 0.06, 10), matte([0xffffff, 0xd8302a, 0x2a2a2a, 0xffd23a][k % 4]), [-0.38 + k * 0.11, 1.2, 0.12], [Math.PI / 2, 0, 0]);
  put(body, box(1.0, 0.25, 0.04), wood, [0, 1.12, 0.1]);
  // Sheet music on a stand.
  put(body, box(0.4, 0.3, 0.01), matte(0xf4f0e0), [0, 1.42, 0.12], [-0.3, 0, 0]);
  for (let k = 0; k < 4; k++) put(body, box(0.34, 0.008, 0.012), matte(0x2a2a2a), [0, 1.33 + k * 0.05, 0.135], [-0.3, 0, 0]);

  // The octopus: a bulbous mantle, big eyes, a monocle and a little top hat, eight arms busy everywhere.
  const d = new THREE.Group();
  d.position.set(0, 0.7, -0.15);
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  put(head, ball(0.38, 18, 14), skin, [0, 0.2, -0.12], [-0.4, 0, 0], [1, 1.3, 1]);
  put(head, ball(0.3, 16, 12), skin, [0, -0.05, 0.05]);
  eyes(head, 0.02, 0.22, 0.15, 0.09, 0xffb030, false);
  put(head, ring(0.1, 0.012), brassMat, [0.15, 0.02, 0.32]);
  rod(head, [0.25, 0.0, 0.3], [0.3, -0.35, 0.2], 0.004, brassMat);
  put(head, cyl(0.15, 0.15, 0.02, 16), matte(0x1a1a1a), [-0.05, 0.6, -0.15], [-0.35, 0, 0.2]);
  put(head, cyl(0.1, 0.1, 0.22, 16), matte(0x1a1a1a), [-0.05, 0.71, -0.19], [-0.35, 0, 0.2]);
  put(head, cyl(0.105, 0.105, 0.04, 16), matte(r.color), [-0.05, 0.64, -0.17], [-0.35, 0, 0.2]);
  d.add(head);
  const M = new Mats();
  const sucker = M.matte(0xffd8e4, { shininess: 40 });
  const suckerIn = M.matte(0xc85a7a);
  // Slotted pupils, a heavy brow: up from the deep and not pleased about it.
  for (const side of [-1, 1]) {
    put(head, box(0.1, 0.028, 0.02), M.matte(0x050505), [side * 0.15, 0.02, 0.312]);
    put(head, ball(0.08, 10, 6), skin, [side * 0.15, 0.1, 0.24], [0, 0, side * 0.3], [1.3, 0.35, 0.8]);
  }
  put(head, ball(0.05, 8, 6), skin, [0, -0.17, 0.28], [0, 0, 0], [1.4, 0.7, 0.9]);
  // Arms: two on the manuals, two on the steering, two on the stops and pipes, two curling over the sides.
  const curl = (from: [number, number, number], ctrl: [number, number, number], to: [number, number, number], r0: number) => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...from), new THREE.Vector3(...ctrl), new THREE.Vector3(...to));
    const geo = new THREE.TubeGeometry(curve, 12, r0, 8, false);
    // Taper toward the tip.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / 9) / 12;
      curve.getPoint(t, c);
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.7).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    const m = new THREE.Mesh(geo, skin);
    d.add(m);
    put(d, ball(r0 * 0.4, 6, 4), skin, to);
    // Suckers in a row down the underside, shrinking to the tip.
    for (let k = 2; k < 12; k++) {
      const t = k / 12;
      curve.getPoint(t, c);
      const rr = r0 * (1 - t * 0.7);
      put(d, cyl(rr * 0.45, rr * 0.5, rr * 0.35, 6), sucker, [c.x, c.y - rr * 0.85, c.z]);
      put(d, cyl(rr * 0.22, rr * 0.22, rr * 0.36, 5), suckerIn, [c.x, c.y - rr * 0.88, c.z]);
    }
  };
  curl([-0.15, 0.4, 0.15], [-0.3, 0.3, 0.4], [-0.3, 0.32, 0.5], 0.06);
  curl([0.15, 0.4, 0.15], [0.3, 0.3, 0.4], [0.25, 0.42, 0.42], 0.06);
  curl([-0.2, 0.45, 0.05], [-0.45, 0.6, 0.6], [-0.2, 0.15, 0.95], 0.06);
  curl([0.2, 0.45, 0.05], [0.45, 0.6, 0.6], [0.2, 0.15, 0.95], 0.06);
  curl([-0.25, 0.5, -0.05], [-0.6, 0.9, 0.1], [-0.35, 0.52, 0.28], 0.05);
  curl([0.25, 0.5, -0.1], [0.5, 1.2, -0.5], [0.35, 1.7, -0.95], 0.05);
  // That arm has a sailor's cap: all that's left of him.
  put(d, cyl(0.1, 0.09, 0.07, 12), M.matte(0xf4f4f4), [0.35, 1.76, -0.95], [0.3, 0, 0.2]);
  put(d, cyl(0.105, 0.105, 0.025, 12), M.matte(0x1a2a5a), [0.35, 1.73, -0.95], [0.3, 0, 0.2]);
  put(d, cyl(0.09, 0.09, 0.012, 12), M.matte(0xf4f4f4), [0.36, 1.8, -0.96], [0.3, 0, 0.2]);
  curl([-0.3, 0.35, -0.1], [-0.9, 0.2, -0.2], [-0.75, -0.1, 0.3], 0.06);
  curl([0.3, 0.35, -0.1], [0.9, 0.2, -0.3], [0.75, -0.1, -0.6], 0.06);
  // A small steering wheel low in front of it.
  // A ship's wheel to steer by: a wooden rim, eight spokes out to the handles.
  const helm = new THREE.Group();
  helm.position.set(0, 0.15, 0.95);
  helm.rotation.x = -0.6;
  const teak = M.matte(0x8a4a22, { shininess: 50 });
  put(helm, new THREE.TorusGeometry(0.15, 0.022, 5, 18), teak, [0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    rod(helm, [0, 0, 0], [Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0], 0.012, teak);
    put(helm, ball(0.02, 6, 4), teak, [Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0]);
  }
  put(helm, cyl(0.04, 0.04, 0.04, 8), brassMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
  d.add(helm);
  body.add(d);

  // Up from the deep: barnacles on the chassis, weed draped off the cabinet, portholes, a life ring and an anchor,
  // and steam puffing from the pipes.
  const barnacle = M.matte(0xd8d0c0, { flatShading: true });
  const hole = M.matte(0x2a2420);
  for (const [x, y, z] of [[0.66, 0.4, 0.9], [0.66, 0.5, 0.75], [0.66, 0.36, -0.3], [-0.66, 0.42, 0.6], [-0.66, 0.38, -0.9], [-0.66, 0.5, -1.0], [0.61, 0.8, -0.9], [-0.61, 1.0, -0.6], [0.3, 0.48, -1.26], [-0.4, 0.4, -1.26]] as const) {
    const out: V3 = Math.abs(x) > 0.6 ? [Math.sign(x), 0, 0] : [0, 0, -1];
    const b = put(body, cyl(0.025, 0.045, 0.04, 6), barnacle, [x + out[0] * 0.02, y, z + out[2] * 0.02]);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...out));
    const h2 = put(body, cyl(0.014, 0.014, 0.042, 5), hole, [x + out[0] * 0.022, y, z + out[2] * 0.022]);
    h2.quaternion.copy(b.quaternion);
  }
  const weed = M.matte(0x2a7a3a, { side: THREE.DoubleSide });
  for (const [x, z, len] of [[0.6, -0.4, 0.4], [0.6, -1.0, 0.3], [-0.6, -0.8, 0.45], [-0.6, -0.35, 0.25]] as const) {
    const sx = Math.sign(x);
    tube(body, [[x - sx * 0.1, 1.18, z], [x + sx * 0.03, 1.15, z + 0.03], [x + sx * 0.05, 1.15 - len * 0.5, z - 0.03], [x + sx * 0.04, 1.15 - len, z + 0.02]], 0.022, weed, 0.008, 5);
  }
  for (const side of [-1, 1]) {
    for (const z of [0.55, -0.15]) {
      put(body, new THREE.TorusGeometry(0.075, 0.018, 4, 14), brassMat, [side * 0.655, 0.45, z], [0, Math.PI / 2, 0]);
      disc(body, [side * 0.652, 0.45, z], [side, 0, 0], 0.07, M.gloss(0x2a6a8a, { shininess: 140, specular: 0xffffff }), 12);
    }
  }
  for (let k = 0; k < 4; k++) put(body, new THREE.TorusGeometry(0.17, 0.05, 6, 8, Math.PI / 2), M.matte(k % 2 ? 0xf4f4f0 : 0xd8302a), [0, 0.92, -1.23], [0, Math.PI, (k * Math.PI) / 2]);
  for (let k = 0; k < 4; k++) rod(body, [Math.cos((k / 4) * Math.PI * 2 + 0.78) * 0.2, 0.92 + Math.sin((k / 4) * Math.PI * 2 + 0.78) * 0.2, -1.25], [Math.cos((k / 4) * Math.PI * 2 + 0.78) * 0.15, 0.92 + Math.sin((k / 4) * Math.PI * 2 + 0.78) * 0.15, -1.25], 0.008, M.matte(0xd8c8a0));
  const iron = M.matte(0x3a3a40, { shininess: 50 });
  const anchor = new THREE.Group();
  anchor.position.set(-0.635, 0.95, -0.75);
  anchor.rotation.y = -Math.PI / 2;
  put(anchor, box(0.04, 0.34, 0.03), iron, [0, 0, 0]);
  put(anchor, new THREE.TorusGeometry(0.04, 0.012, 4, 10), iron, [0, 0.2, 0]);
  put(anchor, box(0.18, 0.03, 0.03), iron, [0, 0.12, 0]);
  put(anchor, new THREE.TorusGeometry(0.14, 0.02, 4, 12, Math.PI), iron, [0, -0.04, 0], [0, 0, Math.PI]);
  for (const side of [-1, 1]) put(anchor, cone(0.035, 0.08, 4), iron, [side * 0.14, -0.02, 0], [0, 0, side * -0.4]);
  body.add(anchor);
  const steam = M.haze(0xf4f4f8, 0.45);
  for (const k of [2, 4, 6]) {
    const h = 0.5 + (1 - Math.abs(k - 4) / 4) * 0.9;
    for (let j = 0; j < 3; j++) put(body, ball(0.05 + j * 0.03, 8, 6), steam, [-0.52 + k * 0.13 + j * 0.02, 1.17 + h + 0.12 + j * 0.09, -0.95 - j * 0.07]);
  }
  rivets(body, brassMat, [-0.62, 0.62, 1.2], [-0.62, 0.62, -1.2], 10, 0.016);
  rivets(body, brassMat, [0.62, 0.62, 1.2], [0.62, 0.62, -1.2], 10, 0.016);
  const exhausts = pipes(body, 0.4, 0.5, -1.3, 0.1);
  bake(body, [head]);
  bake(head);

  const spokeWheel = brassMat;
  return {
    body,
    wheels: [
      { x: 0.72, z: 0.95, radius: 0.3, width: 0.2, front: true, material: rubberMat() },
      { x: -0.72, z: 0.95, radius: 0.3, width: 0.2, front: true, material: rubberMat() },
      { x: 0.82, z: -0.8, radius: 0.52, width: 0.28, front: false, material: spokeWheel },
      { x: -0.82, z: -0.8, radius: 0.52, width: 0.28, front: false, material: spokeWheel },
    ],
    exhausts,
    rearTrack: 0.82,
    rearZ: -0.85,
    spinners: [],
    shadow: [2.4, 3.2],
    head,
  };
}

// ---- Mantis Shredder: praying mantis guitarist inside a monowheel --------------

export function mantisShredder(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const M = new Mats();
  const shell = gloss(r.color, { shininess: 110 });
  const pink = gloss(r.accent);
  const steel = chrome();
  const R = 1.05;

  // The frame hangs from the hub inside the hoop: a cradle seat, an engine below, a fin above.
  put(body, box(0.5, 0.18, 0.9), matte(0x1a1a1a), [0, 0.38, 0]);
  put(body, box(0.42, 0.3, 0.5), steel, [0, 0.42, -0.1]);
  for (let k = 0; k < 4; k++) put(body, box(0.46, 0.02, 0.4), matte(0x555555), [0, 0.5 + k * 0.05, -0.1]);
  for (const side of [-1, 1]) {
    rod(body, [side * 0.22, 0.4, 0.4], [side * 0.2, R, 0.3], 0.03, steel);
    rod(body, [side * 0.22, 0.4, -0.4], [side * 0.2, R, -0.3], 0.03, steel);
    // Inner rollers riding the hoop.
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 0.2, 0.55], [0, 0, Math.PI / 2]);
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 0.2, -0.55], [0, 0, Math.PI / 2]);
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 2 * R - 0.2, 0], [0, 0, Math.PI / 2]);
  }
  rod(body, [0, 1.2, -0.3], [0, 2 * R - 0.22, 0], 0.04, steel);
  put(body, box(0.04, 0.5, 0.6), pink, [0, 1.75, -0.35], [0.5, 0, 0]);
  put(body, box(0.6, 0.04, 0.04), steel, [0, 1.0, 0.55]);
  for (const side of [-1, 1]) put(body, cyl(0.035, 0.035, 0.14, 8), matte(0x111111), [side * 0.3, 1.0, 0.55], [0, 0, Math.PI / 2]);
  headlights(body, 0.12, 0.6, 0.5, 0.06, 0xd8ff9a);

  // The mantis: long thorax, raptor arms on the bars, a triangle head with huge eyes, wings folded back.
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.15);
  put(d, cyl(0.12, 0.16, 0.7, 10), shell, [0, 0.4, 0.05], [0.4, 0, 0]);
  put(d, ball(0.2, 12, 10), shell, [0, 0.05, -0.15], [0, 0, 0], [1, 0.8, 1.6]);
  for (let k = 0; k < 3; k++) put(d, ring(0.17 - k * 0.02, 0.012), matte(0x5a8a1a), [0, 0.05, -0.3 - k * 0.12], [0, 0, 0]);
  for (const side of [-1, 1]) {
    // Folded wings over the abdomen.
    put(d, ball(0.25, 10, 6), new THREE.MeshPhongMaterial({ color: 0xd8ff9a, transparent: true, opacity: 0.55, shininess: 100, side: THREE.DoubleSide }), [side * 0.08, 0.2, -0.3], [0.3, side * 0.2, 0], [0.4, 0.06, 1.6]);
    // Raptor forelegs: upper arm, spiked forearm, hook on the grip.
    arm(d, [side * 0.12, 0.7, 0.2], [side * 0.3, 0.45, 0.68], 0.04, shell, pink);
    for (let k = 0; k < 3; k++) put(d, cone(0.012, 0.07, 4), pink, [side * (0.22 + k * 0.03), 0.6 - k * 0.03, 0.35 + k * 0.08], [0.8, 0, 0]);
    // Walking legs folded against the frame.
    rod(d, [side * 0.12, 0.2, 0], [side * 0.28, -0.05, 0.25], 0.02, shell);
    rod(d, [side * 0.12, 0.15, -0.1], [side * 0.28, -0.1, -0.35], 0.02, shell);
  }
  // A guitar on its back, headstock up.
  const guitar = new THREE.Group();
  guitar.position.set(0, 0.55, -0.3);
  guitar.rotation.set(-0.3, 0, 0.5);
  put(guitar, new THREE.CylinderGeometry(0.22, 0.22, 0.06, 3), pink, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 1.3]);
  put(guitar, box(0.05, 0.6, 0.03), matte(0x2a1a10), [0, 0.42, 0]);
  put(guitar, box(0.1, 0.12, 0.03), matte(0x111111), [0, 0.76, 0], [0, 0, 0.3]);
  // Strings, two pickups, a bridge and the tuners on the headstock.
  for (let k = 0; k < 4; k++) put(guitar, box(0.004, 0.86, 0.004), steel, [-0.015 + k * 0.01, 0.3, 0.03]);
  for (const y of [-0.04, 0.06]) put(guitar, box(0.09, 0.03, 0.02), M.matte(0x111111), [0, y, 0.035]);
  put(guitar, box(0.08, 0.02, 0.02), steel, [0, -0.12, 0.035]);
  for (let k = 0; k < 6; k++) put(guitar, cyl(0.008, 0.008, 0.04, 5), steel, [(k % 2 ? 1 : -1) * 0.06, 0.72 + Math.floor(k / 2) * 0.035, 0], [0, 0, Math.PI / 2]);
  d.add(guitar);
  // Wing veins down the folded wings.
  for (const side of [-1, 1]) for (let k = -1; k <= 1; k++) rod(d, [side * (0.08 + k * 0.03), 0.23, 0.05], [side * (0.08 + k * 0.05), 0.12, -0.68], 0.004, M.matte(0x5a8a1a));
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.22);
  put(head, new THREE.ConeGeometry(0.17, 0.32, 3), shell, [0, -0.02, 0.05], [Math.PI, 0, 0], [1.3, 1, 0.7]);
  for (const side of [-1, 1]) {
    put(head, ball(0.1, 14, 10), new THREE.MeshPhongMaterial({ color: 0x9ad83a, emissive: 0x2a5a0a, shininess: 140, specular: 0xffffff }), [side * 0.15, 0.06, 0.04], [0, 0, 0], [0.9, 1.1, 0.9]);
    put(head, ball(0.025, 6, 4), matte(0x0a0a0a), [side * 0.17, 0.07, 0.13]);
  }
  // Antennae that bob with the beat.
  const antennae = [-1, 1].map((side) => {
    const { pivot, inner } = swinger(head, [side * 0.04, 0.12, 0.08], 'x', -0.5);
    tube(inner, [[0, 0, 0], [side * 0.08, 0.2, 0.08], [side * 0.18, 0.42, 0.2], [side * 0.24, 0.5, 0.32]], 0.009, shell, 0.004, 4);
    return pivot;
  });
  // Facets on the eyes, a pale bar over the brow.
  for (const side of [-1, 1]) studs(head, M.gloss(0xb8f05a, { emissive: 0x2a5a0a, shininess: 140, specular: 0xffffff }), [side * 0.15, 0.06, 0.04], [0.09, 0.11, 0.09], 22, 0.018, (x) => x * side > -0.2, 0.4, [5, 3]);
  // Mandibles and a pink bandana.
  for (const side of [-1, 1]) put(head, cone(0.02, 0.07, 4), matte(0x3a5a1a), [side * 0.03, -0.18, 0.08], [0.3, 0, side * 0.5]);
  put(head, cyl(0.16, 0.16, 0.05, 12), pink, [0, 0.13, 0.0], [0.2, 0, 0]);
  put(head, cone(0.05, 0.16, 4), pink, [0.12, 0.13, -0.15], [-2.2, 0, 0.5]);
  d.add(head);
  body.add(d);

  // The hoop's guard is a fretboard: rosewood over the top of the wheel, nickel frets, pearl dots, cream binding.
  const rosewood = M.matte(0x3a1e12, { shininess: 40 });
  const fretMat = M.gloss(0xd8dee8, { shininess: 140, specular: 0xffffff });
  const pearl = M.gloss(0xf4f0ff, { shininess: 160, specular: 0xffffff, emissive: 0x222233 });
  const GR = R + 0.07;
  const N = 18;
  const A = 0.95;
  for (let k = 0; k < N; k++) {
    const a = -A + ((k + 0.5) / N) * A * 2;
    const len = ((A * 2) / N) * GR + 0.01;
    put(body, box(0.26, 0.03, len), rosewood, [0, R + Math.cos(a) * GR, Math.sin(a) * GR], [a, 0, 0]);
    for (const side of [-1, 1]) put(body, box(0.012, 0.035, len), M.matte(0xf0e4c8), [side * 0.135, R + Math.cos(a) * GR, Math.sin(a) * GR], [a, 0, 0]);
    const f = -A + (k / N) * A * 2;
    put(body, box(0.27, 0.014, 0.012), fretMat, [0, R + Math.cos(f) * (GR + 0.017), Math.sin(f) * (GR + 0.017)], [f, 0, 0]);
    if ([3, 5, 7, 9, 12, 15].includes(k)) {
      for (const x of k === 12 ? [-0.06, 0.06] : [0]) put(body, cyl(0.022, 0.022, 0.01, 8), pearl, [x, R + Math.cos(a) * (GR + 0.016), Math.sin(a) * (GR + 0.016)], [a, 0, 0]);
    }
  }
  for (const side of [-1, 1]) rod(body, [0, 2 * R - 0.22, 0], [0, R + Math.cos(side * 0.5) * GR - 0.02, Math.sin(side * 0.5) * GR], 0.02, steel);
  // Polygondwanaland canopy: faceted leaves caught in the frame, a vine trailing off the fin.
  const leaf = M.matte(0x3aa04a, { flatShading: true, side: THREE.DoubleSide });
  const leafDark = M.matte(0x1f6a3a, { flatShading: true, side: THREE.DoubleSide });
  for (const [x, y, z, a, k] of [[0.2, 0.75, 0.38, 0.4, 0], [-0.21, 0.7, -0.4, -0.6, 1], [0.05, 1.95, -0.62, 1.2, 0], [-0.02, 1.55, -0.38, 0.2, 1], [0.24, 0.35, -0.48, 2.2, 0]] as const) {
    put(body, new THREE.OctahedronGeometry(0.12, 0), k ? leafDark : leaf, [x, y, z], [a, a * 0.7, 0.3], [0.9, 0.08, 1.6]);
  }
  tube(body, [[0, 1.98, -0.55], [0.05, 1.75, -0.7], [-0.04, 1.5, -0.68], [0.03, 1.3, -0.74]], 0.012, leafDark, 0.008, 4);
  for (const y of [1.78, 1.5]) put(body, new THREE.OctahedronGeometry(0.06, 0), leaf, [0.04, y, -0.7], [0.3, 0.5, 0], [0.8, 0.1, 1.5]);
  bake(body, [head]);
  bake(head, antennae);

  return {
    body,
    wheels: [{ x: 0, z: 0, radius: R, width: 0.24, front: false, ring: true, material: matte(0x1a1a1a, { shininess: 40 }) }],
    exhausts: [-0.12, 0.12].map((x) => new THREE.Vector3(x, 0.45, -0.6)),
    rearTrack: 0.15,
    rearZ: 0,
    spinners: [],
    shadow: [1.4, 2.6],
    head,
    flappers: antennae,
  };
}
