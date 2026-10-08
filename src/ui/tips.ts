import { saveMeta } from '../state/meta';
import { store } from '../state/store';
import { showTip } from './components';
import { MAX_MADNESS } from '../engine/combat';
import { guardWord } from './guard';

/** 처음 한 번만 보여주는 도움말 */
const TIPS: Record<string, { title: string; icon: string; body: string }> = {
  dungeon: {
    title: '미궁 탐험',
    icon: 'gi:old-lantern',
    body: '빛나는 이웃 방을 눌러 이동한다. 이동할 때마다 시간이 흐르고 등불이 줄어든다.\n\n등불이 밝으면 옆방에 무엇이 있는지 보인다. 어딘가에 있는 포탈 비석을 찾아 층 수호자를 쓰러뜨리면 다음 층으로 간다.\n\n오래 머물수록 심연의 조수가 차올라 적이 강해진다.',
  },
  combat: {
    title: '전투',
    icon: 'gi:crossed-swords',
    body: `적 머리 위의 아이콘이 다음 행동(의도)이다. 숫자는 받을 피해.\n\n스킬을 누르면 설명이 나오고, 한 번 더 누르거나 적을 눌러 쓴다. 행동력(◆)을 다 쓰면 턴을 끝낸다.\n\n적 아래의 노란 ◆는 버팀. 버팀이 남은 적은 피해를 ${guardWord()}만 받는다. 약점 속성으로 맞히면 하나씩 깎이고 0이 되면 붕괴한다. 붕괴한 적은 차례를 쉬고 피해를 더 받는다. 큰 공격(번개 표시)도 붕괴로 끊긴다.`,
  },
  essence: {
    title: '정수',
    icon: 'gi:heart-beats',
    body: '쓰러뜨린 존재가 정수를 남겼다. 흡수하면 스탯과 패시브, 그리고 최대 체력을 얻는다. 수호자의 정수라면 여기에 그 존재의 기술 하나를 골라 함께 배울 수 있다.\n\n정수 자리는 4개에서 시작해 층 수호자를 쓰러뜨릴 때마다 하나씩 는다. 자리가 꽉 차면 가진 정수 하나를 깨뜨리고 바꿀 수 있다. 무엇을 들일지 고르는 것이 곧 빌드다. 아껴 두고 싶으면 병에 담아 두었다가 신전에서 골드를 내고 새길 수 있다.\n\n청록빛 이계의 정수는 흡수할 때 최대 정신력 -5를 치른다. 통찰은 주지 않는다.',
  },
  dark: {
    title: '어둠',
    icon: 'gi:night-sleep',
    body: '등불이 거의 꺼졌다. 어둠 속에선 옆방이 보이지 않고, 이동할 때마다 정신력이 깎이며, 기습당할 수 있다.\n\n야영지의 불씨나 등유로 등불을 채울 수 있다. 대신 어둠 속 전투는 전리품이 더 많다.',
  },
  sanity: {
    title: '정신력',
    icon: 'gi:brain',
    body: `정신력이 0이 되면 붕괴해 광기를 얻는다. 나쁜 광기가 ${MAX_MADNESS}개가 되면 완전히 미쳐 여정이 끝난다.\n\n야영지에서 명상하거나 신전에서 기도해 회복할 수 있다.`,
  },
  dying: {
    title: '사경',
    icon: 'gi:heart-beats',
    body: '체력이 0이 되었지만 아직 끝나지 않았다. 지금부터 받는 피해의 절반만큼, 그리고 매 턴 정신력이 깎인다.\n\n정신력까지 0이 되면 죽는다. 회복하면 사경에서 벗어난다.',
  },
};

export function tipOnce(key: keyof typeof TIPS) {
  const m = store.meta;
  m.tips ??= [];
  if (m.tips.includes(key) || store.tip) return;
  m.tips.push(key);
  saveMeta(m);
  const t = TIPS[key];
  showTip({ title: t.title, icon: t.icon, color: 'var(--brass-2)', body: t.body });
}
