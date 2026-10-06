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
  KNELL,
  KNELL_DREAD,
  KNELL_FAIL,
  KNELL_HP_PCT,
  KNELL_SAN,
  MUFFLE_SAN,
  PENANCE,
  PENANCE_HP,
  REQUIEM,
  REQUIEM_HIT,
  RESONANCE,
  RING_MULT,
  SACRILEGE_BLOCK,
  SILENT_MULT,
  TANGLED,
  VOW,
  VOW_STR,
  VOW_STR_TIMES,
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

describe('종지기 — 마지막 종 (위협 퍼즐: 못 막으면 정신이 무너진다)', () => {
  /** 세 번째 타종 직후의 플레이어 턴까지 진행한다 (2턴 남음) */
  function knell(seed = 202) {
    const c = fight('lord-a2', seed);
    const keeper = one(c, 'bellkeeper');
    const bell = one(c, 'great-bell');
    keeper.mem.tolls = 2;
    force(c, keeper, 'toll3');
    idleOthers(c, keeper);
    c.endTurn();
    return { c, keeper, bell };
  }
  /** 아무 기술도 쓰지 않고 턴을 넘겨 종을 당기게 한다 (1턴 남음) */
  function pulled(seed = 202) {
    const k = knell(seed);
    idleOthers(k.c, k.keeper);
    k.c.endTurn();
    return k;
  }
  /** 대가를 재기 쉬운 평범한 체력·정신력 */
  function plain(c: Combat) {
    c.p.maxHp = c.p.hp = 95;
    c.p.maxSanity = c.p.sanity = 100;
  }

  it('초반에는 오지 않는다: 처음 네 턴 동안 마지막 종이 없다', () => {
    const c = fight('lord-a2');
    const keeper = one(c, 'bellkeeper');
    for (let t = 0; t < 4; t++) {
      expect(['prepare', 'doom'], `${c.s.turn}턴`).not.toContain(keeper.intent?.move);
      expect(c.s.obj ?? null).toBeNull();
      c.endTurn();
    }
  });

  it('세 번째 타종이 카운트다운을 연다 — 그 턴이 시작될 때 의도와 경고 띠(즉사 아님)가 이미 보인다 (2턴)', () => {
    const { c, keeper, bell } = knell();
    expect(c.s.phase).toBe('player');
    expect(keeper.intent?.kind).toBe('charge');
    expect(keeper.intent?.move).toBe('prepare');
    expect(c.s.obj?.text).toContain('2턴');
    expect(c.s.obj?.lethal).toBeFalsy();
    expect(c.s.obj?.fail).toBe(KNELL_FAIL);
    expect(c.s.obj?.text).not.toContain('즉사');
    expect(c.s.obj?.hit).toEqual({ uid: bell.uid, need: bell.hp });
    expect(c.s.obj?.break).toBe(keeper.uid);
    expect(c.s.obj?.quiet).toBeFalsy();
    expect(c.p.st[KNELL]).toBe(2);
    // 세 번째 종도 대종을 공명시킨다
    expect(bell.st[RESONANCE]).toBe(1);
    const evs = c.drain();
    expect(cinesOf(evs).some((x) => x.name === 'whisper')).toBe(true);
  });

  it('종을 당기면 1턴 남음 — 이제는 귀를 막아도 되고, 대종은 다시 공명한다', () => {
    const { c, keeper, bell } = pulled();
    expect(keeper.intent?.kind).toBe('horror');
    expect(keeper.intent?.move).toBe('doom');
    expect(keeper.intent?.sanity).toBe(KNELL_SAN);
    expect(c.s.obj?.text).toContain('1턴');
    expect(c.s.obj?.quiet).toBe(true);
    expect(c.s.obj?.lethal).toBeFalsy();
    expect(c.p.st[KNELL]).toBe(1);
    expect(bell.st[RESONANCE]).toBe(1);
    expect(cinesOf(c.drain()).some((x) => x.name === 'scrawl' && x.text === '귀를 막아라')).toBe(true);
  });

  it('풀지 못하면 정신이 무너진다 (정신 피해·공포·방어도 무시 피해) — 즉사는 아니고, 체력이 충분하면 산다', () => {
    const { c, keeper } = pulled();
    plain(c);
    const san = c.p.sanity;
    const hp = c.p.hp;
    const loss = c.previewSanityLoss(KNELL_SAN);
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.block).toBeGreaterThan(0);
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.s.doom).toBeUndefined();
    expect(c.drain().some((x) => x.t === 'cine' && x.name === 'execute')).toBe(false);
    expect(san - c.p.sanity).toBeGreaterThanOrEqual(loss);
    // 방어도를 무시하고 최대 체력의 10%
    expect(hp - c.p.hp).toBe(Math.ceil(95 * KNELL_HP_PCT));
    expect(c.p.st.dread).toBe(KNELL_DREAD);
    expect(keeper.mem.knell).toBe(0);
    expect(keeper.mem.tolls).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.s.vars['ui:cracks']).toBe(1);
  });

  it('대종에 피해가 들어갈 때마다 남은 피해가 줄고, 대종을 깨뜨리면 그 자리에서 끊긴다 — 대가 없음', () => {
    const { c, keeper, bell } = knell();
    plain(c);
    c.damage({ src: c.p, tgt: bell, base: 20, type: 'blunt', attack: true });
    expect(c.s.obj?.hit?.need).toBe(bell.hp);
    expect(bell.hp).toBe(bell.maxHp - Math.floor(20 * RING_MULT));
    c.damage({ src: c.p, tgt: bell, base: 9999, type: 'true' });
    expect(bell.dead).toBe(true);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[KNELL]).toBeUndefined();
    expect(['prepare', 'doom']).not.toContain(keeper.intent?.move);
    const san = c.p.sanity;
    c.endTurn();
    // 대종이 깨져 종지기는 비틀거린다 — 정신 피해도 공포도 없다
    expect(c.s.phase).toBe('player');
    expect(c.p.sanity).toBe(san);
    expect(c.p.st.dread).toBeUndefined();
  });

  it('종지기를 붕괴시켜도 끊긴다', () => {
    const { c, keeper } = pulled();
    keeper.poise = 1;
    c.damage({ src: c.p, tgt: keeper, base: 1, type: 'fire', attack: true });
    expect(keeper.broken).toBe(2);
    expect(c.s.obj ?? null).toBeNull();
    expect(keeper.mem.knell).toBe(0);
    expect(keeper.mem.tolls).toBe(0);
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.p.st.dread).toBeUndefined();
  });

  it('종이 울리는 턴에 기술을 하나도 쓰지 않으면 귀를 막는다 — 먹먹한 종소리만, 대종은 남는다', () => {
    const { c, keeper, bell } = pulled();
    plain(c);
    const san = c.p.sanity;
    const hp = c.p.hp;
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.sanity).toBeLessThanOrEqual(san - c.previewSanityLoss(MUFFLE_SAN));
    // 들은 대가(방어도 무시 피해·공포)는 없다
    expect(c.p.hp).toBe(hp);
    expect(c.p.st.dread).toBeUndefined();
    expect(bell.dead).toBe(false);
    expect(keeper.mem.knell).toBe(0);
    expect(keeper.mem.tolls).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[KNELL]).toBeUndefined();
  });

  it('저장했다 불러와도 카운트다운이 이어진다', () => {
    const { c } = pulled();
    plain(c);
    // 불러온 전투에서 풀지 못하면 대가를 치른다
    const a = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    const ka = a.alive.find((x) => x.def === 'bellkeeper')!;
    expect(a.s.obj?.text).toContain('1턴');
    expect(a.shownIntent(ka)?.move).toBe('doom');
    expect(a.useSkill('armor')).toBeNull();
    a.endTurn();
    expect(a.s.phase).toBe('player');
    expect(a.p.st.dread).toBe(KNELL_DREAD);
    // 다시 불러와 귀를 막으면 먹먹한 종소리만
    const b = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    b.endTurn();
    expect(b.s.phase).toBe('player');
    expect(b.p.st.dread).toBeUndefined();
  });

  it('봇은 목표 띠를 보고 푼다 — 대종을 깰 수 없으면 귀를 막는다', () => {
    for (const tough of [false, true]) {
      const { c, keeper, bell } = knell(31);
      plain(c);
      // 깰 수 없을 만큼 단단한 종
      if (tough) bell.hp = bell.maxHp = 99999;
      c.snapshots = false;
      let n = 0;
      let rang = false;
      while (!c.over && n++ < 6) {
        if (keeper.mem.knell === 2) rang = true;
        autoTurn(c);
        if (rang && !keeper.mem.knell) break;
      }
      const tag = tough ? '단단한 종' : '보통 종';
      expect(c.s.phase, tag).not.toBe('defeat');
      expect(c.s.obj ?? null, tag).toBeNull();
      // 대가(공포)를 받지 않고 풀었다
      expect(c.p.st.dread, tag).toBeUndefined();
      if (tough) expect(bell.dead).toBe(false);
    }
  });
});

describe('성가대장 — 레퀴엠 (즉사 퍼즐)', () => {
  /** 크레셴도가 차기 직전으로 맞춰 지휘하게 한다 → 레퀴엠 2턴 남음 */
  function requiem(seed = 202, origin = 'soldier') {
    const c = fight('a2-choirmaster', seed, origin);
    const cm = one(c, 'choirmaster');
    cm.mem.cres = 2;
    force(c, cm, 'conduct3');
    idleOthers(c, cm);
    c.endTurn();
    return { c, cm, choir: c.alive.filter((x) => x.def === 'chorister') };
  }
  /** 아무것도 하지 않고 한 턴을 넘긴다 (1턴 남음) */
  function last1(seed = 202) {
    const r = requiem(seed);
    idleOthers(r.c, r.cm);
    r.c.endTurn();
    return r;
  }

  it('초반에는 오지 않는다: 처음 세 턴 동안 해골 의도가 없다', () => {
    const c = fight('a2-choirmaster');
    const cm = one(c, 'choirmaster');
    for (let t = 0; t < 3; t++) {
      expect(c.shownIntent(cm)?.kind, `${c.s.turn}턴`).not.toBe('death');
      expect(c.s.obj ?? null).toBeNull();
      c.endTurn();
    }
  });

  it('크레셴도가 차면 레퀴엠 — 그 턴이 시작될 때 해골 의도와 붉은 띠가 이미 보인다 (2턴)', () => {
    const { c, cm, choir } = requiem();
    expect(c.s.phase).toBe('player');
    expect(cm.intent?.kind).toBe('death');
    expect(cm.intent?.move).toBe('requiem1');
    expect(c.s.obj?.lethal).toBe(true);
    expect(c.s.obj?.text).toContain('2턴');
    expect(c.s.obj?.hit).toEqual({ uid: cm.uid, need: REQUIEM_HIT });
    expect(c.s.obj?.break).toBe(cm.uid);
    expect(c.s.obj?.kill).toEqual(choir.map((x) => x.uid));
    expect(c.p.st[REQUIEM]).toBe(2);
    expect(cinesOf(c.drain()).some((x) => x.name === 'whisper')).toBe(true);
  });

  it('첫 소절 다음엔 1턴 남음, 그다음 차례에 못 막으면 사경 없이 죽는다', () => {
    const { c, cm } = last1();
    expect(cm.intent?.kind).toBe('death');
    expect(cm.intent?.move).toBe('requiem');
    expect(c.s.obj?.text).toContain('1턴');
    expect(c.p.st[REQUIEM]).toBe(1);
    expect(c.useSkill('armor')).toBeNull();
    c.endTurn();
    expect(c.s.phase).toBe('defeat');
    expect(c.s.doom).toBe('레퀴엠');
  });

  it('성가대원 하나를 쓰러뜨리면 그 자리에서 끊긴다 — 크레셴도는 처음부터', () => {
    const { c, cm, choir } = requiem();
    c.damage({ src: c.p, tgt: choir[0], base: 9999, type: 'true' });
    expect(c.s.obj ?? null).toBeNull();
    expect(cm.mem.req).toBe(0);
    expect(cm.mem.cres).toBe(0);
    expect(c.p.st[REQUIEM]).toBeUndefined();
    expect(c.shownIntent(cm)?.kind).not.toBe('death');
    c.endTurn();
    c.endTurn();
    expect(c.s.phase).toBe('player');
  });

  it(`성가대장에게 피해 ${REQUIEM_HIT}을 주면 끊긴다 — 막힌 피해·지속 피해도 센다`, () => {
    const { c, cm } = last1();
    cm.block = 4;
    c.p.str = 0;
    c.p.st = {};
    c.damage({ src: c.p, tgt: cm, base: 8, type: 'slash', attack: true });
    expect(c.s.obj?.hit?.need).toBe(REQUIEM_HIT - 8);
    expect(c.s.obj?.text).toContain(`피해 ${REQUIEM_HIT - 8}`);
    c.damage({ src: null, tgt: cm, base: REQUIEM_HIT, type: 'true', tags: ['dot', 'bleed'] });
    expect(c.s.obj ?? null).toBeNull();
    expect(cm.mem.req).toBe(0);
    c.endTurn();
    expect(c.s.phase).toBe('player');
  });

  it('성가대장을 붕괴시켜도 끊긴다', () => {
    const { c, cm } = last1();
    cm.poise = 1;
    c.damage({ src: c.p, tgt: cm, base: 1, type: 'blunt', attack: true });
    expect(cm.broken).toBe(2);
    expect(c.s.obj ?? null).toBeNull();
    c.endTurn();
    expect(c.s.phase).toBe('player');
  });

  it('결계가 한 번 막는다 — 막히면 노래가 흩어지고 크레셴도는 처음부터', () => {
    const { c, cm } = last1();
    c.p.st.ward = 1;
    expect(c.useSkill('armor')).toBeNull();
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.p.st.ward).toBeUndefined();
    expect(c.s.obj ?? null).toBeNull();
    expect(cm.mem.req).toBe(0);
    expect(cm.mem.cres).toBe(0);
  });

  it('저장했다 불러와도 카운트다운이 이어진다', () => {
    const { c } = last1();
    const a = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    const cma = a.alive.find((x) => x.def === 'choirmaster')!;
    expect(a.s.obj?.lethal).toBe(true);
    expect(a.shownIntent(cma)?.kind).toBe('death');
    a.endTurn();
    expect(a.s.phase).toBe('defeat');
    const b = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    const cmb = b.alive.find((x) => x.def === 'choirmaster')!;
    b.damage({ src: b.p, tgt: cmb, base: 999, type: 'true' });
    b.endTurn();
    expect(b.s.phase).not.toBe('defeat');
  });

  it('레퀴엠과 대합창이 번갈아 오고, 레퀴엠은 전투당 두 번까지', () => {
    const c = fight('a2-choirmaster');
    const cm = one(c, 'choirmaster');
    const seq: string[] = [];
    for (let i = 0; i < 5; i++) {
      cm.mem.cres = 2;
      cm.hist = [];
      act(c, cm, 'conduct3');
      c.s.phase = 'player';
      c.planIntent(cm);
      seq.push(cm.intent!.move);
      if (cm.intent!.move === 'requiem1') {
        // 성가대원 하나를 쓰러뜨려 끊고, 다음 레퀴엠을 위해 새로 부른다
        const ch = c.alive.find((x) => x.def === 'chorister')!;
        c.damage({ src: c.p, tgt: ch, base: 9999, type: 'true' });
        c.spawn('chorister', 0);
      } else {
        act(c, cm, 'prelude');
        delete cm.mem.charge;
        cm.mem.cres = 0;
      }
    }
    expect(seq).toEqual(['requiem1', 'prelude', 'requiem1', 'prelude', 'prelude']);
  });

  it('근접 기본기도 후열의 성가대장에게 닿는다 — 레퀴엠 동안만', () => {
    const c = fight('a2-choirmaster', 7, 'hunter');
    const cm = one(c, 'choirmaster');
    const knife = c.skillInfo('weapon')!.def;
    expect(knife.range).toBe('melee');
    expect(c.validTargets(knife).map((x) => x.uid)).not.toContain(cm.uid);
    const r = requiem(7, 'hunter');
    expect(r.c.validTargets(knife).map((x) => x.uid)).toContain(r.cm.uid);
    const before = r.c.s.obj!.hit!.need;
    expect(r.c.useSkill('weapon', r.cm.uid)).toBeNull();
    expect(r.c.s.obj?.hit?.need ?? 0).toBeLessThan(before);
  });

  it('출신 셋의 시작 덱(2층 수준)으로 봇이 푼다 — 무기 기본 공격만으로도 2턴이면 닿는다', () => {
    for (const origin of ['soldier', 'hunter', 'occultist']) {
      // 무기 기본 공격 × 행동력 3 × 2턴 ≥ 요구 피해
      const probe = fight('a2-choirmaster', 7, origin);
      const per = probe.skillInfo('weapon')!.def.vals.dmg as number | number[];
      const dmg = Array.isArray(per) ? per[0] : per;
      expect(dmg * 3 * 2, origin).toBeGreaterThanOrEqual(REQUIEM_HIT);
      for (const seed of [3, 4, 5]) {
        const run = newRun({ seed, origin });
        run.act = 2;
        run.floor = generateFloor(run, 2);
        run.player.level = 5;
        run.player.maxHp = run.player.hp = 95;
        run.player.sanity = run.player.maxSanity = 100;
        const c = startCombat(run, 'a2-choirmaster', { anomaly: null });
        c.snapshots = false;
        const cm = one(c, 'choirmaster');
        cm.mem.cres = 2;
        force(c, cm, 'conduct3');
        idleOthers(c, cm);
        c.endTurn();
        expect(cm.mem.req, `${origin} #${seed}`).toBe(1);
        let n = 0;
        while (!c.over && cm.mem.req && n++ < 4) autoTurn(c);
        expect(c.s.doom, `${origin} #${seed}`).toBeUndefined();
        expect(c.s.phase, `${origin} #${seed}`).not.toBe('defeat');
      }
    }
  });
});

describe('출신 공정성 — 시작 덱 (2층 수준: Lv5, 체력 95)', () => {
  const ORIGINS = ['soldier', 'hunter', 'occultist'];

  /** 그 출신의 시작 덱 그대로, 2층에 걸맞은 레벨·체력 */
  function starter(origin: string, seed = 7): RunState {
    const run = newRun({ seed, origin });
    run.act = 2;
    run.floor = generateFloor(run, 2);
    run.player.level = 5;
    run.player.maxHp = run.player.hp = 95;
    run.player.sanity = run.player.maxSanity = 100;
    run.light = 70;
    return run;
  }
  const open = (origin: string, enc: string, seed = 7) => {
    const c = startCombat(starter(origin, seed), enc, { anomaly: null });
    c.drain();
    return c;
  };

  it('근접 기본기만으로도 후열의 기믹 물건(대종·결박된 제물·밀려난 잿빛 유충)에 닿는다 — 평범한 후열 적은 그대로', () => {
    const c = open('hunter', 'lord-a2');
    const knife = c.skillInfo('weapon')!.def;
    expect(knife.range).toBe('melee');
    const bell = one(c, 'great-bell');
    expect(bell.row).toBe(1);
    expect(c.validTargets(knife).map((x) => x.uid)).toContain(bell.uid);
    const hp = bell.hp;
    expect(c.useSkill('weapon', bell.uid)).toBeNull();
    expect(bell.hp).toBeLessThan(hp);
    const acolyte = c.spawn('bell-acolyte', 1)!;
    expect(c.validTargets(knife).map((x) => x.uid)).not.toContain(acolyte.uid);

    const p = open('hunter', 'a2-boss-priest');
    const offerings = p.alive.filter((x) => x.def === 'offering');
    expect(offerings.length).toBe(2);
    for (const o of offerings) {
      expect(o.row).toBe(1);
      expect(p.validTargets(knife).map((x) => x.uid)).toContain(o.uid);
    }

    const a = open('hunter', 'a2-boss-buried');
    a.spawn('ash-larva', 0);
    a.spawn('ash-larva', 0);
    const pushed = a.spawn('ash-larva', 0)!;
    expect(pushed.row).toBe(1);
    expect(a.validTargets(knife).map((x) => x.uid)).toContain(pushed.uid);
  });

  it('대종은 특정 속성에 강하지 않다 — 출신 누구의 주 속성으로 쳐도 같다', () => {
    const c = open('hunter', 'lord-a2');
    c.p.str = 0;
    // 플레이어 쪽 보정(시작 조준 등)은 빼고 대종 쪽만 본다
    c.p.st = {};
    const bell = one(c, 'great-bell');
    expect(bell.resist).toEqual({});
    const dmg = ['slash', 'pierce', 'blunt', 'fire', 'arcane', 'void'].map((t) => c.preview(c.p, bell, 20, t as 'slash'));
    expect(new Set(dmg).size).toBe(1);
    expect(dmg[0]).toBe(Math.floor(20 * SILENT_MULT));
  });

  it('마지막 종: 출신 셋 모두 시작 덱으로 풀고 살아남는다 (대종을 깨거나, 못 깨면 귀를 막는다)', () => {
    const solved: Record<string, number> = {};
    for (const origin of ORIGINS) {
      for (const seed of [3, 4, 5]) {
        for (const tough of [false, true]) {
          const c = open(origin, 'lord-a2', seed);
          c.snapshots = false;
          const keeper = one(c, 'bellkeeper');
          const bell = one(c, 'great-bell');
          // 깰 수 없을 만큼 단단한 종이면 귀를 막는 길밖에 없다
          if (tough) bell.hp = bell.maxHp = 99999;
          keeper.mem.tolls = 2;
          force(c, keeper, 'toll3');
          idleOthers(c, keeper);
          c.endTurn();
          expect(keeper.mem.knell, `${origin} #${seed}`).toBe(1);
          let n = 0;
          while (!c.over && keeper.mem.knell && n++ < 6) autoTurn(c);
          const tag = `${origin} #${seed}${tough ? ' (단단한 종)' : ''}`;
          expect(c.s.doom, tag).toBeUndefined();
          expect(c.s.phase, tag).not.toBe('defeat');
          expect(keeper.mem.knell ?? 0, tag).toBe(0);
          // 대가(공포)를 받지 않고 풀었다
          expect(c.p.st.dread ?? 0, tag).toBe(0);
          const how = bell.dead ? 'bell' : 'quiet';
          solved[`${origin}:${how}`] = (solved[`${origin}:${how}`] ?? 0) + 1;
        }
      }
    }
    // 단단한 종은 깨지 못하니 출신마다 적어도 세 번은 귀를 막아 풀었다
    for (const origin of ORIGINS) expect(solved[`${origin}:quiet`] ?? 0, origin).toBeGreaterThanOrEqual(3);
  });

  it('침묵의 서약: 어느 출신이든 행동력을 다 쓰는 말로 끝맺으면 무사하다 — 행동력 0인 기술(재장전)은 말이 아니다', () => {
    for (const origin of ORIGINS) {
      const c = open(origin, 'a2-boss-priest');
      const priest = one(c, 'high-priest');
      c.p.st[VOW] = 3;
      c.s.ap = 3;
      c.s.ammo = 6;
      const str = priest.st.str ?? 0;
      expect(c.useSkill('weapon', priest.uid), origin).toBeNull();
      expect(c.useSkill('armor'), origin).toBeNull();
      expect(c.useSkill('weapon', priest.uid), origin).toBeNull();
      expect(c.s.ap).toBe(0);
      expect(c.p.st.silence, origin).toBeUndefined();
      expect(priest.st.str ?? 0, origin).toBe(str);
      expect(c.p.st[VOW], origin).toBe(VOW_WORDS);
    }
    const c = open('soldier', 'a2-boss-priest');
    c.p.st[VOW] = 1;
    c.s.ap = 3;
    c.s.ammo = 0;
    const reload = c.run.skills.find((s) => s.id === 'reload')!;
    expect(c.run.slots).toContain(reload.uid);
    expect(c.useSkill(reload.uid)).toBeNull();
    expect(c.p.st[VOW]).toBe(1);
    expect(c.s.ap).toBe(3);
  });

  it('서약을 어겨 대사제가 얻는 힘은 전투당 세 번까지 (긴 싸움에서 끝없이 불어나지 않는다)', () => {
    const c = open('occultist', 'a2-boss-priest');
    const priest = one(c, 'high-priest');
    for (let i = 0; i < 5; i++) {
      c.s.phase = 'player';
      delete c.p.st.silence;
      c.p.st[VOW] = 1;
      c.s.ap = 3;
      expect(c.useSkill('armor')).toBeNull();
    }
    expect(priest.st.str ?? 0).toBe(VOW_STR * VOW_STR_TIMES);
  });

  it('구울 왕은 새끼가 살아 있는 동안엔 거짓 만찬을 차리지 않는다 — 불로 새끼를 태우는 출신만 더 노려지지 않게', () => {
    const c = open('hunter', 'a2-boss-ghoulking');
    const king = one(c, 'ghoul-king');
    king.hp = Math.floor(king.maxHp * 0.7);
    king.hist = [];
    expect(corpses(c)).toBe(0);
    expect(c.alive.filter((x) => x.def === 'ghoul-pup').length).toBe(2);
    for (let i = 0; i < 4; i++) {
      c.planIntent(king);
      expect(king.intent?.move).not.toBe('lunge');
    }
  });

  it('출신 셋의 시작 덱으로 2층 정예·추적자·균열·재에 묻힌 것을 이긴다', () => {
    const lost: string[] = [];
    for (const enc of ['a2-flagellant', 'a2-choirmaster', 'a2-reliquary', 'stalker-a2', 'rift-a2', 'a2-boss-buried']) {
      for (const origin of ORIGINS) {
        for (const seed of [11, 12]) {
          const c = open(origin, enc, seed);
          c.snapshots = false;
          let n = 0;
          while (!c.over && n++ < 200) autoTurn(c);
          if (c.s.phase !== 'victory') lost.push(`${enc} ${origin} #${seed}`);
        }
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);
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
