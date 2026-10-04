/** 오디오 모듈 연결부. 실제 구현은 main에서 attach */
export interface AudioImpl {
  unlock(): Promise<void>;
  play(mood: string, opts?: { act?: number }): void;
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
  music(mood: string, act?: number) {
    impl?.play(mood, { act });
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
