import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit } from '../../engine/types';
import { cine, setUi } from '../lib';

/**
 * 1층(침수된 지하 수로) 정예·수호자 패턴 (2026-10 확장) — 공용 도구와 전용 상태.
 * - 등대지기: 등명기가 돌다 터뜨리는 섬광 → '눈부심'(다음 내 턴 동안 적의 의도가 가려진다, 등명기를 깨면 걷힌다)
 * - 늙은 어부: 낚싯줄로 기술 하나를 건다 → 전열에 '팽팽한 낚싯줄'이 나타나 두 번째 차례에 낚아 간다 (줄을 끊거나 어부를 붕괴시키면 되찾는다)
 * - 익사한 선장: 차오르는 물 (선장이 행동할 때마다 1, 셋이면 숨이 막혀 행동력 -1. 한 턴에 크게 때리거나 익사체를 쓰러뜨리면 1, 붕괴시키면 모두 빠진다)
 * - 교단 집행자: 판결 (다음 내 턴에 집행자에게 피해 N을 주지 못하면 유죄)
 * - 거대 게: 집게가 무기를 문다 (붕괴시키거나 쓰러뜨리면 놓는다)
 * - 바다 무덤의 망령: 유리에 남는 손자국 (끌어내림의 손이 늘어난다)
 * 이 상태들은 '규칙 표시'라 결계에 막히지 않게 직접 건다 (setPlayerSt).
 */

export const DAZZLE = 'a1-dazzle';
export const HOOKED = 'a1-hooked';
export const CAUGHT = 'a1-caught';
export const FLOOD = 'a1-flood';
export const TRIAL = 'a1-trial';
export const DISARMED = 'a1-disarmed';
export const HANDPRINT = 'a1-handprint';
/** 어부가 던진 낚싯줄 (하수인 — 끊으면 기술이 돌아온다) */
export const LINE = 'fishline';

// ── 수치 (설명 문구도 이 값을 쓴다) ──
/** 낚싯줄 체력 / 낚으면 어부 힘 + */
export const LINE_HP = 10;
export const CATCH_STR = 2;
/** 차오르는 물의 끝 (이 높이면 숨이 막힌다) / 한 턴에 선장에게 이만큼 피해를 주면 물이 1 빠진다 */
export const WATER_MAX = 3;
export const BAIL_DMG = 16;
/** 판결: 채워야 할 피해 / 유죄의 대가 / 무죄면 집행자 버팀 - */
export const VERDICT_DMG = 18;
export const GUILTY_SAN = 10;
export const GUILTY_VULN = 2;
export const ACQUIT_POISE = 2;
/** 손자국 최대 */
export const HANDPRINT_MAX = 3;
/** 심연의 노래에 홀리면 다음 내 턴 잃는 행동력 */
export const CHARM_AP = 1;
export const CHARMED = 'a1-charmed';

/** 플레이어에게 '규칙' 상태를 직접 건다 (결계에 막히지 않고, 사경 중에도 그대로). 0이면 지운다 */
export function setPlayerSt(c: Combat, id: string, n: number) {
  const before = c.p.st[id] ?? 0;
  if (n > 0) c.p.st[id] = n;
  else delete c.p.st[id];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id, n: n - before });
}

export function skillName(c: Combat, uid: string): string {
  const owned = c.run.skills.find((s) => s.uid === uid);
  return (owned && SKILLS.get(owned.id)?.name) || '기술';
}

/** 피해 없이 버팀만 깎는다 (0이 되면 붕괴) */
export function chipPoise(c: Combat, e: EnemyUnit, n: number) {
  if (e.dead || e.broken > 0 || e.maxPoise <= 0 || n <= 0) return;
  e.poise = Math.max(0, e.poise - n);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text: `버팀 -${n}`, tone: 'info' });
}

// ───────────── 등대지기: 눈부심 ─────────────

/** 섬광에 눈이 먼다: 다음 내 턴 동안 적의 의도가 가려진다. 처음 한 번은 화면 밖의 당신에게 */
export function dazzle(c: Combat, src: EnemyUnit) {
  if (c.over) return;
  setPlayerSt(c, DAZZLE, 1);
  c.emit({ t: 'text', uid: 'p', text: '눈이 멀었다', tone: 'bad' });
  if (!c.s.vars['a1-flashed']) {
    c.s.vars['a1-flashed'] = 1;
    cine(c, 'sysmsg', { uid: src.uid, text: '화면을 너무 오래 보고 있습니다. 잠시 눈을 감으십시오.' });
  }
}

/** 의도를 가린다 — 힘을 모은 큰 공격(차지와 그 뒤의 일격)은 눈이 멀어도 보인다 */
function veil(c: Combat) {
  for (const e of c.alive) {
    const it = e.intent;
    if (!it || it.hidden || it.charging || e.mem.charge || it.kind === 'stunned') continue;
    it.hidden = true;
    e.mem.dazzled = 1;
  }
}

/** 가린 의도를 되돌린다 */
function unveil(c: Combat) {
  for (const e of c.s.enemies) {
    if (!e.mem.dazzled) continue;
    delete e.mem.dazzled;
    if (!e.intent) continue;
    if (c.moveDef(e, e.intent.move).hidden) e.intent.hidden = true;
    else delete e.intent.hidden;
  }
}

// ───────────── 늙은 어부: 낚싯줄 ─────────────

/** 낚을 수 있는 장착 기술 (다른 적이 쥔 것·이미 잠긴 것 제외) */
function hookable(c: Combat): { uid: string; i: number }[] {
  const held = new Set(c.s.enemies.filter((x) => !x.dead && x.mem.specimen).map((x) => x.mem.specimen - 1));
  return c.run.slots
    .map((uid, i) => ({ uid, i }))
    .filter((x): x is { uid: string; i: number } => !!x.uid && !held.has(x.i) && (c.s.cd[x.uid] ?? 0) < 90);
}

/** 낚싯줄을 던질 수 있는가 (이미 쥔 기술이 없고, 장착한 기술이 둘 이상) */
export function canHook(c: Combat, e: EnemyUnit): boolean {
  return !e.mem.specimen && hookable(c).length >= 2;
}

/** 보상 없이 사라진다 (처치가 아니다) */
function vanish(c: Combat, e: EnemyUnit) {
  if (e.dead) return;
  e.dead = true;
  e.fled = true;
  e.block = 0;
  c.emit({ t: 'death', uid: e.uid });
}

/** 남은 낚싯줄을 거둔다 */
function dropLine(c: Combat) {
  for (const x of c.alive) if (x.def === LINE) vanish(c, x);
}

/**
 * 장착한 기술 하나를 낚싯바늘에 건다: 전열에 '팽팽한 낚싯줄'이 나타난다 (두 번째 차례에 낚아 간다, 끊으면 되찾는다).
 * 걸린 기술은 쓸 수 없다 (재사용 대기 99로 잠금 — 3층 표본 채집과 같은 표식 mem.specimen이라 대기를 되돌리는 기술·각인도 건드리지 않는다).
 */
export function hookSkill(c: Combat, e: EnemyUnit): boolean {
  if (!canHook(c, e)) return false;
  if (!c.spawn(LINE, 0)) return false;
  const pick = c.rng.pick(hookable(c));
  e.mem.specimen = pick.i + 1;
  e.mem.specimenCd = c.s.cd[pick.uid] ?? 0;
  e.mem.specimenAt = c.s.turn;
  e.mem.hook = 1;
  c.s.cd[pick.uid] = 99;
  setPlayerSt(c, HOOKED, 1);
  c.emit({ t: 'text', uid: 'p', text: `「${skillName(c, pick.uid)}」이(가) 낚싯바늘에 걸렸다`, tone: 'bad' });
  return true;
}

/** 쥔 기술을 돌려준다 (줄이 끊어짐·붕괴·본모습·죽음). 남은 낚싯줄도 사라진다 */
export function releaseSkill(c: Combat, e: EnemyUnit, text: (name: string) => string) {
  const i = (e.mem.specimen ?? 0) - 1;
  e.mem.hook = 0;
  e.mem.caught = 0;
  setPlayerSt(c, HOOKED, 0);
  setPlayerSt(c, CAUGHT, 0);
  dropLine(c);
  if (i < 0) return;
  e.mem.specimen = 0;
  const uid = c.run.slots[i];
  if (!uid) return;
  // 걸려 있던 동안 지난 턴만큼 원래 대기가 줄어 있다
  const left = Math.max(0, (e.mem.specimenCd ?? 0) - (c.s.turn - (e.mem.specimenAt ?? c.s.turn)));
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: text(skillName(c, uid)), tone: 'good' });
}

/** 낚싯줄을 쥔 어부 */
export function angler(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.mem.hook && x.mem.specimen);
}

/** 줄을 다 감았다: 기술을 낚아 간다 (어부가 본모습을 드러내거나 쓰러질 때까지) */
export function reelIn(c: Combat, line: EnemyUnit) {
  const e = angler(c);
  vanish(c, line);
  if (!e) return;
  e.mem.hook = 0;
  e.mem.caught = 1;
  setPlayerSt(c, HOOKED, 0);
  setPlayerSt(c, CAUGHT, 1);
  const uid = c.run.slots[(e.mem.specimen ?? 0) - 1];
  const name = uid ? skillName(c, uid) : '기술';
  c.apply(e, 'str', CATCH_STR, e);
  c.emit({ t: 'text', uid: e.uid, text: '월척이다', tone: 'eldritch' });
  cine(c, 'glitch', { n: 2 });
  cine(c, 'sysmsg', { uid: e.uid, text: `「${name}」을(를) 잃었습니다.` });
}

/** 쥔 기술의 잠금을 다시 건다 (대기가 매 턴 줄어 숫자로 보이지 않게 — 버튼엔 ✕) */
function keepHeld(c: Combat) {
  for (const e of c.alive) {
    const i = (e.mem.specimen ?? 0) - 1;
    const uid = i >= 0 ? c.run.slots[i] : null;
    if (uid && (e.mem.hook || e.mem.caught)) c.s.cd[uid] = 99;
  }
}

/** 줄이 끊어진다 (낚싯줄을 쓰러뜨림·어부 붕괴) */
export function cutLine(c: Combat, e: EnemyUnit, why: string) {
  if (!e.mem.hook) return;
  c.emit({ t: 'text', uid: e.uid, text: why, tone: 'good' });
  releaseSkill(c, e, (n) => `「${n}」을(를) 되찾았다`);
}

/** 심연의 노래에 홀린다: 다음 내 턴 행동력 -CHARM_AP (결계로 막을 수 있다) */
export function charm(c: Combat) {
  if (!c.over) c.apply(c.p, CHARMED, CHARM_AP, null);
}

// ───────────── 익사한 선장: 차오르는 물 ─────────────

export function waterLevel(c: Combat): number {
  return c.p.st[FLOOD] ?? 0;
}

/** 물 높이를 바꾼다 (화면의 물·기울기도 함께) */
export function setWater(c: Combat, n: number) {
  const v = Math.max(0, Math.min(WATER_MAX, n));
  setPlayerSt(c, FLOOD, v);
  setUi(c, 'ui:water', v);
  setUi(c, 'ui:tilt', -2 * v);
}

/** 선장이 크게 휘청이면 물이 1 빠진다 (한 턴에 피해 BAIL_DMG 이상) */
export function bailWater(c: Combat, e: EnemyUnit) {
  const lv = waterLevel(c);
  if (lv <= 0) return;
  setWater(c, lv - 1);
  c.emit({ t: 'text', uid: e.uid, text: '선장이 휘청이자 물이 빠진다', tone: 'good' });
}

/** 물이 1 차오른다 (선장이 행동할 때마다). 처음 목까지 차면 화면 밖의 당신에게 */
export function riseWater(c: Combat, e: EnemyUnit) {
  const lv = waterLevel(c);
  if (lv >= WATER_MAX || c.over) return;
  setWater(c, lv + 1);
  // 물이 밀려드는 연출은 처음 그 높이에 닿을 때만 (매 턴 틀지 않는다 — 높이는 화면 아래의 물이 늘 보여 준다)
  if (lv + 1 > (c.s.vars['a1-waterPeak'] ?? 0)) {
    c.s.vars['a1-waterPeak'] = lv + 1;
    cine(c, 'water', { n: lv + 1 });
  }
  c.emit({ t: 'text', uid: e.uid, text: `물이 차오른다 (${lv + 1}/${WATER_MAX})`, tone: 'bad' });
  if (lv + 1 >= WATER_MAX && !c.s.vars['a1-drowning']) {
    c.s.vars['a1-drowning'] = 1;
    cine(c, 'whisper', { text: '숨을 참아라. 지금은 {time}. 화면 밖의 너도, 숨을 참고 있지.' });
  }
}

// ───────────── 교단 집행자: 판결 ─────────────

/** 판결을 내린다: 다음 내 턴에 집행자에게 피해 VERDICT_DMG를 주지 못하면 유죄 */
export function sentence(c: Combat, e: EnemyUnit) {
  setPlayerSt(c, TRIAL, VERDICT_DMG);
  e.mem.verdictAt = c.s.turn;
  c.emit({ t: 'text', uid: e.uid, text: `판결 — 피해 ${VERDICT_DMG}로 무죄를 증명하라`, tone: 'eldritch' });
}

/** 판결 중 집행자가 맞은 피해를 센다 (방어도에 막힌 몫 포함). 다 채우면 무죄 */
export function plead(c: Combat, e: EnemyUnit, amount: number) {
  const left = c.p.st[TRIAL] ?? 0;
  if (left <= 0 || amount <= 0 || c.s.phase !== 'player') return;
  const rest = left - amount;
  if (rest > 0) {
    setPlayerSt(c, TRIAL, rest);
    return;
  }
  setPlayerSt(c, TRIAL, 0);
  c.emit({ t: 'text', uid: e.uid, text: '무죄 — 판결이 뒤집혔다', tone: 'good' });
  if (!e.dead) chipPoise(c, e, ACQUIT_POISE);
}

// ───────────── 거대 게: 무기 물림 ─────────────

/** 집게가 무기를 문다: 무기 기본 공격을 쓸 수 없다 */
export function clampWeapon(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[DISARMED] ?? 0) > 0 || c.over) return false;
  e.mem.clamp = 1;
  c.s.cd.weapon = 99;
  setPlayerSt(c, DISARMED, 1);
  c.emit({ t: 'text', uid: 'p', text: '집게가 무기를 물었다', tone: 'bad' });
  return true;
}

/** 집게가 무기를 놓는다 */
export function freeWeapon(c: Combat, why: string) {
  for (const x of c.s.enemies) delete x.mem.clamp;
  if ((c.s.cd.weapon ?? 0) >= 90) delete c.s.cd.weapon;
  if ((c.p.st[DISARMED] ?? 0) <= 0) return;
  setPlayerSt(c, DISARMED, 0);
  c.emit({ t: 'text', uid: 'p', text: why, tone: 'good' });
}

// ───────────── 바다 무덤의 망령: 손자국 ─────────────

export function handprints(c: Combat): number {
  return c.p.st[HANDPRINT] ?? 0;
}

/** 손자국이 남는다 (최대 HANDPRINT_MAX) */
export function leavePrint(c: Combat, e: EnemyUnit) {
  const n = handprints(c);
  if (n >= HANDPRINT_MAX || c.over) return;
  setPlayerSt(c, HANDPRINT, n + 1);
  c.emit({ t: 'text', uid: e.uid, text: '유리에 손자국이 남았다', tone: 'eldritch' });
}

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: DAZZLE,
    name: '눈부심',
    icon: 'gi:blindfold',
    kind: 'debuff',
    desc: '섬광에 눈이 멀었다 — 이번 턴 적의 의도가 보이지 않는다 (힘을 모은 큰 공격은 보인다). 등명기를 깨면 걷힌다',
    tickStart(c, u) {
      if (isEnemy(u)) return;
      veil(c);
      c.emit({ t: 'text', uid: 'p', text: '눈앞이 하얗다 — 아무것도 보이지 않는다', tone: 'bad' });
    },
    tickEnd(c, u) {
      if (isEnemy(u)) {
        delete u.st[DAZZLE];
        return;
      }
      unveil(c);
      setPlayerSt(c, DAZZLE, 0);
    },
    hooks: {
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'lamp') return;
        unveil(c);
        setPlayerSt(c, DAZZLE, 0);
        c.emit({ t: 'text', uid: 'p', text: '등명기가 깨졌다 — 눈앞이 걷힌다', tone: 'good' });
      },
    },
  },
  {
    id: HOOKED,
    name: '낚싯바늘',
    icon: 'gi:fishing-hook',
    kind: 'debuff',
    desc: '기술 하나가 낚싯바늘에 걸려 쓸 수 없다. 팽팽한 낚싯줄을 끊거나(쓰러뜨리거나) 어부를 붕괴시키면 되찾는다 — 못 끊으면 낚싯줄의 두 번째 차례에 낚아 간다',
    tickStart(c, u) {
      if (!isEnemy(u)) keepHeld(c);
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.mem.hook) cutLine(c, victim, '붕괴 — 낚싯줄이 끊어졌다');
      },
    },
  },
  {
    id: CAUGHT,
    name: '낚인 기술',
    icon: 'gi:fishing-pole',
    kind: 'debuff',
    desc: '어부가 기술 하나를 낚아 갔다 — 어부가 본모습을 드러내거나 쓰러지면 되찾는다',
    tickStart(c, u) {
      if (!isEnemy(u)) keepHeld(c);
    },
  },
  {
    id: CHARMED,
    name: '매혹',
    icon: 'gi:musical-notes',
    kind: 'debuff',
    desc: '심연의 노래에 홀렸다 — 내 턴이 시작될 때 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `노래가 귓가에 맴돈다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, CHARMED);
    },
  },
  {
    id: FLOOD,
    name: '침수',
    icon: 'gi:drowning',
    kind: 'debuff',
    desc: `물이 {n}/${WATER_MAX}까지 찼다. 선장이 행동할 때마다 1 차오르고, ${WATER_MAX}이면 숨이 막혀 내 턴이 시작될 때 행동력 -1. 한 턴에 선장에게 피해 ${BAIL_DMG} 이상을 주거나 익사체를 쓰러뜨리면 1, 선장을 붕괴시키면 모두 빠진다`,
    tickStart(c, u, n) {
      if (isEnemy(u) || n < WATER_MAX) return;
      c.s.ap = Math.max(1, c.s.ap - 1);
      c.emit({ t: 'text', uid: 'p', text: '숨이 막힌다 (행동력 -1)', tone: 'bad' });
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== 'captain' || waterLevel(c) <= 0) return;
        setWater(c, 0);
        c.emit({ t: 'text', uid: victim.uid, text: '선장이 무너지자 물이 빠져나간다', tone: 'good' });
      },
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || waterLevel(c) <= 0) return;
        if (victim.def === 'captain') {
          setWater(c, 0);
          c.emit({ t: 'text', uid: 'p', text: '배의 저주가 풀렸다 — 물이 빠진다', tone: 'good' });
        } else if (victim.def === 'drowned') {
          setWater(c, waterLevel(c) - 1);
          c.emit({ t: 'text', uid: 'p', text: '익사체가 쓰러지며 물이 빠진다', tone: 'good' });
        }
      },
    },
  },
  {
    id: TRIAL,
    name: '판결',
    icon: 'gi:banging-gavel',
    kind: 'debuff',
    desc: `이번 턴 집행자에게 피해를 {n} 더 주지 못하면 유죄 — 턴이 끝날 때 정신력 -${GUILTY_SAN}, 취약 ${GUILTY_VULN}. 다 채우면 무죄 — 집행자 버팀 -${ACQUIT_POISE} (방어도에 막힌 피해도 센다)`,
    tickEnd(c, u) {
      if (isEnemy(u)) {
        delete u.st[TRIAL];
        return;
      }
      setPlayerSt(c, TRIAL, 0);
      c.emit({ t: 'text', uid: 'p', text: '유죄', tone: 'bad' });
      cine(c, 'scrawl', { text: '유죄' });
      c.loseSanity(GUILTY_SAN, true);
      if (!c.over) c.apply(c.p, 'vuln', GUILTY_VULN, null);
    },
    hooks: {
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'enforcer') return;
        setPlayerSt(c, TRIAL, 0);
        c.emit({ t: 'text', uid: 'p', text: '재판관이 쓰러졌다 — 판결은 무효다', tone: 'good' });
      },
    },
  },
  {
    id: DISARMED,
    name: '무기 물림',
    icon: 'gi:pincers',
    kind: 'debuff',
    desc: '거대 게의 집게가 무기를 물고 있다 — 무기 기본 공격을 쓸 수 없다. 게를 붕괴시키거나 쓰러뜨리면 놓는다',
    tickStart(c, u) {
      if (isEnemy(u)) return;
      // 대기를 되돌리는 기술로 잠깐 빼내도, 게가 물고 있는 한 다시 문다
      if (c.alive.some((x) => x.mem.clamp)) c.s.cd.weapon = 99;
      else freeWeapon(c, '집게가 무기를 놓았다');
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.mem.clamp) freeWeapon(c, '붕괴 — 집게가 무기를 놓았다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.mem.clamp) freeWeapon(c, '집게가 무기를 놓았다');
      },
    },
  },
  {
    id: HANDPRINT,
    name: '손자국',
    icon: 'gi:open-palm',
    kind: 'debuff',
    desc: `유리에 남은 망령의 손자국 {n}개 — '바다 무덤으로'의 손이 그만큼 늘어난다 (최대 ${HANDPRINT_MAX}). 끌어내리면 사라진다`,
  },
]);
