import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { hasTag } from './enemies';

/** 2층 전용 전장 규칙 — 침수된 방에서 벌어지는 전투 */
reg.anomalies([
  {
    id: 'a2-flooded',
    name: '침수된 전장',
    icon: 'gi:waves',
    desc: '허리까지 물이 찼다. 화염 피해 -30%, 비전(전류) 피해 +20%. 심해의 것들이 주는 공격 피해 +15%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.type === 'fire') d.mult *= 0.7;
        else if (d.type === 'arcane') d.mult *= 1.2;
        if (d.attack && isEnemy(d.src) && hasTag(d.src, 'deep')) d.mult *= 1.15;
      },
    },
  },
]);
