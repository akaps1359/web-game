import { BiquadFilter, Clock, Gain, WaveShaper, dbToGain, type BaseContext, type InputNode } from 'tone';
import { randPan } from './moods/runtime';
import { below, chance, clamp, degreeToMidi, expWait, lerp, mtof, palette, pick, rand } from './scales';
import { DrumSynth, NativeLfo, NoiseSynth, OscSynth } from './synth';
import { WhisperVoice } from './whisper';

/**
 * 음악 버스 전체에 걸리는 정신력 효과.
 *
 *   input → wow(지연시간 변조: 테이프가 늘어지는 피치 흔들림) → muffle(로우패스) → output
 *                                                       ↘ 비트크러시(WaveShaper 계단) → output
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
  private readonly wow: NativeLfo;
  private readonly muffle: BiquadFilter;
  private readonly crushGain: Gain;
  private readonly whispers: WhisperVoice[];
  private readonly swell: OscSynth;
  private readonly air: NoiseSynth;
  private readonly airBp: BiquadFilter;
  private readonly heart: DrumSynth;
  private readonly clock: Clock;
  private readonly nodes: { dispose(): unknown }[] = [];
  private readonly nyq: number;

  private sanity = 100;
  private act = 1;
  private rhythmic = false;
  private active = false;
  private nextWhisper = Infinity;
  private nextSwell = Infinity;
  private nextBeat = 0;

  constructor(ctx: BaseContext, out: InputNode, verb: InputNode) {
    const keep = <T extends { dispose(): unknown }>(x: T): T => {
      this.nodes.push(x);
      return x;
    };
    const context = ctx;
    this.nyq = ctx.sampleRate * 0.45;
    this.input = keep(new Gain({ context, gain: 1 }));
    this.output = keep(new Gain({ context, gain: 1 }));
    this.output.connect(out);

    // 1) 피치 흔들림: 지연시간을 느린 사인으로 변조. 최대 편차 ≈ 2π·rate·depth
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    keep({ dispose: () => delay.disconnect() });
    this.wow = keep(new NativeLfo(ctx, 0.12, 0, delay.delayTime));
    this.wow.start(0);
    // 2) 먹먹함
    this.muffle = keep(new BiquadFilter({ context, type: 'lowpass', frequency: this.nyq, Q: 0.5 }));
    this.input.connect(delay);
    delay.connect(this.muffle.input);
    this.muffle.connect(this.output);

    // 3) 병렬 비트크러시: 소프트클립 후 계단 양자화
    const pre = keep(new Gain({ context, gain: 2.5 }));
    const crusher = keep(
      new WaveShaper({
        context,
        mapping: (x: number) => Math.round(Math.tanh(x * 2) * 6) / 6,
        length: 2048,
      }),
    );
    const hp = keep(new BiquadFilter({ context, type: 'highpass', frequency: 260, Q: 0.7 }));
    const lp = keep(new BiquadFilter({ context, type: 'lowpass', frequency: Math.min(5200, this.nyq), Q: 0.7 }));
    this.crushGain = keep(new Gain({ context, gain: 0 }));
    this.muffle.chain(pre, crusher, hp, lp, this.crushGain, this.output);

    // 4) 속삭임 (2성부)
    this.whispers = [0, 1].map(() => keep(new WhisperVoice(ctx, this.output, verb)));

    // 5) 역재생 같은 스웰
    this.swell = keep(
      new OscSynth(ctx, { wave: 'triangle', detunes: [-15, 15], env: { a: 2, rise: true, r: 0.05 }, level: dbToGain(-22), max: 6 }),
    );
    this.air = keep(new NoiseSynth(ctx, { color: 'pink', env: { a: 2, rise: true, r: 0.04 }, level: dbToGain(-25), max: 2 }));
    this.airBp = keep(new BiquadFilter({ context, type: 'bandpass', frequency: 800, Q: 1 }));
    const swellSend = keep(new Gain({ context, gain: 0.15 }));
    this.swell.output.connect(this.output);
    this.swell.output.chain(swellSend, verb);
    this.air.output.chain(this.airBp, this.output);

    // 6) 심장박동
    this.heart = keep(new DrumSynth(ctx, { wave: 'sine', octaves: 1.8, pitchDecay: 0.05, env: { a: 0.004, r: 0.35 }, level: dbToGain(-14) }));
    const hlp = keep(new BiquadFilter({ context, type: 'lowpass', frequency: 140, Q: 0.7 }));
    this.heart.output.chain(hlp, this.output);

    this.clock = keep(new Clock({ context, callback: (t: number) => this.tick(t), frequency: 4 }));
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
    const depth = 0.009 * Math.pow(w, 1.2);
    const rate = 0.12 + w * 0.3;
    this.wow.depth.gain.cancelScheduledValues(t);
    this.wow.depth.gain.setValueAtTime(this.wow.depth.gain.value, t);
    this.wow.depth.gain.linearRampToValueAtTime(depth, t + 3);
    this.wow.osc.frequency.cancelScheduledValues(t);
    this.wow.osc.frequency.setValueAtTime(this.wow.osc.frequency.value, t);
    this.wow.osc.frequency.linearRampToValueAtTime(rate, t + 3);
    this.muffle.frequency.rampTo(clamp(18000 * Math.pow(2600 / 18000, d), 100, this.nyq), 2.5, t);
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
        voice?.speak(t + rand(0, 0.2), dur, 0.18 + d * 0.32, randPan(0.95), 0.35 + d * 0.3);
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
        const at = this.nextBeat;
        const v = 0.35 + hb * 0.5;
        this.heart.hit(mtof(28), at, v);
        this.heart.hit(mtof(27.6), at + 0.27, v * 0.6);
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
    this.swell.env = { ...this.swell.env, a: len };
    this.swell.triggerAttackRelease(
      notes.map((m) => mtof(m + rand(-0.3, 0.3))),
      len,
      t,
      0.35 + d * 0.35,
    );
    const p = this.airBp.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(300, t);
    p.exponentialRampToValueAtTime(Math.min(this.nyq, rand(2500, 6000)), t + len);
    this.air.hit(t, len, 0.3 + d * 0.4, { a: len, rise: true, r: 0.04 });
  }

  dispose(): void {
    this.clock.stop();
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose();
    this.nodes.length = 0;
  }
}
