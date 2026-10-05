import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { bgTexture, fogTexture, gradientTexture, hasBg, softCircle, vignetteTexture } from './textures';

type Motif = 'harbor' | 'abbey' | 'ice' | 'stars' | 'cosmos' | 'title';

interface Theme {
  sky: [string, string, string];
  far: number;
  near: number;
  fog: number;
  fogAlpha: number;
  accent: number;
  motif: Motif;
  particle: { color: number; count: number; rise: number; size: number; drift: number };
}

const THEMES: Record<number, Theme> = {
  0: {
    sky: ['#05080b', '#0b1418', '#050608'],
    far: 0x0b151a,
    near: 0x060a0d,
    fog: 0x6fa0a8,
    fogAlpha: 0.22,
    accent: 0x4fffc4,
    motif: 'title',
    particle: { color: 0x9fe8d8, count: 40, rise: -6, size: 1.6, drift: 6 },
  },
  1: {
    sky: ['#071016', '#10222a', '#04080a'],
    far: 0x0c1a20,
    near: 0x070d10,
    fog: 0x8ab4b8,
    fogAlpha: 0.24,
    accent: 0xffd890,
    motif: 'harbor',
    particle: { color: 0xa8c8c8, count: 50, rise: 8, size: 1.4, drift: 10 },
  },
  2: {
    sky: ['#0e0b09', '#211913', '#060504'],
    far: 0x1b1511,
    near: 0x0a0807,
    fog: 0xa89a8c,
    fogAlpha: 0.22,
    accent: 0xffb060,
    motif: 'abbey',
    particle: { color: 0xd8b088, count: 55, rise: -10, size: 1.4, drift: 7 },
  },
  3: {
    sky: ['#050b12', '#0e2232', '#04070c'],
    far: 0x0f1d2a,
    near: 0x070d14,
    fog: 0xa8d0e8,
    fogAlpha: 0.26,
    accent: 0x7fffd0,
    motif: 'ice',
    particle: { color: 0xe8f4ff, count: 90, rise: 22, size: 1.5, drift: 26 },
  },
  4: {
    sky: ['#020208', '#0a0a24', '#040208'],
    far: 0x0a0a1e,
    near: 0x05050c,
    fog: 0x6060c0,
    fogAlpha: 0.14,
    accent: 0x80a0ff,
    motif: 'stars',
    particle: { color: 0xc0d0ff, count: 70, rise: 0, size: 1.2, drift: 3 },
  },
  5: {
    sky: ['#05030b', '#170a26', '#020106'],
    far: 0x140a22,
    near: 0x06030b,
    fog: 0xc080e0,
    fogAlpha: 0.14,
    accent: 0xff9ad8,
    motif: 'cosmos',
    particle: { color: 0xffe0f0, count: 70, rise: -3, size: 1.4, drift: 4 },
  },
};

interface Mote {
  s: Sprite;
  vx: number;
  vy: number;
  ph: number;
}

export class Backdrop extends Container {
  private theme: Theme;
  private sky = new Sprite();
  private far = new Graphics();
  private near = new Graphics();
  private fogA: TilingSprite;
  private fogB: TilingSprite;
  private glow = new Sprite(softCircle());
  private beam = new Graphics();
  private eye = new Container();
  private tentacles = new Graphics();
  private motes: Mote[] = [];
  private moteLayer = new Container();
  private vignette = new Sprite(vignetteTexture());
  private w = 1;
  private h = 1;
  private t = 0;
  /** 0(밝음)~1(완전한 어둠) */
  darkness = 0;
  /** 배경 그림 (있으면 절차적 실루엣 대신) */
  private photo: Sprite | null = null;
  private photoShade = new Graphics();

  constructor(
    public act: number,
    bgKey?: string,
  ) {
    super();
    this.theme = THEMES[act] ?? THEMES[1];
    this.fogA = new TilingSprite({ texture: fogTexture(act + 1), width: 10, height: 10 });
    this.fogB = new TilingSprite({ texture: fogTexture(act + 7), width: 10, height: 10 });
    this.addChild(this.sky, this.glow, this.beam, this.eye, this.far, this.fogA, this.tentacles, this.near, this.moteLayer, this.fogB, this.vignette);
    if (bgKey && hasBg(bgKey)) {
      const photo = new Sprite();
      photo.anchor.set(0.5);
      photo.alpha = 0;
      this.photo = photo;
      this.addChildAt(photo, 1);
      this.addChildAt(this.photoShade, 2);
      void bgTexture(bgKey).then((tex) => {
        photo.texture = tex;
        this.fitPhoto();
        // 그림이 있으면 절차적 실루엣은 숨긴다 (안개·먼지·비네트는 유지)
        for (const g of [this.far, this.near, this.beam, this.eye, this.tentacles, this.glow]) g.visible = false;
      });
    }
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.beam.blendMode = 'add';
    this.fogA.tint = this.theme.fog;
    this.fogB.tint = this.theme.fog;
    this.fogA.alpha = this.theme.fogAlpha;
    this.fogB.alpha = this.theme.fogAlpha * 0.8;
    this.fogA.blendMode = 'screen';
    this.fogB.blendMode = 'screen';
    const tex: Texture = gradientTexture(...this.theme.sky);
    this.sky.texture = tex;
    for (let i = 0; i < this.theme.particle.count; i++) {
      const s = new Sprite(softCircle());
      s.anchor.set(0.5);
      s.tint = this.theme.particle.color;
      s.blendMode = 'add';
      this.moteLayer.addChild(s);
      this.motes.push({ s, vx: 0, vy: 0, ph: Math.random() * Math.PI * 2 });
    }
  }

  private fitPhoto() {
    const p = this.photo;
    if (!p || p.texture.width <= 1) return;
    const k = Math.max(this.w / p.texture.width, this.h / p.texture.height) * 1.06;
    p.scale.set(k);
    p.position.set(this.w / 2, this.h / 2);
    this.photoShade.clear().rect(0, 0, this.w, this.h).fill({ color: 0x000000, alpha: 0.22 });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.fitPhoto();
    this.sky.width = w;
    this.sky.height = h;
    this.vignette.width = w;
    this.vignette.height = h;
    for (const f of [this.fogA, this.fogB]) {
      f.width = w;
      f.height = h * 0.9;
      f.y = h * 0.1;
      f.tileScale.set(Math.max(1, h / 300));
    }
    this.drawMotif();
    const p = this.theme.particle;
    for (const m of this.motes) {
      m.s.x = Math.random() * w;
      m.s.y = Math.random() * h;
      const sz = (p.size * (0.5 + Math.random())) / 8;
      m.s.scale.set(sz);
      m.s.alpha = 0.2 + Math.random() * 0.5;
      m.vx = (Math.random() - 0.5) * p.drift;
      m.vy = p.rise * (0.4 + Math.random() * 0.8);
    }
  }

  private drawMotif() {
    const { w, h } = this;
    const th = this.theme;
    const far = this.far.clear();
    const near = this.near.clear();
    this.beam.clear();
    this.eye.removeChildren();
    this.glow.visible = false;
    this.tentacles.clear();
    const rnd = mulberry(this.act * 101 + 7);

    switch (th.motif) {
      case 'harbor': {
        // 지붕선
        const base = h * 0.62;
        far.moveTo(0, h);
        let x = 0;
        while (x < w) {
          const bw = 30 + rnd() * 50;
          const bh = 40 + rnd() * 90;
          far.lineTo(x, base - bh);
          if (rnd() < 0.5) {
            far.lineTo(x + bw * 0.5, base - bh - 18);
          }
          far.lineTo(x + bw, base - bh);
          if (rnd() < 0.4) {
            const cx = x + bw * 0.7;
            far.lineTo(cx, base - bh);
            far.lineTo(cx, base - bh - 22);
            far.lineTo(cx + 6, base - bh - 22);
            far.lineTo(cx + 6, base - bh);
          }
          x += bw;
        }
        far.lineTo(w, h);
        far.closePath();
        far.fill({ color: th.far });
        // 등대
        const lx = w * 0.82;
        const ly = h * 0.24;
        far.poly([lx - 12, base, lx - 7, ly, lx + 7, ly, lx + 12, base]).fill({ color: th.far });
        far.rect(lx - 10, ly - 12, 20, 12).fill({ color: 0x1a2a2a });
        this.glow.visible = true;
        this.glow.position.set(lx, ly - 6);
        this.glow.tint = th.accent;
        this.glow.scale.set(2.4);
        this.glow.alpha = 0.7;
        this.beam.position.set(lx, ly - 6);
        this.beam.poly([0, 0, w * 1.4, -60, w * 1.4, 60]).fill({ color: th.accent, alpha: 0.06 });
        // 수면
        near.rect(0, h * 0.8, w, h * 0.2).fill({ color: 0x04080a, alpha: 0.9 });
        for (let i = 0; i < 26; i++) {
          const y = h * 0.81 + rnd() * h * 0.17;
          const x0 = rnd() * w;
          near.moveTo(x0, y).lineTo(x0 + 20 + rnd() * 60, y).stroke({ width: 1, color: 0x6aa0a0, alpha: 0.08 + rnd() * 0.12 });
        }
        break;
      }
      case 'abbey': {
        const base = h * 0.75;
        for (let i = 0; i < 5; i++) {
          const cx = (w / 4) * i;
          const aw = w * 0.22;
          const top = h * (0.22 + rnd() * 0.08);
          far.moveTo(cx - aw / 2, base)
            .lineTo(cx - aw / 2, top + aw * 0.6)
            .quadraticCurveTo(cx - aw / 2, top, cx, top - aw * 0.3)
            .quadraticCurveTo(cx + aw / 2, top, cx + aw / 2, top + aw * 0.6)
            .lineTo(cx + aw / 2, base)
            .stroke({ width: 10, color: th.far });
        }
        // 장미창
        this.glow.visible = true;
        this.glow.position.set(w * 0.5, h * 0.2);
        this.glow.tint = 0xff9050;
        this.glow.scale.set(3);
        this.glow.alpha = 0.35;
        far.circle(w * 0.5, h * 0.2, Math.min(w, h) * 0.09).stroke({ width: 3, color: 0x3a2030, alpha: 0.9 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = Math.min(w, h) * 0.09;
          far.moveTo(w * 0.5, h * 0.2).lineTo(w * 0.5 + Math.cos(a) * r, h * 0.2 + Math.sin(a) * r).stroke({ width: 2, color: 0x3a2030 });
        }
        near.rect(0, base, w, h - base).fill({ color: th.near });
        break;
      }
      case 'ice': {
        // 얼음에 묻힌 오각형 탑들의 실루엣 + 오로라
        const base = h * 0.8;
        let x = -20;
        while (x < w + 20) {
          const tw = 26 + rnd() * 46;
          const top = h * (0.18 + rnd() * 0.4);
          far.poly([x, base, x + tw * 0.12, top + 30, x + tw * 0.5, top, x + tw * 0.88, top + 30, x + tw, base]).fill({ color: th.far });
          x += tw * (0.7 + rnd() * 0.6);
        }
        this.glow.visible = true;
        this.glow.position.set(w * 0.5, h * 0.12);
        this.glow.tint = th.accent;
        this.glow.scale.set(5);
        this.glow.alpha = 0.16;
        near.moveTo(0, h);
        for (let xx = 0; xx <= w; xx += 12) near.lineTo(xx, h * 0.8 + Math.sin(xx * 0.02) * 10);
        near.lineTo(w, h).closePath().fill({ color: th.near });
        break;
      }
      case 'stars': {
        for (let i = 0; i < 160; i++) {
          far.circle(rnd() * w, rnd() * h * 0.8, rnd() * 1.3 + 0.2).fill({ color: 0xffffff, alpha: 0.2 + rnd() * 0.7 });
        }
        // 하늘의 눈
        const ex = w * 0.5;
        const ey = h * 0.2;
        const er = Math.min(w, h) * 0.12;
        const eyeG = new Graphics();
        eyeG.ellipse(0, 0, er * 1.6, er * 0.7).fill({ color: 0x1a1030, alpha: 0.85 });
        eyeG.circle(0, 0, er * 0.6).fill({ color: 0x8060ff, alpha: 0.5 });
        eyeG.circle(0, 0, er * 0.22).fill({ color: 0x000000 });
        this.eye.addChild(eyeG);
        this.eye.position.set(ex, ey);
        this.glow.visible = true;
        this.glow.position.set(ex, ey);
        this.glow.tint = 0x6050ff;
        this.glow.scale.set(4);
        this.glow.alpha = 0.3;
        near.rect(0, h * 0.85, w, h * 0.15).fill({ color: th.near });
        break;
      }
      case 'cosmos': {
        // 별밭과 성운의 빛 — 그 한가운데 무언가가 웅크려 잠들어 있다
        for (let i = 0; i < 180; i++) {
          far.circle(rnd() * w, rnd() * h * 0.85, rnd() * 1.2 + 0.2).fill({ color: rnd() < 0.3 ? 0xffd8f0 : 0xffffff, alpha: 0.15 + rnd() * 0.7 });
        }
        this.glow.visible = true;
        this.glow.position.set(w * 0.5, h * 0.3);
        this.glow.tint = th.accent;
        this.glow.scale.set(6);
        this.glow.alpha = 0.22;
        near.rect(0, h * 0.86, w, h * 0.14).fill({ color: th.near, alpha: 0.8 });
        break;
      }
      case 'title': {
        near.moveTo(0, h);
        for (let x = 0; x <= w; x += 10) near.lineTo(x, h * 0.86 + Math.sin(x * 0.05) * 4);
        near.lineTo(w, h).closePath().fill({ color: th.near });
        this.glow.visible = true;
        this.glow.position.set(w * 0.5, h * 0.3);
        this.glow.tint = th.accent;
        this.glow.scale.set(4);
        this.glow.alpha = 0.12;
        break;
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const { w, h } = this;
    if (this.photo && this.photo.texture.width > 1) {
      // 느린 켄 번스 효과
      this.photo.alpha = Math.min(1, this.photo.alpha + dt * 0.8);
      this.photo.x = w / 2 + Math.sin(t * 0.03) * w * 0.02;
      this.photo.y = h / 2 + Math.cos(t * 0.025) * h * 0.01;
      this.photoShade.alpha = 1 + this.darkness * 1.6;
    }
    this.fogA.tilePosition.x -= dt * 6;
    this.fogB.tilePosition.x -= dt * 14;
    this.fogA.tilePosition.y = Math.sin(t * 0.1) * 6;
    if (this.theme.motif === 'harbor') {
      this.beam.rotation = Math.PI + Math.sin(t * 0.25) * 0.5;
      this.glow.alpha = 0.55 + Math.sin(t * 1.3) * 0.15;
    } else if (this.theme.motif === 'stars') {
      const blink = Math.max(0, Math.sin(t * 0.3) * 6 - 5);
      this.eye.scale.y = 1 - Math.min(1, blink);
      this.eye.rotation = Math.sin(t * 0.07) * 0.1;
    } else if (this.theme.motif === 'ice') {
      this.glow.alpha = 0.12 + Math.sin(t * 0.35) * 0.06;
      this.glow.x = w * (0.5 + Math.sin(t * 0.05) * 0.15);
    } else if (this.theme.motif === 'cosmos') {
      this.glow.alpha = 0.2 + Math.sin(t * 0.5) * 0.06;
      this.glow.scale.set(6 + Math.sin(t * 0.21) * 0.4);
    } else if (this.theme.motif === 'abbey' || this.theme.motif === 'title') {
      this.glow.alpha = (this.theme.motif === 'abbey' ? 0.3 : 0.12) + Math.sin(t * 0.8) * 0.05;
    }
    for (const m of this.motes) {
      m.ph += dt;
      m.s.x += (m.vx + Math.sin(m.ph * 0.7) * 4) * dt;
      m.s.y += m.vy * dt;
      if (m.s.y < -10) m.s.y = h + 10;
      if (m.s.y > h + 10) m.s.y = -10;
      if (m.s.x < -10) m.s.x = w + 10;
      if (m.s.x > w + 10) m.s.x = -10;
    }
    this.vignette.alpha = 0.75 + this.darkness * 0.25;
    this.moteLayer.alpha = 1 - this.darkness * 0.6;
  }
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
