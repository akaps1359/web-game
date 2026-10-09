import { ENCOUNTERS, ENEMIES, MADNESS } from '../engine/registry';
import { MAX_MADNESS } from '../engine/combat';
import { rng, type RunState } from '../engine/run';
import { DMG_KO, type EnemyDef } from '../engine/types';
import { revealWeakPoint, weakPointOf } from '../engine/weakpoint';

/**
 * 이벤트 공용 — 통찰의 값과 '앎'의 보상 (2026-10 통찰 개편).
 * - 통찰을 주는 선택지는 층마다 한두 개뿐이고, 언제나 영구 대가를 치른다: 최대 정신력 -8, 광기 하나, 최대 체력 -10 중 하나.
 * - 나머지 '들여다보는' 선택지는 통찰 대신 적의 약점과 이번 판의 급소를 알려 준다 — 이번 판의 전투에 바로 보이고, 약점은 도감에도 남는다
 *   (급소는 판마다 바뀌니 도감을 다 채운 뒤에도 들여다볼 값이 있다 — engine/weakpoint.ts).
 */

/** 통찰 +1의 값 (영구 대가) */
export const INSIGHT_PRICE = { maxSanity: 8, maxHp: 10 };

/** 최대 정신력 감소 (최소 10) */
export function cutMaxSanity(run: RunState, n: number) {
  const p = run.player;
  p.maxSanity = Math.max(10, p.maxSanity - n);
  p.sanity = Math.min(p.sanity, p.maxSanity);
}

/** 최대 체력 감소 (최소 1) */
export function cutMaxHp(run: RunState, n: number) {
  const p = run.player;
  p.maxHp = Math.max(1, p.maxHp - n);
  p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
}

/** 나쁜 광기를 하나 더 얻어도 완전히 미치지 않는가 (광기를 대가로 내미는 선택지는 아니면 막는다) */
export function canTakeMadness(run: RunState): boolean {
  const neg = run.madness.filter((id) => !MADNESS.get(id)?.virtue).length;
  return neg + 1 < MAX_MADNESS && [...MADNESS.values()].some((m) => !m.virtue && !run.madness.includes(m.id));
}

/** 대가로 치르는 나쁜 광기 하나 (각성은 나오지 않는다). 얻은 광기의 이름 */
export function takeMadness(run: RunState): string | null {
  if (!canTakeMadness(run)) return null;
  const m = rng(run, 'event').pick([...MADNESS.values()].filter((x) => !x.virtue && !run.madness.includes(x.id)));
  run.madness.push(m.id);
  m.onGain?.(run);
  return m.name;
}

/** 이 층의 일반·정예 조우에 나오는 적 (하수인·균열·추적자·군주 제외). pred로 더 고른다 */
export function floorFoes(run: RunState, pred: (d: EnemyDef) => boolean = () => true): string[] {
  const out = new Set<string>();
  for (const enc of ENCOUNTERS) {
    if (enc.act !== run.act || enc.kind === 'boss' || /^(rift|stalker|lord)/.test(enc.id)) continue;
    for (const slot of enc.enemies) {
      const d = ENEMIES.get(slot.id);
      if (d && d.tier !== 'minion' && pred(d)) out.add(d.id);
    }
  }
  return [...out];
}

/** 이 층 수호자 (포탈 비석 너머에서 기다리는 것) */
export function floorGuardian(run: RunState): string[] {
  const enc = ENCOUNTERS.find((x) => x.id === run.floor?.bossEnc);
  return enc ? enc.enemies.map((x) => x.id).filter((id) => ENEMIES.get(id)?.tier === 'boss') : [];
}

/**
 * 적들의 약점과 급소를 알게 된다 — 이번 판의 전투(knownWeak: 나타날 때부터 보인다)와 도감(learned.weak)에 남는다.
 * 이번 판의 급소도 드러난다 (engine/weakpoint.ts — 판을 넘어 남지 않으니 도감을 다 채워도 들여다볼 값이 있다).
 * 새로 알게 된 것이 있는 적을 돌려준다 ('이름(급소)' — 이미 다 알던 적은 빠진다)
 */
export function learnWeak(run: RunState, ids: string[]): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const d = ENEMIES.get(id);
    if (!d || !d.weak.length) continue;
    const had = new Set([...(run.knownWeak[id] ?? []), ...(run.learned.weak[id] ?? [])]);
    const fresh = !d.weak.every((w) => had.has(w));
    if (fresh) {
      run.knownWeak = { ...run.knownWeak, [id]: [...new Set([...(run.knownWeak[id] ?? []), ...d.weak])] };
      run.learned.weak[id] = [...new Set([...(run.learned.weak[id] ?? []), ...d.weak])];
    }
    const wp = revealWeakPoint(run, id) ? weakPointOf(run, id) : null;
    if (fresh || wp) names.push(wp ? `${d.name}(급소 ${DMG_KO[wp]})` : d.name);
  }
  return names;
}

/** 결과 문장 꼬리: 새로 알게 된 약점·급소 (없으면 그렇다고) */
export function weakNote(names: string[]): string {
  if (!names.length) return ' 이미 아는 것들뿐이었다.';
  const shown = names.slice(0, 4).join(', ');
  return ` (약점과 급소를 알아냈다: ${shown}${names.length > 4 ? ` 외 ${names.length - 4}종` : ''})`;
}
