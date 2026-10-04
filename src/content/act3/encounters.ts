import { reg } from '../../engine/registry';

reg.encounters([
  // ── 초반 (첫 3전투) ──
  { id: 'a3-e-gaunts', act: 3, kind: 'normal', early: true, enemies: [{ id: 'nightgaunt' }, { id: 'nightgaunt' }] },
  { id: 'a3-e-zoogs', act: 3, kind: 'normal', early: true, enemies: [{ id: 'zoog' }, { id: 'zoog' }, { id: 'zoog' }] },
  { id: 'a3-e-spawn', act: 3, kind: 'normal', early: true, enemies: [{ id: 'shoggoth-spawn' }, { id: 'zoog' }] },
  { id: 'a3-e-sleepers', act: 3, kind: 'normal', early: true, enemies: [{ id: 'sleepwalker' }, { id: 'sleepwalker' }, { id: 'migo', row: 1 }] },
  { id: 'a3-e-gug', act: 3, kind: 'normal', early: true, enemies: [{ id: 'gug' }] },
  { id: 'a3-e-spider', act: 3, kind: 'normal', early: true, enemies: [{ id: 'sleepwalker' }, { id: 'leng-spider', row: 1 }] },

  // ── 일반 ──
  { id: 'a3-gaunt-migo', act: 3, kind: 'normal', enemies: [{ id: 'nightgaunt' }, { id: 'nightgaunt' }, { id: 'migo', row: 1 }] },
  { id: 'a3-hound-moon', act: 3, kind: 'normal', enemies: [{ id: 'moonbeast' }, { id: 'tindalos', row: 1 }] },
  { id: 'a3-hound-gug', act: 3, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'tindalos', row: 1 }] },
  { id: 'a3-spawn-pair', act: 3, kind: 'normal', enemies: [{ id: 'shoggoth-spawn' }, { id: 'shoggoth-spawn' }] },
  { id: 'a3-spider-nest', act: 3, kind: 'normal', enemies: [{ id: 'zoog' }, { id: 'leng-spider', row: 1 }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-pilgrims', act: 3, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'ash-pilgrim', row: 1 }, { id: 'ash-pilgrim', row: 1 }] },
  { id: 'a3-pilgrim-gaunt', act: 3, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'nightgaunt' }, { id: 'ash-pilgrim', row: 1 }] },
  { id: 'a3-weaver-hound', act: 3, kind: 'normal', enemies: [{ id: 'nightgaunt' }, { id: 'tindalos', row: 1 }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a3-weaver-gug', act: 3, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a3-migo-spawn', act: 3, kind: 'normal', enemies: [{ id: 'shoggoth-spawn' }, { id: 'migo', row: 1 }] },
  { id: 'a3-zoog-moon', act: 3, kind: 'normal', enemies: [{ id: 'moonbeast' }, { id: 'zoog' }, { id: 'zoog' }] },
  { id: 'a3-sleep-weaver', act: 3, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'sleepwalker' }, { id: 'veil-weaver', row: 1 }] },
  { id: 'a3-dream-mix', act: 3, kind: 'normal', enemies: [{ id: 'sleepwalker' }, { id: 'tindalos', row: 1 }, { id: 'migo', row: 1 }] },
  { id: 'a3-spider-gug', act: 3, kind: 'normal', enemies: [{ id: 'gug' }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-pilgrim-spawn', act: 3, kind: 'normal', enemies: [{ id: 'shoggoth-spawn' }, { id: 'ash-pilgrim', row: 1 }] },
  // 이벤트 전용 (weight 0 — 방에는 배정되지 않음)
  { id: 'a3-galley', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'moonbeast' }, { id: 'leng-slave' }, { id: 'leng-slave' }] },
  { id: 'a3-moonbeasts', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'moonbeast' }, { id: 'moonbeast' }] },
  { id: 'a3-migos', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'migo' }, { id: 'migo', row: 1 }] },
  { id: 'a3-hounds', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'tindalos', row: 0 }, { id: 'tindalos', row: 1 }] },

  // ── 정예 ──
  { id: 'a3-broodmother', act: 3, kind: 'elite', enemies: [{ id: 'leng-broodmother' }, { id: 'leng-spiderling' }, { id: 'leng-spiderling' }] },
  { id: 'a3-saturn-cat', act: 3, kind: 'elite', enemies: [{ id: 'saturn-cat' }] },
  { id: 'a3-shantak', act: 3, kind: 'elite', enemies: [{ id: 'shantak' }] },

  // ── 층 수호자 ──
  { id: 'a3-boss-shoggoth', act: 3, kind: 'boss', theme: 'shoggoth', enemies: [{ id: 'shoggoth' }] },
  { id: 'a3-boss-gatekeeper', act: 3, kind: 'boss', theme: 'gatekeeper', enemies: [{ id: 'dream-gatekeeper' }] },
  { id: 'a3-boss-king', act: 3, kind: 'boss', theme: 'angle-king', enemies: [{ id: 'angle-king' }, { id: 'angle-whelp', row: 1 }, { id: 'angle-whelp', row: 1 }] },

  // ── 특수 ──
  { id: 'lord-a3', act: 3, kind: 'boss', theme: 'lord', enemies: [{ id: 'dream-eater' }, { id: 'sleepwalker' }, { id: 'sleepwalker' }] },
  { id: 'stalker-a3', act: 3, kind: 'elite', enemies: [{ id: 'dhole' }] },
  { id: 'rift-a3', act: 3, kind: 'elite', enemies: [{ id: 'liminal' }] },
]);
