import { describe, expect, it } from 'vitest';
import '../src/content';
import { ACT_DMG_MULT, BOSS_DMG_MULT, ELITE_DMG_MULT, type Combat } from '../src/engine/combat';
import { ENEMIES, ESSENCES, FLOORS, SKILLS } from '../src/engine/registry';
import {
  absorbBlock,
  absorbEssence,
  bottleEssence,
  breakEssence,
  ESSENCE_SLOTS,
  essenceCap,
  essenceStats,
  essenceUsed,
  newRun,
  slotFull,
  startCombat,
  takeBeginEvents,
  takeLoot,
  type LootItem,
  type RunState,
} from '../src/engine/run';
import { inscribeFlask } from '../src/engine/places';
import { GUARDIAN_REST, startGuardian } from '../src/engine/dungeon';
import { simulateRun } from '../src/sim/runbot';
import { skillDesc } from '../src/ui/text';

/**
 * 2026-10 밸런스 개편 — 구조 세 가지:
 * 1) 정수 자리제: 흡수 한도 = 4 + 쓰러뜨린 층 수호자 수, 꽉 차면 깨뜨리고 바꾼다 (계층정수는 자리를 차지하지 않는다)
 * 2) 수호자는 온전한 시험: 포탈 앞에서 숨을 고르고(체력 전부), 정예·수호자의 공격은 층별 배율만큼 세다
 * 3) 고정 가산 1회: 힘·'+N'은 스킬 한 번에 대상마다 첫 타격에만
 */

const fill = (run: RunState, ids = ['thug', 'dog', 'rats', 'gulls']) => {
  for (const id of ids) expect(absorbEssence(run, { id, color: 0 }), id).toBeNull();
};

describe('정수 자리제', () => {
  it('처음 4자리, 층 수호자를 쓰러뜨릴 때마다 하나씩 는다 — 레벨과는 상관없다', () => {
    const run = newRun({ seed: 1, origin: 'soldier' });
    expect(essenceCap(run)).toBe(ESSENCE_SLOTS.base);
    expect(ESSENCE_SLOTS.base).toBe(4);
    run.player.level = 20;
    expect(essenceCap(run)).toBe(4);
    run.stats.bosses = 2;
    expect(essenceCap(run)).toBe(6);
  });

  it('꽉 차면 흡수할 수 없고, 하나를 깨뜨리고 바꾸면 그 정수가 준 스탯·최대 체력·패시브가 사라진다', () => {
    const run = newRun({ seed: 2, origin: 'soldier' });
    fill(run);
    expect(slotFull(absorbBlock(run, { id: 'butcher', color: 0 }))).toBe(true);
    const thug = run.essences.find((e) => e.id === 'thug')!;
    const str0 = run.player.str;
    const max0 = run.player.maxHp;
    const lost = essenceStats('thug', false, true);
    const gain = essenceStats('butcher', false, true);
    expect(absorbEssence(run, { id: 'butcher', color: 0 }, null, thug.uid)).toBeNull();
    expect(run.essences.map((e) => e.id)).not.toContain('thug');
    expect(run.essences.map((e) => e.id)).toContain('butcher');
    expect(run.player.str).toBe(str0 - (lost.str ?? 0) + (gain.str ?? 0));
    expect(run.player.maxHp).toBe(max0 - (lost.maxHp ?? 0) + (gain.maxHp ?? 0));
    expect(essenceUsed(run)).toBe(essenceCap(run));
  });

  it('수호자 정수를 깨뜨리면 고른 기술도 사라지고, 이계의 흔적(최대 정신력·통찰)은 남는다', () => {
    const run = newRun({ seed: 3, origin: 'soldier' });
    const pick = ESSENCES.get('shoggoth')!.actives[0];
    expect(absorbEssence(run, { id: 'shoggoth', color: 0, guardian: true }, pick)).toBeNull();
    expect(run.skills.some((s) => s.id === pick)).toBe(true);
    const insight = run.player.insight;
    const maxSan = run.player.maxSanity;
    fill(run, ['thug', 'dog', 'rats']);
    const sh = run.essences.find((e) => e.id === 'shoggoth')!;
    expect(absorbEssence(run, { id: 'gulls', color: 0 }, null, sh.uid)).toBeNull();
    expect(run.skills.some((s) => s.id === pick)).toBe(false);
    expect(run.slots).not.toContain(sh.uid);
    expect(run.player.insight).toBe(insight);
    expect(run.player.maxSanity).toBe(maxSan);
  });

  it('계층정수는 자리를 차지하지 않고 깨뜨릴 수도 없다', () => {
    const run = newRun({ seed: 4, origin: 'soldier' });
    expect(ESSENCES.get('captain')?.lord).toBe(true);
    expect(absorbEssence(run, { id: 'captain', color: 0, guardian: true }, null)).toBeNull();
    expect(essenceUsed(run)).toBe(0);
    fill(run);
    const lord = run.essences.find((e) => e.id === 'captain')!;
    expect(absorbBlock(run, { id: 'butcher', color: 0 }, null, lord.uid)).toBe('계층정수는 깨뜨릴 수 없다');
    expect(breakEssence(run, lord.uid)).toBe('계층정수는 깨뜨릴 수 없다');
  });

  it('같은 정수를 수호자판으로 바꿔 흡수할 때는 자리가 꽉 차 있어도 된다', () => {
    const run = newRun({ seed: 5, origin: 'soldier' });
    fill(run);
    expect(absorbEssence(run, { id: 'thug', color: 0, guardian: true }, null)).toBeNull();
    expect(essenceUsed(run)).toBe(4);
    expect(run.essences.find((e) => e.id === 'thug')?.guardian).toBe(true);
  });

  it('보상(takeLoot)과 신전(inscribeFlask)에서도 깨뜨리고 바꿀 수 있다', () => {
    const run = newRun({ seed: 6, origin: 'soldier' });
    fill(run);
    const it: LootItem = { kind: 'essence', id: 'butcher', color: 0 };
    expect(slotFull(takeLoot(run, it))).toBe(true);
    expect(it.taken ?? false).toBe(false);
    const dog = run.essences.find((e) => e.id === 'dog')!;
    expect(takeLoot(run, it, null, dog.uid)).toBeNull();
    expect(it.taken).toBe(true);
    expect(run.essences.some((e) => e.id === 'butcher')).toBe(true);
    // 병에 담아 두었다가 신전에서 바꿔 새긴다
    const it2: LootItem = { kind: 'essence', id: 'enforcer', color: 0 };
    expect(bottleEssence(run, it2)).toBeNull();
    run.screen = 'shrine';
    run.player.gold = 999;
    expect(slotFull(inscribeFlask(run, 0))).toBe(true);
    const rats = run.essences.find((e) => e.id === 'rats')!;
    expect(inscribeFlask(run, 0, null, rats.uid)).toBeNull();
    expect(run.essences.some((e) => e.id === 'enforcer')).toBe(true);
    expect(run.essences.some((e) => e.id === 'rats')).toBe(false);
    expect(run.flasks!.length).toBe(0);
  });

  it('봇은 정수 자리를 넘겨 흡수하지 않고, 꽉 차면 바꾸거나 병에 담는다', () => {
    let maxUsed = 0;
    let overflow = 0;
    for (const seed of [11, 13]) {
      const res = simulateRun(seed, 'soldier', 4000, (run) => {
        const used = essenceUsed(run);
        maxUsed = Math.max(maxUsed, used);
        // 무한의 고리(정수 자리 -1)를 자리가 꽉 찬 뒤에 얻으면 한 칸 넘친 채로 남는다 — 더 들이지 못할 뿐
        const ring = run.relics.some((r) => r.id === 'infinite-ring') ? 1 : 0;
        if (used > essenceCap(run) + ring) overflow++;
      });
      // 다섯 수호자를 모두 쓰러뜨린 판: 자리 base + 5, 그리고 자리를 차지하지 않는 계층정수 하나
      expect(res.essences).toBeLessThanOrEqual(ESSENCE_SLOTS.base + 5 + 1);
    }
    expect(overflow).toBe(0);
    expect(maxUsed).toBeGreaterThanOrEqual(4);
  }, 120_000);
});

describe('수호자는 온전한 시험', () => {
  it('포탈 비석 앞에서 숨을 고르고 체력을 모두 채운다 — 정신력은 채우지 않는다', () => {
    const run = newRun({ seed: 7, origin: 'soldier' });
    const f = run.floor!;
    f.pos = f.portal;
    run.player.hp = 10;
    run.player.sanity = 40;
    expect(GUARDIAN_REST.hp).toBe(1);
    expect(startGuardian(run)).toBeNull();
    expect(run.screen).toBe('combat');
    expect(run.player.hp).toBe(run.player.maxHp);
    expect(run.player.sanity).toBeLessThanOrEqual(40);
    const evs = takeBeginEvents(run);
    expect(evs.some((e) => e.t === 'heal' && e.uid === 'p' && e.amount === run.player.maxHp - 10)).toBe(true);
  });

  it('계층군주 앞에서는 숨을 고르지 않는다', () => {
    const run = newRun({ seed: 8, origin: 'soldier' });
    const f = run.floor!;
    expect(FLOORS.get(1)?.lord).toBeTruthy();
    const room = f.rooms.find((r) => r.id !== f.portal && r.id !== f.start)!;
    room.type = 'lord';
    room.cleared = false;
    f.pos = room.id;
    run.player.hp = 30;
    expect(startGuardian(run)).toBeNull();
    expect(run.player.hp).toBe(30);
  });

  it('정예·수호자 전투의 적은 층별 배율만큼 세게 때린다 (일반전은 그대로)', () => {
    expect(ELITE_DMG_MULT.slice(3)).toEqual([1.25, 1.35, 1.35]);
    expect(BOSS_DMG_MULT.slice(2)).toEqual([1.15, 1.3, 1.35, 1.2]);
    const run = newRun({ seed: 9, origin: 'soldier' });
    run.floor!.tide = 0;
    const c = startCombat(run, 'a4-starfall', { anomaly: null });
    const e = c.alive[0];
    expect(ENEMIES.get(e.def)?.act).toBe(4);
    const base = c.preview(e, c.p, 100, 'blunt');
    c.s.kind = 'elite';
    expect(Math.abs(c.preview(e, c.p, 100, 'blunt') - base * ELITE_DMG_MULT[4])).toBeLessThanOrEqual(1);
    c.s.kind = 'boss';
    expect(Math.abs(c.preview(e, c.p, 100, 'blunt') - base * BOSS_DMG_MULT[4])).toBeLessThanOrEqual(1);
    expect(base).toBe(Math.floor(100 * ACT_DMG_MULT[4]));
  });
});

/** 깨끗한 군인 하나로 한 전투 (유물·장신구 없음, 적은 단단하게) */
function arena(enc: string, skills: string[], str = 0): Combat {
  const run = newRun({ seed: 2026, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  run.player.str = str;
  run.skills = skills.map((id, i) => ({ uid: `s${i}`, id, lvl: 0, runes: [] }));
  run.slots = run.skills.map((s) => s.uid);
  const c = startCombat(run, enc, { anomaly: null });
  c.s.ap = 20;
  c.p.st = {};
  for (const e of c.s.enemies) {
    e.hp = e.maxHp = 999;
    e.block = 0;
    e.weak = [];
    e.resist = {};
    e.st = {};
    e.poise = e.maxPoise = 0;
  }
  c.drain();
  return c;
}
const hits = (c: Combat) => c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt !== 'p');

describe('고정 가산은 스킬 한 번에 대상마다 한 번', () => {
  it('같은 대상을 여러 번 때리면 힘은 첫 타격에만 붙는다', () => {
    const c = arena('a1-thug', ['fan-fire'], 5);
    expect(c.useSkill('s0')).toBeNull();
    const dmg = SKILLS.get('fan-fire')!.vals.dmg as number[];
    expect(hits(c).map((h) => h.amount)).toEqual([dmg[0] + 5, dmg[0], dmg[0], dmg[0]]);
  });

  it('광역은 대상마다 한 번씩 붙는다', () => {
    const c = arena('a1-thug-smuggler', ['suppress'], 5);
    expect(c.useSkill('s0')).toBeNull();
    const dmg = SKILLS.get('suppress')!.vals.dmg as number[];
    const hs = hits(c);
    expect(hs.length).toBe(2);
    for (const h of hs) expect(h.amount).toBe(dmg[0] + 5);
  });

  it('다른 스킬을 쓰면 다시 첫 타격 — 한 턴에 한 번이 아니라 스킬마다 한 번', () => {
    const c = arena('a1-thug', ['aimed-shot', 'kneecap'], 3);
    c.useSkill('s0');
    c.useSkill('s1');
    const hs = hits(c);
    expect(hs[0].amount).toBe((SKILLS.get('aimed-shot')!.vals.dmg as number[])[0] + 3);
    expect(hs[1].amount).toBe((SKILLS.get('kneecap')!.vals.dmg as number[])[0] + 3);
  });

  it("'타격마다'로 설계된 시궁쥐 떼 정수(무리 근성)는 그대로 타격마다 붙는다", () => {
    const c = arena('a1-thug', ['fan-fire'], 0);
    c.run.essences = [{ uid: 'r', id: 'rats', color: 0, core: true }];
    c.useSkill('s0');
    const dmg = (SKILLS.get('fan-fire')!.vals.dmg as number[])[0];
    expect(hits(c).map((h) => h.amount)).toEqual([dmg + 1, dmg + 1, dmg + 1, dmg + 1]);
  });

  it('미리보기는 여러 번 때리는 스킬의 이후 타격과 첫 타를 나눠 보여 준다', () => {
    const c = arena('a1-thug', ['fan-fire', 'aimed-shot'], 4);
    const t = c.alive[0];
    const multi = c.skillInfo('s0')!;
    const segs = skillDesc(multi.def, 0, { c, target: t, use: c.makeUse(multi) });
    const text = segs.map((s) => s.t).join('');
    const dmg = (multi.def.vals.dmg as number[])[0];
    expect(text).toContain(`${dmg}(첫 타 ${dmg + 4})`);
    // 한 번 때리는 스킬은 그대로 하나의 숫자
    const single = c.skillInfo('s1')!;
    const t2 = skillDesc(single.def, 0, { c, target: t, use: c.makeUse(single) }).map((s) => s.t).join('');
    expect(t2).toContain(String((single.def.vals.dmg as number[])[0] + 4));
    expect(t2).not.toContain('첫 타');
  });
});
