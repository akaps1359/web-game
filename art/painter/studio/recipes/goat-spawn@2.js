// 자란 새끼 (어린 새끼의 변신 형태, form 1 → @2) — 껍질을 찢고 자라난 검은 새끼. 꼬인 밧줄 둥치, 가지 같은 촉수,
// 굵은 세 염소 다리와 큰 뿔, 둥치의 입에서 초록 진액. 다리 사이엔 찢겨 떨어진 꼬투리 껍질.
// 셰이더는 goat-spawn.js와 같다 (한 번만 컴파일).
import { goatSpawn } from './goat-spawn.js';

export default function goatSpawnGrown(opts = {}) {
  return goatSpawn(true, opts);
}
