export type DifficultyId = 'easy' | 'normal' | 'hard' | 'insane' | 'ultimate' | 'usg';
export type Targets = 'ground' | 'air' | 'both';
export type Tier = 'basic' | 'super' | 'advanced';

export interface WaveDef {
  id: string;
  name: string;
  maxHp: number;
  speed: number;
  armor: number;
  gold: number;
  air: boolean;
  hp: Record<Exclude<DifficultyId, 'ultimate'>, number>;
}

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  startGold: number;
  speedMul: number;
  startDelay: number;
}

export interface Splash { full: number; medium: number; small: number }

export interface TowerDef {
  id: string;
  name: string;
  tier: Tier;
  cost: number;
  sell: number;
  damage: number;
  cooldown: number;
  range: number;
  targets: Targets | 'none';
  size: number;
  color: string;
  upgradesTo?: string;
  splash?: Splash;
  slow?: { factor: number; duration: number };
  stun?: { chance: number; duration: number };
  crit?: { chance: number; mult: number };
  snare?: { duration: number; cooldown: number };
  armorShred?: { amount: number; duration: number };
  bounce?: { targets: number; loss: number };
  assumed?: string[];
  unlocks?: boolean;
}

export const MAX_MOVE_SPEED = 522;
export const SPAWN_INTERVAL = 5;
export const CREEPS_PER_WAVE = 10;
export const BREAK_TIME = 25;
export const ROUND_BONUS = 5;
export const LIFE_COST = 100;
export const START_LIVES = 1;
export const COPTER_COST: Record<Exclude<Tier, 'basic'>, number> = { super: 10, advanced: 25 };

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy', name: 'Easy', startGold: 10, speedMul: 1, startDelay: 12 },
  { id: 'normal', name: 'Normal', startGold: 10, speedMul: 1.05, startDelay: 12 },
  { id: 'hard', name: 'Hard', startGold: 10, speedMul: 1.1, startDelay: 12 },
  { id: 'insane', name: 'Insane', startGold: 12, speedMul: 1.15, startDelay: 12 },
  { id: 'ultimate', name: 'Ultimate', startGold: 16, speedMul: 1.2, startDelay: 12 },
  { id: 'usg', name: 'UltraSuperGodly', startGold: 26, speedMul: 1, startDelay: 18 },
];

const w = (id: string, name: string, maxHp: number, speed: number, armor: number, gold: number, air: boolean,
  easy: number, normal: number, hard: number, insane: number, usg: number): WaveDef =>
  ({ id, name, maxHp, speed, armor, gold, air, hp: { easy, normal, hard, insane, usg } });

export const WAVES: WaveDef[] = [
  w('hC26', 'Noob', 400, 300, 0, 1, false, 100, 125, 150, 175, 600),
  w('hC27', 'Bigger Noob', 1000, 310, 0, 1, false, 250, 313, 375, 438, 1400),
  w('hC28', 'Armored Noob', 2000, 320, 0, 3, false, 550, 625, 750, 875, 4800),
  w('nC51', 'Flying Noob', 4000, 330, 0, 3, true, 1000, 1375, 2250, 2625, 6550),
  w('hC30', 'Dood', 6000, 340, 0, 4, false, 1500, 2500, 3000, 3500, 8000),
  w('hC31', 'Leet Dood', 8000, 350, 0, 4, false, 2000, 3750, 4500, 5250, 11000),
  w('lvl7', 'Eleet Dood', 12000, 360, 0, 4, false, 3000, 4250, 6000, 7000, 15000),
  w('lvl8', 'Flying Dood', 16000, 370, 0, 4, true, 4000, 5000, 8000, 9000, 18000),
  w('lvl9', 'Scary Dood', 20000, 380, 0, 6, false, 6000, 7500, 9000, 10500, 26000),
  w('lv10', 'Mad Cow', 25000, 390, 0, 6, false, 8000, 10000, 12000, 14000, 34000),
  w('lv11', 'Gobbo', 30000, 400, 0, 6, false, 10000, 12500, 15000, 17500, 43000),
  w('lv12', 'Batbird', 35000, 410, 0, 6, true, 12000, 15000, 18000, 21000, 51000),
  w('lv13', 'Bobo', 15000, 420, 0, 6, false, 15000, 18750, 22500, 26250, 60000),
  w('lv14', 'Meowoman', 40000, 430, 0, 6, false, 20000, 25000, 30000, 35000, 78000),
  w('lv15', 'Fanboy', 50000, 440, 0, 6, false, 25000, 31250, 37500, 43750, 80000),
  w('lv16', 'Flying Fanboy', 65000, 450, 0, 8, true, 30000, 37500, 45000, 52500, 100000),
  w('uC32', 'Fat Fanboy', 35000, 460, 0, 8, false, 35000, 43750, 52500, 61250, 120000),
  w('lv18', 'Fuzzier Wuzzier', 80000, 470, 0, 8, false, 40000, 50000, 60000, 70000, 140000),
  w('lv19', 'Barkman', 100000, 480, 0, 8, false, 55000, 66250, 77500, 88750, 160000),
  w('lv20', 'Purple Poot', 120000, 490, 0, 8, true, 60000, 72500, 85000, 97500, 180000),
  w('lv21', 'Ayche Pea', 140000, 500, 4, 10, false, 65000, 78750, 92500, 105250, 200000),
  w('lv22', 'Ayche Pea Q Ti', 160000, 510, 6, 10, false, 70000, 85000, 100000, 115000, 220000),
  w('lv23', 'Rob the Zombie', 180000, 520, 8, 10, false, 75000, 91250, 107500, 123750, 240000),
  w('lv24', 'Not a Ferret', 200000, 530, 10, 10, true, 80000, 97500, 115000, 132500, 260000),
  w('lv25', 'Captain Horsey', 225000, 540, 12, 10, false, 85000, 108750, 127000, 135750, 280000),
  w('lv26', 'Living Meat Blob', 250000, 550, 14, 10, false, 90000, 110000, 130000, 150000, 300000),
  w('lv27', 'Fuzziest Wuzziest', 275000, 560, 16, 10, false, 95000, 116250, 137500, 160000, 320000),
  w('lv28', 'Bird with Antlers', 300000, 570, 18, 12, true, 100000, 122500, 145000, 167500, 340000),
  w('lv29', 'Chirpy', 350000, 580, 20, 12, false, 125000, 148750, 172000, 190000, 360000),
  w('lv30', 'Mr. Roboto', 400000, 600, 20, 60, false, 150000, 175000, 200000, 225000, 400000),
];

const GROUND_SPLASH: Splash = { full: 50, medium: 100, small: 150 };
const OWTW_RANGE = 'range (estimated)';
const GUARD_RANGE = 'range (estimated)';
const DEFAULT_PROCS = 'effect strengths (estimated)';

const t = (d: TowerDef): TowerDef => d;

export const TOWERS: Record<string, TowerDef> = Object.fromEntries([
  t({ id: 'oC33', name: 'Dilapidated Defense Tower', tier: 'basic', cost: 2, sell: 2, damage: 10, cooldown: 1, range: 800, targets: 'both', size: 2, color: '#b0b8c8', upgradesTo: 'oC36', assumed: [OWTW_RANGE] }),
  t({ id: 'oC36', name: 'Rickety Defense Tower', tier: 'basic', cost: 4, sell: 6, damage: 30, cooldown: 1, range: 800, targets: 'both', size: 2, color: '#9aa6c0', upgradesTo: 'oC08', assumed: [OWTW_RANGE] }),
  t({ id: 'oC08', name: 'Sturdy Defense Tower', tier: 'basic', cost: 8, sell: 14, damage: 90, cooldown: 1, range: 800, targets: 'both', size: 2, color: '#7f90b8', upgradesTo: 'oC39', assumed: [OWTW_RANGE] }),
  t({ id: 'oC39', name: 'Reinforced Defense Tower', tier: 'basic', cost: 16, sell: 30, damage: 301, cooldown: 1, range: 900, targets: 'both', size: 2, color: '#627ab0', upgradesTo: 'oC01' }),
  t({ id: 'oC01', name: 'Indomitable Defense Tower', tier: 'basic', cost: 32, sell: 62, damage: 1001, cooldown: 1, range: 1000, targets: 'both', size: 2, color: '#4560a8' }),

  t({ id: 'oC35', name: 'Dilapidated Ground Tower', tier: 'basic', cost: 2, sell: 2, damage: 20, cooldown: 1.2, range: 800, targets: 'ground', size: 2, color: '#c8b090', upgradesTo: 'oC34', splash: GROUND_SPLASH, assumed: [OWTW_RANGE] }),
  t({ id: 'oC34', name: 'Rickety Ground Tower', tier: 'basic', cost: 4, sell: 6, damage: 60, cooldown: 1.2, range: 800, targets: 'ground', size: 2, color: '#c09a70', upgradesTo: 'oC07', splash: GROUND_SPLASH, assumed: [OWTW_RANGE] }),
  t({ id: 'oC07', name: 'Sturdy Ground Tower', tier: 'basic', cost: 8, sell: 14, damage: 180, cooldown: 1.3, range: 800, targets: 'ground', size: 2, color: '#b48450', upgradesTo: 'oC38', splash: GROUND_SPLASH, assumed: [OWTW_RANGE] }),
  t({ id: 'oC38', name: 'Reinforced Ground Tower', tier: 'basic', cost: 16, sell: 30, damage: 540, cooldown: 1.2, range: 800, targets: 'ground', size: 2, color: '#a86e34', upgradesTo: 'hC44', splash: GROUND_SPLASH, assumed: [OWTW_RANGE] }),
  t({ id: 'hC44', name: 'Indomitable Ground Punisher', tier: 'basic', cost: 48, sell: 78, damage: 1800, cooldown: 1.2, range: 900, targets: 'ground', size: 2, color: '#8c4a18', splash: GROUND_SPLASH, crit: { chance: 0.15, mult: 2 }, assumed: [DEFAULT_PROCS] }),

  t({ id: 'oC40', name: 'Anti-Air Crossbow', tier: 'basic', cost: 15, sell: 15, damage: 300, cooldown: 1, range: 1000, targets: 'air', size: 2, color: '#a8d8e8', upgradesTo: 'hC42' }),
  t({ id: 'hC42', name: 'Anti-Air Gunner', tier: 'basic', cost: 30, sell: 45, damage: 900, cooldown: 0.75, range: 1500, targets: 'air', size: 2, color: '#70c0dc', upgradesTo: 'oC41' }),
  t({ id: 'oC41', name: 'Air Devastator', tier: 'basic', cost: 45, sell: 90, damage: 3600, cooldown: 1, range: 1600, targets: 'air', size: 2, color: '#30a0d0' }),

  t({ id: 'oC48', name: 'Snare Tower', tier: 'basic', cost: 25, sell: 25, damage: 101, cooldown: 0.9, range: 1000, targets: 'both', size: 2, color: '#90c050', slow: { factor: 0.5, duration: 4 }, snare: { duration: 3, cooldown: 8 }, assumed: [DEFAULT_PROCS] }),
  t({ id: 'oC45', name: 'Frost Tower', tier: 'basic', cost: 30, sell: 30, damage: 601, cooldown: 1.1, range: 900, targets: 'ground', size: 2, color: '#80e0ff', splash: GROUND_SPLASH, slow: { factor: 0.7, duration: 3 }, assumed: [DEFAULT_PROCS] }),
  t({ id: 'hC09', name: 'Construction Facility', tier: 'basic', cost: 30, sell: 30, damage: 0, cooldown: 0, range: 0, targets: 'none', size: 3, color: '#d0c060', unlocks: true }),

  t({ id: 'h000', name: 'Super Tower', tier: 'super', cost: 1, sell: 1, damage: 51, cooldown: 2, range: 700, targets: 'both', size: 2, color: '#e8d0f0', upgradesTo: 'h001', assumed: [GUARD_RANGE] }),
  t({ id: 'h001', name: 'Super Tower 2', tier: 'super', cost: 2, sell: 3, damage: 101, cooldown: 1.8, range: 700, targets: 'both', size: 2, color: '#dcb8ec', upgradesTo: 'h003', assumed: [GUARD_RANGE] }),
  t({ id: 'h003', name: 'Super Tower 3', tier: 'super', cost: 4, sell: 7, damage: 301, cooldown: 1.6, range: 700, targets: 'both', size: 2, color: '#d0a0e8', upgradesTo: 'h002', assumed: [GUARD_RANGE] }),
  t({ id: 'h002', name: 'Super Tower 4', tier: 'super', cost: 8, sell: 15, damage: 601, cooldown: 1.4, range: 700, targets: 'both', size: 2, color: '#c488e4', upgradesTo: 'h004', assumed: [GUARD_RANGE] }),
  t({ id: 'h004', name: 'Super Tower 5', tier: 'super', cost: 16, sell: 31, damage: 801, cooldown: 1.2, range: 700, targets: 'both', size: 2, color: '#b870e0', upgradesTo: 'h005', assumed: [GUARD_RANGE] }),
  t({ id: 'h005', name: 'Super Tower 6', tier: 'super', cost: 32, sell: 63, damage: 1001, cooldown: 1, range: 700, targets: 'both', size: 2, color: '#a858d8', upgradesTo: 'h006', assumed: [GUARD_RANGE] }),
  t({ id: 'h006', name: 'Super Tower 7', tier: 'super', cost: 64, sell: 127, damage: 1401, cooldown: 0.8, range: 700, targets: 'both', size: 2, color: '#9440cc', upgradesTo: 'h007', assumed: [GUARD_RANGE] }),
  t({ id: 'h007', name: 'Super Tower 8', tier: 'super', cost: 100, sell: 227, damage: 2001, cooldown: 0.6, range: 700, targets: 'both', size: 2, color: '#7a28b8', assumed: [GUARD_RANGE] }),
  t({ id: 'e000', name: 'Mini-Gun', tier: 'super', cost: 90, sell: 90, damage: 400, cooldown: 0.3, range: 800, targets: 'both', size: 2, color: '#e0e0e0', bounce: { targets: 3, loss: 0.35 }, assumed: ['cooldown (estimated)', 'bounce values (estimated)'] }),

  t({ id: 'oC43', name: 'Shrapnel Cannon', tier: 'advanced', cost: 70, sell: 70, damage: 400, cooldown: 0.4, range: 1000, targets: 'both', size: 2, color: '#909090', splash: { full: 100, medium: 200, small: 300 } }),
  t({ id: 'oC47', name: 'Death Tower', tier: 'advanced', cost: 80, sell: 70, damage: 1300, cooldown: 1.5, range: 800, targets: 'both', size: 2, color: '#404050', crit: { chance: 0.15, mult: 2 }, assumed: [OWTW_RANGE, DEFAULT_PROCS] }),
  t({ id: 'oC02', name: 'Storm Tower', tier: 'advanced', cost: 40, sell: 40, damage: 1225, cooldown: 1.8, range: 1000, targets: 'both', size: 2, color: '#5070ff', splash: GROUND_SPLASH }),
  t({ id: 'oC46', name: 'Pulse Tower', tier: 'advanced', cost: 70, sell: 70, damage: 300, cooldown: 0.7, range: 1000, targets: 'both', size: 2, color: '#40e0a0', stun: { chance: 0.15, duration: 1 }, assumed: [DEFAULT_PROCS] }),
  t({ id: 'oC03', name: 'Fire Tower', tier: 'advanced', cost: 60, sell: 60, damage: 1100, cooldown: 1.4, range: 900, targets: 'both', size: 3, color: '#ff6030', splash: { full: 100, medium: 200, small: 300 }, armorShred: { amount: 4, duration: 10 }, assumed: ['damage range (estimated)', DEFAULT_PROCS] }),
  t({ id: 'oC49', name: 'The Cube', tier: 'advanced', cost: 90, sell: 90, damage: 1000, cooldown: 0.8, range: 1000, targets: 'both', size: 4, color: '#30d0d0', crit: { chance: 0.15, mult: 2 }, snare: { duration: 2, cooldown: 10 }, assumed: [DEFAULT_PROCS] }),
].map((d) => [d.id, d]));

export const BUILD_MENU: Record<Tier, string[]> = {
  basic: ['oC33', 'oC35', 'oC40', 'oC48', 'oC45', 'hC09'],
  super: ['h000', 'e000'],
  advanced: ['oC43', 'oC47', 'oC02', 'oC46', 'oC03', 'oC49'],
};

export const avgDps = (d: TowerDef) => (d.cooldown > 0 ? d.damage / d.cooldown : 0);
export const armorFactor = (armor: number) => (armor >= 0 ? 1 - (0.06 * armor) / (1 + 0.06 * armor) : 2 - Math.pow(0.94, -armor));

export type Mode = 'original' | 'solo';

export interface Rules {
  bountyMul: number;
  roundBonusBase: number;
  roundBonusPerLevel: number;
  hpMul: number;
  airHpMul: number;
  startLives: number;
  startGoldBonus: number;
  byDifficulty?: Partial<Record<DifficultyId, Partial<Omit<Rules, 'byDifficulty'>>>>;
}

export const RULES: Record<Mode, Rules> = {
  original: { bountyMul: 1, roundBonusBase: ROUND_BONUS, roundBonusPerLevel: 0, hpMul: 1, airHpMul: 1, startLives: START_LIVES, startGoldBonus: 0 },
  solo: {
    bountyMul: 1.5, roundBonusBase: 5, roundBonusPerLevel: 3, hpMul: 1, airHpMul: 0.6, startLives: 3, startGoldBonus: 10,
    byDifficulty: {
      normal: { bountyMul: 1.25, roundBonusPerLevel: 2, airHpMul: 0.75 },
      hard: { bountyMul: 1.1, roundBonusPerLevel: 1, airHpMul: 0.85 },
      insane: { bountyMul: 1, roundBonusPerLevel: 1, airHpMul: 0.9 },
    },
  },
};

export const MODE_INFO: Record<Mode, { name: string; blurb: string }> = {
  original: { name: 'Original', blurb: 'Exact map numbers. Built for 8 players; very hard solo.' },
  solo: { name: 'Solo balance', blurb: 'More gold, scaling round bonus, softer air waves, 3 lives.' },
};
