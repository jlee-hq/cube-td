import { Game, type PlaceResult } from '../core/sim';
import { BUILD_MENU, TOWERS, type Mode, type Tier, type TowerDef } from '../core/data';
import { getSfx } from '../audio/sfx';

export const REASONS: Record<Exclude<PlaceResult, { ok: true }>['reason'], string> = {
  gold: 'Not enough gold',
  terrain: 'Cannot build there',
  occupied: 'Something is already there',
  creep: 'A creep is in the way',
  blocks: 'That would block the path',
  locked: 'Buy that copter first',
  phase: 'Pick a difficulty first',
};

const MODE_KEY = 'cube-td:mode';

export class Controller {
  game: Game;
  placing: string | null = null;
  selectedId = 0;
  hover: { cx: number; cy: number } | null = null;
  speed = 1;
  paused = false;
  tab: Tier = 'basic';
  toast = '';
  toastUntil = 0;
  showPath = true;
  readonly sfx = getSfx();
  mode: Mode = localStorage.getItem(MODE_KEY) === 'original' ? 'original' : 'solo';
  private listeners = new Set<() => void>();

  constructor(game = new Game()) {
    this.game = game;
    this.game.setMode(this.mode);
    window.addEventListener('keydown', (e) => this.key(e));
  }

  onChange(fn: () => void) { this.listeners.add(fn); }
  changed() { this.listeners.forEach((fn) => fn()); }

  reset() {
    this.game = new Game({ mode: this.mode });
    this.placing = null;
    this.selectedId = 0;
    this.tab = 'basic';
    this.paused = false;
    this.changed();
  }

  tick(dt: number) {
    if (!this.paused) this.game.update(dt * this.speed);
    this.sfx.watch(this.game);
    if (this.selectedId && !this.game.towers.some((t) => t.id === this.selectedId)) this.selectedId = 0;
  }

  get selected() { return this.game.towers.find((t) => t.id === this.selectedId); }

  origin(def: TowerDef, cx: number, cy: number) {
    return { x: Math.round(cx - def.size / 2 + 0.5), y: Math.round(cy - def.size / 2 + 0.5) };
  }

  ghost(): { def: TowerDef; x: number; y: number; ok: boolean } | null {
    if (!this.placing || !this.hover) return null;
    const def = TOWERS[this.placing];
    const { x, y } = this.origin(def, this.hover.cx, this.hover.cy);
    return { def, x, y, ok: this.game.canPlace(def.id, x, y, false).ok };
  }

  pointerMove(cx: number, cy: number) { this.hover = { cx, cy }; }
  pointerLeave() { this.hover = null; }

  pointerDown(cx: number, cy: number, button: number, shift: boolean) {
    if (button === 2) return this.cancel();
    if (this.placing) {
      const def = TOWERS[this.placing];
      const { x, y } = this.origin(def, cx, cy);
      const res = this.game.place(def.id, x, y);
      if (!res.ok) this.flash(REASONS[res.reason]);
      else {
        this.sfx.play('build');
        if (!shift) this.placing = null;
      }
    } else {
      this.selectedId = this.game.towerAtCell(cx, cy)?.id ?? 0;
    }
    this.changed();
  }

  startPlacing(id: string) {
    this.placing = id;
    this.selectedId = 0;
    this.changed();
  }

  cancel() {
    this.placing = null;
    this.selectedId = 0;
    this.changed();
  }

  action(name: string, arg?: string) {
    const g = this.game;
    switch (name) {
      case 'start': g.start(arg as Parameters<Game['start']>[0]); break;
      case 'mode':
        this.mode = arg as Mode;
        localStorage.setItem(MODE_KEY, this.mode);
        g.setMode(this.mode);
        break;
      case 'build': this.startPlacing(arg!); return;
      case 'tab': this.tab = arg as Tier; break;
      case 'upgrade': if (g.upgrade(this.selectedId)) this.sfx.play('upgrade'); else this.flash('Cannot upgrade'); break;
      case 'sell': if (g.sell(this.selectedId)) this.sfx.play('sell'); this.selectedId = 0; break;
      case 'life': if (g.buyLife()) this.sfx.play('life'); else this.flash('Need 100 gold'); break;
      case 'copter': if (g.buyCopter(arg as Exclude<Tier, 'basic'>)) this.sfx.play('unlock'); else this.flash(g.hasFacility ? 'Not enough gold' : 'Build a Construction Facility first'); break;
      case 'speed': this.speed = Number(arg); break;
      case 'pause': this.paused = !this.paused; break;
      case 'next': if (!g.sendNext()) this.flash('Wait until the current wave has finished spawning'); break;
      case 'path': this.showPath = !this.showPath; break;
      case 'mute': this.sfx.toggleMute(); break;
      case 'restart': this.reset(); return;
    }
    this.changed();
  }

  flash(text: string) {
    this.sfx.play('error');
    this.toast = text;
    this.toastUntil = performance.now() + 1800;
  }

  private key(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') this.cancel();
    else if (k === ' ') { e.preventDefault(); this.action('pause'); }
    else if (k === 'u' && this.selectedId) this.action('upgrade');
    else if (k === 's' && this.selectedId) this.action('sell');
    else if (k === 'p') this.action('path');
    else if (k === 'm') this.action('mute');
    else if (k === 'n') this.action('next');
    else if (/^[1-6]$/.test(k)) {
      const id = BUILD_MENU[this.tab][Number(k) - 1];
      if (id) this.startPlacing(id);
    }
  }
}
