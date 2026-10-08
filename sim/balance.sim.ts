import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import '../src/content';
import { CORE_HP, GENESIS, ORIGIN_WEIGHT } from '../src/engine/run';
import { CLUE } from '../src/engine/keywords';
import { BOSS_HP_MULT, BREAK, GUARD } from '../src/engine/combat';
import { botAsc, botClue, botEssence, simulateRun, summarize } from '../src/sim/runbot';
import { BOT_BREAK } from '../src/sim/bot';
import { GAP } from '../src/content/gap';
import { DEPTH } from '../src/content/depth';
import { ACT_DMG_MULT, ACT_HP_MULT, ACT_SAN_MULT, BOSS_DMG_MULT, ELITE_DMG_MULT, TOLERANCE } from '../src/engine/combat';
import { GROWTH } from '../src/engine/growth';
import { CHOICE_RATE, GOLD_MULT, RARITY_ACT, XP_STEP } from '../src/engine/run';
import { botGrowth } from '../src/sim/runbot';
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

// 심연 압력 (content/depth.ts — 2026-10): SIM_DEPTH='{"aegisElite":[0,0,0,0.3,0.22,0.2]}' · SIM_TOLERANCE='{"act":[0,0,0,0.5,0.6,0.7]}'
if (process.env.SIM_DEPTH) Object.assign(DEPTH, JSON.parse(process.env.SIM_DEPTH));
if (process.env.SIM_TOLERANCE) Object.assign(TOLERANCE, JSON.parse(process.env.SIM_TOLERANCE));
// 층별 적 배율: SIM_ACT='{"hp":[1,1,1.25,1.65,2.2,2.0],"dmg":[...],"elite":[...],"boss":[...],"san":[...]}'
if (process.env.SIM_ACT) {
  const a = JSON.parse(process.env.SIM_ACT);
  const arrs = { hp: ACT_HP_MULT, dmg: ACT_DMG_MULT, elite: ELITE_DMG_MULT, boss: BOSS_DMG_MULT, san: ACT_SAN_MULT };
  for (const [k, arr] of Object.entries(arrs)) if (a[k]) arr.splice(0, arr.length, ...a[k]);
}
// 성장 개편 (engine/growth.ts — 2026-10): SIM_GROWTH='{"affixes":[0,0.2,0.4,0.7,1,1.3]}' · SIM_XP='{"per":35}' · SIM_RATE='[1,0.8,0.6,0.5,0.45,0.4]'
// SIM_GOLD='[1,1,1.2,1.4,1.6,1.8]' · SIM_RARITY='{"rare":[1,1,1,1.2,1.4,1.6]}' · 봇이 계약을 맺지 않게: SIM_BOT_GROWTH='{"pacts":false}'
if (process.env.SIM_GROWTH) Object.assign(GROWTH, JSON.parse(process.env.SIM_GROWTH));
if (process.env.SIM_XP) Object.assign(XP_STEP, JSON.parse(process.env.SIM_XP));
if (process.env.SIM_RATE) CHOICE_RATE.splice(0, CHOICE_RATE.length, ...JSON.parse(process.env.SIM_RATE));
if (process.env.SIM_GOLD) GOLD_MULT.splice(0, GOLD_MULT.length, ...JSON.parse(process.env.SIM_GOLD));
if (process.env.SIM_RARITY) Object.assign(RARITY_ACT, JSON.parse(process.env.SIM_RARITY));
if (process.env.SIM_BOT_GROWTH) Object.assign(botGrowth, JSON.parse(process.env.SIM_BOT_GROWTH));

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
