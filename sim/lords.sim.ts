import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import '../src/content';
import { FLOORS, reg } from '../src/engine/registry';
import { startCombat, type RunState } from '../src/engine/run';
import { simulateRun } from '../src/sim/runbot';
import { autoTurn } from '../src/sim/bot';

/*
 * 계층군주 난이도 (2026-10-09, GDD 2.3·10.7): 군주는 판마다 드물게 깨어나 밸런스 시뮬레이션으로는 잴 수 없다.
 * 봇이 층마다 수호자 앞에 선 순간(숨 고른 뒤)의 판을 떠서, 같은 빌드·같은 체력으로 그 층 계층군주와 층 수호자를 따로 치른다.
 * npm run sim:lords — SIM_RUNS(출신마다 판 수, 20) · SIM_SEED · SIM_ORIGINS · SIM_POWER='{"dmg":1.5,"taken":0.85}' · SIM_OUT
 */
const RUNS = Number(process.env.SIM_RUNS ?? 20);
const SEED = Number(process.env.SIM_SEED ?? 4242);
const ORIGINS = (process.env.SIM_ORIGINS ?? 'soldier,hunter,occultist').split(',');

// 사람처럼 강한 플레이어 흉내 (balance.sim.ts와 같다)
if (process.env.SIM_POWER) {
  const pw = { dmg: 1, taken: 1, ...JSON.parse(process.env.SIM_POWER) } as { dmg: number; taken: number };
  reg.rules([
    {
      id: 'sim-power',
      hooks: {
        modDamageOut(c, _s, d) {
          if (d.src === c.p && d.tgt !== c.p) d.mult *= pw.dmg;
        },
        modDamageIn(c, _s, d) {
          if (d.tgt === c.p && d.src && d.src !== c.p && d.attack) d.mult *= pw.taken;
        },
      },
    },
  ]);
}

type Fight = { won: boolean; hpLost: number; maxHp: number; turns: number };

function fight(snap: RunState, enc: string): Fight {
  const run = structuredClone(snap);
  run.combat = null;
  const hp0 = run.player.hp;
  const c = startCombat(run, enc, { anomaly: null });
  c.snapshots = false;
  let n = 0;
  while (!c.over && n++ < 150) autoTurn(c);
  const won = c.s.phase === 'victory';
  return { won, hpLost: won ? Math.max(0, hp0 - run.player.hp) : hp0, maxHp: run.player.maxHp, turns: c.s.turn };
}

function line(xs: Fight[]): string {
  if (!xs.length) return '-';
  const wins = xs.filter((x) => x.won);
  const hp = wins.reduce((s, x) => s + x.hpLost / x.maxHp, 0) / Math.max(1, wins.length);
  const turns = xs.reduce((s, x) => s + x.turns, 0) / xs.length;
  return `승 ${((100 * wins.length) / xs.length).toFixed(1)}% (${xs.length}전) · 이긴 판 잃은 체력 ${Math.round(100 * hp)}% · ${turns.toFixed(1)}턴`;
}

it('계층군주 난이도', () => {
  const snaps: Record<number, RunState[]> = {};
  for (const origin of ORIGINS) {
    for (let i = 0; i < RUNS; i++) {
      const seen = new Set<number>();
      simulateRun(SEED + i * 7919, origin, 4000, (run) => {
        if (run.screen !== 'combat' || !run.combat || !run.floor || seen.has(run.act)) return;
        if (run.combat.enc !== run.floor.bossEnc) return;
        seen.add(run.act);
        (snaps[run.act] ??= []).push(structuredClone(run));
      });
    }
  }
  const out: string[] = [];
  for (const act of Object.keys(snaps).map(Number).sort()) {
    const lord = FLOORS.get(act)?.lord;
    if (!lord) continue;
    const lords: Fight[] = [];
    const bosses: Fight[] = [];
    for (const s of snaps[act]) {
      lords.push(fight(s, lord.enc));
      bosses.push(fight(s, s.floor!.bossEnc));
    }
    out.push(`${act}층 군주 ${lord.name}: ${line(lords)}`, `${act}층 수호자: ${line(bosses)}`);
  }
  const text = out.join('\n');
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(process.env.SIM_OUT ?? 'sim/out/lords.txt', text);
  console.log(text);
});
