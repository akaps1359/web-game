import { reg } from '../../engine/registry';
import { isEnemy, lvlVal, type Combat } from '../../engine/combat';
import { combo, cycleNote, dealt, guard, hit, killed, skill } from '../lib';
import type { SkillDef } from '../../engine/types';
import { flipRows } from './common';
import { TIME_DEBT } from './court';
import { setSt } from './patterns';
import { weakPointOf } from '../../engine/weakpoint';

const ess = (d: Omit<SkillDef, 'school' | 'pool' | 'tags' | 'vals'> & { tags?: string[]; vals?: SkillDef['vals'] }) =>
  skill({ school: 'essence', pool: false, ...d });

/**
 * 재사용 대기를 줄이거나 없애도 되는 기술인가.
 * 전투당 1회 기술(대기 99 — 매 턴 1씩 줄어 98, 97…이 된다)과 표본으로 빼앗긴 기술(대기 99로 잠김)은 건드리지 않는다.
 */
function refreshable(c: Combat, uid: string): boolean {
  const left = c.s.cd[uid] ?? 0;
  if (left <= 0) return false;
  const info = c.skillInfo(uid);
  if (!info) return left < 90;
  if (lvlVal(info.def.cd, info.owned.lvl) >= 90) return false;
  const slot = c.run.slots.indexOf(uid);
  return !c.alive.some((e) => e.mem.specimen && e.mem.specimen - 1 === slot);
}

// ───────────── 정수 액티브 ─────────────

reg.skills([
  // 별의 자손
  ess({
    id: 'ess-star-spawn-claw',
    name: '별의 손아귀',
    icon: 'gi:grasping-claws',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [20, 25], poise: 1 },
    desc: '{D:dmg} 참격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-star-spawn-dream',
    name: '꿈의 송신',
    icon: 'gi:psychic-waves',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { madden: 1, weak: [1, 2] },
    desc: '모든 적에게 광란 {madden}, 약화 {weak}',
    run: (c, u) => {
      for (const e of c.alive) {
        c.apply(e, 'madden', u.v('madden'), c.p);
        c.apply(e, 'weak', u.v('weak'), c.p);
      }
    },
  }),
  // 무형의 피리꾼
  ess({
    id: 'ess-formless-piper-discord',
    name: '불협화음',
    icon: 'gi:sound-waves',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe', 'debuff'],
    vals: { dmg: [7, 9], madden: 1 },
    desc: '적 전체에 {D:dmg} 공허 피해, 광란 {madden}',
    run: (c, u, t) => {
      hit(c, u, t);
      for (const e of c.alive) c.apply(e, 'madden', u.v('madden'), c.p);
    },
  }),
  ess({
    id: 'ess-formless-piper-frenzy',
    name: '광란의 선율',
    icon: 'gi:pan-flute',
    rarity: 'uncommon',
    cost: 0,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['buff', 'sanity'],
    vals: { pct: [40, 60], san: 4 },
    desc: '이번 턴 공격 피해 +{pct}%, 정신력 -{san}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      c.apply(c.p, 'frenzy', u.v('pct'), c.p);
    },
  }),
  // 검은 새끼
  ess({
    id: 'ess-dark-young-lash',
    name: '촉수 채찍',
    icon: 'gi:curled-tentacle',
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
    id: 'ess-dark-young-trample',
    name: '짓밟기',
    icon: 'gi:evil-tree',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'front',
    type: 'blunt',
    tags: ['attack', 'aoe'],
    vals: { dmg: [16, 20], poise: 1 },
    desc: '전열 전체에 {D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 시간의 파수꾼
  ess({
    id: 'ess-time-warden-sentence',
    name: '파멸의 선고',
    icon: 'gi:sands-of-time',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'doom'],
    vals: { doom: [14, 20] },
    desc: '파멸 {doom} (대상의 턴이 끝날 때 체력이 파멸 이하면 즉사)',
    run: (c, u, t) => void (t && c.apply(t, 'doom', u.v('doom'), c.p)),
  }),
  ess({
    id: 'ess-time-warden-rewind',
    name: '되감기',
    icon: 'gi:backward-time',
    rarity: 'uncommon',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal', 'refresh'],
    vals: { heal: [10, 14] },
    desc: '체력 {heal} 회복. 재사용 대기 중인 다른 스킬 하나를 바로 쓸 수 있게 한다 (전투당 1회 스킬과 대기를 되돌리는 스킬은 제외)',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      // 대기를 되돌리는 기술(임기응변 등)끼리 서로 되돌리면 한 턴에 끝없이 쓰는 고리가 된다
      const keys = Object.keys(c.s.cd).filter((k) => k !== u.owned.uid && refreshable(c, k) && !c.skillInfo(k)?.def.tags.includes('refresh'));
      // 메아리 사본은 되돌리지 않는다
      if (keys.length && !u.echo) {
        delete c.s.cd[c.rng.pick(keys)];
        c.emit({ t: 'text', uid: 'p', text: '시간이 되감긴다', tone: 'good' });
      }
    },
  }),
  // 미고 봉합사
  ess({
    id: 'ess-migo-stitcher-scalpel',
    name: '전기 메스',
    icon: 'gi:scalpel-strike',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'debuff'],
    vals: { dmg: [9, 12], vuln: 1 },
    desc: '{D:dmg} 비전 피해, 취약 {vuln}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
  ess({
    id: 'ess-migo-stitcher-suture',
    name: '봉합',
    icon: 'gi:sewing-needle',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['heal', 'barrier'],
    vals: { heal: [10, 14], barrier: [6, 9] },
    desc: '체력 {heal} 회복, 보호막 {barrier}',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      c.apply(c.p, 'barrier', Math.floor(u.v('barrier') * u.power), c.p);
    },
  }),
  // 외신의 시종
  ess({
    id: 'ess-outer-servitor-dance',
    name: '혼돈의 춤',
    icon: 'gi:vertical-flip',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 1 },
    desc: '모든 적의 전열과 후열을 뒤바꾸고 약화 {weak}',
    run: (c, u) => {
      flipRows(c);
      for (const e of c.alive) c.apply(e, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-outer-servitor-engulf',
    name: '늘어나 삼키기',
    icon: 'gi:gooey-daemon',
    rarity: 'uncommon',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [16, 20], heal: [4, 6] },
    desc: '{D:dmg} 공허 피해, 체력 {heal} 회복',
    run: (c, u, t) => {
      hit(c, u, t);
      c.heal(c.p, u.v('heal'));
    },
  }),
  // 얼굴 없는 사제
  ess({
    id: 'ess-faceless-priest-flame',
    name: '검은 불꽃',
    icon: 'gi:alien-fire',
    rarity: 'uncommon',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'fire',
    tags: ['attack', 'burn'],
    vals: { dmg: [8, 11], burn: 3 },
    desc: '{D:dmg} 화염 피해, 화상 {burn}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'burn', u.v('burn'), c.p);
    },
  }),
  ess({
    id: 'ess-faceless-priest-unmask',
    name: '얼굴을 보여준다',
    icon: 'gi:hooded-figure',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['debuff'],
    vals: { weak: 1, vuln: [1, 2] },
    desc: '모든 적 약화 {weak}, 취약 {vuln}',
    run: (c, u) => {
      for (const e of c.alive) {
        c.apply(e, 'weak', u.v('weak'), c.p);
        c.apply(e, 'vuln', u.v('vuln'), c.p);
      }
    },
  }),
  // 우주에서 온 색
  ess({
    id: 'ess-star-colour-drain',
    name: '생기 흡수',
    icon: 'gi:rainbow-star',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack', 'heal'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 공허 피해. 입힌 피해의 절반만큼 체력 회복',
    run: (c, u, t) => {
      const n = dealt(hit(c, u, t));
      if (n > 1) c.heal(c.p, Math.floor(n / 2));
    },
  }),
  ess({
    id: 'ess-star-colour-taint',
    name: '색채 오염',
    icon: 'gi:acid-blob',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { corrode: [2, 3] },
    desc: '부식 {corrode} (대상이 받는 공격 피해 +{corrode}, 전투 내내)',
    run: (c, u, t) => void (t && c.apply(t, 'corrode', u.v('corrode'), c.p)),
  }),
  // 비야키
  ess({
    id: 'ess-byakhee-dive',
    name: '급강하',
    icon: 'gi:evil-bat',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'pierce',
    tags: ['attack'],
    vals: { dmg: [13, 17] },
    desc: '{D:dmg} 관통 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-byakhee-soar',
    name: '성간 비행',
    icon: 'gi:bat-wing',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'self',
    target: 'self',
    tags: ['block'],
    vals: { blk: [8, 11] },
    desc: '방어도 {B:blk}, 회피 1',
    run: (c, u) => {
      guard(c, u);
      c.apply(c.p, 'evasive', 1, c.p);
    },
  }),
  // 차원 방랑자
  ess({
    id: 'ess-dim-shambler-pull',
    name: '저편으로',
    icon: 'gi:teleport',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'pull'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 참격 피해. 대상의 열을 바꾼다 (전열↔후열, 옮길 열에 자리가 있을 때)',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.moveRow(t, t.row === 0 ? 1 : 0);
    },
  }),
  ess({
    id: 'ess-dim-shambler-fold',
    name: '공간 접기',
    icon: 'gi:wrapping-star',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['debuff'],
    vals: { vuln: [2, 3], weak: 1 },
    desc: '취약 {vuln}, 약화 {weak}',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'vuln', u.v('vuln'), c.p);
      c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  // 날아다니는 폴립
  ess({
    id: 'ess-flying-polyp-gale',
    name: '빨아들이는 바람',
    icon: 'gi:whirlwind',
    rarity: 'uncommon',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    type: 'blunt',
    tags: ['attack', 'aoe'],
    vals: { dmg: [6, 8] },
    desc: '모든 적의 방어도를 흩어 버린 뒤 적 전체에 {D:dmg} 타격 피해',
    run: (c, u, t) => {
      for (const e of c.alive) e.block = 0;
      hit(c, u, t);
    },
  }),
  ess({
    id: 'ess-flying-polyp-vortex',
    name: '진공 소용돌이',
    icon: 'gi:vortex',
    rarity: 'uncommon',
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
  // 시간을 갉는 것
  ess({
    id: 'ess-time-gnawer-gnaw',
    name: '시간을 갉는다',
    icon: 'gi:worm-mouth',
    rarity: 'uncommon',
    cost: 2,
    cd: 3,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'energy'],
    vals: { dmg: [16, 20], ap: 1 },
    desc: '{D:dmg} 참격 피해. 이 기술로 쓰러뜨리면 다음 턴 행동력 +{ap}',
    run: (c, u, t) => {
      const ds = hit(c, u, t);
      if (!u.echo && killed(ds)) c.apply(c.p, 'energized', u.v('ap'), c.p);
    },
  }),
  ess({
    id: 'ess-time-gnawer-burn',
    name: '삼킨 시간을 태운다',
    icon: 'gi:empty-hourglass',
    rarity: 'uncommon',
    cost: 0,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal'],
    vals: { heal: [12, 16], ap: 1 },
    desc: '체력 {heal} 회복. 다음 턴 행동력 -{ap}',
    run: (c, u) => {
      c.heal(c.p, u.v('heal'));
      // 결계로 막을 수 없는 대가 (스스로 태운 시간)
      if (!u.echo) setSt(c, c.p, TIME_DEBT, (c.p.st[TIME_DEBT] ?? 0) + u.v('ap'));
    },
  }),
  // 별자리를 잇는 자
  ess({
    id: 'ess-star-weaver-thread',
    name: '별의 실',
    icon: 'gi:sewing-string',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack'],
    vals: { dmg: [10, 13] },
    desc: '{D:dmg} 비전 피해. 실을 따라 무작위 다른 적에게도 그 절반',
    run: (c, u, t) => {
      hit(c, u, t);
      const rest = c.alive.filter((e) => e !== t);
      if (rest.length && !c.over) hit(c, u, c.rng.pick(rest), { dmg: Math.floor(u.v('dmg') / 2), mode: 'single' });
    },
  }),
  ess({
    id: 'ess-star-weaver-ray',
    name: '별자리 광선',
    icon: 'gi:star-formation',
    rarity: 'uncommon',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'arcane',
    tags: ['attack', 'aoe'],
    vals: { dmg: [6, 8], poise: 1 },
    desc: '적 전체에 {D:dmg} 비전 피해. 적이 셋 이상이면 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t, { poise: c.alive.length >= 3 ? u.v('poise') : 0 }),
  }),
  // 기어오는 혼돈의 화신
  ess({
    id: 'ess-chaos-avatar-echo',
    name: '메아리',
    icon: 'gi:double-face-mask',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [8, 11], per: [4, 5] },
    desc: '{D:dmg} 공허 피해. 이번 턴 앞서 쓴 스킬 하나당 +{per}',
    run: (c, u, t) => void hit(c, u, t, { dmg: u.v('dmg') + Math.floor(u.v('per') * combo(c) * u.power) }),
  }),
  ess({
    id: 'ess-chaos-avatar-masks',
    name: '가면 벗기기',
    icon: 'gi:cracked-mask',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'single',
    tags: ['attack', 'poise'],
    vals: { dmg: [5, 7], poise: [2, 3] },
    desc: '대상의 약점과 급소를 모두 드러내고 급소 속성으로 {D:dmg} 피해 (급소가 없으면 약점 하나, 그것도 없으면 타격). 버팀 추가 -{poise}',
    run: (c, u, t) => {
      if (!t) return;
      c.expose(t);
      hit(c, u, t, { type: weakPointOf(c.run, t.def) ?? t.weak[0] });
    },
  }),
  // 천 마리 새끼의 어머니
  ess({
    id: 'ess-thousand-mother-bless',
    name: '풍요의 축복',
    icon: 'gi:goat',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['heal'],
    vals: { regen: [6, 8] },
    desc: '재생 {regen} (턴 종료마다 회복하고 1씩 줄어든다)',
    run: (c, u) => void c.apply(c.p, 'regen', u.v('regen'), c.p),
  }),
  ess({
    id: 'ess-thousand-mother-horde',
    name: '천 마리의 새끼',
    icon: 'gi:evil-bud',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [6, 7], hits: 4 },
    desc: '무작위 적에게 {D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 이스의 방랑자
  ess({
    id: 'ess-yith-wanderer-gun',
    name: '번개 총',
    icon: 'gi:lightning-arc',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'ranged',
    target: 'single',
    type: 'arcane',
    tags: ['attack', 'multi'],
    vals: { dmg: [7, 9], hits: 2 },
    desc: '{D:dmg} 비전 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-yith-wanderer-swap',
    name: '정신 교환',
    icon: 'gi:body-swapping',
    rarity: 'rare',
    cost: 1,
    cd: 4,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'sanity'],
    vals: { stun: 1, san: [6, 9] },
    desc: '기절 {stun}, 정신력 +{san}',
    run: (c, u, t) => {
      if (t) c.apply(t, 'stun', u.v('stun'), c.p);
      c.gainSanity(u.v('san'));
    },
  }),
  // 문 너머의 존재
  ess({
    id: 'ess-beyond-gate-rays',
    name: '구체의 빛',
    icon: 'gi:triorb',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'arcane',
    tags: ['attack', 'multi'],
    vals: { dmg: [6, 8], hits: 4 },
    desc: '무작위 적에게 {D:dmg} 비전 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-beyond-gate-crush',
    name: '차원 압착',
    icon: 'gi:implosion',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'single',
    type: 'void',
    tags: ['attack'],
    vals: { dmg: [26, 32] },
    desc: '방어도를 무시하고 {D:dmg} 공허 피해',
    run: (c, u, t) => void hit(c, u, t, { ignoreBlock: true }),
  }),
  ess({
    id: 'ess-beyond-gate-key',
    name: '열쇠',
    icon: 'gi:star-key',
    rarity: 'rare',
    cost: 0,
    cd: 4,
    range: 'self',
    target: 'self',
    tags: ['energy', 'sanity'],
    vals: { ap: 1, san: 6 },
    desc: '행동력 +{ap}, 정신력 -{san}',
    run: (c, u) => {
      c.loseSanity(u.v('san'));
      if (!u.echo) c.s.ap += u.v('ap');
    },
  }),
  // 검은 파라오
  ess({
    id: 'ess-black-pharaoh-curse',
    name: '왕의 저주',
    icon: 'gi:egyptian-profile',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'doom'],
    vals: { doom: [12, 16] },
    desc: '파멸 {doom}. 대상의 체력이 파멸 이하면 즉시 쓰러진다',
    run: (c, u, t) => {
      if (!t) return;
      c.apply(t, 'doom', u.v('doom'), c.p);
      if (!t.dead && t.hp <= (t.st.doom ?? 0)) {
        c.emit({ t: 'text', uid: t.uid, text: '파멸', tone: 'eldritch' });
        c.kill(t);
      }
    },
  }),
  ess({
    id: 'ess-black-pharaoh-scarabs',
    name: '풍뎅이 떼',
    icon: 'gi:scarab-beetle',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'slash',
    tags: ['attack', 'multi', 'bleed'],
    vals: { dmg: [3, 4], hits: 5 },
    desc: '무작위 적에게 {D:dmg} 참격 피해 {hits}회. 체력 피해를 줄 때마다 출혈 1',
    run: (c, u, t) => {
      for (const d of hit(c, u, t)) if (d.hpLoss > 0 && isEnemy(d.tgt) && !d.tgt.dead) c.apply(d.tgt, 'bleed', 1, c.p);
    },
  }),
  ess({
    id: 'ess-black-pharaoh-pyramid',
    name: '어둠의 피라미드',
    icon: 'gi:egyptian-pyramids',
    rarity: 'rare',
    cost: 2,
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe'],
    vals: { dmg: [16, 20] },
    desc: '적 전체에 {D:dmg} 공허 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 별의 자손 군주
  ess({
    id: 'ess-starspawn-lord-sweep',
    name: '촉수 휩쓸기',
    icon: 'gi:kraken-tentacle',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'all',
    type: 'blunt',
    tags: ['attack', 'aoe'],
    vals: { dmg: [9, 12] },
    desc: '적 전체에 {D:dmg} 타격 피해',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-starspawn-lord-flip',
    name: '대지를 뒤집는다',
    icon: 'gi:earth-crack',
    rarity: 'rare',
    cost: 1,
    cd: 3,
    range: 'ranged',
    target: 'all',
    tags: ['block'],
    vals: { blk: [10, 14] },
    desc: '모든 적의 전열과 후열을 뒤바꾸고 방어도 {B:blk}',
    run: (c, u) => {
      flipRows(c);
      guard(c, u);
    },
  }),
  ess({
    id: 'ess-starspawn-lord-fall',
    name: '별이 떨어진다',
    icon: 'gi:falling-star',
    rarity: 'rare',
    cost: 3,
    cd: 4,
    range: 'ranged',
    target: 'single',
    type: 'blunt',
    tags: ['attack'],
    vals: { dmg: [40, 50], poise: 2 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  // 검은 별 (계층정수)
  ess({
    id: 'ess-black-star-beam',
    name: '검은 광선',
    icon: 'gi:dripping-star',
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
  ess({
    id: 'ess-black-star-collapse',
    name: '중력 붕괴',
    icon: 'gi:gravitation',
    rarity: 'rare',
    cost: 3,
    cd: 4,
    range: 'ranged',
    target: 'all',
    type: 'void',
    tags: ['attack', 'aoe'],
    vals: { dmg: [24, 30], poise: 1 },
    desc: '적 전체에 {D:dmg} 공허 피해, 버팀 추가 -{poise}',
    run: (c, u, t) => void hit(c, u, t),
  }),
  ess({
    id: 'ess-black-star-judgment',
    name: '별의 심판',
    icon: 'gi:cursed-star',
    rarity: 'rare',
    cost: 2,
    cd: 5,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'doom'],
    vals: { doom: [30, 40] },
    desc: '파멸 {doom} (대상의 턴이 끝날 때 체력이 파멸 이하면 즉사)',
    run: (c, u, t) => void (t && c.apply(t, 'doom', u.v('doom'), c.p)),
  }),
  // 별 사이를 걷는 자
  ess({
    id: 'ess-star-walker-claw',
    name: '얼어붙은 손톱',
    icon: 'gi:frozen-body',
    rarity: 'rare',
    cost: 1,
    cd: 1,
    range: 'melee',
    target: 'single',
    type: 'slash',
    tags: ['attack', 'debuff'],
    vals: { dmg: [11, 14], weak: 1 },
    desc: '{D:dmg} 참격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-star-walker-pounce',
    name: '하늘에서 덮친다',
    icon: 'gi:shadow-follower',
    rarity: 'rare',
    cost: 2,
    cd: 3,
    range: 'ranged',
    target: 'single',
    type: 'slash',
    tags: ['attack'],
    vals: { dmg: [20, 26] },
    desc: '{D:dmg} 참격 피해. 대상이 후열에 있으면 피해 1.5배',
    run: (c, u, t) => void hit(c, u, t, { dmg: Math.floor(u.v('dmg') * (t && t.row === 1 ? 1.5 : 1)) }),
  }),
  // 사냥하는 공포
  ess({
    id: 'ess-hunting-horror-coil',
    name: '휘감기',
    icon: 'gi:dragon-spiral',
    rarity: 'rare',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'debuff'],
    vals: { dmg: [12, 15], weak: 2 },
    desc: '{D:dmg} 타격 피해, 약화 {weak}',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead) c.apply(t, 'weak', u.v('weak'), c.p);
    },
  }),
  ess({
    id: 'ess-hunting-horror-swoop',
    name: '급습',
    icon: 'gi:evil-wings',
    rarity: 'rare',
    cost: 2,
    cd: 2,
    range: 'ranged',
    target: 'random',
    type: 'slash',
    tags: ['attack', 'multi'],
    vals: { dmg: [7, 9], hits: 3 },
    desc: '무작위 적에게 {D:dmg} 참격 피해 {hits}회',
    run: (c, u, t) => void hit(c, u, t),
  }),
]);

// ───────────── 정수 정의 ─────────────
// 수호자·계층군주와 균열 수호자의 정수는 언제나 수호자 정수(s.n = 2) — 패시브 설명에는 2배 한 실제 수치를 적는다.

reg.essences([
  {
    id: 'star-spawn',
    name: '별의 자손의 정수',
    icon: 'gi:squid',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 10, str: 2 },
    passive: {
      name: '별의 육신',
      desc: '받는 공격 피해 -2',
      hooks: {
        modDamageIn(c, s, d) {
          if (d.attack && d.tgt === c.p) d.add -= 2 * s.n;
        },
      },
    },
    actives: ['ess-star-spawn-claw', 'ess-star-spawn-dream'],
    colors: ['심해 청록', '꿈의 보라'],
  },
  {
    id: 'formless-piper',
    name: '무형의 피리꾼의 정수',
    icon: 'gi:pan-flute',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 6, will: 2, maxSanity: 5 },
    passive: {
      name: '끝없는 피리 소리',
      desc: '내 턴이 끝날 때 무작위 적에게 공허 피해 3',
      hooks: {
        onTurnEnd(c, s) {
          if (!c.alive.length) return;
          const t = c.rng.pick(c.alive);
          c.damage({ src: c.p, tgt: t, base: 3 * s.n, type: 'void', tags: ['essence'] });
        },
      },
    },
    actives: ['ess-formless-piper-discord', 'ess-formless-piper-frenzy'],
    colors: ['공허 자주', '광기 분홍'],
  },
  {
    id: 'dark-young',
    name: '검은 새끼의 정수',
    icon: 'gi:evil-tree',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 12, str: 1 },
    passive: {
      name: '검은 수액',
      desc: '내 턴이 끝날 때 체력 2 회복',
      hooks: {
        onTurnEnd(c, s) {
          c.heal(c.p, 2 * s.n);
        },
      },
    },
    actives: ['ess-dark-young-lash', 'ess-dark-young-trample'],
    colors: ['이끼 검정', '수액 초록'],
  },
  {
    id: 'time-warden',
    name: '시간의 파수꾼의 정수',
    icon: 'gi:sands-of-time',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 8, dex: 1, will: 2 },
    passive: {
      name: '시간 감각',
      desc: '전투 첫 턴 행동력 +1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'energized', s.n, c.p);
        },
      },
    },
    actives: ['ess-time-warden-sentence', 'ess-time-warden-rewind'],
    colors: ['모래 금빛', '멈춘 회색'],
  },
  {
    id: 'migo-stitcher',
    name: '미고 봉합사의 정수',
    icon: 'gi:alien-bug',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 8, dex: 2, will: 1 },
    passive: {
      name: '외과적 정밀함',
      desc: '약점을 찌르는 공격 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && d.attack && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type)) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-migo-stitcher-scalpel', 'ess-migo-stitcher-suture'],
    colors: ['균사 분홍', '금속 은빛'],
  },
  {
    id: 'outer-servitor',
    name: '외신의 시종의 정수',
    icon: 'gi:gooey-daemon',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 10, will: 2 },
    passive: {
      name: '혼돈의 리듬',
      desc: '약점이 아닌 속성으로 공격할 때 피해 +2',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && d.attack && isEnemy(d.tgt) && d.type !== 'true' && !d.tgt.weak.includes(d.type)) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-outer-servitor-dance', 'ess-outer-servitor-engulf'],
    colors: ['외우주 녹색', '점액 황색'],
  },
  {
    id: 'faceless-priest',
    name: '얼굴 없는 사제의 정수',
    icon: 'gi:hooded-figure',
    grade: 4,
    stats: { maxHp: 8, will: 2, maxSanity: 3 },
    passive: {
      name: '얼굴 없는 신앙',
      desc: '전투 시작 시 결계 1',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'ward', s.n, c.p);
        },
      },
    },
    actives: ['ess-faceless-priest-flame', 'ess-faceless-priest-unmask'],
    colors: ['재의 회색', '흑염'],
  },
  {
    id: 'star-colour',
    name: '우주에서 온 색의 정수',
    icon: 'gi:rainbow-star',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 6, maxSanity: 5, will: 1 },
    passive: {
      name: '색채 흡수',
      desc: '공허 피해를 주면 그 피해의 15%만큼 체력 회복',
      hooks: {
        onDamageDealt(c, s, d) {
          if (d.src === c.p && d.type === 'void' && d.hpLoss > 0) c.heal(c.p, Math.max(1, Math.floor(d.hpLoss * 0.15 * s.n)));
        },
      },
    },
    actives: ['ess-star-colour-drain', 'ess-star-colour-taint'],
    colors: ['형언할 수 없는 색', '병든 무지개'],
  },
  {
    id: 'byakhee',
    name: '비야키의 정수',
    icon: 'gi:evil-bat',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 7, dex: 2, str: 1 },
    passive: {
      name: '성간의 날개',
      desc: '원거리 공격 피해 +2',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.attack && !d.melee && d.src === c.p) d.add += 2 * s.n;
        },
      },
    },
    actives: ['ess-byakhee-dive', 'ess-byakhee-soar'],
    colors: ['밤하늘 남색', '황금 깃'],
  },
  {
    id: 'dim-shambler',
    name: '차원 방랑자의 정수',
    icon: 'gi:teleport',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 10, dex: 1, will: 1 },
    passive: {
      name: '틈새 걸음',
      desc: '후열에 있는 적을 공격하면 피해 +3',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && d.attack && isEnemy(d.tgt) && d.tgt.row === 1) d.add += 3 * s.n;
        },
      },
    },
    actives: ['ess-dim-shambler-pull', 'ess-dim-shambler-fold'],
    colors: ['틈새 회색', '차원 남빛'],
  },
  {
    id: 'flying-polyp',
    name: '날아다니는 폴립의 정수',
    icon: 'gi:jellyfish',
    grade: 3,
    eldritch: true,
    stats: { maxHp: 12, dex: 2 },
    passive: {
      name: '보이지 않는 몸',
      desc: '1·4·7…번째 턴 시작 시 회피 1',
      hooks: {
        turnNote: (c, s) => cycleNote(c, { n: 3, on: 1, icon: 'gi:jellyfish', title: '보이지 않는 몸', what: `1·4·7…번째 턴이 시작될 때 회피 ${s.n}` }),
        onTurnStart(c, s) {
          if (c.s.turn % 3 === 1) c.apply(c.p, 'evasive', s.n, c.p);
        },
      },
    },
    actives: ['ess-flying-polyp-gale', 'ess-flying-polyp-vortex'],
    colors: ['투명한 잿빛', '폭풍 청색'],
  },
  {
    id: 'time-gnawer',
    name: '시간을 갉는 것의 정수',
    icon: 'gi:worm-mouth',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 9, dex: 2 },
    passive: {
      name: '갉아 둔 시간',
      desc: '전투에서 처음 적을 붕괴시키면 다음 턴 행동력 +1',
      hooks: {
        onBreak(c, s) {
          if (c.s.vars['ess-gnawer'] === 1) return;
          c.s.vars['ess-gnawer'] = 1;
          c.apply(c.p, 'energized', s.n, c.p);
        },
      },
    },
    actives: ['ess-time-gnawer-gnaw', 'ess-time-gnawer-burn'],
    colors: ['좀먹은 금빛', '타는 모래'],
  },
  {
    id: 'star-weaver',
    name: '별자리를 잇는 자의 정수',
    icon: 'gi:star-formation',
    grade: 4,
    eldritch: true,
    stats: { maxHp: 7, will: 2, maxSanity: 4 },
    passive: {
      name: '이어진 별',
      desc: '적을 쓰러뜨리고 남은 피해가 다른 무작위 적에게 넘어간다 (최대 10)',
      hooks: {
        onDamageDealt(c, s, d) {
          // 쓰러뜨리는 순간(체력이 아직 음수일 때) 넘친 만큼. 넘어간 피해가 다시 넘어가지는 않는다
          if (d.src !== c.p || !isEnemy(d.tgt) || d.tgt.hp >= 0 || d.tags.includes('a4-carry')) return;
          const over = Math.min(10 * s.n, -d.tgt.hp);
          const rest = c.alive.filter((e) => e !== d.tgt && e.hp > 0);
          if (over <= 0 || !rest.length) return;
          c.damage({ src: c.p, tgt: c.rng.pick(rest), base: over, type: 'true', tags: ['a4-carry'] });
        },
      },
    },
    actives: ['ess-star-weaver-thread', 'ess-star-weaver-ray'],
    colors: ['별빛 은사', '성좌 남빛'],
  },
  {
    id: 'chaos-avatar',
    name: '기어오는 혼돈의 정수',
    icon: 'gi:double-face-mask',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, str: 2, will: 2 },
    passive: {
      name: '거울 가면',
      desc: '공격을 받으면 그 피해(막은 것 포함)의 25%를 공격자에게 공허 피해로 되돌려준다',
      hooks: {
        onDamageTaken(c, s, d) {
          if (d.tgt !== c.p || !d.attack || !isEnemy(d.src) || d.src.dead || d.amount <= 0) return;
          const n = Math.floor(d.amount * 0.25 * s.n);
          if (n > 0) c.damage({ src: c.p, tgt: d.src, base: n, type: 'void', tags: ['reflect'] });
        },
      },
    },
    actives: ['ess-chaos-avatar-echo', 'ess-chaos-avatar-masks'],
    colors: ['천 개의 얼굴', '거울 은빛'],
  },
  {
    id: 'thousand-mother',
    name: '천 마리 새끼의 어머니의 정수',
    icon: 'gi:goat',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 16, will: 1, str: 1 },
    passive: {
      name: '천 마리의 새끼',
      desc: '적을 처치할 때마다 체력 4 회복',
      hooks: {
        onKill(c, s) {
          c.heal(c.p, 4 * s.n);
        },
      },
    },
    actives: ['ess-thousand-mother-bless', 'ess-thousand-mother-horde'],
    colors: ['흑염소 검정', '풍요의 녹색'],
  },
  {
    id: 'yith-wanderer',
    name: '이스의 방랑자의 정수',
    icon: 'gi:spiral-shell',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 12, will: 3, dex: 1 },
    passive: {
      name: '시간 표류',
      desc: '내 턴 시작 시 재사용 대기 중인 스킬 하나의 대기 -1 (전투당 1회 스킬 제외)',
      hooks: {
        onTurnStart(c, s) {
          for (let i = 0; i < s.n; i++) {
            const keys = Object.keys(c.s.cd).filter((k) => refreshable(c, k));
            if (!keys.length) return;
            const k = c.rng.pick(keys);
            c.s.cd[k] -= 1;
            if (c.s.cd[k] <= 0) delete c.s.cd[k];
          }
        },
      },
    },
    actives: ['ess-yith-wanderer-gun', 'ess-yith-wanderer-swap'],
    colors: ['원뿔 갈색', '번개 청색'],
  },
  {
    id: 'beyond-gate',
    name: '문 너머의 존재의 정수',
    icon: 'gi:star-gate',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, will: 2, maxSanity: 6 },
    passive: {
      name: '구체의 가호',
      desc: '전투 시작 시 보호막 16',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'barrier', 8 * s.n, c.p);
        },
      },
    },
    actives: ['ess-beyond-gate-rays', 'ess-beyond-gate-crush', 'ess-beyond-gate-key'],
    colors: ['무지갯빛 구체', '차원의 남색', '열쇠 금빛'],
  },
  {
    id: 'black-pharaoh',
    name: '검은 파라오의 정수',
    icon: 'gi:egyptian-profile',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 12, str: 2, will: 2 },
    passive: {
      name: '왕의 저주',
      desc: '전투 시작 시 모든 적에게 파멸 10. 내가 거는 파멸 +4',
      hooks: {
        onCombatStart(c, s) {
          for (const e of c.alive) c.apply(e, 'doom', 5 * s.n, c.p);
        },
        modApply(_c, s, target, id, n) {
          return id === 'doom' && isEnemy(target) ? n + 2 * s.n : n;
        },
      },
    },
    actives: ['ess-black-pharaoh-curse', 'ess-black-pharaoh-scarabs', 'ess-black-pharaoh-pyramid'],
    colors: ['황금 가면', '풍뎅이 흑청', '피라미드 그림자'],
  },
  {
    id: 'starspawn-lord',
    name: '별의 자손 군주의 정수',
    icon: 'gi:giant-squid',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 18, str: 2 },
    passive: {
      name: '별의 정렬',
      desc: '심연의 조수 1단계마다 공격 피해 +2 (최대 +8)',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && d.attack) d.add += Math.min(4, c.run.floor?.tide ?? 0) * s.n;
        },
      },
    },
    actives: ['ess-starspawn-lord-sweep', 'ess-starspawn-lord-flip', 'ess-starspawn-lord-fall'],
    colors: ['심해 청록', '뒤집힌 대지', '떨어지는 별빛'],
  },
  {
    id: 'black-star',
    name: '검은 별의 계층정수',
    icon: 'gi:dripping-star',
    grade: 1,
    lord: true,
    eldritch: true,
    stats: { maxHp: 20, str: 3, will: 3 },
    passive: {
      name: '검은 별의 인력',
      desc: '내 턴 시작 시 모든 적의 방어도가 절반이 된다. 전투 시작 시 의식 2 (턴이 끝날 때마다 힘 +2)',
      hooks: {
        onCombatStart(c, s) {
          c.apply(c.p, 'ritual', s.n, c.p);
        },
        onTurnStart(c) {
          for (const e of c.alive) if (e.block > 1) e.block = Math.floor(e.block / 2);
        },
      },
    },
    actives: ['ess-black-star-beam', 'ess-black-star-collapse', 'ess-black-star-judgment'],
    colors: ['검은 빛', '사건의 지평선', '심판의 별'],
  },
  {
    id: 'star-walker',
    name: '별 사이를 걷는 자의 정수',
    icon: 'gi:shadow-follower',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 12, str: 2, dex: 2 },
    passive: {
      name: '끝없는 추적',
      desc: '내 턴이 끝날 때 힘 +1 (전투마다 최대 +4)',
      hooks: {
        onTurnEnd(c, s) {
          const n = c.s.vars.a4walk ?? 0;
          if (n >= 4 * s.n) return;
          c.s.vars.a4walk = n + 1;
          c.apply(c.p, 'str', 1, c.p);
        },
      },
    },
    actives: ['ess-star-walker-claw', 'ess-star-walker-pounce'],
    colors: ['별바람 은색', '얼음 남색'],
  },
  {
    id: 'hunting-horror',
    name: '사냥하는 공포의 정수',
    icon: 'gi:dragon-spiral',
    grade: 2,
    eldritch: true,
    stats: { maxHp: 14, dex: 2, str: 1 },
    passive: {
      name: '밤의 사냥꾼',
      desc: '등불이 50 미만이면 공격 피해 +6, 50 이상이면 내 턴 시작 시 방어도 8',
      hooks: {
        modDamageOut(c, s, d) {
          if (d.src === c.p && d.attack && c.run.light < 50) d.add += 3 * s.n;
        },
        onTurnStart(c, s) {
          if (c.run.light >= 50) c.gainBlock(c.p, 4 * s.n);
        },
      },
    },
    actives: ['ess-hunting-horror-coil', 'ess-hunting-horror-swoop'],
    colors: ['밤의 비늘', '핏빛 날개'],
  },
]);
