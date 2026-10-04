import { reg } from '../../engine/registry';
import { DMG_TYPES, type SkillDef } from '../../engine/types';
import { guard, hit, skill } from '../lib';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 잠든 자
  ess({
    id: 'ess-sleeper-dream',
    name: '꿈의 파도',
    icon: 'gi:wave-crest',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [10, 13], madden: 1 },
    desc: '적 전체에 {D:dmg} 공허 피해, 광란 {madden}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'madden', u.v('madden'), c.p);
    },
  }),
  ess({
    id: 'ess-sleeper-maw',
    name: '세계를 삼키는 아가리',
    icon: 'gi:tentacles-skull',
    rarity: 'rare',
    cost: 3,
    cd: 4,
    range: 'melee',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [45, 56], heal: [8, 10] },
    desc: '{D:dmg} 공허 피해, 체력 {heal} 회복',
    run: (c, u, t) => {
      hit(c, u, t);
      c.heal(c.p, u.v('heal'));
    },
  }),
  ess({
    id: 'ess-sleeper-storm',
    name: '촉수 폭풍',
    icon: 'gi:interlaced-tentacles',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [6, 7], hits: 5 },
    desc: '무작위 적에게 {D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 르뤼에의 문지기
  ess({
    id: 'ess-rlyeh-warden-fist',
    name: '봉인의 주먹',
    icon: 'gi:rock-golem',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [20, 25], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-rlyeh-warden-wall',
    name: '기하학의 벽',
    icon: 'gi:stone-wall',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'retain'],
    vals: { blk: [14, 18] },
    desc: '방어도 {B:blk}. 다음 턴까지 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'retain', 1, c.p);
    },
  }),
  // 꿈의 대사제
  ess({
    id: 'ess-dream-hierophant-sermon',
    name: '잠든 자의 설교',
    icon: 'gi:warlock-hood',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'sanity'],
    vals: { str: [2, 3], san: 4 },
    desc: '힘 +{str} (전투 동안), 정신력 -{san}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  ess({
    id: 'ess-dream-hierophant-spear',
    name: '검은 물의 창',
    icon: 'gi:water-bolt',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'multi'],
    vals: { dmg: [8, 10], hits: 2 },
    desc: '{D:dmg} 공허 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
]);

// ───────────── 정수 정의 ─────────────

reg.essences([
  {
    id: 'sleeper',
    name: '잠든 자의 정수',
    icon: 'gi:octopus',
    grade: 1,
    eldritch: true,
    stats: { maxHp: 20, str: 3, will: 3 },
    passive: {
      name: '영원한 꿈',
      desc: '전투 시작 시 촉수 2 (턴 종료마다 무작위 적 공격)',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'tentacle', 2 * s.n, c.p);
        },
      },
    },
    actives: ['ess-sleeper-dream', 'ess-sleeper-maw', 'ess-sleeper-storm'],
    colors: ['심해의 청록', '르뤼에의 녹색', '별들의 검정'],
  },
  {
    id: 'rlyeh-warden',
    name: '르뤼에 문지기의 정수',
    icon: 'gi:rock-golem',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 16, str: 2, dex: 1 },
    passive: {
      name: '어긋난 각도',
      desc: '직전에 받은 공격과 같은 속성으로 맞으면 그 피해 -30%',
      hooks: {
        modDamageIn(c, _s, d) {
          if (d.tgt !== c.p || !d.attack || d.type === 'true') return;
          if (c.s.vars.a5angle === DMG_TYPES.indexOf(d.type) + 1) d.mult *= 0.7;
        },
        onDamageTaken(c, _s, d) {
          if (d.tgt !== c.p || !d.attack || d.type === 'true') return;
          c.s.vars.a5angle = DMG_TYPES.indexOf(d.type) + 1;
        },
      },
    },
    actives: ['ess-rlyeh-warden-fist', 'ess-rlyeh-warden-wall'],
    colors: ['현무암 회색', '비유클리드 녹색'],
  },
  {
    id: 'dream-hierophant',
    name: '꿈의 대사제의 정수',
    icon: 'gi:warlock-hood',
    grade: 2,
    stats: { maxHp: 12, will: 3, maxSanity: 5 },
    passive: {
      name: '끝없는 기도',
      desc: '내 턴이 끝날 때 정신력 +2',
      hooks: {
        onTurnEnd(c, s) {
          c.gainSanity(2 * s.n);
        },
      },
    },
    actives: ['ess-dream-hierophant-sermon', 'ess-dream-hierophant-spear'],
    colors: ['심해 사제의 남색', '검은 물'],
  },
]);
