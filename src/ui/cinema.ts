import ICONS from 'virtual:icons';
import { ORIGINS } from '../engine/registry';
import type { CineName } from '../engine/types';
import { stage } from '../render/stage';
import { artUrl, hasArt } from '../render/textures';
import { sound } from '../sound';
import { store } from '../state/store';

/**
 * 화면 연출 (제4의 벽 등): 적의 행동이 화면 전체에 일으키는 일. 게임 규칙과는 무관하다.
 * DOM 위에 덧씌우는 막(#cine)과 Pixi 무대(stage)를 함께 쓴다. 모든 함수는 "막아야 하는 부분"이 끝나면 돌아오고,
 * 잔상(금 간 유리 등)은 뒤에서 혼자 사라진다.
 */

const speed = () => store.meta.speed ?? 1;
const T = (ms: number) => ms / speed();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, T(ms)));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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

/** 연출의 중심: 적이면 그 몸 가운데, 아니면 화면 위쪽 가운데 */
export function cineCenter(uid?: string): { x: number; y: number } {
  const a = uid && uid !== 'p' ? stage.battle.anchor(uid) : null;
  if (a) return { x: a.x, y: a.y - a.size * 0.55 };
  return { x: innerWidth / 2, y: innerHeight * 0.32 };
}

// ───────────── 글자 속 진짜 세계 ({time} 등) ─────────────

function timeWords(d = new Date()): { time: string; hour: string } {
  const h = d.getHours();
  const part = h < 5 ? '새벽' : h < 7 ? '이른 아침' : h < 12 ? '아침' : h < 18 ? '오후' : h < 21 ? '저녁' : '밤';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: `${part} ${h12}시`, time: `${part} ${h12}시 ${d.getMinutes()}분` };
}

/** {time} {hour} {deaths} {runs} {wins} {best} {origin} → 진짜 시각·기록 */
export function realWorld(text: string): string {
  const m = store.meta;
  const t = timeWords();
  const runs = m.runs ?? 0;
  const wins = m.wins ?? 0;
  const map: Record<string, string> = {
    time: t.time,
    hour: t.hour,
    deaths: String(Math.max(0, runs - wins)),
    runs: String(runs),
    wins: String(wins),
    best: String(m.bestAct ?? 1),
    origin: ORIGINS.get(store.run?.origin ?? '')?.name ?? '당신',
  };
  return text.replace(/\{(\w+)\}/g, (all, k: string) => map[k] ?? all);
}

// ───────────── 화면 유리 ─────────────

/** 한 점에서 뻗는 금 (가지 포함). 반환: SVG */
function crackSvg(at: { x: number; y: number }, n: number): SVGSVGElement {
  const W = innerWidth;
  const H = innerHeight;
  const svg = svgNS('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'cine-full' });
  const lines: string[] = [];
  const rays = 5 + n * 4;
  const reach = Math.hypot(W, H) * (0.32 + n * 0.16);
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    let cx = x;
    let cy = y;
    let a = ang;
    let left = len;
    while (left > 0) {
      const step = rnd(18, 42);
      a += rnd(-0.32, 0.32);
      cx += Math.cos(a) * step;
      cy += Math.sin(a) * step;
      pts.push([cx, cy]);
      left -= step;
      if (depth < 2 && Math.random() < 0.16) branch(cx, cy, a + (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 0.9), left * rnd(0.3, 0.6), depth + 1);
    }
    lines.push(pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
  };
  const ends: [number, number][] = [];
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + rnd(-0.25, 0.25);
    branch(at.x, at.y, ang, reach * rnd(0.45, 1), 0);
    ends.push([ang, rnd(26, 70)]);
  }
  // 충격점 둘레의 고리 금
  for (let ring = 0; ring < 1 + n; ring++) {
    const r0 = rnd(22, 40) + ring * rnd(40, 70);
    const pts: string[] = [];
    for (let k = 0; k <= 22; k++) {
      if (Math.random() < 0.12 && pts.length > 1) {
        lines.push(pts.join(' '));
        pts.length = 0;
      }
      const a = (k / 22) * Math.PI * 2;
      const r = r0 + rnd(-6, 6);
      pts.push(`${(at.x + Math.cos(a) * r).toFixed(1)},${(at.y + Math.sin(a) * r).toFixed(1)}`);
    }
    if (pts.length > 1) lines.push(pts.join(' '));
  }
  const g = svgNS('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  for (const pts of lines) {
    svgNS('polyline', { points: pts, stroke: 'rgba(0,0,0,0.55)', 'stroke-width': 3.2 }, g);
    svgNS('polyline', { points: pts, stroke: 'rgba(235,245,255,0.9)', 'stroke-width': 1.2, class: 'cine-crack-line' }, g);
  }
  return svg;
}

async function crack(n: number, at: { x: number; y: number }, linger = true) {
  n = Math.max(1, Math.min(3, n));
  const wrap = div('cine-full');
  const svg = crackSvg(at, n);
  wrap.appendChild(svg);
  const flash = div('cine-flash', wrap, { left: `${at.x}px`, top: `${at.y}px` });
  void anim(flash, [{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  for (const pl of Array.from(svg.querySelectorAll('polyline'))) {
    const len = (pl as SVGPolylineElement).getTotalLength?.() ?? 400;
    pl.setAttribute('stroke-dasharray', `${len}`);
    pl.setAttribute('stroke-dashoffset', `${len}`);
    void anim(pl, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: rnd(90, 190), delay: rnd(0, 60), easing: 'ease-out', fill: 'forwards' });
  }
  sound.sfx('glass', { pitch: 1.1 - n * 0.1 });
  stage.shake(8 + n * 4, 0.35);
  stage.punch(at.x, at.y, 0.03 + n * 0.008, 0.28);
  // 떨어지는 유리 조각
  for (let i = 0; i < 6 + n * 5; i++) {
    const s = div('cine-shard', wrap, { left: `${at.x + rnd(-60, 60)}px`, top: `${at.y + rnd(-40, 40)}px`, width: `${rnd(4, 11)}px`, height: `${rnd(6, 16)}px` });
    void anim(s, [{ transform: `translate(0,0) rotate(0deg)`, opacity: 0.9 }, { transform: `translate(${rnd(-80, 80)}px,${rnd(160, 360)}px) rotate(${rnd(-300, 300)}deg)`, opacity: 0 }], { duration: rnd(700, 1200), easing: 'cubic-bezier(.3,.1,.7,1)', fill: 'forwards' });
  }
  const hold = linger ? 1600 + n * 900 : 500;
  setTimeout(() => {
    void anim(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' }).then(() => wrap.remove());
  }, T(hold));
  await sleep(320);
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

async function glitch(n: number) {
  n = Math.max(1, Math.min(3, n));
  const dur = 650 + n * 220;
  document.body.classList.add('cine-glitching');
  const wrap = div('cine-full cine-glitch');
  for (let i = 0; i < 6 + n * 4; i++) {
    const bar = div('cine-slice', wrap, {
      top: `${rnd(0, 96)}%`,
      height: `${rnd(0.6, 7)}%`,
      background: ['#0ff', '#f0f', '#fff', '#ff2a4a', '#2aff9a'][Math.floor(rnd(0, 5))],
    });
    void anim(
      bar,
      [
        { transform: `translateX(${rnd(-30, 30)}%)`, opacity: 0 },
        { transform: `translateX(${rnd(-8, 8)}%)`, opacity: rnd(0.35, 0.8), offset: 0.15 },
        { transform: `translateX(${rnd(-40, 40)}%)`, opacity: 0, offset: 0.4 },
        { transform: `translateX(${rnd(-10, 10)}%)`, opacity: rnd(0.3, 0.7), offset: 0.7 },
        { transform: `translateX(${rnd(-30, 30)}%)`, opacity: 0 },
      ],
      { duration: dur, delay: rnd(0, 200), easing: 'steps(6)' },
    );
  }
  scrambleText(dur * 0.85);
  sound.sfx('glitch');
  setTimeout(() => sound.sfx('glitch', { pitch: 0.7 }), T(dur * 0.45));
  stage.splitPulse(1.4 + n * 0.5);
  stage.shake(4 + n * 2, 0.25);
  await sleep(dur);
  document.body.classList.remove('cine-glitching');
  wrap.remove();
}

// ───────────── 화면 너머의 당신에게 ─────────────

/**
 * 글자를 한 자씩 펼칠 수 있게 나누되, 낱말은 줄바꿈에 쪼개지지 않게 묶는다 (한국어 "볼/까" 방지).
 * 돌려주는 순서대로 펼치면 된다 (ch가 공백이나 줄바꿈이면 el 없음)
 */
function letterSpans(box: HTMLElement, line: string, prep?: (s: HTMLSpanElement, ch: string) => void): { el?: HTMLSpanElement; ch: string }[] {
  const out: { el?: HTMLSpanElement; ch: string }[] = [];
  let word: HTMLSpanElement | null = null;
  for (const ch of line) {
    if (ch === '\n') {
      word = null;
      box.appendChild(document.createElement('br'));
      out.push({ ch });
      continue;
    }
    if (ch === ' ') {
      word = null;
      box.appendChild(document.createTextNode(' '));
      out.push({ ch });
      continue;
    }
    if (!word) {
      word = document.createElement('span');
      word.className = 'cine-word';
      box.appendChild(word);
    }
    const s = document.createElement('span');
    s.textContent = ch;
    prep?.(s, ch);
    word.appendChild(s);
    out.push({ el: s, ch });
  }
  return out;
}

async function whisper(text: string) {
  const line = realWorld(text || '……');
  const veil = div('cine-full cine-veil');
  void anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'forwards' });
  const box = div('cine-whisper', veil);
  sound.sfx('whisper', { volume: 0.9 });
  const letters = letterSpans(box, line, (s) => (s.style.transform = `translate(${rnd(-2, 2)}px,${rnd(-3, 3)}px) rotate(${rnd(-4, 4)}deg)`));
  const spans: HTMLSpanElement[] = [];
  for (const { el, ch } of letters) {
    if (!el) {
      await sleep(ch === '\n' ? 220 : 25);
      continue;
    }
    spans.push(el);
    void anim(el, [{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 220, fill: 'forwards' });
    await sleep(ch === '.' || ch === ',' || ch === '…' ? 160 : 58);
  }
  sound.sfx('heartbeat', { volume: 0.6 });
  await sleep(900 + Math.min(1200, line.length * 18));
  await Promise.all([
    ...spans.map((s) => anim(s, [{ opacity: 1, transform: s.style.transform }, { opacity: 0, transform: `translate(${rnd(-20, 20)}px,${rnd(-40, 30)}px) rotate(${rnd(-30, 30)}deg)`, filter: 'blur(8px)' }], { duration: rnd(380, 700), fill: 'forwards' })),
    anim(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: 120, fill: 'forwards' }),
  ]);
  veil.remove();
}

async function sysmsg(text: string) {
  const veil = div('cine-full cine-sysveil');
  const box = div('cine-sys', veil);
  const title = div('cine-sys-title', box);
  title.textContent = '심연행';
  const msg = div('cine-sys-msg', box);
  msg.textContent = realWorld(text || '응답하지 않습니다.');
  const btns = div('cine-sys-btns', box);
  const no = div('cine-sys-btn', btns);
  no.textContent = '취소';
  const yes = div('cine-sys-btn strong', btns);
  yes.textContent = '확인';
  sound.sfx('error', { volume: 0.7 });
  await anim(box, [{ transform: 'scale(1.15)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
  await sleep(1500 + Math.min(1500, msg.textContent.length * 25));
  // 누가 대신 누른다
  yes.classList.add('pressed');
  sound.sfx('click');
  await sleep(220);
  title.textContent = garble('심연행');
  msg.textContent = garble(msg.textContent ?? '');
  sound.sfx('glitch');
  stage.splitPulse(1.6);
  await anim(box, [{ transform: 'scale(1) skewX(0deg)', opacity: 1, filter: 'none' }, { transform: 'scale(1.02,0.2) skewX(20deg)', opacity: 0, filter: 'blur(4px) hue-rotate(90deg)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  veil.remove();
}

async function fakeover(text: string) {
  const over = div('cine-full cine-over');
  over.innerHTML = `<div class="cine-over-in"><span class="ic" style="width:64px;height:64px;color:#c8423a">${iconSvg('gi:tombstone')}</span><div class="cine-over-title">심연에 잠들다</div><div class="cine-over-sub">${realWorld('{origin}의 여정이 끝났다 · {time}')}</div></div>`;
  sound.sfx('heartbeat');
  await anim(over, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'forwards' });
  await sleep(1500);
  sound.sfx('heartbeat', { volume: 0.5 });
  await sleep(500);
  // 화면이 깨지며 돌아온다
  await crack(3, { x: innerWidth * 0.5, y: innerHeight * 0.42 }, false);
  const top = div('cine-over-half top', layer());
  const bottom = div('cine-over-half bottom', layer());
  over.remove();
  stage.flash(0xffffff, 0.5);
  sound.sfx('breakdown');
  await Promise.all([
    anim(top, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-110%) rotate(-6deg)' }], { duration: 650, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }),
    anim(bottom, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(110%) rotate(5deg)' }], { duration: 650, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }),
  ]);
  top.remove();
  bottom.remove();
  await whisper(text || '아직이다.');
}

// ───────────── 지켜보는 눈 ─────────────

let lastPointer = { x: innerWidth / 2, y: innerHeight * 0.6 };
if (typeof window !== 'undefined') {
  const keep = (e: PointerEvent) => (lastPointer = { x: e.clientX, y: e.clientY });
  window.addEventListener('pointerdown', keep, { passive: true });
  window.addEventListener('pointermove', keep, { passive: true });
}

/** 눈 그림 (흰자·핏줄·홍채·동공·눈꺼풀) — 홍채를 움직일 수 있게 g를 돌려준다 */
function eyeSvg(w: number): { svg: SVGSVGElement; iris: SVGGElement; lidTop: SVGPathElement; lidBottom: SVGPathElement } {
  const h = w * 0.5;
  const svg = svgNS('svg', { width: w, height: h, viewBox: `0 0 200 100` });
  const defs = svgNS('defs', {}, svg);
  const sclera = svgNS('radialGradient', { id: 'cine-sclera', cx: '50%', cy: '45%', r: '60%' }, defs);
  svgNS('stop', { offset: '0%', 'stop-color': '#f4ecdc' }, sclera);
  svgNS('stop', { offset: '70%', 'stop-color': '#d8c8b0' }, sclera);
  svgNS('stop', { offset: '100%', 'stop-color': '#7a3a30' }, sclera);
  const irisG = svgNS('radialGradient', { id: 'cine-iris', cx: '50%', cy: '50%', r: '50%' }, defs);
  svgNS('stop', { offset: '0%', 'stop-color': '#ffe9a0' }, irisG);
  svgNS('stop', { offset: '45%', 'stop-color': '#e0a020' }, irisG);
  svgNS('stop', { offset: '80%', 'stop-color': '#6a2a08' }, irisG);
  svgNS('stop', { offset: '100%', 'stop-color': '#200800' }, irisG);
  const clip = svgNS('clipPath', { id: 'cine-eyeclip' }, defs);
  const almond = 'M4,50 Q100,-18 196,50 Q100,118 4,50 Z';
  svgNS('path', { d: almond }, clip);
  const g = svgNS('g', { 'clip-path': 'url(#cine-eyeclip)' }, svg);
  svgNS('path', { d: almond, fill: 'url(#cine-sclera)' }, g);
  // 핏줄
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x0 = 100 + side * rnd(55, 96);
    const y0 = 50 + rnd(-30, 30);
    svgNS('path', { d: `M${x0},${y0} q${-side * rnd(10, 25)},${rnd(-10, 10)} ${-side * rnd(20, 40)},${rnd(-8, 8)}`, stroke: 'rgba(150,20,20,0.55)', 'stroke-width': rnd(0.5, 1.2), fill: 'none' }, g);
  }
  const iris = svgNS('g', {}, g);
  svgNS('circle', { cx: 100, cy: 50, r: 30, fill: 'url(#cine-iris)' }, iris);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    svgNS('line', { x1: 100 + Math.cos(a) * 10, y1: 50 + Math.sin(a) * 10, x2: 100 + Math.cos(a) * 29, y2: 50 + Math.sin(a) * 29, stroke: 'rgba(60,20,0,0.35)', 'stroke-width': 0.8 }, iris);
  }
  svgNS('ellipse', { cx: 100, cy: 50, rx: 5.5, ry: 20, fill: '#050202' }, iris);
  svgNS('circle', { cx: 91, cy: 41, r: 4, fill: 'rgba(255,255,255,0.8)' }, iris);
  const lidTop = svgNS('path', { d: 'M-10,-10 L210,-10 L210,50 Q100,-18 -10,50 Z', fill: '#140a10' }, svg);
  const lidBottom = svgNS('path', { d: 'M-10,110 L210,110 L210,50 Q100,118 -10,50 Z', fill: '#140a10' }, svg);
  svgNS('path', { d: almond, fill: 'none', stroke: '#2a0a10', 'stroke-width': 3 }, svg);
  return { svg, iris, lidTop, lidBottom };
}

/** 홍채가 손끝을 따라본다. 돌려준 함수를 부르면 멈춘다 */
function follow(iris: SVGGElement, box: HTMLElement): () => void {
  let on = true;
  let cx = 0;
  let cy = 0;
  const tick = () => {
    if (!on) return;
    const r = box.getBoundingClientRect();
    const tx = ((lastPointer.x - (r.left + r.width / 2)) / (r.width / 2)) * 34;
    const ty = ((lastPointer.y - (r.top + r.height / 2)) / (r.height / 2)) * 14;
    cx += (Math.max(-34, Math.min(34, tx)) - cx) * 0.12;
    cy += (Math.max(-14, Math.min(14, ty)) - cy) * 0.12;
    iris.setAttribute('transform', `translate(${cx.toFixed(2)},${cy.toFixed(2)})`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => (on = false);
}

async function eye(n: number) {
  const veil = div('cine-full cine-eyeveil');
  void anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
  const w = Math.min(innerWidth * 0.96, 520);
  const box = div('cine-eye', veil);
  const { svg, iris, lidTop, lidBottom } = eyeSvg(w);
  box.appendChild(svg);
  const stop = follow(iris, box);
  const open = (o: boolean, d: number) =>
    Promise.all([
      anim(lidTop, [{ transform: `translateY(${o ? 0 : -62}px)` }, { transform: `translateY(${o ? -62 : 0}px)` }], { duration: d, easing: 'ease-in-out', fill: 'forwards' }),
      anim(lidBottom, [{ transform: `translateY(${o ? 0 : 62}px)` }, { transform: `translateY(${o ? 62 : 0}px)` }], { duration: d, easing: 'ease-in-out', fill: 'forwards' }),
    ]);
  sound.sfx('reveal', { pitch: 0.45 });
  sound.sfx('heartbeat');
  await open(true, 520);
  stage.splitPulse(1);
  await sleep(700 + Math.max(0, n - 1) * 500);
  await open(false, 90);
  await open(true, 120);
  sound.sfx('whisper', { volume: 0.6 });
  await sleep(700);
  await open(false, 260);
  stop();
  await anim(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
  veil.remove();
}

// ───────────── 먹물·손글씨·손바닥 ─────────────

async function ink() {
  const W = innerWidth;
  const H = innerHeight;
  const cv = document.createElement('canvas');
  cv.className = 'cine-full';
  cv.width = Math.round(W / 2);
  cv.height = Math.round(H / 2);
  layer().appendChild(cv);
  const g = cv.getContext('2d')!;
  const blobs = Array.from({ length: 9 }, (_, i) => {
    const side = i % 4;
    const t = rnd(0, 1);
    const x = side === 0 ? t * W : side === 1 ? W : side === 2 ? t * W : 0;
    const y = side === 0 ? 0 : side === 1 ? t * H : side === 2 ? H : t * H;
    return { x: x / 2, y: y / 2, r: rnd(0.26, 0.42) * Math.max(W, H) * 0.5, ph: rnd(0, 6), k: rnd(3, 6) };
  });
  sound.sfx('void', { pitch: 0.6, volume: 0.8 });
  const total = T(1700);
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const draw = (now: number) => {
      const p = (now - t0) / total;
      if (p >= 1) return done();
      const grow = p < 0.45 ? p / 0.45 : p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(4,2,8,0.92)';
      for (const b of blobs) {
        const r = b.r * Math.pow(Math.max(0, grow), 0.8);
        if (r < 1) continue;
        g.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          const rr = r * (1 + 0.12 * Math.sin(a * b.k + b.ph + now * 0.003) + 0.06 * Math.sin(a * 11 + b.ph * 2));
          const x = b.x + Math.cos(a) * rr;
          const y = b.y + Math.sin(a) * rr;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  cv.remove();
}

async function scrawl(text: string) {
  const line = realWorld(text || '돌아가');
  const box = div('cine-scrawl', layer(), { transform: `translate(-50%,-50%) rotate(${rnd(-9, 9)}deg)` });
  sound.sfx('whisper', { volume: 0.7, pitch: 0.8 });
  const letters = letterSpans(box, line, (s) => {
    if (Math.random() < 0.35) s.classList.add('drip');
    s.style.transform = `rotate(${rnd(-7, 7)}deg) translateY(${rnd(-4, 4)}px)`;
  });
  for (const { el } of letters) {
    if (!el) {
      await sleep(40);
      continue;
    }
    void anim(el, [{ opacity: 0, transform: `${el.style.transform} scale(1.6)` }, { opacity: 1, transform: `${el.style.transform} scale(1)` }], { duration: 140, fill: 'forwards', easing: 'ease-out' });
    await sleep(95);
  }
  await sleep(500);
  setTimeout(() => {
    void anim(box, [{ opacity: 1 }, { opacity: 0, filter: 'blur(3px)' }], { duration: 900, fill: 'forwards' }).then(() => box.remove());
  }, T(1800));
}

async function handprints(n: number) {
  n = Math.max(1, Math.min(8, n || 3));
  const wrap = div('cine-full');
  const svg = iconSvg('gi:open-palm');
  for (let i = 0; i < n; i++) {
    const h = div('cine-hand', wrap, { left: `${rnd(8, 72)}%`, top: `${rnd(10, 70)}%`, width: `${rnd(90, 150)}px`, height: `${rnd(90, 150)}px` });
    h.innerHTML = svg;
    const rot = rnd(-35, 35);
    sound.sfx('thud', { pitch: rnd(0.8, 1.1) });
    stage.shake(5, 0.15);
    void anim(h, [{ transform: `rotate(${rot}deg) scale(1.9)`, opacity: 0 }, { transform: `rotate(${rot}deg) scale(1)`, opacity: 0.85 }], { duration: 90, easing: 'ease-in', fill: 'forwards' });
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
  await anim(body, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], { duration: 520, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
  await sleep(650);
  await anim(body, [{ transform: 'rotate(180deg)' }, { transform: 'rotate(360deg)' }], { duration: 520, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
  body.getAnimations().forEach((a) => a.cancel());
}

async function timestop() {
  const body = document.body;
  const was = stage.battle.timeScale;
  body.classList.add('cine-gray');
  stage.battle.timeScale = 0.03;
  const clock = div('cine-clock');
  clock.innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(230,225,210,0.5)" stroke-width="3"/>${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<line x1="${100 + Math.cos(a) * 78}" y1="${100 + Math.sin(a) * 78}" x2="${100 + Math.cos(a) * 90}" y2="${100 + Math.sin(a) * 90}" stroke="rgba(230,225,210,0.7)" stroke-width="3"/>`;
  }).join('')}<line class="h" x1="100" y1="100" x2="100" y2="48" stroke="rgba(240,235,220,0.9)" stroke-width="5" stroke-linecap="round"/><line class="s" x1="100" y1="112" x2="100" y2="22" stroke="rgba(255,90,70,0.95)" stroke-width="2" stroke-linecap="round"/></svg>`;
  const hand = clock.querySelector('.s') as SVGLineElement;
  void anim(clock, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 260, fill: 'forwards' });
  for (let i = 0; i < 4; i++) {
    hand.style.transformOrigin = '100px 100px';
    hand.style.transform = `rotate(${(i + 1) * 6}deg)`;
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
  div('cine-hole-ring', hole);
  div('cine-hole-disk', hole);
  sound.sfx('void', { pitch: 0.5 });
  stage.shockwave(at.x, at.y, { amplitude: -30, wavelength: 260, speed: 600, radius: 700, brightness: 0.75, dur: 1 });
  const origin = `${at.x}px ${at.y}px`;
  if (app) app.style.transformOrigin = origin;
  await Promise.all([
    anim(hole, [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1 }], { duration: 900, easing: 'ease-out', fill: 'forwards' }),
    app
      ? anim(app, [{ transform: 'scale(1) rotate(0deg)', filter: 'none' }, { transform: 'scale(0.9) rotate(-3deg)', filter: 'blur(1px) brightness(0.7)' }], { duration: 900, easing: 'ease-in', fill: 'forwards' })
      : Promise.resolve(),
  ]);
  stage.flash(0x000000, 0.4);
  await sleep(250);
  await Promise.all([
    anim(hole, [{ transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }], { duration: 420, easing: 'ease-in', fill: 'forwards' }),
    app ? anim(app, [{ transform: 'scale(0.9) rotate(-3deg)', filter: 'blur(1px) brightness(0.7)' }, { transform: 'scale(1) rotate(0deg)', filter: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'forwards' }) : Promise.resolve(),
  ]);
  if (app) {
    app.getAnimations().forEach((a) => a.cancel());
    app.style.transformOrigin = '';
  }
  hole.remove();
}

/** 화면 네 모서리에서 아가리가 튀어나온다 (틴달로스의 사냥개는 각도에서 온다) */
async function corners() {
  const wrap = div('cine-full');
  const jaws: Promise<void>[] = [];
  const spots = [
    { left: '0', top: '0', rot: 45 },
    { left: '100%', top: '0', rot: 135 },
    { left: '100%', top: '100%', rot: 225 },
    { left: '0', top: '100%', rot: 315 },
  ];
  sound.sfx('slash', { pitch: 0.6 });
  for (const [i, sp] of spots.entries()) {
    const j = div('cine-maw', wrap, { left: sp.left, top: sp.top });
    j.innerHTML = `<svg viewBox="-60 -60 120 120" width="100%" height="100%"><defs><radialGradient id="mawg${i}"><stop offset="0%" stop-color="#3a0008"/><stop offset="100%" stop-color="#0a0003" stop-opacity="0"/></radialGradient></defs><circle r="58" fill="url(#mawg${i})"/>${Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2;
      const x = Math.cos(a) * 44;
      const y = Math.sin(a) * 44;
      const tx = Math.cos(a) * 16;
      const ty = Math.sin(a) * 16;
      const px = -Math.sin(a) * 9;
      const py = Math.cos(a) * 9;
      return `<polygon points="${x + px},${y + py} ${x - px},${y - py} ${tx},${ty}" fill="#e8e0cc" stroke="#5a0010" stroke-width="1.5"/>`;
    }).join('')}</svg>`;
    jaws.push(
      anim(
        j,
        [
          { transform: `translate(-50%,-50%) rotate(${sp.rot}deg) scale(0.2)`, opacity: 0, easing: 'cubic-bezier(.3,1.5,.5,1)' },
          { transform: `translate(-50%,-50%) rotate(${sp.rot + 20}deg) scale(1.15)`, opacity: 1, offset: 0.35, easing: 'ease-in' },
          { transform: `translate(-50%,-50%) rotate(${sp.rot + 10}deg) scale(0.75)`, opacity: 1, offset: 0.6, easing: 'ease-in' },
          { transform: `translate(-50%,-50%) rotate(${sp.rot}deg) scale(0.2)`, opacity: 0 },
        ],
        { duration: 1200, delay: i * 70, fill: 'forwards' },
      ),
    );
  }
  setTimeout(() => {
    sound.sfx('break', { pitch: 0.7 });
    stage.shake(10, 0.3);
  }, T(420));
  await Promise.all(jaws);
  wrap.remove();
}

async function water(n: number) {
  n = Math.max(1, Math.min(3, n || 2));
  const w = div('cine-water', layer());
  w.innerHTML = '<div class="cine-water-wave"></div>';
  for (let i = 0; i < 14; i++) {
    const b = div('cine-bubble', w, { left: `${rnd(0, 100)}%`, width: `${rnd(4, 12)}px`, height: '0' });
    b.style.height = b.style.width;
    void anim(b, [{ transform: 'translateY(0)', opacity: 0.8 }, { transform: `translateY(-${rnd(60, 220)}px)`, opacity: 0 }], { duration: rnd(900, 1600), delay: rnd(200, 900), fill: 'forwards' });
  }
  sound.sfx('void', { pitch: 0.4, volume: 0.7 });
  await anim(w, [{ height: '0vh' }, { height: `${n * 20}vh` }], { duration: 700, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'forwards' });
  stage.vignette('ink', 0.4, 800);
  await sleep(500);
  await anim(w, [{ height: `${n * 20}vh`, opacity: 1 }, { height: '0vh', opacity: 0.6 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
  w.remove();
}

async function bell(at: { x: number; y: number }) {
  const app = document.getElementById('app');
  sound.sfx('bell');
  stage.shockwave(at.x, at.y, { amplitude: 24, wavelength: 180, speed: 900, radius: 900, brightness: 1.1, dur: 0.8 });
  for (let i = 0; i < 4; i++) {
    const r = div('cine-ring gold', layer(), { left: `${at.x}px`, top: `${at.y}px` });
    void anim(r, [{ transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(12)', opacity: 0 }], { duration: 1100, delay: i * 170, easing: 'ease-out', fill: 'forwards' }).then(() => r.remove());
  }
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
  sound.sfx('charge', { pitch: 1.3, volume: 0.7 });
  const sweep = anim(b, [{ transform: 'translate(0,-50%) rotate(-70deg)', opacity: 0 }, { transform: 'translate(0,-50%) rotate(-10deg)', opacity: 1, offset: 0.25 }, { transform: 'translate(0,-50%) rotate(80deg)', opacity: 1, offset: 0.85 }, { transform: 'translate(0,-50%) rotate(110deg)', opacity: 0 }], { duration: 1200, easing: 'ease-in-out', fill: 'forwards' });
  setTimeout(() => {
    stage.flash(0xfff2c0, 0.45);
    sound.sfx('reveal', { pitch: 1.4 });
    const white = div('cine-full cine-white');
    void anim(white, [{ opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }).then(() => white.remove());
  }, T(480));
  await sweep;
  b.remove();
}

async function swarm() {
  const wrap = div('cine-full');
  const svg = iconSvg(Math.random() < 0.5 ? 'gi:scarab-beetle' : 'gi:beetle-shell');
  sound.sfx('debuff', { pitch: 0.6 });
  const all: Promise<void>[] = [];
  for (let i = 0; i < 46; i++) {
    const fromLeft = i % 2 === 0;
    const y0 = rnd(-5, 105);
    const y1 = y0 + rnd(-40, 40);
    const s = rnd(16, 30);
    const bug = div('cine-bug', wrap, { width: `${s}px`, height: `${s}px`, top: `${y0}%`, left: fromLeft ? '-8%' : '108%' });
    bug.innerHTML = svg;
    const dx = fromLeft ? 120 : -120;
    const ang = (Math.atan2(((y1 - y0) / 100) * innerHeight, (dx / 100) * innerWidth) * 180) / Math.PI + 90;
    all.push(
      anim(
        bug,
        [
          { transform: `translate(0,0) rotate(${ang}deg)` },
          { transform: `translate(${dx * 0.5}vw, ${(y1 - y0) * 0.3}vh) rotate(${ang + rnd(-30, 30)}deg)`, offset: 0.5 },
          { transform: `translate(${dx}vw, ${(y1 - y0) * 1}vh) rotate(${ang}deg)` },
        ],
        { duration: rnd(900, 1700), delay: rnd(0, 500), easing: 'linear', fill: 'forwards' },
      ),
    );
  }
  setTimeout(() => sound.sfx('debuff', { pitch: 0.5 }), T(500));
  await sleep(700);
  void Promise.all(all).then(() => wrap.remove());
}

/** 만화식 임팩트 프레임: 순간 색이 뒤집히고 집중선 */
export async function impact(at: { x: number; y: number }, strong = 1) {
  const wrap = div('cine-full');
  const inv = div('cine-full cine-invert', wrap);
  const lines = svgNS('svg', { width: innerWidth, height: innerHeight, class: 'cine-full' });
  const g = svgNS('g', { fill: '#000' }, lines);
  const R = Math.hypot(innerWidth, innerHeight);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd(-0.05, 0.05);
    const w = rnd(0.008, 0.03);
    const r0 = rnd(60, 160) * strong;
    const p = (ang: number, r: number) => `${(at.x + Math.cos(ang) * r).toFixed(1)},${(at.y + Math.sin(ang) * r).toFixed(1)}`;
    svgNS('polygon', { points: `${p(a - w, R)} ${p(a + w, R)} ${p(a, r0)}` }, g);
  }
  wrap.appendChild(lines);
  const was = stage.battle.timeScale;
  stage.battle.timeScale = 0.02;
  await sleep(70);
  inv.remove();
  await sleep(80 + strong * 40);
  stage.battle.timeScale = was || speed();
  void anim(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).then(() => wrap.remove());
}

// ───────────── 컷인 · 등장 ─────────────

/** 필살기 컷인: 화면을 비스듬히 가르는 띠에 기술 이름 */
export async function cutIn(o: { name: string; sub?: string; icon?: string; art?: string; side: 'enemy' | 'player'; color: string }) {
  const band = div(`cine-cut ${o.side}`, layer());
  band.style.setProperty('--cc', o.color);
  const portrait = div('cine-cut-face', band);
  if (o.art && hasArt(o.art)) portrait.style.backgroundImage = `url("${artUrl('enemies', o.art)}")`;
  else if (o.icon) portrait.innerHTML = `<span class="ic" style="width:64px;height:64px;color:${o.color}">${iconSvg(o.icon)}</span>`;
  const txt = div('cine-cut-text', band);
  txt.innerHTML = `<div class="cine-cut-name"></div>${o.sub ? '<div class="cine-cut-sub"></div>' : ''}`;
  (txt.querySelector('.cine-cut-name') as HTMLElement).textContent = o.name;
  if (o.sub) (txt.querySelector('.cine-cut-sub') as HTMLElement).textContent = o.sub;
  sound.sfx('swoosh');
  if (o.side === 'enemy') sound.sfx('charge', { pitch: 1.4, volume: 0.5 });
  const dir = o.side === 'enemy' ? 1 : -1;
  await Promise.all([
    anim(band, [{ transform: 'skewY(-7deg) scaleY(0)', opacity: 0 }, { transform: 'skewY(-7deg) scaleY(1)', opacity: 1 }], { duration: 110, easing: 'ease-out', fill: 'forwards' }),
    anim(txt, [{ transform: `translateX(${dir * 60}vw)` }, { transform: 'translateX(0)' }], { duration: 230, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' }),
    anim(portrait, [{ transform: `translateX(${-dir * 50}vw)` }, { transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' }),
  ]);
  await sleep(o.side === 'enemy' ? 560 : 420);
  await anim(band, [{ transform: 'skewY(-7deg) translateX(0)', opacity: 1 }, { transform: `skewY(-7deg) translateX(${-dir * 40}vw)`, opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
  band.remove();
}

/** 수호자 등장: 위아래 검은 띠 + 이름 */
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
  Array.from(nameEl.children).forEach((s, i) => void anim(s, [{ opacity: 0, transform: 'scale(1.8)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 320, delay: 120 + i * 70, easing: 'ease-out', fill: 'forwards' }));
  void anim(title.querySelector('.cine-intro-line')!, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, delay: 200, easing: 'ease-out', fill: 'forwards' });
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

/** 수호자를 쓰러뜨린 순간: 느려지는 시간 + 임팩트 + 글자 */
export async function bossFall(at: { x: number; y: number }) {
  const was = stage.battle.timeScale;
  stage.battle.timeScale = 0.25;
  await impact(at, 1.6);
  stage.flash(0xffffff, 0.55);
  sound.sfx('victoryHit');
  const t = div('cine-fall');
  t.textContent = '격파';
  await anim(t, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)', letterSpacing: '0.1em' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', letterSpacing: '0.6em' }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
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
      case 'whisper':
        return await whisper(o.text ?? '');
      case 'sysmsg':
        return await sysmsg(o.text ?? '');
      case 'fakeover':
        return await fakeover(o.text ?? '');
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

/** 화면 가장자리에서 들어온 금 (단계 1~3) — 전투 내내 남는다 */
export function staticCracks(level: number): string {
  const W = innerWidth;
  const H = innerHeight;
  const spots = [
    { x: W * 0.06, y: H * 0.12 },
    { x: W * 0.94, y: H * 0.55 },
    { x: W * 0.2, y: H * 0.9 },
  ].slice(0, Math.max(1, Math.min(3, level)));
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines: string[] = [];
  for (const at of spots) {
    for (let i = 0; i < 8; i++) {
      let x = at.x;
      let y = at.y;
      let a = (i / 8) * Math.PI * 2 + r();
      const pts = [`${x.toFixed(0)},${y.toFixed(0)}`];
      for (let k = 0; k < 7; k++) {
        a += (r() - 0.5) * 0.6;
        const step = 20 + r() * 30;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
      }
      lines.push(pts.join(' '));
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round">${lines
    .map((p) => `<polyline points="${p}" stroke="rgba(0,0,0,0.55)" stroke-width="3"/><polyline points="${p}" stroke="rgba(235,245,255,0.75)" stroke-width="1.1"/>`)
    .join('')}</svg>`;
}

/** 배경에서 지켜보는 눈을 붙인다 (가끔 깜빡이고 손끝을 따라본다). 돌려준 함수로 뗀다 */
export function mountWatcher(host: HTMLElement): () => void {
  const { svg, iris, lidTop, lidBottom } = eyeSvg(Math.min(innerWidth * 0.62, 280));
  host.appendChild(svg);
  lidTop.style.transform = 'translateY(-62px)';
  lidBottom.style.transform = 'translateY(62px)';
  const stop = follow(iris, host);
  const blink = setInterval(() => {
    for (const [lid, d] of [
      [lidTop, -62],
      [lidBottom, 62],
    ] as const)
      void anim(lid, [{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)', offset: 0.5 }, { transform: `translateY(${d}px)` }], { duration: 260 });
  }, 4200);
  return () => {
    clearInterval(blink);
    stop();
    svg.remove();
  };
}
