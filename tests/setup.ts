import { WEAKPOINT } from '../src/engine/weakpoint';

// 급소(판마다 종족마다 숨은 속성 — 피해 ×1.3·버팀 하나 더)는 정확한 수치를 재는 테스트를 흔든다.
// 기본은 끄고, 급소를 다루는 테스트(tests/weakpoint.test.ts)만 켠다. 시뮬레이터(vitest.sim.config.ts)는 켠 채로 돈다
WEAKPOINT.on = false;
