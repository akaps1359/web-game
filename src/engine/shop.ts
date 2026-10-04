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

export interface ShopItem {
  kind: 'skill' | 'relic' | 'equip' | 'rune' | 'consumable' | 'oil';
  id: string;
  price: number;
  sold: boolean;
}

export interface ShopState {
  kind: 'merchant' | 'haven';
  key: string;
  items: ShopItem[];
}

const PRICE: Record<ShopItem['kind'], Partial<Record<Rarity, number>>> = {
  skill: { common: 45, uncommon: 70, rare: 110 },
  relic: { common: 120, uncommon: 160, rare: 220 },
  equip: { common: 60, uncommon: 95, rare: 140 },
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

function price(run: RunState, kind: ShopItem['kind'], id: string): number {
  const r = rng(run, 'loot');
  const base = PRICE[kind][rarityOf(kind, id)] ?? PRICE[kind].common ?? 50;
  const act = 1 + 0.1 * (Math.min(run.act, 5) - 1);
  const jitter = 0.9 + r.next() * 0.2;
  const discount = run.relics.some((x) => x.id === 'membership-coin') ? 0.8 : 1;
  return Math.round(base * act * jitter * discount);
}

function stock(run: RunState, kind: 'merchant' | 'haven'): ShopItem[] {
  const big = kind === 'haven';
  const items: ShopItem[] = [];
  const push = (k: ShopItem['kind'], id: string | null) => {
    if (id && !items.some((x) => x.kind === k && x.id === id)) items.push({ kind: k, id, price: price(run, k, id), sold: false });
  };
  for (const id of rollSkills(run, big ? 5 : 3, 'shop')) push('skill', id);
  for (let i = 0; i < (big ? 2 : 1); i++) push('relic', rollRelic(run));
  for (let i = 0; i < (big ? 3 : 2); i++) push('equip', rollEquip(run, 'shop'));
  for (let i = 0; i < (big ? 2 : 1); i++) push('rune', rollRune(run));
  for (let i = 0; i < (big ? 3 : 2); i++) push('consumable', rollConsumable(run));
  push('oil', 'oil');
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

export function buy(run: RunState, idx: number): string | null {
  const shop = run.shop;
  const it = shop?.items[idx];
  if (!shop || !it) return '물건이 없다';
  if (it.sold && it.kind !== 'oil') return '이미 팔렸다';
  if (run.player.gold < it.price) return '골드가 부족하다';
  switch (it.kind) {
    case 'skill':
      if (!learnSkill(run, it.id)) return '이미 아는 기술이다';
      break;
    case 'relic':
      gainRelic(run, it.id);
      break;
    case 'equip':
      if (!gainEquip(run, it.id)) return '가방이 가득 찼다';
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
  run.player.gold -= it.price;
  if (it.kind !== 'oil') it.sold = true;
  return null;
}

export function sellPrice(run: RunState, itemUid: string): number {
  const it = run.bag.find((x) => x.uid === itemUid);
  if (!it) return 0;
  const def = need(EQUIPS, it.id, '장비');
  return Math.round(((PRICE.equip[def.rarity] ?? 50) * (1 + 0.5 * it.lvl)) / 2);
}

export function sell(run: RunState, itemUid: string): string | null {
  const i = run.bag.findIndex((x) => x.uid === itemUid);
  if (i < 0) return '물건이 없다';
  run.player.gold += sellPrice(run, itemUid);
  run.bag.splice(i, 1);
  return null;
}
