import { describe, expect, it } from 'vitest';
import { icons } from '@iconify-json/game-icons';
import '../src/content';
import type { Combat } from '../src/engine/combat';
import { ESSENCES, RELICS, RUNES, SKILLS, STATUSES } from '../src/engine/registry';
import { gainRelic, learnSkill, newRun, ownedSchools, rollForbidden, rollSkills, startCombat, type RunState } from '../src/engine/run';
import { isBridge } from '../src/engine/keywords';
import { openShop } from '../src/engine/shop';
import type { School, SkillDef } from '../src/engine/types';
import { codexSkills } from '../src/state/meta';
import { autoTurn } from '../src/sim/bot';

const SCHOOLS: School[] = ['blade', 'firearm', 'occult', 'alchemy', 'resolve', 'forbidden'];
/** 예전 합기 15종 — 이제 조건 없이 각자 계열 풀로 내려간 '계열을 잇는' 스킬 (두 계열 짝은 SkillDef.duo에 남았다) */
const DUOS = [...SKILLS.values()].filter((d) => d.duo);
const PAIR = (id: string) => SKILLS.get(id)!.duo!;
const duo = (id: string) => SKILLS.get(id)!;

/** 합기 하나만 든 깨끗한 주인공으로 「깡패(전열) + 입문자 둘(후열)」 전투 (유물·장비·약점·저항·층의 법칙 없음) */
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
/** 이번 사용에서 적에게 들어간 피해 이벤트 */
const hits = (c: Combat) => c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt !== 'p');
const total = (c: Combat) => hits(c).reduce((s, h) => s + h.amount, 0);

/** 판의 스킬을 이것들로 바꾼다 */
function withSkills(ids: string[], origin = 'soldier'): RunState {
  const run = newRun({ seed: 3, origin });
  run.skills = ids.map((id, i) => ({ uid: `s${i}`, id, lvl: 0, runes: [] }));
  run.slots = run.skills.map((s) => s.uid);
  return run;
}

describe('예전 합기: 정의', () => {
  it('6계열의 모든 짝마다 하나씩, 15종이 남아 있다 (계열 판정은 두 계열로)', () => {
    expect(DUOS.length).toBe(15);
    const pairs = new Set(DUOS.map((d) => [...d.duo!].sort().join('+')));
    expect(pairs.size).toBe(15);
    for (let i = 0; i < SCHOOLS.length; i++) for (let j = i + 1; j < SCHOOLS.length; j++) expect(pairs.has([SCHOOLS[i], SCHOOLS[j]].sort().join('+')), `${SCHOOLS[i]}×${SCHOOLS[j]}`).toBe(true);
  });

  it('합기 조건은 사라졌다: 계열은 짝 중 하나, 등급은 그 계열 풀의 고급·희귀(금기 계열은 금기)', () => {
    for (const d of DUOS) {
      expect(PAIR(d.id).includes(d.school), d.id).toBe(true);
      if (d.school === 'forbidden') expect(d.rarity, d.id).toBe('forbidden');
      else expect(['uncommon', 'rare'], d.id).toContain(d.rarity);
      expect(d.pool, d.id).not.toBe(false);
      expect(d.icon.startsWith('gi:') && !!icons.icons[d.icon.slice(3)], `${d.id}: ${d.icon}`).toBe(true);
      for (const m of d.desc.matchAll(/\{(?:[DB]:)?([a-zA-Z]+)\}/g)) expect(d.vals[m[1]] !== undefined, `${d.id}: ${m[1]}`).toBe(true);
    }
  });

  it('남의 계열을 읽거나(글루) 남의 계열 키워드를 만든다 (2차 생산)', () => {
    for (const d of DUOS) expect(isBridge(d) || (d.makes ?? []).length > 0, d.id).toBe(true);
    // 대부분은 남의 키워드를 읽는 글루다
    expect(DUOS.filter(isBridge).length).toBeGreaterThanOrEqual(11);
  });

  it('도감의 스킬 목록에 들어간다', () => {
    const ids = new Set(codexSkills().map((d) => d.id));
    for (const d of DUOS) expect(ids.has(d.id), d.id).toBe(true);
  });

  it('행동력을 주거나 재사용 대기를 되돌리지 않는다', () => {
    for (const d of DUOS) {
      expect(d.tags.includes('energy') || d.tags.includes('refresh'), d.id).toBe(false);
      expect(/s\.ap\s*\+=|s\.cd\[|delete c\.s\.cd/.test(d.run.toString()), d.id).toBe(false);
      expect(Math.min(...[d.cd].flat()), d.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('예전 합기: 효과', () => {
  it('총검 난무 (검술×사격): 앞서 쓴 스킬 수만큼 탄약으로 쏘고, 첫 발에 조준이 실린다', () => {
    const c = arena('duo-bayonet');
    c.s.used = 2;
    c.p.st.aim = 1;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(total(c)).toBe(7 + 5 * 2 + 5);
    expect(c.s.ammo).toBe(4);
    expect(c.p.st.aim ?? 0).toBe(0);
    // 최대 3발, 탄약이 없으면 베기만
    const d = arena('duo-bayonet');
    d.s.used = 6;
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(total(d)).toBe(7 + 5 * 3);
    const e = arena('duo-bayonet');
    e.s.used = 3;
    e.s.ammo = 0;
    expect(e.useSkill('sk', front(e).uid)).toBeNull();
    expect(total(e)).toBe(7);
  });

  it('혈인 (검술×비술): 출혈만큼 인장을 새기고 비전으로 두 번 벤다 (출혈은 남는다)', () => {
    const c = arena('duo-blood-sigil');
    const t = front(c);
    t.st.bleed = 4;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(2 * (4 + 4));
    expect(t.st.mark).toBe(4);
    expect(t.st.bleed).toBe(4);
  });

  it('독혈 베기 (검술×연금): 출혈을 더한 뒤 출혈만큼 독', () => {
    const c = arena('duo-venom-blood');
    const t = front(c);
    t.st.bleed = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(6);
    expect(t.st.bleed).toBe(5);
    expect(t.st.poison).toBe(5);
  });

  it('피의 응수 (검술×결의): 방어도로 막은 공격의 절반만큼 공격자에게 출혈, 다음 내 턴에 사라지고 겹쳐 커지지 않는다', () => {
    const c = arena('duo-blood-riposte');
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.block).toBe(7);
    expect(c.p.st['duo-blood-riposte']).toBe(50);
    // 다시 써도 50%에 머문다
    delete c.s.cd.sk;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st['duo-blood-riposte']).toBe(50);
    const e = front(c);
    c.p.block = 8;
    c.damage({ src: e, tgt: c.p, base: 12, type: 'blunt', attack: true });
    expect(e.st.bleed).toBe(4);
    // 방어도가 없으면 막은 것이 없다
    const e2 = c.row(1)[0];
    c.damage({ src: e2, tgt: c.p, base: 5, type: 'blunt', attack: true });
    expect(e2.st.bleed ?? 0).toBe(0);
    c.endTurn();
    expect(c.s.phase).toBe('player');
    expect(c.p.st['duo-blood-riposte'] ?? 0).toBe(0);
  });

  it('피의 제물 (검술×금기): 정신력을 바치고, 출혈 × 3만큼 파멸', () => {
    const c = arena('duo-blood-offering');
    const t = front(c);
    t.st.bleed = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(6);
    expect(t.st.bleed).toBe(5);
    expect(t.st.doom).toBe(15);
    expect(c.p.sanity).toBe(97);
  });

  it('인장탄 (사격×비술): 인장 1개당 한 발 쏘고 인장을 터뜨린다', () => {
    const c = arena('duo-sigil-round');
    const t = front(c);
    t.st.mark = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    const hs = hits(c);
    expect(hs.filter((h) => h.dtype === 'pierce').map((h) => h.amount)).toEqual([5, 5, 5]);
    expect(hs.filter((h) => h.dtype === 'arcane').map((h) => h.amount)).toEqual([9]);
    expect(t.st.mark ?? 0).toBe(0);
    expect(c.s.ammo).toBe(3);
    // 인장이 없어도 한 발, 탄약이 없으면 못 쓴다
    const d = arena('duo-sigil-round');
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(total(d)).toBe(5);
    const e = arena('duo-sigil-round');
    e.s.ammo = 0;
    expect(e.blockReason('sk')).toBe('탄약 부족');
  });

  it('신경독탄 (사격×연금): 독을 묻히고, 대상의 독 3당 버팀을 1 더 깎는다 (최대 4)', () => {
    const c = arena('duo-neurotoxin');
    const t = front(c);
    t.st.poison = 6;
    t.poise = t.maxPoise = 10;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    // 버팀이 남은 적이라 피해 7이 절반으로 (GUARD.mult)
    expect(total(c)).toBe(3);
    expect(t.st.poison).toBe(9);
    expect(t.poise).toBe(7);
    expect(c.s.ammo).toBe(5);
    const d = arena('duo-neurotoxin');
    const u = front(d);
    u.st.poison = 30;
    u.poise = u.maxPoise = 10;
    expect(d.useSkill('sk', u.uid)).toBeNull();
    expect(u.poise).toBe(6);
  });

  it('엄폐 저격 (사격×결의): 방어도를 얻고, 방어도의 60%를 실어 쏜다 (방어도는 그대로)', () => {
    const c = arena('duo-cover-snipe');
    c.p.block = 15;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(c.p.block).toBe(20);
    expect(total(c)).toBe(5 + 12);
    expect(c.s.ammo).toBe(5);
    // 조준이 실리면 두 배
    const d = arena('duo-cover-snipe');
    d.p.block = 15;
    d.p.st.aim = 1;
    expect(d.useSkill('sk', front(d).uid)).toBeNull();
    expect(total(d)).toBe((5 + 12) * 2);
  });

  it('광인의 조준 (사격×금기): 행동력 없이 재장전하고, 잃은 정신력 20마다 조준 +1 (최대 3)', () => {
    const c = arena('duo-mad-aim');
    c.p.sanity = 60;
    c.s.ammo = 2;
    const ap = c.s.ap;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.s.ap).toBe(ap);
    expect(c.p.sanity).toBe(55);
    expect(c.s.ammo).toBe(6);
    expect(c.p.st.aim).toBe(3);
    const d = arena('duo-mad-aim');
    expect(d.useSkill('sk')).toBeNull();
    expect(d.p.st.aim).toBe(1);
  });

  it('연성진 (비술×연금): 독·화상의 절반만큼 인장을 새기고 모두를 비전으로 친다', () => {
    const c = arena('duo-transmute-circle');
    const t = front(c);
    t.st.poison = 4;
    t.st.burn = 2;
    expect(c.useSkill('sk')).toBeNull();
    const hs = hits(c);
    expect(hs.find((h) => h.tgt === t.uid)?.amount).toBe(4 + 3);
    expect(hs.filter((h) => h.tgt !== t.uid).map((h) => h.amount)).toEqual([4, 4]);
    expect(t.st.mark).toBe(3);
    expect(c.row(1).every((e) => !e.st.mark)).toBe(true);
  });

  it('인장 방벽 (비술×결의): 인장을 터뜨리고 터뜨린 인장만큼 방어도', () => {
    const c = arena('duo-sigil-bulwark');
    const t = front(c);
    t.st.mark = 3;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(5 + 3 * 4);
    expect(c.p.block).toBe(4 + 3 * 3);
    expect(t.st.mark ?? 0).toBe(0);
  });

  it('심연의 낙인 (비술×금기): 인장 1개당 방어도를 무시하는 공허 피해 1회, 인장은 남는다', () => {
    const c = arena('duo-abyss-brand');
    const t = front(c);
    t.st.mark = 3;
    t.block = 10;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.hp).toBe(999 - 15);
    expect(t.block).toBe(10);
    expect(t.st.mark).toBe(3);
    expect(c.p.sanity).toBe(97);
  });

  it('독 바른 방패 (연금×결의): 방어도를 얻고, 방어도의 40%만큼 독', () => {
    const c = arena('duo-venom-shield');
    c.p.block = 15;
    const t = front(c);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(c.p.block).toBe(20);
    expect(total(c)).toBe(5);
    expect(t.st.poison).toBe(8);
  });

  it('역병 촉수 (연금×금기): 적 전체에 독, 촉수에 맞은 적은 독 — 다시 써도 촉수의 독 수치는 겹치지 않는다', () => {
    const c = arena('duo-plague-tentacle');
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.sanity).toBe(96);
    expect(c.alive.map((e) => e.st.poison)).toEqual([2, 2, 2]);
    expect(c.p.st.tentacle).toBe(1);
    expect(c.p.st['duo-plague']).toBe(2);
    delete c.s.cd.sk;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.tentacle).toBe(2);
    expect(c.p.st['duo-plague']).toBe(2);
    const before = c.alive.reduce((s, e) => s + (e.st.poison ?? 0), 0);
    STATUSES.get('tentacle')!.tickEnd!(c, c.p, 2);
    expect(c.alive.reduce((s, e) => s + (e.st.poison ?? 0), 0) - before).toBe(4);
  });

  it('광신의 방패 (결의×금기): 방어도 + 잃은 정신력의 25%', () => {
    const c = arena('duo-zealot-shield');
    c.p.sanity = 60;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.sanity).toBe(58);
    expect(c.p.block).toBe(6 + 10);
  });

  it('강화하면 수치가 오른다', () => {
    const c = arena('duo-cover-snipe', 1);
    c.p.block = 14;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(c.p.block).toBe(20);
    expect(total(c)).toBe(6 + 16);
  });
});

describe('예전 합기: 조건 없이 각자 계열 풀에', () => {
  it('가진 계열은 기본 공격·정수 기술·공용 스킬을 세지 않는다', () => {
    const essSkill = [...ESSENCES.values()][0].actives[0];
    expect(SKILLS.get(essSkill)!.school).toBe('essence');
    const run = withSkills(['aimed-shot', 'w-saber', essSkill, 'shove', 'duo-bayonet']);
    expect([...ownedSchools(run)].sort()).toEqual(['blade', 'firearm']);
  });

  it('두 계열의 스킬을 갖고 있지 않아도 보상·상점에 나온다 (금기 계열은 빼고), 이미 배운 것은 다시 나오지 않는다', () => {
    // 사격 스킬만 가진 판에도 검술·비술·연금·결의 쪽 예전 합기가 나온다
    const run = withSkills(['aimed-shot']);
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) {
      run.rng.loot = i * 7919 + 1;
      for (const id of rollSkills(run, 3, i % 2 ? 'elite' : 'boss')) if (SKILLS.get(id)?.duo) seen.add(id);
    }
    const normal = DUOS.filter((d) => d.school !== 'forbidden').map((d) => d.id);
    for (const id of normal) expect(seen.has(id), id).toBe(true);
    for (const d of DUOS.filter((x) => x.school === 'forbidden')) expect(seen.has(d.id), d.id).toBe(false);
    run.skills.push({ uid: 'd', id: 'duo-cover-snipe', lvl: 0, runes: [] });
    for (let i = 0; i < 200; i++) {
      run.rng.loot = i * 104729 + 5;
      expect(rollSkills(run, 3, 'elite')).not.toContain('duo-cover-snipe');
    }
  });

  it('금기 계열의 예전 합기(피의 제물·심연의 낙인·역병 촉수)는 금기 스킬을 가진 판의 보통 보상에서 나오고, 금기의 길로는 나오지 않는다', () => {
    const run = withSkills(['aimed-shot', 'whisper-void']);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      run.rng.loot = i * 7919 + 3;
      for (const id of rollSkills(run, 3, 'elite')) seen.add(id);
      for (const id of rollForbidden(run, 3)) expect(SKILLS.get(id)!.duo, id).toBeUndefined();
    }
    for (const d of DUOS.filter((x) => x.school === 'forbidden')) expect(seen.has(d.id), d.id).toBe(true);
  });

  it('상점에도 나온다', () => {
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const run = newRun({ seed: 500 + i, origin: 'soldier' });
      openShop(run, 'merchant', 1);
      found = run.shop!.items.some((it) => it.kind === 'skill' && !!SKILLS.get(it.id)?.duo);
    }
    expect(found).toBe(true);
  });
});

/** 합기마다 그 합기가 거둘 상태를 쌓는 덱 (출신 시작 스킬 + 짝 계열 스킬 하나) */
const DECKS: Record<string, [string, string[]]> = {
  'duo-bayonet': ['soldier', ['quick-cut']],
  'duo-blood-sigil': ['hunter', ['sigil']],
  'duo-venom-blood': ['hunter', []],
  // 틈(2026-10) 뒤로 방패 강타가 사격 틈을 거둬 방어도를 채우므로, 톱날 베기 덱에서는 봇이 피의 응수를 쓸 일이 없어졌다 (검술은 마무리 일격으로)
  'duo-blood-riposte': ['soldier', ['finisher']],
  'duo-blood-offering': ['hunter', ['whisper-void']],
  'duo-sigil-round': ['soldier', ['sigil']],
  'duo-neurotoxin': ['soldier', ['poison-dart']],
  'duo-cover-snipe': ['soldier', []],
  'duo-mad-aim': ['soldier', ['whisper-void']],
  'duo-transmute-circle': ['occultist', ['poison-dart']],
  'duo-sigil-bulwark': ['occultist', ['steady']],
  'duo-abyss-brand': ['occultist', []],
  'duo-venom-shield': ['hunter', ['steady']],
  'duo-plague-tentacle': ['hunter', ['whisper-void']],
  'duo-zealot-shield': ['soldier', ['whisper-void']],
};

describe('예전 합기: 봇', () => {
  it('덱이 다 있다', () => {
    expect(Object.keys(DECKS).sort()).toEqual(DUOS.map((d) => d.id).sort());
  });

  for (const [id, [origin, extra]] of Object.entries(DECKS)) {
    it(`${SKILLS.get(id)?.name ?? id}: 봇이 쓰고 1층 전투를 이긴다`, () => {
      const run = newRun({ seed: 77, origin });
      for (const x of [...extra, id]) learnSkill(run, x);
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

describe('예전 합기: 무한 고리 없음', () => {
  const LIMIT = 12;
  /** 한 턴에 몇 번 쓸 수 있는가 (적은 죽지 않게) */
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
      e.st.bleed = 6;
      e.st.poison = 6;
      e.st.mark = 6;
    }
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

  it('합기 × 강화 × 각인: 한 턴에 끝없이 쓰지 못한다', () => {
    // 탐지가 헛돌지 않는지: 각인 없이는 모두 한 번씩 쓸 수 있다
    for (const d of DUOS) expect(usesInOneTurn([{ id: d.id, lvl: 0 }]), d.id).toBe(1);
    const bad: string[] = [];
    for (const d of DUOS) {
      for (const lvl of levels(d)) {
        const runes = [null, ...[...RUNES.values()].filter((r) => !r.fits || r.fits(d)).map((r) => r.id)];
        for (const rune of runes) if (usesInOneTurn([{ id: d.id, lvl, rune }]) > LIMIT) bad.push(`${d.id} +${lvl} ${rune ?? ''}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 60_000);

  it('합기 × 유물: 한 턴에 끝없이 쓰지 못한다', () => {
    const bad: string[] = [];
    for (const d of DUOS) for (const relic of RELICS.keys()) if (usesInOneTurn([{ id: d.id, lvl: 1 }], relic) > LIMIT) bad.push(`${d.id} 유물 ${relic}`);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120_000);

  it('합기 15종을 한꺼번에 들고 행동력이 넉넉해도 각자 한 번씩만', () => {
    const n = usesInOneTurn(DUOS.map((d) => ({ id: d.id, lvl: 1 })), null, 60);
    expect(n).toBe(DUOS.length);
  });

  it('피의 응수·역병 촉수가 반격·가시와 맞물려도 한 번의 공격이 끝난다', () => {
    const c = arena('duo-blood-riposte');
    expect(c.useSkill('sk')).toBeNull();
    c.p.st.thorns = 5;
    c.p.st.counter = 5;
    c.p.st.tentacle = 2;
    c.p.st['duo-plague'] = 3;
    c.p.block = 50;
    const e = front(c);
    e.st.spikes = 3;
    e.st.counter = 3;
    c.drain();
    c.damage({ src: e, tgt: c.p, base: 8, type: 'blunt', attack: true, melee: true });
    const n = c.drain().filter((ev) => ev.t === 'dmg').length;
    expect(n).toBeLessThan(40);
    expect(c.over).toBe(false);
    // 턴을 넘겨도 멈춘다
    expect(c.endTurn()).toBeNull();
    expect(c.s.phase).toBe('player');
  });
});
