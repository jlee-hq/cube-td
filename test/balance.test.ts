import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { Game } from '../src/core/sim';
import { runBot, type RunResult, type Strategy } from '../src/core/bot';
import type { DifficultyId, Mode, Rules } from '../src/core/data';

const strategies = (process.env.STRATS ?? 'defense,ground,super,greedy,maze').split(',') as Strategy[];
const difficulties = (process.env.DIFFS ?? 'easy,normal,hard,insane,ultimate,usg').split(',') as DifficultyId[];
const seeds = (process.env.SEEDS ?? '1').split(',').map(Number);
const lives = process.env.LIVES === '1';
const out = process.env.OUT ?? 'balance.log';
const mode = (process.env.GAME_MODE ?? 'original') as Mode;
const rules = process.env.RULES ? (JSON.parse(process.env.RULES) as Partial<Rules>) : undefined;

it('balance report', () => {
  const rows: RunResult[] = [];
  writeFileSync(out, '');
  for (const d of difficulties) for (const s of strategies) for (const seed of seeds) {
    const t = performance.now();
    const r = runBot(Game, d, { strategy: s, buyLives: lives }, seed, { mode, rules });
    rows.push(r);
    const line = (`${d.padEnd(8)} ${s.padEnd(8)} seed ${seed}: ${r.result.padEnd(4)} L${String(r.level).padStart(2)} leaks ${r.leaks} earned ${r.goldEarned} left ${r.goldLeft} towers ${r.towers} lives+${r.livesBought} top ${r.topTower} (${Math.round(performance.now() - t)}ms)`);
    appendFileSync(out, line + String.fromCharCode(10));
    console.log(line);
  }
}, 3_600_000);
