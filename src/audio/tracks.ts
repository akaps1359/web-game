import { Gain, Player, ToneAudioBuffer, gainToDb } from 'tone';
import type { MoodEnv, MoodInstance } from './moods/runtime';
import { clamp } from './scales';
import type { Mood } from './types';

export interface TrackEntry {
  url: string;
  volume: number;
}

interface CacheEntry {
  promise: Promise<ToneAudioBuffer>;
  buffer?: ToneAudioBuffer;
  used: number;
  refs: number;
}

/**
 * 실제 음원 파일 등록/로딩. 디코딩된 버퍼는 메모리를 많이 먹으므로(3분 스테레오 ≈ 60MB)
 * 최근 사용 MAX_CACHED개만 유지한다(재생 중인 것은 제외).
 */
export class TrackLibrary {
  private static readonly MAX_CACHED = 3;
  private readonly entries = new Map<string, TrackEntry>();
  private readonly cache = new Map<string, CacheEntry>();
  private clock = 0;

  register(mood: Mood, url: string, act?: number, volume = 1): void {
    const key = act ? `${mood}:${Math.round(act)}` : mood;
    this.entries.set(key, { url, volume: clamp(volume, 0, 2) });
  }

  find(mood: Mood, act: number): TrackEntry | undefined {
    return this.entries.get(`${mood}:${act}`) ?? this.entries.get(mood);
  }

  /** 이미 디코딩된 버퍼 (없으면 undefined) */
  ready(url: string): ToneAudioBuffer | undefined {
    const e = this.cache.get(url);
    if (e?.buffer) e.used = ++this.clock;
    return e?.buffer;
  }

  load(url: string): Promise<ToneAudioBuffer> {
    let e = this.cache.get(url);
    if (!e) {
      const entry: CacheEntry = { promise: ToneAudioBuffer.fromUrl(url), used: ++this.clock, refs: 0 };
      entry.promise.then(
        (buf) => {
          entry.buffer = buf;
          this.evict();
        },
        () => {
          // 실패하면 다음 요청 때 다시 시도
          this.cache.delete(url);
        },
      );
      this.cache.set(url, entry);
      e = entry;
    }
    e.used = ++this.clock;
    return e.promise;
  }

  acquire(url: string): void {
    const e = this.cache.get(url);
    if (e) e.refs++;
  }

  release(url: string): void {
    const e = this.cache.get(url);
    if (e) e.refs = Math.max(0, e.refs - 1);
    this.evict();
  }

  private evict(): void {
    const loaded = [...this.cache.entries()].filter(([, e]) => e.buffer);
    if (loaded.length <= TrackLibrary.MAX_CACHED) return;
    loaded.sort((a, b) => a[1].used - b[1].used);
    let excess = loaded.length - TrackLibrary.MAX_CACHED;
    for (const [url, e] of loaded) {
      if (excess <= 0) break;
      if (e.refs > 0) continue;
      e.buffer?.dispose();
      this.cache.delete(url);
      excess--;
    }
  }
}

/** 등록된 음원을 반복 재생하는 MoodInstance */
export class TrackInstance implements MoodInstance {
  readonly rhythmic: boolean;
  disposed = false;
  private stopping = false;
  private readonly player: Player;
  private readonly fader: Gain;

  constructor(
    env: MoodEnv,
    buffer: ToneAudioBuffer,
    volume: number,
    rhythmic: boolean,
    private readonly onDispose: () => void,
  ) {
    this.rhythmic = rhythmic;
    this.fader = new Gain(0);
    this.fader.connect(env.dry);
    this.player = new Player({ url: buffer, loop: true, volume: gainToDb(Math.max(0.0001, volume)) });
    this.player.connect(this.fader);
  }

  start(fadeIn: number): void {
    if (this.disposed) return;
    const t = this.fader.now() + 0.05;
    this.player.start(t);
    this.fader.gain.setValueAtTime(0, t);
    this.fader.gain.linearRampToValueAtTime(1, t + Math.max(0.01, fadeIn));
  }

  stop(fadeOut: number): void {
    if (this.disposed || this.stopping) return;
    this.stopping = true;
    const t = this.fader.now();
    const f = Math.max(0.02, fadeOut);
    this.fader.gain.rampTo(0, f, t);
    this.player.stop(t + f + 0.05);
    this.fader.context.setTimeout(() => this.dispose(), f + 0.4);
  }

  setSanity(): void {
    /* 정신력 효과는 음악 버스 전체(SanityFx)에서 처리 */
  }

  setIntensity(): void {
    /* 음원은 강도 변화 없음 */
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.player.dispose();
    this.fader.dispose();
    this.onDispose();
  }
}
