import * as THREE from 'three';
import { TILE } from './particles';

/** Tiles across and down the effects atlas. */
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
const CELL = 128;

let cache: THREE.CanvasTexture | null = null;

/**
 * Every particle's shape on one texture, white on clear (so a particle's
 * colour tints it), 4 by 4 tiles of 128 px in the order of TILE: glow,
 * star, note, ring, nonagon, flare, drop, cog; puff, shard, peel, chunk,
 * shadow (dark), clock, feather, streak.
 */
export function fxAtlas(): THREE.CanvasTexture {
  if (cache) return cache;
  const c = document.createElement('canvas');
  c.width = CELL * ATLAS_COLS;
  c.height = CELL * ATLAS_ROWS;
  const g = c.getContext('2d')!;
  const cell = (tile: number, draw: (g: CanvasRenderingContext2D) => void) => {
    g.save();
    g.translate((tile % ATLAS_COLS) * CELL + CELL / 2, Math.floor(tile / ATLAS_COLS) * CELL + CELL / 2);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    draw(g);
    g.restore();
  };
  const radial = (g: CanvasRenderingContext2D, r: number, stops: [number, string][]) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [at, col] of stops) gr.addColorStop(at, col);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (g: CanvasRenderingContext2D, pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  };

  cell(TILE.glow, (g) => radial(g, 60, [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.75)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]));
  cell(TILE.star, (g) => {
    radial(g, 34, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    const pts: number[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 20 : 54;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    poly(g, pts);
    g.fill();
  });
  cell(TILE.note, (g) => {
    g.lineWidth = 9;
    for (const x of [-26, 22]) {
      g.beginPath();
      g.ellipse(x, 30, 15, 11, -0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x + 12, 27);
      g.lineTo(x + 12, -36);
      g.stroke();
    }
    g.fillRect(-16, -42, 50, 12);
  });
  cell(TILE.ring, (g) => {
    // A thin bright rim with a soft wake inside it: a shockwave's front.
    const gr = g.createRadialGradient(0, 0, 30, 0, 0, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(0.86, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.93, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
  });
  cell(TILE.nonagon, (g) => {
    g.lineWidth = 10;
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    const pts: number[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * 48, Math.sin(a) * 48);
    }
    poly(g, pts);
    g.stroke();
  });
  cell(TILE.flare, (g) => {
    radial(g, 30, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    for (const [w, h] of [[60, 5], [5, 60]]) {
      const gr = g.createLinearGradient(-w, -h, w, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(-w, -h, w * 2, h * 2);
    }
  });
  cell(TILE.drop, (g) => {
    g.beginPath();
    g.moveTo(0, -50);
    g.bezierCurveTo(22, -14, 34, 8, 34, 22);
    g.arc(0, 22, 34, 0, Math.PI);
    g.bezierCurveTo(-34, 8, -22, -14, 0, -50);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.arc(10, 28, 14, 0, Math.PI * 2);
    g.fill();
  });
  const cog = (g: CanvasRenderingContext2D) => {
    const pts: number[] = [];
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const r = k % 4 < 2 ? 52 : 40;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    poly(g, pts);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 0, 15, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  };
  cell(TILE.cog, cog);
  cell(TILE.puff, (g) => {
    // A lumpy cloud: overlapping soft blobs.
    for (const [x, y, r, a] of [[0, 0, 44, 0.8], [-20, 10, 30, 0.6], [22, 8, 28, 0.6], [6, -18, 28, 0.55]]) {
      g.save();
      g.translate(x, y);
      radial(g, r, [[0, `rgba(255,255,255,${a})`], [0.6, `rgba(255,255,255,${a * 0.5})`], [1, 'rgba(255,255,255,0)']]);
      g.restore();
    }
  });
  cell(TILE.shard, (g) => {
    poly(g, [-10, -54, 30, 36, -30, 46]);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    poly(g, [-10, -54, 0, 40, -30, 46]);
    g.fill();
  });
  cell(TILE.peel, (g) => {
    g.lineWidth = 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-46, -24);
    g.quadraticCurveTo(-4, 52, 46, -24);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-40, -22);
    g.quadraticCurveTo(-4, 40, 40, -22);
    g.stroke();
  });
  cell(TILE.chunk, (g) => {
    poly(g, [-40, -20, -14, -46, 30, -36, 48, 6, 22, 42, -26, 38, -48, 10]);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.28)';
    poly(g, [22, 42, -26, 38, -48, 10, 0, 6]);
    g.fill();
  });
  cell(TILE.shadow, (g) => radial(g, 60, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]));
  cell(TILE.clock, (g) => {
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 0, 50, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.fillRect(Math.cos(a) * 40 - 3, Math.sin(a) * 40 - 3, 6, 6);
    }
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -34);
    g.moveTo(0, 0);
    g.lineTo(22, 8);
    g.stroke();
  });
  cell(TILE.feather, (g) => {
    g.beginPath();
    g.ellipse(0, 0, 22, 54, 0.3, 0, Math.PI * 2);
    g.fill();
  });
  cell(TILE.streak, (g) => {
    const gr = g.createLinearGradient(-62, 0, 62, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 62, 14, 0, 0, Math.PI * 2);
    g.fill();
  });
  cache = new THREE.CanvasTexture(c);
  cache.colorSpace = THREE.SRGBColorSpace;
  return cache;
}
