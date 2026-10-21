import type { Track } from '../tracks/track';

const SIZE = 180;

/** Top-down track outline with a marker per kart. */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private scale = 1;
  private cx = 0;
  private cz = 0;

  constructor() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.base]) {
      c.width = c.height = SIZE * dpr;
    }
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.canvas.className = 'hud-minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
  }

  setTrack(track: Track): void {
    // Framed to every road, so a kart out on a shortcut stays on the map, but only the main road is drawn: shortcuts are for finding.
    const ribbons = [track.main, ...track.branches];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of ribbons) {
      for (let i = 0; i < r.spline.count; i++) {
        minX = Math.min(minX, r.spline.px[i]);
        maxX = Math.max(maxX, r.spline.px[i]);
        minZ = Math.min(minZ, r.spline.pz[i]);
        maxZ = Math.max(maxZ, r.spline.pz[i]);
      }
    }
    this.cx = (minX + maxX) / 2;
    this.cz = (minZ + maxZ) / 2;
    this.scale = (SIZE - 24) / Math.max(maxX - minX, maxZ - minZ);

    const dpr = this.base.width / SIZE;
    const ctx = this.base.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [width, color] of [
      [9, 'rgba(40,10,50,0.85)'],
      [5, '#fff6dc'],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      const sp = track.main.spline;
      for (let i = 0; i < sp.count; i++) {
        const [x, y] = this.project(sp.px[i], sp.pz[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (sp.closed) ctx.closePath();
      ctx.stroke();
    }
    const [sx, sy] = this.project(track.spline.px[0], track.spline.pz[0]);
    ctx.fillStyle = '#111';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
  }

  /** Mirrors x so the map reads like the driver's left/right. */
  private project(x: number, z: number): [number, number] {
    return [SIZE / 2 - (x - this.cx) * this.scale, SIZE / 2 - (z - this.cz) * this.scale];
  }

  draw(karts: { x: number; z: number; color: string; player: boolean }[]): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.base, 0, 0, SIZE, SIZE);
    for (const k of karts) {
      const [x, y] = this.project(k.x, k.z);
      ctx.beginPath();
      ctx.arc(x, y, k.player ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = k.player ? '#fff' : '#222';
      ctx.stroke();
    }
  }
}
