import { Container, Graphics, Sprite } from 'pixi.js';
import type { DmgType, EnemyDef, EnemyUnit } from '../engine/types';
import { hardDot, iconTexture, softCircle } from './textures';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Anchor {
  x: number;
  /** 발 위치 */
  y: number;
  size: number;
}

/** 전열/후열 배치 — DOM 오버레이와 공유 */
export function layoutEnemies(rect: Rect, list: { uid: string; row: 0 | 1; scale: number; dead: boolean }[]): Map<string, Anchor> {
  const out = new Map<string, Anchor>();
  const alive = list.filter((e) => !e.dead);
  for (const row of [1, 0] as const) {
    const units = alive.filter((e) => e.row === row);
    const n = units.length;
    if (!n) continue;
    const base = row === 0 ? Math.min(rect.h * 0.36, rect.w / Math.max(2.15, n + 0.55)) : Math.min(rect.h * 0.27, rect.w / Math.max(2.6, n + 1));
    const y = rect.y + rect.h * (row === 0 ? 0.8 : 0.47);
    units.forEach((e, i) => {
      const spread = row === 0 ? 0.9 : 0.8;
      const x = rect.x + rect.w * (0.5 + ((i + 0.5) / n - 0.5) * spread * Math.min(1, n / 2.2));
      out.set(e.uid, { x, y, size: base * e.scale * (row === 1 ? 0.92 : 1) });
    });
  }
  return out;
}

const TYPE_COLOR: Record<DmgType | 'true', number> = {
  slash: 0xeef4ff,
  pierce: 0xffe08a,
  blunt: 0xffb070,
  fire: 0xff6a2a,
  arcane: 0xb48cff,
  void: 0x4fffc4,
  true: 0xffffff,
};

class EnemyView extends Container {
  shadow = new Graphics();
  body = new Sprite();
  flash = new Sprite();
  aura = new Sprite(softCircle());
  cur: Anchor | null = null;
  target: Anchor | null = null;
  t = Math.random() * 10;
  hitT = 0;
  hitDir = 1;
  lungeT = 0;
  deathT = -1;
  spawnT = 0;
  broken = false;
  fx: string[] = [];
  glowColor = 0xffffff;
  look = '';
  base = 1;

  constructor(public euid: string) {
    super();
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0.18;
    this.body.anchor.set(0.5, 0.847);
    this.flash.anchor.set(0.5, 0.847);
    this.flash.alpha = 0;
    this.flash.blendMode = 'add';
    this.addChild(this.shadow, this.aura, this.body, this.flash);
  }

  async setLook(icon: string, tint: number, glow: number, fx: string[]) {
    const key = `${icon}|${tint}|${glow}`;
    if (this.look === key) return;
    this.look = key;
    this.fx = fx;
    this.glowColor = glow;
    this.aura.tint = glow;
    const [tex, white] = await Promise.all([iconTexture(icon, { size: 300, tint, glow }), iconTexture(icon, { size: 300, tint, flat: true })]);
    if (this.look !== key) return;
    this.body.texture = tex;
    this.flash.texture = white;
    this.sized = -1;
    this.applySize();
  }

  /** 마지막으로 크기를 맞춘 기준 (-1이면 아직) */
  sized = -1;

  applySize() {
    const a = this.cur;
    if (!a || !this.body.texture || this.body.texture.width <= 1 || !this.look) return;
    const s = (a.size * 1.44) / this.body.texture.width;
    this.base = s;
    this.sized = a.size;
    this.body.scale.set(s);
    this.flash.scale.set(s);
    this.shadow.clear().ellipse(0, 0, a.size * 0.42, a.size * 0.09).fill({ color: 0x000000, alpha: 0.55 });
    this.aura.scale.set((a.size / 64) * 2.2);
    this.aura.y = -a.size * 0.5;
  }

  update(dt: number) {
    this.t += dt;
    if (this.target) {
      if (!this.cur) this.cur = { ...this.target };
      const k = Math.min(1, dt * 6);
      const prevSize = this.cur.size;
      this.cur.x += (this.target.x - this.cur.x) * k;
      this.cur.y += (this.target.y - this.cur.y) * k;
      this.cur.size += (this.target.size - this.cur.size) * k;
      if (Math.abs(prevSize - this.cur.size) > 0.2 || this.sized < 0) this.applySize();
    }
    if (!this.cur || this.sized < 0) {
      this.visible = false;
      return;
    }
    this.visible = true;
    const a = this.cur;
    let ox = 0;
    let oy = 0;
    let sy = 1;
    let sx = 1;
    // 숨쉬기
    sy += Math.sin(this.t * 1.6) * 0.015;
    sx -= Math.sin(this.t * 1.6) * 0.008;
    if (this.fx.includes('float')) oy -= a.size * 0.08 + Math.sin(this.t * 1.2) * a.size * 0.04;
    if (this.fx.includes('flicker')) this.body.alpha = 0.82 + Math.sin(this.t * 13) * 0.08 + (Math.random() < 0.02 ? -0.4 : 0);
    // 피격 흔들림
    if (this.hitT > 0) {
      this.hitT = Math.max(0, this.hitT - dt);
      const k = this.hitT / 0.35;
      ox += Math.sin(this.hitT * 70) * a.size * 0.05 * k * this.hitDir;
      this.flash.alpha = k * 0.85;
    } else this.flash.alpha = 0;
    // 공격 돌진
    if (this.lungeT > 0) {
      this.lungeT = Math.max(0, this.lungeT - dt);
      const p = 1 - this.lungeT / 0.45;
      const s = Math.sin(p * Math.PI);
      oy += s * a.size * 0.18;
      sx += s * 0.12;
      sy += s * 0.12;
    }
    // 붕괴: 기울어짐
    const tilt = this.broken ? 0.12 + Math.sin(this.t * 2) * 0.02 : 0;
    // 등장
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
      this.alpha = this.spawnT;
      sy *= 0.6 + 0.4 * this.spawnT;
    }
    // 사망
    if (this.deathT >= 0) {
      this.deathT += dt;
      const p = Math.min(1, this.deathT / 0.8);
      this.alpha = 1 - p;
      sy *= 1 - p * 0.5;
      sx *= 1 + p * 0.3;
      oy += p * a.size * 0.1;
    }
    this.position.set(a.x + ox, a.y + oy);
    this.body.scale.set(this.base * sx, this.base * sy);
    this.flash.scale.set(this.base * sx, this.base * sy);
    this.body.skew.x = tilt;
    this.flash.skew.x = tilt;
    this.aura.alpha = 0.14 + Math.sin(this.t * 2) * 0.04 + (this.broken ? 0.1 : 0);
    this.shadow.position.set(-ox, -oy);
  }

  get done() {
    return this.deathT > 0.85;
  }
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  drag: number;
  gravity: number;
}

interface Shape {
  g: Graphics;
  life: number;
  max: number;
  draw(g: Graphics, p: number): void;
}

export class Battle extends Container {
  views = new Map<string, EnemyView>();
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  anchors = new Map<string, Anchor>();
  private unitLayer = new Container();
  private fxLayer = new Container();
  private particles: Particle[] = [];
  private shapes: Shape[] = [];
  private pool: Sprite[] = [];

  constructor() {
    super();
    this.addChild(this.unitLayer, this.fxLayer);
  }

  /** 엔진 상태(또는 스냅샷)와 동기화 */
  sync(enemies: Pick<EnemyUnit, 'uid' | 'row' | 'scale' | 'dead' | 'broken' | 'form' | 'def'>[], defs: (id: string) => EnemyDef | undefined) {
    this.anchors = layoutEnemies(this.rect, enemies);
    const seen = new Set<string>();
    for (const e of enemies) {
      seen.add(e.uid);
      let v = this.views.get(e.uid);
      const a = this.anchors.get(e.uid);
      if (!v) {
        if (e.dead) continue;
        v = new EnemyView(e.uid);
        this.views.set(e.uid, v);
        this.unitLayer.addChild(v);
      }
      const def = defs(e.def);
      if (def) {
        const form = e.form ? def.forms?.[e.form - 1] : undefined;
        const vis = form?.visual ?? def.visual;
        void v.setLook(form?.icon ?? def.icon, vis.tint, vis.glow ?? 0xffffff, vis.fx ?? []);
      }
      v.broken = e.broken > 0;
      if (a) {
        v.target = a;
        if (v.deathT >= 0 && !e.dead) {
          v.deathT = -1;
          v.alpha = 1;
          v.spawnT = 0;
        }
      } else if (e.dead && v.deathT < 0) v.deathT = 0;
    }
    for (const [uid, v] of this.views) {
      if (!seen.has(uid) && v.deathT < 0) v.deathT = 0;
    }
    // 후열이 뒤에 그려지도록
    this.unitLayer.children.sort((a, b) => a.position.y - b.position.y);
  }

  clear() {
    for (const v of this.views.values()) v.destroy({ children: true });
    this.views.clear();
    this.unitLayer.removeChildren();
  }

  anchor(uid: string): Anchor | null {
    return this.anchors.get(uid) ?? this.views.get(uid)?.cur ?? null;
  }

  /** 플레이어 위치 (화면 아래 중앙) */
  playerPoint(): { x: number; y: number } {
    return { x: this.rect.x + this.rect.w / 2, y: this.rect.y + this.rect.h + 40 };
  }

  update(dt: number) {
    for (const [uid, v] of this.views) {
      v.update(dt);
      if (v.done) {
        v.destroy({ children: true });
        this.views.delete(uid);
      }
    }
    this.unitLayer.children.sort((a, b) => a.position.y - b.position.y);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.pool.push(p.s);
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      const k = p.life / p.max;
      p.s.alpha = Math.min(1, k * 1.6);
      p.s.scale.set(p.s.scale.x * (1 + p.grow * dt));
    }
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const sh = this.shapes[i];
      sh.life -= dt;
      if (sh.life <= 0) {
        sh.g.destroy();
        this.shapes.splice(i, 1);
        continue;
      }
      sh.g.clear();
      sh.draw(sh.g, 1 - sh.life / sh.max);
    }
  }

  // ───────── 파티클 ─────────

  private spark(x: number, y: number, o: { color: number; n: number; speed: number; size: number; life?: number; gravity?: number; up?: number; soft?: boolean; drag?: number }) {
    for (let i = 0; i < o.n; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = o.soft === false ? hardDot() : softCircle();
      s.anchor.set(0.5);
      s.visible = true;
      s.blendMode = 'add';
      s.tint = o.color;
      s.position.set(x, y);
      const sz = (o.size * (0.5 + Math.random())) / (o.soft === false ? 16 : 64);
      s.scale.set(sz);
      if (!s.parent) this.fxLayer.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.3 + Math.random() * 0.9);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.particles.push({ s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 0), life, max: life, grow: -0.6, drag: o.drag ?? 2.5, gravity: o.gravity ?? 0 });
    }
  }

  private shape(life: number, draw: (g: Graphics, p: number) => void, add = true) {
    const g = new Graphics();
    if (add) g.blendMode = 'add';
    this.fxLayer.addChild(g);
    this.shapes.push({ g, life, max: life, draw });
  }

  // ───────── 공개 연출 API ─────────

  hit(uid: string, type: DmgType | 'true', amount: number, o: { crit?: boolean; weak?: boolean; blocked?: boolean } = {}) {
    const v = this.views.get(uid);
    const a = this.anchor(uid);
    if (!a) return;
    const cx = a.x;
    const cy = a.y - a.size * 0.5;
    if (v && amount > 0) {
      v.hitT = 0.35;
      v.hitDir = Math.random() < 0.5 ? -1 : 1;
    }
    const col = TYPE_COLOR[type];
    const big = o.crit || o.weak ? 1.5 : 1;
    const R = a.size * 0.55 * big;
    switch (type) {
      case 'slash': {
        const ang = -0.6 + Math.random() * 0.3;
        this.shape(0.32, (g, p) => {
          const len = R * 2.2;
          const prog = Math.min(1, p * 2.2);
          const x0 = cx - Math.cos(ang) * len * 0.5;
          const y0 = cy - Math.sin(ang) * len * 0.5;
          g.moveTo(x0, y0)
            .lineTo(x0 + Math.cos(ang) * len * prog, y0 + Math.sin(ang) * len * prog)
            .stroke({ width: (8 + 10 * big) * (1 - p), color: col, alpha: 1 - p });
        });
        this.spark(cx, cy, { color: col, n: 10, speed: 260, size: 14 });
        break;
      }
      case 'pierce': {
        const pp = this.playerPoint();
        this.shape(0.22, (g, p) => {
          const k = Math.min(1, p * 3);
          g.moveTo(pp.x + (cx - pp.x) * Math.max(0, k - 0.35), pp.y + (cy - pp.y) * Math.max(0, k - 0.35))
            .lineTo(pp.x + (cx - pp.x) * k, pp.y + (cy - pp.y) * k)
            .stroke({ width: 4 * big, color: col, alpha: 1 - p * 0.5 });
        });
        this.spark(cx, cy, { color: col, n: 12, speed: 300, size: 10, soft: false, life: 0.4 });
        break;
      }
      case 'blunt': {
        this.shape(0.35, (g, p) => {
          g.circle(cx, cy, R * (0.2 + p * 0.9)).stroke({ width: 10 * (1 - p) * big, color: col, alpha: 1 - p });
        });
        this.spark(cx, cy, { color: col, n: 8, speed: 180, size: 18 });
        break;
      }
      case 'fire': {
        this.spark(cx, cy, { color: 0xff5a1a, n: 22, speed: 160, size: 26, up: 120, gravity: -260, life: 0.8 });
        this.spark(cx, cy, { color: 0xffd060, n: 10, speed: 120, size: 14, up: 80, gravity: -200 });
        break;
      }
      case 'arcane': {
        this.shape(0.6, (g, p) => {
          const r = R * (0.5 + p * 0.4);
          g.circle(cx, cy, r).stroke({ width: 3, color: col, alpha: 1 - p });
          const pts: number[] = [];
          for (let i = 0; i < 5; i++) {
            const ang = (i * 4 * Math.PI) / 5 + p * 2 - Math.PI / 2;
            pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
          }
          g.poly(pts).stroke({ width: 2, color: col, alpha: (1 - p) * 0.9 });
        });
        this.spark(cx, cy, { color: col, n: 14, speed: 150, size: 16 });
        break;
      }
      case 'void': {
        this.shape(
          0.55,
          (g, p) => {
            g.circle(cx, cy, R * (1.1 - p * 0.9)).fill({ color: 0x000000, alpha: 0.55 * (1 - p) });
            for (let i = 0; i < 6; i++) {
              const ang = (i / 6) * Math.PI * 2 + p * 3;
              const r1 = R * (1.2 - p);
              g.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1)
                .quadraticCurveTo(cx + Math.cos(ang + 0.8) * r1 * 0.6, cy + Math.sin(ang + 0.8) * r1 * 0.6, cx, cy)
                .stroke({ width: 3, color: col, alpha: 1 - p });
            }
          },
          false,
        );
        this.spark(cx, cy, { color: col, n: 12, speed: 120, size: 18 });
        break;
      }
      default:
        this.spark(cx, cy, { color: col, n: 8, speed: 160, size: 12 });
    }
    if (o.blocked) this.spark(cx, cy, { color: 0x9fd0ff, n: 6, speed: 140, size: 10, soft: false });
  }

  dot(uid: string, kind: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const color = kind === 'bleed' ? 0xd02020 : kind === 'poison' ? 0x60e040 : kind === 'burn' ? 0xff6a2a : 0xffffff;
    this.spark(a.x, a.y - a.size * 0.5, { color, n: 10, speed: 80, size: 14, gravity: kind === 'burn' ? -200 : 200 });
    const v = this.views.get(uid);
    if (v) v.hitT = 0.2;
  }

  lunge(uid: string) {
    const v = this.views.get(uid);
    if (v) v.lungeT = 0.45;
  }

  pulse(uid: string, color: number) {
    const a = this.anchor(uid);
    if (!a) return;
    const cx = a.x;
    const cy = a.y - a.size * 0.5;
    this.shape(0.6, (g, p) => {
      g.circle(cx, cy, a.size * (0.3 + p * 0.5)).stroke({ width: 4 * (1 - p), color, alpha: 0.9 * (1 - p) });
    });
    this.spark(cx, cy, { color, n: 10, speed: 90, size: 14, up: 40 });
  }

  shield(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const cx = a.x;
    const cy = a.y - a.size * 0.5;
    this.shape(0.5, (g, p) => {
      g.arc(cx, cy, a.size * 0.6, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 6 * (1 - p), color: 0x8fd0ff, alpha: 1 - p });
    });
  }

  breakFx(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const cx = a.x;
    const cy = a.y - a.size * 0.5;
    this.spark(cx, cy, { color: 0xffe080, n: 30, speed: 420, size: 12, soft: false, life: 0.7, gravity: 500 });
    this.shape(0.5, (g, p) => {
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const r0 = a.size * 0.2 + p * a.size * 0.6;
        g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0)
          .lineTo(cx + Math.cos(ang) * (r0 + 30), cy + Math.sin(ang) * (r0 + 30))
          .stroke({ width: 4 * (1 - p), color: 0xffe080, alpha: 1 - p });
      }
    });
  }

  death(uid: string) {
    const a = this.anchor(uid);
    const v = this.views.get(uid);
    if (a) this.spark(a.x, a.y - a.size * 0.5, { color: v?.glowColor ?? 0xffffff, n: 26, speed: 140, size: 20, up: 60, gravity: -80, life: 1 });
    if (v && v.deathT < 0) v.deathT = 0;
  }

  spawnFx(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    this.spark(a.x, a.y - a.size * 0.3, { color: 0x9fe8d8, n: 16, speed: 100, size: 18, up: 40 });
  }

  horror(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const pp = this.playerPoint();
    const sx = a.x;
    const sy = a.y - a.size * 0.6;
    this.shape(0.7, (g, p) => {
      for (let i = 0; i < 3; i++) {
        const k = Math.min(1, p * 1.6 - i * 0.15);
        if (k <= 0) continue;
        const r = 30 + k * Math.hypot(pp.x - sx, pp.y - sy);
        g.arc(sx, sy, r, Math.PI * 0.2, Math.PI * 0.8).stroke({ width: 3, color: 0x4fffc4, alpha: (1 - k) * 0.8 });
      }
    });
  }

  tentacle(fromPlayer: boolean, uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const pp = this.playerPoint();
    const x1 = a.x;
    const y1 = a.y - a.size * 0.4;
    const x0 = fromPlayer ? pp.x + (Math.random() - 0.5) * 120 : x1;
    const y0 = fromPlayer ? pp.y : y1 - 200;
    this.shape(
      0.5,
      (g, p) => {
        const k = Math.min(1, p * 2.5);
        const mx = (x0 + x1) / 2 + Math.sin(p * 10) * 30;
        const my = (y0 + y1) / 2;
        g.moveTo(x0, y0)
          .quadraticCurveTo(mx, my, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
          .stroke({ width: 10 * (1 - p * 0.7), color: 0x0a2a22, alpha: 1 - p * 0.6 });
        g.moveTo(x0, y0)
          .quadraticCurveTo(mx, my, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)
          .stroke({ width: 2, color: 0x4fffc4, alpha: 1 - p });
      },
      false,
    );
  }
}
