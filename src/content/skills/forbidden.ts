import { reg } from '../../engine/registry';
import { hit, skill } from '../lib';

/** 금기 — 정신력을 대가로, 통찰 비례 */
reg.skills([
  skill({
    id: 'whisper-void',
    name: '공허의 속삭임',
    icon: 'gi:screaming',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity', 'insight'],
    vals: { dmg: [6, 8], per: [2, 3], san: 2 },
    desc: '정신력 {san} 소모. {D:dmg} + 통찰×{per} 공허 피해',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      // 통찰 비례 피해도 위력(메아리·절약 각인)을 따른다
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * c.p.insight * u.power) });
    },
  }),
  skill({
    id: 'tentacle-call',
    name: '촉수 소환',
    icon: 'gi:tentacle-strike',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: [1, 0],
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['summon', 'sanity'],
    vals: { n: 1, san: 4 },
    desc: '정신력 {san} 소모. 촉수 {n} (턴 종료마다 무작위 적 공격)',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      c.apply(c.p, 'tentacle', u.v('n'), c.p);
    },
  }),
  skill({
    id: 'mind-rend',
    name: '정신 찢기',
    icon: 'gi:brain-tentacle',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity', 'debuff'],
    vals: { dmg: [10, 14], madden: 2, san: 5 },
    desc: '정신력 {san} 소모. {D:dmg} 공허 피해, 광란 {madden}',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'madden', u.v('madden'), c.p);
    },
  }),
  skill({
    id: 'eldritch-ward',
    name: '이계의 갑주',
    icon: 'gi:tentacles-barrier',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['barrier', 'sanity', 'insight'],
    vals: { barrier: [8, 12], per: 2, san: 3 },
    desc: '정신력 {san} 소모. 보호막 {barrier} + 통찰×{per}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      c.apply(c.p, 'barrier', Math.floor((u.v('barrier') + u.v('per') * c.p.insight) * u.power), c.p);
    },
  }),
  skill({
    id: 'gaze-abyss',
    name: '심연 응시',
    icon: 'gi:eye-of-horus',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 0,
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['insight', 'sanity'],
    vals: { san: [6, 4], max: 6 },
    desc: '정신력 {san} 소모. 통찰 +1 (영구, 통찰 {max}까지). 전투당 1회',
    // 전투마다 공짜로 통찰을 쌓으면 판 끝에는 30을 넘고, 통찰 비례 금기 스킬이 끝없이 강해진다.
    // 통찰의 대가(받는 정신 피해 +5%/통찰)도 6에서 멈추므로 응시로는 그 지점까지만 오른다.
    canUse: (c, u) => (c.p.insight >= u.v('max') ? '더 들여다볼 심연이 없다' : null),
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (c.p.insight < u.v('max')) c.gainInsight(1);
    },
  }),
  skill({
    id: 'doom-word',
    name: '파멸의 언어',
    icon: 'gi:death-note',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'sanity', 'insight'],
    vals: { doom: [8, 12], per: 2, san: 3 },
    desc: '정신력 {san} 소모. 파멸 {doom} + 통찰×{per} (파멸이 체력 이상이면 그 적의 차례가 끝날 때 즉사)',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (t) c.apply(t, 'doom', u.v('doom') + u.v('per') * c.p.insight, c.p);
    },
  }),
  skill({
    id: 'blood-price',
    name: '피의 대가',
    icon: 'gi:bleeding-heart',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 0,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['energy', 'hp-cost'],
    vals: { hp: [5, 3], ap: 2 },
    desc: '체력 {hp} 소모. 행동력 +{ap}',
    run: (c, u) => {
      c.loseHp(c.p, u.v('hp'));
      // 메아리 사본은 행동력을 주지 않는다 (물 흐르듯과 같은 규칙)
      if (!u.echo) c.s.ap += u.v('ap');
    },
  }),
  skill({
    id: 'void-rift',
    name: '공허 균열',
    icon: 'gi:portal',
    school: 'forbidden',
    rarity: 'forbidden',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'sanity', 'insight'],
    vals: { dmg: [12, 16], per: 2, san: 8 },
    desc: '정신력 {san} 소모. 적 전체에 {D:dmg} + 통찰×{per} 공허 피해 (방어도 무시)',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * c.p.insight * u.power), ignoreBlock: true });
    },
  }),
]);
