import { familyOf, PROJECTILES, type ProjectileKind } from '../art/procedural';
import { WAVES } from '../core/data';
import type { Effect, Game, Phase } from '../core/sim';

export type SoundName =
  | ProjectileKind | 'death' | 'gold' | 'leak' | 'wave' | 'airwave' | 'clear' | 'win' | 'lose'
  | 'build' | 'upgrade' | 'sell' | 'error' | 'life' | 'unlock' | 'splash';

const MIN_GAP: Partial<Record<SoundName, number>> = {
  arrow: 40, rock: 60, bolt: 50, shard: 60, orb: 50, fireball: 90, bullet: 35, shell: 45, lightning: 90, beam: 80,
  death: 40, gold: 70, splash: 70,
};

const STORAGE_KEY = 'cube-td:audio';

export class Sfx {
  muted = false;
  volume = 0.5;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private voices = 0;
  private seen = new WeakSet<Effect>();
  private game: Game | null = null;
  private phase: Phase = 'menu';
  private level = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { muted?: boolean; volume?: number };
      this.muted = saved.muted ?? false;
      this.volume = saved.volume ?? 0.5;
    } catch { /* ignore corrupt settings */ }
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setVolume(v: number) { this.volume = v; this.apply(); }
  toggleMute() { this.muted = !this.muted; this.apply(); }

  private apply() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
  }

  private unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  watch(game: Game) {
    if (game !== this.game) {
      this.game = game;
      this.phase = game.phase;
      this.level = game.level;
    }
    for (const e of game.effects) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      if (e.kind === 'shot') this.play(e.source ? PROJECTILES[familyOf(e.source).family] : 'arrow');
      else if (e.kind === 'splash') this.play('splash');
      else if (e.kind === 'death') { this.play('death'); this.play('gold'); }
      else if (e.kind === 'leak') this.play('leak');
    }
    if (game.phase !== this.phase || game.level !== this.level) {
      if (game.phase === 'wave' && (this.phase !== 'wave' || game.level !== this.level)) this.play(WAVES[game.level].air ? 'airwave' : 'wave');
      else if (game.phase === 'break' && this.phase === 'wave') this.play('clear');
      else if (game.phase === 'won') this.play('win');
      else if (game.phase === 'lost') this.play('lose');
      this.phase = game.phase;
      this.level = game.level;
    }
  }

  play(name: SoundName) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = performance.now();
    const gap = MIN_GAP[name];
    if (gap && now - (this.last.get(name) ?? 0) < gap) return;
    if (this.voices > 24) return;
    this.last.set(name, now);
    const t = ctx.currentTime;
    switch (name) {
      case 'arrow': this.noise(t, 0.05, 'highpass', 3000, 0.12); this.tone(t, 0.06, 'triangle', 900, 420, 0.08); break;
      case 'rock': this.tone(t, 0.14, 'sine', 140, 55, 0.25); this.noise(t, 0.08, 'lowpass', 600, 0.12); break;
      case 'bolt': this.tone(t, 0.08, 'triangle', 1400, 500, 0.09); break;
      case 'shard': this.tone(t, 0.16, 'sine', 1900, 1800, 0.06); this.tone(t + 0.02, 0.14, 'sine', 2500, 2400, 0.04); break;
      case 'orb': this.tone(t, 0.1, 'sine', 520, 900, 0.07); break;
      case 'fireball': this.noise(t, 0.22, 'lowpass', 900, 0.18, 0.06); this.tone(t, 0.2, 'sawtooth', 90, 60, 0.04); break;
      case 'bullet': this.tone(t, 0.02, 'square', 1800, 1200, 0.04); break;
      case 'shell': this.noise(t, 0.05, 'bandpass', 1500, 0.12); this.tone(t, 0.08, 'sine', 160, 70, 0.12); break;
      case 'lightning': this.noise(t, 0.16, 'bandpass', 3200, 0.16); this.tone(t, 0.12, 'sawtooth', 120, 2000, 0.04); break;
      case 'beam': this.tone(t, 0.16, 'sine', 300, 1300, 0.08); break;
      case 'splash': this.noise(t, 0.18, 'lowpass', 700, 0.16); break;
      case 'death': this.tone(t, 0.07, 'sine', 420, 900, 0.06); break;
      case 'gold': this.tone(t, 0.05, 'square', 1320, 1320, 0.025); this.tone(t + 0.05, 0.08, 'square', 1760, 1760, 0.025); break;
      case 'leak': for (const d of [0, 0.22]) this.tone(t + d, 0.18, 'square', 220, 110, 0.12); break;
      case 'wave': this.chord(t, [220, 330], 0.45, 'sawtooth', 0.06); break;
      case 'airwave': this.chord(t, [330, 495], 0.3, 'sawtooth', 0.06); this.chord(t + 0.3, [440, 660], 0.35, 'sawtooth', 0.06); break;
      case 'clear': [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, 0.12, 'triangle', f, f, 0.08)); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.12, 0.25, 'triangle', f, f, 0.1)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.18, 0.3, 'sawtooth', f, f * 0.97, 0.07)); break;
      case 'build': this.noise(t, 0.06, 'lowpass', 400, 0.2); this.tone(t, 0.1, 'sine', 200, 120, 0.15); break;
      case 'upgrade': [660, 880, 1175].forEach((f, i) => this.tone(t + i * 0.05, 0.1, 'triangle', f, f, 0.08)); break;
      case 'sell': [1175, 880].forEach((f, i) => this.tone(t + i * 0.06, 0.08, 'square', f, f, 0.03)); break;
      case 'life': [523, 784, 1047].forEach((f, i) => this.tone(t + i * 0.07, 0.15, 'sine', f, f, 0.1)); break;
      case 'unlock': [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.06, 0.12, 'triangle', f, f, 0.08)); break;
      case 'error': this.tone(t, 0.14, 'square', 150, 140, 0.06); break;
    }
  }

  private envelope(t: number, dur: number, peak: number, attack = 0): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    g.connect(this.master!);
    return g;
  }

  private track(node: AudioScheduledSourceNode, t: number, dur: number) {
    this.voices++;
    node.onended = () => { this.voices--; };
    node.start(t);
    node.stop(t + dur + 0.02);
  }

  private tone(t: number, dur: number, type: OscillatorType, from: number, to: number, peak: number) {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    osc.connect(this.envelope(t, dur, peak));
    this.track(osc, t, dur);
  }

  private chord(t: number, freqs: number[], dur: number, type: OscillatorType, peak: number) {
    for (const f of freqs) this.tone(t, dur, type, f, f, peak);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, peak: number, attack = 0) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.connect(filter);
    const env = this.envelope(t, dur, peak, attack);
    filter.connect(env);
    this.track(src, t, dur + attack);
  }
}

let shared: Sfx | null = null;
export const getSfx = () => (shared ??= new Sfx());
