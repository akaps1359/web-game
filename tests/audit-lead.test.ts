import { describe, expect, it } from 'vitest';
import '../src/content';
import { newRun, startCombat } from '../src/engine/run';

describe('점검: 공용 도우미·엔진', () => {
  it('공허 각인을 단 인장 폭발은 공허 피해', () => {
    const run = newRun({ seed: 1, origin: 'occultist' });
    run.skills = [{ uid: 'sk', id: 'detonate', lvl: 0, runes: ['void-rune'] }];
    run.slots = ['sk'];
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const t = c.row(0)[0];
    t.st.mark = 2;
    c.drain();
    c.useSkill('sk', t.uid);
    const types = c
      .drain()
      .filter((e) => e.t === 'dmg' && e.tgt === t.uid)
      .map((e) => (e as { dtype: string }).dtype);
    expect(types).toEqual(['void']);
  });

  it('메아리 각인을 단 총기 스킬은 탄약이 없으면 메아리가 울리지 않는다', () => {
    const run = newRun({ seed: 2, origin: 'soldier' });
    const s = run.skills.find((x) => x.id === 'aimed-shot')!;
    s.runes = ['echo'];
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.s.ammo = 1;
    c.s.ap = 5;
    const t = c.row(0)[0];
    c.drain();
    expect(c.useSkill(s.uid, t.uid)).toBeNull();
    const echoes = c.drain().filter((e) => e.t === 'skill' && (e as { echo?: boolean }).echo);
    expect(echoes.length).toBe(0);
    expect(c.s.ammo).toBe(0);
  });
});

describe('점검: 정수 승급', () => {
  it('이계 정수를 수호자판으로 바꿔 흡수해도 최대 정신력 대가는 한 번만', async () => {
    const { absorbEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 1, origin: 'soldier' });
    run.player.level = 10;
    const base = run.player.maxSanity;
    expect(absorbEssence(run, { id: 'lurker', color: 0 })).toBeNull();
    expect(absorbEssence(run, { id: 'lurker', color: 0, guardian: true })).toBeNull();
    expect(run.player.maxSanity).toBe(base - 5);
  });
});

describe('점검: 엔진 (아이템 감사에서 나온 것)', () => {
  it('사경 중에 맞으면 정신력이 깎인다', async () => {
    const run = newRun({ seed: 7, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const e = c.alive[0];
    c.damage({ src: e, tgt: c.p, base: 999, type: 'blunt', attack: true });
    expect(c.dying).toBe(true);
    const s = c.p.sanity;
    c.damage({ src: e, tgt: c.p, base: 10, type: 'blunt', attack: true });
    expect(c.p.sanity).toBeLessThan(s);
  });

  it('무한의 고리를 가지면 레벨이 올라도 슬롯이 하나 더 많다', async () => {
    const { gainRelic, gainXp } = await import('../src/engine/run');
    const a = newRun({ seed: 3, origin: 'soldier' });
    const b = newRun({ seed: 3, origin: 'soldier' });
    gainRelic(a, 'infinite-ring');
    gainXp(a, 1e5);
    gainXp(b, 1e5);
    expect(a.slots.length).toBe(b.slots.length + 1);
  });

  it('상인 조합 주화는 이미 본 상점에도 바로 할인된다', async () => {
    const { gainRelic } = await import('../src/engine/run');
    const { openShop, priceOf } = await import('../src/engine/shop');
    const run = newRun({ seed: 4, origin: 'soldier' });
    openShop(run, 'haven');
    const it = run.shop!.items[0];
    const before = priceOf(run, it);
    gainRelic(run, 'membership-coin');
    expect(priceOf(run, it)).toBeLessThan(before);
  });

  it('방풍 등은 강화하면 등불을 더 아낀다', async () => {
    const { lightCost } = await import('../src/engine/dungeon');
    const run = newRun({ seed: 5, origin: 'soldier' });
    run.equip.trinket2 = { uid: 'lan', id: 'storm-lantern', lvl: 0 };
    const c0 = lightCost(run);
    run.equip.trinket2.lvl = 2;
    expect(lightCost(run)).toBe(Math.max(1, c0 - 2));
  });
});

describe('점검: 판단 반영', () => {
  it('돈을 내고 이계 정수를 지우면 통찰 +1도 사라진다', async () => {
    const { absorbEssence, removeEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 12, origin: 'soldier' });
    run.player.level = 10;
    run.player.gold = 999;
    const ins = run.player.insight;
    const san = run.player.maxSanity;
    absorbEssence(run, { id: 'lurker', color: 0 });
    expect(run.player.insight).toBe(ins + 1);
    expect(removeEssence(run, run.essences[0].uid)).toBeNull();
    expect(run.player.insight).toBe(ins);
    expect(run.player.maxSanity).toBe(san);
  });

  it('균열에는 공용 전장 규칙(x-rule-*)도 나온다', async () => {
    const { ANOMALIES } = await import('../src/engine/registry');
    const rules = [...ANOMALIES.keys()].filter((k) => /^(x-)?rule-/.test(k));
    expect(rules).toContain('x-rule-bloodmoon');
    expect(rules).toContain('x-rule-darkness');
    expect(rules).toContain('x-rule-escalation');
  });
});
