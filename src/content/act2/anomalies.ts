import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { hasTag } from './enemies';

/** 2층 전용 전장 규칙 — 재에 파묻힌 방에서 벌어지는 전투 */
reg.anomalies([
  {
    id: 'a2-ashen',
    name: '재에 파묻힌 전장',
    icon: 'gi:burning-embers',
    desc: '무릎까지 쌓인 재 속에서 불씨가 숨 쉰다. 화염 피해 +30%. 재의 것들이 주는 공격 피해 +15%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.type === 'fire') d.mult *= 1.3;
        if (d.attack && isEnemy(d.src) && hasTag(d.src, 'ash')) d.mult *= 1.15;
      },
    },
  },
]);
