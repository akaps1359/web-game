import type { CombatEvent, Snap } from './engine/combat';
import { ENEMIES, FLOORS, MADNESS, SKILLS, STATUSES } from './engine/registry';
import { lvlVal } from './engine/combat';
import { bossFall, bossIntro, cineCenter, impact, playCine } from './ui/cinema';
import type { DmgType } from './engine/types';
import { stage } from './render/stage';
import type { VignetteKind } from './render/vfxTextures';
import { sound } from './sound';
import { store } from './state/store';
import { DMG_COLOR, DMG_NAME, SCHOOL_COLOR, WP_COLOR } from './ui/text';
import { gapBonusText } from './content/gap';
import { noteGap } from './ui/gap';
import { timesWord } from './ui/guard';

// ───────────── 떠오르는 글자 ─────────────

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  kind: 'num' | 'word' | 'big';
}

export const fx = {
  floaters: [] as Floater[],
  banner: null as null | { id: number; text: string; tone: 'player' | 'enemy' | 'good' | 'bad' | 'eldritch' },
  moveLabel: null as null | { id: number; uid: string; text: string },
};

let fid = 0;

export function floater(x: number, y: number, text: string, color = '#fff', kind: Floater['kind'] = 'num', size = 26) {
  const f: Floater = { id: ++fid, x: x + (Math.random() - 0.5) * 24, y, text, color, size, kind };
  fx.floaters.push(f);
  store.emit();
  setTimeout(
    () => {
      fx.floaters = fx.floaters.filter((x) => x.id !== f.id);
      store.emit();
    },
    kind === 'big' ? 1400 : 1000,
  );
}

function banner(text: string, tone: NonNullable<typeof fx.banner>['tone'], ms = 1000) {
  const b = { id: ++fid, text, tone };
  fx.banner = b;
  store.emit();
  setTimeout(() => {
    if (fx.banner?.id === b.id) {
      fx.banner = null;
      store.emit();
    }
  }, ms / speed());
}

function speed() {
  return store.meta.speed ?? 1;
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms / speed()));
}

/** 플레이어 기준점 (DOM의 #p-anchor) */
function playerPoint(): { x: number; y: number } {
  const el = document.getElementById('p-anchor');
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.62 };
}

function unitPoint(uid: string | undefined, top = 0.55): { x: number; y: number } {
  if (!uid || uid === 'p') return playerPoint();
  const a = stage.battle.anchor(uid);
  if (!a) return { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
  return { x: a.x, y: a.y - a.size * top };
}

/** 플레이어의 보호막 총량 (방어도 + 결계) */
function wardOf(p: { block: number; st: Record<string, number> } | undefined | null): number {
  return p ? p.block + (p.st.barrier ?? 0) : 0;
}

export function syncBattle(snap: Snap | null) {
  const c = store.combat;
  const enemies = snap
    ? snap.e.map((e) => {
        const real = c?.s.enemies.find((x) => x.uid === e.uid);
        return { uid: e.uid, row: e.row, scale: real?.scale ?? 1, dead: e.dead, broken: e.broken, form: real?.form, def: real?.def ?? '', block: e.block };
      })
    : (c?.s.enemies ?? []);
  stage.battle.sync(enemies, (id) => ENEMIES.get(id));
  stage.battle.wardSet(snap ? wardOf(snap.p) : c ? wardOf(c.p) : 0);
}

// ───────────── 재생 ─────────────

let queue: CombatEvent[] = [];
let running: Promise<void> | null = null;
/** 지금 연출 중인 플레이어 스킬 (총기 연출 판단용, weight: 큰 기술이면 2~3) */
let curSkill: { school: string; dtype?: DmgType; weight: number } | null = null;

/**
 * 재생 시작. 주의: 빈 큐로 run()을 부르면 async 함수가 동기적으로 끝나 버려
 * finally의 `running = null`이 `running = run()` 대입보다 먼저 실행된다 → running이 영원히 남아
 * 이후 모든 연출이 멈췄다 (전투 시작 시 play([])가 항상 불리므로 매 전투마다 발생).
 * 그래서 비어 있으면 시작하지 않고, running 해제는 promise가 끝난 뒤에 한다.
 */
function kick() {
  if (running || !queue.length) return;
  const p: Promise<void> = run().finally(() => {
    if (running === p) running = null;
    // 끝나는 사이에 들어온 이벤트가 있으면 이어서 재생
    kick();
  });
  running = p;
}

export function play(events: CombatEvent[]): Promise<void> {
  queue.push(...events);
  kick();
  return running ?? Promise.resolve();
}

export function busy(): boolean {
  return !!running;
}

async function run() {
  store.busy = true;
  store.emit();
  try {
    while (queue.length) {
      const ev = queue.shift()!;
      if (ev.snap) store.snap = ev.snap;
      stage.battle.timeScale = speed();
      await step(ev);
    }
  } finally {
    store.snap = null;
    store.busy = false;
    curSkill = null;
    syncBattle(null);
    store.emit();
  }
}

const SFX_BY_TYPE: Record<string, string> = {
  slash: 'slash',
  pierce: 'pierce',
  blunt: 'blunt',
  fire: 'fire',
  arcane: 'arcane',
  void: 'void',
  true: 'debuff',
};

/** 피격 속성별 화면 가장자리 색 */
const VIG_BY_TYPE: Record<DmgType | 'true', VignetteKind> = {
  slash: 'blood',
  pierce: 'blood',
  blunt: 'blood',
  fire: 'fire',
  arcane: 'arcane',
  void: 'void',
  true: 'blood',
};

const hexNum = (s: string) => parseInt(s.replace('#', ''), 16);

/** 이미 등장 연출을 보여 준 전투 (전투 상태 객체 기준) */
const introduced = new WeakSet<object>();

/** 수호자 전투가 시작되면 이름과 함께 등장 연출 */
async function maybeBossIntro() {
  const c = store.combat;
  if (!c || introduced.has(c.s)) return;
  introduced.add(c.s);
  const boss = c.alive.find((e) => c.defOf(e).tier === 'boss');
  if (!boss) return;
  const def = c.defOf(boss);
  const lord = c.s.enemies.some((e) => e.def === def.id) && (store.run?.floor?.rooms[store.run.floor.pos]?.type === 'lord');
  const sub = def.id === 'star-fetus' ? '최후의 수호자' : lord ? '계층군주' : `${def.act}층 · ${FLOORS.get(def.act)?.name ?? ''}의 수호자`;
  await bossIntro({ name: boss.name, sub, at: cineCenter(boss.uid) });
}

/** 기술의 무게: 0 = 기본 공격, 1 = 보통, 2 = 희귀·행동력 2 이상, 3 = 금기·창세 (메아리는 가볍게) */
function skillWeight(skillId: string, echo?: boolean): number {
  const def = SKILLS.get(skillId);
  if (!def || def.tags.includes('basic')) return 0;
  if (echo) return 1;
  if (def.rarity === 'forbidden' || def.rarity === 'genesis') return 3;
  const owned = store.run?.skills.find((x) => x.id === skillId);
  return def.rarity === 'rare' || lvlVal(def.cost, owned?.lvl ?? 0) >= 2 ? 2 : 1;
}

/** 계열마다 시전할 때 화면 전체에 번지는 기운 */
const CAST_MOOD: Record<string, VignetteKind> = { forbidden: 'void', occult: 'arcane', alchemy: 'fire', essence: 'blood', resolve: 'ward' };

/** 큰 기술의 시전 연출 (컷인 없이 화면 안에서) — 맞기까지 기다린다 */
async function castBig(ev: Extract<CombatEvent, { t: 'skill' }>, weight: number) {
  const c = store.combat;
  const uids = ev.target ? [ev.target] : (c?.alive.map((e) => e.uid) ?? []);
  const lead = stage.battle.cast(ev.school, ev.dtype, weight, uids);
  const mood = CAST_MOOD[ev.school];
  if (mood) stage.vignette(mood, weight >= 3 ? 0.6 : 0.4, 900);
  if (ev.school === 'forbidden') {
    stage.splitPulse(weight >= 3 ? 1.4 : 1);
    sound.sfx('riftOpen', { volume: 0.6 });
  } else if (ev.school === 'firearm') sound.sfx('tick', { volume: 0.7 });
  else if (ev.school === 'occult') sound.sfx('charge', { volume: 0.5 });
  else sound.sfx('swoosh', { volume: 0.6 });
  await wait(lead);
  if (ev.school === 'alchemy') sound.sfx('glass', { volume: 0.7 });
}

async function step(ev: CombatEvent) {
  switch (ev.t) {
    case 'turn':
      curSkill = null;
      syncBattle(store.snap);
      if (ev.side === 'player' && ev.turn === 1) await maybeBossIntro();
      if (ev.side === 'player') {
        banner(`${ev.turn}턴 · 당신의 차례`, 'player', 900);
        sound.sfx('turnStart');
        store.emit();
        await wait(380);
      } else {
        banner('적의 차례', 'enemy', 700);
        store.emit();
        await wait(300);
      }
      return;
    case 'skill': {
      store.emit();
      const weight = skillWeight(ev.skill, ev.echo);
      curSkill = { school: ev.school, dtype: ev.dtype, weight };
      const fxName = ev.dtype ? SFX_BY_TYPE[ev.dtype] : 'select';
      if (ev.school === 'firearm' && ev.dtype === 'pierce') sound.sfx('gunshot');
      else if (!ev.dtype) sound.sfx('buff');
      else sound.sfx(fxName, { volume: 0.5 });
      banner(ev.echo ? `${ev.name} (메아리)` : ev.name, 'player', 700);
      // 큰 기술은 컷인 대신 기술 자체가 화면 안에서 터진다
      if (weight >= 2) await castBig(ev, weight);
      await wait(140);
      return;
    }
    case 'move': {
      store.emit();
      curSkill = null;
      fx.moveLabel = { id: ++fid, uid: ev.uid, text: ev.name };
      stage.battle.telegraph(ev.uid, ev.kind);
      if (ev.kind === 'charge') sound.sfx('charge');
      else if (ev.kind === 'buff') sound.sfx('buff');
      else if (ev.kind === 'block') sound.sfx('block', { volume: 0.6 });
      else if (ev.kind === 'summon') sound.sfx('riftOpen', { volume: 0.6 });
      store.emit();
      // 필살기: 컷인 없이 적이 힘을 모았다가 터뜨린다 (행동 이름은 머리 위 글자로)
      if (ev.ult) {
        const real = store.combat?.s.enemies.find((e) => e.uid === ev.uid);
        const def = real ? ENEMIES.get(real.def) : undefined;
        const color = ev.kind === 'horror' ? 0x9a5cff : def?.eldritch ? 0x30d8a8 : 0xd23a3a;
        const at = stage.battle.center(ev.uid);
        if (at) stage.punch(at.x, at.y, 0.03, 0.5);
        stage.vignette(ev.kind === 'horror' ? 'arcane' : def?.eldritch ? 'void' : 'blood', 0.45, 900);
        sound.sfx('charge', { volume: 0.8 });
        await wait(stage.battle.ultimate(ev.uid, color));
        if (at) stage.shockwave(at.x, at.y, { amplitude: 16, wavelength: 140, speed: 1000, radius: 420, brightness: 1.12, dur: 0.4 });
        stage.shake(7, 0.25);
      }
      if (ev.cine) {
        const cn = typeof ev.cine === 'string' ? { name: ev.cine } : ev.cine;
        await playCine(cn.name, { uid: ev.uid, n: cn.n, text: cn.text });
      }
      await wait(320);
      return;
    }
    case 'dmg': {
      store.emit();
      const isDot = ev.tags.includes('dot');
      const dotKind = ev.tags.find((t) => t === 'bleed' || t === 'poison' || t === 'burn') ?? '';
      if (ev.tgt === 'p') {
        const pp = playerPoint();
        const sp = ev.snap?.p;
        const remaining = wardOf(sp);
        const maxHp = sp?.maxHp ?? store.run?.player.maxHp ?? 100;
        const frac = ev.hpLoss / Math.max(1, maxHp);
        if (isDot) {
          stage.battle.dotPlayer(dotKind);
          if (ev.hpLoss > 0) {
            stage.vignette(dotKind === 'poison' ? 'poison' : dotKind === 'burn' ? 'fire' : 'blood', Math.min(0.7, 0.3 + frac * 3), 600);
            floater(pp.x, pp.y - 30, `-${ev.hpLoss}`, dotKind === 'poison' ? '#7fe060' : dotKind === 'burn' ? '#ff8a45' : '#ff6a5a', 'num', 26);
          }
          await wait(160);
          return;
        }
        if (ev.hpLoss > 0) {
          stage.battle.playerHit(ev.dtype, { hpLoss: ev.hpLoss, blocked: ev.blocked, remaining, maxHp, src: ev.src });
          stage.shake(Math.min(18, 5 + ev.hpLoss * 0.6), 0.32);
          stage.joltHud(3 + ev.hpLoss * 0.35);
          stage.flash(0xc01818, Math.min(0.26, 0.07 + frac * 0.8));
          stage.vignette(VIG_BY_TYPE[ev.dtype], Math.min(1, 0.5 + frac * 3), 650 + Math.min(550, ev.hpLoss * 25));
          if (ev.dtype === 'arcane' || ev.dtype === 'void') stage.splitPulse(Math.min(1.4, 0.6 + frac * 3));
          if (frac >= 0.12) {
            const r = stage.battle.rect;
            stage.punch(r.x + r.w / 2, r.y + r.h * 0.7, Math.min(0.045, 0.02 + frac * 0.1), 0.26);
          }
          floater(pp.x, pp.y - 30, `-${ev.hpLoss}`, '#ff6a5a', 'num', 30);
          sound.sfx('playerHit', { pitch: 0.9 + Math.random() * 0.2 });
        } else if (ev.blocked > 0) {
          stage.battle.playerHit(ev.dtype, { hpLoss: 0, blocked: ev.blocked, remaining, maxHp, src: ev.src });
          stage.shake(remaining > 0 ? 3 : 6, 0.18);
          stage.joltHud(remaining > 0 ? 1.5 : 3);
          stage.vignette('ward', remaining > 0 ? 0.32 : 0.55, 520);
          floater(pp.x, pp.y - 30, '막음', '#8fc4ea', 'word', 20);
          sound.sfx('block', { volume: 0.7 });
        } else if (ev.amount === 0 && ev.attack) {
          floater(pp.x, pp.y - 30, '빗나감', '#cfc8b8', 'word', 20);
        }
        await wait(260);
        return;
      }
      const p = unitPoint(ev.tgt);
      if (isDot) {
        stage.battle.dot(ev.tgt, dotKind);
        floater(p.x, p.y, `${ev.hpLoss || ev.amount}`, ev.tags.includes('poison') ? '#7fe060' : ev.tags.includes('burn') ? '#ff8a45' : '#e05050', 'num', 22);
        await wait(160);
        return;
      }
      const firearm = ev.src === 'p' && ev.attack && ev.dtype === 'pierce' && curSkill?.school === 'firearm';
      const es = ev.snap?.e.find((e) => e.uid === ev.tgt);
      const shellBreak = ev.blocked > 0 && !!es && es.block <= 0;
      const heavy = ev.src === 'p' && ev.attack && (curSkill?.weight ?? 0) >= 2;
      stage.battle.hit(ev.tgt, ev.dtype, ev.amount, { crit: ev.crit, weak: ev.weak, blocked: ev.blocked, hpLoss: ev.hpLoss, shellBreak, firearm, src: ev.src, heavy });
      const big = ev.crit || ev.weak;
      if (heavy && !big) {
        const hc = stage.battle.center(ev.tgt);
        if (hc) {
          stage.punch(hc.x, hc.y, 0.03, 0.22);
          if ((curSkill?.weight ?? 0) >= 3) stage.shockwave(hc.x, hc.y, { amplitude: 14, wavelength: 110, speed: 1000, radius: 340, brightness: 1.1, dur: 0.32 });
        }
      }
      // 아주 큰 일격엔 만화식 임팩트 프레임
      const maxHp = es?.maxHp ?? 0;
      if (ev.src === 'p' && ev.attack && ev.hpLoss >= Math.max(25, maxHp * 0.22)) await impact(stage.battle.center(ev.tgt) ?? p, ev.hpLoss >= maxHp * 0.4 ? 1.5 : 1);
      if (big) {
        const c = stage.battle.center(ev.tgt);
        if (c) {
          stage.punch(c.x, c.y, ev.crit ? 0.05 : 0.04, 0.26);
          if (ev.crit) stage.shockwave(c.x, c.y, { amplitude: 18, wavelength: 120, speed: 1100, radius: 380, brightness: 1.15, dur: 0.36 });
        }
        stage.flash(0xffffff, 0.08);
      }
      floater(p.x, p.y, ev.hpLoss > 0 ? `${ev.hpLoss}` : ev.blocked > 0 ? `(${ev.blocked})` : '0', DMG_COLOR[ev.dtype], 'num', big ? 36 : 28);
      if (ev.wp) floater(p.x, p.y - 34, ev.weak ? `약점 · 급소 · ${DMG_NAME[ev.dtype]}` : `급소 · ${DMG_NAME[ev.dtype]}`, WP_COLOR, 'word', 17);
      else if (ev.weak) floater(p.x, p.y - 34, `약점 · ${DMG_NAME[ev.dtype]}`, DMG_COLOR[ev.dtype], 'word', 16);
      if (ev.crit) floater(p.x, p.y - 52, '치명타!', '#ffe080', 'word', 18);
      if (ev.amount > 0) stage.shake(big ? 8 : heavy ? 6 : ev.dtype === 'blunt' ? 5 : firearm ? 4 : 3, big || heavy ? 0.2 : 0.15);
      sound.sfx(ev.blocked > 0 && ev.hpLoss === 0 ? 'block' : SFX_BY_TYPE[ev.dtype], { pitch: 0.92 + Math.random() * 0.16 });
      await wait(big ? 260 : 200);
      return;
    }
    case 'block': {
      store.emit();
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.6);
      if (ev.uid === 'p') {
        stage.battle.wardGain(ev.snap ? wardOf(ev.snap.p) : ev.amount);
        stage.vignette('ward', 0.3, 560);
      } else stage.battle.shield(ev.uid);
      floater(p.x, p.y - (ev.uid === 'p' ? 30 : 0), `+${ev.amount}`, '#8fc4ea', 'num', 22);
      sound.sfx('block', { volume: 0.5 });
      await wait(150);
      return;
    }
    case 'heal': {
      store.emit();
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.6);
      floater(p.x, p.y - (ev.uid === 'p' ? 30 : 0), `+${ev.amount}`, '#6ee08a', 'num', 24);
      stage.battle.heal(ev.uid);
      if (ev.uid === 'p') stage.vignette('heal', 0.4, 800);
      sound.sfx('heal', { volume: 0.6 });
      await wait(170);
      return;
    }
    case 'status': {
      store.emit();
      const def = STATUSES.get(ev.id);
      if (ev.uid === 'p' && ev.id === 'barrier') {
        // 결계도 방어막으로 보여 준다
        if (ev.n > 0) stage.battle.wardGain(wardOf(ev.snap?.p) || ev.n);
        else stage.battle.wardSet(wardOf(ev.snap?.p));
      }
      if (!def || def.hidden || ev.n === 0) return;
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.95);
      if (ev.n > 0) {
        stage.battle.status(ev.uid, ev.id, def.kind);
        if (ev.uid === 'p' && def.kind === 'debuff') stage.vignette(ev.id === 'poison' ? 'poison' : ev.id === 'bleed' ? 'blood' : 'arcane', 0.32, 600);
        floater(p.x, p.y - (ev.uid === 'p' ? 52 : 0), `${def.name} ${ev.n > 0 ? '+' : ''}${ev.n}`, def.kind === 'buff' ? '#f0cf7a' : '#c8a0ff', 'word', 15);
        if (def.kind === 'debuff' && ev.uid === 'p') sound.sfx('debuff', { volume: 0.5 });
        await wait(110);
      }
      return;
    }
    case 'reveal': {
      store.emit();
      const p = unitPoint(ev.uid, 1.05);
      stage.battle.reveal(ev.uid, hexNum(ev.wp ? WP_COLOR : DMG_COLOR[ev.dtype]));
      // 급소는 금빛으로 — 이번 판 내내 그 종족의 급소가 보인다 (engine/weakpoint.ts)
      if (ev.wp) floater(p.x, p.y, `급소 발견: ${DMG_NAME[ev.dtype]}`, WP_COLOR, 'word', 16);
      else floater(p.x, p.y, `약점 발견: ${DMG_NAME[ev.dtype]}`, DMG_COLOR[ev.dtype], 'word', 15);
      sound.sfx('reveal', { volume: 0.6, pitch: ev.wp ? 0.8 : 1 });
      await wait(160);
      return;
    }
    case 'break': {
      syncBattle(store.snap);
      store.emit();
      stage.battle.breakFx(ev.uid);
      stage.shake(12, 0.35);
      stage.flash(0xffd060, 0.22);
      const c = stage.battle.center(ev.uid);
      if (c) {
        stage.punch(c.x, c.y, 0.05, 0.3);
        stage.shockwave(c.x, c.y, { amplitude: 26, wavelength: 160, speed: 1000, radius: 520, brightness: 1.25, dur: 0.45 });
      }
      const p = unitPoint(ev.uid, 0.7);
      floater(p.x, p.y, '붕괴!', '#ffe080', 'big', 40);
      // 무너지는 정도 (붕괴 개편): 쉬는 차례와 받는 피해
      floater(p.x, p.y + 30, `차례 ${ev.turns}번 쉼 · 받는 피해 ${timesWord(ev.vuln)}`, '#ffb4a8', 'word', 14);
      sound.sfx('break');
      await wait(520);
      return;
    }
    case 'gap-open': {
      // 틈: 몸에 계열 색 균열이 짧게 번쩍. 표시는 체력 막대 끝에 생긴다
      noteGap(ev);
      store.emit();
      stage.battle.gapOpen(ev.uid, hexNum(SCHOOL_COLOR[ev.school]), ev.big);
      sound.sfx(ev.big ? 'glass' : 'reveal', { volume: ev.big ? 0.45 : 0.35, pitch: ev.big ? 0.85 : 1.25 });
      await wait(ev.big ? 300 : 200);
      return;
    }
    case 'gap-harvest': {
      // 거두기: 균열이 깨져 흩어지고 받은 보너스가 떠오른다 (그다음에 타격이 들어간다)
      noteGap(ev);
      store.emit();
      const to = SCHOOL_COLOR[ev.school];
      stage.battle.gapHarvest(ev.uid, hexNum(SCHOOL_COLOR[ev.from]), hexNum(to), ev.big);
      const p = unitPoint(ev.uid, 0.85);
      floater(p.x, p.y, `${ev.big ? '큰 틈' : '틈'} 거두기 · ${gapBonusText(ev.school, ev.big)}`, to, 'word', ev.big ? 18 : 15);
      sound.sfx('glass', { volume: 0.5, pitch: ev.big ? 1.05 : 1.3 });
      await wait(ev.big ? 300 : 240);
      return;
    }
    case 'recover': {
      store.emit();
      const p = unitPoint(ev.uid, 1);
      stage.battle.recover(ev.uid);
      floater(p.x, p.y, '버팀 회복', '#cfc8b8', 'word', 14);
      await wait(150);
      return;
    }
    case 'death': {
      store.emit();
      const fallen = store.combat?.s.enemies.find((e) => e.uid === ev.uid);
      if (fallen && ENEMIES.get(fallen.def)?.tier === 'boss') await bossFall(stage.battle.center(ev.uid) ?? unitPoint(ev.uid));
      stage.battle.death(ev.uid);
      sound.sfx('enemyDeath');
      syncBattle(store.snap);
      await wait(380);
      return;
    }
    case 'flee': {
      store.emit();
      const p = unitPoint(ev.uid, 0.7);
      floater(p.x, p.y, '도주', '#cfc8b8', 'word', 18);
      stage.battle.flee(ev.uid);
      syncBattle(store.snap);
      await wait(320);
      return;
    }
    case 'spawn': {
      syncBattle(store.snap);
      store.emit();
      setTimeout(() => stage.battle.spawnFx(ev.uid), 30);
      sound.sfx('riftOpen', { volume: 0.5 });
      await wait(320);
      return;
    }
    case 'row': {
      syncBattle(store.snap);
      store.emit();
      stage.battle.telegraph(ev.uid, ev.row === 0 ? 'advance' : 'retreat');
      sound.sfx('footstep', { volume: 0.5 });
      await wait(180);
      return;
    }
    case 'sanity': {
      store.emit();
      const pp = playerPoint();
      if (ev.delta < 0) {
        const n = -ev.delta;
        floater(pp.x + 40, pp.y - 10, `정신 ${ev.delta}`, '#b99bff', 'num', 22);
        stage.flash(0x5030c0, 0.1);
        stage.battle.sanityLoss(n);
        stage.vignette('ink', Math.min(1, 0.5 + n * 0.06), 900 + Math.min(700, n * 45));
        stage.splitPulse(Math.min(1.6, 0.55 + n * 0.09));
        sound.sfx(n >= 6 ? 'whisper' : 'sanityLoss', { volume: 0.7 });
      } else {
        floater(pp.x + 40, pp.y - 10, `정신 +${ev.delta}`, '#d0bfff', 'num', 20);
        stage.battle.sanityGain();
      }
      if (store.snap) {
        stage.setSanity(store.snap.p.sanity);
        sound.sanity(store.snap.p.sanity);
      }
      await wait(200);
      return;
    }
    case 'insight': {
      store.emit();
      const pp = playerPoint();
      stage.battle.insight();
      floater(pp.x, pp.y - 60, `통찰 +${ev.delta}`, '#4fffc4', 'big', 26);
      sound.sfx('reveal');
      await wait(400);
      return;
    }
    case 'breakdown': {
      store.emit();
      const name = MADNESS.get(ev.madness)?.name;
      banner(ev.fatal ? '정신이 완전히 무너졌다' : `정신이 무너졌다. (${name ?? '광기'})`, 'eldritch', 1800);
      stage.flash(0x30ffc0, 0.3);
      stage.shake(14, 0.6);
      stage.battle.breakdown();
      stage.vignette('ink', 1, 1900);
      stage.splitPulse(2);
      const r = stage.battle.rect;
      stage.shockwave(r.x + r.w / 2, r.y + r.h * 0.55, { amplitude: 34, wavelength: 220, speed: 750, radius: 760, brightness: 1.2, dur: 0.6 });
      sound.sfx('breakdown');
      await wait(1300);
      return;
    }
    case 'text': {
      store.emit();
      const p = ev.uid ? unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.95) : { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
      const color = ev.tone === 'good' ? '#9fffb0' : ev.tone === 'bad' ? '#ff9a8a' : ev.tone === 'eldritch' ? '#4fffc4' : '#e9e3d6';
      floater(p.x, p.y - (ev.uid === 'p' ? 40 : 0), ev.text, color, 'word', 15);
      await wait(260);
      return;
    }
    case 'fx': {
      store.emit();
      if (ev.name === 'horror' && ev.src) {
        stage.battle.horror(ev.src);
        const c = stage.battle.center(ev.src);
        if (c) stage.shockwave(c.x, c.y, { amplitude: 16, wavelength: 140, speed: 1000, radius: 700, brightness: 1.05, dur: 0.55 });
        stage.splitPulse(0.5);
      } else if (ev.name === 'tentacle' && ev.tgt) {
        stage.battle.tentacle(true, ev.tgt);
        sound.sfx('void', { volume: 0.5 });
      } else if (ev.name === 'detonate' && ev.tgt) {
        stage.battle.detonate(ev.tgt);
        sound.sfx('arcane');
      } else if (ev.name === 'transform') {
        stage.flash(0x40ffc0, 0.35);
        stage.shake(14, 0.5);
        syncBattle(store.snap);
        stage.battle.transform(ev.tgt);
        stage.splitPulse(1);
        sound.sfx('breakdown');
        await wait(600);
      }
      await wait(120);
      return;
    }
    case 'cine': {
      store.emit();
      await playCine(ev.name, { uid: ev.uid, text: ev.text, n: ev.n });
      return;
    }
    case 'victory':
      store.emit();
      banner('승리', 'good', 1400);
      sound.sfx('victoryHit');
      await wait(900);
      return;
    case 'defeat':
      store.emit();
      banner(ev.reason === 'madness' ? '광기에 삼켜졌다' : ev.reason === 'doom' ? '즉사' : '쓰러졌다', 'bad', 2000);
      stage.flash(0x000000, 0.7);
      await wait(1400);
      return;
  }
}
