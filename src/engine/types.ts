import type { Combat } from './combat';

// ───────────── 기본 열거형 ─────────────

export type DmgType = 'slash' | 'pierce' | 'blunt' | 'fire' | 'arcane' | 'void';
export const DMG_TYPES: readonly DmgType[] = ['slash', 'pierce', 'blunt', 'fire', 'arcane', 'void'];

export type School = 'blade' | 'firearm' | 'occult' | 'alchemy' | 'resolve' | 'forbidden' | 'essence' | 'neutral';

export type Rarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'forbidden' | 'boss' | 'special';

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
  | 'special';

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
  /** 통찰 5 미만이면 ??? 로 표시 */
  hidden?: boolean;
  /** 차지 중 — 다음 행동이 강력 */
  charging?: boolean;
}

export interface EnemyUnit extends Unit {
  def: string;
  name: string;
  /** 0 전열, 1 후열 */
  row: 0 | 1;
  poise: number;
  maxPoise: number;
  /** 2: 방금 붕괴(다음 행동 취소), 1: 회복 중(받는 피해 증가), 0: 정상 */
  broken: number;
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
  /** 본질로 흡수: 기술을 배우지 않는 대신 능력치를 더 받는다 */
  core?: boolean;
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
  /** 이계 정수: 흡수 시 최대 정신력 -5, 통찰 +1 */
  eldritch?: boolean;
  /** 계층정수: 제거 불가 */
  lord?: boolean;
  /** 흡수 한도 추가 소모 */
  slotCost?: number;
  /** 드롭 가중치 조절 (기본 1) */
  dropMul?: number;
}

export interface OwnedItem {
  uid: string;
  id: string;
  /** 강화 단계 0~2 */
  lvl: number;
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
  kind: 'status' | 'relic' | 'equip' | 'perk' | 'madness' | 'trait' | 'anomaly' | 'rune' | 'essence';
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
  /** 배율 전 가산 */
  add: number;
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
  tags: string[];
  // 결과
  amount: number;
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

export interface Hooks {
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
  /** 사용 불가 사유 (없으면 null) */
  canUse?(c: Combat, u: SkillUse): string | null;
  /** 최대 레벨 (기본 1 = 1회 강화) */
  maxLvl?: number;
  /** 특정 출신/조건에서만 등장 */
  pool?: false;
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

export interface MoveDef {
  name: string;
  intent: IntentKind;
  extra?: IntentKind[];
  /** 기본 피해. 함수면 의도를 정할 때 계산 */
  dmg?: number | ((c: Combat, e: EnemyUnit) => number);
  hits?: number | ((c: Combat, e: EnemyUnit) => number);
  sanity?: number;
  melee?: boolean;
  hidden?: boolean;
  charging?: boolean;
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
