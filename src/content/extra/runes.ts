import { reg } from '../../engine/registry';
import { isEnemy, lvlVal } from '../../engine/combat';
import type { SkillDef } from '../../engine/types';
import { seized } from '../lib';

const isAttack = (s: SkillDef) => s.tags.includes('attack');
const notBasic = (s: SkillDef) => !s.tags.includes('basic');

/** extra 각인 */
reg.runes([
  {
    id: 'x-combo-rune',
    name: '연계 각인',
    icon: 'gi:spinning-blades',
    rarity: 'uncommon',
    desc: '이번 턴 앞서 쓴 스킬 1개당 위력 +15%. 검술 계열',
    school: 'blade',
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
      // 체력이 0이 된 순간이 아니라 처치가 확정된 뒤에 (망자의 귀환·다시 얼어붙는 시체처럼 다시 일어서는 적은 처치가 아니다)
      onKill(c) {
        if (c.s.phase !== 'player') return;
        // 이번 사용(usedTotal 기준)에서 한 번만
        const key = c.s.usedTotal + 1;
        if (c.s.vars.xHuntRune === key) return;
        c.s.vars.xHuntRune = key;
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '사냥 (행동력 +1)', tone: 'good' });
      },
    },
  },
  {
    id: 'x-venom-rune',
    name: '독 각인',
    icon: 'gi:poison',
    rarity: 'common',
    desc: '체력 피해를 줄 때마다 독 2. 연금 계열',
    school: 'alchemy',
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
    desc: '사용 후 탄약 +1. 사격 계열',
    school: 'firearm',
    // 계열 각인이라 총이 아닌 스킬에도 새긴다 (사격으로도 쳐서 틈을 거둔다 — content/gap.ts)
    fits: notBasic,
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
    desc: '행동력 비용 -1. 사용할 때 체력 3을 잃는다. 금기 계열',
    school: 'forbidden',
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
    desc: '사용 후 재사용 대기가 가장 긴 다른 스킬 하나의 대기 -1 (1턴 아래로는 줄지 않는다)',
    fits: notBasic,
    hooks: {
      afterSkill(c, _s, u) {
        // 대기 1인 스킬은 건드리지 않는다: 공명 각인 둘이 서로의 대기를 0으로 만들며 한 턴에 끝없이 쓰는 고리 방지
        // 표본으로 빼앗긴 기술(대기 99로 잠김)은 '가장 긴 대기'로 치지 않는다 (줄여 봐야 소용없고, 진짜 대기 중인 기술이 밀린다)
        let best: string | null = null;
        let bestN = 1;
        for (const [uid, n] of Object.entries(c.s.cd)) {
          if (uid === u.owned.uid || n <= bestN || seized(c, uid)) continue;
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
