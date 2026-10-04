/**
 * 가벼운 네이티브 보이스 툴킷.
 *
 * Tone.js의 Synth/Filter/LFO는 주파수·디튠이 Signal(ConstantSource)로 연결돼 있어
 * 매 샘플 계산(디튠 pow, 필터 계수)이 일어나고, 아이폰에서 무겁다(측정: Tone 오실레이터 ≈ 네이티브의 8배).
 * 그래서 Tone은 컨텍스트·스케줄링(Clock)·버스(Gain/BiquadFilter/Panner)·리버브에 쓰고,
 * 실제 발음은 Tone 컨텍스트가 만든 네이티브 노드 + AudioParam 오토메이션으로 한다.
 *
 * 노드 수명: 오실레이터/버퍼 소스는 원래 1회용이라 노트마다 만들고, 끝나면(onended) 연결을 끊어 GC된다.
 * 동시에 살아있는 노트 수는 NoteCap(최대 동시발음)으로 제한한다.
 */
import { Gain, type BaseContext } from 'tone';

export type Ctx = BaseContext;
export type NoiseColor = 'white' | 'pink' | 'brown';
export type BasicWave = 'sine' | 'square' | 'sawtooth' | 'triangle';
/** 기본 파형 또는 배음 진폭 목록 */
export type Wave = BasicWave | readonly number[];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------------------
// Curves
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

/** 0 → 1 가속 상승 (역재생 같은 스웰) */
export const RISE: readonly number[] = expCurve(32, 4.5).reverse();

// ---------------------------------------------------------------------------
// Shared buffers / waves (컨텍스트별 캐시)
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<object, Partial<Record<NoiseColor, AudioBuffer>>>();

export function noiseBuffer(ctx: Ctx, color: NoiseColor): AudioBuffer {
  let c = noiseCache.get(ctx);
  if (!c) {
    c = {};
    noiseCache.set(ctx, c);
  }
  const hit = c[color];
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.5);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'pink') {
      // Paul Kellet (economy)
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
  }
  // RMS 정규화 (색과 무관하게 비슷한 크기)
  let sum = 0;
  for (let i = 0; i < len; i++) sum += d[i] * d[i];
  const k = 0.3 / Math.sqrt(sum / len || 1);
  for (let i = 0; i < len; i++) d[i] *= k;
  c[color] = buf;
  return buf;
}

const waveCache = new WeakMap<object, Map<string, PeriodicWave>>();

export function partialsWave(ctx: Ctx, partials: readonly number[]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) {
    m = new Map();
    waveCache.set(ctx, m);
  }
  const key = partials.join(',');
  let w = m.get(key);
  if (!w) {
    const real = new Float32Array(partials.length + 1);
    const imag = new Float32Array(partials.length + 1);
    partials.forEach((a, i) => (imag[i + 1] = a));
    w = ctx.createPeriodicWave(real, imag);
    m.set(key, w);
  }
  return w;
}

export function makeOsc(ctx: Ctx, wave: Wave, f: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  if (typeof wave === 'string') o.type = wave;
  else o.setPeriodicWave(partialsWave(ctx, wave));
  o.frequency.value = f;
  o.detune.value = detune;
  return o;
}

export function noiseSource(ctx: Ctx, color: NoiseColor): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, color);
  s.loop = true;
  return s;
}

/** 루프 노이즈 시작 (버퍼 안의 임의 위치에서) */
export function startNoise(s: AudioBufferSourceNode, t: number): void {
  s.start(t, Math.random() * 2);
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface Env {
  /** 어택(초) */
  a?: number;
  /** 서스테인까지 감쇠 시간(초) */
  d?: number;
  /** 서스테인 레벨 0..1 (기본 1) */
  s?: number;
  /** 릴리즈(초, -60dB 도달) */
  r: number;
  /** 가속 상승 어택 */
  rise?: boolean;
}

/** p에 엔벨로프를 예약한다. dur = 릴리즈 시작까지의 길이. 반환값 = 소리가 끝나는 시각 */
export function applyEnv(p: AudioParam, t: number, peak: number, e: Env, dur: number): number {
  const a = Math.max(0.002, e.a ?? 0.003);
  const pk = Math.max(0, peak);
  p.setValueAtTime(0, t);
  let atkEnd = t + a;
  if (e.rise) {
    const curve = new Float32Array(RISE.length);
    for (let i = 0; i < RISE.length; i++) curve[i] = RISE[i] * pk;
    p.setValueCurveAtTime(curve, t, a);
    atkEnd += 0.002;
  } else {
    p.linearRampToValueAtTime(pk, atkEnd);
  }
  const s = e.s ?? 1;
  if (e.d && s < 1) p.setTargetAtTime(pk * s, atkEnd, Math.max(0.001, e.d / 3));
  const rel = Math.max(atkEnd, t + dur);
  p.setTargetAtTime(0, rel, Math.max(0.001, e.r / 6.9));
  return rel + e.r;
}

// ---------------------------------------------------------------------------
// Note bookkeeping
// ---------------------------------------------------------------------------

export interface LiveNote {
  end: number;
  kill(t: number): void;
}

/** 동시발음 제한: 넘치면 가장 오래된 노트를 빠르게 줄인다 */
export class NoteCap {
  private live: LiveNote[] = [];
  constructor(
    private readonly ctx: Ctx,
    private readonly max: number,
  ) {}
  add(n: LiveNote, t: number): void {
    const now = this.ctx.currentTime;
    this.live = this.live.filter((x) => x.end > now);
    while (this.live.length >= this.max) this.live.shift()?.kill(t);
    this.live.push(n);
  }
  releaseAll(t: number): void {
    for (const n of this.live) n.kill(t);
    this.live = [];
  }
}

function safeStop(s: AudioScheduledSourceNode, t: number): void {
  try {
    s.stop(t);
  } catch {
    /* 이미 정지 예약됨 (구형 사파리) */
  }
}

/** 연결 해제 (이미 끊긴 연결이면 InvalidAccessError — 무시) */
export function unlink(src: AudioNode, dest?: AudioNode | AudioParam): void {
  try {
    if (!dest) src.disconnect();
    else if (typeof AudioParam !== 'undefined' && dest instanceof AudioParam) src.disconnect(dest);
    else src.disconnect(dest as AudioNode);
  } catch {
    /* 무드가 먼저 정리돼 이미 끊김 */
  }
}

/** 소스가 끝나면 관련 노드 연결을 끊어 GC되게 한다 */
export function cleanup(srcs: readonly AudioScheduledSourceNode[], nodes: readonly AudioNode[], extra?: () => void): void {
  if (!srcs.length) return;
  srcs[0].onended = () => {
    for (const n of srcs) unlink(n);
    for (const n of nodes) unlink(n);
    try {
      extra?.();
    } catch {
      /* 이미 정리됨 */
    }
  };
}

export function killNote(g: GainNode, srcs: readonly AudioScheduledSourceNode[], t: number): void {
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.012);
  } catch {
    /* 무시 */
  }
  for (const s of srcs) safeStop(s, t + 0.09);
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** 화음/선율을 연주할 수 있는 악기 */
export interface Playable {
  triggerAttackRelease(notes: number | readonly number[], duration: number, time: number, velocity?: number): void;
  releaseAll(time: number): void;
}

abstract class Instrument implements Playable {
  readonly output: Gain;
  protected readonly cap: NoteCap;
  constructor(
    protected readonly ctx: Ctx,
    max: number,
  ) {
    this.output = new Gain({ context: ctx, gain: 1 });
    this.cap = new NoteCap(ctx, max);
  }
  get input(): AudioNode {
    return this.output.input;
  }
  abstract play(f: number, dur: number, t: number, vel?: number): void;
  triggerAttackRelease(notes: number | readonly number[], duration: number, time: number, velocity = 1): void {
    if (typeof notes === 'number') this.play(notes, duration, time, velocity);
    else for (const f of notes) this.play(f, duration, time, velocity);
  }
  releaseAll(t: number): void {
    this.cap.releaseAll(t);
  }
  dispose(): void {
    this.cap.releaseAll(this.ctx.currentTime);
    this.output.dispose();
  }
}

export interface OscOpts {
  wave: Wave;
  /** 겹칠 오실레이터 디튠(cents) — 여러 개면 코러스처럼 두꺼워진다 */
  detunes?: readonly number[];
  env: Env;
  /** 노트 최대 진폭 */
  level?: number;
  max?: number;
  /** 공유 LFO 비브라토 */
  vibrato?: { rate: number; cents: number };
}

/** 감산/가산 합성 보이스: 노트마다 디튠된 오실레이터들 → 엔벨로프 게인 */
export class OscSynth extends Instrument {
  env: Env;
  private readonly lfo?: OscillatorNode;
  constructor(
    ctx: Ctx,
    private readonly o: OscOpts,
  ) {
    super(ctx, o.max ?? 8);
    this.env = { ...o.env };
    if (o.vibrato) {
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = o.vibrato.rate;
      this.lfo.start();
    }
  }
  /** 노트 하나. 반환된 오실레이터로 피치 오토메이션(글라이드)을 걸 수 있다 */
  play(f: number, dur: number, t: number, vel = 1): OscillatorNode[] {
    const ctx = this.ctx;
    const det = this.o.detunes ?? [0];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.input);
    const end = applyEnv(g.gain, t, (clamp01(vel) * (this.o.level ?? 0.3)) / Math.sqrt(det.length), this.env, dur);
    const nodes: AudioNode[] = [g];
    let vg: GainNode | undefined;
    if (this.lfo && this.o.vibrato) {
      vg = ctx.createGain();
      vg.gain.value = f * (Math.pow(2, this.o.vibrato.cents / 1200) - 1);
      this.lfo.connect(vg);
      nodes.push(vg);
    }
    const srcs = det.map((d) => {
      const osc = makeOsc(ctx, this.o.wave, f, d);
      if (vg) vg.connect(osc.frequency);
      osc.connect(g);
      osc.start(t);
      osc.stop(end);
      return osc;
    });
    const lfo = this.lfo;
    cleanup(srcs, nodes, vg && lfo ? () => unlink(lfo, vg) : undefined);
    this.cap.add({ end, kill: (tk) => killNote(g, srcs, tk) }, t);
    return srcs;
  }
  override dispose(): void {
    super.dispose();
    if (this.lfo) {
      safeStop(this.lfo, 0);
      this.lfo.disconnect();
    }
  }
}

export interface FmOpts {
  /** 변조 주파수 비 */
  ratio: number;
  /** 변조 지수 (Tone.FMSynth의 modulationIndex와 비슷한 감각) */
  index: number;
  env: Env;
  /** 변조 엔벨로프 (기본: 같은 어택, 릴리즈 35%) */
  modEnv?: Env;
  level?: number;
  max?: number;
  modWave?: BasicWave;
}

/** 2-오퍼레이터 FM: 종, 첼레스타, 오르골, 전자피아노 */
export class FmSynth extends Instrument {
  env: Env;
  constructor(
    ctx: Ctx,
    private readonly o: FmOpts,
  ) {
    super(ctx, o.max ?? 6);
    this.env = { ...o.env };
  }
  play(f: number, dur: number, t: number, vel = 1): OscillatorNode {
    const ctx = this.ctx;
    const v = clamp01(vel);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.input);
    const end = applyEnv(g.gain, t, v * (this.o.level ?? 0.3), this.env, dur);
    const car = makeOsc(ctx, 'sine', f);
    const mod = makeOsc(ctx, this.o.modWave ?? 'sine', f * this.o.ratio);
    const mg = ctx.createGain();
    mg.gain.value = 0;
    const me = this.o.modEnv ?? { a: this.env.a, r: this.env.r * 0.35 };
    applyEnv(mg.gain, t, f * this.o.index * 0.32 * (0.4 + 0.6 * v), me, dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(g);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    cleanup([car, mod], [g, mg]);
    this.cap.add({ end, kill: (tk) => killNote(g, [car, mod], tk) }, t);
    return car;
  }
}

export interface DrumOpts {
  wave?: BasicWave;
  /** 시작 주파수 = f × octaves (Tone.MembraneSynth와 같은 의미) */
  octaves: number;
  pitchDecay: number;
  env: Env;
  level?: number;
  max?: number;
}

/** 막 타악기 (타이코/톰/심장박동/서브 붐) */
export class DrumSynth extends Instrument {
  constructor(
    ctx: Ctx,
    private readonly o: DrumOpts,
  ) {
    super(ctx, o.max ?? 4);
  }
  play(f: number, _dur: number, t: number, vel = 1): void {
    this.hit(f, t, vel);
  }
  hit(f: number, t: number, vel = 1, over?: { octaves?: number; pitchDecay?: number; r?: number }): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.input);
    const env: Env = over?.r ? { ...this.o.env, r: over.r } : this.o.env;
    const end = applyEnv(g.gain, t, clamp01(vel) * (this.o.level ?? 0.8), env, 0);
    const osc = makeOsc(ctx, this.o.wave ?? 'sine', f);
    osc.frequency.setValueAtTime(f * (over?.octaves ?? this.o.octaves), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + (over?.pitchDecay ?? this.o.pitchDecay));
    osc.connect(g);
    osc.start(t);
    osc.stop(end);
    cleanup([osc], [g]);
    this.cap.add({ end, kill: (tk) => killNote(g, [osc], tk) }, t);
  }
}

export interface NoiseOpts {
  color: NoiseColor;
  env: Env;
  level?: number;
  max?: number;
}

/** 노이즈 타격 (손바닥/쉐이커/심벌/바람 숨/탁탁) — 필터는 output 뒤에 */
export class NoiseSynth extends Instrument {
  env: Env;
  constructor(
    ctx: Ctx,
    private readonly o: NoiseOpts,
  ) {
    super(ctx, o.max ?? 6);
    this.env = { ...o.env };
  }
  play(_f: number, dur: number, t: number, vel = 1): void {
    this.hit(t, dur, vel);
  }
  hit(t: number, dur: number, vel = 1, env?: Env, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.input);
    const end = applyEnv(g.gain, t, clamp01(vel) * (this.o.level ?? 0.8), env ?? this.env, dur);
    const src = noiseSource(ctx, this.o.color);
    src.playbackRate.value = rate;
    src.connect(g);
    startNoise(src, t);
    src.stop(end);
    cleanup([src], [g]);
    this.cap.add({ end, kill: (tk) => killNote(g, [src], tk) }, t);
    return src;
  }
}

/** 지속음 오실레이터 묶음 (드론) */
export class Sustain {
  readonly output: Gain;
  private oscs: OscillatorNode[] = [];
  constructor(
    private readonly ctx: Ctx,
    private readonly wave: Wave,
    private freqs: number[],
    private readonly detunes: readonly number[],
    private readonly level: number,
  ) {
    this.output = new Gain({ context: ctx, gain: 0 });
  }
  start(t: number, fade = 3): void {
    const n = this.freqs.length * this.detunes.length;
    const g = this.ctx.createGain();
    g.gain.value = 1 / Math.sqrt(n);
    g.connect(this.output.input);
    for (const f of this.freqs) {
      for (const d of this.detunes) {
        const o = makeOsc(this.ctx, this.wave, f, d);
        o.connect(g);
        o.start(t);
        this.oscs.push(o);
      }
    }
    cleanup(this.oscs, [g]);
    this.output.gain.setValueAtTime(0, t);
    this.output.gain.linearRampToValueAtTime(this.level, t + fade);
  }
  /** 음 바꾸기 (글라이드). 유한한 램프만 써서 파라미터가 계속 샘플 단위 계산되지 않게 한다 */
  glide(freqs: number[], t: number, sec: number): void {
    const per = this.detunes.length;
    freqs.forEach((f, i) => {
      for (let k = 0; k < per; k++) {
        const o = this.oscs[i * per + k];
        if (!o) continue;
        const p = o.frequency;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.exponentialRampToValueAtTime(f, t + Math.max(0.05, sec));
      }
    });
    this.freqs = freqs;
  }
  /** from 음으로 즉시 돌아간 뒤 to 음까지 램프 (가라앉는 드론) */
  ramp(from: readonly number[], to: readonly number[], t: number, sec: number): void {
    const per = this.detunes.length;
    from.forEach((f, i) => {
      for (let k = 0; k < per; k++) {
        const o = this.oscs[i * per + k];
        if (!o) continue;
        const p = o.frequency;
        p.cancelScheduledValues(t);
        p.setValueAtTime(f, t);
        p.exponentialRampToValueAtTime(to[i] ?? f, t + Math.max(0.05, sec));
      }
    });
  }
  /** 디튠 폭 배율 (정신력에 따라 탁해짐) */
  spread(scale: number, t: number): void {
    const per = this.detunes.length;
    this.oscs.forEach((o, i) => {
      const p = o.detune;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(this.detunes[i % per] * scale, t + 2);
    });
  }
  stop(t: number): void {
    for (const o of this.oscs) safeStop(o, t + 0.05);
  }
  dispose(): void {
    for (const o of this.oscs) {
      safeStop(o, 0);
      o.disconnect();
    }
    this.oscs = [];
    this.output.dispose();
  }
}

/** 네이티브 LFO: 사인 오실레이터 → 깊이 게인 → 대상 AudioParam (Tone.LFO보다 훨씬 가볍다) */
export class NativeLfo {
  readonly osc: OscillatorNode;
  readonly depth: GainNode;
  constructor(ctx: Ctx, rate: number, depth: number, target: AudioParam, wave: BasicWave = 'sine') {
    this.osc = ctx.createOscillator();
    this.osc.type = wave;
    this.osc.frequency.value = rate;
    this.depth = ctx.createGain();
    this.depth.gain.value = depth;
    this.osc.connect(this.depth);
    this.depth.connect(target);
  }
  start(t: number): this {
    this.osc.start(t);
    return this;
  }
  dispose(): void {
    safeStop(this.osc, 0);
    this.osc.disconnect();
    this.depth.disconnect();
  }
}
