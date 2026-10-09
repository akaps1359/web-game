import { describe, expect, it } from 'vitest';
import { icons as ICON_SET } from '@iconify-json/game-icons';
import '../src/content';
import { Combat, lvlVal, type CombatEvent } from '../src/engine/combat';
import { ENEMIES, EQUIPS, MADNESS, SKILLS, STATUSES } from '../src/engine/registry';
import { newRun, startCombat } from '../src/engine/run';
import { KEYWORDS, foreignReads, isBridge } from '../src/engine/keywords';
import type { EnemyUnit, EquipSlot } from '../src/engine/types';
import { plain, skillDesc } from '../src/ui/text';
import { autoTurn } from '../src/sim/bot';
import { DEPTH, aegisCap } from '../src/content/depth';
import { gapInfo } from '../src/content/gap';
import {
  ANATOMY_PCT,
  ECHO_CAP,
  GRAIL,
  GRAIL_POUR,
  GRAIL_ROOM,
  PRISM,
  PRISM_KEY,
  SINS,
  WOUNDS,
  prismStatus,
  prismType,
  woundKinds,
} from '../src/content/extra/arsenal';
import { VOW, gathering } from '../src/content/extra/arts';

/**
 * 무기고·계열 기술 보강 (content/extra/arsenal.ts · arts.ts): 장비 여섯과 계열 기술 여섯이 설명대로 움직이는지,
 * 설명·아이콘·키워드 표가 규칙을 지키는지, 봇이 쓰고 이기는지, 상태가 그대로 저장되는지.
 */

const EQUIP_IDS = ['ar-prism', 'ar-flare-pistol', 'ar-echo-plate', 'ar-scapegoat', 'ar-overflow-grail', 'ar-anatomy'];
const BASIC_IDS = ['w-ar-prism', 'w-ar-flare', 'a-ar-echo', 'a-ar-scapegoat'];
const SKILL_IDS = ['ar-open-wound', 'ar-stopping-shot', 'ar-chain-reaction', 'ar-ward-rend', 'ar-iron-vow', 'ar-mad-revelation'];
const STATUS_IDS = [...PRISM.map(prismStatus), GRAIL, VOW];
const ICONS = new Set(Object.keys(ICON_SET.icons));

const v = (id: string, key: string, lvl = 0) => lvlVal(SKILLS.get(id)!.vals[key] as number | number[], lvl);

type Piece = { id: string; lvl?: number; runes?: string[] };
type Gear = Partial<Record<EquipSlot, { id: string; lvl?: number }>>;

/**
 * 깨끗한 싸움터 「깡패(전열) + 입문자 둘(후열)」: 주어진 스킬·장비만, 유물·층의 법칙 없음.
 * 적은 체력 999에 약점·저항·상태·버팀이 없다 (피해를 그대로 잰다)
 */
function arena(skills: Piece[] = [], o: { equip?: Gear; enc?: string; origin?: string } = {}): Combat {
  const run = newRun({ seed: 77, origin: o.origin ?? 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  for (const [slot, it] of Object.entries(o.equip ?? {})) run.equip[slot as EquipSlot] = { uid: `t-${slot}`, id: it!.id, lvl: it!.lvl ?? 0 };
  run.player.maxHp = run.player.hp = 999;
  run.player.sanity = run.player.maxSanity = 999;
  run.skills = skills.map((s, i) => ({ uid: `s${i}`, id: s.id, lvl: s.lvl ?? 0, runes: s.runes ?? [] }));
  run.slots = run.skills.map((s) => s.uid);
  const c = startCombat(run, o.enc ?? 'a1-cult', { anomaly: null });
  c.snapshots = false;
  c.s.ap = 20;
  for (const e of c.s.enemies) {
    e.hp = e.maxHp = 999;
    e.block = 0;
    e.weak = [];
    e.resist = {};
    e.st = {};
    e.maxPoise = e.poise = 0;
  }
  c.drain();
  return c;
}

/** 3층부터의 정예 (특성 없는 것 — 다른 층 작업과 상관없이 고른다). 가호가 붙는다 */
const DEEP = [...ENEMIES.values()].find((d) => d.act >= 3 && d.tier === 'elite' && !d.traits?.length && !d.onSpawn)!;

/** 가호를 지닌 정예 하나와 싸운다 (변이는 굴리지 않는다). 적은 체력 1000, 약점·상태·버팀 없음 */
function deep(o: { equip?: Gear; skills?: Piece[] } = {}): { c: Combat; e: EnemyUnit } {
  const saved = DEPTH.mutElite.slice();
  DEPTH.mutElite.fill(0);
  try {
    const run = newRun({ seed: 7, origin: 'soldier' });
    run.act = DEEP.act;
    run.floor = null;
    run.relics = [];
    run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
    for (const [slot, it] of Object.entries(o.equip ?? {})) run.equip[slot as EquipSlot] = { uid: `t-${slot}`, id: it!.id, lvl: it!.lvl ?? 0 };
    run.player.maxHp = run.player.hp = 999;
    run.player.sanity = run.player.maxSanity = 999;
    run.skills = (o.skills ?? []).map((s, i) => ({ uid: `s${i}`, id: s.id, lvl: s.lvl ?? 0, runes: s.runes ?? [] }));
    run.slots = run.skills.map((s) => s.uid);
    const c = Combat.begin(run, { id: 'ar-test', act: DEEP.act, kind: 'elite', enemies: [{ id: DEEP.id }] });
    c.snapshots = false;
    c.s.ap = 20;
    const e = c.alive[0];
    e.hp = e.maxHp = 1000;
    e.block = 0;
    e.weak = [];
    e.resist = {};
    e.st = {};
    e.affix = [];
    e.maxPoise = e.poise = 0;
    c.drain();
    return { c, e };
  } finally {
    DEPTH.mutElite.splice(0, DEPTH.mutElite.length, ...saved);
  }
}

const front = (c: Combat) => c.row(0)[0];
const dmgEvents = (list: CombatEvent[]) => list.filter((ev): ev is Extract<CombatEvent, { t: 'dmg' }> => ev.t === 'dmg');
/** 이번 사용에서 적에게 들어간 피해 이벤트 */
const hits = (c: Combat) => dmgEvents(c.drain()).filter((ev) => ev.tgt !== 'p');
const total = (c: Combat) => hits(c).reduce((s, h) => s + h.amount, 0);
/** 기술을 쓴다 (재사용 대기는 무시) */
function use(c: Combat, ref: string, t?: EnemyUnit | null) {
  delete c.s.cd[ref];
  expect(c.useSkill(ref, t?.uid ?? null), `${ref} 사용`).toBeNull();
}
/** 전투에 끼어들지 않는 광기 둘 (훅이 없거나 전투가 끝날 때만 도는 것) */
const quietMadness = () => [...MADNESS.values()].filter((m) => !m.virtue && Object.keys(m.hooks ?? {}).every((k) => k === 'onCombatEnd')).slice(0, 2);

/** 적들이 이번 차례에 아무것도 하지 못하게 (턴을 넘기며 내 쪽 효과만 볼 때) */
function stunAll(c: Combat) {
  for (const e of c.alive) e.st.stun = 1;
}

// ───────────── 등록과 글 ─────────────

describe('무기고: 등록', () => {
  it('장비 여섯(무기 2·방어구 2·장신구 2)과 계열 기술 여섯이 있고, 등급이 정해진 대로다', () => {
    const slots = EQUIP_IDS.map((id) => EQUIPS.get(id)?.slot);
    expect(slots).toEqual(['weapon', 'weapon', 'armor', 'armor', 'trinket', 'trinket']);
    expect(EQUIP_IDS.map((id) => EQUIPS.get(id)!.rarity)).toEqual(['uncommon', 'rare', 'rare', 'uncommon', 'rare', 'uncommon']);
    expect(SKILL_IDS.map((id) => SKILLS.get(id)?.school)).toEqual(['blade', 'firearm', 'alchemy', 'occult', 'resolve', 'forbidden']);
    expect(SKILL_IDS.map((id) => SKILLS.get(id)!.rarity)).toEqual(['common', 'uncommon', 'rare', 'uncommon', 'rare', 'forbidden']);
    for (const id of STATUS_IDS) expect(STATUSES.has(id), id).toBe(true);
  });

  it('무기·방어구는 새 기본기를 쓰고, 기본기는 보상에 나오지 않는다', () => {
    expect(EQUIP_IDS.map((id) => EQUIPS.get(id)!.skill ?? null)).toEqual([...BASIC_IDS, null, null]);
    for (const id of BASIC_IDS) {
      const d = SKILLS.get(id)!;
      expect(d.pool, id).toBe(false);
      expect(d.rarity, id).toBe('basic');
      expect(d.tags, id).toContain('basic');
      expect(lvlVal(d.cost, 0), id).toBe(1);
    }
    // 계열 기술은 보상 풀에 (금기는 금기의 길에서)
    for (const id of SKILL_IDS) expect(SKILLS.get(id)!.pool, id).not.toBe(false);
  });

  it('아이콘은 game-icons에 있는 이름, 설명의 {키}는 vals에 있고 강화 단계마다 다 채워진다', () => {
    for (const id of [...BASIC_IDS, ...SKILL_IDS]) {
      const d = SKILLS.get(id)!;
      expect(d.icon.startsWith('gi:') && ICONS.has(d.icon.slice(3)), `${id} ${d.icon}`).toBe(true);
      for (const m of d.desc.matchAll(/\{(?:[DB]:)?([a-zA-Z]+)\}/g)) expect(d.vals[m[1]] !== undefined, `${id}: ${m[1]}`).toBe(true);
      const lvls = d.tags.includes('basic') ? [0, 1, 2] : [0, 1];
      const texts = lvls.map((lvl) => plain(skillDesc(d, lvl)));
      for (const t of texts) expect(t.includes('{'), `${id}: ${t}`).toBe(false);
      // 강화하면 무언가 달라진다
      expect(new Set(texts).size, `${id}: 강화해도 그대로`).toBe(lvls.length);
    }
    for (const id of EQUIP_IDS) expect(ICONS.has(EQUIPS.get(id)!.icon.slice(3)), id).toBe(true);
    for (const id of STATUS_IDS) expect(ICONS.has(STATUSES.get(id)!.icon.slice(3)), id).toBe(true);
  });

  it('글: 긴 줄표 없음, 연결어미 뒤 쉼표 없음, 문장마다 괄호는 하나까지, 장신구는 강화하면 무엇이 달라지는지 밝힌다', () => {
    const texts = [
      ...EQUIP_IDS.map((id) => [id, EQUIPS.get(id)!.desc] as const),
      ...[...BASIC_IDS, ...SKILL_IDS].map((id) => [id, SKILLS.get(id)!.desc] as const),
      ...STATUS_IDS.map((id) => [id, STATUSES.get(id)!.desc] as const),
    ];
    for (const [id, t] of texts) {
      expect(t.includes('—'), `${id}: ${t}`).toBe(false);
      expect(/(고|지만|면서),/.test(t), `${id}: ${t}`).toBe(false);
      // 규칙 문장의 마지막에는 마침표를 찍지 않는다
      expect(t.trim().endsWith('.'), `${id}: ${t}`).toBe(false);
      for (const sentence of t.split('. ')) expect((sentence.match(/\(/g) ?? []).length, `${id}: ${sentence}`).toBeLessThanOrEqual(1);
    }
    for (const id of EQUIP_IDS) if (EQUIPS.get(id)!.slot === 'trinket') expect(EQUIPS.get(id)!.desc, id).toContain('강화');
  });
});

describe('계열 기술: 상처의 문법', () => {
  it('makes/reads가 있고, 남의 키워드는 표가 허락한 계열만 읽는다', () => {
    for (const id of SKILL_IDS) {
      const d = SKILLS.get(id)!;
      expect(Array.isArray(d.makes) && Array.isArray(d.reads), id).toBe(true);
      for (const k of [...d.makes!, ...d.reads!]) expect(KEYWORDS.has(k), `${id}: ${k}`).toBe(true);
      for (const k of foreignReads(d)) expect(KEYWORDS.get(k)!.readers, `${id}: ${k}`).toContain(d.school);
    }
  });

  it('연쇄 반응은 검술의 출혈을 읽는 글루 — 조건 하나, 읽을 게 없어도 쓸 만한 기본 피해, 수치를 줄이지 않는다', () => {
    const d = SKILLS.get('ar-chain-reaction')!;
    expect(isBridge(d)).toBe(true);
    expect(foreignReads(d)).toEqual(['bleed']);
    expect(v(d.id, 'dmg')).toBeGreaterThan(0);
    expect(/c\.clear\(|apply\([a-z]+, '(bleed|poison|burn|mark|doom)', -/.test(d.run.toString())).toBe(false);
    // 나머지는 제 계열의 것을 읽는다 (글루가 아니다)
    for (const id of SKILL_IDS.filter((x) => x !== d.id)) expect(isBridge(SKILLS.get(id)!), id).toBe(false);
  });

  it('행동력·재사용 대기를 돌려주지 않고, 한 턴에 한 번만 쓸 수 있다', () => {
    for (const id of SKILL_IDS) {
      const d = SKILLS.get(id)!;
      expect(d.tags.includes('energy') || d.tags.includes('refresh'), id).toBe(false);
      expect(/s\.ap\s*\+=|s\.cd\[|delete c\.s\.cd/.test(d.run.toString()), id).toBe(false);
      for (const lvl of [0, 1]) expect(lvlVal(d.cd, lvl), id).toBeGreaterThanOrEqual(2);
      const c = arena([{ id }]);
      const t = d.target === 'single' ? (c.validTargets(d)[0] ?? null) : null;
      expect(c.useSkill('s0', t?.uid ?? null), id).toBeNull();
      expect(c.blockReason('s0'), id).not.toBeNull();
    }
  });
});

// ───────────── 무기 ─────────────

describe('굴절 프리즘', () => {
  const prismArena = (lvl = 0) => arena([], { equip: { weapon: { id: 'ar-prism', lvl } } });

  it('내 턴마다 참격·화염·관통·비전·타격·공허 순서로 바뀌고, 이번 턴의 속성이 내 상태 칸에 하나만 뜬다', () => {
    const c = prismArena();
    c.s.vars[PRISM_KEY] = 0;
    for (let i = 0; i < PRISM.length + 2; i++) {
      c.startPlayerTurn();
      const want = PRISM[(c.s.turn - 1) % PRISM.length];
      expect(prismType(c)).toBe(want);
      const shown = PRISM.filter((t) => c.p.st[prismStatus(t)]);
      expect(shown, `${c.s.turn}턴`).toEqual([want]);
    }
  });

  it('기본 공격이 이번 턴의 속성으로 친다 (강화마다 피해가 오른다)', () => {
    for (const lvl of [0, 1, 2]) {
      const c = prismArena(lvl);
      for (let i = 0; i < PRISM.length; i++) {
        const type = prismType(c);
        use(c, 'weapon', front(c));
        const hs = hits(c);
        expect(hs.map((h) => h.dtype), `${lvl} ${type}`).toEqual([type]);
        expect(hs[0].amount).toBe(v('w-ar-prism', 'dmg', lvl));
        stunAll(c);
        c.endTurn();
        c.drain();
      }
    }
  });

  it('속성이 약점과 맞는 턴에는 약점 피해·버팀 -1, 그리고 비술 색의 틈이 열린다', () => {
    const c = prismArena();
    const e = front(c);
    e.weak = [prismType(c)];
    e.maxPoise = e.poise = 6;
    use(c, 'weapon', e);
    const [h] = hits(c);
    expect(h.weak).toBe(true);
    expect(e.poise).toBe(5);
    expect(gapInfo(c, e.uid)?.school).toBe('occult');
    // 다음 턴에는 다른 속성이라 약점이 아니다
    stunAll(c);
    c.endTurn();
    c.drain();
    use(c, 'weapon', e);
    expect(hits(c)[0].weak).toBe(false);
  });

  it('시작하는 속성은 전투마다 다르다 (전투 난수)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const run = newRun({ seed, origin: 'soldier' });
      run.equip.weapon = { uid: 'w', id: 'ar-prism', lvl: 0 };
      const c = startCombat(run, 'a1-thug', { anomaly: null });
      seen.add(prismType(c));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('저장했다 불러와도 이번 턴의 속성이 그대로다', () => {
    const c = prismArena();
    stunAll(c);
    c.endTurn();
    const before = prismType(c);
    const run2 = JSON.parse(JSON.stringify(c.run));
    expect(prismType(new Combat(run2))).toBe(before);
  });
});

describe('조명탄 권총', () => {
  it('탄약 1을 써서 화염으로 쏘고 취약 1. 밝혀 둔 적에게 다음 공격이 1.5배로 들어간다', () => {
    for (const lvl of [0, 2]) {
      const c = arena([{ id: 'arcane-bolt' }], { equip: { weapon: { id: 'ar-flare-pistol', lvl } } });
      const e = front(c);
      use(c, 'weapon', e);
      const hs = hits(c);
      expect(hs.map((h) => [h.dtype, h.amount])).toEqual([['fire', v('w-ar-flare', 'dmg', lvl)]]);
      expect(c.s.ammo).toBe(c.s.maxAmmo - 1);
      expect(e.st.vuln).toBe(v('w-ar-flare', 'vuln', lvl));
      use(c, 's0', e);
      expect(total(c)).toBe(Math.floor(v('arcane-bolt', 'dmg') * 1.5));
    }
  });

  it('화염이라 조준을 쓰지 않는다 (밝힌 뒤 관통 기술이 조준을 싣는다)', () => {
    const c = arena([], { equip: { weapon: { id: 'ar-flare-pistol' } } });
    c.p.st.aim = 1;
    use(c, 'weapon', front(c));
    expect(c.p.st.aim).toBe(1);
  });

  it('탄약이 없으면 쏘지 않고 재장전한다 (취약도 없다)', () => {
    const c = arena([], { equip: { weapon: { id: 'ar-flare-pistol' } } });
    const e = front(c);
    c.s.ammo = 0;
    use(c, 'weapon', e);
    expect(hits(c).length).toBe(0);
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    expect(e.st.vuln ?? 0).toBe(0);
  });
});

// ───────────── 방어구 ─────────────

describe('메아리 흉갑', () => {
  const echoes = (list: CombatEvent[]) => dmgEvents(list).filter((d) => d.tags.includes('ar-echo'));

  it('적의 차례가 끝나고 남은 방어도만큼 내 턴이 시작될 때 모든 적에게 타격 피해 (적마다 상한, 강화마다 +3)', () => {
    for (const lvl of [0, 1, 2]) {
      const c = arena([], { equip: { armor: { id: 'ar-echo-plate', lvl } } });
      const n = c.alive.length;
      c.p.block = 40;
      c.endTurn();
      const ev = c.drain();
      // 적들이 친 만큼은 방어도가 막았다 — 남은 방어도는 그만큼 줄었다
      const blocked = dmgEvents(ev).filter((d) => d.tgt === 'p').reduce((s, d) => s + d.blocked, 0);
      const left = 40 - blocked;
      expect(left).toBeGreaterThan(ECHO_CAP[2]);
      const es = echoes(ev);
      expect(es.length, `+${lvl}`).toBe(n);
      for (const d of es) {
        expect(d.amount, `+${lvl}`).toBe(Math.min(left, ECHO_CAP[lvl]));
        expect(d.dtype).toBe('blunt');
        expect(d.attack).toBe(false);
      }
      expect(ECHO_CAP[lvl]).toBe(v('a-ar-echo', 'echo', lvl));
    }
  });

  it('남은 방어도가 상한보다 적으면 남은 만큼만', () => {
    const c = arena([], { equip: { armor: { id: 'ar-echo-plate', lvl: 2 } } });
    stunAll(c);
    c.p.block = 5;
    c.endTurn();
    const es = echoes(c.drain());
    expect(es.length).toBe(c.alive.length);
    for (const d of es) expect(d.amount).toBe(5);
  });

  it('방어도가 다 깎였거나, 굳건함으로 사라지지 않으면 울리지 않는다. 다른 방어구도 울리지 않는다', () => {
    // 다 깎였다: 적의 공격이 방어도를 모두 썼다
    const a = arena([], { equip: { armor: { id: 'ar-echo-plate' } } });
    a.s.phase = 'enemy';
    a.p.block = 6;
    a.damage({ src: front(a), tgt: a.p, base: 30, type: 'blunt', attack: true });
    a.s.phase = 'player';
    a.startPlayerTurn();
    expect(echoes(a.drain()).length).toBe(0);
    // 굳건함: 방어도가 그대로 남는다
    const b = arena([], { equip: { armor: { id: 'ar-echo-plate' } } });
    stunAll(b);
    b.p.block = 20;
    b.p.st.retain = 1;
    b.endTurn();
    expect(echoes(b.drain()).length).toBe(0);
    expect(b.p.block).toBe(20);
    // 사슬 조끼는 울리지 않는다
    const d = arena([], { equip: { armor: { id: 'chainmail' } } });
    stunAll(d);
    d.p.block = 20;
    d.endTurn();
    expect(echoes(d.drain()).length).toBe(0);
  });

  it('적의 공격이 깎은 만큼 덜 울린다 (적의 차례 중 방어도를 따라간다)', () => {
    const c = arena([], { equip: { armor: { id: 'ar-echo-plate', lvl: 2 } } });
    c.s.phase = 'enemy';
    c.p.block = 20;
    c.damage({ src: front(c), tgt: c.p, base: 12, type: 'blunt', attack: true });
    c.s.phase = 'player';
    c.startPlayerTurn();
    const es = echoes(c.drain());
    expect(es.length).toBe(c.alive.length);
    for (const d of es) expect(d.amount).toBe(8);
  });
});

describe('속죄양의 털가죽', () => {
  const goat = (lvl = 0) => arena([], { equip: { armor: { id: 'ar-scapegoat', lvl } } });

  it('방어도를 얻고, 내게 걸린 해로운 효과 가운데 가장 많이 쌓인 것을 고른 적에게 모두 옮긴다', () => {
    const c = goat();
    const e = c.row(1)[0];
    Object.assign(c.p.st, { weak: 2, vuln: 1, poison: 3, dread: 2 });
    use(c, 'armor', e);
    expect(c.p.block).toBe(v('a-ar-scapegoat', 'blk'));
    expect(c.p.st.poison ?? 0).toBe(0);
    expect(e.st.poison).toBe(3);
    // 나머지는 그대로 (옮길 수 없는 공포도)
    expect(c.p.st.weak).toBe(2);
    expect(c.p.st.vuln).toBe(1);
    expect(c.p.st.dread).toBe(2);
  });

  it('강화 2단계는 두 가지, 같은 수치면 취약·약화·허약·독·출혈·화상 순서', () => {
    const c = goat(2);
    const e = front(c);
    Object.assign(c.p.st, { weak: 2, vuln: 1, poison: 3 });
    use(c, 'armor', e);
    expect(e.st.poison).toBe(3);
    expect(e.st.weak).toBe(2);
    expect(c.p.st.vuln).toBe(1);
    expect(c.p.block).toBe(v('a-ar-scapegoat', 'blk', 2));
    const d = goat();
    Object.assign(d.p.st, { weak: 2, vuln: 2, frail: 2 });
    use(d, 'armor', front(d));
    expect(front(d).st.vuln).toBe(2);
    expect(d.p.st.weak).toBe(2);
    expect(d.p.st.frail).toBe(2);
    expect(SINS[0]).toBe('vuln');
  });

  it('대상의 결계가 막으면 흩어진다 (내 쪽에서는 사라진다). 해로운 효과가 없으면 방어도만', () => {
    const c = goat();
    const e = front(c);
    e.st.ward = 1;
    c.p.st.bleed = 4;
    use(c, 'armor', e);
    expect(c.p.st.bleed ?? 0).toBe(0);
    expect(e.st.bleed ?? 0).toBe(0);
    expect(e.st.ward ?? 0).toBe(0);
    const d = goat();
    use(d, 'armor', front(d));
    expect(d.p.block).toBe(v('a-ar-scapegoat', 'blk'));
    expect(Object.keys(front(d).st).length).toBe(0);
  });
});

// ───────────── 장신구 ─────────────

describe('넘치는 성배', () => {
  const grail = (lvl = 0, skills: Piece[] = []) => deep({ equip: { trinket1: { id: 'ar-overflow-grail', lvl } }, skills });
  const strike = (c: Combat, e: EnemyUnit, base: number, attack = true) => c.damage({ src: c.p, tgt: e, base, type: 'true', attack });

  it(`가호에 막혀 들어가지 못한 내 공격 피해가 그 적에게 고인다 (그 적 최대 체력의 ${GRAIL_ROOM}%까지)`, () => {
    const { c, e } = grail();
    const cap = aegisCap(e);
    expect(cap).toBeGreaterThan(0);
    strike(c, e, cap - 10);
    expect(e.st[GRAIL] ?? 0).toBe(0);
    strike(c, e, 40);
    expect(1000 - e.hp).toBe(cap);
    expect(e.st[GRAIL]).toBe(30);
    // 가호가 다 닳은 뒤의 공격은 모두 고인다
    strike(c, e, 25);
    expect(e.st[GRAIL]).toBe(55);
    strike(c, e, 5000);
    expect(e.st[GRAIL]).toBe(Math.floor((e.maxHp * GRAIL_ROOM) / 100));
  });

  it('공격이 아닌 피해와 가호가 없는 적(1·2층)에게는 고이지 않는다. 장신구가 없으면 고이지 않는다', () => {
    const { c, e } = grail();
    strike(c, e, aegisCap(e));
    strike(c, e, 50, false);
    expect(e.st[GRAIL] ?? 0).toBe(0);
    const a = arena([], { equip: { trinket1: { id: 'ar-overflow-grail' } } });
    const t = front(a);
    strike(a, t, 500);
    // 1층 적에게는 가호가 없다: 상한 없이 다 들어간다
    expect(999 - t.hp).toBe(500);
    expect(t.st[GRAIL] ?? 0).toBe(0);
    const { c: d, e: f } = deep();
    strike(d, f, aegisCap(f) + 100);
    expect(f.st[GRAIL] ?? 0).toBe(0);
  });

  it(`그 적을 붕괴시킨 기술이 끝나면 고인 피해의 ${GRAIL_POUR[0]}%를 쏟는다 (강화마다 +${GRAIL_POUR[1]}%)`, () => {
    for (const lvl of [0, 1, 2]) {
      const { c, e } = grail(lvl, [{ id: 'aimed-shot' }]);
      const cap = aegisCap(e);
      strike(c, e, cap + 60);
      c.drain();
      // 버팀 1을 남긴 정예를 정조준 사격(버팀 추가 -1)으로 무너뜨린다. 이 사격도 가호에 막혀 고인다
      e.maxPoise = 5;
      e.poise = 1;
      const hp = e.hp;
      use(c, 's0', e);
      expect(e.broken).toBe(2);
      const ev = hits(c);
      const shot = ev.find((h) => h.tags.length === 0)!;
      expect(shot.amount).toBe(0);
      const bank = 60 + Math.floor(v('aimed-shot', 'dmg') * 0.5);
      const want = Math.floor((bank * (GRAIL_POUR[0] + GRAIL_POUR[1] * lvl)) / 100);
      expect(ev.filter((h) => h.tags.includes('ar-grail')).map((h) => h.amount), `+${lvl}`).toEqual([want]);
      expect(hp - e.hp).toBe(want);
      // 쏟고 나면 비고, 쏟은 피해는 다시 고이지 않는다
      expect(e.st[GRAIL] ?? 0).toBe(0);
    }
  });

  it('쏟는 피해는 가호와 상관없다: 붕괴로 두 배가 된 상한까지 다 채운 뒤에도 들어가고, 가호의 셈에 들지 않는다', () => {
    const { c, e } = grail(2, [{ id: 'take-aim' }]);
    const cap = aegisCap(e);
    strike(c, e, cap + 60);
    e.maxPoise = 5;
    e.poise = 5;
    c.breakEnemy(e);
    // 붕괴: 상한 두 배 — 남은 몫을 모두 채운다 (넘친 것은 고이되 그 적 최대 체력의 GRAIL_ROOM%까지만)
    strike(c, e, 5000);
    const room = Math.floor((e.maxHp * GRAIL_ROOM) / 100);
    expect(e.st[GRAIL]).toBe(room);
    expect(c.preview(c.p, e, 50, 'slash')).toBe(0);
    const hp = e.hp;
    use(c, 's0');
    const want = Math.floor((room * (GRAIL_POUR[0] + GRAIL_POUR[1] * 2)) / 100);
    expect(hp - e.hp).toBe(want);
    // 가호는 여전히 다 닳아 있다 (쏟은 피해가 상한을 깎지 않았다)
    expect(c.preview(c.p, e, 50, 'slash')).toBe(0);
  });

  it('적의 차례에 붕괴시켰으면 내 턴이 시작될 때 쏟는다', () => {
    const { c, e } = grail();
    strike(c, e, aegisCap(e) + 80);
    e.maxPoise = 5;
    e.poise = 5;
    c.breakEnemy(e);
    expect(e.st[GRAIL]).toBe(80);
    c.endTurn();
    const pour = dmgEvents(c.drain()).filter((h) => h.tags.includes('ar-grail'));
    expect(pour.map((h) => h.amount)).toEqual([Math.floor((80 * GRAIL_POUR[0]) / 100)]);
    expect(e.st[GRAIL] ?? 0).toBe(0);
  });

  it('쏟은 피해로 쓰러뜨려도 내 처치다', () => {
    const { c, e } = grail(2, [{ id: 'take-aim' }]);
    strike(c, e, aegisCap(e) + 80);
    e.maxPoise = 5;
    e.poise = 5;
    c.breakEnemy(e);
    e.hp = 10;
    const kills = c.run.stats.kills;
    use(c, 's0');
    expect(e.dead).toBe(true);
    expect(c.run.stats.kills).toBe(kills + 1);
  });
});

describe('찢긴 해부도', () => {
  const chart = (lvl = 0) => arena([], { equip: { trinket2: { id: 'ar-anatomy', lvl } } });

  it('상처의 문법 키워드가 세 가지 이상 걸린 적에게 주는 공격 피해 +20% (강화마다 +5%)', () => {
    for (const lvl of [0, 1, 2]) {
      const c = chart(lvl);
      const e = front(c);
      e.st = { bleed: 1, poison: 1 };
      expect(woundKinds(e)).toBe(2);
      expect(c.preview(c.p, e, 20, 'blunt')).toBe(20);
      e.st.mark = 1;
      expect(c.preview(c.p, e, 20, 'blunt'), `+${lvl}`).toBe(Math.floor((20 * (100 + ANATOMY_PCT[0] + ANATOMY_PCT[1] * lvl)) / 100));
    }
    expect(WOUNDS.length).toBe(7);
  });

  it('표에 없는 해로운 효과(기절·허약 등)는 세지 않는다. 공격이 아닌 피해에는 붙지 않는다', () => {
    const c = chart();
    const e = front(c);
    e.st = { bleed: 1, poison: 1, stun: 1, frail: 2, dread: 1 };
    expect(c.preview(c.p, e, 20, 'blunt')).toBe(20);
    e.st = { burn: 1, doom: 3, weak: 1 };
    expect(c.preview(c.p, e, 20, 'blunt')).toBe(24);
    expect(c.preview(c.p, e, 20, 'blunt', { attack: false })).toBe(20);
  });
});

// ───────────── 계열 기술 ─────────────

describe('상처 벌리기 (검술)', () => {
  it('대상의 출혈 4당 버팀 추가 -1 (최대 2), 출혈은 그대로 남는다', () => {
    for (const [lvl, bleed, lost] of [
      [0, 0, 0],
      [0, 3, 0],
      [0, 4, 1],
      [0, 8, 2],
      [0, 40, 2],
      [1, 6, 2],
    ]) {
      const c = arena([{ id: 'ar-open-wound', lvl }]);
      const e = front(c);
      e.maxPoise = e.poise = 10;
      if (bleed) e.st.bleed = bleed;
      use(c, 's0', e);
      // 약점이 아닌 첫 타격은 버팀을 깎지 않는다 (GUARD.chip) — 깎인 것은 출혈 몫
      expect(10 - e.poise, `+${lvl} 출혈 ${bleed}`).toBe(lost);
      expect(e.st.bleed ?? 0).toBe(bleed);
    }
  });
});

describe('저지 사격 (사격)', () => {
  it('탄약 1, 버팀 추가 -1. 힘을 모으는 적에게는 버팀 추가 -2 더 (강화 -3)', () => {
    const shoot = (lvl: number, set: (e: EnemyUnit) => void) => {
      const c = arena([{ id: 'ar-stopping-shot', lvl }]);
      const e = front(c);
      e.maxPoise = e.poise = 10;
      set(e);
      use(c, 's0', e);
      expect(c.s.ammo).toBe(c.s.maxAmmo - 1);
      return 10 - e.poise;
    };
    expect(shoot(0, () => {})).toBe(1);
    expect(shoot(0, (e) => void (e.intent = { move: 'x', kind: 'charge', charging: true, label: '준비' }))).toBe(3);
    expect(shoot(0, (e) => void (e.mem.charge = 1))).toBe(3);
    // 심연을 모으는 수호자(content/depth.ts)는 그동안 버팀이 두 배로 깎인다 — 저지 사격이 그 틈을 노린다
    expect(shoot(0, (e) => void (e.mem.abc = 1))).toBe(3 * 2);
    expect(shoot(1, (e) => void (e.mem.charge = 1))).toBe(4);
  });

  it('실제 적: 힘을 모으면(차지) 모은 힘을 터뜨리기 전까지 「힘을 모으는 중」이고, 붕괴하면 풀린다', () => {
    const def = [...ENEMIES.values()].find((d) => d.act === 1 && Object.values(d.moves).some((m) => m.charging))!;
    const [id, move] = Object.entries(def.moves).find(([, m]) => m.charging)!;
    const run = newRun({ seed: 3, origin: 'soldier' });
    run.floor = null;
    const c = Combat.begin(run, { id: 'ar-charge', act: 1, kind: 'normal', enemies: [{ id: def.id }] });
    const e = c.alive[0];
    e.intent = { move: id, kind: move.intent, charging: move.charging, label: move.name };
    expect(gathering(e)).toBe(true);
    move.run(c, e);
    e.intent = { move: 'next', kind: 'attack', label: '일격' };
    expect(gathering(e)).toBe(true);
    c.breakEnemy(e);
    expect(gathering(e)).toBe(false);
  });

  it('탄약이 없으면 쓸 수 없다', () => {
    const c = arena([{ id: 'ar-stopping-shot' }]);
    c.s.ammo = 0;
    expect(c.blockReason('s0')).toBe('탄약 부족');
  });
});

describe('연쇄 반응 (연금)', () => {
  it('적 전체에 화염 피해. 그 뒤 모든 적의 출혈·독·화상이 한 번 더 피해를 주고, 수치는 줄지 않는다', () => {
    const c = arena([{ id: 'ar-chain-reaction' }]);
    const dmg = v('ar-chain-reaction', 'dmg');
    const [a, b, d] = c.alive;
    a.st = { bleed: 3, poison: 4, burn: 2 };
    b.st = { poison: 5 };
    use(c, 's0');
    // 불이 닿은 화상은 +2 (화상의 규칙)
    expect(a.st).toMatchObject({ bleed: 3, poison: 4, burn: 4 });
    expect(b.st.poison).toBe(5);
    expect(999 - a.hp).toBe(dmg + 3 + 4 + 4);
    expect(999 - b.hp).toBe(dmg + 5);
    expect(999 - d.hp).toBe(dmg);
  });

  it('독은 방어도를 무시한다 (지속 피해와 같은 규칙)', () => {
    const c = arena([{ id: 'ar-chain-reaction' }]);
    const e = front(c);
    e.st = { poison: 6 };
    e.block = 100;
    use(c, 's0');
    expect(999 - e.hp).toBe(6);
  });

  it('출혈·독·화상 몫도 위력(절약 각인)을 따른다', () => {
    const run = (runes: string[]) => {
      const c = arena([{ id: 'ar-chain-reaction', runes }]);
      for (const e of c.alive) e.st = { bleed: 8, poison: 8 };
      use(c, 's0');
      return c.alive.reduce((s, e) => s + (999 - e.hp), 0);
    };
    const full = run([]);
    const thrift = run(['thrift']);
    expect(thrift).toBeLessThanOrEqual(Math.ceil(full * 0.75) + 3);
    expect(thrift).toBeGreaterThanOrEqual(Math.floor(full * 0.75) - 3);
  });
});

describe('결계 찢기 (비술)', () => {
  it('대상의 결계를 모두 찢고 비전 피해, 인장 1 + 찢은 결계 1겹마다 2 (강화 3)', () => {
    for (const [lvl, ward] of [
      [0, 0],
      [0, 3],
      [1, 2],
    ]) {
      const c = arena([{ id: 'ar-ward-rend', lvl }]);
      const e = front(c);
      if (ward) e.st.ward = ward;
      use(c, 's0', e);
      expect(e.st.ward ?? 0).toBe(0);
      expect(e.st.mark, `+${lvl} 결계 ${ward}`).toBe(v('ar-ward-rend', 'mark', lvl) + ward * v('ar-ward-rend', 'per', lvl));
      expect(999 - e.hp).toBe(v('ar-ward-rend', 'dmg', lvl));
    }
  });

  it('결계를 찢고 나면 다른 해로운 효과도 막히지 않는다 (봉인 문양 변이)', () => {
    const c = arena([{ id: 'ar-ward-rend' }, { id: 'serrate' }]);
    const e = front(c);
    e.st.ward = 2;
    use(c, 's0', e);
    use(c, 's1', e);
    expect(e.st.bleed).toBe(v('serrate', 'bleed'));
  });
});

describe('철벽의 맹세 (결의)', () => {
  it('다음 내 턴이 올 때까지 적의 공격으로 잃는 체력은 모두 합쳐 최대 체력의 20%까지 (방어도가 먼저 막는다)', () => {
    for (const lvl of [0, 1]) {
      const c = arena([{ id: 'ar-iron-vow', lvl }]);
      use(c, 's0');
      const blk = v('ar-iron-vow', 'blk', lvl);
      expect(c.p.block).toBe(blk);
      const cap = Math.floor((c.p.maxHp * v('ar-iron-vow', 'pct', lvl)) / 100);
      expect(c.p.st[VOW]).toBe(cap);
      const e = front(c);
      const hp = c.p.hp;
      c.s.phase = 'enemy';
      c.damage({ src: e, tgt: c.p, base: cap - 20, type: 'blunt', attack: true });
      expect(hp - c.p.hp).toBe(cap - 20 - blk);
      c.damage({ src: e, tgt: c.p, base: 200, type: 'blunt', attack: true });
      c.damage({ src: e, tgt: c.p, base: 200, type: 'slash', attack: true });
      expect(hp - c.p.hp, `+${lvl}`).toBe(cap);
    }
  });

  it('공격이 아닌 피해(퍼즐 위협의 대가 등)는 막지 않는다. 다음 내 턴이 오면 풀린다', () => {
    const c = arena([{ id: 'ar-iron-vow' }]);
    use(c, 's0');
    const e = front(c);
    const hp = c.p.hp;
    c.damage({ src: e, tgt: c.p, base: 300, type: 'true', ignoreBlock: true });
    expect(hp - c.p.hp).toBe(300);
    stunAll(c);
    c.endTurn();
    expect(c.p.st[VOW] ?? 0).toBe(0);
    const hp2 = c.p.hp;
    c.damage({ src: e, tgt: c.p, base: 400, type: 'blunt', attack: true });
    expect(hp2 - c.p.hp).toBe(400);
  });

  it('미리보기(적의 의도 숫자)도 같은 상한을 보여 준다', () => {
    const c = arena([{ id: 'ar-iron-vow' }]);
    use(c, 's0');
    const cap = Math.floor((c.p.maxHp * v('ar-iron-vow', 'pct')) / 100);
    expect(c.preview(front(c), c.p, 900, 'blunt')).toBe(cap + c.p.block);
  });
});

describe('광기의 계시 (금기)', () => {
  it('정신력을 치르고, 지닌 광기 1개당 피해가 는다', () => {
    const quiet = quietMadness();
    expect(quiet.length).toBe(2);
    for (const n of [0, 2]) {
      const c = arena([{ id: 'ar-mad-revelation' }]);
      c.run.madness = quiet.slice(0, n).map((m) => m.id);
      const san = c.p.sanity;
      use(c, 's0', front(c));
      expect(san - c.p.sanity).toBe(v('ar-mad-revelation', 'san'));
      expect(total(c), `광기 ${n}`).toBe(v('ar-mad-revelation', 'dmg') + n * v('ar-mad-revelation', 'per'));
    }
  });
});

// ───────────── 봇 · 저장 ─────────────

describe('봇이 쓰고 1층 전투를 이긴다', () => {
  /** 기술마다 그 기술이 읽을 것을 깔아 주는 덱 (출신 시작 스킬 + 하나). 광기의 계시는 광기 둘을 지닌 판 */
  const DECKS: Record<string, [string, string[]]> = {
    'ar-open-wound': ['hunter', []],
    'ar-stopping-shot': ['soldier', []],
    'ar-chain-reaction': ['hunter', ['poison-dart']],
    'ar-ward-rend': ['occultist', []],
    'ar-iron-vow': ['soldier', []],
    'ar-mad-revelation': ['occultist', []],
  };

  it('덱이 다 있다', () => {
    expect(Object.keys(DECKS).sort()).toEqual([...SKILL_IDS].sort());
  });

  for (const [id, [origin, extra]] of Object.entries(DECKS)) {
    it(`${SKILLS.get(id)?.name ?? id}`, () => {
      const run = newRun({ seed: 77, origin });
      if (id === 'ar-mad-revelation') run.madness = quietMadness().map((m) => m.id);
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

  for (const id of EQUIP_IDS) {
    it(`${EQUIPS.get(id)!.name}: 끼고 싸워 이긴다`, () => {
      const d = EQUIPS.get(id)!;
      const run = newRun({ seed: 91, origin: 'soldier' });
      const slot: EquipSlot = d.slot === 'trinket' ? 'trinket2' : d.slot;
      run.equip[slot] = { uid: 'gear', id, lvl: 1 };
      let basic = 0;
      for (const enc of ['a1-cult', 'a1-hook', 'a1-dogs3', 'a1-smugglers']) {
        const c = startCombat(run, enc);
        c.snapshots = false;
        for (let n = 0; n < 60 && !c.over; n++) {
          autoTurn(c);
          basic += c.drain().filter((ev) => ev.t === 'skill' && ev.skill === d.skill).length;
        }
        expect(c.s.phase, `${id} @ ${enc}`).toBe('victory');
        run.combat = null;
        run.player.hp = run.player.maxHp;
        run.player.sanity = run.player.maxSanity;
      }
      if (d.skill) expect(basic, `${id}: 기본기를 한 번도 쓰지 않았다`).toBeGreaterThan(0);
    });
  }
});

describe('저장', () => {
  it('새 장비·기술을 모두 쓴 전투의 상태는 JSON 그대로다 (숫자뿐 — NaN·Infinity·함수 없음)', () => {
    const { c, e } = deep({
      equip: { weapon: { id: 'ar-prism' }, armor: { id: 'ar-echo-plate' }, trinket1: { id: 'ar-overflow-grail' }, trinket2: { id: 'ar-anatomy' } },
      skills: SKILL_IDS.map((id) => ({ id })),
    });
    c.run.madness = [];
    Object.assign(e.st, { bleed: 3, poison: 3, ward: 2 });
    e.maxPoise = e.poise = 4;
    c.p.block = 30;
    for (const ref of [...c.run.slots, 'weapon', 'armor']) {
      if (!ref || c.over) continue;
      const def = c.skillInfo(ref)!.def;
      if (c.blockReason(ref)) continue;
      c.useSkill(ref, def.target === 'single' ? e.uid : null);
    }
    c.endTurn();
    expect(c.s.phase).toBe('player');
    const saved = JSON.parse(JSON.stringify(c.run));
    expect(saved).toEqual(c.run);
    // 불러온 전투가 그대로 이어진다
    const c2 = new Combat(saved);
    expect(prismType(c2)).toBe(prismType(c));
    expect(c2.useSkill('weapon', c2.alive[0].uid)).toBeNull();
  });
});
