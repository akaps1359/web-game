import {
  Chorus,
  FatOscillator,
  Filter,
  FMSynth,
  FrequencyShifter,
  Gain,
  LFO,
  MembraneSynth,
  Noise,
  NoiseSynth,
  Panner,
  PolySynth,
  Synth,
  type ToneAudioNode,
} from 'tone';
import { addDissonance, chance, clamp, expWait, mtof, pick, rand, randInt, weighted } from '../scales';
import { EXP, RISE, SOFT, fmBell, padSynth, type PadOpts } from './instruments';
import { randPan, type Layer, type Runtime, type Sends } from './runtime';

/** 화음/선율을 연주할 수 있는 폴리 신스 (PolySynth<Synth|FMSynth>) */
export interface Playable {
  triggerAttackRelease(notes: number | number[], duration: number, time?: number, velocity?: number): unknown;
  releaseAll(time?: number): unknown;
}

const vel = (r: readonly [number, number] | undefined, d: readonly [number, number]): number => {
  const [a, b] = r ?? d;
  return clamp(rand(a, b), 0.01, 1);
};

// ===========================================================================
// Drone — 디튠된 톱니파 묶음 → 로우패스(느린 LFO 호흡)
// ===========================================================================

export interface DroneOpts {
  /** follow=true면 화음 베이스 기준 반음 오프셋, 아니면 절대 MIDI */
  notes: number[];
  follow?: boolean;
  octave?: number;
  type?: 'sawtooth' | 'triangle' | 'square' | 'sine';
  count?: number;
  spread?: number;
  cutoff?: number;
  q?: number;
  lfoRate?: number;
  lfoOct?: number;
  level?: number;
  sends?: Sends;
  glide?: number;
  /** 강도에 따른 필터 개방 배율 */
  open?: number;
}

export function drone(rt: Runtime, o: DroneOpts): Layer {
  const cutoff = (o.cutoff ?? 300) * rt.pal.bright;
  const filt = rt.bag.add(new Filter({ type: 'lowpass', frequency: cutoff, Q: o.q ?? 0.9, rolloff: -24 }));
  const amp = rt.bag.add(new Gain(0));
  filt.connect(amp);
  rt.route(amp, o.sends ?? { dry: 1, verb: 0.3 });
  const depth = 1200 * (o.lfoOct ?? 0.7);
  const cutLfo = rt.bag.add(new LFO({ frequency: o.lfoRate ?? 0.04, min: -depth, max: depth, phase: rand(0, 360) }));
  cutLfo.connect(filt.detune);
  // 정신력이 낮을수록 커지는 피치 흔들림
  const wob = rt.bag.add(new LFO({ frequency: rand(0.06, 0.12), min: -38, max: 38, amplitude: 0 }));
  const spread = o.spread ?? 14;
  const pitches = (): number[] => (o.follow ? o.notes.map((n) => rt.harmony.bass(o.octave ?? 0) + n) : o.notes);
  const oscs = pitches().map((m) => {
    const osc = rt.bag.add(new FatOscillator({ frequency: mtof(m), type: o.type ?? 'sawtooth', count: o.count ?? 3, spread }));
    osc.connect(filt);
    wob.connect(osc.detune);
    return osc;
  });
  let lastDegree = rt.harmony.degree;
  return {
    start(t) {
      for (const x of oscs) x.start(t);
      cutLfo.start(t);
      wob.start(t);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(o.level ?? 0.5, t + 3);
    },
    step(t, s) {
      if (!o.follow || !rt.isBar(s) || rt.harmony.degree === lastDegree) return;
      lastDegree = rt.harmony.degree;
      pitches().forEach((m, i) => oscs[i]?.frequency.exponentialRampTo(mtof(m), o.glide ?? 1.5, t));
    },
    stop(t) {
      for (const x of oscs) x.stop(t);
      cutLfo.stop(t);
      wob.stop(t);
    },
    sanity(_s, t) {
      wob.amplitude.rampTo(rt.wobble, 3, t);
      const sp = spread + rt.dissonance * 40;
      for (const x of oscs) x.spread = sp;
    },
    intensity(x, t) {
      filt.frequency.rampTo(clamp(cutoff * (1 + x * (o.open ?? 1.2)), 40, 12000), 3, t);
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
  chorus?: boolean;
  sends?: Sends;
  lfoRate?: number;
}

/** 패드 신스 + 필터 + (코러스) + 화음 진행 */
export function pad(rt: Runtime, o: PadLayerOpts = {}): Layer {
  const synth = padSynth(rt, o);
  const cutoff = (o.cutoff ?? 1200) * rt.pal.bright;
  const filt = rt.bag.add(new Filter({ type: 'lowpass', frequency: cutoff, Q: o.q ?? 0.6, rolloff: -24 }));
  const lfo = rt.bag.add(new LFO({ frequency: o.lfoRate ?? 0.03, min: -700, max: 700, phase: rand(0, 360) }));
  lfo.connect(filt.detune);
  synth.connect(filt);
  let tail: ToneAudioNode = filt;
  let chorus: Chorus | undefined;
  if (o.chorus) {
    chorus = rt.bag.add(new Chorus({ frequency: 0.25, delayTime: 4.5, depth: 0.6, spread: 160, wet: 0.6 }));
    filt.connect(chorus);
    tail = chorus;
  }
  rt.route(tail, o.sends ?? { dry: 1, verb: 0.55 });
  const inner = chords(rt, synth, o);
  return {
    start(t) {
      lfo.start(t);
      chorus?.start(t);
    },
    step: inner.step,
    stop(t) {
      inner.stop?.(t);
      lfo.stop(t);
    },
    sanity(_s, t) {
      // 정신력이 낮으면 패드가 어두워지고 탁해진다
      filt.frequency.rampTo(clamp(cutoff * (1 - rt.wobble * 0.45), 80, 12000), 4, t);
    },
    intensity(x, t) {
      filt.frequency.rampTo(clamp(cutoff * (1 + x * 0.8) * (1 - rt.wobble * 0.45), 80, 12000), 3, t);
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
  /** 발음 유지 시간(초) — sustain=1 신스는 짧게 */
  hold?: number;
  /** 아래 음 하나 더(3도/6도/옥타브) */
  dyad?: number;
  /** 마디 첫 박에 화음음으로 끌리는 확률 */
  pull?: number;
  leap?: number;
  detune?: number;
  humanize?: number;
  /** 시작 직후 쉼 여부 */
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
        // 가장자리에서 튕겨 돌아오기
        if (idx === 0 || idx === pool.length - 1) idx = clamp(idx + (idx === 0 ? 2 : -2), 0, pool.length - 1);
        cur = pool[idx];
      }
      const notes = [cur];
      if (o.dyad && chance(o.dyad)) {
        const below = pool[idx - pick([2, 3, 5])];
        notes.push(below ?? cur - 12);
      }
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
  volume?: number;
  /** 평균 간격(초) */
  every?: number;
  /** 연속 타종 횟수 범위 */
  strikes?: readonly [number, number];
  gap?: number;
  sends?: Sends;
  /** 낮은 허밍 음 추가 */
  hum?: boolean;
}

export function bells(rt: Runtime, o: BellLayerOpts): Layer {
  const synth = fmBell(rt, { harmonicity: o.harmonicity ?? 1.4, index: o.index ?? 6, ring: o.ring ?? 6, shine: 1.6, volume: o.volume ?? -16, poly: 6 });
  const pan = rt.bag.add(new Panner(randPan(0.5)));
  synth.connect(pan);
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
        const notes = o.hum ? [rt.hz(note, 0.4), rt.hz(note - 12, 0.4)] : [rt.hz(note, 0.4)];
        synth.triggerAttackRelease(notes, 0.05, tt, rand(0.45, 0.8) * (1 - i * 0.12));
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
  const noise = rt.bag.add(new Noise({ type: 'brown', volume: -4 }));
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: o.cutoff ?? 380, Q: 0.4, rolloff: -12 }));
  const amp = rt.bag.add(new Gain(0));
  const pan = rt.bag.add(new Panner(0));
  noise.chain(lp, amp, pan);
  rt.route(pan, o.sends ?? { dry: 1, verb: 0.25 });
  const L = o.level ?? 0.5;
  const base = o.cutoff ?? 380;
  let next = 0;
  return {
    start(t) {
      noise.start(t);
      amp.gain.setValueAtTime(L * 0.2, t);
      next = t;
    },
    step(t) {
      if (t < next) return;
      // 파도 하나: 밀려오고(밝아짐) 빠져나감
      const up = rand(1.8, 3.4);
      const down = rand(3, 5.5);
      const peak = L * rand(0.55, 1);
      amp.gain.cancelAndHoldAtTime(t);
      amp.gain.linearRampToValueAtTime(peak, t + up);
      amp.gain.linearRampToValueAtTime(L * rand(0.12, 0.25), t + up + down);
      lp.frequency.cancelAndHoldAtTime(t);
      lp.frequency.exponentialRampToValueAtTime(base * rand(1.8, 2.8), t + up);
      lp.frequency.exponentialRampToValueAtTime(base * 0.8, t + up + down);
      pan.pan.rampTo(randPan(0.5), up + down, t);
      next = t + (up + down) * rand(0.75, 1.05);
    },
    stop(t) {
      noise.stop(t);
    },
  };
}

export function wind(rt: Runtime, o: { level?: number; freq?: number; q?: number; rate?: number; sends?: Sends; type?: 'pink' | 'white' } = {}): Layer {
  const noise = rt.bag.add(new Noise({ type: o.type ?? 'pink', volume: -6 }));
  const bp = rt.bag.add(new Filter({ type: 'bandpass', frequency: o.freq ?? 520, Q: o.q ?? 1.4, rolloff: -12 }));
  const amp = rt.bag.add(new Gain(0));
  noise.chain(bp, amp);
  rt.route(amp, o.sends ?? { dry: 0.7, verb: 0.6 });
  const sweep = rt.bag.add(new LFO({ frequency: o.rate ?? 0.045, min: -1900, max: 1900, phase: rand(0, 360) }));
  sweep.connect(bp.detune);
  const L = o.level ?? 0.35;
  const gust = rt.bag.add(new LFO({ frequency: (o.rate ?? 0.045) * 2.3, min: L * 0.25, max: L, phase: rand(0, 360) }));
  gust.connect(amp.gain);
  return {
    start(t) {
      noise.start(t);
      sweep.start(t);
      gust.start(t);
    },
    stop(t) {
      noise.stop(t);
      sweep.stop(t);
      gust.stop(t);
    },
    intensity(x, t) {
      bp.Q.rampTo((o.q ?? 1.4) * (1 + x), 3, t);
    },
  };
}

/** 침수된 지하의 물방울 — 위로 휘는 짧은 사인 */
export function drips(rt: Runtime, o: { every?: number; volume?: number; lo?: number; hi?: number } = {}): Layer {
  const voices = [0, 1].map(() => {
    const s = rt.bag.add(
      new Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.16, releaseCurve: EXP },
        volume: o.volume ?? -24,
      }),
    );
    const p = rt.bag.add(new Panner(0));
    s.connect(p);
    rt.route(p, { dry: 0.6, verb: 0.9, echo: 0.5 });
    return { s, p };
  });
  let next = 0;
  let vi = 0;
  return {
    start(t) {
      next = t + rand(0.5, 2);
    },
    step(t) {
      if (t < next) return;
      const v = voices[vi++ % voices.length];
      const f = rand(o.lo ?? 900, o.hi ?? 2400);
      v.p.pan.setValueAtTime(randPan(0.9), t);
      v.s.triggerAttackRelease(f, 0.008, t, rand(0.3, 0.8));
      v.s.frequency.exponentialRampToValueAtTime(f * rand(1.5, 2.1), t + rand(0.035, 0.07));
      // 가끔 연달아 두 방울
      next = t + (chance(0.25) ? rand(0.15, 0.35) : expWait(o.every ?? 2.5) + 0.2);
    },
  };
}

/** 모닥불: 낮은 웅웅거림 + 무작위 탁탁 소리 */
export function fire(rt: Runtime, o: { level?: number } = {}): Layer {
  const L = o.level ?? 1;
  const rumble = rt.bag.add(new Noise({ type: 'brown', volume: -10 }));
  const rlp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 260, Q: 0.7, rolloff: -12 }));
  const ramp = rt.bag.add(new Gain(0.5 * L));
  rumble.chain(rlp, ramp);
  rt.route(ramp, { dry: 1, verb: 0.1 });
  const crack = [0, 1, 2].map(() => {
    const synth = rt.bag.add(
      new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.0005, decay: 0, sustain: 1, release: 0.02, releaseCurve: EXP },
        volume: -14,
      }),
    );
    const hp = rt.bag.add(new Filter({ type: 'highpass', frequency: 2500, Q: 0.8, rolloff: -12 }));
    const p = rt.bag.add(new Panner(0));
    synth.chain(hp, p);
    rt.route(p, { dry: L, verb: 0.15 });
    return { synth, hp, p };
  });
  let next = 0;
  let ci = 0;
  let burst = 0;
  return {
    start(t) {
      rumble.start(t);
      next = t + 0.3;
    },
    step(t) {
      // 불꽃 일렁임
      ramp.gain.rampTo(L * rand(0.3, 0.65), rand(0.15, 0.5), t);
      rlp.frequency.rampTo(rand(180, 360), 0.4, t);
      while (next < t + rt.stepDur) {
        const c = crack[ci++ % crack.length];
        const tt = Math.max(next, t);
        const pop = chance(0.12);
        c.hp.frequency.setValueAtTime(pop ? rand(700, 1400) : rand(2200, 6000), tt);
        c.p.pan.setValueAtTime(randPan(0.6), tt);
        c.synth.envelope.release = pop ? rand(0.03, 0.07) : rand(0.006, 0.025);
        c.synth.triggerAttackRelease(0.002, tt, pop ? rand(0.6, 1) : rand(0.08, 0.5));
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
      rumble.stop(t);
    },
  };
}

/** 멀리서 들리는 안개 경적 */
export function foghorn(rt: Runtime, o: { note?: number; every?: number; volume?: number } = {}): Layer {
  const horn = rt.bag.add(
    new Synth({
      oscillator: { type: 'fatsawtooth', count: 2, spread: 9 },
      envelope: { attack: 0.6, decay: 0, sustain: 1, release: 2.4, releaseCurve: SOFT },
      volume: o.volume ?? -12,
    }),
  );
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 220, Q: 1.6, rolloff: -24 }));
  horn.connect(lp);
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
      horn.triggerAttackRelease(f, len, t, rand(0.6, 0.9));
      horn.frequency.setValueAtTime(f, t + len - 0.4);
      horn.frequency.exponentialRampToValueAtTime(f * 0.9, t + len + 0.9);
      lp.frequency.cancelAndHoldAtTime(t);
      lp.frequency.exponentialRampToValueAtTime(420, t + 0.9);
      lp.frequency.exponentialRampToValueAtTime(180, t + len + 1.5);
      next = t + len + expWait(o.every ?? 26) + 8;
    },
    stop(t) {
      horn.triggerRelease(t);
    },
  };
}

// ===========================================================================
// Swells — 역재생 같은 크레센도 후 뚝 끊김
// ===========================================================================

export function swells(rt: Runtime, o: { prob?: number; lo?: number; hi?: number; volume?: number; every?: number } = {}): Layer {
  const synth = rt.bag.add(
    new PolySynth(Synth, {
      oscillator: { type: 'fattriangle', count: 2, spread: 24 },
      envelope: { attack: 2, attackCurve: RISE, decay: 0, sustain: 1, release: 0.06 },
      volume: o.volume ?? -16,
    }),
  );
  synth.maxPolyphony = 8;
  const air = rt.bag.add(
    new NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 2, attackCurve: RISE, decay: 0, sustain: 1, release: 0.05 },
      volume: -22,
    }),
  );
  const bp = rt.bag.add(new Filter({ type: 'bandpass', frequency: 1400, Q: 0.9, rolloff: -12 }));
  air.connect(bp);
  rt.route(synth, { dry: 1, verb: 0.2 });
  rt.route(bp, { dry: 1, verb: 0.15 });
  return {
    step(t, s) {
      if (!rt.isBar(s, o.every ?? 2)) return;
      const p = (o.prob ?? 0.15) + rt.dissonance * 0.4;
      if (!chance(p)) return;
      const len = rand(1.6, 3.4);
      synth.set({ envelope: { attack: len } });
      air.envelope.attack = len;
      const lo = o.lo ?? rt.pal.root + 24;
      const hi = o.hi ?? rt.pal.root + 40;
      const tones = rt.harmony.chordTonesIn(lo, hi);
      const notes = addDissonance(tones.length > 3 ? tones.slice(0, 3) : tones, rt.dissonance + 0.2);
      if (!notes.length) return;
      synth.triggerAttackRelease(notes.map((m) => rt.hz(m)), len, t, rand(0.4, 0.7));
      bp.frequency.cancelAndHoldAtTime(t);
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(rand(2500, 5000), t + len);
      air.triggerAttackRelease(len, t, rand(0.3, 0.6));
    },
    stop(t) {
      synth.releaseAll(t);
    },
  };
}

// ===========================================================================
// Shimmer — 높은 음역의 별빛 같은 FM 음 (3·4막)
// ===========================================================================

export function shimmer(rt: Runtime, o: { density?: number; lo?: number; hi?: number; volume?: number; shift?: boolean } = {}): Layer {
  const synth = rt.bag.add(
    new PolySynth(FMSynth, {
      harmonicity: 2.01,
      modulationIndex: 1.6,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.9, decay: 0, sustain: 1, release: 3.5, releaseCurve: SOFT },
      modulationEnvelope: { attack: 1.4, decay: 0, sustain: 1, release: 2, releaseCurve: SOFT },
      volume: o.volume ?? -26,
    }),
  );
  synth.maxPolyphony = 8;
  const pan = rt.bag.add(new Panner(0));
  const panLfo = rt.bag.add(new LFO({ frequency: 0.05, min: -0.75, max: 0.75 }));
  panLfo.connect(pan.pan);
  let shifter: FrequencyShifter | undefined;
  if (o.shift) {
    shifter = rt.bag.add(new FrequencyShifter({ frequency: 0, wet: 0.5 }));
    synth.chain(shifter, pan);
  } else {
    synth.connect(pan);
  }
  rt.route(pan, { dry: 0.35, verb: 1, echo: 0.45 });
  return {
    start(t) {
      panLfo.start(t);
    },
    step(t, s) {
      if (!rt.isBeat(s) || !chance(o.density ?? 0.18)) return;
      const lo = o.lo ?? rt.pal.root + 48;
      const hi = o.hi ?? rt.pal.root + 64;
      const note = pick(rt.harmony.scaleIn(lo, hi));
      if (note === undefined) return;
      synth.triggerAttackRelease(rt.hz(note, 1.2), rand(0.6, 1.6), rt.human(t, 0.2), rand(0.2, 0.5));
    },
    stop(t) {
      synth.releaseAll(t);
      panLfo.stop(t);
    },
    sanity(_s, t) {
      shifter?.frequency.rampTo(rt.wobble * 3 + rt.dissonance * 9, 4, t);
    },
  };
}

// ===========================================================================
// Pipes — "저주받은 피리의 가늘고 단조로운 울음" (4막/최종)
// ===========================================================================

export function pipes(rt: Runtime, o: { lo?: number; hi?: number; volume?: number; prob?: number; noteSteps?: number } = {}): Layer {
  const voices = [0, 1].map(() => {
    const s = rt.bag.add(
      new Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.14, decay: 0, sustain: 1, release: 0.6, releaseCurve: SOFT },
        portamento: 0.07,
        volume: o.volume ?? -24,
      }),
    );
    const vib = rt.bag.add(new LFO({ frequency: rand(4.6, 6.4), min: -16, max: 16, amplitude: 0.7 }));
    vib.connect(s.detune);
    const hp = rt.bag.add(new Filter({ type: 'highpass', frequency: 320, rolloff: -12 }));
    const p = rt.bag.add(new Panner(randPan(0.7)));
    s.chain(hp, p);
    rt.route(p, { dry: 0.55, verb: 0.9, echo: 0.3 });
    return { s, vib };
  });
  let motif: number[] = [];
  let reps = 0;
  const busy = [0, 0];
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
    // 모노 신스라 이전 프레이즈가 끝나기 전엔 겹쳐 예약하지 않는다
    if (t < busy[vi]) return;
    const v = voices[vi];
    const nd = rt.stepDur * (o.noteSteps ?? 2);
    let tt = t;
    motif.forEach((m, i) => {
      const f = mtof(m + transpose + rt.detune(0.3) / 100);
      if (i === 0) v.s.triggerAttack(f, tt, rand(0.5, 0.8));
      else v.s.setNote(f, tt);
      tt += nd * pick([1, 1, 1, 2]);
    });
    v.s.triggerRelease(tt);
    busy[vi] = tt + 0.7;
  };
  return {
    start(t) {
      newMotif();
      for (const v of voices) v.vib.start(t);
    },
    step(t, s) {
      if (!rt.isBar(s) || !chance(o.prob ?? 0.6)) return;
      if (reps-- <= 0) newMotif();
      playPhrase(0, t, 0);
      // 두 번째 피리: 반음/삼전음 위에서 엇갈려 따라온다
      if (chance(0.35 + rt.dissonance * 0.4)) playPhrase(1, t + rt.stepDur * pick([1, 2, 3]), pick([1, 6, -5, 0.5]));
    },
    stop(t) {
      for (const v of voices) {
        v.s.triggerRelease(t);
        v.vib.stop(t);
      }
    },
  };
}

// ===========================================================================
// Heartbeat / distant drums
// ===========================================================================

export function heartbeat(rt: Runtime, o: { bpm?: number; volume?: number; note?: number; prob?: number } = {}): Layer {
  const s = rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.05,
      octaves: 1.8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.004, decay: 0, sustain: 1, release: 0.38, releaseCurve: EXP },
      volume: o.volume ?? -8,
    }),
  );
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 150, rolloff: -24 }));
  s.connect(lp);
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
          s.triggerAttackRelease(f, 0.02, tt, 0.85);
          s.triggerAttackRelease(f * 0.94, 0.02, tt + 0.27, 0.55);
        }
        next = tt + 60 / bpm;
      }
    },
  };
}

/** 4막 "역겨운 북소리" — 멀고 둔한, 박자가 어긋난 북 */
export function distantDrums(rt: Runtime, o: { volume?: number; pattern?: string } = {}): Layer {
  const s = rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.08,
      octaves: 2.5,
      envelope: { attack: 0.003, decay: 0, sustain: 1, release: 0.9, releaseCurve: EXP },
      volume: o.volume ?? -12,
    }),
  );
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 380, rolloff: -24 }));
  s.connect(lp);
  rt.route(lp, { dry: 0.5, verb: 0.8 });
  // 8분음표 단위 패턴 (5+7 = 12박 순환)
  const pat = o.pattern ?? 'x..x.x..x.x.' + 'x...x..x.xx.';
  let i = 0;
  let last = 0;
  return {
    step(t, s2) {
      const eighth = Math.max(1, rt.stepsPerBeat / 2);
      if (s2 % eighth !== 0) return;
      const c = pat[i++ % pat.length];
      if (c !== 'x' || !chance(0.85)) return;
      const tt = Math.max(rt.human(t, 0.03), last + 0.01);
      last = tt;
      s.triggerAttackRelease(rt.hz(rt.pal.root - 12 + pick([0, 0, 0, 7]), 0.3), 0.02, tt, rand(0.4, 0.9));
    },
  };
}
