import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { autoTurn } from '../src/sim/bot';
import type { CineName, EnemyUnit, MoveDef } from '../src/engine/types';
import { ASH_DARK, LASH_BASE, LASH_MAX, LASH_STEP, RISE_PCT, SNATCH, corpses } from '../src/content/act2/enemies';
import {
  ABSOLVE_SAN,
  CONFESSION,
  HANGED,
  PENANCE,
  PENANCE_HP,
  RESONANCE,
  RING_MULT,
  SACRILEGE_BLOCK,
  SILENT_MULT,
  TANGLED,
  VOW,
  VOW_STR,
  VOW_WORDS,
} from '../src/content/act2/patterns';

/**
 * 2층 정예·수호자 패턴 (2026-10 확장): 새 메커니즘마다 실제 동작을, 마지막에 봇이 2층의 모든 조우를 이기는지 확인한다.
 */

/** 2층에 서 있는 튼튼한 주인공 */
function floor2(seed = 202, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 2;
  run.floor = generateFloor(run, 2);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 0;
  run.player.insight = 0;
  run.light = 100;
  return run;
}

function fight(encId: string, seed = 202, origin = 'soldier'): Combat {
  const c = startCombat(floor2(seed, origin), encId, { anomaly: null });
  c.drain();
  return c;
}

const one = (c: Combat, def: string): EnemyUnit => c.alive.find((x) => x.def === def)!;

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

/** 적의 차례처럼 그 행동을 실행한다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
}

/** 다른 적들은 이번 차례에 아무것도 하지 않는다 */
function idleOthers(c: Combat, keep: EnemyUnit) {
  for (const x of c.alive) if (x !== keep) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
}

const cinesOf = (evs: CombatEvent[]): { name: CineName; text?: string }[] =>
  evs.filter((x): x is Extract<CombatEvent, { t: 'cine' }> => x.t === 'cine').map((x) => ({ name: x.name, text: x.text }));

const texts = (evs: CombatEvent[]) => evs.filter((x): x is Extract<CombatEvent, { t: 'text' }> => x.t === 'text').map((x) => x.text);

describe('대사제 — 침묵의 서약', () => {
  it('첫 행동으로 서약을 지운다: 남은 말이 보이고, 유리에 경문이 새겨진다', () => {
    const c = fight('a2-boss-priest');
    const priest = one(c, 'high-priest');
    expect(priest.intent?.move).toBe('vow');
    expect(c.p.st[VOW]).toBeUndefined();
    c.endTurn();
    expect(c.p.st[VOW]).toBe(VOW_WORDS);
    expect(cinesOf(c.drain()).some((x) => x.name === 'scrawl' && !!x.text)).toBe(true);
    // 한 번 지우면 다시 고르지 않는다
    expect(priest.intent?.move).not.toBe('vow');
  });

  it('기술(기본기 포함)을 쓸 때마다 말이 줄고, 행동력이 남은 채 0이 되면 말을 끊긴다', () => {
    const c = fight('a2-boss-priest');
    const priest = one(c, 'high-priest');
    c.p.st[VOW] = 2;
    c.s.ap = 3;
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.st[VOW]).toBe(1);
    expect(c.s.ap).toBe(2);
    const str = priest.st.str ?? 0;
    expect(c.useSkill('armor')).toBeNull();
    // 행동력 1이 남은 채 0 → 파문
    expect(c.s.ap).toBe(0);
    expect(c.p.st.silence).toBe(1);
    expect(priest.st.str ?? 0).toBe(str + VOW_STR);
    expect(c.p.st[VOW]).toBe(VOW_WORDS);
    expect(c.blockReason('armor')).not.toBeNull();
    const evs = c.drain();
    expect(texts(evs).some((t) => t.startsWith('파문'))).toBe(true);
    expect(cinesOf(evs).filter((x) => x.name === 'sysmsg').length).toBe(1);
    // 가짜 시스템 창은 처음 한 번만
    c.endTurn();
    c.p.st[VOW] = 1;
    c.s.ap = 3;
    expect(c.useSkill('armor')).toBeNull();
    expect(cinesOf(c.drain()).filter((x) => x.name === 'sysmsg').length).toBe(0);
  });

  it('행동력을 다 쓰는 말로 끝맺으면 무사하다', () => {
    const c = fight('a2-boss-priest');
    const priest = one(c, 'high-priest');
    c.p.st[VOW] = 1;
    c.s.ap = 1;
    const str = priest.st.str ?? 0;
    expect(c.useSkill('armor')).toBeNull();
    expect(c.s.ap).toBe(0);
    expect(c.p.st.silence).toBeUndefined();
    expect(priest.st.str ?? 0).toBe(str);
    expect(c.p.st[VOW]).toBe(VOW_WORDS);
  });

  it('메아리로 한 번 더 울린 기술은 말 하나로 센다', () => {
    const c = fight('a2-boss-priest');
    c.p.st[VOW] = 5;
    c.s.ap = 3;
    c.s.ammo = 6;
    // 장착 기술 중 쓸 수 있는 것에 메아리를 새긴다
    const uid = c.run.slots.find((u) => !!u && !c.blockReason(u))!;
    c.run.skills.find((s) => s.uid === uid)!.runes = ['echo'];
    expect(c.useSkill(uid, one(c, 'high-priest').uid)).toBeNull();
    expect(c.p.st[VOW]).toBe(4);
  });

  it('대사제가 끝내 쓰러지면 서약도 풀린다', () => {
    const c = fight('a2-boss-priest');
    c.p.st[VOW] = 4;
    c.spawn('censer-priest', 1);
    for (const o of c.alive.filter((x) => x.def === 'offering')) c.kill(o, false);
    c.kill(one(c, 'high-priest'));
    expect(c.over).toBe(false);
    expect(c.p.st[VOW]).toBeUndefined();
  });
});

describe('대사제 — 꺼지지 않는 불', () => {
  it('제물이 남아 있으면 제물을 태워 한 번 다시 일어선다', () => {
    const c = fight('a2-boss-priest');
    const priest = one(c, 'high-priest');
    expect(c.alive.filter((x) => x.def === 'offering').length).toBe(2);
    c.damage({ src: c.p, tgt: priest, base: priest.hp + 50, type: 'true' });
    expect(priest.dead).toBe(false);
    expect(priest.hp).toBe(Math.ceil(priest.maxHp * RISE_PCT));
    // 태워진 제물은 시체도 보상도 남기지 않는다
    expect(c.alive.filter((x) => x.def === 'offering').length).toBe(1);
    expect(c.s.enemies.filter((x) => x.def === 'offering' && x.dead && !x.fled).length).toBe(0);
    expect(cinesOf(c.drain()).some((x) => x.name === 'shatter')).toBe(true);
    // 두 번째는 없다 — 남은 제물은 풀려나 달아난다
    c.damage({ src: c.p, tgt: priest, base: priest.hp + 50, type: 'true' });
    expect(priest.dead).toBe(true);
    // 남은 제물은 풀려나 달아난다 (전투가 끝난다)
    expect(c.alive.length).toBe(0);
  });

  it('제물을 먼저 풀어 주면 일어서지 못한다', () => {
    const c = fight('a2-boss-priest');
    const priest = one(c, 'high-priest');
    for (const o of c.alive.filter((x) => x.def === 'offering')) c.kill(o);
    c.damage({ src: c.p, tgt: priest, base: priest.hp + 50, type: 'true' });
    expect(priest.dead).toBe(true);
    // 남은 제물은 풀려나 달아난다 (전투가 끝난다)
    expect(c.alive.length).toBe(0);
  });
});

describe('구울 왕 — 거짓 만찬', () => {
  /** 시체도, 먹을 새끼도 없는 식탁 */
  function bareTable() {
    const c = fight('a2-boss-ghoulking');
    const king = one(c, 'ghoul-king');
    for (const pup of c.alive.filter((x) => x.def === 'ghoul-pup')) {
      pup.dead = true;
      pup.fled = true;
    }
    king.hp = Math.floor(king.maxHp * 0.7);
    king.hist = [];
    return { c, king };
  }

  it('먹을 시체가 없으면 만찬으로 위장한 도약을 고른다 — 통찰 5 이상이면 진짜 의도가 보인다', () => {
    const { c, king } = bareTable();
    c.planIntent(king);
    expect(king.intent?.move).toBe('lunge');
    const fake = c.shownIntent(king)!;
    expect(fake.kind).toBe('heal');
    expect(fake.label).toBe('왕의 만찬');
    expect(fake.dmg).toBeUndefined();
    c.p.insight = 5;
    const real = c.shownIntent(king)!;
    expect(real.kind).toBe('attack');
    expect(real.dmg).toBe(13);
  });

  it('도약은 입힌 피해만큼 회복한다', () => {
    const { c, king } = bareTable();
    const hp = king.hp;
    const php = c.p.hp;
    act(c, king, 'lunge');
    const lost = php - c.p.hp;
    expect(lost).toBeGreaterThan(0);
    expect(king.hp).toBe(hp + lost);
  });

  it('시체가 있으면 진짜 만찬을 먹는다', () => {
    const { c, king } = bareTable();
    c.spawn('ghoul-pup', 0);
    const pup = one(c, 'ghoul-pup');
    c.damage({ src: c.p, tgt: pup, base: 999, type: 'slash', attack: true });
    expect(corpses(c)).toBe(1);
    c.planIntent(king);
    expect(king.intent?.move).toBe('feast');
  });

  it('불(화염 공격·화상)에 타 죽은 새끼는 시체가 남지 않는다', () => {
    const c = fight('a2-boss-ghoulking');
    const [a, b] = c.alive.filter((x) => x.def === 'ghoul-pup');
    c.damage({ src: c.p, tgt: a, base: 999, type: 'fire', attack: true });
    expect(a.dead).toBe(true);
    expect(corpses(c)).toBe(0);
    c.damage({ src: null, tgt: b, base: 999, type: 'true', tags: ['dot', 'burn'] });
    expect(b.dead).toBe(true);
    expect(corpses(c)).toBe(0);
  });
});

describe('재에 묻힌 것 — 잿바람과 반격', () => {
  function buried() {
    const c = fight('a2-boss-buried');
    const e = one(c, 'ash-buried');
    act(c, e, 'burrow');
    c.s.phase = 'player';
    return { c, e };
  }

  it('파고들면 잿바람이 화면을 덮고, 재 속의 의도는 가려진다', () => {
    const { c, e } = buried();
    expect(e.row).toBe(1);
    expect(c.s.vars['ui:dark']).toBe(ASH_DARK);
    expect(c.alive.filter((x) => x.def === 'ash-larva').length).toBe(2);
    expect(cinesOf(c.drain()).some((x) => x.name === 'whisper' && x.text?.includes('{deaths}'))).toBe(true);
    c.planIntent(e);
    expect(['spew', 'song']).toContain(e.intent?.move);
    expect(e.intent?.hidden).toBe(true);
  });

  it('재 속에서 맞으면 의도가 반격으로 바뀌고, 맞을수록 세진다', () => {
    const { c, e } = buried();
    c.planIntent(e);
    c.damage({ src: c.p, tgt: e, base: 5, type: 'slash', attack: true });
    expect(e.intent?.move).toBe('lash');
    expect(e.intent?.hidden).toBeFalsy();
    expect(e.intent?.dmg).toBe(LASH_BASE + LASH_STEP);
    c.damage({ src: c.p, tgt: e, base: 5, type: 'slash', attack: true });
    expect(e.intent?.dmg).toBe(LASH_BASE + 2 * LASH_STEP);
    for (let i = 0; i < 10; i++) c.damage({ src: c.p, tgt: e, base: 1, type: 'slash', attack: true });
    expect(e.intent?.dmg).toBe(LASH_BASE + LASH_MAX * LASH_STEP);
    // 반격하고 나면 다시 처음부터
    const m = c.moveDef(e, 'lash');
    c.s.phase = 'enemy';
    m.run(c, e);
    expect(e.mem.prov).toBe(0);
  });

  it('지속 피해나 적의 차례에 입은 피해로는 반응하지 않는다', () => {
    const { c, e } = buried();
    c.planIntent(e);
    const before = e.intent?.move;
    c.damage({ src: null, tgt: e, base: 5, type: 'true', tags: ['dot', 'bleed'] });
    expect(e.intent?.move).toBe(before);
    c.s.phase = 'enemy';
    c.damage({ src: c.p, tgt: e, base: 5, type: 'blunt', attack: true, tags: ['counter'] });
    expect(e.intent?.move).toBe(before);
  });

  it('유충이 모두 쓰러지면 재가 갈라지고 화면이 밝아진다', () => {
    const { c, e } = buried();
    c.drain();
    for (const l of c.alive.filter((x) => x.def === 'ash-larva')) c.damage({ src: c.p, tgt: l, base: 999, type: 'slash', attack: true });
    expect(e.row).toBe(0);
    expect(c.s.vars['ui:dark']).toBeUndefined();
    expect(cinesOf(c.drain()).some((x) => x.name === 'shatter')).toBe(true);
    expect(e.intent?.move).toBe('gasp');
  });
});

describe('종지기 — 종소리에 맞춰라', () => {
  it('잠잠한 대종은 피해를 덜 받고, 타종 직후 공명하는 대종은 더 받는다', () => {
    const c = fight('lord-a2');
    const keeper = one(c, 'bellkeeper');
    const bell = one(c, 'great-bell');
    expect(c.preview(c.p, bell, 20, 'blunt')).toBe(Math.floor(20 * SILENT_MULT));
    act(c, keeper, 'toll1');
    expect(bell.st[RESONANCE]).toBe(1);
    expect(c.preview(c.p, bell, 20, 'blunt')).toBe(Math.floor(20 * RING_MULT));
    const cines = cinesOf(c.drain()).map((x) => x.name);
    expect(cines).toContain('bell');
    expect(cines).toContain('sysmsg');
    // 두 번째 타종엔 가짜 시스템 창이 없다
    act(c, keeper, 'toll2');
    expect(cinesOf(c.drain()).map((x) => x.name)).toEqual(['bell']);
  });

  it('공명은 다음 당신 턴 내내 남고, 종의 다음 차례가 오면 잦아든다', () => {
    const c = fight('lord-a2');
    const keeper = one(c, 'bellkeeper');
    const bell = one(c, 'great-bell');
    expect(keeper.intent?.move).toBe('toll1');
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(bell.st[RESONANCE]).toBe(1);
    // 다음 차례에 타종하지 않으면 잦아든다
    force(c, keeper, 'hammer');
    c.endTurn();
    expect(bell.st[RESONANCE]).toBeUndefined();
  });

  it('마지막 종은 필살기 — 울릴 때마다 화면 유리에 금이 남는다', () => {
    const c = fight('lord-a2');
    const keeper = one(c, 'bellkeeper');
    const doom = c.moveDef(keeper, 'doom');
    expect(doom.ultimate).toBe(true);
    expect(doom.cine).toBe('crack');
    act(c, keeper, 'doom');
    expect(c.s.vars['ui:cracks']).toBe(1);
    act(c, keeper, 'doom');
    expect(c.s.vars['ui:cracks']).toBe(2);
    expect(cinesOf(c.drain()).filter((x) => x.name === 'impact').length).toBe(2);
  });

  it('대종이 깨지면 산산조각 연출 — 종지기는 제 심장을 울린다', () => {
    const c = fight('lord-a2');
    const keeper = one(c, 'bellkeeper');
    const bell = one(c, 'great-bell');
    c.damage({ src: c.p, tgt: bell, base: 9999, type: 'true' });
    expect(bell.dead).toBe(true);
    expect(keeper.st.stun).toBe(1);
    expect(cinesOf(c.drain()).some((x) => x.name === 'shatter')).toBe(true);
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) {
      c.planIntent(keeper);
      seq.push(keeper.intent!.move);
    }
    expect(seq).toContain('heart');
    const str = keeper.st.str ?? 0;
    const san = c.p.sanity;
    act(c, keeper, 'heart');
    expect(keeper.st.str).toBe(str + 1);
    expect(c.p.sanity).toBeLessThan(san);
  });
});

describe('정예 — 새 행동', () => {
  it('대고행자의 강요된 고행: 2턴 동안 기술을 쓸 때마다 체력을 잃는다', () => {
    const c = fight('a2-flagellant');
    const fl = one(c, 'flagellant');
    force(c, fl, 'penance');
    idleOthers(c, fl);
    c.endTurn();
    expect(c.p.st[PENANCE]).toBe(2);
    for (let turn = 0; turn < 2; turn++) {
      const hp = c.p.hp;
      expect(c.useSkill('armor')).toBeNull();
      expect(hp - c.p.hp).toBe(PENANCE_HP);
      force(c, fl, 'scourge');
      idleOthers(c, fl);
      c.endTurn();
    }
    expect(c.p.st[PENANCE]).toBeUndefined();
    const hp = c.p.hp;
    c.useSkill('armor');
    expect(c.p.hp).toBe(hp);
  });

  it('성가대장의 뒤엉킨 성가: 기술 이름이 뒤섞여 보이고, 쓴 기술은 그 턴에 다시 쓸 수 없다', () => {
    const c = fight('a2-choirmaster');
    const cm = one(c, 'choirmaster');
    const cres = cm.mem.cres ?? 0;
    force(c, cm, 'tangle');
    idleOthers(c, cm);
    c.endTurn();
    expect(cm.mem.cres).toBe(cres + 1);
    expect(c.p.st[TANGLED]).toBe(1);
    expect(c.s.vars['ui:scramble']).toBe(1);
    c.s.ap = 3;
    expect(c.useSkill('armor')).toBeNull();
    expect(c.blockReason('armor')).toContain('재사용 대기');
    force(c, cm, 'solo');
    idleOthers(c, cm);
    c.endTurn();
    expect(c.s.vars['ui:scramble']).toBeUndefined();
    expect(c.p.st[TANGLED]).toBeUndefined();
    expect(c.blockReason('armor')).toBeNull();
    expect(c.useSkill('armor')).toBeNull();
    expect(c.useSkill('armor')).toBeNull();
  });

  it('성유물함의 고해성사: 공격하지 않고 턴을 마치면 죄를 사함받는다', () => {
    const c = fight('a2-reliquary');
    const r = one(c, 'reliquary');
    force(c, r, 'confess');
    c.endTurn();
    expect(r.mem.charge).toBe(1);
    expect(c.p.st[CONFESSION]).toBe(1);
    expect(c.s.vars['ui:eye']).toBe(1);
    c.p.sanity = 100;
    c.apply(c.p, 'weak', 2);
    expect(c.useSkill('armor')).toBeNull();
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(texts(evs)).toContain('죄를 사함받았다');
    expect(evs.some((x) => x.t === 'sanity' && x.delta === ABSOLVE_SAN)).toBe(true);
    expect(c.p.st.weak).toBeUndefined();
    expect(c.p.st[CONFESSION]).toBeUndefined();
    expect(c.s.vars['ui:eye']).toBeUndefined();
  });

  it('성유물함의 고해성사: 공격하는 순간 신성모독', () => {
    const c = fight('a2-reliquary');
    const r = one(c, 'reliquary');
    force(c, r, 'confess');
    c.endTurn();
    const san = c.p.sanity;
    r.block = 0;
    c.damage({ src: c.p, tgt: r, base: 5, type: 'blunt', attack: true });
    expect(r.block).toBe(SACRILEGE_BLOCK);
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.st[CONFESSION]).toBeUndefined();
    expect(c.s.vars['ui:eye']).toBeUndefined();
    const evs = c.drain();
    expect(texts(evs)).toContain('신성모독');
    expect(cinesOf(evs).some((x) => x.name === 'eye')).toBe(true);
    // 신성모독은 한 번뿐, 분노는 여전히 다가온다
    c.damage({ src: c.p, tgt: r, base: 5, type: 'blunt', attack: true });
    expect(texts(c.drain())).not.toContain('신성모독');
    expect(r.mem.charge).toBe(1);
  });

  it('촛불을 든 것의 등불 강탈: 빼앗긴 등불은 쓰러뜨리면 되찾고, 어두운 만큼 화면도 어둡다', () => {
    const c = fight('stalker-a2');
    const e = one(c, 'candle-lure');
    c.run.light = 60;
    const hp = c.p.hp;
    act(c, e, 'snatch');
    expect(c.p.hp).toBeLessThan(hp);
    expect(c.run.light).toBe(60 - SNATCH);
    expect(e.mem.stolen).toBe(SNATCH);
    expect(c.s.vars['ui:dark']).toBeGreaterThan(0);
    expect(cinesOf(c.drain()).some((x) => x.name === 'handprints')).toBe(true);
    c.kill(e);
    expect(c.run.light).toBe(60);
    expect(c.s.vars['ui:dark']).toBeUndefined();
  });

  it('거꾸로 매달린 성인의 거꾸로 매달기: 체력 피해는 정신력을, 정신력 손실은 체력을 깎는다', () => {
    const c = fight('rift-a2');
    const e = one(c, 'inverted-saint');
    c.p.sanity = 500;
    const hp = c.p.hp;
    act(c, e, 'hang');
    expect(c.p.st[HANGED]).toBe(2);
    expect(c.s.vars['ui:swap']).toBe(1);
    // 매단 뒤 박은 못은 체력 대신 정신력을 깎는다
    expect(c.p.hp).toBe(hp);
    expect(c.p.sanity).toBeLessThan(500);
    // 정신 공격은 체력을 깎는다 (미리보기는 상태를 바꾸지 않는다)
    const san = c.p.sanity;
    expect(c.previewSanityLoss(8)).toBeGreaterThan(0);
    expect(c.p.hp).toBe(hp);
    c.horror(e, 8);
    expect(c.p.sanity).toBe(san);
    expect(c.p.hp).toBeLessThan(hp);
  });

  it('거꾸로 매달림은 두 번의 적 차례 동안 이어지고, 풀리면 화면도 바로 선다', () => {
    const c = fight('rift-a2');
    const e = one(c, 'inverted-saint');
    force(c, e, 'hang');
    c.endTurn();
    expect(c.p.st[HANGED]).toBe(2);
    force(c, e, 'nails');
    c.endTurn();
    expect(c.p.st[HANGED]).toBe(1);
    expect(c.s.vars['ui:swap']).toBe(1);
    force(c, e, 'nails');
    c.endTurn();
    expect(c.p.st[HANGED]).toBeUndefined();
    expect(c.s.vars['ui:swap']).toBeUndefined();
  });

  it('사경 중엔 뒤바뀌지 않는다', () => {
    const c = fight('rift-a2');
    const e = one(c, 'inverted-saint');
    act(c, e, 'hang');
    c.p.st[HANGED] = 2;
    c.p.hp = 0;
    c.p.st.dying = 1;
    const san = c.p.sanity;
    c.horror(e, 8);
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.hp).toBe(0);
  });
});

describe('연출', () => {
  it('수호자의 필살기·정예의 큰 일격은 컷인과 연출을 갖는다', () => {
    const want: [string, string, CineName][] = [
      ['high-priest', 'descend', 'blackhole'],
      ['ghoul-king', 'crush', 'crack'],
      ['ash-buried', 'collapse', 'impact'],
      ['bellkeeper', 'doom', 'crack'],
      ['flagellant', 'rain', 'impact'],
      ['choirmaster', 'grand', 'shatter'],
      ['reliquary', 'wrath', 'beam'],
      ['candle-lure', 'swallow', 'corners'],
      ['inverted-saint', 'miracle', 'timestop'],
    ];
    for (const [id, move, cine] of want) {
      const m = ENEMIES.get(id)!.moves[move];
      expect(m.ultimate, `${id}.${move}`).toBe(true);
      expect(m.cine, `${id}.${move}`).toBe(cine);
    }
    // 실제 전투에서 필살기는 컷인 신호(ult)와 연출을 함께 낸다
    const c = fight('a2-boss-ghoulking');
    const king = one(c, 'ghoul-king');
    king.mem.charge = 1;
    king.intent = null;
    c.planIntent(king);
    idleOthers(c, king);
    c.endTurn();
    expect(c.drain().some((x) => x.t === 'move' && x.uid === king.uid && x.ult === true && x.cine === 'crack')).toBe(true);
  });

  it('수호자의 제4의 벽 연출은 한 전투에 4번을 넘지 않는다', () => {
    for (const enc of ['a2-boss-priest', 'a2-boss-ghoulking', 'a2-boss-buried', 'lord-a2']) {
      for (const seed of [1, 2, 3]) {
        const c = fight(enc, seed);
        c.snapshots = false;
        const wall: string[] = [];
        let n = 0;
        while (!c.over && n++ < 300) {
          autoTurn(c);
          for (const x of cinesOf(c.drain())) if (['whisper', 'sysmsg', 'scrawl', 'fakeover'].includes(x.name)) wall.push(x.name);
        }
        expect(wall.length, `${enc} #${seed}: ${wall.join(',')}`).toBeLessThanOrEqual(4);
        expect(wall, enc).not.toContain('fakeover');
      }
    }
  });
});

describe('2층 — 봇이 모든 조우를 이긴다', () => {
  it('일반·정예·수호자·군주·추적자·균열 조우 모두 (출신 셋, 시드 둘)', () => {
    const lost: string[] = [];
    const encs = ENCOUNTERS.filter((e) => e.act === 2);
    expect(encs.length).toBeGreaterThan(25);
    for (const enc of encs) {
      const special = enc.kind !== 'normal';
      for (const origin of special ? ['soldier', 'hunter', 'occultist'] : ['soldier']) {
        for (const seed of special ? [7, 8] : [7]) {
          const run = floor2(seed, origin);
          run.player.maxHp = run.player.hp = 99999;
          run.player.sanity = run.player.maxSanity = 99999;
          run.player.str = 4;
          const c = startCombat(run, enc.id, { anomaly: enc.anomaly ?? null });
          c.snapshots = false;
          let n = 0;
          while (!c.over && n++ < 300) autoTurn(c);
          if (c.s.phase !== 'victory') lost.push(`${enc.id} (${origin} #${seed}): ${c.s.phase} ${c.s.turn}턴`);
        }
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);
});
