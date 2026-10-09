import { Rng } from './rng';
import {
  ANOMALIES,
  CONSUMABLES,
  ENEMIES,
  EQUIPS,
  ESSENCES,
  FLOORS,
  MADNESS,
  PERKS,
  RELICS,
  RULES,
  RUNES,
  SKILLS,
  STATUSES,
  TRAITS,
  need,
} from './registry';
import type {
  BlockCtx,
  CineName,
  CombatChoice,
  Objective,
  DamageCtx,
  DmgType,
  EncounterDef,
  EnemyDef,
  EnemyUnit,
  HookSelf,
  Hooks,
  Intent,
  IntentKind,
  MoveDef,
  OwnedSkill,
  School,
  SkillDef,
  SkillUse,
  Unit,
} from './types';
import type { RunState } from './run';
import { abyssDmgMult, abyssHpMult, abyssRise, abyssSources } from './abyss';
import { affixHooks, pactHooks } from './growth';
import { WEAKPOINT, revealWeakPoint, weakPointKnown, weakPointOf, wpOpen } from './weakpoint';

// ───────────── 통찰 ─────────────
// 대가 없이 들어오지 않는다(영구 대가를 치르는 선택·금기·수호자 유물). 1점마다 보이는 것이 늘어난다.
//   1: 전투를 시작할 때 적마다 아직 모르는 약점 하나 / 2: 약점 전부 / 3: 숨겨진·거짓 의도, 이번 판의 급소(engine/weakpoint.ts) / 4: 4층의 어둠·5층의 환영
//   5: 가장 깊은 속임수(검은 파라오의 자비·꿈의 문지기의 문). 문턱은 콘텐츠 상수 — 설명은 ui/text.ts의 INSIGHT_STEPS
//   약점 공격 피해는 누구나 +25%, 통찰 1점마다 +6% 더 (8까지). 대가는 받는 정신 피해 +5%/통찰 (6에서 멈춘다)

/** 거짓 의도(disguise)를 간파하는 통찰 — 의도마다 reveal로 따로 정할 수 있다 */
export const DISGUISE_REVEAL = 3;
/** 숨겨진 의도(???)가 보이는 통찰 */
export const HIDDEN_REVEAL = 3;
/**
 * 약점으로 맞힌 내 공격의 피해 보너스 (통찰과 상관없이).
 * 2026-10 2차: 대가 없는 통찰(수호자 이계 정수)을 뺀 몫을 메운다.
 * 작업 트리 시뮬(두 시드 묶음 × 출신 셋 × 80판, 틈 개편 포함): 0.1 → 55.5%, 0.18 → 55.5%, 0.25 → 56%.
 * 0.1이면 시작 덱으로 2층 정예를 못 넘는 출신이 생겨(출신 공정성 테스트) 0.25
 */
export const WEAK_BONUS = 0.25;
/** 시뮬레이터가 바꿔 볼 약점 보너스 (SIM_WEAK — 평소엔 WEAK_BONUS 그대로) */
export const WEAK_TUNE = { bonus: WEAK_BONUS };
/** 통찰 1당 약점 공격 피해 보너스 / 그 상한 통찰 */
export const INSIGHT_WEAK = 0.06;
export const INSIGHT_WEAK_CAP = 8;

/** 약점 공격 피해 배율: 1 + 25% + 통찰×6% (통찰은 8까지) */
export function weakMult(insight: number): number {
  return 1 + WEAK_TUNE.bonus + INSIGHT_WEAK * Math.max(0, Math.min(INSIGHT_WEAK_CAP, insight));
}

// ───────────── 버팀과 붕괴 (2026-10 붕괴 개편, 붕괴: 스타레일의 강인성 참고) ─────────────
// 버팀이 남은 적은 내 쪽에서 오는 피해(공격·지속 피해·가시)를 덜 받는다. 붕괴시켜야 제대로 들어간다.
// 약점으로 치면 버팀 -1. 약점을 못 치는 덱도 막히지 않게, 약점이 아닌 공격도 GUARD.chip번 맞히면 버팀 -1.
// 붕괴하면 등급마다 다르게 무너진다: 일반은 오래 쉬고, 수호자는 하던 행동 하나만 끊기는 대신 받는 피해가 더 크다.

/**
 * 버팀. 시뮬(시드 네 묶음 × 출신 셋 × 80판): 개편 전 58.3% → 처음 안(chip 3, poise 1) 54.8% → 최종 44.5%.
 * 버팀이 남은 적의 배율보다 붕괴가 얼마나 잦은지가 난이도를 정했다 — 처음 안은 붕괴가 전투당 0.6번에서 1.8번으로 늘어
 * 적이 차례의 40%를 쉬었다(mult 0.4로 낮춰도 54.2%). 버팀을 1.2배로 늘리자 44.5%, 1.5배면 29.8%
 */
export const GUARD = {
  /** 버팀이 남은 적이 내 쪽에서 받는 피해 배율 (버팀이 없는 하수인·기믹 물건은 그대로) */
  mult: 0.5,
  /** 약점이 아닌 공격을 이만큼 맞히면 버팀 -1 (타격마다 센다) */
  chip: 4,
  /** 적의 버팀 배율 (EnemyDef.poise × 이 값, 반올림) */
  poise: 1.2,
};

/**
 * 층별 적 버팀 배율 (GUARD.poise 위에 곱한다) — 2026-10 심연 압력.
 * 판이 깊어질수록 손에 쥔 타격 수·약점 폭이 버팀보다 훨씬 빨리 늘어 4·5층 적은 한 턴에 무너졌다
 */
export const ACT_POISE_MULT = [1, 1, 1, 1.1, 1.15, 1.2];

/** 적의 최대 버팀 (EnemyDef.poise·변신 형태의 버팀에 GUARD.poise와 그 적의 층 배율을 곱한다. 0이면 버팀 없음) */
export function scaledPoise(n: number, act = 1): number {
  return n > 0 ? Math.max(1, Math.round(n * GUARD.poise * (ACT_POISE_MULT[Math.min(5, act)] ?? 1))) : 0;
}

/**
 * 붕괴 내성 (2026-10 심연 압력, 몬스터 헌터의 기절 내성·다키스트 던전의 기절 저항 참고): 붕괴할 때마다 그 전투에서 버팀 최대치가 는다.
 * 느는 양 = 처음 버팀 × act[적의 층] (올림, 적어도 1). 최대 max번. 1·2층은 늘지 않는다 (판을 짜기 전이라 가장 어렵다 —
 * 2층에 0.25를 주니 시작 덱 군인이 2층 균열 수호자에게 졌다: tests/act2-patterns 출신 공정성)
 */
export const TOLERANCE = { act: [0, 0, 0, 0.4, 0.5, 0.6], max: 3 };

/** 이 적이 붕괴할 때 버팀 최대치가 늘어나는 양 (내성이 다 찼거나 1층이면 0) */
export function toleranceGain(def: Pick<EnemyDef, 'poise' | 'act'>, times: number): number {
  const r = TOLERANCE.act[Math.min(5, def.act)] ?? 0;
  if (r <= 0 || times >= TOLERANCE.max) return 0;
  return Math.max(1, Math.ceil(scaledPoise(def.poise, def.act) * r));
}

/**
 * 붕괴 (등급 기본값 — 적마다 EnemyDef.brk로 바꾼다). stun: 행동을 건너뛰는 횟수 · vuln: 붕괴 중 받는 피해 배율.
 * 2026-10-09 "붕괴로 얻는 것을 조금만 줄이자": 받는 피해 1.5·2 → 1.35·1.75 (쉬는 차례는 그대로 — 적마다 다른 긴 기절).
 * 시뮬(240판): 봇 25.8 → 20.0%, 1.5배 47.1 → 45.4%, 2.5배 77 → 79% (가호의 붕괴 배율 2 → 1.5와 함께, content/depth.ts)
 */
export const BREAK: Record<EnemyDef['tier'], { stun: number; vuln: number }> = {
  normal: { stun: 2, vuln: 1.35 },
  elite: { stun: 1, vuln: 1.35 },
  boss: { stun: 1, vuln: 1.75 },
  minion: { stun: 1, vuln: 1.35 },
};

/** 이 적이 붕괴하면: 행동을 건너뛰는 횟수와 받는 피해 배율 */
export function breakProfile(def: Pick<EnemyDef, 'tier' | 'brk'>): { stun: number; vuln: number } {
  const base = BREAK[def.tier] ?? BREAK.normal;
  return { stun: Math.max(1, def.brk?.stun ?? base.stun), vuln: def.brk?.vuln ?? base.vuln };
}

/**
 * 버팀에 깎이기 전 피해 (퍼즐 목표처럼 '피해 N'을 채우는 셈은 버팀과 상관없이 센다 — 버팀이 수치를 두 배로 늘리지 않게).
 * 붕괴 중에 더 받은 몫은 그대로 센다. 적이 받은 피해에서만 쓴다 (방어도에 막힌 몫 포함 = d.amount)
 */
export function unguarded(d: Pick<DamageCtx, 'guard' | 'bare' | 'amount'>): number {
  return d.guard < 1 ? d.bare : d.amount;
}

/** 보이는 의도: 속임수 의도(disguise)는 통찰이 reveal(기본 DISGUISE_REVEAL) 미만이면 가짜 모습으로. 속은 의도는 move가 '_disguise' */
export function shownIntentOf(it: Intent | null | undefined, insight: number): Intent | null {
  if (!it) return null;
  if (!it.disguise || insight >= (it.disguise.reveal ?? DISGUISE_REVEAL)) return it;
  const d = it.disguise;
  return { move: '_disguise', kind: d.kind, label: d.label, dmg: d.dmg, hits: d.hits, desc: d.desc };
}

// ───────────── 상태 ─────────────

export interface CombatState {
  enc: string;
  kind: 'normal' | 'elite' | 'boss';
  turn: number;
  phase: 'player' | 'enemy' | 'victory' | 'defeat';
  enemies: EnemyUnit[];
  ap: number;
  /** 스킬 uid → 남은 쿨다운 */
  cd: Record<string, number>;
  /** 이번 턴 사용한 스킬 수 (연계) */
  used: number;
  usedTotal: number;
  ammo: number;
  maxAmmo: number;
  anomaly: string | null;
  uidN: number;
  vars: Record<string, number>;
  /** 이번 전투에서 얻은 추가 골드 */
  bonusGold: number;
  /** 지금 걸린 퍼즐 목표 (즉사기를 막는 방법 등) */
  obj?: Objective | null;
  /** 즉사기로 쓰러졌다면 그 기술 이름 */
  doom?: string;
  /** 플레이어가 골라야 하는 선택지 (고르기 전에는 기술·턴 종료가 막힌다) */
  choice?: CombatChoice | null;
}

// ───────────── 이벤트 (연출용) ─────────────

export interface Snap {
  p: { hp: number; maxHp: number; block: number; st: Record<string, number>; sanity: number; insight: number; ap: number; ammo: number };
  e: {
    uid: string;
    hp: number;
    maxHp: number;
    block: number;
    st: Record<string, number>;
    poise: number;
    maxPoise: number;
    broken: number;
    /** 약점이 아닌 공격을 맞은 횟수 (GUARD.chip번이면 버팀 -1) */
    chip: number;
    /** 붕괴해 앞으로 건너뛸 행동 수 (붕괴 중이 아니면 0) */
    stun: number;
    intent: Intent | null;
    dead: boolean;
    row: 0 | 1;
    known: DmgType[];
    /** 급소 (engine/weakpoint.ts): 드러났으면 그 속성, 숨어 있으면 '?', 없으면 null */
    wp: DmgType | '?' | null;
  }[];
  cd: Record<string, number>;
  /** 화면 상태 (vars의 'ui:' 값) — 연출이 재생되는 순서에 맞춰 화면이 바뀌게 */
  ui?: Record<string, number>;
  /** 퍼즐 목표 */
  obj?: Objective | null;
}

export type CombatEvent = (
  | { t: 'turn'; side: 'player' | 'enemy'; turn: number }
  | { t: 'skill'; skill: string; name: string; target?: string; school: string; dtype?: DmgType; echo?: boolean }
  | { t: 'move'; uid: string; name: string; kind: IntentKind; move?: string; ult?: boolean; cine?: MoveDef['cine'] }
  | {
      t: 'dmg';
      src?: string;
      tgt: string;
      amount: number;
      blocked: number;
      hpLoss: number;
      dtype: DmgType | 'true';
      weak: boolean;
      /** 급소를 찔렀다 (engine/weakpoint.ts) */
      wp?: boolean;
      crit: boolean;
      attack: boolean;
      tags: string[];
    }
  | { t: 'block'; uid: string; amount: number }
  | { t: 'heal'; uid: string; amount: number }
  | { t: 'status'; uid: string; id: string; n: number }
  /** 약점 발견. wp: 이번 판의 급소가 드러났다 (engine/weakpoint.ts) */
  | { t: 'reveal'; uid: string; dtype: DmgType; wp?: boolean }
  /** 붕괴. turns: 행동을 건너뛰는 횟수 · vuln: 붕괴 중 받는 피해 배율 */
  | { t: 'break'; uid: string; turns: number; vuln: number }
  | { t: 'recover'; uid: string }
  | { t: 'death'; uid: string }
  | { t: 'flee'; uid: string }
  | { t: 'spawn'; uid: string }
  | { t: 'row'; uid: string; row: 0 | 1 }
  | { t: 'sanity'; delta: number }
  | { t: 'insight'; delta: number }
  | { t: 'breakdown'; madness: string; fatal: boolean }
  | { t: 'text'; uid?: string; text: string; tone?: 'good' | 'bad' | 'info' | 'eldritch' }
  | { t: 'fx'; name: string; src?: string; tgt?: string }
  /** 화면 연출 (게임 규칙과 무관). content/lib.ts의 cine()으로 낸다 */
  | { t: 'cine'; name: CineName; uid?: string; text?: string; n?: number }
  /** 틈이 열렸다 (content/gap.ts). school: 틈의 색 · big: 붕괴로 열린 큰 틈(보너스 2배) · turns: 남은 내 턴 */
  | { t: 'gap-open'; uid: string; school: School; big: boolean; turns: number }
  /** 틈을 거뒀다 (content/gap.ts). school: 거둔 계열 · from: 틈의 색 */
  | { t: 'gap-harvest'; uid: string; school: School; from: School; big: boolean }
  | { t: 'victory' }
  | { t: 'defeat'; reason: 'hp' | 'madness' | 'doom' }
) & { snap?: Snap };

type DamageOpts = {
  src: Unit | null;
  tgt: Unit;
  base: number;
  type: DmgType | 'true';
  attack?: boolean;
  melee?: boolean;
  skill?: SkillUse;
  move?: string;
  ignoreBlock?: boolean;
  poise?: number;
  tags?: string[];
  /** 미리보기용: 같은 스킬이 이 대상을 이미 때린 타격으로 본다 (고정 가산 없음) */
  repeat?: boolean;
};

/** 모든 적이 쓰는 내장 행동. 콘텐츠가 모든 수호자에게 끼어드는 행동을 더한다 (content/depth.ts — 심연의 각성) */
export const BUILTIN_MOVES: Record<string, MoveDef> = {
  _advance: {
    name: '전진',
    intent: 'advance',
    run(c, e) {
      c.moveRow(e, 0);
    },
  },
  _wait: { name: '관망', intent: 'unknown', run() {} },
  _broken: { name: '붕괴', intent: 'stunned', run() {} },
};

export const MAX_ROW = 3;

/**
 * 층별 적 성장 배율 (밸런스 조절용) — 인덱스 = 층.
 * 2026-10-09 급소(engine/weakpoint.ts)를 넣으며 [1, 1, 1.25, 1.65, 2.2, 2.0]에서 올렸다 — 밝힌 급소는 깊이 가는 쪽에 더 걸려 4·5층에 더 (GDD 10.6)
 */
export const ACT_HP_MULT = [1, 1, 1.27, 1.7, 2.37, 2.16];
/** 수호자(층 수호자·계층군주) 체력 배율 — 수호자 난이도 조절용 */
export const BOSS_HP_MULT = { value: 1.1 };
/**
 * 2026-10 심연 압력: 4·5층 +10% (1.5·1.4 → 1.65·1.55) — 강한 덱도 4·5층에서 몇 턴은 맞으며 버티게 (가호와 함께).
 * 몹 패턴 보강 뒤 +6% (1.75·1.65): 봇이 잠들지 않는 비늘을 쥐면 야영지를 끝없이 오가다 미쳐 죽던 버그를 고치자 판의 7%가 살아났다 — 강한 봇(1.5배)을 50% 안팎으로
 */
export const ACT_DMG_MULT = [1, 1, 1.1, 1.3, 1.75, 1.65];
/**
 * 정예·수호자 전투의 적 공격 배율 (층별, ACT_DMG_MULT 위에 곱한다) — 2026-10 밸런스 개편.
 * 적 체력은 플레이어의 딜을 따라 오르는데(ACT_HP_MULT) 공격은 플레이어의 최대 체력을 따라가지 못해
 * 3층부터 정예·수호자의 한 턴 피해가 최대 체력의 8~9% → 4~5%로 떨어졌다. 정예·수호자만 체력 곡선에 맞춰 다시 때린다 (일반전은 그대로).
 * 정예 전투 = 정예·균열 수호자·추적자, 수호자 전투 = 층 수호자·계층군주. 수호자는 포탈 앞에서 숨을 고르고(체력 전부) 싸운다.
 * 5층(최종 수호자, 세 단계)은 1.3이면 판 끝 사망이 몰려 1.2 (시뮬: 5층 수호자전 체력 손실 44~50% → 40~48%)
 */
export const ELITE_DMG_MULT = [1, 1, 1, 1.25, 1.35, 1.35];
export const BOSS_DMG_MULT = [1, 1, 1.15, 1.3, 1.35, 1.2];
/**
 * 층별 적 정신 공격 배율.
 * 2026-10 2차: 정신 붕괴를 한 번도 겪지 않는 판이 많았다 → 2~5층을 올렸다 ([1,1,1,0.75,0.7,0.8] → 아래)
 */
export const ACT_SAN_MULT = [1, 1, 1.05, 1.05, 0.9, 0.85];

/** 붕괴(정신력 0) 뒤 정신력이 이 값으로 돌아온다 — 최대 정신력이 이보다 낮으면 최대 정신력까지만 */
export const BREAKDOWN_RESET = 60;
/** 나쁜 광기가 이만큼 쌓이면 완전히 미쳐 끝난다 (2026-10 2차: 붕괴가 잦아진 만큼 4 → 5) */
export const MAX_MADNESS = 5;

export function isEnemy(u: Unit | null | undefined): u is EnemyUnit {
  return !!u && u.uid !== 'p';
}

/** 이 적의 특성 id: 정의의 특성 + 이 개체에 붙은 변이 */
export function traitIds(e: EnemyUnit): string[] {
  const base = ENEMIES.get(e.def)?.traits ?? [];
  return e.affix?.length ? [...base, ...e.affix] : base;
}

// ───────────── 전투 ─────────────

export class Combat {
  readonly run: RunState;
  readonly s: CombatState;
  readonly rng: Rng;
  events: CombatEvent[] = [];
  /** 시뮬레이터에서는 끈다 */
  snapshots = true;
  /**
   * 미리보기 계산 중 (화면을 그릴 때마다 불린다). 훅은 이때 수치만 바꾸고 상태(방어도·카운터·연출)는 건드리면 안 된다
   * — 예: 철의 성의가 의도 말풍선을 그릴 때마다 방어도를 깎던 문제
   */
  previewing = false;
  private hookDepth = 0;

  constructor(run: RunState) {
    if (!run.combat) throw new Error('진행 중인 전투가 없다');
    this.run = run;
    this.s = run.combat;
    this.rng = new Rng(run.rng, 'combat');
  }

  // ── 생성 ──

  /** firstStrike: 내 첫 턴 전에 적의 차례가 한 번 온다 — 그때 띄울 글 (심연 「어둠 속의 것들」: 어둠 속 기습) */
  static begin(run: RunState, enc: EncounterDef, opts: { firstStrike?: string } = {}): Combat {
    run.combat = {
      enc: enc.id,
      kind: enc.kind,
      turn: 0,
      phase: 'player',
      enemies: [],
      ap: 0,
      cd: {},
      used: 0,
      usedTotal: 0,
      ammo: 6,
      maxAmmo: 6,
      anomaly: enc.anomaly ?? null,
      uidN: 0,
      vars: {},
      bonusGold: 0,
    };
    const c = new Combat(run);
    const p = run.player;
    p.block = 0;
    p.st = {};
    for (const slot of enc.enemies) c.spawn(slot.id, slot.row, true);
    // 모두 나온 뒤에 알린다 (변이 '결속'처럼 함께 나온 적을 보는 것이 있다). onSpawn이 불러낸 하수인은 이미 알렸다 — 받는 쪽이 한 번만 처리한다
    for (const e of [...c.s.enemies]) c.fire('all', 'onEnemySpawn', e);
    c.fire(p, 'onCombatStart');
    for (const e of c.alive) c.fire(e, 'onCombatStart');

    // 처음 보는 존재에 대한 공포
    let dread = 0;
    for (const e of c.alive) {
      const def = ENEMIES.get(e.def)!;
      if (!run.seen.includes(def.id)) {
        run.seen.push(def.id);
        dread += def.dread ?? 0;
      }
    }
    if (dread > 0) {
      c.emit({ t: 'text', text: '형언할 수 없는 존재를 목격했다', tone: 'eldritch' });
      c.loseSanity(dread);
    }
    // 시작할 때 불려 나온 하수인(onSpawn 등)은 이미 의도를 정했다 — 두 번 정하면 순서가 한 칸 밀린다
    for (const e of c.alive) if (!e.intent) c.planIntent(e);
    if (opts.firstStrike && !c.over) {
      c.firstStrike(opts.firstStrike);
      // 먼저 덮쳐 온 적에게 쓰러졌으면 (사경도 없이 끝났으면) 내 턴은 오지 않는다
      if (c.over) return c;
    }
    c.startPlayerTurn();
    return c;
  }

  // ── 조회 ──

  get p() {
    return this.run.player;
  }
  get alive(): EnemyUnit[] {
    return this.s.enemies.filter((e) => !e.dead);
  }
  row(r: 0 | 1): EnemyUnit[] {
    return this.s.enemies.filter((e) => !e.dead && e.row === r);
  }
  get over(): boolean {
    return this.s.phase === 'victory' || this.s.phase === 'defeat';
  }
  enemy(uid: string | undefined | null): EnemyUnit | null {
    if (!uid) return null;
    return this.s.enemies.find((e) => e.uid === uid && !e.dead) ?? null;
  }
  unit(uid: string): Unit | null {
    return uid === 'p' ? this.p : this.enemy(uid);
  }
  defOf(e: EnemyUnit): EnemyDef {
    return need(ENEMIES, e.def, '적');
  }

  emit(ev: CombatEvent) {
    if (this.snapshots) ev.snap = this.snap();
    this.events.push(ev);
  }

  /** 소비한 이벤트를 꺼낸다 */
  drain(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snap(): Snap {
    const p = this.p;
    return {
      p: { hp: p.hp, maxHp: p.maxHp, block: p.block, st: { ...p.st }, sanity: p.sanity, insight: p.insight, ap: this.s.ap, ammo: this.s.ammo },
      e: this.s.enemies.map((e) => ({
        uid: e.uid,
        hp: e.hp,
        maxHp: e.maxHp,
        block: e.block,
        st: { ...e.st },
        poise: e.poise,
        maxPoise: e.maxPoise,
        broken: e.broken,
        chip: e.chip ?? 0,
        stun: e.broken === 2 ? (e.mem.bk ?? 1) : 0,
        intent: e.intent ? { ...e.intent } : null,
        dead: e.dead,
        row: e.row,
        known: [...e.known],
        wp: weakPointKnown(this.run, e.def) ? weakPointOf(this.run, e.def) : weakPointOf(this.run, e.def) ? '?' : null,
      })),
      cd: { ...this.s.cd },
      ui: this.uiVars(),
      obj: this.s.obj ? JSON.parse(JSON.stringify(this.s.obj)) : null,
    };
  }

  /** 화면 상태 값만 (vars의 'ui:' 키) */
  uiVars(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.s.vars)) if (k.startsWith('ui:')) out[k] = v;
    return out;
  }

  // ── 훅 ──

  /** owner가 가진 훅들. 'all'이면 전부 */
  *sources(owner: Unit | 'all'): Generator<[Hooks, HookSelf]> {
    const p = this.p;
    const run = this.run;
    if (owner === 'all' || owner === p) {
      for (const id of Object.keys(p.st)) {
        const d = STATUSES.get(id);
        if (d?.hooks && p.st[id]) yield [d.hooks, { kind: 'status', id, unit: p, n: p.st[id] }];
      }
      for (const r of run.relics) {
        const d = RELICS.get(r.id);
        if (d?.hooks) yield [d.hooks, { kind: 'relic', id: r.id, unit: p, n: r.n, ref: r }];
      }
      for (const slot of ['weapon', 'armor', 'trinket1', 'trinket2'] as const) {
        const it = run.equip[slot];
        if (!it) continue;
        const d = EQUIPS.get(it.id);
        if (d?.hooks) yield [d.hooks, { kind: 'equip', id: it.id, unit: p, n: it.lvl }];
      }
      for (const id of run.perks) {
        const d = PERKS.get(id);
        if (d?.hooks) yield [d.hooks, { kind: 'perk', id, unit: p, n: 1 }];
      }
      for (const id of run.madness) {
        const d = MADNESS.get(id);
        if (d?.hooks) yield [d.hooks, { kind: 'madness', id, unit: p, n: 1 }];
      }
      for (const es of run.essences) {
        const d = ESSENCES.get(es.id);
        if (d?.passive.hooks) yield [d.passive.hooks, { kind: 'essence', id: es.id, unit: p, n: es.guardian ? 2 : 1 }];
      }
      // 성장 개편: 장비 접사·계약의 저주와 축복 (engine/growth.ts)
      yield* affixHooks(run);
      yield* pactHooks(run);
    }
    for (const e of this.s.enemies) {
      if (e.dead) continue;
      if (owner !== 'all' && owner !== e) continue;
      for (const id of Object.keys(e.st)) {
        const d = STATUSES.get(id);
        if (d?.hooks && e.st[id]) yield [d.hooks, { kind: 'status', id, unit: e, n: e.st[id] }];
      }
      for (const id of traitIds(e)) {
        const d = TRAITS.get(id);
        if (d) yield [d.hooks, { kind: 'trait', id, unit: e, n: 1 }];
      }
    }
    if (this.s.anomaly) {
      const d = ANOMALIES.get(this.s.anomaly);
      if (d) yield [d.hooks, { kind: 'anomaly', id: d.id, unit: owner === 'all' ? p : owner, n: 1 }];
    }
    const law = FLOORS.get(run.act)?.hooks;
    if (law && run.floor) yield [law, { kind: 'anomaly', id: `law${run.act}`, unit: owner === 'all' ? p : owner, n: run.floor.tide }];
    // 심연 단계의 특별한 규칙 (engine/abyss.ts · content/abyss.ts)
    yield* abyssSources(run, owner, p);
    // 공용 규칙 (틈 등, registry RULES): 모든 전투에 늘 걸린다. 다른 훅들보다 뒤에
    for (const r of RULES.values()) yield [r.hooks, { kind: 'anomaly', id: r.id, unit: owner === 'all' ? p : owner, n: 1 }];
  }

  fire<K extends keyof Hooks>(owner: Unit | 'all', key: K, ...args: unknown[]) {
    if (this.hookDepth > 12) return;
    this.hookDepth++;
    try {
      for (const [h, self] of this.sources(owner)) {
        const fn = h[key] as ((...a: unknown[]) => unknown) | undefined;
        if (fn) fn.call(h, this, self, ...args);
      }
    } finally {
      this.hookDepth--;
    }
  }

  private runeHooks(u: SkillUse | undefined): [Hooks, HookSelf][] {
    if (!u) return [];
    const out: [Hooks, HookSelf][] = [];
    for (const id of u.owned.runes) {
      const r = RUNES.get(id);
      if (r?.hooks) out.push([r.hooks, { kind: 'rune', id, unit: this.p, n: 1 }]);
    }
    return out;
  }

  // ── 피해 ──

  private makeDamage(o: DamageOpts): DamageCtx {
    return {
      src: o.src,
      tgt: o.tgt,
      type: o.type,
      base: o.base,
      add: 0,
      addEach: 0,
      repeat: o.repeat,
      mult: 1,
      attack: o.attack ?? false,
      melee: o.melee ?? false,
      skill: o.skill,
      move: o.move,
      ignoreBlock: o.ignoreBlock,
      poiseBonus: o.poise ?? 0,
      guard: 1,
      tags: o.tags ?? [],
      amount: 0,
      bare: 0,
      blocked: 0,
      hpLoss: 0,
      killed: false,
      broke: false,
      weakHit: false,
      wpHit: false,
      crit: false,
    };
  }

  /**
   * 고정 가산 1회 규칙 (2026-10 밸런스 개편): 내 공격의 고정 가산(힘·'+N' 효과 — 정수 패시브·유물·장신구·각인이 더하는 피해)은
   * 스킬 한 번에 대상마다 첫 타격에만 붙는다 (여러 번 때려도 한 번, 광역은 대상마다 한 번).
   * 턴당 타격 수가 늘수록(행동력·0행동력 스킬·다단 히트) 타격마다 붙는 가산이 곱으로 불어나던 것을 끊는다.
   * 맞는 쪽에 걸린 효과(인장·부식 등 modDamageIn)와 '타격마다'로 설계된 효과(DamageCtx.addEach)는 그대로 타격마다
   */
  private flatSpent(d: DamageCtx): boolean {
    if (d.src !== this.p || !d.attack || !d.skill) return false;
    return !!d.repeat || !!d.skill.struck?.includes(d.tgt.uid);
  }

  private computeDamage(d: DamageCtx, tgtKnown = true) {
    if (d.type !== 'true') {
      if (d.src) {
        if (d.src === this.p && d.attack) d.add += this.p.str;
        // 심연의 조수: 적 공격 강화
        if (isEnemy(d.src) && d.attack) {
          const tide = this.run.floor?.tide ?? 0;
          if (tide > 0) d.mult *= 1 + 0.05 * tide;
          const act = Math.min(5, this.defOf(d.src).act);
          d.mult *= ACT_DMG_MULT[act] ?? 1;
          if (this.s.kind === 'elite') d.mult *= ELITE_DMG_MULT[act] ?? 1;
          else if (this.s.kind === 'boss') d.mult *= BOSS_DMG_MULT[act] ?? 1;
          // 심연 단계 (「굶주린 것들」 모든 전투, 「사나운 수호자」 수호자 전투)
          d.mult *= abyssDmgMult(this.run, this.s.kind);
        }
        this.fire(d.src, 'modDamageOut', d);
        for (const [h, self] of this.runeHooks(d.skill)) h.modDamageOut?.(this, self, d);
        // 고정 가산은 스킬 한 번에 대상마다 첫 타격에만 (flatSpent 설명)
        if (this.flatSpent(d)) d.add = 0;
        d.add += d.addEach;
      }
      if (tgtKnown) {
        this.fire(d.tgt, 'modDamageIn', d);
        if (isEnemy(d.tgt)) {
          const r = d.tgt.resist[d.type];
          if (r !== undefined) d.mult *= r;
          // 약점: 약점을 찌르는 내 공격 피해 +25%, 통찰 1당 +6% 더 — 미리보기에는 알아낸 약점만 (모르는 약점을 숫자로 흘리지 않게)
          if (d.src === this.p && d.attack && d.tgt.weak.includes(d.type) && (!this.previewing || d.tgt.known.includes(d.type))) {
            d.mult *= weakMult(this.p.insight);
          }
          // 급소 (engine/weakpoint.ts): 판마다 종족마다 숨은 속성 하나 — 드러난 급소만 노릴 수 있다 (미리보기도 같다)
          if (d.src === this.p && d.attack && wpOpen(this.run, d.tgt.def, d.type)) d.mult *= WEAKPOINT.mult;
        }
      }
    }
    // 버팀: 버팀이 남은 적은 덜 받고, 붕괴하면 더 받는다. 속성 없는 피해(지속 피해·가시)도 — 상태이상만 쌓아 버팀을 건너뛰지 못하게
    const pre = (d.base + d.add) * d.mult;
    if (tgtKnown && isEnemy(d.tgt)) {
      d.guard = this.guardOf(d.tgt, d);
      d.mult *= d.guard;
    }
    const raw = pre * d.guard;
    d.amount = Math.max(0, Math.floor(raw));
    // 버팀에 깎여 0이 되는 작은 피해(출혈 1 등)도 1은 들어간다
    if (d.guard < 1 && d.amount === 0 && raw > 0) d.amount = 1;
    d.bare = Math.max(0, Math.floor(pre));
    // 마지막 손질 (상한 등) — 속성 없는 피해에도 (modDamageIn은 속성 있는 피해에만 불린다)
    if (tgtKnown) this.fire(d.tgt, 'modDamageFinal', d);
    if (d.cap !== undefined) {
      d.amount = Math.min(d.amount, d.cap);
      d.bare = Math.min(d.bare, d.cap);
    }
  }

  /**
   * 이 피해에 걸리는 버팀 배율: 버팀이 남았으면 GUARD.mult, 붕괴 중이면 붕괴 배율(breakProfile), 아니면 1.
   * 내 쪽에서 온 피해(내 공격·가시·반격·지속 피해)에만 — 적끼리 주고받는 피해(광란·기믹)와 대가로 잃는 체력은 그대로
   */
  guardOf(e: EnemyUnit, d?: Pick<DamageCtx, 'src' | 'tags'>): number {
    if (d && !(d.src === this.p || (d.src === null && d.tags.includes('dot')))) return 1;
    if (e.broken > 0) return breakProfile(this.defOf(e)).vuln;
    if (e.maxPoise > 0 && e.poise > 0) return GUARD.mult;
    return 1;
  }

  /**
   * 미리보기: 상태를 바꾸지 않고 최종 피해 계산.
   * repeat: 같은 스킬의 두 번째 이후 타격 (고정 가산 1회 규칙 — 여러 번 때리는 스킬의 '이후 타격' 숫자)
   */
  preview(src: Unit | null, tgt: Unit | null, base: number, type: DmgType | 'true', opts: { attack?: boolean; skill?: SkillUse; repeat?: boolean } = {}): number {
    const d = this.makeDamage({ src, tgt: tgt ?? this.p, base, type, attack: opts.attack ?? true, skill: opts.skill, repeat: opts.repeat });
    const saved = this.hookDepth;
    this.previewing = true;
    try {
      this.computeDamage(d, !!tgt);
    } finally {
      this.previewing = false;
      this.hookDepth = saved;
    }
    return d.amount;
  }

  damage(o: DamageOpts): DamageCtx {
    const d = this.makeDamage(o);
    const t = o.tgt;
    // 사경(체력 0)인 나는 여전히 맞는다 — 받는 피해만큼 정신력이 깎인다
    const dyingTarget = t === this.p && this.dying;
    if ((t.hp <= 0 && !dyingTarget) || (isEnemy(t) && t.dead) || this.over) return d;
    this.computeDamage(d);
    // 고정 가산 1회 규칙: 이 스킬이 이 대상을 한 번 때렸다
    if (d.src === this.p && d.attack && d.skill) (d.skill.struck ??= []).push(t.uid);
    let amt = d.amount;

    // 약점 / 버팀
    if (isEnemy(t) && d.type !== 'true') {
      const counts = d.attack || d.tags.includes('poise');
      if (t.weak.includes(d.type) && counts) {
        d.weakHit = true;
        if (!t.known.includes(d.type)) {
          t.known.push(d.type);
          this.emit({ t: 'reveal', uid: t.uid, dtype: d.type });
        }
      }
      // 급소: 드러난 급소를 찌르면 버팀이 더 깎인다 (숨어 있는 동안은 맞혀도 모른다 — 들여다봐야 드러난다)
      if (counts && d.src === this.p && wpOpen(this.run, t.def, d.type)) d.wpHit = true;
      if (counts && t.broken === 0 && t.maxPoise > 0) {
        let dec = (d.weakHit ? 1 : 0) + (d.wpHit ? WEAKPOINT.poise : 0) + d.poiseBonus;
        // 약점이 아닌 내 공격도 GUARD.chip번 맞히면 버팀 -1 (약점을 못 치는 덱도 붕괴시킬 수 있게). 약점 타격처럼 타격마다 센다
        // (기술 사용마다 세 보니 여러 번 때리는 사냥꾼만 크게 약해졌다: 승률 군인 57 · 사냥꾼 41 · 학자 41%)
        // 급소 타격은 약점 타격처럼 이미 버팀을 깎으니 세지 않는다
        if (!d.weakHit && !d.wpHit && d.attack && d.src === this.p) {
          const k = (t.chip ?? 0) + 1;
          if (k >= GUARD.chip) {
            t.chip = 0;
            dec += 1;
          } else t.chip = k;
        }
        // 변이·규칙이 깎일 양을 바꾼다 (불굴·결속·심연을 모으는 수호자 등)
        if (dec > 0) for (const [h, self] of this.sources(t)) if (h.modPoiseLoss) dec = Math.max(0, h.modPoiseLoss(this, self, t, dec, d));
        if (dec > 0) {
          t.poise = Math.max(0, t.poise - dec);
          if (t.poise === 0) d.broke = true;
        }
      }
    }

    // 방어도 → 보호막
    if (!d.ignoreBlock && amt > 0 && t.block > 0) {
      const b = Math.min(t.block, amt);
      t.block -= b;
      amt -= b;
      d.blocked += b;
    }
    if (!d.ignoreBlock && amt > 0 && (t.st.barrier ?? 0) > 0) {
      const b = Math.min(t.st.barrier, amt);
      t.st.barrier -= b;
      if (t.st.barrier <= 0) delete t.st.barrier;
      amt -= b;
      d.blocked += b;
    }
    const dying = t === this.p && this.dying;
    // 사경(체력 0) 중에는 체력이 더 줄지 않는다 — 대신 정신력이 깎인다 (아래). '체력을 잃으면' 효과가 헛돌지 않게 체력 손실은 0
    d.hpLoss = dying ? 0 : amt;
    if (!dying) t.hp -= amt;
    if (t === this.p && amt > 0) this.run.stats.dmgTaken += amt;
    if (d.src === this.p && amt > 0) this.run.stats.dmgDealt += amt;

    this.emit({
      t: 'dmg',
      src: d.src?.uid,
      tgt: t.uid,
      amount: d.amount,
      blocked: d.blocked,
      hpLoss: d.hpLoss,
      dtype: d.type,
      weak: d.weakHit,
      wp: d.wpHit || undefined,
      crit: d.crit,
      attack: d.attack,
      tags: d.tags,
    });

    if (d.broke && isEnemy(t) && t.hp > 0) this.breakEnemy(t);

    if (d.src) this.fire(d.src, 'onDamageDealt', d);
    for (const [h, self] of this.runeHooks(d.skill)) h.onDamageDealt?.(this, self, d);
    this.fire(t, 'onDamageTaken', d);

    if (dying) {
      // 사경 중 받은 피해는 그 절반(올림)만큼 정신력을 깎는다
      if (amt > 0) this.drainMind(Math.ceil(amt / 2));
    } else if (t.hp <= 0) this.handleDeath(t, d);
    return d;
  }

  /** 사경: 체력 0에서 정신력으로 버티는 상태 */
  get dying(): boolean {
    return (this.p.st.dying ?? 0) > 0;
  }

  /** 체력 0이지만 사경으로 버티며 싸우는 나 (상태이상·턴 효과는 계속 돌아간다) */
  private isDyingPlayer(u: Unit): boolean {
    return u === this.p && this.dying;
  }

  private enterDying() {
    this.p.hp = 0;
    this.p.st.dying = 1;
    this.emit({ t: 'status', uid: 'p', id: 'dying', n: 1 });
    this.emit({ t: 'text', uid: 'p', text: '사경: 정신력으로 버틴다', tone: 'bad' });
    this.run.stats.dyingCount++;
  }

  /** 사경 중 정신력 소모. 0이 되면 사망 */
  private drainMind(n: number) {
    if (this.over) return;
    this.p.sanity = Math.max(0, this.p.sanity - n);
    this.emit({ t: 'sanity', delta: -n });
    if (this.p.sanity <= 0) this.defeat('hp');
  }

  /** 방어 무시 체력 손실 (자해·대가) */
  loseHp(u: Unit, n: number, tag = 'cost') {
    return this.damage({ src: null, tgt: u, base: n, type: 'true', ignoreBlock: true, tags: [tag] });
  }

  private handleDeath(t: Unit, d: DamageCtx | null, byPlayer = true) {
    if (t === this.p) {
      if (this.p.hp > 0 || this.dying) return;
      if (d) {
        for (const [h, self] of this.sources(this.p)) {
          if (h.onLethal?.(this, self, d)) {
            if (this.p.hp > 0) return;
          }
        }
      }
      if (this.p.sanity <= 0) {
        this.p.hp = 0;
        this.defeat('hp');
      } else this.enterDying();
      return;
    }
    if (!isEnemy(t) || t.dead) return;
    t.hp = 0;
    t.dead = true;
    t.block = 0;
    if (d) d.killed = true;
    this.emit({ t: 'death', uid: t.uid });
    // 심연 「두 번째 모습」: 특성의 죽음 처리(하수인 정리·기믹 해제)보다 먼저 — 다시 일어서면 아직 쓰러진 것이 아니다
    if (abyssRise(this, t)) {
      if (d) d.killed = false;
      return;
    }
    // 자기 사망 특성 (부활 등) — 변이 포함
    for (const id of traitIds(t)) {
      TRAITS.get(id)?.hooks.onDeath?.(this, { kind: 'trait', id, unit: t, n: 1 }, d);
    }
    // 전장 규칙의 부활(망자의 귀환)도 처치 보상보다 먼저 — 다시 일어서면 아직 처치가 아니다 (처치 효과가 두 번 터지지 않게)
    const an = this.s.anomaly ? ANOMALIES.get(this.s.anomaly) : undefined;
    if (t.dead && an?.hooks.onDeath) an.hooks.onDeath(this, { kind: 'anomaly', id: an.id, unit: t, n: 1 }, d);
    if (!t.dead) {
      if (d) d.killed = false;
      return;
    }
    if (!t.minion) this.run.stats.kills++;
    if (d ? d.src === this.p || d.src === null : byPlayer) {
      this.fire(this.p, 'onKill', t, d);
      // 쓰러뜨린 스킬에 새긴 각인의 처치 효과 (사냥 각인) — 다시 일어선 적은 처치가 아니므로 여기서만 준다
      for (const [h, self] of this.runeHooks(d?.skill)) h.onKill?.(this, self, t, d);
    }
    this.fire('all', 'onAnyDeath', t);
  }

  /** 즉사. byPlayer=false면 내 처치로 치지 않는다 (처치 보상·유물·정수 효과 없음) */
  kill(e: EnemyUnit, byPlayer = true) {
    if (e.dead) return;
    e.hp = 0;
    this.handleDeath(e, null, byPlayer);
  }

  flee(e: EnemyUnit) {
    if (e.dead) return;
    e.dead = true;
    e.fled = true;
    this.emit({ t: 'flee', uid: e.uid });
  }

  /** 붕괴: 하던 행동이 끊기고 breakProfile의 stun번 행동을 건너뛴다. 그동안과 그다음 내 턴까지 받는 피해가 vuln배 */
  breakEnemy(e: EnemyUnit) {
    const def = this.defOf(e);
    const b = breakProfile(def);
    e.broken = 2;
    e.poise = 0;
    e.chip = 0;
    e.mem.bk = b.stun;
    e.intent = { move: '_broken', kind: 'stunned', label: '붕괴' };
    delete e.mem.charge;
    this.emit({ t: 'break', uid: e.uid, turns: b.stun, vuln: b.vuln });
    // 붕괴 내성: 다음 붕괴는 더 어렵다 (버팀 최대치가 늘어 돌아온다). 상태 칸의 '붕괴 내성'은 늘어난 양을 보여 준다
    const gain = e.maxPoise > 0 ? toleranceGain(def, e.mem.tol ?? 0) : 0;
    if (gain > 0) {
      e.mem.tol = (e.mem.tol ?? 0) + 1;
      e.maxPoise += gain;
      e.st.tolerance = (e.st.tolerance ?? 0) + gain;
      this.emit({ t: 'status', uid: e.uid, id: 'tolerance', n: gain });
    }
    this.fire(this.p, 'onBreak', e);
    this.run.stats.breaks++;
  }

  /** 버팀이 돌아온다 (붕괴가 끝나거나 콘텐츠가 되살릴 때). emit: 회복 연출을 낼지 */
  restorePoise(e: EnemyUnit, emit = true) {
    const was = e.broken;
    e.broken = 0;
    e.poise = e.maxPoise;
    e.chip = 0;
    delete e.mem.bk;
    if (emit && was) this.emit({ t: 'recover', uid: e.uid });
  }

  /** 방어도 미리보기 (상태를 바꾸지 않음) */
  previewBlock(amount: number, fromSkill?: SkillUse): number {
    const b: BlockCtx = { unit: this.p, amount, fromSkill };
    if (fromSkill) b.amount += this.p.dex;
    this.previewing = true;
    try {
      this.fire(this.p, 'modBlock', b);
    } finally {
      this.previewing = false;
    }
    return Math.max(0, Math.floor(b.amount));
  }

  // ── 방어 / 회복 / 상태 ──

  gainBlock(u: Unit, amount: number, fromSkill?: SkillUse) {
    if (this.over) return 0;
    const b: BlockCtx = { unit: u, amount, fromSkill };
    if (u === this.p && fromSkill) b.amount += this.p.dex;
    this.fire(u, 'modBlock', b);
    const n = Math.max(0, Math.floor(b.amount));
    if (n <= 0) return 0;
    u.block += n;
    this.emit({ t: 'block', uid: u.uid, amount: n });
    return n;
  }

  heal(u: Unit, amount: number) {
    const revive = u === this.p && this.dying;
    if (u.hp <= 0 && !revive) return 0;
    let n = amount;
    if (u === this.p) for (const [h, self] of this.sources(this.p)) if (h.modHeal) n = h.modHeal(this, self, n);
    n = Math.floor(n);
    // 회복 반전 (층의 법칙/균열 규칙)
    if (n < 0) {
      this.damage({ src: null, tgt: u, base: -n, type: 'true', ignoreBlock: true, tags: ['inverted'] });
      return 0;
    }
    n = Math.max(0, Math.min(n, u.maxHp - u.hp));
    if (n <= 0) return 0;
    u.hp += n;
    this.emit({ t: 'heal', uid: u.uid, amount: n });
    if (revive) {
      delete this.p.st.dying;
      this.emit({ t: 'status', uid: 'p', id: 'dying', n: -1 });
      this.emit({ t: 'text', uid: 'p', text: '사경에서 벗어났다', tone: 'good' });
    }
    return n;
  }

  /** 상태 부여. 음수면 감소. 실제 적용된 변화량 반환 */
  apply(target: Unit, id: string, n: number, src: Unit | null = null): number {
    // 사경(체력 0)인 나는 아직 싸우는 중이다: 버프·해제·턴 효과가 그대로 걸린다
    if (this.over || (target.hp <= 0 && !this.isDyingPlayer(target)) || n === 0) return 0;
    const def = need(STATUSES, id, '상태');
    let amount = n;
    if (n > 0) {
      // 수호자는 기절이 겹치지 않고, 붕괴 중이거나 기절·붕괴로 행동을 건너뛴 뒤 한 번 행동하기 전에는 기절하지 않는다 (기절 기술 여럿으로 영원히 묶는 것 방지)
      // (적끼리의 연출 — 대종이 깨져 종지기가 비틀거리는 것 등 — 은 그대로)
      if (id === 'stun' && !isEnemy(src) && isEnemy(target) && this.defOf(target).tier === 'boss' && (target.mem.stunGuard || target.broken > 0 || (target.st.stun ?? 0) > 0)) {
        this.emit({ t: 'text', uid: target.uid, text: '기절하지 않는다', tone: 'info' });
        return 0;
      }
      // 부여자 측 보정 (예: 출혈 부여 +1)
      if (src) for (const [h, self] of this.sources(src)) if (h.modApply) amount = h.modApply(this, self, target, id, amount);
      // 결계: 해로운 효과 1회 무효
      if (def.kind === 'debuff' && (target.st.ward ?? 0) > 0 && amount > 0) {
        target.st.ward -= 1;
        if (target.st.ward <= 0) delete target.st.ward;
        this.emit({ t: 'text', uid: target.uid, text: '결계가 막아냈다', tone: 'info' });
        return 0;
      }
    }
    if (amount === 0) return 0;
    const before = target.st[id] ?? 0;
    let after = before + amount;
    if (!def.signed && after < 0) after = 0;
    if (after === 0) delete target.st[id];
    else target.st[id] = after;
    const delta = after - before;
    // 적의 차례에 걸린 지속형 효과는 첫 감소를 한 번 건너뛴다 (적이 건 약화/취약이 다음 적 차례까지 유지)
    if (delta > 0 && def.decay && this.s.phase === 'enemy' && (target === this.p || (isEnemy(target) && src === target))) {
      target.st[`_fresh_${id}`] = 1;
    }
    if (delta !== 0) {
      this.emit({ t: 'status', uid: target.uid, id, n: delta });
      if (delta > 0) this.fire(src ?? 'all', 'onApplied', target, id, delta);
    }
    return delta;
  }

  /** 상태 수치 */
  st(u: Unit, id: string): number {
    return u.st[id] ?? 0;
  }

  clear(u: Unit, id: string) {
    if (u.st[id]) this.apply(u, id, -u.st[id]);
  }

  // ── 정신력 / 통찰 ──

  /** 적이 깎을 정신력의 실제 값 미리보기 (통찰·의지·층 배율·공포·유물/광기 효과 반영) */
  previewSanityLoss(amount: number): number {
    if (amount <= 0) return 0;
    let n = amount * (1 + 0.05 * Math.min(6, this.p.insight)) * Math.max(0.5, 1 - 0.05 * this.p.will);
    n *= ACT_SAN_MULT[Math.min(5, this.run.act)] ?? 1;
    if ((this.p.st.dread ?? 0) > 0) n *= 1.5;
    this.previewing = true;
    try {
      for (const [h, self] of this.sources(this.p)) if (h.modSanityLoss) n = h.modSanityLoss(this, self, n);
    } finally {
      this.previewing = false;
    }
    return Math.max(0, Math.floor(n));
  }

  loseSanity(amount: number, fromEnemy = false) {
    if (amount <= 0 || this.over) return 0;
    let n = amount * (1 + 0.05 * Math.min(6, this.p.insight)) * Math.max(0.5, 1 - 0.05 * this.p.will);
    if (fromEnemy) {
      n *= ACT_SAN_MULT[Math.min(5, this.run.act)] ?? 1;
      if ((this.p.st.dread ?? 0) > 0) n *= 1.5;
    }
    for (const [h, self] of this.sources(this.p)) if (h.modSanityLoss) n = h.modSanityLoss(this, self, n);
    n = Math.max(0, Math.floor(n));
    if (n <= 0) return 0;
    this.run.stats.sanityLost += n;
    if (this.dying) {
      this.drainMind(n);
      return n;
    }
    this.p.sanity -= n;
    this.emit({ t: 'sanity', delta: -n });
    if (this.p.sanity <= 0) this.breakdown();
    return n;
  }

  gainSanity(amount: number) {
    const n = Math.max(0, Math.min(Math.floor(amount), this.p.maxSanity - this.p.sanity));
    if (n <= 0) return 0;
    this.p.sanity += n;
    this.emit({ t: 'sanity', delta: n });
    return n;
  }

  gainInsight(n: number) {
    if (n <= 0) return;
    this.p.insight += n;
    this.emit({ t: 'insight', delta: n });
    for (const e of this.alive) this.senseWeak(e);
  }

  /** 이번 판에 이 종족의 급소를 드러낸다 (engine/weakpoint.ts). quiet면 연출 없이. 새로 드러났으면 true */
  revealPoint(e: EnemyUnit, quiet = false): boolean {
    if (!revealWeakPoint(this.run, e.def)) return false;
    if (!quiet) this.emit({ t: 'reveal', uid: e.uid, dtype: weakPointOf(this.run, e.def)!, wp: true });
    return true;
  }

  /** 약점을 모두 드러낸다 — 이번 판의 급소까지 (조명탄·기묘한 우상·간파의 징조 등). quiet면 연출 없이. 새로 드러난 것이 있으면 true */
  expose(e: EnemyUnit, quiet = false): boolean {
    let any = false;
    for (const w of e.weak) {
      if (e.known.includes(w)) continue;
      e.known.push(w);
      if (!quiet) this.emit({ t: 'reveal', uid: e.uid, dtype: w });
      any = true;
    }
    return this.revealPoint(e, quiet) || any;
  }

  /**
   * 통찰로 꿰뚫어 보는 약점: 2 이상이면 전부, 1이면 아직 모르는 약점 하나 (적마다 한 번 — e.mem.sensed).
   * 약점이 바뀌는 적(변신·가면·목숨)은 known을 다시 정하고 sensed를 지운 뒤 다시 부른다
   */
  senseWeak(e: EnemyUnit) {
    const n = this.p.insight;
    // 통찰이 깊으면 이번 판의 급소도 보인다 (engine/weakpoint.ts)
    if (n >= WEAKPOINT.insight) this.revealPoint(e, true);
    if (n >= 2) {
      e.known = [...e.weak];
      return;
    }
    if (n < 1 || e.mem.sensed) return;
    e.mem.sensed = 1;
    const w = e.weak.find((x) => !e.known.includes(x));
    if (w) e.known = [...e.known, w];
  }

  private breakdown() {
    const res = rollMadness(this.run, this.rng);
    this.emit({ t: 'breakdown', madness: res.id ?? '', fatal: res.fatal });
    if (res.fatal) {
      this.p.sanity = 0;
      this.defeat('madness');
      return;
    }
    // 이계 정수·금기로 최대 정신력이 60 아래로 깎였으면 최대치까지만 (최대를 넘겨 채우지 않는다)
    this.p.sanity = Math.min(BREAKDOWN_RESET, this.p.maxSanity);
    this.fire(this.p, 'onBreakdown');
  }

  // ── 배치 ──

  moveRow(e: EnemyUnit, row: 0 | 1): boolean {
    if (e.dead || e.row === row) return false;
    if (this.row(row).length >= MAX_ROW) return false;
    e.row = row;
    this.emit({ t: 'row', uid: e.uid, row });
    return true;
  }

  /** 전열이 비면 후열 전진 */
  private fixRows() {
    if (this.row(0).length === 0) for (const e of this.row(1)) this.moveRow(e, 0);
  }

  spawn(defId: string, row?: 0 | 1, initial = false): EnemyUnit | null {
    const def = need(ENEMIES, defId, '적');
    let r: 0 | 1 = row ?? def.row ?? 0;
    if (this.row(r).length >= MAX_ROW) r = r === 0 ? 1 : 0;
    if (this.row(r).length >= MAX_ROW) return null;
    const tide = this.run.floor?.tide ?? 0;
    const hpMul =
      // 심연 단계 (「질긴 것들」 모든 적, 「완고한 것들」 정예·수호자)
      abyssHpMult(this.run, def.tier) *
      (1 + 0.08 * tide) *
      (ACT_HP_MULT[Math.min(5, def.act)] ?? 1) *
      (def.tier === 'boss' ? BOSS_HP_MULT.value : 1);
    const hp = Math.round(this.rng.int(def.hp[0], def.hp[1]) * hpMul);
    const e: EnemyUnit = {
      uid: `e${++this.s.uidN}`,
      def: def.id,
      name: def.name,
      hp,
      maxHp: hp,
      block: 0,
      st: {},
      row: r,
      poise: scaledPoise(def.poise, def.act),
      maxPoise: scaledPoise(def.poise, def.act),
      broken: 0,
      weak: [...def.weak],
      known: def.weak.filter((w) => this.run.knownWeak?.[def.id]?.includes(w)),
      resist: { ...(def.resist ?? {}) },
      intent: null,
      mem: {},
      hist: [],
      dead: false,
      minion: def.tier === 'minion',
      scale: def.visual.scale ?? 1,
    };
    this.s.enemies.push(e);
    def.onSpawn?.(this, e);
    // 도감 지식 위에 통찰로 보이는 약점 (onSpawn이 약점을 바꿨을 수 있으니 그 뒤에)
    this.senseWeak(e);
    if (!initial) {
      this.emit({ t: 'spawn', uid: e.uid });
      // 변이 등 (전투 시작 때 나온 적은 모두 나온 뒤 begin에서 한 번에)
      this.fire('all', 'onEnemySpawn', e);
      if (this.s.phase === 'player') this.planIntent(e);
    }
    return e;
  }

  // ── 플레이어 스킬 ──

  /** 'weapon' | 'armor' | 장착 스킬 uid */
  skillInfo(ref: string): { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' } | null {
    const run = this.run;
    if (ref === 'weapon' || ref === 'armor') {
      const it = run.equip[ref];
      const fallback = ref === 'weapon' ? 'punch' : 'brace';
      const skillId = (it && EQUIPS.get(it.id)?.skill) || fallback;
      const def = SKILLS.get(skillId);
      if (!def) return null;
      return { def, owned: { uid: ref, id: skillId, lvl: it?.lvl ?? 0, runes: [] }, basic: ref };
    }
    if (!run.slots.includes(ref)) return null;
    const owned = run.skills.find((s) => s.uid === ref);
    if (!owned) return null;
    const def = SKILLS.get(owned.id);
    return def ? { def, owned } : null;
  }

  makeUse(info: { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' }, power = 1): SkillUse {
    const { def, owned } = info;
    let mult = power;
    for (const id of owned.runes) mult *= RUNES.get(id)?.powerMult ?? 1;
    const lvl = owned.lvl;
    const u: SkillUse = {
      def,
      owned,
      lvl,
      power: mult,
      basic: info.basic,
      primary: null,
      // 턴마다 바뀌는 속성 (굴절광): 미리보기·카드·설명이 이번 턴의 것을 쓴다. 각인(공허 각인)은 beforeSkill에서 덮어쓴다
      type: def.typeNow?.(this),
      v(key: string) {
        const raw = def.vals[key];
        if (raw === undefined) return 0;
        let val = Array.isArray(raw) ? raw[Math.min(lvl, raw.length - 1)] : raw;
        if (/^(dmg|blk|heal)/.test(key)) val = Math.floor(val * u.power);
        return val;
      },
    };
    return u;
  }

  costOf(info: { def: SkillDef; owned: OwnedSkill }): number {
    const { def, owned } = info;
    let cost = lvlVal(def.cost, owned.lvl);
    for (const id of owned.runes) cost += RUNES.get(id)?.costMod ?? 0;
    for (const [h, self] of this.sources(this.p)) if (h.modCost) cost = h.modCost(this, self, def, cost);
    return Math.max(0, cost);
  }

  cdOf(info: { def: SkillDef; owned: OwnedSkill }): number {
    const base = lvlVal(info.def.cd, info.owned.lvl);
    let cd = base;
    for (const id of info.owned.runes) cd += RUNES.get(id)?.cdMod ?? 0;
    for (const [h, self] of this.sources(this.p)) if (h.modCd) cd = h.modCd(this, self, info.def, cd);
    // 원래 재사용 대기가 있는 스킬은 각인·유물로도 1턴 아래로 줄지 않는다 (같은 턴에 무한히 쓰는 고리 방지)
    return Math.max(base > 0 ? 1 : 0, cd);
  }

  /** 단일 대상 스킬이 고를 수 있는 적 */
  validTargets(def: SkillDef): EnemyUnit[] {
    let list = this.alive;
    if (def.range === 'melee') {
      const front = this.row(0);
      // 기믹 대상(퍼즐 목표·깨야 하는 물건)은 후열에 있어도 근접으로 닿는다 — 근접 직업만 손쓸 수 없게 되지 않도록
      if (front.length) list = this.alive.filter((e) => e.row === 0 || this.reachable(e));
    }
    const taunts = list.filter((e) => (e.st.taunt ?? 0) > 0);
    return taunts.length ? taunts : list;
  }

  /** 후열에 있어도 근접 공격이 닿는 적: 퍼즐 목표의 대상이거나, 기믹 물건(EnemyDef.reachable, e.mem.reachable) */
  reachable(e: EnemyUnit): boolean {
    const o = this.s.obj;
    if (o && (o.hit?.uid === e.uid || o.break === e.uid || o.kill?.includes(e.uid))) return true;
    return !!this.defOf(e).reachable || !!e.mem.reachable;
  }

  /** 사용 불가 사유 */
  blockReason(ref: string): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아니다';
    if (this.s.choice) return '선택지부터 골라야 한다';
    const info = this.skillInfo(ref);
    if (!info) return '사용할 수 없는 스킬';
    if ((this.s.cd[info.owned.uid] ?? 0) > 0) return `재사용 대기 ${this.s.cd[info.owned.uid]}턴`;
    if (this.costOf(info) > this.s.ap) return '행동력 부족';
    if ((this.p.st.silence ?? 0) > 0 && !info.basic) return '침묵 상태';
    const u = this.makeUse(info);
    return info.def.canUse?.(this, u) ?? null;
  }

  useSkill(ref: string, targetUid?: string | null): string | null {
    const why = this.blockReason(ref);
    if (why) return why;
    const info = this.skillInfo(ref)!;
    const def = info.def;
    let target: EnemyUnit | null = null;
    if (def.target === 'single') {
      const valid = this.validTargets(def);
      target = valid.find((e) => e.uid === targetUid) ?? null;
      if (!target) {
        if (valid.length === 1 || !targetUid) target = valid[0] ?? null;
        else return '대상을 골라야 한다';
      }
      if (!target) return '대상이 없다';
    }
    this.s.ap -= this.costOf(info);
    const cd = this.cdOf(info);
    if (cd > 0) this.s.cd[info.owned.uid] = cd;

    this.runSkill(info, target, 1, false);
    const hasEcho = info.owned.runes.includes('echo');
    // 메아리: 탄약을 쓰는 스킬은 탄약이 남아 있을 때만 (빈 총으로 공짜 사격·재장전 방지)
    const echoAmmoOk = !(def.tags ?? []).includes('ammo') || this.s.ammo > 0;
    if (hasEcho && echoAmmoOk && !this.over) {
      const t2 = target && !target.dead ? target : def.target === 'single' ? (this.validTargets(def)[0] ?? null) : null;
      if (def.target !== 'single' || t2) this.runSkill(info, t2, 0.5, true);
    }
    this.s.used++;
    this.s.usedTotal++;
    this.run.stats.skillsUsed++;
    this.fixRows();
    this.checkEnd();
    return null;
  }

  private runSkill(info: { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' }, target: EnemyUnit | null, power: number, echo: boolean) {
    const u = this.makeUse(info, power);
    u.echo = echo;
    u.primary = target;
    this.fire(this.p, 'beforeSkill', u);
    for (const [h, self] of this.runeHooks(u)) h.beforeSkill?.(this, self, u);
    this.emit({ t: 'skill', skill: info.def.id, name: info.def.name, target: target?.uid, school: info.def.school, dtype: u.type ?? info.def.type, echo });
    info.def.run(this, u, target);
    if (this.over) return;
    this.fire(this.p, 'afterSkill', u);
    for (const [h, self] of this.runeHooks(u)) h.afterSkill?.(this, self, u);
  }

  /** 스킬의 대상 모드에 따라 공격. hits는 대상마다 */
  strike(
    u: SkillUse,
    target: EnemyUnit | null,
    o: { dmg: number; hits?: number; type?: DmgType; poise?: number; tags?: string[]; ignoreBlock?: boolean; mode?: SkillDef['target'] } ,
  ): DamageCtx[] {
    const out: DamageCtx[] = [];
    const hits = o.hits ?? 1;
    const type = o.type ?? u.type ?? u.def.type ?? 'blunt';
    const mode = o.mode ?? u.def.target;
    const melee = u.def.range === 'melee';
    const hitOne = (t: EnemyUnit) => {
      if (t.dead || this.over) return;
      out.push(
        this.damage({ src: this.p, tgt: t, base: o.dmg, type, attack: true, melee, skill: u, poise: o.poise, tags: o.tags, ignoreBlock: o.ignoreBlock }),
      );
    };
    if (mode === 'random') {
      for (let i = 0; i < hits; i++) {
        // 근접 스킬의 무작위 타격도 근접 규칙을 따른다 (전열에 적이 있으면 전열만)
        const pool = melee ? this.validTargets(u.def) : this.alive;
        if (!pool.length) break;
        hitOne(this.rng.pick(pool));
      }
      return out;
    }
    let targets: EnemyUnit[];
    if (mode === 'single') targets = target ? [target] : [];
    else if (mode === 'front') targets = this.row(0).length ? this.row(0) : this.row(1);
    else if (mode === 'back') targets = this.row(1).length ? this.row(1) : this.row(0);
    else if (mode === 'all') targets = this.alive;
    else targets = [];
    for (let i = 0; i < hits; i++) for (const t of targets) hitOne(t);
    return out;
  }

  // ── 소모품 ──

  useConsumable(idx: number, targetUid?: string | null): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아니다';
    if (this.s.choice) return '선택지부터 골라야 한다';
    const id = this.run.consumables[idx];
    if (!id) return '빈 칸';
    const def = need(CONSUMABLES, id, '소모품');
    let target: Unit | null = null;
    if (def.target === 'single') {
      target = this.enemy(targetUid) ?? this.alive[0] ?? null;
      if (!target) return '대상이 없다';
    }
    this.run.consumables[idx] = null;
    this.emit({ t: 'text', text: def.name, tone: 'info' });
    def.use(this.run, this, target);
    this.fixRows();
    this.checkEnd();
    return null;
  }

  // ── 턴 진행 ──

  private tickStatuses(u: Unit, when: 'start' | 'end') {
    for (const id of Object.keys(u.st)) {
      if (this.over || (u.hp <= 0 && !this.isDyingPlayer(u))) return;
      const def = STATUSES.get(id);
      const n = u.st[id];
      if (!def || !n) continue;
      if (when === 'start') def.tickStart?.(this, u, n);
      else def.tickEnd?.(this, u, n);
    }
  }

  private decay(u: Unit) {
    for (const id of Object.keys(u.st)) {
      const def = STATUSES.get(id);
      if (u.st[`_fresh_${id}`]) {
        delete u.st[`_fresh_${id}`];
        continue;
      }
      if (def?.decay && u.st[id] > 0) {
        u.st[id] -= 1;
        if (u.st[id] <= 0) delete u.st[id];
      }
    }
  }

  startPlayerTurn() {
    const s = this.s;
    s.turn++;
    s.phase = 'player';
    s.used = 0;
    const p = this.p;
    if ((p.st.retain ?? 0) > 0) {
      p.st.retain -= 1;
      if (p.st.retain <= 0) delete p.st.retain;
    } else p.block = 0;
    s.ap = p.maxAp + (p.st.energized ?? 0);
    delete p.st.energized;
    for (const k of Object.keys(s.cd)) {
      s.cd[k] = Math.max(0, s.cd[k] - 1);
      if (s.cd[k] === 0) delete s.cd[k];
    }
    this.emit({ t: 'turn', side: 'player', turn: s.turn });
    if (this.dying) {
      this.emit({ t: 'text', uid: 'p', text: '의식이 희미해진다', tone: 'bad' });
      this.drainMind(8);
      if (this.over) return;
    }
    this.tickStatuses(p, 'start');
    if (this.over) return;
    this.fire(p, 'onTurnStart');
    this.fixRows();
    this.checkEnd();
  }

  endTurn(): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아니다';
    if (this.s.choice) return '선택지부터 골라야 한다';
    const p = this.p;
    this.fire(p, 'onTurnEnd');
    if (this.checkEnd()) return null;
    this.tickStatuses(p, 'end');
    if (this.checkEnd()) return null;

    this.s.phase = 'enemy';
    this.emit({ t: 'turn', side: 'enemy', turn: this.s.turn });
    if (this.enemyRound()) return null;
    // 라운드 종료: 플레이어의 지속형 효과 감소
    this.decay(p);
    for (const e of this.alive) if (e.broken !== 2) this.planIntent(e);
    this.startPlayerTurn();
    return null;
  }

  /** 적의 차례: 전열부터 한 명씩 행동한다. 전투가 끝났으면 true */
  private enemyRound(): boolean {
    const order = [...this.row(0), ...this.row(1)];
    for (const e of order) {
      if (e.dead) continue;
      if ((e.st.retain ?? 0) > 0) {
        e.st.retain -= 1;
        if (e.st.retain <= 0) delete e.st.retain;
      } else e.block = 0;
      this.tickStatuses(e, 'start');
      this.fire(e, 'onUnitTurnStart');
      if (this.checkEnd()) return true;
      if (e.dead) continue;
      // 수호자는 행동을 건너뛰면(붕괴·기절) 한 번 행동하기 전까지 기절하지 않는다 (붕괴와 기절을 번갈아 영원히 묶는 것 방지)
      const boss = this.defOf(e).tier === 'boss';
      if (e.broken === 2) {
        // 붕괴: 남은 횟수만큼 건너뛴다. 마지막으로 건너뛰면 회복 중(1)이 되어 다음 차례를 정한다
        const left = (e.mem.bk ?? 1) - 1;
        if (left > 0) e.mem.bk = left;
        else {
          delete e.mem.bk;
          e.broken = 1;
        }
        if (boss) {
          e.mem.stunGuard = 1;
          // 붕괴로 건너뛴 차례가 걸려 있던 기절도 함께 쓴다 (붕괴 직전에 건 기절로 한 번 더 묶지 못하게)
          if ((e.st.stun ?? 0) > 0) this.apply(e, 'stun', -1);
        }
      } else {
        if (e.broken === 1) this.restorePoise(e);
        if ((e.st.stun ?? 0) > 0) {
          this.apply(e, 'stun', -1);
          this.emit({ t: 'text', uid: e.uid, text: '기절', tone: 'info' });
          if (boss) e.mem.stunGuard = 1;
        } else {
          delete e.mem.stunGuard;
          this.act(e);
        }
      }
      if (this.checkEnd()) return true;
      if (!e.dead) {
        this.tickStatuses(e, 'end');
        this.fire(e, 'onUnitTurnEnd');
        this.decay(e);
      }
      this.fixRows();
      if (this.checkEnd()) return true;
    }
    return false;
  }

  /**
   * 적이 먼저 움직인다 (심연 「어둠 속의 것들」: 어둠 속 기습): 내 첫 턴이 오기 전에 적의 차례가 한 번 온다.
   * 내가 아무것도 하지 못한 한 라운드가 먼저 지나간 것과 같다 (라운드 끝의 지속 감소까지).
   */
  private firstStrike(text: string) {
    this.s.phase = 'enemy';
    this.emit({ t: 'text', text, tone: 'bad' });
    this.emit({ t: 'turn', side: 'enemy', turn: 0 });
    if (this.enemyRound()) return;
    this.decay(this.p);
    for (const e of this.alive) if (e.broken !== 2) this.planIntent(e);
  }

  moveDef(e: EnemyUnit, id: string): MoveDef {
    return BUILTIN_MOVES[id] ?? this.defOf(e).moves[id] ?? BUILTIN_MOVES._wait;
  }

  private act(e: EnemyUnit) {
    let id = e.intent?.move ?? '_wait';
    let m = this.moveDef(e, id);
    if (m.melee && e.row !== 0) {
      id = this.row(0).length < MAX_ROW ? '_advance' : '_wait';
      m = BUILTIN_MOVES[id];
    }
    this.emit({ t: 'move', uid: e.uid, name: m.name, kind: m.intent, move: id, ult: m.ultimate, cine: m.cine });
    m.run(this, e);
    e.hist.push(id);
    if (e.hist.length > 4) e.hist.shift();
  }

  planIntent(e: EnemyUnit) {
    if (e.dead) return;
    let id: string | undefined;
    for (const [h, self] of this.sources(e)) {
      id = h.planOverride?.(this, self, e);
      if (id) break;
    }
    if (!id) {
      id = this.defOf(e).ai(this, e);
      for (const [h, self] of this.sources(e)) {
        const r = h.planReplace?.(this, self, e, id);
        if (r) {
          id = r;
          break;
        }
      }
    }
    let m = this.moveDef(e, id);
    if (m.melee && e.row !== 0) {
      id = this.row(0).length < MAX_ROW ? '_advance' : '_wait';
      m = BUILTIN_MOVES[id];
    }
    const dmg = typeof m.dmg === 'function' ? m.dmg(this, e) : m.dmg;
    const hits = typeof m.hits === 'function' ? m.hits(this, e) : m.hits;
    e.intent = {
      move: id,
      kind: m.intent,
      extra: m.extra,
      dmg,
      hits,
      sanity: m.sanity,
      label: m.name,
      hidden: m.hidden,
      charging: m.charging,
      disguise: m.disguise,
    };
  }

  /** 플레이어에게 보이는 의도 (속임수 의도는 통찰이 모자라면 가짜로 보인다) */
  shownIntent(e: EnemyUnit): Intent | null {
    return shownIntentOf(e.intent, this.p.insight);
  }

  /** 적의 의도대로 공격 (의도에 표시된 피해·횟수 사용) */
  enemyAttack(e: EnemyUnit, o: { dmg?: number; hits?: number; type?: DmgType; melee?: boolean; tags?: string[] } = {}): DamageCtx[] {
    const out: DamageCtx[] = [];
    const dmg = o.dmg ?? e.intent?.dmg ?? 0;
    const hits = o.hits ?? e.intent?.hits ?? 1;
    const melee = o.melee ?? this.moveDef(e, e.intent?.move ?? '_wait').melee ?? false;
    for (let i = 0; i < hits; i++) {
      if (this.over || e.dead) break;
      // 광란: 절반 확률로 다른 적을 공격
      let tgt: Unit = this.p;
      if ((e.st.madden ?? 0) > 0) {
        const others = this.alive.filter((x) => x !== e);
        if (others.length && this.rng.chance(0.5)) {
          tgt = this.rng.pick(others);
          this.emit({ t: 'text', uid: e.uid, text: '광란!', tone: 'eldritch' });
        }
      }
      out.push(this.damage({ src: e, tgt, base: dmg, type: o.type ?? 'blunt', attack: true, melee, move: e.intent?.move, tags: o.tags }));
    }
    return out;
  }

  /** 적의 정신 공격 */
  horror(e: EnemyUnit, amount?: number) {
    const n = amount ?? e.intent?.sanity ?? 0;
    this.emit({ t: 'fx', name: 'horror', src: e.uid, tgt: 'p' });
    return this.loseSanity(n, true);
  }

  // ── 종료 ──

  private checkEnd(): boolean {
    if (this.over) return true;
    if (this.p.hp <= 0 && !this.dying) {
      this.defeat('hp');
      return true;
    }
    if (this.alive.length === 0) {
      this.victory();
      return true;
    }
    return false;
  }

  private victory() {
    this.s.phase = 'victory';
    // 살아남았다는 안도
    if (!this.dying && this.p.sanity < this.p.maxSanity) {
      this.p.sanity = Math.min(this.p.maxSanity, this.p.sanity + 2);
      this.emit({ t: 'sanity', delta: 2 });
    }
    this.emit({ t: 'victory' });
    this.fire(this.p, 'onCombatEnd', true);
    this.cleanup();
  }

  /** 전투 중 선택지를 건다 — 플레이어가 고를 때까지 기술·소모품·턴 종료가 막힌다 (이미 걸려 있으면 바꾼다) */
  offerChoice(ch: CombatChoice) {
    if (this.over) return;
    this.s.choice = ch;
  }

  /** 걸어 둔 선택지를 거둔다 (그 id의 선택지가 걸려 있을 때만, id가 없으면 무엇이든) */
  withdrawChoice(id?: string) {
    if (this.s.choice && (!id || this.s.choice.id === id)) this.s.choice = null;
  }

  /** 걸린 선택지를 고른다 — 모든 훅 소유자의 onChoice가 불린다 */
  choose(option: string): string | null {
    const ch = this.s.choice;
    if (!ch) return '고를 것이 없다';
    if (this.s.phase !== 'player' || this.over) return '내 턴이 아니다';
    const o = ch.options.find((x) => x.id === option);
    if (!o) return '없는 선택지';
    this.s.choice = null;
    this.emit({ t: 'text', uid: 'p', text: o.label, tone: 'eldritch' });
    this.fire('all', 'onChoice', ch.id, option);
    this.fixRows();
    this.checkEnd();
    return null;
  }

  /**
   * 즉사기: 막지 못하면 사경도 없이 그 자리에서 죽는다. 결계가 있으면 하나를 깨뜨려 대신 막는다.
   * 돌려주는 값: 실제로 죽었는가
   */
  executePlayer(by: EnemyUnit | null, name: string): boolean {
    if (this.over) return false;
    if ((this.p.st.ward ?? 0) > 0) {
      this.p.st.ward -= 1;
      if (this.p.st.ward <= 0) delete this.p.st.ward;
      this.emit({ t: 'status', uid: 'p', id: 'ward', n: -1 });
      this.emit({ t: 'text', uid: 'p', text: '결계가 죽음을 막았다', tone: 'good' });
      return false;
    }
    this.s.obj = null;
    this.s.doom = name;
    this.emit({ t: 'cine', name: 'execute', uid: by?.uid, text: name });
    this.p.hp = 0;
    this.p.sanity = 0;
    this.defeat('doom');
    return true;
  }

  private defeat(reason: 'hp' | 'madness' | 'doom') {
    if (this.s.phase === 'defeat') return;
    this.s.phase = 'defeat';
    this.emit({ t: 'defeat', reason });
  }

  private cleanup() {
    const p = this.p;
    // 전투가 끝나면 걸려 있던 선택지도 거둔다
    this.s.choice = null;
    p.block = 0;
    p.st = {};
    if (p.hp <= 0) p.hp = 1;
  }
}

export function lvlVal(v: number | number[], lvl: number): number {
  return Array.isArray(v) ? v[Math.min(lvl, v.length - 1)] : v;
}

/** 광기 획득. 이미 MAX_MADNESS-1개면 치명적 */
export function rollMadness(run: RunState, rng: Rng): { id: string | null; fatal: boolean } {
  const negatives = run.madness.filter((id) => !MADNESS.get(id)?.virtue).length;
  // 25% 확률로 각성(긍정)
  const virtues = [...MADNESS.values()].filter((m) => m.virtue && !run.madness.includes(m.id));
  if (virtues.length && rng.chance(0.25)) {
    const v = rng.pick(virtues);
    run.madness.push(v.id);
    v.onGain?.(run);
    return { id: v.id, fatal: false };
  }
  if (negatives + 1 >= MAX_MADNESS) return { id: null, fatal: true };
  const pool = [...MADNESS.values()].filter((m) => !m.virtue && !run.madness.includes(m.id));
  if (!pool.length) return { id: null, fatal: true };
  const m = rng.pick(pool);
  run.madness.push(m.id);
  m.onGain?.(run);
  return { id: m.id, fatal: false };
}
