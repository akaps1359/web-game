import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, GUARD, type CombatEvent } from '../src/engine/combat';
import { RUNES, SKILLS } from '../src/engine/registry';
import { startCombat, newRun, type RunState } from '../src/engine/run';
import { HUMAN_SCHOOLS, dismantlePool, dismantleToRune, runeSchool, skillSchools } from '../src/engine/schools';
import type { DmgType, EnemyUnit, School } from '../src/engine/types';
import { GAP, GAP_ID, GAP_RULE, closeGap, gapBonusText, gapHarvestHint, gapInfo, gapList, gapStats, harvestsLeft, openGap } from '../src/content/gap';
import { autoTurn } from '../src/sim/bot';

// 틈의 셈만 본다: 버팀이 남은 적이 덜 받는 배율은 끈다 (버팀 99라야 틈이 열린다. 버팀 자체는 tests/guard.test.ts)
GUARD.mult = 1;

/**
 * 깨끗한 주인공(유물·장신구·정수 없음, 체력 넉넉)으로 「깡패(전열) + 입문자 둘(후열)」 전투.
 * 적은 약점·저항·상태 없이 체력 999, 버팀 99 — 약점은 시험마다 정한다
 */
function arena(skills: { id: string; rune?: string; lvl?: number }[], o: { weapon?: string; insight?: number } = {}): Combat {
  const run = newRun({ seed: 2026, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: o.weapon ? { uid: 'w', id: o.weapon, lvl: 0 } : null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  run.player.maxSanity = 100;
  run.player.sanity = 80;
  run.player.insight = o.insight ?? 0;
  run.skills = skills.map((s, i) => ({ uid: `s${i}`, id: s.id, lvl: s.lvl ?? 0, runes: s.rune ? [s.rune] : [] }));
  run.slots = run.skills.map((s) => s.uid);
  const c = startCombat(run, 'a1-cult', { anomaly: null });
  c.s.ap = 30;
  for (const e of c.s.enemies) {
    e.hp = e.maxHp = 999;
    e.block = 0;
    e.weak = [];
    e.known = [];
    e.resist = {};
    e.st = {};
    e.poise = e.maxPoise = 99;
  }
  c.drain();
  return c;
}

const front = (c: Combat) => c.row(0)[0];
const back = (c: Combat, i = 0) => c.row(1)[i];
const weak = (e: EnemyUnit, ...t: DmgType[]) => {
  e.weak = t;
};
const evs = <T extends CombatEvent['t']>(list: CombatEvent[], t: T) => list.filter((ev): ev is Extract<CombatEvent, { t: T }> => ev.t === t);
const dmgTo = (list: CombatEvent[], uid: string) => evs(list, 'dmg').filter((d) => d.tgt === uid);
/** 기술을 쓰고(재사용 대기 무시) 그 사이 이벤트를 돌려준다 */
const use = (c: Combat, ref: string, uid?: string | null) => {
  delete c.s.cd[ref];
  expect(c.useSkill(ref, uid), `${ref} 사용`).toBeNull();
  return c.drain();
};
/** 틈을 열어 두고 그 이벤트는 비운다 */
const setGap = (c: Combat, e: EnemyUnit, school: School, big = false) => {
  openGap(c, e, school, big);
  c.drain();
};

describe('틈: 열기', () => {
  it('약점으로 버팀을 깎으면 그 기술의 계열 색으로 틈이 열린다 (내 다음 턴이 끝날 때까지)', () => {
    const c = arena([{ id: 'aimed-shot' }]);
    const e = front(c);
    weak(e, 'pierce');
    const ev = use(c, 's0', e.uid);
    expect(gapInfo(c, e.uid)).toEqual({ uid: e.uid, school: 'firearm', big: false, turns: 2 });
    expect(e.st[GAP_ID]).toBe(1);
    expect(evs(ev, 'gap-open')).toMatchObject([{ uid: e.uid, school: 'firearm', big: false, turns: 2 }]);
    expect(gapStats(c.s).open).toBe(1);
  });

  it('약점이 아니면 버팀을 깎아도 열리지 않는다', () => {
    const c = arena([{ id: 'aimed-shot' }]);
    const e = front(c);
    use(c, 's0', e.uid);
    expect(e.poise).toBe(98);
    expect(gapInfo(c, e.uid)).toBeNull();
  });

  it('무기 기본 공격은 무기의 계열 색 (사냥칼 = 검술, 리볼버 = 사격, 의식용 단검 = 비술)', () => {
    for (const [weapon, type, school] of [
      ['knife', 'slash', 'blade'],
      ['revolver', 'pierce', 'firearm'],
      ['athame', 'arcane', 'occult'],
    ] as const) {
      const c = arena([], { weapon });
      const e = front(c);
      weak(e, type);
      use(c, 'weapon', e.uid);
      expect(gapInfo(c, e.uid)?.school, weapon).toBe(school);
    }
  });

  it('붕괴시키면 그 기술 색의 큰 틈 (기술 없이 깨지면 열리지 않는다)', () => {
    const c = arena([{ id: 'arcane-bolt' }]);
    const e = front(c);
    weak(e, 'arcane');
    e.poise = 1;
    const ev = use(c, 's0', e.uid);
    expect(e.broken).toBe(2);
    expect(gapInfo(c, e.uid)).toMatchObject({ school: 'occult', big: true });
    expect(evs(ev, 'gap-open')).toMatchObject([{ uid: e.uid, school: 'occult', big: true }]);
    const e2 = back(c);
    c.breakEnemy(e2);
    expect(gapInfo(c, e2.uid)).toBeNull();
    expect(gapStats(c.s).bigOpen).toBe(1);
  });

  it('적마다 틈은 하나 — 새로 열리면 색이 바뀐다', () => {
    const c = arena([{ id: 'aimed-shot' }, { id: 'serrate' }]);
    const e = front(c);
    weak(e, 'pierce', 'slash');
    // 이번 턴 거두기를 다 썼다 → 다른 계열로 쳐도 거두지 못하고 새로 연다
    c.s.vars['gap:t'] = c.s.turn;
    c.s.vars['gap:n'] = GAP.perTurn;
    use(c, 's0', e.uid);
    expect(gapInfo(c, e.uid)?.school).toBe('firearm');
    use(c, 's1', e.uid);
    expect(gapInfo(c, e.uid)?.school).toBe('blade');
    expect(gapList(c).length).toBe(1);
  });

  it('공용 기술(계열 없음)은 틈을 열지 못한다', () => {
    const c = arena([{ id: 'shove' }]);
    const e = front(c);
    weak(e, 'blunt');
    use(c, 's0', e.uid);
    expect(gapInfo(c, e.uid)).toBeNull();
  });
});

describe('틈: 거두기', () => {
  it('다른 계열로 치면 틈을 거두고 그 계열의 보너스 하나 (결의: 방어도)', () => {
    const c = arena([{ id: 'shield-bash' }]);
    const e = front(c);
    setGap(c, e, 'firearm');
    const poise = e.poise;
    const ev = use(c, 's0', e.uid);
    expect(gapInfo(c, e.uid)).toBeNull();
    expect(e.poise).toBe(poise - GAP.poise);
    expect(evs(ev, 'gap-harvest')).toMatchObject([{ uid: e.uid, school: 'resolve', from: 'firearm', big: false }]);
    expect(c.p.block).toBe(GAP.block);
    expect(gapStats(c.s)).toMatchObject({ harvest: 1, by: { resolve: 1 } });
  });

  it('같은 계열로 치면 아무 일도 없고 틈이 남는다', () => {
    const c = arena([{ id: 'aimed-shot' }]);
    const e = front(c);
    setGap(c, e, 'firearm');
    const ev = use(c, 's0', e.uid);
    expect(gapInfo(c, e.uid)?.school).toBe('firearm');
    expect(evs(ev, 'gap-harvest').length).toBe(0);
    expect(dmgTo(ev, e.uid)[0].amount).toBe(10);
    expect(e.poise).toBe(98); // 정조준 사격 자체의 버팀 -1만
    expect(gapStats(c.s)).toMatchObject({ harvest: 0, same: 1 });
  });

  it('계열별 보너스는 하나씩: 검술 출혈 · 비술 인장 · 연금 독 · 금기 정신력', () => {
    const cases: [string, School, (c: Combat, e: EnemyUnit) => number, number][] = [
      ['quick-cut', 'blade', (_c, e) => e.st.bleed ?? 0, GAP.bleed],
      ['arcane-bolt', 'occult', (_c, e) => e.st.mark ?? 0, GAP.mark],
      ['fire-flask', 'alchemy', (_c, e) => e.st.poison ?? 0, GAP.poison],
      ['mind-rend', 'forbidden', (c) => c.p.sanity, 0],
    ];
    for (const [id, school, get, want] of cases) {
      if (!SKILLS.has(id)) continue;
      const c = arena([{ id }]);
      const e = front(c);
      const other: School = school === 'blade' ? 'occult' : 'blade';
      // 그 기술만 썼을 때
      const plain = arena([{ id }]);
      use(plain, 's0', front(plain).uid);
      setGap(c, e, other);
      const ev = use(c, 's0', e.uid);
      expect(evs(ev, 'gap-harvest'), id).toMatchObject([{ school }]);
      if (school === 'forbidden') expect(get(c, e) - get(plain, front(plain)), id).toBe(GAP.sanity);
      else expect(get(c, e) - get(plain, front(plain)), id).toBe(want);
    }
  });

  it('사격: 이 타격 치명(피해 1.5배), 조준은 쓰지 않는다 (조준 치명 2배가 크면 그대로). 큰 틈은 2배', () => {
    const c = arena([{ id: 'aimed-shot' }]);
    const e = front(c);
    setGap(c, e, 'resolve');
    c.p.st.aim = 1;
    expect(dmgTo(use(c, 's0', e.uid), e.uid)[0]).toMatchObject({ amount: 20, crit: true });
    expect(c.p.st.aim).toBe(1);
    delete c.p.st.aim;
    setGap(c, e, 'occult');
    expect(dmgTo(use(c, 's0', e.uid), e.uid)[0]).toMatchObject({ amount: 15, crit: true });
    c.endTurn(); // 거두기 횟수(턴당 2회)를 새로
    c.drain();
    setGap(c, e, 'occult', true);
    expect(dmgTo(use(c, 's0', e.uid), e.uid)[0].amount).toBe(20);
  });

  it('큰 틈은 보너스 2배', () => {
    const c = arena([{ id: 'shield-bash' }]);
    const e = front(c);
    setGap(c, e, 'blade', true);
    use(c, 's0', e.uid);
    expect(c.p.block).toBe(GAP.block * GAP.big);
  });

  it('미리보기는 거둔 피해를 보이지만 틈을 쓰지 않는다', () => {
    const c = arena([{ id: 'aimed-shot' }]);
    const e = front(c);
    setGap(c, e, 'blade');
    const info = c.skillInfo('s0')!;
    expect(c.preview(c.p, e, 10, 'pierce', { skill: c.makeUse(info) })).toBe(15);
    expect(c.preview(c.p, e, 10, 'pierce', { skill: c.makeUse(info), repeat: true })).toBe(10);
    expect(gapInfo(c, e.uid)?.school).toBe('blade');
  });
});

describe('틈: 안전장치', () => {
  it('같은 기술 사용으로 열고 거둘 수 없다 (두 계열 기술의 둘째 타격·메아리 사본도)', () => {
    // 연속 베기(검술, 2회) + 탄창 각인(사격): 첫 타격이 검술 틈을 열고, 둘째 타격은 사격이지만 거두지 못한다
    const c = arena([{ id: 'quick-cut', rune: 'x-magazine-rune' }]);
    const e = front(c);
    weak(e, 'slash');
    const ev = use(c, 's0', e.uid);
    expect(evs(ev, 'gap-open').length).toBeGreaterThanOrEqual(1);
    expect(evs(ev, 'gap-harvest').length).toBe(0);
    expect(gapInfo(c, e.uid)?.school).toBe('blade');
    // 다음 사용은 사격으로 거둔다
    expect(evs(use(c, 's0', e.uid), 'gap-harvest')).toMatchObject([{ school: 'firearm', from: 'blade' }]);
    // 메아리 사본은 같은 사용이다
    const d = arena([{ id: 'quick-cut', rune: 'echo' }]);
    const t = front(d);
    weak(t, 'slash');
    setGap(d, t, 'occult');
    expect(evs(use(d, 's0', t.uid), 'gap-harvest').length).toBe(1);
    expect(gapInfo(d, t.uid)?.school).toBe('blade');
  });

  it('거두기는 턴당 2회까지 (다음 턴에 다시)', () => {
    const c = arena([{ id: 'sigil' }, { id: 'fire-flask' }, { id: 'poison-dart' }]);
    const targets = [back(c, 0), back(c, 1), front(c)];
    for (const e of targets) setGap(c, e, 'firearm');
    let harvested = 0;
    targets.forEach((e, i) => {
      harvested += evs(use(c, `s${i}`, e.uid), 'gap-harvest').length;
    });
    expect(harvested).toBe(GAP.perTurn);
    expect(harvestsLeft(c)).toBe(0);
    expect(gapInfo(c, targets[2].uid)?.school).toBe('firearm');
    expect(gapHarvestHint(c, 's0', targets[2].uid)).toBeNull();
    c.endTurn();
    c.drain();
    expect(harvestsLeft(c)).toBe(GAP.perTurn);
    expect(evs(use(c, 's0', targets[2].uid), 'gap-harvest').length).toBe(1);
  });

  it('통찰 2 이상이면 한 턴 더 남는다', () => {
    for (const [insight, turns] of [
      [0, 2],
      [1, 2],
      [2, 3],
      [5, 3],
    ] as const) {
      const c = arena([{ id: 'aimed-shot' }], { insight });
      const e = front(c);
      weak(e, 'pierce');
      use(c, 's0', e.uid);
      expect(gapInfo(c, e.uid)?.turns, `통찰 ${insight}`).toBe(turns);
      for (let i = 1; i < turns; i++) {
        c.endTurn();
        expect(gapInfo(c, e.uid)?.turns, `통찰 ${insight}, ${i}턴 뒤`).toBe(turns - i);
      }
      c.endTurn();
      expect(gapInfo(c, e.uid), `통찰 ${insight}: 닫힘`).toBeNull();
      expect(e.st[GAP_ID]).toBeUndefined();
    }
  });

  it('무한 고리 없음: 보너스는 행동력·재사용 대기를 주지 않고, 계열을 번갈아 끝없이 쳐도 한 턴 거두기는 2회', () => {
    const c = arena([{ id: 'shield-bash' }, { id: 'aimed-shot' }, { id: 'sigil' }, { id: 'poison-dart' }]);
    const e = front(c);
    weak(e, 'blunt', 'pierce', 'arcane');
    setGap(c, e, 'firearm');
    const ap = c.s.ap;
    use(c, 's0', e.uid);
    expect(c.s.ap).toBe(ap - 1);
    expect(c.s.cd.s0).toBe(1);
    c.s.ap = 99;
    let h = 0;
    for (let i = 0; i < 12; i++) h += evs(use(c, `s${(i % 3) + 1}`, e.uid), 'gap-harvest').length;
    expect(h).toBe(GAP.perTurn - 1);
    expect(c.s.vars['gap:n']).toBe(GAP.perTurn);
  });

  it('봇으로 여러 턴 싸워도 한 턴 거두기는 2회를 넘지 않고 전투가 끝난다', () => {
    const c = arena([{ id: 'shield-bash' }, { id: 'aimed-shot' }, { id: 'serrate' }, { id: 'fire-flask', rune: 'mark-rune' }], { weapon: 'revolver' });
    for (const e of c.s.enemies) {
      e.hp = e.maxHp = 120;
      e.poise = e.maxPoise = 4;
      e.weak = ['pierce', 'blunt', 'slash', 'fire'];
    }
    let turns = 0;
    let maxPerTurn = 0;
    while (!c.over && turns++ < 60) {
      autoTurn(c);
      maxPerTurn = Math.max(maxPerTurn, c.s.vars['gap:n'] ?? 0);
    }
    expect(c.s.phase).toBe('victory');
    expect(maxPerTurn).toBeLessThanOrEqual(GAP.perTurn);
    expect(gapStats(c.s).harvest).toBeGreaterThan(0);
  });
});

describe('계열 각인', () => {
  it('각인 계열 표: 출혈·연계 = 검술, 탄창 = 사격, 인장 = 비술, 화염·독 = 연금, 수호 = 결의, 공허·피 = 금기, 나머지 무계열', () => {
    const want: Record<string, School> = {
      'bleed-rune': 'blade',
      'x-combo-rune': 'blade',
      'x-magazine-rune': 'firearm',
      'mark-rune': 'occult',
      'burn-rune': 'alchemy',
      'x-venom-rune': 'alchemy',
      'ward-rune': 'resolve',
      'void-rune': 'forbidden',
      'x-blood-rune': 'forbidden',
    };
    const names: Partial<Record<School, string>> = { blade: '검술', firearm: '사격', occult: '비술', alchemy: '연금', resolve: '결의', forbidden: '금기' };
    for (const r of RUNES.values()) {
      expect(runeSchool(r.id), r.id).toBe(want[r.id] ?? null);
      if (r.school) expect(r.desc, r.id).toMatch(new RegExp(`. ${names[r.school]} 계열$`));
      else expect(r.desc, r.id).not.toContain('계열');
    }
    for (const s of HUMAN_SCHOOLS) expect([...RUNES.values()].some((r) => r.school === s), s).toBe(true);
  });

  it('계열 각인을 새긴 스킬은 그 계열로도 친다 (기술 자신 → 합기 → 각인 순, 계열 없으면 빈 배열)', () => {
    expect(skillSchools(null, { id: 'aimed-shot', runes: ['bleed-rune'] })).toEqual(['firearm', 'blade']);
    expect(skillSchools(null, { id: 'aimed-shot', runes: ['x-magazine-rune'] })).toEqual(['firearm']);
    expect(skillSchools(null, { id: 'aimed-shot', runes: ['echo'] })).toEqual(['firearm']);
    expect(skillSchools(null, { id: 'shove', runes: [] })).toEqual([]);
    expect(skillSchools(null, { id: 'shove', runes: ['mark-rune'] })).toEqual(['occult']);
    expect(skillSchools(null, { id: 'w-knife', runes: [] })).toEqual(['blade']);
    const essence = [...SKILLS.values()].find((d) => d.school === 'essence')!;
    expect(skillSchools(null, { id: essence.id, runes: ['x-venom-rune'] })).toEqual(['alchemy']);
    const duo = [...SKILLS.values()].find((d) => d.duo);
    if (duo) expect(skillSchools(null, { id: duo.id, runes: [] }).sort()).toEqual([...duo.duo!].sort());
  });

  it('두 계열이면 틈의 색과 다른 쪽으로 거둔다', () => {
    // 정조준 사격(사격) + 출혈 각인(검술): 사격 틈은 검술로 거둔다
    const c = arena([{ id: 'aimed-shot', rune: 'bleed-rune' }]);
    const e = front(c);
    setGap(c, e, 'firearm');
    expect(evs(use(c, 's0', e.uid), 'gap-harvest')).toMatchObject([{ school: 'blade', from: 'firearm' }]);
    // 다른 색이면 기술 자신의 계열로
    setGap(c, e, 'occult');
    expect(evs(use(c, 's0', e.uid), 'gap-harvest')).toMatchObject([{ school: 'firearm' }]);
  });

  it('탄창 각인은 총이 아닌 스킬에도 새긴다 (사격으로도 친다)', () => {
    expect(RUNES.get('x-magazine-rune')!.fits!(SKILLS.get('quick-cut')!)).toBe(true);
    expect(RUNES.get('x-magazine-rune')!.fits!(SKILLS.get('w-revolver')!)).toBe(false);
  });

  it('기술서 해체: 보상의 스킬을 그 계열의 각인 하나로 바꾼다 (보상 선택을 쓴다)', () => {
    const run = newRun({ seed: 7, origin: 'hunter' });
    expect(dismantlePool('serrate').sort()).toEqual(['bleed-rune', 'x-combo-rune']);
    expect(dismantlePool('shove')).toEqual([]);
    run.reward = { source: 'normal', gold: 0, xp: 0, items: [], choice: [{ kind: 'skill', id: 'serrate' }, { kind: 'skill', id: 'shove' }], chosen: false, next: 'dungeon' };
    expect(dismantleToRune(run, 'shove')).not.toBeNull();
    const runes = run.runes.length;
    expect(dismantleToRune(run, 'serrate')).toBeNull();
    expect(run.runes.length).toBe(runes + 1);
    expect(['bleed-rune', 'x-combo-rune']).toContain(run.runes[run.runes.length - 1]);
    expect(run.reward.chosen).toBe(true);
    expect(run.reward.choice![0]).toMatchObject({ kind: 'rune', taken: true });
    expect(dismantleToRune(run, 'serrate')).not.toBeNull();
  });
});

describe('틈: 화면 연결과 저장', () => {
  it('gapHarvestHint: 거두면 무엇을 얻는지 한 줄, 같은 계열·틈 없음·공격 아님은 null', () => {
    const c = arena([{ id: 'aimed-shot' }, { id: 'arcane-bolt' }, { id: 'steady' }, { id: 'quick-cut' }]);
    const e = front(c);
    expect(gapHarvestHint(c, 's0', e.uid)).toBeNull();
    setGap(c, e, 'occult');
    // 거두는 타격의 버팀 감소 (GAP.poise)도 함께 적힌다
    const poise = GAP.poise ? `, 버팀 -${GAP.poise}` : '';
    expect(gapHarvestHint(c, 's0', e.uid)).toBe(`틈 거두기: 치명(피해 1.5배)${poise}`);
    expect(gapHarvestHint(c, 's3', e.uid)).toBe(`틈 거두기: 출혈 2${poise}`);
    expect(gapHarvestHint(c, 's1', e.uid)).toBeNull();
    expect(gapHarvestHint(c, 's2', e.uid)).toBeNull();
    setGap(c, e, 'occult', true);
    expect(gapHarvestHint(c, 's3', e.uid)).toBe(`큰 틈 거두기: 출혈 4${poise}`);
  });

  it('보너스 문구와 규칙은 한 줄씩', () => {
    for (const s of HUMAN_SCHOOLS) {
      const t = gapBonusText(s);
      expect(t.length, s).toBeGreaterThan(0);
      expect(t.length, s).toBeLessThanOrEqual(16);
      expect(t.includes('면'), s).toBe(false); // 조건 없는 효과 하나
    }
    expect(GAP_RULE.includes('—')).toBe(false);
  });

  it('JSON으로 저장했다 불러와도 틈이 그대로이고 거둘 수 있다', () => {
    const c = arena([{ id: 'aimed-shot' }, { id: 'shield-bash' }]);
    const e = front(c);
    weak(e, 'pierce');
    use(c, 's0', e.uid);
    const saved = JSON.parse(JSON.stringify(c.run)) as RunState;
    const c2 = new Combat(saved);
    expect(gapInfo(c2, e.uid)).toEqual(gapInfo(c, e.uid));
    expect(evs(use(c2, 's1', e.uid), 'gap-harvest')).toMatchObject([{ school: 'resolve', from: 'firearm' }]);
    expect(gapStats(c2.s)).toMatchObject({ open: 1, harvest: 1 });
  });

  it('닫은 틈은 흔적을 남기지 않는다', () => {
    const c = arena([]);
    const e = front(c);
    openGap(c, e, 'blade');
    closeGap(e);
    expect(gapInfo(c, e.uid)).toBeNull();
    expect(Object.keys(e.mem).filter((k) => k.startsWith('gap'))).toEqual([]);
  });
});

describe('봇', () => {
  it('틈이 열린 적이 있으면 다른 계열 기술로 거둔다', () => {
    // 같은 피해의 두 기술: 비전 화살(비술)과 정조준 사격(사격). 비술 틈이 열린 적에게는 사격으로
    const c = arena([{ id: 'arcane-bolt' }, { id: 'aimed-shot' }]);
    c.s.ap = 1;
    setGap(c, back(c, 1), 'occult');
    autoTurn(c);
    expect(gapStats(c.s).by.firearm).toBe(1);
  });

  it('비슷한 값이면 틈을 거두는 쪽을 고른다 (검술 틈: 연속 베기보다 방패 강타)', () => {
    const c = arena([{ id: 'quick-cut' }, { id: 'shield-bash' }]);
    c.s.ap = 1;
    setGap(c, front(c), 'blade');
    autoTurn(c);
    expect(gapStats(c.s).by.resolve).toBe(1);
  });
});
