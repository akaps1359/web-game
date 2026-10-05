import { reg } from '../../engine/registry';

reg.encounters([
  // ═════ 5층 — 꿈꾸는 우주 (2026-10 개편: 3층에서 옮겨 온 꿈의 땅 조우는 a3- → a5- 로 이름을 바꿨다) ═════

  // ── 초반 (첫 3전투) ──
  { id: 'a5-e-zoogs', act: 5, kind: 'normal', early: true, enemies: [{ id: 'zoog' }, { id: 'zoog' }, { id: 'zoog' }] },
  { id: 'a5-e-gug', act: 5, kind: 'normal', early: true, enemies: [{ id: 'gug' }] },
  { id: 'a5-e-sleepers', act: 5, kind: 'normal', early: true, enemies: [{ id: 'sleepwalker' }, { id: 'sleepwalker' }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-e-moonbeast', act: 5, kind: 'normal', early: true, enemies: [{ id: 'moonbeast' }] },
  { id: 'a5-e-swallower', act: 5, kind: 'normal', early: true, enemies: [{ id: 'star-swallower' }] },
  { id: 'a5-e-jelly', act: 5, kind: 'normal', early: true, enemies: [{ id: 'zoog' }, { id: 'nebula-jelly', row: 1 }] },

  // ── 일반 ──
  { id: 'a5-pilgrims', act: 5, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'star-pilgrim', row: 1 }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-weaver-gug', act: 5, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a5-zoog-moon', act: 5, kind: 'normal', enemies: [{ id: 'moonbeast' }, { id: 'zoog' }, { id: 'zoog' }] },
  { id: 'a5-sleep-weaver', act: 5, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'sleepwalker' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a5-moon-weaver', act: 5, kind: 'normal', enemies: [{ id: 'moonbeast' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a5-sleep-pilgrim', act: 5, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'zoog' }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-zoog-weaver', act: 5, kind: 'normal', enemies: [{ id: 'zoog' }, { id: 'zoog' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a5-dream-mix', act: 5, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'veil-weaver', row: 1 }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-gug-pilgrim', act: 5, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-moon-pilgrim', act: 5, kind: 'normal', enemies: [{ id: 'moonbeast' }, { id: 'star-pilgrim', row: 1 }] },
  // 우주의 것들
  { id: 'a5-nursery', act: 5, kind: 'normal', enemies: [{ id: 'star-swallower' }, { id: 'nebula-jelly', row: 1 }] },
  { id: 'a5-jelly-gug', act: 5, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'nebula-jelly', row: 1 }] },
  { id: 'a5-swallow-pilgrims', act: 5, kind: 'normal', enemies: [{ id: 'star-swallower' }, { id: 'star-pilgrim', row: 1 }, { id: 'star-pilgrim', row: 1 }] },
  { id: 'a5-jellies', act: 5, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'nebula-jelly', row: 1 }, { id: 'nebula-jelly', row: 1 }] },
  { id: 'a5-swallow-moon', act: 5, kind: 'normal', enemies: [{ id: 'star-swallower' }, { id: 'moonbeast' }] },
  // 이벤트 전용 (weight 0 — 방에는 배정되지 않음)
  { id: 'a5-galley', act: 5, kind: 'normal', weight: 0, enemies: [{ id: 'moonbeast' }, { id: 'leng-slave' }, { id: 'leng-slave' }] },
  { id: 'a5-moonbeasts', act: 5, kind: 'normal', weight: 0, enemies: [{ id: 'moonbeast' }, { id: 'moonbeast' }] },

  // ── 정예 ──
  { id: 'a5-saturn-cat', act: 5, kind: 'elite', enemies: [{ id: 'saturn-cat' }] },
  { id: 'a5-elite-gatekeeper', act: 5, kind: 'elite', enemies: [{ id: 'dream-gatekeeper' }] },
  { id: 'a5-elite-warden', act: 5, kind: 'elite', enemies: [{ id: 'cradle-warden' }] },
  { id: 'a5-elite-hierophant', act: 5, kind: 'elite', enemies: [{ id: 'star-swallower' }, { id: 'dream-hierophant', row: 1 }] },

  // ── 최종 수호자 (포탈 비석) ──
  { id: 'a5-boss-fetus', act: 5, kind: 'boss', theme: 'star-fetus', enemies: [{ id: 'star-fetus' }] },

  // ── 특수 ──
  { id: 'lord-a5', act: 5, kind: 'boss', theme: 'lord', enemies: [{ id: 'dream-eater' }, { id: 'sleepwalker' }, { id: 'sleepwalker' }] },
  { id: 'stalker-a5', act: 5, kind: 'elite', enemies: [{ id: 'dream-hunter' }] },
  { id: 'rift-a5', act: 5, kind: 'elite', enemies: [{ id: 'liminal' }] },
]);
