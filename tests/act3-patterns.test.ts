import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENEMIES } from '../src/engine/registry';
import { finishCombat, newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { autoTurn, incoming } from '../src/sim/bot';
import type { EnemyUnit, MoveDef } from '../src/engine/types';
import {
  ALOFT,
  ANGLE,
  ANGLE_BITE,
  BLADE_DMG,
  BLADE_N,
  BLADES,
  CUT_DMG,
  DIM_UNVEIL,
  EAR,
  EGG_TURNS,
  EGGS,
  ESCAPE_DMG,
  FALL_DMG,
  HATCH_DMG,
  INCISE_N,
  INCISION,
  MAX_ANGLES,
  PLASTER,
  REVEAL_TURNS,
  REVEALED,
  STOP_TURNS,
  STOPPED,
  TILT,
  VIVISECT_BASE,
  WOUNDS,
} from '../src/content/act3/patterns';

/*
 * 3층 정예·수호자 패턴 확장 (2026-10): 새 메커니즘마다 실제로 그렇게 움직이는지.
 * 쇼고스 흉내 / 각도의 왕 열린 각 / 산맥 너머의 것 드러난 모습 / 깨어난 원로 멈춘 칼날·반란 /
 * 렝의 대거미 알 / 샨탁 하늘로 채어 감 / 해부학자 절개선 / 프나스의 돌 속임수 / 탐사대장 멈춘 시간
 */

/** 3층에 서 있는 튼튼한 주인공 */
function floor3(seed = 303): RunState {
  const run = newRun({ seed, origin: 'soldier' });
  run.act = 3;
  run.floor = generateFloor(run, 3);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 8;
  run.player.maxAp = 4;
  run.light = 100;
  return run;
}

function fight(enc: string, seed = 303): { c: Combat; e: (def: string) => EnemyUnit } {
  const c = startCombat(floor3(seed), enc, { anomaly: null });
  c.s.ap = 9;
  return { c, e: (def) => c.alive.find((x) => x.def === def)! };
}

/** planIntent와 같은 계산으로 의도를 이 행동으로 정한다 (속임수 포함) */
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

/** 적의 차례처럼 그 행동을 실행하고 플레이어 턴으로 돌아온다 (다음 endTurn에 같은 행동을 또 하지 않게 의도는 관망으로) */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
  if (!c.over) c.s.phase = 'player';
  if (!e.dead && e.broken !== 2) e.intent = { move: '_wait', kind: 'unknown', label: '관망' };
}

const cines = (evs: CombatEvent[], name?: string) =>
  evs.filter((ev): ev is Extract<CombatEvent, { t: 'cine' }> => ev.t === 'cine' && (!name || ev.name === name));
const hitsTagged = (evs: CombatEvent[], tag: string) =>
  evs.filter((ev): ev is Extract<CombatEvent, { t: 'dmg' }> => ev.t === 'dmg' && ev.tags.includes(tag));

describe('쇼고스 — 흉내 (테켈리-리)', () => {
  it('마지막으로 쓴 기술이 공격이면 그 피해의 절반을 같은 속성으로 되던진다 (처음엔 가짜 시스템 창)', () => {
    const { c, e } = fight('a3-boss-shoggoth');
    const s = e('shoggoth');
    expect(c.p.st[EAR]).toBe(1);
    expect(s.intent?.move).toBe('copy');
    expect(c.useSkill('armor')).toBeNull();
    c.drain();
    expect(c.useSkill('weapon', s.uid)).toBeNull();
    const dealt = c.drain().filter((ev) => ev.t === 'dmg' && ev.src === 'p').reduce((n, ev) => n + (ev as { amount: number }).amount, 0);
    expect(dealt).toBeGreaterThan(0);
    act(c, s, 'copy');
    const evs = c.drain();
    const back = hitsTagged(evs, 'a3-mimic');
    expect(back.length).toBe(1);
    expect(back[0].amount).toBe(Math.ceil(dealt / 2));
    expect(back[0].dtype).toBe('pierce');
    const sys = cines(evs, 'sysmsg');
    expect(sys.length).toBe(1);
    expect(sys[0].text).toContain('리볼버 사격');
    // 두 번째 흉내부터는 가짜 시스템 창 없이 화면만 일그러진다
    c.useSkill('weapon', s.uid);
    act(c, s, 'copy');
    const evs2 = c.drain();
    expect(cines(evs2, 'sysmsg').length).toBe(0);
    expect(cines(evs2, 'glitch').length).toBe(1);
  });

  it('마지막으로 쓴 기술이 방어면 그만큼 방어도를 얻는다 (순서가 중요하다)', () => {
    const { c, e } = fight('a3-boss-shoggoth');
    const s = e('shoggoth');
    c.useSkill('weapon', s.uid);
    const b0 = c.p.block;
    c.useSkill('armor');
    const gained = c.p.block - b0;
    expect(gained).toBeGreaterThan(0);
    const hp = c.p.hp;
    const sb = s.block;
    act(c, s, 'copy');
    expect(s.block - sb).toBe(gained);
    expect(c.p.hp).toBe(hp);
  });

  it('기술을 쓰지 않았으면 흉내 낼 것이 없어 비명만 지른다 (정신 피해)', () => {
    const { c, e } = fight('a3-boss-shoggoth');
    const s = e('shoggoth');
    c.p.sanity = c.p.maxSanity = 100;
    act(c, s, 'copy');
    expect(c.p.sanity).toBeLessThan(100);
    expect(hitsTagged(c.drain(), 'a3-mimic').length).toBe(0);
  });

  it('지난 턴에 쓴 기술은 흉내 내지 않는다 (이번 턴만)', () => {
    const { c, e } = fight('a3-boss-shoggoth');
    const s = e('shoggoth');
    c.useSkill('weapon', s.uid);
    c.endTurn();
    c.p.sanity = c.p.maxSanity = 100;
    c.drain();
    act(c, s, 'copy');
    expect(hitsTagged(c.drain(), 'a3-mimic').length).toBe(0);
    expect(c.p.sanity).toBeLessThan(100);
  });

  it('원형질이 절반·사분의 일에서 떨어져 나올 때 화면 안쪽에서 유리를 짚고, 울음을 적는다', () => {
    const { c, e } = fight('a3-boss-shoggoth');
    const s = e('shoggoth');
    c.drain();
    c.damage({ src: c.p, tgt: s, base: Math.ceil(s.maxHp * 0.8), type: 'true', attack: true });
    const evs = c.drain();
    expect(cines(evs, 'handprints').length).toBe(1);
    expect(cines(evs, 'scrawl').length).toBe(1);
  });
});

describe('각도의 왕 — 열린 각', () => {
  it('유리를 그을 때마다 각이 열리고(최대 3) 화면에 금이 간다', () => {
    const { c, e } = fight('a3-boss-king');
    const k = e('angle-king');
    expect(cines(c.events, 'whisper').length).toBe(1);
    for (let i = 0; i < MAX_ANGLES + 1; i++) act(c, k, 'carve');
    expect(c.p.st[ANGLE]).toBe(MAX_ANGLES);
    expect(c.s.vars['ui:cracks']).toBe(MAX_ANGLES);
    expect(cines(c.drain(), 'crack').length).toBe(MAX_ANGLES);
  });

  it('턴이 끝날 때 남은 각마다 문다. 방어도가 충분하면 하나를 회반죽으로 메운다', () => {
    const bites = (block: number) => {
      const { c, e } = fight('a3-boss-king');
      const k = e('angle-king');
      act(c, k, 'carve');
      act(c, k, 'carve');
      c.p.block = block;
      c.drain();
      c.endTurn();
      return { c, hits: hitsTagged(c.drain(), 'a3-angle') };
    };
    const open = bites(0);
    expect(open.hits.length).toBe(2);
    for (const h of open.hits) expect(h.amount).toBe(ANGLE_BITE);
    const plastered = bites(PLASTER);
    expect(plastered.hits.length).toBe(1);
    expect(plastered.hits[0].blocked).toBe(ANGLE_BITE);
    expect(plastered.c.p.st[ANGLE] ?? 0).toBe(1);
  });

  it('각도의 왕을 붕괴시키면 모든 각이 닫히고 금이 사라진다', () => {
    const { c, e } = fight('a3-boss-king');
    const k = e('angle-king');
    act(c, k, 'carve');
    act(c, k, 'carve');
    c.breakEnemy(k);
    expect(c.p.st[ANGLE] ?? 0).toBe(0);
    expect(c.s.vars['ui:cracks'] ?? 0).toBe(0);
  });

  it('후열로 숨어 각도가 비틀리면 화면이 기울고, 돌아오면 바로 선다', () => {
    const { c, e } = fight('a3-boss-king');
    const k = e('angle-king');
    act(c, k, 'twist');
    expect(k.row).toBe(1);
    expect(c.s.vars['ui:tilt']).toBe(TILT);
    act(c, k, 'twist');
    expect(k.row).toBe(0);
    expect(c.s.vars['ui:tilt'] ?? 0).toBe(0);
  });

  it('새끼들은 화면 모서리에서 튀어나오고, 필살기는 화면을 깨뜨린다', () => {
    const def = ENEMIES.get('angle-king')!;
    expect(def.moves.whelp.cine).toBe('corners');
    expect(def.moves.rend.ultimate).toBe(true);
    expect(def.moves.rend.cine).toBe('shatter');
  });
});

describe('산맥 너머의 것 — 보는 것과 보지 않는 것', () => {
  it('증기가 걷히면 경고(처음 한 번)와 함께 화면이 어두워지고, 드러나면 눈이 지켜본다', () => {
    const { c, e } = fight('a3-boss-peaks');
    const b = e('beyond-peaks');
    act(c, b, 'unveil');
    expect(cines(c.drain(), 'sysmsg').map((x) => x.text)).toEqual(['화면 밝기를 낮추십시오.']);
    expect(c.s.vars['ui:dark']).toBe(DIM_UNVEIL);
    act(c, b, 'unveil');
    expect(cines(c.drain(), 'sysmsg').length).toBe(0);
    act(c, b, 'truth');
    expect(b.st[REVEALED]).toBe(REVEAL_TURNS);
    expect(c.s.vars['ui:eye']).toBe(1);
    expect(ENEMIES.get('beyond-peaks')!.moves.truth.ultimate).toBe(true);
  });

  it('드러난 동안 받는 피해 +50%, 대신 공격하는 기술마다 정신력을 잃는다 (방어 기술은 괜찮다)', () => {
    const { c, e } = fight('a3-boss-peaks');
    const b = e('beyond-peaks');
    const before = c.preview(c.p, b, 20, 'fire');
    act(c, b, 'truth');
    expect(c.preview(c.p, b, 20, 'fire')).toBe(Math.floor(before * 1.5));
    c.p.sanity = c.p.maxSanity = 100;
    c.useSkill('armor');
    expect(c.p.sanity).toBe(100);
    c.useSkill('weapon', b.uid);
    const lost = 100 - c.p.sanity;
    expect(lost).toBeGreaterThan(0);
    // 다른 기술로 또 보면 또 잃는다
    c.useSkill('weapon', b.uid);
    expect(100 - c.p.sanity).toBe(lost * 2);
  });

  it('당신의 턴 두 번이 지나면 다시 가려지고, 처음 한 번은 당신의 선택에 대해 말을 건다', () => {
    const { c, e } = fight('a3-boss-peaks');
    const b = e('beyond-peaks');
    act(c, b, 'truth');
    c.endTurn();
    expect(b.st[REVEALED]).toBe(REVEAL_TURNS);
    c.endTurn();
    expect(b.st[REVEALED]).toBe(1);
    c.drain();
    c.endTurn();
    expect(b.st[REVEALED] ?? 0).toBe(0);
    expect(c.s.vars['ui:eye'] ?? 0).toBe(0);
    expect(c.s.vars['ui:dark'] ?? 0).toBe(0);
    const w = cines(c.drain(), 'whisper');
    expect(w.length).toBe(1);
    expect(w[0].text).toContain('{time}');
    expect(w[0].text).toContain('보지 않았다');
  });

  it('증기가 걷히는 중에 붕괴시키면 다시 가려진다 (어두워진 화면도 돌아온다)', () => {
    const { c, e } = fight('a3-boss-peaks');
    const b = e('beyond-peaks');
    act(c, b, 'unveil');
    b.poise = 1;
    c.damage({ src: c.p, tgt: b, base: 5, type: 'fire', attack: true });
    expect(b.broken).toBe(2);
    expect(b.mem.charge).toBeUndefined();
    expect(c.s.vars['ui:dark'] ?? 0).toBe(0);
  });
});

describe('깨어난 원로 — 멈춘 칼날, 끊긴 피리', () => {
  it('멈춘 칼날 다섯: 원로를 때리는 기술마다 하나를 쳐내고, 남은 칼날은 턴이 끝날 때 꽂힌다', () => {
    const { c, e } = fight('lord-a3');
    const el = e('awakened-elder');
    const th = e('shoggoth-thrall');
    act(c, el, 'stillness');
    expect(c.p.st[BLADES]).toBe(BLADE_N);
    c.useSkill('weapon', el.uid);
    expect(c.p.st[BLADES]).toBe(BLADE_N - 1);
    // 노예를 때려서는 쳐낼 수 없다
    c.useSkill('weapon', th.uid);
    expect(c.p.st[BLADES]).toBe(BLADE_N - 1);
    c.p.block = 0;
    c.drain();
    c.endTurn();
    const hits = hitsTagged(c.drain(), 'a3-blades');
    expect(hits.length).toBe(BLADE_N - 1);
    for (const h of hits) expect(h.amount).toBe(BLADE_DMG);
    expect(c.p.st[BLADES] ?? 0).toBe(0);
  });

  it('원로를 붕괴시키면 피리 소리가 끊겨 노예가 반란을 일으킨다 (체력이 많아도)', () => {
    const { c, e } = fight('lord-a3');
    const el = e('awakened-elder');
    const th = e('shoggoth-thrall');
    el.poise = 1;
    c.drain();
    c.damage({ src: c.p, tgt: el, base: 5, type: 'fire', attack: true });
    expect(el.broken).toBe(2);
    expect(el.hp / el.maxHp).toBeGreaterThan(0.5);
    expect(th.mem.rebel).toBe(1);
    expect(th.intent?.move).toBe('revolt');
    expect(cines(c.drain(), 'scrawl').length).toBe(1);
  });

  it('처음 수억 년의 기억을 쏟아낼 때 한 번, 화면 너머로 말을 건다', () => {
    const { c, e } = fight('lord-a3');
    const el = e('awakened-elder');
    c.drain();
    act(c, el, 'memory');
    act(c, el, 'memory');
    expect(cines(c.drain(), 'whisper').length).toBe(1);
    const def = ENEMIES.get('awakened-elder')!;
    expect(def.moves.stillness.cine).toBe('timestop');
    expect(def.moves.starfall.ultimate).toBe(true);
  });
});

describe('렝의 대거미 — 몸속의 알', () => {
  it('알을 심으면 내 턴이 두 번 끝난 뒤 부화한다 (방어도 무시 피해 + 새끼 거미)', () => {
    const { c, e } = fight('a3-broodmother');
    const m = e('leng-broodmother');
    act(c, m, 'implant');
    expect(c.p.st[EGGS]).toBe(EGG_TURNS);
    c.endTurn();
    expect(c.p.st[EGGS]).toBe(EGG_TURNS - 1);
    c.p.block = 50;
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(c.p.st[EGGS] ?? 0).toBe(0);
    const hatch = hitsTagged(evs, 'a3-hatch');
    expect(hatch.length).toBe(1);
    expect(hatch[0].hpLoss).toBe(HATCH_DMG);
    expect(evs.some((ev) => ev.t === 'spawn')).toBe(true);
    expect(cines(evs, 'swarm').length).toBe(1);
  });

  it('회복하거나, 불에 닿거나, 화염 기술을 쓰거나, 어미를 쓰러뜨리면 알이 죽는다', () => {
    const heal = fight('a3-broodmother');
    act(heal.c, heal.e('leng-broodmother'), 'implant');
    heal.c.heal(heal.c.p, 3);
    expect(heal.c.p.st[EGGS] ?? 0).toBe(0);

    const burn = fight('a3-broodmother');
    const m = burn.e('leng-broodmother');
    act(burn.c, m, 'implant');
    burn.c.damage({ src: m, tgt: burn.c.p, base: 2, type: 'fire', attack: true });
    expect(burn.c.p.st[EGGS] ?? 0).toBe(0);

    const kill = fight('a3-broodmother');
    const m2 = kill.e('leng-broodmother');
    act(kill.c, m2, 'implant');
    kill.c.kill(m2);
    expect(kill.c.p.st[EGGS] ?? 0).toBe(0);
  });

  it('이미 알이 있으면 또 심지 않는다 (대신 독)', () => {
    const { c, e } = fight('a3-broodmother');
    const m = e('leng-broodmother');
    act(c, m, 'implant');
    act(c, m, 'implant');
    expect(c.p.st[EGGS]).toBe(EGG_TURNS);
    expect(c.p.st.poison ?? 0).toBeGreaterThan(0);
  });
});

describe('샨탁 — 하늘로 채어 간다', () => {
  it('샨탁에게 충분히 피해를 주면 빠져나와 떨어지지 않는다', () => {
    const { c, e } = fight('a3-shantak');
    const sh = e('shantak');
    act(c, sh, 'carry');
    expect(c.p.st[ALOFT]).toBe(ESCAPE_DMG);
    // (관통은 탄띠의 조준으로 치명타가 나므로 타격으로)
    const d = c.damage({ src: c.p, tgt: sh, base: 5, type: 'blunt', attack: true });
    expect(c.p.st[ALOFT]).toBe(ESCAPE_DMG - d.amount);
    c.damage({ src: c.p, tgt: sh, base: 5, type: 'blunt', attack: true });
    expect(c.p.st[ALOFT] ?? 0).toBe(0);
    c.drain();
    c.endTurn();
    expect(hitsTagged(c.drain(), 'a3-fall').length).toBe(0);
  });

  it('빠져나오지 못하면 턴이 끝날 때 떨어진다 — 피해(방어도가 막는다)와 다음 턴 행동력 -1', () => {
    const { c, e } = fight('a3-shantak');
    const sh = e('shantak');
    act(c, sh, 'carry');
    c.p.block = 0;
    c.drain();
    c.endTurn();
    const fall = hitsTagged(c.drain(), 'a3-fall');
    expect(fall.length).toBe(1);
    expect(fall[0].amount).toBe(FALL_DMG);
    expect(c.p.st[ALOFT] ?? 0).toBe(0);
    expect(c.s.ap).toBe(c.p.maxAp - 1);
    const def = ENEMIES.get('shantak')!;
    expect(def.moves.carry.cine).toBe('flip');
    expect(def.moves.dive.ultimate).toBe(true);
  });
});

describe('고대인 해부학자 — 절개선', () => {
  it('절개선마다 생체 해부가 세지고 (의도에 그대로 보인다), 회복하면 아물어 의도도 줄어든다', () => {
    const { c, e } = fight('a3-vivisector');
    const v = e('elder-vivisector');
    c.drain();
    act(c, v, 'incise');
    expect(c.p.st[INCISION]).toBe(INCISE_N);
    expect(cines(c.drain(), 'scrawl').map((x) => x.text)).toEqual(['여기를 자른다']);
    force(c, v, 'table');
    expect(v.intent?.dmg).toBe(VIVISECT_BASE + CUT_DMG * INCISE_N);
    c.heal(c.p, 1);
    expect(c.p.st[INCISION] ?? 0).toBe(0);
    expect(v.intent?.dmg).toBe(VIVISECT_BASE);
  });

  it('생체 해부가 절개선을 모두 벌려 없앤다', () => {
    const { c, e } = fight('a3-vivisector');
    const v = e('elder-vivisector');
    act(c, v, 'incise');
    const pv = c.preview(v, c.p, VIVISECT_BASE + CUT_DMG * INCISE_N, 'blunt');
    c.drain();
    act(c, v, 'vivisect');
    const hit = c.drain().filter((ev) => ev.t === 'dmg' && ev.src === v.uid && ev.tgt === 'p') as { amount: number }[];
    expect(hit.length).toBe(1);
    expect(hit[0].amount).toBe(pv);
    expect(c.p.st[INCISION] ?? 0).toBe(0);
    expect(ENEMIES.get('elder-vivisector')!.moves.vivisect.ultimate).toBe(true);
  });
});

describe('프나스의 돌 — 얼음 밑의 속임수', () => {
  it('아가리는 통찰이 모자라면 방어로 보인다 (봇도 속는다). 통찰 5면 진짜가 보인다', () => {
    const { c, e } = fight('stalker-a3');
    const d = e('dhole');
    force(c, d, 'maw');
    c.p.insight = 0;
    const fake = c.shownIntent(d)!;
    expect(fake.kind).toBe('block');
    expect(fake.label).toBe('얼음 밑에서 웅크린다');
    expect(incoming(c)).toBe(0);
    c.p.insight = 5;
    expect(c.shownIntent(d)!.kind).toBe('attack');
    expect(incoming(c)).toBeGreaterThan(0);
  });

  it('얼음 밑에서는 땅울림(읽을 수 없음)이나 아가리(속임수)를 고르고, 그다음 솟구칠 준비를 한다', () => {
    const { c, e } = fight('stalker-a3');
    const d = e('dhole');
    const def = ENEMIES.get('dhole')!;
    d.mem.under = 1;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      d.hist = ['burrow'];
      seen.add(def.ai(c, d));
    }
    expect([...seen].sort()).toEqual(['maw', 'tremor']);
    d.hist = ['burrow', 'maw'];
    expect(def.ai(c, d)).toBe('rise');
  });

  it('분출은 얼음이 깨지듯 화면 유리에 금이 가는 필살기다', () => {
    const { c, e } = fight('stalker-a3');
    const d = e('dhole');
    d.mem.charge = 1;
    c.drain();
    act(c, d, 'erupt');
    const crack = cines(c.drain(), 'crack');
    expect(crack.length).toBe(1);
    expect(crack[0].n).toBe(3);
    expect(ENEMIES.get('dhole')!.moves.erupt.ultimate).toBe(true);
  });
});

describe('시간에 얼어붙은 탐사대장 — 멈춘 시간', () => {
  it('시간이 멈춘 동안 공격 피해는 쌓이기만 하고, 내 턴이 두 번 끝나면 한꺼번에 터진다 (방어도가 막는다)', () => {
    const { c, e } = fight('rift-a3');
    const l = e('frozen-leader');
    const pv = c.preview(l, c.p, 10, 'slash');
    c.drain();
    act(c, l, 'stop');
    expect(c.p.st[STOPPED]).toBe(STOP_TURNS);
    expect(cines(c.drain(), 'whisper').length).toBe(1);
    // 의도 미리보기도 0 (지금은 들어오지 않는다)
    expect(c.preview(l, c.p, 10, 'slash')).toBe(0);
    const hp = c.p.hp;
    c.damage({ src: l, tgt: c.p, base: 10, type: 'slash', attack: true });
    expect(c.p.hp).toBe(hp);
    expect(c.p.st[WOUNDS]).toBe(pv);
    c.endTurn();
    expect(c.p.st[STOPPED]).toBe(1);
    const stored = c.p.st[WOUNDS] ?? 0;
    expect(stored).toBeGreaterThanOrEqual(pv);
    c.p.block = 5;
    c.drain();
    c.endTurn();
    const burst = hitsTagged(c.drain(), 'a3-wounds');
    expect(burst.length).toBe(1);
    expect(burst[0].amount).toBe(stored);
    expect(burst[0].blocked).toBe(5);
    expect(c.p.st[STOPPED] ?? 0).toBe(0);
    expect(c.p.st[WOUNDS] ?? 0).toBe(0);
  });

  it('탐사대장을 붕괴시키면 멈춘 시계가 부서져 쌓인 상처가 사라진다', () => {
    const { c, e } = fight('rift-a3');
    const l = e('frozen-leader');
    act(c, l, 'stop');
    c.damage({ src: l, tgt: c.p, base: 20, type: 'slash', attack: true });
    expect(c.p.st[WOUNDS] ?? 0).toBeGreaterThan(0);
    c.drain();
    c.breakEnemy(l);
    expect(c.p.st[STOPPED] ?? 0).toBe(0);
    expect(c.p.st[WOUNDS] ?? 0).toBe(0);
    expect(cines(c.drain(), 'shatter').length).toBe(1);
    // 다음 턴 끝에도 터질 상처가 없다
    c.drain();
    c.endTurn();
    expect(hitsTagged(c.drain(), 'a3-wounds').length).toBe(0);
  });
});

describe('3층 정예·수호자 — 연출과 봇', () => {
  const BOSSES = ['a3-boss-shoggoth', 'a3-boss-king', 'a3-boss-peaks', 'lord-a3'];
  const ELITES = ['a3-broodmother', 'a3-shantak', 'a3-vivisector', 'stalker-a3', 'rift-a3'];
  /** 화면 너머의 플레이어에게 말을 거는 연출 */
  const FOURTH_WALL = ['whisper', 'sysmsg', 'scrawl', 'handprints', 'fakeover'];

  function play(enc: string, seed: number) {
    const run = floor3(seed);
    const c = startCombat(run, enc, { anomaly: null });
    const evs: CombatEvent[] = [...c.drain()];
    let n = 0;
    while (!c.over && n++ < 300) {
      autoTurn(c);
      evs.push(...c.drain());
    }
    return { run, c, evs };
  }

  it('수호자마다 필살기가 있고, 제4의 벽 연출은 한 전투에 1~4번 (가짜 게임오버는 없다)', () => {
    for (const enc of BOSSES) {
      const { c, evs } = play(enc, 303);
      expect(c.s.phase, enc).toBe('victory');
      const fw = cines(evs).filter((x) => FOURTH_WALL.includes(x.name));
      expect(fw.length, `${enc}: ${fw.map((x) => x.name).join(',')}`).toBeGreaterThanOrEqual(1);
      expect(fw.length, `${enc}: ${fw.map((x) => x.name).join(',')}`).toBeLessThanOrEqual(4);
      expect(fw.some((x) => x.name === 'fakeover'), enc).toBe(false);
    }
    for (const id of ['shoggoth', 'angle-king', 'beyond-peaks', 'awakened-elder', 'leng-broodmother', 'shantak', 'elder-vivisector', 'dhole', 'frozen-leader']) {
      const moves = Object.values(ENEMIES.get(id)!.moves);
      expect(moves.some((m) => m.ultimate), id).toBe(true);
    }
  });

  it('새 패턴이 있는 정예·수호자 조우를 봇이 여러 시드에서 이기고 보상을 받는다', () => {
    for (const enc of [...BOSSES, ...ELITES]) {
      for (const seed of [11, 42, 2026]) {
        const { run, c } = play(enc, seed);
        expect(c.s.phase, `${enc} #${seed}`).toBe('victory');
        expect(finishCombat(run), `${enc} #${seed}`).not.toBeNull();
      }
    }
  });

  it('새 상태는 전투 도중 저장했다 불러와도 그대로 이어진다 (JSON)', () => {
    for (const enc of [...BOSSES, ...ELITES]) {
      const run = floor3(7);
      let c = startCombat(run, enc, { anomaly: null });
      for (let i = 0; i < 4 && !c.over; i++) autoTurn(c);
      const saved: RunState = JSON.parse(JSON.stringify(run));
      expect(saved.combat, enc).toEqual(run.combat);
      c = new Combat(saved);
      let n = 0;
      while (!c.over && n++ < 300) autoTurn(c);
      expect(c.s.phase, enc).toBe('victory');
    }
  });
});
