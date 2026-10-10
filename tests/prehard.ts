import { DEPTH } from '../src/content/depth';
import { ACT_DMG_MULT, ACT_HP_MULT, BOSS_DMG_MULT, ELITE_DMG_MULT, MOB_HP_MULT } from '../src/engine/combat';

/*
 * '어렵게'(2026-10-09, GDD 10.8·10.9) 전의 층 배율. 시작 덱으로 끝까지 이기는지 보는 기믹 공정성 테스트는 이 수치로 돌린다 —
 * 어렵게 올린 체력·공격·가호·변이를 시작 덱이 이기길 바라지 않는다 (그건 밸런스 시뮬레이션이 잰다). 기믹이 어느 출신을 막지 않는지만 본다
 */
const BEFORE: [number[], number[]][] = [
  [ACT_HP_MULT, [1, 1, 1.27, 1.7, 2.37, 2.16]],
  // 2026-10-10 일반전 몹 체력 (4·5층) — 그 전엔 없었다
  [MOB_HP_MULT, [1, 1, 1, 1, 1, 1]],
  [ACT_DMG_MULT, [1, 1, 1.1, 1.3, 1.75, 1.65]],
  [ELITE_DMG_MULT, [1, 1, 1, 1.25, 1.35, 1.35]],
  [BOSS_DMG_MULT, [1, 1, 1.15, 1.3, 1.35, 1.2]],
  [DEPTH.aegisElite, [0, 0, 0, 0.3, 0.2, 0.16]],
  [DEPTH.aegisBoss, [0, 0, 0, 0.22, 0.15, 0.12]],
  [DEPTH.aegisPoiseElite, [0, 0, 0, 0.6, 0.5, 0.5]],
  [DEPTH.aegisPoiseBoss, [0, 0, 0, 0.5, 0.4, 0.4]],
  [DEPTH.mutElite, [0, 0, 1, 1, 1, 1.5]],
  [DEPTH.mutNormal, [0, 0, 0, 0.25, 0.4, 0.55]],
];

/** '어렵게' 전의 층 배율로 fn을 돌리고 되돌린다 */
export function preHard<T>(fn: () => T): T {
  const saved = BEFORE.map(([now]) => now.slice());
  for (const [now, old] of BEFORE) now.splice(0, now.length, ...old);
  try {
    return fn();
  } finally {
    BEFORE.forEach(([now], i) => now.splice(0, now.length, ...saved[i]));
  }
}

/**
 * 1층 적 공격 배율을 걷어 내고 fn을 돌린다 (적의 공격 = 기본 수치). '어렵게' 전에는 1층 배율이 1이라
 * 장비·기술 효과를 숫자로 따라가는 1층 아레나 테스트가 적의 공격 수치를 그대로 썼다
 */
export function plainHits<T>(fn: () => T): T {
  const saved = [ACT_DMG_MULT[1], ELITE_DMG_MULT[1], BOSS_DMG_MULT[1]];
  ACT_DMG_MULT[1] = ELITE_DMG_MULT[1] = BOSS_DMG_MULT[1] = 1;
  try {
    return fn();
  } finally {
    [ACT_DMG_MULT[1], ELITE_DMG_MULT[1], BOSS_DMG_MULT[1]] = saved;
  }
}
