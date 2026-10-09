import type { Combat } from './combat';

// ───────────── 기본 열거형 ─────────────

export type DmgType = 'slash' | 'pierce' | 'blunt' | 'fire' | 'arcane' | 'void';
export const DMG_TYPES: readonly DmgType[] = ['slash', 'pierce', 'blunt', 'fire', 'arcane', 'void'];

export type School = 'blade' | 'firearm' | 'occult' | 'alchemy' | 'resolve' | 'forbidden' | 'essence' | 'neutral';

/**
 * 상처의 문법: 계열을 잇는 키워드. 스킬이 만드는 것(SkillDef.makes)과 읽는 것(SkillDef.reads).
 * 키워드마다 1차·2차 생산 계열과 읽는 계열을 정한 표는 src/content/keywords.ts (engine/keywords.ts가 보관)
 * - 적에게 남는 것: bleed 출혈 · poison 독 · burn 화상 · mark 인장 · doom 파멸 · expose 약화·취약(공용)
 * - 나에게 남는 것: block 방어도 · counter 반격 · barrier 보호막 · aim 조준 · ammo 탄약 · combo 연계(이번 턴 쓴 스킬 수) · sanity 잃은 정신력 · tentacle 촉수
 */
export type Keyword =
  | 'bleed'
  | 'poison'
  | 'burn'
  | 'mark'
  | 'doom'
  | 'expose'
  | 'block'
  | 'counter'
  | 'barrier'
  | 'aim'
  | 'ammo'
  | 'combo'
  | 'sanity'
  | 'tentacle';

/** genesis(창세): 희귀 위의 최상위 — 계층군주·5층 강적에게서만, 판마다 하나 (content/genesis.ts) */
export type Rarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'forbidden' | 'boss' | 'special' | 'genesis';

export type Range = 'melee' | 'ranged' | 'self';

/** single: 대상 1명 / front·back: 해당 열 전체 / all: 적 전체 / random: 타격마다 무작위 / self: 자신 */
export type TargetMode = 'single' | 'front' | 'back' | 'all' | 'random' | 'self';

export type IntentKind =
  | 'attack'
  | 'block'
  | 'buff'
  | 'debuff'
  | 'horror'
  | 'summon'
  | 'charge'
  | 'advance'
  | 'retreat'
  | 'heal'
  | 'flee'
  | 'stunned'
  | 'sleep'
  | 'unknown'
  | 'special'
  /** 즉사기 (막지 못하면 그 자리에서 죽는다) */
  | 'death';

// ───────────── 유닛 ─────────────

export interface Unit {
  uid: string;
  hp: number;
  maxHp: number;
  block: number;
  /** 상태이상: id → 수치 */
  st: Record<string, number>;
}

export interface PlayerState extends Unit {
  sanity: number;
  maxSanity: number;
  insight: number;
  gold: number;
  level: number;
  xp: number;
  maxAp: number;
  /** 영구 스탯 보정 (특성·이벤트) */
  str: number;
  dex: number;
  will: number;
}

export interface Intent {
  move: string;
  kind: IntentKind;
  extra?: IntentKind[];
  /** 기본 피해(표시할 때 힘/약화 등을 반영해 계산) */
  dmg?: number;
  hits?: number;
  sanity?: number;
  label: string;
  /** 통찰이 HIDDEN_REVEAL(3) 미만이면 ??? 로 표시 */
  hidden?: boolean;
  /** 차지 중 — 다음 행동이 강력 */
  charging?: boolean;
  /** 속임수 의도 (MoveDef.disguise) — 보이는 것은 shownIntent()로 */
  disguise?: { kind: IntentKind; label: string; dmg?: number; hits?: number; reveal?: number; desc?: string };
  /** 속임수 의도의 거짓 설명 (shownIntent가 채운다) */
  desc?: string;
}

export interface EnemyUnit extends Unit {
  def: string;
  name: string;
  /** 0 전열, 1 후열 */
  row: 0 | 1;
  poise: number;
  maxPoise: number;
  /** 2: 붕괴해 행동하지 못한다(남은 횟수는 mem.bk), 1: 회복 중(받는 피해 증가, 다음 차례에 버팀이 돌아온다), 0: 정상 */
  broken: number;
  /** 약점이 아닌 공격을 맞은 횟수 (GUARD.chip번이면 버팀 -1, 0으로 돌아간다). 예전 저장에는 없다 */
  chip?: number;
  weak: DmgType[];
  known: DmgType[];
  resist: Partial<Record<DmgType, number>>;
  intent: Intent | null;
  /** AI 메모리 */
  mem: Record<string, number>;
  /** 최근 행동 (최신이 마지막, 최대 4개) */
  hist: string[];
  dead: boolean;
  fled?: boolean;
  minion?: boolean;
  /** 표시용 크기 배율 */
  scale: number;
  /** 변신 형태 (EnemyDef.forms 인덱스 + 1, 0 = 기본) */
  form?: number;
  /**
   * 변이 (2026-10 심연 압력, content/depth.ts): 이 개체에만 붙은 특성 id. EnemyDef.traits처럼 훅이 돈다.
   * 2층부터 정예, 3층부터 일반 적에게 무작위로 붙는다. 굴린 적이 없으면 undefined (예전 저장)
   */
  affix?: string[];
}

// ───────────── 소유 아이템 ─────────────

export interface OwnedSkill {
  uid: string;
  id: string;
  /** 0 = 기본, 1 = 강화 */
  lvl: number;
  runes: string[];
  /** 출처 (정수 uid 등). 정수를 제거하면 함께 사라짐 */
  from?: string;
  /** 처음부터 가진 기본 스킬 (팔아도 0골드) */
  starter?: boolean;
}

export interface OwnedEssence {
  uid: string;
  id: string;
  /** 색 = 액티브 종류 */
  color: number;
  guardian?: boolean;
  /** 본질로 흡수: 능력치·패시브에 최대 체력을 더 받는다 (보통 정수는 늘, 수호자 정수도 이제 늘) */
  core?: boolean;
  /** 수호자 정수를 흡수하며 고른 기술 하나 (없으면 기술 없이) */
  skill?: string;
}

export interface EssenceStats {
  maxHp?: number;
  str?: number;
  dex?: number;
  will?: number;
  maxSanity?: number;
  insight?: number;
}

export interface EssenceDef {
  id: string;
  name: string;
  icon: string;
  /** 정수 등급 9(약)~1(강) */
  grade: number;
  stats: EssenceStats;
  passive: { name: string; desc: string; hooks?: Hooks };
  /** 색별 액티브 스킬 id */
  actives: string[];
  colors: string[];
  /** 이계 정수: 흡수 시 최대 정신력 -5 (통찰은 주지 않는다) */
  eldritch?: boolean;
  /** 계층정수: 제거 불가 */
  lord?: boolean;
  /** 정수 자리를 몇 칸 차지하는가 (기본 1) */
  slotCost?: number;
  /** 드롭 가중치 조절 (기본 1) */
  dropMul?: number;
}

export interface OwnedItem {
  uid: string;
  id: string;
  /** 강화 단계 0~2 */
  lvl: number;
  /** 접사 id (2026-10 성장 개편 — 얻을 때 층에 따라 무작위로). 예전 저장·시작 장비에는 없다 */
  aff?: string[];
  /** 처음부터 가진 기본 장비 (팔아도 0골드) */
  starter?: boolean;
}

export interface OwnedRelic {
  id: string;
  /** 유물별 카운터 등 */
  n: number;
}

export type EquipSlot = 'weapon' | 'armor' | 'trinket1' | 'trinket2';

// ───────────── 훅 (유물·상태이상·장비·특성·광기·적 특성 공용) ─────────────

export interface HookSelf {
  kind: 'status' | 'relic' | 'equip' | 'perk' | 'madness' | 'trait' | 'anomaly' | 'rune' | 'essence' | 'affix' | 'pact';
  id: string;
  /** 소유자 */
  unit: Unit;
  /** 상태이상 수치 / 장비 강화 단계 */
  n: number;
  /** 유물 카운터 등 저장소 (OwnedRelic) */
  ref?: { n: number };
}

export interface DamageCtx {
  src: Unit | null;
  tgt: Unit;
  type: DmgType | 'true';
  base: number;
  /**
   * 배율 전 가산. 내 공격의 고정 가산(힘·'+N' 효과)은 스킬 한 번에 대상마다 첫 타격에만 붙는다 —
   * 같은 스킬이 이미 때린 대상이면 공격자 쪽 훅(modDamageOut)이 더한 값은 0이 된다 (Combat.flatSpent)
   */
  add: number;
  /** 타격마다 붙는 가산 — '타격마다'로 설계된 효과만 (예: 시궁쥐 떼 정수 '무리 근성'). 고정 가산 1회 규칙을 받지 않는다 */
  addEach: number;
  /** 미리보기용: 같은 스킬의 두 번째 이후 타격으로 본다 */
  repeat?: boolean;
  /** 누적 배율 */
  mult: number;
  /** 최종 피해 상한 */
  cap?: number;
  attack: boolean;
  melee: boolean;
  skill?: SkillUse;
  /** 적 행동 id */
  move?: string;
  ignoreBlock?: boolean;
  /** 버팀 추가 감소 */
  poiseBonus: number;
  /** 대상의 버팀이 이 피해에 건 배율 (버팀이 남았으면 GUARD.mult, 붕괴 중이면 붕괴 배율, 없으면 1) — 엔진이 채운다 */
  guard: number;
  tags: string[];
  // 결과
  amount: number;
  /** 버팀 배율(guard)을 걸기 전 피해 — 퍼즐 목표의 셈 (engine/combat.ts unguarded) */
  bare: number;
  blocked: number;
  hpLoss: number;
  killed: boolean;
  broke: boolean;
  weakHit: boolean;
  crit: boolean;
}

export interface BlockCtx {
  unit: Unit;
  amount: number;
  fromSkill?: SkillUse;
}

/**
 * 턴마다 바뀌는 효과의 지금 모습 — 내 상태 칸 앞의 칩 (굴절광의 속성, 홀짝 턴 보너스, N턴마다 이루어지는 효과).
 * 화면에만 쓴다 (상태를 바꾸지 않는다)
 */
export interface TurnNote {
  icon: string;
  /** 칩에 보이는 짧은 말 ('이번 턴', '2턴 뒤', '물리 +20%') */
  text: string;
  /** 누르면 보이는 제목과 풀이 */
  title: string;
  desc: string;
  /** 이번 턴에 이루어졌거나 지금 켜져 있다 (밝게) */
  now?: boolean;
  /** 나쁜 것(광기 등)은 붉게 */
  bad?: boolean;
}

export interface Hooks {
  /** 턴마다 바뀌는 효과의 지금 모습 (화면 칩 — TurnNote). 상태를 바꾸지 않는다 */
  turnNote?(c: Combat, s: HookSelf): TurnNote | null;
  onCombatStart?(c: Combat, s: HookSelf): void;
  /** 플레이어 턴 시작 (AP·방어도 처리 이후) */
  onTurnStart?(c: Combat, s: HookSelf): void;
  /** 플레이어 턴 종료 직전 */
  onTurnEnd?(c: Combat, s: HookSelf): void;
  /** 이 유닛(적)의 행동 직전/직후 */
  onUnitTurnStart?(c: Combat, s: HookSelf): void;
  onUnitTurnEnd?(c: Combat, s: HookSelf): void;
  beforeSkill?(c: Combat, s: HookSelf, u: SkillUse): void;
  afterSkill?(c: Combat, s: HookSelf, u: SkillUse): void;
  /** 소유자가 가하는 피해 보정 */
  modDamageOut?(c: Combat, s: HookSelf, d: DamageCtx): void;
  /** 소유자가 받는 피해 보정 */
  modDamageIn?(c: Combat, s: HookSelf, d: DamageCtx): void;
  onDamageDealt?(c: Combat, s: HookSelf, d: DamageCtx): void;
  onDamageTaken?(c: Combat, s: HookSelf, d: DamageCtx): void;
  modBlock?(c: Combat, s: HookSelf, b: BlockCtx): void;
  /** 소유자 쪽(플레이어 쪽이면 플레이어가) 적을 처치 */
  onKill?(c: Combat, s: HookSelf, victim: EnemyUnit, d: DamageCtx | null): void;
  onBreak?(c: Combat, s: HookSelf, victim: EnemyUnit): void;
  /**
   * 피해 계산의 마지막 (버팀 배율까지 건 뒤, 상한을 적용하기 전). 속성 없는 피해(지속 피해·가시)에도 불린다 —
   * modDamageIn은 속성 있는 피해에만 불린다. 맞는 쪽(owner = 대상)의 특성·변이와 규칙에 걸린다 (가호: d.cap)
   */
  modDamageFinal?(c: Combat, s: HookSelf, d: DamageCtx): void;
  /**
   * 적의 버팀이 깎이려 할 때 (약점·버팀 추가 감소·약점이 아닌 공격의 누적). 깎일 양을 바꿔 돌려준다 — 0이면 깎이지 않는다.
   * 맞는 적의 특성·변이와 규칙에 걸린다 (owner = 그 적)
   */
  modPoiseLoss?(c: Combat, s: HookSelf, target: EnemyUnit, dec: number, d: DamageCtx): number;
  /**
   * 적의 다음 행동을 정할 때 AI보다 먼저 묻는다: 행동 id를 돌려주면 그것으로 정한다 (심연의 각성처럼 모든 수호자에게 끼어드는 패턴).
   * 맞는 적의 특성·변이와 규칙에 걸린다 (owner = 그 적). 끼어든 차례에는 그 적의 ai()를 부르지 않는다
   */
  planOverride?(c: Combat, s: HookSelf, e: EnemyUnit): string | undefined;
  /**
   * AI가 고른 다음 행동을 바꿀 기회 (planOverride가 없을 때, ai() 다음). 바꿀 행동 id를 돌려준다.
   * AI가 이미 상태를 걸어 둔 특별한 행동(명령·퍼즐·차지)은 건드리지 말고 평범한 행동만 바꿀 것 (심연의 각성)
   */
  planReplace?(c: Combat, s: HookSelf, e: EnemyUnit, planned: string): string | undefined;
  /** 적이 전장에 나타났다 (전투 시작 때 모두 나온 뒤 한 번씩, 그 뒤 불려 나올 때마다). 규칙만 받는다 (owner = 'all') */
  onEnemySpawn?(c: Combat, s: HookSelf, e: EnemyUnit): void;
  /** 상태 부여 수치 보정. 반환값이 새 수치 */
  modApply?(c: Combat, s: HookSelf, target: Unit, id: string, n: number): number;
  onApplied?(c: Combat, s: HookSelf, target: Unit, id: string, n: number): void;
  modSanityLoss?(c: Combat | null, s: HookSelf, amount: number): number;
  modHeal?(c: Combat | null, s: HookSelf, amount: number): number;
  onCombatEnd?(c: Combat, s: HookSelf, won: boolean): void;
  /** 사망 직전 — true 반환 시 사망 취소 */
  onLethal?(c: Combat, s: HookSelf, d: DamageCtx): boolean;
  /** 누군가 죽었을 때 (모든 훅 소유자에게 전달) */
  onAnyDeath?(c: Combat, s: HookSelf, victim: Unit): void;
  /** 플레이어가 전투 중 선택지(CombatChoice)를 골랐을 때 (모든 훅 소유자에게 전달) */
  onChoice?(c: Combat, s: HookSelf, choice: string, option: string): void;
  /** 소유자 자신이 죽었을 때 (적 특성용) */
  onDeath?(c: Combat, s: HookSelf, d: DamageCtx | null): void;
  /** 스킬 AP 비용 보정 (반환값이 새 비용) */
  modCost?(c: Combat, s: HookSelf, def: SkillDef, cost: number): number;
  /** 스킬 쿨다운 보정 */
  modCd?(c: Combat, s: HookSelf, def: SkillDef, cd: number): number;
  /** 정신력 붕괴 시 */
  onBreakdown?(c: Combat | null, s: HookSelf): void;
}

// ───────────── 정의(콘텐츠) ─────────────

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  school: School;
  rarity: Rarity;
  /** 레벨별 AP 비용 */
  cost: number | number[];
  /** 레벨별 쿨다운 */
  cd: number | number[];
  range: Range;
  target: TargetMode;
  type?: DmgType;
  tags: string[];
  /** 레벨별 수치. dmg*, blk*, heal* 로 시작하는 키는 위력 배율 적용 */
  vals: Record<string, number | number[]>;
  /** {key} 수치, {D:key} 피해 미리보기, {B:key} 방어도 미리보기 */
  desc: string;
  run(c: Combat, u: SkillUse, target: EnemyUnit | null): void;
  /**
   * 턴마다 바뀌는 피해 속성 (굴절광처럼). 쓰는 순간(makeUse)의 SkillUse.type이 되어 피해 미리보기·카드·설명이 이번 턴의 속성을 쓴다
   * (각인이 속성을 바꾸면 그것이 먼저다)
   */
  typeNow?(c: Combat): DmgType;
  /** 사용 불가 사유 (없으면 null) */
  canUse?(c: Combat, u: SkillUse): string | null;
  /** 최대 레벨 (기본 1 = 1회 강화) */
  maxLvl?: number;
  /** 특정 출신/조건에서만 등장 */
  pool?: false;
  /** 이 스킬이 만드는 키워드 (상처의 문법 — 적에게 남기거나 나에게 쌓는 것, 정신력을 치르면 'sanity') */
  makes?: Keyword[];
  /** 이 스킬이 읽는 키워드 (그 수치·유무에 따라 효과가 바뀌거나 그것을 거둔다). 남의 계열 키워드를 읽으면 '계열을 잇는 기술' */
  reads?: Keyword[];
  /**
   * 예전 합기(合技)의 두 계열 짝. 보상 조건으로는 쓰지 않는다 (2026-10: 조건을 떼고 각자 계열 풀로 내려갔다).
   * 계열 판정(engine/schools.ts의 skillSchools)은 두 계열 모두로 친다 — '계열을 잇는 기술'. 나중에 융합으로 되살릴 자리
   */
  duo?: [School, School];
}

export interface SkillUse {
  def: SkillDef;
  owned: OwnedSkill;
  lvl: number;
  /** 수치 배율 (메아리, 절약 등) */
  power: number;
  /** 무기/방어구 기본기 여부 */
  basic?: 'weapon' | 'armor';
  echo?: boolean;
  /** 이번 사용의 주 대상 */
  primary: EnemyUnit | null;
  /** 각인 등으로 바뀐 피해 속성 */
  type?: DmgType;
  /** 이 사용으로 이미 때린 대상 uid (고정 가산 1회 규칙 — 엔진이 채운다) */
  struck?: string[];
  v(key: string): number;
}

export interface RuneDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  /** 장착 가능 여부 */
  fits?(skill: SkillDef): boolean;
  costMod?: number;
  cdMod?: number;
  powerMult?: number;
  hooks?: Hooks;
  /**
   * 계열 각인: 이 각인을 새긴 스킬은 이 계열로도 친다 (engine/schools.ts의 skillSchools — 틈을 열고 거둘 때 등).
   * 없으면 무계열 (메아리·흡혈·파급·가속·분쇄·절약·사냥·공명)
   */
  school?: School;
}

export interface EquipDef {
  id: string;
  name: string;
  icon: string;
  slot: 'weapon' | 'armor' | 'trinket';
  rarity: Rarity;
  /** 무기: 기본 공격 스킬 / 방어구: 기본 방어 스킬 */
  skill?: string;
  desc: string;
  maxHp?: number;
  hooks?: Hooks;
  price?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  hooks?: Hooks;
  /** 획득 즉시 효과 */
  onGain?(run: import('./run').RunState): void;
  /** 카운터 표시 */
  counter?: boolean;
  /**
   * 진화한 유물 (2026-10 성장 개편, 뱀파이어 서바이버즈의 무기 진화 참고): 이 두 유물을 함께 지니고 층 수호자를 쓰러뜨리면
   * 보상에 진화가 나온다 (두 유물을 내주고 이것을 얻는다). 보통 보상·상점에는 나오지 않는다
   */
  evolve?: [string, string];
}

export interface StatusDef {
  id: string;
  name: string;
  icon: string;
  kind: 'buff' | 'debuff';
  desc: string;
  /** 턴 종료 시 1씩 감소 */
  decay?: boolean;
  /** 음수 허용 (힘/민첩) */
  signed?: boolean;
  /** 전투 종료 후에도 유지되지 않음(기본) */
  hooks?: Hooks;
  hidden?: boolean;
}

/**
 * 연출 이름 — 적의 행동이 화면 전체에 일으키는 일 (src/ui/cinema.tsx가 그린다). 게임 규칙에는 영향이 없다.
 * text에는 {time} {hour} {deaths} {runs} {wins} {best} {origin} 을 쓸 수 있다 (진짜 시각·지금까지의 기록으로 바뀜)
 */
export type CineName =
  /** 화면 유리에 금이 간다 (n: 1~3 세기). 몇 초 뒤 사라진다 — 계속 남기려면 vars['ui:cracks'] */
  | 'crack'
  /** 전장 화면이 산산조각 났다가 다시 맞춰진다 (가장 큰 일격·형태 변화) */
  | 'shatter'
  /** 화면이 데이터처럼 깨지고 글자가 뒤섞인다 (n: 1~3 세기) */
  | 'glitch'
  /** 화면 가득 글자가 한 자씩 새겨진다 — 화면 너머의 당신에게 말을 건다 (text) */
  | 'whisper'
  /** 가짜 시스템 창 (text). 게임이 멈춘 듯하다가 사라진다 */
  | 'sysmsg'
  /** 가짜 게임 오버 화면 → 깨지며 돌아온다 (최종 보스급에만) */
  | 'fakeover'
  /** 화면을 덮는 거대한 눈이 떠서 당신의 손끝을 따라보다 감긴다 */
  | 'eye'
  /** 먹물이 화면 가장자리에서 밀려들었다 빠진다 */
  | 'ink'
  /** 화면 유리에 붉은 손글씨 (text) */
  | 'scrawl'
  /** 화면 안쪽에서 손바닥이 유리를 친다 (n: 개수) */
  | 'handprints'
  /** 화면이 뒤집혔다 돌아온다 */
  | 'flip'
  /** 색이 빠지며 시간이 멎었다 다시 흐른다 */
  | 'timestop'
  /** 화면이 한 점(uid)으로 빨려 들어가듯 일그러진다 */
  | 'blackhole'
  /** 화면 네 모서리에서 이빨·발톱이 튀어나온다 */
  | 'corners'
  /** 물이 화면 아래에서 차올랐다 빠진다 */
  | 'water'
  /** 종소리 — 동심원 파동이 화면 전체를 흔든다 */
  | 'bell'
  /** 거대한 빛줄기가 화면을 가로질러 훑는다 */
  | 'beam'
  /** 벌레 떼가 화면 가장자리에서 기어 들어와 지나간다 */
  | 'swarm'
  /** 만화식 임팩트 프레임 (큰 일격 순간의 정지 + 집중선) */
  | 'impact'
  /** 즉사 (엔진의 executePlayer가 낸다) */
  | 'execute';

/**
 * 퍼즐 목표: 즉사기 등을 막는 방법을 화면 위 띠로 보여 주고, 봇도 이걸 보고 움직인다.
 * 판정·해제는 콘텐츠가 직접 한다 (엔진은 보관·표시만)
 */
export interface Objective {
  /** 띠에 띄울 문구 (예: '대종에 20 피해를 줘라 — 1턴 남음') */
  text: string;
  /** 이 적에게 need만큼 더 피해를 주면 풀린다 (콘텐츠가 need를 줄여 간다) */
  hit?: { uid: string; need: number };
  /** 이 적을 붕괴시키면 풀린다 */
  break?: string;
  /** 내 턴을 이 방어도 이상으로 마치면 풀린다 */
  block?: number;
  /** 이 속성으로 차례대로 맞히면 풀린다 (남은 것만, 앞에서부터) */
  types?: DmgType[];
  /** 이번 턴 아무것도 하지 않으면 풀린다 */
  quiet?: boolean;
  /** 이 적들을 모두 쓰러뜨리면 풀린다 */
  kill?: string[];
  /** 못 막으면 즉사 (붉은 해골 띠). 없으면 큰 대가를 치르는 위협 (호박색 띠) — 즉사기는 엘리트 1~2종·수호자 1종에만 */
  lethal?: boolean;
  /** 못 막으면 일어나는 일 (띠를 누르면 보이는 설명, 예: '최대 체력의 30% 피해') */
  fail?: string;
}

/**
 * 전투 중 선택지 (최종 보스의 「탄생」 등) — 콘텐츠가 `Combat.offerChoice`로 건다.
 * 고르기 전에는 기술·소모품·턴 종료가 막히고, 고르면 모든 훅 소유자의 onChoice가 불린다.
 */
export interface CombatChoice {
  /** onChoice가 구분할 이름 */
  id: string;
  /** 대화창 제목 */
  title: string;
  /** 본문 */
  text?: string;
  /** 묻는 적 (연출 기준) */
  by?: string;
  options: {
    id: string;
    label: string;
    desc: string;
    icon?: string;
    /** 봇이 고르는 우선순위 (클수록 먼저, 콘텐츠가 걸 때 상황에 맞춰 정한다) */
    bot?: number;
  }[];
}

export interface MoveDef {
  name: string;
  intent: IntentKind;
  /** 필살기: 쓸 때 화면 가득 기술 이름이 지나간다 (컷인) */
  ultimate?: boolean;
  /** 이 행동을 할 때 함께 트는 연출 (세기·글자가 필요하면 { name, n, text }) */
  cine?: CineName | { name: CineName; n?: number; text?: string };
  /**
   * 의도를 속인다: 통찰이 reveal(기본 DISGUISE_REVEAL = 3) 미만이면 의도가 이것으로 보인다 (실제로는 원래 행동을 한다).
   * 들키면 진짜 의도가 보인다
   */
  disguise?: { kind: IntentKind; label: string; dmg?: number; hits?: number; reveal?: number; desc?: string };
  extra?: IntentKind[];
  /** 기본 피해. 함수면 의도를 정할 때 계산 */
  dmg?: number | ((c: Combat, e: EnemyUnit) => number);
  hits?: number | ((c: Combat, e: EnemyUnit) => number);
  sanity?: number;
  melee?: boolean;
  hidden?: boolean;
  charging?: boolean;
  /** 힘을 모으는 행동이면, 다음 차례에 쓸 일격의 이름 (의도 설명에 — 없으면 같은 피해의 공격을 찾는다) */
  follow?: string;
  desc?: string;
  run(c: Combat, e: EnemyUnit): void;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  act: number;
  tier: 'normal' | 'elite' | 'boss' | 'minion';
  hp: [number, number];
  poise: number;
  /**
   * 붕괴했을 때: stun 행동을 건너뛰는 횟수, vuln 붕괴 중 받는 피해 배율.
   * 없으면 등급 기본값 (engine/combat.ts의 BREAK — 일반은 오래 쉬고, 수호자는 짧게 끊기는 대신 더 아프다)
   */
  brk?: { stun?: number; vuln?: number };
  weak: DmgType[];
  resist?: Partial<Record<DmgType, number>>;
  row?: 0 | 1;
  /** 처음 마주쳤을 때 정신 피해 */
  dread?: number;
  eldritch?: boolean;
  traits?: string[];
  /** 분류 태그 (예: 'cult', 'ash', 'beast', 'dream', 'star', 'undead') — 층의 법칙·패시브가 참조 */
  tags?: string[];
  moves: Record<string, MoveDef>;
  /** 다음 행동 결정 */
  ai(c: Combat, e: EnemyUnit): string;
  onSpawn?(c: Combat, e: EnemyUnit): void;
  visual: EnemyVisual;
  /** 변신 후 모습 */
  forms?: { name: string; icon: string; visual: EnemyVisual }[];
  desc?: string;
  /**
   * 기믹 물건(등명기·대종·탯줄 등): 후열에 있어도 근접 공격이 닿는다.
   * 깨야 풀리는 기믹이 근접 직업에게만 불리하지 않게 — 퍼즐 목표의 대상(setObjective)은 이 표시 없이도 닿는다
   */
  reachable?: boolean;
}

export interface EnemyVisual {
  tint: number;
  /** 보조 색 (글로우/눈) */
  glow?: number;
  scale?: number;
  fx?: string[];
}

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  hooks: Hooks;
}

export interface EncounterDef {
  id: string;
  act: number;
  kind: 'normal' | 'elite' | 'boss';
  /** 초반(막의 첫 3전투) 전용 쉬운 조합 */
  early?: boolean;
  weight?: number;
  /** 층 구역 태그 (해당 구역에서 더 자주 등장) */
  zone?: string;
  enemies: { id: string; row?: 0 | 1 }[];
  anomaly?: string;
  /** 보스 BGM/연출 키 */
  theme?: string;
}
