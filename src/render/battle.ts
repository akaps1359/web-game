import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { DmgType, EnemyDef, EnemyUnit, IntentKind } from '../engine/types';
import { artTextures, hasArt, iconTexture, softCircle } from './textures';
import { E_IN, lerpColor, rand, Vfx } from './vfx';
import {
  blockedHit,
  bleedFx,
  breakBurst,
  buffFx,
  burnFx,
  critBurst,
  debuffFx,
  edgeTendrils,
  fleePuff,
  gather,
  glow,
  healPlayer,
  healSpiral,
  hitArcane,
  hitBlunt,
  hitBullet,
  hitFire,
  hitPierce,
  hitSlash,
  hitTrue,
  hitVoid,
  horrorRipple,
  motes,
  muzzleFlash,
  playerBlunt,
  playerEldritch,
  playerFire,
  playerPierce,
  playerSlash,
  playerTrue,
  poisonFx,
  recoverFx,
  revealGlint,
  ring,
  runePulse,
  smoke,
  softPulse,
  spawnPortal,
  tentacleLash,
  type HitCtx,
  type Pt,
} from './vfxRecipes';
import { blurredSilhouette, silhouetteCells, VT } from './vfxTextures';
import { PlayerWard } from './vfxWard';

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
  /** 이 적이 차지한 가로 칸 너비 (이름표 폭) */
  slot?: number;
}

/** 적 그림이 바뀌었을 때 (화면의 의도 표시 위치를 다시 잡도록) */
let onLook: (() => void) | undefined;
export function setOnLook(fn: () => void) {
  onLook = fn;
}

/**
 * 적 배치 — 한 줄에 칸을 나눠 겹치지 않게 (DOM 오버레이와 공유).
 * 후열은 전열 사이사이에 끼워 넣고, 조금 위로 올리고 작게 그려 뒤에 있는 느낌만 준다.
 * 세로로 두 줄을 쌓으면 폰(사파리 주소창·툴바가 있는 화면)에서 이름표·의도가 서로 겹친다.
 */
export function layoutEnemies(rect: Rect, list: { uid: string; row: 0 | 1; scale: number; dead: boolean }[]): Map<string, Anchor> {
  const out = new Map<string, Anchor>();
  const alive = list.filter((e) => !e.dead);
  if (!alive.length) return out;
  const front = alive.filter((e) => e.row === 0);
  const back = alive.filter((e) => e.row === 1);
  // 왼쪽부터: 전열·후열을 번갈아, 남는 쪽은 뒤에 (가운데가 비지 않게 바깥 → 안쪽 순서는 그대로)
  const order: typeof alive = [];
  for (let i = 0; i < Math.max(front.length, back.length); i++) {
    if (back[i] && i % 2 === 1) order.push(back[i]);
    if (front[i]) order.push(front[i]);
    if (back[i] && i % 2 === 0) order.push(back[i]);
  }
  const PLATE = 78; // 발밑 이름표·체력·버팀·상태 한 줄 높이 (4 + 이름 16 + 체력 11 + 버팀 16 + 상태 20 + 틈) — 모자라면 상태 아이콘이 아래 내 정보 칸을 덮는다
  const INTENT = 34; // 머리 위 의도 표시
  const HEAD = 1.25; // 형체 높이 ÷ 크기 (그림 기준)
  const feet = rect.y + rect.h - PLATE;
  const lift = Math.min(rect.h * 0.13, 46);
  const weights = order.map((e) => Math.max(0.6, e.scale) * (e.row === 1 ? 0.82 : 1));
  const W = weights.reduce((a, b) => a + b, 0);
  const usable = rect.w * 0.96;
  const left = rect.x + (rect.w - usable) / 2;
  let acc = 0;
  order.forEach((e, i) => {
    const slot = (usable / W) * weights[i];
    const x = left + ((acc + weights[i] / 2) / W) * usable;
    acc += weights[i];
    const y = feet - (e.row === 1 ? lift : 0);
    const room = (y - rect.y - INTENT) / HEAD; // 의도 표시가 화면 위로 넘치지 않을 만큼
    const base = Math.min(rect.h * 0.5, rect.w * 0.42) * Math.max(0.6, e.scale) * (e.row === 1 ? 0.84 : 1);
    const size = Math.max(36, Math.min(base, slot * 1.02, room));
    out.set(e.uid, { x, y, size, slot });
  });
  return out;
}

const TYPE_COLOR: Record<DmgType | 'true', number> = {
  slash: 0xbfd8ff,
  pierce: 0xffe08a,
  blunt: 0xffb070,
  fire: 0xff6a2a,
  arcane: 0xb48cff,
  void: 0x4fffc4,
  true: 0xffffff,
};

const SHELL = 0x8fd0ff;
/** 사망: 흰 섬광 → 위에서부터 타들어 가며 재와 불티로 흩어진다 */
const DEATH_DUR = 1.1;
const DEATH_FLASH = 0.1;
const FLEE_DUR = 0.55;

type TeleKind = 'attack' | 'debuff' | 'horror' | 'charge' | 'buff' | 'block' | 'summon' | 'heal' | 'other';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

class EnemyView extends Container {
  shadow = new Graphics();
  /** 몸 + 피격 섬광 (사망 시 마스크로 지워 나간다) */
  fig = new Container();
  body = new Sprite();
  flash = new Sprite();
  aura = new Sprite(softCircle());
  cur: Anchor | null = null;
  target: Anchor | null = null;
  t = Math.random() * 10;
  hitT = 0;
  hitDir = 1;
  deathT = -1;
  spawnT = 0;
  broken = false;
  fx: string[] = [];
  glowColor = 0xffffff;
  look = '';
  base = 1;
  /** 이계 보스: 촉수와 오라 */
  eldritchBoss = false;
  tent = new Graphics();

  // ── 이펙트 상태 ──
  /** 경직 (히트 스톱) */
  freezeT = 0;
  private recoilT = 0;
  private recoilK = 1;
  private squashT = 0;
  private squashAmt = 0;
  private tintT = 0;
  private tintDur = 0.4;
  private tintCol = 0xffffff;
  private tintMax = 0;
  private teleT = -1;
  private teleDur = 0.5;
  private teleKind: TeleKind = 'attack';
  private ghostStep = 0;
  /** 방어막 껍질 */
  private shell: Sprite | null = null;
  private shellSrc: Texture | null = null;
  private shellK = 1;
  shellBase = 0;
  private shellA = 0;
  shellFlash = 0;
  private shellSparkT = 0;
  // 사망 연출
  private maskG: Graphics | null = null;
  private burn: Sprite | null = null;
  private cells: Float32Array | null | undefined = undefined;
  private emberAcc = 0;
  private bounds = { u0: 0, u1: 1, v0: 0, v1: 1 };

  constructor(
    public euid: string,
    private vfx: Vfx,
  ) {
    super();
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0.18;
    this.body.anchor.set(0.5, 0.847);
    this.flash.anchor.set(0.5, 0.847);
    this.flash.alpha = 0;
    this.flash.blendMode = 'add';
    this.fig.addChild(this.body, this.flash);
    this.addChild(this.shadow, this.aura, this.tent, this.fig);
  }

  /** 이계 보스 뒤로 꿈틀대는 촉수 (점점 가늘어지는 곡선) */
  private drawTentacles(a: Anchor) {
    const g = this.tent.clear();
    if (!this.eldritchBoss || this.isArt) return;
    const S = a.size;
    const n = 6;
    const N = 14;
    for (let k = 0; k < n; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const tier = Math.floor(k / 2);
      const sway = Math.sin(this.t * (0.6 + k * 0.17) + k * 1.9);
      const sway2 = Math.cos(this.t * (0.45 + k * 0.13) + k * 0.7);
      const p0 = { x: side * S * (0.1 + tier * 0.05), y: -S * (0.15 + tier * 0.12) };
      const c1 = { x: side * S * (0.55 + tier * 0.12), y: -S * (0.2 + tier * 0.15) + sway * S * 0.08 };
      const c2 = { x: side * S * (0.85 + tier * 0.1) + sway2 * S * 0.12, y: -S * (0.6 + tier * 0.22) };
      const p3 = { x: side * S * (0.55 + tier * 0.15) + sway * S * 0.2, y: -S * (0.95 + tier * 0.25) + sway2 * S * 0.08 };
      const pt = (u: number) => {
        const v = 1 - u;
        return {
          x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x,
          y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y,
        };
      };
      const pts = Array.from({ length: N + 1 }, (_, i) => pt(i / N));
      const w0 = S * (0.11 - tier * 0.02);
      for (let i = 0; i < N; i++) {
        const taper = 1 - i / N;
        g.moveTo(pts[i].x, pts[i].y)
          .lineTo(pts[i + 1].x, pts[i + 1].y)
          .stroke({ width: w0 * taper + 1.5, color: 0x030807, alpha: 0.96, cap: 'round' });
      }
      for (let i = 0; i < N; i++) {
        const taper = 1 - i / N;
        g.moveTo(pts[i].x - side * w0 * 0.18 * taper, pts[i].y)
          .lineTo(pts[i + 1].x - side * w0 * 0.18 * taper, pts[i + 1].y)
          .stroke({ width: Math.max(1, w0 * 0.22 * taper), color: this.glowColor, alpha: 0.55, cap: 'round' });
      }
    }
  }

  /** AI 일러스트 사용 여부 */
  isArt = false;

  async setLook(icon: string, tint: number, glow: number, fx: string[], art?: string) {
    const key = art ? `art:${art}` : `${icon}|${tint}|${glow}`;
    if (this.look === key) return;
    this.look = key;
    this.fx = fx;
    this.glowColor = glow;
    this.aura.tint = glow;
    let tex: Texture;
    let white: Texture;
    let top = 0.15;
    let cx = 0.5;
    if (art) {
      try {
        ({ tex, white, top, cx } = await artTextures(art));
      } catch {
        // 그림을 못 불러오면 아이콘으로
        [tex, white] = await Promise.all([iconTexture(icon, { size: 300, tint, glow }), iconTexture(icon, { size: 300, tint, flat: true })]);
        art = undefined;
      }
    } else {
      [tex, white] = await Promise.all([iconTexture(icon, { size: 300, tint, glow }), iconTexture(icon, { size: 300, tint, flat: true })]);
    }
    if (this.look !== key) return;
    this.isArt = !!art;
    const ay = this.isArt ? 0.97 : 0.847;
    // 발에서 형체 윗단까지의 높이 (크기 대비) — 의도 표시를 머리 위에 띄우는 데 쓴다
    this.headroom = this.isArt ? (ay - top) * 1.32 : 1.08;
    // 그림 속 형체가 한쪽으로 치우쳐 있어도 발이 자리 한가운데(이름표 위)에 오게
    const ax = this.isArt ? cx : 0.5;
    this.body.anchor.set(ax, ay);
    this.flash.anchor.set(ax, ay);
    this.body.texture = tex;
    this.flash.texture = white;
    this.cells = undefined;
    this.sized = -1;
    this.applySize();
    if (this.shell) this.ensureShell();
    onLook?.();
  }

  /** 발에서 형체 윗단까지의 높이 ÷ 크기 */
  headroom = 1.08;

  /** 마지막으로 크기를 맞춘 기준 (-1이면 아직) */
  sized = -1;

  applySize() {
    const a = this.cur;
    if (!a || !this.body.texture || this.body.texture.width <= 1 || !this.look) return;
    const s = (a.size * (this.isArt ? 1.32 : 1.44)) / this.body.texture.width;
    this.base = s;
    this.sized = a.size;
    this.body.scale.set(s);
    this.flash.scale.set(s);
    this.shadow.clear().ellipse(0, 0, a.size * 0.42, a.size * 0.09).fill({ color: 0x000000, alpha: 0.55 });
    this.aura.scale.set((a.size / 64) * 2.2);
    this.aura.y = -a.size * 0.5;
  }

  // ── 이펙트 트리거 ──

  /** 맞고 뒤로 밀려난다 (카메라에서 멀어짐) */
  recoil(k = 1) {
    this.recoilT = 0.28;
    this.recoilK = k;
  }

  /** 둔기에 찌그러졌다 튀어 오른다 */
  squash(amt = 0.16) {
    this.squashT = 0.34;
    this.squashAmt = amt;
  }

  /** 몸에 색이 번진다 (회복·강화·약화) */
  tintFlash(color: number, alpha = 0.6, dur = 0.45) {
    this.tintCol = color;
    this.tintMax = alpha;
    this.tintDur = dur;
    this.tintT = dur;
  }

  /** 행동 예고 동작 */
  telegraph(kind: TeleKind) {
    this.teleKind = kind;
    this.teleDur = kind === 'attack' || kind === 'debuff' ? 0.52 : kind === 'horror' ? 0.6 : 0.5;
    this.teleT = 0;
    this.ghostStep = 0;
  }

  /** 흐린 실루엣으로 방어막 껍질을 만든다 */
  ensureShell() {
    const white = this.flash.texture;
    if (!white || white.width <= 1) return;
    if (this.shell && this.shellSrc === white) return;
    const b = blurredSilhouette(white);
    if (!b) return;
    if (!this.shell) {
      this.shell = new Sprite(b.tex);
      this.shell.blendMode = 'add';
      this.shell.tint = SHELL;
      this.shell.visible = false;
      this.addChild(this.shell);
    } else this.shell.texture = b.tex;
    this.shellSrc = white;
    this.shellK = b.k;
    this.shell.anchor.set((b.pad + this.flash.anchor.x * white.width * b.k) / b.tex.width, (b.pad + this.flash.anchor.y * white.height * b.k) / b.tex.height);
  }

  /** 실루엣의 칸 목록 (없으면 null) */
  private silCells(): Float32Array | null {
    if (this.cells === undefined) {
      const tex = this.flash.texture;
      this.cells = tex && tex.width > 1 ? silhouetteCells(tex) : null;
      if (this.cells) {
        let u0 = 1;
        let u1 = 0;
        let v0 = 1;
        let v1 = 0;
        for (let i = 0; i < this.cells.length; i += 2) {
          u0 = Math.min(u0, this.cells[i]);
          u1 = Math.max(u1, this.cells[i]);
          v0 = Math.min(v0, this.cells[i + 1]);
          v1 = Math.max(v1, this.cells[i + 1]);
        }
        this.bounds = { u0, u1, v0, v1 };
      }
    }
    return this.cells;
  }

  /** 텍스처 좌표 (u, v) → 화면 좌표 */
  private uvToWorld(u: number, v: number, out: Pt): Pt {
    const tex = this.flash.texture;
    out.x = this.x + (u - this.flash.anchor.x) * tex.width * this.body.scale.x;
    out.y = this.y + (v - this.flash.anchor.y) * tex.height * this.body.scale.y;
    return out;
  }

  /** 몸 위의 아무 점 (화면 좌표). vBand가 있으면 그 높이 근처에서 */
  bodyPoint(out: Pt, vBand?: number): Pt | null {
    const cells = this.silCells();
    if (!cells || !this.cur) return null;
    const n = cells.length / 2;
    for (let tries = 0; tries < (vBand === undefined ? 1 : 14); tries++) {
      const i = ((Math.random() * n) | 0) * 2;
      if (vBand !== undefined && Math.abs(cells[i + 1] - vBand) > 0.04) continue;
      return this.uvToWorld(cells[i] + (Math.random() - 0.5) / 40, cells[i + 1] + (Math.random() - 0.5) / 40, out);
    }
    return null;
  }

  update(dt: number) {
    // 히트 스톱: 자세를 유지한 채 하얗게 멈춘다
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.flash.alpha = 1;
      this.flash.tint = 0xffffff;
      return;
    }
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
    let flashA = 0;
    let flashTint = 0xffffff;
    let ghost = 0;
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
      flashA = k * 0.85;
    }
    // 뒤로 밀림
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt);
      const k = (this.recoilT / 0.28) ** 2 * this.recoilK;
      oy -= a.size * 0.055 * k;
      sx *= 1 - 0.05 * k;
      sy *= 1 - 0.05 * k;
    }
    // 찌그러짐 (감쇠 진동)
    if (this.squashT > 0) {
      this.squashT = Math.max(0, this.squashT - dt);
      const q = this.squashT / 0.34;
      const amt = this.squashAmt * q * Math.cos((1 - q) * 10);
      sy *= 1 - amt;
      sx *= 1 + amt * 0.7;
    }
    // 색 번짐
    if (this.tintT > 0) {
      this.tintT = Math.max(0, this.tintT - dt);
      const k = (this.tintT / this.tintDur) * this.tintMax;
      if (k > flashA) {
        flashA = k;
        flashTint = this.tintCol;
      }
    }
    // 행동 예고
    if (this.teleT >= 0) {
      this.teleT += dt;
      const p = this.teleT / this.teleDur;
      if (p >= 1) this.teleT = -1;
      else {
        const S = a.size;
        switch (this.teleKind) {
          case 'attack':
          case 'debuff': {
            const reach = this.teleKind === 'attack' ? 1 : 0.6;
            if (p < 0.34) {
              // 움찔 물러서며 힘을 모은다
              const w = Math.sin((p / 0.34) * Math.PI * 0.5);
              oy -= S * 0.07 * w;
              sx *= 1 - 0.05 * w;
              sy *= 1 - 0.035 * w;
            } else if (p < 0.5) {
              // 확 덮쳐 온다 (+ 잔상)
              const q = (p - 0.34) / 0.16;
              const e = q * q;
              oy += S * (-0.07 + 0.3 * reach * e);
              sx *= 0.95 + 0.27 * reach * e;
              sy *= 0.965 + 0.25 * reach * e;
              if (q > this.ghostStep / 3 && this.ghostStep < 3) {
                this.ghostStep++;
                ghost = this.ghostStep;
              }
            } else {
              const q = (p - 0.5) / 0.5;
              const e = 1 - (1 - q) * (1 - q);
              oy += S * 0.23 * reach * (1 - e);
              sx *= 1 + 0.22 * reach * (1 - e);
              sy *= 1 + 0.215 * reach * (1 - e);
            }
            if (this.teleKind === 'debuff' && p < 0.6) {
              flashA = Math.max(flashA, 0.35 * Math.sin((p / 0.6) * Math.PI));
              flashTint = 0xa070ff;
            }
            break;
          }
          case 'horror': {
            // 부풀어 오르며 떨린다
            const w = Math.sin(p * Math.PI);
            sx *= 1 + 0.12 * w;
            sy *= 1 + 0.14 * w;
            ox += Math.sin(this.t * 63) * S * 0.014 * w;
            oy -= S * 0.04 * w;
            if (0.4 * w > flashA) {
              flashA = 0.4 * w;
              flashTint = 0x4fffc4;
            }
            break;
          }
          case 'charge': {
            const w = Math.sin(p * Math.PI);
            sy *= 1 - 0.08 * w;
            sx *= 1 + 0.06 * w;
            ox += Math.sin(this.t * 55) * S * 0.01 * w;
            if (0.35 * w > flashA) {
              flashA = 0.35 * w;
              flashTint = 0xffd040;
            }
            break;
          }
          case 'block': {
            const w = Math.sin(p * Math.PI);
            sy *= 1 - 0.06 * w;
            sx *= 1 + 0.04 * w;
            break;
          }
          default: {
            // 몸을 일으킨다
            const w = Math.sin(p * Math.PI);
            oy -= S * 0.05 * w;
            sy *= 1 + 0.05 * w;
          }
        }
      }
    }
    // 붕괴: 기울어짐
    const tilt = this.broken ? 0.12 + Math.sin(this.t * 2) * 0.02 : 0;
    // 등장: 바닥에서 솟아오른다
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 1.8);
      const s = this.spawnT;
      this.alpha = Math.min(1, s * 1.6);
      const u = s - 1;
      sy *= Math.max(0.05, 1 + 2.4 * u * u * u + 1.4 * u * u);
      if (s < 0.7 && 0.8 * (1 - s / 0.7) > flashA) {
        flashA = 0.8 * (1 - s / 0.7);
        flashTint = this.glowColor;
      }
    }
    // 사망
    let dying = 0;
    if (this.deathT >= 0 && this.fleeing) {
      // 도주: 뒤로 물러나며 어둠 속으로 사라진다 (타 버리지 않음)
      this.deathT += dt;
      const q = Math.min(1, this.deathT / FLEE_DUR);
      const e = q * q;
      this.alpha = 1 - e;
      oy -= a.size * 0.3 * e;
      sx *= 1 - 0.35 * e;
      sy *= 1 - 0.35 * e;
      this.shadow.alpha = 1 - q;
    } else if (this.deathT >= 0) {
      this.deathT += dt;
      if (this.deathT < DEATH_FLASH) {
        flashA = 1;
        flashTint = 0xffffff;
        sx *= 1.04;
        sy *= 1.04;
      } else {
        dying = Math.min(1, (this.deathT - DEATH_FLASH) / (DEATH_DUR - DEATH_FLASH));
        flashA = 0.65 * (1 - dying);
        flashTint = lerpColor(0xffffff, 0xff7a30, Math.min(1, dying * 3));
        this.body.tint = lerpColor(0xffffff, 0x6a4a40, dying);
        this.shadow.alpha = 1 - dying;
        this.aura.alpha = 0;
      }
    }
    this.position.set(a.x + ox, a.y + oy);
    this.body.scale.set(this.base * sx, this.base * sy);
    this.flash.scale.set(this.base * sx, this.base * sy);
    this.body.skew.x = tilt;
    this.flash.skew.x = tilt;
    this.flash.alpha = flashA;
    this.flash.tint = flashTint;
    if (this.deathT < 0) this.aura.alpha = (this.eldritchBoss ? 0.32 : 0.14) + Math.sin(this.t * 2) * 0.04 + (this.broken ? 0.1 : 0);
    if (this.eldritchBoss) {
      this.aura.scale.set((a.size / 64) * 3.4);
      this.drawTentacles(a);
      this.tent.scale.set(sx, sy);
      if (this.deathT >= DEATH_FLASH) this.tent.alpha = 1 - dying;
    }
    this.shadow.position.set(-ox, -oy);
    // 방어막 껍질
    this.shellA += (this.shellBase - this.shellA) * Math.min(1, dt * 5);
    this.shellFlash = Math.max(0, this.shellFlash - dt * 2.4);
    if (this.shell) {
      const sa = this.deathT >= 0 ? 0 : this.shellA * (0.85 + 0.15 * Math.sin(this.t * 3.1)) + this.shellFlash * 0.85;
      this.shell.visible = sa > 0.01;
      if (this.shell.visible) {
        const grow = 1.05 + 0.05 * this.shellFlash + 0.012 * Math.sin(this.t * 2.3);
        this.shell.alpha = Math.min(1, sa);
        this.shell.scale.set(((this.base * sx) / this.shellK) * grow, ((this.base * sy) / this.shellK) * grow);
        this.shell.skew.x = tilt;
        this.shell.tint = lerpColor(SHELL, 0xeaf6ff, Math.min(1, this.shellFlash));
      }
      // 방어막이 남아 있는 동안 몸 위로 육각 무늬가 잔잔히 반짝인다
      if (this.shellBase > 0 && this.deathT < 0 && this.shellA > 0.15) {
        this.shellSparkT -= dt;
        if (this.shellSparkT <= 0 && this.vfx.room(60)) {
          this.shellSparkT = rand(0.3, 0.55);
          const p = this.bodyPoint(this.tmp);
          if (p) motes(this.vfx, 'fxA', p.x, p.y, 1, { tex: VT.hex, size: [9, 15], life: [0.5, 0.8], tint: 0xa8dcff, alpha: 0.75, grow: 1.4, fadeIn: 0.25 });
        }
      }
    }
    if (ghost) this.afterimage(0.42 - ghost * 0.1);
    if (this.deathT >= DEATH_FLASH && !this.fleeing) this.dissolve(dying, dt);
  }

  /** 덮쳐 오는 동안 남는 잔상 */
  private afterimage(alpha: number) {
    const tex = this.flash.texture;
    if (!tex || tex.width <= 1) return;
    this.vfx.emit('fxB', tex, this.x, this.y, {
      life: 0.22,
      anchorX: this.flash.anchor.x,
      anchorY: this.flash.anchor.y,
      scale: this.body.scale.x,
      scale1: this.body.scale.x * 1.06,
      ratio: this.body.scale.y / this.body.scale.x,
      tint: this.teleKind === 'debuff' ? 0xa070ff : this.glowColor,
      alpha,
      fadeIn: 0.01,
      fadeOut: 0.02,
      force: true,
    });
  }

  private tmp: Pt = { x: 0, y: 0 };

  /** 위에서부터 타들어 가는 사라짐 */
  private dissolve(q: number, dt: number) {
    const cells = this.silCells();
    const b = this.bounds;
    const tex = this.flash.texture;
    if (!tex || tex.width <= 1) return;
    const e = q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
    const lineV = b.v0 + (b.v1 - b.v0 + 0.02) * e;
    const sclY = this.body.scale.y;
    const sclX = this.body.scale.x;
    const ay = this.flash.anchor.y;
    const lineY = (lineV - ay) * tex.height * sclY;
    const bottomY = (1 - ay) * tex.height * sclY + 6;
    const halfW = Math.max(20, ((b.u1 - b.u0) * tex.width * sclX) / 2 + 12);
    if (!this.maskG) {
      this.maskG = new Graphics();
      this.addChild(this.maskG);
      this.fig.mask = this.maskG;
      this.burn = new Sprite(VT.glow());
      this.burn.anchor.set(0.5);
      this.burn.blendMode = 'add';
      this.burn.tint = 0xff8a30;
      this.addChild(this.burn);
    }
    const cxl = ((b.u0 + b.u1) / 2 - this.flash.anchor.x) * tex.width * sclX;
    this.maskG.clear().rect(cxl - halfW * 1.5, lineY, halfW * 3, Math.max(0, bottomY - lineY)).fill(0xffffff);
    const burn = this.burn!;
    burn.position.set(cxl, lineY);
    burn.scale.set((halfW * 2.3) / 128, 26 / 128);
    burn.alpha = q < 0.95 ? 0.9 : (1 - q) * 18;
    // 불티와 재
    const fx = this.vfx;
    this.emberAcc += dt * (40 + this.cur!.size * 0.35);
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      if (!fx.room()) break;
      let p: Pt | null = cells ? this.bodyPoint(this.tmp, lineV) : null;
      if (!p) {
        p = this.tmp;
        p.x = this.x + cxl + (Math.random() - 0.5) * halfW * 1.6;
        p.y = this.y + lineY;
      }
      if (Math.random() < 0.62) {
        fx.emit('fxA', VT.core(), p.x, p.y, {
          vx: rand(-30, 30),
          vy: -rand(50, 150),
          ay: -60,
          drag: 0.8,
          life: rand(0.6, 1.1),
          scale: rand(6, 11) / 64,
          scale1: 0.02,
          ease: E_IN,
          tint: Math.random() < 0.5 ? 0xffd080 : this.glowColor,
          tint1: 0xff3000,
          wobble: 7,
          flicker: 0.35,
          fadeIn: 0.05,
          fadeOut: 0.5,
        });
      } else {
        const s = rand(10, 20) / 128;
        fx.emit('fxN', VT.smokes()[(Math.random() * 2) | 0], p.x, p.y, {
          vx: rand(-20, 20),
          vy: -rand(30, 90),
          drag: 0.6,
          life: rand(0.8, 1.3),
          scale: s,
          scale1: s * 2.4,
          rot: Math.random() * 6.28,
          spin: rand(-1, 1),
          tint: 0x2a2420,
          alpha: 0.65,
          wobble: 5,
          fadeIn: 0.1,
          fadeOut: 0.4,
        });
      }
    }
  }

  /** 도주 중 (사망 연출 대신 물러나며 사라진다) */
  fleeing = false;

  /** 사라지던 중 되살아남 (부활 특성 등) — 사망 연출 흔적을 지운다 */
  revive() {
    this.deathT = -1;
    this.fleeing = false;
    this.alpha = 1;
    this.spawnT = 0;
    if (this.maskG) {
      this.fig.mask = null;
      this.maskG.destroy();
      this.maskG = null;
    }
    if (this.burn) {
      this.burn.destroy();
      this.burn = null;
    }
    this.body.tint = 0xffffff;
    this.shadow.alpha = 1;
    this.tent.alpha = 1;
    this.emberAcc = 0;
  }

  get done() {
    return this.deathT > (this.fleeing ? FLEE_DUR : DEATH_DUR) + 0.05;
  }
}

export class Battle extends Container {
  views = new Map<string, EnemyView>();
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  anchors = new Map<string, Anchor>();
  /** 파티클 엔진 */
  readonly vfx = new Vfx();
  /** 플레이어 결계 */
  readonly ward: PlayerWard;
  /** 게임 속도 (연출 배속) */
  timeScale = 1;
  private unitLayer = new Container();
  private tmp: Pt = { x: 0, y: 0 };

  constructor() {
    super();
    const L = this.vfx.layers;
    this.ward = new PlayerWard(this.vfx);
    this.addChild(L.under, this.unitLayer, L.fxB, L.fxN, L.fxA, this.ward, L.scB, L.scN, L.scA);
  }

  /** 엔진 상태(또는 스냅샷)와 동기화 */
  sync(enemies: (Pick<EnemyUnit, 'uid' | 'row' | 'scale' | 'dead' | 'broken' | 'form' | 'def'> & { block?: number })[], defs: (id: string) => EnemyDef | undefined) {
    this.anchors = layoutEnemies(this.rect, enemies);
    const seen = new Set<string>();
    for (const e of enemies) {
      seen.add(e.uid);
      let v = this.views.get(e.uid);
      const a = this.anchors.get(e.uid);
      if (!v) {
        if (e.dead) continue;
        v = new EnemyView(e.uid, this.vfx);
        this.views.set(e.uid, v);
        this.unitLayer.addChild(v);
      }
      const def = defs(e.def);
      if (def) {
        v.eldritchBoss = def.tier === 'boss' && !!def.eldritch;
        const form = e.form ? def.forms?.[e.form - 1] : undefined;
        const vis = form?.visual ?? def.visual;
        // 변신 형태 그림(id@2)이 없으면 기본 그림을 쓴다
        const formKey = e.form ? `${def.id}@${e.form + 1}` : def.id;
        const art = hasArt(formKey) ? formKey : hasArt(def.id) ? def.id : undefined;
        void v.setLook(form?.icon ?? def.icon, vis.tint, vis.glow ?? 0xffffff, vis.fx ?? [], art);
      }
      v.broken = e.broken > 0;
      if (e.block !== undefined) {
        v.shellBase = e.block > 0 && !e.dead ? 0.32 : 0;
        if (e.block > 0) v.ensureShell();
      }
      if (a) {
        v.target = a;
        if (v.deathT >= 0 && !e.dead) v.revive();
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
    this.vfx.clear();
    this.ward.clear();
  }

  anchor(uid: string): Anchor | null {
    return this.anchors.get(uid) ?? this.views.get(uid)?.cur ?? null;
  }

  /** 발에서 형체 윗단까지 높이 ÷ 크기 (떠 있는 적은 그만큼 더) */
  headroom(uid: string): number {
    const v = this.views.get(uid);
    if (!v) return 1.08;
    return v.headroom + (v.fx.includes('float') ? 0.14 : 0.04);
  }

  /** 플레이어 위치 (화면 아래 중앙) */
  playerPoint(): { x: number; y: number } {
    return { x: this.rect.x + this.rect.w / 2, y: this.rect.y + this.rect.h + 40 };
  }

  /** 1인칭 시점의 눈높이 (공격이 출발하는 곳) */
  eye(): Pt {
    return { x: this.rect.x + this.rect.w / 2, y: this.rect.y + this.rect.h * 1.04 };
  }

  /** 총구 (오른손) */
  muzzlePoint(): Pt {
    return { x: this.rect.x + this.rect.w * 0.66, y: this.rect.y + this.rect.h * 0.97 };
  }

  /** 적 몸 중심 */
  center(uid: string): Pt | null {
    const a = this.anchor(uid);
    return a ? { x: a.x, y: a.y - a.size * 0.5 } : null;
  }

  update(dt: number) {
    const du = dt * this.timeScale;
    const df = dt * (1 + (this.timeScale - 1) * 0.5);
    for (const [uid, v] of this.views) {
      v.update(du);
      if (v.done) {
        v.destroy({ children: true });
        this.views.delete(uid);
      }
    }
    this.unitLayer.children.sort((a, b) => a.position.y - b.position.y);
    this.ward.setBox(this.rect);
    this.ward.update(df);
    this.vfx.update(df);
  }

  // ───────── 공개 연출 API ─────────

  /**
   * 적이 맞았다.
   * blocked: 방어도로 막은 양, hpLoss: 실제 체력 손실, shellBreak: 이 공격으로 방어도가 바닥남,
   * firearm: 총기 (총구 화염 + 예광탄), src: 공격한 쪽 uid ('p' = 플레이어)
   */
  hit(
    uid: string,
    type: DmgType | 'true',
    amount: number,
    o: { crit?: boolean; weak?: boolean; blocked?: boolean | number; hpLoss?: number; shellBreak?: boolean; firearm?: boolean; src?: string } = {},
  ) {
    const v = this.views.get(uid);
    const a = this.anchor(uid);
    if (!a) return;
    const x = a.x;
    const y = a.y - a.size * 0.5;
    const big = !!(o.crit || o.weak);
    const blocked = typeof o.blocked === 'number' ? o.blocked > 0 : !!o.blocked;
    const fullBlock = blocked && (o.hpLoss ?? amount) <= 0;
    const power = clamp(0.85 + amount / 40, 0.85, 1.3) * (big ? 1.25 : 1) * (fullBlock ? 0.7 : 1);
    const from = o.src && o.src !== 'p' ? (this.center(o.src) ?? this.eye()) : this.eye();
    const c: HitCtx = { x, y, size: a.size, power, from };
    const col = TYPE_COLOR[type];
    const fx = this.vfx;
    if (v && amount > 0) {
      v.hitT = fullBlock ? 0.16 : 0.35;
      v.hitDir = Math.random() < 0.5 ? -1 : 1;
      v.recoil(fullBlock ? 0.5 : big ? 1.5 : 1);
    }
    if (o.firearm) {
      muzzleFlash(fx, this.muzzlePoint(), Math.atan2(y - this.muzzlePoint().y, x - this.muzzlePoint().x));
      hitBullet(fx, c, this.muzzlePoint(), col, big);
    } else {
      switch (type) {
        case 'slash':
          hitSlash(fx, c, col, big);
          break;
        case 'pierce':
          hitPierce(fx, c, col, big);
          break;
        case 'blunt':
          hitBlunt(fx, c, col, big);
          if (v && !fullBlock) v.squash(big ? 0.24 : 0.16);
          break;
        case 'fire':
          hitFire(fx, c, big);
          break;
        case 'arcane':
          hitArcane(fx, c, col, big);
          break;
        case 'void':
          hitVoid(fx, c, big);
          break;
        default:
          hitTrue(fx, c);
      }
    }
    if (big) {
      critBurst(fx, c, col, !!o.weak && !o.crit);
      if (v) v.freezeT = 0.075;
    }
    if (blocked) {
      blockedHit(fx, c, !!o.shellBreak);
      if (v) {
        v.ensureShell();
        v.shellFlash = 1;
        if (o.shellBreak) v.shellBase = 0;
      }
    }
  }

  /** 지속 피해 (출혈·독·화상) */
  dot(uid: string, kind: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const x = a.x;
    const y = a.y - a.size * 0.55;
    const w = a.size * 0.7;
    const h = a.size * 0.8;
    if (kind === 'bleed') bleedFx(this.vfx, x, y, w, h, false);
    else if (kind === 'poison') poisonFx(this.vfx, x, y, w, h, false);
    else if (kind === 'burn') burnFx(this.vfx, x, y, w, h, false);
    else hitTrue(this.vfx, { x, y, size: a.size * 0.6, power: 1, from: this.eye() });
    const v = this.views.get(uid);
    if (v) {
      v.hitT = 0.2;
      v.tintFlash(kind === 'bleed' ? 0xff2020 : kind === 'poison' ? 0x70ff40 : kind === 'burn' ? 0xff7a20 : 0xffffff, 0.45, 0.35);
    }
  }

  /** 지속 피해 — 플레이어 */
  dotPlayer(kind: string) {
    const r = this.rect;
    const x = r.x + r.w / 2;
    const y = r.y + r.h * 0.78;
    if (kind === 'bleed') bleedFx(this.vfx, x, r.y + r.h * 0.55, r.w * 0.8, r.h * 0.3, true, 12);
    else if (kind === 'poison') poisonFx(this.vfx, x, y, r.w * 0.8, r.h * 0.25, true, 12);
    else if (kind === 'burn') burnFx(this.vfx, x, y + r.h * 0.1, r.w * 0.8, r.h * 0.2, true, 18);
  }

  /** 예전 API: 돌진 */
  lunge(uid: string) {
    this.telegraph(uid, 'attack');
  }

  /** 적의 행동 예고 */
  telegraph(uid: string, kind: IntentKind) {
    const v = this.views.get(uid);
    const a = this.anchor(uid);
    if (!a) return;
    const x = a.x;
    const y = a.y - a.size * 0.5;
    const fx = this.vfx;
    switch (kind) {
      case 'attack':
        v?.telegraph('attack');
        glow(fx, 'fxB', x, y, a.size * 1.5, 0xff4030, 0.35, { alpha: 0.35, delay: 0.12 });
        break;
      case 'debuff':
        v?.telegraph('debuff');
        break;
      case 'horror':
        v?.telegraph('horror');
        glow(fx, 'fxB', x, y, a.size * 1.9, 0x30ffc0, 0.6, { alpha: 0.55 });
        break;
      case 'charge':
        v?.telegraph('charge');
        gather(fx, x, y, a.size, 0xffd040);
        break;
      case 'block':
        v?.telegraph('block');
        break;
      case 'buff':
        v?.telegraph('buff');
        softPulse(fx, x, y, a.size, 0xffc060);
        break;
      case 'summon':
        v?.telegraph('summon');
        runePulse(fx, x, a.y, a.size * 1.6, 0xe86a8a, 0.32, 'under');
        break;
      case 'heal':
        v?.telegraph('heal');
        softPulse(fx, x, y, a.size, 0x6ee08a);
        break;
      case 'advance':
      case 'retreat':
        smoke(fx, 'fxN', x, a.y, 5, { r: a.size * 0.3, speed: [40, 100], vy: [-30, -5], size: [24, 40], grow: 1.8, life: [0.5, 0.8], tint: 0x6a6258, alpha: 0.45 });
        break;
      default:
        v?.telegraph('other');
        softPulse(fx, x, y, a.size, 0xe86a8a);
    }
  }

  /** 색 파동 (예전 API) */
  pulse(uid: string, color: number) {
    const a = this.anchor(uid);
    if (!a) return;
    softPulse(this.vfx, a.x, a.y - a.size * 0.5, a.size, color);
    this.views.get(uid)?.tintFlash(color, 0.45);
  }

  /** 적이 방어도를 얻었다: 푸른 결계 껍질 + 육각 반짝임 */
  shield(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const v = this.views.get(uid);
    const x = a.x;
    const y = a.y - a.size * 0.5;
    const fx = this.vfx;
    if (v) {
      v.ensureShell();
      v.shellFlash = 1;
      v.shellBase = Math.max(v.shellBase, 0.32);
    }
    ring(fx, 'fxA', x, y, a.size * 1.9, a.size * 1.05, 0.38, SHELL, { ease: E_IN, alpha: 0.85, fadeIn: 0.15, fadeOut: 0.6 });
    glow(fx, 'fxB', x, y, a.size * 1.5, 0x4a9ae0, 0.45, { alpha: 0.5 });
    for (let i = 0; i < 9; i++) {
      const p = (v && v.bodyPoint(this.tmp)) || { x: x + rand(-0.35, 0.35) * a.size, y: y + rand(-0.4, 0.4) * a.size };
      motes(fx, 'fxA', p.x, p.y, 1, { tex: VT.hex, size: [12, 22], life: [0.35, 0.6], tint: 0xa8dcff, grow: 1.6, fadeIn: 0.05, delay: [0, 0.2] });
    }
  }

  /** 회복 */
  heal(uid: string) {
    if (uid === 'p') {
      healPlayer(this.vfx, this.rect);
      return;
    }
    const a = this.anchor(uid);
    if (!a) return;
    healSpiral(this.vfx, a.x, a.y, a.size);
    this.views.get(uid)?.tintFlash(0x6ee08a, 0.55, 0.6);
  }

  /** 상태 부여 (강화/약화 + 출혈·독·화상은 전용 연출) */
  status(uid: string, id: string, kind: 'buff' | 'debuff') {
    const fx = this.vfx;
    if (uid === 'p') {
      const r = this.rect;
      const x = r.x + r.w / 2;
      if (id === 'bleed') bleedFx(fx, x, r.y + r.h * 0.55, r.w * 0.6, r.h * 0.25, true, 7);
      else if (id === 'poison') poisonFx(fx, x, r.y + r.h * 0.8, r.w * 0.7, r.h * 0.2, true, 8);
      else if (id === 'burn') burnFx(fx, x, r.y + r.h * 0.88, r.w * 0.8, r.h * 0.15, true, 12);
      else if (kind === 'buff') buffFx(fx, x, r.y + r.h * 0.82, r.w * 0.7, r.h * 0.22, true);
      else debuffFx(fx, x, r.y + r.h * 0.12, r.w * 0.9, r.h * 0.1, true);
      return;
    }
    const a = this.anchor(uid);
    if (!a) return;
    const v = this.views.get(uid);
    const x = a.x;
    const y = a.y - a.size * 0.55;
    const w = a.size * 0.7;
    const h = a.size * 0.8;
    if (id === 'bleed') bleedFx(fx, x, y, w, h, false, 6);
    else if (id === 'poison') poisonFx(fx, x, y, w, h, false, 7);
    else if (id === 'burn') burnFx(fx, x, y, w, h, false, 10);
    else if (kind === 'buff') buffFx(fx, x, y - a.size * 0.1, w, h, false);
    else debuffFx(fx, x, y - a.size * 0.15, w, h * 0.6, false);
    v?.tintFlash(kind === 'buff' ? 0xffc860 : 0x9a5aff, 0.5, 0.5);
  }

  /** 플레이어 피격 (1인칭: 화면 공간) */
  playerHit(type: DmgType | 'true', o: { hpLoss: number; blocked: number; remaining: number; maxHp: number; src?: string }) {
    const r = this.rect;
    const fromX = o.src ? (this.anchor(o.src)?.x ?? r.x + r.w / 2) : r.x + r.w / 2;
    if (o.blocked > 0) this.ward.absorb(o.remaining, fromX);
    if (o.hpLoss <= 0) return;
    const power = clamp(0.8 + (o.hpLoss / Math.max(1, o.maxHp)) * 3, 0.8, 1.4);
    const fx = this.vfx;
    switch (type) {
      case 'slash':
        playerSlash(fx, r, power, fromX);
        break;
      case 'pierce':
        playerPierce(fx, r, power);
        break;
      case 'blunt':
        playerBlunt(fx, r, power);
        break;
      case 'fire':
        playerFire(fx, r, power);
        break;
      case 'arcane':
      case 'void':
        playerEldritch(fx, r, power, type);
        break;
      default:
        playerTrue(fx, r, power);
    }
  }

  /** 플레이어가 방어도를 얻었다 */
  wardGain(total: number) {
    this.ward.gain(total);
  }

  /** 방어도 동기화 */
  wardSet(total: number) {
    this.ward.set(total);
  }

  /** 정신 피해: 가장자리에서 먹물 촉수가 기어든다 */
  sanityLoss(amount: number) {
    const n = Math.min(7, 2 + Math.floor(amount / 3));
    edgeTendrils(this.vfx, this.rect, n, 0x8a4ae0, { life: 1.0 + Math.min(0.5, amount * 0.04), scale: Math.min(1.3, 0.85 + amount * 0.04) });
  }

  /** 정신력 회복: 연보랏빛 알갱이 */
  sanityGain() {
    healPlayer(this.vfx, this.rect, 0xe6dcff, 0x8d6be0);
  }

  /** 통찰: 청록 빛이 스며든다 */
  insight() {
    const r = this.rect;
    healPlayer(this.vfx, r, 0xa8ffe8, 0x1fbf94);
    revealGlint(this.vfx, r.x + r.w / 2, r.y + r.h * 0.45, r.w * 0.35, 0x4fffc4);
  }

  /** 정신 붕괴 */
  breakdown() {
    const r = this.rect;
    edgeTendrils(this.vfx, r, 9, 0x30ffc0, { life: 1.6, scale: 1.4, bottom: true });
    const c = { x: r.x + r.w / 2, y: r.y + r.h * 0.5 };
    ring(this.vfx, 'scA', c.x, c.y, 40, r.w * 1.6, 0.8, 0x4fffc4, { alpha: 0.9 });
    runePulse(this.vfx, c.x, c.y, r.w * 1.1, 0x4fffc4, 0.5, 'scA');
  }

  breakFx(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    breakBurst(this.vfx, a.x, a.y - a.size * 0.5, a.size);
    const v = this.views.get(uid);
    if (v) {
      v.freezeT = 0.09;
      v.squash(0.2);
    }
  }

  death(uid: string) {
    const a = this.anchor(uid);
    const v = this.views.get(uid);
    if (a) {
      const x = a.x;
      const y = a.y - a.size * 0.5;
      const col = v?.glowColor ?? 0xffffff;
      glow(this.vfx, 'fxB', x, y, a.size * 2, col, 0.5, { alpha: 0.6 });
      ring(this.vfx, 'fxA', x, y, a.size * 0.4, a.size * 2.2, 0.5, col, { alpha: 0.6 });
      smoke(this.vfx, 'fxN', x, a.y - a.size * 0.05, 5, { r: a.size * 0.3, speed: [30, 80], vy: [-40, -10], size: [40, 70], grow: 1.8, life: [0.9, 1.3], tint: 0x1e1a1a, alpha: 0.5, delay: [0.1, 0.4] });
    }
    if (v && v.deathT < 0) v.deathT = 0;
  }

  /** 도주: 연기 속으로 사라진다 */
  flee(uid: string) {
    const a = this.anchor(uid);
    const v = this.views.get(uid);
    if (a) fleePuff(this.vfx, a.x, a.y - a.size * 0.4, a.size);
    if (v && v.deathT < 0) {
      v.fleeing = true;
      v.deathT = 0;
    }
  }

  spawnFx(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const v = this.views.get(uid);
    spawnPortal(this.vfx, a.x, a.y, a.size, v?.glowColor ?? 0x9fe8d8);
  }

  /** 공포: 적에게서 플레이어 쪽으로 뒤틀린 파문이 밀려온다 */
  horror(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    horrorRipple(this.vfx, { x: a.x, y: a.y - a.size * 0.6 }, a.size, this.eye(), this.rect.w);
  }

  tentacle(fromPlayer: boolean, uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    const b = { x: a.x, y: a.y - a.size * 0.45 };
    const from = fromPlayer ? { x: this.rect.x + this.rect.w * rand(0.2, 0.8), y: this.rect.y + this.rect.h + 20 } : { x: b.x + rand(-40, 40), y: b.y - 220 };
    tentacleLash(this.vfx, from, b);
    this.views.get(uid)?.recoil(1.2);
  }

  /** 인장 폭발 등 마법 폭발 */
  detonate(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    runePulse(this.vfx, a.x, a.y - a.size * 0.5, a.size * 1.7, 0xb48cff);
  }

  /** 약점 발견 */
  reveal(uid: string, color: number) {
    const a = this.anchor(uid);
    if (!a) return;
    revealGlint(this.vfx, a.x, a.y - a.size * 0.75, a.size, color);
  }

  /** 버팀 회복 */
  recover(uid: string) {
    const a = this.anchor(uid);
    if (!a) return;
    recoverFx(this.vfx, a.x, a.y - a.size * 0.5, a.size);
  }

  /** 변신 (몸에서 이계의 빛이 터진다) */
  transform(uid?: string) {
    const fx = this.vfx;
    const r = this.rect;
    const a = uid ? this.anchor(uid) : null;
    const x = a ? a.x : r.x + r.w / 2;
    const y = a ? a.y - a.size * 0.5 : r.y + r.h * 0.5;
    const s = a ? a.size : r.w * 0.4;
    flareBurst(fx, x, y, s);
    edgeTendrils(fx, r, 5, 0x30ffc0, { life: 1.1, scale: 1.1 });
  }

  /** 총구 화염만 (탄을 쏘지만 맞지 않는 경우 등) */
  muzzle(targetUid?: string) {
    const m = this.muzzlePoint();
    const c = targetUid ? this.center(targetUid) : null;
    const ang = c ? Math.atan2(c.y - m.y, c.x - m.x) : -Math.PI / 2 - 0.3;
    muzzleFlash(this.vfx, m, ang);
  }
}

/** 변신·소환용 큰 빛 터짐 */
function flareBurst(fx: Vfx, x: number, y: number, size: number) {
  glow(fx, 'fxB', x, y, size * 2.6, 0x30ffc0, 0.7, { alpha: 0.8 });
  ring(fx, 'fxA', x, y, size * 0.3, size * 3.2, 0.7, 0x4fffc4, { alpha: 0.9 });
  ring(fx, 'fxA', x, y, size * 0.2, size * 2.4, 0.55, 0x4fffc4, { soft: true, alpha: 0.6, delay: 0.05 });
  runePulse(fx, x, y, size * 1.8, 0x8affd8);
  motes(fx, 'fxA', x, y, 18, { r: size * 0.4, speed: [100, 300], size: [8, 14], life: [0.6, 1.1], tint: 0x8affd8, tint1: 0x1fbf94, drag: 2, grow: 0.4 });
}
