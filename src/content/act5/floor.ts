import { reg } from '../../engine/registry';
import { log, loseSanityRun } from '../../engine/run';

reg.floors([
  {
    act: 5,
    name: '잠든 자의 무덤',
    law: '꿈과 현실의 경계가 무너졌다 — 방을 옮길 때마다 정신력 -3. 그 대신 정신력이 절반 이하일 때 주는 공격 피해 +20%.',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.src === c.p && d.attack && c.p.sanity <= c.p.maxSanity / 2) d.mult *= 1.2;
      },
    },
    onMove(run) {
      const r = loseSanityRun(run, 3);
      if (run.over) return;
      log(run, r.madness ? '잠든 자의 꿈이 정신을 짓눌렀다 — 광기에 사로잡혔다' : `발밑에서 거대한 꿈이 뒤척인다 (정신력 -${r.lost})`);
    },
  },
]);
