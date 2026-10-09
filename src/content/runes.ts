import { reg } from '../engine/registry';
import { isEnemy } from '../engine/combat';
import { weakPointKnown, weakPointOf } from '../engine/weakpoint';

const isAttack = (s: { tags: string[] }) => s.tags.includes('attack');

/** 각인: 스킬 하나에 1개 장착 */
reg.runes([
  {
    id: 'echo',
    name: '메아리 각인',
    icon: 'gi:echo-ripples',
    rarity: 'rare',
    desc: '스킬이 50% 위력으로 한 번 더 발동 (탄약이 바닥났으면 불발). 재사용 대기 +1. 행동력을 주거나 대기를 되돌리는 스킬에는 새길 수 없다',
    cdMod: 1,
    // 행동력·대기 되돌리기를 두 번 받으면 (피의 대가 +4 행동력 등) 다른 조각과 엮여 한 턴이 끝없이 길어진다
    fits: (s) => !s.tags.includes('basic') && !s.tags.includes('energy') && !s.tags.includes('refresh') && s.cd !== 99,
  },
  {
    id: 'leech',
    name: '흡혈 각인',
    icon: 'gi:vampire-dracula',
    rarity: 'uncommon',
    desc: '이 스킬로 준 체력 피해의 20%만큼 회복 (타격마다 최소 1)',
    fits: isAttack,
    hooks: {
      onDamageDealt(c, _s, d) {
        if (d.hpLoss > 0) c.heal(c.p, Math.max(1, Math.floor(d.hpLoss * 0.2)));
      },
    },
  },
  {
    id: 'splash',
    name: '파급 각인',
    icon: 'gi:water-splash',
    rarity: 'uncommon',
    desc: '주 대상에게 준 피해의 40%가 다른 모든 적에게 퍼진다',
    fits: (s) => isAttack(s) && s.target === 'single',
    hooks: {
      onDamageDealt(c, _s, d) {
        if (d.tags.includes('splash') || !d.skill || d.tgt !== d.skill.primary) return;
        const n = Math.floor((d.hpLoss + d.blocked) * 0.4);
        if (n <= 0) return;
        for (const e of c.alive) {
          if (e === d.tgt) continue;
          c.damage({ src: c.p, tgt: e, base: n, type: d.type, tags: ['splash'] });
        }
      },
    },
  },
  {
    id: 'haste',
    name: '가속 각인',
    icon: 'gi:running-shoe',
    rarity: 'uncommon',
    desc: '재사용 대기 -1 (1턴 아래로는 줄지 않는다)',
    cdMod: -1,
    fits: (s) => {
      const cd = Array.isArray(s.cd) ? s.cd[0] : s.cd;
      return cd >= 2 && cd < 99;
    },
  },
  {
    id: 'crush',
    name: '분쇄 각인',
    icon: 'gi:hammer-break',
    rarity: 'common',
    desc: '이 스킬의 타격마다 버팀 추가 -1',
    fits: isAttack,
    hooks: {
      modDamageOut(_c, _s, d) {
        d.poiseBonus += 1;
      },
    },
  },
  {
    id: 'bleed-rune',
    name: '출혈 각인',
    icon: 'gi:blood',
    rarity: 'common',
    desc: '체력 피해를 줄 때마다 출혈 2. 검술 계열',
    school: 'blade',
    fits: isAttack,
    hooks: {
      onDamageDealt(c, _s, d) {
        if (d.hpLoss > 0 && isEnemy(d.tgt) && !d.killed) c.apply(d.tgt, 'bleed', 2, c.p);
      },
    },
  },
  {
    id: 'burn-rune',
    name: '화염 각인',
    icon: 'gi:flame',
    rarity: 'common',
    desc: '타격마다 화상 1 (방어도에 막혀도). 연금 계열',
    school: 'alchemy',
    fits: isAttack,
    hooks: {
      onDamageDealt(c, _s, d) {
        if (isEnemy(d.tgt) && !d.killed) c.apply(d.tgt, 'burn', 1, c.p);
      },
    },
  },
  {
    id: 'mark-rune',
    name: '인장 각인',
    icon: 'gi:pentagram-rose',
    rarity: 'common',
    desc: '타격마다 인장 1 (인장 폭발 스킬에는 새길 수 없다). 비술 계열',
    school: 'occult',
    // 폭발 스킬은 폭발 피해만 주므로(인장을 다시 새기지 않는다) 새겨도 아무 일도 일어나지 않는다
    fits: (s) => isAttack(s) && !s.tags.includes('detonate'),
    hooks: {
      onDamageDealt(c, _s, d) {
        if (isEnemy(d.tgt) && !d.killed && !d.tags.includes('detonate')) c.apply(d.tgt, 'mark', 1, c.p);
      },
    },
  },
  {
    id: 'void-rune',
    name: '공허 각인',
    icon: 'gi:portal',
    rarity: 'rare',
    desc: '피해 속성이 공허로 바뀌고 통찰×2만큼 피해 증가. 사용 시 정신력 -2. 금기 계열',
    school: 'forbidden',
    fits: isAttack,
    hooks: {
      beforeSkill(c, _s, u) {
        u.type = 'void';
        c.loseSanity(2);
      },
      modDamageOut(c, _s, d) {
        d.add += 2 * c.p.insight;
      },
    },
  },
  {
    // 급소 (engine/weakpoint.ts — 2026-10, "약점을 알아도 어차피 가진 스킬로 때린다"): 밝힌 급소를 어떤 스킬로든 찌를 수 있게
    id: 'wp-rune',
    name: '급소 각인',
    icon: 'gi:convergence-target',
    rarity: 'uncommon',
    desc: '대상의 급소가 드러나 있으면 그 속성으로 친다 (드러나지 않았으면 그대로)',
    fits: isAttack,
    hooks: {
      modDamageOut(c, _s, d) {
        if (!d.attack || d.type === 'true' || !isEnemy(d.tgt) || !weakPointKnown(c.run, d.tgt.def)) return;
        const wp = weakPointOf(c.run, d.tgt.def);
        if (wp) d.type = wp;
      },
    },
  },
  {
    id: 'thrift',
    name: '절약 각인',
    icon: 'gi:receive-money',
    rarity: 'uncommon',
    desc: '행동력 비용 -1, 위력 -25%',
    costMod: -1,
    powerMult: 0.75,
    fits: (s) => {
      const cost = Array.isArray(s.cost) ? s.cost[0] : s.cost;
      return cost >= 1 && !s.tags.includes('basic');
    },
  },
  {
    id: 'ward-rune',
    name: '수호 각인',
    icon: 'gi:shield-echoes',
    rarity: 'common',
    desc: '사용 후 방어도 4. 결의 계열',
    school: 'resolve',
    hooks: {
      afterSkill(c) {
        c.gainBlock(c.p, 4);
      },
    },
  },
]);
