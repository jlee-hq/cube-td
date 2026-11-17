import type { Controller } from './controller';

export function applyDemo(ctrl: Controller) {
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('demo')) return;
  const g = ctrl.game;
  g.start('easy');
  g.gold = 100000;
  g.level = 14;
  g.place('hC09', 40, 40);
  g.buyCopter('super');
  g.buyCopter('advanced');
  const builds: [string, number, number, number][] = [
    ['oC33', 56, 44, 4], ['oC35', 63, 44, 4], ['oC40', 56, 56, 2], ['oC45', 63, 56, 0], ['oC48', 66, 46, 0],
    ['h000', 70, 52, 7], ['e000', 74, 46, 0], ['oC43', 77, 56, 0], ['oC47', 88, 46, 0], ['oC02', 88, 54, 0],
    ['oC46', 92, 58, 0], ['oC03', 96, 44, 0], ['oC49', 100, 52, 0], ['oC33', 52, 50, 0], ['oC35', 52, 56, 2],
  ];
  g.lives = 99;
  const walk = new URLSearchParams(location.search).get('demo') === 'walk';
  for (const [id, x, y, ups] of walk ? builds.filter(([id]) => ['oC33', 'oC35', 'oC45', 'oC48', 'oC02'].includes(id)) : builds) {
    if (!g.place(id, x, y).ok) continue;
    const t = g.towers[g.towers.length - 1];
    for (let i = 0; i < ups; i++) g.upgrade(t.id);
  }
  g.phaseTimer = 0;
  for (let i = 0; i < 450; i++) g.update(0.1);
  ctrl.selectedId = g.towers.find((t) => t.def.id === 'oC49')?.id ?? 0;
  ctrl.changed();
  window.dispatchEvent(new Event('pointerdown'));
}
