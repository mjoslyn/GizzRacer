import * as THREE from 'three';
import { graphicsDetail, type Detail } from '../detail';
import { ATLAS_COLS, ATLAS_ROWS, fxAtlas } from './atlas';
import { FX_BUDGET, burstCount } from './envelopes';
import { ParticleStore, STRIDE, makeBuffers, type ParticleBuffers } from './particles';

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aVel;
attribute vec4 aColor;
attribute vec4 aMisc;
uniform vec3 uCamVel;
uniform vec2 uCells;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  // Colours are given as sRGB (0xrrggbb): lit in linear like everything else.
  vColor = vec4(pow(aColor.rgb, vec3(2.2)), aColor.a);
  float size = aMisc.x;
  float c = cos(aMisc.y);
  float s = sin(aMisc.y);
  vec2 q = position.xy;
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec2 cell = vec2(mod(aMisc.z, uCells.x), floor(aMisc.z / uCells.x));
  vUv = vec2((cell.x + uv.x) / uCells.x, 1.0 - (cell.y + 1.0 - uv.y) / uCells.y);
  vec4 mvPosition;
  if (aMisc.w > 0.5) {
    mvPosition = modelViewMatrix * vec4(aOffset + vec3(r.x, 0.0, r.y) * size, 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
    if (aVel.w > 0.0) {
      // A streak along its motion past the camera.
      vec3 v = (modelViewMatrix * vec4(aVel.xyz - uCamVel, 0.0)).xyz;
      float len = length(v.xy);
      vec2 dir = len > 1e-3 ? v.xy / len : vec2(1.0, 0.0);
      vec2 side = vec2(-dir.y, dir.x);
      float along = size + min(len * aVel.w, 6.0);
      mvPosition.xy += dir * q.x * along + side * q.y * size * 0.5;
    } else {
      mvPosition.xy += r * size;
    }
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    #ifdef ADDITIVE
      gl_FragColor.a *= 1.0 - fogFactor;
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  #endif
  #include <colorspace_fragment>
}
`;

/** One layer: a store and the instanced quad that draws it, in one draw call. */
class Layer {
  readonly store: ParticleStore;
  readonly mesh: THREE.Mesh;
  private readonly buffers: ParticleBuffers;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;

  constructor(cap: number, additive: boolean, map: THREE.Texture, camVel: THREE.Vector3) {
    this.store = new ParticleStore(cap);
    this.buffers = makeBuffers(cap);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const attr = (name: string, data: Float32Array, size: number) => {
      const a = new THREE.InstancedBufferAttribute(data, size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.attrs = [attr('aOffset', this.buffers.offset, STRIDE.offset), attr('aVel', this.buffers.vel, STRIDE.vel), attr('aColor', this.buffers.color, STRIDE.color), attr('aMisc', this.buffers.misc, STRIDE.misc)];
    geo.instanceCount = 0;
    this.geo = geo;
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uCells: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) }, uCamVel: { value: null } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // The flat ones lie on the road, seen from above whichever way their corners wind.
      side: THREE.DoubleSide,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: '' } : {},
    });
    // Shared by reference, so the camera's motion set once reaches every layer.
    material.uniforms.map.value = map;
    material.uniforms.uCamVel.value = camVel;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    // Smoke and debris first, the glows over them.
    this.mesh.renderOrder = additive ? 11 : 10;
    this.mesh.visible = false;
  }

  flush(): void {
    const n = this.store.write(this.buffers);
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

/**
 * The race's particles: everything the karts and the items throw about
 * (sparks, smoke, debris, rings, flashes, the per-frame marks) in two draw
 * calls: one additive layer for light, one blended layer for matter.
 * Sized by the detail level (Low for phones keeps fewer and spawns fewer).
 *
 * Each frame: `begin(dt)` steps what's live, the views spawn, `end(camera)`
 * writes it out. Spawns between frames' ends are drawn at the next.
 */
export class FxSystem {
  readonly group = new THREE.Group();
  /** Light: sparks, glows, flashes, rings, stars. */
  readonly add: ParticleStore;
  /** Matter: smoke, dust, debris, shards, shadows. */
  readonly alpha: ParticleStore;
  /** How much of each burst to spawn (detail level). */
  readonly scale: number;
  private readonly layers: Layer[];
  private readonly camVel = new THREE.Vector3();
  private readonly lastCam = new THREE.Vector3();
  private hasCam = false;
  private frameDt = 0;

  constructor(readonly detail: Detail = graphicsDetail()) {
    const budget = FX_BUDGET[detail];
    this.scale = budget.scale;
    const map = fxAtlas();
    const light = new Layer(budget.add, true, map, this.camVel);
    const matter = new Layer(budget.alpha, false, map, this.camVel);
    this.add = light.store;
    this.alpha = matter.store;
    this.layers = [matter, light];
    this.group.add(matter.mesh, light.mesh);
  }

  /** How many of a burst of `n` this detail level spawns. */
  n(count: number): number {
    return burstCount(count, this.scale);
  }

  /** Mirror mode: spawns given in the flipped world (the items') come out flipped back. */
  flip(on: boolean): void {
    this.add.flipX = this.alpha.flipX = on;
  }

  begin(dt: number): void {
    this.frameDt = dt;
    this.add.step(dt);
    this.alpha.step(dt);
  }

  /** Writes this frame's particles out; `camera` (the one that follows the kart) streaks them by how they move past it. */
  end(camera?: THREE.Camera): void {
    if (camera && this.frameDt > 0) {
      const p = camera.position;
      if (this.hasCam) {
        const dt = this.frameDt;
        const vx = (p.x - this.lastCam.x) / dt;
        const vy = (p.y - this.lastCam.y) / dt;
        const vz = (p.z - this.lastCam.z) / dt;
        // A cut (a respawn, a new shot) isn't motion.
        if (vx * vx + vy * vy + vz * vz < 200 * 200) this.camVel.set(vx, vy, vz);
        else this.camVel.set(0, 0, 0);
      }
      this.lastCam.copy(p);
      this.hasCam = true;
    }
    for (const l of this.layers) l.flush();
  }

  clear(): void {
    this.add.clear();
    this.alpha.clear();
    this.hasCam = false;
    for (const l of this.layers) l.flush();
  }

  dispose(): void {
    for (const l of this.layers) {
      l.mesh.geometry.dispose();
      (l.mesh.material as THREE.Material).dispose();
    }
  }
}
