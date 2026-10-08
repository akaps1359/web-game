import { describe, expect, it } from 'vitest';
import { icons } from '@iconify-json/game-icons';
import '../src/content';
import type { Combat } from '../src/engine/combat';
import { RELICS, RUNES, SKILLS } from '../src/engine/registry';
import { CLUE, KEYWORDS, SCHOOLS6, clueLinks, clueMult, clueReason, crossesSchools, foreignReads, isBridge, isClue } from '../src/engine/keywords';
import { ORIGIN_WEIGHT, gainRelic, newRun, originWeight, rollChoice, rollSkills, startCombat, type RunState } from '../src/engine/run';
import type { Keyword, School, SkillDef } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';

/** 계열 스킬: 사람의 여섯 계열과 공용 (기본 공격·방어구 기본기·정수 기술은 뺀다) */
const schoolSkills = [...SKILLS.values()].filter((d) => d.school !== 'essence' && !d.tags.includes('basic') && d.rarity !== 'basic');
/** 보상에 나오는 계열 스킬 (창세 제외) */
const poolSkills = schoolSkills.filter((d) => d.pool !== false && SCHOOLS6.includes(d.school));
const BRIDGES = [...SKILLS.values()].filter((d) => d.id.startsWith('br-'));
/** 태그가 달린 모든 스킬 (무기·방어구 기본기 포함) */
const tagged = [...SKILLS.values()].filter((d) => d.school !== 'essence' && (d.makes?.length || d.reads?.length));

const makers = (k: Keyword, sc: School) => tagged.filter((d) => d.school === sc && d.makes?.includes(k));
const readerSchools = (k: Keyword) => new Set(tagged.filter((d) => SCHOOLS6.includes(d.school) && d.reads?.includes(k)).map((d) => d.school));

describe('상처의 문법: 키워드 표', () => {
  it('키워드 14종이 표에 있고, 스킬 태그는 모두 표의 키워드다', () => {
    expect(KEYWORDS.size).toBe(14);
    for (const d of tagged) for (const k of [...(d.makes ?? []), ...(d.reads ?? [])]) expect(KEYWORDS.has(k), `${d.id}: ${k}`).toBe(true);
  });

  it('키워드마다 읽는 계열(1차 계열 제외)이 둘 이상이고, 표의 읽는 계열과 실제 스킬 태그가 같다', () => {
    for (const kw of KEYWORDS.values()) {
      const actual = [...readerSchools(kw.id)].filter((sc) => sc !== kw.primary).sort();
      expect(actual.length, `${kw.name}: 읽는 계열`).toBeGreaterThanOrEqual(2);
      expect(actual, `${kw.name}: 표의 readers`).toEqual([...kw.readers].sort());
      expect(kw.readers.includes(kw.primary), kw.name).toBe(false);
    }
  });

  it('1차 계열이 가장 많이 만들고, 2차 계열도 만든다. 그 밖의 계열은 많아야 한 장 (공용·누구나 만드는 키워드 제외)', () => {
    for (const kw of KEYWORDS.values()) {
      expect(kw.primary === kw.secondary, kw.name).toBe(false);
      if (kw.primary === 'neutral') continue;
      const first = makers(kw.id, kw.primary).length;
      const second = makers(kw.id, kw.secondary).length;
      expect(second, `${kw.name}: 2차 ${kw.secondary}`).toBeGreaterThanOrEqual(1);
      expect(first, `${kw.name}: 1차 ${kw.primary}가 2차보다 적다`).toBeGreaterThanOrEqual(second);
      if (kw.universal) continue;
      for (const sc of SCHOOLS6) {
        if (sc === kw.primary || sc === kw.secondary) continue;
        expect(makers(kw.id, sc).map((d) => d.id).length, `${kw.name}: ${sc}가 너무 많이 만든다`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('상처의 문법: 스킬 태그', () => {
  it('모든 계열 스킬(공용·창세 포함)에 makes/reads가 있다', () => {
    for (const d of schoolSkills) {
      expect(Array.isArray(d.makes), `${d.id}: makes`).toBe(true);
      expect(Array.isArray(d.reads), `${d.id}: reads`).toBe(true);
    }
  });

  it('무기 기본 공격도 만드는 키워드를 단다 (사냥칼 = 출혈, 의식용 단검 = 인장, 횃불 = 화상)', () => {
    expect(SKILLS.get('w-knife')!.makes).toEqual(['bleed']);
    expect(SKILLS.get('w-athame')!.makes).toEqual(['mark']);
    expect(SKILLS.get('w-torch')!.makes).toEqual(['burn']);
    expect(SKILLS.get('w-hatchet')!.reads).toEqual(['bleed']);
  });

  it('계열마다 계열을 잇는 스킬이 3장 이상, 그 계열 스킬의 약 1/3 (남의 키워드를 읽는 글루도 3장 이상)', () => {
    for (const sc of SCHOOLS6) {
      const list = poolSkills.filter((d) => d.school === sc);
      // 계열을 잇는 스킬: 남의 키워드를 읽거나(글루) 두 계열로 치는 것(예전 합기)
      const glue = list.filter(crossesSchools);
      expect(glue.length, `${sc} 글루`).toBeGreaterThanOrEqual(3);
      expect(glue.length / list.length, `${sc} 글루 비율 ${glue.length}/${list.length}`).toBeGreaterThanOrEqual(0.25);
      expect(list.filter(isBridge).length, `${sc} 남의 키워드를 읽는 스킬`).toBeGreaterThanOrEqual(3);
    }
  });

  it('남의 계열 키워드만 글루로 센다 (자기 계열 깊이 보상은 아니다)', () => {
    expect(isBridge(SKILLS.get('hemorrhage')!)).toBe(false);
    expect(isBridge(SKILLS.get('duo-blood-sigil')!)).toBe(true);
    expect(foreignReads(SKILLS.get('x-opportunist')!)).toEqual([]);
  });
});

describe('계열을 잇는 스킬 (br-)', () => {
  it('희귀 이하·금기 등급, 보상 풀에 있고, 아이콘이 있고, 설명의 {키}가 vals에 있다', () => {
    expect(BRIDGES.length).toBeGreaterThanOrEqual(20);
    for (const d of BRIDGES) {
      expect(isBridge(d) || (d.makes ?? []).length > 0, d.id).toBe(true);
      expect(d.pool, d.id).not.toBe(false);
      expect(d.school === 'forbidden' ? ['forbidden'] : ['common', 'uncommon', 'rare'], d.id).toContain(d.rarity);
      expect(d.icon.startsWith('gi:') && !!icons.icons[d.icon.slice(3)], `${d.id}: ${d.icon}`).toBe(true);
      for (const m of d.desc.matchAll(/\{(?:[DB]:)?([a-zA-Z]+)\}/g)) expect(d.vals[m[1]] !== undefined, `${d.id}: ${m[1]}`).toBe(true);
    }
  });

  it('남의 키워드는 읽기만 하고 없애지 않는다 (깊이 보상은 1차 계열에)', () => {
    const removes = /c\.clear\(t,|apply\(t, '(bleed|poison|burn|mark|doom)', -/;
    for (const d of BRIDGES) expect(removes.test(d.run.toString()), d.id).toBe(false);
  });

  it('설명은 짧다: 긴 줄표 없음, 문장은 셋까지, 조건은 하나 (탄약 1은 사격의 값이라 세지 않는다)', () => {
    for (const d of BRIDGES) {
      expect(d.desc.includes('—'), d.id).toBe(false);
      expect(d.desc.split('. ').length, `${d.id}: ${d.desc}`).toBeLessThanOrEqual(3);
      expect(foreignReads(d).filter((k) => k !== 'ammo').length, d.id).toBeLessThanOrEqual(1);
    }
  });

  it('행동력·재사용 대기를 돌려주지 않는다', () => {
    for (const d of BRIDGES) {
      expect(d.tags.includes('energy') || d.tags.includes('refresh'), d.id).toBe(false);
      expect(/s\.ap\s*\+=|s\.cd\[|delete c\.s\.cd/.test(d.run.toString()), d.id).toBe(false);
    }
  });
});

/** 스킬 하나만 든 깨끗한 주인공으로 「깡패(전열) + 입문자 둘(후열)」 전투 */
function arena(id: string, lvl = 0): Combat {
  const run = newRun({ seed: 2026, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  run.player.maxSanity = run.player.sanity = 100;
  run.skills = [{ uid: 'sk', id, lvl, runes: [] }];
  run.slots = ['sk'];
  const c = startCombat(run, 'a1-cult', { anomaly: null });
  c.s.ap = 20;
  for (const e of c.s.enemies) {
    e.hp = e.maxHp = 999;
    e.block = 0;
    e.weak = [];
    e.resist = {};
    e.st = {};
    e.poise = e.maxPoise = 0;
  }
  c.drain();
  return c;
}
const front = (c: Combat) => c.row(0)[0];
const hits = (c: Combat) => c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt !== 'p');
const total = (c: Combat) => hits(c).reduce((s, h) => s + h.amount, 0);

describe('계열을 잇는 스킬: 대표 동작', () => {
  it('독 묻은 칼끝: 독에 걸린 적은 한 번 더 벤다 (읽을 게 없어도 두 번)', () => {
    const c = arena('br-venom-tip');
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(hits(c).length).toBe(2);
    const d = arena('br-venom-tip');
    front(d).st.poison = 3;
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(hits(d).length).toBe(3);
  });

  it('룬 새긴 칼날: 인장 1개당 피해 +2, 인장을 하나 남긴다', () => {
    const c = arena('br-rune-blade');
    const t = front(c);
    t.st.mark = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(8 + 3 * 2);
    expect(t.st.mark).toBe(4);
  });

  it('겨눈 일격: 조준이 있으면 피해 2배, 조준은 쓰지 않는다 (사격과 나눠 쓴다)', () => {
    const c = arena('br-aimed-cut');
    c.p.st.aim = 2;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(total(c)).toBe(20);
    expect(c.p.st.aim).toBe(2);
    const d = arena('br-aimed-cut');
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(total(d)).toBe(10);
  });

  it('상처 조준: 출혈 중인 적에게는 가진 조준을 쓰지 않고 치명타', () => {
    const c = arena('br-wound-sight');
    const t = front(c);
    t.st.bleed = 2;
    c.p.st.aim = 1;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(18);
    expect(c.p.st.aim).toBe(1);
    expect(c.s.ammo).toBe(5);
    // 출혈이 없으면 보통 사격 (가진 조준은 평소처럼 실리고 쓰인다)
    const d = arena('br-wound-sight');
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(total(d)).toBe(9);
  });

  it('방패 인장: 내 방어도 3당 인장 1 (최대 4), 방어도는 그대로', () => {
    const c = arena('br-shield-sigil');
    c.p.block = 10;
    const t = front(c);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.mark).toBe(3);
    expect(c.p.block).toBe(10);
    const d = arena('br-shield-sigil');
    d.p.block = 40;
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(front(d).st.mark).toBe(4);
  });

  it('응혈 촉매: 출혈만큼 독을 더한다 (출혈은 남는다)', () => {
    const c = arena('br-clot-catalyst');
    const t = front(c);
    t.st.bleed = 4;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.bleed).toBe(4);
    expect(t.st.poison).toBe(3 + 4);
  });

  it('불붙는 인장: 인장 1개당 화상 1 (인장은 남는다)', () => {
    const c = arena('br-kindle-sigil');
    const t = front(c);
    t.st.mark = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.mark).toBe(3);
    expect(t.st.burn).toBe(3);
  });

  it('피 냄새: 출혈 중인 적에게만 반격 피해 2배, 다음 내 턴에 사라진다', () => {
    const c = arena('br-blood-scent');
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.counter).toBe(3);
    const [a, b] = [front(c), c.row(1)[0]];
    a.st.bleed = 2;
    c.drain();
    c.damage({ src: a, tgt: c.p, base: 1, type: 'blunt', attack: true });
    c.damage({ src: b, tgt: c.p, base: 1, type: 'blunt', attack: true });
    const back = c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.src === 'p');
    expect(back.find((h) => h.tgt === a.uid)?.amount).toBe(6);
    expect(back.find((h) => h.tgt === b.uid)?.amount).toBe(3);
    c.endTurn();
    expect(c.p.st['br-blood-scent'] ?? 0).toBe(0);
  });

  it('독가시: 반격이 맞힌 적에게 독, 다시 써도 겹쳐 커지지 않는다', () => {
    const c = arena('br-venom-barbs');
    expect(c.useSkill('sk')).toBeNull();
    delete c.s.cd.sk;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st['br-venom-barbs']).toBe(2);
    c.p.st.counter = 3;
    const e = front(c);
    c.damage({ src: e, tgt: c.p, base: 1, type: 'blunt', attack: true });
    expect(e.st.poison).toBe(2);
  });

  it('성벽: 보호막의 절반만큼 방어도를 더한다 (보호막은 남는다)', () => {
    const c = arena('br-rampart');
    c.p.st.barrier = 6;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.barrier).toBe(6);
    expect(c.p.block).toBe(8 + 3);
  });

  it('전열 정비: 결의가 탄약과 조준을 건넨다 (2차 생산)', () => {
    const c = arena('br-regroup');
    c.s.ammo = 1;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.s.ammo).toBe(3);
    expect(c.p.st.aim).toBe(1);
  });

  it('무너지는 자: 화상 중인 적에게 파멸', () => {
    const c = arena('br-crumbling');
    const t = front(c);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.doom ?? 0).toBe(0);
    expect(c.p.sanity).toBe(98);
    const d = arena('br-crumbling');
    front(d).st.burn = 2;
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(front(d).st.doom).toBe(10);
  });

  it('저주(비술)는 파멸을 가끔, 약하게 건다 · 산성 투척은 약화나 취약에 걸린 적에게 부식 2배', () => {
    const c = arena('hex');
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(front(c).st.doom).toBe(5);
    const d = arena('acid-splash');
    front(d).st.weak = 1;
    expect(d.useSkill('sk')).toBeNull();
    expect(front(d).st.corrode).toBe(2);
    expect(d.row(0).filter((e) => e !== front(d)).every((e) => (e.st.corrode ?? 0) <= 1)).toBe(true);
  });

  it('모든 br- 스킬: 깔린 상태에서 쓰고 적 차례까지 넘겨도 터지지 않는다 (강화 포함)', () => {
    for (const d of BRIDGES) {
      for (const lvl of [0, 1]) {
        const c = arena(d.id, lvl);
        for (const e of c.alive) e.st = { mark: 2, bleed: 3, poison: 3, burn: 3, doom: 8, weak: 1 };
        Object.assign(c.p.st, { aim: 1, counter: 2, barrier: 5, tentacle: 1 });
        c.p.block = 10;
        c.p.sanity = 60;
        const t = d.target === 'single' ? (c.validTargets(d)[0]?.uid ?? null) : null;
        expect(c.useSkill('sk', t), `${d.id}+${lvl}`).toBeNull();
        expect(() => c.endTurn(), d.id).not.toThrow();
      }
    }
  });
});

/** 판의 스킬을 이것들로 바꾼다 */
function withSkills(ids: string[], origin = 'hunter', weapon: string | null = null): RunState {
  const run = newRun({ seed: 3, origin });
  run.skills = ids.map((id, i) => ({ uid: `s${i}`, id, lvl: 0, runes: [] }));
  run.slots = run.skills.map((s) => s.uid);
  run.runes = [];
  run.equip.weapon = weapon ? { uid: 'w', id: weapon, lvl: 0 } : null;
  return run;
}

describe('실마리 보상', () => {
  it('계열이 다른 것끼리만 실마리다: 톱날 베기(검술 출혈) → 혈인(비술)은 실마리, 혈류 폭발(검술)은 아니다', () => {
    const run = withSkills(['serrate']);
    expect(isClue(run, SKILLS.get('duo-blood-sigil')!)).toBe(true);
    expect(isClue(run, SKILLS.get('br-wound-sight')!)).toBe(true);
    expect(isClue(run, SKILLS.get('hemorrhage')!)).toBe(false);
    expect(isClue(run, SKILLS.get('aimed-shot')!)).toBe(false);
  });

  it('반대 방향도 센다: 내가 읽는 키워드를 만드는 스킬 (혈류 폭발 → 피의 응수의 출혈)', () => {
    const run = withSkills(['hemorrhage']);
    expect(clueLinks(run, SKILLS.get('duo-blood-riposte')!).some((l) => l.dir === 'feeds' && l.kw === 'bleed')).toBe(true);
  });

  it('무기와 새긴 각인도 재료다. 장착하지 않은 스킬과 가방의 각인은 세지 않는다', () => {
    expect(isClue(withSkills([], 'hunter', 'knife'), SKILLS.get('duo-blood-sigil')!)).toBe(true);
    const run = withSkills(['aimed-shot']);
    run.runes = ['bleed-rune'];
    expect(isClue(run, SKILLS.get('br-clot-catalyst')!)).toBe(false);
    run.skills[0].runes = run.runes.splice(0);
    expect(isClue(run, SKILLS.get('br-clot-catalyst')!)).toBe(true);
    // 톱날 베기를 가방에만 넣어 두면 실마리가 아니다
    const bag = withSkills(['serrate']);
    bag.slots = [null, null, null, null];
    expect(isClue(bag, SKILLS.get('duo-blood-sigil')!)).toBe(false);
  });

  it('누구나 만드는 방어도는 결의가 만든 것만, 쓰는 쪽만 센다', () => {
    // 연막(연금)의 방어도로 방패 강타를 권하지 않는다
    expect(isClue(withSkills(['smoke-veil']), SKILLS.get('shield-bash')!)).toBe(false);
    // 마음 다잡기(결의)의 방어도 → 엄폐 저격(사격)
    expect(isClue(withSkills(['steady'], 'soldier'), SKILLS.get('duo-cover-snipe')!)).toBe(true);
    // 방패 강타가 읽는 방어도를 만든다고 남의 방어 스킬을 권하지 않는다
    expect(isClue(withSkills(['shield-bash'], 'soldier'), SKILLS.get('smoke-veil')!)).toBe(false);
  });

  it('배율은 맞물리는 키워드 하나에 ×1.5, 상한 ×2', () => {
    const run = withSkills(['serrate']);
    expect(clueMult(clueLinks(run, SKILLS.get('duo-blood-sigil')!))).toBe(1.5);
    const rich = withSkills(['serrate', 'poison-dart', 'sigil', 'x-feint'], 'hunter', 'athame');
    // 상처 조준은 출혈만 읽는다 → 1.5. 덱이 커도 상한은 2
    for (const d of poolSkills) expect(clueMult(clueLinks(rich, d)), d.id).toBeLessThanOrEqual(CLUE.cap);
    expect(clueMult([])).toBe(1);
  });

  it('보상에 실마리 스킬이 더 자주 나온다', () => {
    const count = (per: number) => {
      const saved = CLUE.per;
      CLUE.per = per;
      const run = withSkills(['serrate']);
      let n = 0;
      for (let i = 0; i < 600; i++) {
        run.rng.loot = i * 7919 + 11;
        for (const id of rollSkills(run, 2, 'normal')) if (isClue(run, SKILLS.get(id)!)) n++;
      }
      CLUE.per = saved;
      return n;
    };
    const off = count(0);
    const on = count(CLUE.per);
    expect(on).toBeGreaterThan(off * 1.2);
  });

  it('금기 스킬을 가진 판에서만 금기 계열의 글루(남의 키워드를 읽는 것)가 보통 보상에 나온다', () => {
    const seen = (ids: string[]) => {
      const run = withSkills(ids, 'occultist');
      const out = new Set<string>();
      for (let i = 0; i < 400; i++) {
        run.rng.loot = i * 7919 + 5;
        for (const id of rollSkills(run, 3, 'elite')) if (SKILLS.get(id)!.school === 'forbidden') out.add(id);
      }
      return out;
    };
    // 인장 각인(비술)의 인장을 심연의 낙인(금기)이 읽는다
    expect(seen(['sigil', 'whisper-void']).has('duo-abyss-brand')).toBe(true);
    expect(seen(['sigil']).size).toBe(0);
    // 남의 키워드를 읽지 않는 금기 스킬은 여전히 금기의 길에서만
    for (const id of seen(['sigil', 'whisper-void'])) expect(isBridge(SKILLS.get(id)!) || !!SKILLS.get(id)!.duo, id).toBe(true);
  });

  it('정예·수호자 보상 셋 중 하나는 실마리 후보에서 (후보가 있을 때)', () => {
    const run = withSkills(['serrate']);
    for (let i = 0; i < 100; i++) {
      run.rng.loot = i * 31 + 7;
      const choice = rollChoice(run, 'elite').filter((x) => x.kind === 'skill');
      expect(choice.some((x) => isClue(run, SKILLS.get(x.id)!)), `#${i}`).toBe(true);
    }
  });

  it('출신 계열 가중치: 1층 ×2, 2층부터 ×late', () => {
    const run = withSkills(['serrate']);
    expect(originWeight(run)).toBe(ORIGIN_WEIGHT.early);
    run.act = 2;
    expect(originWeight(run)).toBe(ORIGIN_WEIGHT.late);
    expect(ORIGIN_WEIGHT.early).toBe(2);
  });

  it('이유 한 줄: 짧은 명사형 (읽는 쪽을 먼저, 장착한 스킬부터)', () => {
    const run = withSkills(['serrate']);
    expect(clueReason(run, 'duo-blood-sigil')).toBe('가진 「톱날 베기」의 출혈을 읽음');
    expect(clueReason(withSkills(['hemorrhage']), 'duo-blood-riposte')).toBe('가진 「혈류 폭발」이 읽을 출혈을 만듦');
    expect(clueReason(withSkills([], 'hunter', 'knife'), 'duo-blood-sigil')).toBe('가진 무기 「사냥칼」의 출혈을 읽음');
    expect(clueReason(run, 'hemorrhage')).toBeNull();
    expect(clueReason(run, 'no-such-skill')).toBeNull();
  });
});

describe('계열을 잇는 스킬: 봇이 쓰고 이긴다', () => {
  /** 글루 스킬마다 그 스킬이 읽을 것을 깔아 주는 덱 (출신 시작 스킬 + 다른 계열 스킬 하나) */
  const DECKS: Record<string, [string, string[]]> = {
    'br-venom-tip': ['hunter', []],
    'br-rune-blade': ['occultist', []],
    'br-wound-sight': ['hunter', ['aimed-shot']],
    'br-shield-sigil': ['occultist', ['iron-will']],
    'br-clot-catalyst': ['soldier', ['serrate']],
    // 사냥꾼의 칼·톱날 베기가 출혈을 깐다. 도발(방어도+반격)은 같은 몫의 기술이라 봇이 둘 중 하나만 써서 뺐다 (2026-10 최종 밸런스: 봇이 지속 피해를 제값으로 셈)
    'br-blood-scent': ['hunter', []],
    'br-rhythm-shot': ['hunter', []],
    'br-overawe': ['soldier', ['kneecap']],
  };
  for (const [id, [origin, extra]] of Object.entries(DECKS)) {
    it(`${SKILLS.get(id)?.name ?? id}: 봇이 쓰고 1층 전투를 이긴다`, () => {
      const run = newRun({ seed: 77, origin });
      for (const x of [...extra, id]) if (!run.skills.some((s) => s.id === x)) run.skills.push({ uid: `k${x}`, id: x, lvl: 0, runes: [] });
      run.slots = run.skills.map((s) => s.uid);
      let used = 0;
      for (const enc of ['a1-cult', 'a1-hook', 'a1-dogs3', 'a1-smugglers']) {
        const c = startCombat(run, enc);
        c.snapshots = false;
        for (let n = 0; n < 60 && !c.over; n++) {
          autoTurn(c);
          used += c.drain().filter((ev) => ev.t === 'skill' && ev.skill === id && !ev.echo).length;
        }
        expect(c.s.phase, `${id} @ ${enc}`).toBe('victory');
        run.combat = null;
        run.player.hp = run.player.maxHp;
        run.player.sanity = run.player.maxSanity;
      }
      expect(used, `${id}: 봇이 한 번도 쓰지 않았다`).toBeGreaterThan(0);
    });
  }
});

describe('계열을 잇는 스킬: 무한 고리 없음', () => {
  const LIMIT = 12;
  function usesInOneTurn(ids: { id: string; lvl: number; rune?: string | null }[], relic: string | null = null, ap?: number): number {
    const run = newRun({ seed: 5, origin: 'soldier' });
    run.player.level = 10;
    if (relic) gainRelic(run, relic);
    run.skills = ids.map((x, i) => ({ uid: `x${i}`, id: x.id, lvl: x.lvl, runes: x.rune ? [x.rune] : [] }));
    run.slots = run.skills.map((s) => s.uid);
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    for (const e of c.alive) {
      e.hp = e.maxHp = 1e7;
      e.maxPoise = e.poise = 0;
      Object.assign(e.st, { bleed: 6, poison: 6, mark: 6, burn: 6, doom: 6, weak: 3 });
    }
    Object.assign(c.p.st, { aim: 3, counter: 3, barrier: 20, tentacle: 2 });
    c.p.hp = c.p.maxHp = 1e6;
    c.p.sanity = c.p.maxSanity = 1e6;
    c.p.block = 30;
    if (ap) c.s.ap = ap;
    let n = 0;
    for (let i = 0; i < LIMIT * ids.length + 3; i++) {
      if (c.over || c.s.phase !== 'player') break;
      const ref = run.slots.find((r) => r && !c.blockReason(r));
      if (!ref) break;
      const def = c.skillInfo(ref)!.def;
      if (c.useSkill(ref, def.target === 'single' ? (c.validTargets(def)[0]?.uid ?? null) : null)) break;
      n++;
    }
    return n;
  }
  const levels = (d: SkillDef) => Array.from({ length: Math.max(...Object.values(d.vals).map((v) => (Array.isArray(v) ? v.length : 1))) }, (_, i) => i);

  it('강화 × 각인: 한 턴에 끝없이 쓰지 못한다', () => {
    for (const d of BRIDGES) expect(usesInOneTurn([{ id: d.id, lvl: 0 }]), d.id).toBe(1);
    const bad: string[] = [];
    for (const d of BRIDGES) {
      for (const lvl of levels(d)) {
        const runes = [null, ...[...RUNES.values()].filter((r) => !r.fits || r.fits(d)).map((r) => r.id)];
        for (const rune of runes) if (usesInOneTurn([{ id: d.id, lvl, rune }]) > LIMIT) bad.push(`${d.id} +${lvl} ${rune ?? ''}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 60_000);

  it('유물과 엮어도 한 턴에 끝없이 쓰지 못한다', () => {
    const bad: string[] = [];
    for (const d of BRIDGES) for (const relic of RELICS.keys()) if (usesInOneTurn([{ id: d.id, lvl: 1 }], relic) > LIMIT) bad.push(`${d.id} 유물 ${relic}`);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120_000);

  it('글루 스킬을 한꺼번에 들고 행동력이 넉넉해도 각자 한 번씩만', () => {
    const n = usesInOneTurn(BRIDGES.map((d) => ({ id: d.id, lvl: 1 })), null, 80);
    expect(n).toBe(BRIDGES.length);
  });

  it('피 냄새·독가시·촉수의 인장이 반격·가시·촉수와 맞물려도 한 번의 공격이 끝난다', () => {
    const c = arena('br-blood-scent');
    expect(c.useSkill('sk')).toBeNull();
    Object.assign(c.p.st, { thorns: 5, counter: 5, tentacle: 2, 'br-venom-barbs': 3, 'br-tentacle-sigil': 2 });
    c.p.block = 50;
    const e = front(c);
    e.st.spikes = 3;
    e.st.counter = 3;
    e.st.bleed = 2;
    c.drain();
    c.damage({ src: e, tgt: c.p, base: 8, type: 'blunt', attack: true, melee: true });
    expect(c.drain().filter((ev) => ev.t === 'dmg').length).toBeLessThan(40);
    expect(c.endTurn()).toBeNull();
    expect(c.s.phase).toBe('player');
  });
});
