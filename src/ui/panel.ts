import { BUILD_MENU, COPTER_COST, CREEPS_PER_WAVE, DIFFICULTIES, LIFE_COST, MODE_INFO, TOWERS, WAVES, avgDps, type Mode, type TowerDef } from '../core/data';
import type { Game } from '../core/sim';
import type { Controller } from './controller';

const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const towerStats = (d: TowerDef) => {
  if (d.targets === 'none') return 'Unlocks Super and Advanced copters';
  const tags = [
    d.targets === 'both' ? 'air+ground' : d.targets,
    d.splash && 'splash',
    d.slow && 'slow',
    d.stun && 'stun',
    d.crit && 'crit',
    d.snare && 'snare',
    d.armorShred && 'armor shred',
    d.bounce && 'bounce',
  ].filter(Boolean).join(', ');
  return `${fmt(d.damage)} dmg / ${d.cooldown}s · ${fmt(avgDps(d))} dps · range ${d.range} · ${tags}`;
};

const tip = (d: TowerDef) => esc(d.assumed?.length ? `Estimated values: ${d.assumed.join('; ')}` : 'All values from the original map');

const airDps = (g: Game) => g.towers.reduce((sum, t) => sum + (t.def.targets === 'air' || t.def.targets === 'both' ? avgDps(t.def) : 0), 0);
const groundDps = (g: Game) => g.towers.reduce((sum, t) => sum + (t.def.targets === 'ground' || t.def.targets === 'both' ? avgDps(t.def) : 0), 0);

type Section = (ctrl: Controller, g: Game) => string;

const SECTIONS: Record<string, Section> = {
  stats: (_c, g) => `<div class="stats">
      <div><span>Level</span><b>${g.level + 1}/${WAVES.length}</b></div>
      <div><span>Gold</span><b class="gold">${g.gold}</b></div>
      <div><span>Lives</span><b class="lives">${Math.max(0, g.lives)}</b></div>
      <div><span>Kills</span><b>${g.kills}</b></div>
    </div>`,
  phase: (_c, g) => {
    const timer = g.phase === 'countdown' || g.phase === 'break' ? ` · ${Math.ceil(g.phaseTimer)}s` : '';
    return `<div class="phase">${g.phase.toUpperCase()}${timer}${g.phase === 'wave' ? ` · spawned ${g.spawned}/${CREEPS_PER_WAVE}` : ''} · ${g.difficulty.name} · ${MODE_INFO[g.mode].name}</div>`;
  },
  upcoming: (_c, g) => {
    const start = g.phase === 'wave' ? g.level : g.phase === 'break' ? g.level + 1 : g.level;
    const rows = WAVES.slice(start, start + 4).map((w, i) => {
      const lvl = start + i + 1;
      const label = i === 0 ? (g.phase === 'wave' ? 'Now' : 'Next') : `L${lvl}`;
      return `<div class="wave-row ${w.air ? 'air-row' : ''} ${i === 0 ? 'current' : ''}"><span class="lbl">${label}</span><b>${esc(w.name)}</b><em class="air">${w.air ? 'AIR' : ''}</em><span class="muted">${fmt(g.creepHpFor(w))} HP · ${w.speed} spd${w.armor ? ` · ${w.armor} armor` : ''} · ${g.bountyFor(w)}g</span></div>`;
    }).join('');
    const next = WAVES[start];
    const ad = airDps(g);
    let warn = '';
    if (next?.air && g.phase !== 'menu') {
      warn = ad === 0
        ? '<div class="warn">Air wave: flyers ignore your maze and Ground towers can\'t hit them. Build Anti-Air or Defense towers.</div>'
        : `<div class="warn soft">Air wave: flyers skip the maze. Your air DPS: ${fmt(ad)} (ground ${fmt(groundDps(g))}).</div>`;
    }
    return `<div class="upcoming"><div class="head">Waves</div>${rows}${warn}</div>`;
  },
  controls: (c, g) => `<div class="row">
      ${[1, 2, 4].map((s) => `<button data-action="speed" data-arg="${s}" class="${c.speed === s ? 'on' : ''}">${s}x</button>`).join('')}
      <button data-action="pause" class="${c.paused ? 'on' : ''}">${c.paused ? 'Resume' : 'Pause'}</button>
      <button data-action="path" class="${c.showPath ? 'on' : ''}">Path</button>
      <button data-action="life" ${g.gold < LIFE_COST ? 'disabled' : ''}>+1 Life (${LIFE_COST}g)</button>
    </div>`,
  tabs: (c, g) => {
    const tab = c.tab;
    const locked = tab !== 'basic' && !g.unlocked[tab];
    return `<div class="tabs">
        ${(['basic', 'super', 'advanced'] as const).map((t) => `<button data-action="tab" data-arg="${t}" class="${tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}${t !== 'basic' && !g.unlocked[t] ? ' (locked)' : ''}</button>`).join('')}
      </div>
      ${locked ? `<div class="locked">Needs a Construction Facility, then buy the copter.
          <button data-action="copter" data-arg="${tab}" ${!g.hasFacility || g.gold < COPTER_COST[tab] ? 'disabled' : ''}>Buy ${tab === 'super' ? 'Super' : 'Advanced'} Copter (${COPTER_COST[tab]}g)</button></div>` : ''}`;
  },
  build: (c, g) => {
    const tab = c.tab;
    const locked = tab !== 'basic' && !g.unlocked[tab];
    return `<div class="build">${BUILD_MENU[tab].map((id, i) => {
      const d = TOWERS[id];
      const dis = locked || g.gold < d.cost || g.over || g.phase === 'menu';
      return `<button class="tower ${c.placing === id ? 'on' : ''}" data-action="build" data-arg="${id}" ${dis ? 'disabled' : ''} title="${tip(d)}">
          <i style="background:${d.color}"></i><span class="name">${i + 1}. ${esc(d.name)} <b>${d.cost}g</b></span><small>${towerStats(d)}</small></button>`;
    }).join('')}</div>`;
  },
  selectedInfo: (c) => {
    const sel = c.selected;
    if (!sel) return '';
    return `<div class="selected-info"><div class="title"><i style="background:${sel.def.color}"></i>${esc(sel.def.name)}</div>
        <small>${towerStats(sel.def)}</small><small>Kills ${sel.kills} · damage ${fmt(sel.damage)}</small></div>`;
  },
  selectedActions: (c, g) => {
    const sel = c.selected;
    if (!sel) return '<div class="hint">Click a tower button (or keys 1-6), then click the map. Shift-click keeps placing. Right-click/Esc cancels. Creeps path around your towers, so build a maze, but you can\'t fully block it.</div>';
    const next = g.upgradeTarget(sel);
    return `<div class="row selected-actions">
        ${next ? `<button data-action="upgrade" ${g.gold < next.cost ? 'disabled' : ''} title="${esc(towerStats(next))}">Upgrade → ${esc(next.name)} (${next.cost}g) [U]</button>` : '<span class="muted">Max tier</span>'}
        <button data-action="sell">Sell +${sel.def.sell}g [S]</button>
      </div>`;
  },
  log: (_c, g) => `<div class="log">${g.messages.slice().reverse().map((m) => `<div>${esc(m.text)}</div>`).join('')}</div>`,
  toast: (c) => (c.toast && performance.now() < c.toastUntil ? `<div class="toast">${esc(c.toast)}</div>` : ''),
};

export function mountPanel(ctrl: Controller, panel: HTMLElement, overlay: HTMLElement) {
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
  const order = ['stats', 'phase', 'upcoming', 'controls', 'sound', 'tabs', 'build', 'selectedInfo', 'selectedActions', 'log', 'toast'];
  for (const key of order) {
    const el = document.createElement('div');
    el.className = `sec sec-${key}`;
    panel.appendChild(el);
    els.set(key, { el, html: '' });
  }
  const sound = els.get('sound')!.el;
  sound.innerHTML = `<div class="row sound"><button data-sound="mute"></button><label>Volume <input type="range" min="0" max="1" step="0.05" value="${ctrl.sfx.volume}"></label></div>`;
  const muteBtn = sound.querySelector<HTMLButtonElement>('[data-sound="mute"]')!;
  const syncMute = () => { muteBtn.textContent = ctrl.sfx.muted ? 'Sound: off [M]' : 'Sound: on [M]'; muteBtn.classList.toggle('on', !ctrl.sfx.muted); };
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
      overlay.innerHTML = `<div class="card"><h1>New game</h1><p>Choose a rule set:</p>
        <div class="modes">${(['solo', 'original'] as Mode[]).map((m) => `<button data-action="mode" data-arg="${m}" class="${g.mode === m ? 'on' : ''}">${MODE_INFO[m].name}<small>${MODE_INFO[m].blurb}</small></button>`).join('')}</div>
        <p>Pick a difficulty:</p>
        <div class="diffs">${DIFFICULTIES.map((d) => `<button data-action="start" data-arg="${d.id}">${d.name}<small>${d.startGold + g.rules.startGoldBonus}g start${d.speedMul > 1 ? ` · +${Math.round((d.speedMul - 1) * 100)}% speed` : ''}</small></button>`).join('')}</div>
        <p class="muted">${g.rules.startLives} ${g.rules.startLives === 1 ? 'life' : 'lives'}. Each leak costs a life; buy more for ${LIFE_COST}g. Every 4th level is an air wave.</p></div>`;
    } else {
      overlay.innerHTML = `<div class="card"><h1>${g.phase === 'won' ? 'Victory' : 'Defeat'}</h1>
        <p>${g.difficulty.name} · reached level ${g.level + 1} · ${g.kills} kills</p>
        <button data-action="restart">Play again</button></div>`;
    }
  };

  ctrl.onChange(render);
  render();
  setInterval(render, 200);
}
