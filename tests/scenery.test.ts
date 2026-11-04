import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildBillabongValley } from '../src/tracks/billabongValley';
import { pointAt } from '../src/tracks/spline';
import { Track, inPit } from '../src/tracks/track';
import type { Animated } from '../src/render/scenery';

/**
 * The scenery toolkit (src/render/scenery): props kept off the roads and
 * pits, crowds facing the road and moving on the beat, signs made once,
 * the skyline outside the walls, set pieces that move, all without a GPU.
 */

// Tests run without a DOM: a canvas that takes the toolkit's painting and does nothing with it.
beforeAll(() => {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 30 });
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

const scenery = () => import('../src/render/scenery');
const track = new Track(buildBillabongValley());
const main = track.main;
const L = main.spline.length;
const run = (animated: Animated, time: number) => animated.forEach((f) => f(time));

describe('scatter', () => {
  it('lays props either side of a stretch, in the band beside the road, clear of every road and pit', async () => {
    const { scatterSites, clearance } = await scenery();
    const sites = scatterSites({ track, ribbon: main, from: 0, to: L, spacing: 12, band: [4, 16] });
    expect(sites.length).toBeGreaterThan(200);
    expect(new Set(sites.map((s) => s.side))).toEqual(new Set([-1, 1]));
    for (const s of sites) {
      expect(s.gap).toBeGreaterThanOrEqual(4);
      expect(s.gap).toBeLessThanOrEqual(16);
      expect(clearance(track, s.x, s.z)).toBeGreaterThan(3);
      for (const p of track.def.pits) expect(inPit(p, s.x, s.z)).toBe(false);
    }
  });

  it('turns each to face the road when asked', async () => {
    const { scatterSites } = await scenery();
    for (const s of scatterSites({ track, ribbon: main, from: 100, to: 600, spacing: 20 })) {
      const p = pointAt(main.spline, s.s);
      const to = new THREE.Vector2(p.x - s.x, p.z - s.z).normalize();
      expect(Math.sin(s.facing) * to.x + Math.cos(s.facing) * to.y).toBeGreaterThan(0.95);
    }
  });

  it('is the same every time for a seed, and runs on past the end of the lap', async () => {
    const { scatterSites } = await scenery();
    const a = scatterSites({ track, ribbon: main, from: L - 200, to: 200, spacing: 10, seed: 9 });
    const b = scatterSites({ track, ribbon: main, from: L - 200, to: 200, spacing: 10, seed: 9 });
    expect(a).toEqual(b);
    expect(a.some((s) => s.s > L - 200)).toBe(true);
    expect(a.some((s) => s.s < 200)).toBe(true);
  });

  it('keeps to one side, and leaves gaps', async () => {
    const { scatterSites } = await scenery();
    const left = scatterSites({ track, ribbon: main, from: 0, to: 1000, spacing: 8, side: 'left' });
    expect(left.every((s) => s.side === -1)).toBe(true);
    const sparse = scatterSites({ track, ribbon: main, from: 0, to: 1000, spacing: 8, side: 'left', gaps: 0.5 });
    expect(sparse.length).toBeLessThan(left.length * 0.75);
  });

  it('builds a prop at each site, picked by weight from every kind', async () => {
    const { scatter } = await scenery();
    const used = new Set<string>();
    const kind = (name: string) => () => {
      used.add(name);
      return new THREE.Object3D();
    };
    const g = scatter({ track, ribbon: main, from: 0, to: 2000, spacing: 10, kinds: [[3, kind('tree')], [1, kind('rock')], [1, kind('fire')]], turn: 'road' });
    expect(g.children.length).toBeGreaterThan(100);
    expect(used).toEqual(new Set(['tree', 'rock', 'fire']));
  });

  it('puts many of one mesh in one InstancedMesh, colour-jittered', async () => {
    const { scatterInstanced } = await scenery();
    const mesh = scatterInstanced({ track, ribbon: main, from: 0, to: L, spacing: 6, geometry: new THREE.BoxGeometry(), material: new THREE.MeshLambertMaterial(), colors: [0x884422], lift: 0.5 });
    expect(mesh.count).toBeGreaterThan(400);
    expect(mesh.instanceColor).not.toBeNull();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    expect(p.y).toBeGreaterThan(0);
  });
});

describe('crowd', () => {
  it('stands in rows beside the road, clear of it, and bobs on the beat', async () => {
    const { crowd, beat, clearance } = await scenery();
    const animated: Animated = [];
    const b = beat(120);
    const c = crowd({ track, ribbon: main, from: 50, to: 250, rows: 3, beat: b, motion: 'jump', lights: { color: 0xffa040 } }, animated);
    expect(c.count).toBeGreaterThan(150);
    expect(animated.length).toBe(1);
    const bodies = c.group.children[0] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const at = (time: number) => {
      run(animated, time);
      bodies.getMatrixAt(0, m);
      return p.setFromMatrixPosition(m).clone();
    };
    const first = at(0);
    expect(clearance(track, first.x, first.z)).toBeGreaterThan(1.5);
    // Up on the beat, down between: over one beat (half a second) each figure jumps once.
    const ys = Array.from({ length: 25 }, (_, k) => at(k * 0.02).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
    // And the lights held up are a Points cloud.
    expect(c.group.children.some((o) => o instanceof THREE.Points)).toBe(true);
  });
});

describe('beat', () => {
  it('counts the beat off the race clock', async () => {
    const { beat } = await scenery();
    const b = beat(120);
    expect(b.phase(0)).toBe(0);
    expect(b.phase(0.25)).toBeCloseTo(0.5);
    expect(b.kick(0)).toBe(1);
    expect(b.kick(0.25)).toBeLessThan(0.1);
    expect(b.pulse(0)).toBeCloseTo(1);
    expect(b.pulse(0.25)).toBeCloseTo(0);
    expect([0, 0.5, 1, 1.5, 2].map((t) => b.count(t))).toEqual([0, 1, 2, 3, 0]);
    expect(b.sway(0.25)).toBeCloseTo(1);
    expect(b.sway(0.75)).toBeCloseTo(-1);
  });
});

describe('signs', () => {
  it('paints each face once and shares it', async () => {
    const { textFace } = await scenery();
    const a = textFace(['MAD DOG', 'MORGAN'], { style: 'poster' });
    expect(textFace(['MAD DOG', 'MORGAN'], { style: 'poster' })).toBe(a);
    expect(textFace(['MAD DOG', 'MORGAN'], { style: 'neon' })).not.toBe(a);
  });

  it('hangs a banner over the road between posts beyond its edges', async () => {
    const { roadBanner } = await scenery();
    const s = 400;
    const g = roadBanner(main, s, ['BAIL UP!'], { lift: 6, glowColor: 0xff7a30 }, []);
    const p = pointAt(main.spline, s);
    expect(Math.hypot(g.position.x - p.x, g.position.z - p.z)).toBeLessThan(0.01);
    const posts = g.children.filter((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.CylinderGeometry);
    expect(posts.length).toBe(2);
    for (const post of posts) expect(Math.abs(post.position.x)).toBeGreaterThan(main.halfWidthAtS(s));
  });
});

describe('fire and light', () => {
  it('flickers, and burns down to nothing at strength 0', async () => {
    const { flame } = await scenery();
    const f = flame(2, 0);
    f.flicker(1.3, 0);
    for (const s of f.group.children as THREE.Sprite[]) expect(s.material.opacity).toBe(0);
    f.flicker(1.3, 1);
    expect((f.group.children[0] as THREE.Sprite).material.opacity).toBeGreaterThan(0.5);
  });

  it('builds torches, lamps and fires that animate', async () => {
    const { torch, lamp, fire } = await scenery();
    const animated: Animated = [];
    const parts = [torch(animated, 0, { kind: 'basket' }), lamp(animated, 1, { shape: 'ball' }), fire(animated, 2, { size: 6 })];
    expect(animated.length).toBe(3);
    run(animated, 2.5);
    for (const p of parts) expect(p.children.length).toBeGreaterThan(1);
  });
});

describe('air', () => {
  it('keeps motes in their volume as they rise', async () => {
    const { motes } = await scenery();
    const animated: Animated = [];
    const pts = motes({ count: 200, radius: 10, height: 20, color: 0xff7a30, drift: 'rise' }, animated);
    for (const t of [0, 3.3, 17]) {
      run(animated, t);
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(10.001);
        expect(pos.getY(i)).toBeGreaterThanOrEqual(0);
        expect(pos.getY(i)).toBeLessThanOrEqual(20);
      }
    }
  });

  it('wheels a flock, swarms and smoke round a point', async () => {
    const { flock, swarm, smokeColumn } = await scenery();
    const animated: Animated = [];
    expect(flock({ count: 12, radius: 30, color: 0x101010 }, animated).count).toBe(12);
    expect(swarm({ count: 40, radius: 4, height: 2, color: 0xa0ff60 }, animated).geometry.attributes.position.count).toBe(40);
    expect(smokeColumn({ puffs: 8 }, animated).children.length).toBe(8);
    run(animated, 4);
  });
});

describe('skyline', () => {
  it('rings the play area outside its walls, open where asked', async () => {
    const { skyline } = await scenery();
    const b = track.def.bounds;
    const g = skyline({ track, shapes: [[2, 'tower'], [1, 'spire'], [1, 'hill']], color: 0x101018, windows: 0xffd080, beacons: { color: 0xff2020 }, open: (a) => a > 0 && a < Math.PI / 2 }, []);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let n = 0;
    for (const mesh of g.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh)) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(p, q, s);
        // Its whole footprint is outside the square.
        expect(Math.max(Math.abs(p.x), Math.abs(p.z)) - (s.x / 2) * Math.SQRT2).toBeGreaterThan(b);
        expect(p.x > 0 && p.z > 0).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(25);
  });
});

describe('set pieces', () => {
  it('stands the body on its base with a glow, and moves it', async () => {
    const { setPiece } = await scenery();
    const animated: Animated = [];
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4).translate(0, 6, 0));
    const g = setPiece({ body, glow: { color: 0xffa040 }, spin: 0.5, bob: 1 }, animated);
    const holder = g.userData.body as THREE.Object3D;
    expect(holder.position.y).toBeGreaterThan(0);
    run(animated, 2);
    expect(holder.rotation.y).toBeCloseTo(1);
    expect(g.children.some((o) => o instanceof THREE.Sprite)).toBe(true);
  });

  it('stands beside the road facing the karts coming at it', async () => {
    const { standBeside } = await scenery();
    const s = 700;
    const obj = standBeside(new THREE.Object3D(), main, s, -30, { back: 90 });
    const back = pointAt(main.spline, s - 90);
    const to = new THREE.Vector2(back.x - obj.position.x, back.z - obj.position.z).normalize();
    expect(Math.sin(obj.rotation.y) * to.x + Math.cos(obj.rotation.y) * to.y).toBeCloseTo(1);
  });
});
