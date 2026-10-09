import { BUILTIN_MOVES, isEnemy, type Combat } from '../engine/combat';
import { ENEMIES, TRAITS, reg } from '../engine/registry';
import { Rng, deriveSeed } from '../engine/rng';
import { DMG_KO, DMG_TYPES, type DmgType, type EnemyDef, type EnemyUnit, type Hooks } from '../engine/types';
import { FROST } from './act3/common';
import { cine } from './lib';

/*
 * 심연 압력 (2026-10): 깊은 층일수록 판이 완성된 덱에게도 어려운 싸움.
 * 봇(판짜기가 서툰 플레이어)과 '사람처럼 강한 봇'(피해 1.5~2.5배)을 나란히 돌려 보니, 강한 쪽은 4·5층 정예를 3턴, 체력 5%만 잃고 넘겼다.
 * 체력·공격 배율만 올리면 서툰 쪽이 먼저 무너진다 — 그래서 강한 덱일수록 더 걸리는 장치를 넣는다 (레퍼런스는 각 항목에).
 *
 * 1. 가호 — 3층부터 정예·수호자는 한 턴(내 턴과 이어지는 적의 차례)에 받는 피해에 상한이 있다. 붕괴하면 상한이 1.5배 (aegisBroken).
 *    슬레이 더 스파이어 「타락한 심장」의 무적(한 턴 피해 상한) — 아무리 세도 몇 턴은 패턴을 보여 준다. 붕괴가 상한을 여는 열쇠 (붕괴: 스타레일)
 * 2. 붕괴 내성 — engine/combat.ts TOLERANCE (몬스터 헌터의 기절 내성, 다키스트 던전의 기절 저항)
 * 3. 변이 — 2층부터 정예, 3층부터 일반 적에게 무작위로 붙는 특성. 깊은 층엔 판짜기를 노리는 2단계 변이가 섞인다.
 *    슬레이 더 스파이어의 불타는 정예(힘·체력·금속화·재생), 리스크 오브 레인 2의 정예 종류(후반에만 나오는 2단계 정예),
 *    몬스터 트레인의 협약 조각(일반 적이 무작위로 강해진다), 데드 셀의 말레이즈(일반 적이 정예가 된다)
 * 4. 각성 — 3층부터 층 수호자·계층군주는 체력이 60% 아래로 내려가면 깨어난다: 버팀 1.5배(두 번째 버팀 — 스타레일의 여러 겹 강인성),
 *    결계, 그리고 「심연 강타」를 모은다 (모으는 동안 붕괴시키면 끊긴다). 하데스 「극단적 조치」(수호자가 새 패턴을 쓴다)
 *
 * 퍼즐 목표(c.s.obj)가 걸린 동안에는 가호와 목표를 막는 변이(재생·불굴·결속·망령)가 쉰다 — 즉사 퍼즐이 풀리지 않는 일이 없게.
 * 마지막 수호자(별의 태아)는 세 단계를 따로 설계해 가호·각성을 받지 않는다.
 */

export const DEPTH = {
  /** 변이 개수 (층 인덱스): 정예. 소수는 그 확률로 하나 더 (1.5 = 하나 + 50%로 둘) */
  mutElite: [0, 0, 1, 1, 1, 1.5],
  /** 일반 적에게 변이가 하나 붙을 확률 (층 인덱스) */
  mutNormal: [0, 0, 0, 0.25, 0.4, 0.55],
  /** 판짜기를 노리는 2단계 변이가 나오는 층과 그 무게 (층 인덱스) */
  tier2From: 4,
  tier2Weight: [0, 0, 0, 0, 1, 1],
  /** 가호: 한 턴에 받는 피해 상한 (최대 체력 비율, 층 인덱스) */
  aegisElite: [0, 0, 0, 0.3, 0.2, 0.16],
  aegisBoss: [0, 0, 0, 0.22, 0.15, 0.12],
  /** 붕괴해 있는 동안 상한 배율 (2026-10-09 붕괴 보상 줄이기: 2 → 1.5) */
  aegisBroken: 1.5,
  /**
   * 가호는 버팀도 지킨다: 한 턴에 깎이는 버팀 상한 (최대 버팀 비율, 올림, 층 인덱스).
   * 강한 덱이 여러 번 때려 첫 턴에 무너뜨리던 것 — 피해 상한처럼 몰아치는 덱에만 걸린다 (심연을 모으는 동안은 지키지 못한다)
   */
  aegisPoiseElite: [0, 0, 0, 0.6, 0.5, 0.5],
  aegisPoiseBoss: [0, 0, 0, 0.5, 0.4, 0.4],
  /** 각성: 이 층부터, 체력이 이 비율 아래로 내려가면 */
  awakenFrom: 3,
  awakenAt: 0.6,
  /** 각성하면 버팀 최대치 배율 */
  awakenPoise: 1.5,
  /** 심연 강타 피해 (층 인덱스, 층·수호자 배율 전) */
  blast: [0, 0, 0, 30, 38, 44],
  /** 심연 강타를 쓰고 다시 모으기까지 (턴) */
  blastEvery: 4,
};

/** 5층 심연 강타(꿈의 붕락)의 정신 피해 */
const BLAST_SANITY = 8;

/**
 * 가호·각성을 받지 않는 적: 세 단계를 따로 설계한 마지막 수호자, 몰아치는 피해에 스스로 답하는 문턱의 존재
 * (한 턴에 최대 체력의 25%를 넘게 받으면 세계가 뒤집힌다 — 가호가 그 아래로 막으면 패턴이 사라진다)
 */
const OWN_DESIGN = ['a5-unborn', 'a5-liminal'];
/** 변이가 붙지 않는 적 (무리·도둑·무고한 자처럼 성격이 정해진 것) */
const NO_MUT = ['swarm', 'thief', 'a2-innocent', 'a5-pilgrim'];

const defOf = (e: EnemyUnit): EnemyDef | undefined => ENEMIES.get(e.def);
const actOf = (e: EnemyUnit) => Math.min(5, defOf(e)?.act ?? 1);
const puzzling = (c: Combat) => !!c.s.obj;
const ownDesign = (def: EnemyDef) => (def.traits ?? []).some((t) => OWN_DESIGN.includes(t));

// ───────────── 가호 ─────────────

/** 이 적의 가호: 한 턴에 받을 수 있는 피해 (없으면 0) */
export function aegisCap(e: EnemyUnit): number {
  const def = defOf(e);
  // mem.agOff: 가호를 걷어 낸 적 (테스트에서 체력을 한 번에 깎아 장면을 만들 때도)
  if (!def || e.minion || e.mem.agOff || ownDesign(def)) return 0;
  const act = Math.min(5, def.act);
  const r = def.tier === 'boss' ? DEPTH.aegisBoss[act] : def.tier === 'elite' ? DEPTH.aegisElite[act] : 0;
  if (!r) return 0;
  return Math.max(1, Math.round(e.maxHp * r * (e.broken > 0 ? DEPTH.aegisBroken : 1)));
}

/** 가호: 이 적이 한 턴에 잃을 수 있는 버팀 (없으면 0 = 상한 없음) */
export function aegisPoiseCap(e: EnemyUnit): number {
  const def = defOf(e);
  if (!def || e.minion || e.mem.agOff || ownDesign(def) || e.maxPoise <= 0) return 0;
  const act = Math.min(5, def.act);
  const r = def.tier === 'boss' ? DEPTH.aegisPoiseBoss[act] : def.tier === 'elite' ? DEPTH.aegisPoiseElite[act] : 0;
  return r ? Math.max(1, Math.ceil(e.maxPoise * r)) : 0;
}

/** 이번 턴에 이 적이 받은 피해 (가호에 센 것) */
function aegisTaken(c: Combat, e: EnemyUnit): number {
  return e.mem.agR === c.s.turn ? (e.mem.agD ?? 0) : 0;
}

/** 이번 턴에 이 적이 더 받을 수 있는 피해 (가호가 없으면 Infinity) */
export function aegisLeft(c: Combat, e: EnemyUnit): number {
  const cap = aegisCap(e);
  return cap > 0 ? Math.max(0, cap - aegisTaken(c, e)) : Infinity;
}

/** 상태 칸의 '가호'를 남은 양으로 맞춘다 (상한은 mem에서 센다 — 상태가 지워져도 규칙은 그대로). 다 닳으면 칸에서 사라진다 */
function showAegis(c: Combat, e: EnemyUnit) {
  if (aegisCap(e) <= 0 || e.dead) return;
  const left = aegisLeft(c, e);
  if (left > 0) e.st.aegis = left;
  else delete e.st.aegis;
}

/** 내 쪽에서 온 피해 (내 공격·가시·반격·내가 건 지속 피해) — 버팀과 같은 기준 */
const fromPlayer = (c: Combat, d: { src: unknown; tags: string[] }) => d.src === c.p || (d.src === null && d.tags.includes('dot'));

// ───────────── 각성 ─────────────

/** 각성하는 수호자인가 (3층부터 층 수호자·계층군주) */
export function canAwaken(e: EnemyUnit): boolean {
  const def = defOf(e);
  return !!def && def.tier === 'boss' && def.act >= DEPTH.awakenFrom && !ownDesign(def);
}

function awaken(c: Combat, e: EnemyUnit) {
  e.mem.awk = 1;
  // 이미 정해 둔 행동은 그대로 (명령·퍼즐처럼 상태를 걸어 둔 것일 수 있다) — 다음에 행동을 정할 때부터 모은다.
  // 수호자 자신의 페이즈 전환(처음 쓰는 행동)은 plainMove가 지킨다
  e.mem.awkNext = c.s.turn;
  const act = actOf(e);
  if (e.maxPoise > 0) {
    e.maxPoise = Math.round(e.maxPoise * DEPTH.awakenPoise);
    if (e.broken === 0) e.poise = e.maxPoise;
  }
  cine(c, 'crack', { n: 1, uid: e.uid });
  c.emit({ t: 'text', uid: e.uid, text: '심연이 깨어난다', tone: 'eldritch' });
  c.apply(e, 'ward', Math.max(1, act - 1), e);
}

/** 심연을 모으는 차례가 끼어들어도 되는 평범한 행동인가 (명령·퍼즐·차지·즉사·소환·변신은 수호자의 설계대로 둔다) */
function plainMove(c: Combat, e: EnemyUnit, id: string): boolean {
  // 이 전투에서 이미 써 본 행동만 (처음 쓰는 행동은 절반 변신·페이즈 전환처럼 한 번뿐인 것일 수 있다 — AI가 이미 표시를 해 두었다)
  if (id.startsWith('_') || !e.mem[`did:${id}`]) return false;
  const m = c.moveDef(e, id);
  if (m.ultimate || m.charging || m.disguise || m.hidden || m.extra?.includes('death')) return false;
  return ['attack', 'block', 'buff', 'debuff', 'horror'].includes(m.intent);
}

const blastOf = (e: EnemyUnit) => DEPTH.blast[actOf(e)] ?? DEPTH.blast[3];

/** 층마다 다른 심연 강타 (3층 동상 · 4층 취약 · 5층 정신 피해) */
const BLASTS: Record<3 | 4 | 5, { name: string; rider: string; then(c: Combat, e: EnemyUnit): void; sanity?: number }> = {
  3: { name: '얼어붙은 심연', rider: `동상 2`, then: (c, e) => void c.apply(c.p, FROST, 2, e) },
  4: { name: '별의 낙인', rider: '취약 2', then: (c, e) => void c.apply(c.p, 'vuln', 2, e) },
  5: { name: '꿈의 붕락', rider: `정신 피해 ${BLAST_SANITY}`, sanity: BLAST_SANITY, then: (c, e) => void c.horror(e, BLAST_SANITY) },
};
/** 이 수호자가 모으고 터뜨리는 행동 id */
export const gatherId = (e: EnemyUnit) => `_abyss-gather${Math.max(3, actOf(e))}`;
export const blastId = (e: EnemyUnit) => `_abyss-blast${Math.max(3, actOf(e))}`;

for (const act of [3, 4, 5] as const) {
  const b = BLASTS[act];
  BUILTIN_MOVES[`_abyss-gather${act}`] = {
    name: '심연을 모은다',
    intent: 'charge',
    charging: true,
    follow: b.name,
    dmg: (_c, e) => blastOf(e),
    desc: `다음 차례에 「${b.name}」(공허 피해와 ${b.rider}). 그 전에 붕괴시키면 끊긴다 — 모으는 동안에는 버팀이 두 배로 깎인다`,
    run(c, e) {
      delete e.mem.agp;
      e.mem.abc = 1;
      c.emit({ t: 'text', uid: e.uid, text: '심연을 끌어모은다…', tone: 'bad' });
    },
  };
  BUILTIN_MOVES[`_abyss-blast${act}`] = {
    name: b.name,
    intent: b.sanity ? 'horror' : 'attack',
    extra: b.sanity ? ['attack'] : undefined,
    sanity: b.sanity,
    dmg: (_c, e) => blastOf(e),
    melee: false,
    ultimate: true,
    cine: 'impact',
    desc: `모은 심연을 터뜨린다: 공허 피해와 ${b.rider}. ${DEPTH.blastEvery}턴 뒤에 다시 모은다`,
    run(c, e) {
      delete e.mem.abc;
      e.mem.awkNext = c.s.turn + DEPTH.blastEvery;
      c.s.vars['abyss:blast'] = (c.s.vars['abyss:blast'] ?? 0) + 1;
      c.enemyAttack(e, { type: 'void' });
      if (!c.over && !e.dead) b.then(c, e);
    },
  };
}

// ───────────── 변이 ─────────────

export interface Mutation {
  id: string;
  name: string;
  icon: string;
  /** 1: 2층부터 · 2: DEPTH.tier2From층부터 (판짜기를 노리는 것) */
  tier: 1 | 2;
  desc: string;
  /** 같은 적에 함께 붙지 않는 변이 */
  clash?: string[];
  /** 이 적에게 붙을 수 있는가 */
  ok?(def: EnemyDef, c: Combat, e: EnemyUnit): boolean;
  /** 붙는 순간 (상태 등) */
  init?(c: Combat, e: EnemyUnit, act: number): void;
  hooks?: Hooks;
}

const wardOf = (act: number) => Math.max(1, act - 1);
/** 불굴: 한 턴에 깎이는 버팀 상한 */
export const STEADFAST = 2;
/** 터지는 몸: 층 × 이만큼 */
export const VOLATILE = 3;
/** 대가: 한 턴에 이만큼 쓴 뒤의 기술마다 체력을 잃는다 */
export const TOLL = { free: 3, hp: 2 };

/** 같은 턴에 한 번만 글을 띄운다 */
function sayOnce(c: Combat, e: EnemyUnit, key: string, text: string) {
  if (e.mem[key] === c.s.turn) return;
  e.mem[key] = c.s.turn;
  c.emit({ t: 'text', uid: e.uid, text, tone: 'info' });
}


export const MUTATIONS: Mutation[] = [
  // ── 1단계 (2층부터) ──
  {
    id: 'mut-ward',
    name: '봉인 문양',
    icon: 'gi:magic-shield',
    tier: 1,
    desc: '해로운 효과를 막는 결계를 두르고 나온다 (깊은 층일수록 두껍다). 자기 차례 세 번마다 결계 한 겹을 되살린다',
    init: (c, e, act) => void c.apply(e, 'ward', wardOf(act), e),
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        e.mem.mwT = (e.mem.mwT ?? 0) + 1;
        if (e.mem.mwT % 3 === 0 && (e.st.ward ?? 0) < wardOf(actOf(e))) c.apply(e, 'ward', 1, e);
      },
    },
  },
  {
    id: 'mut-regen',
    name: '되살아나는 살',
    icon: 'gi:regeneration',
    tier: 1,
    desc: '자기 차례가 끝날 때 최대 체력의 3%(4층부터 5%)를 회복한다. 불타거나 피 흘리거나 중독된 동안에는 아물지 않는다',
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.hp <= 0 || puzzling(c)) return;
        if ((e.st.burn ?? 0) + (e.st.bleed ?? 0) + (e.st.poison ?? 0) > 0) return;
        c.heal(e, Math.ceil(e.maxHp * (actOf(e) >= 4 ? 0.05 : 0.03)));
      },
    },
  },
  {
    id: 'mut-spikes',
    name: '가시 갑각',
    icon: 'gi:spiked-shell',
    tier: 1,
    desc: '가시 껍질을 두르고 나온다 — 공격을 받을 때마다 공격자에게 피해 (여러 번 때리는 공격일수록 아프다)',
    init: (c, e, act) => void c.apply(e, 'spikes', Math.max(1, act - 2), e),
  },
  {
    id: 'mut-armor',
    name: '강철 피부',
    icon: 'gi:layered-armor',
    tier: 1,
    desc: '경화를 두르고 나온다 — 자기 차례가 끝날 때마다 방어도를 얻는다 (깊은 층일수록 두껍다)',
    init: (c, e, act) => void c.apply(e, 'harden', 2 * act, e),
  },
  {
    id: 'mut-rage',
    name: '광포',
    icon: 'gi:enrage',
    tier: 1,
    desc: '의식을 두르고 나온다 — 자기 차례가 끝날 때마다 힘 +1. 오래 끌수록 위험하다',
    init: (c, e) => void c.apply(e, 'ritual', 1, e),
  },
  {
    id: 'mut-adapt',
    name: '적응',
    icon: 'gi:chameleon-glyph',
    tier: 1,
    desc: '마지막으로 받은 공격 속성의 피해를 절반만 받는다. 자기 차례가 시작되면 풀린다 (속성을 바꿔 가며 칠 것)',
    ok: (def) => !(def.traits ?? []).some((t) => ['a2-adaptive', 'a5-geometry', 'a5-liminal'].includes(t)),
    hooks: {
      modDamageIn(_c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e || !d.attack || d.type === 'true') return;
        if (e.mem.mad && DMG_TYPES[e.mem.mad - 1] === d.type) d.mult *= 0.5;
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e || !d.attack || d.type === 'true' || e.hp <= 0) return;
        const k = DMG_TYPES.indexOf(d.type) + 1;
        if (e.mem.mad === k) return;
        e.mem.mad = k;
        c.emit({ t: 'text', uid: e.uid, text: `${DMG_KO[d.type]}에 적응했다`, tone: 'info' });
      },
      onUnitTurnStart(_c, s) {
        if (isEnemy(s.unit)) delete s.unit.mem.mad;
      },
    },
  },
  {
    id: 'mut-undying',
    name: '망령',
    icon: 'gi:raise-zombie',
    tier: 1,
    desc: '처음 쓰러지면 체력 30%로 다시 일어선다',
    clash: ['mut-volatile'],
    // 쓰러질 때 하는 일이 이미 있는 적(부활·분열·변신)에는 붙지 않는다
    ok: (def) => !(def.traits ?? []).some((t) => TRAITS.get(t)?.hooks.onDeath),
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead || e.mem.revived || puzzling(c)) return;
        e.mem.revived = 1;
        e.dead = false;
        e.hp = Math.ceil(e.maxHp * 0.3);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '다시 일어선다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'mut-leech',
    name: '흡혈',
    icon: 'gi:vampire-dracula',
    tier: 1,
    desc: '체력 피해를 준 만큼의 절반을 회복한다',
    hooks: {
      onDamageDealt(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && d.src === e && d.tgt === c.p && d.hpLoss > 0 && !e.dead) c.heal(e, Math.ceil(d.hpLoss / 2));
      },
    },
  },
  // ── 2단계 (4층부터 — 판짜기를 노린다) ──
  {
    id: 'mut-steadfast',
    name: '불굴',
    icon: 'gi:anvil-impact',
    tier: 2,
    desc: `한 턴에 버팀이 ${STEADFAST}까지만 깎인다 (여러 번 때려 한 번에 무너뜨리지 못한다)`,
    ok: (def) => def.poise > 0,
    hooks: {
      modPoiseLoss(c, s, t, dec) {
        if (t !== s.unit || puzzling(c)) return dec;
        const used = t.mem.sfR === c.s.turn ? (t.mem.sfN ?? 0) : 0;
        const n = Math.min(dec, Math.max(0, STEADFAST - used));
        t.mem.sfR = c.s.turn;
        t.mem.sfN = used + n;
        if (n < dec) sayOnce(c, t, 'sfSaid', '불굴: 더는 흔들리지 않는다');
        return n;
      },
    },
  },
  {
    id: 'mut-mending',
    name: '치유의 오라',
    icon: 'gi:healing',
    tier: 2,
    desc: '자기 차례가 끝날 때마다 다른 적들이 최대 체력의 4%씩 회복한다 (먼저 쓰러뜨릴 것)',
    ok: (_def, c, e) => c.alive.some((x) => x !== e && !x.minion),
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        for (const x of c.alive) if (x !== e && !x.minion) c.heal(x, Math.ceil(x.maxHp * 0.04));
      },
    },
  },
  {
    id: 'mut-volatile',
    name: '터지는 몸',
    icon: 'gi:explosion-rays',
    tier: 2,
    desc: `쓰러지면 터져 화염 피해 (층 × ${VOLATILE}, 방어도로 막을 수 있다)`,
    clash: ['mut-undying'],
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead || c.over) return;
        c.emit({ t: 'text', uid: e.uid, text: '터진다!', tone: 'bad' });
        c.damage({ src: null, tgt: c.p, base: VOLATILE * actOf(e), type: 'fire', tags: ['volatile'] });
      },
    },
  },
  {
    id: 'mut-toll',
    name: '시간의 대가',
    icon: 'gi:sands-of-time',
    tier: 2,
    desc: `살아 있는 동안, 한 턴에 ${TOLL.free + 1}번째 기술부터 쓸 때마다 체력 ${TOLL.hp}를 잃는다`,
    // 규칙(아래 depth)의 afterSkill에서 센다 — 적의 특성에는 기술 사용 훅이 닿지 않는다
  },
  {
    id: 'mut-bond',
    name: '결속',
    icon: 'gi:linked-rings',
    tier: 2,
    desc: '다른 적이 살아 있는 동안 버팀이 깎이지 않는다 (먼저 다른 적을 쓰러뜨릴 것)',
    ok: (def, c, e) => def.poise > 0 && c.alive.some((x) => x !== e && !x.minion),
    hooks: {
      modPoiseLoss(c, s, t, dec) {
        if (t !== s.unit || puzzling(c)) return dec;
        if (!c.alive.some((x) => x !== t && !x.minion)) return dec;
        sayOnce(c, t, 'bdSaid', '결속: 다른 것이 살아 있는 한 흔들리지 않는다');
        return 0;
      },
    },
  },
  {
    id: 'mut-hex',
    name: '썩히는 손톱',
    icon: 'gi:bleeding-heart',
    tier: 2,
    desc: '공격으로 체력 피해를 주면 썩은 상처 2 — 회복량이 절반이 된다',
    hooks: {
      onDamageDealt(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && d.src === e && d.tgt === c.p && d.attack && d.hpLoss > 0) c.apply(c.p, 'mut-wound', 2, e);
      },
    },
  },
];

reg.traits(MUTATIONS.map((m) => ({ id: m.id, name: m.name, desc: m.desc, hooks: m.hooks ?? {} })));

export const MUTATION = new Map(MUTATIONS.map((m) => [m.id, m]));

/** 이 적에게 변이를 굴린다 (한 번만 — 굴렸으면 e.affix가 있다) */
export function rollMutations(c: Combat, e: EnemyUnit) {
  if (e.affix) return;
  e.affix = [];
  const def = defOf(e);
  if (!def || e.minion || def.reachable || (def.tier !== 'normal' && def.tier !== 'elite')) return;
  if ((def.traits ?? []).some((t) => NO_MUT.includes(t))) return;
  const act = Math.min(5, def.act);
  if (typeof c.run.rng.mut !== 'number') c.run.rng.mut = deriveSeed(c.run.seed, 'mut');
  const r = new Rng(c.run.rng, 'mut');
  const want = def.tier === 'elite' ? DEPTH.mutElite[act] : DEPTH.mutNormal[act];
  const n = Math.floor(want) + (r.chance(want - Math.floor(want)) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const have = e.affix;
    const pool = MUTATIONS.filter(
      (m) => (m.tier === 1 || act >= DEPTH.tier2From) && !have.includes(m.id) && !m.clash?.some((x) => have.includes(x)) && (m.ok?.(def, c, e) ?? true),
    );
    if (!pool.length) break;
    const m = r.weighted(pool, (x) => (x.tier === 2 ? DEPTH.tier2Weight[act] : 1));
    have.push(m.id);
    m.init?.(c, e, act);
  }
}

// ───────────── 규칙 ─────────────

reg.statuses([
  {
    id: 'tolerance',
    name: '붕괴 내성',
    icon: 'gi:anvil-impact',
    kind: 'buff',
    desc: '붕괴를 겪을수록 버팀 최대치가 늘었다 (+{n}). 다음 붕괴는 더 어렵다',
  },
  {
    id: 'aegis',
    name: '가호',
    icon: 'gi:shield-reflect',
    kind: 'buff',
    desc: `이번 턴에 더 받을 수 있는 피해 {n}. 한 턴에 받는 피해에 상한이 있다 — 붕괴하면 상한이 ${DEPTH.aegisBroken}배, 내 턴이 시작되면 다시 찬다. 한 턴에 깎이는 버팀에도 상한이 있다 (한 번에 무너뜨리지 못한다)`,
  },
  {
    id: 'mut-wound',
    name: '썩은 상처',
    icon: 'gi:heart-drop',
    kind: 'debuff',
    decay: true,
    desc: '회복량 절반 ({n}턴)',
    hooks: {
      modHeal(_c, _s, n) {
        return n > 0 ? n / 2 : n;
      },
    },
  },
]);

reg.rules([
  {
    id: 'depth',
    hooks: {
      onEnemySpawn(c, _s, e) {
        rollMutations(c, e);
        showAegis(c, e);
      },
      onTurnStart(c) {
        for (const e of c.alive) showAegis(c, e);
      },
      // 가호: 남은 만큼만 들어간다 — 지속 피해·가시 같은 속성 없는 피해도 (미리보기도 같은 숫자, 상태는 바꾸지 않는다)
      modDamageFinal(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e || !fromPlayer(c, d) || puzzling(c)) return;
        const cap = aegisCap(e);
        if (cap <= 0) return;
        const left = Math.max(0, cap - aegisTaken(c, e));
        d.cap = d.cap === undefined ? left : Math.min(d.cap, left);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.tgt !== e) return;
        if (fromPlayer(c, d) && !puzzling(c) && aegisCap(e) > 0) {
          if (e.mem.agR !== c.s.turn) {
            e.mem.agR = c.s.turn;
            e.mem.agD = 0;
          }
          e.mem.agD = (e.mem.agD ?? 0) + d.amount;
          showAegis(c, e);
          if (e.st.aegis === 0 && e.hp > 0) sayOnce(c, e, 'agSaid', '가호가 상처를 막는다');
        }
        if (!e.dead && e.hp > 0 && !e.mem.awk && canAwaken(e) && e.hp <= e.maxHp * DEPTH.awakenAt) awaken(c, e);
      },
      // 각성할 수호자가 이 전투에서 써 본 행동 (plainMove)
      onUnitTurnEnd(_c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !canAwaken(e)) return;
        const last = e.hist[e.hist.length - 1];
        if (last && !last.startsWith('_')) e.mem[`did:${last}`] = 1;
      },
      onBreak(c, _s, e) {
        showAegis(c, e);
        // 모으던 심연이 흩어진다 — 다시 모으기까지 처음부터
        // 모으려던 차례에 끊겼다 (아직 모으기 전) — 다음에 행동을 정할 때 다시 고른다
        if (e.mem.agp) {
          delete e.mem.agp;
          c.s.vars['abyss:cut'] = (c.s.vars['abyss:cut'] ?? 0) + 1;
        }
        if (e.mem.abc) {
          c.s.vars['abyss:cut'] = (c.s.vars['abyss:cut'] ?? 0) + 1;
          delete e.mem.abc;
          e.mem.awkNext = c.s.turn + DEPTH.blastEvery;
          c.emit({ t: 'text', uid: e.uid, text: '모으던 심연이 흩어졌다', tone: 'good' });
        }
      },
      modPoiseLoss(c, s, t, dec) {
        if (t !== s.unit) return dec;
        // 심연을 모으는 동안 버팀이 두 배로 깎인다 (가호도 이때는 버팀을 지키지 못한다 — 끊을 수 있게)
        if (t.mem.abc) return dec * 2;
        // 가호: 한 턴에 깎이는 버팀 상한 (퍼즐 중에는 쉰다)
        const cap = aegisPoiseCap(t);
        if (cap <= 0 || dec <= 0 || puzzling(c)) return dec;
        const used = t.mem.apR === c.s.turn ? (t.mem.apN ?? 0) : 0;
        const n = Math.min(dec, Math.max(0, cap - used));
        t.mem.apR = c.s.turn;
        t.mem.apN = used + n;
        if (n < dec) sayOnce(c, t, 'apSaid', '가호가 흔들림을 막는다');
        return n;
      },
      // 모은 심연은 반드시 터뜨린다 (그 차례엔 AI를 부르지 않는다)
      planOverride(_c, s, e) {
        return e === s.unit && e.mem.abc ? blastId(e) : undefined;
      },
      // 각성한 수호자가 평범한 행동을 하려던 차례에 심연을 모은다 (퍼즐 중·자기 차지 중에는 기다린다)
      planReplace(c, s, e, planned) {
        if (e !== s.unit || !e.mem.awk || e.mem.charge || puzzling(c)) return undefined;
        if (c.s.turn < (e.mem.awkNext ?? 0) || !plainMove(c, e, planned)) return undefined;
        e.mem.agp = 1;
        return gatherId(e);
      },
      // 대가 (변이): 한 턴에 TOLL.free번 넘게 쓴 기술마다
      afterSkill(c, _s, u) {
        if (u.echo || c.s.used < TOLL.free) return;
        const n = c.alive.filter((e) => e.affix?.includes('mut-toll')).length;
        if (n > 0) {
          c.emit({ t: 'text', uid: 'p', text: '대가를 치른다', tone: 'bad' });
          c.loseHp(c.p, TOLL.hp * n, 'toll');
        }
      },
    },
  },
]);
