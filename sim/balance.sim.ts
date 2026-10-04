import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { simulateRun, summarize } from '../src/sim/runbot';

const N = Number(process.env.SIM_RUNS ?? 40);
const ORIGINS = (process.env.SIM_ORIGINS ?? 'soldier,hunter,occultist').split(',');

it('밸런스 시뮬레이션', () => {
  const out: string[] = [];
  for (const origin of ORIGINS) {
    const results = [];
    for (let i = 0; i < N; i++) results.push(simulateRun(1000 + i * 7919, origin));
    out.push(`[${origin}]\n${summarize(results)}`);
  }
  const text = out.join('\n\n');
  mkdirSync('sim/out', { recursive: true });
  writeFileSync('sim/out/balance.txt', text);
  console.log(text);
});
