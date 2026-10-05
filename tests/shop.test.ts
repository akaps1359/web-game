import { describe, expect, it } from 'vitest';
import '../src/content';
import { SKILLS } from '../src/engine/registry';
import { learnSkill, newRun } from '../src/engine/run';
import { discardSkill, sellPrice, sellSkill, skillLockReason, skillSellPrice } from '../src/engine/shop';
import { unequip } from '../src/engine/run';
import { trainPaid } from '../src/engine/places';
import { goHaven } from '../src/engine/dungeon';

describe('스킬 처분', () => {
  const someSkill = [...SKILLS.values()].find((s) => s.rarity === 'uncommon')!.id;

  it('팔면 상점 값보다 훨씬 싸게 골드를 받고 스킬이 사라진다', () => {
    const run = newRun({ seed: 7, origin: 'soldier' });
    const s = learnSkill(run, someSkill)!;
    const gold = run.player.gold;
    const price = skillSellPrice(run, s.uid);
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(40);
    expect(sellSkill(run, s.uid)).toBeNull();
    expect(run.player.gold).toBe(gold + price);
    expect(run.skills.some((x) => x.uid === s.uid)).toBe(false);
  });

  it('버리면 새겨 둔 각인을 돌려받는다', () => {
    const run = newRun({ seed: 8, origin: 'soldier' });
    const s = learnSkill(run, someSkill)!;
    s.runes.push('rune-test');
    const before = run.runes.length;
    expect(discardSkill(run, s.uid)).toBeNull();
    expect(run.runes.length).toBe(before + 1);
  });

  it('장착 중이거나 정수에서 얻은 스킬은 팔 수 없다', () => {
    const run = newRun({ seed: 9, origin: 'soldier' });
    const equipped = run.slots.find(Boolean)!;
    expect(skillLockReason(run, equipped)).not.toBeNull();
    expect(sellSkill(run, equipped)).not.toBeNull();
    const s = learnSkill(run, someSkill, 'essence-uid')!;
    expect(skillLockReason(run, s.uid)).not.toBeNull();
  });

  it('시작할 때 받은 기본 템은 팔아도 0골드', () => {
    const run = newRun({ seed: 10, origin: 'soldier' });
    const starter = run.skills.find((x) => !run.slots.includes(x.uid)) ?? run.skills[0];
    expect(starter.starter).toBe(true);
    expect(skillSellPrice(run, starter.uid)).toBe(0);
    const weapon = run.equip.weapon!;
    expect(unequip(run, 'weapon')).toBe(true);
    expect(sellPrice(run, weapon.uid)).toBe(0);
  });

  it('거점 훈련장 강화는 거점마다 한 번', () => {
    const run = newRun({ seed: 11, origin: 'soldier' });
    run.player.gold = 999;
    goHaven(run);
    const [a, b] = run.skills;
    expect(trainPaid(run, a.uid)).toBeNull();
    expect(trainPaid(run, b.uid)).not.toBeNull();
    goHaven(run);
    expect(trainPaid(run, b.uid)).toBeNull();
  });
});
