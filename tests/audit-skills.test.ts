import { describe, expect, it } from 'vitest';
import '../src/content';
import type { Combat } from '../src/engine/combat';
import { SKILLS } from '../src/engine/registry';
import { newRun, startCombat } from '../src/engine/run';
import type { DmgType, EnemyUnit } from '../src/engine/types';

/** src/content/skills/*.ts 에 등록된 스킬 (계열 스킬 + 장비 기본기) */
const SKILL_FILE_IDS = [
  // basic.ts
  'punch', 'brace', 'w-saber', 'w-knife', 'w-hatchet', 'w-revolver', 'w-shotgun', 'w-harpoon', 'w-cane', 'w-crowbar',
  'w-athame', 'w-torch', 'w-tome', 'a-coat', 'a-leather', 'a-robe', 'a-chain', 'a-cloak', 'a-diving',
  // blade.ts
  'quick-cut', 'serrate', 'lunge', 'finisher', 'hemorrhage', 'whirlwind', 'flurry', 'riposte', 'blood-dance',
  // firearm.ts
  'aimed-shot', 'reload', 'fan-fire', 'take-aim', 'piercing-round', 'kneecap', 'last-bullet', 'suppress',
  // occult.ts
  'sigil', 'detonate', 'arcane-bolt', 'circle', 'chant', 'chain-sigil', 'ritual-burst', 'hex',
  // alchemy.ts
  'fire-flask', 'poison-dart', 'catalyst', 'acid-splash', 'smoke-veil', 'quicksilver', 'inferno', 'transmute',
  // resolve.ts
  'shield-bash', 'steady', 'iron-will', 'taunt', 'bulwark', 'last-stand', 'rally', 'body-slam',
  // forbidden.ts
  'whisper-void', 'tentacle-call', 'mind-rend', 'eldritch-ward', 'gaze-abyss', 'doom-word', 'blood-price', 'void-rift',
  // neutral.ts
  'shove', 'first-aid', 'focus', 'study',
];

/**
 * 스킬 하나만 든 깨끗한 주인공으로 「깡패(전열) + 입문자 둘(후열)」 전투를 연다.
 * 유물·장비·층의 법칙·약점·저항·버팀을 지워 피해 계산을 그대로 볼 수 있게 한다 (버팀이 남은 적은 덜 받는다).
 */
function arena(id: string, o: { lvl?: number; runes?: string[]; enc?: string } = {}): Combat {
  const run = newRun({ seed: 2026, origin: 'soldier' });
  run.floor = null;
  run.relics = [];
  run.equip = { weapon: null, armor: null, trinket1: null, trinket2: null };
  run.player.maxHp = run.player.hp = 999;
  run.player.sanity = run.player.maxSanity = 999;
  run.skills = [{ uid: 'sk', id, lvl: o.lvl ?? 0, runes: o.runes ?? [] }];
  run.slots = ['sk'];
  const c = startCombat(run, o.enc ?? 'a1-cult', { anomaly: null });
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

const front = (c: Combat) => c.row(0)[0];
const back = (c: Combat) => c.row(1)[0];

/** 이번 사용에서 적에게 들어간 피해 이벤트 */
function hits(c: Combat) {
  return c.drain().filter((ev): ev is Extract<typeof ev, { t: 'dmg' }> => ev.t === 'dmg' && ev.tgt !== 'p');
}
const total = (c: Combat) => hits(c).reduce((s, h) => s + h.amount, 0);

describe('스킬 감사 — 각인의 위력 배율', () => {
  // 절약 각인: 위력 ×0.75. dmg/blk/heal 로 시작하지 않는 값으로 피해·보호막을 정하는 스킬도 위력을 따라야 한다.
  const THRIFT = ['thrift'];
  const p75 = (n: number) => Math.floor(n * 0.75);

  it('보호의 원: 보호막도 위력을 따른다', () => {
    const c = arena('circle', { runes: THRIFT });
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.barrier).toBe(p75(7));
  });

  it('이계의 갑주: 보호막(+통찰)도 위력을 따른다', () => {
    const c = arena('eldritch-ward', { runes: THRIFT });
    c.p.insight = 2;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.barrier).toBe(p75(8 + 4 * 2));
  });

  it('인장 폭발: 기본 피해와 인장당 피해가 위력을 따른다', () => {
    const c = arena('detonate', { runes: THRIFT });
    const t = front(c);
    t.st.mark = 2;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(p75(7) + 2 * p75(5));
  });

  it('대폭발 의식: 인장당 피해가 위력을 따른다', () => {
    const c = arena('ritual-burst', { runes: THRIFT });
    front(c).st.mark = 2;
    expect(c.useSkill('sk')).toBeNull();
    expect(total(c)).toBe(2 * p75(6));
  });

  it('철갑탄: 뒤로 관통하는 피해도 위력을 따른다', () => {
    const c = arena('piercing-round', { runes: THRIFT });
    const t = front(c);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    const hs = hits(c);
    expect(hs.find((h) => h.tgt === t.uid)?.amount).toBe(p75(15));
    expect(hs.find((h) => h.tgt !== t.uid)?.amount).toBe(p75(8));
  });

  it('최후의 저항: 방어도가 위력을 따른다', () => {
    const c = arena('last-stand', { runes: THRIFT });
    c.p.hp = c.p.maxHp - 100;
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.block).toBe(p75(35));
  });

  it('몸통 박치기: 방어도만큼의 피해가 위력을 따른다', () => {
    const c = arena('body-slam', { runes: THRIFT });
    c.p.block = 20;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(total(c)).toBe(p75(20));
  });

  it('방패 강타: 방어도 비례 피해도 위력을 따른다', () => {
    const c = arena('shield-bash', { runes: THRIFT });
    c.p.block = 20;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(total(c)).toBe(p75(6) + p75(10));
  });

  it('혈류 폭발: 출혈 배수 피해가 위력을 따른다', () => {
    const c = arena('hemorrhage', { runes: THRIFT });
    const t = front(c);
    t.st.bleed = 4;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(p75(8));
  });

  it('마무리 일격: 연계 추가 피해도 위력을 따른다', () => {
    const c = arena('finisher', { runes: THRIFT });
    c.s.used = 2;
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(total(c)).toBe(p75(11) + p75(4 * 2));
  });

  it('변성: 독+화상 비례 피해가 위력을 따른다', () => {
    const c = arena('transmute', { runes: THRIFT });
    const t = front(c);
    t.st.poison = 4;
    t.st.burn = 4;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(total(c)).toBe(p75(8));
  });

  it('업화: 화상 추가 피해도 위력을 따른다', () => {
    const c = arena('inferno', { runes: THRIFT });
    front(c).st.burn = 4;
    expect(c.useSkill('sk')).toBeNull();
    const hs = hits(c);
    expect(hs.find((h) => h.tgt === front(c).uid)?.amount).toBe(p75(6) + p75(4));
    expect(hs.find((h) => h.tgt === back(c).uid)?.amount).toBe(p75(6));
  });

  it('공허의 속삭임 · 공허 균열: 통찰 비례 피해도 위력을 따른다', () => {
    const a = arena('whisper-void', { runes: THRIFT });
    a.p.insight = 3;
    expect(a.useSkill('sk', front(a).uid)).toBeNull();
    expect(total(a)).toBe(p75(8) + p75(4 * 3));

    const b = arena('void-rift', { runes: THRIFT });
    b.p.insight = 3;
    expect(b.useSkill('sk')).toBeNull();
    const hs = hits(b);
    expect(hs.length).toBe(3);
    for (const h of hs) expect(h.amount).toBe(p75(14) + p75(4 * 3));
  });

  it('촉매: 늘어나는 독의 양이 위력을 따른다', () => {
    const c = arena('catalyst', { runes: THRIFT });
    const t = front(c);
    t.st.poison = 8;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.poison).toBe(8 + p75(8));
    // 메아리: 2배 → 그 뒤 절반 위력으로 +50%
    const d = arena('catalyst', { runes: ['echo'] });
    const u = front(d);
    u.st.poison = 8;
    expect(d.useSkill('sk', u.uid)).toBeNull();
    expect(u.st.poison).toBe(16 + 8);
  });

  it('메아리: 두 번째 발동은 절반 위력 (보호의 원)', () => {
    const c = arena('circle', { runes: ['echo'] });
    expect(c.useSkill('sk')).toBeNull();
    expect(c.p.st.barrier).toBe(7 + Math.floor(7 * 0.5));
  });
});

describe('스킬 감사 — 공허 각인의 속성 변환', () => {
  // 공허 각인: 「피해 속성이 공허로 바뀐다」. c.damage 를 직접 부르는 스킬도 u.type 을 따라야 한다.
  const types = (c: Combat): (DmgType | 'true')[] => hits(c).map((h) => h.dtype);

  it('업화', () => {
    const c = arena('inferno', { runes: ['void-rune'] });
    expect(c.useSkill('sk')).toBeNull();
    const ts = types(c);
    expect(ts.length).toBe(3);
    expect(new Set(ts)).toEqual(new Set(['void']));
  });

  it('변성', () => {
    const c = arena('transmute', { runes: ['void-rune'] });
    const t = front(c);
    t.st.poison = 5;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(types(c)).toEqual(['void']);
  });

  it('철갑탄 (관통 피해 포함)', () => {
    const c = arena('piercing-round', { runes: ['void-rune'] });
    expect(c.useSkill('sk', front(c).uid)).toBeNull();
    expect(types(c)).toEqual(['void', 'void']);
  });
});

describe('스킬 감사 — 설명대로 동작', () => {
  it('철갑탄: 대상과 다른 열의 적 하나에게만 추가 피해', () => {
    const c = arena('piercing-round');
    const t = back(c);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    const hs = hits(c);
    expect(hs.length).toBe(2);
    expect(hs[0].tgt).toBe(t.uid);
    expect(hs[1].tgt).toBe(front(c).uid);
  });

  it('밀쳐내기: 전열에 혼자 남은 적은 밀어내지 못한다', () => {
    const c = arena('shove');
    const t = front(c);
    expect(c.row(0).length).toBe(1);
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.row).toBe(0);
    // 전열에 동료가 있으면 밀어낸다
    const d = arena('shove');
    d.spawn('thug', 0);
    const u = front(d);
    expect(d.useSkill('sk', u.uid)).toBeNull();
    expect(u.row).toBe(1);
  });

  it('사냥칼 찌르기: 방어도에 다 막히면 출혈이 걸리지 않는다', () => {
    const c = arena('w-knife');
    const t = front(c);
    t.block = 50;
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.bleed ?? 0).toBe(0);
    t.block = 0;
    c.s.cd = {};
    expect(c.useSkill('sk', t.uid)).toBeNull();
    expect(t.st.bleed).toBe(1);
  });

  it('칼날 폭풍: 근접이라 전열에 적이 있으면 전열만 맞는다', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const c = arena('flurry');
      c.s.used = 5;
      for (let i = 0; i < seed; i++) c.rng.next();
      expect(c.useSkill('sk')).toBeNull();
      for (const h of hits(c)) seen.add(c.s.enemies.find((e) => e.uid === h.tgt)!.row === 0 ? 'front' : 'back');
    }
    expect(seen.has('front')).toBe(true);
    expect(seen.has('back')).toBe(false);
  });

  it('몸통 박치기+: 강화하면 버팀 추가 -1 (설명에 드러남)', () => {
    const def = SKILLS.get('body-slam')!;
    expect(def.desc).toContain('{poise}');
  });
});

describe('스킬 감사 — 모든 계열 스킬이 실제 전투에서 쓰인다', () => {
  /** 인장·출혈·독·화상을 깔아 두어 조건부 효과도 실행되게 한다 */
  function prime(c: Combat) {
    for (const e of c.alive) e.st = { mark: 2, bleed: 3, poison: 3, burn: 3 };
    c.p.block = 10;
    c.p.insight = 2;
    c.s.ammo = c.s.maxAmmo;
  }

  const targetsFor = (c: Combat, id: string): (EnemyUnit | null)[] => {
    const def = SKILLS.get(id)!;
    if (def.target !== 'single') return [null];
    return c.validTargets(def);
  };

  it('스킬 파일의 id가 모두 등록되어 있다', () => {
    for (const id of SKILL_FILE_IDS) expect(SKILLS.has(id), id).toBe(true);
  });

  for (const id of SKILL_FILE_IDS) {
    it(id, () => {
      // 장비 기본기는 장비 강화 단계 0~2
      const lvls = SKILLS.get(id)?.tags.includes('basic') ? [0, 1, 2] : [0, 1];
      for (const lvl of lvls) {
        for (const runes of [[], ['echo']]) {
          // 대상 후보마다 (전열/후열) 새 전투에서 한 번씩
          const probe = arena(id, { lvl, runes });
          prime(probe);
          const n = targetsFor(probe, id).length;
          for (let i = 0; i < n; i++) {
            const c = arena(id, { lvl, runes });
            c.spawn('thug', 0);
            for (const e of c.s.enemies) {
              e.hp = e.maxHp = 999;
              e.weak = [];
            }
            prime(c);
            const t = targetsFor(c, id)[i];
            const why = c.blockReason('sk');
            expect(why, `${id} lvl${lvl} ${runes.join()}`).toBeNull();
            expect(() => c.useSkill('sk', t?.uid ?? null), `${id} lvl${lvl}`).not.toThrow();
            expect(c.s.phase === 'player' || c.over, id).toBe(true);
            // 적 차례까지 넘겨도 터지지 않는다
            expect(() => c.endTurn(), `${id} lvl${lvl} endTurn`).not.toThrow();
          }
          // 탄약이 없을 때: canUse 가 막거나, 쓰더라도 터지지 않는다
          const dry = arena(id, { lvl, runes });
          dry.s.ammo = 0;
          const why = dry.blockReason('sk');
          if (!why) expect(() => dry.useSkill('sk', null)).not.toThrow();
          else expect(why).toBe('탄약 부족');
        }
      }
    });
  }

  it('사경(체력 0) 상태에서도 쓸 수 있다', () => {
    for (const id of SKILL_FILE_IDS) {
      const c = arena(id);
      prime(c);
      c.damage({ src: c.alive[0], tgt: c.p, base: 5000, type: 'true', ignoreBlock: true });
      expect(c.dying, id).toBe(true);
      expect(() => c.useSkill('sk', null), id).not.toThrow();
    }
  });
});
