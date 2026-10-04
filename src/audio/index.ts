/**
 * 심연행 오디오 모듈 — Tone.js 생성 음악 + 합성 효과음.
 *
 * 사용 예:
 *   button.onclick = () => { audio.unlock(); audio.play('title'); };   // 첫 터치에서
 *   audio.play('explore', { act: 2 });
 *   audio.setSanity(player.sanity);
 *   audio.sfx('slash', { pitch: 1.05 });
 */
import { getContext, start as toneStart, type BaseContext } from 'tone';
import { AudioEngine } from './engine';
import { clamp } from './scales';
import type { AudioSettings, Mood, Sfx } from './types';

export type { AudioSettings, Mood, Sfx } from './types';

export interface AbyssAudio {
  /** Must be called from a user gesture (tap). Resolves when the AudioContext is running. Safe to call many times. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  /** Crossfade (~2s) to the given mood. act 1..5 (5 = final). Same mood+act again = no-op. */
  play(mood: Mood, opts?: { act?: number }): void;
  /** 0..100. Smoothly changes detune/dissonance/filters/whisper density of the current music. */
  setSanity(sanity: number): void;
  /** Intensity 0..1 within a track (e.g. boss phase 2, low HP). */
  setIntensity(x: number): void;
  sfx(name: Sfx, opts?: { pitch?: number; volume?: number }): void;
  settings: AudioSettings;
  /** persist to localStorage key 'abyss.audio' */
  applySettings(s: Partial<AudioSettings>): void;
  /** Optional real audio files that override the generated music for a mood (+optional act). Lazy-loaded, looped, crossfaded. */
  registerTrack(mood: Mood, url: string, opts?: { act?: number; volume?: number }): void;
}

// ---------------------------------------------------------------------------
// settings persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'abyss.audio';
const DEFAULTS: AudioSettings = { music: 0.7, sfx: 0.8, muted: false };

function sanitize(s: Partial<AudioSettings>, base: AudioSettings): AudioSettings {
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : d);
  return {
    music: num(s.music, base.music),
    sfx: num(s.sfx, base.sfx),
    muted: typeof s.muted === 'boolean' ? s.muted : base.muted,
  };
}

function loadSettings(): AudioSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw) as Partial<AudioSettings>, DEFAULTS);
  } catch {
    /* 사파리 사생활 보호 모드 등 */
  }
  return { ...DEFAULTS };
}

function saveSettings(s: AudioSettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// ---------------------------------------------------------------------------
// unlock / iOS helpers
// ---------------------------------------------------------------------------

const engine = new AudioEngine(loadSettings());
const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
let unlocking: Promise<void> | null = null;
let unlockRequested = false;

/** 구형 iOS: 제스처 안에서 무음 버퍼를 한 번 재생해야 오디오가 풀린다 */
function playSilentBuffer(ctx: BaseContext): void {
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.rawContext.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  } catch {
    /* 무시 */
  }
}

function isRunning(ctx: BaseContext): boolean {
  return ctx.state === 'running';
}

/** running이 되면 true, ms 안에 안 되면 false로 resolve (게임이 await에서 멈추지 않게) */
function waitRunning(ctx: BaseContext, ms: number): Promise<boolean> {
  if (isRunning(ctx)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer = 0;
    const onState = () => {
      if (isRunning(ctx)) done(true);
    };
    const done = (ok: boolean) => {
      ctx.off('statechange', onState);
      clearTimeout(timer);
      resolve(ok);
    };
    ctx.on('statechange', onState);
    timer = setTimeout(() => done(isRunning(ctx)), ms) as unknown as number;
  });
}

let listenersInstalled = false;
/** 앱 전환/전화 등으로 'interrupted'·'suspended'가 되면 다음 터치에서 재개 */
function installResumeListeners(): void {
  if (listenersInstalled || !hasDom) return;
  listenersInstalled = true;
  const ctx = getContext();
  const onGesture = () => {
    if (document.hidden || engine.isHidden) return;
    if (!isRunning(ctx)) {
      ctx.resume().catch(() => undefined);
      playSilentBuffer(ctx);
    }
  };
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) {
    document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  // 다른 경로로 running이 되면(재개 성공 등) 그때 초기화
  ctx.on('statechange', () => {
    if (isRunning(ctx) && unlockRequested && !engine.ready) engine.init();
  });
}

if (hasDom) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) engine.pause();
    else engine.resume();
  });
  window.addEventListener('pagehide', () => engine.pause());
  window.addEventListener('pageshow', () => {
    if (!document.hidden) engine.resume();
  });
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export const audio: AbyssAudio = {
  unlock(): Promise<void> {
    if (!hasDom) return Promise.resolve();
    unlockRequested = true;
    const ctx = getContext();
    // 반드시 제스처 콜백 안에서 동기적으로 호출되어야 한다
    if (!isRunning(ctx)) {
      toneStart().catch(() => undefined);
      playSilentBuffer(ctx);
    }
    installResumeListeners();
    if (engine.ready && isRunning(ctx)) return Promise.resolve();
    if (!unlocking) {
      unlocking = waitRunning(ctx, 3000)
        .then((ok) => {
          if (ok) engine.init();
        })
        .finally(() => {
          unlocking = null;
        });
    }
    return unlocking;
  },

  get unlocked(): boolean {
    return engine.ready;
  },

  play(mood: Mood, opts?: { act?: number }): void {
    engine.play(mood, opts?.act ?? engine.lastAct);
  },

  setSanity(sanity: number): void {
    engine.setSanity(sanity);
  },

  setIntensity(x: number): void {
    engine.setIntensity(x);
  },

  sfx(name: Sfx, opts?: { pitch?: number; volume?: number }): void {
    // unlock 전 효과음은 무시
    engine.sfx(name, opts?.pitch ?? 1, opts?.volume ?? 1);
  },

  get settings(): AudioSettings {
    return { ...engine.settings };
  },

  set settings(s: AudioSettings) {
    this.applySettings(s);
  },

  applySettings(s: Partial<AudioSettings>): void {
    const next = sanitize(s, engine.settings);
    saveSettings(next);
    engine.setSettings(next);
  },

  registerTrack(mood: Mood, url: string, opts?: { act?: number; volume?: number }): void {
    engine.registerTrack(mood, url, opts?.act, opts?.volume);
  },
};

export default audio;
