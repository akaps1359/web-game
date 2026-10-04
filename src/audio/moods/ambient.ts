import { Filter, NoiseSynth, Vibrato } from 'tone';
import { MODES, chance, clamp, mtof, pick, rand, randInt, type Palette } from '../scales';
import { EXP, brass, choir, fmBell, fmKeys, padSynth, pluck, type Vowel } from './instruments';
import {
  bells,
  chords,
  distantDrums,
  drips,
  drone,
  fire,
  foghorn,
  heartbeat,
  melody,
  pad,
  pipes,
  sea,
  shimmer,
  swells,
  voiceLead,
  wind,
  type Playable,
} from './layers';
import { tempoDrift } from './battle';
import { createMood, type Layer, type MoodFactory, type Runtime } from './runtime';

const actOf = (a: number): number => clamp(Math.round(a), 1, 5);

/** 합창 화음 (모음이 천천히 바뀜) */
function hum(rt: Runtime, o: { volume: number; octave: number; vowels: readonly Vowel[]; every?: number; unease?: number }): Layer {
  const ch = choir(rt, { volume: o.volume, attack: 2.2, release: 3.5, vibrato: 0.09 });
  rt.route(ch.output, { dry: 0.9, verb: 0.8 });
  let vi = 0;
  return chords(rt, ch.synth, {
    size: 3,
    octave: o.octave,
    every: o.every,
    vel: [0.3, 0.45],
    overlap: 1.2,
    unease: o.unease ?? 0,
    onChord: (t) => ch.setVowel(o.vowels[vi++ % o.vowels.length], t, 3),
  });
}

/** 피아노 같은 선율 레이어 */
function keysMelody(rt: Runtime, o: { lo: number; hi: number; grid?: number; density?: number; volume?: number; ring?: number; rest?: readonly [number, number] }): Layer {
  const keys = fmKeys(rt, { ring: o.ring ?? 3.2, volume: o.volume ?? -13, bright: 1.3 });
  rt.route(keys, { dry: 0.8, verb: 0.65, echo: 0.22 });
  return melody(rt, keys, {
    lo: o.lo,
    hi: o.hi,
    grid: o.grid ?? rt.stepsPerBeat,
    density: o.density ?? 0.38,
    phrase: [2, 4],
    rest: o.rest ?? [2, 5],
    dyad: 0.2,
    vel: [0.22, 0.5],
    startResting: true,
  });
}

// ===========================================================================
// EXPLORE — 막별 탐험
// ===========================================================================

export const explore: MoodFactory = (env) => {
  const act = actOf(env.act);
  switch (act) {
    case 1:
      // 안개 낀 항구의 침수된 지하: 파도, 물방울, 우울한 피아노, 먼 무적
      return createMood(env, {
        bpm: 58,
        chordBars: 4,
        build: (rt) => [
          sea(rt, { level: 0.32, cutoff: 340 }),
          drips(rt, { every: 2.8 }),
          drone(rt, { notes: [0, 7], follow: true, cutoff: 230, level: 0.26, lfoRate: 0.035 }),
          pad(rt, { type: 'fattriangle', count: 2, spread: 12, cutoff: 900, attack: 3.5, release: 5, volume: -23, octave: 1, every: 4, color: 0.3 }),
          keysMelody(rt, { lo: rt.pal.root + 24, hi: rt.pal.root + 43 }),
          foghorn(rt, { every: 30 }),
        ],
      });
    case 2:
      // 가라앉은 수도원: 오르간 드론, 합창, 종, 홀로 부르는 성가
      return createMood(env, {
        bpm: 52,
        chordBars: 4,
        build: (rt) => {
          const cantor = choir(rt, { volume: -12, attack: 0.35, release: 2.2, vibrato: 0.14, vowel: 'o' });
          rt.route(cantor.output, { dry: 0.8, verb: 0.9, echo: 0.15 });
          return [
            sea(rt, { level: 0.16, cutoff: 190 }),
            drone(rt, { notes: [rt.pal.root, rt.pal.root + 7, rt.pal.root + 12], type: 'triangle', count: 2, spread: 6, cutoff: 650, level: 0.3, lfoRate: 0.02, lfoOct: 0.5 }),
            hum(rt, { volume: -13, octave: 2, vowels: ['o', 'a', 'u', 'a'], every: 4 }),
            bells(rt, { notes: [12, 19, 24], every: 16, strikes: [1, 3], gap: 2.6, volume: -15, hum: true }),
            melody(rt, cantor.synth, {
              lo: rt.pal.root + 19,
              hi: rt.pal.root + 31,
              grid: rt.stepsPerBeat,
              density: 0.6,
              phrase: [2, 3],
              rest: [3, 6],
              hold: 0.9,
              vel: [0.3, 0.45],
              leap: 0.04,
              startResting: true,
            }),
            drips(rt, { every: 5 }),
          ];
        },
      });
    case 3:
      // 꿈의 경계: 떠도는 온음 화성, 유리 오르골, 역재생 스웰, 공기
      return createMood(env, {
        bpm: 66,
        chordBars: 2,
        build: (rt) => {
          const glass = fmBell(rt, { harmonicity: 5.01, index: 2.5, ring: 2.6, shine: 0.5, volume: -17 });
          rt.route(glass, { dry: 0.6, verb: 0.7, echo: 0.55 });
          return [
            pad(rt, { type: 'fatsine', count: 3, spread: 35, cutoff: 2400, attack: 2.5, release: 4, volume: -22, octave: 2, chorus: true }),
            shimmer(rt, { density: 0.22, shift: true }),
            melody(rt, glass, { lo: rt.pal.root + 36, hi: rt.pal.root + 55, grid: 2, density: 0.3, phrase: [1, 3], rest: [1, 3], detune: 1.2 }),
            swells(rt, { prob: 0.3, every: 2 }),
            wind(rt, { level: 0.18, freq: 1400, q: 2.2, rate: 0.03 }),
            drone(rt, { notes: [rt.pal.root - 12], type: 'sine', count: 2, spread: 10, cutoff: 400, level: 0.3 }),
            tempoDrift(rt, 0.04, 2),
          ];
        },
      });
    case 4:
      // 별들의 궁정: 거대한 반음 군집, 저주받은 피리, 먼 북, 별빛
      return createMood(env, {
        bpm: 54,
        chordBars: 4,
        build: (rt) => [
          drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 11, rt.pal.root - 5], count: 3, spread: 24, cutoff: 260, level: 0.36, lfoRate: 0.02, lfoOct: 1 }),
          pipes(rt, { prob: 0.5, volume: -23 }),
          distantDrums(rt, { volume: -13 }),
          shimmer(rt, { density: 0.15 }),
          pad(rt, { type: 'fatsawtooth', count: 2, cutoff: 600, octave: 1, unease: 0.4, volume: -26, attack: 4, release: 6, every: 4 }),
          wind(rt, { level: 0.14, freq: 300, q: 3, rate: 0.02, type: 'white' }),
        ],
      });
    default:
      // 잠든 자의 무덤: 압도적인 군집, 거대한 심장박동, 낮은 합창
      return createMood(env, {
        bpm: 48,
        chordBars: 2,
        build: (rt) => [
          drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 11, rt.pal.root - 5, rt.pal.root], count: 3, spread: 30, cutoff: 220, level: 0.4, lfoRate: 0.025, lfoOct: 1.1 }),
          heartbeat(rt, { bpm: 44, note: 26, volume: -7 }),
          hum(rt, { volume: -12, octave: 1, vowels: ['u', 'o', 'u', 'a'], every: 2, unease: 0.4 }),
          pipes(rt, { prob: 0.3, volume: -25 }),
          bells(rt, { notes: [0, 12], every: 24, strikes: [1, 1], volume: -14, ring: 8, hum: true }),
          swells(rt, { prob: 0.25, every: 2, lo: rt.pal.root + 12, hi: rt.pal.root + 30 }),
        ],
      });
  }
};

// ===========================================================================
// TITLE — 메인 테마 (D 단조, 고정 선율 + 생성 변주)
// ===========================================================================

// [MIDI, 박] — 0은 쉼
const THEME: readonly (readonly [number, number])[][] = [
  [[74, 2], [77, 1], [76, 1]],
  [[69, 3], [0, 1]],
  [[70, 2], [69, 1], [67, 1]],
  [[69, 4]],
  [[74, 2], [77, 1], [81, 1]],
  [[79, 2], [77, 1], [76, 1]],
  [[77, 2], [76, 1], [73, 1]],
  [[74, 4]],
];
const DM = [38, 50, 53, 57] as const;
const GM = [43, 50, 55, 58] as const;
const AM = [33, 49, 52, 57] as const;
const THEME_CHORDS: readonly (readonly number[])[] = [DM, DM, GM, AM, DM, GM, AM, DM];

function titleTheme(rt: Runtime): Layer {
  const keys = fmKeys(rt, { ring: 4.2, volume: -11, bright: 1.2 });
  rt.route(keys, { dry: 0.8, verb: 0.75, echo: 0.25 });
  const celesta = fmBell(rt, { harmonicity: 4, index: 2.2, ring: 2.8, shine: 0.6, volume: -19 });
  rt.route(celesta, { dry: 0.6, verb: 0.8, echo: 0.4 });
  const padS = padSynth(rt, { type: 'fatsawtooth', count: 2, spread: 14, attack: 2.8, release: 5, volume: -23, poly: 12 });
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 850, Q: 0.5, rolloff: -24 }));
  padS.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.6 });
  const horn = brass(rt, { volume: -21, attack: 2.2, release: 3.5 });
  const hlp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 520, Q: 0.7, rolloff: -24 }));
  horn.connect(hlp);
  rt.route(hlp, { dry: 1, verb: 0.7 });
  let pass = 0;
  const play = (p: Playable, notes: number[], dur: number, t: number, v: number) =>
    p.triggerAttackRelease(notes.map((m) => rt.hz(m, 0.3)), dur, t, clamp(v, 0.01, 1));
  return {
    step(t, s) {
      if (!rt.isBar(s)) return;
      const bar = rt.bar(s) % 8;
      if (bar === 0 && s > 0) pass++;
      const chord = THEME_CHORDS[bar];
      // 같은 화음이 이어지면 다시 치지 않고 길게 유지
      if (bar === 0 || THEME_CHORDS[bar - 1] !== chord) {
        let run = 1;
        while (bar + run < 8 && THEME_CHORDS[bar + run] === chord) run++;
        play(padS, chord.slice(1), rt.barDur * run + 0.6, t, 0.45);
      }
      // 3번째 바퀴는 선율 없이 숨을 고른다
      const variant = pass % 3;
      if (bar === 0 && variant !== 2) play(horn, [chord[0], chord[0] + 7], rt.barDur * 2, t, 0.5);
      if (variant === 2) return;
      let tt = t;
      for (const [m, beats] of THEME[bar]) {
        const dur = beats * rt.beatDur;
        if (m > 0) {
          const v = rand(0.38, 0.55) * (beats >= 2 ? 1.1 : 1);
          const at = rt.human(tt, 0.03);
          if (variant === 0) play(keys, chance(0.25) ? [m, m - 12] : [m], 0.05, at, v);
          else {
            play(celesta, [m + 12], 0.05, at, v * 0.9);
            if (beats >= 2) play(keys, [m - 12], 0.05, at, v * 0.6);
          }
          // 긴 음 끝에 가끔 장식음
          if (beats >= 3 && chance(0.35)) play(keys, [m + pick([2, -1, 5])], 0.05, tt + dur * 0.7, v * 0.5);
        }
        tt += dur;
      }
      // 베이스
      play(keys, [chord[0] + 12], 0.05, t, 0.35);
    },
    stop(t) {
      keys.releaseAll(t);
      padS.releaseAll(t);
      horn.releaseAll(t);
    },
  };
}

export const title: MoodFactory = (env) =>
  createMood(env, {
    bpm: 56,
    chordBars: 8,
    palette: (p: Palette) => ({ ...p, root: 38, mode: MODES.aeolian, micro: 0 }),
    build: (rt) => [
      drone(rt, { notes: [26, 38, 45], type: 'sawtooth', cutoff: 210, level: 0.26, lfoRate: 0.03 }),
      sea(rt, { level: 0.22, cutoff: 320 }),
      wind(rt, { level: 0.1, freq: 700, rate: 0.03 }),
      titleTheme(rt),
      bells(rt, { notes: [12, 24], every: 22, strikes: [1, 2], gap: 3, volume: -18, hum: true }),
    ],
  });

// ===========================================================================
// EVENT — 수수께끼 같은 질문 동기
// ===========================================================================

const QUESTIONS: readonly (readonly number[])[] = [
  [0, 7, 6],
  [0, 3, 8, 6],
  [12, 11, 6],
  [0, 5, 6, 11],
  [7, 0, 1],
  [0, 2, 3, 9],
];

function questions(rt: Runtime): Layer {
  const cel = fmBell(rt, { harmonicity: 4, index: 2.6, ring: 2.6, shine: 0.5, volume: -15 });
  rt.route(cel, { dry: 0.7, verb: 0.8, echo: 0.45 });
  let wait = 1;
  return {
    step(t, s) {
      if (!rt.isBar(s)) return;
      if (--wait > 0) return;
      wait = randInt(2, 4);
      const fig = pick(QUESTIONS);
      const base = rt.harmony.bass(3);
      const gap = rt.beatDur * pick([0.5, 0.75, 1]);
      fig.forEach((iv, i) => {
        const last = i === fig.length - 1;
        cel.triggerAttackRelease(rt.hz(base + iv, 0.8), 0.05, t + i * gap + rand(0, 0.03), last ? 0.5 : rand(0.3, 0.45));
      });
    },
    stop(t) {
      cel.releaseAll(t);
    },
  };
}

export const event: MoodFactory = (env) => {
  const act = actOf(env.act);
  return createMood(env, {
    bpm: 60,
    chordBars: 4,
    build: (rt) => {
      const L: Layer[] = [
        drone(rt, { notes: [0, 12], follow: true, type: 'triangle', cutoff: 420, level: 0.3, lfoRate: 0.04 }),
        pad(rt, { type: 'fatsine', count: 2, spread: 18, cutoff: 1400, attack: 4, release: 5, volume: -24, octave: 1, every: 4, unease: 0.2 }),
        questions(rt),
      ];
      if (act === 1) L.push(sea(rt, { level: 0.2, cutoff: 300 }));
      else if (act === 2) L.push(hum(rt, { volume: -16, octave: 1, vowels: ['u', 'o'], every: 4 }));
      else if (act === 3) L.push(shimmer(rt, { density: 0.15, shift: true }), swells(rt, { prob: 0.2 }));
      else if (act === 4) L.push(pipes(rt, { prob: 0.25, volume: -27 }));
      else L.push(heartbeat(rt, { bpm: 50, volume: -12 }));
      return L;
    },
  });
};

// ===========================================================================
// CAMP — 모닥불, 따뜻하지만 불안한 패드
// ===========================================================================

export const camp: MoodFactory = (env) => {
  const act = actOf(env.act);
  return createMood(env, {
    bpm: 56,
    chordBars: 4,
    build: (rt) => {
      const guitar = pluck(rt, { ring: 2.2, volume: -15 });
      const glp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 2200, rolloff: -12 }));
      guitar.connect(glp);
      rt.route(glp, { dry: 0.9, verb: 0.45, echo: 0.1 });
      const L: Layer[] = [
        fire(rt),
        pad(rt, { type: 'fattriangle', count: 2, spread: 10, cutoff: 1000, attack: 3, release: 5, volume: -22, octave: 1, color: 0.5, unease: 0.12, every: 4 }),
        melody(rt, guitar, { lo: rt.pal.root + 19, hi: rt.pal.root + 36, grid: 2, density: 0.26, phrase: [2, 3], rest: [2, 4], dyad: 0.35, vel: [0.25, 0.5] }),
      ];
      // 멀리서 들려오는 불안의 기척
      if (act === 1) L.push(foghorn(rt, { every: 45, volume: -16 }));
      else if (act === 2) L.push(bells(rt, { notes: [12], every: 30, strikes: [1, 1], volume: -20 }));
      else if (act === 3) L.push(swells(rt, { prob: 0.12, every: 4 }));
      else if (act === 4) L.push(pipes(rt, { prob: 0.15, volume: -28 }));
      else L.push(heartbeat(rt, { bpm: 48, volume: -15, prob: 0.8 }));
      return L;
    },
  });
};

// ===========================================================================
// HAVEN — 층 사이의 항구 마을. 6/8, 하프 아르페지오, 파도, 부표 종
// ===========================================================================

function harpArp(rt: Runtime, synth: Playable): Layer {
  const shape = [0, 1, 2, 3, 2, 1];
  let prev: number[] = [];
  let voicing: number[] = [];
  return {
    step(t, s) {
      const i = rt.inBar(s);
      if (i === 0) {
        const b = rt.harmony.bass(1);
        const tones = voiceLead(rt.harmony.chord(3, 2), prev);
        prev = tones;
        voicing = [b, ...tones];
      }
      if (!voicing.length || !chance(i === 0 ? 1 : 0.82)) return;
      const m = voicing[shape[i % shape.length] % voicing.length];
      synth.triggerAttackRelease(rt.hz(m, 0.6), 0.05, rt.human(t, 0.015), i === 0 ? 0.5 : rand(0.22, 0.38));
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

export const haven: MoodFactory = (env) => {
  const act = actOf(env.act);
  return createMood(env, {
    // 6/8: 한 박 = 점4분음표, 한 칸 = 8분음표
    bpm: 46 - (act - 1) * 1.5,
    stepsPerBeat: 3,
    beatsPerBar: 2,
    chordBars: 2,
    build: (rt) => {
      const harp = pluck(rt, { ring: 2.4, volume: -14 });
      const hlp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 2600 * rt.pal.bright, rolloff: -12 }));
      harp.connect(hlp);
      rt.route(hlp, { dry: 0.9, verb: 0.55, echo: 0.15 });
      const L: Layer[] = [
        sea(rt, { level: 0.36 }),
        bells(rt, { notes: [36, 43], harmonicity: 3.5, index: 4, ring: 4, every: 18, strikes: [1, 2], gap: 1.1, volume: -21 }),
        harpArp(rt, harp),
        pad(rt, { type: 'fatsawtooth', count: 2, spread: 12, cutoff: 900, attack: 3, release: 5, volume: -27, octave: 1, every: 2 }),
        keysMelody(rt, { lo: rt.pal.root + 24, hi: rt.pal.root + 41, grid: 3, density: 0.45, volume: -15, rest: [2, 4] }),
      ];
      if (act === 2) L.push(hum(rt, { volume: -19, octave: 1, vowels: ['u', 'o'], every: 4 }));
      else if (act === 3) L.push(shimmer(rt, { density: 0.1 }), tempoDrift(rt, 0.03, 4));
      else if (act === 4) L.push(drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 11], cutoff: 200, level: 0.22 }), pipes(rt, { prob: 0.12, volume: -29 }));
      else if (act === 5) L.push(drone(rt, { notes: [rt.pal.root - 12, rt.pal.root - 5], cutoff: 200, level: 0.26 }), heartbeat(rt, { bpm: 46, volume: -16, prob: 0.7 }));
      return L;
    },
  });
};

// ===========================================================================
// MERCHANT — 조율이 어긋난 오르골 왈츠 (골동품상). 가끔 태엽이 풀린다
// ===========================================================================

const MB_MODES = [MODES.harmonicMinor, MODES.phrygianDominant, MODES.wholeTone, MODES.locrian, MODES.doubleHarmonic];
/** 한 마디(8분음표 6칸)의 리듬: 1 = 음, 0 = 쉼/지속 */
const WALTZ_RHYTHMS: readonly (readonly number[])[] = [
  [1, 0, 1, 0, 1, 0],
  [1, 0, 0, 0, 1, 0],
  [1, 0, 1, 1, 1, 0],
  [1, 1, 1, 0, 1, 0],
  [1, 0, 0, 1, 1, 0],
  [1, 0, 1, 0, 1, 1],
];

function musicBox(rt: Runtime): Layer {
  const box = fmBell(rt, { harmonicity: 5.07, index: 3, ring: 1.7, shine: 0.22, volume: -11, poly: 10 });
  const vib = rt.bag.add(new Vibrato({ frequency: 0.7, depth: 0.12, maxDelay: 0.01, wet: 1 }));
  box.connect(vib);
  rt.route(vib, { dry: 0.9, verb: 0.45, echo: 0.25 });
  const ticker = rt.bag.add(
    new NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.012, releaseCurve: EXP },
      volume: -24,
    }),
  );
  const thp = rt.bag.add(new Filter({ type: 'highpass', frequency: 3200, rolloff: -12 }));
  ticker.connect(thp);
  rt.route(thp, { dry: 1, verb: 0.2 });

  let rhythm = WALTZ_RHYTHMS[0];
  let cur = rt.pal.root + 43;
  let sag = 0;
  let windDown = randInt(12, 20);
  let windingBars = 0;
  let lastTick = 0;
  const note = (m: number, t: number, v: number) =>
    box.triggerAttackRelease(mtof(m + (rt.detune(1.4) + sag) / 100), 0.04, t, clamp(v, 0.01, 1));

  return {
    step(t, s) {
      const i = rt.inBar(s);
      if (i === 0) {
        const bar = rt.bar(s);
        rhythm = bar % 4 === 3 ? WALTZ_RHYTHMS[1] : pick(WALTZ_RHYTHMS);
        // 태엽 풀림: 2마디에 걸쳐 느려지고 음이 처진다 → 다시 감는 소리 → 원래 템포
        if (windingBars > 0) {
          windingBars--;
          if (windingBars === 0) {
            rt.setTempoMod(1, 0.05, t);
            sag = 0;
          }
        } else if (--windDown <= 0) {
          windDown = randInt(14, 22);
          windingBars = 3;
          rt.setTempoMod(0.55, rt.barDur * 2, t);
        }
      }
      if (windingBars > 0) sag = Math.max(-60, sag - 4);
      // 태엽 감는 소리
      if (windingBars === 1 && t > lastTick + 0.02) {
        lastTick = t;
        ticker.triggerAttackRelease(0.003, t, rand(0.4, 0.8));
        return;
      }
      // 반주: 1박 베이스, 2·3박 화음
      if (i === 0) note(rt.harmony.bass(2), t, 0.45);
      else if (i === 2 || i === 4) {
        for (const m of rt.harmony.chord(3, 3).slice(1)) note(m, t + rand(0, 0.012), 0.2);
      }
      // 선율
      if (!rhythm[i]) return;
      const pool = rt.harmony.scaleIn(rt.pal.root + 38, rt.pal.root + 55);
      if (!pool.length) return;
      let idx = pool.indexOf(cur);
      if (idx < 0) idx = Math.floor(pool.length / 2);
      if (i === 0 && chance(0.6)) {
        const tones = rt.harmony.chordTonesIn(rt.pal.root + 38, rt.pal.root + 55);
        if (tones.length) cur = pick(tones);
      } else {
        idx = clamp(idx + pick([-2, -1, -1, 1, 1, 2, 3, -3]), 0, pool.length - 1);
        cur = pool[idx];
      }
      note(cur, t, i === 0 ? 0.55 : rand(0.35, 0.5));
    },
    stop(t) {
      box.releaseAll(t);
    },
    sanity(_s, t) {
      vib.depth.rampTo(0.12 + rt.wobble * 0.5, 2, t);
    },
  };
}

export const merchant: MoodFactory = (env) => {
  const act = actOf(env.act);
  return createMood(env, {
    bpm: 84 - (act - 1) * 3,
    stepsPerBeat: 2,
    beatsPerBar: 3,
    chordBars: 2,
    palette: (p: Palette) => ({ ...p, mode: MB_MODES[act - 1], micro: p.micro + 8 }),
    build: (rt) => [
      musicBox(rt),
      pad(rt, { type: 'fatsine', count: 2, spread: 20, cutoff: 900, attack: 3, release: 4, volume: -30, octave: 1, every: 4, unease: 0.15 }),
    ],
  });
};
