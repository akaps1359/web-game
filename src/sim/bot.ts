import { Combat, GUARD, breakProfile } from '../engine/combat';
import type { RunState } from '../engine/run';
import { ENEMIES } from '../engine/registry';
import { gapStats } from '../content/gap';

/**
 * 틈 (content/gap.ts): 틈이 열린 적에게 다른 계열 기술을 우선한다 — 거두면 harvest(큰 틈이면 big을 더).
 * 거둔 보너스(치명·출혈·인장·방어도·버팀)는 아래 점수에 이미 들어가므로 이것은 이종 연계를 고르게 하는 덤이다.
 * 여는 것에는 점수를 주지 않는다 (약점을 치면 저절로 열리고, 덤을 주면 퍼즐 목표보다 앞서는 일이 생겼다)
 */
export const BOT_GAP = { harvest: 3, big: 1 };

/**
 * 지속 피해(출혈·독·화상)의 값: 앞으로 turns턴 동안 들어갈 피해의 합 (대상의 남은 체력까지).
 * 예전엔 한 겹에 1.2~1.5점으로 쳐서, 길게 싸우는 정예·수호자에게 독·출혈을 쌓는 값을 크게 낮춰 봤다
 * (독 10에 3을 더하면 4턴 동안 12가 더 들어가는데 4.5점). 사람은 수호자에게 독을 쌓는다 — 사냥꾼 승률 +7%p (2026-10 최종 밸런스)
 */
export const BOT_DOT: { turns: Record<'normal' | 'elite' | 'boss', number> } = { turns: { normal: 2, elite: 3, boss: 4 } };

/**
 * 이 행동으로 적의 공격 의도가 세지면 그만큼(피해 1당 k점) 손해로 친다. 사람은 '맞을수록 세지는' 의도(재에 묻힌 것의 재 속의 반격 등)를 보고 손을 멈춘다.
 * 예전 봇은 후열의 재 속을 원거리로 계속 쏴 반격을 키웠다 (2026-10 최종 밸런스: 시작 덱 군인이 재에 묻힌 것에게 30번 중 2번 지던 것이 0번)
 */
export const BOT_INC = { k: 1 };

/**
 * 버팀 (2026-10 붕괴 개편): 버팀 1의 값. 약점이 아닌 타격은 GUARD.chip분의 1씩 센다.
 * 붕괴는 막은 공격을 건너뛰는 차례 수만큼 센다 (일반 적은 오래 쉰다).
 * 버팀 1의 값을 큰 적일수록 크게(붕괴 창에서 더 들어갈 피해 ÷ 최대 버팀) 쳐 보니 봇이 버팀만 쫓다 막기를 놓쳐 더 약해졌다
 * (최대 체력의 30%를 창으로 보면 승률 54.8 → 49.0%, 10%면 52.5%). 사람의 감에 가까운 것은 고르게 2점
 */
export const BOT_BREAK = { pip: 2 };

/** n에서 시작해 턴마다 1씩 줄어드는 지속 피해가 t턴 동안 주는 피해 */
const dotSum = (n: number, t: number) => {
  const k = Math.min(n, t);
  return k * n - (k * (k - 1)) / 2;
};

/** 적 의도 기준으로 이번 턴 받을 피해 예상 */
export function incoming(c: Combat): number {
  let sum = 0;
  for (const e of c.alive) {
    // 봇도 사람처럼 보이는 의도만 안다 (속임수 의도에 속는다)
    const it = c.shownIntent(e);
    if (!it || e.broken === 2 || (e.st.stun ?? 0) > 0) continue;
    if (it.dmg && (it.kind === 'attack' || it.extra?.includes('attack') || it.kind === 'horror')) {
      sum += c.preview(e, c.p, it.dmg, 'blunt') * (it.hits ?? 1);
    }
  }
  return sum;
}

function score(before: RunState, after: RunState, need: number, cost = 0): number {
  const b = before.combat!;
  const a = after.combat!;
  if (a.phase === 'victory') return 1000;
  if (a.phase === 'defeat') return -1000;
  let s = 0;
  for (const eb of b.enemies) {
    const ea = a.enemies.find((x) => x.uid === eb.uid);
    if (!ea || eb.dead) continue;
    s += Math.max(0, eb.hp - Math.max(0, ea.hp)) * 1.0;
    s += Math.max(0, eb.block - ea.block) * 0.3;
    if (ea.dead && !eb.dead) s += 12;
    if (ea.mem.revived && !eb.mem.revived) s += 12 + eb.hp;
    if (ea.mem.transformed && !eb.mem.transformed) s += 25;
    // 붕괴: 막은 공격(건너뛰는 차례 수만큼) · 버팀 1은 BOT_BREAK.pip (약점이 아닌 타격은 GUARD.chip분의 1)
    const def = ENEMIES.get(eb.def);
    if (ea.broken === 2 && eb.broken !== 2) s += 10 + (eb.intent?.dmg ?? 0) * (eb.intent?.hits ?? 1) * 0.8 * (def ? breakProfile(def).stun : 1);
    s += Math.max(0, eb.poise - ea.poise) * BOT_BREAK.pip;
    if (ea.broken === 0 && eb.broken === 0) s += (Math.max(0, (ea.chip ?? 0) - (eb.chip ?? 0)) / GUARD.chip) * BOT_BREAK.pip;
    // 지속 피해: 둘 다 이 행동 뒤의 체력까지만 센다 (때려서 줄인 체력을 지속 피해 손해로 치지 않게)
    const T = BOT_DOT.turns[b.kind as 'normal'] ?? BOT_DOT.turns.normal;
    const hpLeft = Math.max(0, ea.hp);
    const dot = (st: Record<string, number>) => Math.min(hpLeft, dotSum(st.bleed ?? 0, T) + dotSum(st.poison ?? 0, T) + dotSum(st.burn ?? 0, T)) + (st.doom ?? 0) * 0.4;
    s += Math.max(0, dot(ea.st) - dot(eb.st));
    const deb = (st: Record<string, number>) => (st.weak ?? 0) * 2 + (st.vuln ?? 0) * 2.5 + (st.mark ?? 0) * 1.5 + (st.madden ?? 0) * 2 + (st.stun ?? 0) * 8;
    s += Math.max(0, deb(ea.st) - deb(eb.st));
    s += Math.max(0, (eb.st.evasive ?? 0) - (ea.st.evasive ?? 0)) * 6;
    s += Math.max(0, (eb.st.barrier ?? 0) - (ea.st.barrier ?? 0)) * 0.8;
  }
  const pb = before.player;
  const pa = after.player;
  // 즉사기를 막는 퍼즐 목표: 풀면 크게, 다가가면 그만큼
  const ob = b.obj;
  if (ob) {
    const oa = a.obj;
    if (!oa) s += 400;
    else {
      if (ob.hit && oa.hit) s += Math.max(0, ob.hit.need - oa.hit.need) * 4;
      if (ob.break) {
        const eb = b.enemies.find((x) => x.uid === ob.break);
        const ea = a.enemies.find((x) => x.uid === ob.break);
        if (eb && ea) s += Math.max(0, eb.poise - ea.poise) * 25 + (ea.broken === 2 && eb.broken !== 2 ? 300 : 0);
      }
      if (ob.block) s += (Math.min(ob.block, pa.block) - Math.min(ob.block, pb.block)) * 6;
      if (ob.types && oa.types) s += (ob.types.length - oa.types.length) * 120;
      if (ob.kill) s += ob.kill.filter((uid) => !b.enemies.find((x) => x.uid === uid)?.dead && a.enemies.find((x) => x.uid === uid)?.dead).length * 150;
      // 가만히 있어야 풀리는 목표: 무엇이든 하면 손해
      if (ob.quiet) s -= 200;
    }
  }
  const blockGain = pa.block - pb.block;
  const stillNeed = Math.max(0, need - pb.block);
  s += Math.min(blockGain, stillNeed) * 1.1 + Math.max(0, blockGain - stillNeed) * 0.15;
  s += Math.max(0, (pa.st.barrier ?? 0) - (pb.st.barrier ?? 0)) * 0.7;
  s += (pa.hp - pb.hp) * 1.0;
  s += (pa.sanity - pb.sanity) * 0.35;
  const buff = (st: Record<string, number>) =>
    (st.str ?? 0) * 6 + (st.dex ?? 0) * 4 + (st.ritual ?? 0) * 12 + (st.tentacle ?? 0) * 8 + (st.aim ?? 0) * 4 + (st.energized ?? 0) * 6 + (st.evasive ?? 0) * 5 + (st.counter ?? 0) * 1 + (st.retain ?? 0) * 2 + (st.ward ?? 0) * 3 + (st.frenzy ?? 0) * 0.1;
  s += buff(pa.st) - buff(pb.st);
  s += (pa.insight - pb.insight) * 6;
  s += (a.ap - b.ap + cost) * 4;
  if (b.ammo !== a.ammo && a.ammo > b.ammo) s += (a.ammo - b.ammo) * 0.8;
  // 틈: 다른 계열로 거두기 · 열기
  const gb = gapStats(b);
  const ga = gapStats(a);
  s += (ga.harvest - gb.harvest) * BOT_GAP.harvest + (ga.bigHarvest - gb.bigHarvest) * BOT_GAP.big;
  return s;
}

/** 봇이 한 턴을 진행 */
export function autoTurn(c: Combat) {
  const run = c.run;
  for (let guard = 0; guard < 20 && c.s.phase === 'player'; guard++) {
    // 걸린 선택지부터 (콘텐츠가 정해 둔 우선순위대로)
    if (c.s.choice) {
      const o = [...c.s.choice.options].sort((a, b) => (b.bot ?? 0) - (a.bot ?? 0))[0];
      if (!o || c.choose(o.id)) break;
      continue;
    }
    const refs = ['weapon', 'armor', ...(run.slots.filter(Boolean) as string[])];
    const need = incoming(c);
    let best: { ref: string; t: string | null; s: number } | null = null;
    for (const ref of refs) {
      if (c.blockReason(ref)) continue;
      const info = c.skillInfo(ref)!;
      const targets = info.def.target === 'single' ? c.validTargets(info.def).map((e) => e.uid) : [null];
      for (const t of targets) {
        const clone = structuredClone(run) as RunState;
        const sim = new Combat(clone);
        sim.snapshots = false;
        if (sim.useSkill(ref, t)) continue;
        const cost = c.costOf(info);
        const s = score(run, clone, need, cost) - cost * 0.3 - Math.max(0, incoming(sim) - need) * BOT_INC.k;
        if (!best || s > best.s) best = { ref, t, s };
      }
    }
    // 아무것도 안 하는 턴이 이어지면 최선의 행동을 강제 (교착 방지)
    const idle = c.s.vars.botIdle ?? 0;
    if (!best || (best.s <= 0.5 && idle < 2)) break;
    c.useSkill(best.ref, best.t);
    c.s.vars.botIdle = best.s <= 0.5 ? idle : 0;
  }
  if (c.s.phase === 'player') {
    c.s.vars.botIdle = (c.s.vars.botIdle ?? 0) + (c.s.used === 0 ? 1 : 0);
    c.endTurn();
  }
}
