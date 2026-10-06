import { reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { DMG_TYPES, type DmgType, type EnemyUnit } from '../../engine/types';
import { cine, setUi } from '../lib';

/*
 * 3층 수호자·정예의 시그니처 메커니즘 (2026-10 패턴 확장).
 * 적의 특성(trait) 훅은 플레이어의 턴·기술을 볼 수 없어서, 플레이어 쪽에서 일어나는 규칙은 플레이어에게 거는 상태로 짰다.
 *  - 쇼고스 「흉내」: 숨은 상태 a3-ear가 이번 턴 마지막으로 쓴 기술을 기억한다 → throwBack()
 *  - 각도의 왕 「열린 각」: 화면의 금(ui:cracks) = 날카로운 각. 방어도로 메우고, 붕괴시키면 닫힌다
 *  - 산맥 너머의 것 「드러난 모습」: 보면(공격하면) 정신력, 대신 받는 피해 +50%
 *  - 깨어난 원로 「멈춘 칼날」: 멈춘 시간 속 칼날 다섯 — 원로를 때려 쳐낸다
 *  - 렝의 대거미 「몸속의 알」, 샨탁 「하늘에 매달림」, 고대인 해부학자 「절개선」, 시간에 얼어붙은 탐사대장 「멈춘 시간」
 * 수치는 전부 여기 상수로 두고 설명 문구도 같은 상수를 쓴다.
 */

const alive = (c: Combat, def: string): EnemyUnit | undefined => c.alive.find((x) => x.def === def);

/** 이 기술 사용(메아리 포함)을 가리키는 번호 — 기술 하나에 한 번만 세려고 쓴다 */
const useKey = (c: Combat): number => c.s.usedTotal + 1;

// ───────────── 쇼고스: 흉내 ─────────────

/** 쇼고스가 듣고 있다 (숨은 상태 — 기억만 한다) */
export const EAR = 'a3-ear';
/** 흉내: 공격 기술은 준 피해의 이 비율로 되던진다 */
export const MIMIC_RATE = 0.5;
/** 흉내 낼 것이 없을 때의 정신 피해 */
export const MIMIC_SCREAM = 8;

const MIM = {
  dmg: 'a3-mimDmg',
  blk0: 'a3-mimBlk0',
  type: 'a3-mimType',
  kind: 'a3-mimKind',
  val: 'a3-mimVal',
  ref: 'a3-mimRef',
  turn: 'a3-mimTurn',
} as const;
const TYPES: (DmgType | 'true')[] = [...DMG_TYPES, 'true'];

/** 흉내 낼 기술 이름 (이번 턴 마지막으로 쓴 기술) */
function mimicName(c: Combat): string {
  const ref = c.s.vars[MIM.ref] ?? -9;
  const key = ref === -1 ? 'weapon' : ref === -2 ? 'armor' : c.run.slots[ref];
  return (key && c.skillInfo(key)?.def.name) || '기술';
}

/**
 * 쇼고스의 흉내: 이번 턴 당신이 마지막으로 쓴 기술을 따라 한다.
 * 피해를 준 기술 → 준 피해의 절반을 같은 속성으로, 방어도만 얻은 기술 → 그만큼 방어도, 그 밖(또는 기술을 안 씀) → 테켈리-리 비명
 */
export function throwBack(c: Combat, e: EnemyUnit) {
  const v = c.s.vars;
  const kind = v[MIM.turn] === c.s.turn ? (v[MIM.kind] ?? 3) : 0;
  if (kind === 1 || kind === 2) {
    const name = mimicName(c);
    e.mem.copies = (e.mem.copies ?? 0) + 1;
    // 처음 흉내 낼 때만 가짜 시스템 창 — 그 뒤로는 화면이 일그러지기만 한다
    if (e.mem.copies === 1) cine(c, 'sysmsg', { text: `「${name}」의 복제가 완료되었습니다.` });
    else cine(c, 'glitch', { n: 2, uid: e.uid });
    c.emit({ t: 'text', uid: e.uid, text: `「${name}」 — 테켈리-리!`, tone: 'eldritch' });
    if (kind === 1) {
      const dmg = Math.ceil((v[MIM.val] ?? 0) * MIMIC_RATE);
      const type = TYPES[v[MIM.type] ?? 2] ?? 'blunt';
      if (dmg > 0) c.damage({ src: e, tgt: c.p, base: dmg, type, tags: ['a3-mimic'] });
    } else c.gainBlock(e, v[MIM.val] ?? 0);
    return;
  }
  c.emit({ t: 'text', uid: e.uid, text: '흉내 낼 것을 찾지 못했다 — 테켈리-리!', tone: 'eldritch' });
  c.horror(e, MIMIC_SCREAM);
}

/** 쇼고스가 당신의 기술을 듣기 시작한다 (전투 시작 시) */
export function startListening(c: Combat) {
  c.p.st[EAR] = 1;
}

// ───────────── 각도의 왕: 열린 각 ─────────────

export const ANGLE = 'a3-angle';
export const MAX_ANGLES = 3;
/** 내 턴을 이 방어도 이상으로 끝내면 각 하나를 메운다 (회반죽) */
export const PLASTER = 12;
/** 메우지 못한 각 하나가 무는 피해 */
export const ANGLE_BITE = 6;
/** 각도의 왕이 후열에 숨어 각도가 비틀린 동안 화면이 기우는 정도 */
export const TILT = 8;

function syncCracks(c: Combat) {
  setUi(c, 'ui:cracks', Math.min(3, c.p.st[ANGLE] ?? 0));
}

/** 각도의 왕이 후열(각도 속)에 있으면 화면이 기운다 */
export function syncTilt(c: Combat) {
  const king = alive(c, 'angle-king');
  setUi(c, 'ui:tilt', king && king.row === 1 ? TILT : 0);
}

/** 열린 각이 모두 닫힌다 */
export function closeAngles(c: Combat, text: string) {
  if ((c.p.st[ANGLE] ?? 0) > 0) {
    c.clear(c.p, ANGLE);
    c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
  }
  setUi(c, 'ui:cracks', 0);
}

/** 화면에 날카로운 각을 하나 연다 (최대 MAX_ANGLES). 열었으면 true */
export function openAngle(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[ANGLE] ?? 0) >= MAX_ANGLES) return false;
  if (c.apply(c.p, ANGLE, 1, e) <= 0) return false;
  const n = c.p.st[ANGLE] ?? 0;
  cine(c, 'crack', { n: Math.min(3, n), uid: e.uid });
  syncCracks(c);
  c.emit({ t: 'text', uid: 'p', text: '유리에 날카로운 각이 생겼다', tone: 'eldritch' });
  return true;
}

// ───────────── 산맥 너머의 것: 드러난 모습 ─────────────

export const REVEALED = 'a3-revealed';
export const REVEAL_TURNS = 2;
/** 드러난 동안 받는 피해 배율 */
export const REVEAL_MULT = 1.5;
/** 드러난 것을 공격할 때마다(기술 하나마다) 그것을 보는 정신 피해 */
export const LOOK_SAN = 4;
/** 증기가 걷히기 시작할 때 / 드러났을 때 화면이 어두워지는 정도 */
export const DIM_UNVEIL = 35;
export const DIM_REVEAL = 60;

/** 형체가 드러난다: 2턴 동안 받는 피해 +50%, 대신 공격할 때마다 그것을 본다 */
export function reveal(c: Combat, e: EnemyUnit) {
  e.mem.revealAt = c.s.turn;
  e.mem.looks = 0;
  c.apply(e, REVEALED, REVEAL_TURNS, e);
  setUi(c, 'ui:eye', 1);
  setUi(c, 'ui:dark', DIM_REVEAL);
  c.emit({ t: 'text', uid: e.uid, text: '형체가 드러났다 — 보면 보인다', tone: 'eldritch' });
}

/** 다시 보랏빛 증기에 가려진다 (드러난 모습·어두워진 화면 정리) */
export function veilAgain(c: Combat, e: EnemyUnit) {
  const was = (e.st[REVEALED] ?? 0) > 0;
  if (was) c.clear(e, REVEALED);
  setUi(c, 'ui:eye', 0);
  setUi(c, 'ui:dark', 0);
  if (!was) return;
  c.emit({ t: 'text', uid: e.uid, text: '다시 보랏빛 증기에 가려진다', tone: 'info' });
  // 처음 드러났던 모습이 가려질 때 한 번만, 당신이 무엇을 골랐는지 화면 너머로 말을 건다
  if (!e.mem.judged && !e.dead) {
    e.mem.judged = 1;
    const text = (e.mem.looks ?? 0) > 0 ? '{time}.\n당신은 그것을 보았다.\n이제 잊지 못한다.' : '{time}.\n당신은 끝내 보지 않았다.\n현명하다.';
    cine(c, 'whisper', { text });
  }
}

// ───────────── 깨어난 원로: 멈춘 칼날 ─────────────

export const BLADES = 'a3-blades';
export const BLADE_N = 5;
export const BLADE_DMG = 6;

// ───────────── 렝의 대거미: 몸속의 알 ─────────────

export const EGGS = 'a3-eggs';
export const EGG_TURNS = 2;
export const HATCH_DMG = 5;
export const HATCH_N = 2;
/** 이미 알이 있는데 또 심으려 하면 대신 거는 독 */
export const EGG_POISON = 3;

function killEggs(c: Combat, text: string) {
  if ((c.p.st[EGGS] ?? 0) <= 0) return;
  c.clear(c.p, EGGS);
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 알을 심는다. 이미 알이 있으면 독 */
export function implantEggs(c: Combat, e: EnemyUnit) {
  if ((c.p.st[EGGS] ?? 0) > 0) {
    c.apply(c.p, 'poison', EGG_POISON, e);
    return;
  }
  if (c.apply(c.p, EGGS, EGG_TURNS, e) > 0) c.emit({ t: 'text', uid: 'p', text: '살 속에 무언가를 심었다', tone: 'bad' });
}

function hatch(c: Combat) {
  c.clear(c.p, EGGS);
  cine(c, 'swarm');
  c.emit({ t: 'text', uid: 'p', text: '알이 부화했다 — 살을 찢고 새끼들이 기어 나온다', tone: 'bad' });
  c.loseHp(c.p, HATCH_DMG, 'a3-hatch');
  for (let i = 0; i < HATCH_N && !c.over; i++) c.spawn('leng-spiderling', 0);
}

// ───────────── 샨탁: 하늘에 매달림 ─────────────

export const ALOFT = 'a3-aloft';
/** 이번 턴 샨탁에게 이만큼 피해를 주면 발톱에서 빠져나온다 */
export const ESCAPE_DMG = 20;
export const FALL_DMG = 12;

/** 움켜쥐고 날아오른다 */
export function liftUp(c: Combat, e: EnemyUnit) {
  if ((c.p.st[ALOFT] ?? 0) > 0) return;
  if (c.apply(c.p, ALOFT, ESCAPE_DMG, e) > 0) c.emit({ t: 'text', uid: 'p', text: '하늘 높이 들어 올려졌다', tone: 'bad' });
}

// ───────────── 고대인 해부학자: 절개선 ─────────────

export const INCISION = 'a3-incision';
export const INCISE_N = 2;
export const MAX_INCISION = 4;
export const VIVISECT_BASE = 28;
export const CUT_DMG = 5;

/** 「생체 해부」의 피해: 기본 + 절개선마다 CUT_DMG */
export const vivisectDmg = (c: Combat): number => VIVISECT_BASE + CUT_DMG * Math.min(MAX_INCISION, c.p.st[INCISION] ?? 0);

/** 절개선을 긋는다 (최대 MAX_INCISION). 처음 그을 때 화면 유리에 붉은 글씨 */
export function incise(c: Combat, e: EnemyUnit) {
  const add = Math.min(INCISE_N, MAX_INCISION - (c.p.st[INCISION] ?? 0));
  if (add <= 0 || c.apply(c.p, INCISION, add, e) <= 0) return;
  if (!e.mem.scrawled) {
    e.mem.scrawled = 1;
    cine(c, 'scrawl', { text: '여기를 자른다' });
  }
  refreshVivisect(c);
}

/** 이미 정해 둔 「생체 해부」 의도의 피해를 절개선 수에 맞춘다 */
function refreshVivisect(c: Combat) {
  for (const e of c.alive) {
    if (e.def !== 'elder-vivisector' || !e.intent) continue;
    if (e.intent.move === 'vivisect' || e.intent.move === 'table') e.intent.dmg = vivisectDmg(c);
  }
}

/** 절개선이 벌어져 사라진다 (생체 해부) / 아문다 (회복) */
export function closeIncisions(c: Combat, text: string) {
  if ((c.p.st[INCISION] ?? 0) <= 0) return;
  c.clear(c.p, INCISION);
  c.emit({ t: 'text', uid: 'p', text, tone: 'info' });
  refreshVivisect(c);
}

// ───────────── 시간에 얼어붙은 탐사대장: 멈춘 시간 ─────────────

export const STOPPED = 'a3-stopped';
export const WOUNDS = 'a3-wounds';
export const STOP_TURNS = 2;

/** 시간을 멈춘다. 걸었으면 true */
export function stopTime(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[STOPPED] ?? 0) > 0) return false;
  if (c.apply(c.p, STOPPED, STOP_TURNS, e) <= 0) return false;
  c.emit({ t: 'text', uid: 'p', text: '모든 것이 멈췄다', tone: 'eldritch' });
  return true;
}

/** 시간이 다시 흐른다: 쌓인 상처가 한꺼번에 터진다 (방어도가 먼저 막는다) */
function resumeTime(c: Combat) {
  const n = c.p.st[WOUNDS] ?? 0;
  c.clear(c.p, STOPPED);
  c.clear(c.p, WOUNDS);
  c.emit({ t: 'text', uid: 'p', text: n > 0 ? '시간이 다시 흐른다 — 멈춰 있던 상처가 한꺼번에 터진다' : '시간이 다시 흐른다', tone: n > 0 ? 'bad' : 'info' });
  if (n <= 0 || c.over) return;
  cine(c, 'crack', { n: 2 });
  c.damage({ src: alive(c, 'frozen-leader') ?? null, tgt: c.p, base: n, type: 'blunt', tags: ['a3-wounds'] });
}

/** 멈춘 시계가 부서진다: 쌓인 상처가 흩어진다 */
function shatterClock(c: Combat, text: string) {
  if ((c.p.st[STOPPED] ?? 0) <= 0 && (c.p.st[WOUNDS] ?? 0) <= 0) return;
  c.clear(c.p, STOPPED);
  c.clear(c.p, WOUNDS);
  cine(c, 'shatter');
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

// ───────────── 상태 등록 ─────────────

reg.statuses([
  {
    id: EAR,
    name: '테켈리-리',
    icon: 'gi:echo-ripples',
    kind: 'buff',
    hidden: true,
    desc: '쇼고스가 당신이 쓰는 기술을 듣고 있다',
    hooks: {
      beforeSkill(c, s, u) {
        if (s.unit !== c.p || u.echo) return;
        c.s.vars[MIM.dmg] = 0;
        c.s.vars[MIM.blk0] = c.p.block;
      },
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.skill || d.amount <= 0) return;
        c.s.vars[MIM.dmg] = (c.s.vars[MIM.dmg] ?? 0) + d.amount;
        c.s.vars[MIM.type] = Math.max(0, TYPES.indexOf(d.type));
      },
      afterSkill(c, s, u) {
        if (s.unit !== c.p) return;
        const v = c.s.vars;
        const dealt = v[MIM.dmg] ?? 0;
        const blk = Math.max(0, c.p.block - (v[MIM.blk0] ?? c.p.block));
        v[MIM.kind] = dealt > 0 ? 1 : blk > 0 ? 2 : 3;
        v[MIM.val] = dealt > 0 ? dealt : blk;
        v[MIM.ref] = u.basic === 'weapon' ? -1 : u.basic === 'armor' ? -2 : c.run.slots.indexOf(u.owned.uid);
        v[MIM.turn] = c.s.turn;
      },
    },
  },
  {
    id: ANGLE,
    name: '열린 각',
    icon: 'gi:cracked-glass',
    kind: 'debuff',
    desc: `화면에 날카로운 각 {n}개가 열려 있다 — 내 턴이 끝날 때 방어도가 ${PLASTER} 이상이면 회반죽으로 각 하나를 메우고, 남은 각마다 모서리에서 이빨이 튀어나와 ${ANGLE_BITE} 피해 (방어도가 먼저 막는다). 각도의 왕을 붕괴시키면 모든 각이 닫힌다`,
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        let n = s.n;
        if (c.p.block >= PLASTER) {
          c.apply(c.p, ANGLE, -1);
          n--;
          c.emit({ t: 'text', uid: 'p', text: '회반죽으로 각 하나를 메웠다', tone: 'good' });
        }
        syncCracks(c);
        if (n <= 0) return;
        const king = alive(c, 'angle-king');
        c.emit({ t: 'text', uid: 'p', text: '모서리에서 이빨이 튀어나왔다', tone: 'bad' });
        for (let i = 0; i < n && !c.over; i++) c.damage({ src: king ?? null, tgt: c.p, base: ANGLE_BITE, type: 'slash', tags: ['a3-angle'] });
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === 'angle-king') closeAngles(c, '각도의 왕이 무너졌다 — 열린 각이 모두 닫혔다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'angle-king') closeAngles(c, '열린 각이 모두 닫혔다');
      },
    },
  },
  {
    id: REVEALED,
    name: '드러난 모습',
    icon: 'gi:eye-target',
    kind: 'debuff',
    desc: `증기가 걷혀 형체가 드러났다 — 받는 피해 +${Math.round((REVEAL_MULT - 1) * 100)}%. 대신 이것을 공격하는 기술을 쓸 때마다 그것을 보게 된다: 정신 피해 ${LOOK_SAN} (방어도로 막을 수 없다). 당신의 턴 {n}번 동안`,
    hooks: {
      modDamageIn(_c, s, d) {
        if (isEnemy(s.unit)) d.mult *= REVEAL_MULT;
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.hp <= 0 || d.src !== c.p || !d.skill || !d.attack) return;
        const key = useKey(c);
        if (e.mem.looked === key) return;
        e.mem.looked = key;
        e.mem.looks = (e.mem.looks ?? 0) + 1;
        c.emit({ t: 'text', uid: 'p', text: '그것을 보았다', tone: 'eldritch' });
        c.horror(e, LOOK_SAN);
      },
    },
    tickEnd(c, u, n) {
      if (!isEnemy(u)) {
        c.clear(u, REVEALED);
        return;
      }
      // 막 드러난 차례에는 줄지 않는다 (당신의 턴 REVEAL_TURNS번 동안 드러나 있다)
      if (u.mem.revealAt === c.s.turn) return;
      if (n > 1) c.apply(u, REVEALED, -1);
      else veilAgain(c, u);
    },
  },
  {
    id: BLADES,
    name: '멈춘 칼날',
    icon: 'gi:thrown-knife',
    kind: 'debuff',
    desc: `멈춘 시간 속에서 칼날 {n}개가 당신을 겨누고 있다 — 깨어난 원로를 때리는 기술을 쓸 때마다 하나를 쳐낸다. 내 턴이 끝나면 시간이 다시 흘러 남은 칼날마다 ${BLADE_DMG} 피해 (방어도가 먼저 막는다)`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.skill || !isEnemy(d.tgt) || d.tgt.def !== 'awakened-elder' || d.amount <= 0) return;
        const key = useKey(c);
        if (c.s.vars['a3-parried'] === key) return;
        c.s.vars['a3-parried'] = key;
        c.apply(c.p, BLADES, -1);
        c.emit({ t: 'text', uid: 'p', text: '칼날 하나를 쳐냈다', tone: 'good' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        const n = s.n;
        c.clear(c.p, BLADES);
        c.emit({ t: 'text', uid: 'p', text: '시간이 다시 흐른다', tone: 'bad' });
        const elder = alive(c, 'awakened-elder');
        for (let i = 0; i < n && !c.over; i++) c.damage({ src: elder ?? null, tgt: c.p, base: BLADE_DMG, type: 'pierce', tags: ['a3-blades'] });
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'awakened-elder') c.clear(c.p, BLADES);
      },
    },
  },
  {
    id: EGGS,
    name: '몸속의 알',
    icon: 'gi:egg-clutch',
    kind: 'debuff',
    desc: `살 속에 거미알이 심겼다 — 내 턴이 {n}번 더 끝나면 부화해 새끼 거미 ${HATCH_N}마리가 살을 찢고 나온다 (피해 ${HATCH_DMG}, 방어도 무시). 체력을 회복하거나, 화염 기술을 쓰거나, 화염에 닿거나, 렝의 대거미를 쓰러뜨리면 알이 죽는다`,
    hooks: {
      afterSkill(c, s, u) {
        if (s.unit === c.p && (u.type ?? u.def.type) === 'fire') killEggs(c, '불길에 알이 타 죽었다');
      },
      onDamageTaken(c, s, d) {
        if (s.unit === c.p && d.tgt === c.p && d.type === 'fire' && d.amount > 0) killEggs(c, '불길에 알이 타 죽었다');
      },
      modHeal(c, s, amount) {
        if (c && !c.previewing && s.unit === c.p && amount > 0) killEggs(c, '새살이 돋으며 알이 밀려 나왔다');
        return amount;
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'leng-broodmother') killEggs(c, '어미가 쓰러지자 알이 굳어 버렸다');
      },
    },
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        c.clear(u, EGGS);
        return;
      }
      if (n > 1) c.apply(u, EGGS, -1);
      else hatch(c);
    },
  },
  {
    id: ALOFT,
    name: '하늘에 매달림',
    icon: 'gi:feathered-wing',
    kind: 'debuff',
    desc: `샨탁의 발톱에 매달려 하늘 높이 들렸다 — 샨탁에게 피해를 {n} 더 주면 발톱에서 빠져나온다. 빠져나오지 못하면 내 턴이 끝날 때 떨어진다: 피해 ${FALL_DMG} (방어도가 먼저 막는다), 다음 턴 행동력 -1`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !isEnemy(d.tgt) || d.tgt.def !== 'shantak' || d.amount <= 0) return;
        if ((c.p.st[ALOFT] ?? 0) > d.amount) {
          c.apply(c.p, ALOFT, -d.amount);
          return;
        }
        c.clear(c.p, ALOFT);
        c.emit({ t: 'text', uid: 'p', text: '발톱에서 빠져나왔다!', tone: 'good' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        c.clear(c.p, ALOFT);
        const sh = alive(c, 'shantak') ?? null;
        cine(c, 'impact');
        c.emit({ t: 'text', uid: 'p', text: '높은 곳에서 떨어졌다', tone: 'bad' });
        c.damage({ src: sh, tgt: c.p, base: FALL_DMG, type: 'blunt', tags: ['a3-fall'] });
        if (!c.over) c.apply(c.p, 'a3-timeworn', 1, sh);
      },
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'shantak' || (c.p.st[ALOFT] ?? 0) <= 0) return;
        c.clear(c.p, ALOFT);
        c.emit({ t: 'text', uid: 'p', text: '샨탁과 함께 내려앉았다', tone: 'good' });
      },
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, ALOFT);
    },
  },
  {
    id: INCISION,
    name: '절개선',
    icon: 'gi:stitched-wound',
    kind: 'debuff',
    desc: `해부학자가 그어 둔 절개선 {n}개 — 「생체 해부」가 절개선 하나마다 ${CUT_DMG} 피해를 더 주고(최대 ${MAX_INCISION}개), 그때 절개선이 모두 벌어져 사라진다. 체력을 회복하면 모두 아문다`,
    hooks: {
      modHeal(c, s, amount) {
        if (c && !c.previewing && s.unit === c.p && amount > 0) closeIncisions(c, '절개선이 아물었다');
        return amount;
      },
    },
  },
  {
    id: STOPPED,
    name: '멈춘 시간',
    icon: 'gi:stopwatch',
    kind: 'debuff',
    desc: '시간이 멈췄다 — 적의 공격 피해가 들어오지 않고 「멈춘 상처」로 쌓인다. 내 턴이 {n}번 더 끝나면 시간이 다시 흘러 쌓인 상처가 한꺼번에 터진다 (방어도가 먼저 막는다). 탐사대장을 붕괴시키거나 쓰러뜨리면 멈춘 시계가 부서져 쌓인 상처가 사라진다',
    hooks: {
      // 미리보기에도 0으로 보인다 (지금은 들어오지 않는다) — 상태는 바꾸지 않는다
      modDamageIn(c, s, d) {
        if (s.unit === c.p && d.attack && isEnemy(d.src)) d.cap = 0;
      },
      onDamageTaken(c, s, d) {
        if (s.unit !== c.p || d.tgt !== c.p || !d.attack || !isEnemy(d.src)) return;
        // 멈추지 않았다면 들어왔을 피해 (회피 등으로 0이 된 것은 쌓이지 않는다)
        const n = Math.max(0, Math.floor((d.base + d.add) * d.mult));
        if (n <= 0) return;
        if (c.apply(c.p, WOUNDS, n, null) > 0) c.emit({ t: 'text', uid: 'p', text: `상처가 멈췄다 (+${n})`, tone: 'eldritch' });
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        if (s.n > 1) c.apply(c.p, STOPPED, -1);
        else resumeTime(c);
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === 'frozen-leader') shatterClock(c, '멈춘 시계가 부서졌다 — 쌓인 상처가 흩어진다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.def === 'frozen-leader') shatterClock(c, '시계의 주인이 쓰러졌다 — 쌓인 상처가 흩어진다');
      },
    },
    tickEnd(c, u) {
      if (isEnemy(u)) c.clear(u, STOPPED);
    },
  },
  {
    id: WOUNDS,
    name: '멈춘 상처',
    icon: 'gi:time-trap',
    kind: 'debuff',
    desc: '멈춘 시간 속에 쌓인 피해 {n} — 시간이 다시 흐르면 한꺼번에 터진다 (방어도가 먼저 막는다). 탐사대장을 붕괴시키면 사라진다',
    tickEnd(c, u) {
      // 멈춘 시간 없이 남은 상처는 없다 (적에게 붙거나 홀로 남으면 지운다)
      if (isEnemy(u) || (u.st[STOPPED] ?? 0) <= 0) c.clear(u, WOUNDS);
    },
  },
]);
