import { josa } from '../../engine/josa';
import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, MAX_ROW, type Combat } from '../../engine/combat';
import type { DamageCtx, EnemyUnit, Intent, MoveDef, Unit } from '../../engine/types';

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

// ───────────── 반응하는 의도 (2026-10 일반 적 패턴) ─────────────
// 적의 특성 훅은 내 기술을 직접 보지 못한다. 대신 맞을 때(onDamageTaken)·누가 쓰러질 때(onAnyDeath) 의도를 바꿔
// 그 자리에서 보여 준다 — 바뀐 의도는 내 턴 안에 보이므로 남은 행동력으로 대응할 수 있다.

/** 이 행동을 지금 의도로 정할 때의 모습 (planIntent와 같은 계산: 근접 행동인데 후열이면 전진·관망) */
export function intentFor(c: Combat, e: EnemyUnit, id: string): Intent {
  let move = id;
  let m = c.moveDef(e, id);
  if (m.melee && e.row !== 0) {
    move = c.row(0).length < MAX_ROW ? '_advance' : '_wait';
    m = c.moveDef(e, move);
  }
  return {
    move,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
    hidden: m.hidden,
    charging: m.charging,
    disguise: m.disguise,
  };
}

/** 내 턴에 내 손으로 준 피해 (지속 피해·적끼리 준 피해·적의 차례에 되돌려 준 피해는 빼고) */
export function myHit(c: Combat, d: DamageCtx): boolean {
  return d.src === c.p && c.s.phase === 'player';
}

/** 지금 의도를 바꿀 수 있는가: 살아 있고, 내 턴이고, 붕괴·기절·얼음에 갇히지 않았고, 모아 둔 힘을 쏟아낼 차례가 아니다 */
export function canReact(c: Combat, e: EnemyUnit): boolean {
  if (e.dead || e.hp <= 0 || c.over || c.s.phase !== 'player' || e.broken === 2 || e.mem.charge) return false;
  return !((e.st.stun ?? 0) > 0) && !((e.st[ENCASED] ?? 0) > 0);
}

/** 반응: 내 턴 도중 의도를 이 행동으로 바꿔 보인다 (key마다 한 턴에 한 번). 바꿨으면 true */
export function react(c: Combat, e: EnemyUnit, id: string, text?: string, tone: 'good' | 'bad' | 'eldritch' = 'eldritch', key = 'rx'): boolean {
  if (!canReact(c, e) || e.mem[key] === c.s.turn) return false;
  e.mem[key] = c.s.turn;
  e.intent = intentFor(c, e, id);
  if (text) c.emit({ t: 'text', uid: e.uid, text, tone });
  return true;
}

/** 지금 의도의 피해·횟수를 다시 센다 (의도를 정한 뒤 높이·무리 수처럼 수치가 바뀌었을 때) */
export function refreshIntent(c: Combat, e: EnemyUnit) {
  const it = e.intent;
  if (!it || e.dead || it.move.startsWith('_')) return;
  const m = c.moveDef(e, it.move);
  e.intent = { ...it, dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg, hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits };
}

/** 앞(전열)에 이것 말고 다른 적이 버티고 있는가 */
export const covered = (c: Combat, e: EnemyUnit): boolean => c.row(0).some((x) => x !== e);

// ───────────── 일반 적의 상태 (2026-10 패턴) ─────────────

/** 밤의 마귀: 탑 끝에 매달려 쌓은 높이 = 「급강하」 추가 피해 */
export const HEIGHT = 'a3-height';
/** 썰매개가 들은 탐사대원의 휘파람 = 다음 공격 추가 피해 */
export const CALLED = 'a3-called';
/** 썰매개의 터진 실밥 = 공격 추가 피해 ({n}). 자기 차례가 끝날 때마다 TORN_LOSS를 잃는다 */
export const TORN = 'a3-torn';
export const TORN_LOSS = 2;
/** 숨은 상태: 내 턴이 끝날 때의 방어도를 기억한다 (쇼고스 유충이 배운다) */
export const WATCH = 'a3-watch';
/** WATCH가 적어 두는 값: 지난 내 턴을 마친 방어도 */
export const END_BLOCK = 'a3-endBlk';

/** 내 턴을 마칠 때의 방어도를 지켜보기 시작한다 (전투 시작 시) */
export function watchBlock(c: Combat) {
  c.p.st[WATCH] = 1;
}

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
  // ── 일반 적의 상태 (2026-10 패턴) ──
  {
    id: HEIGHT,
    name: '높이',
    icon: 'gi:bat-wing',
    kind: 'buff',
    desc: '탑 끝에 매달려 노린다. 「급강하」 피해 +{n}. 내 공격에 맞으면 사라진다 (회피로 흘린 공격은 빼고)',
  },
  {
    id: CALLED,
    name: '휘파람',
    icon: 'gi:whistle',
    kind: 'buff',
    desc: '탐사대원의 휘파람을 들었다. 공격 피해 +{n}. 자기 차례가 끝나면 사라진다',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.src === s.unit) d.add += s.n;
      },
    },
    tickEnd(c, u) {
      c.clear(u, CALLED);
    },
  },
  {
    id: TORN,
    name: '터진 실밥',
    icon: 'gi:stitched-wound',
    kind: 'buff',
    desc: `꿰맨 배가 터져 미쳐 날뛴다. 공격 피해 +{n}. 자기 차례가 끝날 때마다 체력 ${TORN_LOSS}를 잃는다`,
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.src === s.unit) d.add += s.n;
      },
    },
    tickEnd(c, u) {
      if (!isEnemy(u)) return;
      c.emit({ t: 'text', uid: u.uid, text: '터진 배에서 피가 쏟아진다', tone: 'good' });
      c.loseHp(u, TORN_LOSS, 'torn');
    },
  },
  {
    id: WATCH,
    name: '지켜보는 원형질',
    icon: 'gi:eye-target',
    kind: 'buff',
    hidden: true,
    desc: '원형질이 내가 몸을 어떻게 지키는지 지켜본다',
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit === c.p) c.s.vars[END_BLOCK] = c.p.block;
      },
    },
  },
]);
