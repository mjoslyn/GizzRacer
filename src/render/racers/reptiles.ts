import * as THREE from 'three';
import type { RacerDef } from '../../physics/racers';
import { arm, ball, box, brows, chrome, cone, cyl, eyes, glow, glowSprite, headlights, matte, pipes, put, ring, rod, sideDecal, steeringWheel, tex, UP, type KartModel } from '../racerModels';
import { dragonHideTexture, flameDecalTexture, scaleTexture } from '../textures';
import { bake, candle, css, decal, Mats, spike, sticker, studs, swinger, tube, type V3 } from './kit';

// ---- Lizard Wizard: a robed reptile mage in a hot rod from the castle on the misty mountain ----

/** The castle on the misty mountain, for the wing's end plates. */
function castleTexture(accent: number): THREE.CanvasTexture {
  return decal(`castle-${accent}`, 128, 96, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2a1440');
    sky.addColorStop(1, css(accent));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff2a8';
    for (const [x, y] of [[14, 12], [40, 8], [100, 16], [116, 30], [70, 6]]) g.fillRect(x, y, 2, 2);
    // The mountain, the castle on its peak, mist across its foot.
    g.fillStyle = '#4a3a5a';
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(46, 40);
    g.lineTo(64, 30);
    g.lineTo(84, 44);
    g.lineTo(w, h);
    g.fill();
    g.fillStyle = '#1a0e24';
    g.fillRect(52, 14, 24, 18);
    for (const x of [48, 72]) {
      g.fillRect(x, 6, 8, 26);
      g.beginPath();
      g.moveTo(x - 2, 6);
      g.lineTo(x + 4, -4);
      g.lineTo(x + 10, 6);
      g.fill();
    }
    g.fillStyle = '#ffd23a';
    g.fillRect(62, 22, 4, 6);
    g.fillStyle = 'rgba(240,236,255,0.55)';
    for (let k = 0; k < 4; k++) g.fillRect(0, 62 + k * 8, w, 4 + (k % 2) * 2);
    g.strokeStyle = '#ffe14d';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  });
}

/** A number plate: black with a chrome edge and white letters. */
function plateTexture(text: string, bg = '#16101e', fg = '#f4f0e0'): THREE.CanvasTexture {
  return decal(`plate-${text}-${bg}`, 128, 48, (g, w, h) => {
    g.fillStyle = '#c8ccd4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = bg;
    g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg;
    g.font = '900 30px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1, w - 14);
  });
}

export function lizardWarlock(r: RacerDef): KartModel {
  const M = new Mats();
  const body = new THREE.Group();
  const paint = M.gloss(r.color);
  const trim = M.gloss(r.accent);
  const skin = M.matte(0xffffff, { map: tex('lizard', () => scaleTexture('#7fd36a', '#2c6a2a')) });
  const scaleDark = M.matte(0x2e6e2c, { shininess: 40, specular: 0x224422 });
  const belly = M.matte(0xe8e0a0);
  const engine = chrome();
  const gold = M.gloss(0xffe14d, { specular: 0xffe0a0 });
  const black = M.matte(0x161616);
  const leather = M.matte(0x5a3418, { shininess: 30 });
  const wood = M.matte(0x5a3a1e);
  const red = M.matte(0xd0303a);

  // Hot rod tub, raked nose, rear wing.
  put(body, box(1.25, 0.3, 2.5), paint, [0, 0.42, -0.05]);
  put(body, box(0.9, 0.22, 0.9), paint, [0, 0.5, 1.2], [-0.12, 0, 0]);
  put(body, box(1.3, 0.06, 0.12), trim, [0, 0.58, -0.6]);
  put(body, box(0.85, 0.5, 0.22), M.matte(0x2a1a30), [0, 0.8, -0.65]);
  // Tuck-and-roll on the seat back.
  for (let k = 0; k < 5; k++) put(body, box(0.13, 0.44, 0.05), M.matte(0x3a2444), [-0.32 + k * 0.16, 0.82, -0.53]);
  sideDecal(body, tex('flames', () => flameDecalTexture()), 0.63, 0.44, 0.1, 1.9, 0.42);
  for (const side of [-1, 1]) put(body, box(0.06, 0.45, 0.06), engine, [side * 0.5, 0.8, -1.2]);
  put(body, box(1.5, 0.05, 0.4), trim, [0, 1.05, -1.25], [0.15, 0, 0]);
  for (const side of [-1, 1]) {
    put(body, box(0.04, 0.3, 0.45), trim, [side * 0.75, 1.0, -1.25]);
    // The castle on the misty mountain on the wing's end plates.
    sticker(body, castleTexture(r.accent), [side * 0.773, 1.0, -1.25], [0, side * (Math.PI / 2), 0], 0.42, 0.28);
  }
  // Rivets along the tub's rails, tail lights, a nerf bar and the plate on the back.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) put(body, ball(0.018, 6, 4), engine, [side * 0.6, 0.575, -1.2 + k * 0.22]);
    put(body, box(0.16, 0.07, 0.03), M.glow(0xff2a1a), [side * 0.47, 0.47, -1.31]);
    put(body, box(0.2, 0.1, 0.02), engine, [side * 0.47, 0.47, -1.3]);
  }
  rod(body, [-0.58, 0.32, -1.36], [0.58, 0.32, -1.36], 0.025, engine);
  for (const side of [-1, 1]) rod(body, [side * 0.45, 0.32, -1.36], [side * 0.45, 0.36, -1.28], 0.02, engine);
  sticker(body, plateTexture('LZRD'), [0, 0.42, -1.312], [0, Math.PI, 0], 0.3, 0.11);
  // Chrome engine on the nose: block, blower with six velocity stacks, headers down both sides.
  put(body, box(0.6, 0.35, 0.6), engine, [0, 0.75, 0.95]);
  put(body, box(0.45, 0.18, 0.4), trim, [0, 1.0, 0.95]);
  for (let k = 0; k < 5; k++) put(body, box(0.47, 0.012, 0.42), black, [0, 0.93 + k * 0.035, 0.95]);
  for (const x of [-0.12, 0, 0.12]) {
    for (const z of [0.86, 1.04]) {
      put(body, cyl(0.045, 0.03, 0.14, 8), engine, [x, 1.16, z]);
      put(body, cyl(0.032, 0.032, 0.012, 8), black, [x, 1.228, z]);
    }
  }
  for (let k = 0; k < 4; k++) put(body, box(0.62, 0.02, 0.02), M.matte(0x666666), [0, 0.65 + k * 0.07, 1.26]);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) rod(body, [side * 0.3, 0.72, 0.8 + k * 0.15], [side * 0.62, 0.45, 0.6 + k * 0.15], 0.04, engine);
    rod(body, [side * 0.62, 0.42, 0.85], [side * 0.62, 0.42, -0.9], 0.06, engine);
    put(body, cyl(0.06, 0.08, 0.5), engine, [side * 0.38, 0.95, 0.75], [0.4, 0, side * 0.3]);
    // Valve covers with their fins.
    for (let k = 0; k < 3; k++) put(body, box(0.04, 0.03, 0.5), black, [side * (0.2 + k * 0.03), 0.94, 0.95]);
  }
  // The blower's pulley on the front, spinning with the revs, its belt down into the block.
  const pulley = new THREE.Group();
  pulley.position.set(0, 0.98, 1.18);
  put(pulley, cyl(0.085, 0.085, 0.04, 12), engine, [0, 0, 0], [Math.PI / 2, 0, 0]);
  put(pulley, box(0.16, 0.025, 0.05), black, [0, 0, 0.01]);
  put(pulley, box(0.025, 0.16, 0.05), black, [0, 0, 0.01]);
  body.add(pulley);
  for (const side of [-1, 1]) put(body, box(0.025, 0.28, 0.02), black, [side * 0.075, 0.85, 1.19]);
  // Grille shell between the headlights; a dropped axle and a leaf spring under the nose, shocks to the hubs.
  put(body, box(0.5, 0.28, 0.04), engine, [0, 0.5, 1.655]);
  put(body, box(0.42, 0.2, 0.03), black, [0, 0.5, 1.67]);
  for (let k = 0; k < 6; k++) put(body, box(0.018, 0.2, 0.02), engine, [-0.175 + k * 0.07, 0.5, 1.68]);
  put(body, box(1.36, 0.05, 0.07), engine, [0, 0.32, 0.95]);
  for (let k = 0; k < 3; k++) put(body, box(0.9 - k * 0.18, 0.024, 0.1), black, [0, 0.37 + k * 0.026, 0.95]);
  for (const side of [-1, 1]) rod(body, [side * 0.42, 0.56, 0.8], [side * 0.64, 0.33, 0.95], 0.024, engine);
  headlights(body, 0.36, 0.52, 1.66);

  // The wizard: scaled snout, frill, robe with flared sleeves and a starry hat, staff behind, a tail over the back.
  const d = new THREE.Group();
  d.position.set(0, 0.6, -0.35);
  put(d, cyl(0.32, 0.42, 0.7), trim, [0, 0.45, 0]);
  put(d, box(0.22, 0.5, 0.04), belly, [0, 0.45, 0.33]);
  for (let k = 0; k < 5; k++) put(d, box(0.2, 0.012, 0.045), M.matte(0xc8c080), [0, 0.25 + k * 0.1, 0.335]);
  put(d, ring(0.34, 0.03), gold, [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  put(d, new THREE.OctahedronGeometry(0.07), M.glow(0xc04bff), [0, 0.78, 0.33]);
  // A cowl folded round the neck, a leather belt with a pouch and a potion.
  put(d, new THREE.TorusGeometry(0.25, 0.085, 6, 16), trim, [0, 0.8, -0.02], [Math.PI / 2, 0, 0], [1, 0.9, 0.75]);
  put(d, cyl(0.372, 0.385, 0.07, 16), leather, [0, 0.32, 0]);
  put(d, box(0.1, 0.08, 0.03), gold, [0, 0.32, 0.385]);
  put(d, box(0.14, 0.12, 0.08), leather, [-0.3, 0.24, 0.24], [0, -0.6, 0]);
  put(d, cyl(0.035, 0.045, 0.12, 8), M.gloss(0x5aff8a, { emissive: 0x1a8a3a, transparent: true, opacity: 0.85 }), [0.33, 0.24, 0.22]);
  put(d, cyl(0.02, 0.02, 0.04, 6), wood, [0.33, 0.32, 0.22]);
  // Stars and a crescent moon stitched on the robe's back, for the chase camera.
  put(d, new THREE.TorusGeometry(0.11, 0.025, 4, 14, Math.PI * 1.2), gold, [0.02, 0.58, -0.38], [0, Math.PI, 0.9]);
  for (const [x, y] of [[-0.16, 0.42], [0.18, 0.32], [-0.08, 0.72], [0.2, 0.68]] as const) {
    put(d, new THREE.OctahedronGeometry(0.035), gold, [x, y, -Math.sqrt(Math.max(0, 0.36 ** 2 - x * x)) - 0.02]);
  }
  for (const [x, y] of [[-0.2, 0.55], [0.22, 0.48], [0.12, 0.2]] as const) put(d, new THREE.OctahedronGeometry(0.03), gold, [x, y, 0.33]);
  for (const [x, z, rx] of [[-0.25, 0.25, 0.8], [0.25, 0.25, 0.8]] as const) put(d, cyl(0.06, 0.12, 0.25, 8), skin, [x, 0.02, z], [rx, 0, 0]);
  const grips = steeringWheel(d, 0.6, 0.62, 0.2);
  for (const [k, side] of [-1, 1].entries()) {
    arm(d, [side * 0.33, 0.7, 0.05], grips[k], 0.07, trim, skin);
    put(d, cone(0.12, 0.2, 10), trim, [side * 0.27, 0.52, 0.42], [-Math.PI / 2 - 0.3, 0, 0]);
    put(d, new THREE.TorusGeometry(0.1, 0.02, 4, 12), gold, [side * 0.28, 0.555, 0.5], [0.3, 0, 0]);
    // Clawed fingers round the wheel rim.
    for (let f = 0; f < 3; f++) spike(d, [grips[k][0], grips[k][1] + 0.04, grips[k][2] + 0.02], [grips[k][0] + side * (f - 1) * 0.04, grips[k][1] + 0.02, grips[k][2] + 0.11], 0.016, M.matte(0xf0e8c8));
  }
  // The staff stowed upright behind the seat, a crystal held in its claw.
  tube(d, [[-0.46, 0.05, -0.3], [-0.5, 0.6, -0.36], [-0.47, 1.1, -0.4], [-0.52, 1.42, -0.44]], 0.03, wood, 0.022, 6);
  for (const y of [0.4, 0.85]) put(d, ball(0.04, 6, 4), wood, [-0.49, y, -0.37]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    spike(d, [-0.52, 1.42, -0.44], [-0.52 + Math.cos(a) * 0.08, 1.56, -0.44 + Math.sin(a) * 0.08], 0.015, gold);
  }
  put(d, new THREE.OctahedronGeometry(0.075), M.gloss(0xc04bff, { emissive: 0x6a1aa8 }), [-0.52, 1.55, -0.44], [0, 0.4, 0], [0.8, 1.4, 0.8]);
  glowSprite(d, [-0.52, 1.55, -0.44], 0.5, 0xc04bff);
  // The tail hangs over the back of the seat and lashes a little, spines along it.
  const { pivot: tail, inner: tailIn } = swinger(d, [0, 0.15, -0.3], 'y', 0.7);
  for (let k = 0; k < 7; k++) {
    const at: V3 = [Math.sin(k * 0.7) * 0.15, 0.02 * k, -0.18 * k];
    put(tailIn, ball(0.13 - k * 0.015, 10, 8), skin, at);
    spike(tailIn, [at[0], at[1] + 0.1 - k * 0.012, at[2]], [at[0], at[1] + 0.2 - k * 0.02, at[2] - 0.06], 0.03 - k * 0.003, trim);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.05);
  put(head, ball(0.3), skin, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
  put(head, ball(0.22), skin, [0, -0.06, 0.3], [0, 0, 0], [0.9, 0.6, 1.3]);
  // Raised scales over the crown and down the snout.
  studs(head, scaleDark, [0, 0, 0], [0.3, 0.27, 0.3], 60, 0.024, (_x, y, z) => y > 0.3 && z < 0.5, 0.4);
  studs(head, scaleDark, [0, -0.06, 0.3], [0.2, 0.132, 0.286], 30, 0.018, (_x, y, z) => y > 0.6 && z > 0.2 && z < 0.8, 0.4);
  put(head, box(0.3, 0.02, 0.25), M.matte(0x2a0a0a), [0, -0.14, 0.38]);
  // A sly grin: the mouth turns up at the corners, a row of little teeth.
  for (const side of [-1, 1]) {
    put(head, new THREE.TorusGeometry(0.07, 0.014, 4, 10, Math.PI * 0.6), M.matte(0x2a0a0a), [side * 0.15, -0.09, 0.3], [0, side * 1.2, side > 0 ? Math.PI * 1.15 : -Math.PI * 0.15]);
    for (let k = 0; k < 4; k++) spike(head, [side * (0.13 - k * 0.025), -0.125, 0.33 + k * 0.05], [side * (0.13 - k * 0.025), -0.16, 0.335 + k * 0.05], 0.011, M.matte(0xf8f4e0), 4);
    // Cheek spikes swept back.
    spike(head, [side * 0.25, -0.05, 0.08], [side * 0.37, -0.02, -0.06], 0.035, trim);
    spike(head, [side * 0.22, -0.12, 0.12], [side * 0.32, -0.15, 0.0], 0.025, trim);
  }
  for (const side of [-1, 1]) put(head, ball(0.02, 6, 4), M.matte(0x0a0a0a), [side * 0.06, -0.02, 0.58]);
  // Forked tongue tasting the wind.
  put(head, box(0.03, 0.01, 0.2), red, [0, -0.12, 0.6]);
  for (const side of [-1, 1]) put(head, box(0.015, 0.01, 0.09), red, [side * 0.025, -0.12, 0.73], [0, side * 0.6, 0]);
  eyes(head, 0.1, 0.2, 0.16, 0.08, 0xffd23a, true);
  // Heavy lids half down over the eyes, low on the inside: a knowing look.
  for (const side of [-1, 1]) put(head, new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), skin, [side * 0.16, 0.135, 0.2], [0.3, 0, side * -0.25]);
  brows(head, 0.19, 0.22, 0.15, 0.14, scaleDark, -0.3);
  // A dewlap under the jaw, striped in the robe's colour.
  put(head, new THREE.CircleGeometry(0.14, 10, Math.PI, Math.PI), M.matte(r.accent, { side: THREE.DoubleSide }), [0, -0.17, 0.18], [0, Math.PI / 2, 0], [1, 1.1, 1]);
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 1.1;
    put(head, cone(0.06, 0.32, 6), M.matte(r.accent), [Math.sin(a) * 0.32, Math.cos(a) * 0.2 - 0.05, -0.12], [-0.6, 0, -a]);
  }
  put(head, cyl(0.42, 0.42, 0.04, 20), trim, [0, 0.24, 0]);
  put(head, new THREE.TorusGeometry(0.42, 0.022, 4, 24), gold, [0, 0.24, 0], [Math.PI / 2, 0, 0]);
  put(head, cyl(0.25, 0.27, 0.08, 16), gold, [0, 0.3, -0.03]);
  put(head, box(0.11, 0.09, 0.03), M.matte(0x3a2410), [0, 0.3, 0.245]);
  put(head, box(0.06, 0.05, 0.035), gold, [0, 0.3, 0.25]);
  const hat = put(head, cone(0.26, 0.7, 16), trim, [0, 0.6, -0.05], [-0.15, 0, 0]);
  for (let k = 0; k < 4; k++) put(hat, new THREE.OctahedronGeometry(0.05), M.glow(0xffe14d), [Math.sin(k * 1.7) * 0.15, -0.2 + k * 0.1, 0.12 + (k % 2) * 0.03]);
  for (let k = 0; k < 3; k++) put(hat, new THREE.OctahedronGeometry(0.04), M.glow(0xffe14d), [Math.sin(k * 2.3) * 0.1, -0.18 + k * 0.12, -0.15]);
  put(hat, ring(0.06, 0.018, Math.PI * 1.3), M.glow(0xfff2a8), [0.08, -0.05, 0.2], [0, 0, 0.6]);
  put(hat, ball(0.05, 8, 6), M.glow(0xc04bff), [0, 0.36, 0]);
  d.add(head);
  body.add(d);

  const exhausts = pipes(body, 0.35, 0.55, -1.35);
  bake(body, [head, tail, pulley]);
  bake(head);
  bake(tail);
  return {
    body,
    wheels: [
      { x: 0.78, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: -0.78, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: 0.82, z: -0.85, radius: 0.46, width: 0.42, front: false },
      { x: -0.82, z: -0.85, radius: 0.46, width: 0.42, front: false },
    ],
    exhausts,
    rearTrack: 0.82,
    rearZ: -0.95,
    spinners: [pulley],
    shadow: [2.4, 3.3],
    head,
    flappers: [tail],
  };
}

// ---- Gila Rider: a beaded dragon-gila running on its four sprawled legs ---------

export function gilaRider(r: RacerDef): KartModel {
  const body = new THREE.Group();
  // After PetroDragonic Apocalypse: charcoal beads on the back, orange and gold on the throat and belly.
  const hide = matte(0xffffff, { map: tex('dragon-hide', dragonHideTexture), shininess: 30, specular: 0x332a22 });
  const char = matte(0x1a1718, { shininess: 40, specular: 0x332222 });
  const ember = glow(0xff6a1a);
  const claw = matte(0xd8c8a8);
  // It runs: low to the road, belly just clear, the legs reaching down to it.
  const gila = new THREE.Group();
  gila.position.y = 0.46;
  body.add(gila);

  // A long, heavy body: chest, belly, haunches, then a fat tail tapering to a blunt tip.
  put(gila, ball(0.42, 20, 14), hide, [0, 0, 0.05], [0, 0, 0], [1.05, 0.7, 1.75]);
  put(gila, ball(0.32, 16, 12), hide, [0, 0.03, 0.68], [0, 0, 0], [1, 0.78, 1.05]);
  put(gila, ball(0.34, 16, 12), hide, [0, -0.01, -0.58], [0, 0, 0], [1.08, 0.78, 1.1]);
  // The tail hangs off the haunches on its own pivot, so it can lash against the body's sway.
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0, -0.8);
  gila.add(tailRoot);
  const tail: [number, number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const at: [number, number, number] = [Math.sin(k * 0.55) * 0.07, 0.02 - k * 0.012, -0.08 - k * 0.16];
    put(tailRoot, ball(0.27 - k * 0.024, 14, 10), hide, at, [0, 0, 0], [1, 0.85, 1.3]);
    tail.push(at);
  }
  // A scalloped ridge of rounded spines down the neck, back and tail: dark plates with a warm rim.
  const spine = (parent: THREE.Object3D, at: [number, number, number], size: number) => {
    put(parent, cyl(size, size, 0.035, 12), char, at, [0, 0, Math.PI / 2], [1, 1, 0.7]);
    put(parent, cyl(size * 1.12, size * 1.12, 0.02, 12), matte(r.color, { emissive: 0x501404 }), [at[0], at[1] - size * 0.08, at[2]], [0, 0, Math.PI / 2], [1, 1, 0.7]);
  };
  // The ridge stops for the saddle over the shoulders.
  for (let k = 0; k < 7; k++) if (k !== 1) spine(gila, [0, 0.27 - Math.abs(k - 2) * 0.012, 0.6 - k * 0.2], 0.1 - k * 0.004);
  // Raised beads over the back and flanks, charcoal with orange blotches, and orange bands round the tail.
  const M = new Mats();
  const beadDark = M.matte(0x2a2426, { shininess: 50, specular: 0x443838 });
  const beadHot = M.matte(0xff7a2a, { shininess: 50, specular: 0x553322, emissive: 0x3a0e00 });
  studs(gila, (k) => ((k * 7) % 11 < 4 ? beadHot : beadDark), [0, 0, 0.05], [0.44, 0.29, 0.735], 150, 0.03, (_x, y) => y > -0.1, 0.6);
  studs(gila, (k) => ((k * 5) % 9 < 3 ? beadHot : beadDark), [0, 0.03, 0.68], [0.32, 0.25, 0.34], 50, 0.026, (_x, y, z) => y > -0.1 && z < 0.6, 0.6);
  for (const [k, at] of tail.entries()) {
    if (k % 2 === 1) put(tailRoot, new THREE.TorusGeometry((0.27 - k * 0.024) * 0.92, 0.035 - k * 0.002, 5, 14), beadHot, at, [0, 0, 0], [1, 0.85, 1]);
  }
  // The keeper's saddle over the shoulders, girthed under the chest, and on it the candle in its brass holder:
  // run it flat out before the candle falls.
  const leather = M.matte(0x7a2a18, { shininess: 40, specular: 0x331a10 });
  put(gila, ball(0.3, 14, 8), leather, [0, 0.24, 0.4], [0, 0, 0], [0.95, 0.22, 0.75]);
  put(gila, new THREE.TorusGeometry(0.31, 0.025, 4, 18, Math.PI * 1.1), M.matte(0x3a1a10), [0, 0.0, 0.4], [0, Math.PI / 2, -Math.PI * 0.05], [1, 1, 1.2]);
  put(gila, new THREE.TorusGeometry(0.3, 0.022, 4, 18), M.gloss(0xd8a83a), [0, 0.27, 0.4], [Math.PI / 2, 0, 0], [0.95, 0.75, 1]);
  const brassy = M.gloss(0xd8a83a, { specular: 0xffe0a0 });
  put(gila, cyl(0.1, 0.07, 0.035, 12), brassy, [0, 0.33, 0.42]);
  put(gila, cyl(0.03, 0.04, 0.05, 8), brassy, [0, 0.36, 0.42]);
  put(gila, new THREE.TorusGeometry(0.04, 0.012, 4, 10), brassy, [0.11, 0.34, 0.42], [0, 0, Math.PI / 2]);
  const flameAt = candle(gila, M, [0, 0.38, 0.42], 0.26, 0.042, 0xf4ecd8);
  flameAt.userData.side = 0.6;
  glowSprite(gila, [0, 0.72, 0.42], 0.6, 0xffb040);
  // Wax spattered down its back.
  for (const [x, z, s] of [[0.08, 0.28, 1], [-0.1, 0.2, 0.8], [0.04, 0.05, 0.7]] as const) put(gila, ball(0.03 * s, 6, 4), M.matte(0xf4ecd8), [x, 0.29 - z * 0.05, z], [0, 0, 0], [1.4, 0.4, 1.8]);
  for (const [k, at] of tail.entries()) if (k % 2 === 0) spine(tailRoot, [at[0], at[1] + 0.2 - k * 0.02, at[2]], 0.075 - k * 0.006);

  // Four stubby legs sprawled out to the sides, elbows high, feet planted on the road with pale hooked claws.
  // Each hangs from a pivot at its hip so it can swing forward and back.
  const legs: THREE.Object3D[] = [];
  const leg = (side: number, hipZ: number, phase: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, -0.06, hipZ);
    pivot.userData = { side, phase };
    const knee: [number, number, number] = [side * 0.34, 0.06, 0];
    const foot: [number, number, number] = [side * 0.42, -0.38, 0.06];
    rod(pivot, [0, 0, 0], knee, 0.1, hide, 0.08);
    put(pivot, ball(0.09, 10, 8), hide, knee);
    rod(pivot, knee, foot, 0.075, hide, 0.065);
    put(pivot, ball(0.1, 10, 8), hide, foot, [0, 0, 0], [1.25, 0.5, 1.4]);
    for (let k = -2; k <= 2; k++) {
      const c = put(pivot, cone(0.018, 0.09, 5), claw, [foot[0], foot[1] - 0.02, foot[2]]);
      const d = new THREE.Vector3(side * 0.3, 0, 1).normalize().applyAxisAngle(UP, k * 0.35).setY(-0.25).normalize();
      c.quaternion.setFromUnitVectors(UP, d);
      c.position.addScaledVector(d, 0.1);
    }
    gila.add(pivot);
    legs.push(pivot);
  };
  // A lizard's trot: the diagonal pairs move together.
  for (const side of [-1, 1]) {
    leg(side, 0.55, side < 0 ? 0 : Math.PI);
    leg(side, -0.52, side < 0 ? Math.PI : 0);
  }

  // The head: broad, heavy and blunt, the jaw hanging open on a furnace, huge glowing slit eyes.
  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.88);
  head.scale.setScalar(1.15);
  put(head, ball(0.34, 20, 14), hide, [0, 0.02, 0.15], [0, 0, 0], [1.15, 0.6, 1.1]);
  put(head, ball(0.3, 18, 12), hide, [0, -0.02, 0.45], [0, 0, 0], [1.12, 0.45, 1.05]);
  for (const side of [-1, 1]) put(head, ball(0.025, 6, 4), matte(0x050505), [side * 0.1, 0.1, 0.74]);
  // Upper teeth along the whole long gape, two fangs at the front.
  for (let k = 0; k < 7; k++) {
    const a = (k / 6) * Math.PI;
    const fang = k === 2 || k === 4;
    put(head, cone(fang ? 0.03 : 0.018, fang ? 0.13 : 0.06, 5), claw, [Math.cos(a) * 0.3, fang ? -0.18 : -0.15, 0.42 + Math.sin(a) * 0.3], [Math.PI, 0, 0]);
  }
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) put(head, cone(0.018, 0.06, 4), claw, [side * 0.33, -0.15, 0.36 - k * 0.1], [Math.PI, 0, 0]);
  // Fire in the throat, showing through the open mouth, and an ember breath at the front.
  put(head, ball(0.25, 16, 10), ember, [0, -0.17, 0.38], [0, 0, 0], [1.05, 0.22, 1.05]);
  glowSprite(head, [0, -0.17, 0.72], 0.5, 0xff6a1a);
  // The lower jaw, hinged far back and dropped open, its own teeth pointing up.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.05);
  jaw.rotation.x = 0.22;
  put(jaw, ball(0.28, 18, 12), hide, [0, -0.05, 0.32], [0, 0, 0], [1.08, 0.32, 1.12]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 6) * Math.PI;
    put(jaw, cone(0.018, 0.06, 4), claw, [Math.cos(a) * 0.27, 0.0, 0.33 + Math.sin(a) * 0.28]);
  }
  head.add(jaw);
  // The signature eyes: big, bulging up out of the skull, fiery, with a black vertical slit and a halo seen from behind.
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.22, 0.14, 0.3);
    eye.rotation.y = side * 0.45;
    put(eye, ball(0.135, 16, 12), char, [0, 0, -0.03], [0, 0, 0], [1.1, 1, 1]);
    put(eye, ball(0.12, 18, 14), glow(0xff3a0a), [0, 0, 0.01]);
    put(eye, ball(0.085, 16, 12), glow(0xffa020), [0, 0, 0.06], [0, 0, 0], [1, 1, 0.6]);
    put(eye, ball(0.045, 12, 8), glow(0xffe060), [0, 0, 0.1], [0, 0, 0], [1, 1.3, 0.4]);
    put(eye, box(0.026, 0.17, 0.02), matte(0x050505), [0, 0, 0.125]);
    // A heavy brow ridge low over each, angled down to the middle in a scowl.
    put(eye, ball(0.13, 10, 8), char, [-side * 0.01, 0.11, -0.01], [-0.35, 0, side * 0.4], [1.35, 0.42, 1.15]);
    glowSprite(eye, [0, 0, 0.12], 0.45, 0xff5a10);
    head.add(eye);
  }
  // The crest carries on from the neck over the back of the skull.
  for (let k = 0; k < 4; k++) spine(head, [0, 0.21 - k * 0.012, 0.22 - k * 0.12], 0.07 + k * 0.008);
  // A forked black tongue flicking out of the furnace.
  rod(head, [0, -0.17, 0.5], [0, -0.16, 0.8], 0.016, M.matte(0x1a1018), 0.012);
  for (const side of [-1, 1]) rod(head, [0, -0.16, 0.8], [side * 0.04, -0.15, 0.88], 0.01, M.matte(0x1a1018), 0.006);
  // Beads over the skull.
  studs(head, beadDark, [0, 0.02, 0.15], [0.39, 0.2, 0.37], 40, 0.026, (_x, y, z) => y > 0.4 && z < 0.4, 0.6);
  gila.add(head);

  bake(body, [gila]);
  bake(gila, [head, tailRoot, flameAt, ...legs]);
  bake(head);
  bake(tailRoot);
  for (const l of legs) bake(l);
  const tipAt = tail[tail.length - 1];
  return {
    body,
    wheels: [],
    // Fire out of the tail tip under boost.
    exhausts: [new THREE.Vector3(tipAt[0], tipAt[1] + 0.46, tipAt[2] - 0.95)],
    rearTrack: 0.55,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.4, 3.4],
    head,
    legs,
    sway: gila,
    tail: tailRoot,
    flappers: [flameAt],
  };
}

// ---- Gator: an alligator running on its four legs, headphones on ------

export function gatorDrummer(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const hide = matte(0xffffff, { map: tex('gator', () => scaleTexture('#6a9a3a', '#22401a')), shininess: 26, specular: 0x223318 });
  const belly = matte(0xe8e0a8);
  const scute = matte(0x2a4a1c, { shininess: 30 });
  const tooth = matte(0xf8f4e0);
  const claw = matte(0x2a2418);
  // It runs as the Gila does: low to the road, belly just clear, legs sprawled out to the sides.
  const gator = new THREE.Group();
  gator.position.y = 0.42;
  body.add(gator);

  // A long, flat, armoured body: shoulders, back, hips, a pale belly under it all.
  put(gator, ball(0.4, 20, 14), hide, [0, 0, 0.05], [0, 0, 0], [1.1, 0.6, 2]);
  put(gator, ball(0.3, 16, 12), hide, [0, 0.0, 0.7], [0, 0, 0], [1.05, 0.66, 1.1]);
  put(gator, ball(0.33, 16, 12), hide, [0, -0.02, -0.6], [0, 0, 0], [1.1, 0.66, 1.15]);
  put(gator, ball(0.36, 16, 12), belly, [0, -0.1, 0.05], [0, 0, 0], [1.02, 0.42, 2]);
  // Rows of bony scutes down the back.
  // (Not under the drum.)
  for (let k = 0; k < 8; k++) for (const x of [-0.16, 0, 0.16]) if (k < 1 || k > 3) put(gator, cone(0.05, 0.1, 4), scute, [x, 0.22 - Math.abs(x) * 0.25 - Math.abs(k - 3) * 0.008, 0.72 - k * 0.2]);
  // Two more rows of osteoderms either side of the crest, smaller toward the flanks.
  const M = new Mats();
  for (let k = 0; k < 9; k++) {
    for (const x of [-0.3, 0.3]) put(gator, cone(0.035, 0.07, 4), scute, [x, 0.15 - Math.abs(k - 4) * 0.012, 0.8 - k * 0.19], [0, 0, x > 0 ? -0.45 : 0.45]);
  }
  // The drummer's snare, strapped on over the shoulders: a sparkle shell, chrome hoops and lugs, a white head
  // with a stick resting on it.
  const drum = new THREE.Group();
  drum.position.set(0, 0.36, 0.32);
  const shell = M.gloss(0xc8202a, { specular: 0xffffff, shininess: 120 });
  const steel = chrome();
  put(drum, cyl(0.2, 0.2, 0.12, 14), shell, [0, 0, 0]);
  put(drum, cyl(0.195, 0.195, 0.005, 14), M.matte(0xf4f0e4), [0, 0.065, 0]);
  for (const y of [-0.06, 0.062]) put(drum, new THREE.TorusGeometry(0.2, 0.012, 4, 20), steel, [0, y, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    put(drum, box(0.025, 0.07, 0.025), steel, [Math.cos(a) * 0.205, 0, Math.sin(a) * 0.205], [0, -a, 0]);
  }
  put(drum, box(0.06, 0.04, 0.03), steel, [0.205, -0.03, 0], [0, 0, 0]);
  gator.add(drum);
  put(gator, new THREE.TorusGeometry(0.35, 0.02, 4, 20), M.matte(0x2a2a2a), [0, 0.02, 0.32], [0, Math.PI / 2, 0], [1, 0.75, 1.2]);
  const stickMat = M.matte(0xe8d0a0, { shininess: 40 });
  rod(gator, [-0.18, 0.44, 0.2], [0.24, 0.43, 0.42], 0.014, stickMat, 0.01);
  put(gator, ball(0.016, 6, 4), stickMat, [0.24, 0.43, 0.42]);
  // The long tail on its own pivot, flattened side to side, a double crest of scutes along it, lashing against the stride.
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, -0.02, -0.82);
  gator.add(tailRoot);
  const tail: [number, number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const at: [number, number, number] = [Math.sin(k * 0.5) * 0.05, -k * 0.012, -0.06 - k * 0.17];
    put(tailRoot, ball(0.25 - k * 0.021, 14, 10), hide, at, [0, 0, 0], [0.8, 0.85, 1.35]);
    for (const x of [-0.06, 0.06]) put(tailRoot, cone(0.04 - k * 0.002, 0.11 - k * 0.004, 4), scute, [at[0] + x * (1 - k / 12), at[1] + 0.2 - k * 0.018, at[2]]);
    tail.push(at);
  }

  // Four legs on pivots at the hips and shoulders, elbows out, webbed feet with dark claws.
  const legs: THREE.Object3D[] = [];
  const leg = (side: number, hipZ: number, phase: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32, -0.05, hipZ);
    pivot.userData = { side, phase };
    const knee: [number, number, number] = [side * 0.32, 0.04, 0];
    const foot: [number, number, number] = [side * 0.4, -0.34, 0.07];
    rod(pivot, [0, 0, 0], knee, 0.1, hide, 0.08);
    put(pivot, ball(0.09, 10, 8), hide, knee);
    rod(pivot, knee, foot, 0.075, hide, 0.06);
    put(pivot, ball(0.1, 10, 8), hide, foot, [0, 0, 0], [1.3, 0.45, 1.45]);
    for (let k = -2; k <= 2; k++) {
      const c = put(pivot, cone(0.016, 0.08, 5), claw, [foot[0], foot[1] - 0.02, foot[2]]);
      const d = new THREE.Vector3(side * 0.3, 0, 1).normalize().applyAxisAngle(UP, k * 0.32).setY(-0.25).normalize();
      c.quaternion.setFromUnitVectors(UP, d);
      c.position.addScaledVector(d, 0.1);
    }
    gator.add(pivot);
    legs.push(pivot);
  };
  // The diagonal pairs together: a crocodile's high walk, sped up to a trot.
  for (const side of [-1, 1]) {
    leg(side, 0.55, side < 0 ? 0 : Math.PI);
    leg(side, -0.5, side < 0 ? Math.PI : 0);
  }

  // The head: a long flat snout, a row of teeth showing down the jaw line, eyes and nostrils up top, headphones on.
  const head = new THREE.Group();
  head.position.set(0, 0.06, 0.95);
  put(head, ball(0.25, 18, 12), hide, [0, 0.02, 0.05], [0, 0, 0], [1.1, 0.68, 1]);
  put(head, box(0.34, 0.11, 0.62), hide, [0, 0.0, 0.48], [0, 0, 0]);
  put(head, ball(0.17, 14, 10), hide, [0, 0.0, 0.79], [0, 0, 0], [1, 0.38, 0.6]);
  put(head, box(0.3, 0.07, 0.6), belly, [0, -0.09, 0.45], [0.06, 0, 0]);
  for (let k = 0; k < 7; k++) for (const side of [-1, 1]) {
    put(head, cone(0.016, 0.05, 4), tooth, [side * 0.155, -0.065, 0.22 + k * 0.08], [Math.PI, 0, 0]);
    put(head, cone(0.014, 0.04, 4), tooth, [side * 0.14, -0.04, 0.26 + k * 0.08]);
  }
  for (const side of [-1, 1]) {
    put(head, ball(0.075, 10, 8), hide, [side * 0.11, 0.13, 0.12]);
    put(head, ball(0.055, 10, 8), glow(0xffd23a), [side * 0.11, 0.16, 0.16]);
    put(head, box(0.012, 0.06, 0.01), matte(0x050505), [side * 0.11, 0.16, 0.21]);
    put(head, ball(0.025, 6, 4), matte(0x1a2a10), [side * 0.05, 0.07, 0.82]);
  }
  // Headphones: the band over the crown, padded cups, a coiled lead down the neck.
  put(head, new THREE.TorusGeometry(0.25, 0.022, 5, 20, Math.PI), M.matte(0x1a1a1a), [0, 0.05, 0.02]);
  for (const side of [-1, 1]) {
    put(head, cyl(0.08, 0.08, 0.06, 14), M.gloss(r.color), [side * 0.25, 0.05, 0.02], [0, 0, Math.PI / 2]);
    put(head, new THREE.TorusGeometry(0.065, 0.022, 5, 12), M.matte(0x2a2a2a), [side * 0.215, 0.05, 0.02], [0, Math.PI / 2, 0]);
    put(head, cyl(0.04, 0.04, 0.065, 10), M.matte(0xf4f0e4), [side * 0.25, 0.05, 0.02], [0, 0, Math.PI / 2]);
    // Lids half down over the eyes: the Evil Death Roll look.
    put(head, new THREE.SphereGeometry(0.068, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), hide, [side * 0.11, 0.165, 0.15], [0.45, 0, side * -0.35]);
    // Nostril bumps and a row of osteoderms between the eyes.
    put(head, ball(0.035, 6, 4), hide, [side * 0.05, 0.06, 0.8], [0, 0, 0], [1, 0.7, 1]);
  }
  for (let k = 0; k < 4; k++) put(head, cone(0.025, 0.05, 4), scute, [0, 0.12 - k * 0.012, -0.02 - k * 0.07]);
  tube(head, [[0.25, 0.0, 0.0], [0.26, -0.12, -0.08], [0.22, -0.2, -0.2], [0.18, -0.25, -0.35]], 0.009, M.matte(0x1a1a1a));
  // The other stick clamped crossways in the teeth.
  rod(head, [-0.3, -0.06, 0.48], [0.3, -0.055, 0.52], 0.016, stickMat, 0.012);
  put(head, ball(0.018, 6, 4), stickMat, [0.3, -0.055, 0.52]);
  gator.add(head);

  bake(body, [gator]);
  bake(gator, [head, tailRoot, ...legs]);
  bake(head);
  bake(tailRoot);
  for (const l of legs) bake(l);

  const tipAt = tail[tail.length - 1];
  return {
    body,
    wheels: [],
    // Fire out of the tail tip under boost.
    exhausts: [new THREE.Vector3(tipAt[0], tipAt[1] + 0.4, tipAt[2] - 0.9)],
    rearTrack: 0.55,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.3, 3.6],
    head,
    legs,
    sway: gator,
    tail: tailRoot,
  };
}

// ---- Rattlesnake: off Flying Microtonal Banana, slithering down the road ----------
// A long diamondback in segments that a wave runs down from the head, its
// neck held up and the head cocked to strike, a forked tongue out, and a
// rattle at the tail shaking all the while.

export function rattlesnake(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const scales = matte(r.color, { shininess: 45, specular: 0x554422 });
  const diamond = matte(0x3a2410, { shininess: 45, specular: 0x332211 });
  const pale = matte(0xe8d4a0, { shininess: 30 });
  const belly = matte(0xd8c08a, { shininess: 20 });
  const horn = matte(0xc8b080, { shininess: 50, specular: 0x665533 });

  // The body: segments from the neck back, each a slice of the snake that the wave swings side to side.
  const segments: THREE.Object3D[] = [];
  const N = 26;
  const STEP = 0.16;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    // Thickest a third of the way back, tapering to the tail.
    const rad = Math.max(0.085, 0.17 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.95)) + 0.04);
    const seg = new THREE.Group();
    const z = 0.55 - k * STEP;
    seg.position.set(0, rad * 0.75, z);
    seg.userData = { z: k * STEP, amp: 0.05 + t * 0.32 };
    // A long capsule along the body, overlapping the next, flattened like a snake's: one smooth body, not beads.
    const len = STEP * 1.5;
    put(seg, new THREE.CapsuleGeometry(rad, len, 4, 12), scales, [0, 0, 0], [Math.PI / 2, 0, 0], [1.2, 1, 0.75]);
    put(seg, new THREE.CapsuleGeometry(rad * 0.9, len, 4, 10), belly, [0, -rad * 0.22, 0], [Math.PI / 2, 0, 0], [1.15, 1, 0.5]);
    // The diamonds down the back: dark, edged pale, one every other segment; banded black and white near the rattle.
    if (t > 0.85) put(seg, new THREE.CapsuleGeometry(rad * 1.02, len * 0.35, 4, 10), k % 2 ? pale : diamond, [0, 0, 0], [Math.PI / 2, 0, 0], [1.2, 1, 0.76]);
    else if (k % 2 === 0) {
      // Four-sided domes sunk into the back: a diamond from above, hugging the curve.
      put(seg, new THREE.SphereGeometry(rad * 0.82, 4, 6), pale, [0, rad * 0.42, 0], [0, 0, 0], [1.05, 0.55, 1.35]);
      put(seg, new THREE.SphereGeometry(rad * 0.68, 4, 6), diamond, [0, rad * 0.5, 0], [0, 0, 0], [1.05, 0.55, 1.35]);
    }
    // Dark blotches down the flanks between the diamonds, and a keel of raised scales along the spine.
    if (k % 2 === 1 && t < 0.85) for (const side of [-1, 1]) put(seg, new THREE.SphereGeometry(rad * 0.45, 6, 4), diamond, [side * rad * 1.08, -rad * 0.05, 0], [0, 0, side * 0.3], [0.35, 0.8, 1.3]);
    if (t < 0.85) put(seg, new THREE.SphereGeometry(rad * 0.2, 4, 3), pale, [0, rad * 0.98, k % 2 ? 0 : len * 0.4], [0, 0, 0], [0.8, 0.5, 1.6]);
    body.add(seg);
    segments.push(seg);
  }
  // The rattle: a stack of horn beads off the tip, shaking.
  const tip = segments[N - 1];
  const rattle = new THREE.Group();
  rattle.position.set(0, 0.06, -0.06);
  // The rattle held up off the road: a stack of interlocking horn buttons, each with a darker rim.
  const raised = new THREE.Group();
  raised.rotation.x = 0.75;
  const hornDark = matte(0x8a6a40, { shininess: 50, specular: 0x665533 });
  for (let k = 0; k < 8; k++) {
    const rr = 0.06 - k * 0.004;
    put(raised, cyl(rr * 0.8, rr, 0.05, 10), horn, [0, 0, -k * 0.055], [Math.PI / 2, 0, 0], [1.25, 1, 0.75]);
    put(raised, new THREE.TorusGeometry(rr * 0.92, 0.009, 4, 12), hornDark, [0, 0, -k * 0.055 - 0.024], [0, 0, 0], [1.25, 0.75, 1]);
  }
  put(raised, ball(0.03, 6, 4), horn, [0, 0, -0.45], [0, 0, 0], [1.2, 0.8, 1]);
  rattle.add(raised);
  tip.add(rattle);

  // The neck rises from the first segment, S-curved, the head held up and forward to strike.
  const neck = new THREE.Group();
  neck.position.set(0, 0.12, 0.62);
  body.add(neck);
  const neckPts: [number, number, number][] = [[0, 0, 0], [0, 0.18, 0.08], [0, 0.34, 0.06], [0, 0.42, 0.16]];
  for (let k = 0; k < neckPts.length - 1; k++) rod(neck, neckPts[k], neckPts[k + 1], 0.13 - k * 0.012, scales, 0.12 - k * 0.012);
  for (const at of neckPts.slice(1, -1)) put(neck, ball(0.125, 12, 8), scales, at, [0, 0, 0], [1.1, 1, 1]);

  // The head: a broad flat wedge, heat pits and slit eyes, fangs, a forked tongue flicking out.
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.86);
  // A broad, flat, arrow-shaped wedge: wide at the jaw hinges, narrowing to a blunt snout.
  const wedge = new THREE.Shape();
  wedge.moveTo(-0.2, -0.08);
  wedge.quadraticCurveTo(-0.24, 0.08, -0.12, 0.2);
  wedge.lineTo(-0.05, 0.33);
  wedge.quadraticCurveTo(0, 0.37, 0.05, 0.33);
  wedge.lineTo(0.12, 0.2);
  wedge.quadraticCurveTo(0.24, 0.08, 0.2, -0.08);
  wedge.quadraticCurveTo(0, -0.16, -0.2, -0.08);
  const wedgeGeo = new THREE.ExtrudeGeometry(wedge, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 6 }).rotateX(-Math.PI / 2).translate(0, -0.06, 0);
  put(head, wedgeGeo, scales, [0, 0, -0.06]);
  put(head, new THREE.SphereGeometry(0.09, 4, 6), diamond, [0, 0.04, 0.02], [0, 0, 0], [1.1, 0.4, 1.4]);
  eyes(head, 0.06, 0.1, 0.12, 0.04, 0xd8b020, true);
  for (const side of [-1, 1]) {
    put(head, ball(0.06, 8, 6), diamond, [side * 0.11, 0.08, 0.08], [0, 0, side * 0.4], [1.4, 0.35, 1.1]);
    put(head, cone(0.012, 0.07, 4), pale, [side * 0.05, -0.08, 0.22], [Math.PI, 0, 0]);
  }
  // Brow plates drawn down in a scowl, heat pits, the pale stripe back from the eye, scales over the crown.
  for (const side of [-1, 1]) {
    put(head, box(0.1, 0.025, 0.12), pale, [side * 0.11, 0.115, 0.1], [0.1, side * 0.2, side * 0.35]);
    put(head, ball(0.016, 6, 4), matte(0x0a0806), [side * 0.08, 0.0, 0.25]);
    put(head, ball(0.012, 6, 4), matte(0x0a0806), [side * 0.035, 0.03, 0.31]);
    put(head, box(0.015, 0.02, 0.2), pale, [side * 0.17, 0.0, -0.02], [0.3, side * 0.25, 0]);
    // Long fangs hinged down out of the open mouth.
    spike(head, [side * 0.06, -0.06, 0.2], [side * 0.065, -0.2, 0.24], 0.016, matte(0xfaf6e8), 6);
  }
  studs(head, diamond, [0, 0.0, 0.05], [0.18, 0.08, 0.22], 26, 0.022, (_x, y, z) => y > 0.6 && z < 0.7, 0.5);
  // The lower jaw dropped open on a pink mouth.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, -0.04);
  jaw.rotation.x = 0.5;
  put(jaw, wedgeGeo, scales, [0, 0, 0], [0, 0, 0], [0.88, 0.4, 0.92]);
  put(jaw, wedgeGeo, matte(0xe0607a, { shininess: 60 }), [0, 0.03, 0.01], [0, 0, 0], [0.78, 0.1, 0.84]);
  put(head, wedgeGeo, matte(0xc04a62), [0, -0.075, -0.05], [0, 0, 0], [0.8, 0.12, 0.86]);
  head.add(jaw);
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.04, 0.26);
  rod(tongue, [0, 0, 0], [0, 0, 0.14], 0.01, matte(0xc8203a), 0.008);
  for (const side of [-1, 1]) rod(tongue, [0, 0, 0.14], [side * 0.03, 0.01, 0.2], 0.008, matte(0xc8203a), 0.005);
  head.add(tongue);
  tongue.userData.phase = 0;
  body.add(head);
  bake(body, [head, neck, ...segments]);
  bake(neck);
  bake(head, [tongue]);
  for (const seg of segments) bake(seg, [rattle]);
  bake(rattle);

  return {
    body,
    wheels: [],
    // Dust kicked off the tail under boost.
    exhausts: [new THREE.Vector3(0, 0.1, 0.55 - N * STEP)],
    rearTrack: 0.25,
    rearZ: -2.5,
    spinners: [],
    shadow: [1.4, 4.6],
    head,
    segments,
    rattle,
    // The tongue flicks in and out.
    sweepers: [tongue],
  };
}

// ---- Skeleton Dragon: the dragon picked clean, flying on its bones ------------
// After the PetroDragonic Apocalypse art: a horned skull with burning sockets
// and an open fanged jaw, a ribcage with a fire in it, a spiked spine running
// into a long whip of a tail, and wings of bare finger bones with rags of
// membrane between them.

export function skeletonDragon(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const bone = matte(r.color, { shininess: 30, specular: 0x554a3a, emissive: 0x1a140c });
  const dark = matte(0x14100c);
  const fire = glow(r.accent);
  const hot = glow(0xffd060);
  const rag = new THREE.MeshPhongMaterial({ color: 0x2a1410, emissive: 0x3a0e04, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  // A bone along a curve through `pts`, thinner at the far end.
  const curved = (parent: THREE.Object3D, pts: [number, number, number][], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return put(parent, new THREE.TubeGeometry(curve, 16, radius, 6, false), bone, [0, 0, 0]);
  };
  // It flies: everything rides a metre off the road.
  const dragon = new THREE.Group();
  dragon.position.y = 1.0;
  body.add(dragon);

  // The spine: vertebrae from the neck down the back into the tail, each with a spike, the tail whipping off to a point.
  const spinePts: [number, number, number][] = [];
  for (let k = 0; k < 26; k++) {
    const z = 0.55 - k * 0.12;
    const y = k < 6 ? 0.18 - k * 0.02 : 0.06 - (k - 6) * 0.018 + Math.sin(k * 0.5) * 0.04;
    const x = k < 8 ? 0 : Math.sin((k - 8) * 0.45) * 0.05 * (k - 8) * 0.12;
    spinePts.push([x, y, z]);
    const size = k < 8 ? 0.07 : Math.max(0.025, 0.07 - (k - 8) * 0.0028);
    put(dragon, cyl(size, size, 0.07, 8), bone, [x, y, z], [Math.PI / 2, 0, 0]);
    put(dragon, cone(size * 0.45, size * 2.4, 5), bone, [x, y + size * 1.6, z - 0.02], [-0.5, 0, 0]);
  }
  curved(dragon, spinePts, 0.025);
  // The tail ends in a spade of bone.
  const end = spinePts[spinePts.length - 1];
  const spade = new THREE.Shape();
  spade.moveTo(0, 0.1);
  spade.quadraticCurveTo(0.09, 0.0, 0.0, -0.16);
  spade.quadraticCurveTo(-0.09, 0.0, 0, 0.1);
  put(dragon, new THREE.ExtrudeGeometry(spade, { depth: 0.015, bevelEnabled: false, curveSegments: 4 }).rotateX(Math.PI / 2), bone, [end[0], end[1] + 0.01, end[2] - 0.06]);

  // The ribcage: curved ribs hanging from the back, a keel of breastbone under them, and a fire burning inside.
  for (let k = 0; k < 7; k++) {
    const z = 0.38 - k * 0.12;
    const w = 0.34 - Math.abs(k - 2.5) * 0.04;
    const h = 0.4 - Math.abs(k - 2.5) * 0.035;
    const top = spinePts[Math.min(spinePts.length - 1, 2 + k)][1];
    for (const side of [-1, 1]) {
      curved(dragon, [[0, top, z], [side * w * 0.8, top - h * 0.15, z - 0.02], [side * w, top - h * 0.6, z - 0.05], [side * w * 0.45, top - h, z - 0.04], [0, top - h * 1.05, z - 0.02]], 0.018);
    }
  }
  curved(dragon, [[0, -0.2, 0.42], [0, -0.3, 0.1], [0, -0.28, -0.3]], 0.03);
  put(dragon, ball(0.16, 14, 10), fire, [0, -0.06, 0.05], [0, 0, 0], [1, 0.9, 1.3]);
  put(dragon, ball(0.08, 10, 8), hot, [0, -0.06, 0.08]);
  const pads = [glowSprite(dragon, [0, -0.06, 0.05], 1.1, r.accent), glowSprite(dragon, [0, -0.6, 0], 0.9, r.accent)];
  // The furnace: iron hoops caging the fire, a firebox door hanging open at the chest, a stovepipe up through
  // the spine trailing smoke, sparks whirling up out of it, and crude oil dripping from the bones.
  const M = new Mats();
  const iron = M.matte(0x2a2422, { shininess: 60, specular: 0x554433 });
  const rust = M.matte(0x6a3418, { shininess: 20 });
  for (const [z, s] of [[0.2, 1], [-0.1, 0.9]] as const) put(dragon, new THREE.TorusGeometry(0.19 * s, 0.018, 4, 16), iron, [0, -0.06, z], [0, 0, 0], [1, 0.9, 1]);
  put(dragon, new THREE.TorusGeometry(0.2, 0.016, 4, 16), iron, [0, -0.06, 0.05], [0, Math.PI / 2, 0], [1, 0.9, 1.3]);
  const door = new THREE.Group();
  door.position.set(0.1, -0.18, 0.36);
  door.rotation.y = -0.9;
  put(door, cyl(0.1, 0.1, 0.02, 12), iron, [-0.1, 0, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) put(door, box(0.12, 0.012, 0.025), M.glow(0xffb040), [-0.1, -0.04 + k * 0.04, 0.008]);
  put(door, box(0.03, 0.06, 0.02), rust, [-0.17, 0, 0.015]);
  dragon.add(door);
  for (let k = 0; k < 4; k++) put(dragon, box(0.012, 0.22, 0.012), iron, [-0.09 + k * 0.06, -0.08, 0.4]);
  put(dragon, cyl(0.045, 0.05, 0.36, 10), iron, [0, 0.24, -0.12]);
  put(dragon, cyl(0.065, 0.045, 0.06, 10), iron, [0, 0.43, -0.12]);
  put(dragon, new THREE.TorusGeometry(0.05, 0.01, 4, 10), rust, [0, 0.2, -0.12], [Math.PI / 2, 0, 0]);
  const smoke = M.haze(0x3a3434, 0.55);
  for (let k = 0; k < 5; k++) put(dragon, ball(0.06 + k * 0.025, 8, 6), smoke, [Math.sin(k) * 0.03, 0.5 + k * 0.05, -0.18 - k * 0.14]);
  const sparks = new THREE.Group();
  sparks.position.set(0, 0.5, -0.15);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(sparks, new THREE.OctahedronGeometry(0.022), M.glow(k % 2 ? 0xffd060 : r.accent), [Math.cos(a) * (0.12 + (k % 3) * 0.05), (k % 4) * 0.07, Math.sin(a) * (0.12 + (k % 3) * 0.05)]);
  }
  dragon.add(sparks);
  const oil = M.gloss(0x0a0808, { shininess: 140, specular: 0x8888aa });
  for (const [x, y, z, s] of [[0.12, -0.38, 0.2, 1], [-0.14, -0.4, -0.05, 0.8], [0.05, -0.36, -0.3, 0.7], [-0.08, -0.35, 0.32, 0.9]] as const) {
    put(dragon, ball(0.022 * s, 6, 4), oil, [x, y, z], [0, 0, 0], [1, 2.2, 1]);
    put(dragon, cone(0.012 * s, 0.08 * s, 5), oil, [x, y + 0.06 * s, z], [Math.PI, 0, 0]);
  }

  // The pelvis and the legs, folded under in flight: thigh, shin, a fan of toe bones with claws.
  put(dragon, ball(0.13, 10, 8), bone, [0, -0.02, -0.62], [0, 0, 0], [1.6, 0.6, 1]);
  for (const side of [-1, 1]) {
    const hip: [number, number, number] = [side * 0.18, -0.05, -0.62];
    const knee: [number, number, number] = [side * 0.32, -0.3, -0.42];
    const ankle: [number, number, number] = [side * 0.3, -0.45, -0.78];
    rod(dragon, hip, knee, 0.045, bone, 0.035);
    put(dragon, ball(0.05, 8, 6), bone, knee);
    rod(dragon, knee, ankle, 0.035, bone, 0.025);
    for (let t = -1; t <= 1; t++) {
      const toe: [number, number, number] = [ankle[0] + t * 0.07, ankle[1] - 0.12, ankle[2] - 0.12];
      rod(dragon, ankle, toe, 0.016, bone, 0.01);
      put(dragon, cone(0.015, 0.07, 4), dark, [toe[0], toe[1] - 0.03, toe[2] - 0.02], [-2.4, 0, 0]);
    }
    // Little forearms under the chest, claws curled.
    const shoulder: [number, number, number] = [side * 0.16, -0.12, 0.4];
    const elbow: [number, number, number] = [side * 0.26, -0.32, 0.5];
    const hand: [number, number, number] = [side * 0.2, -0.36, 0.7];
    rod(dragon, shoulder, elbow, 0.03, bone, 0.025);
    rod(dragon, elbow, hand, 0.025, bone, 0.02);
    for (let t = -1; t <= 1; t++) put(dragon, cone(0.012, 0.08, 4), dark, [hand[0] + t * 0.03, hand[1] - 0.02, hand[2] + 0.04], [2.2, 0, 0]);
  }

  // The wings: an arm bone to the wrist, then long finger bones fanning back, rags of membrane between them, spurs on the joints.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.2, 0.18, 0.32);
    wing.userData.side = side;
    const elbow: [number, number, number] = [side * 0.55, 0.22, 0.05];
    const wrist: [number, number, number] = [side * 1.05, 0.28, 0.3];
    rod(wing, [0, 0, 0], elbow, 0.05, bone, 0.04);
    put(wing, ball(0.06, 8, 6), bone, elbow);
    rod(wing, elbow, wrist, 0.04, bone, 0.03);
    put(wing, ball(0.05, 8, 6), bone, wrist);
    put(wing, cone(0.025, 0.16, 5), bone, [wrist[0] + side * 0.04, wrist[1] + 0.06, wrist[2] + 0.06], [0.6, 0, -side * 0.5]);
    const tips: [number, number, number][] = [
      [side * 1.75, 0.2, -0.1],
      [side * 1.55, 0.08, -0.6],
      [side * 1.15, 0.0, -0.95],
      [side * 0.6, -0.02, -0.9],
    ];
    for (const tip of tips) {
      const mid: [number, number, number] = [(wrist[0] + tip[0]) / 2, (wrist[1] + tip[1]) / 2 + 0.06, (wrist[2] + tip[2]) / 2];
      curved(wing, [wrist, mid, tip], 0.018);
      put(wing, cone(0.016, 0.1, 4), bone, tip, [0, 0, 0]);
      // A knuckle halfway along each finger, a hooked claw at its tip.
      put(wing, ball(0.028, 6, 4), bone, mid);
      spike(wing, tip, [tip[0] + side * 0.06, tip[1] - 0.06, tip[2] - 0.04], 0.018, dark, 4);
    }
    // Torn membrane: the panels between the fingers, ragged at the trailing edge.
    const anchor = [[0, 0, 0] as [number, number, number], elbow, wrist];
    const panel = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      g.computeVertexNormals();
      put(wing, g, rag, [0, 0, 0]);
    };
    const ragged = (p: [number, number, number], q: [number, number, number], k: number): [number, number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + (k % 2 ? 0.18 : 0.05)];
    for (let k = 0; k < tips.length - 1; k++) panel(wrist, tips[k], ragged(tips[k], tips[k + 1], k));
    panel(wrist, tips[tips.length - 1], anchor[1]);
    panel(anchor[1], tips[tips.length - 1], [side * 0.3, 0, -0.55]);
    dragon.add(wing);
    flappers.push(wing);
  }

  // The skull: long and narrow, horns curling back, burning sockets, the jaw dropped open on rows of fangs.
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.72);
  head.scale.setScalar(1.15);
  put(head, ball(0.2, 16, 12), bone, [0, 0.04, 0], [0, 0, 0], [1, 0.8, 1.1]);
  put(head, cyl(0.075, 0.15, 0.62, 10), bone, [0, 0.0, 0.36], [Math.PI / 2, 0, 0], [1, 0.6, 1]);
  put(head, ball(0.08, 10, 8), bone, [0, -0.005, 0.62], [0, 0, 0], [1, 0.55, 1.2]);
  // Nostril slits and the dark gaps of the cheekbones.
  for (const side of [-1, 1]) {
    put(head, ball(0.022, 6, 4), dark, [side * 0.035, 0.035, 0.68], [0, 0, 0], [0.6, 0.6, 1.6]);
    put(head, ball(0.06, 8, 6), dark, [side * 0.1, -0.03, 0.26], [0, 0, 0], [0.5, 0.7, 1.8]);
  }
  // Eye sockets: black hollows with a coal burning in each, and a brow ridge over.
  for (const side of [-1, 1]) {
    put(head, ball(0.075, 10, 8), dark, [side * 0.12, 0.08, 0.1], [0, 0, 0], [0.8, 0.9, 1]);
    put(head, ball(0.032, 8, 6), fire, [side * 0.14, 0.08, 0.14]);
    glowSprite(head, [side * 0.15, 0.08, 0.16], 0.35, r.accent);
    put(head, ball(0.08, 8, 6), bone, [side * 0.12, 0.15, 0.1], [0, 0, side * 0.3], [1.1, 0.35, 1.1]);
  }
  // Horns: two great ones sweeping back and curling, two small ones under them.
  for (const side of [-1, 1]) {
    curved(head, [[side * 0.12, 0.16, -0.02], [side * 0.22, 0.3, -0.2], [side * 0.26, 0.32, -0.45], [side * 0.2, 0.22, -0.6]], 0.04);
    put(head, cone(0.035, 0.12, 6), bone, [side * 0.19, 0.2, -0.66], [-2.2, 0, 0]);
    curved(head, [[side * 0.15, 0.05, -0.08], [side * 0.26, 0.08, -0.22], [side * 0.3, 0.02, -0.34]], 0.022);
    // A frill of little spikes down the back of the skull.
    for (let k = 0; k < 3; k++) put(head, cone(0.02, 0.1, 4), bone, [side * (0.06 + k * 0.03), 0.18 - k * 0.03, -0.12 - k * 0.04], [-1.2, 0, side * 0.4]);
  }
  // Upper fangs along the snout.
  for (let k = 0; k < 6; k++) for (const side of [-1, 1]) put(head, cone(0.014, k === 1 ? 0.11 : 0.06, 4), bone, [side * (0.09 - k * 0.008), -0.08, 0.5 - k * 0.07], [Math.PI, 0, 0]);
  // The jaw, hinged at the back of the skull and dropped open, its own teeth pointing up, the fire showing in the throat.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, -0.02);
  jaw.rotation.x = 0.42;
  for (const side of [-1, 1]) {
    rod(jaw, [side * 0.1, 0, 0], [side * 0.04, -0.02, 0.66], 0.025, bone, 0.018);
    for (let k = 0; k < 5; k++) put(jaw, cone(0.012, 0.06, 4), bone, [side * (0.09 - k * 0.009), 0.02, 0.18 + k * 0.08]);
  }
  put(jaw, ball(0.03, 6, 4), bone, [0, -0.02, 0.66]);
  head.add(jaw);
  put(head, ball(0.06, 8, 6), fire, [0, -0.08, 0.12]);
  glowSprite(head, [0, -0.1, 0.35], 0.4, r.accent);
  // Oil drooling off the jaw.
  for (const [x, z, len] of [[0.05, 0.4, 0.14], [-0.04, 0.55, 0.1]] as const) {
    put(jaw, cone(0.014, len, 5), oil, [x, -0.02 - len / 2, z], [Math.PI, 0, 0]);
    put(jaw, ball(0.02, 6, 4), oil, [x, -0.02 - len, z], [0, 0, 0], [1, 1.4, 1]);
  }
  // Cracks and pits worn into the skull.
  for (const [x, y, z, a] of [[0.06, 0.13, 0.05, 0.4], [-0.08, 0.12, -0.04, -0.6], [0.03, 0.05, 0.5, 1.2]] as const) put(head, box(0.006, 0.006, 0.09), dark, [x, y, z], [0, a, 0]);
  dragon.add(head);
  bake(body, [dragon]);
  bake(dragon, [head, sparks, ...flappers]);
  bake(head);
  for (const w of flappers) bake(w);

  const tipAt = spinePts[spinePts.length - 1];
  return {
    body,
    wheels: [],
    // Fire out of the tail tip under boost.
    exhausts: [new THREE.Vector3(tipAt[0], tipAt[1] + 1.0, tipAt[2] - 0.1)],
    rearTrack: 0.5,
    rearZ: -0.8,
    spinners: [],
    shadow: [3.6, 3.6],
    rotors: [sparks],
    hover: { bob: 0.14, pads },
    head,
    flappers,
  };
}
