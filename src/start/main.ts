import './start.css';
import { Game } from '../core/sim';
import { AIMS, creepScale, familyOf, proceduralArt, terrain } from '../art/procedural';
import { getSfx } from '../audio/sfx';

const PX = 12;
const RES = 0.6;
const FRAME_MS = 1000 / 30;
const startEl = document.getElementById('start')!;
const app = document.getElementById('app')!;
const btn = document.getElementById('start-btn') as HTMLButtonElement;
const canvas = document.getElementById('start-bg') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const sfx = getSfx();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const art = proceduralArt();

const ATTRACT_BUILDS: [string, number, number, number][] = [
  ['oC33', 56, 44, 4], ['oC35', 63, 44, 3], ['oC40', 56, 56, 2], ['oC45', 63, 56, 0], ['oC48', 66, 46, 0],
  ['h000', 70, 52, 6], ['oC43', 77, 56, 0], ['oC02', 88, 54, 0], ['oC46', 92, 58, 0], ['oC03', 96, 44, 0],
  ['oC49', 100, 52, 0], ['oC33', 52, 50, 3], ['oC35', 52, 56, 2], ['h000', 74, 46, 5], ['oC47', 88, 46, 0],
];

function newAttractGame() {
  const g = new Game({ seed: Math.floor(Math.random() * 1e9), mode: 'solo' });
  g.start('easy');
  g.gold = 1e6;
  g.lives = 1e6;
  g.level = 3 + Math.floor(Math.random() * 8);
  g.place('hC09', 40, 40);
  g.buyCopter('super');
  g.buyCopter('advanced');
  for (const [id, x, y, ups] of ATTRACT_BUILDS) {
    if (!g.place(id, x, y).ok) continue;
    const t = g.towers[g.towers.length - 1];
    for (let i = 0; i < ups; i++) g.upgrade(t.id);
  }
  g.phaseTimer = 1;
  return g;
}

function staticLayer(g: Game) {
  const layer = terrain(g, PX);
  const lctx = layer.getContext('2d')!;
  for (const tw of g.towers) {
    const s = tw.def.size * PX;
    lctx.drawImage(art.get(`tower:${tw.def.id}`)!, tw.cx * PX, tw.cy * PX, s, s);
  }
  return layer;
}

let game = newAttractGame();
let layer = staticLayer(game);
let path = game.previewPath().filter(([x, y]) => x / game.cell > 50 && x / game.cell < 104 && y / game.cell > 36 && y / game.cell < 64);
let running = true;
const facing = new Map<number, number>();
const last = new Map<number, [number, number]>();

function resize() {
  canvas.width = Math.round(innerWidth * RES);
  canvas.height = Math.round(innerHeight * RES);
}
resize();
window.addEventListener('resize', resize);

function cameraAt(t: number): [number, number] {
  const k = PX / game.cell;
  if (!path.length || reduceMotion) return [game.cols * PX * 0.62, game.rows * PX * 0.42];
  const f = ((Math.sin(t / 26) + 1) / 2) * (path.length - 1);
  const i = Math.floor(f);
  const [ax, ay] = path[i];
  const [bx, by] = path[Math.min(path.length - 1, i + 1)];
  return [(ax + (bx - ax) * (f - i)) * k, (ay + (by - ay) * (f - i)) * k];
}

function draw(t: number) {
  const k = PX / game.cell;
  const w = canvas.width;
  const h = canvas.height;
  const [cx, cy] = cameraAt(t);
  const zoom = Math.max(w / (game.cols * PX * 0.62), h / (game.rows * PX * 0.62));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c0e12';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(zoom, 0, 0, zoom, w / 2 - cx * zoom, h / 2 - cy * zoom);
  ctx.drawImage(layer, 0, 0);

  for (const tw of game.towers) {
    const turret = art.get(`turret:${tw.def.id}`);
    if (!turret) continue;
    const s = tw.def.size * PX;
    const mode = AIMS[familyOf(tw.def.id).family];
    ctx.save();
    ctx.translate(tw.cx * PX + s / 2, tw.cy * PX + s / 2);
    ctx.rotate(mode === 'aim' ? tw.aim : mode === 'spin' ? t * 0.8 : 0);
    ctx.drawImage(turret, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  for (const c of game.creeps) {
    const x = c.x * k;
    const y = c.y * k;
    const prev = last.get(c.id);
    if (prev && Math.hypot(x - prev[0], y - prev[1]) > 0.05) facing.set(c.id, Math.atan2(y - prev[1], x - prev[0]));
    last.set(c.id, [x, y]);
    const size = creepScale(c.wave.id) * PX * 2.4;
    ctx.save();
    ctx.translate(x, y - (c.air ? 4 + Math.sin(t * 4 + c.id) * 1.5 : 0));
    ctx.rotate(facing.get(c.id) ?? 0);
    ctx.drawImage(art.get(`creep:${c.wave.id}`)!, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  for (const e of game.effects) {
    ctx.globalAlpha = Math.max(0, e.ttl / e.maxTtl);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (e.kind === 'shot') { ctx.moveTo(e.x1 * k, e.y1 * k); ctx.lineTo(e.x2 * k, e.y2 * k); }
    else ctx.arc(e.x1 * k, e.y1 * k, e.radius * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (last.size > game.creeps.length + 60) {
    const live = new Set(game.creeps.map((c) => c.id));
    for (const id of last.keys()) if (!live.has(id)) { last.delete(id); facing.delete(id); }
  }
}

let prevT = performance.now();
let acc = 0;
function frame(now: number) {
  if (!running) return;
  requestAnimationFrame(frame);
  acc += now - prevT;
  prevT = now;
  if (acc < FRAME_MS) return;
  const dt = Math.min(0.1, acc / 1000);
  acc = 0;
  game.update(dt);
  if (game.over || game.level >= 25) {
    game = newAttractGame();
    layer = staticLayer(game);
    path = game.previewPath().filter(([x, y]) => x / game.cell > 50 && x / game.cell < 104 && y / game.cell > 36 && y / game.cell < 64);
  }
  draw(now / 1000);
}
requestAnimationFrame(frame);

async function start() {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Loading…';
  sfx.play('unlock');
  running = false;
  app.hidden = false;
  try {
    await import('../phaser/main');
    startEl.classList.add('leaving');
    setTimeout(() => startEl.remove(), 600);
  } catch (err) {
    console.error(err);
    app.hidden = true;
    btn.disabled = false;
    btn.textContent = 'Failed to load. Retry';
    running = true;
    prevT = performance.now();
    requestAnimationFrame(frame);
  }
}

btn.addEventListener('click', start);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && startEl.isConnected) start();
});
