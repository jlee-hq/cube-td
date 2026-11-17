import '../ui/style.css';
import { Controller } from '../ui/controller';
import { mountPanel } from '../ui/panel';
import { applyDemo } from '../ui/demo';
import { COLORS, PX, worldToPx } from '../ui/theme';
import { loadArt } from '../art/registry';
import { AIMS, creepScale, familyOf, terrain as drawTerrain } from '../art/procedural';

const art = await loadArt();

const ctrl = new Controller();
const stage = document.getElementById('stage')!;
const canvas = document.createElement('canvas');
stage.prepend(canvas);
mountPanel(ctrl, document.getElementById('panel')!, document.getElementById('overlay')!, art);
applyDemo(ctrl);

const W = ctrl.game.cols * PX;
const H = ctrl.game.rows * PX;
const dpr = window.devicePixelRatio || 1;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const ctx = canvas.getContext('2d')!;
ctx.scale(dpr, dpr);
const terrain = drawTerrain(ctrl.game, PX);
const facing = new Map<number, { x: number; y: number; rot: number }>();

const cellOf = (e: PointerEvent) => ({ cx: Math.floor(e.offsetX / PX), cy: Math.floor(e.offsetY / PX) });
canvas.addEventListener('pointermove', (e) => { const { cx, cy } = cellOf(e); ctrl.pointerMove(cx, cy); });
canvas.addEventListener('pointerleave', () => ctrl.pointerLeave());
canvas.addEventListener('pointerdown', (e) => { const { cx, cy } = cellOf(e); ctrl.pointerDown(cx, cy, e.button, e.shiftKey); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let pathCache: { key: string; pts: [number, number][] } = { key: '', pts: [] };
let gameRef = ctrl.game;
let gameSerial = 0;

const circle = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };

function draw() {
  const g = ctrl.game;
  if (g !== gameRef) { gameRef = g; gameSerial++; }
  const k = worldToPx(g);
  ctx.drawImage(terrain, 0, 0, W, H);
  for (const [i, key] of [[0, 'portal:spawn'], [g.waypoints.length - 1, 'portal:exit']] as const) {
    const r = g.waypoints[i];
    const s = PX * 4;
    ctx.save();
    ctx.translate((r.x + r.w / 2) * k, (r.y + r.h / 2) * k);
    ctx.rotate(g.time * (i ? -1.2 : 1.6));
    ctx.drawImage(art.get(key)!, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  if (ctrl.showPath) {
    const key = `${gameSerial}:${g.version}`;
    if (pathCache.key !== key) pathCache = { key, pts: g.previewPath() };
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    pathCache.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const t of g.towers) {
    const s = t.def.size * PX;
    ctx.drawImage(art.get(`tower:${t.def.id}`)!, t.cx * PX, t.cy * PX, s, s);
    const turret = art.get(`turret:${t.def.id}`);
    if (turret) {
      const mode = AIMS[familyOf(t.def.id).family];
      ctx.save();
      ctx.translate(t.cx * PX + s / 2, t.cy * PX + s / 2);
      ctx.rotate(mode === 'aim' ? t.aim : mode === 'spin' ? g.time * 0.8 : 0);
      ctx.drawImage(turret, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    if (t.id === ctrl.selectedId) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.cx * PX, t.cy * PX, s, s);
    }
  }

  const sel = ctrl.selected;
  if (sel && sel.def.range) {
    const [x, y] = g.towerCenter(sel);
    ctx.strokeStyle = COLORS.range;
    ctx.lineWidth = 1;
    circle(x * k, y * k, (sel.def.range + (sel.def.size * g.cell) / 2) * k);
    ctx.stroke();
  }

  const ghost = ctrl.ghost();
  if (ghost) {
    const s = ghost.def.size * PX;
    ctx.fillStyle = ghost.ok ? COLORS.ok : COLORS.bad;
    ctx.fillRect(ghost.x * PX, ghost.y * PX, s, s);
    if (ghost.def.range) {
      ctx.strokeStyle = ghost.ok ? COLORS.ok : COLORS.bad;
      circle(ghost.x * PX + s / 2, ghost.y * PX + s / 2, (ghost.def.range + (ghost.def.size * g.cell) / 2) * k);
      ctx.stroke();
    }
  }

  for (const c of g.creeps) {
    const x = c.x * k;
    const y = c.y * k;
    const snared = g.time < c.snaredUntil;
    const f = facing.get(c.id) ?? { x, y, rot: 0 };
    if (Math.hypot(x - f.x, y - f.y) > 0.05) f.rot = Math.atan2(y - f.y, x - f.x);
    f.x = x;
    f.y = y;
    facing.set(c.id, f);
    const size = creepScale(c.wave.id) * PX * 2.4;
    ctx.save();
    ctx.translate(x, y - (c.air && !snared ? 3 : 0));
    ctx.rotate(f.rot);
    ctx.drawImage(art.get(`creep:${c.wave.id}`)!, -size / 2, -size / 2, size, size);
    ctx.restore();
    if (g.time < c.slowUntil || g.time < c.stunUntil || snared) {
      ctx.strokeStyle = g.time < c.stunUntil ? '#ff0' : snared ? '#9f6' : '#8ef';
      ctx.lineWidth = 1.5;
      circle(x, y, 5.5); ctx.stroke();
    }
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x - 6, y - 9, 12, 2);
    ctx.fillStyle = COLORS.hp;
    ctx.fillRect(x - 6, y - 9, 12 * (c.hp / c.maxHp), 2);
  }

  for (const e of g.effects) {
    const a = Math.max(0, e.ttl / e.maxTtl);
    ctx.globalAlpha = a;
    ctx.strokeStyle = e.color;
    if (e.kind === 'shot') {
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(e.x1 * k, e.y1 * k); ctx.lineTo(e.x2 * k, e.y2 * k); ctx.stroke();
    } else {
      ctx.lineWidth = e.kind === 'leak' ? 3 : 1.5;
      circle(e.x1 * k, e.y1 * k, e.radius * k * (e.kind === 'splash' ? 1 : 1.5 - a * 0.5)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (facing.size > g.creeps.length + 50) {
    const live = new Set(g.creeps.map((c) => c.id));
    for (const id of facing.keys()) if (!live.has(id)) facing.delete(id);
  }
}

let last = performance.now();
function frame(now: number) {
  ctrl.tick(Math.min(0.1, (now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
