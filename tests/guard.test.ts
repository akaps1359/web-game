import { describe, expect, it } from 'vitest';
import '../src/content';
import { BREAK, Combat, GUARD, breakProfile } from '../src/engine/combat';
import { ENEMIES } from '../src/engine/registry';
import { newRun, startCombat } from '../src/engine/run';
import type { EnemyUnit } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';

/*
 * 버팀과 붕괴 (2026-10 붕괴 개편, 붕괴: 스타레일의 강인성 참고).
 * 버팀이 남은 적은 내 쪽에서 오는 피해를 덜 받고, 붕괴하면 등급마다 다르게 무너진다.
 */

/** 깨끗한 주인공으로 전투를 연다. 적은 체력 999, 약점·저항·상태 없음 (버팀은 그대로) */
function arena(enc = 'a1-cult'): Combat {
  const run = newRun({ seed: 2026, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  const c = startCombat(run, enc, { anomaly: null });
  for (const e of c.s.enemies) {
    e.hp = e.maxHp = 999;
    e.block = 0;
    e.weak = [];
    e.resist = {};
    e.st = {};
  }
  c.drain();
  return c;
}

const hitFor = (c: Combat, e: EnemyUnit, base: number, type: 'slash' | 'pierce' | 'true' = 'slash') =>
  c.damage({ src: c.p, tgt: e, base, type, attack: type !== 'true' }).amount;

describe('버팀: 남아 있으면 덜 받는다', () => {
  it('버팀이 남은 적은 내 공격을 GUARD.mult만큼, 버팀이 없는 적은 그대로 받는다', () => {
    const c = arena();
    const [thug, a] = c.alive;
    expect(thug.poise).toBeGreaterThan(0);
    expect(hitFor(c, thug, 20)).toBe(Math.floor(20 * GUARD.mult));
    a.maxPoise = a.poise = 0;
    expect(hitFor(c, a, 20)).toBe(20);
  });

  it('지속 피해(출혈·독·화상)와 가시도 버팀에 깎인다. 작아도 1은 들어간다', () => {
    const c = arena();
    const e = c.alive[0];
    for (const x of c.alive) x.st.stun = 9;
    e.st.poison = 10;
    const hp = e.hp;
    c.endTurn();
    expect(hp - e.hp).toBe(Math.floor(10 * GUARD.mult));
    const d = c.damage({ src: null, tgt: e, base: 1, type: 'true', tags: ['dot', 'bleed'] });
    expect(d.amount).toBe(1);
    c.p.st.thorns = 6;
    const before = e.hp;
    c.damage({ src: e, tgt: c.p, base: 1, type: 'blunt', attack: true, melee: true });
    expect(before - e.hp).toBe(Math.floor(6 * GUARD.mult));
  });

  it('적끼리 주고받는 피해와 스스로 치르는 대가는 버팀과 상관없다', () => {
    const c = arena();
    const [a, b] = c.alive;
    expect(c.damage({ src: a, tgt: b, base: 10, type: 'blunt', attack: true }).amount).toBe(10);
    expect(c.loseHp(a, 7).amount).toBe(7);
  });

  it('미리보기도 버팀을 반영한다 (스킬 카드의 숫자)', () => {
    const c = arena();
    const e = c.alive[0];
    expect(c.preview(c.p, e, 20, 'slash')).toBe(Math.floor(20 * GUARD.mult));
    expect(c.preview(c.p, null, 20, 'slash')).toBe(20);
  });
});

describe('버팀: 깎는 법', () => {
  it('약점으로 맞히면 타격마다 -1', () => {
    const c = arena();
    const e = c.alive[0];
    e.weak = ['pierce'];
    e.poise = e.maxPoise = 5;
    hitFor(c, e, 1, 'pierce');
    hitFor(c, e, 1, 'pierce');
    expect(e.poise).toBe(3);
    expect(e.chip ?? 0).toBe(0);
  });

  it(`약점이 아닌 공격도 ${GUARD.chip}번 맞히면 -1 (적에게 쌓인 횟수는 붕괴하면 처음으로)`, () => {
    const c = arena();
    const e = c.alive[0];
    e.poise = e.maxPoise = 2;
    for (let i = 1; i < GUARD.chip; i++) hitFor(c, e, 1);
    expect(e.poise).toBe(2);
    expect(e.chip).toBe(GUARD.chip - 1);
    hitFor(c, e, 1);
    expect(e.poise).toBe(1);
    expect(e.chip).toBe(0);
    for (let i = 0; i < GUARD.chip; i++) hitFor(c, e, 1);
    expect(e.broken).toBe(2);
    expect(e.chip).toBe(0);
  });

  it('적의 공격이나 지속 피해로는 쌓이지 않는다', () => {
    const c = arena();
    const [a, b] = c.alive;
    for (let i = 0; i < GUARD.chip * 2; i++) c.damage({ src: b, tgt: a, base: 1, type: 'slash', attack: true });
    for (let i = 0; i < GUARD.chip * 2; i++) c.damage({ src: null, tgt: a, base: 1, type: 'true', tags: ['dot', 'bleed'] });
    expect(a.chip ?? 0).toBe(0);
    expect(a.poise).toBe(a.maxPoise);
  });
});

describe('붕괴: 등급마다 다르게 무너진다', () => {
  it('일반 적은 BREAK.normal.stun번 차례를 쉬고, 버팀이 돌아올 때까지 받는 피해가 늘어난다', () => {
    const c = arena('a1-thug');
    const e = c.alive[0];
    const b = breakProfile(ENEMIES.get(e.def)!);
    expect(b).toEqual(BREAK.normal);
    c.breakEnemy(e);
    expect(e.intent?.move).toBe('_broken');
    expect(hitFor(c, e, 20)).toBe(Math.floor(20 * b.vuln));
    let skipped = 0;
    for (let turn = 0; turn < b.stun + 2; turn++) {
      c.drain();
      c.endTurn();
      if (!c.drain().some((ev) => ev.t === 'move' && ev.uid === e.uid)) skipped++;
      if (e.broken === 0) break;
    }
    expect(skipped).toBe(b.stun);
    expect(e.poise).toBe(e.maxPoise);
    expect(hitFor(c, e, 20)).toBe(Math.floor(20 * GUARD.mult));
  });

  it('남은 쉬는 차례는 화면 스냅숏에 보인다 (붕괴 2 → 1)', () => {
    const c = arena('a1-thug');
    const e = c.alive[0];
    c.breakEnemy(e);
    const s0 = c.snap().e.find((x) => x.uid === e.uid)!;
    expect(s0.stun).toBe(BREAK.normal.stun);
    c.endTurn();
    const s1 = c.snap().e.find((x) => x.uid === e.uid)!;
    expect(s1.stun).toBe(Math.max(0, BREAK.normal.stun - 1));
  });

  it('수호자는 하던 행동 하나만 끊기는 대신 받는 피해가 더 크다', () => {
    expect(BREAK.boss.stun).toBeLessThanOrEqual(BREAK.normal.stun);
    expect(BREAK.boss.vuln).toBeGreaterThan(BREAK.normal.vuln);
    const c = arena('a1-boss-queen');
    const q = c.alive.find((x) => x.def === 'queen')!;
    c.breakEnemy(q);
    expect(hitFor(c, q, 20)).toBe(Math.floor(20 * BREAK.boss.vuln));
  });

  it('적마다 바꿀 수 있다 (EnemyDef.brk)', () => {
    expect(breakProfile({ tier: 'normal', brk: { stun: 3 } })).toEqual({ stun: 3, vuln: BREAK.normal.vuln });
    expect(breakProfile({ tier: 'boss', brk: { vuln: 3 } })).toEqual({ stun: BREAK.boss.stun, vuln: 3 });
    // 붕괴는 적어도 하던 행동 하나는 끊는다
    expect(breakProfile({ tier: 'boss', brk: { stun: 0 } }).stun).toBe(1);
  });
});

describe('퍼즐 목표는 버팀에 깎이기 전 피해로 센다', () => {
  it('집행자의 판결: 버팀이 남은 집행자에게도 피해 15를 채우면 무죄', () => {
    const run = newRun({ seed: 3, origin: 'soldier' });
    run.player.maxHp = run.player.hp = 999;
    const c = startCombat(run, 'a1-enforcer', { anomaly: null });
    const en = c.alive.find((x) => x.def === 'enforcer')!;
    c.endTurn();
    // 집행자는 판결로 시작한다 (남은 피해가 내 상태로 붙는다)
    const left = c.p.st['a1-trial'] ?? 0;
    expect(left).toBeGreaterThan(0);
    expect(en.poise).toBeGreaterThan(0);
    c.damage({ src: c.p, tgt: en, base: left, type: 'true', attack: true });
    expect(c.p.st['a1-trial'] ?? 0).toBe(0);
  });
});

describe('붕괴 개편 뒤에도 봇이 시작 덱으로 1층 일반 전투를 이긴다', () => {
  it('출신마다 깡패·입문자 무리를 쓰러뜨린다', () => {
    for (const origin of ['soldier', 'hunter', 'occultist']) {
      const run = newRun({ seed: 41, origin });
      const c = startCombat(run, 'a1-cult', { anomaly: null });
      let n = 0;
      while (!c.over && n++ < 60) autoTurn(c);
      expect(c.s.phase, origin).toBe('victory');
    }
  });
});
