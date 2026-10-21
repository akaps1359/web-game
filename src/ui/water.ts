import { store } from '../state/store';

/**
 * 화면 아래에서 차오른 바닷물 (1층 익사한 선장의 만조 등).
 * 수면은 캔버스에 매 프레임 그린다: 게르스트너 파도 네 겹 + 출렁임(좌우로 기우는 정상파) + 물방울·거품·물보라.
 * 물속의 빛 무늬(코스틱)는 낮은 해상도 캔버스에 따로 그려 화면과 '스크린'으로 섞고, 물 아래의 화면은 CSS로 살짝 흐리게 물들인다.
 * 전투 내내 남는 물(mountWater)과 밀려들었다 빠지는 물결 연출(surge)이 같은 그림을 쓴다.
 */

const TAU = Math.PI * 2;
const speed = () => store.meta.speed ?? 1;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 전투 내내 남는 물: 한 칸의 높이 (화면 높이의 비율) */
export const WATER_STEP = 0.13;

// ───────────── 물속 빛 무늬 (한 번 구워 두는 타일) ─────────────

let causticTile: HTMLCanvasElement | null = null;

/** 이어 붙여도 이음매가 거의 안 보이는 코스틱 무늬 (밝은 그물 선, 알파로 그린다) */
function caustics(): HTMLCanvasElement {
  if (causticTile) return causticTile;
  const S = 160;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const time = 34.5;
  const inten = 0.005;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (x / S) * TAU - 250;
      const py = (y / S) * TAU - 250;
      let ix = px;
      let iy = py;
      let c = 1;
      for (let n = 0; n < 5; n++) {
        const t = time * (1 - 3.5 / (n + 1));
        const nx = px + Math.cos(t - ix) + Math.sin(t + iy);
        const ny = py + Math.sin(t - iy) + Math.cos(t + ix);
        ix = nx;
        iy = ny;
        c += 1 / Math.hypot(px / (Math.sin(ix + t) / inten), py / (Math.cos(iy + t) / inten));
      }
      c = 1.17 - Math.pow(c / 5, 1.4);
      const v = Math.min(1, Math.pow(Math.abs(c), 8) * 1.4);
      const k = (y * S + x) * 4;
      img.data[k] = 200;
      img.data[k + 1] = 255;
      img.data[k + 2] = 246;
      img.data[k + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  causticTile = cv;
  return cv;
}

// ───────────── 물 한 장 ─────────────

/** 파도 한 겹: 파장(px), 높이(px), 속도(px/초, 부호가 방향), 위상, 뾰족함(0~1) */
interface Wave {
  L: number;
  A: number;
  v: number;
  ph: number;
  q: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
}
interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}
interface Pop {
  x: number;
  y: number;
  t: number;
}

interface WaterOpts {
  /** 밀려드는 물결 (거칠고, 물보라·거품이 인다) */
  surge?: boolean;
  /** 그릴 수 있는 가장 높은 수면 (px, 그릇 바닥에서) */
  maxLevel: number;
  /** 그릇 바닥이 화면 바닥보다 이만큼 아래에 있다 (기울어도 바닥이 드러나지 않게) */
  base?: number;
}

class WaterView {
  readonly el: HTMLDivElement;
  private readonly cv: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly cc: HTMLCanvasElement;
  private readonly cg: CanvasRenderingContext2D;
  private readonly blur: HTMLDivElement;
  private readonly waves: Wave[];
  private readonly patA: CanvasPattern | null;
  private readonly patB: CanvasPattern | null;
  private raf = 0;
  private last = 0;
  private t = rnd(0, 100);
  private W = 0;
  private H = 0;
  private dpr = 1;
  private readonly head: number;
  private readonly base: number;
  /** 수면 높이 (화면 바닥에서, px) */
  level = 0;
  private tw: { from: number; to: number; t0: number; dur: number; ease: (p: number) => number } | null = null;
  /** 좌우로 출렁이는 정도 (px, 시간이 지나면 잦아든다) */
  slosh = 0;
  private sloshPh = 0;
  /** 파도 높이 배율 */
  rough = 1;
  /** 거품 (0~1) */
  foam = 0;
  private bubbles: Bubble[] = [];
  private drops: Drop[] = [];
  private pops: Pop[] = [];
  private bubbleAcc = 0;
  private blurH = -1;
  /** 지난 프레임에 무언가 그렸다 */
  private drawn = false;
  private readonly surge: boolean;
  /** 수면 점들 (그릇 좌표, 매 프레임 다시 잰다) */
  private px: number[] = [];
  private py: number[] = [];

  constructor(host: HTMLElement, o: WaterOpts) {
    this.surge = !!o.surge;
    this.base = o.base ?? 0;
    this.head = this.surge ? 150 : 46;
    this.el = document.createElement('div');
    this.el.className = `water${this.surge ? ' surge' : ''}`;
    this.blur = document.createElement('div');
    this.blur.className = 'water-depth';
    this.blur.innerHTML = '<i></i><i></i><i></i>';
    this.cc = document.createElement('canvas');
    this.cc.className = 'water-caustic';
    this.cv = document.createElement('canvas');
    this.cv.className = 'water-surface';
    this.el.append(this.blur, this.cc, this.cv);
    host.appendChild(this.el);
    this.g = this.cv.getContext('2d')!;
    this.cg = this.cc.getContext('2d')!;
    const tile = caustics();
    this.patA = this.cg.createPattern(tile, 'repeat');
    this.patB = this.cg.createPattern(tile, 'repeat');
    const cvH = o.maxLevel + this.base + this.head;
    this.cv.style.height = this.cc.style.height = `${cvH}px`;
    this.waves = this.surge
      ? [
          { L: 610, A: 7, v: 70, ph: rnd(0, TAU), q: 0.55 },
          { L: 230, A: 4.5, v: -52, ph: rnd(0, TAU), q: 0.5 },
          { L: 96, A: 2.2, v: 44, ph: rnd(0, TAU), q: 0.45 },
          { L: 37, A: 0.9, v: -30, ph: rnd(0, TAU), q: 0.3 },
        ]
      : [
          { L: 540, A: 3.6, v: 21, ph: rnd(0, TAU), q: 0.22 },
          { L: 196, A: 2.3, v: -32, ph: rnd(0, TAU), q: 0.2 },
          { L: 74, A: 1.05, v: 25, ph: rnd(0, TAU), q: 0.18 },
          { L: 31, A: 0.45, v: -16, ph: rnd(0, TAU), q: 0.12 },
        ];
    this.resize();
    this.raf = requestAnimationFrame((now) => {
      this.last = now;
      this.frame(now);
    });
  }

  private resize() {
    // 기울어진 그릇이라도 원래 너비로 (getBoundingClientRect는 돌아간 상자를 잰다)
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, Math.round(this.el.offsetWidth || innerWidth));
    this.H = parseFloat(this.cv.style.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    // 빛 무늬는 반 해상도면 충분하다
    this.cc.width = Math.round(this.W / 2);
    this.cc.height = Math.round(this.H / 2);
  }

  /** 수면을 ms 동안 to(px)로 옮긴다 (출렁임이 따라온다) */
  moveTo(to: number, ms: number, ease: (p: number) => number = easeInOut) {
    if (ms <= 0) {
      this.tw = null;
      this.level = to;
      return;
    }
    this.tw = { from: this.level, to, t0: performance.now(), dur: ms, ease };
    this.slosh = Math.max(this.slosh, Math.min(9, 2 + Math.abs(to - this.level) * 0.05));
  }

  /** 출렁 (기울기가 바뀌는 등) */
  kick(px: number) {
    this.slosh = Math.max(this.slosh, px);
  }

  /** 물보라를 n개 튀긴다 (물결의 마루에서) */
  splash(n: number, power = 1) {
    const top = this.H - this.base - this.level;
    for (let i = 0; i < n; i++) {
      const x = rnd(0, this.W);
      this.drops.push({ x, y: top + rnd(-4, 6), vx: rnd(-60, 60), vy: -rnd(160, 420) * power, r: rnd(1, 2.6), life: 1 });
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  /** 수면 높이 (그릇 위쪽에서 잰 y): 게르스트너 파도 + 출렁임 */
  private surface(top: number) {
    const W = this.W;
    const n = Math.ceil(W / 5) + 1;
    const xs = this.px;
    const ys = this.py;
    xs.length = n;
    ys.length = n;
    const t = this.t;
    const sl = this.slosh * Math.cos(this.sloshPh);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * W;
      let dx = 0;
      let dy = 0;
      for (const w of this.waves) {
        const k = TAU / w.L;
        const th = k * (u - w.v * t) + w.ph;
        const A = w.A * this.rough;
        dy += A * Math.cos(th);
        dx -= (w.q / k) * Math.min(1, A * k * 4) * Math.sin(th);
      }
      // 좌우로 기우는 정상파 (그릇 속 물이 출렁이듯)
      dy += sl * Math.cos((Math.PI * u) / W);
      xs[i] = u + dx;
      ys[i] = top - dy;
    }
  }

  private path(g: CanvasRenderingContext2D, s: number, bottom: number) {
    const xs = this.px;
    const ys = this.py;
    g.beginPath();
    g.moveTo(-4 * s, ys[0] * s);
    for (let i = 0; i < xs.length; i++) g.lineTo(xs[i] * s, ys[i] * s);
    g.lineTo((this.W + 4) * s, ys[ys.length - 1] * s);
    g.lineTo((this.W + 4) * s, bottom * s);
    g.lineTo(-4 * s, bottom * s);
    g.closePath();
  }

  private frame(now: number) {
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    if (this.tw) {
      const p = Math.min(1, (now - this.tw.t0) / this.tw.dur);
      this.level = this.tw.from + (this.tw.to - this.tw.from) * this.tw.ease(p);
      if (p >= 1) this.tw = null;
    }
    // 출렁임은 2.4초 주기로 좌우를 오가며 잦아든다
    this.sloshPh += dt * 2.6;
    this.slosh *= Math.exp(-dt / 1.7);
    if (this.el.offsetWidth && Math.abs(this.el.offsetWidth - this.W) > 1) this.resize();
    const W = this.W;
    const H = this.H;
    const g = this.g;
    const d = this.dpr;
    const cg = this.cg;
    const depth = this.level + this.base;
    // 물이 다 빠졌으면 한 번 지우고 쉰다
    if (this.level < 0.5 && !this.tw && !this.drops.length) {
      if (this.drawn) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.cv.width, this.cv.height);
        cg.setTransform(1, 0, 0, 1, 0, 0);
        cg.clearRect(0, 0, this.cc.width, this.cc.height);
        this.setBlur(0);
        this.drawn = false;
      }
      return;
    }
    this.drawn = true;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.clearRect(0, 0, this.cc.width, this.cc.height);
    const top = H - depth;
    this.surface(top);
    // 거의 다 빠진 물은 옅어지며 사라진다 (수면 선만 바닥에 남지 않게)
    const fade = Math.min(1, this.level / 24);
    g.globalAlpha = fade;
    const amp = this.waves.reduce((s, w) => s + w.A, 0) * this.rough + Math.abs(this.slosh);
    this.setBlur(Math.max(0, depth - amp));

    // ── 먼 물결 (수면 뒤로 비치는 한 겹) ──
    g.save();
    g.beginPath();
    for (let i = 0; i < this.px.length; i++) {
      const x = this.px[i] * d;
      const y = (this.py[i] - 3 - 2.2 * this.rough * Math.sin(i * 0.21 + this.t * 1.3)) * d;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineTo(W * d, H * d);
    g.lineTo(0, H * d);
    g.closePath();
    g.fillStyle = 'rgba(120, 196, 200, 0.16)';
    g.fill();
    g.restore();

    // ── 물 몸통: 수면 가까이는 맑은 청록, 깊을수록 검푸르게 ──
    this.path(g, d, H);
    const body = g.createLinearGradient(0, (top - amp) * d, 0, H * d);
    const deep = Math.min(1, depth / 260);
    body.addColorStop(0, this.surge ? 'rgba(96, 186, 190, 0.62)' : 'rgba(84, 170, 176, 0.5)');
    body.addColorStop(0.12, 'rgba(38, 118, 130, 0.58)');
    body.addColorStop(0.55, `rgba(12, ${Math.round(70 - 18 * deep)}, ${Math.round(84 - 16 * deep)}, ${0.66 + 0.08 * deep})`);
    body.addColorStop(1, `rgba(3, 20, 30, ${0.78 + 0.1 * deep})`);
    g.fillStyle = body;
    g.fill();

    // ── 수면 바로 아래 은빛 띠 (물 밑에서 올려다본 수면) ──
    g.save();
    this.path(g, d, H);
    g.clip();
    const sheen = g.createLinearGradient(0, (top - amp) * d, 0, (top + 16 + amp) * d);
    sheen.addColorStop(0, `rgba(215, 252, 255, ${0.3 + this.foam * 0.3})`);
    sheen.addColorStop(1, 'rgba(215, 252, 255, 0)');
    g.fillStyle = sheen;
    g.fillRect(0, (top - amp - 4) * d, W * d, (24 + amp * 2) * d);

    // 물방울 (아래에서 떠올라 수면에서 터진다)
    this.bubbleAcc += dt * (this.surge ? 26 : 1.1 + W / 260) * (depth > 30 ? 1 : 0.3);
    while (this.bubbleAcc >= 1) {
      this.bubbleAcc -= 1;
      this.bubbles.push({ x: rnd(0, W), y: H + rnd(2, 10), r: rnd(0.9, this.surge ? 4 : 3), vy: rnd(24, 60) * (this.surge ? 2.2 : 1), ph: rnd(0, TAU) });
    }
    g.lineWidth = 1 * d;
    for (const b of this.bubbles) {
      b.y -= (b.vy + b.r * 6) * dt;
      b.x += Math.sin(this.t * 3 + b.ph) * 12 * dt;
      const i = clamp(Math.round((b.x / W) * (this.px.length - 1)), 0, this.px.length - 1);
      if (b.y - b.r <= this.py[i]) {
        b.vy = -1;
        this.pops.push({ x: b.x, y: this.py[i], t: 0 });
        continue;
      }
      g.beginPath();
      g.arc(b.x * d, b.y * d, b.r * d, 0, TAU);
      g.strokeStyle = 'rgba(205, 248, 255, 0.55)';
      g.stroke();
      g.beginPath();
      g.arc((b.x - b.r * 0.35) * d, (b.y - b.r * 0.35) * d, Math.max(0.5, b.r * 0.3) * d, 0, TAU);
      g.fillStyle = 'rgba(240, 255, 255, 0.7)';
      g.fill();
    }
    this.bubbles = this.bubbles.filter((b) => b.vy > 0 && b.y > -10);
    g.restore();

    // ── 수면 선: 넓게 번진 빛 + 가늘고 밝은 선 ──
    g.save();
    g.beginPath();
    for (let i = 0; i < this.px.length; i++) {
      if (i === 0) g.moveTo(this.px[i] * d, this.py[i] * d);
      else g.lineTo(this.px[i] * d, this.py[i] * d);
    }
    g.lineJoin = 'round';
    g.strokeStyle = `rgba(150, 236, 244, ${0.18 + this.foam * 0.2})`;
    g.lineWidth = (5 + this.foam * 6) * d;
    g.stroke();
    g.strokeStyle = `rgba(226, 253, 255, ${0.78 + this.foam * 0.2})`;
    g.lineWidth = (1.3 + this.foam * 1.2) * d;
    g.stroke();
    g.restore();

    // ── 수면에 비친 빛: 물결을 타고 천천히 흘러가는 반짝임 ──
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const u = (((this.t * (14 + k * 6) + k * 173) % (W + 80)) + W + 80) % (W + 80);
      const i = clamp(Math.round(((u - 40) / W) * (this.px.length - 1)), 0, this.px.length - 1);
      const x = this.px[i] * d;
      const y = (this.py[i] + 1) * d;
      const r = (16 + k * 5) * d;
      const glint = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.22 + 0.12 * Math.sin(this.t * 2 + k * 1.7);
      glint.addColorStop(0, `rgba(230, 255, 255, ${a})`);
      glint.addColorStop(1, 'rgba(230, 255, 255, 0)');
      g.fillStyle = glint;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.32, 0, 0, TAU);
      g.fill();
    }
    g.restore();

    // ── 거품 (밀려드는 물결의 마루와 그 아래 하얗게 이는 띠) ──
    if (this.foam > 0.02) {
      g.save();
      for (let i = 0; i < this.px.length; i += 1) {
        const n1 = Math.sin(i * 1.7 + this.t * 5.1) * Math.sin(i * 0.37 - this.t * 2.3) + 0.35 * Math.sin(i * 0.11 + this.t);
        if (n1 < 0) continue;
        for (let j = 0; j < 3; j++) {
          const r = (0.8 + n1 * 2.4 - j * 0.5) * this.foam;
          if (r <= 0.3) continue;
          g.beginPath();
          g.arc((this.px[i] + rnd(-2, 2)) * d, (this.py[i] + 1 + j * rnd(2, 5)) * d, r * d, 0, TAU);
          g.fillStyle = `rgba(238, 255, 255, ${Math.min(0.75, 0.55 * this.foam * n1) * (1 - j * 0.3)})`;
          g.fill();
        }
      }
      g.restore();
    }

    // ── 수면에서 터지는 물방울 고리 ──
    g.save();
    g.lineWidth = 1 * d;
    for (const p of this.pops) {
      p.t += dt;
      const k = p.t / 0.35;
      g.beginPath();
      g.ellipse(p.x * d, p.y * d, (2 + k * 7) * d, (1 + k * 2) * d, 0, 0, TAU);
      g.strokeStyle = `rgba(225, 252, 255, ${0.5 * (1 - k)})`;
      g.stroke();
    }
    this.pops = this.pops.filter((p) => p.t < 0.35);
    g.restore();

    // ── 물보라 ──
    if (this.drops.length) {
      g.save();
      for (const p of this.drops) {
        p.vy += 1300 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.9;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = Math.min(10, sp * 0.018);
        g.beginPath();
        g.moveTo(p.x * d, p.y * d);
        g.lineTo((p.x - (p.vx / sp) * len) * d, (p.y - (p.vy / sp) * len) * d);
        g.strokeStyle = `rgba(225, 252, 255, ${0.75 * Math.max(0, p.life)})`;
        g.lineWidth = p.r * d;
        g.lineCap = 'round';
        g.stroke();
      }
      this.drops = this.drops.filter((p) => p.life > 0 && p.y < H + 10);
      g.restore();
    }

    // ── 물속 빛 무늬: 두 겹이 서로 다른 쪽으로 흘러 겹치는 곳이 반짝인다 ──
    if (this.patA && this.patB) {
      const s = 0.5;
      cg.save();
      this.path(cg, s, H);
      cg.clip();
      cg.globalCompositeOperation = 'lighter';
      const flow = this.surge ? 2.2 : 1;
      this.patA.setTransform(new DOMMatrix().translate(this.t * 9 * flow, this.t * 5 * flow).scale(0.62));
      cg.globalAlpha = 0.8 * fade;
      cg.fillStyle = this.patA;
      cg.fillRect(0, 0, this.cc.width, this.cc.height);
      this.patB.setTransform(new DOMMatrix().translate(-this.t * 7 * flow, this.t * 8 * flow).rotate(23).scale(0.85));
      cg.globalAlpha = 0.65 * fade;
      cg.fillStyle = this.patB;
      cg.fillRect(0, 0, this.cc.width, this.cc.height);
      // 깊을수록 빛이 닿지 않는다
      cg.globalCompositeOperation = 'destination-in';
      cg.globalAlpha = 1;
      const dim = cg.createLinearGradient(0, (top - amp) * s, 0, (top + Math.min(depth, 220)) * s);
      dim.addColorStop(0, 'rgba(0,0,0,1)');
      dim.addColorStop(0.45, 'rgba(0,0,0,0.5)');
      dim.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = dim;
      cg.fillRect(0, 0, this.cc.width, this.cc.height);
      cg.restore();
    }
  }

  /** 물 아래 화면을 흐리게 하는 막의 높이 (바뀔 때만 건드린다) */
  private setBlur(h: number) {
    const v = Math.round(h);
    if (v === this.blurH) return;
    this.blurH = v;
    this.blur.style.height = `${v}px`;
  }
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
/** 살짝 넘쳤다가 자리 잡는다 */
function easeOutBack(p: number): number {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

// ───────────── 전투 내내 남는 물 ─────────────

/** 지금 화면에 남아 있는 물 (밀려드는 물결이 끝나면 이 높이로 돌아온다) */
let calm: { view: WaterView; px: number } | null = null;

/**
 * 전투 화면 아래에 남는 물을 붙인다. set(높이 0~3, 화면 기울기)로 바꾸고, stop()으로 뗀다.
 * 화면이 기울어도 수면은 땅과 나란하게 남는다 (그릇이 기울면 물은 반대로 기운다)
 */
export function mountWater(host: HTMLElement): { set(level: number, tilt: number): void; stop(): void } {
  const base = Math.round(innerHeight * 0.08);
  const view = new WaterView(host, { maxLevel: innerHeight * WATER_STEP * 3 + 20, base });
  const me = { view, px: 0 };
  calm = me;
  let lastTilt = 0;
  let first = true;
  return {
    set(level, tilt) {
      const px = Math.max(0, Math.min(3, level)) * innerHeight * WATER_STEP;
      me.px = px;
      if (first) {
        // 처음 붙을 때는 아래에서 천천히 차오른다
        view.moveTo(px, 1100);
        first = false;
      } else if (Math.abs(px - view.level) > 0.5) view.moveTo(px, 1000);
      if (tilt !== lastTilt) {
        view.kick(Math.min(10, 3 + Math.abs(tilt - lastTilt) * 1.2));
        lastTilt = tilt;
      }
      host.style.transform = tilt ? `rotate(${-tilt}deg)` : '';
    },
    stop() {
      view.destroy();
      if (calm === me) calm = null;
    },
  };
}

// ───────────── 밀려들었다 빠지는 물결 (연출 'water') ─────────────

/** 물결이 화면 아래에서 n(1~3)만큼 밀려들었다가 남은 물 높이로 빠진다. 막아야 하는 부분(차오름)이 끝나면 돌아온다 */
export async function surge(host: HTMLElement, n: number, fx: { onPeak(): void }): Promise<void> {
  n = Math.max(1, Math.min(3, n || 2));
  const T = (ms: number) => ms / speed();
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, T(ms)));
  const peak = n * 0.2 * innerHeight;
  const view = new WaterView(host, { surge: true, maxLevel: peak * 1.15 });
  view.rough = 2.4;
  view.foam = 1;
  view.kick(8);
  // 남은 물은 물결이 지나가는 동안 잠깐 숨긴다 (두 겹이 겹쳐 진해지지 않게)
  const under = calm;
  if (under) under.view.el.style.opacity = '0';
  view.moveTo(peak, T(640), easeOutBack);
  for (let i = 0; i < 4; i++) setTimeout(() => view.splash(6 + n * 3, 0.8 + n * 0.15), T(120 + i * 110));
  await wait(430);
  fx.onPeak();
  view.splash(10 + n * 5, 1 + n * 0.2);
  await wait(420);
  // 빠진다: 거품이 잦아들고 남은 물 높이로
  const rest = under?.px ?? 0;
  const fall = T(820);
  view.moveTo(rest, fall);
  const t0 = performance.now();
  const calmDown = () => {
    const p = Math.min(1, (performance.now() - t0) / fall);
    view.rough = 2.4 - 1.4 * p;
    view.foam = 1 - p;
    if (p < 1) requestAnimationFrame(calmDown);
  };
  requestAnimationFrame(calmDown);
  setTimeout(() => {
    if (under) under.view.el.style.opacity = '';
    view.el.style.transition = `opacity ${T(320)}ms`;
    view.el.style.opacity = '0';
    setTimeout(() => view.destroy(), T(360));
  }, fall);
  await wait(200);
}
