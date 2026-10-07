import { CanvasSource, Texture } from 'pixi.js';
import { E_OUT, E_OUT4, lerpColor, rand, type Vfx } from './vfx';
import { flare, glow, ring, shards, sparks } from './vfxRecipes';

/**
 * 틈 (content/gap.ts) 연출: 적 몸에 계열 색의 균열이 짧게 번쩍이고(열기), 거두면 그 균열이 깨져 흩어진다.
 * 이름 띠·컷인 없이 0.3~0.5초. 좌표는 화면(CSS px), size = 적의 크기.
 */

/** 결정적 난수 (텍스처마다 같은 모양) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Crack {
  main: { x: number; y: number }[];
  branches: { x: number; y: number }[][];
}

const W = 64;
const H = 256;

/** 세로로 갈라진 균열 한 줄기 (지그재그 + 잔가지) */
function crackPath(seed: number): Crack {
  const r = rng(seed);
  const main: { x: number; y: number }[] = [];
  let y = 10;
  let x = W / 2 + (r() - 0.5) * 6;
  main.push({ x, y });
  while (y < H - 10) {
    y = Math.min(H - 10, y + 12 + r() * 16);
    x = W / 2 + (r() - 0.5) * 22;
    main.push({ x, y });
  }
  const branches: { x: number; y: number }[][] = [];
  for (let i = 2; i < main.length - 2; i++) {
    if (r() > 0.55) continue;
    const side = r() < 0.5 ? -1 : 1;
    let bx = main[i].x;
    let by = main[i].y;
    const pts = [{ x: bx, y: by }];
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      bx += side * (5 + r() * 7);
      by += (r() - 0.25) * 14;
      pts.push({ x: Math.max(3, Math.min(W - 3, bx)), y: by });
    }
    branches.push(pts);
  }
  return { main, branches };
}

/** 가운데가 굵고 끝이 가는 선으로 균열을 긋는다 */
function strokeCrack(g: CanvasRenderingContext2D, cr: Crack, thick: number) {
  const m = cr.main;
  for (let i = 0; i < m.length - 1; i++) {
    const t = (i + 0.5) / (m.length - 1);
    g.lineWidth = Math.max(0.8, thick * Math.sin(Math.PI * t));
    g.beginPath();
    g.moveTo(m[i].x, m[i].y);
    g.lineTo(m[i + 1].x, m[i + 1].y);
    g.stroke();
  }
  for (const b of cr.branches) {
    for (let i = 0; i < b.length - 1; i++) {
      g.lineWidth = Math.max(0.6, thick * 0.38 * (1 - i / b.length));
      g.beginPath();
      g.moveTo(b[i].x, b[i].y);
      g.lineTo(b[i + 1].x, b[i + 1].y);
      g.stroke();
    }
  }
}

function crackTex(seed: number, halo: boolean): Texture {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const cr = crackPath(seed);
  if (halo) {
    // 번지는 빛: 굵게 여러 번 흐리게
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.globalAlpha = 0.45;
    strokeCrack(g, cr, 9);
    g.globalAlpha = 0.6;
    strokeCrack(g, cr, 4);
  } else {
    g.shadowColor = '#fff';
    g.shadowBlur = 2;
    strokeCrack(g, cr, 4.2);
  }
  return new Texture({ source: new CanvasSource({ resource: c, autoGenerateMipmaps: true }) });
}

const cache = new Map<string, Texture>();
/** 균열 텍스처 (모양 둘 × 선/빛) */
function crack(v: number, halo = false): Texture {
  const k = `${v}${halo ? 'h' : ''}`;
  let t = cache.get(k);
  if (!t) {
    t = crackTex(v === 0 ? 4177 : 9311, halo);
    cache.set(k, t);
  }
  return t;
}

/** 균열 줄기를 따라 놓인 점 (축 방향 단위 벡터 dx, dy) */
function along(x: number, y: number, rot: number, len: number, t: number) {
  return { x: x - Math.sin(rot) * len * t, y: y + Math.cos(rot) * len * t };
}

/**
 * 틈이 열렸다: 몸에 계열 색 균열이 위아래로 찢어지듯 번쩍 (0.4초). 큰 틈(붕괴)은 더 크게, 엇갈린 균열 하나 더
 */
export function gapOpenFx(fx: Vfx, x: number, y: number, size: number, tint: number, big: boolean) {
  const k = big ? 1.35 : 1;
  const len = size * 0.92 * k;
  const sc = len / H;
  const rot = rand(-0.42, 0.42);
  const v = Math.random() < 0.5 ? 0 : 1;
  const hot = lerpColor(tint, 0xffffff, 0.6);
  const life = big ? 0.5 : 0.4;
  // 갈라진 속의 어둠 → 계열 색 빛 → 하얗게 달아오른 심
  fx.emit('fxN', crack(v), x + 1.5, y + 1.5, { life, scale: sc * 1.25, ratio: 0.2 / 1.25, ratio1: 1 / 1.25, ease: E_OUT4, rot, tint: 0x000000, alpha: 0.6, fadeIn: 0.02, fadeOut: 0.5, force: true });
  fx.emit('fxB', crack(v, true), x, y, { life: life * 1.1, scale: sc * 1.5, ratio: 0.2 / 1.5, ratio1: 1 / 1.5, ease: E_OUT4, rot, tint, alpha: 0.95, fadeIn: 0.02, fadeOut: 0.45, force: true });
  fx.emit('fxA', crack(v), x, y, { life, scale: sc * 1.15, ratio: 0.2 / 1.15, ratio1: 1 / 1.15, ease: E_OUT4, rot, tint, alpha: 1, fadeIn: 0.02, fadeOut: 0.5, force: true });
  fx.emit('fxA', crack(v), x, y, { life: life * 0.6, scale: sc * 0.7, ratio: 0.2 / 0.7, ratio1: 1 / 0.7, ease: E_OUT4, rot, tint: hot, tint1: tint, alpha: 1, fadeIn: 0.02, fadeOut: 0.35, force: true });
  glow(fx, 'fxB', x, y, size * 1.3 * k, tint, life * 0.8, { alpha: big ? 0.55 : 0.4 });
  // 갈라진 자리에서 옆으로 튀는 빛
  const n = big ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const p = along(x, y, rot, len, rand(-0.42, 0.42));
    sparks(fx, 'fxA', p.x, p.y, 1, { ang: rot + (Math.random() < 0.5 ? 0 : Math.PI), spread: 0.9, speed: [180, 420], life: [0.16, 0.3], len: [10, 24], thick: 0.55, tint: hot, tint1: tint, drag: 4, delay: rand(0, 0.06) });
  }
  if (big) {
    // 엇갈린 균열과 충격 고리
    const r2 = rot + (Math.random() < 0.5 ? -1 : 1) * rand(0.9, 1.25);
    fx.emit('fxA', crack(1 - v), x, y, { life: life * 0.9, delay: 0.05, scale: sc * 0.8, ratio: 0.2 / 0.8, ratio1: 0.75 / 0.8, ease: E_OUT4, rot: r2, tint, alpha: 0.95, fadeIn: 0.02, fadeOut: 0.5, force: true });
    flare(fx, 'fxA', x, y, size * 1.6, hot, 0.22);
    ring(fx, 'fxA', x, y, size * 0.3, size * 2.2, 0.42, tint, { alpha: 0.75, soft: true });
  }
}

/**
 * 틈을 거뒀다: 균열이 마지막으로 번쩍한 뒤 조각나 흩어지고, 거둔 계열의 빛이 터진다 (0.35초)
 * from: 틈의 색, to: 거둔 계열의 색
 */
export function gapHarvestFx(fx: Vfx, x: number, y: number, size: number, from: number, to: number, big: boolean) {
  const k = big ? 1.3 : 1;
  const len = size * 0.92 * k;
  const sc = len / H;
  const rot = rand(-0.42, 0.42);
  const v = Math.random() < 0.5 ? 0 : 1;
  const hot = lerpColor(from, 0xffffff, 0.55);
  // 균열이 벌어지며 사라진다 (가로로 퍼지고 세로는 그대로)
  fx.emit('fxB', crack(v, true), x, y, { life: 0.22, scale: sc * 1.4, scale1: sc * 2.6, ratio: 1 / 1.4, ratio1: 1 / 2.6, ease: E_OUT, rot, tint: from, alpha: 1, fadeIn: 0.01, fadeOut: 0.2, force: true });
  fx.emit('fxA', crack(v), x, y, { life: 0.16, scale: sc * 1.1, scale1: sc * 1.9, ratio: 1 / 1.1, ratio1: 1 / 1.9, ease: E_OUT, rot, tint: hot, tint1: from, alpha: 1, fadeIn: 0.01, fadeOut: 0.25, force: true });
  // 조각: 균열을 따라 깨져 튄다
  const n = big ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const p = along(x, y, rot, len, rand(-0.4, 0.4));
    shards(fx, 'fxA', p.x, p.y, 2, { ang: rot + (i % 2 ? 0 : Math.PI), spread: 1.6, speed: [180, 460], size: [9, 18], life: [0.35, 0.6], tint: hot, tint1: from, gravity: 900, up: 120, delay: 0.04 });
  }
  // 거둔 계열의 빛
  glow(fx, 'fxB', x, y, size * 1.5 * k, to, 0.32, { alpha: 0.55, delay: 0.05 });
  ring(fx, 'fxA', x, y, size * 0.25, size * 1.7 * k, 0.32, to, { alpha: 0.85, delay: 0.05 });
  sparks(fx, 'fxA', x, y, big ? 14 : 8, { speed: [260, 620], life: [0.18, 0.34], len: [14, 34], thick: 0.6, tint: lerpColor(to, 0xffffff, 0.5), tint1: to, drag: 4, delay: 0.05 });
  if (big) flare(fx, 'fxA', x, y, size * 1.4, lerpColor(to, 0xffffff, 0.5), 0.2, { delay: 0.05 });
}
