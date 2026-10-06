import { Application, Container, Graphics, MeshSimple, Rectangle, type Filter } from 'pixi.js';
import { RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import { Backdrop } from './backdrop';
import { Battle, type Rect } from './battle';
import { clearVignettes, jolt, vignettePulse } from './vfxScreen';
import type { VignetteKind } from './vfxTextures';

/** 화면 전체를 덮는 Pixi 캔버스 (배경 + 전투 + 이펙트) */
class Stage {
  app: Application | null = null;
  private root = new Container();
  private backdrop: Backdrop | null = null;
  battle = new Battle();
  private overlay = new Graphics();
  private overlayDrawn = false;
  private shakeT = 0;
  private shakeAmp = 0;
  private flashA = 0;
  private flashColor = 0xff0000;
  private split = new RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } });
  /** 순간적인 색수차 (정신 피해 등) — 정신력에 따른 색수차에 더해진다 */
  private splitP = 0;
  private shock: ShockwaveFilter | null = null;
  private shockT = -1;
  private shockDur = 0;
  private filterKey = '';
  /** 줌 펀치 (치명타 등) */
  private punchT = 0;
  private punchDur = 0.24;
  private punchAmt = 0;
  private pivotX = 0;
  private pivotY = 0;
  private sanity = 100;
  private t = 0;
  private sceneKey = '';
  ready = false;

  async init(el: HTMLElement) {
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: 0x07090c,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    el.appendChild(app.canvas);
    this.app = app;
    app.stage.addChild(this.root, this.overlay);
    this.root.addChild(this.battle);
    this.battle.visible = false;
    app.ticker.add((tk) => this.update(Math.min(0.05, tk.deltaMS / 1000)));
    window.addEventListener('resize', () => this.resize());
    this.setAct(0);
    this.resize();
    this.ready = true;
  }

  private resize() {
    if (!this.app) return;
    // resizeTo는 다음 프레임에야 화면 크기를 바꾼다 — 먼저 맞추지 않으면 배경이 이전 크기로 남는다 (회전 등)
    this.app.resize();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.backdrop?.resize(w, h);
  }

  /** 0 = 타이틀, 1~5 = 층. variant: 'haven' = 거점 */
  setAct(act: number, variant?: 'haven') {
    const key = variant === 'haven' ? 'bg-haven' : act === 0 ? 'bg-title' : `bg-act${act}`;
    if (key === this.sceneKey || !this.app) return;
    this.sceneKey = key;
    const old = this.backdrop;
    const bd = new Backdrop(variant === 'haven' ? 1 : act, key);
    bd.resize(this.app.screen.width, this.app.screen.height);
    bd.alpha = 0;
    this.root.addChildAt(bd, 0);
    this.backdrop = bd;
    const start = performance.now();
    const fade = () => {
      const p = Math.min(1, (performance.now() - start) / 700);
      bd.alpha = p;
      if (old) old.alpha = 1 - p;
      if (p < 1) requestAnimationFrame(fade);
      else if (old) {
        this.root.removeChild(old);
        old.destroy({ children: true });
      }
    };
    requestAnimationFrame(fade);
  }

  setDarkness(d: number) {
    if (this.backdrop) this.backdrop.darkness = d;
  }

  showBattle(on: boolean) {
    this.battle.visible = on;
    if (!on) {
      this.battle.clear();
      clearVignettes();
    }
  }

  setBattleRect(r: Rect) {
    this.battle.rect = r;
  }

  shake(amp = 8, dur = 0.3) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  flash(color = 0xff2020, alpha = 0.35) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, alpha);
  }

  /** 화면이 (x, y)를 향해 순간적으로 확대됐다 돌아온다 */
  punch(x: number, y: number, amount = 0.035, dur = 0.24) {
    if (this.punchT > 0 && amount < this.punchAmt) return;
    this.pivotX = x;
    this.pivotY = y;
    this.punchAmt = amount;
    this.punchDur = dur;
    this.punchT = dur;
  }

  /**
   * 화면(배경 + 전투)이 유리처럼 산산조각 났다가 되감기듯 다시 맞춰진다.
   * at: 충격점, scale: 시간 배율 (빠르게 보기면 0.5)
   */
  shatter(at: { x: number; y: number }, scale = 1): Promise<void> {
    const app = this.app;
    if (!app) return Promise.resolve();
    const W = app.screen.width;
    const H = app.screen.height;
    let tex;
    try {
      tex = app.renderer.generateTexture({ target: this.root, frame: new Rectangle(0, 0, W, H) });
    } catch {
      return Promise.resolve();
    }
    const layer = new Container();
    layer.addChild(new Graphics().rect(0, 0, W, H).fill({ color: 0x020206 }));
    app.stage.addChildAt(layer, app.stage.children.indexOf(this.overlay));
    this.root.visible = false;
    // 충격점을 중심으로 고리·살을 흐트러뜨린 격자 → 삼각형 조각
    const rays = 10;
    const rings = 4;
    const R = Math.hypot(W, H);
    const pts: [number, number][][] = [];
    for (let k = 0; k <= rings; k++) {
      const row: [number, number][] = [];
      for (let j = 0; j < rays; j++) {
        if (k === 0) {
          row.push([at.x, at.y]);
          continue;
        }
        const a = (j / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
        const r = R * Math.pow(k / rings, 1.5) * (0.8 + Math.random() * 0.35) * (k === rings ? 1.6 : 1);
        row.push([at.x + Math.cos(a) * r, at.y + Math.sin(a) * r]);
      }
      pts.push(row);
    }
    type Shard = { m: MeshSimple; x0: number; y0: number; vx: number; vy: number; vr: number; ex: number; ey: number; er: number };
    const shards: Shard[] = [];
    const addTri = (tri: [number, number][]) => {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const vertices = new Float32Array(tri.flatMap(([x, y]) => [x - cx, y - cy]));
      const uvs = new Float32Array(tri.flatMap(([x, y]) => [x / W, y / H]));
      const m = new MeshSimple({ texture: tex, vertices, uvs, indices: new Uint32Array([0, 1, 2]) });
      m.position.set(cx, cy);
      layer.addChild(m);
      const dx = cx - at.x;
      const dy = cy - at.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = (260 + Math.random() * 420) * (1.2 - Math.min(1, d / R));
      shards.push({ m, x0: cx, y0: cy, vx: (dx / d) * sp, vy: (dy / d) * sp - 120 * Math.random(), vr: (Math.random() - 0.5) * 7, ex: 0, ey: 0, er: 0 });
    };
    for (let k = 0; k < rings; k++) {
      for (let j = 0; j < rays; j++) {
        const j2 = (j + 1) % rays;
        if (k === 0) addTri([pts[0][0], pts[1][j], pts[1][j2]]);
        else {
          addTri([pts[k][j], pts[k][j2], pts[k + 1][j2]]);
          addTri([pts[k][j], pts[k + 1][j2], pts[k + 1][j]]);
        }
      }
    }
    const crackT = 0.12 * scale;
    const flyT = 0.75 * scale;
    const holdT = 0.15 * scale;
    const backT = 0.45 * scale;
    let t = 0;
    return new Promise<void>((done) => {
      const tick = (tk: { deltaMS: number }) => {
        const dt = Math.min(0.05, tk.deltaMS / 1000);
        t += dt;
        for (const s of shards) {
          if (t < crackT) {
            // 금이 가며 살짝 벌어진다
            const k = t / crackT;
            const dx = s.x0 - at.x;
            const dy = s.y0 - at.y;
            const d = Math.hypot(dx, dy) || 1;
            s.m.position.set(s.x0 + (dx / d) * 4 * k, s.y0 + (dy / d) * 4 * k);
          } else if (t < crackT + flyT) {
            const u = (t - crackT) / scale;
            s.m.position.set(s.x0 + s.vx * u, s.y0 + s.vy * u + 700 * u * u);
            s.m.rotation = s.vr * u;
            s.m.alpha = 1 - 0.25 * (u / 0.75);
            s.ex = s.m.position.x;
            s.ey = s.m.position.y;
            s.er = s.m.rotation;
          } else if (t > crackT + flyT + holdT) {
            // 되감기
            const p = Math.min(1, (t - crackT - flyT - holdT) / backT);
            const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            s.m.position.set(s.ex + (s.x0 - s.ex) * e, s.ey + (s.y0 - s.ey) * e);
            s.m.rotation = s.er * (1 - e);
            s.m.alpha = 0.75 + 0.25 * e;
          }
        }
        if (t >= crackT + flyT + holdT + backT) {
          app.ticker.remove(tick);
          this.root.visible = true;
          app.stage.removeChild(layer);
          layer.destroy({ children: true });
          tex.destroy(true);
          this.flash(0xffffff, 0.35);
          done();
        }
      };
      app.ticker.add(tick);
    });
  }

  /** 짧은 색수차 */
  splitPulse(amount = 1) {
    this.splitP = Math.max(this.splitP, amount);
  }

  /** 화면 일그러짐 파동 (짧게만 붙였다 뗀다) */
  shockwave(x: number, y: number, o: { amplitude?: number; wavelength?: number; speed?: number; radius?: number; brightness?: number; dur?: number } = {}) {
    if (!this.app) return;
    const s = (this.shock ??= new ShockwaveFilter());
    s.center = { x, y };
    s.amplitude = o.amplitude ?? 22;
    s.wavelength = o.wavelength ?? 150;
    s.speed = o.speed ?? 900;
    s.radius = o.radius ?? 420;
    s.brightness = o.brightness ?? 1.12;
    s.time = 0;
    this.shockT = 0;
    this.shockDur = Math.min(0.6, o.dur ?? 0.42);
  }

  /** 화면 가장자리 비네트 (HUD 위까지 덮는다) */
  vignette(kind: VignetteKind, strength: number, ms = 700) {
    vignettePulse(kind, strength, ms);
  }

  /** 플레이어 HUD 패널이 피격에 들썩인다 */
  joltHud(px: number) {
    jolt('.pbox', Math.min(8, px));
  }

  setSanity(s: number) {
    this.sanity = s;
  }

  private update(dt: number) {
    this.t += dt;
    this.backdrop?.update(dt);
    if (this.battle.visible) this.battle.update(dt);
    // 흔들림
    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT > 0 ? this.shakeAmp * Math.min(1, this.shakeT * 4) : 0;
      ox = (Math.random() - 0.5) * k;
      oy = (Math.random() - 0.5) * k;
      if (this.shakeT === 0) this.shakeAmp = 0;
    }
    // 줌 펀치: 빠르게 다가갔다가 천천히 돌아온다
    let sc = 1;
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
      const p = 1 - this.punchT / this.punchDur;
      const k = p < 0.16 ? p / 0.16 : (1 - (p - 0.16) / 0.84) ** 2;
      sc = 1 + this.punchAmt * k;
    }
    this.root.pivot.set(this.pivotX, this.pivotY);
    this.root.position.set(this.pivotX + ox, this.pivotY + oy);
    this.root.scale.set(sc);
    // 화면 번쩍임
    const app = this.app!;
    if (this.flashA > 0.01) {
      this.overlay.clear();
      this.overlay.rect(0, 0, app.screen.width, app.screen.height).fill({ color: this.flashColor, alpha: this.flashA });
      this.flashA *= Math.pow(0.02, dt);
      this.overlayDrawn = true;
    } else if (this.overlayDrawn) {
      this.overlay.clear();
      this.overlayDrawn = false;
    }
    // 정신력이 낮으면 색수차 (+ 순간 색수차)
    const insane = Math.max(0, (45 - this.sanity) / 45);
    this.splitP = Math.max(0, this.splitP - dt * 2.4);
    const wantSplit = insane > 0 || this.splitP > 0.01;
    if (wantSplit) {
      const base = insane * 3.5 * (0.6 + 0.4 * Math.sin(this.t * 1.7));
      const pulse = this.splitP * 7;
      const amt = base + pulse;
      this.split.redX = -amt;
      this.split.redY = Math.sin(this.t) * base * 0.3 + Math.sin(this.t * 31) * pulse * 0.35;
      this.split.blueX = amt;
      this.split.blueY = -Math.sin(this.t * 1.3) * base * 0.3 - Math.sin(this.t * 27) * pulse * 0.35;
    }
    // 충격파
    let wantShock = false;
    if (this.shockT >= 0 && this.shock) {
      this.shockT += dt;
      if (this.shockT >= this.shockDur) this.shockT = -1;
      else {
        this.shock.time = this.shockT;
        wantShock = true;
      }
    }
    const key = (wantShock ? 'w' : '') + (wantSplit ? 's' : '');
    if (key !== this.filterKey) {
      this.filterKey = key;
      const list: Filter[] = [];
      if (wantShock && this.shock) list.push(this.shock);
      if (wantSplit) list.push(this.split);
      this.root.filters = list;
    }
  }
}

export const stage = new Stage();
