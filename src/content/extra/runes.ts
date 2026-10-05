import { reg } from '../../engine/registry';
import { isEnemy, lvlVal } from '../../engine/combat';
import type { SkillDef } from '../../engine/types';

const isAttack = (s: SkillDef) => s.tags.includes('attack');
const notBasic = (s: SkillDef) => !s.tags.includes('basic');

/** extra 각인 */
reg.runes([
  {
    id: 'x-combo-rune',
    name: '연계 각인',
    icon: 'gi:spinning-blades',
    rarity: 'uncommon',
    desc: '이번 턴 앞서 쓴 스킬 1개당 위력 +15%',
    fits: notBasic,
    hooks: {
      beforeSkill(c, _s, u) {
        u.power *= 1 + 0.15 * c.s.used;
      },
    },
  },
  {
    id: 'x-hunt-rune',
    name: '사냥 각인',
    icon: 'gi:bestial-fangs',
    rarity: 'uncommon',
    desc: '이 스킬로 적을 처치하면 행동력 +1 (사용당 1회)',
    fits: isAttack,
    hooks: {
      onDamageDealt(c, _s, d) {
        if (!isEnemy(d.tgt) || d.tgt.hp > 0 || d.hpLoss <= 0 || c.s.phase !== 'player') return;
        // 이번 사용(usedTotal 기준)에서 한 번만
        const key = c.s.usedTotal + 1;
        if (c.s.vars.xHuntRune === key) return;
        c.s.vars.xHuntRune = key;
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '사냥 — 행동력 +1', tone: 'good' });
      },
    },
  },
  {
    id: 'x-venom-rune',
    name: '독 각인',
    icon: 'gi:poison',
    rarity: 'common',
    desc: '체력 피해를 줄 때마다 독 2',
    fits: isAttack,
    hooks: {
      onDamageDealt(c, _s, d) {
        if (d.hpLoss > 0 && isEnemy(d.tgt) && d.tgt.hp > 0) c.apply(d.tgt, 'poison', 2, c.p);
      },
    },
  },
  {
    id: 'x-magazine-rune',
    name: '탄창 각인',
    icon: 'gi:machine-gun-magazine',
    rarity: 'common',
    desc: '사용 후 탄약 +1',
    fits: (s) => s.tags.includes('ammo') && notBasic(s),
    hooks: {
      afterSkill(c) {
        c.s.ammo = Math.min(c.s.maxAmmo, c.s.ammo + 1);
      },
    },
  },
  {
    id: 'x-blood-rune',
    name: '피의 각인',
    icon: 'gi:bleeding-eye',
    rarity: 'rare',
    desc: '행동력 비용 -1. 사용할 때 체력 3을 잃는다',
    costMod: -1,
    fits: (s) => {
      const cost = Array.isArray(s.cost) ? s.cost[0] : s.cost;
      return cost >= 1 && notBasic(s);
    },
    hooks: {
      beforeSkill(c, _s, u) {
        if (u.echo) return;
        const n = Math.min(3, c.p.hp - 1);
        if (n > 0) c.loseHp(c.p, n, 'blood-rune');
      },
    },
  },
  {
    id: 'x-resonance-rune',
    name: '공명 각인',
    icon: 'gi:double-ringed-orb',
    rarity: 'uncommon',
    desc: '사용 후 재사용 대기 중인 다른 스킬 하나의 대기 -1 (가장 긴 것)',
    fits: notBasic,
    hooks: {
      afterSkill(c, _s, u) {
        let best: string | null = null;
        let bestN = 0;
        for (const [uid, n] of Object.entries(c.s.cd)) {
          if (uid === u.owned.uid || n <= bestN) continue;
          const info = c.skillInfo(uid);
          if (!info || lvlVal(info.def.cd, info.owned.lvl) >= 99) continue;
          best = uid;
          bestN = n;
        }
        if (!best) return;
        c.s.cd[best] -= 1;
        if (c.s.cd[best] <= 0) delete c.s.cd[best];
      },
    },
  },
]);
