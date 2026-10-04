import { Gain, Panner, dbToGain } from 'tone';
import { addDissonance, chance, clamp, expWait, mtof, pick, rand, randInt, weighted } from '../scales';
import {
  DrumSynth,
  FmSynth,
  NoiseSynth,
  OscSynth,
  Sustain,
  applyEnv,
  cleanup,
  noiseSource,
  startNoise,
  unlink,
  type BasicWave,
  type Playable,
} from '../synth';
import { biquad, fmBell, padSynth, spreadDetunes, sweep, type PadOpts } from './instruments';
import { randPan, type Layer, type Runtime, type Sends } from './runtime';

export type { Playable } from '../synth';

const vel = (r: readonly [number, number] | undefined, d: readonly [number, number]): number => {
  const [a, b] = r ?? d;
  return clamp(rand(a, b), 0.01, 1);
};

/** 무드가 끝날 때 정리할 네이티브 소스 */
function holdSource(rt: Runtime, src: AudioScheduledSourceNode): void {
  rt.bag.add({
    dispose() {
      try {
        src.stop();
      } catch {
        /* 이미 정지 */
      }
      src.disconnect();
    },
  });
}

// ===========================================================================
// Drone — 디튠된 톱니파 묶음 → (어두운/밝은 로우패스 크로스페이드로 '호흡')
// ===========================================================================

export interface DroneOpts {
  /** follow=true면 화음 베이스 기준 반음 오프셋, 아니면 절대 MIDI */
  notes: number[];
  follow?: boolean;
  octave?: number;
  type?: BasicWave;
  count?: number;
  spread?: number;
  cutoff?: number;
  q?: number;
  /** 호흡 속도(Hz, 대략) */
  lfoRate?: number;
  /** 호흡 깊이 (0..1.5) */
  lfoOct?: number;
  level?: number;
  sends?: Sends;
  glide?: number;
  /** 강도에 따른 필터 개방 배율 */
  open?: number;
}

export function drone(rt: Runtime, o: DroneOpts): Layer {
  const cutoff = (o.cutoff ?? 300) * rt.pal.bright;
  const pitches = (): number[] => (o.follow ? o.notes.map((n) => rt.harmony.bass(o.octave ?? 0) + n) : o.notes);
  const src = rt.bag.add(
    new Sustain(rt.ctx, o.type ?? 'sawtooth', pitches().map(mtof), spreadDetunes(o.count ?? 3, o.spread ?? 14), o.level ?? 0.5),
  );
  // 필터 계수를 계속 다시 계산하지 않도록 고정 필터 두 개를 게인으로 크로스페이드
  const dark = biquad(rt, 'lowpass', cutoff * 0.65, o.q ?? 0.9);
  const bright = biquad(rt, 'lowpass', cutoff * 1.8, o.q ?? 0.9);
  const gDark = rt.bag.add(new Gain({ context: rt.ctx, gain: 1 }));
  const gBright = rt.bag.add(new Gain({ context: rt.ctx, gain: 0 }));
  const mix = rt.bag.add(new Gain({ context: rt.ctx, gain: 1 }));
  src.output.fan(dark, bright);
  dark.chain(gDark, mix);
  bright.chain(gBright, mix);
  rt.route(mix, o.sends ?? { dry: 1, verb: 0.3 });
  const depth = clamp((o.lfoOct ?? 0.7) / 1.2, 0, 1);
  const period = 1 / (o.lfoRate ?? 0.04);
  let nextBreath = 0;
  let lastDegree = rt.harmony.degree;
  return {
    start(t) {
      src.start(t, 3);
      nextBreath = t + rand(1, period * 0.3);
    },
    step(t, s) {
      if (t >= nextBreath) {
        const dur = (period / 2) * rand(0.6, 1.3);
        const x = rand(0.1, 1) * depth;
        gBright.gain.rampTo(x, dur, t);
        gDark.gain.rampTo(1 - x * 0.6, dur, t);
        nextBreath = t + dur;
      }
      if (o.follow && rt.isBar(s) && rt.harmony.degree !== lastDegree) {
        lastDegree = rt.harmony.degree;
        src.glide(pitches().map(mtof), t, o.glide ?? 1.5);
      }
    },
    stop(t) {
      src.stop(t);
    },
    sanity(_s, t) {
      src.spread(1 + rt.wobble * 0.8 + rt.dissonance * 3, t);
    },
    intensity(x, t) {
      const k = 1 + x * (o.open ?? 1.2);
      sweep(dark, cutoff * 0.65 * k, 3, t);
      sweep(bright, cutoff * 1.8 * k, 3, t);
    },
  };
}

// ===========================================================================
// Chords — 패드/합창용 화음 진행 (보이스 리딩 + 정신력 불협화)
// ===========================================================================

export function voiceLead(notes: number[], prev: number[]): number[] {
  if (!prev.length) return notes.slice().sort((a, b) => a - b);
  const pc = prev.reduce((a, b) => a + b, 0) / prev.length;
  const nc = notes.reduce((a, b) => a + b, 0) / notes.length;
  const center = (pc + nc) / 2;
  const out = notes.map((n) => {
    let m = n;
    while (m - center > 6) m -= 12;
    while (center - m > 6) m += 12;
    return m;
  });
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface ChordOpts {
  size?: number;
  octave?: number;
  /** 화음 간격(마디). 기본 rt.chordBars */
  every?: number;
  prob?: number;
  vel?: readonly [number, number];
  overlap?: number;
  /** 색채음(9도/sus) 추가 확률 */
  color?: number;
  /** 정신력과 무관한 기본 불안감 */
  unease?: number;
  /** 근음을 한 옥타브 아래로 (오픈 보이싱) */
  drop?: boolean;
  detune?: number;
  onChord?(t: number, notes: number[]): void;
}

export function chords(rt: Runtime, synth: Playable, o: ChordOpts = {}): Layer {
  let prev: number[] = [];
  const every = o.every ?? rt.chordBars;
  return {
    step(t, s) {
      if (!rt.isBar(s, every) || !chance(o.prob ?? 1)) return;
      const oct = o.octave ?? 1;
      let notes = voiceLead(rt.harmony.chord(o.size ?? 3, oct), prev);
      if (o.color && chance(o.color)) notes.push(rt.harmony.note(pick([1, 3, 8]), oct));
      if (o.drop) notes[0] -= 12;
      notes = addDissonance(notes, Math.max(rt.dissonance, o.unease ?? 0));
      prev = notes;
      const dur = rt.barDur * every + (o.overlap ?? 0.4);
      synth.triggerAttackRelease(
        notes.map((m) => rt.hz(m, o.detune ?? 0.6)),
        dur,
        rt.human(t, 0.04),
        vel(o.vel, [0.35, 0.55]),
      );
      o.onChord?.(t, notes);
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

export interface PadLayerOpts extends PadOpts, ChordOpts {
  cutoff?: number;
  q?: number;
  /** 넓게 (오실레이터 3개, 디튠 폭 확대) */
  chorus?: boolean;
  sends?: Sends;
  lfoRate?: number;
}

/** 패드 신스 + 로우패스 + 화음 진행 */
export function pad(rt: Runtime, o: PadLayerOpts = {}): Layer {
  const synth = padSynth(rt, o.chorus ? { ...o, count: 3, spread: Math.max(o.spread ?? 16, 26) } : o);
  const cutoff = (o.cutoff ?? 1200) * rt.pal.bright;
  const filt = biquad(rt, 'lowpass', cutoff, o.q ?? 0.6);
  synth.output.connect(filt);
  rt.route(filt, o.sends ?? { dry: 1, verb: 0.55 });
  const inner = chords(rt, synth, o);
  const target = () => clamp(cutoff * (1 + rt.intensity * 0.8) * (1 - rt.wobble * 0.45), 80, 12000);
  return {
    step(t, s) {
      // 화음이 바뀔 때 밝기를 조금씩 흔든다 (LFO 대신 램프)
      if (rt.isBar(s, o.every ?? rt.chordBars)) sweep(filt, target() * rand(0.75, 1.25), rt.barDur, t);
      inner.step?.(t, s);
    },
    stop(t) {
      inner.stop?.(t);
    },
    sanity(_s, t) {
      sweep(filt, target(), 4, t);
    },
    intensity(_x, t) {
      sweep(filt, target(), 3, t);
    },
  };
}

// ===========================================================================
// Melody — 음계 위 무작위 보행 + 프레이즈/쉼 구조
// ===========================================================================

export interface MelodyOpts {
  lo: number;
  hi: number;
  /** 음표 후보 간격(칸). 기본 1박 */
  grid?: number;
  density?: number;
  phrase?: readonly [number, number];
  rest?: readonly [number, number];
  vel?: readonly [number, number];
  /** 발음 유지 시간(초) */
  hold?: number;
  /** 아래 음 하나 더 */
  dyad?: number;
  /** 마디 첫 박에 화음음으로 끌리는 확률 */
  pull?: number;
  leap?: number;
  detune?: number;
  humanize?: number;
  startResting?: boolean;
}

export function melody(rt: Runtime, synth: Playable, o: MelodyOpts): Layer {
  let playing = !o.startResting;
  let barsLeft = playing ? randInt(...(o.phrase ?? [2, 4])) : randInt(...(o.rest ?? [1, 3]));
  let cur = Math.round((o.lo + o.hi) / 2);
  const grid = o.grid ?? rt.stepsPerBeat;
  return {
    step(t, s) {
      if (s > 0 && rt.isBar(s)) {
        barsLeft--;
        if (barsLeft <= 0) {
          playing = !playing;
          barsLeft = playing ? randInt(...(o.phrase ?? [2, 4])) : randInt(...(o.rest ?? [1, 3]));
        }
      }
      if (!playing || s % grid !== 0) return;
      const strong = rt.isBar(s);
      if (!chance((o.density ?? 0.5) * (strong ? 1.4 : 1))) return;
      const pool = rt.harmony.scaleIn(o.lo, o.hi);
      if (!pool.length) return;
      let idx = nearestIndex(pool, cur);
      if (strong && chance(o.pull ?? 0.6)) {
        const tones = rt.harmony.chordTonesIn(o.lo, o.hi);
        if (tones.length) {
          cur = tones[nearestIndex(tones, cur)];
          idx = nearestIndex(pool, cur);
        }
      } else {
        const moveBy = chance(o.leap ?? 0.12) ? pick([-4, -3, 3, 4]) : weighted<number>([[-2, 2], [-1, 5], [0, 1], [1, 5], [2, 2]]);
        idx = clamp(idx + moveBy, 0, pool.length - 1);
        if (idx === 0 || idx === pool.length - 1) idx = clamp(idx + (idx === 0 ? 2 : -2), 0, pool.length - 1);
        cur = pool[idx];
      }
      const notes = [cur];
      if (o.dyad && chance(o.dyad)) notes.push(pool[idx - pick([2, 3, 5])] ?? cur - 12);
      const v = vel(o.vel, [0.25, 0.55]) * (strong ? 1.15 : 1);
      synth.triggerAttackRelease(
        notes.map((m) => rt.hz(m, o.detune ?? 0.5)),
        o.hold ?? 0.05,
        rt.human(t, o.humanize ?? 0.025),
        clamp(v, 0.01, 1),
      );
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

function nearestIndex(arr: readonly number[], x: number): number {
  let best = 0;
  let bd = Infinity;
  arr.forEach((v, i) => {
    const d = Math.abs(v - x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ===========================================================================
// Bells — 멀리서 울리는 종 (수도원 / 항구 부표)
// ===========================================================================

export interface BellLayerOpts {
  /** palette root 기준 반음 */
  notes: number[];
  harmonicity?: number;
  index?: number;
  ring?: number;
  /** dB */
  volume?: number;
  /** 평균 간격(초) */
  every?: number;
  strikes?: readonly [number, number];
  gap?: number;
  sends?: Sends;
  /** 한 옥타브 아래 허밍 음 */
  hum?: boolean;
}

export function bells(rt: Runtime, o: BellLayerOpts): Layer {
  const synth = fmBell(rt, { harmonicity: o.harmonicity ?? 1.4, index: o.index ?? 6, ring: o.ring ?? 6, shine: 1.6, volume: o.volume ?? -16, poly: 6 });
  const pan = rt.bag.add(new Panner({ context: rt.ctx, pan: randPan(0.5) }));
  synth.output.connect(pan);
  rt.route(pan, o.sends ?? { dry: 0.5, verb: 1, echo: 0.15 });
  let next = 0;
  return {
    start(t) {
      next = t + rand(2, (o.every ?? 14) * 0.6);
    },
    step(t) {
      if (t < next) return;
      const n = randInt(...(o.strikes ?? [1, 3]));
      const note = rt.pal.root + pick(o.notes);
      const gap = o.gap ?? 2.4;
      pan.pan.rampTo(randPan(0.6), 1, t);
      for (let i = 0; i < n; i++) {
        const tt = t + i * gap * rand(0.9, 1.1);
        const v = rand(0.45, 0.8) * (1 - i * 0.12);
        synth.play(rt.hz(note, 0.4), 0.02, tt, v);
        if (o.hum) synth.play(rt.hz(note - 12, 0.4), 0.02, tt, v * 0.6);
      }
      next = t + n * gap + expWait(o.every ?? 14) + 3;
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

// ===========================================================================
// Textures — 바다, 바람, 물방울, 불, 무적(안개 경적)
// ===========================================================================

export function sea(rt: Runtime, o: { level?: number; cutoff?: number; sends?: Sends } = {}): Layer {
  const src = noiseSource(rt.ctx, 'brown');
  holdSource(rt, src);
  const base = o.cutoff ?? 380;
  const lp = biquad(rt, 'lowpass', base, 0.4);
  const amp = rt.bag.add(new Gain({ context: rt.ctx, gain: 0 }));
  const pan = rt.bag.add(new Panner({ context: rt.ctx, pan: 0 }));
  src.connect(lp.input);
  lp.chain(amp, pan);
  rt.route(pan, o.sends ?? { dry: 1, verb: 0.25 });
  const L = (o.level ?? 0.5) * 0.42;
  let next = 0;
  return {
    start(t) {
      startNoise(src, t);
      amp.gain.setValueAtTime(L * 0.2, t);
      next = t;
    },
    step(t) {
      if (t < next) return;
      // 파도 하나: 밀려오며 밝아지고, 빠져나가며 어두워진다
      const up = rand(1.8, 3.4);
      const down = rand(3, 5.5);
      amp.gain.cancelAndHoldAtTime(t);
      amp.gain.linearRampToValueAtTime(L * rand(0.55, 1), t + up);
      amp.gain.linearRampToValueAtTime(L * rand(0.12, 0.25), t + up + down);
      sweep(lp, base * rand(1.8, 2.8), up, t);
      lp.frequency.exponentialRampToValueAtTime(base * 0.8, t + up + down);
      pan.pan.rampTo(randPan(0.5), up + down, t);
      next = t + (up + down) * rand(0.75, 1.05);
    },
    stop(t) {
      src.stop(t + 0.05);
    },
  };
}

export function wind(rt: Runtime, o: { level?: number; freq?: number; q?: number; rate?: number; sends?: Sends; type?: 'pink' | 'white' } = {}): Layer {
  const src = noiseSource(rt.ctx, o.type ?? 'pink');
  holdSource(rt, src);
  const f0 = o.freq ?? 520;
  const bp = biquad(rt, 'bandpass', f0, o.q ?? 1.4);
  const amp = rt.bag.add(new Gain({ context: rt.ctx, gain: 0 }));
  src.connect(bp.input);
  bp.connect(amp);
  rt.route(amp, o.sends ?? { dry: 0.7, verb: 0.6 });
  const L = (o.level ?? 0.35) * 0.33;
  const period = 1 / (o.rate ?? 0.045);
  let next = 0;
  return {
    start(t) {
      startNoise(src, t);
      amp.gain.setValueAtTime(L * 0.5, t);
      next = t;
    },
    step(t) {
      if (t < next) return;
      // 돌풍: 대역과 세기를 천천히 옮긴다
      const dur = (period / 3) * rand(0.5, 1.4);
      sweep(bp, f0 * Math.pow(2, rand(-1.4, 1.4)), dur, t);
      amp.gain.rampTo(L * rand(0.25, 1), dur * rand(0.5, 1), t);
      next = t + dur;
    },
    stop(t) {
      src.stop(t + 0.05);
    },
    intensity(x, t) {
      bp.Q.rampTo((o.q ?? 1.4) * (1 + x), 3, t);
    },
  };
}

/** 침수된 지하의 물방울 — 위로 휘는 짧은 사인 */
export function drips(rt: Runtime, o: { every?: number; volume?: number; lo?: number; hi?: number } = {}): Layer {
  const synth = rt.bag.add(new OscSynth(rt.ctx, { wave: 'sine', env: { a: 0.001, r: 0.16 }, level: dbToGain(o.volume ?? -24), max: 3 }));
  const pan = rt.bag.add(new Panner({ context: rt.ctx, pan: 0 }));
  synth.output.connect(pan);
  rt.route(pan, { dry: 0.6, verb: 0.9, echo: 0.5 });
  let next = 0;
  return {
    start(t) {
      next = t + rand(0.5, 2);
    },
    step(t) {
      if (t < next) return;
      const f = rand(o.lo ?? 900, o.hi ?? 2400);
      pan.pan.setValueAtTime(randPan(0.9), t);
      for (const osc of synth.play(f, 0.008, t, rand(0.3, 0.8))) {
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * rand(1.5, 2.1), t + rand(0.035, 0.07));
      }
      next = t + (chance(0.25) ? rand(0.15, 0.35) : expWait(o.every ?? 2.5) + 0.2);
    },
  };
}

/** 모닥불: 낮은 웅웅거림 + 무작위 탁탁 소리 */
export function fire(rt: Runtime, o: { level?: number } = {}): Layer {
  const L = o.level ?? 1;
  const rumble = noiseSource(rt.ctx, 'brown');
  holdSource(rt, rumble);
  const rlp = biquad(rt, 'lowpass', 260, 0.7);
  const ramp = rt.bag.add(new Gain({ context: rt.ctx, gain: 0.1 * L }));
  rumble.connect(rlp.input);
  rlp.connect(ramp);
  rt.route(ramp, { dry: 1, verb: 0.1 });
  const chans = [0, 1].map(() => {
    const synth = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'white', env: { a: 0.0005, r: 0.02 }, level: dbToGain(-8.3), max: 4 }));
    const hp = biquad(rt, 'highpass', 2500, 0.8);
    const p = rt.bag.add(new Panner({ context: rt.ctx, pan: 0 }));
    synth.output.chain(hp, p);
    rt.route(p, { dry: L, verb: 0.15 });
    return { synth, hp, p };
  });
  let next = 0;
  let ci = 0;
  let burst = 0;
  let lastFlicker = 0;
  return {
    start(t) {
      startNoise(rumble, t);
      next = t + 0.3;
    },
    step(t) {
      // 불꽃 일렁임 (게인만 — 필터 계수 재계산을 줄인다)
      if (t - lastFlicker > 0.4) {
        lastFlicker = t;
        ramp.gain.rampTo(L * rand(0.07, 0.14), rand(0.15, 0.5), t);
      }
      while (next < t + rt.stepDur) {
        const c = chans[ci++ % chans.length];
        const tt = Math.max(next, t);
        const pop = chance(0.12);
        c.hp.frequency.setValueAtTime(pop ? rand(700, 1400) : rand(2200, 6000), tt);
        c.p.pan.setValueAtTime(randPan(0.6), tt);
        c.synth.hit(tt, 0.002, pop ? rand(0.6, 1) : rand(0.08, 0.5), { a: 0.0005, r: pop ? rand(0.03, 0.07) : rand(0.006, 0.025) });
        if (burst > 0) {
          burst--;
          next = tt + rand(0.02, 0.07);
        } else {
          if (chance(0.15)) burst = randInt(2, 6);
          next = tt + expWait(0.28) + 0.03;
        }
      }
    },
    stop(t) {
      rumble.stop(t + 0.05);
    },
  };
}

/** 멀리서 들리는 안개 경적 */
export function foghorn(rt: Runtime, o: { note?: number; every?: number; volume?: number } = {}): Layer {
  const horn = rt.bag.add(
    new OscSynth(rt.ctx, { wave: 'sawtooth', detunes: [-5, 5], env: { a: 0.6, r: 2.4 }, level: dbToGain((o.volume ?? -12) - 5), max: 2 }),
  );
  const lp = biquad(rt, 'lowpass', 200, 1.6);
  horn.output.connect(lp);
  rt.route(lp, { dry: 0.5, verb: 1, echo: 0.25 });
  let next = 0;
  return {
    start(t) {
      next = t + rand(6, 14);
    },
    step(t) {
      if (t < next) return;
      const f = rt.hz(o.note ?? rt.pal.root, 0.3);
      const len = rand(2.2, 3.2);
      for (const osc of horn.play(f, len, t, rand(0.6, 0.9))) {
        osc.frequency.setValueAtTime(f, t + len - 0.4);
        osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + len + 0.9);
      }
      const p = lp.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(180, t);
      p.exponentialRampToValueAtTime(420, t + 0.9);
      p.exponentialRampToValueAtTime(180, t + len + 1.5);
      next = t + len + expWait(o.every ?? 26) + 8;
    },
    stop(t) {
      horn.releaseAll(t);
    },
  };
}

// ===========================================================================
// Swells — 역재생 같은 크레센도 후 뚝 끊김
// ===========================================================================

export function swells(rt: Runtime, o: { prob?: number; lo?: number; hi?: number; volume?: number; every?: number } = {}): Layer {
  const synth = rt.bag.add(
    new OscSynth(rt.ctx, { wave: 'triangle', detunes: [-12, 12], env: { a: 2, rise: true, r: 0.06 }, level: dbToGain((o.volume ?? -16) - 5), max: 8 }),
  );
  const air = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'pink', env: { a: 2, rise: true, r: 0.05 }, level: dbToGain(-25.5), max: 2 }));
  const bp = biquad(rt, 'bandpass', 1400, 0.9);
  air.output.connect(bp);
  rt.route(synth, { dry: 1, verb: 0.2 });
  rt.route(bp, { dry: 1, verb: 0.15 });
  return {
    step(t, s) {
      if (!rt.isBar(s, o.every ?? 2)) return;
      if (!chance((o.prob ?? 0.15) + rt.dissonance * 0.4)) return;
      const len = rand(1.6, 3.4);
      const lo = o.lo ?? rt.pal.root + 24;
      const hi = o.hi ?? rt.pal.root + 40;
      const tones = rt.harmony.chordTonesIn(lo, hi);
      const notes = addDissonance(tones.length > 3 ? tones.slice(0, 3) : tones, rt.dissonance + 0.2);
      if (!notes.length) return;
      synth.env = { ...synth.env, a: len };
      synth.triggerAttackRelease(
        notes.map((m) => rt.hz(m)),
        len,
        t,
        rand(0.4, 0.7),
      );
      const p = bp.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(400, t);
      p.exponentialRampToValueAtTime(rand(2500, 5000), t + len);
      air.hit(t, len, rand(0.3, 0.6), { a: len, rise: true, r: 0.05 });
    },
    stop(t) {
      synth.releaseAll(t);
      air.releaseAll(t);
    },
  };
}

// ===========================================================================
// Shimmer — 높은 음역의 별빛 같은 FM 음 (3·4막)
// ===========================================================================

export function shimmer(rt: Runtime, o: { density?: number; lo?: number; hi?: number; volume?: number; shift?: boolean } = {}): Layer {
  const synth = rt.bag.add(
    new FmSynth(rt.ctx, {
      ratio: 2.01,
      index: 1.6,
      env: { a: 0.9, r: 3.5 },
      modEnv: { a: 1.4, r: 2 },
      level: dbToGain(o.volume ?? -26),
      max: 6,
    }),
  );
  const pan = rt.bag.add(new Panner({ context: rt.ctx, pan: 0 }));
  synth.output.connect(pan);
  rt.route(pan, { dry: 0.35, verb: 1, echo: 0.45 });
  return {
    step(t, s) {
      if (!rt.isBeat(s) || !chance(o.density ?? 0.18)) return;
      const lo = o.lo ?? rt.pal.root + 48;
      const hi = o.hi ?? rt.pal.root + 64;
      const note = pick(rt.harmony.scaleIn(lo, hi));
      if (note === undefined) return;
      const at = rt.human(t, 0.2);
      const d = rand(0.6, 1.6);
      const v = rand(0.2, 0.5);
      pan.pan.rampTo(randPan(0.75), 2, at);
      synth.play(rt.hz(note, 1.2), d, at, v);
      // 꿈의 일렁임: 살짝 어긋난 두 번째 음이 맥놀이를 만든다
      if (o.shift || rt.wobble > 0.3) synth.play(rt.hz(note, 1.2) * Math.pow(2, (6 + rt.dissonance * 30) / 1200), d, at + 0.03, v * 0.7);
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

// ===========================================================================
// Pipes — "저주받은 피리의 가늘고 단조로운 울음" (4막/최종)
// ===========================================================================

export function pipes(rt: Runtime, o: { lo?: number; hi?: number; volume?: number; prob?: number; noteSteps?: number } = {}): Layer {
  const level = dbToGain(o.volume ?? -24);
  const voices = [0, 1].map(() => {
    const out = rt.bag.add(new Gain({ context: rt.ctx, gain: 1 }));
    const hp = biquad(rt, 'highpass', 320, 0.7);
    const p = rt.bag.add(new Panner({ context: rt.ctx, pan: randPan(0.7) }));
    out.chain(hp, p);
    rt.route(p, { dry: 0.55, verb: 0.9, echo: 0.3 });
    // 비브라토 LFO (네이티브, 피리마다 하나) — 프레이즈마다 깊이 게인을 거쳐 주파수에 연결
    const lfo = rt.ctx.createOscillator();
    lfo.frequency.value = rand(4.6, 6.4);
    holdSource(rt, lfo);
    return { out, lfo, busy: 0, started: false };
  });
  let motif: number[] = [];
  let reps = 0;
  const newMotif = () => {
    const pool = rt.harmony.scaleIn(o.lo ?? rt.pal.root + 48, o.hi ?? rt.pal.root + 62);
    const start = randInt(0, Math.max(0, pool.length - 4));
    const len = randInt(3, 5);
    motif = [];
    for (let i = 0; i < len; i++) {
      const n = pool[clamp(start + randInt(-1, 3), 0, pool.length - 1)];
      // 고정된 미분음 어긋남 — 매번 같은 '틀린' 음
      motif.push(n + rand(-0.35, 0.35) * (0.5 + rt.pal.micro / 40));
    }
    reps = randInt(3, 7);
  };
  const playPhrase = (vi: number, t: number, transpose: number) => {
    const v = voices[vi];
    if (t < v.busy || !motif.length) return;
    if (!v.started) {
      v.lfo.start(t);
      v.started = true;
    }
    const lfo = v.lfo;
    const ctx = rt.ctx;
    const nd = rt.stepDur * (o.noteSteps ?? 2);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(v.out.input);
    let tt = t;
    const f0 = mtof(motif[0] + transpose);
    motif.forEach((m, i) => {
      const f = mtof(m + transpose + rt.detune(0.3) / 100);
      if (i === 0) osc.frequency.setValueAtTime(f, tt);
      else osc.frequency.setTargetAtTime(f, tt, 0.025); // 포르타멘토
      tt += nd * pick([1, 1, 1, 2]);
    });
    const end = applyEnv(g.gain, t, rand(0.5, 0.8) * level, { a: 0.14, r: 0.6 }, tt - t);
    // 비브라토 깊이 ≈ ±16 cents
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.0093;
    lfo.connect(vg);
    vg.connect(osc.frequency);
    osc.start(t);
    osc.stop(end);
    cleanup([osc], [g, vg], () => unlink(lfo, vg));
    v.busy = end + 0.1;
  };
  return {
    start() {
      newMotif();
    },
    step(t, s) {
      if (!rt.isBar(s) || !chance(o.prob ?? 0.6)) return;
      if (reps-- <= 0) newMotif();
      playPhrase(0, t, 0);
      // 두 번째 피리: 반음/삼전음 위에서 엇갈려 따라온다
      if (chance(0.35 + rt.dissonance * 0.4)) playPhrase(1, t + rt.stepDur * pick([1, 2, 3]), pick([1, 6, -5, 0.5]));
    },
  };
}

// ===========================================================================
// Heartbeat / distant drums
// ===========================================================================

export function heartbeat(rt: Runtime, o: { bpm?: number; volume?: number; note?: number; prob?: number } = {}): Layer {
  const s = rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'sine', octaves: 1.8, pitchDecay: 0.05, env: { a: 0.004, r: 0.38 }, level: dbToGain(o.volume ?? -8) }),
  );
  const lp = biquad(rt, 'lowpass', 150, 0.7);
  s.output.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.12 });
  let next = 0;
  return {
    start(t) {
      next = t + 0.5;
    },
    step(t) {
      // 그리드와 무관한 정확한 박동 시각에 예약
      while (next < t + rt.stepDur) {
        const tt = Math.max(next, t);
        const bpm = (o.bpm ?? 56) * (1 + rt.dissonance * 0.6 + rt.intensity * 0.25);
        if (chance(o.prob ?? 1)) {
          const f = mtof(o.note ?? 28);
          s.hit(f, tt, 0.85);
          s.hit(f * 0.94, tt + 0.27, 0.55);
        }
        next = tt + 60 / bpm;
      }
    },
  };
}

/** 4막 "역겨운 북소리" — 멀고 둔한, 박자가 어긋난 북 */
export function distantDrums(rt: Runtime, o: { volume?: number; pattern?: string } = {}): Layer {
  const s = rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'sine', octaves: 2.5, pitchDecay: 0.08, env: { a: 0.003, r: 0.9 }, level: dbToGain(o.volume ?? -12) }),
  );
  const lp = biquad(rt, 'lowpass', 380, 0.7);
  s.output.connect(lp);
  rt.route(lp, { dry: 0.5, verb: 0.8 });
  // 8분음표 단위 패턴 (5+7 = 12박 순환)
  const pat = o.pattern ?? 'x..x.x..x.x.' + 'x...x..x.xx.';
  let i = 0;
  return {
    step(t, s2) {
      const eighth = Math.max(1, rt.stepsPerBeat / 2);
      if (s2 % eighth !== 0) return;
      const c = pat[i++ % pat.length];
      if (c !== 'x' || !chance(0.85)) return;
      s.hit(rt.hz(rt.pal.root - 12 + pick([0, 0, 0, 7]), 0.3), rt.human(t, 0.03), rand(0.4, 0.9));
    },
  };
}
