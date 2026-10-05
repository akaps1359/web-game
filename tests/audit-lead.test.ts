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

describe('점검: 지속 피해는 행동 전에 정산', () => {
  for (const id of ['bleed', 'poison', 'burn']) {
    it(`${id}: 적은 자기 차례 시작에 먼저 피해를 받고, 그걸로 쓰러지면 행동하지 못한다`, () => {
      const run = newRun({ seed: 21, origin: 'soldier' });
      const c = startCombat(run, 'a1-cult', { anomaly: null });
      for (const e of c.alive) {
        e.hp = 3;
        e.block = 0;
        e.st[id] = 10;
      }
      const hp = c.p.hp;
      const san = c.p.sanity;
      c.endTurn();
      expect(c.alive.length).toBe(0);
      expect(c.p.hp).toBe(hp);
      expect(c.p.sanity).toBe(san);
    });

    it(`${id}: 나는 내 차례가 시작될 때 행동하기 전에 피해를 받는다`, () => {
      const run = newRun({ seed: 22, origin: 'soldier' });
      const c = startCombat(run, 'a1-cult', { anomaly: null });
      for (const e of c.alive) e.st.stun = 5;
      c.p.st[id] = 4;
      const hp = c.p.hp;
      c.endTurn();
      // 적은 기절해 아무것도 못 했으니, 줄어든 체력은 모두 내 차례 시작의 지속 피해다
      expect(c.s.phase).toBe('player');
      expect(c.p.hp).toBeLessThan(hp);
    });
  }
});

describe('점검: 신전 금기의 봉헌', () => {
  it('같은 신전에서는 다시 열어도 후보가 같고, 다른 신전은 따로 정해진다', async () => {
    const { forbiddenOffer } = await import('../src/engine/places');
    const run = newRun({ seed: 31, origin: 'occultist' });
    const f = run.floor!;
    f.pos = 1;
    const a = forbiddenOffer(run);
    const b = forbiddenOffer(run);
    expect(Array.isArray(a)).toBe(true);
    expect(b).toEqual(a);
    f.pos = 2;
    const c = forbiddenOffer(run);
    expect(Array.isArray(c)).toBe(true);
    f.pos = 1;
    expect(forbiddenOffer(run)).toEqual(a);
  });
});

describe('점검: 정수 규칙', () => {
  it('계층정수는 판당 하나뿐', async () => {
    const { absorbEssence } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const lords = [...ESSENCES.values()].filter((d) => d.lord);
    expect(lords.length).toBeGreaterThan(1);
    const run = newRun({ seed: 41, origin: 'soldier' });
    run.player.level = 20;
    expect(absorbEssence(run, { id: lords[0].id, color: 0, guardian: true })).toBeNull();
    expect(absorbEssence(run, { id: lords[1].id, color: 0, guardian: true })).toBe('계층정수는 판당 하나뿐이다');
  });

  it('수호자판으로 바꿔 흡수해도 강화해 둔 정수 스킬은 그대로', async () => {
    const { absorbEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 42, origin: 'soldier' });
    run.player.level = 10;
    absorbEssence(run, { id: 'lurker', color: 0 });
    const s = run.skills.find((x) => x.from === run.essences[0].uid)!;
    s.lvl = 1;
    absorbEssence(run, { id: 'lurker', color: 0, guardian: true });
    expect(run.skills.find((x) => x.id === s.id)!.lvl).toBe(1);
  });
});

describe('정수: 기술로 / 본질로 흡수', () => {
  it('본질로 흡수하면 기술 없이 최대 체력을 더 받고, 지우면 정확히 되돌아간다', async () => {
    const { absorbEssence, coreHp, essenceStats, removeEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 51, origin: 'soldier' });
    run.player.level = 10;
    run.player.gold = 999;
    const before = { ...run.player };
    const skills = run.skills.length;
    expect(absorbEssence(run, { id: 'thug', color: 0 }, true)).toBeNull();
    expect(run.essences[0].core).toBe(true);
    expect(run.skills.length).toBe(skills);
    const one = essenceStats('thug');
    const two = essenceStats('thug', false, true);
    expect(two.str).toBe(one.str);
    expect(two.maxHp).toBe((one.maxHp ?? 0) + coreHp(9));
    expect(coreHp(1)).toBeGreaterThan(coreHp(9));
    expect(run.player.str).toBe(before.str + (two.str ?? 0));
    expect(run.player.maxHp).toBe(before.maxHp + (two.maxHp ?? 0));
    expect(removeEssence(run, run.essences[0].uid)).toBeNull();
    expect(run.player.str).toBe(before.str);
    expect(run.player.maxHp).toBe(before.maxHp);
  });

  it('기술로 흡수하면 기술을 배운다 (능력치는 한 배)', async () => {
    const { absorbEssence, essenceStats } = await import('../src/engine/run');
    const run = newRun({ seed: 52, origin: 'soldier' });
    run.player.level = 10;
    const str = run.player.str;
    absorbEssence(run, { id: 'thug', color: 0 });
    expect(run.essences[0].core).toBeUndefined();
    expect(run.skills.some((s) => s.from === run.essences[0].uid)).toBe(true);
    expect(run.player.str).toBe(str + (essenceStats('thug').str ?? 0));
  });

  it('본질 정수를 수호자판 기술로 바꿔 흡수할 수 있고, 능력치가 이중으로 남지 않는다', async () => {
    const { absorbEssence, essenceStats } = await import('../src/engine/run');
    const run = newRun({ seed: 53, origin: 'soldier' });
    run.player.level = 10;
    const str = run.player.str;
    absorbEssence(run, { id: 'thug', color: 0 }, true);
    expect(absorbEssence(run, { id: 'thug', color: 0, guardian: true })).toBeNull();
    expect(run.essences.length).toBe(1);
    expect(run.essences[0].core).toBeUndefined();
    expect(run.player.str).toBe(str + (essenceStats('thug', true).str ?? 0));
    expect(run.skills.filter((s) => s.from === run.essences[0].uid).length).toBeGreaterThan(0);
  });

  it('본질로 흡수한 정수는 기술이 겹친다는 이유로 막지 않는다', async () => {
    const { absorbBlock, absorbEssence } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const run = newRun({ seed: 54, origin: 'soldier' });
    run.player.level = 30;
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (const d of ESSENCES.values()) {
      if (d.lord) continue;
      const other = seen.get(d.actives[0]);
      if (other) pair = [other, d.id];
      else seen.set(d.actives[0], d.id);
    }
    if (!pair) return; // 기술을 공유하는 정수가 없다
    absorbEssence(run, { id: pair[0], color: 0 });
    expect(absorbBlock(run, { id: pair[1], color: 0 })).toBe('같은 능력을 주는 정수가 있다');
    expect(absorbBlock(run, { id: pair[1], color: 0 }, true)).toBeNull();
  });
});

describe('지속 피해 밸런스', () => {
  it('화상도 출혈·독처럼 턴마다 1씩 줄어든다 (한 번 건 화상이 보스전 내내 타지 않게)', () => {
    const run = newRun({ seed: 61, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const e = c.alive[0];
    e.hp = e.maxHp = 999;
    for (const x of c.alive) x.st.stun = 9;
    e.st.burn = 3;
    const hp = e.hp;
    for (let i = 0; i < 5; i++) c.endTurn();
    expect(hp - e.hp).toBe(3 + 2 + 1);
    expect(e.st.burn ?? 0).toBe(0);
  });
});
