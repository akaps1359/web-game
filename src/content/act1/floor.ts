import { reg } from '../../engine/registry';

reg.floors([
  {
    act: 1,
    name: '침수된 지하 수로',
    law: '구역마다 사는 것들이 다르다. 북쪽 하수구엔 쥐떼, 남쪽 부두엔 밀수꾼, 동쪽 침수 구역엔 익사체, 서쪽 어시장엔 짐승.',
    zones: [
      { name: '서쪽 어시장', tag: 'market' },
      { name: '북쪽 하수구', tag: 'sewer' },
      { name: '동쪽 침수 구역', tag: 'flooded' },
      { name: '남쪽 부두', tag: 'docks' },
    ],
    lord: {
      id: 'captain',
      name: '익사한 선장',
      enc: 'lord-a1',
      goal: 4,
      warnings: ['물이 발목까지 차오른다…', '어디선가 배의 종소리가 들린다', '바닷물 냄새가 짙어진다. 물 밑에서 큰 것이 뒤척인다', '익사한 선장이 깨어났다 (지도에 표시)'],
      hints: [
        '선원들은 선장이 물이 차오를 때만 깬다고 수군거린다 — 조수가 오른 뒤의 일이다',
        '조수가 오른 뒤 익사체가 낀 싸움에서 이길 때마다 선장이 뒤척인다 (익사체는 물에 잠긴 구역에 많다)',
        '조수가 세 번째로 차오른 뒤로는 물이 오를 때마다 선장이 저절로 뒤척인다',
      ],
      progress(_run, f, e) {
        // 조수 2단계 이후, 익사체가 있는 전투를 이기면 진척
        if (e.t === 'combat' && f.tide >= 1 && (e.enc.includes('drowned') || e.enc === 'a1-lurker' || e.enc === 'a1-initiates')) return 1;
        if (e.t === 'tide' && e.tide >= 3) return 1;
        return 0;
      },
    },
  },
]);
