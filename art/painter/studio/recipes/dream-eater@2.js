// 꿈을 먹는 자 — 깨어난 악몽 (form 1). 체력이 절반 아래로 떨어지면: 그믐달 볏에 핏빛 금이 가고, 오므렸던 입이
// 이빨 고리를 드러내며 벌어지고, 혀 촉수가 채찍처럼 앞으로 뻗는다. 꿈의 방울은 터져 사라졌고, 부푼 배가 세로로 갈라져
// 삼킨 꿈들이 핏빛으로 끓는다. 두 팔은 갈퀴를 펴고 높이 치켜들었다. 몸은 같은 레시피(dream-eater.js)를 wake로 그린다.
import { build } from './dream-eater.js';

export default function dreamEaterWake(opts) {
  return build({ ...opts, wake: true });
}
