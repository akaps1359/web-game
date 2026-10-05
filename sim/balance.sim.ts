import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { CORE_HP } from '../src/engine/run';
import { botEssence, simulateRun, summarize } from '../src/sim/runbot';

const N = Number(process.env.SIM_RUNS ?? 40);
const ORIGINS = (process.env.SIM_ORIGINS ?? 'soldier,hunter,occultist').split(',');
botEssence.mode = (process.env.SIM_ESSENCE as typeof botEssence.mode) ?? 'auto';
if (process.env.SIM_CORE_HP) [CORE_HP.base, CORE_HP.step] = process.env.SIM_CORE_HP.split(',').map(Number);

it('밸런스 시뮬레이션', () => {
  const out: string[] = [];
  for (const origin of ORIGINS) {
    const results = [];
    for (let i = 0; i < N; i++) results.push(simulateRun(1000 + i * 7919, origin));
    out.push(`[${origin}]\n${summarize(results)}`);
  }
  const text = out.join('\n\n');
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(process.env.SIM_OUT ?? 'sim/out/balance.txt', text);
  console.log(text);
});
