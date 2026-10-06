import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, SKILLS } from '../src/engine/registry';
import { finishCombat, newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import type { EnemyUnit, MoveDef } from '../src/engine/types';
import { autoTurn, incoming } from '../src/sim/bot';
import { DOOM } from '../src/content/act4/common';
import {
  COMMAND,
  DARK,
  DEFY_STR,
  ECLIPSE_STR,
  ENTANGLE,
  FIRE_LIGHT,
  FLIP_BLOCK,
  GATE_ORBS,
  QUAKE,
  QUAKE_FIRST,
  QUAKE_STEP,
  RIDE_HITS,
  ROOT_TURNS,
  STAR_DMG,
  STAR_MIN,
  STAR_PCT,
  STAR_TURNS,
  STARFALL,
  SWAP_CAP,
  WINDRIDE,
  addDark,
  issueCommand,
  orbCount,
} from '../src/content/act4/patterns';

/** 4층에 서 있는 튼튼한 주인공 */
function floor4(seed = 404, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 4;
  run.floor = generateFloor(run, 4);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 8;
  run.player.maxAp = 4;
  run.light = 100;
  return run;
}

function fightToEnd(c: Combat) {
  let n = 0;
  while (!c.over && n++ < 300) autoTurn(c);
  return c;
}

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((x) => x.def === def)!;

/** planIntent와 같은 계산으로 의도를 이 행동으로 정한다 (속임수 의도 포함) */
function force(c: Combat, e: EnemyUnit, id: string): MoveDef {
  const m = c.moveDef(e, id);
  e.intent = {
    move: id,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
    hidden: m.hidden,
    charging: m.charging,
    disguise: m.disguise,
  };
  return m;
}

/** 적의 차례처럼 그 행동을 실행한다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
  c.s.phase = 'player';
}

const cines = (evs: CombatEvent[], name: string) => evs.filter((ev) => ev.t === 'cine' && ev.name === name);
const hitsOn = (evs: CombatEvent[], tgt: string, src?: string) =>
  evs.filter((ev) => ev.t === 'dmg' && ev.tgt === tgt && (src === undefined || ev.src === src));

describe('4층 수호자 — 문 너머의 존재', () => {
  it('「모든 것이 하나」는 문과 살아 있는 구체마다 한 줄기 — 구체를 부수면 준비하던 빛이 바로 줄어든다', () => {
    const c = startCombat(floor4(), 'a4-boss-gate', { anomaly: null });
    const gate = find(c, 'beyond-gate');
    expect(orbCount(c)).toBe(3);
    force(c, gate, 'oneness');
    expect(gate.intent!.hits).toBe(4);
    const orb = c.alive.find((x) => GATE_ORBS.includes(x.def))!;
    c.damage({ src: c.p, tgt: orb, base: 9999, type: 'slash', attack: true });
    expect(orb.dead).toBe(true);
    expect(gate.intent!.hits).toBe(3);

    c.drain();
    const san = c.p.sanity;
    act(c, gate, 'oneness');
    const evs = c.drain();
    expect(hitsOn(evs, 'p', gate.uid).length).toBe(3);
    expect(c.p.sanity).toBeLessThan(san);
    // 제4의 벽은 처음 한 번만
    expect(cines(evs, 'whisper').length).toBe(1);
    act(c, gate, 'oneness');
    expect(cines(c.drain(), 'whisper').length).toBe(0);
  });

  it('차원을 접는 동안 문이 전열로 끌려 나와 근접 공격이 닿고(화면이 기운다), 접힌 차원이 펴지면 물러난다', () => {
    const c = startCombat(floor4(), 'a4-boss-gate', { anomaly: null });
    const gate = find(c, 'beyond-gate');
    const melee = SKILLS.get('shield-bash')!;
    expect(melee.range).toBe('melee');
    expect(gate.row).toBe(1);
    expect(c.validTargets(melee)).not.toContain(gate);

    act(c, gate, 'rise');
    expect(gate.mem.charge).toBe(1);
    expect(gate.row).toBe(0);
    expect(c.validTargets(melee)).toContain(gate);
    expect(c.s.vars['ui:tilt']).toBeLessThan(0);
    // 힘을 모으는 동안엔 차례가 끝나도 앞에 남는다
    c.fire(gate, 'onUnitTurnEnd');
    expect(gate.row).toBe(0);
    // 이어지는 강공격은 예고와 같다
    expect(ENEMIES.get('beyond-gate')!.ai(c, gate)).toBe('crush');

    // 붕괴시키면 차지가 끊기고, 차례가 끝나면 물러난다
    c.breakEnemy(gate);
    c.fire(gate, 'onUnitTurnEnd');
    expect(gate.row).toBe(1);
    expect(c.s.vars['ui:tilt']).toBeUndefined();
  });

  it('구체가 다시 맺힐 때 처음 한 번, 문 너머의 손바닥이 화면 안쪽을 짚는다', () => {
    const c = startCombat(floor4(), 'a4-boss-gate', { anomaly: null });
    const gate = find(c, 'beyond-gate');
    for (const o of c.alive.filter((x) => GATE_ORBS.includes(x.def))) c.damage({ src: c.p, tgt: o, base: 9999, type: 'true' });
    expect(orbCount(c)).toBe(0);
    c.planIntent(gate);
    expect(gate.intent!.move).toBe('open');
    c.drain();
    act(c, gate, 'open');
    expect(orbCount(c)).toBe(3);
    expect(cines(c.drain(), 'handprints').length).toBe(1);
    for (const o of c.alive.filter((x) => GATE_ORBS.includes(x.def))) c.damage({ src: c.p, tgt: o, base: 9999, type: 'true' });
    act(c, gate, 'open');
    expect(cines(c.drain(), 'handprints').length).toBe(0);
  });
});

describe('4층 수호자 — 검은 파라오', () => {
  it('가면을 쓴 동안 「자비」는 거짓 의도 — 통찰 7이면 진짜가 보이고, 그 전엔 봇도 속는다', () => {
    const run = floor4();
    run.player.insight = 0;
    const c = startCombat(run, 'a4-boss-pharaoh', { anomaly: null });
    const ph = find(c, 'black-pharaoh');
    // 가면을 쓴 동안의 순서에 거짓 의도가 섞여 있다 (심판이 진행 중이면 다시 걸지 않는다)
    c.p.st[DOOM] = 9;
    const seq = Array.from({ length: 6 }, () => ENEMIES.get('black-pharaoh')!.ai(c, ph));
    expect(seq).toContain('mercy');

    force(c, ph, 'mercy');
    const shown = c.shownIntent(ph)!;
    expect(shown.kind).toBe('buff');
    expect(shown.label).toBe('자비를 베푼다');
    expect(shown.dmg).toBeUndefined();
    const fooled = incoming(c);
    c.p.insight = 7;
    expect(c.shownIntent(ph)!.kind).toBe('attack');
    expect(incoming(c)).toBeGreaterThan(fooled);

    c.drain();
    act(c, ph, 'mercy');
    const evs = c.drain();
    expect(hitsOn(evs, 'p', ph.uid).length).toBe(2);
    expect(cines(evs, 'scrawl').length).toBe(1);
  });

  it('가면이 벗겨지면 화면이 산산조각 나고, 지금까지의 죽음을 속삭인다', () => {
    const c = startCombat(floor4(), 'a4-boss-pharaoh', { anomaly: null });
    const ph = find(c, 'black-pharaoh');
    c.drain();
    c.damage({ src: c.p, tgt: ph, base: Math.ceil(ph.maxHp * 0.55), type: 'true' });
    expect(ph.form).toBe(1);
    const evs = c.drain();
    expect(cines(evs, 'shatter').length).toBe(1);
    const w = cines(evs, 'whisper')[0];
    expect(w && w.t === 'cine' && w.text).toContain('{deaths}');
  });

  it('「왕의 명령」: 지목한 기술을 쓰면 흡족해하고, 쓰지 않으면 정신 피해·공포·힘으로 벌한다', () => {
    // 가면이 벗겨진 뒤의 순서대로 명령이 나온다 — 지목한 기술이 의도에 보인다
    const run = floor4();
    const c = startCombat(run, 'a4-boss-pharaoh', { anomaly: null });
    const ph = find(c, 'black-pharaoh');
    c.damage({ src: c.p, tgt: ph, base: Math.ceil(ph.maxHp * 0.55), type: 'true' });
    expect(ph.form).toBe(1);
    c.p.st[DOOM] = 9;
    ph.mem.c2 = 1;
    c.drain();
    c.planIntent(ph);
    expect(ph.intent!.move).toBe('command');
    const n = c.p.st[COMMAND];
    expect(n).toBeGreaterThan(0);
    const uid = run.slots[n - 1]!;
    const name = SKILLS.get(run.skills.find((s) => s.uid === uid)!.id)!.name;
    // 처음 명령은 게임의 도움말인 척한다
    expect(cines(c.drain(), 'sysmsg').length).toBe(1);
    c.fire(c.p, 'onTurnStart');
    expect(ph.intent!.label).toBe(`명령: 「${name}」`);

    // 따른다
    c.s.ap = 10;
    delete c.s.cd[uid];
    expect(c.useSkill(uid, ph.uid)).toBeNull();
    expect(c.p.st[COMMAND]).toBeUndefined();
    expect(ph.intent!.label).toBe('흡족해한다');
    const san = c.p.sanity;
    const str = ph.st.str ?? 0;
    act(c, ph, 'command');
    expect(c.p.sanity).toBe(san);
    expect(ph.st.str ?? 0).toBe(str);

    // 따르지 않는다
    const c2 = startCombat(floor4(), 'a4-boss-pharaoh', { anomaly: null });
    const ph2 = find(c2, 'black-pharaoh');
    ph2.form = 1;
    expect(issueCommand(c2, ph2)).toBe(true);
    const san2 = c2.p.sanity;
    const str2 = ph2.st.str ?? 0;
    act(c2, ph2, 'command');
    expect(c2.p.sanity).toBeLessThan(san2);
    expect(c2.p.st.dread).toBe(2);
    expect(ph2.st.str).toBe(str2 + DEFY_STR);
    expect(c2.p.st[COMMAND]).toBeUndefined();

    // 결계는 명령을 막는다
    const c3 = startCombat(floor4(), 'a4-boss-pharaoh', { anomaly: null });
    c3.p.st.ward = 1;
    expect(issueCommand(c3, find(c3, 'black-pharaoh'))).toBe(false);
  });
});

describe('4층 수호자 — 별의 자손 군주', () => {
  it('흔들리는 대지: 문턱만큼 체력을 잃으면 다음 행동이 「대지를 뒤집는다」로 바뀌고, 뒤집을 때마다 문턱이 오른다', () => {
    const c = startCombat(floor4(), 'a4-boss-starlord', { anomaly: null });
    const lord = find(c, 'starspawn-lord');
    const larva = find(c, 'star-larva');
    const need = Math.round(lord.maxHp * QUAKE_FIRST);
    expect(lord.st[QUAKE]).toBe(need);
    expect(lord.intent!.move).not.toBe('flip');

    c.damage({ src: c.p, tgt: lord, base: need - 1, type: 'true' });
    expect(lord.st[QUAKE]).toBe(1);
    expect(lord.intent!.move).not.toBe('flip');
    c.damage({ src: c.p, tgt: lord, base: 5, type: 'true' });
    expect(lord.st[QUAKE]).toBeUndefined();
    expect(lord.intent!.move).toBe('flip');

    expect([lord.row, larva.row]).toEqual([0, 1]);
    c.drain();
    act(c, lord, 'flip');
    expect(hitsOn(c.drain(), 'p', lord.uid).length).toBe(1);
    expect([lord.row, larva.row]).toEqual([1, 0]);
    expect(lord.block).toBeGreaterThanOrEqual(FLIP_BLOCK);
    expect(lord.st[QUAKE]).toBe(Math.round(lord.maxHp * (QUAKE_FIRST + QUAKE_STEP)));
    // 뒤집기에 밀려난 행동(처음 계획한 휩쓸기)은 사라지지 않고 다음 차례로 미뤄진다
    c.planIntent(lord);
    expect(lord.intent!.move).toBe('sweep');
    c.planIntent(lord);
    expect(lord.intent!.move).toBe('transmit');
  });

  it('「별을 부른다」: 내 턴이 두 번 끝나면 전열에 별이 떨어진다 — 군주는 뒤로 숨지만, 전열을 비우면 끌려 나와 제 별을 맞는다', () => {
    const run = floor4();
    const c = startCombat(run, 'a4-boss-starlord', { anomaly: null });
    const lord = find(c, 'starspawn-lord');
    force(c, lord, 'starcall');
    c.endTurn();
    expect(c.p.st[STARFALL]).toBe(STAR_TURNS);
    // 군주는 별을 피해 뒤로 숨으려 한다
    expect(lord.intent!.move).toBe('flip');
    c.endTurn();
    expect(c.p.st[STARFALL]).toBe(1);
    expect(lord.row).toBe(1);

    // 전열(유충)을 모두 쓰러뜨리면 군주가 앞으로 끌려 나온다
    for (const l of c.alive.filter((x) => x.def === 'star-larva')) c.damage({ src: c.p, tgt: l, base: 9999, type: 'true' });
    expect(c.useSkill('armor')).toBeNull();
    expect(lord.row).toBe(0);
    const lordHp = lord.hp;
    const hp = c.p.hp;
    c.p.block = 0;
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(c.p.st[STARFALL]).toBeUndefined();
    expect(cines(evs, 'impact').length).toBeGreaterThan(0);
    // 군주는 제 별에 맞았다 (그 뒤 자기 차례에 회복은 하지 않는다)
    const starHit = hitsOn(evs, lord.uid).find((ev) => ev.t === 'dmg' && ev.tags.includes('a4-star'));
    expect(starHit && starHit.t === 'dmg' && starHit.amount).toBe(Math.max(STAR_MIN, Math.round(lord.maxHp * STAR_PCT)));
    expect(lord.hp).toBeLessThan(lordHp);
    // 당신도 설명에 적힌 그대로 맞는다 (방어도가 먼저 막는다)
    expect(hitsOn(evs, 'p').some((ev) => ev.t === 'dmg' && ev.tags.includes('a4-star') && ev.amount === STAR_DMG && ev.hpLoss === STAR_DMG)).toBe(true);
    expect(c.p.hp).toBeLessThan(hp);
  });

  it('떨어지는 별은 군주를 붕괴시키면 흩어진다', () => {
    const c = startCombat(floor4(), 'a4-boss-starlord', { anomaly: null });
    const lord = find(c, 'starspawn-lord');
    act(c, lord, 'starcall');
    expect(c.p.st[STARFALL]).toBe(STAR_TURNS);
    c.breakEnemy(lord);
    expect(c.p.st[STARFALL]).toBeUndefined();
  });
});

describe('4층 계층군주 — 검은 별', () => {
  it('어둠: 빛을 삼키고 공허의 눈이 빛을 먹을수록 쌓인다 — 2부터 의도가 어둠에 묻히고(통찰 7이면 보인다), 화염·비전 공격이 내 턴마다 한 번 걷어 낸다', () => {
    const run = floor4();
    run.player.insight = 0;
    const c = startCombat(run, 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    const eye = find(c, 'void-eye');
    c.drain();
    act(c, star, 'devour');
    expect(c.p.st[DARK]).toBe(1);
    expect(c.s.vars['ui:dark']).toBe(25);
    // 처음 어두워질 때 가짜 시스템 창 — 정말로 화면 밝기가 내려간다
    expect(cines(c.drain(), 'sysmsg').length).toBe(1);
    act(c, eye, 'feed');
    expect(c.p.st[DARK]).toBe(2);
    expect(c.s.vars['ui:dark']).toBe(50);

    // 내 턴이 시작되면 의도가 어둠에 묻힌다
    force(c, star, 'beam');
    c.fire(c.p, 'onTurnStart');
    expect(c.shownIntent(star)!.label).toBe('어둠 속');
    expect(c.shownIntent(star)!.dmg).toBeUndefined();
    c.p.insight = 7;
    expect(c.shownIntent(star)!.move).toBe('beam');
    c.p.insight = 0;
    // 힘을 모으는 것은 보인다
    force(c, star, 'rise');
    c.fire(c.p, 'onTurnStart');
    expect(c.shownIntent(star)!.move).toBe('rise');

    // 화염 공격이 어둠을 걷는다 — 내 턴마다 한 번
    force(c, star, 'beam');
    c.fire(c.p, 'onTurnStart');
    c.damage({ src: c.p, tgt: star, base: 10, type: 'fire', attack: true });
    expect(c.p.st[DARK]).toBe(1);
    expect(c.shownIntent(star)!.move).toBe('beam');
    c.damage({ src: c.p, tgt: star, base: 10, type: 'arcane', attack: true });
    expect(c.p.st[DARK]).toBe(1);
    // 다른 속성은 걷어 내지 못한다
    c.s.turn++;
    c.damage({ src: c.p, tgt: star, base: 10, type: 'pierce', attack: true });
    expect(c.p.st[DARK]).toBe(1);
    c.damage({ src: c.p, tgt: star, base: 10, type: 'arcane', attack: true });
    expect(c.p.st[DARK]).toBeUndefined();
    expect(c.s.vars['ui:dark']).toBeUndefined();
  });

  it('어둠이 3이 되면 일식 — 그 전에 어둠을 걷어 내면 일식이 흩어지고, 일어나면 정신 피해·힘을 얻고 어둠이 1로 물러난다', () => {
    const c = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    addDark(c, star, 3);
    expect(c.p.st[DARK]).toBe(3);
    c.planIntent(star);
    expect(star.intent!.move).toBe('eclipse');
    // 일식은 어둠 속에서도 보인다
    c.fire(c.p, 'onTurnStart');
    expect(c.shownIntent(star)!.move).toBe('eclipse');
    c.damage({ src: c.p, tgt: star, base: 10, type: 'fire', attack: true });
    expect(c.p.st[DARK]).toBe(2);
    expect(star.intent!.move).not.toBe('eclipse');

    const c2 = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star2 = find(c2, 'black-star');
    addDark(c2, star2, 3);
    const san = c2.p.sanity;
    const str = star2.st.str ?? 0;
    c2.drain();
    act(c2, star2, 'eclipse');
    expect(c2.p.sanity).toBeLessThan(san);
    expect(star2.st.str).toBe(str + ECLIPSE_STR);
    expect(c2.p.st[DARK]).toBe(1);
    expect(cines(c2.drain(), 'whisper').length).toBe(1);
  });
});

describe('4층 정예', () => {
  it('기어오는 혼돈의 화신: 「천 개의 가면」을 쓰는 척 덮친다 (통찰 5면 보인다)', () => {
    const run = floor4();
    run.player.insight = 0;
    const c = startCombat(run, 'a4-avatar', { anomaly: null });
    const av = find(c, 'chaos-avatar');
    const seq = Array.from({ length: 7 }, () => ENEMIES.get('chaos-avatar')!.ai(c, av));
    expect(seq).toContain('grin');
    force(c, av, 'grin');
    expect(c.shownIntent(av)!.label).toBe(c.moveDef(av, 'masks').name);
    expect(c.shownIntent(av)!.kind).toBe('buff');
    c.p.insight = 5;
    expect(c.shownIntent(av)!.kind).toBe('attack');
    c.drain();
    act(c, av, 'grin');
    expect(hitsOn(c.drain(), 'p', av.uid).length).toBe(2);
    expect(c.p.st.dread).toBe(1);
  });

  it('천 마리 새끼의 어머니: 얽히는 뿌리 — 두 턴 동안 행동력 -1, 화염·참격 기술을 쓰면 끊어진다', () => {
    const run = floor4(404, 'hunter');
    const c = startCombat(run, 'a4-mother', { anomaly: null });
    const mother = find(c, 'thousand-mother');
    act(c, mother, 'roots');
    expect(c.p.st[ENTANGLE]).toBe(ROOT_TURNS);
    c.startPlayerTurn();
    expect(c.s.ap).toBe(c.p.maxAp - 1);
    expect(c.p.st[ENTANGLE]).toBe(ROOT_TURNS - 1);
    // 사냥칼(참격)로 끊는다 → 다음 턴엔 그대로
    expect(c.useSkill('weapon', mother.uid)).toBeNull();
    expect(c.p.st[ENTANGLE]).toBeUndefined();
    c.startPlayerTurn();
    expect(c.s.ap).toBe(c.p.maxAp);

    // 끊지 않으면 두 턴 내내 붙든다
    const c2 = startCombat(floor4(), 'a4-mother', { anomaly: null });
    act(c2, find(c2, 'thousand-mother'), 'roots');
    c2.startPlayerTurn();
    expect(c2.s.ap).toBe(c2.p.maxAp - 1);
    c2.startPlayerTurn();
    expect(c2.s.ap).toBe(c2.p.maxAp - 1);
    expect(c2.p.st[ENTANGLE]).toBeUndefined();
    c2.startPlayerTurn();
    expect(c2.s.ap).toBe(c2.p.maxAp);
  });

  it('이스의 방랑자: 당신이 훨씬 멀쩡하면 「몸 바꾸기」를 준비하고, 다음 차례 체력 비율이 뒤바뀐다 — 붕괴시키면 끊긴다', () => {
    const run = floor4();
    const c = startCombat(run, 'a4-yith', { anomaly: null });
    const y = find(c, 'yith-wanderer');
    y.hp = Math.round(y.maxHp / 2);
    c.p.st[DOOM] = 9;
    c.planIntent(y);
    expect(y.intent!.move).toBe('reach');
    act(c, y, 'reach');
    c.planIntent(y);
    expect(y.intent!.move).toBe('bodyswap');
    const hp = c.p.hp;
    const yh = y.hp;
    act(c, y, 'bodyswap');
    expect(hp - c.p.hp).toBe(Math.round(SWAP_CAP * c.p.maxHp));
    expect(y.hp - yh).toBe(Math.round(SWAP_CAP * y.maxHp));

    const c2 = startCombat(floor4(), 'a4-yith', { anomaly: null });
    const y2 = find(c2, 'yith-wanderer');
    y2.hp = Math.round(y2.maxHp / 2);
    act(c2, y2, 'reach');
    c2.breakEnemy(y2);
    expect(y2.mem.charge).toBeUndefined();
    c2.p.st[DOOM] = 9;
    c2.planIntent(y2);
    expect(y2.intent!.move).not.toBe('bodyswap');
  });

  it('이스의 방랑자: 「정신 교환」으로 기술을 봉인한 턴엔 기술 이름이 뒤섞여 보이고, 방랑자의 다음 차례에 제자리를 찾는다', () => {
    const c = startCombat(floor4(), 'a4-yith', { anomaly: null });
    const y = find(c, 'yith-wanderer');
    act(c, y, 'swap');
    expect(c.s.vars['ui:scramble']).toBe(1);
    c.fire(y, 'onUnitTurnStart');
    expect(c.s.vars['ui:scramble']).toBeUndefined();
  });

  it('별 사이를 걷는 자: 바람을 타면 받는 피해가 절반 — 세 번 맞히면 떨어져 붕괴하고, 자기 차례가 오면 바람이 잦아든다', () => {
    const c = startCombat(floor4(), 'stalker-a4', { anomaly: null });
    const w = find(c, 'star-walker');
    act(c, w, 'ride');
    expect(w.st[WINDRIDE]).toBe(RIDE_HITS);
    const d = c.damage({ src: c.p, tgt: w, base: 20, type: 'slash', attack: true });
    expect(d.amount).toBe(Math.floor((20 + c.p.str) * 0.5));
    expect(w.st[WINDRIDE]).toBe(RIDE_HITS - 1);
    for (let i = 1; i < RIDE_HITS; i++) c.damage({ src: c.p, tgt: w, base: 1, type: 'slash', attack: true });
    expect(w.st[WINDRIDE]).toBeUndefined();
    expect(w.broken).toBe(2);

    const c2 = startCombat(floor4(), 'stalker-a4', { anomaly: null });
    const w2 = find(c2, 'star-walker');
    act(c2, w2, 'ride');
    force(c2, w2, 'howl');
    c2.endTurn();
    expect(w2.st[WINDRIDE]).toBeUndefined();
    expect(w2.hist[w2.hist.length - 1]).toBe('howl');
  });

  it('사냥하는 공포: 등불이 낮을수록 「어둠 속 사냥」이 여러 번 물고, 화염 피해가 등불을 밝혀 그 횟수를 줄인다 (화면의 어둠도 등불을 따른다)', () => {
    const run = floor4();
    run.light = 24;
    const c = startCombat(run, 'rift-a4', { anomaly: null });
    const h = find(c, 'hunting-horror');
    expect(c.s.vars['ui:dark']).toBe(70 - 24);
    force(c, h, 'hunt');
    expect(h.intent!.hits).toBe(4);
    c.damage({ src: c.p, tgt: h, base: 5, type: 'fire', attack: true });
    expect(run.light).toBe(24 + FIRE_LIGHT);
    expect(h.intent!.hits).toBe(3);
    expect(c.s.vars['ui:dark']).toBe(70 - 24 - FIRE_LIGHT);
    c.drain();
    act(c, h, 'hunt');
    expect(hitsOn(c.drain(), 'p', h.uid).length).toBe(3);
    // 화상도 불꽃이다
    force(c, h, 'hunt');
    c.damage({ src: null, tgt: h, base: 3, type: 'true', tags: ['dot', 'burn'] });
    expect(run.light).toBe(24 + FIRE_LIGHT * 2);
    // 등불이 가득하면 한 번만
    run.light = 100;
    force(c, h, 'hunt');
    expect(h.intent!.hits).toBe(1);
  });
});

describe('4층 — 연출과 봇', () => {
  it('수호자의 제4의 벽 연출은 남발하지 않는다 (전투당 4번 이하, 가짜 게임오버 없음)', () => {
    for (const id of ['a4-boss-gate', 'a4-boss-pharaoh', 'a4-boss-starlord', 'lord-a4']) {
      const run = floor4(91);
      run.player.insight = 0;
      const c = fightToEnd(startCombat(run, id, { anomaly: null }));
      expect(c.s.phase, id).toBe('victory');
      const fourth = c.events.filter((ev) => ev.t === 'cine' && ['whisper', 'sysmsg', 'scrawl', 'fakeover'].includes(ev.name));
      expect(fourth.length, id).toBeGreaterThanOrEqual(1);
      expect(fourth.length, id).toBeLessThanOrEqual(4);
      expect(fourth.some((ev) => ev.t === 'cine' && ev.name === 'fakeover'), id).toBe(false);
    }
  });

  it('4층의 모든 조우를 봇이 이기고, 보상까지 받는다', () => {
    for (const enc of ENCOUNTERS.filter((e) => e.act === 4)) {
      const run = floor4(77);
      const c = fightToEnd(startCombat(run, enc.id, { anomaly: null }));
      expect(c.s.phase, enc.id).toBe('victory');
      expect(finishCombat(run), enc.id).not.toBeNull();
    }
  });

  it('다른 출신으로도 4층 정예·수호자를 이긴다 (화염·참격·비전이 새 규칙을 건드린다)', () => {
    const special = ENCOUNTERS.filter((e) => e.act === 4 && e.kind !== 'normal');
    for (const origin of ['hunter', 'occultist']) {
      for (const enc of special) {
        const run = floor4(55, origin);
        const c = fightToEnd(startCombat(run, enc.id, { anomaly: null }));
        expect(c.s.phase, `${origin} ${enc.id}`).toBe('victory');
      }
    }
  }, 60_000);
});
