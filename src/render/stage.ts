import { Application, Container, Graphics } from 'pixi.js';
import { RGBSplitFilter } from 'pixi-filters';
import { Backdrop } from './backdrop';
import { Battle, type Rect } from './battle';

/** 화면 전체를 덮는 Pixi 캔버스 (배경 + 전투 + 이펙트) */
class Stage {
  app: Application | null = null;
  private root = new Container();
  private backdrop: Backdrop | null = null;
  battle = new Battle();
  private overlay = new Graphics();
  private shakeT = 0;
  private shakeAmp = 0;
  private flashA = 0;
  private flashColor = 0xff0000;
  private split = new RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } });
  private sanity = 100;
  private t = 0;
  private act = -1;
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
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.backdrop?.resize(w, h);
  }

  /** 0 = 타이틀, 1~5 = 층 */
  setAct(act: number) {
    if (act === this.act || !this.app) return;
    this.act = act;
    const old = this.backdrop;
    const bd = new Backdrop(act);
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
    if (!on) this.battle.clear();
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

  setSanity(s: number) {
    this.sanity = s;
  }

  private update(dt: number) {
    this.t += dt;
    this.backdrop?.update(dt);
    if (this.battle.visible) this.battle.update(dt);
    // 흔들림
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT > 0 ? this.shakeAmp * Math.min(1, this.shakeT * 4) : 0;
      this.root.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      if (this.shakeT === 0) this.shakeAmp = 0;
    } else this.root.position.set(0, 0);
    // 화면 번쩍임
    const app = this.app!;
    this.overlay.clear();
    if (this.flashA > 0.01) {
      this.overlay.rect(0, 0, app.screen.width, app.screen.height).fill({ color: this.flashColor, alpha: this.flashA });
      this.flashA *= Math.pow(0.02, dt);
    }
    // 정신력이 낮으면 색수차
    const insane = Math.max(0, (45 - this.sanity) / 45);
    if (insane > 0) {
      const amt = insane * 3.5 * (0.6 + 0.4 * Math.sin(this.t * 1.7));
      this.split.red = { x: -amt, y: Math.sin(this.t) * amt * 0.3 };
      this.split.blue = { x: amt, y: -Math.sin(this.t * 1.3) * amt * 0.3 };
      if (!this.root.filters || (this.root.filters as unknown[]).length === 0) this.root.filters = [this.split];
    } else if (this.root.filters && (this.root.filters as unknown[]).length) {
      this.root.filters = [];
    }
  }
}

export const stage = new Stage();
