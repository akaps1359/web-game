import { describe, expect, it } from 'vitest';
import '../src/content';
import { seized } from '../src/content/lib';
import { Combat, type CombatEvent } from '../src/engine/combat';
import { ENEMIES, SKILLS, STATUSES, TRAITS } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import type { EnemyUnit, MoveDef, SkillUse } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import { skillDesc } from '../src/ui/text';
import {
  BEAM_DMG,
  BEAM_HITS,
  BLACK_STAR_HP,
  BLACKHOLE_AT,
  BLACKHOLE_STR,
  COLLAPSE_DMG,
  COLLAPSED,
  DARK,
  EYES_MAX,
  HAWKING_PCT,
  HEAL_PER_EYE,
  HORIZON,
  HORIZON_MAX,
  HORIZON_TURNS,
  JUDGE_DMG,
  LENS,
  LENS_PART,
  SPAG_BASE,
  SPAG_PER,
  addDark,
  hawkingDmg,
  horizonHeld,
  horizonNote,
  nextPull,
  sealedSkills,
  spagDmg,
} from '../src/content/act4/patterns';

/*
 * 4층 계층군주 「검은 별」 (2026-10 계층군주 강화): 중력 렌즈 · 블랙홀(2막) · 사건의 지평선 · 호킹 복사 · 스파게티화.
 * 규칙과 상태는 src/content/act4/patterns.ts, 특성·행동은 src/content/act4/enemies.ts
 */

/** 4층에 서 있는 튼튼한 주인공 (군인 시작 덱: 정조준 사격·재장전·방패 강타·버티기) */
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

/** 출신의 시작 덱 그대로 4층에 선 주인공 (레벨·체력·힘은 4층 기준) */
function starter4(origin: string, seed = 404): RunState {
  const run = newRun({ seed, origin });
  run.act = 4;
  run.floor = generateFloor(run, 4);
  run.player.level = 12;
  run.player.maxHp = run.player.hp = 160;
  run.player.str = 6;
  run.player.maxAp = 3;
  run.light = 60;
  return run;
}

const ORIGINS3 = ['soldier', 'hunter', 'occultist'];

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((x) => x.def === def)!;
const eyes = (c: Combat) => c.alive.filter((x) => x.def === 'void-eye');
const ai = (c: Combat, e: EnemyUnit) => ENEMIES.get(e.def)!.ai(c, e);

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

/** 적의 차례처럼 그 행동을 실행한다 (차례 끝의 특성은 돌지 않는다) */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
  c.s.phase = 'player';
}

const cines = (evs: CombatEvent[], name: string) => evs.filter((ev) => ev.t === 'cine' && ev.name === name);
const hitsOn = (evs: CombatEvent[], tgt: string, src?: string) =>
  evs.filter((ev): ev is Extract<CombatEvent, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt === tgt && (src === undefined || ev.src === src));

/** 피해를 그대로 재려고 버팀·가호·상태를 걷어 낸다 */
function bare(e: EnemyUnit) {
  e.maxPoise = e.poise = 0;
  e.mem.agOff = 1;
  e.st = {};
  e.block = 0;
}

/** 이 기술을 쥔 것처럼 쓰는 SkillUse (장착하지 않은 기술로 광역·무작위 공격을 재 볼 때) */
function useOf(c: Combat, id: string): SkillUse {
  const def = SKILLS.get(id)!;
  return c.makeUse({ def, owned: { uid: `t-${id}`, id, lvl: 0, runes: [] } });
}

/** 화면의 기술 칸 설명에 보이는 피해 숫자 ({D:dmg}) */
function shownDmg(c: Combat, ref: string, target: EnemyUnit): number {
  const info = c.skillInfo(ref)!;
  const seg = skillDesc(info.def, info.owned.lvl, { c, target, use: c.makeUse(info) }).find((s) => s.k);
  return Number(seg!.t);
}

/** 별을 블랙홀로 무너뜨린다 (가호를 걷고 — 테스트에서 체력을 깎아 장면을 만들 때) */
function collapsed(run = floor4()): { c: Combat; star: EnemyUnit } {
  const c = startCombat(run, 'lord-a4', { anomaly: null });
  const star = find(c, 'black-star');
  star.mem.agOff = 1;
  act(c, star, 'blackhole');
  expect(star.form).toBe(1);
  c.drain();
  return { c, star };
}

/** 내 턴을 아무것도 하지 않고 넘긴다 (별의 차례가 한 번 지나간다) */
function pass(c: Combat) {
  c.endTurn();
  expect(c.s.phase).toBe('player');
}

const slotOf = (c: Combat, id: string): string => c.run.slots.find((uid) => uid && c.run.skills.find((s) => s.uid === uid)?.id === id)!;

describe('4층 계층군주 — 검은 별: 수치', () => {
  it('체력·광선·중력 붕괴·별의 심판이 상수대로 (2026-10 강화)', () => {
    const def = ENEMIES.get('black-star')!;
    expect(def.hp).toEqual([BLACK_STAR_HP, BLACK_STAR_HP]);
    expect(def.moves.beam.dmg).toBe(BEAM_DMG);
    expect(def.moves.beam.hits).toBe(BEAM_HITS);
    expect(def.moves.rise.dmg).toBe(COLLAPSE_DMG);
    expect(def.moves.collapse.dmg).toBe(COLLAPSE_DMG);
    expect(def.moves.judgment.desc).toContain(`피해 ${JUDGE_DMG}`);
    // 초신성 전조는 2막 「블랙홀」로 바뀌었다
    expect(def.moves.nova).toBeUndefined();
    expect(def.moves.blackhole.intent).toBe('special');
  });
});

describe('4층 계층군주 — 검은 별: 중력 렌즈', () => {
  it('눈이 살아 있으면 별을 겨눈 단일 대상 공격은 피해의 일부만 — 기술 칸의 숫자도 같고, 처음 한 번 알린다', () => {
    const c = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    bare(star);
    expect(eyes(c).length).toBe(1);
    // 눈이 뜰 때 상태 칸이 켜진다 (bare가 지웠으니 다시 맞춘다)
    c.spawn('void-eye', 1);
    expect(star.st[LENS]).toBe(2);
    const shown = shownDmg(c, 'weapon', star);
    // 미리보기는 아무것도 바꾸지 않는다
    expect(c.s.vars['a4-lens-msg']).toBeUndefined();
    c.drain();
    expect(c.useSkill('weapon', star.uid)).toBeNull();
    const evs = c.drain();
    const hit = hitsOn(evs, star.uid, 'p');
    expect(hit.length).toBe(1);
    expect(hit[0].amount).toBe(shown);
    expect(cines(evs, 'eye').length).toBe(1);
    expect(c.useSkill('weapon', star.uid)).toBeNull();
    expect(cines(c.drain(), 'eye').length).toBe(0);

    // 눈을 모두 감기면 렌즈가 사라지고 같은 공격이 온전히 들어간다
    for (const x of eyes(c)) c.damage({ src: c.p, tgt: x, base: 9999, type: 'pierce', attack: true });
    expect(eyes(c).length).toBe(0);
    expect(star.st[LENS]).toBeUndefined();
    const full = shownDmg(c, 'weapon', star);
    expect(shown).toBe(Math.floor(full * LENS_PART));
    c.drain();
    expect(c.useSkill('weapon', star.uid)).toBeNull();
    expect(hitsOn(c.drain(), star.uid, 'p')[0].amount).toBe(full);
  });

  it('광역·무작위 공격과 지속 피해, 다른 적을 겨눈 기술이 튀어 맞힌 몫은 휘지 않는다', () => {
    const c = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    const eye = find(c, 'void-eye');
    bare(star);
    const single = c.makeUse(c.skillInfo('weapon')!);
    const aoe = useOf(c, 'w-shotgun');
    expect(aoe.def.target).toBe('front');
    const base = 20;
    const full = c.preview(c.p, star, base, 'pierce', { attack: true, skill: aoe });
    expect(c.preview(c.p, star, base, 'pierce', { attack: true, skill: single })).toBe(Math.floor(full * LENS_PART));
    // 무작위로 흩뿌리는 공격
    const scatter = [...SKILLS.values()].find((d) => d.target === 'random' && d.tags.includes('attack'))!;
    expect(c.preview(c.p, star, base, 'pierce', { attack: true, skill: useOf(c, scatter.id) })).toBe(full);
    // 실제로도: 광역 산탄은 전열의 별을 온전히 맞힌다
    c.drain();
    c.strike(aoe, null, { dmg: base, type: 'pierce' });
    expect(hitsOn(c.drain(), star.uid, 'p')[0].amount).toBe(full);
    // 눈을 겨눈 단일 기술이 별에 튄 몫
    const aimedEye = c.makeUse(c.skillInfo('weapon')!);
    aimedEye.primary = eye;
    expect(c.damage({ src: c.p, tgt: star, base, type: 'pierce', attack: true, skill: aimedEye }).amount).toBe(full);
    // 지속 피해 (출혈·독·화상)
    expect(c.damage({ src: null, tgt: star, base: 10, type: 'true', ignoreBlock: true, tags: ['dot', 'bleed'] }).amount).toBe(10);
    // 렌즈는 눈의 수를 센다 (상태 칸이 지워져도 규칙은 그대로)
    delete star.st[LENS];
    expect(c.preview(c.p, star, base, 'pierce', { attack: true, skill: single })).toBe(Math.floor(full * LENS_PART));
  });

  it('「공허의 눈을 뜬다」로 눈이 늘면 렌즈의 수도 는다. 하나라도 남아 있으면 그대로 휜다', () => {
    const c = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    expect(star.st[LENS]).toBe(1);
    act(c, star, 'eyes');
    expect(eyes(c).length).toBe(3);
    expect(star.st[LENS]).toBe(3);
    const [a, b] = eyes(c);
    c.damage({ src: c.p, tgt: a, base: 9999, type: 'fire', attack: true });
    c.damage({ src: c.p, tgt: b, base: 9999, type: 'fire', attack: true });
    expect(star.st[LENS]).toBe(1);
    bare(star);
    const single = c.makeUse(c.skillInfo('weapon')!);
    const aoe = useOf(c, 'w-shotgun');
    expect(c.preview(c.p, star, 20, 'pierce', { attack: true, skill: single })).toBe(Math.floor(c.preview(c.p, star, 20, 'pierce', { attack: true, skill: aoe }) * LENS_PART));
  });

  it('세 출신 모두 시작 덱으로 공허의 눈을 두 턴 안에 감긴다 (근접만 가진 사냥꾼도 후열의 눈에 닿는다)', () => {
    for (const origin of ORIGINS3) {
      const c = startCombat(starter4(origin), 'lord-a4', { anomaly: null });
      const eye = find(c, 'void-eye');
      for (let turn = 0; turn < 2 && !eye.dead; turn++) {
        for (const ref of ['weapon', ...(c.run.slots.filter(Boolean) as string[]), 'weapon', 'weapon', 'weapon']) {
          if (eye.dead || c.s.ap <= 0) break;
          const info = c.skillInfo(ref)!;
          if (!info.def.tags.includes('attack') || c.blockReason(ref)) continue;
          if (info.def.target === 'single' && !c.validTargets(info.def).includes(eye)) continue;
          c.useSkill(ref, eye.uid);
        }
        if (!eye.dead) c.endTurn();
      }
      expect(eye.dead, origin).toBe(true);
      expect(find(c, 'black-star').st[LENS], origin).toBeUndefined();
    }
  });
});

describe('4층 계층군주 — 검은 별: 2막 「블랙홀」', () => {
  it('체력이 절반 이하면 다음 행동이 블랙홀 (어둠 속에서도 보인다) — 남은 눈을 삼켜 회복하고 힘을 얻는다. 삼킨 눈은 빛을 돌려주지 않는다', () => {
    const run = floor4();
    run.player.insight = 0;
    const c = startCombat(run, 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    star.mem.agOff = 1;
    act(c, star, 'eyes');
    expect(eyes(c).length).toBe(3);
    star.hp = Math.floor(star.maxHp * BLACKHOLE_AT) + 1;
    expect(ai(c, star)).not.toBe('blackhole');
    star.hp = Math.floor(star.maxHp * BLACKHOLE_AT);
    c.planIntent(star);
    expect(star.intent!.move).toBe('blackhole');
    // 어둠 2에서도 블랙홀은 보인다 (지평선의 칩도 미리 뜬다)
    addDark(c, star, 2);
    c.fire(c.p, 'onTurnStart');
    expect(c.shownIntent(star)!.move).toBe('blackhole');
    expect(horizonNote(c)).not.toBeNull();

    const hp = star.hp;
    const str = star.st.str ?? 0;
    const dark = c.p.st[DARK];
    c.drain();
    act(c, star, 'blackhole');
    const evs = c.drain();
    expect(star.form).toBe(1);
    expect(star.name).toBe(COLLAPSED);
    expect(eyes(c).length).toBe(0);
    expect(star.hp).toBe(hp + HEAL_PER_EYE * 3);
    expect(star.st.str).toBe(str + BLACKHOLE_STR);
    expect(star.st[LENS]).toBeUndefined();
    expect(c.p.st[DARK]).toBe(dark);
    expect(cines(evs, 'whisper').length).toBe(1);
    // 내 처치가 아니다 (처치 효과 없음 — 삼켜졌다)
    expect(evs.filter((ev) => ev.t === 'death').length).toBe(3);
  });

  it('무너진 별은 눈을 다시 뜨지 않고, 블랙홀을 되풀이하지 않는다', () => {
    const { c, star } = collapsed();
    /** AI가 고른 행동이 걸어 두는 표시만 흉내 낸다 (힘 모으기·심판의 간격) */
    const plan = (cc: Combat, e: EnemyUnit): string => {
      cc.s.turn++;
      const m = ai(cc, e);
      if (m === 'rise') e.mem.charge = 1;
      else delete e.mem.charge;
      if (m === 'judgment') e.mem.doomAt = cc.s.turn;
      e.hist.push(m);
      return m;
    };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(plan(c, star));
    expect(seen.has('eyes')).toBe(false);
    expect(seen.has('blackhole')).toBe(false);
    expect(seen.has('spaghettify')).toBe(true);
    expect(seen.has('collapse')).toBe(true);
    expect(seen.has('judgment')).toBe(true);
    // 첫 모습은 그대로 눈을 다시 뜬다 (전투마다 EYES_MAX번)
    const c2 = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const s2 = find(c2, 'black-star');
    for (const x of eyes(c2)) c2.damage({ src: c2.p, tgt: x, base: 9999, type: 'fire', attack: true });
    let opened = 0;
    for (let i = 0; i < 30; i++) {
      if (plan(c2, s2) !== 'eyes') continue;
      opened++;
      s2.mem.eyes = (s2.mem.eyes ?? 0) + 1;
    }
    expect(opened).toBe(EYES_MAX);
  });

  it('실제 흐름: 체력을 절반 아래로 깎으면 다음 차례에 무너지고, 그 차례 끝에 첫 기술을 끌어간다', () => {
    const c = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const star = find(c, 'black-star');
    star.mem.agOff = 1;
    c.damage({ src: null, tgt: star, base: star.hp - Math.floor(star.maxHp * 0.45), type: 'true', ignoreBlock: true });
    pass(c);
    expect(star.form ?? 0).toBe(0);
    expect(star.intent!.move).toBe('blackhole');
    pass(c);
    expect(star.form).toBe(1);
    expect(sealedSkills(c).length).toBe(1);
    expect(c.p.st[HORIZON]).toBe(1);
  });
});

describe('4층 계층군주 — 검은 별: 사건의 지평선', () => {
  it('차례마다 가장 무거운 기술 하나, 한꺼번에 둘까지 — 무너진 별의 차례가 셋 지나면 돌아온다. 기본기는 끌려가지 않는다', () => {
    const { c, star } = collapsed();
    const steady = slotOf(c, 'steady');
    const aimed = slotOf(c, 'aimed-shot');
    const bash = slotOf(c, 'shield-bash');
    // 군인의 시작 덱: 재장전 말고는 모두 행동력 1 — 재사용 대기가 긴 마음 다잡기(2)가 가장 무겁고, 다음은 앞 칸의 정조준 사격
    expect(nextPull(c)!.uid).toBe(steady);
    expect(horizonNote(c)!.desc).toContain('「마음 다잡기」');
    expect(horizonNote(c)!.text).toBe('마음 다잡기');

    pass(c);
    expect(sealedSkills(c).map((s) => s.uid)).toEqual([steady]);
    expect(c.p.st[HORIZON]).toBe(1);
    expect(c.s.cd[steady]).toBe(HORIZON_TURNS);
    expect(c.blockReason(steady)).not.toBeNull();
    const sealedAt = c.s.turn;

    pass(c);
    expect(sealedSkills(c).map((s) => s.uid)).toEqual([steady, aimed]);
    expect(c.p.st[HORIZON]).toBe(HORIZON_MAX);

    // 자리가 가득 찼다 — 더 끌려가지 않는다
    pass(c);
    expect(sealedSkills(c).length).toBe(HORIZON_MAX);
    expect(c.s.cd[bash]).toBeUndefined();

    // 셋째 차례가 지나면 버티기가 돌아오고(바로 다시 끌려가지 않는다), 빈자리에 방패 강타가 끌려간다
    c.drain();
    pass(c);
    expect(c.s.turn - sealedAt).toBe(HORIZON_TURNS);
    expect(c.blockReason(steady)).toBeNull();
    expect(sealedSkills(c).map((s) => s.uid)).toEqual([aimed, bash]);
    expect(c.drain().some((ev) => ev.t === 'text' && ev.text.includes('돌아왔다'))).toBe(true);

    // 무기·방어구 기본기는 한 번도 끌려가지 않았다
    for (let i = 0; i < 6; i++) pass(c);
    expect(c.s.cd.weapon).toBeUndefined();
    expect(c.s.cd.armor).toBeUndefined();
    expect(c.blockReason('weapon')).toBeNull();
    expect(c.blockReason('armor')).toBeNull();
    expect(sealedSkills(c).length).toBeLessThanOrEqual(HORIZON_MAX);
  });

  it('행동력이 많은 기술부터 끌려간다', () => {
    const run = floor4();
    const heavy = SKILLS.get('ess-black-star-collapse')!;
    expect(heavy.cost).toBe(3);
    run.skills.push({ uid: 'heavy', id: heavy.id, lvl: 0, runes: [] });
    const free = run.slots.indexOf(null);
    if (free >= 0) run.slots[free] = 'heavy';
    else run.slots.push('heavy');
    const { c } = collapsed(run);
    expect(nextPull(c)!.uid).toBe('heavy');
    pass(c);
    expect(sealedSkills(c).map((s) => s.uid)).toEqual(['heavy']);
    expect(c.blockReason('heavy')).not.toBeNull();
  });

  it('이번 턴에 쓴 기술(재사용 대기 중)은 끌려가지 않는다 — 다음으로 무거운 것이 대신 끌려간다', () => {
    const { c } = collapsed();
    const steady = slotOf(c, 'steady');
    const aimed = slotOf(c, 'aimed-shot');
    expect(c.useSkill(steady)).toBeNull();
    expect(nextPull(c)!.uid).toBe(aimed);
    pass(c);
    expect(sealedSkills(c).map((s) => s.uid)).toEqual([aimed]);
  });

  it('붕괴·기절로 쉬는 차례에는 끌어가지 못한다 (돌아올 기술은 그래도 돌아온다)', () => {
    const { c, star } = collapsed();
    c.breakEnemy(star);
    pass(c);
    expect(sealedSkills(c).length).toBe(0);
    pass(c);
    expect(sealedSkills(c).length).toBe(1);
    c.apply(star, 'stun', 1, star);
    pass(c);
    expect(sealedSkills(c).length).toBe(1);
  });

  it('대기를 되돌리는 효과로 빼낸 기술은 지평선에서 풀려난다 (스파게티화도 바로 약해진다)', () => {
    const { c, star } = collapsed();
    pass(c);
    pass(c);
    expect(sealedSkills(c).length).toBe(2);
    force(c, star, 'spaghettify');
    expect(star.intent!.dmg).toBe(SPAG_BASE + SPAG_PER * 2);
    const [first] = sealedSkills(c);
    expect(horizonHeld(c, first.uid)).toBe(true);
    // 대기를 되돌리는 효과(허초·되감기·평정·안식)는 seized()로 끌려간 기술을 건너뛴다
    expect(seized(c, first.uid)).toBe(true);
    delete c.s.cd[first.uid];
    expect(seized(c, first.uid)).toBe(false);
    expect(horizonHeld(c, first.uid)).toBe(false);
    expect(sealedSkills(c).length).toBe(1);
    // 기술을 쓰면 준비하던 스파게티화가 다시 센다
    expect(c.useSkill('weapon', star.uid)).toBeNull();
    expect(star.intent!.dmg).toBe(SPAG_BASE + SPAG_PER);
    // 다시 써서 대기가 생겨도 끌려간 것으로 치지 않는다
    expect(c.useSkill(first.uid, star.uid)).toBeNull();
    expect(sealedSkills(c).length).toBe(1);
  });

  it('호킹 복사: 무너진 별을 붕괴시키면 끌려간 기술이 모두 바로 돌아오고, 하나마다 최대 체력의 일부를 잃는다', () => {
    const { c, star } = collapsed();
    pass(c);
    pass(c);
    const held = sealedSkills(c);
    expect(held.length).toBe(2);
    const hp = star.hp;
    c.drain();
    c.breakEnemy(star);
    const evs = c.drain();
    expect(sealedSkills(c).length).toBe(0);
    expect(c.p.st[HORIZON]).toBeUndefined();
    for (const s of held) expect(c.blockReason(s.uid)).toBeNull();
    expect(hawkingDmg(star)).toBe(Math.round(star.maxHp * HAWKING_PCT));
    expect(star.hp).toBe(hp - hawkingDmg(star) * 2);
    expect(cines(evs, 'beam').length).toBe(1);
    // 끌려간 것이 없으면 아무 일도 없다 (첫 모습의 붕괴도)
    const hp2 = star.hp;
    star.broken = 0;
    star.poise = star.maxPoise;
    c.breakEnemy(star);
    expect(star.hp).toBe(hp2);
    const c2 = startCombat(floor4(), 'lord-a4', { anomaly: null });
    const s2 = find(c2, 'black-star');
    const hp3 = s2.hp;
    c2.breakEnemy(s2);
    expect(s2.hp).toBe(hp3);
  });

  it('스파게티화: 끌려간 기술 하나마다 세지고, 의도에 보인 그대로 맞는다', () => {
    const { c, star } = collapsed();
    star.st = {};
    for (let n = 0; n <= HORIZON_MAX; n++) {
      if (n > 0) pass(c);
      expect(sealedSkills(c).length).toBe(n);
      expect(spagDmg(c)).toBe(SPAG_BASE + SPAG_PER * n);
      star.st = {};
      force(c, star, 'spaghettify');
      expect(star.intent!.dmg).toBe(SPAG_BASE + SPAG_PER * n);
      const shown = c.preview(star, c.p, star.intent!.dmg!, 'blunt');
      c.p.block = 0;
      c.drain();
      act(c, star, 'spaghettify');
      const hit = hitsOn(c.drain(), 'p', star.uid);
      expect(hit.length).toBe(1);
      expect(hit[0].amount).toBe(shown);
      expect(hit[0].dtype).toBe('void');
    }
  });

  it('끌려간 기술은 저장했다 불러와도 그대로 이어진다', () => {
    const run = floor4();
    const { c } = collapsed(run);
    pass(c);
    const held = sealedSkills(c);
    expect(held.length).toBe(1);
    const c2 = new Combat(JSON.parse(JSON.stringify(run)) as RunState);
    expect(sealedSkills(c2)).toEqual(held);
    expect(find(c2, 'black-star').form).toBe(1);
    pass(c2);
    expect(sealedSkills(c2).length).toBe(2);
  });

  it('시작 덱으로도 싸울 수 있다: 둘이 끌려가도 무기·방어구 기본기와 남은 기술로 버티고, 끌려간 기술은 저절로 돌아온다 (세 출신)', () => {
    for (const origin of ORIGINS3) {
      const { c, star } = collapsed(starter4(origin));
      c.p.hp = c.p.maxHp = 9999;
      c.p.sanity = c.p.maxSanity = 9999;
      pass(c);
      pass(c);
      expect(sealedSkills(c).length, origin).toBe(HORIZON_MAX);
      expect(c.blockReason('weapon'), origin).toBeNull();
      expect(c.blockReason('armor'), origin).toBeNull();
      const usable = (c.run.slots.filter(Boolean) as string[]).filter((r) => !c.blockReason(r));
      expect(usable.length, origin).toBeGreaterThan(0);
      expect(c.useSkill('weapon', star.uid), origin).toBeNull();
      // 붕괴시키지 않아도 돌아온다 (돌아온 내 턴에 쓰지 않으면 다음 차례에 또 끌려갈 수 있다)
      const first = sealedSkills(c)[0];
      let back = false;
      for (let i = 0; i < HORIZON_TURNS && !back; i++) {
        pass(c);
        back = !((c.s.cd[first.uid] ?? 0) > 0);
      }
      expect(back, origin).toBe(true);
      expect(c.s.turn, origin).toBe(first.back);
    }
  });
});

describe('4층 계층군주 — 검은 별: 글과 봇', () => {
  it('새 특성·상태 설명에 긴 줄표가 없고, 수치는 상수와 맞는다', () => {
    const lens = TRAITS.get('a4-lens')!;
    const horizon = TRAITS.get('a4-event-horizon')!;
    expect(TRAITS.get('a4-gravity-well')).toBeTruthy();
    expect(lens.desc).toContain(`${Math.round(LENS_PART * 100)}%`);
    expect(horizon.desc).toContain(`${HORIZON_MAX}개까지`);
    expect(horizon.desc).toContain(`${HORIZON_TURNS}번`);
    expect(horizon.desc).toContain(`${Math.round(HAWKING_PCT * 100)}%`);
    const moves = ENEMIES.get('black-star')!.moves;
    expect(moves.blackhole.desc).toContain(`${HEAL_PER_EYE}`);
    expect(moves.spaghettify.desc).toContain(`${SPAG_BASE}`);
    expect(moves.spaghettify.desc).toContain(`+${SPAG_PER}`);
    for (const t of [lens, horizon, TRAITS.get('a4-gravity-well')!]) expect(t.desc.includes('—'), t.id).toBe(false);
    for (const id of [LENS, HORIZON, DARK]) expect(STATUSES.get(id)!.desc.includes('—'), id).toBe(false);
    for (const m of Object.values(moves)) expect((m.desc ?? '').includes('—'), m.name).toBe(false);
  });

  it('봇이 끝까지 이긴다 — 렌즈·블랙홀·지평선을 모두 지나며 (세 출신, 튼튼한 몸)', () => {
    for (const origin of ORIGINS3) {
      const c = startCombat(floor4(23, origin), 'lord-a4', { anomaly: null });
      let n = 0;
      let sealed = 0;
      while (!c.over && n++ < 300) {
        autoTurn(c);
        sealed = Math.max(sealed, sealedSkills(c).length);
      }
      expect(c.s.phase, origin).toBe('victory');
      expect(find(c, 'black-star'), origin).toBeUndefined();
      expect(c.s.enemies.find((x) => x.def === 'black-star')!.form, origin).toBe(1);
      expect(sealed, origin).toBeGreaterThan(0);
    }
  });
});
