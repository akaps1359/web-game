import { BiquadFilter, Gain, Panner, type BaseContext, type InputNode } from 'tone';
import { chance, clamp, pick, rand } from './scales';
import { cleanup, noiseSource, startNoise } from './synth';

/** 속삭임용 모음 포먼트 (F1, F2, F3) */
const VOWELS: readonly (readonly [number, number, number])[] = [
  [700, 1220, 2600],
  [450, 850, 2500],
  [330, 900, 2300],
  [430, 1900, 2550],
  [300, 2200, 2900],
  [560, 1450, 2450],
];
const Q = [5, 7, 8] as const;
const LEVEL = [1, 0.6, 0.3] as const;

/**
 * 밴드패스 포먼트 뱅크를 통과한 노이즈로 음절 단위 속삭임을 만든다.
 * 필터/게인/팬은 한 번만 만들어 재사용하고, 발화마다 1회용 노이즈 소스만 만든다.
 */
export class WhisperVoice {
  private readonly formants: BiquadFilter[];
  private readonly hiss: BiquadFilter;
  private readonly vowelEnv: Gain;
  private readonly hissEnv: Gain;
  private readonly pan: Panner;
  private readonly send: Gain;
  private readonly nodes: { dispose(): unknown }[] = [];
  private busyUntil = 0;

  constructor(
    private readonly ctx: BaseContext,
    dry: InputNode,
    verb: InputNode,
  ) {
    const keep = <T extends { dispose(): unknown }>(x: T): T => {
      this.nodes.push(x);
      return x;
    };
    const context = ctx;
    this.vowelEnv = keep(new Gain({ context, gain: 0 }));
    this.hissEnv = keep(new Gain({ context, gain: 0 }));
    const makeup = keep(new Gain({ context, gain: 7 }));
    this.formants = VOWELS[0].map((f, i) => {
      const flt = keep(new BiquadFilter({ context, type: 'bandpass', frequency: f, Q: Q[i] }));
      const g = keep(new Gain({ context, gain: LEVEL[i] }));
      flt.chain(g, this.vowelEnv);
      return flt;
    });
    this.hiss = keep(new BiquadFilter({ context, type: 'highpass', frequency: 4200, Q: 0.7 }));
    this.hiss.connect(this.hissEnv);
    this.pan = keep(new Panner({ context, pan: 0 }));
    this.vowelEnv.chain(makeup, this.pan);
    this.hissEnv.connect(this.pan);
    this.send = keep(new Gain({ context, gain: 0.4 }));
    this.pan.connect(dry);
    this.pan.chain(this.send, verb);
  }

  /** 이 시각 이후로 비어 있음 */
  get free(): number {
    return this.busyUntil;
  }

  /** t부터 약 dur초 동안 속삭인다. 이미 말하는 중이면 false */
  speak(t: number, dur: number, level: number, panPos: number, reverb = 0.4): boolean {
    if (t < this.busyUntil) return false;
    const start = t;
    const src = noiseSource(this.ctx, 'white');
    for (const f of this.formants) src.connect(f.input);
    src.connect(this.hiss.input);
    startNoise(src, start);
    this.pan.pan.cancelScheduledValues(start);
    this.pan.pan.setValueAtTime(clamp(panPos, -1, 1), start);
    this.pan.pan.linearRampToValueAtTime(clamp(panPos + rand(-0.4, 0.4), -1, 1), start + dur);
    this.send.gain.setValueAtTime(reverb, start);
    const speaker = rand(0.85, 1.2);
    const v = this.vowelEnv.gain;
    const h = this.hissEnv.gain;
    v.cancelScheduledValues(start);
    h.cancelScheduledValues(start);
    v.setValueAtTime(0, start);
    h.setValueAtTime(0, start);
    const nyq = this.ctx.sampleRate * 0.45;
    for (const f of this.formants) f.frequency.cancelScheduledValues(start);
    let ts = start;
    const end = start + dur;
    while (ts < end) {
      const syl = rand(0.09, 0.22);
      const vowel = pick(VOWELS);
      this.formants.forEach((f, i) => f.frequency.linearRampToValueAtTime(Math.min(nyq, vowel[i] * speaker * rand(0.95, 1.05)), ts + syl * 0.4));
      const amp = level * rand(0.35, 1);
      if (chance(0.35)) {
        // 's', 'sh' 같은 자음
        const hl = rand(0.04, 0.09);
        h.setValueAtTime(0, ts);
        h.linearRampToValueAtTime(amp * 0.45, ts + 0.015);
        h.linearRampToValueAtTime(0, ts + hl);
      }
      v.linearRampToValueAtTime(amp, ts + syl * 0.3);
      v.linearRampToValueAtTime(amp * 0.12, ts + syl * 0.95);
      ts += syl + (chance(0.2) ? rand(0.05, 0.16) : 0);
    }
    v.linearRampToValueAtTime(0, ts + 0.08);
    src.stop(ts + 0.15);
    cleanup([src], []);
    this.busyUntil = ts + 0.3;
    return true;
  }

  dispose(): void {
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
