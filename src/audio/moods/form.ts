/**
 * 곡의 형식(구간 구조)을 이끄는 지휘자 레이어.
 *
 *   도입 → A → B → A' → 숨 고르기 → 절정 → (다음 바퀴: 다른 순서·다른 변주) …
 *
 * - 구간마다 하위 런타임(Runtime.fork)에 레이어를 새로 만들고, 구간이 끝나면 페이드 후 통째로 정리한다.
 *   레이어를 쌓지 않고 갈아 끼우므로 CPU는 한 구간 분량, 노드는 구간이 끝날 때마다 해제된다.
 * - 강도(setIntensity)가 확 오르면 4마디 단위로 끊고 절정으로 넘어간다. 위기에는 숨 고르기를 건너뛴다.
 * - 구간 경계에는 라이저(마지막 마디)와 임팩트(첫 박)를 둔다.
 * - 한 바퀴가 끝날 때 hooks.interlude가 true를 돌려주면(메들리가 실제 음원 테마로 넘김) 마무리 구간을 연주한다.
 */
import { Gain, dbToGain } from 'tone';
import { chance, mtof, rand } from '../scales';
import { NoiseSynth, OscSynth, noiseSource, startNoise } from '../synth';
import { biquad, boomDrum, fq } from './instruments';
import type { Layer, Runtime, Scope } from './runtime';

export type Role = 'intro' | 'reentry' | 'A' | 'A2' | 'B' | 'bridge' | 'climax' | 'outro';

export interface PlanItem {
  role: Role;
  /** 마디 수 (4의 배수 — 화음 주기와 맞물리게) */
  bars: number;
}

export interface Section {
  readonly role: Role;
  /** 길이(마디). 흐름이 바뀌면 줄어든다 */
  bars: number;
  /** 이 곡에서 몇 번째 구간인지 */
  readonly index: number;
  /** 몇 번째 바퀴인지 (메들리에서 음원 테마를 지나면 이어서 센다) */
  readonly cycle: number;
  /** 이 역할이 이 곡에서 몇 번째로 나오는지 */
  readonly visit: number;
  /** 시작 칸 */
  readonly start: number;
  /** 시작 마디 */
  readonly startBar: number;
}

export interface SectionEvent {
  time: number;
  role: Role;
  bars: number;
  cycle: number;
  index: number;
  intensity: number;
}

/** 개발·검증용 (오프라인 렌더 하네스): 구간 전환 기록, 구간 계획 덮어쓰기(구간별 CPU 측정) */
export const formDebug: {
  onSection?: (e: SectionEvent) => void;
  plan?: (cycle: number, reentry: boolean) => PlanItem[];
} = {};

export interface SongHooks {
  /**
   * 한 바퀴가 끝나 다음 구간이 t에 시작될 참이다. 실제 음원 테마로 넘길 수 있으면 true —
   * 그러면 이 곡은 t에 마무리 구간(임팩트 + 긴 화음)을 시작하고, 메들리가 곧 페이드아웃시킨다.
   */
  interlude?(t: number): boolean;
  /**
   * 마무리 구간이 막 시작됐다(그 박의 임팩트까지 예약된 뒤, 시계 콜백 안에서 동기로). 메들리는 여기서 곡을 내린다 —
   * 타이머로 하면 바쁜 기기에서 틱이 늦게 올 때 타이머가 먼저 돌아 마무리 구간이 통째로 빠질 수 있다.
   */
  outro?(t: number): void;
}

/** 구간의 에너지 (전환 연출을 고를 때) */
export const ENERGY: Record<Role, number> = {
  intro: 0.2,
  reentry: 0.25,
  bridge: 0.15,
  B: 0.55,
  A: 0.65,
  A2: 0.7,
  climax: 1,
  outro: 0,
};

export interface FormSpec {
  /** 시작 바퀴 번호 */
  cycle: number;
  /** 음원 테마를 지나 다시 들어오는가 (짧은 재진입 구간부터) */
  reentry: boolean;
  /** 한 바퀴의 구간 계획 */
  plan(cycle: number, reentry: boolean): PlanItem[];
  /** 구간 시작: 화성 진행·화음 간격·템포·조옮김 */
  enter(sec: Section, t: number): void;
  /** 구간의 레이어 (sc = 구간 전용 하위 런타임) */
  build(sc: Runtime, sec: Section): Layer[];
  /** 끝난 구간의 남은 소리를 페이드하는 시간(초) */
  tail?(sec: Section): number;
  /** 구간 출력 음량(배율) — 구간마다 음량을 맞춘다 */
  level?(sec: Section): number;
  /** 강도에 밀려 들어가는 절정의 길이(마디) */
  climaxBars?: number;
  hooks?: SongHooks;
}

/** 강도가 이만큼 오르면(구간 시작 대비) 절정으로 */
const JUMP = 0.28;

// ===========================================================================
// 전환 효과: 라이저(노이즈 + 사이렌) / 임팩트(크래시 + 서브 붐)
// ===========================================================================

export interface Fx extends Layer {
  rise(t: number, dur: number, level?: number): void;
  hit(t: number, level?: number): void;
}

export function transitions(rt: Runtime): Fx {
  const bp = biquad(rt, 'bandpass', 400, 1.6);
  const amp = rt.bag.add(new Gain({ context: rt.ctx, gain: 0 }));
  bp.connect(amp);
  rt.route(amp, { dry: 1, verb: 0.45 });
  const siren = rt.bag.add(
    new OscSynth(rt.ctx, { wave: 'sawtooth', detunes: [-15, 15], env: { a: 0.5, r: 0.08 }, level: dbToGain(-29), max: 2 }),
  );
  const slp = biquad(rt, 'lowpass', 1800, 0.7);
  siren.output.connect(slp);
  rt.route(slp, { dry: 1, verb: 0.4 });
  const crash = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'white', env: { a: 0.002, r: 1.8 }, level: dbToGain(-14.3), max: 2 }));
  const clp = biquad(rt, 'lowpass', 5200, 0.7);
  crash.output.connect(clp);
  rt.route(clp, { dry: 1, verb: 0.5 });
  const boom = boomDrum(rt, -7, 2.4);
  const blp = biquad(rt, 'lowpass', 140, 0.7);
  boom.output.connect(blp);
  rt.route(blp, { dry: 1, verb: 0.25 });
  return {
    rise(t, dur, level = 1) {
      const peak = 0.17 * level * (0.75 + rt.intensity * 0.5);
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
      if (level >= 0.7) {
        const b = rt.harmony.bass(0);
        const target = mtof(b + 12 + (chance(rt.dissonance) ? 1 : 0));
        for (const osc of siren.play(mtof(b), dur, t, 0.7 * level)) osc.frequency.exponentialRampToValueAtTime(target, t + dur);
      }
    },
    hit(t, level = 1) {
      crash.hit(t, 0.01, rand(0.55, 0.8) * level);
      boom.hit(mtof(rt.pal.root - 12), t, 0.95 * level);
    },
    stop(t) {
      siren.releaseAll(t);
    },
  };
}

// ===========================================================================
// 지휘자
// ===========================================================================

interface Active {
  sec: Section;
  scope: Scope;
  layers: Layer[];
  /** 구간 안에서 지난 마디 수 */
  bar: number;
  /** 다음 구간으로 가는 라이저를 이미 걸었는가 */
  rising: boolean;
}

export function director(rt: Runtime, spec: FormSpec, fx: Fx): Layer {
  const planOf = (c: number, re: boolean): PlanItem[] => formDebug.plan?.(c, re) ?? spec.plan(c, re);
  let cycle = spec.cycle;
  let queue = planOf(cycle, spec.reentry);
  let index = 0;
  const visits = new Map<Role, number>();
  let cur: Active | undefined;
  let pending: PlanItem | undefined;
  let baseInt = rt.intensity;
  let lastClimaxBar = -1e9;
  let forceClimax = false;
  let ending = false;
  let stopped = false;
  let warned = false;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn('[audio] section error', e);
      }
    }
  };

  /** 다음 구간 고르기 (t = 그 구간이 시작될 시각) */
  const choose = (t: number): PlanItem => {
    if (forceClimax) {
      forceClimax = false;
      // 절정을 앞당겼으면 계획에 남은 숨 고르기는 위기가 가라앉을 때까지 미룬다
      if (rt.intensity >= 0.6) queue = queue.filter((x) => x.role !== 'bridge');
      // 바로 다음이 계획된 절정이면 그것을 앞당긴 셈, 더 뒤에 있으면 그 자리는 B로 바꿔 절정이 겹치지 않게
      const i = queue.findIndex((x) => x.role === 'climax');
      if (i === 0) return queue.shift()!;
      if (i > 0) queue.splice(i, 1, { role: 'B', bars: 8 });
      return { role: 'climax', bars: spec.climaxBars ?? 16 };
    }
    let it = queue.shift();
    if (!it) {
      if (!ending && spec.hooks?.interlude?.(t)) {
        ending = true;
        return { role: 'outro', bars: 4 };
      }
      cycle++;
      queue = planOf(cycle, false);
      it = queue.shift() ?? { role: 'A', bars: 8 };
    }
    // 위기에는 숨 고르기 대신 몰아친다
    if (it.role === 'bridge' && rt.intensity >= 0.7) it = { role: 'B', bars: Math.min(8, it.bars) };
    // 같은 역할이 연달아 오면(바퀴 경계, 절정을 앞당긴 뒤 등) 뒤의 다른 구간과 자리를 바꾼다
    const prevRole = cur?.sec.role;
    if (it.role === prevRole) {
      const j = queue.findIndex((x) => x.role !== prevRole && !(x.role === 'bridge' && rt.intensity >= 0.7));
      if (j >= 0) {
        const alt = queue.splice(j, 1)[0];
        queue.unshift(it);
        it = alt;
      } else if (it.role !== 'climax') {
        // 바꿀 것이 없으면 다른 역할로 (B ↔ A')
        it = { role: it.role === 'B' ? 'A2' : 'B', bars: it.bars };
      }
    }
    return it;
  };

  const begin = (t: number, s: number, it: PlanItem) => {
    const visit = visits.get(it.role) ?? 0;
    visits.set(it.role, visit + 1);
    const sec: Section = { role: it.role, bars: it.bars, index: index++, cycle, visit, start: s, startBar: rt.bar(s) };
    safe(() => spec.enter(sec, t));
    const scope = rt.fork(spec.level?.(sec) ?? 1);
    let layers: Layer[] = [];
    safe(() => {
      layers = spec.build(scope.rt, sec);
    });
    for (const l of layers) {
      safe(() => l.start?.(t));
      safe(() => l.sanity?.(rt.sanity, t));
      safe(() => l.intensity?.(rt.intensity, t));
    }
    cur = { sec, scope, layers, bar: 0, rising: false };
    baseInt = rt.intensity;
    if (it.role === 'climax') lastClimaxBar = sec.startBar;
    formDebug.onSection?.({ time: t, role: sec.role, bars: sec.bars, cycle, index: sec.index, intensity: rt.intensity });
    if (it.role === 'outro') safe(() => spec.hooks?.outro?.(t));
  };

  /** 구간을 끝낸다: 더는 진행하지 않고, 남은 소리는 페이드한 뒤 노드째 정리 */
  const finish = (t: number) => {
    const c = cur;
    if (!c) return;
    cur = undefined;
    const tail = spec.tail?.(c.sec) ?? 1.5;
    c.scope.fade(0, tail, t + 0.02);
    const ctx = rt.ctx;
    ctx.setTimeout(() => {
      if (c.scope.disposed) return;
      const now = ctx.currentTime;
      for (const l of c.layers) safe(() => l.stop?.(now));
      c.scope.dispose();
    }, Math.max(0, t - ctx.currentTime) + tail + 0.4);
  };

  /** 다음 구간으로 들어가는 라이저 */
  const rise = (t: number, from: Role, to: Role, bars: number) => {
    const e0 = ENERGY[from];
    const e1 = ENERGY[to];
    if (to === 'outro') return;
    if (to === 'climax' || (e1 >= 0.5 && e1 > e0 + 0.15)) fx.rise(t, rt.barDur * bars, to === 'climax' ? 1 : 0.75);
    else if (e1 >= 0.5 && chance(0.4)) fx.rise(t + rt.barDur * 0.5, rt.barDur * 0.5, 0.5);
  };

  /** 새 구간 첫 박의 임팩트 */
  const land = (t: number, from: Role, to: Role) => {
    const e0 = ENERGY[from];
    const e1 = ENERGY[to];
    if (to === 'climax') fx.hit(t, 1);
    else if (to === 'outro') fx.hit(t, 0.8); // 음원 테마의 첫 박과 겹친다
    else if (to === 'bridge') fx.hit(t, 0.7);
    else if (e1 >= 0.5 && e1 > e0 + 0.15) fx.hit(t, 0.85);
    else if (e1 >= 0.5 && chance(0.35)) fx.hit(t, 0.5);
  };

  const onBar = (t: number, s: number) => {
    if (!cur) {
      begin(t, s, pending ?? choose(t));
      pending = undefined;
      return;
    }
    cur.bar++;
    const sec = cur.sec;
    if (cur.bar >= sec.bars) {
      const next = pending ?? choose(t);
      pending = undefined;
      const from = sec.role;
      finish(t);
      land(t, from, next.role);
      begin(t, s, next);
      return;
    }
    // 흐름: 강도가 확 오르면(수호자 체력 절반, 위기) 4마디 단위로 끊고 절정으로
    const inten = rt.intensity;
    const calm = sec.role !== 'climax' && sec.role !== 'outro';
    if (!forceClimax && !ending && calm && inten - baseInt >= JUMP && rt.bar(s) - lastClimaxBar >= 12) {
      forceClimax = true;
      baseInt = inten;
    }
    // 다음 구간이 아직 정해지지 않았으면 가까운 4마디 경계에서 끊는다 (위기의 숨 고르기도)
    if (!pending && calm && (forceClimax || (sec.role === 'bridge' && inten >= 0.7))) {
      const cut = Math.ceil((cur.bar + 1) / 4) * 4;
      if (cut < sec.bars) sec.bars = cut;
    }
    const left = sec.bars - cur.bar;
    if (left === 2 && sec.role === 'bridge' && !cur.rising) {
      // 숨 고르기 → 절정은 두 마디에 걸쳐 끌어올린다
      pending = choose(t + rt.barDur * 2);
      if (pending.role === 'climax') {
        cur.rising = true;
        rise(t, sec.role, pending.role, 2);
      }
    } else if (left === 1) {
      pending = pending ?? choose(t + rt.barDur);
      if (!cur.rising) {
        cur.rising = true;
        rise(t, sec.role, pending.role, 1);
      }
    }
  };

  return {
    step(t, s) {
      if (stopped) return;
      if (rt.isBar(s)) onBar(t, s);
      const c = cur;
      if (!c) return;
      for (const l of c.layers) if (l.step) safe(() => l.step!(t, s));
    },
    stop(t) {
      stopped = true;
      const c = cur;
      if (c) for (const l of c.layers) safe(() => l.stop?.(t));
    },
    sanity(v, t) {
      const c = cur;
      if (c) for (const l of c.layers) safe(() => l.sanity?.(v, t));
    },
    intensity(x, t) {
      const c = cur;
      if (c) for (const l of c.layers) safe(() => l.intensity?.(x, t));
    },
  };
}
