import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/sim';
import { TOWERS, WAVES } from '../src/core/data';
import { runBot } from '../src/core/bot';

const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 10; i++) g.update(0.1); };

describe('Game', () => {
  it('has a valid path through all waypoints', () => {
    const g = new Game({ seed: 1 });
    expect(g.fields.length).toBe(g.waypoints.length);
  });

  it('rejects a placement that would seal the lane', () => {
    const g = new Game({ seed: 1 });
    g.start('easy');
    g.gold = 1000;
    for (const x of [16, 18, 20, 22]) expect(g.place('oC33', x, 34).ok).toBe(true);
    for (const y of [16, 18, 20]) expect(g.place('oC33', 34, y).ok).toBe(true);
    expect(g.place('oC33', 34, 22)).toEqual({ ok: false, reason: 'blocks' });
  });

  it('refunds point value on sell and charges upgrade cost', () => {
    const g = new Game({ seed: 1 });
    g.start('easy');
    expect(g.place('oC33', 40, 40).ok).toBe(true);
    const t = g.towers[0];
    expect(g.gold).toBe(8);
    expect(g.upgrade(t.id)).toBe(true);
    expect(g.gold).toBe(4);
    expect(g.sell(t.id)).toBe(true);
    expect(g.gold).toBe(10);
  });

  it('leaks the first creep with no defence and loses on 1 life', () => {
    const g = new Game({ seed: 1 });
    g.start('easy');
    run(g, 200);
    expect(g.phase).toBe('lost');
    expect(g.leaks).toBe(1);
  });

  it('clears level 1 with a few towers and pays bounty + round bonus', () => {
    const g = new Game({ seed: 1 });
    g.start('easy');
    for (const [x, y] of [[56, 46], [62, 46], [56, 54]]) expect(g.place('oC33', x, y).ok).toBe(true);
    run(g, 90);
    expect(g.kills).toBe(10);
    expect(g.phase).toBe('break');
    expect(g.gold).toBe(10 - 6 + 10 * WAVES[0].gold + 5);
  });

  it('applies difficulty hp tables with bug fixes on and original caps off', () => {
    const fixed = new Game({ seed: 1 });
    fixed.start('usg');
    const orig = new Game({ seed: 1, bugfixes: false });
    orig.start('usg');
    expect(fixed.creepHpFor(WAVES[0])).toBe(600);
    expect(orig.creepHpFor(WAVES[0])).toBe(400);
    const n = new Game({ bugfixes: false }); n.start('normal');
    expect(n.creepHpFor(WAVES[12])).toBe(15000);
  });

  it('every upgrade chain resolves to known towers', () => {
    for (const t of Object.values(TOWERS)) if (t.upgradesTo) expect(TOWERS[t.upgradesTo]).toBeDefined();
  });

  it('a well-funded maze can win all 30 levels', () => {
    const g = new Game({ seed: 2 });
    g.start('easy');
    g.gold = 1e7;
    expect(g.place('hC09', 40, 40).ok).toBe(true);
    expect(g.buyCopter('super')).toBe(true);
    let built = 0;
    for (let y = 38; y < 100; y += 2) for (let x = 66; x < 104; x += 2) {
      if (built < 80 && g.place('h000', x, y).ok) built++;
    }
    for (const t of g.towers) while (g.upgrade(t.id));
    expect(built).toBeGreaterThan(40);
    expect(g.towers.filter((t) => t.def.id === 'h007').length).toBe(built);
    while (!g.over && g.time < 4000) run(g, 10);
    expect(g.phase).toBe('won');
  }, 120_000);

  it('pathLengthIf reports longer paths for maze walls and null for blocking spots', () => {
    const g = new Game({ seed: 1 });
    g.start('easy');
    g.gold = 1000;
    const base = g.pathLength();
    for (const x of [16, 18, 20, 22]) g.place('oC33', x, 34);
    for (const y of [16, 18, 20]) g.place('oC33', 34, y);
    expect(g.pathLengthIf('oC33', 34, 22)).toBeNull();
    expect(g.pathLength()).toBeGreaterThanOrEqual(base);
  });

  it('bot only spends earned gold and survives the early game on Easy', () => {
    const r = runBot(Game, 'easy', { strategy: 'defense' }, 1);
    expect(r.goldLeft).toBeGreaterThanOrEqual(0);
    expect(r.level).toBeGreaterThanOrEqual(10);
  }, 60_000);

  it('solo mode applies its rule set and original mode keeps map numbers', () => {
    const solo = new Game({ seed: 1, mode: 'solo' });
    solo.start('easy');
    expect(solo.gold).toBe(20);
    expect(solo.lives).toBe(3);
    expect(solo.bountyFor(WAVES[2])).toBe(5);
    expect(solo.creepHpFor(WAVES[3])).toBe(600);
    solo.level = 10;
    expect(solo.roundBonus()).toBe(35);
    const orig = new Game({ seed: 1 });
    orig.start('easy');
    expect([orig.gold, orig.lives, orig.bountyFor(WAVES[2]), orig.creepHpFor(WAVES[3]), orig.roundBonus()]).toEqual([10, 1, 3, 1000, 5]);
  });

  it('solo route uses the bottom-left rooms and is fully reachable', () => {
    const solo = new Game({ seed: 1, mode: 'solo' });
    const orig = new Game({ seed: 1 });
    expect(solo.waypoints.length).toBe(11);
    expect(solo.fields.every((f, i) => i === 0 || f.length > 0)).toBe(true);
    expect(Number.isFinite(solo.pathLength())).toBe(true);
    expect(solo.pathLength()).toBeGreaterThan(orig.pathLength() * 1.4);
    expect(solo.previewPath().some(([x, y]) => x < 30 * 64 && y > 70 * 64)).toBe(true);
  });

  it('send next wave skips timers, pays the early-call bonus in solo, and overlaps once spawning is done', () => {
    const g = new Game({ seed: 1, mode: 'solo' });
    g.start('easy');
    const gold = g.gold;
    expect(g.earlyCallReward()).toBe(2);
    expect(g.sendNext()).toBe(true);
    expect(g.gold).toBe(gold + 2);
    run(g, 1);
    expect(g.phase).toBe('wave');
    expect(g.canSendNext()).toBe(false);
    expect(g.sendNext()).toBe(false);
    g.lives = 99;
    run(g, 52);
    expect(g.spawned).toBe(10);
    const before = g.gold;
    expect(g.sendNext()).toBe(true);
    expect(g.level).toBe(1);
    expect(g.spawned).toBe(0);
    expect(g.gold).toBe(before + 5);
    const orig = new Game({ seed: 1 });
    orig.start('easy');
    expect(orig.earlyCallReward()).toBe(0);
  });
});

