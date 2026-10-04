import { reg } from '../../engine/registry';

reg.encounters([
  // ── 최종층 정예 ──
  { id: 'a5-elite-warden', act: 5, kind: 'elite', enemies: [{ id: 'rlyeh-warden' }] },
  { id: 'a5-elite-hierophant', act: 5, kind: 'elite', enemies: [{ id: 'star-spawn' }, { id: 'dream-hierophant', row: 1 }] },

  // ── 최종 수호자 ──
  { id: 'a5-boss-sleeper', act: 5, kind: 'boss', theme: 'sleeper', enemies: [{ id: 'sleeper' }] },
]);
