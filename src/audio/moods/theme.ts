/**
 * 보스곡의 주제 선율.
 *
 * 수호자 id를 씨앗으로 8마디 주제(질문 4마디 + 대답 4마디)를 만든다. 첫 마디가 '동기'이고,
 * 3마디는 동기의 반복진행, 5~6마디는 1~2마디 그대로(알아듣게), 7마디는 더 높이 올라갔다가 8마디에서 으뜸음으로 닫는다.
 * 구간마다 조각내기·확대·전위·역행·반복진행으로 변주해 여러 악기에 싣는다.
 */
import { Gain, Panner, dbToGain } from 'tone';
import { SeedRng, chance, clamp, degreeToMidi, mtof, rand, type Harmony } from '../scales';
import { OscSynth } from '../synth';
import { COMP, biquad, boomDrum, fmBell, fmKeys, fq, pluck, sweep, type Vowel } from './instruments';
import { randPan, type Layer, type Runtime } from './runtime';

// ===========================================================================
// 주제
// ===========================================================================

export interface ThemeNote {
  /** 프레이즈 시작부터의 칸 */
  at: number;
  /** 길이(칸) */
  len: number;
  /** 음계 차수 (으뜸음 = 0) */
  deg: number;
  /** 반음 변화 */
  alt: number;
}

export interface Theme {
  notes: readonly ThemeNote[];
  /** 마디 수 */
  bars: number;
  /** 한 마디의 칸 수 */
  spb: number;
}

// 한 마디 리듬(칸). 음수 = 쉼. CELLS는 동기용, ENDS는 끝이 긴 대답용
const CELLS: Record<number, readonly (readonly number[])[]> = {
  16: [
    [4, 2, 2, 4, 4],
    [6, 2, 4, 4],
    [2, 2, 4, 2, 2, 4],
    [3, 3, 2, 4, 4],
    [4, 4, 2, 2, 4],
    [6, 6, 4],
    [2, 4, 2, 4, 4],
    [4, -2, 2, 4, 4],
    [2, 2, 2, 2, 8],
  ],
  14: [
    [4, 4, 6],
    [4, 4, 2, 4],
    [2, 2, 4, 6],
    [6, 4, 4],
    [4, 2, 2, 6],
    [2, 2, 2, 2, 6],
    [4, 6, 4],
  ],
};
const ENDS: Record<number, readonly (readonly number[])[]> = {
  16: [
    [4, 4, 8],
    [2, 2, 4, 8],
    [6, 2, 8],
    [4, 12],
    [8, 8],
    [2, 2, 12],
    [4, 2, 2, 8],
  ],
  14: [
    [4, 10],
    [2, 2, 10],
    [4, 4, 6],
    [6, 8],
    [14],
    [2, 2, 4, 6],
  ],
};

function rhythms(spb: number, table: Record<number, readonly (readonly number[])[]>): readonly (readonly number[])[] {
  const hit = table[spb];
  if (hit) return hit;
  // 다른 박자: 16칸 표를 비율대로 늘이고 줄인다 (합이 spb가 되게 마지막 값으로 맞춤)
  return table[16].map((r) => {
    const k = spb / 16;
    const out = r.map((x) => Math.sign(x) * Math.max(1, Math.round(Math.abs(x) * k)));
    const sum = out.reduce((a, b) => a + Math.abs(b), 0);
    out[out.length - 1] += spb - sum;
    return out;
  });
}

type Gesture = 'arch' | 'lament' | 'climb' | 'neighbor' | 'leap' | 'drop' | 'pedal';
const GESTURES: readonly Gesture[] = ['arch', 'lament', 'climb', 'neighbor', 'leap', 'drop', 'pedal'];

/** 동기 한 마디의 음높이 (n개) */
function cellPitches(g: Gesture, n: number, s0: number, r: SeedRng): number[] {
  const p: number[] = [];
  let cur = s0;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      if (g === 'lament') cur = s0 + r.pick([3, 4]);
      else if (g === 'drop') cur = s0 + r.pick([4, 5, 7]);
      p.push(cur);
      continue;
    }
    const first = i < Math.ceil(n / 2);
    let step = 0;
    switch (g) {
      case 'arch':
        step = first ? r.pick([1, 1, 2]) : -r.pick([1, 1, 2]);
        break;
      case 'lament':
        step = -r.pick([1, 1, 1, 2]);
        break;
      case 'climb':
        step = i === n - 1 ? r.pick([2, 3]) : 1;
        break;
      case 'neighbor':
        step = [1, -1, -1, 1][(i - 1) % 4];
        break;
      case 'leap':
        step = i === 1 ? r.pick([3, 4, 4, 5]) : -r.pick([1, 1, 2]);
        break;
      case 'drop':
        step = i === 1 ? -r.pick([3, 4]) : r.pick([-1, 1, 1]);
        break;
      case 'pedal':
        step = cur === s0 ? (r.chance(0.6) ? 0 : r.pick([1, -1])) : s0 - cur;
        break;
    }
    cur += step;
    p.push(cur);
  }
  return p;
}

/** from에서 to로 n개 음으로 다가간다 (마지막 음 = to) */
function approach(from: number, to: number, n: number, r: SeedRng): number[] {
  const out: number[] = [];
  let cur = from;
  for (let i = 0; i < n; i++) {
    const left = n - 1 - i;
    if (left === 0) {
      out.push(to);
      break;
    }
    const dist = to - cur;
    if (Math.abs(dist) > left) cur += Math.sign(dist) * (Math.abs(dist) > left * 2 ? 2 : 1);
    else if (dist === 0) cur += r.pick([1, -1]);
    else cur += r.chance(0.55) ? Math.sign(dist) : -Math.sign(dist);
    out.push(cur);
  }
  return out;
}

/** 리듬 + 음높이 → 음표 (쉼 칸은 건너뛴다). 반환: 다음 위치 */
function lay(out: ThemeNote[], at: number, rhythm: readonly number[], pitches: readonly number[]): void {
  let pos = at;
  let k = 0;
  for (const len of rhythm) {
    if (len > 0) out.push({ at: pos, len, deg: pitches[Math.min(k++, pitches.length - 1)], alt: 0 });
    pos += Math.abs(len);
  }
}

const noteCount = (rh: readonly number[]): number => rh.filter((x) => x > 0).length;

/** 수호자의 주제 (8마디) */
export function makeTheme(r: SeedRng, spb: number): Theme {
  const cells = rhythms(spb, CELLS);
  const ends = rhythms(spb, ENDS);
  const g = r.pick(GESTURES);
  const s0 = r.weighted<number>([
    [0, 4],
    [4, 3],
    [2, 2],
  ]);
  const c1 = r.pick(cells);
  const e1 = r.pick(ends);
  const e2 = r.pick(ends);
  const eEnd = r.pick(ends.filter((x) => x[x.length - 1] >= spb / 2)) ?? ends[0];
  const p1 = cellPitches(g, noteCount(c1), s0, r);
  const last = p1[p1.length - 1];
  const pause = s0 + r.pick([2, -1, 1, 4]);
  const p2 = approach(last, pause, noteCount(e1), r);
  const seq3 = r.pick([1, -1, 2, 3]);
  const p3 = p1.map((d) => d + seq3);
  const half = r.pick([4, 4, 1, -1, 2]);
  const p4 = approach(p3[p3.length - 1], half, noteCount(e2), r);
  const seq7 = r.pick([2, 3, 4]);
  const p7 = p1.map((d) => d + seq7);
  const home = r.chance(0.7) ? 0 : 7;
  const p8 = approach(p7[p7.length - 1], home, noteCount(eEnd), r);

  const notes: ThemeNote[] = [];
  lay(notes, 0, c1, p1);
  lay(notes, spb, e1, p2);
  lay(notes, spb * 2, c1, p3);
  lay(notes, spb * 3, e2, p4);
  lay(notes, spb * 4, c1, p1);
  lay(notes, spb * 5, e1, p2);
  lay(notes, spb * 6, c1, p7);
  lay(notes, spb * 7, eEnd, p8);

  // 반음 하나를 비틀어 불길하게 (3마디나 7마디의 가운데 음)
  if (r.chance(0.45)) {
    const bar = r.pick([2, 6]);
    const mid = notes.filter((n) => n.at > bar * spb && n.at < (bar + 1) * spb - 2);
    if (mid.length) r.pick(mid).alt = r.pick([-1, 1]);
  }

  // 음역 정리: 가운데가 1~2 차수 근처로 (높은 악기도 날카로워지지 않게)
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    lo = Math.min(lo, n.deg);
    hi = Math.max(hi, n.deg);
  }
  const fix = -7 * Math.round(((lo + hi) / 2 - 1.5) / 7);
  if (fix) for (const n of notes) n.deg += fix;
  return { notes, bars: 8, spb };
}

// ---------------------------------------------------------------------------
// 변주
// ---------------------------------------------------------------------------

/** [from, to) 마디만 잘라 0부터 다시 센다 */
export function slice(th: Theme, from: number, to: number): ThemeNote[] {
  const a = from * th.spb;
  const b = to * th.spb;
  return th.notes.filter((n) => n.at >= a && n.at < b).map((n) => ({ ...n, at: n.at - a }));
}

/** 확대(k=2)/축소(k=0.5) */
export function stretch(notes: readonly ThemeNote[], k: number): ThemeNote[] {
  return notes.map((n) => ({ ...n, at: Math.round(n.at * k), len: Math.max(1, Math.round(n.len * k)) }));
}

/** 전위 (첫 음 기준으로 위아래를 뒤집는다) */
export function invert(notes: readonly ThemeNote[]): ThemeNote[] {
  const pivot = notes[0]?.deg ?? 0;
  return notes.map((n) => ({ ...n, deg: 2 * pivot - n.deg, alt: -n.alt }));
}

/** 역행 (리듬은 그대로, 음높이 순서만 거꾸로) */
export function retro(notes: readonly ThemeNote[]): ThemeNote[] {
  const pitches = notes.map((n) => [n.deg, n.alt] as const).reverse();
  return notes.map((n, i) => ({ ...n, deg: pitches[i][0], alt: pitches[i][1] }));
}

/** 반복진행 (차수 이동) */
export function transpose(notes: readonly ThemeNote[], d: number): ThemeNote[] {
  return notes.map((n) => ({ ...n, deg: n.deg + d }));
}

/** 박자 밀기 (당김음 변주): 모든 음을 k칸 뒤로, 끝을 넘으면 버린다 */
export function displace(notes: readonly ThemeNote[], k: number, span: number): ThemeNote[] {
  return notes
    .map((n) => ({ ...n, at: n.at + k }))
    .filter((n) => n.at < span)
    .map((n) => ({ ...n, len: Math.min(n.len, span - n.at) }));
}

// ===========================================================================
// 선율 악기
// ===========================================================================

export type LeadKind = 'brass' | 'horn' | 'keys' | 'oldkeys' | 'bell' | 'celesta' | 'ice' | 'choir' | 'pipe' | 'glass' | 'pluck' | 'organ';

export interface Lead {
  /** 0차수가 놓이는 음역 (으뜸음 위 반음) */
  readonly base: number;
  /** 음마다 미분음 흔들림 배율 */
  readonly detune: number;
  /** 지속음 악기(음 길이만큼 끈다) / 아니면 치고 울리게 둔다 */
  readonly sustained: boolean;
  play(f: number, dur: number, t: number, vel: number): void;
  release(t: number): void;
  /** 합창만: 모음 바꾸기 */
  vowel?(v: Vowel, t: number): void;
}

const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [760, 1150, 2800],
  o: [470, 820, 2600],
  u: [330, 720, 2450],
  e: [430, 1700, 2600],
  i: [300, 2100, 2900],
};

/** 선율 악기 하나 (구간 스코프에서 만들고 구간과 함께 정리된다). volume = 기본값에 더할 dB */
export function makeLead(rt: Runtime, kind: LeadKind, volume = 0): Lead {
  const db = (x: number) => dbToGain(x + volume);
  switch (kind) {
    case 'brass':
    case 'horn': {
      const dark = kind === 'horn';
      const synth = rt.bag.add(
        new OscSynth(rt.ctx, {
          wave: 'sawtooth',
          detunes: [-7, 7],
          env: { a: dark ? 0.09 : 0.045, d: 0.5, s: 0.72, r: dark ? 0.5 : 0.3 },
          level: db((dark ? -7.3 : -5.6) + COMP.stack),
          max: 4,
        }),
      );
      const lp = biquad(rt, 'lowpass', 900, 1.1);
      synth.output.connect(lp);
      rt.route(lp, { dry: 1, verb: 0.45, echo: 0.12 });
      const lo = (dark ? 380 : 700) * rt.pal.bright;
      const hi = (dark ? 1400 : 2700) * rt.pal.bright;
      return {
        base: 24,
        detune: 0.4,
        sustained: true,
        play(f, dur, t, vel) {
          const p = lp.frequency;
          const peak = lo + (hi - lo) * (0.45 + 0.55 * vel) * (1 + rt.intensity * 0.3);
          p.cancelScheduledValues(t);
          p.setValueAtTime(fq(rt.ctx, lo), t);
          p.exponentialRampToValueAtTime(fq(rt.ctx, peak), t + (dark ? 0.14 : 0.07));
          p.exponentialRampToValueAtTime(fq(rt.ctx, lo * 1.7), t + dur + 0.25);
          synth.play(f, dur, t, vel);
        },
        release: (t) => synth.releaseAll(t),
      };
    }
    case 'keys':
    case 'oldkeys': {
      const old = kind === 'oldkeys';
      const k = fmKeys(rt, { bright: old ? 2.4 : 1.5, ring: old ? 1.7 : 2.6, volume: -9.5 + volume, poly: 4 });
      rt.route(k, { dry: 0.85, verb: 0.5, echo: 0.2 });
      return {
        base: 24,
        detune: old ? 1.8 : 0.5,
        sustained: false,
        play: (f, _dur, t, vel) => k.play(f, 0.05, t, vel),
        release: (t) => k.releaseAll(t),
      };
    }
    case 'bell':
    case 'celesta':
    case 'ice': {
      const o =
        kind === 'bell'
          ? { harmonicity: 3.5, index: 5, ring: 2.4, shine: 0.9, volume: -12.5 }
          : kind === 'celesta'
            ? { harmonicity: 4, index: 2.4, ring: 2.3, shine: 0.5, volume: -11.5 }
            : { harmonicity: 7.01, index: 1.8, ring: 3.2, shine: 0.35, volume: -13 };
      const b = fmBell(rt, { ...o, volume: o.volume + volume, poly: 4 });
      rt.route(b, { dry: 0.75, verb: 0.75, echo: 0.3 });
      return {
        base: 36,
        detune: 0.5,
        sustained: false,
        play: (f, _dur, t, vel) => b.play(f, 0.03, t, vel),
        release: (t) => b.releaseAll(t),
      };
    }
    case 'pluck': {
      const p = pluck(rt, { ring: 1.8, volume: -8.5 + volume, poly: 4 });
      const lp = biquad(rt, 'lowpass', 2600 * rt.pal.bright, 0.7);
      p.output.connect(lp);
      rt.route(lp, { dry: 0.9, verb: 0.5, echo: 0.2 });
      return {
        base: 24,
        detune: 0.5,
        sustained: false,
        play: (f, _dur, t, vel) => p.play(f, 0.05, t, vel),
        release: (t) => p.releaseAll(t),
      };
    }
    case 'glass': {
      const s = rt.bag.add(new OscSynth(rt.ctx, { wave: [1, 0, 0.3, 0, 0.12], env: { a: 0.004, r: 1.3 }, level: db(-10.5), max: 4 }));
      rt.route(s, { dry: 0.7, verb: 0.6, echo: 0.45 });
      return {
        base: 36,
        detune: 0.8,
        sustained: false,
        play: (f, _dur, t, vel) => void s.play(f, 0.02, t, vel),
        release: (t) => s.releaseAll(t),
      };
    }
    case 'pipe': {
      const s = rt.bag.add(
        new OscSynth(rt.ctx, {
          wave: 'triangle',
          env: { a: 0.07, d: 0.3, s: 0.82, r: 0.28 },
          level: db(-11.5),
          max: 3,
          vibrato: { rate: 5.6, cents: 16 },
        }),
      );
      const hp = biquad(rt, 'highpass', 320, 0.7);
      const pan = rt.bag.add(new Panner({ context: rt.ctx, pan: randPan(0.4) }));
      s.output.chain(hp, pan);
      rt.route(pan, { dry: 0.75, verb: 0.8, echo: 0.3 });
      return {
        base: 36,
        detune: 0.6,
        sustained: true,
        play: (f, dur, t, vel) => void s.play(f, dur, t, vel),
        release: (t) => s.releaseAll(t),
      };
    }
    case 'organ': {
      const s = rt.bag.add(
        new OscSynth(rt.ctx, {
          wave: [1, 0.55, 0, 0.3, 0, 0.15, 0, 0.08],
          env: { a: 0.05, r: 0.45 },
          level: db(-16.5),
          max: 4,
          vibrato: { rate: 6.2, cents: 5 },
        }),
      );
      const lp = biquad(rt, 'lowpass', 2400 * rt.pal.bright, 0.7);
      s.output.connect(lp);
      rt.route(lp, { dry: 0.85, verb: 0.7, echo: 0.1 });
      return {
        base: 24,
        detune: 0.3,
        sustained: true,
        play: (f, dur, t, vel) => void s.play(f, dur, t, vel),
        release: (t) => s.releaseAll(t),
      };
    }
    case 'choir':
    default: {
      // 포먼트 합창 한 줄 (톱니 두 겹 + 비브라토 → 모음 밴드패스)
      const s = rt.bag.add(
        new OscSynth(rt.ctx, {
          wave: 'sawtooth',
          detunes: [-6, 6],
          env: { a: 0.16, d: 0.6, s: 0.85, r: 0.7 },
          level: db(-6 + COMP.stack),
          max: 4,
          vibrato: { rate: 5, cents: 20 },
        }),
      );
      const output = rt.bag.add(new Gain({ context: rt.ctx, gain: 3.2 }));
      const filters = FORMANTS.a.map((f, i) => {
        const flt = biquad(rt, 'bandpass', f, i === 0 ? 5 : 8);
        const g = rt.bag.add(new Gain({ context: rt.ctx, gain: [1, 0.55, 0.2][i] }));
        s.output.chain(flt, g, output);
        return flt;
      });
      const body = biquad(rt, 'lowpass', 420, 0.7);
      const bodyGain = rt.bag.add(new Gain({ context: rt.ctx, gain: 0.18 }));
      s.output.chain(body, bodyGain, output);
      rt.route(output, { dry: 0.9, verb: 0.75, echo: 0.12 });
      return {
        base: 24,
        detune: 0.5,
        sustained: true,
        play: (f, dur, t, vel) => void s.play(f, dur, t, vel),
        release: (t) => s.releaseAll(t),
        vowel(v, t) {
          FORMANTS[v].forEach((f, i) => sweep(filters[i], f, 0.6, t));
        },
      };
    }
  }
}

// ===========================================================================
// 레이어
// ===========================================================================

const mod12 = (m: number): number => ((Math.round(m) % 12) + 12) % 12;

/** 화음음과 반음으로 부딪히는 긴 음을 화음음으로 */
function fitToChord(m: number, h: Harmony): number {
  const pcs = h.chord(3, 0).map(mod12);
  if (pcs.includes(mod12(m))) return m;
  for (const d of [-1, 1]) if (pcs.includes(mod12(m + d))) return m + d;
  return m;
}

export interface LineOpts {
  notes: readonly ThemeNote[];
  /** 구간이 시작된 칸 */
  start: number;
  /** 시작 오프셋(칸) */
  offset?: number;
  /** 반복 주기(칸). 없으면 한 번만 */
  period?: number;
  /** 반복 횟수 상한 */
  times?: number;
  /** 'chord' = 차수를 현재 화음 근음 기준으로 (반복진행) */
  rel?: 'tonic' | 'chord';
  /** 음역 이동(반음) */
  octave?: number;
  vel?: readonly [number, number];
  /** 음 길이 배율 */
  legato?: number;
  /** 겹치는 음정(반음, 예: 12 / -12 / 1) */
  double?: number;
  doubleVel?: number;
  /** 긴 음이 화음과 반음으로 부딪히면 화음음으로 */
  fit?: boolean;
  /** 첫 음이 아닌 음을 빼먹을 확률 (조각내기) */
  thin?: number;
  /** 음마다 고정 미분음(cents) — 영주 */
  micro?: readonly number[];
  /** 반복마다 모음을 바꾼다 (합창) */
  vowels?: readonly Vowel[];
}

/** 주제(또는 그 변주)를 악기 하나에 싣는다 */
export function line(rt: Runtime, lead: Lead, o: LineOpts): Layer {
  const byPos = new Map<number, ThemeNote[]>();
  let span = 0;
  o.notes.forEach((n) => {
    const list = byPos.get(n.at);
    if (list) list.push(n);
    else byPos.set(n.at, [n]);
    span = Math.max(span, n.at + n.len);
  });
  const index = new Map(o.notes.map((n, i) => [n, i]));
  const period = o.period ?? 0;
  const pitch = (n: ThemeNote): number => {
    const h = rt.harmony;
    let deg = n.deg;
    let base = h.root + lead.base + (o.octave ?? 0);
    if (o.rel === 'chord') {
      deg += h.degree;
      // 화음 근음이 높으면 한 옥타브 내려 음역을 지킨다
      if (((h.degree % 7) + 7) % 7 >= 4) base -= 12;
    }
    let m = degreeToMidi(base, h.mode, deg) + n.alt;
    if (o.fit && n.len >= 6) m = fitToChord(m, h);
    return m;
  };
  return {
    step(t, s) {
      const k = s - o.start - (o.offset ?? 0);
      if (k < 0) return;
      let pos = k;
      let rep = 0;
      if (period > 0) {
        rep = Math.floor(k / period);
        pos = k % period;
        if (o.times !== undefined && rep >= o.times) return;
      } else if (k >= span) return;
      const list = byPos.get(pos);
      if (!list) return;
      if (pos === 0 && o.vowels?.length && lead.vowel) lead.vowel(o.vowels[rep % o.vowels.length], t);
      for (const n of list) {
        if (o.thin && pos > 0 && chance(o.thin)) continue;
        const m = pitch(n);
        const micro = o.micro ? o.micro[(index.get(n) ?? 0) % o.micro.length] / 100 : 0;
        const dur = lead.sustained ? Math.max(0.08, n.len * rt.stepDur * (o.legato ?? 0.92)) : 0.05;
        const accent = n.at % rt.stepsPerBar === 0 ? 1.1 : n.len >= rt.stepsPerBeat * 2 ? 1.04 : 1;
        const [a, b] = o.vel ?? [0.5, 0.64];
        const v = clamp(rand(a, b) * accent, 0.05, 1);
        const at = rt.human(t, 0.012);
        lead.play(rt.hz(m + micro, lead.detune), dur, at, v);
        if (o.double) lead.play(rt.hz(m + o.double + micro, lead.detune), dur, at, v * (o.doubleVel ?? 0.55));
      }
    },
    stop(t) {
      lead.release(t);
    },
  };
}

/** 화음음 아르페지오 (정해진 모양으로) */
export function arp(
  rt: Runtime,
  lead: Lead,
  o: { start: number; pattern: readonly number[]; grid: number; lo: number; hi: number; vel?: readonly [number, number]; prob?: number; from?: number; size?: number },
): Layer {
  return {
    step(t, s) {
      const k = s - o.start;
      if (k < 0 || k % o.grid !== 0) return;
      if (o.from && k < o.from * rt.stepsPerBar) return;
      if (!chance((o.prob ?? 0.85) * (0.75 + rt.intensity * 0.35))) return;
      const tones = rt.harmony.chordTonesIn(o.lo, o.hi, o.size ?? 3);
      if (!tones.length) return;
      const i = Math.floor(k / o.grid);
      const m = tones[o.pattern[i % o.pattern.length] % tones.length];
      const [a, b] = o.vel ?? [0.28, 0.42];
      const v = clamp(rand(a, b) * (rt.isBeat(s) ? 1.12 : 1), 0.05, 1);
      lead.play(rt.hz(m, lead.detune), lead.sustained ? rt.stepDur * o.grid * 0.85 : 0.05, rt.human(t, 0.01), v);
    },
    stop(t) {
      lead.release(t);
    },
  };
}

/** n마디마다 낮게 울리는 큰북 (숨 고르기의 맥박) */
export function toll(rt: Runtime, o: { start: number; every: number; volume?: number; note?: number; vel?: number }): Layer {
  const b = boomDrum(rt, o.volume ?? -8, 2.4);
  const lp = biquad(rt, 'lowpass', 160, 0.7);
  b.output.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.3 });
  return {
    step(t, st) {
      const k = st - o.start;
      if (k < 0 || k % (rt.stepsPerBar * o.every) !== 0) return;
      b.hit(mtof(o.note ?? rt.pal.root - 12), t, (o.vel ?? 0.8) * (0.85 + rt.intensity * 0.3));
    },
  };
}
