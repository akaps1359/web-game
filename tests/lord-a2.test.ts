import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat, MAX_ROW, scaledPoise, type CombatEvent } from '../src/engine/combat';
import { ENEMIES, STATUSES, TRAITS } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import { generateFloor } from '../src/engine/dungeon';
import { autoTurn } from '../src/sim/bot';
import type { CineName, EnemyUnit, MoveDef, TurnNote } from '../src/engine/types';
import {
  BELFRY_ACOLYTES,
  BELFRY_CALL,
  BELFRY_CYCLE,
  BELFRY_FRENZY,
  BELFRY_NAME,
  BELFRY_PCT,
  BELFRY_POISE,
  BELFRY_SAN,
  BELFRY_TILT,
  COMBO_DMG,
  COMBO_HITS,
  COMBO_SAN,
  FALL,
  FALL_AP,
  FALL_BLOCK,
  FALL_FAIL,
  FALL_PCT,
  FALL_POISE,
  FALL_SELF,
  FALL_TEXT,
  HUSH,
  KNELL,
  KNELL_TEXT_1,
  PINNED,
  SILENCE_DMG,
  SILENCE_SAN,
  belfry,
  hushCost,
} from '../src/content/act2/patterns';

/**
 * 2층 계층군주 종지기 (2026-10 "패턴을 더 넣고 훨씬 어렵게"): 침묵령, 2막 「종탑의 광란」, 방어 퍼즐 「떨어지는 종」.
 * 마지막 종(1막의 퍼즐)은 tests/act2-patterns.test.ts.
 */

const ORIGINS = ['soldier', 'hunter', 'occultist'];

/** 2층에 서 있는 튼튼한 주인공 */
function floor2(seed = 202, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.act = 2;
  run.floor = generateFloor(run, 2);
  run.player.maxHp = run.player.hp = 9999;
  run.player.sanity = run.player.maxSanity = 9999;
  run.player.str = 0;
  run.player.insight = 0;
  run.light = 100;
  return run;
}

/** 그 출신의 시작 덱 그대로, 2층에 걸맞은 레벨·체력 */
function starter(origin: string, seed = 7): RunState {
  const run = newRun({ seed, origin });
  run.act = 2;
  run.floor = generateFloor(run, 2);
  run.player.level = 5;
  run.player.maxHp = run.player.hp = 95;
  run.player.sanity = run.player.maxSanity = 100;
  run.light = 70;
  return run;
}

function fight(run: RunState = floor2()): Combat {
  const c = startCombat(run, 'lord-a2', { anomaly: null });
  c.drain();
  return c;
}

const keeperOf = (c: Combat): EnemyUnit => c.alive.find((x) => x.def === 'bellkeeper')!;
const bellOf = (c: Combat): EnemyUnit => c.alive.find((x) => x.def === 'great-bell')!;
const acolytes = (c: Combat) => c.alive.filter((x) => x.def === 'bell-acolyte');

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

/** 적의 차례처럼 그 행동을 실행한다 */
function act(c: Combat, e: EnemyUnit, id: string) {
  const m = force(c, e, id);
  c.s.phase = 'enemy';
  m.run(c, e);
}

/** 다른 적들은 이번 차례에 아무것도 하지 않는다 */
function idleOthers(c: Combat, keep: EnemyUnit) {
  for (const x of c.alive) if (x !== keep) x.intent = { move: '_wait', kind: 'unknown', label: '관망' };
}

/** 대가를 재기 쉬운 평범한 체력·정신력 */
function plain(c: Combat) {
  c.p.maxHp = c.p.hp = 100;
  c.p.maxSanity = c.p.sanity = 100;
}

const texts = (evs: CombatEvent[]) => evs.filter((x): x is Extract<CombatEvent, { t: 'text' }> => x.t === 'text').map((x) => x.text);
const cinesOf = (evs: CombatEvent[]): { name: CineName; text?: string }[] =>
  evs.filter((x): x is Extract<CombatEvent, { t: 'cine' }> => x.t === 'cine').map((x) => ({ name: x.name, text: x.text }));
const keeperMoves = (evs: CombatEvent[], k: EnemyUnit) => evs.filter((x): x is Extract<CombatEvent, { t: 'move' }> => x.t === 'move' && x.uid === k.uid).map((x) => x.move!);

/** 화면이 모으는 것과 같이 (ui/screens/Combat.tsx turnNotes) */
function note(c: Combat, title: string): TurnNote | undefined {
  for (const [h, self] of c.sources(c.p)) {
    const n = h.turnNote?.(c, self);
    if (n?.title === title) return n;
  }
  return undefined;
}

/** 2막에서 종지기가 막 종을 끊은 내 턴 (1턴 남음) */
function cutting(run: RunState = floor2()) {
  const c = fight(run);
  const keeper = keeperOf(c);
  belfry(c, keeper);
  idleOthers(c, keeper);
  c.endTurn();
  c.drain();
  return { c, keeper };
}

/** 이번 턴 남은 행동력으로 얻을 수 있는 가장 큰 방어도 (쓸 수 있는 기술을 모두 나눠 본다) */
function maxBlock(c: Combat, depth = 0): number {
  let best = c.p.block;
  if (depth >= 6) return best;
  for (const ref of ['weapon', 'armor', ...(c.run.slots.filter(Boolean) as string[])]) {
    if (c.blockReason(ref)) continue;
    const sim = new Combat(structuredClone(c.run) as RunState);
    sim.snapshots = false;
    if (sim.useSkill(ref, keeperOf(sim).uid) !== null) continue;
    best = Math.max(best, maxBlock(sim, depth + 1));
  }
  return best;
}

describe('종지기 — 침묵령', () => {
  it('침묵을 명한다: 내려친 피해는 의도 그대로, 다음 내 턴엔 침묵령 — 상태 칸에는 숨고 칩이 다음 기술의 값을 보인다', () => {
    const c = fight();
    const keeper = keeperOf(c);
    const m = force(c, keeper, 'silence');
    expect(m.intent).toBe('attack');
    expect(m.extra).toContain('debuff');
    expect(keeper.intent?.dmg).toBe(SILENCE_DMG);
    // 설명이 규칙을 그대로 말한다
    expect(m.desc).toContain(`두 번째 ${hushCost(2)}, 세 번째 ${hushCost(3)}, 네 번째 ${hushCost(4)}`);
    expect(m.desc).toContain('기본기도 센다');
    idleOthers(c, keeper);
    const pv = c.preview(keeper, c.p, SILENCE_DMG, 'blunt');
    const hp = c.p.hp;
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(hp - c.p.hp).toBe(pv);
    expect(c.p.st[HUSH]).toBe(1);
    expect(STATUSES.get(HUSH)!.hidden).toBe(true);
    const n = note(c, '침묵령')!;
    expect(n.text).toBe('첫 기술은 무사');
    expect(n.bad).toBe(true);
  });

  it(`첫 기술은 괜찮고, 두 번째부터 쓸 때마다 대가가 ${SILENCE_SAN}씩 는다 — 기본기도 세고, 칩이 다음 값을 미리 보인다`, () => {
    const c = fight();
    const keeper = keeperOf(c);
    c.p.st[HUSH] = 1;
    c.s.ap = 9;
    c.s.ammo = 6;
    const paid: number[] = [];
    const refs = ['armor', 'weapon', 'armor', 'armor'];
    for (let k = 1; k <= refs.length; k++) {
      const want = c.previewSanityLoss(hushCost(k));
      expect(note(c, '침묵령')!.text).toBe(k === 1 ? '첫 기술은 무사' : `다음 기술 정신력 -${want}`);
      const san = c.p.sanity;
      expect(c.useSkill(refs[k - 1], keeper.uid)).toBeNull();
      paid.push(san - c.p.sanity);
    }
    expect(paid).toEqual([0, 1, 2, 3].map((x) => c.previewSanityLoss(x * SILENCE_SAN)));
    expect(paid[1]).toBeGreaterThan(0);
    expect(paid[3]).toBeGreaterThan(paid[2]);
    expect(paid[2]).toBeGreaterThan(paid[1]);
  });

  it('행동력 0인 기술(재장전)은 세지 않고, 메아리로 한 번 더 울린 기술은 하나로 센다', () => {
    const c = fight();
    c.p.st[HUSH] = 1;
    c.s.ap = 9;
    c.s.ammo = 0;
    const reload = c.run.skills.find((s) => s.id === 'reload')!;
    expect(c.run.slots).toContain(reload.uid);
    const san = c.p.sanity;
    expect(c.useSkill(reload.uid)).toBeNull();
    expect(c.p.st[HUSH]).toBe(1);
    expect(c.p.sanity).toBe(san);
    const uid = c.run.slots.find((u) => !!u && u !== reload.uid && !c.blockReason(u) && c.costOf(c.skillInfo(u)!) > 0)!;
    c.run.skills.find((s) => s.uid === uid)!.runes = ['echo'];
    expect(c.useSkill(uid, keeperOf(c).uid)).toBeNull();
    expect(c.p.st[HUSH]).toBe(2);
  });

  it('침묵령은 그 턴이 끝나면 풀린다 — 다음 턴엔 기술이 다시 공짜', () => {
    const c = fight();
    const keeper = keeperOf(c);
    force(c, keeper, 'silence');
    idleOthers(c, keeper);
    c.endTurn();
    expect(c.p.st[HUSH]).toBe(1);
    c.s.ap = 9;
    const san0 = c.p.sanity;
    expect(c.useSkill('armor')).toBeNull();
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.sanity).toBe(san0 - c.previewSanityLoss(SILENCE_SAN));
    force(c, keeper, 'hammer');
    idleOthers(c, keeper);
    c.endTurn();
    expect(c.p.st[HUSH]).toBeUndefined();
    expect(note(c, '침묵령')).toBeUndefined();
    const san = c.p.sanity;
    for (let i = 0; i < 3; i++) expect(c.useSkill('armor')).toBeNull();
    expect(c.p.sanity).toBe(san);
  });

  it('기술을 막지 않는다: 침묵령 아래에서도 쓸 수 있는 기술이 그대로이고, 행동력을 끝까지 쓸 수 있다 (출신 셋의 시작 덱)', () => {
    for (const origin of ORIGINS) {
      const c = fight(starter(origin));
      const refs = ['weapon', 'armor', ...(c.run.slots.filter(Boolean) as string[])];
      const free = refs.map((r) => c.blockReason(r));
      c.p.st[HUSH] = 1;
      expect(refs.map((r) => c.blockReason(r)), origin).toEqual(free);
      let used = 0;
      for (let i = 0; i < 10 && c.s.ap > 0; i++) {
        const ref = refs.find((r) => !c.blockReason(r) && c.costOf(c.skillInfo(r)!) > 0);
        if (!ref) break;
        expect(c.useSkill(ref, keeperOf(c).uid), origin).toBeNull();
        used++;
      }
      expect(c.s.ap, origin).toBe(0);
      expect(used, origin).toBeGreaterThanOrEqual(c.p.maxAp);
    }
  });

  it('결계가 침묵령을 막고, 명한 종지기가 쓰러지면 풀린다', () => {
    const c = fight();
    const keeper = keeperOf(c);
    c.p.st.ward = 1;
    act(c, keeper, 'silence');
    expect(c.p.st[HUSH]).toBeUndefined();
    expect(c.p.st.ward).toBeUndefined();
    act(c, keeper, 'silence');
    expect(c.p.st[HUSH]).toBe(1);
    c.s.phase = 'player';
    c.spawn('bell-acolyte', 1);
    c.kill(keeper);
    expect(c.over).toBe(false);
    expect(c.p.st[HUSH]).toBeUndefined();
  });
});

describe('종지기 — 종탑의 광란 (2막)', () => {
  it(`체력이 ${Math.round(BELFRY_PCT * 100)}% 이하가 되면 ${BELFRY_NAME} — 새 버팀이 가득 차고 첫 행동은 종을 끊는 것 (한 번뿐)`, () => {
    const c = fight();
    const keeper = keeperOf(c);
    const bell = bellOf(c);
    // 버팀이 거의 깎인 채로 변해도 새 버팀이 가득 찬다
    keeper.poise = 1;
    const half = Math.floor(keeper.maxHp * BELFRY_PCT);
    c.damage({ src: null, tgt: keeper, base: keeper.hp - half - 1, type: 'true' });
    expect(keeper.form ?? 0).toBe(0);
    c.drain();
    const san = c.p.sanity;
    const loss = c.previewSanityLoss(BELFRY_SAN);
    c.damage({ src: null, tgt: keeper, base: 1, type: 'true' });
    expect(keeper.hp).toBe(half);
    expect(keeper.form).toBe(1);
    expect(keeper.name).toBe(BELFRY_NAME);
    expect(keeper.mem.transformed).toBe(1);
    expect(keeper.maxPoise).toBe(scaledPoise(BELFRY_POISE, 2));
    expect(keeper.poise).toBe(keeper.maxPoise);
    expect(keeper.intent?.move).toBe('cut');
    expect(keeper.intent?.charging).toBe(true);
    expect(san - c.p.sanity).toBe(loss);
    const evs = c.drain();
    expect(evs.some((x) => x.t === 'fx' && x.name === 'transform')).toBe(true);
    expect(cinesOf(evs).some((x) => x.name === 'shatter')).toBe(true);
    expect(cinesOf(evs).filter((x) => x.name === 'whisper').length).toBe(1);
    expect(c.s.vars['ui:tilt']).toBe(BELFRY_TILT);
    // 대종은 남는다 (2막에는 타종하지 않는다)
    expect(bell.dead).toBe(false);
    // 한 번뿐
    c.damage({ src: null, tgt: keeper, base: 10, type: 'true' });
    expect(c.p.sanity).toBe(san - loss);
    expect(cinesOf(c.drain()).some((x) => x.name === 'whisper')).toBe(false);
    // 새 모습의 그림이 있다
    expect(ENEMIES.get('bellkeeper')!.forms?.[0]?.name).toBe(BELFRY_NAME);
  });

  it('마지막 종을 세던 중에 광란에 빠지면 카운트다운은 흩어진다 (띠와 표시가 사라지고 종을 끊는다)', () => {
    const c = fight();
    const keeper = keeperOf(c);
    keeper.mem.tolls = 2;
    force(c, keeper, 'toll3');
    idleOthers(c, keeper);
    c.endTurn();
    expect(keeper.mem.knell).toBe(1);
    expect(c.s.obj?.text).toBe(KNELL_TEXT_1);
    c.drain();
    c.damage({ src: null, tgt: keeper, base: keeper.hp - Math.floor(keeper.maxHp * BELFRY_PCT), type: 'true' });
    expect(keeper.form).toBe(1);
    expect(keeper.mem.knell).toBe(0);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[KNELL]).toBeUndefined();
    expect(texts(c.drain())).toContain('광란 속에 마지막 종소리가 흩어졌다');
    expect(keeper.intent?.move).toBe('cut');
  });

  it('대종이 깨지면 체력이 가득해도 광란 — 비틀거린 차례가 지나면 종을 끊는다 (기절로 밀려도 끊는다)', () => {
    const c = fight();
    const keeper = keeperOf(c);
    c.damage({ src: c.p, tgt: bellOf(c), base: 9999, type: 'true' });
    expect(keeper.form).toBe(1);
    expect(keeper.hp).toBe(keeper.maxHp);
    expect(keeper.st.stun).toBe(1);
    c.endTurn();
    expect(c.s.obj ?? null).toBeNull();
    expect(keeper.intent?.move).toBe('cut');
    c.endTurn();
    expect(c.s.obj?.block).toBe(FALL_BLOCK);
    expect(keeper.intent?.move).toBe('fall');
  });

  it('광란의 순서: 종을 끊고 → 떨어뜨리고 → 종추 연타와 장송곡 → 수련사들 → 침묵 → 광란의 종추 → 심장의 종 → 다시 종을 끊는다', () => {
    const c = fight();
    const keeper = keeperOf(c);
    belfry(c, keeper);
    c.drain();
    const seq: string[] = [];
    // 종을 끊는 차례 + 떨어지는 차례 + 나머지 순서 + 다시 끊고 떨어뜨리기
    for (let i = 0; i < BELFRY_CYCLE.length + 3; i++) {
      c.endTurn();
      seq.push(...keeperMoves(c.drain(), keeper));
    }
    const k = BELFRY_CYCLE.indexOf('cut');
    const rest = [...BELFRY_CYCLE.slice(k + 1), ...BELFRY_CYCLE.slice(0, k)];
    expect(seq).toEqual(['cut', 'fall', ...rest, 'cut', 'fall']);
    expect(rest).toEqual(['combo', 'call', 'silence', 'flurry', 'heart']);
  });

  it(`광란: 2막에서 행동할 때마다 힘 +${BELFRY_FRENZY} — 기절해 쉰 차례엔 붙지 않고, 1막에는 없다`, () => {
    const c = fight();
    const keeper = keeperOf(c);
    belfry(c, keeper);
    const s0 = keeper.st.str ?? 0;
    force(c, keeper, 'hammer');
    idleOthers(c, keeper);
    c.endTurn();
    expect(keeper.st.str ?? 0).toBe(s0 + BELFRY_FRENZY);
    keeper.st.stun = 1;
    idleOthers(c, keeper);
    c.endTurn();
    expect(keeper.st.str ?? 0).toBe(s0 + BELFRY_FRENZY);
    const d = fight();
    const k1 = keeperOf(d);
    const s1 = k1.st.str ?? 0;
    force(d, k1, 'hammer');
    idleOthers(d, k1);
    d.endTurn();
    expect(k1.st.str ?? 0).toBe(s1);
  });

  it(`종탑의 수련사들: 한 번에 ${BELFRY_CALL}명, 함께 ${BELFRY_ACOLYTES}명까지, 후열 자리만 — 부를 수 없으면 장송곡`, () => {
    const c = fight();
    const keeper = keeperOf(c);
    c.kill(bellOf(c), false);
    expect(keeper.form).toBe(1);
    act(c, keeper, 'call');
    expect(acolytes(c).length).toBe(Math.min(BELFRY_CALL, BELFRY_ACOLYTES));
    act(c, keeper, 'call');
    act(c, keeper, 'call');
    expect(acolytes(c).length).toBe(Math.min(BELFRY_ACOLYTES, MAX_ROW));
    expect(acolytes(c).every((x) => x.row === 1)).toBe(true);
    expect(c.row(0)).toEqual([keeper]);
    // 순서가 수련사들인데 부를 수 없으면 장송곡
    c.s.phase = 'player';
    keeper.mem.c2 = BELFRY_CYCLE.indexOf('call');
    delete keeper.mem.cutDue;
    c.planIntent(keeper);
    expect(keeper.intent?.move).toBe('dirge');
    // 대종이 남아 후열 한 자리를 차지하면 그만큼 덜 부른다
    const d = fight();
    const k2 = keeperOf(d);
    belfry(d, k2);
    act(d, k2, 'call');
    act(d, k2, 'call');
    expect(acolytes(d).length).toBe(MAX_ROW - 1);
    expect(d.row(1).length).toBe(MAX_ROW);
  });

  it('종추 연타와 장송곡: 한 행동에 공격(의도의 피해·횟수 그대로)과 정신 공격', () => {
    const c = fight();
    const keeper = keeperOf(c);
    belfry(c, keeper);
    c.drain();
    const m = force(c, keeper, 'combo');
    expect(keeper.intent?.kind).toBe('horror');
    expect(keeper.intent?.extra).toContain('attack');
    expect(keeper.intent?.hits).toBe(COMBO_HITS);
    const pv = c.preview(keeper, c.p, COMBO_DMG, 'blunt');
    const san = c.p.sanity;
    const loss = c.previewSanityLoss(COMBO_SAN);
    c.s.phase = 'enemy';
    m.run(c, keeper);
    const hits = c.drain().filter((x): x is Extract<CombatEvent, { t: 'dmg' }> => x.t === 'dmg' && x.tgt === 'p' && x.attack);
    expect(hits.length).toBe(COMBO_HITS);
    expect(hits.every((h) => h.amount === pv)).toBe(true);
    expect(san - c.p.sanity).toBe(loss);
  });

  it('저장했다 불러와도 광란과 떨어지는 종이 이어진다 (JSON)', () => {
    const { c } = cutting();
    plain(c);
    const saved = JSON.stringify(c.run);
    for (const safe of [false, true]) {
      const a = new Combat(JSON.parse(saved) as RunState);
      const k = keeperOf(a);
      expect(k.form).toBe(1);
      expect(k.name).toBe(BELFRY_NAME);
      expect(a.s.obj?.block).toBe(FALL_BLOCK);
      expect(a.p.st[FALL]).toBe(1);
      expect(a.shownIntent(k)?.move).toBe('fall');
      a.s.ap = 9;
      if (safe) while (a.p.block < FALL_BLOCK) expect(a.useSkill('armor')).toBeNull();
      const hp = a.p.hp;
      const khp = k.hp;
      idleOthers(a, k);
      a.endTurn();
      expect(a.s.phase).toBe('player');
      if (safe) {
        expect(a.p.hp).toBe(hp);
        expect(k.hp).toBe(khp - FALL_SELF);
      } else expect(hp - a.p.hp).toBe(Math.ceil(a.p.maxHp * FALL_PCT));
    }
  });
});

describe('종지기 — 떨어지는 종 (방어 퍼즐)', () => {
  it('종을 끊으면 목표 띠(방어도 · 1턴 남음 · 대가)와 떨어지는 종 표시 — 다음 의도는 떨어지는 종 (즉사도, 피해로 푸는 퍼즐도 아니다)', () => {
    const { c, keeper } = cutting();
    expect(c.s.phase).toBe('player');
    expect(c.s.obj?.block).toBe(FALL_BLOCK);
    expect(c.s.obj?.text).toBe(FALL_TEXT);
    expect(c.s.obj?.text).toContain('1턴');
    expect(c.s.obj?.text).toContain(`방어도 ${FALL_BLOCK}`);
    expect(c.s.obj?.fail).toBe(FALL_FAIL);
    expect(c.s.obj?.lethal).toBeFalsy();
    expect(c.s.obj?.hit).toBeUndefined();
    expect(c.s.obj?.types).toBeUndefined();
    expect(c.p.st[FALL]).toBe(1);
    expect(keeper.intent?.move).toBe('fall');
    expect(keeper.intent?.kind).toBe('charge');
    // 종을 끊는 행동 자체가 한 턴 앞선 예고다
    const cut = c.moveDef(keeper, 'cut');
    expect(cut.intent).toBe('charge');
    expect(cut.charging).toBe(true);
    expect(cut.desc).toContain(`방어도 ${FALL_BLOCK}`);
  });

  it(`방어도 ${FALL_BLOCK} 이상으로 턴을 마치면 숨는다 — 닿는 순간 띠가 걷히고, 떨어진 종이 종지기를 덮친다 (피해 ${FALL_SELF}, 버팀 -${FALL_POISE}). 나는 다치지 않는다`, () => {
    const { c, keeper } = cutting();
    plain(c);
    c.s.ap = 9;
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.block).toBeLessThan(FALL_BLOCK);
    expect(c.s.obj?.block).toBe(FALL_BLOCK);
    while (c.p.block < FALL_BLOCK) expect(c.useSkill('armor')).toBeNull();
    expect(c.s.obj ?? null).toBeNull();
    expect(keeper.intent?.move).toBe('recoil');
    expect(texts(c.drain()).filter((t) => t === '종 그늘 아래로 숨었다').length).toBe(1);
    const hp = c.p.hp;
    const khp = keeper.hp;
    const kp = keeper.poise;
    idleOthers(c, keeper);
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.p.hp).toBe(hp);
    expect(keeper.hp).toBe(khp - FALL_SELF);
    expect(keeper.poise).toBe(kp - FALL_POISE);
    expect(c.p.st[FALL]).toBeUndefined();
    expect(c.p.st[PINNED]).toBeUndefined();
    expect(keeper.mem.fall).toBeFalsy();
    expect(c.s.ap).toBe(c.p.maxAp);
    expect(texts(c.drain())).toContain('떨어진 종이 종지기를 덮쳤다');
  });

  it('숨었다가 방어도를 잃으면 띠와 의도가 돌아온다 — 판정은 턴이 끝날 때', () => {
    const { c, keeper } = cutting();
    plain(c);
    c.s.ap = 9;
    c.s.ammo = 6;
    while (c.p.block < FALL_BLOCK) c.useSkill('armor');
    expect(c.s.obj ?? null).toBeNull();
    c.p.block = 0;
    expect(c.useSkill('weapon', keeper.uid)).toBeNull();
    expect(c.s.obj?.block).toBe(FALL_BLOCK);
    expect(keeper.intent?.move).toBe('fall');
    expect(texts(c.drain())).toContain('종 그늘에서 벗어났다');
    const hp = c.p.hp;
    idleOthers(c, keeper);
    c.endTurn();
    expect(hp - c.p.hp).toBe(Math.ceil(c.p.maxHp * FALL_PCT));
  });

  it(`버팀이 ${FALL_POISE} 이하로 남았으면 떨어진 종에 종지기가 붕괴한다`, () => {
    const { c, keeper } = cutting();
    keeper.poise = FALL_POISE;
    c.s.ap = 9;
    while (c.p.block < FALL_BLOCK) c.useSkill('armor');
    idleOthers(c, keeper);
    c.endTurn();
    expect(keeper.broken).toBe(2);
    expect(keeper.intent?.move).toBe('_broken');
  });

  it(`못 숨으면 방어도를 무시하고 최대 체력의 ${Math.round(FALL_PCT * 100)}% 피해, 다음 턴 행동력 -${FALL_AP} (즉사는 아니다)`, () => {
    const { c, keeper } = cutting();
    plain(c);
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.block).toBeGreaterThan(0);
    expect(c.p.block).toBeLessThan(FALL_BLOCK);
    const hp = c.p.hp;
    idleOthers(c, keeper);
    c.endTurn();
    const evs = c.drain();
    expect(c.s.phase).toBe('player');
    expect(c.s.doom).toBeUndefined();
    expect(hp - c.p.hp).toBe(Math.ceil(c.p.maxHp * FALL_PCT));
    expect(c.s.ap).toBe(c.p.maxAp - FALL_AP);
    // 짓눌림은 한 턴뿐
    expect(c.p.st[PINNED]).toBeUndefined();
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[FALL]).toBeUndefined();
    expect(keeper.mem.fall).toBeFalsy();
    expect(texts(evs)).toContain('종에 깔렸다');
    // 떨어지는 종은 필살기 컷인과 함께
    expect(evs.some((x) => x.t === 'move' && x.uid === keeper.uid && x.move === 'fall' && x.ult === true)).toBe(true);
    // 한 번 더 넘기면 행동력이 돌아온다
    idleOthers(c, keeper);
    force(c, keeper, 'hammer');
    c.endTurn();
    expect(c.s.ap).toBe(c.p.maxAp);
  });

  it('종지기를 붕괴시키면 떨어지는 종이 끊긴다 — 대가 없음', () => {
    const { c, keeper } = cutting();
    plain(c);
    keeper.poise = 1;
    c.damage({ src: c.p, tgt: keeper, base: 1, type: 'fire', attack: true });
    expect(keeper.broken).toBe(2);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[FALL]).toBeUndefined();
    expect(keeper.mem.fall).toBeFalsy();
    const hp = c.p.hp;
    idleOthers(c, keeper);
    c.endTurn();
    expect(c.p.hp).toBe(hp);
    expect(c.s.ap).toBe(c.p.maxAp);
  });

  it('종을 끊기 전에 붕괴시키면 밧줄을 놓친다 — 그 종은 오지 않고 순서대로 넘어간다', () => {
    const c = fight();
    const keeper = keeperOf(c);
    belfry(c, keeper);
    expect(keeper.intent?.move).toBe('cut');
    keeper.poise = 1;
    c.damage({ src: c.p, tgt: keeper, base: 1, type: 'fire', attack: true });
    expect(keeper.broken).toBe(2);
    expect(keeper.mem.cutDue).toBeFalsy();
    idleOthers(c, keeper);
    c.endTurn();
    expect(c.s.obj ?? null).toBeNull();
    const k = BELFRY_CYCLE.indexOf('cut');
    expect(keeper.intent?.move).toBe(BELFRY_CYCLE[(k + 1) % BELFRY_CYCLE.length]);
  });

  it('종지기가 기절해 있어도 끊어 둔 종은 떨어진다 — 숨었으면 종지기를, 아니면 나를 덮친다', () => {
    for (const safe of [false, true]) {
      const { c, keeper } = cutting();
      plain(c);
      c.s.ap = 9;
      if (safe) while (c.p.block < FALL_BLOCK) c.useSkill('armor');
      // 대종이 깨져 종지기가 비틀거린다
      c.damage({ src: c.p, tgt: bellOf(c), base: 9999, type: 'true' });
      expect(keeper.st.stun).toBe(1);
      const hp = c.p.hp;
      const khp = keeper.hp;
      c.endTurn();
      const evs = c.drain();
      expect(keeperMoves(evs, keeper)).toEqual([]);
      expect(keeper.mem.fall).toBeFalsy();
      expect(c.s.obj ?? null).toBeNull();
      if (safe) {
        expect(c.p.hp).toBe(hp);
        expect(keeper.hp).toBe(khp - FALL_SELF);
      } else expect(hp - c.p.hp).toBe(Math.ceil(c.p.maxHp * FALL_PCT));
    }
  });

  it('초반에는 오지 않는다: 첫 턴에 대종을 깨도 종은 셋째 턴에야 떨어지고, 떨어지기 전 내 턴 내내 띠가 보인다', () => {
    const c = fight();
    const keeper = keeperOf(c);
    expect(c.s.turn).toBe(1);
    c.damage({ src: c.p, tgt: bellOf(c), base: 9999, type: 'true' });
    const log: string[] = [];
    for (let t = 1; t <= 4; t++) {
      expect(c.s.turn).toBe(t);
      const obj = c.s.obj?.block !== undefined;
      c.endTurn();
      const fell = keeperMoves(c.drain(), keeper).includes('fall');
      log.push(`${t}${obj ? ' 띠' : ''}${fell ? ' 떨어짐' : ''}`);
    }
    expect(log).toEqual(['1', '2', '3 띠 떨어짐', '4']);
  });

  it('종지기가 쓰러지면 띠와 표시가 사라지고 기울었던 화면도 바로 선다', () => {
    const { c, keeper } = cutting();
    expect(c.s.vars['ui:tilt']).toBe(BELFRY_TILT);
    c.spawn('bell-acolyte', 1);
    c.kill(keeper);
    expect(c.over).toBe(false);
    expect(c.s.obj ?? null).toBeNull();
    expect(c.p.st[FALL]).toBeUndefined();
    expect(c.s.vars['ui:tilt']).toBeUndefined();
  });
});

describe('종지기 — 출신 공정성 (시작 덱, 2층 수준: Lv5, 체력 95)', () => {
  it(`시작 덱(방어구 기본기 + 시작 기술)으로 행동력 3에 방어도 ${FALL_BLOCK}에 닿는다 — 방어구 기본기만 세 번 써도 (출신 셋)`, () => {
    for (const origin of ORIGINS) {
      const c = fight(starter(origin));
      expect(c.p.maxAp, origin).toBe(3);
      c.s.ap = 3;
      expect(maxBlock(c), origin).toBeGreaterThanOrEqual(FALL_BLOCK);
      const d = fight(starter(origin));
      d.s.ap = 3;
      for (let i = 0; i < 3; i++) expect(d.useSkill('armor'), origin).toBeNull();
      expect(d.p.block, origin).toBeGreaterThanOrEqual(FALL_BLOCK);
    }
  }, 60_000);

  it('봇은 띠를 보고 종 그늘 아래 숨는다 (출신 셋, 시드 셋)', () => {
    for (const origin of ORIGINS) {
      for (const seed of [3, 4, 5]) {
        const tag = `${origin} #${seed}`;
        const { c, keeper } = cutting(starter(origin, seed));
        c.snapshots = false;
        const khp = keeper.hp;
        autoTurn(c);
        const evs = c.drain();
        expect(c.s.phase, tag).toBe('player');
        expect(texts(evs), tag).toContain('떨어진 종이 종지기를 덮쳤다');
        expect(texts(evs), tag).not.toContain('종에 깔렸다');
        expect(keeper.hp, tag).toBeLessThanOrEqual(khp - FALL_SELF);
        expect(c.s.ap, tag).toBe(c.p.maxAp);
      }
    }
  }, 60_000);

  it('문장 가이드: 종지기의 설명·상태·목표 띠에 긴 줄표(—)가 없고, 연결어미 뒤에 쉼표를 찍지 않는다', () => {
    const def = ENEMIES.get('bellkeeper')!;
    const lines = [
      TRAITS.get('a2-bell-bound')!.desc,
      TRAITS.get('a2-great-bell')!.desc,
      ...Object.values(def.moves).map((m) => m.desc ?? ''),
      ...[HUSH, FALL, PINNED].map((id) => STATUSES.get(id)!.desc),
      FALL_TEXT,
      FALL_FAIL,
    ];
    for (const t of lines) {
      expect(t.includes('—'), t).toBe(false);
      expect(/(지만|하고|으며|고), /.test(t), t).toBe(false);
    }
  });

  it('설명은 상수를 그대로 읽는다 (숫자를 고치면 문구도 따라간다)', () => {
    const def = ENEMIES.get('bellkeeper')!;
    const trait = TRAITS.get('a2-bell-bound')!;
    expect(trait.desc).toContain(BELFRY_NAME);
    expect(trait.desc).toContain(`방어도 ${FALL_BLOCK} 이상`);
    expect(trait.desc).toContain(`${Math.round(FALL_PCT * 100)}% 피해`);
    expect(trait.desc).toContain(`힘 +${BELFRY_FRENZY}`);
    expect(def.moves.fall.desc).toContain(`버팀 -${FALL_POISE}`);
    expect(def.moves.recoil.desc).toContain(`피해 ${FALL_SELF}`);
    expect(def.moves.call.desc).toContain(`${BELFRY_CALL}명`);
    expect(STATUSES.get(HUSH)!.desc).toContain(`두 번째 ${hushCost(2)}`);
    expect(STATUSES.get(FALL)!.desc).toContain(`방어도 ${FALL_BLOCK}`);
  });
});
