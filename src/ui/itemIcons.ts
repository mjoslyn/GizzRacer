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
      // The Microtonal Banana: a banana with frets down it.
      banana(g, outline);
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
      // Big Fig Wasp: a mechanical wasp, saw-blade eyes.
      g.rotate(-Math.PI / 6);
      for (const y of [-1, 1]) {
        g.beginPath();
        g.ellipse(-2, y * 20, 12, 20, y * 0.5, 0, Math.PI * 2);
        g.fillStyle = 'rgba(210, 240, 255, 0.85)';
        g.fill();
        outline(3);
      }
      g.beginPath();
      g.ellipse(-14, 0, 22, 13, 0, 0, Math.PI * 2);
      g.fillStyle = '#ffd23a';
      g.fill();
      outline();
      g.fillStyle = '#1a0620';
      for (const x of [-26, -16, -6]) g.fillRect(x, -12, 5, 24);
      g.beginPath();
      g.arc(16, 0, 13, 0, Math.PI * 2);
      g.fillStyle = grad(g, '#ffe07a', '#c07a10');
      g.fill();
      outline();
      for (const y of [-6, 6]) {
        g.beginPath();
        g.arc(21, y, 4.5, 0, Math.PI * 2);
        g.fillStyle = '#ff3a3a';
        g.fill();
        outline(2);
      }
      g.beginPath();
      g.moveTo(-36, 0);
      g.lineTo(-46, 0);
      outline(4);
      break;
    }
    case 'tempoShift': {
      // Horology: a clock face, its hands spun back.
      g.beginPath();
      g.arc(0, 0, 34, 0, Math.PI * 2);
      g.fillStyle = grad(g, '#ffe07a', '#c07a10');
      g.fill();
      outline();
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.fillStyle = '#fff6e0';
      g.fill();
      outline(3);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
        g.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
        outline(3);
      }
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-12, -12);
      g.moveTo(0, 0);
      g.lineTo(0, -20);
      outline(5);
      g.beginPath();
      g.arc(0, 0, 30, -Math.PI * 0.9, -Math.PI * 0.4);
      g.strokeStyle = '#ff4a8a';
      g.lineWidth = 4;
      g.stroke();
      break;
    }
    case 'wooCannon': {
      // A cannon shell flying up and right, fins behind, a face shouting WOO.
      g.rotate(-Math.PI / 7);
      for (const y of [-1, 1]) {
        g.beginPath();
        g.moveTo(-30, y * 10);
        g.lineTo(-42, y * 26);
        g.lineTo(-20, y * 14);
        g.closePath();
        g.fillStyle = y < 0 ? '#3adcff' : '#ff5ad0';
        g.fill();
        outline(3);
      }
      g.beginPath();
      g.moveTo(-34, -18);
      g.lineTo(10, -18);
      g.arc(10, 0, 18, -Math.PI / 2, Math.PI / 2);
      g.lineTo(-34, 18);
      g.closePath();
      g.fillStyle = grad(g, '#b47aff', '#4a1a8a');
      g.fill();
      outline();
      g.fillStyle = '#ffd23a';
      g.fillRect(-14, -18, 7, 36);
      g.beginPath();
      g.arc(14, -6, 5, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      outline(2);
      g.beginPath();
      g.ellipse(18, 7, 4, 5, 0, 0, Math.PI * 2);
      g.fillStyle = '#2a0610';
      g.fill();
      g.font = 'italic 900 15px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = '#1a0620';
      g.strokeText('WOO', -24, 40);
      g.fillStyle = '#ffd23a';
      g.fillText('WOO', -24, 40);
      break;
    }
    case 'fluteFlurry': {
      // Sleep Drifter: a flute, notes and Zs drifting off it.
      g.rotate(-Math.PI / 5);
      roundRect(g, -40, -6, 80, 12, 6);
      g.fillStyle = grad(g, '#f4f0ff', '#8a90b0');
      g.fill();
      outline();
      g.fillStyle = '#1a0620';
      for (const x of [-18, -6, 6, 18]) {
        g.beginPath();
        g.arc(x, 0, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.rotate(Math.PI / 5);
      g.font = '900 20px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = '#1a0620';
      for (const [t, x, y] of [['z', 10, -18], ['Z', 26, -34]] as const) {
        g.strokeText(t, x, y);
        g.fillStyle = '#7dffd8';
        g.fillText(t, x, y);
      }
      break;
    }
    case 'drumRoll': {
      // Road Train: a bass drum with a bull bar across the front.
      g.beginPath();
      g.arc(0, 4, 30, 0, Math.PI * 2);
      g.fillStyle = grad(g, '#ff5a4a', '#8a101c');
      g.fill();
      outline();
      g.beginPath();
      g.arc(0, 4, 22, 0, Math.PI * 2);
      g.fillStyle = '#f4f0e0';
      g.fill();
      outline(3);
      roundRect(g, -40, 18, 80, 12, 5);
      g.fillStyle = grad(g, '#f0f0f8', '#7a7a90');
      g.fill();
      outline(3);
      for (const x of [-26, 0, 26]) {
        g.beginPath();
        g.moveTo(x, 18);
        g.lineTo(x, 2);
        outline(5);
      }
      break;
    }
    case 'bassDrop': {
      // Superheavy: a bass cab with an arrow dropping through it.
      roundRect(g, -30, -36, 60, 72, 8);
      g.fillStyle = grad(g, '#5a3a2a', '#24140c');
      g.fill();
      outline();
      for (const y of [-14, 14]) {
        g.beginPath();
        g.arc(0, y, 12, 0, Math.PI * 2);
        g.fillStyle = '#2a2a30';
        g.fill();
        outline(3);
      }
      g.beginPath();
      g.moveTo(-10, -10);
      g.lineTo(10, -10);
      g.lineTo(10, 10);
      g.lineTo(20, 10);
      g.lineTo(0, 32);
      g.lineTo(-20, 10);
      g.lineTo(-10, 10);
      g.closePath();
      g.fillStyle = '#b86aff';
      g.fill();
      outline(3);
      break;
    }
    case 'patchCable': {
      // The Silver Cord: a silver cable looping between two jacks.
      g.beginPath();
      g.moveTo(-28, 24);
      g.bezierCurveTo(-40, -40, 40, -40, 28, 24);
      g.lineWidth = 10;
      g.strokeStyle = '#1a0620';
      g.stroke();
      g.lineWidth = 6;
      g.strokeStyle = '#d8e0f0';
      g.stroke();
      for (const x of [-28, 28]) {
        roundRect(g, x - 7, 20, 14, 18, 3);
        g.fillStyle = grad(g, '#ffffff', '#8a90a8');
        g.fill();
        outline(3);
      }
      break;
    }
    case 'harmonicaWail': {
      // Boogieman Sam: a harmonica blowing a gust.
      roundRect(g, -34, -12, 68, 24, 5);
      g.fillStyle = grad(g, '#f0f0f8', '#7a7a90');
      g.fill();
      outline();
      g.fillStyle = '#1a0620';
      for (let i = 0; i < 7; i++) g.fillRect(-28 + i * 8.5, -4, 5, 8);
      g.beginPath();
      for (const y of [-24, -32]) {
        g.moveTo(-20, y);
        g.quadraticCurveTo(0, y - 8, 20, y);
      }
      g.lineWidth = 4;
      g.strokeStyle = '#80c0ff';
      g.stroke();
      break;
    }
    case 'keytarLaser': {
      // Gamma Knife: a keytar firing a beam.
      g.beginPath();
      g.moveTo(-6, -6);
      g.lineTo(44, -6);
      g.lineWidth = 9;
      g.strokeStyle = '#ff2ad0';
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.rotate(-0.15);
      roundRect(g, -40, -4, 46, 22, 6);
      g.fillStyle = grad(g, '#3aa04a', '#14501e');
      g.fill();
      outline();
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) g.fillRect(-35 + i * 6.5, 4, 5, 11);
      break;
    }
    case 'gizzardWave': {
      // Nonagon Infinity: a nine-sided ring, an endless loop.
      for (const [r, w, col] of [[30, 12, '#1a0620'], [30, 7, '#30ff90']] as const) {
        g.beginPath();
        for (let i = 0; i <= 9; i++) {
          const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.lineWidth = w;
        g.strokeStyle = col;
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fillStyle = '#ffd23a';
      g.fill();
      outline(3);
      break;
    }
  }
  return c.toDataURL();
}

/** A curved yellow banana, fretted like a guitar neck. */
function banana(g: CanvasRenderingContext2D, outline: (w?: number) => void): void {
  g.beginPath();
  g.moveTo(-34, -20);
  g.bezierCurveTo(-30, 30, 30, 34, 38, -6);
  g.bezierCurveTo(24, 16, -16, 12, -24, -24);
  g.closePath();
  g.fillStyle = grad(g, '#fff27a', '#e0a010');
  g.fill();
  outline();
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const x = -30 + t * 64;
    const y = -12 + Math.sin(t * Math.PI) * 30 - t * 6;
    g.beginPath();
    g.moveTo(x - 3, y - 5);
    g.lineTo(x + 3, y + 3);
    g.lineWidth = 2;
    g.strokeStyle = '#8a5a10';
    g.stroke();
  }
  g.beginPath();
  g.arc(-29, -22, 4, 0, Math.PI * 2);
  g.fillStyle = '#5a3a10';
  g.fill();
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
