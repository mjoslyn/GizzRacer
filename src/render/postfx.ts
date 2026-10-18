import * as THREE from 'three';

export interface PostFxParams {
  /** Heat haze strength, 0..1. */
  haze: number;
  /** Final-lap kaleidoscope on the screen edges, 0..1. */
  kaleido: number;
  /** Music beat phase 0..1 (0 = on the beat). */
  beat: number;
  time: number;
  /** The Rattlesnake video's look, each 0..1: VHS (chroma bleed, wobble, scanlines, grain), the red duotone, letterbox bars. */
  vhs?: number;
  duo?: number;
  box?: number;
  /** Under water, 0..1: blue-green, rippling, with caustic light. */
  water?: number;
  /** The duotone's shadows, body and highlights (the track theme's `duotone`). */
  palette?: readonly [number, number, number];
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uTime;
uniform float uHaze;
uniform float uKaleido;
uniform float uBeat;
uniform float uAspect;
uniform float uVhs;
uniform float uDuo;
uniform float uBox;
uniform float uWater;
uniform vec3 uDuoDark;
uniform vec3 uDuoMid;
uniform vec3 uDuoHigh;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;

  // Heat haze: rippling refraction in a band around the horizon, where
  // the hot road meets the distance.
  if (uHaze > 0.0) {
    float band = smoothstep(0.22, 0.5, uv.y) * (1.0 - smoothstep(0.52, 0.66, uv.y));
    float w = sin(uv.y * 140.0 + uTime * 7.0) * 0.6 + sin(uv.y * 63.0 - uTime * 4.3 + uv.x * 24.0) * 0.4;
    float v = sin(uv.x * 90.0 + uTime * 5.1) * 0.5;
    uv += vec2(w, v * 0.5) * 0.0024 * uHaze * band;
  }

  // Under water everything wavers.
  if (uWater > 0.0) uv += vec2(sin(uv.y * 22.0 + uTime * 2.1), cos(uv.x * 17.0 + uTime * 1.7)) * 0.0035 * uWater;

  vec4 col;
  if (uVhs > 0.0) {
    // Tape: each line wobbles a little, and red and blue bleed apart.
    float line = floor(uv.y * 240.0);
    float jitter = (hash(vec2(line, floor(uTime * 15.0))) - 0.5) * 0.0016 + sin(uv.y * 5.0 + uTime * 1.7) * 0.0012;
    vec2 tu = uv + vec2(jitter * uVhs, 0.0);
    float bleed = 0.0045 * uVhs;
    col = texture2D(tScene, tu);
    col.r = texture2D(tScene, tu + vec2(bleed, 0.0)).r;
    col.b = texture2D(tScene, tu - vec2(bleed, 0.0)).b;
  } else {
    col = texture2D(tScene, uv);
  }

  // Kaleidoscope: the screen edges become mirrored, rotating slices of the
  // view, tinted with a rainbow and pulsing on the beat.
  if (uKaleido > 0.0) {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + uTime * 0.35;
    float seg = 6.2831853 / 10.0;
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    vec2 k = vec2(cos(a), sin(a)) * (0.18 + r * 0.55);
    vec2 kuv = 0.5 + k / vec2(uAspect, 1.0);
    vec3 kc = texture2D(tScene, kuv).rgb;
    float pulse = pow(1.0 - uBeat, 3.0);
    kc = mix(kc, kc * hue(r * 1.4 - uTime * 0.25) * 1.8, 0.55);
    float edge = smoothstep(0.5 - pulse * 0.08, 0.85, r);
    col.rgb = mix(col.rgb, kc, edge * uKaleido * (0.45 + 0.55 * pulse));
  }

  if (uWater > 0.0) {
    // Light filtered blue-green, darker with depth down the screen, and the dance of caustics.
    vec3 sea = col.rgb * vec3(0.3, 0.8, 0.95) + vec3(0.0, 0.03, 0.05);
    sea *= mix(1.05, 0.6, 1.0 - uv.y);
    float c = sin(uv.x * 38.0 + uTime * 1.9) + sin(uv.y * 31.0 - uTime * 1.4) + sin((uv.x + uv.y) * 27.0 + uTime * 2.3);
    sea += vec3(0.6, 0.9, 1.0) * pow(max(c / 3.0, 0.0), 6.0) * 0.18;
    col.rgb = mix(col.rgb, sea, uWater);
  }

  // The Rattlesnake video: posterized into a duotone in the world's colours,
  // its brightest parts burning like a snake's eye.
  if (uDuo > 0.0) {
    float l = sqrt(max(dot(col.rgb, vec3(0.3, 0.59, 0.11)), 0.0));
    float q = floor(l * 5.0 + 0.5) / 5.0;
    vec3 duo = mix(uDuoDark, uDuoMid, smoothstep(0.15, 0.7, q));
    duo = mix(duo, uDuoHigh, smoothstep(0.78, 1.0, q));
    col.rgb = mix(col.rgb, duo, uDuo);
  }
  if (uVhs > 0.0) {
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159);
    col.rgb *= 1.0 - uVhs * 0.14 * scan;
    col.rgb += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.05 * uVhs;
  }
  // Letterbox bars, like the tape the video was shot on.
  if (uBox > 0.0 && abs(vUv.y - 0.5) > 0.5 - uBox * 0.11) col.rgb = vec3(0.0);

  gl_FragColor = col;
  #include <colorspace_fragment>
}`;

/**
 * Full-screen effects on top of the scene: heat haze, the final-lap
 * kaleidoscope, and the look of the Rattlesnake video (tape, the red
 * duotone, letterbox bars). With all off the scene renders straight to
 * the screen, so it costs nothing on tracks that don't use it.
 */
export class PostFx {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly size = new THREE.Vector2();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          tScene: { value: null },
          uTime: { value: 0 },
          uHaze: { value: 0 },
          uKaleido: { value: 0 },
          uBeat: { value: 0 },
          uAspect: { value: 1 },
          uVhs: { value: 0 },
          uDuo: { value: 0 },
          uBox: { value: 0 },
          uWater: { value: 0 },
          uDuoDark: { value: new THREE.Color(0x0a0002) },
          uDuoMid: { value: new THREE.Color(0xc00410) },
          uDuoHigh: { value: new THREE.Color(0xf0c020) },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, p: PostFxParams): void {
    const r = this.renderer;
    const vhs = p.vhs ?? 0;
    const duo = p.duo ?? 0;
    const box = p.box ?? 0;
    const water = p.water ?? 0;
    if (p.haze < 0.01 && p.kaleido < 0.01 && vhs < 0.01 && duo < 0.01 && box < 0.01 && water < 0.01) {
      r.render(scene, camera);
      return;
    }
    r.getDrawingBufferSize(this.size);
    if (!this.target || this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { samples: 4, type: THREE.HalfFloatType });
    }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    const u = this.quad.material.uniforms;
    u.tScene.value = this.target.texture;
    u.uTime.value = p.time;
    u.uHaze.value = p.haze;
    u.uKaleido.value = p.kaleido;
    u.uBeat.value = p.beat;
    u.uAspect.value = this.size.x / this.size.y;
    u.uVhs.value = vhs;
    u.uDuo.value = duo;
    u.uBox.value = box;
    u.uWater.value = water;
    if (p.palette) {
      (u.uDuoDark.value as THREE.Color).setHex(p.palette[0]);
      (u.uDuoMid.value as THREE.Color).setHex(p.palette[1]);
      (u.uDuoHigh.value as THREE.Color).setHex(p.palette[2]);
    }
    r.render(this.quadScene, this.quadCamera);
  }
}
