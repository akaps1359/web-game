import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENEMIES } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { autoTurn } from '../src/sim/bot';
import type { EnemyUnit, MoveDef } from '../src/engine/types';
import { aegisCap } from '../src/content/depth';
import { chipPoise } from '../src/content/act3/common';
import {
  ARM_BREAK_CUT,
  ARM_CUT,
  ARM_DMG,
  ARM_MAX,
  ARM_REGROW,
  ARMS,
  BLADE_EXTRA,
  BLADE_N,
  BLADES,
  canImprison,
  DISSECT_DMG,
  ELDER_HP,
  ICE,
  ICE_FIRE_MULT,
  ICE_PRISON,
  ICE_TURNS,
  imprison,
  MEMORY_SAN,
  PRAYER_DMG,
  SHATTERED,
  STARFALL_DMG,
  TENTACLE_DMG,
  TENTACLE_HITS,
  UNFURL_AT,
} from '../src/content/act3/patterns';

/*
 * 3층 계층군주 「깨어난 원로」 (2026-10 「계층군주 패턴을 더 넣고 훨씬 어렵게」):
 *  - 얼음 감옥: 행동력이 가장 큰, 지금 쓸 수 있는 장착 기술을 가둔다 → 깨면 돌아오고(화염은 두 배), 내 턴 셋 안에 못 깨면 부서진다
 *  - 다섯 갈래의 몸(2막): 체력 UNFURL_AT(60%) 아래에서 펼친다 → 팔 수만큼 때리고, 붕괴·큰 일격에 팔이 잘리고, 다시 자란다
 *  - 다섯 별의 기도: 한 차례 모아 큰 일격 (붕괴로 끊긴다) · 멈춘 시간의 칼날이 더 많다
 */

/** 3층에 서 있는 튼튼한 주인공 (힘 0 — 피해 수치를 그대로 재려고) */
function floor3(seed = 303, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 3;
  run.floor = generateFloor(run, 3);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 0;
  run.player.maxAp = 4;
  run.light = 100;
  return run;
}

function fight(seed = 303): { c: Combat; el: EnemyUnit; e: (def: string) => EnemyUnit | undefined } {
  const c = startCombat(floor3(seed), 'lord-a3', { anomaly: null });
  c.s.ap = 9;
  return { c, el: c.alive.find((x) => x.def === 'awakened-elder')!, e: (def) => c.alive.find((x) => x.def === def) };
}

/** planIntent와 같은 계산으로 의도를 이 행동으로 정한다 */
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

/** 적의 차례처럼 그 행동을 실행하고 플레이어 턴으로 돌아온다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
  if (!c.over) c.s.phase = 'player';
  if (!e.dead && e.broken !== 2) e.intent = { move: '_wait', kind: 'unknown', label: '관망' };
}

/** 모든 적이 이번 차례에 아무것도 하지 않는다 (얼음 감옥의 셈은 차례가 끝날 때 그대로 돈다) */
function quiet(c: Combat) {
  for (const x of c.alive) if (x.broken !== 2) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
}

/** 조용히 한 라운드를 넘긴다 */
function pass(c: Combat) {
  quiet(c);
  c.endTurn();
}

/** 실제 흐름대로: 원로의 차례에 「얼음 속에 가둔다」 — 다음 내 턴에 감옥이 서 있다 (처음 두 턴은 지나 있다) */
function imprisoned(c: Combat, el: EnemyUnit): { prison: EnemyUnit; uid: string } {
  if (c.s.turn < 2) pass(c);
  quiet(c);
  force(c, el, 'ice');
  c.endTurn();
  const prison = c.alive.find((x) => x.def === ICE_PRISON)!;
  expect(prison, '얼음 감옥').toBeTruthy();
  return { prison, uid: c.run.slots[prison.mem.specimen - 1]! };
}

/** 원로를 펼친다 (가호·버팀을 걷고 체력을 UNFURL_AT 아래로) */
function unfurlNow(c: Combat, el: EnemyUnit) {
  el.mem.agOff = 1;
  const p = el.poise;
  el.poise = 0;
  c.damage({ src: c.p, tgt: el, base: el.hp - Math.floor(el.maxHp * UNFURL_AT) + 1, type: 'true' });
  el.poise = Math.min(p, el.maxPoise);
  expect(el.mem.unfurled, '펼쳐짐').toBe(1);
}

const cines = (evs: CombatEvent[], name?: string) =>
  evs.filter((ev): ev is Extract<CombatEvent, { t: 'cine' }> => ev.t === 'cine' && (!name || ev.name === name));
const texts = (evs: CombatEvent[]) => evs.filter((ev): ev is Extract<CombatEvent, { t: 'text' }> => ev.t === 'text').map((ev) => ev.text);
const hitsOn = (evs: CombatEvent[], src: string) =>
  evs.filter((ev): ev is Extract<CombatEvent, { t: 'dmg' }> => ev.t === 'dmg' && ev.src === src && ev.tgt === 'p' && ev.attack);

describe('깨어난 원로 — 수치', () => {
  it('체력·촉수·해부·별의 날개·기억이 올랐다 (설명 문구도 같은 상수)', () => {
    const def = ENEMIES.get('awakened-elder')!;
    expect(def.hp).toEqual([ELDER_HP, ELDER_HP]);
    const { c, el } = fight();
    const t = force(c, el, 'tentacles');
    expect(el.intent?.dmg).toBe(TENTACLE_DMG);
    expect(el.intent?.hits).toBe(TENTACLE_HITS);
    expect(t.desc).toContain(String(ARM_DMG));
    expect(force(c, el, 'dissect').dmg).toBe(DISSECT_DMG);
    expect(force(c, el, 'spread').dmg).toBe(STARFALL_DMG);
    expect(force(c, el, 'starfall').dmg).toBe(STARFALL_DMG);
    expect(force(c, el, 'memory').sanity).toBe(MEMORY_SAN);
    expect(def.traits).toEqual(expect.arrayContaining(['a3-old-master', 'a3-ice-memory', 'a3-five-arms']));
  });
});

describe('깨어난 원로 — 얼음 감옥', () => {
  it('행동력이 가장 큰, 지금 쓸 수 있는 장착 기술을 가둔다 (전열에 선 얼음 감옥 + 목표 띠 + 상태 칩)', () => {
    const { c, el } = fight();
    pass(c);
    const ready = c.run.slots.filter((x): x is string => !!x && !(c.s.cd[x] > 0));
    const top = Math.max(...ready.map((uid) => c.costOf(c.skillInfo(uid)!)));
    c.drain();
    const { prison, uid } = imprisoned(c, el);
    // 무기·방어구 기본기는 장착 칸에 없다 — 가두지 않는다
    expect(c.run.slots).toContain(uid);
    expect(c.costOf(c.skillInfo(uid)!)).toBe(top);
    expect(c.s.cd[uid]).toBe(99);
    expect(c.blockReason(uid)).not.toBeNull();
    expect(c.blockReason('weapon')).toBeNull();
    expect(c.blockReason('armor')).toBeNull();
    // 공격하지 않는 하수인, 전열에 자리가 있으면 전열
    expect(prison.minion).toBe(true);
    expect(prison.row).toBe(0);
    expect(Object.values(ENEMIES.get(ICE_PRISON)!.moves).every((m) => m.intent !== 'attack' && !m.dmg)).toBe(true);
    expect(c.p.st[ICE]).toBe(ICE_TURNS);
    expect(c.s.obj?.kill).toEqual([prison.uid]);
    expect(c.s.obj?.hit).toEqual({ uid: prison.uid, need: prison.hp });
    expect(c.s.obj?.text).toContain(`${ICE_TURNS}턴 남음`);
    expect(c.s.obj?.lethal).toBeFalsy();
    // 처음 가둘 때 한 번, 가짜 시스템 창
    expect(cines(c.drain(), 'sysmsg').length).toBe(1);
  });

  it('얼음 감옥을 깨뜨리면 곧바로 돌아온다 (목표·상태도 지운다)', () => {
    const { c, el } = fight();
    const { prison, uid } = imprisoned(c, el);
    c.drain();
    c.damage({ src: c.p, tgt: prison, base: 999, type: 'pierce', attack: true });
    expect(prison.dead).toBe(true);
    expect(c.s.cd[uid]).toBeUndefined();
    expect(c.blockReason(uid)).toBeNull();
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[ICE] ?? 0).toBe(0);
    expect(texts(c.drain()).some((t) => t.includes('되찾았다'))).toBe(true);
  });

  it('대기 중이던 기술을 가뒀다면, 돌아올 때 갇혀 있던 동안 줄어든 만큼의 대기로 돌아온다', () => {
    const { c, el } = fight();
    pass(c);
    for (const uid of c.run.slots) if (uid) c.s.cd[uid] = 3;
    const { prison, uid } = imprisoned(c, el);
    // 쓸 수 있는 것이 없으면 대기 중인 것 가운데서 가둔다 (적의 차례에 가둘 때 대기 3 → 다음 턴 시작에 줄어든 몫은 이미 지났다)
    pass(c);
    c.damage({ src: c.p, tgt: prison, base: 999, type: 'pierce', attack: true });
    expect(c.s.cd[uid]).toBe(1);
  });

  it('내 화염 피해(화상 포함)는 두 배로 녹인다 — 미리보기도 같은 숫자, 화염이 아니면 그대로', () => {
    const { c, el } = fight();
    const { prison } = imprisoned(c, el);
    let hp = prison.hp;
    c.damage({ src: c.p, tgt: prison, base: 4, type: 'fire' });
    expect(hp - prison.hp).toBe(4 * ICE_FIRE_MULT);
    hp = prison.hp;
    c.damage({ src: null, tgt: prison, base: 2, type: 'true', tags: ['dot', 'burn'] });
    expect(hp - prison.hp).toBe(2 * ICE_FIRE_MULT);
    hp = prison.hp;
    c.damage({ src: c.p, tgt: prison, base: 4, type: 'pierce' });
    expect(hp - prison.hp).toBe(4);
    expect(c.preview(c.p, prison, 4, 'fire', { attack: false })).toBe(4 * ICE_FIRE_MULT);
    expect(c.preview(c.p, prison, 4, 'arcane', { attack: false })).toBe(4);
    // 목표 띠의 남은 피해는 맞을 때마다 줄어든다
    expect(c.s.obj?.hit?.need).toBe(prison.hp);
  });

  it('내 턴 셋 안에 깨뜨리지 못하면 기억이 얼음과 함께 부서진다 — 이번 전투 동안 잠기고, 원로는 더 가두지 않는다', () => {
    const { c, el } = fight();
    const { prison, uid } = imprisoned(c, el);
    const seen: number[] = [];
    for (let i = 0; i < ICE_TURNS; i++) {
      seen.push(c.p.st[ICE] ?? 0);
      expect(c.s.obj?.text, `${i}`).toContain(`${ICE_TURNS - i}턴 남음`);
      expect(c.s.cd[uid]).toBe(99);
      if (i === ICE_TURNS - 1) expect(prison.intent?.move).toBe('crumble');
      c.drain();
      pass(c);
    }
    expect(seen).toEqual([3, 2, 1].slice(0, ICE_TURNS));
    const evs = c.drain();
    expect(prison.dead).toBe(true);
    expect(c.alive.some((x) => x.def === ICE_PRISON)).toBe(false);
    expect(texts(evs).some((t) => t.includes('부서졌다'))).toBe(true);
    expect(c.p.st[SHATTERED]).toBe(1);
    expect(c.p.st[ICE] ?? 0).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
    // 원로가 부서진 기억을 품는다 (대기를 되돌리는 효과가 건드리지 않는 표식)
    expect(el.mem.specimen).toBe(c.run.slots.indexOf(uid) + 1);
    for (let i = 0; i < 4; i++) {
      expect(c.s.cd[uid], `${i}`).toBe(99);
      expect(c.blockReason(uid)).not.toBeNull();
      pass(c);
    }
    // 대기를 억지로 지워도 기술을 쓰고 나면 다시 잠긴다
    delete c.s.cd[uid];
    expect(c.useSkill('armor')).toBeNull();
    expect(c.s.cd[uid]).toBe(99);
    expect(canImprison(c, el)).toBe(false);
    // 원로가 쓰러져도 이번 전투가 끝날 때까지 그대로
    c.spawn('shoggoth-blob', 1);
    c.kill(el);
    pass(c);
    expect(c.s.cd[uid]).toBe(99);
  });

  it('얼음 감옥을 기절시켜도 기한은 그대로 흐른다 (기절로 미뤄 두지 못한다)', () => {
    const { c, el } = fight();
    const { prison, uid } = imprisoned(c, el);
    for (let i = 0; i < ICE_TURNS; i++) {
      prison.st.stun = 1;
      pass(c);
    }
    expect(prison.dead).toBe(true);
    expect(c.p.st[SHATTERED]).toBe(1);
    expect(c.s.cd[uid]).toBe(99);
  });

  it('감옥은 한 번에 하나, 장착 기술이 둘 미만이면 가두지 않는다, 처음 두 턴엔 가두지 않는다', () => {
    const { c, el } = fight();
    expect(canImprison(c, el)).toBe(false);
    imprisoned(c, el);
    expect(canImprison(c, el)).toBe(false);
    act(c, el, 'ice');
    expect(c.alive.filter((x) => x.def === ICE_PRISON).length).toBe(1);

    const b = fight(11);
    pass(b.c);
    b.c.run.slots = [b.c.run.slots.find(Boolean)!, null, null, null];
    expect(canImprison(b.c, b.el)).toBe(false);
    b.c.s.phase = 'enemy';
    expect(imprison(b.c, b.el)).toBe(false);
    expect(b.c.alive.some((x) => x.def === ICE_PRISON)).toBe(false);
    expect(Object.keys(b.c.s.cd).length).toBe(0);
  });

  it('스스로는 빨라야 세 번째 차례에 가두고, 그때 의도에 미리 보인다', () => {
    const { c, el } = fight();
    let first = 0;
    for (let i = 0; i < 12 && !first; i++) {
      for (const x of c.alive) if (x !== el && x.broken !== 2) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
      if (el.intent?.move === 'ice') first = c.s.turn;
      c.endTurn();
    }
    expect(first).toBeGreaterThanOrEqual(3);
    // 의도로 보인 차례가 끝나면 감옥이 서 있다
    expect(c.alive.some((x) => x.def === ICE_PRISON)).toBe(true);
  });

  it('전열이 가득 차 후열에 서도 근접으로 닿는다', () => {
    const { c, el } = fight();
    c.spawn('shoggoth-blob', 0);
    expect(c.row(0).length).toBe(3);
    const { prison } = imprisoned(c, el);
    expect(prison.row).toBe(1);
    const melee = { ...c.skillInfo('weapon')!.def, range: 'melee' as const };
    expect(c.validTargets(melee).map((x) => x.uid)).toContain(prison.uid);
  });

  it('원로가 쓰러지면 얼음이 녹아 갇힌 기술이 돌아온다', () => {
    const { c, el } = fight();
    const { prison, uid } = imprisoned(c, el);
    c.kill(el);
    expect(prison.dead).toBe(true);
    expect(c.s.cd[uid]).toBeUndefined();
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[ICE] ?? 0).toBe(0);
  });

  it('얼음 감옥이 서 있어도(목표가 걸려 있어도) 원로의 가호는 그대로 — 감옥을 깬 뒤에도 같은 턴의 상한이 이어진다', () => {
    const { c, el } = fight();
    const { prison } = imprisoned(c, el);
    const cap = aegisCap(el);
    expect(cap).toBeGreaterThan(0);
    const hp0 = el.hp;
    // 버팀이 남아 절반만 들어간다: 첫 일격은 상한의 절반, 둘째는 남은 만큼, 셋째는 막힌다
    c.damage({ src: c.p, tgt: el, base: cap, type: 'slash', attack: true });
    expect(hp0 - el.hp).toBe(Math.floor(cap / 2));
    c.damage({ src: c.p, tgt: el, base: 3 * cap, type: 'slash', attack: true });
    c.damage({ src: c.p, tgt: el, base: 3 * cap, type: 'slash', attack: true });
    expect(hp0 - el.hp).toBe(cap);
    expect(el.broken).toBe(0);
    expect(el.st.aegis ?? 0).toBe(0);
    // 하수인인 감옥은 가호가 없다
    c.damage({ src: c.p, tgt: prison, base: 999, type: 'slash', attack: true });
    expect(prison.dead).toBe(true);
    expect(c.s.obj ?? null).toBeNull();
    const hp1 = el.hp;
    c.damage({ src: c.p, tgt: el, base: 50, type: 'slash', attack: true });
    expect(el.hp).toBe(hp1);
    // 다음 턴이면 다시 찬다
    pass(c);
    expect(el.st.aegis).toBe(cap);
  });

  it('전투 도중 저장했다 불러와도 감옥이 그대로 이어진다 (JSON)', () => {
    const { c, el } = fight();
    const { uid } = imprisoned(c, el);
    const saved: RunState = JSON.parse(JSON.stringify(c.run));
    expect(saved.combat).toEqual(c.run.combat);
    const c2 = new Combat(saved);
    for (let i = 0; i < ICE_TURNS; i++) pass(c2);
    expect(c2.p.st[SHATTERED]).toBe(1);
    expect(c2.s.cd[uid]).toBe(99);
  });
});

describe('깨어난 원로 — 다섯 갈래의 몸 (2막)', () => {
  it('체력이 UNFURL_AT 아래로 떨어지면 펼친다: 형태·이름이 바뀌고 팔 다섯, 화면 너머로 한 번', () => {
    const { c, el } = fight();
    el.mem.agOff = 1;
    el.poise = 0;
    c.damage({ src: c.p, tgt: el, base: el.hp - Math.ceil(el.maxHp * (UNFURL_AT + 0.02)), type: 'true' });
    expect(el.mem.unfurled).toBeUndefined();
    expect(el.form ?? 0).toBe(0);
    c.drain();
    unfurlNow(c, el);
    expect(el.form).toBe(1);
    expect(el.name).toBe('펼쳐진 원로');
    expect(ENEMIES.get('awakened-elder')!.forms?.[0].name).toBe('펼쳐진 원로');
    expect(el.st[ARMS]).toBe(ARM_MAX);
    const evs = c.drain();
    expect(cines(evs, 'whisper').length).toBe(1);
    expect(cines(evs, 'shatter').length).toBe(1);
    // 노예의 반란은 따로 — 원로의 체력이 절반 아래로 떨어질 때 (펼침과 반란이 두 박자로 온다)
    const thrall = () => c.alive.find((x) => x.def === 'shoggoth-thrall');
    expect(thrall()?.mem.rebel).toBeUndefined();
    c.damage({ src: c.p, tgt: el, base: el.hp - Math.floor(el.maxHp * 0.48), type: 'true' });
    expect(thrall()?.mem.rebel).toBe(1);
    // 펼침은 한 번뿐 (더 맞아도 다시 펼치지 않는다 — 팔도 그대로)
    c.drain();
    c.damage({ src: c.p, tgt: el, base: 10, type: 'true' });
    expect(cines(c.drain(), 'shatter').length).toBe(0);
    expect(el.st[ARMS]).toBe(ARM_MAX);
  });

  it('펼친 뒤 「다섯 갈래 촉수」는 남은 팔마다 한 번씩 때리고, 팔이 잘리면 의도의 횟수도 준다', () => {
    const { c, el } = fight();
    unfurlNow(c, el);
    force(c, el, 'tentacles');
    expect(el.intent?.hits).toBe(ARM_MAX);
    expect(el.intent?.dmg).toBe(ARM_DMG);
    // 큰 일격 둘 → 팔 둘이 잘린다
    for (let i = 0; i < 2; i++) c.damage({ src: c.p, tgt: el, base: ARM_CUT, type: 'slash', attack: true });
    expect(el.st[ARMS]).toBe(ARM_MAX - 2);
    expect(el.intent?.hits).toBe(ARM_MAX - 2);
    c.drain();
    c.s.phase = 'enemy';
    c.moveDef(el, 'tentacles').run(c, el);
    expect(hitsOn(c.drain(), el.uid).length).toBe(ARM_MAX - 2);
  });

  it('붕괴시키면 팔 둘이 잘린다 (붕괴 하나에 한 번 — 버팀만 깎여 무너져도)', () => {
    const { c, el } = fight();
    unfurlNow(c, el);
    el.poise = 1;
    c.damage({ src: c.p, tgt: el, base: 5, type: 'fire', attack: true });
    expect(el.broken).toBe(2);
    expect(el.st[ARMS]).toBe(ARM_MAX - ARM_BREAK_CUT);
    // 무너진 채 차례가 와도 두 번 자르지 않는다
    pass(c);
    expect(el.st[ARMS]).toBe(ARM_MAX - ARM_BREAK_CUT);
    // 피해 없이 버팀만 깎여 무너져도 (원로의 차례가 시작될 때)
    pass(c);
    expect(el.broken).toBe(0);
    chipPoise(c, el, el.poise);
    expect(el.broken).toBe(2);
    pass(c);
    expect(el.st[ARMS] ?? 0).toBe(Math.max(0, ARM_MAX - 2 * ARM_BREAK_CUT));
  });

  it('내 공격 한 번에 피해 20 이상(버팀에 깎이기 전)이면 팔 하나가 잘린다 — 버팀이 절반으로 깎아도 센다', () => {
    const { c, el } = fight();
    unfurlNow(c, el);
    el.poise = el.maxPoise;
    const hp = el.hp;
    c.damage({ src: c.p, tgt: el, base: ARM_CUT - 1, type: 'slash', attack: true });
    expect(el.st[ARMS]).toBe(ARM_MAX);
    c.damage({ src: c.p, tgt: el, base: ARM_CUT, type: 'slash', attack: true });
    expect(el.st[ARMS]).toBe(ARM_MAX - 1);
    // 버팀이 남아 실제로는 절반만 들어갔다
    expect(hp - el.hp).toBeLessThan(ARM_CUT + ARM_CUT - 1);
    // 적끼리 준 피해(반란한 노예)나 지속 피해로는 잘리지 않는다
    c.damage({ src: c.alive.find((x) => x.def === 'shoggoth-thrall')!, tgt: el, base: 99, type: 'void', attack: true });
    c.damage({ src: null, tgt: el, base: 99, type: 'true', tags: ['dot', 'bleed'] });
    expect(el.st[ARMS]).toBe(ARM_MAX - 1);
  });

  it(`잘린 팔은 원로의 차례 ${ARM_REGROW}번마다 하나씩 다시 자란다 (최대 ${ARM_MAX})`, () => {
    const { c, el } = fight();
    unfurlNow(c, el);
    for (let i = 0; i < 2; i++) c.damage({ src: c.p, tgt: el, base: ARM_CUT, type: 'slash', attack: true });
    expect(el.st[ARMS]).toBe(ARM_MAX - 2);
    for (let i = 1; i < ARM_REGROW; i++) pass(c);
    expect(el.st[ARMS]).toBe(ARM_MAX - 2);
    pass(c);
    expect(el.st[ARMS]).toBe(ARM_MAX - 1);
    for (let i = 0; i < ARM_REGROW * 3; i++) pass(c);
    expect(el.st[ARMS]).toBe(ARM_MAX);
  });

  it('팔이 모두 잘리면 촉수를 노리던 차례는 헛돌고, 팔이 없는 동안엔 촉수를 고르지 않는다', () => {
    const { c, el } = fight();
    unfurlNow(c, el);
    force(c, el, 'tentacles');
    for (let i = 0; i < ARM_MAX; i++) c.damage({ src: c.p, tgt: el, base: ARM_CUT, type: 'slash', attack: true });
    expect(el.st[ARMS] ?? 0).toBe(0);
    expect(el.intent?.move).toBe('stump');
    c.drain();
    c.endTurn();
    expect(hitsOn(c.drain(), el.uid).length).toBe(0);
    for (let i = 0; i < 10; i++) {
      if ((el.st[ARMS] ?? 0) === 0) expect(el.intent?.move).not.toBe('tentacles');
      pass(c);
    }
  });

  it('펼친 원로의 「멈춘 시간」은 칼날이 더 많다', () => {
    const { c, el } = fight();
    act(c, el, 'stillness');
    expect(c.p.st[BLADES]).toBe(BLADE_N);
    const b = fight(11);
    unfurlNow(b.c, b.el);
    act(b.c, b.el, 'stillness');
    expect(b.c.p.st[BLADES]).toBe(BLADE_N + BLADE_EXTRA);
  });

  it('「다섯 별의 기도」: 한 차례 모은 뒤 큰 일격 — 모으는 동안 붕괴시키면 끊긴다', () => {
    const def = ENEMIES.get('awakened-elder')!;
    // 끊지 못하면 그대로 쏟는다
    const { c, el } = fight();
    unfurlNow(c, el);
    quiet(c);
    force(c, el, 'prayer');
    c.endTurn();
    expect(el.mem.charge).toBe(1);
    expect(el.intent?.move).toBe('answer');
    expect(el.intent?.dmg).toBe(PRAYER_DMG);
    const pv = c.preview(el, c.p, PRAYER_DMG, 'void');
    for (const x of c.alive) if (x !== el) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
    c.p.block = 0;
    c.drain();
    c.endTurn();
    const hits = hitsOn(c.drain(), el.uid);
    expect(hits.length).toBe(1);
    expect(hits[0].amount).toBe(pv);
    expect(el.mem.charge ?? 0).toBe(0);

    // 붕괴시키면 끊긴다
    const b = fight(11);
    unfurlNow(b.c, b.el);
    quiet(b.c);
    force(b.c, b.el, 'prayer');
    b.c.endTurn();
    expect(b.el.intent?.move).toBe('answer');
    b.el.poise = 1;
    b.c.damage({ src: b.c.p, tgt: b.el, base: 5, type: 'fire', attack: true });
    expect(b.el.broken).toBe(2);
    expect(b.el.mem.charge ?? 0).toBe(0);
    for (const x of b.c.alive) if (x !== b.el) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
    b.c.drain();
    b.c.endTurn();
    expect(hitsOn(b.c.drain(), b.el.uid).length).toBe(0);
    expect(b.el.intent?.move).not.toBe('answer');
    expect(def.ai(b.c, b.el)).not.toBe('answer');
  });
});

describe('깨어난 원로 — 출신 간 공정성 (시작 덱)', () => {
  const ORIGINS = ['soldier', 'hunter', 'occultist'];

  /** 3층에 막 들어선 그 출신의 시작 덱 (레벨 9, 체력 105, 행동력 3, 힘·민첩 0 — 정수·강화 없이). sturdy면 쓰러지지 않는다 */
  function kit3(origin: string, seed = 303, sturdy = false): RunState {
    const run = newRun({ seed, origin });
    run.act = 3;
    run.floor = generateFloor(run, 3);
    run.player.level = 9;
    run.player.maxHp = run.player.hp = sturdy ? 9999 : 105;
    if (sturdy) run.player.sanity = run.player.maxSanity = 9999;
    run.light = 100;
    return run;
  }

  it('어느 출신이든 무기 기본 공격만으로 내 턴 셋 안에 얼음 감옥을 깬다 (화염 없이도)', () => {
    for (const origin of ORIGINS) {
      const c = startCombat(kit3(origin, 303, true), 'lord-a3', { anomaly: null });
      const el = c.alive.find((x) => x.def === 'awakened-elder')!;
      const { prison, uid } = imprisoned(c, el);
      for (let turn = 0; turn < ICE_TURNS && !prison.dead; turn++) {
        while (!c.blockReason('weapon') && !prison.dead) c.useSkill('weapon', prison.uid);
        if (!prison.dead) pass(c);
      }
      expect(prison.dead, origin).toBe(true);
      expect(c.p.st[SHATTERED] ?? 0, origin).toBe(0);
      expect(c.s.cd[uid] ?? 0, origin).toBeLessThan(90);
    }
  });

  it('어느 출신이든 시작 덱으로 봇이 기한 안에 얼음 감옥을 깬다 (체력 105, 원로는 평소대로 움직인다)', () => {
    for (const origin of ORIGINS) {
      for (const seed of [303, 11, 42, 2026]) {
        const c = startCombat(kit3(origin, seed), 'lord-a3', { anomaly: null });
        const el = c.alive.find((x) => x.def === 'awakened-elder')!;
        const { prison } = imprisoned(c, el);
        for (let turn = 0; turn < ICE_TURNS && !prison.dead && !c.over; turn++) autoTurn(c);
        expect(prison.dead, `${origin} #${seed}`).toBe(true);
        expect(c.p.st[SHATTERED] ?? 0, `${origin} #${seed}`).toBe(0);
        expect(c.s.phase, `${origin} #${seed}`).not.toBe('defeat');
      }
    }
  });
});
