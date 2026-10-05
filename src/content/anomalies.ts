import { reg } from '../engine/registry';
import { isEnemy } from '../engine/combat';

/** 균열 규칙 / 전장 이상 현상 */
reg.anomalies([
  {
    id: 'rule-inverted',
    name: '회복 반전',
    icon: 'gi:cycle',
    desc: '내가 받는 회복이 모두 피해로 바뀐다',
    hooks: { modHeal: (_c, _s, n) => -n },
  },
  {
    id: 'rule-revive',
    name: '망자의 귀환',
    icon: 'gi:raise-zombie',
    desc: '적은 처음 쓰러질 때 한 번, 체력 50%로 다시 일어선다 (하수인 제외)',
    hooks: {
      // 엔진이 처치 보상(처치 효과·장의사의 동전 등)보다 먼저 부른다 → 다시 일어선 적은 마지막에 쓰러질 때 한 번만 보상
      onDeath(c, s) {
        const victim = s.unit;
        if (!isEnemy(victim) || victim.mem.revived || victim.minion || victim.fled) return;
        victim.mem.revived = 1;
        victim.dead = false;
        victim.hp = Math.ceil(victim.maxHp / 2);
        c.emit({ t: 'spawn', uid: victim.uid });
        c.emit({ t: 'text', uid: victim.uid, text: '다시 일어선다', tone: 'eldritch' });
        c.planIntent(victim);
      },
    },
  },
  {
    id: 'rule-tax',
    name: '대가의 법칙',
    icon: 'gi:scales',
    desc: '기본기 외 스킬 비용 +1. 대신 행동력 +1',
    hooks: {
      modCost: (_c, _s, def, cost) => (def.tags.includes('basic') ? cost : cost + 1),
      onTurnStart(c) {
        c.s.ap += 1;
      },
    },
  },
  {
    id: 'rule-doom',
    name: '사망 시계',
    icon: 'gi:sands-of-time',
    desc: '8턴이 지나면 매 턴 최대 체력의 15%를 잃는다',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn > 8) {
          c.emit({ t: 'text', uid: 'p', text: '시계가 멈추지 않는다', tone: 'bad' });
          c.loseHp(c.p, Math.ceil(c.p.maxHp * 0.15), 'doom');
        }
      },
    },
  },
  {
    id: 'rule-fog',
    name: '짙은 안개',
    icon: 'gi:fog',
    desc: '내 원거리 공격 피해 -40%, 근접 공격 피해 +20%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (!d.attack || d.src !== _c.p) return;
        d.mult *= d.melee ? 1.2 : 0.6;
      },
    },
  },
  {
    id: 'rule-frenzy',
    name: '광란의 장',
    icon: 'gi:enrage',
    desc: '나와 적 모두 공격 피해 +30%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack) d.mult *= 1.3;
      },
    },
  },
]);
