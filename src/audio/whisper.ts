import { Filter, Gain, Noise, Panner, type InputNode } from 'tone';
import { chance, clamp, pick, rand } from './scales';

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
 * 노드는 생성 시 한 번만 만들고 재사용한다(노이즈 소스만 발화마다 start/stop).
 */
export class WhisperVoice {
  private readonly noise: Noise;
  private readonly formants: Filter[];
  private readonly vowelEnv: Gain;
  private readonly hissEnv: Gain;
  private readonly pan: Panner;
  private readonly send: Gain;
  private readonly nodes: { dispose(): unknown }[] = [];
  private busyUntil = 0;
  private lastStart = 0;

  constructor(dry: InputNode, verb: InputNode) {
    const keep = <T extends { dispose(): unknown }>(x: T): T => {
      this.nodes.push(x);
      return x;
    };
    this.noise = keep(new Noise({ type: 'white', volume: -2 }));
    this.vowelEnv = keep(new Gain(0));
    this.hissEnv = keep(new Gain(0));
    const makeup = keep(new Gain(4));
    this.formants = VOWELS[0].map((f, i) => {
      const flt = keep(new Filter({ type: 'bandpass', frequency: f, Q: Q[i], rolloff: -12 }));
      const g = keep(new Gain(LEVEL[i]));
      this.noise.connect(flt);
      flt.chain(g, this.vowelEnv);
      return flt;
    });
    const hiss = keep(new Filter({ type: 'highpass', frequency: 4200, rolloff: -12 }));
    this.noise.chain(hiss, this.hissEnv);
    this.pan = keep(new Panner(0));
    this.vowelEnv.chain(makeup, this.pan);
    this.hissEnv.connect(this.pan);
    this.send = keep(new Gain(0.4));
    this.pan.connect(dry);
    this.pan.chain(this.send, verb);
  }

  get free(): number {
    return this.busyUntil;
  }

  /** t부터 약 dur초 동안 속삭인다. 이미 말하는 중이면 false */
  speak(t: number, dur: number, level: number, panPos: number, reverb = 0.4): boolean {
    if (t < this.busyUntil) return false;
    const start = Math.max(t, this.lastStart + 0.01);
    this.lastStart = start;
    this.noise.start(start);
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
    for (const f of this.formants) f.frequency.cancelScheduledValues(start);
    let ts = start;
    const end = start + dur;
    while (ts < end) {
      const syl = rand(0.09, 0.22);
      const vowel = pick(VOWELS);
      this.formants.forEach((f, i) => f.frequency.linearRampToValueAtTime(vowel[i] * speaker * rand(0.95, 1.05), ts + syl * 0.4));
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
    this.noise.stop(ts + 0.15);
    this.busyUntil = ts + 0.3;
    return true;
  }

  dispose(): void {
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
