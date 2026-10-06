import { describe, expect, it } from 'vitest';
import { icons as ICON_SET } from '@iconify-json/game-icons';
import '../src/content';
import { Combat, lvlVal } from '../src/engine/combat';
import { ENCOUNTERS, EQUIPS, RELICS, RUNES, SKILLS, STATUSES } from '../src/engine/registry';
import {
  GENESIS,
  chooseLoot,
  equipFromBag,
  finishCombat,
  gainEquip,
  gainRelic,
  isGenesisLoot,
  newRun,
  rollChoice,
  rollEquip,
  rollForbidden,
  rollGenesis,
  rollSkills,
  startCombat,
  takeLoot,
  type LootItem,
  type RunState,
} from '../src/engine/run';
import { openShop } from '../src/engine/shop';
import { RARITY_NAME, plain, skillDesc } from '../src/ui/text';
import type { DmgType, EquipSlot, SkillDef } from '../src/engine/types';
import { DIAL } from '../src/content/genesis';

/**
 * 창세 등급 (content/genesis.ts): 9개 아이템의 효과가 설명대로인지, 한 턴에 끝없이 쓰는 고리가 없는지,
 * 상점·보통 보상에 나오지 않고 계층군주 보상에 나오는지, 판마다 하나뿐인지, 저장·불러오기 뒤에도 그대로인지.
 */

const SKILL_IDS = ['g-gaebyeok', 'g-sunfall', 'g-elder-sign', 'g-homunculus', 'g-sky-pillar', 'g-before-genesis'];
const EQUIP_IDS = ['g-tablet', 'g-egg', 'g-sundial'];
const ICONS = new Set(Object.keys(ICON_SET.icons));

const v = (id: string, key: string, lvl = 0) => lvlVal(SKILLS.get(id)!.vals[key] as number | number[], lvl);

type Piece = { id: string; lvl?: number; runes?: string[] };

/**
 * 깨끗한 싸움터: 주어진 스킬만 끼우고, 장비·유물·층의 법칙을 걷어 내고, 적은 체력 999에 약점·저항·버팀이 없다 (피해를 그대로 잰다).
 * keepWeak: 적의 약점·버팀을 남긴다
 */
function arena(skills: Piece[], o: { enc?: string; equip?: Partial<Record<EquipSlot, { id: string; lvl?: number }>>; keepWeak?: boolean; origin?: string } = {}): Combat {
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
    e.resist = {};
    e.st = {};
    if (!o.keepWeak) {
      e.weak = [];
      e.maxPoise = e.poise = 0;
    }
  }
  c.drain();
  return c;
}

/** 적들이 이번 차례에 아무것도 하지 못하게 (턴을 넘기며 내 쪽 효과만 볼 때) */
function stunAll(c: Combat) {
  for (const e of c.alive) e.st.stun = 1;
}

/** 이번 사용에서 나온 피해 이벤트 */
function dmgEvents(c: Combat) {
  return c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg');
}

/** 전투를 그 자리에서 이긴다 (부활·변신하는 적은 다시 쓰러뜨린다) */
function winNow(c: Combat) {
  for (let i = 0; i < 40 && !c.over; i++) {
    for (const e of [...c.alive]) c.kill(e);
    // 승리 판정은 행동이 끝날 때 한다 — 턴을 넘기면 바로 이긴다
    if (!c.alive.length && c.s.phase === 'player') c.endTurn();
  }
  expect(c.s.phase).toBe('victory');
}

describe('창세: 등록', () => {
  it('장비 칸마다 하나(무기·방어구·장신구), 계열마다 스킬 하나 — 9개, 모두 창세 등급', () => {
    const skills = [...SKILLS.values()].filter((d) => d.rarity === 'genesis');
    const equips = [...EQUIPS.values()].filter((d) => d.rarity === 'genesis');
    expect(skills.map((d) => d.id).sort()).toEqual([...SKILL_IDS].sort());
    expect(equips.map((d) => d.id).sort()).toEqual([...EQUIP_IDS].sort());
    expect(skills.map((d) => d.school).sort()).toEqual(['alchemy', 'blade', 'firearm', 'forbidden', 'occult', 'resolve']);
    expect(equips.map((d) => d.slot).sort()).toEqual(['armor', 'trinket', 'weapon']);
    expect(RARITY_NAME.genesis).toBe('창세');
    // 보통 보상·상점·금기의 길에 섞이지 않게 모두 pool: false
    for (const d of skills) expect(d.pool, d.id).toBe(false);
  });

  it('아이콘은 game-icons에 있는 이름, 설명의 {키}는 vals에, 무기·방어구는 기본기가 있다', () => {
    const ids = [...SKILL_IDS, 'w-g-tablet', 'a-g-egg'];
    for (const id of ids) {
      const d = SKILLS.get(id)!;
      expect(ICONS.has(d.icon.replace(/^gi:/, '')), `${id} ${d.icon}`).toBe(true);
      for (const m of d.desc.matchAll(/\{(?:[DB]:)?([a-z]+)\}/g)) expect(d.vals[m[1]] !== undefined, `${id}: ${m[1]}`).toBe(true);
      for (const lvl of [0, 1, 2]) expect(plain(skillDesc(d, lvl)).includes('{'), id).toBe(false);
    }
    for (const id of EQUIP_IDS) expect(ICONS.has(EQUIPS.get(id)!.icon.replace(/^gi:/, '')), id).toBe(true);
    for (const id of ['g-sunset', 'g-flask', 'g-pillar', 'g-day']) expect(ICONS.has(STATUSES.get(id)!.icon.replace(/^gi:/, '')), id).toBe(true);
    expect(EQUIPS.get('g-tablet')!.skill).toBe('w-g-tablet');
    expect(EQUIPS.get('g-egg')!.skill).toBe('a-g-egg');
    expect(EQUIPS.get('g-sundial')!.desc.includes('강화')).toBe(true);
  });
});

describe('창세: 스킬 효과', () => {
  it('개벽: 전열·후열의 모든 적을 (1 + 앞서 쓴 스킬 수, 최대 max)번 베고, 체력 피해를 줄 때마다 출혈', () => {
    for (const [lvl, used, hits] of [
      [0, 0, 1],
      [0, 2, 3],
      [0, 7, 1 + v('g-gaebyeok', 'max', 0)],
      [1, 7, 1 + v('g-gaebyeok', 'max', 1)],
    ]) {
      const c = arena([{ id: 'g-gaebyeok', lvl }]);
      expect(c.row(1).length).toBeGreaterThan(0);
      c.s.used = used;
      expect(c.useSkill('s0')).toBeNull();
      for (const e of c.alive) {
        expect(999 - e.hp, `lvl ${lvl} 앞서 ${used}`).toBe(v('g-gaebyeok', 'dmg', lvl) * hits);
        expect(e.st.bleed).toBe(v('g-gaebyeok', 'bleed', lvl) * hits);
      }
    }
  });

  it('해 떨구기: 탄약을 채우고 쏜 뒤, 이번 턴 동안 탄약이 줄지 않고 관통 공격이 2배 — 턴이 끝나면 탄약이 떨어진다', () => {
    const c = arena([{ id: 'g-sunfall' }, { id: 'aimed-shot' }, { id: 'last-bullet' }], { equip: { weapon: { id: 'revolver' } }, enc: 'a1-thug' });
    const t = c.alive[0];
    c.s.ammo = 1;
    let hp = t.hp;
    expect(c.useSkill('s0', t.uid)).toBeNull();
    expect(hp - t.hp).toBe(v('g-sunfall', 'dmg')); // 해를 쏜 한 발은 그대로
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    expect(c.p.st['g-sunset']).toBe(1);
    hp = t.hp;
    expect(c.useSkill('s1', t.uid)).toBeNull();
    expect(hp - t.hp).toBe(v('aimed-shot', 'dmg') * 2);
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    hp = t.hp;
    expect(c.useSkill('s2', t.uid)).toBeNull(); // 마지막 탄창: 남은 탄 6발이 모두 치명타
    expect(hp - t.hp).toBe(c.s.maxAmmo * v('last-bullet', 'dmg') * 2);
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    hp = t.hp;
    expect(c.useSkill('weapon', t.uid)).toBeNull();
    expect(hp - t.hp).toBe(7 * 2);
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    stunAll(c);
    c.endTurn();
    expect(c.p.st['g-sunset']).toBeUndefined();
    expect(c.s.ammo).toBe(0);
    // 다음 턴의 관통 공격은 평소대로 (탄약이 없어 리볼버는 재장전만)
    hp = t.hp;
    expect(c.useSkill('weapon', t.uid)).toBeNull();
    expect(hp - t.hp).toBe(0);
    expect(c.s.ammo).toBe(c.s.maxAmmo);
    c.useSkill('weapon', t.uid);
    expect(hp - t.hp).toBe(7);
  });

  it('옛 표식: 기본 + 인장당 피해, 터뜨린 인장은 그대로 남고 더 새겨진다 (결계도 지우지 못한다)', () => {
    for (const lvl of [0, 1]) {
      const c = arena([{ id: 'g-elder-sign', lvl }]);
      const t = c.alive[0];
      t.st.mark = 5;
      expect(c.useSkill('s0', t.uid)).toBeNull();
      expect(999 - t.hp).toBe(v('g-elder-sign', 'base', lvl) + 5 * v('g-elder-sign', 'per', lvl));
      expect(t.st.mark).toBe(5 + v('g-elder-sign', 'grow', lvl));
    }
    // 인장이 없어도 기본 피해와 새 인장
    const c = arena([{ id: 'g-elder-sign' }]);
    const t = c.alive[0];
    c.useSkill('s0', t.uid);
    expect(999 - t.hp).toBe(v('g-elder-sign', 'base'));
    expect(t.st.mark).toBe(v('g-elder-sign', 'grow'));
    // 결계: 새로 새기는 인장은 막아도, 터뜨린 인장은 되돌아온다
    const d = arena([{ id: 'g-elder-sign' }]);
    const u = d.alive[0];
    u.st.mark = 4;
    u.st.ward = 1;
    d.useSkill('s0', u.uid);
    expect(u.st.mark).toBe(4);
    expect(u.st.ward ?? 0).toBe(0);
    // 여러 번 써도 인장은 쓸 때마다 grow씩만 는다 (곱절로 불어나지 않는다)
    const e = arena([{ id: 'g-elder-sign' }]);
    const w = e.alive[0];
    w.st.mark = 3;
    for (let i = 0; i < 10; i++) {
      delete e.s.cd.s0;
      e.s.ap = 5;
      e.useSkill('s0', w.uid);
    }
    expect(w.st.mark).toBe(3 + 10 * v('g-elder-sign', 'grow'));
  });

  it('호문쿨루스: 빚자마자, 그리고 내 턴이 끝날 때마다 체력이 가장 많은 적에게 독·화상을 던진다 (전투당 1회)', () => {
    const c = arena([{ id: 'g-homunculus' }]);
    const big = c.alive[1];
    big.hp = big.maxHp = 2000;
    const n = v('g-homunculus', 'n');
    expect(c.useSkill('s0')).toBeNull();
    expect(big.st.poison).toBe(n);
    expect(big.st.burn).toBe(n);
    for (const e of c.alive) if (e !== big) expect(e.st.poison ?? 0).toBe(0);
    expect(c.blockReason('s0')).not.toBeNull();
    stunAll(c);
    c.endTurn();
    // 턴 끝에 한 번 더 던지고(2n), 그 적의 차례가 시작될 때 독·화상이 한 번씩 타고 1씩 준다
    expect(big.st.poison).toBe(2 * n - 1);
    expect(big.st.burn).toBe(2 * n - 1);
    expect(2000 - big.hp).toBe(4 * n);
    expect(c.p.st['g-flask']).toBe(n);
    // 강화하면 행동력 0, 더 많이
    const d = arena([{ id: 'g-homunculus', lvl: 1 }]);
    const ap = d.s.ap;
    d.useSkill('s0');
    expect(d.s.ap).toBe(ap);
    expect(v('g-homunculus', 'n', 1)).toBeGreaterThan(n);
  });

  it('하늘 떠받치기: 방어도, 다음 내 턴까지 적의 공격을 막아 낸 만큼 되돌려준다', () => {
    const c = arena([{ id: 'g-sky-pillar' }], { enc: 'a1-thug' });
    const e = c.alive[0];
    expect(c.useSkill('s0')).toBeNull();
    expect(c.p.block).toBe(v('g-sky-pillar', 'blk'));
    c.s.phase = 'enemy';
    c.damage({ src: e, tgt: c.p, base: 10, type: 'blunt', attack: true });
    expect(999 - e.hp).toBe(10);
    // 일부만 막으면 막은 만큼만
    c.damage({ src: e, tgt: c.p, base: 10, type: 'blunt', attack: true });
    expect(999 - e.hp).toBe(10 + (v('g-sky-pillar', 'blk') - 10));
    // 방어도가 없으면 되돌릴 것도 없다
    c.damage({ src: e, tgt: c.p, base: 10, type: 'blunt', attack: true });
    expect(999 - e.hp).toBe(v('g-sky-pillar', 'blk'));
    // 적의 반격과 끝없이 주고받지 않는다
    c.p.block = 50;
    e.st.counter = 5;
    const before = e.hp;
    c.drain();
    c.damage({ src: e, tgt: c.p, base: 10, type: 'blunt', attack: true });
    expect(dmgEvents(c).length).toBe(3); // 공격 → 되돌림 → 적의 반격 (반격은 되돌리지 않는다)
    expect(before - e.hp).toBe(10);
    expect(c.p.block).toBe(50 - 10 - 5);
    c.s.phase = 'player';
    // 다음 내 턴이 시작되면 사라진다
    delete e.st.counter;
    stunAll(c);
    c.endTurn();
    expect(c.p.st['g-pillar']).toBeUndefined();
    // 강화하면 매 턴 쓸 수 있다
    expect(lvlVal(SKILLS.get('g-sky-pillar')!.cd, 1)).toBe(1);
  });

  it('창세 이전: 정신력을 치르고 방어를 무시하는 공허 피해, 체력이 기준 이하로 남으면 소멸 (통찰은 4까지), 수호자는 2배 피해만', () => {
    const dmg = v('g-before-genesis', 'dmg');
    const pct = v('g-before-genesis', 'pct');
    const per = v('g-before-genesis', 'per');
    const max = v('g-before-genesis', 'max');
    expect(max).toBe(4);
    const c = arena([{ id: 'g-before-genesis' }]);
    const t = c.alive[0];
    t.block = 50;
    c.p.insight = 0;
    const san = c.p.sanity;
    expect(c.useSkill('s0', t.uid)).toBeNull();
    expect(san - c.p.sanity).toBe(v('g-before-genesis', 'san'));
    expect(999 - t.hp).toBe(dmg);
    expect(t.block).toBe(50);
    expect(t.dead).toBe(false);
    // 기준: 최대 체력의 pct% + 통찰×per% (통찰 4까지)
    for (const insight of [0, 2, 3, 4, 9]) {
      const line = pct + per * Math.min(insight, max);
      for (const [left, gone] of [
        [Math.floor((1000 * line) / 100), true],
        [Math.floor((1000 * line) / 100) + 1, false],
      ] as const) {
        const d = arena([{ id: 'g-before-genesis' }]);
        const u = d.alive[0];
        u.maxHp = 1000;
        u.hp = left + dmg;
        d.p.insight = insight;
        d.useSkill('s0', u.uid);
        expect(u.dead, `통찰 ${insight}, 남은 체력 ${left}`).toBe(gone);
      }
    }
    // 수호자: 소멸하지 않는다 (보통 적이면 소멸할 체력 10%에서도) — 대신 피해가 2배
    const b = arena([{ id: 'g-before-genesis' }], { enc: 'a1-boss-fisherman' });
    const boss = b.alive.find((e) => b.defOf(e).tier === 'boss')!;
    boss.maxHp = 1000;
    boss.hp = 100;
    b.useSkill('s0', boss.uid);
    expect(boss.dead).toBe(false);
    const big = arena([{ id: 'g-before-genesis' }], { enc: 'a1-boss-fisherman' });
    const boss2 = big.alive.find((e) => big.defOf(e).tier === 'boss')!;
    boss2.hp = boss2.maxHp = 1000;
    const expected = big.preview(big.p, boss2, dmg * 2, 'void', { attack: true });
    expect(expected).toBeGreaterThanOrEqual(dmg * 2);
    big.useSkill('s0', boss2.uid);
    expect(1000 - boss2.hp).toBe(expected);
    expect(boss2.dead).toBe(false);
  });
});

describe('창세: 장비 효과', () => {
  it('이름 짓는 점토판: 약점 속성으로 친다 (모르면 밝혀낸다), 붕괴시키면 행동력 +1', () => {
    const c = arena([], { equip: { weapon: { id: 'g-tablet' } }, enc: 'a1-thug', keepWeak: true });
    const t = c.alive[0];
    t.weak = ['fire', 'void'];
    t.known = [];
    t.maxPoise = t.poise = 2;
    t.broken = 0;
    const ap = c.s.ap;
    expect(c.useSkill('weapon', t.uid)).toBeNull();
    let hits = dmgEvents(c);
    expect(hits[0].dtype).toBe('fire');
    expect(hits[0].amount).toBe(v('w-g-tablet', 'dmg', 0));
    expect(t.known).toContain('fire');
    expect(t.poise).toBe(1);
    expect(c.s.ap).toBe(ap - 1);
    // 붕괴시키는 한 방은 행동력을 돌려준다
    expect(c.useSkill('weapon', t.uid)).toBeNull();
    expect(t.broken).toBe(2);
    expect(c.s.ap).toBe(ap - 1);
    // 이미 붕괴한 적을 쳐서는 돌려받지 못한다
    c.useSkill('weapon', t.uid);
    expect(c.s.ap).toBe(ap - 2);
    // 아는 약점 먼저, 상형문자가 요구하는 속성이 있으면 그 속성, 약점이 없으면 비전
    const cases: [DmgType[], DmgType[], DmgType[] | undefined, DmgType][] = [
      [['fire', 'void'], ['void'], undefined, 'void'],
      [['fire', 'void'], [], ['pierce', 'blunt'], 'pierce'],
      [[], [], undefined, 'arcane'],
    ];
    for (const [weak, known, types, want] of cases) {
      const d = arena([], { equip: { weapon: { id: 'g-tablet', lvl: 2 } }, enc: 'a1-thug', keepWeak: true });
      const u = d.alive[0];
      u.weak = weak;
      u.known = known;
      if (types) d.s.obj = { text: '상형문자', types };
      d.useSkill('weapon', u.uid);
      const h = dmgEvents(d);
      expect(h[0].dtype, `${weak} ${known} ${types}`).toBe(want);
      expect(h[0].amount).toBe(v('w-g-tablet', 'dmg', 2));
    }
  });

  it('태초의 알껍데기: 최대 체력 +10, 방어도가 다음 턴에도 남고, 뚫릴 때마다 힘 +1 (전투당 3번)', () => {
    const run = newRun({ seed: 3, origin: 'soldier' });
    const hp0 = run.player.maxHp;
    expect(gainEquip(run, 'g-egg')).toBe(true);
    expect(equipFromBag(run, run.bag.find((x) => x.id === 'g-egg')!.uid, 'armor')).toBe(true);
    expect(run.player.maxHp).toBe(hp0 + 10);

    const c = arena([], { equip: { armor: { id: 'g-egg' } }, enc: 'a1-thug' });
    const e = c.alive[0];
    expect(c.useSkill('armor')).toBeNull();
    expect(c.useSkill('armor')).toBeNull();
    expect(c.p.block).toBe(16);
    expect(c.p.st.retain).toBe(1);
    stunAll(c);
    c.endTurn();
    expect(c.p.block).toBe(16);
    // 이번 턴엔 두르지 않았다 → 다음 턴엔 사라진다
    stunAll(c);
    c.endTurn();
    expect(c.p.block).toBe(0);
    // 껍질이 깨질 때마다 힘 +1, 세 번까지
    c.s.phase = 'enemy';
    c.p.block = 20;
    c.damage({ src: e, tgt: c.p, base: 8, type: 'blunt', attack: true });
    expect(c.p.st.str ?? 0).toBe(0);
    for (let i = 0; i < 5; i++) {
      c.p.block = 5;
      c.damage({ src: e, tgt: c.p, base: 8, type: 'blunt', attack: true });
    }
    expect(c.p.st.str).toBe(3);
    // 강화마다 방어도가 커진다
    for (const lvl of [1, 2]) {
      const d = arena([], { equip: { armor: { id: 'g-egg', lvl } } });
      d.useSkill('armor');
      expect(d.p.block).toBe(v('a-g-egg', 'blk', lvl));
    }
  });

  it('이레의 해시계: 턴마다 창세의 하루 — 1 빛 · 2 궁창 · 3 뭍 · 4 해와 별 · 5 생명 · 6 사람 · 7 안식, 여드레째는 다시 첫날', () => {
    const at = (k: 'barrier' | 'heal' | 'frenzy' | 'san', lvl: number) => DIAL[k][0] + DIAL[k][1] * lvl;
    // 설명의 수치가 실제 표와 같다
    const desc = EQUIPS.get('g-sundial')!.desc;
    for (const k of ['barrier', 'heal', 'frenzy', 'san'] as const) for (const n of DIAL[k]) expect(desc.includes(String(n)), `${k} ${n}`).toBe(true);
    for (const lvl of [0, 2]) {
      const run = newRun({ seed: 21, origin: 'soldier' });
      run.floor = null;
      run.relics = [];
      run.equip = { weapon: null, armor: null, trinket1: { uid: 't1', id: 'g-sundial', lvl }, trinket2: null };
      run.player.maxHp = run.player.hp = 999;
      run.player.sanity = run.player.maxSanity = 999;
      run.skills = [
        { uid: 's0', id: 'bulwark', lvl: 0, runes: [] },
        { uid: 's1', id: 'first-aid', lvl: 0, runes: [] },
      ];
      run.slots = ['s0', 's1'];
      run.knownWeak = {};
      const c = startCombat(run, 'a1-cult', { anomaly: null });
      c.snapshots = false;
      const next = () => {
        stunAll(c);
        c.endTurn();
      };
      // 1일 빛: 적 전체의 약점이 드러난다
      expect(c.p.st['g-day']).toBe(1);
      for (const e of c.alive) expect([...e.known].sort()).toEqual([...e.weak].sort());
      // 2일 궁창: 보호막
      next();
      expect(c.p.st['g-day']).toBe(2);
      expect(c.p.st.barrier).toBe(at('barrier', lvl));
      // 3일 뭍: 체력 회복
      c.p.hp = 900;
      next();
      expect(c.p.hp).toBe(900 + at('heal', lvl));
      // 4일 해와 별: 이번 턴 공격 피해 +%
      next();
      expect(c.p.st.frenzy).toBe(at('frenzy', lvl));
      // 5일 생명: 행동력
      next();
      expect(c.s.ap).toBe(c.p.maxAp + DIAL.ap);
      // 6일 사람: 힘 — 그리고 기술 둘을 대기에 걸어 둔다 (전투당 1회 기술은 그대로 남아야 한다)
      next();
      expect(c.p.st.str).toBe(DIAL.str);
      c.s.ap = 10;
      expect(c.useSkill('s0')).toBeNull();
      expect(c.useSkill('s1')).toBeNull();
      expect(c.s.cd.s0).toBeGreaterThan(1);
      // 7일 안식: 정신력, 재사용 대기가 풀린다
      c.p.sanity = 500;
      next();
      expect(c.p.st['g-day']).toBe(7);
      expect(c.p.sanity).toBe(500 + at('san', lvl));
      expect(c.s.cd.s0).toBeUndefined();
      expect(c.s.cd.s1).toBeGreaterThan(0);
      // 여드레째: 다시 첫날 (빛이 다시 약점을 드러낸다)
      for (const e of c.alive) e.known = [];
      next();
      expect(c.p.st['g-day']).toBe(1);
      for (const e of c.alive) expect([...e.known].sort()).toEqual([...e.weak].sort());
    }
  });
});

// ───────────── 무한 고리 ─────────────

const LIMIT = 12;

/** 한 턴에 장착 스킬을 몇 번 쓸 수 있는가 (적은 죽지 않는다). 앞 칸부터 / 돌아가며 두 정책 중 큰 쪽 */
function usesInOneTurn(pieces: Piece[], relics: string[] = [], equip: Partial<Record<EquipSlot, { id: string; lvl?: number }>> = {}): number {
  let best = 0;
  for (const policy of ['first', 'rotate'] as const) {
    const run = newRun({ seed: 5, origin: 'soldier' });
    run.player.level = 20;
    run.floor = null;
    for (const r of relics) gainRelic(run, r);
    for (const [slot, it] of Object.entries(equip)) run.equip[slot as EquipSlot] = { uid: `t-${slot}`, id: it!.id, lvl: it!.lvl ?? 0 };
    run.skills = pieces.map((p, i) => ({ uid: `s${i}`, id: p.id, lvl: p.lvl ?? 0, runes: p.runes ?? [] }));
    run.slots = run.skills.map((s) => s.uid);
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.snapshots = false;
    for (const e of c.alive) {
      e.hp = e.maxHp = 1e7;
      e.maxPoise = e.poise = 0;
    }
    c.p.hp = c.p.maxHp = 1e6;
    c.p.sanity = c.p.maxSanity = 1e6;
    let n = 0;
    let last = -1;
    for (let i = 0; i < LIMIT + 6; i++) {
      if (c.over || c.s.phase !== 'player') break;
      const slots = c.run.slots as string[];
      const order = policy === 'first' ? slots : [...slots.slice(last + 1), ...slots.slice(0, last + 1)];
      const ref = order.find((r) => !c.blockReason(r));
      if (!ref) break;
      const def = c.skillInfo(ref)!.def;
      const t = def.target === 'single' ? (c.validTargets(def)[0]?.uid ?? null) : null;
      if (c.useSkill(ref, t)) break;
      last = slots.indexOf(ref);
      n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

const levels = (d: SkillDef) => (Array.isArray(d.cost) || Array.isArray(d.cd) || Object.values(d.vals).some(Array.isArray) ? [0, 1] : [0]);
const fits = (rune: string, d: SkillDef) => !RUNES.get(rune)!.fits || RUNES.get(rune)!.fits!(d);
/** 행동력을 주거나 재사용 대기를 되돌리는 스킬 (exploit-combat.test.ts 와 같은 방식으로 코드에서 찾는다) */
const ENGINE_RE = /s\.ap\s*\+=|s\.cd\[|delete c\.s\.cd/;
const engines = [...SKILLS.values()].filter((d) => !d.tags.includes('basic') && (ENGINE_RE.test(d.run.toString()) || d.tags.includes('refresh') || d.tags.includes('energy')));

describe('창세: 한 턴에 끝없이 쓰는 고리가 없다', () => {
  it('창세 스킬 × 강화 × 맞는 각인 하나', () => {
    const bad: string[] = [];
    for (const id of SKILL_IDS) {
      const d = SKILLS.get(id)!;
      for (const lvl of levels(d)) {
        for (const rune of [null, ...[...RUNES.keys()].filter((r) => fits(r, d))]) {
          const n = usesInOneTurn([{ id, lvl, runes: rune ? [rune] : [] }]);
          if (n > LIMIT) bad.push(`${id}+${lvl} [${rune ?? ''}] → ${n}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120_000);

  it('창세 스킬 × 강화 × 유물 하나', () => {
    const bad: string[] = [];
    for (const id of SKILL_IDS) {
      for (const relic of RELICS.keys()) {
        const n = usesInOneTurn([{ id, lvl: 1 }], [relic]);
        if (n > LIMIT) bad.push(`${id} 유물 ${relic} → ${n}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120_000);

  it('창세 스킬 × 행동력·대기를 되돌리는 스킬 (× 쌍둥이 달·세 번째 박자)', () => {
    const bad: string[] = [];
    let n = 0;
    for (const id of SKILL_IDS)
      for (const eng of engines)
        for (const relics of [[], ['x-twin-moon'], ['x-third-beat']]) {
          const u = usesInOneTurn([{ id, lvl: 1 }, { id: eng.id, lvl: 1 }], relics);
          n++;
          if (u > 16) bad.push(`${id} + ${eng.id} ${relics.join(',')} → ${u}`);
        }
    expect(n).toBeGreaterThan(50);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 300_000);

  it('점토판: 붕괴로 돌려받는 행동력은 적마다 한 번 — 버팀 1인 적이 가득해도 행동력이 끝없이 불어나지 않는다', () => {
    const c = arena([], { equip: { weapon: { id: 'g-tablet' } }, enc: 'a1-cult', keepWeak: true });
    for (const [id, row] of [['thug', 0], ['thug', 0], ['initiate', 1]] as const) c.spawn(id, row);
    for (const e of c.alive) {
      e.hp = e.maxHp = 1e6;
      e.weak = ['fire'];
      e.maxPoise = e.poise = 1;
      e.broken = 0;
    }
    const foes = c.alive.length;
    c.s.ap = 3;
    let uses = 0;
    for (let i = 0; i < 50 && !c.blockReason('weapon'); i++) {
      const t = c.alive.find((e) => e.broken === 0) ?? c.alive[0];
      c.useSkill('weapon', t.uid);
      uses++;
    }
    expect(uses).toBeLessThanOrEqual(3 + foes);
    expect(c.blockReason('weapon')).not.toBeNull();
  });

  it('이레의 해시계: 안식(재사용 대기 해제)은 이레에 한 번, 행동력은 닷새째에만 는다', () => {
    const run = newRun({ seed: 8, origin: 'soldier' });
    run.floor = null;
    run.equip.trinket1 = { uid: 't1', id: 'g-sundial', lvl: 2 };
    run.player.maxHp = run.player.hp = 1e6;
    run.player.sanity = run.player.maxSanity = 1e6;
    const c = startCombat(run, 'a1-cult', { anomaly: null });
    c.snapshots = false;
    for (const e of c.alive) e.hp = e.maxHp = 1e7;
    const days: number[] = [];
    const aps: number[] = [];
    for (let t = 0; t < 21; t++) {
      days.push(c.p.st['g-day']);
      aps.push(c.s.ap - c.p.maxAp);
      stunAll(c);
      c.endTurn();
    }
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7]);
    expect(aps.filter((x) => x > 0).length).toBe(3);
  });
});

// ───────────── 얻는 곳 ─────────────

/** 이 조우를 그 자리에서 이기고 보상을 받는다 */
function rewardOf(run: RunState, enc: string) {
  const def = ENCOUNTERS.find((e) => e.id === enc)!;
  run.act = def.act;
  run.screen = 'dungeon';
  const c = startCombat(run, enc, { anomaly: null });
  c.snapshots = false;
  winNow(c);
  return finishCombat(run)!;
}

const genesisIn = (items: (LootItem[] | null | undefined)[]) => items.flatMap((x) => x ?? []).filter(isGenesisLoot);

describe('창세: 얻는 곳', () => {
  it('상점·거점 상점·스킬/장비/금기 굴림·보통 선택 보상에는 나오지 않는다', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const run = newRun({ seed, origin: ['soldier', 'hunter', 'occultist'][seed % 3] });
      run.player.gold = 99999;
      for (const act of [1, 2, 3, 4, 5]) {
        run.act = act;
        openShop(run, 'merchant', seed * 10 + act);
        for (const it of run.shop!.items) expect(isGenesisLoot(it), `${seed} 상인 ${it.id}`).toBe(false);
        run.floor!.shops = {};
        openShop(run, 'haven');
        for (const it of run.shop!.items) expect(isGenesisLoot(it), `${seed} 거점 ${it.id}`).toBe(false);
      }
      for (let i = 0; i < 5; i++) {
        for (const tier of ['normal', 'elite', 'shop'] as const) {
          const eq = rollEquip(run, tier);
          expect(eq && EQUIPS.get(eq)!.rarity).not.toBe('genesis');
        }
        for (const id of [...rollSkills(run, 6, 'normal'), ...rollSkills(run, 6, 'elite'), ...rollSkills(run, 6, 'boss'), ...rollForbidden(run, 6)]) expect(SKILLS.get(id)!.rarity).not.toBe('genesis');
        for (const tier of ['normal', 'elite', 'boss'] as const) expect(genesisIn([rollChoice(run, tier)])).toEqual([]);
      }
    }
  });

  it('일반 전투·1~4층 정예·수호자 보상에는 나오지 않는다 (확률을 1로 올려도)', () => {
    const was = GENESIS.dropChance;
    GENESIS.dropChance = 1;
    try {
      const encs = ENCOUNTERS.filter((e) => !e.id.startsWith('lord') && (e.kind === 'normal' || e.act < 5));
      for (const enc of encs) {
        const run = newRun({ seed: 31, origin: 'soldier' });
        const rw = rewardOf(run, enc.id);
        expect(genesisIn([rw.items, rw.choice]), enc.id).toEqual([]);
      }
    } finally {
      GENESIS.dropChance = was;
    }
  }, 60_000);

  it('계층군주를 쓰러뜨리면 창세 셋 중 하나를 고른다 — 서로 다르고, 하나를 고르면 끝', () => {
    const lords = ENCOUNTERS.filter((e) => e.id.startsWith('lord'));
    expect(lords.length).toBeGreaterThanOrEqual(3);
    for (const lord of lords) {
      for (const origin of ['soldier', 'hunter', 'occultist']) {
        const run = newRun({ seed: 41, origin });
        const rw = rewardOf(run, lord.id);
        expect(rw.source).toBe('lord');
        expect(rw.choice!.length, lord.id).toBe(3);
        expect(rw.choice!.every(isGenesisLoot), lord.id).toBe(true);
        expect(new Set(rw.choice!.map((x) => x.id)).size).toBe(3);
        expect(chooseLoot(run, 1)).toBeNull();
        expect(run.genesis).toBe(rw.choice![1].id);
        expect(chooseLoot(run, 0)).not.toBeNull();
        expect(rw.choice![0].taken ?? false).toBe(false);
      }
    }
  }, 60_000);

  it('5층 정예·수호자는 아주 드물게 하나를 떨군다 (약 5%)', () => {
    expect(GENESIS.dropChance).toBeGreaterThan(0);
    expect(GENESIS.dropChance).toBeLessThanOrEqual(0.06);
    const was = GENESIS.dropChance;
    try {
      const encs = ENCOUNTERS.filter((e) => e.act === 5 && e.kind !== 'normal' && !e.id.startsWith('lord'));
      expect(encs.some((e) => e.kind === 'elite')).toBe(true);
      GENESIS.dropChance = 1;
      for (const enc of encs) {
        const run = newRun({ seed: 51, origin: 'hunter' });
        const rw = rewardOf(run, enc.id);
        expect(genesisIn([rw.items]).length, enc.id).toBe(1);
        expect(genesisIn([rw.choice]).length, enc.id).toBe(0);
      }
      GENESIS.dropChance = 0;
      for (const enc of encs) expect(genesisIn([rewardOf(newRun({ seed: 51, origin: 'hunter' }), enc.id).items]), enc.id).toEqual([]);
    } finally {
      GENESIS.dropChance = was;
    }
  }, 60_000);

  it('판마다 하나: 얻은 뒤에는 계층군주도, 5층 강적도 더 주지 않고, 다른 창세는 받을 수 없다', () => {
    const was = GENESIS.dropChance;
    GENESIS.dropChance = 1;
    try {
      const run = newRun({ seed: 61, origin: 'occultist' });
      const lord = ENCOUNTERS.find((e) => e.id.startsWith('lord'))!;
      const first = rewardOf(run, lord.id);
      expect(chooseLoot(run, 0)).toBeNull();
      const got = run.genesis!;
      expect(got).toBe(first.choice![0].id);
      // 다른 계층군주: 평소의 고르는 보상
      const again = rewardOf(run, ENCOUNTERS.filter((e) => e.id.startsWith('lord')).at(-1)!.id);
      expect(genesisIn([again.items, again.choice])).toEqual([]);
      expect(again.choice!.length).toBeGreaterThan(0);
      // 5층 정예: 확률이 1이어도 없다
      const elite = ENCOUNTERS.find((e) => e.act === 5 && e.kind === 'elite')!;
      expect(genesisIn([rewardOf(run, elite.id).items])).toEqual([]);
      expect(rollGenesis(run, 3)).toEqual([]);
      // 어디선가 다른 창세가 손에 들어와도 받을 수 없다
      const other = [...SKILL_IDS, ...EQUIP_IDS].find((id) => id !== got)!;
      const item: LootItem = { kind: SKILLS.has(other) ? 'skill' : 'equip', id: other };
      expect(takeLoot(run, item)).not.toBeNull();
      expect(item.taken ?? false).toBe(false);
      expect(run.skills.some((s) => s.id === other) || run.bag.some((x) => x.id === other)).toBe(false);
      expect(run.genesis).toBe(got);
    } finally {
      GENESIS.dropChance = was;
    }
  }, 60_000);

  it('창세 후보는 이미 배운 스킬을 다시 내지 않는다', () => {
    const run = newRun({ seed: 71, origin: 'soldier' });
    run.skills.push(...SKILL_IDS.map((id, i) => ({ uid: `g${i}`, id, lvl: 0, runes: [] })));
    for (let i = 0; i < 20; i++) for (const it of rollGenesis(run, 3)) expect(it.kind).toBe('equip');
  });
});

// ───────────── 저장·불러오기 ─────────────

describe('창세: 저장·불러오기 (JSON 왕복)', () => {
  const reload = (run: RunState): RunState => JSON.parse(JSON.stringify(run));

  it('얻은 창세와 판마다 하나 규칙이 이어하기 뒤에도 남는다', () => {
    let run = newRun({ seed: 81, origin: 'soldier' });
    const rw = rewardOf(run, ENCOUNTERS.find((e) => e.id.startsWith('lord'))!.id);
    run = reload(run);
    expect(run.reward!.choice!.every(isGenesisLoot)).toBe(true);
    expect(chooseLoot(run, 2)).toBeNull();
    const got = rw.choice![2].id;
    run = reload(run);
    expect(run.genesis).toBe(got);
    expect(run.skills.some((s) => s.id === got) || run.bag.some((x) => x.id === got)).toBe(true);
    expect(rollGenesis(run, 3)).toEqual([]);
  });

  it('전투 중에 저장했다 불러와도 창세 상태가 그대로 동작한다', () => {
    const c = arena([{ id: 'g-sunfall' }, { id: 'aimed-shot' }, { id: 'g-homunculus' }, { id: 'g-sky-pillar' }], {
      equip: { weapon: { id: 'g-tablet' }, armor: { id: 'g-egg' }, trinket1: { id: 'g-sundial' } },
      enc: 'a1-cult',
    });
    const t = c.alive[0];
    expect(c.useSkill('s0', t.uid)).toBeNull();
    expect(c.useSkill('s2')).toBeNull();
    expect(c.useSkill('s3')).toBeNull();
    expect(c.useSkill('armor')).toBeNull();
    // 저장 → 이어하기
    const run = reload(c.run);
    const d = new Combat(run);
    d.snapshots = false;
    const u = d.alive[0];
    expect(d.p.st['g-sunset']).toBe(1);
    expect(d.p.st['g-flask']).toBe(v('g-homunculus', 'n'));
    expect(d.p.st['g-pillar']).toBe(1);
    expect(d.p.st['g-day']).toBe(1);
    const hp = u.hp;
    expect(d.useSkill('s1', u.uid)).toBeNull();
    expect(hp - u.hp).toBe(d.preview(d.p, u, v('aimed-shot', 'dmg'), 'pierce', { attack: true }));
    expect(hp - u.hp).toBeGreaterThanOrEqual(v('aimed-shot', 'dmg') * 2);
    expect(d.s.ammo).toBe(d.s.maxAmmo);
    const block = d.p.block;
    const big = d.alive.reduce((a, b) => (b.hp > a.hp ? b : a));
    const poison = big.st.poison ?? 0;
    stunAll(d);
    d.endTurn();
    expect(d.s.ammo).toBe(0);
    expect(d.p.block).toBe(block);
    expect((big.st.poison ?? 0) + 1).toBeGreaterThan(poison);
    expect(d.p.st['g-day']).toBe(2);
    expect(JSON.parse(JSON.stringify(d.run)).combat.vars).toEqual(d.s.vars);
  });
});
