import { Container, Sprite } from 'pixi.js';
import { E_OUT, ease, lerpColor, rand, type Vfx } from './vfx';
import { flare, glow, motes, ring, shards, sparks, type Box } from './vfxRecipes';
import { VT } from './vfxTextures';

const WARD = 0x86c8ff;
const WARD_HOT = 0xeaf6ff;

/**
 * 플레이어의 결계 (방어도) — 전투 영역 아래쪽을 가로지르는 반투명 육각 돔.
 * 방어도를 얻으면 솟아오르고, 남아 있는 동안 희미하게 일렁이며,
 * 막아 낼 때 번쩍이며 금이 가고, 다 깎이면 푸른 파편으로 부서진다.
 */
export class PlayerWard extends Container {
  private dome = new Sprite(VT.wardDome());
  private crackS = new Sprite(VT.crack());
  /** 현재 방어도 (0이면 사라진다) */
  level = 0;
  private vis = 0;
  private flashA = 0;
  private rise = 1;
  private crackT = 0;
  private t = 0;
  private sparkleT = 0;
  private box: Box = { x: 0, y: 0, w: 1, h: 1 };

  constructor(private fx: Vfx) {
    super();
    this.label = 'ward';
    this.dome.anchor.set(0.5, 1);
    this.dome.blendMode = 'add';
    this.dome.tint = WARD;
    this.crackS.anchor.set(0.5);
    this.crackS.blendMode = 'add';
    this.crackS.tint = 0xd8f0ff;
    this.crackS.visible = false;
    this.addChild(this.dome, this.crackS);
    this.visible = false;
  }

  setBox(r: Box) {
    this.box = r;
  }

  private geo() {
    const r = this.box;
    return { cx: r.x + r.w / 2, by: r.y + r.h + 12, rx: r.w * 0.6, ry: Math.max(60, r.h * 0.24) };
  }

  /** 돔 테두리 위의 점. u: 0(왼쪽)~1(오른쪽), e: 1이면 테두리, 작을수록 안쪽 */
  pointOnArc(u: number, e = 1) {
    const g = this.geo();
    const th = Math.PI + u * Math.PI;
    return { x: g.cx + Math.cos(th) * g.rx * e, y: g.by + Math.sin(th) * g.ry * e };
  }

  /** 화면에서 돔의 꼭대기 */
  apex() {
    const g = this.geo();
    return { x: g.cx, y: g.by - g.ry };
  }

  /** 방어도 획득: 솟아오르며 반짝인다 */
  gain(total: number) {
    const fresh = this.level <= 0 || this.vis < 0.3;
    this.level = total;
    if (fresh) this.rise = 0;
    this.flashA = 1;
    const fx = this.fx;
    const g = this.geo();
    // 테두리를 따라 흐르는 빛
    for (const dir of [1, -1]) {
      fx.emit('scA', VT.glow(), g.cx, g.by - g.ry, {
        life: 0.42,
        scale: 0.55,
        tint: WARD_HOT,
        alpha: 0.95,
        fadeIn: 0.05,
        fadeOut: 0.6,
        force: true,
        fn: (p, t) => {
          const u = 0.5 + dir * 0.5 * ease(E_OUT, t);
          const th = Math.PI + u * Math.PI;
          p.x = g.cx + Math.cos(th) * g.rx;
          p.y = g.by + Math.sin(th) * g.ry * Math.min(1, ease(E_OUT, this.rise));
        },
      });
    }
    for (let i = 0; i < 14; i++) {
      const p = this.pointOnArc(Math.random(), rand(0.82, 1));
      motes(fx, 'scA', p.x, p.y, 1, { vy: [-90, -30], size: [6, 11], life: [0.6, 1.0], tint: 0xcfeaff, tint1: WARD, delay: [0.05, 0.3], grow: 0.4 });
    }
    for (let i = 0; i < 6; i++) {
      const p = this.pointOnArc(rand(0.15, 0.85), rand(0.45, 0.9));
      motes(fx, 'scA', p.x, p.y, 1, { tex: VT.hex, size: [16, 26], life: [0.35, 0.55], tint: 0xa8dcff, grow: 1.5, fadeIn: 0.05, delay: [0.05, 0.25] });
    }
  }

  /** 막아 냄 — remaining이 0이면 부서진다 */
  absorb(remaining: number, hitX: number) {
    if (remaining <= 0) {
      this.shatter();
      return;
    }
    this.level = remaining;
    this.flashA = Math.max(this.flashA, 0.95);
    const g = this.geo();
    const u = Math.max(0.18, Math.min(0.82, (hitX - (g.cx - g.rx)) / (2 * g.rx) + rand(-0.08, 0.08)));
    const p = this.pointOnArc(u, rand(0.86, 0.96));
    this.crackS.position.set(p.x, p.y);
    this.crackS.rotation = Math.random() * Math.PI * 2;
    this.crackS.scale.set((g.rx * 0.62) / 256, (g.rx * 0.5) / 256);
    this.crackT = 1;
    const fx = this.fx;
    flare(fx, 'scA', p.x, p.y, 150, 0xdff2ff, 0.2);
    ring(fx, 'scA', p.x, p.y, 16, 170, 0.32, 0xa8dcff, { ratio: 0.55, alpha: 0.9 });
    sparks(fx, 'scA', p.x, p.y, 12, { ang: -Math.PI / 2, spread: 2.6, speed: [220, 520], life: [0.18, 0.35], len: [14, 32], thick: 0.6, tint: 0xeaf6ff, tint1: WARD, gravity: 500, drag: 3.5 });
  }

  /** 방어도 소진: 푸른 파편으로 부서진다 */
  shatter() {
    if (this.vis < 0.05 && this.level <= 0) return;
    const fx = this.fx;
    const g = this.geo();
    for (let i = 0; i < 34; i++) {
      const u = Math.random();
      const e = rand(0.55, 1);
      const p = this.pointOnArc(u, e);
      const a = Math.atan2(p.y - g.by, p.x - g.cx);
      shards(fx, 'scA', p.x, p.y, 1, { ang: a, spread: 0.6, speed: [160, 460], size: [12, 26], life: [0.55, 0.95], tint: 0xdaf0ff, tint1: 0x3a6aa0, gravity: 1000, up: 120 });
    }
    const top = this.apex();
    flare(fx, 'scA', top.x, top.y + g.ry * 0.25, g.rx * 1.3, 0xd8f0ff, 0.22);
    glow(fx, 'scB', g.cx, g.by - g.ry * 0.4, g.rx * 2.2, WARD, 0.35, { ratio: 0.45, alpha: 0.8 });
    sparks(fx, 'scA', top.x, top.y + g.ry * 0.3, 14, { speed: [300, 700], life: [0.2, 0.4], len: [20, 46], thick: 0.6, tint: 0xeaf6ff, tint1: WARD, drag: 3 });
    this.level = 0;
    this.vis = 0;
    this.flashA = 0;
    this.crackT = 0;
    this.visible = false;
  }

  /** 방어도 동기화 (턴 시작에 사라지는 경우 등) */
  set(total: number) {
    if (total <= 0) {
      if (this.level > 0 && this.vis > 0.2) {
        // 조용히 흩어진다
        for (let i = 0; i < 10; i++) {
          const p = this.pointOnArc(Math.random(), rand(0.8, 1));
          motes(this.fx, 'scA', p.x, p.y, 1, { vy: [-70, -30], size: [5, 9], life: [0.6, 1], tint: 0xbfe4ff, grow: 0.3 });
        }
      }
      this.level = 0;
      return;
    }
    if (this.level <= 0) this.rise = Math.min(this.rise, 0.4);
    this.level = total;
  }

  clear() {
    this.level = 0;
    this.vis = 0;
    this.flashA = 0;
    this.crackT = 0;
    this.visible = false;
  }

  update(dt: number) {
    this.t += dt;
    const target = this.level > 0 ? 1 : 0;
    this.vis += (target - this.vis) * Math.min(1, dt * (target ? 9 : 3.2));
    if (this.rise < 1) this.rise = Math.min(1, this.rise + dt / 0.4);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    const on = this.vis > 0.01 || this.flashA > 0.01;
    this.visible = on;
    if (!on) return;
    const g = this.geo();
    // 솟아오름: 살짝 넘쳤다가 자리 잡는다
    const r = this.rise;
    const up = r >= 1 ? 1 : 1 + 2.4 * (r - 1) ** 3 + 1.4 * (r - 1) ** 2;
    this.dome.position.set(g.cx, g.by);
    this.dome.scale.set(g.rx / 248, (g.ry / 236) * Math.max(0.02, up));
    const idle = 0.3 + 0.07 * Math.sin(this.t * 2.3) + 0.04 * Math.sin(this.t * 5.1);
    this.dome.alpha = Math.min(1, idle * this.vis + this.flashA * 0.7);
    this.dome.tint = lerpColor(WARD, WARD_HOT, Math.min(1, this.flashA));
    if (this.crackT > 0) {
      this.crackT = Math.max(0, this.crackT - dt / 0.75);
      this.crackS.visible = this.crackT > 0;
      this.crackS.alpha = Math.min(1, this.crackT * 1.4) * 0.85;
    } else this.crackS.visible = false;
    // 테두리의 잔잔한 반짝임
    if (this.level > 0 && this.vis > 0.6) {
      this.sparkleT -= dt;
      if (this.sparkleT <= 0 && this.fx.room(40)) {
        this.sparkleT = rand(0.16, 0.32);
        const p = this.pointOnArc(rand(0.05, 0.95), rand(0.9, 1));
        motes(this.fx, 'scA', p.x, p.y, 1, { vy: [-40, -15], size: [4, 8], life: [0.6, 1.0], tint: 0xcfeaff, alpha: 0.8, grow: 0.3 });
      }
    }
  }
}
