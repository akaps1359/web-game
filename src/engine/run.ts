import { Rng, deriveSeed } from './rng';
import { Combat, BREAKDOWN_RESET, rollMadness, type CombatEvent, type CombatState } from './combat';
import {
  CONSUMABLES,
  ENCOUNTERS,
  ENEMIES,
  EQUIPS,
  ESSENCES,
  FLOORS,
  MADNESS,
  ORIGINS,
  PERKS,
  RELICS,
  RUNES,
  SKILLS,
  need,
} from './registry';
import type {
  EquipSlot,
  EssenceStats,
  HookSelf,
  Hooks,
  OwnedEssence,
  OwnedItem,
  OwnedRelic,
  OwnedSkill,
  PlayerState,
  Rarity,
} from './types';
import { generateFloor, floorSignal, type FloorState } from './dungeon';
import type { EventState } from './events';
import type { ShopState } from './shop';

/** 저장 형식 버전. 층 구성이 바뀌면 올린다 (이전 판은 이어하기 불가) — 2: 3층/5층 개편, 5층이 정식 탐험 층으로 */
export const SAVE_VERSION = 2;

/** 마지막 층. 이 층의 수호자(포탈 비석)를 쓰러뜨리면 승리 */
export const FINAL_ACT = 5;

export type Screen =
  | 'dungeon'
  | 'combat'
  | 'reward'
  | 'event'
  | 'camp'
  | 'merchant'
  | 'shrine'
  | 'haven'
  | 'gameover'
  | 'victory';

export type LootKind = 'skill' | 'relic' | 'equip' | 'rune' | 'consumable' | 'gold' | 'oil' | 'essence' | 'upgrade';

export interface LootItem {
  kind: LootKind;
  id: string;
  n?: number;
  color?: number;
  guardian?: boolean;
  taken?: boolean;
  /** 정수를 흡수하지 않고 병에 담았다 */
  bottled?: boolean;
}

export interface RewardState {
  source: 'normal' | 'elite' | 'boss' | 'rift' | 'lord' | 'treasure' | 'event' | 'stalker';
  gold: number;
  xp: number;
  /** 개별로 가져가는 것들 (정수는 흡수/포기 선택) */
  items: LootItem[];
  /** 하나만 고르는 전리품 */
  choice: LootItem[] | null;
  chosen: boolean;
  next: 'dungeon' | 'haven' | 'rift' | 'final';
}

export interface RiftRun {
  room: number;
  stage: number;
  rule: string;
  encs: string[];
}

export interface RunStats {
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
  sanityLost: number;
  skillsUsed: number;
  breaks: number;
  combats: number;
  elites: number;
  bosses: number;
  rooms: number;
  hours: number;
  dyingCount: number;
  essences: number;
  startedAt: number;
  playMs: number;
}

export interface RunState {
  v: number;
  seed: number;
  rng: Record<string, number>;
  origin: string;
  asc: number;
  act: number;
  floor: FloorState | null;
  player: PlayerState;
  skills: OwnedSkill[];
  slots: (string | null)[];
  essences: OwnedEssence[];
  equip: Record<EquipSlot, OwnedItem | null>;
  bag: OwnedItem[];
  relics: OwnedRelic[];
  consumables: (string | null)[];
  runes: string[];
  perks: string[];
  madness: string[];
  /** 등불 0~100 */
  light: number;
  screen: Screen;
  combat: CombatState | null;
  reward: RewardState | null;
  event: EventState | null;
  shop: ShopState | null;
  rift: RiftRun | null;
  seen: string[];
  /** 종별 처치 수 (도감식 경험치) */
  killed: Record<string, number>;
  essenceRemovals: number;
  /** 정수 병: 전투 뒤 바로 흡수하지 않고 담아 둔 정수 (신전·거점 신전에서 골드를 내고 새긴다). 예전 저장에는 없다 */
  flasks?: EssenceDrop[];
  /** 거점 여관 사용 여부 */
  innUsed: boolean;
  /** 이번 거점에서 훈련장 강화를 했는가 (거점마다 한 번) */
  trainUsed?: boolean;
  stats: RunStats;
  uidN: number;
  log: string[];
  over: { won: boolean; reason: string } | null;
  /** 메타: 이 판에서 새로 알게 된 약점 등 */
  learned: { weak: Record<string, string[]> };
  /** 도감에서 이어받은 약점 지식 */
  knownWeak: Record<string, string[]>;
}

export const MAX_SLOTS = 7;
export const BAG_SIZE = 8;
export const ACT_MULT = [1, 1, 1.5, 2, 2.5, 3];

// ───────────── 생성 ─────────────

export function newRun(opts: { seed?: number; origin: string; asc?: number; knownWeak?: Record<string, string[]> }): RunState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const origin = need(ORIGINS, opts.origin, '출신');
  const rng: Record<string, number> = {};
  for (const k of ['map', 'combat', 'loot', 'event', 'misc']) rng[k] = deriveSeed(seed, k);
  const run: RunState = {
    v: SAVE_VERSION,
    seed,
    rng,
    origin: origin.id,
    asc: opts.asc ?? 0,
    act: 1,
    floor: null,
    player: {
      uid: 'p',
      hp: origin.hp,
      maxHp: origin.hp,
      block: 0,
      st: {},
      sanity: origin.sanity,
      maxSanity: origin.sanity,
      insight: 0,
      gold: origin.gold,
      level: 1,
      xp: 0,
      maxAp: 3,
      str: 0,
      dex: 0,
      will: 0,
    },
    skills: [],
    slots: [null, null, null, null],
    essences: [],
    equip: { weapon: null, armor: null, trinket1: null, trinket2: null },
    bag: [],
    relics: [],
    consumables: [null, null, null],
    runes: [],
    perks: [],
    madness: [],
    light: 100,
    screen: 'dungeon',
    combat: null,
    reward: null,
    event: null,
    shop: null,
    rift: null,
    seen: [],
    killed: {},
    essenceRemovals: 0,
    flasks: [],
    innUsed: false,
    stats: {
      kills: 0,
      dmgDealt: 0,
      dmgTaken: 0,
      sanityLost: 0,
      skillsUsed: 0,
      breaks: 0,
      combats: 0,
      elites: 0,
      bosses: 0,
      rooms: 0,
      hours: 0,
      dyingCount: 0,
      essences: 0,
      startedAt: Date.now(),
      playMs: 0,
    },
    uidN: 0,
    log: [],
    over: null,
    learned: { weak: {} },
    knownWeak: opts.knownWeak ?? {},
  };
  // 시작 장비·스킬은 기본 템: 팔아도 0골드
  for (const id of origin.skills) {
    const s = learnSkill(run, id);
    if (s) s.starter = true;
  }
  for (const [slot, id] of Object.entries(origin.equip)) {
    if (id) run.equip[slot as EquipSlot] = { uid: uid(run), id, lvl: 0, starter: true };
  }
  for (const id of origin.relics ?? []) gainRelic(run, id);
  for (const id of origin.consumables ?? []) addConsumable(run, id);
  run.floor = generateFloor(run, 1);
  return run;
}

export function uid(run: RunState): string {
  return `u${++run.uidN}`;
}

export function rng(run: RunState, stream: 'map' | 'combat' | 'loot' | 'event' | 'misc'): Rng {
  return new Rng(run.rng, stream);
}

export function log(run: RunState, msg: string) {
  run.log.push(msg);
  if (run.log.length > 40) run.log.shift();
}

// ───────────── 레벨 / 경험치 ─────────────

export function xpToNext(level: number): number {
  return 20 + 20 * (level - 1);
}

/** 레벨업 횟수 반환 */
export function gainXp(run: RunState, n: number): number {
  const p = run.player;
  p.xp += Math.max(0, Math.round(n));
  let ups = 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    ups++;
    p.maxHp += 2;
    p.hp += 2;
    const cap = MAX_SLOTS + (run.relics.some((r) => r.id === 'infinite-ring') ? 1 : 0);
    if ([3, 6, 9].includes(p.level) && run.slots.length < cap) run.slots.push(null);
    log(run, `레벨 ${p.level} — 정수 흡수 한도 ${essenceCap(run)}`);
  }
  return ups;
}

/** 종족별 처치 경험치 (첫 처치 1.5배, 이후 0.4배) */
export function killXp(run: RunState, defId: string): number {
  const def = ENEMIES.get(defId);
  if (!def) return 0;
  const base = { normal: 6, elite: 18, boss: 40, minion: 1 }[def.tier];
  const first = !run.killed[defId];
  run.killed[defId] = (run.killed[defId] ?? 0) + 1;
  return base * ACT_MULT[Math.min(run.act, 5)] * (first ? 1.5 : 0.4);
}

// ───────────── 스킬 ─────────────

export function learnSkill(run: RunState, id: string, from?: string): OwnedSkill | null {
  need(SKILLS, id, '스킬');
  if (run.skills.some((s) => s.id === id)) return null;
  const s: OwnedSkill = { uid: uid(run), id, lvl: 0, runes: [], from };
  run.skills.push(s);
  const empty = run.slots.indexOf(null);
  if (empty >= 0) run.slots[empty] = s.uid;
  return s;
}

export function equipSkill(run: RunState, slot: number, skillUid: string | null) {
  if (slot < 0 || slot >= run.slots.length) return;
  if (skillUid) {
    const cur = run.slots.indexOf(skillUid);
    if (cur >= 0) run.slots[cur] = run.slots[slot];
  }
  run.slots[slot] = skillUid;
}

export function canUpgradeSkill(run: RunState, s: OwnedSkill): boolean {
  const def = SKILLS.get(s.id);
  return !!def && s.lvl < (def.maxLvl ?? 1);
}

export function upgradeSkill(run: RunState, skillUid: string): boolean {
  const s = run.skills.find((x) => x.uid === skillUid);
  if (!s || !canUpgradeSkill(run, s)) return false;
  s.lvl++;
  return true;
}

export function socketRune(run: RunState, skillUid: string, runeIdx: number): boolean {
  const s = run.skills.find((x) => x.uid === skillUid);
  const runeId = run.runes[runeIdx];
  if (!s || !runeId) return false;
  const rune = RUNES.get(runeId);
  const def = SKILLS.get(s.id);
  if (!rune || !def || (rune.fits && !rune.fits(def))) return false;
  if (s.runes.length >= 1) run.runes.push(...s.runes.splice(0));
  s.runes.push(runeId);
  run.runes.splice(run.runes.indexOf(runeId), 1);
  return true;
}

// ───────────── 정수 ─────────────

export function essenceCap(run: RunState): number {
  return Math.max(1, run.player.level - (run.relics.some((r) => r.id === 'infinite-ring') ? 1 : 0));
}

export function essenceUsed(run: RunState): number {
  return run.essences.reduce((sum, e) => sum + (ESSENCES.get(e.id)?.slotCost ?? 1), 0);
}

/**
 * 본질로 흡수하면 기술 대신 최대 체력을 더 받는다 (등급이 높을수록 많이).
 * 힘·민첩을 늘리면 피해가 눈덩이처럼 불어나 체력으로만 보상한다.
 */
export const CORE_HP = { base: 2.5, step: 0.75 };

export function coreHp(grade: number, guardian = false): number {
  return Math.round((CORE_HP.base + CORE_HP.step * Math.max(0, 9 - grade)) * (guardian ? 1.5 : 1));
}

export function essenceStats(id: string, guardian = false, core = false): EssenceStats {
  const def = need(ESSENCES, id, '정수');
  const out: EssenceStats = {};
  for (const [k, v] of Object.entries(def.stats)) {
    // 최대 체력 보너스는 60%만 (체력 인플레이션 억제)
    const base = k === 'maxHp' ? (v as number) * 0.6 : (v as number);
    out[k as keyof EssenceStats] = Math.round(base * (guardian ? 1.5 : 1));
  }
  if (core) out.maxHp = (out.maxHp ?? 0) + coreHp(def.grade, guardian);
  return out;
}

/** 이 정수가 주는(줄) 기술. 본질로 흡수했으면 없다 */
export function essenceActives(drop: { id: string; color: number; guardian?: boolean; core?: boolean }): string[] {
  const def = ESSENCES.get(drop.id);
  if (!def || drop.core) return [];
  return drop.guardian ? def.actives : [def.actives[drop.color]];
}

/** 흡수 불가 사유 */
export function absorbBlock(run: RunState, drop: EssenceDrop, core = false): string | null {
  if (!drop.guardian) core = true;
  const def = ESSENCES.get(drop.id);
  if (!def) return '알 수 없는 정수';
  const same = run.essences.find((e) => e.id === drop.id);
  if (same) {
    if (drop.guardian && !same.guardian) return null; // 수호자 정수로 승급
    return '같은 존재의 정수를 이미 흡수했다';
  }
  // 계층정수는 판당 하나뿐 (지울 수도 없다)
  if (def.lord && run.essences.some((e) => ESSENCES.get(e.id)?.lord)) return '계층정수는 판당 하나뿐이다';
  // 기술이 겹치면 안 된다 (본질로 흡수한 정수는 기술이 없으니 상관없다)
  const actives = essenceActives({ ...drop, core });
  for (const e of run.essences) {
    if (essenceActives(e).some((a) => actives.includes(a))) return '같은 능력을 주는 정수가 있다';
  }
  if (essenceUsed(run) + (def.slotCost ?? 1) > essenceCap(run)) return `흡수 한도 초과 (레벨 ${run.player.level})`;
  return null;
}

function applyStats(run: RunState, st: EssenceStats, sign: 1 | -1) {
  const p = run.player;
  if (st.maxHp) {
    p.maxHp = Math.max(1, p.maxHp + sign * st.maxHp);
    p.hp = Math.max(1, Math.min(p.maxHp, p.hp + sign * st.maxHp));
  }
  if (st.str) p.str += sign * st.str;
  if (st.dex) p.dex += sign * st.dex;
  if (st.will) p.will += sign * st.will;
  if (st.maxSanity) {
    p.maxSanity = Math.max(10, p.maxSanity + sign * st.maxSanity);
    p.sanity = Math.max(1, Math.min(p.maxSanity, p.sanity + (sign > 0 ? st.maxSanity : 0)));
  }
  if (st.insight) p.insight = Math.max(0, p.insight + sign * st.insight);
}

/**
 * core=true: 본질로 흡수 — 기술을 배우지 않고 최대 체력을 더 받는다 (coreHp).
 * 보통 정수는 언제나 본질로 흡수한다. 기술을 배울지는 수호자 정수(그 존재의 기술 전부)만 고른다.
 */
export function absorbEssence(run: RunState, drop: EssenceDrop, core = false): string | null {
  if (!drop.guardian) core = true;
  const why = absorbBlock(run, drop, core);
  if (why) return why;
  const def = need(ESSENCES, drop.id, '정수');
  const same = run.essences.find((e) => e.id === drop.id);
  // 수호자판으로 바꿔 흡수할 때 이미 강화해 둔 정수 스킬은 강화 단계를 이어받는다
  const keepLvl = new Map((same ? run.skills.filter((s) => s.from === same.uid) : []).map((s) => [s.id, s.lvl]));
  if (same) removeEssence(run, same.uid, true);
  const es: OwnedEssence = { uid: uid(run), id: drop.id, color: drop.color, guardian: drop.guardian };
  if (core) es.core = true;
  run.essences.push(es);
  applyStats(run, essenceStats(drop.id, drop.guardian, core), 1);
  // 같은 정수를 수호자판으로 바꿔 흡수할 때는 이계의 대가(최대 정신력 -5, 통찰 +1)를 다시 치르지 않는다
  if (def.eldritch && !same) {
    run.player.maxSanity = Math.max(10, run.player.maxSanity - 5);
    run.player.sanity = Math.min(run.player.sanity, run.player.maxSanity);
    run.player.insight += 1;
  }
  for (const a of essenceActives(es)) {
    const s = learnSkill(run, a, es.uid);
    if (s && keepLvl.has(a)) s.lvl = keepLvl.get(a)!;
  }
  run.stats.essences++;
  log(run, `${def.name}을(를) ${core ? '본질로 ' : ''}흡수했다`);
  return null;
}

/** 전투 뒤 떨어진 정수 (흡수하거나 병에 담는다) */
export type EssenceDrop = { id: string; color: number; guardian?: boolean };

/** 정수 병 수 */
export const FLASK_CAP = 2;

/** 병에 담아 둔 정수를 신전에서 새기는 값 (그 자리에서 흡수하면 공짜) — 등급이 높을수록, 수호자 정수는 1.5배 */
export function inscribeCost(drop: EssenceDrop): number {
  const grade = ESSENCES.get(drop.id)?.grade ?? 9;
  return Math.round((30 + 9 * Math.max(0, 9 - grade)) * (drop.guardian ? 1.5 : 1));
}

/** 떨어진 정수를 흡수하지 않고 병에 담는다 (흡수 한도가 차 있어도 된다) */
export function bottleEssence(run: RunState, item: LootItem): string | null {
  if (item.kind !== 'essence') return '정수가 아니다';
  if (item.taken) return '이미 가져갔다';
  const flasks = (run.flasks ??= []);
  if (flasks.length >= FLASK_CAP) return '정수 병이 가득 찼다';
  flasks.push({ id: item.id, color: item.color ?? 0, guardian: item.guardian });
  item.taken = true;
  item.bottled = true;
  log(run, `${ESSENCES.get(item.id)?.name ?? '정수'}을(를) 병에 담았다`);
  return null;
}

/** 병을 비운다 (담아 둔 정수는 사라진다) */
export function pourFlask(run: RunState, idx: number): string | null {
  const drop = run.flasks?.[idx];
  if (!drop) return '병이 비어 있다';
  run.flasks!.splice(idx, 1);
  log(run, `${ESSENCES.get(drop.id)?.name ?? '정수'}을(를) 담은 병을 비웠다`);
  return null;
}

export function removalCost(run: RunState): number {
  return 60 * 2 ** run.essenceRemovals;
}

/** 정수 제거. free=true면 비용 없이 (승급 교체용) */
export function removeEssence(run: RunState, essenceUid: string, free = false): string | null {
  const idx = run.essences.findIndex((e) => e.uid === essenceUid);
  if (idx < 0) return '정수가 없다';
  const es = run.essences[idx];
  const def = need(ESSENCES, es.id, '정수');
  if (def.lord && !free) return '계층정수는 제거할 수 없다';
  if (!free) {
    const cost = removalCost(run);
    if (run.player.gold < cost) return '골드가 부족하다';
    run.player.gold -= cost;
    run.essenceRemovals++;
  }
  applyStats(run, essenceStats(es.id, es.guardian, es.core), -1);
  // 돈을 내고 지우면 이계의 흔적(최대 정신력 -5, 통찰 +1)도 함께 사라진다
  if (def.eldritch && !free) {
    run.player.maxSanity += 5;
    run.player.insight = Math.max(0, run.player.insight - 1);
  }
  for (const s of run.skills.filter((x) => x.from === es.uid)) {
    const slot = run.slots.indexOf(s.uid);
    if (slot >= 0) run.slots[slot] = null;
    run.runes.push(...s.runes);
  }
  run.skills = run.skills.filter((x) => x.from !== es.uid);
  run.essences.splice(idx, 1);
  return null;
}

// ───────────── 장비 / 유물 / 소모품 ─────────────

export function gainRelic(run: RunState, id: string) {
  const def = need(RELICS, id, '유물');
  if (run.relics.some((r) => r.id === id)) return;
  run.relics.push({ id, n: 0 });
  def.onGain?.(run);
  log(run, `${def.name} 획득`);
}

export function addConsumable(run: RunState, id: string): boolean {
  need(CONSUMABLES, id, '소모품');
  const i = run.consumables.indexOf(null);
  if (i < 0) return false;
  run.consumables[i] = id;
  return true;
}

export function gainEquip(run: RunState, id: string, lvl = 0): boolean {
  need(EQUIPS, id, '장비');
  if (run.bag.length >= BAG_SIZE) return false;
  run.bag.push({ uid: uid(run), id, lvl });
  return true;
}

export function slotFor(def: { slot: 'weapon' | 'armor' | 'trinket' }, run: RunState): EquipSlot {
  if (def.slot !== 'trinket') return def.slot;
  return !run.equip.trinket1 ? 'trinket1' : !run.equip.trinket2 ? 'trinket2' : 'trinket1';
}

/** 가방의 장비를 장착 (기존 장비는 가방으로) */
export function equipFromBag(run: RunState, itemUid: string, slot?: EquipSlot): boolean {
  const i = run.bag.findIndex((x) => x.uid === itemUid);
  if (i < 0) return false;
  const it = run.bag[i];
  const def = need(EQUIPS, it.id, '장비');
  const target = slot ?? slotFor(def, run);
  if (def.slot === 'trinket' ? !target.startsWith('trinket') : target !== def.slot) return false;
  const old = run.equip[target];
  run.bag.splice(i, 1);
  if (old) unapplyEquip(run, old);
  run.equip[target] = it;
  applyEquip(run, it);
  if (old) run.bag.push(old);
  return true;
}

export function unequip(run: RunState, slot: EquipSlot): boolean {
  const it = run.equip[slot];
  if (!it || run.bag.length >= BAG_SIZE) return false;
  unapplyEquip(run, it);
  run.equip[slot] = null;
  run.bag.push(it);
  return true;
}

function applyEquip(run: RunState, it: OwnedItem) {
  const hp = EQUIPS.get(it.id)?.maxHp ?? 0;
  if (hp) {
    run.player.maxHp += hp;
    run.player.hp += hp;
  }
}
function unapplyEquip(run: RunState, it: OwnedItem) {
  const hp = EQUIPS.get(it.id)?.maxHp ?? 0;
  if (hp) {
    run.player.maxHp = Math.max(1, run.player.maxHp - hp);
    // 입을 때 얻은 체력만큼 벗을 때 다시 잃는다 (벗었다 입었다 하며 체력을 채우지 못하게 — 정수 제거와 같은 규칙)
    run.player.hp = Math.max(1, Math.min(run.player.maxHp, run.player.hp - hp));
  }
}

// ───────────── 전투 밖 정신력/체력 ─────────────

export function healRun(run: RunState, n: number): number {
  const p = run.player;
  const amt = Math.max(0, Math.min(Math.floor(n), p.maxHp - p.hp));
  p.hp += amt;
  return amt;
}

export function hurtRun(run: RunState, n: number): number {
  const p = run.player;
  const amt = Math.min(Math.floor(n), p.hp - 1);
  p.hp -= Math.max(0, amt);
  return amt;
}

export function gainSanityRun(run: RunState, n: number): number {
  const p = run.player;
  const amt = Math.max(0, Math.min(Math.floor(n), p.maxSanity - p.sanity));
  p.sanity += amt;
  return amt;
}

/** 전투 밖에서 플레이어에게 걸린 훅 (유물·장비·특성·광기·정수 패시브). 전투 중 Combat.sources(p)에서 상태이상만 뺀 것 */
function* runHooks(run: RunState): Generator<[Hooks, HookSelf]> {
  const p = run.player;
  for (const r of run.relics) {
    const d = RELICS.get(r.id);
    if (d?.hooks) yield [d.hooks, { kind: 'relic', id: r.id, unit: p, n: r.n, ref: r }];
  }
  for (const slot of ['weapon', 'armor', 'trinket1', 'trinket2'] as const) {
    const it = run.equip[slot];
    const d = it && EQUIPS.get(it.id);
    if (it && d?.hooks) yield [d.hooks, { kind: 'equip', id: it.id, unit: p, n: it.lvl }];
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
}

/** 전투 밖 정신력 손실. 붕괴 시 광기 id 반환 */
export function loseSanityRun(run: RunState, n: number): { lost: number; madness?: string; fatal?: boolean } {
  const p = run.player;
  let x = n * (1 + 0.05 * Math.min(6, p.insight)) * Math.max(0.5, 1 - 0.05 * p.will);
  // '받는 정신 피해' 효과(은 십자가·공허의 심장·깨진 정신·정수 패시브 등)는 전투 밖(어둠 속 이동·이벤트)에서도 똑같이 적용된다
  for (const [h, self] of runHooks(run)) if (h.modSanityLoss) x = h.modSanityLoss(null, self, x);
  const amt = Math.max(0, Math.floor(x));
  p.sanity -= amt;
  run.stats.sanityLost += amt;
  if (p.sanity > 0) return { lost: amt };
  const res = rollMadness(run, rng(run, 'misc'));
  if (res.fatal) {
    p.sanity = 0;
    endRun(run, false, '광기에 삼켜졌다');
    return { lost: amt, fatal: true };
  }
  p.sanity = Math.min(BREAKDOWN_RESET, p.maxSanity);
  return { lost: amt, madness: res.id ?? undefined };
}

// ───────────── 전리품 생성 ─────────────

const RARITY_W: Record<string, Partial<Record<Rarity, number>>> = {
  normal: { common: 62, uncommon: 31, rare: 7 },
  elite: { common: 35, uncommon: 45, rare: 20 },
  boss: { uncommon: 30, rare: 70 },
  shop: { common: 50, uncommon: 35, rare: 15 },
};

export function rollSkills(run: RunState, n: number, tier: keyof typeof RARITY_W = 'normal'): string[] {
  const r = rng(run, 'loot');
  const known = new Set(run.skills.map((s) => s.id));
  const origin = ORIGINS.get(run.origin);
  const pool = [...SKILLS.values()].filter(
    (s) => s.pool !== false && s.school !== 'essence' && s.school !== 'forbidden' && !known.has(s.id) && RARITY_W[tier][s.rarity],
  );
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const pick = r.weighted(pool, (s) => (RARITY_W[tier][s.rarity] ?? 0) * (origin?.schools.includes(s.school) ? 2 : 1));
    out.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

export function rollForbidden(run: RunState, n: number): string[] {
  const r = rng(run, 'loot');
  const known = new Set(run.skills.map((s) => s.id));
  const pool = [...SKILLS.values()].filter((s) => s.pool !== false && s.school === 'forbidden' && !known.has(s.id));
  return r.sample(pool, n).map((s) => s.id);
}

/** 행동력 +1 유물 (수호자 유물). 행동력 5 이상이면 더 주지 않는다 */
const isApRelic = (d: { desc: string }) => d.desc.startsWith('행동력 +1');
export const AP_RELIC_CAP = 5;

export function rollRelic(run: RunState, tier: 'common' | 'uncommon' | 'rare' | 'boss' | 'any' = 'any'): string | null {
  const r = rng(run, 'loot');
  const owned = new Set(run.relics.map((x) => x.id));
  let pool = [...RELICS.values()].filter((x) => !owned.has(x.id) && x.rarity !== 'special');
  // 이벤트 등에서 수호자 유물을 줄 때도 수호자 보상과 같은 행동력 상한을 지킨다
  if (tier === 'boss') pool = pool.filter((x) => x.rarity === 'boss' && !(isApRelic(x) && run.player.maxAp >= AP_RELIC_CAP));
  else {
    pool = pool.filter((x) => x.rarity !== 'boss');
    if (tier !== 'any') {
      const exact = pool.filter((x) => x.rarity === tier);
      if (exact.length) pool = exact;
    }
  }
  if (!pool.length) return null;
  return r.weighted(pool, (x) => ({ common: 55, uncommon: 33, rare: 12 })[x.rarity as 'common'] ?? 10).id;
}

/** 보스 유물 선택지: 행동력 유물은 최대 1개 (행동력 5 이상이면 제외) */
export function rollBossRelics(run: RunState, n: number): string[] {
  const r = rng(run, 'loot');
  const owned = new Set(run.relics.map((x) => x.id));
  const pool = [...RELICS.values()].filter((x) => x.rarity === 'boss' && !owned.has(x.id));
  const ap = pool.filter(isApRelic);
  const rest = r.shuffle(pool.filter((d) => !isApRelic(d)));
  const out: string[] = [];
  if (ap.length && run.player.maxAp < AP_RELIC_CAP && r.chance(0.7)) out.push(r.pick(ap).id);
  for (const d of rest) {
    if (out.length >= n) break;
    out.push(d.id);
  }
  return r.shuffle(out);
}

export function rollEquip(run: RunState, tier: 'normal' | 'elite' | 'shop' = 'normal'): string | null {
  const r = rng(run, 'loot');
  const have = new Set([...run.bag.map((x) => x.id), ...Object.values(run.equip).map((x) => x?.id)]);
  const pool = [...EQUIPS.values()].filter((x) => !have.has(x.id) && x.rarity !== 'basic' && x.rarity !== 'special');
  if (!pool.length) return null;
  const w = RARITY_W[tier];
  return r.weighted(pool, (x) => w[x.rarity] ?? 2).id;
}

export function rollRune(run: RunState): string | null {
  const r = rng(run, 'loot');
  const pool = [...RUNES.values()];
  if (!pool.length) return null;
  return r.weighted(pool, (x) => ({ common: 50, uncommon: 35, rare: 15 })[x.rarity as 'common'] ?? 10).id;
}

export function rollConsumable(run: RunState): string | null {
  const r = rng(run, 'loot');
  const pool = [...CONSUMABLES.values()].filter((x) => x.rarity !== 'special');
  if (!pool.length) return null;
  return r.weighted(pool, (x) => ({ common: 55, uncommon: 33, rare: 12 })[x.rarity as 'common'] ?? 10).id;
}

/** 선택형 전리품 (스킬 2 + 와일드카드 1) */
export function rollChoice(run: RunState, tier: 'normal' | 'elite' | 'boss'): LootItem[] {
  const r = rng(run, 'loot');
  const items: LootItem[] = rollSkills(run, tier === 'boss' ? 3 : 2, tier).map((id) => ({ kind: 'skill', id }));
  if (tier !== 'boss') {
    const roll = r.next();
    let wild: LootItem | null = null;
    if (roll < 0.35) {
      const id = rollEquip(run, tier);
      if (id) wild = { kind: 'equip', id };
    } else if (roll < 0.55) {
      const id = rollRune(run);
      if (id) wild = { kind: 'rune', id };
    } else if (roll < 0.8) {
      wild = { kind: 'upgrade', id: 'upgrade' };
    } else {
      const id = rollConsumable(run);
      if (id) wild = { kind: 'consumable', id };
    }
    if (wild) items.push(wild);
  }
  return items;
}

/** 처치한 적들에서 정수 드롭 */
export function rollEssenceDrops(run: RunState, killed: { def: string; tier: string }[], forceGuardian = false): LootItem[] {
  const r = rng(run, 'loot');
  const out: LootItem[] = [];
  for (const k of killed) {
    const es = ESSENCES.get(k.def);
    if (!es) continue;
    const chance = k.tier === 'boss' ? 1 : k.tier === 'elite' ? 0.5 : k.tier === 'normal' ? 0.07 : 0;
    // 균열 수호자(정예 등급)는 쓰러뜨리면 반드시 수호자 정수를 남긴다 — 하수인·보통 적은 평소 확률
    if (!r.chance(chance * (es.dropMul ?? 1)) && !(forceGuardian && (k.tier === 'boss' || k.tier === 'elite'))) continue;
    if (out.some((o) => o.id === es.id)) continue;
    out.push({ kind: 'essence', id: es.id, color: r.int(0, es.actives.length - 1), guardian: k.tier === 'boss' || forceGuardian });
  }
  return out;
}

// ───────────── 전투 시작/종료 ─────────────

/** 전투 시작 연출 이벤트 (첫 턴, 처음 본 존재의 공포, 기습 등) — 화면이 새 Combat을 만들 때 한 번 가져간다 */
const beginEvents = new WeakMap<RunState, CombatEvent[]>();
export function takeBeginEvents(run: RunState): CombatEvent[] {
  const ev = beginEvents.get(run) ?? [];
  beginEvents.delete(run);
  return ev;
}

export function startCombat(run: RunState, encId: string, opts: { anomaly?: string | null; ambush?: boolean } = {}): Combat {
  const enc = ENCOUNTERS.find((e) => e.id === encId);
  if (!enc) throw new Error(`알 수 없는 조우: ${encId}`);
  const anomaly = opts.anomaly !== undefined ? opts.anomaly : (enc.anomaly ?? null);
  run.screen = 'combat';
  run.stats.combats++;
  const c = Combat.begin(run, { ...enc, anomaly: anomaly ?? undefined });
  if (opts.ambush && !c.over) {
    c.s.ap = Math.max(0, c.s.ap - 1);
    c.emit({ t: 'text', text: '어둠 속에서 기습당했다! (행동력 -1)', tone: 'bad' });
  }
  beginEvents.set(run, [...c.events]);
  return c;
}

/** 승리 후 보상 화면으로 */
export function finishCombat(run: RunState): RewardState | null {
  const cs = run.combat;
  if (!cs) return null;
  if (cs.phase === 'defeat') {
    endRun(run, false, run.player.sanity <= 0 ? '정신이 무너졌다' : '심연에서 쓰러졌다');
    run.combat = null;
    return null;
  }
  if (cs.phase !== 'victory') return null;
  const r = rng(run, 'loot');
  const act = Math.min(run.act, 5);
  const killed = cs.enemies.filter((e) => e.dead && !e.fled).map((e) => ({ def: e.def, tier: ENEMIES.get(e.def)?.tier ?? 'normal' }));
  let xp = 0;
  for (const k of killed) xp += killXp(run, k.def);
  // 이 판에서 알아낸 약점 기록 (도감)
  for (const e of cs.enemies) if (e.known.length) run.learned.weak[e.def] = [...new Set([...(run.learned.weak[e.def] ?? []), ...e.known])];

  const kind = run.rift && cs.enc.startsWith('rift') ? 'rift' : cs.kind;
  const isRiftBoss = !!run.rift && run.rift.stage >= run.rift.encs.length - 1;
  const lordFight = cs.enc.startsWith('lord');
  const stalker = cs.enc.startsWith('stalker');
  const goldBase = cs.kind === 'boss' ? r.int(60, 80) : cs.kind === 'elite' ? r.int(25, 35) : r.int(10, 18);
  const gold = Math.round(goldBase * ACT_MULT[act] * (run.light < 25 ? 1.25 : 1)) + cs.bonusGold;

  const reward: RewardState = {
    source: lordFight ? 'lord' : stalker ? 'stalker' : run.rift ? 'rift' : cs.kind,
    gold,
    xp: Math.round(xp),
    items: [],
    choice: null,
    chosen: false,
    next: 'dungeon',
  };
  reward.items.push(...rollEssenceDrops(run, killed, isRiftBoss));
  if (cs.kind === 'elite' || isRiftBoss || stalker) {
    const relic = rollRelic(run);
    if (relic) reward.items.push({ kind: 'relic', id: relic });
    run.stats.elites++;
  }
  if (cs.kind === 'boss' && !lordFight) {
    run.stats.bosses++;
    reward.choice = rollBossRelics(run, 3).map((id) => ({ kind: 'relic', id }));
    if (!reward.choice.length) reward.choice = rollChoice(run, 'boss');
    reward.next = run.act >= FINAL_ACT ? 'final' : 'haven';
  } else {
    reward.choice = rollChoice(run, cs.kind === 'elite' ? 'elite' : 'normal');
  }
  if (lordFight) {
    const relic = rollRelic(run, 'rare');
    if (relic) reward.items.push({ kind: 'relic', id: relic });
  }
  if (r.chance(cs.kind === 'normal' ? 0.3 : 0.5)) {
    const c = rollConsumable(run);
    if (c) reward.items.push({ kind: 'consumable', id: c });
  }
  if (run.rift) {
    reward.next = isRiftBoss ? 'dungeon' : 'rift';
    if (isRiftBoss) {
      run.rift = null;
      log(run, '균열이 닫혔다');
    }
  }

  run.player.gold += gold;
  gainXp(run, xp);
  run.reward = reward;
  run.combat = null;
  run.screen = 'reward';
  if (run.floor) floorSignal(run, { t: 'combat', enc: cs.enc, kind: cs.kind });
  return reward;
}

/** 보상 개별 수령 */
/** core: 정수를 본질로 흡수 (기술 대신 능력치) */
export function takeLoot(run: RunState, item: LootItem, core = false): string | null {
  if (item.taken) return '이미 가져갔다';
  switch (item.kind) {
    case 'essence': {
      const why = absorbEssence(run, { id: item.id, color: item.color ?? 0, guardian: item.guardian }, core);
      if (why) return why;
      break;
    }
    case 'relic':
      gainRelic(run, item.id);
      break;
    case 'consumable':
      if (!addConsumable(run, item.id)) return '소모품 칸이 가득 찼다';
      break;
    case 'equip':
      if (!gainEquip(run, item.id, item.n ?? 0)) return '가방이 가득 찼다';
      break;
    case 'rune':
      run.runes.push(item.id);
      break;
    case 'skill':
      learnSkill(run, item.id);
      break;
    case 'gold':
      run.player.gold += item.n ?? 0;
      break;
    case 'oil':
      run.light = Math.min(100, run.light + (item.n ?? 30));
      break;
    case 'upgrade':
      // UI에서 대상 스킬을 고른 뒤 upgradeSkill 호출
      break;
  }
  item.taken = true;
  return null;
}

export function chooseLoot(run: RunState, idx: number, upgradeTarget?: string): string | null {
  const rw = run.reward;
  if (!rw?.choice || rw.chosen) return '선택할 수 없다';
  const item = rw.choice[idx];
  if (!item) return '잘못된 선택';
  if (item.kind === 'upgrade') {
    if (!upgradeTarget || !upgradeSkill(run, upgradeTarget)) return '강화할 스킬을 고르세요';
    item.taken = true;
  } else {
    const why = takeLoot(run, item);
    if (why) return why;
  }
  rw.chosen = true;
  return null;
}

// ───────────── 종료 ─────────────

export function endRun(run: RunState, won: boolean, reason: string) {
  run.over = { won, reason };
  run.screen = won ? 'victory' : 'gameover';
}

/** 최종 수호자를 쓰러뜨림 → 승리. 승리 문장은 최종층 FloorDef.victory */
export function winRun(run: RunState) {
  endRun(run, true, FLOORS.get(FINAL_ACT)?.victory ?? '심연의 끝에서 살아 돌아왔다');
}

export { type FloorState };
