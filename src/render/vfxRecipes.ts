import type { Texture } from 'pixi.js';
import { E_BACK, E_IN, E_INOUT, E_LIN, E_OUT, E_OUT4, pick, rand, type EmitOpts, type Layer, type Particle, type Vfx } from './vfx';
import { CRESCENT_R, VT } from './vfxTextures';

/**
 * 전투 이펙트 조합 — 텍스처 + 파티클로 만든 연출 레시피.
 * 좌표는 모두 화면(CSS px) 기준. size = 적의 크기 (보통 100~160px).
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 적 피격 정보 */
export interface HitCtx {
  /** 몸 중심 */
  x: number;
  y: number;
  size: number;
  /** 세기 배율 (피해량·치명타 반영) */
  power: number;
  /** 공격이 날아온 곳 */
  from: Pt;
}

const TAU = Math.PI * 2;

// ───────────── 공통 조각 ─────────────

type Extra = Partial<EmitOpts>;

/** 십자 섬광 (px = 대략적인 지름) */
export function flare(fx: Vfx, layer: Layer, x: number, y: number, px: number, tint: number, life = 0.2, o: Extra = {}) {
  return fx.emit(layer, VT.flare(), x, y, {
    life,
    scale: (px * 0.45) / 256,
    scale1: px / 256,
    ease: E_OUT4,
    fadeIn: 0.03,
    fadeOut: 0.25,
    tint,
    rot: rand(-0.4, 0.4),
    force: true,
    ...o,
  });
}

/** 부드러운 빛 (px = 지름) */
export function glow(fx: Vfx, layer: Layer, x: number, y: number, px: number, tint: number, life = 0.3, o: Extra = {}) {
  return fx.emit(layer, VT.glow(), x, y, { life, scale: px / 128, tint, fadeIn: 0.05, fadeOut: 0.3, force: true, ...o });
}

/** 퍼지는 고리 (d0 → d1 지름) */
export function ring(fx: Vfx, layer: Layer, x: number, y: number, d0: number, d1: number, life: number, tint: number, o: Extra & { soft?: boolean } = {}) {
  const { soft, ...rest } = o;
  return fx.emit(layer, soft ? VT.ringSoft() : VT.ring(), x, y, {
    life,
    scale: d0 / 256,
    scale1: d1 / 256,
    ease: E_OUT4,
    fadeIn: 0.02,
    fadeOut: 0.3,
    tint,
    force: true,
    ...rest,
  });
}

interface SparkOpts {
  /** 방향 (없으면 사방) */
  ang?: number;
  /** 퍼짐 각 (전체 폭, rad) */
  spread?: number;
  speed: [number, number];
  life: [number, number];
  /** 길이 px */
  len: [number, number];
  /** 굵기 배율 */
  thick?: number;
  tint: number;
  tint1?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
  delay?: number;
  /** 시작점 흩어짐 반경 */
  r?: number;
}

/** 속도 방향으로 늘어나는 불꽃 줄기 */
export function sparks(fx: Vfx, layer: Layer, x: number, y: number, n: number, o: SparkOpts) {
  const tex = VT.streak();
  for (let i = 0; i < n; i++) {
    const a = o.ang === undefined ? Math.random() * TAU : o.ang + (Math.random() - 0.5) * (o.spread ?? TAU);
    const sp = rand(o.speed[0], o.speed[1]);
    const len = rand(o.len[0], o.len[1]);
    const sx = len / 100;
    const r = o.r ? Math.random() * o.r : 0;
    const ra = Math.random() * TAU;
    fx.emit(layer, tex, x + Math.cos(ra) * r, y + Math.sin(ra) * r, {
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      ay: o.gravity ?? 0,
      drag: o.drag ?? 3,
      life: rand(o.life[0], o.life[1]),
      delay: o.delay,
      scale: sx,
      scale1: sx * 0.35,
      ratio: (0.62 * (o.thick ?? 1)) / sx,
      ease: E_LIN,
      anchorX: 0.78,
      align: true,
      tint: o.tint,
      tint1: o.tint1,
      alpha: o.alpha ?? 1,
      fadeIn: 0.02,
      fadeOut: 0.45,
    });
  }
}

interface MoteOpts {
  r?: number;
  speed?: [number, number];
  ang?: number;
  spread?: number;
  vy?: [number, number];
  size: [number, number];
  life: [number, number];
  tint: number;
  tint1?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
  delay?: [number, number];
  wobble?: number;
  flicker?: number;
  tex?: Texture | (() => Texture);
  spin?: number;
  grow?: number;
  fadeIn?: number;
  fadeOut?: number;
  rx?: number;
  ry?: number;
}

/** 작은 빛 알갱이 (불티, 반짝임, 포자) */
export function motes(fx: Vfx, layer: Layer, x: number, y: number, n: number, o: MoteOpts) {
  for (let i = 0; i < n; i++) {
    if (!fx.room()) return;
    const tex = typeof o.tex === 'function' ? o.tex() : (o.tex ?? VT.core());
    const a = o.ang === undefined ? Math.random() * TAU : o.ang + (Math.random() - 0.5) * (o.spread ?? TAU);
    const sp = o.speed ? rand(o.speed[0], o.speed[1]) : 0;
    const ra = Math.random() * TAU;
    const rr = Math.sqrt(Math.random());
    const px = x + Math.cos(ra) * rr * (o.rx ?? o.r ?? 0);
    const py = y + Math.sin(ra) * rr * (o.ry ?? o.r ?? 0);
    const s = rand(o.size[0], o.size[1]) / tex.width;
    fx.emit(layer, tex, px, py, {
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp + (o.vy ? rand(o.vy[0], o.vy[1]) : 0),
      ay: o.gravity ?? 0,
      drag: o.drag ?? 1.5,
      life: rand(o.life[0], o.life[1]),
      delay: o.delay ? rand(o.delay[0], o.delay[1]) : 0,
      scale: s,
      scale1: s * (o.grow ?? 0.5),
      ease: E_LIN,
      tint: o.tint,
      tint1: o.tint1,
      alpha: o.alpha ?? 1,
      wobble: o.wobble,
      wobbleF: rand(3, 7),
      flicker: o.flicker,
      spin: o.spin ? rand(-o.spin, o.spin) : 0,
      rot: o.spin ? Math.random() * TAU : 0,
      fadeIn: o.fadeIn ?? 0.1,
      fadeOut: o.fadeOut ?? 0.5,
    });
  }
}

interface SmokeOpts {
  r?: number;
  speed: [number, number];
  ang?: number;
  spread?: number;
  vy?: [number, number];
  size: [number, number];
  grow?: number;
  life: [number, number];
  tint: number;
  tint1?: number;
  alpha: number;
  delay?: [number, number];
  drag?: number;
  gravity?: number;
}

/** 연기·먼지 뭉치 */
export function smoke(fx: Vfx, layer: Layer, x: number, y: number, n: number, o: SmokeOpts) {
  const texs = VT.smokes();
  for (let i = 0; i < n; i++) {
    if (!fx.room()) return;
    const a = o.ang === undefined ? Math.random() * TAU : o.ang + (Math.random() - 0.5) * (o.spread ?? TAU);
    const sp = rand(o.speed[0], o.speed[1]);
    const ra = Math.random() * TAU;
    const rr = Math.random() * (o.r ?? 0);
    const s = rand(o.size[0], o.size[1]) / 128;
    fx.emit(layer, pick(texs), x + Math.cos(ra) * rr, y + Math.sin(ra) * rr, {
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp + (o.vy ? rand(o.vy[0], o.vy[1]) : 0),
      ay: o.gravity ?? 0,
      drag: o.drag ?? 2.5,
      life: rand(o.life[0], o.life[1]),
      delay: o.delay ? rand(o.delay[0], o.delay[1]) : 0,
      scale: s,
      scale1: s * (o.grow ?? 2),
      ease: E_OUT,
      rot: Math.random() * TAU,
      spin: rand(-0.8, 0.8),
      tint: o.tint,
      tint1: o.tint1,
      alpha: o.alpha,
      fadeIn: 0.12,
      fadeOut: 0.35,
    });
  }
}

/** 날아가는 파편 */
export function shards(
  fx: Vfx,
  layer: Layer,
  x: number,
  y: number,
  n: number,
  o: { speed: [number, number]; size: [number, number]; life: [number, number]; tint: number; tint1?: number; gravity?: number; ang?: number; spread?: number; up?: number; r?: number; alpha?: number; delay?: number },
) {
  const texs = VT.shards();
  for (let i = 0; i < n; i++) {
    const a = o.ang === undefined ? Math.random() * TAU : o.ang + (Math.random() - 0.5) * (o.spread ?? TAU);
    const sp = rand(o.speed[0], o.speed[1]);
    const s = rand(o.size[0], o.size[1]) / 64;
    const ra = Math.random() * TAU;
    const rr = Math.random() * (o.r ?? 0);
    fx.emit(layer, pick(texs), x + Math.cos(ra) * rr, y + Math.sin(ra) * rr, {
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (o.up ?? 0),
      ay: o.gravity ?? 900,
      drag: 1.2,
      life: rand(o.life[0], o.life[1]),
      delay: o.delay,
      scale: s,
      scale1: s * 0.7,
      ease: E_LIN,
      rot: Math.random() * TAU,
      spin: rand(-14, 14),
      tint: o.tint,
      tint1: o.tint1,
      alpha: o.alpha ?? 1,
      fadeIn: 0.02,
      fadeOut: 0.55,
    });
  }
}

// ───────────── 플레이어 → 적 (피해 속성별) ─────────────

/**
 * 초승달 한 획. phi = 칼날이 움직이는 방향, m = 1이면 호가 진행 방향의 오른쪽으로, -1이면 왼쪽으로 부푼다.
 * 몸 중심(x, y)을 호의 안쪽 가까이로 지나가도록 회전 중심을 잡고, 머리 쪽으로 쓸어 내린다.
 */
function slashArc(fx: Vfx, x: number, y: number, S: number, phi: number, m: number, tint: number, delay: number) {
  const Rw = S * 0.62;
  const sc = Rw / CRESCENT_R;
  const r0 = phi - Math.PI / 2;
  const cx = x - Rw * 0.8 * m * Math.cos(r0);
  const cy = y - Rw * 0.8 * m * Math.sin(r0);
  const sweep = 0.8;
  const arc = (layer: Layer, lag: number, alpha: number, k: number, col: number) =>
    fx.emit(layer, VT.crescent(), cx, cy, {
      life: 0.28,
      delay,
      scale: sc * k,
      alpha,
      tint: col,
      fadeIn: 0.02,
      fadeOut: 0.3,
      force: true,
      fn: (p, t) => {
        const e = 1 - (1 - Math.min(1, t / 0.4)) ** 3;
        p.rot = r0 + m * (sweep * (e - 0.55) + 0.22 * t - lag);
        p.sx *= m;
      },
    });
  arc('fxA', 0.28, 0.22, 0.95, tint);
  arc('fxA', 0.14, 0.45, 0.975, tint);
  arc('fxB', 0.02, 0.9, 1.05, tint);
  arc('fxA', 0, 1, 1, 0xffffff);
}

/** 참격: 초승달 궤적 + 잔상 + 베인 선 + 쇳불꽃 */
export function hitSlash(fx: Vfx, c: HitCtx, tint: number, big: boolean) {
  const { x, y, size, power } = c;
  // 비스듬히 아래로 베어 내린다
  const right = Math.random() < 0.5;
  const phi = right ? rand(0.2, 0.36) * Math.PI : rand(0.64, 0.8) * Math.PI;
  const m = Math.random() < 0.5 ? 1 : -1;
  slashArc(fx, x, y, size * power, phi, m, tint, 0);
  if (big) slashArc(fx, x, y, size * power * 0.95, Math.PI - phi, -m, tint, 0.07);
  // 베인 선 (칼날이 지나간 방향)
  const mdir = phi;
  const cut = size * 1.45 * power;
  fx.emit('fxA', VT.streak(), x, y, {
    life: 0.22,
    delay: 0.04,
    scale: cut / 128,
    scale1: (cut * 1.1) / 128,
    ratio: 0.16,
    rot: mdir,
    tint: 0xffffff,
    fadeIn: 0.05,
    fadeOut: 0.3,
    force: true,
  });
  glow(fx, 'fxB', x, y, cut, tint, 0.24, { ratio: 0.12, rot: mdir, delay: 0.04, alpha: 0.8 });
  flare(fx, 'fxA', x, y, size * 0.9 * power, 0xfff6e8, 0.16, { delay: 0.05, rot: mdir });
  // 쇳불꽃
  sparks(fx, 'fxA', x, y, big ? 22 : 15, {
    ang: mdir,
    spread: 1.5,
    speed: [280, 760],
    life: [0.22, 0.48],
    len: [20, 50],
    thick: 1,
    tint: 0xfff4d8,
    tint1: 0xff8a30,
    gravity: 900,
    drag: 2.8,
    delay: 0.05,
  });
}

/** 관통: 모여드는 찌르기 줄기 + 꿰뚫는 섬광 + 뒤로 튀는 바늘 불꽃 */
export function hitPierce(fx: Vfx, c: HitCtx, tint: number, big: boolean) {
  const { x, y, size, power, from } = c;
  const ang = Math.atan2(y - from.y, x - from.x);
  const dist = Math.hypot(x - from.x, y - from.y);
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const n = big ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * size * 0.07;
    const a = ang + (i - (n - 1) / 2) * 0.05;
    const startD = Math.min(dist * 0.7, size * 1.8);
    const x0 = x - Math.cos(a) * startD - sn * off;
    const y0 = y - Math.sin(a) * startD + cs * off;
    const x1 = x - sn * off * 0.25;
    const y1 = y + cs * off * 0.25;
    const len = size * rand(0.8, 1.1) * power;
    const sx = len / 100;
    fx.emit('fxA', VT.streak(), x0, y0, {
      life: 0.17,
      delay: i * 0.016,
      scale: sx,
      ratio: (i === (n - 1) >> 1 ? 0.75 : 0.5) / sx,
      rot: a,
      anchorX: 0.78,
      tint: i === (n - 1) >> 1 ? 0xffffff : 0xfff0c8,
      fadeIn: 0.04,
      fadeOut: 0.55,
      force: true,
      fn: (p, t) => {
        const k = Math.min(1, t / 0.45);
        const e = k * k;
        p.x = x0 + (x1 - x0) * e;
        p.y = y0 + (y1 - y0) * e;
        if (t > 0.45) p.sx *= Math.max(0.05, 1 - (t - 0.45) * 1.8);
      },
    });
  }
  const d = 0.07;
  flare(fx, 'fxA', x, y, size * 1.15 * power, 0xfff2c8, 0.2, { delay: d, rot: ang });
  ring(fx, 'fxA', x, y, size * 0.12, size * 0.8 * power, 0.26, tint, { delay: d, alpha: 0.9, ratio: 0.7, rot: ang + Math.PI / 2 });
  sparks(fx, 'fxA', x, y, big ? 16 : 11, {
    ang,
    spread: 0.75,
    speed: [520, 1150],
    life: [0.12, 0.26],
    len: [34, 80],
    thick: 0.5,
    tint: 0xfffbe8,
    tint1: tint,
    drag: 5,
    delay: d,
  });
  sparks(fx, 'fxA', x, y, 6, { ang: ang + Math.PI, spread: 1.8, speed: [140, 340], life: [0.15, 0.3], len: [12, 26], thick: 0.6, tint: 0xffe0a0, gravity: 600, delay: d });
}

/** 총구 화염 (플레이어 시점, 화면 아래) */
export function muzzleFlash(fx: Vfx, m: Pt, ang: number, scale = 1) {
  fx.emit('scA', VT.muzzle(), m.x, m.y, {
    life: 0.085,
    scale: 1.05 * scale,
    scale1: 1.25 * scale,
    rot: ang,
    anchorX: 0.2,
    ratio: rand(0.8, 1.1),
    tint: 0xffe6a0,
    fadeIn: 0.01,
    fadeOut: 0.3,
    force: true,
  });
  glow(fx, 'scB', m.x, m.y, 150 * scale, 0xffa040, 0.13, { alpha: 0.9, fadeIn: 0.01 });
  flare(fx, 'scA', m.x + Math.cos(ang) * 14, m.y + Math.sin(ang) * 14, 120 * scale, 0xfff2c0, 0.07, { rot: ang });
  smoke(fx, 'scN', m.x + Math.cos(ang) * 18, m.y + Math.sin(ang) * 18, 3, {
    speed: [30, 90],
    ang,
    spread: 0.8,
    vy: [-50, -20],
    size: [26, 44],
    grow: 2.4,
    life: [0.6, 0.9],
    tint: 0x5c5a5e,
    alpha: 0.35,
    delay: [0.02, 0.06],
  });
  sparks(fx, 'scA', m.x, m.y, 5, { ang, spread: 0.5, speed: [500, 900], life: [0.05, 0.12], len: [14, 28], thick: 0.5, tint: 0xffe8a0, drag: 6 });
}

/** 총탄: 예광 줄기 + 작은 섬광 + 흙먼지 + 튕김 불꽃 */
export function hitBullet(fx: Vfx, c: HitCtx, m: Pt, tint: number, big: boolean) {
  const { x, y, size, power } = c;
  const ang = Math.atan2(y - m.y, x - m.x);
  const dist = Math.hypot(x - m.x, y - m.y);
  const travel = 0.05;
  // 예광탄 머리
  const len = Math.min(dist * 0.55, 220);
  const sx = len / 100;
  fx.emit('fxA', VT.streak(), m.x, m.y, {
    life: travel + 0.05,
    scale: sx,
    ratio: 0.42 / sx,
    rot: ang,
    anchorX: 0.78,
    tint: 0xfff2c8,
    fadeIn: 0.01,
    fadeOut: 0.5,
    force: true,
    fn: (p, t, _dt) => {
      const k = Math.min(1, (t * (travel + 0.05)) / travel);
      p.x = m.x + (x - m.x) * k;
      p.y = m.y + (y - m.y) * k;
    },
  });
  // 탄도의 희미한 잔광
  glow(fx, 'fxB', (m.x + x) / 2, (m.y + y) / 2, dist, 0xffd890, 0.16, { ratio: 10 / dist, rot: ang, alpha: 0.35, fadeIn: 0.01, fadeOut: 0.1 });
  const d = travel;
  flare(fx, 'fxA', x, y, size * 0.85 * power, 0xfff0c0, 0.16, { delay: d, rot: ang });
  ring(fx, 'fxA', x, y, size * 0.08, size * 0.5 * power, 0.2, tint, { delay: d, alpha: 0.8 });
  smoke(fx, 'fxN', x, y, big ? 4 : 3, {
    speed: [40, 120],
    ang: ang + Math.PI,
    spread: 2.2,
    vy: [-40, -10],
    size: [26, 42],
    grow: 2.2,
    life: [0.5, 0.8],
    tint: 0x6a5f55,
    alpha: 0.45,
    delay: [d, d + 0.03],
  });
  sparks(fx, 'fxA', x, y, big ? 14 : 9, {
    ang: ang + Math.PI,
    spread: 2.6,
    speed: [220, 620],
    life: [0.15, 0.35],
    len: [12, 30],
    thick: 0.6,
    tint: 0xfff0b0,
    tint1: 0xff8a30,
    gravity: 1000,
    delay: d,
  });
  sparks(fx, 'fxA', x, y, 5, { ang, spread: 0.6, speed: [500, 900], life: [0.08, 0.18], len: [30, 60], thick: 0.4, tint: 0xfff6d8, drag: 6, delay: d });
}

/** 타격: 충격파 고리 + 먼지 + 돌조각 */
export function hitBlunt(fx: Vfx, c: HitCtx, tint: number, big: boolean) {
  const { x, y, size, power } = c;
  flare(fx, 'fxA', x, y, size * 1.0 * power, 0xfff0d8, 0.15, { rot: rand(0, 1), alpha: big ? 0.5 : 1 });
  glow(fx, 'fxB', x, y, size * 1.3 * power, tint, 0.28, { alpha: 0.42 });
  ring(fx, 'fxB', x, y, size * 0.2, size * 2.0 * power, 0.42, tint, { soft: true, alpha: 0.4, ratio: 0.8 });
  ring(fx, 'fxA', x, y, size * 0.3, size * 1.5 * power, 0.26, 0xffe8cc, { alpha: 0.6, ratio: 0.8 });
  if (big) ring(fx, 'fxA', x, y, size * 0.4, size * 2.6, 0.5, 0xffd8b0, { alpha: 0.4, ratio: 0.8, delay: 0.05 });
  smoke(fx, 'fxN', x, y + size * 0.1, big ? 11 : 8, {
    r: size * 0.15,
    speed: [120, 300],
    vy: [-40, 0],
    size: [34, 62],
    grow: 2.1,
    life: [0.6, 0.95],
    tint: 0x8a7a66,
    tint1: 0x5a4e44,
    alpha: 0.55,
    drag: 3.5,
  });
  shards(fx, 'fxN', x, y, big ? 9 : 6, { speed: [240, 520], ang: -Math.PI / 2, spread: 2.6, size: [10, 18], life: [0.45, 0.75], tint: 0x9a8670, gravity: 1300, up: 120 });
  sparks(fx, 'fxA', x, y, 7, { speed: [200, 480], life: [0.15, 0.3], len: [12, 26], thick: 0.7, tint: 0xffe0b8, tint1: 0xff9a50, gravity: 700 });
}

/** 화염: 노란 심 + 솟는 불길 + 불티 + 검은 연기 */
export function hitFire(fx: Vfx, c: HitCtx, big: boolean) {
  const { x, y, size, power } = c;
  glow(fx, 'fxA', x, y, size * 0.8 * power, 0xffc060, 0.18, { alpha: 0.75, scale1: (size * 1.2 * power) / 128 });
  glow(fx, 'fxB', x, y + size * 0.05, size * 1.4 * power, 0xff4a10, 0.5, { alpha: 0.32, ratio: 0.9 });
  ring(fx, 'fxB', x, y, size * 0.3, size * 1.5 * power, 0.3, 0xff6a20, { soft: true, alpha: 0.22 });
  // 검은 연기 (불길 뒤)
  smoke(fx, 'fxN', x, y - size * 0.15, big ? 8 : 6, {
    r: size * 0.25,
    speed: [10, 50],
    vy: [-110, -60],
    size: [40, 70],
    grow: 2.2,
    life: [0.9, 1.3],
    tint: 0x2a1e18,
    tint1: 0x141010,
    alpha: 0.6,
    delay: [0.06, 0.2],
    drag: 1,
  });
  // 불꽃 혀
  const n = big ? 16 : 12;
  const texs = VT.flames();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = Math.random() * size * 0.3;
    const h = rand(0.5, 0.95) * size * power;
    const s = h / 128;
    fx.emit('fxA', pick(texs), x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6 + size * 0.12, {
      vx: Math.cos(a) * rand(20, 90),
      vy: -rand(90, 210),
      ay: -200,
      drag: 1.6,
      life: rand(0.36, 0.6),
      delay: rand(0, 0.1),
      scale: s * 0.45,
      scale1: s,
      ratio: 1,
      ratio1: 1.35,
      anchorY: 0.85,
      rot: rand(-0.35, 0.35),
      spin: rand(-0.7, 0.7),
      tint: 0xffd070,
      tint1: 0x8a1404,
      alpha: 0.78,
      fadeIn: 0.1,
      fadeOut: 0.4,
      wobble: 4,
      force: i < 8,
    });
  }
  // 불티
  motes(fx, 'fxA', x, y, big ? 22 : 15, {
    r: size * 0.3,
    speed: [80, 260],
    vy: [-160, -60],
    size: [6, 12],
    life: [0.6, 1.2],
    tint: 0xffc060,
    tint1: 0xff3a10,
    gravity: -240,
    drag: 1.4,
    wobble: 10,
    flicker: 0.45,
    grow: 0.4,
  });
}

/** 비전: 조여드는 마법진 + 문자 + 보랏빛 파동 */
export function hitArcane(fx: Vfx, c: HitCtx, tint: number, big: boolean) {
  const { x, y, size, power } = c;
  const snap = 0.16;
  const life = 0.62;
  const k0 = (size * 2.4 * power) / 256;
  const k1 = (size * 1.05 * power) / 256;
  fx.emit('fxA', VT.rune(), x, y, {
    life,
    scale: k0,
    tint,
    alpha: 1,
    fadeIn: 0.01,
    fadeOut: 0.45,
    ratio: 0.92,
    force: true,
    fn: (p, t) => {
      const ts = t * life;
      if (ts < snap) {
        const e = (ts / snap) ** 2;
        p.sx = k0 + (k1 - k0) * e;
        p.rot = -1.4 * (1 - e);
        p.a = 0.25 + 0.75 * e;
      } else {
        const q = (ts - snap) / (life - snap);
        p.sx = k1 * (1 + 0.18 * q);
        p.rot = 0.5 * q;
      }
      p.sy = p.sx * 0.92;
    },
  });
  // 반대로 도는 안쪽 마법진
  fx.emit('fxA', VT.rune(), x, y, {
    life: life * 0.9,
    delay: snap,
    scale: k1 * 0.55,
    scale1: k1 * 0.75,
    spin: -2.2,
    tint: 0xe0d0ff,
    alpha: 0.8,
    fadeIn: 0.02,
    fadeOut: 0.3,
    force: true,
  });
  flare(fx, 'fxA', x, y, size * 1.2 * power, 0xe8dcff, 0.22, { delay: snap });
  glow(fx, 'fxB', x, y, size * 1.8 * power, 0x8a50ff, 0.45, { delay: snap - 0.04, alpha: 0.75 });
  ring(fx, 'fxA', x, y, size * 0.4, size * 1.9 * power, 0.35, 0xc8a8ff, { delay: snap, alpha: 0.9 });
  // 빨려 들어오는 문자
  const g = VT.glyphs();
  const nIn = big ? 10 : 7;
  for (let i = 0; i < nIn; i++) {
    const a = (i / nIn) * TAU + rand(-0.2, 0.2);
    const r0 = size * rand(0.85, 1.15);
    fx.emit('fxA', pick(g), x + Math.cos(a) * r0, y + Math.sin(a) * r0, {
      life: snap,
      scale: 0.75,
      scale1: 0.35,
      tint: 0xd8c4ff,
      fadeIn: 0.2,
      fadeOut: 0.8,
      force: true,
      fn: (p, t) => {
        const e = t * t;
        const r = r0 * (1 - e * 0.85);
        const aa = a + e * 1.2;
        p.x = x + Math.cos(aa) * r;
        p.y = y + Math.sin(aa) * r;
      },
    });
  }
  // 터져 나가는 문자 조각
  motes(fx, 'fxA', x, y, big ? 14 : 10, {
    tex: () => pick(g),
    speed: [180, 420],
    size: [12, 20],
    life: [0.35, 0.6],
    delay: [snap, snap + 0.02],
    tint: 0xd8c4ff,
    tint1: 0x7a40ff,
    drag: 3,
    spin: 6,
    grow: 0.6,
  });
}

/** 공허: 검은 구체가 부풀었다가 꺼지고, 청록 테두리와 입자가 빨려 든다 */
export function hitVoid(fx: Vfx, c: HitCtx, big: boolean) {
  const { x, y, size, power } = c;
  const life = 0.55;
  const R = size * 1.25 * power;
  const blob = (layer: Layer, tint: number, mult: number, alpha: number) =>
    fx.emit(layer, VT.glow(), x, y, {
      life,
      scale: 0.01,
      tint,
      alpha,
      fadeIn: 0.01,
      fadeOut: 0.85,
      force: true,
      fn: (p, t) => {
        const grow = t < 0.3 ? 1 - (1 - t / 0.3) ** 3 : 1 - ((t - 0.3) / 0.7) ** 2.2;
        p.sx = (R * mult * Math.max(0.02, grow)) / 128;
        p.sy = p.sx;
      },
    });
  blob('fxB', 0x1fdfae, 1.18, 0.5);
  blob('fxN', 0x000000, 1.0, 0.97);
  blob('fxN', 0x000000, 0.7, 0.9);
  ring(fx, 'fxA', x, y, size * 2.0 * power, size * 0.15, 0.4, 0x4fffc4, { ease: E_IN, alpha: 0.7, fadeIn: 0.1, fadeOut: 0.8 });
  ring(fx, 'fxA', x, y, size * 0.2, size * 1.1 * power, 0.5, 0x9affe0, { alpha: 0.55, delay: 0.04, fadeOut: 0.5 });
  // 빨려 드는 입자
  const n = big ? 26 : 18;
  const tex = VT.streak();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = size * rand(0.8, 1.5) * power;
    const tang = 120 * (Math.random() < 0.5 ? 1 : -1);
    fx.emit('fxA', tex, x + Math.cos(a) * r, y + Math.sin(a) * r, {
      vx: -Math.sin(a) * tang,
      vy: Math.cos(a) * tang,
      pullX: x,
      pullY: y,
      pull: rand(2600, 4200),
      drag: 1.5,
      life: rand(0.25, 0.42),
      scale: 0.2,
      ratio: 2,
      stretch: 0.0016,
      align: true,
      anchorX: 0.78,
      tint: 0x9affe0,
      tint1: 0x1fbf94,
      fadeIn: 0.15,
      fadeOut: 0.7,
      fn: (p) => {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < 64) p.a = 0;
      },
    });
  }
  // 마지막에 튀는 청록 불꽃
  flare(fx, 'fxA', x, y, size * 0.7 * power, 0x8affd8, 0.18, { delay: life * 0.62 });
  sparks(fx, 'fxA', x, y, 8, { speed: [150, 380], life: [0.15, 0.32], len: [12, 26], thick: 0.6, tint: 0x8affd8, delay: life * 0.62 });
}

/** 고정 피해: 하얀 섬광 */
export function hitTrue(fx: Vfx, c: HitCtx) {
  const { x, y, size, power } = c;
  flare(fx, 'fxA', x, y, size * 1.3 * power, 0xffffff, 0.22);
  ring(fx, 'fxA', x, y, size * 0.2, size * 1.3 * power, 0.3, 0xffffff, { alpha: 0.8 });
  motes(fx, 'fxA', x, y, 8, { speed: [120, 300], size: [6, 12], life: [0.25, 0.5], tint: 0xffffff, drag: 3 });
}

/** 치명타/약점: 큰 섬광 + 넓은 고리 + 불꽃 */
export function critBurst(fx: Vfx, c: HitCtx, tint: number, weak: boolean) {
  const { x, y, size } = c;
  // 짧고 날카로운 별빛 + 가는 고리 하나 + 길게 튀는 불꽃 (화면을 하얗게 덮지 않게)
  flare(fx, 'fxA', x, y, size * 1.9, 0xffffff, 0.2, { rot: rand(0, 0.8), alpha: 0.85, fadeOut: 0.15 });
  glow(fx, 'fxB', x, y, size * 1.5, tint, 0.28, { alpha: 0.32 });
  ring(fx, 'fxA', x, y, size * 0.3, size * 2.5, 0.36, weak ? tint : 0xfff0c0, { alpha: 0.55, ratio: 0.85 });
  sparks(fx, 'fxA', x, y, 14, { speed: [450, 1000], life: [0.2, 0.42], len: [36, 80], thick: 0.8, tint: 0xffffff, tint1: tint, drag: 4 });
}

/** 적 방어도에 막힘: 푸른 파편 + 육각 반짝임 */
export function blockedHit(fx: Vfx, c: HitCtx, broke: boolean) {
  const { x, y, size } = c;
  ring(fx, 'fxA', x, y, size * 0.3, size * 1.4, 0.3, 0x9fd8ff, { alpha: 0.8 });
  shards(fx, 'fxA', x, y, broke ? 18 : 9, {
    speed: broke ? [220, 560] : [160, 380],
    size: [12, 24],
    life: [0.4, 0.7],
    tint: 0xd0f0ff,
    tint1: 0x4a90d0,
    gravity: 900,
    up: 140,
    r: size * 0.2,
  });
  motes(fx, 'fxA', x, y, broke ? 8 : 4, {
    tex: VT.hex,
    r: size * 0.45,
    size: [14, 26],
    life: [0.3, 0.5],
    tint: 0x9fd8ff,
    grow: 1.5,
    fadeIn: 0.05,
  });
}

// ───────────── 적 → 플레이어 (1인칭, 화면 공간) ─────────────

/** 플레이어 피격 지점 (전투 영역 아래 중앙) */
export function playerZone(r: Box): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h * 0.7 };
}

/** 할퀸 자국 하나 — 왼쪽 끝 기준으로 그어진다 */
function rake(fx: Vfx, x0: number, y0: number, ang: number, len: number, thick: number, delay: number, life: number) {
  const full = len / 256;
  const draw = 0.075 / life;
  const mkFn = (thickMul: number) => (p: Particle, t: number) => {
    const k = Math.min(1, t / draw);
    p.sx = full * (1 - (1 - k) ** 2);
    p.sy = (thick * thickMul) / 48;
  };
  fx.emit('scB', VT.clawGlow(), x0, y0, { life, delay, rot: ang, anchorX: 0, tint: 0xff2a14, alpha: 0.95, fadeIn: 0.01, fadeOut: 0.45, force: true, fn: mkFn(1.5) });
  fx.emit('scN', VT.clawCore(), x0, y0, { life, delay, rot: ang, anchorX: 0, tint: 0x1c0204, alpha: 0.94, fadeIn: 0.01, fadeOut: 0.55, force: true, fn: mkFn(1) });
  fx.emit('scA', VT.clawCore(), x0, y0, {
    life: life * 0.4,
    delay,
    rot: ang,
    anchorX: 0,
    tint: 0xffc8b0,
    alpha: 1,
    fadeIn: 0.01,
    fadeOut: 0.2,
    force: true,
    fn: mkFn(0.35),
  });
}

/** 참격: 화면을 가로지르는 세 줄 할퀸 자국 */
export function playerSlash(fx: Vfx, r: Box, power: number, fromX: number) {
  const z = playerZone(r);
  // 공격한 적이 왼쪽이면 왼쪽 위 → 오른쪽 아래로, 오른쪽이면 반대로 긁는다
  const side = fromX < z.x - 10 ? 1 : fromX > z.x + 10 ? -1 : Math.random() < 0.5 ? 1 : -1;
  const tilt = rand(0.38, 0.62);
  const ang = side > 0 ? tilt : Math.PI - tilt;
  const len = r.w * rand(0.64, 0.76) * Math.min(1.25, power);
  const thick = 17 * Math.min(1.35, power);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const gap = thick * 1.9;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * gap;
    const cx = z.x + rand(-8, 8) - sa * off;
    const cy = z.y - r.h * 0.05 + ca * off;
    const l = len * (i === 1 ? 1 : 0.86);
    const x0 = cx - (ca * l) / 2;
    const y0 = cy - (sa * l) / 2;
    rake(fx, x0, y0, ang, l, thick * (i === 1 ? 1 : 0.85), i * 0.035, 0.85);
  }
  // 튀는 피
  const dir = ang;
  for (let i = 0; i < 3; i++) {
    sparks(fx, 'scN', z.x + rand(-40, 40), z.y + rand(-20, 20), 4, {
      ang: dir + (side > 0 ? 0.3 : -0.3),
      spread: 1.2,
      speed: [200, 480],
      life: [0.3, 0.55],
      len: [10, 22],
      thick: 1.1,
      tint: 0x6a0608,
      gravity: 1200,
      delay: 0.05 + i * 0.035,
    });
  }
  sparks(fx, 'scA', z.x, z.y, 8, { ang: dir, spread: 2.2, speed: [250, 600], life: [0.12, 0.25], len: [14, 30], thick: 0.7, tint: 0xffb0a0, tint1: 0xff3020, drag: 4, delay: 0.04 });
}

/** 관통: 한가운데 꿰뚫는 섬광 + 방사형 줄기 + 작은 금 */
export function playerPierce(fx: Vfx, r: Box, power: number) {
  const z = playerZone(r);
  const x = z.x + rand(-r.w * 0.08, r.w * 0.08);
  const y = z.y + rand(-r.h * 0.05, r.h * 0.03);
  const k = Math.min(1.3, power);
  glow(fx, 'scN', x, y, 70 * k, 0x200204, 0.6, { alpha: 0.75, fadeIn: 0.01 });
  flare(fx, 'scA', x, y, r.w * 0.75 * k, 0xfff0d8, 0.22, { rot: rand(-0.2, 0.2) });
  ring(fx, 'scA', x, y, 20, r.w * 0.5 * k, 0.3, 0xffb090, { alpha: 0.8 });
  fx.emit('scA', VT.crack(), x, y, { life: 0.5, scale: (r.w * 0.38 * k) / 256, rot: Math.random() * TAU, tint: 0xffe0d0, alpha: 0.7, fadeIn: 0.01, fadeOut: 0.3, force: true });
  sparks(fx, 'scA', x, y, 16, { speed: [650, 1200], life: [0.14, 0.26], len: [40, 90], thick: 0.55, tint: 0xfff2e0, tint1: 0xff5030, drag: 5 });
}

/** 타격: 화면에 금이 가고 먼지가 튄다 */
export function playerBlunt(fx: Vfx, r: Box, power: number) {
  const z = playerZone(r);
  const x = z.x + rand(-r.w * 0.12, r.w * 0.12);
  const y = z.y + rand(-r.h * 0.06, r.h * 0.04);
  const k = Math.min(1.35, power);
  const sc = (r.w * 0.64 * k) / 256;
  const rot = Math.random() * TAU;
  fx.emit('scN', VT.crack(), x + 1.5, y + 1.5, { life: 0.6, scale: sc, rot, tint: 0x000000, alpha: 0.7, fadeIn: 0.01, fadeOut: 0.35, force: true });
  fx.emit('scA', VT.crack(), x, y, { life: 0.6, scale: sc, rot, tint: 0xe8ecff, alpha: 0.85, fadeIn: 0.01, fadeOut: 0.3, force: true });
  flare(fx, 'scA', x, y, r.w * 0.45 * k, 0xfff0e0, 0.14);
  glow(fx, 'scB', x, y, r.w * 0.5 * k, 0xffa060, 0.25, { alpha: 0.4 });
  smoke(fx, 'scN', x, y, 10, { r: 24, speed: [170, 400], vy: [-30, 30], size: [36, 64], grow: 2.2, life: [0.55, 0.9], tint: 0x7a6a58, alpha: 0.5, drag: 3.5 });
  shards(fx, 'scN', x, y, 6, { speed: [260, 560], size: [10, 18], life: [0.45, 0.7], tint: 0x8a7a68, gravity: 1400, up: 150 });
}

/** 화염: 화면 아래에서 불길이 치솟는다 */
export function playerFire(fx: Vfx, r: Box, power: number) {
  const k = Math.min(1.3, power);
  const bottom = r.y + r.h + 6;
  const tex = VT.flameWash();
  for (let i = 0; i < 5; i++) {
    const x = r.x + r.w * (0.04 + i * 0.23) + rand(-12, 12);
    const w = (r.w * 0.72) / 256;
    const h0 = 0.25;
    const h1 = (r.h * 0.42 * k) / 128 / w;
    fx.emit('scA', tex, x, bottom, {
      life: rand(0.55, 0.7),
      delay: Math.abs(i - 2) * 0.03,
      scale: w,
      ratio: h0,
      ratio1: h1,
      ease: E_OUT4,
      anchorY: 1,
      tint: 0xffc060,
      tint1: 0x901800,
      alpha: 0.95,
      fadeIn: 0.05,
      fadeOut: 0.4,
      force: true,
    });
  }
  const texs = VT.flames();
  for (let i = 0; i < 16; i++) {
    if (!fx.room()) break;
    const s = rand(70, 130) / 128;
    fx.emit('scA', pick(texs), r.x + Math.random() * r.w, bottom + rand(0, 20), {
      vy: -rand(220, 460) * k,
      vx: rand(-40, 40),
      drag: 1.6,
      life: rand(0.35, 0.6),
      delay: rand(0, 0.12),
      scale: s * 0.6,
      scale1: s * 1.2,
      ratio1: 1.4,
      anchorY: 0.85,
      rot: rand(-0.25, 0.25),
      tint: 0xffd070,
      tint1: 0xa01404,
      alpha: 0.8,
      fadeOut: 0.35,
    });
  }
  motes(fx, 'scA', r.x + r.w / 2, bottom, 18, {
    rx: r.w * 0.5,
    ry: 10,
    vy: [-420, -180],
    speed: [20, 80],
    size: [6, 12],
    life: [0.6, 1.1],
    tint: 0xffc060,
    tint1: 0xff3010,
    gravity: -100,
    wobble: 12,
    flicker: 0.4,
    grow: 0.4,
  });
}

/** 촉수 하나 (화면 가장자리에서 안쪽으로) */
export function tendril(fx: Vfx, x: number, y: number, ang: number, len: number, thick: number, color: number, life: number, delay = 0, alpha = 0.95) {
  const t = pick(VT.tendrils());
  const full = len / 256;
  const flip = Math.random() < 0.5 ? -1 : 1;
  const ph = Math.random() * 6.28;
  const mk = (mul: number) => (p: Particle, tt: number) => {
    const grow = tt < 0.35 ? 1 - (1 - tt / 0.35) ** 3 : 1 - ((tt - 0.35) / 0.65) * 0.35;
    p.sx = full * grow;
    p.sy = ((thick * mul) / 64) * flip * (1 + 0.12 * Math.sin(tt * 19 + ph));
    // 꿈틀거림
    p.rot = ang + Math.sin(tt * 8 + ph) * 0.13;
  };
  fx.emit('scB', t.glow, x, y, { life, delay, rot: ang, anchorX: 0, tint: color, alpha: alpha * 0.85, fadeIn: 0.08, fadeOut: 0.55, force: true, fn: mk(1.25) });
  fx.emit('scN', t.body, x, y, { life, delay, rot: ang, anchorX: 0, tint: 0x05020a, alpha, fadeIn: 0.08, fadeOut: 0.6, force: true, fn: mk(1) });
}

/** 가장자리에서 뻗어 오는 촉수 여러 개 */
export function edgeTendrils(fx: Vfx, r: Box, n: number, color: number, o: { life?: number; scale?: number; bottom?: boolean } = {}) {
  const life = o.life ?? 0.9;
  const sc = o.scale ?? 1;
  for (let i = 0; i < n; i++) {
    const side = i % (o.bottom ? 4 : 3);
    let x: number;
    let y: number;
    let ang: number;
    if (side === 0) {
      x = r.x - 6;
      y = r.y + r.h * rand(0.15, 0.95);
      ang = rand(-0.5, 0.5);
    } else if (side === 1) {
      x = r.x + r.w + 6;
      y = r.y + r.h * rand(0.15, 0.95);
      ang = Math.PI + rand(-0.5, 0.5);
    } else if (side === 2) {
      x = r.x + r.w * rand(0.1, 0.9);
      y = r.y - 6;
      ang = Math.PI / 2 + rand(-0.5, 0.5);
    } else {
      x = r.x + r.w * rand(0.1, 0.9);
      y = r.y + r.h + 8;
      ang = -Math.PI / 2 + rand(-0.5, 0.5);
    }
    tendril(fx, x, y, ang, r.w * rand(0.32, 0.5) * sc, rand(20, 30) * sc, color, life * rand(0.85, 1.1), rand(0, 0.12));
  }
}

/** 비전/공허: 가장자리 촉수 + 중앙의 마법진/빨려 드는 입자 */
export function playerEldritch(fx: Vfx, r: Box, power: number, kind: 'arcane' | 'void') {
  const z = playerZone(r);
  const col = kind === 'arcane' ? 0xa060ff : 0x30ffc0;
  edgeTendrils(fx, r, kind === 'void' ? 5 : 4, col, { life: 0.85, scale: Math.min(1.25, power) });
  if (kind === 'arcane') {
    fx.emit('scA', VT.rune(), z.x, z.y, { life: 0.6, scale: (r.w * 0.95) / 256, scale1: (r.w * 0.7) / 256, ratio: 0.42, flat: true, spin: 1.6, ease: E_IN, tint: 0xc8a8ff, alpha: 0.75, fadeIn: 0.05, fadeOut: 0.4, force: true });
    flare(fx, 'scA', z.x, z.y, r.w * 0.6, 0xe0d0ff, 0.22, { delay: 0.18 });
    motes(fx, 'scA', z.x, z.y, 12, { tex: () => pick(VT.glyphs()), rx: r.w * 0.45, ry: r.h * 0.2, speed: [30, 90], size: [12, 20], life: [0.4, 0.7], tint: 0xd8c4ff, tint1: 0x7a40ff, spin: 4, grow: 0.6 });
  } else {
    glow(fx, 'scB', z.x, z.y, r.w * 0.8, 0x1fbf94, 0.55, { alpha: 0.7, scale1: (r.w * 0.2) / 128, ease: E_IN });
    glow(fx, 'scN', z.x, z.y, r.w * 0.6, 0x000000, 0.55, { alpha: 0.8, scale1: (r.w * 0.1) / 128, ease: E_IN });
    const tex = VT.streak();
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU;
      const rr = r.w * rand(0.35, 0.6);
      fx.emit('scA', tex, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6, {
        pullX: z.x,
        pullY: z.y,
        pull: rand(2200, 3600),
        vx: -Math.sin(a) * 140,
        vy: Math.cos(a) * 140,
        drag: 1.2,
        life: rand(0.3, 0.45),
        scale: 0.22,
        ratio: 2,
        stretch: 0.0015,
        align: true,
        anchorX: 0.78,
        tint: 0x9affe0,
        fadeIn: 0.15,
        fadeOut: 0.7,
      });
    }
  }
}

/** 고정 피해(플레이어) */
export function playerTrue(fx: Vfx, r: Box, power: number) {
  const z = playerZone(r);
  flare(fx, 'scA', z.x, z.y, r.w * 0.5 * Math.min(1.3, power), 0xffffff, 0.18);
}

// ───────────── 회복 / 강화 / 약화 / 지속 피해 ─────────────

/** 적: 몸을 감아 오르는 초록 나선 */
export function healSpiral(fx: Vfx, x: number, feetY: number, size: number, tint = 0x8affa8) {
  const n = 16;
  const tex = VT.core();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU * 2;
    const h = size * rand(1.0, 1.3);
    const r0 = size * rand(0.38, 0.48);
    fx.emit('fxA', tex, x, feetY, {
      life: rand(0.8, 1.05),
      delay: i * 0.025,
      scale: rand(10, 16) / 64,
      scale1: 0.08,
      tint,
      fadeIn: 0.1,
      fadeOut: 0.6,
      fn: (p, t) => {
        const a = a0 + t * 5.5;
        const r = r0 * (1 - 0.35 * t);
        p.x = x + Math.cos(a) * r;
        p.y = feetY - t * h + Math.sin(a) * r * 0.22;
        p.a *= 0.5 + 0.5 * Math.max(0, Math.sin(a));
      },
    });
  }
  // 빛기둥: 가로 size*0.9, 세로 size*1.5까지 자란다 (ratio = 세로/가로 배율)
  fx.emit('fxA', VT.beam(), x, feetY, { life: 0.75, scale: (size * 0.9) / 64, ratio: 0.08, ratio1: (1.5 * 64) / (256 * 0.9), anchorY: 1, tint: 0x40e080, alpha: 0.45, fadeIn: 0.15, fadeOut: 0.5 });
  glow(fx, 'fxB', x, feetY - size * 0.5, size * 1.4, 0x40e080, 0.6, { alpha: 0.5 });
}

/** 플레이어: 화면 아래에서 피어오르는 초록 빛 */
export function healPlayer(fx: Vfx, r: Box, tint = 0x9affb0, tint1 = 0x30c070) {
  const bottom = r.y + r.h;
  glow(fx, 'scB', r.x + r.w / 2, bottom, r.w * 1.1, tint1, 0.9, { ratio: 0.35, alpha: 0.5, fadeIn: 0.2 });
  motes(fx, 'scA', r.x + r.w / 2, bottom + 6, 20, {
    rx: r.w * 0.45,
    ry: 8,
    vy: [-260, -120],
    size: [8, 15],
    life: [0.9, 1.4],
    tint,
    tint1,
    wobble: 10,
    drag: 0.6,
    grow: 0.4,
    delay: [0, 0.25],
  });
  for (let i = 0; i < 4; i++) flare(fx, 'scA', r.x + r.w * rand(0.2, 0.8), bottom - r.h * rand(0.05, 0.35), rand(30, 50), tint, 0.5, { delay: rand(0.1, 0.4) });
}

/** 강화: 금빛 알갱이 + 솟는 화살 */
export function buffFx(fx: Vfx, x: number, y: number, w: number, h: number, screen: boolean) {
  const L = screen ? 'scA' : 'fxA';
  motes(fx, L, x, y + h * 0.3, screen ? 16 : 12, { rx: w * 0.5, ry: h * 0.25, vy: [-180, -80], size: [7, 13], life: [0.7, 1.1], tint: 0xffe08a, tint1: 0xff9a30, wobble: 6, grow: 0.4 });
  for (let i = 0; i < 3; i++) {
    const s = (screen ? 0.9 : 0.6) * (i === 1 ? 1.1 : 0.85);
    fx.emit(L, VT.chevron(), x + (i - 1) * w * 0.28, y + h * 0.1 - (i === 1 ? 10 : 0), {
      vy: -rand(70, 110),
      life: 0.75,
      delay: i * 0.07,
      scale: s,
      scale1: s * 1.1,
      tint: 0xffd27a,
      alpha: 0.95,
      fadeIn: 0.15,
      fadeOut: 0.55,
      force: true,
    });
  }
  glow(fx, screen ? 'scB' : 'fxB', x, y, Math.max(w, h) * 1.2, 0xffb040, 0.5, { alpha: 0.45 });
}

/** 약화: 흘러내리는 보랏빛 방울 */
export function debuffFx(fx: Vfx, x: number, y: number, w: number, h: number, screen: boolean) {
  const L = screen ? 'scA' : 'fxA';
  motes(fx, L, x, y, screen ? 14 : 10, {
    tex: VT.drop,
    rx: w * 0.5,
    ry: h * 0.3,
    vy: [10, 60],
    size: [8, 13],
    life: [0.6, 0.95],
    gravity: 520,
    drag: 0.5,
    tint: 0xb07aff,
    tint1: 0x40206a,
    alpha: 0.85,
    grow: 0.8,
    delay: [0, 0.2],
  });
  smoke(fx, screen ? 'scN' : 'fxN', x, y, 4, { r: w * 0.3, speed: [10, 40], vy: [-30, -10], size: [30, 50], grow: 1.8, life: [0.7, 1], tint: 0x1a0a28, alpha: 0.5 });
  glow(fx, screen ? 'scB' : 'fxB', x, y, Math.max(w, h) * 1.1, 0x7a3ad0, 0.45, { alpha: 0.4 });
}

/** 출혈: 떨어지는 핏방울 */
export function bleedFx(fx: Vfx, x: number, y: number, w: number, h: number, screen: boolean, n = 9) {
  motes(fx, screen ? 'scN' : 'fxN', x, y, n, {
    tex: VT.drop,
    rx: w * 0.5,
    ry: h * 0.35,
    vy: [-40, 40],
    speed: [10, 60],
    size: [8, 13],
    life: [0.5, 0.8],
    gravity: 1100,
    drag: 0.4,
    tint: 0xa00c0c,
    tint1: 0x500000,
    alpha: 0.95,
    grow: 0.85,
  });
  motes(fx, screen ? 'scA' : 'fxA', x, y, 5, { rx: w * 0.4, ry: h * 0.3, speed: [40, 120], size: [6, 10], life: [0.25, 0.45], tint: 0xff3020, gravity: 600 });
}

/** 독: 떠오르다 터지는 거품 */
export function poisonFx(fx: Vfx, x: number, y: number, w: number, h: number, screen: boolean, n = 10) {
  const L = screen ? 'scA' : 'fxA';
  for (let i = 0; i < n; i++) {
    if (!fx.room()) break;
    const s = rand(12, 22) / 32;
    fx.emit(L, VT.bubble(), x + rand(-w, w) * 0.5, y + rand(-h, h) * 0.35, {
      vy: -rand(50, 120),
      drag: 0.8,
      life: rand(0.55, 0.9),
      delay: rand(0, 0.25),
      scale: s * 0.6,
      scale1: s,
      tint: 0x9af070,
      alpha: 0.9,
      wobble: 6,
      fadeIn: 0.15,
      fadeOut: 0.85,
      fn: (p, t) => {
        if (t > 0.85) {
          const q = (t - 0.85) / 0.15;
          p.sx *= 1 + q * 0.8;
          p.sy = p.sx;
        }
      },
    });
  }
  smoke(fx, screen ? 'scN' : 'fxN', x, y, 4, { r: w * 0.3, speed: [10, 40], vy: [-40, -10], size: [30, 56], grow: 1.8, life: [0.7, 1.1], tint: 0x2a4a14, alpha: 0.45 });
  glow(fx, screen ? 'scB' : 'fxB', x, y, Math.max(w, h), 0x5ac030, 0.5, { alpha: 0.35 });
}

/** 화상: 불티와 작은 불꽃 */
export function burnFx(fx: Vfx, x: number, y: number, w: number, h: number, screen: boolean, n = 14) {
  const L = screen ? 'scA' : 'fxA';
  const texs = VT.flames();
  for (let i = 0; i < 6; i++) {
    const s = (rand(0.35, 0.6) * Math.max(Math.min(w, 140), 60)) / 128;
    fx.emit(L, pick(texs), x + rand(-w, w) * 0.35, y + rand(-h, h) * 0.3, {
      vy: -rand(80, 160),
      ay: -150,
      life: rand(0.35, 0.55),
      delay: rand(0, 0.12),
      scale: s * 0.5,
      scale1: s,
      ratio1: 1.3,
      anchorY: 0.85,
      rot: rand(-0.3, 0.3),
      tint: 0xffd080,
      tint1: 0x901400,
      alpha: 0.75,
      wobble: 4,
    });
  }
  motes(fx, L, x, y, n, { rx: w * 0.45, ry: h * 0.35, vy: [-200, -80], speed: [20, 80], size: [5, 10], life: [0.6, 1.1], tint: 0xffb040, tint1: 0xff3000, gravity: -150, wobble: 9, flicker: 0.45, grow: 0.4 });
  smoke(fx, screen ? 'scN' : 'fxN', x, y - h * 0.2, 3, { r: w * 0.25, speed: [5, 25], vy: [-80, -40], size: [30, 50], grow: 2, life: [0.8, 1.1], tint: 0x221814, alpha: 0.45, delay: [0.05, 0.15] });
}

// ───────────── 붕괴 / 등장 / 공포 / 촉수 ─────────────

/** 붕괴: 금빛 충격 고리 + 파편 */
export function breakBurst(fx: Vfx, x: number, y: number, size: number) {
  flare(fx, 'fxA', x, y, size * 2.4, 0xfff0b0, 0.3);
  glow(fx, 'fxB', x, y, size * 2.4, 0xffb030, 0.45, { alpha: 0.75 });
  ring(fx, 'fxA', x, y, size * 0.25, size * 3.0, 0.5, 0xffe080, { alpha: 1 });
  ring(fx, 'fxA', x, y, size * 0.2, size * 2.2, 0.42, 0xffc040, { soft: true, alpha: 0.6, delay: 0.04 });
  shards(fx, 'fxA', x, y, 18, { speed: [280, 680], size: [14, 28], life: [0.6, 0.95], tint: 0xffe8a0, tint1: 0xc07010, gravity: 950, up: 160, r: size * 0.2 });
  sparks(fx, 'fxA', x, y, 16, { speed: [350, 800], life: [0.25, 0.5], len: [24, 56], thick: 0.7, tint: 0xfff0c0, tint1: 0xff9a20, gravity: 700, drag: 3 });
}

/** 등장: 발밑의 마법진 + 빛기둥 + 안개 */
export function spawnPortal(fx: Vfx, x: number, feetY: number, size: number, tint: number) {
  fx.emit('under', VT.rune(), x, feetY, {
    life: 1.1,
    scale: 0.02,
    scale1: (size * 1.5) / 256,
    ratio: 0.3,
    flat: true,
    ease: E_BACK,
    spin: 1.4,
    tint,
    alpha: 0.95,
    fadeIn: 0.05,
    fadeOut: 0.55,
    force: true,
    fn: (p, t) => {
      if (t > 0.3) p.sx = p.s1 * (1 + (t - 0.3) * 0.1);
      p.sy = p.sx * 0.3;
    },
  });
  ring(fx, 'under', x, feetY, size * 0.2, size * 1.9, 0.6, tint, { soft: true, ratio: 0.3, alpha: 0.7 });
  fx.emit('fxA', VT.beam(), x, feetY + 4, {
    life: 0.8,
    scale: (size * 1.0) / 64,
    ratio: 0.05,
    ratio1: (1.7 * 64) / 256,
    ease: E_OUT4,
    anchorY: 1,
    tint,
    alpha: 0.55,
    fadeIn: 0.05,
    fadeOut: 0.4,
    force: true,
  });
  smoke(fx, 'fxA', x, feetY - 8, 10, { r: size * 0.25, speed: [40, 110], ang: 0, spread: TAU, vy: [-40, -10], size: [40, 70], grow: 1.8, life: [0.9, 1.4], tint, alpha: 0.18, drag: 1.8 });
  motes(fx, 'fxA', x, feetY - size * 0.2, 12, { rx: size * 0.45, ry: size * 0.15, vy: [-150, -60], size: [6, 11], life: [0.7, 1.2], tint, wobble: 8, grow: 0.4, delay: [0.1, 0.4] });
}

/** 공포: 적에게서 플레이어 쪽으로 밀려오는 뒤틀린 파문 */
export function horrorRipple(fx: Vfx, from: Pt, size: number, to: Pt, width: number) {
  for (let i = 0; i < 4; i++) {
    const col = i % 2 ? 0xa070ff : 0x4fffc4;
    const d0 = size * 0.5;
    const d1 = width * 1.15;
    fx.emit('fxA', VT.ring(), from.x, from.y, {
      life: 0.62,
      delay: i * 0.09,
      scale: d0 / 256,
      tint: col,
      alpha: 0.85,
      fadeIn: 0.1,
      fadeOut: 0.5,
      force: true,
      fn: (p, t) => {
        const e = t * t * (3 - 2 * t);
        p.x = from.x + (to.x - from.x) * e;
        p.y = from.y + (to.y - from.y) * e;
        p.sx = (d0 + (d1 - d0) * t * t) / 256;
        p.sy = p.sx * (0.55 - 0.2 * t);
      },
    });
  }
  glow(fx, 'fxB', from.x, from.y, size * 1.8, 0x30ffc0, 0.5, { alpha: 0.6 });
  motes(fx, 'fxA', from.x, from.y, 12, {
    tex: () => pick(VT.glyphs()),
    r: size * 0.4,
    ang: Math.atan2(to.y - from.y, to.x - from.x),
    spread: 1.2,
    speed: [120, 260],
    size: [12, 20],
    life: [0.5, 0.8],
    tint: 0x8affd8,
    tint1: 0x7a40ff,
    spin: 3,
    grow: 1.4,
    drag: 0.5,
  });
}

/** 촉수 휘둘림: 출발점에서 적까지 휘어지며 뻗었다가 거둬들이는 검은 촉수 (스프라이트 사슬) */
export function tentacleLash(fx: Vfx, a: Pt, b: Pt, color = 0x4fffc4) {
  const N = 28;
  const life = 0.62;
  const side = Math.random() < 0.5 ? -1 : 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // 진행 방향에 수직으로 휘게
  const mx = (a.x + b.x) / 2 + (-dy / len) * side * len * 0.28;
  const my = (a.y + b.y) / 2 + (dx / len) * side * len * 0.28;
  const g = VT.glow();
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const w = 34 * (1 - u * 0.8);
    const fn = (p: Particle, t: number) => {
      const reach = Math.min(1, t / 0.28) * (t > 0.7 ? 1 - ((t - 0.7) / 0.3) * 0.7 : 1);
      if (u > reach) {
        p.a = 0;
        return;
      }
      const v = 1 - u;
      const wob = Math.sin(t * 17 - u * 8) * 9 * u * (1 - u) * 3;
      p.x = v * v * a.x + 2 * v * u * mx + u * u * b.x + (-dy / len) * wob;
      p.y = v * v * a.y + 2 * v * u * my + u * u * b.y + (dx / len) * wob;
    };
    fx.emit('fxB', g, a.x, a.y, { life, scale: (w * 2.1) / 128, tint: color, alpha: 0.42, fadeIn: 0.01, fadeOut: 0.6, force: true, fn });
    fx.emit('fxN', g, a.x, a.y, { life, scale: (w * 1.5) / 128, tint: 0x020605, alpha: 1, fadeIn: 0.01, fadeOut: 0.65, force: true, fn });
  }
  flare(fx, 'fxA', b.x, b.y, 130, color, 0.24, { delay: life * 0.42 });
  sparks(fx, 'fxA', b.x, b.y, 8, { speed: [150, 380], life: [0.15, 0.3], len: [12, 26], thick: 0.6, tint: 0x9affe0, delay: life * 0.42 });
}

/** 마법진만 잠깐 (돌격 준비, 소환, 폭발 등) */
export function runePulse(fx: Vfx, x: number, y: number, px: number, tint: number, ratio = 1, layer: Layer = 'fxA') {
  fx.emit(layer, VT.rune(), x, y, { life: 0.6, scale: (px * 0.7) / 256, scale1: px / 256, ratio, flat: ratio < 1, spin: 1.5, tint, alpha: 0.85, fadeIn: 0.1, fadeOut: 0.45, ease: E_OUT, force: true });
}

/** 에너지 모으기 (돌진 준비) */
export function gather(fx: Vfx, x: number, y: number, size: number, tint: number) {
  const tex = VT.streak();
  for (let i = 0; i < 16; i++) {
    if (!fx.room()) break;
    const a = Math.random() * TAU;
    const r = size * rand(0.9, 1.4);
    fx.emit('fxA', tex, x + Math.cos(a) * r, y + Math.sin(a) * r, {
      pullX: x,
      pullY: y,
      pull: rand(1500, 2400),
      drag: 1,
      life: rand(0.3, 0.45),
      delay: rand(0, 0.15),
      scale: 0.25,
      ratio: 2,
      stretch: 0.0015,
      align: true,
      anchorX: 0.78,
      tint,
      fadeIn: 0.2,
      fadeOut: 0.7,
      fn: (p) => {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < 100) p.a = 0;
      },
    });
  }
  glow(fx, 'fxB', x, y, size * 1.6, tint, 0.5, { alpha: 0.6, fadeIn: 0.6, fadeOut: 0.8 });
}

/** 느슨한 원형 파동 (기존 pulse 대체) */
export function softPulse(fx: Vfx, x: number, y: number, size: number, tint: number) {
  ring(fx, 'fxA', x, y, size * 0.5, size * 1.6, 0.6, tint, { alpha: 0.8, ease: E_OUT });
  glow(fx, 'fxB', x, y, size * 1.4, tint, 0.5, { alpha: 0.45 });
  motes(fx, 'fxA', x, y, 10, { r: size * 0.35, vy: [-90, -30], speed: [20, 60], size: [6, 11], life: [0.5, 0.9], tint, grow: 0.4 });
}

/** 약점 발견: 반짝 빛나는 눈 */
export function revealGlint(fx: Vfx, x: number, y: number, size: number, tint: number) {
  flare(fx, 'fxA', x, y, size * 1.1, tint, 0.45, { fadeOut: 0.5, rot: 0 });
  ring(fx, 'fxA', x, y, size * 0.9, size * 0.2, 0.35, tint, { ease: E_IN, alpha: 0.8 });
}

/** 버팀 회복: 금빛 고리가 조여든다 */
export function recoverFx(fx: Vfx, x: number, y: number, size: number) {
  ring(fx, 'fxA', x, y, size * 1.8, size * 0.6, 0.45, 0xffe080, { ease: E_INOUT, alpha: 0.7 });
  motes(fx, 'fxA', x, y, 8, { r: size * 0.5, vy: [-60, -20], size: [5, 9], life: [0.4, 0.7], tint: 0xffe080, grow: 0.4 });
}

/** 도주: 연기 한 줌 */
export function fleePuff(fx: Vfx, x: number, y: number, size: number) {
  smoke(fx, 'fxN', x, y, 8, { r: size * 0.3, speed: [60, 160], vy: [-60, -10], size: [40, 70], grow: 2, life: [0.6, 1.0], tint: 0x3a3a40, alpha: 0.6 });
}

