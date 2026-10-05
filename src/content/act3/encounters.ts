import { reg } from '../../engine/registry';

// 3층 — 얼어붙은 고대 도시.
// 꿈의 땅 조우(a3-e-zoogs, a3-e-gug, a3-e-sleepers, a3-pilgrims, a3-weaver-gug, a3-zoog-moon, a3-sleep-weaver,
// a3-galley, a3-moonbeasts, a3-saturn-cat, a3-boss-gatekeeper)는 id 그대로 act 5로 옮겨 갔으니 그 id들은 다시 쓰지 말 것.
// 새 얼음 도시의 조우(펭귄·탐사대·고대인·그노프케)가 자주 나오도록, 옛 3층에서 남은 조합은 가중치를 낮췄다.

const OLD = 0.6;

reg.encounters([
  // ── 초반 (첫 3전투) ──
  { id: 'a3-e-penguins', act: 3, kind: 'normal', early: true, weight: 1.2, enemies: [{ id: 'blind-penguin' }, { id: 'blind-penguin' }] },
  { id: 'a3-e-dogs', act: 3, kind: 'normal', early: true, weight: 1.2, enemies: [{ id: 'sled-dog' }, { id: 'sled-dog' }] },
  { id: 'a3-e-explorer', act: 3, kind: 'normal', early: true, weight: 1.2, enemies: [{ id: 'frozen-explorer' }, { id: 'sled-dog' }] },
  { id: 'a3-e-gaunts', act: 3, kind: 'normal', early: true, weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'nightgaunt' }] },
  { id: 'a3-e-spawn', act: 3, kind: 'normal', early: true, weight: OLD, enemies: [{ id: 'shoggoth-spawn' }, { id: 'leng-spiderling' }, { id: 'leng-spiderling' }] },
  { id: 'a3-e-spider', act: 3, kind: 'normal', early: true, weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-e-migo', act: 3, kind: 'normal', early: true, weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'migo', row: 1 }] },

  // ── 일반: 얼어붙은 고대 도시 ──
  { id: 'a3-rookery', act: 3, kind: 'normal', enemies: [{ id: 'blind-penguin' }, { id: 'blind-penguin' }, { id: 'blind-penguin' }] },
  { id: 'a3-expedition', act: 3, kind: 'normal', enemies: [{ id: 'frozen-explorer' }, { id: 'frozen-explorer' }, { id: 'sled-dog' }] },
  { id: 'a3-frostbitten', act: 3, kind: 'normal', enemies: [{ id: 'frozen-explorer' }, { id: 'frost-wraith', row: 1 }] },
  { id: 'a3-gnoph', act: 3, kind: 'normal', enemies: [{ id: 'gnoph-keh' }, { id: 'frost-wraith', row: 1 }] },
  { id: 'a3-gnoph-penguins', act: 3, kind: 'normal', enemies: [{ id: 'gnoph-keh' }, { id: 'blind-penguin' }] },
  { id: 'a3-hunters', act: 3, kind: 'normal', enemies: [{ id: 'shoggoth-spawn' }, { id: 'elder-hunter', row: 1 }] },
  { id: 'a3-hunter-dogs', act: 3, kind: 'normal', enemies: [{ id: 'sled-dog' }, { id: 'sled-dog' }, { id: 'elder-hunter', row: 1 }] },
  { id: 'a3-wraith-gaunt', act: 3, kind: 'normal', enemies: [{ id: 'nightgaunt' }, { id: 'frost-wraith', row: 1 }, { id: 'elder-hunter', row: 1 }] },
  { id: 'a3-penguin-spider', act: 3, kind: 'normal', enemies: [{ id: 'blind-penguin' }, { id: 'blind-penguin' }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-migo-dig', act: 3, kind: 'normal', enemies: [{ id: 'frozen-explorer' }, { id: 'migo', row: 1 }] },

  // ── 일반: 옛 3층에서 남은 조합 ──
  { id: 'a3-gaunt-migo', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'nightgaunt' }, { id: 'migo', row: 1 }] },
  { id: 'a3-spawn-pair', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'shoggoth-spawn' }, { id: 'shoggoth-spawn' }] },
  { id: 'a3-migo-spawn', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'shoggoth-spawn' }, { id: 'migo', row: 1 }] },
  { id: 'a3-spider-nest', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'leng-spider', row: 1 }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-hound-spawn', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'shoggoth-spawn' }, { id: 'tindalos', row: 1 }] },
  { id: 'a3-gaunt-hound', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'tindalos', row: 1 }, { id: 'migo', row: 1 }] },
  { id: 'a3-spider-spawn', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'shoggoth-spawn' }, { id: 'leng-spider', row: 1 }] },
  { id: 'a3-hound-gaunts', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'nightgaunt' }, { id: 'tindalos', row: 1 }] },
  { id: 'a3-spider-migo', act: 3, kind: 'normal', weight: OLD, enemies: [{ id: 'nightgaunt' }, { id: 'leng-spider', row: 1 }, { id: 'migo', row: 1 }] },
  // 이벤트 전용 (weight 0 — 방에는 배정되지 않음)
  { id: 'a3-migos', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'migo' }, { id: 'migo', row: 1 }] },
  { id: 'a3-hounds', act: 3, kind: 'normal', weight: 0, enemies: [{ id: 'tindalos', row: 0 }, { id: 'tindalos', row: 1 }] },

  // ── 정예 ──
  { id: 'a3-broodmother', act: 3, kind: 'elite', enemies: [{ id: 'leng-broodmother' }, { id: 'leng-spiderling' }, { id: 'leng-spiderling' }] },
  { id: 'a3-shantak', act: 3, kind: 'elite', enemies: [{ id: 'shantak' }] },
  { id: 'a3-vivisector', act: 3, kind: 'elite', enemies: [{ id: 'elder-vivisector' }, { id: 'sled-dog' }] },

  // ── 층 수호자 ──
  { id: 'a3-boss-shoggoth', act: 3, kind: 'boss', theme: 'shoggoth', enemies: [{ id: 'shoggoth' }] },
  { id: 'a3-boss-king', act: 3, kind: 'boss', theme: 'angle-king', enemies: [{ id: 'angle-king' }, { id: 'angle-whelp', row: 1 }, { id: 'angle-whelp', row: 1 }] },
  { id: 'a3-boss-peaks', act: 3, kind: 'boss', theme: 'beyond-peaks', enemies: [{ id: 'beyond-peaks' }] },

  // ── 특수 ──
  { id: 'lord-a3', act: 3, kind: 'boss', theme: 'lord', enemies: [{ id: 'awakened-elder' }, { id: 'shoggoth-thrall' }] },
  { id: 'stalker-a3', act: 3, kind: 'elite', enemies: [{ id: 'dhole' }] },
  { id: 'rift-a3', act: 3, kind: 'elite', enemies: [{ id: 'frozen-leader' }] },
]);
