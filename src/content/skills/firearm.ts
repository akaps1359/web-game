import { reg } from '../../engine/registry';
import { guard, hit, lockGuns, needAmmo, reload, skill, spendAmmo } from '../lib';

/**
 * 사격 — 탄약과 조준.
 * 2026-10-21 군인 트레이드오프 ("원래 다른 캐릭터보다 강력하지만 재장전의 제약을 많이 받도록", GDD 10.10): 총으로 주는 피해 ×1.4 (모든 계열의 총 기술),
 * 대신 재장전이 무겁다 — 행동력 1·장전 중(그 턴에는 더 쏘지 못한다)·빈 총은 두 발씩만 (content/lib.ts lockGuns·slowLoad)
 */
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
    vals: { dmg: [14, 18], poise: 1 },
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
    // 2026-10-21 군인 트레이드오프 (GDD 10.10): 행동력 0 → 1, 쓰면 장전 중 (그 턴에는 더 쏘지 못한다) — 총이 세진 만큼 재장전이 무겁다
    cost: 1,
    // 2026-10 최종 밸런스: 2(강화 1) → 3(강화 2). 행동력 없이 조준(다음 관통 2배)을 두 턴마다 거저 얻어 군인이 혼자 높았다
    cd: [3, 2],
    range: 'self',
    target: 'self',
    tags: ['ammo', 'aim'],
    makes: ['ammo', 'aim'],
    reads: [],
    // 조준 1 → 2 (2026-10-21): 비싸게(행동력 1·장전 중) 장전한 만큼 다음 턴의 두 발이 치명 — 버팀이 두꺼운 상대에서 공짜 조준을 잃은 만큼을 메운다
    vals: { aim: 2 },
    desc: '탄약을 가득 채우고 조준 {aim}. 장전 중 — 이번 턴에는 더 쏠 수 없다',
    run: (c, u) => {
      reload(c);
      c.apply(c.p, 'aim', u.v('aim'), c.p);
      lockGuns(c);
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
    vals: { dmg: [6, 7], hits: 4 },
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
    vals: { dmg: [21, 27], behind: [11, 14] },
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
    vals: { dmg: [10, 13], weak: 2, poise: 1 },
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
    vals: { dmg: [7, 10] },
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
    vals: { dmg: [7, 10], weak: 1 },
    desc: '탄약 2: 적 전체에 {D:dmg} 관통 피해, 약화 {weak}',
    canUse: needAmmo(2),
    run: (c, u, t) => {
      spendAmmo(c, 2);
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
]);
