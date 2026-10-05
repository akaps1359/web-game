// 시선의 구체 (4층 하수인) — 아몬드꼴로 갈라진 틈 속에서 거대한 눈 하나가 내려다본다. 들러붙은 작은 구체들에도 눈이 뜬다.
// 셰이더는 gate-orb-hunger.js와 같다 (한 번만 컴파일).
import { gateOrb } from './gate-orb-hunger.js';

export default function gateOrbGaze(opts = {}) {
  return gateOrb('gaze', opts);
}
