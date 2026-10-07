import { josa } from '../../engine/josa';
import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit, Intent, MoveDef, Unit } from '../../engine/types';

/**
 * 3층(얼어붙은 고대 도시) 공용 헬퍼와 전용 상태.
 * - 동상: 쌓이면 몸이 얼어붙는다 (플레이어 행동력 -1 / 적 기절). 화염이 녹인다.
 * - 얼음 속에 갇힘: 얼어붙은 방의 적이 첫 차례를 움직이지 못한다 (층의 법칙 '얼음 속의 것들').
 * - 표본 채집(기술 빼앗기), 눈을 감아라(방어도로 막는 정신 공격), 원형질 흡수 …
 * 2026-10 개편: 꿈 관련 헬퍼·상태는 5층 `act5/dream.ts`로 옮겨 갔다. 함수는 등록이 없어 층마다 따로 두어도 된다.
 */

/** 숨겨진 의도 (통찰 HIDDEN_REVEAL = 3 이상만 보임) */
export const hid = (m: MoveDef): MoveDef => ({ ...m, hidden: true });

/** 환영(5층 적이 만드는 mem.illu 표식)인지 — 다른 층 적과 섞여도 안전하도록 남겨 둔다 */
export const isIllusion = (e: EnemyUnit): boolean => !!e.mem.illu;

/** 보상 없이 사라진다 (삼켜짐 등) */
export function vanish(c: Combat, e: EnemyUnit, text: string) {
  if (e.dead) return;
  e.dead = true;
  e.fled = true;
  e.block = 0;
  c.emit({ t: 'text', uid: e.uid, text, tone: 'eldritch' });
  c.emit({ t: 'death', uid: e.uid });
}

/** 통찰 강탈. holder가 보관하고, holder를 쓰러뜨리면 돌려받는다 (특성 'a3-brain-thief'). 통찰이 없으면 정신 피해 */
export function stealInsight(c: Combat, e: EnemyUnit, n: number, holder: EnemyUnit = e): number {
  if (isIllusion(e)) return 0;
  const k = Math.min(n, c.p.insight);
  if (k <= 0) {
    c.loseSanity(4, true);
    return 0;
  }
  c.p.insight -= k;
  holder.mem.brain = (holder.mem.brain ?? 0) + k;
  c.emit({ t: 'insight', delta: -k });
  c.emit({ t: 'text', uid: holder.uid, text: `통찰 -${k} (빼앗김)`, tone: 'eldritch' });
  return k;
}

/** 피해 없이 버팀만 깎는다 (0이 되면 붕괴) */
export function chipPoise(c: Combat, e: EnemyUnit, n: number) {
  if (e.dead || e.broken > 0 || e.maxPoise <= 0 || n <= 0) return;
  e.poise = Math.max(0, e.poise - n);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text: `버팀 -${n}`, tone: 'info' });
}

/** 적의 전열과 후열을 통째로 뒤바꾼다 */
export function swapRows(c: Combat) {
  const front = c.row(0);
  const back = c.row(1);
  if (!back.length) return;
  for (const x of front) {
    x.row = 1;
    c.emit({ t: 'row', uid: x.uid, row: 1 });
  }
  for (const x of back) {
    x.row = 0;
    c.emit({ t: 'row', uid: x.uid, row: 0 });
  }
}

/** 원형질 조각을 삼킨다: 조각마다 체력 회복, 삼켰다면 힘 +1. 조각이 없으면 방어도 */
export function absorbBlobs(c: Combat, e: EnemyUnit, healPer: number, maxN: number) {
  const blobs = c.alive.filter((x) => x.def === 'shoggoth-blob' && !isIllusion(x)).slice(0, maxN);
  if (!blobs.length) {
    c.gainBlock(e, 8);
    return;
  }
  for (const b of blobs) {
    vanish(c, b, '삼켜졌다');
    c.heal(e, healPer);
  }
  c.apply(e, 'str', 1, e);
}

// ───────────── 동상 ─────────────

export const FROST = 'a3-frostbite';
/** 차례가 시작될 때 동상이 이 이상이면 얼어붙는다 */
export const FROST_LIMIT = 5;

/** 동상을 건다 */
export function frost(c: Combat, t: Unit, n: number, src: Unit | null) {
  if (n > 0 && !c.over) c.apply(t, FROST, n, src);
}

/** 동상이 녹는다 */
export function melt(c: Combat, u: Unit, n: number) {
  const cur = u.st[FROST] ?? 0;
  if (cur <= 0 || n <= 0) return;
  c.apply(u, FROST, -Math.min(n, cur));
  c.emit({ t: 'text', uid: u.uid, text: '동상이 녹았다', tone: 'good' });
}

// ───────────── 얼음 속에 갇힘 ─────────────

export const ENCASED = 'a3-encased';

/** 얼음 속에 갇힌 적의 의도 (아무것도 하지 않는다) */
export const frozenIntent = (): Intent => ({ move: '_wait', kind: 'sleep', label: '얼음 속에 갇힘' });

// ───────────── 표본 채집 (기술 빼앗기) ─────────────

/** 이 정도 이상의 재사용 대기는 '빼앗김'으로 본다 */
const LOCKED = 90;

/** 장착한 기술 하나를 표본으로 빼앗는다. holder를 쓰러뜨리면 돌려받는다. 장착 기술이 둘 미만이면 빼앗지 않는다 */
export function seizeSkill(c: Combat, holder: EnemyUnit): boolean {
  if (holder.mem.specimen) return false;
  const held = new Set(c.s.enemies.filter((x) => !x.dead && x.mem.specimen).map((x) => x.mem.specimen - 1));
  const slots = c.run.slots
    .map((uid, i) => ({ uid, i }))
    .filter((x): x is { uid: string; i: number } => !!x.uid && !held.has(x.i) && (c.s.cd[x.uid] ?? 0) < LOCKED);
  if (slots.length < 2) return false;
  const pick = c.rng.pick(slots);
  holder.mem.specimen = pick.i + 1;
  holder.mem.specimenCd = c.s.cd[pick.uid] ?? 0;
  c.s.cd[pick.uid] = 99;
  c.emit({ t: 'text', uid: 'p', text: `「${skillName(c, pick.uid)}」${josa(skillName(c, pick.uid), '을')} 표본으로 빼앗겼다`, tone: 'bad' });
  return true;
}

/** 빼앗긴 기술을 돌려받는다 */
export function returnSkill(c: Combat, holder: EnemyUnit) {
  const i = (holder.mem.specimen ?? 0) - 1;
  if (i < 0) return;
  holder.mem.specimen = 0;
  const uid = c.run.slots[i];
  if (!uid) return;
  const left = holder.mem.specimenCd ?? 0;
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: `「${skillName(c, uid)}」${josa(skillName(c, uid), '을')} 되찾았다`, tone: 'good' });
}

function skillName(c: Combat, uid: string): string {
  const owned = c.run.skills.find((s) => s.uid === uid);
  return (owned && SKILLS.get(owned.id)?.name) || '기술';
}

// ───────────── 눈을 감아라 (방어도로 막는 정신 공격) ─────────────

/** 방어도가 먼저 막아 내는 정신 공격. 막고 남은 만큼만 정신력을 잃는다. feed면 잃은 정신력만큼 시전자가 회복 */
export function veiledHorror(c: Combat, e: EnemyUnit, n: number, feed = false): number {
  let rest = n;
  const b = Math.min(c.p.block, rest);
  if (b > 0) {
    c.p.block -= b;
    rest -= b;
    c.emit({ t: 'text', uid: 'p', text: rest > 0 ? `눈을 가렸다 (방어도 -${b})` : '눈을 가려 보지 않았다', tone: 'info' });
  }
  if (rest <= 0 || c.over) return 0;
  const lost = c.horror(e, rest);
  if (feed && lost > 0 && !e.dead && !c.over) {
    c.heal(e, lost);
    c.emit({ t: 'text', uid: e.uid, text: '공포를 삼킨다', tone: 'eldritch' });
  }
  return lost;
}

// ───────────── 3층 전용 상태 ─────────────

reg.statuses([
  {
    id: 'a3-timeworn',
    name: '시간 상실',
    icon: 'gi:backward-time',
    kind: 'debuff',
    desc: '다음 턴 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `시간을 잃었다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, 'a3-timeworn');
    },
  },
  {
    id: FROST,
    name: '동상',
    icon: 'gi:snowflake-2',
    kind: 'debuff',
    desc: `얻는 방어도 -{n}. 차례가 시작될 때 ${FROST_LIMIT} 이상이면 몸이 얼어붙는다 (행동력 -1, 적은 기절). 화염 기술을 쓰거나 화염에 닿으면 2 녹는다`,
    hooks: {
      modBlock(_c, s, b) {
        b.amount -= s.n;
      },
      afterSkill(c, _s, u) {
        if ((u.type ?? u.def.type) === 'fire') melt(c, c.p, 2);
      },
      onDamageTaken(c, s, d) {
        if (d.type === 'fire' && d.tgt === s.unit && d.amount > 0) melt(c, s.unit, 2);
      },
    },
    tickStart(c, u, n) {
      if (n < FROST_LIMIT) return;
      c.clear(u, FROST);
      if (isEnemy(u)) {
        c.apply(u, 'stun', 1, null);
        c.emit({ t: 'text', uid: u.uid, text: '얼어붙었다', tone: 'good' });
        return;
      }
      c.s.ap = Math.max(1, c.s.ap - 1);
      c.emit({ t: 'text', uid: 'p', text: '몸이 얼어붙었다 (행동력 -1)', tone: 'bad' });
    },
  },
  {
    id: ENCASED,
    name: '얼음 속에 갇힘',
    icon: 'gi:ice-cube',
    kind: 'debuff',
    desc: '아직 얼음 속에 갇혀 이번 차례에 움직이지 못한다',
    hooks: {
      onUnitTurnStart(_c, s) {
        if (isEnemy(s.unit)) s.unit.intent = frozenIntent();
      },
    },
    tickEnd(c, u) {
      c.clear(u, ENCASED);
      if (isEnemy(u)) c.emit({ t: 'text', uid: u.uid, text: '얼음을 깨고 나왔다', tone: 'bad' });
    },
  },
]);
