import { MADNESS } from './registry';
import type { Combat } from './combat';
import type { FloorState } from './dungeon';
import type { RunState } from './run';
import type { EnemyUnit, Hooks, HookSelf, Unit } from './types';

/*
 * 심연 단계 (0~15) — 난이도 사다리. 단계를 하나 올릴 때마다 규칙이 정확히 하나씩 쌓인다 (슬레이 더 스파이어 승천처럼).
 * 판을 이기면 그 단계 + 1이 열린다 (state/meta.ts absorbRun). 처음엔 0단계만 열려 있다.
 *  - 보통 단계: 수치나 규칙 하나 (적 피해·체력, 등불, 상점 값, 회복, 시작 자원, 골드, 정수, 수호자, 정수 자리, 어둠 속 기습)
 *  - 5·10·15단계: 판의 흐름을 바꾸는 특별한 규칙 — 구현은 content/abyss.ts가 ABYSS_RULES에 등록한다
 *    5 아래의 목소리(층마다 광기 하나) · 10 두 번째 모습(수호자가 한 번 다시 일어선다) · 15 물러나지 않는 조수(조수가 층을 넘어 이어진다)
 * 수치 규칙은 아래 getter로 엔진 곳곳에 연결한다 (combat·dungeon·run·shop·places). 단계 번호는 LV 하나에서만 정한다 (순서를 바꿀 때 여기만).
 * 시뮬레이터가 바꿔 볼 수 있게 수치는 ABYSS_TUNE에 모아 둔다 (설명 글도 이 값으로 만든다).
 * 봇 시뮬레이션(SIM_ASC, 판 80 × 출신 3 × 시드 묶음): 단계별 승률은 docs/GDD.md 9장.
 */

export const MAX_ASC = 15;

/** 규칙마다 켜지는 단계 */
export const LV = {
  /** 적의 공격 피해 */
  dmg: 1,
  /** 등불 소모 */
  light: 2,
  /** 상점 값 */
  shop: 3,
  /** 야영지 수면 회복 */
  sleep: 4,
  /** ★ 아래의 목소리 */
  voice: 5,
  /** 시작 자원 없음 */
  start: 6,
  /** 적의 체력 */
  hp: 7,
  /** 수호자 전투의 적 공격 피해 */
  bossDmg: 8,
  /** 정예·수호자 체력 */
  eliteHp: 9,
  /** ★★ 두 번째 모습 */
  rise: 10,
  /** 전투 골드 */
  gold: 11,
  /** 어둠 속 기습: 행동력 -1 대신 적이 먼저 움직인다 */
  ambush: 12,
  /** 정수 확률 */
  essence: 13,
  /** 정수 자리 (한 칸이 커서 승률이 낮은 뒤쪽 단계로 — 12단계에 두면 한 단계에 7%p 넘게 꺾였다) */
  slots: 14,
  /** ★★★ 물러나지 않는 조수 */
  tide: 15,
} as const;

/** 규칙별 수치 (밸런스 조절용) */
export const ABYSS_TUNE = {
  /** 적의 공격 피해 가산 */
  enemyDmg: 0.1,
  /** 상점 값 가산 */
  shop: 0.2,
  /** 야영지 수면 회복 (최대 체력 비율, 원래 places.ts SLEEP_HEAL 30%) */
  sleep: 0.2,
  /** 적의 체력 가산 (2026-10 최종 밸런스: 10%면 7단계에서 한 단계에 9%p 꺾였다) */
  enemyHp: 0.05,
  /** 이동마다 더 닳는 등불 (2026-10 최종 밸런스: 2면 2단계에서 5%p 넘게 꺾였다) */
  light: 1,
  /** 전투에서 얻는 골드 배율 */
  gold: 0.75,
  /** 일반 적·정예의 정수 확률 배율 */
  essenceDrop: 0.7,
  /** 다시 일어선 수호자의 체력 (최대 체력 비율). 힘은 더하지 않는다 (규칙을 한 줄로). 2026-10 최종 밸런스: 20%면 10단계에서 한 단계에 8%p 꺾였다 */
  riseHp: 0.1,
  riseStr: 0,
  /** 수호자 전투의 적 공격 피해 가산 */
  bossDmg: 0.1,
  /** 줄어드는 정수 자리 */
  slots: 1,
  /** 정예·수호자 체력 가산 */
  eliteBossHp: 0.1,
  /** 새 층이 이어받는 지난 층 조수의 비율 (내림) */
  tideCarry: 0.5,
};

const T = ABYSS_TUNE;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface AbyssLevel {
  n: number;
  name: string;
  icon: string;
  /** 한눈에 읽는 한 줄 (단계 고르기 목록) */
  short: string;
  /** 규칙 설명: 한두 문장, 짧은 명사형 (마지막 문장 끝에는 마침표를 찍지 않는다) */
  desc: string;
  /** 특별한 단계 (5: 1, 10: 2, 15: 3) */
  star?: 1 | 2 | 3;
}

/** 단계표 (설명은 지금 수치로 만든다). 규칙은 모두 한 줄로 이해되는 것만 둔다 */
export function abyssTable(): AbyssLevel[] {
  const levels: AbyssLevel[] = [
    { n: LV.dmg, name: '굶주린 것들', icon: 'gi:fangs', short: `적 공격 피해 +${pct(T.enemyDmg)}`, desc: `적의 공격 피해 +${pct(T.enemyDmg)}` },
    { n: LV.light, name: '기름 먹는 어둠', icon: 'gi:oil-drum', short: `등불 소모 +${T.light}`, desc: `이동할 때마다 등불 소모 +${T.light}` },
    { n: LV.shop, name: '값을 올린 상인', icon: 'gi:price-tag', short: `상점 가격 +${pct(T.shop)}`, desc: `상점 가격 +${pct(T.shop)}` },
    { n: LV.sleep, name: '얕은 잠', icon: 'gi:sleepy', short: `수면 회복 30% → ${pct(T.sleep)}`, desc: `야영지 수면 회복이 최대 체력의 30%에서 ${pct(T.sleep)}로` },
    { n: LV.voice, name: '아래의 목소리', icon: 'gi:sound-waves', star: 1, short: '층마다 광기 하나', desc: '층마다 광기 하나가 걸린다. 그 층을 떠나면 사라진다' },
    { n: LV.start, name: '빈손', icon: 'gi:open-palm', short: '시작 골드·소모품 없음', desc: '시작 골드와 시작 소모품 없음' },
    { n: LV.hp, name: '질긴 것들', icon: 'gi:heart-tower', short: `적 체력 +${pct(T.enemyHp)}`, desc: `적의 체력 +${pct(T.enemyHp)}` },
    { n: LV.gold, name: '인색한 심연', icon: 'gi:two-coins', short: `전투 골드 -${pct(1 - T.gold)}`, desc: `전투에서 얻는 골드 -${pct(1 - T.gold)}` },
    { n: LV.essence, name: '옅어진 정수', icon: 'gi:broken-pottery', short: `정수 드롭 -${pct(1 - T.essenceDrop)}`, desc: `일반 적과 정예의 정수 드롭 확률 -${pct(1 - T.essenceDrop)}` },
    {
      n: LV.rise,
      name: '두 번째 모습',
      icon: 'gi:grasping-claws',
      star: 2,
      short: '수호자가 한 번 되살아남',
      desc: `층 수호자와 계층군주는 처음 쓰러지면 체력 ${pct(T.riseHp)}로 한 번 다시 일어선다. 최종 수호자는 제외`,
    },
    { n: LV.bossDmg, name: '사나운 수호자', icon: 'gi:crowned-skull', short: `수호자 공격 피해 +${pct(T.bossDmg)}`, desc: `수호자 전투에서 적의 공격 피해 +${pct(T.bossDmg)}` },
    { n: LV.slots, name: '좁아진 그릇', icon: 'gi:gem-chain', short: `정수 자리 -${T.slots}`, desc: `정수 자리 -${T.slots}` },
    { n: LV.ambush, name: '어둠 속의 것들', icon: 'gi:evil-eyes', short: '어둠 속 기습이면 적이 먼저', desc: '어둠 속에서 기습당하면 행동력 -1 대신 적이 먼저 한 번 움직인다' },
    { n: LV.eliteHp, name: '완고한 것들', icon: 'gi:skull-shield', short: `정예·수호자 체력 +${pct(T.eliteBossHp)}`, desc: `정예와 수호자의 체력 +${pct(T.eliteBossHp)}` },
    { n: LV.tide, name: '물러나지 않는 조수', icon: 'gi:big-wave', star: 3, short: '조수가 다음 층으로 이어짐', desc: `층을 내려가도 조수가 다 빠지지 않는다. 새 층은 지난 층 조수의 ${T.tideCarry === 0.5 ? '절반' : pct(T.tideCarry)}에서 시작한다` },
  ];
  return levels.sort((a, b) => a.n - b.n);
}

export const ABYSS_LEVELS: readonly AbyssLevel[] = abyssTable();

export function abyssLevel(n: number): AbyssLevel | undefined {
  return ABYSS_LEVELS.find((l) => l.n === n);
}

/** 이 단계에서 켜지는 규칙 전부 (1단계부터 차례로) */
export function abyssActive(asc: number): AbyssLevel[] {
  return ABYSS_LEVELS.filter((l) => l.n <= asc);
}

/** 이 판이 n단계 이상인가 (예전 저장에는 asc가 없을 수 있다) */
export function ascAt(run: { asc?: number } | null | undefined, n: number): boolean {
  return (run?.asc ?? 0) >= n;
}

// ───────────── 수치 규칙 (엔진 연결) ─────────────

/** 적의 공격 피해 배율 (combat.ts computeDamage): 모든 전투 + 수호자 전투 */
export function abyssDmgMult(run: RunState, kind: 'normal' | 'elite' | 'boss'): number {
  let m = 1;
  if (ascAt(run, LV.dmg)) m *= 1 + T.enemyDmg;
  if (ascAt(run, LV.bossDmg) && kind === 'boss') m *= 1 + T.bossDmg;
  return m;
}

/** 적의 체력 배율 (combat.ts spawn): 모든 적 + 정예·수호자 */
export function abyssHpMult(run: RunState, tier: 'normal' | 'elite' | 'boss' | 'minion'): number {
  let m = 1;
  if (ascAt(run, LV.hp)) m += T.enemyHp;
  if (ascAt(run, LV.eliteHp) && (tier === 'elite' || tier === 'boss')) m += T.eliteBossHp;
  return m;
}

/** 어둠 속 기습에 적이 먼저 움직이는가 (run.ts startCombat → Combat.begin firstStrike). 아니면 원래대로 행동력 -1 */
export function abyssAmbushStrike(run: RunState): boolean {
  return ascAt(run, LV.ambush);
}

/** 상점 값 배율 (shop.ts price) */
export function abyssShopMult(run: RunState): number {
  return ascAt(run, LV.shop) ? 1 + T.shop : 1;
}

/** 야영지 수면 회복 비율 (places.ts sleepHeal) */
export function abyssSleep(run: RunState, base: number): number {
  return ascAt(run, LV.sleep) ? Math.min(base, T.sleep) : base;
}

/** 시작 자원 (run.ts newRun — 출신의 골드·소모품을 받은 뒤) */
export function abyssStart(run: RunState) {
  if (!ascAt(run, LV.start)) return;
  run.player.gold = 0;
  run.consumables = run.consumables.map(() => null);
}

/** 이동마다 더 닳는 등불 (dungeon.ts lightCost) */
export function abyssLightExtra(run: RunState): number {
  return ascAt(run, LV.light) ? T.light : 0;
}

/** 일반 적·정예의 정수 확률 배율 (run.ts rollEssenceDrops) */
export function abyssEssenceDrop(run: RunState, tier: string): number {
  return ascAt(run, LV.essence) && (tier === 'normal' || tier === 'elite') ? T.essenceDrop : 1;
}

/** 줄어드는 정수 자리 (run.ts essenceCap) */
export function abyssSlotCut(run: RunState): number {
  return ascAt(run, LV.slots) ? T.slots : 0;
}

/** 전투에서 얻는 골드 배율 (run.ts finishCombat) */
export function abyssGold(run: RunState): number {
  return ascAt(run, LV.gold) ? T.gold : 1;
}

// ───────────── 특별한 규칙 (content/abyss.ts가 등록) ─────────────

/** 판에 남는 심연 상태 (JSON 저장). 예전 저장에는 없다 */
export interface AbyssState {
  /** 아래의 목소리: 지금 층에서 들리는 목소리 (광기 id) */
  whisper?: string;
  /** 이 판에서 이미 들은 목소리 (층마다 다른 목소리) */
  heard?: string[];
}

export interface AbyssRule {
  /** 이 단계부터 켜진다 */
  n: number;
  /** 전투 중 훅 — 층의 법칙처럼 나와 모든 적에게 걸린다 (s.unit이 그 주인) */
  hooks?: Hooks;
  /** 새 층에 들어선 직후 (prev: 떠나온 층, 첫 층이면 null) */
  floor?(run: RunState, f: FloorState, prev: FloorState | null): void;
  /** 적이 쓰러지는 순간 (특성의 죽음 처리보다 먼저). true면 다시 일어서서 쓰러지지 않은 것이 된다 */
  rise?(c: Combat, e: EnemyUnit): boolean;
}

export const ABYSS_RULES: AbyssRule[] = [];

/** 전투 훅 소스 (combat.ts Combat.sources) — 단계 규칙, 그리고 아래의 목소리(나에게만 걸리는 광기) */
export function* abyssSources(run: RunState, owner: Unit | 'all', p: Unit): Generator<[Hooks, HookSelf]> {
  if (!run.asc) return;
  const unit = owner === 'all' ? p : owner;
  for (const r of ABYSS_RULES) if (r.hooks && run.asc >= r.n) yield [r.hooks, { kind: 'anomaly', id: `abyss${r.n}`, unit, n: run.asc }];
  if (owner === 'all' || owner === p) yield* abyssWhisper(run);
}

/** 아래의 목소리: 지금 들리는 목소리의 광기 훅 (전투 밖 정신력 손실에도 걸린다 — run.ts runHooks) */
export function* abyssWhisper(run: RunState): Generator<[Hooks, HookSelf]> {
  const id = run.abyss?.whisper;
  if (!id || !ascAt(run, LV.voice)) return;
  const d = MADNESS.get(id);
  if (d?.hooks) yield [d.hooks, { kind: 'madness', id, unit: run.player, n: 1 }];
}

/** 새 층에 들어섰다 (run.ts newRun · dungeon.ts descend) */
export function abyssFloor(run: RunState, f: FloorState, prev: FloorState | null) {
  if (!run.asc) return;
  for (const r of ABYSS_RULES) if (r.floor && run.asc >= r.n) r.floor(run, f, prev);
}

/** 적이 쓰러지는 순간 (combat.ts handleDeath) — true면 다시 일어섰다 */
export function abyssRise(c: Combat, e: EnemyUnit): boolean {
  if (!c.run.asc) return false;
  for (const r of ABYSS_RULES) if (r.rise && c.run.asc >= r.n && r.rise(c, e)) return true;
  return false;
}

/** 진행 중인 판의 심연 한 줄 (캐릭터 화면 상태 탭 등) */
export function abyssLine(run: RunState): string {
  const n = run.asc ?? 0;
  if (n <= 0) return '심연 0단계 · 기본 난이도';
  const w = ascAt(run, LV.voice) && run.abyss?.whisper ? MADNESS.get(run.abyss.whisper)?.name : undefined;
  return `심연 ${n}단계 · 규칙 ${n}개${w ? ` · 목소리 「${w}」` : ''}`;
}
