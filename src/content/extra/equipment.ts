import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { combo, guard, hit, reload, skill, spendAmmo } from '../lib';

/**
 * extra 장비. 무기/방어구의 기본기 수치 배열은 장비 강화 단계(0~2)별.
 * 장신구 훅의 s.n = 강화 단계.
 */

// ───────────── 기본기 ─────────────

reg.skills([
  skill({
    id: 'w-x-twin',
    name: '쌍단검 난무',
    icon: 'gi:daggers',
    school: 'blade',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'basic', 'multi', 'combo'],
    vals: { dmg: [2, 3, 4], hits: 2 },
    desc: '{D:dmg} 참격 피해 {hits}회. 연계 2 이상이면 1회 추가',
    run: (c, u, t) => void hit(c, u, t, { hits: u.v('hits') + (combo(c) >= 2 ? 1 : 0) }),
  }),
  skill({
    id: 'w-x-rifle',
    name: '소총 사격',
    icon: 'gi:winchester-rifle',
    school: 'firearm',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'basic', 'ammo', 'gun'],
    vals: { dmg: [6, 8, 10], bonus: [3, 4, 5] },
    desc: '탄약 1 소모, {D:dmg} 관통 피해. 후열의 적에게 +{bonus}. 탄약이 없으면 재장전',
    run: (c, u, t) => {
      if (c.s.ammo <= 0) return reload(c);
      spendAmmo(c, 1);
      hit(c, u, t, { dmg: u.v('dmg') + (t && t.row === 1 ? u.v('bonus') : 0) });
    },
  }),
  skill({
    id: 'w-x-censer',
    name: '향로 휘두르기',
    icon: 'gi:fire-bowl',
    school: 'alchemy',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'melee',
    target: 'front',
    type: 'fire',
    tags: ['attack', 'basic', 'aoe', 'burn'],
    vals: { dmg: [3, 4, 5] },
    desc: '전열 전체에 {D:dmg} 화염 피해 (화상 중인 적은 화상 +2)',
    run: (c, u, t) => void hit(c, u, t),
  }),
  skill({
    id: 'w-x-buckler',
    name: '방패 치기',
    icon: 'gi:round-shield',
    school: 'resolve',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'basic', 'block'],
    vals: { dmg: [3, 4, 5], blk: [3, 4, 5] },
    desc: '{D:dmg} 타격 피해, 방어도 {B:blk}',
    run: (c, u, t) => {
      hit(c, u, t);
      guard(c, u);
    },
  }),
  skill({
    id: 'a-x-thorn',
    name: '가시 세우기',
    icon: 'gi:spiked-armor',
    school: 'resolve',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'self',
    target: 'self',
    tags: ['block', 'basic', 'thorns'],
    vals: { blk: [4, 5, 6], thorns: [1, 1, 2] },
    desc: '방어도 {B:blk}, 가시 +{thorns} (전투 동안 누적)',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'thorns', u.v('thorns'), c.p);
    },
  }),
  skill({
    id: 'a-x-apron',
    name: '앞치마 여미기',
    icon: 'gi:leather-vest',
    school: 'alchemy',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'self',
    target: 'self',
    tags: ['block', 'basic'],
    vals: { blk: [4, 6, 8], per: [2, 2, 3] },
    desc: '방어도 {B:blk} + 독이나 화상에 걸린 적 1명당 {per}',
    run: (c, u) => {
      const n = c.alive.filter((e) => (e.st.poison ?? 0) > 0 || (e.st.burn ?? 0) > 0).length;
      guard(c, u, u.v('blk') + n * u.v('per'));
    },
  }),
  skill({
    id: 'a-x-vestment',
    name: '예복의 가호',
    icon: 'gi:warlock-hood',
    school: 'occult',
    rarity: 'basic',
    pool: false,
    cost: 1,
    cd: 0,
    range: 'self',
    target: 'self',
    tags: ['barrier', 'basic'],
    vals: { barrier: [3, 4, 5] },
    desc: '보호막 {barrier} (턴이 지나도 유지)',
    run: (c, u) => void c.apply(c.p, 'barrier', u.v('barrier'), c.p),
  }),
]);

// ───────────── 장비 ─────────────

reg.equips([
  // ── 무기 ──
  {
    id: 'x-twin-daggers',
    name: '쌍단검',
    icon: 'gi:daggers',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-x-twin',
    desc: '기본 공격: 참격 2회 (연계 2 이상이면 3회)',
  },
  {
    id: 'x-hunting-rifle',
    name: '사냥용 소총',
    icon: 'gi:winchester-rifle',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-x-rifle',
    desc: '기본 공격: 원거리 관통(탄약 1), 후열의 적에게 추가 피해',
  },
  {
    id: 'x-ember-censer',
    name: '불씨 향로',
    icon: 'gi:fire-bowl',
    slot: 'weapon',
    rarity: 'uncommon',
    skill: 'w-x-censer',
    desc: '기본 공격: 전열 전체에 화염',
  },
  {
    id: 'x-buckler',
    name: '둥근 방패',
    icon: 'gi:round-shield',
    slot: 'weapon',
    rarity: 'common',
    skill: 'w-x-buckler',
    desc: '기본 공격: 타격 + 방어도',
  },

  // ── 방어구 ──
  {
    id: 'x-thorned-armor',
    name: '가시 갑옷',
    icon: 'gi:spiked-armor',
    slot: 'armor',
    rarity: 'uncommon',
    skill: 'a-x-thorn',
    desc: '기본 방어: 방어도 4 + 가시 1 (전투 동안 누적)',
  },
  {
    id: 'x-alch-apron',
    name: '연금술사의 앞치마',
    icon: 'gi:leather-vest',
    slot: 'armor',
    rarity: 'common',
    skill: 'a-x-apron',
    desc: '기본 방어: 방어도 4 + 독·화상에 걸린 적 1명당 2',
  },
  {
    id: 'x-ritual-vestment',
    name: '의식 예복',
    icon: 'gi:warlock-hood',
    slot: 'armor',
    rarity: 'uncommon',
    skill: 'a-x-vestment',
    desc: '기본 방어: 사라지지 않는 보호막 3',
  },

  // ── 장신구 ──
  {
    id: 'x-ballistic-ruler',
    name: '탄도 계산자',
    icon: 'gi:pencil-ruler',
    slot: 'trinket',
    rarity: 'common',
    desc: '관통 공격 피해 +2 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && d.type === 'pierce') d.add += 2 + s.n;
      },
    },
  },
  {
    id: 'x-bone-dice',
    name: '뼈 주사위',
    icon: 'gi:rolling-dices',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '턴 시작 시 25% 확률로 행동력 +1 (강화마다 +10%)',
    hooks: {
      onTurnStart(c, s) {
        if (!c.rng.chance(0.25 + 0.1 * s.n)) return;
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '주사위가 웃었다 — 행동력 +1', tone: 'good' });
      },
    },
  },
  {
    id: 'x-tentacle-ring',
    name: '꿈틀대는 반지',
    icon: 'gi:ringed-tentacle',
    slot: 'trinket',
    rarity: 'rare',
    desc: '전투 시작 시 촉수 1, 정신력 -3 (강화마다 정신력 소모 -1)',
    hooks: {
      onCombatStart(c, s) {
        c.apply(c.p, 'tentacle', 1, c.p);
        c.loseSanity(Math.max(0, 3 - s.n));
      },
    },
  },
  {
    id: 'x-shackle',
    name: '쇠고랑 팔찌',
    icon: 'gi:manacles',
    slot: 'trinket',
    rarity: 'common',
    desc: '반격 피해 +3 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.tags.includes('counter')) d.add += 3 + s.n;
      },
    },
  },
  {
    id: 'x-sealed-eye',
    name: '봉인된 눈',
    icon: 'gi:semi-closed-eye',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '인장 폭발 피해 +25% (강화마다 +10%)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.tags.includes('detonate')) d.mult *= 1.25 + 0.1 * s.n;
      },
    },
  },
  {
    id: 'x-crushing-weight',
    name: '짓누르는 추',
    icon: 'gi:weight-crush',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '전투 시작 시 모든 적의 버팀 -1 (강화 2단계: -2)',
    hooks: {
      onCombatStart(c, s) {
        const n = s.n >= 2 ? 2 : 1;
        for (const e of c.alive) if (e.poise > 1) e.poise = Math.max(1, e.poise - n);
      },
    },
  },
  {
    id: 'x-fang-necklace',
    name: '송곳니 목걸이',
    icon: 'gi:fangs',
    slot: 'trinket',
    rarity: 'uncommon',
    desc: '적을 처치하면 전투 동안 힘 +1 (강화마다 처치 시 체력 +2)',
    hooks: {
      onKill(c, s) {
        c.apply(c.p, 'str', 1, c.p);
        if (s.n > 0) c.heal(c.p, 2 * s.n);
      },
    },
  },
  {
    id: 'x-slow-match',
    name: '화승',
    icon: 'gi:rope-coil',
    slot: 'trinket',
    rarity: 'common',
    desc: '화상 중인 적에게 주는 공격 피해 +2 (강화마다 +1)',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack && isEnemy(d.tgt) && (d.tgt.st.burn ?? 0) > 0) d.add += 2 + s.n;
      },
    },
  },
  {
    id: 'x-cardiac-vial',
    name: '강심제 앰플',
    icon: 'gi:heart-organ',
    slot: 'trinket',
    rarity: 'common',
    desc: '체력이 50% 이하면 턴 시작 시 방어도 4 (강화마다 +2)',
    hooks: {
      onTurnStart(c, s) {
        if (c.p.hp <= c.p.maxHp / 2) c.gainBlock(c.p, 4 + 2 * s.n);
      },
    },
  },
]);
