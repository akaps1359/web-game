import { reg } from '../../engine/registry';

reg.encounters([
  // ── 초반 (첫 3전투) ──
  { id: 'a4-spawn', act: 4, kind: 'normal', early: true, enemies: [{ id: 'star-spawn' }, { id: 'byakhee', row: 1 }] },
  { id: 'a4-pipers', act: 4, kind: 'normal', early: true, enemies: [{ id: 'formless-piper', row: 1 }, { id: 'formless-piper', row: 1 }] },
  { id: 'a4-young', act: 4, kind: 'normal', early: true, enemies: [{ id: 'dark-young' }] },
  { id: 'a4-warden', act: 4, kind: 'normal', early: true, enemies: [{ id: 'dim-shambler' }, { id: 'time-warden', row: 1 }] },
  { id: 'a4-polyp', act: 4, kind: 'normal', early: true, enemies: [{ id: 'flying-polyp' }, { id: 'star-colour', row: 1 }] },
  { id: 'a4-servitor', act: 4, kind: 'normal', early: true, enemies: [{ id: 'outer-servitor' }, { id: 'faceless-priest', row: 1 }] },

  // ── 일반 ──
  {
    id: 'a4-court',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'outer-servitor' }, { id: 'formless-piper', row: 1 }, { id: 'faceless-priest', row: 1 }],
  },
  {
    id: 'a4-surgery',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'dim-shambler' }, { id: 'migo-stitcher', row: 1 }, { id: 'migo-stitcher', row: 1 }],
  },
  { id: 'a4-grove', act: 4, kind: 'normal', enemies: [{ id: 'dark-young' }, { id: 'dark-young' }] },
  {
    id: 'a4-timewatch',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'star-spawn' }, { id: 'time-warden', row: 1 }, { id: 'star-colour', row: 1 }],
  },
  {
    id: 'a4-flock',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'byakhee', row: 1 }, { id: 'byakhee', row: 1 }, { id: 'byakhee', row: 1 }],
  },
  { id: 'a4-polyps', act: 4, kind: 'normal', enemies: [{ id: 'flying-polyp' }, { id: 'flying-polyp' }] },
  {
    id: 'a4-colours',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'dim-shambler' }, { id: 'star-colour', row: 1 }, { id: 'star-colour', row: 1 }],
  },
  {
    id: 'a4-chaos-dance',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'outer-servitor' }, { id: 'outer-servitor' }, { id: 'formless-piper', row: 1 }],
  },
  {
    id: 'a4-faceless',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'star-spawn' }, { id: 'faceless-priest', row: 1 }, { id: 'faceless-priest', row: 1 }],
  },
  { id: 'a4-young-flock', act: 4, kind: 'normal', enemies: [{ id: 'dark-young' }, { id: 'byakhee', row: 1 }] },
  {
    id: 'a4-migo-watch',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'flying-polyp' }, { id: 'migo-stitcher', row: 1 }, { id: 'time-warden', row: 1 }],
  },
  {
    id: 'a4-starfall',
    act: 4,
    kind: 'normal',
    enemies: [{ id: 'star-spawn' }, { id: 'star-spawn' }],
  },

  // ── 정예 ──
  { id: 'a4-avatar', act: 4, kind: 'elite', enemies: [{ id: 'chaos-avatar' }] },
  { id: 'a4-mother', act: 4, kind: 'elite', enemies: [{ id: 'thousand-mother' }] },
  { id: 'a4-yith', act: 4, kind: 'elite', enemies: [{ id: 'yith-wanderer' }] },

  // ── 층 수호자 ──
  { id: 'a4-boss-gate', act: 4, kind: 'boss', theme: 'beyond-gate', enemies: [{ id: 'beyond-gate', row: 1 }] },
  { id: 'a4-boss-pharaoh', act: 4, kind: 'boss', theme: 'black-pharaoh', enemies: [{ id: 'black-pharaoh' }] },
  { id: 'a4-boss-starlord', act: 4, kind: 'boss', theme: 'starspawn-lord', enemies: [{ id: 'starspawn-lord' }] },

  // ── 특수 ──
  { id: 'lord-a4', act: 4, kind: 'boss', theme: 'lord', enemies: [{ id: 'black-star' }] },
  { id: 'stalker-a4', act: 4, kind: 'elite', enemies: [{ id: 'star-walker' }] },
  { id: 'rift-a4', act: 4, kind: 'elite', enemies: [{ id: 'hunting-horror' }] },
]);
