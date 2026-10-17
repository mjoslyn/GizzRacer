import type { ItemKind } from '../items/items';

const SIZE = 96;
const cache = new Map<ItemKind, string>();

/** Chunky HUD icon for an item, drawn once and cached as a data URL. */
export function itemIcon(kind: ItemKind): string {
  let url = cache.get(kind);
  if (!url) {
    url = draw(kind);
    cache.set(kind, url);
  }
  return url;
}

function draw(kind: ItemKind): string {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.translate(SIZE / 2, SIZE / 2);
  const outline = (w = 5) => {
    g.lineWidth = w;
    g.strokeStyle = '#1a0620';
    g.stroke();
  };
  switch (kind) {
    case 'fuzzPedal': {
      // A stompbox: red body, two knobs, a footswitch, a lightning bolt.
      roundRect(g, -26, -34, 52, 68, 9);
      g.fillStyle = grad(g, '#ff5a4a', '#a8101c');
      g.fill();
      outline();
      for (const x of [-12, 12]) {
        g.beginPath();
        g.arc(x, -20, 6, 0, Math.PI * 2);
        g.fillStyle = '#f4f0e0';
        g.fill();
        outline(3);
      }
      g.beginPath();
      g.moveTo(4, -8);
      g.lineTo(-8, 6);
      g.lineTo(1, 6);
      g.lineTo(-4, 18);
      g.lineTo(9, 2);
      g.lineTo(0, 2);
      g.closePath();
      g.fillStyle = '#ffd23a';
      g.fill();
      outline(2.5);
      g.beginPath();
      g.arc(0, 26, 5, 0, Math.PI * 2);
      g.fillStyle = '#c8c8d0';
      g.fill();
      outline(2.5);
      break;
    }
    case 'microtonalMine': {
      // A spiky purple orb.
      g.beginPath();
      for (let i = 0; i < 24; i++) {
        const r = i % 2 ? 22 : 36;
        const a = (i / 24) * Math.PI * 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = grad(g, '#e08aff', '#6a1a9a');
      g.fill();
      outline();
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fillStyle = '#7dffd8';
      g.fill();
      outline(3);
      break;
    }
    case 'feedbackWave': {
      // Concentric rings from a speaker cone.
      for (const [r, col] of [
        [38, '#3ad8ff'],
        [27, '#7affb0'],
        [16, '#fff27a'],
      ] as const) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.lineWidth = 12;
        g.strokeStyle = '#1a0620';
        g.stroke();
        g.lineWidth = 6;
        g.strokeStyle = col;
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fillStyle = '#ff5ad0';
      g.fill();
      break;
    }
    case 'riffMissile': {
      // A guitar pick on a flame trail.
      g.rotate(-Math.PI / 4);
      g.beginPath();
      g.moveTo(-6, 12);
      g.quadraticCurveTo(0, 44, 6, 12);
      g.closePath();
      g.fillStyle = '#ff9a1f';
      g.fill();
      outline(3);
      g.beginPath();
      g.moveTo(0, -36);
      g.bezierCurveTo(24, -30, 22, 0, 0, 16);
      g.bezierCurveTo(-22, 0, -24, -30, 0, -36);
      g.fillStyle = grad(g, '#7ae0ff', '#1a5ad0');
      g.fill();
      outline();
      break;
    }
    case 'tempoShift': {
      // A metronome.
      g.beginPath();
      g.moveTo(-10, -34);
      g.lineTo(10, -34);
      g.lineTo(26, 32);
      g.lineTo(-26, 32);
      g.closePath();
      g.fillStyle = grad(g, '#ffe07a', '#c07a10');
      g.fill();
      outline();
      g.beginPath();
      g.moveTo(0, 22);
      g.lineTo(16, -26);
      g.lineWidth = 5;
      g.strokeStyle = '#1a0620';
      g.stroke();
      g.beginPath();
      g.arc(10, -8, 6, 0, Math.PI * 2);
      g.fillStyle = '#ff4a8a';
      g.fill();
      outline(3);
      break;
    }
  }
  return c.toDataURL();
}

function grad(g: CanvasRenderingContext2D, top: string, bottom: string): CanvasGradient {
  const gr = g.createLinearGradient(0, -SIZE / 2, 0, SIZE / 2);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  return gr;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
