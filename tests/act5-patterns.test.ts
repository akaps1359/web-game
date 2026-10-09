import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, SKILLS } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import type { CineName, EnemyUnit, MoveDef } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import { seized } from '../src/content/lib';
import {
  BIRTH_CHOICE,
  BIRTH_OPTIONS,
  CORD,
  CRY_BASE,
  CRY_TURNS,
  DREAMS,
  FETUS,
  FETUS_LINES,
  GAZE_SAN,
  GRASP_TURNS,
  LINK_MULT,
  LULL_MULT,
  LULL_SAN,
  LULL_TURNS,
  REDREAM_HP,
  SEVER_BLEED,
  SEVER_HP,
  SEVER_STR,
  SHELL_LAYERS,
  WAKE_CRY_TURNS,
} from '../src/content/act5/fetus';
import {
  DIGEST_HEAL,
  FALSE_DOOR_SIGHT,
  FLIP_AT,
  GESTATION,
  HUSH_LIMIT,
  HUSH_STARS,
  HUSH_VULN,
  MAX_MEMORIES,
  MEMORY,
  SHADE,
  SHADE_TURNS,
} from '../src/content/act5/enemies';
import {
  BAKU,
  BAKU_RETCH_DREAD,
  BEAM_DMG,
  BRACE_BLOCK,
  BRACE_POISE,
  COVER_BLOCK,
  CRUSH_DMG,
  DEAD_STAR,
  DEVOTION,
  DEVOTION_BLESS,
  DEVOTION_MAX,
  DEVOTION_SHARD,
  DEVOUR_HEAL,
  DEVOUR_HEAT,
  EAT_HEAL,
  EAT_HEAL_MAX,
  FED,
  FEED_DMG,
  FURY_HITS,
  GORGE_MAX,
  GORGED,
  HEAT,
  HEAT_MAX,
  HOLD_VULN,
  HURRY_AT,
  HYMN_BARRIER,
  LAST_BEAM_DMG,
  LAST_LIGHT_AT,
  LIGHT_FAR,
  LIGHT_NEAR,
  LIGHT_STAGGER,
  NEAR_CRADLE,
  POUNCE_HITS,
  RALLIED,
  RELAPSE_AT,
  RELAPSE_HEAL,
  RELAPSE_TURNS,
  RETCH_BURN,
  SCENT,
  SCENT_AT,
  SIGNAL,
  STAR_FLARE,
  THREADS,
  TWIST_AT,
  TWIST_BASE,
  TWIST_PER,
  UNDERFOOT,
  ZOOG_FLEE_AT,
} from '../src/content/act5/patterns';
import { isAsleep, isIllusion, SNAP_POISE, uidNum } from '../src/content/act5/dream';
import { DEPTH } from '../src/content/depth';

/**
 * 5층 정예·수호자 패턴 확장 (2026-10): 새 메커니즘마다 동작을 확인하고, 5층의 모든 조우를 봇이 이기는지 본다.
 * 연출(cine/ui:)은 규칙에 영향이 없으니 '나오는가'만 본다.
 */

/** 5층에 서 있는 튼튼한 주인공 (퇴역 군인: 겨눠 쏘기·재장전·방패 강타·버티기) */
function floor5(seed = 515): RunState {
  const run = newRun({ seed, origin: 'soldier' });
  run.act = 5;
  run.floor = generateFloor(run, 5);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 16;
  run.player.maxAp = 4;
  run.player.insight = 0;
  run.light = 100;
  return run;
}

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((e) => e.def === def)!;

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

/** 적의 차례처럼 그 행동을 실행하고 내 차례로 돌아온다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
  c.s.phase = 'player';
}

/** 지금 단계를 끝낸다 (방어 무시 피해) */
function slay(c: Combat, e: EnemyUnit) {
  e.mem.agOff = 1; // 가호(한 턴 피해 상한)를 걷고 한 번에
  c.damage({ src: c.p, tgt: e, base: e.hp + e.block + 9999, type: 'true', ignoreBlock: true });
}

/** 약점 공격 한 번으로 붕괴시킨다 */
function breakIt(c: Combat, e: EnemyUnit) {
  e.poise = 1;
  c.damage({ src: c.p, tgt: e, base: 1, type: e.weak[0], attack: true });
}

const cines = (ev: CombatEvent[], name: CineName) => ev.filter((x): x is Extract<CombatEvent, { t: 'cine' }> => x.t === 'cine' && x.name === name);

/** 행동에 붙은 연출 이름 (문자열 또는 { name, n, text }) */
const cineOf = (m: MoveDef | undefined): string | undefined => (typeof m?.cine === 'string' ? m.cine : m?.cine?.name);

/** 장착한 기술 중 이 id의 uid */
const slotOf = (run: RunState, id: string): string => run.slots.find((uid) => run.skills.find((s) => s.uid === uid)?.id === id)!;

function fightToEnd(c: Combat) {
  let n = 0;
  while (!c.over && n++ < 300) autoTurn(c);
  return c;
}

describe('최종 수호자 별의 태아 — 꿈속의 죽음 (가짜 게임 오버)', () => {
  it('처음 마주치면 화면 너머의 당신에게 말을 건다 (지금 시각·출신)', () => {
    const c = startCombat(floor5(), 'a5-boss-fetus');
    const w = cines(c.drain(), 'whisper');
    expect(w.length).toBe(1);
    expect(w[0].text).toBe(FETUS_LINES.wake);
    expect(w[0].text).toContain('{time}');
    expect(w[0].text).toContain('{origin}');
  });

  it('꿈을 꾸는 동안 적의 일격에 처음 쓰러지면 꿈이었다 — 체력 30%로 깨어나고, 태아의 지금 모습과 꿈이 처음부터 다시 시작된다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = find(c, FETUS);
    c.endTurn();
    expect(c.s.anomaly).toBe(DREAMS[1]);
    c.p.maxHp = 100;
    c.p.hp = 5;
    c.p.block = 0;
    f.hp -= 120;
    c.drain();
    c.damage({ src: f, tgt: c.p, base: 80, type: 'blunt', attack: true });
    expect(c.dying).toBe(false);
    expect(c.over).toBe(false);
    expect(c.p.hp).toBe(Math.ceil(100 * REDREAM_HP));
    expect(f.hp).toBe(f.maxHp);
    expect(c.s.anomaly).toBe(DREAMS[0]);
    const ev = c.drain();
    // 가짜 게임 오버 — 화면이 깨지며 돌아온 뒤 태아가 속삭인다 (죽은 횟수)
    const over = cines(ev, 'fakeover');
    expect(over.length).toBe(1);
    expect(over[0].text).toBe(FETUS_LINES.redream);
    expect(FETUS_LINES.redream).toContain('{deaths}');
    // 가짜 게임 오버가 뜨는 순간 화면의 체력은 0이다 (그 뒤에 깨어난다)
    expect(over[0].snap?.p.hp ?? 1).toBeLessThanOrEqual(0);
    // 한 번뿐: 두 번째는 진짜 — 사경
    c.damage({ src: f, tgt: c.p, base: 999, type: 'blunt', attack: true });
    expect(c.dying).toBe(true);
    expect(cines(c.drain(), 'fakeover').length).toBe(0);
  });

  it('적의 차례에 쓰러지면 다음 내 턴이 첫 꿈이다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    c.endTurn();
    expect(c.s.anomaly).toBe(DREAMS[1]);
    // 다음 적의 차례: 태아가 태동(공격)한다
    const f = find(c, FETUS);
    force(c, f, 'kick');
    c.p.maxHp = 1000;
    c.p.hp = 1;
    c.p.block = 0;
    c.endTurn();
    expect(c.s.vars.a5Redream).toBe(1);
    expect(c.dying).toBe(false);
    expect(c.p.hp).toBeGreaterThan(0);
    expect(c.s.anomaly).toBe(DREAMS[0]);
  });

  it('스스로 치른 대가로 쓰러지거나 태어난 뒤 쓰러지면 꿈이 아니다', () => {
    const a = startCombat(floor5(), 'a5-boss-fetus');
    a.p.hp = 10;
    a.loseHp(a.p, 50);
    expect(a.dying).toBe(true);
    expect(a.s.vars.a5Redream).toBeUndefined();

    const b = startCombat(floor5(), 'a5-boss-fetus');
    const f = find(b, FETUS);
    slay(b, f);
    slay(b, f);
    expect(b.s.anomaly).toBeNull();
    b.p.hp = 10;
    b.damage({ src: f, tgt: b.p, base: 999, type: 'blunt', attack: true });
    expect(b.dying).toBe(true);
  });
});

describe('최종 수호자 별의 태아 — 쥐기 반사와 깨지는 화면', () => {
  it('태어난 것은 그 턴 마지막으로 쓴 기술을 쥐고, 붕괴시키면 놓는다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = find(c, FETUS);
    slay(c, f);
    slay(c, f);
    expect(f.form).toBe(2);
    expect(c.p.st['a5-finger']).toBe(1);
    const shot = slotOf(run, 'aimed-shot');
    expect(c.useSkill(shot, f.uid)).toBeNull();
    expect(c.s.vars.a5Finger).toBe(run.slots.indexOf(shot) + 1);
    expect(cineOf(c.moveDef(f, 'grasp'))).toBe('eye');
    const hp = c.p.hp;
    act(c, f, 'grasp');
    expect(c.p.hp).toBeLessThan(hp);
    expect(c.s.cd[shot]).toBeGreaterThanOrEqual(90);
    expect(seized(c, shot)).toBe(true);
    expect(c.blockReason(shot)).not.toBeNull();
    // 쥐고 있는 동안은 다시 쥐지 않는다 (순환의 '작은 손' 자리에 빛나는 공허)
    f.mem.cryAt = c.s.turn;
    f.mem.c3 = 1;
    expect(c.defOf(f).ai(c, f)).toBe('glare');
    breakIt(c, f);
    expect(f.mem.specimen).toBe(0);
    expect(c.s.cd[shot] ?? 0).toBeLessThan(90);
    expect(seized(c, shot)).toBe(false);
  });

  it('기본 공격·방어로 턴을 마치면 빈손을 쥔다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = find(c, FETUS);
    slay(c, f);
    slay(c, f);
    const shot = slotOf(run, 'aimed-shot');
    c.useSkill(shot, f.uid);
    c.useSkill('weapon', f.uid);
    expect(c.s.vars.a5Finger).toBe(0);
    act(c, f, 'grasp');
    expect(Object.values(c.s.cd).every((n) => n < 90)).toBe(true);
    expect(f.mem.specimen ?? 0).toBe(0);
  });

  it('손끝의 기억은 내 턴이 시작될 때 지워진다 (지난 턴의 기술을 쥐지 않는다)', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = find(c, FETUS);
    slay(c, f);
    slay(c, f);
    c.useSkill(slotOf(run, 'aimed-shot'), f.uid);
    expect(c.s.vars.a5Finger).toBeGreaterThan(0);
    c.endTurn();
    expect(c.s.vars.a5Finger).toBe(0);
  });

  it('껍질이 깨질수록 화면 유리가 갈라지고(ui:cracks 1→2→3), 태어나는 순간 산산조각 나며 눈이 지켜본다', () => {
    const c = startCombat(floor5(), 'a5-boss-fetus');
    const f = find(c, FETUS);
    c.drain();
    slay(c, f);
    let ev = c.drain();
    expect(c.s.vars['ui:cracks']).toBe(1);
    expect(cines(ev, 'glitch').length).toBe(1);
    const sys = cines(ev, 'sysmsg');
    expect(sys.length).toBe(1);
    expect(sys[0].text).toContain('{runs}');
    breakIt(c, f);
    ev = c.drain();
    expect(c.s.vars['ui:cracks']).toBe(2);
    expect(cines(ev, 'handprints').length).toBe(1);
    slay(c, f);
    ev = c.drain();
    expect(c.s.vars['ui:cracks']).toBe(3);
    expect(c.s.vars['ui:eye']).toBe(1);
    expect(cines(ev, 'shatter').length).toBe(1);
    expect(cines(ev, 'whisper').map((x) => x.text)).toContain(FETUS_LINES.born);
    // 끝: 다음 꿈에서 봐
    slay(c, f);
    ev = c.drain();
    expect(cines(ev, 'whisper').map((x) => x.text)).toContain(FETUS_LINES.end);
    expect(c.s.vars['ui:cracks'] ?? 0).toBe(0);
    expect(c.s.vars['ui:eye'] ?? 0).toBe(0);
  });

  it('필살기 연출: 펼쳐지는 몸·별자리가 터진다·탄생의 빛', () => {
    const c = startCombat(floor5(), 'a5-boss-fetus');
    const f = find(c, FETUS);
    for (const [id, cine] of [
      ['unfurl', 'impact'],
      ['burst', 'crack'],
      ['birthlight', 'beam'],
    ] as const) {
      const m = c.moveDef(f, id);
      expect(m.ultimate, id).toBe(true);
      expect(cineOf(m), id).toBe(cine);
    }
  });
});

describe('계층군주 꿈을 먹는 자 — 삼켜진 기억', () => {
  it('기억 포식: 기술 둘을 삼켜 그 이름을 단 하수인으로 붙들고, 화면의 기술 이름이 뒤섞인다', () => {
    const run = floor5();
    const c = startCombat(run, 'lord-a5');
    const eater = find(c, 'dream-eater');
    act(c, eater, 'feast');
    const mems = c.alive.filter((x) => x.def === MEMORY);
    expect(mems.length).toBe(MAX_MEMORIES);
    for (const m of mems) {
      const uid = run.slots[m.mem.specimen - 1]!;
      expect(c.s.cd[uid]).toBeGreaterThanOrEqual(90);
      expect(seized(c, uid)).toBe(true);
      const name = SKILLS.get(run.skills.find((s) => s.uid === uid)!.id)!.name;
      expect(m.name).toBe(`「${name}」`);
      expect(m.row).toBe(1);
    }
    expect(c.s.vars['ui:scramble']).toBe(1);
    // 붙든 기억이 가득하면 기억 대신 꿈을 먹는다
    eater.mem.ci = 2;
    expect(['devour', 'dreamfeed']).toContain(c.defOf(eater).ai(c, eater));
  });

  it('기억을 쓰러뜨리면 곧바로 되찾고, 그대로 두면 소화되어 꿈을 먹는 자가 회복하고 강해진다', () => {
    const run = floor5();
    const c = startCombat(run, 'lord-a5');
    const eater = find(c, 'dream-eater');
    act(c, eater, 'feast');
    const [m1, m2] = c.alive.filter((x) => x.def === MEMORY);
    const u1 = run.slots[m1.mem.specimen - 1]!;
    const u2 = run.slots[m2.mem.specimen - 1]!;
    c.kill(m1);
    expect(c.s.cd[u1] ?? 0).toBeLessThan(90);
    expect(c.s.vars['ui:scramble']).toBe(1);
    // 남은 기억: 흐려진다 → 소화된다
    expect(c.defOf(m2).ai(c, m2)).toBe('fade');
    act(c, m2, 'fade');
    expect(c.defOf(m2).ai(c, m2)).toBe('digest');
    eater.hp -= 200;
    const hp = eater.hp;
    const str = eater.st.str ?? 0;
    c.drain();
    act(c, m2, 'digest');
    expect(m2.dead).toBe(true);
    expect(eater.hp).toBe(hp + DIGEST_HEAL);
    expect(eater.st.str ?? 0).toBe(str + 1);
    expect(c.s.cd[u2] ?? 0).toBeLessThan(90);
    expect(c.s.vars['ui:scramble'] ?? 0).toBe(0);
    expect(cines(c.drain(), 'scrawl').length).toBe(1);
  });

  it('꿈을 먹는 자가 쓰러지면 삼킨 기억이 모두 풀려난다', () => {
    const run = floor5();
    const c = startCombat(run, 'lord-a5');
    const eater = find(c, 'dream-eater');
    act(c, eater, 'feast');
    expect(c.alive.filter((x) => x.def === MEMORY).length).toBe(MAX_MEMORIES);
    c.kill(eater);
    expect(c.alive.filter((x) => x.def === MEMORY).length).toBe(0);
    expect(Object.values(c.s.cd).every((n) => n < 90)).toBe(true);
    expect(c.s.vars['ui:scramble'] ?? 0).toBe(0);
  });

  it('깨어난 악몽: 눈을 뜨고(화면 가득한 눈 → 배경의 눈) 지금 시각으로 말을 건다', () => {
    const c = startCombat(floor5(), 'lord-a5');
    const eater = find(c, 'dream-eater');
    c.drain();
    eater.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게 (버팀이 남은 적은 절반만 받는다)
    eater.mem.agOff = 1; // 가호(한 턴 피해 상한)도
    c.damage({ src: c.p, tgt: eater, base: Math.ceil(eater.maxHp * 0.6), type: 'true' });
    expect(eater.form).toBe(1);
    const ev = c.drain();
    expect(cines(ev, 'eye').length).toBe(1);
    expect(c.s.vars['ui:eye']).toBe(1);
    expect(cines(ev, 'whisper')[0]?.text).toContain('{time}');
  });
});

describe('5층 정예 — 새 패턴', () => {
  it('토성의 고양이: 버린 목숨은 그림자가 되어 맴돌다 돌아온다 — 그 전에 쓰러뜨리면 영영 사라진다', () => {
    const c = startCombat(floor5(), 'a5-saturn-cat');
    const cat = find(c, 'saturn-cat');
    slay(c, cat);
    expect(cat.dead).toBe(false);
    expect(cat.mem.lives).toBe(1);
    const shade = find(c, SHADE);
    expect(shade.st['a5-homing']).toBe(SHADE_TURNS);
    expect(c.defOf(shade).ai(c, shade)).toBe('claw');
    act(c, shade, 'claw');
    expect(c.defOf(shade).ai(c, shade)).toBe('return');
    act(c, shade, 'return');
    expect(shade.dead).toBe(true);
    expect(cat.mem.lives).toBe(2);
    expect(cat.st['a5-lives']).toBe(2);

    // 그림자를 쓰러뜨리면 그 목숨은 돌아오지 않는다
    const d = startCombat(floor5(), 'a5-saturn-cat');
    const cat2 = find(d, 'saturn-cat');
    slay(d, cat2);
    d.kill(find(d, SHADE));
    expect(cat2.mem.lives).toBe(1);
  });

  it('토성의 고양이: 그림자는 처음 지닌 목숨에서만 생기고, 마지막 목숨을 잃으면 맴돌던 그림자도 흩어진다', () => {
    const c = startCombat(floor5(), 'a5-saturn-cat');
    const cat = find(c, 'saturn-cat');
    slay(c, cat);
    slay(c, cat);
    expect(c.alive.filter((x) => x.def === SHADE).length).toBe(2);
    // 돌아온 목숨으로 되살아날 때는 그림자가 남지 않는다
    cat.mem.lives = 1;
    slay(c, cat);
    expect(c.alive.filter((x) => x.def === SHADE).length).toBe(2);
    expect(cat.mem.lives).toBe(0);
    slay(c, cat);
    expect(cat.dead).toBe(true);
    expect(c.alive.length).toBe(0);
    c.endTurn();
    expect(c.s.phase).toBe('victory');
    expect(cineOf(c.moveDef(cat, 'leap'))).toBe('corners');
  });

  it(`꿈의 문지기: '문을 걸어 잠근다'는 거짓 의도다 — 통찰 ${FALSE_DOOR_SIGHT} 이상이면 진짜(두 번 치는 공격)가 보인다`, () => {
    const c = startCombat(floor5(), 'a5-elite-gatekeeper');
    const g = find(c, 'dream-gatekeeper');
    // 첫 차례(일흔 계단)와 거울은 지났다 — 순환의 첫 행동이 거짓 문
    g.mem.turns = 1;
    g.hist = ['mirror'];
    c.planIntent(g);
    expect(g.intent?.move).toBe('falsedoor');
    c.p.insight = FALSE_DOOR_SIGHT - 1;
    expect(c.shownIntent(g)?.kind).toBe('block');
    expect(c.shownIntent(g)?.label).toBe('문을 걸어 잠근다');
    c.p.insight = FALSE_DOOR_SIGHT;
    expect(c.shownIntent(g)?.kind).toBe('attack');
    expect(c.shownIntent(g)?.hits).toBe(2);
    c.drain();
    c.endTurn();
    const hits = c.drain().filter((x) => x.t === 'dmg' && x.src === g.uid && x.tgt === 'p');
    expect(hits.length).toBe(2);
  });

  it(`요람의 수문장 '쉿': 다음 턴 기술을 ${HUSH_LIMIT}번 넘게 쓰는 순간 별 ${HUSH_STARS}이 깨어나고, 지키면 수문장이 방심한다`, () => {
    const run = floor5();
    const c = startCombat(run, 'a5-elite-warden');
    const w = find(c, 'cradle-warden');
    act(c, w, 'quiet');
    expect(c.p.st['a5-hush']).toBe(HUSH_LIMIT);
    c.s.ap = 9;
    const usable = () => ['armor', 'weapon', ...(run.slots.filter(Boolean) as string[])].find((r) => !c.blockReason(r))!;
    for (let i = 0; i < HUSH_LIMIT; i++) expect(c.useSkill(usable(), w.uid)).toBeNull();
    expect(c.alive.filter((x) => x.def === 'newborn-star').length).toBe(0);
    expect(c.useSkill(usable(), w.uid)).toBeNull();
    expect(c.alive.filter((x) => x.def === 'newborn-star').length).toBe(HUSH_STARS);
    expect(c.p.st['a5-hush'] ?? 0).toBe(0);

    // 지키면: 턴을 마칠 때 수문장 취약
    const d = startCombat(floor5(), 'a5-elite-warden');
    const w2 = find(d, 'cradle-warden');
    act(d, w2, 'quiet');
    d.useSkill('armor');
    d.drain();
    d.endTurn();
    const vuln = d.drain().find((x) => x.t === 'status' && x.uid === w2.uid && x.id === 'vuln');
    expect(vuln && vuln.t === 'status' ? vuln.n : 0).toBe(HUSH_VULN);
    expect(d.alive.filter((x) => x.def === 'newborn-star').length).toBe(0);
    expect(cineOf(d.moveDef(w2, 'quiet'))).toBe('timestop');
  });

  it('꿈의 대사제 「꿈의 성찬」: 기도(심판) 뒤 곧바로 졸음 +2 — 두 번이면 잠들고, 적을 붕괴시키면 깬다', () => {
    const c = startCombat(floor5(), 'a5-elite-hierophant');
    const h = find(c, 'dream-hierophant');
    // 설교(첫 차례) → 기도 → 성찬
    expect(h.intent?.move).toBe('sermon');
    expect(c.defOf(h).ai(c, h)).toBe('prayer');
    h.mem.doomAt = c.s.turn;
    expect(c.defOf(h).ai(c, h)).toBe('communion');
    const san = c.p.sanity;
    act(c, h, 'communion');
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.st['a5-drowsy']).toBe(2);
    breakIt(c, find(c, 'star-swallower'));
    expect(c.p.st['a5-drowsy'] ?? 0).toBe(0);
    act(c, h, 'communion');
    act(c, h, 'communion');
    expect(c.p.st['a5-slumber']).toBe(1);
    expect(c.p.st['a5-drowsy'] ?? 0).toBe(0);
    // 잠든 사람에게는 성찬을 또 내리지 않는다
    for (let i = 0; i < 12; i++) expect(c.defOf(h).ai(c, h)).not.toBe('communion');
    expect(cineOf(c.moveDef(h, 'prayer'))).toBe('bell');
    // 잠에서 덜 깬 다음 턴: 행동력 -2
    c.endTurn();
    expect(c.s.ap).toBe(c.p.maxAp - 2);
  });

  it('꿈 사냥꾼 「꿈 덫」: 처음 날아온 일격은 피해·버팀을 깎지 못하고 그물에 걸린다 — 다음 일격부터는 그대로', () => {
    const c = startCombat(floor5(), 'stalker-a5');
    const h = find(c, 'dream-hunter');
    act(c, h, 'trap');
    expect(h.st['a5-trap']).toBe(1);
    const hp = h.hp;
    const poise = h.poise;
    c.drain();
    c.damage({ src: c.p, tgt: h, base: 30, type: h.weak[0], attack: true });
    expect(h.hp).toBe(hp);
    expect(h.poise).toBe(poise);
    expect(h.st['a5-trap'] ?? 0).toBe(0);
    expect(c.p.st['a5-snare']).toBe(1);
    expect(cines(c.drain(), 'corners').length).toBe(1);
    c.damage({ src: c.p, tgt: h, base: 30, type: h.weak[0], attack: true });
    expect(h.hp).toBeLessThan(hp);
    expect(h.poise).toBe(poise - 1);
  });

  it('꿈 사냥꾼 「꿈 덫」: 아무도 밟지 않으면 사냥꾼의 차례에 거둔다', () => {
    const c = startCombat(floor5(), 'stalker-a5');
    const h = find(c, 'dream-hunter');
    act(c, h, 'trap');
    force(c, h, 'horn');
    c.endTurn();
    expect(h.st['a5-trap'] ?? 0).toBe(0);
  });

  it(`문턱의 존재: 한 턴에 최대 체력의 ${Math.round(FLIP_AT * 100)}%를 넘게 몰아치면 그 자리에서 세계가 뒤집힌다 (턴마다 한 번)`, () => {
    const c = startCombat(floor5(), 'rift-a5');
    const e = find(c, 'liminal');
    expect(e.st['a5-phase-real']).toBe(1);
    const need = Math.ceil(e.maxHp * FLIP_AT);
    // 문턱은 잃은 체력으로 센다 — 버팀 없는 몸으로 (버팀이 남은 적은 절반만 받는다)
    e.maxPoise = e.poise = 0;
    c.drain();
    // 현실에선 참격이 그대로 들어간다 — 문턱 아래로는 그대로
    c.damage({ src: c.p, tgt: e, base: Math.floor(need / 2) - 20, type: 'slash', attack: true });
    expect(e.st['a5-phase-real']).toBe(1);
    c.damage({ src: c.p, tgt: e, base: need, type: 'slash', attack: true });
    expect(e.st['a5-phase-dream']).toBe(1);
    expect(e.st['a5-phase-real'] ?? 0).toBe(0);
    expect(cines(c.drain(), 'flip').length).toBe(1);
    // 같은 턴에는 다시 뒤집히지 않는다
    c.damage({ src: c.p, tgt: e, base: need, type: 'fire', attack: true });
    expect(e.st['a5-phase-dream']).toBe(1);
    // 다음 턴: 다시 뒤집힐 수 있다 (두 번째부터는 화면을 돌리지 않고 짧게 일그러진다)
    e.hp = e.maxHp;
    c.s.turn += 1;
    c.drain();
    c.damage({ src: c.p, tgt: e, base: need, type: 'fire', attack: true });
    expect(e.st['a5-phase-real']).toBe(1);
    const ev = c.drain();
    expect(cines(ev, 'flip').length).toBe(0);
    expect(cines(ev, 'glitch').length).toBe(1);
    expect(cineOf(c.moveDef(e, 'sunder'))).toBe('glitch');
  });

  it('정예의 큰 일격에는 필살기 연출이 붙는다', () => {
    const c = startCombat(floor5(), 'a5-elite-gatekeeper');
    const g = find(c, 'dream-gatekeeper');
    const big: [string, string][] = [
      ['saturn-cat', 'leap'],
      ['dream-gatekeeper', 'judgment'],
      ['cradle-warden', 'starfall'],
      ['dream-hierophant', 'prayer'],
      ['dream-hunter', 'skewer'],
      ['liminal', 'sunder'],
      ['dream-eater', 'nightfall'],
    ];
    for (const [def, id] of big) {
      const m = c.defOf({ ...g, def }).moves[id];
      expect(m?.ultimate, `${def}.${id}`).toBe(true);
      expect(cineOf(m), `${def}.${id}`).toBeTruthy();
    }
  });
});

describe('봇 — 5층의 모든 조우', () => {
  it('봇이 5층의 모든 조우를 이긴다 (새 패턴 포함)', () => {
    const lost: string[] = [];
    for (const enc of ENCOUNTERS.filter((e) => e.act === 5)) {
      const c = fightToEnd(startCombat(floor5(77), enc.id, { anomaly: null }));
      if (c.s.phase !== 'victory') lost.push(`${enc.id}: ${c.s.phase} (턴 ${c.s.turn})`);
    }
    expect(lost).toEqual([]);
  });

  it('봇이 별의 태아를 여러 시드에서 끝까지 쓰러뜨린다', () => {
    for (const seed of [11, 22, 33, 44]) {
      const c = fightToEnd(startCombat(floor5(seed), 'a5-boss-fetus'));
      expect(c.s.phase, `seed ${seed}`).toBe('victory');
    }
  });
});

// ───────────── 탄생의 선택 (3단계, 시스템 창) ─────────────

/** 태어난 것까지 넘긴다 */
function toBorn(c: Combat): EnemyUnit {
  const f = find(c, FETUS);
  slay(c, f);
  slay(c, f);
  return f;
}

/** 태어난 것이 첫 차례를 마치게 해 선택지가 걸리게 한다 */
function toChoice(c: Combat): EnemyUnit {
  const f = toBorn(c);
  c.endTurn();
  return f;
}

const cordsIn = (c: Combat) => c.alive.filter((e) => e.def === CORD);

describe('최종 수호자 별의 태아 — 탄생의 선택 (시스템 창)', () => {
  it('태어난 것이 첫 차례를 마치면 시스템 창이 뜬다 — 고르기 전엔 기술·소모품·턴 종료가 막힌다', () => {
    const c = startCombat(floor5(), 'a5-boss-fetus');
    const f = toBorn(c);
    // 태어나는 순간엔 아직 묻지 않는다: 먼저 첫 울음을 머금는다
    expect(c.s.choice ?? null).toBeNull();
    expect(f.intent?.move).toBe('cry');
    c.endTurn();
    expect(c.s.phase).toBe('player');
    const ch = c.s.choice!;
    expect(ch.id).toBe(BIRTH_CHOICE);
    expect(ch.by).toBe(f.uid);
    expect(ch.options.map((o) => o.id)).toEqual([...BIRTH_OPTIONS]);
    expect(ch.text).toContain('{time}');
    for (const o of ch.options) expect(o.desc.length).toBeGreaterThan(10);
    expect(c.blockReason('weapon')).toBe('선택지부터 골라야 한다');
    expect(c.endTurn()).toBe('선택지부터 골라야 한다');
    expect(c.useConsumable(0)).toBe('선택지부터 골라야 한다');
    expect(c.choose('lullaby')).toBeNull();
    expect(c.s.choice ?? null).toBeNull();
    expect(c.blockReason('weapon')).toBeNull();
    // 한 번만 묻는다
    c.endTurn();
    expect(c.s.choice ?? null).toBeNull();
  });

  it(`자장가를 부른다: 정신력 -${LULL_SAN}, ${LULL_TURNS}번의 차례 동안 잠든다(받는 피해 증가) — 첫 울음도 그동안 멈췄다가 깨어나면 이어진다`, () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = toChoice(c);
    expect(c.p.st['a5-cry']).toBe(CRY_TURNS);
    const san = c.p.sanity;
    const plain = c.preview(c.p, f, 50, 'pierce');
    c.choose('lullaby');
    expect(c.p.sanity).toBeLessThan(san);
    expect(f.st['a5-cradled']).toBe(LULL_TURNS);
    expect(f.intent?.move).toBe('nap');
    expect(f.intent?.kind).toBe('sleep');
    expect(c.preview(c.p, f, 50, 'pierce')).toBe(Math.floor(plain * LULL_MULT));
    // 잠든 동안은 아무것도 하지 않고, 차오르던 울음도 멈춰 있다
    for (let i = 0; i < LULL_TURNS; i++) {
      c.drain();
      c.endTurn();
      expect(c.drain().some((x) => x.t === 'dmg' && x.src === f.uid)).toBe(false);
      expect(c.p.st['a5-cry']).toBe(CRY_TURNS);
    }
    expect(f.st['a5-cradled'] ?? 0).toBe(0);
    // 깨어나면 울음이 곧바로 이어진다
    c.endTurn();
    expect(c.p.st['a5-cry']).toBe(CRY_TURNS - 1);
    // 울음을 머금고 있지 않았으면 깨어나자마자 머금는다 (짧게)
    const d = startCombat(floor5(), 'a5-boss-fetus');
    const g = toChoice(d);
    delete d.p.st['a5-cry'];
    d.choose('lullaby');
    for (let i = 0; i < LULL_TURNS; i++) d.endTurn();
    expect(g.intent?.move).toBe('wail');
    d.endTurn();
    expect(d.p.st['a5-cry']).toBe(WAKE_CRY_TURNS);
  });

  it(`탯줄을 끊는다: 탯줄이 모두 끊기고 다시 자라지 않는다 — 대신 최대 체력 ${SEVER_HP * 100}% 베임(방어도 무시)·출혈, 태어난 것 힘 +${SEVER_STR}`, () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = toChoice(c);
    expect(cordsIn(c).length).toBeGreaterThan(0);
    c.p.block = 999;
    const hp = c.p.hp;
    const str = f.st.str ?? 0;
    c.choose('sever');
    expect(cordsIn(c).length).toBe(0);
    expect(hp - c.p.hp).toBe(Math.ceil(c.p.maxHp * SEVER_HP));
    expect(c.p.st.bleed).toBe(SEVER_BLEED);
    expect(f.st.str ?? 0).toBe(str + SEVER_STR);
    // 다시 자라지 않는다
    for (let i = 0; i < 8; i++) expect(c.defOf(f).ai(c, f)).not.toBe('grow');
    // 첫 울음엔 탯줄 몫이 없다
    c.p.st['a5-cry'] = 1;
    c.drain();
    force(c, f, 'glare');
    c.endTurn();
    const cry = c.drain().find((x) => x.t === 'dmg' && x.tags.includes('a5-cry'));
    expect(cry && cry.t === 'dmg' ? cry.amount : -1).toBe(CRY_BASE);
  });

  it(`그것의 눈을 본다: 정신력 -${GAZE_SAN}, 통찰 +1 — 주고받는 공격 피해 +25%, 어떤 속성으로도 버팀이 깎인다`, () => {
    const c = startCombat(floor5(), 'a5-boss-fetus');
    const f = toChoice(c);
    const san = c.p.sanity;
    const ins = c.p.insight;
    const out = c.preview(c.p, f, 50, 'pierce');
    const inn = c.preview(f, c.p, 50, 'blunt');
    c.choose('gaze');
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.insight).toBe(ins + 1);
    expect(f.st['a5-dreamlink']).toBe(1);
    expect(c.preview(c.p, f, 50, 'pierce')).toBe(Math.floor(out * LINK_MULT));
    // 수호자 공격 배율(BOSS_DMG_MULT)이 곱해져 소수점 버림이 1 어긋날 수 있다
    expect(Math.abs(c.preview(f, c.p, 50, 'blunt') - Math.floor(inn * LINK_MULT))).toBeLessThanOrEqual(1);
    // 관통은 약점(참격·공허)이 아니지만 버팀이 깎인다
    expect(f.weak).not.toContain('pierce');
    const poise = f.poise;
    c.damage({ src: c.p, tgt: f, base: 5, type: 'pierce', attack: true });
    expect(f.poise).toBe(poise - 1);
  });

  it('선택지가 걸린 채 저장했다 불러와도 이어진다 (JSON)', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-boss-fetus');
    const f = toChoice(c);
    const saved = JSON.parse(JSON.stringify(run)) as RunState;
    const d = new Combat(saved);
    expect(d.s.choice?.id).toBe(BIRTH_CHOICE);
    expect(d.endTurn()).toBe('선택지부터 골라야 한다');
    expect(d.choose('sever')).toBeNull();
    expect(d.alive.filter((e) => e.def === CORD).length).toBe(0);
    expect(d.s.enemies.find((e) => e.uid === f.uid)!.mem.birth).toBe(2);
  });

  it('마지막 속삭임이 고른 것에 따라 달라진다', () => {
    const lines: Record<string, string> = { lullaby: FETUS_LINES.endLullaby, sever: FETUS_LINES.endSever, gaze: FETUS_LINES.endGaze };
    for (const opt of BIRTH_OPTIONS) {
      const c = startCombat(floor5(), 'a5-boss-fetus');
      const f = toChoice(c);
      c.choose(opt);
      c.drain();
      slay(c, f);
      expect(cines(c.drain(), 'whisper').map((x) => x.text)).toContain(lines[opt]);
    }
  });

  it('봇의 고르는 기준: 체력이 넉넉하고 탯줄이 많으면 끊고, 체력이 모자라고 정신력이 넉넉하면 재우고, 약점으로 붕괴시킬 수 없으면 눈을 본다', () => {
    const pickOf = (c: Combat) => [...c.s.choice!.options].sort((a, b) => (b.bot ?? 0) - (a.bot ?? 0))[0].id;
    // 체력 가득, 탯줄 셋
    const a = startCombat(floor5(), 'a5-boss-fetus');
    const fa = toBorn(a);
    while (cordsIn(a).length < 3) a.spawn(CORD, 1);
    a.p.hp = a.p.maxHp;
    a.p.sanity = Math.round(a.p.maxSanity * 0.5);
    force(a, fa, 'glare');
    a.endTurn();
    a.p.hp = a.p.maxHp;
    expect(pickOf(a)).toBe('sever');
    // 체력 30%, 정신력 가득, 탯줄 하나
    const b = startCombat(floor5(), 'a5-boss-fetus');
    const fb = toBorn(b);
    for (const x of cordsIn(b).slice(1)) b.kill(x);
    b.p.maxHp = 200;
    b.p.hp = 60;
    b.p.maxSanity = 100;
    b.p.sanity = 100;
    force(b, fb, 'glare');
    b.endTurn();
    expect(pickOf(b)).toBe('lullaby');
  });
});

describe('5층에는 즉사가 없다', () => {
  it('5층 적의 어떤 행동도 즉사 의도가 아니고, 실행해도 즉사로 쓰러지지 않는다', () => {
    const bad: string[] = [];
    for (const def of ENEMIES.values()) {
      if (def.act !== 5) continue;
      for (const [id, m] of Object.entries(def.moves)) {
        if (m.intent === 'death') bad.push(`${def.id}.${id}: 즉사 의도`);
        const enc = ENCOUNTERS.find((x) => x.enemies.some((s) => s.id === def.id));
        const c = startCombat(floor5(), enc?.id ?? 'a5-e-gug', { anomaly: null });
        const e = c.alive.find((x) => x.def === def.id) ?? c.spawn(def.id);
        if (!e) continue;
        act(c, e, id);
        if (c.s.doom) bad.push(`${def.id}.${id}: 즉사 (${c.s.doom})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ───────────── 출신 사이의 공정성 ─────────────

const ORIGINS3 = ['soldier', 'hunter', 'occultist'] as const;

/** 그 출신의 시작 덱 그대로, 5층다운 레벨 (기믹을 푸는지만 보려고 체력은 넉넉히) */
function kit(origin: string, seed: number, str: number): RunState {
  const run = newRun({ seed, origin });
  run.act = 5;
  run.floor = generateFloor(run, 5);
  run.player.level = 11;
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = str;
  run.player.maxAp = 4;
  run.player.insight = 4;
  run.light = 100;
  return run;
}

/** 봇으로 끝까지 — 탄생의 선택이 뜨면 정해 둔 것을 고른다 */
function fightPicking(c: Combat, pick?: string) {
  c.snapshots = false;
  let n = 0;
  while (!c.over && n++ < 400) {
    if (pick && c.s.choice?.id === BIRTH_CHOICE) c.choose(pick);
    autoTurn(c);
  }
  return c;
}

describe('공정성 — 세 출신의 시작 덱', () => {
  it('탄생의 선택: 세 출신 모두 셋 중 어느 것을 골라도 별의 태아를 이긴다 (봇, 시작 덱)', () => {
    const lost: string[] = [];
    for (const origin of ORIGINS3) {
      for (const pick of BIRTH_OPTIONS) {
        const c = fightPicking(startCombat(kit(origin, 41, 8), 'a5-boss-fetus'), pick);
        const f = c.s.enemies.find((e) => e.def === FETUS)!;
        if (c.s.phase !== 'victory') lost.push(`${origin} ${pick}: ${c.s.phase}`);
        else if (f.mem.birth !== BIRTH_OPTIONS.indexOf(pick) + 1) lost.push(`${origin} ${pick}: 고르지 못했다`);
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);

  it('근접만 가진 덱도 뒷열의 기믹 물건(탯줄·삼켜진 기억·버린 목숨·깨어난 별·심판을 짊어진 대사제)에 닿는다', () => {
    const melee = (run: RunState) => {
      // 사냥꾼에게서 원거리(화염 플라스크)를 뺀다: 칼·톱니 베기·빠른 베기만
      run.slots = run.slots.map((uid) => (run.skills.find((s) => s.uid === uid)?.id === 'fire-flask' ? null : uid));
      return run;
    };
    const knife = (c: Combat) => c.skillInfo('weapon')!.def;
    // 탯줄 (태아 + 탯줄 셋이면 하나는 뒷열)
    const a = startCombat(melee(kit('hunter', 7, 4)), 'a5-boss-fetus');
    toBorn(a);
    while (cordsIn(a).length < 3) a.spawn(CORD, 1);
    const back = cordsIn(a).find((x) => x.row === 1)!;
    expect(back).toBeTruthy();
    expect(a.validTargets(knife(a)).map((x) => x.uid)).toContain(back.uid);
    // 삼켜진 기억 (앞열은 군주와 몽유병자로 가득)
    const b = startCombat(melee(kit('hunter', 7, 4)), 'lord-a5');
    act(b, find(b, 'dream-eater'), 'feast');
    const mems = b.alive.filter((x) => x.def === MEMORY);
    expect(mems.length).toBeGreaterThan(0);
    for (const m of mems) {
      expect(m.row).toBe(1);
      expect(b.validTargets(knife(b)).map((x) => x.uid)).toContain(m.uid);
    }
    // 버린 목숨
    const d = startCombat(melee(kit('hunter', 7, 4)), 'a5-saturn-cat');
    slay(d, find(d, 'saturn-cat'));
    const shade = find(d, SHADE);
    shade.row = 1;
    expect(d.validTargets(knife(d)).map((x) => x.uid)).toContain(shade.uid);
    // 쉿을 어겨 깨어난 별
    const w = startCombat(melee(kit('hunter', 7, 4)), 'a5-elite-warden');
    act(w, find(w, 'cradle-warden'), 'quiet');
    w.s.ap = 9;
    for (let i = 0; i <= HUSH_LIMIT; i++) w.useSkill('armor');
    const stars = w.alive.filter((x) => x.def === 'newborn-star');
    expect(stars.length).toBe(HUSH_STARS);
    for (const s of stars) expect(w.validTargets(knife(w)).map((x) => x.uid)).toContain(s.uid);
    // 심판을 짊어진 대사제 (뒷열 — 공용 castDoom이 근접으로 닿게 한다)
    const h = startCombat(melee(kit('hunter', 7, 4)), 'a5-elite-hierophant');
    const priest = find(h, 'dream-hierophant');
    expect(h.validTargets(knife(h)).map((x) => x.uid)).not.toContain(priest.uid);
    act(h, priest, 'prayer');
    expect(h.validTargets(knife(h)).map((x) => x.uid)).toContain(priest.uid);
  });

  it('약점으로 붕괴시킬 수 없는 출신에게도 다른 길이 있다 (탯줄·처치·시간·덫·눈)', () => {
    // 알의 별자리 껍질: 탯줄이 끊기면 한 겹씩 갈라진다
    const b = startCombat(floor5(), 'a5-boss-fetus');
    const egg = find(b, FETUS);
    slay(b, egg);
    expect(egg.st['a5-shell']).toBe(SHELL_LAYERS);
    b.kill(cordsIn(b)[0]);
    expect(egg.st['a5-shell']).toBe(SHELL_LAYERS - 1);
    expect(egg.mem.cracks).toBe(1);
    // 졸음: 적을 쓰러뜨려도 깬다
    const d = startCombat(floor5(), 'a5-boss-fetus');
    const f = find(d, FETUS);
    act(d, f, 'lullaby');
    act(d, f, 'lullaby');
    expect(d.p.st['a5-drowsy']).toBe(2);
    d.kill(cordsIn(d)[0]);
    expect(d.p.st['a5-drowsy'] ?? 0).toBe(0);
    // 작은 손: 붕괴시키지 못해도 두 턴이 지나면 놓는다
    const g = startCombat(floor5(), 'a5-boss-fetus');
    const born = toBorn(g);
    const shot = slotOf(g.run, 'aimed-shot');
    g.useSkill(shot, born.uid);
    act(g, born, 'grasp');
    expect(g.s.cd[shot]).toBeGreaterThanOrEqual(90);
    // (실제로는 적의 차례에 쥔다 — 이 테스트는 내 턴 중에 쥐었으므로 그 라운드의 적 차례를 하나 더 지난다)
    for (let i = 0; i < GRASP_TURNS + 1; i++) {
      if (i < GRASP_TURNS) expect(g.s.cd[shot]).toBeGreaterThanOrEqual(90);
      force(g, born, 'lash');
      g.endTurn();
      if (g.s.choice) g.choose('lullaby');
    }
    expect(born.mem.specimen ?? 0).toBe(0);
    expect(g.s.cd[shot] ?? 0).toBeLessThan(90);
    // 탄생의 선택 「그것의 눈을 본다」: 약점이 없는 군인도 태어난 것을 붕괴시킬 수 있다
    const s0 = startCombat(kit('soldier', 3, 4), 'a5-boss-fetus');
    const nb = toChoice(s0);
    s0.choose('gaze');
    const before = nb.poise;
    s0.useSkill('weapon', nb.uid);
    expect(nb.poise).toBeLessThan(before);
    // 꿈 사냥꾼의 꿈 갑옷: 덫이 닫힐 때 하나가 떨어져 나간다 (화염·비전이 없어 붕괴시킬 수 없는 군인도)
    const s = startCombat(kit('soldier', 3, 4), 'stalker-a5');
    const hunter = find(s, 'dream-hunter');
    const dreams = hunter.st['a5-dreams'];
    act(s, hunter, 'trap');
    s.useSkill('weapon', hunter.uid);
    expect(hunter.st['a5-dreams'] ?? 0).toBe(dreams - 1);
  });

  it('세 출신 모두 시작 덱으로 5층 기믹 전투를 이긴다 (봇, 체력은 넉넉히)', () => {
    const lost: string[] = [];
    const encs = ['a5-boss-fetus', 'lord-a5', 'a5-saturn-cat', 'a5-elite-warden', 'a5-elite-hierophant', 'a5-elite-gatekeeper', 'stalker-a5', 'rift-a5'];
    for (const origin of ORIGINS3) {
      for (const enc of encs) {
        const c = fightPicking(startCombat(kit(origin, 101, 8), enc, { anomaly: null }));
        if (c.s.phase !== 'victory') lost.push(`${origin} ${enc}: ${c.s.phase}${c.s.doom ? ` (${c.s.doom})` : ''}`);
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);
});

// ───────────── 5층 일반 적 — 새 패턴 (2026-10) ─────────────
// "고층은 일반 몹조차 다양한 패턴": 주그·구그·몽유병자·달짐승·별을 삼킨 것·성운 해파리·별빛 순례자·장막 직조자 + 새 일반 적 꺼진 별·악몽 먹는 맥

/** 일반 적의 무작위 변이(결계·결속 등)가 장면을 흔들지 않게 끈다 (tests/depth.test.ts와 같은 방식) */
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

const allOf = (c: Combat, def: string): EnemyUnit[] => c.alive.filter((e) => e.def === def);

/** 의도를 여러 번 다시 정해 본다 (무작위는 남기되 상황에 맞는 행동만 고르는지) */
function plans(c: Combat, e: EnemyUnit, n = 30): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    e.hist = [];
    c.planIntent(e);
    seen.add(e.intent!.move);
  }
  return seen;
}

/** 그 적이 나에게 준 피해 이벤트 */
const hitsOn = (ev: CombatEvent[], e: EnemyUnit) => ev.filter((x): x is Extract<CombatEvent, { t: 'dmg' }> => x.t === 'dmg' && x.src === e.uid && x.tgt === 'p');

describe('5층 일반 적 — 새 패턴 (2026-10)', () => {
  beforeEach(mutOff);
  afterEach(mutOn);

  it('주그: 하나가 신호를 보내면 다른 주그들이 다음 차례에 일제히 덤빈다 — 신호를 보낸 주그를 쓰러뜨리면 그 자리에서 머뭇거린다', () => {
    const c = startCombat(floor5(), 'a5-e-zoogs');
    const [lead, a, b] = allOf(c, 'zoog');
    act(c, lead, 'signal');
    expect(lead.st[SIGNAL]).toBe(1);
    expect(a.st[RALLIED]).toBe(1);
    expect(b.st[RALLIED]).toBe(1);
    c.planIntent(a);
    c.planIntent(b);
    expect(a.intent?.move).toBe('pounce');
    expect(a.intent?.hits).toBe(POUNCE_HITS);
    // 신호를 보낸 주그가 쓰러지면 덤비려던 주그들의 의도가 곧바로 바뀐다
    slay(c, lead);
    for (const z of [a, b]) {
      expect(z.st[RALLIED] ?? 0).toBe(0);
      expect(z.intent?.move).toBe('scatter');
    }
    c.drain();
    c.endTurn();
    expect(c.drain().some((x) => x.t === 'dmg' && x.tgt === 'p')).toBe(false);
  });

  it('주그: 신호를 보낸 주그를 붕괴시켜도 흩어진다 — 모두 덤비고 나면 채비와 우두머리 표시가 사라진다', () => {
    const c = startCombat(floor5(), 'a5-e-zoogs');
    const [lead, a] = allOf(c, 'zoog');
    act(c, lead, 'signal');
    c.planIntent(a);
    breakIt(c, lead);
    expect(a.intent?.move).toBe('scatter');
    expect(lead.st[SIGNAL] ?? 0).toBe(0);

    const d = startCombat(floor5(), 'a5-e-zoogs');
    const [l2, x, y] = allOf(d, 'zoog');
    act(d, l2, 'signal');
    d.drain();
    act(d, x, 'pounce');
    expect(hitsOn(d.drain(), x).length).toBe(POUNCE_HITS);
    expect(x.st[RALLIED] ?? 0).toBe(0);
    // 아직 채비 중인 주그가 있으면 우두머리는 그대로
    expect(l2.st[SIGNAL]).toBe(1);
    act(d, y, 'pounce');
    expect(l2.st[SIGNAL] ?? 0).toBe(0);
    // 신호가 걸려 있는 동안 다른 주그는 또 신호를 보내지 않는다
    act(d, l2, 'signal');
    expect(plans(d, x)).not.toContain('signal');
  });

  it(`주그: 체력이 ${Math.round(ZOOG_FLEE_AT * 100)}% 아래이고 갉아먹은 등불을 품었으면 물고 달아난다 (등불도 보상도 없다) — 그 전에 쓰러뜨리면 되찾는다`, () => {
    const run = floor5();
    const c = startCombat(run, 'a5-e-zoogs');
    const [z, w] = allOf(c, 'zoog');
    act(c, z, 'nibble');
    act(c, w, 'nibble');
    expect(run.light).toBe(88);
    for (const x of [z, w]) {
      x.mem.agOff = 1;
      x.hp = Math.floor(x.maxHp * (ZOOG_FLEE_AT - 0.1));
    }
    c.planIntent(z);
    expect(z.intent?.move).toBe('flee');
    expect(z.intent?.kind).toBe('flee');
    act(c, z, 'flee');
    expect(z.dead && z.fled).toBe(true);
    expect(run.light).toBe(88);
    c.kill(w);
    expect(run.light).toBe(94);
  });

  it(`구그: 거대한 발을 들어 올리면 내 턴을 방어도 ${BRACE_BLOCK} 이상으로 마쳐 받아 낸다 — 내리찍기 피해 절반, 구그 버팀 -${BRACE_POISE}`, () => {
    const c = startCombat(floor5(), 'a5-e-gug');
    const g = find(c, 'gug');
    act(c, g, 'lift');
    expect(c.p.st[UNDERFOOT]).toBe(BRACE_BLOCK);
    c.planIntent(g);
    expect(g.intent?.move).toBe('crush');
    expect(g.intent?.dmg).toBe(CRUSH_DMG);
    const half = c.preview(g, c.p, Math.ceil(CRUSH_DMG / 2), 'blunt');
    const poise = g.poise;
    c.p.block = BRACE_BLOCK;
    c.drain();
    c.endTurn();
    expect(g.poise).toBe(poise - BRACE_POISE);
    expect(hitsOn(c.drain(), g).map((x) => x.amount)).toEqual([half]);
    expect(c.p.st[UNDERFOOT] ?? 0).toBe(0);

    // 받아 내지 못하면 그대로
    const d = startCombat(floor5(), 'a5-e-gug');
    const g2 = find(d, 'gug');
    act(d, g2, 'lift');
    d.planIntent(g2);
    const full = d.preview(g2, d.p, CRUSH_DMG, 'blunt');
    d.drain();
    d.endTurn();
    expect(hitsOn(d.drain(), g2).map((x) => x.amount)).toEqual([full]);
    expect(d.p.st[UNDERFOOT] ?? 0).toBe(0);

    // 붕괴시키면 발을 내려놓는다 (머리 위의 발도 사라진다)
    const e = startCombat(floor5(), 'a5-e-gug');
    const g3 = find(e, 'gug');
    act(e, g3, 'lift');
    e.planIntent(g3);
    breakIt(e, g3);
    expect(g3.mem.charge).toBeUndefined();
    e.endTurn();
    expect(e.p.st[UNDERFOOT] ?? 0).toBe(0);
  });

  it('구그: 내 턴에 화염 공격을 받으면 하려던 공격을 멈추고 앞발로 얼굴을 가린다 — 다음 차례엔 성이 나 네 앞발을 모두 휘두른다', () => {
    const c = startCombat(floor5(), 'a5-e-gug');
    const g = find(c, 'gug');
    force(c, g, 'stomp');
    c.damage({ src: c.p, tgt: g, base: 4, type: 'pierce', attack: true });
    expect(g.intent?.move).toBe('stomp');
    c.damage({ src: c.p, tgt: g, base: 4, type: 'fire', attack: true });
    expect(g.intent?.move).toBe('cover');
    act(c, g, 'cover');
    expect(g.block).toBe(COVER_BLOCK);
    c.planIntent(g);
    expect(g.intent?.move).toBe('fury');
    expect(g.intent?.hits).toBe(FURY_HITS);
    // 크게 준비하는 중에는 움찔하지 않는다
    force(c, g, 'gape');
    c.damage({ src: c.p, tgt: g, base: 4, type: 'fire', attack: true });
    expect(g.intent?.move).toBe('gape');
  });

  it('몽유병자: 비전·공허 피해에는 꿈속의 일인 줄 알아 놀라지 않고 조용히 깬다 — 다른 피해에는 놀라 깨어나 힘 +3', () => {
    const c = startCombat(floor5(), 'a5-e-sleepers');
    const [a, b] = allOf(c, 'sleepwalker');
    c.damage({ src: c.p, tgt: a, base: 5, type: 'void', attack: true });
    expect(isAsleep(a)).toBe(false);
    expect(a.st.str ?? 0).toBe(0);
    c.damage({ src: c.p, tgt: b, base: 5, type: 'pierce', attack: true });
    expect(isAsleep(b)).toBe(false);
    expect(b.st.str).toBe(3);
  });

  it(`몽유병자: 하품이 졸음을 옮기고, 체력이 ${Math.round(RELAPSE_AT * 100)}% 아래로 떨어지면 한 번 다시 잠들어 잠든 동안 상처가 아문다`, () => {
    const c = startCombat(floor5(), 'a5-e-sleepers');
    const s = find(c, 'sleepwalker');
    act(c, s, 'yawn');
    expect(c.p.st['a5-drowsy']).toBe(1);
    // 깨어 있는 몸이 크게 다쳤다
    s.mem.asleep = 0;
    delete s.st['a5-asleep'];
    s.hp = Math.floor(s.maxHp * (RELAPSE_AT - 0.1));
    c.planIntent(s);
    expect(s.intent?.move).toBe('relapse');
    act(c, s, 'relapse');
    expect(isAsleep(s)).toBe(true);
    expect(s.st['a5-asleep']).toBe(RELAPSE_TURNS);
    const hp = s.hp;
    act(c, s, 'doze');
    expect(s.hp).toBe(hp + Math.ceil(s.maxHp * RELAPSE_HEAL));
    for (let i = 1; i < RELAPSE_TURNS; i++) act(c, s, 'doze');
    expect(isAsleep(s)).toBe(false);
    expect(s.mem.rest ?? 0).toBe(0);
    // 다시 잠드는 것은 한 번뿐
    expect(plans(c, s)).not.toContain('relapse');
  });

  it(`달짐승 「붙잡아라!」: 노예가 곧바로 달려들어 붙잡는다 (취약 ${HOLD_VULN}) — 노예가 없으면 명령하지 않는다`, () => {
    const c = startCombat(floor5(), 'a5-slave-drive');
    const m = find(c, 'moonbeast');
    const s = find(c, 'leng-slave');
    expect(plans(c, m)).toContain('order');
    act(c, m, 'order');
    expect(s.mem.ordered).toBe(1);
    // 달짐승 뒤에 움직이는 노예는 이번 차례에 곧바로 붙잡는다
    expect(s.intent?.move).toBe('grab');
    act(c, s, 'grab');
    expect(c.p.st.vuln).toBe(HOLD_VULN);
    expect(plans(c, s)).not.toContain('grab');
    // 이미 붙잡힌(취약) 동안이나 부릴 노예가 없으면 명령하지 않는다
    expect(plans(c, m)).not.toContain('order');
    delete c.p.st.vuln;
    c.kill(s);
    expect(plans(c, m)).not.toContain('order');
  });

  it(`달짐승: 내 출혈이 ${TWIST_AT} 이상이면 상처를 비튼다 (출혈 1마다 피해 +${TWIST_PER})`, () => {
    const c = startCombat(floor5(), 'a5-e-moonbeast');
    const m = find(c, 'moonbeast');
    expect(plans(c, m)).not.toContain('twist');
    c.p.st.bleed = 5;
    expect(plans(c, m)).toContain('twist');
    force(c, m, 'twist');
    expect(m.intent?.dmg).toBe(TWIST_BASE + TWIST_PER * 5);
  });

  it('별을 삼킨 것: 삼킨 별이 달아오른다 (자기 차례마다, 빨아들인 방어도로) — 다 차면 나에게 게워 내고, 별은 하나뿐이다', () => {
    const c = startCombat(floor5(), 'a5-e-swallower');
    const sw = find(c, 'star-swallower');
    c.p.block = 20;
    act(c, sw, 'pull');
    expect(sw.st[HEAT]).toBe(1);
    force(c, sw, 'hunger');
    c.endTurn();
    expect(sw.st[HEAT]).toBe(2);
    force(c, sw, 'hunger');
    c.endTurn();
    expect(sw.st[HEAT]).toBe(HEAT_MAX);
    expect(sw.intent?.move).toBe('retch');
    c.drain();
    c.endTurn();
    expect(hitsOn(c.drain(), sw).some((x) => x.dtype === 'fire')).toBe(true);
    expect(sw.mem.spat).toBe(1);
    expect(sw.st[HEAT] ?? 0).toBe(0);
    expect(c.p.st.burn ?? 0).toBeGreaterThan(0);
    expect(RETCH_BURN).toBeGreaterThan(1);
    // 별은 하나뿐: 다시 달아오르지 않는다
    force(c, sw, 'hunger');
    c.endTurn();
    expect(sw.st[HEAT] ?? 0).toBe(0);
  });

  it('별을 삼킨 것: 달아오른 별도 그 전에 붕괴시키면 동료들에게 토해 내고, 다시는 게워 내지 않는다', () => {
    const c = startCombat(floor5(), 'a5-swallow-pilgrims');
    const sw = find(c, 'star-swallower');
    sw.st[HEAT] = HEAT_MAX - 1;
    const pilgrims = allOf(c, 'star-pilgrim');
    const before = pilgrims.map((p) => p.hp);
    breakIt(c, sw);
    pilgrims.forEach((p, i) => expect(p.hp).toBeLessThan(before[i]));
    expect(sw.st[HEAT] ?? 0).toBe(0);
    sw.st[HEAT] = HEAT_MAX;
    for (let i = 0; i < 6; i++) {
      sw.hist = [];
      expect(c.defOf(sw).ai(c, sw)).not.toBe('retch');
    }
  });

  it('별을 삼킨 것: 곁의 갓 태어난 별을 삼킨다 — 별은 빛을 터뜨리지 못하고 사라지며, 삼킨 별이 더 달아오른다', () => {
    const c = startCombat(floor5(), 'a5-nursery');
    const sw = find(c, 'star-swallower');
    const star = c.spawn('newborn-star', 1)!;
    expect(plans(c, sw)).toContain('devour');
    sw.mem.agOff = 1;
    sw.hp -= 50;
    const hp = sw.hp;
    act(c, sw, 'devour');
    expect(star.dead && star.fled).toBe(true);
    expect(sw.hp).toBe(hp + DEVOUR_HEAL);
    expect(sw.st[HEAT]).toBe(DEVOUR_HEAT);
  });

  it('성운 해파리: 붕괴시키면 품고 있던 별이 흩어져 처음부터 다시 품는다 (낳으려던 차례도 끊긴다)', () => {
    const c = startCombat(floor5(), 'a5-e-jelly');
    const j = find(c, 'nebula-jelly');
    j.mem.gest = 0;
    delete j.st['a5-gestation'];
    c.planIntent(j);
    expect(j.intent?.move).toBe('birth');
    breakIt(c, j);
    expect(j.intent?.move).toBe('_broken');
    expect(j.mem.gest).toBe(GESTATION);
    expect(j.st['a5-gestation']).toBe(GESTATION);
  });

  it(`성운 해파리: 갓 태어난 별에게 빛을 먹이면 그 별이 터뜨릴 빛이 커진다 (이미 정한 의도도 +${FEED_DMG}, 별마다 한 번)`, () => {
    const c = startCombat(floor5(), 'a5-e-jelly');
    const j = find(c, 'nebula-jelly');
    expect(plans(c, j)).not.toContain('feed');
    const star = c.spawn('newborn-star', 1)!;
    expect(star.intent?.move).toBe('swell');
    expect(star.intent?.dmg).toBe(STAR_FLARE);
    expect(plans(c, j)).toContain('feed');
    act(c, j, 'feed');
    expect(star.st[FED]).toBe(FEED_DMG);
    expect(star.intent?.dmg).toBe(STAR_FLARE + FEED_DMG);
    act(c, star, 'swell');
    c.planIntent(star);
    expect(star.intent?.move).toBe('flare');
    expect(star.intent?.dmg).toBe(STAR_FLARE + FEED_DMG);
    expect(plans(c, j)).not.toContain('feed');
  });

  it(`성운 해파리: 체력이 ${Math.round(HURRY_AT * 100)}% 아래면 서둘러 낳는다 (잉태가 차례마다 2씩 줄어든다)`, () => {
    const c = startCombat(floor5(), 'a5-e-jelly');
    const j = find(c, 'nebula-jelly');
    force(c, j, 'sting');
    c.endTurn();
    expect(j.mem.gest).toBe(GESTATION - 1);
    j.mem.agOff = 1;
    j.hp = Math.floor(j.maxHp * (HURRY_AT - 0.1));
    force(c, j, 'sting');
    c.endTurn();
    expect(j.mem.gest).toBe(Math.max(0, GESTATION - 3));
  });

  it(`별빛 순례자: 아무도 막지 않은 걸음마다 기도가 깊어진다 (최대 ${DEVOTION_MAX}) — 맞으면 흐트러져 준비하던 공격이 곧바로 약해진다`, () => {
    const c = startCombat(floor5(), 'a5-gug-pilgrim');
    const p = find(c, 'star-pilgrim');
    const g = find(c, 'gug');
    act(c, p, 'chant');
    expect(p.mem.steps).toBe(4);
    expect(p.st[DEVOTION]).toBe(1);
    act(c, p, 'bless');
    expect(p.st[DEVOTION]).toBe(2);
    expect(g.st.barrier).toBe(8 + DEVOTION_BLESS);
    force(c, p, 'shard');
    expect(p.intent?.dmg).toBe(13 + 2 * DEVOTION_SHARD);
    // 맞으면 기도가 흐트러지고, 준비하던 별 부스러기도 곧바로 약해진다
    c.damage({ src: c.p, tgt: p, base: 3, type: 'pierce', attack: true });
    expect(p.st[DEVOTION] ?? 0).toBe(0);
    expect(p.intent?.dmg).toBe(13);
    // 맞은 뒤의 걸음은 깊어지지 않는다
    act(c, p, 'shard');
    expect(p.st[DEVOTION] ?? 0).toBe(0);
    expect(p.mem.steps).toBe(2);
    expect(p.st['a5-pilgrimage']).toBe(2);
    // 스스로 치른 고행은 방해가 아니다
    act(c, p, 'penance');
    expect(p.st[DEVOTION]).toBe(1);
    for (let i = 0; i < 5; i++) {
      p.mem.steps = 5;
      act(c, p, 'chant');
    }
    expect(p.st[DEVOTION]).toBe(DEVOTION_MAX);
  });

  it('별빛 순례자: 앞줄에 서면 길이 막혀 걷지 못하고 지팡이를 든다 — 요람이 가까우면 노래가 바뀐다', () => {
    const c = startCombat(floor5(), 'a5-gug-pilgrim');
    const p = find(c, 'star-pilgrim');
    expect(c.moveRow(p, 0)).toBe(true);
    const front = plans(c, p);
    expect(front).toContain('staff');
    for (const id of ['shard', 'bless', 'penance', 'hymn']) expect(front).not.toContain(id);
    const steps = p.mem.steps;
    act(c, p, 'staff');
    expect(p.mem.steps).toBe(steps);
    // 요람이 가깝다
    expect(c.moveRow(p, 1)).toBe(true);
    p.mem.steps = NEAR_CRADLE;
    const near = plans(c, p);
    expect(near).toContain('hymn');
    expect(near).not.toContain('chant');
    act(c, p, 'hymn');
    expect(find(c, 'gug').st.barrier).toBe(HYMN_BARRIER);
  });

  it('장막 직조자 「꿈실 엉키기」: 그 턴에 마지막으로 쓴 두 기술(기본기 제외)의 재사용 대기가 더 긴 쪽에 맞춰진다', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-weaver-gug');
    const w = find(c, 'veil-weaver');
    const g = find(c, 'gug');
    expect(c.p.st[THREADS]).toBe(1);
    c.s.ap = 9;
    const steady = slotOf(run, 'steady');
    const reload = slotOf(run, 'reload');
    const shot = slotOf(run, 'aimed-shot');
    expect(c.useSkill(steady)).toBeNull();
    const steadyCd = c.s.cd[steady];
    expect(c.useSkill(reload)).toBeNull();
    expect(c.useSkill(shot, g.uid)).toBeNull();
    // 기본 공격은 엉키지 않는다 (마지막 두 기술은 재장전·겨눠 쏘기)
    expect(c.useSkill('weapon', g.uid)).toBeNull();
    const long = c.s.cd[reload];
    expect(c.s.cd[shot]).toBeLessThan(long);
    act(c, w, 'tangle');
    expect(c.s.cd[shot]).toBe(long);
    expect(c.s.cd[reload]).toBe(long);
    expect(c.s.cd[steady]).toBe(steadyCd);

    // 기술을 하나만 썼으면 엉킬 실이 없다 (기본기로 턴을 채워도)
    const d = startCombat(floor5(), 'a5-weaver-gug');
    const w2 = find(d, 'veil-weaver');
    const g2 = find(d, 'gug');
    d.useSkill(slotOf(d.run, 'aimed-shot'), g2.uid);
    d.useSkill('weapon', g2.uid);
    const before = JSON.stringify(d.s.cd);
    act(d, w2, 'tangle');
    expect(JSON.stringify(d.s.cd)).toBe(before);
  });

  it('장막 직조자: 짠 환영을 깨뜨리면 실이 끊어져 직조자가 비틀거린다 — 앞줄로 끌려 나오면 제 환영 사이로 숨는다', () => {
    const c = startCombat(floor5(), 'a5-weaver-gug');
    const w = find(c, 'veil-weaver');
    act(c, w, 'weave');
    const copy = c.alive.find(isIllusion)!;
    expect(copy.mem.maker).toBe(uidNum(w));
    const poise = w.poise;
    c.damage({ src: c.p, tgt: copy, base: 5, type: 'slash', attack: true });
    expect(copy.dead).toBe(true);
    expect(w.poise).toBe(poise - SNAP_POISE);
    // 문지기의 거울처럼 직조자가 짜지 않은 환영은 상관없다
    expect(c.alive.some(isIllusion)).toBe(false);
    // 앞줄로 끌려 나왔다
    slay(c, find(c, 'gug'));
    expect(c.moveRow(w, 0)).toBe(true);
    c.planIntent(w);
    expect(w.intent?.move).toBe('veilself');
    act(c, w, 'veilself');
    const mine = c.alive.filter((x) => isIllusion(x) && x.mem.maker === uidNum(w));
    expect(mine.length).toBe(2);
    expect(mine.every((x) => x.def === 'veil-weaver')).toBe(true);
  });

  it('꺼진 별: 쏘아 보낸 빛은 내 턴이 두 번 끝날 때 닿는다 — 별을 쓰러뜨려도 이미 떠난 빛은 멈추지 않는다', () => {
    const c = startCombat(floor5(), 'a5-e-deadstar');
    const star = find(c, DEAD_STAR);
    act(c, star, 'send');
    const n = c.p.st[LIGHT_FAR];
    expect(n).toBe(c.preview(star, null, BEAM_DMG, 'fire'));
    expect(n).toBeGreaterThan(BEAM_DMG);
    c.kill(star);
    c.endTurn();
    expect(c.p.st[LIGHT_FAR] ?? 0).toBe(0);
    expect(c.p.st[LIGHT_NEAR]).toBe(n);
    c.drain();
    c.endTurn();
    const hit = c.drain().find((x) => x.t === 'dmg' && x.tgt === 'p' && x.tags.includes('a5-starlight'));
    expect(hit && hit.t === 'dmg' ? hit.hpLoss : -1).toBe(n);
    expect(c.p.st[LIGHT_NEAR] ?? 0).toBe(0);
  });

  it(`꺼진 별: 닿은 빛을 방어도로 모두 막아 내면 별이 흔들린다 (버팀 -${LIGHT_STAGGER}) — 붕괴시키면 오는 중인 빛이 모두 흩어진다`, () => {
    const c = startCombat(floor5(), 'a5-e-deadstar');
    const star = find(c, DEAD_STAR);
    c.p.st[LIGHT_NEAR] = 10;
    c.p.block = 40;
    const poise = star.poise;
    force(c, star, 'glimmer');
    c.endTurn();
    expect(star.poise).toBe(poise - LIGHT_STAGGER);
    c.p.st[LIGHT_FAR] = 12;
    c.p.st[LIGHT_NEAR] = 12;
    breakIt(c, star);
    expect(c.p.st[LIGHT_FAR] ?? 0).toBe(0);
    expect(c.p.st[LIGHT_NEAR] ?? 0).toBe(0);
  });

  it(`꺼진 별: 체력이 ${Math.round(LAST_LIGHT_AT * 100)}% 아래로 떨어지면 마지막 빛을 한꺼번에 쏘아 보낸다 (전투마다 한 번)`, () => {
    const c = startCombat(floor5(), 'a5-e-deadstar');
    const star = find(c, DEAD_STAR);
    star.mem.agOff = 1;
    star.hp = Math.floor(star.maxHp * (LAST_LIGHT_AT - 0.1));
    c.planIntent(star);
    expect(star.intent?.move).toBe('lastlight');
    act(c, star, 'lastlight');
    expect(c.p.st[LIGHT_FAR]).toBe(c.preview(star, null, LAST_BEAM_DMG, 'fire'));
    expect(plans(c, star)).not.toContain('lastlight');
  });

  it(`악몽 먹는 맥: 악몽이 가장 깊은 적 하나의 악몽을 먹어 치우고 아문다 — 먹을 때마다 배부름 +1, ${GORGE_MAX}이 차면 다음 차례에 나에게 게워 낸다`, () => {
    const c = startCombat(floor5(), 'a5-baku-gug');
    const b = find(c, BAKU);
    const g = find(c, 'gug');
    // 내 턴이 아닐 때 건다 (냄새를 맡고 의도를 바꾸는 것은 따로 본다)
    c.s.phase = 'enemy';
    c.apply(g, 'bleed', 4, c.p);
    c.apply(g, 'poison', 3, c.p);
    c.apply(g, 'burn', 2, c.p);
    c.apply(b, 'weak', 2, c.p);
    c.s.phase = 'player';
    b.mem.agOff = 1;
    b.hp -= 40;
    const hp = b.hp;
    act(c, b, 'eat');
    expect(g.st.bleed ?? 0).toBe(0);
    expect(g.st.poison ?? 0).toBe(0);
    expect(g.st.burn ?? 0).toBe(0);
    // 한 번에 한 적만 (악몽이 덜 깊은 자신의 약화는 남는다)
    expect(b.st.weak).toBe(2);
    expect(b.hp).toBe(hp + Math.min(EAT_HEAL_MAX, 9 * EAT_HEAL));
    expect(b.st[GORGED]).toBe(1);
    // 배가 차기 전에는 게워 내지 않는다
    expect(plans(c, b)).not.toContain('retch');
    b.st[GORGED] = GORGE_MAX - 1;
    act(c, b, 'eat');
    expect(b.st.weak ?? 0).toBe(0);
    expect(b.st[GORGED]).toBe(GORGE_MAX);
    c.planIntent(b);
    expect(b.intent?.move).toBe('retch');
    const san = c.p.sanity;
    act(c, b, 'retch');
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.st.dread).toBe(BAKU_RETCH_DREAD);
    expect(b.st[GORGED] ?? 0).toBe(0);
  });

  it(`악몽 먹는 맥: 내 턴에 내가 건 악몽이 ${SCENT_AT}겹 이상 쌓이면 냄새를 맡고 공격을 멈춘 채 먹으러 간다 — 붕괴시키면 배 속의 악몽이 흩어진다`, () => {
    const c = startCombat(floor5(), 'a5-baku-gug');
    const b = find(c, BAKU);
    const g = find(c, 'gug');
    expect(c.p.st[SCENT]).toBe(1);
    force(c, b, 'trample');
    c.apply(g, 'bleed', SCENT_AT - 1, c.p);
    expect(b.intent?.move).toBe('trample');
    c.apply(g, 'poison', 1, c.p);
    expect(b.intent?.move).toBe('eat');
    expect(b.intent?.kind).toBe('heal');
    // 방금 먹었으면 연달아 먹으러 가지는 않는다
    const d = startCombat(floor5(), 'a5-baku-gug');
    const b2 = find(d, BAKU);
    force(d, b2, 'trunk');
    b2.hist = ['eat'];
    d.apply(find(d, 'gug'), 'bleed', SCENT_AT + 2, d.p);
    expect(b2.intent?.move).toBe('trunk');
    b.st[GORGED] = 2;
    breakIt(c, b);
    expect(b.st[GORGED] ?? 0).toBe(0);
  });

  it('새 패턴의 상태는 저장했다 불러와도 이어진다 (JSON): 다가오는 별빛·들어 올린 발', () => {
    const run = floor5();
    const c = startCombat(run, 'a5-dead-light');
    act(c, find(c, DEAD_STAR), 'send');
    const n = c.p.st[LIGHT_FAR];
    const saved = JSON.parse(JSON.stringify(run)) as RunState;
    const d = new Combat(saved);
    d.endTurn();
    expect(d.p.st[LIGHT_NEAR]).toBe(n);

    const run2 = floor5();
    const e = startCombat(run2, 'a5-baku-gug');
    const g = find(e, 'gug');
    act(e, g, 'lift');
    e.planIntent(g);
    const saved2 = JSON.parse(JSON.stringify(run2)) as RunState;
    const f = new Combat(saved2);
    const g2 = f.s.enemies.find((x) => x.uid === g.uid)!;
    const poise = g2.poise;
    f.p.block = BRACE_BLOCK;
    f.endTurn();
    expect(g2.poise).toBe(poise - BRACE_POISE);
  });

  it('세 출신 모두 시작 덱으로 새 패턴이 든 일반 조우를 이긴다 (봇, 체력은 넉넉히)', () => {
    const lost: string[] = [];
    const encs = ['a5-e-zoogs', 'a5-e-deadstar', 'a5-dead-light', 'a5-dead-procession', 'a5-baku-gug', 'a5-nightmare-feast', 'a5-slave-drive', 'a5-weaver-gug', 'a5-nursery', 'a5-pilgrims'];
    for (const origin of ORIGINS3) {
      for (const enc of encs) {
        const c = fightPicking(startCombat(kit(origin, 202, 8), enc, { anomaly: null }));
        if (c.s.phase !== 'victory') lost.push(`${origin} ${enc}: ${c.s.phase} (턴 ${c.s.turn})`);
      }
    }
    expect(lost).toEqual([]);
  }, 120_000);
});
