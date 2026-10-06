import { E_IN, E_LIN, E_OUT, pick, rand, type Vfx } from './vfx';
import { CRESCENT_R, VT } from './vfxTextures';
import { edgeTendrils, flare, glow, motes, ring, shards, smoke, sparks, type Box, type Pt } from './vfxRecipes';

/**
 * 큰 기술(희귀·금기·행동력 2 이상)의 시전 연출 — 컷인 없이, 맞기 전에 화면 안에서 기술 자체가 터진다.
 * 계열마다 한 가지 모습: 금기 = 공허가 열린다, 비술 = 마법진과 빛기둥, 검술 = 화면을 가르는 일섬,
 * 사격 = 조준선과 조준경, 연금 = 날아가 깨지는 플라스크, 결의 = 땅을 타고 가는 충격파, 정수 = 짐승의 발톱.
 * 돌려주는 값: 맞기까지 기다릴 시간(ms). 맞는 순간의 이펙트는 속성별 피격 연출(vfxRecipes)이 이어받는다.
 */

const TAU = Math.PI * 2;

/** 시전 대상 (몸 중심 · 크기 · 발밑) */
export interface CastTarget {
  x: number;
  y: number;
  size: number;
  feet: number;
}

export interface CastCtx {
  school: string;
  /** 기술의 피해 속성 (없으면 피해 없는 기술) */
  dtype?: string;
  /** 2 = 희귀·행동력 2 이상, 3 = 금기 */
  weight: number;
  /** 전투 영역 */
  r: Box;
  /** 1인칭 눈높이 (공격이 출발하는 곳) */
  eye: Pt;
  muzzle: Pt;
  /** 맞을 적들 (단일 대상이면 하나, 없으면 빈 배열) */
  targets: CastTarget[];
}

/** 여럿이면 가운데 */
function focus(ts: CastTarget[]): CastTarget | null {
  if (!ts.length) return null;
  if (ts.length === 1) return ts[0];
  const n = ts.length;
  const x = ts.reduce((s, t) => s + t.x, 0) / n;
  const y = ts.reduce((s, t) => s + t.y, 0) / n;
  const feet = ts.reduce((s, t) => s + t.feet, 0) / n;
  const size = ts.reduce((s, t) => s + t.size, 0) / n;
  return { x, y, feet, size: size * 1.25 };
}

export function castSkill(fx: Vfx, c: CastCtx): number {
  switch (c.school) {
    case 'forbidden':
      return castForbidden(fx, c);
    case 'occult':
      return castOccult(fx, c);
    case 'blade':
      return castBlade(fx, c);
    case 'firearm':
      return castFirearm(fx, c);
    case 'alchemy':
      return castAlchemy(fx, c);
    case 'resolve':
      return castResolve(fx, c);
    case 'essence':
      return castEssence(fx, c);
    default:
      return castPlain(fx, c);
  }
}

// ───────────── 금기: 공허가 열린다 ─────────────

/** 화면 가장자리에서 청록 촉수가 기어 들고, 대상 앞에 검은 특이점이 부풀며 빛을 빨아들인다 */
function castForbidden(fx: Vfx, c: CastCtx): number {
  const lead = 0.42;
  edgeTendrils(fx, c.r, c.weight >= 3 ? 6 : 4, 0x30ffc0, { life: 0.95, scale: 1.1, bottom: true });
  // 아래에서 떠오르는 공허의 티끌
  motes(fx, 'scA', c.r.x + c.r.w / 2, c.r.y + c.r.h, 14, {
    rx: c.r.w * 0.5,
    ry: 10,
    vy: [-260, -120],
    size: [6, 12],
    life: [0.5, 0.9],
    tint: 0x9affe0,
    tint1: 0x1fbf94,
    flicker: 0.4,
    fadeIn: 0.2,
  });
  const t = focus(c.targets);
  if (!t) return 300;
  const R = t.size * 1.15;
  // 검은 특이점: 부풀었다가 맞는 순간까지 버틴다
  const hole = (layer: 'fxB' | 'fxN', tint: number, mult: number, alpha: number) =>
    fx.emit(layer, VT.glow(), t.x, t.y, {
      life: lead + 0.12,
      scale: 0.01,
      tint,
      alpha,
      fadeIn: 0.05,
      fadeOut: 0.85,
      force: true,
      fn: (p, k) => {
        const g = 1 - (1 - Math.min(1, k / 0.75)) ** 3;
        p.sx = (R * mult * Math.max(0.02, g)) / 128;
        p.sy = p.sx;
      },
    });
  hole('fxB', 0x1fdfae, 1.35, 0.55);
  hole('fxN', 0x000000, 1.0, 0.95);
  // 오그라드는 고리 두 겹
  ring(fx, 'fxA', t.x, t.y, t.size * 3.0, t.size * 0.3, lead, 0x4fffc4, { ease: E_IN, alpha: 0.75, fadeIn: 0.1, fadeOut: 0.85 });
  ring(fx, 'fxA', t.x, t.y, t.size * 2.2, t.size * 0.2, lead * 0.8, 0xc8fff0, { ease: E_IN, alpha: 0.45, delay: 0.1, fadeIn: 0.1, fadeOut: 0.85 });
  // 빨려 드는 빛줄기 (나선)
  const tex = VT.streak();
  const n = c.weight >= 3 ? 26 : 18;
  for (let i = 0; i < n; i++) {
    if (!fx.room()) break;
    const a = Math.random() * TAU;
    const r = t.size * rand(1.3, 2.4);
    const tang = 160 * (i % 2 ? 1 : -1);
    fx.emit('fxA', tex, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, {
      vx: -Math.sin(a) * tang,
      vy: Math.cos(a) * tang,
      pullX: t.x,
      pullY: t.y,
      pull: rand(1800, 2800),
      drag: 1.2,
      life: rand(0.3, lead),
      delay: rand(0, 0.12),
      scale: 0.22,
      ratio: 2,
      stretch: 0.0016,
      align: true,
      anchorX: 0.78,
      tint: 0x9affe0,
      tint1: 0x1fbf94,
      fadeIn: 0.15,
      fadeOut: 0.7,
      fn: (p) => {
        const dx = p.x - t.x;
        const dy = p.y - t.y;
        if (dx * dx + dy * dy < 100) p.a = 0;
      },
    });
  }
  return lead * 1000;
}

// ───────────── 비술: 마법진과 빛기둥 ─────────────

/** 발밑에 마법진이 돌며 문자가 떠오르고, 화면 위에서 보랏빛 기둥이 내리꽂힌다 */
function castOccult(fx: Vfx, c: CastCtx): number {
  const ts = c.targets.length ? c.targets : [];
  const strike = 0.26;
  const glyphs = VT.glyphs();
  const one = (t: CastTarget, big: boolean) => {
    const S = t.size * (big ? 2.1 : 1.7);
    // 바닥 마법진 (눕혀서 돈다)
    fx.emit('under', VT.rune(), t.x, t.feet, { life: 0.85, scale: (S * 0.5) / 256, scale1: S / 256, ratio: 0.32, flat: true, spin: 2.6, ease: E_OUT, tint: 0xb48cff, alpha: 0.95, fadeIn: 0.12, fadeOut: 0.6, force: true });
    fx.emit('under', VT.rune(), t.x, t.feet, { life: 0.7, delay: 0.06, scale: (S * 0.32) / 256, scale1: (S * 0.62) / 256, ratio: 0.32, flat: true, spin: -3.4, ease: E_OUT, tint: 0xe8dcff, alpha: 0.7, fadeIn: 0.12, fadeOut: 0.55, force: true });
    glow(fx, 'under', t.x, t.feet, S * 1.1, 0x8a50ff, 0.7, { ratio: 0.35, alpha: 0.55, fadeIn: 0.2 });
    // 원을 따라 떠오르는 문자
    for (let i = 0; i < (big ? 12 : 8); i++) {
      if (!fx.room()) break;
      const a = (i / (big ? 12 : 8)) * TAU;
      fx.emit('fxA', pick(glyphs), t.x + Math.cos(a) * S * 0.42, t.feet + Math.sin(a) * S * 0.13, {
        vy: rand(-220, -120),
        drag: 1.2,
        life: rand(0.4, 0.6),
        delay: rand(0, 0.12),
        scale: 0.7,
        scale1: 0.35,
        tint: 0xd8c4ff,
        tint1: 0x7a40ff,
        fadeIn: 0.15,
        fadeOut: 0.6,
        force: true,
      });
    }
    // 위에서 내리꽂히는 빛기둥 (빛줄기 텍스처는 아래가 밝다 — 위에서 발밑까지 한 번에 뻗고, 가늘었다가 굵어진다)
    const top = c.r.y - 40;
    const h = Math.max(80, t.feet - top);
    const w = t.size * (big ? 0.7 : 0.55);
    const sx = w / 64;
    const ry = h / 256;
    for (const [layer, wk, tint, alpha, life] of [
      ['fxB', 2.4, 0x8a50ff, 0.75, 0.5],
      ['fxA', 1, 0xd8c4ff, 1, 0.42],
      ['fxA', 0.38, 0xffffff, 1, 0.3],
    ] as const) {
      fx.emit(layer, VT.beam(), t.x, top, {
        life,
        delay: strike,
        scale: sx * wk * 0.35,
        scale1: sx * wk,
        ratio: ry / (sx * wk * 0.35),
        ratio1: ry / (sx * wk),
        anchorY: 0,
        ease: E_OUT,
        tint,
        alpha,
        fadeIn: 0.02,
        fadeOut: 0.4,
        force: true,
      });
    }
    glow(fx, 'fxB', t.x, t.y, t.size * 2.4, 0x9a6cff, 0.45, { delay: strike, alpha: 0.7 });
    flare(fx, 'fxA', t.x, t.feet, S * 0.9, 0xf0e6ff, 0.22, { delay: strike });
    ring(fx, 'under', t.x, t.feet, S * 0.3, S * 1.4, 0.4, 0xc8a8ff, { ratio: 0.32, delay: strike, alpha: 0.9 });
  };
  if (!ts.length) {
    // 대상이 없는 기술: 화면 아래 내 앞에 마법진만
    fx.emit('scB', VT.rune(), c.eye.x, c.r.y + c.r.h * 0.92, { life: 0.8, scale: (c.r.w * 0.35) / 256, scale1: (c.r.w * 0.7) / 256, ratio: 0.3, flat: true, spin: 2.2, ease: E_OUT, tint: 0xb48cff, alpha: 0.8, fadeIn: 0.1, fadeOut: 0.6, force: true });
    return 240;
  }
  const big = c.weight >= 3 || ts.length === 1;
  for (const t of ts.slice(0, 4)) one(t, big);
  return strike * 1000 + 60;
}

// ───────────── 검술: 화면을 가르는 일섬 ─────────────

/** 대상의 가슴 높이로 빛 한 줄이 화면을 가로지르고, 거대한 초승달이 그 길을 따라 벤다 */
function castBlade(fx: Vfx, c: CastCtx): number {
  const t = focus(c.targets);
  const y = t ? t.y : c.r.y + c.r.h * 0.55;
  const x0 = c.r.x - 20;
  const x1 = c.r.x + c.r.w + 20;
  const span = x1 - x0;
  const draw = 0.16;
  // 칼끝의 빛이 왼쪽에서 오른쪽으로 달린다
  fx.emit('fxA', VT.streak(), x0, y, {
    life: draw + 0.06,
    scale: span / 128 / 2.4,
    ratio: 0.32,
    anchorX: 0.78,
    tint: 0xffffff,
    alpha: 1,
    fadeIn: 0.01,
    fadeOut: 0.7,
    force: true,
    fn: (p, k) => {
      const e = Math.min(1, (k * (draw + 0.06)) / draw);
      p.x = x0 + span * (1 - (1 - e) ** 3);
    },
  });
  // 남는 가는 선 (베인 자리)
  // 칼끝의 섬광이 함께 달린다
  fx.emit('fxA', VT.flare(), x0, y, {
    life: draw + 0.04,
    scale: 0.55,
    tint: 0xffffff,
    alpha: 1,
    fadeIn: 0.01,
    fadeOut: 0.8,
    force: true,
    fn: (p, k) => {
      const e = Math.min(1, (k * (draw + 0.04)) / draw);
      p.x = x0 + span * (1 - (1 - e) ** 3);
    },
  });
  fx.emit('fxA', VT.streak(), x0, y, { life: 0.5, delay: draw * 0.6, scale: span / 128, ratio: 0.07, anchorX: 0, tint: 0xf4f8ff, alpha: 1, fadeIn: 0.02, fadeOut: 0.35, force: true });
  glow(fx, 'fxB', c.r.x + c.r.w / 2, y, span, 0xb8c8ff, 0.42, { ratio: 0.09, alpha: 0.75, delay: draw * 0.6 });
  // 대상마다 거대한 초승달 + 쇳불꽃
  const tex = VT.crescent();
  for (const tg of c.targets.slice(0, 4)) {
    const S = tg.size * (c.weight >= 3 ? 2.6 : 2.2);
    const sc = (S * 0.62) / CRESCENT_R;
    const phi = -0.32;
    const r0 = phi - Math.PI / 2;
    const cx = tg.x - S * 0.5 * Math.cos(r0);
    const cy = tg.y - S * 0.5 * Math.sin(r0);
    for (const [layer, lag, alpha, k, col] of [
      ['fxA', 0.24, 0.25, 0.94, 0xb8c8ff],
      ['fxB', 0.04, 0.9, 1.06, 0xd6dce2],
      ['fxA', 0, 1, 1, 0xffffff],
    ] as const) {
      fx.emit(layer, tex, cx, cy, {
        life: 0.3,
        delay: draw,
        scale: sc * k,
        alpha,
        tint: col,
        fadeIn: 0.02,
        fadeOut: 0.35,
        force: true,
        fn: (p, kk) => {
          const e = 1 - (1 - Math.min(1, kk / 0.4)) ** 3;
          p.rot = r0 + 0.9 * (e - 0.55) + 0.2 * kk - lag;
        },
      });
    }
    sparks(fx, 'fxA', tg.x, tg.y, 10, { ang: phi, spread: 1.2, speed: [400, 900], life: [0.12, 0.3], len: [30, 70], thick: 0.6, tint: 0xffffff, tint1: 0xb8c8ff, drag: 5, delay: draw + 0.04 });
  }
  return (draw + 0.08) * 1000;
}

// ───────────── 사격: 조준선과 조준경 ─────────────

/** 총구에서 붉은 조준선이 뻗고, 조준경이 대상 위로 오그라들며 잠근다 */
function castFirearm(fx: Vfx, c: CastCtx): number {
  const lock = 0.3;
  const m = c.muzzle;
  for (const t of c.targets.slice(0, 4)) {
    const ang = Math.atan2(t.y - m.y, t.x - m.x);
    const dist = Math.hypot(t.x - m.x, t.y - m.y);
    // 조준선 (가늘고 붉은 빛, 점점 짙어진다)
    glow(fx, 'fxB', (m.x + t.x) / 2, (m.y + t.y) / 2, dist, 0xff3030, lock + 0.12, { ratio: 4 / dist, rot: ang, alpha: 0.75, fadeIn: 0.35, fadeOut: 0.8 });
    // 오그라드는 조준경 두 겹
    ring(fx, 'fxA', t.x, t.y, t.size * 2.4, t.size * 0.55, lock, 0xff4a3a, { ease: E_OUT, alpha: 0.9, fadeIn: 0.1, fadeOut: 0.9 });
    ring(fx, 'fxA', t.x, t.y, t.size * 1.6, t.size * 0.4, lock, 0xffd0a0, { ease: E_OUT, alpha: 0.5, delay: 0.05, fadeIn: 0.1, fadeOut: 0.9 });
    // 네 방향에서 다가오는 조준 표시
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const r0 = t.size * 1.3;
      const r1 = t.size * 0.42;
      fx.emit('fxA', VT.chevron(), t.x + Math.cos(a) * r0, t.y + Math.sin(a) * r0, {
        life: lock + 0.08,
        scale: 0.42,
        // 갈매기표는 위를 가리킨다 — 가운데를 향하게 돌린다
        rot: a + Math.PI * 1.5,
        tint: 0xff6a4a,
        alpha: 0.95,
        fadeIn: 0.12,
        fadeOut: 0.85,
        force: true,
        fn: (p, k) => {
          const e = 1 - (1 - Math.min(1, (k * (lock + 0.08)) / lock)) ** 3;
          const r = r0 + (r1 - r0) * e;
          p.x = t.x + Math.cos(a) * r;
          p.y = t.y + Math.sin(a) * r;
        },
      });
    }
    // 잠기는 순간의 붉은 점
    flare(fx, 'fxA', t.x, t.y, t.size * 0.5, 0xff5040, 0.12, { delay: lock - 0.04 });
  }
  return lock * 1000;
}

// ───────────── 연금: 날아가 깨지는 플라스크 ─────────────

/** 손에서 던진 플라스크가 포물선을 그리며 날아가 대상 앞에서 깨진다 (화염이면 불, 아니면 독안개) */
function castAlchemy(fx: Vfx, c: CastCtx): number {
  const t = focus(c.targets);
  if (!t) return castPlain(fx, c);
  const fire = c.dtype === 'fire';
  const col = fire ? 0xff8a40 : 0x8ae060;
  const flight = 0.32;
  const sx = c.eye.x + c.r.w * 0.18;
  const sy = c.eye.y - 10;
  const peak = Math.min(sy, t.y) - c.r.h * 0.35;
  const at = (k: number) => {
    const x = sx + (t.x - sx) * k;
    // 2차 베지어 (시작 → 꼭대기 → 대상)
    const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * peak + k * k * t.y;
    return { x, y };
  };
  // 플라스크: 돌며 날아가는 유리병 + 그 안에서 빛나는 약
  fx.emit('fxA', VT.drop(), sx, sy, {
    life: flight,
    scale: 1.3,
    spin: 14,
    tint: 0xe0f6ff,
    alpha: 0.95,
    fadeIn: 0.05,
    fadeOut: 0.95,
    force: true,
    fn: (p, k) => {
      const q = at(k);
      p.x = q.x;
      p.y = q.y;
    },
  });
  for (const [layer, px, tint, alpha] of [
    ['fxB', 84, col, 0.85],
    ['fxA', 30, 0xffffff, 0.9],
  ] as const) {
    fx.emit(layer, VT.glow(), sx, sy, {
      life: flight,
      scale: px / 128,
      tint,
      alpha,
      fadeIn: 0.05,
      fadeOut: 0.95,
      force: true,
      fn: (p, k) => {
        const q = at(k);
        p.x = q.x;
        p.y = q.y;
      },
    });
  }
  // 꼬리 불티
  for (let i = 0; i < 16; i++) {
    const k = i / 16;
    const q = at(k);
    motes(fx, 'fxA', q.x, q.y, 1, { size: [10, 18], life: [0.25, 0.45], delay: [k * flight, k * flight], vy: [-50, 0], tint: col, tint1: fire ? 0xff3010 : 0x2a7a20 });
  }
  // 깨진다
  const d = flight;
  flare(fx, 'fxA', t.x, t.y, t.size * 1.3, 0xffffff, 0.16, { delay: d });
  ring(fx, 'fxA', t.x, t.y, t.size * 0.2, t.size * 1.8, 0.32, col, { delay: d, alpha: 0.85 });
  shards(fx, 'fxA', t.x, t.y, 12, { speed: [220, 520], size: [8, 16], life: [0.3, 0.55], tint: 0xe0f6ff, gravity: 1100, up: 120, delay: d });
  if (fire) glow(fx, 'fxB', t.x, t.y, t.size * 2.4, 0xff6a20, 0.45, { delay: d, alpha: 0.7 });
  else smoke(fx, 'fxN', t.x, t.y, 6, { r: t.size * 0.3, speed: [40, 120], vy: [-40, -10], size: [50, 80], grow: 2.2, life: [0.6, 0.9], tint: 0x5a8a3a, alpha: 0.5, delay: [d, d + 0.05] });
  return flight * 1000 + 20;
}

// ───────────── 결의: 땅을 타고 가는 충격파 ─────────────

/** 공격이면 발밑에서 대상까지 땅이 갈라지며 충격파가 달려가고, 방어면 내 앞에 금빛 방벽이 선다 */
function castResolve(fx: Vfx, c: CastCtx): number {
  const t = focus(c.targets);
  const baseY = c.r.y + c.r.h * 0.98;
  if (!t || !c.dtype) {
    // 버티는 기술: 화면 아래쪽에 육각 방벽이 솟는다
    for (let i = 0; i < 14; i++) {
      if (!fx.room()) break;
      const x = c.r.x + c.r.w * (0.1 + 0.8 * (i / 13));
      motes(fx, 'scA', x, baseY, 1, { tex: VT.hex, size: [18, 30], vy: [-160, -90], life: [0.45, 0.7], tint: 0xffd890, tint1: 0x8fb8d8, grow: 1.4, delay: [Math.abs(i - 6.5) * 0.02, Math.abs(i - 6.5) * 0.02] });
    }
    glow(fx, 'scB', c.eye.x, baseY, c.r.w * 1.1, 0xffc060, 0.5, { ratio: 0.25, alpha: 0.5 });
    return 180;
  }
  const run = 0.26;
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const k = (i + 1) / steps;
    const x = c.eye.x + (t.x - c.eye.x) * k;
    const y = baseY + (t.feet - baseY) * k;
    const sz = t.size * (0.5 + 0.7 * k);
    ring(fx, 'under', x, y, sz * 0.3, sz * 1.1, 0.3, 0xffe0b0, { ratio: 0.3, delay: run * k, alpha: 0.8 });
    smoke(fx, 'fxN', x, y, 2, { speed: [20, 70], vy: [-60, -20], size: [30, 50], grow: 2, life: [0.4, 0.7], tint: 0x7a6e60, alpha: 0.4, delay: [run * k, run * k + 0.03] });
  }
  // 대상 발밑에서 솟는 충격
  ring(fx, 'under', t.x, t.feet, t.size * 0.4, t.size * 2.6, 0.42, 0xfff0d0, { ratio: 0.3, delay: run, alpha: 0.95 });
  shards(fx, 'fxA', t.x, t.feet, 12, { speed: [160, 420], size: [10, 20], life: [0.4, 0.7], tint: 0xb8a890, ang: -Math.PI / 2, spread: 1.6, up: 160, delay: run });
  return run * 1000 + 30;
}

// ───────────── 정수: 짐승의 발톱 ─────────────

/** 몸 안의 짐승이 깨어나 붉은 발톱 세 줄기로 할퀸다 */
function castEssence(fx: Vfx, c: CastCtx): number {
  glow(fx, 'scB', c.eye.x, c.r.y + c.r.h, c.r.w * 1.2, 0xe86a8a, 0.5, { ratio: 0.3, alpha: 0.55 });
  const t = focus(c.targets);
  if (!t) return 200;
  const ang = 0.95;
  const len = t.size * 1.55;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * t.size * 0.3;
    const x0 = t.x - Math.cos(ang) * len * 0.5 + Math.sin(ang) * off;
    const y0 = t.y - Math.sin(ang) * len * 0.5 - Math.cos(ang) * off;
    const delay = 0.05 + i * 0.05;
    const mk = (mul: number) => (p: { sx: number; sy: number }, k: number) => {
      const e = 1 - (1 - Math.min(1, k / 0.35)) ** 3;
      p.sx = (len / 256) * e;
      p.sy = (30 * mul) / 48;
    };
    fx.emit('fxB', VT.clawGlow(), x0, y0, { life: 0.4, delay, rot: ang, anchorX: 0, tint: 0xff3a5a, alpha: 0.95, fadeIn: 0.01, fadeOut: 0.5, force: true, fn: mk(1.6) });
    fx.emit('fxN', VT.clawCore(), x0, y0, { life: 0.5, delay, rot: ang, anchorX: 0, tint: 0x2a0208, alpha: 0.85, fadeIn: 0.01, fadeOut: 0.55, force: true, fn: mk(1) });
    fx.emit('fxA', VT.clawCore(), x0, y0, { life: 0.22, delay, rot: ang, anchorX: 0, tint: 0xffe0e6, alpha: 1, fadeIn: 0.01, fadeOut: 0.4, force: true, fn: mk(0.45) });
  }
  flare(fx, 'fxA', t.x, t.y, t.size * 1.1, 0xffc0cc, 0.18, { delay: 0.12 });
  sparks(fx, 'fxA', t.x, t.y, 12, { ang, spread: 1.4, speed: [260, 640], life: [0.15, 0.32], len: [20, 46], thick: 0.8, tint: 0xffb0c0, tint1: 0xe03050, delay: 0.12 });
  return 220;
}

// ───────────── 그 밖 (공용) ─────────────

function castPlain(fx: Vfx, c: CastCtx): number {
  const t = focus(c.targets);
  if (!t) return 120;
  flare(fx, 'fxA', t.x, t.y, t.size * 0.9, 0xfff0d0, 0.18);
  ring(fx, 'fxA', t.x, t.y, t.size * 1.8, t.size * 0.5, 0.2, 0xfff0d0, { ease: E_IN, alpha: 0.6 });
  return 160;
}

// ───────────── 적의 필살기 ─────────────

/** 적이 필살기를 모은다: 빛이 사방에서 빨려 들고 발밑이 갈라지다가 한 번에 터진다. 돌려주는 값: 터지기까지(ms) */
export function enemyUltimate(fx: Vfx, t: CastTarget, tint: number): number {
  const hold = 0.46;
  const tex = VT.streak();
  for (let i = 0; i < 28; i++) {
    if (!fx.room()) break;
    const a = Math.random() * TAU;
    const r = t.size * rand(1.4, 2.6);
    fx.emit('fxA', tex, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, {
      pullX: t.x,
      pullY: t.y,
      pull: rand(1700, 2600),
      drag: 1,
      life: rand(0.3, hold),
      delay: rand(0, 0.14),
      scale: 0.28,
      ratio: 2,
      stretch: 0.0015,
      align: true,
      anchorX: 0.78,
      tint,
      fadeIn: 0.2,
      fadeOut: 0.7,
      fn: (p) => {
        const dx = p.x - t.x;
        const dy = p.y - t.y;
        if (dx * dx + dy * dy < 140) p.a = 0;
      },
    });
  }
  glow(fx, 'fxB', t.x, t.y, t.size * 2.2, tint, hold + 0.1, { alpha: 0.75, fadeIn: 0.7, fadeOut: 0.9 });
  ring(fx, 'fxA', t.x, t.y, t.size * 3.2, t.size * 0.4, hold, tint, { ease: E_IN, alpha: 0.7, fadeIn: 0.1, fadeOut: 0.9 });
  ring(fx, 'under', t.x, t.feet, t.size * 0.6, t.size * 2.4, hold, tint, { ratio: 0.3, ease: E_LIN, alpha: 0.6, fadeIn: 0.2 });
  // 터진다
  flare(fx, 'fxA', t.x, t.y, t.size * 2.2, 0xffffff, 0.22, { delay: hold });
  ring(fx, 'fxA', t.x, t.y, t.size * 0.5, t.size * 3.4, 0.4, tint, { delay: hold, alpha: 0.85 });
  sparks(fx, 'fxA', t.x, t.y, 16, { speed: [500, 1100], life: [0.2, 0.4], len: [40, 90], thick: 0.8, tint: 0xffffff, tint1: tint, drag: 4, delay: hold });
  return hold * 1000;
}
