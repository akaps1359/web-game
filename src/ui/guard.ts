import { BREAK, GUARD, breakProfile } from '../engine/combat';
import type { EnemyDef } from '../engine/types';

/*
 * 버팀과 붕괴 (2026-10 붕괴 개편)를 화면 글로 옮긴다. 수치는 엔진 상수(GUARD·BREAK)에서 만든다.
 */

/** 1.5 → '1.5배' */
export const timesWord = (x: number) => `${Math.round(x * 100) / 100}배`;

/** 버팀이 남은 적이 받는 피해: '절반' / '40%' */
export const guardWord = (): string => (GUARD.mult === 0.5 ? '절반' : `${Math.round(GUARD.mult * 100)}%`);

/** 한 줄 규칙: '버팀이 남아 있으면 받는 피해 절반' */
export const GUARD_RULE = `버팀이 남아 있으면 받는 피해 ${guardWord()}`;

/** 버팀이 깎이는 법: '약점으로 치면 1, 약점이 아니면 3번에 1' */
export const CHIP_RULE = `약점으로 치면 버팀 -1, 약점이 아닌 공격은 ${GUARD.chip}번에 -1`;

type Tier = EnemyDef['tier'];
const TIER_NAME: Record<Exclude<Tier, 'minion'>, string> = { normal: '일반', elite: '정예', boss: '수호자' };

/** 등급마다 같은 값끼리 묶는다: [['일반', 2], ['정예·수호자', 1]] */
function byTier(pick: (b: { stun: number; vuln: number }) => number): [string, number][] {
  const out: [string, number][] = [];
  for (const t of ['normal', 'elite', 'boss'] as const) {
    const v = pick(BREAK[t]);
    const same = out.find(([, x]) => x === v);
    if (same) same[0] += `·${TIER_NAME[t]}`;
    else out.push([TIER_NAME[t], v]);
  }
  return out;
}

/** 용어집 「붕괴」: 등급마다 쉬는 차례와 받는 피해 */
export function breakGlossary(): string {
  const stun = byTier((b) => b.stun)
    .map(([who, n]) => `${who} ${n}번`)
    .join(', ');
  const vuln = byTier((b) => b.vuln)
    .map(([who, v]) => `${who} ${timesWord(v)}`)
    .join(', ');
  return `버팀이 다 깎인 상태. 하던 행동이 끊기고 차례를 쉰다(${stun}). 버팀이 돌아올 때까지 받는 피해가 늘어난다(${vuln}). 준비 중이던 큰 공격(번개 표시)도 끊긴다. 적마다 다를 수 있다.`;
}

/** 이 적이 붕괴하면: '차례 2번 쉼 · 받는 피해 1.5배' */
export function breakSay(def: Pick<EnemyDef, 'tier' | 'brk'>): string {
  const b = breakProfile(def);
  return `차례 ${b.stun}번 쉼 · 받는 피해 ${timesWord(b.vuln)}`;
}
