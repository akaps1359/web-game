import { ENEMIES } from './registry';
import { Rng, deriveSeed } from './rng';
import type { RunState } from './run';
import { DMG_TYPES, type DmgType, type EnemyDef } from './types';

/*
 * 급소 (2026-10, "약점을 밝히는 게 별 의미가 없다 — 어차피 가진 스킬로 때리는 것"):
 * 약점은 판을 넘어 도감에 남고 알든 모르든 보너스가 들어가서, 밝혀도 달라지는 것이 없었다.
 * 급소는 판마다 종족마다 하나씩 숨어 있는 속성이다 (판의 씨앗과 종족으로 정해진다 — 다음 판엔 다르다).
 *  - **드러난 급소만 노릴 수 있다**: 그 속성으로 찌르면 피해 ×WEAKPOINT.mult, 버팀 WEAKPOINT.poise 더 (약점과 겹치면 둘 다).
 *    숨어 있는 동안은 맞혀도 아무 일이 없다 — 밝히는 것이 곧 힘이다
 *  - **일부러 들여다봐야 드러난다**: 통찰 WEAKPOINT.insight / 들여다보기 이벤트(learnWeak) / 약점을 밝히는 것들(Combat.expose — 관찰·조명탄 등)
 *    (처음엔 숨은 채로도 들어가고 찌르면 드러나게 했더니 알든 모르든 들어가는 약점과 같은 꼴에 봇 승률이 18 → 28%,
 *     붕괴시키면 드러나게 했더니 붕괴는 늘 일어나 공짜로 드러나서 25%였다)
 *  - 한 번 드러나면 이번 판 내내 그 종족의 급소가 보인다 (run.weakPoints) — 이름판·미리보기·지도의 방 설명·보상 카드에.
 *    무엇을 들고 갈지, 어느 방으로 갈지가 달라진다
 * 하수인·기믹 물건(약점이 없는 것)에는 없다. 저항하는 속성은 급소가 되지 않는다
 */
export const WEAKPOINT = {
  /** 급소를 찌른 내 공격의 피해 배율 */
  mult: 1.3,
  /** 급소를 찌르면 버팀이 이만큼 더 깎인다 */
  poise: 1,
  /** 통찰이 이만큼이면 급소가 보인다 (약점은 2) */
  insight: 3,
  /** 끄면 급소가 없다 — 정확한 수치를 재는 테스트가 판마다 숨은 배율에 흔들리지 않게 (tests/setup.ts가 끈다) */
  on: true,
};

/** 급소가 있는 종족: 약점이 있는 일반·정예·수호자 */
export function hasWeakPoint(def: EnemyDef | undefined): def is EnemyDef {
  return !!def && def.tier !== 'minion' && def.weak.length > 0;
}

/** 판의 씨앗·종족마다 늘 같은 값 — 피해 계산마다 부르므로 기억해 둔다 */
const memo = new Map<string, DmgType | null>();

/** 이 판에서 이 종족의 급소 (없으면 null) */
export function weakPointOf(run: RunState, defId: string): DmgType | null {
  if (!WEAKPOINT.on) return null;
  const key = `${run.seed}:${defId}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const def = ENEMIES.get(defId);
  let out: DmgType | null = null;
  if (hasWeakPoint(def)) {
    const pool = DMG_TYPES.filter((t) => (def.resist?.[t] ?? 1) >= 1);
    if (pool.length) out = new Rng({ s: deriveSeed(run.seed, `wp:${defId}`) }, 's').pick(pool);
  }
  if (memo.size > 4000) memo.clear();
  memo.set(key, out);
  return out;
}

/** 이번 판에 이 종족의 급소가 드러났는가 */
export function weakPointKnown(run: RunState, defId: string): boolean {
  return (run.weakPoints ?? []).includes(defId);
}

/** 이 속성이 이 종족의 드러난 급소인가 (드러난 급소만 노릴 수 있다) */
export function wpOpen(run: RunState, defId: string, type: DmgType | 'true'): boolean {
  return type !== 'true' && weakPointKnown(run, defId) && weakPointOf(run, defId) === type;
}

/** 급소를 드러낸다 (이번 판 내내). 새로 드러났으면 true */
export function revealWeakPoint(run: RunState, defId: string): boolean {
  if (!weakPointOf(run, defId) || weakPointKnown(run, defId)) return false;
  run.weakPoints = [...(run.weakPoints ?? []), defId];
  return true;
}
