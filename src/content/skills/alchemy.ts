import { reg } from '../../engine/registry';
import { guard, hit, skill } from '../lib';

/** 연금 — 독, 화상, 약품 */
reg.skills([
  skill({
    id: 'fire-flask',
    name: '화염 플라스크',
    icon: 'gi:fire-bottle',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'burn'],
    makes: ['burn'],
    reads: [],
    vals: { dmg: [4, 5], burn: [3, 4] },
    desc: '{D:dmg} 화염 피해, 화상 {burn}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'burn', u.v('burn'), c.p);
    },
  }),
  skill({
    id: 'poison-dart',
    name: '독침',
    icon: 'gi:dart',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'poison'],
    makes: ['poison'],
    reads: [],
    vals: { dmg: 2, poison: [4, 6] },
    desc: '{D:dmg} 관통 피해, 독 {poison}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'poison', u.v('poison'), c.p);
    },
  }),
  skill({
    id: 'catalyst',
    name: '촉매',
    icon: 'gi:bubbling-flask',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['poison'],
    makes: ['poison'],
    reads: ['poison'],
    vals: { mul: [2, 3] },
    desc: '대상의 독을 {mul}배로',
    run: (c, u, t) => {
      if (!t) return;
      const p = t.st.poison ?? 0;
      // 메아리(50%)·절약(75%)이면 늘어나는 양도 그만큼만 (x-arterial 과 같은 방식)
      const add = Math.floor(p * (u.v('mul') - 1) * Math.min(1, u.power));
      if (add > 0) c.apply(t, 'poison', add, c.p);
    },
  }),
  skill({
    id: 'acid-splash',
    name: '산성 투척',
    icon: 'gi:acid',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'front',
    type: 'fire',
    tags: ['attack', 'aoe', 'debuff'],
    makes: [],
    reads: ['expose'],
    vals: { dmg: [4, 6], corrode: [1, 2] },
    desc: '전열의 모든 적에게 {D:dmg} 화염 피해, 부식 {corrode}. 약화나 취약 상태인 적은 부식 2배',
    run: (c, u, t) => {
      const units = new Set(hit(c, u, t).map((d) => d.tgt));
      // 남이 건 약화·취약을 읽는다 (상처의 문법 — 공용 키워드)
      for (const e of units) if (e.hp > 0) c.apply(e, 'corrode', u.v('corrode') * ((e.st.weak ?? 0) > 0 || (e.st.vuln ?? 0) > 0 ? 2 : 1), c.p);
    },
  }),
  skill({
    id: 'smoke-veil',
    name: '연막',
    icon: 'gi:smoke-bomb',
    school: 'alchemy',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'debuff'],
    makes: ['block', 'expose'],
    reads: [],
    vals: { blk: [6, 8], weak: 1 },
    desc: '방어도 {B:blk}, 적 전체 약화 {weak}',
    run: (c, u) => {
      guard(c, u);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  skill({
    id: 'quicksilver',
    name: '수은 강장제',
    icon: 'gi:standing-potion',
    school: 'alchemy',
    rarity: 'uncommon',
    cost: 0,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal', 'energy'],
    makes: [],
    reads: [],
    vals: { heal: [4, 6] },
    desc: '체력 {heal} 회복, 다음 턴 행동력 +1',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      c.apply(c.p, 'energized', 1, c.p);
    },
  }),
  skill({
    id: 'inferno',
    name: '업화',
    icon: 'gi:fire-wave',
    school: 'alchemy',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'fire',
    tags: ['attack', 'aoe', 'burn'],
    makes: [],
    reads: ['burn'],
    vals: { dmg: [6, 8] },
    desc: '적 전체에 {D:dmg} 화염 피해. 화상 중인 적은 화상 수치만큼 추가 피해',
    run: (c, u) => {
      for (const e of [...c.alive]) {
        // 화상 추가 피해도 위력(메아리·절약 각인)을, 속성은 공허 각인을 따른다
        const extra = Math.floor((e.st.burn ?? 0) * u.power);
        c.damage({ src: c.p, tgt: e, base: u.v('dmg') + extra, type: u.type ?? 'fire', attack: true, skill: u });
      }
    },
  }),
  skill({
    id: 'transmute',
    name: '변성',
    icon: 'gi:erlenmeyer',
    school: 'alchemy',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['attack', 'poison', 'burn'],
    makes: [],
    reads: ['poison', 'burn'],
    type: 'fire',
    vals: { pct: [100, 150] },
    desc: '대상의 독과 화상을 더한 값의 {pct}%만큼 즉시 화염 피해. 독·화상은 남는다',
    run: (c, u, t) => {
      if (!t) return;
      const n = Math.floor((((t.st.poison ?? 0) + (t.st.burn ?? 0)) * u.v('pct') * u.power) / 100);
      if (n > 0) c.damage({ src: c.p, tgt: t, base: n, type: u.type ?? 'fire', attack: true, skill: u });
    },
  }),
]);
