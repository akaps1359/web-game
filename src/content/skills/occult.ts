import { reg } from '../../engine/registry';
import { detonate, hit, skill } from '../lib';

/** 비술 — 인장 부여와 폭발, 의식 */
reg.skills([
  skill({
    id: 'sigil',
    name: '인장 각인',
    icon: 'gi:pentagram-rose',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark'],
    makes: ['mark'],
    reads: [],
    // 붕괴 개편: 출신마다 시작 덱에 버팀을 깨는 기술 하나 (군인 정조준 사격 · 사냥꾼 톱날 베기 · 학자 인장 각인)
    vals: { dmg: [4, 5], mark: [2, 3], poise: 1 },
    desc: '{D:dmg} 비전 피해, 인장 {mark}, 버팀 추가 -{poise}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'mark', u.v('mark'), c.p);
    },
  }),
  skill({
    id: 'detonate',
    name: '인장 폭발',
    icon: 'gi:explosion-rays',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark', 'detonate'],
    makes: [],
    reads: ['mark'],
    // 붕괴 개편: 학자는 인장을 새기고 터뜨려 버팀을 깬다 (시작 덱으로 약점을 못 치는 1층 적이 많다)
    vals: { base: [7, 9], per: [5, 7], poise: 1 },
    desc: '대상의 인장을 모두 터뜨려 {base} + 인장당 {per} 비전 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => {
      // 기본·인장당 피해도 위력(메아리·절약 각인)을 따른다
      if (t) detonate(c, u, t, Math.floor(u.v('per') * u.power), Math.floor(u.v('base') * u.power));
    },
  }),
  skill({
    id: 'arcane-bolt',
    name: '비전 화살',
    icon: 'gi:magic-swirl',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack'],
    makes: [],
    reads: [],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 비전 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  skill({
    id: 'circle',
    name: '보호의 원',
    icon: 'gi:magic-shield',
    school: 'occult',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['barrier'],
    makes: ['barrier'],
    reads: [],
    vals: { barrier: [7, 10] },
    desc: '보호막 {barrier} (턴이 지나도 유지)',
    run: (c, u) => void c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p),
  }),
  skill({
    id: 'chant',
    name: '영창',
    icon: 'gi:pentacle',
    school: 'occult',
    rarity: 'uncommon',
    cost: [1, 0],
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['buff', 'ritual'],
    makes: [],
    reads: [],
    vals: { n: 1 },
    desc: '의식 {n}: 매 턴 종료 시 힘 +{n}. 전투당 1회',
    run: (c, u) => void c.apply(c.p, 'ritual', u.v('n'), c.p),
  }),
  skill({
    id: 'chain-sigil',
    name: '연쇄 인장',
    icon: 'gi:linked-rings',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'mark', 'aoe'],
    makes: ['mark'],
    reads: [],
    vals: { dmg: 3, mark: [1, 2] },
    desc: '적 전체에 {D:dmg} 비전 피해, 인장 {mark}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'mark', u.v('mark'), c.p);
    },
  }),
  skill({
    id: 'ritual-burst',
    name: '대폭발 의식',
    icon: 'gi:star-swirl',
    school: 'occult',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'mark', 'detonate', 'aoe'],
    makes: [],
    reads: ['mark'],
    vals: { per: [6, 8] },
    desc: '모든 적의 인장을 터뜨려 인장당 {per} 비전 피해',
    run: (c, u) => {
      const per = Math.floor(u.v('per') * u.power);
      for (const e of [...c.alive]) detonate(c, u, e, per);
    },
  }),
  skill({
    id: 'hex',
    name: '저주',
    icon: 'gi:cursed-star',
    school: 'occult',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    makes: ['expose', 'doom'],
    reads: [],
    // 파멸의 2차 생산 (상처의 문법): 비술이 가끔, 약하게 파멸을 건다
    vals: { weak: 2, vuln: [1, 2], doom: [5, 8] },
    desc: '약화 {weak}, 취약 {vuln}, 파멸 {doom}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'weak', u.v('weak'), c.p);
      c.apply(t, 'vuln', u.v('vuln'), c.p);
      if (!t.dead && t.hp > 0) c.apply(t, 'doom', u.v('doom'), c.p);
    },
  }),
]);
