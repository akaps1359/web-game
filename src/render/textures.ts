import { Texture } from 'pixi.js';
import ICONS from 'virtual:icons';
import ART from 'virtual:art';

// ───────────── 그림 (AI 생성 일러스트) ─────────────

export const hasArt = (key: string) => ART.enemies.includes(key);
export const hasBg = (key: string) => ART.bg.includes(key);

function artUrl(kind: 'enemies' | 'bg', key: string): string {
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

const artCache = new Map<string, Promise<{ tex: Texture; white: Texture; top: number }>>();

/** 몬스터 그림 + 피격 플래시용 흰 실루엣 */
/** 적 그림: 본 텍스처, 흰 실루엣, 형체 윗단의 높이 비율(0=그림 맨 위, 1=맨 아래 — 의도 표시를 머리 위에 놓는 데 씀) */
export function artTextures(key: string): Promise<{ tex: Texture; white: Texture; top: number }> {
  let p = artCache.get(key);
  if (p) return p;
  p = (async () => {
    const img = await loadUrl(artUrl('enemies', key));
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const w = document.createElement('canvas');
    w.width = c.width;
    w.height = c.height;
    const wg = w.getContext('2d')!;
    wg.drawImage(img, 0, 0);
    wg.globalCompositeOperation = 'source-in';
    wg.fillStyle = '#ffffff';
    wg.fillRect(0, 0, w.width, w.height);
    // 형체의 윗단: 작게 줄인 사본에서 불투명한 첫 줄을 찾는다
    const N = 96;
    const s = document.createElement('canvas');
    s.width = N;
    s.height = N;
    const sg = s.getContext('2d', { willReadFrequently: true })!;
    sg.drawImage(img, 0, 0, N, N);
    const px = sg.getImageData(0, 0, N, N).data;
    let top = 0;
    find: for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4 + 3] > 90) {
      top = y / N;
      break find;
    }
    return { tex: Texture.from(c), white: Texture.from(w), top };
  })();
  artCache.set(key, p);
  return p;
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
