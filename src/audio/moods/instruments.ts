import {
  Filter,
  FMSynth,
  Gain,
  MembraneSynth,
  MetalSynth,
  MonoSynth,
  NoiseSynth,
  PolySynth,
  Synth,
  Vibrato,
  type ToneAudioNode,
} from 'tone';
import type { Runtime } from './runtime';

// ---------------------------------------------------------------------------
// Envelope curves
// Tone의 'exponential' 감쇠는 시간상수가 log로 압축돼 긴 울림이 잘 안 나온다.
// 그래서 sustain=1 + 짧은 duration + 배열 releaseCurve 로 진짜 지수 감쇠를 만든다.
// ---------------------------------------------------------------------------

/** 1 → 0 지수 감쇠 곡선 (k=6.9 ≈ -60dB) */
export function expCurve(n: number, k: number): number[] {
  const out: number[] = [];
  const end = Math.exp(-k);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push((Math.exp(-k * x) - end) / (1 - end));
  }
  return out;
}

/** 0 → 1 가속 상승 곡선 (역재생 같은 스웰) */
export function riseCurve(n: number, k: number): number[] {
  return expCurve(n, k).reverse();
}

export const EXP = expCurve(40, 6.9);
export const SOFT = expCurve(32, 4.2);
export const RISE = riseCurve(32, 4.5);

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface BellOpts {
  /** 변조 주파수 비 — 1.4 = 묵직한 종, 3.5 = 관종, 5~7 = 오르골/첼레스타 */
  harmonicity?: number;
  index?: number;
  /** 울림(초) */
  ring?: number;
  /** 밝은 성분이 사라지는 시간(초) */
  shine?: number;
  volume?: number;
  poly?: number;
}

/** FM 종/첼레스타/오르골 */
export function fmBell(rt: Runtime, o: BellOpts = {}): PolySynth<FMSynth> {
  const s = rt.bag.add(
    new PolySynth(FMSynth, {
      harmonicity: o.harmonicity ?? 3.5,
      modulationIndex: o.index ?? 8,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: o.ring ?? 4, releaseCurve: EXP },
      modulationEnvelope: { attack: 0.002, decay: 0, sustain: 1, release: o.shine ?? 1.2, releaseCurve: EXP },
      volume: o.volume ?? -14,
    }),
  );
  s.maxPolyphony = o.poly ?? 6;
  return s;
}

/** 부드러운 전자피아노/펠트피아노 느낌 (FM 1:1) */
export function fmKeys(rt: Runtime, o: { ring?: number; volume?: number; poly?: number; bright?: number } = {}): PolySynth<FMSynth> {
  const s = rt.bag.add(
    new PolySynth(FMSynth, {
      harmonicity: 1,
      modulationIndex: o.bright ?? 1.6,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0, sustain: 1, release: o.ring ?? 3, releaseCurve: EXP },
      modulationEnvelope: { attack: 0.004, decay: 0, sustain: 1, release: 0.6, releaseCurve: EXP },
      volume: o.volume ?? -12,
    }),
  );
  s.maxPolyphony = o.poly ?? 8;
  return s;
}

/** 하프/기타 같은 뜯는 소리 */
export function pluck(rt: Runtime, o: { ring?: number; volume?: number; poly?: number } = {}): PolySynth<Synth> {
  const s = rt.bag.add(
    new PolySynth(Synth, {
      oscillator: { type: 'custom', partials: [1, 0.5, 0.28, 0.12, 0.07, 0.03] },
      envelope: { attack: 0.003, decay: 0, sustain: 1, release: o.ring ?? 1.8, releaseCurve: EXP },
      volume: o.volume ?? -12,
    }),
  );
  s.maxPolyphony = o.poly ?? 8;
  return s;
}

export interface PadOpts {
  type?: 'fatsawtooth' | 'fattriangle' | 'fatsine' | 'fatsquare';
  count?: number;
  spread?: number;
  attack?: number;
  release?: number;
  volume?: number;
  poly?: number;
}

/** 지속음 패드 — 출력은 Synth 묶음 그대로 (필터는 호출자가) */
export function padSynth(rt: Runtime, o: PadOpts = {}): PolySynth<Synth> {
  const s = rt.bag.add(
    new PolySynth(Synth, {
      oscillator: { type: o.type ?? 'fatsawtooth', count: o.count ?? 2, spread: o.spread ?? 16 },
      envelope: { attack: o.attack ?? 2.5, decay: 0, sustain: 1, release: o.release ?? 4, releaseCurve: SOFT },
      volume: o.volume ?? -20,
    }),
  );
  s.maxPolyphony = o.poly ?? 10;
  return s;
}

// ---------------------------------------------------------------------------
// Formant choir: 톱니파 → 비브라토 → 병렬 밴드패스(모음 포먼트)
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
  synth: PolySynth<Synth>;
  output: Gain;
  setVowel(v: Vowel, t: number, ramp: number): void;
}

export function choir(
  rt: Runtime,
  o: { volume?: number; attack?: number; release?: number; vibrato?: number; poly?: number; vowel?: Vowel } = {},
): Choir {
  const synth = rt.bag.add(
    new PolySynth(Synth, {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
      envelope: { attack: o.attack ?? 1.4, decay: 0, sustain: 1, release: o.release ?? 2.8, releaseCurve: SOFT },
      volume: o.volume ?? -10,
    }),
  );
  synth.maxPolyphony = o.poly ?? 10;
  const vib = rt.bag.add(new Vibrato({ frequency: 4.8, depth: o.vibrato ?? 0.12, maxDelay: 0.005, wet: 1 }));
  synth.connect(vib);
  const output = rt.bag.add(new Gain(3.2)); // 밴드패스로 줄어든 에너지 보상
  const filters = FORMANTS[o.vowel ?? 'a'].map((f, i) => {
    const flt = rt.bag.add(new Filter({ type: 'bandpass', frequency: f, Q: i === 0 ? 5 : 8, rolloff: -12 }));
    const g = rt.bag.add(new Gain(FORMANT_GAIN[i]));
    vib.connect(flt);
    flt.connect(g);
    g.connect(output);
    return flt;
  });
  // 저역 몸통이 너무 빠지지 않게 약간의 로우패스 원음을 섞는다
  const body = rt.bag.add(new Filter({ type: 'lowpass', frequency: 420, rolloff: -12 }));
  const bodyGain = rt.bag.add(new Gain(0.18));
  vib.chain(body, bodyGain, output);
  return {
    synth,
    output,
    setVowel(v, t, ramp) {
      FORMANTS[v].forEach((f, i) => filters[i].frequency.rampTo(f, ramp, t));
    },
  };
}

// ---------------------------------------------------------------------------
// Percussion presets
// ---------------------------------------------------------------------------

export function taiko(rt: Runtime, volume = -6): MembraneSynth {
  return rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.06,
      octaves: 3.2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.9, releaseCurve: EXP },
      volume,
    }),
  );
}

export function tom(rt: Runtime, volume = -10): MembraneSynth {
  return rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.03,
      octaves: 2.2,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.45, releaseCurve: EXP },
      volume,
    }),
  );
}

/** 짧은 노이즈 타격(손바닥/스네어/쉐이커). filter로 음색 결정 */
export function noiseHit(
  rt: Runtime,
  o: { type?: 'white' | 'pink' | 'brown'; decay?: number; volume?: number; filter: 'bandpass' | 'highpass' | 'lowpass'; freq: number; q?: number },
): { synth: NoiseSynth; filter: Filter } {
  const synth = rt.bag.add(
    new NoiseSynth({
      noise: { type: o.type ?? 'white' },
      envelope: { attack: 0.001, decay: 0, sustain: 1, release: o.decay ?? 0.12, releaseCurve: EXP },
      volume: o.volume ?? -14,
    }),
  );
  const filter = rt.bag.add(new Filter({ type: o.filter, frequency: o.freq, Q: o.q ?? 1, rolloff: -12 }));
  synth.connect(filter);
  return { synth, filter };
}

/** 쇠사슬/모루/종 같은 금속 타격 */
export function metal(rt: Runtime, o: { decay?: number; volume?: number; harmonicity?: number; index?: number; resonance?: number } = {}): MetalSynth {
  const m = rt.bag.add(
    new MetalSynth({
      harmonicity: o.harmonicity ?? 5.1,
      modulationIndex: o.index ?? 24,
      resonance: o.resonance ?? 2200,
      octaves: 1.2,
      envelope: { attack: 0.001, decay: o.decay ?? 0.4, release: 0.2 },
      volume: o.volume ?? -22,
    }),
  );
  return m;
}

/** 저역 오스티나토용 모노 신스 */
export function bassSynth(rt: Runtime, o: { volume?: number; type?: 'sawtooth' | 'square' | 'fatsawtooth'; cutoff?: number; env?: number } = {}): MonoSynth {
  return rt.bag.add(
    new MonoSynth({
      oscillator: o.type === 'fatsawtooth' ? { type: 'fatsawtooth', count: 2, spread: 12 } : { type: o.type ?? 'sawtooth' },
      filter: { type: 'lowpass', Q: 2.5, rolloff: -24 },
      filterEnvelope: {
        attack: 0.004,
        decay: 0.18,
        sustain: 0.12,
        release: 0.2,
        baseFrequency: o.cutoff ?? 90,
        octaves: o.env ?? 3,
      },
      envelope: { attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.12 },
      volume: o.volume ?? -10,
    }),
  );
}

/** 금관 같은 저음 스탭/스웰 (필터는 호출자가 자동화) */
export function brass(rt: Runtime, o: { volume?: number; attack?: number; release?: number; poly?: number } = {}): PolySynth<Synth> {
  const s = rt.bag.add(
    new PolySynth(Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
      envelope: { attack: o.attack ?? 0.08, decay: 0, sustain: 1, release: o.release ?? 0.9, releaseCurve: SOFT },
      volume: o.volume ?? -14,
    }),
  );
  s.maxPolyphony = o.poly ?? 8;
  return s;
}

/** 신호 → 필터 → (반환) — 체인 편의 */
export function lowpass(rt: Runtime, src: ToneAudioNode, freq: number, q = 0.8, rolloff: -12 | -24 = -24): Filter {
  const f = rt.bag.add(new Filter({ type: 'lowpass', frequency: freq, Q: q, rolloff }));
  src.connect(f);
  return f;
}
