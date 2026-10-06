/**
 * 수호자(보스)·정예·영주 곡 — 구간 구조를 가진 긴 생성 곡.
 *
 *   보스 1바퀴: 도입(8) → A(16) → B(16) → A'(8) → 숨 고르기(8) → 절정(16)   ≈ 2분 10초~2분 40초
 *   다음 바퀴: 순서와 변주가 바뀐다 (A'·B·A 순서, 화성 진행, 드럼 변형, 주제 변주, 절정의 조옮김)
 *
 * - 막 팔레트(으뜸음·음계·악기·드럼)는 battle.ts의 ACTS를 그대로 쓰고, 그 위에 보스 전용 선율(theme.ts)과 구간별 리듬을 붙인다.
 * - 수호자 id(조우 id)를 씨앗으로 주제 선율·리듬, 구간별 선율 악기, 화성 진행, 템포(±4%), 절정 조옮김 폭이 정해진다.
 *   같은 수호자는 늘 같은 주제, 다른 수호자는 다른 곡.
 * - 구간 레이어는 구간마다 새로 만들고 끝나면 정리한다(form.ts). 바탕 드론·전환 효과만 곡 내내 산다.
 */
import { dbToGain } from 'tone';
import { SeedRng, clamp } from '../scales';
import { ACTS, choirChords, sinkingDrone, type BattleAct } from './battle';
import { director, transitions, type FormSpec, type PlanItem, type Role, type Section, type SongHooks } from './form';
import { bells, distantDrums, drips, drone, foghorn, heartbeat, pad, pipes, sea, shimmer, swells, wind } from './layers';
import { drumKit, glassArp, ostinato, stabs, type DrumVoice, type KitOpts, type OstinatoOpts } from './rhythm';
import { createMood, type Layer, type MoodEnv, type MoodFactory, type MoodInstance, type Runtime, type Scope } from './runtime';
import { arp, displace, invert, line, makeLead, makeTheme, retro, slice, stretch, toll, transpose, type LeadKind, type Theme, type ThemeNote } from './theme';

export type SuiteKind = 'boss' | 'elite' | 'lord';

export interface SongOpts {
  /** 시작 바퀴 (메들리가 음원 테마를 지나 다시 부를 때 이어서 센다) */
  cycle: number;
  /** 음원 테마 뒤에 다시 들어온다 (짧은 재진입 구간부터) */
  reentry: boolean;
  hooks?: SongHooks;
}

/** 메들리(medley.ts)가 바퀴마다 새로 부르는 곡 팩토리 */
export type SongFactory = (env: MoodEnv, o: SongOpts) => MoodInstance;

type Pats = Partial<Record<DrumVoice, readonly string[]>>;
type Ost = OstinatoOpts['patterns'];
type ProgRole = 'intro' | 'A' | 'A2' | 'B' | 'bridge' | 'climax';

interface Leads {
  /** 주제를 실을 수 있는 악기들 */
  pool: readonly LeadKind[];
  /** 도입의 어두운 첫 동기 */
  intro: LeadKind;
  /** 숨 고르기 */
  soft: readonly LeadKind[];
  /** 절정 */
  strong: readonly LeadKind[];
  /** B의 아르페지오 */
  arp: LeadKind;
}

interface SuiteAct {
  bpm: number;
  stepsPerBeat: number;
  beatsPerBar: number;
  /** 기본 킷 (필인·쉐이커·금속 음높이, A의 바탕 패턴) */
  kit: KitOpts;
  /** A에서 덮어쓸 보스 패턴 */
  bossKit: Pats;
  intro: Pats;
  A2: Pats;
  B: readonly Pats[];
  climax: readonly Pats[];
  ost: Ost;
  ostIntro: Ost;
  ostB: readonly Ost[];
  /** 오스티나토·주제 음마다 고정 미분음 (영주) */
  micro?: readonly number[];
  stabHits: readonly number[];
  progs: Record<ProgRole, readonly (readonly number[])[]>;
  leads: Leads;
  /** 곡 내내 깔리는 드론 (기본: 화음 베이스를 따라가는 낮은 톱니 드론) */
  coreDrone?(rt: Runtime): Layer;
  /** 막 고유의 질감 (구간 역할별) */
  color(sc: Runtime, role: Role): Layer[];
}

/** 한 곡(런타임 하나)의 정체성 */
interface Song {
  kind: SuiteKind;
  ai: number;
  suite: SuiteAct;
  rng: SeedRng;
  theme: Theme;
  leads: { intro: LeadKind; A: LeadKind; A2: LeadKind; B: LeadKind; bridge: LeadKind; climax: LeadKind; arp: LeadKind };
  progIntro: readonly number[];
  progA: readonly number[];
  progClimax: readonly number[];
  /** 두 번째 절정부터 올리는 반음 수 */
  shift: number;
  /** 템포 배율 */
  tempo: number;
  arpShape: readonly number[];
  drone?: Scope;
}

const ARP_SHAPES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1],
  [0, 2, 1, 3, 1, 2],
  [0, 1, 2, 1, 0, 1, 2, 3],
  [3, 2, 1, 0, 1, 2],
  [0, 2, 3, 1],
];

// ===========================================================================
// 막별 설정 — 바탕(ACTS)에 구간 패턴·화성·악기를 더한다
// ===========================================================================

const from = (a: BattleAct) => ({
  bpm: a.bpm,
  stepsPerBeat: a.stepsPerBeat ?? 4,
  beatsPerBar: a.beatsPerBar ?? 4,
  kit: a.kit,
  bossKit: a.bossKit,
  ost: a.ost,
  stabHits: a.stabHits,
});

const SUITES: Record<number, SuiteAct> = {
  // 1막 항구 지하 — D 자연단음계. 통 북·쇠사슬, 조율 안 된 피아노, 바다와 무적
  1: {
    ...from(ACTS[1]),
    intro: { B: ['X...............'], K: ['X...............', 'X.......x.......'], T: ['..............o.', '............o.o.'], M: ['.......?........'] },
    A2: { K: ['X..x..x...x.x...', 'X..x....X..x..x.'], S: ['....X.......X...', '....X..o....X.o.'], M: ['x...x...x...x...', '..x...x...x...x.'], B: ['X...............'] },
    B: [
      { K: ['X.........x.....', 'X.......x.x.....'], S: ['........X.......'], T: ['..o.x...o.x.x.o.', '....x.o...x.o.x.'], H: ['x.x.x.x.x.x.x.x.'], M: ['.......?.......?'] },
      { K: ['X...X...X...X...'], S: ['....x.o.....x.o.', '..o.x.....o.x...'], T: ['..............xx', '............x.xx'], B: ['X...............'] },
    ],
    climax: [
      { K: ['X.xX..x.X.xX..x.', 'X..xX.x.X..xX.x.'], S: ['....X.......X...', '....X..x....X.xx'], T: ['..o...x...o.x.xx', 'x.o.x.o.x.o.x.xx'], H: ['xxxxxxxxxxxxxxxx', 'x.xxx.xxx.xxx.xx'], M: ['x...x...x...x...'], B: ['X.......X.......'] },
      { K: ['X..x..x.X..x..x.', 'X.x...x.X.x...x.'], S: ['....X.......X...', '....X.....o.X.x.'], T: ['x...x.o.x...xxxx'], H: ['x.xxx.xxx.xxx.xx'], M: ['x.x.x.x.x.x.x.x.'], B: ['X.......X.......'] },
    ],
    ostIntro: [[0, null, null, null, 0, null, null, null]],
    ostB: [
      [
        [0, null, 0, null, 7, null, 5, null],
        [0, null, 12, null, 10, 7, null, 5],
      ],
      [
        [0, 0, null, 0, null, 0, 3, null],
        [0, null, 0, 7, null, 0, 8, 7],
      ],
    ],
    progs: {
      intro: [[0], [0, 5]],
      A: [[0, 5, 6, 0], [0, 3, 5, 4], [0, 6, 5, 4]],
      A2: [[0, 3, 6, 4], [0, 5, 3, 4], [0, 6, 3, 4]],
      B: [[5, 2, 6, 4], [3, 0, 5, 6], [5, 6, 3, 4]],
      bridge: [[5, 3], [0, 5], [3, 5]],
      climax: [[0, 6, 5, 4], [0, 5, 6, 4], [0, 3, 6, 5]],
    },
    leads: { pool: ['brass', 'oldkeys', 'pluck', 'bell'], intro: 'horn', soft: ['oldkeys', 'bell', 'pluck'], strong: ['brass'], arp: 'pluck' },
    color(sc, role) {
      const saw = (cutoff: number, volume: number) =>
        pad(sc, { type: 'sawtooth', count: 2, spread: 18, cutoff, attack: 1.4, release: 2.2, volume, octave: 1, unease: 0.08, sends: { dry: 1, verb: 0.4 } });
      const soft = (volume: number) =>
        pad(sc, { type: 'triangle', count: 2, spread: 12, cutoff: 900, attack: 2.5, release: 4, volume, octave: 1, every: 4, color: 0.3 });
      switch (role) {
        case 'intro':
        case 'reentry':
          return [sea(sc, { level: 0.28, cutoff: 340 }), foghorn(sc, { every: 16, volume: -14 })];
        case 'A':
          return [saw(700, -24)];
        case 'A2':
          return [saw(850, -24), sea(sc, { level: 0.14, cutoff: 300 })];
        case 'B':
          return [sea(sc, { level: 0.18, cutoff: 320 }), soft(-25)];
        case 'bridge':
          return [sea(sc, { level: 0.32, cutoff: 360 }), drips(sc, { every: 1.8 }), foghorn(sc, { every: 12, volume: -14 }), soft(-23)];
        case 'climax':
          return [saw(1100, -22.5)];
        default:
          return [];
      }
    },
  },
  // 2막 수도원 — B 프리지안. 틀북, 합창, 종, 오르간 드론
  2: {
    ...from(ACTS[2]),
    intro: { B: ['X...............'], M: ['X...............', '................'], T: ['............x.x.', '..............x.'] },
    A2: { K: ['X..x....X.x.....', 'X.......X..x..x.'], T: ['....x..o....x..o', '..o...x.....x.x.'], S: ['....X.......X...'], M: ['X.......X.......'] },
    B: [
      { K: ['X.......X.......', 'X.......X...x...'], T: ['....x.x.....x.x.', '..o.x.x...o.x.x.'], M: ['X...............'], S: ['........X.......'] },
      { K: ['X.....x.X.......', 'X..x....X.......'], T: ['..x...x...x.x.x.'], S: ['....X.......X..o'], H: ['x.x.x.x.x.x.x.x.'] },
    ],
    climax: [
      { K: ['X..xX..xX..xX.x.', 'X.x.X..xX.x.X..x'], S: ['....X.......X...', '....X..x....X.x.'], T: ['x.o.x.o.x.o.xxxx'], H: ['x.xxx.xxx.xxx.xx'], M: ['X.......X.......'], B: ['X.......X.......'] },
      { K: ['X..x..x.X..x..x.'], S: ['....X..o....X...'], T: ['..x.x.x...x.xxxx', 'x.x.x.x.x.x.x.x.'], H: ['xxxxxxxxxxxxxxxx'], M: ['X...X...X...X...'], B: ['X.......X.......'] },
    ],
    ostIntro: [[0, null, null, null, 1, null, null, null]],
    ostB: [
      [
        [0, null, 1, null, 0, null, 7, 8],
        [0, 0, null, 1, null, 0, 8, 7],
      ],
      [
        [0, null, null, 0, 1, null, 0, null],
        [0, 7, null, 0, 1, null, 12, null],
      ],
    ],
    progs: {
      intro: [[0, 1], [0]],
      A: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 0]],
      A2: [[0, 6, 5, 1], [0, 1, 3, 1], [0, 3, 6, 1]],
      B: [[5, 6, 1, 0], [3, 5, 6, 1], [6, 5, 1, 1]],
      bridge: [[0, 1], [5, 1]],
      climax: [[0, 1, 6, 1], [0, 5, 6, 1], [0, 1, 0, 6]],
    },
    leads: { pool: ['choir', 'bell', 'brass', 'organ'], intro: 'choir', soft: ['bell', 'choir', 'organ'], strong: ['brass', 'choir'], arp: 'bell' },
    color(sc, role) {
      const r = sc.pal.root;
      const organ = (level: number) =>
        drone(sc, { notes: [r, r + 7, r + 12], type: 'triangle', count: 2, spread: 6, cutoff: 650, level, lfoRate: 0.02, lfoOct: 0.5 });
      switch (role) {
        case 'intro':
        case 'reentry':
          return [
            organ(0.24),
            bells(sc, { notes: [12, 24], every: 6, strikes: [1, 1], volume: -15, hum: true }),
            choirChords(sc, { volume: -16, octave: 2, vowels: ['u', 'o'], every: 4 }),
          ];
        case 'A':
          return [
            choirChords(sc, { volume: -12.5, octave: 2, vowels: ['a', 'o', 'a', 'e'], unease: 0.3 }),
            bells(sc, { notes: [12, 24], every: 9, strikes: [1, 2], gap: 1.6, volume: -16, hum: true }),
          ];
        case 'A2':
          return [
            choirChords(sc, { volume: -13, octave: 2, vowels: ['o', 'a'], unease: 0.25 }),
            bells(sc, { notes: [12, 19, 24], every: 11, strikes: [1, 2], volume: -16, hum: true }),
          ];
        case 'B':
          return [organ(0.18), bells(sc, { notes: [12, 19, 24], every: 5, strikes: [2, 3], gap: 0.9, volume: -17 })];
        case 'bridge':
          return [
            organ(0.26),
            choirChords(sc, { volume: -14, octave: 1, vowels: ['u', 'o'], every: 4 }),
            bells(sc, { notes: [0, 12], every: 7, strikes: [1, 1], volume: -15, ring: 8, hum: true }),
          ];
        case 'climax':
          return [
            choirChords(sc, { volume: -11.5, octave: 2, vowels: ['a', 'e'], unease: 0.35 }),
            bells(sc, { notes: [12, 24], every: 6, strikes: [1, 2], gap: 1.2, volume: -15, hum: true }),
          ];
        default:
          return [];
      }
    },
  },
  // 3막 얼어붙은 고대 도시 — E 도리안. 엇박, 얼음 결정 아르페지오, 눈보라, 먼 피리(테켈리-리)
  3: {
    ...from(ACTS[3]),
    intro: { B: ['X...............'], H: ['....o.......o...', '..o.....o.....o.'], T: ['..........o...o.', '................'] },
    A2: { K: ['X...x..x..X..x..', 'X..x..X...x..x..'], S: ['....X....o..X...'], T: ['......x..o....x.'], H: ['xoxoxoxoxoxoxoxo'] },
    B: [
      { K: ['X.....x...x.....', 'X..x......x..x..'], S: ['........X.......'], T: ['..o...x...o...x.'], H: ['x.ox.ox.ox.ox.o.'] },
      { K: ['X..x..x...x..x..'], S: ['....X.......X...'], T: ['......x.....x.x.'], H: ['..x...x...x...x.'] },
    ],
    climax: [
      { K: ['X..x..X..x..X.x.', 'X..x..X.X..x..x.'], S: ['....X..x....X...', '....X....x..X.x.'], T: ['..o.x.o...o.x.xx'], H: ['xxxxxxxxxxxxxxxx'], B: ['X.........X.....'] },
      { K: ['X..x..x.X..x..x.'], S: ['....X.......X..x'], T: ['x..x..x.x..x.xxx'], H: ['xoxoxoxoxoxoxoxo'], B: ['X.......X.......'] },
    ],
    ostIntro: [[0, null, null, null, 7, null, null, null]],
    ostB: [
      [
        [0, null, 7, null, 12, null, 7, 4],
        [0, 7, null, 7, 10, null, 7, 3],
      ],
      [
        [0, null, 0, null, 3, null, 2, null],
        [0, 12, null, 0, 10, null, 7, null],
      ],
    ],
    progs: {
      intro: [[0], [0, 3]],
      A: [[0, 3, 0, 6], [0, 6, 3, 0], [0, 2, 3, 0]],
      A2: [[0, 3, 4, 0], [0, 2, 6, 3], [0, 6, 2, 3]],
      B: [[2, 6, 3, 4], [3, 2, 6, 0], [6, 2, 3, 3]],
      bridge: [[0, 3], [2, 6]],
      climax: [[0, 3, 6, 4], [0, 6, 2, 3], [0, 2, 6, 3]],
    },
    leads: { pool: ['glass', 'pipe', 'ice', 'brass'], intro: 'ice', soft: ['ice', 'glass', 'pipe'], strong: ['brass'], arp: 'glass' },
    color(sc, role) {
      const r = sc.pal.root;
      const cold = (volume: number, cutoff = 1500) =>
        pad(sc, { type: 'triangle', count: 3, spread: 30, cutoff, attack: 1, release: 2, volume, octave: 2, chorus: true, sends: { dry: 0.8, verb: 0.7, echo: 0.2 } });
      const deep = () => drone(sc, { notes: [r - 12, r - 5], type: 'sine', count: 2, spread: 6, cutoff: 240, level: 0.28, lfoRate: 0.02 });
      switch (role) {
        case 'intro':
        case 'reentry':
          return [
            wind(sc, { level: 0.26, freq: 1100, q: 3.2, rate: 0.025 }),
            wind(sc, { level: 0.14, freq: 260, q: 1.2, rate: 0.015 }),
            deep(),
            glassArp(sc, { density: 0.16 }),
          ];
        case 'A':
          return [glassArp(sc, { density: 0.5 }), cold(-24), wind(sc, { level: 0.12, freq: 1200, q: 3, rate: 0.04 })];
        case 'A2':
          return [glassArp(sc, { density: 0.58 }), cold(-24)];
        case 'B':
          return [
            pipes(sc, { prob: 0.45, volume: -26 }),
            pad(sc, { type: 'sine', count: 2, spread: 14, cutoff: 1800, attack: 2, release: 3, volume: -24, octave: 2 }),
            wind(sc, { level: 0.2, freq: 1000, q: 3, rate: 0.03 }),
          ];
        case 'bridge':
          return [
            wind(sc, { level: 0.3, freq: 1100, q: 3.2, rate: 0.025 }),
            wind(sc, { level: 0.16, freq: 260, q: 1.2, rate: 0.015 }),
            deep(),
            pad(sc, { type: 'sine', count: 2, spread: 14, cutoff: 1800, attack: 4, release: 6, volume: -25, octave: 2, every: 4 }),
            shimmer(sc, { density: 0.1 }),
          ];
        case 'climax':
          return [glassArp(sc, { density: 0.72 }), cold(-22.5, 2000), wind(sc, { level: 0.16, freq: 1300, q: 3, rate: 0.05 })];
        default:
          return [];
      }
    },
  },
  // 4막 별들의 궁정 — C 로크리안 + 미분음, 7/8. 반음 군집, 저주받은 피리, 먼 북
  4: {
    ...from(ACTS[4]),
    intro: { B: ['X.............'], T: ['..........o.o.', '............o.'], M: ['..?...........'] },
    A2: { K: ['X.x.....X.x...', 'X...x.x.X.....'], S: ['....X.......x.'], T: ['..o.......x.x.'], M: ['x.......?.....'], H: ['x.x.x.x.x.x.x.'] },
    B: [
      { K: ['X.....x...x...', 'X.....X...x.x.'], S: ['......X.......'], T: ['..o.....x...o.', '....x.o...x...'], H: ['x.x.x.x.x.x.x.'], M: ['......?.......'] },
      { K: ['X...X.....X...'], S: ['....x.....X...'], T: ['......x.x...xx'], B: ['X.............'] },
    ],
    climax: [
      { K: ['X.xX..x.X.x.xx', 'X..xX.x.X.xX..'], S: ['....X.......X.', '....X...x...X.'], T: ['x.o.x.o.x.o.xx'], H: ['xxxxxxxxxxxxxx'], M: ['x...x...x.....'], B: ['X.......X.....'] },
      { K: ['X.x.x...X.x.x.'], S: ['....X...x...X.'], T: ['..x.x.x...xxxx'], H: ['x.xxx.xxx.xxx.'], M: ['x.x.x...x.x...'], B: ['X.......X.....'] },
    ],
    ostIntro: [[0, null, null, 0, null, null, null]],
    ostB: [
      [
        [0, null, 0, 6, null, 1, 0],
        [0, 1, null, 0, 6, null, 1],
      ],
      [
        [0, 0, 1, null, 0, 6, null],
        [0, null, 6, 0, null, 1, 0],
      ],
    ],
    progs: {
      intro: [[0, 1], [0]],
      A: [[0, 1, 0, 4], [0, 4, 5, 1], [0, 1, 5, 4]],
      A2: [[0, 5, 4, 1], [0, 1, 3, 4], [0, 4, 1, 0]],
      B: [[5, 4, 1, 0], [3, 1, 4, 0], [2, 1, 0, 1]],
      bridge: [[0, 1], [4, 0]],
      climax: [[0, 1, 4, 1], [0, 4, 1, 0], [0, 1, 5, 4]],
    },
    leads: { pool: ['pipe', 'brass', 'bell', 'choir'], intro: 'pipe', soft: ['pipe', 'bell'], strong: ['brass', 'choir'], arp: 'bell' },
    color(sc, role) {
      const r = sc.pal.root;
      const cluster = (level: number) =>
        drone(sc, { notes: [r - 12, r - 11, r - 5], count: 2, spread: 24, cutoff: 260, level, lfoRate: 0.02, lfoOct: 1 });
      switch (role) {
        case 'intro':
        case 'reentry':
          return [cluster(0.3), distantDrums(sc, { volume: -13 }), pipes(sc, { prob: 0.45, volume: -25 })];
        case 'A':
          return [pipes(sc, { prob: 0.45, volume: -25 }), shimmer(sc, { density: 0.12 })];
        case 'A2':
          return [pipes(sc, { prob: 0.55, volume: -25 }), shimmer(sc, { density: 0.15 })];
        case 'B':
          return [
            shimmer(sc, { density: 0.2 }),
            pad(sc, { type: 'sawtooth', count: 2, cutoff: 600, octave: 1, unease: 0.4, volume: -25, attack: 2, release: 3 }),
            pipes(sc, { prob: 0.3, volume: -26 }),
          ];
        case 'bridge':
          return [
            cluster(0.32),
            pipes(sc, { prob: 0.6, volume: -24 }),
            shimmer(sc, { density: 0.15 }),
            wind(sc, { level: 0.12, freq: 300, q: 3, rate: 0.02, type: 'white' }),
          ];
        case 'climax':
          return [
            choirChords(sc, { volume: -13, octave: 1, vowels: ['u', 'a', 'o', 'i'], unease: 0.5 }),
            shimmer(sc, { density: 0.2 }),
            pipes(sc, { prob: 0.4, volume: -25 }),
          ];
        default:
          return [];
      }
    },
  },
  // 5막 꿈꾸는 우주 — A 리디안. 무거운 하프타임, 낮은 합창, 열린 5도, 태아의 심장박동, 별빛
  5: {
    ...from(ACTS[5]),
    intro: { B: ['X...............'] },
    A2: { K: ['X.....x.X.......', 'X.......X.x..x..'], S: ['........X.......', '........X.....o.'], T: ['........x.....x.'], H: ['.x.x.x.x.x.x.x.x'], B: ['X...............'] },
    B: [
      { K: ['X.........x.....', 'X.....x.........'], S: ['........X.......'], T: ['....x.......x.x.'], H: ['.x.x.x.x.x.x.x.x'], B: ['X...............'] },
      { K: ['X.......X.......'], S: ['....o...X...o...'], T: ['..x.....x.x.....'], M: ['....?.......?...'] },
    ],
    climax: [
      { K: ['X..x....X.x..x..', 'X.x...x.X..x..x.'], S: ['....X.......X...'], T: ['x...x.o.x...xxxx'], H: ['x.x.x.x.x.x.x.x.'], B: ['X.......X.......'], M: ['....?.......?...'] },
      { K: ['X..x..x.X..x....'], S: ['........X.......', '........X..x....'], T: ['x.x.x.x.x...xxxx'], H: ['xxxxxxxxxxxxxxxx'], B: ['X.......X.......'] },
    ],
    ostIntro: [[0, null, null, null, null, null, 7, null]],
    ostB: [
      [
        [0, null, null, 7, null, null, 12, 11],
        [0, null, 7, null, 4, null, 2, null],
      ],
      [
        [0, null, 0, 1, null, 0, 8, 7],
        [0, 12, null, 7, null, 6, null, 7],
      ],
    ],
    progs: {
      intro: [[0, 1], [0]],
      A: [[0, 1, 0, 3], [0, 1, 5, 4], [0, 4, 1, 0]],
      A2: [[0, 3, 1, 4], [0, 5, 1, 1], [0, 1, 4, 5]],
      B: [[5, 1, 2, 4], [2, 5, 1, 1], [5, 4, 1, 3]],
      bridge: [[0, 1], [5, 1]],
      climax: [[0, 1, 3, 1], [0, 1, 4, 5], [0, 5, 1, 0]],
    },
    leads: { pool: ['choir', 'brass', 'celesta', 'glass'], intro: 'choir', soft: ['celesta', 'glass', 'choir'], strong: ['brass', 'choir'], arp: 'pluck' },
    color(sc, role) {
      const r = sc.pal.root;
      const fifths = (level: number) =>
        drone(sc, { notes: [r - 12, r - 5, r], count: 2, spread: 18, cutoff: 260, level, lfoRate: 0.025, lfoOct: 1.1 });
      switch (role) {
        case 'intro':
        case 'reentry':
          return [
            fifths(0.3),
            heartbeat(sc, { bpm: 44, note: 26, volume: -9 }),
            shimmer(sc, { density: 0.2, shift: true }),
            swells(sc, { prob: 0.3, every: 2, lo: r + 12, hi: r + 30 }),
          ];
        case 'A':
          return [choirChords(sc, { volume: -13, octave: 1, vowels: ['a', 'o', 'u', 'a'], unease: 0.3 }), shimmer(sc, { density: 0.22, shift: true })];
        case 'A2':
          return [choirChords(sc, { volume: -13, octave: 1, vowels: ['o', 'u'], unease: 0.3 }), shimmer(sc, { density: 0.2, shift: true })];
        case 'B':
          return [shimmer(sc, { density: 0.25, shift: true }), bells(sc, { notes: [12, 24], every: 9, strikes: [1, 2], volume: -15, hum: true })];
        case 'bridge':
          return [
            fifths(0.32),
            heartbeat(sc, { bpm: 48, note: 26, volume: -9 }),
            choirChords(sc, { volume: -14, octave: 1, vowels: ['u', 'o'], every: 4 }),
            shimmer(sc, { density: 0.2, shift: true }),
          ];
        case 'climax':
          return [
            choirChords(sc, { volume: -11.5, octave: 1, vowels: ['a', 'e'], unease: 0.35 }),
            shimmer(sc, { density: 0.3, shift: true }),
            bells(sc, { notes: [0, 12], every: 6, strikes: [1, 1], volume: -14, ring: 8, hum: true }),
          ];
        default:
          return [];
      }
    },
  },
};

/** 숨겨진 층의 영주 — 막과 무관하게 7/8, 오스티나토와 주제의 음마다 고정 미분음, 가라앉는 군집 드론 */
const LORD: SuiteAct = {
  bpm: 216,
  stepsPerBeat: 2,
  beatsPerBar: 7,
  kit: {
    patterns: {
      K: ['X..x..x.X.....', 'X..x....X..x..'],
      T: ['......x.....xo', '...o......x.x.'],
      S: ['....X......X..'],
      M: ['..?.......?...', 'x.......?.....'],
      B: ['X.............'],
      H: ['x.x.x.x.x.x.x.'],
    },
    fills: { K: 'X.xX.xX.x.xxxx', T: '......xxxxxxxx' },
    softHat: 'x...x...x.....',
    metalFreq: 140,
  },
  bossKit: {},
  intro: { B: ['X.............'], M: ['..?...........'], T: ['...........o.o'] },
  A2: { K: ['X.x...x.X..x..', 'X..x..x.X.x...'], S: ['....X......X..'], M: ['x.......x.....'] },
  B: [
    { K: ['X.............', 'X.......x.....'], S: ['........X.....'], T: ['...o......x.x.'], M: ['..?.......?...'] },
    { K: ['X...x...X.....'], T: ['..x...x...x.xx'], B: ['X.............'] },
  ],
  climax: [
    { K: ['X.xX.xX.X.x.xx', 'X..xX.x.X.xX..'], S: ['....X......X..', '....X..x...X.x'], T: ['x.o.x.o.x.o.xx'], H: ['xxxxxxxxxxxxxx'], M: ['x.......x.....'], B: ['X.......X.....'] },
  ],
  ost: [
    [0, 0, 1, 0, 6, 0, 1],
    [0, 6, 0, 1, 0, 11, 1],
    [0, null, 0, 1, 6, 1, 0],
  ],
  ostIntro: [[0, null, null, 1, null, null, null]],
  ostB: [
    [
      [0, null, 0, 6, null, 1, null],
      [0, 1, null, 0, 11, null, 6],
    ],
  ],
  micro: [0, 35, -25, 0, 45, -30, 15],
  stabHits: [0, 8],
  progs: {
    intro: [[0, 1], [0]],
    A: [[0, 1, 0, 6], [0, 6, 1, 0], [0, 4, 1, 0]],
    A2: [[0, 1, 4, 1], [0, 5, 1, 0]],
    B: [[5, 1, 6, 0], [3, 1, 0, 1]],
    bridge: [[0, 1], [5, 1]],
    climax: [[0, 1, 6, 1], [0, 1, 4, 1]],
  },
  leads: { pool: ['brass', 'pipe', 'choir', 'bell'], intro: 'pipe', soft: ['pipe', 'bell', 'choir'], strong: ['brass', 'choir'], arp: 'bell' },
  coreDrone: (rt) => sinkingDrone(rt),
  color(sc, role) {
    switch (role) {
      case 'intro':
      case 'reentry':
        return [
          choirChords(sc, { volume: -15, octave: 1, vowels: ['u', 'o'], unease: 0.5, every: 4 }),
          swells(sc, { prob: 0.3, every: 2 }),
          distantDrums(sc, { volume: -14 }),
        ];
      case 'A':
      case 'A2':
        return [choirChords(sc, { volume: -13, octave: 1, vowels: ['u', 'a', 'o', 'i'], unease: 0.5 }), swells(sc, { prob: 0.2, every: 4 })];
      case 'B':
        return [swells(sc, { prob: 0.35, every: 2 }), pipes(sc, { prob: 0.4, volume: -26 }), shimmer(sc, { density: 0.15, shift: true })];
      case 'bridge':
        return [
          choirChords(sc, { volume: -14, octave: 1, vowels: ['u', 'o'], unease: 0.6, every: 4 }),
          swells(sc, { prob: 0.4, every: 2 }),
          heartbeat(sc, { bpm: 50, volume: -12 }),
        ];
      case 'climax':
        return [choirChords(sc, { volume: -12, octave: 1, vowels: ['a', 'i'], unease: 0.55 }), swells(sc, { prob: 0.3, every: 2 })];
      default:
        return [];
    }
  },
};

// ===========================================================================
// 곡의 정체성 (씨앗 → 주제·악기·화성·템포)
// ===========================================================================

function makeSong(kind: SuiteKind, ai: number, suite: SuiteAct, rng: SeedRng): Song {
  const r = rng.fork('identity');
  const pool = suite.leads.pool;
  const A = r.pick(pool);
  const others = pool.filter((k) => k !== A);
  const A2 = others.length ? r.pick(others) : A;
  const B = others.length ? r.pick(others) : A;
  return {
    kind,
    ai,
    suite,
    rng,
    theme: makeTheme(rng.fork('theme'), suite.stepsPerBeat * suite.beatsPerBar),
    leads: { intro: suite.leads.intro, A, A2, B, bridge: r.pick(suite.leads.soft), climax: r.pick(suite.leads.strong), arp: suite.leads.arp },
    progIntro: r.pick(suite.progs.intro),
    progA: r.pick(suite.progs.A),
    progClimax: r.pick(suite.progs.climax),
    shift: r.pick([1, 2]),
    tempo: r.pick([0.96, 0.98, 1, 1.02, 1.04]),
    arpShape: r.pick(ARP_SHAPES),
  };
}

// ===========================================================================
// 구간 계획
// ===========================================================================

const P = (role: Role, bars: number): PlanItem => ({ role, bars });

function plan(kind: SuiteKind, ai: number, cycle: number, reentry: boolean, rng: SeedRng): PlanItem[] {
  const v = rng.fork(`plan|${cycle}`);
  const head: PlanItem[] = reentry ? [P('reentry', 4)] : cycle === 0 ? [P('intro', kind === 'elite' ? 4 : 8)] : [];
  if (kind === 'elite') {
    if (cycle === 0) return [...head, P('A', 8), P('B', 8), P('climax', 8), P('A2', 8)];
    return [
      ...head,
      ...v.pick([
        [P('B', 8), P('A2', 8), P('climax', 8), P('A', 8)],
        [P('A2', 8), P('B', 8), P('bridge', 4), P('climax', 8)],
      ]),
    ];
  }
  if (kind === 'lord') {
    if (cycle === 0) return [...head, P('A', 16), P('B', 8), P('bridge', 8), P('climax', 16)];
    return [
      ...head,
      ...v.pick([
        [P('A2', 16), P('B', 8), P('bridge', 8), P('climax', 16)],
        [P('B', 8), P('A', 16), P('bridge', 8), P('climax', 16)],
      ]),
    ];
  }
  // 최종장: 합창 음원과 번갈아 이어지므로 한 바퀴를 짧게
  if (ai >= 5) return [...head, P(cycle === 0 ? 'A' : 'A2', 16), P('B', 8), P('bridge', 8), P('climax', 16)];
  if (cycle === 0) return [...head, P('A', 16), P('B', 16), P('A2', 8), P('bridge', 8), P('climax', 16)];
  return [
    ...head,
    ...v.pick([
      [P('A2', 16), P('B', 16), P('bridge', 8), P('climax', 16)],
      [P('B', 16), P('A', 16), P('bridge', 8), P('climax', 16), P('A2', 8)],
      [P('A2', 8), P('B', 16), P('A', 8), P('bridge', 8), P('climax', 16)],
    ]),
  ];
}

// ===========================================================================
// 구간 만들기
// ===========================================================================

/** 바탕 드론의 구간별 음량 */
const DRONE: Record<Role, number> = { intro: 1, reentry: 1, bridge: 1, outro: 1, A: 0.7, A2: 0.7, B: 0.8, climax: 0.55 };

function enter(song: Song, rt: Runtime, sec: Section, t: number): void {
  const a = song.suite;
  const v = song.rng.fork(`enter|${sec.role}|${sec.cycle}|${sec.visit}`);
  let prog: readonly number[] = song.progA;
  let chordBars = 2;
  switch (sec.role) {
    case 'intro':
    case 'reentry':
      prog = song.progIntro;
      chordBars = 4;
      break;
    case 'A2':
      prog = v.pick(a.progs.A2);
      break;
    case 'B':
      prog = v.pick(a.progs.B);
      break;
    case 'bridge':
      prog = v.pick(a.progs.bridge);
      chordBars = 4;
      break;
    case 'climax':
      prog = sec.cycle === 0 && sec.visit === 0 ? song.progClimax : v.pick(a.progs.climax);
      break;
    case 'outro':
      prog = [0];
      chordBars = 4;
      break;
    default:
      break;
  }
  rt.chordBars = chordBars;
  rt.harmony.setProg(prog);
  // 두 번째 절정부터는 한두 음 올려서 (조옮김)
  rt.harmony.shift = sec.role === 'climax' && (sec.visit > 0 || sec.cycle > 0) ? song.shift : 0;
  const tempo = sec.role === 'climax' ? 1.04 : sec.role === 'bridge' ? 0.96 : 1;
  rt.setTempoMod(tempo, rt.barDur * (sec.role === 'climax' ? 2 : 1), t);
  song.drone?.fade(DRONE[sec.role], rt.barDur * 2, t);
}

/** 주제 변주 하나 (A') */
function variation(th: Theme, v: SeedRng): ThemeNote[] {
  const spb = th.spb;
  switch (v.pick(['inv', 'retro', 'seq', 'disp', 'aug'] as const)) {
    case 'inv':
      return invert(th.notes);
    case 'retro':
      return [...retro(slice(th, 0, 4)), ...slice(th, 4, 8).map((n) => ({ ...n, at: n.at + 4 * spb }))];
    case 'seq':
      return [...slice(th, 0, 4), ...transpose(slice(th, 4, 8), v.pick([1, 2, -1])).map((n) => ({ ...n, at: n.at + 4 * spb }))];
    case 'disp':
      return displace(th.notes, v.pick([2, 4]), th.bars * spb);
    case 'aug':
    default:
      return stretch(slice(th, 0, 4), 2);
  }
}

/** 구간 시작 후 fromBar 마디부터만 진행하는 레이어 */
function gate(rt: Runtime, sec: Section, l: Layer, fromBar: number): Layer {
  const first = sec.start + fromBar * rt.stepsPerBar;
  return { ...l, step: (t, s) => (s >= first ? l.step?.(t, s) : undefined) };
}

function buildSection(song: Song, sc: Runtime, sec: Section): Layer[] {
  const { suite: a, kind } = song;
  const role = sec.role;
  const v = song.rng.fork(`${role}|${sec.cycle}|${sec.visit}`);
  const spb = sc.stepsPerBar;
  const start = sec.start;
  const L: Layer[] = [];
  const fillWhen = (bar: number) => {
    const k = bar - sec.startBar;
    return k === sec.bars - 1 || k % 8 === 7;
  };
  const kit = (patterns: Pats, extra: Partial<KitOpts> = {}): Layer => drumKit(sc, { ...a.kit, patterns, fillWhen, ...extra });
  const ost = (patterns: Ost, o: Partial<OstinatoOpts> = {}): Layer => ostinato(sc, { patterns, grid: 2, micro: a.micro, ...o });

  // --- 리듬 (드럼 + 저음 오스티나토)
  switch (role) {
    case 'intro':
    case 'reentry':
      L.push(kit(a.intro, { softHat: undefined, hatFrom: 2 }));
      if (sec.bars > 4 || role === 'reentry') L.push(gate(sc, sec, ost(a.ostIntro, { volume: -13, doubleFrom: 2, fillFrom: 2 }), role === 'intro' ? 4 : 1));
      break;
    case 'A':
      L.push(kit({ ...a.kit.patterns, ...(kind === 'elite' ? {} : a.bossKit) }, { hatFrom: kind === 'elite' ? 0.4 : 0.3 }));
      L.push(ost(a.ost, { type: 'fatsawtooth', volume: -10, doubleFrom: kind === 'elite' ? 0.45 : 0.25, fillFrom: 0.5 }));
      break;
    case 'A2':
      L.push(kit({ ...a.kit.patterns, ...a.A2 }, { hatFrom: 0.3 }));
      L.push(ost(v.shuffle(a.ost), { type: 'fatsawtooth', volume: -10, doubleFrom: 0.3, fillFrom: 0.5 }));
      break;
    case 'B':
      L.push(kit(v.pick(a.B), { hatFrom: 0.5 }));
      L.push(ost(v.pick(a.ostB), { type: 'sawtooth', volume: -11, doubleFrom: 0.45, fillFrom: 0.75 }));
      break;
    case 'climax':
      L.push(kit({ ...a.kit.patterns, ...v.pick(a.climax) }, { hatFrom: 0 }));
      L.push(ost(a.ost, { type: 'fatsawtooth', volume: -9.5, doubleFrom: 0, fillFrom: 0.2 }));
      break;
    case 'bridge':
      L.push(toll(sc, { start, every: 2, volume: -9 }));
      break;
    default:
      break;
  }

  // --- 주제 선율
  const th = song.theme;
  const span = th.bars * spb;
  const lead = (k: LeadKind, vol = 0) => makeLead(sc, k, vol + (kind === 'elite' ? -2 : 0));
  const micro = a.micro;
  switch (role) {
    case 'intro': {
      const notes = sec.bars >= 8 ? stretch(slice(th, 0, 2), 2) : slice(th, 0, 2);
      L.push(line(sc, lead(song.leads.intro, -2), { notes, start, offset: (sec.bars >= 8 ? 2 : 1) * spb, vel: [0.42, 0.55], legato: 0.97, fit: true, micro, vowels: ['u'] }));
      break;
    }
    case 'reentry':
      L.push(line(sc, lead(song.leads.bridge, -2), { notes: slice(th, 0, 2), start, offset: spb, vel: [0.38, 0.5], fit: true, micro, vowels: ['o'] }));
      break;
    case 'A': {
      const l1 = lead(song.leads.A);
      L.push(line(sc, l1, { notes: th.notes, start, period: span, times: Math.max(1, Math.floor(sec.bars / th.bars)), fit: true, micro, vowels: ['a', 'o'] }));
      if (sec.bars >= 16) {
        // 두 번째에는 다른 악기가 한 옥타브 위에서 겹친다
        const l2 = lead(song.leads.A2, -5);
        L.push(line(sc, l2, { notes: th.notes, start, offset: span, octave: l1.base + 12 - l2.base, fit: true, micro, vel: [0.4, 0.52], vowels: ['e'] }));
      }
      break;
    }
    case 'A2': {
      const l1 = lead(song.leads.A2);
      L.push(line(sc, l1, { notes: variation(th, v), start, fit: true, micro, vel: [0.48, 0.6], vowels: ['o', 'a'] }));
      if (sec.bars >= 16) {
        const l2 = lead(song.leads.A, -1);
        L.push(line(sc, l2, { notes: th.notes, start, offset: span, fit: true, micro, vowels: ['a'] }));
      }
      break;
    }
    case 'B': {
      // 동기 조각을 두 악기가 주고받는다 (화음을 따라 반복진행) + 아르페지오
      const cell = slice(th, 0, 2);
      const call = lead(song.leads.B);
      const resp = lead(song.leads.A, -4);
      L.push(line(sc, call, { notes: cell, start, period: 4 * spb, rel: 'chord', fit: true, micro, vel: [0.45, 0.58], vowels: ['o', 'u'] }));
      L.push(line(sc, resp, { notes: invert(cell), start, offset: 2 * spb, period: 4 * spb, rel: 'chord', thin: 0.15, fit: true, micro, vel: [0.36, 0.5], vowels: ['a'] }));
      const al = lead(song.leads.arp, -7);
      const lo = sc.pal.root + al.base;
      L.push(arp(sc, al, { start, pattern: song.arpShape, grid: 2, lo, hi: lo + 17, from: 2 }));
      break;
    }
    case 'bridge':
      L.push(line(sc, lead(song.leads.bridge, -2), { notes: stretch(slice(th, 0, 4), 2), start, vel: [0.38, 0.5], legato: 0.97, fit: true, micro, vowels: ['u', 'o'] }));
      break;
    case 'climax': {
      const l1 = lead(song.leads.climax, 1);
      L.push(
        line(sc, l1, {
          notes: th.notes,
          start,
          period: span,
          times: Math.max(1, Math.floor(sec.bars / th.bars)),
          fit: true,
          micro,
          vel: [0.6, 0.74],
          vowels: ['a', 'e'],
        }),
      );
      if (sec.bars >= 16) {
        const l2 = lead(song.leads.A, -4);
        L.push(line(sc, l2, { notes: th.notes, start, offset: span, octave: l1.base + 12 - l2.base, fit: true, micro, vel: [0.42, 0.55], vowels: ['i'] }));
      }
      break;
    }
    default:
      break;
  }

  // --- 금관 스탭
  const cluster = kind !== 'boss' || song.ai >= 4;
  if (role === 'A') L.push(stabs(sc, { hits: a.stabHits.slice(0, 1), every: 2, cluster, volume: -14 }));
  else if (role === 'A2') L.push(stabs(sc, { hits: a.stabHits, every: 2, cluster, volume: -14 }));
  else if (role === 'climax') L.push(stabs(sc, { hits: a.stabHits, every: 1, cluster, volume: -12.5 }));
  else if (role === 'outro') L.push(stabs(sc, { hits: [0], every: 4, prob: 2, hold: 3.2, cluster, volume: -12 }));

  // --- 막 질감
  L.push(...a.color(sc, role));
  return L;
}

// ===========================================================================
// 팩토리
// ===========================================================================

/** 무드 전체 음량 보정(dB) — 오프라인 렌더로 잰 K-가중 음량을 보스·영주 -17.5, 정예 -18.5 근처로 */
const GAIN: Record<SuiteKind, readonly number[]> = {
  boss: [-0.5, -0.5, -0.5, -0.5, 0.5],
  elite: [-0.8, -0.8, -0.8, -0.8, -0.8],
  lord: [-0.5, -0.5, -0.5, -0.5, -0.5],
};

/**
 * 구간 음량 보정(dB) — 구간별 K-가중 음량을 도입·숨 고르기 ≈ -21, B ≈ -18.5, A ≈ -17.5, 절정 ≈ -16 으로
 * (오프라인 렌더 측정. 막 질감마다 두께가 달라서 막별로)
 */
const ROLE_DB: Record<number, Partial<Record<Role, number>>> = {
  1: { A: -0.7, A2: -0.4, B: -1, climax: -0.6, bridge: 1.3 },
  2: { intro: -3.4, reentry: -3.4, A: 0.4, A2: -0.5, B: -0.5, climax: -1.3, bridge: -5.5 },
  3: { intro: 0.8, reentry: 0.8, A: 0.9, A2: 0.9, B: 1.2, climax: 0.6, bridge: -0.6 },
  4: { intro: 0.9, reentry: 0.9, B: -0.6, climax: -1.3 },
  5: { intro: -1.7, reentry: -1.7, A: -0.3, B: 1.2, climax: -0.4, bridge: -5.2 },
};
const LORD_DB: Partial<Record<Role, number>> = { intro: -1, reentry: -1, B: 0.5, bridge: -2, climax: -1.2 };

function songFactory(kind: SuiteKind): SongFactory {
  return (env, o) => {
    const ai = clamp(Math.round(env.act), 1, 5);
    const suite = kind === 'lord' ? LORD : SUITES[ai];
    const rng = new SeedRng(`${kind}|${ai}|${env.seed ?? ''}`);
    const song = makeSong(kind, ai, suite, rng);
    const mult = kind === 'boss' ? 1.12 : kind === 'elite' ? 1.06 : 1;
    return createMood(env, {
      bpm: suite.bpm * mult * song.tempo,
      stepsPerBeat: suite.stepsPerBeat,
      beatsPerBar: suite.beatsPerBar,
      chordBars: 2,
      rhythmic: true,
      tempoGain: kind === 'boss' ? 0.1 : kind === 'lord' ? 0.08 : 0.06,
      gain: GAIN[kind][ai - 1],
      palette: kind === 'lord' ? (p) => ({ ...p, micro: p.micro + 18 }) : undefined,
      build: (rt) => {
        const fx = transitions(rt);
        // 바탕 드론: 곡 내내 살고 구간마다 음량만 바뀐다
        const ds = rt.fork();
        song.drone = ds;
        const core = suite.coreDrone
          ? suite.coreDrone(ds.rt)
          : drone(ds.rt, { notes: [0, 7], follow: true, octave: -1, cutoff: 150, level: 0.4, sends: { dry: 1, verb: 0.15 } });
        const spec: FormSpec = {
          cycle: o.cycle,
          reentry: o.reentry,
          plan: (c, re) => plan(kind, ai, c, re, rng),
          enter: (sec, t) => enter(song, rt, sec, t),
          build: (sc, sec) => buildSection(song, sc, sec),
          tail: (sec) => (sec.role === 'bridge' || sec.role === 'intro' || sec.role === 'reentry' ? 2.5 : 1.2),
          level: (sec) => dbToGain((kind === 'lord' ? LORD_DB : ROLE_DB[ai])[sec.role] ?? 0),
          climaxBars: kind === 'elite' ? 8 : 16,
          hooks: o.hooks,
        };
        return [director(rt, spec, fx), fx, core];
      },
    });
  };
}

export const bossSong = songFactory('boss');
export const eliteSong = songFactory('elite');
export const lordSong = songFactory('lord');

/** 메들리 없이 쓸 때 (음원이 없거나 정예·영주) — 바퀴가 끝나면 다른 변주로 계속 이어진다 */
export const boss: MoodFactory = (env) => bossSong(env, { cycle: 0, reentry: false });
export const elite: MoodFactory = (env) => eliteSong(env, { cycle: 0, reentry: false });
export const lord: MoodFactory = (env) => lordSong(env, { cycle: 0, reentry: false });
