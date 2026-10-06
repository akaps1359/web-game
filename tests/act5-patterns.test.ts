import { describe, expect, it } from 'vitest';
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
  HUSH_LIMIT,
  HUSH_STARS,
  HUSH_VULN,
  MAX_MEMORIES,
  MEMORY,
  SHADE,
  SHADE_TURNS,
} from '../src/content/act5/enemies';

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
    expect(c.blockReason('weapon')).toBe('먼저 선택지를 고르세요');
    expect(c.endTurn()).toBe('먼저 선택지를 고르세요');
    expect(c.useConsumable(0)).toBe('먼저 선택지를 고르세요');
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
    expect(d.endTurn()).toBe('먼저 선택지를 고르세요');
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
