import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { guard, hit, skill } from '../lib';
import type { SkillDef } from '../../engine/types';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 부두 깡패
  ess({
    id: 'ess-thug-pipe',
    name: '쇠파이프 휘두르기',
    icon: 'gi:monkey-wrench',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 타격 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-thug-jeer',
    name: '조롱',
    icon: 'gi:shouting',
    rarity: 'common',
    cost: 0,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { weak: [2, 3] },
    desc: '약화 {weak}',
    run: (c, u, t) => void (t && c.apply(t, 'weak', u.v('weak'), c.p)),
  }),
  // 밀수꾼
  ess({
    id: 'ess-smuggler-pistol',
    name: '숨긴 권총',
    icon: 'gi:pistol-gun',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [7, 9] },
    desc: '방어도를 무시하고 {D:dmg} 관통 피해',
    run: (c, u, t) => void hit(c, u, t, { ignoreBlock: true }),
  }),
  ess({
    id: 'ess-smuggler-smoke',
    name: '연막 투척',
    icon: 'gi:smoke-bomb',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { blk: [4, 6] },
    desc: '방어도 {B:blk}, 회피 1',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'evasive', 1, c.p);
    },
  }),
  // 들개
  ess({
    id: 'ess-dog-bite',
    name: '물어뜯기',
    icon: 'gi:fangs',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed'],
    vals: { dmg: [5, 7], bleed: [2, 3] },
    desc: '{D:dmg} 참격 피해, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-dog-howl',
    name: '울부짖기',
    icon: 'gi:wolf-howl',
    rarity: 'common',
    cost: [1, 0],
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['buff'],
    vals: { str: 2 },
    desc: '힘 +{str} (전투 동안)',
    run: (c, u) => void c.apply(c.p, 'str', u.v('str'), c.p),
  }),
  // 시궁쥐 떼
  ess({
    id: 'ess-rats-swarm',
    name: '쥐떼 풀기',
    icon: 'gi:rat',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [3, 4], hits: 4 },
    desc: '무작위 적에게 {D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-rats-plague',
    name: '역병',
    icon: 'gi:poison-bottle',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['poison', 'debuff'],
    vals: { poison: [5, 7], weak: 1 },
    desc: '독 {poison}, 약화 {weak}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'poison', u.v('poison'), c.p);
      c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  // 술 취한 선원
  ess({
    id: 'ess-sailor-bottle',
    name: '병 깨기',
    icon: 'gi:broken-bottle',
    rarity: 'common',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'debuff'],
    vals: { dmg: [8, 10], weak: 1 },
    desc: '{D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-sailor-shanty',
    name: '뱃노래',
    icon: 'gi:sing',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity'],
    vals: { blk: [5, 7], san: [4, 6] },
    desc: '방어도 {B:blk}, 정신력 +{san}',
    run: (c, u) => {
      guard(c, u);
      c.gainSanity(u.v('san'));
    },
  }),
  // 교단 입문자
  ess({
    id: 'ess-initiate-whisper',
    name: '광기의 속삭임',
    icon: 'gi:psychic-waves',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { madden: [2, 3] },
    desc: '광란 {madden} (공격이 동료를 향할 수 있다)',
    run: (c, u, t) => void (t && c.apply(t, 'madden', u.v('madden'), c.p)),
  }),
  ess({
    id: 'ess-initiate-prayer',
    name: '어둠의 기도',
    icon: 'gi:prayer',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'sanity'],
    vals: { str: [2, 3], san: 3 },
    desc: '힘 +{str} (전투 동안), 정신력 -{san}',
    run: (c, u) => {
      c.apply(c.p, 'str', u.v('str'), c.p);
      c.loseSanity(u.v('san'));
    },
  }),
  // 익사체
  ess({
    id: 'ess-drowned-grasp',
    name: '익사자의 손아귀',
    icon: 'gi:grasping-claws',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'debuff'],
    vals: { dmg: [7, 9], weak: 1 },
    desc: '{D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-drowned-bile',
    name: '검은 물',
    icon: 'gi:dripping-goo',
    rarity: 'common',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [3, 4], weak: 1 },
    desc: '적 전체에 {D:dmg} 공허 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  // 갈매기
  ess({
    id: 'ess-gull-peck',
    name: '쪼아대기',
    icon: 'gi:bird-claw',
    rarity: 'common',
    cost: 0,
    cd: 1,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'multi'],
    vals: { dmg: [2, 3], hits: 2 },
    desc: '무작위 적에게 {D:dmg} 관통 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-gull-dive',
    name: '급강하',
    icon: 'gi:seagull',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [8, 11] },
    desc: '{D:dmg} 관통 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 갈고리꾼
  ess({
    id: 'ess-hook-pull',
    name: '끌어당기기',
    icon: 'gi:meat-hook',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack', 'pull'],
    vals: { dmg: [6, 8] },
    desc: '{D:dmg} 관통 피해. 대상이 후열에 있으면 전열로 끌어당긴다 (전열에 자리가 있을 때)',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead && t.row === 1) c.moveRow(t, 0);
    },
  }),
  ess({
    id: 'ess-hook-slam',
    name: '내려찍기',
    icon: 'gi:claw-hammer',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [18, 22], poise: 1 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 어둠 속의 눈
  ess({
    id: 'ess-lurker-gaze',
    name: '심연의 응시',
    icon: 'gi:evil-eyes',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'debuff'],
    vals: { dmg: [5, 7], vuln: [1, 2] },
    desc: '{D:dmg} 공허 피해, 취약 {vuln}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  ess({
    id: 'ess-lurker-claw',
    name: '그림자 손톱',
    icon: 'gi:shadow-grasp',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [6, 8] },
    desc: '{D:dmg} 공허 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 어시장 도살자
  ess({
    id: 'ess-butcher-hack',
    name: '난도질',
    icon: 'gi:meat-cleaver',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'bleed', 'multi'],
    vals: { dmg: [4, 5], hits: 3, bleed: [2, 3] },
    desc: '{D:dmg} 참격 피해 {hits}회, 출혈 {bleed}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'bleed', u.v('bleed'), c.p);
    },
  }),
  ess({
    id: 'ess-butcher-chop',
    name: '토막내기',
    icon: 'gi:cleaver',
    rarity: 'uncommon',
    cost: 2,
    cd: 4,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [22, 28] },
    desc: '{D:dmg} 참격 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 교단 집행자
  ess({
    id: 'ess-enforcer-wall',
    name: '신앙의 방벽',
    icon: 'gi:bell-shield',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { blk: [10, 14] },
    desc: '방어도 {B:blk}, 결계 1',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'ward', 1, c.p);
    },
  }),
  ess({
    id: 'ess-enforcer-execute',
    name: '처형',
    icon: 'gi:executioner-hood',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [13, 16] },
    desc: '{D:dmg} 타격 피해. 대상 체력이 30% 이하면 2배',
    run: (c, u, t) => {
      const low = t && t.hp <= t.maxHp * 0.3;
      hit(c, u, t, { dmg: u.v('dmg') * (low ? 2 : 1) });
    },
  }),
  // 거대 게
  ess({
    id: 'ess-crab-shell',
    name: '껍질 닫기',
    icon: 'gi:spiked-shell',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'retain'],
    vals: { blk: [12, 16] },
    desc: '방어도 {B:blk}. 다음 턴까지 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'retain', 1, c.p);
    },
  }),
  ess({
    id: 'ess-crab-claw',
    name: '집게 분쇄',
    icon: 'gi:crab-claw',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [12, 15], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 등대지기
  ess({
    id: 'ess-lk-beam',
    name: '등대 광선',
    icon: 'gi:sunbeams',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'fire',
    tags: ['attack', 'aoe'],
    vals: { dmg: [9, 12] },
    desc: '적 전체에 {D:dmg} 화염 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-lk-flare',
    name: '섬광',
    icon: 'gi:sun-radiations',
    rarity: 'rare',
    cost: [1, 0],
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 2 },
    desc: '적 전체 약화 {weak}',
    run: (c, u) => {
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  // 밀수조직 두목
  ess({
    id: 'ess-queen-volley',
    name: '일제 사격',
    icon: 'gi:crossed-pistols',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'pierce',
    tags: ['attack', 'multi'],
    vals: { dmg: [4, 5], hits: 4 },
    desc: '무작위 적에게 {D:dmg} 관통 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-queen-bounty',
    name: '현상금',
    icon: 'gi:wanted-reward',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { vuln: [2, 3] },
    desc: '취약 {vuln}. 이 전투에서 대상을 처치하면 골드 +15',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'vuln', u.v('vuln'), c.p);
      t.mem.bounty = 1;
    },
  }),
  // 늙은 어부
  ess({
    id: 'ess-fisher-net',
    name: '그물 던지기',
    icon: 'gi:fishing-net',
    rarity: 'rare',
    cost: 1,
    cd: [4, 3],
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { stun: 1 },
    desc: '기절 {stun}',
    run: (c, u, t) => void (t && c.apply(t, 'stun', u.v('stun'), c.p)),
  }),
  ess({
    id: 'ess-fisher-maw',
    name: '심해의 아가리',
    icon: 'gi:fish-monster',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [16, 20], heal: [5, 7] },
    desc: '{D:dmg} 공허 피해, 체력 {heal} 회복',
    run: (c, u, t) => {
      hit(c, u, t);
      c.heal(c.p, u.v('heal'));
    },
  }),
  // 익사한 선장 (계층정수)
  ess({
    id: 'ess-captain-anchor',
    name: '닻 내려치기',
    icon: 'gi:anchor',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [22, 28], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-captain-call',
    name: '익사한 손길',
    icon: 'gi:drowning',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['summon'],
    vals: { n: [2, 3] },
    desc: '촉수 {n} (턴 종료마다 무작위 적 공격)',
    run: (c, u) => void c.apply(c.p, 'tentacle', u.v('n'), c.p),
  }),
  // 안개 속 사냥꾼
  ess({
    id: 'ess-fog-ambush',
    name: '기습',
    icon: 'gi:backstab',
    rarity: 'uncommon',
    cost: 0,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [9, 12] },
    desc: '{D:dmg} 참격 피해. 전투 첫 턴이면 2배',
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') * (c.s.turn === 1 ? 2 : 1) }),
  }),
  ess({
    id: 'ess-fog-veil',
    name: '안개 장막',
    icon: 'gi:fog',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { blk: [4, 7] },
    desc: '방어도 {B:blk}, 회피 1',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'evasive', 1, c.p);
    },
  }),
  // 바다 무덤의 망령
  ess({
    id: 'ess-wraith-chill',
    name: '냉기의 손길',
    icon: 'gi:frozen-body',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'void',
    tags: ['attack', 'debuff'],
    vals: { dmg: [8, 10], weak: 1 },
    desc: '{D:dmg} 공허 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-wraith-wail',
    name: '망령의 울부짖음',
    icon: 'gi:screaming',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: 4, madden: [1, 2] },
    desc: '적 전체에 {D:dmg} 공허 피해, 광란 {madden}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'madden', u.v('madden'), c.p);
    },
  }),
]);

// ───────────── 정수 정의 ─────────────
// 수호자·계층군주(tier 'boss')와 균열 수호자의 정수는 언제나 '수호자 정수'로 떨어져 패시브 훅의 s.n = 2 다.
// 그런 정수의 패시브 설명에는 s.n = 2 를 곱한 실제 수치를 적는다 (tests/audit-essences.test.ts).

reg.essences([
  {
    id: 'thug',
    name: '부두 깡패의 정수',
    icon: 'gi:bandit',
    grade: 9,
    stats: { maxHp: 4, str: 1 },
    passive: {
      name: '거친 주먹',
      desc: '무기 기본 공격 피해 +2',
      hooks: {
        modDamageOut(_c, s, d) {
          if (d.skill?.basic === 'weapon') d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-thug-pipe', 'ess-thug-jeer'],
    colors: ['녹슨 회색', '피멍 보라'],
  },
  {
    id: 'smuggler',
    name: '밀수꾼의 정수',
    icon: 'gi:hooded-assassin',
    grade: 9,
    stats: { dex: 1, maxHp: 2 },
    passive: {
      name: '빠른 손',
      desc: '전투 승리 시 골드 +6',
      hooks: {
        onCombatEnd(c, s, won) {
          if (won) c.s.bonusGold += 6 * s.n;
        },
      },
    },
    actives: ['ess-smuggler-pistol', 'ess-smuggler-smoke'],
    colors: ['화약 검정', '안개 회색'],
  },
  {
    id: 'dog',
    name: '들개의 정수',
    icon: 'gi:direwolf',
    grade: 9,
    stats: { dex: 1 },
    passive: {
      name: '사냥 본능',
      desc: '출혈 중인 적에게 공격 피해 +2',
      hooks: {
        modDamageOut(_c, s, d) {
          if (d.attack && (d.tgt.st.bleed ?? 0) > 0) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-dog-bite', 'ess-dog-howl'],
    colors: ['핏빛 갈색', '달빛 회색'],
  },
  {
    id: 'rats',
    name: '시궁쥐 떼의 정수',
    icon: 'gi:rat',
    grade: 9,
    stats: { maxHp: 3 },
    passive: {
      name: '무리 근성',
      desc: '여러 번 타격하는 스킬의 타격당 피해 +1',
      hooks: {
        modDamageOut(_c, s, d) {
          // multi 태그가 없어도 타격 횟수(hits)가 2 이상이면 여러 번 타격하는 스킬이다 (산탄 발사 등)
          // '타격마다'로 설계된 효과라 고정 가산 1회 규칙을 받지 않는다 (addEach)
          const u = d.skill;
          if (u && (u.def.tags.includes('multi') || u.v('hits') > 1)) d.addEach += s.n;
        },
      },
    },
    actives: ['ess-rats-swarm', 'ess-rats-plague'],
    colors: ['오물 갈색', '병든 초록'],
  },
  {
    id: 'sailor',
    name: '선원의 정수',
    icon: 'gi:pirate-captain',
    grade: 9,
    stats: { maxHp: 5, will: 1 },
    passive: {
      name: '술기운',
      desc: '받는 정신 피해 -10%',
      hooks: { modSanityLoss: (_c, s, n) => n * (1 - 0.1 * s.n) },
    },
    actives: ['ess-sailor-bottle', 'ess-sailor-shanty'],
    colors: ['호박색', '바다 남색'],
  },
  {
    id: 'initiate',
    name: '교단 입문자의 정수',
    icon: 'gi:cultist',
    grade: 9,
    stats: { will: 1 },
    passive: {
      name: '어설픈 기도',
      desc: '전투 시작 시 힘 +1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'str', s.n, c.p);
        },
      },
    },
    actives: ['ess-initiate-whisper', 'ess-initiate-prayer'],
    colors: ['탁한 자주', '검은 자주'],
  },
  {
    id: 'drowned',
    name: '익사체의 정수',
    icon: 'gi:shambling-zombie',
    grade: 8,
    stats: { maxHp: 6 },
    passive: {
      name: '익사자의 끈기',
      desc: '체력이 50% 이하일 때 받는 공격 피해 -2',
      hooks: {
        modDamageIn(c, s, d) {
          if (d.attack && c.p.hp <= c.p.maxHp / 2) d.add -= 2 * s.n;
        },
      },
    },
    actives: ['ess-drowned-grasp', 'ess-drowned-bile'],
    colors: ['청록', '심해 검정'],
  },
  {
    id: 'gulls',
    name: '썩은 갈매기의 정수',
    icon: 'gi:seagull',
    grade: 9,
    stats: { dex: 1 },
    passive: {
      name: '하늘의 눈',
      desc: '원거리 공격 피해 +1',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && !d.melee && d.src === c.p) d.add += s.n;
        },
      },
    },
    actives: ['ess-gull-peck', 'ess-gull-dive'],
    colors: ['잿빛', '흰빛'],
  },
  {
    id: 'hookman',
    name: '갈고리꾼의 정수',
    icon: 'gi:pirate-hook',
    grade: 8,
    stats: { str: 1, maxHp: 3 },
    passive: {
      name: '갈고리 손',
      desc: '매 턴 첫 근접 공격의 버팀 피해 +1',
      hooks: {
        onTurnStart(_c, s) {
          s.unit.st._hook = 1;
        },
        modDamageOut(_c, s, d) {
          if (d.attack && d.melee && s.unit.st._hook) d.poiseBonus += s.n;
        },
        onDamageDealt(_c, s, d) {
          if (d.attack && d.melee) delete s.unit.st._hook;
        },
      },
    },
    actives: ['ess-hook-pull', 'ess-hook-slam'],
    colors: ['녹슨 주황', '강철 회색'],
  },
  {
    id: 'lurker',
    name: '어둠 속 눈의 정수',
    icon: 'gi:evil-eyes',
    grade: 8,
    eldritch: true,
    stats: { dex: 1 },
    passive: {
      name: '어둠 시야',
      desc: '등불이 50 미만일 때 주는 피해 +20%',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && c.run.light < 50) d.mult *= 1 + 0.2 * s.n;
        },
      },
    },
    actives: ['ess-lurker-gaze', 'ess-lurker-claw'],
    colors: ['병든 노랑', '칠흑'],
  },
  {
    id: 'butcher',
    name: '도살자의 정수',
    icon: 'gi:meat-cleaver',
    grade: 7,
    stats: { str: 2, maxHp: 8 },
    passive: {
      name: '도살자의 손놀림',
      desc: '출혈 중인 적에게 공격 피해 +3',
      hooks: {
        modDamageOut(_c, s, d) {
          if (d.attack && (d.tgt.st.bleed ?? 0) > 0) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-butcher-hack', 'ess-butcher-chop'],
    colors: ['선홍', '검붉은'],
  },
  {
    id: 'enforcer',
    name: '교단 집행자의 정수',
    icon: 'gi:executioner-hood',
    grade: 7,
    stats: { maxHp: 8, will: 2 },
    passive: {
      name: '광신자의 방패',
      desc: '턴 시작 시 방어도 3',
      hooks: {
        onTurnStart(c, s) {
          c.gainBlock(c.p, 3 * s.n);
        },
      },
    },
    actives: ['ess-enforcer-wall', 'ess-enforcer-execute'],
    colors: ['성유 금빛', '처형대 검정'],
  },
  {
    id: 'crab',
    name: '거대 게의 정수',
    icon: 'gi:crab',
    grade: 7,
    stats: { maxHp: 10, dex: 1 },
    passive: {
      name: '갑각',
      desc: '턴 종료 시 방어도가 0이면 방어도 4',
      hooks: {
        onTurnEnd(c, s) {
          if (c.p.block === 0) c.gainBlock(c.p, 4 * s.n);
        },
      },
    },
    actives: ['ess-crab-shell', 'ess-crab-claw'],
    colors: ['산호 주황', '심해 적갈'],
  },
  {
    id: 'lightkeeper',
    name: '등대지기의 정수',
    icon: 'gi:lighthouse',
    grade: 5,
    stats: { maxHp: 10, will: 2, maxSanity: 5 },
    passive: {
      name: '등명기의 빛',
      desc: '전투 시작 시 모든 적의 약점 공개',
      hooks: {
        onCombatStart(c) {
          for (const e of c.alive) e.known = [...e.weak];
        },
      },
    },
    actives: ['ess-lk-beam', 'ess-lk-flare'],
    colors: ['백열', '눈먼 금빛'],
  },
  {
    id: 'queen',
    name: '밀수조직 두목의 정수',
    icon: 'gi:queen-crown',
    grade: 5,
    stats: { dex: 2, maxHp: 6 },
    passive: {
      name: '두목의 몫',
      desc: '전투 승리 시 골드 +15. 현상금이 걸린 적을 처치하면 골드 +15',
      hooks: {
        onCombatEnd(c, _s, won) {
          if (won) c.s.bonusGold += 15;
        },
        onKill(c, _s, victim) {
          if (victim.mem.bounty) {
            c.s.bonusGold += 15;
            c.emit({ t: 'text', uid: victim.uid, text: '현상금 +15', tone: 'good' });
          }
        },
      },
    },
    actives: ['ess-queen-volley', 'ess-queen-bounty'],
    colors: ['금화빛', '와인 붉은'],
  },
  {
    id: 'fisherman',
    name: '심해 혼혈의 정수',
    icon: 'gi:fish-monster',
    grade: 5,
    eldritch: true,
    stats: { maxHp: 8, will: 1 },
    passive: {
      name: '아가미',
      desc: '턴 종료 시 체력 2 회복',
      hooks: {
        onTurnEnd(c, s) {
          c.heal(c.p, s.n);
        },
      },
    },
    actives: ['ess-fisher-net', 'ess-fisher-maw'],
    colors: ['그물 갈색', '심해 청록'],
  },
  {
    id: 'captain',
    name: '익사한 선장의 계층정수',
    icon: 'gi:pirate-skull',
    grade: 4,
    lord: true,
    eldritch: true,
    stats: { maxHp: 15, str: 2, will: 2 },
    passive: {
      name: '저주받은 닻',
      desc: '전투 시작 시 모든 적에게 약화 1, 취약 1',
      hooks: {
        onCombatStart(c) {
          for (const e of c.alive) {
            c.apply(e, 'weak', 1, c.p);
            c.apply(e, 'vuln', 1, c.p);
          }
        },
      },
    },
    actives: ['ess-captain-anchor', 'ess-captain-call'],
    colors: ['녹청', '익사자의 청'],
  },
  {
    id: 'fogstalker',
    name: '안개 사냥꾼의 정수',
    icon: 'gi:spectre',
    grade: 7,
    stats: { dex: 2 },
    passive: {
      name: '안개 걸음',
      desc: '전투 시작 시 회피 1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'evasive', s.n, c.p);
        },
      },
    },
    actives: ['ess-fog-ambush', 'ess-fog-veil'],
    colors: ['안개 흰빛', '그림자 회색'],
  },
  {
    id: 'wraith',
    name: '망령의 정수',
    icon: 'gi:floating-ghost',
    grade: 6,
    eldritch: true,
    stats: { maxSanity: 5, will: 1 },
    passive: {
      name: '망령의 냉기',
      desc: '매 턴 첫 공격이 대상에게 약화 1을 건다',
      hooks: {
        onTurnStart(_c, s) {
          s.unit.st._chill = 1;
        },
        onDamageDealt(c, s, d) {
          if (d.attack && s.unit.st._chill && isEnemy(d.tgt) && !d.killed) {
            delete s.unit.st._chill;
            c.apply(d.tgt, 'weak', 1, c.p);
          }
        },
      },
    },
    actives: ['ess-wraith-chill', 'ess-wraith-wail'],
    colors: ['서리 푸른', '망자의 회색'],
  },
]);
