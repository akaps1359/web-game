import type {
  EncounterDef,
  EnemyDef,
  EquipDef,
  EssenceDef,
  Hooks,
  Rarity,
  RelicDef,
  RuneDef,
  School,
  SkillDef,
  StatusDef,
  TraitDef,
  Unit,
} from './types';
import type { Combat } from './combat';
import type { RunState } from './run';
import type { EventState } from './events';
import type { FloorState } from './dungeon';

export interface OriginDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  hp: number;
  sanity: number;
  gold: number;
  skills: string[];
  equip: { weapon?: string; armor?: string; trinket1?: string; trinket2?: string };
  relics?: string[];
  consumables?: string[];
  /** 보상 가중치를 받는 계열 */
  schools: School[];
  /** 해금 조건 설명 (없으면 기본 해금) */
  unlock?: string;
}

export interface EventChoice {
  label: string;
  /** 결과 힌트(회색 작은 글씨) */
  hint?: string;
  /** 선택 불가 사유 */
  disabled?: string | false | null;
  go(run: RunState, ev: EventState): void;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  /** 등장 층 */
  acts: number[];
  weight?: number;
  /** 조건 */
  when?(run: RunState): boolean;
  /** 단계별 본문과 선택지. 시작 단계는 'start' */
  stages: Record<string, (run: RunState, ev: EventState) => { text: string; choices: EventChoice[] }>;
}

export interface LordDef {
  id: string;
  name: string;
  enc: string;
  /** 조건 진척 시 경고 문구 (단계별) */
  warnings: string[];
  /**
   * 깨우는 조건의 힌트 (지도 위 「계층군주」 칩을 누르면 보인다 — 2026-10). 이야기 속 소문처럼, 그러나 무엇을 하면 되는지 알 수 있게.
   * 2~3줄
   */
  hints: string[];
  /** 진척도 목표 */
  goal: number;
  /** 층 이벤트마다 호출 → 진척도 증가량 반환 */
  progress(run: RunState, f: FloorState, e: FloorSignal): number;
}

export type FloorSignal =
  | { t: 'move'; room: number }
  | { t: 'combat'; enc: string; kind: 'normal' | 'elite' | 'boss' }
  | { t: 'tide'; tide: number }
  | { t: 'event'; id: string; choice?: string };

export interface FloorDef {
  act: number;
  name: string;
  /** 층의 법칙 설명 */
  law: string;
  /** 구역 이름 (1층 법칙) */
  zones?: { name: string; tag: string }[];
  /** 전투 중 적용되는 층의 법칙 훅 */
  hooks?: Hooks;
  /** 이동할 때마다 */
  onMove?(run: RunState, f: FloorState): void;
  /** 층 생성 직후 (침수된 방, 회복 반전 구역, 유성 낙하 지점 표시 등) */
  setup?(run: RunState, f: FloorState): void;
  /** 조우 시작 시 전장 규칙 추가 (예: 회복 반전 구역) — 반환한 anomaly id 적용 */
  roomAnomaly?(run: RunState, f: FloorState, roomId: number): string | null;
  /** 계층군주 (없으면 그 층에는 군주가 나타나지 않는다) */
  lord?: LordDef;
  /** 최종층 전용: 최종 수호자를 쓰러뜨렸을 때의 승리 문장 */
  victory?: string;
}

export interface ConsumableDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  /** 전투 중에만 사용 가능 */
  combat: boolean;
  target: 'self' | 'single' | 'all';
  use(run: RunState, c: Combat | null, target: Unit | null): void;
  price?: number;
}

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 핵심 특성(5/10/15레벨) */
  major?: boolean;
  /** 중복 획득 가능 */
  stack?: boolean;
  hooks?: Hooks;
  onGain?(run: RunState): void;
}

/** 장비 접사 (2026-10 성장 개편, content/growth/affixes.ts): 얻은 장비마다 무작위로 붙는다. 장착한 동안 훅이 돈다 */
export interface AffixDef {
  id: string;
  /** 장비 이름 앞에 붙는 말 (예: '날선') */
  name: string;
  icon: string;
  desc: string;
  /** 1: 어느 층에서나 · 2: 3층부터 */
  tier: 1 | 2;
  /** 붙을 수 있는 장비 칸 (없으면 모두) */
  slots?: ('weapon' | 'armor' | 'trinket')[];
  hooks?: Hooks;
}

/** 징조 (2026-10 성장 개편, content/growth/omens.ts): 보상을 고르지 않고 지나치면 받는다. 정해진 때에 한 번 이루어진다 */
export interface OmenDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

/** 계약의 한쪽 (2026-10 성장 개편, content/growth/pacts.ts): 저주는 몇 전투 동안, 그 뒤로 축복이 영원히 */
export interface PactPartDef {
  id: string;
  kind: 'curse' | 'boon';
  name: string;
  icon: string;
  desc: string;
  hooks?: Hooks;
  /** 축복이 이루어지는 순간 (최대 체력·힘 같은 영구 수치) */
  onGain?(run: RunState): void;
}

export interface MadnessDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 각성(긍정) */
  virtue?: boolean;
  hooks?: Hooks;
  onGain?(run: RunState): void;
}

export interface AnomalyDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  hooks: Hooks;
}

/**
 * 공용 규칙: 상태·장비 같은 주인 없이 모든 전투에 늘 걸리는 규칙 (예: 틈, content/gap.ts).
 * 층의 법칙처럼 나와 모든 적에게 걸리고(s.unit이 그 주인, kind 'anomaly'), 다른 훅들보다 뒤에 불린다
 */
export interface RuleDef {
  id: string;
  hooks: Hooks;
}

export const SKILLS = new Map<string, SkillDef>();
export const ENEMIES = new Map<string, EnemyDef>();
export const ENCOUNTERS: EncounterDef[] = [];
export const RELICS = new Map<string, RelicDef>();
export const EQUIPS = new Map<string, EquipDef>();
export const STATUSES = new Map<string, StatusDef & StatusTicks>();
export const RUNES = new Map<string, RuneDef>();
export const TRAITS = new Map<string, TraitDef>();
export const CONSUMABLES = new Map<string, ConsumableDef>();
export const PERKS = new Map<string, PerkDef>();
export const MADNESS = new Map<string, MadnessDef>();
export const ANOMALIES = new Map<string, AnomalyDef>();
export const ESSENCES = new Map<string, EssenceDef>();
export const EVENTS = new Map<string, EventDef>();
export const ORIGINS = new Map<string, OriginDef>();
export const FLOORS = new Map<number, FloorDef>();
export const RULES = new Map<string, RuleDef>();
export const AFFIXES = new Map<string, AffixDef>();
export const OMENS = new Map<string, OmenDef>();
export const PACTS = new Map<string, PactPartDef>();

export interface StatusTicks {
  /** 소유자 턴 시작 시 */
  tickStart?(c: Combat, u: Unit, n: number): void;
  /** 소유자 턴 종료 시 (decay 처리 전) */
  tickEnd?(c: Combat, u: Unit, n: number): void;
}

function addAll<T extends { id: string }>(map: Map<string, T>, defs: T[]) {
  for (const d of defs) {
    if (map.has(d.id)) throw new Error(`중복 id: ${d.id}`);
    map.set(d.id, d);
  }
}

export const reg = {
  skills: (d: SkillDef[]) => addAll(SKILLS, d),
  enemies: (d: EnemyDef[]) => addAll(ENEMIES, d),
  encounters: (d: EncounterDef[]) => ENCOUNTERS.push(...d),
  relics: (d: RelicDef[]) => addAll(RELICS, d),
  equips: (d: EquipDef[]) => addAll(EQUIPS, d),
  statuses: (d: (StatusDef & StatusTicks)[]) => addAll(STATUSES, d),
  runes: (d: RuneDef[]) => addAll(RUNES, d),
  traits: (d: TraitDef[]) => addAll(TRAITS, d),
  consumables: (d: ConsumableDef[]) => addAll(CONSUMABLES, d),
  perks: (d: PerkDef[]) => addAll(PERKS, d),
  madness: (d: MadnessDef[]) => addAll(MADNESS, d),
  anomalies: (d: AnomalyDef[]) => addAll(ANOMALIES, d),
  essences: (d: EssenceDef[]) => addAll(ESSENCES, d),
  events: (d: EventDef[]) => addAll(EVENTS, d),
  origins: (d: OriginDef[]) => addAll(ORIGINS, d),
  rules: (d: RuleDef[]) => addAll(RULES, d),
  affixes: (d: AffixDef[]) => addAll(AFFIXES, d),
  omens: (d: OmenDef[]) => addAll(OMENS, d),
  pacts: (d: PactPartDef[]) => addAll(PACTS, d),
  floors: (d: FloorDef[]) => {
    for (const f of d) FLOORS.set(f.act, f);
  },
};

export function need<T>(map: Map<string, T>, id: string, what: string): T {
  const v = map.get(id);
  if (!v) throw new Error(`알 수 없는 ${what}: ${id}`);
  return v;
}
