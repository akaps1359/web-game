import {
  Filter,
  FMSynth,
  Gain,
  MembraneSynth,
  MetalSynth,
  NoiseSynth,
  Panner,
  Synth,
  type InputNode,
} from 'tone';
import { EXP, RISE } from './moods/instruments';
import { chance, clamp, rand } from './scales';
import type { Sfx } from './types';
import { WhisperVoice } from './whisper';

// ===========================================================================
// 보이스 풀 — 모든 노드는 처음 한 번만 만들고 재사용한다
// ===========================================================================

type Keep = <T extends { dispose(): unknown }>(x: T) => T;
const hz = (f: number): number => clamp(f, 20, 18000);
const v01 = (v: number): number => clamp(v, 0.001, 1);

abstract class Voice {
  /** 마지막 트리거 시각 (모노 악기는 같은 시각 재트리거 금지) */
  private last = 0;
  /** 이 시각까지 소리가 남 */
  busy = 0;
  /** 레시피별 음량 보정(1 초과 가능) — 벨로시티는 음색에만 쓰도록 분리 */
  protected readonly amp: Gain;
  protected readonly panner: Panner;
  protected readonly send: Gain;
  /** 다음 트리거에 적용할 음량 배율 */
  gain = 1;

  constructor(keep: Keep, dry: InputNode, verb: InputNode) {
    this.amp = keep(new Gain(1));
    this.panner = keep(new Panner(0));
    this.send = keep(new Gain(0));
    this.amp.connect(this.panner);
    this.panner.connect(dry);
    this.panner.chain(this.send, verb);
  }

  protected begin(t: number, pan: number, verb: number, length: number): number {
    const tt = Math.max(t, this.last + 0.003);
    this.last = tt;
    this.busy = tt + length;
    this.amp.gain.setValueAtTime(this.gain, tt);
    this.panner.pan.setValueAtTime(clamp(pan, -1, 1), tt);
    this.send.gain.setValueAtTime(clamp(verb, 0, 1), tt);
    return tt;
  }
}

export interface NoiseP {
  filter?: 'lowpass' | 'highpass' | 'bandpass';
  f0: number;
  f1?: number;
  glide?: number;
  q?: number;
  attack?: number;
  hold?: number;
  release: number;
  rise?: boolean;
  vel: number;
  pan?: number;
  verb?: number;
}

class NoiseVoice extends Voice {
  private readonly synth: NoiseSynth;
  private readonly filter: Filter;
  constructor(keep: Keep, dry: InputNode, verb: InputNode) {
    super(keep, dry, verb);
    this.synth = keep(
      new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.1, releaseCurve: EXP },
        volume: -8,
      }),
    );
    this.filter = keep(new Filter({ type: 'bandpass', frequency: 1000, Q: 1, rolloff: -12 }));
    this.synth.chain(this.filter, this.amp);
  }
  play(t: number, p: NoiseP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.004;
    const tt = this.begin(t, p.pan ?? rand(-0.1, 0.1), p.verb ?? 0.1, attack + hold + p.release);
    const f = this.filter;
    f.type = p.filter ?? 'bandpass';
    f.Q.setValueAtTime(p.q ?? 1, tt);
    f.frequency.cancelScheduledValues(tt);
    f.frequency.setValueAtTime(hz(p.f0), tt);
    if (p.f1) f.frequency.exponentialRampToValueAtTime(hz(p.f1), tt + (p.glide ?? attack + hold + p.release));
    const env = this.synth.envelope;
    env.attack = attack;
    env.attackCurve = p.rise ? RISE : 'linear';
    env.release = p.release;
    this.synth.triggerAttackRelease(attack + hold, tt, v01(p.vel));
  }
}

export interface ToneP {
  f0: number;
  f1?: number;
  glide?: number;
  attack?: number;
  hold?: number;
  release: number;
  cutoff?: number;
  cutoff1?: number;
  vel: number;
  pan?: number;
  verb?: number;
}

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

class ToneVoice extends Voice {
  private readonly synth: Synth;
  private readonly filter: Filter;
  constructor(
    keep: Keep,
    dry: InputNode,
    verb: InputNode,
    readonly wave: Wave,
  ) {
    super(keep, dry, verb);
    this.synth = keep(
      new Synth({
        oscillator: { type: wave },
        envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.1, releaseCurve: EXP },
        volume: wave === 'sine' || wave === 'triangle' ? -10 : -16,
      }),
    );
    this.filter = keep(new Filter({ type: 'lowpass', frequency: 8000, Q: 0.8, rolloff: -12 }));
    this.synth.chain(this.filter, this.amp);
  }
  play(t: number, p: ToneP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.01;
    const len = attack + hold + p.release;
    const tt = this.begin(t, p.pan ?? 0, p.verb ?? 0.1, len);
    const f = this.filter.frequency;
    f.cancelScheduledValues(tt);
    f.setValueAtTime(hz(p.cutoff ?? 9000), tt);
    if (p.cutoff1) f.exponentialRampToValueAtTime(hz(p.cutoff1), tt + len);
    this.synth.frequency.cancelScheduledValues(tt);
    const env = this.synth.envelope;
    env.attack = attack;
    env.release = p.release;
    this.synth.triggerAttackRelease(hz(p.f0), attack + hold, tt, v01(p.vel));
    if (p.f1) this.synth.frequency.exponentialRampToValueAtTime(hz(p.f1), tt + (p.glide ?? len));
  }
}

export interface FmP {
  f0: number;
  f1?: number;
  glide?: number;
  /** 변조비 */
  h: number;
  index: number;
  attack?: number;
  hold?: number;
  release: number;
  /** 밝은 성분 지속(초) */
  shine?: number;
  vel: number;
  pan?: number;
  verb?: number;
}

class FmVoice extends Voice {
  private readonly synth: FMSynth;
  constructor(keep: Keep, dry: InputNode, verb: InputNode) {
    super(keep, dry, verb);
    this.synth = keep(
      new FMSynth({
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.5, releaseCurve: EXP },
        modulationEnvelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.3, releaseCurve: EXP },
        volume: -6,
      }),
    );
    this.synth.connect(this.amp);
  }
  play(t: number, p: FmP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.01;
    const len = attack + hold + p.release;
    const tt = this.begin(t, p.pan ?? rand(-0.15, 0.15), p.verb ?? 0.25, len);
    const s = this.synth;
    s.harmonicity.setValueAtTime(p.h, tt);
    s.modulationIndex.setValueAtTime(p.index, tt);
    s.frequency.cancelScheduledValues(tt);
    s.envelope.attack = attack;
    s.envelope.release = p.release;
    s.modulationEnvelope.attack = attack;
    s.modulationEnvelope.release = p.shine ?? p.release * 0.4;
    s.triggerAttackRelease(hz(p.f0), attack + hold, tt, v01(p.vel));
    if (p.f1) s.frequency.exponentialRampToValueAtTime(hz(p.f1), tt + (p.glide ?? len));
  }
}

export interface DrumP {
  f: number;
  pitchDecay?: number;
  octaves?: number;
  release: number;
  cutoff?: number;
  vel: number;
  pan?: number;
  verb?: number;
}

class DrumVoice extends Voice {
  private readonly synth: MembraneSynth;
  private readonly filter: Filter;
  constructor(keep: Keep, dry: InputNode, verb: InputNode) {
    super(keep, dry, verb);
    this.synth = keep(
      new MembraneSynth({
        pitchDecay: 0.05,
        octaves: 3,
        envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.3, releaseCurve: EXP },
        volume: -3,
      }),
    );
    this.filter = keep(new Filter({ type: 'lowpass', frequency: 2000, rolloff: -12 }));
    this.synth.chain(this.filter, this.amp);
  }
  play(t: number, p: DrumP): void {
    const tt = this.begin(t, p.pan ?? 0, p.verb ?? 0.15, p.release + 0.01);
    this.filter.frequency.setValueAtTime(hz(p.cutoff ?? 2000), tt);
    this.synth.pitchDecay = p.pitchDecay ?? 0.05;
    this.synth.octaves = p.octaves ?? 3;
    this.synth.envelope.release = p.release;
    this.synth.triggerAttackRelease(hz(p.f), 0.005, tt, v01(p.vel));
  }
}

class MetalVoice extends Voice {
  private readonly synth: MetalSynth;
  constructor(keep: Keep, dry: InputNode, verb: InputNode) {
    super(keep, dry, verb);
    // 파라미터 세터는 lookAhead 뒤에 적용되므로 프리셋은 고정하고 음높이/감쇠만 바꾼다
    this.synth = keep(
      new MetalSynth({
        harmonicity: 5.1,
        modulationIndex: 22,
        resonance: 2600,
        octaves: 1.1,
        envelope: { attack: 0.001, decay: 0.3, release: 0.2 },
        volume: -16,
      }),
    );
    this.synth.connect(this.amp);
  }
  play(t: number, f: number, vel: number, decay: number, pan: number, verb: number): void {
    const tt = this.begin(t, pan, verb, decay + 0.05);
    this.synth.envelope.decay = decay;
    this.synth.triggerAttackRelease(hz(f), 0.005, tt, v01(vel));
  }
}

// ===========================================================================
// 레시피
// ===========================================================================

/**
 * 레시피별 음량 보정 (오프라인 렌더 측정 피크 기준으로 맞춤).
 * 목표 피크(마스터 전): UI -14, 공격 -9, 타격 -3~-5, 보상 -10~-12 dBFS
 */
const TRIM: Partial<Record<Sfx, number>> = {
  click: 1.8,
  select: 4.8,
  error: 4.9,
  slash: 2.45,
  pierce: 1.33,
  gunshot: 0.9,
  fire: 2.75,
  arcane: 4.5,
  void: 1.19,
  block: 0.92,
  heal: 4.9,
  buff: 5.2,
  debuff: 5.6,
  break: 0.97,
  enemyDeath: 3.8,
  playerHit: 1.07,
  sanityLoss: 1.3,
  whisper: 1.33,
  levelUp: 1.5,
  coin: 6.8,
  essence: 6.8,
  footstep: 1.13,
  door: 0.87,
  portal: 2.5,
  riftOpen: 1.17,
  reveal: 4.1,
  bell: 3,
  heartbeat: 0.95,
  turnStart: 5.7,
  charge: 3.4,
  breakdown: 0.98,
};

interface Kit {
  /** 시작 시각(초) */
  t: number;
  /** 음높이 배율 */
  k: number;
  /** 볼륨 배율 */
  g: number;
  noise(p: NoiseP, dt?: number): void;
  tone(wave: Wave, p: ToneP, dt?: number): void;
  fm(p: FmP, dt?: number): void;
  drum(p: DrumP, dt?: number): void;
  metal(f: number, vel: number, dt?: number, decay?: number, verb?: number): void;
  whisper(dur: number, vel: number, dt?: number): void;
}

const RECIPES: Record<Sfx, (x: Kit) => void> = {
  // ---------------- UI ----------------
  click(x) {
    x.tone('sine', { f0: 1900, f1: 1300, glide: 0.02, release: 0.035, vel: 0.32, verb: 0 });
    x.noise({ filter: 'highpass', f0: 5000, release: 0.012, vel: 0.12, verb: 0 });
  },
  select(x) {
    x.fm({ f0: 880, h: 3, index: 1.6, release: 0.35, shine: 0.08, vel: 0.32, verb: 0.15 });
    x.fm({ f0: 1320, h: 3, index: 1.2, release: 0.45, shine: 0.08, vel: 0.26, verb: 0.2 }, 0.07);
  },
  error(x) {
    x.tone('square', { f0: 196, hold: 0.06, release: 0.06, cutoff: 1400, vel: 0.3, verb: 0 });
    x.tone('square', { f0: 185, hold: 0.09, release: 0.08, cutoff: 1200, vel: 0.3, verb: 0 }, 0.11);
  },

  // ---------------- 공격 ----------------
  slash(x) {
    const pan = rand(-0.3, 0.3);
    x.noise({ filter: 'bandpass', f0: 6000, f1: 900, glide: 0.16, q: 1.3, attack: 0.006, release: 0.17, vel: 0.8, pan, verb: 0.12 });
    x.tone('sine', { f0: 2600, f1: 1700, glide: 0.12, release: 0.14, vel: 0.08, pan, verb: 0.2 });
  },
  pierce(x) {
    x.noise({ filter: 'highpass', f0: 2800, f1: 6500, glide: 0.05, release: 0.07, vel: 0.6 });
    x.tone('sine', { f0: 1700, f1: 650, glide: 0.08, release: 0.1, vel: 0.28 });
    x.drum({ f: 190, pitchDecay: 0.02, octaves: 2, release: 0.1, vel: 0.35, cutoff: 1500 }, 0.02);
  },
  gunshot(x) {
    x.noise({ filter: 'lowpass', f0: 9000, attack: 0.0005, hold: 0.002, release: 0.05, vel: 1, verb: 0.3 });
    x.drum({ f: 70, pitchDecay: 0.03, octaves: 4, release: 0.25, vel: 0.95, cutoff: 1200, verb: 0.3 });
    x.noise({ filter: 'lowpass', f0: 1800, f1: 250, glide: 0.5, release: 0.6, vel: 0.55, verb: 0.5 }, 0.005);
  },
  blunt(x) {
    x.drum({ f: 92, pitchDecay: 0.04, octaves: 2.5, release: 0.22, vel: 0.95, cutoff: 900 });
    x.noise({ filter: 'lowpass', f0: 900, release: 0.09, vel: 0.6 });
  },
  fire(x) {
    x.noise({ filter: 'bandpass', f0: 450, f1: 1700, glide: 0.25, q: 0.9, attack: 0.03, hold: 0.12, release: 0.45, vel: 0.75, verb: 0.2 });
    x.noise({ filter: 'lowpass', f0: 700, attack: 0.02, hold: 0.1, release: 0.6, vel: 0.5 });
    x.noise({ filter: 'highpass', f0: 3000, release: 0.02, vel: 0.5 }, rand(0.08, 0.2));
  },
  arcane(x) {
    x.fm({ f0: 660, h: 2.01, index: 3, attack: 0.01, release: 0.9, shine: 0.3, vel: 0.38, verb: 0.5 });
    x.fm({ f0: 990, h: 2.01, index: 2.4, attack: 0.01, release: 0.8, shine: 0.25, vel: 0.3, verb: 0.5 }, 0.03);
    x.tone('sine', { f0: 1320, f1: 2640, glide: 0.25, release: 0.4, vel: 0.12, verb: 0.6 });
  },
  void(x) {
    x.drum({ f: 55, pitchDecay: 0.4, octaves: 1.5, release: 0.9, vel: 0.8, cutoff: 400, verb: 0.3 });
    x.noise({ filter: 'lowpass', f0: 200, f1: 2400, glide: 0.35, attack: 0.3, rise: true, release: 0.12, vel: 0.5, verb: 0.3 });
    x.fm({ f0: 70, f1: 48, glide: 0.6, h: 1.41, index: 12, attack: 0.02, release: 0.8, shine: 0.6, vel: 0.5, verb: 0.4 });
  },

  // ---------------- 방어 / 상태 ----------------
  block(x) {
    x.metal(330, 0.55, 0, 0.25, 0.2);
    x.drum({ f: 140, pitchDecay: 0.02, octaves: 2, release: 0.12, vel: 0.7, cutoff: 1500 });
  },
  heal(x) {
    [523, 659, 784, 1046].forEach((f, i) =>
      x.fm({ f0: f, h: 2, index: 1.2, release: 1, shine: 0.2, vel: 0.24 - i * 0.02, verb: 0.6 }, i * 0.08),
    );
    x.noise({ filter: 'bandpass', f0: 6000, q: 0.8, attack: 0.2, hold: 0.1, release: 0.5, vel: 0.12, verb: 0.5 });
  },
  buff(x) {
    x.tone('sawtooth', { f0: 220, f1: 440, glide: 0.3, attack: 0.02, hold: 0.22, release: 0.3, cutoff: 400, cutoff1: 3000, vel: 0.4, verb: 0.3 });
    x.fm({ f0: 1760, h: 3, index: 2, release: 0.4, shine: 0.1, vel: 0.24, verb: 0.4 }, 0.25);
  },
  debuff(x) {
    x.fm({ f0: 330, f1: 220, glide: 0.45, h: 1.5, index: 5, release: 0.5, vel: 0.38, verb: 0.3 });
    x.fm({ f0: 311, f1: 196, glide: 0.5, h: 1.5, index: 4, release: 0.5, vel: 0.3, verb: 0.3 }, 0.02);
    x.noise({ filter: 'lowpass', f0: 400, release: 0.3, vel: 0.2 });
  },
  break(x) {
    x.noise({ filter: 'highpass', f0: 3500, attack: 0.001, release: 0.35, vel: 0.7, verb: 0.3 });
    x.fm({ f0: 1900, h: 7.1, index: 9, release: 0.5, shine: 0.25, vel: 0.3, verb: 0.4 }, 0.005);
    x.drum({ f: 70, pitchDecay: 0.05, octaves: 3, release: 0.3, vel: 0.9, cutoff: 900 });
    x.tone('square', { f0: 1200, f1: 300, glide: 0.2, release: 0.2, cutoff: 3000, vel: 0.14 });
  },
  enemyDeath(x) {
    x.fm({ f0: 140, f1: 45, glide: 0.9, h: 0.5, index: 8, attack: 0.01, release: 1, shine: 0.8, vel: 0.55, verb: 0.4 });
    x.noise({ filter: 'lowpass', f0: 3000, f1: 200, glide: 1, attack: 0.01, release: 1, vel: 0.4, verb: 0.4 });
  },
  playerHit(x) {
    x.drum({ f: 80, pitchDecay: 0.05, octaves: 3, release: 0.3, vel: 1, cutoff: 1000, verb: 0.1 });
    x.noise({ filter: 'lowpass', f0: 4000, f1: 800, glide: 0.12, release: 0.12, vel: 0.6, verb: 0.1 });
    x.tone('square', { f0: 120, f1: 60, glide: 0.15, release: 0.15, cutoff: 800, vel: 0.22, verb: 0 });
  },
  sanityLoss(x) {
    x.fm({ f0: 440, f1: 415, glide: 0.8, h: 1.007, index: 6, release: 1.2, shine: 0.8, vel: 0.33, verb: 0.5 });
    x.fm({ f0: 466, f1: 392, glide: 1, h: 1.003, index: 4, release: 1.2, shine: 0.8, vel: 0.26, verb: 0.5 }, 0.04);
    x.drum({ f: 50, pitchDecay: 0.2, octaves: 1.6, release: 0.6, vel: 0.6, cutoff: 300 });
    x.whisper(0.7, 0.5, 0.1);
  },
  whisper(x) {
    x.whisper(rand(0.9, 1.6), 0.8);
  },
  levelUp(x) {
    [392, 587, 784, 988].forEach((f, i) =>
      x.fm({ f0: f, h: 3, index: 2, release: 1.2, shine: 0.3, vel: 0.32, verb: 0.5 }, i * 0.075),
    );
    x.noise({ filter: 'highpass', f0: 5000, attack: 0.3, hold: 0.05, release: 0.6, vel: 0.15, verb: 0.6 });
    x.drum({ f: 60, pitchDecay: 0.1, octaves: 2, release: 0.6, vel: 0.5, cutoff: 500 });
  },

  // ---------------- 보상 / 탐험 ----------------
  coin(x) {
    const j = rand(0.97, 1.03);
    x.fm({ f0: 1975 * j, h: 3.01, index: 1.5, release: 0.22, shine: 0.05, vel: 0.28, verb: 0.15 });
    x.fm({ f0: 2637 * j, h: 3.01, index: 1.2, release: 0.3, shine: 0.05, vel: 0.24, verb: 0.2 }, 0.06);
  },
  essence(x) {
    x.fm({ f0: 600, f1: 1200, glide: 0.4, h: 2.5, index: 2, attack: 0.05, release: 0.9, vel: 0.3, verb: 0.6 });
    x.noise({ filter: 'bandpass', f0: 800, f1: 4000, glide: 0.4, attack: 0.15, release: 0.4, vel: 0.2, verb: 0.4 });
    x.tone('sine', { f0: 2400, release: 0.6, vel: 0.08, verb: 0.6 }, 0.3);
  },
  footstep(x) {
    const f = rand(500, 850);
    x.noise({ filter: 'lowpass', f0: f, attack: 0.003, release: rand(0.06, 0.1), vel: rand(0.35, 0.5), pan: rand(-0.15, 0.15), verb: 0.08 });
    x.drum({ f: rand(100, 125), pitchDecay: 0.015, octaves: 1.5, release: 0.06, vel: 0.3, cutoff: 800 });
    if (chance(0.3)) x.noise({ filter: 'bandpass', f0: 2500, q: 2, release: 0.1, vel: 0.12 }, 0.02);
  },
  door(x) {
    x.fm({ f0: 140, f1: 175, glide: 0.5, h: 2.9, index: 9, attack: 0.08, hold: 0.3, release: 0.25, vel: 0.28, verb: 0.3 });
    x.noise({ filter: 'bandpass', f0: 1100, q: 3, attack: 0.05, hold: 0.2, release: 0.3, vel: 0.18, verb: 0.3 });
    x.drum({ f: 75, pitchDecay: 0.04, octaves: 2, release: 0.3, vel: 0.7, cutoff: 700, verb: 0.3 }, 0.62);
    x.noise({ filter: 'lowpass', f0: 600, release: 0.2, vel: 0.4, verb: 0.3 }, 0.62);
  },
  portal(x) {
    x.noise({ filter: 'bandpass', f0: 300, f1: 3000, glide: 1, q: 4, attack: 0.3, hold: 0.3, release: 0.8, vel: 0.45, verb: 0.5 });
    x.fm({ f0: 220, f1: 880, glide: 1.2, h: 1.5, index: 6, attack: 0.2, hold: 0.4, release: 0.8, vel: 0.3, verb: 0.5 });
    x.tone('sine', { f0: 55, attack: 0.3, hold: 0.3, release: 1.2, vel: 0.4, verb: 0.2 });
  },
  riftOpen(x) {
    x.drum({ f: 40, pitchDecay: 0.8, octaves: 2, release: 1.6, vel: 0.9, cutoff: 300, verb: 0.3 });
    x.noise({ filter: 'lowpass', f0: 150, f1: 5000, glide: 1.4, attack: 0.5, hold: 0.3, release: 1.2, vel: 0.5, verb: 0.5 });
    x.fm({ f0: 1046, h: 1.41, index: 4, attack: 0.6, hold: 0.2, release: 1.5, vel: 0.24, verb: 0.7 });
    x.fm({ f0: 1108, h: 1.41, index: 4, attack: 0.6, hold: 0.2, release: 1.5, vel: 0.2, verb: 0.7 }, 0.05);
    x.metal(200, 0.3, 0.1, 1.2, 0.6);
  },
  reveal(x) {
    [523, 784, 1175].forEach((f, i) => x.fm({ f0: f, h: 4, index: 1.6, release: 1.4, shine: 0.3, vel: 0.3, verb: 0.6 }, i * 0.12));
    x.noise({ filter: 'bandpass', f0: 7000, q: 1, attack: 0.4, hold: 0.1, release: 0.6, vel: 0.1, verb: 0.5 });
  },
  bell(x) {
    x.fm({ f0: 196, h: 1.4, index: 7, release: 4.5, shine: 1.5, vel: 0.6, verb: 0.7 });
    x.fm({ f0: 98, h: 1.4, index: 3, release: 5, shine: 2, vel: 0.3, verb: 0.7 });
  },
  heartbeat(x) {
    x.drum({ f: 50, pitchDecay: 0.05, octaves: 1.8, release: 0.3, vel: 0.9, cutoff: 150, verb: 0.05 });
    x.drum({ f: 47, pitchDecay: 0.05, octaves: 1.8, release: 0.3, vel: 0.6, cutoff: 150, verb: 0.05 }, 0.28);
  },

  // ---------------- 전투 흐름 ----------------
  turnStart(x) {
    x.noise({ filter: 'bandpass', f0: 400, f1: 1200, glide: 0.3, attack: 0.08, release: 0.3, vel: 0.18, verb: 0.3 });
    x.fm({ f0: 784, h: 3, index: 1.5, release: 0.8, shine: 0.15, vel: 0.24, verb: 0.4 });
    x.fm({ f0: 1175, h: 3, index: 1.2, release: 0.9, shine: 0.15, vel: 0.15, verb: 0.4 }, 0.08);
  },
  charge(x) {
    x.tone('sawtooth', { f0: 110, f1: 440, glide: 0.9, attack: 0.1, hold: 0.8, release: 0.15, cutoff: 300, cutoff1: 2500, vel: 0.32, verb: 0.3 });
    x.noise({ filter: 'bandpass', f0: 400, f1: 5000, glide: 0.9, attack: 0.6, rise: true, hold: 0.3, release: 0.1, vel: 0.35, verb: 0.3 });
  },
  victoryHit(x) {
    x.drum({ f: 50, pitchDecay: 0.12, octaves: 4, release: 0.8, vel: 1, cutoff: 900, verb: 0.4 });
    x.noise({ filter: 'lowpass', f0: 7000, attack: 0.001, release: 1.2, vel: 0.7, verb: 0.6 });
    x.metal(250, 0.4, 0, 0.9, 0.5);
    x.tone('sine', { f0: 40, f1: 30, glide: 1, release: 1, vel: 0.6, verb: 0.2 });
  },
  breakdown(x) {
    x.fm({ f0: 220, h: 1.003, index: 10, attack: 0.005, release: 2.2, shine: 1.5, vel: 0.5, verb: 0.6 });
    x.fm({ f0: 233, h: 1.003, index: 10, attack: 0.005, release: 2.2, shine: 1.5, vel: 0.45, verb: 0.6 }, 0.01);
    x.drum({ f: 35, pitchDecay: 0.6, octaves: 3, release: 1.8, vel: 1, cutoff: 300, verb: 0.3 });
    x.noise({ filter: 'lowpass', f0: 8000, f1: 200, glide: 2, release: 2, vel: 0.6, verb: 0.5 });
    x.whisper(1.5, 0.9, 0.2);
    x.tone('square', { f0: 110, f1: 55, glide: 1.5, release: 1.5, cutoff: 600, vel: 0.35, verb: 0.3 });
  },
};

// ===========================================================================

export class SfxPlayer {
  private readonly nodes: { dispose(): unknown }[] = [];
  private readonly noises: NoiseVoice[];
  private readonly tones: ToneVoice[];
  private readonly fms: FmVoice[];
  private readonly drums: DrumVoice[];
  private readonly metal: MetalVoice;
  private readonly whisperV: WhisperVoice;
  private readonly lastPlayed = new Map<Sfx, number>();

  constructor(dry: InputNode, verb: InputNode) {
    const keep: Keep = (x) => {
      this.nodes.push(x);
      return x;
    };
    this.noises = [0, 1, 2, 3].map(() => new NoiseVoice(keep, dry, verb));
    this.tones = (['sine', 'sine', 'square', 'sawtooth'] as const).map((w) => new ToneVoice(keep, dry, verb, w));
    this.fms = [0, 1, 2, 3].map(() => new FmVoice(keep, dry, verb));
    this.drums = [0, 1].map(() => new DrumVoice(keep, dry, verb));
    this.metal = new MetalVoice(keep, dry, verb);
    this.whisperV = keep(new WhisperVoice(dry, verb));
  }

  /** 가장 먼저 비는 보이스 (모두 바쁘면 가장 오래된 것을 빼앗는다) */
  private static pick<V extends Voice>(list: readonly V[]): V {
    let best = list[0];
    for (const v of list) if (v.busy < best.busy) best = v;
    return best;
  }

  play(name: Sfx, t: number, pitch = 1, volume = 1): void {
    const recipe = RECIPES[name];
    if (!recipe) return;
    // 같은 효과음이 한 프레임에 폭주하는 것 방지
    const prev = this.lastPlayed.get(name) ?? -1;
    if (t - prev < 0.03) return;
    this.lastPlayed.set(name, t);

    const k = clamp(pitch, 0.25, 4);
    const g = clamp(volume, 0, 1) * (TRIM[name] ?? 1);
    if (g <= 0) return;
    const ts = clamp(1 / k, 0.5, 2); // 피치가 높으면 짧게 (재생속도처럼)
    const at = (dt = 0) => t + dt * ts;
    const use = <V extends Voice>(v: V): V => {
      v.gain = g;
      return v;
    };
    const kit: Kit = {
      t,
      k,
      g,
      noise: (p, dt) =>
        use(SfxPlayer.pick(this.noises)).play(at(dt), {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          glide: p.glide && p.glide * ts,
          attack: p.attack && p.attack * ts,
          hold: p.hold && p.hold * ts,
          release: p.release * ts,
        }),
      tone: (wave, p, dt) => {
        const pool = this.tones.filter((v) => v.wave === wave);
        use(SfxPlayer.pick(pool.length ? pool : this.tones)).play(at(dt), {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          cutoff: p.cutoff && p.cutoff * k,
          cutoff1: p.cutoff1 && p.cutoff1 * k,
          glide: p.glide && p.glide * ts,
          attack: p.attack && p.attack * ts,
          hold: p.hold && p.hold * ts,
          release: p.release * ts,
        });
      },
      fm: (p, dt) =>
        use(SfxPlayer.pick(this.fms)).play(at(dt), {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          glide: p.glide && p.glide * ts,
          attack: p.attack && p.attack * ts,
          hold: p.hold && p.hold * ts,
          release: p.release * ts,
          shine: p.shine && p.shine * ts,
        }),
      drum: (p, dt) =>
        use(SfxPlayer.pick(this.drums)).play(at(dt), {
          ...p,
          f: p.f * k,
          cutoff: p.cutoff && p.cutoff * k,
          pitchDecay: p.pitchDecay && p.pitchDecay * ts,
          release: p.release * ts,
        }),
      metal: (f, vel, dt, decay = 0.3, verb = 0.2) => use(this.metal).play(at(dt), f * k, vel, decay * ts, rand(-0.2, 0.2), verb),
      whisper: (dur, vel, dt) => this.whisperV.speak(at(dt), dur * ts, 0.55 * vel * g, rand(-0.8, 0.8), 0.5),
    };
    recipe(kit);
  }

  dispose(): void {
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
