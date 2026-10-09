import { reg } from '../../engine/registry';

/*
 * 징조 (2026-10 성장 개편, engine/growth.ts): 희귀 이상(희귀·특수·보스·금기·창세)의 후보가 나온 보상을 고르지 않고 지나치면 받는다 — 보상 화면에 미리 보인다.
 * 귀한 것을 내주는 대가로만 (모든 보상에 붙으니 판마다 6.7개씩 쌓여 성장을 억제하지 못했다).
 * 발라트로의 블라인드 건너뛰기 태그, 슬레이 더 스파이어 「노래하는 그릇」(카드 대신 최대 체력)처럼 건너뛰기가 곧 선택이 되게.
 * 대부분 한 번 쓰고 사라지는 옆 방향의 이득이다 (오래 남는 힘이 아니라). 지닐 수 있는 것은 GROWTH.omenCap개.
 * 이루어지는 곳은 엔진이 id로 부른다 (run.ts finishCombat·startOmens, shop.ts, places.ts camp, gainEquip)
 */
reg.omens([
  { id: 'omen-plenty', name: '풍요의 징조', icon: 'gi:cornucopia', desc: '다음에 고르는 보상의 후보가 하나 더 (스킬)' },
  { id: 'omen-rare', name: '희귀의 징조', icon: 'gi:cut-diamond', desc: '다음에 고르는 보상의 후보가 한 등급 귀해진다' },
  { id: 'omen-rune', name: '각인의 징조', icon: 'gi:rune-stone', desc: '다음에 고르는 보상의 후보에 각인 하나가 더 나온다' },
  { id: 'omen-gold', name: '황금의 징조', icon: 'gi:two-coins', desc: '다음 전투의 골드가 두 배' },
  { id: 'omen-ward', name: '수호의 징조', icon: 'gi:checked-shield', desc: '다음 전투를 방어도 (10 + 층×3)로 시작한다' },
  { id: 'omen-sight', name: '간파의 징조', icon: 'gi:eye-target', desc: '다음 전투에서 적의 약점이 모두 드러난다' },
  { id: 'omen-haste', name: '선수의 징조', icon: 'gi:sprint', desc: '다음 전투 첫 턴 행동력 +1' },
  { id: 'omen-merchant', name: '상인의 징조', icon: 'gi:shop', desc: '다음에 새로 여는 상점의 물건 값이 30% 싸다' },
  { id: 'omen-rest', name: '휴식의 징조', icon: 'gi:campfire', desc: '다음 야영지에서 한 가지를 더 할 수 있다' },
  { id: 'omen-smith', name: '대장장이의 징조', icon: 'gi:anvil', desc: '다음에 얻는 장비에 접사 하나가 더 붙는다' },
  { id: 'omen-relic', name: '심연의 징조', icon: 'gi:crystal-ball', desc: '다음 정예(추적자·균열 수호자 포함)의 유물이 희귀 등급' },
]);
