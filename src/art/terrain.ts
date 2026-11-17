export interface TerrainSource {
  cols: number;
  rows: number;
  walkable: Uint8Array;
  buildable: Uint8Array;
  waypoints: { x: number; y: number; w: number; h: number }[];
  cell: number;
}

const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const valueNoise = (x: number, y: number, seed: number) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const fbm = (x: number, y: number, seed: number, octaves = 4) => {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) { v += valueNoise(x * f, y * f, seed + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
};
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const smoothstep = (e0: number, e1: number, x: number) => smooth(Math.min(1, Math.max(0, (x - e0) / (e1 - e0))));

const GRASS_DARK = [52, 88, 44];
const GRASS_LIGHT = [92, 132, 58];
const GRASS_DRY = [122, 128, 64];
const DIRT = [146, 118, 80];
const DIRT_DARK = [104, 82, 54];
const DIRT_RIM = [78, 64, 42];

export function terrain(src: TerrainSource, px: number): HTMLCanvasElement {
  const { cols, rows } = src;
  const W = cols * px;
  const H = rows * px;
  const wall = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows ? false : !src.walkable[y * cols + x];
  const dirtAt = (x: number, y: number) => {
    const cx = Math.min(cols - 1, Math.max(0, x)), cy = Math.min(rows - 1, Math.max(0, y));
    const i = cy * cols + cx;
    return src.walkable[i] && !src.buildable[i] ? 1 : 0;
  };

  const LR = 4;
  const low = document.createElement('canvas');
  low.width = cols * LR;
  low.height = rows * LR;
  const lctx = low.getContext('2d')!;
  const img = lctx.createImageData(low.width, low.height);
  for (let v = 0; v < low.height; v++) {
    for (let u = 0; u < low.width; u++) {
      const gx = (u + 0.5) / LR - 0.5;
      const gy = (v + 0.5) / LR - 0.5;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = gx - ix, fy = gy - iy;
      const d = dirtAt(ix, iy) * (1 - fx) * (1 - fy) + dirtAt(ix + 1, iy) * fx * (1 - fy) + dirtAt(ix, iy + 1) * (1 - fx) * fy + dirtAt(ix + 1, iy + 1) * fx * fy;
      const n = fbm(gx * 0.9, gy * 0.9, 7);
      const dirt = smoothstep(0.42, 0.62, d + (n - 0.5) * 0.45);
      const patch = fbm(gx * 0.12, gy * 0.12, 3);
      const dry = smoothstep(0.55, 0.75, fbm(gx * 0.07 + 40, gy * 0.07, 11));
      let grass = mixRgb(GRASS_DARK, GRASS_LIGHT, smoothstep(0.25, 0.8, patch));
      grass = mixRgb(grass, GRASS_DRY, dry * 0.55);
      grass = mixRgb(grass, GRASS_DARK, (fbm(gx * 1.7, gy * 1.7, 5) - 0.5) * 0.6 + 0.15);
      let ground = mixRgb(DIRT, DIRT_DARK, fbm(gx * 0.6, gy * 0.6, 9));
      ground = mixRgb(ground, DIRT_RIM, smoothstep(0.35, 0, Math.abs(dirt - 0.5)) * 0.5);
      const c = mixRgb(grass, ground, dirt);
      const o = (v * low.width + u) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(low, 0, 0, W, H);

  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const nearWall = (x: number, y: number) => wall(x, y) || wall(x + 1, y) || wall(x - 1, y) || wall(x, y + 1) || wall(x, y - 1);
  const lw = Math.max(1, px * 0.06);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!src.walkable[i]) continue;
      if (src.buildable[i]) {
        const density = fbm(x * 0.15, y * 0.15, 21);
        const tufts = rnd() < 0.35 + density * 0.4 ? 1 + Math.round(density * 1.5) : 0;
        for (let k = 0; k < tufts; k++) {
          const bx = (x + rnd()) * px, by = (y + rnd()) * px;
          const light = rnd() < 0.55;
          ctx.strokeStyle = light ? 'rgba(140,180,90,0.32)' : 'rgba(24,44,20,0.3)';
          ctx.lineWidth = lw;
          ctx.beginPath();
          for (let b = -1; b <= 1; b++) { ctx.moveTo(bx + b * px * 0.06, by); ctx.lineTo(bx + b * px * 0.12 + (rnd() - 0.5) * px * 0.05, by - px * (0.18 + rnd() * 0.14)); }
          ctx.stroke();
        }
        if (density > 0.66 && rnd() < 0.05 && !nearWall(x, y)) {
          const colors = ['#f4f0e0', '#ffd75a', '#c79bff', '#ff9ab0'];
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          for (let f = 0; f < 3; f++) { ctx.beginPath(); ctx.arc((x + rnd()) * px, (y + rnd()) * px, px * 0.06, 0, Math.PI * 2); ctx.fill(); }
        }
      } else if (rnd() < 0.3) {
        const r = px * (0.05 + rnd() * 0.09);
        const pxx = (x + rnd()) * px, pyy = (y + rnd()) * px;
        ctx.fillStyle = 'rgba(40,30,18,0.35)';
        ctx.beginPath(); ctx.ellipse(pxx + r * 0.3, pyy + r * 0.4, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rnd() < 0.5 ? '#b8a684' : '#8f8068';
        ctx.beginPath(); ctx.ellipse(pxx, pyy, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.ellipse(pxx - r * 0.3, pyy - r * 0.3, r * 0.4, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const k = px / src.cell;
  src.waypoints.forEach((wp, i) => {
    if (i === 0 || i === src.waypoints.length - 1) return;
    const cx = (wp.x + wp.w / 2) * k, cy = (wp.y + wp.h / 2) * k, r = px * 1.25;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
    g.addColorStop(0, 'rgba(140,180,255,0.35)');
    g.addColorStop(1, 'rgba(140,180,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(180,210,255,0.75)';
    ctx.lineWidth = Math.max(1, px * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([px * 0.25, px * 0.2]);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8f0ff';
    ctx.font = `700 ${Math.round(px * 0.95)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = px * 0.3;
    ctx.fillText(String(i), cx, cy + px * 0.05);
    ctx.shadowBlur = 0;
  });

  const height = px * 0.6;
  const shadow = document.createElement('canvas');
  shadow.width = W;
  shadow.height = H;
  const sctx = shadow.getContext('2d')!;
  sctx.fillStyle = '#000';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (wall(x, y)) sctx.fillRect(x * px, y * px, px, px);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.filter = `blur(${Math.max(1, px * 0.35)}px)`;
  ctx.drawImage(shadow, px * 0.3, px * 0.45);
  ctx.restore();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!wall(x, y) || wall(x, y + 1)) continue;
      const g = ctx.createLinearGradient(0, (y + 1) * px - height, 0, (y + 1) * px);
      g.addColorStop(0, '#3a3e48');
      g.addColorStop(1, '#1c1e24');
      ctx.fillStyle = g;
      ctx.fillRect(x * px, (y + 1) * px - height, px, height);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x * px + (y % 2 ? px * 0.5 : 0), (y + 1) * px - height, Math.max(1, px * 0.05), height);
    }
    for (let x = 0; x < cols; x++) {
      if (!wall(x, y)) continue;
      const tx = x * px, ty = y * px - height;
      const shadeV = 0.92 + fbm(x * 0.5, y * 0.5, 31) * 0.16;
      const moss = smoothstep(0.55, 0.8, fbm(x * 0.22, y * 0.22, 41));
      const base = mixRgb([84, 88, 100], [70, 92, 62], moss * 0.6).map((c) => Math.round(c * shadeV));
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.fillRect(tx, ty, px, px);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      const row = Math.floor(y * 2);
      ctx.fillRect(tx, ty + px * 0.5 - lw / 2, px, lw);
      ctx.fillRect(tx + (row % 2 ? px * 0.5 : 0), ty, lw, px * 0.5);
      ctx.fillRect(tx + (row % 2 ? 0 : px * 0.5), ty + px * 0.5, lw, px * 0.5);
      if (!wall(x, y - 1)) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(tx, ty, px, Math.max(1, px * 0.1)); }
      if (!wall(x - 1, y)) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(tx, ty, Math.max(1, px * 0.08), px); }
      if (!wall(x + 1, y)) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx + px - Math.max(1, px * 0.08), ty, Math.max(1, px * 0.08), px); }
    }
  }

  const edge = px * 3;
  const edges: [number, number, number, number, number, number, number, number][] = [
    [0, 0, W, edge, 0, 0, 0, edge], [0, H - edge, W, edge, 0, H, 0, H - edge],
    [0, 0, edge, H, 0, 0, edge, 0], [W - edge, 0, edge, H, W, 0, W - edge, 0],
  ];
  for (const [x, y, w, h, x0, y0, x1, y1] of edges) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(8,10,14,0.65)');
    g.addColorStop(1, 'rgba(8,10,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  return out;
}
