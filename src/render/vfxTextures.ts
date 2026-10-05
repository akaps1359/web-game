import { CanvasSource, Texture } from 'pixi.js';

/**
 * 전투 이펙트용 텍스처 — Canvas2D로 한 번만 만들어 캐시한다.
 * 대부분 흰색 + 알파 (스프라이트 tint로 색을 입힌다).
 */

// ───────────── 보조 ─────────────

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const pow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** 밉맵은 2의 거듭제곱 크기에만 (WebGL1에서 NPOT 밉맵은 텍스처가 깨진다) */
function toTex(c: HTMLCanvasElement, mip = true): Texture {
  return new Texture({ source: new CanvasSource({ resource: c, autoGenerateMipmaps: mip && pow2(c.width) && pow2(c.height) }) });
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 결정적 해시 / 값 노이즈 (텍스처마다 같은 모양) */
function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, seed = 0, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, y, seed + i * 17) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return s / norm;
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 픽셀 함수로 흰색 알파 캔버스 생성 (x, y는 픽셀 중심) */
function alphaCanvas(w: number, h: number, fn: (x: number, y: number) => number): HTMLCanvasElement {
  const [c, g] = mk(w, h);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = fn(x + 0.5, y + 0.5);
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function memo<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}

// ───────────── 텍스처 ─────────────

/** 부드러운 광원 (가우시안) */
const glow = memo(() =>
  toTex(
    alphaCanvas(128, 128, (x, y) => {
      const d = Math.hypot(x - 64, y - 64) / 64;
      return Math.exp(-d * d * 4.2) * (1 - sstep(0.78, 1, d));
    }),
  ),
);

/** 작고 단단한 빛 알갱이 (불티, 반짝임) */
const core = memo(() =>
  toTex(
    alphaCanvas(64, 64, (x, y) => {
      const d = Math.hypot(x - 32, y - 32) / 32;
      return Math.min(1, Math.exp(-d * d * 16) + 0.22 * Math.exp(-d * d * 3)) * (1 - sstep(0.85, 1, d));
    }),
  ),
);

/** 십자 섬광 (타격점, 치명타) */
const flare = memo(() =>
  toTex(
    alphaCanvas(256, 256, (x, y) => {
      const dx = (x - 128) / 128;
      const dy = (y - 128) / 128;
      const d = Math.hypot(dx, dy);
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const core = Math.exp(-d * d * 70);
      const halo = 0.38 * Math.exp(-d * d * 9);
      const sx = Math.exp(-((dy / (0.008 + 0.028 * adx)) ** 2)) * Math.max(0, 1 - adx) ** 2.4;
      const sy = 0.75 * Math.exp(-((dx / (0.008 + 0.028 * ady)) ** 2)) * Math.max(0, 1 - ady) ** 2.6;
      const u = (dx + dy) * Math.SQRT1_2;
      const v = (dx - dy) * Math.SQRT1_2;
      const au = Math.abs(u);
      const av = Math.abs(v);
      const sd =
        0.4 *
        (Math.exp(-((v / (0.007 + 0.02 * au)) ** 2)) * Math.max(0, 1 - au * 1.7) ** 2.6 +
          Math.exp(-((u / (0.007 + 0.02 * av)) ** 2)) * Math.max(0, 1 - av * 1.7) ** 2.6);
      return Math.min(1, core + halo + sx + sy + sd) * (1 - sstep(0.94, 1, d));
    }),
  ),
);

/** 길쭉한 불꽃 줄기 — 머리(밝은 쪽)가 x=100/128. 앵커 (0.78, 0.5) */
const streak = memo(() =>
  toTex(
    alphaCanvas(128, 32, (x, y) => {
      const u = x / 128;
      const hx = 100 / 128;
      const along = u < hx ? (u / hx) ** 1.7 : Math.max(0, 1 - (u - hx) / (1 - hx)) ** 1.3;
      const dy = Math.abs(y - 16);
      const th = 0.7 + 3 * along;
      return clamp01(along * (Math.exp(-((dy / th) ** 2)) + 0.32 * Math.exp(-((dy / (th * 2.8)) ** 2))));
    }),
  ),
);

/** 얇은 고리 */
const ring = memo(() =>
  toTex(
    alphaCanvas(256, 256, (x, y) => {
      const d = Math.hypot(x - 128, y - 128) / 128;
      const a = Math.exp(-(((d - 0.885) / 0.026) ** 2)) + 0.3 * Math.exp(-(((d - 0.84) / 0.09) ** 2));
      return clamp01(a) * (1 - sstep(0.965, 1, d));
    }),
  ),
);

/** 두꺼운 부드러운 고리 (충격파, 먼지 고리) */
const ringSoft = memo(() =>
  toTex(
    alphaCanvas(256, 256, (x, y) => {
      const d = Math.hypot(x - 128, y - 128) / 128;
      return Math.exp(-(((d - 0.7) / 0.17) ** 2)) * (1 - sstep(0.94, 1, d));
    }),
  ),
);

/**
 * 초승달 참격 — 원(반지름 CRESCENT_R)의 오른쪽 호 (−62°~+62°).
 * 꼬리(위)는 투명하고 머리(아래)로 갈수록 밝고 두껍다. 바깥 가장자리가 가장 밝다.
 * 스프라이트를 시계 방향으로 돌리면 머리가 아래로 쓸고 내려간다.
 */
export const CRESCENT_R = 100;
const crescent = memo(() => {
  const R = CRESCENT_R;
  const W = 40;
  const th0 = -1.08;
  const th1 = 1.08;
  return toTex(
    alphaCanvas(256, 256, (x, y) => {
      const dx = x - 128;
      const dy = y - 128;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      const u = (th - th0) / (th1 - th0);
      if (u <= 0 || u >= 1) return 0;
      // 두께: 머리 쪽(0.68)에서 가장 두껍고 양 끝은 뾰족하다
      const prof = Math.sin(Math.PI * u ** 1.6) ** 0.7;
      const w = W * prof + 0.8;
      const angA = u ** 1.7;
      const out = r - R;
      if (out > 0) return 0.5 * Math.exp(-((out / 5) ** 2)) * angA * prof;
      const s = -out / w;
      if (s > 1.4) return 0;
      const aa = clamp01(-out + 0.5);
      const body = 0.75 * Math.max(0, 1 - s) ** 1.1;
      const edge = Math.exp(-((out / 2.6) ** 2));
      return clamp01(aa * (angA * body + edge * u ** 0.8 * prof));
    }),
  );
});

/** 할퀸 자국 몸통 — 좌→우로 그어진 가늘고 거친 상처 (256×48) */
function clawShape(x: number, y: number) {
  const u = x / 256;
  const cy = 24 + 18 * (u - 0.5) * (u - 0.5) - 4;
  const hw = 7.5 * Math.sin(Math.PI * u) ** 0.6 * (0.78 + 0.4 * vnoise(u * 22, 3.3, 7));
  return { u, dy: Math.abs(y - cy), hw };
}
const clawCore = memo(() =>
  toTex(
    alphaCanvas(256, 48, (x, y) => {
      const { dy, hw } = clawShape(x, y);
      return clamp01(hw - dy + 0.5);
    }),
  ),
);
const clawGlow = memo(() =>
  toTex(
    alphaCanvas(256, 48, (x, y) => {
      const { u, dy, hw } = clawShape(x, y);
      const g = hw * 1.6 + 3.5;
      return clamp01(Math.exp(-((dy / g) ** 2) * 1.6) * Math.sin(Math.PI * u) ** 0.45);
    }),
  ),
);

/** 유리 파편 3종 */
const shards = memo(() => {
  const shapes: [number, number][][] = [
    [
      [6, 30],
      [58, 18],
      [44, 40],
    ],
    [
      [10, 12],
      [52, 26],
      [36, 52],
      [16, 40],
    ],
    [
      [4, 36],
      [34, 8],
      [60, 30],
      [30, 46],
    ],
  ];
  return shapes.map((pts) => {
    const [c, g] = mk(64, 64);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const grad = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0.7)');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.stroke();
    return toTex(c);
  });
});

/** 연기/먼지 뭉치 2종 (노이즈 섞인 부드러운 덩어리) */
const smokes = memo(() =>
  [11, 29].map((seed) =>
    toTex(
      alphaCanvas(128, 128, (x, y) => {
        const d = Math.hypot(x - 64, y - 64) / 64;
        const n = fbm(x / 20, y / 20, seed, 4);
        const base = Math.exp(-d * d * 3.4);
        return clamp01(base * (0.35 + 1.25 * (n - 0.25))) * 0.9 * (1 - sstep(0.8, 1, d));
      }),
    ),
  ),
);

/** 마법진 */
const rune = memo(() => {
  const [c, g] = mk(256, 256);
  const r = rng(77);
  g.translate(128, 128);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 5;
  g.lineCap = 'round';
  const circle = (rad: number, lw: number) => {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.stroke();
  };
  circle(118, 2.6);
  circle(100, 1.6);
  // 고리 사이의 문자 띠
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(109, 0);
    g.lineWidth = 1.7;
    g.beginPath();
    const k = 2 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const x0 = (r() - 0.5) * 9;
      const y0 = (r() - 0.5) * 10;
      g.moveTo(x0, y0);
      if (r() < 0.35) g.arc(x0, y0, 2 + r() * 2.5, 0, Math.PI * (1 + r()));
      else g.lineTo(x0 + (r() - 0.5) * 10, y0 + (r() - 0.5) * 10);
    }
    g.stroke();
    g.restore();
  }
  // 칠각성
  g.lineWidth = 1.8;
  g.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = ((i * 3) / 7) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 98;
    const y = Math.sin(a) * 98;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  circle(54, 2);
  circle(22, 1.6);
  // 눈금
  g.lineWidth = 1.4;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r0 = i % 3 === 0 ? 54 : 58;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * 64, Math.sin(a) * 64);
    g.stroke();
  }
  return toTex(c);
});

/** 육각형 테두리 */
const hex = memo(() => {
  const [c, g] = mk(64, 64);
  g.translate(32, 32);
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 6;
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 22;
    const y = Math.sin(a) * 22;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  return toTex(c);
});

/** 육각 격자까지의 거리 (뾰족한 꼭짓점이 위) */
function hexEdgeDist(x: number, y: number, s: number): number {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / s;
  const r = ((2 / 3) * y) / s;
  // 큐브 좌표 반올림
  const cx = q;
  const cz = r;
  const cy = -cx - cz;
  let rx = Math.round(cx);
  let ry = Math.round(cy);
  let rz = Math.round(cz);
  const dx = Math.abs(rx - cx);
  const dy = Math.abs(ry - cy);
  const dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  void ry;
  const hx = s * Math.sqrt(3) * (rx + rz / 2);
  const hy = s * 1.5 * rz;
  const px = x - hx;
  const py = y - hy;
  const inr = (s * Math.sqrt(3)) / 2;
  const n1 = Math.abs(px);
  const n2 = Math.abs(px * 0.5 + py * 0.8660254);
  const n3 = Math.abs(px * 0.5 - py * 0.8660254);
  return inr - Math.max(n1, n2, n3);
}

/** 결계 돔 — 아래 반타원 + 육각 무늬 + 밝은 테두리 (512×256, 바닥 중앙 기준) */
const wardDome = memo(() =>
  toTex(
    alphaCanvas(512, 256, (x, y) => {
      const ex = (x - 256) / 248;
      const ey = (y - 256) / 236;
      const e = Math.hypot(ex, ey);
      if (e > 1.06) return 0;
      const rimD = (1 - e) * 236;
      const rim = Math.exp(-((rimD / 2.4) ** 2)) + 0.45 * Math.exp(-((rimD / 9) ** 2));
      if (e > 1) return clamp01(rim * 0.8);
      const fres = e ** 3.2;
      const hd = hexEdgeDist(x - 256, y - 256, 15);
      const hexLine = Math.exp(-((hd / 0.95) ** 2));
      const shimmer = 0.6 + 0.4 * fbm(x / 40, y / 40, 5, 3);
      const base = 0.08 + 0.32 * fres;
      const a = rim + base + hexLine * (0.12 + 0.55 * fres) * shimmer;
      // 바닥 쪽은 HUD 뒤로 사라지게
      return clamp01(a) * (1 - sstep(0.86, 1, y / 256) * 0.6);
    }),
  ),
);

/** 깨진 유리 (거미줄 모양 균열: 곧은 방사선 + 이어 주는 동심 조각) */
const crack = memo(() => {
  const [c, g] = mk(256, 256);
  const r = rng(913);
  g.translate(128, 128);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'miter';
  g.shadowColor = '#fff';
  g.shadowBlur = 2;
  const N = 11;
  const RINGS = [16, 34, 58, 86];
  // 방사선마다 반지름별 꺾임점을 미리 정한다
  const spokes: { x: number; y: number }[][] = [];
  for (let i = 0; i < N; i++) {
    let a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const pts = [{ x: Math.cos(a) * 3, y: Math.sin(a) * 3 }];
    const len = 92 + r() * 30;
    for (let k = 0; k < RINGS.length + 1; k++) {
      a += (r() - 0.5) * 0.16;
      const rad = k < RINGS.length ? RINGS[k] * (0.85 + r() * 0.3) : len;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    spokes.push(pts);
    for (let k = 0; k < pts.length - 1; k++) {
      g.globalAlpha = 1 - k * 0.12;
      g.lineWidth = Math.max(0.7, 2.4 - k * 0.42);
      g.beginPath();
      g.moveTo(pts[k].x, pts[k].y);
      g.lineTo(pts[k + 1].x, pts[k + 1].y);
      g.stroke();
    }
  }
  // 동심 조각 (이웃한 방사선을 잇는 살짝 휜 선)
  for (let k = 1; k <= RINGS.length; k++) {
    for (let i = 0; i < N; i++) {
      if (r() > 0.68 - k * 0.08) continue;
      const a = spokes[i][k];
      const b = spokes[(i + 1) % N][k];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const inward = 0.86 + r() * 0.08;
      g.globalAlpha = 0.85 - k * 0.12;
      g.lineWidth = Math.max(0.6, 1.5 - k * 0.2);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(mx * inward, my * inward);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }
  // 산산조각 난 한가운데
  g.globalAlpha = 0.5;
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rad = 5 + r() * 6;
    if (i) g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  return toTex(c);
});

/** 핏방울 (32×48, 위가 뾰족) */
const drop = memo(() =>
  toTex(
    alphaCanvas(32, 48, (x, y) => {
      const cx = 16;
      const cy = 32;
      const R = 10.5;
      let d: number;
      if (y >= cy) d = R - Math.hypot(x - cx, y - cy);
      else {
        const k = clamp01((y - 5) / (cy - 5));
        const hw = R * k ** 1.25;
        d = Math.min(hw - Math.abs(x - cx), y - 5);
      }
      const hl = Math.exp(-((Math.hypot(x - 12, y - 30) / 3) ** 2)) * 0.3;
      return clamp01(d + 0.5) * (0.82 + hl);
    }),
  ),
);

/** 거품 (독) */
const bubble = memo(() =>
  toTex(
    alphaCanvas(32, 32, (x, y) => {
      const d = Math.hypot(x - 16, y - 16);
      const ringA = Math.exp(-(((d - 12) / 1.3) ** 2));
      const fill = d < 12 ? 0.14 : 0;
      const hl = Math.exp(-((Math.hypot(x - 11.5, y - 11) / 2.4) ** 2)) * 0.9;
      return clamp01(ringA + fill + hl);
    }),
  ),
);

/** 위쪽 화살 (강화) */
const chevron = memo(() =>
  toTex(
    alphaCanvas(64, 48, (x, y) => {
      const seg = (ax: number, ay: number, bx: number, by: number) => {
        const vx = bx - ax;
        const vy = by - ay;
        const t = clamp01(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy));
        return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
      };
      const d = Math.min(seg(10, 38, 32, 14), seg(32, 14, 54, 38));
      return clamp01(Math.exp(-((d / 3.4) ** 2)) + 0.3 * Math.exp(-((d / 9) ** 2)));
    }),
  ),
);

/** 촉수 (뿌리가 왼쪽, 끝이 오른쪽) — 몸통 / 번짐 */
function tendrilShape(x: number, y: number, seed: number) {
  const u = x / 256;
  const ph = seed * 1.7;
  const dir = seed % 2 ? 1 : -1;
  // S자로 꿈틀대다가 끝이 말려 올라간다
  const cy =
    32 +
    Math.sin(u * Math.PI * 2.3 + ph) * 10 * Math.min(1, u * 2.2) +
    Math.sin(u * 13 + ph) * 2 * u +
    dir * 150 * Math.max(0, u - 0.74) ** 1.7;
  const hw = 12.5 * (1 - u) ** 0.8 + 0.7;
  return { u, dy: Math.abs(y - cy), hw };
}
const tendrils = memo(() =>
  [1, 2].map((seed) => ({
    body: toTex(
      alphaCanvas(256, 64, (x, y) => {
        const { u, dy, hw } = tendrilShape(x, y, seed);
        return clamp01(hw - dy + 0.5) * sstep(0, 0.08, u);
      }),
    ),
    glow: toTex(
      alphaCanvas(256, 64, (x, y) => {
        const { u, dy, hw } = tendrilShape(x, y, seed);
        return clamp01(Math.exp(-((dy / (hw * 1.5 + 4)) ** 2) * 1.4)) * sstep(0, 0.1, u) * (1 - u * 0.3);
      }),
    ),
  })),
);

/** 총구 화염 — 앵커 (0.2, 0.5), +x 방향으로 뻗는다 */
const muzzle = memo(() =>
  toTex(
    alphaCanvas(128, 64, (x, y) => {
      const ox = 26;
      const dx = x - ox;
      const dy = (y - 32) * 1.25;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      const fwd = Math.max(0, Math.cos(th)) ** 3;
      const spikes = 0.55 + 0.45 * Math.abs(Math.cos(th * 3.5)) ** 4;
      const rmax = 10 + 92 * fwd * spikes + 9 * Math.abs(Math.cos(th * 5)) ** 6;
      const body = 1 - sstep(rmax * 0.35, rmax, r);
      const coreA = Math.exp(-((r / 9) ** 2));
      return clamp01(body * 0.85 + coreA);
    }),
  ),
);

/** 작은 문자(룬 조각) 4종 */
const glyphs = memo(() => {
  const r = rng(4242);
  return [0, 1, 2, 3].map(() => {
    const [c, g] = mk(32, 32);
    g.strokeStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 3;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    const k = 2 + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      const x0 = 8 + r() * 16;
      const y0 = 6 + r() * 20;
      g.moveTo(x0, y0);
      if (r() < 0.4) g.arc(x0, y0, 3 + r() * 4, r() * 3, 3 + r() * 3);
      else g.lineTo(6 + r() * 20, 6 + r() * 20);
    }
    g.stroke();
    return toTex(c);
  });
});

/** 위로 길게 뻗은 빛 기둥 (64×256, 바닥 기준) */
const beam = memo(() =>
  toTex(
    alphaCanvas(64, 256, (x, y) => {
      const dx = Math.abs(x - 32) / 32;
      const v = y / 256;
      return Math.exp(-dx * dx * 9) * sstep(0, 0.55, v) * (1 - sstep(0.88, 1, v) * 0.7);
    }),
  ),
);

/** 불꽃 혀 (64×128) — 아래는 둥글고 위로 갈수록 가늘게 흔들리며 뾰족해진다 */
const flames = memo(() =>
  [3, 8, 13].map((seed) =>
    toTex(
      alphaCanvas(64, 128, (x, y) => {
        const v = y / 128;
        const sway = (vnoise(v * 4, 0.5, seed) - 0.5) * 14 * (1 - v);
        const dx = x - 32 - sway;
        let w: number;
        if (v > 0.72) {
          const cy = 0.72 * 128;
          const r = 24;
          w = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
        } else w = 24 * (v / 0.72) ** 0.9 * (0.82 + 0.36 * vnoise(v * 7, 2.5, seed));
        if (w <= 0.5) return 0;
        const q = Math.abs(dx) / w;
        if (q >= 1.15) return 0;
        const soft = Math.max(0, 1 - q * q) ** 0.9;
        const core = Math.exp(-((q / 0.35) ** 2)) * sstep(0.25, 0.8, v) * 0.35;
        return clamp01((soft * (0.55 + 0.45 * v) + core) * (1 - sstep(0.96, 1, v)));
      }),
    ),
  ),
);

/** 화면 가장자리에서 올라오는 불길 띠 (256×128, 아래가 진함) */
const flameWash = memo(() =>
  toTex(
    alphaCanvas(256, 128, (x, y) => {
      const v = 1 - y / 128;
      const n = fbm(x / 26, y / 18, 31, 4);
      const h = 0.35 + 0.65 * n;
      const side = 1 - sstep(0.45, 0.98, Math.abs(x - 128) / 128);
      return clamp01(sstep(h, h * 0.15, v) * (0.6 + 0.6 * n)) * side;
    }),
  ),
);

export const VT = {
  glow,
  core,
  flare,
  streak,
  ring,
  ringSoft,
  crescent,
  clawCore,
  clawGlow,
  shards,
  smokes,
  rune,
  hex,
  wardDome,
  crack,
  drop,
  bubble,
  chevron,
  tendrils,
  muzzle,
  glyphs,
  beam,
  flameWash,
  flames,
};

// ───────────── 적 실루엣 보조 ─────────────

function sourceCanvas(tex: Texture): CanvasImageSource | null {
  const res = (tex.source as { resource?: unknown }).resource;
  if (res && typeof res === 'object' && ('getContext' in res || 'naturalWidth' in res || 'close' in res)) return res as CanvasImageSource;
  return null;
}

export interface BlurredSilhouette {
  tex: Texture;
  /** 원본 대비 축소 배율 */
  k: number;
  /** 가장자리 여백 (축소된 픽셀 단위) */
  pad: number;
}

const shellCache = new WeakMap<Texture, BlurredSilhouette | null>();

/** 흰 실루엣을 작게 줄여 흐리게 만든 텍스처 (방어막 껍질용) */
export function blurredSilhouette(white: Texture): BlurredSilhouette | null {
  const hit = shellCache.get(white);
  if (hit !== undefined) return hit;
  const src = sourceCanvas(white);
  if (!src || white.width <= 1) {
    shellCache.set(white, null);
    return null;
  }
  const W = white.width;
  const H = white.height;
  const k = Math.min(1, 112 / Math.max(W, H));
  const pad = 14;
  const [c, g] = mk(Math.ceil(W * k) + pad * 2, Math.ceil(H * k) + pad * 2);
  g.shadowColor = '#fff';
  g.shadowBlur = 9;
  g.drawImage(src, pad, pad, W * k, H * k);
  g.shadowBlur = 4;
  g.drawImage(src, pad, pad, W * k, H * k);
  const out = { tex: toTex(c, false), k, pad };
  shellCache.set(white, out);
  return out;
}

const maskCache = new WeakMap<Texture, Float32Array | null>();

/**
 * 실루엣의 불투명한 칸 목록 (u, v 쌍, 0~1). 파티클을 몸 모양대로 뿌릴 때 쓴다.
 * 그림을 읽을 수 없으면 null.
 */
export function silhouetteCells(white: Texture): Float32Array | null {
  const hit = maskCache.get(white);
  if (hit !== undefined) return hit;
  let out: Float32Array | null = null;
  const src = sourceCanvas(white);
  if (src) {
    try {
      const N = 40;
      const [, g] = mk(N, N);
      g.drawImage(src, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      const cells: number[] = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 140) cells.push((x + 0.5) / N, (y + 0.5) / N);
      if (cells.length >= 8) out = new Float32Array(cells);
    } catch {
      out = null;
    }
  }
  maskCache.set(white, out);
  return out;
}

// ───────────── 화면 가장자리 비네트 (DOM용 캔버스) ─────────────

export type VignetteKind = 'blood' | 'ink' | 'fire' | 'void' | 'heal' | 'ward' | 'arcane' | 'poison';

const VIG_COLORS: Record<VignetteKind, [number[], number[], number]> = {
  // [안쪽 색, 바깥 색, 최대 알파]
  blood: [[210, 24, 18], [52, 0, 2], 0.95],
  poison: [[120, 220, 60], [18, 46, 8], 0.75],
  ink: [[70, 24, 110], [6, 0, 12], 0.97],
  fire: [[255, 128, 30], [90, 12, 0], 0.9],
  void: [[40, 255, 200], [0, 16, 16], 0.9],
  heal: [[90, 230, 130], [10, 70, 36], 0.7],
  ward: [[130, 200, 255], [16, 46, 90], 0.75],
  arcane: [[180, 120, 255], [30, 8, 60], 0.9],
};

const vigCache = new Map<VignetteKind, HTMLCanvasElement>();

/** 가장자리가 유기적으로 번진 비네트 캔버스 (CSS로 화면 전체에 늘려 쓴다) */
export function vignetteCanvas(kind: VignetteKind): HTMLCanvasElement {
  const hit = vigCache.get(kind);
  if (hit) return hit;
  const W = 160;
  const H = 320;
  const [inner, outer, amax] = VIG_COLORS[kind];
  const [c, g] = mk(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ex = (x + 0.5 - W / 2) / (W / 2);
      const ey = (y + 0.5 - H / 2) / (H / 2);
      // 모서리를 더 짙게: 초타원 거리
      const e = (Math.abs(ex) ** 3 + Math.abs(ey) ** 3) ** (1 / 3);
      const n = fbm(x / 14, y / 14, kind.length * 13, 4);
      const v = sstep(0.62, 1.04, e + (n - 0.5) * 0.3);
      const t = clamp01((e - 0.7) / 0.35);
      const i = (y * W + x) * 4;
      d[i] = inner[0] + (outer[0] - inner[0]) * t;
      d[i + 1] = inner[1] + (outer[1] - inner[1]) * t;
      d[i + 2] = inner[2] + (outer[2] - inner[2]) * t;
      d[i + 3] = Math.round(255 * amax * v ** 1.2);
    }
  }
  g.putImageData(img, 0, 0);
  vigCache.set(kind, c);
  return c;
}
