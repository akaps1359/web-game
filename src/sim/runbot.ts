import { Combat } from '../engine/combat';
import { EQUIPS, ENCOUNTERS, ESSENCES, MADNESS, RELICS, SKILLS } from '../engine/registry';
import {
  absorbBlock,
  bottleEssence,
  inscribeCost,
  canUpgradeSkill,
  chooseLoot,
  equipFromBag,
  equipSkill,
  essenceStats,
  finishCombat,
  newRun,
  slotFull,
  takeLoot,
  takesSlot,
  type RunState,
} from '../engine/run';
import { continueRift, distances, enterRift, goHaven, moveTo, startGuardian } from '../engine/dungeon';
import { chooseEvent, eventView, leaveEvent } from '../engine/events';
import { GROWTH, forgoChoice, omensOf, shrinePacts, signShrinePact } from '../engine/growth';
import { camp, campRefuel, cureMadness, inn, inscribeFlask, leaveHaven, leavePlace, shrinePray, smith } from '../engine/places';
import { buy, priceOf } from '../engine/shop';
import { endRun, winRun } from '../engine/run';
import { isGenesisLoot, type LootItem } from '../engine/run';
import { ORIGINS } from '../engine/registry';
import { autoTurn } from './bot';
import { clueLinks, isBridge } from '../engine/keywords';
import type { OwnedSkill, Rarity, School } from '../engine/types';
import { gapStats } from '../content/gap';

export interface CombatLog {
  act: number;
  enc: string;
  kind: string;
  turns: number;
  hpLost: number;
  sanityLost: number;
  won: boolean;
  dealt: number;
  /** 붕괴시킨 횟수 */
  breaks: number;
  /** 심연 압력 (content/depth.ts): 이 전투에 나온 적들의 변이 · 심연 강타가 터진/끊긴 횟수 */
  muts?: string[];
  blast?: number;
  blastCut?: number;
  /** 틈 (content/gap.ts): 연 횟수(큰 틈) · 거둔 횟수(큰 틈) · 같은 계열로 쳐서 거두지 못한 횟수 · 출신 밖 계열로 거둔 횟수 */
  gap?: { open: number; bigOpen: number; harvest: number; bigHarvest: number; same: number; off: number };
}

export interface SimResult {
  seed: number;
  origin: string;
  won: boolean;
  act: number;
  reason: string;
  level: number;
  essences: number;
  skills: number;
  relics: number;
  rooms: number;
  hours: number;
  combats: CombatLog[];
  /** 실마리 보상: 보상 선택지에 나온 실마리 스킬 수 · 그중 고른 수 · 상점에서 산 실마리 스킬 수 */
  clueOffered: number;
  clueTaken: number;
  clueBought: number;
  /** 이 판에서 얻은 창세 (없으면 undefined) */
  genesis?: string;
  /** 판 끝 장착 스킬: 계열 스킬 수 · 서로 다른 계열 수 · 출신 밖 계열 스킬 수 · 계열을 잇는 기술 수 (정수 기술·공용 스킬은 빼고 센다) */
  endSkills: number;
  endSchools: number;
  endOffOrigin: number;
  endBridges: number;
  /** 성장 개편 (engine/growth.ts): 받은 징조 · 이룬 징조 · 고르는 보상을 지나친 횟수 · 맺은 계약 · 이루어진 축복 · 진화 · 판 끝 장착 장비의 접사 수 */
  growth: { omens: number; omenUsed: number; skipped: number; pacts: number; boons: number; evolved: number; affixes: number };
  /** 막 시작 시점의 상태 */
  actStart: { act: number; hp: number; maxHp: number; level: number; sanity: number; str: number; dex: number; ap: number; relics: number; essences: number; skills: number; upgrades: number; insight: number; relicIds: string[] }[];
}

const RANK: Record<Rarity, number> = { basic: 0, common: 1, uncommon: 2, rare: 3, forbidden: 3, boss: 4, special: 4, genesis: 5 };

/** 이 스킬이 지금 판(가진 스킬·무기·각인)과 계열을 넘어 맞물리는 키워드 수 (실마리 — engine/keywords.ts) */
function clueCount(run: RunState, id: string): number {
  const def = SKILLS.get(id);
  return def ? new Set(clueLinks(run, def).map((l) => `${l.dir}:${l.kw}`)).size : 0;
}

/**
 * 봇의 실마리 처리: take 보상에서 실마리 스킬을 먼저 고른다 · shop 상점에서 실마리 스킬 하나를 먼저 산다 · swap 빈 칸이 없으면 더 약한 스킬과 바꿔 낀다.
 * weight: 맞물리는 키워드 하나(최대 둘)의 점수. 등급 한 단계가 10점이다.
 * 5였을 때는 맞물림 둘이 등급 한 단계와 같아, 봇이 더 센 스킬(학자의 인장 → 인장 폭발 같은 출신의 뼈대)을 버리고
 * 약한 글루로 칸을 채웠다. 3으로 낮추자 세 출신 모두 올랐다 (2026-10 최종 밸런스: 학자 +4%p, 판 끝 출신 밖 스킬 46 → 43%)
 */
export const botClue = { take: true, shop: true, swap: true, weight: 3 };

/** 탄약을 채우는 스킬 (재장전·엄폐 재장전) / 탄약을 쓰는 사격 스킬 */
const refills = (id: string) => !!SKILLS.get(id)?.tags.includes('ammo') && !SKILLS.get(id)?.tags.includes('gun');
const shoots = (id: string) => !!SKILLS.get(id)?.tags.includes('gun');

/** 봇이 보는 장착 스킬의 값: 등급, 강화, 지금 판과 맞물리는 정도 */
const keepScore = (run: RunState, o: OwnedSkill) => {
  const d = SKILLS.get(o.id);
  const n = clueCount(run, o.id);
  // 남의 키워드를 읽는 스킬인데 지금 판에 그것을 만드는 것이 없으면 등급 한 단계 넘게 덜 친다 (읽을 게 없다)
  return RANK[d?.rarity ?? 'basic'] * 10 + o.lvl * 4 + Math.min(n, 2) * botClue.weight - (d && isBridge(d) && n === 0 ? 15 : 0);
};

/** 가장 약한 장착 스킬의 값 (바꿔 낄 수 있는 것 중에서, 빈 칸이 있으면 -1) */
function worstKeep(run: RunState): number {
  if (run.slots.includes(null)) return -1;
  let worst = Infinity;
  for (const uid of run.slots) {
    const o = run.skills.find((x) => x.uid === uid);
    const d = o && SKILLS.get(o.id);
    if (!o || !d || o.from || d.rarity === 'genesis') continue;
    worst = Math.min(worst, keepScore(run, o));
  }
  return worst;
}

/** 빈 칸이 없을 때 바꿔 낄 만한가: 가장 약한 장착 스킬보다 이만큼 나아야 한다 (등급 한 단계 — 강화 보상을 버릴 값) */
const SWAP_MARGIN = 10;
const scoreOf = (run: RunState, id: string) => keepScore(run, { uid: '', id, lvl: 0, runes: [] });

/** 빈 칸이 있을 때 고를 스킬: 등급과 실마리 점수가 가장 높은 것 (없으면 -1) */
function skillPick(run: RunState, choice: { kind: string; id: string }[]): number {
  let best = -1;
  let bestS = -Infinity;
  choice.forEach((it, i) => {
    if (it.kind !== 'skill') return;
    const sc = botClue.take ? scoreOf(run, it.id) : -i;
    if (sc > bestS) {
      bestS = sc;
      best = i;
    }
  });
  return best;
}

/** 빈 칸이 없을 때: 실마리 스킬 가운데 가장 약한 장착 스킬보다 확실히 나은 것 (없으면 -1 — 강화 등 다른 보상을 고른다) */
function cluePick(run: RunState, choice: { kind: string; id: string }[]): number {
  let best = -1;
  let bestS = worstKeep(run) + SWAP_MARGIN - 1;
  choice.forEach((it, i) => {
    if (it.kind !== 'skill' || clueCount(run, it.id) <= 0) return;
    const sc = scoreOf(run, it.id);
    if (sc > bestS) {
      bestS = sc;
      best = i;
    }
  });
  return best;
}

/**
 * 새로 얻은 실마리 스킬을 끼운다. 빈 칸이 없으면 가장 약한 장착 스킬보다 나을 때만 바꾼다.
 * 약한 순서: 등급이 낮고, 강화하지 않았고, 지금 판과 맞물리지 않는 것. 정수 기술·창세는 빼지 않고, 사격 스킬이 남아 있으면 하나뿐인 재장전도 빼지 않는다
 */
function equipClue(run: RunState, s: OwnedSkill | undefined) {
  if (!s || run.slots.includes(s.uid)) return;
  const empty = run.slots.indexOf(null);
  if (empty >= 0) {
    run.slots[empty] = s.uid;
    return;
  }
  if (!botClue.swap) return;
  const equipped = [...run.slots.map((uid) => run.skills.find((x) => x.uid === uid)?.id ?? ''), s.id];
  const lastRefill = equipped.filter(refills).length <= 1 && equipped.some(shoots);
  let worst = -1;
  let worstScore = Infinity;
  run.slots.forEach((uid, i) => {
    const o = run.skills.find((x) => x.uid === uid);
    const d = o && SKILLS.get(o.id);
    if (!o || !d || o.from || d.rarity === 'genesis' || (lastRefill && refills(o.id))) return;
    const score = keepScore(run, o);
    if (score < worstScore) {
      worstScore = score;
      worst = i;
    }
  });
  if (worst >= 0 && keepScore(run, s) >= worstScore + SWAP_MARGIN) equipSkill(run, worst, s.uid);
}

/** 창세 선택지(계층군주 보상)에서 고를 것: 출신 계열의 스킬 → 무기·방어구 → 장신구 → 아무 스킬. 없으면 -1 */
function genesisPick(run: RunState, choice: LootItem[]): number {
  const schools = ORIGINS.get(run.origin)?.schools ?? [];
  const rank = (it: LootItem) => {
    if (!isGenesisLoot(it)) return -1;
    if (it.kind === 'skill') return schools.includes(SKILLS.get(it.id)!.school) ? 3 : 0;
    return EQUIPS.get(it.id)!.slot === 'trinket' ? 1 : 2;
  };
  let best = -1;
  choice.forEach((it, i) => {
    if (rank(it) >= 0 && (best < 0 || rank(it) > rank(choice[best]))) best = i;
  });
  return best;
}

/** 얻은 창세를 쓴다: 장착하지 못한 창세 스킬은 가장 약한 스킬과 바꿔 끼고, 창세 장신구는 칸이 차 있으면 낮은 등급의 것과 바꾼다 */
function equipGenesis(run: RunState) {
  for (const s of run.skills) {
    if (SKILLS.get(s.id)?.rarity !== 'genesis' || run.slots.includes(s.uid)) continue;
    const empty = run.slots.indexOf(null);
    if (empty >= 0) {
      run.slots[empty] = s.uid;
      continue;
    }
    let worst = -1;
    let worstScore = Infinity;
    run.slots.forEach((uid, i) => {
      const o = run.skills.find((x) => x.uid === uid);
      const d = o && SKILLS.get(o.id);
      if (!o || !d || o.from) return;
      const score = RANK[d.rarity] * 10 + o.lvl * 4;
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    });
    if (worst >= 0) equipSkill(run, worst, s.uid);
  }
  for (const it of [...run.bag]) {
    const def = EQUIPS.get(it.id);
    if (def?.rarity !== 'genesis' || def.slot !== 'trinket') continue;
    const slots = (['trinket1', 'trinket2'] as const).filter((k) => run.equip[k]?.id !== it.id);
    const target = slots.find((k) => !run.equip[k]) ?? slots.sort((a, b) => RANK[EQUIPS.get(run.equip[a]!.id)!.rarity] - RANK[EQUIPS.get(run.equip[b]!.id)!.rarity])[0];
    if (target) equipFromBag(run, it.uid, target);
  }
}

function bfsPath(run: RunState, to: number): number[] | null {
  const f = run.floor!;
  const prev = new Map<number, number>();
  const q = [f.pos];
  const seen = new Set([f.pos]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const n of f.rooms[cur].links) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      q.push(n);
    }
  }
  if (!seen.has(to)) return null;
  const path: number[] = [];
  for (let at = to; at !== f.pos; at = prev.get(at)!) path.unshift(at);
  return path;
}

/** 다음 목표 방 고르기 */
function pickTarget(run: RunState): number {
  const f = run.floor!;
  const p = run.player;
  const hpPct = p.hp / p.maxHp;
  const portal = f.rooms[f.portal];
  const d = distances(f, f.pos);
  // 정한 목표는 도착할 때까지 유지 (왔다 갔다 방지)
  const committed = f.vars.botTarget;
  if (committed !== undefined && committed >= 0 && committed !== f.pos) {
    const t = f.rooms[committed];
    // 상인·신전은 비워지지 않으므로 한 번 들렀으면 목표에서 내린다 (안 그러면 그 옆방과 무한히 오간다)
    const done = (t?.type === 'merchant' || t?.type === 'shrine') && t.visited;
    if (t && !done && (!t.cleared || t.type === 'portal' || t.rift)) return committed;
  }
  const commit = (id: number) => {
    f.vars.botTarget = id;
    return id;
  };
  const wantPortal = portal.seen && (f.tide >= 2 || run.light < 25 || f.rooms.filter((x) => x.visited).length > 14);
  if (wantPortal) {
    const camp = f.rooms.find((x) => x.type === 'camp' && !x.cleared && x.seen);
    if (hpPct < 0.55 && camp) return commit(camp.id);
    return commit(f.portal);
  }
  let best = -1;
  let bestScore = -Infinity;
  for (const r of f.rooms) {
    if (!r.seen || r.id === f.pos) continue;
    if (r.cleared && !r.rift) continue;
    if ((r.type === 'merchant' || r.type === 'shrine') && r.visited) continue;
    if (r.type === 'portal') continue;
    let s = 0;
    if (!r.scouted) s = 3;
    else
      switch (r.type) {
        case 'combat':
          s = hpPct > 0.4 ? 4 : -2;
          break;
        case 'elite':
          s = hpPct > 0.7 ? 6 : -5;
          break;
        case 'treasure':
          s = 7;
          break;
        case 'event':
          s = 4;
          break;
        case 'camp':
          s = hpPct < 0.6 || p.sanity < 50 ? 9 : 2;
          break;
        case 'merchant':
          s = p.gold >= 100 && !r.visited ? 5 : -3;
          break;
        case 'shrine':
          s = r.visited ? -3 : 2;
          break;
        case 'lord':
          s = hpPct > 0.85 ? 5 : -5;
          break;
        default:
          s = 1;
      }
    if (r.rift) s = hpPct > 0.75 ? 6 : -3;
    s -= d[r.id] * 0.8;
    if (s > bestScore) {
      bestScore = s;
      best = r.id;
    }
  }
  if (best < 0 || bestScore < -4) return portal.seen ? commit(f.portal) : best >= 0 ? commit(best) : best;
  return commit(best);
}

/** 병에 담아 둔 정수를 새길 수 있는 만큼 새긴다 (골드는 절반 넘게 남긴다). 자리가 꽉 찼으면 더 나을 때만 가장 못한 정수와 바꾼다 */
function inscribeAll(run: RunState) {
  for (let i = (run.flasks?.length ?? 0) - 1; i >= 0; i--) {
    const drop = run.flasks![i];
    if (run.player.gold < inscribeCost(drop) * 2) continue;
    let pick = pickFor(run, drop);
    let rep: string | null = null;
    const why = absorbBlock(run, drop, pick);
    if (why) {
      rep = slotFull(why) ? replaceFor(run, drop) : null;
      if (!rep) continue;
      pick = pickFor(run, drop, rep);
    }
    inscribeFlask(run, i, pick, rep);
  }
}

/**
 * 수호자 정수와 함께 배울 기술: 'skill' 항상 고른다 / 'core' 고르지 않는다 / 'auto' 빈 슬롯이 있으면 고른다.
 * 고를 땐 겹치지 않는 첫 기술 (보통 정수는 기술이 없다). replace: 깨뜨리고 바꿀 정수 (그 정수의 기술이 비우는 칸도 빈 칸으로 본다)
 */
export const botEssence: { mode: 'skill' | 'core' | 'auto' } = { mode: 'auto' };

/** 봇의 성장 개편 행동 (SIM_GROWTH로 끈다): 계약을 맺는가 */
export const botGrowth = { pacts: true };

/** 봇이 도전하는 심연 단계 (밸런스 시뮬레이션의 SIM_ASC) */
export const botAsc = { value: 0 };

function pickFor(run: RunState, drop: { id: string; color: number; guardian?: boolean }, replace: string | null = null): string | null {
  if (!drop.guardian || botEssence.mode === 'core') return null;
  const old = replace ? run.essences.find((e) => e.uid === replace) : null;
  const frees = !!old && run.skills.some((s) => s.from === old.uid && run.slots.includes(s.uid));
  if (botEssence.mode === 'auto' && !run.slots.includes(null) && !frees) return null;
  const def = ESSENCES.get(drop.id);
  return def?.actives.find((a) => !absorbBlock(run, drop, a, replace)) ?? null;
}

/** 봇이 보는 정수의 값 (정수 자리가 꽉 찼을 때 무엇을 깨뜨릴지): 힘·민첩·최대 체력·의지, 수호자 정수 */
function essenceValue(id: string, guardian: boolean): number {
  const st = essenceStats(id, guardian, true);
  return (st.str ?? 0) * 8 + (st.dex ?? 0) * 4 + (st.maxHp ?? 0) + (st.will ?? 0) * 1.5 + (guardian ? 6 : 0);
}

/** 정수 자리가 꽉 찼으면 가장 못한 정수(계층정수 제외, 고른 기술이 있으면 그만큼 더 쳐 준다)를 깨뜨릴 후보로 — 새 정수가 그보다 나을 때만 */
function replaceFor(run: RunState, drop: { id: string; color: number; guardian?: boolean }): string | null {
  if (!slotFull(absorbBlock(run, drop, null))) return null;
  let worst: string | null = null;
  let ws = Infinity;
  for (const e of run.essences) {
    if (!takesSlot(e.id)) continue;
    const v = essenceValue(e.id, !!e.guardian) + (e.skill ? 8 : 0);
    if (v < ws) {
      ws = v;
      worst = e.uid;
    }
  }
  if (!worst || essenceValue(drop.id, !!drop.guardian) <= ws) return null;
  return absorbBlock(run, drop, null, worst) ? null : worst;
}

function handleReward(run: RunState, res: SimResult) {
  const rw = run.reward!;
  res.clueOffered += rw.choice?.filter((c) => c.kind === 'skill' && clueCount(run, c.id) > 0).length ?? 0;
  for (const it of rw.items) {
    if (it.kind === 'essence') {
      const drop = { id: it.id, color: it.color ?? 0, guardian: it.guardian };
      const pick = pickFor(run, drop);
      const why = absorbBlock(run, drop, pick);
      if (why) {
        // 정수 자리가 꽉 찼으면 더 나을 때만 가장 못한 정수를 깨뜨리고 바꾼다. 아니면 병에 담아 두었다가 신전에서 새긴다
        const rep = slotFull(why) ? replaceFor(run, drop) : null;
        if (rep) takeLoot(run, it, pickFor(run, drop, rep), rep);
        else bottleEssence(run, it);
        continue;
      }
      takeLoot(run, it, pick);
      continue;
    }
    takeLoot(run, it);
  }
  if (rw.choice && !rw.chosen) {
    const emptySlot = run.slots.includes(null);
    // 유물 진화가 나왔으면 그것부터 (engine/growth.ts)
    let idx = rw.choice.findIndex((c) => c.kind === 'evolve');
    if (idx < 0) idx = rw.choice.findIndex((c) => c.kind === 'relic');
    // 창세는 무엇보다 먼저 (빈 칸이 없으면 가장 약한 스킬과 바꿔 낀다 — equipGenesis)
    if (idx < 0) idx = genesisPick(run, rw.choice);
    // 빈 칸이 있으면 등급·실마리 점수가 가장 높은 스킬, 없으면 확실히 나은 실마리 스킬만 (더 약한 스킬과 바꿔 낀다 — equipClue)
    let clue = -1;
    if (idx < 0 && emptySlot) idx = skillPick(run, rw.choice);
    if (idx < 0 && botClue.take) idx = clue = cluePick(run, rw.choice);
    if (idx < 0) idx = rw.choice.findIndex((c) => c.kind === 'upgrade');
    if (idx < 0) idx = rw.choice.findIndex((c) => c.kind === 'equip');
    // 쓸 만한 것이 없으면 고르지 않고 지나친다 — 사람이 그랬다 ("4층쯤 가면 아무것도 안 먹고 건너뛴다"). 쓰지 않는 스킬을 가방에 쌓지 않는다.
    // 희귀 이상의 후보가 있었으면 징조를 받는다 (engine/growth.ts OMEN_RARITY)
    if (idx < 0 && rw.omen && omensOf(run).length < GROWTH.omenCap && forgoChoice(run)) res.growth.skipped++;
    const it = idx >= 0 ? rw.choice[idx] : null;
    if (!it) {
      // 지나쳤다
    } else if (it.kind === 'upgrade') {
      const s = run.skills.find((x) => run.slots.includes(x.uid) && canUpgradeSkill(run, x)) ?? run.skills.find((x) => canUpgradeSkill(run, x));
      if (s) chooseLoot(run, idx, s.uid);
    } else {
      const wasClue = it.kind === 'skill' && clueCount(run, it.id) > 0;
      if (!chooseLoot(run, idx)) {
        if (wasClue) res.clueTaken++;
        if (idx === clue) equipClue(run, run.skills.find((x) => x.id === it.id));
      }
    }
  }
  // 더 좋은 장비 장착 (등급, 그리고 접사 수 — 성장 개편)
  const gearValue = (x: { id: string; aff?: string[] }) => RANK[EQUIPS.get(x.id)!.rarity] + 0.6 * (x.aff?.length ?? 0);
  for (const it of [...run.bag]) {
    const def = EQUIPS.get(it.id)!;
    const slot = def.slot === 'trinket' ? (!run.equip.trinket1 ? 'trinket1' : !run.equip.trinket2 ? 'trinket2' : null) : def.slot;
    if (!slot) continue;
    const cur = run.equip[slot];
    if (!cur || gearValue(it) > gearValue(cur)) equipFromBag(run, it.uid, slot);
  }
  equipGenesis(run);
  const next = rw.next;
  run.reward = null;
  if (next === 'rift') continueRift(run);
  else if (next === 'haven') goHaven(run);
  else if (next === 'final') winRun(run);
  else run.screen = 'dungeon';
}

function snapStart(run: RunState) {
  const p = run.player;
  return { act: run.act, hp: p.hp, maxHp: p.maxHp, level: p.level, sanity: p.sanity, str: p.str, dex: p.dex, ap: p.maxAp, relics: run.relics.length, essences: run.essences.length, skills: run.skills.length, upgrades: run.skills.filter((s) => s.lvl > 0).length, insight: p.insight, relicIds: run.relics.map((x) => x.id) };
}

/** onStep: 매 걸음마다 불린다 (밸런스 실험용 — 예: 몇 층에서 창세를 쥐여 주고 비교) */
export function simulateRun(seed: number, origin = 'soldier', maxSteps = 4000, onStep?: (run: RunState) => void): SimResult {
  const run = newRun({ seed, origin, asc: botAsc.value });
  const res: SimResult = {
    seed,
    origin,
    won: false,
    act: 1,
    reason: '',
    level: 1,
    essences: 0,
    skills: 0,
    relics: 0,
    rooms: 0,
    hours: 0,
    combats: [],
    clueOffered: 0,
    clueTaken: 0,
    clueBought: 0,
    endSkills: 0,
    endSchools: 0,
    endOffOrigin: 0,
    endBridges: 0,
    growth: { omens: 0, omenUsed: 0, skipped: 0, pacts: 0, boons: 0, evolved: 0, affixes: 0 },
    actStart: [snapStart(run)],
  };

  let lastAct = 1;
  for (let step = 0; step < maxSteps && !run.over; step++) {
    if (run.act !== lastAct) {
      lastAct = run.act;
      res.actStart.push(snapStart(run));
    }
    onStep?.(run);
    switch (run.screen) {
      case 'combat': {
        const c = new Combat(run);
        c.snapshots = false;
        const hp0 = run.player.hp;
        const dealt0 = run.stats.dmgDealt;
        const san0 = run.stats.sanityLost;
        const breaks0 = run.stats.breaks;
        let n = 0;
        while (!c.over && n++ < 120) autoTurn(c);
        if (!c.over) c.s.phase = 'defeat';
        const gs = gapStats(c.s);
        const mine = ORIGINS.get(origin)?.schools ?? [];
        res.combats.push({
          act: run.act,
          enc: c.s.enc,
          kind: c.s.kind,
          turns: c.s.turn,
          hpLost: Math.max(0, hp0 - run.player.hp),
          sanityLost: run.stats.sanityLost - san0,
          won: c.s.phase === 'victory',
          dealt: run.stats.dmgDealt - dealt0,
          breaks: run.stats.breaks - breaks0,
          muts: c.s.enemies.flatMap((e) => e.affix ?? []),
          blast: c.s.vars['abyss:blast'] ?? 0,
          blastCut: c.s.vars['abyss:cut'] ?? 0,
          gap: {
            open: gs.open,
            bigOpen: gs.bigOpen,
            harvest: gs.harvest,
            bigHarvest: gs.bigHarvest,
            same: gs.same,
            off: Object.entries(gs.by).reduce((sum, [sc, k]) => sum + (mine.includes(sc as School) ? 0 : (k ?? 0)), 0),
          },
        });
        finishCombat(run);
        break;
      }
      case 'reward':
        handleReward(run, res);
        break;
      case 'event': {
        const view = eventView(run);
        if (view && !run.event!.done) {
          const lowSan = run.player.sanity < 60;
          let ok = view.choices.map((c, i) => ({ c, i })).filter((x) => !x.c.disabled);
          if (lowSan) {
            const safe = ok.filter((x) => !/정신력 -/.test(x.c.hint ?? ''));
            if (safe.length) ok = safe;
          }
          const pickIdx = ok.length ? ok[(seed + step) % ok.length].i : 0;
          chooseEvent(run, pickIdx);
        } else leaveEvent(run);
        break;
      }
      case 'camp': {
        const p = run.player;
        const act = () => {
          const upg = run.skills.find((x) => run.slots.includes(x.uid) && canUpgradeSkill(run, x));
          if (p.hp < p.maxHp * 0.65) camp(run, 'sleep');
          else if (p.sanity < 45) camp(run, 'meditate');
          else if (upg) camp(run, 'train', upg.uid);
          else camp(run, 'sleep');
        };
        act();
        // 휴식의 징조: 방이 아직 열려 있으면 한 번 더
        const room = run.floor?.rooms[run.floor.pos];
        if (room && !room.cleared) act();
        campRefuel(run);
        leavePlace(run);
        break;
      }
      case 'merchant': {
        const shop = run.shop!;
        // 실마리 스킬이 있으면 하나를 먼저 산다 (빈 칸이 없으면 확실히 나은 것만 사서 더 약한 스킬과 바꿔 낀다)
        const ci = botClue.shop ? cluePick(run, shop.items.filter((it) => !it.sold)) : -1;
        const cit = ci >= 0 ? shop.items.filter((it) => !it.sold)[ci] : null;
        if (cit && run.player.gold >= priceOf(run, cit) && !buy(run, shop.items.indexOf(cit))) {
          res.clueBought++;
          equipClue(run, run.skills.find((x) => x.id === cit.id));
        }
        shop.items.forEach((it, i) => {
          if (it.kind === 'relic' && !it.sold && run.player.gold >= priceOf(run, it)) buy(run, i);
        });
        shop.items.forEach((it, i) => {
          if (it.kind === 'consumable' && !it.sold && run.player.gold >= priceOf(run, it) + 40) buy(run, i);
        });
        if (run.light < 60) {
          const oil = shop.items.findIndex((x) => x.kind === 'oil');
          if (oil >= 0 && run.player.gold >= priceOf(run, shop.items[oil])) buy(run, oil);
        }
        leavePlace(run);
        break;
      }
      case 'shrine': {
        shrinePray(run);
        // 계약: 체력이 넉넉하면 첫째 것을 맺는다 (성장 개편)
        if (botGrowth.pacts && run.player.hp > run.player.maxHp * 0.6) {
          const offers = shrinePacts(run);
          if (typeof offers !== 'string' && offers.length) signShrinePact(run, 0);
        }
        inscribeAll(run);
        const bad = run.madness.find((m) => !MADNESS.get(m)?.virtue);
        if (bad && run.player.gold >= 120) cureMadness(run, bad);
        leavePlace(run);
        break;
      }
      case 'haven': {
        inn(run);
        inscribeAll(run);
        for (const slot of ['weapon', 'armor'] as const) smith(run, slot);
        leaveHaven(run);
        break;
      }
      case 'dungeon': {
        const f = run.floor!;
        const here = f.rooms[f.pos];
        // 들어갈 수 없는 균열이면(균열 수호자가 없는 층 등) 그냥 지나간다
        if (here.rift && run.player.hp > run.player.maxHp * 0.75 && !enterRift(run)) break;
        if ((here.type === 'portal' || (here.type === 'lord' && !here.cleared)) && (here.type === 'portal' ? true : run.player.hp > run.player.maxHp * 0.85)) {
          if (!startGuardian(run)) break;
        }
        const target = pickTarget(run);
        if (target < 0) {
          res.reason = '갈 곳 없음';
          endRun(run, false, '길을 잃었다');
          break;
        }
        const path = bfsPath(run, target);
        if (!path || !path.length) {
          // 아는 길이 끊겼으면(눈보라·회랑 비틀림으로 정찰 정보가 지워짐) 사람처럼 옆방으로 더듬어 나간다
          const next = here.links.find((id) => !f.rooms[id].visited) ?? here.links[(f.hours + here.links.length) % here.links.length];
          if (next === undefined) {
            res.reason = '경로 없음';
            endRun(run, false, '길을 잃었다');
            break;
          }
          moveTo(run, next);
          break;
        }
        moveTo(run, path[0]);
        break;
      }
      default:
        break;
    }
  }
  res.won = !!run.over?.won;
  res.act = run.act;
  res.reason = res.reason || run.over?.reason || '시간 초과';
  res.level = run.player.level;
  res.essences = run.essences.length;
  res.skills = run.skills.length;
  res.relics = run.relics.length;
  res.rooms = run.stats.rooms;
  res.hours = run.stats.hours;
  res.genesis = run.genesis;
  res.growth.omens = run.stats.omens ?? 0;
  res.growth.omenUsed = run.stats.omensUsed ?? 0;
  res.growth.evolved = run.stats.evolved ?? 0;
  res.growth.pacts = run.pacts?.length ?? 0;
  res.growth.boons = run.pacts?.filter((p) => p.left <= 0).length ?? 0;
  res.growth.affixes = Object.values(run.equip).reduce((s, it) => s + (it?.aff?.length ?? 0), 0);
  Object.assign(res, endMix(run));
  return res;
}

/** 판 끝 장착 스킬의 계열 섞임 (정수 기술·공용 스킬은 빼고 센다) */
function endMix(run: RunState): Pick<SimResult, 'endSkills' | 'endSchools' | 'endOffOrigin' | 'endBridges'> {
  const mine = ORIGINS.get(run.origin)?.schools ?? [];
  const defs = run.slots.map((uid) => SKILLS.get(run.skills.find((s) => s.uid === uid)?.id ?? '')).filter((d) => !!d && d.school !== 'essence' && d.school !== 'neutral');
  const schools = defs.map((d) => d!.school as School);
  return {
    endSkills: schools.length,
    endSchools: new Set(schools).size,
    endOffOrigin: schools.filter((sc) => !mine.includes(sc)).length,
    endBridges: defs.filter((d) => isBridge(d!)).length,
  };
}

/** 여러 판 요약 */
export function summarize(results: SimResult[]): string {
  const n = results.length;
  const lines: string[] = [];
  const reach = (a: number) => results.filter((r) => r.act >= a || r.won).length;
  lines.push(`판 ${n} · 승리 ${results.filter((r) => r.won).length}`);
  for (let a = 2; a <= 5; a++) lines.push(`  ${a}층 도달: ${((reach(a) / n) * 100).toFixed(0)}%`);
  const byAct = new Map<number, CombatLog[]>();
  for (const r of results) for (const c of r.combats) byAct.set(c.act, [...(byAct.get(c.act) ?? []), c]);
  for (const [act, list] of [...byAct.entries()].sort((a, b) => a[0] - b[0])) {
    for (const kind of ['normal', 'elite', 'boss']) {
      const l = list.filter((c) => c.kind === kind);
      if (!l.length) continue;
      const avg = (k: keyof CombatLog) => (l.reduce((s, c) => s + (c[k] as number), 0) / l.length).toFixed(1);
      const dpt = (l.reduce((s, c) => s + c.dealt, 0) / Math.max(1, l.reduce((s, c) => s + c.turns, 0))).toFixed(0);
      lines.push(`  ${act}층 ${kind}: ${l.length}전 · 평균 피해 ${avg('hpLost')} · 정신 ${avg('sanityLost')} · ${avg('turns')}턴 · 턴당 딜 ${dpt} · 패배 ${l.filter((c) => !c.won).length}`);
    }
  }
  {
    // 붕괴 (2026-10 붕괴 개편): 전투 종류별 전투당 붕괴 횟수
    const all = results.flatMap((r) => r.combats);
    const per = (kind: string) => {
      const l = all.filter((c) => c.kind === kind);
      return (l.reduce((s, c) => s + (c.breaks ?? 0), 0) / Math.max(1, l.length)).toFixed(2);
    };
    lines.push(`  붕괴: 전투당 일반 ${per('normal')} · 정예 ${per('elite')} · 수호자 ${per('boss')}`);
  }
  {
    // 심연 압력 (2026-10): 변이마다 그 전투의 체력 손실이 같은 층·종류 평균의 몇 배였나 · 패배
    const all = results.flatMap((r) => r.combats);
    const base = new Map<string, number>();
    for (const c of all) {
      const k = `${c.act}${c.kind}`;
      if (!base.has(k)) {
        const l = all.filter((x) => x.act === c.act && x.kind === c.kind);
        base.set(k, l.reduce((sum, x) => sum + x.hpLost, 0) / Math.max(1, l.length));
      }
    }
    const by = new Map<string, { n: number; rel: number; lost: number }>();
    for (const c of all) {
      for (const m of new Set(c.muts ?? [])) {
        const v = by.get(m) ?? { n: 0, rel: 0, lost: 0 };
        v.n++;
        v.rel += c.hpLost / Math.max(1, base.get(`${c.act}${c.kind}`) ?? 1);
        v.lost += c.won ? 0 : 1;
        by.set(m, v);
      }
    }
    if (by.size) {
      lines.push(
        '  변이: ' +
          [...by.entries()]
            .sort((a, b) => b[1].rel / b[1].n - a[1].rel / a[1].n)
            .map(([m, v]) => `${m.replace('mut-', '')} ${v.n}전 ×${(v.rel / v.n).toFixed(2)} 패${v.lost}`)
            .join(' · '),
      );
    }
    const bl = all.reduce((sum, c) => sum + (c.blast ?? 0), 0);
    const cut = all.reduce((sum, c) => sum + (c.blastCut ?? 0), 0);
    lines.push(`  심연 강타: 터짐 ${bl} · 붕괴로 끊음 ${cut}`);
  }
  const bossStats = new Map<string, CombatLog[]>();
  for (const r of results) for (const c of r.combats) if (c.kind !== 'normal') bossStats.set(c.enc, [...(bossStats.get(c.enc) ?? []), c]);
  for (const [enc, l] of [...bossStats.entries()].sort()) {
    const avg = (k: keyof CombatLog) => (l.reduce((s, c) => s + (c[k] as number), 0) / l.length).toFixed(1);
    lines.push(`    ${enc}: ${l.length}전 · 피해 ${avg('hpLost')} · ${avg('turns')}턴 · 패배 ${l.filter((c) => !c.won).length}`);
  }
  const deaths = new Map<string, number>();
  for (const r of results) {
    if (r.won) continue;
    const last = r.combats[r.combats.length - 1];
    const key = last && !last.won ? `${last.enc}` : r.reason;
    deaths.set(key, (deaths.get(key) ?? 0) + 1);
  }
  lines.push('  사망 원인: ' + [...deaths.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', '));
  const avgLv = results.reduce((s, r) => s + r.level, 0) / n;
  const avgRooms = results.reduce((s, r) => s + r.rooms, 0) / n;
  const avgCombats = results.reduce((s, r) => s + r.combats.length, 0) / n;
  lines.push(`  평균 레벨 ${avgLv.toFixed(1)} · 방 ${avgRooms.toFixed(0)} · 전투 ${avgCombats.toFixed(0)} · 정수 ${(results.reduce((s, r) => s + r.essences, 0) / n).toFixed(1)}`);
  {
    const per = (f: (r: SimResult) => number) => (results.reduce((s, r) => s + f(r), 0) / n).toFixed(1);
    lines.push(`  실마리: 판당 보상 선택지에 ${per((r) => r.clueOffered)}번 · 고름 ${per((r) => r.clueTaken)} · 상점에서 삼 ${per((r) => r.clueBought)}`);
  }
  {
    // 계열 섞임: 판 끝 장착 스킬의 계열 수 분포와 출신 밖 계열 스킬 비율 (정수 기술·공용 스킬 제외)
    const dist = [1, 2, 3, 4].map((k) => results.filter((r) => (k < 4 ? r.endSchools === k : r.endSchools >= 4)).length);
    const skills = results.reduce((s, r) => s + r.endSkills, 0);
    const off = results.reduce((s, r) => s + r.endOffOrigin, 0);
    const bridges = results.reduce((s, r) => s + r.endBridges, 0);
    lines.push(`  계열 섞임(판 끝 장착): 계열 1/2/3/4+ = ${dist.map((x) => `${((x / n) * 100).toFixed(0)}%`).join('/')} · 평균 ${(results.reduce((s, r) => s + r.endSchools, 0) / n).toFixed(2)}계열 · 출신 밖 스킬 ${skills ? ((off / skills) * 100).toFixed(0) : '-'}% · 계열을 잇는 기술 ${skills ? ((bridges / skills) * 100).toFixed(0) : '-'}%`);
  }
  {
    // 창세 (판마다 하나): 얻은 판의 비율·승률과 무엇을 얻었는지
    const got = results.filter((r) => r.genesis);
    const names = new Map<string, number>();
    for (const r of got) {
      const name = SKILLS.get(r.genesis!)?.name ?? EQUIPS.get(r.genesis!)?.name ?? r.genesis!;
      names.set(name, (names.get(name) ?? 0) + 1);
    }
    lines.push(`  창세: 얻은 판 ${((got.length / n) * 100).toFixed(0)}% · 얻은 판 승률 ${got.length ? ((got.filter((r) => r.won).length / got.length) * 100).toFixed(0) : '-'}%${names.size ? ` · ${[...names.entries()].map(([k, v]) => `${k}×${v}`).join(', ')}` : ''}`);
  }
  {
    // 틈 (content/gap.ts): 전투당 열기·거두기, 이종 거두기 비율(틈이 열린 적을 다른 계열로 친 비율 — 같은 계열은 거두지 못한다), 출신 밖 계열로 거둔 비율
    type K = keyof NonNullable<CombatLog['gap']>;
    const logs = results.flatMap((r) => r.combats).filter((c) => c.gap);
    const sum = (k: K, l = logs) => l.reduce((s, c) => s + c.gap![k], 0);
    const per = (k: K, l = logs) => (sum(k, l) / Math.max(1, l.length)).toFixed(2);
    const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '-');
    const h = sum('harvest');
    lines.push(`  틈: 전투당 열기 ${per('open')} · 큰 틈 ${per('bigOpen')} · 거두기 ${per('harvest')}(큰 틈 ${per('bigHarvest')}) · 이종 거두기 비율 ${pct(h, h + sum('same'))} · 출신 밖 계열로 거둠 ${pct(sum('off'), h)}`);
    lines.push(`    층별 전투당 거두기: ${[1, 2, 3, 4, 5].map((a) => `${a}층 ${per('harvest', logs.filter((c) => c.act === a))}`).join(' · ')}`);
  }
  for (const a of [2, 3, 4, 5]) {
    const st = results.flatMap((r) => r.actStart.filter((x) => x.act === a));
    const av = (k: 'level' | 'maxHp' | 'str' | 'dex' | 'ap' | 'relics' | 'essences' | 'skills' | 'upgrades' | 'insight') => (st.reduce((s, x) => s + x[k], 0) / Math.max(1, st.length)).toFixed(1);
    if (st.length) lines.push(`  ${a}층 시작: Lv ${av('level')} · 체력 ${av('maxHp')} · 힘 ${av('str')} · 민첩 ${av('dex')} · AP ${av('ap')} · 유물 ${av('relics')} · 정수 ${av('essences')} · 스킬 ${av('skills')}(강화 ${av('upgrades')}) · 통찰 ${av('insight')}`);
  }
  {
    const per = (f: (g: SimResult['growth']) => number) => (results.reduce((s, r) => s + f(r.growth), 0) / n).toFixed(2);
    lines.push(`  성장: 판당 징조 받음 ${per((g) => g.omens)} · 이룸 ${per((g) => g.omenUsed)} · 보상 지나침 ${per((g) => g.skipped)} · 계약 ${per((g) => g.pacts)}(축복 ${per((g) => g.boons)}) · 진화 ${per((g) => g.evolved)} · 판 끝 장착 장비 접사 ${per((g) => g.affixes)}`);
  }
  void ENCOUNTERS;
  void RELICS;
  void SKILLS;
  return lines.join('\n');
}
