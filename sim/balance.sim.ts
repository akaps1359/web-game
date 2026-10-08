import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { CORE_HP, GENESIS, ORIGIN_WEIGHT } from '../src/engine/run';
import { CLUE } from '../src/engine/keywords';
import { BOSS_HP_MULT, BREAK, GUARD } from '../src/engine/combat';
import { botAsc, botClue, botEssence, simulateRun, summarize } from '../src/sim/runbot';
import { BOT_BREAK } from '../src/sim/bot';
import { GAP } from '../src/content/gap';
import { reg } from '../src/engine/registry';

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
// 버팀·붕괴 수치 바꾸기 (2026-10 붕괴 개편): SIM_GUARD='{"mult":0.4,"chip":4}' · SIM_BREAK='{"boss":{"vuln":1.75},"normal":{"stun":1}}'
if (process.env.SIM_GUARD) Object.assign(GUARD, JSON.parse(process.env.SIM_GUARD));
if (process.env.SIM_BREAK) for (const [k, v] of Object.entries(JSON.parse(process.env.SIM_BREAK))) Object.assign(BREAK[k as keyof typeof BREAK], v);
// 봇이 보는 버팀 1의 값: SIM_BOT_BREAK='{"pip":3}'
if (process.env.SIM_BOT_BREAK) Object.assign(BOT_BREAK, JSON.parse(process.env.SIM_BOT_BREAK));
// 틈 수치 바꾸기: SIM_GAP='{"crit":1.5,"bleed":2}' · 거두기 끄기: SIM_GAP=off
if (process.env.SIM_GAP === 'off') GAP.perTurn = 0;
else if (process.env.SIM_GAP) Object.assign(GAP, JSON.parse(process.env.SIM_GAP));

// 사람처럼 강한 플레이어 흉내 (후반 층이 강한 덱에게 얼마나 쉬워지는지 볼 때): SIM_POWER='{"dmg":1.5,"taken":0.85}'
// dmg: 내가 주는 피해 배율 · taken: 적 공격으로 받는 피해 배율 (봇은 사람보다 판짜기·막기가 서툴다)
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
