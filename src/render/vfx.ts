import { Container, Sprite, type Texture } from 'pixi.js';

/**
 * 전투 이펙트 파티클 엔진.
 * - 스프라이트/파티클 객체를 모두 풀링한다 (매 프레임 할당 없음)
 * - 블렌드 모드별로 레이어를 나눠 배치(batch)가 깨지지 않게 한다
 * - 동시에 살아 있는 파티클 수를 제한한다
 */

export type Layer =
  /** 유닛 뒤 (가산) — 소환진, 발밑 빛 */
  | 'under'
  /** 유닛 앞, 연기 뒤 (가산) */
  | 'fxB'
  /** 유닛 앞 (일반) — 연기, 재, 검은 구체 */
  | 'fxN'
  /** 유닛 앞 (가산) — 섬광, 불꽃, 파편 */
  | 'fxA'
  /** 화면 공간 (가산, 아래) */
  | 'scB'
  /** 화면 공간 (일반) — 할퀸 상처, 먹물 촉수 */
  | 'scN'
  /** 화면 공간 (가산, 위) */
  | 'scA';

export const LAYERS: Layer[] = ['under', 'fxB', 'fxN', 'fxA', 'scB', 'scN', 'scA'];
const ADDITIVE: Record<Layer, boolean> = { under: true, fxB: true, fxN: false, fxA: true, scB: true, scN: false, scA: true };

/** 보통 한도 / 중요한 것(force)까지 포함한 절대 한도 */
const CAP = 340;
const HARD_CAP = 400;

export const E_LIN = 0;
export const E_OUT = 1;
export const E_IN = 2;
export const E_INOUT = 3;
export const E_BACK = 4;
export const E_OUT4 = 5;

export function ease(k: number, t: number): number {
  switch (k) {
    case E_OUT:
      return 1 - (1 - t) * (1 - t);
    case E_IN:
      return t * t;
    case E_INOUT:
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case E_BACK: {
      const u = t - 1;
      return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
    }
    case E_OUT4: {
      const u = 1 - t;
      return 1 - u * u * u * u;
    }
    default:
      return t;
  }
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bl = ab + ((b & 255) - ab) * t;
  return ((r & 255) << 16) | ((g & 255) << 8) | (bl & 255);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

export interface EmitOpts {
  vx?: number;
  vy?: number;
  /** 가속도 (중력은 ay) */
  ax?: number;
  ay?: number;
  /** 초당 감속 비율 */
  drag?: number;
  life: number;
  delay?: number;
  /** 크기: 시작 → 끝 (scale.x) */
  scale?: number;
  scale1?: number;
  /** 세로/가로 비 (scale.y = scale.x × ratio) */
  ratio?: number;
  ratio1?: number;
  ease?: number;
  /** 최대 알파 */
  alpha?: number;
  /** 수명 비율: 이때까지 나타나고 */
  fadeIn?: number;
  /** 수명 비율: 이때부터 사라진다 */
  fadeOut?: number;
  rot?: number;
  spin?: number;
  /** 속도 방향으로 회전 */
  align?: boolean;
  /**
   * 바닥에 눕힌 원판처럼: 회전을 먼저 하고 세로로 찌그러뜨린다 (ratio < 1인 마법진이 돌 때 기울지 않게).
   * 회전 + 비대칭 크기를 skew로 표현한다.
   */
  flat?: boolean;
  /** 속도에 비례해 가로로 늘인다 (px/s 당 배율) */
  stretch?: number;
  tint?: number;
  /** 수명 동안 이 색으로 변한다 */
  tint1?: number;
  anchorX?: number;
  anchorY?: number;
  /** 이 점으로 끌려간다 (px/s²) */
  pullX?: number;
  pullY?: number;
  pull?: number;
  /** 좌우 흔들림 (px), 진동수 (rad/s) */
  wobble?: number;
  wobbleF?: number;
  /** 0~1 깜박임 */
  flicker?: number;
  /** 매 프레임 추가 처리 (기본 계산 뒤, 스프라이트 반영 전) */
  fn?: (p: Particle, t: number, dt: number) => void;
  /** 한도를 넘어도 만든다 (큰 섬광 등 중요한 것) */
  force?: boolean;
}

interface LayerRec {
  c: Container;
  pool: Sprite[];
  add: boolean;
}

export class Particle {
  s!: Sprite;
  layer!: LayerRec;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  ax = 0;
  ay = 0;
  drag = 0;
  age = 0;
  life = 1;
  delay = 0;
  s0 = 1;
  s1 = 1;
  r0 = 1;
  r1 = 1;
  ease = 0;
  amax = 1;
  fin = 0.08;
  fout = 0.55;
  rot = 0;
  spin = 0;
  align = false;
  flat = false;
  stretch = 0;
  t0 = 0xffffff;
  t1 = -1;
  px = 0;
  py = 0;
  pull = 0;
  wob = 0;
  wobF = 0;
  ph = 0;
  flick = 0;
  fn: ((p: Particle, t: number, dt: number) => void) | null = null;
  /** 이번 프레임 값 (fn에서 바꿀 수 있다) */
  sx = 1;
  sy = 1;
  a = 1;
  /** 자유 용도 */
  u0 = 0;
  u1 = 0;
}

export class Vfx {
  readonly layers = {} as Record<Layer, Container>;
  private recs = {} as Record<Layer, LayerRec>;
  private live: Particle[] = [];
  private free: Particle[] = [];

  constructor() {
    for (const l of LAYERS) {
      const c = new Container();
      c.label = `vfx-${l}`;
      this.layers[l] = c;
      this.recs[l] = { c, pool: [], add: ADDITIVE[l] };
    }
  }

  get count() {
    return this.live.length;
  }

  /** 여유가 있는지 (작은 장식 파티클을 뿌리기 전에 확인) */
  room(n = 1): boolean {
    return this.live.length + n <= CAP;
  }

  emit(layer: Layer, tex: Texture, x: number, y: number, o: EmitOpts): Particle | null {
    if (this.live.length >= (o.force ? HARD_CAP : CAP)) return null;
    const L = this.recs[layer];
    const p = this.free.pop() ?? new Particle();
    let s = L.pool.pop();
    if (!s) {
      s = new Sprite(tex);
      s.blendMode = L.add ? 'add' : 'normal';
      L.c.addChild(s);
    } else s.texture = tex;
    s.anchor.set(o.anchorX ?? 0.5, o.anchorY ?? 0.5);
    s.skew.set(0, 0);
    s.visible = false;
    p.s = s;
    p.layer = L;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.ax = o.ax ?? 0;
    p.ay = o.ay ?? 0;
    p.drag = o.drag ?? 0;
    p.age = 0;
    p.life = Math.max(0.016, o.life);
    p.delay = o.delay ?? 0;
    p.s0 = o.scale ?? 1;
    p.s1 = o.scale1 ?? p.s0;
    p.r0 = o.ratio ?? 1;
    p.r1 = o.ratio1 ?? p.r0;
    p.ease = o.ease ?? E_OUT;
    p.amax = o.alpha ?? 1;
    p.fin = o.fadeIn ?? 0.06;
    p.fout = o.fadeOut ?? 0.5;
    p.rot = o.rot ?? 0;
    p.spin = o.spin ?? 0;
    p.align = o.align ?? false;
    p.flat = o.flat ?? false;
    p.stretch = o.stretch ?? 0;
    p.t0 = o.tint ?? 0xffffff;
    p.t1 = o.tint1 ?? -1;
    p.pull = o.pull ?? 0;
    p.px = o.pullX ?? x;
    p.py = o.pullY ?? y;
    p.wob = o.wobble ?? 0;
    p.wobF = o.wobbleF ?? 6;
    p.ph = Math.random() * 6.283;
    p.flick = o.flicker ?? 0;
    p.fn = o.fn ?? null;
    p.u0 = 0;
    p.u1 = 0;
    s.tint = p.t0;
    s.alpha = 0;
    this.live.push(p);
    return p;
  }

  update(dt: number) {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age < p.delay) continue;
      const t = (p.age - p.delay) / p.life;
      if (t >= 1) {
        this.kill(i);
        continue;
      }
      const s = p.s;
      if (!s.visible) s.visible = true;
      // 물리
      if (p.pull !== 0) {
        const dx = p.px - p.x;
        const dy = p.py - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        p.vx += (dx / d) * p.pull * dt;
        p.vy += (dy / d) * p.pull * dt;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag !== 0) {
        const k = p.drag * dt >= 1 ? 0 : 1 - p.drag * dt;
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // 크기 / 알파 / 회전
      const e = ease(p.ease, t);
      p.sx = p.s0 + (p.s1 - p.s0) * e;
      p.sy = p.sx * (p.r0 + (p.r1 - p.r0) * e);
      if (p.stretch !== 0) p.sx *= 1 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * p.stretch;
      let a = p.amax;
      if (t < p.fin) a *= t / p.fin;
      else if (t > p.fout) a *= (1 - t) / (1 - p.fout);
      if (p.flick !== 0) a *= 1 - p.flick * Math.random();
      p.a = a;
      if (p.align) p.rot = Math.atan2(p.vy, p.vx);
      else p.rot += p.spin * dt;
      if (p.fn) p.fn(p, t, dt);
      s.x = p.wob !== 0 ? p.x + Math.sin(p.ph + p.age * p.wobF) * p.wob : p.x;
      s.y = p.y;
      if (p.flat) {
        // M = S(sx, sy) · R(rot) 를 Pixi의 (scale, skew)로 옮긴다
        const k = p.sx !== 0 ? p.sy / p.sx : 1;
        const c = Math.cos(p.rot);
        const sn = Math.sin(p.rot);
        s.rotation = 0;
        s.skew.set(-Math.atan2(sn, k * c), Math.atan2(k * sn, c));
        s.scale.set(p.sx * Math.sqrt(c * c + k * k * sn * sn), p.sx * Math.sqrt(sn * sn + k * k * c * c));
      } else {
        s.scale.set(p.sx, p.sy);
        s.rotation = p.rot;
      }
      s.alpha = p.a < 0 ? 0 : p.a;
      if (p.t1 >= 0) s.tint = lerpColor(p.t0, p.t1, t);
    }
  }

  private kill(i: number) {
    const live = this.live;
    const p = live[i];
    p.s.visible = false;
    p.layer.pool.push(p.s);
    p.fn = null;
    const last = live.pop()!;
    if (i < live.length) live[i] = last;
    this.free.push(p);
  }

  clear() {
    for (let i = this.live.length - 1; i >= 0; i--) this.kill(i);
  }
}
