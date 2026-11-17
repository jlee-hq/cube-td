import '../ui/style.css';
import * as Phaser from 'phaser';
import { Controller } from '../ui/controller';
import { mountPanel } from '../ui/panel';
import { applyDemo } from '../ui/demo';
import { loadArt, type ArtSource } from '../art/registry';
import { AIMS, PROJECTILES, creepScale, familyOf, terrain, type ProjectileKind } from '../art/procedural';
import { WAVES, type TowerDef } from '../core/data';
import type { Creep, Effect, Game, Tower } from '../core/sim';

const WP = 16;
const TERRAIN_PX = 24;
const MAX_ZOOM = 3;

const hex = (css: string) => parseInt(css.slice(1), 16);
const lerpAngle = (a: number, b: number, t: number) => a + Phaser.Math.Angle.Wrap(b - a) * t;

interface TowerView { base: Phaser.GameObjects.Image; turret?: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; defId: string; rot: number }
interface CreepView { img: Phaser.GameObjects.Image; shadow?: Phaser.GameObjects.Image; rot: number; px: number; py: number; phase: number }
interface Bolt { pts: [number, number][]; color: number; ttl: number; max: number; width: number }

const GLOW: Partial<Record<string, number>> = { fire: 0xff7030, frost: 0x80e0ff, cube: 0x40ffff, storm: 0x7090ff, death: 0xa060ff, pulse: 0x40ffb0, snare: 0xa0ff60 };
const ADDITIVE: ProjectileKind[] = ['bolt', 'orb', 'fireball', 'bullet'];

class LaneScene extends Phaser.Scene {
  private art: Map<string, ArtSource>;
  private ctrl: Controller;
  private pathG!: Phaser.GameObjects.Graphics;
  private overlayG!: Phaser.GameObjects.Graphics;
  private hpG!: Phaser.GameObjects.Graphics;
  private boltG!: Phaser.GameObjects.Graphics;
  private ghostBase!: Phaser.GameObjects.Image;
  private ghostTurret!: Phaser.GameObjects.Image;
  private portals: Phaser.GameObjects.Image[] = [];
  private terrainImg!: Phaser.GameObjects.Image;
  private routeKey = '';
  private towers = new Map<number, TowerView>();
  private creeps = new Map<number, CreepView>();
  private bolts: Bolt[] = [];
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private seen = new WeakSet<Effect>();
  private gameRef: Game;
  private minZoom = 0.3;
  private drag = { active: false, moved: false, x: 0, y: 0 };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private dashOffset = 0;
  private pathKey = '';
  private pathPts: number[][] = [];
  private serial = 0;

  constructor(art: Map<string, ArtSource>, ctrl: Controller) {
    super('lane');
    this.art = art;
    this.ctrl = ctrl;
    this.gameRef = ctrl.game;
  }

  get k() { return WP / this.ctrl.game.cell; }

  create() {
    for (const [key, src] of this.art) {
      if (src instanceof HTMLCanvasElement) this.textures.addCanvas(key, src);
      else this.textures.addImage(key, src);
    }
    const g = this.ctrl.game;
    this.terrainImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(0);
    this.pathG = this.add.graphics().setDepth(1);
    this.portals = ['portal:spawn', 'portal:exit'].map((key) => this.add.image(0, 0, key).setDisplaySize(WP * 4, WP * 4).setDepth(2));
    this.syncRoute(g);
    this.hpG = this.add.graphics().setDepth(15);
    this.boltG = this.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.overlayG = this.add.graphics().setDepth(20);
    this.ghostBase = this.add.image(0, 0, 'tower:oC33').setDepth(19).setAlpha(0.6).setVisible(false);
    this.ghostTurret = this.add.image(0, 0, 'turret:oC33').setDepth(19).setAlpha(0.6).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, g.cols * WP, g.rows * WP);
    this.fitCamera(true);
    this.scale.on('resize', () => this.fitCamera(false));
    this.setupInput();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fit')) this.toggleFit();
  }

  private fitCamera(reset: boolean) {
    const cam = this.cameras.main;
    const g = this.ctrl.game;
    this.minZoom = Math.min(cam.width / (g.cols * WP), cam.height / (g.rows * WP));
    if (reset) this.focusBuildArea();
    else if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
  }

  private focusBuildArea() {
    const cam = this.cameras.main;
    const g = this.ctrl.game;
    cam.setZoom(Math.max(this.minZoom, Math.min(1.25, this.minZoom * 1.9)));
    cam.centerOn((g.cols * WP) / 2, (g.rows * WP) * 0.48);
  }

  private toggleFit() {
    const cam = this.cameras.main;
    const g = this.ctrl.game;
    if (cam.zoom > this.minZoom + 0.01) {
      cam.setZoom(this.minZoom);
      cam.centerOn((g.cols * WP) / 2, (g.rows * WP) / 2);
    } else this.focusBuildArea();
  }

  private setupInput() {
    const cam = this.cameras.main;
    this.input.mouse?.disableContextMenu();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.on('keydown-F', () => this.toggleFit());
    const cellOf = (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      return { cx: Math.floor(w.x / WP), cy: Math.floor(w.y / WP) };
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) { const { cx, cy } = cellOf(p); this.ctrl.pointerDown(cx, cy, 2, false); return; }
      this.drag = { active: true, moved: false, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const { cx, cy } = cellOf(p);
      this.ctrl.pointerMove(cx, cy);
      if (!this.drag.active || !p.isDown) return;
      if (!this.drag.moved && Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6 && (!this.ctrl.placing || p.middleButtonDown())) this.drag.moved = true;
      if (this.drag.moved) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.drag.active && !this.drag.moved && p.button === 0) {
        const { cx, cy } = cellOf(p);
        this.ctrl.pointerDown(cx, cy, 0, (p.event as MouseEvent).shiftKey);
      }
      this.drag.active = false;
    });
    this.input.on('gameout', () => this.ctrl.pointerLeave());
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      const zoom = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), this.minZoom, MAX_ZOOM);
      cam.setZoom(zoom);
      cam.scrollX = before.x - (p.x - cam.width / 2) / zoom - cam.width / 2;
      cam.scrollY = before.y - (p.y - cam.height / 2) / zoom - cam.height / 2;
    });
  }

  update(time: number, delta: number) {
    const dt = Math.min(0.1, delta / 1000);
    this.ctrl.tick(dt);
    const g = this.ctrl.game;
    if (g !== this.gameRef) this.resetViews(g);
    this.syncRoute(g);
    const cam = this.cameras.main;
    if (this.cursors) {
      const v = (700 * dt) / cam.zoom;
      if (this.cursors.left.isDown) cam.scrollX -= v;
      if (this.cursors.right.isDown) cam.scrollX += v;
      if (this.cursors.up.isDown) cam.scrollY -= v;
      if (this.cursors.down.isDown) cam.scrollY += v;
    }
    this.portals.forEach((p, i) => (p.rotation += dt * (i ? -1.2 : 1.6)));
    this.drawPath(g, dt);
    this.syncTowers(g, dt, time);
    this.syncCreeps(g, dt, time);
    this.handleEffects(g);
    this.drawBolts(dt);
    this.drawOverlay(g, time);
  }

  private syncRoute(g: Game) {
    const key = g.waypoints.map((w) => w.x + ',' + w.y).join(';');
    if (key === this.routeKey) return;
    this.routeKey = key;
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    this.textures.addCanvas('terrain', terrain(g, TERRAIN_PX));
    this.terrainImg.setTexture('terrain').setDisplaySize(g.cols * WP, g.rows * WP);
    const wps = g.waypoints;
    [wps[0], wps[wps.length - 1]].forEach((r, i) => this.portals[i].setPosition((r.x + r.w / 2) * this.k, (r.y + r.h / 2) * this.k));
    this.pathKey = '';
  }

  private resetViews(g: Game) {
    this.gameRef = g;
    this.serial++;
    for (const v of this.towers.values()) { v.base.destroy(); v.turret?.destroy(); v.glow?.destroy(); }
    for (const v of this.creeps.values()) { v.img.destroy(); v.shadow?.destroy(); }
    this.towers.clear();
    this.creeps.clear();
    this.bolts = [];
  }

  private drawPath(g: Game, dt: number) {
    const pg = this.pathG;
    pg.clear();
    if (!this.ctrl.showPath) return;
    this.dashOffset = (this.dashOffset + dt * 18) % 14;
    const key = `${this.serial}:${g.version}`;
    if (this.pathKey !== key) {
      this.pathKey = key;
      this.pathPts = g.previewPath().map(([x, y]) => [x * this.k, y * this.k]);
    }
    const pts = this.pathPts;
    pg.lineStyle(2, 0xffe680, 0.55);
    let carry = -this.dashOffset;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      let d = carry;
      while (d < len) {
        const a = Math.max(0, d);
        const b = Math.min(len, d + 7);
        if (b > a) pg.lineBetween(x1 + ((x2 - x1) * a) / len, y1 + ((y2 - y1) * a) / len, x1 + ((x2 - x1) * b) / len, y1 + ((y2 - y1) * b) / len);
        d += 14;
      }
      carry = d - len;
    }
  }

  private towerXY(t: Tower): [number, number] { return [(t.cx + t.def.size / 2) * WP, (t.cy + t.def.size / 2) * WP]; }

  private makeTowerView(t: Tower): TowerView {
    const [x, y] = this.towerXY(t);
    const size = t.def.size * WP;
    const base = this.add.image(x, y, `tower:${t.def.id}`).setDisplaySize(size, size).setDepth(3);
    const view: TowerView = { base, defId: t.def.id, rot: t.aim };
    this.dressTower(view, t.def, x, y);
    return view;
  }

  private dressTower(view: TowerView, def: TowerDef, x: number, y: number) {
    const size = def.size * WP;
    view.base.setTexture(`tower:${def.id}`).setDisplaySize(size, size);
    const { family } = familyOf(def.id);
    if (this.textures.exists(`turret:${def.id}`)) {
      view.turret ??= this.add.image(x, y, `turret:${def.id}`).setDepth(6);
      view.turret.setTexture(`turret:${def.id}`).setDisplaySize(size, size);
    }
    const glow = GLOW[family] ?? (family === 'super' && familyOf(def.id).tier >= 4 ? 0xc070ff : undefined);
    if (glow !== undefined) {
      view.glow ??= this.add.image(x, y, 'fx:dot').setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
      view.glow.setTint(glow).setDisplaySize(size * 1.6, size * 1.6);
    }
    view.defId = def.id;
  }

  private syncTowers(g: Game, dt: number, time: number) {
    const live = new Set<number>();
    for (const t of g.towers) {
      live.add(t.id);
      let view = this.towers.get(t.id);
      const [x, y] = this.towerXY(t);
      if (!view) {
        view = this.makeTowerView(t);
        this.towers.set(t.id, view);
        this.burst('fx:dot', 0xd8d0b0, x, y, 10, 0.5);
      } else if (view.defId !== t.def.id) {
        this.dressTower(view, t.def, x, y);
        this.burst('fx:spark', 0xffd34d, x, y, 18, 0.7);
        this.floatText(x, y - WP, 'UPGRADE', '#ffd34d');
      }
      const mode = AIMS[familyOf(t.def.id).family];
      if (view.turret) {
        if (mode === 'aim') view.rot = lerpAngle(view.rot, t.aim, Math.min(1, dt * 14));
        else if (mode === 'spin') view.rot += dt * 0.8;
        view.turret.rotation = view.rot;
      }
      if (view.glow) view.glow.setAlpha(0.35 + 0.15 * Math.sin(time / 300 + t.id));
    }
    for (const [id, v] of this.towers) {
      if (live.has(id)) continue;
      this.burst('fx:dot', 0xffd34d, v.base.x, v.base.y, 14, 0.6);
      for (const o of [v.base, v.turret, v.glow]) if (o) this.tweens.add({ targets: o, alpha: 0, scale: o.scale * 0.4, duration: 220, onComplete: () => o.destroy() });
      this.towers.delete(id);
    }
  }

  private syncCreeps(g: Game, dt: number, time: number) {
    const k = this.k;
    const live = new Set<number>();
    const hp = this.hpG;
    hp.clear();
    for (const c of g.creeps) {
      live.add(c.id);
      const x = c.x * k;
      const y = c.y * k;
      let v = this.creeps.get(c.id);
      if (!v) v = this.makeCreepView(c, x, y);
      const dx = x - v.px;
      const dy = y - v.py;
      const moving = Math.hypot(dx, dy) > 0.01;
      if (moving) v.rot = lerpAngle(v.rot, Math.atan2(dy, dx), Math.min(1, dt * 10));
      v.px = x;
      v.py = y;
      const stunned = g.time < c.stunUntil;
      const snared = g.time < c.snaredUntil;
      const slowed = g.time < c.slowUntil;
      const lift = c.air && !snared ? 6 + Math.sin(time / 260 + v.phase) * 1.5 : 0;
      v.img.setPosition(x, y - lift).setRotation(v.rot + (stunned ? Math.sin(time / 40) * 0.3 : 0));
      const s = creepScale(c.wave.id) * WP * 2.4;
      const bob = moving && !c.air ? 1 + Math.sin(time / 90 + v.phase) * 0.06 : 1;
      v.img.setDisplaySize(s * bob, s / bob);
      if (stunned) v.img.setTint(0xffff80);
      else if (snared) v.img.setTint(0xa0ff80);
      else if (slowed) v.img.setTint(0x9fdcff);
      else v.img.clearTint();
      if (v.shadow) v.shadow.setPosition(x + 3, y + 5).setAlpha(snared ? 0.9 : 0.6);
      if (c.hp < c.maxHp) {
        const w = s * 0.7;
        const top = y - lift - s * 0.45;
        hp.fillStyle(0x000000, 0.7).fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
        const f = c.hp / c.maxHp;
        hp.fillStyle(f > 0.5 ? 0x4cff4c : f > 0.25 ? 0xffd040 : 0xff4040, 1).fillRect(x - w / 2, top, w * f, 2);
      }
    }
    for (const [id, v] of this.creeps) {
      if (live.has(id)) continue;
      this.tweens.add({ targets: v.img, alpha: 0, scale: v.img.scale * 0.2, angle: v.img.angle + 180, duration: 260, onComplete: () => v.img.destroy() });
      v.shadow?.destroy();
      this.creeps.delete(id);
    }
  }

  private makeCreepView(c: Creep, x: number, y: number): CreepView {
    const img = this.add.image(x, y, `creep:${c.wave.id}`).setDepth(c.air ? 8 : 4);
    const shadow = c.air ? this.add.image(x, y, 'fx:shadow').setDepth(7).setDisplaySize(WP * 2 * creepScale(c.wave.id), WP * creepScale(c.wave.id)) : undefined;
    const v: CreepView = { img, shadow, rot: 0, px: x, py: y, phase: Math.random() * 10 };
    this.creeps.set(c.id, v);
    return v;
  }

  private handleEffects(g: Game) {
    const k = this.k;
    for (const e of g.effects) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      const x1 = e.x1 * k, y1 = e.y1 * k, x2 = e.x2 * k, y2 = e.y2 * k;
      const color = hex(e.color);
      if (e.kind === 'shot') this.fire(e, x1, y1, x2, y2, color);
      else if (e.kind === 'splash') {
        const fam = e.source ? familyOf(e.source).family : 'ground';
        const c = fam === 'fire' ? 0xff8030 : fam === 'frost' ? 0xbff0ff : color;
        this.ring(x1, y1, e.radius * k, c);
        this.burst('fx:dot', c, x1, y1, fam === 'fire' ? 16 : 8, fam === 'fire' ? 0.9 : 0.6);
      } else if (e.kind === 'death') {
        this.burst('fx:spark', 0xffd040, x1, y1, 8, 0.6);
        const wave = WAVES.find((w) => w.id === e.source);
        const gold = wave ? g.bountyFor(wave) : 0;
        this.floatText(x1, y1 - 6, `+${gold}g`, '#ffd34d');
      } else if (e.kind === 'leak') {
        this.burst('fx:dot', 0xff3030, x1, y1, 30, 1.2);
        this.ring(x1, y1, WP * 4, 0xff3030);
        this.cameras.main.shake(300, 0.008);
        this.cameras.main.flash(250, 120, 0, 0);
      }
    }
  }

  private fire(e: Effect, x1: number, y1: number, x2: number, y2: number, color: number) {
    const fam = e.source ? familyOf(e.source).family : 'defense';
    const kind = PROJECTILES[fam];
    const impact = () => {
      this.burst('fx:spark', color, x2, y2, e.crit ? 12 : 4, e.crit ? 0.9 : 0.45);
      if (e.crit) this.floatText(x2, y2 - 10, 'CRIT', '#ff6060');
    };
    if (kind === 'lightning' || kind === 'beam') {
      const pts: [number, number][] = [[x1, y1]];
      const n = kind === 'lightning' ? 7 : 1;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        pts.push([x1 + (x2 - x1) * t + (Math.random() - 0.5) * 14, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 14]);
      }
      pts.push([x2, y2]);
      this.bolts.push({ pts, color: kind === 'beam' ? 0x60ffff : 0xa0c0ff, ttl: 0.16, max: 0.16, width: kind === 'beam' ? 3 : 2 });
      impact();
      return;
    }
    const img = this.add.image(x1, y1, `proj:${kind}`).setDepth(9).setRotation(Math.atan2(y2 - y1, x2 - x1));
    img.setDisplaySize(WP * 1.3, WP * 1.3);
    if (ADDITIVE.includes(kind)) img.setBlendMode(Phaser.BlendModes.ADD);
    if (kind === 'orb') img.setTint(color);
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const lob = kind === 'rock' || kind === 'shell';
    const duration = Phaser.Math.Clamp((dist / (lob ? 260 : 520)) * 1000, 60, 450);
    const base = img.scale;
    this.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        img.setPosition(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - (lob ? Math.sin(t * Math.PI) * dist * 0.25 : 0));
        if (lob) img.setScale(base * (1 + Math.sin(t * Math.PI) * 0.6));
      },
      onComplete: () => { img.destroy(); impact(); },
    });
  }

  private drawBolts(dt: number) {
    const bg = this.boltG;
    bg.clear();
    for (const b of this.bolts) {
      b.ttl -= dt;
      const a = Math.max(0, b.ttl / b.max);
      bg.lineStyle(b.width * 3, b.color, a * 0.3);
      bg.strokePoints(b.pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
      bg.lineStyle(b.width, 0xffffff, a);
      bg.strokePoints(b.pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)));
    }
    this.bolts = this.bolts.filter((b) => b.ttl > 0);
  }

  private drawOverlay(g: Game, time: number) {
    const o = this.overlayG;
    o.clear();
    const k = this.k;
    const sel = this.ctrl.selected;
    if (sel) {
      const [x, y] = this.towerXY(sel);
      const s = sel.def.size * WP;
      o.lineStyle(2, 0xffffff, 0.6 + 0.4 * Math.sin(time / 200));
      o.strokeRect(x - s / 2, y - s / 2, s, s);
      if (sel.def.range) {
        const r = (sel.def.range + (sel.def.size * g.cell) / 2) * k;
        o.fillStyle(0x8fb3ff, 0.08).fillCircle(x, y, r);
        o.lineStyle(1.5, 0x8fb3ff, 0.8).strokeCircle(x, y, r);
      }
    }
    const ghost = this.ctrl.ghost();
    this.ghostBase.setVisible(!!ghost);
    this.ghostTurret.setVisible(!!ghost && this.textures.exists(`turret:${ghost.def.id}`));
    if (ghost) {
      const s = ghost.def.size * WP;
      const x = ghost.x * WP + s / 2;
      const y = ghost.y * WP + s / 2;
      const tint = ghost.ok ? 0x80ff90 : 0xff6060;
      this.ghostBase.setTexture(`tower:${ghost.def.id}`).setPosition(x, y).setDisplaySize(s, s).setTint(tint);
      if (this.ghostTurret.visible) this.ghostTurret.setTexture(`turret:${ghost.def.id}`).setPosition(x, y).setDisplaySize(s, s).setTint(tint).setRotation(-Math.PI / 2);
      const R = 9;
      const gcx = ghost.x + ghost.def.size / 2;
      const gcy = ghost.y + ghost.def.size / 2;
      for (let cy = Math.floor(gcy - R); cy <= gcy + R; cy++) {
        for (let cx = Math.floor(gcx - R); cx <= gcx + R; cx++) {
          if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) continue;
          const d = Math.hypot(cx + 0.5 - gcx, cy + 0.5 - gcy);
          if (d > R) continue;
          const i = cy * g.cols + cx;
          const a = (1 - d / R) * 0.5;
          if (g.buildable[i] && !g.occupied[i]) o.lineStyle(1, 0xffffff, a * 0.45).strokeRect(cx * WP + 0.5, cy * WP + 0.5, WP - 1, WP - 1);
          else if (g.walkable[i] && !g.occupied[i]) o.fillStyle(0xff6060, a * 0.25).fillRect(cx * WP, cy * WP, WP, WP);
        }
      }
      o.fillStyle(tint, 0.18).fillRect(ghost.x * WP, ghost.y * WP, s, s);
      if (ghost.def.range) {
        const r = (ghost.def.range + (ghost.def.size * g.cell) / 2) * k;
        o.fillStyle(tint, 0.06).fillCircle(x, y, r);
        o.lineStyle(1.5, tint, 0.7).strokeCircle(x, y, r);
      }
    }
  }

  private emitter(texture: string, tint: number) {
    const key = `${texture}:${tint}`;
    let em = this.emitters.get(key);
    if (!em) {
      em = this.add.particles(0, 0, texture, {
        lifespan: { min: 250, max: 650 },
        speed: { min: 20, max: 120 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint,
        blendMode: 'ADD',
        emitting: false,
      }).setDepth(10);
      this.emitters.set(key, em);
    }
    return em;
  }

  private burst(texture: string, tint: number, x: number, y: number, count: number, _size: number) {
    this.emitter(texture, tint).explode(count, x, y);
  }

  private ring(x: number, y: number, radius: number, tint: number) {
    const ring = this.add.image(x, y, 'fx:ring').setDepth(11).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(4, 4);
    const target = (radius * 2) / 64;
    this.tweens.add({ targets: ring, scale: target, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add.text(x, y, text, { fontFamily: 'system-ui', fontSize: '10px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(25).setResolution(3);
    this.tweens.add({ targets: label, y: y - 16, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => label.destroy() });
  }
}

async function boot() {
  const ctrl = new Controller();
  const art = await loadArt();
  mountPanel(ctrl, document.getElementById('panel')!, document.getElementById('overlay')!, art);
  applyDemo(ctrl);
  const stage = document.getElementById('stage')!;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: '#0c0e12',
    scale: { mode: Phaser.Scale.RESIZE, width: stage.clientWidth, height: stage.clientHeight },
    scene: new LaneScene(art, ctrl),
    audio: { noAudio: true },
  });
}

boot();
