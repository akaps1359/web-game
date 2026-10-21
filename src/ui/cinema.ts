import ICONS from 'virtual:icons';
import type { CineName } from '../engine/types';
import { FLOORS, ORIGINS } from '../engine/registry';
import { stage } from '../render/stage';
import { sound } from '../sound';
import { store } from '../state/store';
import { surge } from './water';

/**
 * 화면 연출 (제4의 벽 등): 적의 행동이 화면 전체에 일으키는 일. 게임 규칙과는 무관하다.
 * 말은 걸지 않는다 — 화면이 겪는 일(유리가 깨지고, 데이터가 뒤섞이고, 먹물·물·손자국이 덮는다)로만 보여 준다.
 * DOM 위에 덧씌우는 막(#cine)과 Pixi 무대(stage)를 함께 쓴다. 모든 함수는 "막아야 하는 부분"이 끝나면 돌아오고,
 * 잔상(금 간 유리 등)은 뒤에서 혼자 사라진다.
 */

const speed = () => store.meta.speed ?? 1;
const T = (ms: number) => ms / speed();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, T(ms)));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <X>(xs: readonly X[]): X => xs[Math.floor(Math.random() * xs.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
type Pt = [number, number];

/** 씨앗이 같으면 같은 수열 (전투 내내 남는 금은 다시 그려도 같은 모양) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uidN = 0;
/** SVG 안의 그라디언트·필터 id가 겹치지 않게 */
const uid = (p: string) => `${p}${++uidN}`;

let root: HTMLDivElement | null = null;

/** 연출 막 (화면 맨 위, 누르기는 통과) */
function layer(): HTMLDivElement {
  if (!root || !root.isConnected) {
    root = document.createElement('div');
    root.id = 'cine';
    document.body.appendChild(root);
  }
  return root;
}

function div(cls: string, parent: HTMLElement = layer(), style: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, style);
  parent.appendChild(d);
  return d;
}

function anim(e: Element, kf: Keyframe[], o: KeyframeAnimationOptions & { duration: number }): Promise<void> {
  try {
    return e
      .animate(kf, { ...o, duration: T(o.duration), delay: o.delay ? T(o.delay as number) : 0 })
      .finished.then(
        () => undefined,
        () => undefined,
      );
  } catch {
    return Promise.resolve();
  }
}

function svgNS<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function iconSvg(name: string): string {
  return ICONS[name.replace(/^gi:/, '')] ?? '';
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** 화면 크기의 캔버스 (해상도는 낮춰도 된다) */
function canvasLayer(scale = 1, parent: HTMLElement = layer()): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; s: number } {
  const cv = document.createElement('canvas');
  cv.className = 'cine-full';
  const s = Math.min(2, window.devicePixelRatio || 1) * scale;
  cv.width = Math.round(innerWidth * s);
  cv.height = Math.round(innerHeight * s);
  parent.appendChild(cv);
  return { cv, g: cv.getContext('2d')!, s };
}

/** ms 동안 매 프레임 draw(진행 0~1, 연출 시간 초)를 부른다 */
function frames(ms: number, draw: (p: number, sec: number) => void): Promise<void> {
  const total = T(ms);
  const t0 = performance.now();
  return new Promise((done) => {
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      draw(p, ((now - t0) / 1000) * speed());
      if (p >= 1) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 연출의 중심: 적이면 그 몸 가운데, 아니면 화면 위쪽 가운데 */
export function cineCenter(uid?: string): { x: number; y: number } {
  const a = uid && uid !== 'p' ? stage.battle.anchor(uid) : null;
  if (a) return { x: a.x, y: a.y - a.size * 0.55 };
  return { x: innerWidth / 2, y: innerHeight * 0.32 };
}

// ───────────── 화면 유리 ─────────────

/** 폴리라인을 시작점에서 길이 d만큼 따라간 점 */
function along(pts: Pt[], d: number): Pt | null {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (left <= seg) {
      const k = left / (seg || 1);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    left -= seg;
  }
  return null;
}

/**
 * 깨진 유리 (SVG 문자열): 충격점마다 뻗는 금(안쪽은 굵고 끝으로 갈수록 가늘다, 가끔 갈라진다), 이웃한 금을 잇는 고리 금,
 * 빛을 받아 조금씩 밝거나 어두운 조각 면, 충격점에 하얗게 부서진 가루. 금마다 그림자·밝은 선·푸른 굴절 세 겹으로 그린다.
 * r: 난수 (씨앗이 같으면 같은 무늬)
 */
function glassSvg(W: number, H: number, hits: { x: number; y: number; n: number }[], r: () => number): string {
  const R = (a: number, b: number) => a + r() * (b - a);
  const f = (v: number) => v.toFixed(1);
  const path = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
  const lines: { d: string; w: number; o?: number }[] = [];
  const facets: string[] = [];
  const dust: string[] = [];
  const gid = uid('gl');
  // 굵다 가늘어지는 금: 세 마디씩 끊어 굵기를 줄여 간다 (금마다 밝기도 조금씩 다르다)
  const taper = (pts: Pt[], w0: number) => {
    const n = pts.length - 1;
    const o = R(0.62, 1);
    for (let i = 0; i < n; i += 3) lines.push({ d: path(pts.slice(i, Math.min(n, i + 3) + 1)), w: Math.max(0.35, w0 * (1 - (i / Math.max(1, n)) * 0.8)), o });
  };
  const run = (x: number, y: number, a: number, len: number, w0: number, depth: number): Pt[] => {
    const pts: Pt[] = [[x, y]];
    while (len > 0) {
      const step = R(12, 32);
      a += R(-0.07, 0.07) + (r() < 0.1 ? R(-0.28, 0.28) : 0);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push([x, y]);
      len -= step;
      if (depth < 2 && len > 50 && r() < 0.07) run(x, y, a + (r() < 0.5 ? -1 : 1) * R(0.35, 0.8), len * R(0.3, 0.55), w0 * 0.55, depth + 1);
    }
    taper(pts, w0);
    return pts;
  };
  for (const at of hits) {
    const rays = 7 + at.n * 3;
    const reach = Math.hypot(W, H) * (0.22 + at.n * 0.13);
    const spokes: Pt[][] = [];
    const a0 = R(0, TAU);
    for (let i = 0; i < rays; i++) {
      const a = a0 + ((i + R(-0.4, 0.4)) / rays) * TAU;
      const off = R(2, 6);
      const len = reach * (r() < 0.3 ? R(0.22, 0.45) : R(0.55, 1));
      spokes.push(run(at.x + Math.cos(a) * off, at.y + Math.sin(a) * off, a, len, R(1.3, 2.4), 0));
    }
    // 고리 금: 이웃한 금을 충격점에서 비슷한 거리에서 잇는다 (안쪽으로 조금 휜다). 바깥으로 갈수록 드물다. 그 사이 조각 면은 빛을 달리 받는다
    let prev: (Pt | null)[] = spokes.map((s) => s[0]);
    let d = R(12, 20);
    for (let k = 0; k < 1 + at.n; k++) {
      d *= R(1.7, 2.3);
      const chance = [0.78, 0.45, 0.26, 0.16][k] ?? 0.12;
      const cur = spokes.map((s) => along(s, d * R(0.82, 1.18)));
      for (let i = 0; i < spokes.length; i++) {
        const j = (i + 1) % spokes.length;
        const p = cur[i];
        const q = cur[j];
        if (!p || !q) continue;
        if (r() < chance) {
          const mx = (p[0] + q[0]) / 2;
          const my = (p[1] + q[1]) / 2;
          const bow = R(0.03, 0.1);
          lines.push({ d: path([p, [mx + (at.x - mx) * bow, my + (at.y - my) * bow], q]), w: R(0.6, 1.15) });
        }
        const pp = prev[i];
        const pq = prev[j];
        if (pp && pq && r() < 0.42) {
          const fill = r() < 0.6 ? `rgba(225,240,255,${R(0.035, 0.11).toFixed(3)})` : `rgba(0,6,16,${R(0.06, 0.16).toFixed(3)})`;
          facets.push(`<path d="${path([pp, p, q, pq])}Z" fill="${fill}"/>`);
        }
      }
      prev = cur;
    }
    // 충격점: 하얗게 부서진 가루와 잔금
    dust.push(`<circle cx="${f(at.x)}" cy="${f(at.y)}" r="${f(R(10, 15) * (1 + at.n * 0.25))}" fill="url(#${gid})"/>`);
    for (let i = 0; i < 12 + at.n * 6; i++) {
      const a = R(0, TAU);
      const r0 = R(1, 9 + at.n * 3);
      const r1 = r0 + R(2, 6);
      const a1 = a + R(-0.6, 0.6);
      lines.push({ d: path([[at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0], [at.x + Math.cos(a1) * r1, at.y + Math.sin(a1) * r1]]), w: R(0.4, 0.8) });
    }
  }
  const strokes = (dx: number, dy: number, color: string, k: number, add: number) =>
    `<g transform="translate(${dx} ${dy})" stroke="${color}">${lines.map((l) => `<path d="${l.d}" stroke-width="${f(l.w * k + add)}"${l.o ? ` stroke-opacity="${l.o.toFixed(2)}"` : ''}/>`).join('')}</g>`;
  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#eaf4ff" stop-opacity=".35"/><stop offset="1" stop-color="#eaf4ff" stop-opacity="0"/></radialGradient></defs>` +
    `<g>${facets.join('')}</g>` +
    strokes(0.9, 1.1, 'rgba(0,0,0,.5)', 1, 1.3) +
    strokes(0, 0, 'rgba(240,248,255,.93)', 1, 0) +
    strokes(-0.7, -0.6, 'rgba(170,215,255,.5)', 0.5, 0) +
    dust.join('') +
    `</svg>`
  );
}

/** 떨어지는 유리 조각 하나의 모양 (세모·네모) */
function shardClip(): string {
  const k = Math.random() < 0.6 ? 3 : 4;
  const pts = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * TAU + rnd(-0.5, 0.5);
    const rr = rnd(35, 50);
    return `${(50 + Math.cos(a) * rr).toFixed(0)}% ${(50 + Math.sin(a) * rr).toFixed(0)}%`;
  });
  return `polygon(${pts.join(',')})`;
}

async function crack(n: number, at: { x: number; y: number }, linger = true, parent: HTMLElement = layer()) {
  n = clamp(n, 1, 3);
  const W = innerWidth;
  const H = innerHeight;
  const wrap = div('cine-full', parent);
  wrap.innerHTML = glassSvg(W, H, [{ ...at, n }], Math.random);
  const svg = wrap.firstElementChild as SVGSVGElement;
  svg.classList.add('cine-full');
  // 금이 충격점에서 바깥으로 번진다
  const reach = Math.hypot(W, H) * (0.22 + n * 0.13) * 1.05;
  void anim(svg, [{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }, { clipPath: `circle(${reach.toFixed(0)}px at ${at.x}px ${at.y}px)` }], {
    duration: 170 + n * 40,
    easing: 'cubic-bezier(.15,.8,.3,1)',
    fill: 'forwards',
  });
  // 충격 섬광과 유리를 타고 번지는 고리
  const flash = div('cine-flash', wrap, { left: `${at.x}px`, top: `${at.y}px` });
  void anim(flash, [{ transform: 'translate(-50%,-50%) scale(0.15)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
  const ring = div('cine-glass-ring', wrap, { left: `${at.x}px`, top: `${at.y}px` });
  void anim(ring, [{ transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(5)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  sound.sfx('glass', { pitch: 1.1 - n * 0.1 });
  stage.shake(8 + n * 4, 0.35);
  stage.punch(at.x, at.y, 0.03 + n * 0.008, 0.28);
  // 떨어지는 유리 조각: 돌며 빛을 받는다
  for (let i = 0; i < 6 + n * 5; i++) {
    const s = div('cine-shard', wrap, { left: `${at.x + rnd(-50, 50)}px`, top: `${at.y + rnd(-36, 36)}px`, width: `${rnd(6, 14)}px`, height: `${rnd(8, 20)}px`, clipPath: shardClip() });
    const dx = rnd(-90, 90);
    const dy = rnd(220, 480);
    const rz = rnd(-320, 320);
    const rx = rnd(-540, 540);
    void anim(
      s,
      [
        { transform: 'translate(0,0) rotate(0deg) rotateX(0deg)', opacity: 0.95 },
        { transform: `translate(${(dx * 0.5).toFixed(0)}px,${(dy * 0.22).toFixed(0)}px) rotate(${(rz * 0.5).toFixed(0)}deg) rotateX(${(rx * 0.5).toFixed(0)}deg)`, opacity: 0.9, offset: 0.4 },
        { transform: `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px) rotate(${rz.toFixed(0)}deg) rotateX(${rx.toFixed(0)}deg)`, opacity: 0 },
      ],
      { duration: rnd(800, 1300), easing: 'cubic-bezier(.35,.05,.75,1)', fill: 'forwards' },
    );
  }
  const hold = linger ? 1600 + n * 900 : 500;
  setTimeout(() => {
    void anim(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' }).then(() => wrap.remove());
  }, T(hold));
  await sleep(300);
}

// ───────────── 데이터가 깨진다 ─────────────

const GLYPHS = '▓▒░█▚▞◢◣◤◥#%&@$ㅁㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ심연저너머아래목소리';

function garble(s: string): string {
  let out = '';
  for (const ch of s) out += /\s/.test(ch) ? ch : Math.random() < 0.75 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : ch;
  return out;
}

/** 화면의 글자를 잠깐 뒤섞는다 (다시 그려지면 원래대로) */
function scrambleText(ms: number) {
  const app = document.getElementById('app');
  if (!app) return;
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
  const nodes: { n: Text; was: string; now: string }[] = [];
  for (let t = walker.nextNode(); t && nodes.length < 260; t = walker.nextNode()) {
    const n = t as Text;
    if (!n.data.trim()) continue;
    const now = garble(n.data);
    nodes.push({ n, was: n.data, now });
    n.data = now;
  }
  setTimeout(() => {
    for (const x of nodes) if (x.n.data === x.now) x.n.data = x.was;
  }, T(ms));
}

/** 띠 아래의 그림을 망가뜨리는 필터 (색이 돌고, 뒤집히고, 하얗게 타고, 번진다) */
const CORRUPT = ['hue-rotate(95deg) saturate(3)', 'invert(1)', 'brightness(1.9) contrast(2.2)', 'hue-rotate(-130deg) saturate(2.6) brightness(1.15)', 'blur(2.5px) brightness(1.5)', 'grayscale(1) contrast(3)'];

async function glitch(n: number) {
  n = clamp(n, 1, 3);
  const dur = 650 + n * 220;
  document.body.classList.add('cine-glitching');
  const wrap = div('cine-full cine-glitch');
  // 1) 지나가는 띠: 그 아래 화면의 색이 돌거나 뒤집힌다 (색 막대로 덮지 않는다)
  for (let i = 0; i < 4 + n * 3; i++) {
    const band = div('cine-band', wrap, { top: `${rnd(0, 97).toFixed(1)}%`, height: `${rnd(0.6, 5).toFixed(1)}%` });
    const f = pick(CORRUPT);
    band.style.setProperty('backdrop-filter', f);
    band.style.setProperty('-webkit-backdrop-filter', f);
    void anim(
      band,
      [
        { transform: `translateX(${rnd(-12, 12).toFixed(0)}%)`, opacity: 0 },
        { transform: `translateX(${rnd(-3, 3).toFixed(0)}%)`, opacity: 1, offset: 0.12 },
        { transform: `translateX(${rnd(-20, 20).toFixed(0)}%)`, opacity: 0, offset: 0.38 },
        { transform: `translateX(${rnd(-4, 4).toFixed(0)}%)`, opacity: 1, offset: 0.66 },
        { transform: `translateX(${rnd(-12, 12).toFixed(0)}%)`, opacity: 0 },
      ],
      { duration: dur, delay: rnd(0, 180), easing: 'steps(7)' },
    );
  }
  // 2) 가늘게 찢어진 선
  for (let i = 0; i < 6 + n * 4; i++) {
    const tear = div('cine-tear', wrap, { top: `${rnd(0, 100).toFixed(1)}%`, left: `${rnd(-10, 40).toFixed(0)}%`, width: `${rnd(30, 90).toFixed(0)}%` });
    void anim(tear, [{ opacity: 0 }, { opacity: rnd(0.4, 0.9), offset: 0.2 }, { opacity: 0, offset: 0.3 }, { opacity: rnd(0.3, 0.8), offset: 0.7 }, { opacity: 0 }], {
      duration: dur * rnd(0.5, 1),
      delay: rnd(0, dur * 0.4),
      easing: 'steps(5)',
    });
  }
  // 3) 깨진 블록 (작은 사각형이 차이 합성으로 번쩍인다)
  for (let i = 0; i < 8 + n * 6; i++) {
    const b = div('cine-block', wrap, {
      left: `${rnd(0, 92).toFixed(1)}%`,
      top: `${rnd(0, 98).toFixed(1)}%`,
      width: `${rnd(12, 80).toFixed(0)}px`,
      height: `${rnd(3, 14).toFixed(0)}px`,
      background: pick(['#3ff', '#f3f', '#fff', '#ff3a5a', '#3f9']),
    });
    void anim(b, [{ opacity: 0 }, { opacity: rnd(0.4, 0.8), offset: 0.25 }, { opacity: 0, offset: 0.5 }, { opacity: rnd(0.3, 0.7), offset: 0.8 }, { opacity: 0 }], {
      duration: dur * rnd(0.4, 0.9),
      delay: rnd(0, dur * 0.5),
      easing: 'steps(4)',
    });
  }
  // 4) 주사선
  const scan = div('cine-full cine-scan', wrap);
  void anim(scan, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: dur });
  scrambleText(dur * 0.85);
  sound.sfx('glitch');
  setTimeout(() => sound.sfx('glitch', { pitch: 0.7 }), T(dur * 0.45));
  stage.splitPulse(1.4 + n * 0.5);
  stage.shake(4 + n * 2, 0.25);
  await sleep(dur);
  document.body.classList.remove('cine-glitching');
  wrap.remove();
}

// ───────────── 피 묻은 손글씨 ─────────────

async function scrawl(text: string) {
  const line = text || '…';
  const W = innerWidth;
  const H = innerHeight;
  const chars = [...line];
  const size = Math.min(W * 0.3, (W * 0.9) / Math.max(1.4, chars.length * 0.9));
  const id = uid('bl');
  const cx = W / 2;
  const cy = H * 0.4;
  const wrap = div('cine-full cine-scrawl');
  // 거친 붓 자국(변위) + 군데군데 비는 얼룩 + 젖은 윤기
  wrap.innerHTML =
    `<svg class="cine-full" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>` +
    `<filter id="${id}f" x="-15%" y="-30%" width="130%" height="190%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.045 0.09" numOctaves="2" seed="${Math.floor(rnd(1, 99))}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${(size * 0.08).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="7" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 0 0 0 1.85" result="m"/>` +
    `<feComposite in="d" in2="m" operator="in" result="t"/>` +
    `<feGaussianBlur in="t" stdDeviation="1.6" result="b"/>` +
    `<feSpecularLighting in="b" surfaceScale="2.5" specularConstant=".42" specularExponent="24" lighting-color="#ff9e94" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>` +
    `<feComposite in="s" in2="t" operator="in" result="s2"/>` +
    `<feMerge><feMergeNode in="t"/><feMergeNode in="s2"/></feMerge>` +
    `</filter>` +
    `<linearGradient id="${id}w" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".82" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect class="wipe" x="0" y="0" width="${(W * 1.3).toFixed(0)}" height="${H}" fill="url(#${id}w)"/></mask>` +
    `</defs>` +
    `<g transform="rotate(${rnd(-8, 8).toFixed(1)} ${cx} ${cy})" filter="url(#${id}f)">` +
    `<g mask="url(#${id}m)"><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${size.toFixed(0)}" class="cine-scrawl-text">${esc(line)}</text></g>` +
    `<g class="drips"></g></g></svg>`;
  const svg = wrap.querySelector('svg')!;
  const txt = svg.querySelector('text')!;
  const wipe = svg.querySelector('.wipe') as SVGRectElement;
  let box = { x: cx - size, y: cy - size / 2, width: size * 2, height: size };
  try {
    const b = txt.getBBox();
    if (b.width > 0) box = b;
  } catch {
    // 아직 그려지지 않았으면 대략으로
  }
  sound.sfx('whisper', { volume: 0.7, pitch: 0.8 });
  // 손가락으로 그어 쓰듯 왼쪽부터 드러난다
  const writeMs = 260 + chars.length * 150;
  const from = box.x - W * 1.3;
  const to = box.x + box.width - W * 1.3 * 0.82 + 8;
  wipe.setAttribute('x', from.toFixed(0));
  await anim(wipe, [{ transform: 'translateX(0px)' }, { transform: `translateX(${(to - from).toFixed(0)}px)` }], { duration: writeMs, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'forwards' });
  // 흘러내리는 핏방울
  const drips = svg.querySelector('.drips')!;
  for (let i = 0; i < 2 + Math.min(5, chars.length); i++) {
    const x = box.x + box.width * rnd(0.08, 0.92);
    const y = box.y + box.height * rnd(0.55, 0.8);
    const len = rnd(24, 100);
    const w = rnd(2.2, 4.6);
    const d = svgNS(
      'path',
      { d: `M${(x - w / 2).toFixed(1)} ${y.toFixed(1)} L${(x + w / 2).toFixed(1)} ${y.toFixed(1)} L${(x + w * 0.35).toFixed(1)} ${(y + len).toFixed(1)} A${(w * 0.75).toFixed(1)} ${(w * 0.75).toFixed(1)} 0 1 1 ${(x - w * 0.35).toFixed(1)} ${(y + len).toFixed(1)} Z`, fill: '#6a0507' },
      drips,
    );
    d.style.transformBox = 'fill-box';
    d.style.transformOrigin = '50% 0%';
    d.style.transform = 'scaleY(0)';
    void anim(d, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(0.25)', offset: 0.35 }, { transform: 'scaleY(1)' }], {
      duration: rnd(1300, 2600),
      delay: rnd(0, 500),
      easing: 'cubic-bezier(.5,0,.85,.55)',
      fill: 'forwards',
    });
  }
  await sleep(500);
  setTimeout(() => {
    void anim(wrap, [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(3px)' }], { duration: 900, fill: 'forwards' }).then(() => wrap.remove());
  }, T(1900));
}

// ───────────── 가짜 게임 오버 ─────────────

/** 진짜 끝 화면과 똑같은 마크업 (End.tsx) — 지금 판의 기록 그대로 */
function endHtml(): string {
  const run = store.run;
  const st = run?.stats;
  const mins = st ? Math.max(1, Math.round((st.playMs ? st.playMs : Date.now() - st.startedAt) / 60000)) : 1;
  const rows: [string, string][] =
    run && st
      ? [
          ['출신', ORIGINS.get(run.origin)?.name ?? ''],
          ['심연', `${run.asc ?? 0}단계`],
          ['도달', `${run.act}층${FLOORS.get(run.act) ? ` · ${FLOORS.get(run.act)!.name}` : ''}`],
          ['레벨', String(run.player.level)],
          ['처치', `${st.kills}`],
          ['붕괴시킨 적', `${st.breaks}`],
          ['흡수한 정수', `${st.essences}`],
          ['준 피해 / 받은 피해', `${st.dmgDealt} / ${st.dmgTaken}`],
          ['잃은 정신력', `${st.sanityLost}`],
          ['탐험한 방', `${st.rooms}`],
          ['소요 시간', `약 ${mins}분`],
        ]
      : [];
  return (
    `<div class="cine-over-app"><div class="screen"><div class="screen-center">` +
    `<div class="hero-icon" style="box-shadow:0 0 60px rgba(200,40,40,0.35)"><span class="ic" style="width:56px;height:56px;color:#c8423a">${iconSvg('gi:tombstone')}</span></div>` +
    `<h2 class="title" style="text-align:center;font-size:28px">심연에 잠들다</h2>` +
    `<div class="flavor" style="text-align:center">심연에서 쓰러졌다</div>` +
    `<div class="panel" style="padding:14px;display:grid;gap:6px">${rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:14px"><span class="muted">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` +
    `<div class="muted" style="font-size:12px;text-align:center">알아낸 약점과 만난 존재는 도감에 기록되었다.</div>` +
    `<button class="btn wide" tabindex="-1">처음으로</button>` +
    `</div></div></div>`
  );
}

/** 진짜와 똑같은 끝 화면이 떴다가, 그 화면이 깨지며 전투로 돌아온다 (말은 걸지 않는다) */
async function fakeover() {
  const app = document.getElementById('app');
  const W = innerWidth;
  const H = innerHeight;
  // 진짜처럼: 암전 → 끝 화면 (전투 그림은 숨기고 배경만 남긴다)
  stage.flash(0x000000, 0.75);
  sound.sfx('heartbeat');
  const veil = div('cine-full cine-black');
  await anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, fill: 'forwards' });
  if (app) app.style.visibility = 'hidden';
  const battle = stage.battle.visible;
  stage.battle.visible = false;
  const over = div('cine-full cine-over');
  over.innerHTML = endHtml();
  void anim(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' }).then(() => veil.remove());
  await sleep(2100);
  sound.sfx('heartbeat', { volume: 0.5 });
  await sleep(550);
  // 그 화면에 금이 간다
  const at = { x: W * rnd(0.4, 0.6), y: H * 0.42 };
  await crack(3, at, false, over);
  await sleep(160);
  // 금을 따라 위아래로 갈라져 떨어진다 — 뒤에는 멀쩡한 전투
  for (const e of Array.from(over.querySelectorAll('.cine-flash, .cine-glass-ring, .cine-shard'))) e.remove();
  const edge: string[] = [];
  for (let i = 0; i <= 10; i++) edge.push(`${((i / 10) * 100).toFixed(1)}% ${(at.y + rnd(-34, 34)).toFixed(0)}px`);
  const half = (top: boolean) => {
    const h = over.cloneNode(true) as HTMLDivElement;
    h.classList.add('cine-over-half');
    h.style.clipPath = top ? `polygon(0 0,100% 0,${[...edge].reverse().join(',')})` : `polygon(${edge.join(',')},100% 100%,0 100%)`;
    layer().appendChild(h);
    return h;
  };
  const top = half(true);
  const bottom = half(false);
  over.remove();
  if (app) app.style.visibility = '';
  stage.battle.visible = battle;
  stage.flash(0xffffff, 0.55);
  stage.shake(14, 0.4);
  sound.sfx('breakdown');
  await Promise.all([
    anim(top, [{ transform: 'translateY(0) rotate(0)' }, { transform: `translateY(-${(H * 0.75).toFixed(0)}px) rotate(-7deg)`, opacity: 0.6 }], { duration: 700, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }),
    anim(bottom, [{ transform: 'translateY(0) rotate(0)' }, { transform: `translateY(${(H * 0.8).toFixed(0)}px) rotate(6deg)`, opacity: 0.6 }], { duration: 700, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }),
  ]);
  top.remove();
  bottom.remove();
}

// ───────────── 지켜보는 눈 ─────────────

let lastPointer = { x: innerWidth / 2, y: innerHeight * 0.6 };
if (typeof window !== 'undefined') {
  const keep = (e: PointerEvent) => (lastPointer = { x: e.clientX, y: e.clientY });
  window.addEventListener('pointerdown', keep, { passive: true });
  window.addEventListener('pointermove', keep, { passive: true });
}

let irisUrl = '';
/** 홍채 그림 (한 번 굽는다): 금빛 섬유가 동공에서 바깥으로 뻗고, 톱니 고리·움푹한 틈, 가장자리는 검게 가라앉는다 */
function irisImage(): string {
  if (irisUrl) return irisUrl;
  const S = 256;
  const c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const base = g.createRadialGradient(c, c, 0, c, c, c);
  base.addColorStop(0, '#2a0c02');
  base.addColorStop(0.22, '#8a3a08');
  base.addColorStop(0.44, '#e8a62a');
  base.addColorStop(0.7, '#b8620e');
  base.addColorStop(0.9, '#5a1e04');
  base.addColorStop(1, '#120400');
  g.fillStyle = base;
  g.beginPath();
  g.arc(c, c, c, 0, TAU);
  g.fill();
  const tones = ['255,214,120', '255,170,60', '120,40,4', '255,240,190', '200,90,10'];
  for (let i = 0; i < 560; i++) {
    const a = Math.random() * TAU;
    const r0 = c * rnd(0.18, 0.42);
    const r1 = c * rnd(0.6, 0.97);
    const wob = rnd(-0.07, 0.07);
    g.strokeStyle = `rgba(${pick(tones)},${rnd(0.12, 0.45).toFixed(2)})`;
    g.lineWidth = rnd(0.5, 1.7);
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    g.quadraticCurveTo(c + Math.cos(a + wob) * ((r0 + r1) / 2), c + Math.sin(a + wob) * ((r0 + r1) / 2), c + Math.cos(a + wob * 2) * r1, c + Math.sin(a + wob * 2) * r1);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255, 222, 140, 0.55)';
  g.lineWidth = 1.8;
  g.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU;
    const r = c * (0.42 + (i % 2 ? 0.035 : -0.02) + rnd(-0.015, 0.015));
    if (i) g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    else g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  g.stroke();
  for (let i = 0; i < 28; i++) {
    const a = rnd(0, TAU);
    const r = c * rnd(0.47, 0.86);
    g.fillStyle = `rgba(40,10,0,${rnd(0.15, 0.42).toFixed(2)})`;
    g.beginPath();
    g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, rnd(2, 7), rnd(1, 3), a, 0, TAU);
    g.fill();
  }
  const limb = g.createRadialGradient(c, c, c * 0.78, c, c, c);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.7, 'rgba(10,2,0,0.55)');
  limb.addColorStop(1, 'rgba(0,0,0,0.96)');
  g.fillStyle = limb;
  g.beginPath();
  g.arc(c, c, c, 0, TAU);
  g.fill();
  irisUrl = cv.toDataURL();
  return irisUrl;
}

interface EyeRig {
  svg: SVGSVGElement;
  iris: SVGGElement;
  pupil: SVGEllipseElement;
  /** 눈꺼풀 (0 감음 ~ 1 뜸) */
  setOpen(o: number): void;
}

/**
 * 눈 그림: 젖은 흰자·핏줄·섬유 홍채·세로 동공, 살갗 눈꺼풀(가장자리 모양을 바꿔 감고 뜬다)과 속눈썹, 창문 반사는 각막에 고정.
 * 가장자리는 둥글게 어둠 속으로 녹는다. 홍채(g)를 옮기면 눈이 굴러간다
 */
function eyeSvg(w: number): EyeRig {
  const id = uid('eye');
  const svg = svgNS('svg', { width: w, height: w * 0.62, viewBox: '0 -12 200 124', overflow: 'visible' });
  const veins = Array.from({ length: 16 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const x0 = 100 + side * rnd(55, 98);
    const y0 = 50 + rnd(-24, 24);
    const x1 = x0 - side * rnd(14, 26);
    const y1 = y0 + rnd(-10, 10);
    const x2 = x1 - side * rnd(8, 16);
    return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} Q${((x0 + x1) / 2).toFixed(1)},${(y0 + rnd(-6, 6)).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} T${x2.toFixed(1)},${(y1 + rnd(-6, 6)).toFixed(1)}" stroke="rgba(150,18,18,${rnd(0.3, 0.6).toFixed(2)})" stroke-width="${rnd(0.4, 1.1).toFixed(2)}" fill="none"/>`;
  }).join('');
  svg.innerHTML =
    `<defs>` +
    `<radialGradient id="${id}s" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="#f6efe2"/><stop offset=".55" stop-color="#e3d2b8"/><stop offset=".85" stop-color="#b98a78"/><stop offset="1" stop-color="#5a1a16"/></radialGradient>` +
    `<clipPath id="${id}c"><path class="slit" d=""/></clipPath>` +
    `<clipPath id="${id}i"><circle cx="100" cy="50" r="29"/></clipPath>` +
    `<radialGradient id="${id}ao" cx="50%" cy="50%" r="58%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a0806" stop-opacity=".8"/></radialGradient>` +
    `<linearGradient id="${id}lt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0406"/><stop offset=".75" stop-color="#241014"/><stop offset="1" stop-color="#4a2228"/></linearGradient>` +
    `<linearGradient id="${id}lb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0a0406"/><stop offset=".75" stop-color="#20100f"/><stop offset="1" stop-color="#46201f"/></linearGradient>` +
    `<radialGradient id="${id}fade" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
    `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-10" y="-20" width="220" height="140"><ellipse cx="100" cy="50" rx="108" ry="64" fill="url(#${id}fade)"/></mask>` +
    `</defs>` +
    `<g mask="url(#${id}m)">` +
    `<g clip-path="url(#${id}c)">` +
    `<rect x="0" y="-12" width="200" height="124" fill="url(#${id}s)"/>${veins}` +
    `<g class="iris"><circle cx="100" cy="50" r="31" fill="rgba(60,10,0,.4)"/>` +
    `<image href="${irisImage()}" x="71" y="21" width="58" height="58" clip-path="url(#${id}i)"/>` +
    `<ellipse class="pupil" cx="100" cy="50" rx="5.5" ry="22" fill="#040102"/>` +
    `<ellipse cx="100" cy="50" rx="7.5" ry="24" fill="none" stroke="rgba(255,120,40,.22)" stroke-width="1.4"/></g>` +
    `<rect x="0" y="-12" width="200" height="124" fill="url(#${id}ao)"/>` +
    `<ellipse cx="84" cy="35" rx="7.5" ry="4.2" fill="rgba(255,255,255,.72)" transform="rotate(-22 84 35)"/>` +
    `<ellipse cx="113" cy="61" rx="2.6" ry="1.5" fill="rgba(255,255,255,.4)"/>` +
    `</g>` +
    `<path class="lid-t" fill="url(#${id}lt)"/><path class="lid-b" fill="url(#${id}lb)"/>` +
    `<path class="rim-t" fill="none" stroke="rgba(170,80,86,.85)" stroke-width="1.6"/>` +
    `<path class="rim-b" fill="none" stroke="rgba(150,70,70,.6)" stroke-width="1.2"/>` +
    `<path class="lash" fill="none" stroke="#050203" stroke-width="1.1" stroke-linecap="round"/>` +
    `</g>`;
  const slit = svg.querySelector('.slit') as SVGPathElement;
  const lidT = svg.querySelector('.lid-t') as SVGPathElement;
  const lidB = svg.querySelector('.lid-b') as SVGPathElement;
  const rimT = svg.querySelector('.rim-t') as SVGPathElement;
  const rimB = svg.querySelector('.rim-b') as SVGPathElement;
  const lash = svg.querySelector('.lash') as SVGPathElement;
  const pupil = svg.querySelector('.pupil') as SVGEllipseElement;
  pupil.style.transformBox = 'fill-box';
  pupil.style.transformOrigin = '50% 50%';
  // 위 눈꺼풀 가장자리: (4,50)→(196,50), 조절점 y = top. 아래도 같은 식 (bot). 감으면 둘이 조금 아래에서 만난다
  const setOpen = (o: number) => {
    const e = clamp(o, 0, 1);
    const top = 64 - 82 * e;
    const bot = 64 + 54 * e;
    const up = `M4,50 Q100,${top.toFixed(1)} 196,50`;
    const down = `M4,50 Q100,${bot.toFixed(1)} 196,50`;
    slit.setAttribute('d', `${up} Q100,${bot.toFixed(1)} 4,50 Z`);
    lidT.setAttribute('d', `M-12,-14 L212,-14 L212,50 L196,50 Q100,${top.toFixed(1)} 4,50 L-12,50 Z`);
    lidB.setAttribute('d', `M-12,114 L212,114 L212,50 L196,50 Q100,${bot.toFixed(1)} 4,50 L-12,50 Z`);
    rimT.setAttribute('d', up);
    rimB.setAttribute('d', down);
    // 속눈썹: 위 가장자리를 따라 바깥으로 휜다
    let d = '';
    for (let i = 1; i < 22; i++) {
      const t = i / 22;
      const x = (1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 100 + t * t * 196;
      const y = (1 - t) * (1 - t) * 50 + 2 * (1 - t) * t * top + t * t * 50;
      const nx = (t - 0.5) * 0.9;
      const len = 3 + 5 * Math.sin(Math.PI * t) * (0.4 + 0.6 * e);
      d += `M${x.toFixed(1)},${y.toFixed(1)} q${(nx * len).toFixed(1)},${(-len * 0.6).toFixed(1)} ${(nx * len * 1.6).toFixed(1)},${(-len).toFixed(1)}`;
    }
    lash.setAttribute('d', d);
  };
  setOpen(0);
  return { svg, iris: svg.querySelector('.iris') as SVGGElement, pupil, setOpen };
}

/** 눈꺼풀을 ms 동안 a → b로 */
function lids(rig: EyeRig, a: number, b: number, ms: number, ease: (p: number) => number = easeInOut): Promise<void> {
  return frames(ms, (p) => rig.setOpen(a + (b - a) * ease(p)));
}

/** 홍채가 손끝을 따라본다 (가끔 툭 튀는 잔떨림). 돌려준 함수를 부르면 멈춘다 */
function follow(rig: EyeRig, box: HTMLElement): () => void {
  let on = true;
  let cx = 0;
  let cy = 0;
  let jx = 0;
  let jy = 0;
  let nextJ = 0;
  const tick = (now: number) => {
    if (!on) return;
    const r = box.getBoundingClientRect();
    const tx = ((lastPointer.x - (r.left + r.width / 2)) / (r.width / 2)) * 34;
    const ty = ((lastPointer.y - (r.top + r.height / 2)) / (r.height / 2)) * 14;
    if (now > nextJ) {
      jx = rnd(-3, 3);
      jy = rnd(-1.5, 1.5);
      nextJ = now + rnd(500, 1400);
    }
    cx += (clamp(tx, -34, 34) + jx - cx) * 0.16;
    cy += (clamp(ty, -14, 14) + jy - cy) * 0.16;
    rig.iris.setAttribute('transform', `translate(${cx.toFixed(2)},${cy.toFixed(2)})`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => (on = false);
}

async function eye(n: number) {
  const veil = div('cine-full cine-eyeveil');
  void anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
  const w = Math.min(innerWidth * 1.05, 560);
  const box = div('cine-eye', veil);
  const rig = eyeSvg(w);
  box.appendChild(rig.svg);
  void anim(box, [{ transform: 'scale(0.94)' }, { transform: 'scale(1.03)' }], { duration: 2600 + n * 500, easing: 'ease-out', fill: 'forwards' });
  const stop = follow(rig, box);
  sound.sfx('reveal', { pitch: 0.45 });
  sound.sfx('heartbeat');
  // 천천히 벌어진다 → 동공이 좁아지며 초점을 맞춘다
  await lids(rig, 0, 1, 900);
  void anim(rig.pupil, [{ transform: 'scaleX(1.5)' }, { transform: 'scaleX(0.55)' }], { duration: 500, easing: 'ease-out', fill: 'forwards' });
  stage.splitPulse(1);
  await sleep(700 + Math.max(0, n - 1) * 500);
  // 깜빡
  await lids(rig, 1, 0.05, 110);
  await lids(rig, 0.05, 1, 150);
  sound.sfx('whisper', { volume: 0.6 });
  await sleep(650);
  await lids(rig, 1, 0, 320);
  stop();
  await anim(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
  veil.remove();
}

// ───────────── 먹물 ─────────────

/**
 * 먹물이 화면 가장자리에서 밀려들어 덮었다가 빠진다. 낮은 해상도 메타볼(촉수처럼 앞서 뻗는 작은 방울 포함, 닿는 거리가 정해진 부드러운 방울이라
 * 멀리 있는 방울끼리 합쳐지지 않는다) + 흐르는 잡음으로 가장자리를 끓게 하고, 가장자리에만 보랏빛 기름 윤기를 둔다. 작게 그려 매끄럽게 키운다
 */
async function ink() {
  const W = innerWidth;
  const H = innerHeight;
  const S = 0.2;
  const cw = Math.ceil(W * S);
  const ch = Math.ceil(H * S);
  const small = document.createElement('canvas');
  small.width = cw;
  small.height = ch;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(cw, ch);
  // 보이는 캔버스: 작은 그림을 매끄럽게 키워 그린다 (CSS로 키우면 기기에 따라 계단이 진다)
  const { cv, g } = canvasLayer(0.75);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // 잡음 격자 (부드럽게 보간)
  const NG = 24;
  const noise = Array.from({ length: NG * NG }, () => Math.random());
  const nAt = (x: number, y: number) => {
    const fx = ((x % NG) + NG) % NG;
    const fy = ((y % NG) + NG) % NG;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const v = (i: number, j: number) => noise[(j % NG) * NG + (i % NG)];
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  const edge = (i: number, k: number): Pt => {
    const t = (Math.floor(i / 4) + Math.random() * 0.8) / Math.ceil(k / 4);
    const side = i % 4;
    return side === 0 ? [t * cw, -2] : side === 1 ? [cw + 2, t * ch] : side === 2 ? [(1 - t) * cw, ch + 2] : [-2, (1 - t) * ch];
  };
  // 큰 방울: 가장자리에서 부풀고 / 촉수: 가장자리에서 안쪽으로 먼저 뻗는다
  const M = Math.max(cw, ch);
  const big = Array.from({ length: 10 }, (_, i) => {
    const [x, y] = edge(i, 10);
    return { x, y, r: rnd(0.46, 0.62) * M };
  });
  const fingers = Array.from({ length: 12 }, (_, i) => {
    const [x, y] = edge(i, 12);
    const a = Math.atan2(ch / 2 - y, cw / 2 - x) + rnd(-0.5, 0.5);
    return { x0: x, y0: y, a, len: rnd(0.3, 0.55) * M, r: rnd(0.08, 0.12) * M, ph: rnd(0, TAU) };
  });
  sound.sfx('void', { pitch: 0.6, volume: 0.8 });
  const data = img.data;
  const balls: { x: number; y: number; rr: number }[] = [];
  await frames(1800, (p, sec) => {
    const grow = p < 0.42 ? easeInOut(p / 0.42) : p < 0.52 ? 1 : 1 - easeInOut((p - 0.52) / 0.48);
    balls.length = 0;
    for (const b of big) balls.push({ x: b.x, y: b.y, rr: (b.r * (0.12 + 0.88 * grow)) ** 2 });
    for (const f of fingers) {
      const reach = f.len * Math.min(1, grow * 1.25);
      for (let k = 1; k <= 3; k++) {
        const d = reach * (k / 3);
        const wob = Math.sin(sec * 3 + f.ph + k) * 0.18;
        balls.push({ x: f.x0 + Math.cos(f.a + wob) * d, y: f.y0 + Math.sin(f.a + wob) * d, rr: (f.r * (1.2 - k * 0.22) * (0.25 + 0.75 * grow)) ** 2 });
      }
    }
    const ox = sec * 1.6;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        let v = 0;
        for (const b of balls) {
          const dx = x - b.x;
          const dy = y - b.y;
          const q = (dx * dx + dy * dy) / b.rr;
          if (q < 1) v += (1 - q) * (1 - q);
        }
        v *= 0.82 + 0.4 * nAt(x * 0.3 + ox, y * 0.3 - ox * 0.6);
        const k = (y * cw + x) * 4;
        const a = smooth(0.2, 0.3, v);
        // 가장자리 띠에만 가늘게 보랏빛 윤기
        const rim = a * (1 - smooth(0.3, 0.42, v));
        data[k] = 5 + rim * 38;
        data[k + 1] = 3 + rim * 16;
        data[k + 2] = 9 + rim * 52;
        data[k + 3] = a * 244;
      }
    }
    sg.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(small, 0, 0, cv.width, cv.height);
  });
  cv.remove();
}

// ───────────── 손바닥 ─────────────

/** 손바닥 자국 하나 (SVG): 손바닥·엄지·네 손가락, 거친 가장자리와 군데군데 빈 얼룩 */
function handSvg(seed: number): string {
  const id = uid('hp');
  const r = seeded(seed);
  const R = (a: number, b: number) => a + r() * (b - a);
  const fingers = [
    { x: 30, len: R(30, 36), w: 11, a: -14 },
    { x: 44, len: R(38, 44), w: 12, a: -4 },
    { x: 58, len: R(36, 42), w: 12, a: 5 },
    { x: 71, len: R(28, 33), w: 10, a: 15 },
  ];
  const caps = fingers
    .map((f) => {
      const top = 46 - f.len;
      return `<g transform="rotate(${f.a} ${f.x} 48)"><rect x="${f.x - f.w / 2}" y="${top.toFixed(1)}" width="${f.w}" height="${(f.len + 6).toFixed(1)}" rx="${f.w / 2}"/><ellipse cx="${f.x}" cy="${(top + f.w * 0.55).toFixed(1)}" rx="${(f.w * 0.62).toFixed(1)}" ry="${(f.w * 0.72).toFixed(1)}"/></g>`;
    })
    .join('');
  return (
    `<svg viewBox="0 0 100 120" width="100%" height="100%" overflow="visible"><defs>` +
    `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed % 97}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.38" numOctaves="2" seed="${(seed * 7) % 97}" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.1 0 0 0 1.9" result="m"/>` +
    `<feComposite in="d" in2="m" operator="in"/>` +
    `</filter></defs>` +
    `<g filter="url(#${id})" fill="currentColor">` +
    `<path d="M24,52 C22,74 28,96 46,104 C62,110 78,100 80,82 C82,66 80,54 76,46 C66,42 36,42 24,52 Z"/>` +
    `<g transform="rotate(${R(-48, -38).toFixed(0)} 26 78)"><rect x="20" y="40" width="12" height="40" rx="6"/><ellipse cx="26" cy="44" rx="7" ry="8"/></g>` +
    caps +
    `</g></svg>`
  );
}

async function handprints(n: number) {
  n = clamp(n || 3, 1, 8);
  const wrap = div('cine-full');
  for (let i = 0; i < n; i++) {
    const size = rnd(100, 150);
    const h = div('cine-hand', wrap, { left: `${rnd(4, 70).toFixed(1)}%`, top: `${rnd(8, 66).toFixed(1)}%`, width: `${size.toFixed(0)}px`, height: `${(size * 1.2).toFixed(0)}px` });
    h.innerHTML = handSvg(Math.floor(rnd(1, 9999)));
    const rot = rnd(-35, 35);
    const flip = Math.random() < 0.5 ? -1 : 1;
    sound.sfx('thud', { pitch: rnd(0.8, 1.1) });
    stage.shake(5, 0.15);
    // 유리에 철썩 → 조금 미끄러져 내리며 번진다
    void anim(
      h,
      [
        { transform: `rotate(${rot.toFixed(1)}deg) scale(${1.7 * flip}, 1.7)`, opacity: 0 },
        { transform: `rotate(${rot.toFixed(1)}deg) scale(${flip}, 1)`, opacity: 0.9, offset: 0.12 },
        { transform: `rotate(${rot.toFixed(1)}deg) translateY(10px) scale(${flip}, 1.05)`, opacity: 0.85 },
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' },
    );
    await sleep(rnd(140, 260));
  }
  setTimeout(() => {
    void anim(wrap, [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(5px)' }], { duration: 1100, fill: 'forwards' }).then(() => wrap.remove());
  }, T(1500));
  await sleep(250);
}

// ───────────── 세상이 뒤집힌다 ─────────────

async function flip() {
  const body = document.body;
  sound.sfx('portal', { pitch: 0.8 });
  stage.splitPulse(1.2);
  // 한 번에 돌린다 (채워 두는 애니메이션을 남기지 않아 끝나면 저절로 제자리)
  await anim(
    body,
    [
      { transform: 'rotate(0deg) scale(1)', filter: 'blur(0px)', easing: 'cubic-bezier(.7,0,.3,1)' },
      { transform: 'rotate(90deg) scale(0.86)', filter: 'blur(1.5px)', offset: 0.15 },
      { transform: 'rotate(180deg) scale(1)', filter: 'blur(0px)', offset: 0.3 },
      { transform: 'rotate(180deg) scale(1)', filter: 'blur(0px)', offset: 0.68, easing: 'cubic-bezier(.7,0,.3,1)' },
      { transform: 'rotate(270deg) scale(0.86)', filter: 'blur(1.5px)', offset: 0.84 },
      { transform: 'rotate(360deg) scale(1)', filter: 'blur(0px)' },
    ],
    { duration: 1700 },
  );
}

async function timestop() {
  const body = document.body;
  const was = stage.battle.timeScale;
  body.classList.add('cine-gray');
  stage.battle.timeScale = 0.03;
  const clock = div('cine-clock');
  const id = uid('cf');
  const num = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * TAU - Math.PI / 2;
    const big = i % 5 === 0;
    const r0 = big ? 78 : 83;
    return `<line x1="${(100 + Math.cos(a) * r0).toFixed(1)}" y1="${(100 + Math.sin(a) * r0).toFixed(1)}" x2="${(100 + Math.cos(a) * 89).toFixed(1)}" y2="${(100 + Math.sin(a) * 89).toFixed(1)}" stroke="rgba(235,230,215,${big ? 0.85 : 0.4})" stroke-width="${big ? 2.4 : 1}"/>`;
  }).join('');
  const nums = num
    .map((s, i) => {
      const a = (i / 12) * TAU - Math.PI / 2;
      return `<text x="${(100 + Math.cos(a) * 66).toFixed(1)}" y="${(100 + Math.sin(a) * 66).toFixed(1)}">${s}</text>`;
    })
    .join('');
  clock.innerHTML =
    `<svg viewBox="0 0 200 200"><defs><radialGradient id="${id}"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".8" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></radialGradient></defs>` +
    `<circle cx="100" cy="100" r="96" fill="url(#${id})" stroke="rgba(235,230,215,.55)" stroke-width="2.5"/><circle cx="100" cy="100" r="91" fill="none" stroke="rgba(235,230,215,.25)" stroke-width="1"/>` +
    `${ticks}<g class="nums">${nums}</g>` +
    `<path d="M100,104 L96,100 L100,52 L104,100 Z" fill="rgba(240,235,220,.95)"/>` +
    `<path d="M100,106 L97.5,100 L100,26 L102.5,100 Z" fill="rgba(240,235,220,.8)"/>` +
    `<g class="s"><line x1="100" y1="116" x2="100" y2="20" stroke="rgba(255,80,60,.95)" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="100" r="3.5" fill="rgba(255,80,60,1)"/></g>` +
    `<circle cx="100" cy="100" r="2" fill="#222"/>` +
    `<path d="M40,45 A80,80 0 0 1 120,22" stroke="rgba(255,255,255,.22)" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    `</svg>`;
  const hand = clock.querySelector('.s') as SVGGElement;
  hand.style.transformOrigin = '100px 100px';
  void anim(clock, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 260, fill: 'forwards' });
  for (let i = 0; i < 4; i++) {
    // 초침이 한 칸 가려다 멈칫한다
    void anim(hand, [{ transform: `rotate(${i * 6}deg)` }, { transform: `rotate(${i * 6 + 7}deg)`, offset: 0.4 }, { transform: `rotate(${(i + 1) * 6}deg)` }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    sound.sfx('tick');
    await sleep(320);
  }
  // 다시 흐른다: 색이 물결처럼 돌아온다
  const ring = div('cine-ring', layer(), { left: '50%', top: '45%' });
  void anim(ring, [{ transform: 'translate(-50%,-50%) scale(0.1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(9)', opacity: 0 }], { duration: 700, easing: 'ease-out', fill: 'forwards' }).then(() => ring.remove());
  body.classList.remove('cine-gray');
  stage.battle.timeScale = was || speed();
  sound.sfx('reveal', { pitch: 0.8 });
  await anim(clock, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(0.6) rotate(-40deg)' }], { duration: 300, fill: 'forwards' });
  clock.remove();
}

async function blackhole(at: { x: number; y: number }) {
  const app = document.getElementById('app');
  const hole = div('cine-hole', layer(), { left: `${at.x}px`, top: `${at.y}px` });
  hole.innerHTML = '<i class="glow"></i><i class="disk"></i><i class="core"></i><i class="ring"></i>';
  // 빨려 들어가는 티끌
  const motes = div('cine-full', layer());
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, 360);
    const r0 = rnd(140, 420);
    const m = div('cine-mote', motes, { left: `${at.x}px`, top: `${at.y}px` });
    void anim(
      m,
      [
        { transform: `rotate(${a.toFixed(0)}deg) translateX(${r0.toFixed(0)}px) scale(1)`, opacity: 0 },
        { transform: `rotate(${(a + 120).toFixed(0)}deg) translateX(${(r0 * 0.45).toFixed(0)}px) scale(0.8)`, opacity: 1, offset: 0.5 },
        { transform: `rotate(${(a + 300).toFixed(0)}deg) translateX(4px) scale(0.2)`, opacity: 0 },
      ],
      { duration: rnd(800, 1300), delay: rnd(0, 300), easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' },
    );
  }
  sound.sfx('void', { pitch: 0.5 });
  stage.shockwave(at.x, at.y, { amplitude: -30, wavelength: 260, speed: 600, radius: 700, brightness: 0.75, dur: 1 });
  if (app) app.style.transformOrigin = `${at.x}px ${at.y}px`;
  // 화면(조작판)도 한 점으로 끌려갔다가 튕겨 돌아온다 — 한 번에 (끝나면 저절로 제자리)
  const pull = app
    ? anim(
        app,
        [
          { transform: 'scale(1) rotate(0deg)', filter: 'none', easing: 'ease-in' },
          { transform: 'scale(0.9) rotate(-3deg)', filter: 'blur(1px) brightness(0.7)', offset: 0.57 },
          { transform: 'scale(0.9) rotate(-3deg)', filter: 'blur(1px) brightness(0.7)', offset: 0.73, easing: 'cubic-bezier(.2,1.6,.4,1)' },
          { transform: 'scale(1) rotate(0deg)', filter: 'none' },
        ],
        { duration: 1570 },
      )
    : Promise.resolve();
  await anim(hole, [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1 }], {
    duration: 900,
    easing: 'ease-out',
    fill: 'forwards',
  });
  stage.flash(0x000000, 0.4);
  await sleep(250);
  await anim(hole, [{ transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
  await pull;
  if (app) app.style.transformOrigin = '';
  hole.remove();
  motes.remove();
}

/** 칠성장어 같은 둥근 아가리 (SVG): 검붉은 목구멍, 잇몸 고리, 안쪽으로 휜 송곳니 두 겹 */
function mawSvg(): string {
  const id = uid('maw');
  const tooth = (a: number, r0: number, r1: number, w: number, bend: number) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bx = ca * r0;
    const by = sa * r0;
    const px = -sa * w;
    const py = ca * w;
    const tx = Math.cos(a + bend) * r1;
    const ty = Math.sin(a + bend) * r1;
    const mx = Math.cos(a + bend * 0.4) * ((r0 + r1) / 2);
    const my = Math.sin(a + bend * 0.4) * ((r0 + r1) / 2);
    return `<path d="M${(bx + px).toFixed(1)},${(by + py).toFixed(1)} Q${(mx + px * 0.5).toFixed(1)},${(my + py * 0.5).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} Q${(mx - px * 0.5).toFixed(1)},${(my - py * 0.5).toFixed(1)} ${(bx - px).toFixed(1)},${(by - py).toFixed(1)} Z" fill="url(#${id}t)" stroke="rgba(40,0,0,.7)" stroke-width=".8"/>`;
  };
  const outer = Array.from({ length: 14 }, (_, i) => tooth((i / 14) * TAU + rnd(-0.05, 0.05), 49, rnd(22, 28), rnd(5, 7), 0.12)).join('');
  const inner = Array.from({ length: 11 }, (_, i) => tooth((i / 11) * TAU + 0.2, 30, rnd(10, 14), rnd(3.5, 4.5), 0.18)).join('');
  return (
    `<svg viewBox="-64 -64 128 128" width="100%" height="100%"><defs>` +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="#000"/><stop offset=".45" stop-color="#1a0004"/><stop offset=".72" stop-color="#5a0a14"/><stop offset=".86" stop-color="#8a1c28"/><stop offset="1" stop-color="#2a0208" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset=".6" stop-color="#e2d4b2"/><stop offset="1" stop-color="#9a8058"/></linearGradient>` +
    `</defs>` +
    `<circle r="62" fill="url(#${id}g)"/>` +
    `<circle r="50" fill="none" stroke="rgba(170,40,56,.55)" stroke-width="5"/>` +
    `<g class="row-o">${outer}</g><g class="row-i">${inner}</g>` +
    `<circle r="9" fill="#000" opacity=".9"/>` +
    `</svg>`
  );
}

/** 화면 네 모서리에서 아가리가 튀어나와 문다 (틴달로스의 사냥개는 각도에서 온다) */
async function corners() {
  const wrap = div('cine-full');
  const jaws: Promise<void>[] = [];
  const spots = [
    { left: '0', top: '0' },
    { left: '100%', top: '0' },
    { left: '100%', top: '100%' },
    { left: '0', top: '100%' },
  ];
  sound.sfx('slash', { pitch: 0.6 });
  for (const [i, sp] of spots.entries()) {
    const j = div('cine-maw', wrap, { left: sp.left, top: sp.top });
    j.innerHTML = mawSvg();
    const spin = rnd(-30, 30);
    const o = j.querySelector('.row-o') as SVGGElement;
    const n = j.querySelector('.row-i') as SVGGElement;
    // 잇몸이 조여들며 이빨 두 겹이 서로 반대로 돈다
    void anim(o, [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(14deg) scale(0.86)', offset: 0.55 }, { transform: 'rotate(6deg) scale(1)' }], { duration: 1200, delay: i * 70, easing: 'ease-in-out' });
    void anim(n, [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-22deg) scale(0.8)', offset: 0.55 }, { transform: 'rotate(-8deg) scale(1)' }], { duration: 1200, delay: i * 70, easing: 'ease-in-out' });
    jaws.push(
      anim(
        j,
        [
          { transform: `translate(-50%,-50%) rotate(${spin.toFixed(0)}deg) scale(0.2)`, opacity: 0, easing: 'cubic-bezier(.3,1.5,.5,1)' },
          { transform: `translate(-50%,-50%) rotate(${(spin + 18).toFixed(0)}deg) scale(1.1)`, opacity: 1, offset: 0.35, easing: 'ease-in' },
          { transform: `translate(-50%,-50%) rotate(${(spin + 8).toFixed(0)}deg) scale(0.78)`, opacity: 1, offset: 0.58, easing: 'ease-in' },
          { transform: `translate(-50%,-50%) rotate(${spin.toFixed(0)}deg) scale(0.2)`, opacity: 0 },
        ],
        { duration: 1200, delay: i * 70, fill: 'forwards' },
      ),
    );
  }
  setTimeout(() => {
    sound.sfx('break', { pitch: 0.7 });
    stage.shake(10, 0.3);
    stage.vignette('blood', 0.4, 600);
  }, T(560));
  await Promise.all(jaws);
  wrap.remove();
}

/** 물결이 화면 아래에서 밀려들었다가 남은 물 높이로 빠진다 (water.ts) */
async function water(n: number) {
  sound.sfx('wave', { volume: 0.9 });
  await surge(layer(), n, {
    onPeak() {
      stage.shake(5 + n * 3, 0.45);
      stage.vignette('ink', 0.3 + n * 0.08, 900);
    },
  });
}

async function bell(at: { x: number; y: number }) {
  const app = document.getElementById('app');
  sound.sfx('bell');
  stage.shockwave(at.x, at.y, { amplitude: 24, wavelength: 180, speed: 900, radius: 900, brightness: 1.1, dur: 0.8 });
  for (let i = 0; i < 4; i++) {
    const r = div('cine-ring gold', layer(), { left: `${at.x}px`, top: `${at.y}px` });
    void anim(r, [{ transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(12)', opacity: 0 }], { duration: 1100, delay: i * 170, easing: 'ease-out', fill: 'forwards' }).then(() => r.remove());
  }
  // 종소리에 천장의 먼지가 떨어진다
  const dust = div('cine-full', layer());
  for (let i = 0; i < 26; i++) {
    const d = div('cine-dust', dust, { left: `${rnd(0, 100).toFixed(1)}%`, top: `${rnd(-4, 10).toFixed(1)}%`, width: `${rnd(1.5, 3.5).toFixed(1)}px`, height: `${rnd(1.5, 3.5).toFixed(1)}px` });
    void anim(d, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: rnd(0.5, 0.9), offset: 0.15 }, { transform: `translate(${rnd(-30, 30).toFixed(0)}px,${rnd(160, 380).toFixed(0)}px)`, opacity: 0 }], {
      duration: rnd(1200, 2000),
      delay: rnd(0, 400),
      easing: 'cubic-bezier(.4,0,.8,.6)',
      fill: 'forwards',
    });
  }
  setTimeout(() => dust.remove(), T(2500));
  if (app)
    void anim(
      app,
      Array.from({ length: 10 }, (_, k) => ({ transform: `translate(${k % 2 ? 3 : -3}px, ${k % 3 ? 1 : -1}px)` })).concat([{ transform: 'translate(0,0)' }]),
      { duration: 700, easing: 'linear' },
    );
  await sleep(700);
}

async function beam(at: { x: number; y: number }) {
  const b = div('cine-beam', layer(), { left: `${at.x}px`, top: `${at.y}px` });
  b.innerHTML = '<i class="glow"></i><i class="core"></i>';
  const flare = div('cine-flare', layer(), { left: `${at.x}px`, top: `${at.y}px` });
  void anim(flare, [{ transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }], {
    duration: 1200,
    easing: 'ease-out',
    fill: 'forwards',
  }).then(() => flare.remove());
  sound.sfx('charge', { pitch: 1.3, volume: 0.7 });
  const sweep = anim(
    b,
    [
      { transform: 'translate(0,-50%) rotate(-70deg)', opacity: 0 },
      { transform: 'translate(0,-50%) rotate(-10deg)', opacity: 1, offset: 0.25 },
      { transform: 'translate(0,-50%) rotate(80deg)', opacity: 1, offset: 0.85 },
      { transform: 'translate(0,-50%) rotate(110deg)', opacity: 0 },
    ],
    { duration: 1200, easing: 'ease-in-out', fill: 'forwards' },
  );
  setTimeout(() => {
    stage.flash(0xfff2c0, 0.45);
    sound.sfx('reveal', { pitch: 1.4 });
    const white = div('cine-full cine-white');
    void anim(white, [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0 }], { duration: 650, fill: 'forwards' }).then(() => white.remove());
  }, T(480));
  await sweep;
  b.remove();
}

/** 벌레 떼: 캔버스에 수십 마리가 다리를 놀리며 굽이쳐 지나간다 */
async function swarm() {
  const { cv, g, s } = canvasLayer(1);
  const W = innerWidth;
  const H = innerHeight;
  sound.sfx('debuff', { pitch: 0.6 });
  setTimeout(() => sound.sfx('debuff', { pitch: 0.5 }), T(500));
  const bugs = Array.from({ length: 70 }, (_, i) => {
    const left = i % 2 === 0;
    return { left, y0: rnd(-0.05, 1.05) * H, v: rnd(260, 460), amp: rnd(14, 60), f: rnd(2, 5), ph: rnd(0, TAU), size: rnd(6, 12), delay: rnd(0, 0.55), drift: rnd(-80, 80) };
  });
  const run = frames(1900, (_p, sec) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    for (const b of bugs) {
      const t = sec - b.delay;
      if (t < 0) continue;
      const dx = b.v * t;
      const x = b.left ? -30 + dx : W + 30 - dx;
      if (x < -60 || x > W + 60) continue;
      const y = b.y0 + Math.sin(t * b.f + b.ph) * b.amp + b.drift * t;
      const vy = Math.cos(t * b.f + b.ph) * b.amp * b.f + b.drift;
      const ang = Math.atan2(vy, b.left ? b.v : -b.v);
      const L = b.size;
      g.setTransform(s, 0, 0, s, 0, 0);
      g.translate(x, y);
      g.rotate(ang);
      // 다리 (번갈아 움직인다)
      g.strokeStyle = 'rgba(20,12,6,.85)';
      g.lineWidth = 0.9;
      const step = Math.sin(t * 38 + b.ph);
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        const lx = k * L * 0.32;
        const sw = (k % 2 === 0 ? step : -step) * L * 0.18;
        g.moveTo(lx, 0);
        g.lineTo(lx + sw, -L * 0.55);
        g.moveTo(lx, 0);
        g.lineTo(lx - sw, L * 0.55);
      }
      g.moveTo(L * 0.62, 0);
      g.lineTo(L * 0.95, -L * 0.3);
      g.moveTo(L * 0.62, 0);
      g.lineTo(L * 0.95, L * 0.3);
      g.stroke();
      // 몸통 (윤기)
      const body = g.createLinearGradient(0, -L * 0.3, 0, L * 0.3);
      body.addColorStop(0, '#3a2a14');
      body.addColorStop(0.4, '#120a04');
      body.addColorStop(1, '#050302');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(-L * 0.08, 0, L * 0.5, L * 0.3, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.ellipse(L * 0.5, 0, L * 0.17, L * 0.15, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(160,200,120,.35)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(-L * 0.5, 0);
      g.lineTo(L * 0.38, 0);
      g.stroke();
    }
  });
  await sleep(700);
  void run.then(() => cv.remove());
}

/** 만화식 임팩트 프레임: 순간 색이 뒤집히고, 맞은 곳으로 모이는 집중선 (가운데로 갈수록 옅어진다) */
export async function impact(at: { x: number; y: number }, strong = 1) {
  const wrap = div('cine-full');
  const inv = div('cine-full cine-invert', wrap);
  const lines = svgNS('svg', { width: innerWidth, height: innerHeight, class: 'cine-full' });
  const id = uid('im');
  const R = Math.hypot(innerWidth, innerHeight);
  const defs = svgNS('defs', {}, lines);
  const grad = svgNS('radialGradient', { id, cx: at.x.toFixed(1), cy: at.y.toFixed(1), r: R.toFixed(0), gradientUnits: 'userSpaceOnUse' }, defs);
  svgNS('stop', { offset: '0', 'stop-color': '#1a0505', 'stop-opacity': '0' }, grad);
  svgNS('stop', { offset: '0.22', 'stop-color': '#1a0505', 'stop-opacity': '0.55' }, grad);
  svgNS('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.95' }, grad);
  const g = svgNS('g', { fill: `url(#${id})` }, lines);
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * TAU + rnd(-0.05, 0.05);
    const w = rnd(0.006, 0.028);
    const r0 = rnd(70, 170) * strong;
    const p = (ang: number, r: number) => `${(at.x + Math.cos(ang) * r).toFixed(1)},${(at.y + Math.sin(ang) * r).toFixed(1)}`;
    svgNS('polygon', { points: `${p(a - w, R)} ${p(a + w, R)} ${p(a, r0)}` }, g);
  }
  wrap.appendChild(lines);
  const burst = div('cine-burst', wrap, { left: `${at.x}px`, top: `${at.y}px` });
  void anim(burst, [{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
  const was = stage.battle.timeScale;
  stage.battle.timeScale = 0.02;
  await sleep(60);
  inv.remove();
  await sleep(80 + strong * 40);
  stage.battle.timeScale = was || speed();
  void anim(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 170, fill: 'forwards' }).then(() => wrap.remove());
}

// ───────────── 컷인 · 등장 ─────────────

/** 수호자 등장: 위아래 검은 띠 + 이름 (빛이 한 번 훑고 지나간다) */
export async function bossIntro(o: { name: string; sub: string; at: { x: number; y: number } }) {
  const top = div('cine-bar top');
  const bottom = div('cine-bar bottom');
  const title = div('cine-intro');
  title.innerHTML = `<div class="cine-intro-sub"></div><div class="cine-intro-name"></div><div class="cine-intro-line"></div>`;
  (title.querySelector('.cine-intro-sub') as HTMLElement).textContent = o.sub;
  const nameEl = title.querySelector('.cine-intro-name') as HTMLElement;
  for (const ch of o.name) {
    const s = document.createElement('span');
    s.textContent = ch;
    nameEl.appendChild(s);
  }
  sound.sfx('sting');
  stage.punch(o.at.x, o.at.y, 0.06, 0.6);
  await Promise.all([
    anim(top, [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' }),
    anim(bottom, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' }),
  ]);
  void anim(title.querySelector('.cine-intro-sub')!, [{ opacity: 0, letterSpacing: '0.1em' }, { opacity: 1, letterSpacing: '0.5em' }], { duration: 700, fill: 'forwards' });
  Array.from(nameEl.children).forEach(
    (s, i) => void anim(s, [{ opacity: 0, transform: 'scale(1.8)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 320, delay: 120 + i * 70, easing: 'ease-out', fill: 'forwards' }),
  );
  void anim(title.querySelector('.cine-intro-line')!, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, delay: 200, easing: 'ease-out', fill: 'forwards' });
  // 글자를 훑는 빛
  setTimeout(() => nameEl.classList.add('glint'), T(260 + o.name.length * 70));
  await sleep(1500 + o.name.length * 50);
  await anim(title, [{ opacity: 1 }, { opacity: 0, filter: 'blur(4px)' }], { duration: 300, fill: 'forwards' });
  await Promise.all([
    anim(top, [{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
    anim(bottom, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
  ]);
  top.remove();
  bottom.remove();
  title.remove();
}

/** 즉사: 시간이 멎고 화면이 깨지며 기술 이름이 새겨진다. 심전도가 두 번 뛰고 일자로 눕는다, 그리고 어둠 */
async function executeFx(name: string, at: { x: number; y: number }) {
  const was = stage.battle.timeScale;
  stage.battle.timeScale = 0.02;
  stage.flash(0xff0010, 0.6);
  sound.sfx('heartbeat');
  void crack(3, at, true);
  const W = innerWidth;
  const H = innerHeight;
  const wrap = div('cine-full cine-exec');
  // 심전도: 두 번 뛰고 일자
  const y0 = Math.round(H * 0.66);
  const beat = (x: number) => `L${x},${y0} L${x + 8},${y0 - 6} L${x + 14},${y0 + 4} L${x + 20},${y0 - 46} L${x + 27},${y0 + 30} L${x + 34},${y0 - 8} L${x + 42},${y0}`;
  const b1 = Math.round(W * 0.16);
  const b2 = Math.round(W * 0.44);
  const ecg = `M0,${y0} ${beat(b1)} ${beat(b2)} L${W},${y0}`;
  wrap.innerHTML =
    `<svg class="cine-full cine-ecg" viewBox="0 0 ${W} ${H}"><path d="${ecg}" pathLength="1000"/></svg>` +
    `<div class="cine-exec-in"><span class="ic" style="width:72px;height:72px;color:#ff2a3a">${iconSvg('gi:death-skull')}</span><div class="cine-exec-name"></div><div class="cine-exec-sub">즉사</div></div>`;
  (wrap.querySelector('.cine-exec-name') as HTMLElement).textContent = name;
  const line = wrap.querySelector('.cine-ecg path') as SVGPathElement;
  void anim(line, [{ strokeDashoffset: 1000 }, { strokeDashoffset: 0 }], { duration: 1500, easing: 'linear', fill: 'forwards' });
  await anim(wrap.querySelector('.cine-exec-in')!, [{ opacity: 0, transform: 'scale(1.6)', filter: 'blur(10px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], {
    duration: 380,
    easing: 'ease-out',
    fill: 'forwards',
  });
  sound.sfx('heartbeat', { volume: 0.7 });
  await sleep(700);
  sound.sfx('flatline');
  document.body.classList.add('cine-gray');
  await sleep(900);
  const black = div('cine-full cine-black');
  await anim(black, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, fill: 'forwards' });
  document.body.classList.remove('cine-gray');
  stage.battle.timeScale = was || speed();
  wrap.remove();
  setTimeout(() => void anim(black, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' }).then(() => black.remove()), T(1400));
}

/** 수호자를 쓰러뜨린 순간: 느려지는 시간 + 임팩트 + 금빛 글자 (빛줄기가 가로로 스친다) */
export async function bossFall(at: { x: number; y: number }) {
  const was = stage.battle.timeScale;
  stage.battle.timeScale = 0.25;
  await impact(at, 1.6);
  stage.flash(0xffffff, 0.55);
  sound.sfx('victoryHit');
  const streak = div('cine-streak', layer(), { top: '36%' });
  void anim(streak, [{ transform: 'translateY(-50%) scaleX(0)', opacity: 1 }, { transform: 'translateY(-50%) scaleX(1)', opacity: 1, offset: 0.4 }, { transform: 'translateY(-50%) scaleX(1.1)', opacity: 0 }], {
    duration: 900,
    easing: 'ease-out',
    fill: 'forwards',
  }).then(() => streak.remove());
  const t = div('cine-fall');
  t.textContent = '격파';
  await anim(t, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)', letterSpacing: '0.1em' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', letterSpacing: '0.6em' }], {
    duration: 380,
    easing: 'ease-out',
    fill: 'forwards',
  });
  await sleep(700);
  stage.battle.timeScale = was || speed();
  await anim(t, [{ opacity: 1 }, { opacity: 0, filter: 'blur(6px)' }], { duration: 400, fill: 'forwards' });
  t.remove();
}

// ───────────── 차례로 부르기 ─────────────

/** 연출 하나를 튼다 (막는 부분이 끝나면 돌아온다) */
export async function playCine(name: CineName, o: { uid?: string; text?: string; n?: number } = {}): Promise<void> {
  const at = cineCenter(o.uid);
  try {
    switch (name) {
      case 'crack':
        return await crack(o.n ?? 1, at);
      case 'shatter':
        sound.sfx('glass', { pitch: 0.8 });
        sound.sfx('break', { pitch: 0.7 });
        return await stage.shatter(at, 1 / speed());
      case 'glitch':
        return await glitch(o.n ?? 1);
      case 'fakeover':
        return await fakeover();
      case 'eye':
        return await eye(o.n ?? 1);
      case 'ink':
        return await ink();
      case 'scrawl':
        return await scrawl(o.text ?? '');
      case 'handprints':
        return await handprints(o.n ?? 3);
      case 'flip':
        return await flip();
      case 'timestop':
        return await timestop();
      case 'blackhole':
        return await blackhole(at);
      case 'corners':
        return await corners();
      case 'water':
        return await water(o.n ?? 2);
      case 'bell':
        return await bell(at);
      case 'beam':
        return await beam(at);
      case 'swarm':
        return await swarm();
      case 'impact':
        return await impact(at, Math.max(1, o.n ?? 1));
      case 'execute':
        return await executeFx(o.text ?? '즉사', at);
    }
  } catch (err) {
    // 연출이 실패해도 게임은 계속된다
    console.warn('연출 실패', name, err);
  }
}

// ───────────── 전투 내내 남는 화면 상태 (vars 'ui:*') ─────────────

/** 같은 글자는 늘 같은 모양으로 뒤섞는다 (다시 그려도 깜빡이지 않게) */
export function garbleStable(s: string): string {
  let h = 2166136261;
  let out = '';
  for (const ch of s) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += /\s/.test(ch) ? ch : h % 4 === 0 ? ch : GLYPHS[h % GLYPHS.length];
  }
  return out;
}

/** 화면 가장자리에 부딪힌 자리에서 들어온 금 (단계 1~3) — 전투 내내 남는다. 같은 단계는 늘 같은 모양 */
export function staticCracks(level: number): string {
  const W = innerWidth;
  const H = innerHeight;
  const spots = [
    { x: -W * 0.02, y: H * 0.1 },
    { x: W * 1.02, y: H * 0.56 },
    { x: W * 0.18, y: H * 1.01 },
  ].slice(0, clamp(level, 1, 3));
  return glassSvg(
    W,
    H,
    spots.map((s) => ({ ...s, n: 1 })),
    seeded(7 + level),
  );
}

/** 배경에서 지켜보는 눈을 붙인다 (가끔 깜빡이고 손끝을 따라본다). 돌려준 함수로 뗀다 */
export function mountWatcher(host: HTMLElement): () => void {
  const rig = eyeSvg(Math.min(innerWidth * 0.66, 300));
  host.appendChild(rig.svg);
  void lids(rig, 0, 1, 1200);
  const stop = follow(rig, host);
  const blink = setInterval(() => {
    void lids(rig, 1, 0.04, 120).then(() => lids(rig, 0.04, 1, 160));
  }, 4200);
  return () => {
    clearInterval(blink);
    stop();
    rig.svg.remove();
  };
}
