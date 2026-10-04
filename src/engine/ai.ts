import type { Combat } from './combat';
import type { EnemyUnit } from './types';

/** 정해진 순서 반복 */
export function cycle(e: EnemyUnit, moves: string[], key = 'ci'): string {
  const i = e.mem[key] ?? 0;
  e.mem[key] = (i + 1) % moves.length;
  return moves[i];
}

/** 마지막으로 실행한 행동 */
export function last(e: EnemyUnit): string | undefined {
  return e.hist[e.hist.length - 1];
}

/** 같은 행동을 maxRepeat번 넘게 연속하지 않는 가중 무작위 */
export function pick(c: Combat, e: EnemyUnit, weights: Record<string, number>, maxRepeat = 2): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const tail = e.hist.slice(-maxRepeat);
  const allowed = entries.filter(([id]) => !(tail.length >= maxRepeat && tail.every((h) => h === id)));
  const pool = allowed.length ? allowed : entries;
  return c.rng.weighted(pool, ([, w]) => w)[0];
}

/** 처음 n턴 동안은 정해진 행동 */
export function opener(c: Combat, e: EnemyUnit, moves: string[]): string | null {
  const t = e.mem.turns ?? 0;
  e.mem.turns = t + 1;
  return t < moves.length ? moves[t] : null;
}

/** 살아있는 아군 수 (자신 포함) */
export function allies(c: Combat): number {
  return c.alive.length;
}

/** 체력 비율 */
export function hpPct(e: EnemyUnit): number {
  return e.hp / e.maxHp;
}
