import { COPTER_COST, LIFE_COST, TOWERS, WAVES, avgDps, type TowerDef } from './data';
import type { Game, GameOptions, Tower } from './sim';

export type Strategy = 'defense' | 'ground' | 'super' | 'greedy' | 'maze';

export interface BotOptions {
  strategy: Strategy;
  buyLives?: boolean;
  unlockAtLevel?: number;
}

const LINES: Record<Strategy, string[]> = {
  defense: ['oC33', 'oC40'],
  ground: ['oC35', 'oC33', 'oC40'],
  super: ['oC33', 'oC40', 'h000'],
  greedy: ['oC33', 'oC35', 'oC40', 'h000'],
  maze: ['oC33', 'oC40', 'h000'],
};

interface Option { cost: number; value: number; air: boolean; apply: () => boolean }

const SPOT_STRIDE = 2;

export class Bot {
  private coverCache = new Map<string, Float64Array>();
  private spotCache = new Map<string, { x: number; y: number; cover: { ground: number; air: number } } | null>();
  private towerCoverCache = new Map<string, { ground: number; air: number }>();
  private cacheVersion = -1;
  private spots: [number, number][] = [];
  private groundPts: [number, number][] = [];
  private airPts: [number, number][] = [];
  livesBought = 0;
  private urgent = false;
  private bad = new Set<string>();
  private mazeCache = new Map<string, { x: number; y: number; value: number } | null>();

  constructor(private game: Game, private opts: BotOptions) {}

  tick() {
    const g = this.game;
    if (g.over || g.phase === 'menu') return;
    this.refresh();
    const wantsLife = this.opts.buyLives && g.lives <= 1 && g.level >= 10;
    if (wantsLife && g.buyLife()) this.livesBought++;
    if (wantsLife && g.gold < LIFE_COST && !(this.airSoon() && this.airDps() < this.airDpsNeeded())) return;
    if (this.unlock() && g.creeps.every((c) => c.wp < 4) && !(this.airSoon() && this.airDps() < this.airDpsNeeded())) return;
    for (let guard = 0; guard < 40; guard++) {
      this.urgent = this.airSoon() && this.airDps() < this.airDpsNeeded();
      const urgent = this.urgent;
      const options = this.options().filter((o) => !urgent || o.air);
      if (!options.length) return;
      options.sort((a, b) => b.value / b.cost - a.value / a.cost);
      const affordable = options.find((o) => o.cost <= g.gold);
      const best = options[0];
      if (!affordable) return;
      const income = g.bountyFor(WAVES[g.level]) * 10 + g.roundBonus();
      const canSave = urgent || g.creeps.every((c) => c.wp < 5);
      if (canSave && best !== affordable && best.cost - g.gold <= income && best.value / best.cost > 1.3 * (affordable.value / affordable.cost)) return;
      if (!affordable.apply()) return;
      this.refresh();
    }
  }

  private unlock(): boolean {
    const g = this.game;
    const wantsSuper = this.opts.strategy !== 'defense' && this.opts.strategy !== 'ground';
    if (!wantsSuper || g.unlocked.super || g.level < (this.opts.unlockAtLevel ?? 2)) return false;
    const need = TOWERS.hC09.cost + COPTER_COST.super;
    if (!g.hasFacility && g.gold >= need) {
      const spot = this.facilitySpot();
      if (spot) g.place('hC09', spot[0], spot[1]);
    }
    if (g.hasFacility) g.buyCopter('super');
    return !g.unlocked.super;
  }

  private weights(): { ground: number; air: number } {
    const g = this.game;
    const airSoon = this.airSoon();
    const groundSoon = [WAVES[g.level], WAVES[g.level + 1]].some((w) => w && !w.air);
    if (this.urgent) return { ground: 0, air: 1 };
    return { ground: groundSoon ? 1 : 0.3, air: airSoon ? 1 : 0 };
  }

  private airSoon(): boolean {
    const g = this.game;
    const idx = g.phase === 'break' ? g.level + 1 : g.level;
    return [WAVES[idx], WAVES[idx + 1]].some((w) => w?.air);
  }

  private airDpsNeeded(): number {
    const g = this.game;
    const idx = g.phase === 'break' ? g.level + 1 : g.level;
    const w = [WAVES[idx], WAVES[idx + 1]].find((x) => x?.air);
    return w ? (g.creepHpFor(w) * 10) / 40 : 0;
  }

  private airDps(): number {
    return this.game.towers.reduce((s, t) => s + (t.def.targets === 'ground' || t.def.targets === 'none' ? 0 : avgDps(t.def)), 0);
  }

  private value(def: TowerDef, cover: { ground: number; air: number }): number {
    const w = this.weights();
    const dps = avgDps(def) * (def.splash ? 1.4 : 1);
    const ground = def.targets === 'air' ? 0 : cover.ground * w.ground;
    const air = def.targets === 'ground' ? 0 : cover.air * w.air;
    return dps * (ground + air);
  }

  private options(): Option[] {
    const g = this.game;
    const opts: Option[] = [];
    for (const t of g.towers) {
      const next = g.upgradeTarget(t);
      if (!next || t.def.unlocks) continue;
      const cover = this.towerCover(t, next.range);
      const gain = this.value(next, cover) - this.value(t.def, this.towerCover(t, t.def.range));
      if (gain > 0) opts.push({ cost: next.cost, value: gain, air: next.targets !== 'ground', apply: () => g.upgrade(t.id) });
    }
    for (const id of LINES[this.opts.strategy]) {
      const def = TOWERS[id];
      if (def.tier !== 'basic' && !g.unlocked[def.tier]) continue;
      const spot = this.bestSpot(def);
      if (spot) opts.push({ cost: def.cost, value: this.value(def, spot.cover), air: def.targets !== 'ground', apply: () => this.placeAt(id, spot.x, spot.y) });
      if (this.opts.strategy === 'maze' && def.targets !== 'air') {
        const m = this.mazeSpot(def);
        if (m) opts.push({ cost: def.cost, value: m.value, air: def.targets !== 'ground', apply: () => this.placeAt(id, m.x, m.y) });
      }
    }
    return opts;
  }

  private placeAt(id: string, x: number, y: number): boolean {
    if (this.game.place(id, x, y).ok) return true;
    this.bad.add(`${x},${y}`);
    this.spotCache.delete(id);
    this.mazeCache.delete(id);
    return false;
  }

  private mazeSpot(def: TowerDef): { x: number; y: number; value: number } | null {
    const cached = this.mazeCache.get(def.id);
    if (cached !== undefined) return cached;
    const g = this.game;
    const base = g.pathLength();
    const onPath = new Set(this.groundPts.map(([x, y]) => g.cellAt(x, y)));
    const candidates = this.spots
      .map(([x, y], i) => ({ x, y, i }))
      .filter(({ x, y }) => [0, 1].some((dy) => [0, 1].some((dx) => onPath.has((y + dy) * g.cols + x + dx))) && !this.bad.has(`${x},${y}`))
      .map((c) => ({ ...c, cover: this.coverAt((c.x + 1) * g.cell, (c.y + 1) * g.cell, def.range + g.cell) }))
      .sort((a, b) => b.cover.ground - a.cover.ground)
      .slice(0, 14);
    let best: { x: number; y: number; value: number } | null = null;
    for (const c of candidates) {
      const len = g.pathLengthIf(def.id, c.x, c.y);
      if (len === null || len <= base) continue;
      const cx = (c.x + 1) * g.cell;
      const cy = (c.y + 1) * g.cell;
      const localDps = g.towers.reduce((s, t) => {
        if (t.def.targets === 'air' || t.def.targets === 'none') return s;
        const [tx, ty] = g.towerCenter(t);
        return Math.hypot(tx - cx, ty - cy) <= t.def.range ? s + avgDps(t.def) : s;
      }, avgDps(def));
      const value = this.value(def, c.cover) + (len - base) * localDps * this.weights().ground;
      if (!best || value > best.value) best = { x: c.x, y: c.y, value };
    }
    this.mazeCache.set(def.id, best);
    return best;
  }

  private refresh() {
    const g = this.game;
    if (this.cacheVersion === g.layoutVersion) return;
    this.cacheVersion = g.layoutVersion;
    this.coverCache.clear();
    this.spotCache.clear();
    this.towerCoverCache.clear();
    this.bad.clear();
    this.mazeCache.clear();
    this.groundPts = g.previewPath();
    this.airPts = [];
    for (let i = 1; i < g.waypoints.length; i++) {
      const a = g.waypoints[i - 1];
      const b = g.waypoints[i];
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / g.cell);
      for (let s = 0; s < steps; s++) this.airPts.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
    }
    this.spots = [];
    for (let y = 0; y < g.rows - 1; y += SPOT_STRIDE) {
      for (let x = 0; x < g.cols - 1; x += SPOT_STRIDE) if (this.free(x, y, 2)) this.spots.push([x, y]);
    }
  }

  private free(x: number, y: number, size: number) {
    const g = this.game;
    if (x + size > g.cols || y + size > g.rows) return false;
    for (let j = y; j < y + size; j++) for (let i = x; i < x + size; i++) {
      const idx = j * g.cols + i;
      if (!g.buildable[idx] || g.occupied[idx]) return false;
    }
    return true;
  }

  private coverAt(cx: number, cy: number, range: number): { ground: number; air: number } {
    const r2 = range * range;
    let ground = 0;
    let air = 0;
    for (const [x, y] of this.groundPts) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) ground++;
    for (const [x, y] of this.airPts) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) air++;
    return { ground, air };
  }

  private towerCover(t: Tower, range: number) {
    const key = `${t.id}:${range}`;
    let c = this.towerCoverCache.get(key);
    if (!c) {
      const [x, y] = this.game.towerCenter(t);
      c = this.coverAt(x, y, range + t.def.size * this.game.cell * 0.5);
      this.towerCoverCache.set(key, c);
    }
    return c;
  }

  private bestSpot(def: TowerDef): { x: number; y: number; cover: { ground: number; air: number } } | null {
    const g = this.game;
    const key = `${def.range}:${def.targets}`;
    const cached = this.spotCache.get(def.id);
    if (cached !== undefined) return cached;
    let scores = this.coverCache.get(key);
    if (!scores) {
      scores = new Float64Array(this.spots.length);
      const reach = def.range + g.cell;
      this.spots.forEach(([x, y], i) => {
        const c = this.coverAt((x + 1) * g.cell, (y + 1) * g.cell, reach);
        scores![i] = def.targets === 'air' ? c.air : def.targets === 'ground' ? c.ground : c.ground + c.air * 0.25;
      });
      this.coverCache.set(key, scores);
    }
    const order = [...scores.keys()].sort((a, b) => scores![b] - scores![a]);
    for (const i of order.slice(0, 12)) {
      const [x, y] = this.spots[i];
      if (scores[i] <= 0) break;
      if (this.bad.has(`${x},${y}`)) continue;
      const terrainOk = g.canPlace(def.id, x, y, false);
      if (!terrainOk.ok && terrainOk.reason !== 'gold') continue;
      if (terrainOk.ok && !g.canPlace(def.id, x, y, true).ok) continue;
      const spot = { x, y, cover: this.coverAt((x + 1) * g.cell, (y + 1) * g.cell, def.range + g.cell) };
      this.spotCache.set(def.id, spot);
      return spot;
    }
    this.spotCache.set(def.id, null);
    return null;
  }

  private facilitySpot(): [number, number] | null {
    const g = this.game;
    let best: [number, number] | null = null;
    let bestCover = Infinity;
    for (let y = 0; y < g.rows - 2; y += 3) {
      for (let x = 0; x < g.cols - 2; x += 3) {
        if (!this.free(x, y, 3)) continue;
        const c = this.coverAt((x + 1.5) * g.cell, (y + 1.5) * g.cell, 600);
        const cover = c.ground + c.air;
        if (cover < bestCover && g.canPlace('hC09', x, y, true).ok) { best = [x, y]; bestCover = cover; if (cover === 0) return best; }
      }
    }
    return best;
  }
}

export interface RunResult {
  strategy: Strategy;
  difficulty: string;
  seed: number;
  result: 'won' | 'lost' | 'timeout';
  level: number;
  leaks: number;
  goldEarned: number;
  goldLeft: number;
  towers: number;
  topTower: string;
  livesBought: number;
}

export function runBot(GameCtor: new (o: GameOptions) => Game, difficulty: Parameters<Game['start']>[0], opts: BotOptions, seed: number, gameOpts: GameOptions = {}): RunResult {
  const g = new GameCtor({ ...gameOpts, seed });
  g.start(difficulty);
  const bot = new Bot(g, opts);
  let earned = g.gold;
  while (!g.over && g.time < 4500) {
    bot.tick();
    const before = g.gold;
    for (let i = 0; i < 10; i++) g.update(0.1);
    earned += Math.max(0, g.gold - before);
  }
  const counts = new Map<string, number>();
  for (const t of g.towers) counts.set(t.def.name, (counts.get(t.def.name) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    strategy: opts.strategy, difficulty, seed,
    result: g.phase === 'won' ? 'won' : g.phase === 'lost' ? 'lost' : 'timeout',
    level: g.level + 1, leaks: g.leaks, goldEarned: earned, goldLeft: g.gold, towers: g.towers.length,
    topTower: top ? `${top[0]} x${top[1]}` : '-', livesBought: bot.livesBought,
  };
}
