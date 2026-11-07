import * as THREE from 'three';
import type { RacerDef } from '../../physics/racers';
import { arm, ball, box, brass, brows, chrome, cone, cyl, eyes, glow, glowSprite, gloss, matte, pipes, put, ring, rod, tex, UP, type KartModel } from '../racerModels';
import { grilleTexture, spotsTexture, stoneTexture, woodTexture } from '../textures';
import { bake, candle, decal, disc, Mats, sticker, swinger, tube, type V3 } from './kit';

/** Runes for the witch's hull, glowing green on the planks. */
function runeTexture(): THREE.CanvasTexture {
  return decal('witch-runes', 256, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#9aff4a';
    g.shadowColor = '#5aff2a';
    g.shadowBlur = 6;
    g.lineWidth = 3;
    g.lineCap = 'round';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 9; k++) {
      const x = 14 + k * 27;
      g.beginPath();
      g.moveTo(x, 10);
      g.lineTo(x, 38);
      for (let j = 0; j < 2; j++) {
        const y = 10 + rnd() * 24;
        g.moveTo(x, y);
        g.lineTo(x + (rnd() < 0.5 ? -9 : 9), y + (rnd() < 0.5 ? -8 : 8));
      }
      g.stroke();
    }
  });
}

/**
 * Beowulf, the black cat: sat on the dash, yellow eyes wide, its tail
 * twitching (returned, a flapper), the candle it knocked over beside it.
 */
function blackCat(parent: THREE.Object3D, M: Mats, at: V3, turn: number): THREE.Object3D {
  const cat = new THREE.Group();
  cat.position.set(...at);
  cat.rotation.y = turn;
  const fur = M.matte(0x141418, { shininess: 50, specular: 0x3a4466 });
  const pink = M.matte(0xe8909a);
  put(cat, ball(0.13, 12, 10), fur, [0, 0.11, -0.03], [0, 0, 0], [0.95, 0.85, 1.25]);
  put(cat, ball(0.1, 12, 10), fur, [0, 0.2, 0.06], [0.3, 0, 0], [0.9, 1.2, 0.9]);
  for (const side of [-1, 1]) {
    rod(cat, [side * 0.05, 0.2, 0.1], [side * 0.05, 0.02, 0.13], 0.028, fur, 0.025);
    put(cat, ball(0.032, 8, 6), fur, [side * 0.05, 0.02, 0.15], [0, 0, 0], [1, 0.6, 1.3]);
    put(cat, ball(0.06, 8, 6), fur, [side * 0.09, 0.07, -0.06], [0, 0, 0], [0.7, 1, 1.3]);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.1);
  put(head, ball(0.1, 14, 10), fur, [0, 0, 0], [0, 0, 0], [1.1, 0.95, 1]);
  put(head, ball(0.05, 10, 8), fur, [0, -0.035, 0.07], [0, 0, 0], [1.3, 0.8, 1]);
  for (const side of [-1, 1]) {
    put(head, cone(0.045, 0.1, 4), fur, [side * 0.065, 0.1, -0.01], [0, Math.PI / 4, side * -0.25]);
    put(head, cone(0.026, 0.06, 4), pink, [side * 0.063, 0.095, 0.006], [0, Math.PI / 4, side * -0.25]);
    // Big round yellow eyes, slit pupils: caught.
    put(head, ball(0.03, 10, 8), M.glow(0xffd23a), [side * 0.043, 0.015, 0.082]);
    put(head, box(0.008, 0.036, 0.01), M.matte(0x050505), [side * 0.043, 0.015, 0.11]);
    put(head, ball(0.007, 4, 3), M.glow(0xffffff), [side * 0.036, 0.026, 0.11]);
    for (let k = 0; k < 3; k++) put(head, box(0.11, 0.003, 0.003), M.matte(0xe8e8e8), [side * 0.08, -0.04 + k * 0.012, 0.09], [0, side * 0.2, side * (k - 1) * 0.15]);
  }
  put(head, cone(0.012, 0.016, 3), pink, [0, -0.02, 0.122], [Math.PI, 0, 0]);
  put(head, new THREE.TorusGeometry(0.08, 0.012, 4, 14), M.matte(0xc8202a), [0, -0.1, -0.005], [Math.PI / 2 + 0.3, 0, 0]);
  put(head, ball(0.018, 6, 4), M.gloss(0xd8a83a), [0, -0.12, 0.07]);
  cat.add(head);
  const { pivot: tail, inner } = swinger(cat, [0, 0.06, -0.17], 'y', 0.9);
  tube(inner, [[0, 0, 0], [0.04, 0.04, -0.12], [0.1, 0.16, -0.16], [0.08, 0.3, -0.1], [0.02, 0.34, -0.04]], 0.026, fur, 0.016);
  parent.add(cat);
  return tail;
}

// ---- Swamp Witch: witch in a fan-driven swamp hovercraft ------------------------

export function swampWitch(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wood = matte(0xffffff, { map: tex('wood', woodTexture) });
  const moss = gloss(r.color);
  const skin = matte(0x8fbf5a);
  const iron = matte(0x3a3a3a);
  const craft = new THREE.Group();
  craft.position.y = 0.35;
  body.add(craft);

  // Plank skiff riding on a fat rubber skirt.
  put(craft, ring(0.95, 0.28), matte(0x2a2a24, { shininess: 30 }), [0, 0.05, -0.1], [Math.PI / 2, 0, 0], [0.82, 1.25, 1]);
  put(craft, box(1.4, 0.35, 2.1), wood, [0, 0.35, -0.1]);
  put(craft, cyl(0.7, 0.7, 0.35, 3), wood, [0, 0.35, 1.05], [0, Math.PI / 6, 0], [1, 1, 0.9]);
  put(craft, box(1.5, 0.08, 2.2), moss, [0, 0.55, -0.1]);
  // Hanging moss and lily pads stuck to the gunwales.
  for (let k = 0; k < 6; k++) for (const side of [-1, 1]) put(craft, cone(0.06, 0.3, 5), moss, [side * 0.72, 0.38, -0.9 + k * 0.33], [Math.PI, 0, 0]);
  for (const [x, z] of [[0.55, 0.6], [-0.6, -0.5]]) put(craft, cyl(0.16, 0.16, 0.02, 12), matte(0x4a9a3a), [x, 0.6, z]);
  // A bubbling cauldron in the bow, a green lantern on a crook, a broom lashed along the side.
  put(craft, ball(0.24, 14, 10), iron, [0, 0.7, 0.75], [0, 0, 0], [1, 0.85, 1]);
  put(craft, cyl(0.2, 0.2, 0.03, 14), glow(0x9aff4a), [0, 0.86, 0.75]);
  for (let k = 0; k < 3; k++) put(craft, ball(0.05 + k * 0.01, 8, 6), glow(0xc8ff8a), [Math.sin(k * 2.1) * 0.08, 0.93 + k * 0.07, 0.75 + Math.cos(k * 2.1) * 0.06]);
  rod(craft, [-0.6, 0.55, 1.0], [-0.6, 1.6, 1.0], 0.025, matte(0x4a3420));
  put(craft, ring(0.12, 0.025, Math.PI), matte(0x4a3420), [-0.48, 1.6, 1.0], [0, 0, 0]);
  put(craft, ball(0.09, 10, 8), glow(0x7aff5a), [-0.36, 1.45, 1.0]);
  glowSprite(craft, [-0.36, 1.45, 1.0], 0.8, 0x7aff5a);
  rod(craft, [0.78, 0.5, 0.8], [0.78, 0.5, -0.9], 0.03, matte(0x6a4a2a));
  put(craft, cone(0.12, 0.45, 8), matte(0xc8a050), [0.78, 0.5, -1.1], [-Math.PI / 2, 0, 0]);
  // Big caged fan at the back, a crow perched on the cage.
  const cage = new THREE.Group();
  cage.position.set(0, 1.2, -1.15);
  put(cage, new THREE.TorusGeometry(0.7, 0.04, 8, 32), iron, [0, 0, 0]);
  for (let k = 0; k < 4; k++) put(cage, box(0.03, 1.4, 0.03), iron, [0, 0, 0], [0, 0, (k * Math.PI) / 4]);
  const fan = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Group();
    blade.rotation.z = (k * Math.PI * 2) / 3;
    put(blade, box(0.16, 0.62, 0.03), wood, [0, 0.31, -0.08], [0, 0.4, 0]);
    fan.add(blade);
  }
  put(fan, cyl(0.1, 0.1, 0.15), matte(0x222222), [0, 0, -0.08], [Math.PI / 2, 0, 0]);
  cage.add(fan);
  const crow = new THREE.Group();
  crow.position.set(0.15, 0.74, 0);
  const feather = matte(0x111118, { shininess: 60, specular: 0x334466 });
  put(crow, ball(0.1, 10, 8), feather, [0, 0, 0], [0, 0, 0], [1, 0.9, 1.4]);
  put(crow, ball(0.07, 10, 8), feather, [0, 0.08, 0.1]);
  put(crow, cone(0.025, 0.1, 6), matte(0x3a3020), [0, 0.07, 0.2], [Math.PI / 2, 0, 0]);
  put(crow, cone(0.06, 0.18, 4), feather, [0, -0.02, -0.18], [-Math.PI / 2 - 0.3, 0, 0]);
  put(crow, ball(0.015, 6, 4), glow(0xffd23a), [0.04, 0.1, 0.15]);
  cage.add(crow);
  put(craft, box(0.1, 0.9, 0.1), iron, [0, 0.8, -1.1]);
  craft.add(cage);
  // Spray kicked out from under the skirt.
  const pads = [-1, 1].flatMap((side) => [glowSprite(craft, [side * 0.75, -0.15, 0.5], 0.9, 0x9ac8b0), glowSprite(craft, [side * 0.75, -0.15, -0.7], 0.9, 0x9ac8b0)]);

  const d = new THREE.Group();
  d.position.set(0, 0.55, 0.05);
  put(d, cone(0.42, 0.9, 12), matte(0x2a1e3a), [0, 0.45, 0]);
  put(d, ring(0.24, 0.025), matte(r.accent), [0, 0.6, 0], [Math.PI / 2, 0, 0]);
  // One gnarled hand on the rudder stick, the other on the cauldron's spoon.
  rod(d, [0.15, 0.0, 0.3], [0.2, 0.6, 0.55], 0.025, matte(0x6a4a2a));
  arm(d, [-0.2, 0.75, 0.05], [-0.1, 0.33, 0.6], 0.05, matte(0x2a1e3a), skin);
  arm(d, [0.2, 0.75, 0.05], [0.2, 0.6, 0.55], 0.05, matte(0x2a1e3a), skin);
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.05);
  put(head, ball(0.26), skin, [0, 0, 0]);
  put(head, cone(0.07, 0.32, 8), skin, [0, -0.02, 0.36], [Math.PI / 2 - 0.3, 0, 0]);
  put(head, ball(0.035, 6, 4), matte(0x5a7a3a), [0.06, 0.02, 0.4]);
  put(head, ball(0.03, 6, 4), matte(0x5a7a3a), [-0.14, -0.1, 0.2]);
  eyes(head, 0.06, 0.2, 0.1, 0.06, 0xb7d14a, false);
  brows(head, 0.14, 0.23, 0.1, 0.1, matte(0x1a1a1a), 0.4);
  // A crooked grin with one tooth.
  put(head, new THREE.TorusGeometry(0.09, 0.015, 6, 12, Math.PI), matte(0x2a0a0a), [0, -0.12, 0.2], [0, 0, Math.PI]);
  put(head, box(0.025, 0.035, 0.02), matte(0xf4f0d0), [0.03, -0.19, 0.22]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI - Math.PI / 2;
    put(head, cyl(0.025, 0.012, 0.6, 5), matte(r.accent), [Math.sin(a) * 0.24, -0.25, -Math.abs(Math.cos(a)) * 0.15], [0.2, 0, a * 0.3]);
  }
  // Crooked hat in two pieces, with a buckle and a mushroom growing on the brim.
  const hatMat = matte(0x1a2a24);
  put(head, cyl(0.5, 0.5, 0.04, 20), hatMat, [0, 0.18, 0]);
  put(head, cyl(0.12, 0.26, 0.45, 12), hatMat, [0, 0.42, 0]);
  put(head, cone(0.12, 0.45, 12), hatMat, [0.08, 0.78, -0.12], [-0.6, 0, -0.4]);
  put(head, cyl(0.27, 0.27, 0.07, 16), matte(r.accent), [0, 0.24, 0]);
  put(head, box(0.1, 0.08, 0.02), gloss(0xd8a83a), [0, 0.24, 0.27]);
  put(head, cyl(0.02, 0.025, 0.08, 6), matte(0xf0e8d0), [0.35, 0.24, 0.2]);
  put(head, ball(0.06, 10, 6), matte(0xd0402a), [0.35, 0.29, 0.2], [0, 0, 0], [1, 0.5, 1]);
  d.add(head);
  craft.add(d);

  // On the dash: Beowulf the black cat, and the candle it knocked over, wax pooled and still burning.
  const M = new Mats();
  const catTail = blackCat(craft, M, [0.3, 0.59, 1.15], -0.35);
  const fallen = new THREE.Group();
  fallen.position.set(-0.12, 0.64, 1.2);
  fallen.rotation.set(0, 0.6, Math.PI / 2);
  const tipped = candle(fallen, M, [0, -0.15, 0], 0.26, 0.045, 0xe8e0c8);
  tipped.rotation.z = -Math.PI / 2 + 0.3;
  craft.add(fallen);
  put(craft, cyl(0.12, 0.13, 0.012, 12), M.matte(0xe8e0c8, { shininess: 40 }), [-0.02, 0.595, 1.18], [0, 0, 0], [1, 1, 0.7]);
  put(craft, cyl(0.07, 0.07, 0.03, 10), M.gloss(0xd8a83a), [-0.28, 0.6, 1.05], [Math.PI / 2, 0, 0.4]);
  // The rest of the ritual's candles at the stern, still lit, flickering.
  const flames: THREE.Object3D[] = [];
  for (const [x, z, h] of [[0.58, -0.75, 0.22], [-0.58, -0.75, 0.3], [0.6, 0.35, 0.18]] as const) {
    const f = candle(craft, M, [x, 0.59, z], h, 0.04, 0xe8e0c8);
    f.userData.side = 0.5 * Math.sign(x);
    flames.push(f);
  }
  // Runes burnt into the hull, a ring of salt on the deck, charms of bone hung off the fan cage.
  for (const side of [-1, 1]) sticker(craft, runeTexture(), [side * 0.705, 0.35, -0.1], [0, side * (Math.PI / 2), 0], 1.7, 0.3);
  put(craft, new THREE.TorusGeometry(0.5, 0.012, 3, 28), M.matte(0xf4f4f0), [0, 0.6, 0.05], [Math.PI / 2, 0, 0]);
  const boneMat = M.matte(0xe8e0c8);
  for (const [x, len] of [[-0.35, 0.22], [0.0, 0.3], [0.38, 0.18]] as const) {
    rod(cage, [x, -0.62 + (Math.abs(x) > 0.3 ? 0.2 : 0), 0.04], [x, -0.62 - len + (Math.abs(x) > 0.3 ? 0.2 : 0), 0.04], 0.004, M.matte(0x3a3020));
    const y = -0.62 - len + (Math.abs(x) > 0.3 ? 0.2 : 0);
    if (x === 0) {
      put(cage, ball(0.06, 8, 6), boneMat, [x, y - 0.05, 0.04], [0, 0, 0], [1, 0.9, 1]);
      for (const side of [-1, 1]) put(cage, ball(0.016, 5, 4), M.matte(0x1a1010), [x + side * 0.022, y - 0.045, 0.095]);
      put(cage, box(0.05, 0.02, 0.03), boneMat, [x, y - 0.1, 0.06]);
    } else {
      put(cage, box(0.015, 0.09, 0.015), boneMat, [x, y - 0.045, 0.04], [0, 0, 0.3]);
      put(cage, box(0.015, 0.09, 0.015), boneMat, [x, y - 0.045, 0.04], [0, 0, -0.3]);
    }
  }
  // Rivets round the cage ring, a crank on the fan's motor.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    put(cage, ball(0.022, 5, 4), M.matte(0x5a5a5a, { shininess: 60 }), [Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.03]);
  }
  // A woolly shawl round the witch's shoulders, a rat on the stern, potion bottles by the cauldron.
  put(d, new THREE.TorusGeometry(0.2, 0.08, 6, 16), M.matte(0x5a2a4a), [0, 0.74, 0], [Math.PI / 2 + 0.15, 0, 0], [1.15, 1, 0.7]);
  for (const [x, z, c] of [[0.3, 0.55, 0x4a2aa8], [0.36, 0.42, 0xa8202a], [-0.3, 0.5, 0x2aa86a]] as const) {
    put(craft, cyl(0.04, 0.05, 0.12, 8), M.gloss(c, { transparent: true, opacity: 0.85 }), [x, 0.65, z]);
    put(craft, cyl(0.018, 0.018, 0.06, 6), M.gloss(c), [x, 0.74, z]);
    put(craft, cyl(0.02, 0.02, 0.025, 6), M.matte(0x8a6a3a), [x, 0.78, z]);
  }
  bake(body, [head, fan, catTail, ...flames, tipped]);
  bake(head);
  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(0, 1.55, -1.35)],
    rearTrack: 0.82,
    rearZ: -0.85,
    spinners: [fan],
    shadow: [2.6, 3.4],
    flappers: [catTail, ...flames],
    hover: { bob: 0.05, pads },
    head,
  };
}

// ---- Microtonal Monk: monk levitating in a lotus pod with a sitar neck ---------

export function microtonalMonk(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const gold = gloss(r.color, { specular: 0xffe0a0 });
  const petal = gloss(0xf3a6c8);
  const innerPetal = gloss(0xffd0e4);
  const lotus = new THREE.Group();
  lotus.position.y = 0.55;
  body.add(lotus);

  put(lotus, ball(0.9, 24, 12), gold, [0, 0, 0], [0, 0, 0], [0.85, 0.35, 1.25]);
  put(lotus, ring(0.78, 0.04), gloss(r.accent), [0, 0.12, 0], [Math.PI / 2, 0, 0], [1, 1.45, 1]);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(lotus, ball(0.32, 10, 8), petal, [Math.sin(a) * 0.72, 0.17, Math.cos(a) * 1.0], [0.5 * Math.cos(a), a, -0.5 * Math.sin(a)], [0.5, 0.25, 1]);
    const b = a + Math.PI / 10;
    put(lotus, ball(0.26, 10, 8), innerPetal, [Math.sin(b) * 0.55, 0.3, Math.cos(b) * 0.78], [0.9 * Math.cos(b), b, -0.9 * Math.sin(b)], [0.45, 0.22, 0.9]);
  }
  // Petals curling down underneath, over a soft golden glow it floats on.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(lotus, ball(0.28, 10, 8), gold, [Math.sin(a) * 0.5, -0.22, Math.cos(a) * 0.7], [-0.6 * Math.cos(a), a, 0.6 * Math.sin(a)], [0.45, 0.2, 0.9]);
  }
  const pads = [glowSprite(lotus, [0, -0.45, 0], 2.2, 0xffd88a), glowSprite(lotus, [0, -0.5, 0.6], 1.2, 0xff9ad0), glowSprite(lotus, [0, -0.5, -0.6], 1.2, 0xff9ad0)];
  // Sitar-style neck rising behind, gourd at its foot, strings, tuning pegs.
  const wood = matte(0x7b3a1a, { shininess: 60, specular: 0x553322 });
  put(lotus, ball(0.32, 16, 12), wood, [0, 0.4, -0.95], [0, 0, 0], [1, 1, 0.8]);
  put(lotus, ring(0.2, 0.02), gold, [0, 0.4, -0.7], [0, 0, 0]);
  put(lotus, box(0.12, 1.5, 0.08), wood, [0, 1.25, -1.0], [-0.2, 0, 0]);
  for (let k = 0; k < 9; k++) put(lotus, box(0.14, 0.015, 0.1), chrome(), [0, 0.65 + k * 0.14, -0.88 - k * 0.028], [-0.2, 0, 0]);
  for (let k = -1; k <= 1; k++) rod(lotus, [k * 0.03, 0.45, -0.66], [k * 0.03, 1.95, -1.1], 0.004, chrome());
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) put(lotus, cyl(0.015, 0.025, 0.14, 6), wood, [side * 0.1, 1.55 + k * 0.1, -1.05 - k * 0.02], [0, 0, (side * Math.PI) / 2]);
  put(lotus, ball(0.1, 8, 6), wood, [0, 2.0, -1.15]);
  // Prayer flags strung from the neck to the bow.
  const flagColors = [0x3a7aff, 0xffffff, 0xd8302a, 0x3aa04a, 0xffd23a];
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) / 5;
    put(lotus, box(0.01, 0.13, 0.11), matte(flagColors[k]), [0.3, 1.9 - t * 1.4 - Math.sin(t * Math.PI) * 0.2, -1.05 + t * 2.0]);
  }
  rod(lotus, [0, 1.95, -1.1], [0.3, 0.2, 1.0], 0.005, matte(0x8a7a6a));

  // A ring of glowing notes orbits the pod.
  const orbit = new THREE.Group();
  orbit.position.y = 0.35;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const note = new THREE.Group();
    note.position.set(Math.sin(a) * 1.2, Math.sin(k * 2.3) * 0.15, Math.cos(a) * 1.3);
    put(note, ball(0.06, 8, 6), glow(0xffe680), [0, 0, 0], [0, 0, 0], [1.2, 0.9, 1]);
    put(note, box(0.015, 0.2, 0.015), glow(0xffe680), [0.06, 0.1, 0]);
    orbit.add(note);
  }
  lotus.add(orbit);

  const d = new THREE.Group();
  d.position.set(0, 0.1, -0.05);
  put(d, cone(0.48, 0.75, 16), gloss(0xff9a1a), [0, 0.38, 0]);
  put(d, box(0.12, 0.75, 0.1), gloss(r.accent), [0.18, 0.4, 0.2], [0, 0, 0.45]);
  // Crossed legs and hands together in front of the chest.
  for (const side of [-1, 1]) put(d, cyl(0.1, 0.1, 0.6, 10), gloss(0xff9a1a), [side * 0.12, 0.08, 0.3], [0, side * 0.6, Math.PI / 2]);
  const skin = gloss(0xd9a878, { reflectivity: 0.12, shininess: 120 });
  for (const side of [-1, 1]) arm(d, [side * 0.3, 0.62, 0.02], [side * 0.03, 0.55, 0.36], 0.06, gloss(0xff9a1a), skin);
  put(d, box(0.04, 0.16, 0.06), skin, [0, 0.64, 0.38]);
  const beads = new THREE.Group();
  beads.position.set(0, 0.72, 0.05);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    put(beads, ball(0.035, 6, 4), matte(r.accent), [Math.sin(a) * 0.22, -Math.abs(Math.cos(a)) * 0.18, Math.cos(a) * 0.16 + 0.1]);
  }
  d.add(beads);
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  put(head, ball(0.27), skin, [0, 0, 0]);
  put(head, ball(0.03, 8, 6), glow(0xd1342f), [0, 0.12, 0.26]);
  for (const side of [-1, 1]) put(head, box(0.09, 0.015, 0.02), matte(0x3a2410), [side * 0.09, 0.03, 0.25]); // eyes closed in meditation
  for (const side of [-1, 1]) put(head, box(0.08, 0.012, 0.02), matte(0x3a2410), [side * 0.09, 0.09, 0.25], [0, 0, side * -0.15]);
  put(head, new THREE.TorusGeometry(0.06, 0.01, 6, 12, Math.PI), matte(0x8a3a2a), [0, -0.1, 0.25], [0, 0, Math.PI]);
  put(head, ball(0.04, 8, 6), skin, [0, -0.01, 0.27]);
  for (const side of [-1, 1]) put(head, ball(0.07, 8, 6), skin, [side * 0.27, 0, 0], [0, 0, 0], [0.5, 1, 0.8]);
  // A halo hums above.
  put(head, new THREE.TorusGeometry(0.22, 0.02, 6, 24), glow(0xffe680), [0, 0.42, 0], [Math.PI / 2, 0, 0]);
  d.add(head);
  lotus.add(d);

  const M = new Mats();
  const robe = M.gloss(0xff9a1a);
  const fold = M.matte(0xc86a10);
  // The robe: folds down the cone, a cowl round the neck, a rope belt with tassels, the soles of his feet showing.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.2;
    rod(d, [Math.sin(a) * 0.45, 0.04, Math.cos(a) * 0.45], [Math.sin(a) * 0.1, 0.7, Math.cos(a) * 0.1], 0.012, fold, 0.006);
  }
  put(d, new THREE.TorusGeometry(0.19, 0.075, 6, 16), robe, [0, 0.76, -0.03], [Math.PI / 2 + 0.2, 0, 0], [1.1, 1, 0.8]);
  const rope = M.matte(0xd8b060);
  put(d, new THREE.TorusGeometry(0.21, 0.022, 4, 16), rope, [0, 0.43, 0], [Math.PI / 2, 0, 0]);
  for (const x of [-0.06, 0.06]) {
    rod(d, [x, 0.42, 0.2], [x * 1.5, 0.2, 0.3], 0.012, rope);
    put(d, cone(0.03, 0.07, 6), rope, [x * 1.5, 0.17, 0.3], [0.3, 0, 0]);
  }
  for (const side of [-1, 1]) put(d, ball(0.06, 8, 6), skin, [side * 0.3, 0.08, 0.42], [0, 0, 0], [0.8, 0.6, 1.3]);
  // A calm face: rosy cheeks, long lobes, the dot of ash on the brow.
  for (const side of [-1, 1]) {
    put(head, ball(0.05, 8, 6), M.matte(0xf09a80), [side * 0.15, -0.04, 0.21], [0, 0, 0], [1, 0.6, 0.4]);
    put(head, ball(0.045, 8, 6), skin, [side * 0.27, -0.13, 0.0], [0, 0, 0], [0.5, 1.3, 0.7]);
  }
  for (let k = 0; k < 3; k++) put(head, box(0.12, 0.008, 0.01), M.matte(0xe8e0d0), [0, 0.17 + k * 0.025, 0.235], [-0.4, 0, 0]);

  // The lotus: stamens round the seat, dew on the petals.
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    const at: V3 = [Math.sin(a) * 0.5, 0.28, Math.cos(a) * 0.7];
    put(lotus, cyl(0.008, 0.012, 0.16, 4), M.matte(0xffd85a), [at[0], at[1], at[2]], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]);
    put(lotus, ball(0.02, 5, 4), M.glow(0xffe680), [at[0] * 1.08, at[1] + 0.08, at[2] * 1.06]);
  }
  const dew = M.gloss(0xd8f0ff, { transparent: true, opacity: 0.7, shininess: 160, specular: 0xffffff });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    put(lotus, ball(0.035, 8, 6), dew, [Math.sin(a) * 0.74, 0.27, Math.cos(a) * 1.02]);
  }
  // Quarter-tone frets between the sitar's frets, and its sympathetic strings.
  for (let k = 0; k < 8; k++) put(lotus, box(0.1, 0.01, 0.1), M.glow(0x7ae8ff), [0, 0.72 + k * 0.14, -0.9 - k * 0.028], [-0.2, 0, 0]);
  for (let k = 0; k < 4; k++) rod(lotus, [0.05 + k * 0.012, 0.5, -0.72], [0.05 + k * 0.012, 1.5, -0.95], 0.0025, M.gloss(0xd8a83a));
  // Incense in a brass bowl on the bow, smoke curling up out of it.
  put(lotus, cyl(0.09, 0.06, 0.06, 10), M.gloss(0xd8a83a, { specular: 0xffe0a0 }), [0, 0.3, 1.05]);
  for (let k = 0; k < 3; k++) {
    rod(lotus, [(k - 1) * 0.03, 0.32, 1.05], [(k - 1) * 0.06, 0.52, 1.07], 0.006, M.matte(0x6a2a1a));
    put(lotus, ball(0.01, 4, 3), M.glow(0xff7a2a), [(k - 1) * 0.06, 0.525, 1.07]);
  }
  const smoke = M.haze(0xe8e4f0, 0.35);
  for (let k = 0; k < 6; k++) put(lotus, ball(0.035 + k * 0.012, 8, 6), smoke, [Math.sin(k * 1.3) * 0.06, 0.6 + k * 0.1, 1.06 - k * 0.04]);
  bake(body, [head, orbit]);
  bake(head);
  bake(orbit);

  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(0, 0.6, -1.15)],
    rearTrack: 0.72,
    rearZ: -0.8,
    spinners: [],
    shadow: [2.2, 3.0],
    rotors: [orbit],
    hover: { bob: 0.14, pads },
    head,
  };
}

// ---- Mushroom Sage: bearded mushroom elder flying a toadstool saucer -----------

export function mushroomSage(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const cap = matte(0xffffff, { map: tex('sage-cap', () => spotsTexture('#7a5adf', '#f4e8d0', 22)), shininess: 40, specular: 0x332244 });
  const stem = matte(r.accent);
  const gill = matte(0xc8b4e8, { side: THREE.DoubleSide });
  const saucer = new THREE.Group();
  saucer.position.y = 0.95;
  body.add(saucer);

  // A wide toadstool cap, flat on top where the sage sits; gills underneath; a stubby stem as the keel.
  put(saucer, new THREE.SphereGeometry(1.25, 56, 24, 0, Math.PI * 2, 0, Math.PI / 2), cap, [0, -0.2, 0], [0, 0, 0], [1, 0.42, 1.2]);
  put(saucer, new THREE.CircleGeometry(1.25, 28), gill, [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  for (let k = 0; k < 24; k++) put(saucer, box(0.015, 0.06, 1.0), gill, [0, -0.23, 0], [0, (k / 24) * Math.PI, 0]);
  put(saucer, ring(1.22, 0.06), stem, [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  put(saucer, cyl(0.32, 0.42, 0.55, 16), stem, [0, -0.48, 0]);
  put(saucer, ring(0.36, 0.05), matte(0xe8d8c0), [0, -0.35, 0], [Math.PI / 2, 0, 0]);
  // Glowing spore jets under the rim and a lamp at the keel.
  const pads: THREE.Object3D[] = [glowSprite(saucer, [0, -0.85, 0], 1.6, 0xb89aff)];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = [Math.sin(a) * 0.9, -0.3, Math.cos(a) * 1.05] as [number, number, number];
    put(saucer, ball(0.07, 8, 6), glow(0xd8c0ff), p);
    pads.push(glowSprite(saucer, [p[0], p[1] - 0.1, p[2]], 0.6, 0xb89aff));
  }
  // Small mushrooms sprouting on the cap, a moss rim round the seat.
  for (const [x, z, s] of [[0.7, 0.5, 1], [-0.75, 0.3, 0.8], [0.5, -0.7, 0.7], [-0.4, -0.8, 1.1]] as const) {
    put(saucer, cyl(0.03 * s, 0.04 * s, 0.14 * s, 8), matte(0xf0e8d0), [x, 0.18 - Math.hypot(x, z) * 0.12, z]);
    put(saucer, new THREE.SphereGeometry(0.09 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), gloss(0xff7a3a), [x, 0.25 - Math.hypot(x, z) * 0.12, z]);
  }
  put(saucer, ring(0.45, 0.07), matte(0x5a8a3a, { flatShading: true }), [0, 0.3, -0.1], [Math.PI / 2, 0, 0]);
  // Spores drifting round in a slow ring.
  const spores = new THREE.Group();
  spores.position.y = 0.2;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(spores, ball(0.035, 6, 4), glow(k % 2 ? 0xffe8a0 : 0xd8c0ff), [Math.sin(a) * 1.5, Math.sin(k * 1.7) * 0.25, Math.cos(a) * 1.6]);
  }
  saucer.add(spores);

  // The sage: a little mushroom elder with a great white beard and a staff.
  const d = new THREE.Group();
  d.position.set(0, 0.3, -0.1);
  put(d, cyl(0.2, 0.3, 0.55, 14), matte(0xe8dcc8), [0, 0.28, 0]);
  put(d, cone(0.32, 0.5, 14), matte(0x3a2a5a), [0, 0.2, 0]);
  for (const side of [-1, 1]) put(d, ball(0.08, 8, 6), matte(0x5a3a22), [side * 0.12, 0.0, 0.25], [0, 0, 0], [1, 0.6, 1.5]);
  // Staff topped with a glowing spore; the other hand on a carved tiller.
  rod(d, [0.38, -0.1, 0.25], [0.42, 1.25, 0.32], 0.025, matte(0x6a4a2a));
  put(d, ball(0.08, 10, 8), glow(0xd8c0ff), [0.42, 1.32, 0.32]);
  glowSprite(d, [0.42, 1.32, 0.32], 0.6, 0xb89aff);
  arm(d, [0.22, 0.45, 0.05], [0.4, 0.6, 0.28], 0.06, matte(0x3a2a5a), matte(0xe8d8c0));
  rod(d, [-0.25, 0.0, 0.5], [-0.25, 0.4, 0.45], 0.03, matte(0x6a4a2a));
  put(d, ball(0.06, 8, 6), matte(0x6a4a2a), [-0.25, 0.42, 0.45]);
  arm(d, [-0.22, 0.45, 0.05], [-0.25, 0.42, 0.45], 0.06, matte(0x3a2a5a), matte(0xe8d8c0));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.02);
  put(head, ball(0.2, 14, 10), matte(0xf0e4d0), [0, 0, 0]);
  eyes(head, 0.04, 0.15, 0.08, 0.045, 0x6a4ad8, false);
  brows(head, 0.1, 0.18, 0.08, 0.09, matte(0xffffff), -0.3);
  put(head, ball(0.045, 8, 6), matte(0xe8a890), [0, -0.02, 0.2]);
  // The beard: a fan of cones down to the lap, a moustache over it.
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 0.6;
    put(head, cone(0.06, 0.45, 6), matte(0xffffff), [Math.sin(a) * 0.12, -0.27, 0.12 + Math.cos(a) * 0.04], [Math.PI - 0.25, 0, a * 0.6]);
  }
  for (const side of [-1, 1]) put(head, cone(0.035, 0.18, 6), matte(0xffffff), [side * 0.08, -0.06, 0.19], [0, 0, side * 2.0]);
  // Its own little cap, spotted like the saucer.
  put(head, new THREE.SphereGeometry(0.34, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2), cap, [0, 0.1, 0], [0, 0, 0], [1, 0.75, 1]);
  put(head, new THREE.CircleGeometry(0.34, 18), gill, [0, 0.1, 0], [Math.PI / 2, 0, 0]);
  d.add(head);
  saucer.add(d);

  const M = new Mats();
  // A round door in the stem, a lit window either side and one at the back: someone lives in there.
  const door = M.matte(0x6a3a1e, { shininess: 30 });
  put(saucer, box(0.17, 0.2, 0.03), door, [0, -0.62, 0.385], [-0.17, 0, 0]);
  put(saucer, cyl(0.085, 0.085, 0.03, 12, ), door, [0, -0.52, 0.37], [Math.PI / 2 - 0.17, 0, 0]);
  for (let k = 0; k < 3; k++) put(saucer, box(0.008, 0.26, 0.035), M.matte(0x3a2010), [-0.05 + k * 0.05, -0.59, 0.392], [-0.17, 0, 0]);
  put(saucer, ball(0.018, 6, 4), M.gloss(0xd8a83a), [0.05, -0.6, 0.41]);
  for (const [x, z] of [[0.33, 0.12], [-0.33, 0.12], [0, -0.36]] as const) {
    const n: V3 = [x, 0, z];
    disc(saucer, [x * 1.06, -0.45, z * 1.06], n, 0.06, M.glow(0xffd88a), 10);
    put(saucer, new THREE.TorusGeometry(0.065, 0.012, 4, 12), door, [x * 1.07, -0.45, z * 1.07], [0, Math.atan2(x, z), 0]);
  }
  // Mycelium hanging in threads from under the rim, beaded at the ends.
  const thread = M.matte(0xf4f0e8);
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + 0.1;
    const rr = 0.75 + (k % 3) * 0.12;
    const len = 0.12 + ((k * 7) % 5) * 0.05;
    const top: V3 = [Math.sin(a) * rr, -0.24, Math.cos(a) * rr * 1.2];
    rod(saucer, top, [top[0] * 0.97, top[1] - len, top[2] * 0.97], 0.006, thread, 0.004);
    put(saucer, ball(0.014, 5, 4), M.glow(0xe8f0ff), [top[0] * 0.97, top[1] - len, top[2] * 0.97]);
  }
  // A snail on its way across the cap.
  const snail = new THREE.Group();
  snail.position.set(0.55, 0.13, -0.62);
  snail.rotation.y = 2.2;
  put(snail, ball(0.05, 8, 6), M.matte(0xc8b890), [0, 0.02, 0.06], [0, 0, 0], [0.7, 0.6, 1.8]);
  put(snail, new THREE.TorusGeometry(0.045, 0.03, 6, 12), M.matte(0xa86a3a), [0, 0.08, 0], [0, Math.PI / 2, 0]);
  put(snail, ball(0.03, 6, 4), M.matte(0x8a4a2a), [0, 0.08, 0]);
  for (const side of [-1, 1]) rod(snail, [side * 0.015, 0.04, 0.13], [side * 0.03, 0.1, 0.16], 0.005, M.matte(0xc8b890));
  saucer.add(snail);
  // A forager's satchel on his back, two of the day's finds poking out of it, and the strap across his chest.
  const satchel = M.matte(0x6a4a2a, { shininess: 20 });
  put(d, box(0.3, 0.24, 0.1), satchel, [0, 0.36, -0.29], [-0.12, 0, 0]);
  put(d, box(0.31, 0.12, 0.11), M.matte(0x4a3018), [0, 0.43, -0.3], [-0.12, 0, 0]);
  put(d, box(0.04, 0.05, 0.02), M.gloss(0xd8a83a), [0, 0.39, -0.355], [-0.12, 0, 0]);
  put(d, new THREE.TorusGeometry(0.29, 0.018, 4, 18), satchel, [0, 0.42, -0.04], [Math.PI / 2 + 0.25, 0.6, 0], [1, 1.25, 1]);
  for (const [x, c] of [[-0.08, 0xd8302a], [0.07, 0xf0c040]] as const) {
    put(d, cyl(0.018, 0.022, 0.12, 6), M.matte(0xf0e8d0), [x, 0.53, -0.3]);
    put(d, new THREE.SphereGeometry(0.06, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.gloss(c), [x, 0.58, -0.3]);
  }
  // Round brass spectacles on the sage, rosy cheeks.
  const brassy = M.gloss(0xd8a83a, { specular: 0xffe0a0 });
  for (const side of [-1, 1]) {
    put(head, new THREE.TorusGeometry(0.055, 0.009, 4, 14), brassy, [side * 0.08, 0.04, 0.2]);
    rod(head, [side * 0.135, 0.045, 0.19], [side * 0.19, 0.06, 0.04], 0.006, brassy);
    put(head, ball(0.04, 8, 6), M.matte(0xf0a090), [side * 0.12, -0.04, 0.16], [0, 0, 0], [1, 0.6, 0.5]);
  }
  rod(head, [-0.03, 0.045, 0.21], [0.03, 0.045, 0.21], 0.006, brassy);
  // The secret of the Fourth Colour: a prism on the staff, three colours you know and one you don't orbiting it.
  put(d, new THREE.OctahedronGeometry(0.09), M.gloss(0xffffff, { transparent: true, opacity: 0.6, shininess: 160, specular: 0xffffff }), [0.42, 1.46, 0.32], [0, 0.4, 0], [0.8, 1.3, 0.8]);
  const fourth = new THREE.Group();
  fourth.position.set(0.42, 1.36, 0.32);
  for (const [k, c] of [0xff3a3a, 0x3aff6a, 0x3a7aff, 0xd8ff3a].entries()) {
    const a = (k / 4) * Math.PI * 2;
    put(fourth, ball(k === 3 ? 0.04 : 0.028, 8, 6), M.glow(c), [Math.cos(a) * 0.17, (k % 2) * 0.04, Math.sin(a) * 0.17]);
  }
  glowSprite(fourth, [0.17 * Math.cos(Math.PI * 1.5), 0.04, 0.17 * Math.sin(Math.PI * 1.5)], 0.25, 0xd8ff3a);
  d.add(fourth);
  bake(body, [head, spores, fourth]);
  bake(head);
  bake(spores);

  return {
    body,
    wheels: [],
    exhausts: [-0.5, 0.5].map((x) => new THREE.Vector3(x, 0.8, -1.3)),
    rearTrack: 0.8,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.6, 3.0],
    rotors: [spores, fourth],
    hover: { bob: 0.16, pads },
    head,
  };
}

// ---- Lord of Lightning: a medieval storm wizard surfing his own bolt -----------
// After Murder of the Universe: a robed wizard in a tall crooked hat with a
// storm round its brim, a long grey beard streaming, eyes lit with the
// charge, a staff up with lightning caught in its head and the other hand
// raised to call more; riding a zigzag of lightning that hovers over the
// road, crackling.

export function lordOfLightning(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const robe = matte(r.color, { shininess: 25, specular: 0x333355 });
  const lining = matte(0x1a1640, { side: THREE.DoubleSide });
  const gold = brass();
  const skin = matte(0xd8b090);
  const beard = matte(0xd8d8d0, { shininess: 8 });
  const wood = matte(0x4a3018);
  const cloud = matte(0x6a6a7a, { shininess: 5, emissive: 0x101018 });
  const bolt = glow(r.accent);
  const white = glow(0xffffff);

  // The bolt: a flat zigzag, its point forward, glowing, hovering under him.
  const ride = new THREE.Group();
  ride.position.y = 0.42;
  body.add(ride);
  const zig = new THREE.Shape();
  const pts: [number, number][] = [[0, 1.5], [0.42, 0.35], [0.12, 0.42], [0.5, -0.6], [0.2, -0.52], [0.36, -1.5], [-0.42, -0.2], [-0.1, -0.28], [-0.48, 0.55], [-0.16, 0.5]];
  zig.moveTo(...pts[0]);
  for (const p of pts.slice(1)) zig.lineTo(...p);
  zig.closePath();
  // Flat on the road, the shape's y forward.
  const zigGeo = new THREE.ExtrudeGeometry(zig, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, 0.05, 0);
  put(ride, zigGeo, bolt, [0, 0, 0]);
  put(ride, zigGeo, white, [0, 0.02, 0], [0, 0, 0], [0.55, 1.3, 0.75]);
  // Arcs crackling round it: jagged rings that spin flat and fast.
  const rotors: THREE.Object3D[] = [];
  for (const [rad, y, n] of [[0.95, -0.02, 13], [0.7, 0.12, 9]] as const) {
    const arc = new THREE.Group();
    arc.position.y = y;
    const ring = Array.from({ length: n * 2 + 1 }, (_, k) => {
      const a = (k / (n * 2)) * Math.PI * 2;
      const rr = rad * (k % 2 ? 0.82 : 1.08);
      return new THREE.Vector3(Math.cos(a) * rr, (k % 3) * 0.04 - 0.04, Math.sin(a) * rr * 1.35);
    });
    put(arc, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true, 'catmullrom', 0), n * 4, 0.012, 4, true), white, [0, 0, 0]);
    ride.add(arc);
    rotors.push(arc);
  }
  const pads = [glowSprite(ride, [0, 0, 0.6], 1.2, r.accent), glowSprite(ride, [0, 0, -0.6], 1.2, r.accent), glowSprite(ride, [0, -0.2, 0], 1.6, 0xfffbd0)];

  // Him: standing on it sideways-on like a surfer, robe flaring, leaning into the ride.
  const wiz = new THREE.Group();
  wiz.position.y = 0.55;
  wiz.rotation.x = 0.12;
  body.add(wiz);
  // Boots planted on the bolt.
  for (const z of [0.35, -0.3]) put(wiz, ball(0.11, 10, 8), matte(0x2a1a10), [0, 0.04, z], [0, 0, 0], [0.9, 0.55, 1.5]);
  // The robe: a long flared cone to the boots, a cloak hanging off the shoulders behind, gold at the hem and down the front.
  put(wiz, cyl(0.2, 0.44, 1.25, 20), robe, [0, 0.68, 0], [0, 0, 0], [1, 1, 1.2]);
  put(wiz, cyl(0.45, 0.45, 0.05, 20), gold, [0, 0.08, 0], [0, 0, 0], [1, 1, 1.2]);
  put(wiz, box(0.06, 1.05, 0.02), gold, [0, 0.6, 0.27], [-0.32, 0, 0]);
  const cloak = new THREE.CylinderGeometry(0.28, 0.5, 1.15, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9);
  // The cloak hangs from the shoulders and billows back in the slipstream.
  const { pivot: cape, inner: capeIn } = swinger(wiz, [0, 1.3, -0.06], 'x', -0.35);
  put(capeIn, cloak, lining, [0, -0.58, 0], [-0.12, 0, 0], [1, 1, 1.25]);
  put(capeIn, cloak.clone().scale(1.02, 1, 1.02), robe, [0, -0.58, -0.005], [-0.12, 0, 0], [1, 1, 1.25]);
  // Lightning sigils stitched on the robe.
  for (const [x, y, z, k] of [[0.2, 0.45, 0.24, 1], [-0.22, 0.75, 0.18, -1], [0.16, 0.95, 0.15, -1]] as const) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(-0.3, k * 0.3, 0);
    put(g, box(0.03, 0.12, 0.01), bolt, [0, 0.05, 0], [0, 0, 0.5]);
    put(g, box(0.03, 0.12, 0.01), bolt, [0.02, -0.05, 0], [0, 0, 0.5]);
    wiz.add(g);
  }
  put(wiz, ring(0.2, 0.03), gold, [0, 0.92, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  // Shoulders and arms in wide sleeves: the left raised high to call the storm, the right on the staff.
  put(wiz, ball(0.26, 14, 10), robe, [0, 1.28, 0], [0, 0, 0], [1.3, 0.75, 1]);
  const sleeve = (shoulder: [number, number, number], hand: [number, number, number]) => {
    rod(wiz, shoulder, hand, 0.08, robe, 0.13);
    put(wiz, ball(0.065, 10, 8), skin, hand);
  };
  sleeve([0.28, 1.3, 0], [0.55, 1.75, 0.12]);
  for (let k = 0; k < 4; k++) put(wiz, cone(0.015, 0.09, 4), skin, [0.55 + (k - 1.5) * 0.03, 1.82, 0.12], [0, 0, (k - 1.5) * 0.2]);
  glowSprite(wiz, [0.56, 1.88, 0.12], 0.45, r.accent);
  sleeve([-0.28, 1.28, 0.04], [-0.42, 1.05, 0.38]);
  // The staff: gnarled wood, a claw of gold at the head holding a crackling orb.
  const staff = new THREE.Group();
  staff.position.set(-0.42, 1.05, 0.38);
  staff.rotation.set(0.35, 0, 0.12);
  rod(staff, [0, -0.85, 0], [0, 0.85, 0], 0.03, wood, 0.025);
  for (let k = 0; k < 3; k++) put(staff, ball(0.04, 6, 4), wood, [0, -0.5 + k * 0.5, 0]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    put(staff, cone(0.02, 0.18, 4), gold, [Math.cos(a) * 0.07, 0.92, Math.sin(a) * 0.07], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
  }
  put(staff, ball(0.1, 12, 10), white, [0, 1.0, 0]);
  put(staff, ball(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: r.accent, transparent: true, opacity: 0.4 }), [0, 1.0, 0]);
  glowSprite(staff, [0, 1.0, 0], 0.9, r.accent);
  wiz.add(staff);

  // The head: an old face, eyes lit with the charge, a great grey beard streaming back, the tall crooked hat.
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0.04);
  put(head, ball(0.17, 16, 12), skin, [0, 0.02, 0], [0, 0, 0], [0.9, 1.05, 0.95]);
  put(head, ball(0.05, 8, 6), skin, [0, -0.01, 0.17], [0, 0, 0], [0.8, 1, 1.2]);
  for (const side of [-1, 1]) {
    put(head, ball(0.03, 8, 6), glow(0xfffbd0), [side * 0.065, 0.05, 0.14]);
    glowSprite(head, [side * 0.065, 0.05, 0.16], 0.18, r.accent);
    put(head, ball(0.05, 8, 6), beard, [side * 0.07, 0.11, 0.13], [0, 0, side * 0.3], [1.3, 0.4, 0.6]);
  }
  // The beard and moustache, long, swept back a little by the wind.
  put(head, cone(0.17, 0.62, 12), beard, [0, -0.36, 0.24], [Math.PI - 0.35, 0, 0], [1, 1, 0.6]);
  put(head, ball(0.09, 10, 8), beard, [0, -0.07, 0.14], [0, 0, 0], [1.6, 0.5, 0.7]);
  // The hat: a wide brim and a tall cone crooked at the tip, stars and a bolt on it, a storm cloud wrapped round the brim.
  put(head, cyl(0.38, 0.38, 0.03, 20), robe, [0, 0.16, 0]);
  put(head, cone(0.2, 0.5, 16), robe, [0, 0.42, -0.02], [-0.12, 0, 0]);
  put(head, cone(0.1, 0.3, 12), robe, [0, 0.76, -0.12], [-0.7, 0, 0]);
  put(head, ring(0.2, 0.025), gold, [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  put(head, box(0.04, 0.14, 0.01), bolt, [0.03, 0.4, 0.17], [-0.12, 0, 0.5]);
  put(head, box(0.04, 0.14, 0.01), bolt, [0.05, 0.3, 0.18], [-0.12, 0, 0.5]);
  for (const [x, y, z] of [[-0.1, 0.48, 0.12], [0.11, 0.56, 0.06]] as const) put(head, ball(0.02, 6, 4), glow(0xfff6c0), [x, y, z]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    put(head, ball(0.09 + (k % 3) * 0.02, 8, 6), cloud, [Math.cos(a) * 0.36, 0.17 + (k % 2) * 0.03, Math.sin(a) * 0.36], [0, 0, 0], [1.3, 0.7, 1.1]);
  }
  wiz.add(head);

  const M = new Mats();
  // A rope belt with tassels and a pouch of storm-glass; buckles on the boots.
  const rope = M.matte(0xc8a050);
  put(wiz, new THREE.TorusGeometry(0.235, 0.025, 4, 18), rope, [0, 0.86, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  for (const x of [-0.05, 0.04]) {
    rod(wiz, [x, 0.84, 0.28], [x * 1.4, 0.58, 0.33], 0.012, rope);
    put(wiz, cone(0.03, 0.08, 6), rope, [x * 1.4, 0.55, 0.33], [0.2, 0, 0]);
  }
  put(wiz, box(0.12, 0.13, 0.07), M.matte(0x4a3018), [0.22, 0.76, 0.18], [0, 0.6, 0]);
  put(wiz, ball(0.03, 6, 4), M.glow(r.accent), [0.25, 0.79, 0.23]);
  for (const z of [0.35, -0.3]) put(wiz, box(0.06, 0.04, 0.02), gold, [0, 0.08, z + 0.15]);
  // Zigzag lightning round the hem.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    put(wiz, box(0.03, 0.09, 0.01), bolt, [Math.sin(a) * 0.43, 0.16, Math.cos(a) * 0.43 * 1.2], [0, a, (k % 2 ? 0.6 : -0.6)]);
  }
  // A gold ring on the beard, bushy brows, a mouth set hard under the moustache.
  put(head, new THREE.TorusGeometry(0.05, 0.015, 4, 12), gold, [0, -0.5, 0.3], [Math.PI / 2 - 0.35, 0, 0]);
  for (const side of [-1, 1]) put(head, cone(0.035, 0.14, 5), beard, [side * 0.09, 0.13, 0.13], [0, 0, side * 1.9]);
  put(head, box(0.07, 0.012, 0.02), M.matte(0x3a1a10), [0, -0.1, 0.165]);
  // Under the brim's storm cloud: rain and little bolts falling round his head.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.36;
    const z = Math.sin(a) * 0.36;
    if (k % 2) {
      put(head, box(0.025, 0.12, 0.01), bolt, [x, 0.06, z], [0, -a, 0.5]);
      put(head, box(0.025, 0.12, 0.01), bolt, [x + 0.02, -0.05, z], [0, -a, -0.5]);
    } else {
      for (let j = 0; j < 3; j++) put(head, box(0.006, 0.06, 0.006), M.haze(0xa8c8ff, 0.7), [x + j * 0.04 - 0.04, 0.02 - j * 0.07, z]);
    }
  }
  // Sparks spat off the bolt's points.
  for (const [x, z] of [[0, 1.5], [0.5, -0.6], [0.36, -1.5], [-0.48, 0.55], [0.42, 0.35], [-0.42, -0.2]] as const) {
    for (let k = 0; k < 2; k++) put(ride, new THREE.OctahedronGeometry(0.035), white, [x * 1.08 + k * 0.05, 0.06 + k * 0.06, z * 1.04 + k * 0.03]);
  }
  bake(body, [head, cape, ...rotors]);
  bake(head);
  bake(cape);

  return {
    body,
    wheels: [],
    // Sparks off the bolt's tail under boost.
    exhausts: [new THREE.Vector3(0.36, 0.45, -1.55)],
    rearTrack: 0.45,
    rearZ: -1.3,
    spinners: [],
    rotors,
    flappers: [cape],
    shadow: [2.0, 3.4],
    hover: { bob: 0.09, pads },
    head,
  };
}

// ---- Fuzz Golem: fuzzed-out rock golem on a boulder slab -----------------------

export function fuzzGolem(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rockMap = tex('stone', () => stoneTexture([70, 62, 80], [140, 128, 150]));
  const rock = matte(0xffffff, { map: rockMap, flatShading: true });
  const fuzz = matte(r.color, { flatShading: true, shininess: 30, specular: 0x442244 });
  const lava = glow(0xff8a2a);

  put(body, new THREE.DodecahedronGeometry(1, 0), rock, [0, 0.62, 0], [0.3, 0.4, 0], [0.85, 0.38, 1.35]);
  // Glowing cracks through the slab.
  for (const [x, z, a] of [[0.55, 0.4, 0.3], [-0.6, -0.2, -0.5], [0.3, -0.7, 1.2], [-0.2, 0.9, 0.8]] as const) {
    put(body, box(0.04, 0.03, 0.5), lava, [x, 0.86, z], [0, a, 0]);
  }
  for (let k = 0; k < 5; k++) put(body, new THREE.DodecahedronGeometry(0.12 + (k % 3) * 0.05, 0), rock, [Math.sin(k * 2.4) * 0.7, 0.85, Math.cos(k * 2.4) * 1.0]);
  // Amp stack strapped to the back: grille cloth, knobs, glowing tubes on top, a chain round it.
  put(body, box(0.95, 0.75, 0.45), matte(0x161616), [0, 1.05, -1.0]);
  const grille = matte(0xffffff, { map: tex('grille', grilleTexture) });
  put(body, box(0.85, 0.65, 0.02), grille, [0, 1.05, -1.23]);
  for (const side of [-1, 1]) {
    put(body, cyl(0.17, 0.2, 0.05, 20), matte(0x0a0a0a), [side * 0.2, 1.05, -1.25], [Math.PI / 2, 0, 0]);
    put(body, ball(0.05, 8, 6), matte(0x2a2a2a), [side * 0.2, 1.05, -1.28]);
  }
  put(body, box(0.95, 0.1, 0.45), gloss(r.accent), [0, 1.47, -1.0]);
  for (let k = 0; k < 5; k++) put(body, cyl(0.03, 0.03, 0.04, 10), chrome(), [-0.3 + k * 0.15, 1.47, -0.76], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) {
    put(body, cyl(0.045, 0.045, 0.18, 10), new THREE.MeshPhongMaterial({ color: 0xffb060, emissive: 0xff6a10, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }), [-0.2 + k * 0.2, 1.62, -1.05]);
  }
  for (const side of [-1, 1]) put(body, box(0.04, 0.8, 0.5), matte(0x6a6a6a, { shininess: 80 }), [side * 0.49, 1.05, -1.0]);
  // A coiled cable from the amp to the guitar.
  for (let k = 0; k < 8; k++) put(body, ring(0.07, 0.015), matte(0x111111), [0.45, 0.95, -0.7 + k * 0.08], [0, Math.PI / 2, 0]);

  const d = new THREE.Group();
  d.position.set(0, 0.85, 0.05);
  put(d, new THREE.IcosahedronGeometry(0.62, 0), fuzz, [0, 0.55, 0], [0.2, 0.3, 0]);
  // The fuzz: spikes in every direction, a few tipped with the accent colour.
  const spike = cone(0.07, 0.32, 5);
  const tip = matte(r.accent, { emissive: 0x332200 });
  // Spread evenly over it (a golden spiral): long spikes and short fuzz between them, a few tipped in the accent.
  const fuzzLight = matte(new THREE.Color(r.color).lerp(new THREE.Color(0xffffff), 0.35).getHex(), { flatShading: true, shininess: 30 });
  const fine = cone(0.035, 0.22, 4);
  for (let k = 0; k < 170; k++) {
    const y = 1 - (2 * (k + 0.5)) / 170;
    const rr = Math.sqrt(1 - y * y);
    const a = k * 2.399963;
    const dir = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    if (dir.y < -0.45) continue;
    if (dir.z > 0.45 && Math.abs(dir.y - 0.25) < 0.4) continue; // leave the face clear
    const long = k % 3 === 0;
    const m = put(d, long ? spike : fine, long ? (k % 9 === 0 ? tip : fuzz) : k % 2 ? fuzzLight : fuzz, [dir.x * 0.52, 0.55 + dir.y * 0.52, dir.z * 0.52]);
    // A little off the normal, so it reads as fuzz rather than a pincushion.
    dir.x += Math.sin(k * 3.1) * 0.25;
    dir.z += Math.cos(k * 2.3) * 0.25;
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.scale.setScalar(long ? 0.9 + ((k * 7) % 5) * 0.12 : 0.9 + ((k * 5) % 4) * 0.15);
  }
  // A fuzz guitar slung across the front: body, neck, headstock, strings.
  const guitar = new THREE.Group();
  guitar.position.set(0.1, 0.25, 0.62);
  guitar.rotation.set(0.2, 0, -0.6);
  put(guitar, box(0.5, 0.36, 0.08), gloss(r.accent), [0, 0, 0]);
  put(guitar, box(0.3, 0.28, 0.08), gloss(r.accent), [0.25, 0.1, 0], [0, 0, 0.6]);
  put(guitar, box(0.7, 0.07, 0.04), matte(0x3a2410), [0.55, 0, 0.02]);
  put(guitar, box(0.14, 0.11, 0.04), matte(0x111111), [0.95, 0.02, 0.02], [0, 0, 0.2]);
  for (let k = -1; k <= 1; k++) put(guitar, box(1.0, 0.006, 0.006), chrome(), [0.4, k * 0.02, 0.05]);
  for (let k = 0; k < 2; k++) put(guitar, box(0.14, 0.05, 0.02), matte(0x111111), [-0.05 + k * 0.08, -0.02, 0.05], [0, 0, Math.PI / 2]);
  d.add(guitar);
  // Boulder fists on the bars, one on the neck.
  put(d, new THREE.DodecahedronGeometry(0.22, 0), rock, [-0.55, 0.2, 0.55]);
  put(d, new THREE.DodecahedronGeometry(0.22, 0), rock, [0.62, 0.62, 0.55]);
  for (const side of [-1, 1]) rod(d, [side * 0.5, 0.5, 0.1], side < 0 ? [-0.55, 0.2, 0.55] : [0.62, 0.62, 0.55], 0.1, rock);

  const head = new THREE.Group();
  head.position.set(0, 0.75, 0.48);
  eyes(head, 0, 0.02, 0.2, 0.09, 0xffcc33, false);
  put(head, new THREE.DodecahedronGeometry(0.13, 0), rock, [-0.2, 0.13, 0.04], [0, 0, 0], [1.3, 0.5, 0.8]);
  put(head, new THREE.DodecahedronGeometry(0.13, 0), rock, [0.2, 0.13, 0.04], [0, 0, 0], [1.3, 0.5, 0.8]);
  // A mouth glowing like a cranked amp.
  put(head, box(0.3, 0.07, 0.04), lava, [0, -0.2, 0.04]);
  for (let k = 0; k < 4; k++) put(head, box(0.04, 0.08, 0.05), rock, [-0.11 + k * 0.073, -0.2, 0.06]);
  d.add(head);
  body.add(d);

  const M = new Mats();
  // A pedalboard at its feet: three stompboxes daisy-chained, knobs, footswitches, a red LED lit on the fuzz.
  const board = new THREE.Group();
  board.position.set(0, 0.93, 0.98);
  board.rotation.x = 0.18;
  put(board, box(0.78, 0.04, 0.26), M.matte(0x1a1a1a), [0, 0, 0]);
  for (const [k, c] of [0xff7a1a, 0x3ac85a, r.accent].entries()) {
    const x = -0.25 + k * 0.25;
    put(board, box(0.18, 0.07, 0.2), M.gloss(c), [x, 0.055, 0]);
    for (const kx of [-0.045, 0.045]) put(board, cyl(0.022, 0.022, 0.03, 8), M.matte(0x111111), [x + kx, 0.1, -0.05]);
    put(board, cyl(0.02, 0.02, 0.03, 8), chrome(), [x, 0.1, 0.05]);
    put(board, ball(0.012, 5, 4), M.glow(k === 0 ? 0xff2a1a : 0x4a1a1a), [x + 0.06, 0.095, 0.03]);
  }
  for (let k = 0; k < 2; k++) tube(board, [[-0.17 + k * 0.25, 0.06, -0.08], [-0.125 + k * 0.25, 0.12, -0.14], [-0.08 + k * 0.25, 0.06, -0.08]], 0.012, M.matte(0x111111));
  body.add(board);
  // Amethyst crystals and moss growing out of the slab.
  const amethyst = M.gloss(0xa04aff, { emissive: 0x3a0a6a, shininess: 140, specular: 0xffffff, flatShading: true });
  for (const [cx, cz] of [[0.62, 0.45], [-0.66, -0.3], [0.5, -0.75]] as const) {
    for (let k = 0; k < 4; k++) {
      const a = k * 1.9;
      const c = put(body, new THREE.OctahedronGeometry(0.07, 0), amethyst, [cx + Math.cos(a) * 0.06, 0.88 + (k === 0 ? 0.06 : 0), cz + Math.sin(a) * 0.06], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0.6, k === 0 ? 2.6 : 1.8, 0.6]);
      c.rotation.order = 'ZXY';
    }
  }
  for (const [x, z, sc] of [[-0.4, 0.75, 1], [0.7, -0.1, 0.8], [-0.55, 0.2, 0.7], [0.2, -0.95, 0.9]] as const) put(body, ball(0.13 * sc, 8, 5), M.matte(0x4a8a3a, { flatShading: true }), [x, 0.88, z], [0, 0, 0], [1.4, 0.3, 1.2]);
  // MIND FUZZ on the amp's back, where the chasing pack can read it; vents along its top.
  sticker(body, decal('mind-fuzz', 256, 64, (g, w, h) => {
    g.fillStyle = '#16101e';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (const [t, c] of [[0, '#ff5a7a'], [0.33, '#ffe45a'], [0.66, '#6aef7a'], [1, '#c86aff']] as const) grad.addColorStop(t, c);
    g.fillStyle = grad;
    g.font = 'italic 900 44px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MIND FUZZ', w / 2, h / 2 + 2, w - 16);
  }), [0, 1.4, -1.226], [0, Math.PI, 0], 0.6, 0.15);
  for (let k = 0; k < 6; k++) put(body, box(0.1, 0.012, 0.3), M.matte(0x050505), [-0.32 + k * 0.13, 1.525, -1.0]);
  // Knuckles on the boulder fists.
  for (const [fx, fy] of [[-0.55, 0.2], [0.62, 0.62]] as const) {
    for (let k = 0; k < 3; k++) put(d, new THREE.DodecahedronGeometry(0.06, 0), rock, [fx - 0.07 + k * 0.07, fy + 0.1, 0.7]);
  }
  // The fuzz crackles: a jagged ring of static round its middle, whirling.
  const crackle = new THREE.Group();
  crackle.position.set(0, 0.6, 0);
  const n = 15;
  const jag = Array.from({ length: n * 2 }, (_, k) => {
    const a = (k / (n * 2)) * Math.PI * 2;
    const rr = 0.86 * (k % 2 ? 0.88 : 1.06);
    return new THREE.Vector3(Math.cos(a) * rr, (k % 3) * 0.05 - 0.05, Math.sin(a) * rr);
  });
  put(crackle, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(jag, true, 'catmullrom', 0), n * 4, 0.012, 3, true), M.glow(0xd8ff7a), [0, 0, 0]);
  d.add(crackle);
  const exhausts = pipes(body, 0.42, 0.75, -1.3, 0.14);
  bake(body, [head, crackle]);
  bake(head);

  const stoneWheel = matte(0x4a4452, { flatShading: true, map: rockMap });
  return {
    body,
    wheels: [
      { x: 0.85, z: 0.95, radius: 0.4, width: 0.35, front: true, material: stoneWheel },
      { x: -0.85, z: 0.95, radius: 0.4, width: 0.35, front: true, material: stoneWheel },
      { x: 0.92, z: -0.85, radius: 0.56, width: 0.5, front: false, material: stoneWheel },
      { x: -0.92, z: -0.85, radius: 0.56, width: 0.5, front: false, material: stoneWheel },
    ],
    exhausts,
    rotors: [crackle],
    rearTrack: 0.92,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.8, 3.5],
    head,
  };
}
