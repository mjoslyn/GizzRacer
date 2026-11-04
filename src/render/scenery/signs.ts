import * as THREE from 'three';
import { seededRandom } from '../../core/math';
import type { Ribbon } from '../../tracks/track';
import { canvas, canvasTexture, glowSprite, matte, type Animated } from './base';
import { frameAt } from './road';

/**
 * Words in the world: a sign's face painted once and shared (a board with a
 * rule round it, a glowing neon, a foxed poster), the panel it goes on, a
 * banner across the road on two posts, and a buzz for neon.
 */

export type FaceStyle = 'board' | 'neon' | 'poster';

export interface FaceOptions {
  style?: FaceStyle;
  /** Background, letters, and (neon) the glow round them. */
  bg?: string;
  fg?: string;
  glow?: string;
  /** The rule round the edge (board), default the letters' colour; false for none. */
  rule?: string | false;
  /** A CSS font family (the weight and size are set to fit). */
  font?: string;
  /** The canvas, default 512 by 256 (a panel twice as wide as high). */
  width?: number;
  height?: number;
}

const STYLE: Record<FaceStyle, Required<Pick<FaceOptions, 'bg' | 'fg' | 'glow' | 'font'>>> = {
  board: { bg: '#0c0a08', fg: '#f0e4c8', glow: '', font: "Impact, 'Arial Black', sans-serif" },
  neon: { bg: '#0a0610', fg: '#ff3aa8', glow: '#ff70c8', font: "'Arial Black', Impact, sans-serif" },
  poster: { bg: '#d8c49a', fg: '#1a0e08', glow: '', font: "'Times New Roman', Georgia, serif" },
};

const faces = new Map<string, THREE.CanvasTexture>();

/**
 * A sign's face: `lines` of words centred, each squeezed to fit, made once
 * per words and look and shared. `board` is heavy letters on a plain
 * ground with a rule round it and a drop shadow (The Grim Reaper's, Gaia's,
 * Hot Wax's signs); `neon` glowing tubes on black (Sadie Sorceress's);
 * `poster` dark ink on stained paper (Billabong Valley's notices).
 */
export function textFace(lines: readonly string[], o: FaceOptions = {}): THREE.CanvasTexture {
  const style = o.style ?? 'board';
  const base = STYLE[style];
  const bg = o.bg ?? base.bg;
  const fg = o.fg ?? base.fg;
  const glow = o.glow ?? base.glow;
  const font = o.font ?? base.font;
  const W = o.width ?? 512;
  const H = o.height ?? 256;
  const key = [lines.join('|'), style, bg, fg, glow, o.rule, font, W, H].join('#');
  let t = faces.get(key);
  if (t) return t;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (style === 'poster') {
    // Foxed and stained.
    const rand = seededRandom(lines.join('').length * 31 + W);
    for (let k = 0; k < 40; k++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(90,60,30,0.18)');
      g.addColorStop(1, 'rgba(90,60,30,0)');
      ctx.save();
      ctx.translate(rand() * W, rand() * H);
      ctx.scale(10 + rand() * 40, 10 + rand() * 40);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const rule = o.rule ?? (style === 'poster' ? false : fg);
  if (rule) {
    if (style === 'neon') {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
    }
    ctx.strokeStyle = rule;
    ctx.lineWidth = style === 'neon' ? 6 : 8;
    const inset = Math.round(Math.min(W, H) * 0.06);
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = Math.max(1, lines.length);
  const size = Math.min((H * 0.8) / (n + 0.3), n === 1 ? H * 0.4 : H * 0.28);
  ctx.font = `${style === 'neon' ? 'italic ' : ''}900 ${size}px ${font}`;
  lines.forEach((line, k) => {
    const w = ctx.measureText(line).width;
    ctx.save();
    ctx.translate(W / 2, H / 2 + (k - (n - 1) / 2) * size * 1.08);
    if (w > W * 0.88) ctx.scale((W * 0.88) / w, 1);
    if (style === 'neon') {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 24;
      ctx.fillStyle = fg;
      ctx.fillText(line, 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(line, 0, 0);
    } else {
      if (style === 'board') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(line, 4, 4);
      }
      ctx.fillStyle = fg;
      ctx.fillText(line, 0, 0);
    }
    ctx.restore();
  });
  t = canvasTexture(c, false);
  faces.set(key, t);
  return t;
}

export interface PanelOptions {
  /** Height (default half the width, the face's own shape). */
  h?: number;
  /** The board behind and round the face. */
  frame?: THREE.Material;
  /** Unlit (default), so it reads in any light and glows in the dark; false to light it with the world. */
  glows?: boolean;
  /** How thick the board is (default 0.2). */
  depth?: number;
}

/** A sign panel `w` wide with `map` on its face toward -z (toward whoever's coming) and on its back. Centred on the origin. */
export function signPanel(w: number, map: THREE.Texture, o: PanelOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const h = o.h ?? w / 2;
  const d = o.depth ?? 0.2;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = o.glows === false ? new THREE.MeshLambertMaterial({ map }) : new THREE.MeshBasicMaterial({ map });
  const front = new THREE.Mesh(geo, mat);
  front.rotation.y = Math.PI;
  front.position.z = -d / 2 - 0.02;
  const rear = new THREE.Mesh(geo, mat);
  rear.position.z = d / 2 + 0.02;
  const pad = Math.max(0.2, w * 0.03);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + pad, h + pad, d), o.frame ?? matte(0x140e0c)), front, rear);
  return g;
}

export interface BannerOptions extends Omit<FaceOptions, 'width' | 'height'> {
  /** How high the banner's foot is over the road (default 7). */
  lift?: number;
  /** How wide it is (default the road's width and a little). */
  span?: number;
  /** The posts either side (default dark wood), and how thick (default 0.35). */
  post?: THREE.Material;
  postRadius?: number;
  /** A halo either end in this colour, lighting the posts' tops. */
  glowColor?: number;
}

/**
 * A banner across the road at `s` on two posts, its words facing the karts
 * coming at it (and on its back for the way home): a start gate's name, a
 * section's line, a sponsor. The group is placed and turned; add it.
 */
export function roadBanner(ribbon: Ribbon, s: number, lines: readonly string[], o: BannerOptions = {}, animated?: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const w = o.span ?? hw * 2 - 1;
  const h = Math.min(4, w / 4);
  const H = o.lift ?? 7;
  const post = o.post ?? matte(0x2a1e16);
  const r = o.postRadius ?? 0.35;
  const face = textFace(lines, { ...o, width: 1024, height: Math.round((1024 * h) / w) });
  const panel = signPanel(w, face, { h });
  panel.position.y = H + h / 2;
  g.add(panel);
  const halos: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, H + h + 1, 8), post);
    p.position.set(side * hw, (H + h + 1) / 2, 0);
    g.add(p);
    if (o.glowColor !== undefined) {
      const halo = glowSprite(o.glowColor, 5, 0.5);
      halo.position.set(side * hw, H + h + 1.2, 0);
      g.add(halo);
      halos.push(halo);
    }
  }
  if (animated && halos.length) animated.push((time) => halos.forEach((x, k) => (x.material.opacity = 0.4 + 0.1 * Math.sin(time * 3 + k))));
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * A neon buzz: the materials' brightness dips now and then, a tube
 * catching, and (with `beat`) pulses on it. `rate` how often it stutters.
 */
export function buzz(materials: readonly (THREE.MeshBasicMaterial | THREE.SpriteMaterial)[], animated: Animated, phase = 0, rate = 1): void {
  const base = materials.map((m) => m.color.clone());
  animated.push((time) => {
    const t = time * rate + phase;
    // Mostly steady; every few seconds a stutter of a fraction of a second.
    const stutter = Math.sin(t * 0.9) > 0.93 && Math.sin(t * 47) > 0 ? 0.35 : 1;
    const hum = 0.92 + 0.08 * Math.sin(t * 31);
    materials.forEach((m, k) => m.color.copy(base[k]).multiplyScalar(stutter * hum));
  });
}
