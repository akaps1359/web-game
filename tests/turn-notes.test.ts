import { describe, expect, it } from 'vitest';
import '../src/content';
import type { Combat } from '../src/engine/combat';
import { ESSENCES, EQUIPS, MADNESS, RELICS } from '../src/engine/registry';
import { newRun, startCombat, type RunState } from '../src/engine/run';
import type { EquipSlot, Hooks, TurnNote } from '../src/engine/types';
import { plain, skillDesc } from '../src/ui/text';
import { PRISM, PRISM_KEY, prismType } from '../src/content/extra/arsenal';

/*
 * 턴마다 바뀌는 효과가 지금 무엇인지 보인다 (2026-10 피드백 — "굴절광처럼 턴마다 바뀌는 것, 지금 무슨 효과인지 표시"):
 *  - SkillDef.typeNow: 쓰는 순간의 속성 → 카드·피해 미리보기·설명이 이번 턴의 속성을 쓴다
 *  - Hooks.turnNote: 내 상태 칸 앞의 칩 — N턴마다 이루어지는 효과는 '이번 턴'/'k턴 뒤', 홀짝이 번갈아 드는 것은 지금 켜진 쪽
 */

/** 깨끗한 싸움터 (유물·광기·층의 법칙 없음) — setup으로 장비·정수·광기를 쥐여 준다 */
function fight(setup: (run: RunState) => void = () => {}): Combat {
  const run = newRun({ seed: 77, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.madness = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  run.player.sanity = run.player.maxSanity = 999;
  setup(run);
  const c = startCombat(run, 'a1-cult', { anomaly: null });
  c.snapshots = false;
  c.drain();
  return c;
}

const gear = (run: RunState, slot: EquipSlot, id: string) => (run.equip[slot] = { uid: `t-${slot}`, id, lvl: 0 });

/** 화면이 모으는 것과 같이 (ui/screens/Combat.tsx turnNotes) */
function notes(c: Combat): TurnNote[] {
  const out: TurnNote[] = [];
  for (const [h, self] of c.sources(c.p)) {
    const n = h.turnNote?.(c, self);
    if (n) out.push(n);
  }
  return out;
}
const note = (c: Combat, title: string) => notes(c).find((n) => n.title === title);

/** 적이 아무것도 하지 못하게 하고 다음 내 턴으로 */
function next(c: Combat) {
  for (const e of c.alive) e.st.stun = 1;
  c.endTurn();
  c.drain();
}

describe('굴절광: 이번 턴의 속성이 카드·미리보기·설명에', () => {
  it('쓰는 순간의 속성(SkillUse.type)이 이번 턴의 굴절이고, 턴마다 바뀐다', () => {
    const c = fight((r) => gear(r, 'weapon', 'ar-prism'));
    c.s.vars[PRISM_KEY] = 0;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const u = c.makeUse(c.skillInfo('weapon')!);
      expect(u.type).toBe(prismType(c));
      seen.push(u.type!);
      next(c);
    }
    expect(seen).toEqual(PRISM.slice(0, 4));
  });

  it('미리보기가 이번 턴의 속성으로 약점을 센다 (예전엔 속성 없는 공격으로 보여 약점 보너스가 빠졌다)', () => {
    const c = fight((r) => gear(r, 'weapon', 'ar-prism'));
    const e = c.alive[0];
    e.maxPoise = e.poise = 0;
    const info = c.skillInfo('weapon')!;
    const shown = () => Number(plain(skillDesc(info.def, info.owned.lvl, { c, target: e, use: c.makeUse(info) })).match(/\d+/)![0]);
    e.weak = [];
    const plainDmg = shown();
    e.weak = [prismType(c)];
    e.known = [...e.weak];
    expect(shown()).toBeGreaterThan(plainDmg);
  });
});

describe('턴마다 바뀌는 효과의 칩 (Hooks.turnNote)', () => {
  it('멈춘 회중시계: 3의 배수 턴에는 「이번 턴」, 아니면 「k턴 뒤」', () => {
    const c = fight((r) => gear(r, 'trinket1', 'pocket-watch'));
    expect(c.s.turn).toBe(1);
    expect(note(c, '멈춘 회중시계')).toMatchObject({ text: '2턴 뒤', now: false });
    next(c);
    expect(note(c, '멈춘 회중시계')).toMatchObject({ text: '1턴 뒤', now: false });
    next(c);
    expect(note(c, '멈춘 회중시계')).toMatchObject({ text: '이번 턴', now: true });
    next(c);
    expect(note(c, '멈춘 회중시계')!.text).toBe('2턴 뒤');
  });

  it('환청(광기)은 나쁜 칩이다', () => {
    const c = fight((r) => {
      r.madness = ['voices'];
    });
    const n = note(c, '환청')!;
    expect(n.bad).toBe(true);
    expect(n.text).toBe('2턴 뒤');
  });

  it('날아다니는 폴립의 정수: 1·4·7번째 턴', () => {
    const c = fight((r) => {
      r.essences = [{ uid: 'e1', id: 'flying-polyp', color: 0 }];
    });
    expect(note(c, '보이지 않는 몸')).toMatchObject({ text: '이번 턴', now: true });
    next(c);
    expect(note(c, '보이지 않는 몸')!.text).toBe('2턴 뒤');
  });

  it('문턱의 걸음(정수): 홀수 턴엔 물리, 짝수 턴엔 원소가 켜진다 — 수호자 정수는 +40%', () => {
    const c = fight((r) => {
      r.essences = [{ uid: 'e1', id: 'liminal', color: 0, guardian: true }];
    });
    expect(note(c, '문턱의 걸음')).toMatchObject({ text: '물리 +40%', now: true });
    next(c);
    expect(note(c, '문턱의 걸음')!.text).toBe('원소 +40%');
  });

  it('턴에 따라 이루어지는 효과(3의 배수 턴·홀짝 턴·N번째 턴)를 설명하는 정수·장비·광기·유물은 모두 칩을 낸다', () => {
    const turnish = /3의 배수 턴|홀수 턴|짝수 턴|1·4·7/;
    const missing: string[] = [];
    const check = (id: string, desc: string, hooks?: Hooks) => {
      if (turnish.test(desc) && !hooks?.turnNote) missing.push(id);
    };
    for (const d of ESSENCES.values()) check(d.id, d.passive.desc, d.passive.hooks);
    for (const d of EQUIPS.values()) check(d.id, d.desc, d.hooks);
    for (const d of MADNESS.values()) check(d.id, d.desc, d.hooks);
    for (const d of RELICS.values()) check(d.id, d.desc, d.hooks);
    expect(missing).toEqual([]);
  });

  it('칩은 상태를 바꾸지 않는다 (화면이 그릴 때마다 불러도 판이 그대로)', () => {
    const c = fight((r) => {
      gear(r, 'weapon', 'ar-prism');
      gear(r, 'trinket1', 'pocket-watch');
      r.madness = ['voices'];
      r.essences = [{ uid: 'e1', id: 'liminal', color: 0, guardian: true }];
    });
    const before = JSON.stringify(c.s);
    notes(c);
    notes(c);
    c.makeUse(c.skillInfo('weapon')!);
    expect(JSON.stringify(c.s)).toBe(before);
  });
});
