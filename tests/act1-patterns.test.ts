import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, DISGUISE_REVEAL, type CombatEvent } from '../src/engine/combat';
import { ENCOUNTERS, ENEMIES, SKILLS, TRAITS } from '../src/engine/registry';
import { finishCombat, gainXp, newRun, startCombat, type RunState } from '../src/engine/run';
import type { EnemyUnit } from '../src/engine/types';
import { autoTurn, incoming } from '../src/sim/bot';
import { seized } from '../src/content/lib';
import {
  ACQUIT_POISE,
  BAIL_DMG,
  CATCH_STR,
  CAUGHT,
  CHARM_AP,
  CHARMED,
  CLAMP_TURNS,
  DAZZLE,
  DISARMED,
  FLOOD,
  GASP,
  GUILTY_SAN,
  GUILTY_VULN,
  HANDPRINT,
  HOOKED,
  LINE,
  LINE_HP,
  TRIAL,
  VERDICT_DMG,
  WATER_MAX,
  tideDamage,
} from '../src/content/act1/common';
import {
  BETRAY_DMG,
  CUTLASS_DMG,
  DRAG_DMG,
  FLASH_DMG,
  LIAR_REVEAL,
  LUNGE_DMG,
  MAX_DEALS,
  PARLEY_ANGER,
  PARLEY_GOLD,
  SALT_BLEED,
  SCALE_MULT,
  SEAR_DMG,
  VERDICT_HIT,
} from '../src/content/act1/enemies';

/**
 * 1층 정예·수호자 패턴 (2026-10): 새 메커니즘마다 동작을 확인하고, 1층의 모든 조우를 봇이 이기는지 본다.
 */

/** 쓰러지지 않는 시작 능력치의 주인공 (힘 0, 행동력 3) */
function hero(seed = 101, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  return run;
}

function fight(enc: string, run: RunState = hero()): Combat {
  const c = startCombat(run, enc, { anomaly: null });
  c.drain();
  return c;
}

const find = (c: Combat, def: string): EnemyUnit => c.alive.find((e) => e.def === def)!;
const crew = (c: Combat) => c.alive.filter((e) => e.def === 'crew');

/** 의도를 다시 정한다 (전투가 라운드 끝에 하듯 살아 있는 순서대로) */
function replan(c: Combat) {
  for (const e of c.alive) if (e.broken !== 2) c.planIntent(e);
}

const cines = (ev: CombatEvent[], name: string) => ev.filter((x) => x.t === 'cine' && x.name === name);
const moveEv = (ev: CombatEvent[], uid: string) => ev.find((x) => x.t === 'move' && x.uid === uid) as Extract<CombatEvent, { t: 'move' }> | undefined;
const hitsOn = (ev: CombatEvent[], src: string) => ev.filter((x) => x.t === 'dmg' && x.tgt === 'p' && x.src === src && x.attack) as Extract<CombatEvent, { t: 'dmg' }>[];

describe('1층 — 등대지기: 도는 등명기와 섬광', () => {
  it('등명기는 두 번 비추고 세 번째에 섬광을 터뜨린다 — 눈부심이 다음 내 턴 동안 의도를 가린다', () => {
    const c = fight('a1-boss-lightkeeper');
    const lk = find(c, 'lightkeeper');
    const lamp = find(c, 'lamp');
    expect(lamp.intent?.move).toBe('turn2');
    c.endTurn();
    expect(lamp.intent?.move).toBe('turn1');
    c.endTurn();
    expect(lamp.intent?.move).toBe('flash');
    const san = c.p.sanity;
    const flash = c.preview(lamp, c.p, FLASH_DMG, 'fire');
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(moveEv(ev, lamp.uid)?.cine).toBe('beam');
    expect(hitsOn(ev, lamp.uid).map((x) => x.amount)).toEqual([flash]);
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.p.st[DAZZLE]).toBe(1);
    // 이번 내 턴엔 의도가 가려진다 (통찰이 모자라면 ???)
    expect(lk.intent?.hidden).toBe(true);
    expect(lamp.intent?.hidden).toBe(true);
    // 첫 섬광은 화면 밖의 당신에게 (가짜 시스템 창)
    expect(cines(ev, 'sysmsg').length).toBe(1);
    // 턴이 끝나면 걷힌다
    c.endTurn();
    expect(c.p.st[DAZZLE]).toBeUndefined();
    expect(lk.intent?.hidden).toBeFalsy();
  });

  it('등명기를 깨면 눈부심이 걷히고, 방 안이 어두워진다 (다시 밝히면 걷힌다)', () => {
    const c = fight('a1-boss-lightkeeper');
    const lk = find(c, 'lightkeeper');
    const lamp = find(c, 'lamp');
    lamp.mem.spins = 2;
    replan(c);
    c.endTurn();
    expect(c.p.st[DAZZLE]).toBe(1);
    expect(lk.intent?.hidden).toBe(true);
    c.damage({ src: c.p, tgt: lamp, base: 999, type: 'pierce', attack: true });
    expect(lamp.dead).toBe(true);
    expect(c.p.st[DAZZLE]).toBeUndefined();
    expect(lk.intent?.hidden).toBeFalsy();
    expect(c.s.vars['ui:dark']).toBeGreaterThan(0);
    c.moveDef(lk, 'relight').run(c, lk);
    expect(c.s.vars['ui:dark']).toBeUndefined();
    expect(find(c, 'lamp').intent?.move).toBe('turn2');
  });

  it('2단계: 빛을 모은 백열광은 눈이 멀어도 보이고, 필살기로 터진다', () => {
    const c = fight('a1-boss-lightkeeper');
    const lk = find(c, 'lightkeeper');
    const lamp = find(c, 'lamp');
    lk.hp = Math.floor(lk.maxHp * 0.5);
    replan(c);
    expect(lk.intent?.move).toBe('madness');
    c.endTurn();
    expect(lk.st.str).toBe(3);
    expect(lk.intent?.move).toBe('gather');
    expect(lk.intent?.dmg).toBe(SEAR_DMG);
    // 차지하는 동안 등명기가 섬광을 터뜨려도
    lamp.mem.spins = 2;
    c.planIntent(lamp);
    c.endTurn();
    expect(c.p.st[DAZZLE]).toBe(1);
    expect(lk.intent?.move).toBe('sear');
    expect(lk.intent?.hidden).toBeFalsy();
    expect(lamp.intent?.hidden).toBe(true);
    c.drain();
    c.endTurn();
    const ev = c.drain();
    const m = moveEv(ev, lk.uid);
    expect(m?.move).toBe('sear');
    expect(m?.ult).toBe(true);
    expect(m?.cine).toBe('impact');
    expect(hitsOn(ev, lk.uid).length).toBe(1);
  });

  it('빛에 미치면 꺼져 있던 등명기도 다시 타오른다 (다시 밝히는 횟수와 별개)', () => {
    const c = fight('a1-boss-lightkeeper');
    const lk = find(c, 'lightkeeper');
    c.kill(find(c, 'lamp'));
    expect(c.s.vars['ui:dark']).toBeGreaterThan(0);
    lk.hp = Math.floor(lk.maxHp * 0.4);
    replan(c);
    expect(lk.intent?.move).toBe('madness');
    c.endTurn();
    expect(c.alive.filter((e) => e.def === 'lamp').length).toBe(1);
    expect(c.s.vars['ui:dark']).toBeUndefined();
    expect(lk.mem.relit ?? 0).toBe(0);
  });

  it('2단계로 넘어가며 거대한 눈이 뜨고 화면 너머로 속삭인다', () => {
    const c = fight('a1-boss-lightkeeper');
    const lk = find(c, 'lightkeeper');
    lk.hp = Math.floor(lk.maxHp * 0.4);
    replan(c);
    c.endTurn();
    const ev = c.drain();
    expect(cines(ev, 'eye').length).toBe(1);
    expect(cines(ev, 'whisper').length).toBe(1);
  });
});

describe('1층 — 밀수조직 두목: 휴전 제안과 배신', () => {
  it('첫 휴전 제안은 진짜다 — 조직원은 총구를 내리고, 두목을 치지 않으면 골드와 조직원 하나', () => {
    const c = fight('a1-boss-queen');
    const q = find(c, 'queen');
    expect(q.intent?.move).toBe('bounty');
    c.endTurn();
    expect(q.intent?.move).toBe('parley');
    for (const x of crew(c)) expect(x.intent?.move).toBe('lower');
    // 통찰이 모자라면 진짜도 거짓도 같은 얼굴 (설명 없이 '휴전 제안')
    const shown = c.shownIntent(q)!;
    expect(shown.move).toBe('_disguise');
    expect(shown.label).toBe('휴전 제안');
    c.p.insight = LIAR_REVEAL;
    expect(c.shownIntent(q)?.move).toBe('parley');
    c.p.insight = 0;
    const gold = c.p.gold;
    const n = crew(c).length;
    // 조직원은 쏴도 된다 — 두목만 건드리지 않으면
    c.damage({ src: c.p, tgt: crew(c)[0], base: 3, type: 'pierce', attack: true });
    c.endTurn();
    expect(c.p.gold).toBe(gold + PARLEY_GOLD);
    expect(crew(c).length).toBe(n + 1);
    expect(q.st.str ?? 0).toBe(0);
  });

  it('휴전 중에 두목을 치면 협상 결렬 — 커틀러스로 되갚고 힘 +2, 골드는 없다', () => {
    const c = fight('a1-boss-queen');
    const q = find(c, 'queen');
    c.endTurn();
    expect(q.intent?.move).toBe('parley');
    const gold = c.p.gold;
    const n = crew(c).length;
    c.damage({ src: c.p, tgt: q, base: 3, type: 'pierce', attack: true });
    const cut = c.preview(q, c.p, CUTLASS_DMG, 'slash');
    c.drain();
    c.endTurn();
    const hits = hitsOn(c.drain(), q.uid);
    expect(hits.length).toBe(1);
    expect(hits[0].amount).toBe(cut);
    expect(c.p.gold).toBe(gold);
    expect(q.st.str).toBe(PARLEY_ANGER);
    expect(crew(c).length).toBe(n);
  });

  it('거짓 휴전: 조직원이 방아쇠에 손가락을 걸고, 배신의 일제 사격은 조직원마다 한 발씩 더', () => {
    const c = fight('a1-boss-queen');
    const q = find(c, 'queen');
    c.endTurn();
    // 진짜 거래를 다 쓴 뒤의 휴전 제안은 언제나 거짓말이다
    q.mem.deals = MAX_DEALS;
    q.mem.offerAt = -99;
    replan(c);
    expect(q.intent?.move).toBe('betray');
    for (const x of crew(c)) expect(x.intent?.move).toBe('aim');
    const shown = c.shownIntent(q)!;
    expect(shown.kind).toBe('special');
    expect(shown.label).toBe('휴전 제안');
    // 봇도 속는다
    expect(incoming(c)).toBe(0);
    c.p.insight = LIAR_REVEAL;
    expect(c.shownIntent(q)?.kind).toBe('attack');
    c.p.insight = 0;
    // 조직원 하나를 쓰러뜨리면 그 몫은 빠진다
    const n = crew(c).length;
    c.kill(crew(c)[0]);
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(moveEv(ev, q.uid)?.ult).toBe(true);
    expect(cines(ev, 'sysmsg').length).toBe(1);
    const hits = hitsOn(ev, q.uid);
    expect(hits.length).toBe(2 + (n - 1));
    expect(hits[0].amount).toBe(c.preview(q, c.p, BETRAY_DMG, 'pierce'));
  });

  it('체력이 절반 아래로 떨어지면 화면 너머로 속삭인다 (한 번)', () => {
    const c = fight('a1-boss-queen');
    const q = find(c, 'queen');
    q.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게 (버팀이 남은 적은 절반만 받는다)
    c.damage({ src: c.p, tgt: q, base: Math.ceil(q.maxHp * 0.55), type: 'true', attack: true });
    c.damage({ src: c.p, tgt: q, base: 5, type: 'true', attack: true });
    expect(cines(c.drain(), 'whisper').length).toBe(1);
  });
});

describe('1층 — 늙은 어부: 낚싯줄', () => {
  it('첫 수에 기술 하나를 낚싯바늘에 걸고, 전열에 팽팽한 낚싯줄이 나타난다 — 줄을 끊으면 기술이 돌아온다', () => {
    const run = hero();
    const c = fight('a1-boss-fisherman', run);
    const f = find(c, 'fisherman');
    expect(f.intent?.move).toBe('cast');
    c.endTurn();
    const uid = run.slots[f.mem.specimen - 1]!;
    expect(uid).toBeTruthy();
    expect(c.s.cd[uid]).toBe(99);
    expect(c.blockReason(uid)).not.toBeNull();
    expect(seized(c, uid)).toBe(true);
    expect(c.p.st[HOOKED]).toBe(1);
    const line = find(c, LINE);
    expect(line.row).toBe(0);
    expect(line.hp).toBe(LINE_HP);
    expect(line.intent?.move).toBe('reel');
    // 근접 기술로도 닿는다 (전열)
    expect(c.validTargets({ range: 'melee' } as never).map((e) => e.uid)).toContain(line.uid);
    c.damage({ src: c.p, tgt: line, base: LINE_HP, type: 'true', attack: true });
    expect(line.dead).toBe(true);
    expect(c.p.st[HOOKED]).toBeUndefined();
    expect(c.s.cd[uid]).toBeUndefined();
    expect(f.mem.specimen).toBe(0);
    expect(seized(c, uid)).toBe(false);
  });

  it('줄을 끊지 못하면 낚싯줄의 두 번째 차례에 낚아 간다 (어부 힘 +2) — 본모습을 드러내면 돌려준다', () => {
    const run = hero();
    const c = fight('a1-boss-fisherman', run);
    const f = find(c, 'fisherman');
    c.endTurn();
    const uid = run.slots[f.mem.specimen - 1]!;
    const line = find(c, LINE);
    c.endTurn();
    expect(line.intent?.move).toBe('snatch');
    expect(c.p.st[HOOKED]).toBe(1);
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(line.dead).toBe(true);
    expect(line.fled).toBe(true);
    expect(c.p.st[HOOKED]).toBeUndefined();
    expect(c.p.st[CAUGHT]).toBe(1);
    expect(f.st.str).toBe(CATCH_STR);
    expect(c.s.cd[uid]).toBeGreaterThan(90);
    expect(cines(ev, 'sysmsg').length).toBe(1);
    // 쥔 기술이 있는 동안은 다시 던지지 않는다
    for (let i = 0; i < 5; i++) {
      c.endTurn();
      expect(c.alive.some((e) => e.def === LINE)).toBe(false);
    }
    // 본모습을 드러내면 낚싯대를 놓친다 (버팀을 걷어 피해가 그대로 들어가게)
    f.poise = 0;
    c.damage({ src: c.p, tgt: f, base: f.hp - Math.floor(f.maxHp * 0.5) + 1, type: 'true', attack: true });
    const ev2 = c.drain();
    expect(f.form).toBe(1);
    expect(c.p.st[CAUGHT]).toBeUndefined();
    expect(c.s.cd[uid] ?? 0).toBeLessThan(90);
    for (const name of ['shatter', 'water', 'whisper']) expect(cines(ev2, name).length, name).toBe(1);
  });

  it('어부를 붕괴시켜도 줄이 끊어지고, 쓰러뜨리면 낚인 기술을 되찾는다', () => {
    const run = hero();
    const c = fight('a1-boss-fisherman', run);
    const f = find(c, 'fisherman');
    c.endTurn();
    let uid = run.slots[f.mem.specimen - 1]!;
    c.breakEnemy(f);
    expect(c.p.st[HOOKED]).toBeUndefined();
    expect(c.s.cd[uid]).toBeUndefined();
    expect(c.alive.some((e) => e.def === LINE)).toBe(false);

    const run2 = hero(202);
    const c2 = fight('a1-boss-fisherman', run2);
    const f2 = find(c2, 'fisherman');
    c2.endTurn();
    uid = run2.slots[f2.mem.specimen - 1]!;
    c2.endTurn();
    c2.endTurn();
    expect(c2.p.st[CAUGHT]).toBe(1);
    c2.kill(f2);
    expect(c2.p.st[CAUGHT]).toBeUndefined();
    expect(c2.s.cd[uid] ?? 0).toBeLessThan(90);
    expect(c2.alive.length).toBe(0);
  });

  it('장착한 기술이 하나뿐이면 낚싯줄을 던지지 않는다', () => {
    const run = hero();
    run.slots = [run.slots[0], null, null, null];
    const c = fight('a1-boss-fisherman', run);
    expect(find(c, 'fisherman').intent?.move).toBe('gaff');
  });

  it('본모습의 심해의 아가리는 필살기 — 화면 모서리에서 이빨이 튀어나온다', () => {
    const m = ENEMIES.get('fisherman')!.moves.maw;
    expect(m.ultimate).toBe(true);
    expect(m.cine).toBe('corners');
  });

  it('본모습의 심연의 노래에 홀리면 다음 내 턴 행동력 -1', () => {
    const c = fight('a1-boss-fisherman');
    const f = find(c, 'fisherman');
    f.poise = 0; // 버팀을 걷어 피해가 그대로 들어가게
    c.damage({ src: c.p, tgt: f, base: Math.ceil(f.maxHp * 0.55), type: 'true', attack: true });
    expect(f.form).toBe(1);
    f.mem.c2 = 2;
    replan(c);
    expect(f.intent?.move).toBe('song');
    const san = c.p.sanity;
    c.endTurn();
    expect(c.p.sanity).toBeLessThan(san);
    expect(c.s.ap).toBe(c.p.maxAp - CHARM_AP);
    expect(c.p.st[CHARMED]).toBeUndefined();
    c.endTurn();
    expect(c.s.ap).toBe(c.p.maxAp);
  });
});

describe('1층 — 익사한 선장: 차오르는 물', () => {
  it('선장이 행동할 때마다 물이 1 차오르고, 셋이면 숨이 막혀 행동력 -1', () => {
    const c = fight('lord-a1');
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(1);
    expect(c.s.vars['ui:water']).toBe(1);
    expect(c.s.vars['ui:tilt']).toBeLessThan(0);
    expect(c.s.ap).toBe(c.p.maxAp);
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(2);
    c.drain();
    // 세 번째 차례는 닻을 들어올린다 → 물이 끝까지 차도, 닻부터 내려친다 (만조는 그다음)
    c.endTurn();
    const ev = c.drain();
    expect(c.p.st[FLOOD]).toBe(WATER_MAX);
    expect(find(c, 'captain').intent?.move).toBe('anchor');
    expect(c.s.ap).toBe(c.p.maxAp - 1);
    expect(cines(ev, 'water').length).toBe(1);
  });

  it('한 턴에 선장에게 피해 12 이상을 주면 물이 1 빠진다 (한 턴에 한 번)', () => {
    const c = fight('lord-a1');
    const cap = find(c, 'captain');
    c.endTurn();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(2);
    c.damage({ src: c.p, tgt: cap, base: BAIL_DMG - 1, type: 'true', attack: true });
    expect(c.p.st[FLOOD]).toBe(2);
    c.damage({ src: c.p, tgt: cap, base: 1, type: 'true', attack: true });
    expect(c.p.st[FLOOD]).toBe(1);
    c.damage({ src: c.p, tgt: cap, base: BAIL_DMG * 2, type: 'true', attack: true });
    expect(c.p.st[FLOOD]).toBe(1);
    // 다음 턴엔 다시 센다 (선장이 행동하며 1 차오른 뒤). 이미 닿았던 높이라 물이 밀려드는 연출은 다시 틀지 않는다
    c.drain();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(2);
    expect(cines(c.drain(), 'water').length).toBe(0);
    c.damage({ src: c.p, tgt: cap, base: BAIL_DMG, type: 'true', attack: true });
    expect(c.p.st[FLOOD]).toBe(1);
  });

  it('선장을 붕괴시키면 물이 모두 빠지고, 붕괴로 쉰 차례엔 차오르지 않는다', () => {
    const c = fight('lord-a1');
    const cap = find(c, 'captain');
    c.endTurn();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(2);
    c.breakEnemy(cap);
    expect(c.p.st[FLOOD]).toBeUndefined();
    expect(c.s.vars['ui:water']).toBeUndefined();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBeUndefined();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(1);
  });

  it('익사체를 (완전히) 쓰러뜨리면 물이 1 빠진다', () => {
    const c = fight('lord-a1');
    const d = find(c, 'drowned');
    c.endTurn();
    c.endTurn();
    expect(c.p.st[FLOOD]).toBe(2);
    // 처음엔 다시 일어선다 — 아직 처치가 아니다
    c.kill(d);
    expect(d.dead).toBe(false);
    expect(c.p.st[FLOOD]).toBe(2);
    c.kill(d);
    expect(d.dead).toBe(true);
    expect(c.p.st[FLOOD]).toBe(1);
  });

  it('선장이 쓰러지면 배의 저주가 풀려 물이 모두 빠진다', () => {
    const c = fight('lord-a1');
    c.endTurn();
    c.endTurn();
    c.kill(find(c, 'captain'));
    expect(c.p.st[FLOOD]).toBeUndefined();
  });

  it('닻 내려치기는 필살기 — 화면에 금이 남는다', () => {
    const c = fight('lord-a1');
    const cap = find(c, 'captain');
    cap.mem.charge = 1;
    replan(c);
    expect(cap.intent?.move).toBe('anchor');
    c.endTurn();
    const ev = c.drain();
    const m = moveEv(ev, cap.uid);
    expect(m?.ult).toBe(true);
    expect(m?.cine).toBe('impact');
    expect(cines(ev, 'crack').length).toBe(1);
    expect(c.s.vars['ui:cracks']).toBe(1);
  });
});

/** 만조를 부르기 직전까지 (물 3, 닻을 내려친 뒤 선장이 만조를 부른다 — 내 턴이 시작되는 순간) */
function untilTide(run: RunState = hero()): { c: Combat; cap: EnemyUnit; ev: CombatEvent[] } {
  const c = fight('lord-a1', run);
  const cap = find(c, 'captain');
  let ev: CombatEvent[] = [];
  for (let i = 0; i < 8 && cap.intent?.move !== 'hightide'; i++) {
    c.drain();
    c.endTurn();
    ev = c.drain();
  }
  return { c, cap, ev };
}

describe('1층 — 익사한 선장: 만조 (퍼즐 · 큰 대가)', () => {
  it('물이 끝까지 차면 만조를 부른다 — 내 턴이 시작될 때 이미 큰 공격 의도와 경고 띠(못 막으면 치를 대가)가 보이고, 처음엔 화면 너머로 속삭인다', () => {
    const { c, cap, ev } = untilTide();
    // 전투 초반 두 턴 안에는 오지 않는다
    expect(c.s.turn).toBeGreaterThan(2);
    expect(c.s.phase).toBe('player');
    expect(cap.intent?.move).toBe('hightide');
    expect(cap.intent?.kind).toBe('charge');
    expect(c.s.obj?.text).toContain('1턴 남음');
    expect(c.s.obj?.text).not.toContain('즉사');
    // 즉사가 아니다 — 호박색 경고 띠, 누르면 대가가 보인다
    expect(c.s.obj?.lethal).toBeUndefined();
    expect(c.s.obj?.fail).toContain(`${tideDamage(c)}`);
    expect(c.s.obj?.hit).toEqual({ uid: cap.uid, need: BAIL_DMG });
    expect(c.s.obj?.kill).toEqual(c.alive.filter((e) => e.def === 'drowned').map((e) => e.uid));
    expect(cines(ev, 'whisper').length).toBe(1);
    // 만조가 몰려오는 턴엔 숨을 참는다 — 막을 행동력은 남겨 둔다
    expect(c.p.st[FLOOD]).toBe(WATER_MAX);
    expect(c.s.ap).toBe(c.p.maxAp);
  });

  it('물을 빼지 못하면 물에 잠긴다 — 최대 체력 30% 피해(방어도 무시), 다음 턴 행동력 -1, 물은 한 칸 빠진다 (체력이 충분하면 살아남는다)', () => {
    const run = hero();
    run.player.maxHp = run.player.hp = 100;
    const { c, cap } = untilTide(run);
    c.p.hp = c.p.maxHp;
    const hp = c.p.hp;
    // 익사체의 공격은 방어도가 막는다 — 만조만 방어도를 뚫는다
    c.p.block = 999;
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(c.s.phase).toBe('player');
    expect(c.s.doom).toBeUndefined();
    expect(cines(ev, 'water').length).toBe(1);
    // 방어도를 무시하고 최대 체력의 30%
    const tide = ev.find((x) => x.t === 'dmg' && x.tgt === 'p' && x.tags.includes('tide')) as Extract<CombatEvent, { t: 'dmg' }>;
    expect(tide.hpLoss).toBe(Math.ceil(100 * 0.3));
    expect(c.p.hp).toBe(hp - 30);
    // 헐떡임: 다음 턴 행동력 -1 (물은 2라 숨 막힘은 없다)
    expect(c.p.st[FLOOD]).toBe(WATER_MAX - 1);
    expect(c.s.ap).toBe(c.p.maxAp - 1);
    expect(c.s.obj).toBeNull();
    expect(c.s.vars['a1-tideHits']).toBe(1);
    // 지나간 차례엔 차오르지 않고, 곧바로 다시 부르지도 않는다
    expect(cap.intent?.move).not.toBe('hightide');
    // 헐떡임은 한 턴뿐 (그다음엔 물 높이에 따른 숨 막힘만)
    c.endTurn();
    expect(c.p.st[GASP]).toBeUndefined();
    expect(c.s.ap).toBe(c.p.maxAp - ((c.p.st[FLOOD] ?? 0) >= WATER_MAX ? 1 : 0));
  });

  it('체력이 모자라면 보통 피해처럼 사경에 든다 (그 자리에서 죽지는 않는다)', () => {
    const run = hero();
    run.player.maxHp = 100;
    run.player.hp = 20;
    const { c } = untilTide(run);
    c.p.hp = 20;
    c.endTurn();
    expect(c.s.phase).not.toBe('defeat');
    expect(c.s.doom).toBeUndefined();
    expect(c.dying).toBe(true);
  });

  it('선장에게 한 턴에 12를 주면 물이 빠져 만조가 물러간다 — 목표가 곧바로 지워지고 선장은 다른 행동을 고른다 (대가 없음)', () => {
    const { c, cap } = untilTide();
    c.damage({ src: c.p, tgt: cap, base: 10, type: 'true', attack: true });
    // 맞을 때마다 남은 피해가 줄어든다
    expect(c.s.obj?.hit?.need).toBe(BAIL_DMG - 10);
    expect(c.s.obj?.text).toContain(`피해 ${BAIL_DMG - 10}`);
    c.damage({ src: c.p, tgt: cap, base: BAIL_DMG - 10, type: 'true', attack: true });
    expect(c.s.obj).toBeNull();
    expect(c.p.st[FLOOD]).toBe(WATER_MAX - 1);
    expect(cap.intent?.move).not.toBe('hightide');
    expect(cap.intent?.kind).not.toBe('charge');
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.s.vars['a1-tideHits']).toBeUndefined();
    expect(c.p.st[GASP]).toBeUndefined();
    // 물은 다시 차지만, 막은 뒤 몇 턴 동안은 다시 부르지 않는다
    expect(c.p.st[FLOOD]).toBe(WATER_MAX);
    expect(cap.intent?.move).not.toBe('hightide');
    let turns = 0;
    while (cap.intent?.move !== 'hightide' && turns++ < 8) c.endTurn();
    expect(cap.intent?.move).toBe('hightide');
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(c.s.obj).not.toBeNull();
  });

  it('익사체를 쓰러뜨려도, 선장을 붕괴시켜도 만조가 물러간다', () => {
    const a = untilTide();
    const d = find(a.c, 'drowned');
    a.c.kill(d);
    a.c.kill(d);
    expect(d.dead).toBe(true);
    expect(a.c.s.obj).toBeNull();
    expect(a.cap.intent?.move).not.toBe('hightide');
    a.c.endTurn();
    expect(a.c.s.phase).toBe('player');
    expect(a.c.s.vars['a1-tideHits']).toBeUndefined();

    const b = untilTide();
    b.c.breakEnemy(b.cap);
    expect(b.c.s.obj).toBeNull();
    expect(b.c.p.st[FLOOD]).toBeUndefined();
    expect(b.cap.intent?.move).toBe('_broken');
    b.c.endTurn();
    expect(b.c.s.phase).toBe('player');
    expect(b.c.s.vars['a1-tideHits']).toBeUndefined();
  });

  it('저장했다 불러와도 만조는 이어진다', () => {
    const { c } = untilTide();
    const saved = JSON.parse(JSON.stringify(c.run)) as RunState;
    const c2 = new Combat(saved);
    expect(c2.s.obj?.text).toContain('1턴 남음');
    expect(c2.alive.find((e) => e.def === 'captain')?.intent?.move).toBe('hightide');
    const hp = c2.p.hp;
    c2.endTurn();
    expect(c2.s.phase).toBe('player');
    expect(c2.s.vars['a1-tideHits']).toBe(1);
    expect(c2.p.hp).toBeLessThan(hp);
  });

  it('봇은 목표를 보고 만조를 막는다 (시작 능력치의 세 출신)', () => {
    for (const origin of ['soldier', 'hunter', 'occultist']) {
      const { c } = untilTide(hero(101, origin));
      autoTurn(c);
      expect(c.s.phase, origin).not.toBe('defeat');
      expect(c.s.vars['a1-tideHits'], origin).toBeUndefined();
    }
  });
});

describe('1층 정예 — 새 행동', () => {
  it('도살자의 고기 저울: 체력이 절반 이하면 곧장 도축을 준비하고, 토막내기 피해 +50% (의도 숫자에도 보인다)', () => {
    const run = hero();
    run.player.maxHp = 100;
    run.player.hp = 100;
    const c = fight('a1-butcher', run);
    const b = find(c, 'butcher');
    c.endTurn();
    c.p.hp = 60;
    expect(c.preview(b, c.p, 24, 'slash')).toBe(24);
    c.p.hp = 40;
    replan(c);
    expect(b.intent?.move).toBe('prep');
    // 차지 말풍선의 '다음 턴' 숫자도 오른다
    expect(c.preview(b, c.p, 24, 'slash')).toBe(Math.floor(24 * SCALE_MULT));
    c.endTurn();
    expect(b.intent?.move).toBe('chop');
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(moveEv(ev, b.uid)?.ult).toBe(true);
    expect(hitsOn(ev, b.uid)[0].amount).toBe(Math.floor(24 * SCALE_MULT));
  });

  it('도살자의 상처에 소금: 출혈 3, 이미 피를 흘리면 그만큼 더 (최대 +3)', () => {
    const c = fight('a1-butcher');
    const b = find(c, 'butcher');
    const salt = c.moveDef(b, 'salt');
    salt.run(c, b);
    expect(c.p.st.bleed).toBe(SALT_BLEED);
    c.p.st.bleed = 2;
    salt.run(c, b);
    expect(c.p.st.bleed).toBe(2 + SALT_BLEED + 2);
    c.p.st.bleed = 10;
    salt.run(c, b);
    expect(c.p.st.bleed).toBe(10 + SALT_BLEED * 2);
  });

  it('집행자의 판결: 내리치며 판결 — 집행자 차례 전까지 피해 15를 채우면 무죄 (버팀 -2, 방어도에 막힌 몫도 센다)', () => {
    const c = fight('a1-enforcer');
    const en = find(c, 'enforcer');
    expect(en.intent?.move).toBe('verdict');
    expect(en.intent?.dmg).toBe(VERDICT_HIT);
    c.endTurn();
    expect(c.p.st[TRIAL]).toBe(VERDICT_DMG);
    en.block = 50;
    c.damage({ src: c.p, tgt: en, base: VERDICT_DMG - 5, type: 'true', attack: true });
    expect(c.p.st[TRIAL]).toBe(5);
    c.damage({ src: c.p, tgt: en, base: 5, type: 'true', attack: true });
    expect(c.p.st[TRIAL]).toBeUndefined();
    expect(en.poise).toBe(en.maxPoise - ACQUIT_POISE);
    const san = c.p.sanity;
    c.drain();
    c.endTurn();
    expect(cines(c.drain(), 'scrawl').length).toBe(0);
    expect(c.p.sanity).toBeGreaterThan(san - GUILTY_SAN);
  });

  it('집행자의 판결: 채우지 못하면 집행자 차례에 유죄 — 정신력 -10, 취약 1, 붉은 글씨', () => {
    const c = fight('a1-enforcer');
    c.endTurn();
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(c.p.st[TRIAL]).toBeUndefined();
    expect(cines(ev, 'scrawl').length).toBe(1);
    expect(ev.some((x) => x.t === 'sanity' && x.delta === -GUILTY_SAN)).toBe(true);
    expect(ev.some((x) => x.t === 'status' && x.uid === 'p' && x.id === 'vuln' && x.n === GUILTY_VULN)).toBe(true);
  });

  it('집행자가 쓰러지면 판결은 무효', () => {
    const c = fight('a1-enforcer');
    c.endTurn();
    c.kill(find(c, 'enforcer'));
    expect(c.p.st[TRIAL]).toBeUndefined();
  });

  it('거대 게의 집게: 무기를 물면 기본 공격을 못 쓰고, 붕괴시키거나 쓰러뜨리면 놓는다', () => {
    const c = fight('a1-crab');
    const cr = find(c, 'crab');
    expect(cr.intent?.move).toBe('claw');
    c.endTurn();
    expect(cr.intent?.move).toBe('clamp');
    c.drain();
    c.endTurn();
    expect(cines(c.drain(), 'crack').length).toBe(0);
    expect(c.p.st[DISARMED]).toBe(1);
    expect(c.blockReason('weapon')).not.toBeNull();
    // 대기를 지워 잠깐 빼내도, 물고 있는 한 다음 턴에 다시 문다
    delete c.s.cd.weapon;
    c.endTurn();
    expect(c.s.cd.weapon).toBe(99);
    c.breakEnemy(cr);
    expect(c.p.st[DISARMED]).toBeUndefined();
    expect(c.blockReason('weapon')).toBeNull();

    const c2 = fight('a1-crab');
    const cr2 = find(c2, 'crab');
    c2.endTurn();
    c2.endTurn();
    expect(c2.p.st[DISARMED]).toBe(1);
    c2.kill(cr2);
    expect(c2.p.st[DISARMED]).toBeUndefined();
    expect(c2.s.cd.weapon).toBeUndefined();
  });

  it('안개 속 사냥꾼: 숨는 척 덮쳐 온다 — 통찰 3이면 보인다 (봇도 속는다)', () => {
    const c = fight('stalker-a1');
    const fs = find(c, 'fogstalker');
    c.endTurn();
    c.endTurn();
    expect(fs.intent?.move).toBe('vanish');
    c.endTurn();
    expect(c.s.vars['ui:dark']).toBeGreaterThan(0);
    expect(fs.intent?.move).toBe('lunge');
    const shown = c.shownIntent(fs)!;
    expect(shown.kind).toBe('block');
    expect(shown.label).toContain('안개 속으로');
    expect(incoming(c)).toBe(0);
    c.p.insight = LIAR_REVEAL;
    expect(c.shownIntent(fs)?.kind).toBe('attack');
    c.p.insight = 0;
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(moveEv(ev, fs.uid)?.ult).toBe(true);
    expect(hitsOn(ev, fs.uid)[0].amount).toBe(c.preview(fs, c.p, LUNGE_DMG, 'slash'));
    expect(c.s.vars['ui:dark']).toBeUndefined();
  });

  it('바다 무덤의 망령: 막지 못한 손길마다 손자국 — 끌어내림의 손이 그만큼 늘어난다', () => {
    const c = fight('rift-a1');
    const w = find(c, 'wraith');
    c.endTurn();
    expect(c.p.st[HANDPRINT]).toBe(1);
    c.endTurn();
    // 막아 낸 손길은 자국을 남기지 못한다
    c.p.block = 999;
    c.endTurn();
    expect(c.p.st[HANDPRINT]).toBe(1);
    expect(w.intent?.move).toBe('reach');
    expect(w.intent?.hits).toBe(3);
    c.drain();
    c.endTurn();
    expect(cines(c.drain(), 'handprints').length).toBe(1);
    expect(w.intent?.move).toBe('drag');
    expect(w.intent?.hits).toBe(3);
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(moveEv(ev, w.uid)?.ult).toBe(true);
    const hits = hitsOn(ev, w.uid);
    expect(hits.length).toBe(3);
    expect(hits[0].amount).toBe(c.preview(w, c.p, DRAG_DMG, 'void'));
    expect(c.p.st[HANDPRINT]).toBeUndefined();
  });
});

describe('1층 — 출신마다 공정한 기믹 (시작 덱)', () => {
  const ORIGINS3 = ['soldier', 'hunter', 'occultist'];

  /** 시작 기술·장비 그대로, 그 층에 맞는 레벨 (체력은 가득) */
  function starter(origin: string, lv: number, seed = 101, tide = 0): RunState {
    const run = newRun({ seed, origin });
    let guard = 0;
    while (run.player.level < lv && guard++ < 30) gainXp(run, 60);
    run.player.hp = run.player.maxHp;
    if (run.floor) run.floor.tide = tide;
    return run;
  }

  /** 한 턴 동안 이 기술들을 대상에게 (쓸 수 있는 만큼) 쓴다 */
  function spend(c: Combat, refs: string[], target: EnemyUnit) {
    for (let i = 0; i < 8 && !target.dead && c.s.phase === 'player'; i++) {
      const ref = refs.find((r) => !c.blockReason(r));
      if (!ref) break;
      expect(c.useSkill(ref, target.uid), ref).toBeNull();
    }
  }

  it('등명기는 후열에 있어도 근접으로 닿는다 — 근접 기술만 가진 덱도 첫 섬광 전에 깬다', () => {
    const run = starter('hunter', 3);
    // 화염 플라스크(원거리)를 빼고 근접 기술만
    const melee = run.skills.filter((s) => ['serrate', 'quick-cut'].includes(s.id)).map((s) => s.uid);
    run.slots = [...melee, null, null];
    const c = fight('a1-boss-lightkeeper', run);
    const lamp = find(c, 'lamp');
    expect(lamp.row).toBe(1);
    expect(ENEMIES.get('lamp')!.reachable).toBe(true);
    expect(c.validTargets(SKILLS.get('serrate')!).map((e) => e.uid)).toContain(lamp.uid);
    expect(c.validTargets(SKILLS.get('w-knife')!).map((e) => e.uid)).toContain(lamp.uid);
    for (let t = 0; t < 3 && !lamp.dead; t++) {
      spend(c, ['weapon', ...melee], lamp);
      if (!lamp.dead) c.endTurn();
    }
    expect(lamp.dead).toBe(true);
    // 섬광은 한 번도 터지지 않았다
    expect(c.p.st[DAZZLE]).toBeUndefined();
    expect(c.s.vars['a1-flashed']).toBeUndefined();
  });

  it('낚싯줄은 전열이 차 후열로 밀려나도 근접으로 닿고, 세 출신 모두 무기 기본 공격만으로 한 턴에 끊는다', () => {
    for (const origin of ORIGINS3) {
      const run = starter(origin, 3);
      const c = fight('a1-boss-fisherman', run);
      const f = find(c, 'fisherman');
      // 전열을 채워 낚싯줄이 후열로 밀려나게 한다
      c.spawn('crew', 0);
      c.spawn('crew', 0);
      c.endTurn();
      const line = find(c, LINE);
      expect(line.row, origin).toBe(1);
      expect(c.validTargets(SKILLS.get('w-knife')!).map((e) => e.uid), origin).toContain(line.uid);
      const uid = run.slots[f.mem.specimen - 1]!;
      delete c.p.st.weak;
      spend(c, ['weapon'], line);
      expect(line.dead, origin).toBe(true);
      expect(c.s.cd[uid] ?? 0, origin).toBeLessThan(90);
    }
  });

  it('만조: 세 출신 모두 무기 기본 공격만으로도 물을 뺀다 (선장 차례에 터지는 출혈도 센다)', () => {
    for (const origin of ORIGINS3) {
      const { c, cap } = untilTide(starter(origin, 4, 101, 3));
      expect(cap.intent?.move, origin).toBe('hightide');
      expect(c.s.ap, origin).toBe(c.p.maxAp);
      delete c.p.st.weak;
      spend(c, ['weapon'], cap);
      c.endTurn();
      expect(c.s.vars['a1-tideHits'], origin).toBeUndefined();
      expect(c.s.phase, origin).not.toBe('defeat');
    }
  });

  it('만조: 선장 차례가 시작될 때 터지는 지속 피해(출혈)도 물 빼기에 센다', () => {
    const { c, cap } = untilTide();
    c.damage({ src: c.p, tgt: cap, base: BAIL_DMG - 4, type: 'true', attack: true });
    expect(c.s.obj?.hit?.need).toBe(4);
    c.apply(cap, 'bleed', 4, c.p);
    c.endTurn();
    expect(c.s.vars['a1-tideHits']).toBeUndefined();
    expect(c.s.phase).toBe('player');
  });

  it('만조: 봇은 출신마다 시작 덱으로 물을 빼 대가를 피한다 (여러 시드)', () => {
    for (const origin of ORIGINS3) {
      for (const seed of [11, 22, 33, 44]) {
        const { c } = untilTide(starter(origin, 4, seed, 3));
        autoTurn(c);
        expect(c.s.vars['a1-tideHits'], `${origin} #${seed}`).toBeUndefined();
        expect(c.s.phase, `${origin} #${seed}`).not.toBe('defeat');
      }
    }
  });

  it('판결: 세 출신 모두 시작 덱으로 무죄를 받는다 (사냥꾼은 무기 기본 공격만으로도) — 집행자 차례에 터지는 출혈도 센다', () => {
    // 봇 (출신마다 시작 덱)
    for (const origin of ORIGINS3) {
      const c = fight('a1-enforcer', starter(origin, 2, 202, 1));
      c.endTurn();
      expect(c.p.st[TRIAL], origin).toBe(VERDICT_DMG);
      c.drain();
      autoTurn(c);
      const ev = c.drain();
      expect(cines(ev, 'scrawl').length, origin).toBe(0);
      expect(c.p.st[TRIAL], origin).toBeUndefined();
    }
    // 사냥꾼은 칼질 셋(무기 기본 공격)만으로도 그 턴에 채운다
    const h = fight('a1-enforcer', starter('hunter', 2, 202, 0));
    const hen = find(h, 'enforcer');
    h.endTurn();
    delete h.p.st.weak;
    spend(h, ['weapon'], hen);
    expect(h.p.st[TRIAL]).toBeUndefined();
    // 모자란 몫은 집행자 차례가 시작될 때 터지는 지속 피해(출혈)가 채운다
    const c = fight('a1-enforcer', starter('hunter', 2, 202, 0));
    const en = find(c, 'enforcer');
    c.endTurn();
    c.damage({ src: c.p, tgt: en, base: VERDICT_DMG - 4, type: 'true', attack: true });
    expect(c.p.st[TRIAL]).toBe(4);
    c.apply(en, 'bleed', 4, c.p);
    c.drain();
    c.endTurn();
    const ev = c.drain();
    expect(cines(ev, 'scrawl').length).toBe(0);
    expect(c.p.st[TRIAL]).toBeUndefined();
    expect(ev.some((x) => x.t === 'text' && x.text.startsWith('무죄'))).toBe(true);
  });

  it('거대 게: 약점을 칠 수 없는 출신(사냥꾼)도 두 턴 뒤면 무기를 되찾는다', () => {
    const c = fight('a1-crab', starter('hunter', 2, 303, 1));
    const cr = find(c, 'crab');
    // 사냥꾼의 시작 덱에는 게의 약점(타격·비전)이 없다
    expect(cr.weak.some((w) => ['slash', 'fire'].includes(w))).toBe(false);
    c.endTurn();
    c.endTurn();
    expect(c.p.st[DISARMED]).toBe(1);
    expect(c.blockReason('weapon')).not.toBeNull();
    for (let i = 0; i < CLAMP_TURNS - 1; i++) {
      c.endTurn();
      expect(c.p.st[DISARMED]).toBe(1);
    }
    c.endTurn();
    expect(c.p.st[DISARMED]).toBeUndefined();
    expect(c.blockReason('weapon')).toBeNull();
    expect(cr.dead).toBe(false);
  });

  it('봇이 출신마다 시작 덱으로 1층 정예·수호자를 이긴다 (군주 제외)', () => {
    const encs: [string, number, number][] = [
      ['a1-butcher', 2, 1],
      ['a1-enforcer', 2, 1],
      ['a1-crab', 2, 1],
      ['stalker-a1', 3, 4],
      ['rift-a1', 3, 2],
      ['a1-boss-lightkeeper', 3, 2],
      ['a1-boss-queen', 3, 2],
      ['a1-boss-fisherman', 3, 2],
    ];
    for (const [enc, lv, tide] of encs) {
      for (const origin of ORIGINS3) {
        for (const seed of [7, 8]) {
          const run = starter(origin, lv, seed, tide);
          const c = startCombat(run, enc, { anomaly: null });
          c.snapshots = false;
          let n = 0;
          while (!c.over && n++ < 100) autoTurn(c);
          expect(c.s.phase, `${enc} ${origin} #${seed}`).toBe('victory');
        }
      }
    }
  }, 60_000);
});

describe('1층 — 전체', () => {
  it('속임수 의도가 있는 적은 특성 설명에 알리고 (통찰 몇이면 보이는지), 필살기·큰 일격에는 컷인이 있다', () => {
    for (const def of ENEMIES.values()) {
      if (def.act !== 1) continue;
      for (const [id, m] of Object.entries(def.moves)) {
        if (!m.disguise) continue;
        const reveal = m.disguise.reveal ?? DISGUISE_REVEAL;
        const told = (def.traits ?? []).some((t) => TRAITS.get(t)?.desc.includes(`통찰 ${reveal}`));
        expect(told, `${def.id}.${id}`).toBe(true);
      }
    }
    const ult: [string, string][] = [
      ['lightkeeper', 'sear'],
      ['queen', 'betray'],
      ['fisherman', 'maw'],
      ['captain', 'anchor'],
      ['butcher', 'chop'],
      ['fogstalker', 'lunge'],
      ['wraith', 'drag'],
    ];
    for (const [e, m] of ult) expect(ENEMIES.get(e)!.moves[m].ultimate, `${e}.${m}`).toBe(true);
  });

  it('1층의 모든 조우를 봇이 이기고, 보상까지 받는다 (시작 능력치)', () => {
    for (const enc of ENCOUNTERS.filter((e) => e.act === 1)) {
      const run = hero(77);
      const c = startCombat(run, enc.id, { anomaly: null });
      let n = 0;
      while (!c.over && n++ < 300) autoTurn(c);
      expect(c.s.phase, enc.id).toBe('victory');
      expect(finishCombat(run), enc.id).not.toBeNull();
    }
  }, 60_000);
});
