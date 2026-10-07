import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { CORE_HP, GENESIS, ORIGIN_WEIGHT } from '../src/engine/run';
import { CLUE } from '../src/engine/keywords';
import { BOSS_HP_MULT } from '../src/engine/combat';
import { botAsc, botClue, botEssence, simulateRun, summarize } from '../src/sim/runbot';
import { GAP } from '../src/content/gap';

const N = Number(process.env.SIM_RUNS ?? 40);
/** 시드 묶음 바꾸기 (다른 판들로 다시 재 보기) */
const SEED = Number(process.env.SIM_SEED ?? 1000);
const ORIGINS = (process.env.SIM_ORIGINS ?? 'soldier,hunter,occultist').split(',');
botEssence.mode = (process.env.SIM_ESSENCE as typeof botEssence.mode) ?? 'auto';
if (process.env.SIM_CORE_HP) [CORE_HP.base, CORE_HP.step] = process.env.SIM_CORE_HP.split(',').map(Number);
if (process.env.SIM_BOSS_HP) BOSS_HP_MULT.value = Number(process.env.SIM_BOSS_HP);
// 창세 끄기 (같은 시드로 켠 판과 비교할 때): SIM_GENESIS=off
if (process.env.SIM_GENESIS === 'off') Object.assign(GENESIS, { lord: false, dropChance: 0 });
// 실마리 보상 끄기 (같은 시드로 켠 판과 비교할 때): SIM_CLUE=off
if (process.env.SIM_CLUE === 'off') Object.assign(CLUE, { per: 0, guaranteed: false, everyChoice: false });
if (process.env.SIM_CLUE_ALL) CLUE.everyChoice = true;
if (process.env.SIM_CLUE_UNLINKED) CLUE.unlinked = Number(process.env.SIM_CLUE_UNLINKED);
// 봇이 실마리 스킬을 따로 챙기지 않게 (보상 생성기만의 효과를 볼 때): SIM_BOT_CLUE=off
if (process.env.SIM_BOT_CLUE === 'off') Object.assign(botClue, { take: false, shop: false, swap: false });
if (process.env.SIM_BOT_CLUE_W) botClue.weight = Number(process.env.SIM_BOT_CLUE_W);
// 2층부터 출신 계열 가중치 (기본 1.5, 예전처럼 2): SIM_ORIGIN_LATE=2
if (process.env.SIM_ORIGIN_LATE) ORIGIN_WEIGHT.late = Number(process.env.SIM_ORIGIN_LATE);
// 심연 단계 (0~15): SIM_ASC=10
if (process.env.SIM_ASC) botAsc.value = Number(process.env.SIM_ASC);
// 틈 수치 바꾸기: SIM_GAP='{"crit":1.5,"bleed":2}' · 거두기 끄기: SIM_GAP=off
if (process.env.SIM_GAP === 'off') GAP.perTurn = 0;
else if (process.env.SIM_GAP) Object.assign(GAP, JSON.parse(process.env.SIM_GAP));

it('밸런스 시뮬레이션', () => {
  const out: string[] = [];
  for (const origin of ORIGINS) {
    const results = [];
    for (let i = 0; i < N; i++) results.push(simulateRun(SEED + i * 7919, origin));
    out.push(`[${origin}${botAsc.value ? ` · 심연 ${botAsc.value}` : ''}]\n${summarize(results)}`);
  }
  const text = out.join('\n\n');
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(process.env.SIM_OUT ?? 'sim/out/balance.txt', text);
  console.log(text);
});
