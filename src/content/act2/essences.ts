import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { dealt, guard, hit, skill } from '../lib';
import type { SkillDef } from '../../engine/types';
import { corpses, eatCorpse, hasTag } from './enemies';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

/** 사면으로 지울 수 있는 해로운 효과 (우선순위 순) */
const CLEANSE = ['vuln', 'weak', 'frail', 'bleed', 'poison', 'burn', 'corrode', 'dread', 'madden'];

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 익사한 성가대원
  ess({
    id: 'ess-chorister-hymn',
    name: '물밑의 찬송',
    icon: 'gi:sing',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'sanity'],
    vals: { weak: [1, 2], san: [3, 5] },
    desc: '적 전체 약화 {weak}, 정신력 +{san}',
    run: (c, u) => {
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-chorister-discord',
    name: '불협화음',
    icon: 'gi:sound-waves',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'random',
    type: 'arcane',
    tags: ['attack', 'multi'],
    vals: { dmg: [4, 5], hits: 2 },
    desc: '무작위 적에게 {D:dmg} 비전 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 심해교 사제
  ess({
    id: 'ess-abbey-priest-rite',
    name: '의식 집전',
    icon: 'gi:candles',
    rarity: 'uncommon',
    cost: [2, 1],
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['buff', 'ritual'],
    vals: { ritual: 1 },
    desc: '의식 {ritual} — 내 턴이 끝날 때마다 힘 +{ritual}. 전투당 1회',
    run: (c, u) => void c.apply(c.p, 'ritual', u.v('ritual'), c.p),
  }),
  ess({
    id: 'ess-abbey-priest-smite',
    name: '심해의 인장',
    icon: 'gi:pentagram-rose',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'mark'],
    vals: { dmg: [7, 9], mark: 1 },
    desc: '{D:dmg} 비전 피해, 인장 {mark}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'mark', u.v('mark'), c.p);
    },
  }),
  // 순교자
  ess({
    id: 'ess-martyr-scourge',
    name: '자기 채찍질',
    icon: 'gi:crown-of-thorns',
    rarity: 'uncommon',
    cost: 0,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { hp: [5, 4], str: 2 },
    desc: '체력 -{hp}, 힘 +{str} (전투 동안)',
    run: (c, u) => {
      c.loseHp(c.p, u.v('hp'));
      if (!c.over) c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  ess({
    id: 'ess-martyr-chain',
    name: '가시 사슬',
    icon: 'gi:crossed-chains',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    vals: { dmg: [9, 12], bleed: [2, 3] },
    desc: '{D:dmg} 참격 피해, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  // 납골당 구울
  ess({
    id: 'ess-crypt-ghoul-gnaw',
    name: '뼈 갉기',
    icon: 'gi:bone-gnawer',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], hits: 3 },
    desc: '{D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-crypt-ghoul-feast',
    name: '시체 포식',
    icon: 'gi:chewed-skull',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['heal', 'buff'],
    vals: { heal: [9, 12], str: 1 },
    desc: '쓰러진 적의 시체 하나를 먹어 체력 {heal} 회복, 힘 +{str}',
    canUse: (c) => (corpses(c) > 0 ? null : '먹을 시체가 없다'),
    run: (c, u) => {
      if (!eatCorpse(c)) return;
      c.heal(c.p, u.v('heal'));
      c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  // 비늘 돋은 수사
  ess({
    id: 'ess-scaled-friar-trident',
    name: '삼지창 찌르기',
    icon: 'gi:trident',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'debuff'],
    vals: { dmg: [8, 10], frail: 2 },
    desc: '{D:dmg} 관통 피해, 허약 {frail}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'frail', u.v('frail'), c.p);
    },
  }),
  ess({
    id: 'ess-scaled-friar-scales',
    name: '비늘 세우기',
    icon: 'gi:fish-scales',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'self',
    target: 'self',
    tags: ['block', 'heal'],
    vals: { blk: [8, 11], regen: [2, 3] },
    desc: '방어도 {B:blk}, 재생 {regen}',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'regen', u.v('regen'), c.p);
    },
  }),
  // 빙의된 수도사
  ess({
    id: 'ess-possessed-monk-spasm',
    name: '발작',
    icon: 'gi:fist',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [5, 6], hits: 2 },
    desc: '{D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-possessed-monk-spirit',
    name: '악령 풀어놓기',
    icon: 'gi:ghost',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'random',
    type: 'void',
    tags: ['attack', 'multi', 'sanity'],
    vals: { dmg: [6, 8], hits: 2, san: 4 },
    desc: '정신력 {san} 소모. 무작위 적에게 {D:dmg} 공허 피해 {hits}회',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (!c.over) hit(c, u, t);
    },
  }),
  // 물에 잠긴 수녀
  ess({
    id: 'ess-drowned-nun-veil',
    name: '물의 장막',
    icon: 'gi:water-splash',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { barrier: [8, 12] },
    desc: '보호막 {barrier} (턴이 지나도 유지)',
    run: (c, u) => void c.apply(c.p, 'barrier', u.v('barrier'), c.p),
  }),
  ess({
    id: 'ess-drowned-nun-lament',
    name: '익사자의 기도',
    icon: 'gi:prayer-beads',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [6, 8] },
    desc: '{D:dmg} 공허 피해. 대상이 약화 상태면 2배',
    run: (c, u, t) => {
      const weak = !!t && (t.st.weak ?? 0) > 0;
      hit(c, u, t, { dmg: u.v('dmg') * (weak ? 2 : 1) });
    },
  }),
  // 타종 수련사
  ess({
    id: 'ess-bell-acolyte-clang',
    name: '공명',
    icon: 'gi:ringing-bell',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack'],
    vals: { dmg: [7, 9], poise: 1 },
    desc: '{D:dmg} 비전 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-bell-acolyte-toll',
    name: '작은 종',
    icon: 'gi:resonance',
    rarity: 'uncommon',
    cost: [1, 0],
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'sanity'],
    vals: { str: 1, san: [3, 5] },
    desc: '힘 +{str} (전투 동안), 정신력 +{san}',
    run: (c, u) => {
      c.apply(c.p, 'str', u.v('str'), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  // 칠성장어
  ess({
    id: 'ess-lamprey-latch',
    name: '흡착',
    icon: 'gi:lamprey-mouth',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'bleed', 'heal'],
    vals: { dmg: [6, 8], bleed: [2, 3] },
    desc: '{D:dmg} 관통 피해, 출혈 {bleed}. 입힌 피해의 절반만큼 체력 회복',
    run: (c, u, t) => {
      const ds = hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
      const n = Math.floor(dealt(ds) / 2);
      if (n > 0) c.heal(c.p, n);
    },
  }),
  ess({
    id: 'ess-lamprey-thrash',
    name: '몸부림',
    icon: 'gi:whiplash',
    rarity: 'uncommon',
    cost: 0,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], hits: 2 },
    desc: '{D:dmg} 타격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 창백한 뱀장어
  ess({
    id: 'ess-pale-eel-shock',
    name: '감전',
    icon: 'gi:eel',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'debuff'],
    vals: { dmg: [6, 8], weak: 1 },
    desc: '{D:dmg} 비전 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-pale-eel-discharge',
    name: '방전',
    icon: 'gi:lightning-branches',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe'],
    vals: { dmg: [8, 11] },
    desc: '적 전체에 {D:dmg} 비전 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 고해 신부
  ess({
    id: 'ess-confessor-penance',
    name: '참회의 매',
    icon: 'gi:flail',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'debuff'],
    vals: { dmg: [7, 9], vuln: 1 },
    desc: '{D:dmg} 타격 피해, 취약 {vuln}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  ess({
    id: 'ess-confessor-absolve',
    name: '사면',
    icon: 'gi:cowled',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['heal', 'sanity', 'cleanse'],
    vals: { heal: [6, 9], san: [4, 6] },
    desc: '체력 {heal}, 정신력 {san} 회복. 해로운 효과 하나를 없앤다',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      c.gainSanity(u.v('san'));
      const bad = CLEANSE.find((id) => (c.p.st[id] ?? 0) > 0);
      if (bad) c.clear(c.p, bad);
    },
  }),
  // 성수반의 촉수
  ess({
    id: 'ess-font-tentacle-lash',
    name: '촉수 채찍',
    icon: 'gi:spiked-tentacle',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'debuff'],
    vals: { dmg: [7, 9], corrode: 1 },
    desc: '{D:dmg} 공허 피해, 부식 {corrode}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'corrode', u.v('corrode'), c.p);
    },
  }),
  ess({
    id: 'ess-font-tentacle-baptize',
    name: '검은 세례',
    icon: 'gi:holy-water',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'sanity'],
    vals: { corrode: [1, 2], san: 2 },
    desc: '정신력 {san} 소모. 적 전체 부식 {corrode} (받는 피해 증가, 전투 동안)',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (c.over) return;
      for (const e of c.alive) c.apply(e, 'corrode', u.v('corrode'), c.p);
    },
  }),
  // 대고행자
  ess({
    id: 'ess-flagellant-lash',
    name: '가시 채찍',
    icon: 'gi:whip',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'multi', 'bleed'],
    vals: { dmg: [3, 4], hits: 3, bleed: [1, 2] },
    desc: '{D:dmg} 참격 피해 {hits}회, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-flagellant-mortify',
    name: '피의 고행',
    icon: 'gi:bleeding-heart',
    rarity: 'rare',
    cost: 0,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { hp: 6, str: [2, 3], thorns: [3, 4] },
    desc: '체력 -{hp}, 힘 +{str}, 가시 {thorns} (전투 동안)',
    run: (c, u) => {
      c.loseHp(c.p, u.v('hp'));
      if (c.over) return;
      c.apply(c.p, 'str', u.v('str'), c.p);
      c.apply(c.p, 'thorns', u.v('thorns'), c.p);
    },
  }),
  // 성가대장
  ess({
    id: 'ess-choirmaster-crescendo',
    name: '크레셴도',
    icon: 'gi:music-spell',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe'],
    vals: { dmg: [5, 7], per: 3 },
    desc: '적 전체에 {D:dmg} 비전 피해. 이번 전투에서 쓸 때마다 피해 +{per}',
    run: (c, u, t) => {
      const k = c.s.vars.a2cres ?? 0;
      hit(c, u, t, { dmg: u.v('dmg') + k * u.v('per') });
      c.s.vars.a2cres = k + 1;
    },
  }),
  ess({
    id: 'ess-choirmaster-baton',
    name: '침묵의 지휘',
    icon: 'gi:silenced',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { stun: 1, weak: 2 },
    desc: '대상의 의도가 정신 공격이면 기절 {stun}, 아니면 약화 {weak}',
    run: (c, u, t) => {
      if (!t) return;
      if (t.intent?.kind === 'horror') c.apply(t, 'stun', u.v('stun'), c.p);
      else c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  // 살아있는 성유물함
  ess({
    id: 'ess-reliquary-shards',
    name: '뼛조각 분출',
    icon: 'gi:crossed-bones',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'multi'],
    vals: { dmg: [4, 5], hits: 3 },
    desc: '무작위 적에게 {D:dmg} 관통 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-reliquary-eye',
    name: '성인의 눈',
    icon: 'gi:all-seeing-eye',
    rarity: 'rare',
    cost: [1, 0],
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { vuln: [2, 3] },
    desc: '대상의 약점을 모두 드러내고 취약 {vuln}',
    run: (c, u, t) => {
      if (!t) return;
      for (const w of t.weak) {
        if (t.known.includes(w)) continue;
        t.known.push(w);
        c.emit({ t: 'reveal', uid: t.uid, dtype: w });
      }
      c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  // 대사제
  ess({
    id: 'ess-high-priest-blade',
    name: '제례검',
    icon: 'gi:sacrificial-dagger',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'heal'],
    vals: { dmg: [10, 13], heal: 6 },
    desc: '{D:dmg} 참격 피해. 처치하면 체력 {heal} 회복',
    run: (c, u, t) => {
      const ds = hit(c, u, t);
      if (ds.some((d) => d.killed)) c.heal(c.p, u.v('heal'));
    },
  }),
  ess({
    id: 'ess-high-priest-sermon',
    name: '심연의 설교',
    icon: 'gi:evil-book',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 1, vuln: [1, 2] },
    desc: '적 전체 약화 {weak}, 취약 {vuln}',
    run: (c, u) => {
      for (const e of c.alive) {
        c.apply(e, 'weak', u.v('weak'), c.p);
        c.apply(e, 'vuln', u.v('vuln'), c.p);
      }
    },
  }),
  ess({
    id: 'ess-high-priest-descend',
    name: '심연 강림',
    icon: 'gi:vortex',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [24, 30] },
    desc: '{D:dmg} 공허 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 구울 왕
  ess({
    id: 'ess-ghoul-king-feast',
    name: '왕의 만찬',
    icon: 'gi:chewed-heart',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['heal', 'buff'],
    vals: { heal: [10, 14], str: 2 },
    desc: '체력 {heal} 회복. 쓰러진 적의 시체가 있으면 하나를 먹어 힘 +{str}',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      if (eatCorpse(c)) c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
  ess({
    id: 'ess-ghoul-king-crush',
    name: '뼈 왕좌의 일격',
    icon: 'gi:throne-king',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [20, 26], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 심해 군주
  ess({
    id: 'ess-deep-lord-trident',
    name: '심해의 삼지창',
    icon: 'gi:harpoon-trident',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [11, 14] },
    desc: '{D:dmg} 관통 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-deep-lord-wave',
    name: '해일',
    icon: 'gi:big-wave',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'blunt',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [10, 13], weak: 1 },
    desc: '적 전체에 {D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-deep-lord-song',
    name: '심해의 노래',
    icon: 'gi:siren',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { madden: 2 },
    desc: '적 전체 광란 {madden} (공격이 동료를 향할 수 있다)',
    run: (c, u) => {
      for (const e of c.alive) c.apply(e, 'madden', u.v('madden'), c.p);
    },
  }),
  // 종지기 (계층정수)
  ess({
    id: 'ess-bellkeeper-hammer',
    name: '종추 내려치기',
    icon: 'gi:hammer-drop',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [18, 23], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-bellkeeper-toll',
    name: '타종',
    icon: 'gi:ringing-bell',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [6, 8], poise: 1, weak: 1 },
    desc: '적 전체에 {D:dmg} 비전 피해, 버팀 추가 -{poise}, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-bellkeeper-last',
    name: '마지막 종',
    icon: 'gi:clock-tower',
    rarity: 'rare',
    cost: 3,
    cd: 99,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe', 'sanity'],
    vals: { dmg: [26, 32], san: 10 },
    desc: '정신력 {san} 소모. 적 전체에 {D:dmg} 비전 피해. 전투당 1회',
    run: (c, u, t) => {
      c.loseSanity(u.v('san'));
      if (!c.over) hit(c, u, t);
    },
  }),
  // 물밑의 아귀 (추적자)
  ess({
    id: 'ess-angler-lure',
    name: '미끼 불빛',
    icon: 'gi:angler-fish',
    rarity: 'rare',
    cost: [1, 0],
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { vuln: 2, weak: 1 },
    desc: '취약 {vuln}, 약화 {weak}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'vuln', u.v('vuln'), c.p);
      c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-angler-swallow',
    name: '삼키기',
    icon: 'gi:shark-jaws',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'heal'],
    vals: { dmg: [16, 20], heal: [8, 10] },
    desc: '{D:dmg} 관통 피해. 처치하면 체력 {heal} 회복',
    run: (c, u, t) => {
      const ds = hit(c, u, t);
      if (ds.some((d) => d.killed)) c.heal(c.p, u.v('heal'));
    },
  }),
  // 거꾸로 매달린 성인 (균열 수호자)
  ess({
    id: 'ess-inverted-saint-nails',
    name: '성흔의 못',
    icon: 'gi:nailed-foot',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'multi', 'bleed'],
    vals: { dmg: [3, 4], hits: 3, bleed: 1 },
    desc: '무작위 적에게 {D:dmg} 관통 피해 {hits}회, 맞은 적 출혈 {bleed}',
    run: (c, u, t) => {
      for (const d of hit(c, u, t)) if (isEnemy(d.tgt) && !d.tgt.dead) c.apply(d.tgt, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-inverted-saint-invert',
    name: '뒤집힌 축복',
    icon: 'gi:tarot-12-the-hanged-man',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['block', 'debuff'],
    vals: { str: [1, 2] },
    desc: '대상의 방어도를 모두 빼앗아 내 방어도로 삼는다. 대상 힘 -{str}, 내 힘 +{str}',
    run: (c, u, t) => {
      if (!t) return;
      const b = t.block;
      if (b > 0) {
        t.block = 0;
        c.gainBlock(c.p, b);
      }
      c.apply(t, 'str', -u.v('str'), c.p);
      c.apply(c.p, 'str', u.v('str'), c.p);
    },
  }),
]);

// ───────────── 정수 정의 ─────────────

reg.essences([
  {
    id: 'chorister',
    name: '성가대원의 정수',
    icon: 'gi:sing',
    grade: 8,
    stats: { maxHp: 5, will: 1 },
    passive: {
      name: '맑은 목소리',
      desc: '턴 시작 시 정신력 1 회복',
      hooks: {
        onTurnStart(c, s) {
          c.gainSanity(s.n);
        },
      },
    },
    actives: ['ess-chorister-hymn', 'ess-chorister-discord'],
    colors: ['물빛 은색', '불협 보라'],
  },
  {
    id: 'abbey-priest',
    name: '심해교 사제의 정수',
    icon: 'gi:warlock-hood',
    grade: 8,
    stats: { maxHp: 6, will: 1 },
    passive: {
      name: '심해의 교리',
      desc: '3번째 턴마다 시작 시 힘 +1 (전투 동안)',
      hooks: {
        onTurnStart(c, s) {
          if (c.s.turn % 3 === 0) c.apply(c.p, 'str', s.n, c.p);
        },
      },
    },
    actives: ['ess-abbey-priest-rite', 'ess-abbey-priest-smite'],
    colors: ['심해 남색', '인장 자주'],
  },
  {
    id: 'martyr',
    name: '순교자의 정수',
    icon: 'gi:crown-of-thorns',
    grade: 8,
    stats: { maxHp: 7, str: 1 },
    passive: {
      name: '순교자의 각오',
      desc: '체력이 30% 이하일 때 공격 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && c.p.hp <= c.p.maxHp * 0.3) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-martyr-scourge', 'ess-martyr-chain'],
    colors: ['가시 적갈', '순교자의 피'],
  },
  {
    id: 'crypt-ghoul',
    name: '구울의 정수',
    icon: 'gi:bone-gnawer',
    grade: 8,
    stats: { maxHp: 7, str: 1 },
    passive: {
      name: '시식',
      desc: '적을 처치하면 체력 3 회복',
      hooks: {
        onKill(c, s) {
          c.heal(c.p, 3 * s.n);
        },
      },
    },
    actives: ['ess-crypt-ghoul-gnaw', 'ess-crypt-ghoul-feast'],
    colors: ['뼈 회색', '썩은 녹색'],
  },
  {
    id: 'scaled-friar',
    name: '비늘 수사의 정수',
    icon: 'gi:frog',
    grade: 8,
    stats: { maxHp: 8, dex: 1 },
    passive: {
      name: '비늘 피부',
      desc: '받는 공격 피해 -1',
      hooks: {
        modDamageIn(c, s, d) {
          if (d.attack && d.tgt === c.p) d.add -= s.n;
        },
      },
    },
    actives: ['ess-scaled-friar-trident', 'ess-scaled-friar-scales'],
    colors: ['비늘 청록', '아가미 붉은'],
  },
  {
    id: 'possessed-monk',
    name: '빙의된 수도사의 정수',
    icon: 'gi:monk-face',
    grade: 7,
    stats: { maxHp: 6, str: 1 },
    passive: {
      name: '두 개의 목소리',
      desc: '정신력이 절반 이하일 때 주는 공격 피해 +15%',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && c.p.sanity <= c.p.maxSanity / 2) d.mult *= 1 + 0.15 * s.n;
        },
      },
    },
    actives: ['ess-possessed-monk-spasm', 'ess-possessed-monk-spirit'],
    colors: ['핏기 없는 회색', '악령의 붉은'],
  },
  {
    id: 'drowned-nun',
    name: '익사한 수녀의 정수',
    icon: 'gi:nun-face',
    grade: 8,
    stats: { maxHp: 5, maxSanity: 5 },
    passive: {
      name: '마지막 기도',
      desc: '전투 시작 시 보호막 5',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 5 * s.n, c.p);
        },
      },
    },
    actives: ['ess-drowned-nun-veil', 'ess-drowned-nun-lament'],
    colors: ['익사자의 청', '젖은 흑단'],
  },
  {
    id: 'bell-acolyte',
    name: '타종 수련사의 정수',
    icon: 'gi:hooded-figure',
    grade: 8,
    stats: { maxHp: 6, will: 1 },
    passive: {
      name: '종소리 공명',
      desc: '교단 적에게 공격 피해 +2',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && hasTag(d.tgt, 'cult')) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-bell-acolyte-clang', 'ess-bell-acolyte-toll'],
    colors: ['청동빛', '녹슨 금빛'],
  },
  {
    id: 'lamprey',
    name: '칠성장어의 정수',
    icon: 'gi:lamprey-mouth',
    grade: 8,
    stats: { maxHp: 6, dex: 1 },
    passive: {
      name: '흡혈 입',
      desc: '출혈 중인 적에게 공격 피해를 입히면 체력 1 회복',
      hooks: {
        onDamageDealt(c, s, d) {
          if (d.attack && d.hpLoss > 0 && isEnemy(d.tgt) && (d.tgt.st.bleed ?? 0) > 0) c.heal(c.p, s.n);
        },
      },
    },
    actives: ['ess-lamprey-latch', 'ess-lamprey-thrash'],
    colors: ['점액 분홍', '이빨 상아'],
  },
  {
    id: 'pale-eel',
    name: '창백한 뱀장어의 정수',
    icon: 'gi:eel',
    grade: 8,
    stats: { maxHp: 5, dex: 1 },
    passive: {
      name: '전류 감각',
      desc: '매 턴 첫 비전 공격의 버팀 피해 +1',
      hooks: {
        onTurnStart(c) {
          c.s.vars.a2eel = 1;
        },
        modDamageOut(c, s, d) {
          if (d.attack && d.type === 'arcane' && d.src === c.p && c.s.vars.a2eel) d.poiseBonus += s.n;
        },
        onDamageDealt(c, _s, d) {
          if (d.attack && d.type === 'arcane' && d.src === c.p) c.s.vars.a2eel = 0;
        },
      },
    },
    actives: ['ess-pale-eel-shock', 'ess-pale-eel-discharge'],
    colors: ['창백한 흰빛', '전류 청색'],
  },
  {
    id: 'confessor',
    name: '고해 신부의 정수',
    icon: 'gi:cowled',
    grade: 7,
    stats: { maxHp: 6, will: 2 },
    passive: {
      name: '고해성사',
      desc: '스킬을 3개 이상 쓴 턴이 끝날 때 정신력 3 회복',
      hooks: {
        onTurnEnd(c, s) {
          if (c.s.used >= 3) c.gainSanity(3 * s.n);
        },
      },
    },
    actives: ['ess-confessor-penance', 'ess-confessor-absolve'],
    colors: ['고해실 흑단', '사면의 금빛'],
  },
  {
    id: 'font-tentacle',
    name: '성수반 촉수의 정수',
    icon: 'gi:spiked-tentacle',
    grade: 7,
    eldritch: true,
    stats: { maxHp: 6, str: 1 },
    passive: {
      name: '세례받은 살',
      desc: '공허 공격 피해 +2',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && d.type === 'void') d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-font-tentacle-lash', 'ess-font-tentacle-baptize'],
    colors: ['세례반 흑청', '심연 녹색'],
  },
  {
    id: 'flagellant',
    name: '대고행자의 정수',
    icon: 'gi:whip',
    grade: 6,
    stats: { maxHp: 10, str: 2 },
    passive: {
      name: '고행',
      desc: '턴 시작 시 체력이 10보다 많으면 체력 2를 잃고 힘 +1 (전투당 최대 4회)',
      hooks: {
        onTurnStart(c, s) {
          const k = c.s.vars.a2flag ?? 0;
          if (k >= 4 || c.p.hp <= 10) return;
          c.s.vars.a2flag = k + 1;
          c.loseHp(c.p, 2);
          if (!c.over) c.apply(c.p, 'str', s.n, c.p);
        },
      },
    },
    actives: ['ess-flagellant-lash', 'ess-flagellant-mortify'],
    colors: ['채찍 갈색', '고행의 붉은'],
  },
  {
    id: 'choirmaster',
    name: '성가대장의 정수',
    icon: 'gi:music-spell',
    grade: 6,
    stats: { maxHp: 9, will: 2 },
    passive: {
      name: '지휘',
      desc: '3번째 턴마다 시작 시 행동력 +1',
      hooks: {
        onTurnStart(c, s) {
          if (c.s.turn % 3 !== 0) return;
          c.s.ap += s.n;
          c.emit({ t: 'text', uid: 'p', text: `지휘 — 행동력 +${s.n}`, tone: 'good' });
        },
      },
    },
    actives: ['ess-choirmaster-crescendo', 'ess-choirmaster-baton'],
    colors: ['지휘봉 흑단', '악보 금빛'],
  },
  {
    id: 'reliquary',
    name: '성유물함의 정수',
    icon: 'gi:mimic-chest',
    grade: 6,
    eldritch: true,
    stats: { maxHp: 10, will: 2 },
    passive: {
      name: '성유물의 가호',
      desc: '전투 시작 시 보호막 8',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 8 * s.n, c.p);
        },
      },
    },
    actives: ['ess-reliquary-shards', 'ess-reliquary-eye'],
    colors: ['성유물 금빛', '봉인 은빛'],
  },
  {
    id: 'high-priest',
    name: '대사제의 정수',
    icon: 'gi:pope-crown',
    grade: 4,
    stats: { maxHp: 12, str: 1, will: 2 },
    passive: {
      name: '제물',
      desc: '적을 처치할 때마다 힘 +1 (전투 동안)',
      hooks: {
        onKill(c, s) {
          c.apply(c.p, 'str', s.n, c.p);
        },
      },
    },
    actives: ['ess-high-priest-blade', 'ess-high-priest-sermon', 'ess-high-priest-descend'],
    colors: ['대사제의 보라', '제례 금빛', '심연 흑색'],
  },
  {
    id: 'ghoul-king',
    name: '구울 왕의 정수',
    icon: 'gi:throne-king',
    grade: 4,
    stats: { maxHp: 14, str: 2 },
    passive: {
      name: '뼈 왕좌',
      desc: '전투 시작 시 방어도 10, 굳건함 1 (첫 턴 동안 방어도 유지)',
      hooks: {
        onCombatStart(c, s) {
          c.gainBlock(c.p, 10 * s.n);
          c.apply(c.p, 'retain', 1, c.p);
        },
      },
    },
    actives: ['ess-ghoul-king-feast', 'ess-ghoul-king-crush'],
    colors: ['왕좌의 뼈', '굶주린 붉은'],
  },
  {
    id: 'deep-lord',
    name: '심해 군주의 정수',
    icon: 'gi:octoman',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 12, str: 1, will: 2 },
    passive: {
      name: '조수의 주인',
      desc: '심연의 조수 1단계당 공격 피해 +1',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p) d.add += (c.run.floor?.tide ?? 0) * s.n;
        },
      },
    },
    actives: ['ess-deep-lord-trident', 'ess-deep-lord-wave', 'ess-deep-lord-song'],
    colors: ['심해 청록', '해일 남색', '노래하는 은빛'],
  },
  {
    id: 'bellkeeper',
    name: '종지기의 계층정수',
    icon: 'gi:ringing-bell',
    grade: 3,
    lord: true,
    eldritch: true,
    stats: { maxHp: 18, str: 2, will: 2 },
    passive: {
      name: '대종의 울림',
      desc: '3번째 턴마다 시작 시 대종이 울려 적 전체에 비전 피해 6, 약화 1',
      hooks: {
        onTurnStart(c, s) {
          if (c.s.turn % 3 !== 0 || !c.alive.length) return;
          c.emit({ t: 'text', text: '어딘가에서 대종이 울린다', tone: 'eldritch' });
          for (const e of [...c.alive]) {
            c.damage({ src: c.p, tgt: e, base: 6 * s.n, type: 'arcane', tags: ['bell'] });
            if (!e.dead) c.apply(e, 'weak', 1, c.p);
          }
        },
      },
    },
    actives: ['ess-bellkeeper-hammer', 'ess-bellkeeper-toll', 'ess-bellkeeper-last'],
    colors: ['녹슨 청동', '종탑의 검정', '마지막 울림'],
  },
  {
    id: 'angler',
    name: '아귀의 정수',
    icon: 'gi:angler-fish',
    grade: 6,
    stats: { maxHp: 10, dex: 2 },
    passive: {
      name: '미끼 불빛',
      desc: '전투 시작 시 체력이 가장 높은 적에게 취약 2',
      hooks: {
        onCombatStart(c, s) {
          let t = c.alive[0];
          for (const e of c.alive) if (e.hp > t.hp) t = e;
          if (t) c.apply(t, 'vuln', 2 * s.n, c.p);
        },
      },
    },
    actives: ['ess-angler-lure', 'ess-angler-swallow'],
    colors: ['미끼 노랑', '심연 흑색'],
  },
  {
    id: 'inverted-saint',
    name: '거꾸로 된 성인의 정수',
    icon: 'gi:tarot-12-the-hanged-man',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 10, will: 2 },
    passive: {
      name: '거꾸로 된 기적',
      desc: '전투당 한 번, 쓰러질 피해를 받으면 체력 12로 버틴다',
      hooks: {
        onLethal(c, s) {
          if (c.s.vars.a2saint) return false;
          c.s.vars.a2saint = 1;
          c.p.hp = Math.min(c.p.maxHp, 12 * s.n);
          c.emit({ t: 'text', uid: 'p', text: '거꾸로 된 기적 — 쓰러지지 않았다', tone: 'eldritch' });
          return true;
        },
      },
    },
    actives: ['ess-inverted-saint-nails', 'ess-inverted-saint-invert'],
    colors: ['뒤집힌 금빛', '성흔의 붉은'],
  },
]);
