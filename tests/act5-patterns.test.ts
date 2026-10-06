import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, SKILLS } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import type { CineName, EnemyUnit, MoveDef } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import { seized } from '../src/content/lib';
import { DREAMS, FETUS, FETUS_LINES, REDREAM_HP } from '../src/content/act5/fetus';
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
