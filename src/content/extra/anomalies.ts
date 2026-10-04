import { reg } from '../../engine/registry';

/**
 * extra 전장 규칙. 균열 규칙 목록은 엔진에 고정되어 있으므로 조우(`anomaly`)용으로 쓴다.
 * 이상 현상 훅은 모든 유닛의 훅 호출에 끼어든다 (s.unit = 호출 대상).
 */
reg.anomalies([
  {
    id: 'x-rule-bloodmoon',
    name: '핏빛 달',
    icon: 'gi:evil-moon',
    desc: '모든 출혈 부여 +2. 출혈 중인 대상은 공격 피해를 2 더 받는다',
    hooks: {
      modApply: (_c, _s, _t, id, n) => (id === 'bleed' ? n + 2 : n),
      modDamageIn(_c, _s, d) {
        if (d.attack && (d.tgt.st.bleed ?? 0) > 0) d.add += 2;
      },
    },
  },
  {
    id: 'x-rule-darkness',
    name: '칠흑',
    icon: 'gi:night-sky',
    desc: '적의 의도가 보이지 않는다 (통찰 5 이상 제외). 대신 내가 주는 공격 피해 +15%',
    hooks: {
      onTurnStart(c) {
        if (c.run.madness.includes('x-foresight')) return;
        for (const e of c.alive) if (e.intent && e.broken !== 2) e.intent.hidden = true;
      },
      modDamageOut(c, _s, d) {
        if (d.attack && d.src === c.p) d.mult *= 1.15;
      },
    },
  },
  {
    id: 'x-rule-escalation',
    name: '피의 의식장',
    icon: 'gi:star-altar',
    desc: '모든 존재가 자기 턴을 시작할 때 힘 +1',
    hooks: {
      onTurnStart(c, s) {
        c.apply(s.unit, 'str', 1, s.unit);
      },
      onUnitTurnStart(c, s) {
        c.apply(s.unit, 'str', 1, s.unit);
      },
    },
  },
]);
