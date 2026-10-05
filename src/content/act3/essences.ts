import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import type { SkillDef } from '../../engine/types';
import { dealt, guard, hit, killed, skill } from '../lib';
import { chipPoise, FROST, frost, melt, swapRows } from './common';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

/** 해부학자의 「적출」이 떼어 갈 수 있는 이로운 효과 */
const EXTRACTABLE = ['str', 'barrier', 'regen', 'evasive', 'ward', 'ritual', 'harden', 'thorns', 'spikes'];

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 밤의 마귀
  ess({
    id: 'ess-nightgaunt-tickle',
    name: '간지럼',
    icon: 'gi:feather',
    rarity: 'uncommon',
    cost: [1, 0],
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { weak: 2, madden: 1 },
    desc: '약화 {weak}, 광란 {madden} (공격이 동료를 향할 수 있다)',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'weak', u.v('weak'), c.p);
      c.apply(t, 'madden', u.v('madden'), c.p);
    },
  }),
  ess({
    id: 'ess-nightgaunt-snatch',
    name: '낚아채기',
    icon: 'gi:bat-wing',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'push'],
    vals: { dmg: [9, 12] },
    desc: '{D:dmg} 타격 피해. 전열의 적이면 후열로 날려 보낸다',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead && t.row === 0) c.moveRow(t, 1);
    },
  }),
  // 유고스의 균류
  ess({
    id: 'ess-migo-extract',
    name: '뇌 적출',
    icon: 'gi:brain',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'sanity'],
    vals: { dmg: [9, 12], san: 6 },
    desc: '{D:dmg} 비전 피해. 처치하면 정신력 +{san}',
    run: (c, u, t) => {
      if (killed(hit(c, u, t))) c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-migo-surgery',
    name: '외계의 수술',
    icon: 'gi:scalpel',
    rarity: 'uncommon',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal'],
    vals: { heal: [8, 12] },
    desc: '체력 {heal} 회복, 출혈·독·화상 제거',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      for (const id of ['bleed', 'poison', 'burn']) c.clear(c.p, id);
    },
  }),
  // 각도의 사냥개
  ess({
    id: 'ess-tindalos-pounce',
    name: '모서리 습격',
    icon: 'gi:hound',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [9, 12] },
    desc: '{D:dmg} 참격 피해. 후열의 적에게는 1.5배',
    run: (c, u, t) => void hit(c, u, t, { dmg: Math.floor(u.v('dmg') * (t && t.row === 1 ? 1.5 : 1)) }),
  }),
  ess({
    id: 'ess-tindalos-ichor',
    name: '푸른 고름',
    icon: 'gi:dripping-goo',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'debuff'],
    vals: { dmg: [4, 6], corrode: [2, 3] },
    desc: '{D:dmg} 공허 피해, 부식 {corrode} (받는 공격 피해 증가, 전투 동안)',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'corrode', u.v('corrode'), c.p);
    },
  }),
  // 쇼고스 유충
  ess({
    id: 'ess-shoggoth-spawn-engulf',
    name: '집어삼키기',
    icon: 'gi:transparent-slime',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'heal'],
    vals: { dmg: [16, 20], heal: [4, 6] },
    desc: '{D:dmg} 타격 피해, 체력 {heal} 회복',
    run: (c, u, t) => {
      hit(c, u, t);
      c.heal(c.p, u.v('heal'));
    },
  }),
  ess({
    id: 'ess-shoggoth-spawn-reform',
    name: '재형성',
    icon: 'gi:slime',
    rarity: 'uncommon',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal', 'block'],
    vals: { blk: [5, 7], regen: [4, 6] },
    desc: '방어도 {B:blk}, 재생 {regen}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'regen', u.v('regen'), c.p);
    },
  }),
  // 렝의 거미
  ess({
    id: 'ess-leng-spider-spit',
    name: '독액 뱉기',
    icon: 'gi:web-spit',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'poison'],
    vals: { dmg: [4, 5], poison: [3, 4] },
    desc: '{D:dmg} 관통 피해, 독 {poison}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'poison', u.v('poison'), c.p);
    },
  }),
  ess({
    id: 'ess-leng-spider-web',
    name: '서릿실 거미줄',
    icon: 'gi:spider-web',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 1, poise: 1 },
    desc: '적 전체 약화 {weak}, 버팀 -{poise}',
    run: (c, u) => {
      for (const e of [...c.alive]) {
        c.apply(e, 'weak', u.v('weak'), c.p);
        chipPoise(c, e, u.v('poise'));
      }
    },
  }),
  // 렝의 대거미
  ess({
    id: 'ess-leng-broodmother-cocoon',
    name: '고치 감기',
    icon: 'gi:cobweb',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'poison'],
    vals: { stun: 1, poison: [4, 6] },
    desc: '기절 {stun}, 독 {poison}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'stun', u.v('stun'), c.p);
      c.apply(t, 'poison', u.v('poison'), c.p);
    },
  }),
  ess({
    id: 'ess-leng-broodmother-swarm',
    name: '새끼 거미 떼',
    icon: 'gi:spider-face',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'multi', 'poison'],
    vals: { dmg: [3, 4], hits: 4, poison: 1 },
    desc: '무작위 적에게 {D:dmg} 관통 피해 {hits}회, 맞을 때마다 독 {poison}',
    run: (c, u, t) => {
      for (const d of hit(c, u, t)) if (isEnemy(d.tgt) && !d.tgt.dead) c.apply(d.tgt, 'poison', u.v('poison'), c.p);
    },
  }),
  // 샨탁
  ess({
    id: 'ess-shantak-dive',
    name: '급강하',
    icon: 'gi:crow-dive',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [18, 23], poise: 1 },
    desc: '{D:dmg} 관통 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-shantak-gale',
    name: '날개 폭풍',
    icon: 'gi:wing-cloak',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'blunt',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [4, 6], weak: 1 },
    desc: '적 전체에 {D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  // 쇼고스 (수호자)
  ess({
    id: 'ess-shoggoth-pseudopods',
    name: '위족 난타',
    icon: 'gi:curled-tentacle',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [5, 6], hits: 5 },
    desc: '무작위 적에게 {D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-shoggoth-absorb',
    name: '흡수',
    icon: 'gi:gooey-eyed-sun',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 공허 피해. 입힌 피해의 절반만큼 체력 회복',
    run: (c, u, t) => {
      const n = Math.floor(dealt(hit(c, u, t)) / 2);
      if (n > 0) c.heal(c.p, n);
    },
  }),
  ess({
    id: 'ess-shoggoth-tide',
    name: '원형질 해일',
    icon: 'gi:goo-explosion',
    rarity: 'rare',
    cost: [3, 2],
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'blunt',
    tags: ['attack', 'aoe'],
    vals: { dmg: [14, 18] },
    desc: '적 전체에 {D:dmg} 타격 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 각도의 왕 (수호자)
  ess({
    id: 'ess-angle-king-fang',
    name: '시간의 송곳니',
    icon: 'gi:bestial-fangs',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'debuff'],
    vals: { dmg: [8, 10], corrode: 1 },
    desc: '{D:dmg} 참격 피해, 부식 {corrode}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'corrode', u.v('corrode'), c.p);
    },
  }),
  ess({
    id: 'ess-angle-king-twist',
    name: '각도 비틀기',
    icon: 'gi:moebius-triangle',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 1 },
    desc: '적의 전열과 후열을 뒤바꾸고, 적 전체 약화 {weak}',
    run: (c, u) => {
      swapRows(c);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-angle-king-rend',
    name: '모든 각도에서',
    icon: 'gi:claw-slashes',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [7, 9], hits: 3 },
    desc: '{D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 프나스의 돌 (추적자)
  ess({
    id: 'ess-dhole-erupt',
    name: '분출',
    icon: 'gi:worm-mouth',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'debuff'],
    vals: { dmg: [18, 22], weak: 1 },
    desc: '{D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-dhole-burrow',
    name: '얼음 밑으로',
    icon: 'gi:earth-worm',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'retain'],
    vals: { blk: [8, 11] },
    desc: '방어도 {B:blk}. 다음 턴까지 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'retain', 2, c.p);
    },
  }),

  // ── 얼어붙은 고대 도시의 새 정수 액티브 ──

  // 눈먼 펭귄
  ess({
    id: 'ess-blind-penguin-peck',
    name: '소리를 쫓는 부리',
    icon: 'gi:penguin',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], max: 5 },
    desc: '{D:dmg} 관통 피해. 이번 턴 먼저 쓴 기술 하나마다 한 번 더 쫀다 (최대 {max}회)',
    run: (c, u, t) => void hit(c, u, t, { hits: Math.min(u.v('max'), 1 + c.s.used) }),
  }),
  ess({
    id: 'ess-blind-penguin-huddle',
    name: '몸 맞대기',
    icon: 'gi:ice-shield',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { blk: [7, 9] },
    desc: '동상을 모두 녹이고 방어도 {B:blk}',
    run: (c, u) => {
      melt(c, c.p, 99);
      guard(c, u);
    },
  }),
  // 동사한 탐사대원
  ess({
    id: 'ess-frozen-explorer-axe',
    name: '얼음도끼',
    icon: 'gi:war-axe',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [9, 12], poise: 1 },
    desc: '{D:dmg} 참격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-frozen-explorer-flare',
    name: '조명탄',
    icon: 'gi:firework-rocket',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'fire',
    tags: ['attack', 'aoe', 'burn'],
    vals: { dmg: [4, 6], burn: 2, light: 10 },
    desc: '적 전체에 {D:dmg} 화염 피해, 화상 {burn}. 등불 +{light}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'burn', u.v('burn'), c.p);
      c.run.light = Math.min(100, c.run.light + u.v('light'));
    },
  }),
  // 서리 망령
  ess({
    id: 'ess-frost-wraith-breath',
    name: '서리 숨결',
    icon: 'gi:ice-bolt',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'debuff'],
    vals: { dmg: [6, 8], frost: 2 },
    desc: '{D:dmg} 비전 피해, 동상 {frost} (5가 되면 적이 얼어붙어 한 차례 쉰다)',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) frost(c, t, u.v('frost'), c.p);
    },
  }),
  ess({
    id: 'ess-frost-wraith-drain',
    name: '온기 흡수',
    icon: 'gi:cold-heart',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [5, 7], heal: [3, 4] },
    desc: '{D:dmg} 공허 피해. 대상의 동상을 모두 거두어 1당 체력 {heal} 회복',
    run: (c, u, t) => {
      hit(c, u, t);
      const n = t?.st[FROST] ?? 0;
      if (t && n > 0) {
        if (!t.dead) c.apply(t, FROST, -n);
        c.heal(c.p, n * u.v('heal'));
      }
    },
  }),
  // 고대인 사냥꾼
  ess({
    id: 'ess-elder-hunter-collect',
    name: '표본 채집',
    icon: 'gi:eyestalk',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [9, 12], str: 1 },
    desc: '{D:dmg} 관통 피해. 이 공격으로 처치하면 이번 전투 동안 힘 +{str}',
    run: (c, u, t) => {
      if (killed(hit(c, u, t))) c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  ess({
    id: 'ess-elder-hunter-glide',
    name: '막날개 활공',
    icon: 'gi:bat-wing',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'evade'],
    vals: { blk: [6, 8], evade: 1 },
    desc: '방어도 {B:blk}, 회피 {evade}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'evasive', u.v('evade'), c.p);
    },
  }),
  // 그노프케
  ess({
    id: 'ess-gnoph-keh-horn',
    name: '뿔 들이받기',
    icon: 'gi:mighty-horn',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [16, 20], poise: 1 },
    desc: '{D:dmg} 관통 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-gnoph-keh-blizzard',
    name: '눈보라 부르기',
    icon: 'gi:snowing',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'evade'],
    vals: { frost: 2, evade: 1 },
    desc: '적 전체에 동상 {frost}. 회피 {evade}',
    run: (c, u) => {
      for (const e of [...c.alive]) frost(c, e, u.v('frost'), c.p);
      c.apply(c.p, 'evasive', u.v('evade'), c.p);
    },
  }),
  // 해부된 썰매개
  ess({
    id: 'ess-sled-dog-nape',
    name: '목덜미 물기',
    icon: 'gi:wolf-howl',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    vals: { dmg: [4, 5], hits: 2, bleed: 2 },
    desc: '{D:dmg} 참격 피해 {hits}회, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-sled-dog-howl',
    name: '꿰맨 목의 울부짖음',
    icon: 'gi:screaming',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'buff'],
    vals: { weak: 1, str: 1 },
    desc: '적 전체 약화 {weak}. 이번 전투 동안 힘 +{str}',
    run: (c, u) => {
      for (const e of [...c.alive]) c.apply(e, 'weak', u.v('weak'), c.p);
      c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  // 고대인 해부학자 (정예)
  ess({
    id: 'ess-elder-vivisector-scalpels',
    name: '다섯 개의 메스',
    icon: 'gi:scalpel-strike',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi', 'bleed'],
    vals: { dmg: [3, 4], hits: 4, bleed: 1 },
    desc: '{D:dmg} 참격 피해 {hits}회, 맞을 때마다 출혈 {bleed}',
    run: (c, u, t) => {
      for (const d of hit(c, u, t)) if (isEnemy(d.tgt) && !d.tgt.dead && d.amount > 0) c.apply(d.tgt, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-elder-vivisector-extract',
    name: '적출',
    icon: 'gi:internal-organ',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'debuff', 'buff'],
    vals: { dmg: [6, 8] },
    desc: '{D:dmg} 비전 피해. 대상의 이로운 효과(힘·보호막·재생·회피 등)를 모두 떼어 내 것으로 삼는다',
    run: (c, u, t) => {
      hit(c, u, t);
      if (!t || t.dead) return;
      for (const id of EXTRACTABLE) {
        const v = t.st[id] ?? 0;
        if (v <= 0) continue;
        c.apply(t, id, -v);
        c.apply(c.p, id, v, c.p);
      }
    },
  }),
  // 산맥 너머의 것 (수호자)
  ess({
    id: 'ess-beyond-peaks-gaze',
    name: '보랏빛 응시',
    icon: 'gi:eye-target',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'insight'],
    vals: { dmg: [8, 10], per: 2 },
    desc: '{D:dmg} 공허 피해. 통찰 1당 피해 +{per}',
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') + u.v('per') * Math.min(8, c.p.insight) }),
  }),
  ess({
    id: 'ess-beyond-peaks-mist',
    name: '증기의 장막',
    icon: 'gi:fog',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'evade'],
    vals: { blk: [12, 15], evade: 1 },
    desc: '방어도 {B:blk}, 회피 {evade}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'evasive', u.v('evade'), c.p);
    },
  }),
  ess({
    id: 'ess-beyond-peaks-truth',
    name: '그것을 보았다',
    icon: 'gi:peaks',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'sanity'],
    vals: { dmg: [16, 20], san: 6 },
    desc: '적 전체에 {D:dmg} 공허 피해. 정신력 -{san}',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (!c.over) hit(c, u, t);
    },
  }),
  // 깨어난 원로 (계층군주)
  ess({
    id: 'ess-awakened-elder-tentacles',
    name: '다섯 갈래 촉수',
    icon: 'gi:sea-star',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [5, 6], hits: 5 },
    desc: '무작위 적에게 {D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-awakened-elder-pipe',
    name: '명령의 피리',
    icon: 'gi:pan-flute',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { madden: 2, weak: 1 },
    desc: '광란 {madden} (공격이 동료를 향할 수 있다), 약화 {weak}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'madden', u.v('madden'), c.p);
      c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-awakened-elder-wings',
    name: '별을 건너온 날개',
    icon: 'gi:evil-wings',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['block', 'energy'],
    vals: { blk: [10, 13], ap: 1 },
    desc: '방어도 {B:blk}. 다음 턴 행동력 +{ap}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'energized', u.v('ap'), c.p);
    },
  }),
  // 시간에 얼어붙은 탐사대장 (균열 수호자)
  ess({
    id: 'ess-frozen-leader-moment',
    name: '되돌아온 순간',
    icon: 'gi:frozen-block',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [18, 23] },
    desc: '{D:dmg} 참격 피해. 붕괴한 적에게는 1.5배',
    run: (c, u, t) => void hit(c, u, t, { dmg: Math.floor(u.v('dmg') * (t && t.broken > 0 ? 1.5 : 1)) }),
  }),
  ess({
    id: 'ess-frozen-leader-journal',
    name: '탐사 일지',
    icon: 'gi:notebook',
    rarity: 'rare',
    cost: 0,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['insight'],
    vals: { san: 4 },
    desc: '이번 전투의 모든 적의 약점이 드러난다. 정신력 -{san}',
    run: (c, u) => {
      for (const e of c.alive) {
        for (const w of e.weak) {
          if (e.known.includes(w)) continue;
          e.known.push(w);
          c.emit({ t: 'reveal', uid: e.uid, dtype: w });
        }
      }
      c.loseSanity(u.v('san'));
    },
  }),
]);

// ───────────── 정수 정의 ─────────────

reg.essences([
  {
    id: 'nightgaunt',
    name: '밤의 마귀의 정수',
    icon: 'gi:evil-bat',
    grade: 6,
    eldritch: true,
    stats: { maxHp: 8, dex: 1 },
    passive: {
      name: '얼굴 없는 사냥',
      desc: '후열의 적에게 주는 공격 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && d.tgt.row === 1) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-nightgaunt-tickle', 'ess-nightgaunt-snatch'],
    colors: ['고무빛 검정', '박쥐 날개 회색'],
  },
  {
    id: 'migo',
    name: '유고스 균류의 정수',
    icon: 'gi:mushroom-gills',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 8, will: 2 },
    passive: {
      name: '외과적 정밀함',
      desc: '약점 속성으로 공격하면 피해 +2',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type)) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-migo-extract', 'ess-migo-surgery'],
    colors: ['균사 분홍', '유고스의 잿빛'],
  },
  {
    id: 'tindalos',
    name: '각도의 사냥개의 정수',
    icon: 'gi:hound',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 9, str: 1 },
    passive: {
      name: '푸른 굶주림',
      desc: '적을 처치할 때마다 체력 3 회복',
      hooks: {
        onKill(c, s) {
          c.heal(c.p, 3 * s.n);
        },
      },
    },
    actives: ['ess-tindalos-pounce', 'ess-tindalos-ichor'],
    colors: ['예각의 남색', '고름빛 청록'],
  },
  {
    id: 'shoggoth-spawn',
    name: '쇼고스 유충의 정수',
    icon: 'gi:transparent-slime',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 12 },
    passive: {
      name: '원형질',
      desc: '적의 턴마다 처음 받는 공격 피해 -3',
      hooks: {
        onTurnStart(_c, s) {
          delete s.unit.st._a3ooze;
        },
        onTurnEnd(_c, s) {
          s.unit.st._a3ooze = 1;
        },
        modDamageIn(c, s, d) {
          if (d.attack && d.tgt === c.p && s.unit.st._a3ooze) d.add -= 3 * s.n;
        },
        onDamageTaken(c, s, d) {
          if (d.attack && d.tgt === c.p) delete s.unit.st._a3ooze;
        },
      },
    },
    actives: ['ess-shoggoth-spawn-engulf', 'ess-shoggoth-spawn-reform'],
    colors: ['원형질 초록', '검은 점액'],
  },
  {
    id: 'leng-spider',
    name: '렝의 거미의 정수',
    icon: 'gi:long-legged-spider',
    grade: 6,
    eldritch: true,
    stats: { maxHp: 8, dex: 1 },
    passive: {
      name: '독샘',
      desc: '적에게 독을 부여할 때 +1',
      hooks: {
        modApply(_c, s, target, id, n) {
          return id === 'poison' && isEnemy(target) ? n + s.n : n;
        },
      },
    },
    actives: ['ess-leng-spider-spit', 'ess-leng-spider-web'],
    colors: ['렝의 보라', '서릿실 은빛'],
  },
  {
    id: 'leng-broodmother',
    name: '렝의 대거미의 정수',
    icon: 'gi:hanging-spider',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 13, dex: 2 },
    passive: {
      name: '산란',
      desc: '적을 처치하면 무작위 적에게 독 5',
      hooks: {
        onKill(c, s) {
          const pool = c.alive;
          if (pool.length) c.apply(c.rng.pick(pool), 'poison', 5 * s.n, c.p);
        },
      },
    },
    actives: ['ess-leng-broodmother-cocoon', 'ess-leng-broodmother-swarm'],
    colors: ['어미의 자줏빛', '고치 흰빛'],
  },
  {
    id: 'shantak',
    name: '샨탁의 정수',
    icon: 'gi:vulture',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 13, dex: 1, str: 1 },
    passive: {
      name: '거대한 날개',
      desc: '전투 시작 시 회피 1. 원거리 공격 피해 +2',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'evasive', s.n, c.p);
        },
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && !d.melee) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-shantak-dive', 'ess-shantak-gale'],
    colors: ['비늘 녹색', '고원의 밤빛'],
  },
  {
    id: 'shoggoth',
    name: '쇼고스의 정수',
    icon: 'gi:gooey-eyed-sun',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 16, str: 1, will: 1 },
    passive: {
      name: '원형질 재생',
      desc: '턴 종료 시 체력 2 회복',
      hooks: {
        onTurnEnd(c, s) {
          c.heal(c.p, 2 * s.n);
        },
      },
    },
    actives: ['ess-shoggoth-pseudopods', 'ess-shoggoth-absorb', 'ess-shoggoth-tide'],
    colors: ['심연의 초록', '무수한 눈빛', '옛것의 검정'],
  },
  {
    id: 'angle-king',
    name: '각도의 왕의 정수',
    icon: 'gi:moebius-triangle',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 15, str: 2 },
    passive: {
      name: '모서리 사냥',
      desc: '매 턴 첫 공격의 피해 +4',
      hooks: {
        onTurnStart(_c, s) {
          s.unit.st._a3corner = 1;
        },
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && s.unit.st._a3corner) d.add += 4 * s.n;
        },
        onDamageDealt(c, s, d) {
          if (d.attack && d.src === c.p) delete s.unit.st._a3corner;
        },
      },
    },
    actives: ['ess-angle-king-fang', 'ess-angle-king-twist', 'ess-angle-king-rend'],
    colors: ['예각의 청색', '뒤틀린 남색', '시간의 잿빛'],
  },
  {
    id: 'dhole',
    name: '프나스의 돌의 정수',
    icon: 'gi:worm-mouth',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 14, dex: 1 },
    passive: {
      name: '땅굴 파기',
      desc: '전투 시작 시 보호막 8',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 8 * s.n, c.p);
        },
      },
    },
    actives: ['ess-dhole-erupt', 'ess-dhole-burrow'],
    colors: ['얼음 밑 흙빛', '점액 연두'],
  },

  // ── 얼어붙은 고대 도시의 새 정수 ──
  {
    id: 'blind-penguin',
    name: '눈먼 펭귄의 정수',
    icon: 'gi:penguin',
    grade: 6,
    stats: { maxHp: 9, dex: 1 },
    passive: {
      name: '두꺼운 지방',
      desc: '받는 공격 피해 -1. 내 턴이 시작될 때 동상 1이 녹는다',
      hooks: {
        modDamageIn(c, s, d) {
          if (d.attack && d.tgt === c.p) d.add -= s.n;
        },
        onTurnStart(c, s) {
          melt(c, c.p, s.n);
        },
      },
    },
    actives: ['ess-blind-penguin-peck', 'ess-blind-penguin-huddle'],
    colors: ['눈먼 흰빛', '얼음 동굴 회색'],
  },
  {
    id: 'frozen-explorer',
    name: '동사한 탐사대원의 정수',
    icon: 'gi:frozen-body',
    grade: 6,
    stats: { maxHp: 10, str: 1 },
    passive: {
      name: '동사자의 끈기',
      desc: '체력이 절반 이하일 때 받는 공격 피해 -2',
      hooks: {
        modDamageIn(c, s, d) {
          if (d.attack && d.tgt === c.p && c.p.hp <= c.p.maxHp / 2) d.add -= 2 * s.n;
        },
      },
    },
    actives: ['ess-frozen-explorer-axe', 'ess-frozen-explorer-flare'],
    colors: ['서리 앉은 방한복', '조명탄 붉은빛'],
  },
  {
    id: 'frost-wraith',
    name: '서리 망령의 정수',
    icon: 'gi:floating-ghost',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 8, will: 2 },
    passive: {
      name: '서늘한 손길',
      desc: '내 턴의 첫 공격이 대상에게 동상 1을 건다',
      hooks: {
        onTurnStart(_c, s) {
          s.unit.st._a3chill = 1;
        },
        onDamageDealt(c, s, d) {
          if (!d.attack || d.src !== c.p || !isEnemy(d.tgt) || !s.unit.st._a3chill) return;
          delete s.unit.st._a3chill;
          if (!d.tgt.dead) frost(c, d.tgt, s.n, c.p);
        },
      },
    },
    actives: ['ess-frost-wraith-breath', 'ess-frost-wraith-drain'],
    colors: ['서리 흰빛', '얼어붙은 숨결'],
  },
  {
    id: 'elder-hunter',
    name: '고대인 사냥꾼의 정수',
    icon: 'gi:eyestalk',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 8, dex: 1, str: 1 },
    passive: {
      name: '표본 수집가',
      desc: '적을 처치하면 재사용 대기 중인 무작위 기술 하나의 대기 -1',
      hooks: {
        onKill(c, s) {
          for (let i = 0; i < s.n; i++) {
            const keys = Object.keys(c.s.cd).filter((k) => c.s.cd[k] > 0 && c.s.cd[k] < 90);
            if (!keys.length) return;
            const k = c.rng.pick(keys);
            c.s.cd[k] -= 1;
            if (c.s.cd[k] <= 0) delete c.s.cd[k];
          }
        },
      },
    },
    actives: ['ess-elder-hunter-collect', 'ess-elder-hunter-glide'],
    colors: ['별머리 녹색', '막날개 잿빛'],
  },
  {
    id: 'gnoph-keh',
    name: '그노프케의 정수',
    icon: 'gi:mammoth',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 12, str: 1 },
    passive: {
      name: '눈보라를 끄는 털가죽',
      desc: '전투 시작 시 모든 적에게 동상 2',
      hooks: {
        onCombatStart(c, s) {
          for (const e of [...c.alive]) frost(c, e, 2 * s.n, c.p);
        },
      },
    },
    actives: ['ess-gnoph-keh-horn', 'ess-gnoph-keh-blizzard'],
    colors: ['뿔의 상아색', '눈보라 흰빛'],
  },
  {
    id: 'sled-dog',
    name: '해부된 썰매개의 정수',
    icon: 'gi:wolf-howl',
    grade: 6,
    stats: { maxHp: 8, str: 1 },
    passive: {
      name: '무리의 냄새',
      desc: '적이 쓰러질 때마다 이번 전투 동안 힘 +1 (최대 3)',
      hooks: {
        onKill(c, s) {
          const n = c.s.vars.a3pack ?? 0;
          if (n >= 3 * s.n) return;
          c.s.vars.a3pack = n + 1;
          c.apply(c.p, 'str', 1, c.p);
        },
      },
    },
    actives: ['ess-sled-dog-nape', 'ess-sled-dog-howl'],
    colors: ['핏빛 실밥', '썰매 끈 갈색'],
  },
  {
    id: 'elder-vivisector',
    name: '고대인 해부학자의 정수',
    icon: 'gi:scalpel',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 13, str: 1, dex: 1 },
    passive: {
      name: '해부학',
      desc: '출혈이 있는 적에게 주는 공격 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && (d.tgt.st.bleed ?? 0) > 0) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-elder-vivisector-scalpels', 'ess-elder-vivisector-extract'],
    colors: ['메스의 은빛', '표본 병의 녹색'],
  },
  {
    id: 'beyond-peaks',
    name: '산맥 너머의 것의 정수',
    icon: 'gi:peaks',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 14, will: 2, insight: 1 },
    passive: {
      name: '눈을 감은 자',
      desc: '정신력을 잃을 때마다 그만큼 방어도를 얻는다 (전투마다 최대 30)',
      hooks: {
        modSanityLoss(c, s, amount) {
          if (!c || amount <= 0) return amount;
          const used = c.s.vars.a3veil ?? 0;
          const g = Math.min(Math.floor(amount), 30 * s.n - used);
          if (g > 0) {
            c.s.vars.a3veil = used + g;
            c.gainBlock(c.p, g);
          }
          return amount;
        },
      },
    },
    actives: ['ess-beyond-peaks-gaze', 'ess-beyond-peaks-mist', 'ess-beyond-peaks-truth'],
    colors: ['보랏빛 증기', '산맥의 잿빛', '드러난 진실'],
  },
  {
    id: 'awakened-elder',
    name: '깨어난 원로의 계층정수',
    icon: 'gi:sea-star',
    grade: 2,
    lord: true,
    eldritch: true,
    stats: { maxHp: 18, str: 2, will: 2, insight: 1 },
    passive: {
      name: '옛 주인의 피리',
      desc: '전투 시작 시 모든 적에게 광란 1. 광란에 걸린 적에게 주는 공격 피해 +25%',
      hooks: {
        onCombatStart(c) {
          for (const e of [...c.alive]) c.apply(e, 'madden', 1, c.p);
        },
        modDamageOut(c, _s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && (d.tgt.st.madden ?? 0) > 0) d.mult *= 1.25;
        },
      },
    },
    actives: ['ess-awakened-elder-tentacles', 'ess-awakened-elder-pipe', 'ess-awakened-elder-wings'],
    colors: ['별머리 청록', '옛 피리의 은빛', '막날개 잿빛'],
  },
  {
    id: 'frozen-leader',
    name: '얼어붙은 탐사대장의 정수',
    icon: 'gi:frozen-block',
    grade: 5,
    stats: { maxHp: 10, will: 2 },
    passive: {
      name: '멈춘 시계',
      desc: '한 턴에 받는 피해가 최대 체력의 35%를 넘지 않는다 (지속 피해 제외)',
      hooks: {
        modDamageIn(c, _s, d) {
          if (d.tgt !== c.p) return;
          const taken = c.s.vars.a3clockTurn === c.s.turn ? (c.s.vars.a3clockTaken ?? 0) : 0;
          const left = Math.max(0, Math.floor(c.p.maxHp * 0.35) - taken);
          d.cap = d.cap === undefined ? left : Math.min(d.cap, left);
        },
        onDamageTaken(c, _s, d) {
          if (d.tgt !== c.p || d.type === 'true') return;
          if (c.s.vars.a3clockTurn !== c.s.turn) {
            c.s.vars.a3clockTurn = c.s.turn;
            c.s.vars.a3clockTaken = 0;
          }
          c.s.vars.a3clockTaken = (c.s.vars.a3clockTaken ?? 0) + d.amount;
        },
      },
    },
    actives: ['ess-frozen-leader-moment', 'ess-frozen-leader-journal'],
    colors: ['멈춘 시계의 은빛', '얼어붙은 일지'],
  },
]);
