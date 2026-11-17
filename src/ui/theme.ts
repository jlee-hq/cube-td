import type { Game } from '../core/sim';

export const PX = 7;

export const COLORS = {
  wall: '#0c0e12',
  build: '#2c3a2c',
  walk: '#4a4532',
  gridline: 'rgba(255,255,255,0.035)',
  waypoint: '#7aa2ff',
  spawn: '#e040e0',
  kill: '#ff4040',
  path: 'rgba(255,230,120,0.55)',
  ground: '#ffb060',
  air: '#7fd4ff',
  hpBack: '#400',
  hp: '#4f4',
  ok: 'rgba(80,255,120,0.45)',
  bad: 'rgba(255,60,60,0.45)',
  range: 'rgba(143,179,255,0.8)',
};

export const worldToPx = (game: Game) => PX / game.cell;
