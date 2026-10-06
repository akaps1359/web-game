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
  finishCombat,
  newRun,
  takeLoot,
  type RunState,
} from '../engine/run';
import { continueRift, distances, enterRift, goHaven, moveTo, startGuardian } from '../engine/dungeon';
import { chooseEvent, eventView, leaveEvent } from '../engine/events';
import { camp, campRefuel, cureMadness, inn, inscribeFlask, leaveHaven, leavePlace, shrinePray, smith } from '../engine/places';
import { buy, priceOf } from '../engine/shop';
import { endRun, winRun } from '../engine/run';
import { isGenesisLoot, type LootItem } from '../engine/run';
import { ORIGINS } from '../engine/registry';
import { autoTurn } from './bot';
import type { Rarity } from '../engine/types';

export interface CombatLog {
  act: number;
  enc: string;
  kind: string;
  turns: number;
  hpLost: number;
  sanityLost: number;
  won: boolean;
  dealt: number;
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
  /** 합기: 보상 선택지에 나온 수 · 상점에 나온 수 · 이 판에서 얻은 합기 (얻은 순서) */
  duoOffered: number;
  duoShop: number;
  duos: string[];
  /** 이 판에서 얻은 창세 (없으면 undefined) */
  genesis?: string;
  /** 막 시작 시점의 상태 */
  actStart: { act: number; hp: number; maxHp: number; level: number; sanity: number; str: number; dex: number; ap: number; relics: number; essences: number; skills: number; upgrades: number; insight: number; relicIds: string[] }[];
}

const RANK: Record<Rarity, number> = { basic: 0, common: 1, uncommon: 2, rare: 3, forbidden: 3, boss: 4, special: 4, genesis: 5 };

/** 합기(두 계열을 엮은 스킬)인가 */
const isDuo = (id: string) => !!SKILLS.get(id)?.duo;

/** 봇의 합기 처리: take 보상에서 고른다 · shop 상점에서 산다 · swap 빈 칸이 없으면 가장 약한 스킬과 바꿔 낀다 */
export const botDuo = { take: true, shop: true, swap: true };

/** 탄약을 채우는 스킬 (재장전·엄폐 재장전) / 탄약을 쓰는 사격 스킬 */
const refills = (id: string) => !!SKILLS.get(id)?.tags.includes('ammo') && !SKILLS.get(id)?.tags.includes('gun');
const shoots = (id: string) => !!SKILLS.get(id)?.tags.includes('gun');

/**
 * 장착하지 못한 합기를 끼운다 — 빈 칸이 없으면 가장 약한 장착 스킬과 바꾼다.
 * 약한 순서: 등급이 낮고, 강화하지 않았고, 장착한 합기들이 거둘 상태를 쌓는 계열(짝)이 아닌 것.
 * 합기·정수 기술은 빼지 않고, 사격 스킬이 남아 있으면 하나뿐인 재장전도 빼지 않는다
 */
function equipDuos(run: RunState) {
  for (const s of run.skills) {
    const def = SKILLS.get(s.id);
    if (!def?.duo || run.slots.includes(s.uid)) continue;
    const empty = run.slots.indexOf(null);
    if (empty >= 0) {
      run.slots[empty] = s.uid;
      continue;
    }
    if (!botDuo.swap) continue;
    const partners = new Set<string>(def.duo);
    for (const uid of run.slots) {
      const d = SKILLS.get(run.skills.find((x) => x.uid === uid)?.id ?? '');
      for (const sc of d?.duo ?? []) partners.add(sc);
    }
    const equipped = [...run.slots.map((uid) => run.skills.find((x) => x.uid === uid)?.id ?? ''), s.id];
    const lastRefill = equipped.filter(refills).length <= 1 && equipped.some(shoots);
    let worst = -1;
    let worstScore = Infinity;
    run.slots.forEach((uid, i) => {
      const o = run.skills.find((x) => x.uid === uid);
      const d = o && SKILLS.get(o.id);
      if (!o || !d || d.duo || o.from || (lastRefill && refills(o.id))) return;
      const score = RANK[d.rarity] * 10 + o.lvl * 4 + (partners.has(d.school) ? 5 : 0);
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    });
    if (worst >= 0) equipSkill(run, worst, s.uid);
  }
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
      if (!o || !d || d.duo || o.from) return;
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

/** 병에 담아 둔 정수를 새길 수 있는 만큼 새긴다 (골드는 절반 넘게 남긴다) */
function inscribeAll(run: RunState) {
  for (let i = (run.flasks?.length ?? 0) - 1; i >= 0; i--) {
    const drop = run.flasks![i];
    if (run.player.gold < inscribeCost(drop) * 2) continue;
    inscribeFlask(run, i, pickFor(run, drop));
  }
}

/**
 * 수호자 정수와 함께 배울 기술: 'skill' 항상 고른다 / 'core' 고르지 않는다 / 'auto' 빈 슬롯이 있으면 고른다.
 * 고를 땐 겹치지 않는 첫 기술 (보통 정수는 기술이 없다)
 */
export const botEssence: { mode: 'skill' | 'core' | 'auto' } = { mode: 'auto' };

function pickFor(run: RunState, drop: { id: string; color: number; guardian?: boolean }): string | null {
  if (!drop.guardian || botEssence.mode === 'core') return null;
  if (botEssence.mode === 'auto' && !run.slots.includes(null)) return null;
  const def = ESSENCES.get(drop.id);
  return def?.actives.find((a) => !absorbBlock(run, drop, a)) ?? null;
}

function handleReward(run: RunState, res: SimResult) {
  const rw = run.reward!;
  res.duoOffered += rw.choice?.filter((c) => c.kind === 'skill' && isDuo(c.id)).length ?? 0;
  for (const it of rw.items) {
    if (it.kind === 'essence') {
      const drop = { id: it.id, color: it.color ?? 0, guardian: it.guardian };
      const pick = pickFor(run, drop);
      // 흡수 한도가 차 있으면 병에 담아 두었다가 신전에서 새긴다
      if (absorbBlock(run, drop, pick)) {
        bottleEssence(run, it);
        continue;
      }
      takeLoot(run, it, pick);
      continue;
    }
    takeLoot(run, it);
  }
  if (rw.choice && !rw.chosen) {
    const emptySlot = run.slots.includes(null);
    let idx = rw.choice.findIndex((c) => c.kind === 'relic');
    // 창세는 무엇보다 먼저 (빈 칸이 없으면 가장 약한 스킬과 바꿔 낀다 — equipGenesis)
    if (idx < 0) idx = genesisPick(run, rw.choice);
    // 합기는 빈 칸이 없어도 고른다 (가장 약한 스킬과 바꿔 낀다)
    if (idx < 0 && botDuo.take) idx = rw.choice.findIndex((c) => c.kind === 'skill' && isDuo(c.id));
    if (idx < 0 && emptySlot) idx = rw.choice.findIndex((c) => c.kind === 'skill');
    if (idx < 0) idx = rw.choice.findIndex((c) => c.kind === 'upgrade');
    if (idx < 0) idx = rw.choice.findIndex((c) => c.kind === 'equip');
    if (idx < 0) idx = 0;
    const it = rw.choice[idx];
    if (it.kind === 'upgrade') {
      const s = run.skills.find((x) => run.slots.includes(x.uid) && canUpgradeSkill(run, x)) ?? run.skills.find((x) => canUpgradeSkill(run, x));
      if (s) chooseLoot(run, idx, s.uid);
    } else chooseLoot(run, idx);
  }
  equipDuos(run);
  // 더 좋은 장비 장착
  for (const it of [...run.bag]) {
    const def = EQUIPS.get(it.id)!;
    const slot = def.slot === 'trinket' ? (!run.equip.trinket1 ? 'trinket1' : !run.equip.trinket2 ? 'trinket2' : null) : def.slot;
    if (!slot) continue;
    const cur = run.equip[slot];
    if (!cur || RANK[def.rarity] > RANK[EQUIPS.get(cur.id)!.rarity]) equipFromBag(run, it.uid, slot);
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
  const run = newRun({ seed, origin });
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
    duoOffered: 0,
    duoShop: 0,
    duos: [],
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
        let n = 0;
        while (!c.over && n++ < 120) autoTurn(c);
        if (!c.over) c.s.phase = 'defeat';
        res.combats.push({
          act: run.act,
          enc: c.s.enc,
          kind: c.s.kind,
          turns: c.s.turn,
          hpLost: Math.max(0, hp0 - run.player.hp),
          sanityLost: run.stats.sanityLost - san0,
          won: c.s.phase === 'victory',
          dealt: run.stats.dmgDealt - dealt0,
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
        const upg = run.skills.find((x) => run.slots.includes(x.uid) && canUpgradeSkill(run, x));
        if (p.hp < p.maxHp * 0.65) camp(run, 'sleep');
        else if (p.sanity < 45) camp(run, 'meditate');
        else if (upg) camp(run, 'train', upg.uid);
        else camp(run, 'sleep');
        campRefuel(run);
        leavePlace(run);
        break;
      }
      case 'merchant': {
        const shop = run.shop!;
        res.duoShop += shop.items.filter((it) => it.kind === 'skill' && isDuo(it.id)).length;
        // 합기가 있으면 먼저 산다 (빈 칸이 없으면 가장 약한 스킬과 바꿔 낀다)
        shop.items.forEach((it, i) => {
          if (botDuo.shop && it.kind === 'skill' && isDuo(it.id) && !it.sold && run.player.gold >= priceOf(run, it)) buy(run, i);
        });
        equipDuos(run);
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
        // 이벤트 등에서 얻은 합기도 낀다
        equipDuos(run);
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
  res.duos = run.skills.filter((s) => isDuo(s.id)).map((s) => s.id);
  res.genesis = run.genesis;
  return res;
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
    const anyDuo = results.filter((r) => r.duos.length).length;
    lines.push(`  합기: 판당 보상 선택지에 ${per((r) => r.duoOffered)}번 · 상점에 ${per((r) => r.duoShop)}번 · 얻음 ${per((r) => r.duos.length)}개 · 하나라도 얻은 판 ${((anyDuo / n) * 100).toFixed(0)}% · 얻은 판 승률 ${anyDuo ? ((results.filter((r) => r.duos.length && r.won).length / anyDuo) * 100).toFixed(0) : '-'}%`);
    const got = new Map<string, number>();
    for (const r of results) for (const id of r.duos) got.set(id, (got.get(id) ?? 0) + 1);
    if (got.size) lines.push('    ' + [...got.entries()].sort((a, b) => b[1] - a[1]).map(([id, k]) => `${SKILLS.get(id)?.name ?? id}×${k}`).join(', '));
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
  for (const a of [2, 3, 4, 5]) {
    const st = results.flatMap((r) => r.actStart.filter((x) => x.act === a));
    const av = (k: 'level' | 'maxHp' | 'str' | 'dex' | 'ap' | 'relics' | 'essences' | 'skills' | 'upgrades' | 'insight') => (st.reduce((s, x) => s + x[k], 0) / Math.max(1, st.length)).toFixed(1);
    if (st.length) lines.push(`  ${a}층 시작: Lv ${av('level')} · 체력 ${av('maxHp')} · 힘 ${av('str')} · 민첩 ${av('dex')} · AP ${av('ap')} · 유물 ${av('relics')} · 정수 ${av('essences')} · 스킬 ${av('skills')}(강화 ${av('upgrades')}) · 통찰 ${av('insight')}`);
  }
  void ENCOUNTERS;
  void RELICS;
  void SKILLS;
  return lines.join('\n');
}
