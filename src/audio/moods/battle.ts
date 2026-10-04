import { FatOscillator, Filter, Gain } from 'tone';
import { MODES, clamp, mtof, rand } from '../scales';
import { choir, fmKeys, type Vowel } from './instruments';
import { bells, chords, drone, melody, pad, pipes, shimmer, swells } from './layers';
import { drumKit, glassArp, ostinato, riser, stabs, type DrumVoice, type KitOpts, type OstinatoOpts } from './rhythm';
import { createMood, type Layer, type MoodFactory, type Runtime } from './runtime';

type Kind = 'combat' | 'elite' | 'boss';

interface BattleAct {
  /** 일반 전투 템포 */
  bpm: number;
  stepsPerBeat?: number;
  beatsPerBar?: number;
  kit: KitOpts;
  /** 보스전에서 덮어쓰거나 추가할 패턴 */
  bossKit: Partial<Record<DrumVoice, readonly string[]>>;
  ost: OstinatoOpts['patterns'];
  stabHits: readonly number[];
  color(rt: Runtime, kind: Kind): Layer[];
}

// ---------------------------------------------------------------------------
// 공용 레이어
// ---------------------------------------------------------------------------

/** 템포가 술 취한 듯 일렁인다 (꿈/균열) */
export function tempoDrift(rt: Runtime, range: number, everyBars = 2): Layer {
  return {
    step(t, s) {
      if (s === 0 || !rt.isBar(s, everyBars)) return;
      rt.setTempoMod(1 + rand(-range, range), rt.barDur * rand(0.5, 1.5), t);
    },
  };
}

/** 합창 화음 + 모음 변화 */
function choirChords(rt: Runtime, o: { volume: number; octave: number; vowels: readonly Vowel[]; unease?: number; every?: number }): Layer {
  const ch = choir(rt, { volume: o.volume, attack: 0.9, release: 2.2 });
  rt.route(ch.output, { dry: 1, verb: 0.75 });
  let vi = 0;
  return chords(rt, ch.synth, {
    size: 3,
    octave: o.octave,
    every: o.every,
    vel: [0.35, 0.5],
    unease: o.unease ?? 0.1,
    onChord: (t) => ch.setVowel(o.vowels[vi++ % o.vowels.length], t, 1.4),
  });
}

/** 반음 군집 드론이 8마디에 걸쳐 가라앉았다 되돌아온다 (영주) */
function sinkingDrone(rt: Runtime, level = 0.35): Layer {
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 240, Q: 1.2, rolloff: -24 }));
  const amp = rt.bag.add(new Gain(level));
  lp.connect(amp);
  rt.route(amp, { dry: 1, verb: 0.2 });
  const notes = [rt.pal.root - 12, rt.pal.root - 11, rt.pal.root - 6];
  const oscs = notes.map((m) => {
    const o = rt.bag.add(new FatOscillator({ frequency: mtof(m), type: 'sawtooth', count: 2, spread: 24 }));
    o.connect(lp);
    return o;
  });
  return {
    start(t) {
      for (const o of oscs) o.start(t);
    },
    step(t, s) {
      if (!rt.isBar(s, 8)) return;
      const len = rt.barDur * 8;
      oscs.forEach((o, i) => {
        const f = mtof(notes[i]);
        o.frequency.cancelAndHoldAtTime(t);
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -1.2 / 12), t + len - 0.05);
      });
    },
    stop(t) {
      for (const o of oscs) o.stop(t);
    },
    intensity(x, t) {
      lp.frequency.rampTo(240 * (1 + x * 1.5), 2, t);
    },
  };
}

// ---------------------------------------------------------------------------
// 막별 전투 설정
// ---------------------------------------------------------------------------

const ACTS: Record<number, BattleAct> = {
  // 1막: 항구 뒷골목 난투 — 통 북, 쇠사슬, 낡은 피아노
  1: {
    bpm: 100,
    kit: {
      patterns: {
        K: ['X.....x...x.....', 'X.....x.x...x...', 'X..x..x...x.....'],
        T: ['....x.......x.o.', '..o.x.....o.x...'],
        S: ['....X.......X...', '....X.....o.X...'],
        H: ['x.x.x.x.x.x.x.x.', 'x.xxx.x.x.xxx.x.'],
        M: ['.........?......', '...?.......?....'],
      },
      fills: { K: 'X...x...x.x.x.xx', T: '........x.x.xxxx', S: '....X.......X.X.' },
      softHat: '..o.......o.....',
      metalFreq: 210,
    },
    bossKit: {
      K: ['X..x..x.X..x..x.', 'X.....x.X.x...x.'],
      B: ['X.......X.......', 'X...............'],
      M: ['...?...?...?...?'],
    },
    ost: [
      [0, 0, 12, 0, 7, 0, 8, 7],
      [0, 0, 3, 0, 7, 0, 5, 3],
      [0, null, 0, 12, 0, 10, 8, 7],
    ],
    stabHits: [0, 6, 10],
    color(rt, kind) {
      const keys = fmKeys(rt, { bright: 2.6, ring: 1.4, volume: -18 });
      rt.route(keys, { dry: 0.8, verb: 0.5, echo: 0.2 });
      return [
        pad(rt, {
          type: 'fatsawtooth',
          count: 2,
          spread: 18,
          cutoff: 700,
          attack: 1.4,
          release: 2.2,
          volume: kind === 'combat' ? -25 : -22,
          octave: 1,
          unease: kind === 'elite' ? 0.3 : 0.08,
          sends: { dry: 1, verb: 0.4 },
        }),
        // 조율 안 된 피아노 조각
        melody(rt, keys, {
          lo: rt.pal.root + 26,
          hi: rt.pal.root + 41,
          grid: 2,
          density: 0.3,
          phrase: [1, 2],
          rest: [1, 3],
          detune: 1.8,
          vel: [0.3, 0.6],
          dyad: 0.3,
        }),
      ];
    },
  },
  // 2막: 의식 — 틀북, 합창, 종
  2: {
    bpm: 94,
    kit: {
      patterns: {
        K: ['X.......X..x....', 'X..x....X.......', 'X.......X.x.x...'],
        T: ['....x..o....x..o', '......x.....x.x.'],
        S: ['....X.......X...', '....X..o....X...'],
        H: ['x.x.x.x.x.x.x.x.'],
      },
      fills: { K: 'X..x...xX.x.x.xx', T: '....x.x.x.x.xxxx' },
      softHat: '..o...o...o...o.',
    },
    bossKit: {
      K: ['X..x....X..x..x.', 'X.x.....X..x....'],
      B: ['X.......X.......'],
      M: ['X...............'],
    },
    ost: [
      [0, 1, 0, 0, 7, 8, 7, 1],
      [0, 0, 1, 0, 0, 3, 1, 0],
      [0, 12, 1, 0, 8, 7, 1, null],
    ],
    stabHits: [0, 8],
    color(rt, kind) {
      return [
        choirChords(rt, { volume: kind === 'combat' ? -15 : -12, octave: 2, vowels: ['a', 'o', 'a', 'e'], unease: kind === 'combat' ? 0.1 : 0.3 }),
        bells(rt, { notes: [12, 24], every: kind === 'boss' ? 7 : 13, strikes: [1, 2], gap: 1.6, volume: -16, hum: true }),
      ];
    },
  },
  // 3막: 꿈속 전투 — 엇박, 유리 아르페지오, 일렁이는 템포
  3: {
    bpm: 106,
    kit: {
      patterns: {
        K: ['X..x..X...x.....', 'X...x..x..X..x..'],
        T: ['..o...x...o...x.', '......x..o....x.'],
        S: ['....X....o..X...', '....X.......X.o.'],
        H: ['xoxoxoxoxoxoxoxo'],
      },
      fills: { K: 'X..x..x..x..x.xx', S: '....X..X..X.X.X.' },
      softHat: '.o..o..o..o..o..',
    },
    bossKit: {
      K: ['X..x..X..x..x...', 'X...x..xX..x..x.'],
      B: ['X.........X.....'],
    },
    ost: [
      [0, 4, 8, 6, 2, 4, 0, 10],
      [0, 0, 6, 0, 4, 0, 8, 2],
      [0, 2, 4, 6, 8, 6, 4, 2],
    ],
    stabHits: [0, 10],
    color(rt, kind) {
      return [
        pad(rt, {
          type: 'fattriangle',
          count: 3,
          spread: 30,
          cutoff: 1500,
          attack: 1,
          release: 2,
          volume: -24,
          octave: 2,
          chorus: true,
          sends: { dry: 0.8, verb: 0.7, echo: 0.2 },
        }),
        glassArp(rt, { density: kind === 'combat' ? 0.45 : 0.62 }),
        swells(rt, { prob: 0.2, every: 2 }),
        tempoDrift(rt, kind === 'boss' ? 0.03 : 0.05),
      ];
    },
  },
  // 4막: 별들의 궁정 — 7/8, 반음 군집, 피리
  4: {
    bpm: 210,
    stepsPerBeat: 2,
    beatsPerBar: 7,
    kit: {
      patterns: {
        K: ['X...x...X.....', 'X...x...x...x.', 'X.x.....X.x...'],
        T: ['......x.....o.', '..o.......x.x.'],
        S: ['....X.......x.', '....X...o...X.'],
        H: ['x.x.x.x.x.x.x.'],
        M: ['..........?...'],
      },
      fills: { K: 'X.x.X.x.X.x.xx', T: '........xxxxxx' },
      softHat: 'x...x...x.....',
      metalFreq: 150,
    },
    bossKit: {
      K: ['X.x.x...X.x.x.', 'X...x.x.X...x.'],
      B: ['X.......X.....'],
      M: ['..?.......?...'],
    },
    ost: [
      [0, 0, 6, 0, 1, 0, 6],
      [0, 1, 0, 6, 0, 1, 3],
      [0, null, 0, 6, 1, 0, -1],
    ],
    stabHits: [0, 8],
    color(rt, kind) {
      return [
        drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 11], cutoff: 200, level: 0.32, spread: 22, sends: { dry: 1, verb: 0.2 } }),
        pipes(rt, { prob: kind === 'combat' ? 0.35 : 0.55, noteSteps: 2, volume: -25 }),
        shimmer(rt, { density: 0.12 }),
      ];
    },
  },
  // 최종: 잠든 자 — 무거운 하프타임, 낮은 합창, 군집
  5: {
    bpm: 84,
    kit: {
      patterns: {
        K: ['X.......X.x.....', 'X.....x.X.......'],
        B: ['X...............'],
        T: ['........x.....x.'],
        S: ['........X.......', '........X.....o.'],
        H: ['.x.x.x.x.x.x.x.x'],
        M: ['....?.......?...'],
      },
      fills: { K: 'X...X...X.X.XXXX', T: '....x.x.xxx.xxxx' },
      softHat: '........o.......',
      metalFreq: 120,
    },
    bossKit: {
      K: ['X..x....X.x..x..', 'X.....x.X..x....'],
      B: ['X.......X.......'],
    },
    ost: [
      [0, 1, 4, 1, 0, 8, 7, 1],
      [0, 0, 1, 0, 11, 0, 8, 7],
    ],
    stabHits: [0, 8],
    color(rt, kind) {
      return [
        choirChords(rt, { volume: -13, octave: 1, vowels: ['u', 'o', 'u', 'a'], unease: 0.35 }),
        pipes(rt, { prob: kind === 'boss' ? 0.5 : 0.3, volume: -26 }),
        drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 11, rt.pal.root - 5], cutoff: 180, level: 0.35, spread: 26, sends: { dry: 1, verb: 0.2 } }),
      ];
    },
  },
};

function battle(kind: Kind): MoodFactory {
  return (env) => {
    const act = ACTS[clamp(Math.round(env.act), 1, 5)];
    const mult = kind === 'boss' ? 1.12 : kind === 'elite' ? 1.06 : 1;
    return createMood(env, {
      bpm: act.bpm * mult,
      stepsPerBeat: act.stepsPerBeat ?? 4,
      beatsPerBar: act.beatsPerBar ?? 4,
      chordBars: 2,
      rhythmic: true,
      tempoGain: kind === 'boss' ? 0.1 : 0.06,
      build: (rt) => {
        const kit: KitOpts =
          kind === 'boss'
            ? { ...act.kit, patterns: { ...act.kit.patterns, ...act.bossKit }, hatFrom: 0.3 }
            : { ...act.kit, hatFrom: kind === 'elite' ? 0.4 : 0.55 };
        const layers: Layer[] = [
          drumKit(rt, kit),
          ostinato(rt, {
            patterns: act.ost,
            grid: 2,
            doubleFrom: kind === 'boss' ? 0.25 : kind === 'elite' ? 0.45 : 0.65,
            fillFrom: kind === 'boss' ? 0.5 : 0.75,
            type: kind === 'boss' ? 'fatsawtooth' : 'sawtooth',
            volume: kind === 'boss' ? -10 : -11,
          }),
          riser(rt, {
            phraseBars: kind === 'boss' ? 4 : 8,
            beats: kind === 'boss' ? 4 : 2,
            from: kind === 'combat' ? 0.2 : 0,
            prob: kind === 'boss' ? 0.9 : 0.6,
            pitched: kind !== 'combat',
            impact: kind !== 'combat',
          }),
          ...act.color(rt, kind),
        ];
        if (kind !== 'combat') {
          layers.push(
            stabs(rt, {
              hits: kind === 'boss' ? act.stabHits : act.stabHits.slice(0, 1),
              every: kind === 'boss' ? 1 : 2,
              cluster: kind === 'elite' || rt.pal.act >= 4,
              volume: kind === 'boss' ? -13 : -15,
            }),
          );
        }
        if (kind === 'boss') {
          layers.push(drone(rt, { notes: [0, 7], follow: true, octave: -1, cutoff: 150, level: 0.4, sends: { dry: 1, verb: 0.15 } }));
        }
        return layers;
      },
    });
  };
}

export const combat = battle('combat');
export const elite = battle('elite');
export const boss = battle('boss');

/** 숨겨진 층의 영주 — 7/8, 고정 미분음 오스티나토, 가라앉는 드론 */
export const lord: MoodFactory = (env) =>
  createMood(env, {
    bpm: 216,
    stepsPerBeat: 2,
    beatsPerBar: 7,
    chordBars: 2,
    rhythmic: true,
    tempoGain: 0.08,
    palette: (p) => ({ ...p, micro: p.micro + 18 }),
    build: (rt) => [
      drumKit(rt, {
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
        hatFrom: 0.4,
        metalFreq: 140,
      }),
      ostinato(rt, {
        patterns: [
          [0, 0, 1, 0, 6, 0, 1],
          [0, 6, 0, 1, 0, 11, 1],
          [0, null, 0, 1, 6, 1, 0],
        ],
        grid: 2,
        micro: [0, 35, -25, 0, 45, -30, 15],
        doubleFrom: 0.35,
        type: 'fatsawtooth',
      }),
      sinkingDrone(rt),
      choirChords(rt, { volume: -13, octave: 1, vowels: ['u', 'a', 'o', 'i'], unease: 0.5 }),
      swells(rt, { prob: 0.3, every: 2 }),
      stabs(rt, { hits: [0, 8], every: 2, cluster: true, volume: -14 }),
      riser(rt, { phraseBars: 4, beats: 4, pitched: true, impact: true, prob: 0.8 }),
    ],
  });

/** 차원의 균열 — 5/4, 일렁이는 템포, 주파수 시프트된 북, 온음음계 */
export const rift: MoodFactory = (env) =>
  createMood(env, {
    bpm: 112,
    stepsPerBeat: 4,
    beatsPerBar: 5,
    chordBars: 1,
    rhythmic: true,
    tempoGain: 0.08,
    wander: true,
    palette: (p) => ({ ...p, mode: MODES.wholeTone, micro: Math.max(p.micro, 20) + 10, bright: 1.1 }),
    build: (rt) => [
      drumKit(rt, {
        warp: true,
        patterns: {
          K: ['X....x....X..x......', 'X..x......X....x....'],
          T: ['.....o....x.......x.', '...x......o...x.....'],
          S: ['.....X.........X....'],
          H: ['x.x.x.x.x.x.x.x.x.x.'],
          B: ['X.........X.........'],
        },
        softHat: 'x...x...x...x...x...',
        hatFrom: 0.45,
      }),
      ostinato(rt, {
        patterns: [
          [0, 6, 0, 4, 8, 0, 10, 6, 2, 4],
          [0, null, 6, 0, 4, null, 8, 6, 0, 2],
        ],
        grid: 2,
        doubleFrom: 0.5,
        type: 'square',
        volume: -13,
      }),
      glassArp(rt, { density: 0.5 }),
      shimmer(rt, { density: 0.25, shift: true }),
      swells(rt, { prob: 0.35, every: 1 }),
      tempoDrift(rt, 0.14, 2),
      pad(rt, {
        type: 'fatsine',
        count: 3,
        spread: 40,
        cutoff: 2000,
        attack: 0.8,
        release: 1.5,
        volume: -24,
        octave: 2,
        chorus: true,
        every: 1,
      }),
    ],
  });
