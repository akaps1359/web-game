import { reg } from '../../engine/registry';
import { guard, hit, needAmmo, reload, skill, spendAmmo } from '../lib';

/** 사격 — 탄약과 조준 */
reg.skills([
  skill({
    id: 'aimed-shot',
    name: '정조준 사격',
    icon: 'gi:bullseye',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun'],
    makes: [],
    reads: ['ammo'],
    vals: { dmg: [10, 13], poise: 1 },
    desc: '탄약 1: {D:dmg} 관통 피해, 버팀 추가 -{poise}',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
    },
  }),
  skill({
    id: 'reload',
    name: '재장전',
    icon: 'gi:revolver',
    school: 'firearm',
    rarity: 'common',
    cost: 0,
    // 2026-10 최종 밸런스: 2(강화 1) → 3(강화 2). 행동력 없이 조준(다음 관통 2배)을 두 턴마다 거저 얻어 군인이 혼자 높았다
    cd: [3, 2],
    range: 'self',
    target: 'self',
    tags: ['ammo', 'aim'],
    makes: ['ammo', 'aim'],
    reads: [],
    vals: { aim: 1 },
    desc: '탄약을 가득 채우고 조준 {aim}',
    run: (c, u) => {
      reload(c);
      c.apply(c.p, 'aim', u.v('aim'), c.p);
    },
  }),
  skill({
    id: 'fan-fire',
    name: '난사',
    icon: 'gi:crossed-pistols',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'multi'],
    makes: [],
    reads: ['ammo'],
    vals: { dmg: [4, 5], hits: 4 },
    desc: '탄약 3: {D:dmg} 관통 피해 {hits}회, 매번 무작위 적에게',
    canUse: needAmmo(3),
    run: (c, u, t) => {
      spendAmmo(c, 3);
      hit(c, u, t);
    },
  }),
  skill({
    id: 'take-aim',
    name: '숨 고르기',
    icon: 'gi:crosshair',
    school: 'firearm',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'aim'],
    makes: ['block', 'aim'],
    reads: [],
    vals: { blk: [5, 8], aim: 1 },
    desc: '방어도 {B:blk}, 조준 {aim}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'aim', u.v('aim'), c.p);
    },
  }),
  skill({
    id: 'piercing-round',
    name: '철갑탄',
    icon: 'gi:supersonic-bullet',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun'],
    makes: [],
    reads: ['ammo'],
    vals: { dmg: [15, 19], behind: [8, 10] },
    desc: '탄약 1: {D:dmg} 관통 피해. 총알이 관통해 대상과 다른 열의 무작위 적 하나에게도 {behind} 관통 피해',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
      if (!t) return;
      const other = c.row(t.row === 0 ? 1 : 0);
      // 관통 피해도 위력(메아리·절약 각인)과 속성 변환(공허 각인)을 따른다
      if (other.length) c.damage({ src: c.p, tgt: c.rng.pick(other), base: Math.floor(u.v('behind') * u.power), type: u.type ?? 'pierce', attack: true, skill: u });
    },
  }),
  skill({
    id: 'kneecap',
    name: '무릎 사격',
    icon: 'gi:leg',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'debuff'],
    makes: ['expose'],
    reads: ['ammo'],
    vals: { dmg: [7, 9], weak: 2, poise: 1 },
    desc: '탄약 1: {D:dmg} 관통 피해, 약화 {weak}, 버팀 추가 -{poise}',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      spendAmmo(c, 1);
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  skill({
    id: 'last-bullet',
    name: '마지막 탄창',
    icon: 'gi:bullets',
    school: 'firearm',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    // 탄약 수만큼 여러 번 타격한다 (vals.hits가 없어 태그로 알린다 — 시궁쥐 떼 '무리 근성' 등)
    tags: ['attack', 'ammo', 'gun', 'multi'],
    makes: [],
    reads: ['ammo'],
    vals: { dmg: [5, 7] },
    desc: '남은 탄약을 모두 소모. 탄약 1발당 {D:dmg} 관통 피해 1회',
    canUse: needAmmo(1),
    run: (c, u, t) => {
      const n = c.s.ammo;
      spendAmmo(c, n);
      hit(c, u, t, { hits: n });
    },
  }),
  skill({
    id: 'suppress',
    name: '제압 사격',
    icon: 'gi:machine-gun-magazine',
    school: 'firearm',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'pierce',
    tags: ['attack', 'ammo', 'gun', 'aoe', 'debuff'],
    makes: ['expose'],
    reads: ['ammo'],
    vals: { dmg: [5, 7], weak: 1 },
    desc: '탄약 2: 적 전체에 {D:dmg} 관통 피해, 약화 {weak}',
    canUse: needAmmo(2),
    run: (c, u, t) => {
      spendAmmo(c, 2);
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
]);
