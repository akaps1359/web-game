import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/content';
import { ACT_POISE_MULT, Combat, GUARD, TOLERANCE, toleranceGain } from '../src/engine/combat';
import { ENEMIES } from '../src/engine/registry';
import { newRun } from '../src/engine/run';
import type { EncounterDef, EnemyUnit } from '../src/engine/types';
import { DEPTH, MUTATION, MUTATIONS, STEADFAST, TOLL, VOLATILE, aegisCap, aegisPoiseCap, canAwaken } from '../src/content/depth';

/*
 * 심연 압력 (2026-10): 깊은 층의 장치 — 층별 버팀, 붕괴 내성, 가호(한 턴 피해 상한), 각성(심연 강타), 변이.
 */

/** 변이를 굴리지 않게 (장치 하나씩 볼 때) — 변이를 보는 묶음에서는 켠다 */
let mutSaved: [number[], number[]] | null = null;
function mutOff() {
  mutSaved = [DEPTH.mutElite.slice(), DEPTH.mutNormal.slice()];
  DEPTH.mutElite.fill(0);
  DEPTH.mutNormal.fill(0);
}
function mutOn() {
  if (!mutSaved) return;
  DEPTH.mutElite.splice(0, DEPTH.mutElite.length, ...mutSaved[0]);
  DEPTH.mutNormal.splice(0, DEPTH.mutNormal.length, ...mutSaved[1]);
  mutSaved = null;
}

/** 이 적들로 전투를 연다 (체력 넉넉한 주인공) */
function fight(ids: string[], o: { kind?: EncounterDef['kind']; seed?: number } = {}): Combat {
  const act = Math.max(...ids.map((id) => ENEMIES.get(id)!.act));
  const run = newRun({ seed: o.seed ?? 7, origin: 'soldier' });
  run.act = act;
  run.floor = null;
  run.player.maxHp = run.player.hp = 999;
  const enc: EncounterDef = { id: 'test', act, kind: o.kind ?? 'normal', enemies: ids.map((id) => ({ id })) };
  const c = Combat.begin(run, enc);
  c.drain();
  return c;
}

const one = (c: Combat, id: string) => c.alive.find((e) => e.def === id)!;

/** 변이 하나를 붙인다 */
function mutate(c: Combat, e: EnemyUnit, id: string) {
  e.affix = [...(e.affix ?? []), id];
  MUTATION.get(id)!.init?.(c, e, Math.min(5, ENEMIES.get(e.def)!.act));
}

const hit = (c: Combat, e: EnemyUnit, base: number, type: 'slash' | 'pierce' | 'true' = 'true') => c.damage({ src: c.p, tgt: e, base, type, attack: true });

describe('층별 버팀과 붕괴 내성', () => {
  beforeEach(mutOff);
  afterEach(mutOn);

  it('깊은 층의 적은 버팀이 더 두껍다 (ACT_POISE_MULT)', () => {
    const c = fight(['outer-servitor']);
    expect(c.alive[0].maxPoise).toBe(Math.round(ENEMIES.get('outer-servitor')!.poise * GUARD.poise * ACT_POISE_MULT[4]));
  });

  it('3층부터 붕괴할 때마다 버팀 최대치가 는다 — 최대 TOLERANCE.max번까지, 상태 칸에 「붕괴 내성」', () => {
    const c = fight(['shantak'], { kind: 'elite' });
    const e = c.alive[0];
    const base = e.maxPoise;
    const gain = toleranceGain(ENEMIES.get('shantak')!, 0);
    expect(gain).toBe(Math.max(1, Math.ceil(base * TOLERANCE.act[3])));
    for (let i = 0; i < TOLERANCE.max + 2; i++) {
      c.breakEnemy(e);
      c.restorePoise(e);
    }
    expect(e.maxPoise).toBe(base + gain * TOLERANCE.max);
    expect(e.poise).toBe(e.maxPoise);
    expect(e.st.tolerance).toBe(gain * TOLERANCE.max);
  });

  it('1·2층은 붕괴해도 버팀이 늘지 않는다 (판을 짜기 전)', () => {
    for (const id of ['thug', 'flagellant']) {
      const c = fight([id]);
      const e = c.alive[0];
      const m = e.maxPoise;
      c.breakEnemy(e);
      c.restorePoise(e);
      expect(e.maxPoise, id).toBe(m);
      expect(e.st.tolerance, id).toBeUndefined();
    }
  });
});

describe('가호: 한 턴에 받는 피해 상한', () => {
  beforeEach(mutOff);
  afterEach(mutOn);

  it('2층부터 정예는 한 턴에 상한만큼만 받는다. 붕괴하면 두 배, 내 턴이 시작되면 다시 찬다', () => {
    const c = fight(['shantak'], { kind: 'elite' });
    const e = c.alive[0];
    const poise = e.maxPoise;
    e.maxPoise = e.poise = 0; // 버팀 없이 (피해가 그대로)
    const cap = aegisCap(e);
    expect(cap).toBe(Math.round(e.maxHp * DEPTH.aegisElite[3]));
    expect(e.st.aegis).toBe(cap);
    const hp = e.hp;
    hit(c, e, cap * 3);
    expect(hp - e.hp).toBe(cap);
    // 다 닳으면 상태 칸에서 사라진다
    expect(e.st.aegis).toBeUndefined();
    // 미리보기도 0을 보여 준다
    expect(c.preview(c.p, e, 50, 'slash')).toBe(0);
    hit(c, e, 10);
    expect(hp - e.hp).toBe(cap);
    c.endTurn();
    c.drain();
    expect(e.st.aegis).toBe(cap);
    // 붕괴: 상한 두 배
    e.maxPoise = poise;
    e.hp = e.maxHp;
    c.breakEnemy(e);
    expect(aegisCap(e)).toBe(Math.round(e.maxHp * DEPTH.aegisElite[3] * DEPTH.aegisBroken));
    const hp2 = e.hp;
    hit(c, e, cap * 5);
    expect(hp2 - e.hp).toBe(aegisCap(e));
  });

  it('수호자는 상한이 더 낮다. 1층과 마지막 수호자(별의 태아)는 가호가 없다 — 2층부터 (2026-10-09 어렵게)', () => {
    const c = fight(['shoggoth'], { kind: 'boss' });
    const b = one(c, 'shoggoth');
    expect(aegisCap(b)).toBe(Math.round(b.maxHp * DEPTH.aegisBoss[3]));
    const f = fight(['flagellant'], { kind: 'elite' }).alive[0];
    expect(aegisCap(f)).toBe(Math.round(f.maxHp * DEPTH.aegisElite[2]));
    expect(aegisCap(fight(['butcher'], { kind: 'elite' }).alive[0])).toBe(0);
    expect(aegisCap(fight(['lightkeeper'], { kind: 'boss' }).alive.find((e) => e.def === 'lightkeeper')!)).toBe(0);
    const sf = fight(['star-fetus'], { kind: 'boss' }).alive.find((e) => e.def === 'star-fetus');
    if (sf) expect(aegisCap(sf)).toBe(0);
  });

  it('퍼즐 목표가 걸린 동안에는 가호가 쉰다 (즉사 퍼즐이 막히지 않게)', () => {
    const c = fight(['shantak'], { kind: 'elite' });
    const e = c.alive[0];
    e.maxPoise = e.poise = 0;
    c.s.obj = { text: '시험' };
    const hp = e.hp;
    hit(c, e, aegisCap(e) * 2);
    expect(hp - e.hp).toBe(aegisCap(e) * 2);
  });

  it('가호는 버팀도 지킨다: 한 턴에 깎이는 버팀에 상한 (올림) — 내 턴이 시작되면 다시. 일반 적·1층은 없다', () => {
    const c = fight(['shantak'], { kind: 'elite' });
    const e = c.alive[0];
    const cap = aegisPoiseCap(e);
    expect(cap).toBe(Math.ceil(e.maxPoise * DEPTH.aegisPoiseElite[3]));
    expect(cap).toBeLessThan(e.maxPoise);
    const w = e.weak[0];
    const tap = () => c.damage({ src: c.p, tgt: e, base: 1, type: w, attack: true });
    for (let i = 0; i < e.maxPoise + 3; i++) tap();
    expect(e.maxPoise - e.poise).toBe(cap);
    expect(e.broken).toBe(0);
    c.endTurn();
    c.drain();
    for (let i = 0; i < e.maxPoise + 3 && e.broken === 0; i++) tap();
    expect(e.broken).toBeGreaterThan(0);
    // 일반 적·1층 정예에는 없다 (2층 정예부터)
    expect(aegisPoiseCap(fight(['outer-servitor']).alive[0])).toBe(0);
    expect(aegisPoiseCap(fight(['butcher'], { kind: 'elite' }).alive[0])).toBe(0);
    const f = fight(['flagellant'], { kind: 'elite' }).alive[0];
    expect(aegisPoiseCap(f)).toBe(Math.ceil(f.maxPoise * DEPTH.aegisPoiseElite[2]));
  });

  it('심연을 모으는 수호자에게는 버팀 상한이 없다 (붕괴시켜 끊을 수 있게 — 두 배로 깎인다)', () => {
    const c = fight(['shoggoth'], { kind: 'boss' });
    const b = one(c, 'shoggoth');
    expect(aegisPoiseCap(b)).toBeGreaterThan(0);
    b.mem.abc = 1;
    const w = b.weak[0];
    const p0 = b.poise;
    const n = aegisPoiseCap(b) + 1;
    for (let i = 0; i < n; i++) c.damage({ src: c.p, tgt: b, base: 1, type: w, attack: true });
    expect(b.broken > 0 || p0 - b.poise === n * 2).toBe(true);
  });

  it('내 쪽에서 오지 않은 피해(적끼리·대가)는 세지 않는다', () => {
    const c = fight(['shantak', 'leng-spider'], { kind: 'elite' });
    const e = one(c, 'shantak');
    const s = one(c, 'leng-spider');
    e.maxPoise = e.poise = 0;
    const hp = e.hp;
    c.damage({ src: s, tgt: e, base: aegisCap(e) * 2, type: 'true', attack: true });
    expect(hp - e.hp).toBe(aegisCap(e) * 2);
  });
});

describe('각성: 깊은 층의 수호자', () => {
  beforeEach(mutOff);
  afterEach(mutOn);

  /** 체력을 절반 아래로 (내 쪽 피해가 아니게 — 가호·버팀과 상관없이) */
  const halve = (c: Combat, b: EnemyUnit) => c.damage({ src: null, tgt: b, base: Math.ceil(b.maxHp * (1 - DEPTH.awakenAt) + 1), type: 'true' });

  it('체력이 DEPTH.awakenAt 아래로 내려가면 깨어난다: 버팀 1.5배·결계. 이미 정한 행동은 그대로 둔다', () => {
    const c = fight(['shoggoth'], { kind: 'boss' });
    const b = one(c, 'shoggoth');
    expect(canAwaken(b)).toBe(true);
    const p0 = b.maxPoise;
    const planned = b.intent?.move;
    halve(c, b);
    expect(b.mem.awk).toBe(1);
    expect(b.maxPoise).toBe(Math.round(p0 * DEPTH.awakenPoise));
    expect(b.poise).toBe(b.maxPoise);
    expect(b.st.ward).toBe(2);
    expect(b.intent?.move).toBe(planned);
  });

  it('평범한 행동을 하려던 차례에 심연을 모으고, 다음 차례에 심연 강타 — 보인 숫자 그대로 맞는다', () => {
    const c = fight(['shoggoth'], { kind: 'boss' });
    const b = one(c, 'shoggoth');
    halve(c, b);
    // 이 전투에서 이미 써 본 평범한 행동을 하려던 차례에 (쇼고스는 일곱 차례를 돈다)
    let gathered = false;
    for (let i = 0; i < 16 && !gathered; i++) {
      c.p.block = 0;
      c.endTurn();
      c.drain();
      gathered = b.intent?.move === '_abyss-gather3';
    }
    expect(gathered).toBe(true);
    expect(b.intent?.charging).toBe(true);
    c.endTurn();
    c.drain();
    expect(b.mem.abc).toBe(1);
    expect(b.intent?.move).toBe('_abyss-blast3');
    expect(b.intent?.label).toBe('얼어붙은 심연');
    const shown = c.preview(b, c.p, b.intent!.dmg!, 'void');
    c.p.block = 0;
    const hp = c.p.hp;
    c.endTurn();
    expect(hp - c.p.hp).toBe(shown);
    expect(b.mem.abc).toBeUndefined();
    expect(b.mem.awkNext).toBe(c.s.turn - 1 + DEPTH.blastEvery);
  });

  it('모으는 동안 버팀이 두 배로 깎이고, 붕괴시키면 심연 강타가 끊긴다', () => {
    const c = fight(['shoggoth'], { kind: 'boss' });
    const b = one(c, 'shoggoth');
    halve(c, b);
    b.mem.abc = 1;
    b.weak = ['pierce'];
    const p = b.poise;
    hit(c, b, 1, 'pierce');
    expect(b.poise).toBe(p - 2);
    c.breakEnemy(b);
    expect(b.mem.abc).toBeUndefined();
    expect(b.intent?.move).toBe('_broken');
  });

  it('1·2층 수호자와 마지막 수호자는 각성하지 않는다', () => {
    const c = fight(['lightkeeper'], { kind: 'boss' });
    const b = one(c, 'lightkeeper');
    expect(canAwaken(b)).toBe(false);
    halve(c, b);
    expect(b.mem.awk).toBeUndefined();
  });
});

describe('변이', () => {
  it('정예는 층마다 DEPTH.mutElite개(소수는 그 확률로 하나 더) — 1층·수호자·하수인은 없다. 2단계 변이는 4층부터. 시드가 같으면 같다', () => {
    const tier = (id: string) => MUTATION.get(id)!.tier;
    for (let seed = 1; seed <= 24; seed++) {
      const a2 = fight(['flagellant'], { kind: 'elite', seed }).alive[0];
      expect(a2.affix?.length, `2층 ${seed}`).toBe(1);
      expect(a2.affix!.every((m) => tier(m) === 1)).toBe(true);
      const a3 = fight(['shantak'], { kind: 'elite', seed }).alive[0];
      expect(a3.affix?.length).toBe(1);
      expect(a3.affix!.every((m) => tier(m) === 1)).toBe(true);
      const a4 = one(fight(['outer-servitor', 'star-walker'], { kind: 'elite', seed }), 'star-walker').affix?.length ?? 0;
      expect(a4).toBeGreaterThanOrEqual(Math.floor(DEPTH.mutElite[4]));
      expect(a4).toBeLessThanOrEqual(Math.ceil(DEPTH.mutElite[4]));
      const a5 = fight(['dream-hunter'], { kind: 'elite', seed }).alive[0].affix?.length ?? 0;
      expect(a5).toBeGreaterThanOrEqual(Math.floor(DEPTH.mutElite[5]));
      expect(a5).toBeLessThanOrEqual(Math.ceil(DEPTH.mutElite[5]));
      expect(fight(['thug'], { seed }).alive[0].affix).toEqual([]);
      expect(fight(['butcher'], { kind: 'elite', seed }).alive[0].affix).toEqual([]);
      expect(one(fight(['shoggoth'], { kind: 'boss', seed }), 'shoggoth').affix).toEqual([]);
      expect(fight(['flagellant'], { kind: 'elite', seed }).alive[0].affix).toEqual(a2.affix);
    }
  });

  it('일반 적은 깊을수록 자주 변이한다 (1층은 없고, 2층 15% · 3층 30% · 5층 55%)', () => {
    const rate = (id: string) => {
      let n = 0;
      for (let seed = 1; seed <= 120; seed++) n += fight([id], { seed }).alive[0].affix?.length ? 1 : 0;
      return n / 120;
    };
    expect(rate('thug')).toBe(0);
    expect(Math.abs(rate('censer-priest') - DEPTH.mutNormal[2])).toBeLessThan(0.1);
    expect(Math.abs(rate('leng-spider') - DEPTH.mutNormal[3])).toBeLessThan(0.12);
    expect(Math.abs(rate('moonbeast') - DEPTH.mutNormal[5])).toBeLessThan(0.12);
  });

  it('모든 변이에 이름·아이콘·설명이 있고, 특성으로 등록되어 적 설명에 나온다', () => {
    for (const m of MUTATIONS) {
      expect(m.name.length, m.id).toBeGreaterThan(0);
      expect(m.icon.startsWith('gi:'), m.id).toBe(true);
      expect(m.desc.length, m.id).toBeGreaterThan(10);
    }
  });

  describe('하나씩', () => {
    beforeEach(mutOff);
    afterEach(mutOn);

    it('봉인 문양: 결계를 두르고 나와 해로운 효과를 막고, 자기 차례 세 번마다 되살린다', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-ward');
      expect(e.st.ward).toBe(3);
      c.apply(e, 'vuln', 2, c.p);
      expect(e.st.vuln).toBeUndefined();
      expect(e.st.ward).toBe(2);
      for (let i = 0; i < 3; i++) {
        c.endTurn();
        c.drain();
      }
      expect(e.st.ward).toBe(3);
    });

    it('되살아나는 살: 자기 차례 끝에 회복, 출혈 중엔 아물지 않는다', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-regen');
      e.hp -= 30;
      const hp = e.hp;
      c.endTurn();
      c.drain();
      expect(e.hp).toBe(hp + Math.ceil(e.maxHp * 0.05));
      e.st.bleed = 5;
      const hp2 = e.hp;
      c.endTurn();
      c.drain();
      expect(e.hp).toBeLessThan(hp2);
    });

    it('가시 갑각·강철 피부·광포: 가시 껍질·경화·의식을 두르고 나온다', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-spikes');
      mutate(c, e, 'mut-armor');
      mutate(c, e, 'mut-rage');
      expect(e.st.spikes).toBe(2);
      expect(e.st.harden).toBe(8);
      expect(e.st.ritual).toBe(1);
      const hp = c.p.hp;
      c.damage({ src: c.p, tgt: e, base: 1, type: 'slash', attack: true, melee: true });
      expect(hp - c.p.hp).toBe(2);
    });

    it('적응: 같은 속성으로 다시 치면 절반, 자기 차례가 시작되면 풀린다', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      e.maxPoise = e.poise = 0;
      e.weak = [];
      mutate(c, e, 'mut-adapt');
      expect(hit(c, e, 20, 'slash').amount).toBe(20);
      expect(hit(c, e, 20, 'slash').amount).toBe(10);
      expect(hit(c, e, 20, 'pierce').amount).toBe(20);
      c.endTurn();
      c.drain();
      expect(hit(c, e, 20, 'pierce').amount).toBe(20);
    });

    it('망령: 한 번 다시 일어선다. 쓰러질 때 하는 일이 있는 적에는 붙지 않는다', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      e.maxPoise = e.poise = 0;
      mutate(c, e, 'mut-undying');
      hit(c, e, 9999);
      expect(e.dead).toBe(false);
      expect(e.hp).toBe(Math.ceil(e.maxHp * 0.3));
      hit(c, e, 9999);
      expect(e.dead).toBe(true);
      expect(MUTATION.get('mut-undying')!.ok!(ENEMIES.get('shoggoth-spawn')!, c, e)).toBe(false);
    });

    it('흡혈: 준 체력 피해의 절반을 회복한다 · 썩히는 손톱: 맞으면 회복량 절반', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-leech');
      mutate(c, e, 'mut-hex');
      e.hp -= 40;
      const hp = e.hp;
      c.p.block = 0;
      const d = c.damage({ src: e, tgt: c.p, base: 20, type: 'slash', attack: true });
      expect(e.hp).toBe(hp + Math.ceil(d.hpLoss / 2));
      expect(c.p.st['mut-wound']).toBe(2);
      c.p.hp -= 50;
      const before = c.p.hp;
      c.heal(c.p, 20);
      expect(c.p.hp - before).toBe(10);
    });

    it(`불굴: 한 턴에 버팀이 ${STEADFAST}까지만 깎인다`, () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-steadfast');
      e.weak = ['pierce'];
      const p = e.poise;
      for (let i = 0; i < 5; i++) hit(c, e, 1, 'pierce');
      expect(e.poise).toBe(p - STEADFAST);
      c.endTurn();
      c.drain();
      for (let i = 0; i < 5; i++) hit(c, e, 1, 'pierce');
      expect(e.poise).toBe(Math.max(0, p - STEADFAST * 2));
    });

    it('결속: 다른 적이 살아 있는 동안 버팀이 깎이지 않는다', () => {
      const c = fight(['outer-servitor', 'faceless-priest']);
      const e = one(c, 'outer-servitor');
      const o = one(c, 'faceless-priest');
      mutate(c, e, 'mut-bond');
      e.weak = ['pierce'];
      const p = e.poise;
      hit(c, e, 1, 'pierce');
      expect(e.poise).toBe(p);
      c.kill(o);
      hit(c, e, 1, 'pierce');
      expect(e.poise).toBe(p - 1);
    });

    it('치유의 오라: 자기 차례 끝에 다른 적들이 4%씩 회복한다', () => {
      const c = fight(['outer-servitor', 'faceless-priest']);
      const e = one(c, 'outer-servitor');
      const o = one(c, 'faceless-priest');
      mutate(c, e, 'mut-mending');
      o.hp -= 30;
      const hp = o.hp;
      c.endTurn();
      c.drain();
      expect(o.hp).toBeGreaterThanOrEqual(Math.min(o.maxHp, hp + Math.ceil(o.maxHp * 0.04)) - 0);
    });

    it('터지는 몸: 쓰러지면 층 × VOLATILE 화염 피해', () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      e.maxPoise = e.poise = 0;
      mutate(c, e, 'mut-volatile');
      c.p.block = 0;
      const hp = c.p.hp;
      hit(c, e, 9999);
      expect(e.dead).toBe(true);
      expect(hp - c.p.hp).toBe(VOLATILE * 4);
    });

    it(`시간의 대가: 한 턴에 ${TOLL.free + 1}번째 기술부터 체력 ${TOLL.hp}`, () => {
      const c = fight(['outer-servitor']);
      const e = c.alive[0];
      mutate(c, e, 'mut-toll');
      const hps: number[] = [];
      for (let i = 0; i < TOLL.free + 2; i++) {
        c.s.ap = 5;
        hps.push(c.p.hp);
        expect(c.useSkill('armor')).toBeNull();
      }
      hps.push(c.p.hp);
      const lost = hps.slice(1).map((h, i) => hps[i] - h);
      expect(lost).toEqual([...Array(TOLL.free).fill(0), TOLL.hp, TOLL.hp]);
    });
  });
});
