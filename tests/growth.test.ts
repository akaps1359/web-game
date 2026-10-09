import { afterEach, describe, expect, it } from 'vitest';
import '../src/content';
import { closeReward, generateFloor } from '../src/engine/dungeon';
import { chooseEvent, eventView, startEvent } from '../src/engine/events';
import {
  GROWTH,
  acceptPact,
  affixHooks,
  equipName,
  evolutionsReady,
  forgoChoice,
  gainOmen,
  lootRarity,
  moreAffixes,
  OMEN_RARITY,
  omensOf,
  rollAffixes,
  rollPacts,
  shrinePacts,
  signShrinePact,
  tickPacts,
} from '../src/engine/growth';
import { camp } from '../src/engine/places';
import { AFFIXES, ENCOUNTERS, EQUIPS, EVENTS, OMENS, PACTS, RELICS, STATUSES } from '../src/engine/registry';
import {
  CHOICE_RATE,
  GOLD_MULT,
  RARITY_ACT,
  XP_STEP,
  chooseLoot,
  finishCombat,
  gainEquip,
  gainRelic,
  newRun,
  rollRelic,
  startCombat,
  takeLoot,
  xpToNext,
  type RunState,
} from '../src/engine/run';
import { openShop } from '../src/engine/shop';

/*
 * 성장 개편 (2026-10, engine/growth.ts): 느리지만 넓게 — 징조·장비 접사·계약·유물 진화, 그리고 성장 속도.
 */

const isSpecial = (id: string) => /^(lord|stalker|rift)/.test(id);
const enc = (act: number, kind: 'normal' | 'elite' | 'boss') => ENCOUNTERS.find((e) => e.act === act && e.kind === kind && !isSpecial(e.id))!;

function run(act = 1, seed = 11): RunState {
  const r = newRun({ seed, origin: 'soldier' });
  if (act !== 1) {
    r.act = act;
    r.floor = generateFloor(r, act);
  }
  r.player.maxHp = r.player.hp = 9999;
  return r;
}

/** 이 조우를 그 자리에서 이기고 보상을 받는다 */
function win(r: RunState, encId: string) {
  const c = startCombat(r, encId);
  for (let i = 0; i < 40 && !c.over; i++) {
    for (const e of [...c.alive]) c.kill(e);
    if (!c.alive.length && c.s.phase === 'player') c.endTurn();
  }
  expect(c.s.phase).toBe('victory');
  return finishCombat(r)!;
}

/** 일반 전투에서도 늘 고르는 보상이 나오게 (확률을 보는 시험이 아닐 때) */
let rateSaved: number[] | null = null;
function alwaysChoice() {
  rateSaved = CHOICE_RATE.slice();
  CHOICE_RATE.fill(1);
}
afterEach(() => {
  if (rateSaved) CHOICE_RATE.splice(0, CHOICE_RATE.length, ...rateSaved);
  rateSaved = null;
});

describe('성장 속도', () => {
  it('경험치 곡선이 가팔라졌다 (20 + 35(L-1)) — 스킬 칸이 열리는 레벨이 늦어진다', () => {
    expect(XP_STEP).toEqual({ base: 20, per: 35 });
    expect(xpToNext(1)).toBe(20);
    expect(xpToNext(3)).toBe(90);
  });

  it('깊은 층일수록 흔한 것은 덜, 귀한 것은 더 (RARITY_ACT) — 1·2층은 그대로', () => {
    for (const k of ['common', 'uncommon', 'rare'] as const) {
      expect(RARITY_ACT[k][1]).toBe(1);
      expect(RARITY_ACT[k].length).toBe(6);
    }
    for (let a = 2; a <= 5; a++) {
      expect(RARITY_ACT.common[a]).toBeLessThanOrEqual(RARITY_ACT.common[a - 1]);
      expect(RARITY_ACT.rare[a]).toBeGreaterThanOrEqual(RARITY_ACT.rare[a - 1]);
    }
  });

  it('일반 전투의 고르는 보상은 층이 깊을수록 드물다. 정예·수호자는 늘 준다', () => {
    for (let a = 2; a <= 5; a++) expect(CHOICE_RATE[a]).toBeLessThanOrEqual(CHOICE_RATE[a - 1]);
    // 저층부터 드물다 (저층 성장 억제 — 착실히 돌아다녀야 쌓인다)
    expect(CHOICE_RATE[1]).toBeLessThan(1);
    // 일반 전투 마흔 번 — 고르는 보상이 나온 비율이 CHOICE_RATE 근처
    let got = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const r = run(5, 100 + i);
      if (win(r, enc(5, 'normal').id).choice?.length) got++;
    }
    expect(got / N).toBeGreaterThan(CHOICE_RATE[5] - 0.25);
    expect(got / N).toBeLessThan(CHOICE_RATE[5] + 0.25);
    for (let i = 0; i < 6; i++) expect(win(run(5, 200 + i), enc(5, 'elite').id).choice?.length).toBeGreaterThan(0);
  });

  it('전투 골드는 GOLD_MULT를 따른다 (5층 2.2배)', () => {
    expect(GOLD_MULT[1]).toBe(1);
    for (let a = 2; a <= 5; a++) expect(GOLD_MULT[a]).toBeGreaterThan(GOLD_MULT[a - 1]);
  });
});

describe('징조: 희귀 이상의 보상을 고르지 않고 지나치면', () => {
  it('희귀 이상(희귀·특수·보스·금기·창세)의 후보가 있는 보상만 징조를 내민다 — 성장 억제', () => {
    alwaysChoice();
    let withOmen = 0;
    let without = 0;
    for (let s = 0; s < 40; s++) {
      const r = run(1 + (s % 4), 700 + s);
      const rw = win(r, enc(r.act, s % 2 ? 'elite' : 'normal').id);
      const rare = rw.choice!.some((x) => OMEN_RARITY.includes(lootRarity(x)!));
      expect(!!rw.omen, `${s}: ${rw.choice!.map((x) => `${x.kind}:${x.id}:${lootRarity(x)}`).join(',')}`).toBe(rare);
      if (rw.omen) withOmen++;
      else without++;
    }
    expect(withOmen).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
    expect(OMEN_RARITY).toEqual(['rare', 'special', 'boss', 'forbidden', 'genesis']);
  });

  it('보상을 만들 때 건너뛰면 받을 징조가 정해져 보인다 — 지나치면 받고, 고르면 받지 않는다 (수호자 보상: 보스 유물)', () => {
    const a = run();
    const rw = win(a, enc(1, 'boss').id);
    expect(rw.choice!.some((x) => lootRarity(x) === 'boss')).toBe(true);
    expect(OMENS.has(rw.omen!)).toBe(true);
    const omen = rw.omen!;
    expect(closeReward(a)).toBe(true);
    expect(omensOf(a)).toEqual([omen]);

    const b = run();
    const rw2 = win(b, enc(1, 'boss').id);
    expect(rw2.omen).toBe(omen);
    expect(chooseLoot(b, 0)).toBeNull();
    closeReward(b);
    expect(omensOf(b)).toEqual([]);
  });

  it('흔한 후보뿐인 보상은 지나쳐도 아무것도 없다', () => {
    const r = run();
    win(r, enc(1, 'normal').id);
    r.reward!.choice = r.reward!.choice?.length ? r.reward!.choice : [{ kind: 'upgrade', id: 'upgrade' }];
    delete r.reward!.omen;
    expect(forgoChoice(r)).toBeNull();
    closeReward(r);
    expect(omensOf(r)).toEqual([]);
  });

  it('지닐 수 있는 징조는 GROWTH.omenCap개 — 가득 차면 지나쳐도 받지 못한다 (보상은 닫힌다)', () => {
    const r = run();
    // 전투·보상에서 이루어지지 않는 것들로 채운다
    const ids = ['omen-merchant', 'omen-rest', 'omen-smith', 'omen-relic'];
    expect(GROWTH.omenCap).toBeLessThan(ids.length);
    for (let i = 0; i < GROWTH.omenCap; i++) expect(gainOmen(r, ids[i])).toBe(true);
    expect(gainOmen(r, ids[GROWTH.omenCap])).toBe(false);
    win(r, enc(1, 'boss').id);
    expect(r.reward!.omen).toBeDefined();
    expect(forgoChoice(r)).toBeNull();
    expect(r.reward!.chosen).toBe(true);
    expect(omensOf(r).length).toBe(GROWTH.omenCap);
  });

  it('지닌 징조와 같은 것은 건너뛰기 징조로 나오지 않는다', () => {
    for (let s = 0; s < 12; s++) {
      const r = run(1, 300 + s);
      gainOmen(r, 'omen-merchant');
      gainOmen(r, 'omen-rest');
      const rw = win(r, enc(1, 'boss').id);
      expect(rw.omen).toBeDefined();
      expect(['omen-merchant', 'omen-rest']).not.toContain(rw.omen);
    }
  });

  it('황금의 징조: 다음 전투 골드 두 배', () => {
    const base = run();
    const g0 = base.player.gold;
    const rw0 = win(base, enc(1, 'normal').id);
    const plain = base.player.gold - g0;
    const r = run();
    gainOmen(r, 'omen-gold');
    const g1 = r.player.gold;
    const rw1 = win(r, enc(1, 'normal').id);
    expect(rw1.gold).toBeGreaterThanOrEqual(rw0.gold * 2 - 1);
    expect(r.player.gold - g1).toBeGreaterThan(plain);
    expect(omensOf(r)).toEqual([]);
  });

  it('수호·간파·선수의 징조: 다음 전투를 시작할 때 이루어진다', () => {
    const r = run(3);
    gainOmen(r, 'omen-ward');
    gainOmen(r, 'omen-sight');
    gainOmen(r, 'omen-haste');
    const plain = startCombat(run(3), enc(3, 'normal').id);
    const c = startCombat(r, enc(3, 'normal').id);
    expect(c.p.block).toBeGreaterThanOrEqual(10 + 3 * 3);
    for (const e of c.alive) expect([...e.known].sort()).toEqual([...e.weak].sort());
    expect(c.s.ap).toBe(plain.s.ap + 1);
    expect(omensOf(r)).toEqual([]);
  });

  it('풍요·각인의 징조: 다음 고르는 보상에 후보가 더 붙는다', () => {
    alwaysChoice();
    const plain = win(run(), enc(1, 'normal').id).choice!.length;
    const r = run();
    gainOmen(r, 'omen-plenty');
    gainOmen(r, 'omen-rune');
    const rw = win(r, enc(1, 'normal').id);
    expect(rw.choice!.length).toBe(plain + 2);
    expect(rw.choice!.some((x) => x.kind === 'rune')).toBe(true);
    expect(omensOf(r)).toEqual([]);
  });

  it('심연의 징조: 다음 정예의 유물이 희귀 등급', () => {
    for (let s = 0; s < 6; s++) {
      const r = run(2, 400 + s);
      gainOmen(r, 'omen-relic');
      const rw = win(r, enc(2, 'elite').id);
      const relic = rw.items.find((x) => x.kind === 'relic');
      expect(RELICS.get(relic!.id)!.rarity).toBe('rare');
      expect(omensOf(r)).toEqual([]);
    }
  });

  it('상인의 징조: 다음에 새로 여는 상점이 30% 싸다 (한 번만)', () => {
    const a = run(2, 21);
    openShop(a, 'merchant', 3);
    const r = run(2, 21);
    gainOmen(r, 'omen-merchant');
    openShop(r, 'merchant', 3);
    const pa = a.shop!.items.filter((x) => x.kind !== 'oil').map((x) => x.price);
    const pr = r.shop!.items.filter((x) => x.kind !== 'oil').map((x) => x.price);
    expect(pr).toEqual(pa.map((p) => Math.round(p * 0.7)));
    expect(omensOf(r)).toEqual([]);
  });

  it('휴식의 징조: 그 야영지에서 한 가지를 더 할 수 있다 (한 번만)', () => {
    const r = run();
    const f = r.floor!;
    f.pos = f.rooms.find((x) => x.type === 'camp')!.id;
    r.screen = 'camp';
    gainOmen(r, 'omen-rest');
    expect(camp(r, 'meditate')).toBeNull();
    expect(f.rooms[f.pos].cleared).toBeFalsy();
    expect(camp(r, 'sleep')).toBeNull();
    expect(f.rooms[f.pos].cleared).toBe(true);
    expect(camp(r, 'sleep')).not.toBeNull();
  });

  it('대장장이의 징조: 다음에 얻는 장비에 접사 하나가 더', () => {
    const id = [...EQUIPS.values()].find((d) => d.rarity === 'common' && d.slot === 'weapon')!.id;
    const r = run();
    gainOmen(r, 'omen-smith');
    expect(gainEquip(r, id, 0, [])).toBe(true);
    expect(r.bag.at(-1)!.aff?.length).toBe(1);
    expect(omensOf(r)).toEqual([]);
  });

  it('모든 징조는 엔진이 이루는 곳이 있다 (이름 있는 id만)', () => {
    const used = ['omen-plenty', 'omen-rare', 'omen-rune', 'omen-gold', 'omen-ward', 'omen-sight', 'omen-haste', 'omen-merchant', 'omen-rest', 'omen-smith', 'omen-relic'];
    expect([...OMENS.keys()].sort()).toEqual([...used].sort());
  });
});

describe('장비 접사', () => {
  const weapon = () => [...EQUIPS.values()].find((d) => d.rarity === 'uncommon' && d.slot === 'weapon')!.id;

  it('층이 깊을수록 많이 붙는다 (GROWTH.affixes 기대값), 2단계는 3층부터, 칸에 맞는 것만', () => {
    for (const act of [1, 3, 5]) {
      let sum = 0;
      let tier2 = 0;
      const N = 300;
      for (let s = 0; s < N; s++) {
        const r = run(1, 500 + s);
        r.act = act;
        for (const slot of ['weapon', 'armor', 'trinket'] as const) {
          const id = [...EQUIPS.values()].find((d) => d.rarity === 'common' && d.slot === slot)!.id;
          const a = rollAffixes(r, id);
          expect(new Set(a).size).toBe(a.length);
          for (const x of a) {
            const d = AFFIXES.get(x)!;
            expect(!d.slots || d.slots.includes(slot), `${x} → ${slot}`).toBe(true);
            if (d.tier === 2) tier2++;
          }
          if (slot === 'weapon') sum += a.length;
        }
      }
      expect(sum / N).toBeGreaterThan(GROWTH.affixes[act] - 0.2);
      expect(sum / N).toBeLessThan(GROWTH.affixes[act] + 0.2);
      if (act < GROWTH.affixTier2) expect(tier2).toBe(0);
      else expect(tier2).toBeGreaterThan(0);
    }
  });

  it('기본 장비·창세 장비에는 붙지 않는다', () => {
    const r = run(5);
    for (const d of EQUIPS.values()) if (d.rarity === 'basic' || d.rarity === 'genesis') expect(rollAffixes(r, d.id, 2)).toEqual([]);
  });

  it('보상·상점에 보인 접사 그대로 가방에 들어온다', () => {
    const r = run(4);
    const id = weapon();
    const shown = rollAffixes(r, id, 1);
    expect(gainEquip(r, id, 0, shown)).toBe(true);
    expect(r.bag.at(-1)!.aff).toEqual(shown);
    expect(takeLoot(r, { kind: 'equip', id: [...EQUIPS.values()].find((d) => d.rarity === 'common' && d.slot === 'armor')!.id, aff: ['aff-guard'] })).toBeNull();
    expect(r.bag.at(-1)!.aff).toEqual(['aff-guard']);
  });

  it('장비 이름 앞에 접사 이름이 붙는다', () => {
    const id = weapon();
    expect(equipName({ id, aff: ['aff-keen', 'aff-bleed'] })).toBe(`날선 · 피를 부르는 ${EQUIPS.get(id)!.name}`);
    expect(equipName({ id })).toBe(EQUIPS.get(id)!.name);
  });

  it('moreAffixes: 이미 붙은 것과 겹치지 않게 더한다', () => {
    const r = run(5);
    const id = weapon();
    const a = moreAffixes(r, id, ['aff-keen'], 2);
    expect(a.length).toBe(3);
    expect(a[0]).toBe('aff-keen');
    expect(new Set(a).size).toBe(3);
  });

  it('장착한 장비의 접사가 전투에서 돈다 (굳센: 첫 턴 방어도 +8, 날선: 약점 피해 +15%)', () => {
    const plainRun = run(2, 31);
    const plain = startCombat(plainRun, enc(2, 'normal').id);
    const r = run(2, 31);
    r.equip.armor = { ...r.equip.armor!, aff: ['aff-guard'] };
    expect([...affixHooks(r)].length).toBe(1);
    const c = startCombat(r, enc(2, 'normal').id);
    expect(c.p.block - plain.p.block).toBe(8);

    // 날선: 같은 약점 공격의 미리보기 피해가 1.15배
    const e = c.alive.find((x) => x.weak.length)!;
    expect(e).toBeDefined();
    e.known = [...e.weak];
    e.mem.agOff = 1;
    const dmg = () => c.preview(c.p, e, 100, e.weak[0], { attack: true });
    const before = dmg();
    r.equip.weapon = { ...r.equip.weapon!, aff: ['aff-keen'] };
    expect(dmg()).toBe(Math.round(before * 1.15));
  });

  it('접사 정의: 이름·아이콘·설명, 1단계와 2단계, 칸은 무기·방어구·장신구 중', () => {
    for (const d of AFFIXES.values()) {
      expect(d.name && d.icon.startsWith('gi:') && d.desc, d.id).toBeTruthy();
      expect([1, 2]).toContain(d.tier);
      for (const s of d.slots ?? []) expect(['weapon', 'armor', 'trinket']).toContain(s);
    }
    expect([...AFFIXES.values()].filter((d) => d.tier === 1).length).toBeGreaterThanOrEqual(10);
    expect([...AFFIXES.values()].filter((d) => d.tier === 2).length).toBeGreaterThanOrEqual(5);
  });
});

describe('계약: 저주를 견디면 축복이 영원히', () => {
  it('저주가 GROWTH.pactFights전투 동안 돌고, 그 뒤로 축복 — 활력은 최대 체력 +12', () => {
    const r = run(2);
    const hp = r.player.maxHp;
    const c = startCombat(r, enc(2, 'normal').id);
    const e = c.alive[0];
    e.mem.agOff = 1;
    const hit = () => c.preview(c.p, e, 1000, 'slash', { attack: true });
    const plain = hit();
    expect(acceptPact(r, 'curse-frail', 'boon-vigor')).toBeNull();
    expect(Math.abs(hit() - plain * 0.85)).toBeLessThanOrEqual(1);
    for (let i = 0; i < GROWTH.pactFights - 1; i++) tickPacts(r);
    expect(r.player.maxHp).toBe(hp);
    tickPacts(r);
    expect(r.player.maxHp).toBe(hp + 12);
    expect(r.pacts![0].left).toBe(0);
    // 저주는 사라졌다
    expect(hit()).toBe(plain);
  });

  it('이긴 전투마다 저주가 하나씩 준다 (finishCombat)', () => {
    const r = run(2);
    acceptPact(r, 'curse-dread', 'boon-might');
    const str = r.player.str;
    for (let i = 0; i < GROWTH.pactFights; i++) {
      expect(r.pacts![0].left).toBe(GROWTH.pactFights - i);
      win(r, enc(2, 'normal').id);
      r.reward = null;
      r.screen = 'dungeon';
    }
    expect(r.pacts![0].left).toBe(0);
    expect(r.player.str).toBe(str + 1);
  });

  it('같은 축복은 두 번 맺지 못하고, 맺은 축복은 후보에 다시 나오지 않는다', () => {
    const r = run(2);
    expect(acceptPact(r, 'curse-frail', 'boon-vigor')).toBeNull();
    expect(acceptPact(r, 'curse-dread', 'boon-vigor')).not.toBeNull();
    expect(acceptPact(r, 'boon-might', 'curse-frail')).not.toBeNull();
    for (let i = 0; i < 20; i++) for (const p of rollPacts(r, 2)) expect(p.boon).not.toBe('boon-vigor');
  });

  it('신전의 계약: 다시 열어도 같은 둘, 한 신전에 한 번', () => {
    const r = run(2);
    const f = r.floor!;
    f.pos = f.rooms.find((x) => x.type === 'shrine')?.id ?? f.pos;
    const a = shrinePacts(r);
    const b = shrinePacts(r);
    expect(typeof a).not.toBe('string');
    expect(b).toEqual(a);
    expect(signShrinePact(r, 0)).toBeNull();
    expect(typeof shrinePacts(r)).toBe('string');
    expect(signShrinePact(r, 1)).not.toBeNull();
    expect(r.pacts!.length).toBe(1);
  });

  it('계약 정의: 저주와 축복 모두 넉넉하게, 축복은 통찰을 주지 않는다 (통찰은 영구 대가와 함께만)', () => {
    const curses = [...PACTS.values()].filter((p) => p.kind === 'curse');
    const boons = [...PACTS.values()].filter((p) => p.kind === 'boon');
    expect(curses.length).toBeGreaterThanOrEqual(5);
    expect(boons.length).toBeGreaterThanOrEqual(8);
    for (const b of boons) {
      const r = run(2);
      const ins = r.player.insight;
      b.onGain?.(r);
      expect(r.player.insight, b.id).toBe(ins);
    }
  });
});

describe('유물 진화', () => {
  const evos = () => [...RELICS.values()].filter((d) => d.evolve);

  it('재료는 보통 보상에서 나오는 유물이고, 진화한 유물은 보통 보상·상점에 나오지 않는다', () => {
    const parts = new Set<string>();
    for (const d of evos()) {
      expect(d.rarity).toBe('rare');
      for (const x of d.evolve!) {
        const p = RELICS.get(x);
        expect(p, `${d.id}: ${x}`).toBeDefined();
        expect(['common', 'uncommon', 'rare']).toContain(p!.rarity);
        expect(p!.evolve, x).toBeUndefined();
        expect(parts.has(x), `${x}는 진화 한 곳에만`).toBe(false);
        parts.add(x);
      }
    }
    expect(evos().length).toBeGreaterThanOrEqual(6);
    for (let s = 0; s < 200; s++) {
      const r = run(1 + (s % 5), 600 + s);
      const id = rollRelic(r);
      expect(RELICS.get(id!)!.evolve, id!).toBeUndefined();
    }
  });

  it('짝을 모두 지니고 수호자를 쓰러뜨리면 보상에 진화가 함께 나온다 — 고르면 두 재료가 진화한 유물로', () => {
    const d = evos()[0];
    const r = run(2, 41);
    for (const x of d.evolve!) gainRelic(r, x);
    expect(evolutionsReady(r)).toEqual([d.id]);
    const rw = win(r, enc(2, 'boss').id);
    const idx = rw.choice!.findIndex((x) => x.kind === 'evolve' && x.id === d.id);
    expect(idx).toBeGreaterThanOrEqual(0);
    const n = r.relics.length;
    expect(chooseLoot(r, idx)).toBeNull();
    const ids = r.relics.map((x) => x.id);
    expect(ids).toContain(d.id);
    for (const x of d.evolve!) expect(ids).not.toContain(x);
    expect(r.relics.length).toBe(n - 1);
    expect(evolutionsReady(r)).toEqual([]);
  });

  it('짝 하나만 있으면 진화는 나오지 않는다', () => {
    const d = evos()[0];
    const r = run(2, 41);
    gainRelic(r, d.evolve![0]);
    expect(evolutionsReady(r)).toEqual([]);
    const rw = win(r, enc(2, 'boss').id);
    expect(rw.choice!.some((x) => x.kind === 'evolve')).toBe(false);
  });
});

describe('이름', () => {
  it('징조·접사·계약의 이름이 상태이상 이름과 겹치지 않는다 (용어 풀이가 엉뚱한 뜻을 붙이지 않게 — 예전 축복 「활력」)', () => {
    const st = new Set([...STATUSES.values()].map((d) => d.name));
    for (const d of [...OMENS.values(), ...AFFIXES.values(), ...PACTS.values()]) expect(st.has(d.name), `${d.id} ${d.name}`).toBe(false);
  });
});

describe('성장 이벤트', () => {
  const growthEvents = () => [...EVENTS.values()].filter((e) => e.id.startsWith('g-'));

  it('다섯 개, 5층에는 나오지 않는다 (5층 이벤트는 꿈의 것만)', () => {
    expect(growthEvents().length).toBe(5);
    for (const e of growthEvents()) expect(e.acts).not.toContain(5);
  });

  it('공증인과 점쟁이는 다시 열어도 같은 것을 내민다', () => {
    for (const id of ['g-notary', 'g-seer']) {
      const r = run(3, 51);
      r.player.gold = 500;
      gainOmen(r, 'omen-gold');
      startEvent(r, id);
      const a = eventView(r)!.choices.map((c) => c.label);
      const b = eventView(r)!.choices.map((c) => c.label);
      expect(b).toEqual(a);
    }
  });

  it('점쟁이는 지닌 징조를 바꿔 줄 뿐 — 새 징조를 만들지 않는다 (징조는 희귀 이상의 보상을 지나칠 때만)', () => {
    const def = EVENTS.get('g-seer')!;
    const none = run(2, 53);
    expect(def.when!(none)).toBe(false);
    const r = run(2, 53);
    r.player.gold = 500;
    gainOmen(r, 'omen-gold');
    expect(def.when!(r)).toBe(true);
    const got = r.stats.omens;
    startEvent(r, 'g-seer');
    const v = eventView(r)!;
    const i = v.choices.findIndex((c) => !c.disabled && c.label.startsWith('바꾼다'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(chooseEvent(r, i)).toBeNull();
    expect(r.event!.done).toBe(true);
    expect(omensOf(r).length).toBe(1);
    expect(omensOf(r)[0]).not.toBe('omen-gold');
    expect(r.stats.omens).toBe(got);
    expect(r.player.gold).toBeLessThan(500);
    // 지닌 징조가 없으면 (이벤트가 열린 뒤 사라졌어도) 지나가기만
    const empty = run(2, 54);
    startEvent(empty, 'g-seer');
    expect(eventView(empty)!.choices.length).toBe(1);
  });

  it('공증인: 서명하면 계약이 맺어진다', () => {
    const r = run(3, 52);
    startEvent(r, 'g-notary');
    const v = eventView(r)!;
    const i = v.choices.findIndex((c) => !c.disabled && c.label.includes('서명'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(chooseEvent(r, i)).toBeNull();
    expect(r.event!.done).toBe(true);
    expect(r.pacts?.length).toBe(1);
  });
});
