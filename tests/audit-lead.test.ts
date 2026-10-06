import { describe, expect, it } from 'vitest';
import '../src/content';
import { newRun, startCombat, type LootItem } from '../src/engine/run';

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

  it('수호자판으로 바꿔 흡수해도 강화해 둔 정수 스킬은 그대로 (예전 저장: 보통 정수를 기술로 흡수한 경우)', async () => {
    const { absorbEssence, learnSkill } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const run = newRun({ seed: 42, origin: 'soldier' });
    run.player.level = 10;
    // 예전 방식으로 흡수해 둔 정수 (기술 있음)
    run.essences.push({ uid: 'old-es', id: 'lurker', color: 0 });
    const s = learnSkill(run, ESSENCES.get('lurker')!.actives[0], 'old-es')!;
    s.lvl = 1;
    absorbEssence(run, { id: 'lurker', color: 0, guardian: true });
    expect(run.skills.find((x) => x.id === s.id)!.lvl).toBe(1);
  });
});

describe('정수: 보통 정수는 본질, 수호자 정수는 본질 + 기술 하나', () => {
  it('보통 정수는 기술 없이 최대 체력을 더 받고, 지우면 정확히 되돌아간다', async () => {
    const { absorbEssence, coreHp, essenceStats, removeEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 51, origin: 'soldier' });
    run.player.level = 10;
    run.player.gold = 999;
    const before = { ...run.player };
    const skills = run.skills.length;
    expect(absorbEssence(run, { id: 'thug', color: 0 })).toBeNull();
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

  it('수호자 정수는 본질(능력치 1.5배·패시브·최대 체력)에 더해 고른 기술 하나만 배운다', async () => {
    const { absorbEssence, essenceStats, removeEssence } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const run = newRun({ seed: 52, origin: 'soldier' });
    run.player.level = 10;
    run.player.gold = 999;
    const str = run.player.str;
    const hp = run.player.maxHp;
    const n = run.skills.length;
    const pick = ESSENCES.get('thug')!.actives[1];
    expect(absorbEssence(run, { id: 'thug', color: 0, guardian: true }, pick)).toBeNull();
    const es = run.essences[0];
    expect(es.core).toBe(true);
    expect(es.skill).toBe(pick);
    expect(run.skills.length).toBe(n + 1);
    expect(run.skills.some((s) => s.id === pick && s.from === es.uid)).toBe(true);
    const st = essenceStats('thug', true, true);
    expect(run.player.str).toBe(str + (st.str ?? 0));
    expect(run.player.maxHp).toBe(hp + (st.maxHp ?? 0));
    // 지우면 고른 기술도 사라진다
    expect(removeEssence(run, es.uid)).toBeNull();
    expect(run.skills.length).toBe(n);
    expect(run.player.maxHp).toBe(hp);
  });

  it('수호자 정수를 기술 없이(null) 흡수할 수 있고, 없는 기술은 고를 수 없다', async () => {
    const { absorbBlock, absorbEssence } = await import('../src/engine/run');
    const run = newRun({ seed: 55, origin: 'soldier' });
    run.player.level = 10;
    const n = run.skills.length;
    expect(absorbBlock(run, { id: 'thug', color: 0, guardian: true }, 'aimed-shot')).toBe('이 정수에는 그런 기술이 없다');
    expect(absorbEssence(run, { id: 'thug', color: 0, guardian: true }, null)).toBeNull();
    expect(run.essences[0].core).toBe(true);
    expect(run.skills.length).toBe(n);
  });

  it('보통 정수를 수호자판으로 바꿔 흡수할 수 있고, 능력치가 이중으로 남지 않는다', async () => {
    const { absorbEssence, essenceStats } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const run = newRun({ seed: 53, origin: 'soldier' });
    run.player.level = 10;
    const str = run.player.str;
    absorbEssence(run, { id: 'thug', color: 0 });
    const pick = ESSENCES.get('thug')!.actives[0];
    expect(absorbEssence(run, { id: 'thug', color: 0, guardian: true }, pick)).toBeNull();
    expect(run.essences.length).toBe(1);
    expect(run.player.str).toBe(str + (essenceStats('thug', true, true).str ?? 0));
    expect(run.skills.filter((s) => s.from === run.essences[0].uid).length).toBe(1);
  });

  it('고른 기술이 이미 다른 정수에서 배운 기술과 겹치면 막는다 (기술을 안 고르면 괜찮다)', async () => {
    const { absorbBlock, absorbEssence } = await import('../src/engine/run');
    const { ESSENCES } = await import('../src/engine/registry');
    const run = newRun({ seed: 54, origin: 'soldier' });
    run.player.level = 30;
    const seen = new Map<string, string>();
    let pair: [string, string, string] | null = null;
    for (const d of ESSENCES.values()) {
      if (d.lord) continue;
      for (const a of d.actives) {
        const other = seen.get(a);
        if (other && other !== d.id) pair = [other, d.id, a];
        else seen.set(a, d.id);
      }
    }
    if (!pair) return; // 기술을 공유하는 정수가 없다
    absorbEssence(run, { id: pair[0], color: 0, guardian: true }, pair[2]);
    expect(absorbBlock(run, { id: pair[1], color: 0, guardian: true }, pair[2])).toBe('같은 능력을 주는 정수가 있다');
    expect(absorbBlock(run, { id: pair[1], color: 0, guardian: true }, null)).toBeNull();
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

describe('지도: 지나온 길', () => {
  it('층을 시작하면 시작 방에서, 이동할 때마다 발자국이 이어진다 (예전 저장도 떠나온 방부터)', async () => {
    const { moveTo } = await import('../src/engine/dungeon');
    const run = newRun({ seed: 71, origin: 'soldier' });
    const f = run.floor!;
    expect(f.trail).toEqual([f.start]);
    const a = f.rooms[f.pos].links[0];
    run.screen = 'dungeon';
    expect(moveTo(run, a)).toBeNull();
    expect(f.trail).toEqual([f.start, a]);
    // 예전 저장: trail 없음
    delete f.trail;
    run.screen = 'dungeon';
    run.combat = null;
    const b = f.rooms[f.pos].links.find((x) => x !== f.start) ?? f.start;
    expect(moveTo(run, b)).toBeNull();
    expect(f.trail).toEqual([a, b]);
  });
});

describe('정수 병', () => {
  const drop = (id = 'thug', guardian = false): LootItem => ({ kind: 'essence', id, color: 0, guardian });

  it('흡수 한도가 차 있어도 병에 담을 수 있고, 병은 둘까지', async () => {
    const { absorbEssence, bottleEssence, FLASK_CAP } = await import('../src/engine/run');
    const run = newRun({ seed: 81, origin: 'soldier' });
    expect(absorbEssence(run, { id: 'dog', color: 0 })).toBeNull(); // 레벨 1 → 한도 1 꽉 참
    expect(absorbEssence(run, { id: 'thug', color: 0 })).not.toBeNull();
    const a = drop('thug');
    expect(bottleEssence(run, a)).toBeNull();
    expect(a.taken && a.bottled).toBe(true);
    expect(bottleEssence(run, drop('smuggler'))).toBeNull();
    expect(run.flasks!.length).toBe(FLASK_CAP);
    expect(bottleEssence(run, drop('sailor'))).toBe('정수 병이 가득 찼다');
  });

  it('신전에서만, 골드를 내고 새긴다 (한도는 그대로 지킨다)', async () => {
    const { bottleEssence, inscribeCost } = await import('../src/engine/run');
    const { inscribeFlask } = await import('../src/engine/places');
    const run = newRun({ seed: 82, origin: 'soldier' });
    run.player.level = 3;
    run.player.gold = 500;
    bottleEssence(run, drop('thug'));
    run.screen = 'dungeon';
    expect(inscribeFlask(run, 0)).toBe('신전에서만 새길 수 있다');
    run.screen = 'shrine';
    const cost = inscribeCost({ id: 'thug', color: 0 });
    expect(cost).toBeGreaterThan(0);
    expect(inscribeFlask(run, 0)).toBeNull();
    expect(run.player.gold).toBe(500 - cost);
    expect(run.flasks!.length).toBe(0);
    expect(run.essences.some((e) => e.id === 'thug' && e.core)).toBe(true);
    // 골드가 모자라면 새기지 못하고 병도 그대로
    bottleEssence(run, drop('dog'));
    run.player.gold = 0;
    expect(inscribeFlask(run, 0)).toBe('골드가 부족하다');
    expect(run.flasks!.length).toBe(1);
  });

  it('수호자 정수는 병에서 꺼낼 때 기술을 고르고, 값은 1.5배', async () => {
    const { bottleEssence, inscribeCost } = await import('../src/engine/run');
    const { inscribeFlask } = await import('../src/engine/places');
    const run = newRun({ seed: 83, origin: 'soldier' });
    run.player.level = 5;
    run.player.gold = 999;
    bottleEssence(run, drop('thug', true));
    expect(inscribeCost({ id: 'thug', color: 0, guardian: true })).toBe(Math.round(inscribeCost({ id: 'thug', color: 0 }) * 1.5));
    run.screen = 'haven';
    expect(inscribeFlask(run, 0, 'ess-thug-pipe')).toBeNull();
    expect(run.skills.some((s) => s.id === 'ess-thug-pipe')).toBe(true);
    expect(run.essences[0].skill).toBe('ess-thug-pipe');
  });

  it('병을 비우면 사라진다', async () => {
    const { bottleEssence, pourFlask } = await import('../src/engine/run');
    const run = newRun({ seed: 84, origin: 'soldier' });
    bottleEssence(run, drop('thug'));
    expect(pourFlask(run, 0)).toBeNull();
    expect(run.flasks!.length).toBe(0);
    expect(pourFlask(run, 0)).toBe('병이 비어 있다');
  });
});

describe('즉사기', () => {
  it('막지 못하면 사경 없이 그 자리에서 패배하고, 판 끝 사유에 기술 이름이 남는다', async () => {
    const { finishCombat } = await import('../src/engine/run');
    const run = newRun({ seed: 91, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    expect(c.executePlayer(c.alive[0], '시험의 심판')).toBe(true);
    expect(c.s.phase).toBe('defeat');
    expect(c.s.doom).toBe('시험의 심판');
    expect(c.p.hp).toBe(0);
    finishCombat(run);
    expect(run.over?.reason).toContain('시험의 심판');
  });

  it('결계가 있으면 하나를 깨뜨려 막는다', () => {
    const run = newRun({ seed: 92, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.p.st.ward = 2;
    const hp = c.p.hp;
    expect(c.executePlayer(c.alive[0], '시험의 심판')).toBe(false);
    expect(c.s.phase).toBe('player');
    expect(c.p.st.ward).toBe(1);
    expect(c.p.hp).toBe(hp);
  });

  it('퍼즐 목표는 저장(JSON)에 남고 스냅샷에도 실린다', () => {
    const run = newRun({ seed: 93, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.s.obj = { text: '방어도 12 이상으로 턴을 마쳐라', block: 12 };
    expect(c.snap().obj?.block).toBe(12);
    const back = JSON.parse(JSON.stringify(run));
    expect(back.combat.obj.text).toBe('방어도 12 이상으로 턴을 마쳐라');
  });
});

describe('기믹 공정성: 근접도 닿는다', () => {
  it('퍼즐 목표가 된 후열의 적은 근접 기술로도 노릴 수 있다', () => {
    const run = newRun({ seed: 94, origin: 'hunter' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const melee = [...c.alive].length ? (run.skills.map((s) => c.skillInfo(s.uid)?.def).find((d) => d?.range === 'melee' && d.target === 'single') ?? null) : null;
    if (!melee) return;
    const back = c.alive.find((e) => e.row === 1) ?? c.alive[c.alive.length - 1];
    back.row = 1;
    if (!c.row(0).length) c.alive[0].row = 0;
    expect(c.validTargets(melee).some((e) => e.uid === back.uid)).toBe(false);
    c.s.obj = { text: '저것을 깨뜨려라', hit: { uid: back.uid, need: 10 } };
    expect(c.validTargets(melee).some((e) => e.uid === back.uid)).toBe(true);
    c.s.obj = null;
    back.mem.reachable = 1;
    expect(c.validTargets(melee).some((e) => e.uid === back.uid)).toBe(true);
  });
});

describe('전투 중 선택지', () => {
  it('고르기 전에는 기술·소모품·턴 종료가 막히고, 고르면 onChoice가 불리며 저장에도 남는다', async () => {
    const { reg } = await import('../src/engine/registry');
    reg.statuses([
      {
        id: 'zz-choice-probe',
        name: '시험',
        icon: 'gi:choice',
        kind: 'buff',
        desc: '선택지 시험',
        hooks: {
          onChoice(c, _s, choice, option) {
            c.s.vars['zz-picked'] = choice === 'zz' && option === 'b' ? 2 : 1;
          },
        },
      },
    ]);
    const run = newRun({ seed: 95, origin: 'soldier' });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.p.st['zz-choice-probe'] = 1;
    c.offerChoice({ id: 'zz', title: '시험', options: [{ id: 'a', label: '가', desc: '가' }, { id: 'b', label: '나', desc: '나', bot: 5 }] });
    expect(c.blockReason('weapon')).toBe('먼저 선택지를 고르세요');
    expect(c.useConsumable(0)).toBe('먼저 선택지를 고르세요');
    expect(c.endTurn()).toBe('먼저 선택지를 고르세요');
    const back = JSON.parse(JSON.stringify(run));
    expect(back.combat.choice.options.length).toBe(2);
    expect(c.choose('없음')).toBe('없는 선택지');
    // 봇은 우선순위가 높은 쪽을 고르고 턴을 이어 간다
    const { autoTurn } = await import('../src/sim/bot');
    autoTurn(c);
    expect(c.s.vars['zz-picked']).toBe(2);
    expect(c.s.choice ?? null).toBeNull();
  });
});

describe('도감: 장비·스킬 기록과 테스트용 되돌리기', () => {
  it('판의 장비(장착·가방)와 스킬이 도감에 기록된다', async () => {
    const { absorbRun, defaultMeta } = await import('../src/state/meta');
    const run = newRun({ seed: 96, origin: 'hunter' });
    const m = defaultMeta();
    absorbRun(m, run, false);
    for (const it of Object.values(run.equip)) if (it) expect(m.equips).toContain(it.id);
    for (const sk of run.skills) expect(m.skills).toContain(sk.id);
    // 같은 것은 한 번만
    absorbRun(m, run, false);
    expect(new Set(m.equips).size).toBe(m.equips.length);
  });

  it('전체 해금은 장비·정수·스킬·유물 도감을 모두 연다 (스킬은 기본 공격·정수 기술 제외)', async () => {
    const { codexSkills, defaultMeta, unlockAllInfo } = await import('../src/state/meta');
    const { EQUIPS, ESSENCES, RELICS } = await import('../src/engine/registry');
    const m = defaultMeta();
    unlockAllInfo(m);
    expect(m.equips.length).toBe(EQUIPS.size);
    expect(m.essences.length).toBe(ESSENCES.size);
    expect(m.relics.length).toBe(RELICS.size);
    const pool = codexSkills();
    expect(pool.length).toBeGreaterThan(50);
    expect(pool.some((d) => d.tags.includes('basic') || d.school === 'essence')).toBe(false);
    for (const d of pool) expect(m.skills).toContain(d.id);
  });

  it('기억한 기록으로 되돌리면 진행은 그때로, 설정은 지금 것으로', async () => {
    const { blankMeta, defaultMeta, restoredMeta, unlockAllInfo } = await import('../src/state/meta');
    const real = defaultMeta();
    real.runs = 7;
    real.equips = ['x-real'];
    const saved = JSON.parse(JSON.stringify(real));
    unlockAllInfo(real);
    real.speed = 2;
    real.confirm = false;
    const back = restoredMeta(real, saved);
    expect(back.runs).toBe(7);
    expect(back.equips).toEqual(['x-real']);
    expect(back.speed).toBe(2);
    expect(back.confirm).toBe(false);
    const blank = blankMeta(real);
    expect(blank.runs).toBe(0);
    expect(blank.equips).toEqual([]);
    expect(blank.speed).toBe(2);
  });
});
