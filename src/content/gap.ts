import { reg } from '../engine/registry';
import { isEnemy, type Combat, type CombatState } from '../engine/combat';
import { HUMAN_SCHOOLS, skillSchools } from '../engine/schools';
import type { EnemyUnit, OwnedSkill, School } from '../engine/types';

/*
 * 틈 (2026-10, 계열을 넘나드는 공용 표식 — docs/GDD.md 4.3)
 * 한 줄 규칙: 약점으로 치면 그 계열 색의 틈이 열린다. 다른 계열 스킬로 치면 틈을 거두고 보너스.
 *  - 열기: 약점 속성으로 버팀을 깎으면 그 기술의 계열 색으로 열린다 (무기 기본 공격은 무기의 계열: 사냥칼 = 검술, 리볼버 = 사격,
 *    의식용 단검 = 비술). 붕괴시키면 큰 틈 — 보너스 2배. 적마다 틈은 하나, 새로 열리면 바뀐다. 계열 없는 기술(공용·정수)은 열지 못한다.
 *  - 유지: 내 다음 턴이 끝날 때까지. 통찰 2 이상이면 한 턴 더.
 *  - 거두기: 틈의 색과 다른 계열의 기술로 치면 틈을 소모하고 그 계열의 보너스 하나. 같은 계열이면 아무 일도 없다.
 *    계열 각인을 새긴 스킬은 그 계열로도 친다 (engine/schools.ts skillSchools) — 틈의 색과 다른 쪽으로 거둔다.
 *  - 보너스(작은 틈): 검술 출혈 2 · 사격 치명(피해 1.5배) · 비술 인장 2 · 연금 독 2 · 결의 방어도 4 · 금기 정신력 +3
 *  - 안전장치: 같은 기술 사용(메아리 사본 포함)으로 열고 거둘 수 없다. 거두기는 턴당 2회. 보너스는 행동력·재사용 대기를 주지 않는다.
 * 상태: 적의 st.gap(1 틈, 2 큰 틈) · mem(gapC 색, gapL 남은 내 턴, gapU 연 사용) · 전투 vars('gap:*'). 모두 숫자라 그대로 저장된다.
 * 엔진 연결: 공용 규칙(reg.rules) 하나 — 피해(modDamageOut·onDamageDealt)·붕괴(onBreak) 지점의 훅으로 돈다.
 */

export const GAP_ID = 'gap';

/** 밸런스 수치 (시뮬레이션으로 맞춘다) */
export const GAP = {
  /** 턴당 거두기 횟수 */
  perTurn: 2,
  /** 이 통찰부터 틈이 한 턴 더 남는다 */
  insight: 2,
  /** 거두는 타격의 버팀 추가 감소 (이종 연계). 시뮬: 1이면 승률 +4%p(57 → 62%)라 꺼 둔다 — 켜면 힌트·도움말에 '버팀 -N'이 붙는다 */
  poise: 0,
  /** 큰 틈(붕괴)의 보너스 배수 */
  big: 2,
  /** 계열별 보너스 (작은 틈). 사격은 이 타격 피해 배율 */
  bleed: 2,
  crit: 1.5,
  mark: 2,
  poison: 2,
  block: 4,
  sanity: 3,
};

/** 화면 도움말용 한 줄 규칙 */
export const GAP_RULE = `약점으로 치면 그 계열 색의 틈이 열린다. 다른 계열 스킬로 치면 틈을 거두고 보너스${GAP.poise ? `와 버팀 -${GAP.poise}` : ''}.`;
/** 덧붙는 한 줄들 */
export const GAP_RULE_MORE = ['붕괴시키면 큰 틈이 열린다. 보너스 2배.', '틈은 내 다음 턴이 끝날 때까지 남는다. 통찰 2 이상이면 한 턴 더.', '거두기는 턴당 2번까지.', '계열 각인을 새긴 스킬은 그 계열로도 친다.'];

/** 보너스로 준 효과에 붙는 꼬리표 */
const TAG = 'gap';

/** 전투 vars 키 */
const V = {
  /** 거두기 횟수를 센 턴 / 그 턴에 거둔 횟수 */
  turn: 'gap:t',
  n: 'gap:n',
  /** 내 턴 끝 처리를 마친 턴 (그 뒤에 열린 틈은 한 턴 덜 센다) */
  end: 'gap:e',
  /** 통계: 틈·큰 틈을 연 횟수, 거둔 횟수(그중 큰 틈), 같은 계열로 쳐서 거두지 못한 횟수, 계열별 거둔 횟수(gap:h1~h6) */
  open: 'gap:o',
  bigOpen: 'gap:ob',
  harvest: 'gap:h',
  bigHarvest: 'gap:hb',
  same: 'gap:s',
} as const;

const idx = (s: School | null): number => (s ? HUMAN_SCHOOLS.indexOf(s) + 1 : 0);
const sch = (i: number | undefined): School | null => (i && i >= 1 && i <= HUMAN_SCHOOLS.length ? HUMAN_SCHOOLS[i - 1] : null);
/** 지금 진행 중인(또는 다음) 기술 사용 번호 — 메아리 사본은 같은 사용이다 (사냥 각인과 같은 기준) */
export const gapUseKey = (c: Combat): number => c.s.usedTotal + 1;
const useKey = gapUseKey;
const bump = (c: Combat, k: string, n = 1) => {
  c.s.vars[k] = (c.s.vars[k] ?? 0) + n;
};

// ───────────── 읽기 (화면 연결용) ─────────────

export interface GapInfo {
  uid: string;
  /** 틈의 색 */
  school: School;
  /** 붕괴로 열린 큰 틈 (보너스 2배) */
  big: boolean;
  /** 이번 턴을 포함해 남은 내 턴 (1이면 이번 턴이 끝날 때 닫힌다) */
  turns: number;
}

function read(e: EnemyUnit): (GapInfo & { by: number }) | null {
  const n = e.st[GAP_ID] ?? 0;
  const school = sch(e.mem.gapC);
  if (n <= 0 || e.dead || !school) return null;
  return { uid: e.uid, school, big: n >= 2, turns: Math.max(1, e.mem.gapL ?? 1), by: e.mem.gapU ?? 0 };
}

/** 적의 틈 (색·크기·남은 턴). 없으면 null */
export function gapInfo(c: Combat, uid: string): GapInfo | null {
  const e = c.enemy(uid);
  const g = e ? read(e) : null;
  if (!g) return null;
  const { by: _by, ...info } = g;
  return info;
}

/** 틈이 열린 적 전부 */
export function gapList(c: Combat): GapInfo[] {
  return c.alive.flatMap((e) => {
    const g = gapInfo(c, e.uid);
    return g ? [g] : [];
  });
}

/** 이번 턴에 더 거둘 수 있는 횟수 */
export function harvestsLeft(c: Combat): number {
  const used = c.s.vars[V.turn] === c.s.turn ? (c.s.vars[V.n] ?? 0) : 0;
  return Math.max(0, GAP.perTurn - used);
}

interface Plan {
  school: School;
  from: School;
  big: boolean;
}

/** 이 스킬로 지금 이 적을 치면 거두는가: 틈의 색과 다른 첫 계열로 (기술 자신 → 합기 → 각인 순) */
function plan(c: Combat, e: EnemyUnit, owned: Pick<OwnedSkill, 'id' | 'runes'>, key: number): Plan | null {
  const g = read(e);
  if (!g || g.by === key || harvestsLeft(c) <= 0) return null;
  const school = skillSchools(c, owned).find((s) => s !== g.school);
  return school ? { school, from: g.school, big: g.big } : null;
}

/** 거둔 계열의 보너스 한 줄 (규칙 설명 말투, 예: '출혈 3') */
export function gapBonusText(school: School, big = false): string {
  const k = big ? GAP.big : 1;
  switch (school) {
    case 'blade':
      return `출혈 ${GAP.bleed * k}`;
    case 'firearm':
      return `치명(피해 ${1 + (GAP.crit - 1) * k}배)`;
    case 'occult':
      return `인장 ${GAP.mark * k}`;
    case 'alchemy':
      return `독 ${GAP.poison * k}`;
    case 'resolve':
      return `방어도 ${GAP.block * k}`;
    case 'forbidden':
      return `정신력 +${GAP.sanity * k}`;
    default:
      return '';
  }
}

/**
 * 스킬 버튼·대상 고르기에 붙일 한 줄: 이 스킬(skillRef: 'weapon' | 'armor' | 스킬 uid)로 지금 이 적을 치면 틈을 거두는가, 거두면 무엇을 받는가.
 * 예: '틈 거두기: 출혈 2'. 거두지 못하면(틈이 없다, 같은 계열, 이번 턴 거두기를 다 썼다, 공격이 아니다) null
 */
export function gapHarvestHint(c: Combat, skillRef: string, targetUid: string | null | undefined): string | null {
  const info = c.skillInfo(skillRef);
  const e = c.enemy(targetUid);
  if (!info || !e || !info.def.tags.includes('attack')) return null;
  const p = plan(c, e, info.owned, useKey(c));
  if (!p) return null;
  return `${p.big ? '큰 틈' : '틈'} 거두기: ${gapBonusText(p.school, p.big)}${GAP.poise ? `, 버팀 -${GAP.poise}` : ''}`;
}

/** 이 전투의 틈 통계 (시뮬레이션 지표) */
export function gapStats(s: CombatState): { open: number; bigOpen: number; harvest: number; bigHarvest: number; same: number; by: Partial<Record<School, number>> } {
  const v = s.vars;
  const by: Partial<Record<School, number>> = {};
  HUMAN_SCHOOLS.forEach((sc, i) => {
    const n = v[`${V.harvest}${i + 1}`] ?? 0;
    if (n) by[sc] = n;
  });
  return { open: v[V.open] ?? 0, bigOpen: v[V.bigOpen] ?? 0, harvest: v[V.harvest] ?? 0, bigHarvest: v[V.bigHarvest] ?? 0, same: v[V.same] ?? 0, by };
}

// ───────────── 열기 / 닫기 / 거두기 ─────────────

/** 틈을 닫는다 (거두거나 시간이 다 됐을 때) */
export function closeGap(e: EnemyUnit) {
  delete e.st[GAP_ID];
  delete e.mem.gapC;
  delete e.mem.gapL;
  delete e.mem.gapU;
}

/**
 * 틈을 연다 (약점·붕괴 말고도 콘텐츠가 직접 열 때 — 예: '여는' 기술). 새로 열리면 있던 틈을 바꾼다.
 * by: 연 기술 사용 (기술 안에서 열면 gapUseKey(c) — 같은 사용으로 거두지 못하게. 0이면 아무 사용도 아님)
 */
export function openGap(c: Combat, e: EnemyUnit, school: School, big = false, by = 0) {
  if (e.dead || e.hp <= 0) return;
  // 내 턴 끝 처리를 이미 지났으면(적의 차례 등) 다음 내 턴이 끝날 때 닫힌다
  const ended = c.s.phase !== 'player' || c.s.vars[V.end] === c.s.turn;
  const turns = (ended ? 1 : 2) + (c.p.insight >= GAP.insight ? 1 : 0);
  e.st[GAP_ID] = big ? 2 : 1;
  e.mem.gapC = idx(school);
  e.mem.gapL = turns;
  e.mem.gapU = by;
  bump(c, big ? V.bigOpen : V.open);
  c.emit({ t: 'gap-open', uid: e.uid, school, big, turns });
}

/** 거두기 확정: 틈을 소모하고, 기술이 끝난 뒤 줄 보너스를 적어 둔다 (afterSkill) */
function harvest(c: Combat, e: EnemyUnit, p: Plan, key: number) {
  closeGap(e);
  if (c.s.vars[V.turn] !== c.s.turn) {
    c.s.vars[V.turn] = c.s.turn;
    c.s.vars[V.n] = 0;
  }
  bump(c, V.n);
  bump(c, V.harvest);
  bump(c, `${V.harvest}${idx(p.school)}`);
  if (p.big) bump(c, V.bigHarvest);
  e.mem.gapH = idx(p.school);
  e.mem.gapHk = p.big ? GAP.big : 1;
  e.mem.gapHU = key;
  c.emit({ t: 'gap-harvest', uid: e.uid, school: p.school, from: p.from, big: p.big });
}

/** 기술이 끝난 뒤 거둔 보너스 (사격의 치명은 타격 때 이미 실렸다) */
function settle(c: Combat, key: number) {
  for (const e of c.s.enemies) {
    if (e.mem.gapHU !== key) continue;
    const school = sch(e.mem.gapH);
    const k = e.mem.gapHk ?? 1;
    delete e.mem.gapH;
    delete e.mem.gapHk;
    delete e.mem.gapHU;
    if (c.over) continue;
    const alive = !e.dead && e.hp > 0;
    if (school === 'blade' && alive) c.apply(e, 'bleed', GAP.bleed * k, c.p);
    else if (school === 'occult' && alive) c.apply(e, 'mark', GAP.mark * k, c.p);
    else if (school === 'alchemy' && alive) c.apply(e, 'poison', GAP.poison * k, c.p);
    else if (school === 'resolve') c.gainBlock(c.p, GAP.block * k);
    else if (school === 'forbidden') c.gainSanity(GAP.sanity * k);
  }
}

// ───────────── 등록 ─────────────

reg.statuses([
  {
    id: GAP_ID,
    name: '틈',
    icon: 'gi:edge-crack',
    kind: 'debuff',
    // 색은 mem에 있어 상태 목록에는 띄우지 않는다 — 화면은 gapInfo로 그린다
    hidden: true,
    desc: '다른 계열의 기술로 치면 거둔다. 수치가 2면 붕괴로 열린 큰 틈.',
  },
]);

reg.rules([
  {
    id: 'gap',
    hooks: {
      // 거두기는 타격 전에 정한다 (사격의 치명이 이 타격에 실리게). 미리보기에서도 같은 숫자를 보이고 상태는 바꾸지 않는다
      modDamageOut(c, _s, d) {
        if (d.src !== c.p || !d.attack || !d.skill || !isEnemy(d.tgt) || d.tags.includes(TAG)) return;
        const e = d.tgt;
        const key = useKey(c);
        const owned = d.skill.owned;
        // 이 타격이 붕괴시키면 큰 틈의 색 (onBreak)
        if (!c.previewing) {
          e.mem.gapCur = key;
          e.mem.gapCurS = idx(skillSchools(c, owned)[0] ?? null);
        }
        if (d.repeat) return;
        const p = plan(c, e, owned, key);
        if (!p) {
          // 통계: 틈이 열린 적을 같은 계열로 쳤다 (사용당 한 번)
          const g = read(e);
          if (!c.previewing && g && g.by !== key && !d.skill.struck?.includes(e.uid) && harvestsLeft(c) > 0 && skillSchools(c, owned).includes(g.school)) bump(c, V.same);
          return;
        }
        d.poiseBonus += GAP.poise;
        if (p.school === 'firearm') {
          // 조준이 이미 치명(2배)으로 만들었으면 큰 쪽만 남는다. 어느 쪽이든 조준은 쓰지 않고 남는다
          const m = 1 + (GAP.crit - 1) * (p.big ? GAP.big : 1);
          d.mult *= d.crit ? Math.max(1, m / 2) : m;
          d.crit = true;
          d.tags = [...d.tags, 'noaim'];
        }
        if (!c.previewing) harvest(c, e, p, key);
      },

      // 붕괴: 그 기술 색의 큰 틈 (기술의 타격이 아니거나 계열 없는 기술이면 열리지 않는다)
      onBreak(c, s, e) {
        if (s.unit !== c.p || c.s.phase !== 'player' || e.mem.gapCur !== useKey(c)) return;
        const school = sch(e.mem.gapCurS);
        if (school) openGap(c, e, school, true, useKey(c));
      },

      // 약점으로 버팀을 깎았으면 틈
      onDamageDealt(c, _s, d) {
        if (d.src !== c.p || !d.attack || !d.skill || !isEnemy(d.tgt) || d.tags.includes(TAG)) return;
        const e = d.tgt;
        delete e.mem.gapCur;
        delete e.mem.gapCurS;
        // 붕괴로 큰 틈이 열렸거나, 이미 붕괴해 버팀이 줄지 않았거나, 버팀이 없는 적
        if (d.broke || !d.weakHit || e.dead || e.hp <= 0 || e.broken !== 0 || e.maxPoise <= 0) return;
        const school = skillSchools(c, d.skill.owned)[0];
        if (school) openGap(c, e, school, false, useKey(c));
      },

      afterSkill(c, s) {
        if (s.unit === c.p) settle(c, useKey(c));
      },

      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        c.s.vars[V.end] = c.s.turn;
        for (const e of c.alive) {
          if (!((e.st[GAP_ID] ?? 0) > 0)) continue;
          const left = (e.mem.gapL ?? 1) - 1;
          if (left <= 0) closeGap(e);
          else e.mem.gapL = left;
        }
      },
    },
  },
]);
