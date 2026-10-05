// 봉인의 구체 (4층 하수인) — 엇갈린 청동 띠에 묶인 무지갯빛 구체. 띠의 새김과 표면의 금이 차가운 푸른빛으로 빛난다.
// 셰이더는 gate-orb-hunger.js와 같다 (한 번만 컴파일).
import { gateOrb } from './gate-orb-hunger.js';

export default function gateOrbSeal(opts = {}) {
  return gateOrb('seal', opts);
}
