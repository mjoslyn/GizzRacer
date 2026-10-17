import * as THREE from 'three';

export interface PostFxParams {
  /** Heat haze strength, 0..1. */
  haze: number;
  /** Final-lap kaleidoscope on the screen edges, 0..1. */
  kaleido: number;
  /** Music beat phase 0..1 (0 = on the beat). */
  beat: number;
  time: number;
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
varying vec2 vUv;

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

  vec4 col = texture2D(tScene, uv);

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

  gl_FragColor = col;
  #include <colorspace_fragment>
}`;

/**
 * Full-screen effects on top of the scene: heat haze and the final-lap
 * kaleidoscope. With both off the scene renders straight to the screen,
 * so it costs nothing on tracks that don't use it.
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
    if (p.haze < 0.01 && p.kaleido < 0.01) {
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
    r.render(this.quadScene, this.quadCamera);
  }
}
