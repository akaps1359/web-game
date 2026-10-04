import {
  Clock,
  Filter,
  Gain,
  MembraneSynth,
  NoiseSynth,
  PolySynth,
  Synth,
  Vibrato,
  WaveShaper,
  type InputNode,
} from 'tone';
import { EXP, RISE } from './moods/instruments';
import { randPan } from './moods/runtime';
import { below, chance, degreeToMidi, expWait, lerp, mtof, palette, pick, rand } from './scales';
import { WhisperVoice } from './whisper';

/**
 * 음악 버스 전체에 걸리는 정신력 효과.
 *
 *   input → wow(Vibrato: 테이프가 늘어지는 피치 흔들림) → muffle(로우패스) → output
 *                                                   ↘ 비트크러시(WaveShaper 계단) → output
 *   + 속삭임 / 역재생 스웰 / 심장박동 (정신력이 낮을 때 확률적으로)
 *
 *   ≥60  : 효과 없음
 *   60→30: 느린 피치 흔들림이 점점 커짐
 *   <30  : 소리가 먹먹해지고, 거친 디지털 잡음, 속삭임, 역재생 스웰
 *   <20  : (리듬 없는 곡에서) 희미한 심장박동, 정신력이 낮을수록 빨라짐
 */
export class SanityFx {
  readonly input: Gain;
  private readonly output: Gain;
  private readonly wow: Vibrato;
  private readonly muffle: Filter;
  private readonly crushGain: Gain;
  private readonly whispers: WhisperVoice[];
  private readonly swell: PolySynth<Synth>;
  private readonly air: NoiseSynth;
  private readonly airBp: Filter;
  private readonly heart: MembraneSynth;
  private readonly clock: Clock;
  private readonly nodes: { dispose(): unknown }[] = [];

  private sanity = 100;
  private act = 1;
  private rhythmic = false;
  private active = false;
  private nextWhisper = Infinity;
  private nextSwell = Infinity;
  private nextBeat = 0;
  private lastHeart = 0;

  constructor(out: InputNode, verb: InputNode) {
    const keep = <T extends { dispose(): unknown }>(x: T): T => {
      this.nodes.push(x);
      return x;
    };
    this.input = keep(new Gain(1));
    this.output = keep(new Gain(1));
    this.output.connect(out);

    // 1) 피치 흔들림: 지연시간 변조. 최대 편차 ≈ π·maxDelay·depth·rate
    this.wow = keep(new Vibrato({ frequency: 0.12, depth: 0, maxDelay: 0.018, wet: 1 }));
    // 2) 먹먹함
    this.muffle = keep(new Filter({ type: 'lowpass', frequency: 18000, Q: 0.5, rolloff: -12 }));
    this.input.chain(this.wow, this.muffle, this.output);

    // 3) 병렬 비트크러시: 소프트클립 후 계단 양자화
    const pre = keep(new Gain(2.5));
    const crusher = keep(
      new WaveShaper((x) => {
        const y = Math.tanh(x * 2);
        return Math.round(y * 6) / 6;
      }, 2048),
    );
    const hp = keep(new Filter({ type: 'highpass', frequency: 260, rolloff: -12 }));
    const lp = keep(new Filter({ type: 'lowpass', frequency: 5200, rolloff: -12 }));
    this.crushGain = keep(new Gain(0));
    this.muffle.chain(pre, crusher, hp, lp, this.crushGain, this.output);

    // 4) 속삭임 (2성부)
    this.whispers = [0, 1].map(() => keep(new WhisperVoice(this.output, verb)));

    // 5) 역재생 같은 스웰
    this.swell = keep(
      new PolySynth(Synth, {
        oscillator: { type: 'fattriangle', count: 2, spread: 30 },
        envelope: { attack: 2, attackCurve: RISE, decay: 0, sustain: 1, release: 0.05 },
        volume: -17,
      }),
    );
    this.swell.maxPolyphony = 6;
    this.air = keep(
      new NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 2, attackCurve: RISE, decay: 0, sustain: 1, release: 0.04 },
        volume: -22,
      }),
    );
    this.airBp = keep(new Filter({ type: 'bandpass', frequency: 800, Q: 1, rolloff: -12 }));
    const swellSend = keep(new Gain(0.15));
    this.swell.connect(this.output);
    this.swell.chain(swellSend, verb);
    this.air.chain(this.airBp, this.output);

    // 6) 심장박동
    this.heart = keep(
      new MembraneSynth({
        pitchDecay: 0.05,
        octaves: 1.8,
        envelope: { attack: 0.004, decay: 0, sustain: 1, release: 0.35, releaseCurve: EXP },
        volume: -14,
      }),
    );
    const hlp = keep(new Filter({ type: 'lowpass', frequency: 140, rolloff: -24 }));
    this.heart.chain(hlp, this.output);

    this.clock = keep(new Clock((t) => this.tick(t), 4));
    this.clock.start();
  }

  /** 현재 곡 정보: 스웰 음높이(막), 심장박동 억제(리듬곡), 생성 이벤트 허용 여부 */
  setContext(act: number, rhythmic: boolean, active: boolean): void {
    this.act = act;
    this.rhythmic = rhythmic;
    this.active = active;
  }

  setSanity(s: number, t: number): void {
    this.sanity = s;
    const w = below(s, 60);
    const d = below(s, 30);
    this.wow.depth.rampTo(Math.pow(w, 1.2), 3, t);
    this.wow.frequency.rampTo(0.12 + w * 0.3, 3, t);
    this.muffle.frequency.rampTo(18000 * Math.pow(2600 / 18000, d), 2.5, t);
    this.crushGain.gain.rampTo(d * 0.2, 2.5, t);
    if (d <= 0) {
      this.nextWhisper = Infinity;
      this.nextSwell = Infinity;
    }
  }

  private tick(t: number): void {
    if (!this.active) return;
    const d = below(this.sanity, 30);
    if (d > 0) {
      if (this.nextWhisper === Infinity) this.nextWhisper = t + rand(1, 5);
      if (this.nextSwell === Infinity) this.nextSwell = t + rand(4, 12);
      if (t >= this.nextWhisper) {
        const voice = this.whispers.find((v) => v.free <= t);
        const dur = rand(0.7, 1.8);
        if (voice) voice.speak(t + rand(0, 0.2), dur, 0.18 + d * 0.32, randPan(0.95), 0.35 + d * 0.3);
        // 아주 낮으면 두 목소리가 겹쳐 속삭인다
        if (d > 0.6 && chance(d - 0.4)) {
          const other = this.whispers.find((v) => v !== voice && v.free <= t);
          other?.speak(t + rand(0.2, 0.6), dur * rand(0.6, 1), 0.12 + d * 0.25, randPan(0.95), 0.5);
        }
        this.nextWhisper = t + dur + expWait(lerp(16, 3.5, d));
      }
      if (t >= this.nextSwell) {
        this.playSwell(t, d);
        this.nextSwell = t + expWait(lerp(30, 9, d)) + 3;
      }
    }
    const hb = below(this.sanity, 20);
    if (hb > 0 && !this.rhythmic) {
      if (this.nextBeat < t) this.nextBeat = t + 0.05;
      while (this.nextBeat < t + 0.25) {
        const at = Math.max(this.nextBeat, this.lastHeart + 0.01);
        const v = 0.35 + hb * 0.5;
        this.heart.triggerAttackRelease(mtof(28), 0.02, at, v);
        this.heart.triggerAttackRelease(mtof(27.6), 0.02, at + 0.27, v * 0.6);
        this.lastHeart = at + 0.27;
        this.nextBeat = at + 60 / lerp(64, 104, hb);
      }
    }
  }

  private playSwell(t: number, d: number): void {
    const pal = palette(this.act);
    const base = pal.root + 24;
    const deg = Math.floor(rand(0, pal.mode.length));
    const a = degreeToMidi(base, pal.mode, deg);
    const b = degreeToMidi(base, pal.mode, deg + pick([2, 4]));
    const notes = [a, b, a + pick([1, 6, 13])];
    const len = rand(1.4, 2.8);
    this.swell.set({ envelope: { attack: len } });
    this.air.envelope.attack = len;
    this.swell.triggerAttackRelease(notes.map((m) => mtof(m + rand(-0.3, 0.3))), len, t, 0.35 + d * 0.35);
    this.airBp.frequency.cancelAndHoldAtTime(t);
    this.airBp.frequency.setValueAtTime(300, t);
    this.airBp.frequency.exponentialRampToValueAtTime(rand(2500, 6000), t + len);
    this.air.triggerAttackRelease(len, t, 0.3 + d * 0.4);
  }

  dispose(): void {
    this.clock.stop();
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
