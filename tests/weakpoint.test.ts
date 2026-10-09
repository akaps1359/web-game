import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, GUARD } from '../src/engine/combat';
import { ENEMIES, SKILLS } from '../src/engine/registry';
import { newRun, type RunState } from '../src/engine/run';
import { DMG_TYPES, type DmgType, type EncounterDef, type EnemyDef } from '../src/engine/types';
import { WEAKPOINT, hasWeakPoint, revealWeakPoint, weakPointKnown, weakPointOf } from '../src/engine/weakpoint';
import { learnWeak, weakNote } from '../src/content/eventkit';
import { wpFoes } from '../src/ui/cards';

/*
 * 급소 (2026-10 피드백 — "약점 밝히는 게 별 메리트가 없다. 어차피 가진 스킬로 때리는 것"):
 * 판마다 종족마다 숨은 속성 하나. 찌르면 피해 ×WEAKPOINT.mult·버팀 하나 더, 한 번 드러나면 이번 판 내내 보인다.
 * (다른 테스트는 tests/setup.ts가 급소를 끈 채로 돈다 — 여기서만 켠다)
 */

beforeAll(() => {
  WEAKPOINT.on = true;
});
afterAll(() => {
  WEAKPOINT.on = false;
});

/** 이 종족 하나와 싸우는 깨끗한 판 (유물·장비·광기 없음 — 피해 배율을 그대로 잰다) */
function arena(id: string, seed: number, o: { insight?: number; run?: RunState } = {}) {
  const run = o.run ?? newRun({ seed, origin: 'soldier' });
  run.act = ENEMIES.get(id)!.act;
  run.floor = null;
  run.relics = [];
  run.madness = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  if (o.insight !== undefined) run.player.insight = o.insight;
  const enc: EncounterDef = { id: 'test', act: run.act, kind: 'normal', enemies: [{ id }] };
  const c = Combat.begin(run, enc);
  const events = c.drain();
  const e = c.alive[0];
  e.hp = e.maxHp = 99999;
  return { run, c, e, events };
}

const plainRes = (d: EnemyDef, t: DmgType) => (d.resist?.[t] ?? 1) === 1;

/** 급소가 약점과 겹치지 않고, 급소도 아니고 약점도 아닌 평범한 속성이 있는 (판, 종족) — 배율을 깨끗하게 재려고 */
function clean(): { id: string; seed: number; wp: DmgType; plain: DmgType } {
  // 특성(무리의 한 타격 상한 등)이 없는 1층 일반 존재
  const pool = [...ENEMIES.values()].filter((d) => d.act === 1 && d.tier === 'normal' && d.weak.length > 0 && d.poise >= 3 && !d.traits?.length);
  for (let seed = 1; seed < 400; seed++) {
    const run = newRun({ seed, origin: 'soldier' });
    for (const d of pool) {
      const wp = weakPointOf(run, d.id);
      if (!wp || d.weak.includes(wp) || !plainRes(d, wp)) continue;
      const plain = DMG_TYPES.find((t) => t !== wp && !d.weak.includes(t) && plainRes(d, t));
      if (plain) return { id: d.id, seed, wp, plain };
    }
  }
  throw new Error('깨끗한 급소를 찾지 못했다');
}

describe('급소: 판마다 종족마다 숨은 속성', () => {
  it('판의 씨앗·종족으로 정해진다 — 같은 판에선 늘 같고, 판이 바뀌면 대부분 달라진다. 저항하는 속성은 급소가 되지 않는다', () => {
    const defs = [...ENEMIES.values()].filter(hasWeakPoint);
    expect(defs.length).toBeGreaterThan(30);
    const a = newRun({ seed: 101, origin: 'soldier' });
    const b = newRun({ seed: 202, origin: 'soldier' });
    let differ = 0;
    for (const d of defs) {
      const wa = weakPointOf(a, d.id);
      expect(wa, d.id).not.toBeNull();
      expect(weakPointOf(a, d.id)).toBe(wa);
      expect(d.resist?.[wa!] ?? 1, `${d.id}: ${wa}`).toBeGreaterThanOrEqual(1);
      if (weakPointOf(b, d.id) !== wa) differ++;
    }
    expect(differ).toBeGreaterThan(defs.length / 2);
  });

  it('하수인과 약점이 없는 것(기믹 물건 등)에는 급소가 없다', () => {
    const run = newRun({ seed: 7, origin: 'soldier' });
    for (const d of ENEMIES.values()) if (d.tier === 'minion' || !d.weak.length) expect(weakPointOf(run, d.id), d.id).toBeNull();
  });

  it('숨어 있는 급소는 맞혀도 아무 일이 없다 — 드러나야 노릴 수 있고, 맞혀서는 드러나지 않는다', () => {
    const { id, seed, wp, plain } = clean();
    const { run, c, e } = arena(id, seed);
    expect(c.snap().e[0].wp).toBe('?');
    const poise = e.poise;
    const a = c.damage({ src: c.p, tgt: e, base: 1000, type: plain, attack: true });
    const b = c.damage({ src: c.p, tgt: e, base: 1000, type: wp, attack: true });
    expect(b.wpHit).toBe(false);
    expect(b.amount).toBe(a.amount);
    expect(e.poise).toBe(poise);
    expect(weakPointKnown(run, id)).toBe(false);
    expect(c.drain().some((ev) => ev.t === 'reveal' && ev.wp)).toBe(false);
  });

  it('드러난 급소로 찌르면 피해 ×WEAKPOINT.mult, 버팀이 하나 더 깎인다 — 이번 판 내내 (다음 전투에서도)', () => {
    const { id, seed, wp, plain } = clean();
    const { run, c, e } = arena(id, seed);
    revealWeakPoint(run, id);
    expect(c.snap().e[0].wp).toBe(wp);
    const poise = e.poise;
    const a = c.damage({ src: c.p, tgt: e, base: 1000, type: plain, attack: true });
    expect(a.wpHit).toBe(false);
    expect(e.poise).toBe(poise);
    const b = c.damage({ src: c.p, tgt: e, base: 1000, type: wp, attack: true });
    expect(b.wpHit).toBe(true);
    expect(b.amount / a.amount).toBeCloseTo(WEAKPOINT.mult, 2);
    expect(e.poise).toBe(poise - WEAKPOINT.poise);
    // 급소 타격은 약점 타격처럼 버팀을 깎으니 「약점이 아닌 공격」 횟수(GUARD.chip)에 세지 않는다 (평범한 타격 하나만 셌다)
    expect(GUARD.chip).toBeGreaterThan(1);
    expect(e.chip).toBe(1);
    // 같은 판의 다음 전투에서도 처음부터 보이고 들어간다
    const next = arena(id, seed, { run });
    expect(next.c.snap().e[0].wp).toBe(wp);
    expect(next.c.damage({ src: next.c.p, tgt: next.e, base: 1, type: wp, attack: true }).wpHit).toBe(true);
  });

  it('붕괴시켜도 드러나지 않는다 — 일부러 들여다봐야 한다 (붕괴는 늘 일어나 공짜로 드러났다)', () => {
    const { id, seed, plain } = clean();
    const { run, c, e } = arena(id, seed);
    c.damage({ src: c.p, tgt: e, base: 1, type: plain, attack: true, poise: e.poise });
    expect(e.broken).toBeGreaterThan(0);
    expect(weakPointKnown(run, id)).toBe(false);
    expect(c.snap().e[0].wp).toBe('?');
  });

  it('미리보기에는 드러난 급소만 — 모르는 급소를 숫자로 흘리지 않는다', () => {
    const { id, seed, wp, plain } = clean();
    const { run, c, e } = arena(id, seed);
    const hidden = c.preview(c.p, e, 100, wp, { attack: true });
    expect(hidden).toBe(c.preview(c.p, e, 100, plain, { attack: true }));
    revealWeakPoint(run, id);
    expect(c.preview(c.p, e, 100, wp, { attack: true })).toBeGreaterThan(hidden);
    // 미리보기는 판을 바꾸지 않는다
    expect(run.weakPoints).toEqual([id]);
  });

  it(`통찰 ${WEAKPOINT.insight}이면 나타날 때부터 급소가 보인다 (그 아래는 보이지 않는다)`, () => {
    const { id, seed, wp } = clean();
    expect(arena(id, seed, { insight: WEAKPOINT.insight - 1 }).c.snap().e[0].wp).toBe('?');
    expect(arena(id, seed, { insight: WEAKPOINT.insight }).c.snap().e[0].wp).toBe(wp);
  });

  it('관찰(약점을 밝히는 기술)은 급소까지 밝힌다', () => {
    const { id, seed, wp } = clean();
    const base = newRun({ seed, origin: 'soldier' });
    base.skills = [{ uid: 'sk', id: 'study', lvl: 0, runes: [] }];
    base.slots = ['sk'];
    const { run, c, e } = arena(id, seed, { run: base });
    expect(SKILLS.get('study')!.desc).toContain('급소');
    c.s.ap = 9;
    expect(c.useSkill('sk', e.uid)).toBeNull();
    expect(weakPointKnown(run, id)).toBe(true);
    expect(c.drain().some((ev) => ev.t === 'reveal' && ev.wp && ev.dtype === wp)).toBe(true);
  });

  it('들여다보는 이벤트(learnWeak)는 도감에서 이미 아는 적이라도 이번 판의 급소를 알려 준다', () => {
    const { id, seed, wp } = clean();
    const run = newRun({ seed, origin: 'soldier' });
    const d = ENEMIES.get(id)!;
    run.knownWeak = { ...run.knownWeak, [id]: [...d.weak] };
    run.learned.weak[id] = [...d.weak];
    const names = learnWeak(run, [id]);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain(d.name);
    expect(weakPointKnown(run, id)).toBe(true);
    expect(weakNote(names)).toContain('급소');
    // 두 번째는 새로 알게 된 것이 없다
    expect(learnWeak(run, [id])).toEqual([]);
    // 보상 카드: 이 속성이 이 층 존재의 드러난 급소면 「급소를 찌른다」
    run.act = d.act;
    expect(wpFoes(wp, run)).toEqual([d.name]);
  });

  it('급소 각인: 새긴 공격은 대상의 드러난 급소 속성으로 친다 (드러나지 않았으면 그대로)', () => {
    // 밀쳐내기(타격)로 — 타격이 급소도 약점도 아닌 (판, 종족)
    let found: { id: string; seed: number; wp: DmgType } | null = null;
    const pool = [...ENEMIES.values()].filter((d) => d.act === 1 && d.tier === 'normal' && d.weak.length > 0 && !d.traits?.length);
    for (let seed = 1; seed < 400 && !found; seed++) {
      const run = newRun({ seed, origin: 'soldier' });
      for (const d of pool) {
        const wp = weakPointOf(run, d.id);
        if (wp && wp !== 'blunt' && !d.weak.includes('blunt') && plainRes(d, 'blunt')) {
          found = { id: d.id, seed, wp };
          break;
        }
      }
    }
    const { id, seed, wp } = found!;
    const base = newRun({ seed, origin: 'soldier' });
    base.skills = [{ uid: 'sk', id: 'shove', lvl: 0, runes: ['wp-rune'] }];
    base.slots = ['sk'];
    const { run, c, e } = arena(id, seed, { run: base });
    const dmg = () => c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt === e.uid);
    c.s.ap = 9;
    expect(c.useSkill('sk', e.uid)).toBeNull();
    expect(dmg()[0].dtype).toBe('blunt');
    revealWeakPoint(run, id);
    c.s.cd = {};
    expect(c.useSkill('sk', e.uid)).toBeNull();
    const hit = dmg()[0];
    expect(hit.dtype).toBe(wp);
    expect(hit.wp).toBe(true);
  });

  it('급소 상태는 JSON으로 저장된다 (판을 넘어 남지 않는다 — 새 판에는 없다)', () => {
    const { id, seed } = clean();
    const run = newRun({ seed, origin: 'soldier' });
    revealWeakPoint(run, id);
    const back = JSON.parse(JSON.stringify(run)) as RunState;
    expect(weakPointKnown(back, id)).toBe(true);
    expect(weakPointKnown(newRun({ seed: seed + 1, origin: 'soldier' }), id)).toBe(false);
  });
});
