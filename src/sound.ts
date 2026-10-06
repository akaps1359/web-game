/** 오디오 모듈 연결부. 실제 구현은 main에서 attach */
export interface AudioImpl {
  unlock(): Promise<void>;
  play(mood: string, opts?: { act?: number; seed?: string }): void;
  setSanity(s: number): void;
  setIntensity(x: number): void;
  sfx(name: string, opts?: { pitch?: number; volume?: number }): void;
}

let impl: AudioImpl | null = null;

export const sound = {
  attach(a: AudioImpl) {
    impl = a;
  },
  unlock(): Promise<void> {
    return impl?.unlock() ?? Promise.resolve();
  },
  /** seed: 곡의 정체성 (보스·정예·영주는 조우 id → 수호자마다 다른 곡) */
  music(mood: string, act?: number, seed?: string) {
    impl?.play(mood, { act, seed });
  },
  sanity(s: number) {
    impl?.setSanity(s);
  },
  intensity(x: number) {
    impl?.setIntensity(x);
  },
  sfx(name: string, opts?: { pitch?: number; volume?: number }) {
    impl?.sfx(name, opts);
  },
};
