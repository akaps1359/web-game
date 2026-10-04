import { Combat } from '../engine/combat';
import { EQUIPS, ENCOUNTERS, MADNESS, RELICS, SKILLS } from '../engine/registry';
import {
  absorbBlock,
  canUpgradeSkill,
  chooseLoot,
  equipFromBag,
  finishCombat,
  newRun,
  takeLoot,
  type RunState,
} from '../engine/run';
import { continueRift, distances, enterRift, goHaven, moveTo, startGuardian } from '../engine/dungeon';
import { chooseEvent, eventView, leaveEvent } from '../engine/events';
import { camp, campRefuel, cureMadness, inn, leaveHaven, leavePlace, shrinePray, smith } from '../engine/places';
import { buy } from '../engine/shop';
import { endRun } from '../engine/run';
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
  /** 막 시작 시점의 상태 */
  actStart: { act: number; hp: number; maxHp: number; level: number; sanity: number; str: number; dex: number; ap: number; relics: number; essences: number; skills: number; upgrades: number; insight: number; relicIds: string[] }[];
}

const RANK: Record<Rarity, number> = { basic: 0, common: 1, uncommon: 2, rare: 3, forbidden: 3, boss: 4, special: 4 };

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
    if (t && (!t.cleared || t.type === 'portal' || t.rift)) return committed;
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
  if (best < 0 || bestScore < -4) return portal.seen ? commit(f.portal) : best;
  return commit(best);
}

function handleReward(run: RunState) {
  const rw = run.reward!;
  for (const it of rw.items) {
    if (it.kind === 'essence' && absorbBlock(run, { id: it.id, color: it.color ?? 0, guardian: it.guardian })) continue;
    takeLoot(run, it);
  }
  if (rw.choice && !rw.chosen) {
    const emptySlot = run.slots.includes(null);
    let idx = rw.choice.findIndex((c) => c.kind === 'relic');
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
  // 더 좋은 장비 장착
  for (const it of [...run.bag]) {
    const def = EQUIPS.get(it.id)!;
    const slot = def.slot === 'trinket' ? (!run.equip.trinket1 ? 'trinket1' : !run.equip.trinket2 ? 'trinket2' : null) : def.slot;
    if (!slot) continue;
    const cur = run.equip[slot];
    if (!cur || RANK[def.rarity] > RANK[EQUIPS.get(cur.id)!.rarity]) equipFromBag(run, it.uid, slot);
  }
  const next = rw.next;
  run.reward = null;
  if (next === 'rift') continueRift(run);
  else if (next === 'haven') goHaven(run);
  else if (next === 'final') endRun(run, true, '잠든 자를 다시 잠재웠다');
  else run.screen = 'dungeon';
}

function snapStart(run: RunState) {
  const p = run.player;
  return { act: run.act, hp: p.hp, maxHp: p.maxHp, level: p.level, sanity: p.sanity, str: p.str, dex: p.dex, ap: p.maxAp, relics: run.relics.length, essences: run.essences.length, skills: run.skills.length, upgrades: run.skills.filter((s) => s.lvl > 0).length, insight: p.insight, relicIds: run.relics.map((x) => x.id) };
}

export function simulateRun(seed: number, origin = 'soldier', maxSteps = 4000): SimResult {
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
    actStart: [snapStart(run)],
  };
  let lastAct = 1;
  for (let step = 0; step < maxSteps && !run.over; step++) {
    if (run.act !== lastAct) {
      lastAct = run.act;
      res.actStart.push(snapStart(run));
    }
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
        handleReward(run);
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
        shop.items.forEach((it, i) => {
          if (it.kind === 'relic' && !it.sold && run.player.gold >= it.price) buy(run, i);
        });
        shop.items.forEach((it, i) => {
          if (it.kind === 'consumable' && !it.sold && run.player.gold >= it.price + 40) buy(run, i);
        });
        if (run.light < 60) {
          const oil = shop.items.findIndex((x) => x.kind === 'oil');
          if (oil >= 0 && run.player.gold >= shop.items[oil].price) buy(run, oil);
        }
        leavePlace(run);
        break;
      }
      case 'shrine': {
        shrinePray(run);
        const bad = run.madness.find((m) => !MADNESS.get(m)?.virtue);
        if (bad && run.player.gold >= 120) cureMadness(run, bad);
        leavePlace(run);
        break;
      }
      case 'haven': {
        inn(run);
        for (const slot of ['weapon', 'armor'] as const) smith(run, slot);
        leaveHaven(run);
        break;
      }
      case 'dungeon': {
        const f = run.floor!;
        const here = f.rooms[f.pos];
        if (here.rift && run.player.hp > run.player.maxHp * 0.75) {
          enterRift(run);
          break;
        }
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
          res.reason = '경로 없음';
          endRun(run, false, '길을 잃었다');
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
