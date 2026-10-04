import { Combat } from '../engine/combat';
import type { RunState } from '../engine/run';

/** 적 의도 기준으로 이번 턴 받을 피해 예상 */
export function incoming(c: Combat): number {
  let sum = 0;
  for (const e of c.alive) {
    const it = e.intent;
    if (!it || e.broken === 2 || (e.st.stun ?? 0) > 0) continue;
    if (it.dmg && (it.kind === 'attack' || it.extra?.includes('attack') || it.kind === 'horror')) {
      sum += c.preview(e, c.p, it.dmg, 'blunt') * (it.hits ?? 1);
    }
  }
  return sum;
}

function score(before: RunState, after: RunState, need: number): number {
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
    if (ea.broken === 2 && eb.broken !== 2) s += 10 + (eb.intent?.dmg ?? 0) * (eb.intent?.hits ?? 1) * 0.8;
    s += Math.max(0, eb.poise - ea.poise) * 2;
    const dot = (st: Record<string, number>) => (st.bleed ?? 0) * 1.2 + (st.poison ?? 0) * 1.5 + (st.burn ?? 0) * 1.2 + (st.doom ?? 0) * 0.4;
    s += Math.max(0, dot(ea.st) - dot(eb.st));
    const deb = (st: Record<string, number>) => (st.weak ?? 0) * 2 + (st.vuln ?? 0) * 2.5 + (st.mark ?? 0) * 1.5 + (st.madden ?? 0) * 2 + (st.stun ?? 0) * 8;
    s += Math.max(0, deb(ea.st) - deb(eb.st));
    s += Math.max(0, (eb.st.evasive ?? 0) - (ea.st.evasive ?? 0)) * 6;
    s += Math.max(0, (eb.st.barrier ?? 0) - (ea.st.barrier ?? 0)) * 0.8;
  }
  const pb = before.player;
  const pa = after.player;
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
  s += (a.ap - b.ap) * 4;
  if (b.ammo !== a.ammo && a.ammo > b.ammo) s += (a.ammo - b.ammo) * 0.8;
  return s;
}

/** 봇이 한 턴을 진행 */
export function autoTurn(c: Combat) {
  const run = c.run;
  for (let guard = 0; guard < 20 && c.s.phase === 'player'; guard++) {
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
        const s = score(run, clone, need) - c.costOf(info) * 0.5;
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
