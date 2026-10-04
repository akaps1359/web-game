import { reg, ENEMIES } from '../../engine/registry';
import { isEnemy, lvlVal } from '../../engine/combat';
import type { PlayerState, SkillDef } from '../../engine/types';
import { dealt, guard, hit, killed, skill } from '../lib';
import { chipPoise, swapRows } from './dream';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

const isBoss = (defId: string) => ENEMIES.get(defId)?.tier === 'boss';

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
    name: '꿈실 거미줄',
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
  // 잿빛 순례자
  ess({
    id: 'ess-ash-pilgrim-ash',
    name: '재의 축복',
    icon: 'gi:pilgrim-hat',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity'],
    vals: { barrier: [7, 9], san: 3 },
    desc: '보호막 {barrier} (턴이 지나도 유지), 정신력 +{san}',
    run: (c, u) => {
      c.apply(c.p, 'barrier', u.v('barrier'), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-ash-pilgrim-penance',
    name: '고행',
    icon: 'gi:burning-embers',
    rarity: 'uncommon',
    cost: 0,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { hp: [6, 4], pct: 50 },
    desc: '체력 {hp} 소모. 이번 턴 공격 피해 +{pct}%',
    run: (c, u) => {
      c.loseHp(c.p, u.v('hp'));
      c.apply(c.p, 'frenzy', u.v('pct'), c.p);
    },
  }),
  // 달짐승
  ess({
    id: 'ess-moonbeast-hook',
    name: '고문 갈고리',
    icon: 'gi:fishing-hook',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'bleed', 'debuff'],
    vals: { dmg: [6, 8], bleed: [3, 4], vuln: 1 },
    desc: '{D:dmg} 관통 피해, 출혈 {bleed}, 취약 {vuln}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (!t || t.dead) return;
      c.apply(t, 'bleed', u.v('bleed'), c.p);
      c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  ess({
    id: 'ess-moonbeast-snout',
    name: '촉수 주둥이',
    icon: 'gi:toad-teeth',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], hits: 3 },
    desc: '{D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 주그
  ess({
    id: 'ess-zoog-nibble',
    name: '갉아먹기',
    icon: 'gi:front-teeth',
    rarity: 'uncommon',
    cost: 0,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], hits: 2 },
    desc: '{D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-zoog-flit',
    name: '파닥임',
    icon: 'gi:flying-fox',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { ap: 1 },
    desc: '회피 1. 다음 턴 행동력 +{ap}',
    run: (c, u) => {
      c.apply(c.p, 'evasive', 1, c.p);
      c.apply(c.p, 'energized', u.v('ap'), c.p);
    },
  }),
  // 구그
  ess({
    id: 'ess-gug-paws',
    name: '네 개의 앞발',
    icon: 'gi:claws',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [5, 6], hits: 4 },
    desc: '{D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-gug-maw',
    name: '세로 아가리',
    icon: 'gi:carnivore-mouth',
    rarity: 'uncommon',
    cost: 2,
    cd: 4,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [22, 27], poise: 1 },
    desc: '{D:dmg} 참격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 몽유병자
  ess({
    id: 'ess-sleepwalker-flail',
    name: '허우적거림',
    icon: 'gi:shambling-zombie',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'random',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [4, 5], hits: 3 },
    desc: '무작위 적에게 {D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-sleepwalker-dream',
    name: '깊은 잠',
    icon: 'gi:sleepy',
    rarity: 'uncommon',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity', 'retain'],
    vals: { blk: [7, 9], san: [6, 8] },
    desc: '방어도 {B:blk}, 정신력 +{san}. 다음 턴까지 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.gainSanity(u.v('san'));
      c.apply(c.p, 'retain', 2, c.p);
    },
  }),
  // 장막 직조자
  ess({
    id: 'ess-veil-weaver-double',
    name: '환영 분신',
    icon: 'gi:two-shadows',
    rarity: 'uncommon',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { n: [1, 2] },
    desc: '회피 {n} (다음 공격 {n}회 무효)',
    run: (c, u) => void c.apply(c.p, 'evasive', u.v('n'), c.p),
  }),
  ess({
    id: 'ess-veil-weaver-needle',
    name: '꿈바늘',
    icon: 'gi:sewing-needle',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'debuff'],
    vals: { dmg: [7, 9], weak: 1 },
    desc: '{D:dmg} 관통 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
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
  // 토성의 고양이
  ess({
    id: 'ess-saturn-cat-rake',
    name: '고리 발톱',
    icon: 'gi:claw-slashes',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'multi'],
    vals: { dmg: [5, 6], hits: 2, bleed: 2 },
    desc: '{D:dmg} 참격 피해 {hits}회, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-saturn-cat-grin',
    name: '토성의 미소',
    icon: 'gi:hollow-cat',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { vuln: 1, madden: [1, 2] },
    desc: '적 전체 취약 {vuln}, 광란 {madden}',
    run: (c, u) => {
      for (const e of [...c.alive]) {
        c.apply(e, 'vuln', u.v('vuln'), c.p);
        c.apply(e, 'madden', u.v('madden'), c.p);
      }
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
  // 꿈의 문지기 (수호자)
  ess({
    id: 'ess-dream-gatekeeper-mirror',
    name: '거울의 문',
    icon: 'gi:mirror-mirror',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { n: 2 },
    desc: '회피 {n}',
    run: (c, u) => void c.apply(c.p, 'evasive', u.v('n'), c.p),
  }),
  ess({
    id: 'ess-dream-gatekeeper-judgment',
    name: '문지기의 심판',
    icon: 'gi:door-watcher',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [18, 23] },
    desc: '{D:dmg} 공허 피해. 힘을 모으는(차지 중인) 적에게는 2배',
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') * (t?.mem.charge ? 2 : 1) }),
  }),
  ess({
    id: 'ess-dream-gatekeeper-riddle',
    name: '문의 수수께끼',
    icon: 'gi:greek-sphinx',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { stun: 1, weak: 2 },
    desc: '기절 {stun} (수호자에게는 대신 약화 {weak})',
    run: (c, u, t) => {
      if (!t) return;
      if (isBoss(t.def)) c.apply(t, 'weak', u.v('weak'), c.p);
      else c.apply(t, 'stun', u.v('stun'), c.p);
    },
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
  // 꿈을 먹는 자 (계층정수)
  ess({
    id: 'ess-dream-eater-devour',
    name: '꿈 삼키기',
    icon: 'gi:evil-moon',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'sanity'],
    vals: { dmg: [12, 15], san: 4 },
    desc: '{D:dmg} 공허 피해, 정신력 +{san}',
    run: (c, u, t) => {
      hit(c, u, t);
      c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-dream-eater-lull',
    name: '깊은 자장가',
    icon: 'gi:night-sleep',
    rarity: 'rare',
    cost: 2,
    cd: 5,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { stun: 1, weak: 2 },
    desc: '적 전체 기절 {stun} (수호자는 대신 약화 {weak})',
    run: (c, u) => {
      for (const e of [...c.alive]) {
        if (isBoss(e.def)) c.apply(e, 'weak', u.v('weak'), c.p);
        else c.apply(e, 'stun', u.v('stun'), c.p);
      }
    },
  }),
  ess({
    id: 'ess-dream-eater-nightfall',
    name: '악몽 강림',
    icon: 'gi:dread-skull',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [26, 32] },
    desc: '{D:dmg} 공허 피해',
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
    name: '땅속으로',
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
  // 문턱의 존재 (균열 수호자)
  ess({
    id: 'ess-liminal-cross',
    name: '경계 넘기',
    icon: 'gi:portal',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'multi'],
    vals: { dmg: [7, 9] },
    desc: '{D:dmg} 공허 피해, 이어서 같은 위력의 타격 피해',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) hit(c, u, t, { type: 'blunt' });
    },
  }),
  ess({
    id: 'ess-liminal-phase',
    name: '위상 전환',
    icon: 'gi:magic-portal',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { barrier: [6, 8] },
    desc: '보호막 {barrier}, 회피 1',
    run: (c, u) => {
      c.apply(c.p, 'barrier', u.v('barrier'), c.p);
      c.apply(c.p, 'evasive', 1, c.p);
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
    colors: ['렝의 보라', '꿈실 은빛'],
  },
  {
    id: 'ash-pilgrim',
    name: '잿빛 순례자의 정수',
    icon: 'gi:cowled',
    grade: 6,
    eldritch: true,
    stats: { maxHp: 8, will: 2 },
    passive: {
      name: '순례자의 인내',
      desc: '정신력이 절반 이하일 때 받는 정신 피해 -20%',
      hooks: {
        modSanityLoss(_c, s, n) {
          const p = s.unit as PlayerState;
          return p.sanity <= p.maxSanity / 2 ? n * Math.max(0.5, 1 - 0.2 * s.n) : n;
        },
      },
    },
    actives: ['ess-ash-pilgrim-ash', 'ess-ash-pilgrim-penance'],
    colors: ['잿빛', '꺼져 가는 불씨'],
  },
  {
    id: 'moonbeast',
    name: '달짐승의 정수',
    icon: 'gi:toad-teeth',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 10, str: 1 },
    passive: {
      name: '고문 기술자',
      desc: '적에게 출혈을 부여할 때 +1',
      hooks: {
        modApply(_c, s, target, id, n) {
          return id === 'bleed' && isEnemy(target) ? n + s.n : n;
        },
      },
    },
    actives: ['ess-moonbeast-hook', 'ess-moonbeast-snout'],
    colors: ['창백한 달빛', '분홍 촉수'],
  },
  {
    id: 'zoog',
    name: '주그의 정수',
    icon: 'gi:flying-fox',
    grade: 6,
    eldritch: true,
    stats: { maxHp: 8, dex: 1 },
    passive: {
      name: '작은 도둑',
      desc: '전투에서 이기면 등불 +5',
      hooks: {
        onCombatEnd(c, s, won) {
          if (won) c.run.light = Math.min(100, c.run.light + 5 * s.n);
        },
      },
    },
    actives: ['ess-zoog-nibble', 'ess-zoog-flit'],
    colors: ['숲 갈색', '반딧불 노랑'],
  },
  {
    id: 'gug',
    name: '구그의 정수',
    icon: 'gi:troll',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 12, str: 1 },
    passive: {
      name: '거인의 근력',
      desc: '행동력 2 이상인 스킬의 공격 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && d.skill && lvlVal(d.skill.def.cost, d.skill.lvl) >= 2) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-gug-paws', 'ess-gug-maw'],
    colors: ['지하의 적갈', '아가리 붉은'],
  },
  {
    id: 'sleepwalker',
    name: '몽유병자의 정수',
    icon: 'gi:shambling-zombie',
    grade: 6,
    stats: { maxHp: 10, will: 1 },
    passive: {
      name: '선잠',
      desc: '전투 시작 시 보호막 6, 정신력 +2',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 6 * s.n, c.p);
          c.gainSanity(2 * s.n);
        },
      },
    },
    actives: ['ess-sleepwalker-flail', 'ess-sleepwalker-dream'],
    colors: ['창백한 잠옷빛', '새벽 회청'],
  },
  {
    id: 'veil-weaver',
    name: '장막 직조자의 정수',
    icon: 'gi:duality-mask',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 8, dex: 2 },
    passive: {
      name: '꿈의 장막',
      desc: '턴 종료 시 보호막이 8 미만이면 보호막 2',
      hooks: {
        onTurnEnd(c, s) {
          if ((c.p.st.barrier ?? 0) < 8) c.apply(c.p, 'barrier', 2 * s.n, c.p);
        },
      },
    },
    actives: ['ess-veil-weaver-double', 'ess-veil-weaver-needle'],
    colors: ['가면 백색', '장막 보라'],
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
    id: 'saturn-cat',
    name: '토성의 고양이의 정수',
    icon: 'gi:hollow-cat',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 12, dex: 2 },
    passive: {
      name: '아홉 목숨',
      desc: '전투마다 한 번, 쓰러질 피해를 받으면 체력 1로 버틴다',
      hooks: {
        onLethal(c, s) {
          const used = c.s.vars.a3Lives ?? 0;
          if (used >= s.n) return false;
          c.s.vars.a3Lives = used + 1;
          c.p.hp = 1;
          c.emit({ t: 'text', uid: 'p', text: '목숨 하나를 버리고 버텼다', tone: 'good' });
          return true;
        },
      },
    },
    actives: ['ess-saturn-cat-rake', 'ess-saturn-cat-grin'],
    colors: ['토성의 금빛', '고리 무늬 보라'],
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
    colors: ['비늘 녹색', '카다스의 밤빛'],
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
      desc: '턴 종료 시 체력 2 회복 (회복 반전 구역에서는 피해가 된다)',
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
    id: 'dream-gatekeeper',
    name: '꿈의 문지기의 정수',
    icon: 'gi:door-watcher',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 14, will: 2, insight: 1 },
    passive: {
      name: '문지기의 눈',
      desc: '전투 시작 시 결계 1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'ward', s.n, c.p);
        },
      },
    },
    actives: ['ess-dream-gatekeeper-mirror', 'ess-dream-gatekeeper-judgment', 'ess-dream-gatekeeper-riddle'],
    colors: ['거울 은빛', '문지기의 금빛', '수수께끼 보라'],
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
    id: 'dream-eater',
    name: '꿈을 먹는 자의 계층정수',
    icon: 'gi:evil-moon',
    grade: 2,
    lord: true,
    eldritch: true,
    stats: { maxHp: 18, str: 2, will: 2 },
    passive: {
      name: '악몽 포식',
      desc: '적을 처치할 때마다 정신력 +4, 체력 4 회복',
      hooks: {
        onKill(c, s) {
          c.gainSanity(4 * s.n);
          c.heal(c.p, 4 * s.n);
        },
      },
    },
    actives: ['ess-dream-eater-devour', 'ess-dream-eater-lull', 'ess-dream-eater-nightfall'],
    colors: ['꿈의 보랏빛', '잠의 남색', '악몽의 진홍'],
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
    colors: ['뼈 무덤 흙빛', '점액 연두'],
  },
  {
    id: 'liminal',
    name: '문턱의 존재의 정수',
    icon: 'gi:magic-portal',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 12, will: 2 },
    passive: {
      name: '문턱의 걸음',
      desc: '홀수 턴에는 참격·관통·타격, 짝수 턴에는 화염·비전·공허 공격 피해 +20%',
      hooks: {
        modDamageOut(c, s, d) {
          if (!d.attack || d.src !== c.p || d.type === 'true') return;
          const phys = d.type === 'slash' || d.type === 'pierce' || d.type === 'blunt';
          if ((c.s.turn % 2 === 1) === phys) d.mult *= 1 + 0.2 * s.n;
        },
      },
    },
    actives: ['ess-liminal-cross', 'ess-liminal-phase'],
    colors: ['현실의 회색', '꿈결의 흰빛'],
  },
]);
