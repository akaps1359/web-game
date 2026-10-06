import { Gain, Player, gainToDb, getContext, type BaseContext, type InputNode, type ToneAudioBuffer } from 'tone';
import type { MoodEnv, MoodInstance } from './moods/runtime';
import type { SongFactory } from './moods/suite';
import type { TrackEntry, TrackLibrary } from './tracks';

/** 음원 테마가 끝나기 몇 초 전부터 생성 곡을 다시 들이는가 (테마는 이 동안 사라진다) */
const RETURN = 2.6;
/** 다시 들어오는 생성 곡의 페이드인 — 테마 끝의 잦아드는 꼬리와 겹치는 동안 소리가 비지 않게 짧게 */
const RETURN_IN = 1.1;
/** 생성 곡 → 테마로 넘길 때 생성 곡이 사라지는 시간 (마무리 임팩트의 꼬리가 테마 첫머리와 겹친다) */
const HANDOFF = 2.8;

/** 등록된 음원을 한 번(끝 지점까지) 트는 재생기 */
class ThemePlayer {
  disposed = false;
  private readonly player: Player;
  private readonly fader: Gain;

  constructor(dest: InputNode, buffer: ToneAudioBuffer, volume: number) {
    this.fader = new Gain(0);
    this.fader.connect(dest);
    this.player = new Player({ url: buffer, loop: false, volume: gainToDb(Math.max(0.0001, volume)) });
    this.player.connect(this.fader);
  }

  /** at에 시작해 end초 지점에서 끝난다. 마지막 fadeOut초는 다음 곡과 겹치며 사라진다 */
  start(at: number, fadeIn: number, end: number, fadeOut: number): void {
    const g = this.fader.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(1, at + Math.max(0.01, fadeIn));
    g.setValueAtTime(1, at + Math.max(fadeIn, end - fadeOut));
    g.linearRampToValueAtTime(0, at + end);
    this.player.start(at, 0, end + 0.05);
  }

  /** 중간에 끊을 때 */
  stop(fade: number): void {
    if (this.disposed) return;
    const t = this.fader.now();
    const f = Math.max(0.02, fade);
    this.fader.gain.cancelAndHoldAtTime(t);
    this.fader.gain.linearRampToValueAtTime(0, t + f);
    try {
      this.player.stop(t + f + 0.05);
    } catch {
      /* 아직 시작 전이거나 이미 끝남 */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.player.dispose();
    this.fader.dispose();
  }
}

/**
 * 생성 곡(구간 구조) ↔ 실제 음원 테마를 번갈아 잇는 재생 단위.
 *
 *  - 생성 곡이 한 바퀴(도입 → A → B → … → 절정)를 마치면 마무리 임팩트와 함께 음원 테마로 넘어간다.
 *  - 테마가 끝날 무렵 생성 곡이 짧은 재진입 구간부터 다시 들어오고, 바퀴 번호를 이어 센다(다른 순서·변주·조옮김).
 *  - 넘어가는 몇 초를 빼면 둘 중 하나만 돈다 — 생성 곡은 테마 동안 완전히 멈추고 정리된다(CPU·메모리).
 *  - 음원이 아직 디코딩되지 않았으면 그 바퀴는 넘기지 않고 생성 곡이 계속 이어진다.
 */
export class Medley implements MoodInstance {
  readonly rhythmic = true;
  disposed = false;
  private stopping = false;
  private readonly ctx: BaseContext;
  private song?: MoodInstance;
  private theme?: ThemePlayer;
  /** 페이드 중인 것까지 포함해 만든 것 전부 (강제 정리용) */
  private readonly made = new Set<MoodInstance | ThemePlayer>();
  private readonly timers = new Set<number>();
  private cycle = 0;
  private sanity: number;
  private intensity: number;
  private held = false;

  constructor(
    private readonly env: MoodEnv,
    private readonly o: { make: SongFactory; track: TrackEntry; lib: TrackLibrary },
  ) {
    this.ctx = getContext();
    this.sanity = env.sanity;
    this.intensity = env.intensity;
  }

  start(fadeIn: number): void {
    if (this.disposed) return;
    const { lib, track } = this.o;
    // 바퀴 끝에서 바로 넘길 수 있게 지금 디코딩을 시작하고, 곡이 끝날 때까지 캐시에서 밀려나지 않게 잡아 둔다
    const loading = lib.load(track.url);
    lib.acquire(track.url);
    this.held = true;
    const buf = lib.ready(track.url);
    if (track.first && buf) {
      this.playTheme(buf, this.ctx.now() + 0.05, Math.min(0.6, fadeIn));
      return;
    }
    this.playSong(fadeIn, false);
    if (!track.first) {
      loading.catch(() => undefined);
      return;
    }
    // 테마부터 틀어야 하는데 아직 디코딩 전: 생성 곡 도입으로 시작했다가, 곧(12초 안) 준비되면 테마로 크로스페이드
    const begun = this.ctx.now();
    loading
      .then((b) => {
        if (this.disposed || this.stopping || this.theme || this.cycle > 0 || this.ctx.now() - begun > 12) return;
        const song = this.song;
        if (song) {
          song.stop(2);
          this.song = undefined;
          this.ctx.setTimeout(() => this.made.delete(song), 3);
        }
        this.playTheme(b, this.ctx.now() + 0.05, 2);
      })
      .catch(() => undefined);
  }

  stop(fadeOut: number): void {
    if (this.disposed || this.stopping) return;
    this.stopping = true;
    this.clearTimers();
    this.song?.stop(fadeOut);
    this.theme?.stop(fadeOut);
    this.ctx.setTimeout(() => this.dispose(), fadeOut + 0.6);
  }

  setSanity(s: number): void {
    this.sanity = s;
    this.song?.setSanity(s);
  }

  setIntensity(x: number): void {
    this.intensity = x;
    this.song?.setIntensity(x);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    for (const m of this.made) m.dispose();
    this.made.clear();
    this.song = undefined;
    this.theme = undefined;
    if (this.held) {
      this.held = false;
      this.o.lib.release(this.o.track.url);
    }
  }

  // -------------------------------------------------------------------------

  private after(sec: number, fn: () => void): void {
    const id = this.ctx.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed && !this.stopping) fn();
    }, Math.max(0, sec));
    this.timers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) this.ctx.clearTimeout(id);
    this.timers.clear();
  }

  private playSong(fadeIn: number, reentry: boolean): void {
    const env: MoodEnv = { ...this.env, sanity: this.sanity, intensity: this.intensity };
    const song: MoodInstance = this.o.make(env, {
      cycle: this.cycle,
      reentry,
      hooks: { interlude: (t) => this.interlude(t), outro: () => this.handoff(song) },
    });
    this.song = song;
    this.made.add(song);
    song.start(fadeIn);
  }

  /** 마무리 구간이 시작됐다 → 생성 곡은 그 임팩트의 꼬리를 남기며 사라지고 테마가 이어진다 */
  private handoff(song: MoodInstance): void {
    if (this.song !== song || this.disposed) return;
    song.stop(HANDOFF);
    this.song = undefined;
    this.ctx.setTimeout(() => this.made.delete(song), HANDOFF + 1);
  }

  /** 생성 곡의 한 바퀴가 끝나 t에 마무리 구간이 시작된다 → 그 박에 맞춰 음원 테마로 */
  private interlude(t: number): boolean {
    if (this.disposed || this.stopping || this.theme) return false;
    const buf = this.o.lib.ready(this.o.track.url);
    if (!buf) return false;
    // 테마는 마무리 구간의 첫 박(임팩트)과 함께 시작한다. 생성 곡은 그 구간이 시작될 때 handoff에서 내린다
    this.playTheme(buf, t, 0.12);
    return true;
  }

  private playTheme(buf: ToneAudioBuffer, at: number, fadeIn: number): void {
    const { track } = this.o;
    const end = Math.min(track.end ?? buf.duration, buf.duration);
    const th = new ThemePlayer(this.env.dry, buf, track.volume);
    this.theme = th;
    this.made.add(th);
    th.start(at, fadeIn, end, RETURN);
    // 끝나기 RETURN초 전부터 생성 곡을 다시 (재진입 구간부터, 바퀴 번호를 이어서)
    this.after(at + end - RETURN - this.ctx.now(), () => {
      this.cycle++;
      this.playSong(RETURN_IN, true);
      this.after(RETURN + 1, () => {
        th.dispose();
        this.made.delete(th);
        if (this.theme === th) this.theme = undefined;
      });
    });
  }
}
