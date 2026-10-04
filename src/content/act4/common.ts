import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, MAX_ROW, type Combat } from '../../engine/combat';
import type { DmgType, EnemyUnit, MoveDef } from '../../engine/types';

/**
 * 4층·최종층 공용 도구.
 * - 별의 심판(파멸 카운트다운): 플레이어에게 거는 상태. 짊어진 적(매개)을 모두 붕괴/처치하면 풀린다.
 * - 열 뒤집기, 동료 되살리기, 약점 교체, 스킬 봉인.
 */

/** 플레이어에게 걸리는 카운트다운 */
export const DOOM = 'a4-doom';
/** 심판을 짊어진 적 표시 */
export const BEARER = 'a4-bearer';

function setDoom(c: Combat, n: number) {
  const before = c.p.st[DOOM] ?? 0;
  if (n > 0) c.p.st[DOOM] = n;
  else delete c.p.st[DOOM];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id: DOOM, n: n - before });
}

function clearBearer(c: Combat, e: EnemyUnit) {
  delete e.mem.doomDmg;
  delete e.mem.doomSan;
  if ((e.st[BEARER] ?? 0) > 0) {
    delete e.st[BEARER];
    c.emit({ t: 'status', uid: e.uid, id: BEARER, n: -1 });
  }
}

/** 별이 떨어진다: 살아 있는 매개들의 몫을 합쳐 방어도 무시 피해 + 정신 피해 */
function fallDoom(c: Combat) {
  let dmg = 0;
  let san = 0;
  for (const x of c.s.enemies) {
    if (!x.dead) {
      dmg += x.mem.doomDmg ?? 0;
      san += x.mem.doomSan ?? 0;
    }
    clearBearer(c, x);
  }
  setDoom(c, 0);
  if (dmg <= 0) return;
  c.emit({ t: 'fx', name: 'transform' });
  c.emit({ t: 'text', uid: 'p', text: '별이 떨어진다!', tone: 'eldritch' });
  c.damage({ src: null, tgt: c.p, base: dmg, type: 'true', ignoreBlock: true, tags: ['doom'] });
  if (!c.over && san > 0) c.loseSanity(san, true);
}

reg.statuses([
  {
    id: DOOM,
    name: '별의 심판',
    icon: 'gi:falling-star',
    kind: 'debuff',
    desc: '내 턴이 {n}번 더 끝나면 별이 떨어진다 — 방어도를 무시하는 큰 피해와 정신 피해. 심판을 짊어진 적(별 표식)을 붕괴시키거나 쓰러뜨리면 그 몫이 사라지고, 모두 없애면 심판이 풀린다',
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        delete u.st[DOOM];
        return;
      }
      if (n > 1) {
        setDoom(c, n - 1);
        if (n - 1 === 1) c.emit({ t: 'text', uid: 'p', text: '별이 바로 머리 위에 멈췄다', tone: 'bad' });
        return;
      }
      fallDoom(c);
    },
    hooks: {
      onBreak(c, _s, victim) {
        liftDoom(c, victim, '붕괴 — 별의 심판이 흩어졌다');
      },
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim)) liftDoom(c, victim, '별의 심판이 거두어졌다');
      },
    },
  },
  {
    id: BEARER,
    name: '심판의 매개',
    icon: 'gi:cursed-star',
    kind: 'buff',
    desc: '별의 심판을 짊어지고 있다. 붕괴시키거나 쓰러뜨리면 그 몫의 심판이 사라진다',
  },
]);

/**
 * 별의 심판을 건다. holders가 있으면 그들이 심판을 나눠 짊어진다(없으면 시전자).
 * 이미 심판이 진행 중이면 카운트는 그대로, 몫만 더해진다.
 */
export function castDoom(c: Combat, caster: EnemyUnit, turns: number, dmg: number, san: number, holders?: EnemyUnit[]): boolean {
  if (c.over || caster.dead) return false;
  const live = (holders ?? []).filter((x) => !x.dead);
  const bearers = live.length ? live : [caster];
  const pending = (c.p.st[DOOM] ?? 0) > 0;
  if (!pending) {
    // 지난 심판의 흔적 정리
    for (const x of c.s.enemies) clearBearer(c, x);
    // 결계에 막힐 수 있다
    if (c.apply(c.p, DOOM, turns, caster) <= 0) return false;
  }
  const each = Math.ceil(dmg / bearers.length);
  const sanEach = Math.ceil(san / bearers.length);
  for (const b of bearers) {
    b.mem.doomDmg = (b.mem.doomDmg ?? 0) + each;
    b.mem.doomSan = (b.mem.doomSan ?? 0) + sanEach;
    if (!((b.st[BEARER] ?? 0) > 0)) c.apply(b, BEARER, 1, caster);
  }
  caster.mem.doomAt = c.s.turn;
  c.emit({ t: 'fx', name: 'horror', src: caster.uid, tgt: 'p' });
  c.emit({
    t: 'text',
    uid: 'p',
    text: pending ? '심판이 더 무거워진다' : `별의 심판 — ${turns}턴 뒤 별이 떨어진다`,
    tone: 'eldritch',
  });
  return true;
}

/** 매개 하나가 붕괴·사망·변신하면 그 몫을 지운다. 매개가 모두 사라지면 심판 해제 */
export function liftDoom(c: Combat, e: EnemyUnit, text: string) {
  if (!((e.mem.doomDmg ?? 0) > 0) && !((e.st[BEARER] ?? 0) > 0)) return;
  clearBearer(c, e);
  if ((c.p.st[DOOM] ?? 0) <= 0) return;
  if (c.s.enemies.some((x) => x !== e && !x.dead && (x.mem.doomDmg ?? 0) > 0)) {
    c.emit({ t: 'text', uid: e.uid, text: '심판의 몫 하나가 흩어졌다', tone: 'good' });
    return;
  }
  setDoom(c, 0);
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 심판을 걸 수 있는가 (진행 중인 심판이 없고, 마지막 시전 후 gap턴 경과) */
export function canDoom(c: Combat, e: EnemyUnit, gap: number): boolean {
  if ((c.p.st[DOOM] ?? 0) > 0) return false;
  return c.s.turn - (e.mem.doomAt ?? -99) >= gap;
}

export function doomDesc(turns: number, dmg: number, san: number, who = '시전자') {
  return `별의 심판 — 내 턴이 ${turns}번 끝나면 ${dmg} 피해(방어도 무시), 정신력 -${san}. ${who}를 붕괴시키거나 쓰러뜨리면 풀린다`;
}

/** 시전자 자신이 짊어지는 별의 심판 */
export function doomMove(name: string, turns: number, dmg: number, san: number): MoveDef {
  return {
    name,
    intent: 'special',
    desc: doomDesc(turns, dmg, san),
    run(c, e) {
      castDoom(c, e, turns, dmg, san);
    },
  };
}

// ───────────── 전장 조작 ─────────────

/** 모든 적의 전열/후열을 뒤바꾼다 (동시 교체라 칸 수 제한에 걸리지 않음) */
export function flipRows(c: Combat) {
  const list = c.alive;
  if (!list.length) return;
  for (const x of list) {
    x.row = x.row === 0 ? 1 : 0;
    c.emit({ t: 'row', uid: x.uid, row: x.row });
  }
  c.emit({ t: 'text', text: '전장이 뒤집혔다', tone: 'eldritch' });
}

/** 체력 비율이 가장 낮은 (다친) 적 */
export function mostHurt(c: Combat): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  for (const x of c.alive) {
    if (x.hp >= x.maxHp) continue;
    if (!best || x.hp / x.maxHp < best.hp / best.maxHp) best = x;
  }
  return best;
}

/** 쓰러진(도주 아님, 하수인 아님) 동료를 되살린다. 동료마다 한 번 */
export function reviveAlly(c: Combat, by: EnemyUnit, pct: number): EnemyUnit | null {
  const t = c.s.enemies.find((x) => x.dead && !x.fled && !x.minion && x !== by && !x.mem.rebuilt);
  if (!t) return null;
  let row: 0 | 1 = t.row;
  if (c.row(row).length >= MAX_ROW) row = row === 0 ? 1 : 0;
  if (c.row(row).length >= MAX_ROW) return null;
  t.row = row;
  t.dead = false;
  t.hp = Math.max(1, Math.ceil(t.maxHp * pct));
  t.block = 0;
  t.st = {};
  t.broken = 0;
  t.poise = t.maxPoise;
  t.mem.rebuilt = 1;
  delete t.mem.charge;
  delete t.mem.doomDmg;
  delete t.mem.doomSan;
  c.emit({ t: 'spawn', uid: t.uid });
  c.emit({ t: 'text', uid: t.uid, text: '꿰매어진 채 다시 일어선다', tone: 'eldritch' });
  if (c.s.phase === 'player') c.planIntent(t);
  return t;
}

/** 약점 교체 (이미 알아낸 것·도감 지식은 유지, 통찰 2 이상이면 전부 공개) */
export function setWeak(c: Combat, e: EnemyUnit, weak: DmgType[]) {
  const meta = c.run.knownWeak?.[e.def] ?? [];
  const prev = e.known;
  e.weak = [...weak];
  e.known = c.p.insight >= 2 ? [...e.weak] : e.weak.filter((w) => prev.includes(w) || meta.includes(w));
}

/** 장착한 스킬 하나의 재사용 대기를 늘린다 (n=2 → 다음 내 턴 하나 동안 봉인) */
export function lockSkill(c: Combat, n: number): string | null {
  const slots = c.run.slots.filter((x): x is string => !!x);
  if (!slots.length) return null;
  const uid = c.rng.pick(slots);
  c.s.cd[uid] = (c.s.cd[uid] ?? 0) + n;
  const owned = c.run.skills.find((s) => s.uid === uid);
  const name = owned ? SKILLS.get(owned.id)?.name : undefined;
  c.emit({ t: 'text', uid: 'p', text: `「${name ?? '기술'}」의 기억을 빼앗겼다`, tone: 'bad' });
  return uid;
}

/** 등불을 깎는다 (전투 중) */
export function dimLight(c: Combat, n: number) {
  const before = c.run.light;
  c.run.light = Math.max(0, before - n);
  if (before > c.run.light) c.emit({ t: 'text', uid: 'p', text: `등불 -${before - c.run.light}`, tone: 'bad' });
}
