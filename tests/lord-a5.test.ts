import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ENEMIES } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import type { EnemyUnit, MoveDef } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import {
  DOUBLE,
  DOUBLE_BACKLASH,
  DOUBLE_CAP,
  DOUBLE_CLAW,
  DOUBLE_HITS,
  DOUBLE_HP_MAX,
  DOUBLE_HP_PCT,
  DOUBLE_REFORM,
  EATER_HP,
  EATER_MAW,
  EATER_NIGHTFALL,
  EATER_RAVAGE,
  EATER_RAVAGE_HITS,
  GNAWED,
  HUNGER,
  HUNGER_AP,
  HUNGER_EVERY,
  HUNGER_FIRST,
  HUNGER_HEAL,
  HUNGER_MAX_AP,
  HUNGER_NEED_AP,
  HUNGER_POISE,
  HUNGER_WEAK,
  REFORM,
  hungerNeed,
  mimicHits,
  mimicName,
  mimicPer,
} from '../src/content/act5/enemies';

/**
 * 계층군주 꿈을 먹는 자 (2026-10 강화): 악몽 속의 나(내 기술을 흉내 내는 하수인)와 굶주림(몇 턴마다 피해를 요구하는 식사 시간).
 * 삼켜진 기억·깨어난 악몽의 연출은 tests/act5-patterns.test.ts
 */

/** 5층에 서 있는 튼튼한 주인공 (퇴역 군인) */
function floor5(o: { seed?: number; origin?: string; hp?: number; str?: number } = {}): RunState {
  const run = newRun({ seed: o.seed ?? 515, origin: o.origin ?? 'soldier' });
  run.act = 5;
  run.floor = generateFloor(run, 5);
  run.player.maxHp = run.player.hp = o.hp ?? 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = o.str ?? 16;
  run.player.maxAp = 4;
  run.player.insight = 0;
  run.light = 100;
  return run;
}

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((e) => e.def === def)!;
const eaterOf = (c: Combat) => find(c, 'dream-eater');
const doubleOf = (c: Combat) => c.alive.find((e) => e.def === DOUBLE);

/** 적의 차례처럼 그 행동을 실행하고 내 차례로 돌아온다 */
function act(c: Combat, e: EnemyUnit, id: string): MoveDef {
  const m = c.moveDef(e, id);
  e.intent = {
    move: id,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
  };
  c.s.phase = 'enemy';
  m.run(c, e);
  c.s.phase = 'player';
  return m;
}

/** 꿈을 먹는 자를 깨어난 악몽으로 (가호·버팀을 걷고 체력 60%를 한 번에 — 기술이 아니라 흉내 기록에 남지 않는다) */
function awaken(c: Combat): EnemyUnit {
  const e = eaterOf(c);
  e.mem.agOff = 1;
  e.poise = 0;
  c.damage({ src: c.p, tgt: e, base: Math.ceil(e.maxHp * 0.6), type: 'true' });
  expect(e.form).toBe(1);
  return e;
}

/** 라운드 끝에 다음 차례를 정하듯 식사 시간을 부른다 (이번 턴이 식사 시간 — 그다음 적의 차례에 판정). 처음 두 턴엔 부르지 않으니 셋째 턴으로 */
function supper(c: Combat, e = eaterOf(c)) {
  if (c.s.turn < 2) c.s.turn = 2;
  c.s.phase = 'enemy';
  e.mem.actT = c.s.turn;
  e.mem.hgAt = c.s.turn + 1;
  c.planIntent(e);
  c.s.phase = 'player';
  expect(e.intent?.move).toBe('eat');
  expect(c.s.obj?.hit?.uid).toBe(e.uid);
}

/** 잠든 몽유병자가 그대로 자게 둔다 (적의 차례에 다른 적이 장면을 흔들지 않게) */
function hush(c: Combat) {
  for (const x of c.alive) if (x.def === 'sleepwalker') x.st.stun = 9;
}

/** 이 적이 공격하면 받는 타격당 피해 (의도 그대로) */
const perHit = (c: Combat, e: EnemyUnit) => c.preview(e, c.p, e.intent!.dmg!, 'blunt');

describe('계층군주 꿈을 먹는 자 — 강화된 기본 수치', () => {
  it('체력·아가리·난도질·악몽 강림이 상수대로 (예고와 강림이 같다)', () => {
    const def = ENEMIES.get('dream-eater')!;
    expect(def.hp).toEqual([EATER_HP, EATER_HP]);
    expect(def.moves.maw.dmg).toBe(EATER_MAW);
    expect(def.moves.ravage.dmg).toBe(EATER_RAVAGE);
    expect(def.moves.ravage.hits).toBe(EATER_RAVAGE_HITS);
    expect(def.moves.conceive.dmg).toBe(EATER_NIGHTFALL);
    expect(def.moves.nightfall.dmg).toBe(EATER_NIGHTFALL);
  });
});

describe('계층군주 꿈을 먹는 자 — 악몽 속의 나', () => {
  it('깨어난 악몽이 되는 순간 악몽 속의 나를 빚는다: 체력은 내 최대 체력의 일부 (상한), 뒷열이어도 근접이 닿는다', () => {
    const c = startCombat(floor5({ hp: 200 }), 'lord-a5');
    expect(doubleOf(c)).toBeUndefined();
    c.drain();
    awaken(c);
    const d = doubleOf(c)!;
    expect(d).toBeTruthy();
    expect(d.maxHp).toBe(Math.round(200 * DOUBLE_HP_PCT));
    expect(d.hp).toBe(d.maxHp);
    expect(d.minion).toBe(true);
    // 앞줄(꿈을 먹는 자·몽유병자 둘)이 차 있어 뒷열에 서도 근접 기술(방패 강타)이 닿는다
    expect(d.row).toBe(1);
    const bash = c.run.slots.find((uid) => c.run.skills.find((s) => s.uid === uid)?.id === 'shield-bash')!;
    expect(c.skillInfo(bash)!.def.range).toBe('melee');
    expect(c.validTargets(c.skillInfo(bash)!.def).map((x) => x.uid)).toContain(d.uid);
    expect(c.drain().some((x) => x.t === 'cine' && x.name === 'flip')).toBe(true);
    // 하나뿐 (다시 깨어나도 둘이 되지 않는다)
    expect(c.alive.filter((x) => x.def === DOUBLE).length).toBe(1);

    // 체력이 터무니없이 크면 상한까지만
    const big = startCombat(floor5({ hp: 9999 }), 'lord-a5');
    awaken(big);
    expect(doubleOf(big)!.maxHp).toBe(DOUBLE_HP_MAX);
  });

  it('아직 피해를 준 기술이 없으면 악몽의 손톱으로 할퀸다', () => {
    const c = startCombat(floor5(), 'lord-a5');
    awaken(c);
    const d = doubleOf(c)!;
    expect(mimicPer(c)).toBe(0);
    expect(d.intent?.move).toBe('claw');
    expect(d.intent?.dmg).toBe(DOUBLE_CLAW);
    expect(d.intent?.hits ?? 1).toBe(1);
  });

  it('내가 마지막으로 피해를 준 기술을 흉내 낸다: 의도 이름에 기술 이름, 타격당 피해는 내가 준 그대로 (버팀에 깎이기 전)', () => {
    const run = floor5({ str: 10 });
    const c = startCombat(run, 'lord-a5');
    const e = awaken(c);
    const d = doubleOf(c)!;
    // 버팀이 없는 상대에게 쏜 피해 = 버팀에 깎이기 전 피해 (흉내의 기준)
    e.poise = e.maxPoise = 0;
    c.drain();
    expect(c.useSkill('weapon', e.uid)).toBeNull();
    const shot = c.drain().find((x) => x.t === 'dmg' && x.tgt === e.uid && x.src === 'p');
    const dealt = shot && shot.t === 'dmg' ? shot.amount : -1;
    expect(dealt).toBeGreaterThan(0);
    expect(d.intent?.move).toBe('mimic');
    expect(d.intent?.label).toBe(`흉내: ${mimicName(c)}`);
    expect(mimicName(c)).toBe(c.skillInfo('weapon')!.def.name);
    expect(d.intent?.hits).toBe(1);
    expect(perHit(c, d)).toBe(Math.min(DOUBLE_CAP, dealt));
    // 의도대로 때린다
    c.drain();
    act(c, d, 'mimic');
    const back = c.drain().filter((x) => x.t === 'dmg' && x.src === d.uid && x.tgt === 'p');
    expect(back.length).toBe(1);
    expect(back[0].t === 'dmg' && back[0].amount).toBe(Math.min(DOUBLE_CAP, dealt));
  });

  it(`타격당 피해는 ${DOUBLE_CAP}까지, 여러 번 때린 기술은 그 횟수만큼 (${DOUBLE_HITS}번까지)`, () => {
    // 사냥꾼의 연속 베기 (2회)
    const run = floor5({ origin: 'hunter', str: 10 });
    const c = startCombat(run, 'lord-a5');
    const e = awaken(c);
    e.poise = e.maxPoise = 0;
    const d = doubleOf(c)!;
    const cut = run.slots.find((uid) => run.skills.find((s) => s.uid === uid)?.id === 'quick-cut')!;
    c.drain();
    expect(c.useSkill(cut, e.uid)).toBeNull();
    const hits = c.drain().filter((x) => x.t === 'dmg' && x.tgt === e.uid && x.src === 'p') as { amount: number }[];
    expect(hits.length).toBe(2);
    expect(mimicHits(c)).toBe(2);
    expect(d.intent?.hits).toBe(2);
    expect(d.intent?.label).toBe('흉내: 연속 베기');
    expect(perHit(c, d)).toBe(Math.min(DOUBLE_CAP, Math.round((hits[0].amount + hits[1].amount) / 2)));

    // 힘이 아주 세면 상한까지만
    const strong = floor5({ str: 200 });
    const s = startCombat(strong, 'lord-a5');
    const se = awaken(s);
    s.useSkill('weapon', se.uid);
    expect(mimicPer(s)).toBe(DOUBLE_CAP);
    expect(perHit(s, doubleOf(s)!)).toBe(DOUBLE_CAP);
  });

  it('흉내 낼 기술을 저장했다 불러와도 이어진다 (JSON)', () => {
    const run = floor5();
    const c = startCombat(run, 'lord-a5');
    const e = awaken(c);
    c.useSkill('weapon', e.uid);
    const per = mimicPer(c);
    const saved = JSON.parse(JSON.stringify(run)) as RunState;
    const d = new Combat(saved);
    expect(mimicPer(d)).toBe(per);
    expect(d.s.enemies.find((x) => x.def === DOUBLE)!.intent?.label).toBe(`흉내: ${mimicName(d)}`);
  });

  it(`쓰러뜨리면 악몽이 깨지며 꿈을 먹는 자가 최대 체력의 ${Math.round(DOUBLE_BACKLASH * 100)}% 피해를 입고, ${DOUBLE_REFORM}턴 뒤 한 번만 다시 빚어진다`, () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = awaken(c);
    hush(c);
    const hp = e.hp;
    c.drain();
    c.kill(doubleOf(c)!);
    expect(e.hp).toBe(hp - Math.ceil(e.maxHp * DOUBLE_BACKLASH));
    expect(c.drain().some((x) => x.t === 'cine' && x.name === 'crack')).toBe(true);
    expect(e.st[REFORM]).toBe(DOUBLE_REFORM);
    // 꿈을 먹는 자의 차례가 DOUBLE_REFORM번 지나면 다시 빚어진다 (그 전에는 없다)
    for (let i = 1; i <= DOUBLE_REFORM; i++) {
      expect(doubleOf(c), `${i}번째 차례 전`).toBeUndefined();
      e.st.stun = 1; // 꿈을 먹는 자는 쉬게 (차례는 지난다)
      c.endTurn();
    }
    const again = doubleOf(c)!;
    expect(again).toBeTruthy();
    expect(e.st[REFORM] ?? 0).toBe(0);
    // 두 번째 것을 쓰러뜨리면 더는 빚지 않는다
    c.kill(again);
    expect(e.st[REFORM] ?? 0).toBe(0);
    for (let i = 0; i < DOUBLE_REFORM + 2; i++) {
      e.st.stun = 1;
      c.endTurn();
    }
    expect(doubleOf(c)).toBeUndefined();
  });

  it('꿈을 먹는 자가 쓰러지면 악몽 속의 나도 흩어진다 (반동 없이)', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = awaken(c);
    const d = doubleOf(c)!;
    c.kill(e);
    expect(d.dead).toBe(true);
    expect(d.fled).toBe(true);
  });
});

describe('계층군주 꿈을 먹는 자 — 굶주림 (식사 시간)', () => {
  it(`첫 식사 시간은 ${HUNGER_FIRST}턴째 (처음 두 턴엔 없다): 의도와 띠가 온전한 내 턴 하나 동안 보이고, 그 뒤 ${HUNGER_EVERY}턴은 지나야 다시 온다`, () => {
    expect(HUNGER_FIRST).toBeGreaterThanOrEqual(3);
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    expect(e.st[HUNGER]).toBe(HUNGER_FIRST - 1);
    const seen: number[] = [];
    for (let i = 0; i < 16 && !c.over; i++) {
      if (c.s.obj?.hit?.uid === e.uid) {
        seen.push(c.s.turn);
        // 띠가 걸린 턴: 의도는 식사 시간, 요구량은 내 최대 행동력 1당 HUNGER_NEED_AP
        expect(e.intent?.move).toBe('eat');
        expect(c.s.obj.text).toContain('굶겨라');
        expect(c.s.obj.text).toContain(`피해 ${hungerNeed(c)}`);
        // 못 굶기면: 시간을 먹는다 (다 먹은 뒤엔 회복만)
        expect(c.s.obj.fail).toContain((c.p.st[GNAWED] ?? 0) < HUNGER_MAX_AP ? '최대 행동력' : '회복');
      }
      c.endTurn();
    }
    expect(seen[0]).toBe(HUNGER_FIRST);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(HUNGER_EVERY);
  });

  it('처음 두 턴엔 식사 시간이 없다 (첫 식사 시간을 앞당겨도 셋째 턴부터)', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    e.mem.hgAt = 1;
    for (let t = 1; t <= 2; t++) {
      expect(c.s.turn).toBe(t);
      expect(c.s.obj ?? null).toBeNull();
      c.endTurn();
    }
    expect(c.s.turn).toBe(3);
    expect(c.s.obj?.hit?.uid).toBe(e.uid);
  });

  it('내 턴 한가운데서 의도를 다시 정할 때는 식사 시간을 알리지 않는다 (온전한 한 턴을 준다)', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    e.mem.hgAt = 1;
    e.mem.actT = c.s.turn;
    c.planIntent(e);
    expect(c.s.obj ?? null).toBeNull();
    expect(e.intent?.move).not.toBe('eat');
  });

  it(`못 굶기면 물어뜯은 뒤 내 시간을 먹는다: 최대 행동력 -${HUNGER_AP} (전투 동안, 모두 ${HUNGER_MAX_AP}까지) · 체력 ${Math.round(HUNGER_HEAL * 100)}% 회복`, () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    hush(c);
    expect(hungerNeed(c)).toBe(HUNGER_NEED_AP * 4);
    for (let k = 1; k <= HUNGER_MAX_AP + 1; k++) {
      // 회복이 최대 체력에 걸리지 않게 넉넉히 깎아 둔다
      e.hp = e.maxHp - Math.ceil(e.maxHp * HUNGER_HEAL) - 100;
      supper(c, e);
      expect(c.s.obj?.hit?.need).toBe(HUNGER_NEED_AP * (4 - Math.min(k - 1, HUNGER_MAX_AP)));
      const hp = e.hp;
      c.drain();
      c.endTurn();
      const ev = c.drain();
      // 물어뜯고 (피해), 먹는다
      expect(ev.some((x) => x.t === 'dmg' && x.src === e.uid && x.tgt === 'p')).toBe(true);
      expect(e.hp).toBe(hp + Math.ceil(e.maxHp * HUNGER_HEAL));
      expect(c.p.st[GNAWED]).toBe(Math.min(k * HUNGER_AP, HUNGER_MAX_AP));
      // 다음 내 턴의 행동력이 그만큼 준다
      expect(c.s.ap).toBe(c.p.maxAp - Math.min(k * HUNGER_AP, HUNGER_MAX_AP));
      expect(c.s.obj ?? null).toBeNull();
      if (k === 1) expect(ev.some((x) => x.t === 'cine' && x.name === 'corners')).toBe(true);
    }
    // 꿈을 먹는 자가 쓰러지면 먹힌 시간이 돌아온다
    c.kill(e);
    expect(c.p.st[GNAWED] ?? 0).toBe(0);
  });

  it(`굶기면 비틀거린다: 약화 ${HUNGER_WEAK}, 버팀 -${HUNGER_POISE} (결계에 막히지 않는다), 식사 대신 굶주린 이빨`, () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    hush(c);
    e.st.ward = 3;
    supper(c, e);
    const poise = e.poise;
    const need = c.s.obj!.hit!.need;
    // 버팀이 남은 적에게 준 피해는 버팀에 깎이기 전으로 센다 (반만 들어가도 요구량은 다 채운다)
    c.damage({ src: c.p, tgt: e, base: need - 1, type: 'true', attack: true });
    expect(c.s.obj?.hit?.need).toBe(1);
    expect(e.intent?.move).toBe('eat');
    c.damage({ src: c.p, tgt: e, base: 1, type: 'true', attack: true });
    expect(c.s.obj ?? null).toBeNull();
    expect(e.st.weak).toBe(HUNGER_WEAK);
    expect(e.st.ward).toBe(3);
    expect(e.poise).toBe(poise - HUNGER_POISE);
    expect(e.intent?.move).toBe('starve');
    expect(e.intent?.dmg).toBe(c.moveDef(e, 'eat').dmg);
    c.endTurn();
    expect(c.p.st[GNAWED] ?? 0).toBe(0);
    expect(c.s.ap).toBe(c.p.maxAp);
  });

  it('식사 시간 동안 꿈을 먹는 자에게 터지는 지속 피해(출혈)도 센다 — 그 차례 시작에 채우면 먹지 못한다', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    hush(c);
    supper(c, e);
    const need = c.s.obj!.hit!.need;
    c.apply(e, 'bleed', need, c.p);
    expect(c.s.obj?.hit?.need).toBe(need);
    c.endTurn();
    expect(e.mem.starved).toBe(1);
    expect(c.p.st[GNAWED] ?? 0).toBe(0);
    expect(c.s.ap).toBe(c.p.maxAp);
  });

  it('악몽 속의 나를 쓰러뜨린 반동도 굶주림에 센다', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = awaken(c);
    hush(c);
    supper(c, e);
    expect(Math.ceil(e.maxHp * DOUBLE_BACKLASH)).toBeGreaterThanOrEqual(c.s.obj!.hit!.need);
    c.kill(doubleOf(c)!);
    expect(c.s.obj ?? null).toBeNull();
    expect(e.mem.starved).toBe(1);
  });

  it('붕괴해 있으면 먹지 못한다 (못 굶겼어도 시간을 잃지 않는다)', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const e = eaterOf(c);
    hush(c);
    supper(c, e);
    c.breakEnemy(e);
    c.endTurn();
    expect(c.p.st[GNAWED] ?? 0).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
  });

  it('식사 시간이 걸린 채 저장했다 불러와도 이어진다 (JSON)', () => {
    const run = floor5();
    const c = startCombat(run, 'lord-a5');
    const e = eaterOf(c);
    hush(c);
    supper(c, e);
    const saved = JSON.parse(JSON.stringify(run)) as RunState;
    const d = new Combat(saved);
    expect(d.s.obj?.hit?.uid).toBe(e.uid);
    d.endTurn();
    expect(d.p.st[GNAWED]).toBe(HUNGER_AP);
  });
});

describe('공정성 — 굶주림', () => {
  const ORIGINS3 = ['soldier', 'hunter', 'occultist'] as const;

  /** 5층다운 힘(10)의 시작 덱 (체력은 넉넉히 — 굶기는지만 본다) */
  function kit(origin: string, seed: number): RunState {
    const run = floor5({ seed, origin, str: 10 });
    run.player.level = 11;
    run.player.insight = 4;
    return run;
  }

  it(`세 출신 모두 시작 덱으로 첫 식사 시간에 꿈을 먹는 자를 굶긴다 (봇, 행동력 4 → 피해 ${HUNGER_NEED_AP * 4})`, () => {
    const failed: string[] = [];
    for (const origin of ORIGINS3) {
      for (const seed of [1, 2, 3]) {
        const c = startCombat(kit(origin, seed), 'lord-a5', { anomaly: null });
        c.snapshots = false;
        const e = eaterOf(c);
        let n = 0;
        while (!c.over && !c.s.obj && n++ < 10) autoTurn(c);
        expect(c.s.obj?.hit?.uid, `${origin} ${seed}`).toBe(e.uid);
        autoTurn(c);
        if ((e.mem.starved ?? 0) < 1) failed.push(`${origin} ${seed}`);
      }
    }
    expect(failed).toEqual([]);
  }, 60_000);
});
