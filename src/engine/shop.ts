import { CONSUMABLES, EQUIPS, RELICS, RUNES, SKILLS, need } from './registry';
import {
  addConsumable,
  gainEquip,
  gainRelic,
  learnSkill,
  rng,
  rollConsumable,
  rollEquip,
  rollRelic,
  rollRune,
  rollSkills,
  type RunState,
} from './run';
import type { Rarity } from './types';
import { abyssShopMult } from './abyss';
import { rollAffixes, useOmen } from './growth';

export interface ShopItem {
  kind: 'skill' | 'relic' | 'equip' | 'rune' | 'consumable' | 'oil';
  id: string;
  price: number;
  sold: boolean;
  /** 장비의 접사 (진열할 때 정해진다 — engine/growth.ts) */
  aff?: string[];
}

export interface ShopState {
  kind: 'merchant' | 'haven';
  key: string;
  items: ShopItem[];
}

/** 창세(genesis)는 상점에 나오지 않는다 — 그 값은 팔 때만 쓴다 (판매가 = 장비 절반, 스킬 30%) */
const PRICE: Record<ShopItem['kind'], Partial<Record<Rarity, number>>> = {
  skill: { common: 45, uncommon: 70, rare: 110, genesis: 240 },
  relic: { common: 120, uncommon: 160, rare: 220 },
  equip: { common: 60, uncommon: 95, rare: 140, genesis: 300 },
  rune: { common: 55, uncommon: 80, rare: 110 },
  consumable: { common: 25, uncommon: 40, rare: 60 },
  oil: { common: 20 },
};

function rarityOf(kind: ShopItem['kind'], id: string): Rarity {
  switch (kind) {
    case 'skill':
      return SKILLS.get(id)?.rarity ?? 'common';
    case 'relic':
      return RELICS.get(id)?.rarity ?? 'common';
    case 'equip':
      return EQUIPS.get(id)?.rarity ?? 'common';
    case 'rune':
      return RUNES.get(id)?.rarity ?? 'common';
    case 'consumable':
      return CONSUMABLES.get(id)?.rarity ?? 'common';
    default:
      return 'common';
  }
}

/** 상점 값이 층마다 오르는 비율 */
export const SHOP_ACT_STEP = 0.15;

function price(run: RunState, kind: ShopItem['kind'], id: string): number {
  const r = rng(run, 'loot');
  const base = PRICE[kind][rarityOf(kind, id)] ?? PRICE[kind].common ?? 50;
  // 성장 개편 (2026-10): 층마다 15%씩 (예전 10% — 골드가 3배로 불어 4층부터 남아돌았다. 골드는 GOLD_MULT로 2.2배까지)
  const act = 1 + SHOP_ACT_STEP * (Math.min(run.act, 5) - 1);
  const jitter = 0.9 + r.next() * 0.2;
  // 심연 「값을 올린 상인」: 상점 값이 오른다
  return Math.round(base * act * jitter * abyssShopMult(run));
}

function stock(run: RunState, kind: 'merchant' | 'haven'): ShopItem[] {
  const big = kind === 'haven';
  const items: ShopItem[] = [];
  const push = (k: ShopItem['kind'], id: string | null) => {
    if (id && !items.some((x) => x.kind === k && x.id === id)) items.push({ kind: k, id, price: price(run, k, id), sold: false });
  };
  for (const id of rollSkills(run, big ? 5 : 3, 'shop')) push('skill', id);
  // 성장 개편: 거점도 유물은 하나 (예전 둘 — 판마다 유물 17개)
  push('relic', rollRelic(run));
  for (let i = 0; i < (big ? 3 : 2); i++) push('equip', rollEquip(run, 'shop'));
  for (let i = 0; i < (big ? 2 : 1); i++) push('rune', rollRune(run));
  for (let i = 0; i < (big ? 3 : 2); i++) push('consumable', rollConsumable(run));
  push('oil', 'oil');
  for (const it of items) if (it.kind === 'equip') it.aff = rollAffixes(run, it.id);
  // 상인의 징조: 이번에 새로 연 상점은 30% 싸다
  if (useOmen(run, 'omen-merchant')) for (const it of items) if (it.kind !== 'oil') it.price = Math.round(it.price * 0.7);
  return items;
}

export function openShop(run: RunState, kind: 'merchant' | 'haven', room = -1) {
  const key = kind === 'haven' ? `haven${run.act}` : `${run.act}:${room}`;
  const saved = run.floor?.shops?.[key];
  run.shop = saved ?? { kind, key, items: stock(run, kind) };
  if (run.floor) {
    run.floor.shops ??= {};
    run.floor.shops[key] = run.shop;
  }
  if (kind === 'merchant') run.screen = 'merchant';
}

/** 지금 내야 하는 값 (상인 조합 주화는 언제 얻었든 바로 20% 할인) */
export function priceOf(run: RunState, it: ShopItem): number {
  const discount = run.relics.some((x) => x.id === 'membership-coin') ? 0.8 : 1;
  return Math.round(it.price * discount);
}

export function buy(run: RunState, idx: number): string | null {
  const shop = run.shop;
  const it = shop?.items[idx];
  if (!shop || !it) return '물건이 없다';
  if (it.sold && it.kind !== 'oil') return '이미 팔렸다';
  const cost = priceOf(run, it);
  if (run.player.gold < cost) return '골드가 부족하다';
  switch (it.kind) {
    case 'skill':
      if (!learnSkill(run, it.id)) return '이미 아는 기술이다';
      break;
    case 'relic':
      gainRelic(run, it.id);
      break;
    case 'equip':
      if (!gainEquip(run, it.id, 0, it.aff)) return '가방이 가득 찼다';
      break;
    case 'rune':
      run.runes.push(it.id);
      break;
    case 'consumable':
      if (!addConsumable(run, it.id)) return '소모품 칸이 가득 찼다';
      break;
    case 'oil':
      if (run.light >= 100) return '등불이 이미 가득하다';
      run.light = Math.min(100, run.light + 30);
      break;
  }
  run.player.gold -= cost;
  if (it.kind !== 'oil') it.sold = true;
  // 층에 기억해 둔 진열장도 지금 보고 있는 것과 같게 (이어하기로 불러온 판은 둘이 따로 떨어진 사본이라,
  // 그대로 두면 상인을 떠났다 다시 들어올 때 산 물건이 다시 진열된다)
  if (run.floor) {
    run.floor.shops ??= {};
    run.floor.shops[shop.key] = shop;
  }
  return null;
}

export function sellPrice(run: RunState, itemUid: string): number {
  const it = run.bag.find((x) => x.uid === itemUid);
  if (!it) return 0;
  const def = need(EQUIPS, it.id, '장비');
  // 기본 템(시작 장비·기본 등급)은 값이 없다
  if (it.starter || def.rarity === 'basic') return 0;
  return Math.round(((PRICE.equip[def.rarity] ?? 50) * (1 + 0.5 * it.lvl)) / 2);
}

export function sell(run: RunState, itemUid: string): string | null {
  const i = run.bag.findIndex((x) => x.uid === itemUid);
  if (i < 0) return '물건이 없다';
  run.player.gold += sellPrice(run, itemUid);
  run.bag.splice(i, 1);
  return null;
}

// ───────────── 스킬 처분 ─────────────

/** 스킬 판매가: 상점 기본가의 30% (강화했으면 1.5배). 상점에서 사는 값보다 크게 손해 본다 */
export const SKILL_SELL_RATE = 0.3;

export function skillSellPrice(run: RunState, skillUid: string): number {
  const s = run.skills.find((x) => x.uid === skillUid);
  const def = s && SKILLS.get(s.id);
  if (!s || !def) return 0;
  // 기본 템(시작 스킬·기본 등급)은 값이 없다
  if (s.starter || def.rarity === 'basic') return 0;
  const base = PRICE.skill[def.rarity] ?? PRICE.skill.common ?? 45;
  return Math.max(5, Math.round(base * SKILL_SELL_RATE * (s.lvl > 0 ? 1.5 : 1)));
}

/** 팔거나 버릴 수 없는 이유 (없으면 null) */
export function skillLockReason(run: RunState, skillUid: string): string | null {
  const s = run.skills.find((x) => x.uid === skillUid);
  if (!s) return '스킬이 없다';
  if (s.from) return '정수에서 얻은 스킬은 그 정수를 지워야 사라진다';
  if (run.slots.includes(skillUid)) return '장착한 스킬은 먼저 빼야 한다';
  return null;
}

/** 스킬을 버린다 (새겨 둔 각인은 돌려받는다) */
export function discardSkill(run: RunState, skillUid: string): string | null {
  const why = skillLockReason(run, skillUid);
  if (why) return why;
  const i = run.skills.findIndex((x) => x.uid === skillUid);
  run.runes.push(...run.skills[i].runes);
  run.skills.splice(i, 1);
  return null;
}

export function sellSkill(run: RunState, skillUid: string): string | null {
  const gold = skillSellPrice(run, skillUid);
  const why = discardSkill(run, skillUid);
  if (why) return why;
  run.player.gold += gold;
  return null;
}
