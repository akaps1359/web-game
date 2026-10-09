import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, MAX_ROW, type CombatEvent } from '../src/engine/combat';
import { ENEMIES, SKILLS, STATUSES } from '../src/engine/registry';
import { gainXp, learnSkill, newRun, startCombat, type RunState } from '../src/engine/run';
import type { EnemyUnit, TurnNote } from '../src/engine/types';
import { autoTurn } from '../src/sim/bot';
import { seized } from '../src/content/lib';
import {
  ANCHOR_DMG,
  BAIL_DMG,
  CAPTAIN_HP,
  CHAIN,
  CHAINED,
  CHAIN_DRAIN,
  CHAIN_GAP,
  CHAIN_RISE,
  CHOIR_SAN,
  CHOIR_WATER,
  FLOOD,
  HANDS,
  HANDS_WATER,
  RAM_DMG,
  SHANTY_SAN,
  SWORD_DMG,
  SWORD_HITS,
  WATER_MAX,
  WRECK_AT,
  WRECK_WATER,
  setWater,
  throwChain,
} from '../src/content/act1/common';

/**
 * 1층 계층군주 「익사한 선장」 (2026-10 강화): 닻사슬 · 두 동강 난 배(망령 선장) · 물속의 손 · 유령선 돌격 · 물귀신의 합창.
 * 기존 차오르는 물·만조는 tests/act1-patterns.test.ts
 */

/** 쓰러지지 않는 시작 능력치의 주인공 (힘 0, 행동력 3) */
function hero(seed = 101, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  return run;
}

function fight(run: RunState = hero()): Combat {
  const c = startCombat(run, 'lord-a1', { anomaly: null });
  c.drain();
  return c;
}

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((e) => e.def === def)!;
const count = (c: Combat, def: string) => c.alive.filter((e) => e.def === def).length;
const cap = (c: Combat) => c.s.enemies.find((e) => e.def === 'captain')!;
const cines = (ev: CombatEvent[], name: string) => ev.filter((x) => x.t === 'cine' && x.name === name);
const texts = (ev: CombatEvent[]) => ev.filter((x): x is Extract<CombatEvent, { t: 'text' }> => x.t === 'text').map((x) => x.text);
const moveEv = (ev: CombatEvent[], uid: string) => ev.find((x) => x.t === 'move' && x.uid === uid) as Extract<CombatEvent, { t: 'move' }> | undefined;
const hitsOn = (ev: CombatEvent[], src: string) => ev.filter((x) => x.t === 'dmg' && x.tgt === 'p' && x.src === src && x.attack) as Extract<CombatEvent, { t: 'dmg' }>[];

/** 선장의 다음 행동을 순서표의 이 칸으로 정한다 (가라앉는 배 'ci', 두 동강 난 배 'c2') */
function planSlot(c: Combat, e: EnemyUnit, i: number) {
  e.mem[e.form ? 'c2' : 'ci'] = i;
  c.planIntent(e);
}

/** 체력을 절반 바로 위로 두고 한 대 쳐서 배를 두 동강 낸다 (내 턴) */
function wreckNow(c: Combat): EnemyUnit {
  const e = cap(c);
  e.hp = Math.floor(e.maxHp * WRECK_AT) + 1;
  c.damage({ src: c.p, tgt: e, base: 6, type: 'true', attack: true });
  return e;
}

/** 물속의 손이 기술을 쥔 장면: 두 동강 낸 뒤 선장이 한 번 행동한다 (물 WRECK_WATER → 차오름 → 붙잡음) */
function gripped(run: RunState = hero()): { c: Combat; e: EnemyUnit; ev: CombatEvent[] } {
  const c = fight(run);
  const e = wreckNow(c);
  c.drain();
  c.endTurn();
  return { c, e, ev: c.drain() };
}

/** 지금 손이 쥔 기술 (장착 칸 uid) */
const held = (c: Combat): string | null => {
  const e = cap(c);
  return (e.mem.specimen ?? 0) > 0 ? c.run.slots[e.mem.specimen - 1] : null;
};

/** 화면이 모으는 것과 같이 (ui/screens/Combat.tsx turnNotes) */
function notes(c: Combat): TurnNote[] {
  const out: TurnNote[] = [];
  for (const [h, self] of c.sources(c.p)) {
    const n = h.turnNote?.(c, self);
    if (n) out.push(n);
  }
  return out;
}

describe('익사한 선장 — 수치', () => {
  it('체력·커틀러스·닻·뱃노래가 강해졌다 (상수 그대로)', () => {
    const def = ENEMIES.get('captain')!;
    expect(def.hp).toEqual([CAPTAIN_HP, CAPTAIN_HP]);
    expect(def.moves.sword.dmg).toBe(SWORD_DMG);
    expect(def.moves.sword.hits).toBe(SWORD_HITS);
    expect(def.moves.ready.dmg).toBe(ANCHOR_DMG);
    expect(def.moves.anchor.dmg).toBe(ANCHOR_DMG);
    expect(def.moves.shanty.sanity).toBe(SHANTY_SAN);
    expect(def.moves.ramready.dmg).toBe(RAM_DMG);
    expect(def.moves.ram.dmg).toBe(RAM_DMG);
    expect(def.moves.ram.ultimate).toBe(true);
    expect(def.moves.choir.sanity).toBe(CHOIR_SAN);
    // 모으는 행동이 이어질 일격의 이름을 알려 준다 (닻과 유령선의 피해가 같아져도 헷갈리지 않게)
    expect(def.moves.ready.follow).toBe(def.moves.anchor.name);
    expect(def.moves.ramready.follow).toBe(def.moves.ram.name);
  });
});

describe('익사한 선장 — 닻사슬', () => {
  it('순서가 오면 전열에 닻사슬을 박는다 — 던진 그 차례부터 물이 1 더 차오르고, 내 상태 칸에 닻사슬이 보인다', () => {
    const c = fight();
    const e = cap(c);
    planSlot(c, e, 4);
    expect(e.intent?.move).toBe('chain');
    expect(e.intent?.kind).toBe('summon');
    c.endTurn();
    const ch = find(c, CHAIN);
    expect(ch.row).toBe(0);
    expect(ch.minion).toBe(true);
    expect(ch.intent?.move).toBe('drag');
    expect(c.p.st[CHAINED]).toBe(1);
    expect(c.p.st[FLOOD]).toBe(1 + CHAIN_RISE);
    // 박혀 있는 동안 선장이 행동할 때마다 1 + CHAIN_RISE
    setWater(c, 0);
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(1 + CHAIN_RISE);
  });

  it('닻사슬을 끊으면 물이 빠지고 칸에서 사라진다 — 선장은 CHAIN_GAP 턴 동안 다시 던지지 않는다', () => {
    const c = fight();
    const e = cap(c);
    throwChain(c, e);
    setWater(c, 2);
    const ch = find(c, CHAIN);
    c.damage({ src: c.p, tgt: ch, base: 999, type: 'blunt', attack: true });
    expect(ch.dead).toBe(true);
    expect(c.p.st[FLOOD]).toBe(2 - CHAIN_DRAIN);
    expect(c.p.st[CHAINED]).toBeUndefined();
    expect(e.mem.chainAt).toBe(c.s.turn);
    setWater(c, 0);
    const at = e.mem.chainAt;
    for (let t = 0; t < CHAIN_GAP; t++) {
      c.s.turn = at + t;
      planSlot(c, e, 4);
      expect(e.intent?.move, `${t}턴 뒤`).toBe('sword');
    }
    c.s.turn = at + CHAIN_GAP;
    planSlot(c, e, 4);
    expect(e.intent?.move).toBe('chain');
  });

  it('닻사슬은 한 번에 하나 — 박혀 있으면 칼을 휘두른다', () => {
    const c = fight();
    const e = cap(c);
    expect(throwChain(c, e)).toBe(true);
    expect(throwChain(c, e)).toBe(false);
    planSlot(c, e, 4);
    expect(e.intent?.move).toBe('sword');
    expect(count(c, CHAIN)).toBe(1);
  });

  it('전열이 차 후열에 박혀도 근접으로 닿는다', () => {
    const c = fight();
    while (c.row(0).length < MAX_ROW) c.spawn('drowned', 0);
    throwChain(c, cap(c));
    const ch = find(c, CHAIN);
    expect(ch.row).toBe(1);
    expect(ENEMIES.get(CHAIN)!.reachable).toBe(true);
    expect(c.validTargets(SKILLS.get('w-knife')!).map((x) => x.uid)).toContain(ch.uid);
  });

  it('만조의 목표에 닻사슬도 오른다 — 끊으면 물이 빠져 만조가 물러간다', () => {
    const c = fight();
    const e = cap(c);
    throwChain(c, e);
    setWater(c, WATER_MAX);
    c.planIntent(e);
    expect(e.intent?.move).toBe('hightide');
    const ch = find(c, CHAIN);
    expect(c.s.obj?.kill).toContain(ch.uid);
    expect(c.s.obj?.text).toContain('닻사슬');
    c.damage({ src: c.p, tgt: ch, base: 999, type: 'blunt', attack: true });
    expect(c.s.obj).toBeNull();
    expect(c.p.st[FLOOD]).toBe(WATER_MAX - CHAIN_DRAIN);
    expect(e.intent?.move).not.toBe('hightide');
    c.endTurn();
    expect(c.s.vars['a1-tideHits']).toBeUndefined();
  });

  it('선장이 쓰러지면 닻사슬도 가라앉는다 (처치가 아니다)', () => {
    const c = fight();
    throwChain(c, cap(c));
    const ch = find(c, CHAIN);
    c.kill(cap(c));
    expect(ch.dead).toBe(true);
    expect(ch.fled).toBe(true);
    expect(c.p.st[CHAINED]).toBeUndefined();
    expect(c.p.st[FLOOD]).toBeUndefined();
  });
});

describe('익사한 선장 — 두 동강 난 배 (체력 절반)', () => {
  it('체력이 절반 이하가 되면 망령 선장이 된다 — 물이 차오르고 익사체 하나가 떠오르며, 화면이 부서지고 속삭인다 (한 번뿐)', () => {
    const c = fight();
    const drowned = count(c, 'drowned');
    const e = wreckNow(c);
    expect(e.form).toBe(1);
    expect(e.name).toBe('망령 선장');
    expect(c.p.st[FLOOD]).toBe(WRECK_WATER);
    expect(count(c, 'drowned')).toBe(drowned + 1);
    expect(c.p.st[HANDS]).toBe(HANDS_WATER);
    const ev = c.drain();
    expect(cines(ev, 'shatter').length).toBe(1);
    expect(cines(ev, 'whisper').length).toBe(1);
    expect(cines(ev, 'water').length).toBe(1);
    // 새 모습의 순서로 곧바로 행동을 다시 정한다
    expect(e.intent?.move).toBe('sword');
    // 한 번뿐
    c.damage({ src: c.p, tgt: e, base: 6, type: 'true', attack: true });
    expect(count(c, 'drowned')).toBe(drowned + 1);
    expect(cines(c.drain(), 'shatter').length).toBe(0);
    // 저장했다 불러와도 그대로
    const c2 = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    expect(cap(c2).form).toBe(1);
    expect(cap(c2).name).toBe('망령 선장');
  });

  it('물이 이미 끝까지 찼으면 그대로 (몰려오던 만조도 그대로)', () => {
    const c = fight();
    const e = cap(c);
    setWater(c, WATER_MAX);
    c.planIntent(e);
    expect(e.intent?.move).toBe('hightide');
    wreckNow(c);
    expect(c.p.st[FLOOD]).toBe(WATER_MAX);
    expect(e.intent?.move).toBe('hightide');
    expect(c.s.obj).not.toBeNull();
  });

  it('모으던 닻은 망령이 되어도 그대로 내려친다 (예고한 피해 그대로)', () => {
    const c = fight();
    const e = cap(c);
    planSlot(c, e, 2);
    expect(e.intent?.move).toBe('ready');
    c.endTurn();
    expect(e.intent?.move).toBe('anchor');
    wreckNow(c);
    expect(e.intent?.move).toBe('anchor');
    expect(e.intent?.dmg).toBe(ANCHOR_DMG);
  });

  it('유령선 돌격: 한 턴 모아 필살기로 들이받는다 — 화면 유리에 금이 남는다', () => {
    const c = fight();
    const e = wreckNow(c);
    planSlot(c, e, 2);
    expect(e.intent?.move).toBe('ramready');
    expect(e.intent?.charging).toBe(true);
    expect(e.intent?.dmg).toBe(RAM_DMG);
    // 만조가 끼어들지 않게 물을 뺀다
    setWater(c, 0);
    c.endTurn();
    expect(e.intent?.move).toBe('ram');
    expect(e.intent?.dmg).toBe(RAM_DMG);
    setWater(c, 0);
    const want = c.preview(e, c.p, RAM_DMG, 'void');
    c.drain();
    c.endTurn();
    const ev = c.drain();
    const m = moveEv(ev, e.uid);
    expect(m?.move).toBe('ram');
    expect(m?.ult).toBe(true);
    expect(m?.cine).toBe('impact');
    expect(hitsOn(ev, e.uid).map((x) => x.amount)).toEqual([want]);
    expect(c.s.vars['ui:cracks']).toBe(1);
    expect(e.mem.charge).toBeUndefined();
  });

  it('유령선 돌격은 붕괴시키면 끊긴다', () => {
    const c = fight();
    const e = wreckNow(c);
    planSlot(c, e, 2);
    setWater(c, 0);
    c.endTurn();
    expect(e.intent?.move).toBe('ram');
    c.breakEnemy(e);
    expect(e.intent?.move).toBe('_broken');
    expect(e.mem.charge).toBeUndefined();
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(hitsOn(ev, e.uid).length).toBe(0);
    expect(e.intent?.move).not.toBe('ram');
  });

  it('물귀신의 합창: 정신 피해, 물 +1 (차례가 끝나며 1 더)', () => {
    const c = fight();
    const e = wreckNow(c);
    planSlot(c, e, 3);
    expect(e.intent?.move).toBe('choir');
    expect(e.intent?.sanity).toBe(CHOIR_SAN);
    setWater(c, 0);
    const san = c.p.sanity;
    c.endTurn();
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.st[FLOOD]).toBe(CHOIR_WATER + 1);
  });

  it('망령 선장의 순서: 커틀러스 → 닻사슬 → 유령선 → (돌격) → 합창 → 커틀러스 → 선원 소집', () => {
    const c = fight();
    const e = wreckNow(c);
    const seen: string[] = [e.intent!.move];
    for (let i = 0; i < 6; i++) {
      // 만조가 끼어들지 않게 매 턴 물을 빼고, 박힌 사슬은 끊는다
      setWater(c, 0);
      c.endTurn();
      for (const x of c.alive) if (x.def === CHAIN) c.kill(x);
      seen.push(e.intent!.move);
    }
    expect(seen).toEqual(['sword', 'chain', 'ramready', 'ram', 'choir', 'sword', 'muster']);
  });
});

describe('익사한 선장 — 물속의 손', () => {
  it('망령 선장 차례가 끝날 때 물이 2 이상이면 다음 내 턴에 쓸 기술 중 가장 비싼 것을 붙잡는다 — 기본기는 그대로 쓸 수 있다', () => {
    const run = hero();
    const big = learnSkill(run, 'finisher')!;
    run.slots[3] = big.uid;
    const { c, e, ev } = gripped(run);
    expect(held(c)).toBe(big.uid);
    expect(seized(c, big.uid)).toBe(true);
    expect(c.blockReason(big.uid)).not.toBeNull();
    // '1턴'으로 보인다 (다 쓴 기술처럼 ✕가 아니다)
    expect(c.s.cd[big.uid]).toBe(1);
    expect(c.blockReason('weapon')).toBeNull();
    expect(c.blockReason('armor')).toBeNull();
    for (const uid of run.slots) if (uid && uid !== big.uid) expect(c.s.cd[uid] ?? 0, uid).toBeLessThan(90);
    expect(texts(ev).some((t) => t.startsWith('물속의 손이') && t.includes(SKILLS.get('finisher')!.name))).toBe(true);
    // 처음엔 유리에 손바닥이 닿는다
    expect(cines(ev, 'handprints').length).toBe(1);
    expect(e.form).toBe(1);
  });

  it('행동력이 같으면 왼쪽 — 다음 턴에도 대기 중인 기술은 건너뛴다', () => {
    const run = hero();
    const c = fight(run);
    const first = run.slots.find((u) => u && (SKILLS.get(run.skills.find((s) => s.uid === u)!.id)!.cost as number) === 1)!;
    wreckNow(c);
    // 가장 왼쪽의 1행동력 기술이 아직 2턴 대기 중이면 그다음 것을
    c.s.cd[first] = 2;
    c.endTurn();
    const h = held(c);
    expect(h).not.toBeNull();
    expect(h).not.toBe(first);
    const i = run.slots.indexOf(h);
    const left = run.slots.slice(0, i).filter((u) => u && u !== first);
    // 고른 것보다 왼쪽에 있는 (대기가 풀린) 기술은 행동력이 더 적다
    for (const u of left) expect(SKILLS.get(run.skills.find((s) => s.uid === u)!.id)!.cost as number).toBeLessThan(SKILLS.get(run.skills.find((s) => s.uid === h)!.id)!.cost as number);
  });

  it('턴이 끝나면 놓는다 — 물이 2 아래면 다시 붙잡지 않는다', () => {
    const { c } = gripped();
    const h = held(c)!;
    expect(h).toBeTruthy();
    // 물이 빠지는 일 없이 (빠지면 곧바로 놓는다 — 아래) 높이만 낮춰 둔다
    c.p.st[FLOOD] = 0;
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(texts(ev).some((t) => t.startsWith('손이 스르르 풀렸다'))).toBe(true);
    expect(held(c)).toBeNull();
    expect(c.blockReason(h)).toBeNull();
  });

  it('물이 그대로면 턴이 끝날 때 놓았다가 선장 차례가 끝나며 다시 붙잡는다', () => {
    const { c } = gripped();
    const h = held(c)!;
    c.drain();
    c.endTurn();
    const ev = texts(c.drain());
    const off = ev.findIndex((t) => t.startsWith('손이 스르르 풀렸다'));
    const on = ev.findIndex((t) => t.startsWith('물속의 손이'));
    expect(off).toBeGreaterThanOrEqual(0);
    expect(on).toBeGreaterThan(off);
    expect(held(c)).toBe(h);
  });

  it('익사체를 쓰러뜨리면 곧바로 놓는다 — 그 턴에 바로 쓸 수 있다', () => {
    const { c } = gripped();
    const h = held(c)!;
    const d = find(c, 'drowned');
    c.kill(d);
    expect(held(c)).toBe(h);
    c.kill(d);
    expect(d.dead).toBe(true);
    expect(held(c)).toBeNull();
    expect(c.blockReason(h)).toBeNull();
  });

  it('물을 빼면 곧바로 놓는다 — 선장에게 한 턴에 피해 12, 닻사슬 끊기, 선장 붕괴', () => {
    // 한 턴에 선장에게 BAIL_DMG
    const a = gripped();
    const ha = held(a.c)!;
    a.c.damage({ src: a.c.p, tgt: a.e, base: BAIL_DMG * 2, type: 'true', attack: true });
    expect(held(a.c)).toBeNull();
    expect(a.c.blockReason(ha)).toBeNull();
    // 닻사슬 끊기
    const b = gripped();
    const hb = held(b.c)!;
    if (!b.c.alive.some((x) => x.def === CHAIN)) throwChain(b.c, b.e);
    expect(held(b.c)).toBe(hb);
    b.c.damage({ src: b.c.p, tgt: find(b.c, CHAIN), base: 999, type: 'blunt', attack: true });
    expect(held(b.c)).toBeNull();
    expect(b.c.blockReason(hb)).toBeNull();
    // 선장 붕괴 (물이 모두 빠진다)
    const d = gripped();
    const hd = held(d.c)!;
    d.c.breakEnemy(d.e);
    expect(held(d.c)).toBeNull();
    expect(d.c.blockReason(hd)).toBeNull();
  });

  it('선장이 쓰러지면 손이 흩어지고 상태 칸에서 사라진다', () => {
    const { c, e } = gripped();
    const h = held(c)!;
    c.kill(e);
    expect(e.mem.specimen).toBe(0);
    expect(c.blockReason(h)).toBeNull();
    expect(c.p.st[HANDS]).toBeUndefined();
  });

  it('무기·방어 기본기는 붙잡지 않는다 — 장착한 기술이 없으면 빈 물만 움켜쥔다', () => {
    const run = hero();
    run.slots = run.slots.map(() => null);
    const { c, ev } = gripped(run);
    expect(held(c)).toBeNull();
    expect(texts(ev).some((t) => t.includes('빈 물만'))).toBe(true);
    expect(c.blockReason('weapon')).toBeNull();
    expect(c.blockReason('armor')).toBeNull();
    expect(Object.values(c.s.cd).every((n) => n < 90)).toBe(true);
  });

  it('저장했다 불러와도 붙잡은 채다', () => {
    const { c } = gripped();
    const h = held(c)!;
    const c2 = new Combat(JSON.parse(JSON.stringify(c.run)) as RunState);
    expect(c2.blockReason(h)).not.toBeNull();
    expect(seized(c2, h)).toBe(true);
  });

  it('상태 칸: 물속의 손 (붙잡는 물 높이), 칩은 붙잡은 기술 — 놓은 뒤엔 다음에 붙잡을 기술과 붙잡는지를 보여 준다', () => {
    const { c } = gripped();
    const h = held(c)!;
    const name = SKILLS.get(c.run.skills.find((s) => s.uid === h)!.id)!.name;
    expect(STATUSES.get(HANDS)!.desc).not.toContain('의도');
    let n = notes(c).find((x) => x.title === '물속의 손')!;
    expect(n.text).toBe(name);
    expect(n.now && n.bad).toBe(true);
    // 칩은 상태를 바꾸지 않는다
    const before = JSON.stringify(c.run.combat);
    notes(c);
    expect(JSON.stringify(c.run.combat)).toBe(before);
    // 물을 빼 놓으면: 다음에 붙잡을 기술 — 선장이 행동해도 물이 2에 못 미치면 흐리게
    c.damage({ src: c.p, tgt: cap(c), base: BAIL_DMG * 2, type: 'true', attack: true });
    setWater(c, 0);
    const e = cap(c);
    planSlot(c, e, 0);
    n = notes(c).find((x) => x.title === '물속의 손')!;
    expect(n.now).toBe(false);
    setWater(c, HANDS_WATER - 1);
    n = notes(c).find((x) => x.title === '물속의 손')!;
    expect(n.now).toBe(true);
  });
});

describe('익사한 선장 — 출신마다 공정한 기믹 (시작 덱)', () => {
  const ORIGINS3 = ['soldier', 'hunter', 'occultist'];

  /** 시작 기술·장비 그대로, 그 층에 맞는 레벨 (체력은 가득) */
  function starter(origin: string, lv: number, seed = 101, tide = 3): RunState {
    const run = newRun({ seed, origin });
    let guard = 0;
    while (run.player.level < lv && guard++ < 30) gainXp(run, 60);
    run.player.hp = run.player.maxHp;
    if (run.floor) run.floor.tide = tide;
    return run;
  }

  /** 한 턴 동안 이 기술들을 대상에게 (쓸 수 있는 만큼, 앞에서부터) 쓴다 */
  function spend(c: Combat, refs: string[], target: EnemyUnit) {
    for (let i = 0; i < 12 && !target.dead && c.s.phase === 'player'; i++) {
      const ref = refs.find((r) => !c.blockReason(r));
      if (!ref) break;
      expect(c.useSkill(ref, target.uid), ref).toBeNull();
    }
  }

  /** 장착한 단일 대상 공격 기술 */
  const attacks = (run: RunState) =>
    run.slots.filter((u): u is string => {
      const d = u ? SKILLS.get(run.skills.find((s) => s.uid === u)!.id) : undefined;
      return !!d && d.target === 'single' && d.tags.includes('attack');
    });

  it('세 출신 모두 시작 덱으로 닻사슬을 한 턴에 끊고, 무기 기본 공격만으로도 두 턴이면 끊는다 (조수 3)', () => {
    for (const origin of ORIGINS3) {
      const run = starter(origin, 4);
      const c = fight(run);
      throwChain(c, cap(c));
      const ch = find(c, CHAIN);
      delete c.p.st.weak;
      spend(c, [...attacks(run), 'weapon'], ch);
      expect(ch.dead, origin).toBe(true);

      const run2 = starter(origin, 4);
      const c2 = fight(run2);
      throwChain(c2, cap(c2));
      const ch2 = find(c2, CHAIN);
      for (let t = 0; t < 2 && !ch2.dead; t++) {
        delete c2.p.st.weak;
        spend(c2, ['weapon'], ch2);
        if (!ch2.dead) c2.endTurn();
      }
      expect(ch2.dead, `${origin} 기본 공격`).toBe(true);
    }
  });

  it('기술을 붙잡혀도 세 출신 모두 무기·방어 기본기로 움직이고, 봇은 그 턴을 그대로 치른다', () => {
    for (const origin of ORIGINS3) {
      const { c } = gripped(starter(origin, 4));
      const h = held(c);
      expect(h, origin).not.toBeNull();
      expect(c.blockReason(h!), origin).not.toBeNull();
      expect(c.blockReason('weapon'), origin).toBeNull();
      expect(c.blockReason('armor'), origin).toBeNull();
      const used = c.run.stats.skillsUsed;
      autoTurn(c);
      expect(c.run.stats.skillsUsed, origin).toBeGreaterThan(used);
      expect(c.s.phase, origin).not.toBe('defeat');
    }
  });

  it('봇이 끝까지 싸워 이긴다 — 닻사슬을 던지고, 배가 두 동강 나고, 물속의 손이 기술을 붙잡는다 (시작 덱, 쓰러지지 않는 몸)', () => {
    for (const origin of ORIGINS3) {
      const run = hero(77, origin);
      const c = startCombat(run, 'lord-a1', { anomaly: null });
      const seen = { chain: false, wreck: false, grip: false };
      let n = 0;
      while (!c.over && n++ < 300) {
        autoTurn(c);
        const ev = c.drain();
        if (c.s.enemies.some((x) => x.def === CHAIN)) seen.chain = true;
        if (cap(c).form) seen.wreck = true;
        if (texts(ev).some((t) => t.startsWith('물속의 손이'))) seen.grip = true;
      }
      expect(c.s.phase, origin).toBe('victory');
      expect(seen, origin).toEqual({ chain: true, wreck: true, grip: true });
    }
  }, 60_000);
});
