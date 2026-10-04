import { Filter, FrequencyShifter, Gain, MembraneSynth, MonoSynth, Noise, NoiseSynth, Synth } from 'tone';
import { addDissonance, chance, clamp, mtof, pick, rand } from '../scales';
import { EXP, bassSynth, brass, metal, noiseHit, taiko, tom } from './instruments';
import type { Layer, Runtime, Sends } from './runtime';

// ===========================================================================
// Drum kit — 문자열 패턴 기반 타악기 묶음
//   X 강세  x 보통  o 고스트  ? 무작위(강도 비례)  . 쉼
//   K 타이코  T 톰  S 손바닥/스네어  H 쉐이커  M 금속  B 서브 붐
// ===========================================================================

export type DrumVoice = 'K' | 'T' | 'S' | 'H' | 'M' | 'B';

export interface KitOpts {
  /** 마디 길이(stepsPerBar)와 같은 길이의 패턴 변형들 */
  patterns: Partial<Record<DrumVoice, readonly string[]>>;
  /** 프레이즈 마지막 마디용 필인 */
  fills?: Partial<Record<DrumVoice, string>>;
  /** 강도가 낮을 때 쓰는 쉐이커 패턴 (없으면 H는 강도 hatFrom 이상에서만) */
  softHat?: string;
  hatFrom?: number;
  phraseBars?: number;
  level?: number;
  sends?: Sends;
  /** 타악기 음높이 (MIDI) */
  taikoNote?: number;
  tomNotes?: readonly number[];
  /** 금속 소리 음색 */
  metalFreq?: number;
  /** 북 소리를 주파수 시프터로 일그러뜨림 (균열) */
  warp?: boolean;
}

interface Hit {
  trigger(t: number, v: number): void;
}

export function drumKit(rt: Runtime, o: KitOpts): Layer {
  const bus = rt.bag.add(new Gain(o.level ?? 1));
  let shifter: FrequencyShifter | undefined;
  if (o.warp) {
    shifter = rt.bag.add(new FrequencyShifter({ frequency: 0, wet: 0.45 }));
    bus.connect(shifter);
    rt.route(shifter, o.sends ?? { dry: 1, verb: 0.2 });
  } else {
    rt.route(bus, o.sends ?? { dry: 1, verb: 0.2 });
  }
  const used = new Set<DrumVoice>(Object.keys(o.patterns) as DrumVoice[]);
  if (o.softHat) used.add('H');
  const hits: Partial<Record<DrumVoice, Hit>> = {};
  // 모노 악기는 같은 시각 재트리거가 금지라 시각을 단조 증가시킨다
  const mono = (fn: (tt: number, v: number) => void): Hit => {
    let last = 0;
    return {
      trigger(t, v) {
        const tt = Math.max(t, last + 0.004);
        last = tt;
        fn(tt, v);
      },
    };
  };
  const root = o.taikoNote ?? (rt.pal.root >= 40 ? rt.pal.root - 12 : rt.pal.root);
  if (used.has('K')) {
    const k = taiko(rt, -4);
    k.connect(bus);
    hits.K = mono((t, v) => k.triggerAttackRelease(mtof(root + rand(-0.15, 0.15)), 0.02, t, v));
  }
  if (used.has('T')) {
    const tm = tom(rt, -9);
    tm.connect(bus);
    const notes = o.tomNotes ?? [root + 7, root + 12, root + 10];
    hits.T = mono((t, v) => tm.triggerAttackRelease(mtof(pick(notes)), 0.02, t, v));
  }
  if (used.has('S')) {
    const sl = noiseHit(rt, { filter: 'bandpass', freq: 1700, q: 1.1, decay: 0.14, volume: -12 });
    const body = tom(rt, -16);
    sl.filter.connect(bus);
    body.connect(bus);
    hits.S = mono((t, v) => {
      sl.synth.triggerAttackRelease(0.004, t, v);
      body.triggerAttackRelease(mtof(root + 19), 0.01, t, v * 0.6);
    });
  }
  if (used.has('H')) {
    const h = noiseHit(rt, { filter: 'highpass', freq: 6500, q: 0.7, decay: 0.045, volume: -22 });
    h.filter.connect(bus);
    hits.H = mono((t, v) => h.synth.triggerAttackRelease(0.002, t, v));
  }
  if (used.has('M')) {
    const m = metal(rt, { decay: 0.32, volume: -24, resonance: 1800 });
    m.connect(bus);
    hits.M = mono((t, v) => m.triggerAttackRelease(o.metalFreq ?? 180, 0.02, t, v));
  }
  if (used.has('B')) {
    const b = rt.bag.add(
      new MembraneSynth({
        pitchDecay: 0.12,
        octaves: 2.4,
        envelope: { attack: 0.003, decay: 0, sustain: 1, release: 1.8, releaseCurve: EXP },
        volume: -4,
      }),
    );
    const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 160, rolloff: -24 }));
    b.chain(lp, bus);
    hits.B = mono((t, v) => b.triggerAttackRelease(mtof(rt.pal.root - 12), 0.02, t, v));
  }

  const phrase = o.phraseBars ?? 4;
  const choice: Partial<Record<DrumVoice, string>> = {};
  const choose = (bar: number) => {
    const isFill = bar % phrase === phrase - 1;
    for (const key of used) {
      const fill = o.fills?.[key];
      if (isFill && fill && chance(0.75)) {
        choice[key] = fill;
        continue;
      }
      const list = o.patterns[key];
      if (key === 'H' && rt.intensity < (o.hatFrom ?? 0.5)) {
        choice[key] = o.softHat ?? '';
      } else if (list?.length) {
        choice[key] = chance(0.65) ? list[0] : pick(list);
      }
    }
  };

  return {
    step(t, s) {
      const i = rt.inBar(s);
      if (i === 0) choose(rt.bar(s));
      for (const key of used) {
        const pat = choice[key];
        if (!pat) continue;
        const c = pat[i % pat.length];
        let v = 0;
        if (c === 'X') v = 1;
        else if (c === 'x') v = 0.72;
        else if (c === 'o') v = chance(0.5 + rt.intensity * 0.5) ? 0.32 : 0;
        else if (c === '?') v = chance(0.25 + rt.intensity * 0.35) ? rand(0.35, 0.6) : 0;
        if (v <= 0) continue;
        hits[key]?.trigger(rt.human(t, 0.008), clamp(v * rand(0.9, 1.05), 0.05, 1));
      }
    },
    sanity(_s, t) {
      shifter?.frequency.rampTo(1 + rt.wobble * 6 + rt.dissonance * 20, 3, t);
    },
  };
}

// ===========================================================================
// Ostinato — 저음 반복 음형 (화음 베이스 기준 반음 오프셋)
// ===========================================================================

export interface OstinatoOpts {
  /** null = 쉼. 한 원소 = grid 칸 */
  patterns: readonly (readonly (number | null)[])[];
  grid?: number;
  octave?: number;
  volume?: number;
  type?: 'sawtooth' | 'square' | 'fatsawtooth';
  cutoff?: number;
  /** 강도 이 이상이면 한 옥타브 위 겹침 */
  doubleFrom?: number;
  /** 강도 이 이상이면 사이 칸에 고스트 음 */
  fillFrom?: number;
  /** 패턴 위치별 고정 미분음(cents) — 영주용 */
  micro?: readonly number[];
  sends?: Sends;
  /** n마디마다 패턴 교체 */
  changeBars?: number;
}

export function ostinato(rt: Runtime, o: OstinatoOpts): Layer {
  const lo = bassSynth(rt, { volume: o.volume ?? -11, type: o.type ?? 'sawtooth', cutoff: o.cutoff ?? 85 });
  const hi = bassSynth(rt, { volume: (o.volume ?? -11) - 9, type: 'square', cutoff: 300, env: 2.5 });
  rt.route(lo, o.sends ?? { dry: 1, verb: 0.08 });
  rt.route(hi, { dry: 1, verb: 0.2, echo: 0.1 });
  const grid = o.grid ?? 2;
  let pat = o.patterns[0];
  let lastLo = 0;
  let lastHi = 0;
  const play = (synth: MonoSynth, hz: number, t: number, len: number, v: number, isHi: boolean) => {
    const tt = Math.max(t, (isHi ? lastHi : lastLo) + 0.004);
    if (isHi) lastHi = tt;
    else lastLo = tt;
    synth.triggerAttackRelease(hz, len, tt, clamp(v, 0.01, 1));
  };
  return {
    step(t, s) {
      const i = rt.inBar(s);
      if (i === 0 && rt.bar(s) % (o.changeBars ?? 2) === 0) pat = chance(0.6) ? o.patterns[0] : pick(o.patterns);
      const onGrid = i % grid === 0;
      const idx = Math.floor(i / grid) % pat.length;
      const off = pat[idx];
      if (off === null) return;
      const microC = o.micro ? o.micro[idx % o.micro.length] : 0;
      const m = rt.harmony.bass(o.octave ?? 0) + off + (microC + rt.detune(0.4)) / 100;
      const len = rt.stepDur * grid * 0.75;
      if (onGrid) {
        const accent = i === 0 ? 1 : i % (rt.stepsPerBeat * 2) === 0 ? 0.85 : 0.65;
        play(lo, mtof(m), t, len, accent * rand(0.9, 1), false);
        if (rt.intensity >= (o.doubleFrom ?? 0.55)) play(hi, mtof(m + 12), t, len * 0.8, accent * 0.7, true);
      } else if (grid > 1 && i % grid === Math.floor(grid / 2) && rt.intensity >= (o.fillFrom ?? 0.7) && chance(0.6)) {
        play(lo, mtof(m), t, len * 0.5, 0.35, false);
      }
    },
    intensity(x) {
      lo.filterEnvelope.octaves = 2.6 + x * 1.6;
      lo.filter.Q.value = 2 + x * 3;
    },
  };
}

// ===========================================================================
// Stabs — 금관 같은 저음 화음 타격
// ===========================================================================

export interface StabOpts {
  /** 마디 안에서 타격할 칸들 */
  hits: readonly number[];
  /** n마디마다 */
  every?: number;
  prob?: number;
  volume?: number;
  cutoff?: number;
  octave?: number;
  /** 길게 끄는 스웰(초) — 0이면 짧은 스탭 */
  hold?: number;
  cluster?: boolean;
  sends?: Sends;
}

export function stabs(rt: Runtime, o: StabOpts): Layer {
  const synth = brass(rt, { volume: o.volume ?? -14, attack: o.hold ? 0.25 : 0.03, release: o.hold ? 1.6 : 0.5 });
  const filt = rt.bag.add(new Filter({ type: 'lowpass', frequency: 300, Q: 1.2, rolloff: -24 }));
  synth.connect(filt);
  rt.route(filt, o.sends ?? { dry: 1, verb: 0.35 });
  const top = (o.cutoff ?? 1800) * rt.pal.bright;
  return {
    step(t, s) {
      if (rt.bar(s) % (o.every ?? 1) !== 0) return;
      if (!o.hits.includes(rt.inBar(s))) return;
      if (!chance((o.prob ?? 0.8) * (0.6 + rt.intensity * 0.5))) return;
      const b = rt.harmony.bass(o.octave ?? 1);
      let notes = o.cluster ? [b, b + 1, b + 7] : [b, b + 7, b + 12];
      notes = addDissonance(notes, rt.dissonance);
      const dur = o.hold ?? rt.stepDur * 1.5;
      synth.triggerAttackRelease(notes.map((m) => rt.hz(m, 0.5)), dur, t, rand(0.6, 0.85));
      filt.frequency.cancelAndHoldAtTime(t);
      filt.frequency.setValueAtTime(220, t);
      filt.frequency.exponentialRampToValueAtTime(clamp(top * (0.8 + rt.intensity * 0.6), 200, 9000), t + (o.hold ? o.hold * 0.6 : 0.05));
      filt.frequency.exponentialRampToValueAtTime(380, t + dur + 0.4);
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

// ===========================================================================
// Riser + impact — 프레이즈 경계의 긴장 상승과 착지
// ===========================================================================

export interface RiserOpts {
  phraseBars?: number;
  /** 상승 길이(박) */
  beats?: number;
  level?: number;
  /** 이 강도 이상일 때만 (기본 0) */
  from?: number;
  prob?: number;
  pitched?: boolean;
  impact?: boolean;
}

export function riser(rt: Runtime, o: RiserOpts = {}): Layer {
  const noise = rt.bag.add(new Noise({ type: 'white', volume: -8 }));
  const bp = rt.bag.add(new Filter({ type: 'bandpass', frequency: 400, Q: 1.6, rolloff: -12 }));
  const amp = rt.bag.add(new Gain(0));
  noise.chain(bp, amp);
  rt.route(amp, { dry: 1, verb: 0.45 });
  let siren: Synth | undefined;
  let sirenLp: Filter | undefined;
  if (o.pitched) {
    siren = rt.bag.add(
      new Synth({
        oscillator: { type: 'fatsawtooth', count: 2, spread: 30 },
        envelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.08 },
        volume: -24,
      }),
    );
    sirenLp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 1800, rolloff: -12 }));
    siren.connect(sirenLp);
    rt.route(sirenLp, { dry: 1, verb: 0.4 });
  }
  let crash: NoiseSynth | undefined;
  let boom: MembraneSynth | undefined;
  if (o.impact) {
    crash = rt.bag.add(
      new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.002, decay: 0, sustain: 1, release: 1.6, releaseCurve: EXP },
        volume: -20,
      }),
    );
    const clp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 5200, rolloff: -12 }));
    crash.connect(clp);
    rt.route(clp, { dry: 1, verb: 0.5 });
    boom = rt.bag.add(
      new MembraneSynth({
        pitchDecay: 0.18,
        octaves: 3,
        envelope: { attack: 0.003, decay: 0, sustain: 1, release: 2.2, releaseCurve: EXP },
        volume: -3,
      }),
    );
    const blp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 140, rolloff: -24 }));
    boom.connect(blp);
    rt.route(blp, { dry: 1, verb: 0.25 });
  }
  let started = false;
  let armed = false;
  let lastImpact = 0;
  return {
    start(t) {
      noise.start(t);
      started = true;
    },
    step(t, s) {
      if (!started) return;
      const phrase = rt.stepsPerBar * (o.phraseBars ?? 4);
      const riseSteps = Math.round(rt.stepsPerBeat * (o.beats ?? 4));
      const pos = s % phrase;
      if (pos === phrase - riseSteps) {
        armed = rt.intensity >= (o.from ?? 0) && chance(o.prob ?? 0.7);
        if (!armed) return;
        const dur = riseSteps * rt.stepDur;
        const peak = (o.level ?? 0.22) * (0.7 + rt.intensity * 0.6);
        amp.gain.cancelAndHoldAtTime(t);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(peak * 0.25, t + dur * 0.6);
        amp.gain.linearRampToValueAtTime(peak, t + dur - 0.01);
        amp.gain.linearRampToValueAtTime(0, t + dur);
        bp.frequency.cancelAndHoldAtTime(t);
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(7500, t + dur);
        if (siren && sirenLp) {
          const b = rt.harmony.bass(1);
          siren.triggerAttackRelease(mtof(b), dur, t, 0.7);
          siren.frequency.exponentialRampToValueAtTime(mtof(b + 12 + (chance(rt.dissonance) ? 1 : 0)), t + dur);
        }
      } else if (pos === 0 && s > 0 && armed) {
        armed = false;
        if (crash && boom && t > lastImpact + 0.05) {
          lastImpact = t;
          crash.triggerAttackRelease(0.01, t, rand(0.5, 0.8));
          boom.triggerAttackRelease(mtof(rt.pal.root - 12), 0.02, t, 0.95);
        }
      }
    },
    stop(t) {
      noise.stop(t);
    },
  };
}

// ===========================================================================
// Glass arpeggio — 3막 유리 같은 16분음표 아르페지오
// ===========================================================================

export function glassArp(rt: Runtime, o: { lo?: number; hi?: number; density?: number; volume?: number; from?: number } = {}): Layer {
  const synth = rt.bag.add(
    new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.5, releaseCurve: EXP },
      volume: o.volume ?? -20,
    }),
  );
  const shim = rt.bag.add(
    new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: 0.3, releaseCurve: EXP },
      volume: (o.volume ?? -20) - 8,
    }),
  );
  rt.route(synth, { dry: 0.7, verb: 0.6, echo: 0.6 });
  rt.route(shim, { dry: 0.5, verb: 0.5, echo: 0.5 });
  let dir = 1;
  let idx = 0;
  let last = 0;
  return {
    step(t, s) {
      if (rt.intensity < (o.from ?? 0)) return;
      if (!chance((o.density ?? 0.55) * (0.6 + rt.intensity * 0.6))) return;
      const tones = rt.harmony.chordTonesIn(o.lo ?? rt.pal.root + 36, o.hi ?? rt.pal.root + 60, 3);
      if (!tones.length) return;
      idx += dir;
      if (idx >= tones.length - 1 || idx <= 0) dir = -dir;
      idx = clamp(idx, 0, tones.length - 1);
      const tt = Math.max(t, last + 0.004);
      last = tt;
      const m = tones[idx];
      synth.triggerAttackRelease(rt.hz(m, 0.8), 0.01, tt, rand(0.25, 0.55));
      if (rt.isBeat(s)) shim.triggerAttackRelease(rt.hz(m + 12, 1.5), 0.01, tt, 0.3);
    },
  };
}

/** 프레이즈 시작에서 짧게 내뱉는 합창 "아!" 등 — 임의 화음 신스용 */
export function accent(rt: Runtime, play: (t: number) => void, o: { every?: number; prob?: number } = {}): Layer {
  return {
    step(t, s) {
      if (rt.isBar(s, o.every ?? 4) && chance(o.prob ?? 0.8)) play(t);
    },
  };
}
