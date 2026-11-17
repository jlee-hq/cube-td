import { BREAK_TIME, BUILD_MENU, COPTER_COST, CREEPS_PER_WAVE, DIFFICULTIES, LIFE_COST, MODE_INFO, TOWERS, WAVES, avgDps, type Mode, type Tier, type TowerDef } from '../core/data';
import type { Game } from '../core/sim';
import type { Controller } from './controller';

type ArtMap = Map<string, CanvasImageSource & { width: number; height: number }>;

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const ICON = {
  level: '<svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  gold: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/><circle cx="12" cy="12" r="5" fill="none" stroke="#7a5a10" stroke-width="1.5"/></svg>',
  lives: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/></svg>',
  kills: '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3z" fill="currentColor"/><circle cx="9.5" cy="11" r="1.6" fill="#151922"/><circle cx="14.5" cy="11" r="1.6" fill="#151922"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor"/></svg>',
  path: '<svg viewBox="0 0 24 24"><path d="M4 18c4 0 3-6 8-6s4-6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" stroke-width="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  air: '<svg viewBox="0 0 24 24"><path d="M2 13l8-2 3-7 2 7 7 2-7 2-2 6-3-6z" fill="currentColor"/></svg>',
  ground: '<svg viewBox="0 0 24 24"><path d="M3 18h18M6 18l3-7 3 4 3-6 3 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/></svg>',
};

const TAB_NAMES: Record<Tier, string> = { basic: 'Basic', super: 'Super', advanced: 'Advanced' };

const effects = (d: TowerDef) => [
  d.splash && 'Splash', d.slow && 'Slow', d.stun && 'Stun', d.crit && 'Crit', d.snare && 'Snare', d.armorShred && 'Armor shred', d.bounce && 'Bounce',
].filter(Boolean) as string[];

const targetsIcon = (d: TowerDef) => d.targets === 'air' ? `<span class="tg air" title="Air only">${ICON.air}</span>`
  : d.targets === 'ground' ? `<span class="tg ground" title="Ground only">${ICON.ground}</span>`
  : d.targets === 'both' ? `<span class="tg both" title="Air and ground">${ICON.ground}${ICON.air}</span>` : '';

const tierOf = (id: string): { tier: number; total: number } => {
  const chain: string[] = [];
  let start = Object.values(TOWERS).find((t) => t.id === id)!;
  for (;;) {
    const prev = Object.values(TOWERS).find((t) => t.upgradesTo === start.id);
    if (!prev) break;
    start = prev;
  }
  for (let cur: TowerDef | undefined = start; cur; cur = cur.upgradesTo ? TOWERS[cur.upgradesTo] : undefined) chain.push(cur.id);
  return { tier: chain.indexOf(id) + 1, total: chain.length };
};

const airDps = (g: Game) => g.towers.reduce((sum, t) => sum + (t.def.targets === 'air' || t.def.targets === 'both' ? avgDps(t.def) : 0), 0);
const groundDps = (g: Game) => g.towers.reduce((sum, t) => sum + (t.def.targets === 'ground' || t.def.targets === 'both' ? avgDps(t.def) : 0), 0);

function iconFactory(art?: ArtMap) {
  const cache = new Map<string, string>();
  const make = (key: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    let url = cache.get(key);
    if (url) return url;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    draw(c.getContext('2d')!, 64);
    url = c.toDataURL();
    cache.set(key, url);
    return url;
  };
  return {
    tower: (d: TowerDef) => {
      const base = art?.get(`tower:${d.id}`);
      if (!base) return '';
      return make(`t:${d.id}`, (ctx, s) => {
        ctx.drawImage(base, 2, 2, s - 4, s - 4);
        const turret = art?.get(`turret:${d.id}`);
        if (!turret) return;
        ctx.translate(s / 2, s / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(turret, -s / 2 + 2, -s / 2 + 2, s - 4, s - 4);
      });
    },
    creep: (id: string) => {
      const sprite = art?.get(`creep:${id}`);
      if (!sprite) return '';
      return make(`c:${id}`, (ctx, s) => ctx.drawImage(sprite, 0, 0, s, s));
    },
  };
}

export function mountPanel(ctrl: Controller, panel: HTMLElement, overlay: HTMLElement, art?: ArtMap) {
  const icons = iconFactory(art);
  const img = (src: string, cls: string, fallback: string) => (src ? `<img class="${cls}" src="${src}" alt="">` : `<i class="${cls} swatch" style="background:${fallback}"></i>`);

  const SECTIONS: Record<string, (c: Controller, g: Game) => string> = {
    hud: (_c, g) => `<div class="hud">
        <div class="tile"><span class="ic lvl">${ICON.level}</span><div><small>Level</small><b>${g.level + 1}<em>/${WAVES.length}</em></b></div></div>
        <div class="tile"><span class="ic gold">${ICON.gold}</span><div><small>Gold</small><b class="gold">${fmt(g.gold)}</b></div></div>
        <div class="tile"><span class="ic lives">${ICON.lives}</span><div><small>Lives</small><b class="lives">${Math.max(0, g.lives)}</b></div></div>
        <div class="tile"><span class="ic kills">${ICON.kills}</span><div><small>Kills</small><b>${g.kills}</b></div></div>
      </div>`,
    phase: (_c, g) => {
      if (g.phase === 'menu' || g.over) return '';
      const w = WAVES[g.level];
      let title = '';
      let sub = '';
      let pct = 0;
      if (g.phase === 'countdown' || g.phase === 'break') {
        const total = g.phase === 'countdown' ? g.difficulty.startDelay : BREAK_TIME;
        const next = g.phase === 'break' ? WAVES[g.level + 1] : w;
        title = g.phase === 'countdown' ? 'Get ready' : 'Break';
        sub = `Level ${g.phase === 'break' ? g.level + 2 : g.level + 1} in <b>${Math.ceil(g.phaseTimer)}s</b> · ${esc(next?.name ?? '')}`;
        pct = 1 - g.phaseTimer / total;
      } else {
        title = `Level ${g.level + 1}`;
        sub = `${esc(w.name)}${w.air ? ' <span class="badge air">AIR</span>' : ''} · ${g.spawned}/${CREEPS_PER_WAVE} sent · ${g.creeps.length} alive`;
        pct = g.spawned / CREEPS_PER_WAVE;
      }
      const can = g.canSendNext();
      const reward = g.earlyCallReward();
      const label = g.phase === 'wave' ? (can ? 'Send next level' : 'Spawning…') : reward > 0 ? `Send now <span class="reward">+${reward}g</span>` : 'Send now';
      return `<div class="phase-card ${g.phase}">
          <div class="phase-top"><b>${title}</b><span class="chip">${g.difficulty.name} · ${MODE_INFO[g.mode].name}</span></div>
          <div class="phase-sub">${sub}</div>
          <div class="bar"><i style="width:${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%"></i></div>
          <button class="btn primary send" data-action="next" ${can ? '' : 'disabled'} title="Send the next wave now [N]">${ICON.next}<span>${label}</span><kbd>N</kbd></button>
        </div>`;
    },
    upcoming: (_c, g) => {
      if (g.over) return '';
      const start = g.phase === 'break' ? g.level + 1 : g.level;
      const rows = WAVES.slice(start, start + 4).map((w, i) => {
        const label = i === 0 ? (g.phase === 'wave' ? 'Now' : 'Next') : `L${start + i + 1}`;
        return `<div class="wave-row ${w.air ? 'is-air' : ''} ${i === 0 ? 'current' : ''}">
            <span class="lbl">${label}</span>${img(icons.creep(w.id), 'creep-ic', '#888')}
            <span class="nm">${esc(w.name)}${w.air ? '<span class="badge air">AIR</span>' : ''}</span>
            <span class="st">${fmt(g.creepHpFor(w))} hp · ${g.bountyFor(w)}g</span>
          </div>`;
      }).join('');
      const next = WAVES[start];
      const ad = airDps(g);
      let warn = '';
      if (next?.air && g.phase !== 'menu') {
        warn = ad === 0
          ? `<div class="warn">${ICON.air}<span>Air wave: flyers skip your maze and Ground towers can't hit them. Build Anti-Air or Defense towers.</span></div>`
          : `<div class="warn soft">${ICON.air}<span>Air wave next. Air DPS ${fmt(ad)} · ground ${fmt(groundDps(g))}.</span></div>`;
      }
      return `<div class="card-sec"><div class="sec-title">Waves</div>${rows}${warn}</div>`;
    },
    controls: (c, g) => `<div class="toolbar">
        <div class="seg">${[1, 2, 4].map((s) => `<button class="${c.speed === s ? 'on' : ''}" data-action="speed" data-arg="${s}">${s}x</button>`).join('')}</div>
        <button class="btn icon ${c.paused ? 'on' : ''}" data-action="pause" title="${c.paused ? 'Resume' : 'Pause'} [Space]">${c.paused ? ICON.play : ICON.pause}</button>
        <button class="btn icon ${c.showPath ? 'on' : ''}" data-action="path" title="Show creep path [P]">${ICON.path}</button>
        <button class="btn life" data-action="life" ${g.gold < LIFE_COST || g.over || g.phase === 'menu' ? 'disabled' : ''} title="Buy a life">${ICON.heart}<span>+1</span><span class="cost">${LIFE_COST}g</span></button>
      </div>`,
    tabs: (c, g) => {
      const tab = c.tab;
      const locked = tab !== 'basic' && !g.unlocked[tab];
      return `<div class="seg tabs">${(['basic', 'super', 'advanced'] as const).map((t) => `<button class="${tab === t ? 'on' : ''}" data-action="tab" data-arg="${t}">${t !== 'basic' && !g.unlocked[t] ? `<span class="lock">${ICON.lock}</span>` : ''}${TAB_NAMES[t]}</button>`).join('')}</div>
        ${locked ? `<div class="locked">${ICON.lock}<div><b>${TAB_NAMES[tab]} towers are locked</b><small>${g.hasFacility ? 'Buy the copter to unlock them.' : 'Build a Construction Facility (Basic tab) first.'}</small></div>
            <button class="btn primary" data-action="copter" data-arg="${tab}" ${!g.hasFacility || g.gold < COPTER_COST[tab] ? 'disabled' : ''}>Unlock ${COPTER_COST[tab]}g</button></div>` : ''}`;
    },
    build: (c, g) => {
      const tab = c.tab;
      const locked = tab !== 'basic' && !g.unlocked[tab];
      return `<div class="build-grid">${BUILD_MENU[tab].map((id, i) => {
        const d = TOWERS[id];
        const short = g.gold < d.cost && g.phase !== 'menu';
        const dis = locked || short || g.over || g.phase === 'menu';
        const stat = d.targets === 'none' ? 'Unlocks copters' : `${fmt(avgDps(d))} dps · ${d.range}`;
        return `<button class="tcard ${c.placing === id ? 'on' : ''} ${short && !locked ? 'short' : ''}" data-action="build" data-arg="${id}" ${dis ? 'disabled' : ''} title="${esc(d.name)}${d.assumed?.length ? ` (estimated: ${esc(d.assumed.join('; '))})` : ''}">
            <kbd>${i + 1}</kbd>${img(icons.tower(d), 'tower-ic', d.color)}
            <span class="tname">${esc(d.name.replace(/ Tower$/, ''))}</span>
            <span class="tmeta">${targetsIcon(d)}<span>${stat}</span></span>
            <span class="price">${d.cost}g</span>
          </button>`;
      }).join('')}</div>`;
    },
    selected: (c, g) => {
      const sel = c.selected;
      if (!sel) return `<div class="hint"><b>How to build</b> Pick a tower (or press 1-6), then click the map. Shift-click keeps placing; right-click or Esc cancels. Creeps walk around your towers, so build a maze, but you can't wall them in completely.</div>`;
      const d = sel.def;
      const next = g.upgradeTarget(sel);
      const { tier, total } = tierOf(d.id);
      const fx = effects(d);
      const stats = d.targets === 'none' ? '<div class="sel-note">Unlocks the Super and Advanced copters.</div>' : `<div class="stat-grid">
          <div><small>Damage</small><b>${fmt(d.damage)}</b></div><div><small>Cooldown</small><b>${d.cooldown}s</b></div>
          <div><small>DPS</small><b>${fmt(avgDps(d))}</b></div><div><small>Range</small><b>${d.range}</b></div>
          <div><small>Targets</small><b>${d.targets === 'both' ? 'Air + ground' : d.targets === 'air' ? 'Air' : 'Ground'}</b></div><div><small>Kills</small><b>${sel.kills}</b></div>
        </div>${fx.length ? `<div class="fx">${fx.map((f) => `<span class="badge">${f}</span>`).join('')}</div>` : ''}`;
      const gain = next ? avgDps(next) - avgDps(d) : 0;
      return `<div class="sel-card">
          <div class="sel-head">${img(icons.tower(d), 'tower-ic big', d.color)}<div><b>${esc(d.name)}</b>
            ${total > 1 ? `<div class="pips">${Array.from({ length: total }, (_, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('')}<small>Tier ${tier}/${total}</small></div>` : ''}
            <small class="muted">Damage dealt ${fmt(sel.damage)}</small></div></div>
          ${stats}
          <div class="sel-actions">
            ${next ? `<button class="btn primary up" data-action="upgrade" ${g.gold < next.cost ? 'disabled' : ''} title="${esc(next.name)}"><span>Upgrade <kbd>U</kbd></span><small>${esc(next.name.replace(/ Tower$/, ''))}${gain > 0 ? ` · +${fmt(gain)} dps` : ''}</small><span class="price">${next.cost}g</span></button>` : '<div class="maxed">Max tier</div>'}
            <button class="btn danger" data-action="sell"><span>Sell <kbd>S</kbd></span><span class="price">+${d.sell}g</span></button>
          </div>
        </div>`;
    },
    log: (_c, g) => `<div class="log">${g.messages.slice(-5).reverse().map((m) => `<div>${esc(m.text)}</div>`).join('')}</div>`,
    toast: (c) => (c.toast && performance.now() < c.toastUntil ? `<div class="toast">${esc(c.toast)}</div>` : ''),
  };

  const handler = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || el.hasAttribute('disabled')) return;
    e.preventDefault();
    ctrl.action(el.dataset.action!, el.dataset.arg);
  };
  panel.addEventListener('pointerdown', handler);
  overlay.addEventListener('pointerdown', handler);

  panel.innerHTML = '';
  const els = new Map<string, { el: HTMLElement; html: string }>();
  const order = ['hud', 'phase', 'controls', 'sound', 'upcoming', 'tabs', 'build', 'selected', 'log', 'toast'];
  for (const key of order) {
    const el = document.createElement('div');
    el.className = `sec sec-${key}`;
    panel.appendChild(el);
    els.set(key, { el, html: '' });
  }
  const sound = els.get('sound')!.el;
  sound.innerHTML = `<div class="sound"><button class="btn icon" data-sound="mute" title="Mute [M]"></button><input type="range" min="0" max="1" step="0.05" value="${ctrl.sfx.volume}" aria-label="Volume"></div>`;
  const muteBtn = sound.querySelector<HTMLButtonElement>('[data-sound="mute"]')!;
  const syncMute = () => {
    const html = ctrl.sfx.muted ? ICON.soundOff : ICON.soundOn;
    if (muteBtn.innerHTML !== html) muteBtn.innerHTML = html;
    muteBtn.classList.toggle('on', !ctrl.sfx.muted);
  };
  muteBtn.addEventListener('click', () => { ctrl.sfx.toggleMute(); syncMute(); });
  sound.querySelector('input')!.addEventListener('input', (e) => ctrl.sfx.setVolume(Number((e.target as HTMLInputElement).value)));
  syncMute();

  const stage = overlay.parentElement!;
  const banner = document.createElement('div');
  banner.className = 'banner';
  stage.appendChild(banner);
  let bannerKey = '';
  const showBanner = (html: string, air: boolean) => {
    banner.innerHTML = html;
    banner.classList.toggle('air', air);
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  };

  let overlayKey = '';
  const render = () => {
    const g = ctrl.game;
    for (const [key, fn] of Object.entries(SECTIONS)) {
      const slot = els.get(key)!;
      const html = fn(ctrl, g);
      if (html !== slot.html) { slot.html = html; slot.el.innerHTML = html; }
    }
    syncMute();

    const key = `${g.phase}:${g.level}`;
    if (key !== bannerKey) {
      if (g.phase === 'wave') {
        const w = WAVES[g.level];
        showBanner(`<small>Level ${g.level + 1}</small>${esc(w.name)}${w.air ? '<em>AIR</em>' : ''}`, w.air);
      } else if (g.phase === 'break' && WAVES[g.level + 1]?.air) {
        showBanner(`<small>Next level</small>Air wave incoming${airDps(g) === 0 ? '<em>No anti-air!</em>' : ''}`, true);
      }
      bannerKey = key;
    }

    const show = g.phase === 'menu' || g.over;
    overlay.style.display = show ? 'flex' : 'none';
    const ok = `${g.phase}:${g.over ? g.kills : ''}:${g.mode}`;
    if (!show || ok === overlayKey) return;
    overlayKey = ok;
    if (g.phase === 'menu') {
      overlay.innerHTML = `<div class="card"><h1>New game</h1><p class="muted">Choose a rule set</p>
        <div class="modes">${(['solo', 'original'] as Mode[]).map((m) => `<button class="${g.mode === m ? 'on' : ''}" data-action="mode" data-arg="${m}"><b>${MODE_INFO[m].name}</b><small>${MODE_INFO[m].blurb}</small></button>`).join('')}</div>
        <p class="muted">Pick a difficulty</p>
        <div class="diffs">${DIFFICULTIES.map((d) => `<button data-action="start" data-arg="${d.id}"><b>${d.name}</b><small>${d.startGold + g.rules.startGoldBonus}g start${d.speedMul > 1 ? ` · +${Math.round((d.speedMul - 1) * 100)}% speed` : ''}</small></button>`).join('')}</div>
        <p class="muted small">${g.rules.startLives} ${g.rules.startLives === 1 ? 'life' : 'lives'}. Each leak costs a life; buy more for ${LIFE_COST}g. Every 4th level is an air wave.</p></div>`;
    } else {
      overlay.innerHTML = `<div class="card"><h1>${g.phase === 'won' ? 'Victory' : 'Defeat'}</h1>
        <p class="muted">${g.difficulty.name} · reached level ${g.level + 1} · ${g.kills} kills</p>
        <button class="btn primary big" data-action="restart">Play again</button></div>`;
    }
  };

  ctrl.onChange(render);
  render();
  setInterval(render, 200);
}
