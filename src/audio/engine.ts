import {
  BiquadFilter,
  Compressor,
  Convolver,
  Gain,
  Limiter,
  PingPongDelay,
  getContext,
  getDestination,
  immediate,
  now,
  type BaseContext,
  type ToneAudioBuffer,
} from 'tone';
import { ACT_INDEPENDENT, MOODS, STINGERS, type MoodEnv, type MoodInstance } from './moods';
import { SanityFx } from './sanity';
import { clamp } from './scales';
import { SfxPlayer } from './sfx';
import { TrackInstance, TrackLibrary, type TrackEntry } from './tracks';
import type { AudioSettings, Mood, Sfx } from './types';

/** 리듬 중심 곡 — 정신력 심장박동을 겹치지 않는다 */
const RHYTHMIC: ReadonlySet<Mood> = new Set<Mood>(['combat', 'elite', 'boss', 'lord', 'rift']);
/** 속삭임/스웰 같은 정신력 '이벤트'를 내지 않는 무드 (효과 필터는 계속 적용) */
const NO_SANITY_EVENTS: ReadonlySet<Mood> = new Set<Mood>(['silence', 'title', 'victory', 'defeat']);

interface Graph {
  ctx: BaseContext;
  master: Gain;
  musicDry: Gain;
  musicWet: Gain;
  musicEcho: Gain;
  musicFader: Gain;
  musicWetFader: Gain;
  sfxFader: Gain;
  sfxWetFader: Gain;
  sanity: SanityFx;
  sfx: SfxPlayer;
}

/**
 * 어두운 대성당 같은 잔향 IR을 직접 만든다 (Tone.Reverb의 비동기 렌더링 대신 동기 생성).
 * 시간이 지날수록 고역이 먼저 사라지도록 시변 1-pole 로우패스를 건 노이즈 + 초기 반사음.
 */
export function makeImpulse(ctx: BaseContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.014);
  const buf = ctx.createBuffer(2, len, sr);
  const decay = Math.exp(-6.9 / (seconds * sr)); // 끝에서 -60dB
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let env = 1;
    let a = 0.65;
    for (let i = pre; i < len; i++) {
      if ((i & 63) === 0) a = 0.04 + 0.62 * Math.exp(((pre - i) / sr) * 1.5);
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * env;
      env *= decay;
    }
    // 초기 반사음 몇 개
    for (let k = 0; k < 10; k++) {
      const idx = pre + Math.floor(sr * (0.004 + Math.random() * 0.075));
      if (idx < len) d[idx] += (Math.random() * 2 - 1) * 0.6 * Math.exp(-k * 0.25);
    }
  }
  return buf;
}

export class AudioEngine {
  settings: AudioSettings;
  private g?: Graph;
  private sanity = 100;
  private intensity = 0;
  private act = 1;
  private currentKey = '';
  private current?: MoodInstance;
  private outgoing: MoodInstance[] = [];
  private pending?: { mood: Mood; act: number };
  private readonly tracks = new TrackLibrary();
  private hidden = false;
  private generation = 0;

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  get ready(): boolean {
    return !!this.g;
  }

  get lastAct(): number {
    return this.act;
  }

  /** AudioContext가 running이 된 뒤 한 번만 호출: 버스/이펙트/효과음 보이스 생성 */
  init(): void {
    if (this.g) return;
    const ctx = getContext();
    // 메인 스레드(PixiJS) 끊김에 대비해 음악 스케줄링 여유를 늘린다. 효과음은 immediate() 기준이라 영향 없음
    ctx.lookAhead = 0.2;

    const master = new Gain(0);
    const comp = new Compressor({ threshold: -18, ratio: 3, attack: 0.008, release: 0.25, knee: 10 });
    const limiter = new Limiter(-1.5);
    master.chain(comp, limiter, getDestination());

    // 공용 리버브 (음악/효과음 공유)
    const reverbIn = new Gain(1);
    const verbHp = new BiquadFilter({ type: 'highpass', frequency: 180, Q: 0.7 });
    const verbLp = new BiquadFilter({ type: 'lowpass', frequency: 6500, Q: 0.7 });
    const convolver = new Convolver(makeImpulse(ctx, 4.2));
    const verbReturn = new Gain(0.75);
    reverbIn.chain(verbHp, verbLp, convolver, verbReturn, master);

    // 음악 버스
    const musicFader = new Gain(0);
    musicFader.connect(master);
    const musicWetFader = new Gain(0);
    musicWetFader.connect(reverbIn);
    const musicDry = new Gain(1);
    const musicWet = new Gain(1);
    musicWet.connect(musicWetFader);
    const sanity = new SanityFx(ctx, musicFader, musicWet);
    musicDry.connect(sanity.input);

    // 음악 전용 에코 (핑퐁, 반복음이 점점 어두워지도록 앞단 필터)
    const musicEcho = new Gain(1);
    const echoHp = new BiquadFilter({ type: 'highpass', frequency: 260, Q: 0.7 });
    const echoLp = new BiquadFilter({ type: 'lowpass', frequency: 3200, Q: 0.7 });
    const echo = new PingPongDelay({ delayTime: 0.43, feedback: 0.38, wet: 1 });
    musicEcho.chain(echoHp, echoLp, echo, musicDry);
    const echoToVerb = new Gain(0.35);
    echo.chain(echoToVerb, musicWet);

    // 효과음 버스
    const sfxFader = new Gain(0);
    sfxFader.connect(master);
    const sfxWetFader = new Gain(0);
    sfxWetFader.connect(reverbIn);
    const sfxDry = new Gain(1);
    sfxDry.connect(sfxFader);
    const sfxWet = new Gain(1);
    sfxWet.connect(sfxWetFader);
    const sfx = new SfxPlayer(ctx, sfxDry, sfxWet);

    this.g = { ctx, master, musicDry, musicWet, musicEcho, musicFader, musicWetFader, sfxFader, sfxWetFader, sanity, sfx };
    this.applyLevels(0.05, false);
    const t = immediate();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(this.masterTarget(), t + 0.4);
    sanity.setSanity(this.sanity, now());

    const p = this.pending;
    this.pending = undefined;
    if (p) this.switchTo(p.mood, p.act);
  }

  // -------------------------------------------------------------------------
  // music
  // -------------------------------------------------------------------------

  play(mood: Mood, act: number): void {
    // 문자열로 넘어오는 호출부(예: 사운드 파사드)를 위해 런타임에도 확인
    if (mood !== 'silence' && !Object.prototype.hasOwnProperty.call(MOODS, mood)) {
      console.warn('[audio] unknown mood', mood);
      return;
    }
    const a = clamp(Math.round(Number.isFinite(act) ? act : this.act), 1, 5);
    this.act = a;
    const key = ACT_INDEPENDENT.has(mood) ? mood : `${mood}:${a}`;
    if (key === this.currentKey) return;
    this.currentKey = key;
    if (!this.g) {
      this.pending = { mood, act: a };
      return;
    }
    this.switchTo(mood, a);
  }

  private switchTo(mood: Mood, act: number): void {
    const g = this.g;
    if (!g) return;
    const gen = ++this.generation;
    const stinger = STINGERS.has(mood);
    const fadeOut = stinger ? 0.5 : mood === 'silence' ? 2.5 : 2;
    const fadeIn = stinger ? 0.02 : RHYTHMIC.has(mood) ? 1.4 : 2.2;
    this.retire(fadeOut);
    g.sanity.setContext(act, RHYTHMIC.has(mood), !NO_SANITY_EVENTS.has(mood));
    if (mood === 'silence') return;

    const track = this.tracks.find(mood, act);
    if (track) {
      const buf = this.tracks.ready(track.url);
      if (buf) {
        this.begin(this.makeTrack(track, act, mood, buf), fadeIn);
        return;
      }
      // 로딩되는 동안은 생성 음악을 틀고, 다 받으면 크로스페이드
      this.tracks
        .load(track.url)
        .then(() => {
          const b = this.tracks.ready(track.url);
          if (gen !== this.generation || !this.g || !b) return;
          this.retire(2);
          this.begin(this.makeTrack(track, act, mood, b), 2);
        })
        .catch(() => {
          /* 파일 실패 시 생성 음악 유지 */
        });
    }
    this.begin(MOODS[mood](this.env(act)), fadeIn);
  }

  private env(act: number): MoodEnv {
    const g = this.g!;
    return { act, dry: g.musicDry, verb: g.musicWet, echo: g.musicEcho, sanity: this.sanity, intensity: this.intensity };
  }

  private makeTrack(track: TrackEntry, act: number, mood: Mood, buf: ToneAudioBuffer): MoodInstance {
    this.tracks.acquire(track.url);
    return new TrackInstance(this.env(act), buf, track.volume, RHYTHMIC.has(mood), () => this.tracks.release(track.url));
  }

  private begin(inst: MoodInstance, fadeIn: number): void {
    this.current = inst;
    inst.start(fadeIn);
  }

  /** 현재 곡을 페이드아웃 목록으로 */
  private retire(fade: number): void {
    if (this.current) {
      this.current.stop(fade);
      this.outgoing.push(this.current);
      this.current = undefined;
    }
    this.outgoing = this.outgoing.filter((m) => !m.disposed);
    // 너무 빠르게 바꾸면 가장 오래된 것부터 즉시 정리 (동시 보이스 제한)
    while (this.outgoing.length > 2) this.outgoing.shift()?.dispose();
  }

  setSanity(s: number): void {
    if (!Number.isFinite(s)) return;
    const v = clamp(s, 0, 100);
    if (Math.abs(v - this.sanity) < 0.5 && this.ready) return;
    this.sanity = v;
    if (!this.g) return;
    this.g.sanity.setSanity(v, now());
    this.current?.setSanity(v);
  }

  setIntensity(x: number): void {
    if (!Number.isFinite(x)) return;
    const v = clamp(x, 0, 1);
    if (Math.abs(v - this.intensity) < 0.01) return;
    this.intensity = v;
    this.current?.setIntensity(v);
  }

  // -------------------------------------------------------------------------
  // sfx
  // -------------------------------------------------------------------------

  sfx(name: Sfx, pitch: number, volume: number): void {
    const g = this.g;
    if (!g || this.hidden || g.ctx.state !== 'running') return;
    if (!Number.isFinite(pitch) || !Number.isFinite(volume)) return;
    try {
      g.sfx.play(name, immediate() + 0.012, pitch, volume);
    } catch (e) {
      console.warn('[audio] sfx error', name, e);
    }
  }

  registerTrack(mood: Mood, url: string, act?: number, volume?: number): void {
    this.tracks.register(mood, url, act, volume);
  }

  // -------------------------------------------------------------------------
  // levels / visibility
  // -------------------------------------------------------------------------

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.applyLevels(0.15);
  }

  private masterTarget(): number {
    return this.settings.muted || this.hidden ? 0 : 1;
  }

  private applyLevels(ramp: number, master = true): void {
    const g = this.g;
    if (!g) return;
    const t = immediate();
    // 지각 볼륨에 가깝게 제곱 커브 (+3dB 음악 보정)
    const m = this.settings.music * this.settings.music * 1.4;
    const f = this.settings.sfx * this.settings.sfx;
    for (const [node, v] of [
      [g.musicFader, m],
      [g.musicWetFader, m],
      [g.sfxFader, f],
      [g.sfxWetFader, f],
    ] as const) {
      node.gain.rampTo(v, ramp, t);
    }
    if (master) g.master.gain.rampTo(this.masterTarget(), ramp, t);
  }

  /** 페이지가 가려지면 짧게 페이드 후 AudioContext 일시정지 */
  pause(): void {
    if (this.hidden) return;
    this.hidden = true;
    const g = this.g;
    if (!g) return;
    const t = immediate();
    g.master.gain.rampTo(0, 0.06, t);
    setTimeout(() => {
      if (!this.hidden) return;
      const raw = g.ctx.rawContext;
      if ('close' in raw && raw.state === 'running') raw.suspend().catch(() => undefined);
    }, 90);
  }

  /** 다시 보이면 재개 (iOS에서 실패하면 다음 터치 때 index.ts의 제스처 리스너가 재시도) */
  resume(): void {
    if (!this.hidden) return;
    this.hidden = false;
    const g = this.g;
    if (!g) return;
    g.ctx.resume().catch(() => undefined);
    const t = immediate();
    g.master.gain.cancelScheduledValues(t);
    g.master.gain.setValueAtTime(0, t);
    g.master.gain.linearRampToValueAtTime(this.masterTarget(), t + 0.5);
  }

  get isHidden(): boolean {
    return this.hidden;
  }
}
