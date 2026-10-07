import { RUNES, SKILLS } from './registry';
import { Rng } from './rng';
import type { Combat } from './combat';
import type { RunState } from './run';
import type { OwnedSkill, Rarity, School } from './types';

/*
 * 계열 (2026-10, 계열을 넘나드는 구조): 인간의 기술 6계열. 정수 기술과 공용 스킬은 계열이 없다(무색).
 *  - 스킬은 제 계열에 더해 새긴 계열 각인(RuneDef.school)의 계열로도 친다. TFT의 엠블럼처럼 계열을 하나 더 붙인다.
 *  - 합기(SkillDef.duo)는 두 계열 모두로 친다.
 * 틈(content/gap.ts)을 열고 거둘 때 쓰고, 실마리 보상·글루 판정(run.ts 등)도 같은 판정을 쓸 수 있다.
 */

export const HUMAN_SCHOOLS: readonly School[] = ['blade', 'firearm', 'occult', 'alchemy', 'resolve', 'forbidden'];

/** 인간의 기술 6계열 중 하나인가 (정수·공용은 아니다) */
export function isHumanSchool(s: School | null | undefined): s is School {
  return !!s && HUMAN_SCHOOLS.includes(s);
}

/** 각인의 계열 (무계열이면 null) */
export function runeSchool(id: string): School | null {
  const s = RUNES.get(id)?.school;
  return isHumanSchool(s) ? s : null;
}

/**
 * 이 스킬이 치는 계열들 (앞이 먼저): 스킬 자신의 계열 → 합기의 두 계열 → 새긴 계열 각인의 계열. 무색이면 빈 배열.
 * 무기·방어구 기본기는 그 기본기의 계열이다 (사냥칼 = 검술, 리볼버 = 사격, 의식용 단검 = 비술).
 * src: 전투나 판. 지금은 쓰지 않는다 (판의 상태로 계열이 바뀌는 규칙이 생기면 여기서 본다)
 */
export function skillSchools(_src: Combat | RunState | null, owned: Pick<OwnedSkill, 'id' | 'runes'>): School[] {
  const def = SKILLS.get(owned.id);
  const out: School[] = [];
  const add = (s: School | null | undefined) => {
    if (isHumanSchool(s) && !out.includes(s)) out.push(s);
  };
  add(def?.school);
  for (const s of def?.duo ?? []) add(s);
  for (const r of owned.runes ?? []) add(runeSchool(r));
  return out;
}

// ───────────── 기술서 해체 ─────────────

const RUNE_W: Partial<Record<Rarity, number>> = { common: 50, uncommon: 35, rare: 15 };

/** 기술서 해체로 나올 수 있는 각인: 그 스킬 계열의 계열 각인들 (무색 스킬이면 없다) */
export function dismantlePool(skillId: string): string[] {
  const def = SKILLS.get(skillId);
  if (!def || !isHumanSchool(def.school)) return [];
  return [...RUNES.values()].filter((r) => r.school === def.school).map((r) => r.id);
}

/**
 * 기술서 해체: 보상 선택지에 나온 스킬을 받는 대신 그 계열의 각인 하나로 바꾼다 (보상의 '하나 고르기'를 쓴다).
 * 각인은 등급 가중치로 하나 (rollRune과 같은 가중치). 화면은 나중에 붙인다 (확인 창 필수).
 * 돌려주는 값: 못 하는 사유. 되면 null이고, 그 보상 칸이 얻은 각인(kind 'rune', taken)으로 바뀌며 run.runes 끝에 들어간다
 */
export function dismantleToRune(run: RunState, skillId: string): string | null {
  const rw = run.reward;
  if (!rw?.choice || rw.chosen) return '고를 보상 없음';
  const item = rw.choice.find((it) => it.kind === 'skill' && it.id === skillId && !it.taken);
  if (!item) return '보상에 없는 스킬';
  const pool = dismantlePool(skillId).flatMap((id) => RUNES.get(id) ?? []);
  if (!pool.length) return '계열 없는 스킬은 해체 불가';
  const rune = new Rng(run.rng, 'loot').weighted(pool, (x) => RUNE_W[x.rarity] ?? 10);
  run.runes.push(rune.id);
  item.kind = 'rune';
  item.id = rune.id;
  item.taken = true;
  rw.chosen = true;
  run.log.push(`${SKILLS.get(skillId)?.name ?? '기술서'} 해체: ${rune.name}`);
  if (run.log.length > 40) run.log.shift();
  return null;
}
