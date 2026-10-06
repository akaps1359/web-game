import { reg, ENEMIES } from '../../engine/registry';
import { isEnemy, lvlVal } from '../../engine/combat';
import { DMG_TYPES, type PlayerState, type SkillDef } from '../../engine/types';
import { guard, hit, skill } from '../lib';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

const isBoss = (defId: string) => ENEMIES.get(defId)?.tier === 'boss';

/*
 * 5층 정수. 등급: 일반 3 · 정예/추적자/균열 2 · 계층정수 1 · 최종 수호자 1.
 * (꿈의 땅 정수들은 3층에서 옮겨 오면서 5층 등급으로 올렸다)
 */

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 별의 태아 (최종 수호자)
  ess({
    id: 'ess-star-fetus-lullaby',
    name: '태아의 자장가',
    icon: 'gi:night-sleep',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'all',
    tags: ['debuff', 'sanity'],
    vals: { weak: 2, san: [6, 8] },
    desc: '적 전체 약화 {weak}, 정신력 +{san}',
    run: (c, u) => {
      for (const e of [...c.alive]) c.apply(e, 'weak', u.v('weak'), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-star-fetus-shell',
    name: '별자리 껍질',
    icon: 'gi:cosmic-egg',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'retain'],
    vals: { blk: [14, 18], barrier: [6, 8] },
    desc: '방어도 {B:blk}, 보호막 {barrier}. 다음 턴까지 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p);
      c.apply(c.p, 'retain', 1, c.p);
    },
  }),
  ess({
    id: 'ess-star-fetus-cry',
    name: '첫 울음',
    icon: 'gi:screaming',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe'],
    vals: { dmg: [22, 28], poise: 1 },
    desc: '적 전체에 {D:dmg} 공허 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 요람의 수문장
  ess({
    id: 'ess-cradle-warden-fist',
    name: '운석 주먹',
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
    id: 'ess-cradle-warden-wall',
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
    name: '요람의 설교',
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
    name: '검은 별빛의 창',
    icon: 'gi:spear-feather',
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
  // 별빛 순례자
  ess({
    id: 'ess-star-pilgrim-bless',
    name: '별빛의 축복',
    icon: 'gi:pilgrim-hat',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block', 'sanity'],
    vals: { barrier: [8, 10], san: 3 },
    desc: '보호막 {barrier} (턴이 지나도 유지), 정신력 +{san}',
    run: (c, u) => {
      c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  ess({
    id: 'ess-star-pilgrim-penance',
    name: '고행',
    icon: 'gi:star-swirl',
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
  // 성운 해파리
  ess({
    id: 'ess-nebula-jelly-sting',
    name: '빛줄기 쏘기',
    icon: 'gi:jellyfish',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'multi', 'debuff'],
    vals: { dmg: [5, 6], hits: 2, frail: 1 },
    desc: '{D:dmg} 비전 피해 {hits}회, 허약 {frail}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'frail', u.v('frail'), c.p);
    },
  }),
  ess({
    id: 'ess-nebula-jelly-pulse',
    name: '성운의 맥동',
    icon: 'gi:embryo',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { barrier: [9, 12] },
    desc: '보호막 {barrier} (턴이 지나도 유지)',
    run: (c, u) => void c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p),
  }),
  // 별을 삼킨 것
  ess({
    id: 'ess-star-swallower-pull',
    name: '빛을 빨아들인다',
    icon: 'gi:black-hole-bolas',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'block'],
    vals: { blk: [6, 8] },
    desc: '대상의 방어도를 모두 빼앗아 내 방어도로 삼고, 추가로 방어도 {B:blk}',
    run: (c, u, t) => {
      const n = t && !t.dead ? t.block : 0;
      if (t && n > 0) {
        t.block = 0;
        c.emit({ t: 'text', uid: t.uid, text: `방어도 ${n}을(를) 빼앗았다`, tone: 'good' });
        c.gainBlock(c.p, n);
      }
      guard(c, u);
    },
  }),
  ess({
    id: 'ess-star-swallower-swallow',
    name: '통째로 삼킨다',
    icon: 'gi:carnivore-mouth',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [24, 30] },
    desc: '{D:dmg} 공허 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 꿈 사냥꾼 (추적자)
  ess({
    id: 'ess-dream-hunter-net',
    name: '꿈 그물',
    icon: 'gi:bug-net',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { stun: 1, vuln: 2 },
    desc: '기절 {stun} (수호자에게는 대신 취약 {vuln})',
    run: (c, u, t) => {
      if (!t) return;
      if (isBoss(t.def)) c.apply(t, 'vuln', u.v('vuln'), c.p);
      else c.apply(t, 'stun', u.v('stun'), c.p);
    },
  }),
  ess({
    id: 'ess-dream-hunter-skewer',
    name: '꿈 꿰뚫기',
    icon: 'gi:thrown-spear',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [26, 32], poise: 2 },
    desc: '{D:dmg} 관통 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
]);

// ───────────── 정수 정의 ─────────────
// 수호자·계층군주와 균열 수호자의 정수는 언제나 수호자 정수(s.n = 2) — 패시브 설명에는 2배 한 실제 수치를 적는다.

reg.essences([
  {
    id: 'star-fetus',
    name: '별의 태아의 정수',
    icon: 'gi:fetus',
    grade: 1,
    eldritch: true,
    stats: { maxHp: 20, str: 3, will: 3 },
    passive: {
      name: '태어나지 않은 꿈',
      desc: '전투 시작 시 보호막 20, 결계 1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 10 * s.n, c.p);
          c.apply(c.p, 'ward', 1, c.p);
        },
      },
    },
    actives: ['ess-star-fetus-lullaby', 'ess-star-fetus-shell', 'ess-star-fetus-cry'],
    colors: ['성운의 장밋빛', '별자리 금빛', '탄생의 흰빛'],
  },
  {
    id: 'cradle-warden',
    name: '요람 수문장의 정수',
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
    actives: ['ess-cradle-warden-fist', 'ess-cradle-warden-wall'],
    colors: ['운석 회색', '어긋난 금빛'],
  },
  {
    id: 'dream-hierophant',
    name: '꿈의 대사제의 정수',
    icon: 'gi:warlock-hood',
    grade: 2,
    stats: { maxHp: 12, will: 3, maxSanity: 5 },
    passive: {
      name: '끝없는 자장가',
      desc: '내 턴이 끝날 때 정신력 +2',
      hooks: {
        onTurnEnd(c, s) {
          c.gainSanity(2 * s.n);
        },
      },
    },
    actives: ['ess-dream-hierophant-sermon', 'ess-dream-hierophant-spear'],
    colors: ['성운 사제의 남보라', '검은 별빛'],
  },
  {
    id: 'star-pilgrim',
    name: '별빛 순례자의 정수',
    icon: 'gi:cowled',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 10, will: 2 },
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
    actives: ['ess-star-pilgrim-bless', 'ess-star-pilgrim-penance'],
    colors: ['별빛 은색', '꺼져 가는 별'],
  },
  {
    id: 'nebula-jelly',
    name: '성운 해파리의 정수',
    icon: 'gi:jellyfish',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 10, will: 1, maxSanity: 3 },
    passive: {
      name: '별의 요람',
      desc: '전투의 세 번째 턴이 시작될 때 보호막 8',
      hooks: {
        onTurnStart(c, s) {
          if (c.s.turn === 3) c.apply(c.p, 'barrier', 8 * s.n, c.p);
        },
      },
    },
    actives: ['ess-nebula-jelly-sting', 'ess-nebula-jelly-pulse'],
    colors: ['성운 분홍', '아기 별의 금빛'],
  },
  {
    id: 'star-swallower',
    name: '별을 삼킨 것의 정수',
    icon: 'gi:black-hole-bolas',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 14, str: 1 },
    passive: {
      name: '삼킨 별',
      desc: '적을 붕괴시킬 때마다 다른 모든 적에게 화염 피해 6',
      hooks: {
        onBreak(c, s, victim) {
          for (const e of [...c.alive]) if (e !== victim) c.damage({ src: null, tgt: e, base: 6 * s.n, type: 'fire', tags: ['a5-spit'] });
        },
      },
    },
    actives: ['ess-star-swallower-pull', 'ess-star-swallower-swallow'],
    colors: ['사건의 지평선 검정', '삼킨 별의 주황'],
  },
  {
    id: 'dream-hunter',
    name: '꿈 사냥꾼의 정수',
    icon: 'gi:hooded-assassin',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, dex: 2, will: 1 },
    passive: {
      name: '사냥꾼의 눈',
      desc: '붕괴한 적에게 주는 공격 피해 +15%',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && d.src === c.p && isEnemy(d.tgt) && d.tgt.broken > 0) d.mult *= 1 + 0.15 * s.n;
        },
      },
    },
    actives: ['ess-dream-hunter-net', 'ess-dream-hunter-skewer'],
    colors: ['사냥꾼의 청록', '붙잡힌 꿈의 은빛'],
  },
]);

// ═════════════ 꿈의 땅 — 2026-10 개편 때 3층(꿈의 경계)에서 옮겨 왔다 ═════════════

// ───────────── 꿈의 땅 정수 액티브 ─────────────

reg.skills([
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
    tags: ['buff', 'energy'],
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
    vals: { blk: [7, 9], san: [6, 8], retain: 2 },
    desc: '방어도 {B:blk}, 정신력 +{san}. 다음 {retain}턴 동안 방어도 유지',
    run: (c, u) => {
      guard(c, u);
      c.gainSanity(u.v('san'));
      c.apply(c.p, 'retain', u.v('retain'), c.p);
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
  // 꿈의 문지기 (정예)
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
    desc: '{D:dmg} 공허 피해. 대상이 힘을 모으는 중(차지)이면 피해 2배',
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
      c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p);
      c.apply(c.p, 'evasive', 1, c.p);
    },
  }),
]);

// ───────────── 꿈의 땅 정수 정의 ─────────────

reg.essences([
  {
    id: 'moonbeast',
    name: '달짐승의 정수',
    icon: 'gi:toad-teeth',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 12, str: 1 },
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
    grade: 3,
    eldritch: true,
    stats: { maxHp: 10, dex: 1 },
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
    grade: 3,
    eldritch: true,
    stats: { maxHp: 14, str: 1 },
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
    grade: 3,
    stats: { maxHp: 12, will: 1 },
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
    grade: 3,
    eldritch: true,
    stats: { maxHp: 10, dex: 2 },
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
    id: 'saturn-cat',
    name: '토성의 고양이의 정수',
    icon: 'gi:hollow-cat',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, dex: 2 },
    passive: {
      name: '아홉 목숨',
      desc: '전투마다 한 번, 쓰러질 피해를 받으면 체력 1로 버틴다',
      hooks: {
        onLethal(c, s) {
          const used = c.s.vars.a5Lives ?? 0;
          if (used >= s.n) return false;
          c.s.vars.a5Lives = used + 1;
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
    id: 'dream-gatekeeper',
    name: '꿈의 문지기의 정수',
    icon: 'gi:door-watcher',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, will: 2, maxSanity: 6 },
    passive: {
      name: '문지기의 눈',
      desc: '전투 시작 시 결계 1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'ward', s.n, c.p);
        },
      },
    },
    actives: ['ess-dream-gatekeeper-judgment', 'ess-dream-gatekeeper-riddle'],
    colors: ['문지기의 금빛', '수수께끼 보라'],
  },
  {
    id: 'dream-eater',
    name: '꿈을 먹는 자의 계층정수',
    icon: 'gi:evil-moon',
    grade: 1,
    lord: true,
    eldritch: true,
    stats: { maxHp: 18, str: 2, will: 2 },
    passive: {
      name: '악몽 포식',
      desc: '적을 처치할 때마다 정신력 +8, 체력 8 회복',
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
    id: 'liminal',
    name: '문턱의 존재의 정수',
    icon: 'gi:magic-portal',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, will: 2 },
    passive: {
      name: '문턱의 걸음',
      desc: '홀수 턴에는 참격·관통·타격, 짝수 턴에는 화염·비전·공허 공격 피해 +40%',
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
