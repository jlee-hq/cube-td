import { CELL, GRID, SOLO_WAYPOINTS, WAYPOINTS } from './lane1';
import {
  BREAK_TIME, COPTER_COST, CREEPS_PER_WAVE, DIFFICULTIES, LIFE_COST, MAX_MOVE_SPEED,
  RULES, SPAWN_INTERVAL, START_LIVES, TOWERS, WAVES, armorFactor, type Mode, type Rules,
  type DifficultyDef, type DifficultyId, type Tier, type TowerDef, type WaveDef,
} from './data';

export type Phase = 'menu' | 'countdown' | 'wave' | 'break' | 'won' | 'lost';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Creep {
  id: number;
  wave: WaveDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  air: boolean;
  wp: number;
  slowFactor: number;
  slowUntil: number;
  stunUntil: number;
  snaredUntil: number;
  shred: number;
  shredUntil: number;
}

export interface Tower {
  id: number;
  def: TowerDef;
  cx: number;
  cy: number;
  cooldown: number;
  targetId: number;
  snareReadyAt: number;
  aim: number;
  kills: number;
  damage: number;
}

export interface Effect {
  kind: 'shot' | 'splash' | 'leak' | 'death';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
  color: string;
  ttl: number;
  maxTtl: number;
  source?: string;
  crit?: boolean;
}

export interface GameOptions { bugfixes?: boolean; seed?: number; mode?: Mode; rules?: Partial<Rules> }

export type PlaceResult = { ok: true } | { ok: false; reason: 'gold' | 'terrain' | 'occupied' | 'creep' | 'blocks' | 'locked' | 'phase' };

const STEP = 1 / 30;
const SQRT2 = Math.SQRT2;
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export class Game {
  readonly cols = GRID[0].length;
  readonly rows = GRID.length;
  readonly cell = CELL;
  readonly width = this.cols * CELL;
  readonly height = this.rows * CELL;
  waypoints: Rect[] = [];
  readonly walkable: Uint8Array;
  readonly buildable: Uint8Array;
  readonly occupied: Int32Array;
  readonly bugfixes: boolean;
  mode: Mode = 'original';
  rules: Rules = RULES.original;
  private ruleOverrides: Partial<Rules> = {};

  phase: Phase = 'menu';
  difficulty: DifficultyDef = DIFFICULTIES[0];
  gold = 0;
  lives = START_LIVES;
  level = 0;
  time = 0;
  phaseTimer = 0;
  spawnTimer = 0;
  spawned = 0;
  kills = 0;
  leaks = 0;
  unlocked: Record<Exclude<Tier, 'basic'>, boolean> = { super: false, advanced: false };
  creeps: Creep[] = [];
  towers: Tower[] = [];
  effects: Effect[] = [];
  messages: { text: string; time: number }[] = [];
  fields: Float64Array[] = [];
  version = 0;
  layoutVersion = 0;

  private nextId = 1;
  private acc = 0;
  private rng: () => number;
  private targetCells: number[][] = [];

  constructor(opts: GameOptions = {}) {
    this.bugfixes = opts.bugfixes ?? true;
    this.ruleOverrides = opts.rules ?? {};
    this.rng = mulberry32(opts.seed ?? Date.now());
    const n = this.cols * this.rows;
    this.walkable = new Uint8Array(n);
    this.buildable = new Uint8Array(n);
    this.occupied = new Int32Array(n);
    GRID.forEach((row, y) => [...row].forEach((ch, x) => {
      this.walkable[y * this.cols + x] = ch === '#' ? 0 : 1;
      this.buildable[y * this.cols + x] = ch === '.' ? 1 : 0;
    }));
    this.setMode(opts.mode ?? 'original');
  }

  get wave(): WaveDef { return WAVES[Math.min(this.level, WAVES.length - 1)]; }
  get over(): boolean { return this.phase === 'won' || this.phase === 'lost'; }
  get hasFacility(): boolean { return this.towers.some((t) => t.def.unlocks); }

  setMode(mode: Mode) {
    if (this.phase !== 'menu') return;
    this.mode = mode;
    this.rules = { ...(RULES[mode] ?? RULES.original), ...this.ruleOverrides };
    this.lives = this.rules.startLives;
    const route = mode === 'solo' ? SOLO_WAYPOINTS : WAYPOINTS;
    this.waypoints = route.map((w) => ({ x: w.x * CELL, y: w.y * CELL, w: w.w * CELL, h: w.h * CELL }));
    this.targetCells = this.waypoints.map((r) => this.cellsInRect(r));
    this.fields = this.computeFields(this.occupied)!;
    this.version++;
    this.layoutVersion++;
  }

  bountyFor(wave: WaveDef): number {
    return Math.round(wave.gold * this.rules.bountyMul);
  }

  roundBonus(): number {
    return Math.round(this.rules.roundBonusBase + this.rules.roundBonusPerLevel * this.level);
  }

  start(id: DifficultyId) {
    if (this.phase !== 'menu') return;
    this.difficulty = DIFFICULTIES.find((d) => d.id === id)!;
    this.rules = { ...(RULES[this.mode] ?? RULES.original), ...(RULES[this.mode]?.byDifficulty?.[id] ?? {}), ...this.ruleOverrides };
    this.gold = this.difficulty.startGold + this.rules.startGoldBonus;
    this.lives = this.rules.startLives;
    this.phase = 'countdown';
    this.phaseTimer = this.difficulty.startDelay;
    this.log(`${this.difficulty.name} selected. First wave in ${this.difficulty.startDelay}s.`);
  }

  update(dt: number) {
    if (this.phase === 'menu' || this.phase === 'won' || this.phase === 'lost') {
      this.tickEffects(dt);
      return;
    }
    this.acc += Math.min(dt, 1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
      if (this.over) break;
    }
  }

  canPlace(defId: string, cx: number, cy: number, checkPath = true): PlaceResult {
    const def = TOWERS[defId];
    if (this.phase === 'won' || this.phase === 'lost' || this.phase === 'menu') return { ok: false, reason: 'phase' };
    if (def.tier !== 'basic' && !this.unlocked[def.tier]) return { ok: false, reason: 'locked' };
    if (this.gold < def.cost) return { ok: false, reason: 'gold' };
    const cells = this.footprint(cx, cy, def.size);
    if (!cells) return { ok: false, reason: 'terrain' };
    for (const i of cells) {
      if (!this.buildable[i]) return { ok: false, reason: 'terrain' };
      if (this.occupied[i]) return { ok: false, reason: 'occupied' };
    }
    const set = new Set(cells);
    if (this.creeps.some((c) => !c.air && set.has(this.cellAt(c.x, c.y)))) return { ok: false, reason: 'creep' };
    if (checkPath && !this.tryBlock(cells)) return { ok: false, reason: 'blocks' };
    return { ok: true };
  }

  place(defId: string, cx: number, cy: number): PlaceResult {
    const res = this.canPlace(defId, cx, cy, false);
    if (!res.ok) return res;
    const def = TOWERS[defId];
    const cells = this.footprint(cx, cy, def.size)!;
    const fields = this.tryBlock(cells);
    if (!fields) return { ok: false, reason: 'blocks' };
    const tower: Tower = { id: this.nextId++, def, cx, cy, cooldown: 0, targetId: 0, snareReadyAt: 0, aim: -Math.PI / 2, kills: 0, damage: 0 };
    for (const i of cells) this.occupied[i] = tower.id;
    this.towers.push(tower);
    this.fields = fields;
    this.gold -= def.cost;
    this.version++;
    this.layoutVersion++;
    return { ok: true };
  }

  pathLength(fields = this.fields): number {
    let total = 0;
    for (let k = 1; k < this.waypoints.length; k++) {
      total += Math.min(...this.targetCells[k - 1].map((i) => fields[k][i]));
    }
    return total;
  }

  pathLengthIf(defId: string, cx: number, cy: number): number | null {
    const cells = this.footprint(cx, cy, TOWERS[defId].size);
    if (!cells) return null;
    const fields = this.tryBlock(cells);
    return fields ? this.pathLength(fields) : null;
  }

  upgradeTarget(tower: Tower): TowerDef | undefined {
    const next = !this.bugfixes && tower.def.id === 'h001' ? 'h002' : tower.def.upgradesTo;
    return next ? TOWERS[next] : undefined;
  }

  upgrade(towerId: number): boolean {
    const tower = this.towers.find((t) => t.id === towerId);
    const next = tower && this.upgradeTarget(tower);
    if (!tower || !next || this.gold < next.cost || this.phase === 'won' || this.phase === 'lost') return false;
    this.gold -= next.cost;
    tower.def = next;
    this.version++;
    return true;
  }

  sell(towerId: number): boolean {
    const idx = this.towers.findIndex((t) => t.id === towerId);
    if (idx < 0 || this.phase === 'won' || this.phase === 'lost') return false;
    const tower = this.towers[idx];
    for (const i of this.footprint(tower.cx, tower.cy, tower.def.size)!) this.occupied[i] = 0;
    this.towers.splice(idx, 1);
    this.fields = this.computeFields(this.occupied)!;
    this.gold += tower.def.sell;
    this.log(`Sold ${tower.def.name} for ${tower.def.sell} gold.`);
    this.version++;
    this.layoutVersion++;
    return true;
  }

  buyLife(): boolean {
    if (this.gold < LIFE_COST || this.phase === 'won' || this.phase === 'lost' || this.phase === 'menu') return false;
    this.gold -= LIFE_COST;
    this.lives++;
    this.log(`Bought a life. Lives: ${this.lives}.`);
    return true;
  }

  buyCopter(tier: Exclude<Tier, 'basic'>): boolean {
    if (this.unlocked[tier] || !this.hasFacility || this.gold < COPTER_COST[tier]) return false;
    this.gold -= COPTER_COST[tier];
    this.unlocked[tier] = true;
    this.log(`${tier === 'super' ? 'Super' : 'Advanced'} Construction Copter ready.`);
    return true;
  }

  towerAtCell(cx: number, cy: number): Tower | undefined {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return undefined;
    const id = this.occupied[cy * this.cols + cx];
    return id ? this.towers.find((t) => t.id === id) : undefined;
  }

  towerCenter(t: Tower): [number, number] {
    return [(t.cx + t.def.size / 2) * CELL, (t.cy + t.def.size / 2) * CELL];
  }

  creepHpFor(wave: WaveDef): number {
    return Math.round(this.baseHp(wave) * this.rules.hpMul * (wave.air ? this.rules.airHpMul : 1));
  }

  private baseHp(wave: WaveDef): number {
    const d = this.difficulty.id;
    if (d === 'ultimate') return wave.maxHp;
    if (this.bugfixes) return wave.hp[d];
    return d === 'usg' ? wave.maxHp : Math.min(wave.hp[d], wave.maxHp);
  }

  private step(dt: number) {
    this.time += dt;
    if (this.phase === 'countdown' || this.phase === 'break') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.phase === 'break') this.level++;
        this.phase = 'wave';
        this.spawned = 0;
        this.spawnTimer = SPAWN_INTERVAL;
        this.log(`Level ${this.level + 1}: ${this.wave.name}${this.wave.air ? ' (air)' : ''}.`);
      }
    }
    if (this.phase === 'wave' && this.spawned < CREEPS_PER_WAVE) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer += SPAWN_INTERVAL;
        this.spawn();
      }
    }
    for (const c of this.creeps) this.moveCreep(c, dt);
    for (const t of this.towers) this.towerAct(t, dt);
    this.creeps = this.creeps.filter((c) => c.hp > 0);
    this.tickEffects(dt);
    if (this.phase === 'wave' && this.creeps.length === 0 && this.spawned >= CREEPS_PER_WAVE) {
      this.waveCleared();
    }
  }

  private waveCleared() {
    if (this.level >= WAVES.length - 1) {
      this.phase = 'won';
      this.log('Victory! All 30 levels cleared.');
      return;
    }
    const bonus = this.roundBonus();
    this.gold += bonus;
    this.phase = 'break';
    this.phaseTimer = BREAK_TIME;
    this.log(`Level cleared. +${bonus} gold. Next level in ${BREAK_TIME}s.`);
  }

  private spawn() {
    const wave = this.wave;
    const r = this.waypoints[0];
    const hp = this.creepHpFor(wave);
    this.creeps.push({
      id: this.nextId++, wave,
      x: r.x + r.w / 2 + (this.rng() - 0.5) * r.w * 0.5,
      y: r.y + r.h / 2 + (this.rng() - 0.5) * r.h * 0.5,
      hp, maxHp: this.bugfixes ? hp : Math.max(hp, wave.maxHp),
      speed: Math.min(MAX_MOVE_SPEED, wave.speed * this.difficulty.speedMul),
      air: wave.air, wp: 1, slowFactor: 1, slowUntil: 0, stunUntil: 0, snaredUntil: 0, shred: 0, shredUntil: 0,
    });
    this.spawned++;
  }

  private moveCreep(c: Creep, dt: number) {
    if (c.hp <= 0 || this.time < c.stunUntil || this.time < c.snaredUntil) return;
    const target = this.waypoints[c.wp];
    if (this.inRect(c.x, c.y, target)) {
      if (c.wp === this.waypoints.length - 1) return this.leak(c);
      c.wp++;
      return;
    }
    const speed = c.speed * (this.time < c.slowUntil ? c.slowFactor : 1);
    let tx = target.x + target.w / 2;
    let ty = target.y + target.h / 2;
    if (!c.air) {
      const next = this.nextCell(c);
      if (next >= 0) {
        tx = ((next % this.cols) + 0.5) * CELL;
        ty = (Math.floor(next / this.cols) + 0.5) * CELL;
      }
    }
    const dx = tx - c.x;
    const dy = ty - c.y;
    const dist = Math.hypot(dx, dy);
    const move = speed * dt;
    if (dist <= move) { c.x = tx; c.y = ty; } else { c.x += (dx / dist) * move; c.y += (dy / dist) * move; }
  }

  previewPath(): [number, number][] {
    const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
    const pts: [number, number][] = [center(this.waypoints[0])];
    for (let k = 1; k < this.waypoints.length; k++) {
      let [x, y] = pts[pts.length - 1];
      for (let guard = 0; guard < 4000; guard++) {
        const next = this.stepCell(this.fields[k], x, y);
        if (next < 0) break;
        x = ((next % this.cols) + 0.5) * CELL;
        y = (Math.floor(next / this.cols) + 0.5) * CELL;
        pts.push([x, y]);
      }
      pts.push(center(this.waypoints[k]));
    }
    return pts;
  }

  private nextCell(c: Creep): number {
    return this.stepCell(this.fields[c.wp], c.x, c.y);
  }

  private stepCell(field: Float64Array, px: number, py: number): number {
    const x = Math.floor(px / CELL);
    const y = Math.floor(py / CELL);
    const cur = y * this.cols + x;
    if (field[cur] === 0) return -1;
    let best = -1;
    let bestCost = field[cur];
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.passable(nx, ny, this.occupied)) continue;
      if (dx && dy && (!this.passable(x + dx, y, this.occupied) || !this.passable(x, y + dy, this.occupied))) continue;
      const v = field[ny * this.cols + nx] + cost;
      if (v < bestCost || (best < 0 && Number.isFinite(v))) { best = ny * this.cols + nx; bestCost = v; }
    }
    return best;
  }

  private leak(c: Creep) {
    c.hp = 0;
    this.leaks++;
    this.lives--;
    this.effects.push({ kind: 'leak', x1: c.x, y1: c.y, x2: c.x, y2: c.y, radius: 200, color: '#ff3030', ttl: 0.6, maxTtl: 0.6 });
    this.log(`${c.wave.name} leaked! Lives: ${Math.max(0, this.lives)}.`);
    if (this.lives <= 0) {
      this.phase = 'lost';
      this.log(`Defeat on level ${this.level + 1}.`);
    }
  }

  private targetable(t: TowerDef, c: Creep): boolean {
    if (c.hp <= 0) return false;
    const grounded = !c.air || this.time < c.snaredUntil;
    return t.targets === 'both' || (t.targets === 'ground' ? grounded : c.air);
  }

  private progress(c: Creep): number {
    const d = c.air
      ? Math.hypot(c.x - (this.waypoints[c.wp].x + this.waypoints[c.wp].w / 2), c.y - (this.waypoints[c.wp].y + this.waypoints[c.wp].h / 2)) / CELL
      : this.fields[c.wp][this.cellAt(c.x, c.y)];
    return c.wp * 1e5 - (Number.isFinite(d) ? d : 0);
  }

  private towerAct(t: Tower, dt: number) {
    t.cooldown -= dt;
    if (t.def.targets === 'none' || t.cooldown > 0) return;
    const [tx, ty] = this.towerCenter(t);
    const range = t.def.range + (t.def.size * CELL) / 2;
    const inRange = (c: Creep) => this.targetable(t.def, c) && Math.hypot(c.x - tx, c.y - ty) <= range;
    let target = this.creeps.find((c) => c.id === t.targetId && inRange(c));
    if (!target) {
      let best = -Infinity;
      for (const c of this.creeps) {
        if (!inRange(c)) continue;
        const p = this.progress(c);
        if (p > best) { best = p; target = c; }
      }
    }
    if (!target) return;
    t.targetId = target.id;
    t.cooldown = t.def.cooldown;
    const def = t.def;
    let dmg = def.damage;
    const crit = !!def.crit && this.rng() < def.crit.chance;
    if (crit) dmg *= def.crit!.mult;
    t.aim = Math.atan2(target.y - ty, target.x - tx);
    this.effects.push({ kind: 'shot', x1: tx, y1: ty, x2: target.x, y2: target.y, radius: 0, color: def.color, ttl: 0.12, maxTtl: 0.12, source: def.id, crit });
    this.hit(t, target, dmg);
    if (def.slow) { target.slowFactor = def.slow.factor; target.slowUntil = this.time + def.slow.duration; }
    if (def.stun && this.rng() < def.stun.chance) target.stunUntil = this.time + def.stun.duration;
    if (def.snare && this.time >= t.snareReadyAt) { target.snaredUntil = this.time + def.snare.duration; t.snareReadyAt = this.time + def.snare.cooldown; }
    if (def.armorShred) { target.shred = def.armorShred.amount; target.shredUntil = this.time + def.armorShred.duration; }
    if (def.splash) {
      const s = def.splash;
      this.effects.push({ kind: 'splash', x1: target.x, y1: target.y, x2: target.x, y2: target.y, radius: s.small, color: def.color, ttl: 0.25, maxTtl: 0.25, source: def.id });
      for (const c of this.creeps) {
        if (c === target || !this.targetable(def, c)) continue;
        const d = Math.hypot(c.x - target.x, c.y - target.y);
        const f = d <= s.full ? 1 : d <= s.medium ? 0.5 : d <= s.small ? 0.25 : 0;
        if (f > 0) this.hit(t, c, dmg * f);
      }
    }
    if (def.bounce) {
      const hitIds = new Set([target.id]);
      let from = target;
      let bounceDmg = dmg;
      for (let k = 0; k < def.bounce.targets; k++) {
        bounceDmg *= 1 - def.bounce.loss;
        let next: Creep | undefined;
        let bestD = 400;
        for (const c of this.creeps) {
          if (hitIds.has(c.id) || !this.targetable(def, c)) continue;
          const d = Math.hypot(c.x - from.x, c.y - from.y);
          if (d < bestD) { bestD = d; next = c; }
        }
        if (!next) break;
        hitIds.add(next.id);
        this.effects.push({ kind: 'shot', x1: from.x, y1: from.y, x2: next.x, y2: next.y, radius: 0, color: def.color, ttl: 0.12, maxTtl: 0.12, source: def.id });
        this.hit(t, next, bounceDmg);
        from = next;
      }
    }
  }

  private hit(t: Tower, c: Creep, raw: number) {
    if (c.hp <= 0) return;
    const armor = c.wave.armor - (this.time < c.shredUntil ? c.shred : 0);
    const dmg = raw * armorFactor(armor);
    c.hp -= dmg;
    t.damage += dmg;
    if (c.hp <= 0) {
      c.hp = 0;
      t.kills++;
      this.kills++;
      this.gold += this.bountyFor(c.wave);
      this.effects.push({ kind: 'death', x1: c.x, y1: c.y, x2: c.x, y2: c.y, radius: 60, color: '#ffd040', ttl: 0.4, maxTtl: 0.4, source: c.wave.id });
    }
  }

  private tickEffects(dt: number) {
    for (const e of this.effects) e.ttl -= dt;
    this.effects = this.effects.filter((e) => e.ttl > 0);
  }

  private log(text: string) {
    this.messages.push({ text, time: this.time });
    if (this.messages.length > 8) this.messages.shift();
  }

  private tryBlock(cells: number[]): Float64Array[] | null {
    const occ = this.occupied.slice();
    for (const i of cells) occ[i] = -1;
    const fields = this.computeFields(occ);
    if (!fields) return null;
    for (const c of this.creeps) {
      if (!c.air && !Number.isFinite(fields[c.wp][this.cellAt(c.x, c.y)])) return null;
    }
    return fields;
  }

  private computeFields(occ: Int32Array): Float64Array[] | null {
    const fields: Float64Array[] = [new Float64Array(0)];
    for (let k = 1; k < this.waypoints.length; k++) {
      const f = this.dijkstra(this.targetCells[k], occ);
      const from = this.targetCells[k - 1];
      if (!from.some((i) => Number.isFinite(f[i]))) return null;
      fields.push(f);
    }
    return fields;
  }

  private dijkstra(sources: number[], occ: Int32Array): Float64Array {
    const n = this.cols * this.rows;
    const dist = new Float64Array(n).fill(Infinity);
    const heap: number[] = [];
    const prio: number[] = [];
    const push = (i: number, d: number) => {
      heap.push(i); prio.push(d);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (prio[p] <= prio[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]]; [prio[p], prio[k]] = [prio[k], prio[p]];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top: [number, number] = [heap[0], prio[0]];
      const li = heap.pop()!; const lp = prio.pop()!;
      if (heap.length) {
        heap[0] = li; prio[0] = lp;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1; const r = l + 1; let m = k;
          if (l < heap.length && prio[l] < prio[m]) m = l;
          if (r < heap.length && prio[r] < prio[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [prio[m], prio[k]] = [prio[k], prio[m]];
          k = m;
        }
      }
      return top;
    };
    for (const s of sources) { dist[s] = 0; push(s, 0); }
    while (heap.length) {
      const [i, d] = pop();
      if (d > dist[i]) continue;
      const x = i % this.cols;
      const y = (i - x) / this.cols;
      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.passable(nx, ny, occ)) continue;
        if (dx && dy && (!this.passable(x + dx, y, occ) || !this.passable(x, y + dy, occ))) continue;
        const j = ny * this.cols + nx;
        const nd = d + cost;
        if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
    return dist;
  }

  private passable(x: number, y: number, occ: Int32Array): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const i = y * this.cols + x;
    return this.walkable[i] === 1 && occ[i] === 0;
  }

  private footprint(cx: number, cy: number, size: number): number[] | null {
    if (cx < 0 || cy < 0 || cx + size > this.cols || cy + size > this.rows) return null;
    const cells: number[] = [];
    for (let y = cy; y < cy + size; y++) for (let x = cx; x < cx + size; x++) cells.push(y * this.cols + x);
    return cells;
  }

  private cellsInRect(r: Rect): number[] {
    const cells: number[] = [];
    for (let y = Math.floor(r.y / CELL); y <= Math.floor((r.y + r.h) / CELL); y++) {
      for (let x = Math.floor(r.x / CELL); x <= Math.floor((r.x + r.w) / CELL); x++) {
        if (this.passable(x, y, this.occupied) && this.inRect((x + 0.5) * CELL, (y + 0.5) * CELL, r)) cells.push(y * this.cols + x);
      }
    }
    if (!cells.length) cells.push(this.cellAt(r.x + r.w / 2, r.y + r.h / 2));
    return cells;
  }

  private inRect(x: number, y: number, r: Rect): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  cellAt(x: number, y: number): number {
    return Math.floor(y / CELL) * this.cols + Math.floor(x / CELL);
  }
}
