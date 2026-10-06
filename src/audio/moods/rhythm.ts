import { Gain, dbToGain } from 'tone';
import { addDissonance, chance, clamp, mtof, pick, rand } from '../scales';
import { NativeLfo, NoiseSynth, OscSynth, noiseSource, startNoise } from '../synth';
import { bassSynth, biquad, boomDrum, brass, fq, metal, noiseHit, taiko, tom, type BassSynth } from './instruments';
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
  /** 필인을 칠 마디 (주면 phraseBars 대신 이것으로 정하고, 해당 마디엔 거의 항상 친다) */
  fillWhen?: (bar: number) => boolean;
  level?: number;
  sends?: Sends;
  /** 타이코 음높이 (MIDI) */
  taikoNote?: number;
  tomNotes?: readonly number[];
  /** 금속 소리 기본 주파수 */
  metalFreq?: number;
  /** 북 소리가 늘어지듯 일렁인다 (균열) */
  warp?: boolean;
}

type Hit = (t: number, v: number) => void;

export function drumKit(rt: Runtime, o: KitOpts): Layer {
  const bus = rt.bag.add(new Gain({ context: rt.ctx, gain: o.level ?? 1 }));
  let warpLfo: NativeLfo | undefined;
  if (o.warp) {
    // 지연시간을 흔드는 '늘어진 테이프' 효과 (FrequencyShifter보다 훨씬 가볍다)
    const delay = rt.ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    rt.bag.add({ dispose: () => delay.disconnect() });
    const wet = rt.bag.add(new Gain({ context: rt.ctx, gain: 0.7 }));
    const dry = rt.bag.add(new Gain({ context: rt.ctx, gain: 0.5 }));
    bus.connect(delay);
    delay.connect(wet.input);
    bus.connect(dry);
    warpLfo = rt.bag.add(new NativeLfo(rt.ctx, 0.7, 0.004, delay.delayTime));
    rt.route(wet, o.sends ?? { dry: 1, verb: 0.2 });
    rt.route(dry, o.sends ?? { dry: 1, verb: 0.2 });
  } else {
    rt.route(bus, o.sends ?? { dry: 1, verb: 0.2 });
  }
  const used = new Set<DrumVoice>(Object.keys(o.patterns) as DrumVoice[]);
  if (o.softHat) used.add('H');
  const hits: Partial<Record<DrumVoice, Hit>> = {};
  const root = o.taikoNote ?? (rt.pal.root >= 40 ? rt.pal.root - 12 : rt.pal.root);
  if (used.has('K')) {
    const k = taiko(rt, -4);
    k.output.connect(bus);
    hits.K = (t, v) => k.hit(mtof(root + rand(-0.15, 0.15)), t, v);
  }
  if (used.has('T')) {
    const tm = tom(rt, -9);
    tm.output.connect(bus);
    const notes = o.tomNotes ?? [root + 7, root + 12, root + 10];
    hits.T = (t, v) => tm.hit(mtof(pick(notes)), t, v);
  }
  if (used.has('S')) {
    const sl = noiseHit(rt, { filter: 'bandpass', freq: 1700, q: 1.1, decay: 0.14, volume: -12 });
    const body = tom(rt, -16);
    sl.filter.connect(bus);
    body.output.connect(bus);
    hits.S = (t, v) => {
      sl.synth.hit(t, 0.004, v);
      body.hit(mtof(root + 19), t, v * 0.6);
    };
  }
  if (used.has('H')) {
    const h = noiseHit(rt, { filter: 'highpass', freq: 6500, q: 0.7, decay: 0.045, volume: -22 });
    h.filter.connect(bus);
    hits.H = (t, v) => h.synth.hit(t, 0.002, v);
  }
  if (used.has('M')) {
    const m = metal(rt, { freq: o.metalFreq ?? 380, decay: 0.32, volume: -16 });
    m.output.connect(bus);
    hits.M = (t, v) => m.hit(t, v);
  }
  if (used.has('B')) {
    const b = boomDrum(rt, -8, 1.8);
    const lp = biquad(rt, 'lowpass', 160, 0.7);
    b.output.chain(lp, bus);
    hits.B = (t, v) => b.hit(mtof(rt.pal.root - 12), t, v);
  }

  const phrase = o.phraseBars ?? 4;
  const choice: Partial<Record<DrumVoice, string>> = {};
  const choose = (bar: number) => {
    const isFill = o.fillWhen ? o.fillWhen(bar) : bar % phrase === phrase - 1;
    const fillP = o.fillWhen ? 0.92 : 0.75;
    for (const key of used) {
      const fill = o.fills?.[key];
      if (isFill && fill && chance(fillP)) {
        choice[key] = fill;
        continue;
      }
      const list = o.patterns[key];
      if (key === 'H' && rt.intensity < (o.hatFrom ?? 0.5)) choice[key] = o.softHat ?? '';
      else if (list?.length) choice[key] = chance(0.65) ? list[0] : pick(list);
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
        hits[key]?.(rt.human(t, 0.008), clamp(v * rand(0.9, 1.05), 0.05, 1));
      }
    },
    sanity(_s, t) {
      if (!warpLfo) return;
      warpLfo.osc.frequency.setTargetAtTime(0.7 + rt.wobble * 1.5 + rt.dissonance * 2.5, t, 1);
      warpLfo.depth.gain.setTargetAtTime(0.004 + rt.dissonance * 0.006, t, 1);
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
  /** dB */
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
  const vol = o.volume ?? -11;
  const lo: BassSynth = bassSynth(rt, { volume: vol, type: o.type ?? 'sawtooth', cutoff: o.cutoff ?? 85 });
  const hi: BassSynth = bassSynth(rt, { volume: vol - 9, type: 'square', cutoff: 300, env: 2.5 });
  rt.route(lo, o.sends ?? { dry: 1, verb: 0.08 });
  rt.route(hi, { dry: 1, verb: 0.2, echo: 0.1 });
  const grid = o.grid ?? 2;
  let pat = o.patterns[0];
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
        lo.triggerAttackRelease(mtof(m), len, t, accent * rand(0.9, 1));
        if (rt.intensity >= (o.doubleFrom ?? 0.55)) hi.triggerAttackRelease(mtof(m + 12), len * 0.8, t, accent * 0.7);
      } else if (grid > 1 && i % grid === Math.floor(grid / 2) && rt.intensity >= (o.fillFrom ?? 0.7) && chance(0.6)) {
        lo.triggerAttackRelease(mtof(m), len * 0.5, t, 0.35);
      }
    },
    stop(t) {
      lo.releaseAll(t);
      hi.releaseAll(t);
    },
    intensity(x, t) {
      lo.octaves = 2.6 + x * 1.6;
      lo.setQ(2 + x * 3, t);
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
  /** dB */
  volume?: number;
  cutoff?: number;
  octave?: number;
  /** 길게 끄는 스웰(초) — 0이면 짧은 스탭 */
  hold?: number;
  cluster?: boolean;
  sends?: Sends;
}

export function stabs(rt: Runtime, o: StabOpts): Layer {
  const synth = brass(rt, { volume: o.volume ?? -14, attack: o.hold ? 0.25 : 0.03, release: o.hold ? 1.6 : 0.5, poly: 6 });
  const filt = biquad(rt, 'lowpass', 300, 1.2);
  synth.output.connect(filt);
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
      synth.triggerAttackRelease(
        notes.map((m) => rt.hz(m, 0.5)),
        dur,
        t,
        rand(0.6, 0.85),
      );
      const p = filt.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(220, t);
      p.exponentialRampToValueAtTime(fq(rt.ctx, clamp(top * (0.8 + rt.intensity * 0.6), 200, 9000)), t + (o.hold ? o.hold * 0.6 : 0.05));
      p.exponentialRampToValueAtTime(380, t + dur + 0.4);
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
  const bp = biquad(rt, 'bandpass', 400, 1.6);
  const amp = rt.bag.add(new Gain({ context: rt.ctx, gain: 0 }));
  bp.connect(amp);
  rt.route(amp, { dry: 1, verb: 0.45 });
  let siren: OscSynth | undefined;
  if (o.pitched) {
    siren = rt.bag.add(
      new OscSynth(rt.ctx, { wave: 'sawtooth', detunes: [-15, 15], env: { a: 0.5, r: 0.08 }, level: dbToGain(-29), max: 2 }),
    );
    const lp = biquad(rt, 'lowpass', 1800, 0.7);
    siren.output.connect(lp);
    rt.route(lp, { dry: 1, verb: 0.4 });
  }
  let crash: NoiseSynth | undefined;
  let boom: ReturnType<typeof boomDrum> | undefined;
  if (o.impact) {
    crash = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'white', env: { a: 0.002, r: 1.6 }, level: dbToGain(-14.3), max: 2 }));
    const clp = biquad(rt, 'lowpass', 5200, 0.7);
    crash.output.connect(clp);
    rt.route(clp, { dry: 1, verb: 0.5 });
    boom = boomDrum(rt, -7, 2.2);
    const blp = biquad(rt, 'lowpass', 140, 0.7);
    boom.output.connect(blp);
    rt.route(blp, { dry: 1, verb: 0.25 });
  }
  let armed = false;
  return {
    step(t, s) {
      const phrase = rt.stepsPerBar * (o.phraseBars ?? 4);
      const riseSteps = Math.round(rt.stepsPerBeat * (o.beats ?? 4));
      const pos = s % phrase;
      if (pos === phrase - riseSteps) {
        armed = rt.intensity >= (o.from ?? 0) && chance(o.prob ?? 0.7);
        if (!armed) return;
        const dur = riseSteps * rt.stepDur;
        const peak = (o.level ?? 0.17) * (0.7 + rt.intensity * 0.6);
        // 노이즈 소스는 상승 구간에만 돌린다
        const src = noiseSource(rt.ctx, 'white');
        src.connect(bp.input);
        startNoise(src, t);
        src.stop(t + dur + 0.05);
        src.onended = () => src.disconnect();
        amp.gain.cancelScheduledValues(t);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(peak * 0.25, t + dur * 0.6);
        amp.gain.linearRampToValueAtTime(peak, t + dur - 0.01);
        amp.gain.linearRampToValueAtTime(0, t + dur);
        const p = bp.frequency;
        p.cancelScheduledValues(t);
        p.setValueAtTime(300, t);
        p.exponentialRampToValueAtTime(fq(rt.ctx, 7500), t + dur);
        if (siren) {
          const b = rt.harmony.bass(1);
          const target = mtof(b + 12 + (chance(rt.dissonance) ? 1 : 0));
          for (const osc of siren.play(mtof(b), dur, t, 0.7)) osc.frequency.exponentialRampToValueAtTime(target, t + dur);
        }
      } else if (pos === 0 && s > 0 && armed) {
        armed = false;
        crash?.hit(t, 0.01, rand(0.5, 0.8));
        boom?.hit(mtof(rt.pal.root - 12), t, 0.95);
      }
    },
  };
}

// ===========================================================================
// Glass arpeggio — 3막 유리 같은 16분음표 아르페지오
// ===========================================================================

export function glassArp(rt: Runtime, o: { lo?: number; hi?: number; density?: number; volume?: number; from?: number } = {}): Layer {
  const vol = o.volume ?? -20;
  const synth = rt.bag.add(new OscSynth(rt.ctx, { wave: 'sine', env: { a: 0.002, r: 0.5 }, level: dbToGain(vol), max: 6 }));
  const shim = rt.bag.add(new OscSynth(rt.ctx, { wave: 'triangle', env: { a: 0.002, r: 0.3 }, level: dbToGain(vol - 8), max: 3 }));
  rt.route(synth, { dry: 0.7, verb: 0.6, echo: 0.6 });
  rt.route(shim, { dry: 0.5, verb: 0.5, echo: 0.5 });
  let dir = 1;
  let idx = 0;
  return {
    step(t, s) {
      if (rt.intensity < (o.from ?? 0)) return;
      if (!chance((o.density ?? 0.55) * (0.6 + rt.intensity * 0.6))) return;
      const tones = rt.harmony.chordTonesIn(o.lo ?? rt.pal.root + 36, o.hi ?? rt.pal.root + 60, 3);
      if (!tones.length) return;
      idx += dir;
      if (idx >= tones.length - 1 || idx <= 0) dir = -dir;
      idx = clamp(idx, 0, tones.length - 1);
      const m = tones[idx];
      synth.play(rt.hz(m, 0.8), 0.01, t, rand(0.25, 0.55));
      if (rt.isBeat(s)) shim.play(rt.hz(m + 12, 1.5), 0.01, t, 0.3);
    },
  };
}
