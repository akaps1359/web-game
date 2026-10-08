import { describe, expect, it } from 'vitest';
import '../src/content';
import { BREAKDOWN_RESET, Combat } from '../src/engine/combat';
import { ANOMALIES, ENCOUNTERS, EQUIPS, ESSENCES, MADNESS, RELICS, SKILLS, STATUSES } from '../src/engine/registry';
import {
  absorbEssence,
  finishCombat,
  gainRelic,
  learnSkill,
  loseSanityRun,
  newRun,
  startCombat,
  type RunState,
} from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { chooseEvent, eventView, startEvent } from '../src/engine/events';
import { seizeSkill } from '../src/content/act3/common';
import { DMG_TYPES } from '../src/engine/types';

/**
 * 엔진·콘텐츠 감사에서 나온 것.
 * 판 전체 퍼즈(봇 + 사람이 할 법한 잡다한 조작으로 수백 판, 매 걸음 불변식·JSON 왕복 검사)와 설명 대조에서 찾았다.
 */

/** 튼튼한 주인공 */
function sturdy(seed = 1, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.player.maxHp = run.player.hp = 999;
  run.player.maxSanity = run.player.sanity = 200;
  return run;
}

describe('점검: 정신력 붕괴 뒤 회복', () => {
  it('최대 정신력이 60보다 낮으면 전투 중 붕괴해도 최대 정신력을 넘겨 채우지 않는다', () => {
    const run = newRun({ seed: 5, origin: 'soldier' });
    run.player.maxSanity = 40; // 이계 정수·금기의 봉헌으로 깎인 상태
    run.player.sanity = 3;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.loseSanity(20);
    expect(run.madness.length).toBe(1);
    expect(c.p.sanity).toBe(40);
  });

  it('전투 밖에서 붕괴해도 마찬가지 (어둠 속 이동 등)', () => {
    const run = newRun({ seed: 6, origin: 'hunter' });
    run.player.maxSanity = 35;
    run.player.sanity = 2;
    const res = loseSanityRun(run, 10);
    expect(res.madness).toBeTruthy();
    expect(run.player.sanity).toBe(35);
  });

  it('최대 정신력이 넉넉하면 여전히 60으로 돌아온다', () => {
    const run = newRun({ seed: 7, origin: 'occultist' });
    run.player.sanity = 2;
    loseSanityRun(run, 10);
    expect(run.player.sanity).toBe(BREAKDOWN_RESET);
  });
});

describe('점검: 받는 정신 피해 효과는 전투 밖에서도', () => {
  const lost = (setup: (r: RunState) => void) => {
    const run = newRun({ seed: 8, origin: 'soldier' });
    setup(run);
    return loseSanityRun(run, 20).lost;
  };

  it('은 십자가·깨진 정신·명징·공허의 심장이 어둠 속 이동·이벤트의 정신력 손실에도 적용된다', () => {
    const base = lost(() => {});
    expect(base).toBe(20);
    expect(lost((r) => void (r.equip.trinket2 = { uid: 't', id: 'silver-cross', lvl: 0 }))).toBe(19);
    expect(lost((r) => void (r.equip.trinket2 = { uid: 't', id: 'silver-cross', lvl: 2 }))).toBe(17);
    expect(lost((r) => void (r.madness = ['fragile-mind']))).toBe(24);
    expect(lost((r) => void (r.madness = ['clarity']))).toBe(15);
    expect(lost((r) => gainRelic(r, 'void-heart'))).toBeGreaterThan(base);
  });

  it('전투 안과 같은 값 (같은 효과, 같은 계산)', () => {
    const run = newRun({ seed: 9, origin: 'soldier' });
    run.equip.trinket2 = { uid: 't', id: 'silver-cross', lvl: 1 };
    run.madness = ['fragile-mind'];
    const outside = loseSanityRun(JSON.parse(JSON.stringify(run)), 20).lost;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const s = c.p.sanity;
    c.loseSanity(20);
    expect(s - c.p.sanity).toBe(outside);
  });
});

describe('점검: 미리보기는 판을 바꾸지 않는다', () => {
  /** 화면이 그릴 때마다 부르는 계산들 (피해·정신 피해·방어도 미리보기, 비용·대기·사용 가능 여부) */
  function probe(c: Combat, tag: string) {
    c.p.block = Math.max(c.p.block, 10);
    const before = JSON.stringify(c.run);
    const ev = c.events.length;
    const refs = ['weapon', 'armor', ...(c.run.slots.filter(Boolean) as string[])];
    for (const e of c.alive) {
      for (const t of DMG_TYPES) {
        c.preview(c.p, e, 10, t, { attack: true, skill: c.makeUse(c.skillInfo('weapon')!) });
        c.preview(e, c.p, 10, t);
      }
    }
    c.previewSanityLoss(10);
    c.previewBlock(5);
    for (const ref of refs) {
      c.blockReason(ref);
      const info = c.skillInfo(ref);
      if (info) {
        c.costOf(info);
        c.cdOf(info);
      }
    }
    expect(JSON.stringify(c.run), tag).toBe(before);
    expect(c.events.length, tag).toBe(ev);
  }

  it('철의 성의: 의도 말풍선을 그려도 방어도가 줄지 않고, 미리보기에는 줄어든 정신 피해가 보인다', () => {
    const run = sturdy();
    gainRelic(run, 'x-iron-vestment');
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.p.block = 10;
    const shown = c.previewSanityLoss(8);
    expect(c.p.block).toBe(10);
    expect(shown).toBeLessThan(8);
    const s = c.p.sanity;
    c.loseSanity(8, true);
    expect(s - c.p.sanity).toBe(shown);
    expect(c.p.block).toBeLessThan(10);
  });

  it('산맥 너머의 것 정수: 의도를 들여다보기만 해서는 방어도를 얻지 못한다', () => {
    const run = sturdy();
    run.player.level = 20;
    absorbEssence(run, { id: 'beyond-peaks', color: 0, guardian: true });
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.p.block = 0;
    for (let i = 0; i < 5; i++) c.previewSanityLoss(10);
    expect(c.p.block).toBe(0);
    expect(c.s.vars.a3veil ?? 0).toBe(0);
    c.loseSanity(10);
    expect(c.p.block).toBeGreaterThan(0);
  });

  it('모든 유물·장비·광기·정수·전장 규칙·상태·조우에서 미리보기가 상태를 바꾸지 않는다', () => {
    const at = (act: number) => {
      const run = sturdy(11);
      run.act = act;
      if (act > 1) run.floor = generateFloor(run, act);
      run.player.level = 30;
      return run;
    };
    for (const id of RELICS.keys()) {
      const run = at(1);
      gainRelic(run, id);
      probe(startCombat(run, 'a1-cult', { anomaly: null }), `유물 ${id}`);
    }
    for (const [id, def] of EQUIPS) {
      const run = at(1);
      run.equip[def.slot === 'trinket' ? 'trinket1' : def.slot] = { uid: 'eq', id, lvl: 2 };
      probe(startCombat(run, 'a1-cult', { anomaly: null }), `장비 ${id}`);
    }
    for (const id of MADNESS.keys()) {
      const run = at(1);
      run.madness = [id];
      probe(startCombat(run, 'a1-cult', { anomaly: null }), `광기 ${id}`);
    }
    for (const id of ESSENCES.keys()) {
      const run = at(1);
      absorbEssence(run, { id, color: 0, guardian: true });
      probe(startCombat(run, 'a1-cult', { anomaly: null }), `정수 ${id}`);
    }
    for (const id of ANOMALIES.keys()) probe(startCombat(at(1), 'a1-cult', { anomaly: id }), `전장 규칙 ${id}`);
    for (const id of STATUSES.keys()) {
      if (id === 'dying') continue;
      const c = startCombat(at(1), 'a1-cult', { anomaly: null });
      c.p.st[id] = 3;
      for (const e of c.alive) e.st[id] = 3;
      probe(c, `상태 ${id}`);
    }
    for (const enc of ENCOUNTERS) {
      const c = startCombat(at(Math.min(5, enc.act)), enc.id);
      if (c.over) continue;
      probe(c, `조우 ${enc.id}`);
      c.endTurn();
      if (!c.over) probe(c, `조우 ${enc.id} (2턴)`);
    }
  });
});

describe('점검: 표본으로 빼앗긴 기술', () => {
  /** 3층 고대인 사냥꾼에게 장착 기술 하나를 빼앗긴 상태. 나머지 하나는 평범하게 대기 중이고, 시험할 기술을 셋째 칸에 둔다 */
  function seizedFight(id: string, rune?: string) {
    const run = newRun({ seed: 303, origin: 'soldier' });
    run.act = 3;
    run.floor = generateFloor(run, 3);
    run.player.maxHp = run.player.hp = 999;
    const s = learnSkill(run, id)!;
    if (rune) s.runes = [rune];
    run.slots = [run.skills[0].uid, run.skills[1].uid, null, null];
    const c = startCombat(run, 'a3-hunters', { anomaly: null });
    const h = c.alive.find((e) => e.def === 'elder-hunter')!;
    expect(seizeSkill(c, h)).toBe(true);
    const lockedUid = run.slots[h.mem.specimen - 1]!;
    const otherUid = run.slots.find((x) => x && x !== lockedUid)!;
    run.slots[2] = s.uid;
    c.s.cd[otherUid] = 3;
    c.s.ap = 9;
    return { c, s, lockedUid, otherUid };
  }

  it('임기응변은 빼앗긴 기술을 풀어 주지 않고, 진짜 대기 중인 기술을 되돌린다', () => {
    const { c, s, lockedUid, otherUid } = seizedFight('x-improvise');
    expect(c.s.cd[lockedUid]).toBe(99);
    expect(c.useSkill(s.uid)).toBeNull();
    expect(c.s.cd[lockedUid]).toBe(99);
    expect(c.blockReason(lockedUid)).not.toBeNull();
    expect(c.s.cd[otherUid]).toBeUndefined();
  });

  it('임기응변: 빼앗긴 기술밖에 대기 중인 것이 없으면 쓸 수 없다', () => {
    const { c, s, otherUid } = seizedFight('x-improvise');
    delete c.s.cd[otherUid];
    expect(c.blockReason(s.uid)).toBe('대기 중인 스킬이 없다');
  });

  it('공명 각인은 빼앗긴 기술(대기 99) 대신 진짜 대기 중인 기술을 줄인다', () => {
    const { c, s, lockedUid, otherUid } = seizedFight('quick-cut', 'x-resonance-rune');
    expect(c.useSkill(s.uid, c.row(0)[0].uid)).toBeNull();
    expect(c.s.cd[lockedUid]).toBe(99);
    expect(c.s.cd[otherUid]).toBe(2);
  });
});

describe('점검: 위력 배율(메아리 50%·절약 75%)', () => {
  /** 같은 판·같은 전투에서 위력만 바꿔 한 번 쓰고, 적에게 준 피해·얻은 방어도·보호막·회복을 잰다 */
  function measure(id: string, power: number) {
    const run = newRun({ seed: 21, origin: 'occultist' });
    run.player.maxHp = 2000;
    run.player.hp = 1000;
    run.player.maxSanity = 2000;
    run.player.sanity = 1000;
    run.player.insight = 4;
    run.player.str = run.player.dex = 0;
    run.skills = [{ uid: 'sk', id, lvl: 0, runes: [] }];
    run.slots = ['sk', null, null, null];
    // 장비·유물의 고정 추가 피해가 섞이지 않게
    run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
    run.relics = [];
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.snapshots = false;
    for (const e of c.alive) {
      e.hp = e.maxHp = 5000;
      Object.assign(e.st, { bleed: 6, poison: 6, burn: 6 });
      e.poise = e.maxPoise = 0;
      e.weak = [];
    }
    c.p.st = { tentacle: 4, barrier: 30 };
    c.p.block = 30;
    c.s.used = 3;
    c.s.ap = 10;
    c.s.ammo = 6;
    c.s.vars.a2cres = 2; // 크레센도: 두 번 쓴 뒤
    const info = c.skillInfo('sk')!;
    const u = c.makeUse(info, power);
    if (info.def.canUse?.(c, u)) return null;
    const t = c.validTargets(info.def)[0] ?? null;
    u.primary = t;
    const ehp = c.s.enemies.reduce((s, e) => s + e.hp, 0);
    const blk = c.p.block;
    const bar = c.p.st.barrier ?? 0;
    const hp = c.p.hp;
    info.def.run(c, u, t);
    return {
      dmg: ehp - c.s.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0),
      blk: c.p.block - blk,
      bar: (c.p.st.barrier ?? 0) - bar,
      heal: c.p.hp - hp,
    };
  }

  it('모든 스킬: 위력 50%로 쓰면 피해·방어도·보호막·회복도 절반 남짓 (추가 피해·보호막까지)', () => {
    // 기본기는 각인을 새길 수 없고 메아리도 울리지 않는다. 방벽 세우기는 지금 방어도를 보호막으로 '바꾸는' 기술
    const skip = new Set(['x-fortify']);
    for (const def of SKILLS.values()) {
      if (def.tags.includes('basic') || skip.has(def.id)) continue;
      const a = measure(def.id, 1);
      const b = measure(def.id, 0.5);
      if (!a || !b) continue;
      for (const k of ['dmg', 'blk', 'bar', 'heal'] as const) {
        if (a[k] < 6) continue;
        expect(b[k], `${def.id} ${k}: 위력 1 → ${a[k]}, 위력 0.5 → ${b[k]}`).toBeLessThanOrEqual(Math.ceil(a[k] * 0.5) + 2);
      }
    }
  });

  it('크레센도: 메아리 각인을 새겨도 한 번 쓸 때 한 번만 커진다', () => {
    const run = sturdy(3);
    run.player.level = 20;
    absorbEssence(run, { id: 'choirmaster', color: 0, guardian: true });
    const s = run.skills.find((x) => x.id === 'ess-choirmaster-crescendo')!;
    s.runes = ['echo'];
    if (!run.slots.includes(s.uid)) run.slots[0] = s.uid;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    for (const e of c.alive) e.hp = e.maxHp = 999;
    c.s.ap = 9;
    expect(c.useSkill(s.uid)).toBeNull();
    expect(c.s.vars.a2cres).toBe(1);
  });
});

describe('점검: 여러 번 타격하는 스킬 (시궁쥐 떼 무리 근성)', () => {
  const bonus = (id: string) => {
    const withRats = sturdy(4);
    absorbEssence(withRats, { id: 'rats', color: 0 });
    const a = startCombat(withRats, 'a1-cult', { anomaly: null });
    const b = startCombat(sturdy(4), 'a1-cult', { anomaly: null });
    // 버팀 배율(절반)에 1이 버려지지 않게 버팀 없는 적으로 잰다
    for (const x of [a, b]) for (const e of x.alive) e.maxPoise = e.poise = 0;
    const def = SKILLS.get(id)!;
    const owned = { uid: 'x', id, lvl: 0, runes: [] };
    a.p.st = {};
    b.p.st = {};
    return a.preview(a.p, a.alive[0], 10, def.type ?? 'blunt', { skill: a.makeUse({ def, owned }) }) - b.preview(b.p, b.alive[0], 10, def.type ?? 'blunt', { skill: b.makeUse({ def, owned }) });
  };

  it('리볼버 사격은 한 번 쏘는 공격이라 붙지 않는다', () => {
    expect(bonus('w-revolver')).toBe(0);
  });

  it('마지막 탄창은 탄약 수만큼 여러 번 쏘므로 붙는다', () => {
    expect(bonus('last-bullet')).toBe(1);
  });
});

describe('점검: 균열 수호자 정수', () => {
  it('균열 마지막 방의 수호자를 쓰러뜨리면 수호자 정수가 반드시 떨어진다', () => {
    for (const enc of ENCOUNTERS.filter((e) => e.id.startsWith('rift-'))) {
      for (let seed = 1; seed <= 6; seed++) {
        const run = sturdy(seed);
        run.act = enc.act;
        run.floor = generateFloor(run, enc.act);
        run.rift = { room: 0, stage: 2, rule: 'rule-revive', encs: ['x', 'y', enc.id] };
        const c = startCombat(run, enc.id, { anomaly: null });
        for (let i = 0; i < 5 && c.alive.length; i++) for (const e of [...c.alive]) c.kill(e);
        c.endTurn(); // 남은 적이 없으면 승리로 끝난다
        expect(c.s.phase).toBe('victory');
        const rw = finishCombat(run)!;
        const es = rw.items.filter((i) => i.kind === 'essence');
        expect(es.length, `${enc.id} seed ${seed}`).toBeGreaterThan(0);
        expect(es.every((i) => i.guardian)).toBe(true);
      }
    }
  });
});

describe('점검: 이벤트', () => {
  it('체스 두는 자: 강화할 스킬이 없으면 대국을 받을 수 없다 (이겨도 얻을 것이 없다)', () => {
    const run = sturdy(5);
    run.act = 2;
    run.floor = generateFloor(run, 2);
    for (const s of run.skills) s.lvl = 9;
    startEvent(run, 'x-chess-player');
    expect(eventView(run)!.choices[0].disabled).toBeTruthy();
    for (const s of run.skills) s.lvl = 0;
    expect(eventView(run)!.choices[0].disabled).toBeFalsy();
  });

  it('판을 엎어 벌어지는 싸움은 그 층의 보통 조우에서 고른다 (특정 이벤트 전용 조우 제외)', () => {
    const eventOnly = new Set(ENCOUNTERS.filter((e) => e.weight === 0).map((e) => e.id));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const run = sturdy(seed);
      run.act = 3;
      run.floor = generateFloor(run, 3);
      startEvent(run, 'x-chess-player');
      const i = eventView(run)!.choices.findIndex((ch) => ch.label === '판을 엎는다');
      expect(chooseEvent(run, i)).toBeNull();
      const fight = run.event!.fight!;
      seen.add(fight);
      expect(eventOnly.has(fight), fight).toBe(false);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('점검: 사경(체력 0)에서도 싸움은 계속된다', () => {
  function dyingFight() {
    const run = sturdy(12);
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    for (const e of c.alive) e.hp = e.maxHp = 999;
    c.damage({ src: c.alive[0], tgt: c.p, base: 5000, type: 'true', ignoreBlock: true });
    expect(c.dying).toBe(true);
    return c;
  }

  it('사경 중에도 버프를 걸 수 있다 (보호막·반격 등이 헛돌지 않는다)', () => {
    const c = dyingFight();
    expect(c.apply(c.p, 'barrier', 5, c.p)).toBe(5);
    expect(c.p.st.barrier).toBe(5);
  });

  it('반격·격앙처럼 턴이 지나면 사라지는 효과가 사경 중에도 사라진다', () => {
    const c = dyingFight();
    // 쓰러지기 직전에 걸어 둔 반격·격앙
    c.p.st.counter = 4;
    c.p.st.frenzy = 50;
    for (const e of c.alive) e.st.stun = 9;
    c.endTurn();
    expect(c.p.st.counter ?? 0).toBe(0);
    expect(c.p.st.frenzy ?? 0).toBe(0);
  });

  it('재생으로 회복하면 사경에서 벗어난다', () => {
    const c = dyingFight();
    c.apply(c.p, 'regen', 5, c.p);
    for (const e of c.alive) e.st.stun = 9;
    c.endTurn();
    expect(c.dying).toBe(false);
    expect(c.p.hp).toBeGreaterThan(0);
  });

  it('사경 중에 맞으면 체력은 더 줄지 않으므로 "체력을 잃으면" 효과(고통의 환희)는 터지지 않는다', () => {
    const c = dyingFight();
    c.run.madness.push('x-ecstasy');
    const s = c.p.sanity;
    const d = c.damage({ src: c.alive[0], tgt: c.p, base: 4, type: 'blunt', attack: true });
    expect(d.hpLoss).toBe(0);
    expect(c.p.sanity).toBe(s - 2); // 받은 피해의 절반만큼 정신력만
  });
});

describe('점검: 처치 판정', () => {
  it('사냥 각인: 다시 일어서는 적(망자의 귀환)을 쓰러뜨린 첫 타격에는 행동력을 주지 않는다', () => {
    const run = sturdy(13);
    run.player.str = 0;
    const s = learnSkill(run, 'quick-cut')!;
    s.runes = ['x-hunt-rune'];
    run.slots[0] = s.uid;
    const c = startCombat(run, 'a1-cult', { anomaly: 'rule-revive' });
    const t = c.row(0)[0];
    t.hp = 1;
    t.block = 0;
    c.s.ap = 5;
    expect(c.useSkill(s.uid, t.uid)).toBeNull();
    expect(t.dead).toBe(false); // 다시 일어섰다
    expect(c.s.ap).toBe(4);
    // 마지막으로 쓰러뜨리면 그때 행동력 +1
    t.hp = 1;
    t.block = 0;
    delete c.s.cd[s.uid];
    expect(c.useSkill(s.uid, t.uid)).toBeNull();
    expect(t.dead).toBe(true);
    expect(c.s.ap).toBe(4);
  });

  it('급소 사격: 버팀을 0으로 만든 그 공격에 쓰러졌으면 붕괴 보상(조준·탄약)이 없다', () => {
    const run = sturdy(14);
    const s = learnSkill(run, 'x-weakpoint')!;
    run.slots[0] = s.uid;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    const t = c.row(0)[0];
    t.hp = 1;
    t.block = 0;
    t.poise = 1;
    c.p.st = {};
    c.s.ammo = 3;
    expect(c.useSkill(s.uid, t.uid)).toBeNull();
    expect(t.dead).toBe(true);
    expect(c.p.st.aim ?? 0).toBe(0);
    expect(c.s.ammo).toBe(2);
    // 살아남아 붕괴하면 보상
    const run2 = sturdy(14);
    const s2 = learnSkill(run2, 'x-weakpoint')!;
    run2.slots[0] = s2.uid;
    const c2 = startCombat(run2, 'a1-cult', { anomaly: null });
    const t2 = c2.row(0)[0];
    t2.hp = t2.maxHp = 999;
    t2.poise = 1;
    c2.p.st = {};
    c2.s.ammo = 3;
    expect(c2.useSkill(s2.uid, t2.uid)).toBeNull();
    expect(t2.broken).toBe(2);
    expect(c2.p.st.aim).toBe(1);
    expect(c2.s.ammo).toBe(4);
  });

  it('공포를 거는 공격: 공격하다 반격에 쓰러진 적은 정신 공격까지 이어 가지 못한다', () => {
    const run = sturdy(15);
    const c = startCombat(run, 'a1-enforcer', { anomaly: null });
    const e = c.alive.find((x) => x.def === 'enforcer')!;
    e.hp = 1;
    e.block = 0;
    c.p.st.counter = 50;
    const s = c.p.sanity;
    c.moveDef(e, 'zeal').run(c, e);
    expect(e.dead).toBe(true);
    expect(c.p.sanity).toBe(s);
  });
});
