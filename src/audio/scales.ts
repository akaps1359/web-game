/**
 * 음악 이론 / 난수 헬퍼. Tone.js에 의존하지 않는 순수 함수만 둔다.
 */

// ---------------------------------------------------------------------------
// Random helpers (Math.random — 음악 생성용이라 시드 불필요)
// ---------------------------------------------------------------------------

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** [값, 가중치] 목록에서 가중 무작위 선택 */
export function weighted<T>(items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

/** 지수분포 대기시간(평균 mean) — 포아송 이벤트 간격에 사용 */
export const expWait = (mean: number): number => -Math.log(1 - Math.random() * 0.999) * mean;

/** 정신력 s가 `from` 이하로 내려가면 0→1로 증가, `to`에서 1 */
export function below(s: number, from: number, to = 0): number {
  return clamp((from - s) / (from - to), 0, 1);
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

/** MIDI(실수 허용 → 미분음) → Hz */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
  hirajoshi: [0, 2, 3, 7, 8],
} as const satisfies Record<string, readonly number[]>;

export type Mode = readonly number[];

/** 음계 차수 → MIDI. 음수/옥타브 넘어가는 차수 허용 */
export function degreeToMidi(root: number, mode: Mode, degree: number): number {
  const n = mode.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + mode[idx];
}

/** 범위 [lo, hi] 안의 음계음 전부 */
export function scaleNotesIn(root: number, mode: Mode, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let oct = -4; oct <= 8; oct++) {
    for (const iv of mode) {
      const m = root + oct * 12 + iv;
      if (m >= lo && m <= hi) out.push(m);
    }
  }
  return out.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Act palettes
// ---------------------------------------------------------------------------

export interface Palette {
  act: number;
  /** 베이스 음역(옥타브 1~2)의 으뜸음 MIDI */
  root: number;
  mode: Mode;
  /** 화음 근음(음계 차수) 진행 — 3막은 무작위 보행 */
  prog: readonly number[];
  /** 기본 미분음 흔들림(cents) */
  micro: number;
  /** 템포 배율 */
  tempo: number;
  /** 필터 밝기 배율 */
  bright: number;
}

const PALETTES: Record<number, Palette> = {
  // 1막: 안개 낀 항구 — 자연단음계, 우울하지만 현실적
  1: { act: 1, root: 38, mode: MODES.aeolian, prog: [0, 5, 3, 4, 0, 5, 6, 4], micro: 0, tempo: 1, bright: 1 },
  // 2막: 가라앉은 수도원 — 프리지안, 성가/의식
  2: { act: 2, root: 35, mode: MODES.phrygian, prog: [0, 1, 0, 6, 3, 1, 0, 4], micro: 4, tempo: 0.93, bright: 0.85 },
  // 3막: 꿈의 경계 — 온음음계, 떠도는 화성
  3: { act: 3, root: 41, mode: MODES.wholeTone, prog: [0, 1, 3, 2, 0, 4, 1, 5], micro: 12, tempo: 0.9, bright: 1.1 },
  // 4막: 별들의 궁정 — 로크리안 + 미분음
  4: { act: 4, root: 36, mode: MODES.locrian, prog: [0, 1, 0, 4, 0, 1, 5, 4], micro: 24, tempo: 0.86, bright: 0.8 },
  // 최종: 잠든 자 — 이중 화성 단음계, 압도
  5: { act: 5, root: 33, mode: MODES.doubleHarmonic, prog: [0, 1, 0, 5, 3, 1, 0, 6], micro: 30, tempo: 0.82, bright: 0.75 },
};

export function palette(act: number): Palette {
  return PALETTES[clamp(Math.round(act), 1, 5)];
}

// ---------------------------------------------------------------------------
// Harmony state (shared by the layers of one mood)
// ---------------------------------------------------------------------------

export class Harmony {
  /** 현재 화음 근음의 음계 차수 */
  degree: number;
  private idx = 0;

  constructor(
    readonly pal: Palette,
    private readonly prog: readonly number[] = pal.prog,
    private readonly wander = pal.act === 3,
  ) {
    this.degree = prog[0];
  }

  get root(): number {
    return this.pal.root;
  }
  get mode(): Mode {
    return this.pal.mode;
  }

  /** 다음 화음으로 이동 */
  advance(): void {
    if (this.wander) {
      // 꿈: 근음이 한 칸씩 떠돈다 (가끔 으뜸으로 복귀)
      this.degree = chance(0.2) ? 0 : this.degree + pick([-1, 1, 1, 2, -2]);
      if (Math.abs(this.degree) > 4) this.degree = 0;
      return;
    }
    this.idx = (this.idx + 1) % this.prog.length;
    this.degree = this.prog[this.idx];
  }

  /** 음계 차수(화음 근음 기준 offset) → MIDI. octave는 root 기준 옥타브 이동 */
  note(offset: number, octave = 0): number {
    return degreeToMidi(this.pal.root + octave * 12, this.pal.mode, this.degree + offset);
  }

  /** 현재 화음의 근음 MIDI (octave 0 = 베이스 음역) */
  bass(octave = 0): number {
    const m = this.note(0, octave);
    // 베이스가 너무 높아지지 않게 접는다
    return m - this.pal.root >= 12 ? m - 12 : m;
  }

  /** 3도 쌓기 화음. size=3 삼화음, 4 = 7화음. 결과는 octave 이동 적용 */
  chord(size = 3, octave = 1): number[] {
    const out: number[] = [];
    for (let i = 0; i < size; i++) out.push(this.note(i * 2, octave));
    return out;
  }

  /** 범위 내 현재 화음 구성음 */
  chordTonesIn(lo: number, hi: number, size = 3): number[] {
    const pcs = new Set(this.chord(size, 0).map((m) => ((m % 12) + 12) % 12));
    const out: number[] = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
    return out;
  }

  /** 범위 내 음계음 */
  scaleIn(lo: number, hi: number): number[] {
    return scaleNotesIn(this.pal.root, this.pal.mode, lo, hi);
  }
}

/**
 * 정신력에 따라 화음에 불협음(단2도/삼전음)을 섞는다. amount 0..1
 */
export function addDissonance(notes: number[], amount: number): number[] {
  if (amount <= 0 || notes.length === 0 || !chance(amount)) return notes;
  const base = pick(notes);
  const add = weighted<number>([
    [1, 3],
    [6, 2],
    [-1, 1],
    [11, 1],
  ]);
  const out = notes.slice();
  out.push(base + add);
  if (amount > 0.7 && chance(amount - 0.5)) out.push(base + pick([1, 6, 13]) + 0.5); // 미분음 군집
  return out;
}
