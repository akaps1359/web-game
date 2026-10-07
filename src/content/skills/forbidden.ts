import { reg } from '../../engine/registry';
import { hit, skill } from '../lib';

/**
 * 금기 — 정신력을 대가로, 통찰 비례.
 * 2026-10 통찰 개편: 통찰이 귀해졌으므로(보통 판 2~4, 일부러 모으면 6~8) 통찰 1당 수치(per)를 대략 2배로.
 */
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
    makes: ['sanity'],
    reads: [],
    vals: { dmg: [8, 10], per: [4, 6], san: 2 },
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
    makes: ['tentacle', 'sanity'],
    reads: [],
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
    makes: ['sanity'],
    reads: [],
    vals: { dmg: [13, 17], madden: 2, san: 5 },
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
    makes: ['barrier', 'sanity'],
    reads: [],
    vals: { barrier: [8, 12], per: 4, san: 3 },
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
    makes: [],
    reads: [],
    vals: { maxsan: [8, 6], max: 2 },
    desc: '최대 정신력 -{maxsan}, 통찰 +1 (둘 다 영구). 전투당 1회. 이 기술로 얻는 통찰은 판 전체에서 {max}까지',
    // 통찰은 얻기 어려워야 한다 (2026-10 개편): 정신력을 조금 쓰고 전투마다 쌓던 것을, 영구 대가를 치르고 판 전체에서 몇 번만.
    // 2026-10 2차: 판당 3·최대 정신력 -4는 대가가 가벼웠다 → 판당 2, -8 (강화 -6). 이벤트·신전 봉헌의 통찰 +1과 같은 값
    // 얼마나 응시했는지는 판에 남는다 (run.gazed) — 기술을 잃었다 다시 얻어도 이어진다
    canUse: (c, u) =>
      (c.run.gazed ?? 0) >= u.v('max') ? '더 들여다볼 심연이 없다' : c.p.maxSanity - u.v('maxsan') < 10 ? '더 내어 줄 정신이 없다' : null,
    run: (c, u) => {
      if (u.echo || (c.run.gazed ?? 0) >= u.v('max')) return;
      const p = c.p;
      p.maxSanity = Math.max(10, p.maxSanity - u.v('maxsan'));
      if (p.sanity > p.maxSanity) {
        c.emit({ t: 'sanity', delta: p.maxSanity - p.sanity });
        p.sanity = p.maxSanity;
      }
      c.run.gazed = (c.run.gazed ?? 0) + 1;
      c.gainInsight(1);
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
    makes: ['doom', 'sanity'],
    reads: [],
    vals: { doom: [8, 12], per: 4, san: 3 },
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
    makes: [],
    reads: [],
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
    makes: ['sanity'],
    reads: [],
    vals: { dmg: [14, 18], per: 4, san: 8 },
    desc: '정신력 {san} 소모. 적 전체에 {D:dmg} + 통찰×{per} 공허 피해 (방어도 무시)',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * c.p.insight * u.power), ignoreBlock: true });
    },
  }),
]);
