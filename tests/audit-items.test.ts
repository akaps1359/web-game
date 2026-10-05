import { describe, expect, it } from 'vitest';
import '../src/content';
import { Combat } from '../src/engine/combat';
import { ANOMALIES, CONSUMABLES, ENCOUNTERS, EQUIPS, EVENTS, MADNESS, RELICS, RUNES, SKILLS, STATUSES } from '../src/engine/registry';
import { addConsumable, finishCombat, gainRelic, learnSkill, newRun, socketRune, startCombat, type RunState } from '../src/engine/run';
import { chooseEvent, eventView, leaveEvent, startEvent } from '../src/engine/events';
import type { EquipSlot, OwnedSkill } from '../src/engine/types';
import { plain, skillDesc } from '../src/ui/text';
import { autoTurn } from '../src/sim/bot';

/**
 * 아이템·전역 효과 감사 (유물·장비·각인·소모품·상태·광기·전장 규칙·extra 스킬/이벤트).
 * 설명과 실제 동작이 어긋났던 것들의 회귀 테스트 + 모든 아이템을 한 번씩 써 보는 스모크 테스트.
 */

const MULTI = 'a1-cult'; // 전열 1 + 후열 2

/** 테스트용 튼튼한 주인공 (정신력·체력이 바닥나지 않는다) */
function sturdyRun(seed = 1, origin = 'soldier'): RunState {
  const run = newRun({ seed, origin });
  run.player.maxHp = run.player.hp = 99999;
  run.player.sanity = run.player.maxSanity = 99999;
  return run;
}

/** 스킬을 배우고 반드시 장착한다 (시작 슬롯이 가득 차 있으므로 슬롯을 늘린다) */
function teach(run: RunState, id: string): OwnedSkill {
  if (!run.slots.includes(null)) run.slots.push(null);
  const s = learnSkill(run, id) ?? run.skills.find((x) => x.id === id)!;
  if (!run.slots.includes(s.uid)) run.slots[run.slots.indexOf(null)] = s.uid;
  return s;
}

function equip(run: RunState, slot: EquipSlot, id: string, lvl: number) {
  run.equip[slot] = { uid: `test-${slot}`, id, lvl };
}

/** 봇으로 전투를 끝까지 */
function playOut(c: Combat) {
  let n = 0;
  while (!c.over && n++ < 200) autoTurn(c);
  return c.s.phase;
}

function hpSum(c: Combat) {
  return c.alive.reduce((s, e) => s + e.hp + e.block, 0);
}

// ───────────── 고친 버그의 회귀 테스트 ─────────────

describe('설명과 다르게 동작하던 것들', () => {
  it('붉은 영약: 부식(과 층의 해로운 상태)도 없앤다', () => {
    const run = sturdyRun();
    run.consumables = ['elixir', null, null];
    const c = startCombat(run, 'a1-thug');
    const e = c.alive[0];
    for (const id of ['corrode', 'weak', 'poison', 'a3-timeworn', 'a5-snare']) c.apply(c.p, id, 2, e);
    expect(c.useConsumable(0)).toBeNull();
    for (const id of ['corrode', 'weak', 'poison', 'a3-timeworn', 'a5-snare']) expect(c.p.st[id], id).toBeUndefined();
  });

  it('혈액공포증: 출혈 1로 턴을 시작해도 정신력 -3', () => {
    const run = sturdyRun();
    run.madness = ['hemophobia'];
    const c = startCombat(run, 'a1-thug');
    c.p.st.bleed = 1;
    const san = c.p.sanity;
    c.startPlayerTurn();
    expect(c.p.st.bleed).toBeUndefined(); // 출혈은 피해를 주고 사라졌다
    expect(san - c.p.sanity).toBe(3);
    // 출혈이 없으면 잃지 않는다
    const san2 = c.p.sanity;
    c.startPlayerTurn();
    expect(c.p.sanity).toBe(san2);
  });

  it('잔영: 잔영을 쓴 그 순간에는 터지지 않고, 이후 스킬마다 터진다', () => {
    const run = sturdyRun();
    const s = teach(run, 'x-afterimage');
    const c = startCombat(run, MULTI);
    c.drain();
    expect(c.useSkill(s.uid)).toBeNull();
    expect(c.drain().filter((ev) => ev.t === 'dmg' && ev.tags.includes('afterimage')).length).toBe(0);
    expect(c.useSkill('armor')).toBeNull();
    expect(c.drain().filter((ev) => ev.t === 'dmg' && ev.tags.includes('afterimage')).length).toBe(1);
  });

  it('쌍둥이 달: 탄약이 바닥난 사격은 다시 발동하지 않는다 (빈 총 공짜 사격 방지)', () => {
    const run = sturdyRun();
    gainRelic(run, 'x-twin-moon');
    const s = teach(run, 'x-quick-draw');
    const c = startCombat(run, MULTI);
    c.s.ammo = 1;
    c.drain();
    expect(c.useSkill(s.uid, c.alive[0].uid)).toBeNull();
    expect(c.s.ammo).toBe(0);
    expect(c.drain().filter((ev) => ev.t === 'skill' && ev.echo).length).toBe(0);
    // 탄약이 남아 있으면 정상 발동 (다음 턴)
    c.endTurn();
    c.s.ammo = 3;
    c.drain();
    expect(c.useSkill(s.uid, c.alive[0].uid)).toBeNull();
    expect(c.drain().filter((ev) => ev.t === 'skill' && ev.echo).length).toBe(1);
    expect(c.s.ammo).toBe(1);
  });

  it('extra 스킬의 추가 피해·방어도도 위력(절약 각인 -25%)을 따른다', () => {
    const dmgOf = (id: string, rune: string | null, setup: (c: Combat, e: Combat['s']['enemies'][number]) => void) => {
      const run = sturdyRun();
      const s = teach(run, id);
      if (rune) s.runes.push(rune);
      const c = startCombat(run, 'a1-thug');
      const e = c.alive[0];
      e.hp = e.maxHp = 9999;
      setup(c, e);
      const before = e.hp;
      expect(c.useSkill(s.uid, e.uid), id).toBeNull();
      return before - e.hp;
    };
    const cases: [string, (c: Combat, e: Combat['s']['enemies'][number]) => void][] = [
      ['x-echo-burst', (_c, e) => void (e.st.mark = 6)],
      ['x-tentacle-lash', (c) => void (c.p.st.tentacle = 8)],
      ['x-vengeance', (c) => void (c.p.hp = c.p.maxHp - 1000)],
      ['x-shattered-mind', (c) => void (c.p.sanity = c.p.maxSanity - 1000)],
      ['x-opportunist', (_c, e) => void Object.assign(e.st, { weak: 2, poison: 3, bleed: 2, corrode: 1 })],
      ['x-backlash', (c) => void (c.p.st.barrier = 40)],
    ];
    for (const [id, setup] of cases) {
      const full = dmgOf(id, null, setup);
      const thrift = dmgOf(id, 'thrift', setup);
      expect(full, id).toBeGreaterThan(20);
      expect(thrift, `${id}: ${full} → ${thrift}`).toBeLessThanOrEqual(Math.ceil(full * 0.75) + 1);
      expect(thrift, `${id}: ${full} → ${thrift}`).toBeGreaterThanOrEqual(Math.floor(full * 0.75) - 3);
    }
  });

  it('강화해도 변화가 없던 장신구: 회중시계·탄띠·눈의 부적', () => {
    // 회중시계: 강화마다 전투 첫 턴 행동력 +1, 3의 배수 턴 +1은 그대로
    for (const lvl of [0, 1, 2]) {
      const run = sturdyRun();
      equip(run, 'trinket2', 'pocket-watch', lvl);
      const c = startCombat(run, 'a1-thug');
      expect(c.s.ap, `+${lvl} 첫 턴`).toBe(run.player.maxAp + lvl);
      c.startPlayerTurn();
      c.startPlayerTurn();
      expect(c.s.turn).toBe(3);
      expect(c.s.ap, `+${lvl} 3턴`).toBe(run.player.maxAp + 1);
    }
    // 탄띠: 최대 탄약 +2, 강화마다 +1
    for (const lvl of [0, 1, 2]) {
      const run = sturdyRun();
      equip(run, 'trinket1', 'bandolier', lvl);
      const c = startCombat(run, 'a1-thug');
      expect(c.s.maxAmmo).toBe(6 + 2 + lvl);
      expect(c.s.ammo).toBe(c.s.maxAmmo);
    }
    // 눈의 부적: 약점 1개, 강화마다 1개 더
    for (const lvl of [0, 1, 2]) {
      const run = sturdyRun();
      equip(run, 'trinket2', 'eye-amulet', lvl);
      const c = startCombat(run, 'a1-cult');
      for (const e of c.alive) expect(e.known.length, `${e.def} +${lvl}`).toBe(Math.min(e.weak.length, 1 + lvl));
    }
  });

  it('행운의 동전·공허의 파편은 설명대로 강화마다 강해진다', () => {
    for (const lvl of [0, 2]) {
      const run = sturdyRun();
      equip(run, 'trinket2', 'lucky-coin', lvl);
      const c = startCombat(run, 'a1-thug');
      c.kill(c.alive[0]);
      c.endTurn(); // 턴을 넘기며 승리 판정
      expect(c.s.phase).toBe('victory');
      expect(c.s.bonusGold).toBe(8 + 4 * lvl);
    }
    const run = sturdyRun();
    equip(run, 'trinket2', 'void-shard', 2);
    const c = startCombat(run, 'a1-thug');
    expect(c.preview(c.p, c.alive[0], 10, 'void', { attack: false }) - c.preview(c.p, c.alive[0], 10, 'fire', { attack: false })).toBe(5);
  });
});

// ───────────── 엔진이 id로 찾는 아이템 ─────────────

describe('엔진의 id 검사', () => {
  it('엔진·UI가 id로 찾는 유물·장비·광기가 모두 존재한다', () => {
    for (const id of ['rusty-compass', 'old-blanket', 'sleeper-scale', 'membership-coin', 'lighthouse-lens', 'infinite-ring']) expect(RELICS.has(id), id).toBe(true);
    for (const id of ['storm-lantern', 'diving']) expect(EQUIPS.has(id), id).toBe(true);
    for (const id of ['insomnia', 'x-foresight']) expect(MADNESS.has(id), id).toBe(true);
    for (const id of ['rule-inverted']) expect(ANOMALIES.has(id), id).toBe(true);
  });

  it('보스 유물 선택지의 "행동력 +1" 판별(설명 앞머리)과 실제 효과가 일치한다', () => {
    for (const d of RELICS.values()) {
      const run = sturdyRun();
      const ap = run.player.maxAp;
      gainRelic(run, d.id);
      const gainsAp = run.player.maxAp === ap + 1;
      expect(d.desc.startsWith('행동력 +1'), d.id).toBe(gainsAp);
    }
  });

  it('모든 장신구 설명이 강화했을 때 무엇이 달라지는지 밝힌다', () => {
    for (const d of EQUIPS.values()) if (d.slot === 'trinket') expect(d.desc.includes('강화'), d.id).toBe(true);
  });
});

// ───────────── 스모크: 모든 아이템을 한 번씩 ─────────────

describe('스모크', () => {
  it('모든 유물: 얻고 전투를 끝까지 치를 수 있다', () => {
    for (const d of RELICS.values()) {
      const run = sturdyRun();
      gainRelic(run, d.id);
      expect(run.relics.some((r) => r.id === d.id)).toBe(true);
      const c = startCombat(run, MULTI);
      expect(playOut(c), d.id).toBe('victory');
      expect(finishCombat(run), d.id).not.toBeNull();
    }
  }, 60_000);

  it('모든 소모품: 쓸 수 있는 곳에서 쓰면 무언가 바뀐다', () => {
    for (const d of CONSUMABLES.values()) {
      // 전투 중
      const run = sturdyRun();
      run.player.hp = 100;
      run.player.sanity = 50;
      run.light = 20;
      run.consumables = [d.id, null, null];
      const c = startCombat(run, MULTI);
      for (const e of c.alive) c.apply(e, 'poison', 2, c.p);
      c.s.ammo = 0;
      const snap = () => JSON.stringify({ p: c.p, e: c.s.enemies, ap: c.s.ap, ammo: c.s.ammo, light: run.light });
      const before = snap();
      expect(c.useConsumable(0, c.alive[c.alive.length - 1].uid), d.id).toBeNull();
      expect(run.consumables[0], d.id).toBeNull();
      expect(snap(), `${d.id}: 전투 중 효과 없음`).not.toBe(before);
      expect(playOut(c), d.id).toBe('victory');
      // 전투 밖 (전투 전용이 아니면)
      if (!d.combat) {
        const r2 = sturdyRun();
        r2.player.hp = 10;
        r2.player.sanity = 10;
        r2.light = 10;
        const b2 = JSON.stringify({ p: r2.player, light: r2.light });
        d.use(r2, null, null);
        expect(JSON.stringify({ p: r2.player, light: r2.light }), `${d.id}: 전투 밖 효과 없음`).not.toBe(b2);
      }
    }
  }, 30_000);

  it('모든 장비: +0/+1/+2 기본기를 쓸 수 있고, 강화마다 수치가 달라진다', () => {
    for (const d of EQUIPS.values()) {
      const slot: EquipSlot = d.slot === 'trinket' ? 'trinket2' : d.slot;
      const descs: string[] = [];
      for (const lvl of [0, 1, 2]) {
        const run = sturdyRun();
        equip(run, slot, d.id, lvl);
        const c = startCombat(run, MULTI);
        if (d.skill) {
          const def = SKILLS.get(d.skill)!;
          const text = plain(skillDesc(def, lvl));
          expect(text.includes('{'), `${d.skill}: ${text}`).toBe(false);
          descs.push(text);
          const ref = slot as 'weapon' | 'armor';
          expect(c.blockReason(ref), `${d.id} +${lvl}`).toBeNull();
          const t = def.target === 'single' ? c.validTargets(def)[0].uid : null;
          expect(c.useSkill(ref, t), `${d.id} +${lvl}`).toBeNull();
        }
        expect(playOut(c), `${d.id} +${lvl}`).toBe('victory');
      }
      if (d.skill) expect(new Set(descs).size, `${d.id}: 강화해도 기본기가 그대로`).toBe(3);
    }
  }, 60_000);

  it('모든 각인: 맞는 스킬에 새기고 그 스킬을 쓸 수 있다', () => {
    const learnable = [...SKILLS.values()].filter((s) => s.pool !== false && s.school !== 'essence' && !s.canUse);
    for (const r of RUNES.values()) {
      const def = learnable.find((s) => (!r.fits || r.fits(s)) && s.target !== 'self' && s.tags.includes('attack')) ?? learnable.find((s) => !r.fits || r.fits(s));
      expect(def, `${r.id}: 새길 스킬이 없다`).toBeTruthy();
      const run = sturdyRun();
      const s = teach(run, def!.id);
      run.runes.push(r.id);
      expect(socketRune(run, s.uid, run.runes.indexOf(r.id)), `${r.id} → ${def!.id}`).toBe(true);
      expect(s.runes).toEqual([r.id]);
      const c = startCombat(run, MULTI);
      c.s.ap = 10;
      const t = def!.target === 'single' ? c.validTargets(def!)[0].uid : null;
      expect(c.useSkill(s.uid, t), `${r.id} → ${def!.id}`).toBeNull();
      expect(playOut(c), r.id).toBe('victory');
    }
  }, 30_000);

  it('각인이 맞지 않는 스킬에는 새겨지지 않는다', () => {
    const run = sturdyRun();
    const s = teach(run, 'x-miasma'); // 공격이 아닌 스킬
    run.runes.push('leech');
    expect(socketRune(run, s.uid, 0)).toBe(false);
    expect(run.runes).toEqual(['leech']);
  });

  it('인장 각인은 인장 폭발 스킬에 새길 수 없다 (새겨도 아무 효과가 없었다)', () => {
    const rune = RUNES.get('mark-rune')!;
    for (const s of SKILLS.values()) if (s.tags.includes('detonate')) expect(rune.fits!(s), s.id).toBe(false);
    expect(rune.fits!(SKILLS.get('x-arcane-volley')!)).toBe(true);
  });

  it('모든 광기·각성: 얻고 전투를 끝까지 치를 수 있다', () => {
    for (const m of MADNESS.values()) {
      const run = sturdyRun();
      run.madness = [m.id];
      m.onGain?.(run);
      const c = startCombat(run, MULTI);
      expect(playOut(c), m.id).toBe('victory');
    }
  }, 30_000);

  it('공용 전장 규칙: 그 규칙 아래에서 전투를 끝까지 치를 수 있다', () => {
    for (const a of ANOMALIES.values()) {
      if (!/^(rule-|x-rule-)/.test(a.id)) continue;
      const run = sturdyRun();
      const c = startCombat(run, MULTI, { anomaly: a.id });
      expect(playOut(c), a.id).toBe('victory');
    }
  }, 30_000);

  it('공용 상태: 나와 적에게 걸고 몇 턴을 넘겨도 문제없다', () => {
    const ids = [...STATUSES.keys()].filter((id) => !/^a\d-/.test(id) && id !== 'dying');
    for (const id of ids) {
      const run = sturdyRun();
      const c = startCombat(run, MULTI);
      c.apply(c.p, id, 2, c.p);
      for (const e of c.alive) c.apply(e, id, 2, c.p);
      for (let i = 0; i < 3 && !c.over; i++) c.endTurn();
      expect(c.s.phase === 'player' || c.over, id).toBe(true);
    }
  });

  it('extra 이벤트: 모든 선택지를 고를 수 있다', () => {
    const ids = [...EVENTS.keys()].filter((id) => id.startsWith('x-'));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const n = eventView(Object.assign(sturdyRun(), { event: { id, stage: 'start', vars: {}, result: null, done: false } }))!.choices.length;
      for (let i = 0; i < n; i++) {
        for (const seed of [1, 2, 3]) {
          const run = sturdyRun(seed);
          run.player.gold = 500;
          run.bag.push({ uid: 'bag-1', id: 'saber', lvl: 0 });
          gainRelic(run, 'tin-soldier');
          startEvent(run, id);
          const ch = eventView(run)!.choices[i];
          if (ch.disabled) continue;
          expect(chooseEvent(run, i), `${id}#${i}`).toBeNull();
          expect(run.event?.done, `${id}#${i}`).toBe(true);
          leaveEvent(run);
          if (run.screen === 'combat') {
            const c = new Combat(run);
            expect(playOut(c), `${id}#${i}`).toBe('victory');
          }
        }
      }
    }
  });

  it('유물 맞바꾸기(얼굴 없는 상인)는 잃은 유물과 다른, 더 귀하거나 같은 등급의 유물을 준다', () => {
    const order = ['common', 'uncommon', 'rare'];
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = sturdyRun(seed);
      gainRelic(run, 'tin-soldier');
      startEvent(run, 'x-faceless-merchant');
      expect(chooseEvent(run, 0)).toBeNull();
      const got = run.event!.loot?.[0];
      expect(run.relics.some((r) => r.id === 'tin-soldier')).toBe(false);
      if (got) {
        expect(got.id).not.toBe('tin-soldier');
        expect(order.indexOf(RELICS.get(got.id)!.rarity)).toBeGreaterThan(order.indexOf('common'));
      }
    }
  });
});

/** 조우 목록에 테스트가 쓰는 조우가 있는지 */
it('테스트용 조우가 존재한다', () => {
  for (const id of ['a1-thug', MULTI]) expect(ENCOUNTERS.some((e) => e.id === id), id).toBe(true);
});
