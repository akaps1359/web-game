import { EQUIPS, MADNESS, need } from './registry';
import { advanceTime, descend } from './dungeon';
import {
  absorbEssence,
  canUpgradeSkill,
  gainSanityRun,
  healRun,
  inscribeCost,
  learnSkill,
  log,
  removeEssence,
  removalCost,
  rollForbidden,
  type RunState,
  upgradeSkill,
} from './run';
import type { EquipSlot } from './types';

// ───────────── 야영지 ─────────────

export type CampAction = 'sleep' | 'meditate' | 'train' | 'tinker';

export const CAMP_INFO: Record<CampAction, { name: string; desc: string; hours: number }> = {
  sleep: { name: '수면', desc: '체력 30% 회복', hours: 6 },
  meditate: { name: '명상', desc: '정신력 30 회복', hours: 4 },
  train: { name: '수련', desc: '스킬 하나 강화', hours: 4 },
  tinker: { name: '정비', desc: '장비 하나 강화', hours: 4 },
};

function campRoom(run: RunState) {
  const f = run.floor;
  return f ? f.rooms[f.pos] : null;
}

export function campBlock(run: RunState, act: CampAction, target?: string): string | null {
  const room = campRoom(run);
  if (!room || room.type !== 'camp' || room.cleared) return '야영지가 아니다';
  if (act === 'sleep' && run.relics.some((r) => r.id === 'sleeper-scale')) return '비늘이 꿈틀거려 잠들 수 없다';
  if (act === 'train') {
    const s = run.skills.find((x) => x.uid === target);
    if (!target) return null;
    if (!s || !canUpgradeSkill(run, s)) return '강화할 수 없는 스킬';
  }
  if (act === 'tinker' && target) {
    const it = run.equip[target as EquipSlot];
    if (!it || it.lvl >= 2) return '강화할 수 없는 장비';
  }
  return null;
}

export function camp(run: RunState, act: CampAction, target?: string): string | null {
  const why = campBlock(run, act, target);
  if (why) return why;
  const p = run.player;
  const room = campRoom(run)!;
  switch (act) {
    case 'sleep': {
      if (run.relics.some((r) => r.id === 'sleeper-scale')) {
        log(run, '비늘이 꿈틀거려 잠들 수 없다');
        break;
      }
      const bonus = run.relics.some((r) => r.id === 'old-blanket') ? 0.15 : 0;
      const half = run.madness.includes('insomnia') ? 0.5 : 1;
      const n = healRun(run, p.maxHp * (0.3 + bonus) * half);
      log(run, `잠을 청했다 (체력 +${n})`);
      break;
    }
    case 'meditate': {
      const n = gainSanityRun(run, 30);
      log(run, `마음을 가다듬었다 (정신력 +${n})`);
      break;
    }
    case 'train':
      if (!target || !upgradeSkill(run, target)) return '강화할 스킬을 고르세요';
      log(run, '기술을 갈고닦았다');
      break;
    case 'tinker': {
      const it = target ? run.equip[target as EquipSlot] : null;
      if (!it || it.lvl >= 2) return '강화할 장비를 고르세요';
      it.lvl++;
      log(run, `${need(EQUIPS, it.id, '장비').name}을(를) 손질했다 (+${it.lvl})`);
      break;
    }
  }
  room.cleared = true;
  advanceTime(run, CAMP_INFO[act].hours);
  return null;
}

/** 야영지 불씨로 등불 채우기 (방문당 1회) */
export function campRefuel(run: RunState): string | null {
  const f = run.floor;
  const room = campRoom(run);
  if (!f || !room || room.type !== 'camp') return '야영지가 아니다';
  const key = `refuel${room.id}`;
  if (f.vars[key]) return '이미 불씨를 옮겼다';
  f.vars[key] = 1;
  run.light = Math.min(100, run.light + 30);
  return null;
}

export function leavePlace(run: RunState) {
  run.screen = 'dungeon';
  run.shop = null;
}

// ───────────── 신전 ─────────────

export function shrinePray(run: RunState): string | null {
  const f = run.floor;
  if (!f) return '신전이 없다';
  const key = `pray${f.pos}`;
  if (f.vars[key]) return '이미 기도했다';
  f.vars[key] = 1;
  const n = gainSanityRun(run, 15);
  log(run, `기도를 올렸다 (정신력 +${n})`);
  return null;
}

export const CURE_COST = 120;

export function cureMadness(run: RunState, id: string): string | null {
  if (!run.madness.includes(id)) return '그런 광기는 없다';
  if (MADNESS.get(id)?.virtue) return '각성은 치료할 필요가 없다';
  if (run.player.gold < CURE_COST) return '골드가 부족하다';
  run.player.gold -= CURE_COST;
  run.madness = run.madness.filter((m) => m !== id);
  log(run, `${MADNESS.get(id)?.name ?? '광기'}에서 벗어났다`);
  return null;
}

export function purgeEssence(run: RunState, essenceUid: string): string | null {
  return removeEssence(run, essenceUid);
}

/** 병에 담아 둔 정수를 새긴다 (신전·거점 신전에서만, 골드를 낸다). pick: 수호자 정수와 함께 배울 기술 (null이면 기술 없이) */
export function inscribeFlask(run: RunState, idx: number, pick: string | null = null): string | null {
  if (run.screen !== 'shrine' && run.screen !== 'haven') return '신전에서만 새길 수 있다';
  const drop = run.flasks?.[idx];
  if (!drop) return '병이 비어 있다';
  const cost = inscribeCost(drop);
  if (run.player.gold < cost) return '골드가 부족하다';
  const why = absorbEssence(run, drop, pick);
  if (why) return why;
  run.player.gold -= cost;
  run.flasks!.splice(idx, 1);
  return null;
}

/** 금기의 봉헌: 최대 정신력 -8 → 금기 스킬 2개 중 선택지 */
export function forbiddenOffer(run: RunState): string[] | string {
  const f = run.floor;
  if (!f) return '제단이 없다';
  const key = `offer${f.pos}`;
  if (f.vars[key]) return '제단이 침묵한다';
  // 같은 신전에서는 몇 번을 다시 열어도 같은 후보 (처음 정해진 것을 기억한다)
  f.offers ??= {};
  const opts = (f.offers[key] ??= rollForbidden(run, 2));
  if (!opts.length) return '제단이 응답하지 않는다';
  return opts;
}

export function acceptForbidden(run: RunState, skillId: string): string | null {
  const f = run.floor;
  if (!f) return '제단이 없다';
  const key = `offer${f.pos}`;
  if (f.vars[key]) return '제단이 침묵한다';
  if (f.offers?.[key] && !f.offers[key].includes(skillId)) return '제단이 내민 지식이 아니다';
  f.vars[key] = 1;
  run.player.maxSanity = Math.max(10, run.player.maxSanity - 8);
  run.player.sanity = Math.min(run.player.sanity, run.player.maxSanity);
  run.player.insight += 1;
  learnSkill(run, skillId);
  log(run, '금기의 지식이 머릿속에 새겨졌다 (최대 정신력 -8, 통찰 +1)');
  return null;
}

// ───────────── 거점 ─────────────

export function inn(run: RunState): string | null {
  if (run.innUsed) return '이미 쉬었다';
  run.innUsed = true;
  run.player.hp = run.player.maxHp;
  run.player.sanity = run.player.maxSanity;
  log(run, '여관에서 푹 쉬었다');
  return null;
}

export function smithCost(lvl: number): number {
  return lvl === 0 ? 50 : 100;
}

export function smith(run: RunState, slot: EquipSlot): string | null {
  const it = run.equip[slot];
  if (!it) return '장비가 없다';
  if (it.lvl >= 2) return '더 강화할 수 없다';
  const cost = smithCost(it.lvl);
  if (run.player.gold < cost) return '골드가 부족하다';
  run.player.gold -= cost;
  it.lvl++;
  return null;
}

export const TRAIN_COST = 60;

export function trainPaid(run: RunState, skillUid: string): string | null {
  const s = run.skills.find((x) => x.uid === skillUid);
  if (run.trainUsed) return '이번 거점에서는 이미 훈련했다';
  if (!s || !canUpgradeSkill(run, s)) return '강화할 수 없다';
  if (run.player.gold < TRAIN_COST) return '골드가 부족하다';
  run.player.gold -= TRAIN_COST;
  upgradeSkill(run, skillUid);
  run.trainUsed = true;
  return null;
}

export function leaveHaven(run: RunState) {
  // 거점에서만 (두 번 눌려도 한 층을 건너뛰지 않게)
  if (run.screen !== 'haven') return;
  run.shop = null;
  descend(run);
}

export { removalCost };
