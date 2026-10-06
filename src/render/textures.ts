import { Texture } from 'pixi.js';
import ICONS from 'virtual:icons';
import ART from 'virtual:art';

// ───────────── 그림 (AI 생성 일러스트) ─────────────

export const hasArt = (key: string) => ART.enemies.includes(key);
export const hasBg = (key: string) => ART.bg.includes(key);

export function artUrl(kind: 'enemies' | 'bg', key: string): string {
  return `${import.meta.env.BASE_URL}art/${kind}/${encodeURIComponent(key)}.webp`;
}

function loadUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

type Art = { tex: Texture; white: Texture; top: number; cx: number };

/** 적 그림은 화면에서 이보다 크게 그려지지 않는다 (해상도 2배 기준, 수호자 포함) — 메모리를 아끼려고 줄여 둔다 */
const ART_MAX = 640;
/** 지금 쓰이지 않는 적 그림은 최근 것 이만큼만 남긴다 (아이폰 사파리는 그림 메모리가 넉넉지 않다) */
const ART_KEEP = 24;

interface ArtEntry {
  p: Promise<Art>;
  art?: Art;
  /** 이 그림을 쓰는 적 수 (0이어야 지울 수 있다) */
  refs: number;
  used: number;
}
const artCache = new Map<string, ArtEntry>();
let artClock = 0;

/** 캔버스를 그림(ImageBitmap)으로 옮기고 캔버스 메모리는 바로 돌려준다 (iOS는 캔버스 메모리 총량에 제한이 있다) */
async function toBitmapTexture(c: HTMLCanvasElement): Promise<Texture> {
  if (typeof createImageBitmap !== 'function') return Texture.from(c);
  try {
    const bmp = await createImageBitmap(c);
    c.width = c.height = 0;
    return Texture.from(bmp);
  } catch {
    return Texture.from(c);
  }
}

/**
 * 적 그림: 본 텍스처, 흰 실루엣(피격 섬광), 형체 윗단의 높이 비율(0=그림 맨 위, 1=맨 아래 — 의도 표시를 머리 위에 놓는 데 씀),
 * 형체 아랫부분(몸통·발)의 가로 중심 비율 (그림이 한쪽으로 치우쳐 그려져도 발밑 이름표 위에 서게)
 */
export function artTextures(key: string): Promise<Art> {
  const hit = artCache.get(key);
  if (hit) {
    hit.used = ++artClock;
    return hit.p;
  }
  const e: ArtEntry = { refs: 0, used: ++artClock, p: Promise.resolve() as unknown as Promise<Art> };
  e.p = (async () => {
    const img = await loadUrl(artUrl('enemies', key));
    const k = Math.min(1, ART_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, c.width, c.height);
    const w = document.createElement('canvas');
    w.width = c.width;
    w.height = c.height;
    const wg = w.getContext('2d')!;
    wg.drawImage(c, 0, 0);
    wg.globalCompositeOperation = 'source-in';
    wg.fillStyle = '#ffffff';
    wg.fillRect(0, 0, w.width, w.height);
    // 형체의 윗단: 작게 줄인 사본에서 불투명한 첫 줄을 찾는다
    const N = 96;
    const s = document.createElement('canvas');
    s.width = N;
    s.height = N;
    const sg = s.getContext('2d', { willReadFrequently: true })!;
    sg.drawImage(c, 0, 0, N, N);
    const px = sg.getImageData(0, 0, N, N).data;
    s.width = s.height = 0;
    let top = 0;
    find: for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4 + 3] > 90) {
      top = y / N;
      break find;
    }
    // 아랫부분(무기·팔이 뻗은 윗부분은 빼고)의 불투명한 점들의 가로 평균
    let sum = 0;
    let cnt = 0;
    for (let y = Math.floor(N * (top + (1 - top) * 0.45)); y < N; y++)
      for (let x = 0; x < N; x++)
        if (px[(y * N + x) * 4 + 3] > 90) {
          sum += x + 0.5;
          cnt++;
        }
    const cx = cnt ? Math.max(0.35, Math.min(0.65, sum / cnt / N)) : 0.5;
    const [tex, white] = await Promise.all([toBitmapTexture(c), toBitmapTexture(w)]);
    e.art = { tex, white, top, cx };
    evictArt();
    return e.art;
  })();
  // 못 불러왔으면 다음에 다시 시도하게 지운다
  e.p.catch(() => {
    if (artCache.get(key) === e) artCache.delete(key);
  });
  artCache.set(key, e);
  return e.p;
}

/** 적이 이 그림을 쓰는 동안 캐시에서 지워지지 않게 붙잡는다 (artTextures로 먼저 불러야 한다) */
export function holdArt(key: string) {
  const e = artCache.get(key);
  if (!e) return;
  e.refs++;
  e.used = ++artClock;
}

/** 다 쓴 그림을 놓는다. 쓰이지 않는 그림이 많으면 오래된 것부터 지운다 */
export function dropArt(key: string) {
  const e = artCache.get(key);
  if (e) e.refs = Math.max(0, e.refs - 1);
  evictArt();
}

function evictArt() {
  if (artCache.size <= ART_KEEP) return;
  const idle = [...artCache.entries()].filter(([, e]) => e.refs === 0 && e.art).sort((a, b) => a[1].used - b[1].used);
  for (const [k, e] of idle) {
    if (artCache.size <= ART_KEEP) break;
    artCache.delete(k);
    for (const t of [e.art!.tex, e.art!.white]) {
      const res = (t.source as { resource?: unknown }).resource as { close?: () => void } | undefined;
      t.destroy(true);
      res?.close?.();
    }
  }
}

/** 지금 캐시에 있는 적 그림 수 (점검용) */
export function artCacheSize() {
  return artCache.size;
}

const bgCache = new Map<string, Promise<Texture>>();
export function bgTexture(key: string): Promise<Texture> {
  let p = bgCache.get(key);
  if (!p) {
    p = loadUrl(artUrl('bg', key)).then((img) => Texture.from(img));
    bgCache.set(key, p);
  }
  return p;
}

const cache = new Map<string, Promise<Texture>>();

function svgFor(name: string, size: number, color = '#ffffff'): string {
  const raw = ICONS[name.replace(/^gi:/, '')] ?? ICONS['help'] ?? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"></svg>';
  return raw.replace(/currentColor/g, color).replace('<svg ', `<svg width="${size}" height="${size}" `);
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function shade(n: number, f: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

export interface IconStyle {
  size: number;
  tint: number;
  glow?: number;
  /** 흰 실루엣 (피격 플래시용) */
  flat?: boolean;
}

/** 너무 어두운 색은 배경에 묻히므로 최소 밝기까지 끌어올린다 */
function lift(tint: number, minLum = 120): number {
  const r = (tint >> 16) & 255;
  const g = (tint >> 8) & 255;
  const b = tint & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum >= minLum) return tint;
  const k = minLum / Math.max(1, lum);
  const add = lum < 8 ? minLum : 0;
  const c = (v: number) => Math.min(255, Math.round(v * k + add));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/** 아이콘을 그라데이션 + 림라이트 + 외곽선 + 글로우가 있는 텍스처로 */
export function iconTexture(name: string, st: IconStyle): Promise<Texture> {
  const key = `${name}|${st.size}|${st.tint}|${st.glow ?? -1}|${st.flat ? 1 : 0}`;
  let p = cache.get(key);
  if (p) return p;
  st = { ...st, tint: lift(st.tint), glow: st.glow === undefined ? undefined : lift(st.glow, 140) };
  p = (async () => {
    const size = Math.round(st.size);
    const pad = Math.round(size * 0.22);
    const img = await loadImage(svgFor(name, size));
    // 1) 그라데이션으로 칠한 실루엣
    const fillC = document.createElement('canvas');
    fillC.width = fillC.height = size;
    const f = fillC.getContext('2d')!;
    f.drawImage(img, 0, 0, size, size);
    f.globalCompositeOperation = 'source-in';
    if (st.flat) {
      f.fillStyle = '#ffffff';
    } else {
      const grad = f.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, shade(st.tint, 1.55));
      grad.addColorStop(0.45, shade(st.tint, 1.0));
      grad.addColorStop(1, shade(st.tint, 0.55));
      f.fillStyle = grad;
    }
    f.fillRect(0, 0, size, size);
    // 림라이트 (위쪽 가장자리 밝게)
    if (!st.flat && st.glow !== undefined) {
      f.globalCompositeOperation = 'source-atop';
      const rim = f.createLinearGradient(0, 0, 0, size * 0.5);
      rim.addColorStop(0, hex(st.glow) + '55');
      rim.addColorStop(1, hex(st.glow) + '00');
      f.fillStyle = rim;
      f.fillRect(0, 0, size, size);
    }

    const out = document.createElement('canvas');
    out.width = out.height = size + pad * 2;
    const o = out.getContext('2d')!;
    if (st.glow !== undefined && !st.flat) {
      // 외곽선용 단색 실루엣
      const rimC = document.createElement('canvas');
      rimC.width = rimC.height = size;
      const rc = rimC.getContext('2d')!;
      rc.drawImage(img, 0, 0, size, size);
      rc.globalCompositeOperation = 'source-in';
      rc.fillStyle = hex(st.glow);
      rc.fillRect(0, 0, size, size);
      o.shadowColor = hex(st.glow);
      o.shadowBlur = size * 0.14;
      o.globalAlpha = 0.9;
      o.drawImage(rimC, pad, pad);
      o.shadowBlur = size * 0.05;
      o.drawImage(rimC, pad, pad);
      o.shadowBlur = 0;
      // 얇은 외곽선 (8방향으로 살짝 밀어 그리기)
      const w = Math.max(1.5, size * 0.008);
      o.globalAlpha = 0.75;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        o.drawImage(rimC, pad + Math.cos(a) * w, pad + Math.sin(a) * w);
      }
      o.globalAlpha = 1;
    }
    o.drawImage(fillC, pad, pad);
    return Texture.from(out);
  })();
  cache.set(key, p);
  return p;
}

let soft: Texture | null = null;
/** 부드러운 원 (파티클/광원) */
export function softCircle(): Texture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  soft = Texture.from(c);
  return soft;
}

let dot: Texture | null = null;
/** 작은 단단한 점 */
export function hardDot(): Texture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(8, 8, 7, 0, Math.PI * 2);
  g.fill();
  dot = Texture.from(c);
  return dot;
}

const fogCache = new Map<number, Texture>();
/** 타일링 가능한 안개 */
export function fogTexture(seed = 1): Texture {
  const hit = fogCache.get(seed);
  if (hit) return hit;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let s = seed * 9973;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = H * 0.2 + rnd() * H * 0.7;
    const r = 30 + rnd() * 90;
    for (const dx of [-W, 0, W]) {
      const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.05 + rnd() * 0.06})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  const t = Texture.from(c);
  fogCache.set(seed, t);
  return t;
}

let vig: Texture | null = null;
export function vignetteTexture(): Texture {
  if (vig) return vig;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(256, 230, 120, 256, 256, 380);
  r.addColorStop(0, 'rgba(0,0,0,0)');
  r.addColorStop(0.7, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0.95)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  vig = Texture.from(c);
  return vig;
}

/** 위→아래 그라데이션 하늘 */
export function gradientTexture(top: string, mid: string, bottom: string): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return Texture.from(c);
}
