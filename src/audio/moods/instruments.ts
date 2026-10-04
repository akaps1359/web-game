import { BiquadFilter, Gain, dbToGain } from 'tone';
import { clamp } from '../scales';
import { DrumSynth, FmSynth, NoiseSynth, OscSynth, type Ctx, type NoiseColor, type Playable, type Wave } from '../synth';
import type { Runtime } from './runtime';

/**
 * 음량 보정(dB). 프리셋의 volume 인자는 예전 Tone 악기 기준 값을 그대로 쓰고, 네이티브 구현과의 차이는 여기서 맞춘다.
 *  - 디튠 겹침(2~3 오실레이터): Tone FatOscillator는 개당 -6-1.1n dB로 줄였으므로 약 -5dB
 *  - 노이즈: 공유 노이즈 버퍼(RMS 0.3)가 Tone 화이트 노이즈(RMS 0.58)보다 작아 +5.7dB
 */
export const COMP = { stack: -5, noise: 5.7 } as const;

/** 나이퀴스트 아래로 자른 필터 주파수 (Tone Param은 범위를 벗어나면 예외) */
export const fq = (ctx: Ctx, f: number): number => clamp(f, 10, ctx.sampleRate * 0.45);

/** Tone.BiquadFilter (Param 기반이라 Tone.Filter보다 4배 가볍다) */
export function biquad(rt: Runtime, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilter {
  return rt.bag.add(new BiquadFilter({ context: rt.ctx, type, frequency: fq(rt.ctx, freq), Q: q }));
}

/** 필터 주파수를 부드럽게 이동 */
export function sweep(f: BiquadFilter, to: number, sec: number, t: number): void {
  f.frequency.rampTo(fq(f.context, to), Math.max(0.01, sec), t);
}

// ---------------------------------------------------------------------------
// Tonal presets
// ---------------------------------------------------------------------------

export interface BellOpts {
  /** 변조 주파수 비 — 1.4 = 묵직한 종, 3.5 = 관종, 4~7 = 첼레스타/오르골 */
  harmonicity?: number;
  index?: number;
  /** 울림(초, -60dB) */
  ring?: number;
  /** 밝은 성분 지속(초) */
  shine?: number;
  /** dB */
  volume?: number;
  poly?: number;
}

export function fmBell(rt: Runtime, o: BellOpts = {}): FmSynth {
  return rt.bag.add(
    new FmSynth(rt.ctx, {
      ratio: o.harmonicity ?? 3.5,
      index: o.index ?? 8,
      env: { a: 0.002, r: o.ring ?? 4 },
      modEnv: { a: 0.002, r: o.shine ?? 1.2 },
      level: dbToGain(o.volume ?? -14),
      max: o.poly ?? 6,
    }),
  );
}

/** 부드러운 전자피아노/펠트피아노 (FM 1:1) */
export function fmKeys(rt: Runtime, o: { ring?: number; volume?: number; poly?: number; bright?: number } = {}): FmSynth {
  return rt.bag.add(
    new FmSynth(rt.ctx, {
      ratio: 1,
      index: o.bright ?? 1.6,
      modWave: 'triangle',
      env: { a: 0.004, r: o.ring ?? 3 },
      modEnv: { a: 0.004, r: 0.7 },
      level: dbToGain(o.volume ?? -12),
      max: o.poly ?? 8,
    }),
  );
}

/** 하프/기타 같은 뜯는 소리 */
export function pluck(rt: Runtime, o: { ring?: number; volume?: number; poly?: number } = {}): OscSynth {
  return rt.bag.add(
    new OscSynth(rt.ctx, {
      wave: [1, 0.5, 0.28, 0.12, 0.07, 0.03],
      env: { a: 0.003, r: o.ring ?? 1.8 },
      level: dbToGain(o.volume ?? -12),
      max: o.poly ?? 8,
    }),
  );
}

export interface PadOpts {
  type?: 'sawtooth' | 'triangle' | 'sine' | 'square';
  /** 겹칠 오실레이터 수 (2~3) */
  count?: number;
  /** 디튠 폭(cents) */
  spread?: number;
  attack?: number;
  release?: number;
  /** dB */
  volume?: number;
  poly?: number;
}

export function spreadDetunes(count: number, spread: number): number[] {
  if (count <= 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(-spread / 2 + (spread * i) / (count - 1));
  return out;
}

/** 지속음 패드 (필터는 호출자가) */
export function padSynth(rt: Runtime, o: PadOpts = {}): OscSynth {
  return rt.bag.add(
    new OscSynth(rt.ctx, {
      wave: o.type ?? 'sawtooth',
      detunes: spreadDetunes(o.count ?? 2, o.spread ?? 16),
      env: { a: o.attack ?? 2.5, r: o.release ?? 4 },
      level: dbToGain((o.volume ?? -20) + COMP.stack),
      max: o.poly ?? 10,
    }),
  );
}

/** 금관 같은 저음 스탭/스웰 (필터는 호출자가) */
export function brass(rt: Runtime, o: { volume?: number; attack?: number; release?: number; poly?: number } = {}): OscSynth {
  return rt.bag.add(
    new OscSynth(rt.ctx, {
      wave: 'sawtooth',
      detunes: [-11, 11],
      env: { a: o.attack ?? 0.08, r: o.release ?? 0.9 },
      level: dbToGain((o.volume ?? -14) + COMP.stack),
      max: o.poly ?? 8,
    }),
  );
}

// ---------------------------------------------------------------------------
// Formant choir: 톱니파(비브라토) → 병렬 밴드패스(모음 포먼트)
// ---------------------------------------------------------------------------

export type Vowel = 'a' | 'o' | 'u' | 'e' | 'i';
const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [760, 1150, 2800],
  o: [470, 820, 2600],
  u: [330, 720, 2450],
  e: [430, 1700, 2600],
  i: [300, 2100, 2900],
};
const FORMANT_GAIN = [1, 0.55, 0.2] as const;

export interface Choir {
  synth: OscSynth;
  output: Gain;
  setVowel(v: Vowel, t: number, ramp: number): void;
}

export function choir(
  rt: Runtime,
  o: { volume?: number; attack?: number; release?: number; vibrato?: number; poly?: number; vowel?: Vowel } = {},
): Choir {
  const synth = rt.bag.add(
    new OscSynth(rt.ctx, {
      wave: 'sawtooth',
      detunes: [-8, 8],
      env: { a: o.attack ?? 1.4, r: o.release ?? 2.8 },
      level: dbToGain((o.volume ?? -10) + COMP.stack),
      max: o.poly ?? 10,
      vibrato: { rate: 4.8, cents: (o.vibrato ?? 0.12) * 140 },
    }),
  );
  const output = rt.bag.add(new Gain({ context: rt.ctx, gain: 3.2 })); // 밴드패스로 줄어든 에너지 보상
  const filters = FORMANTS[o.vowel ?? 'a'].map((f, i) => {
    const flt = biquad(rt, 'bandpass', f, i === 0 ? 5 : 8);
    const g = rt.bag.add(new Gain({ context: rt.ctx, gain: FORMANT_GAIN[i] }));
    synth.output.chain(flt, g, output);
    return flt;
  });
  // 저역 몸통
  const body = biquad(rt, 'lowpass', 420, 0.7);
  const bodyGain = rt.bag.add(new Gain({ context: rt.ctx, gain: 0.18 }));
  synth.output.chain(body, bodyGain, output);
  return {
    synth,
    output,
    setVowel(v, t, ramp) {
      FORMANTS[v].forEach((f, i) => sweep(filters[i], f, ramp, t));
    },
  };
}

// ---------------------------------------------------------------------------
// Percussion presets
// ---------------------------------------------------------------------------

export function taiko(rt: Runtime, volume = -4): DrumSynth {
  return rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'sine', octaves: 3.2, pitchDecay: 0.06, env: { a: 0.002, r: 0.9 }, level: dbToGain(volume) }),
  );
}

export function tom(rt: Runtime, volume = -9): DrumSynth {
  return rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'triangle', octaves: 2.2, pitchDecay: 0.03, env: { a: 0.002, r: 0.45 }, level: dbToGain(volume) }),
  );
}

export function boomDrum(rt: Runtime, volume = -4, ring = 1.8): DrumSynth {
  return rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'sine', octaves: 2.6, pitchDecay: 0.14, env: { a: 0.003, r: ring }, level: dbToGain(volume) }),
  );
}

/** 짧은 노이즈 타격(손바닥/스네어/쉐이커/심벌). filter로 음색 결정 */
export function noiseHit(
  rt: Runtime,
  o: { color?: NoiseColor; decay?: number; volume?: number; filter: BiquadFilterType; freq: number; q?: number },
): { synth: NoiseSynth; filter: BiquadFilter } {
  const synth = rt.bag.add(
    new NoiseSynth(rt.ctx, { color: o.color ?? 'white', env: { a: 0.001, r: o.decay ?? 0.12 }, level: dbToGain((o.volume ?? -14) + COMP.noise) }),
  );
  const filter = biquad(rt, o.filter, o.freq, o.q ?? 1);
  synth.output.connect(filter);
  return { synth, filter };
}

/**
 * 금속성 타격 (쇠사슬/모루). Tone.MetalSynth는 아이폰엔 너무 무거워서
 * 비조화 비율의 FM 두 겹으로 '쨍' 하는 소리를 만든다.
 */
export interface Metal {
  output: Gain;
  hit(t: number, vel: number): void;
}

export function metal(rt: Runtime, o: { freq?: number; decay?: number; volume?: number } = {}): Metal {
  const f = o.freq ?? 380;
  const decay = o.decay ?? 0.3;
  const level = dbToGain(o.volume ?? -14);
  const a = rt.bag.add(new FmSynth(rt.ctx, { ratio: 1.414, index: 14, env: { a: 0.001, r: decay }, modEnv: { a: 0.001, r: decay * 0.35 }, level, max: 3 }));
  const b = rt.bag.add(new FmSynth(rt.ctx, { ratio: 1.73, index: 6, env: { a: 0.001, r: decay * 0.7 }, modEnv: { a: 0.001, r: decay * 0.2 }, level: level * 0.6, max: 3 }));
  const output = rt.bag.add(new Gain({ context: rt.ctx, gain: 1 }));
  a.output.connect(output);
  b.output.connect(output);
  return {
    output,
    hit(t, vel) {
      const k = 1 + (Math.random() - 0.5) * 0.06;
      a.play(f * k, 0.002, t, vel);
      b.play(f * k * 2.76, 0.002, t, vel);
    },
  };
}

// ---------------------------------------------------------------------------
// Bass (모노 오스티나토) — 공유 로우패스에 노트마다 필터 엔벨로프
// ---------------------------------------------------------------------------

export class BassSynth implements Playable {
  readonly output: Gain;
  private readonly osc: OscSynth;
  private readonly filter: BiquadFilter;
  private readonly base: number;
  /** 필터 엔벨로프 폭(옥타브) */
  octaves: number;
  constructor(
    private readonly rt: Runtime,
    o: { wave?: Wave; detunes?: readonly number[]; base?: number; octaves?: number; q?: number; volume?: number },
  ) {
    this.base = o.base ?? 90;
    this.octaves = o.octaves ?? 3;
    this.osc = rt.bag.add(
      new OscSynth(rt.ctx, {
        wave: o.wave ?? 'sawtooth',
        detunes: o.detunes ?? [0],
        env: { a: 0.004, d: 0.25, s: 0.55, r: 0.12 },
        level: dbToGain(o.volume ?? -10),
        max: 3,
      }),
    );
    this.filter = biquad(rt, 'lowpass', this.base * 4, o.q ?? 2.5);
    this.output = rt.bag.add(new Gain({ context: rt.ctx, gain: 1 }));
    this.osc.output.chain(this.filter, this.output);
  }
  setQ(v: number, t: number): void {
    this.filter.Q.setValueAtTime(v, t);
  }
  triggerAttackRelease(notes: number | readonly number[], dur: number, t: number, vel = 1): void {
    const f = typeof notes === 'number' ? notes : notes[0];
    const ctx = this.rt.ctx;
    const peak = fq(ctx, this.base * Math.pow(2, this.octaves * (0.5 + 0.5 * vel)));
    const sus = fq(ctx, this.base * Math.pow(2, this.octaves * 0.15));
    const p = this.filter.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(peak, t);
    p.exponentialRampToValueAtTime(sus, t + 0.18);
    this.osc.play(f, dur, t, vel);
  }
  releaseAll(t: number): void {
    this.osc.releaseAll(t);
  }
}

export function bassSynth(rt: Runtime, o: { volume?: number; type?: 'sawtooth' | 'square' | 'fatsawtooth'; cutoff?: number; env?: number } = {}): BassSynth {
  const fat = o.type === 'fatsawtooth';
  return new BassSynth(rt, {
    wave: o.type === 'square' ? 'square' : 'sawtooth',
    detunes: fat ? [-6, 6] : [0],
    base: o.cutoff ?? 90,
    octaves: o.env ?? 3,
    volume: (o.volume ?? -10) + (fat ? COMP.stack : 0),
  });
}
