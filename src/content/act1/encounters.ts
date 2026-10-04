import { reg } from '../../engine/registry';

reg.encounters([
  // ── 초반 (첫 3전투) ──
  { id: 'a1-thug', act: 1, kind: 'normal', early: true, zone: 'docks', enemies: [{ id: 'thug' }] },
  { id: 'a1-dogs2', act: 1, kind: 'normal', early: true, zone: 'market', enemies: [{ id: 'dog' }, { id: 'dog' }] },
  { id: 'a1-rats', act: 1, kind: 'normal', early: true, zone: 'sewer', enemies: [{ id: 'rats' }] },
  { id: 'a1-sailor', act: 1, kind: 'normal', early: true, zone: 'docks', enemies: [{ id: 'sailor' }] },
  { id: 'a1-drowned1', act: 1, kind: 'normal', early: true, zone: 'flooded', enemies: [{ id: 'drowned' }] },
  { id: 'a1-gulls', act: 1, kind: 'normal', early: true, zone: 'market', enemies: [{ id: 'gulls', row: 1 }, { id: 'gulls', row: 1 }] },

  // ── 일반 ──
  { id: 'a1-thug-smuggler', act: 1, kind: 'normal', zone: 'docks', enemies: [{ id: 'thug' }, { id: 'smuggler', row: 1 }] },
  { id: 'a1-dogs3', act: 1, kind: 'normal', zone: 'market', enemies: [{ id: 'dog' }, { id: 'dog' }, { id: 'dog' }] },
  { id: 'a1-rats-gulls', act: 1, kind: 'normal', zone: 'sewer', enemies: [{ id: 'rats' }, { id: 'gulls', row: 1 }] },
  { id: 'a1-cult', act: 1, kind: 'normal', zone: 'flooded', enemies: [{ id: 'thug' }, { id: 'initiate', row: 1 }, { id: 'initiate', row: 1 }] },
  { id: 'a1-drowned2', act: 1, kind: 'normal', zone: 'flooded', enemies: [{ id: 'drowned' }, { id: 'drowned' }] },
  { id: 'a1-hook', act: 1, kind: 'normal', zone: 'docks', enemies: [{ id: 'hookman' }, { id: 'smuggler', row: 1 }] },
  { id: 'a1-lurker', act: 1, kind: 'normal', zone: 'sewer', enemies: [{ id: 'drowned' }, { id: 'lurker', row: 1 }] },
  { id: 'a1-sailors', act: 1, kind: 'normal', zone: 'docks', enemies: [{ id: 'sailor' }, { id: 'sailor' }] },
  { id: 'a1-hook-dog', act: 1, kind: 'normal', zone: 'market', enemies: [{ id: 'hookman' }, { id: 'dog' }] },
  { id: 'a1-smugglers', act: 1, kind: 'normal', zone: 'docks', enemies: [{ id: 'sailor' }, { id: 'smuggler', row: 1 }, { id: 'smuggler', row: 1 }] },
  { id: 'a1-eyes', act: 1, kind: 'normal', zone: 'sewer', enemies: [{ id: 'rats' }, { id: 'lurker', row: 1 }] },
  { id: 'a1-initiates', act: 1, kind: 'normal', zone: 'flooded', enemies: [{ id: 'drowned' }, { id: 'initiate', row: 1 }] },

  // ── 정예 ──
  { id: 'a1-butcher', act: 1, kind: 'elite', enemies: [{ id: 'butcher' }] },
  { id: 'a1-enforcer', act: 1, kind: 'elite', enemies: [{ id: 'enforcer' }, { id: 'initiate', row: 1 }, { id: 'initiate', row: 1 }] },
  { id: 'a1-crab', act: 1, kind: 'elite', enemies: [{ id: 'crab' }] },

  // ── 층 수호자 ──
  { id: 'a1-boss-lightkeeper', act: 1, kind: 'boss', theme: 'lightkeeper', enemies: [{ id: 'lightkeeper' }] },
  { id: 'a1-boss-queen', act: 1, kind: 'boss', theme: 'queen', enemies: [{ id: 'queen' }] },
  { id: 'a1-boss-fisherman', act: 1, kind: 'boss', theme: 'fisherman', enemies: [{ id: 'fisherman' }] },

  // ── 특수 ──
  { id: 'lord-a1', act: 1, kind: 'boss', theme: 'lord', enemies: [{ id: 'captain' }, { id: 'drowned' }] },
  { id: 'stalker-a1', act: 1, kind: 'elite', enemies: [{ id: 'fogstalker' }] },
  { id: 'rift-a1', act: 1, kind: 'elite', enemies: [{ id: 'wraith' }] },
]);
