import { TOWERS, WAVES, type TowerDef } from '../core/data';

export { terrain } from './terrain';

export const TEX_CELL = 32;

export type Family =
  | 'defense' | 'ground' | 'aa' | 'snare' | 'frost' | 'facility' | 'super' | 'minigun'
  | 'shrapnel' | 'death' | 'storm' | 'pulse' | 'fire' | 'cube';

const FAMILY_LINES: Partial<Record<Family, string[]>> = {
  defense: ['oC33', 'oC36', 'oC08', 'oC39', 'oC01'],
  ground: ['oC35', 'oC34', 'oC07', 'oC38', 'hC44'],
  aa: ['oC40', 'hC42', 'oC41'],
  super: ['h000', 'h001', 'h003', 'h002', 'h004', 'h005', 'h006', 'h007'],
};
const SINGLE: Record<string, Family> = {
  oC48: 'snare', oC45: 'frost', hC09: 'facility', e000: 'minigun', oC43: 'shrapnel',
  oC47: 'death', oC02: 'storm', oC46: 'pulse', oC03: 'fire', oC49: 'cube',
};

export function familyOf(id: string): { family: Family; tier: number; tiers: number } {
  if (SINGLE[id]) return { family: SINGLE[id], tier: 0, tiers: 1 };
  for (const [family, line] of Object.entries(FAMILY_LINES) as [Family, string[]][]) {
    const tier = line.indexOf(id);
    if (tier >= 0) return { family, tier, tiers: line.length };
  }
  return { family: 'defense', tier: 0, tiers: 1 };
}

export const AIMS: Record<Family, 'aim' | 'spin' | 'none'> = {
  defense: 'aim', ground: 'aim', aa: 'aim', minigun: 'aim', shrapnel: 'aim', super: 'none',
  snare: 'none', frost: 'spin', facility: 'none', death: 'none', storm: 'spin', pulse: 'spin', fire: 'none', cube: 'spin',
};

export type ProjectileKind = 'arrow' | 'rock' | 'bolt' | 'shard' | 'orb' | 'fireball' | 'bullet' | 'shell' | 'lightning' | 'beam';

export const PROJECTILES: Record<Family, ProjectileKind> = {
  defense: 'arrow', ground: 'rock', aa: 'bolt', snare: 'orb', frost: 'shard', facility: 'orb', super: 'orb',
  minigun: 'bullet', shrapnel: 'shell', death: 'orb', storm: 'lightning', pulse: 'orb', fire: 'fireball', cube: 'beam',
};

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const shade = (hex: string, amt: number) => {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

type Ctx = CanvasRenderingContext2D;
const make = (w: number, h: number, fn: (ctx: Ctx, w: number, h: number) => void): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext('2d')!;
  fn(ctx, w, h);
  return c;
};

const rrect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
const circ = (ctx: Ctx, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
const radial = (ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) => {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
const outline = (ctx: Ctx, w = 1.5, color = 'rgba(0,0,0,0.55)') => { ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); };

const STONE_BY_TIER = ['#6e5a42', '#7b6a54', '#7b7f88', '#8c93a2', '#a3aabb'];

export function towerBase(def: TowerDef): HTMLCanvasElement {
  const { family, tier, tiers } = familyOf(def.id);
  const S = def.size * TEX_CELL;
  return make(S, S, (ctx) => {
    const r = rng(def.id.charCodeAt(1) * 97 + def.id.charCodeAt(3));
    const inset = S * 0.06;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rrect(ctx, inset + S * 0.05, inset + S * 0.07, S - inset * 2, S - inset * 2, S * 0.12);
    ctx.fill();
    if (family === 'facility') return facility(ctx, S, def);
    const stone = FAMILY_LINES[family] ? STONE_BY_TIER[Math.min(4, Math.round((tier / Math.max(1, tiers - 1)) * 4))] : '#5d6272';
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, shade(stone, 0.25));
    g.addColorStop(1, shade(stone, -0.35));
    ctx.fillStyle = g;
    rrect(ctx, inset, inset, S - inset * 2, S - inset * 2, S * 0.12);
    ctx.fill();
    outline(ctx, S * 0.03);
    ctx.save();
    rrect(ctx, inset, inset, S - inset * 2, S - inset * 2, S * 0.12);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const bricks = def.size * 3;
    for (let i = 1; i < bricks; i++) {
      const y = inset + ((S - inset * 2) * i) / bricks;
      ctx.beginPath(); ctx.moveTo(inset, y); ctx.lineTo(S - inset, y); ctx.stroke();
      for (let j = 0; j < bricks; j++) {
        const x = inset + ((S - inset * 2) * (j + (i % 2) * 0.5)) / bricks;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (S - inset * 2) / bricks); ctx.stroke();
      }
    }
    if (FAMILY_LINES[family] && tier === 0) {
      ctx.strokeStyle = 'rgba(20,10,0,0.6)';
      ctx.lineWidth = S * 0.025;
      for (let k = 0; k < 3; k++) {
        let x = inset + r() * (S - inset * 2);
        let y = inset + r() * (S - inset * 2);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) { x += (r() - 0.5) * S * 0.25; y += (r() - 0.5) * S * 0.25; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = S * 0.025;
    ctx.beginPath(); ctx.moveTo(inset * 1.6, S - inset * 2); ctx.lineTo(inset * 1.6, inset * 1.6); ctx.lineTo(S - inset * 2, inset * 1.6); ctx.stroke();
    circ(ctx, S / 2, S / 2, S * 0.3);
    ctx.fillStyle = radial(ctx, S / 2, S / 2, S * 0.3, [[0, shade(def.color, -0.1)], [1, shade(def.color, -0.6)]]);
    ctx.fill();
    outline(ctx, S * 0.025);
    if (FAMILY_LINES[family] && tier >= tiers - 2 && tiers > 1) {
      ctx.strokeStyle = tier === tiers - 1 ? '#f2c94c' : '#c0c6d0';
      ctx.lineWidth = S * 0.035;
      rrect(ctx, inset * 1.5, inset * 1.5, S - inset * 3, S - inset * 3, S * 0.1);
      ctx.stroke();
    }
    if (FAMILY_LINES[family]) {
      const n = tier + 1;
      const pip = S * 0.045;
      const total = n * pip * 2.6;
      for (let i = 0; i < n; i++) {
        circ(ctx, S / 2 - total / 2 + pip * 1.3 + i * pip * 2.6, S - inset * 2.2, pip);
        ctx.fillStyle = '#ffd34d';
        ctx.fill();
        outline(ctx, 1, 'rgba(0,0,0,0.6)');
      }
    }
    for (const [cx, cy] of [[inset * 2, inset * 2], [S - inset * 2, inset * 2], [inset * 2, S - inset * 2], [S - inset * 2, S - inset * 2]]) {
      circ(ctx, cx, cy, S * 0.025);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
    }
  });
}

function facility(ctx: Ctx, S: number, def: TowerDef) {
  const inset = S * 0.06;
  ctx.fillStyle = '#6a4a2a';
  rrect(ctx, inset, inset, S - inset * 2, S - inset * 2, S * 0.06);
  ctx.fill();
  outline(ctx, S * 0.02);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 8; i++) {
    const y = inset + ((S - inset * 2) * i) / 8;
    ctx.beginPath(); ctx.moveTo(inset, y); ctx.lineTo(S - inset, y); ctx.stroke();
  }
  const cx = S / 2;
  const cy = S / 2;
  const teeth = 10;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? S * 0.26 : S * 0.32;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, cx, cy, S * 0.32, [[0, shade(def.color, 0.4)], [1, shade(def.color, -0.3)]]);
  ctx.fill();
  outline(ctx, S * 0.02);
  circ(ctx, cx, cy, S * 0.1);
  ctx.fillStyle = '#3a2a1a';
  ctx.fill();
}

export function towerTurret(def: TowerDef): HTMLCanvasElement | null {
  const { family, tier, tiers } = familyOf(def.id);
  if (family === 'facility') return null;
  const S = def.size * TEX_CELL;
  const t = tiers > 1 ? tier / (tiers - 1) : 1;
  const c = def.color;
  return make(S, S, (ctx) => {
    const m = S / 2;
    ctx.translate(m, m);
    const k = S / 64;
    ctx.scale(k, k);
    switch (family) {
      case 'defense': {
        const wood = t < 0.5 ? '#8a5a2b' : t < 0.9 ? '#7d8796' : '#d8b84a';
        const len = 18 + t * 8;
        ctx.fillStyle = shade(wood, -0.2);
        rrect(ctx, -8, -4, len + 8, 8, 3); ctx.fill(); outline(ctx);
        ctx.strokeStyle = wood;
        ctx.lineWidth = 4 + t * 2;
        ctx.beginPath(); ctx.arc(-4, 0, 16 + t * 4, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(10 + t * 6, -10 - t * 2.5); ctx.lineTo(-6, 0); ctx.lineTo(10 + t * 6, 10 + t * 2.5); ctx.stroke();
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath(); ctx.moveTo(len + 6, 0); ctx.lineTo(len - 2, -4); ctx.lineTo(len - 2, 4); ctx.closePath(); ctx.fill();
        circ(ctx, -6, 0, 6); ctx.fillStyle = shade(c, 0.1); ctx.fill(); outline(ctx);
        break;
      }
      case 'ground': {
        const r = 11 + t * 4;
        circ(ctx, 0, 0, r); ctx.fillStyle = radial(ctx, 0, 0, r, [[0, shade(c, 0.3)], [1, shade(c, -0.5)]]); ctx.fill(); outline(ctx);
        ctx.fillStyle = shade('#555a66', t * 0.3);
        rrect(ctx, 2, -6 - t * 2, 18 + t * 6, 12 + t * 4, 4); ctx.fill(); outline(ctx);
        circ(ctx, 20 + t * 6, 0, 5 + t * 2); ctx.fillStyle = '#1a1a1a'; ctx.fill();
        if (t >= 1) { ctx.fillStyle = '#ff6a2a'; circ(ctx, 0, 0, 4); ctx.fill(); }
        break;
      }
      case 'aa': {
        const len = 22 + t * 8;
        for (const y of [-5, 5]) { ctx.fillStyle = shade('#9fb4c4', -0.2 + t * 0.2); rrect(ctx, -2, y - 2.5, len, 5, 2); ctx.fill(); outline(ctx, 1); }
        ctx.strokeStyle = shade(c, -0.2);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(4, 0, 15, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
        circ(ctx, -2, 0, 9); ctx.fillStyle = radial(ctx, -2, 0, 9, [[0, shade(c, 0.4)], [1, shade(c, -0.4)]]); ctx.fill(); outline(ctx);
        break;
      }
      case 'super': {
        const h = 14 + t * 10;
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(h * 0.55, 0); ctx.lineTo(0, h); ctx.lineTo(-h * 0.55, 0); ctx.closePath();
        const g = ctx.createLinearGradient(-h, -h, h, h); g.addColorStop(0, shade(c, 0.6)); g.addColorStop(1, shade(c, -0.5));
        ctx.fillStyle = g; ctx.fill(); outline(ctx);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.moveTo(-h * 0.55, 0); ctx.lineTo(h * 0.55, 0); ctx.stroke();
        const gems = tier + 1;
        for (let i = 0; i < gems; i++) {
          const a = (i / gems) * Math.PI * 2;
          circ(ctx, Math.cos(a) * 24, Math.sin(a) * 24, 2.6); ctx.fillStyle = '#ffe9ff'; ctx.fill(); outline(ctx, 0.8);
        }
        break;
      }
      case 'snare': {
        circ(ctx, 0, 0, 16); ctx.fillStyle = radial(ctx, 0, 0, 16, [[0, '#e6ffb0'], [0.5, c], [1, shade(c, -0.6)]]); ctx.fill(); outline(ctx);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.stroke(); }
        for (const r of [8, 14, 20]) { circ(ctx, 0, 0, r); ctx.stroke(); }
        break;
      }
      case 'frost': {
        for (let i = 0; i < 6; i++) {
          ctx.save(); ctx.rotate((i / 6) * Math.PI * 2);
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(22, 0); ctx.lineTo(0, 4); ctx.closePath();
          ctx.fillStyle = i % 2 ? '#dff8ff' : c; ctx.fill(); outline(ctx, 1, 'rgba(0,40,80,0.6)');
          ctx.restore();
        }
        circ(ctx, 0, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); outline(ctx, 1, 'rgba(0,40,80,0.6)');
        break;
      }
      case 'minigun': {
        ctx.fillStyle = '#8a8f99'; rrect(ctx, -12, -11, 18, 22, 5); ctx.fill(); outline(ctx);
        for (const y of [-6, 0, 6]) { ctx.fillStyle = '#c8ccd4'; rrect(ctx, 4, y - 2.2, 22, 4.4, 2); ctx.fill(); outline(ctx, 1); }
        ctx.fillStyle = '#333'; rrect(ctx, 22, -9, 4, 18, 1); ctx.fill();
        break;
      }
      case 'shrapnel': {
        ctx.fillStyle = '#6c7078'; rrect(ctx, -14, -13, 24, 26, 6); ctx.fill(); outline(ctx);
        for (const a of [-0.3, 0, 0.3]) {
          ctx.save(); ctx.rotate(a); ctx.fillStyle = '#4a4d55'; rrect(ctx, 4, -3.5, 22, 7, 3); ctx.fill(); outline(ctx, 1);
          circ(ctx, 26, 0, 2.8); ctx.fillStyle = '#111'; ctx.fill(); ctx.restore();
        }
        break;
      }
      case 'death': {
        circ(ctx, 0, 0, 18); ctx.fillStyle = radial(ctx, 0, 0, 18, [[0, '#8a5ab0'], [0.7, '#2a1a3a'], [1, '#100818']]); ctx.fill(); outline(ctx);
        ctx.fillStyle = '#e8e0f0';
        ell(ctx, 0, -2, 10, 11); ctx.fill();
        ctx.fillStyle = '#1a0a24';
        circ(ctx, -4, -3, 3); ctx.fill(); circ(ctx, 4, -3, 3); ctx.fill();
        ctx.fillRect(-5, 5, 10, 2.5);
        ctx.fillStyle = '#b070ff'; circ(ctx, -4, -3, 1.2); ctx.fill(); circ(ctx, 4, -3, 1.2); ctx.fill();
        break;
      }
      case 'storm': {
        for (const [r, a] of [[22, 0.35], [16, 0.6], [10, 0.9]] as const) {
          circ(ctx, 0, 0, r); ctx.strokeStyle = `rgba(130,160,255,${a})`; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
          ctx.lineTo(Math.cos(a + 0.3) * 13, Math.sin(a + 0.3) * 13); ctx.lineTo(Math.cos(a - 0.1) * 20, Math.sin(a - 0.1) * 20); ctx.stroke();
        }
        circ(ctx, 0, 0, 6); ctx.fillStyle = radial(ctx, 0, 0, 6, [[0, '#ffffff'], [1, c]]); ctx.fill();
        break;
      }
      case 'pulse': {
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.rotate((i / 3) * Math.PI * 2);
          ctx.fillStyle = shade(c, -0.3); rrect(ctx, 8, -4, 14, 8, 3); ctx.fill(); outline(ctx, 1);
          ctx.restore();
        }
        circ(ctx, 0, 0, 12); ctx.fillStyle = radial(ctx, 0, 0, 12, [[0, '#e0fff2'], [0.6, c], [1, shade(c, -0.5)]]); ctx.fill(); outline(ctx);
        circ(ctx, 0, 0, 18); ctx.strokeStyle = 'rgba(160,255,220,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        break;
      }
      case 'fire': {
        circ(ctx, 0, 0, 20); ctx.fillStyle = '#2a2220'; ctx.fill(); outline(ctx);
        for (let i = 0; i < 8; i++) {
          ctx.save(); ctx.rotate((i / 8) * Math.PI * 2 + 0.2);
          ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(14, -6, 17, 0); ctx.quadraticCurveTo(14, 6, 0, 5); ctx.closePath();
          ctx.fillStyle = i % 2 ? '#ff9a30' : '#ff5020'; ctx.fill();
          ctx.restore();
        }
        circ(ctx, 0, 0, 8); ctx.fillStyle = radial(ctx, 0, 0, 8, [[0, '#fffbe0'], [1, '#ffc040']]); ctx.fill();
        break;
      }
      case 'cube': {
        const s = 16;
        const top: [number, number][] = [[0, -s], [s * 0.87, -s / 2], [0, 0], [-s * 0.87, -s / 2]];
        const left: [number, number][] = [[-s * 0.87, -s / 2], [0, 0], [0, s], [-s * 0.87, s / 2]];
        const right: [number, number][] = [[s * 0.87, -s / 2], [0, 0], [0, s], [s * 0.87, s / 2]];
        for (const [pts, col] of [[top, shade(c, 0.5)], [left, shade(c, -0.1)], [right, shade(c, -0.45)]] as const) {
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
          ctx.fillStyle = col; ctx.fill(); outline(ctx, 1.2, 'rgba(0,30,40,0.7)');
        }
        circ(ctx, 0, 0, 26); ctx.strokeStyle = 'rgba(120,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        break;
      }
    }
  });
}

type Arch = 'humanoid' | 'beast' | 'flyer' | 'blob' | 'wisp' | 'tree' | 'robot';
interface CreepLook { arch: Arch; body: string; accent: string; extras?: string[] }

const LOOKS: Record<string, CreepLook> = {
  hC26: { arch: 'humanoid', body: '#7fb35a', accent: '#f0c8a0' },
  hC27: { arch: 'humanoid', body: '#5a9a3a', accent: '#f0c8a0', extras: ['sword'] },
  hC28: { arch: 'humanoid', body: '#9aa0aa', accent: '#f0c8a0', extras: ['helmet', 'sword'] },
  nC51: { arch: 'flyer', body: '#c07ab0', accent: '#e8b0d8' },
  hC30: { arch: 'humanoid', body: '#3a6ab0', accent: '#f0c8a0', extras: ['sword', 'shield'] },
  hC31: { arch: 'humanoid', body: '#2a4a90', accent: '#c8ccd8', extras: ['helmet', 'sword', 'shield'] },
  lvl7: { arch: 'humanoid', body: '#4a8a3a', accent: '#3a6a2a', extras: ['axe', 'tusks'] },
  lvl8: { arch: 'flyer', body: '#6a6a7a', accent: '#4a4a5a', extras: ['horns'] },
  lvl9: { arch: 'humanoid', body: '#2a2030', accent: '#5a3a6a', extras: ['hood'] },
  lv10: { arch: 'beast', body: '#8a5a3a', accent: '#e8e0d0', extras: ['horns'] },
  lv11: { arch: 'humanoid', body: '#6aaa3a', accent: '#8ac850', extras: ['ears', 'dagger'] },
  lv12: { arch: 'flyer', body: '#4a6a8a', accent: '#8ab0d0', extras: ['tail'] },
  lv13: { arch: 'beast', body: '#a08a6a', accent: '#d0c0a0', extras: ['big', 'horns'] },
  lv14: { arch: 'humanoid', body: '#8a4aa0', accent: '#d0a0e0', extras: ['ears', 'tail'] },
  lv15: { arch: 'humanoid', body: '#a8b0a0', accent: '#d0d8c8', extras: ['claws'] },
  lv16: { arch: 'flyer', body: '#9ad0f0', accent: '#e0f4ff', extras: ['big', 'tail'] },
  uC32: { arch: 'blob', body: '#b0b8a0', accent: '#d0a0a0', extras: ['stitches', 'big'] },
  lv18: { arch: 'beast', body: '#7a5030', accent: '#a07050', extras: ['mane'] },
  lv19: { arch: 'tree', body: '#6a4a2a', accent: '#4a8a3a' },
  lv20: { arch: 'flyer', body: '#8a4ac0', accent: '#c090f0', extras: ['tail', 'heads'] },
  lv21: { arch: 'wisp', body: '#a0f0ff', accent: '#ffffff' },
  lv22: { arch: 'humanoid', body: '#3a7a5a', accent: '#f0d8b0', extras: ['bow', 'ears'] },
  lv23: { arch: 'humanoid', body: '#5a7a4a', accent: '#8aa070', extras: ['claws', 'stitches'] },
  lv24: { arch: 'flyer', body: '#3a8a3a', accent: '#8ad05a', extras: ['big', 'tail', 'horns'] },
  lv25: { arch: 'beast', body: '#a07040', accent: '#f0c8a0', extras: ['rider', 'mane'] },
  lv26: { arch: 'blob', body: '#c04a4a', accent: '#f08080', extras: ['big'] },
  lv27: { arch: 'beast', body: '#e8eef4', accent: '#a8c8e0', extras: ['mane', 'big'] },
  lv28: { arch: 'flyer', body: '#a07a4a', accent: '#e0c090', extras: ['horns', 'tail', 'big'] },
  lv29: { arch: 'beast', body: '#8a6a4a', accent: '#f0d070', extras: ['beak', 'big'] },
  lv30: { arch: 'robot', body: '#8a8f9a', accent: '#ff3030', extras: ['big'] },
};

export const creepScale = (id: string) => {
  const idx = WAVES.findIndex((w) => w.id === id);
  const boss = idx === 14 || idx === 29;
  return (0.85 + (0.45 * idx) / 29) * (LOOKS[id]?.extras?.includes('big') ? 1.2 : 1) * (boss ? 1.25 : 1);
};

export const CREEP_TEX = 56;

export function creepSprite(id: string): HTMLCanvasElement {
  const look = LOOKS[id] ?? { arch: 'humanoid', body: '#888', accent: '#ccc' };
  const has = (e: string) => look.extras?.includes(e);
  const { body, accent } = look;
  return make(CREEP_TEX, CREEP_TEX, (ctx) => {
    ctx.translate(CREEP_TEX / 2, CREEP_TEX / 2);
    ctx.scale(CREEP_TEX / 56, CREEP_TEX / 56);
    switch (look.arch) {
      case 'humanoid': {
        if (has('tail')) { ctx.strokeStyle = body; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-18, 8, -20, -2); ctx.stroke(); }
        if (has('shield')) { ell(ctx, 2, -13, 6, 4); ctx.fillStyle = '#c0a040'; ctx.fill(); outline(ctx); }
        ell(ctx, -1, 0, 9, 14); ctx.fillStyle = radial(ctx, -1, 0, 14, [[0, shade(body, 0.3)], [1, shade(body, -0.35)]]); ctx.fill(); outline(ctx);
        if (has('sword')) { ctx.strokeStyle = '#e0e4ea'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(20, 13); ctx.stroke(); }
        if (has('axe')) { ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(18, 12); ctx.stroke(); ell(ctx, 18, 12, 3, 6); ctx.fillStyle = '#c8ccd4'; ctx.fill(); outline(ctx, 1); }
        if (has('dagger')) { ctx.strokeStyle = '#d0d4dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(13, 12); ctx.stroke(); }
        if (has('bow')) { ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(8, 0, 14, -1.1, 1.1); ctx.stroke(); }
        if (has('claws')) for (const y of [-12, 12]) { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(14, y * 1.05); ctx.stroke(); }
        const head = has('hood') ? body : accent;
        circ(ctx, 5, 0, 7); ctx.fillStyle = radial(ctx, 5, 0, 7, [[0, shade(head, 0.3)], [1, shade(head, -0.3)]]); ctx.fill(); outline(ctx);
        if (has('helmet')) { ctx.beginPath(); ctx.arc(5, 0, 7.5, Math.PI * 0.5, Math.PI * 1.5); ctx.fillStyle = '#b8bec8'; ctx.fill(); outline(ctx, 1); }
        if (has('hood')) { circ(ctx, 7, 0, 3.5); ctx.fillStyle = '#000'; ctx.fill(); circ(ctx, 8.5, -1.5, 0.9); circ(ctx, 8.5, 1.5, 0.9); ctx.fillStyle = '#c070ff'; ctx.fill(); }
        if (has('ears')) for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(4, s * 5); ctx.lineTo(-1, s * 13); ctx.lineTo(8, s * 6); ctx.closePath(); ctx.fillStyle = accent; ctx.fill(); outline(ctx, 1); }
        if (has('tusks')) for (const s of [-1, 1]) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, s * 2); ctx.lineTo(13, s * 4); ctx.stroke(); }
        if (has('stitches')) { ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(2, 6); ctx.stroke(); }
        break;
      }
      case 'beast': {
        const big = has('big') ? 1.15 : 1;
        ctx.scale(big, big);
        for (const [x, y] of [[-9, -10], [-9, 10], [7, -10], [7, 10]]) { ell(ctx, x, y, 4, 3); ctx.fillStyle = shade(body, -0.4); ctx.fill(); }
        ctx.strokeStyle = shade(body, -0.3); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-22, 3); ctx.stroke();
        ell(ctx, -2, 0, 15, 10); ctx.fillStyle = radial(ctx, -2, 0, 15, [[0, shade(body, 0.3)], [1, shade(body, -0.35)]]); ctx.fill(); outline(ctx);
        if (has('mane')) { ell(ctx, 6, 0, 6, 9); ctx.fillStyle = shade(accent, -0.1); ctx.fill(); }
        if (has('rider')) { circ(ctx, 0, 0, 6); ctx.fillStyle = accent; ctx.fill(); outline(ctx); }
        ell(ctx, 15, 0, 7, 6); ctx.fillStyle = radial(ctx, 15, 0, 7, [[0, shade(body, 0.35)], [1, shade(body, -0.3)]]); ctx.fill(); outline(ctx);
        if (has('horns')) for (const s of [-1, 1]) { ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(15, s * 4); ctx.quadraticCurveTo(14, s * 11, 20, s * 12); ctx.stroke(); }
        if (has('beak')) { ctx.beginPath(); ctx.moveTo(21, -3); ctx.lineTo(27, 0); ctx.lineTo(21, 3); ctx.closePath(); ctx.fillStyle = accent; ctx.fill(); outline(ctx, 1); }
        circ(ctx, 18, -2.5, 1.2); circ(ctx, 18, 2.5, 1.2); ctx.fillStyle = '#111'; ctx.fill();
        break;
      }
      case 'flyer': {
        const big = has('big') ? 1.15 : 1;
        ctx.scale(big, big);
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(4, s * 3); ctx.quadraticCurveTo(-2, s * 26, -14, s * 24); ctx.quadraticCurveTo(-8, s * 14, -8, s * 3); ctx.closePath();
          ctx.fillStyle = shade(accent, -0.1); ctx.fill(); outline(ctx);
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, s * 4); ctx.lineTo(-8, s * 20); ctx.moveTo(-3, s * 4); ctx.lineTo(-12, s * 16); ctx.stroke();
        }
        if (has('tail')) { ctx.strokeStyle = body; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-18, -4, -24, 2); ctx.stroke(); }
        ell(ctx, 0, 0, 11, 5.5); ctx.fillStyle = radial(ctx, 0, 0, 11, [[0, shade(body, 0.35)], [1, shade(body, -0.35)]]); ctx.fill(); outline(ctx);
        const heads = has('heads') ? [-4, 4] : [0];
        for (const y of heads) {
          circ(ctx, 12, y, 4.5); ctx.fillStyle = shade(body, 0.15); ctx.fill(); outline(ctx, 1);
          circ(ctx, 14, y - 1.5, 0.9); circ(ctx, 14, y + 1.5, 0.9); ctx.fillStyle = '#ff4'; ctx.fill();
        }
        if (has('horns')) for (const s of [-1, 1]) { ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(11, s * 3); ctx.lineTo(9, s * 8); ctx.stroke(); }
        break;
      }
      case 'blob': {
        const big = has('big') ? 1.1 : 1;
        ctx.scale(big, big);
        const r = rng(id.charCodeAt(2) * 31 + 7);
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = 15 + r() * 4;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = radial(ctx, 0, 0, 18, [[0, shade(body, 0.35)], [1, shade(body, -0.4)]]); ctx.fill(); outline(ctx);
        for (let i = 0; i < 5; i++) { circ(ctx, (r() - 0.5) * 18, (r() - 0.5) * 18, 1.5 + r() * 2.5); ctx.fillStyle = shade(accent, 0.1); ctx.fill(); }
        if (has('stitches')) {
          ctx.strokeStyle = '#3a1a1a'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(10, 6); ctx.stroke();
          for (let i = 0; i < 5; i++) { const x = -8 + i * 4.5; const y = -6.6 + i * 3.2; ctx.beginPath(); ctx.moveTo(x - 2, y + 2.5); ctx.lineTo(x + 2, y - 2.5); ctx.stroke(); }
        }
        circ(ctx, 9, -4, 2.2); circ(ctx, 9, 4, 2.2); ctx.fillStyle = '#fff'; ctx.fill();
        circ(ctx, 10, -4, 1); circ(ctx, 10, 4, 1); ctx.fillStyle = '#000'; ctx.fill();
        break;
      }
      case 'wisp': {
        circ(ctx, 0, 0, 22); ctx.fillStyle = radial(ctx, 0, 0, 22, [[0, 'rgba(255,255,255,0.95)'], [0.35, body], [1, 'rgba(160,240,255,0)']]); ctx.fill();
        circ(ctx, 0, 0, 6); ctx.fillStyle = '#fff'; ctx.fill();
        break;
      }
      case 'tree': {
        ctx.strokeStyle = shade(body, -0.2); ctx.lineWidth = 3;
        for (const a of [0.6, 2.2, 3.7, 5.2]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke(); }
        circ(ctx, 0, 0, 8); ctx.fillStyle = body; ctx.fill(); outline(ctx);
        for (const [x, y, rr] of [[6, -8, 8], [8, 7, 8], [-6, 0, 9], [2, 0, 7]]) {
          circ(ctx, x, y, rr); ctx.fillStyle = radial(ctx, x, y, rr, [[0, shade(accent, 0.3)], [1, shade(accent, -0.35)]]); ctx.fill(); outline(ctx, 1);
        }
        circ(ctx, 12, -2, 1.3); circ(ctx, 12, 2, 1.3); ctx.fillStyle = '#ffea70'; ctx.fill();
        break;
      }
      case 'robot': {
        for (const s of [-1, 1]) { ctx.fillStyle = '#3a3d44'; rrect(ctx, -18, s * 12 - 4, 32, 8, 2); ctx.fill(); outline(ctx); }
        ctx.fillStyle = radial(ctx, 0, 0, 18, [[0, shade(body, 0.4)], [1, shade(body, -0.4)]]);
        rrect(ctx, -14, -11, 26, 22, 4); ctx.fill(); outline(ctx);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(-9, -6, 12, 12);
        ctx.fillStyle = '#5a5e66'; rrect(ctx, 8, -6, 10, 12, 3); ctx.fill(); outline(ctx);
        circ(ctx, 15, 0, 2.6); ctx.fillStyle = accent; ctx.fill();
        for (const s of [-1, 1]) { ctx.fillStyle = '#6a6e76'; rrect(ctx, 4, s * 15 - 2.5, 16, 5, 2); ctx.fill(); outline(ctx, 1); }
        break;
      }
    }
  });
}

export function projectileSprite(kind: ProjectileKind): HTMLCanvasElement {
  return make(32, 32, (ctx) => {
    ctx.translate(16, 16);
    switch (kind) {
      case 'arrow':
        ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(6, -3.5); ctx.lineTo(6, 3.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c03030'; ctx.fillRect(-13, -2.5, 4, 5);
        break;
      case 'bolt':
        ctx.fillStyle = radial(ctx, 0, 0, 12, [[0, '#ffffff'], [0.5, '#80e0ff'], [1, 'rgba(80,200,255,0)']]);
        ell(ctx, 0, 0, 13, 4); ctx.fill();
        break;
      case 'rock':
        circ(ctx, 0, 0, 6); ctx.fillStyle = radial(ctx, 0, 0, 6, [[0, '#b0a898'], [1, '#4a4238']]); ctx.fill(); outline(ctx, 1);
        break;
      case 'shell':
        circ(ctx, 0, 0, 5); ctx.fillStyle = radial(ctx, 0, 0, 5, [[0, '#888'], [1, '#222']]); ctx.fill();
        break;
      case 'bullet':
        ctx.fillStyle = radial(ctx, 0, 0, 8, [[0, '#ffffff'], [0.4, '#ffe060'], [1, 'rgba(255,200,60,0)']]); ell(ctx, 0, 0, 9, 3); ctx.fill();
        break;
      case 'shard':
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(0, -4); ctx.lineTo(-10, 0); ctx.lineTo(0, 4); ctx.closePath();
        ctx.fillStyle = '#dff8ff'; ctx.fill(); outline(ctx, 1, '#4ab0e0');
        break;
      case 'fireball':
        circ(ctx, 0, 0, 13); ctx.fillStyle = radial(ctx, 0, 0, 13, [[0, '#fffbe0'], [0.35, '#ffb030'], [0.7, '#ff4010'], [1, 'rgba(255,40,0,0)']]); ctx.fill();
        break;
      default:
        circ(ctx, 0, 0, 12); ctx.fillStyle = radial(ctx, 0, 0, 12, [[0, '#ffffff'], [0.45, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); ctx.fill();
    }
  });
}

export function portalSprite(color: string): HTMLCanvasElement {
  return make(96, 96, (ctx) => {
    ctx.translate(48, 48);
    circ(ctx, 0, 0, 44); ctx.fillStyle = radial(ctx, 0, 0, 44, [[0, 'rgba(0,0,0,0.9)'], [0.6, shade(color, -0.5)], [1, 'rgba(0,0,0,0)']]); ctx.fill();
    ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? shade(color, 0.3) : color;
      ctx.beginPath(); ctx.arc(0, 0, 12 + i * 6, (i * Math.PI) / 2.5, (i * Math.PI) / 2.5 + Math.PI * 1.1); ctx.stroke();
    }
  });
}

export function fxSprites(): Record<string, HTMLCanvasElement> {
  return {
    'fx:dot': make(16, 16, (ctx) => { circ(ctx, 8, 8, 8); ctx.fillStyle = radial(ctx, 8, 8, 8, [[0, '#fff'], [0.4, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); ctx.fill(); }),
    'fx:spark': make(16, 16, (ctx) => {
      ctx.translate(8, 8); ctx.fillStyle = '#fff';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const r = i % 2 ? 2 : 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    }),
    'fx:ring': make(64, 64, (ctx) => { circ(ctx, 32, 32, 28); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }),
    'fx:shadow': make(32, 16, (ctx) => { ell(ctx, 16, 8, 15, 7); ctx.fillStyle = radial(ctx, 16, 8, 15, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); ctx.fill(); }),
  };
}

export function proceduralArt(): Map<string, HTMLCanvasElement> {
  const art = new Map<string, HTMLCanvasElement>();
  for (const def of Object.values(TOWERS)) {
    art.set(`tower:${def.id}`, towerBase(def));
    const turret = towerTurret(def);
    if (turret) art.set(`turret:${def.id}`, turret);
  }
  for (const w of WAVES) art.set(`creep:${w.id}`, creepSprite(w.id));
  for (const kind of new Set(Object.values(PROJECTILES))) art.set(`proj:${kind}`, projectileSprite(kind));
  art.set('portal:spawn', portalSprite('#e040e0'));
  art.set('portal:exit', portalSprite('#ff4040'));
  for (const [k, v] of Object.entries(fxSprites())) art.set(k, v);
  return art;
}
