import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { CORE_HP, GENESIS, DUO_WEIGHT } from '../src/engine/run';
import { BOSS_HP_MULT } from '../src/engine/combat';
import { botEssence, simulateRun, summarize } from '../src/sim/runbot';

const N = Number(process.env.SIM_RUNS ?? 40);
/** 시드 묶음 바꾸기 (다른 판들로 다시 재 보기) */
const SEED = Number(process.env.SIM_SEED ?? 1000);
const ORIGINS = (process.env.SIM_ORIGINS ?? 'soldier,hunter,occultist').split(',');
botEssence.mode = (process.env.SIM_ESSENCE as typeof botEssence.mode) ?? 'auto';
if (process.env.SIM_CORE_HP) [CORE_HP.base, CORE_HP.step] = process.env.SIM_CORE_HP.split(',').map(Number);
if (process.env.SIM_BOSS_HP) BOSS_HP_MULT.value = Number(process.env.SIM_BOSS_HP);
// 창세 끄기 (같은 시드로 켠 판과 비교할 때): SIM_GENESIS=off
if (process.env.SIM_GENESIS === 'off') Object.assign(GENESIS, { lord: false, dropChance: 0 });
if (process.env.SIM_DUO === 'off') DUO_WEIGHT.value = 0;

it('밸런스 시뮬레이션', () => {
  const out: string[] = [];
  for (const origin of ORIGINS) {
    const results = [];
    for (let i = 0; i < N; i++) results.push(simulateRun(SEED + i * 7919, origin));
    out.push(`[${origin}]\n${summarize(results)}`);
  }
  const text = out.join('\n\n');
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(process.env.SIM_OUT ?? 'sim/out/balance.txt', text);
  console.log(text);
});
