import { BiquadFilter, Gain, Panner, dbToGain, type BaseContext, type InputNode } from 'tone';
import { chance, clamp, rand } from './scales';
import { applyEnv, cleanup, makeOsc, noiseSource, startNoise, type BasicWave } from './synth';
import type { Sfx } from './types';
import { WhisperVoice } from './whisper';

// ===========================================================================
// 효과음 채널 풀
//   채널(필터 → 음량 보정 → 팬 → 드라이/리버브 센드)은 처음에 한 번만 만들어 재사용하고,
//   트리거마다 1회용 소스(오실레이터/노이즈 버퍼)와 엔벨로프 게인만 만든다(끝나면 연결 해제 → GC).
// ===========================================================================

type Keep = <T extends { dispose(): unknown }>(x: T) => T;
const v01 = (v: number): number => clamp(v, 0.001, 1);

/** 예전 Tone 보이스와 같은 기준 음량 */
const LEVEL = {
  noise: dbToGain(-2.3),
  sine: dbToGain(-10),
  buzz: dbToGain(-16),
  fm: dbToGain(-16),
  drum: dbToGain(-3),
} as const;

class Channel {
  /** 이 시각까지 소리가 남 */
  busy = 0;
  private readonly filter: BiquadFilter;
  private readonly amp: Gain;
  private readonly panner: Panner;
  private readonly send: Gain;
  constructor(
    private readonly ctx: BaseContext,
    keep: Keep,
    dry: InputNode,
    verb: InputNode,
  ) {
    const context = ctx;
    this.filter = keep(new BiquadFilter({ context, type: 'lowpass', frequency: this.hz(18000), Q: 0.7 }));
    this.amp = keep(new Gain({ context, gain: 1 }));
    this.panner = keep(new Panner({ context, pan: 0 }));
    this.send = keep(new Gain({ context, gain: 0 }));
    this.filter.chain(this.amp, this.panner);
    this.panner.connect(dry);
    this.panner.chain(this.send, verb);
  }
  hz(f: number): number {
    return clamp(f, 20, this.ctx.sampleRate * 0.45);
  }
  get input(): AudioNode {
    return this.filter.input;
  }
  setup(
    t: number,
    o: { gain: number; pan: number; verb: number; length: number; filter?: BiquadFilterType; f0?: number; f1?: number; glide?: number; q?: number },
  ): void {
    this.busy = t + o.length;
    this.amp.gain.setValueAtTime(o.gain, t);
    this.panner.pan.setValueAtTime(clamp(o.pan, -1, 1), t);
    this.send.gain.setValueAtTime(clamp(o.verb, 0, 1), t);
    this.filter.type = o.filter ?? 'lowpass';
    const p = this.filter.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(this.hz(o.f0 ?? 18000), t);
    if (o.f1) p.exponentialRampToValueAtTime(this.hz(o.f1), t + (o.glide ?? o.length));
    this.filter.Q.setValueAtTime(o.q ?? 0.7, t);
  }
}

export interface NoiseP {
  filter?: BiquadFilterType;
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

type Wave = BasicWave;

// ===========================================================================
// 레시피
// ===========================================================================

/**
 * 레시피별 음량 보정 (오프라인 렌더 측정 피크 기준으로 맞춤).
 * 목표 피크(마스터 전): UI -14, 공격 -9, 타격 -3~-5, 보상 -10~-12 dBFS
 */
const TRIM: Partial<Record<Sfx, number>> = {
  glass: 1.1,
  tick: 2.6,
  sting: 0.9,
  glitch: 2.2,
  thud: 1.2,
  swoosh: 2.4,
  flatline: 1.6,
  click: 1.8,
  select: 4.8,
  error: 4.9,
  slash: 2.45,
  pierce: 1.33,
  gunshot: 0.9,
  fire: 2.75,
  arcane: 4.5,
  void: 1.19,
  block: 1.4,
  heal: 4.9,
  buff: 5.2,
  debuff: 5.6,
  break: 0.97,
  enemyDeath: 2.7,
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

/** 레시피가 쓰는 도구 (음높이 배율·시간 배율·음량 보정은 이미 적용되어 있다). dt = 시작 시각으로부터의 지연(초) */
interface Kit {
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
  // ---------------- 화면 연출 ----------------
  glass(x) {
    // 유리: 높은 금속성 파편 여러 개가 흩어지며 떨어진다
    x.noise({ filter: 'highpass', f0: 5200, attack: 0.001, release: 0.5, vel: 0.75, verb: 0.45 });
    [2900, 4100, 3300, 5200, 3700].forEach((f, i) => x.fm({ f0: f, h: 6.3 + i * 0.7, index: 7, release: 0.35 + i * 0.08, shine: 0.2, vel: 0.22, verb: 0.5 }, i * 0.035));
    x.noise({ filter: 'bandpass', f0: 6500, q: 2, attack: 0.02, release: 0.9, vel: 0.25, verb: 0.6 }, 0.12);
    x.drum({ f: 90, pitchDecay: 0.04, octaves: 2, release: 0.2, vel: 0.5, cutoff: 1200 });
  },
  tick(x) {
    x.noise({ filter: 'bandpass', f0: 3800, q: 6, attack: 0.001, release: 0.04, vel: 0.6, verb: 0.25 });
    x.fm({ f0: 2100, h: 3.1, index: 2, release: 0.06, shine: 0.05, vel: 0.2, verb: 0.3 });
  },
  sting(x) {
    // 수호자 등장: 낮은 충격 + 불협 금관
    x.drum({ f: 42, pitchDecay: 0.3, octaves: 3, release: 1.6, vel: 1, cutoff: 500, verb: 0.5 });
    x.fm({ f0: 110, h: 1.5, index: 6, attack: 0.02, release: 2.4, shine: 1.2, vel: 0.45, verb: 0.7 });
    x.fm({ f0: 116.5, h: 1.5, index: 6, attack: 0.02, release: 2.4, shine: 1.2, vel: 0.35, verb: 0.7 }, 0.02);
    x.noise({ filter: 'lowpass', f0: 6000, f1: 300, glide: 1.6, attack: 0.01, release: 1.6, vel: 0.45, verb: 0.6 });
  },
  glitch(x) {
    for (let i = 0; i < 6; i++) x.tone('square', { f0: 180 + ((i * 397) % 1400), release: 0.03, cutoff: 4000, vel: 0.22, verb: 0 }, i * 0.045);
    x.noise({ filter: 'bandpass', f0: 2500, q: 0.8, attack: 0.001, hold: 0.18, release: 0.05, vel: 0.35, verb: 0.1 });
  },
  thud(x) {
    x.drum({ f: 55, pitchDecay: 0.08, octaves: 2.5, release: 0.45, vel: 1, cutoff: 600, verb: 0.35 });
    x.noise({ filter: 'lowpass', f0: 1800, f1: 300, glide: 0.2, release: 0.25, vel: 0.5, verb: 0.3 });
  },
  flatline(x) {
    x.tone('sine', { f0: 988, attack: 0.01, hold: 2.2, release: 0.6, vel: 0.28, verb: 0.2 });
  },
  swoosh(x) {
    x.noise({ filter: 'bandpass', f0: 600, f1: 4500, glide: 0.25, q: 1.2, attack: 0.05, release: 0.25, vel: 0.55, verb: 0.3 });
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
  private readonly chans: Channel[];
  private readonly whisperV: WhisperVoice;
  private readonly lastPlayed = new Map<Sfx, number>();

  constructor(
    private readonly ctx: BaseContext,
    dry: InputNode,
    verb: InputNode,
  ) {
    const keep: Keep = (x) => {
      this.nodes.push(x);
      return x;
    };
    this.chans = Array.from({ length: 10 }, () => new Channel(ctx, keep, dry, verb));
    this.whisperV = keep(new WhisperVoice(ctx, dry, verb));
  }

  /** 가장 먼저 비는 채널 (모두 바쁘면 가장 오래된 것을 빼앗는다) */
  private chan(): Channel {
    let best = this.chans[0];
    for (const c of this.chans) if (c.busy < best.busy) best = c;
    return best;
  }

  /** 1회용 엔벨로프 게인 → 채널 */
  private envGain(ch: Channel, t: number, peak: number, attack: number, hold: number, release: number, rise = false): { g: GainNode; end: number } {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(ch.input);
    const end = applyEnv(g.gain, t, peak, { a: attack, r: release, rise }, attack + hold);
    return { g, end };
  }

  private noise(t: number, gain: number, p: NoiseP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.004;
    const ch = this.chan();
    ch.setup(t, { gain, pan: p.pan ?? rand(-0.1, 0.1), verb: p.verb ?? 0.1, length: attack + hold + p.release, filter: p.filter ?? 'bandpass', f0: p.f0, f1: p.f1, glide: p.glide, q: p.q ?? 1 });
    const { g, end } = this.envGain(ch, t, v01(p.vel) * LEVEL.noise, attack, hold, p.release, p.rise);
    const src = noiseSource(this.ctx, 'white');
    src.connect(g);
    startNoise(src, t);
    src.stop(end);
    cleanup([src], [g]);
  }

  private tone(t: number, gain: number, wave: Wave, p: ToneP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.01;
    const len = attack + hold + p.release;
    const ch = this.chan();
    ch.setup(t, { gain, pan: p.pan ?? 0, verb: p.verb ?? 0.1, length: len, filter: 'lowpass', f0: p.cutoff ?? 9000, f1: p.cutoff1, glide: len, q: 0.8 });
    const level = wave === 'sine' || wave === 'triangle' ? LEVEL.sine : LEVEL.buzz;
    const { g, end } = this.envGain(ch, t, v01(p.vel) * level, attack, hold, p.release);
    const osc = makeOsc(this.ctx, wave, ch.hz(p.f0));
    if (p.f1) {
      osc.frequency.setValueAtTime(ch.hz(p.f0), t);
      osc.frequency.exponentialRampToValueAtTime(ch.hz(p.f1), t + (p.glide ?? len));
    }
    osc.connect(g);
    osc.start(t);
    osc.stop(end);
    cleanup([osc], [g]);
  }

  private fm(t: number, gain: number, p: FmP): void {
    const attack = p.attack ?? 0.002;
    const hold = p.hold ?? 0.01;
    const len = attack + hold + p.release;
    const ch = this.chan();
    ch.setup(t, { gain, pan: p.pan ?? rand(-0.15, 0.15), verb: p.verb ?? 0.25, length: len });
    const v = v01(p.vel);
    const { g, end } = this.envGain(ch, t, v * LEVEL.fm, attack, hold, p.release);
    const f0 = ch.hz(p.f0);
    const car = makeOsc(this.ctx, 'sine', f0);
    const mod = makeOsc(this.ctx, 'sine', f0 * p.h);
    const mg = this.ctx.createGain();
    mg.gain.value = 0;
    applyEnv(mg.gain, t, f0 * p.index * 0.32 * (0.4 + 0.6 * v), { a: attack, r: p.shine ?? p.release * 0.4 }, attack + hold);
    if (p.f1) {
      const f1 = ch.hz(p.f1);
      const at = t + (p.glide ?? len);
      car.frequency.setValueAtTime(f0, t);
      car.frequency.exponentialRampToValueAtTime(f1, at);
      mod.frequency.setValueAtTime(f0 * p.h, t);
      mod.frequency.exponentialRampToValueAtTime(f1 * p.h, at);
    }
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(g);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    cleanup([car, mod], [g, mg]);
  }

  private drum(t: number, gain: number, p: DrumP): void {
    const ch = this.chan();
    ch.setup(t, { gain, pan: p.pan ?? 0, verb: p.verb ?? 0.15, length: p.release + 0.01, filter: 'lowpass', f0: p.cutoff ?? 2000, q: 0.7 });
    const { g, end } = this.envGain(ch, t, v01(p.vel) * LEVEL.drum, 0.002, 0, p.release);
    const f = ch.hz(p.f);
    const osc = makeOsc(this.ctx, 'sine', f);
    osc.frequency.setValueAtTime(ch.hz(f * (p.octaves ?? 3)), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + (p.pitchDecay ?? 0.05));
    osc.connect(g);
    osc.start(t);
    osc.stop(end);
    cleanup([osc], [g]);
  }

  /** 금속성 타격: 비조화 FM 두 겹 (MetalSynth 대체) */
  private metal(t: number, gain: number, f: number, vel: number, decay: number, pan: number, verb: number): void {
    this.fm(t, gain, { f0: f, h: 1.414, index: 14, release: decay, shine: decay * 0.35, vel, pan, verb });
    this.fm(t, gain, { f0: f * 2.76, h: 1.73, index: 6, release: decay * 0.7, shine: decay * 0.2, vel: vel * 0.6, pan, verb });
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
    const sc = (x: number | undefined) => (x === undefined ? undefined : x * ts);
    const kit: Kit = {
      noise: (p, dt) =>
        this.noise(at(dt), g, {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          glide: sc(p.glide),
          attack: sc(p.attack),
          hold: sc(p.hold),
          release: p.release * ts,
        }),
      tone: (wave, p, dt) =>
        this.tone(at(dt), g, wave, {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          cutoff: p.cutoff && p.cutoff * k,
          cutoff1: p.cutoff1 && p.cutoff1 * k,
          glide: sc(p.glide),
          attack: sc(p.attack),
          hold: sc(p.hold),
          release: p.release * ts,
        }),
      fm: (p, dt) =>
        this.fm(at(dt), g, {
          ...p,
          f0: p.f0 * k,
          f1: p.f1 && p.f1 * k,
          glide: sc(p.glide),
          attack: sc(p.attack),
          hold: sc(p.hold),
          release: p.release * ts,
          shine: sc(p.shine),
        }),
      drum: (p, dt) =>
        this.drum(at(dt), g, {
          ...p,
          f: p.f * k,
          cutoff: p.cutoff && p.cutoff * k,
          pitchDecay: sc(p.pitchDecay),
          release: p.release * ts,
        }),
      metal: (f, vel, dt, decay = 0.3, verb = 0.2) => this.metal(at(dt), g, f * k, vel, decay * ts, rand(-0.2, 0.2), verb),
      whisper: (dur, vel, dt) => this.whisperV.speak(at(dt), dur * ts, 0.55 * vel * g, rand(-0.8, 0.8), 0.5),
    };
    recipe(kit);
  }

  dispose(): void {
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
