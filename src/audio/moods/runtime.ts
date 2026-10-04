import { Clock, Gain, ToneAudioNode, type BaseContext, type InputNode } from 'tone';
import { Harmony, below, mtof, palette, rand, type Palette } from '../scales';

/** 엔진이 무드에 넘겨주는 환경 */
export interface MoodEnv {
  act: number;
  /** 음악 버스(드라이) 입력 */
  dry: InputNode;
  /** 공용 리버브 센드 입력 */
  verb: InputNode;
  /** 공용 에코(핑퐁 딜레이) 센드 입력 */
  echo: InputNode;
  sanity: number;
  intensity: number;
}

/** 엔진이 다루는 재생 단위(생성 음악 또는 오디오 파일 트랙) */
export interface MoodInstance {
  /** 리듬이 강한 곡인가 (정신력 심장박동 레이어 억제용) */
  readonly rhythmic: boolean;
  readonly disposed: boolean;
  start(fadeIn: number): void;
  /** 페이드아웃 후 스스로 dispose */
  stop(fadeOut: number): void;
  setSanity(s: number): void;
  setIntensity(x: number): void;
  dispose(): void;
}

export type MoodFactory = (env: MoodEnv) => MoodInstance;

/** 무드를 구성하는 레이어. 모든 시간 인자는 AudioContext 시간(초) */
export interface Layer {
  start?(t: number): void;
  /** 그리드 한 칸마다 호출 (step = 무드 시작 후 누적 칸 번호) */
  step?(t: number, step: number): void;
  stop?(t: number): void;
  sanity?(s: number, t: number): void;
  intensity?(x: number, t: number): void;
}

export interface MoodSpec {
  bpm: number;
  /** 한 박의 칸 수 (기본 4 = 16분음표) */
  stepsPerBeat?: number;
  /** 한 마디의 박 수 (기본 4) */
  beatsPerBar?: number;
  /** 화음이 바뀌는 마디 간격 (기본 2) */
  chordBars?: number;
  prog?: readonly number[];
  rhythmic?: boolean;
  /** 강도 1일 때 템포 증가율 (0.1 = +10%) */
  tempoGain?: number;
  /** 수명(초) — 스팅어용. 지나면 스스로 정리 */
  lifetime?: number;
  /** 막 팔레트 변형 (예: 균열은 온음음계 + 강한 미분음) */
  palette?: (p: Palette) => Palette;
  /** 화음이 진행 대신 떠돈다 */
  wander?: boolean;
  /** 무드 전체 음량 보정(dB) — 오프라인 렌더 측정(K-가중 음량)으로 맞춘 값 */
  gain?: number;
  build(rt: Runtime): Layer[];
}

interface Disposable {
  dispose(): unknown;
}

/** 생성한 노드를 모아 한 번에 정리 */
export class Bag {
  private items: Disposable[] = [];
  add<T extends Disposable>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch {
        /* 이미 정리됨 */
      }
    }
    this.items = [];
  }
}

export interface Sends {
  dry?: number;
  verb?: number;
  echo?: number;
}

/** 무드 하나의 실행 상태. 레이어들은 이 객체를 통해 출력/화성/정신력 정보를 공유한다 */
export class Runtime implements MoodInstance {
  readonly bag = new Bag();
  readonly out: Gain;
  readonly verb: Gain;
  readonly echo: Gain;
  readonly pal: Palette;
  readonly harmony: Harmony;
  readonly rhythmic: boolean;
  readonly stepsPerBeat: number;
  readonly stepsPerBar: number;
  readonly chordBars: number;
  readonly baseBpm: number;
  bpm: number;
  sanity: number;
  intensity: number;
  /** 0..1 — 정신력 60 이하에서 증가 */
  wobble = 0;
  /** 0..1 — 정신력 35 이하에서 증가 */
  dissonance = 0;
  step = -1;
  disposed = false;
  private stopping = false;
  private layers: Layer[] = [];
  private readonly clock: Clock;
  private readonly spec: MoodSpec;

  constructor(env: MoodEnv, spec: MoodSpec) {
    this.spec = spec;
    const base = palette(env.act);
    this.pal = spec.palette ? spec.palette(base) : base;
    this.harmony = new Harmony(this.pal, spec.prog ?? this.pal.prog, spec.wander ?? this.pal.act === 3);
    this.rhythmic = spec.rhythmic ?? false;
    this.stepsPerBeat = spec.stepsPerBeat ?? 4;
    this.stepsPerBar = this.stepsPerBeat * (spec.beatsPerBar ?? 4);
    this.chordBars = spec.chordBars ?? 2;
    this.baseBpm = spec.bpm;
    this.sanity = env.sanity;
    this.intensity = env.intensity;
    this.bpm = this.targetBpm();
    this.updateSanityDerived();

    this.out = this.bag.add(new Gain(0));
    this.verb = this.bag.add(new Gain({ context: this.out.context, gain: 0 }));
    this.echo = this.bag.add(new Gain({ context: this.out.context, gain: 0 }));
    this.out.connect(env.dry);
    this.verb.connect(env.verb);
    this.echo.connect(env.echo);

    this.clock = this.bag.add(new Clock({ context: this.out.context, callback: (time) => this.tick(time), frequency: this.clockHz() }));
    this.layers = spec.build(this);
  }

  /** 이 무드의 오디오 컨텍스트 */
  get ctx(): BaseContext {
    return this.out.context;
  }

  // ---------------------------------------------------------------------
  // timing helpers
  // ---------------------------------------------------------------------
  get stepDur(): number {
    return 60 / this.bpm / this.stepsPerBeat;
  }
  get beatDur(): number {
    return 60 / this.bpm;
  }
  get barDur(): number {
    return this.stepDur * this.stepsPerBar;
  }
  inBar(step: number): number {
    return step % this.stepsPerBar;
  }
  bar(step: number): number {
    return Math.floor(step / this.stepsPerBar);
  }
  isBar(step: number, every = 1): boolean {
    return step % (this.stepsPerBar * every) === 0;
  }
  isBeat(step: number): boolean {
    return step % this.stepsPerBeat === 0;
  }
  /** 사람 연주 같은 미세 지연 */
  human(t: number, maxSec = 0.02): number {
    return t + Math.random() * maxSec;
  }

  // ---------------------------------------------------------------------
  // pitch helpers
  // ---------------------------------------------------------------------
  /** 막의 미분음 + 정신력 흔들림을 반영한 무작위 cents */
  detune(scale = 1): number {
    const spread = this.pal.micro * 0.5 + this.wobble * 22 + this.dissonance * 14;
    return (Math.random() * 2 - 1) * spread * scale;
  }
  /** MIDI → Hz (미분음/정신력 흔들림 포함) */
  hz(midi: number, detuneScale = 1): number {
    return mtof(midi + this.detune(detuneScale) / 100);
  }

  // ---------------------------------------------------------------------
  // routing
  // ---------------------------------------------------------------------
  /** node를 무드 출력/센드에 연결. 1이 아닌 레벨은 Gain 노드를 만든다 */
  route(node: ToneAudioNode | { output: ToneAudioNode }, sends: Sends): void {
    const src = node instanceof ToneAudioNode ? node : node.output;
    const link = (dest: Gain, level: number | undefined) => {
      if (!level) return;
      if (level === 1) src.connect(dest);
      else src.connect(this.bag.add(new Gain({ context: this.ctx, gain: level })).connect(dest));
    };
    link(this.out, sends.dry ?? 1);
    link(this.verb, sends.verb);
    link(this.echo, sends.echo);
  }

  // ---------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------
  start(fadeIn: number): void {
    if (this.disposed) return;
    const t = this.out.now() + 0.05;
    const level = Math.pow(10, (this.spec.gain ?? 0) / 20);
    for (const g of [this.out, this.verb, this.echo]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + Math.max(0.01, fadeIn));
    }
    for (const l of this.layers) this.safe(() => l.start?.(t));
    // 시작 시점의 정신력/강도를 레이어에 반영
    for (const l of this.layers) this.safe(() => l.sanity?.(this.sanity, t));
    for (const l of this.layers) this.safe(() => l.intensity?.(this.intensity, t));
    this.clock.start(t);
    if (this.spec.lifetime) {
      this.out.context.setTimeout(() => this.stop(0.3), this.spec.lifetime);
    }
  }

  stop(fadeOut: number): void {
    if (this.disposed || this.stopping) return;
    this.stopping = true;
    const t = this.out.now();
    const end = t + Math.max(0.02, fadeOut);
    for (const g of [this.out, this.verb, this.echo]) g.gain.rampTo(0, Math.max(0.02, fadeOut), t);
    for (const l of this.layers) this.safe(() => l.stop?.(end));
    this.clock.stop(end);
    this.out.context.setTimeout(() => this.dispose(), fadeOut + 0.5);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.layers = [];
    this.bag.dispose();
  }

  setSanity(s: number): void {
    if (this.disposed) return;
    this.sanity = s;
    this.updateSanityDerived();
    const t = this.out.now();
    for (const l of this.layers) this.safe(() => l.sanity?.(s, t));
  }

  setIntensity(x: number): void {
    if (this.disposed) return;
    this.intensity = x;
    const t = this.out.now();
    if (this.spec.tempoGain) {
      this.bpm = this.targetBpm();
      this.clock.frequency.rampTo(this.clockHz(), 4, t);
    }
    for (const l of this.layers) this.safe(() => l.intensity?.(x, t));
  }

  /** 레이어가 템포를 흔들고 싶을 때 (오르골 태엽 풀림, 균열의 일렁임). mult는 기본 템포 배율 */
  setTempoMod(mult: number, rampSec: number, t: number): void {
    this.tempoMod = mult;
    this.bpm = this.targetBpm();
    this.clock.frequency.rampTo(this.clockHz(), Math.max(0.01, rampSec), t);
  }

  // ---------------------------------------------------------------------
  private tempoMod = 1;
  private targetBpm(): number {
    return this.baseBpm * (1 + (this.spec.tempoGain ?? 0) * this.intensity) * this.tempoMod;
  }
  private clockHz(): number {
    return (this.bpm / 60) * this.stepsPerBeat;
  }
  private updateSanityDerived(): void {
    this.wobble = below(this.sanity, 60);
    this.dissonance = below(this.sanity, 35);
  }

  private tick(time: number): void {
    if (this.disposed) return;
    this.step++;
    const s = this.step;
    if (s > 0 && this.isBar(s, this.chordBars)) this.harmony.advance();
    for (const l of this.layers) {
      if (l.step) this.safe(() => l.step?.(time, s));
    }
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      // 한 레이어의 오류가 전체 음악을 멈추지 않게 (경고는 무드당 한 번만)
      if (!this.warned) {
        this.warned = true;
        console.warn('[audio] layer error', e);
      }
    }
  }
  private warned = false;
}

export function createMood(env: MoodEnv, spec: MoodSpec): MoodInstance {
  return new Runtime(env, spec);
}

/** -width..width 사이 무작위 팬 */
export const randPan = (width = 0.8): number => rand(-width, width);
