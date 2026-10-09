import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, DISGUISE_REVEAL, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, SKILLS } from '../src/engine/registry';
import { finishCombat, newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { autoTurn, incoming } from '../src/sim/bot';
import type { DmgType, EnemyUnit, MoveDef } from '../src/engine/types';
import { DEPTH } from '../src/content/depth';
import { CALLED, END_BLOCK, FROST, HEIGHT, TORN, TORN_LOSS, WATCH } from '../src/content/act3/common';
import { FROZEN_ROOM } from '../src/content/act3/anomalies';
import {
  BLAST_DMG,
  CALL_DMG,
  DISSOLVE_AT,
  DIVE_DMG,
  FREEZE_DMG,
  FREEZE_FROST,
  GORE_DMG,
  INHALE_AT,
  PERCH_MAX,
  PERCH_STEP,
  RIME_BLOCK,
  STOMP_MAX,
  SUTURE_HEAL,
  TORN_N,
  VENOM_POISON,
} from '../src/content/act3/enemies';
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
  EGG_LINK_DMG,
  ESCAPE_HITS,
  FALL_DMG,
  FULL,
  FULL_BLOCK,
  FULL_DMG,
  FULL_GAP,
  FULL_MAX,
  HATCH_DMG,
  HUNT,
  HUNT_BITE_PCT,
  HUNT_DMG,
  HUNT_GAP,
  INCISE_N,
  INCISION,
  MAX_ANGLES,
  MAX_INCISION,
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
    s.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게 (버팀이 남은 적은 절반만 받는다)
    s.mem.agOff = 1; // 가호(한 턴 피해 상한)도
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

describe('각도의 왕 — 틴달로스의 사냥 (막아야 하는 큰 위협)', () => {
  const WAIT = { move: '_wait', kind: 'unknown' as const, label: '관망' };

  /** 세 각을 모두 연 뒤 3턴째를 시작한다 — 2턴째가 끝날 때 사냥을 부른다 (왕이 다른 것을 하지 않게 관망시킨다) */
  function hunted(seed = 303) {
    const { c, e } = fight('a3-boss-king', seed);
    const k = e('angle-king');
    for (let i = 0; i < MAX_ANGLES; i++) act(c, k, 'carve');
    // 1턴째 끝: 초반이라 아직 부르지 않는다
    c.p.block = 999;
    c.endTurn();
    expect(k.intent?.move).not.toBe('hunt');
    expect(c.s.obj ?? null).toBeNull();
    // 회반죽으로 하나 메워졌으니 다시 연다
    act(c, k, 'carve');
    expect(c.p.st[ANGLE]).toBe(MAX_ANGLES);
    k.intent = { ...WAIT };
    c.drain();
    c.endTurn();
    return { c, k };
  }

  it('세 각이 모두 열리면 다음 차례에 사냥을 부른다 — 내 턴이 시작될 때 이미 큰 공격 의도와 호박색 목표 띠가 보인다 (즉사가 아니다, 처음엔 경고 창)', () => {
    const { c, k } = hunted();
    expect(c.s.turn).toBe(3);
    expect(c.s.phase).toBe('player');
    expect(k.intent?.kind).toBe('charge');
    expect(k.intent?.label).toBe(HUNT);
    expect(c.s.obj?.block).toBe(PLASTER);
    expect(c.s.obj?.break).toBe(k.uid);
    expect(c.s.obj?.lethal ?? false).toBe(false);
    expect(c.s.obj?.fail).toContain('30%');
    expect(c.s.obj?.text).toContain('1턴 남음');
    expect(c.s.obj?.text).not.toContain('즉사');
    expect(cines(c.drain(), 'sysmsg').length).toBe(1);
  });

  it('끊지 못하면 모서리마다 사냥개가 문다 — 최대 체력의 30%(방어도 무시)와 출혈, 체력이 충분하면 살아남고 모서리는 닫힌다', () => {
    const { c } = hunted();
    c.p.hp = c.p.maxHp = 100;
    // 회반죽에 모자란 방어도는 사냥개를 막지 못한다
    c.p.block = PLASTER - 1;
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(c.s.phase).toBe('player');
    expect(c.s.doom).toBeUndefined();
    expect(cines(evs, 'execute').length).toBe(0);
    const bites = hitsTagged(evs, 'a3-hunt');
    expect(bites.length).toBe(MAX_ANGLES);
    for (const b of bites) {
      expect(b.amount).toBe(Math.ceil(100 * HUNT_BITE_PCT));
      expect(b.blocked).toBe(0);
    }
    expect(bites.reduce((n, b) => n + b.hpLoss, 0)).toBe(30);
    expect(c.p.st.bleed ?? 0).toBeGreaterThan(0);
    expect(c.p.st[ANGLE] ?? 0).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
  });

  it('방어도 12 이상으로 턴을 마치면 각 하나가 메워져 사냥이 빗나간다 — 목표가 바로 지워지고, 왕은 그 차례를 잃는다', () => {
    const { c, k } = hunted();
    c.p.block = 0;
    for (let i = 0; i < 3; i++) c.useSkill('armor');
    expect(c.p.block).toBeGreaterThanOrEqual(PLASTER);
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(c.s.phase).toBe('player');
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[ANGLE]).toBe(MAX_ANGLES - 1);
    expect(evs.some((ev) => ev.t === 'move' && ev.uid === k.uid && ev.move === 'lost')).toBe(true);
    expect(hitsTagged(evs, 'a3-hunt').length).toBe(0);
    // 사냥이 끝난 뒤 곧바로 다시 세 각을 열어도 한동안은 부르지 않는다
    act(c, k, 'carve');
    c.planIntent(k);
    expect(k.intent?.move).not.toBe('hunt');
    c.s.turn += HUNT_GAP;
    c.planIntent(k);
    expect(k.intent?.move).toBe('hunt');
  });

  it('왕에게 피해를 채워도 끊긴다 — 맞을 때마다 목표 띠의 남은 피해가 줄고, 다 채우면 그 차례의 사냥이 헛돈다', () => {
    const { c, k } = hunted();
    expect(c.s.obj?.hit).toEqual({ uid: k.uid, need: HUNT_DMG });
    c.damage({ src: c.p, tgt: k, base: 2, type: 'true', attack: true });
    expect(c.s.obj?.hit?.need).toBe(HUNT_DMG - 2);
    expect(c.s.obj?.text).toContain(`피해 ${HUNT_DMG - 2}`);
    c.damage({ src: c.p, tgt: k, base: HUNT_DMG, type: 'true', attack: true });
    expect(c.s.obj ?? null).toBeNull();
    expect(k.intent?.move).toBe('lost');
    // 세 각은 그대로 열려 있지만 이번 사냥은 끝났다
    expect(c.p.st[ANGLE]).toBe(MAX_ANGLES);
    c.p.block = 0;
    c.drain();
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(hitsTagged(c.drain(), 'a3-hunt').length).toBe(0);
  });

  it('왕을 붕괴시켜도 빗나간다 (모든 각이 닫힌다)', () => {
    const { c, k } = hunted();
    c.breakEnemy(k);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[ANGLE] ?? 0).toBe(0);
    c.p.block = 0;
    c.endTurn();
    expect(c.s.phase).toBe('player');
  });

  it('체력이 모자라면 사냥개에 물려 보통 피해처럼 사경에 든다 (곧바로 죽지는 않는다)', () => {
    const { c } = hunted();
    c.p.maxHp = 100;
    c.p.hp = 20;
    c.p.sanity = c.p.maxSanity = 100;
    c.p.block = 0;
    c.endTurn();
    expect(c.s.doom).toBeUndefined();
    expect(c.s.phase).toBe('player');
    expect(c.p.st.dying).toBe(1);
  });

  it('체력이 절반 아래로 떨어지면 남은 모서리를 한꺼번에 열고, 그다음 차례에 사냥을 부른다', () => {
    const { c, e } = fight('a3-boss-king');
    const k = e('angle-king');
    k.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게
    k.mem.agOff = 1; // 가호(한 턴 피해 상한)도 걷는다
    c.damage({ src: c.p, tgt: k, base: Math.ceil(k.maxHp * 0.6), type: 'true', attack: true });
    k.intent = { ...WAIT };
    c.endTurn();
    // 1턴째 끝: 초반에는 열지 않는다
    expect(k.intent?.move).not.toBe('flood');
    k.intent = { ...WAIT };
    c.endTurn();
    expect(k.intent?.move).toBe('flood');
    c.p.block = 0;
    c.drain();
    c.endTurn();
    expect(c.p.st[ANGLE]).toBe(MAX_ANGLES);
    expect(k.intent?.move).toBe('hunt');
    expect(c.s.obj?.block).toBe(PLASTER);
  });

  it('사냥이 걸린 채로 저장했다 불러와도 그대로 이어진다', () => {
    const { c } = hunted();
    const saved: RunState = JSON.parse(JSON.stringify(c.run));
    const c2 = new Combat(saved);
    const k2 = c2.alive.find((x) => x.def === 'angle-king')!;
    expect(k2.intent?.move).toBe('hunt');
    expect(c2.s.obj?.block).toBe(PLASTER);
    c2.p.block = 0;
    c2.endTurn();
    expect(c2.s.phase).toBe('player');
    expect(hitsTagged(c2.drain(), 'a3-hunt').length).toBe(MAX_ANGLES);
  });

  it('봇은 목표 띠를 보고 사냥을 푼다 (방어도로 모서리를 메운다)', () => {
    for (const seed of [303, 11, 42]) {
      const { c } = hunted(seed);
      c.p.block = 0;
      autoTurn(c);
      expect(c.s.phase, `#${seed}`).not.toBe('defeat');
      expect(c.s.obj ?? null, `#${seed}`).toBeNull();
      let n = 0;
      while (!c.over && n++ < 300) autoTurn(c);
      expect(c.s.phase, `#${seed}`).toBe('victory');
    }
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
  it('샨탁을 공격으로 세 번 맞히면 빠져나와 떨어지지 않는다 (피해량이 아니라 맞힌 횟수 — 회피당한 공격은 세지 않는다)', () => {
    const { c, e } = fight('a3-shantak');
    const sh = e('shantak');
    act(c, sh, 'carry');
    expect(c.p.st[ALOFT]).toBe(ESCAPE_HITS);
    c.damage({ src: c.p, tgt: sh, base: 1, type: 'slash', attack: true });
    expect(c.p.st[ALOFT]).toBe(ESCAPE_HITS - 1);
    // 회피당한 공격은 세지 않는다
    sh.st.evasive = 1;
    c.damage({ src: c.p, tgt: sh, base: 9, type: 'slash', attack: true });
    expect(c.p.st[ALOFT]).toBe(ESCAPE_HITS - 1);
    // 공격이 아닌 피해(가시·지속 피해 등)도 세지 않는다
    c.damage({ src: c.p, tgt: sh, base: 9, type: 'true' });
    expect(c.p.st[ALOFT]).toBe(ESCAPE_HITS - 1);
    for (let i = 1; i < ESCAPE_HITS; i++) c.damage({ src: c.p, tgt: sh, base: 1, type: 'slash', attack: true });
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

describe('고대인 해부학자 — 완전 해부 (즉사 퍼즐)', () => {
  const WAIT = { move: '_wait', kind: 'unknown' as const, label: '관망' };

  /** 절개선 넷을 긋고, 2턴째가 끝날 때 해부대를 펼치려다 완전 해부를 건다 → 3턴째 시작 */
  function dissected(run: RunState = floor3()) {
    const c = startCombat(run, 'a3-vivisector', { anomaly: null });
    const v = c.alive.find((x) => x.def === 'elder-vivisector')!;
    delete c.p.st.ward;
    act(c, v, 'incise');
    act(c, v, 'incise');
    expect(c.p.st[INCISION]).toBe(MAX_INCISION);
    c.p.block = 0;
    c.endTurn();
    v.intent = { ...WAIT };
    v.mem.ci = 4;
    c.p.block = 0;
    c.drain();
    c.endTurn();
    return { c, v };
  }

  it('절개선이 다 그어진 채로 해부대를 펼치려 하면 완전 해부를 건다 — 내 턴이 시작될 때 이미 해골과 붉은 띠 (처음엔 속삭임), 내 턴 두 번', () => {
    const { c, v } = dissected();
    expect(c.s.turn).toBe(3);
    expect(v.intent?.kind).toBe('death');
    expect(v.intent?.move).toBe('opentable');
    expect(c.s.obj?.lethal).toBe(true);
    expect(c.s.obj?.hit).toEqual({ uid: v.uid, need: FULL_DMG });
    expect(c.s.obj?.block).toBe(FULL_BLOCK);
    expect(c.s.obj?.break).toBe(v.uid);
    expect(c.s.obj?.text).toContain('2턴 남음');
    expect(cines(c.drain(), 'whisper').length).toBe(1);
    c.endTurn();
    expect(v.intent?.move).toBe('fullcut');
    expect(v.intent?.kind).toBe('death');
    expect(c.s.obj?.text).toContain('1턴 남음');
  });

  it('막지 못하면 사경 없이 죽는다', () => {
    const { c } = dissected();
    c.endTurn();
    c.endTurn();
    expect(c.s.phase).toBe('defeat');
    expect(c.s.doom).toBe(FULL);
  });

  it('해부학자에게 피해 18을 채우면 막힌다 — 띠의 남은 피해가 줄고(지속 피해도 센다), 절개선이 아물고, 해부학자는 다시 의도를 정한다', () => {
    const { c, v } = dissected();
    c.damage({ src: c.p, tgt: v, base: 5, type: 'true', attack: true });
    expect(c.s.obj?.hit?.need).toBe(FULL_DMG - 5);
    c.endTurn();
    expect(c.s.obj).toBeTruthy();
    // 출혈은 해부학자의 차례가 시작될 때 들어간다 — 완전 해부보다 먼저
    c.apply(v, 'bleed', FULL_DMG, c.p);
    c.endTurn();
    expect(c.s.obj ?? null).toBeNull();
    expect(c.s.doom).toBeUndefined();
    expect(c.s.phase).toBe('player');
    expect(c.p.st[INCISION] ?? 0).toBe(0);
    expect(v.intent?.kind).not.toBe('death');
  });

  it('방어도 12 이상으로 턴을 마치면 막힌다 — 그 차례에는 메스를 거둔다', () => {
    const { c, v } = dissected();
    c.p.block = 0;
    for (let i = 0; i < 3; i++) c.useSkill('armor');
    expect(c.p.block).toBeGreaterThanOrEqual(FULL_BLOCK);
    c.drain();
    c.endTurn();
    const evs = c.drain();
    expect(c.s.phase).toBe('player');
    expect(c.s.obj ?? null).toBeNull();
    expect(evs.some((ev) => ev.t === 'move' && ev.uid === v.uid && ev.move === 'withdraw')).toBe(true);
    expect(v.intent?.kind).not.toBe('death');
  });

  it('체력을 회복하면 절개선이 아물어 막히고, 붕괴시켜도 막힌다', () => {
    const a = dissected();
    a.c.heal(a.c.p, 1);
    expect(a.c.s.obj ?? null).toBeNull();
    expect(a.v.intent?.kind).not.toBe('death');
    a.c.endTurn();
    a.c.endTurn();
    expect(a.c.s.phase).toBe('player');

    const b = dissected();
    b.v.poise = 1;
    b.c.damage({ src: b.c.p, tgt: b.v, base: 1, type: 'pierce', attack: true });
    expect(b.v.broken).toBe(2);
    expect(b.c.s.obj ?? null).toBeNull();
    b.c.endTurn();
    b.c.endTurn();
    expect(b.c.s.phase).toBe('player');
  });

  it('결계가 한 번 막는다 — 절개선이 아물고 싸움이 이어진다', () => {
    const { c } = dissected();
    c.endTurn();
    c.p.st.ward = 1;
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.s.doom).toBeUndefined();
    expect(c.p.st.ward ?? 0).toBe(0);
    expect(c.p.st[INCISION] ?? 0).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
  });

  it('2턴째가 끝나기 전에는 걸지 않고, 끝난 뒤 3턴은 다시 걸지 않으며, 전투마다 두 번까지', () => {
    const { c, e } = fight('a3-vivisector');
    const v = e('elder-vivisector');
    const def = ENEMIES.get('elder-vivisector')!;
    delete c.p.st.ward;
    act(c, v, 'incise');
    act(c, v, 'incise');
    v.mem.turns = 1;
    v.mem.ci = 4;
    // 1턴째: 아직 초반
    expect(def.ai(c, v)).toBe('table');
    for (let k = 0; k < FULL_MAX; k++) {
      c.s.turn = 10 + k * 10;
      c.apply(c.p, INCISION, MAX_INCISION, v);
      v.mem.ci = 4;
      expect(def.ai(c, v), `#${k}`).toBe('opentable');
      c.heal(c.p, 1);
      expect(v.mem.full ?? 0).toBe(0);
      // 막힌 직후에는 다시 걸지 않는다
      c.apply(c.p, INCISION, MAX_INCISION, v);
      v.mem.ci = 4;
      c.s.turn += FULL_GAP - 1;
      expect(def.ai(c, v)).toBe('table');
      c.clear(c.p, INCISION);
    }
    // 두 번 걸었으면 더는 걸지 않는다
    c.s.turn = 99;
    c.apply(c.p, INCISION, MAX_INCISION, v);
    v.mem.ci = 4;
    expect(def.ai(c, v)).toBe('table');
  });

  it('완전 해부가 걸린 채로 저장했다 불러와도 그대로 이어진다', () => {
    const { c } = dissected();
    const saved: RunState = JSON.parse(JSON.stringify(c.run));
    const c2 = new Combat(saved);
    const v2 = c2.alive.find((x) => x.def === 'elder-vivisector')!;
    expect(v2.intent?.move).toBe('opentable');
    expect(c2.s.obj?.lethal).toBe(true);
    c2.endTurn();
    c2.endTurn();
    expect(c2.s.doom).toBe(FULL);
  });

  it('봇은 붉은 띠를 보고 완전 해부를 막고 이긴다 (시드 여럿)', () => {
    for (const seed of [303, 11, 42]) {
      const { c } = dissected(floor3(seed));
      let n = 0;
      while (!c.over && n++ < 300) autoTurn(c);
      expect(c.s.doom, `#${seed}`).toBeUndefined();
      expect(c.s.phase, `#${seed}`).toBe('victory');
    }
  });
});

describe('프나스의 돌 — 얼음 밑의 속임수', () => {
  it(`아가리는 통찰이 모자라면 방어로 보인다 (봇도 속는다). 통찰 ${DISGUISE_REVEAL}이면 진짜가 보인다`, () => {
    const { c, e } = fight('stalker-a3');
    const d = e('dhole');
    force(c, d, 'maw');
    c.p.insight = 0;
    const fake = c.shownIntent(d)!;
    expect(fake.kind).toBe('block');
    expect(fake.label).toBe('얼음 밑에서 웅크린다');
    expect(incoming(c)).toBe(0);
    c.p.insight = DISGUISE_REVEAL - 1;
    expect(c.shownIntent(d)!.kind).toBe('block');
    c.p.insight = DISGUISE_REVEAL;
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

describe('3층 기믹의 출신 간 공정성 — 시작 덱으로', () => {
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

  /** 근접 기본 공격만 남긴 사냥꾼 (화염 플라스크도 빼고) */
  function meleeOnly(seed = 303): RunState {
    const run = kit3('hunter', seed);
    run.slots = run.slots.map((uid) => {
      const owned = run.skills.find((x) => x.uid === uid);
      return owned && SKILLS.get(owned.id)?.range === 'melee' ? uid : null;
    });
    return run;
  }

  /** 세 각을 열고 3턴째에 틴달로스의 사냥이 걸린 상태로 (twist면 왕이 후열에 숨은 채로). 오컬트 학자의 낡은 성서 결계는 먼저 걷어 낸다 */
  function huntWith(run: RunState, twist = false) {
    const c = startCombat(run, 'a3-boss-king', { anomaly: null });
    const k = c.alive.find((x) => x.def === 'angle-king')!;
    delete c.p.st.ward;
    if (twist) act(c, k, 'twist');
    for (let i = 0; i < MAX_ANGLES; i++) act(c, k, 'carve');
    c.p.block = 999;
    c.endTurn();
    act(c, k, 'carve');
    k.intent = { move: '_wait', kind: 'unknown', label: '관망' };
    c.endTurn();
    expect(k.intent?.move, run.origin).toBe('hunt');
    return { c, k };
  }

  it('어느 출신이든 방어구 기본기만으로 회반죽(방어도 12)에 닿는다', () => {
    for (const origin of ORIGINS) {
      const c = startCombat(kit3(origin), 'a3-boss-king', { anomaly: null });
      while (!c.blockReason('armor')) c.useSkill('armor');
      expect(c.p.block, origin).toBeGreaterThanOrEqual(PLASTER);
    }
  });

  it('어느 출신이든 시작 덱으로 틴달로스의 사냥을 봇이 끊는다 (체력 105, 사냥개에게 물리지 않는다)', () => {
    for (const origin of ORIGINS) {
      for (const seed of [303, 11, 42, 2026]) {
        const { c } = huntWith(kit3(origin, seed));
        c.drain();
        autoTurn(c);
        expect(hitsTagged(c.drain(), 'a3-hunt').length, `${origin} #${seed}`).toBe(0);
        expect(c.s.phase, `${origin} #${seed}`).toBe('player');
        expect(c.s.obj ?? null, `${origin} #${seed}`).toBeNull();
      }
    }
  });

  it('근접 공격만 가진 덱도 후열에 숨은 각도의 왕을 사냥 중에는 칠 수 있고(사냥 중엔 숨지 못한다), 사냥을 끊는다', () => {
    const run = meleeOnly();
    const { c, k } = huntWith(run, true);
    expect(k.row).toBe(1);
    expect(c.row(0).length).toBeGreaterThan(0);
    const knife = SKILLS.get('w-knife')!;
    expect(c.validTargets(knife).map((x) => x.uid)).toContain(k.uid);
    // 숨어 있어도 사냥하는 동안에는 피해가 줄지 않는다 (버팀 배율은 빼고 비교한다)
    const bare = (x: typeof k) => {
      const p = x.poise;
      x.poise = 0;
      const n = c.preview(c.p, x, 10, 'slash');
      x.poise = p;
      return n;
    };
    expect(bare(k)).toBe(bare(c.row(0)[0]));
    c.drain();
    autoTurn(c);
    expect(hitsTagged(c.drain(), 'a3-hunt').length).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
    // 사냥이 끝나면 다시 근접으로는 닿지 않는다
    expect(c.validTargets(knife).map((x) => x.uid)).not.toContain(k.uid);
    // 근접만으로도 끝까지 이긴다 (쓰러지지 않는 몸으로)
    const sturdy = meleeOnly(11);
    sturdy.player.maxHp = sturdy.player.hp = 9999;
    sturdy.player.sanity = sturdy.player.maxSanity = 9999;
    const c2 = startCombat(sturdy, 'a3-boss-king', { anomaly: null });
    let n = 0;
    while (!c2.over && n++ < 300) autoTurn(c2);
    expect(c2.s.phase).toBe('victory');
  });

  it('어느 출신이든 무기 기본 공격만으로 두 턴 안에 몸속의 알을 죽인다 (어미에게 피해 20)', () => {
    for (const origin of ORIGINS) {
      const c = startCombat(kit3(origin, 303, true), 'a3-broodmother', { anomaly: null });
      const m = c.alive.find((x) => x.def === 'leng-broodmother')!;
      act(c, m, 'implant');
      c.drain();
      for (let turn = 0; turn < EGG_TURNS && (c.p.st[EGGS] ?? 0) > 0; turn++) {
        while (!c.blockReason('weapon') && (c.p.st[EGGS] ?? 0) > 0) c.useSkill('weapon', m.uid);
        m.intent = { move: '_wait', kind: 'unknown', label: '관망' };
        c.endTurn();
      }
      expect(c.p.st[EGGS] ?? 0, origin).toBe(0);
      expect(hitsTagged(c.drain(), 'a3-hatch').length, origin).toBe(0);
    }
    // 피해를 덜 주면 부화한다 (알이 있는 동안 센 피해만)
    const c = startCombat(kit3('soldier', 303, true), 'a3-broodmother', { anomaly: null });
    const m = c.alive.find((x) => x.def === 'leng-broodmother')!;
    act(c, m, 'implant');
    c.damage({ src: c.p, tgt: m, base: EGG_LINK_DMG - 1, type: 'true', attack: true });
    expect(c.p.st[EGGS]).toBe(EGG_TURNS);
    c.damage({ src: c.p, tgt: m, base: 1, type: 'true', attack: true });
    expect(c.p.st[EGGS] ?? 0).toBe(0);
  });

  it('어느 출신이든 무기 기본 공격 셋으로 샨탁의 발톱에서 빠져나온다 (참격에 강해도)', () => {
    for (const origin of ORIGINS) {
      const c = startCombat(kit3(origin), 'a3-shantak', { anomaly: null });
      const sh = c.alive.find((x) => x.def === 'shantak')!;
      act(c, sh, 'carry');
      for (let i = 0; i < ESCAPE_HITS; i++) expect(c.useSkill('weapon', sh.uid), origin).toBeNull();
      expect(c.p.st[ALOFT] ?? 0, origin).toBe(0);
    }
  });

  it('깨어난 원로는 늘 전열에 있어 어느 출신이든 칼날을 쳐낼 수 있다', () => {
    for (const origin of ORIGINS) {
      const c = startCombat(kit3(origin), 'lord-a3', { anomaly: null });
      const el = c.alive.find((x) => x.def === 'awakened-elder')!;
      expect(el.row, origin).toBe(0);
      delete c.p.st.ward;
      act(c, el, 'stillness');
      expect(c.useSkill('weapon', el.uid), origin).toBeNull();
      expect(c.p.st[BLADES], origin).toBe(BLADE_N - 1);
    }
  });

  /** 완전 해부가 걸린 3턴째 (그 출신의 시작 덱) */
  function fullWith(run: RunState) {
    const c = startCombat(run, 'a3-vivisector', { anomaly: null });
    const v = c.alive.find((x) => x.def === 'elder-vivisector')!;
    delete c.p.st.ward;
    act(c, v, 'incise');
    act(c, v, 'incise');
    c.endTurn();
    v.intent = { move: '_wait', kind: 'unknown', label: '관망' };
    v.mem.ci = 4;
    c.endTurn();
    expect(v.intent?.kind, run.origin).toBe('death');
    return { c, v };
  }

  it('어느 출신이든 무기 기본 공격만으로 내 턴 두 번 안에 완전 해부를 막는다 (피해 18)', () => {
    for (const origin of ORIGINS) {
      const { c, v } = fullWith(kit3(origin, 303, true));
      for (let turn = 0; turn < 2 && c.s.obj; turn++) {
        while (!c.blockReason('weapon') && c.s.obj) c.useSkill('weapon', v.uid);
        c.p.block = 0;
        c.endTurn();
      }
      expect(c.s.doom, origin).toBeUndefined();
      expect(c.s.phase, origin).toBe('player');
    }
  });

  it('어느 출신이든 시작 덱으로 완전 해부를 봇이 막는다 (체력 105)', () => {
    for (const origin of ORIGINS) {
      for (const seed of [303, 11, 42, 2026]) {
        const { c } = fullWith(kit3(origin, seed));
        autoTurn(c);
        if (c.s.obj) autoTurn(c);
        expect(c.s.doom, `${origin} #${seed}`).toBeUndefined();
        expect(c.s.obj ?? null, `${origin} #${seed}`).toBeNull();
      }
    }
  });

  it('쇼고스가 떼어 낸 원형질 조각은 후열로 밀려나도 근접으로 끊어 낼 수 있다', () => {
    const c = startCombat(meleeOnly(), 'a3-boss-shoggoth', { anomaly: null });
    const s = c.alive.find((x) => x.def === 'shoggoth')!;
    s.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게
    s.mem.agOff = 1; // 가호(한 턴 피해 상한)도
    c.damage({ src: c.p, tgt: s, base: Math.ceil(s.maxHp * 0.55), type: 'true', attack: true });
    const blobs = c.alive.filter((x) => x.def === 'shoggoth-blob');
    expect(blobs.length).toBe(4);
    const back = blobs.filter((x) => x.row === 1);
    expect(back.length).toBeGreaterThan(0);
    const knife = SKILLS.get('w-knife')!;
    const reach = c.validTargets(knife).map((x) => x.uid);
    for (const b of back) expect(reach).toContain(b.uid);
    // 평범한 원형질 조각(쇼고스 유충이 갈라진 것)은 그대로 전열만
    const c2 = startCombat(meleeOnly(), 'a3-spawn-pair', { anomaly: null });
    const extra = c2.spawn('shoggoth-blob', 1)!;
    expect(c2.validTargets(knife).map((x) => x.uid)).not.toContain(extra.uid);
  });

  it('어느 출신이든 시작 덱으로 3층의 정예·수호자를 봇이 이긴다 — 즉사로 끝나는 판이 없다', () => {
    const encs = ['a3-boss-shoggoth', 'a3-boss-king', 'a3-boss-peaks', 'lord-a3', 'a3-broodmother', 'a3-shantak', 'a3-vivisector', 'stalker-a3', 'rift-a3'];
    const lost: string[] = [];
    for (const origin of ORIGINS) {
      for (const enc of encs) {
        const c = startCombat(kit3(origin, 77, true), enc, { anomaly: null });
        let n = 0;
        while (!c.over && n++ < 300) autoTurn(c);
        if (c.s.phase !== 'victory') lost.push(`${origin} ${enc}: ${c.s.phase} ${c.s.doom ?? ''} ${c.s.turn}턴`);
      }
    }
    expect(lost).toEqual([]);
  });
});

/*
 * 3층 일반 적 패턴 (2026-10): 낮은 층은 위협을 늘리지 않고 갈래만 늘린다.
 * 반응하는 의도(맞거나 누가 쓰러지면 그 자리에서 바뀌어 보인다)·상태를 읽는 AI·예고하고 끊을 수 있는 준비 동작마다 실제로 그렇게 움직이는지.
 */
describe('3층 일반 적 — 반응하는 패턴 (2026-10)', () => {
  // 장면이 변이에 흐려지지 않게 (3층 일반 적은 25%로 변이한다)
  let mutSaved: number[] = [];
  beforeEach(() => {
    mutSaved = DEPTH.mutNormal.slice();
    DEPTH.mutNormal.fill(0);
  });
  afterEach(() => {
    DEPTH.mutNormal.splice(0, DEPTH.mutNormal.length, ...mutSaved);
  });

  const WAIT = { move: '_wait', kind: 'unknown' as const, label: '관망' };
  /** 내 턴에 내 손으로 때린다 */
  const strike = (c: Combat, e: EnemyUnit, base: number, type: DmgType | 'true') => c.damage({ src: c.p, tgt: e, base, type, attack: true });
  /** 이 적의 AI가 n번 고른 행동들 */
  const picks = (c: Combat, e: EnemyUnit, n = 40) => {
    const out = new Set<string>();
    for (let i = 0; i < n; i++) {
      c.planIntent(e);
      out.add(e.intent!.move);
    }
    return out;
  };
  const all = (c: Combat, def: string) => c.alive.filter((x) => x.def === def);
  /** keep 말고는 이번 차례에 쉬게 하고 턴을 넘긴다 */
  const endWith = (c: Combat, keep: EnemyUnit[] = []) => {
    for (const x of c.alive) if (!keep.includes(x)) x.intent = { ...WAIT };
    c.endTurn();
  };

  it('밤의 마귀: 앞에 동료가 버티면 후열에서 탑 끝에 매달려 높이를 쌓는다 (최대 8) — 급강하는 그만큼 세지고 (의도 숫자 그대로), 덮치면 높이가 사라진다', () => {
    const { c } = fight('a3-e-gaunts');
    const [front, back] = all(c, 'nightgaunt');
    c.moveRow(back, 1);
    expect(picks(c, back).has('perch')).toBe(true);
    act(c, back, 'perch');
    expect(back.st.evasive).toBe(1);
    expect(back.st[HEIGHT]).toBe(PERCH_STEP);
    for (let i = 0; i < 3; i++) act(c, back, 'perch');
    expect(back.st[HEIGHT]).toBe(PERCH_MAX);
    // 높이가 다 찼으면 곧장 덮친다
    c.planIntent(back);
    expect(back.intent?.move).toBe('dive');
    expect(back.intent?.dmg).toBe(DIVE_DMG + PERCH_MAX);
    const shown = c.preview(back, c.p, back.intent!.dmg!, 'blunt');
    c.p.block = 0;
    const hp = c.p.hp;
    endWith(c, [back]);
    expect(hp - c.p.hp).toBe(shown);
    expect(back.st[HEIGHT] ?? 0).toBe(0);
    expect(back.row).toBe(0);
    expect(front.dead).toBe(false);
  });

  it('밤의 마귀: 내 공격에 맞으면 탑 끝에서 미끄러져 높이를 잃는다 (회피로 흘린 공격은 빼고) — 의도의 피해도 다시 센다', () => {
    const { c } = fight('a3-e-gaunts');
    const back = all(c, 'nightgaunt')[1];
    c.moveRow(back, 1);
    act(c, back, 'perch');
    force(c, back, 'dive');
    expect(back.intent?.dmg).toBe(DIVE_DMG + PERCH_STEP);
    strike(c, back, 5, 'blunt');
    expect(back.st.evasive ?? 0).toBe(0);
    expect(back.st[HEIGHT]).toBe(PERCH_STEP);
    strike(c, back, 5, 'blunt');
    expect(back.st[HEIGHT] ?? 0).toBe(0);
    expect(back.intent?.dmg).toBe(DIVE_DMG);
  });

  it('밤의 마귀: 약점(화염·관통)에 맞으면 움찔해 숨긴 의도가 드러나고, 낚아채 오르려던 날개는 찢겨 움켜쥐기가 된다', () => {
    const { c, e } = fight('a3-e-gaunts');
    const g = e('nightgaunt');
    force(c, g, 'lift');
    expect(g.intent?.hidden).toBe(true);
    strike(c, g, 3, 'blunt');
    expect(g.intent?.move).toBe('lift');
    strike(c, g, 3, 'pierce');
    expect(g.intent?.move).toBe('clutch');
    expect(g.intent?.hidden).toBe(false);
    // 다음에 의도를 정하면 다시 가려진다
    c.planIntent(g);
    expect(g.intent?.hidden).toBe(true);
  });

  it('밤의 마귀: 앞에 버티는 동료가 없으면 매달리지 않고 곧장 덮친다', () => {
    const { c } = fight('a3-e-gaunts');
    const [front, back] = all(c, 'nightgaunt');
    c.moveRow(back, 1);
    c.kill(front);
    expect([...picks(c, back)]).toEqual(['dive']);
  });

  it('유고스의 균류: 냉기 분사는 동상 1을 남기고, 발파 장치를 박으면 다음 차례에 광맥 발파 (예고한 피해 그대로, 동상 2)', () => {
    const { c, e } = fight('a3-e-migo');
    const m = e('migo');
    act(c, m, 'mist');
    expect(c.p.st[FROST]).toBe(1);
    act(c, m, 'rig');
    expect(m.mem.charge).toBe(1);
    c.planIntent(m);
    expect(m.intent?.move).toBe('blast');
    expect(m.intent?.dmg).toBe(BLAST_DMG);
    const shown = c.preview(m, c.p, BLAST_DMG, 'blunt');
    c.p.block = 0;
    const hp = c.p.hp;
    endWith(c, [m]);
    expect(hp - c.p.hp).toBe(shown);
    expect(c.p.st[FROST]).toBe(3);
    expect(m.mem.charge).toBeUndefined();
  });

  it('유고스의 균류: 장치를 박은 사이 약점(타격·비전)으로 치면 장치가 꺼진다 — 붕괴하지 않아도. 약점이 아니면 그대로 터진다', () => {
    const { c, e } = fight('a3-e-migo');
    const m = e('migo');
    act(c, m, 'rig');
    c.planIntent(m);
    strike(c, m, 2, 'slash');
    expect(m.intent?.move).toBe('blast');
    strike(c, m, 2, 'arcane');
    expect(m.broken).toBe(0);
    expect(m.mem.charge).toBeUndefined();
    expect(m.intent?.move).toBe('fizzle');
    expect(m.intent?.kind).toBe('block');
  });

  it('유고스의 균류: 쓰러질 듯한 동료를 한 번 꿰맨다 (체력 12, 출혈 제거) — 두 번은 하지 않는다', () => {
    const { c, e } = fight('a3-e-migo');
    const m = e('migo');
    const g = e('nightgaunt');
    expect(picks(c, m).has('suture')).toBe(false);
    g.hp = Math.floor(g.maxHp * 0.3);
    c.apply(g, 'bleed', 3, c.p);
    expect(picks(c, m).has('suture')).toBe(true);
    const hp = g.hp;
    act(c, m, 'suture');
    expect(g.hp).toBe(hp + SUTURE_HEAL);
    expect(g.st.bleed ?? 0).toBe(0);
    expect(picks(c, m).has('suture')).toBe(false);
  });

  it('각도의 사냥개: 후열(각도 속)에서 내 공격에 맞으면 냄새를 쫓아 그 차례에 덮친다 — 의도가 바로 바뀌어 보인다', () => {
    const { c, e } = fight('a3-hound-spawn');
    const h = e('tindalos');
    expect(h.row).toBe(1);
    force(c, h, 'lurk');
    strike(c, h, 3, 'slash');
    expect(h.intent?.move).toBe('pounce');
    expect(h.intent?.kind).toBe('attack');
  });

  it('각도의 사냥개: 각도 속에서 붕괴하면 각도 밖(전열)으로 굴러떨어진다', () => {
    const { c, e } = fight('a3-hound-spawn');
    const h = e('tindalos');
    h.poise = 1;
    strike(c, h, 2, 'arcane');
    expect(h.broken).toBe(2);
    expect(h.row).toBe(0);
  });

  it('각도의 사냥개: 피를 흘리는 상대는 물고 늘어진다 (부식 1) — 피가 없으면 고르지 않는다', () => {
    const { c, e } = fight('a3-hound-spawn');
    const h = e('tindalos');
    c.moveRow(h, 0);
    h.hist = ['pounce'];
    expect(picks(c, h).has('maul')).toBe(false);
    c.apply(c.p, 'bleed', 3);
    expect(picks(c, h).has('maul')).toBe(true);
    act(c, h, 'maul');
    expect(c.p.st.corrode).toBe(1);
  });

  it('쇼고스 유충: 내가 지난 턴을 방어도 10 이상으로 마치면 녹여 삼키기를 노린다 — 방어도를 절반 녹이고 덮친다', () => {
    const { c, e } = fight('a3-e-spawn');
    const s = e('shoggoth-spawn');
    expect(c.p.st[WATCH]).toBe(1);
    expect(picks(c, s).has('dissolve')).toBe(false);
    c.p.block = DISSOLVE_AT + 4;
    endWith(c);
    expect(c.s.vars[END_BLOCK]).toBe(DISSOLVE_AT + 4);
    expect(picks(c, s).has('dissolve')).toBe(true);
    // 방어도 20: 절반(10)이 녹은 뒤에 맞는다
    c.p.block = 20;
    const amt = c.preview(s, c.p, 9, 'blunt');
    const hp = c.p.hp;
    act(c, s, 'dissolve');
    expect(c.p.hp).toBe(hp - Math.max(0, amt - 10));
    expect(c.p.block).toBe(Math.max(0, 10 - amt));
  });

  it('쇼고스 유충: 약점(화염·비전)에 맞은 턴에는 다시 빚지 못한다 — 재형성·흡수가 비명으로 바뀐다', () => {
    const { c, e } = fight('a3-e-spawn');
    const s = e('shoggoth-spawn');
    force(c, s, 'reform');
    strike(c, s, 3, 'slash');
    expect(s.intent?.move).toBe('reform');
    strike(c, s, 3, 'fire');
    expect(s.intent?.move).toBe('tekeli');
    expect(s.intent?.kind).toBe('horror');
  });

  it('렝의 거미: 새끼 거미가 내 손에 쓰러지면 그 차례에 분노한 독액을 뱉는다. 서릿실 거미줄은 동상도 남긴다', () => {
    const { c, e } = fight('a3-e-spider');
    const sp = e('leng-spider');
    const kid = c.spawn('leng-spiderling', 0)!;
    force(c, sp, 'web');
    strike(c, kid, 999, 'slash');
    expect(kid.dead).toBe(true);
    expect(sp.intent?.move).toBe('venom');
    act(c, sp, 'venom');
    expect(c.p.st.poison).toBe(VENOM_POISON);
    act(c, sp, 'web');
    expect(c.p.st[FROST]).toBe(1);
    expect(c.p.st.weak).toBe(1);
  });

  it('렝의 거미: 처음 절반 아래로 떨어질 때 곁에 새끼가 없으면 알주머니를 찢는다 — 새끼가 있으면 찢지 않는다', () => {
    const { c, e } = fight('a3-e-spider');
    const sp = e('leng-spider');
    sp.poise = 0;
    force(c, sp, 'spit');
    strike(c, sp, Math.ceil(sp.maxHp * 0.6), 'true');
    expect(sp.intent?.move).toBe('brood');
    const { c: c2, e: e2 } = fight('a3-e-spider');
    const sp2 = e2('leng-spider');
    c2.spawn('leng-spiderling', 0);
    sp2.poise = 0;
    force(c2, sp2, 'spit');
    strike(c2, sp2, Math.ceil(sp2.maxHp * 0.6), 'true');
    expect(sp2.intent?.move).toBe('spit');
  });

  it('눈먼 펭귄: 얼음판 발 구르기는 살아 있는 펭귄 수만큼 동상 (최대 3) — 무리에서 한 차례에 하나만 구르고, 혼자면 구르지 않는다', () => {
    const { c } = fight('a3-rookery');
    const ps = all(c, 'blind-penguin');
    act(c, ps[0], 'stomp');
    expect(c.p.st[FROST]).toBe(STOMP_MAX);
    force(c, ps[0], 'stomp');
    expect(picks(c, ps[1], 60).has('stomp')).toBe(false);
    const { c: c2 } = fight('a3-gnoph-penguins');
    const solo = c2.alive.find((x) => x.def === 'blind-penguin')!;
    expect(picks(c2, solo, 60).has('stomp')).toBe(false);
  });

  it('눈먼 펭귄: 하나가 처음 내 손에 쓰러지면 남은 펭귄 하나가 놀라 울부짖는다 — 그 뒤로는 놀라지 않는다', () => {
    const { c } = fight('a3-rookery');
    const ps = all(c, 'blind-penguin');
    for (const p of ps) force(c, p, 'peck');
    strike(c, ps[0], 9999, 'true');
    expect(ps.slice(1).filter((p) => p.intent?.move === 'cry').length).toBe(1);
    endWith(c);
    for (const p of c.alive) force(c, p, 'peck');
    strike(c, c.alive[0], 9999, 'true');
    expect(c.alive.every((p) => p.intent?.move === 'peck')).toBe(true);
  });

  it('동사한 탐사대원: 휘파람을 불면 썰매개의 다음 공격 피해 +4 (의도 숫자에도 보인다) — 겹쳐 불어도 늘지 않고, 개의 차례가 끝나면 사라진다', () => {
    const { c, e } = fight('a3-e-explorer');
    const ex = e('frozen-explorer');
    const dog = e('sled-dog');
    const boosted = c.preview(dog, c.p, 9 + CALL_DMG, 'blunt');
    act(c, ex, 'whistle');
    act(c, ex, 'whistle');
    expect(dog.st[CALLED]).toBe(CALL_DMG);
    expect(c.preview(dog, c.p, 9, 'blunt')).toBe(boosted);
    force(c, dog, 'bite');
    c.p.block = 0;
    c.drain();
    endWith(c, [dog]);
    const bites = c.drain().filter((x): x is Extract<CombatEvent, { t: 'dmg' }> => x.t === 'dmg' && x.src === dog.uid && x.tgt === 'p');
    expect(bites.map((x) => x.amount)).toEqual([boosted]);
    expect(dog.st[CALLED] ?? 0).toBe(0);
  });

  it('동사한 탐사대원: 다시 일어선 몸은 조명탄을 쏘지 못하고 얼어붙은 손아귀로 동상을 건다 (일어서자마자 의도를 다시 정한다)', () => {
    const { c, e } = fight('a3-e-explorer');
    const ex = e('frozen-explorer');
    force(c, ex, 'flare');
    strike(c, ex, 9999, 'slash');
    expect(ex.dead).toBe(false);
    expect(ex.intent?.move).not.toBe('flare');
    const ms = picks(c, ex, 60);
    expect(ms.has('flare')).toBe(false);
    expect(ms.has('grip')).toBe(true);
    act(c, ex, 'grip');
    expect(c.p.st[FROST]).toBe(2);
  });

  it('서리 망령: 동상이 3 이상인 상대 앞에서 숨을 들이쉬고, 다음 차례에 얼려 버리는 숨 (예고 그대로, 동상 3) — 들이쉬는 동안 붕괴시키면 끊긴다', () => {
    const { c, e } = fight('a3-frostbitten');
    const w = e('frost-wraith');
    expect(picks(c, w).has('inhale')).toBe(false);
    c.apply(c.p, FROST, INHALE_AT);
    expect(picks(c, w).has('inhale')).toBe(true);
    act(c, w, 'inhale');
    c.planIntent(w);
    expect(w.intent?.move).toBe('freeze');
    expect(w.intent?.dmg).toBe(FREEZE_DMG);
    act(c, w, 'freeze');
    expect(c.p.st[FROST]).toBe(INHALE_AT + FREEZE_FROST);
    act(c, w, 'inhale');
    expect(w.mem.charge).toBe(1);
    c.breakEnemy(w);
    expect(w.mem.charge).toBeUndefined();
  });

  it('서리 망령: 앞에 선 동료에게 얼음 껍질(방어도 10)을 입힌다', () => {
    const { c, e } = fight('a3-frostbitten');
    const ex = e('frozen-explorer');
    act(c, e('frost-wraith'), 'rime');
    expect(ex.block).toBe(RIME_BLOCK);
  });

  it('고대인 사냥꾼: 붕괴하면 쥐고 있던 표본을 떨어뜨린다 (기술을 되찾는다) — 일어나면 한 번 더 노리고, 그 뒤로는 노리지 않는다', () => {
    const { c, e } = fight('a3-hunters');
    const h = e('elder-hunter');
    h.mem.tried = 1;
    act(c, h, 'collect');
    const uid = c.run.slots[h.mem.specimen - 1]!;
    expect(c.s.cd[uid]).toBe(99);
    h.poise = 1;
    strike(c, h, 2, 'pierce');
    expect(h.broken).toBe(2);
    expect(h.mem.specimen).toBe(0);
    expect(c.s.cd[uid]).toBeUndefined();
    c.restorePoise(h);
    expect(picks(c, h).has('collect')).toBe(true);
    act(c, h, 'collect');
    expect(h.mem.specimen).toBeGreaterThan(0);
    h.poise = 1;
    strike(c, h, 2, 'pierce');
    expect(h.mem.specimen).toBe(0);
    c.restorePoise(h);
    expect(picks(c, h).has('collect')).toBe(false);
  });

  it('고대인 사냥꾼: 표본을 쥔 채 3분의 1 아래로 떨어지면 날아갈 채비를 한 차례 앞서 보이고, 막지 못하면 날아가 버린다 — 기술은 이 전투가 끝날 때까지 잠긴 채', () => {
    const { c, e } = fight('a3-hunters');
    const h = e('elder-hunter');
    h.mem.tried = 1;
    act(c, h, 'collect');
    const uid = c.run.slots[h.mem.specimen - 1]!;
    h.hp = Math.floor(h.maxHp * 0.3);
    c.planIntent(h);
    expect(h.intent?.move).toBe('escape');
    expect(h.intent?.kind).toBe('flee');
    endWith(c, [h]);
    expect(h.fled).toBe(true);
    expect(c.s.cd[uid]).toBeGreaterThan(90);
  });

  it('그노프케: 화염에 맞으면 불길을 덮으려 그 차례에 눈보라를 부른다', () => {
    const { c, e } = fight('a3-gnoph-penguins');
    const g = e('gnoph-keh');
    force(c, g, 'horn');
    strike(c, g, 3, 'slash');
    expect(g.intent?.move).toBe('horn');
    strike(c, g, 3, 'fire');
    expect(g.intent?.move).toBe('blizzard');
  });

  it('그노프케: 체력이 절반 아래거나 상대의 동상이 3 이상이면 뿔을 낮추고, 다음 차례에 얼음을 가르는 돌진 (예고 그대로) — 붕괴시키면 끊긴다', () => {
    const { c, e } = fight('a3-gnoph-penguins');
    const g = e('gnoph-keh');
    expect(picks(c, g).has('lower')).toBe(false);
    c.apply(c.p, FROST, 3);
    expect(picks(c, g).has('lower')).toBe(true);
    c.clear(c.p, FROST);
    g.hp = Math.floor(g.maxHp * 0.4);
    expect(picks(c, g).has('lower')).toBe(true);
    act(c, g, 'lower');
    c.planIntent(g);
    expect(g.intent?.move).toBe('gore');
    expect(g.intent?.dmg).toBe(GORE_DMG);
    c.breakEnemy(g);
    expect(g.mem.charge).toBeUndefined();
  });

  it('해부된 썰매개: 무리 지어 몰아붙이기는 다른 썰매개 하나마다 한 번 더 문다 — 무리가 줄면 의도의 횟수도 준다', () => {
    const { c } = fight('a3-e-dogs');
    const [a, b] = all(c, 'sled-dog');
    force(c, a, 'harry');
    expect(a.intent?.hits).toBe(2);
    c.kill(b);
    expect(a.intent?.hits).toBe(1);
    expect(picks(c, a).has('harry')).toBe(false);
  });

  it(`해부된 썰매개: 체력이 처음 절반 아래로 떨어지면 실밥이 터진다 — 공격 피해 +${TORN_N} (의도 숫자에도), 자기 차례가 끝날 때마다 체력 ${TORN_LOSS}`, () => {
    const { c } = fight('a3-e-dogs');
    const [a] = all(c, 'sled-dog');
    const boosted = c.preview(a, c.p, 9 + TORN_N, 'blunt');
    a.poise = 0;
    strike(c, a, Math.ceil(a.maxHp * 0.6), 'true');
    expect(a.st[TORN]).toBe(TORN_N);
    expect(c.preview(a, c.p, 9, 'blunt')).toBe(boosted);
    const hp = a.hp;
    endWith(c);
    expect(a.hp).toBe(hp - TORN_LOSS);
    expect(picks(c, a).has('howl')).toBe(false);
  });

  it('얼어붙은 방에서 얼음 속에 갇힌 적은 첫 차례에 반응하지 않는다', () => {
    const c = startCombat(floor3(), 'a3-hound-spawn', { anomaly: FROZEN_ROOM });
    const h = c.alive.find((x) => x.def === 'tindalos')!;
    expect(h.intent?.kind).toBe('sleep');
    strike(c, h, 3, 'slash');
    expect(h.intent?.kind).toBe('sleep');
  });

  it('3층 일반 조우: 새 상태를 지닌 채 저장했다 불러와도 이어지고 (JSON), 봇이 끝까지 이긴다', () => {
    for (const enc of ENCOUNTERS.filter((x) => x.act === 3 && x.kind === 'normal')) {
      const run = floor3(19);
      let c = startCombat(run, enc.id, { anomaly: null });
      c.snapshots = false;
      for (let i = 0; i < 2 && !c.over; i++) autoTurn(c);
      const saved: RunState = JSON.parse(JSON.stringify(run));
      expect(saved.combat, enc.id).toEqual(run.combat);
      c = new Combat(saved);
      c.snapshots = false;
      let n = 0;
      while (!c.over && n++ < 300) autoTurn(c);
      expect(c.s.phase, enc.id).toBe('victory');
    }
  });

  it('출신 셋의 시작 덱(3층 기준: 체력 148·힘 4·행동력 4)으로 3층 일반 조우를 봇이 모두 이긴다', () => {
    const lost: string[] = [];
    for (const enc of ENCOUNTERS.filter((x) => x.act === 3 && x.kind === 'normal')) {
      for (const origin of ['soldier', 'hunter', 'occultist']) {
        const run = newRun({ seed: 5, origin });
        run.act = 3;
        run.floor = generateFloor(run, 3);
        run.player.level = 6;
        run.player.maxHp = run.player.hp = 148;
        run.player.str = 4;
        run.player.maxAp = 4;
        run.light = 100;
        const c = startCombat(run, enc.id, { anomaly: null });
        c.snapshots = false;
        let n = 0;
        while (!c.over && n++ < 100) autoTurn(c);
        if (c.s.phase !== 'victory') lost.push(`${enc.id} ${origin}: ${c.s.phase} ${c.s.turn}턴`);
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);
});
